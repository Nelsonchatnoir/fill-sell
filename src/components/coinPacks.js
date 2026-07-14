// Source unique des packs de Pépites — consommée par CoinStoreModal (achat) et
// ConversionModal (affichage). Fichier séparé pour que les deux composants
// n'exportent que des composants (react-refresh/only-export-components).
//
// ⚠️ Ces prix ne vivent PAS en base : coin_config ne porte que les COÛTS
// (publication, Lens) et les GRANTS mensuels. Les prix des packs sont ceux des
// stores. Vérifiés le 2026-07-14 :
//   Stripe : price_1Tqfi3… 499 c · price_1Tqfi5… 999 c · price_1Tqfi6… 1999 c
//            price_1Tqfi7… 4999 c
//   App Store Connect : app.fillsell.coins.100/220/460/1150 aux mêmes prix.
export const PACKS = [
  { id: "coins_100",  product: "app.fillsell.coins.100",  coins: 100,  price: "4,99 €" },
  { id: "coins_220",  product: "app.fillsell.coins.220",  coins: 220,  price: "9,99 €",  bonus: "+10%" },
  { id: "coins_460",  product: "app.fillsell.coins.460",  coins: 460,  price: "19,99 €", bonus: "+15%" },
  { id: "coins_1150", product: "app.fillsell.coins.1150", coins: 1150, price: "49,99 €", bonus: "+15%" },
];
