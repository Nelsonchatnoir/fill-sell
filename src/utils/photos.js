// ── Photos : UNE forme lue, UNE forme écrite (2026-09-05) ────────────────────
//
// L'INCIDENT : lecarnetdemercury, abonné Premium depuis 12:26, publie à 12:39
// via le parcours Lens unifié ; ses deux jobs (vinted + leboncoin) tombent à
// 12:41:46 sur « Cannot read properties of undefined (reading 'includes') ».
// AUCUNE requête de publication n'est partie. Cause : cross_post_jobs.photos
// portait des CHAÎNES nues (URLs listing-photos/<uid>/raw/…), alors que les
// quatre handlers de l'extension lisent `p.url` (beebs.js:2336, ebay.js:2576,
// leboncoin.js:2416, vinted.js:5080). `p.url` sur une chaîne = undefined.
//
// D'OÙ VENAIENT LES CHAÎNES : ListingPreviewScreen applique les annonces d'un
// scan (lens_unifie) avec `photos: [...initialPhotos]` — les URLs brutes —
// tandis que generate-listing rend des OBJETS `{ type, url }`. Deux formes
// circulaient, le chemin Lens unifié existait depuis le 02/09 et personne
// n'avait encore été en position de le déclencher jusqu'à un handler
// (session Vinted absente, extension éteinte, photo 404 — 7 jobs sur 10).
//
// RÈGLE POSÉE ICI, et nulle part ailleurs :
//   · ce qui est LU accepte les deux formes (chaîne ou objet) — inventaire.photos
//     mélange déjà des strings (sync du dressing, CDN Vinted) et des objets
//     (flux retouche) ;
//   · ce qui est ÉCRIT dans un job est TOUJOURS la forme de generate-listing :
//     `{ type: "original" | "photo_<i>" | "enhanced_<i>", url }`. Jamais une
//     chaîne. Jamais `.url` posé à la main hors d'ici.
// Les handlers d'extension resteront intolérants jusqu'au prochain paquet
// CWS (0.6.19 en review) : c'est l'app qui garantit la forme.

/** URL d'une entrée photo, quelle que soit sa forme. null si rien d'utilisable. */
export function urlPhoto(entree) {
  if (entree == null) return null;
  if (typeof entree === "string") return entree.trim() || null;
  if (typeof entree !== "object") return null;
  const u = entree.url || entree.original || entree.enhanced || entree.bg_removed;
  return typeof u === "string" && u.trim() ? u : null;
}

/** Liste d'URLs (chaînes), entrées inutilisables écartées. */
export function urlsPhotos(liste) {
  if (!Array.isArray(liste)) return [];
  return liste.map(urlPhoto).filter(Boolean);
}

/** Type par défaut d'une photo au rang i — la règle EXACTE de generate-listing
 *  quand photo_option vaut "original" : la première est « original », les
 *  suivantes « photo_<i> ». */
export function typePhotoParDefaut(i) {
  return i === 0 ? "original" : `photo_${i}`;
}

/**
 * Forme ÉCRITE dans un job : toujours des objets `{ type, url }`.
 * Une chaîne devient `{ type: typePhotoParDefaut(i), url }` ; un objet garde
 * ses champs (type, url, enhanced…) et reçoit `url` normalisée et un `type`
 * s'il n'en avait pas. Les entrées sans URL sont écartées — l'index de type
 * suit l'ordre de SORTIE, comme le ferait generate-listing sur la même liste.
 */
export function entreesPhotos(liste) {
  if (!Array.isArray(liste)) return [];
  const sortie = [];
  for (const entree of liste) {
    const url = urlPhoto(entree);
    if (!url) continue;
    const i = sortie.length;
    if (typeof entree === "object") {
      const type = typeof entree.type === "string" && entree.type ? entree.type : typePhotoParDefaut(i);
      sortie.push({ ...entree, type, url });
    } else {
      sortie.push({ type: typePhotoParDefaut(i), url });
    }
  }
  return sortie;
}

// ── LES DEUX BORNES, UNE SEULE FOIS (ici) ───────────────────────────────────
// Elles vivaient dans ListingPreviewScreen, donc hors de portée du formulaire
// d'ajout manuel. Elles sont désormais ici, avec le reste des règles photo :
// UNE constante, tous les usages. C'est le même piège que la description
// manuelle, dont le plafond était écrit à trois endroits et avait commencé à
// diverger de son intention.

