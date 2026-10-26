// ═══════════════════════════════════════════════════════════════════════════
// CE QUE VINTED EXIGE, QUEL QUE SOIT LE CATALOGUE (25/09/2026)
// ═══════════════════════════════════════════════════════════════════════════
// Règle UNIQUE, lue par l'app (src/publication/moteur/listes.js la
// ré-exporte : le stepper pose la question AVANT la création du job) et par
// le serveur (get-pending-jobs : un job venu d'un vieil écran, ou d'un rayon
// changé après coup, ne part pas au refus certain — la question est posée
// avant tout essai, pour toutes les versions de l'extension).
// ES module SANS import : chargé tel quel par Vite, par Node (autotests) et
// par Deno — même traitement que tailles.js et option-du-texte.js.
//
// POURQUOI UNE RÈGLE ET PAS LE CATALOGUE : platform_category_aspects ne
// connaît que les rayons déjà visités (≈ 100 feuilles Vinted sur 2 489), et
// il apprend « Couleur obligatoire » d'un refus 400 — pour les suivants,
// jamais pour celui qui l'a subi. Jocabroc, 24-25/09 : « Peinture Baptême du
// Christ » (Peintures) et « Grand plateau barbotine » (Bibelots) refusés
// « Le champ Couleur doit être renseigné » ; les deux lignes `color` sont
// nées à 06:25 et 06:48, du refus lui-même. La veille, même chaîne pour la
// Marque (Encadrements).
//
// MESURES QUI FONDENT LA RÈGLE (60 jours, 25/09) :
//   · Marque : 183 publications Vinted abouties depuis le stepper, TOUTES avec
//     une marque (« Sans marque » compris) — la seule sans, un livre (le
//     formulaire des livres n'a pas de champ Marque : brand_field_absent).
//   · Couleur : 211 publications abouties depuis le stepper, 194 avec une
//     couleur ; les 17 sans : Jeux vidéo ×10, Livres et médias ×6, Beauté ×1.
//     ~3 300 recréations : aucune sans couleur hors des exceptions ci-dessous.
//     Refus 400 couleur : Robes Midi, Blazers, Blouses, Encadrements,
//     Sculptures, Peintures, Bibelots, Pochoirs, Téléphones fixes — donc le
//     « required=false » que le formulaire affiche parfois n'engage à rien.
// ⛔ Dans le doute, on DEMANDE (règle de Nico, 25/09) : une couleur posée là où
//    le formulaire n'en a pas ne casse rien (vinted.js, selectColors : champ
//    absent → rien à bloquer) ; une couleur absente là où il en faut une, c'est
//    un refus. Les exceptions sont donc MESURÉES (relevé du formulaire sans
//    champ couleur, « couleur: champ sauté », publications abouties sans
//    couleur), jamais supposées.

