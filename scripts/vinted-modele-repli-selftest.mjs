// ═══════════════════════════════════════════════════════════════════════════
// LE MODÈLE VINTED « DE REPLI », CHOISI QUAND IL EST DEMANDÉ (26/10/2026)
//   node scripts/vinted-modele-repli-selftest.mjs
// ═══════════════════════════════════════════════════════════════════════════
// Point 3c de la nuit du 25→26/10 — Thibault (thibault.andrieux), job
// dca41766 : republication Vinted d'un téléphone Samsung (rayon 3661), annonce
// RETIRÉE le 25/10 à 10:29, recréation refusée quatre fois (400
// {"field":"model"}), puis la question « Modèle ». La capture 18142 portait
// model = { type: "other", metadata: { collection_id: 2 } } : l'annonce avait
// été déposée avec une ligne de REPLI du menu Modèle. Trois trous :
//   1. findVintedModelOption écartait TOUJOURS les replis (« Mon modèle ne
//      figure pas dans la liste », « Je ne connais pas le nom du modèle ») —
//      même une réponse explicite ne pouvait pas les choisir ;
//   2. la capture jetait un modèle « other » (seul « known » passait) —
//      scripts/vinted-attributs-capture-selftest.mjs ;
//   3. le contrôle avant retrait ne comptait le modèle que si vintedAspects
//      .model était déjà rempli.
// Ce test exécute le code LIVRÉ (findVintedModelOption, selectVintedModel,
// attendreValeurMarque, caracteristiquesCaptureNonReposees, extraits de
// vinted.js) sur un faux menu Modèle à horloge simulée :
//   A. un libellé de repli demandé → SA ligne, à l'exact, et seulement elle ;
//      la valeur posée est relue ; non prise → « introuvable » et le dit ;
//   B. une valeur ordinaire → la règle d'avant, à l'identique (replis écartés,
//      préfixe mot à mot, requêtes raccourcies) ;
//   C. le contrôle avant retrait compte le modèle dès que la copie dit que la
//      capture en portait un (modele_capture / modele_exige).
// ⚠️ Ce que Vinted affiche dans #model après le choix d'un repli, et que ce
// choix produise bien { type: "other" } au dépôt, reste à prouver en réel.
import fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { extraireFonctionJs } from "./lib/extraire-fonction-js.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const vt = fs.readFileSync(join(ROOT, "chrome-extension/content-scripts/vinted.js"), "utf8").split("\r\n").join("\n");

let ko = 0; let n = 0;
const ok = (c, nom, d = "") => { n++; if (c) console.log(`  ✓ ${nom}`); else { ko++; console.error(`  ✗ ${nom}${d ? `\n      ${d}` : ""}`); } };

const extraire = (re, nom) => { const m = vt.match(re)?.[0]; if (!m) { console.error(`✗ ${nom} introuvable dans vinted.js`); process.exit(1); } return m; };
const NORM = extraire(/const normModel = \(s\) => String\(s \?\? ""\)[\s\S]*?\.trim\(\);/, "normModel");
const REPLIS = extraire(/const MODEL_FALLBACK_LABELS = new Set\(\[[\s\S]*?\]\.map\(normModel\)\);/, "MODEL_FALLBACK_LABELS");
const CANAUX = extraire(/const ATTRIBUTS_CANAUX_DEDIES = new Set\(\[[^\]]*\]\);/, "ATTRIBUTS_CANAUX_DEDIES");
const REPLI_AUTRE = "Mon modèle ne figure pas dans la liste";
const REPLI_INCONNU = "Je ne connais pas le nom du modèle";
const TRIGGER = '#model, [data-testid="model-select-input"]';
const OPTION = '[data-testid^="model-"][data-testid$="--title"]';

