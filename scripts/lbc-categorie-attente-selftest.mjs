// ═══════════════════════════════════════════════════════════════════════════
// VERROU « le bloc de catégorie s'attend » — CATÉGORIE LEBONCOIN (15/11/2026, lot (2) de Nico, point 3)
//   node scripts/lbc-categorie-attente-selftest.mjs [chemin/vers/leboncoin.js]
//
// LE CAS : joshua (f8a94c06, Premium), job 1078eb4b, « Vintage Parka PSG Nike Tiempo 2002-2003 », Mode > Vêtements
// confirmée : quatre dépôts arrêtés sur « Catégorie: ni suggestion ni sélecteur manuel trouvés. », fenêtre de travail
// minimisée. Journal de fenêtre du job : étape « categorie » à 10:27:18.032 (Paris), échec à 10:27:19.535 — le
// sleep(1500) puis UN regard. Leboncoin, lui, affiche toujours ce bloc dès que son classifieur a répondu (relu sur la
// vraie page le 15/11 : ~0,5 s visible ; suggestions « Mode > Vêtements · Loisirs > Sport & Plein air · Famille >
// Vêtements bébé » et bouton « Choisissez »), plus tard dans une fenêtre minimisée.
// CE QUE CE TEST PROUVE, sur les fonctions RÉELLES de leboncoin.js (extraites, jamais recopiées) :
//   1. le bloc qui arrive APRÈS 1,5 s est attendu : la suggestion de NOTRE catégorie est prise (avant : l'échec) ;
//   2. suggestions sans notre catégorie (Loisirs > Sport…, Famille > Vêtements bébé) → le sélecteur manuel trouve
//      Mode > Vêtements ;
//   3. page cachée sans bloc → la fenêtre de travail est rendue visible (message ONGLET_TRAVAIL_VISIBLE), puis le bloc
//      vient ; toujours rien → le titre est redit à Leboncoin ; rien du tout en 20 s → même motif qu'avant + relevé ;
//   4. le sélecteur manuel se trouve aussi par son libellé « Ou choisissez une autre catégorie » ;
//   5. le cas normal (bloc présent à 1,5 s) est inchangé : aucune attente en plus, aucune note ;
//   6. le service worker répond à ONGLET_TRAVAIL_VISIBLE par le geste de l'onglet muet, pour l'onglet qui demande.
// ═══════════════════════════════════════════════════════════════════════════
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { extraireFonction } from "./lib/vinted-taille-bac.mjs";
import { Doc, h } from "./lib/mini-dom.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CHEMIN = process.argv[2] ?? join(ROOT, "chrome-extension/content-scripts/leboncoin.js");
const SRC = readFileSync(CHEMIN, "utf8").replace(/\r\n/g, "\n");
const BG = readFileSync(join(ROOT, "chrome-extension/background.js"), "utf8").replace(/\r\n/g, "\n");

let ko = 0;
const ok = (nom, cond, detail = "") => { if (!cond) ko++; console.log(`  ${cond ? "ok  " : "KO  "} ${nom}${cond ? "" : `   ← ${detail}`}`); };
const ligne = (re) => { const m = SRC.match(re); return m ? m[0] : ""; };
const fonction = (nom) => { try { return extraireFonction(SRC, nom); } catch { return ""; } };

const RACINES = ["Emploi", "Véhicules", "Immobilier", "Locations de vacances", "Électronique", "Maison & Jardin",
  "Famille", "Mode", "Loisirs", "Animaux", "Matériel professionnel", "Services", "Divers"];
const FEUILLES = { Mode: ["Vêtements", "Chaussures", "Accessoires & Bagagerie", "Montres & Bijoux"], Loisirs: ["Sport & Plein air", "Collection"] };
const liRacine = (nom, onclick) => { const b = h("button", { type: "button" }, h("span", {}, nom)); b.onclick = onclick; return h("li", {}, b); };

