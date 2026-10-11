// Filtre par boutique Vinted (2026-09-03) — UNE règle pour le stock ET les
// vendus (11/10, Rémi : la vue « Vendu » ignorait la boutique choisie).
// Sur `vinted_account_id`, estampillé à l'observation par la synchro.
// « Toutes » : inerte. « sans_origine » : les fiches jamais estampillées
// (vinted_account_id NULL), atteignables une fois les pastilles posées.
export function dansLaBoutique(item, filterBoutique) {
  if (filterBoutique == null || filterBoutique === 'Toutes') return true;
  if (filterBoutique === 'sans_origine') return item?.vinted_account_id == null;
  return String(item?.vinted_account_id ?? '') === String(filterBoutique);
}
