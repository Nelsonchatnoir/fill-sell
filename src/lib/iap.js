import { NativePurchases } from '@capgo/native-purchases';

export const PRODUCT_IDS = {
  sub: 'app.fillsell.premium.sub',        // Founder (fermé aux nouveaux, gardé pour restore)
  standard: 'app.fillsell.premium.standard',
  pro: 'app.fillsell.pro.sub',            // Pro 29,99 €/mois
};

// Packs consumables — mêmes ids que CoinStoreModal et validate-coin-purchase.
export const COIN_PRODUCT_IDS = [
  'app.fillsell.coins.100',
  'app.fillsell.coins.220',
  'app.fillsell.coins.460',
  'app.fillsell.coins.1150',
];

// Filet de rattrapage iOS : si l'app meurt entre purchaseProduct et la
// validation serveur, l'achat est payé mais jamais crédité — la transaction
// consumable reste NON FINALISÉE dans la file StoreKit et Transaction.updates
// la relivre au lancement suivant via l'événement `transactionUpdated`
// (iOS uniquement, ne fire jamais sur Android). On rejoue alors la validation
// serveur (credit_purchased_coins est idempotent sur apple:<transaction_id>,
// un rejeu répond already_credited sans double crédit) PUIS on finish la
// transaction via acknowledgePurchase — jamais l'inverse : une transaction
// finie avant validation réussie serait définitivement perdue. Si la
// validation échoue (offline, pas encore de session), on laisse la
// transaction en file : StoreKit la relivrera au prochain lancement.
export const listenCoinTransactionUpdates = (validate) =>
  NativePurchases.addListener('transactionUpdated', async (tx) => {
    if (!COIN_PRODUCT_IDS.includes(tx?.productIdentifier)) return;
    // StoreKit 2 : Transaction.updates ne fournit qu'un `jwsRepresentation`, pas
    // le reçu classique — on accepte donc l'un OU l'autre. Ne bailler que si les
    // deux manquent (sinon le rattrapage était neutralisé sur appareil réel).
    if (!tx?.receipt && !tx?.jwsRepresentation) {
      console.warn('[IAP] transactionUpdated sans receipt ni jws — rattrapage impossible:', tx?.transactionId);
      return;
    }
    try {
      await validate(tx);
      await NativePurchases.acknowledgePurchase({ purchaseToken: String(tx.transactionId) });
      console.log('[IAP] transaction consumable rattrapée et finalisée:', tx.transactionId);
    } catch (e) {
      console.error('[IAP] rattrapage échoué (transaction laissée en file):', tx?.transactionId, e?.message);
    }
  });

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
    // iOS StoreKit 2 : sur appareil réel (TestFlight/App Store), le reçu classique
    // (appStoreReceiptURL) est fréquemment absent — le plugin ne fournit alors que
    // `jwsRepresentation`. On remonte les DEUX : validate-coin-purchase valide le
    // reçu legacy s'il existe, sinon le JWS (App Store Server API v2).
    return { receipt: result?.receipt ?? null, jwsRepresentation: result?.jwsRepresentation ?? null, purchaseToken: result?.purchaseToken ?? null, cancelled: false };
  } catch (e) {
    console.error('[IAP] purchaseCoins error — code:', e?.code, 'message:', e?.message);
    if (e?.code === 'USER_CANCELLED') return { receipt: null, jwsRepresentation: null, purchaseToken: null, cancelled: true };
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
