// ── AUTOTEST : CHANTIER « ZÉRO FRICTION » (18/10/2026) — LES QUESTIONS DE PUBLICATION ──
// La règle de Nico : tout ce qui se devine, on le devine ; une question ne part
// que si l'information n'existe nulle part (texte, photos, autre annonce du même
// article, ce que le parc a fait accepter). Ce fichier verrouille :
//   1. la tranche Vinted (« 3-6 mois ») tranchée par le TEXTE du vendeur — rejeu
//      des 7 jours au 18/10 : 11 tailles Beebs sur 69 ne suivaient pas le titre ;
//   2. les dimensions eBay, UNE question (« Dimensions »), pas trois ;
//   3. la télémétrie : qui a levé la question (personne / moteur) et en combien
//      de secondes ; le nom technique du champ ;
//   4. les leviers IA : le chemin d'avant reste identique sans option ;
//      la liste fermée entière (Bricolage Leboncoin : 147 paires, 27 jamais
//      proposées) ; Haiku 5.5 sans température ; la bascule champ par champ.
//   node scripts/zero-friction-selftest.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const R = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => fs.readFileSync(path.join(R, p), "utf8");
const imp = (p) => import(pathToFileURL(path.join(R, p)).href);
let echecs = 0;
const ok = (t, c, d = "") => { if (c) console.log(`  ✓ ${t}`); else { echecs++; console.log(`  ✗ ${t}${d ? ` — ${d}` : ""}`); } };

const CS = await imp("src/utils/childSizes.js");
const { jugerValeurContreListe, tailleDuJob } = await imp("src/publication/moteur/listes.js");
const { questionsAPoser, dimensionsEbayGroupees, estDimensionEbay, questionsParPlateforme } = await imp("src/publication/moteur/regles.js");

