// ═══════════════════════════════════════════════════════════════════════════
// LA MARQUE VINTED PRÉ-REMPLIE PAR VINTED, ET LA MARQUE CRÉÉE (26/10/2026)
//   node scripts/vinted-marque-preremplie-selftest.mjs
// ═══════════════════════════════════════════════════════════════════════════
// Point 4 de la nuit du 25→26/10 (Nico : « créer la marque au lieu de
// bloquer »). Vinted pré-remplit #brand d'après les photos (prefill_brand :
// « Volkswagen » pour un phare HELLA, « Zara » pour du Shein…) ; la chaîne de
// repli du 24/10 et l'envoi par identifiant n'agissaient que sur un #brand
// VIDE, l'attente du commit s'arrêtait sur un champ « non vide », et la
// question partait sans comparer — sous une phrase fausse (« ne permet plus
// d'en créer », démentie depuis le 17/10).
//
// Ce test exécute le code LIVRÉ (selectVintedBrand, attendreChoixMarque,
// attendreValeurMarque, budgetMarqueMs, signalerLigneDeCreationAbsente,
// noterPrefillMarqueVinted, decrirePrefillMarque — extraits de vinted.js) sur
// un faux formulaire Marque à horloge simulée (30 s se jouent en
// millisecondes) :
//   1. pré-rempli avec LA marque → aucune question, aucun menu ouvert ;
//   2. pré-rempli avec une autre → la ligne de création est cherchée et
//      cliquée, #brand porte la marque ; la ligne du catalogue aussi, et par
//      l'identifiant de /api/v2/brands quand son libellé diffère ;
//   3. la ligne qui n'apparaît qu'à 12 s → cliquée (l'attente fait 30 s) ;
//   4. liste figée → relancée (dernier caractère retapé ; recherche vidée →
//      retapée) ;
//   5. commit en retard sur un champ pré-rempli → attendu jusqu'à LA marque ;
//      clic qui ne prend jamais → second essai, puis l'arrêt (rien d'envoyé) ;
//   6. rien ne vient → la chaîne du 24/10 : « Sans marque » REMPLACE le
//      pré-rempli, jamais l'identifiant sur un champ rempli ; « Sans marque »
//      qui ne prend pas → la question au texte vrai, son diagnostic
//      (#brand = …, prefill_brand), UN signal selector_health, et le texte
//      reste classé « marque_inconnue » par le serveur ;
//   7. budget borné (10 à 60 s, 150 s gardées pour la suite) ; prefill_brand
//      relevé sur l'extrait de la sonde ;
//   8. plus aucune occurrence de « ne permet plus » dans vinted.js ni
//      QuestionMarque.jsx.
import fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { extraireFonctionJs } from "./lib/extraire-fonction-js.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => fs.readFileSync(join(ROOT, p), "utf8").split("\r\n").join("\n");
const vt = lire("chrome-extension/content-scripts/vinted.js");
const comp = lire("src/annonces/QuestionMarque.jsx");
const bg = lire("chrome-extension/background.js");
const { causeDuTexte } = await import(pathToFileURL(join(ROOT, "supabase/functions/_shared/cause-blocage.js")).href);

let ko = 0; let n = 0;
const ok = (c, nom, d = "") => { n++; if (c) console.log(`  ✓ ${nom}`); else { ko++; console.error(`  ✗ ${nom}${d ? `\n      ${d}` : ""}`); } };

