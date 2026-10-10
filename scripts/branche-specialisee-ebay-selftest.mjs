// ═══════════════════════════════════════════════════════════════════════════
// eBay — UN VÊTEMENT DE MODE NE PART PAS EN SPORT SANS QUE LE TEXTE LE DISE
// SELFTEST (10/10/2026, cas Manon et règle de Nico)
// ═══════════════════════════════════════════════════════════════════════════
// Exécute le code livré (src/utils/brancheSpecialiseeEbay.js) sur l'arbre eBay
// RELEVÉ (src/utils/arbres/ebayFeuilles.js) et sur les 14 dépôts réels du parc
// rangés dans un rayon « vêtement » d'une branche spécialisée (relevé du 10/10) :
//   1. les mots qui tombaient EXACTEMENT hors de la mode (gilet, veste, sac,
//      lunettes, survêtement, collier, ensemble) y sont écartés quand le texte
//      ne dit pas la spécialité — et GARDÉS quand il la dit ;
//   2. les vrais articles de sport restent dans leur sport (cyclisme,
//      football, basket, musculation, ski, moto, travail, chien) ;
//   3. une feuille de sport qui ne nomme pas un vêtement (raquette, éclairage,
//      haltères, casque) n'est jamais concernée ; « Vacances » (bagagerie)
//      non plus ;
//   4. Vinted, Leboncoin, Beebs, Depop, Opla : jamais concernés ;
//   5. « basket » et « jogging » (mots de MODE en français) ne prouvent rien ;
//   6. le câblage dans resolutionPublication : étape 2 (certitude), étape 3
//      (candidates), chemin final — eBay seulement.
//
//   node --import ./scripts/loader-ext.mjs scripts/branche-specialisee-ebay-selftest.mjs
import { readFileSync } from "node:fs";
import { vetoBrancheSpecialisee, brancheSpecialiseeEbay, texteDitLaSpecialite } from "../src/utils/brancheSpecialiseeEbay.js";
import { resoudreParMot } from "../src/utils/categorieParMot.js";

let ko = 0;
const ok = (c, quoi, vu) => { if (!c) { ko++; console.log(`  ✗ ${quoi}${vu !== undefined ? ` — vu : ${JSON.stringify(vu)}` : ""}`); } else console.log(`  ✓ ${quoi}`); };
const veto = (chemin, titre, description = "", mot = "") => vetoBrancheSpecialisee({ plateforme: "ebay", chemin, titre, description, mot });

console.log("1. Les mots qui tombaient EXACTEMENT hors de la mode");
const exacts = [
  ["gilet", "femme", "Gilet GAP | Couleur noir | Taille M", "Gilet cycliste réfléchissant"],
  ["veste", "homme", "Veste en jean Levi's | Taille L", "Veste vélo coupe-vent Decathlon"],
  ["sac", "femme", "Sac MNG camel – Neuf sans étiquette", "Sac de golf Callaway 14 compartiments"],
  ["lunettes", "", "Lunettes de soleil Ray-Ban Wayfarer", "Lunettes moto cross Fox"],
  ["survêtement", "homme", "Survêtement Adidas vintage | Taille M", "Survêtement de fitness Domyos"],
  ["collier", "", "Collier chic Lumière Rose pierres naturelles", "Collier pour chien en cuir"],
  ["ensemble", "femme", "Ensemble Zara 2 pièces", "Ensemble de disc golf Innova"],
];
for (const [mot, genre, mode, sport] of exacts) {
  const r = await resoudreParMot(mot, "ebay", { genre });
  ok(r.certitude === "exact" && !["Vêtements, accessoires", "Bijoux, montres"].includes(r.chemin[0]),
    `« ${mot} » (${genre || "sans genre"}) tombe EXACTEMENT sur « ${r.chemin?.join(" > ")} »`, r.chemin);
  ok(Boolean(veto(r.chemin, mode, "", mot)), `  « ${mode} » : écarté`);
  ok(!veto(r.chemin, sport, "", mot), `  « ${sport} » : gardé`);
}

