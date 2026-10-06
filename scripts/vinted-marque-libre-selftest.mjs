// La marque Vinted se pose TELLE QUELLE (03/10, règle de Nico) : la ligne
// EXACTE du catalogue, sinon « Utiliser "X" comme marque » quand Vinted la
// propose — et quand Vinted ne connaît pas la marque et n'offre que « Sans
// marque » (relevé réel du 03/10 sur vinted.fr), une QUESTION. Jamais une
// marque approchante, jamais « Sans marque » à la place d'une vraie marque.
// Banc : la vraie fonction attendreChoixMarque (extraite de vinted.js), sur un
// faux panneau Marque.
import fs from "node:fs";
import assert from "node:assert/strict";
import { extraireFonctionJs } from "./lib/extraire-fonction-js.mjs";

const src = fs.readFileSync(new URL("../chrome-extension/content-scripts/vinted.js", import.meta.url), "utf8");

// ── 1. Le code : plus de repli « Sans marque », relecture de LA marque ──────
const corps = extraireFonctionJs(src, "selectVintedBrand");
assert.doesNotMatch(corps, /brand_fallback_no_brand/, "plus aucun repli « Sans marque » pour une vraie marque");
const iSans = corps.indexOf("if (SANS_MARQUE_RE.test(marque))");
const iFinSans = corps.indexOf("const demandee =");
assert.ok(iSans > 0 && iFinSans > iSans, "« Sans marque » demandé garde son chemin natif");
assert.doesNotMatch(corps.slice(iFinSans), /selectVintedNoBrand\(/, "une vraie marque n'est JAMAIS remplacée par « Sans marque »");
assert.ok(corps.includes("texteComparable(posee) === texteComparable(demandee)"), "la relecture compare #brand à LA marque demandée");
assert.ok(corps.includes("if (choix?.el) {"), "on ne clique que sur une ligne trouvée");
assert.match(corps, /needsUser: true,[\s\S]{0,400}Vinted ne connaît pas la marque/, "marque inconnue de Vinted → une question, pas un choix");
assert.ok(corps.includes(`allowed_values: proposees, target: { key: "marque" }`), "la réponse s'écrit dans la marque de la copie");
assert.match(src, /const questionMarque = await selectVintedBrand\(fields\.marque, warnings, \{ marqueId: fields\.marque_id \}\);\s*if \(questionMarque\?\.needsUser\)/, "la question remonte jusqu'au résultat du dépôt (et l'id de la marque d'origine voyage, 06/10)");
assert.doesNotMatch(corps, /nearest|approch|includes\(cible\)|startsWith\(cible\)/i, "aucun rapprochement");

// ── 2. Le comportement : la vraie fonction sur un faux panneau ─────────────
const texteComparable = new Function(`${extraireFonctionJs(src, "texteComparable")}; return texteComparable;`)();
const fabriquer = new Function("document", "sel", "sleep", "texteComparable",
  `${extraireFonctionJs(src, "attendreChoixMarque")}; return attendreChoixMarque;`);
function panneau(lignes, libre = null, { sansMarque = false } = {}) {
  const els = lignes.map(([id, label]) => ({ id, getAttribute: (a) => (a === "aria-label" ? label : null), textContent: label }));
  const document = {
    querySelectorAll: () => els,
    querySelector: (q) => (q === "#empty-brand" && sansMarque ? { id: "empty-brand" } : null),
  };
  const elLibre = libre ? { id: "custom-select-brand", textContent: libre } : null;
  const sel = async () => ({
    resolveSelector: () => { if (!elLibre) { const e = new Error("absent"); e.name = "SelectorResolutionError"; throw e; } return { el: elLibre }; },
  });
  return { document, sel };
}
const dormir = (ms) => new Promise((r) => setTimeout(r, Math.min(ms, 5)));
async function choisir(marque, lignes, libre, timeout = 400, options = {}) {
  const p = panneau(lignes, libre, options);
  return fabriquer(p.document, p.sel, dormir, texteComparable)(marque, timeout, options.marqueId ?? null);
}

// a) La marque du catalogue : la ligne exacte, même aux accents/apostrophes près.
let r = await choisir("Bonobo", [["brand-1", "Bonobo Jeans"], ["brand-2", "Bonobo"], ["suggested-brand-3", "Bonobos"]], null);
assert.equal(r?.type, "catalogue"); assert.equal(r.el.id, "brand-2", "« Bonobo », pas « Bonobo Jeans » ni « Bonobos »");
r = await choisir("Levi's", [["brand-9", "Levi’s"]], null);
assert.equal(r?.el?.id, "brand-9", "apostrophe typographique = même marque");
r = await choisir("Gerard Darel", [["suggested-brand-4", "Gérard Darel"]], null);
assert.equal(r?.el?.id, "suggested-brand-4", "accents = même marque");

// b) Une marque absente que Vinted propose de créer : la ligne qui la NOMME.
r = await choisir("Zorglub Atelier", [["brand-5", "Zorglub"], ["brand-6", "Atelier"]], "Utiliser « Zorglub Atelier » comme marque", 3000);
assert.equal(r?.type, "libre", "création de LA marque tapée");
r = await choisir("Zorglub Atelier", [["brand-5", "Zorglub"]], "Utiliser « Zorglub » comme marque", 400);
assert.equal(r?.el, undefined, "une ligne de création qui nomme une AUTRE marque n'est jamais cliquée");
assert.equal(r?.type, "aucune");
r = await choisir("Nike", [["brand-7", "Nike ACG"], ["brand-8", "Nikes"]], null, 400);
assert.equal(r?.el, undefined, "« Nike ACG » n'est pas « Nike » : rien n'est cliqué");
assert.deepEqual(r?.suggestions, ["Nike ACG", "Nikes"], "les marques proposées par Vinted remontent dans la question");

// c) Vinted ne connaît pas la marque et n'offre que « Sans marque »
//    (#empty-brand, relevé réel du 03/10) : « inconnue », sans clic.
{
  const t0 = Date.now();
  const v = await choisir("Zorglubia", [], null, 8000, { sansMarque: true });
  assert.equal(v?.type, "inconnue", "seule « Sans marque » proposée → marque inconnue de Vinted");
  assert.equal(v?.el, undefined, "« Sans marque » n'est JAMAIS cliqué à la place de la marque demandée");
  assert.ok(Date.now() - t0 < 6000, "conclu en ~3 s, sans attendre 10 s");
}

// d) (06/10, Ciddjy « Kiabi », Carla « Burano ») Republication : l'id de la
//    marque de l'annonce d'origine est connu (brand_id de la capture).
r = await choisir("Kiabi", [["suggested-brand-60", "Kiabi"], ["brand-61", "Urban Kiabi"]], null, 400, { marqueId: 60 });
assert.equal(r?.el?.id, "suggested-brand-60", "la ligne de la marque d'origine, par son id");
r = await choisir("Kiabi", [["brand-61", "Urban Kiabi"], ["brand-60", "KIABI "]], null, 400, { marqueId: 60 });
assert.equal(r?.el?.id, "brand-60", "par l'id, même si le libellé affiché diffère");
r = await choisir("Kiabi", [["brand-61", "Urban Kiabi"]], null, 400, { marqueId: 60 });
assert.equal(r?.el, undefined, "l'id absent de la liste : jamais une autre marque");
{
  const v = await choisir("Kiabi", [], null, 400, { marqueId: 60, sansMarque: true });
  assert.equal(v?.type, "aucune", "marque d'origine connue : jamais « inconnue » sur une liste encore vide (poste lent)");
}
r = await choisir("Bonobo", [["brand-2", "Bonobo"]], null, 400, { marqueId: null });
assert.equal(r?.el?.id, "brand-2", "sans id (publication) : la ligne exacte, comme avant");

console.log("✓ Vinted : la marque posée est la marque demandée — catalogue exact (ou l'id de la marque d'origine), sinon marque libre, sinon une question ; jamais une autre");
