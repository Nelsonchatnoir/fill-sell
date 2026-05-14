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

export const purchasePremium = async (productId = PRODUCT_IDS.sub) => {
  try {
    const { products } = await NativePurchases.getProducts({
      productIdentifiers: [productId],
      productType: 'subs',
    });
    if (!products || products.length === 0) throw new Error('Produit introuvable');
    const result = await NativePurchases.purchaseProduct({
      productIdentifier: productId,
      productType: 'subs',
    });
    return result?.productIdentifier === productId;
  } catch (e) {
    if (e?.code === 'USER_CANCELLED') return false;
    throw e;
  }
};

export const restorePurchases = async (source) => {
  try {
    await NativePurchases.restorePurchases();
    const { purchases } = await NativePurchases.getPurchases();
    const allIds = Object.values(PRODUCT_IDS);
    const tx = purchases?.find(p => allIds.includes(p.productIdentifier));
    if (!tx) return false;
    if (tx.isActive === true) return true;
    if (tx.expirationDate && new Date(tx.expirationDate) > new Date()) return true;
    return false;
  } catch (e) {
    throw e;
  }
};
