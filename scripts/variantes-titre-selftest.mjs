// ═══════════════════════════════════════════════════════════════════════════
// Selftest « LA COULEUR ET LE NOMBRE EXCLUENT » (2026-09-23)
//   node scripts/variantes-titre-selftest.mjs
//
// Deux titres qui portent des couleurs (ou des nombres) DIFFÉRENTES désignent
// deux objets : jamais rapprochés, ni par l'alerte de l'écran Publier, ni par
// le faisceau SQL, ni par la garde du jumeau à l'import. Cas fondateurs :
// les kits de Louis (« Rangement Blanc et Noir… » / « … Blanc et Gris… »,
// même photo, 0,89 de recouvrement), les tomes (« tome 1 » / « tome 6 »), les
// âges (« 8 ans » / « 10 ans »).
//
// Deux choses sont prouvées :
//   1. la règle JS (src/utils/variantesTitre.js) sur des cas réels du parc ;
//   2. que la liste des couleurs, des formes et des nuances est LA MÊME, à
//      l'octet, dans la migration SQL (20260924090000) — sinon l'écran
//      promettrait une chose et le moteur en ferait une autre.
// ═══════════════════════════════════════════════════════════════════════════
import fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const { variantesIncompatibles, couleursDuTitre, nombresDuTitre, COULEURS, COULEURS_FORMES, NUANCES } =
  await import(pathToFileURL(join(ROOT, "src/utils/variantesTitre.js")).href);

let ko = 0;
const ok = (nom, cond, detail = "") => { if (!cond) ko++; console.log(`  ${cond ? "ok  " : "KO  "} ${nom}${cond ? "" : `   ← ${detail}`}`); };
const excl = (a, b, motif) => { const r = variantesIncompatibles(a, b); ok(`EXCLU (${motif}) : « ${a.slice(0, 44)} » / « ${b.slice(0, 44)} »`, r.incompatibles && r.motif === motif, JSON.stringify(r)); };
const comp = (a, b) => { const r = variantesIncompatibles(a, b); ok(`compatible : « ${a.slice(0, 44)} » / « ${b.slice(0, 44)} »`, !r.incompatibles, JSON.stringify(r)); };

console.log("\n[1] Les kits de Louis — la couleur seule les distingue");
excl("Rangement Blanc et Noir 12 pour 12 pots et 12 couvercles pour yaourtière Multidélices", "Rangement Blanc et Gris pour 12 pots et 12 couvercles pour yaourtière Multidélices", "couleur");
excl("Rangement Bleu et Vert Pomme pour 12 pots", "Rangement Bleu et Vert pour 12 pots", "couleur");
excl("Rangement Bleu pour 12 pots", "Rangement Bleu et Gris pour 12 pots", "couleur");
excl("12 adaptateurs Gris pour pots La Laitière", "12 adaptateurs Noir pour pots La Laitière", "couleur");
excl("Insert / Rangement Blanc Zombicide 2ᵉ Édition", "Insert / Rangement Bleu Zombicide 2ᵉ Édition", "couleur");
comp("Rangement Blanc et Vert Pomme pour 12 pots et 12 couvercles", "Support de rangement Blanc et Vert Pomme pots et couvercles pour yaourtière");
comp("Support de rangement Gris et Blanc pots et couvercles", "Rangement Blanc et Gris pour 12 pots et 12 couvercles");
ok("« vert pomme » est une phrase, pas « vert »", JSON.stringify(couleursDuTitre("Rangement Bleu et Vert Pomme")) === JSON.stringify(["bleu", "vert pomme"]), JSON.stringify(couleursDuTitre("Rangement Bleu et Vert Pomme")));
ok("« bleu marine » absorbe « marine »", JSON.stringify(couleursDuTitre("Pull bleu marine")) === JSON.stringify(["bleu marine"]), JSON.stringify(couleursDuTitre("Pull bleu marine")));
ok("féminin et pluriel : « robe noire » ↔ « noir »", JSON.stringify(couleursDuTitre("Robe noire")) === JSON.stringify(["noir"]));
ok("« blanc cassé » est une phrase", JSON.stringify(couleursDuTitre("Chemise blanc cassé")) === JSON.stringify(["blanc casse"]));
ok("« Bleu et Bleu Ciel » : deux phrases distinctes", JSON.stringify(couleursDuTitre("Rangement Bleu et Bleu Ciel pour 12 pots")) === JSON.stringify(["bleu", "bleu ciel"]), JSON.stringify(couleursDuTitre("Rangement Bleu et Bleu Ciel pour 12 pots")));

