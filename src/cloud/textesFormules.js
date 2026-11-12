// ═══════════════════════════════════════════════════════════════════════════
// LES MOTS DES FORMULES AVEC CLOUD (11/11/2026) — fenêtre d'offres, Réglages › Abonnement, fin d'essai
// ═══════════════════════════════════════════════════════════════════════════
// Textes VALIDÉS par Nico le 11/11 vers 21:25 (textes 1, 3, 4 et 5 du § 8 du plan, corrigé à 22:09 : essai SEULEMENT
// sur Premium + Cloud et Pro + Cloud ; « 7 jours gratuits sur Premium ou Pro avec Cloud », jamais une formule laissée au
// choix ; « le Cloud pour 22 € / 20 € de plus », un fait, jamais un rabais affiché). Verrou à l'octet :
// scripts/formules-cloud-offres-selftest.mjs. Tutoiement.
// ⛔ AUCUN PRIX ÉCRIT ICI : chaque montant est un paramètre (web : prix Stripe ; iPhone / Android : prix formaté par la
//    boutique — lib/prixBoutique.js). ⛔ Aucune durée en dur : FORMULES_ESSAI_JOURS (contrat partagé).
// L'anglais : traduction pour une interface réglée en anglais (le Cloud n'est vendu qu'en France).
import { ESSAI_JOURS } from '../../supabase/functions/_shared/formules-cloud.js';

const J = ESSAI_JOURS;

export const NOMS_FORMULES = Object.freeze({ premium_cloud: 'Premium + Cloud', pro_cloud: 'Pro + Cloud', business_cloud: 'Business + Cloud' });
export const NOMS_PALIERS_SEULS = Object.freeze({ premium: 'Premium', pro: 'Pro', business: 'Business' });

