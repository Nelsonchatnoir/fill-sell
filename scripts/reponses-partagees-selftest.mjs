// Une réponse va là où elle est demandée ; la marque de la fiche n'est jamais
// redemandée (03/10, cas Ornella — fiche 1791047123870 relue en base).
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  marqueDeLaFiche, marqueUtilisable, comblerMarquesVides, ciblesDeLaReponse, ecrireReponsePartagee,
} from "../src/publication/moteur/reponsesPartagees.js";

const FICHE = JSON.parse(fs.readFileSync(new URL("./fixtures/fiche-ornella-pull-0310.json", import.meta.url), "utf8")).fiche;
const overrides = Object.fromEntries(Object.entries(FICHE.sharedOverrides).map(([k, v]) => [k, new Set(v)]));

// 1. L'impasse d'Ornella, rejouée : AVANT, la valeur commune n'atteignait
//    pas la copie Vinted verrouillée (le comportement de setSharedField).
assert.equal(FICHE.edited.vinted.platform_fields.marque, "B");
assert.ok(overrides.vinted.has("marque"));
{
  const avant = ecrireReponsePartagee({ edited: FICHE.edited, overrides, key: "marque", value: "Bonobo", cibles: [] });
  assert.equal(avant.edited.vinted.platform_fields.marque, "B", "sans cible : la copie verrouillée reste sur « B » (l'impasse)");
}
// APRÈS : la question nomme Vinted → la réponse l'atteint, frappe après frappe.
let edited = FICHE.edited; let ov = overrides; let vis = [];
for (const v of ["B", "Bo", "Bon", "Bonobo"]) {
  const manquants = marqueUtilisable(edited.vinted.platform_fields.marque) ? [] : [{ key: "marque", platforms: ["vinted"] }];
  vis = ciblesDeLaReponse(manquants, "marque", vis, edited);
  ({ edited, overrides: ov } = ecrireReponsePartagee({ edited, overrides: ov, key: "marque", value: v, cibles: vis }));
}
assert.equal(edited.vinted.platform_fields.marque, "Bonobo", "la copie Vinted reçoit la réponse entière");
assert.equal(edited.opla.platform_fields.marque, "Bonobo", "la copie Opla (« B », verrouillée, non nommée) aussi : elle n'avait rien à protéger");
assert.ok(!ov.vinted.has("marque") && ov.vinted.has("matiere"), "le verrou saute pour la marque seulement");
// Une copie verrouillée qui porte une VRAIE valeur propre ne bouge pas.
{
  const e = { vinted: { platform_fields: { marque: "" } }, ebay: { platform_fields: { marque: "Levi Strauss & Co." } } };
  const o = { ebay: new Set(["marque"]) };
  const c = ciblesDeLaReponse([{ key: "marque", platforms: ["vinted"] }], "marque", [], e);
  const r = ecrireReponsePartagee({ edited: e, overrides: o, key: "marque", value: "Levi's", cibles: c });
  assert.equal(r.edited.ebay.platform_fields.marque, "Levi Strauss & Co.", "la valeur choisie exprès sur eBay reste");
  assert.equal(r.edited.vinted.platform_fields.marque, "Levi's");
}
// Taille : une lettre EST une réponse.
assert.deepEqual(ciblesDeLaReponse([], "taille", [], { vinted: { platform_fields: { taille: "M" } } }), []);

// 2. La marque de la fiche comble une copie vide ou d'une lettre, jamais une marque posée.
assert.equal(marqueDeLaFiche({ marque: "Bonobo" }), "Bonobo");
assert.equal(marqueDeLaFiche({ marque: "B", attributs: { marque: { v: "Bonobo", source: "manuel" } } }), "Bonobo");
assert.equal(marqueDeLaFiche({ marque: null }), null);
{
  const { edited: e, comblees } = comblerMarquesVides(FICHE.edited, "Bonobo");
  assert.deepEqual(comblees.sort(), ["opla", "vinted"]);
  assert.equal(e.vinted.platform_fields.marque, "Bonobo");
  assert.equal(e.leboncoin.platform_fields.marque, FICHE.edited.leboncoin.platform_fields.marque, "une copie qui porte une marque n'est jamais touchée");
}
{
  const e = { vinted: { platform_fields: { marque: "", vintedAspects: { brand: "Nike" } } } };
  assert.equal(comblerMarquesVides(e, "Bonobo").edited, e, "la marque lue ailleurs par l'extension (vintedAspects.brand) compte");
}
assert.equal(comblerMarquesVides(FICHE.edited, "B").edited, FICHE.edited, "une lettre sur la fiche ne comble rien");

// 3. Le câblage.
const lps = fs.readFileSync(new URL("../src/components/ListingPreviewScreen.jsx", import.meta.url), "utf8");
const bq = fs.readFileSync(new URL("../src/publication/BlocQuestions.jsx", import.meta.url), "utf8");
const carte = fs.readFileSync(new URL("../src/components/CarteRayon.jsx", import.meta.url), "utf8");
assert.match(bq, /const repondre = \(key, v\) => \(m\.repondreChampPartage \?\? m\.setSharedField\)\(key, v\);/);
assert.doesNotMatch(bq, /m\.setSharedField\(key, /, "plus aucune réponse partagée par l'écriture qui saute les copies verrouillées");
assert.match(lps, /useState\(\(\) => comblerMarqueFiche\(draft\?\.edited \?\? \{\}\)\)/, "brouillon : marque de la fiche");
assert.match(lps, /setEdited\(comblerMarqueFiche\(f\.edited\)\)/, "fiche rouverte : marque de la fiche");
assert.match(lps, /Object\.assign\(initialEdited, comblerMarqueFiche\(initialEdited\)\)/, "rédaction : marque de la fiche");
assert.match(lps, /if \(a\.dedicatedTarget && sharedOverrides\[gp\]\?\.has\(a\.dedicatedTarget\)\) continue;/, "un champ vidé à la main n'est pas reposé");
assert.match(lps, /\.\.\.missingSharedFieldsDetailed\.flatMap\(f => f\.platforms \?\? \[\]\)/, "« Continuer sans X » pour un champ partagé");
assert.match(carte, /const saisieLibre = \(e\) => platform === 'vinted'/, "carte Vinted : la marque se tape");
assert.match(carte, /connusEpingles/, "carte : un champ corrigé reste à sa place");

console.log("✓ réponses partagées : la réponse atteint la plateforme qui la demande ; la marque de la fiche n'est jamais redemandée");
