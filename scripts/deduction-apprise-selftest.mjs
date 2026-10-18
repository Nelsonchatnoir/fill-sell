// Selftest — correspondances apprises, mode fantôme, bascule automatique (18/10, lot 2).
//   npm run selftest:deduction-apprise
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { categorieApprise, catalogueVintedDeLaFiche, propositionApprise, ligneATrancher, chargerApprises, noterDeduction, _oublierApprises, PLATEFORMES_APPRISES } from "../src/publication/moteur/apprises.js";

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => fs.readFileSync(path.join(RACINE, p), "utf8").replace(/\r\n/g, "\n");
let n = 0;
const cas = async (nom, f) => { await f(); n++; console.log(`  ✓ ${nom}`); };
console.log("deduction-apprise-selftest");

await cas("la catégorie rangée comme la base la range : la feuille ; eBay : son numéro", () => {
  assert.equal(categorieApprise("leboncoin", "Mode > Vêtements"), "Vêtements");
  assert.equal(categorieApprise("beebs", "Mode > Bébé > Vêtements (bébé) > Pyjamas (bébé)"), "Pyjamas (bébé)");
  assert.equal(categorieApprise("ebay", "79654"), "79654");
  assert.equal(categorieApprise("leboncoin", ""), "");
  assert.equal(catalogueVintedDeLaFiche({ vinted_catalog_id: 1234 }), "1234");
  assert.equal(catalogueVintedDeLaFiche({ attributs: { categorie_vinted: { v: "77" } } }), "77");
  assert.equal(catalogueVintedDeLaFiche({ attributs: { categorie_vinted: { v: "Femmes" } } }), "");
  assert.deepEqual([...PLATEFORMES_APPRISES], ["leboncoin", "beebs", "ebay"]);
});

await cas("une proposition seulement dans LA liste de la plateforme, écrite comme la liste l'écrit ; jamais une valeur inventée", () => {
  const apprises = { clothing_type: { valeur: "femme", etat: "actif", n: 12, comptes: 3, source: "vinted" } };
  const ligne = { key: "clothing_type", state: "missing", allowedValues: ["Femme", "Homme", "Enfant"] };
  assert.deepEqual(propositionApprise(ligne, apprises), { valeur: "Femme", etat: "actif", source: "apprise:vinted", n: 12, comptes: 3 });
  assert.equal(propositionApprise({ ...ligne, allowedValues: ["Homme", "Enfant"] }, apprises), null, "hors liste : rien");
  assert.equal(propositionApprise(ligne, { clothing_type: { valeur: "Femme", etat: "eteint" } }), null, "champ éteint : rien");
  assert.equal(propositionApprise({ name: "Type", state: "missing", allowedValues: [] }, { Type: { valeur: "Robe", etat: "fantome", source: "categorie" } }).etat, "fantome");
  assert.equal(propositionApprise(ligne, null), null);
});

await cas("un champ déjà décidé (fiche, texte, mémoire, la personne) n'est jamais touché", () => {
  assert.equal(ligneATrancher({ state: "missing" }), true);
  assert.equal(ligneATrancher({ state: "missing", deduit: { valeur: "Femme", source: "fiche:genre" } }), false);
  assert.equal(ligneATrancher({ state: "ok", value: "Femme" }), false);
  assert.equal(ligneATrancher({ state: "invalid", suggested: "Femme" }), false);
  assert.equal(ligneATrancher({ state: "invalid" }), true);
});

await cas("une lecture partagée par (plateforme, catégorie, catalogue) ; le journal une fois par article et champ", async () => {
  _oublierApprises();
  let appels = 0; const inserts = [];
  const supabase = {
    rpc: async (f, a) => { appels++; assert.equal(f, "deduction_apprise_pour"); assert.equal(a.p_categorie, "Vêtements"); return { data: { clothing_type: { valeur: "Femme", etat: "fantome" } }, error: null }; },
    from: () => ({ insert: (row) => { inserts.push(row); return { then: (f) => f({ error: null }) }; } }),
  };
  const a = await chargerApprises(supabase, { platform: "leboncoin", categorie: "Mode > Vêtements", vintedCatalog: "1234" });
  const b = await chargerApprises(supabase, { platform: "leboncoin", categorie: "Mode > Vêtements", vintedCatalog: "1234" });
  assert.equal(appels, 1);
  assert.deepEqual(a, b);
  assert.deepEqual(await chargerApprises(supabase, { platform: "vinted", categorie: "x" }), {}, "Vinted n'apprend pas d'elle-même");
  assert.equal(noterDeduction(supabase, "u1", { sorte: "fantome", platform: "leboncoin", champ: "clothing_type", valeur: "Femme", categorie: "Vêtements", inventaireId: 9 }), true);
  assert.equal(noterDeduction(supabase, "u1", { sorte: "fantome", platform: "leboncoin", champ: "clothing_type", valeur: "Femme", categorie: "Vêtements", inventaireId: 9 }), false);
  assert.equal(inserts.length, 1);
  assert.equal(inserts[0].feature, "deduction_fantome");
  assert.equal(noterDeduction(supabase, "u1", { sorte: "posee", platform: "leboncoin", champ: "clothing_type", valeur: "Femme", inventaireId: 9 }), true);
  assert.equal(inserts[1].feature, "deduction_apprise_posee");
  assert.equal(noterDeduction(supabase, null, { sorte: "fantome", platform: "leboncoin", champ: "x", valeur: "y", inventaireId: 9 }), false);
});

