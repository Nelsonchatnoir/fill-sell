// Retour haptique léger au toucher (02/10/2026) — mobile natif seulement.
// Le plugin @capacitor/haptics n'existe que dans les binaires ≥ 2.9.38 : sur
// un binaire plus ancien (qui reçoit pourtant ce code par l'OTA), il n'est pas
// disponible et l'appel ne fait RIEN. Jamais une erreur, jamais une attente.
import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle } from '@capacitor/haptics';

export function toucherLeger() {
  try {
    if (!Capacitor.isNativePlatform() || !Capacitor.isPluginAvailable('Haptics')) return;
    Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
  } catch { /* rien : un retour haptique ne bloque jamais un geste */ }
}
