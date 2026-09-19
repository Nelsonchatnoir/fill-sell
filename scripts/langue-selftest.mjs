// Non-régression du détecteur de langue (_shared/langue.js).
//
// CORPUS RÉEL, FIGÉ. Les 11 descriptions déclarées anglaises sur les 754
// fiches créées par l'app du 20/08 au 19/09/2026, relues une par une, plus
// des descriptions françaises du même relevé — dont les MIXTES (marque
// anglaise citée dans une phrase française), qui ne doivent JAMAIS être
// flaggées, et les NOMS DE PRODUITS anglais, qui ne doivent jamais faire
// basculer un verdict à eux seuls.
//
// ⛔ Ne pas « améliorer » les listes de mots-outils sans rejouer ce fichier :
// c'est le seul endroit où le seuil de 3 est défendu sur des textes réels.
import { verdictLangue, estAnglaisAvere, compterMotsOutils } from "../supabase/functions/_shared/langue.js";

// ── 1. ANGLAIS AVÉRÉ — les 11 du relevé (descriptions tronquées à 300) ──────
const ANGLAIS = [
  "Lot of 10 Swisher Sweets cigars in original packaging. Multiple varieties visible including Swisher Sweets Cigar Blunt Wraps and Swisher Sweets Smooth Cigars. All cigars appear to be in sealed plastic wrapping with blue and yellow pull-tab bands. Stored in a green plastic container. No visible damage to packaging or product.",
  "Single page from a dictionary or reference book showing the English word 'worn' with phonetic pronunciation, Chinese translation, and a definition of dress/frock/gown. Page appears clean with no visible damage or heavy wear.",
  "Two-piece set comprising a beige t-shirt and matching shorts, both printed with ' FEAR OF GOD' text. The t-shirt features short sleeves and a crew neck. The shorts are elasticated at the waist. Both pieces retain their original brown cardboard hang tags with size 'S' marked.",
  "Grey denim jeans by , size 13. The item shows visible wear consistent with regular use: fading across the front and back, some creasing, and minor marks on the fabric. The seams are intact, pockets are functional, and the waistband and fly are in working order.",
  "Tommy Hilfiger V-neck sweater in teal cotton. Long sleeves with ribbed cuffs and hem. Small embroidered logo visible on chest. No visible wear, clean condition.",
  "Funko Pop Animation Boruto Uzumaki #671 vinyl figure from the Boruto: Naruto Next Generations series. The figure depicts Boruto in his iconic outfit with blonde spiky hair and forehead protector. Packaged in original window display box.",
  "White open-knit crochet sleeveless tank top from American Eagle Outfitters, size S/P. Features a textured crochet pattern throughout with fringe detailing at the hem. The piece shows no visible wear and is in very good condition.",
  "The North Face men's pullover hoodie in grey with textured fabric. Features the iconic white logo on chest and sleeve branding. Kangaroo pocket with zipper. No visible wear, clean condition throughout. Made in Cambodia.",
  "Patterned scarf by Loavies featuring a geometric design in black, cream and burgundy tones. The scarf shows no visible wear and appears well-maintained. Brand label clearly visible on the item.",
  "Geometric patterned scarf in black, cream and burgundy tones. Brand label reads 'LOAVIES'. No visible wear, clean condition. Appears to be wool blend fabric with a structured weave pattern featuring repeating diamond or eye motifs.",
  "Long-sleeve button-up blouse with vibrant snake print in yellow, black, white, and brown tones. Gushi brand label visible on cuff. No visible wear, clean condition. Suitable for casual or business casual styling.",
];

