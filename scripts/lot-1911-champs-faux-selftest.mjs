// ═══════════════════════════════════════════════════════════════════════════
// Selftest VERROU — « les valeurs fausses des publications en série » (19/11/2026, compte 8ac5bbda, Business)
//   node scripts/lot-1911-champs-faux-selftest.mjs
// Ses 22 publications des 17 et 18/11 (Vinted → Leboncoin, Beebs, Depop, eBay) ont toutes abouti, avec des VALEURS
// fausses, relues sur les plateformes après le dépôt (enquête du 19/11). Quatre règles à nous,
// corrigées pour tout le parc ; les cas ci-dessous sont les siens, anonymisés (textes d'articles, aucune donnée de compte).
//   A1  Leboncoin, couleur : le mot de BASE du titre (« bleu ») passait devant la nuance de la fiche qui le précise
//       (Turquoise, Marine) — le pré-rempli juste « Marine / Turquoise » était remplacé par « Bleu / Ciel ».
//   A2  Leboncoin, taille d'un vêtement HOMME : grille en lettres seulement ; « 38 » (de « W29 | FR 38 ») y était
//       cherché, « champ sauté », annonce publiée SANS taille, en silence.
//   A3  eBay, caractéristiques lues dans le texte : « Personnage : Bleu », « Type de taille : Petite » (« Petite tache »),
//       « Textile : Velours » (« col en velours »), « Thème : État » (« État : Bon état »).
//   A4  Beebs, couleur : « Bleu clair » (couleur Vinted) absent de la palette Beebs → champ laissé vide.
// ═══════════════════════════════════════════════════════════════════════════
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let verts = 0, rouges = 0;
const ok = (cond, nom, detail = "") => {
  if (cond) verts++; else rouges++;
  console.log(`  ${cond ? "ok  " : "KO  "} ${nom}${cond ? "" : `   ← ${detail}`}`);
};
const charger = async (rel) => {
  try { return await import(new URL(`../${rel}`, import.meta.url)); }
  catch (e) { console.log(`  KO   ${rel} : ${String(e?.message ?? e).slice(0, 160)}`); rouges++; return {}; }
};
const lire = (rel) => { try { return readFileSync(path.join(RACINE, rel), "utf8"); } catch { return ""; } };

const C = await charger("supabase/functions/_shared/couleur-du-texte.js");
const A = await charger("supabase/functions/_shared/aspect-du-texte.js");
const T = await charger("supabase/functions/_shared/lbc-taille-homme.js");
const gpj = lire("supabase/functions/get-pending-jobs/index.ts");

// Listes relevées en base le 19/11 (platform_category_aspects, ebay_item_aspects).
const LBC_MODE = ["Argenté / Acier", "Beige / Camel", "Blanc", "Bleu / Ciel", "Crème / Blanc cassé / Écru", "Doré / Bronze / Cuivre",
  "Gris / Anthracite", "Imprimé", "Jaune / Moutarde", "Kaki", "Lavande / Lilas", "Marine / Turquoise", "Marron", "Multicolore", "Noir",
  "Orange / Corail", "Rose / Fuchsia", "Rouge / Bordeaux", "Vert", "Violet / Mauve", "Autre"];
const BEEBS_COULEURS = ["Anthracite", "Argenté", "Beige", "Blanc", "Bleu", "Bleu ciel", "Bleu Marine", "Bordeaux", "Camel", "Corail", "Crème",
  "Doré", "Ecru", "Fuchsia", "Gris", "Jaune", "Kaki", "Lila", "Marron", "Moutarde", "Multicolore", "Noir", "Orange", "Rose", "Rose pâle",
  "Rouge", "Turquoise", "Vert", "Vert foncé", "Violet", "À motifs"];
