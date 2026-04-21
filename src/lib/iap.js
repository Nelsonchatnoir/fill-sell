import { NativePurchases } from '@capgo/native-purchases';

const PRODUCT_ID = 'app.fillsell.premium.monthly';

export const initIAP = async () => {
  try {
    const { products } = await NativePurchases.getProducts({
      productIdentifiers: [PRODUCT_ID],
      productType: 'subs',
    });
    console.log('[IAP] initIAP products:', JSON.stringify(products));
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
    console.log('[IAP] purchasePremium getProducts:', JSON.stringify(products));
    if (!products || products.length === 0) throw new Error('Produit introuvable');
    console.log('[IAP] calling purchaseProduct...');
    const result = await NativePurchases.purchaseProduct({
      productIdentifier: PRODUCT_ID,
      productType: 'subs',
    });
    console.log('[IAP] purchaseProduct result:', JSON.stringify(result));
    return result?.productIdentifier === PRODUCT_ID;
  } catch (e) {
    console.error('[IAP] purchasePremium error:', e?.code, e?.message, JSON.stringify(e));
    if (e?.code === 'USER_CANCELLED') return false;
    throw e;
  }
};

export const restorePurchases = async () => {
  try {
    const restored = await NativePurchases.restorePurchases();
    console.log('[IAP] restorePurchases result:', JSON.stringify(restored));
    return restored?.activeSubscriptions?.includes(PRODUCT_ID) ?? false;
  } catch (e) {
    console.error('[IAP] restorePurchases error:', e?.code, e?.message);
    throw e;
  }
};