/** Minimum de photos pour publier : UNE (décision de Nico du 11/11/2026). Seul
 *  « 0 photo » bloque, et il bloque toujours — à l'unité comme par lot
 *  (lot/regles.js, « Sans photo ») et au serveur (generate-listing ne refuse
 *  que 0 photo). Aucune plateforme n'exige 3 photos : Leboncoin, Beebs, eBay
 *  et Depop en acceptent une ; Vinted aussi, sauf certains articles haut de
 *  gamme — Vinted ne dit pas lesquels, l'extension complète donc toute annonce
 *  Vinted à 3 en recopiant la dernière photo (VINTED_MIN_PHOTOS,
 *  chrome-extension/content-scripts/vinted.js).
 *  Du 14/07 au 11/11 la valeur était 3 (demandées à la source plutôt que
 *  recopiées) : un import à une seule photo ne pouvait plus se publier à
 *  l'unité (un compte de plusieurs milliers d'articles importés d'eBay, la
 *  plupart à une seule photo).
 *  ⛔ Ne s'applique qu'à la PUBLICATION. Un article peut parfaitement vivre en
 *  stock sans photo. Verrou : selftest:une-photo-suffit. */
export const MIN_PHOTOS = 1;

/** Les photos que le stepper montre et compte : les aperçus choisis au
 *  téléphone (pas encore montés) s'il y en a, sinon les photos de la fiche
 *  (import, article du stock). Rend la liste telle quelle, jamais une copie.
 *  Le moteur (ListingPreviewScreen) et le selftest appellent celle-ci. */
export function photosDuStepper(pickedPreviews, photos) {
  if (Array.isArray(pickedPreviews) && pickedPreviews.length > 0) return pickedPreviews;
  return Array.isArray(photos) ? photos : [];
}

/** LES VRAIES PHOTOS D'UN ARTICLE (décisions de Nico du 11/11/2026) : ses
 *  photos moins les images par défaut CONNUES, dans leur ordre. Une image par
 *  défaut (« image de remplissage ») est celle qu'une plateforme sert à une
 *  annonce sans photo, arrivée sur la fiche avec l'import ; elle n'est JAMAIS
 *  envoyée sur une plateforme, quelle que soit sa place. LA règle, la même à
 *  l'unité et dans le lot : le bouton et la vignette comptent les vraies
 *  photos, la tâche ne porte qu'elles (moteur/regles.js, construireJobs).
 *  `photosDeRemplissage` : les adresses RECONNUES À L'IDENTIQUE dans la liste
 *  fermée (publication/lot/imagesParDefaut.js, lues par photoVide.js) — jamais
 *  une estimation (choix b de Nico, 11/11 : zéro faux positif). Une image non
 *  lue, illisible ou seulement douteuse n'y figure pas : elle reste une vraie
 *  photo — jamais retirée sur un doute.
 *  `origines` : la liste d'origine quand `photos` en est la copie rang par rang
 *  (les photos rendues par la rédaction) : la RETOUCHE d'une image par défaut
 *  reconnue est retirée aussi — seulement une retouche de CE rang (son nom,
 *  <uid>/enhanced/<ts>_<rang>.png, generate-listing, porte le rang : il doit
 *  être celui de l'image par défaut). Des listes décalées, une autre adresse,
 *  une photo d'origine : rien n'est retiré par le rang (jamais sur un doute).
 *  Rien à retirer : rend `photos` lui-même (le même tableau) — un article sans
 *  image par défaut connue part exactement comme avant.
 *  @param {Array<string|{url?:string}>} photos
 *  @param {Iterable<string>|null} [photosDeRemplissage]
 *  @param {Array<string|{url?:string}>|null} [origines] */
export function vraiesPhotos(photos, photosDeRemplissage = null, origines = null) {
  const liste = Array.isArray(photos) ? photos : [];
  const vides = photosDeRemplissage instanceof Set ? photosDeRemplissage
    : new Set(Array.isArray(photosDeRemplissage) ? photosDeRemplissage : []);
  if (!liste.length || !vides.size) return liste;
  const alignees = Array.isArray(origines) && origines.length === liste.length ? origines : null;
  const gardees = liste.filter((p, i) => {
    const u = urlPhoto(p);
    if (vides.has(u)) return false;
    return !(alignees && rangDeRetouche(u) === i && vides.has(urlPhoto(alignees[i])));
  });
  // Une image retirée devant elles décale les rangs : le type POSITIONNEL des photos gardées (« original »,
  // « photo_<i> ») tombe, entreesPhotos le recalcule (la nouvelle couverture redevient « original »). Aucun lecteur ne
  // s'en sert (extension, serveur : seul « enhanced… » est lu, pour la retouche) ; un type de retouche reste.
  return gardees.length === liste.length ? liste : gardees.map(sansTypePositionnel);
}