console.log("\n── ZÉRO FRICTION : LES QUESTIONS DE PUBLICATION ──────────────");
console.log("\n1. La tranche Vinted, tranchée par le texte du vendeur");
{
  const t = CS.tailleEnfantSelonLeTexte;
  ok("« Pyjama 3 mois » sur « 3-6 mois / 62 cm » → 3 mois", t("3-6 mois / 62 cm", ["Pyjama 3 mois"]) === "3 mois");
  ok("« Pyjama 6 mois » sur la même tranche → 6 mois", t("3-6 mois / 62 cm", ["Pyjama 6 mois"]) === "6 mois");
  ok("le titre muet, la description dit « 3 mois » → 3 mois", t("3-6 mois / 62 cm", ["Pyjama", "Taille 3 mois, très bon état"]) === "3 mois");
  ok("« Pantalon 12-18 mois » (la tranche elle-même) → rien, la table décide", t("12-18 mois / 80 cm", ["Pantalon 12-18 mois"]) === null);
  ok("« 3 à 6 mois », « 3/6 mois » → rien", t("3-6 mois / 62 cm", ["body 3 à 6 mois"]) === null && t("3-6 mois / 62 cm", ["Pyjama 3/6 mois"]) === null);
  ok("les deux bornes nommées → rien (doute)", t("3-6 mois / 62 cm", ["lot 3 mois et 6 mois"]) === null);
  ok("jamais une taille HORS de la tranche (« Robe 12 mois » sur 6-9 mois)", t("6-9 mois / 68 cm", ["Robe 12 mois"]) === null);
  ok("une taille qui n'est pas une tranche Vinted ne bouge pas", t("9 mois (67-74 cm)", ["9 mois"]) === null && t("8 ans / 128 cm", ["8 ans"]) === null);
  const BEEBS = ["1 mois (50-54 cm)", "3 mois (54-60 cm)", "6 mois (60-66 cm)", "9 mois (67-74 cm)", "12 mois (74-80 cm)", "18 mois (80-86 cm)"];
  const j = (titre) => jugerValeurContreListe({ platform: "beebs", key: "Taille", value: "3-6 mois / 62 cm", allowedValues: BEEBS, textes: [titre] });
  ok("le jugement Beebs suit le texte : 3 mois (54-60 cm)", j("Pyjama 3 mois").valeurListe === "3 mois (54-60 cm)");
  ok("sans texte : la table, comme avant (6 mois (60-66 cm))", jugerValeurContreListe({ platform: "beebs", key: "Taille", value: "3-6 mois / 62 cm", allowedValues: BEEBS }).valeurListe === "6 mois (60-66 cm)");
  ok("le job part écrit comme la grille, selon le texte", tailleDuJob({ platform: "beebs", taille: "3-6 mois / 62 cm", lignes: [{ key: "Taille", allowedValues: BEEBS }], textes: ["Pyjama 3 mois"] }) === "3 mois (54-60 cm)");
  const LPS = lire("src/components/ListingPreviewScreen.jsx");
  ok("l'écran passe le texte du vendeur (fiche d'abord) aux trois jugements", (LPS.match(/textes: textesDuVendeurPour\(/g) ?? []).length === 3
    && /const textesDuVendeurPour = \(p\) => \[initialListing\?\.titre \?\? "", initialListing\?\.description \?\? "", edited\[p\]\?\.title \?\? "", edited\[p\]\?\.description \?\? ""\];/.test(LPS));
}
console.log("\n2. Les dimensions eBay : UNE question");
{
  const a = (name, state = "missing") => ({ name, state, value: "", allowedValues: ["30 cm", "34 cm"] });
  const statut = [a("Longueur"), a("Largeur"), a("Hauteur"), a("Type")];
  const q = questionsAPoser({ ebayRequiredStatus: statut, genericFieldToSharedKey: () => null, SHARED_PROPAGATION: {} });
  ok("Longueur, Largeur, Hauteur → une question « Dimensions »", q.questionDimensions?.lignes.map((x) => x.name).join(",") === "Longueur,Largeur,Hauteur");
  ok("les autres aspects restent des questions à part (Type)", q.redEbayAspects.map((x) => x.name).join(",") === "Type");
  ok("4 aspects → 2 questions (et non 4)", q.redRestants === 2 && q.redTotal === 2, `${q.redRestants}/${q.redTotal}`);
  ok("une seule dimension → une question ordinaire", questionsAPoser({ ebayRequiredStatus: [a("Hauteur")], genericFieldToSharedKey: () => null, SHARED_PROPAGATION: {} }).questionDimensions === null);
  ok("« Longueur de la robe », « Longueur des manches » ne sont pas des dimensions", !estDimensionEbay("Longueur de la robe") && !estDimensionEbay("Longueur des manches") && estDimensionEbay("Diamètre"));
  ok("dimensionsEbayGroupees : ≥ 2 encore à demander", dimensionsEbayGroupees(statut).length === 3 && dimensionsEbayGroupees([a("Hauteur"), a("Largeur", "ok")]).length === 0);
  const pp = questionsParPlateforme({ selected: new Set(["ebay"]), ebayRequiredStatus: statut });
  ok("« Attend une réponse » dit « Dimensions » une fois", JSON.stringify(pp.ebay) === JSON.stringify(["Dimensions", "Type"]), JSON.stringify(pp.ebay));
  const BQ = lire("src/publication/BlocQuestions.jsx");
  ok("le bloc de questions rend la carte « Dimensions » (un champ par dimension)", /q\.questionDimensions && \(\(\) => \{/.test(BQ) && /data-question="dimensions"/.test(BQ) && /m\.setEbayAspect\(a\.name, v\)/.test(BQ));
  const LPS = lire("src/components/ListingPreviewScreen.jsx");
  ok("la télémétrie compte UNE ligne « Dimensions » et la garde jusqu'à la dernière", /champs: \["Dimensions"\], dimensions: dimsEbay\.map\(d => d\.name\)/.test(LPS) && /dimOuverte\.dimensions\?\.includes\(a\.name\)/.test(LPS));
  ok("« N questions » compte les dimensions une fois", /"ebay:Dimensions" : `ebay:\$\{a\.name\}`/.test(LPS) && /\+ \(dimsGroupees\.length \? 1 : 0\)/.test(LPS));
  // 39 des 42 décorations murales interrogées sur leurs dimensions (79654, icône) sont parties dans une
  // catégorie qui n'en exige aucune : l'encart lit le rayon que le clic posera (pré-calcul), pas l'icône.
  const bloc = LPS.slice(LPS.indexOf("const ebayPreviewCategoryId = useMemo"), LPS.indexOf("// « Plateforme » d'un jeu vidéo, lue sur la machine"));
  const iRayon = bloc.indexOf("const rayonEbay = rayonsParPf?.ebay ?? null;");
  const iCopie = bloc.indexOf("const resolue = String(pf.ebayCategoryId");
  const iPrevu = bloc.indexOf("const prevue = String(rayonEbay?.id");
  const iIcone = bloc.indexOf("const direct = getEbayCategoryId(icon, pf.genre);");
  ok("catégorie de l'encart eBay : choix de la personne → copie → pré-calcul → icône (dans cet ordre)",
    iRayon > 0 && iRayon < iCopie && iCopie < iPrevu && iPrevu < iIcone && /if \(rayonEbay\?\.choisi && /.test(bloc));
  ok("l'encart se recalcule quand le pré-calcul arrive", /activeAiIcon, ebayCategorieDuClic, rayonsParPf\]\);/.test(LPS));
}
console.log("\n2 bis. eBay : l'option que le texte nomme, avant l'IA (banc : annonces eBay réelles)");
{
  const LPS = lire("src/components/ListingPreviewScreen.jsx");
  ok("liste des aspects (gagnants ou à égalité au banc) — « Nom du jeu vidéo » n'y est pas",
    /const TEXTE_AVANT_IA_EBAY = new Set\(\["Longueur de la robe", "Plateforme", "Style", "Type", "Matière de la couche extérieure"\]\);/.test(LPS) && !/TEXTE_AVANT_IA_EBAY = new Set\([^)]*Nom du jeu/.test(LPS));
  ok("appliquée aux listes fermées ET à ces aspects à liste suggérée", /isEbayClosedList\(allowedValues, mode\) \|\| \(TEXTE_AVANT_IA_EBAY\.has\(name\) && allowedValues\?\.length\)/.test(LPS));
  const { deduireOptionDuTexte } = await imp("src/publication/moteur/listes.js");
  const robe = deduireOptionDuTexte({ platform: "ebay", key: "Longueur de la robe", label: "Longueur de la robe",
    allowedValues: ["Courte", "Mi-longue", "Longue", "Midi", "Mini"], textes: [{ source: "titre", texte: "Robe longue fleurie Zara" }] });
  ok("« Robe longue fleurie » → Longueur de la robe : Longue", robe?.valeur === "Longue", JSON.stringify(robe));
}
console.log("\n3. La télémétrie dit QUI a levé la question");
{
  const LPS = lire("src/components/ListingPreviewScreen.jsx");
  const BQ = lire("src/publication/BlocQuestions.jsx");
  ok("chaque ligne « affiche » porte son heure et le nom technique du champ", (LPS.match(/affiche_le: Date\.now\(\)/g) ?? []).length >= 4 && /champ_cle: a\.key/.test(LPS) && /champ_cle: f\.key/.test(LPS));
  ok("« complete » / « retiree » disent par qui (personne / moteur) et après combien de secondes",
    /par: gesteSurQuestion\(k, vu\) \? "personne" : "moteur"/.test(LPS) && /delai_s: vu\.affiche_le \? Math\.round/.test(LPS));
  ok("les gestes du bloc de questions sont notés (partagés, génériques, eBay)",
    /m\.noterGesteQuestion\?\.\(`partage:\$\{key\}`\)/.test(BQ) && /m\.noterGesteQuestion\?\.\(`\$\{gp\}:\$\{key\}`\)/.test(BQ) && /m\.noterGesteQuestion\?\.\(`ebay:\$\{name\}`\)/.test(BQ));
  ok("une réponse notée (lot, mémoire) compte comme un geste de la personne", /function noterReponseQuestion\(gp, a, v\) \{[\s\S]{0,120}noterGesteQuestion\(`\$\{gp\}:\$\{champ\}`\);/.test(LPS));
  ok("le moteur expose noterGesteQuestion au bloc", /posesMemoire, noterReponseQuestion, noterGesteQuestion,/.test(LPS));
}
console.log("\n4. Les leviers IA : l'existant inchangé, les options mesurées");
{
  const IA = lire("supabase/functions/_shared/ebay-aspects-ia.ts");
  ok("sans option : Haiku 4.5, liste fermée bornée à 120 (comme avant)", /export const MODELE_ASPECTS_DEFAUT = "claude-haiku-4-5-20251001";/.test(IA) && /const LISTE_FERMEE_MAX = 120;/.test(IA) && /const modele = opts\.modele \?\? MODELE_ASPECTS_DEFAUT;/.test(IA));
  ok("sans photo, la question posée est mot pour mot celle d'avant (même cache)", /\+ avecPhotos,/.test(IA) && /const avecPhotos = images\.length\s*\?/.test(IA) && /: question \}\],/.test(IA));
  ok("Haiku 5.5 : réflexion coupée, effort bas, jamais de température", /claude-haiku-5-5\$\/\.test\(modele\)\) return \{ thinking: \{ type: "disabled" \}, output_config: \{ effort: "low" \} \}/.test(IA) && !/temperature/.test(IA.slice(IA.indexOf("export async function resoudreAspectsIA"), IA.indexOf("export function valeurLueDansLeContexte"))));
  ok("la liste fermée ENTIÈRE est une option (Bricolage : 147 paires)", /ligneDemande\(a, opts\.listeFermeeMax \?\? LISTE_FERMEE_MAX\)/.test(IA));
  const CC = lire("supabase/functions/_shared/claude-cache.ts");
  ok("la réponse se lit au premier bloc TEXTE (un modèle 5.5 peut ouvrir par une réflexion)", /blocs\.find\(\(b: \{ type\?: string \}\) => b\?\.type === "text"\)/.test(CC));
  const LV = lire("supabase/functions/_shared/aspects-leviers.ts");
  ok("les leviers L0 … L4 sont définis, L0 = l'existant", /if \(l === "L1" \|\| l === "L4"\)/.test(LV) && /return \{ modele: MODELE_HAIKU_45, photos: false \};/.test(LV));
  ok("les prix des modèles sont écrits (Haiku 5.5 : 0,10 / 0,50 $)", /\[MODELE_HAIKU_55\]: \[0\.1, 0\.5\]/.test(LV));
  const { pairesMaisonJardin } = await imp("src/publication/moteur/champsLbcAuto.js");
  ok("Bricolage Leboncoin a plus de 120 paires (la raison de la liste entière)", pairesMaisonJardin("Maison & Jardin > Bricolage").paires.length > 120);
}
console.log(echecs ? `\n✗ ${echecs} échec(s)` : "\n✓ zéro friction — tout est vert");
process.exit(echecs ? 1 : 0);
