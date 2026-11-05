// (05/11 soir, lot « Ouverture du Cloud ») LA PAGE DE RETOUR DE STRIPE DIT CE QUI A ÉTÉ ACHETÉ.
// Avant, /success disait « Bienvenue sur le plan Premium ! » pour TOUT achat (Pro, Business, Cloud, pack) et comptait
// 12,99 € dans les mesures d'audience. create-checkout-session passe désormais `produit` (standard | pro | business |
// cloud | pack) et `essai=1` pour un Cloud en essai ; un retour sans produit (ancienne session) reste neutre.
// Pur : testé par scripts/succes-achat-selftest.mjs.
import { CLOUD_ESSAI_JOURS } from '../utils/palier.js';

/** Le message de la page de retour (pure). `params` : URLSearchParams ou objet { produit, essai }. */
export function messageSucces(params) {
  const lire = (k) => (typeof params?.get === 'function' ? params.get(k) : params?.[k]) ?? null;
  const produit = String(lire('produit') ?? '').toLowerCase();
  const essai = String(lire('essai') ?? '') === '1';
  if (produit === 'cloud') {
    return {
      produit, titre: 'Ton FillSell Cloud démarre',
      texte: essai
        ? `Ton essai gratuit de ${CLOUD_ESSAI_JOURS} jours commence : rien n'est prélevé avant sa fin. Ta machine, ton adresse IP et ton navigateur se préparent (en général moins de 2 minutes).`
        : 'Ton abonnement est actif. Ta machine, ton adresse IP et ton navigateur se préparent (en général moins de 2 minutes).',
      suite: 'Ensuite, connecte tes plateformes depuis l\'app (« Me connecter »).',
      // Une valeur d'achat n'est comptée que pour un vrai paiement (un essai ne rapporte rien ce jour-là).
      valeur: essai ? null : 24.99,
    };
  }
  if (produit === 'standard' || produit === 'premium') {
    return { produit: 'standard', titre: 'Bienvenue sur le plan Premium !', texte: 'Ton abonnement est actif : tes nouveaux quotas sont disponibles tout de suite.', suite: 'Annulable à tout moment, en 1 clic', valeur: 12.99 };
  }
  if (produit === 'pro') {
    return { produit, titre: 'Bienvenue sur le plan Pro !', texte: 'Ton abonnement est actif : tes nouveaux quotas sont disponibles tout de suite.', suite: 'Annulable à tout moment, en 1 clic', valeur: null };
  }
  if (produit === 'business') {
    return { produit, titre: 'Bienvenue sur FillSell Business !', texte: 'Ton abonnement est actif : tes nouveaux quotas sont disponibles tout de suite.', suite: 'Annulable à tout moment, en 1 clic', valeur: null };
  }
  if (produit === 'pack') {
    return { produit, titre: 'Achat confirmé !', texte: 'Merci : ton achat est crédité sur ton compte.', suite: null, valeur: null };
  }
  return { produit: null, titre: 'Paiement confirmé', texte: 'Merci : ton achat est bien enregistré.', suite: null, valeur: null };
}
