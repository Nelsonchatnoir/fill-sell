import { NativePurchases } from '@capgo/native-purchases';

const PRODUCT_ID = 'app.fillsell.premium.sub';

export const initIAP = async () => {
  try {
    const { products } = await NativePurchases.getProducts({
      productIdentifiers: [PRODUCT_ID],
      productType: 'subs',
    });
    return products?.[0] || null;
  } catch (e) {
    console.error('[IAP] init error:', e?.code, e?.message);
    return null;
  }
};

export const purchasePremium = async () => {
  try {
    const { products } = await NativePurchases.getProducts({
      productIdentifiers: [PRODUCT_ID],
      productType: 'subs',
    });
    if (!products || products.length === 0) throw new Error('Produit introuvable');
    const result = await NativePurchases.purchaseProduct({
      productIdentifier: PRODUCT_ID,
      productType: 'subs',
    });
    return result?.productIdentifier === PRODUCT_ID;
  } catch (e) {
    if (e?.code === 'USER_CANCELLED') return false;
    throw e;
  }
};

export const restorePurchases = async () => {
  try {
    await NativePurchases.restorePurchases();
    const { purchases } = await NativePurchases.getPurchases();
    const tx = purchases?.find(p => p.productIdentifier === PRODUCT_ID);
    if (!tx) return false;
    if (tx.isActive === true) return true;
    if (tx.expirationDate && new Date(tx.expirationDate) > new Date()) return true;
    return false;
  } catch (e) {
    throw e;
  }
};