// ── Le faux menu Modèle (Samsung) : la recherche filtre les modèles ; aucun modèle trouvé → les deux replis
// seuls (relevé du 18/07 : « juste les replis »). ─────────────────────────────────────────────────────────
function menu({ modeles = ["Galaxy S10", "Galaxy S10+", "Galaxy A52"], commitRate = false, repliAbsent = false } = {}) {
  const etat = { t: 0, ouvert: false, recherche: "", model: "", selection: null, frappes: [], clics: [], fermetures: 0, logs: [] };
  const norm = (s) => String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();
  const visibles = () => {
    if (!etat.ouvert) return [];
    const q = norm(etat.recherche);
    const trouves = modeles.filter((m) => !q || norm(m).includes(q));
    if (trouves.length) return trouves.map((m, i) => [`model-${100 + i}--title`, m]);
    return repliAbsent ? [] : [["model-other--title", REPLI_AUTRE], ["model-unknown--title", REPLI_INCONNU]];
  };
  const option = ([tid, label]) => ({ textContent: label, getAttribute: (a) => (a === "data-testid" ? tid : null) });
  const document = {
    querySelector(q) {
      if (q === TRIGGER) return { get value() { return etat.model; } };
      if (q === "#model-search-input") return etat.ouvert ? { get value() { return etat.recherche; } } : null;
      return null;
    },
    querySelectorAll: (q) => (q === OPTION ? visibles().map(option) : []),
  };
  const fermer = async () => {
    if (etat.selection != null && !commitRate) etat.model = etat.selection;
    etat.selection = null; etat.ouvert = false; etat.fermetures++; etat.t += 300;
  };
  const fakes = {
    document,
    openDropdown: async () => { etat.ouvert = true; etat.t += 600; },
    waitForElement: async (q) => { const el = document.querySelector(q); if (!el) throw new Error(`Élément introuvable: ${q}`); return el; },
    typeHuman: async (_el, texte) => { etat.recherche = String(texte); etat.frappes.push(String(texte)); etat.t += 100 * String(texte).length; },
    sleep: async (ms) => { etat.t += ms; },
    humanPause: async () => { etat.t += 500; },
    clickModelOption: async (el) => { etat.clics.push(el.textContent); etat.selection = el.textContent; },
    confirmDropdownIfNeeded: fermer,
    closeAnyOpenDropdown: fermer,
    attendreMutationOu: async (ms) => { etat.t += ms; },
    optionsRelevees: new Map(),
    Date: { now: () => etat.t },
    console: { log: (m) => etat.logs.push(String(m)), warn: (m) => etat.logs.push(String(m)), error: () => {} },
  };
  const noms = Object.keys(fakes);
  const api = new Function(...noms, [NORM, REPLIS, extraireFonctionJs(vt, "findVintedModelOption"), extraireFonctionJs(vt, "attendreValeurMarque"),
    extraireFonctionJs(vt, "selectVintedModel"), "return { findVintedModelOption, selectVintedModel, normModel, MODEL_FALLBACK_LABELS };"].join("\n"))(...noms.map((k) => fakes[k]));
  return { etat, api, fakes };
}
const choisir = async (m, valeur) => { const warnings = []; const r = await m.api.selectVintedModel(valeur, warnings); return { r, warnings }; };

