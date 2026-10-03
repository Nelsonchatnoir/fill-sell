// La marque Vinted se pose TELLE QUELLE (03/10, règle de Nico) : la ligne
// EXACTE du catalogue, sinon « Utiliser "X" comme marque » — jamais une marque
// approchante, jamais « Sans marque » à la place d'une vraie marque.
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
assert.match(corps, /texteComparable\(posee\) === texteComparable\(demandee\)/, "la relecture compare #brand à LA marque demandée");
assert.doesNotMatch(corps, /nearest|approch|includes\(cible\)|startsWith\(cible\)/i, "aucun rapprochement");

// ── 2. Le comportement : la vraie fonction sur un faux panneau ─────────────
const texteComparable = new Function(`${extraireFonctionJs(src, "texteComparable")}; return texteComparable;`)();
const fabriquer = new Function("document", "sel", "sleep", "texteComparable",
  `${extraireFonctionJs(src, "attendreChoixMarque")}; return attendreChoixMarque;`);
function panneau(lignes, libre = null) {
  const els = lignes.map(([id, label]) => ({ id, getAttribute: (a) => (a === "aria-label" ? label : null), textContent: label }));
  const document = { querySelectorAll: () => els };
  const elLibre = libre ? { id: "custom-select-brand", textContent: libre } : null;
  const sel = async () => ({
    resolveSelector: () => { if (!elLibre) { const e = new Error("absent"); e.name = "SelectorResolutionError"; throw e; } return { el: elLibre }; },
  });
  return { document, sel, elLibre };
}
const dormir = (ms) => new Promise((r) => setTimeout(r, Math.min(ms, 5)));
async function choisir(marque, lignes, libre, timeout = 400) {
  const p = panneau(lignes, libre);
  const f = fabriquer(p.document, p.sel, dormir, texteComparable);
  return { r: await f(marque, timeout), p };
}

// a) La marque du catalogue : la ligne exacte, même aux accents/apostrophes près.
let { r } = await choisir("Bonobo", [["brand-1", "Bonobo Jeans"], ["brand-2", "Bonobo"], ["suggested-brand-3", "Bono"]], null);
assert.equal(r?.type, "catalogue"); assert.equal(r.el.id, "brand-2", "« Bonobo », pas « Bonobo Jeans »");
({ r } = await choisir("Levi's", [["brand-9", "Levi’s"]], null));
assert.equal(r?.el.id, "brand-9", "apostrophe typographique = même marque");
({ r } = await choisir("Gerard Darel", [["suggested-brand-4", "Gérard Darel"]], null));
assert.equal(r?.el.id, "suggested-brand-4", "accents = même marque");

// b) Une marque absente : la ligne de création qui la NOMME, rien d'autre.
({ r } = await choisir("Zorglub Atelier", [["brand-5", "Zorglub"], ["brand-6", "Atelier"]], 'Utiliser « Zorglub Atelier » comme marque', 3000));
assert.equal(r?.type, "libre", "création de LA marque tapée");
({ r } = await choisir("Zorglub Atelier", [["brand-5", "Zorglub"]], 'Utiliser « Zorglub » comme marque', 400));
assert.equal(r, null, "une ligne de création qui nomme une AUTRE marque n'est jamais cliquée");
({ r } = await choisir("Nike", [["brand-7", "Nike ACG"], ["brand-8", "Nikes"]], null, 400));
assert.equal(r, null, "« Nike ACG » n'est pas « Nike » : rien n'est choisi (échec avant dépôt)");
// La ligne « Sans marque » native (#empty-brand) n'est jamais une réponse.
({ r } = await choisir("Kodak", [["empty-brand", "Sans marque"]], null, 400));
assert.equal(r, null, "« Sans marque » n'est jamais pris pour une vraie marque");

console.log("✓ Vinted : la marque posée est la marque demandée — catalogue exact, sinon marque libre, jamais une autre");
