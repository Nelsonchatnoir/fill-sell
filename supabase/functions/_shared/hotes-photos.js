// ═══════════════════════════════════════════════════════════════════════════
// LES HÔTES DE PHOTOS DES PLATEFORMES — UNE SEULE LISTE (16/11/2026, lot du matin, point 4)
// ═══════════════════════════════════════════════════════════════════════════
// Partagée par le rapatriement des photos (photos-rapatriement.ts, handler-watch) et par la file qui l'ATTEND
// (contenu-fiche.js, get-pending-jobs). Cas fondateur : « Duck Tales » (yoann.besak, 31/10) et la caisse à vin
// (ornellaracano, 07/11), républications Leboncoin jamais servies : la file attendait le rapatriement de photos
// hébergées chez Vinted, que handler-watch ne rapatrie JAMAIS (décision de Nico du 06/09 : Vinted exclu du
// rapatriement de masse, c'est une question de volume). L'attente ne pouvait pas se lever. Désormais les deux côtés
// lisent le MÊME test : on n'attend que ce que le serveur sait rapatrier.
// Pur (Deno + Node + Vite), sans import.

/** Les domaines des CDN de plateformes (sous-domaines compris). */
export const CDN_DOMAINES_PLATEFORMES = Object.freeze(["vinted.net", "vinted.fr", "vinted.com", "leboncoin.fr", "beebs.app", "ebayimg.com"]);
/** Depop (09/10, relevé réel : toutes les photos d'annonce sur media-photos.depop.com) — hôtes EXACTS. */
export const CDN_HOTES_EXACTS = Object.freeze(["d2f61lx5s6m7uh.cloudfront.net", "media-photos.depop.com"]);
const DOMAINES_VINTED = Object.freeze(["vinted.net", "vinted.fr", "vinted.com"]);

const hoteDe = (u) => {
  if (typeof u !== "string") return null;
  try {
    const url = new URL(u);
    return url.protocol === "https:" ? url.hostname.toLowerCase() : null;
  } catch { return null; }
};

/** L'adresse est-elle celle d'un CDN de plateforme (https, liste fermée) ? */
export function estCdnPlateforme(u) {
  const h = hoteDe(u);
  if (!h) return false;
  if (CDN_HOTES_EXACTS.includes(h)) return true;
  return CDN_DOMAINES_PLATEFORMES.some((d) => h === d || h.endsWith(`.${d}`));
}

/** Un CDN de plateforme AUTRE que Vinted : ce que handler-watch rapatrie (Vinted en est exclu, décision du 06/09). */
export function estCdnPlateformeHorsVinted(u) {
  if (!estCdnPlateforme(u)) return false;
  const h = hoteDe(u);
  return !DOMAINES_VINTED.some((d) => h === d || h.endsWith(`.${d}`));
}

/** Le serveur sait-il rapatrier cette photo ? (Une photo déjà chez nous n'a rien à attendre : l'appelant le teste.) */
export const photoRapatriableParLeServeur = (u) => estCdnPlateformeHorsVinted(u);