// ── Le code livré, assemblé dans UNE portée (les vraies fonctions s'appellent entre elles) ──
const blocAbsences = vt.match(/const MARQUE_ABSENCES = new Set\(\[[\s\S]*?\]\);/)?.[0];
if (!blocAbsences) { console.error("✗ MARQUE_ABSENCES introuvable dans vinted.js"); process.exit(1); }
const CODE = [
  blocAbsences,
  ...["marqueAbsenceComparable", "estAbsenceDeMarque", "texteComparable", "attendreValeurMarque", "budgetMarqueMs",
    "signalerLigneDeCreationAbsente", "noterPrefillMarqueVinted", "decrirePrefillMarque", "attendreChoixMarque",
    "selectVintedBrand", "estMenuVintedBloom", "valeurChampVinted"].map((f) => extraireFonctionJs(vt, f)),
  "const SANS_MARQUE_RE = Object.freeze({ test: (v) => estAbsenceDeMarque(v) });",
  "let prefillMarqueVinted = undefined;",
  "return { selectVintedBrand, attendreChoixMarque, budgetMarqueMs, noterPrefillMarqueVinted, decrirePrefillMarque };",
].join("\n");
const DEPENDANCES = ["document", "sel", "openDropdown", "waitForElement", "typeHuman", "retaperDernierCaractere", "humanPause",
  "confirmDropdownIfNeeded", "closeAnyOpenDropdown", "selectVintedNoBrand", "marqueExacteDuCatalogueVinted",
  "marquesDuCatalogueVinted", "suggestionsMarqueProches", "armerMarquePourPost", "attendreMutationOu",
  "mesuresRemplissageEnCours", "maintenantMs", "Date", "console"];
const TRIGGER = '#brand, [data-testid="brand-select-dropdown-input"]';

// ── Le faux formulaire Marque ──────────────────────────────────────────────
// `scenario(etat)` dit ce que le menu ouvert montre à l'instant etat.t : { lignes: [[id, libellé]],
// libre: « nom » de la ligne « Utiliser … comme marque » ou null, sansMarque: #empty-brand seule }.
function formulaire({ brand = "", scenario = () => ({ lignes: [] }), commitApresMs = 0, commitRate = false,
  sansMarqueRemplace = true, catalogueExact = null, mesures = null } = {}) {
  const etat = {
    t: 0, brand, ouvert: false, recherche: "", selection: null, commitA: null, commitValeur: null,
    commitApresMs, commitRate, sansMarqueRemplace, catalogueExact, scenario,
    clics: [], frappes: [], relances: 0, ouvertures: 0, signaux: 0, sansMarque: 0, armements: [], logs: [],
    derniereFrappe: 0,
  };
  const appliquerCommit = () => {
    if (etat.commitA != null && etat.t >= etat.commitA) {
      if (!etat.commitRate) etat.brand = etat.commitValeur;
      etat.commitA = null;
    }
  };
  const vue = () => (etat.ouvert ? etat.scenario(etat) ?? {} : {});
  const ligne = (id, label) => ({
    id, textContent: label, getAttribute: (a) => (a === "aria-label" ? label : null),
    click: () => { etat.clics.push({ id, label, t: etat.t }); etat.selection = label; },
  });
  const ligneLibre = (nom) => ({
    id: "custom-select-brand", textContent: `Utiliser « ${nom} » comme marque`, getAttribute: () => null,
    click: () => { etat.clics.push({ id: "custom-select-brand", label: nom, t: etat.t }); etat.selection = nom; },
  });
  const champRecherche = { get value() { return etat.recherche; }, focus() {} };
  const document = {
    querySelector(q) {
      if (q === TRIGGER) return { get value() { appliquerCommit(); return etat.brand; } };
      if (q === "#brand-search-input") return etat.ouvert ? champRecherche : null;
      if (q === "#empty-brand") return vue().sansMarque ? { id: "empty-brand" } : null;
      return null;
    },
    querySelectorAll: () => (vue().lignes ?? []).map(([id, label]) => ligne(id, label)),
  };
  const S = {
    resolveSelector(_p, key, opts) {
      if (key === "publish.custom_brand_option") {
        const libre = vue().libre;
        if (libre) return { el: ligneLibre(libre) };
      }
      if (opts?.reportFailure !== false) etat.signaux++;
      const e = new Error("absent"); e.name = "SelectorResolutionError"; throw e;
    },
  };
  const fermer = async () => {
    if (etat.selection != null) {
      etat.commitValeur = etat.selection; etat.commitA = etat.t + etat.commitApresMs; etat.selection = null;
    }
    etat.ouvert = false;
    etat.t += 300;
  };
  const fakes = {
    document,
    sel: async () => S,
    openDropdown: async () => { etat.ouvert = true; etat.ouvertures++; etat.t += 600; },
    waitForElement: async (q) => { const el = document.querySelector(q); if (!el) throw new Error(`Élément introuvable: ${q}`); return el; },
    typeHuman: async (_el, texte) => { etat.recherche = String(texte); etat.frappes.push(String(texte)); etat.t += 100 * String(texte).length; etat.derniereFrappe = etat.t; },
    retaperDernierCaractere: async () => { etat.relances++; etat.t += 300; etat.derniereFrappe = etat.t; },
    humanPause: async () => { etat.t += 500; },
    confirmDropdownIfNeeded: fermer,
    closeAnyOpenDropdown: fermer,
    selectVintedNoBrand: async () => { etat.sansMarque++; etat.ouvert = false; etat.t += 2000; if (etat.sansMarqueRemplace) etat.brand = "Sans marque"; },
    marqueExacteDuCatalogueVinted: async () => etat.catalogueExact,
    marquesDuCatalogueVinted: async () => [],
    suggestionsMarqueProches: (_d, v) => [...new Set(v)],
    armerMarquePourPost: (id, titre) => etat.armements.push({ id, titre }),
    attendreMutationOu: async (ms) => { etat.t += ms; },
    mesuresRemplissageEnCours: mesures,
    maintenantMs: () => etat.t,
    Date: { now: () => etat.t },
    console: { log: (m) => etat.logs.push(String(m)), warn: (m) => etat.logs.push(String(m)), error: () => {} },
  };
  const api = new Function(...DEPENDANCES, CODE)(...DEPENDANCES.map((k) => fakes[k]));
  return { etat, api };
}
const marque = async (f, demandee, opts = {}) => {
  const warnings = [];
  let r; let erreur = null;
  try { r = await f.api.selectVintedBrand(demandee, warnings, opts); } catch (e) { erreur = e; }
  return { r, warnings, erreur };
};
// Après la frappe, le menu montre ses marques populaires ~800 ms, puis le résultat de la recherche.
const apresRecherche = (resultat, defaut = { lignes: [["brand-53", "Nike"], ["brand-12", "Zara"]] }) =>
  (etat) => (etat.t >= etat.derniereFrappe + 800 ? resultat(etat) : defaut);

