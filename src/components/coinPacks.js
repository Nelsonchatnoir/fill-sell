// Source unique des packs de Pépites — consommée par CoinStoreModal (achat) et
// ConversionModal (affichage). Fichier séparé pour que les deux composants
// n'exportent que des composants (react-refresh/only-export-components).
//
// ⚠️ Les PRIX ne vivent PAS en base : coin_config ne porte que les COÛTS
// (publication, Lens) et les GRANTS mensuels. Les prix des packs sont ceux des
// stores. Vérifiés le 2026-07-14 :
//   Stripe : price_1Tqfi3… 499 c · price_1Tqfi5… 999 c · price_1Tqfi6… 1999 c
//            price_1Tqfi7… 4999 c
//   App Store Connect : app.fillsell.coins.100/220/460/1150 aux mêmes prix.
//
// ⚠️ La QUANTITÉ créditée, elle, est définie ici ET côté serveur — les trois
// doivent rester alignés, c'est le serveur qui crédite :
//   • supabase/functions/validate-coin-purchase (iOS / Android, map COIN_PRODUCTS)
//   • supabase/functions/create-checkout-session (web, metadata.coins → stripe-webhook)
//
// 2026-07-14 — pack le plus haut : 1150 → 1300 Pépites, PRIX INCHANGÉ (49,99 €).
// Le SKU reste app.fillsell.coins.1150 (déjà enregistré chez Apple/Google, on ne
// renomme pas) : seule la quantité créditée change. Motif : à 1150, la remise
// réelle (12,9 %) était identique à celle du pack 460 — le gros pack n'offrait
// aucun avantage à l'achat.

// Prix à la Pépite du pack d'entrée (100 pour 4,99 €) = référence des remises.
const REF_PRICE_PER_COIN = 4.99 / 100;

// Remise réelle d'un pack vs le pack d'entrée, en % (positif = moins cher).
// Sert à VÉRIFIER les badges ci-dessous, pas à les générer : les badges sont des
// promesses commerciales arrondies vers le bas (on sous-promet, jamais l'inverse).
export const remiseReelle = (coins, prixEuros) =>
  Math.round((1 - (prixEuros / coins) / REF_PRICE_PER_COIN) * 1000) / 10;

// Badges : arrondis prudents des remises réelles calculées ci-dessus.
//   220  → 9,0 %  de remise → « +10% » (historique, conservé)
//   460  → 12,9 % de remise → « +15% » (historique, conservé)
//   1300 → 22,9 % de remise → « +20% » (nouveau : le plus gros pack redevient
//          le plus avantageux, ce qui n'était plus le cas à 1150)
export const PACKS = [
  { id: "coins_100",  product: "app.fillsell.coins.100",  coins: 100,  price: "4,99 €",  priceEur: 4.99 },
  { id: "coins_220",  product: "app.fillsell.coins.220",  coins: 220,  price: "9,99 €",  priceEur: 9.99,  bonus: "+10%" },
  { id: "coins_460",  product: "app.fillsell.coins.460",  coins: 460,  price: "19,99 €", priceEur: 19.99, bonus: "+15%" },
  { id: "coins_1150", product: "app.fillsell.coins.1150", coins: 1300, price: "49,99 €", priceEur: 49.99, bonus: "+20%" },
];
