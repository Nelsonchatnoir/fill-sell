// ═══════════════════════════════════════════════════════════════════════════
// LE PLAFOND D'APPELS DE resolve-categorie SUIT LE PALIER (12/10, A1)
// ═══════════════════════════════════════════════════════════════════════════
// 300 appels par 24 h et par utilisateur, fixé le 07/09 quand un article
// était publié à l'unité. La publication en lot n'a plus de limite de 20
// articles (Louis, Business) et un article coûte ~3 appels (65 pour un lot de
// 20 le 11/10 ; Louis à 278 sur 24 h). Le plafond reste un garde-fou contre
// une boucle — jamais un frein à un vrai lot du palier.
// ES module sans import (Deno + node) : scripts/lot-sans-plafond-selftest.mjs.
export const PLAFOND_RESOLVE_CATEGORIE = Object.freeze({ free: 300, premium: 900, pro: 2000, business: 4000 });

/** Le plafond d'appels sur 24 h pour un palier (inconnu = le plus bas). */
export function plafondResolveCategorie(palier) {
  return PLAFOND_RESOLVE_CATEGORIE[palier] ?? PLAFOND_RESOLVE_CATEGORIE.free;
}