// La page de dépôt : le titre seul, puis (quand Leboncoin a répondu) le bloc de catégorie.
function pageDepot({ suggestions, bouton = "Choisissez", libelleSeul = false }) {
  const choix = [];
  const titre = h("input", { name: "subject", value: "Vintage Parka PSG Nike Tiempo 2002-2003" });
  const evenementsTitre = [];
  titre.dispatchEvent = (ev) => { evenementsTitre.push(ev.type); return true; };
  const zoneBloc = h("div", {});
  const doc = new Doc([h("form", {}, titre, zoneBloc)]);
  doc.visibilityState = "visible";
  const montrerBloc = () => {
    if (zoneBloc.children.length) return;
    zoneBloc.ajouter(h("p", {}, "Choisissez une catégorie suggérée"));
    for (const s of suggestions) {
      const r = h("input", { type: "radio", value: s });
      r.onclick = () => choix.push(`suggestion:${s}`);
      zoneBloc.ajouter(h("li", {}, r, h("span", {}, s)));
    }
    const zoneManuelle = h("div", { class: "manuel" });
    const libelle = h("p", {}, "Ou choisissez une autre catégorie*");
    const declencheur = h("button", { type: "button" }, h("span", {}, libelleSeul ? "Sélectionner" : bouton));
    zoneManuelle.ajouter(libelle);
    zoneManuelle.ajouter(declencheur);
    declencheur.onclick = () => {
      const panneau = h("div", { class: "flex" });
      panneau.ajouter(h("ul", { class: "border-r" }, ...RACINES.map((r) => liRacine(r, () => {
        for (const u of panneau.children.slice(1)) panneau.retirer(u);
        panneau.ajouter(h("ul", { class: "flex flex-col" }, ...(FEUILLES[r] ?? []).map((f) => {
          const b = h("button", { type: "button" }, h("span", {}, f));
          b.onclick = () => choix.push(`${r} > ${f}`);
          return h("li", {}, b);
        })));
      }))));
      zoneManuelle.ajouter(panneau);
    };
    zoneBloc.ajouter(zoneManuelle);
  };
  return { doc, choix, montrerBloc, evenementsTitre };
}

// Le bac à sable : les fonctions RÉELLES ; une horloge de « sommeils » qui fait arriver le bloc quand on le décide.
function charger(doc, { blocApresSommeils = null, surVisible = null } = {}) {
  const morceaux = [
    fonction("texteComparable"),
    ligne(/^const normalizeFuzzy = .+;$/m),
    ligne(/^const RACINES_LBC = Object\.freeze\(\[[\s\S]*?\]\);$/m),
    ligne(/^const CATEGORIE_TOUR_MS = [^;]+;/m), ligne(/^const CATEGORIE_TOURS_MAX = [^;]+;/m),
    ligne(/^const CATEGORIE_TOURS_AVANT_MONTRER = [^;]+;/m), ligne(/^const CATEGORIE_TOURS_AVANT_RELANCE = [^;]+;/m),
    fonction("trouverPanneauRacinesLbc"), fonction("releveListesCategorieLbc"), fonction("findSuggestionRadio"),
    fonction("choisirSuggestionLeboncoin"), fonction("trouverDeclencheurCategorieLbc"), fonction("etatBlocCategorieLbc"),
    fonction("attendreBlocCategorieLbc"), fonction("selectCategory"), fonction("waitFor"),
    "return { selectCategory };",
  ].filter(Boolean).join("\n\n");
  const horloge = { sommeils: 0, ms: 0, messages: [] };
  const sleep = (ms = 0) => { horloge.sommeils++; horloge.ms += Number(ms) || 0; if (blocApresSommeils != null && horloge.sommeils >= blocApresSommeils.n) blocApresSommeils.montrer(); return Promise.resolve(); };
  const humanPause = () => Promise.resolve();
  const MouseEvent = class { constructor(type) { this.type = type; } };
  const Event = class { constructor(type) { this.type = type; } };
  const chrome = { runtime: { sendMessage: async (m) => { horloge.messages.push(m?.type); if (m?.type === "ONGLET_TRAVAIL_VISIBLE") { surVisible?.(); return { fait: true }; } return { choix: null, motif: "aucune" }; } } };
  const S = new Function("document", "sleep", "humanPause", "MouseEvent", "Event", "chrome", "console", morceaux)(
    doc, sleep, humanPause, MouseEvent, Event, chrome, { log() {}, warn() {}, error() {} });
  return { S, horloge };
}

