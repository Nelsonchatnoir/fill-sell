// ═══════════════════════════════════════════════════════════════════════════
// LES CHAMPS REQUIS QUI SE REMPLISSENT SEULS (25/10 soir, décisions de Nico) — `npm run selftest:champs-requis-auto`
// ═══════════════════════════════════════════════════════════════════════════
// Exécute le code LIVRÉ : _shared/champs-requis-auto.js (matière Beebs, âge Beebs, bijoux Beebs, matière eBay) et
// _shared/pointure-du-texte.js (pointure de la fiche ou écrite), sur les cas réels du 25/10 et leurs pièges ; puis
// vérifie le branchement dans l'écran Publier (ListingPreviewScreen.jsx). Règle commune (Nico) : « on ne devine JAMAIS ;
// pas de source fiable → la question, comme aujourd'hui ; jamais une valeur fausse ».
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => readFileSync(join(RACINE, p), "utf8").replace(/\r\n/g, "\n");
const m = await import("../supabase/functions/_shared/champs-requis-auto.js");
const p = await import("../supabase/functions/_shared/pointure-du-texte.js");
let verts = 0, rouges = 0;
const ok = (c, msg, d = "") => { if (c) { verts++; console.log(`  ok   ${msg}`); } else { rouges++; console.log(`  RATÉ ${msg}${d ? `  ← ${d}` : ""}`); } };
const val = (r) => r?.valeur ?? (r?.doute ? `doute` : null);

const MAT = ["Plastique", "Bois", "Caoutchouc", "Tissu", "Carton", "Autre"];
const AGE = ["0-6 mois", "6-12 mois", "12-24 mois", "2 ans - 3 ans", "3 ans - 4 ans", "4 ans - 6 ans", "6 ans - 8 ans", "8 ans - 12 ans", "12 ans - 16 ans", "16 ans et +"];
const J = "Jeux, jouets et loisirs > ";

console.log("a) Matière Beebs : la fiche, puis le rayon, sinon « Autre » — jamais le texte libre");
ok(val(m.matiereBeebsAuto({ chemin: `${J}Jeux d'éveil > Jouets électroniques pour bébé`, allowedValues: MAT })) === "Plastique", "Sandra (Hatchimals, jouet électronique pour bébé) → Plastique, sans question");
ok(val(m.matiereBeebsAuto({ chemin: `${J}Peluches`, allowedValues: MAT })) === "Tissu" && val(m.matiereBeebsAuto({ chemin: `${J}Doudous`, allowedValues: MAT })) === "Tissu", "peluche, doudou → Tissu");
ok(val(m.matiereBeebsAuto({ chemin: `${J}Jeux d'éveil > Jouets en bois`, allowedValues: MAT })) === "Bois", "jouets en bois → Bois");
ok(val(m.matiereBeebsAuto({ chemin: `${J}Figurines`, valeurFiche: "Bois", allowedValues: MAT })) === "Bois", "la matière de la FICHE passe avant le rayon (figurine en bois)");
ok(val(m.matiereBeebsAuto({ chemin: `${J}Puzzles`, allowedValues: MAT })) === "Autre", "rayon qui ne dit rien (puzzles) → « Autre » (décision de Nico)");
ok(val(m.matiereBeebsAuto({ chemin: `${J}Véhicules > Voitures et autres véhicules`, valeurFiche: "Métal", allowedValues: MAT })) === "Autre", "métal (hors liste) → « Autre », jamais « Plastique »");
ok(m.matiereBeebsAuto({ chemin: `${J}Peluches`, allowedValues: ["Coton", "Laine"] }) === null, "une liste sans « Autre » (autre plateforme, autre rayon) : rien posé");

