// Les règles pures de l'écran d'attente « lecture de l'annonce d'origine » (AttenteLectureOrigine.jsx, 25/10) :
// à part pour que le composant n'exporte qu'un composant (rafraîchissement à chaud) et pour les selftests.
// (25/10, Nico) Dernier recours seulement : la fiche est lue en arrière-plan dès l'import ; ici, une lecture tout de
// suite puis toutes les 6 s, 5 min au plus — et jamais « Écrire ma description » pendant l'attente (seulement si
// l'annonce d'origine n'a vraiment aucun texte : le stepper s'ouvre alors avec cette précision).

/** L'écart entre deux lectures pendant l'attente. */
export const RELECTURE_ATTENTE_MS = 6_000;
/** L'attente la plus longue (l'écran reste ouvert, il ne relit plus ; « Fermer » reste là). */
export const RELECTURE_ATTENTE_MAX_MS = 5 * 60_000;

/** Depuis combien de temps, en mots (un fait au passé, jamais une promesse). */
export function depuisEnMots(ms) {
  const s = Math.max(0, Math.round((Number(ms) || 0) / 1000));
  if (s < 60) return `${s} s`;
  return `${Math.floor(s / 60)} min`;
}
