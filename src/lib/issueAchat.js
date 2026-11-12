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
//   'abandon_ou_refus' : (31/10, lot I point 7) Android « Purchase is not
//                   purchased » : la feuille Google Play est revenue SANS achat
//                   (le plugin jette le code de Google — annulation par la
//                   personne le plus souvent, ou moyen de paiement refusé dans
//                   la feuille). Mesuré du 16/10 au 31/10 : 6 sur 6, aucun jeton,
//                   aucune notification Google, durées des abandons Apple
//                   (5 à 17 s), chaouidz payant par Stripe feuille ouverte.
//                   Jamais une « erreur » ; le code GOOGLE_NON_ACHETE reste ;
//   'erreur'      : tout le reste, AVEC son code (celui du plugin, sinon le
//                   message normalisé).
// Pur (Node + Vite) : scripts/achats-store-issue-selftest.mjs.
//
// (12/11/2026, point 7 de Nico — ROUGE) LE CODE DE GOOGLE PLAY, ENFIN LU. Du 16/10 au 12/11, 18 premiers achats Google
// sur 20 sont revenus « Purchase is not purchased » (8 comptes), feuille Google ouverte, AUCUNE commande chez Google : le
// module natif jetait la réponse de Google (BillingResponseCode), l'app ne pouvait ni dire pourquoi ni aider. Le binaire
// Android vc38 (patches/@capgo+native-purchases+8.3.3.patch) rejette avec le code `GOOGLE_<NOM>` et le message de
// débogage de Google : chaque cause a son issue, son message au client et sa trace (checkout_issue.code). Un binaire plus
// ancien (vc37 et avant) rend toujours GOOGLE_NON_ACHETE : abandon_ou_refus, comme avant.
//   'deja_abonne'  : GOOGLE_ITEM_ALREADY_OWNED — ce compte Google a déjà l'abonnement ;
//   'indisponible' : GOOGLE_ITEM_UNAVAILABLE, BILLING_UNAVAILABLE, FEATURE_NOT_SUPPORTED — Google ne le propose pas ici ;
//   'reseau'       : GOOGLE_SERVICE_UNAVAILABLE, NETWORK_ERROR, SERVICE_DISCONNECTED, SERVICE_TIMEOUT ;
//   'erreur'       : le reste (GOOGLE_DEVELOPER_ERROR, GOOGLE_ERROR…), avec son code.

const ANNULE_RE = /user ?cancel+ed|cancel+ed by user|SKErrorPaymentCancelled|paymentCancelled|USER_CANCELED/i;
const EN_ATTENTE_RE = /(transaction|purchase) (is )?pending/i;
const GOOGLE_DEJA_ABONNE = new Set(['GOOGLE_ITEM_ALREADY_OWNED']);
const GOOGLE_INDISPONIBLE = new Set(['GOOGLE_ITEM_UNAVAILABLE', 'GOOGLE_BILLING_UNAVAILABLE', 'GOOGLE_FEATURE_NOT_SUPPORTED']);
const GOOGLE_RESEAU = new Set(['GOOGLE_SERVICE_UNAVAILABLE', 'GOOGLE_NETWORK_ERROR', 'GOOGLE_SERVICE_DISCONNECTED', 'GOOGLE_SERVICE_TIMEOUT']);

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
  const code = codeErreurAchat(e);
  if (code === 'GOOGLE_NON_ACHETE') return { issue: 'abandon_ou_refus', code, message };
  if (GOOGLE_DEJA_ABONNE.has(code)) return { issue: 'deja_abonne', code, message };
  if (GOOGLE_INDISPONIBLE.has(code)) return { issue: 'indisponible', code, message };
  if (GOOGLE_RESEAU.has(code)) return { issue: 'reseau', code, message };
  return { issue: 'erreur', code, message };
}

/**
 * (12/11, point 7) Ce que l'écran dit après un achat Google revenu sans achat (pur) : une phrase, la cause, quoi faire —
 * jamais « ❌ Purchase is not purchased ». null = pas une issue de la feuille Google : l'appelant garde son message.
 * Toujours vrai ici : Google n'a rien débité (aucun achat rendu).
 */
export function messageIssueAchat(cl, lang = 'fr') {
  const fr = lang !== 'en';
  const code = String(cl?.code ?? '');
  switch (cl?.issue) {
    case 'abandon_ou_refus':
      return fr
        ? "Achat non finalisé : rien n'a été débité. Si Google Play a affiché une erreur, vérifie ton moyen de paiement dans le Play Store, puis réessaie."
        : 'Purchase not completed: nothing was charged. If Google Play showed an error, check your payment method in the Play Store, then try again.';
    case 'deja_abonne':
      return fr
        ? "Ce compte Google a déjà cet abonnement : rien n'a été débité. Touche « Restaurer mes achats » pour le retrouver."
        : 'This Google account already has this subscription: nothing was charged. Tap "Restore purchases" to get it back.';
    case 'indisponible':
      return fr
        ? "Google Play ne propose pas cet achat sur ce téléphone : rien n'a été débité. Mets à jour le Play Store, vérifie le compte Google qui y est ouvert, puis réessaie."
        : "Google Play doesn't offer this purchase on this phone: nothing was charged. Update the Play Store, check the Google account signed in there, then try again.";
    case 'reseau':
      return fr
        ? "Google Play ne répond pas : rien n'a été débité. Vérifie ta connexion, puis réessaie dans un instant."
        : "Google Play isn't responding: nothing was charged. Check your connection, then try again in a moment.";
    case 'erreur':
      if (!code.startsWith('GOOGLE_')) return null;
      return fr
        ? `Google Play a refusé l'achat (${code.slice(7)}) : rien n'a été débité. Réessaie dans un instant.`
        : `Google Play declined the purchase (${code.slice(7)}): nothing was charged. Try again in a moment.`;
    default:
      return null;
  }
}

/**
 * (12/11, point 7) Le forfait de base Google (basePlanId) à demander au module natif (pur). Le module rend, pour un
 * abonnement Android, `planIdentifier` = l'identifiant du PRODUIT et `identifier` = le forfait de base : l'app passait le
 * produit, que le module ne trouvait jamais parmi les forfaits — il prenait alors « la première offre venue ». Sans
 * forfait lisible : null (le repli d'avant).
 */
export function forfaitDeBaseGoogle(product, productId) {
  const id = typeof product?.identifier === 'string' ? product.identifier.trim() : '';
  if (id && id !== productId) return id;
  const bp = product?.basePlanId ?? product?.subscriptionOfferDetails?.[0]?.basePlanId ?? null;
  return typeof bp === 'string' && bp.trim() && bp !== productId ? bp.trim() : null;
}