// Forme comparable d'un libellé de rayon (accents, apostrophes, espaces).
const norme = (s) => String(s ?? "")
  .normalize("NFD").replace(/[̀-ͯ]/g, "")
  .replace(/[‘’‚‛′ʼ`´]/g, "'")
  .replace(/\s+/g, " ")
  .trim()
  .toLowerCase();

const commencePar = (chemin, prefixe) => prefixe.every((etage, i) => chemin[i] === etage);

/** Les rayons Vinted SANS champ Couleur, par préfixe de chemin (formes normées). */
export const VINTED_SANS_COULEUR = [
  ["livres et medias"],
  ["femmes", "beaute"],
  ["hommes", "soins"],
  ["electronique", "jeux video et consoles"],
  ["electronique", "telephones portables et equipements de communication", "telephones portables"],
  ["electronique", "tablettes, liseuses et accessoires", "tablettes"],
  ["electronique", "tablettes, liseuses et accessoires", "liseuses"],
  ["electronique", "objets connectes", "montres connectees"],
  ["electronique", "ordinateurs et accessoires", "ordinateurs portables"],
  ["electronique", "appareils photo et accessoires", "appareils photo"],
  ["loisirs et collections", "timbres"],
  ["loisirs et collections", "cartes a collectionner"],
  ["loisirs et collections", "jeux de societe"],
  ["loisirs et collections", "puzzles"],
  ["loisirs et collections", "cartes postales"],
  ["loisirs et collections", "pieces de monnaie et billets"],
  ["maison", "arts de la table", "couverts"],
  ["maison", "arts de la table", "verres"],
];

const chemin = (cheminCategorie) => (Array.isArray(cheminCategorie) ? cheminCategorie : []).map(norme);

/** Vinted exige une marque partout sauf « Livres et médias ». Sans rayon : oui (règle du 24/09, inchangée). */
export function vintedExigeUneMarque(cheminCategorie) {
  const c = chemin(cheminCategorie);
  return (c[0] ?? "") !== "livres et medias";
}

/** Vinted exige une couleur partout sauf les rayons mesurés sans champ Couleur. Sans rayon : rien à juger. */
export function vintedExigeUneCouleur(cheminCategorie) {
  const c = chemin(cheminCategorie);
  if (!c.length || !c[0]) return false;
  return !VINTED_SANS_COULEUR.some((prefixe) => commencePar(c, prefixe));
}

// ── VINTED EXIGE UN ISBN POUR UN LIVRE (12/10/2026, Morgane) ─────────────────
// « Blake & Mortimer – Le Mystère de la Grande Pyramide » (BD 5425, importé de
// Leboncoin) : refusé HTTP 400 « ISBN valide », alors que l'app ne l'avait pas
// demandé — le catalogue (platform_category_aspects) avait appris la ligne
// `isbn` des BD en « facultatif » (relevé du formulaire, 20/09) et ne l'a
// passée à « obligatoire » que sur le refus de Morgane. Même trou ce jour-là
// pour « Enfants et jeunes adultes » (3 feuilles) et « Manuels scolaires » :
// aucune ligne isbn. Vinted n'est pas constant (Tintin au Tibet, BD sans ISBN,
// accepté la même minute) : dans le doute, on DEMANDE (règle du 25/09).
// LA RÈGLE : tout rayon « Livres et médias › Livres › … » exige un ISBN, SAUF
// « Livres de coloriage et d'activités et revues de jeux » (5427, mesuré sans
// ISBN — handler-watch RAYONS_SANS_ISBN) ; Magazines, Musique, Vidéo n'en ont
// jamais. Sans rayon : rien à juger. Un livre SANS ISBN (ancien, auto-édité) se
// dit en une réponse fermée (ISBN_ABSENT) — jamais un envoi muet.
export const VINTED_RAYONS_LIVRES_SANS_ISBN = [5427];
export const ISBN_ABSENT = "Ce livre n'a pas d'ISBN";

/** @param {unknown[]} cheminCategorie @param {unknown} [catalogId] @returns {boolean} */
export function vintedExigeUnIsbn(cheminCategorie, catalogId = null) {
  const c = chemin(cheminCategorie);
  if (VINTED_RAYONS_LIVRES_SANS_ISBN.includes(Number(catalogId))) return false;
  if (c[0] !== "livres et medias" || c[1] !== "livres") return false;
  return !String(c[2] ?? "").startsWith("livres de coloriage");
}

/** Une valeur d'UNE lettre (« S », « p », « ? ») n'est une marque, une couleur,
 *  une matière ni un modèle pour personne : l'app la retire à l'insert
 *  (sanitizeJobFields, suspect_values) — elle ne compte donc pas comme une
 *  réponse. Jamais appliqué aux tailles (« S », « M », « 9 » sont légitimes). */
export function valeurUneLettre(v) {
  return /^[A-Za-zÀ-ÿ?]$/.test(String(v ?? "").trim());
}

// ── VINTED EXIGE UNE TAILLE POUR UN JOUET (26/10, « Maison Gabby » de Louis) ─────────────────────────────────────────
// « Maisons de poupées » (3326) jamais vue avant le 26/10 12:13 : aucune ligne au catalogue, l'écran « Vérifier » a dit
// « Prêt », le contrôle de vinted.js a arrêté le dépôt sur « Taille ». MESURÉ le 26/10 : les 10 rayons « Enfants › Jeux
// et jouets › … » relevés exigent tous la MÊME grille de 31 valeurs (tailles enfant + « Taille unique ») ; 73 annonces
// Vinted de jouets synchronisées sur 60 jours, 73 avec une taille (45 « Taille unique ») ; 11 publications de jouets,
// 11 avec une taille. Aucun rayon de jouets ne dispense de la taille : changer de rayon n'y change rien.
// LA RÈGLE : tout « Enfants › Jeux et jouets › … » exige une taille, dans cette grille ; un OBJET (tout sauf ce qui se
// porte : déguisements, tabliers et blouses) prend « Taille unique » quand rien d'autre ne la dit (fiche, copie, texte
// — un âge RECOMMANDÉ « à partir de 1 an » n'est jamais une taille).
export const VINTED_TAILLES_JOUETS = Object.freeze([
  "Prématuré, jusqu'à 44cm", "Naissance / 44 cm", "Jusqu'à 1 mois / 50 cm", "1-3 mois / 56 cm", "3-6 mois / 62 cm",
  "6-9 mois / 68 cm", "9-12 mois / 74 cm", "12-18 mois / 80 cm", "18-24 mois / 86 cm", "24-36 mois / 92 cm",
  "3 ans / 98 cm", "4 ans / 104 cm", "5 ans / 110 cm", "6 ans / 116 cm", "7 ans / 122 cm", "8 ans / 128 cm",
  "9 ans / 134 cm", "10 ans / 140 cm", "11 ans / 146 cm", "12 ans / 152 cm", "13 ans / 158 cm", "14 ans / 164 cm",
  "15 ans / 170 cm", "16 ans / 176 cm", "Taille unique", "XS", "S", "M", "L", "XL", "XXL",
]);
const JOUETS = ["enfants", "jeux et jouets"];
// Ce qui se PORTE dans la branche des jouets : la taille y est une vraie taille, jamais « Taille unique » d'office.
const JOUETS_QUI_SE_PORTENT = [
  ["enfants", "jeux et jouets", "deguisements et jeux de role"],
  ["enfants", "jeux et jouets", "loisirs creatifs", "tabliers et blouses"],
];

/** Vinted exige-t-il une taille pour ce rayon de jouets (même jamais relevé) ? */
export function vintedExigeUneTaille(cheminCategorie) {
  return commencePar(chemin(cheminCategorie), JOUETS);
}

/** Un OBJET de la branche des jouets (rien qui se porte) : « Taille unique » est sa taille. */
export function vintedObjetSansTaille(cheminCategorie) {
  const c = chemin(cheminCategorie);
  return commencePar(c, JOUETS) && !JOUETS_QUI_SE_PORTENT.some((p) => commencePar(c, p));
}