console.log("c) Âge Beebs : l'âge écrit, le PEGI, le livre ADULTE ; jamais un livre jeunesse en « 16 ans et + »");
ok(val(m.ageBeebsAuto({ chemin: `${J}Livres > Autres livres`, textes: ["Antidote Magazine n°25", "Magazine de mode pour adultes"], allowedValues: AGE })) === "16 ans et +", "Sandra (Antidote, magazine de mode) → « 16 ans et + »");
ok(val(m.ageBeebsAuto({ chemin: `${J}Livres > Autres livres`, textes: ["Le Silence des agneaux", "Thriller de Thomas Harris"], allowedValues: AGE })) === "16 ans et +", "thriller → « 16 ans et + »");
ok(m.ageBeebsAuto({ chemin: `${J}Livres > Romans pour enfant`, textes: ["Harry Potter", "roman policier"], allowedValues: AGE }) === null, "rayon « Romans pour enfant » : JAMAIS « 16 ans et + », même avec un mot adulte");
ok(m.ageBeebsAuto({ chemin: `${J}Livres > Autres livres`, textes: ["Lot de 9 livres Petit Ours Brun", ""], allowedValues: AGE }) === null, "Petit Ours Brun : jeunesse, aucune pose « adulte »");
ok(val(m.ageBeebsAuto({ chemin: `${J}Livres > Autres livres`, textes: ["Polar jeunesse", "roman policier pour enfants"], allowedValues: AGE })) === "doute", "signes adulte ET jeunesse → doute → question");
ok(m.ageBeebsAuto({ chemin: `${J}Livres > Autres livres`, textes: ["Le Petit Prince", "Saint-Exupéry, Folio"], allowedValues: AGE }) === null, "ni adulte ni jeunesse écrits (Le Petit Prince) → question, comme aujourd'hui");
ok(val(m.ageBeebsAuto({ chemin: `${J}Figurines`, textes: ["Figurine Schleich", "Dès 3 ans"], allowedValues: AGE })) === "3 ans - 4 ans", "jouet « dès 3 ans » → « 3 ans - 4 ans »");
ok(val(m.ageBeebsAuto({ chemin: `${J}Jeux d'éveil > Jeux de formes`, textes: ["Cube", "18 mois et +"], allowedValues: AGE })) === "12-24 mois", "« 18 mois et + » → « 12-24 mois »");
ok(val(m.ageBeebsAuto({ chemin: `${J}Puzzles`, textes: ["Puzzle 4-6 ans"], allowedValues: AGE })) === "4 ans - 6 ans", "tranche exacte écrite « 4-6 ans »");
ok(val(m.ageBeebsAuto({ chemin: `${J}Puzzles`, textes: ["Puzzle 3-6 ans"], allowedValues: AGE })) === "doute", "« 3-6 ans » (pas une tranche Beebs) → doute");
ok(m.ageBeebsAuto({ chemin: `${J}Figurines`, textes: ["Figurine", "achetée il y a 2 ans, portée 2 ans"], allowedValues: AGE }) === null, "« il y a 2 ans » n'est pas un âge");
ok(m.ageBeebsAuto({ chemin: `${J}Figurines`, textes: ["Figurine Schleich cheval", ""], allowedValues: AGE }) === null, "jouet sans âge écrit → question (aucun défaut de rayon prouvé par les publications)");
ok(Object.keys(m.AGE_PAR_RAYON_JOUETS).length === 0, "défauts de rayon : table vide au 25/10 (aucun rayon n'a d'âge dominant sur 6 mois)");
ok(val(m.ageBeebsAuto({ chemin: `${J}Multimédia > Jeux vidéo`, textes: ["FIFA 22 PS4", "PEGI 3"], allowedValues: AGE })) === "3 ans - 4 ans", "jeu vidéo PEGI 3 → « 3 ans - 4 ans »");
ok(val(m.ageBeebsAuto({ chemin: `${J}Multimédia > Jeux vidéo`, textes: ["GTA V", "pegi 18"], allowedValues: AGE })) === "16 ans et +", "PEGI 18 → « 16 ans et + »");
ok(m.ageBeebsAuto({ chemin: `${J}Multimédia > Jeux vidéo`, textes: ["Jeu PS4", ""], allowedValues: AGE }) === null, "jeu vidéo sans PEGI → question");

console.log("e) Bijoux Beebs hors bagues → « Ajustable »");
const B = ["14,1 mm", "14,5 mm", "22,6 mm", "Ajustable"];
const BIJOUX = "Mode > Femme > Accessoires (femme) > Bijoux (femme)";
ok(val(m.tailleBijouBeebsAuto({ chemin: BIJOUX, textes: ["Collier doré cœur"], allowedValues: B })) === "Ajustable", "collier → « Ajustable »");
ok(val(m.tailleBijouBeebsAuto({ chemin: BIJOUX, textes: ["Bracelet perles"], allowedValues: B })) === "Ajustable", "bracelet → « Ajustable »");
ok(m.tailleBijouBeebsAuto({ chemin: BIJOUX, textes: ["Bague argent 925"], allowedValues: B }) === null, "bague → sa question (sa taille compte)");
ok(m.tailleBijouBeebsAuto({ chemin: BIJOUX, textes: ["Boucles d'oreilles anneaux"], allowedValues: B }) === null, "« anneaux » : mot de bague → question (prudence)");
ok(m.tailleBijouBeebsAuto({ chemin: BIJOUX, textes: ["Parure collier et bague"], allowedValues: B }) === null, "parure → question");
ok(m.tailleBijouBeebsAuto({ chemin: BIJOUX, textes: ["Bijou fantaisie"], allowedValues: B }) === null, "type de bijou inconnu → question");
ok(m.tailleBijouBeebsAuto({ chemin: "Mode > Femme > Robes", textes: ["Collier"], allowedValues: B }) === null, "hors rayon bijoux : rien");