await cas("le stepper : après la fiche, le texte et la mémoire ; fantôme noté sans rien toucher ; « actif » posé ; télémétrie qui attend la lecture", () => {
  const L = lire("src/components/ListingPreviewScreen.jsx");
  assert.ok(/if \(!r\?\.valeur\) return avecApprise\(a\);/.test(L), "après la mémoire");
  assert.ok(/function avecApprise\(a\) \{\n        if \(!ligneATrancher\(a\)\) return a;\n        const app = propositionApprise\(a, apprisesParPf\?\.\[platform\]\);\n        if \(app\?\.etat !== "actif"\) return a;/.test(L), "seul « actif » pose");
  assert.ok(/const app = propositionApprise\(manquant, apprisesParPf\?\.ebay\);\n        if \(app\?\.etat === "actif"\)/.test(L), "eBay : après la mémoire, actif seulement");
  assert.ok(/if \(app\?\.etat === "fantome"\) noterDeduction\(supabase, userId, \{ sorte: "fantome"/.test(L), "fantôme : noté");
  assert.ok(/plateformesPubliables\.has\(p\)/.test(L) && !/plateformesPubliables\.includes\(/.test(L), "plateformesPubliables est un Set");
  assert.ok(/const memoireRetenue = memoireCat === null \|\| apprisesParPf === null;/.test(L));
});

await cas("la base : règle stricte, champs interdits, fantôme avant actif, bascule et retour arrière CODÉS, inverse présent", () => {
  const M = lire("supabase/migrations/20261018120000_deduction_apprise_budget_ia.sql");
  assert.ok(/HAVING count\(DISTINCT lower\(valeur\)\) = 1 AND count\(DISTINCT inventaire_id\) >= 4 AND count\(DISTINCT user_id\) >= 2;/.test(M));
  assert.ok(/HAVING count\(DISTINCT lower\(valeur\)\) = 1 AND count\(DISTINCT inventaire_id\) >= 8 AND count\(DISTINCT user_id\) >= 3;/.test(M));
  for (const interdit of ["condition", "brand", "couleur", "taille", "mati", "poids", "longueur", "isbn", "ean"]) assert.ok(M.includes(interdit), `interdit : ${interdit}`);
  assert.ok(/r\.premier_fantome < now\(\) - interval '48 hours' AND r\.f_n >= 15 AND r\.f_justes = r\.f_n/.test(M), "allumage : 48 h, 15 cas, 100 %");
  assert.ok(/r\.p_n >= 10 AND r\.p_justes::numeric \/ r\.p_n < 0\.97/.test(M), "retour arrière : < 97 %");
  assert.ok(/\+ 0\.15/.test(M), "retour arrière : refus +15 points");
  assert.ok(/WHERE auth\.uid\(\) IS NOT NULL AND d\.platform = p_platform/.test(M), "l'app lit avec sa session");
  assert.ok(/etat IN \('fantome', 'actif'\)/.test(M));
  assert.ok(!/'actif', '\{"test"/.test(M), "aucun champ ne naît « actif »");
  assert.ok(fs.existsSync(path.join(RACINE, "supabase/rollbacks/20261018120000_deduction_apprise_budget_ia.sql")));
});

await cas("le banc figé : chaque champ servi a fait 0 faux ; les champs semés « fantome » sont exactement ceux du banc", () => {
  const B = JSON.parse(lire("docs/enquetes/zero-orange-1810/banc-deduction.json"));
  const servis = B.champs.filter((c) => c.servi).map((c) => `${c.platform}|${c.champ}`).sort();
  for (const c of B.champs.filter((x) => x.servi)) assert.equal(c.faux, 0, `${c.platform} ${c.champ}`);
  const M = lire("supabase/migrations/20261018120000_deduction_apprise_budget_ia.sql");
  const semes = [...M.matchAll(/\('(leboncoin|beebs|ebay)', '([^']+)', 'fantome'/g)].map((m) => `${m[1]}|${m[2]}`).sort();
  assert.deepEqual(semes, servis);
});

console.log(`deduction-apprise-selftest : ${n} cas verts`);
