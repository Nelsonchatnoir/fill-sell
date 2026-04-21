import { NativePurchases } from '@capgo/native-purchases';

const PRODUCT_ID = 'app.fillsell.premium.monthly';

export const initIAP = async () => {
  try {
    await NativePurchases.setup({ appUserID: null });
    const { products } = await NativePurchases.getProducts({
      productIdentifiers: [PRODUCT_ID],
      productType: 'subs',
    });
    return products?.[0] || null;
  } catch (e) {
    console.error('[IAP] init error:', e);
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
    const isActive =
      result?.activeSubscriptions?.includes(PRODUCT_ID) ??
      result?.allPurchasedProductIdentifiers?.includes(PRODUCT_ID) ??
      false;
    return isActive;
  } catch (e) {
    if (e?.code === 'USER_CANCELLED') return false;
    throw e;
  }
};

export const restorePurchases = async () => {
  try {
    const restored = await NativePurchases.restorePurchases();
    return restored?.activeSubscriptions?.includes(PRODUCT_ID) ?? false;
  } catch (e) {
    throw e;
  }
};