// ── 1. PRÉ-REMPLI AVEC LA MARQUE ───────────────────────────────────────────
console.log("\n1. #BRAND PORTE DÉJÀ LA MARQUE (PRÉ-REMPLIE PAR VINTED) → AUCUNE QUESTION");
{
  const f = formulaire({ brand: "Hella" });
  const { r, warnings, erreur } = await marque(f, "HELLA");
  ok(r === undefined && !erreur, "succès, sans question ni arrêt", JSON.stringify(r));
  ok(f.etat.ouvertures === 0 && f.etat.frappes.length === 0 && f.etat.clics.length === 0, "rien n'est ouvert, rien n'est tapé, rien n'est cliqué");
  ok(warnings.some((w) => /déjà posée par Vinted/.test(String(w))), "tracé : « déjà posée par Vinted »");
  const g = formulaire({ brand: "Levi’s" });
  ok((await marque(g, "Levi's")).r === undefined && g.etat.ouvertures === 0, "même comparaison que le reste du code (apostrophe typographique, casse)");
}

// ── 2. PRÉ-REMPLI AVEC UNE AUTRE MARQUE ────────────────────────────────────
console.log("\n2. #BRAND PORTE UNE AUTRE MARQUE → LA MARQUE EST CRÉÉE OU CHOISIE, LE PRÉ-REMPLI REMPLACÉ");
{
  const f = formulaire({ brand: "Volkswagen", scenario: apresRecherche((e) => (e.recherche === "HELLA" ? { lignes: [], libre: "HELLA" } : { lignes: [] })) });
  const { r, warnings, erreur } = await marque(f, "HELLA");
  ok(r === undefined && !erreur, "succès, sans question", JSON.stringify(r ?? erreur?.message));
  ok(f.etat.ouvertures >= 1 && f.etat.frappes[0] === "HELLA", "le menu est ouvert et la marque tapée, malgré le champ rempli");
  ok(f.etat.clics.length === 1 && f.etat.clics[0].id === "custom-select-brand", "la ligne « Utiliser « HELLA » comme marque » est cliquée", JSON.stringify(f.etat.clics));
  ok(f.etat.brand === "HELLA", "#brand porte « HELLA » — « Volkswagen » remplacée");
  ok(warnings.some((w) => /« Volkswagen », pré-remplie par Vinted, remplacée par « HELLA »/.test(String(w))), "le remplacement est dit");
  ok(f.etat.armements.length === 0 && f.etat.sansMarque === 0 && f.etat.signaux === 0, "ni identifiant, ni « Sans marque », aucun signal d'échec");
}
{
  const f = formulaire({ brand: "Zara", scenario: apresRecherche(() => ({ lignes: [["brand-77", "Shein"], ["brand-78", "Shein Curve"]] })) });
  const { r } = await marque(f, "Shein");
  ok(r === undefined && f.etat.clics[0]?.id === "brand-77" && f.etat.brand === "Shein", "la ligne EXACTE du catalogue, cliquée par-dessus « Zara »");
}
{
  // b. La même marque au catalogue (/api/v2/brands) : sa ligne reconnue par son identifiant.
  const f = formulaire({ brand: "Volkswagen", catalogueExact: { id: 555, titre: "HELLA" },
    scenario: apresRecherche(() => ({ lignes: [["suggested-brand-555", "HELLA®"], ["brand-9", "Hella Kids"]] })) });
  const { r } = await marque(f, "HELLA");
  ok(r === undefined && f.etat.clics[0]?.id === "suggested-brand-555" && f.etat.brand === "HELLA®",
    "b. libellé affiché différent : la ligne de la même marque est reconnue par son identifiant /api/v2/brands", JSON.stringify(f.etat.clics));
}