const FR = {
  // ── La fenêtre d'offres (texte 1) ─────────────────────────────────────────────────────────────────────────────
  sansCloud: 'Sans Cloud',
  avecCloud: 'Avec Cloud',
  basculeEtiquette: 'Formules sans ou avec FillSell Cloud',
  notreConseil: 'Notre conseil',
  pastilleEssai: `${J} jours gratuits`,
  parMois: '/mois',
  supplement: (s) => `Le Cloud pour ${s} de plus`,
  ctaEssai: `Essayer ${J} jours gratuits`,
  ctaPasser: (nom) => `Passer à ${nom}`,
  lignePrixEssai: (p, zero) => `Puis ${p}/mois, sans engagement. Carte demandée, ${zero} aujourd'hui. On te prévient la veille.`,
  lignePrix: (p) => `${p}/mois, sans engagement.`,
  ligneCommune: 'Le Cloud publie, remonte et retire tes annonces depuis nos serveurs, sans ordinateur.',
  // Un abonné : sa formule surlignée.
  taFormuleAvec: (palier, p) => `Ta formule : ${palier}. Avec Cloud : ${p}/mois.`,
  ctaEssaiAbonne: `Essayer le Cloud ${J} jours`,
  ctaAjouter: 'Ajouter le Cloud',
  prorata: (date) => (date
    ? `Tu paies la différence au prorata jusqu'à ta prochaine échéance du ${date}.`
    : "Tu paies la différence au prorata jusqu'à ta prochaine échéance."),
  boutique: (b) => `Le changement se fait dans ton abonnement ${b}, sans second abonnement.`,
  // ⚠ Texte NON validé (question à Nico) : un abonné payé par carte, vu dans l'app iPhone / Android.
  carteSurMobile: 'Ton abonnement est payé par carte : le changement se fait sur le web, dans Réglages › Abonnement, sans second abonnement.',
  // ⚠ Seul le fragment « ton tarif Founder s'arrête » est validé (décision 10) ; la phrase entière est à relire.
  founder: "Avec le Cloud, ton tarif Founder s'arrête : tu passes au prix de la formule choisie.",
  taFormule: (nom) => `Ta formule : ${nom}.`,
  titre: 'Choisis ta formule',
  sousTitreEssai: (zero) => `${J} jours gratuits sur Premium ou Pro avec Cloud. Carte demandée, ${zero} aujourd'hui.`,
  // Le refus du serveur pour un abonné d'un autre canal, et l'échec générique.
  achatEchec: "Le paiement n'a pas pu s'ouvrir. Rien n'a été prélevé : réessaie dans un instant.",
  serveurPasPret: "Cette formule n'est pas encore disponible ici. Rien n'a été prélevé.",
  sansEssaiConfirmer: (nom) => `Ton essai gratuit a déjà été utilisé : ${nom} sera payé dès aujourd'hui. Continuer ?`,
  achatOk: (nom) => `${nom} est activé.`,
  achatAttente: (nom) => `Paiement reçu : ${nom} s'active dès qu'il est confirmé.`,

  // ── Réglages › Abonnement (texte 3) ──────────────────────────────────────────────────────────────────────────
  groupe: 'FillSell Cloud',
  ajouterLigne: (palier, nom, p) => `Ajouter le Cloud à ta formule ${palier} : ${nom}, ${p}/mois.`,
  ctaEssayer7: `Essayer ${J} jours`,
  noteEssai: (palier, nom, fin, echeance) => `Pendant ${J} jours, tu ne paies que ta formule ${palier}. Le ${fin}, elle devient ${nom} ; la différence jusqu'à ta prochaine échéance est ajoutée à ta facture du ${echeance}.`,
  retirer: 'Retirer le Cloud',
  retirerConfirmer: 'Retirer le Cloud',
  retirerAnnuler: 'Garder le Cloud',
  retirerTexte: (palier, date) => (date
    ? `Ta formule redevient ${palier} le ${date}. Le Cloud tourne jusque-là ; rien n'est remboursé pour le mois en cours.`
    : `Ta formule redevient ${palier} à la fin de la période payée. Le Cloud tourne jusque-là ; rien n'est remboursé pour le mois en cours.`),
  retirerBoutique: (b) => `Le changement se fait dans tes abonnements ${b}.`,
  retirerFait: (palier, date) => (date ? `C'est noté : ta formule redevient ${palier} le ${date}.` : `C'est noté : ta formule redevient ${palier} à la fin de la période payée.`),
  retirerEchec: "Le Cloud n'a pas pu être retiré. Rien n'a changé : réessaie dans un instant.",
  heritePasser: (p1, p2) => `Passer à Pro + Cloud (${p1}/mois) ou Premium + Cloud (${p2}/mois).`,
  voirFormules: 'Voir les formules avec Cloud',

  // ── Fin d'essai et rappel avant débit, la veille et le jour J (textes 4 et 5) ───────────────────────────────────
  finKicker: "Fin de ton essai",
  finTitre: (quand, date, heure) => (quand === 'aujourdhui'
    ? `Ton essai se termine aujourd'hui à ${heure}`
    : `Ton essai se termine demain, le ${date} à ${heure}`),
  finTexte: (nom, p, date) => `Choisis ta formule. Sans choix de ta part, ${nom} continue à ${p}/mois à partir du ${date}.`,
  finGarder: (nom, p) => `Garder ${nom} · ${p}/mois`,
  finPasser: (nom, p) => `Passer à ${nom} · ${p}/mois`,
  // Validé : « Premium + Cloud : 40 annonces, 400 publications, 1 500 remontées par mois » ; « Pro + Cloud : 120 annonces,
  // 1 200 publications, remontées illimitées, republication automatique ».
  finContenu: (nom, jauges, auto) => (auto ? `${nom} : ${jauges}, republication automatique` : `${nom} : ${jauges} par mois`),
  finArreter: 'Arrêter',
  finCanal: { stripe: 'Le montant est prélevé sur ta carte.', apple: 'Le montant est prélevé sur ton compte Apple.', google: 'Le montant est prélevé sur ton compte Google Play.' },
  finChangeFait: (nom, date) => `C'est noté : ${nom} commence le ${date}.`,
  finChangeEchec: "Le changement n'a pas pu se faire. Rien n'a changé : réessaie dans un instant.",
  fermer: 'Fermer',
};

