import { Purchases, LOG_LEVEL } from '@revenuecat/purchases-capacitor';

export const initIAP = async () => {
  await Purchases.setLogLevel({ level: LOG_LEVEL.DEBUG });
  await Purchases.configure({ apiKey: 'appl_XXXX' }); // remplacer par la vraie clé RevenueCat
};

export const purchasePremium = async () => {
  const { offerings } = await Purchases.getOfferings();
  const pkg = offerings.current?.monthly;
  if (!pkg) throw new Error('No package found');
  const { customerInfo } = await Purchases.purchasePackage({ aPackage: pkg });
  return customerInfo.entitlements.active['premium'] !== undefined;
};

export const restorePurchases = async () => {
  const { customerInfo } = await Purchases.restorePurchases();
  return customerInfo.entitlements.active['premium'] !== undefined;
};
