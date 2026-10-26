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
// ci-dessous ne contient que des formes RELEVÉES EN RÉEL. Leboncoin en était
// absent EXPRÈS jusqu'au 26/10 (relevé réel plus bas) : son URL porte un segment de catégorie (/ad/vetements/<id>,
// /ad/livres/<id>, /ad/jeux_video/<id>…) qu'aucune de nos données ne donne de
// façon sûre — pour lui, le lien se lit dans le relevé du compte
// (annonces_plateforme.url, servi par l'API dashboard de Leboncoin), jamais
// reconstruit. Se tromper de segment, c'est ouvrir une page qui n'est pas
// l'annonce, et la garde d'identité du handler refusera — au mieux.

//
// ── (26/10, Elodie82) LEBONCOIN A DÉSORMAIS SA FORME OBSERVÉE ────────────────
// Le portefeuille Celine (vendu sur Vinted) est resté en ligne sur Leboncoin : son retrait ouvrait
// /ad/3295261130 — un lien « lu dans le relevé » que l'extension FABRIQUAIT quand l'API ne rendait pas d'URL
// (annonce encore en vérification). Leboncoin redirige /ad/<id> vers /ad/ad/<id> : une page 404, dont la
// garde d'identité a lu le titre « 404 » et abandonné. Mesuré le 26/10 dans un vrai navigateur, sur deux
// annonces de deux rayons (portefeuille 3295261130, baskets 3295273889) :
//   /ad/<id> → 404 ; /ad/x/<id> → 404 ;
//   /ad/<N'IMPORTE QUEL RAYON RÉEL>/<id> → l'annonce elle-même (/ad/vetements/3295273889 sert les baskets,
//   dont le lien canonique de la page est /ad/chaussures/3295273889).
// La crainte d'ouvrir « une page qui n'est pas l'annonce » est donc levée : le rayon n'est qu'un décor, l'id
// décide — et la garde d'identité du handler relit toujours le titre servi.

/** (26/10) Le rayon de la forme canonique Leboncoin : un rayon RÉEL quelconque (cf. ci-dessus). */
export const RAYON_CANONIQUE_LEBONCOIN = "vetements";

/** Formes d'URL RELEVÉES en réel, par plateforme. */
const CANONIQUE: Record<string, (id: string) => string | null> = {
  // (26/10, relevé réel ci-dessus) /ad/<rayon réel>/<id> ; jamais /ad/<id> ni /ad/x/<id> (404).
  leboncoin: (id) => (/^\d{6,}$/.test(id) ? `https://www.leboncoin.fr/ad/${RAYON_CANONIQUE_LEBONCOIN}/${id}` : null),
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
  // Depop (09/10, relevé réel) : /products/<slug>/ — le slug EST l'identifiant.
  // (18/10, retrait 81188384) Le préfixe est le pseudo du vendeur, qui peut
  // porter un « _ » (thard_733-jean-bonobo-…) : 71 liens Depop sur 328 jobs
  // n'étaient pas lus. Aucun « _ » après le premier tiret (relevé du 18/10).
  depop: (id) => (/^[A-Za-z0-9_]+-[A-Za-z0-9-]*[A-Za-z0-9]$/.test(id) ? `https://www.depop.com/products/${id}/` : null),
};

/** L'identifiant lu DANS une URL — mêmes motifs que update-job-status. */
const MOTIFS: Record<string, RegExp> = {
  vinted: /\/items\/(\d+)/,
  leboncoin: /\/ad\/[^/]+\/(\d{6,})/,
  ebay: /\/itm\/[^?#]*?(\d{9,})/,
  beebs: /\/p\/(\d+)/,
  opla: /\/(?:product|article)\/(art_[^/?#]+)/,
  // (18/10) « _ » admis dans le pseudo du vendeur (cf. CANONIQUE ci-dessus).
  depop: /\/products\/([A-Za-z0-9_]+-[A-Za-z0-9-]*[A-Za-z0-9])(?:[/?#]|$)/,
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

/** (26/10) Un lien Leboncoin qui s'ouvre sur l'annonce : /ad/<rayon réel>/<id> — ni /ad/<id>, ni /ad/x/<id>, ni /ad/ad/<id>. */
const LBC_OUVRABLE = /^https:\/\/www\.leboncoin\.fr\/ad\/([a-z_]+)\/(\d{6,})(?:[/?#]|$)/;
const LBC_RAYONS_FAUX = new Set(["ad", "x"]);
/** L'identifiant Leboncoin d'un lien, même mal formé (/ad/<id>, /ad/x/<id>, /ad/ad/<id>). */
const LBC_ID_LARGE = /leboncoin\.fr\/ad\/(?:[^/?#]+\/)?(\d{6,})(?:[/?#]|$)/;

/**
 * (26/10, Elodie82) Le lien à OUVRIR pour une annonce : le lien reçu s'il s'ouvre vraiment sur l'annonce, sinon le
 * lien canonique de son identifiant (lu sur le job, sinon dans le lien lui-même), sinon le lien reçu tel quel.
 * Leboncoin seul est réécrit : ailleurs le lien reçu est rendu inchangé. Pur.
 */
export function lienOuvrable(platform: string, url: unknown, id: unknown = null): string | null {
  const u = String(url ?? "").trim();
  if (platform !== "leboncoin") return u || null;
  const m = u.match(LBC_OUVRABLE);
  if (m && !LBC_RAYONS_FAUX.has(m[1])) return u;
  const ident = String(id ?? "").trim() || (u.match(LBC_ID_LARGE)?.[1] ?? "");
  return lienDepuisId("leboncoin", ident) ?? (u || null);
}
