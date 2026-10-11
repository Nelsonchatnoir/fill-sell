// ═══════════════════════════════════════════════════════════════════════════
// L'ISSUE D'UN ACHAT APPLE OU GOOGLE (12/10, A8)
// ═══════════════════════════════════════════════════════════════════════════
// L'app journalisait l'OUVERTURE d'un achat (usage_logs checkout_open) mais
// jamais son ISSUE : Simon BORGET (11/10, deux essais Apple Premium) et Ciddjy
// (07/10, Premium → Pro, deux essais) — impossible de dire s'ils avaient
// annulé ou buté sur une erreur. Et l'annulation n'était JAMAIS reconnue : le
// code attendait e.code === 'USER_CANCELLED', que @capgo/native-purchases
// (8.3.3) ne renvoie pas — il rejette par MESSAGE, sans code (lu dans le
// plugin : iOS « User cancelled » / « Transaction pending » ; Android
// « Purchase is not purchased » pour TOUT refus de Google Play, annulation
// comprise, « Purchase is pending », et BILLING_SETUP_* où message et code
// sont inversés). Une annulation affichait donc « ❌ User cancelled ».
//
// classerIssueAchat rend l'issue d'un rejet du store :
//   'annule'      : la personne a fermé la feuille (iOS, lisible) ;
//   'en_attente'  : achat en attente d'approbation (contrôle parental, SCA) ;
//   'erreur'      : tout le reste, AVEC son code (celui du plugin, sinon le
//                   message normalisé) — Android : « Purchase is not
//                   purchased » ne distingue pas l'annulation du refus, le
//                   code le dit (GOOGLE_NON_ACHETE), sans inventer.
// Pur (Node + Vite) : scripts/achats-store-issue-selftest.mjs.

const ANNULE_RE = /user ?cancel+ed|cancel+ed by user|SKErrorPaymentCancelled|paymentCancelled|USER_CANCELED/i;
const EN_ATTENTE_RE = /(transaction|purchase) (is )?pending/i;

/** Le code lisible d'un rejet du plugin (jamais vide). */
export function codeErreurAchat(e) {
  const code = typeof e?.code === 'string' ? e.code.trim() : (e?.code != null ? String(e.code) : '');
  const message = String(e?.message ?? e ?? '').trim();
  // Android BILLING_SETUP_* : le plugin inverse message et code.
  if (/^BILLING_[A-Z_]+$/.test(message)) return message;
  if (code && !/\s/.test(code)) return code.slice(0, 60);
  if (/purchase is not purchased/i.test(message)) return 'GOOGLE_NON_ACHETE';
  if (/product not found|produit introuvable|cannot find product/i.test(message)) return 'PRODUIT_INTROUVABLE';
  return (message || 'INCONNU').toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 60) || 'INCONNU';
}

/** L'issue d'un rejet du store : { issue, code, message }. */
export function classerIssueAchat(e) {
  const message = String(e?.message ?? e ?? '').trim().slice(0, 200);
  const brut = `${e?.code ?? ''} ${message}`;
  if (e?.code === 'USER_CANCELLED' || ANNULE_RE.test(brut)) return { issue: 'annule', code: 'USER_CANCELLED', message };
  if (EN_ATTENTE_RE.test(brut)) return { issue: 'en_attente', code: 'PENDING', message };
  return { issue: 'erreur', code: codeErreurAchat(e), message };
}
