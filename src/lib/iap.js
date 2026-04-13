import { NativePurchases, PURCHASE_TYPE } from '@capgo/native-purchases';
import { Capacitor } from '@capacitor/core';

const PRODUCT_ID = 'app.fillsell.app.premium';

export async function initIAP() {
  if (!Capacitor.isNativePlatform()) return null;
  try {
    const { products } = await NativePurchases.getProducts({
      productIdentifiers: [PRODUCT_ID],
      productType: PURCHASE_TYPE.SUBS,
    });
    return products?.[0] || null;
  } catch (e) {
    console.error('[IAP] init error:', e);
    return null;
  }
}

export async function purchasePremium() {
  if (!Capacitor.isNativePlatform()) return null;
  try {
    const transaction = await NativePurchases.purchaseProduct({
      productIdentifier: PRODUCT_ID,
      productType: PURCHASE_TYPE.SUBS,
    });
    if (!transaction?.transactionId) return null;
    return transaction;
  } catch (e) {
    console.error('[IAP] purchase error:', e);
    return null;
  }
}

export async function checkEntitlements() {
  if (!Capacitor.isNativePlatform()) return false;
  try {
    const { purchases } = await NativePurchases.getPurchases({
      onlyCurrentEntitlements: true,
    });
    return (purchases || []).some(
      p => p.productIdentifier === PRODUCT_ID || p.productId === PRODUCT_ID
    );
  } catch (e) {
    console.error('[IAP] entitlements check error:', e);
    return false;
  }
}

export async function restorePurchases() {
  if (!Capacitor.isNativePlatform()) return [];
  try {
    await NativePurchases.restorePurchases();
    const { purchases } = await NativePurchases.getPurchases({
      onlyCurrentEntitlements: true,
    });
    return purchases || [];
  } catch (e) {
    console.error('[IAP] restore error:', e);
    return [];
  }
}
