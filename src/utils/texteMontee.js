// (13/11/2026, audit des paiements de Nico : « date du premier prélèvement, AVANT de valider ») LA MONTÉE D'UN ABONNÉ
// (CAS 4 Premium → Pro / Business, CAS 5 Pro → Business) : ce qui est prélevé, et quand, d'après la règle du canal qui va
// facturer (celui de l'appareil : startTierCheckout) — web : create-checkout-session `proration_behavior: "always_invoice"`
// (la différence au prorata, tout de suite) ; iPhone : Apple (« Upgrades … go into effect immediately », le prix entier) ;
// Android : CHARGE_PRORATED_PRICE (lib/iap.js, la différence au prorata, l'échéance inchangée). Avant : rien ne le disait.
// ⚠ texte NEUF, à valider par Nico.
export function texteMontee(canal, fr = true) {
  if (canal === 'ios') return fr
    ? "Pas d'essai : le prix de la nouvelle formule est prélevé aujourd'hui sur ton compte Apple, puis chaque mois."
    : 'No trial: the new plan price is charged to your Apple Account today, then every month.';
  if (canal === 'android') return fr
    ? "Pas d'essai : Google Play prélève aujourd'hui la différence au prorata, puis le prix de la nouvelle formule à ta date de renouvellement habituelle."
    : 'No trial: Google Play charges the prorated difference today, then the new plan price on your usual renewal date.';
  return fr
    ? "Pas d'essai : la différence au prorata jusqu'à ta prochaine échéance est prélevée aujourd'hui sur ta carte, puis le prix de la nouvelle formule chaque mois."
    : 'No trial: the prorated difference until your next billing date is charged to your card today, then the new plan price every month.';
}
