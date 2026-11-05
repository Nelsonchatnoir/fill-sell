// (05/11 soir, lot « Ouverture du Cloud », phase 3 point 1) LA LANGUE D'UNE PAGE À PART (retour de paiement, mot de
// passe, désinscription, retour eBay…), hors de l'app : `?lang=en|fr` d'abord (lien d'un mail anglais), puis le réglage
// de l'app (fs_lang), puis la langue du téléphone ou du navigateur (en-US, en-GB… = anglais ; fr-* = français), sinon le
// français — comme la page /legal et l'écran de confirmation. Jamais d'exception (mode privé, rendu sans navigateur).
export function languePage(win = typeof window !== 'undefined' ? window : null) {
  try {
    const p = new URLSearchParams(win?.location?.search ?? '').get('lang');
    if (p === 'en' || p === 'fr') return p;
  } catch { /* adresse illisible */ }
  try {
    const s = win?.localStorage?.getItem('fs_lang');
    if (s === 'en' || s === 'fr') return s;
  } catch { /* mode privé */ }
  try {
    const nav = String(win?.navigator?.language ?? '').toLowerCase();
    if (nav) return nav.startsWith('fr') ? 'fr' : 'en';
  } catch { /* sans navigateur */ }
  return 'fr';
}
