// ═══════════════════════════════════════════════════════════════════════════
// LE RAYON (GENRE) À CHOISIR A TOUJOURS SON CHAMP — preuve (22/10 soir, point 4 — Louis)
// ═══════════════════════════════════════════════════════════════════════════
// Cas réel : « Lunettes enfants stitch » (louis-seller, fiche 1792507479750003, importée de Vinted). La copie
// Beebs portait « Enfant » (Beebs n'a pas ce rayon) : une question comptée, Publier grisé, et AUCUN champ — une
// phrase seulement. Ce test prouve :
//   1. les rayons proposés sont exactement ceux qui résolvent une catégorie RÉELLE (Beebs, Vinted) ;
//   2. le moteur ne pose un rayon que quand c'est sûr (un seul possible, le texte de la fiche le nomme, « Enfant »
//      avec un seul rayon enfant) — jamais deviné ;
//   3. l'écran Confirmer (et le lot) compte cette question ET montre ses boutons ; l'ancien écran Publier aussi.
import fs from "node:fs";
import { detectObjectKeywordDetail } from "../src/utils/shared.js";
import { getBeebsCategoryPath, beebsGenreRequired } from "../src/utils/beebsCategories.js";
import { getVintedCategoryPath } from "../src/utils/vintedCategories.js";
import { rayonsGenreValides, genreSur, genresNommes, phraseGenreAChoisir, phraseGenreDeduit, RAYONS_GENRE } from "../src/publication/moteur/genreAChoisir.js";

let echecs = 0;
const ok = (cond, titre, detail = "") => {
  if (cond) { console.log(`  ✓ ${titre}`); return; }
  echecs++;
  console.error(`  ✗ ${titre}${detail ? `\n      ${detail}` : ""}`);
};
const lire = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");