console.log("b) Matière eBay : composition LUE (avec %), sinon la valeur neutre de LA liste, sinon la question");
ok(val(m.matiereEbayAuto({ composition: "70% coton, 30% nylon", allowedValues: ["Coton"] })) === "70% coton, 30% nylon", "composition de l'étiquette lue par Lens (avec pourcentages)");
ok(m.matiereEbayAuto({ composition: "Coton", allowedValues: ["Coton"] }) === null, "« Coton » sans pourcentage (Lens a pu deviner) : rien");
ok(val(m.matiereEbayAuto({ composition: "", allowedValues: ["Bois", "Métal", "Inconnue"] })) === "Inconnue", "la valeur neutre qu'eBay propose (175758 : « Inconnue »)");
ok(m.matiereEbayAuto({ composition: "", allowedValues: ["Bois", "Métal", "Synthétique"] }) === null, "aucune valeur neutre dans la liste → question (jamais « Synthétique » inventé)");

console.log("d) Pointure : la fiche, puis un nombre COLLÉ à un mot explicite, cohérent avec le public du rayon, une seule valeur");
const G = []; for (let n = 15; n <= 50; n++) { G.push(String(n)); G.push(`${n},5`); }
const pt = (o) => val(p.pointureDuTexte({ grille: G, ...o }));
ok(pt({ valeurFiche: "EU 31", textes: ["Adidas Torsion ZX Flux Noir Enfant Pointure 31", "pointure FR 31 (JP 190)"], chemin: "Mode > Chaussures > Enfant" }) === "31", "chaouidz : fiche « EU 31 » + texte « Pointure 31 » → 31 (jamais 16)");
ok(pt({ valeurFiche: "37.5", textes: ["Scarpe da nike Runallday", "Taglia 37.5"], chemin: "Mode > Chaussures > Femme" }) === "37,5", "Marta : fiche 37.5 + « Taglia 37.5 » → « 37,5 » de la grille Leboncoin");
ok(pt({ textes: ["Chaussures femme taille 37 et demi"], chemin: "Femmes > Chaussures" }) === "37,5", "« 37 et demi » = 37,5 (jamais arrondi)");
ok(pt({ textes: ["Adidas Courtsmash taille 37 1/3"], chemin: "Femmes > Chaussures" }) === "doute", "tiers Adidas « 37 1/3 » → doute (jamais 37)");
ok(pt({ textes: ["Basket Puma de taille 40,5 cm"], chemin: "Femmes > Chaussures" }) === null, "« taille 40,5 cm » : une longueur, jamais relue « 40 »");
ok(pt({ textes: ["Bottes pointure 28-29"], chemin: "Enfants > Chaussures" }) === "doute", "deux pointures (« 28-29 ») → doute");
ok(pt({ textes: ["porté 2 fois, 31 €, lot de 3"], chemin: "Enfants > Chaussures" }) === null, "un nombre seul (prix, fois, lot) n'est jamais pris");
ok(pt({ textes: ["UK 8 / EU 42"], chemin: "Hommes > Chaussures" }) === "doute", "UK / US écrits à côté → doute (on ne convertit pas)");
ok(pt({ textes: ["pointure 42"], chemin: "Enfants > Chaussures" }) === "doute", "pointure adulte sur un rayon enfant → doute");
ok(pt({ textes: ["pointure 38"], chemin: "Chaussures" }) === "doute", "public du rayon inconnu → doute");
ok(pt({ valeurFiche: "38", textes: ["taille 39"], chemin: "Femmes > Chaussures" }) === "doute", "la fiche et le texte se contredisent → doute");
ok(pt({ textes: ["Prix EUR 42"], chemin: "Hommes > Chaussures" }) === null, "« EUR 42 » (un prix) n'est pas une pointure");
ok(pt({ textes: ["Pointure : 19,5 EU / 4C US"], chemin: "Bébé > Chaussures" }) === "19,5", "« Pointure : 19,5 EU » (le « 4C US » n'est pas lu comme une pointure EU)");

console.log("Branchement dans l'écran Publier");
const lps = lire("src/components/ListingPreviewScreen.jsx");
ok(/from "\.\.\/\.\.\/supabase\/functions\/_shared\/champs-requis-auto\.js"/.test(lps) && /from "\.\.\/\.\.\/supabase\/functions\/_shared\/pointure-du-texte\.js"/.test(lps), "les deux modules sont importés");
ok(/champRequisAuto\(/.test(lps), "les champs du rayon passent par champRequisAuto avant de devenir une question");
ok(/matiereEbayAuto\(/.test(lps), "la matière eBay manquante passe par matiereEbayAuto");
ok(/source === "pointure" \|\| d\.source === "taille_du_texte"|CHAMP_REQUIS_VERS_COPIE/.test(lps), "la valeur déduite est posée sur la copie là où l'extension la lit");

console.log(`\n${rouges ? "✗" : "✓"} champs-requis-auto : ${verts} verts, ${rouges} ratés`);
if (rouges) process.exit(1);