console.log("1. Le cas de la parka : le bloc arrive APRÈS les 1,5 s");
{
  const p = pageDepot({ suggestions: ["ModeVêtements", "LoisirsSport & Plein air", "FamilleVêtements bébé"] });
  // 1er sommeil = les 1,5 s ; le bloc arrive au 7e (≈ 1,25 s d'attente en plus).
  const { S } = charger(p.doc, { blocApresSommeils: { n: 7, montrer: p.montrerBloc } });
  const warnings = [];
  let erreur = null;
  await S.selectCategory("Mode", "Vêtements", { warnings }).catch((e) => { erreur = e; });
  ok("aucune erreur (avant : « Catégorie: ni suggestion ni sélecteur manuel trouvés. »)", erreur === null, String(erreur?.message ?? ""));
  ok("la suggestion de NOTRE catégorie est prise : Mode > Vêtements", p.choix.join("|") === "suggestion:ModeVêtements", p.choix.join("|"));
  ok("l'attente en plus est tracée (warnings du job)", warnings.some((w) => typeof w === "string" && /bloc de Leboncoin est arrivé après/.test(w)), JSON.stringify(warnings));
}

console.log("2. Suggestions sans notre catégorie → le sélecteur manuel trouve Mode > Vêtements");
{
  const p = pageDepot({ suggestions: ["LoisirsSport & Plein air", "FamilleVêtements bébé", "LoisirsCollection"] });
  const { S } = charger(p.doc, { blocApresSommeils: { n: 3, montrer: p.montrerBloc } });
  let erreur = null;
  await S.selectCategory("Mode", "Vêtements", { warnings: [] }).catch((e) => { erreur = e; });
  ok("aucune erreur", erreur === null, String(erreur?.message ?? ""));
  ok("Mode > Vêtements choisie au sélecteur manuel (jamais une suggestion d'une autre catégorie)", p.choix.join("|") === "Mode > Vêtements", p.choix.join("|"));
}

console.log("3. Page cachée : fenêtre rendue visible, titre redit, et l'échec dit ce qu'il a vu");
{
  const p = pageDepot({ suggestions: ["ModeVêtements"] });
  p.doc.visibilityState = "hidden";
  const { S, horloge } = charger(p.doc, { surVisible: () => { p.doc.visibilityState = "visible"; p.montrerBloc(); } });
  const warnings = [];
  let erreur = null;
  await S.selectCategory("Mode", "Vêtements", { warnings }).catch((e) => { erreur = e; });
  ok("page cachée sans bloc : la fenêtre de travail est rendue visible (ONGLET_TRAVAIL_VISIBLE)", horloge.messages.includes("ONGLET_TRAVAIL_VISIBLE"), horloge.messages.join(","));
  ok("…puis le bloc vient et la catégorie est posée", erreur === null && p.choix.join("|") === "suggestion:ModeVêtements", `${erreur?.message ?? ""} ${p.choix.join("|")}`);
  ok("le geste est tracé", warnings.some((w) => typeof w === "string" && /fenêtre de travail rendue visible/.test(w)), JSON.stringify(warnings));
}
{
  const p = pageDepot({ suggestions: ["ModeVêtements"] });
  const { S, horloge } = charger(p.doc);
  let erreur = null;
  await S.selectCategory("Mode", "Vêtements", { warnings: [] }).catch((e) => { erreur = e; });
  const m = String(erreur?.message ?? "");
  ok("rien en 20 s : même motif de tête qu'avant (reprise et relance après mise à jour le reconnaissent)", m.startsWith("Catégorie: ni suggestion ni sélecteur manuel trouvés."), m);
  ok("…avec le relevé (attente, page, fenêtre, titre, listes)", /Observabilité: attendu 2\d s, page visible, fenêtre laissée telle quelle, titre redit, 0 suggestion\(s\)/.test(m), m);
  ok("le titre a été redit à Leboncoin (événement input sur le champ, valeur inchangée)", p.evenementsTitre.includes("input"), p.evenementsTitre.join(","));
  ok("attente bornée : 20 s au plus après les 1,5 s", horloge.ms <= 1500 + 20_000 + 250 && horloge.ms >= 1500 + 19_000, String(horloge.ms));
}

