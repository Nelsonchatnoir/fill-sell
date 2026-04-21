import { NativePurchases } from '@capgo/native-purchases';

const PRODUCT_ID = 'app.fillsell.premium.monthly';

export const initIAP = async () => {
  try {
    const { products } = await NativePurchases.getProducts({
      productIdentifiers: [PRODUCT_ID],
      productType: 'subs',
    });
    return products?.[0] || null;
  } catch (e) {
    return null;
  }
};

export const purchasePremium = async () => {
  try {
    const { products } = await NativePurchases.getProducts({
      productIdentifiers: [PRODUCT_ID],
      productType: 'subs',
    });
    alert('[IAP] getProducts: ' + JSON.stringify(products)?.slice(0, 300));
    if (!products || products.length === 0) throw new Error('Produit introuvable');
    const result = await NativePurchases.purchaseProduct({
      productIdentifier: PRODUCT_ID,
      productType: 'subs',
    });
    alert('[IAP] purchaseProduct result: ' + JSON.stringify(result)?.slice(0, 300));
    return result?.productIdentifier === PRODUCT_ID;
  } catch (e) {
    alert('[IAP] error: ' + e?.code + ' / ' + e?.message);
    if (e?.code === 'USER_CANCELLED') return false;
    throw e;
  }
};

export const restorePurchases = async () => {
  try {
    const restored = await NativePurchases.restorePurchases();
    alert('[IAP] restorePurchases: ' + JSON.stringify(restored)?.slice(0, 300));
    return restored?.activeSubscriptions?.includes(PRODUCT_ID) ?? false;
  } catch (e) {
    alert('[IAP] restore error: ' + e?.message);
    throw e;
  }
};
