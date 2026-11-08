// ═══════════════════════════════════════════════════════════════════════════
// « FORMULE PUIS FILLSELL CLOUD » — LE PARCOURS EN DEUX TEMPS (08/11/2026, point 1 de Nico)
// ═══════════════════════════════════════════════════════════════════════════
// Le 08/11 à 14:23 (Nicotest, TestFlight) : « Passer Pro + FillSell Cloud » n'achetait QUE Pro — Apple et Google ne
// vendent qu'un abonnement par feuille, et l'app rouvrait seulement la feuille des offres. Retiré le jour même
// (point 0, 08a9e66). Le parcours devient DEUX ACHATS NOMMÉS, l'un après l'autre :
//   1. la carte d'un palier achète CE palier (jamais « + FillSell Cloud » sur son bouton) ; si la personne avait coché
//      FillSell Cloud dans la feuille, l'intention est gardée ici (une heure, comme offreCloud.js) ;
//   2. la formule active, la fenêtre « Bienvenue dans FillSell Pro » propose l'ÉTAPE 2 : « Ajouter FillSell Cloud »
//      (son propre achat : conditions, place, boutique) ou « Plus tard » ;
//   3. l'issue de l'étape 2 est DITE, toujours : Cloud ajouté, paiement reçu, ou « FillSell Cloud n'a pas été ajouté.
//      Ta formule reste active. » — jamais un client qui croit avoir le Cloud sans l'avoir.
// Aucun import (chargé par l'app et les selftests).

export const CLE_CLOUD_ENSUITE = 'fs_cloud_apres_formule';
export const DUREE_CLOUD_ENSUITE_MS = 60 * 60 * 1000;
const PALIERS = new Set(['premium', 'pro', 'business']);

/** Garde l'intention « ajouter FillSell Cloud après cette formule » (Stripe recharge la page : localStorage). */
export function garderCloudEnsuite({ tier, origine = 'modale_plan' } = {}, stockage = globalThis.localStorage, maintenant = Date.now()) {
  if (!PALIERS.has(tier)) return false;
  try {
    stockage?.setItem(CLE_CLOUD_ENSUITE, JSON.stringify({ tier, origine: String(origine).slice(0, 60), le: maintenant }));
    return true;
  } catch { return false; }
}

/** L'intention gardée, si elle a moins d'une heure (sinon null). Ne l'efface pas. */
export function lireCloudEnsuite(stockage = globalThis.localStorage, maintenant = Date.now()) {
  try {
    const d = JSON.parse(stockage?.getItem(CLE_CLOUD_ENSUITE) ?? 'null');
    if (!d || !PALIERS.has(d.tier) || !Number.isFinite(d.le) || maintenant - d.le > DUREE_CLOUD_ENSUITE_MS || d.le > maintenant + 60_000) return null;
    return { tier: d.tier, origine: d.origine ?? 'modale_plan' };
  } catch { return null; }
}

/** Efface l'intention (étape 2 proposée, achat d'une formule sans Cloud, issue dite). */
export function effacerCloudEnsuite(stockage = globalThis.localStorage) {
  try { stockage?.removeItem(CLE_CLOUD_ENSUITE); } catch { /* stockage indisponible : rien à effacer */ }
}

const NOMS = { premium: 'Premium', pro: 'Pro', business: 'Business' };

const FR = {
  etapeTitre: 'Étape 2 sur 2 : FillSell Cloud',
  etapeTexte: (nom, prix) => `Ta formule ${nom} est active. FillSell Cloud ne l'est pas encore : c'est un achat à part, ${prix} par mois. Essai gratuit de 7 jours si tu ne l'as jamais essayé.`,
  etapeCta: 'Ajouter FillSell Cloud',
  etapePlusTard: 'Plus tard',
  resultat: {
    actif: { titre: 'FillSell Cloud est ajouté', texte: (nom) => `Ta formule ${nom} et FillSell Cloud sont actifs. Connecte tes plateformes pour que FillSell Cloud démarre.`, cta: 'Connecter mes plateformes' },
    attente: { titre: 'Paiement reçu', texte: (nom, m) => `${m ?? 'Ton FillSell Cloud démarre dans un instant.'} Ta formule ${nom} est active.` },
    annule: { titre: "FillSell Cloud n'a pas été ajouté", texte: (nom) => `Tu as fermé le paiement : rien n'a été prélevé pour FillSell Cloud. Ta formule ${nom} reste active. Tu peux ajouter FillSell Cloud quand tu veux dans Réglages › Abonnement.` },
    echec: { titre: "FillSell Cloud n'a pas été ajouté", texte: (nom, m) => `${m ? `${m} ` : ''}Ta formule ${nom} reste active. Tu peux ajouter FillSell Cloud quand tu veux dans Réglages › Abonnement.` },
  },
  ok: "J'ai compris",
  plusTard: 'Plus tard',
};
const EN = {
  etapeTitre: 'Step 2 of 2: FillSell Cloud',
  etapeTexte: (nom, prix) => `Your ${nom} plan is active. FillSell Cloud is not yet: it is a separate purchase, ${prix} a month. 7-day free trial if you have never tried it.`,
  etapeCta: 'Add FillSell Cloud',
  etapePlusTard: 'Later',
  resultat: {
    actif: { titre: 'FillSell Cloud is added', texte: (nom) => `Your ${nom} plan and FillSell Cloud are active. Connect your platforms so FillSell Cloud can start.`, cta: 'Connect my platforms' },
    attente: { titre: 'Payment received', texte: (nom, m) => `${m ?? 'Your FillSell Cloud starts in a moment.'} Your ${nom} plan is active.` },
    annule: { titre: 'FillSell Cloud was not added', texte: (nom) => `You closed the payment: nothing was charged for FillSell Cloud. Your ${nom} plan stays active. You can add FillSell Cloud anytime in Settings › Subscription.` },
    echec: { titre: 'FillSell Cloud was not added', texte: (nom, m) => `${m ? `${m} ` : ''}Your ${nom} plan stays active. You can add FillSell Cloud anytime in Settings › Subscription.` },
  },
  ok: 'Got it',
  plusTard: 'Later',
};

/** Les textes de l'étape 2, dans la langue. */
export const textesCloudEnsuite = (lang = 'fr') => (lang === 'en' ? EN : FR);

/**
 * Ce que l'issue de l'étape 2 veut dire à l'écran (pur, testé) : { cle: actif | attente | annule | echec, titre, texte,
 * cta? } — `r` est la réponse d'achatCloud.acheter (etat, message) ; 'redirige' (Stripe) → null : la page part.
 */
export function issueCloudEnsuite(r, tier, lang = 'fr') {
  const T = textesCloudEnsuite(lang);
  const nom = NOMS[tier] ?? 'FillSell';
  const etat = r?.etat;
  if (etat === 'redirige') return null;
  if (etat === 'actif') return { cle: 'actif', titre: T.resultat.actif.titre, texte: T.resultat.actif.texte(nom), cta: T.resultat.actif.cta };
  if (etat === 'attente' && r?.attente == null && r?.raison == null) return { cle: 'attente', titre: T.resultat.attente.titre, texte: T.resultat.attente.texte(nom, r?.message ?? null) };
  if (etat === 'annule') return { cle: 'annule', titre: T.resultat.annule.titre, texte: T.resultat.annule.texte(nom) };
  // refuse (complet, pool vide, déjà client), liste d'attente, erreur, indisponible : le Cloud n'est PAS ajouté.
  return { cle: 'echec', titre: T.resultat.echec.titre, texte: T.resultat.echec.texte(nom, r?.message ?? null) };
}