console.log("4. Le sélecteur manuel se trouve aussi par son libellé");
{
  const p = pageDepot({ suggestions: ["LoisirsSport & Plein air"], libelleSeul: true });
  p.montrerBloc();
  const { S } = charger(p.doc);
  let erreur = null;
  await S.selectCategory("Mode", "Vêtements", { warnings: [] }).catch((e) => { erreur = e; });
  ok("bouton « Sélectionner » sous « Ou choisissez une autre catégorie » : Mode > Vêtements", erreur === null && p.choix.join("|") === "Mode > Vêtements", `${erreur?.message ?? ""} ${p.choix.join("|")}`);
}

console.log("5. Le cas normal est inchangé");
{
  const p = pageDepot({ suggestions: ["ModeVêtements", "LoisirsSport & Plein air"] });
  p.montrerBloc();
  const { S, horloge } = charger(p.doc);
  const warnings = [];
  await S.selectCategory("Mode", "Vêtements", { warnings });
  ok("bloc présent à 1,5 s : suggestion prise tout de suite", p.choix.join("|") === "suggestion:ModeVêtements", p.choix.join("|"));
  ok("aucune attente en plus, aucune note, aucun message au service worker", horloge.ms === 1500 && warnings.length === 0 && horloge.messages.length === 0, `${horloge.ms} ${JSON.stringify(warnings)} ${horloge.messages}`);
}

console.log("6. Le service worker : ONGLET_TRAVAIL_VISIBLE = le geste de l'onglet muet, pour l'onglet qui demande");
ok("background.js répond à ONGLET_TRAVAIL_VISIBLE par restaurerFenetrePourOngletMuet(senderTabId)",
  /msg\?\.type === "ONGLET_TRAVAIL_VISIBLE"[\s\S]{0,400}restaurerFenetrePourOngletMuet\(senderTabId\)/.test(BG));
ok("sans onglet émetteur : rien", /ONGLET_TRAVAIL_VISIBLE"\) \{\s*if \(senderTabId == null\) \{ sendResponse\(\{ fait: false/.test(BG));

console.log("7. Les tâches arrêtées sur ce défaut repartent UNE fois quand le poste a la 0.6.191 (relance après mise à jour)");
{
  const R = await import("../supabase/functions/_shared/relance-apres-maj.js");
  const { EXTENSION_LAST_COMMIT } = await import("./build-id.mjs");
  const regle = R.RELANCES_APRES_MAJ.find((r) => r.cle === "lbc_categorie_bloc_attendu");
  ok("règle lbc_categorie_bloc_attendu : Leboncoin, publication, build = EXTENSION_LAST_COMMIT de la 0.6.191",
    regle?.platform === "leboncoin" && regle?.action === "publish" && regle?.version === "0.6.191" && regle?.buildMin === EXTENSION_LAST_COMMIT, JSON.stringify(regle));
  ok("son motif est EXACTEMENT le début du message d'échec de leboncoin.js", Boolean(regle) && SRC.includes(`throw new Error(\`${regle.brut}`), regle?.brut);
  const parka = { status: "needs_user", platform: "leboncoin", action: "publish", handler_build: "2026-11-10T14:10:14Z+ba13a51 · v0.6.186",
    platform_fields: { needs_user_source: "relancer", error_technique: { brut: "Catégorie: ni suggestion ni sélecteur manuel trouvés." } } };
  ok("la parka (arrêt écrit par une 0.6.186) est couverte", R.regleDeRelance(parka)?.cle === "lbc_categorie_bloc_attendu");
  ok("un arrêt écrit par une 0.6.191 (le correctif déjà là) ne l'est jamais",
    R.regleDeRelance({ ...parka, handler_build: `${EXTENSION_LAST_COMMIT}+84a8d8f · v0.6.191` })?.cle !== "lbc_categorie_bloc_attendu");
}

console.log(ko ? `\n✗ ${ko} échec(s)` : "\n✓ bloc de catégorie Leboncoin attendu : tout passe");
process.exit(ko ? 1 : 0);