// Le rang d'une photo RETOUCHÉE par la rédaction : <uid>/enhanced/<ts>_<rang>.png (generate-listing) ; null sinon.
const RETOUCHE_DE_RANG = /\/enhanced\/\d+_(\d+)\.[a-z0-9]+(?:[?#]|$)/i;
function rangDeRetouche(url) {
  const m = typeof url === "string" ? RETOUCHE_DE_RANG.exec(url) : null;
  return m ? Number(m[1]) : null;
}

const TYPE_POSITIONNEL = /^(original|photo_\d+)$/;
function sansTypePositionnel(p) {
  if (!p || typeof p !== "object" || typeof p.type !== "string" || !TYPE_POSITIONNEL.test(p.type)) return p;
  const reste = { ...p };
  delete reste.type;
  return reste;
}

/** La publication est-elle retenue faute de photo ? LA règle des deux peaux
 *  du stepper (StepperNouveau, ListingPreviewScreen), que le texte soit déjà
 *  rédigé ou non (décision de Nico du 11/11) : moins de MIN_PHOTOS vraies
 *  photos — donc aucune. Un compte illisible vaut 0.
 *  @param {number} nbVraiesPhotos  vraiesPhotos(…).length */
export function photosManquentPourPublier(nbVraiesPhotos) {
  return (Number(nbVraiesPhotos) || 0) < MIN_PHOTOS;
}

/** Plafond de photos par article.
 *  Photos UPLOADABLES vs photos RETOUCHÉES — deux plafonds distincts
 *  (2026-07-14). La limite de retouche (5) n'a jamais été une limite d'upload :
 *  c'est le garde-fou de COÛT de la retouche GPT Image. generate-listing le dit
 *  lui-même (MAX_RETOUCHED = 5) et gère DÉJÀ le surplus : « les photos au-delà
 *  sont conservées telles quelles ».
 *  20 depuis le 19/09 (décision Nico), et c'est une MESURE, pas un réglage :
 *  sur les publications réussies du parc, 144 portaient DÉJÀ plus de 10 photos
 *  (98 Leboncoin · 26 eBay · 19 Beebs · 1 Vinted), et le maximum observé est
 *  exactement 20. Le plafond de 10 était donc plus strict que ce que le parc
 *  publie réellement. Il reste sous les plafonds des plateformes (Vinted 20,
 *  eBay 24). */
export const MAX_PHOTOS = 20;

/** Photos LUES par l'IA d'un scan Lens (2026-09-27). Le viseur en accepte
 *  MAX_PHOTOS, comme le stepper ; l'analyse n'en lit que les cinq premières —
 *  le coût d'une analyse et le quota Lens ne bougent pas. Les suivantes vont
 *  sur la fiche et partent à la publication, jamais dans l'analyse. */
export const LENS_PHOTOS_LUES = 5;

/** Côté maximal des photos LUES par l'IA d'un scan Lens, à l'envoi (03/10,
 *  décision 4 de Nico). Le modèle de Lens (claude-haiku-4-5) ramène lui-même
 *  toute image à 1 568 px de grand côté avant de la lire : une photo de 4 032 px
 *  et la même à 2 048 px lui arrivent IDENTIQUES — mêmes tokens, même coût,
 *  même quota. Ce qui change, c'est le poids à monter depuis le téléphone
 *  (3,3 Mo → ~0,5 Mo). Les copies durables de la fiche restent à 1 024 px
 *  (LARGEUR_MAX_UPLOAD) : 2 048 reste au-dessus de tout ce qui est publié. */
export const LENS_COTE_IA = 2048;

/** Photos d'un scan Lens montées EN MÊME TEMPS (03/10, décision 4 de Nico).
 *  Trois : assez pour ne plus attendre chaque photo l'une après l'autre, pas
 *  assez pour étouffer la voie montante d'un téléphone en 4G. */
export const LENS_ENVOIS_PARALLELES = 3;

/** Lance `envoyer(i, estArrete)` pour i = 0 … n-1, `parallele` à la fois au
 *  plus, dans l'ordre des rangs. Un échec ARRÊTE le lot : plus rien n'est
 *  lancé et la promesse rejette avec la première erreur ; les envois déjà
 *  partis finissent seuls, et `estArrete()` leur dit de ne plus rien écrire.
 *  @param {number} n
 *  @param {number} parallele
 *  @param {(i: number, estArrete: () => boolean) => Promise<void>} envoyer */
export async function envoyerEnParallele(n, parallele, envoyer) {
  const total = Math.max(0, Math.floor(Number(n) || 0));
  const largeur = Math.max(1, Math.min(Math.floor(Number(parallele) || 1), total));
  let prochaine = 0;
  let arret = false;
  const estArrete = () => arret;
  if (!total) return;
  await Promise.all(Array.from({ length: largeur }, async () => {
    while (!arret && prochaine < total) {
      const i = prochaine++;
      try {
        await envoyer(i, estArrete);
      } catch (e) {
        arret = true;
        throw e;
      }
    }
  }));
}

/** L'entrée est-elle une photo retouchée (flux /enhanced/) ? Les deux formes. */
export function estPhotoRetouchee(entree) {
  if (!entree) return false;
  if (typeof entree === "string") return entree.includes("/enhanced/");
  if (typeof entree !== "object") return false;
  if (entree.enhanced || entree.bg_removed) return true;
  if (typeof entree.type === "string" && entree.type.startsWith("enhanced")) return true;
  return typeof entree.url === "string" && entree.url.includes("/enhanced/");
}
