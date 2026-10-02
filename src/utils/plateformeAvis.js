// Quelle demande d'avis CE client peut-il faire ? (02/10/2026)
//   'ios' / 'android' — binaire natif ET plugin natif présent
//                       (@capgo/capacitor-in-app-review, binaires ≥ 2.9.38) ;
//   'web'             — navigateur d'ordinateur (pointeur fin, place) ;
//   null              — rien : web sur téléphone, ou binaire d'AVANT le plugin.
// ⛔ Un binaire plus ancien reçoit ce code par l'OTA sans avoir le plugin :
//    Capacitor.isPluginAvailable le dit (aucun en-tête natif), on rend null et
//    RIEN n'est appelé — ni le serveur, ni le plugin. Prouvé par
//    `npm run selftest:avis-plugin-absent`.
import { Capacitor } from '@capacitor/core';

export const PLUGIN_AVIS = 'CapgoInAppReview';

export function plateformeAvis() {
  try {
    if (Capacitor.isNativePlatform()) {
      const p = Capacitor.getPlatform();
      if ((p === 'ios' || p === 'android') && Capacitor.isPluginAvailable(PLUGIN_AVIS)) return p;
      return null;
    }
    if (typeof window === 'undefined' || !window.matchMedia) return null;
    // « Ordinateur » : un pointeur fin et de la place — là où l'extension s'installe.
    return window.matchMedia('(hover: hover) and (pointer: fine) and (min-width: 768px)').matches ? 'web' : null;
  } catch { return null; }
}
