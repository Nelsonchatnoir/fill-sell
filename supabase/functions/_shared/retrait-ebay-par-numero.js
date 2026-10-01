// ═══════════════════════════════════════════════════════════════════════════
// RETRAIT eBay SERVI À L'EXTENSION : LE NUMÉRO, JAMAIS LE TITRE (2026-10-01)
// ═══════════════════════════════════════════════════════════════════════════
// Le content script eBay (tous les builds en circulation) cherche l'annonce à
// finir dans le Hub vendeur par son numéro (?keyword=<numéro>), puis, s'il ne
// la trouve pas, par son TITRE EXACT. Ce repli n'a jamais servi (63 retraits
// eBay réussis par l'extension au 01/10 : 0 par le titre), mais il finirait
// la mauvaise annonce chez un vendeur qui a deux exemplaires du même titre, ou
// deux comptes eBay (mariecreativedigital : monpetitbazar75 relié par l'API,
// Chrome sur mmik_fr_v50odr). Un titre n'est jamais une preuve d'identité.
//
// Ici, sans nouveau paquet :
//   · un retrait eBay qui porte son numéro est servi avec un titre-étiquette
//     (« Annonce eBay n° … ») qu'aucune ligne du Hub ne peut porter : le repli
//     ne trouve rien, l'extension relit alors la page publique de l'annonce
//     (plus en ligne → clos sans geste ; encore en ligne → nouvelle tentative
//     bornée, puis « retire-la à la main ») ;
//   · un retrait eBay SANS numéro lisible n'est pas servi (il reste en file,
//     visible) : sans numéro, seul le titre pourrait le cibler.
// Seule la copie servie change : rien n'est écrit en base.
// ═══════════════════════════════════════════════════════════════════════════

// Même lecture que l'extension (DELETE_TARGETS.ebay et content-scripts/ebay.js) :
// si elle y lit un numéro, c'est ce numéro qu'elle cherchera dans le Hub.
const RE_NUMERO_EBAY = /\/itm\/(?:[^/]*\/)?(\d{9,})|itemId=(\d{9,})/i;

export function numeroAnnonceEbay(listingUrl) {
  const m = String(listingUrl ?? "").match(RE_NUMERO_EBAY);
  return m?.[1] ?? m?.[2] ?? null;
}

export function etiquetteRetraitEbay(numero) {
  return `Annonce eBay n° ${numero}`;
}

// jobs : la file à servir. Rend { servis, retenus } ; les jobs autres qu'un
// retrait eBay passent tels quels (même objet).
export function servirRetraitsEbayParNumero(jobs) {
  const servis = [];
  const retenus = [];
  for (const j of jobs ?? []) {
    if (j?.platform !== "ebay" || String(j?.action ?? "") !== "delete") {
      servis.push(j);
      continue;
    }
    const numero = numeroAnnonceEbay(j.listing_url);
    if (!numero) {
      retenus.push(j);
      continue;
    }
    servis.push({ ...j, title: etiquetteRetraitEbay(numero) });
  }
  return { servis, retenus };
}
