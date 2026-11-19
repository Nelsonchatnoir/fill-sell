// (19/11/2026, décision de Nico, point 5) LES MOTS DU CLOUD OFFERT (cloud/cloudOffert.js) — jamais un prix, jamais « arrêter ».
// Un fichier à part : les textes Cloud (textes.js, textesConnexion.js) sont tenus par d'autres lots du jour.
const FR = Object.freeze({
  pastille: 'Offert',
  pastilleSommeil: 'En pause',
  actif: 'Offert : tes annonces Vinted, Leboncoin, Beebs et Depop partent sans ordinateur, 24 h/24. Rien à payer.',
  actifLie: 'Offert tant que ton abonnement Business est actif : tes annonces Vinted, Leboncoin, Beebs et Depop partent sans ordinateur, 24 h/24. Rien à payer.',
  revientAvecBusiness: 'Ton Cloud offert revient avec ton abonnement Business.',
  achatOffert: 'Ton FillSell Cloud est offert : rien à payer.',
  resiliationLie: "Ton FillSell Cloud est offert avec ton abonnement Business : il s'arrête avec lui, à la même date.",
  resiliation: "FillSell Cloud, lui, continue : il t'est offert.",
});
const EN = Object.freeze({
  pastille: 'Gifted',
  pastilleSommeil: 'Paused',
  actif: 'Gifted: your Vinted, Leboncoin, Beebs and Depop listings go out without a computer, 24/7. Nothing to pay.',
  actifLie: 'Gifted as long as your Business plan is active: your Vinted, Leboncoin, Beebs and Depop listings go out without a computer, 24/7. Nothing to pay.',
  revientAvecBusiness: 'Your gifted Cloud comes back with your Business plan.',
  achatOffert: 'Your FillSell Cloud is a gift: nothing to pay.',
  resiliationLie: 'Your FillSell Cloud is a gift that comes with your Business plan: it stops with it, on the same date.',
  resiliation: 'FillSell Cloud keeps running: it is a gift.',
});

export function textesOffert(lang = 'fr') {
  return lang === 'en' ? EN : FR;
}
