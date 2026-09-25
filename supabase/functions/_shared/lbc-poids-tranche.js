// ═══════════════════════════════════════════════════════════════════════════
// LEBONCOIN PRO — LA TRANCHE « POIDS DU COLIS » D'UNE ANNONCE, RELUE (2026-09-25)
// ═══════════════════════════════════════════════════════════════════════════
// Le formulaire PRO exige « Poids du colis* » (estimated_parcel_weight), une
// liste fermée de 11 tranches. L'annonce en ligne, elle, porte ce même champ
// en GRAMMES : la BORNE HAUTE de la tranche choisie. Relevé en base le 25/09
// sur 31 annonces publiées par FillSell puis relevées :
//   « Jusqu’à 100 g » → 100 (7) · « De 100 g à 250 g » → 250 (2)
//   · « De 500 g à 1 kg » → 1000 (21).
// Ce n'est donc pas une déduction : c'est la même tranche, relue dans l'autre
// sens. Utilisé pour une REPUBLICATION seulement (l'annonce d'origine fait
// foi) — cas fondateur Les Petites Fioles, calendrier de l'Avent (fb358c75) :
// 500 g connus, « Poids du colis* » laissé vide, recréation arrêtée.
// ⛔ Jamais depuis un format (« Petit » ne dit pas « De 250 g à 500 g », règle
//    du 28/08) ; jamais par-dessus une valeur déjà posée.
// ES module SANS import (Deno + Node).

export const LBC_TRANCHES_POIDS = [
  [100, "Jusqu’à 100 g"],
  [250, "De 100 g à 250 g"],
  [500, "De 250 g à 500 g"],
  [1000, "De 500 g à 1 kg"],
  [2000, "De 1 kg à 2 kg"],
  [5000, "De 2 kg à 5 kg"],
  [10000, "De 5 kg à 10 kg"],
  [20000, "De 10 kg à 20 kg"],
  [30000, "De 20 kg à 30 kg"],
  [40000, "De 30 kg à 40 kg"],
];
export const LBC_TRANCHE_AU_DELA = "Supérieur à 40 kg";

/** La tranche dont la borne haute couvre ce poids (g), ou null si illisible. */
export function trancheLbcDepuisGrammes(grammes) {
  const g = Number(grammes);
  if (!Number.isFinite(g) || g <= 0) return null;
  for (const [borne, libelle] of LBC_TRANCHES_POIDS) if (g <= borne) return libelle;
  return LBC_TRANCHE_AU_DELA;
}