console.log("\n2. Les dépôts RÉELS du parc (14, relevé du 10/10)");
const C = (s) => s.split(" > ");
const parc = [
  // [titre, description (extrait), mot, chemin, attendu]
  ["Gilet GAP | Couleur noir | Taille M | En très bonne état", "Gilet GAP en noir, taille M. Idéal pour composer des looks casual ou habillés en toute saison.", "gilet", "Sports, vacances > Cyclisme, vélos > Equipement du cycliste > Gilets", "écarté"],
  ["Baskets Autry Medalist enfant blanc rose EU 33", "Baskets Autry Medalist pour enfant en cuir blanc avec détails rose au talon.", "baskets enfant", "Sports, vacances > Fitness, athlétisme, yoga > Chaussures > Enfants", "écarté"],
  ["Collier chic Lumière Rose pierres naturelles marbrées dorés", "Collier élégant signé Lumière Rose orné de pierres naturelles marbrées.", "collier", "Animalerie > Chiens > Colliers", "écarté"],
  ["Polo NAF NAF rouge col volant manches courtes taille S", "Polo NAF NAF rouge vif à col volant caractéristique.", "polo col volant", "Sports, vacances > Golf > Vêtements, chaussures de golf > Vêtements de golf: femmes > Polos, pulls et chemises", "écarté"],
  ["Sac MNG camel – Neuf sans étiquette", "Sac MNG en coloris marron camel. Article neuf, jamais porté.", "sac", "Sports, vacances > Golf > Clubs et matériels > Sacs", "écarté"],
  ["Coffret collier yoga 7 chakras et ses pierres naturelles", "Coffret complet dédié aux 7 chakras, composé d'un collier.", "collier", "Animalerie > Chiens > Colliers", "écarté"],
  ["Ensemble de football Portugal Puma enfant – Taille 22", "Ensemble complet de football aux couleurs du Portugal.", "maillot de football", "Sports, vacances > Fitness, athlétisme, yoga > Vêtements, accessoires fitness > Enfants: vêtements > Hauts, maillots", "gardé"],
  ["Nike Total 90 III SP – White/Black/Metallic Gold", "Modèle iconique au style rétro football, parfait pour une tenue tendance.", "chaussures de football", "Sports, vacances > Football > Chaussures", "gardé"],
  ["Veste de cyclisme SMS Santini rouge noir blanc XXL 52", "Veste de cyclisme vintage SMS Santini en polyester.", "veste de cyclisme", "Sports, vacances > Cyclisme, vélos > Equipement du cycliste > Vestes", "gardé"],
  ["Scorpion Exo 520 Air Shade noir mat M - Casque intégral", "Casque intégral Scorpion Exo 520 Air Shade.", "casque moto intégral", "Auto, moto - pièces, accessoires > Casques, vêtements > Vêtements de cross > Autres", "gardé"],
  ["Maillot cyclisme vintage Selle Italia bleu blanc XXL", "Maillot de cyclisme vintage Selle Italia.", "maillot de cyclisme", "Sports, vacances > Cyclisme, vélos > Equipement du cycliste > Maillots", "gardé"],
  ["Maillot de foot concept du réal Madrid taille M", "Type de produit : Maillot de football — Activité/Sport : Football", "maillot de foot", "Sports, vacances > Fitness, athlétisme, yoga > Vêtements, accessoires fitness > Hommes: vêtements > Hauts, maillots", "gardé"],
  ["ceinture powerlifting manga noir & rouge – taille L", "Ceinture de musculation / powerlifting – Taille L", "ceinture de musculation", "Sports, vacances > Fitness, athlétisme, yoga > Musculation, poids > Ceintures", "gardé"],
  ["Maillot NBA Nike Denver Nuggets City Edition – Taille M / 44", "Superbe maillot de basketball Nike NBA Swingman des Denver Nuggets.", "maillot de basket", "Sports, vacances > Basketball > Maillots", "gardé"],
];
for (const [titre, description, mot, chemin, attendu] of parc) {
  const v = veto(C(chemin), titre, description, mot);
  ok((v ? "écarté" : "gardé") === attendu, `${attendu.padEnd(6)} ${titre.slice(0, 52)}`);
}

console.log("\n3. Hors règle : feuilles de sport sans vêtement, « Vacances »");
for (const chemin of [
  "Sports, vacances > Tennis > Raquettes",
  "Sports, vacances > Cyclisme, vélos > Accessoires de vélos > Eclairage, réflecteurs",
  "Sports, vacances > Fitness, athlétisme, yoga > Musculation, poids > Haltères",
  "Auto, moto - pièces, accessoires > Casques, vêtements > Casques, accessoires > Casques",
  "Sports, vacances > Vacances > Accessoires voyage, bagagerie > Accessoires de voyage > Trousses de toilette",
  "Vêtements, accessoires > Femme : vêtements, accessoires > Femme : vêtements > Pulls, cardigans",
]) ok(!brancheSpecialiseeEbay(C(chemin)) && !veto(C(chemin), "Article sans rapport"), `hors règle : ${chemin.split(" > ").slice(-2).join(" > ")}`);

console.log("\n4. Les autres plateformes ne bougent jamais");
for (const plateforme of ["vinted", "leboncoin", "beebs", "depop", "opla"]) {
  ok(vetoBrancheSpecialisee({ plateforme, chemin: C("Sports, vacances > Cyclisme, vélos > Equipement du cycliste > Gilets"), titre: "Gilet GAP" }) === null,
    `${plateforme} : jamais de veto`);
}

