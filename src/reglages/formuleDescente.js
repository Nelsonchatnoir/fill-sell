// ═══════════════════════════════════════════════════════════════════════════
// C4 — « VOIR LES AUTRES FORMULES » ET DESCENDRE À LA FIN DE LA PÉRIODE : les règles et les textes de l'écran (pur)
// ═══════════════════════════════════════════════════════════════════════════
// (09/11/2026 nuit, point C4 de Nico.) ⛔ FERMÉ tant que coin_config.descente_formule_ouverte ≠ 1 (config/interrupteurs.js)
// — et la fonction changer-formule n'est pas déployée (docs/enquetes/c4-descente-0911/RAPPORT.md). WEB seulement :
// sur iPhone / Android, la boutique facture et nos fonctions de paiement mobiles ne savent pas encore faire tomber un
// palier (rapport). Pur : testé en Node (selftest:descente-formule).

import { PRIX_WEB } from '../lib/prixBoutique.js';

export const NOMS_FORMULE = Object.freeze({ premium: 'Premium', pro: 'Pro', business: 'Business' });
const RANG_APP = Object.freeze({ premium: 1, pro: 2, business: 3 });
/** Les formules proposées, la plus PROCHE d'abord (Business → Pro, puis Premium). */
export const ordreProposees = (possibles) => [...(possibles ?? [])].filter((f) => RANG_APP[f]).sort((a, b) => RANG_APP[b] - RANG_APP[a]);

/** Le bloc se montre-t-il ? Web, abonné Stripe, formule active non résiliée, interrupteur du serveur ouvert.
 *  (12/11, point 4d de Nico) Jamais PENDANT UN ESSAI : la descente programmée exige un abonnement actif (changer-formule
 *  répondait « abonnement_pas_actif ») et la liste n'a pas les formules avec Cloud — une impasse ; pendant l'essai, le
 *  changement se fait par la feuille de la veille (formule avec Cloud plus basse) ou « Arrêter l'essai ». */
export function blocDescenteVisible({ ouvert, natif, isPremium, clientStripe, resilie, enEssai = false }) {
  return Boolean(ouvert && !natif && isPremium && clientStripe && !resilie && !enEssai);
}

/** La date du changement, heure de Paris (« 9 décembre » / « December 9 »). */
export function dateChangement(iso, lang = 'fr') {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  // Insécable : « 9 décembre » ne se coupe jamais en fin de ligne (vu à 375 px sur la capture C4).
  return new Intl.DateTimeFormat(lang === 'en' ? 'en-GB' : 'fr-FR', { day: 'numeric', month: 'long', timeZone: 'Europe/Paris' }).format(d).replace(/ /g, String.fromCharCode(0xa0));
}

const FR = {
  voirAutres: 'Voir les autres formules',
  masquer: 'Masquer les autres formules',
  intro: (actuelle, date) => `Passe à une formule plus légère : ta formule ${actuelle} reste entière jusqu'au ${date}, la nouvelle commence ensuite.`,
  prixMois: (prix) => `${prix}/mois`,
  passerA: (nom, date) => `Passer à ${nom} le ${date}`,
  confirmerTitre: (nom, date) => `Passer à ${nom} le ${date} ?`,
  confirmerTexte: (actuelle, nom, prix, date) => `Ta formule ${actuelle} reste entière jusqu'au ${date}. Ensuite : ${nom}, ${prix}/mois. Rien n'est remboursé ni prélevé aujourd'hui, et tu peux annuler ce changement jusqu'au ${date}.`,
  confirmer: 'Confirmer',
  annuler: 'Annuler',
  prevueTitre: (nom, date) => `Ta formule passera à ${nom} le ${date}.`,
  prevueTexte: (actuelle, date) => `Jusqu'au ${date}, ta formule ${actuelle} reste entière. Rien n'est prélevé avant.`,
  garder: (actuelle) => `Garder ${actuelle}`,
  erreurs: {
    arret_deja_prevu: "Ta formule s'arrête déjà à la fin de la période. Pour changer de formule, reprends-la d'abord.",
    montee_en_attente: "Un passage à une formule supérieure attend son paiement : réessaie une fois qu'il est réglé.",
    descente_impossible: "Ce changement n'est pas possible depuis ta formule.",
    stripe_refus: "Le changement n'a pas pu être programmé. Rien n'a changé : réessaie dans un instant.",
    defaut: "Le changement n'a pas pu se faire. Rien n'a changé : réessaie dans un instant.",
  },
  lectureEchec: 'Les autres formules sont momentanément illisibles.',
};
const EN = {
  voirAutres: 'See other plans',
  masquer: 'Hide other plans',
  intro: (actuelle, date) => `Move to a lighter plan: your ${actuelle} plan stays whole until ${date}, the new one starts after.`,
  prixMois: (prix) => `${prix}/mo`,
  passerA: (nom, date) => `Switch to ${nom} on ${date}`,
  confirmerTitre: (nom, date) => `Switch to ${nom} on ${date}?`,
  confirmerTexte: (actuelle, nom, prix, date) => `Your ${actuelle} plan stays whole until ${date}. Then: ${nom}, ${prix}/mo. Nothing is refunded or charged today, and you can cancel this change until ${date}.`,
  confirmer: 'Confirm',
  annuler: 'Cancel',
  prevueTitre: (nom, date) => `Your plan will switch to ${nom} on ${date}.`,
  prevueTexte: (actuelle, date) => `Until ${date}, your ${actuelle} plan stays whole. Nothing is charged before.`,
  garder: (actuelle) => `Keep ${actuelle}`,
  erreurs: {
    arret_deja_prevu: 'Your plan already stops at the end of the period. To change plans, resume it first.',
    montee_en_attente: 'An upgrade is waiting for its payment: try again once it is settled.',
    descente_impossible: 'This change is not possible from your plan.',
    stripe_refus: 'The change could not be scheduled. Nothing changed: try again in a moment.',
    defaut: 'The change could not be made. Nothing changed: try again in a moment.',
  },
  lectureEchec: 'Other plans are temporarily unreadable.',
};
export const textesDescente = (lang = 'fr') => (lang === 'en' ? EN : FR);

/** Le prix (web, Stripe) d'une formule cible. */
export const prixFormule = (f, lang = 'fr') => PRIX_WEB[f]?.[lang === 'en' ? 'en' : 'fr'] ?? '';

/** Le message d'une erreur de changer-formule (jamais un code brut). */
export const messageErreur = (code, lang = 'fr') => textesDescente(lang).erreurs[code] ?? textesDescente(lang).erreurs.defaut;