const PERSONNAGE = ["Aladdin", "Andrea", "Ange", "Argenté", "Astro Boy", "Barbie", "Batman", "Belle", "Blanche Neige", "Bleu", "Boo", "Mickey", "Violet"];
const THEME = ["Amour", "Animal", "Art", "Classique", "Drapeau", "Logo", "Militaire", "Rose", "Vintage"];
const TEXTILE = ["Chambray", "Crochet", "Dentelle", "Flanelle", "Jean", "Maille", "Polaire", "Satin", "Velours", "Velours côtelé"];
const TYPE_TAILLE = ["Regular", "Plus", "Petite", "Grand (longueur)", "Junior", "Maternité", "Grande taille"];

console.log("A1. Leboncoin : la nuance de la fiche précise le mot du titre (jamais l'inverse)");
{
  const prec = (titre, fiche, desc = "") => (typeof C.optionCouleurPrecisee === "function" && typeof C.couleurEcriteDansLeTexte === "function")
    ? C.optionCouleurPrecisee(C.couleurEcriteDansLeTexte(titre, desc), fiche, LBC_MODE) : "absente";
  const servie = (titre, fiche, desc = "") => {
    if (typeof C.couleurEcriteDansLeTexte !== "function") return "absente";
    const e = C.couleurEcriteDansLeTexte(titre, desc);
    const p = typeof C.optionCouleurPrecisee === "function" ? C.optionCouleurPrecisee(e, fiche, LBC_MODE) : null;
    return p ?? C.optionCouleurDansListe(e, LBC_MODE) ?? e?.base ?? null;
  };
  ok(servie("Champion Taille L Homme T-Shirt Bleu Turquoise Logo Blanc", "Turquoise") === "Marine / Turquoise",
    "T-shirt « Bleu Turquoise », fiche Turquoise → « Marine / Turquoise » (parti « Bleu / Ciel » le 17/11)",
    servie("Champion Taille L Homme T-Shirt Bleu Turquoise Logo Blanc", "Turquoise"));
  ok(servie("Champion Taille L Homme T-Shirt Bleu Turquoise Logo Blanc", null) === "Marine / Turquoise",
    "… sans couleur sur la fiche : « bleu turquoise » est UNE couleur écrite (turquoise), pas « bleu »",
    servie("Champion Taille L Homme T-Shirt Bleu Turquoise Logo Blanc", null));
  ok(servie("Lee Cooper Taille W31 L34 FR 38 Homme Jean Bleu Foncé Coupe Droite", "Marine") === "Marine / Turquoise",
    "jean « Bleu Foncé », fiche Marine → « Marine / Turquoise » (parti « Bleu / Ciel » le 18/11)",
    servie("Lee Cooper Taille W31 L34 FR 38 Homme Jean Bleu Foncé Coupe Droite", "Marine"));
  ok(servie("Tommy Hilfiger Taille M Homme Pull Bleu Col V Motif Losanges Coton", "Bleu clair") === "Bleu / Ciel",
    "pull « Bleu », fiche Bleu clair → « Bleu / Ciel » (inchangé)");
  ok(prec("Columbia Parka Homme Taille M Bleu Marine", "Turquoise") === null,
    "titre précis « bleu marine », fiche Turquoise : le TITRE gagne (règle du 26/10), rien de la fiche");
  ok(prec("Jean Lee Taille FR 48 femme Bleu Clair Relaxed Fit", "Marine") === null,
    "titre « bleu clair », fiche Marine : nuances qui se contredisent → le titre (Bleu / Ciel)");
  ok(prec("Pot à sucre Sarreguemines bleu marine à pois blancs", "Blanc") === null,
    "pot « bleu marine », fiche Blanc : autre couleur → le titre (cas du 26/10 intact)");
  ok(prec("Pantalon vert", "Kaki") === null, "titre « vert », fiche Kaki : deux couleurs de base différentes → le titre");
  ok(prec("Pull beige col roulé", "Crème") === null, "titre « beige », fiche Crème : une couleur voisine, pas une nuance du beige → le titre (Beige / Camel)");
  ok(prec("Jean bleu brut", "Marine") === "Marine / Turquoise", "titre « bleu », fiche Marine → « Marine / Turquoise »");
  ok(prec("Sweat rouge", "Bordeaux") === "Rouge / Bordeaux" || prec("Sweat rouge", "Bordeaux") === null,
    "titre « rouge », fiche Bordeaux : même option (« Rouge / Bordeaux »), rien à changer");
  ok(prec("Pull Bleu", "") === null && prec("Pull Bleu", "Menthe") === null, "fiche vide ou couleur inconnue du vocabulaire : rien");
  const i = gpj.indexOf("LA COULEUR ÉCRITE DANS LE TITRE OU LE TEXTE GAGNE TOUJOURS");
  const j = gpj.indexOf("── Couleur (valeur enregistrée de l'article, jamais déduite)");
  const bloc = i > 0 && j > i ? gpj.slice(i, j) : "";
  ok(/const ficheC = j\.inventaire_id != null \? \(couleurParArticle\.get\(Number\(j\.inventaire_id\)\)/.test(bloc) && /optionCouleurPrecisee\(ecrite, ficheC, liste\)/.test(bloc),
    "get-pending-jobs : la couleur du titre est confrontée à la couleur de la fiche (optionCouleurPrecisee)");
}

console.log("A2. Leboncoin, vêtement homme : une taille hors de la grille en lettres est DEMANDÉE, jamais sautée en silence");
{
  const f = typeof T.tailleLbcHomme === "function" ? T.tailleLbcHomme : () => "absente";
  const mode = ["Mode", "Vêtements"];
  const q1 = f({ taille: "38", tailleFiche: "W29 | FR 38", univers: "Homme", chemin: mode });
  ok(q1?.question === true && Array.isArray(q1.options) && q1.options.includes("S") && !q1.options.includes("38"),
    "jean homme « W29 | FR 38 » servi « 38 » → la question, avec la grille homme (lettres)", JSON.stringify(q1));
  ok(f({ taille: "W28 | FR 38", tailleFiche: "W28 | FR 38", univers: "Homme", chemin: mode })?.question === true,
    "« W28 | FR 38 » : jamais un nombre converti en lettre → la question");
  ok(f({ taille: "M", tailleFiche: "M", univers: "Homme", chemin: mode }) === null, "« M » : déjà dans la grille, rien");
  ok(f({ taille: "38", tailleFiche: "M / 38 / 10", univers: "Homme", chemin: mode })?.valeur === "M",
    "« 38 » d'une fiche « M / 38 / 10 » : la lettre que la FICHE dit → « M »");
  ok(f({ taille: "38 - M", tailleFiche: null, univers: "Homme", chemin: mode })?.valeur === "M",
    "« 38 - M » (écriture Leboncoin femme) → « M », la même taille");
  ok(f({ taille: "Unique", univers: "Homme", chemin: mode })?.valeur === "Taille unique", "« Unique » → « Taille unique »");
  ok(f({ taille: "2XL", univers: "Homme", chemin: mode })?.valeur === "XXL" && f({ taille: "8XL", univers: "Homme", chemin: mode })?.valeur === "8XL et plus",
    "« 2XL » → « XXL », « 8XL » → « 8XL et plus » (mêmes tailles)");
  ok(f({ taille: "38", tailleFiche: "W29 | FR 38", univers: "Femme", chemin: mode }) === null, "univers Femme (grille « 38 - M ») : inchangé");
  ok(f({ taille: "38", univers: "Homme", chemin: ["Mode", "Chaussures"] }) === null, "chaussures (pointures) : inchangé");
  ok(f({ taille: "38", univers: "Homme", chemin: mode, resolu: { taille: "S" } }) === null, "une réponse de la personne : jamais rejugée");
  ok(f({ taille: "", univers: "Homme", chemin: mode }) === null, "sans taille : rien");
  const k = gpj.indexOf("(19/11, compte 8ac5bbda) LEBONCOIN, VÊTEMENT HOMME");
  const blocT = k > 0 ? gpj.slice(k, k + 6000) : "";
  ok(/tailleLbcHomme\(\{/.test(blocT) && /needsUserField:/.test(blocT) && /status: "needs_user"/.test(blocT) && /\.eq\("status", "pending"\)/.test(blocT),
    "get-pending-jobs : la question est posée AVANT tout essai (needs_user, compare-and-set sur pending)");
  ok(/target: \{ root: null, key: "taille" \}/.test(blocT), "… la réponse va dans platform_fields.taille (le canal que lit leboncoin.js)");
}

console.log("A3. eBay : un mot ordinaire du texte ne prouve pas une caractéristique");
{
  const f = typeof A.aspectDuTexte === "function" ? A.aspectDuTexte : () => "absente";
  const tshirt = ["Champion Taille L Homme T-Shirt Bleu Turquoise Logo Blanc",
    "T-shirt Champion bleu turquoise.\n\nCouleur : Bleu turquoise\n\nCoupe : Droite\n\nDéfauts : Petite tache sur une manche."];
  ok(f({ name: "Personnage", allowedValues: PERSONNAGE, textes: tshirt }) === null, "« Personnage » jamais une couleur (« Bleu »)",
    JSON.stringify(f({ name: "Personnage", allowedValues: PERSONNAGE, textes: tshirt })));
  ok(f({ name: "Personnage", allowedValues: PERSONNAGE, textes: ["Gant Doudoune Violet à Capuche", "Couleur : Violet"] }) === null, "… ni « Violet »");
  const jean = ["Jean Femme Lee Comfort Stretch Taille FR 50 Bleu Coupe Droite", "Couleur : Bleu denim\n\nDéfauts : Petite tache brunâtre sur le bas."];
  ok(f({ name: "Type de taille", allowedValues: TYPE_TAILLE, textes: jean }) === null,
    "« Type de taille » : « Petite tache » n'est pas la taille Petite",
    JSON.stringify(f({ name: "Type de taille", allowedValues: TYPE_TAILLE, textes: jean })));
  ok(f({ name: "Type de taille", allowedValues: TYPE_TAILLE, textes: ["Jean", "Plus de photos sur demande"] }) === null, "… ni « Plus » d'un « plus de photos »");
  ok(f({ name: "Type de taille", allowedValues: TYPE_TAILLE, textes: ["Jean femme grande taille"] })?.valeur === "Grande taille", "« grande taille » écrite → « Grande taille » (inchangé)");
  ok(f({ name: "Thème", allowedValues: [...THEME, "État"], textes: ["Lacoste Pull Blanc", "État : Bon état\n\nDéfauts : petite tache sur la manche, aucun animal"] }) === null,
    "« Thème » : les lignes « État : … » et « Défauts : … » décrivent l'usure, jamais une caractéristique");
  ok(f({ name: "Textile", allowedValues: TEXTILE, textes: ["Veste de concours", "Veste à fines rayures, avec col en velours noir"] }) === null,
    "« Textile » : « col en velours » décrit le col, pas l'article");
  ok(f({ name: "Personnage", allowedValues: [...PERSONNAGE, "Tommy"], textes: ["Tommy Hilfiger Pull Bleu", "Très belle veste"] }) === null,
    "« Personnage » jamais lu en passant (rejeu : 68 fausses sur 70 — « Tommy » de Tommy Hilfiger, « Belle » de « très belle »)");
  ok(f({ name: "Thème", allowedValues: THEME, textes: ["Pull", "Thème : Militaire"] })?.valeur === "Militaire", "la ligne « Thème : Militaire » parle du thème → « Militaire »");
  ok(f({ name: "Textile", allowedValues: TEXTILE, textes: ["Veste en velours côtelé marron"] })?.valeur === "Velours côtelé", "« Veste en velours côtelé » → Textile « Velours côtelé » (inchangé)");
  ok(f({ name: "Senteur", allowedValues: ["Rose", "Vanille", "Ambre"], textes: ["Eau de parfum à la rose"] })?.valeur === "Rose",
    "un mot de couleur À DOUBLE SENS reste lisible (« Senteur : Rose » d'un parfum à la rose)");
  ok(f({ name: "Matière de la doublure", allowedValues: ["Coton", "Polyester", "Satin"], textes: ["Parka", "Doublure en polyester"] })?.valeur === "Polyester",
    "« Matière de la doublure » lit « doublure en polyester » (la partie que l'aspect nomme)");
  ok(f({ name: "Textile", allowedValues: TEXTILE, textes: ["Parka", "Capuche en polaire"] }) === null, "… mais « Textile » ne la lit pas (« capuche en polaire »)");
  ok(f({ name: "Pierre dominante", allowedValues: ["Agate", "Turquoise", "Onyx"], textes: ["Bracelet jonc bleu turquoise en acrylique"] }) === null,
    "« bleu turquoise » est une couleur, pas la pierre (rejeu : bracelet en acrylique)");
  const ea = lire("supabase/functions/_shared/ebay-aspects-du-texte.ts");
  ok(/aspectDuTexte\(\{ name: a\.name, allowedValues: a\.allowedValues, textes: \[t, d\] \}\)/.test(ea), "voie API : ebay-aspects-du-texte.ts passe par cette règle (nom de l'aspect donné)");
}

console.log("A4. Beebs : la couleur de la fiche, écrite dans la palette de Beebs");
{
  const f = typeof C.couleurDansLaPalette === "function" ? C.couleurDansLaPalette : () => "absente";
  ok(f("Bleu clair", BEEBS_COULEURS)?.valeur === "Bleu", "« Bleu clair » (Vinted) → « Bleu » (parti vide le 18/11)", JSON.stringify(f("Bleu clair", BEEBS_COULEURS)));
  ok(f("Marine", BEEBS_COULEURS)?.valeur === "Bleu Marine", "« Marine » → « Bleu Marine »");
  ok(f("Turquoise", BEEBS_COULEURS) === null && f("bleu ciel", BEEBS_COULEURS) === null, "déjà dans la palette (casse près) : rien");
  ok(f("Menthe", BEEBS_COULEURS) === null && f("", BEEBS_COULEURS) === null && f("Bleu clair", []) === null, "inconnue, vide, ou sans palette relevée : rien d'inventé");
  ok(f("Rouge / Bordeaux", BEEBS_COULEURS)?.valeur === "Rouge" && f("Marine / Turquoise", BEEBS_COULEURS)?.valeur === "Bleu",
    "une famille Leboncoin (« Rouge / Bordeaux ») : sa base « Rouge », jamais « Bordeaux » choisi", JSON.stringify(f("Rouge / Bordeaux", BEEBS_COULEURS)));
  ok(f("Bleu / Ciel", BEEBS_COULEURS) === null, "une famille dont une partie est inconnue : rien");
  const m = gpj.indexOf("(19/11, compte 8ac5bbda) BEEBS : LA COULEUR DE LA FICHE DANS LA PALETTE");
  const blocB = m > 0 ? gpj.slice(m, m + 2500) : "";
  ok(/couleurDansLaPalette\(/.test(blocB) && /r\.racines\["couleur"\] = /.test(blocB) && /methode: "palette_couleurs"/.test(blocB),
    "get-pending-jobs : servie sur la copie Beebs (racine couleur), tracée dans beebs_valeurs_posees");
  ok(/colors: \[r\.racines\["couleur"\]/.test(gpj), "… et colors[0], que beebs.js lit d'abord");
}

console.log(`\n${rouges === 0 ? "✓" : "✗"} lot-1911-champs-faux : ${verts} contrôles verts, ${rouges} rouges`);
process.exit(rouges === 0 ? 0 : 1);
