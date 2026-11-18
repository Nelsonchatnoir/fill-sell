// ═══════════════════════════════════════════════════════════════════════════
// FILLSELL CLOUD — LES DEUX RELANCES AUTOMATIQUES (18/11/2026 soir, ordre de Nico) — règles pures
// ═══════════════════════════════════════════════════════════════════════════
//   a. 'cloud_relance_arret'  — le client Cloud (Apple, Google ou Stripe) qui a COUPÉ son renouvellement : un mail
//      quelques jours avant la fin de sa période (J-3), UNE SEULE FOIS, qui demande ce qui lui manque, sans insister ;
//   b. 'cloud_relance_essai'  — l'essai Cloud commencé sans aller au bout (fenêtre Apple ou Google fermée, page carte
//      Stripe abandonnée) : UNE relance, une seule fois.
// RÈGLES (Nico) : tutoiement, « on », signé « Nico / FillSell » (gabarit), court, humain, sans insister ;
//   · au plus 2 mails par personne et par 24 h venant de nous (compte des lignes email_logs, tous types) ;
//   · jamais aux comptes de test (estCompteDeTest, meta-capi.js) ;
//   · catégorie 'marketing' : ces mails ne sont PAS strictement liés au compte (ce n'est ni une facture ni un
//     changement de droit) — la désinscription est respectée par la porte (envoyerEmail) et le lien est dans le mail ;
//   · UN SEUL envoi par personne et par type, à vie : les deux types entrent dans l'index one-shot
//     email_logs_one_shot_unique (migration 20261118220000, envoi en 'reservation') ;
//   · de jour seulement (8 h – 22 h, Paris), comme tout le tunnel.
// Branché dans email-tunnel (passage horaire de la relance). Testé sans réseau : scripts/cloud-relances-selftest.mjs.

import { estCompteDeTest } from './meta-capi.js';

export const TYPE_RELANCE_ARRET = 'cloud_relance_arret';
export const TYPE_RELANCE_ESSAI = 'cloud_relance_essai';
export const TYPES_RELANCES_CLOUD = Object.freeze([TYPE_RELANCE_ARRET, TYPE_RELANCE_ESSAI]);
export const CATEGORIE_RELANCE = 'marketing';
export const DEDUP_RELANCE = 'reservation';
export const LIEN_APP = 'https://fillsell.app';

const HEURE_MS = 3_600_000;
/**
 * ⛔ L'INTERRUPTEUR DE L'ENVOI RÉEL (18/11, ordre de Nico) : TRUE depuis le feu vert de Nico du 18/11 (textes et essai à
 * blanc validés) ; le remettre à false coupe tout envoi. Tant qu'il est faux, le passage horaire d'email-tunnel calcule et rend le bilan (comptes, type,
 * créneau prévu) mais n'envoie RIEN. Le changer = un commit + un déploiement d'email-tunnel, sur ordre de Nico.
 */
export const ENVOI_REEL_RELANCES_CLOUD = true;
/**
 * (18/11) Les essais ratés d'AVANT le correctif des fenêtres Apple / Google (16/11 au soir, 2026-11-16T22:00Z) sont
 * traités par le mail ponctuel de Nico (« c'était un bug chez nous »), jamais par la relance automatique : sinon les
 * mêmes personnes recevraient deux mails. Seules les issues ratées APRÈS cet instant déclenchent la relance 1b.
 */
export const ESSAI_RATE_DEPUIS = '2026-11-16T22:00:00Z';

export const PARAMETRES_RELANCES = Object.freeze({
  arretAvantFinH: 72,        // J-3 : la relance s'ouvre 72 h avant la fin de la période
  essaiApresIssueMinH: 24,   // l'essai raté : pas avant 24 h (le temps de réessayer seul)
  essaiApresIssueMaxH: 168,  // … et pas au-delà de 7 jours (une relance tardive n'a plus de sens)
  maxMails24h: 2,            // « au plus 2 mails par personne et par jour venant de nous »
  heureDebut: 8,
  heureFin: 22,
});

const instant = (v) => {
  if (v == null || v === '') return null;
  const t = v instanceof Date ? v.getTime() : typeof v === 'number' ? v : Date.parse(v);
  return Number.isFinite(t) ? t : null;
};
const nonVide = (v) => typeof v === 'string' && v.trim() !== '';
const jourOk = (h, p) => { const n = Number(h); return Number.isFinite(n) && n >= p.heureDebut && n < p.heureFin; };

/** La fin de la période en cours d'un client Cloud : la plus tardive de la fin d'essai et de la fin de période payée. */
export function finDePeriode(profil) {
  const a = instant(profil?.cloud_essai_fin);
  const b = instant(profil?.cloud_periode_fin);
  const m = Math.max(a ?? -Infinity, b ?? -Infinity);
  return Number.isFinite(m) ? m : null;
}