// ── A. LE REPLI DEMANDÉ ─────────────────────────────────────────────────────
console.log("\nA. UN LIBELLÉ DE REPLI DEMANDÉ : SA LIGNE, À L'EXACT, ET SEULEMENT ELLE");
{
  const m = menu();
  m.etat.ouvert = true; m.etat.recherche = REPLI_AUTRE;
  const t = m.api.findVintedModelOption(OPTION, REPLI_AUTRE);
  ok(t?.stage === "repli" && t.label === REPLI_AUTRE, "« Mon modèle ne figure pas dans la liste » → sa ligne (stage « repli »)", JSON.stringify(t && { stage: t.stage, label: t.label }));
  ok(m.api.findVintedModelOption(OPTION, "MON MODELE ne figure  pas dans la liste")?.label === REPLI_AUTRE, "même comparaison que le reste (casse, accents, espaces : normModel)");
  ok(m.api.findVintedModelOption(OPTION, REPLI_INCONNU)?.label === REPLI_INCONNU, "« Je ne connais pas le nom du modèle » → SA ligne, jamais l'autre repli");
  m.etat.recherche = "Galaxy";
  ok(m.api.findVintedModelOption(OPTION, REPLI_AUTRE) === null, "le repli n'est pas affiché : rien, jamais un modèle du catalogue à sa place");
}
{
  const m = menu();
  const { r, warnings } = await choisir(m, REPLI_AUTRE);
  ok(r === "pose" && m.etat.model === REPLI_AUTRE, "choisi, cliqué, commité : « pose »", `${r} / #model « ${m.etat.model} »`);
  ok(m.etat.frappes.length === 1 && m.etat.frappes[0] === REPLI_AUTRE, "une seule recherche, le libellé entier (aucune requête raccourcie)", JSON.stringify(m.etat.frappes));
  ok(m.etat.clics.length === 1 && m.etat.clics[0] === REPLI_AUTRE, "un seul clic, sur la ligne de repli");
  ok(warnings.some((w) => /ligne de repli « Mon modèle ne figure pas dans la liste » choisie \(demandée telle quelle\) — #model = « Mon modèle ne figure pas dans la liste »/.test(w)),
    "la valeur posée est RELUE et dite", JSON.stringify(warnings));
}
{
  const m = menu({ commitRate: true });
  const { r, warnings } = await choisir(m, REPLI_AUTRE);
  ok(r === "introuvable" && m.etat.model === "", "clic qui ne prend pas (#model vide après 8 s) : « introuvable », jamais « posé »", r);
  ok(warnings.some((w) => /cliquée, mais #model est resté vide/.test(w)), "et c'est dit");
  ok(m.etat.t >= 8000, `relu pendant 8 s avant de conclure (${m.etat.t} ms simulées)`);
}
{
  const m = menu({ repliAbsent: true });
  const { r, warnings } = await choisir(m, REPLI_INCONNU);
  ok(r === "introuvable" && m.etat.clics.length === 0, "le formulaire ne propose pas ce repli : rien de cliqué, « introuvable »");
  ok(m.etat.frappes.length === 1 && m.etat.t < 15000, `une seule recherche, pas de libellé raccourci (« Je ne connais pas le nom du… ») — ${m.etat.frappes.length} frappe(s), ${m.etat.t} ms simulées`);
  ok(warnings.some((w) => /la ligne de repli « Je ne connais pas le nom du modèle » n'est pas proposée par ce formulaire/.test(w)), "le message dit ce qui manque (plus « introuvable dans le catalogue »)");
}

// ── B. LA VALEUR ORDINAIRE ──────────────────────────────────────────────────
console.log("\nB. UNE VALEUR ORDINAIRE : LA RÈGLE D'AVANT, À L'IDENTIQUE");
{
  const m = menu();
  m.etat.ouvert = true; m.etat.recherche = "zzz";
  ok(m.api.findVintedModelOption(OPTION, "zzz") === null, "seuls les replis sont affichés : une valeur ordinaire ne les prend JAMAIS");
  ok(m.api.findVintedModelOption(OPTION, "Mon modèle") === null, "un début de libellé de repli n'est pas un repli demandé : écarté");
  const { r } = await choisir(m, "Galaxy S10 5G");
  ok(r === "pose" && m.etat.model === "Galaxy S10" && m.etat.frappes.join(" | ") === "Galaxy S10 5G | Galaxy S10",
    "« Galaxy S10 5G » : requêtes raccourcies puis la base du variant (préfixe mot à mot), comme avant", `${m.etat.frappes.join(" | ")} → ${m.etat.model}`);
  const m2 = menu();
  const r2 = await choisir(m2, "Galaxy A52");
  ok(r2.r === "pose" && m2.etat.model === "Galaxy A52" && m2.etat.frappes.length === 1, "modèle exact du catalogue : posé du premier coup");
  const m3 = menu();
  const r3 = await choisir(m3, "Nokia 3310");
  ok(r3.r === "introuvable" && m3.etat.clics.length === 0 && r3.warnings.some((w) => /introuvable dans le catalogue Vinted/.test(w)),
    "modèle absent : jamais un repli cliqué à sa place, « introuvable », le message d'avant");
}

// ── C. LE CONTRÔLE AVANT RETRAIT ────────────────────────────────────────────
console.log("\nC. LE CONTRÔLE AVANT RETRAIT COMPTE LE MODÈLE DÈS QUE LA CAPTURE EN PORTAIT UN");
{
  const fabriquer = (modelPresent, valeur = "") => new Function("document", "vintedFieldSelector", "VINTED_SERVER_FIELD_LABELS", "CSS",
    `${CANAUX}\n${extraireFonctionJs(vt, "caracteristiquesCaptureNonReposees")}; return caracteristiquesCaptureNonReposees;`)(
    { querySelector: (q) => (q === TRIGGER && modelPresent ? { value: valeur } : null) },
    new Function(`${extraireFonctionJs(vt, "vintedFieldSelector")}; return vintedFieldSelector;`)(),
    { model: "Modèle" }, { escape: (s) => s });
  const job = (pf) => ({ platform_fields: pf });
  const manque = (pf, present = true, valeur = "") => fabriquer(present, valeur)(job(pf)).map((x) => x.key);
  ok(manque({ vintedAspects: {}, modele_capture: { type: "other", collection_id: 2, name: null } }).includes("model"),
    "modele_capture présent, #model vide → « Modèle » manquant : le retrait est refusé");
  ok(manque({ modele_exige: true }).includes("model"), "modele_exige → compté");
  ok(manque({ vintedAspects: { model: REPLI_AUTRE } }).includes("model"), "vintedAspects.model rempli (le repli versé par le serveur) : compté, comme avant");
  ok(!manque({ vintedAspects: { model: REPLI_AUTRE } }, true, REPLI_AUTRE).includes("model"), "#model posé : rien ne manque");
  ok(!manque({ modele_capture: { type: "other" } }, false).includes("model"), "champ Modèle absent du formulaire : Vinted ne le demandera pas");
  ok(!manque({}).includes("model") && !manque({ vintedAspects: { model: "  " } }).includes("model"), "aucune trace d'un modèle capturé : la règle d'avant (rien de compté)");
}
ok(/const repliNonPris = MODEL_FALLBACK_LABELS\.has\(normModel\(fields\.modele\)\);/.test(vt)
  && /Le formulaire de Vinted n'a pas pris le choix « \$\{fields\.modele\} » du champ « Modèle »/.test(vt),
  "publication : un repli non pris s'arrête avec un message vrai (plus « n'y figure pas »)");

// (26/10 nuit) Le serveur ne verse le repli qu'à un poste qui sait le choisir — jamais une boucle de 400.
{
  const gpj = fs.readFileSync(join(ROOT, "supabase/functions/get-pending-jobs/index.ts"), "utf8").split("\r\n").join("\n");
  ok(/const cap = aspectsDeLaCapture\(natif, \{ repliModele: buildMsDe\(buildDuPoll\) >= buildMsDe\(BUILD_VINTED_MODELE_REPLI\) \}\);/.test(gpj),
    "get-pending-jobs : le repli est versé au seul poste dont le build porte BUILD_VINTED_MODELE_REPLI");
  const ce = fs.readFileSync(join(ROOT, "supabase/functions/_shared/correctifs-extension.js"), "utf8");
  ok(/export const BUILD_VINTED_MODELE_REPLI = "(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ)?";/.test(ce), "BUILD_VINTED_MODELE_REPLI : vide (aucun poste) ou le BUILD_ID du paquet qui sait choisir un repli");
}

console.log(ko === 0
  ? `\n✅ MODÈLE DE REPLI : ${n} contrôles verts — choisi quand il est demandé, relu ; jamais pris pour une autre valeur ; compté avant tout retrait.\n`
  : `\n❌ ${ko} contrôle(s) en échec sur ${n}.\n`);
process.exit(ko === 0 ? 0 : 1);
