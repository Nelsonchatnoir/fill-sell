// ═══════════════════════════════════════════════════════════════════════════
// LE DERNIER ÉLÉMENT D'UNE LISTE — SANS Array.prototype.at (16/11/2026, nuit, Nico)
// ═══════════════════════════════════════════════════════════════════════════
// Constaté le 16/11 (usage_logs, action_app_ratee) : « TypeError: e.at is not a function » à l'ouverture de « Tes quotas
// du mois », 3 fois, sur 3 appareils Android des examinateurs de Google Play. Leur navigateur intégré (WebView) est
// antérieur à Chrome 92, qui a apporté Array.prototype.at : l'exception démontait toute l'app.
// ⛔ Jamais de .at() dans le code de l'app — ni findLast, toSorted, structuredClone, Object.hasOwn… (verrou
//    scripts/quota-vieux-navigateur-selftest.mjs) : dernier(liste) à la place. Module pur (Node + Vite).

/** Le dernier élément d'un VRAI tableau ; undefined pour un tableau vide ou tout ce qui n'est pas un tableau. */
export function dernier(liste) {
  return Array.isArray(liste) && liste.length > 0 ? liste[liste.length - 1] : undefined;
}