console.log("\n[2] Les nombres — âges, tomes, quantités, pièces");
excl("Livre une, deux, trois princesses tome 1", "Livre une, deux, trois princesses tome 6", "nombre");
excl("Lot livres 8-10-12 ans", "Lot livres 6-8 ans", "nombre");
excl("12 adaptateurs Gris pour pots", "6 adaptateurs Gris pour pots", "nombre");
excl("Puzzle 1000 pièces Disney", "Puzzle 500 pièces Disney", "nombre");
excl("T-shirt Orchestra 8 ans", "T-shirt Orchestra 10 ans", "nombre");
comp("Puzzle vilainous maléfique", "Puzzle vilainous maléfique 1000 pièces");
comp("Clé USB Angry birds blanc 4gb", "Clé USB Angry birds blanc 4Go");
comp("Pull polaire licorne 8 ans", "Pull polaire licorne 8 ans");
comp("Livre sœurs sorcières", "Livre sœurs sorcières livre 1");
comp("Cluedo Conspiration Hasbro", "Hasbro Cluedo Conspiracy Board Game");
ok("nombres lus : « 8-10-12 ans » → 10, 12, 8", JSON.stringify(nombresDuTitre("Lot livres 8-10-12 ans")) === JSON.stringify(["10", "12", "8"]), JSON.stringify(nombresDuTitre("Lot livres 8-10-12 ans")));
// Les décennies (2026-09-25, pichet de Jocabroc : importé en double parce que
// {30} ≠ {1930}). Miroir de public.titre_nombres (migration 20260925150000).
comp("Pichet Art déco années 30 Tchécoslovaquie céramique oiseaux fleurs vintage", "Pichet Art Déco Tchécoslovaquie années 1930 Céramique Oiseaux Fleurs Vintage");
comp("Robe vintage 70s orange", "Robe vintage années 1970 orange");
ok("« années 30 » → 1930", JSON.stringify(nombresDuTitre("Pichet années 30")) === JSON.stringify(["1930"]), JSON.stringify(nombresDuTitre("Pichet années 30")));
ok("« 70s » → 1970", JSON.stringify(nombresDuTitre("Vase 70s")) === JSON.stringify(["1970"]), JSON.stringify(nombresDuTitre("Vase 70s")));
ok("« tome 30 » reste 30 (pas une décennie)", JSON.stringify(nombresDuTitre("Manga tome 30")) === JSON.stringify(["30"]), JSON.stringify(nombresDuTitre("Manga tome 30")));
excl("Manga tome 30", "Manga tome 1930", "nombre");

console.log("\n[3] Rien ne bouge sans couleur ni nombre");
comp("Cartable Caméléon", "Cartable caméléon");
comp("Sac bandoulière teo jasmin", "Petit sac à main teo jasmin");
comp("Figurine Raiponce et Maximus", "Poupée Raiponce et Maximus");
ok("un titre vide ne rend rien", JSON.stringify(variantesIncompatibles("", "Rangement Bleu").couleurs) === JSON.stringify([[], ["bleu"]]) && !variantesIncompatibles("", "Rangement Bleu").incompatibles);

console.log("\n[4] La liste SQL est la même, à l'octet");
{
  const migrations = fs.readdirSync(join(ROOT, "supabase/migrations")).filter((f) => /variantes_de_titre/.test(f)).sort();
  const sql = migrations.length ? fs.readFileSync(join(ROOT, "supabase/migrations", migrations[migrations.length - 1]), "utf8") : "";
  ok("la migration existe", migrations.length > 0, "supabase/migrations/*variantes_de_titre*.sql");
  const listeSql = (bloc) => { const m = sql.match(new RegExp(`-- ⟦${bloc}:début⟧[\\s\\S]*?ARRAY\\[([\\s\\S]*?)\\][\\s\\S]*?-- ⟦${bloc}:fin⟧`)); return m ? m[1].split(",").map((s) => s.trim().replace(/^'|'$/g, "")).filter(Boolean) : null; };
  const couleursSql = listeSql("couleurs");
  ok("COULEURS : JS ≡ SQL", JSON.stringify(couleursSql) === JSON.stringify(COULEURS), `sql=${couleursSql?.length} js=${COULEURS.length}`);
  const nuancesSql = listeSql("nuances");
  ok("NUANCES : JS ≡ SQL", JSON.stringify(nuancesSql) === JSON.stringify(NUANCES), `sql=${nuancesSql?.length} js=${NUANCES.length}`);
  // Les formes : la migration les écrit en VALUES ('blanche','blanc'), …
  const m = sql.match(/-- ⟦couleurs-formes:début⟧([\s\S]*?)-- ⟦couleurs-formes:fin⟧/);
  const formesSql = m ? Object.fromEntries([...m[1].matchAll(/\('([a-z]+)',\s*'([a-z]+)'\)/g)].map((x) => [x[1], x[2]])) : null;
  ok("COULEURS_FORMES : JS ≡ SQL", JSON.stringify(formesSql) === JSON.stringify(COULEURS_FORMES), `sql=${formesSql && Object.keys(formesSql).length} js=${Object.keys(COULEURS_FORMES).length}`);
}

console.log(ko === 0 ? "\n[selftest:variantes-titre] OK\n" : `\n[selftest:variantes-titre] ÉCHEC — ${ko} vérification(s) en défaut.\n`);
process.exit(ko === 0 ? 0 : 1);
