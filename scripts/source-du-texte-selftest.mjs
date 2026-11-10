// Autotest de src/utils/sourceDuTexte.js — le texte du vendeur n'est jamais réécrit (29/10, lot B partie 2).
//   node scripts/source-du-texte-selftest.mjs
// Cas relevés en base le 29/10 : paugues.contact « Jazz man » 1793117541271 (fiche tapée au Stock, origine NULL,
// aucun marqueur → réécrite par l'IA le 27/10 à 17:12:36), un résultat Lens (notre brouillon), un relevé Beebs.
import {
  champDuVendeur, texteDuVendeurDeLaFiche, marqueursDeNaissance, estLigneDuStock, MARQUES_FILLSELL, redactionHorsQuota,
} from "../src/utils/sourceDuTexte.js";
import { texteDuVendeurDe } from "../src/publication/texteDeLaFiche.js";
import { readFileSync } from "node:fs";

let ko = 0;
const ok = (cond, nom) => { if (cond) console.log(`  ✓ ${nom}`); else { ko++; console.log(`  ✗ ${nom}`); } };

console.log("1. La fiche tapée au Stock est le texte du vendeur (Jazz man)");
const jazz = { titre: "Jazz man - Peinture acrylique", description: "Peinture acrylique, deux musiciens de jazz. Travail amateur. 41 x 33 cm.", origine: null, attributs: null };
ok(estLigneDuStock(jazz), "une ligne du stock porte la clé origine (même nulle)");
ok(champDuVendeur(jazz, "titre") && champDuVendeur(jazz, "description"), "aucun marqueur, origine NULL → titre et description du vendeur");
ok(texteDuVendeurDeLaFiche(jazz).description === jazz.description, "sa description revient telle quelle");
ok(texteDuVendeurDe(jazz).titre === jazz.titre, "texteDeLaFiche.js suit la même règle");

console.log("2. Notre brouillon reste notre brouillon");
for (const m of MARQUES_FILLSELL) {
  const f = { ...jazz, attributs: { titre_source: { v: m }, description_source: { v: m } } };
  ok(!champDuVendeur(f, "titre") && !champDuVendeur(f, "description"), `marque « ${m} » → l'IA garde la main`);
}
const lens = { titre: "Peinture acrylique jazz", description: "Peinture acrylique représentant deux joueurs de jazz.", verdict: "bon" };
ok(!estLigneDuStock(lens) && !champDuVendeur(lens, "description"), "un résultat Lens (pas une ligne du stock) n'est pas un texte du vendeur");
ok(champDuVendeur({ ...lens, attributs: { description_source: { v: "manuel" } } }, "description"), "… sauf s'il le dit par un marqueur « manuel »");
ok(!champDuVendeur(jazz, "titre", { ligneDuStock: false }), "item_data sans marqueur (ligneDuStock:false) → notre brouillon");

console.log("3. Les règles d'avant tiennent");
ok(champDuVendeur({ titre: "a b", origine: "releve_beebs", attributs: { titre_source: { v: "lens" } } }, "titre"), "origine d'un relevé : toujours le vendeur (même marqué lens)");
ok(champDuVendeur({ titre: "a b", origine: "vinted_sync", attributs: null }, "titre"), "dressing Vinted : le vendeur");
ok(champDuVendeur({ titre: "a b", attributs: { titre_source: { v: "vinted" } } }, "titre"), "marqueur vinted : le vendeur");
ok(texteDuVendeurDeLaFiche({ ...jazz, description: "Pull" }).description === "", "un seul mot ne dit rien : l'IA peut compléter (07/09)");
ok(texteDuVendeurDeLaFiche(null).titre === "", "pas de fiche → rien");

console.log("4. Les marqueurs de naissance");
const m = marqueursDeNaissance({ titre: "Jazz man", description: "" }, "manuel", "2026-10-29T18:00:00Z");
ok(m.titre_source?.v === "manuel" && !m.description_source, "seuls les champs non vides sont marqués");
ok(marqueursDeNaissance({ titre: "x", description: "y z" }, "lens").description_source?.v === "lens", "source lens");

