// ═══════════════════════════════════════════════════════════════════════════
// LES PHOTOS eBAY EN PLEINE TAILLE (23/10, point 1 — Thierry, pièces de monnaie)
// ═══════════════════════════════════════════════════════════════════════════
// Une même photo eBay se sert sous plusieurs tailles, toutes portées par la même CLÉ d'image :
//   · la vignette de la liste (GetMyeBaySelling, GalleryURL) : …/images/g/<clé>/s-l140.jpg — 140 px ;
//   · le détail Trading (GetItem, PictureURL) : …/00/s/<dims>/z/<clé>/$_1.JPG?set_id=… — 400 px ;
//   · le détail Browse : …/images/g/<clé>/s-l1600.jpg — l'ORIGINAL (jusqu'à 1 600 px).
// Mesuré le 23/10 sur la même pièce : 140×135, 400×393, 509×512 (l'original déposé par le vendeur). Les fiches de
// Thierry sont parties sur Vinted en 140 px puis en 400 px. Règle : une photo eBay lue pour une fiche est TOUJOURS
// prise en pleine taille (s-l1600, l'adresse que rend l'API Browse), dans l'ordre de l'annonce, sans doublon.
// Pur : lu par Deno (ebay-releve-api, releve-completer) et par les selftests (Node).

const CLE_IMAGES_G = /^https?:\/\/i\.ebayimg\.com\/(?:thumbs\/)?images\/g\/([A-Za-z0-9_~-]{6,})\//;
const CLE_00_S = /^https?:\/\/i\.ebayimg\.com\/00\/s\/[^/]+\/z\/([A-Za-z0-9_~-]{6,})\//;

/** La clé d'une image eBay (la même sous toutes ses tailles), ou null. Même règle que public.ebay_cle_image. */
export function cleImageEbay(u) {
  const s = String(u ?? "");
  const m = s.match(CLE_IMAGES_G) ?? s.match(CLE_00_S);
  return m ? m[1] : null;
}

/** La même photo en pleine taille ; une adresse qui n'est pas une image eBay reste telle quelle. */
export function photoEbayPleineTaille(u) {
  const cle = cleImageEbay(u);
  return cle ? `https://i.ebayimg.com/images/g/${cle}/s-l1600.jpg` : String(u ?? "");
}

/** Toutes les photos d'une annonce eBay, en pleine taille, dans l'ordre, sans doublon (même clé = même photo). */
export function photosEbayPleineTaille(urls) {
  const out = [];
  const vues = new Set();
  for (const u of Array.isArray(urls) ? urls : []) {
    if (typeof u !== "string" || !/^https?:/.test(u)) continue;
    const cle = cleImageEbay(u) ?? u;
    if (vues.has(cle)) continue;
    vues.add(cle);
    out.push(photoEbayPleineTaille(u));
  }
  return out;
}