// ── 3. LA LIGNE QUI N'APPARAÎT QU'À 12 S ───────────────────────────────────
console.log("\n3. LA LIGNE DE CRÉATION N'APPARAÎT QU'À 12 S → CLIQUÉE (L'ATTENTE FAIT 30 S)");
{
  const scenario = (e) => (e.t >= 12000 && e.recherche === "Zorglub Atelier" ? { lignes: [], libre: "Zorglub Atelier" } : { lignes: [["brand-53", "Nike"]] });
  const f = formulaire({ scenario });
  const { r } = await marque(f, "Zorglub Atelier");
  ok(r === undefined && f.etat.clics[0]?.id === "custom-select-brand" && f.etat.brand === "Zorglub Atelier", "créée par sa ligne, sans question", JSON.stringify(r));
  ok(f.etat.clics[0]?.t >= 12000 && f.etat.clics[0]?.t < 30000, `cliquée après 12 s (${f.etat.clics[0]?.t} ms simulées), dans les 30 s`);
  // L'ancienne fenêtre (10 s) l'aurait manquée.
  const g = formulaire({ scenario });
  g.etat.ouvert = true; g.etat.recherche = "Zorglub Atelier";
  const avant = await g.api.attendreChoixMarque("Zorglub Atelier", 10000, null);
  ok(avant?.type === "aucune" && !avant.el, "preuve : à 10 s d'attente (avant le 26/10), la même ligne était manquée");
  ok(/const attenteMs = Math\.min\(30000, restant\(\)\);/.test(vt), "30 s pour toute marque, bornées par le budget de l'étape");
}

