// Découpe une liste d'identifiants en lots (11/10/2026).
// Un seul `.in('id', ids)` de plus de ~800 identifiants de 16 chiffres
// dépasse ce que la passerelle accepte (mesuré le 11/10 : 800 passent, 850
// coupent). Depuis que le Stock lit l'inventaire en entier (jusqu'à 3 434
// fiches), un « tout sélectionner » peut en porter bien plus : chaque
// écriture groupée passe donc par lots de 400. Pur.
export const TAILLE_LOT_IDS = 400;

export function parLots(ids, taille = TAILLE_LOT_IDS) {
  const liste = [...(ids ?? [])];
  const lots = [];
  for (let k = 0; k < liste.length; k += taille) lots.push(liste.slice(k, k + taille));
  return lots;
}
