import { useIsMobile } from './useIsMobile';

// useBureau (28/10) — vrai quand le Tableau et les Statistiques prennent leur
// mise en page d'ORDINATEUR (src/ecrans/bureau/) : navigateur web, fenêtre d'au
// moins 1 024 px. Sous ce seuil, et toujours dans l'app native (iPhone, Android,
// tablettes comprises), l'écran mobile reste celui d'avant, à l'identique.
// Réactif au redimensionnement (useIsMobile) : mêmes précautions sur l'ordre des
// hooks — ne jamais faire dépendre d'elle un hook appelé après un return.
export const SEUIL_BUREAU = 1024;
export function useBureau(isNative = false) {
  const etroit = useIsMobile(SEUIL_BUREAU);
  return !isNative && !etroit;
}
export default useBureau;
