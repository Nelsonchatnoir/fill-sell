// (06/11, lot « Ouverture du Cloud », phase 3 point 1 — suite) LA LANGUE DE L'APP, LUE HORS D'UN COMPOSANT QUI LA REÇOIT
// (le toast, le canal Android des ventes). La même règle que l'état `lang` d'App.jsx et qu'EcranChargementLong :
// le réglage de l'app (fs_lang, écrit par App à chaque changement de langue), sinon la langue du téléphone ou du
// navigateur (fr-* = français, toute autre = anglais), sinon le français. Jamais d'exception (mode privé, rendu sans
// navigateur, Node des selftests).
export function langueDeLApp(win = typeof window !== 'undefined' ? window : null) {
  try {
    const s = win?.localStorage?.getItem('fs_lang');
    if (s === 'en' || s === 'fr') return s;
  } catch { /* stockage indisponible */ }
  try {
    const nav = String(win?.navigator?.language ?? win?.navigator?.userLanguage ?? '').toLowerCase();
    if (nav) return nav.split('-')[0] === 'fr' ? 'fr' : 'en';
  } catch { /* sans navigateur */ }
  return 'fr';
}
