// UNE ANNONCE LEBONCOIN « VENDUE AVANT LE SUIVI », TOUJOURS EN LIGNE, SE REPUBLIE (08/11, point 4 — Jess)
//   node scripts/republication-vendue-avant-suivi-selftest.mjs
// Cas : jessica.alhiane, câble USB-C (fiche 1794077239905, annonce 3178619102 « Unité ou Lot », en ligne) : quatre refus
// « annonce_introuvable » (07/11 21:03, 21:14, 22:12 ; 08/11 12:09). republication_annonce_partie lisait le badge « sold »
// que Leboncoin garde dès la première lecture — une vente d'avant le suivi, déjà écartée des ventes depuis le 03/11
// (leboncoin_vendu_avant_suivi, issue « vendu_avant_suivi »). Preuve de bout en bout : scripts/preuve-ayadi-0811.mjs.
import fs from "node:fs";

const lire = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");
let n = 0, ko = 0;
const ok = (c, m) => { n++; if (c) console.log(`  ✓ ${m}`); else { ko++; console.log(`  ✗ ${m}`); } };
const m = lire("supabase/migrations/20261108142000_republication_vendue_avant_suivi.sql");
const corps = m.slice(m.indexOf("CREATE OR REPLACE FUNCTION public.republication_annonce_partie("));
const branche = corps.slice(corps.indexOf("WHEN EXISTS ("), corps.indexOf("THEN 'annonce_vendue'"));

ok(/AND a\.transaction_plateforme = 'sold'\s*(--[^\n]*\n\s*)*AND NOT \(a\.platform = 'leboncoin' AND a\.statut_plateforme = 'en_ligne' AND a\.disparu_le IS NULL\s*AND public\.leboncoin_vendu_avant_suivi\(a\.user_id, a\.listing_id\)\)\)/.test(branche),
  "le badge « sold » ne compte plus quand Leboncoin le portait dès la première lecture ET que l'annonce est vue en ligne");
ok(/x\.platform_fields ->> 'sale_signal' = 'sold'/.test(branche) && /verdicts d/.test(branche), "les deux autres preuves de vente (page lue « vendue », verdict du juge) inchangées");
ok(corps.split("public.leboncoin_vendu_avant_suivi(").length - 1 === 1, "une seule exception (un seul appel), dans la première branche");
ok(/THEN 'annonce_partie'/.test(corps) && /constats AS \(/.test(corps), "« annonce_partie » (verdicts, constats) : lignes d'avant, inchangées");
ok(/md5\(v_d\) <> 'b58d4f684b16b34ab20a4c631c9bea01'/.test(m) && /to_regprocedure\('public\.leboncoin_vendu_avant_suivi\(uuid,text\)'\) IS NULL/.test(m), "garde md5 de la prod du 08/11, et la règle du 03/11 doit exister");
ok(fs.existsSync(new URL("../supabase/rollbacks/20261108142000_republication_vendue_avant_suivi_INVERSE.sql", import.meta.url)), "inverse présent");

console.log(ko ? `\n✗ ${ko} échec(s) sur ${n}` : `\n✓ ${n}/${n} — une vente d'avant le suivi n'interdit pas la republication`);
process.exit(ko ? 1 : 0);
