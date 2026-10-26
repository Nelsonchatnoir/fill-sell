// ═══════════════════════════════════════════════════════════════════════════
// LA COULEUR ÉCRITE DANS LE TITRE OU LE TEXTE GAGNE TOUJOURS (26/10, étape 5) — `npm run selftest:couleur-du-texte`
// ═══════════════════════════════════════════════════════════════════════════
// Exécute le module LIVRÉ supabase/functions/_shared/couleur-du-texte.js sur les cas réels (Jocabroc 26/10, et les
// couleurs posées contre le titre depuis le 20/10), puis vérifie son branchement dans get-pending-jobs (Leboncoin).
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RACINE = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const C = await import("../supabase/functions/_shared/couleur-du-texte.js");
let verts = 0, rouges = 0;
const ok = (c, m, d = "") => { if (c) { verts++; console.log(`  ok   ${m}`); } else { rouges++; console.log(`  RATÉ ${m}${d ? `  ← ${d}` : ""}`); } };
const lu = (t, d = "") => C.couleurEcriteDansLeTexte(t, d);

// Listes Leboncoin relevées (platform_category_aspects) : Maison (furniture_color) et Mode (clothing_color).
const MAISON = ["Argenté", "Beige", "Blanc", "Bleu", "Bois", "Bordeaux", "Doré", "Gris", "Jaune", "Kaki", "Marron", "Multicolore", "Noir", "Orange", "Rose", "Rouge", "Transparent", "Vert", "Violet", "Autre"];
const MODE = ["Argenté / Acier", "Beige / Camel", "Blanc", "Bleu / Ciel", "Crème / Blanc cassé / Écru", "Doré / Bronze / Cuivre", "Gris / Anthracite", "Imprimé", "Jaune / Moutarde", "Kaki", "Lavande / Lilas", "Marine / Turquoise", "Marron", "Multicolore", "Noir", "Orange / Corail", "Rose / Fuchsia", "Rouge / Bordeaux", "Vert", "Violet / Mauve", "Autre"];

console.log("1. Les cas de Jocabroc (26/10)");
{
  const pot = lu("Pot à sucre Sarreguemines bleu marine à pois blancs vintage", "Charmant petit pot en céramique émaillée, bleu marine à pois blancs.");
  ok(pot?.couleur === "Bleu marine" && pot.source === "titre", "pot à sucre : « bleu marine » du titre (« à pois blancs » est un décor)", JSON.stringify(pot));
  ok(C.optionCouleurDansListe(pot, MAISON) === "Bleu", "… liste Maison : « Bleu » (le pré-rempli de Leboncoin était juste)");
  ok(C.optionCouleurDansListe(pot, MODE) === "Marine / Turquoise", "… liste Mode : « Marine / Turquoise », jamais « Bleu / Ciel »");
  const plat = lu("Grand plat à huîtres Longwy France vert d’eau – Céramique vintage");
  ok(plat?.couleur === "Vert d'eau" && C.optionCouleurDansListe(plat, MAISON) === "Vert", "plat à huîtres : « vert d'eau » → « Vert » (Vinted disait « Menthe », hors liste : parti sans couleur)", JSON.stringify(plat));
  ok(lu("Lot de 8 assiettes creuses H. Nappe, Moulin des Loups, France.", "Lot de 8 assiettes creuses H. Nappe, Moulin des Loups, France.\n\nFaïence blanche à carreaux jaunes.") === null,
    "assiettes : ni le titre ni la première phrase ne disent de couleur → rien (la valeur d'avant reste)");
  ok(lu("Tableau ancien vintage encadré bois scène de mode en relief dentelle XIXe siècle") === null, "tableau : « bois » n'est pas une couleur → rien");
}

console.log("2. Les garde-fous");
{
  ok(lu("Sweat noir et blanc Nike") === null, "deux couleurs principales : rien");
  ok(lu("T-shirt noir logo blanc")?.couleur === "Noir", "« logo blanc » est un décor : Noir");
  ok(lu("Robe fleurs bleues fond blanc")?.couleur === "Blanc", "« fleurs bleues » est un décor : Blanc");
  ok(lu("T-shirt à rayures bleues et blanches") === null, "« rayures bleues et blanches » : tout le décor, aucune couleur principale → rien");
  ok(lu("Pot à pois blancs bleu marine")?.couleur === "Bleu marine", "le décor avant la couleur principale ne la cache pas");
  ok(lu("Rose des sables décoration") === null && lu("Pull Orange Mécanique") === null && lu("Bijou or 18 carats") === null, "mots à double sens seuls (rose, orange, or) : rien");
  ok(lu("Pull couleur rose taille M")?.couleur === "Rose", "« couleur rose » : Rose");
  ok(lu("Casio Montre G-Shock noire")?.couleur === "Noir" && lu("Robe Camaïeu fleurie bleue manches courtes")?.couleur === "Bleu", "accords : « noire », « bleue »");
  ok(lu("Sweat Tommy Jeans bleu marine – Taille M")?.base === "Bleu" && lu("Pantalon vert kaki")?.couleur === "Kaki", "expressions composées avant le mot seul");
  ok(lu("Jean slim", "Jean bleu délavé. Coupe slim, taille 38.")?.source === "texte", "rien dans le titre : la première phrase du texte");
  ok(lu("Jean slim", "Coupe slim, taille 38. Couleur bleu.") === null, "seulement la PREMIÈRE phrase du texte");
  ok(C.optionCouleurDansListe(lu("Gilet beige"), ["Blanc", "Noir"]) === null, "aucune option de la liste ne correspond : rien d'inventé (l'appelant sert la couleur de base)");
}

console.log("3. Branchement (get-pending-jobs, Leboncoin)");
{
  const gpj = readFileSync(path.join(RACINE, "supabase/functions/get-pending-jobs/index.ts"), "utf8");
  ok(gpj.includes('import { couleurEcriteDansLeTexte, optionCouleurDansListe } from "../_shared/couleur-du-texte.js";'), "le module est importé");
  const i = gpj.indexOf("LA COULEUR ÉCRITE DANS LE TITRE OU LE TEXTE GAGNE TOUJOURS");
  const j = gpj.indexOf("── Couleur (valeur enregistrée de l'article, jamais déduite)");
  ok(i > 0 && j > i, "la couleur écrite passe AVANT la couleur de la fiche (qui ne comble plus qu'un vide)");
  const bloc = gpj.slice(i, j);
  ok(/const repondue = Object\.keys\(resolu\)\.some\(\(k\) => \/colo\|couleur\/i\.test\(k\)\);/.test(bloc), "une réponse de la personne à la question Couleur n'est jamais remplacée");
  ok(/pf\.couleur = valeur;\s*pf\.colors = \[valeur\];/.test(bloc), "couleur ET colors[0] (l'extension lit colors[0] d'abord)");
  ok(/trace\.couleur = \{ valeur, avant: avant \|\| null, source:/.test(bloc), "tracé dans lbc_deduit (avant, après, la source)");
  ok(/\.like\("field_key", "%color"\)/.test(gpj) && /_color\$\|\^color\$/.test(gpj), "la liste : relevée sur le formulaire, sinon le catalogue de la catégorie");
}

console.log(`\n${rouges === 0 ? "✓" : "✗"} couleur-du-texte : ${verts} contrôles verts, ${rouges} rouges`);
process.exit(rouges === 0 ? 0 : 1);