console.log("5. Les chemins de création posent leur marqueur");
const app = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
ok((app.match(/marqueursDeNaissance\(/g) ?? []).length >= 3, "App.jsx : ajout manuel, ajout depuis la modale, Lens marquent leur texte à la naissance");
const fa = readFileSync(new URL("../supabase/functions/_shared/fiche-article.ts", import.meta.url), "utf8");
ok(/marqueursDeNaissance\(\{ titre: titreBrut, description: a\.description \}, a\.sourceTexte \?\? "lens"\)/.test(fa), "serveur : la fiche née d'un scan porte « lens »");
const gl = readFileSync(new URL("../supabase/functions/generate-listing/index.ts", import.meta.url), "utf8");
ok(/champDuVendeur\(/.test(gl) && /const ligneDuStock = !item_data;/.test(gl), "generate-listing : même règle que l'écran");

console.log("6. (10/11) Titre ET description du vendeur : passe légère, hors quota d'annonces");
// Compte d0ac0538 (Free) le 10/11 : 5 imports Vinted (titre et description de SON annonce) comptés 5 sur 5.
const vinted = { titre: "Manteau jacadi 6 ans en parfait état", description: "Manteau Jacadi bleu marine, porté une saison, très bon état.", origine: "vinted_sync", attributs: null };
ok(redactionHorsQuota(vinted, { ligneDuStock: true }), "import Vinted avec titre et description : aucune annonce");
ok(redactionHorsQuota(jazz, { ligneDuStock: true }), "fiche tapée au stock (titre et description) : aucune annonce");
ok(!redactionHorsQuota({ ...vinted, description: "" }, { ligneDuStock: true }), "import sans description encore lue : l'IA l'écrirait → compte");
ok(redactionHorsQuota({ ...vinted, description: "" }, { ligneDuStock: true, descriptionALire: true }), "… sauf si sa description d'origine sera lue avant (descriptionALire)");
ok(!redactionHorsQuota({ ...jazz, description: "" }, { ligneDuStock: true }), "fiche tapée sans description : l'IA rédige → compte");
ok(!redactionHorsQuota({ ...vinted, titre: "Manteau" }, { ligneDuStock: true }), "titre d'un seul mot : l'IA reprend le titre → compte");
for (const mq of MARQUES_FILLSELL) ok(!redactionHorsQuota({ ...jazz, attributs: { titre_source: { v: mq }, description_source: { v: mq } } }, { ligneDuStock: true }), `texte marqué « ${mq} » (le nôtre) → compte`);
ok(!redactionHorsQuota(lens, { ligneDuStock: false }), "résultat Lens (item_data sans marqueur) → compte");
ok(!redactionHorsQuota(null), "rien → compte (prudence)");
ok(/const passeLegere = Boolean\(titreVendeur\) && Boolean\(descriptionVendeuse\);/.test(gl) && /passeLegere\s*\n\s*\? \{ data: \{ allowed: true, price: 0, passe_legere: true \}/.test(gl), "generate-listing : la passe légère ne passe pas au guichet du quota");
ok(gl.indexOf("const passeLegere") > 0 && gl.indexOf("const passeLegere") < gl.indexOf('.rpc("spend_coins_for_generate"'), "generate-listing : la fiche est lue AVANT le guichet");
const mig = readFileSync(new URL("../supabase/migrations/20261110170000_annonces_texte_vendeur_hors_quota.sql", import.meta.url), "utf8");
ok((mig.match(/COALESCE\((u|prev)\.metadata->>'texte_vendeur_titre', ''\) = 'true'/g) ?? []).length === 3, "migration : la passe légère sort du décompte, de la dédup 24 h et de la « régénération » du guichet");
const lotSrc = readFileSync(new URL("../src/publication/lot/LotPublication.jsx", import.meta.url), "utf8");
ok(/consomme: \(d\) => !ficheCouvre\([^\n]*\n\s*&& !redactionHorsQuota\(d\.item/.test(lotSrc), "mur du lot : un import au texte du vendeur ne prend pas d'annonce");
const step = readFileSync(new URL("../src/publication/StepperNouveau.jsx", import.meta.url), "utf8");
ok(/annonces: redactionIA && !m\.texteHorsQuota \? 1 : 0/.test(step), "« Où publier ? » : ne compte ni ne bloque la passe légère");
const stock = readFileSync(new URL("../src/tabs/StockTab.jsx", import.meta.url), "utf8");
ok(/aRediger=\{lotARediger\}/.test(stock), "barre de sélection du Stock : « il te reste N annonces » ne compte que les articles à rédiger");

console.log("7. (10/11 soir) La fiche du STOCK de l'app (mapItem : `title`, pas `titre`) — mur du lot, barre du Stock");
// van.nessa d0ac0538 (Free, 3 annonces restantes) : 10 imports Vinted reportés à tort par le mur à 19:05, 19:13, 19:22 —
// le mur et la barre reçoivent les fiches mises en forme par mapItem (App.jsx), où le titre s'appelle `title`.
const mapItemSrc = app.slice(app.indexOf("function mapItem(v){"), app.indexOf("function mapItem(v){") + 4000);
ok(/title:v\.titre/.test(mapItemSrc) && !/[{,]\s*titre:/.test(mapItemSrc), "mapItem range le titre sous `title` (aucune clé `titre`)");
ok(/description:v\.description\|\|""/.test(mapItemSrc) && /attributs:v\.attributs\?\?null/.test(mapItemSrc) && /origine:v\.origine\|\|null/.test(mapItemSrc),
  "mapItem garde description, attributs, origine (la règle les lit)");
const commeMapItem = (r) => ({ id: r.id, title: r.titre, description: r.description || "", attributs: r.attributs ?? null, origine: r.origine || null, quantite: 1, statut: "stock" });
const opts = (i) => ({ ligneDuStock: true, descriptionALire: i.origine === "vinted_sync" });
const sesImports = [
  ["Doudoune légère de grossesse", "Doudoune légère de grossesse, portée deux fois, très bon état, taille M."],
  ["Jean DPAM 6 ans", "Jean DPAM taille 6 ans, très bon état, aucun défaut visible."],
  ["Jegging doublé 6 ans okaïdi", "Jegging doublé okaïdi taille 6 ans, chaud pour l'hiver."],
  ["Tee-shirt manches longues Licornes Dpam", "Tee-shirt DPAM licornes, manches longues, 6 ans."],
  ["Pantalon bleu élastiqué sergent Major", "Pantalon Sergent Major bleu, taille élastiquée, 6 ans."],
  ["Manteau court 7 ans mango", "Manteau court Mango 7 ans, très bon état."],
  ["Jolie gilet petit bateau 6 ans", "Gilet Petit Bateau 6 ans, très bon état."],
  ["Blouse sezane taille 40", "Blouse Sézane taille 40, portée une fois."],
  ["Sweat court mango kids", "Sweat court Mango kids."],
].map(([titre, description], k) => commeMapItem({ id: `179430808${k}`, titre, description, origine: "vinted_sync", attributs: { description_source: { v: "vinted" } } }));
ok(sesImports.every((i) => redactionHorsQuota(i, opts(i))), "ses 9 imports Vinted (fiche du Stock, `title`) : aucune annonce");
ok(redactionHorsQuota({ ...sesImports[0], description: "" }, opts(sesImports[0])), "import dont la description d'origine sera lue avant (description vide au Stock) : aucune annonce");
ok(!redactionHorsQuota({ ...sesImports[0], description: "" }, { ligneDuStock: true }), "… sans lecture prévue : l'IA l'écrirait → compte");
ok(!redactionHorsQuota(commeMapItem({ id: "x", titre: "Veste", description: "Veste noire adidas trois bandes.", origine: "vinted_sync" }), { ligneDuStock: true }), "titre d'un seul mot (fiche du Stock) → compte");
ok(!redactionHorsQuota({ ...sesImports[1], attributs: { titre_source: { v: "lens" }, description_source: { v: "lens" } }, origine: null }, { ligneDuStock: true }), "fiche Lens au Stock (marque « lens ») → compte");
ok(redactionHorsQuota({ titre: "Jean DPAM 6 ans", title: "autre", description: "Jean DPAM taille 6 ans, très bon état.", origine: "vinted_sync" }, { ligneDuStock: true }), "ligne de la base (`titre`) : inchangée");
// Le partage du mur (regles.partagerQuota, avec la grille à 3 jauges) sur SON lot de 19:22 : 9 articles, 3 annonces restantes.
const { partagerQuota } = await import("../src/publication/lot/regles.js");
const donnees = sesImports.map((item) => ({ id: String(item.id), item }));
const consomme = (d) => !redactionHorsQuota(d.item, { ligneDuStock: true, descriptionALire: d.item.origine === "vinted_sync" });
const jauges = { annonces: { cle: "annonces", illimite: false, restantes: 3, plafond: 5 }, publications: { cle: "publications", illimite: false, restantes: 20, plafond: 40 } };
const p = partagerQuota(donnees, { restantes: 3, consomme, jauges, plateformes: () => 2 });
ok(p.maintenant.length === 9 && p.plusTard.length === 0 && p.aConsommer === 0 && p.bloque === null, `mur de son lot (9 imports, 3 restantes, 2 plateformes) : 9 retenus, 0 reporté, 0 annonce (${p.maintenant.length}/${p.plusTard.length}/${p.aConsommer})`);
const avecLens = [...donnees, ...[1, 2, 3, 4].map((k) => ({ id: `lens${k}`, item: { ...commeMapItem({ id: `lens${k}`, titre: "Veste à capuche adidas", description: "Veste à capuche zippée adidas noire.", origine: null }), attributs: { titre_source: { v: "lens" }, description_source: { v: "lens" } } } }))];
const q = partagerQuota(avecLens, { restantes: 3, consomme, jauges: { ...jauges, publications: { ...jauges.publications, restantes: 100 } }, plateformes: () => 2 });
ok(q.maintenant.length === 12 && q.plusTard.length === 1 && q.aConsommer === 3 && q.bloque === "annonces", "9 imports + 4 fiches Lens, 3 restantes : 12 retenus, 1 Lens reporté (seules les rédactions IA comptent)");
const q2 = partagerQuota(donnees, { restantes: 3, consomme });
ok(q2.maintenant.length === 9 && q2.plusTard.length === 0, "sans la grille (partage d'avant) : même verdict");
const lot = readFileSync(new URL("../src/publication/lot/LotPublication.jsx", import.meta.url), "utf8");
ok(/!redactionHorsQuota\(d\.item, \{ ligneDuStock: true, descriptionALire: Boolean\(plateformeOrigine\(d\.item\)\) \}\)/.test(lot), "le mur passe la fiche du Stock (d.item) à la règle");
ok(/redactionHorsQuota\(i, \{ ligneDuStock: true, descriptionALire: Boolean\(plateformeOrigine\(i\)\) \}\)/.test(stock), "la barre du Stock passe la fiche du Stock à la règle");

if (ko) { console.log(`\n${ko} échec(s)`); process.exit(1); }
console.log("\ntout passe");
