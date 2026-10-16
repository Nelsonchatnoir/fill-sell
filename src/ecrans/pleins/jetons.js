// Jetons des écrans pleins (16/10) : teintes secondaires reprises de l'app
// (entree/theme.js : texteSecondaire #5C6560) et formats de pourcentage.
export const ENCRE2 = '#5C6560';
export const DISCRET = '#8A918E';
export const MENTHE = '#E6F1EE';
export const PECHE = '#FBEDE4';
export const PECHE_ENCRE = '#B4521F';
export const LIGNE2 = '#EFECE6';

/** « 89 % » (entier) ou « 87,4 % » (une décimale) — jamais « 0.0 % » pour un inconnu. */
export function libellePct(pct, decimales = 0) {
  if (pct === null || pct === undefined || !Number.isFinite(Number(pct))) return '—';
  const v = Number(pct);
  return v.toLocaleString('fr-FR', { minimumFractionDigits: decimales, maximumFractionDigits: decimales }) + String.fromCharCode(160) + '%';
}
