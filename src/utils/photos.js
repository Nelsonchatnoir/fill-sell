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

/** Minimum de photos pour publier — c'est le minimum de VINTED sur les marques
 *  premium (VINTED_MIN_PHOTOS, chrome-extension/content-scripts/vinted.js).
 *  L'extension COMPLÉTAIT jusqu'ici à 3 en dupliquant la dernière photo, faute
 *  de mieux : on le demande à la source, de vraies photos plutôt que des
 *  copies. ⛔ Ne s'applique qu'à la PUBLICATION. Un article peut parfaitement
 *  vivre en stock avec 0, 1 ou 2 photos. */
export const MIN_PHOTOS = 3;

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

/** L'entrée est-elle une photo retouchée (flux /enhanced/) ? Les deux formes. */
export function estPhotoRetouchee(entree) {
  if (!entree) return false;
  if (typeof entree === "string") return entree.includes("/enhanced/");
  if (typeof entree !== "object") return false;
  if (entree.enhanced || entree.bg_removed) return true;
  if (typeof entree.type === "string" && entree.type.startsWith("enhanced")) return true;
  return typeof entree.url === "string" && entree.url.includes("/enhanced/");
}
