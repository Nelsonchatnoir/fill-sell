import { NativePurchases } from '@capgo/native-purchases';
import { Capacitor } from '@capacitor/core';

export const PRODUCT_IDS = {
  sub: 'app.fillsell.premium.sub',        // Founder (fermé aux nouveaux, gardé pour restore)
  standard: 'app.fillsell.premium.standard',
  // Pro 29,99 €/mois — id DIFFÉRENT par store (2026-07-27) : l'abonnement ASC
  // app.fillsell.pro.sub est resté bloqué en review sans binaire rattaché
  // (piège App Store Connect) → app.fillsell.pro2.sub créé propre et soumis
  // avec la 2.3. Google Play garde app.fillsell.pro.sub, produit distinct et
  // fonctionnel — ne JAMAIS aligner les deux.
  pro: Capacitor.getPlatform() === 'ios' ? 'app.fillsell.pro2.sub' : 'app.fillsell.pro.sub',
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

export const purchasePremium = async (productId = PRODUCT_IDS.sub, appAccountToken = undefined, { oldPurchaseToken = null } = {}) => {
  try {
    const { products } = await NativePurchases.getProducts({
      productIdentifiers: [productId],
      productType: 'subs',
    });
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
    // Upgrade Play EN PLACE (2026-07-27) : oldPurchaseToken + replacementMode
    // sont lus par notre patch du plugin (patches/@capgo+native-purchases) —
    // la version publiée ne les transmet pas au Billing Client.
    // 2 = CHARGE_PRORATED_PRICE : cycle conservé, différence facturée au prorata
    // (même comportement que l'upgrade Stripe in situ). Android uniquement.
    if (oldPurchaseToken && Capacitor.getPlatform() === 'android') {
      purchaseOptions.oldPurchaseToken = oldPurchaseToken;
      purchaseOptions.replacementMode = 2;
    }
    const result = await NativePurchases.purchaseProduct(purchaseOptions);
    const isPremium = result?.productIdentifier === productId;
    // receipt = iOS only ; purchaseToken = Android only (cf. @capgo/native-purchases types)
    return { isPremium, receipt: result?.receipt ?? null, purchaseToken: result?.purchaseToken ?? null, cancelled: false };
  } catch (e) {
    console.error('[IAP] purchasePremium error — code:', e?.code, 'message:', e?.message);
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
    // Android (2026-07-27) : ne JAMAIS acknowledge côté client. C'est la
    // validation serveur qui acknowledge (validate-google-purchase), puis le
    // client consomme (consumeCoinPurchase). Si la validation n'aboutit
    // jamais, l'achat reste non-acknowledged → Google rembourse sous 3 jours
    // au lieu de laisser l'utilisateur débité sans crédit. iOS inchangé :
    // le finish y est couvert par listenCoinTransactionUpdates.
    if (Capacitor.getPlatform() === 'android') purchaseOptions.autoAcknowledgePurchases = false;
    const result = await NativePurchases.purchaseProduct(purchaseOptions);
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

// Consomme un pack de pièces APRÈS validation serveur réussie. Consumer =
// acknowledge implicite + le SKU redevient achetable (« item already owned »
// sinon) + il disparaît de getPurchases (le rattrapage ne le reverra plus).
export const consumeCoinPurchase = (purchaseToken) =>
  NativePurchases.consumePurchase({ purchaseToken: String(purchaseToken) });

// Filet de rattrapage Android (2026-07-27) : Transaction.updates n'existe pas
// ici — un achat payé dont la validation n'a jamais abouti (achat passé
// PENDING pendant la feuille Google puis confirmé après coup → le plugin
// reject 'Purchase is pending' ; app tuée entre purchaseProduct et la
// validation…) reste « owned » non consommé dans Play. Au lancement :
// getPurchases(inapp) → validation serveur (idempotente sur google:<orderId>)
// PUIS consumePurchase — jamais l'inverse : consommé avant validation
// réussie, l'achat serait définitivement perdu. Vécu le 27/07 au soir :
// pack débité, jamais crédité, zéro appel à validate-coin-purchase.
export const recoverAndroidCoinPurchases = async (validate) => {
  if (Capacitor.getPlatform() !== 'android') return 0;
  const { purchases } = await NativePurchases.getPurchases({ productType: 'inapp' });
  let recovered = 0;
  for (const p of purchases ?? []) {
    if (!COIN_PRODUCT_IDS.includes(p?.productIdentifier) || !p?.purchaseToken) continue;
    try {
      await validate(p);
      await consumeCoinPurchase(p.purchaseToken);
      recovered++;
      console.log('[IAP] achat Pépites rattrapé et consommé:', p.productIdentifier);
    } catch (e) {
      console.error('[IAP] rattrapage Pépites échoué (retenté au prochain lancement):', p?.productIdentifier, e?.message);
    }
  }
  return recovered;
};

// Abonnement Premium (non-Pro) actif sur le compte Google Play de l'appareil →
// purchaseToken à passer en oldPurchaseToken pour l'upgrade Pro en place.
export const findActivePlayPremiumSub = async () => {
  const { purchases } = await NativePurchases.getPurchases({ productType: 'subs' });
  const premiumIds = [PRODUCT_IDS.sub, PRODUCT_IDS.standard];
  const tx = (purchases ?? []).find(p =>
    premiumIds.includes(p?.productIdentifier) && p?.purchaseToken &&
    (p.isActive === true || (p.expirationDate && new Date(p.expirationDate) > new Date()) || p.purchaseState === '1')
  );
  return tx?.purchaseToken ?? null;
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
