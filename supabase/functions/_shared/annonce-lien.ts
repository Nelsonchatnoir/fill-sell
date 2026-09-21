// ═══════════════════════════════════════════════════════════════════════════
// NOMMER UNE ANNONCE — L'IDENTIFIANT D'ABORD, LE LIEN ENSUITE (2026-09-21)
// ═══════════════════════════════════════════════════════════════════════════
// LE CHIFFRE QUI MOTIVE CE FICHIER. Relevé du 21/09 sur tout le parc :
// 40 dépôts 'published'/'sold' sans listing_url sur 44 651 (beebs 21/339,
// leboncoin 18/835, ebay 1/364, opla 0/122, vinted 0/42 991). Mais surtout,
// sur 500 RETRAITS : 10 ne pourront JAMAIS agir (aucun identifiant, ni sur eux
// ni sur leur dépôt) et 5 attendaient un lien qui DORMAIT sur leur propre
// dépôt, en platform_listing_id. C'est cette deuxième famille qui a laissé le
// pantalon Sandro (vendu le 20/09 à 22:42, compte PRO) en ligne sur Leboncoin :
// l'annonce 3273615091 était nommée par Leboncoin lui-même dans la réponse à
// NOTRE dépôt, rangée en platform_listing_id — et le retrait cherchait une
// listing_url vide, tombait sur « Mes annonces », et échouait.
//
// LA RÈGLE : ce n'est pas le LIEN qui identifie une annonce, c'est son
// IDENTIFIANT. Le lien n'en est qu'une écriture. Un retrait doit pouvoir partir
// dès qu'on tient l'identifiant, d'où qu'il vienne.
//
// ⛔ ET ON NE FABRIQUE JAMAIS UN LIEN QU'ON N'A PAS OBSERVÉ. La liste
// ci-dessous ne contient que des formes RELEVÉES EN RÉEL. Leboncoin en est
// absent EXPRÈS : son URL porte un segment de catégorie (/ad/vetements/<id>,
// /ad/livres/<id>, /ad/jeux_video/<id>…) qu'aucune de nos données ne donne de
// façon sûre — pour lui, le lien se lit dans le relevé du compte
// (annonces_plateforme.url, servi par l'API dashboard de Leboncoin), jamais
// reconstruit. Se tromper de segment, c'est ouvrir une page qui n'est pas
// l'annonce, et la garde d'identité du handler refusera — au mieux.

/** Formes d'URL RELEVÉES en réel, par plateforme. Leboncoin absent : cf. ci-dessus. */
const CANONIQUE: Record<string, (id: string) => string | null> = {
  // Vérifié le 13/08 : /fr/p/<id> SANS slug redirige vers l'URL canonique ;
  // un id inexistant rend « Oups, page perdue ! ».
  beebs: (id) => (/^\d+$/.test(id) ? `https://www.beebs.app/fr/p/${id}` : null),
  // Relevé sur les 42 991 annonces Vinted du parc.
  vinted: (id) => (/^\d+$/.test(id) ? `https://www.vinted.fr/items/${id}` : null),
  // Relevé sur le hub vendeur (/sh/lst/active) : /itm/<id> sans slug.
  ebay: (id) => (/^\d{9,}$/.test(id) ? `https://www.ebay.fr/itm/${id}` : null),
  // Lot 7 Opla : /product/<art_…> est la route publique ; /article/ n'a jamais
  // été valide.
  opla: (id) => (/^art_[A-Za-z0-9_-]+$/.test(id) ? `https://www.opla.co/product/${id}` : null),
};

/** L'identifiant lu DANS une URL — mêmes motifs que update-job-status. */
const MOTIFS: Record<string, RegExp> = {
  vinted: /\/items\/(\d+)/,
  leboncoin: /\/ad\/[^/]+\/(\d{6,})/,
  ebay: /\/itm\/[^?#]*?(\d{9,})/,
  beebs: /\/p\/(\d+)/,
  opla: /\/(?:product|article)\/(art_[^/?#]+)/,
};

export function idDepuisLien(platform: string, url: unknown): string | null {
  const u = String(url ?? "");
  if (!u) return null;
  const re = MOTIFS[platform];
  const m = re ? u.match(re) : null;
  return m ? m[1] : null;
}

/**
 * Le lien canonique d'une annonce à partir de son identifiant — ou null quand
 * la plateforme n'a pas de forme observée (Leboncoin). Null n'est PAS un
 * échec : c'est le refus d'inventer.
 */
export function lienDepuisId(platform: string, id: unknown): string | null {
  const s = String(id ?? "").trim();
  if (!s) return null;
  return CANONIQUE[platform]?.(s) ?? null;
}

/** Les plateformes dont on sait écrire le lien à partir du seul identifiant. */
export function lienReconstructible(platform: string): boolean {
  return Object.prototype.hasOwnProperty.call(CANONIQUE, platform);
}
