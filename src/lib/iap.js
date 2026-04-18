import { NativePurchases } from '@capgo/native-purchases';

export const purchasePremium = async () => {
  try {
    const { products } = await NativePurchases.getProducts({
      productIdentifiers: ['app.fillsell.premium.monthly'],
      productType: 'inapp',
    });
    if (!products || products.length === 0) throw new Error('Produit introuvable');
    await NativePurchases.purchaseProduct({
      productIdentifier: 'app.fillsell.premium.monthly',
    });
    return true;
  } catch (e) {
    if (e?.code === 'USER_CANCELLED') return false;
    throw e;
  }
};

export const restorePurchases = async () => {
  try {
    const restored = await NativePurchases.restorePurchases();
    return restored?.activeSubscriptions?.includes('app.fillsell.premium.monthly') ?? false;
  } catch (e) {
    throw e;
  }
};
