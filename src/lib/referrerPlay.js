// ═══════════════════════════════════════════════════════════════════════════
// LE REFERRER GOOGLE PLAY, CÔTÉ APP (14/11/2026, bloc E1) — ⛔ INACTIF
// ═══════════════════════════════════════════════════════════════════════════
// Branche le module natif « InstallReferrer » (android/app/src/main/java/app/fillsell/app/InstallReferrerPlugin.java,
// prochain binaire Android) sur la règle pure de src/utils/acquisition.js (enrichirSourceAndroid). Tant que
// PLAY_REFERRER_BINAIRE_MIN vaut null, enrichirSourceAndroid rend la main AVANT d'appeler quoi que ce soit ici : ni
// App.getInfo, ni isPluginAvailable, ni le module.
// ⛔ Un plugin Capacitor est un Proxy qui répond à TOUTE propriété, `then` compris : il n'est JAMAIS rendu par une
// promesse (scripts/push-plugin-proxy-selftest.mjs). On n'en rend que le résultat de `.lire()`, un objet simple.
// Verrou : scripts/acquisition-meta-selftest.mjs.
import { Capacitor, registerPlugin } from '@capacitor/core';
import { enrichirSourceAndroid } from '../utils/acquisition';

const InstallReferrer = registerPlugin('InstallReferrer');

/** Lit une fois la campagne de l'installation (Android seulement). Rend une promesse ; jamais d'exception. */
export function lancerLectureReferrerPlay() {
  try {
    if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') return Promise.resolve(null);
    return enrichirSourceAndroid({
      plateforme: 'android',
      // Chargé à la demande (jamais sur le web, jamais tant que la borne est fermée) ; on rend la VERSION, pas le module.
      binaire: () => import('@capacitor/app').then((m) => m.App.getInfo()).then((i) => i?.version ?? null, () => null),
      disponible: () => Capacitor.isPluginAvailable('InstallReferrer') === true,
      lire: () => InstallReferrer.lire(),
    });
  } catch {
    return Promise.resolve(null);
  }
}