const EN = {
  sansCloud: 'Without Cloud',
  avecCloud: 'With Cloud',
  basculeEtiquette: 'Plans without or with FillSell Cloud',
  notreConseil: 'Our pick',
  pastilleEssai: `${J} days free`,
  parMois: '/mo',
  supplement: (s) => `Cloud for ${s} more`,
  ctaEssai: `Try ${J} days free`,
  ctaPasser: (nom) => `Switch to ${nom}`,
  lignePrixEssai: (p, zero) => `Then ${p}/mo, no commitment. Card required, ${zero} today. We remind you the day before.`,
  lignePrix: (p) => `${p}/mo, no commitment.`,
  ligneCommune: 'The Cloud posts, bumps and removes your listings from our servers, no computer needed.',
  taFormuleAvec: (palier, p) => `Your plan: ${palier}. With Cloud: ${p}/mo.`,
  ctaEssaiAbonne: `Try the Cloud for ${J} days`,
  ctaAjouter: 'Add the Cloud',
  prorata: (date) => (date
    ? `You pay the prorated difference until your next billing date, on ${date}.`
    : 'You pay the prorated difference until your next billing date.'),
  boutique: (b) => `The change is made in your ${b} subscription, with no second subscription.`,
  carteSurMobile: 'Your subscription is paid by card: the change is made on the web, in Settings › Subscription, with no second subscription.',
  founder: 'With the Cloud, your Founder price ends: you move to the price of the plan you choose.',
  taFormule: (nom) => `Your plan: ${nom}.`,
  titre: 'Choose your plan',
  sousTitreEssai: (zero) => `${J} days free on Premium or Pro with Cloud. Card required, ${zero} today.`,
  achatEchec: 'Payment could not open. Nothing was charged: try again in a moment.',
  serveurPasPret: 'This plan is not available here yet. Nothing was charged.',
  sansEssaiConfirmer: (nom) => `Your free trial has already been used: ${nom} will be charged from today. Continue?`,
  achatOk: (nom) => `${nom} is on.`,
  achatAttente: (nom) => `Payment received: ${nom} turns on as soon as it is confirmed.`,

  groupe: 'FillSell Cloud',
  ajouterLigne: (palier, nom, p) => `Add the Cloud to your ${palier} plan: ${nom}, ${p}/mo.`,
  ctaEssayer7: `Try ${J} days`,
  noteEssai: (palier, nom, fin, echeance) => `For ${J} days, you only pay for your ${palier} plan. On ${fin}, it becomes ${nom}; the difference until your next billing date is added to your invoice of ${echeance}.`,
  retirer: 'Remove the Cloud',
  retirerConfirmer: 'Remove the Cloud',
  retirerAnnuler: 'Keep the Cloud',
  retirerTexte: (palier, date) => (date
    ? `Your plan goes back to ${palier} on ${date}. The Cloud runs until then; nothing is refunded for the current month.`
    : `Your plan goes back to ${palier} at the end of the paid period. The Cloud runs until then; nothing is refunded for the current month.`),
  retirerBoutique: (b) => `The change is made in your ${b} subscriptions.`,
  retirerFait: (palier, date) => (date ? `Noted: your plan goes back to ${palier} on ${date}.` : `Noted: your plan goes back to ${palier} at the end of the paid period.`),
  retirerEchec: 'The Cloud could not be removed. Nothing changed: try again in a moment.',
  heritePasser: (p1, p2) => `Switch to Pro + Cloud (${p1}/mo) or Premium + Cloud (${p2}/mo).`,
  voirFormules: 'See the plans with Cloud',

  finKicker: 'End of your trial',
  finTitre: (quand, date, heure) => (quand === 'aujourdhui'
    ? `Your trial ends today at ${heure}`
    : `Your trial ends tomorrow, ${date} at ${heure}`),
  finTexte: (nom, p, date) => `Choose your plan. If you do nothing, ${nom} continues at ${p}/mo from ${date}.`,
  finGarder: (nom, p) => `Keep ${nom} · ${p}/mo`,
  finPasser: (nom, p) => `Switch to ${nom} · ${p}/mo`,
  finContenu: (nom, jauges, auto) => (auto ? `${nom}: ${jauges}, automatic reposting` : `${nom}: ${jauges} a month`),
  finArreter: 'Stop',
  finCanal: { stripe: 'The amount is charged to your card.', apple: 'The amount is charged to your Apple Account.', google: 'The amount is charged to your Google Play account.' },
  finChangeFait: (nom, date) => `Noted: ${nom} starts on ${date}.`,
  finChangeEchec: 'The change could not be made. Nothing changed: try again in a moment.',
  fermer: 'Close',
};

/** Les textes des formules avec Cloud ; 'en' = la traduction. */
export const textesFormules = (lang = 'fr') => (lang === 'en' ? EN : FR);
