import { NativePurchases } from '@capgo/native-purchases';

export const PRODUCT_IDS = {
  sub: 'app.fillsell.premium.sub',
  standard: 'app.fillsell.premium.standard',
};

export const initIAP = async () => {
  try {
    const { products } = await NativePurchases.getProducts({
      productIdentifiers: [PRODUCT_IDS.sub],
      productType: 'subs',
    });
    return products?.[0] || null;
  } catch (e) {
    return null;
  }
};

export const purchasePremium = async (productId = PRODUCT_IDS.sub, appAccountToken = undefined) => {
  try {
    const { products } = await NativePurchases.getProducts({
      productIdentifiers: [productId],
      productType: 'subs',
    });
    console.log('[IAP] getProducts result:', JSON.stringify(products));
    if (!products || products.length === 0) throw new Error('Produit introuvable — product not found in Play Console');
    const product = products[0];
    // Android Billing v5+ exige planIdentifier (basePlanId) pour les subs
    const planId = product?.planIdentifier
      ?? product?.basePlanId
      ?? product?.subscriptionOfferDetails?.[0]?.basePlanId
      ?? product?.offers?.[0]?.id
      ?? null;
    console.log('[IAP] planId extracted:', planId, 'from product keys:', Object.keys(product || {}));
    const purchaseOptions = { productIdentifier: productId, productType: 'subs' };
    if (planId) purchaseOptions.planIdentifier = planId;
    if (appAccountToken) purchaseOptions.appAccountToken = appAccountToken;
    console.log('[IAP] purchaseProduct options:', JSON.stringify(purchaseOptions));
    const result = await NativePurchases.purchaseProduct(purchaseOptions);
    console.log('[IAP] purchaseProduct result:', JSON.stringify(result));
    const isPremium = result?.productIdentifier === productId;
    // receipt = iOS only ; purchaseToken = Android only (cf. @capgo/native-purchases types)
    return { isPremium, receipt: result?.receipt ?? null, purchaseToken: result?.purchaseToken ?? null, cancelled: false };
  } catch (e) {
    console.error('[IAP] purchasePremium error — code:', e?.code, 'message:', e?.message, 'full:', JSON.stringify(e));
    if (e?.code === 'USER_CANCELLED') return { isPremium: false, receipt: null, cancelled: true };
    throw e;
  }
};

// Achat d'un pack de pièces (produit CONSUMABLE, productType 'inapp').
// Retourne le reçu iOS ou le purchaseToken Android à faire valider par
// l'edge function validate-coin-purchase (qui crédite le wallet).
export const purchaseCoins = async (productId, appAccountToken = undefined) => {
  try {
    const purchaseOptions = { productIdentifier: productId, productType: 'inapp' };
    if (appAccountToken) purchaseOptions.appAccountToken = appAccountToken;
    console.log('[IAP] purchaseCoins options:', JSON.stringify(purchaseOptions));
    const result = await NativePurchases.purchaseProduct(purchaseOptions);
    console.log('[IAP] purchaseCoins result:', JSON.stringify(result));
    return { receipt: result?.receipt ?? null, purchaseToken: result?.purchaseToken ?? null, cancelled: false };
  } catch (e) {
    console.error('[IAP] purchaseCoins error — code:', e?.code, 'message:', e?.message);
    if (e?.code === 'USER_CANCELLED') return { receipt: null, purchaseToken: null, cancelled: true };
    throw e;
  }
};

export const restorePurchases = async (source) => {
  try {
    await NativePurchases.restorePurchases();
    const { purchases } = await NativePurchases.getPurchases();
    const allIds = Object.values(PRODUCT_IDS);
    const tx = purchases?.find(p => allIds.includes(p.productIdentifier));
    if (!tx) return { isPremium: false, receipt: null, purchaseToken: null, productId: null };
    const isActive = tx.isActive === true || (tx.expirationDate && new Date(tx.expirationDate) > new Date()) || tx.purchaseState === '1';
    return { isPremium: !!isActive, receipt: tx.receipt ?? null, purchaseToken: tx.purchaseToken ?? null, productId: tx.productIdentifier ?? null };
  } catch (e) {
    throw e;
  }
};
