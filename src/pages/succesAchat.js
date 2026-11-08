// (05/11 soir, lot « Ouverture du Cloud ») LA PAGE DE RETOUR DE STRIPE DIT CE QUI A ÉTÉ ACHETÉ.
// Avant, /success disait « Bienvenue sur le plan Premium ! » pour TOUT achat (Pro, Business, Cloud, pack) et comptait
// 12,99 € dans les mesures d'audience. create-checkout-session passe désormais `produit` (standard | pro | business |
// cloud | pack) et `essai=1` pour un Cloud en essai ; un retour sans produit (ancienne session) reste neutre.
// Pur : testé par scripts/succes-achat-selftest.mjs.
import { CLOUD_ESSAI_JOURS } from '../utils/palier.js';

// (05/11 soir, phase 3 point 1) Les mêmes messages en anglais : `lang` = 'en' (pages/languePage.js) ; le français reste
// mot pour mot celui d'avant.
const EN = {
  cloudTitre: 'Your FillSell Cloud is starting',
  cloudEssai: (j) => `Your ${j}-day free trial starts now: nothing is charged before it ends. Your machine, your IP address and your browser are being set up (usually under 2 minutes).`,
  cloudPaye: 'Your subscription is active. Your machine, your IP address and your browser are being set up (usually under 2 minutes).',
  cloudSuite: 'Next step: connect your accounts — the button below takes you straight there.',
  cloudBouton: 'Connect my accounts →',
  actif: 'Your subscription is active: your new quotas are available right away.',
  annulable: 'Cancel anytime, in 1 click',
};

/** Le message de la page de retour (pure). `params` : URLSearchParams ou objet { produit, essai } ; `lang` : 'fr' | 'en'. */
export function messageSucces(params, lang = 'fr') {
  const en = lang === 'en';
  const lire = (k) => (typeof params?.get === 'function' ? params.get(k) : params?.[k]) ?? null;
  const produit = String(lire('produit') ?? '').toLowerCase();
  const essai = String(lire('essai') ?? '') === '1';
  if (produit === 'cloud') {
    return {
      produit, titre: en ? EN.cloudTitre : 'Ton FillSell Cloud démarre',
      texte: essai
        ? (en ? EN.cloudEssai(CLOUD_ESSAI_JOURS) : `Ton essai gratuit de ${CLOUD_ESSAI_JOURS} jours commence : rien n'est prélevé avant sa fin. Ta machine, ton adresse IP et ton navigateur se préparent (en général moins de 2 minutes).`)
        : (en ? EN.cloudPaye : 'Ton abonnement est actif. Ta machine, ton adresse IP et ton navigateur se préparent (en général moins de 2 minutes).'),
      // (08/11, urgent U1 de Nico) Le retour de Stripe mène DIRECTEMENT à l'écran de connexion des plateformes choisies
      // (App.jsx lit ?connexion=cloud) : avant, « Accéder à l'app » posait la cliente sur le Stock, rien pour se connecter.
      suite: en ? EN.cloudSuite : 'Prochaine étape : connecte tes comptes, le bouton ci-dessous t\'y mène directement.',
      bouton: en ? EN.cloudBouton : 'Connecter mes comptes →',
      vers: '/app?connexion=cloud',
      // Une valeur d'achat n'est comptée que pour un vrai paiement (un essai ne rapporte rien ce jour-là).
      valeur: essai ? null : 24.99,
    };
  }
  if (produit === 'standard' || produit === 'premium') {
    return { produit: 'standard', titre: en ? 'Welcome to the Premium plan!' : 'Bienvenue sur le plan Premium !', texte: en ? EN.actif : 'Ton abonnement est actif : tes nouveaux quotas sont disponibles tout de suite.', suite: en ? EN.annulable : 'Annulable à tout moment, en 1 clic', valeur: 12.99 };
  }
  if (produit === 'pro') {
    return { produit, titre: en ? 'Welcome to the Pro plan!' : 'Bienvenue sur le plan Pro !', texte: en ? EN.actif : 'Ton abonnement est actif : tes nouveaux quotas sont disponibles tout de suite.', suite: en ? EN.annulable : 'Annulable à tout moment, en 1 clic', valeur: null };
  }
  if (produit === 'business') {
    return { produit, titre: en ? 'Welcome to FillSell Business!' : 'Bienvenue sur FillSell Business !', texte: en ? EN.actif : 'Ton abonnement est actif : tes nouveaux quotas sont disponibles tout de suite.', suite: en ? EN.annulable : 'Annulable à tout moment, en 1 clic', valeur: null };
  }
  if (produit === 'pack') {
    return { produit, titre: en ? 'Purchase confirmed!' : 'Achat confirmé !', texte: en ? 'Thank you: your purchase has been credited to your account.' : 'Merci : ton achat est crédité sur ton compte.', suite: null, valeur: null };
  }
  return { produit: null, titre: en ? 'Payment confirmed' : 'Paiement confirmé', texte: en ? 'Thank you: your purchase has been recorded.' : 'Merci : ton achat est bien enregistré.', suite: null, valeur: null };
}