/** Les comptes à relire pour (a) : renouvellement coupé, fin dans ]maintenant, maintenant + 72 h]. */
export function fenetreArret(maintenant = Date.now(), p = PARAMETRES_RELANCES) {
  const now = instant(maintenant);
  return { finApres: new Date(now).toISOString(), finAvant: new Date(now + p.arretAvantFinH * HEURE_MS).toISOString() };
}

/**
 * (a) Qui reçoit la relance « renouvellement coupé », et quand.
 *   profil : { email, cloud_arret_fin_periode, cloud_essai_arrete, cloud_essai_fin, cloud_periode_fin, cloud_canal }
 * → { action: 'envoyer' | 'attendre' | 'rien', raison }
 */
export function decisionRelanceArret({ profil, dejaEnvoye = false, mails24h = 0, heureParis, maintenant = Date.now(), p = PARAMETRES_RELANCES }) {
  const rien = (raison) => ({ action: 'rien', raison });
  const attendre = (raison) => ({ action: 'attendre', raison });
  if (!profil || !nonVide(profil.email)) return rien('sans_adresse');
  if (estCompteDeTest(profil.email)) return rien('compte_de_test');
  if (profil.cloud_arret_fin_periode !== true) return rien('renouvellement_actif');
  if (profil.cloud_essai_arrete === true) return rien('deja_arrete');
  if (dejaEnvoye) return rien('deja_envoye');
  const fin = finDePeriode(profil);
  if (fin == null) return rien('sans_fin');
  const now = instant(maintenant);
  if (now >= fin) return rien('periode_finie');
  if (now < fin - p.arretAvantFinH * HEURE_MS) return attendre('pas_encore');
  if (!jourOk(heureParis, p)) return attendre('nuit');
  if (!(Number(mails24h) < p.maxMails24h)) return attendre('plafond_2_par_jour');
  return { action: 'envoyer', raison: 'j_moins_3' };
}

// ── (b) L'essai commencé sans aller au bout ──────────────────────────────────
// Les traces (usage_logs) : l'issue d'un achat de formule avec Cloud (Apple, Google), d'un achat du Cloud seul, et
// l'abandon d'une page de paiement Stripe d'une formule avec Cloud.
export const FEATURES_ESSAI_RATE = Object.freeze(['formule_cloud_issue', 'cloud_achat_issue', 'checkout_abandon']);
const ETATS_RATES = new Set(['annule', 'erreur', 'refuse', 'attente']);
const RAISONS_VOLONTAIRES = new Set(['conditions_refusees', 'conditions_remplacees']);

/** Une ligne usage_logs dit-elle « un essai Cloud a été commencé et n'a pas abouti » ? Un refus des conditions est un choix. */
export function essaiRate(feature, metadata) {
  const m = metadata && typeof metadata === 'object' ? metadata : {};
  if (feature === 'checkout_abandon') {
    return /cloud/.test(String(m.tier ?? '')) && m.canal === 'stripe';
  }
  if (feature === 'formule_cloud_issue' || feature === 'cloud_achat_issue') {
    if (RAISONS_VOLONTAIRES.has(String(m.raison ?? ''))) return false;
    return ETATS_RATES.has(String(m.etat ?? ''));
  }
  return false;
}

/**
 * (b) Qui reçoit la relance « essai pas allé au bout ».
 *   profil : { email, is_cloud, cloud_essai_debut }, derniereIssue : instant du dernier essai raté (usage_logs).
 *   Jamais si l'essai a démarré depuis, si le Cloud est payant, ou si le compte a déjà un palier Cloud.
 */
export function decisionRelanceEssai({ profil, derniereIssue, dejaEnvoye = false, mails24h = 0, heureParis, maintenant = Date.now(), p = PARAMETRES_RELANCES }) {
  const rien = (raison) => ({ action: 'rien', raison });
  const attendre = (raison) => ({ action: 'attendre', raison });
  if (!profil || !nonVide(profil.email)) return rien('sans_adresse');
  if (estCompteDeTest(profil.email)) return rien('compte_de_test');
  if (profil.cloud_essai_debut) return rien('essai_demarre');
  if (profil.is_cloud === true) return rien('deja_payant');
  if (dejaEnvoye) return rien('deja_envoye');
  const issue = instant(derniereIssue);
  if (issue == null) return rien('pas_d_issue');
  if (issue < Date.parse(ESSAI_RATE_DEPUIS)) return rien('avant_le_correctif');
  const now = instant(maintenant);
  const age = now - issue;
  if (age > p.essaiApresIssueMaxH * HEURE_MS) return rien('trop_tard');
  if (age < p.essaiApresIssueMinH * HEURE_MS) return attendre('pas_encore');
  if (!jourOk(heureParis, p)) return attendre('nuit');
  if (!(Number(mails24h) < p.maxMails24h)) return attendre('plafond_2_par_jour');
  return { action: 'envoyer', raison: 'essai_rate' };
}

