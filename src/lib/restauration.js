// (07/11, décision de Nico) CE QUE « RESTAURER LES ACHATS » A RETROUVÉ DANS LA BOUTIQUE — pur, sans le module natif
// (testé : scripts/restauration-achats-selftest.mjs). Avant le 07/11, seule la FORMULE était cherchée : un Cloud pris
// seul (Free + Cloud) répondait « Aucun achat actif trouvé » — et la revue Apple essaie ce bouton.
//   · formule : la transaction ACTIVE d'un produit de formule d'abord (sinon la première trouvée, comme avant) ;
//   · cloud : la transaction de l'option FillSell Cloud (app.fillsell.cloud.sub, même identifiant Apple et Google),
//     active d'abord. Chacune est revalidée par le serveur ensuite (App.jsx handleIAPRestore, achatCloud.restaurer).
export const PRODUIT_CLOUD_BOUTIQUE = 'app.fillsell.cloud.sub';   // = PRODUIT_CLOUD (src/cloud/achatCloud.js)

/** Une transaction de la boutique est-elle active ? (la règle d'avant, inchangée) */
export const transactionActive = (tx) => Boolean(tx) && (tx.isActive === true
  || Boolean(tx.expirationDate && new Date(tx.expirationDate) > new Date()) || tx.purchaseState === '1');

const choisir = (liste, ids) => {
  const siennes = (Array.isArray(liste) ? liste : []).filter((p) => ids.includes(p?.productIdentifier));
  return siennes.find(transactionActive) ?? siennes[0] ?? null;
};

/** `purchases` : NativePurchases.getPurchases().purchases ; `idsFormules` : Object.values(PRODUCT_IDS). */
export function lireRestauration(purchases, idsFormules) {
  const tx = choisir(purchases, Array.isArray(idsFormules) ? idsFormules : []);
  const txCloud = choisir(purchases, [PRODUIT_CLOUD_BOUTIQUE]);
  return {
    isPremium: transactionActive(tx),
    receipt: tx?.receipt ?? null,
    purchaseToken: tx?.purchaseToken ?? null,
    productId: tx?.productIdentifier ?? null,
    cloud: txCloud ? {
      actif: transactionActive(txCloud),
      receipt: txCloud.receipt ?? null,
      purchaseToken: txCloud.purchaseToken ?? null,
      productId: txCloud.productIdentifier ?? PRODUIT_CLOUD_BOUTIQUE,
    } : null,
  };
}
