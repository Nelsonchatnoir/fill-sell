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
  // (12/11, point 4b de Nico) « On te prévient la veille. » retiré, comme du site et du mail (décision 5a) : la phrase
  // ne revient qu'après un rappel de la veille PROUVÉ sur un vrai client, Stripe et Apple (email_logs).
  lignePrixEssai: (p, zero) => `Puis ${p}/mois, sans engagement. Carte demandée, ${zero} aujourd'hui.`,
  lignePrix: (p) => `${p}/mois, sans engagement.`,
  // (13/11, demande de Nico : « essai ou pas, date du premier prélèvement, AVANT de valider » ; point b : jamais « 7 jours »
  // à qui la boutique fera payer tout de suite) ⚠ textes NEUFS, à valider par Nico.
  lignePrixAujourdhui: (p) => `Pas d'essai : ${p} prélevés aujourd'hui, puis chaque mois. Sans engagement.`,
  lignePrixSemaineSansDroits: (nom, p, b) => `Ton essai FillSell a déjà servi : ${b} t'affichera « 1 semaine gratuite », mais ${nom} ne démarre qu'au premier paiement de ${p}, 7 jours plus tard.`,
  lignePrixEssaiIncertain: (p) => `${J} jours gratuits si ton identifiant Apple n'a jamais eu la semaine gratuite de FillSell ; sinon ${p} prélevés aujourd'hui. Apple t'affiche lequel avant que tu valides.`,
  lignePrixSemaineIncertaine: (nom, p) => `Ton essai FillSell a déjà servi : ${p} prélevés aujourd'hui — ou, si Apple t'affiche « 1 semaine gratuite », ${nom} démarre au premier paiement, 7 jours plus tard.`,
  // (13/11/2026, règle permanente de Nico) Jamais « ordinateur » sous les cartes de paiement du Cloud.
  ligneCommune: 'Le Cloud publie, remonte et retire tes annonces depuis nos serveurs, 24 h/24.',
  // Un abonné : sa formule surlignée.
  taFormuleAvec: (palier, p) => `Ta formule : ${palier}. Avec Cloud : ${p}/mois.`,
  ctaEssaiAbonne: `Essayer le Cloud ${J} jours`,
  ctaAjouter: 'Ajouter le Cloud',
  // (13/11) Le serveur facture la différence TOUT DE SUITE (always_invoice) : le texte le dit (avant : « tu paies la
  // différence au prorata… », sans dire quand).
  prorata: (date, p) => `Pas d'essai : la différence au prorata jusqu'à ta prochaine échéance${date ? ` du ${date}` : ''} est prélevée aujourd'hui sur ta carte${p ? `, puis ${p}/mois` : ''}.`,
  boutique: (b) => `Le changement se fait dans ton abonnement ${b}, sans second abonnement.`,
  // (13/11, point c de Nico) Abonné de la boutique de CE téléphone : aucun essai possible sans un binaire neuf ; le texte
  // le dit, et quand part le prélèvement (Apple : montée immédiate ; Google : CHARGE_PRORATED_PRICE).
  boutiqueMontee: (canal, p) => (canal === 'google'
    ? `Pas d'essai : le changement se fait dans ton abonnement Google Play, sans second abonnement. La différence au prorata est prélevée aujourd'hui, puis ${p}/mois à ta date de renouvellement habituelle.`
    : `Pas d'essai : le changement se fait dans ton abonnement App Store, sans second abonnement. ${p} sont prélevés aujourd'hui sur ton compte Apple, puis chaque mois.`),
  // (13/11, décision de Nico : « on ouvre partout ») Les textes « Les formules avec Cloud y arrivent bientôt… » (abonné
  // App Store / Google Play, client du Cloud seul d'une boutique) sont RETIRÉS, avec « … passe par l'App Store : le passage
  // à une formule se fait dans l'app » (faux : Cloud seul et formules sont deux groupes chez Apple, deux abonnements). Un
  // canal fermé ou un Cloud seul de boutique MASQUE les formules (formulesCloud.js, voieFormulesDuCompte).
  // (12/11, point 4d de Nico) Pendant un essai, chaque texte dit ce qui se passe vraiment.
  essaiContinue: (fin, nom, p) => (fin ? `Ton essai continue jusqu'au ${fin}. Ensuite : ${nom}, ${p}/mois.` : `Ton essai continue jusqu'à sa fin. Ensuite : ${nom}, ${p}/mois.`),
  essaiArrete: (nom, p) => `${nom} n'a pas d'essai : ton essai s'arrête, ${p} sont prélevés aujourd'hui.`,
  // (13/11) Une montée pendant un essai de la boutique : Apple (« Upgrades … go into effect immediately ») arrête l'essai
  // et prélève le prix entier ; Google (CHARGE_PRORATED_PRICE) arrête l'essai et prélève une somme au prorata.
  essaiBoutique: (b, p, canal) => (canal === 'apple' && p
    ? `Ton essai s'arrête : le changement se fait dans ton abonnement App Store et ${p} sont prélevés aujourd'hui sur ton compte Apple.`
    : `Ton essai s'arrête : le changement se fait dans ton abonnement ${b}, qui prélève aujourd'hui une somme au prorata. ${b} t'affiche le montant avant que tu valides.`),
  // (13/11, point b) Posée seulement quand la boutique OFFRIRA sa semaine (éligibilité lue) : « va », plus « peut ».
  essaiDejaPrisBoutique: (nom, b) => `Ton essai gratuit FillSell a déjà été utilisé. ${b} va t'afficher « 1 semaine gratuite » : cette semaine-là, ${nom} n'est pas encore activé ; il démarre au premier paiement, 7 jours plus tard. Continuer ?`,
  essaiDejaPrisIncertain: (nom, b) => `Ton essai gratuit FillSell a déjà été utilisé. Si ${b} t'affiche « 1 semaine gratuite », ${nom} n'est pas activé cette semaine-là : il démarre au premier paiement, 7 jours plus tard. Sinon, ${nom} est payé dès aujourd'hui. Continuer ?`,
  arreterEssai: "Arrêter l'essai",
  arreterEssaiTexte: "Ton essai s'arrête maintenant : rien n'est prélevé pour l'essai.",
  arreterEssaiFait: (formuleContinue, palier) => (formuleContinue ? `C'est arrêté : ta formule ${palier} continue comme avant.` : "C'est arrêté. Rien n'a été prélevé."),
  arreterEssaiEchec: "L'essai n'a pas pu être arrêté. Rien n'a changé : réessaie dans un instant.",
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
  // (13/11) Jamais « Paiement reçu » pour un essai (0 prélevé) ni pour un achat en attente d'approbation.
  essaiAttente: (nom) => `C'est parti : l'essai de ${nom} démarre dès qu'il est confirmé.`,
  achatApprobation: (nom) => `Achat en attente d'approbation : ${nom} démarre dès qu'il est validé. Rien n'est prélevé avant.`,

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
  lignePrixEssai: (p, zero) => `Then ${p}/mo, no commitment. Card required, ${zero} today.`,
  lignePrix: (p) => `${p}/mo, no commitment.`,
  lignePrixAujourdhui: (p) => `No trial: ${p} charged today, then every month. No commitment.`,
  lignePrixSemaineSansDroits: (nom, p, b) => `Your FillSell trial has already been used: ${b} will show "1 week free", but ${nom} only starts at the first payment of ${p}, 7 days later.`,
  lignePrixEssaiIncertain: (p) => `${J} days free if your Apple Account has never had FillSell's free week; otherwise ${p} charged today. Apple shows you which before you confirm.`,
  lignePrixSemaineIncertaine: (nom, p) => `Your FillSell trial has already been used: ${p} charged today — or, if Apple shows "1 week free", ${nom} starts at the first payment, 7 days later.`,
  ligneCommune: 'The Cloud posts, bumps and removes your listings from our servers, 24/7.',
  taFormuleAvec: (palier, p) => `Your plan: ${palier}. With Cloud: ${p}/mo.`,
  ctaEssaiAbonne: `Try the Cloud for ${J} days`,
  ctaAjouter: 'Add the Cloud',
  prorata: (date, p) => `No trial: the prorated difference until your next billing date${date ? `, on ${date},` : ''} is charged to your card today${p ? `, then ${p}/mo` : ''}.`,
  boutique: (b) => `The change is made in your ${b} subscription, with no second subscription.`,
  boutiqueMontee: (canal, p) => (canal === 'google'
    ? `No trial: the change is made in your Google Play subscription, with no second subscription. The prorated difference is charged today, then ${p}/mo on your usual renewal date.`
    : `No trial: the change is made in your App Store subscription, with no second subscription. ${p} is charged to your Apple Account today, then every month.`),
  essaiContinue: (fin, nom, p) => (fin ? `Your trial continues until ${fin}. Then: ${nom}, ${p}/mo.` : `Your trial continues until it ends. Then: ${nom}, ${p}/mo.`),
  essaiArrete: (nom, p) => `${nom} has no trial: your trial stops, ${p} is charged today.`,
  essaiBoutique: (b, p, canal) => (canal === 'apple' && p
    ? `Your trial stops: the change is made in your App Store subscription and ${p} is charged to your Apple Account today.`
    : `Your trial stops: the change is made in your ${b} subscription, which charges a prorated amount today. ${b} shows you the amount before you confirm.`),
  essaiDejaPrisBoutique: (nom, b) => `Your FillSell free trial has already been used. ${b} will show you "1 week free": during that week, ${nom} is not turned on yet; it starts at the first payment, 7 days later. Continue?`,
  essaiDejaPrisIncertain: (nom, b) => `Your FillSell free trial has already been used. If ${b} shows you "1 week free", ${nom} is not turned on that week: it starts at the first payment, 7 days later. Otherwise, ${nom} is charged today. Continue?`,
  arreterEssai: 'Stop the trial',
  arreterEssaiTexte: 'Your trial stops now: nothing is charged for the trial.',
  arreterEssaiFait: (formuleContinue, palier) => (formuleContinue ? `Stopped: your ${palier} plan carries on as before.` : 'Stopped. Nothing was charged.'),
  arreterEssaiEchec: 'The trial could not be stopped. Nothing changed: try again in a moment.',
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
  essaiAttente: (nom) => `Done: the ${nom} trial starts as soon as it is confirmed.`,
  achatApprobation: (nom) => `Purchase waiting for approval: ${nom} starts as soon as it is approved. Nothing is charged before.`,

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