/**
 * Le créneau PRÉVU d'un envoi : le premier passage horaire (heure pleine) à partir de `des` (instant le plus tôt où la
 * règle ouvre) qui tombe entre 8 h et 22 h, heure de Paris. Rend un ISO UTC et la même heure à Paris.
 */
export function creneauPrevu({ des, maintenant = Date.now(), p = PARAMETRES_RELANCES }) {
  const base = Math.max(instant(des) ?? 0, instant(maintenant));
  let t = Math.ceil(base / HEURE_MS) * HEURE_MS;
  const heureParis = (x) => Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', hour: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(x)).find((q) => q.type === 'hour').value);
  for (let i = 0; i < 48 && !jourOk(heureParis(t), p); i++) t += HEURE_MS;
  const paris = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', dateStyle: 'short', timeStyle: 'short' }).format(new Date(t));
  return { iso: new Date(t).toISOString(), paris };
}

// ── Les textes ───────────────────────────────────────────────────────────────
function dateCourte(iso, lang) {
  const parts = new Intl.DateTimeFormat(lang === 'en' ? 'en-GB' : 'fr-FR', {
    timeZone: 'Europe/Paris', weekday: 'long', day: 'numeric', month: 'long',
  }).formatToParts(new Date(iso));
  const v = (t) => parts.find((x) => x.type === t)?.value ?? '';
  return lang === 'en' ? `${v('weekday')} ${v('day')} ${v('month')}` : `${v('weekday')} ${v('day')} ${v('month')}`;
}

/** Le texte de la relance (a). finIso : la fin de la période. Pas de prix, pas de promesse de remboursement. */
export function texteRelanceArret({ lang = 'fr', finIso }) {
  const quand = dateCourte(finIso, lang);
  if (lang === 'en') {
    return {
      sujet: 'What was missing in FillSell Cloud?',
      titre: 'What was missing?',
      preheader: 'Two lines to tell us, if you feel like it.',
      paragraphes: [
        'Hi,',
        `We saw you turned off the renewal of FillSell Cloud. It keeps running until ${quand}, then it stops, nothing else to do on your side.`,
        'We would really like to know what was missing: a platform, a feature, something that got in the way? Just reply to this email, a line is enough. We read everything.',
        'And if you simply wanted to try it out, no worries at all.',
      ],
      bouton: null,
      raisonEnvoi: 'You are getting this message because you have a FillSell Cloud subscription.',
    };
  }
  return {
    sujet: 'Qu\'est-ce qui t\'a manqué dans FillSell Cloud ?',
    titre: 'Qu\'est-ce qui t\'a manqué ?',
    preheader: 'Deux lignes pour nous le dire, si tu as envie.',
    paragraphes: [
      'Salut,',
      `On a vu que tu as coupé le renouvellement de FillSell Cloud. Il reste actif jusqu'au ${quand}, puis il s'arrête : rien d'autre à faire de ton côté.`,
      'On aimerait vraiment savoir ce qui t\'a manqué : une plateforme, une fonction, un truc qui a gêné ? Réponds simplement à ce mail, une ligne suffit. On lit tout.',
      'Et si tu voulais juste tester, aucun souci.',
    ],
    bouton: null,
    raisonEnvoi: 'Tu reçois ce message parce que tu as un abonnement FillSell Cloud.',
  };
}

/** Le texte de la relance (b). */
export function texteRelanceEssai({ lang = 'fr' }) {
  if (lang === 'en') {
    return {
      sujet: 'Did your FillSell Cloud trial not start?',
      titre: 'Your free trial did not start?',
      preheader: 'You can start it again from the app.',
      paragraphes: [
        'Hi,',
        'We saw you started the free trial of FillSell Cloud, but it did not go through.',
        'If you still want to try it, you can start it again from the app, in Settings, Subscription.',
        'And if something got in your way or made you hesitate, just reply to this email: we read everything.',
      ],
      bouton: { texte: 'Open FillSell', url: LIEN_APP },
      raisonEnvoi: 'You are getting this message because you have a FillSell account.',
    };
  }
  return {
    sujet: 'Ton essai FillSell Cloud ne s\'est pas lancé ?',
    titre: 'Ton essai gratuit ne s\'est pas lancé ?',
    preheader: 'Tu peux le relancer depuis l\'app.',
    paragraphes: [
      'Salut,',
      'On a vu que tu avais lancé l\'essai gratuit de FillSell Cloud, mais il n\'est pas allé au bout.',
      'Si tu veux toujours l\'essayer, tu peux le relancer depuis l\'app, dans Réglages, Abonnement.',
      'Et si quelque chose t\'a gêné ou te fait hésiter, réponds simplement à ce mail : on lit tout.',
    ],
    bouton: { texte: 'Ouvrir FillSell', url: LIEN_APP },
    raisonEnvoi: 'Tu reçois ce message parce que tu as un compte FillSell.',
  };
}