console.log("\n4 bis. Un texte qui nomme un SPORT n'est pas un vêtement de mode (rayon de sport gardé)");
ok(!veto(C("Sports, vacances > Fitness, athlétisme, yoga > Vêtements, accessoires fitness > Hommes: vêtements > Hauts, maillots"), "Maillot de foot PSG 2019 | Taille M"),
  "« Maillot de foot » en Fitness : gardé (le texte nomme le football)");
ok(Boolean(veto(C("Sports, vacances > Fitness, athlétisme, yoga > Vêtements, accessoires fitness > Hommes: vêtements > Survêtements"), "Survêtement Adidas vintage", "parfait pour un look casual ou sportswear rétro")),
  "« sportswear » (mode) ne nomme pas un sport : survêtement écarté");
ok(Boolean(veto(C("Auto, moto - pièces, accessoires > Casques, vêtements > Casques, accessoires > Lunettes"), "Lunettes de ski Oakley")),
  "hors « Sports », un sport ne suffit pas : lunettes de ski écartées des lunettes moto");
ok(Boolean(veto(C("Collections > Pins > Sports > Basket"), "Adidas Tensaur Sport 2.0 CF I")),
  "Collections : « Sport » dans le titre ne fait pas d'une basket un pin's");

console.log("\n5. Les mots de mode ne prouvent pas un sport");
ok(!texteDitLaSpecialite(["basketball"], ["Baskets Nike Air Max"]), "« baskets » ne prouve pas le basketball");
ok(!texteDitLaSpecialite(["fitnes", "athletisme", "yoga"], ["Jogging Nike gris"]), "« jogging » ne prouve pas le fitness");
ok(texteDitLaSpecialite(["velo", "cyclisme", "cycliste"], ["Veste VTT Rockrider"]), "« VTT » prouve le cyclisme");
ok(texteDitLaSpecialite(["football"], ["Maillot de foot PSG"]), "« foot » prouve le football");
ok(texteDitLaSpecialite(["auto", "moto"], ["LS2 Integral Motorcycle Helmet"]), "« Motorcycle » (anglais) prouve la moto");
ok(texteDitLaSpecialite(["animalerie", "chien"], ["Manteau pour chien taille S"]), "« chien » prouve l'animalerie");
ok(texteDitLaSpecialite(["bricolage", "atelier"], ["Gants de travail Stanley"]), "« travail » prouve la protection");

console.log("\n6. Le câblage (resolutionPublication, eBay seulement)");
{
  const src = readFileSync(new URL("../src/utils/resolutionPublication.js", import.meta.url), "utf8");
  ok(/import \{ vetoBrancheSpecialisee \} from "\.\/brancheSpecialiseeEbay";/.test(src), "module importé");
  ok(/if \(r\.certitude === "exact" && platform === "ebay"\) \{\s*brancheEcartee = vetoBrancheSpecialisee\(/.test(src), "étape 2 : certitude eBay contrôlée");
  ok(/if \(r\.certitude === "exact" && !horsMaison && !brancheEcartee\) categorieParMotParPf\[platform\] = r;/.test(src), "étape 2 : une feuille écartée n'est pas posée");
  ok(/const aRatisser = plateformesAPublier\.filter\(p => !categorieParMotParPf\[p\] && !\(p === "ebay" && brancheSpecialiseeEcartee\.ebay\)\);/.test(src),
    "étape 3 : eBay écarté ne rejoint pas la question commune (Vinted, Leboncoin, Beebs, Depop : demande identique)");
  ok(!/retenues = retenues\.filter\(c => !vetoBrancheSpecialisee/.test(src), "étape 3 : la liste envoyée à l'IA n'est PAS modifiée (question commune à l'octet)");
  ok(/if \(platform === "ebay"\) \{\s*const vetoChoix = vetoBrancheSpecialisee\(/.test(src), "étape 3 : le CHOIX eBay de l'IA est contrôlé après coup");
  ok(/if \(!parMotEbay && categoryPath && categoryId && !brancheSpecialiseeEcartee\.ebay\) poseParIcone\.ebay =/.test(src),
    "vérification commune : le chemin de repli eBay n'y entre pas");
  ok(/if \(pfParPlateforme\.ebay\) \{\s*const pf = pfParPlateforme\.ebay;/.test(src) && /pf\.categorie_branche_specialisee = \{/.test(src), "chemin final eBay contrôlé et tracé");
  const appels = src.match(/vetoBrancheSpecialisee\(\{\s*plateforme: (platform|"ebay")/g) ?? [];
  ok(appels.length === 4, "4 appels, chacun sur eBay (platform gardé par === \"ebay\" ou littéral)", appels.length);
}

console.log(ko ? `\n✗ ${ko} échec(s)` : "\n✓ mode hors branche spécialisée eBay : tout est vert");
process.exit(ko ? 1 : 0);
