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

/** Une valeur d'UNE lettre (« S », « p », « ? ») n'est une marque, une couleur,
 *  une matière ni un modèle pour personne : l'app la retire à l'insert
 *  (sanitizeJobFields, suspect_values) — elle ne compte donc pas comme une
 *  réponse. Jamais appliqué aux tailles (« S », « M », « 9 » sont légitimes). */
export function valeurUneLettre(v) {
  return /^[A-Za-zÀ-ÿ?]$/.test(String(v ?? "").trim());
}