// ── 2. FRANÇAIS — dont des descriptions qui CITENT de l'anglais ─────────────
const FRANCAIS = [
  "Robot cuiseur multifonction My Little Chef neuf avec emballage d'origine. Bol inox 2L, écran LCD tactile, 5 programmes automatiques (vapeur, pétrissage, mijotage, soupe, auto-nettoyage), 15 sous-programmes disponibles. Puissance 1700W. Alimentation 200-240V 50/60Hz. Accessoires inclus. Conforme BPA.",
  "Carte Regigigas de type Métal, 150 PV, de la série de base. Numéro 486 du Pokédex. Carte en très bon état, sans usure visible, conservée en pochette de protection. Recto avec illustration complète et lisible, verso standard. Référence SWSH247.",
  "Veste de shell Gore-Tex de la collaboration Supreme x Vanson Leathers. Nylon imperméable 3 couches avec coutures scellées et doublure C-Knit. Fermeture éclair complète, poches zippées étanches aux mains et poche intérieure zippée.",
  "Chapka pour bébé en taille 18-23 mois. Bonnet gris avec doublure et cache-oreilles en fourrure synthétique blanche. Lien de fermeture au menton. Aucune usure visible, très bon état général.",
  "Set LEGO Star Wars 75445 Anzellan Starship complet avec 701 pièces. Boîte d'origine intacte avec étiquette de prix visible. Contient le vaisseau spatial à construire, trois minifigurines et accessoires. Jamais ouvert ni construit.",
  "Monographie d'art consacrée à Raoul Dufy. Édition originale Flammarion 1989, reliure toilée bleue sous jaquette illustrée en couleurs. 334 pages avec très nombreuses illustrations en noir et blanc et en couleurs, dont 4 feuillets dépliants.",
  "Spray nettoyant désinfectant Milton multi-surfaces. Flacon de 500 ml avec pulvérisateur. Élimine 99,99% des germes. Produit d'entretien ménager, aucune usure visible.",
];

// ── 3. NI L'UN NI L'AUTRE — trop court pour qu'un verdict ait un sens ───────
// C'est le cas PRUDENT : rien ne se déclenche dessus, ni traduction ni refus
// de la passe 2. Les titres en font partie : on ne juge JAMAIS un titre seul.
const INDECIDABLES = [
  "",
  "Neuf",
  "Taille 45",
  "101",
  "Très bon état",
  "Grand Theft Auto The Trilogy The Definitive Edition PS4",
  "Captain Tsubasa: Rise of New Champions Nintendo Switch",
  "Water Beauty and Air CC Cream Natural 20g",
  "Air 1 Retro High Shattered Backboard 3.0 noir orange",
  "Fleece half-zip bleu marine",
  "Star Player 76 OX",
  "Fit Me Matte + Poreless 334 Warm Tan",
  "men's pullover hoodie grey",
  "Lot of 10 Cigars",
];

let ko = 0;
const echec = (quoi, attendu, obtenu, texte) => {
  ko++;
  console.error(`✗ ${quoi} : attendu ${attendu}, obtenu ${obtenu}\n    « ${String(texte).slice(0, 80)}… »`);
};

for (const t of ANGLAIS) {
  const v = verdictLangue(t);
  if (v !== "en") echec("ANGLAIS", '"en"', JSON.stringify(v), t);
  if (!estAnglaisAvere(t)) echec("ANGLAIS/estAnglaisAvere", "true", "false", t);
}
for (const t of FRANCAIS) {
  const v = verdictLangue(t);
  if (v !== "fr") echec("FRANÇAIS", '"fr"', JSON.stringify(v), t);
  if (estAnglaisAvere(t)) echec("FRANÇAIS/estAnglaisAvere", "false", "true", t);
}
for (const t of INDECIDABLES) {
  if (estAnglaisAvere(t)) echec("INDÉCIDABLE (ne doit RIEN déclencher)", "false", "true", t);
}

// ── 4. LA MARGE DU SEUIL, mesurée et non supposée ──────────────────────────
// Le seuil est à 3 ; si le plus faible des 11 anglais descendait près de 3, il
// faudrait le savoir AVANT qu'une détection se perde.
const minEn = Math.min(...ANGLAIS.map((t) => compterMotsOutils(t).en));
const maxFrDansAnglais = Math.max(...ANGLAIS.map((t) => compterMotsOutils(t).fr));
console.log(`marge du seuil : le plus faible des ${ANGLAIS.length} textes anglais compte ${minEn} mots-outils anglais (seuil 3)`);
console.log(`contamination  : le pire des textes anglais compte ${maxFrDansAnglais} mot(s)-outil(s) français (doit être 0)`);
if (minEn < 5) { ko++; console.error("✗ marge trop faible : le seuil de 3 n'est plus défendable, re-mesurer avant de toucher aux listes"); }
if (maxFrDansAnglais !== 0) { ko++; console.error("✗ un texte anglais contient un mot-outil français : le verdict tient à un cheveu"); }

if (ko) { console.error(`\n${ko} échec(s).`); process.exit(1); }
console.log(`\n✓ langue : ${ANGLAIS.length} anglais, ${FRANCAIS.length} français, ${INDECIDABLES.length} indécidables — tous conformes.`);