// ── 4. LISTE FIGÉE → RELANCÉE ───────────────────────────────────────────────
console.log("\n4. UNE LISTE QUI NE SE RAFRAÎCHIT PAS EST RELANCÉE");
{
  const f = formulaire({ scenario: (e) => (e.relances >= 1 && e.t >= e.derniereFrappe + 500 ? { lignes: [], libre: "Blockz" } : { lignes: [["brand-53", "Nike"], ["brand-12", "Zara"]] }) });
  const { r } = await marque(f, "Blockz");
  ok(r === undefined && f.etat.relances === 1 && f.etat.brand === "Blockz", "4 s sans changement : le dernier caractère est retapé, la ligne vient, elle est cliquée", `relances ${f.etat.relances}`);
}
{
  // Re-rendu du formulaire pendant la frappe (les suggestions des photos arrivent) : la recherche est vidée.
  const f = formulaire({
    scenario: (e) => {
      if (!e.videe && e.t >= e.derniereFrappe + 1000) { e.videe = true; e.recherche = ""; }
      return e.videe && e.recherche === "uncle stubble" && e.t >= e.derniereFrappe + 500
        ? { lignes: [], libre: "uncle stubble" } : { lignes: [["brand-53", "Nike"]] };
    },
  });
  const { r } = await marque(f, "uncle stubble");
  ok(r === undefined && f.etat.frappes.length === 2 && f.etat.frappes[1] === "uncle stubble" && f.etat.brand === "uncle stubble",
    "recherche vidée par la page : retapée en entier, puis la marque créée", JSON.stringify(f.etat.frappes));
}
{
  // Rien ne bouge jamais : 3 relances au plus.
  const f = formulaire({ sansMarqueRemplace: true, scenario: () => ({ lignes: [["brand-53", "Nike"]] }) });
  await marque(f, "Powermiss");
  ok(f.etat.relances === 3, `relances bornées à 3 (${f.etat.relances})`);
}