console.log("1. LE CAS DE LOUIS : « Lunettes enfants stitch », genre « Enfant », Beebs");
{
  const icon = detectObjectKeywordDetail("Lunettes enfants stitch")?.icon;
  ok(icon === "🕶️", `icône lunettes (${icon})`);
  ok(beebsGenreRequired(icon) && !getBeebsCategoryPath(icon, "Enfant"), "Beebs exige un rayon, et « Enfant » n'en est pas un");
  const v = rayonsGenreValides("beebs", icon, getBeebsCategoryPath);
  ok(v.length === 5 && v.every((g) => getBeebsCategoryPath(icon, g)), `les rayons proposés résolvent tous une catégorie Beebs (${v.join(", ")})`);
  ok(genreSur({ actuel: "Enfant", valides: v, texte: "Lunettes enfants stitch" }) === null, "« enfants » ne dit ni Fille, ni Garçon, ni Bébé : on DEMANDE (jamais deviné)");
  const p = phraseGenreAChoisir({ actuel: "Enfant", valides: v, nomPlateforme: "Beebs" });
  ok(/« Enfant » n'est pas un rayon Beebs/.test(p) && /Choisis/.test(p), `la question dit pourquoi et invite à choisir (« ${p} »)`);
}

console.log("2. LES RAYONS PROPOSÉS = CEUX QUI EXISTENT");
{
  const robe = detectObjectKeywordDetail("Robe fille 6 ans")?.icon;
  const vB = rayonsGenreValides("beebs", robe, getBeebsCategoryPath);
  const vV = rayonsGenreValides("vinted", robe, getVintedCategoryPath);
  ok(!vB.includes("Homme") && !vB.includes("Garçon"), `robe : ni Homme ni Garçon chez Beebs (${vB.join(", ")})`);
  ok(vV.every((g) => RAYONS_GENRE.vinted.includes(g)) && !vV.includes("Bébé"), `Vinted : jamais un rayon qu'il n'a pas (${vV.join(", ")})`);
  ok(rayonsGenreValides("beebs", robe, null).length === 0, "sans table : aucun rayon (rien d'inventé)");
}

console.log("3. LE RAYON POSÉ SEUL : SEULEMENT QUAND C'EST SÛR");
ok(genreSur({ actuel: "Enfant", valides: ["Femme", "Fille", "Bébé"], texte: "Robe fille 6 ans" })?.valeur === "Fille", "le texte de la fiche dit « fille » → Fille");
ok(genreSur({ actuel: "Mixte", valides: ["Femme", "Homme", "Fille", "Garçon"], texte: "Baskets Nike garçon" })?.valeur === "Garçon", "« garçon » → Garçon");
ok(genreSur({ actuel: "Enfant", valides: ["Femme", "Homme", "Fille", "Garçon"], texte: "Pull fille ou garçon 8 ans" }) === null, "deux genres nommés → on demande");
ok(genreSur({ actuel: "", valides: ["Femme", "Homme"], texte: "Veste unisexe homme" }) === null, "« unisexe » → on demande");
ok(genreSur({ actuel: "Enfant", valides: ["Femme", "Homme"], texte: "Jupe fille" }) === null, "le genre nommé n'existe pas pour cet article → on demande");
ok(genreSur({ actuel: "Femme", valides: ["Homme"], texte: "" })?.preuve === "seul_rayon", "un seul rayon possible → posé (« seul_rayon »)");
ok(genreSur({ actuel: "Enfant", valides: ["Femme", "Homme", "Bébé"], texte: "Bavoir" })?.valeur === "Bébé", "« Enfant » et un seul rayon enfant → posé");
ok(genresNommes("Lot de vêtements").length === 0, "« vêtements » ne contient pas « men » (mot entier seulement)");
ok(genresNommes("Chemise HOMME taille L")[0]?.genre === "Homme", "insensible à la casse");
ok(/ton texte dit « fille »/.test(phraseGenreDeduit({ valeur: "Fille", preuve: "texte", mot: "fille" }, "Beebs")), "le rayon posé dit d'où il vient (jamais en silence)");

console.log("4. L'ÉCRAN : LA QUESTION COMPTÉE A SON CHAMP");
{
  const bq = lire("src/publication/BlocQuestions.jsx");
  ok(/const genresBloques = \["vinted", "beebs"\]\.filter\(p => m\[`\$\{p\}GenreBlocked`\]\)/.test(bq), "Confirmer : les rayons bloqués de Vinted et Beebs sont lus");
  ok(/const total = [^;]*\+ genresBloques\.length;/.test(bq) && /const restants = [^;]*\+ genresBloques\.length;/.test(bq), "Confirmer : la question est COMPTÉE (plus jamais « Tout est complété » au-dessus d'un Publier grisé)");
  ok(/choix\.valides\.map\(g => \(\s*<button[^>]*onClick=\{\(\) => m\.choisirGenre\(p, g\)\}/.test(bq), "Confirmer : un bouton par rayon valide, qui écrit la réponse");
  ok(!/<div className="fsn-card-p">\{t\("beebsGenreRequired"\)\}<\/div>/.test(bq), "Confirmer : plus de phrase seule sans champ");
  const lps = lire("src/components/ListingPreviewScreen.jsx");
  ok(/genreAChoisir, genresDeduits, choisirGenre,/.test(lps), "le moteur expose la question (Confirmer à l'unité ET lot)");
  ok(/<BoutonsRayon choix=\{genreAChoisir\?\.beebs\}/.test(lps) && /<BoutonsRayon choix=\{genreAChoisir\?\.vinted\}/.test(lps), "ancien écran Publier : les boutons aussi");
  ok(/const k = `\$\{p\}:genre_rayon`;/.test(lps), "la question du rayon est tracée (champ_requis_bloquant), comme les autres");
}

console.log("");
if (echecs) { console.error(`✗ ${echecs} échec(s)`); process.exit(1); }
console.log("✓ le rayon à choisir a toujours son champ");