// ── 5. LE COMMIT ────────────────────────────────────────────────────────────
console.log("\n5. LE CLIC : #BRAND DOIT PORTER LA MARQUE, PAS SEULEMENT « NON VIDE »");
{
  const f = formulaire({ brand: "Zara", commitApresMs: 5000, scenario: apresRecherche(() => ({ lignes: [["brand-77", "Shein"]] })) });
  const { r } = await marque(f, "Shein");
  ok(r === undefined && f.etat.brand === "Shein" && f.etat.frappes.length === 1,
    "commit en retard (5 s, onglet caché) sur un champ pré-rempli : attendu jusqu'à LA marque, sans second essai");
}
{
  const f = formulaire({ brand: "Zara", commitRate: true, scenario: apresRecherche(() => ({ lignes: [["brand-77", "Shein"]] })) });
  const { r, erreur } = await marque(f, "Shein");
  ok(r === undefined && erreur && /n'a pas pu être posé tel quel/.test(erreur.message), "un clic qui ne prend jamais : arrêt AVANT le dépôt, « Zara » jamais gardée en silence", erreur?.message);
  ok(f.etat.frappes.length === 2 && f.etat.clics.length === 2, "… après un second essai (menu rouvert, marque retapée, ligne recliquée)");
  ok(/#brand porte « Zara »/.test(erreur?.diagnostic ?? "") && /second essai/.test(erreur?.diagnostic ?? "") && /« Zara » pré-remplie par Vinted avant la recherche/.test(erreur?.diagnostic ?? ""),
    "le diagnostic dit #brand, le pré-rempli et le second essai", erreur?.diagnostic);
}

// ── 6. RIEN NE VIENT ────────────────────────────────────────────────────────
console.log("\n6. NI LIGNE NI CRÉATION : LA CHAÎNE DU 24/10, PUIS LA QUESTION AU TEXTE VRAI");
const rien = () => ({ lignes: [], sansMarque: true });
{
  const f = formulaire({ brand: "Volkswagen", scenario: rien });
  const { r, warnings } = await marque(f, "HELLA");
  ok(r?.resolution === "sans_marque" && f.etat.brand === "Sans marque" && f.etat.sansMarque === 1,
    "« Sans marque » (règle du 24/10, inchangée) REMPLACE la marque pré-remplie — jamais gardée", JSON.stringify(r));
  ok(warnings.some((w) => /« Volkswagen », pré-remplie par Vinted, remplacée/.test(String(w))), "dit dans les avertissements");
  ok(f.etat.signaux === 1, `UN signal selector_health pour la ligne de création absente (${f.etat.signaux}), pas un par passage de boucle`);
  ok(f.etat.t >= 30000 && f.etat.t < 75000, `attendu 30 s la ligne de création avant le repli (${f.etat.t} ms simulées)`);
}
{
  const f = formulaire({ brand: "Zara", scenario: rien });
  const { r } = await marque(f, "Paris 2024", { marqueId: 305315, marqueCapturee: "Paris 2024", injectionProuvee: true });
  ok(r?.resolution === "sans_marque" && f.etat.armements.length === 0,
    "identifiant prouvé, mais #brand rempli par Vinted : JAMAIS armé (la marque pré-remplie partirait à sa place)", JSON.stringify(r));
  const g = formulaire({ scenario: rien });
  const r2 = (await marque(g, "Paris 2024", { marqueId: 305315, marqueCapturee: "Paris 2024", injectionProuvee: true })).r;
  ok(r2?.poseeParId === true && g.etat.armements[0]?.id === 305315, "#brand vide : l'identifiant prouvé part, comme avant (voie du 17/10, inchangée)");
}
let question = null;
{
  const f = formulaire({ brand: "Volkswagen", sansMarqueRemplace: false, scenario: rien });
  f.api.noterPrefillMarqueVinted({ url: "https://www.vinted.fr/api/v2/item_upload/suggestions/attributes",
    reponse: '{"brands":[{"id":12,"title":"Volkswagen"}],"prefill_brand":{"id":12,"title":"Volkswagen","is_luxury":false},"colors":[]}' });
  const { r, erreur } = await marque(f, "HELLA");
  question = r;
  ok(r?.needsUser === true && !erreur, "« Sans marque » ne prend pas : la QUESTION, seulement maintenant", JSON.stringify(r ?? erreur?.message));
  ok(/^Vinted n'a pas proposé de créer « HELLA » sur ce formulaire/.test(r?.error ?? "") && !/ne permet plus/.test(r?.error ?? ""), "le texte vrai : « Vinted n'a pas proposé de créer « HELLA » sur ce formulaire »", r?.error);
  ok(/Rien n'a été envoyé à Vinted\./.test(r?.error ?? "") && /« Sans marque »/.test(r?.error ?? ""), "il dit quoi faire et que rien n'est parti");
  ok(/#brand = « Volkswagen »/.test(r?.diagnostic ?? "") && /prefill_brand « Volkswagen » \(id 12\)/.test(r?.diagnostic ?? ""),
    "diagnostic : la valeur trouvée dans #brand et prefill_brand", r?.diagnostic);
  ok(/aucune ligne exacte ni de création en 30 s/.test(r?.diagnostic ?? "") || /seule la ligne « Sans marque » proposée en 30 s/.test(r?.diagnostic ?? ""), "… et l'attente réelle (30 s)");
  ok(r?.needsUserField?.raison === "marque_hors_catalogue" && r?.needsUserField?.allowed_values?.[0] === "Sans marque" && r?.needsUserField?.demandee === "HELLA",
    "la question de l'app (raison, « Sans marque » d'abord, marque demandée) est inchangée");
  ok(f.etat.signaux === 1, `UN signal selector_health (${f.etat.signaux})`);
}
{
  const brut = question?.error ?? "";
  const prefixe = "Republication en pause AVANT toute suppression — ton annonce est intacte sur Vinted. ";
  const a = causeDuTexte({ texte: brut, source: null, platform: "vinted" });
  const b = causeDuTexte({ texte: prefixe + brut, source: "prevol_negatif", platform: "vinted" });
  ok(a.cause === "marque_inconnue" && b.cause === "marque_inconnue" && a.origine === "nous",
    "le serveur classe toujours l'arrêt « marque_inconnue » (cause-blocage.js), publication comme republication", `${a.cause} / ${b.cause}`);
}

// ── 7. BUDGET ET PREFILL ────────────────────────────────────────────────────
console.log("\n7. LE BUDGET DE L'ÉTAPE ET LE RELEVÉ DE prefill_brand");
{
  const budget = (ecouleMs) => formulaire({ mesures: ecouleMs == null ? null : { t0: -ecouleMs } }).api.budgetMarqueMs();
  ok(budget(null) === 60000 && budget(0) === 60000 && budget(30000) === 60000, "60 s au plus (remplissage jeune)");
  ok(budget(100000) === 50000 && budget(145000) === 10000 && budget(400000) === 10000, "150 s gardées pour la suite, 10 s au moins (l'attente d'avant)");
  const f = formulaire({ mesures: { t0: -145000 }, scenario: rien });
  const { r } = await marque(f, "HELLA");
  ok(r?.resolution === "sans_marque" && f.etat.t < 25000, `remplissage déjà à 145 s : l'étape se tient en ${f.etat.t} ms simulées (10 s d'attente)`);
  ok(/async function sendMessageToTab\(tabId, message, timeoutMs = 300_000\)/.test(bg) && /const FILL_BORNE_MS = 10 \* 60_000;/.test(bg),
    "appelants relus : 300 s (sendMessageToTab, port éteint) et 10 min (port) — 150 s + 60 s y tiennent");
}
{
  const f = formulaire();
  const p = f.api;
  ok(p.decrirePrefillMarque() === "prefill_brand non relevé", "rien relevé : « non relevé »");
  p.noterPrefillMarqueVinted({ url: "/api/v2/item_upload/suggestions/attributes", reponse: '{"brands":[{"id":631001,"title":"Power Girls","requires_authenticity_check":false}],"prefill_brand":null,"colors":[{"id":24' });
  ok(p.decrirePrefillMarque() === "prefill_brand : aucun (Vinted n'a rien pré-rempli)", "prefill_brand null (relevé réel du 24/10) : « aucun »");
  p.noterPrefillMarqueVinted({ url: "/api/v2/item_upload/suggestions/attributes", reponse: '{"brands":[],"prefill_brand":{"id":2803609,"title":"Herm\\u00e8s"' });
  ok(p.decrirePrefillMarque() === "prefill_brand « Hermès » (id 2803609)", "objet coupé par l'extrait : identifiant et titre lus quand même", p.decrirePrefillMarque());
  p.noterPrefillMarqueVinted({ url: "/api/v2/photos", reponse: '{"prefill_brand":null}' });
  ok(/Hermès/.test(p.decrirePrefillMarque()), "une autre requête ne touche à rien");
  // (29/10) Le désarmement des attributs d'origine (armerAttributsOriginePourPost(null)) s'intercale : même geste, même place.
  ok(/armerMarquePourPost\(null\);(?:\s*\/\/[^\n]*\n)*\s*(?:armerAttributsOriginePourPost\(null\);\s*(?:\/\/[^\n]*\n\s*)*)?prefillMarqueVinted = undefined;/.test(vt), "remis à zéro à chaque remplissage");
  ok(/try \{ if \(e\.data\.capture\) noterPrefillMarqueVinted\(e\.data\.capture\); \} catch/.test(vt), "relevé au passage des captures de la sonde, jamais un point de panne");
}

// ── 8. LA PHRASE FAUSSE ─────────────────────────────────────────────────────
console.log("\n8. PLUS AUCUNE OCCURRENCE DE « NE PERMET PLUS »");
ok(!/ne permet plus/i.test(vt), "chrome-extension/content-scripts/vinted.js");
ok(!/ne permet plus/i.test(comp), "src/annonces/QuestionMarque.jsx");
ok(/Vinted n'a pas proposé de créer \$\{demandee \? `« \$\{demandee\} »` : 'cette marque'\} sur ce formulaire\. Cherche-la dans la liste de Vinted \(elle y est peut-être sous un autre nom\), ou publie en « Sans marque »\. Rien n'a été envoyé à Vinted\./.test(comp),
  "l'app (Vinted) : « Vinted n'a pas proposé de créer « X » sur ce formulaire. Cherche-la… ou publie en « Sans marque ». Rien n'a été envoyé à Vinted. »");

console.log(ko === 0
  ? `\n✅ MARQUE VINTED PRÉ-REMPLIE : ${n} contrôles verts — la marque déjà là suffit, sinon elle est créée ou choisie ; un pré-remplissage faux est remplacé ; la question au texte vrai, en dernier.\n`
  : `\n❌ ${ko} contrôle(s) en échec sur ${n}.\n`);
process.exit(ko === 0 ? 0 : 1);
