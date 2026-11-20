// Shared design tokens, constants, and pure utility functions
// Used by tab components and App.jsx

import { etatsVintedLisibles } from './etatsVinted.js';
// (16/10) Le filet « aucune estimation de temps » (_shared/etat-job.js).
import { sansEstimation } from '../../supabase/functions/_shared/etat-job.js';
// (02/11 soir) Compte Cloud : le texte d'une tâche faite par le Cloud (jamais « ton navigateur », « ton ordinateur »).
import { parLeCloud, compteCourantEstCloud } from '../cloud/voieCloud.js';
// (18/11, lot T2 point 1) LA règle du texte selon la voie (un seul endroit, serveur et app).
import { texteSelonVoie } from '../../supabase/functions/_shared/texte-voie.js';
// (06/11, phase 3 point 1 — suite) Les phrases françaises écrites en base, lues en anglais à l'affichage.
import { traduireMessageServeur } from './messagesServeur.js';
import { gesteMurCompteEbay } from '../../supabase/functions/_shared/ebay-refus-compte.js';
// (14/11, point 5a de Nico) Le geste d'un compte eBay relié mais pas prêt à vendre : une règle, tous les écrans.
import { gesteCompteEbayAFinir } from '../../supabase/functions/_shared/ebay-compte-a-finir.js';
import { sansRienVenduSurVente } from './rienVenduSurVente.js';
// (07/11, décision de Nico) Les montants en anglais au format anglais (« €1,268.00 »), le français inchangé.
import { localeDuMontant } from './montants.js';
import { langueDeLApp } from './langueApp.js';

export const MONTHS_FR = ["Jan","Fév","Mar","Avr","Mai","Jun","Jul","Aoû","Sep","Oct","Nov","Déc"];
export const MONTHS_EN = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

// ── LE PLAFOND DE LA DESCRIPTION SAISIE À LA MAIN ───────────────────────────
// Posé à 500 le 19/09 sur l'écran d'AJOUT, après mesure sur les publications
// réussies du parc (la plus longue description acceptée par chaque
// plateforme : Leboncoin 1 639 · eBay 1 310 · Vinted 1 310 · Beebs 1 126 ·
// Opla 1 067). Il vivait dans StockTab, donc hors de portée de la modale de
// MODIFICATION (App.jsx), restée à 200 : le même article acceptait 500
// caractères à l'ajout et les tronquait à 200 à la modification.
// Il vit ici pour que les deux écrans lisent le MÊME chiffre — c'est le piège
// déjà payé sur ce plafond, écrit trois fois et parti en divergence.
// ⛔ Ce n'est PAS une limite de base (`inventaire.description` est un `text`)
//    ni de plateforme : c'est un garde-fou d'écran, et rien d'autre.
export const DESC_MANUELLE_MAX = 500;

// ── LE POIDS DE L'ARTICLE (04/10, Louis) ────────────────────────────────────
// `inventaire.poids_g` : LE champ « Poids » de la fiche, en grammes entiers,
// facultatif. Un seul champ pour toutes les plateformes : le serveur le
// traduit au dépôt (tranche Beebs, poids Leboncoin, format Vinted, eBay).
// Avant lui, le poids n'existait que par plateforme, sur chaque tâche — la
// republication Beebs de Louis a reposé « 1 kg » sur des rangements de 200 g.
// Les bornes sont CELLES DE LA BASE (contrainte inventaire_poids_g_plausible,
// migration 20261004091000) : un chiffre hors bornes serait refusé par
// Postgres, on le refuse donc à l'écran, avec un mot, sans bloquer le reste.
// Lu par les trois écrans qui le touchent — ajout (StockTab), modification
// (App.jsx), stepper (ListingPreviewScreen) : une règle, pas trois copies.
// ⛔ VIDE ≠ ZÉRO : un champ vide vaut NULL (« on ne sait pas »), jamais 0 —
//    et 0 n'est pas un poids, il est refusé comme le reste.
export const POIDS_G_MIN = 1;
export const POIDS_G_MAX = 200000;
/**
 * Lit un poids saisi (ou relu) en grammes. Rien n'est deviné : seuls les
 * espaces sont tolérés (« 1 200 »), pas de virgule, pas d'unité, pas d'arrondi.
 * @returns {{ vide: boolean, valeur: number|null, invalide: boolean }}
 *   vide → NULL en base ; valeur → l'entier à écrire ; invalide → rien
 *   d'écrit, et l'écran le dit.
 */
export function lirePoidsGrammes(saisie) {
  if (saisie == null) return { vide: true, valeur: null, invalide: false };
  const brut = typeof saisie === 'number' && !Number.isFinite(saisie) ? 'x' : String(saisie);
  // `\s` couvre aussi les espaces insécables du français (U+00A0, U+202F).
  const s = brut.replace(/\s/g, '');
  if (s === '') return { vide: true, valeur: null, invalide: false };
  if (!/^\d+$/.test(s)) return { vide: false, valeur: null, invalide: true };
  const n = Number(s);
  if (!Number.isSafeInteger(n) || n < POIDS_G_MIN || n > POIDS_G_MAX) return { vide: false, valeur: null, invalide: true };
  return { vide: false, valeur: n, invalide: false };
}

// Pages de connexion des plateformes (chantier onboarding 2026-07-27) —
// badges de session de l'écran Publier + messages d'échec actionnables du
// Stock. La cible « brouillon LBC en cours » est la page de dépôt : c'est là
// que le wizard montre le brouillon à publier ou supprimer.
// ⚠️ CES ADRESSES SE VÉRIFIENT, ELLES NE SE DEVINENT PAS. Elles sont la SEULE
// source des liens « Me connecter » de l'app (carte d'un job bloqué, étape de
// publication, Réglages › Mes plateformes). Une URL fausse ici envoie quelqu'un
// sur un 404 au pire moment — juste après un échec.
// Relevé en direct le 22/09, page par page :
//   · vinted    — /member/signup/select_type : 200, et c'est le mur que nos
//                 handlers reconnaissent. Déjà connecté ⇒ redirige sur l'accueil.
//   · leboncoin — ⛔ CORRIGÉ le 09/11 (compte 229c7b07, Brave) : JAMAIS
//                 auth.leboncoin.fr/login en lien nu. La page s'affiche (e-mail,
//                 mot de passe) mais son formulaire envoie client_id, redirect_uri
//                 et from_to LUS DANS L'ADRESSE, sans valeur par défaut
//                 (POST /api/authenticator/v2/users/login) ; sans eux Leboncoin
//                 refuse, et un refus 401 s'affiche « Votre mot de passe est
//                 incorrect » (clé login.unknown-account.error) — le bon mot de
//                 passe passait partout SAUF dans l'onglet de notre bouton.
//                 La règle : on ouvre une page du SITE qui exige la connexion, et
//                 c'est Leboncoin qui construit sa page de connexion avec son
//                 contexte. Déconnecté, « Mes annonces » mène (relevé 09/11, Chrome
//                 neuf) à auth.leboncoin.fr/login?client_id=lbc-front-web&
//                 redirect_uri=…/api/authorizer/v2/authorize&from_to=… ; connecté,
//                 elle s'ouvre simplement. Selftest `liens-connexion`.
//   · ebay      — signin.ebay.fr : _shared/ebay-page-vendeur.ts l'écrit déjà,
//                 « signin.ebay.* — un mur de CONNEXION ».
//   · beebs     — CORRIGÉ le 22/09. `/fr/login` rendait une page 404 RENDUE
//                 (« Oups, page perdue ! », titre « 404 - Beebs ») : le lien
//                 « Se connecter à Beebs » d'un job échoué menait donc nulle
//                 part. La bonne route est `/fr/auth` — c'est celle que
//                 background.js nomme déjà comme le mur de connexion Beebs
//                 (« Page inattendue pour une suppression Beebs : …/fr/auth?… »),
//                 relevée en session réelle.
export const PLATFORM_LOGIN_URLS = {
  vinted: 'https://www.vinted.fr/member/signup/select_type?ref_url=%2F',
  leboncoin: 'https://www.leboncoin.fr/compte/part/mes-annonces',
  ebay: 'https://signin.ebay.fr/',
  beebs: 'https://www.beebs.app/fr/auth',
};
/** L'inscription VENDEUR eBay — le compte existe, il n'est pas encore vendeur. */
export const EBAY_VENDEUR_URL = 'https://www.ebay.fr/sl/sell';
export const LBC_DEPOSIT_URL = 'https://www.leboncoin.fr/deposer-une-annonce';

// Pages « Mes annonces » de chaque plateforme (2026-08-10). Mêmes URL que
// MY_LISTINGS_URL côté extension — celles-là sont RELEVÉES en réel, c'est là
// que la re-capture différée va chercher les liens manquants. Servent ici à
// envoyer l'utilisateur vérifier lui-même une annonce dont on n'a pas réussi à
// récupérer le lien. Vinted absent volontairement : son URL de profil dépend de
// l'id du vendeur, qu'on ne connaît pas côté app — mieux vaut pas de lien
// qu'un lien qui tombe à côté.
export const PLATFORM_LISTINGS_URLS = {
  leboncoin: 'https://www.leboncoin.fr/compte/part/mes-annonces',
  ebay: 'https://www.ebay.fr/sh/lst/active',
  beebs: 'https://www.beebs.app/fr/account/my-adverts',
};

// ── Erreur de job : message utilisateur vs diagnostic (2026-07-30) ────────────
// Le 30/07, la modale « non publiée » du Stock a affiché tel quel un message
// technique (nom de fichier du code, options DOM relevées, dump de réponse
// Vinted). Règle : cross_post_jobs.error garde le diagnostic COMPLET — c'est
// la matière du SQL, des logs et du support, on ne l'appauvrit jamais à la
// source. La traduction en phrase courte se fait ICI, au moment d'afficher.
// Un message sans marqueur technique (déjà humanisé côté extension : connexion
// requise, brouillon LBC…) passe tel quel — on ne réécrit pas ce qui est déjà
// une consigne claire.
// Libellés lisibles des 4 plateformes. Exportés (2026-08-11) parce que
// l'avertissement « encore en ligne » des deux chemins de vente en a besoin et
// qu'il ne monte pas l'écran de publication : sans ça, une 5e copie de cette
// table naissait. ListingPreviewScreen en exporte une copie historique
// identique — celle-ci est la source des modules qui n'en dépendent pas.
export const PLATFORM_LABELS = { vinted:"Vinted", leboncoin:"Leboncoin", beebs:"Beebs", ebay:"eBay" };
const HUMANIZE_PLATFORM_LABELS = PLATFORM_LABELS;
// Statuts d'où un job ne repart JAMAIS tout seul. Miroir du trigger
// cross_post_job_settle_reservation (migration 20260805000000), qui rend la
// unité réservée sur exactement ces statuts-là. 'sold' en est volontairement
// absent : la réservation y est bien soldée, mais un job vendu n'est l'échec de
// rien et ne passe pas par ce chemin de message.
const JOB_STATUS_TERMINAL = new Set(['failed', 'cancelled']);
// « le job repartira… » / « il repartira au prochain passage » — la promesse
// de reprise, sous toutes ses formes relevées EN BASE (relevé du 16/08 sur les
// 52 jobs failed porteurs de la promesse : DataDome, connexion Vinted/eBay/
// Beebs, suppression eBay « Nouvelle tentative au prochain passage », eBay
// « il repartira »). Sans /g ici : .test() sur une regex /g/ avance lastIndex
// et raterait un appel sur deux — le /g/ n'est ajouté qu'au moment du replace.
const PROMESSE_REPRISE_RE = /(?:\s*[—–-])?\s*(?:(?:le job|la publication|la republication|il|elle|on)\s+(?:repartira|reprendra|réessaiera)|nouvelle tentative(?:\s+automatique)?\s+au prochain passage)[^.]*\.?/i;
// Marqueur LARGE de la même promesse, indépendant de la tournure exacte
// (consigne du 16/08 : le déclenchement se fait sur le STATUT, pas sur la
// formulation — une variante non répertoriée doit quand même être traitée).
// Sert de test d'entrée ET de contrôle de sortie : si le corps nettoyé porte
// encore un marqueur, on n'affiche pas ce reliquat, on prend le générique.
const PROMESSE_MARQUEUR_RE = /au prochain passage|repartira|reprendra|réessaiera|sera\s+retenté/i;
const TECH_ERR_MARKERS_RE = new RegExp([
  '\\.js\\b',                    // nom de fichier du code (vintedCategories.js…)
  'https?://',                   // URL d'API sondée
  '[\\[{]\\s*"',                 // dump JSON (réponse plateforme, liste d'options)
  '\\bHTTP\\s*/?\\s*[0-9]{3}\\b',
  '\\b(?:status|statut)\\s*[0-9]{3}\\b',
  'outerHTML|querySelector|data-testid|sélecteur|selector|chevron',
  'platform_fields|needsUser|payload',
  // Erreurs Chrome en prose anglaise (canal/onglet coupé) : sans marqueur,
  // elles passaient par le « message déjà humain » et s'affichaient telles
  // quelles (fuite du 17/09). Marquées techniques → jamais affichées brutes.
  'could not establish connection|receiving end does not exist|message (?:port|channel) closed|no tab with id|an asynchronous response',
  // Préfixes de log internes jamais destinés au vendeur.
  '\\bLIVE\\s*:|Observabilit[ée]\\s*:|\\[cause',
].join('|'), 'i');

// ── Bascule quotas (02/09) : plus de monnaie interne — purge à l'AFFICHAGE ───
// Le système d'unités a été supprimé le 02/09, mais les extensions du parc
// (jusqu'à 0.6.16 incluse pour certaines chaînes) et les jobs historiques
// portent encore des phrases unités dans cross_post_jobs.error : « Ta unité
// reste réservée : elle te sera rendue automatiquement sous 72 h… », « la
// unité est rendue », « Rien ne t'a été décompté ». La colonne est une DONNÉE
// (on n'y touche pas) et le parc n'a pas d'OTA : le retrait se fait ici, à
// l'affichage — clause accolée d'abord (pour garder « ton annonce est
// intacte »), phrase entière ensuite, jamais un mot isolé qui laisserait une
// tournure bancale. Sans /g sur le test d'entrée (lastIndex, cf. PROMESSE_*).
// ⚠️ Ces motifs matchent le MOT HISTORIQUE tel qu'il vit dans les DONNÉES
// (cross_post_jobs.error du parc) — ils ne doivent JAMAIS être « nettoyés » :
// c'est précisément ce qui les efface de l'écran.
const MOT_MONNAIE_RE = /p[ée]pites?|nuggets?|décompté|deducted/i;
export function sansMentionMonnaie(texte) {
  const t0 = String(texte ?? '');
  if (!MOT_MONNAIE_RE.test(t0)) return t0;
  return t0
    .replace(/,\s*(?:et\s+)?la P[ée]pite (?:est|sera|te sera) rendue[^.!?…]*/gi, '')
    .replace(/\s*(?:et|—|–)\s*rien ne t[’']a été décompté[^.!?…]*/gi, '')
    .replace(/[^.!?…]*(?:P[ée]pites?|Nuggets?|décompté|deducted)[^.!?…]*[.!?…]?/gi, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([.,;!?])/g, '$1')
    .trim();
}

// ── « Action requise » ≠ « Échec » (2026-09-03, chantier « plus aucun échec
// visible ») ─────────────────────────────────────────────────────────────────
// Relevé 30 j : les familles ci-dessous représentent l'écrasante majorité des
// « échecs » affichés en ROUGE alors que RIEN n'est cassé — session à rouvrir,
// reconnexion de sécurité, vérification anti-robot, information de compte à
// compléter. L'annonce est intacte, un geste utilisateur débloque : ces jobs
// se présentent en ✋ « À toi de jouer » (orange), jamais avec le vocabulaire
// de l'échec. Reconnaissance sur le TEXTE (les jobs du parc et l'historique
// n'ont pas d'autre marqueur) — toute nouvelle famille s'ajoute ICI.
const ACTION_UTILISATEUR_RE = new RegExp([
  '^CHALLENGE\\s',
  '^REAUTH VENTE eBay',
  'reconnexion de sécurité',
  '^Connexion (Vinted|Leboncoin|Beebs|eBay) requise',
  'session Vinted refusée',
  'attend que Vinted soit rouvert',
  'page de connexion à la place du formulaire',
  '^Adresse requise pour Leboncoin',
  'nom et ton prénom sur ton compte vendeur',
  'brouillon Leboncoin non terminé',
  '/fpa/upgrade',
  'vérification anti-robot',
].join('|'), 'i');
export function jobActionRequise(job) {
  if (job?.status === 'needs_user') return true;
  return ACTION_UTILISATEUR_RE.test(String(job?.error ?? ''));
}

// ── needs_user SANS champ à remplir (2026-09-10, règle Nico) ────────────────
// Un job 'needs_user' n'est pas toujours « à compléter ». Trois natures, que
// l'écran doit distinguer — sinon on affiche « ✋ À compléter » et un bouton
// « Compléter » qui n'ouvre rien (vécu le 09/09 sur Leboncoin) :
//   · 'a_completer' : un CHAMP à trancher (needsUserField, champs_a_completer,
//     serverRequired) → « À compléter », bouton « Compléter » ;
//   · 'en_cours'    : la requête est PARTIE et la plateforme n'a pas encore
//     répondu (vinted_depot_incertain, lbc_depot_incertain — posés par
//     l'extension via last_diagnostic.quoi). L'app ne sait pas encore → elle
//     dit « en cours » et NE DEMANDE RIEN : aucun bouton, aucune relance
//     (une relance ferait le doublon ; la synchro / la re-capture tranchent) ;
//   · 'action'      : une action hors app (identité Leboncoin, catégorie
//     eBay à confirmer…) → « Action », le message dit quoi, jamais
//     « Compléter ».
export const NEEDS_USER_EN_COURS = new Set(['vinted_depot_incertain', 'lbc_depot_incertain']);
export function natureNeedsUser(job) {
  if (job?.status !== 'needs_user') return null;
  const pf = job.platform_fields ?? {};
  const quoi = String(pf.last_diagnostic?.quoi ?? '');
  if (NEEDS_USER_EN_COURS.has(quoi)) return 'en_cours';
  const champs = Array.isArray(pf.champs_a_completer) ? pf.champs_a_completer : [];
  const server = Array.isArray(pf.serverRequired) ? pf.serverRequired
    : (Array.isArray(pf.server_required_fields) ? pf.server_required_fields : []);
  if (pf.needsUserField?.field_key || champs.length || server.length) return 'a_completer';
  return 'action';
}
// ── Champs exigés par le SERVEUR de la plateforme que l'app sait SAISIR ─────
// (2026-09-12, dossier Anaïs.) Refus Vinted HTTP 400 « Description » +
// « Couleur » sur une nouvelle publication : la couleur avait un
// needsUserField (liste relevée, modale « Compléter »), la DESCRIPTION n'avait
// AUCUN chemin dans l'app — pas de needsUserField, pas dans REPUB_SAISISSABLES,
// le textarea de la copie Vinted n'existe qu'au stepper de création, et la
// relance renvoyait le job tel quel (description vide) — alors que le message
// disait « renseigne « Description » dans la copie Vinted de l'app » : un
// geste impossible, la classe de défaut de l'audit du 11/09.
// Ces champs-là ne sont pas des aspects de plateforme mais des COLONNES DU
// JOB : la modale « Compléter » les propose en texte libre, avec les mots de
// l'utilisateur (jamais un texte inventé), et les écrit sur le job ET sur
// l'article. Liste FERMÉE : un champ hors liste reste non saisissable et
// l'écran le dit, sans promesse.
export const CHAMPS_SERVEUR_SAISISSABLES = {
  description: { fr: 'Description', en: 'Description' },
};
export function champsServeurSaisissables(job) {
  const pf = job?.platform_fields ?? {};
  const server = Array.isArray(pf.serverRequired) ? pf.serverRequired
    : (Array.isArray(pf.server_required_fields) ? pf.server_required_fields : []);
  const cles = [];
  for (const f of server) {
    const k = String((f && typeof f === 'object') ? f.key : f ?? '').toLowerCase().trim();
    if (k in CHAMPS_SERVEUR_SAISISSABLES && !cles.includes(k)) cles.push(k);
  }
  return cles;
}
// La modale « Compléter » a quelque chose à OUVRIR : un needsUserField (aspect
// à trancher, liste relevée) ou un champ serveur saisissable (description).
// Règle du 09/09 : un bouton « Compléter » qui n'ouvre rien n'existe pas.
export function needsUserOuvrable(job) {
  if (job?.status !== 'needs_user') return false;
  // (25/09) Des champs demandés ensemble SANS champ principal ouvrent aussi la
  // modale : elle prend le premier comme principal — jamais une question sans écran.
  const ensemble = Array.isArray(job?.platform_fields?.needsUserFields)
    && job.platform_fields.needsUserFields.some((c) => c && c.field_key && c.field_label);
  return Boolean(job?.platform_fields?.needsUserField) || ensemble || champsServeurSaisissables(job).length > 0;
}
// ── Republication arrêtée parce que l'ANNONCE N'EXISTE PLUS (2026-09-12) ────
// 404 constaté à la CAPTURE, avant toute suppression (verdict 'disparue' posé
// par l'extension quand l'identité connectée est bien celle de l'article, ou
// marqueur annonce_disparue posé par update-job-status). Ce n'est pas un
// échec FillSell : rien n'a été retiré, l'annonce a disparu côté Vinted. Les
// lecteurs de « échec » (pastille rouge de la carte, modale de statut)
// l'écartent ; la carte dit « Plus en ligne » par disparu_le, et la revue
// « vendue ? » prend le relais. Jamais après une suppression (étape
// 'deleted') : là, un 404 est un tout autre sujet.
export function republicationAnnonceDisparue(job) {
  if (!job || job.action !== 'republish') return false;
  const pf = job.platform_fields ?? {};
  if (pf.republish_step === 'deleted' || pf.deleted_at) return false;
  return pf.introuvable_404?.verdict === 'disparue' || Boolean(pf.annonce_disparue);
}
// ── Refus eBay pour VÉRIFICATION VENDEUR (2026-09-10, costume de Victor) ─────
// eBay refuse la mise en vente tant que l'identité du vendeur n'est pas
// vérifiée (DSA / B2C européen). Le serveur nomme ce motif dans
// last_diagnostic.motif_ebay (ebay-api-worker v33+, famille KYC_*) — c'est le
// SEUL déclencheur accepté ici : sur un code inconnu, ou sur un motif non
// nommé, cette fonction rend null et l'écran ne change pas d'un pixel.
//
// ⛔ LE LIBELLÉ NE PROMET PAS UNE PAGE QUI N'EXISTE PAS. Relevé du 10/09 :
// ebay.fr/verifyidentity, /sellerregistration, accountsettings/regulatory et
// /sh/acc/verification redirigent TOUTES vers une page d'erreur. La seule
// porte vivante est le Seller Hub (/sh/ovw), où eBay affiche lui-même sa
// bannière de vérification. On dit donc « Ouvrir mon compte vendeur eBay »,
// pas « Vérifier mon identité » : un demi-mensonge dans un bouton coûte plus
// cher qu'un mot de plus.
//
// Rien à remplir chez nous : aucun needsUserField n'est posé sur ce refus,
// donc aucun bouton « Compléter » n'apparaît (règle du 09/09). Le geste qui
// débloque est chez eBay, puis « Relancer » — que l'utilisateur déclenche
// lui-même, parce que lui seul sait s'il a fait sa vérification.
export const EBAY_SELLER_HUB_URL = 'https://www.ebay.fr/sh/ovw';
export function lienVerificationEbay(job, lang = 'fr') {
  if (job?.platform !== 'ebay' || job?.status !== 'needs_user') return null;
  // (12/10, Nico) « Compte eBay à finir » : le lien DIRECT vers ce qui reste
  // (posé par ebay-api-worker, _shared/ebay-voie.ts etapeEbayAFinir) — conditions
  // de vente, ou compte vendeur (Seller Hub) ; un job parqué avant le 12/10
  // (sans étape) ouvre le Seller Hub, qui mène aux deux.
  // (14/11, point 5a de Nico — af37fa49) LA règle unique (_shared/ebay-compte-a-finir.js, gesteCompteEbayAFinir) :
  //   · plafond, inscription vendeur : le lien chez eBay (Seller Hub), seul geste possible ;
  //   · conditions (04/11, décision de Nico) : « Créer mes conditions eBay » dans FillSell, et en second l'espace vendeur
  //     eBay (« Ou les créer moi-même sur eBay », ebay.fr/bp/manage, lien vérifié le 14/11 — demande de Nico du 14/11) ;
  //   · le reste (choisir ses conditions, ses retours, sa ville d'expédition, compte pas encore lu, job d'avant sans
  //     étape) : « Finir mon compte eBay », l'écran eBay de FillSell — jusqu'au 14/11 ces cas n'avaient AUCUN geste ici,
  //     et l'écran proposait « Me connecter » (relier eBay, « ordinateur ») à un compte déjà relié.
  if (job?.platform_fields?.needs_user_source === 'ebay_compte_a_finir') {
    return gesteCompteEbayAFinir(job.platform_fields.ebay_a_finir ?? null, lang === 'en' ? 'en' : 'fr');
  }
  // (09/11, point 2 de Nico — compte 39bfa95a) Un refus qui vise le COMPTE (vérification d'identité ou des données
  // financières, compte bloqué) : le lien chez eBay et l'aide, depuis la règle unique (_shared/ebay-refus-compte.js).
  const mur = gesteMurCompteEbay(job, lang);
  if (mur) return { url: mur.url, libelle: mur.libelle, aide: mur.aide };
  const motif = String(job?.platform_fields?.last_diagnostic?.motif_ebay ?? '');
  if (!/^KYC_/i.test(motif)) return null;
  return {
    url: EBAY_SELLER_HUB_URL,
    libelle: lang === 'en' ? 'Open my eBay seller account' : 'Ouvrir mon compte vendeur eBay',
    aide: lang === 'en'
      ? 'eBay shows the verification banner there. Once verified, come back and relaunch.'
      : "eBay y affiche sa bannière de vérification. Une fois vérifié, reviens et relance.",
  };
}
export function texteEnCoursConfirmation(job, lang = 'fr') {
  const en = lang === 'en';
  const name = HUMANIZE_PLATFORM_LABELS[job?.platform] || job?.platform || (en ? 'the platform' : 'la plateforme');
  return en
    ? `Your listing went through to ${name} and is awaiting their confirmation. Nothing to do on your side.`
    : `Ta publication est partie sur ${name}, elle est en cours de confirmation chez eux. Rien à faire de ton côté.`;
}

// ── Débruitage ÉQUILIBRÉ des parenthèses (2026-09-06) ─────────────────────────
// Le retrait « incise technique entre parenthèses » se faisait par une regex
// [^)]* : sur une parenthèse IMBRIQUÉE — « (Vinted a REFUSÉ … (réponse
// serveur HTTP 400) : … (Le formulaire est resté sur /items/new.) — … ) » —
// elle s'arrêtait à la PREMIÈRE parenthèse fermante et laissait « serveu).
// Rien n'est perdu : » à l'écran (14 jobs, 9 comptes, relevé du 06/09).
// Ici : parcours à profondeur, groupe par groupe. Un groupe dont le contenu
// (imbrications comprises) porte un marqueur technique est retiré EN ENTIER ;
// sinon on descend dedans et on ne retire que ses sous-groupes techniques.
const INCISE_TECH_RE = /HTTP\s*\d{3}|https?:\/\/|\/[a-z0-9_-]+\/|\.js\b|outerHTML|querySelector|data-testid/i;
export function retirerParenthesesTechniques(texte) {
  const t = String(texte ?? '');
  let out = '';
  let i = 0;
  while (i < t.length) {
    const c = t[i];
    if (c !== '(') { out += c; i++; continue; }
    // Trouver la fermante ÉQUILIBRÉE.
    let depth = 0, j = i;
    for (; j < t.length; j++) {
      if (t[j] === '(') depth++;
      else if (t[j] === ')') { depth--; if (depth === 0) break; }
    }
    if (j >= t.length) { out += t.slice(i); break; } // jamais fermée : on laisse tel quel
    const interieur = t.slice(i + 1, j);
    if (INCISE_TECH_RE.test(interieur)) {
      // Groupe technique : retiré en entier, avec l'espace qui le précède.
      out = out.replace(/\s+$/, '');
    } else {
      out += '(' + retirerParenthesesTechniques(interieur) + ')';
    }
    i = j + 1;
  }
  return out;
}

// ── Raccourcissement qui GARDE le champ et le geste (2026-09-06) ──────────────
// Un message débruité mais trop long (> 600 car.) partait en « imprévu
// technique » : le vendeur perdait le champ à corriger. Ici : on découpe en
// segments (phrases, tirets, points-virgules), on garde le premier (le
// constat) puis, dans l'ordre, ceux qui nomment un champ ou un geste, jusqu'à
// 300 caractères. Jamais un texte inventé : seulement des segments du message.
const SEGMENT_GESTE_RE = /à faire|renseigne|compl[èe]te|relance|choisis|corrige|ajoute|exige|doit être|champ|puis /i;
export function raccourcirMessageJob(texte, max = 300) {
  const t = String(texte ?? '').replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  const segments = t.split(/(?<=[.!?])\s+|\s+[—–]\s+|\s*;\s+/).map(x => x.trim()).filter(Boolean);
  if (segments.length <= 1) return t.slice(0, max - 1).replace(/\s+\S*$/, '') + '…';
  const gardes = [segments[0]];
  let total = segments[0].length;
  for (const seg of segments.slice(1)) {
    if (!SEGMENT_GESTE_RE.test(seg)) continue;
    if (total + 1 + seg.length > max) continue;
    gardes.push(seg); total += 1 + seg.length;
  }
  let out = gardes.join(' ');
  if (out.length > max) out = out.slice(0, max - 1).replace(/\s+\S*$/, '') + '…';
  return out;
}

// ── Les notes de suivi de l'extension, en mots de vendeur (03/10, point 15) ──
// Rend null pour tout autre texte. Les phrases rendues sont À L'OCTET celles
// que l'extension 0.6.90 écrit elle-même (background.js), vérifiées par
// scripts/textes-montres-selftest.mjs.
export function texteSuiviLisible(raw, name, en) {
  if (/^Impossible de vérifier l'état de cette annonce \S+ après \d+ tentatives/i.test(raw)) {
    return en
      ? `We could not check this listing on ${name}: its page did not answer as expected. The listing was not touched; we will check again at a later pass.`
      : `Impossible de vérifier cette annonce sur ${name} : sa page n'a pas répondu comme prévu. L'annonce n'a pas été touchée ; nouvelle vérification à un prochain passage.`;
  }
  const remplacee = raw.match(/^Annonce (\d+) remplacée par une republication \(l'article vit désormais sur l'annonce (\d+)\) — job obsolète clos automatiquement, pas une vente\.?$/i);
  if (remplacee) {
    return en
      ? `Listing ${remplacee[1]} was replaced by a relisting (the item now lives on listing ${remplacee[2]}): the old publication is closed, it is not a sale.`
      : `Annonce ${remplacee[1]} remplacée par une republication (l'article vit désormais sur l'annonce ${remplacee[2]}) : l'ancienne publication est close, ce n'est pas une vente.`;
  }
  // Remise en file par le veilleur (handler-watch, jusqu'au 03/10) : seule la
  // fin de phrase parlait de « job » et d'« extension connectée ».
  const remise = raw.match(/^(Reprise après (?:interruption|blocage) : .*?)Le job est remis en file et repartira (?:tout seul|automatiquement)(?: dès qu'une extension connectée se réveille)?(?: — rien à faire de ton côté)?\.?$/is);
  if (remise) {
    return en
      ? "Resumed after an interruption: it is back in the queue and will start again on its own as soon as Chrome is open on your computer."
      : `${remise[1]}C'est remis en file et ça repartira tout seul dès que Chrome sera ouvert sur ton ordinateur.`;
  }
  // Doublons annulés à la main (septembre) : « doublon du job … », « ce job a
  // été créé … » — la phrase vraie, sans numéro interne ni conseil de relance.
  if (/^(?:Annulé[^:]{0,20}:\s*doublon|Doublon de dépôt annulé)/i.test(raw)) {
    return en
      ? 'Cancelled: it duplicated another publication of the same item. Nothing is lost — the item only goes out once.'
      : "Annulée : c'était le doublon d'une autre publication du même article. Rien n'est perdu — l'article ne part qu'une fois.";
  }
  const dejaEnLigne = raw.match(/^Annulé[^:]{0,20}:\s*cet article est DÉJÀ EN LIGNE sur (\S+)/i);
  if (dejaEnLigne) {
    return en
      ? `Cancelled: this item is already live on ${dejaEnLigne[1]}. Relaunching it would have created a second listing of the same item.`
      : `Annulée : cet article est déjà en ligne sur ${dejaEnLigne[1]}. La relancer aurait créé une seconde annonce du même objet.`;
  }
  return null;
}

// ── Les familles de messages eBay, en mots de vendeur (24/09) ────────────────
// Rend null pour tout message non reconnu (circuit commun). Aucune liste
// brute, aucun sélecteur, aucun code HTTP, aucun « job », aucun « LIVE ».
function texteEbayLisible(raw, job, en) {
  const termine = JOB_STATUS_TERMINAL.has(job?.status);
  const relance = en ? ' Relaunch the publication from the item.' : " Relance la publication depuis la fiche de l'article.";
  const suite = termine
    ? (en ? ' Nothing was published.' + relance : " Rien n'a été publié." + relance)
    : (en ? ' Nothing was published yet — it resumes on its own once answered.' : " Rien n'a été publié pour l'instant — la publication repart d'elle-même une fois la réponse donnée.");
  const liste = (s) => String(s ?? '').split(/\s*,\s*/).map(x => x.trim()).filter(Boolean);
  // Aspects obligatoires vides (ebay.js) : « Hauteur, Largeur, Longueur, Type ».
  const aspects = raw.match(/aspect\(s\) obligatoire\(s\) eBay vide\(s\)(?: sur le formulaire)?\s*:\s*([^—\n]+?)\s*—/i);
  if (aspects) {
    const champs = liste(aspects[1]);
    return en
      ? `eBay needs ${champs.length > 1 ? 'these details' : 'this detail'} to list the item: ${champs.join(', ')}. Fill ${champs.length > 1 ? 'them' : 'it'} in from the item (“✋ Complete” button).${suite}`
      : `eBay a besoin de ${champs.length > 1 ? 'ces informations' : 'cette information'} pour publier l'article : ${champs.join(', ')}. Complète-${champs.length > 1 ? 'les' : 'la'} depuis la fiche de l'article (bouton « ✋ Compléter »).${suite}`;
  }
  // Taille sans équivalent eBay (ebay.js, deux tournures).
  const taille = raw.match(/(?:eBay ne propose pas la taille|traduire ta taille)\s*«\s*([^»]+?)\s*»/i);
  if (taille) {
    return en
      ? `eBay does not offer size “${taille[1]}” in this category. Pick one of the sizes eBay accepts from the item (“✋ Complete” button).${suite}`
      : `eBay ne propose pas la taille « ${taille[1]} » dans ce rayon. Choisis une des tailles qu'eBay accepte depuis la fiche de l'article (bouton « ✋ Compléter »).${suite}`;
  }
  if (/liste des aspects obligatoires absente du job/i.test(raw)) {
    return en
      ? `This eBay listing was prepared before a change on our side and must be regenerated before it can go out. Nothing was published: regenerate the listing from the item, then publish again.`
      : `Cette annonce eBay a été préparée avant un changement de notre côté et doit être régénérée avant de partir. Rien n'a été publié : régénère l'annonce depuis la fiche de l'article, puis republie.`;
  }
  if (/description non posée dans l'éditeur eBay/i.test(raw)) {
    return termine
      ? (en ? `The description could not be set on eBay — the problem is on our side. Nothing was published.${relance}` : `La description n'a pas pu être posée sur eBay — le problème vient de notre côté. Rien n'a été publié.${relance}`)
      : (en ? 'The description could not be set on eBay — the problem is on our side. Nothing was published; it retries on its own.' : "La description n'a pas pu être posée sur eBay — le problème vient de notre côté. Rien n'a été publié ; la publication réessaie d'elle-même.");
  }
  if (/prix absent ou nul sur le formulaire eBay/i.test(raw)) {
    return en
      ? `The price could not be set on eBay, so the listing was not created. Check the item's price, then relaunch from the item.`
      : `Le prix n'a pas pu être posé sur eBay, l'annonce n'a donc pas été créée. Vérifie le prix de l'article, puis relance depuis sa fiche.`;
  }
  if (/ebayCategoryId absent|Formulaire eBay non atteint/i.test(raw)) {
    return en
      ? `eBay did not accept the category we chose for this item. Nothing was published: change the item's icon or regenerate the listing, then publish again.`
      : `eBay n'a pas accepté la catégorie que nous avions choisie pour cet article. Rien n'a été publié : change l'icône de l'article ou régénère l'annonce, puis republie.`;
  }
  if (/^Session eBay à vérifier/i.test(raw)) {
    return en
      ? `eBay did not open its listing form. Check that you are signed in to eBay on your computer; it retries on its own.`
      : `eBay n'a pas ouvert son formulaire de vente. Vérifie que tu es connecté à eBay sur ton ordinateur ; la publication réessaie d'elle-même.`;
  }
  // Genre (ebay.js) : la phrase est lisible, seul « régénérer le job » ne l'est pas.
  if (/^Genre\b/i.test(raw) && /champs eBay de l'app/i.test(raw)) {
    return raw.replace(/,?\s*puis régénérer\s+le job\.?/i, ", puis relance la publication.").replace(/\s{2,}/g, ' ').trim();
  }
  // Reconnexion de vente (ebay.js 0.6.5+) : le préfixe « REAUTH VENTE eBay : » n'est pas pour le vendeur.
  const reauth = raw.match(/^REAUTH VENTE eBay\s*:\s*(.+)$/is);
  if (reauth) return reauth[1].replace(/\s*Reprise automatique dans[^.]*\.\s*$/i, '').trim();
  // Worker API : « eBay a refusé la fiche produit (400, 25002) : <motif> [params] ».
  const refus = raw.match(/^eBay a refusé ([^(:]+?)\s*\(\d{3}[^)]*\)\s*:\s*(.+)$/is);
  if (refus) {
    const motif = refus[2].replace(/\s*\[[^\]]*\]\s*$/, '').trim().replace(/[.\s]+$/, '');
    return en
      ? `eBay refused ${refus[1]}. Its reason: “${motif.slice(0, 220)}”.${termine ? relance : ''}`
      : `eBay a refusé ${refus[1]}. Son motif : « ${motif.slice(0, 220)} ».${termine ? relance : ''}`;
  }
  if (/^Impossible de lire les caractéristiques de la catégorie/i.test(raw)) {
    return en
      ? `eBay did not answer when we asked for this category's details. Nothing was published; it retries on its own.`
      : `eBay n'a pas répondu quand nous lui avons demandé les caractéristiques de ce rayon. Rien n'a été publié ; la publication réessaie d'elle-même.`;
  }
  if (/^(Job sans inventaire_id|Job de republication sans inventaire_id|eBay a répondu sans offerId|Erreur interne du worker|Action « [^»]+ » non prise en charge)/i.test(raw)) {
    return en
      ? `Publishing on eBay stopped because of a problem on our side. Nothing was published.${relance}`
      : `La publication sur eBay s'est arrêtée à cause d'un problème de notre côté. Rien n'a été publié.${relance}`;
  }
  return null;
}

/**
 * Beebs, champ fermé dont la valeur de la fiche n'est PAS dans la liste du
 * rayon : le message vrai (03/10). null si le texte n'est pas ce cas, ou si la
 * valeur est vraiment dans la liste (la panne de remplissage est alors réelle).
 */
export function texteBeebsValeurHorsListe(raw, job, en = false) {
  const m = String(raw ?? '').match(/« ([^»]+) » : la fiche porte « ([^»]+) » mais la valeur n'a pas pu être posée sur la page — panne de remplissage/);
  if (!m) return null;
  const champ = m[1].trim();
  const valeur = m[2].trim();
  const pf = job?.platform_fields ?? {};
  const champs = [pf.needsUserField, ...(Array.isArray(pf.needsUserFields) ? pf.needsUserFields : [])].filter((c) => c && typeof c === 'object');
  const nuf = champs.find((c) => String(c.field_label ?? c.field_key ?? '').replace(/\*\s*$/, '').trim() === champ) ?? champs[0];
  const options = (Array.isArray(nuf?.allowed_values) ? nuf.allowed_values : [])
    .map((o) => String(typeof o === 'string' ? o : (o?.title ?? o?.label ?? o?.value ?? '')).trim()).filter(Boolean);
  const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  if (!options.length || options.some((o) => norm(o) === norm(valeur))) return null;
  const exemples = `${options.slice(0, 4).join(', ')}${options.length > 4 ? '…' : ''}`;
  const retiree = job?.action === 'republish' && pf.republish_step === 'deleted';
  return en
    ? `Beebs does not offer “${valeur}” for “${champ}” in this category (choices: ${exemples}). Pick the right one with “✋ Complete”: ` +
      (retiree ? 'your Beebs listing was removed to be reposted, it comes back online as soon as you choose.' : 'publishing resumes as soon as you choose.')
    : `Beebs ne propose pas « ${valeur} » pour « ${champ} » dans ce rayon (choix possibles : ${exemples}). Choisis la bonne valeur avec « ✋ Compléter » : ` +
      (retiree ? 'ton annonce Beebs a été retirée pour être republiée, elle revient en ligne dès ton choix.' : 'la publication repart dès ton choix.');
}

// (16/10, Nico) FILET UNIQUE : tout texte de job montré par l'app passe ici, et
// en ressort sans heure promise ni durée (_shared/etat-job.js, sansEstimation).
// ── (18/11/2026, lot T2 point 1 — ordre de Nico) LA PORTE COMMUNE DU TEXTE D'UNE TÂCHE SELON LA VOIE ───────────────────
// Un compte FillSell Cloud ne lit jamais « extension », « Chrome » ni « ordinateur » : TOUT texte de tâche montré par l'app
// passe ici — humanizeJobError ET jobErrorSansFaussePromesse (la fenêtre de la tâche, qui montrait le texte brut d'une
// tâche vivante : « …si Chrome est ouvert sur ton ordinateur à ce moment-là » chez 2f8b09d2 et a962a59e, 18/11).
// La règle elle-même : supabase/functions/_shared/texte-voie.js (texteSelonVoie). Toutes les tâches du compte Cloud, eBay
// compris (par l'API : « FillSell », nos serveurs ; le reste : « FillSell Cloud »). Sans Cloud : le texte tel quel.
export function texteTacheSelonVoie(job, t, lang = 'fr', cloud = compteCourantEstCloud()) {
  if (typeof t !== 'string' || !t || cloud !== true) return t;
  const nom = HUMANIZE_PLATFORM_LABELS[job?.platform] || job?.platform || (lang === 'en' ? 'the platform' : 'la plateforme');
  return texteSelonVoie(t, { cloud: true, nom, lang, executant: parLeCloud(job, true) ? 'cloud' : 'serveurs' });
}

export function humanizeJobError(job, lang = 'fr') {
  let t = humanizeJobErrorBrut(job, lang);
  // (02/11 soir, Nico) Compte Cloud : une tâche ne renvoie jamais vers le navigateur ni l'ordinateur de la personne.
  // (18/11, lot T2 point 1) La porte commune texteTacheSelonVoie (la même pour la fenêtre de la tâche, qui montrait le brut).
  t = texteTacheSelonVoie(job, t, lang);
  if (typeof t !== 'string') return t;
  t = sansEstimation(t);
  // (06/11, phase 3 point 1 — suite) Une phrase écrite EN FRANÇAIS en base (serveur, SQL, extension) et passée
  // telle quelle : lue en anglais quand l'app l'est (utils/messagesServeur.js). En français, rien n'est appelé.
  // (07/11, point 1) Jamais « rien n'est vendu » sur une remise en vente : elle suit une vente (utils/rienVenduSurVente.js).
  return sansRienVenduSurVente(lang === 'en' ? traduireMessageServeur(t, 'en') : t, job);
}
function humanizeJobErrorBrut(job, lang = 'fr') {
  // États Vinted d'une page étrangère (« Very good »…) : affichés dans la langue
  // de l'app (03/10, point E) — cf. utils/etatsVinted.js.
  const raw = etatsVintedLisibles(sansMentionMonnaie(String(job?.error ?? '').trim()), job?.platform, lang);
  if (!raw) return '';
  const en = lang === 'en';
  const name = HUMANIZE_PLATFORM_LABELS[job?.platform] || job?.platform || (en ? 'the platform' : 'la plateforme');

  // ── needs_user EN COURS chez la plateforme (2026-09-10) : le texte stocké
  // par une extension d'avant la 0.6.24 (« vérifie Mes annonces… ») n'est
  // jamais affiché — quand l'app ne sait pas encore, elle dit « en cours » et
  // ne demande rien.
  if (natureNeedsUser(job) === 'en_cours') return texteEnCoursConfirmation(job, lang);

  // ── LES NOTES QUI DISAIENT « JOB » (03/10, point 15) ──────────────────────
  // Textes de l'extension (jusqu'à la 0.6.89), du veilleur (jusqu'au 03/10) et
  // annulations de septembre : « humains » au sens du filtre, mais ils disent
  // « le job reste 'published' », « job obsolète », « doublon du job … » —
  // 2 864 jobs sur 14 jours. Réécrits ici, AVANT toute autre famille (la
  // famille « Annulé le … » ci-dessous conseillait de relancer un doublon).
  const suiviTexte = texteSuiviLisible(raw, name, en);
  if (suiviTexte) return suiviTexte;

  // ── Challenge anti-robot (message RÉÉCRIT ICI depuis le 2026-08-10) ────────
  // Le libellé stocké commence par « CHALLENGE <nom> : » (motif SQL) suivi
  // d'une consigne rédigée côté extension. Cette consigne était affichée telle
  // quelle, et elle PROMET une reprise qui n'arrive pas : « le job repartira au
  // prochain passage ».
  // Ce qui se passe réellement (chrome-extension/background.js, rearmBounded) :
  // un needsUser est ré-armé au plus MAX_NEEDS_USER_RETRIES = 2 fois, à
  // quelques MINUTES d'intervalle — jamais le temps de résoudre une
  // vérification à la main. La 2ᵉ occurrence passe le job en `failed`, ce qui
  // déclenche settle_publish_reservation('release') : l'unité engagée
  // revient (coin_ledger kind='release_publish', reason='job_terminal').
  // Relevé prod du 2026-08-10 : 6 jobs `error LIKE 'CHALLENGE %'`, les 6 en
  // `failed`, 0 repris — la reprise promise n'a jamais eu lieu pour personne.
  // Le texte source vit dans chrome-extension/, hors de portée d'un OTA : la
  // correction se fait donc à l'affichage, et elle dépend du statut RÉEL.
  const challenge = raw.match(/^CHALLENGE\s+[A-ZÀ-Ÿ0-9 -]+?\s*:\s*(.+)$/is);
  if (challenge) {
    const termine = JOB_STATUS_TERMINAL.has(job?.status);
    if (!termine) {
      // Job encore vivant : une tentative automatique reste possible. On la dit
      // pour ce qu'elle est — quelques minutes, pas un rattrapage — sans
      // promettre qu'elle aboutira.
      return en
        ? `${name} is showing an anti-robot check. Open ${name} on your computer and pass it now — one automatic retry is left, on its own.`
        : `${name} affiche une vérification anti-robot. Ouvre ${name} sur ton ordinateur et valide-la maintenant — il reste une tentative automatique, toute seule.`;
    }
    // Terminé : c'est fini, personne ne reprendra. (Nettoyage unités 03/09 :
    // plus aucune mention de décompte — la monnaie interne n'existe plus.)
    const acte = job?.action === 'republish' ? 'republication' : 'publication';
    return en
      ? `${name} showed an anti-robot check instead of the listing form: nothing was published and it has stopped.`
        + ` Open ${name} on your computer, pass the check, then start the ${acte} again yourself from the item.`
      : `${name} a affiché une vérification anti-robot à la place du formulaire : rien n'a été publié et la ${acte} est arrêtée.`
        + ` Ouvre ${name} sur ton ordinateur, passe la vérification, puis relance la ${acte} toi-même depuis la fiche de l'article.`;
  }

  // ── Step-up de reconnexion vente eBay (RÉÉCRIT ICI depuis le 2026-08-14) ──
  // Message du parc 0.6.1/0.6.2 : « eBay a servi une page inattendue
  // (/ws/eBayISAPI.dll) alors que ta session eBay est valide — … Le job
  // repartira automatiquement au prochain passage. » Les DEUX moitiés sont
  // contredites par la base (relevé Nico 14/08, 7 cas / 5 comptes) : les 7
  // URL sont signin.ebay.fr/ws/eBayISAPI.dll?SignIn&…&ru=<formulaire de
  // dépôt> (vrai mur d'authentification, même pageType=2379018), AUCUN job
  // n'est jamais reparti (rejeux 00h41→01h08 Manon, 18h15→18h22 Dujardin :
  // même résultat), zéro publication eBay réussie depuis sur les 5 comptes.
  // eBay maintient la session de NAVIGATION (la sonde a raison) mais exige
  // une reconnexion INTERACTIVE pour le flux de VENTE — elle ne se lève pas
  // toute seule. Le texte source vit dans chrome-extension/ (corrigé en
  // 0.6.5, libellé « REAUTH VENTE eBay », qui n'est PAS réécrit ici) : pour
  // le parc, correction à l'affichage, même doctrine que CHALLENGE et que la
  // règle 2.4.47 — plus jamais de fausse promesse de reprise.
  // Rythme inexpliqué (5 cas/16 j avant le 12/08, 7/3 j après) : question
  // OUVERTE, à reprendre avec plus de volume — rien ici n'en dépend.
  if (job?.platform === 'ebay' && /page inattendue.*session eBay est valide/is.test(raw)) {
    const termine = JOB_STATUS_TERMINAL.has(job?.status);
    const etatFr = termine
      ? "Rien n'a été publié et la publication est arrêtée."
      : "Rien n'a été publié, et les tentatives automatiques restantes échoueront aussi tant que la reconnexion n'est pas faite.";
    const etatEn = termine
      ? 'Nothing was published and the publication has stopped.'
      : 'Nothing was published, and the remaining automatic retries will fail too until you sign in again.';
    return en
      ? `eBay requires you to sign in again before it lets you list an item, even though your eBay session is still valid elsewhere. ${etatEn} In order: open eBay on your computer, click "Sell", sign in again, then restart the publication from the item in the app.`
      : `eBay demande une reconnexion avant de laisser déposer une annonce, même si ta session eBay est encore valide ailleurs. ${etatFr} Dans l'ordre : ouvre eBay sur ton ordinateur, clique « Vendre », reconnecte-toi, puis relance la publication depuis la fiche de l'article.`;
  }

  // ── Soumission eBay jamais partie, brouillon conservé (2026-08-14) ─────────
  // Message du parc : « Le clic « Mettre en vente » n'a produit AUCUNE requête
  // de publication (soumission jamais partie) : aucune annonce n'a été créée »
  // — plus la variante finale « … reprises sur onglet neuf n'ont rien changé,
  // job arrêté ». Exact sur la publication, faux sur le « rien » : sur les 5
  // jobs des 12-14/08 (8d1e0060, 15bfa00a, deb6ec33, 3e16aa00, b0885fb8), la
  // sonde réseau a capté la télémétrie eBay porteuse d'un draftId
  // (collectsysteminfo?draftId=…) — un BROUILLON existe côté eBay, récupérable
  // depuis l'espace vendeur, et l'utilisateur croyait repartir de zéro.
  // draftId lu depuis platform_fields.ebay_draft_id (consigné par l'extension
  // depuis le 14/08) ou, en repli pour le parc, extrait de last_diagnostic
  // (les URLs de télémétrie y sont). SANS draftId prouvé, on ne promet pas de
  // brouillon (rien que les données ne portent) : message d'origine conservé.
  // Réécriture à l'affichage (doctrine 2.4.52) ; aucune promesse de reprise.
  if (job?.platform === 'ebay' && /n'a produit AUCUNE requête de publication/i.test(raw)) {
    const diag = job?.platform_fields?.last_diagnostic;
    const draftId =
      String(job?.platform_fields?.ebay_draft_id ?? '').trim() ||
      (/[?&]draftId=(\d+)/i.exec(typeof diag === 'string' ? diag : JSON.stringify(diag ?? ''))?.[1] ?? '');
    if (draftId) {
      const termine = JOB_STATUS_TERMINAL.has(job?.status);
      return en
        ? `The "List item" click never left the browser on eBay: nothing was published${termine ? ' and the publication has stopped' : ''}. Your listing is not lost though: eBay kept it as a DRAFT (no. ${draftId}). Find it on eBay under My eBay > Selling > Drafts to finish listing it yourself.`
        : `Le clic « Mettre en vente » n'est jamais parti chez eBay : rien n'a été publié${termine ? ' et la publication est arrêtée' : ''}. Ton annonce n'est pas perdue pour autant : eBay l'a conservée en BROUILLON (n° ${draftId}). Retrouve-la sur eBay dans Mon eBay > Vendre > Brouillons pour terminer la mise en vente toi-même.`;
    }
  }

  // ── Familles rédigées pour l'utilisateur, masquées par le filtre (2026-08-14) ──
  // Inventaire 30 j (chantier messages masqués) : le plafond de 300 c. et les
  // marqueurs techniques masquaient précisément les messages les plus
  // travaillés — 74 jobs / 14 users remplacés par le générique. Correction par
  // FAMILLE NOMMÉE, même doctrine que CHALLENGE et les branches eBay : le
  // texte affiché est rédigé ICI, le brut ne passe jamais, et toute variante
  // hors des sous-cas listés retombe dans le circuit normal (générique par
  // défaut). Périmètre validé le 14/08 : republication stoppée avant
  // suppression + connexion requise « page observée ». Les autres familles
  // (refus Vinted, brouillon LBC, annulations support…) attendent validation.

  // Republication stoppée AVANT toute suppression : la phrase qui compte —
  // « ton annonce est intacte » — disparaissait à cause du détail technique
  // (HTTP 403/404/400). Gate sur TECH_ERR_MARKERS_RE : les variantes sans
  // marqueur (sonde injoignable, motif connexion) passent déjà telles quelles
  // aujourd'hui et gardent leur circuit. « L'unité est rendue » n'est
  // affirmé que là où le message source l'affirme (variantes « annulée »).
  if (/^Republication (annulée|en pause) avant toute suppression/i.test(raw)
      && TECH_ERR_MARKERS_RE.test(raw)) {
    if (/^Republication annulée/i.test(raw) && /session/i.test(raw) && /refusée/i.test(raw)) {
      return en
        ? `The relisting was cancelled before anything was deleted: your ${name} session was refused. Your listing is untouched. Sign in to ${name} again on your computer, then restart the relisting from the item.`
        : `Republication annulée avant toute suppression : ta session ${name} a été refusée. Ton annonce est intacte. Reconnecte-toi à ${name} sur ton ordinateur, puis relance la republication depuis la fiche de l'article.`;
    }
    if (/^Republication annulée/i.test(raw) && /introuvable/i.test(raw)) {
      return en
        ? `The relisting was cancelled before anything was deleted: the listing could not be found on ${name} (removed or sold in the meantime). FillSell deleted nothing. If the item is sold, mark it sold; otherwise check the listing on ${name}, then relaunch from the item if needed.`
        // (2026-09-11) 3 cas sur 6 en 30 j étaient des articles VENDUS : on
        // nomme d'abord ce geste-là, avant « vérifie sur Vinted ».
        : `Republication annulée avant toute suppression : l'annonce n'a pas été retrouvée en ligne sur ${name} (retirée ou vendue entre-temps). FillSell n'a rien supprimé. Si l'article est vendu, marque-le vendu ; sinon vérifie l'annonce sur ${name}, puis relance depuis la fiche de l'article si besoin.`;
    }
    if (/^Republication en pause/i.test(raw)) {
      // (2026-09-11) « corrige si besoin » ne nommait aucun geste : il n'y a
      // rien à corriger sur l'annonce, seulement relancer — et nous écrire si
      // ça se répète. On ne promet plus « intacte » (la feuille lit l'article).
      return en
        ? `Relisting paused before anything was deleted. ${name} did not respond as expected; relaunch the relisting from the item, and write to us if it happens again.`
        : `Republication mise en pause avant toute suppression. ${name} n'a pas répondu comme prévu ; relance la republication depuis la fiche de l'article, et écris-nous si ça se répète.`;
    }
    // Variante non répertoriée : circuit normal (générique par défaut).
  }

  // Connexion requise, variante « page observée » : l'URL relevée déclenchait
  // le masque technique et la consigne disparaissait (cas Carla, 14/08). Le
  // site est nommé en clair, l'URL brute n'est jamais affichée. La variante
  // courte sans « page observée » garde son circuit actuel (promesse retirée
  // ou tel quel).
  if (/^Connexion (Vinted|Leboncoin|Beebs|eBay) requise/i.test(raw) && /page observée/i.test(raw)) {
    const termine = JOB_STATUS_TERMINAL.has(job?.status);
    const acte = job?.action === 'republish' ? (en ? 'relisting' : 'republication') : 'publication';
    if (termine) {
      return en
        ? `${name} showed its sign-in page instead of the listing form: nothing was published and the ${acte} has stopped. Sign in to ${name} on your computer, then restart the ${acte} from the item.`
        : `${name} a affiché sa page de connexion à la place du formulaire de vente : rien n'a été publié et la ${acte} est arrêtée. Connecte-toi à ${name} sur ton ordinateur, puis relance la ${acte} depuis la fiche de l'article.`;
    }
    return en
      ? `${name} is showing its sign-in page instead of the listing form. Sign in to ${name} on your computer now — an automatic retry happens on its own, otherwise relaunch the ${acte} from the item.`
      : `${name} affiche sa page de connexion à la place du formulaire de vente. Connecte-toi à ${name} sur ton ordinateur maintenant — une tentative automatique a lieu toute seule, sinon relance la ${acte} depuis la fiche de l'article.`;
  }

  // Annulations posées à la main par le support (« Annulé par le support /
  // Annulé manuellement / Annulé le … ») : rédigées pour l'historique, elles
  // nommaient des personnes et des mécanismes internes — et les variantes
  // courtes (≤300 c.) s'affichaient TELLES QUELLES (fuite constatée le
  // 14/08). Branche UNIQUE, sans tri des variantes : tout message de ce
  // préfixe est réécrit en texte anonyme, le brut ne passe JAMAIS — une
  // variante imprévue tombe ici, pas dans le brut. « Annonce intacte » n'est
  // affirmé que si le message source l'affirme (même règle que la famille
  // republication ci-dessus). (Nettoyage unités 03/09 : plus aucune mention
  // de décompte, quelle que soit l'ère du message source.)
  if (/^Annulé (par le support|manuellement|le )/i.test(raw)) {
    const termine = JOB_STATUS_TERMINAL.has(job?.status);
    const intacte = /intacte|non touchée|pas été supprimé/i.test(raw);
    const republish = job?.action === 'republish';
    if (termine) {
      const relanceFr = republish
        ? "Si besoin, relance la republication depuis la fiche de l'article."
        : "Tu peux relancer la publication depuis l'app.";
      const relanceEn = republish
        ? 'If needed, relaunch the relisting from the item.'
        : 'You can relaunch the publication from the app.';
      return en
        ? `Our team cancelled this operation.${intacte ? ` Your listing is untouched on ${name}.` : ''} ${relanceEn}`
        : `Notre équipe a annulé cette opération.${intacte ? ` Ton annonce est intacte sur ${name}.` : ''} ${relanceFr}`;
    }
    return en
      ? `Our team paused this operation.${intacte ? ` Your listing is untouched on ${name}.` : ''} It can be relaunched from ${republish ? 'the item' : 'the app'}.`
      : `Notre équipe a mis cette opération en pause.${intacte ? ` Ton annonce est intacte sur ${name}.` : ''} Elle pourra être relancée depuis ${republish ? "la fiche de l'article" : "l'app"}.`;
  }

  // ── Compte vendeur eBay à mettre à niveau (2026-09-03) : le brut affichait
  // « Formulaire eBay non atteint (page actuelle: /fpa/upgrade) » — un chemin
  // technique pour dire qu'eBay redirige vers sa page de mise à niveau du
  // compte vendeur. Action utilisateur, pas un échec.
  if (job?.platform === 'ebay' && /\/fpa\/upgrade/i.test(raw)) {
    return en
      ? 'eBay asks you to upgrade your seller account before listing. Open eBay on your computer, follow the upgrade steps eBay shows, then restart the publication from the item.'
      : "eBay demande une mise à niveau de ton compte vendeur avant de pouvoir déposer une annonce. Ouvre eBay sur ton ordinateur, suis les étapes de mise à niveau qu'eBay affiche, puis relance la publication depuis la fiche de l'article.";
  }

  // Couleur hors palette (COULEUR INTROUVABLE : ..., vinted.js 2026-07-30) :
  // le détail embarque la palette relevée — l'utilisateur doit juste
  // corriger la couleur de l'article.
  if (/^COULEUR INTROUVABLE/i.test(raw)) {
    // (2026-09-11, job 0179dfda) Deux cas sous le même préfixe : la couleur
    // EXISTE chez Vinted et n'a pas pu être posée (notre côté — rien à corriger
    // sur l'article), ou elle est vraiment hors palette (geste utilisateur).
    if (/existe bien chez Vinted|n'a pas pu être posée/i.test(raw)) {
      return en
        ? `${name} offers this color but we could not set it on the form: the problem is on our side, nothing to fix on the item. Relaunch from the item; write to us if it happens again.`
        : `${name} propose bien cette couleur mais nous n'avons pas pu la poser sur le formulaire : le problème vient de notre côté, rien à corriger sur l'article. Relance depuis la fiche de l'article ; écris-nous si ça se reproduit.`;
    }
    return en
      ? `The item's color is not one ${name} offers. Pick a color from its palette on the item, then relaunch publishing.`
      : `La couleur de l'article n'est pas dans la palette de ${name}. Choisis une couleur de sa palette dans la fiche de l'article, puis relance la publication.`;
  }

  // Catégorie non posée (sélection en cascade échouée) : le diagnostic liste
  // options DOM et nœuds matchés — l'utilisateur n'en a pas l'usage.
  if (/^Catégorie\s*:/i.test(raw)) {
    return en
      ? `The listing category could not be set automatically on ${name}. Retry publishing from the item; the technical detail has been recorded.`
      : `La catégorie de l'annonce n'a pas pu être posée automatiquement sur ${name}. Relancer la publication depuis la fiche de l'article ; le détail technique est enregistré.`;
  }

  // ── Promesse de reprise automatique (RÉÉCRITE ICI depuis le 2026-08-13) ────
  // Beaucoup de messages d'échec rédigés côté extension se terminent par « le
  // job repartira (automatiquement) au prochain passage ». C'est FAUX dès que
  // le job est terminal : le poller ne reprend que 'pending' (et 'needs_user'
  // via la boucle de complétion) — un 'failed' n'est JAMAIS repris (constat du
  // 13/08 : jobs remis en 'pending' à la main). Le texte source vit dans
  // chrome-extension/, hors de portée d'un OTA : correction à l'affichage,
  // comme le CHALLENGE ci-dessus, selon le statut RÉEL. Sur un job encore
  // vivant (pending/processing/needs_user), la phrase est vraie : on la garde.
  // La demi-promesse « Relancer la publication » des messages needs_user n'est
  // pas concernée : elle demande un geste, elle n'en promet pas.
  // Entrée sur le MARQUEUR large + le STATUT (consigne 16/08) : toute variante
  // de la promesse est traitée dès que le job est terminal, même une tournure
  // jamais vue — au pire elle tombe sur le générique véridique ci-dessous.
  if (PROMESSE_MARQUEUR_RE.test(raw) && JOB_STATUS_TERMINAL.has(job?.status)) {
    // Un retrait (delete) ne se « relance » pas depuis la fiche : le geste
    // manuel est de retirer l'annonce sur la plateforme elle-même.
    const verite = job?.action === 'delete'
      ? (en
        ? ` The removal has stopped — it will not restart on its own. If the listing is still live, remove it yourself on ${name}.`
        : ` Le retrait est arrêté — il ne repartira pas tout seul. Si l'annonce est encore en ligne, retire-la toi-même sur ${name}.`)
      : (en
        ? ` It has stopped — it will not restart on its own. Relaunch it yourself from the item.`
        : ` C'est arrêté — rien ne repartira tout seul. Relance-la toi-même depuis la fiche de l'article.`);
    const corps = raw.replace(new RegExp(PROMESSE_REPRISE_RE.source, 'gi'), '')
      .replace(/\s{2,}/g, ' ').trim()
      // Ponctuation orpheline laissée par le retrait (« …resté ouvert), » ) :
      // on clôt la phrase proprement avant d'ajouter la vérité.
      .replace(/[\s,;:—–-]+$/, '');
    const msg = (corps && !/[.!?…]$/.test(corps) ? corps + '.' : corps) + verite;
    // Corps resté technique (dump, URL…) OU portant ENCORE un marqueur de
    // promesse (tournure que le retrait ancré n'a pas su localiser) :
    // générique VÉRIDIQUE plutôt que le diagnostic brut ou le mensonge —
    // même arbitrage que le repli tout en bas.
    if (!TECH_ERR_MARKERS_RE.test(msg) && !PROMESSE_MARQUEUR_RE.test(corps) && msg.length <= 600) return msg;
    if (job?.action === 'delete') {
      return en
        ? `Removing the listing on ${name} was interrupted by a technical issue. The removal has stopped — if the listing is still live, remove it yourself on ${name}; the full detail has been recorded for support.`
        : `Le retrait de l'annonce sur ${name} a été interrompu par un imprévu technique. Le retrait est arrêté — si l'annonce est encore en ligne, retire-la toi-même sur ${name} ; le détail complet est enregistré pour le support.`;
    }
    return en
      ? `Publishing on ${name} was interrupted by a technical issue. It has stopped — retry from the item; the full detail has been recorded for support.`
      : `La publication sur ${name} a été interrompue par un imprévu technique. Elle est arrêtée — relance-la depuis la fiche de l'article ; le détail complet est enregistré pour le support.`;
  }

  // ── Canal extension / onglet coupé (2026-09-17) ───────────────────────────
  // « Could not establish connection », « Receiving end does not exist », «
  // message channel closed », onglet de travail fermé/rechargé, timeouts de
  // chargement : de la prose Chrome, en anglais, SANS marqueur technique — elle
  // passait par le « message déjà humain » ci-dessous et s'affichait telle
  // quelle (fuite du 17/09). Le serveur requalifie déjà ces bruts au moment de
  // l'écriture (update-job-status) ; cette branche couvre l'affichage pour tout
  // brut qui arriverait encore par un autre chemin. Reprise seule (job vivant)
  // ou arrêt (terminal), jamais de « Chrome »/« onglet »/URL.
  if (/Could not establish connection|Receiving end does not exist|The message port closed|message channel closed|An asynchronous response|Onglet de travail ferm|onglet navigué\/rechargé|pas de réponse du content script|sonde injoignable/i.test(raw)) {
    return JOB_STATUS_TERMINAL.has(job?.status)
      ? (en
        ? 'The operation could not complete on your computer. Relaunch it from the item whenever you like.'
        : "L'opération n'a pas pu aboutir sur ton ordinateur. Relance-la depuis la fiche de l'article quand tu veux.")
      : (en
        ? 'The operation was interrupted on your computer. It resumes on its own, nothing to do on your side.'
        : "L'opération a été interrompue sur ton ordinateur. Elle reprend toute seule, rien à faire de ton côté.");
  }

  // ── eBay : PLUS AUCUN TEXTE TECHNIQUE À L'ÉCRAN (24/09, jocabroc8 80d0704f) ──
  // Les messages rédigés par ebay.js (« LIVE : aspect(s) obligatoire(s) eBay
  // vide(s) sur le formulaire : … — publication NON tentée … Détail du
  // remplissage : button.fake-link … ») et par le worker API (« REAUTH VENTE
  // eBay : », « eBay a refusé la fiche produit (400, 25002) : … ») vivent
  // dans l'extension ou le serveur, hors de portée d'un OTA : ils sont
  // réécrits ICI, famille par famille, en phrases de vendeur. Le brut reste en
  // base pour le support. Toute variante non reconnue retombe dans le circuit
  // commun ci-dessous (débruitage, sinon générique).
  const ebayTexte = job?.platform === 'ebay' ? texteEbayLisible(raw, job, en) : null;
  if (ebayTexte) return ebayTexte;

  // ── BEEBS : UNE VALEUR QUE BEEBS NE PROPOSE PAS N'EST PAS UNE PANNE (03/10) ──
  // Ceinture de nivake03 (8d487ebb) : « la fiche porte « L » mais la valeur
  // n'a pas pu être posée — panne de remplissage, PAS une donnée manquante
  // (relancer…) ». FAUX : Beebs n'offre, pour ses ceintures, que des longueurs
  // en mm et « Ajustable ». Le correctif de l'extension (0.6.89) ne
  // s'appliquait jamais (parenthèses non échappées, réparé en 0.6.90) : le
  // texte vrai est rédigé ICI pour tous les postes, et dit si l'annonce est
  // déjà retirée (étape 'deleted' d'une republication).
  const beebsTexte = job?.platform === 'beebs' ? texteBeebsValeurHorsListe(raw, job, en) : null;
  if (beebsTexte) return beebsTexte;

  // Message déjà humain (court, sans marqueur technique) : tel quel.
  if (!TECH_ERR_MARKERS_RE.test(raw) && raw.length <= 300) return raw;

  // ── DÉBRUITAGE plutôt que remplacement (2026-08-31) ────────────────────────
  // Le test ci-dessus est BINAIRE : un seul « HTTP 400 », ou 40 caractères de
  // trop, et tout le message part à la poubelle au profit d'un générique.
  // Mesuré sur le test du 31/08 (job publish Vinted, needs_user) — en base :
  //   « Vinted a REFUSÉ la publication (réponse serveur HTTP 400) : Merci
  //     d'entrer un numéro ISBN valide — l'annonce n'a PAS été créée. (Le
  //     formulaire est resté sur /items/new.) — Champs exigés par le serveur
  //     Vinted : ISBN (isbn). À faire : renseigne « ISBN » dans la copie
  //     Vinted de l'app, puis relance la publication. »
  //   affiché : « un imprévu technique […] enregistré pour le support ».
  // On a payé le diagnostic et on le jetait à l'affichage, sur un message
  // pourtant entièrement lisible : il nomme le champ ET le geste.
  // On RETIRE donc le bruit au lieu de jeter le sens — aucune reformulation,
  // aucun texte inventé, seulement des retraits :
  //   · l'annexe d'observabilité (destinée au support, pas au vendeur) ;
  //   · les incises techniques entre parenthèses (code HTTP, URL, chemin) ;
  //   · les mentions de code HTTP nues.
  // Si ce qui reste est propre, c'est CELA qu'on affiche. Sinon seulement, le
  // générique véridique du bas.
  {
    const nettoye = retirerParenthesesTechniques(
      raw
        // « Observabilité: … » et « Observabilite: … » jusqu'à la fin : c'est
        // explicitement l'annexe support (chemin de catégorie, interstitiel,
        // fragments de DOM).
        .replace(/\s*[—–-]?\s*Observabilit[ée]\s*:.*$/is, ''),
    )
      // Incises entre parenthèses techniques : retirées CI-DESSUS, groupe par
      // groupe, parenthèses imbriquées comprises (06/09).
      // Code HTTP nu (« réponse serveur HTTP 400 », « HTTP 400 »).
      .replace(/\s*(?:r[ée]ponse\s+serveur\s+)?HTTP\s*\/?\s*\d{3}\s*/gi, ' ')
      // URL nue (jamais à l'écran).
      .replace(/https?:\/\/\S+/g, '')
      // Préfixe de log interne « LIVE : » et marqueurs « [cause403] » (audit
      // messages, 2026-09-17) — jamais destinés au vendeur.
      .replace(/\bLIVE\s*:\s*/gi, '')
      .replace(/\s*\[cause[^\]]*\]/gi, '')
      .replace(/\s{2,}/g, ' ')
      // ⚠️ « : » VOLONTAIREMENT HORS de cette classe : en français l'espace
      // avant le deux-points est correct, et le retirer donnait
      // « Vinted a REFUSÉ la publication: … » — on nettoie du bruit, on
      // n'abîme pas la typographie du message.
      .replace(/\s+([.,;!?])/g, '$1')
      // Ponctuation orpheline laissée par les retraits.
      .replace(/\s*[—–-]\s*(?=[—–-])/g, ' ')
      .replace(/^[\s—–:-]+/, '')
      .trim();
    if (nettoye && !TECH_ERR_MARKERS_RE.test(nettoye) && nettoye.length <= 600) return nettoye;
    // Trop long mais lisible : RACCOURCI (constat + champ + geste), jamais
    // remplacé par le générique (Nico, 06/09).
    if (nettoye && !TECH_ERR_MARKERS_RE.test(nettoye)) return raccourcirMessageJob(nettoye, 300);
    // Encore un marqueur technique : on tente le raccourci sur les segments
    // sains seulement ; si rien de propre ne reste, générique.
    if (nettoye) {
      const propre = raccourcirMessageJob(nettoye, 300);
      if (propre && !TECH_ERR_MARKERS_RE.test(propre)) return propre;
    }
  }

  return en
    ? `Publishing on ${name} was interrupted by a technical issue. Retry from the item; the full detail has been recorded for support.`
    : `La publication sur ${name} a été interrompue par un imprévu technique. Relancer depuis la fiche de l'article ; le détail complet est enregistré pour le support.`;
}

// ── Erreur affichée BRUTE, mais jamais menteuse (2026-08-16) ─────────────────
// Pour les écrans qui montrent cross_post_jobs.error tel quel (modale de
// progression de republication) : tant que le job est vivant (pending,
// processing, needs_user), le texte passe inchangé — la promesse de reprise y
// est vraie. Sur un job TERMINAL porteur d'une promesse de reprise, on délègue
// à humanizeJobError, qui la retire et la remplace par la consigne de relance
// manuelle. La colonne en base reste intacte : filtrage à l'affichage seul.
export function jobErrorSansFaussePromesse(job, lang = 'fr') {
  // sansMentionMonnaie AVANT tout : les jobs vivants passent « bruts », mais
  // le brut du parc porte encore « Ta unité reste réservée… sous 72 h »
  // (cas josephinecerni, job df496c00 du 03/09) — la monnaie n'existe plus.
  const raw = etatsVintedLisibles(sansMentionMonnaie(String(job?.error ?? '').trim()), job?.platform, lang);
  if (!raw) return '';
  // (03/10, point 15 — geronimo0550) « Brut » ne veut jamais dire « technique » :
  // un texte qui porte un marqueur de journal ou de code (« LIVE : »,
  // chemin, route, dump…) ou une famille réécrite passe par LA porte commune.
  if (TECH_ERR_MARKERS_RE.test(raw) || /\bjobs?\b/i.test(raw) || texteSuiviLisible(raw, '', lang === 'en')
      || (job?.platform === 'ebay' && texteEbayLisible(raw, job, lang === 'en'))) {
    return humanizeJobError(job, lang);
  }
  if (!JOB_STATUS_TERMINAL.has(job?.status) || !PROMESSE_MARQUEUR_RE.test(raw)) {
    // (06/11, phase 3 point 1 — suite) Le brut d'un job vivant, lu en anglais quand l'app l'est ; français inchangé.
    // (07/11, point 1) Jamais « rien n'est vendu » sur une remise en vente (utils/rienVenduSurVente.js).
    // (18/11, lot T2 point 1) « Brut » ne veut jamais dire « du poste » pour un compte Cloud : la porte commune d'abord.
    const brut = texteTacheSelonVoie(job, raw, lang);
    return sansRienVenduSurVente(lang === 'en' ? traduireMessageServeur(brut, 'en') : brut, job);
  }
  return humanizeJobError(job, lang);
}

export const C = {
  primary:"#1D9E75",
  dark:"#0F6E56",
  soft:"#5DCAA5",
  muted:"#A3A9A6",
  bg:"#F5F6F5",
  teal:"#4ECDC4", tealLight:"#E8F5F0",
  peach:"#F9A26C",
  white:"#FFFFFF",
  text:"#0D0D0D", sub:"#6B7280", label:"#A3A9A6",
  border:"rgba(0,0,0,0.06)",
  red:"#E53E3E", redLight:"#FFF5F5",
  green:"#1D9E75", greenLight:"#E8F5F0",
  orange:"#F9A26C", orangeLight:"#FFF4EE",
  rowBg:"#F5F6F5", rowHover:"#EAEBEA",
};

export const VOICE_FREE_LIMIT = 5;

const CURRENCY_DATA=[
  {code:'EUR',sym:'€',loc:'fr-FR',dec:2,reg:'Europe',name:'Euro'},
  {code:'GBP',sym:'£',loc:'en-GB',dec:2,reg:'Europe',name:'Pound'},
  {code:'CHF',sym:'Fr',loc:'de-CH',dec:2,reg:'Europe',name:'Franc'},
  {code:'SEK',sym:'kr',loc:'sv-SE',dec:2,reg:'Europe',name:'Krona SE'},
  {code:'NOK',sym:'kr',loc:'nb-NO',dec:2,reg:'Europe',name:'Krone NO'},
  {code:'DKK',sym:'kr',loc:'da-DK',dec:2,reg:'Europe',name:'Krone DK'},
  {code:'PLN',sym:'zł',loc:'pl-PL',dec:2,reg:'Europe',name:'Złoty'},
  {code:'CZK',sym:'Kč',loc:'cs-CZ',dec:2,reg:'Europe',name:'Koruna'},
  {code:'HUF',sym:'Ft',loc:'hu-HU',dec:0,reg:'Europe',name:'Forint'},
  {code:'RON',sym:'lei',loc:'ro-RO',dec:2,reg:'Europe',name:'Leu RO'},
  {code:'HRK',sym:'kn',loc:'hr-HR',dec:2,reg:'Europe',name:'Kuna'},
  {code:'BGN',sym:'лв',loc:'bg-BG',dec:2,reg:'Europe',name:'Lev'},
  {code:'RSD',sym:'din',loc:'sr-RS',dec:0,reg:'Europe',name:'Dinar RS'},
  {code:'ISK',sym:'kr',loc:'is-IS',dec:0,reg:'Europe',name:'Króna'},
  {code:'ALL',sym:'L',loc:'sq-AL',dec:0,reg:'Europe',name:'Lek'},
  {code:'MKD',sym:'ден',loc:'mk-MK',dec:0,reg:'Europe',name:'Denar'},
  {code:'BAM',sym:'KM',loc:'bs-BA',dec:2,reg:'Europe',name:'Mark BA'},
  {code:'MDL',sym:'L',loc:'ro-MD',dec:2,reg:'Europe',name:'Leu MD'},
  {code:'UAH',sym:'₴',loc:'uk-UA',dec:2,reg:'Europe',name:'Hryvnia'},
  {code:'GEL',sym:'₾',loc:'ka-GE',dec:2,reg:'Europe',name:'Lari'},
  {code:'AMD',sym:'֏',loc:'hy-AM',dec:0,reg:'Europe',name:'Dram'},
  {code:'AZN',sym:'₼',loc:'az-AZ',dec:2,reg:'Europe',name:'Manat AZ'},
  {code:'BYN',sym:'Br',loc:'be-BY',dec:2,reg:'Europe',name:'Rouble BY'},
  {code:'RUB',sym:'₽',loc:'ru-RU',dec:2,reg:'Europe',name:'Rouble'},
  {code:'TRY',sym:'₺',loc:'tr-TR',dec:2,reg:'Europe',name:'Lira'},
  {code:'USD',sym:'$',loc:'en-US',dec:2,reg:'America',name:'Dollar'},
  {code:'CAD',sym:'CA$',loc:'en-CA',dec:2,reg:'America',name:'Dollar CA'},
  {code:'AUD',sym:'A$',loc:'en-AU',dec:2,reg:'America',name:'Dollar AU'},
  {code:'NZD',sym:'NZ$',loc:'en-NZ',dec:2,reg:'America',name:'Dollar NZ'},
  {code:'MXN',sym:'$',loc:'es-MX',dec:2,reg:'America',name:'Peso MX'},
  {code:'BRL',sym:'R$',loc:'pt-BR',dec:2,reg:'America',name:'Real'},
  {code:'ARS',sym:'$',loc:'es-AR',dec:2,reg:'America',name:'Peso AR'},
  {code:'CLP',sym:'$',loc:'es-CL',dec:0,reg:'America',name:'Peso CL'},
  {code:'COP',sym:'$',loc:'es-CO',dec:0,reg:'America',name:'Peso CO'},
  {code:'PEN',sym:'S/',loc:'es-PE',dec:2,reg:'America',name:'Sol'},
  {code:'UYU',sym:'$U',loc:'es-UY',dec:2,reg:'America',name:'Peso UY'},
  {code:'PYG',sym:'₲',loc:'es-PY',dec:0,reg:'America',name:'Guaraní'},
  {code:'BOB',sym:'Bs.',loc:'es-BO',dec:2,reg:'America',name:'Boliviano'},
  {code:'VES',sym:'Bs.S',loc:'es-VE',dec:2,reg:'America',name:'Bolívar'},
  {code:'GTQ',sym:'Q',loc:'es-GT',dec:2,reg:'America',name:'Quetzal'},
  {code:'HNL',sym:'L',loc:'es-HN',dec:2,reg:'America',name:'Lempira'},
  {code:'NIO',sym:'C$',loc:'es-NI',dec:2,reg:'America',name:'Córdoba'},
  {code:'CRC',sym:'₡',loc:'es-CR',dec:0,reg:'America',name:'Colón'},
  {code:'PAB',sym:'B/.',loc:'es-PA',dec:2,reg:'America',name:'Balboa'},
  {code:'DOP',sym:'RD$',loc:'es-DO',dec:2,reg:'America',name:'Peso DO'},
  {code:'CUP',sym:'$',loc:'es-CU',dec:2,reg:'America',name:'Peso CU'},
  {code:'JMD',sym:'J$',loc:'en-JM',dec:2,reg:'America',name:'Dollar JM'},
  {code:'TTD',sym:'TT$',loc:'en-TT',dec:2,reg:'America',name:'Dollar TT'},
  {code:'BBD',sym:'Bds$',loc:'en-BB',dec:2,reg:'America',name:'Dollar BB'},
  {code:'BSD',sym:'B$',loc:'en-BS',dec:2,reg:'America',name:'Dollar BS'},
  {code:'HTG',sym:'G',loc:'fr-HT',dec:2,reg:'America',name:'Gourde'},
  {code:'XCD',sym:'EC$',loc:'en-AG',dec:2,reg:'America',name:'Dollar EC'},
  {code:'ZAR',sym:'R',loc:'en-ZA',dec:2,reg:'Africa',name:'Rand'},
  {code:'NGN',sym:'₦',loc:'en-NG',dec:2,reg:'Africa',name:'Naira'},
  {code:'EGP',sym:'£',loc:'ar-EG',dec:2,reg:'Africa',name:'Livre EG'},
  {code:'MAD',sym:'DH',loc:'ar-MA',dec:2,reg:'Africa',name:'Dirham MA'},
  {code:'TND',sym:'DT',loc:'ar-TN',dec:3,reg:'Africa',name:'Dinar TN'},
  {code:'DZD',sym:'دج',loc:'ar-DZ',dec:2,reg:'Africa',name:'Dinar DZ'},
  {code:'KES',sym:'KSh',loc:'sw-KE',dec:2,reg:'Africa',name:'Shilling KE'},
  {code:'GHS',sym:'GH₵',loc:'en-GH',dec:2,reg:'Africa',name:'Cedi'},
  {code:'ETB',sym:'Br',loc:'am-ET',dec:2,reg:'Africa',name:'Birr'},
  {code:'TZS',sym:'TSh',loc:'sw-TZ',dec:0,reg:'Africa',name:'Shilling TZ'},
  {code:'UGX',sym:'USh',loc:'en-UG',dec:0,reg:'Africa',name:'Shilling UG'},
  {code:'RWF',sym:'RF',loc:'rw-RW',dec:0,reg:'Africa',name:'Franc RW'},
  {code:'BIF',sym:'Fr',loc:'fr-BI',dec:0,reg:'Africa',name:'Franc BI'},
  {code:'XOF',sym:'CFA',loc:'fr-SN',dec:0,reg:'Africa',name:'Franc XOF'},
  {code:'XAF',sym:'FCFA',loc:'fr-CM',dec:0,reg:'Africa',name:'Franc XAF'},
  {code:'MZN',sym:'MT',loc:'pt-MZ',dec:2,reg:'Africa',name:'Metical'},
  {code:'ZMW',sym:'ZK',loc:'en-ZM',dec:2,reg:'Africa',name:'Kwacha ZM'},
  {code:'MWK',sym:'MK',loc:'en-MW',dec:2,reg:'Africa',name:'Kwacha MW'},
  {code:'NAD',sym:'N$',loc:'en-NA',dec:2,reg:'Africa',name:'Dollar NA'},
  {code:'BWP',sym:'P',loc:'en-BW',dec:2,reg:'Africa',name:'Pula'},
  {code:'SCR',sym:'₨',loc:'en-SC',dec:2,reg:'Africa',name:'Roupie SC'},
  {code:'MUR',sym:'₨',loc:'en-MU',dec:2,reg:'Africa',name:'Roupie MU'},
  {code:'MGA',sym:'Ar',loc:'fr-MG',dec:0,reg:'Africa',name:'Ariary'},
  {code:'SDG',sym:'ج.س',loc:'ar-SD',dec:2,reg:'Africa',name:'Livre SD'},
  {code:'LYD',sym:'LD',loc:'ar-LY',dec:3,reg:'Africa',name:'Dinar LY'},
  {code:'GMD',sym:'D',loc:'en-GM',dec:2,reg:'Africa',name:'Dalasi'},
  {code:'SLE',sym:'Le',loc:'en-SL',dec:2,reg:'Africa',name:'Leone'},
  {code:'LRD',sym:'L$',loc:'en-LR',dec:2,reg:'Africa',name:'Dollar LR'},
  {code:'SOS',sym:'Sh',loc:'so-SO',dec:0,reg:'Africa',name:'Shilling SO'},
  {code:'DJF',sym:'Fr',loc:'fr-DJ',dec:0,reg:'Africa',name:'Franc DJ'},
  {code:'KMF',sym:'Fr',loc:'fr-KM',dec:0,reg:'Africa',name:'Franc KM'},
  {code:'STN',sym:'Db',loc:'pt-ST',dec:2,reg:'Africa',name:'Dobra'},
  {code:'CVE',sym:'Esc',loc:'pt-CV',dec:2,reg:'Africa',name:'Escudo'},
  {code:'MRU',sym:'UM',loc:'ar-MR',dec:2,reg:'Africa',name:'Ouguiya'},
  {code:'ERN',sym:'Nfk',loc:'ti-ER',dec:2,reg:'Africa',name:'Nakfa'},
  {code:'SSP',sym:'£',loc:'en-SS',dec:2,reg:'Africa',name:'Livre SS'},
  {code:'CDF',sym:'Fr',loc:'fr-CD',dec:2,reg:'Africa',name:'Franc CD'},
  {code:'SZL',sym:'L',loc:'en-SZ',dec:2,reg:'Africa',name:'Lilangeni'},
  {code:'LSL',sym:'L',loc:'en-LS',dec:2,reg:'Africa',name:'Loti'},
  {code:'JPY',sym:'¥',loc:'ja-JP',dec:0,reg:'Asia/Pacific',name:'Yen'},
  {code:'CNY',sym:'¥',loc:'zh-CN',dec:2,reg:'Asia/Pacific',name:'Yuan'},
  {code:'HKD',sym:'HK$',loc:'zh-HK',dec:2,reg:'Asia/Pacific',name:'Dollar HK'},
  {code:'TWD',sym:'NT$',loc:'zh-TW',dec:0,reg:'Asia/Pacific',name:'Dollar TW'},
  {code:'KRW',sym:'₩',loc:'ko-KR',dec:0,reg:'Asia/Pacific',name:'Won'},
  {code:'SGD',sym:'S$',loc:'en-SG',dec:2,reg:'Asia/Pacific',name:'Dollar SG'},
  {code:'MYR',sym:'RM',loc:'ms-MY',dec:2,reg:'Asia/Pacific',name:'Ringgit'},
  {code:'THB',sym:'฿',loc:'th-TH',dec:2,reg:'Asia/Pacific',name:'Baht'},
  {code:'IDR',sym:'Rp',loc:'id-ID',dec:0,reg:'Asia/Pacific',name:'Rupiah'},
  {code:'PHP',sym:'₱',loc:'fil-PH',dec:2,reg:'Asia/Pacific',name:'Peso PH'},
  {code:'VND',sym:'₫',loc:'vi-VN',dec:0,reg:'Asia/Pacific',name:'Dong'},
  {code:'INR',sym:'₹',loc:'hi-IN',dec:2,reg:'Asia/Pacific',name:'Roupie IN'},
  {code:'PKR',sym:'₨',loc:'ur-PK',dec:2,reg:'Asia/Pacific',name:'Roupie PK'},
  {code:'BDT',sym:'৳',loc:'bn-BD',dec:2,reg:'Asia/Pacific',name:'Taka'},
  {code:'LKR',sym:'₨',loc:'si-LK',dec:2,reg:'Asia/Pacific',name:'Roupie LK'},
  {code:'NPR',sym:'₨',loc:'ne-NP',dec:2,reg:'Asia/Pacific',name:'Roupie NP'},
  {code:'MMK',sym:'K',loc:'my-MM',dec:0,reg:'Asia/Pacific',name:'Kyat'},
  {code:'KHR',sym:'៛',loc:'km-KH',dec:0,reg:'Asia/Pacific',name:'Riel'},
  {code:'LAK',sym:'₭',loc:'lo-LA',dec:0,reg:'Asia/Pacific',name:'Kip'},
  {code:'MNT',sym:'₮',loc:'mn-MN',dec:0,reg:'Asia/Pacific',name:'Tögrög'},
  {code:'KZT',sym:'₸',loc:'kk-KZ',dec:2,reg:'Asia/Pacific',name:'Tenge'},
  {code:'UZS',sym:"so'm",loc:'uz-UZ',dec:0,reg:'Asia/Pacific',name:'Som UZ'},
  {code:'KGS',sym:'som',loc:'ky-KG',dec:2,reg:'Asia/Pacific',name:'Som KG'},
  {code:'TJS',sym:'SM',loc:'tg-TJ',dec:2,reg:'Asia/Pacific',name:'Somoni'},
  {code:'TMT',sym:'T',loc:'tk-TM',dec:2,reg:'Asia/Pacific',name:'Manat TM'},
  {code:'AFN',sym:'؋',loc:'ps-AF',dec:2,reg:'Asia/Pacific',name:'Afghani'},
  {code:'IQD',sym:'ع.د',loc:'ar-IQ',dec:0,reg:'Asia/Pacific',name:'Dinar IQ'},
  {code:'IRR',sym:'﷼',loc:'fa-IR',dec:0,reg:'Asia/Pacific',name:'Rial IR'},
  {code:'SAR',sym:'﷼',loc:'ar-SA',dec:2,reg:'Asia/Pacific',name:'Riyal SA'},
  {code:'AED',sym:'د.إ',loc:'ar-AE',dec:2,reg:'Asia/Pacific',name:'Dirham AE'},
  {code:'QAR',sym:'ر.ق',loc:'ar-QA',dec:2,reg:'Asia/Pacific',name:'Riyal QA'},
  {code:'KWD',sym:'KD',loc:'ar-KW',dec:3,reg:'Asia/Pacific',name:'Dinar KW'},
  {code:'BHD',sym:'BD',loc:'ar-BH',dec:3,reg:'Asia/Pacific',name:'Dinar BH'},
  {code:'OMR',sym:'ر.ع',loc:'ar-OM',dec:3,reg:'Asia/Pacific',name:'Rial OM'},
  {code:'JOD',sym:'JD',loc:'ar-JO',dec:3,reg:'Asia/Pacific',name:'Dinar JO'},
  {code:'LBP',sym:'ل.ل',loc:'ar-LB',dec:0,reg:'Asia/Pacific',name:'Livre LB'},
  {code:'SYP',sym:'£S',loc:'ar-SY',dec:0,reg:'Asia/Pacific',name:'Livre SY'},
  {code:'YER',sym:'﷼',loc:'ar-YE',dec:0,reg:'Asia/Pacific',name:'Rial YE'},
  {code:'ILS',sym:'₪',loc:'he-IL',dec:2,reg:'Asia/Pacific',name:'Shekel'},
];
export const CURRENCY_LOCALES = Object.fromEntries(CURRENCY_DATA.map(c=>[c.code,c.loc]));
export const CURRENCY_SYMBOLS = Object.fromEntries(CURRENCY_DATA.map(c=>[c.code,c.sym]));
export const CURRENCY_DECIMALS = Object.fromEntries(CURRENCY_DATA.map(c=>[c.code,c.dec]));

// (07/11, décision de Nico) `lang` : 'en' = format anglais (« €1,268.00 ») pour une devise au format français (EUR…),
// 'fr' = la locale de la devise, inchangée (« 1 268,00 € »). Absent : la langue de l'app (utils/langueApp.js), pour
// qu'aucun montant affiché en anglais ne reste au format français — l'appelant qui connaît `lang` le passe.
export function formatCurrency(amount, currency='EUR', decimals=null, lang=null) {
  const n = Math.round((amount||0)*100)/100;
  const dec = decimals!==null ? decimals : (CURRENCY_DECIMALS[currency]??2);
  try {
    return new Intl.NumberFormat(localeDuMontant(CURRENCY_LOCALES[currency], lang ?? langueDeLApp()),{style:'currency',currency,minimumFractionDigits:dec,maximumFractionDigits:dec}).format(n);
  } catch {
    const sym = CURRENCY_SYMBOLS[currency]||currency;
    return sym+' '+n.toFixed(dec);
  }
}

export const normalizeMarque = m => m?.trim() ? m.trim().toLowerCase().replace(/(^|\s|')(\S)/g,(_,sep,c)=>sep+c.toUpperCase()) : "Sans marque";
export const fmtp = n => (Math.round(n*10)/10).toFixed(1)+"%";

export const LOC_RE = /^(acheté[e]?\s+(?:à|en|au|aux)\s|bought\s+(?:in|at)\s)/i;
export function parseLocDesc(desc) {
  if (!desc) return { loc: null, rest: null };
  const parts = desc.split(/,\s*/).map(p => p.trim()).filter(Boolean);
  const loc = parts.filter(p => LOC_RE.test(p)).join(", ") || null;
  const rest = parts.filter(p => !LOC_RE.test(p)).join(", ") || null;
  return { loc, rest };
}

// (20/11, point 1 de Nico) detectType et l’icône d’objet vivent dans iconeObjet.js (code déplacé tel quel) :
// get-pending-jobs les importe de là sans tirer tout shared.js. Mêmes noms, mêmes fonctions pour l’app.
export { detectType, SUPPORT_NON_LIVRE_RE, LIVRE_EXPLICITE_RE, estSupportNonLivre, detectObjectIconKeyword, zonesObjetAccessoireTexte, zonesContenantBijoux, estContenantDeBijoux, familleDuCasque, detectObjectKeywordDetail, titreNommeUneDecorationMurale, detectObjectIcon, ALL_OBJECT_ICONS } from './iconeObjet.js';

export function getTypeStyle(type){
  const s={
    'Mode':          {bg:'#FDF2F8',color:'#9D174D',border:'#F9A8D4',emoji:'👗'},
    'High-Tech':     {bg:'#EFF6FF',color:'#1D4ED8',border:'#93C5FD',emoji:'📱'},
    'Maison':        {bg:'#F0FDF4',color:'#166534',border:'#86EFAC',emoji:'🏠'},
    'Jouets':        {bg:'#FFFBEB',color:'#92400E',border:'#FCD34D',emoji:'🧸'},
    'Livres':        {bg:'#FFF7ED',color:'#9A3412',border:'#FDBA74',emoji:'📚'},
    'Sport':         {bg:'#F0F9FF',color:'#0C4A6E',border:'#7DD3FC',emoji:'⚽'},
    'Auto-Moto':     {bg:'#F8FAFC',color:'#334155',border:'#94A3B8',emoji:'🚗'},
    'Beauté':        {bg:'#FFF1F2',color:'#9F1239',border:'#FDA4AF',emoji:'💄'},
    'Musique':       {bg:'#F5F3FF',color:'#5B21B6',border:'#C4B5FD',emoji:'🎵'},
    'Collection':    {bg:'#FEFCE8',color:'#854D0E',border:'#FDE047',emoji:'🏆'},
    'Électroménager':{bg:'#ECFDF5',color:'#065F46',border:'#6EE7B7',emoji:'⚡'},
    'Luxe':          {bg:'#FDF8F0',color:'#92400E',border:'#F59E0B',emoji:'💎'},
    'Multimédia':    {bg:'#F3E8FF',color:'#6B21A8',border:'#D8B4FE',emoji:'📺'},
    'Jardin':        {bg:'#ECFDF5',color:'#14532D',border:'#4ADE80',emoji:'🌿'},
    'Bricolage':     {bg:'#FFF7ED',color:'#C2410C',border:'#FB923C',emoji:'🔧'},
    'Autre':         {bg:'#F9FAFB',color:'#6B7280',border:'#D1D5DB',emoji:'📦'},
  };
  if(s[type]) return s[type];
  const key=Object.keys(s).find(k=>k.toLowerCase()===(type||"").toLowerCase());
  return key?s[key]:s['Autre'];
}

export const getMargeColor = pct => pct>=40?"#1D9E75":pct>=20?"#5DCAA5":pct>=5?"#F9A26C":"#E53E3E";
export const getCatBorder = type => getTypeStyle(type).border;

// ── Design 2026 (Lens / navbar) : tuiles de catégorie ──
// Pastels désaturés dans l'esprit canvas #EDEAE0 / paper #F6F5F1.
// Une couleur par catégorie — deux articles de même catégorie = même tuile.
export const CAT_TILE_COLORS = {
  'Mode':           '#FBEAE2',
  'Luxe':           '#F5EBD7',
  'High-Tech':      '#E5E9F3',
  'Maison':         '#E6EFEA',
  'Électroménager': '#E3F0F0',
  'Jouets':         '#FAF0D7',
  'Livres':         '#F0E8DB',
  'Sport':          '#E2EEF6',
  'Auto-Moto':      '#E9E9E3',
  'Beauté':         '#EFE6F0',
  'Musique':        '#EAE5F2',
  'Collection':     '#F6E9DE',
  'Jardin':         '#E7F0E2',
  'Bricolage':      '#F1E9DD',
  'Multimédia':     '#E8E4EE',
  'Autre':          '#ECEBE6',
};
export function getCatTileColor(type){
  if(CAT_TILE_COLORS[type]) return CAT_TILE_COLORS[type];
  const key=Object.keys(CAT_TILE_COLORS).find(k=>k.toLowerCase()===(type||"").toLowerCase());
  return key?CAT_TILE_COLORS[key]:CAT_TILE_COLORS['Autre'];
}
// Slug CSS de la catégorie (classe .cat-mode, .cat-hightech, .cat-electromenager...)
export const catClass = type => 'cat-'+((type||'autre').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9]/g,''));

// LÉGENDE des icônes objet — sens en clair de CHAQUE emoji (2026-07-21).
// Pourquoi : quand une source EXTERNE classe un article en choisissant une
// icône (le category_icon renvoyé par le micro-appel Haiku de generate-listing),
// elle ne reçoit qu'une liste d'emojis nus. Or beaucoup d'emojis sont des proxys
// contre-intuitifs : 🧶 (pelote de laine) = pull/sweat/HOODIE, 🥼 (blouse de
// labo) = blazer, 🪢 (nœud) = ceinture… Un « hoodie Patagonia » partait alors en
// 🧥 (manteau) → catégorie eBay « Manteaux, vestes » et Vinted « Doudounes »
// (bug réel 2026-07-21). On fournit donc le SENS de chaque icône au classifieur.
// Invariant : toute icône d'ALL_OBJECT_ICONS DEVRAIT avoir une entrée ici ; une
// icône sans légende reste utilisable (le prompt retombe sur l'emoji seul), mais
// perd la désambiguïsation — à compléter si on ajoute une icône.
export const ICON_LEGEND = {
  // Vêtements — le cœur des confusions (l'ordre de résolution compte aussi)
  "🧥": "manteau, veste, blouson, parka, doudoune, polaire, combinaison de ski",
  "🧶": "pull, sweat, sweat à capuche (hoodie), cardigan, gilet en maille",
  "🥼": "blazer, veste de tailleur",
  "🤵": "costume, smoking",
  "👔": "chemise, blouse",
  "👕": "t-shirt, débardeur, polo, maillot de sport",
  "👗": "robe, jupe",
  "🩳": "short, bermuda",
  "👖": "pantalon, jean, jogging, legging, chino, salopette, survêtement",
  "🩲": "sous-vêtements, lingerie, pyjama",
  "🧦": "chaussettes, collants",
  "🧣": "écharpe, foulard, châle",
  "🧤": "gants, moufles, mitaines",
  "🧢": "casquette, chapeau, bonnet, béret",
  "👙": "maillot de bain, bikini",
  "🎭": "déguisement, panoplie, costume de déguisement",
  // Chaussures
  "👟": "baskets, sneakers, chaussures de ville",
  "👢": "bottes, bottines",
  "👠": "chaussures à talons, escarpins, ballerines",
  "🩴": "sandales, tongs, claquettes, mules",
  "🥿": "chaussons, pantoufles",
  // Sacs & accessoires
  "👜": "sac à main, sac, pochette, cabas, besace",
  "🎒": "sac à dos, cartable",
  "🎽": "sac de sport",
  "👝": "sac banane, pochette de ceinture",
  "👛": "portefeuille, porte-monnaie, porte-cartes",
  "🧳": "valise, bagage",
  "⌚": "montre à aiguilles (analogique, mécanique)",
  "⏱️": "montre connectée, smartwatch",
  "🕶️": "lunettes de soleil ou de vue",
  "💍": "bijou : collier, bracelet, bague, boucles d'oreilles, pendentif",
  "🪢": "ceinture",
  "☂️": "parapluie, ombrelle",
  "🗝️": "porte-clés",
  "🎀": "cravate, nœud papillon",
  // High-Tech
  "📱": "smartphone, téléphone portable",
  "📲": "tablette (iPad, Galaxy Tab)",
  "💻": "ordinateur portable (MacBook, laptop)",
  "🖥️": "ordinateur fixe, écran, composant PC (carte graphique, CPU, RAM)",
  "⌨️": "clavier d'ordinateur",
  "🖱️": "souris d'ordinateur",
  "🎧": "écouteurs, casque audio, AirPods",
  "🔊": "enceinte, haut-parleur, barre de son",
  "📡": "enceinte connectée, assistant vocal (Alexa, Google Home)",
  "🎮": "console de jeu, manette (PlayStation, Xbox, Nintendo Switch)",
  "📷": "appareil photo, caméra, objectif, GoPro",
  "🛸": "drone",
  "🖨️": "imprimante, scanner",
  "📺": "téléviseur, vidéoprojecteur",
  "📇": "liseuse (Kindle, Kobo)",
  "🔌": "chargeur, câble, batterie externe, adaptateur",
  // Électroménager & maison-cuisine
  "🧺": "gros lavage : machine à laver, lave-vaisselle, sèche-linge",
  "☕": "machine à café, cafetière",
  "🫖": "bouilloire, théière",
  "🧹": "aspirateur, nettoyeur vapeur",
  "🧊": "réfrigérateur, congélateur",
  "♨️": "four, micro-ondes",
  "🥣": "mixeur, blender, robot pâtissier",
  "🍞": "grille-pain",
  "🍟": "friteuse, airfryer",
  "💇": "sèche-cheveux, lisseur, boucleur, brosse soufflante",
  "🌀": "ventilateur, climatiseur, purificateur d'air",
  "🌡️": "radiateur, chauffage d'appoint",
  "🧼": "fer à repasser, défroisseur, centrale vapeur",
  "🧵": "machine à coudre, surjeteuse",
  // Maison / déco
  "🛋️": "canapé, fauteuil, meuble TV",
  "🪑": "chaise, tabouret, banc",
  "🛏️": "lit, matelas, sommier",
  "🛌": "linge de lit (housse de couette, drap, parure)",
  "💡": "lampe, luminaire, ampoule, guirlande lumineuse",
  "🪞": "miroir",
  "🕯️": "bougie, photophore",
  "🖼️": "cadre, tableau, poster, affiche, gravure, huile sur toile, buste, statue, sculpture, santon",
  "🪴": "plante, cache-pot, jardinière",
  "🏺": "vase",
  "🍽️": "vaisselle : assiette, bol, tasse, verre, mug",
  "🍳": "ustensile de cuisson : casserole, poêle, cocotte",
  "🪟": "rideau, voilage, store",
  "🪶": "coussin, plaid, jeté de canapé",
  "🟫": "tapis (décoration)",
  "📜": "nappe, linge de table",
  "🕰️": "horloge, pendule, réveil",
  "🎄": "décoration de Noël",
  "🖋️": "papeterie : stylo, carnet, calculatrice, agenda",
  // Bricolage / jardin
  "🪛": "perceuse, visseuse, tournevis",
  "🪚": "scie, tronçonneuse",
  "🔨": "marteau, maillet, masse",
  "🪜": "échelle, escabeau",
  "🖌️": "peinture, rouleau, pinceau de bricolage",
  "🔩": "visserie : vis, boulon, cheville, clou",
  "📏": "mètre ruban, niveau",
  "🔧": "outil à main : clé, pince, étau",
  "🌱": "tondeuse, débroussailleuse, scarificateur",
  "✂️": "taille-haie, sécateur, cisaille",
  "🔥": "barbecue, plancha",
  "⛱️": "salon de jardin, parasol, transat",
  // Sport & loisirs
  "🏀": "ballon de basket",
  "🏃": "cardio : tapis de course, vélo d'appartement, rameur",
  "🏋️": "musculation : haltères, kettlebell, banc",
  "🤿": "matériel de plongée : masque, tuba, palmes",
  "🏄": "glisse nautique : paddle, kayak, kitesurf, wakeboard",
  "🐴": "équitation",
  "🎱": "billard, pétanque, fléchettes, bowling",
  "🚲": "vélo, VTT, bicyclette",
  "🛹": "skate, longboard",
  "⛸️": "roller, patins",
  "🎿": "ski, snowboard",
  "⚽": "ballon, football",
  "🎾": "raquette : tennis, badminton, squash",
  "⛳": "golf",
  "🥊": "boxe, MMA",
  "⛺": "tente, camping, sac de couchage",
  "🎣": "pêche, moulinet",
  "🧘": "yoga, pilates",
  "🥽": "lunettes de natation",
  "⛑️": "casque de vélo ou de ski",
  "🪖": "casque de moto",
  "🛴": "trottinette, hoverboard, gyroroue",
  // Auto-moto
  "🏍️": "moto",
  "🛵": "scooter",
  "🛞": "pneu, jante, roue",
  "🚗": "voiture, pièce ou accessoire auto (autoradio, pare-choc)",
  "🏎️": "voiture miniature (Hot Wheels, Majorette)",
  "🚁": "objet télécommandé, voiture RC",
  // Beauté
  "🌸": "parfum, eau de toilette, cologne",
  "💄": "maquillage : rouge à lèvres, mascara, fond de teint, palette",
  "💅": "vernis, manucure",
  "🧴": "soin : crème, sérum, shampooing, gel douche, savon",
  "🪒": "rasoir, tondeuse à barbe, épilateur",
  // Musique
  "🎸": "guitare, ukulélé",
  "🎻": "violon, violoncelle, contrebasse",
  "🥁": "batterie (instrument de musique)",
  "🎺": "trompette, saxophone, clarinette, flûte",
  "🎹": "clavier, piano, synthétiseur",
  "🎼": "harmonica",
  "🎤": "microphone",
  "💿": "vinyle, platine",
  "📀": "DVD, Blu-ray, VHS",
  "💽": "CD, cassette audio",
  // Jouets / enfance
  "🧸": "peluche, doudou",
  "🧱": "briques de construction (Lego, Duplo, Kapla)",
  "🪆": "poupée, Barbie, poupon",
  "🧩": "puzzle",
  "🦸": "figurine, objet de collection (Funko, Playmobil)",
  "🃏": "cartes à collectionner (Pokémon, Magic, Yu-Gi-Oh)",
  "🎲": "jeu de société",
  "👶": "poussette, landau",
  "💺": "siège auto",
  "🍼": "biberon",
  "📟": "babyphone, écoute-bébé",
  "🚼": "puériculture chambre : lit parapluie, table à langer, berceau",
  "🐕": "accessoire pour animal : collier, gamelle, litière, laisse",
  // Livres & collection & divers
  "📖": "manga, BD, comics",
  "📚": "livre, roman, dictionnaire",
  "📰": "magazine, revue",
  "📮": "timbre de collection",
  "🪙": "pièce de monnaie (numismatique)",
  // Défauts de catégorie (aucun mot-objet précis)
  "💎": "article de luxe (défaut, aucun objet précis)",
  "🏠": "article pour la maison (défaut)",
  "⚡": "appareil électroménager (défaut)",
  "🎵": "article de musique (défaut)",
  "🏆": "objet de collection (défaut)",
  "🌿": "article de jardin (défaut)",
  "📦": "objet divers, non catégorisable",
};

// ── Design 2026 (Lens / navbar) : CSS des cards de liste (maquette validée).
// Partagé entre StockTab (.stock-v2) et VentesTab (.ventes-v2) — même tokens,
// même structure row [tuile | infos | droite], mêmes filtres à pastilles.
export function buildCardCss(scope){
  const s='.'+scope;
  return `
${s}{
  --canvas:#EDEAE0;
  --paper:#F6F5F1;
  --ink:#10201B;
  --teal:#2F9E90;
  --teal-deep:#1B6E62;
  --amber:#E8956D;
  --mute:#8A8578;
  --border:#E7E3D8;
  font-family:'Space Grotesk',sans-serif;
}
${s} .row{
  background:#fff;border-radius:16px;
  padding:11px 12px;border:1px solid var(--border);
  display:grid;grid-template-columns:auto 1fr auto;gap:10px;align-items:center;
  position:relative;
}
${s} .row.in-swipe{padding:0;border:none;border-radius:0;background:transparent;flex:1;min-width:0;cursor:pointer;}
/* .edit-affordance (icône crayon) supprimée le 2026-07-14 : la carte entière est
   cliquable pour éditer, l'icône était redondante et se collait au prix. */
${s} .cat-tile{width:38px;height:38px;border-radius:11px;display:flex;align-items:center;justify-content:center;font-size:17px;flex-shrink:0;}
${Object.entries(CAT_TILE_COLORS).map(([type,color])=>`${s} .${catClass(type)}{background:${color};}`).join('\n')}
${s} .left{min-width:0;}
${s} .title-line{display:flex;align-items:center;gap:6px;}
/* TITRE : UNE ligne, police et taille d'origine (14.5px/700), tronque a la
   fin. La marque, elle, vit sous le titre (ligne meta) et reste toujours
   visible : c'est ce qui a ete gardé du chantier du 2026-08-05.
   ⛔ NE PAS repasser a 2 ou 3 lignes. Essaye ce jour-la pour rendre lisible
   la FIN du titre (elle distingue 15 articles de la meme marque) : a 390 px,
   un titre reel occupait 3 a 4 lignes et ecrasait le reste de la carte.
   Nico a tranche apres l'avoir vu sur iPhone. La lisibilite de ces articles
   sera reprise dans le design de l'extension, pas en grossissant le titre.
   ⚠️ Ce bloc a deja ete casse une fois : une fermeture de commentaire posee
   AU MILIEU du texte le fermait trop tot, le reste devenait du CSS invalide
   et le parseur AVALAIT la regle .title qui suit — le titre se retrouvait
   sans style du tout (d ou les 4 lignes constatees sur iPhone). Une seule
   fin de commentaire, et une seule, tout a la fin de ce bloc. */
${s} .title{font-weight:700;font-size:14.5px;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1 1 auto;min-width:0;}
${s} .brand-dot{width:3px;height:3px;border-radius:50%;background:var(--mute);opacity:.7;flex-shrink:0;}
${s} .brandname{font-size:12px;color:var(--mute);white-space:nowrap;flex:0 0 auto;}
${s} .qty-badge{font-size:11px;font-weight:700;color:var(--teal-deep);flex-shrink:0;}
/* La meta RETOURNE À LA LIGNE (2026-08-05) : elle porte désormais la marque,
   toujours affichée, et le nowrap la coupait — « Picture Organic Clothing ·
   catégorie … ». Couper la marque pour tenir sur une ligne, c'est exactement
   l'information que Nico a demandé de ne plus perdre.

   MAIS bornée à DEUX LIGNES, hauteur RÉSERVÉE (2026-08-05, Nico sur iPhone) :
   la meta porte la description générée, longue de 5 à 7 lignes sur un article
   réel (« Montre G-Shock … pas de défaut apparent visible »). Sans borne, une
   carte faisait le double de la voisine et la liste devenait illisible au
   défilement. On assume de ne PAS voir la description en entier — elle est
   lisible au tap (édition).
   Le couple line-clamp + min-height est indissociable : le clamp seul
   n'égalise rien (une meta d'une ligne reste 15 px plus courte), le
   min-height seul ne coupe rien. Les deux, et le bloc de gauche a une
   hauteur CONSTANTE, quel que soit le texte.
   ⛔ Ne pas remettre overflow:visible ni retirer le -webkit-box : c'est le
   seul mécanisme qui tronque sur plusieurs lignes avec des points de
   suspension (aucun équivalent en text-overflow, qui est mono-ligne). */
${s} .meta{font-size:11.5px;color:var(--mute);margin-top:3px;white-space:normal;overflow-wrap:anywhere;line-height:1.35;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;line-clamp:2;overflow:hidden;min-height:2.7em;}
${s} .meta .hl{color:var(--ink);}
/* ⚠️⚠️ AUCUN BACKTICK DANS CE FICHIER — tout ce CSS est un template literal JS.
   Un backtick posé ici (j'avais écrit .left entre backticks, à la mode Markdown)
   TERMINE la chaîne : buildCardCss se casse en plein milieu et l'app entière
   part en écran blanc (« .left is not a function »). Et vite build ne le voit
   PAS : le fichier reste syntaxiquement valide, il ne veut simplement plus rien
   dire. Citer un sélecteur ? Guillemets français, jamais de backtick.

   flex-wrap OBLIGATOIRE (2026-07-13). Sans lui, la rangée de pastilles ne
   pouvait PAS passer à la ligne : chaque pastille a un contenu de largeur
   irréductible (min-width auto), donc au-delà de 3-4 pastilles la rangée
   débordait de la colonne de gauche et venait passer SOUS les boutons de la
   colonne de droite — c'est le chevauchement « En ligne » / « Republier ».
   La 5e pastille (« En ligne ») n'a fait que révéler le défaut, elle ne l'a pas
   créé : 4 plateformes suffisaient déjà à serrer la carte sur mobile. */
${s} .icons{display:flex;flex-wrap:wrap;align-items:center;gap:4px;margin-top:6px;min-width:0;}
/* max-width + ellipsis : filet de sécurité. .micon est nowrap et flex:0 0 auto,
   donc un libellé trop long prenait une largeur IRRÉDUCTIBLE et sortait de la
   carte par la droite, par-dessus les boutons. Une pastille reste courte par
   contrat (les phrases vont dans .cardnote ou dans une feuille) ; si l'une
   déborde quand même, elle se coupe proprement au lieu de casser la carte.
   ⚠️ AUDIT 07/08 : ce filet N'A JAMAIS FONCTIONNÉ tant que .micon était
   display:flex — text-overflow:ellipsis est INOPÉRANT sur un conteneur flex,
   et justify-content:center rognait le contenu PAR LES DEUX BOUTS, sans
   ellipse (« nonce Vinted · 2 » constaté : ni le début du libellé, ni le
   prix). Le correctif : .micon redevient un bloc à contenu INLINE
   (inline-block + line-height) — l'ellipse s'applique, la coupe se fait en
   FIN de texte (le libellé survit, « Annonce Vi… »). Dans la rangée .icons
   (flex), le display est blockifié : le comportement de flex ITEM est
   inchangé, seul le rendu INTERNE change. Les points (.dot/.pulse) passent
   en inline-block alignés (le gap flex ne s'applique plus). */
${s} .micon{height:19px;line-height:19px;padding:0 6px;border-radius:6px;display:inline-block;text-align:left;font-size:10px;color:#fff;font-weight:700;flex:0 0 auto;white-space:nowrap;max-width:100%;overflow:hidden;text-overflow:ellipsis;}
/* Point qui respire : une republication en cours doit se VOIR vivante sur la
   carte, sans y installer un spinner (le détail animé vit dans la feuille). */
${s} .micon .pulse{display:inline-block;vertical-align:middle;margin:0 3px 2px 0;width:5px;height:5px;border-radius:50%;background:currentColor;animation:fs-pulse 1.4s ease-in-out infinite;}
@keyframes fs-pulse{0%,100%{opacity:.25;}50%{opacity:1;}}
@media (prefers-reduced-motion:reduce){${s} .micon .pulse{animation:none;opacity:.7;}}
${s} .ic-vinted{background:#09B584;}
${s} .ic-leboncoin{background:#EA5B0C;}
${s} .ic-beebs{background:#FF6B35;}
${s} .ic-ebay{background:#0064D2;}
${s} .ic-plateforme{background:var(--teal-deep);}
${s} .ic-pending{background:var(--amber);}
${s} .ic-loc{background:var(--mute);}
/* « Plus en ligne » — l'annonce Vinted n'a pas été retrouvée à la dernière
   sync. Ambre du design system (var(--amber)), la même famille que ic-pending :
   un état qui appelle l'attention sans être une erreur. Encre foncée dessus
   plutôt que blanc, l'ambre étant trop clair pour du #fff (contraste). */
${s} .ic-gone{background:var(--amber);color:var(--ink);}
/* Prix DEMANDÉ sur l'annonce en ligne — l'info la plus regardée de la carte.
   Elle portait le teal de .ic-plateforme, donc exactement la couleur du statut
   « En ligne » ET du bouton « Publier » : trois choses différentes, un seul
   vert, le prix se noyait dans du statut. Traitement à l'ENCRE (aucune teinte
   nouvelle : var(--ink) sur var(--paper), déjà au design system) — c'est la
   seule pastille sombre de la rangée, donc la première lue, et elle ne peut
   plus être confondue avec un état. Contraste #F6F5F1 sur #10201B ≈ 16:1. */
${s} .ic-price{background:var(--ink);color:var(--paper);}
/* Note pleine largeur SOUS les deux colonnes (2026-08-05). Une phrase entière
   ne peut pas vivre dans .icons : .micon est nowrap + flex:0 0 auto, donc un
   message long prend une largeur IRRÉDUCTIBLE, sort de la colonne de gauche et
   passe par-dessus les boutons de droite (constaté sur iPhone : texte coupé au
   bord de l'écran). Ici : enfant direct de la grille, sur toutes les colonnes,
   et le texte RETOURNE À LA LIGNE. */
${s} .cardnote{grid-column:1/-1;margin-top:8px;padding:8px 10px;border-radius:10px;font-size:11.5px;font-weight:600;line-height:1.45;white-space:normal;overflow-wrap:anywhere;display:flex;align-items:flex-start;gap:7px;}
${s} .cardnote.is-info{background:#F0FDFB;border:1px solid rgba(13,148,136,0.25);color:var(--teal-deep);}
${s} .cardnote.is-warn{background:#FFF7ED;border:1px solid #FED7AA;color:#9A3412;}
/* « En ligne » : un STATUT, pas une plateforme. Il ouvre la rangée, et se
   distingue par sa FORME (chip clair cerclé de teal + point) plutôt que par une
   6e couleur pleine : cinq aplats saturés côte à côte rendaient la carte
   illisible. Teal du design system (pas de nouvelle teinte), poids 700 max.
   ⚠️ white-space:nowrap est porté par .micon : sans lui, « En ligne » se cassait
   en « En » / « ligne » quand la place manquait (constaté sur la 1re carte). */
${s} .ic-online{background:rgba(47,158,144,.12);color:var(--teal-deep);box-shadow:inset 0 0 0 1px rgba(47,158,144,.40);}
${s} .ic-online .dot{display:inline-block;vertical-align:middle;margin:0 3px 2px 0;width:5px;height:5px;border-radius:50%;background:var(--teal);}
/* Plateformes : LOGOS et non plus noms écrits. « Leboncoin » + « Beebs » en toutes
   lettres débordaient la carte en largeur mobile quel que soit le CSS — quatre
   logos de 18 px tiennent dans la place d'un seul nom. Aucun socle ni cadre ici :
   PlatformLogo fournit déjà l'icône carrée (socle blanc pour vinted/ebay, icône
   d'app pleine pour beebs/leboncoin). */
${s} .plogo{display:flex;align-items:center;flex:0 0 auto;line-height:0;}
${s} .right{text-align:right;display:flex;flex-direction:column;align-items:flex-end;gap:5px;}
${s} .price{font-weight:700;font-size:13px;color:var(--ink);margin-bottom:1px;}
${s} .price .lbl{font-weight:500;font-size:9px;color:var(--mute);display:block;text-align:right;}
/* 92px et non 78 (2026-08-05) — MESURÉ, pas estimé. La pastille de cooldown de
   republication « 🔁 Dans ~24 h » se cassait en deux lignes et la carte
   grandissait avec. Largeurs relevées en Space Grotesk 600/11px sur la vraie
   page, pour 76px de place utile (78 − 2 de bordures) :
       « 🔁 Dans ~14 h » 75,2  ✅      « 🔁 Dans ~20 h » 77,0  ❌
       « 🔁 Dans ~17 h » 74,3  ✅      « 🔁 Dans ~24 h » 76,6  ❌
   Exactement le partage décrit : 14 et 17 tenaient, 20 et 24 non. Le cas le
   plus long fait 77,0px en chiffres tabulaires ; 92 − 2 de bordures − 8 de
   padding = 82px utiles, soit 5px de marge. La colonne d'actions prend ces
   14px sur le titre (grid auto/1fr/auto), jamais sur la hauteur. */
${s} .btn-stack{display:flex;flex-direction:column;gap:4px;width:92px;}
${s} .btn-publier{font-size:11.5px;font-weight:700;color:#fff;text-align:center;background:linear-gradient(155deg,var(--teal),var(--teal-deep));padding:6px 0;border-radius:9px;border:none;cursor:pointer;font-family:inherit;}
/* 4 plateformes sur 4 en ligne : il n'y a PLUS RIEN à publier. Bouton inerte
   (disabled côté handler aussi), ton neutre — c'est un état, pas une action.
   Tant qu'il reste une plateforme libre, le bouton garde son aplat plein :
   « Publier » y est une vraie action (les manquantes), pas une republication. */
${s} .btn-publier.is-complete{background:#F1F1EE;color:var(--mute);border:1px solid var(--border);font-weight:600;font-size:10px;padding:5px 0;cursor:default;}
${s} .btn-vendre{font-size:11px;font-weight:600;color:var(--mute);text-align:center;background:transparent;border:1px solid var(--border);padding:5px 4px;border-radius:9px;cursor:pointer;font-family:inherit;}
/* Pastille de cooldown de republication — « 🔁 Dans ~N h ». Classe DÉDIÉE,
   posée en plus de .btn-vendre : nowrap ne doit surtout PAS être global à
   .btn-vendre, car le libellé prixé « Republier (1 ‹icône unité›) » (80px,
   sans émoji précisément pour tenir dans les 82px utiles) doit pouvoir se
   replier entre le verbe et le groupe (prix) si le prix passe à deux
   chiffres — l'y interdire le ferait DÉBORDER au lieu de se replier.
   · white-space:nowrap  → le libellé ne se coupe jamais ;
   · tabular-nums        → 1, 2, 0 occupent la même chasse. Mesuré : sans lui,
     les valeurs à deux chiffres vont de 73,1 à 77,0px (8,8px d'écart entre
     « ~1 h » et « ~20 h ») et la largeur bougeait d'un article à l'autre ;
     avec lui, tout deux-chiffres fait exactement 77,0px. La pastille ne
     respire donc plus au rythme du compteur, et la hauteur de carte est
     constante quelle que soit la valeur. */
${s} .btn-cooldown{white-space:nowrap;font-variant-numeric:tabular-nums;}
${s} .cat-filters{display:flex;gap:6px;overflow-x:auto;-webkit-overflow-scrolling:touch;scrollbar-width:none;padding:2px 2px 4px;}
${s} .cat-filters::-webkit-scrollbar{display:none;}
${s} .fpill{display:inline-flex;align-items:center;gap:6px;padding:6px 12px;border-radius:99px;background:#fff;border:1px solid var(--border);font-size:12px;font-weight:600;color:var(--mute);white-space:nowrap;flex-shrink:0;cursor:pointer;font-family:inherit;transition:all 0.15s;}
${s} .fpill.active{background:var(--ink);border-color:var(--ink);color:#fff;}
${s} .fdot{width:8px;height:8px;border-radius:50%;flex-shrink:0;box-shadow:inset 0 0 0 1px rgba(16,32,27,0.10);}
`;
}

const TYPE_LABELS_EN={'High-Tech':'High-Tech','Mode':'Fashion','Luxe':'Luxury','Maison':'Home','Électroménager':'Appliances','Jouets':'Toys','Livres':'Books','Sport':'Sport','Auto-Moto':'Vehicles','Beauté':'Beauty','Musique':'Music','Collection':'Collection','Multimédia':'Multimedia','Jardin':'Garden','Bricolage':'DIY','Autre':'Other'};
export function typeLabel(type,lang){return lang==='en'?(TYPE_LABELS_EN[type]||type):type;}
export function marqueLabel(m,lang){return(lang==='en'&&m?.toLowerCase()==='sans marque')?'Unbranded':m;}

// ── Clé de COMPARAISON d'une marque (2026-08-31, bug des pills mortes) ────────
// Les pills du Stock affichent un libellé RECALCULÉ (« Capitalisée » :
// trim + 1re lettre majuscule + reste en minuscules), pendant que les
// garde-fous d'App.jsx comparaient ce libellé à `inventaire.marque` BRUTE, en
// égalité STRICTE. Toute marque dont la forme en base n'était pas exactement
// sa forme capitalisée voyait donc son filtre annulé DANS LA FOULÉE du clic,
// et la sélection retombait sur « Toutes » — pill morte, sans un mot.
// Mesuré sur le compte de Nico (14:09) : « Tommy Jeans » → libellé « Tommy
// jeans » (le J de Jeans passe en minuscule) ≠ base ⇒ cassée ; « Picture
// Organic Clothing » → « Picture organic clothing » ⇒ cassée ; une marque
// saisie tout en majuscules ou avec un espace parasite ⇒ cassée pareil. Les
// mono-mots déjà capitalisés en base (Adidas, Casio, Volcom, Ego…) tombaient
// juste par coïncidence — d'où « certaines marchent, d'autres non ».
// CETTE clé est désormais le SEUL critère d'égalité entre une marque de pill
// et une marque d'article, partout (filtre ET garde-fou).
// ⚠️ Volontairement PAS de suppression d'accents ni de ponctuation (contrairement
// à `_plat` plus bas, qui sert à un tout autre usage) : fusionner « Levi's » et
// « Levis », ou « Café » et « Cafe », regrouperait des marques distinctes sous
// une seule pill — c'est un choix produit, pas une correction de bug.
// La BASE N'EST PAS TOUCHÉE : `inventaire.marque` garde sa casse d'origine,
// c'est la comparaison à l'affichage qui devient juste.
export function marqueKey(m){
  return String(m??'').trim().replace(/\s+/g,' ').toLowerCase();
}

// La marque n'a plus sa place sur la LIGNE DE TITRE (2026-08-05) : elle s'y
// disputait la largeur avec le titre et finissait rognée en « • Q… » / « • To… »,
// c'est-à-dire illisible ET coûteuse. Elle passe en tête de la ligne meta, où
// elle est entière. Restait le doublon : « Short de bain Quiksilver taille M »
// suivi de « Quiksilver ». On ne la répète donc pas quand le titre la porte
// déjà — comparaison sans accents ni ponctuation (« Levi's » vs « Levis »).
const _plat=(s)=>String(s??'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'');
export function marqueHorsTitre(titre,marque){
  const m=String(marque??'').trim();
  if(!m)return null;
  const mp=_plat(m);
  if(!mp)return null;
  return _plat(titre).includes(mp)?null:m;
}

export const SKELETON_ITEMS=[
  {title:'Veste Zara oversize',  type:'Mode',       marque:'Zara',    buy:12,  qty:1,  days:2},
  {title:'Lot Pokémon x20',      type:'Collection', marque:'Pokémon', buy:8,   qty:20, days:null},
  {title:'iPhone 12 64Go',       type:'High-Tech',  marque:'Apple',   buy:180, qty:1,  days:5},
  {title:'Sac Kelly Hermès',     type:'Mode',       marque:'Hermès',  buy:125, qty:1,  days:1},
  {title:'Jean Levis 501',       type:'Mode',       marque:'Levis',   buy:15,  qty:1,  days:null},
];
// (05/11, phase 3 point 1) `titleEn` : le titre de l'exemple quand l'app est en anglais (Ventes vides, StockTab).
export const SKELETON_SOLD=[
  {title:'Jean Levis 501',       titleEn:'Levis 501 jeans',  type:'Mode',       marque:'Levis',   buy:15, sell:38, margin:23, marginPct:61},
  {title:'Perceuse Makita 18V',  titleEn:'Makita 18V drill', type:'High-Tech',  marque:'Makita',  buy:45, sell:89, margin:44, marginPct:49},
  {title:'Paquet Pokémon ×5',    titleEn:'Pokémon pack ×5',  type:'Collection', marque:'Pokémon', buy:2,  sell:15, margin:13, marginPct:87},
];

const VOICE_EXAMPLES_FR_RAW = [
  { text: "J'ai acheté une veste Zara oversize taille M, noire, très bon état, 12€ au vide-grenier de Corbeil, elle est dans le sac bleu sous l'escalier", tag: "Ajouter", cls: "add" },
  { text: "Où j'ai rangé mon iPhone 12 ?", tag: "Stock", cls: "query" },
  { text: "J'ai pris un lot de 3 paires de Nike Air Max 90, pointures 42 43 et 44, 60€ le lot sur Facebook Marketplace, dans la caisse rouge du garage", tag: "Ajouter", cls: "add" },
  { text: "Qu'est-ce que j'ai dans le bac H48 ?", tag: "Stock", cls: "query" },
  { text: "J'ai chopé un sac Hermès Kelly authentique, cuir marron, légèrement usé sur les anses, 125€ en dépôt-vente, je l'ai rangé dans la vitrine du salon", tag: "Ajouter", cls: "add" },
  { text: "J'ai vendu l'iPhone 380€ sur Vinted, expédié aujourd'hui", tag: "Vendre", cls: "sell" },
  { text: "J'ai acheté un lot de 20 cartes Pokémon dont 2 rares holographiques, 8€ à la brocante, boîte à cartes sur le bureau", tag: "Ajouter", cls: "add" },
  { text: "Combien j'ai gagné ce mois-ci ?", tag: "Stats", cls: "query" },
  { text: "Le sac Hermès est parti à 420€, payé en liquide", tag: "Vendre", cls: "sell" },
  { text: "C'est quoi mes articles en stock depuis plus de 2 semaines ?", tag: "Stats", cls: "query" },
  { text: "J'ai vendu le lot Nike 55€ sur Leboncoin", tag: "Vendre", cls: "sell" },
  { text: "Quelle est ma marge moyenne sur la Mode ?", tag: "Stats", cls: "query" },
];
const VOICE_EXAMPLES_EN_RAW = [
  { text: "I bought an oversized Zara jacket size M, black, great condition, €12 at the Corbeil car boot sale, it's in the blue bag under the stairs", tag: "Add", cls: "add" },
  { text: "Where did I put my iPhone 12?", tag: "Stock", cls: "query" },
  { text: "I grabbed a lot of 3 pairs of Nike Air Max 90, sizes 42 43 and 44, €60 the lot on Facebook Marketplace, in the red crate in the garage", tag: "Add", cls: "add" },
  { text: "What do I have in bin H48?", tag: "Stock", cls: "query" },
  { text: "I picked up an authentic Hermès Kelly bag, brown leather, slightly worn handles, €125 at a consignment store, stored in the living room display cabinet", tag: "Add", cls: "add" },
  { text: "I sold the iPhone for €380 on Vinted, shipped today", tag: "Sell", cls: "sell" },
  { text: "I bought a lot of 20 Pokémon cards including 2 holographic rares, €8 at the flea market, card box on the desk", tag: "Add", cls: "add" },
  { text: "How much did I make this month?", tag: "Stats", cls: "query" },
  { text: "The Hermès bag sold for €420, paid cash", tag: "Sell", cls: "sell" },
  { text: "Which items have been in stock for more than 2 weeks?", tag: "Stats", cls: "query" },
  { text: "Sold the Nike lot for €55 on Leboncoin", tag: "Sell", cls: "sell" },
  { text: "What's my average margin on Fashion?", tag: "Stats", cls: "query" },
];

const LENS_PLACEHOLDERS_FR = [
  "Taille M, bon état, quelques traces d'usure...",
  "Neuf avec étiquette, jamais porté...",
  "Écran fissuré, fonctionne parfaitement...",
  "Lot de 3, emballage d'origine...",
  "Vintage années 90, couleur originale...",
  "Acheté 150€, porté 2 fois...",
  "Manque le chargeur, batterie 85%...",
  "Taille unique, coloris rare...",
];
const LENS_PLACEHOLDERS_EN = [
  "Size M, good condition, some signs of wear...",
  "Brand new with tag, never worn...",
  "Cracked screen, works perfectly...",
  "Lot of 3, original packaging...",
  "Vintage 90s, original color...",
  "Bought for €150, worn twice...",
  "Missing charger, battery 85%...",
  "One size, rare colorway...",
];

export function getRotatingLensPlaceholders(currency, lang) {
  const sym = CURRENCY_SYMBOLS[currency] || '€';
  const raw = lang === 'en' ? LENS_PLACEHOLDERS_EN : LENS_PLACEHOLDERS_FR;
  if (sym === '€') return raw;
  return raw.map(t => t.replace(/€/g, sym));
}

export function getRotatingExamples(currency, lang) {
  const sym = CURRENCY_SYMBOLS[currency] || '€';
  const raw = lang === 'en' ? VOICE_EXAMPLES_EN_RAW : VOICE_EXAMPLES_FR_RAW;
  if (sym === '€') return raw;
  return raw.map(e => ({ ...e, text: e.text.replace(/€/g, sym) }));
}

export function groupSales(arr){
  const groups=[];
  for(const s of arr){
    if(s.quantite!=null){
      groups.push({...s,_qty:s.quantite});
      continue;
    }
    const last=groups[groups.length-1];
    if(last&&last.quantite==null&&last.title===s.title&&last.marque===s.marque&&last.date===s.date&&Math.abs((last.sell||0)-(s.sell||0))<0.01){
      last._qty=(last._qty||1)+1;
      // Copie de la groupSales d'App.jsx — même correction : une marge inconnue
      // dans le groupe rend la marge du groupe inconnue, au lieu d'additionner
      // les seules lignes chiffrées et de présenter le résultat comme un total.
      const marges=[last.margin,s.margin];
      last.margin=marges.some(m=>m==null)?null:marges.reduce((a,m)=>a+m,0);
      last.marginPct=last.margin!=null&&(last.sell||0)>0?(last.margin/(last.sell*last._qty))*100:null;
    }else{
      groups.push({...s,_qty:1});
    }
  }
  return groups;
}

// ── Horloge machine en retard (2026-08-15, cas Carla) ────────────────────────
// L'extension écrit platform_fields.processing_since avec l'horloge LOCALE de
// l'ordinateur (background.js, au passage en 'processing') ; created_at est
// posé par le serveur. Un job ne peut pas être traité avant d'exister :
// processing_since très ANTÉRIEUR à created_at prouve une horloge en retard —
// la cause probable des pages de dépôt qui n'aboutissent jamais (certificats
// TLS et cookies jugés à l'heure locale). Règles (15/08) :
//   · seule la ligne DATÉE la plus récemment créée (fenêtre 7 j) fait foi :
//     un job suffit — le faux positif est structurellement impossible avec la
//     marge de 24 h — et l'horloge corrigée efface le bandeau dès le job
//     traité suivant, sans autre geste ni expiration à attendre ;
//   · processing_since absent ou illisible → ligne ignorée ; aucune ligne
//     datée (compte sans extension, jobs jamais traités) → jamais de bandeau ;
//   · horloge en AVANCE (processing_since > created_at) → hors périmètre,
//     jamais de bandeau ;
//   · AVERTIR seulement : aucun code ne doit lire ce signal pour bloquer.
export const HORLOGE_RETARD_SEUIL_MS = 24 * 3600 * 1000;
export const HORLOGE_RETARD_FENETRE_MS = 7 * 24 * 3600 * 1000;
export function detecterRetardHorloge(jobs, nowMs = Date.now()) {
  let dernier = null;
  for (const j of jobs ?? []) {
    const ps = Date.parse(j?.platform_fields?.processing_since ?? "");
    const cree = Date.parse(j?.created_at ?? "");
    if (!Number.isFinite(ps) || !Number.isFinite(cree)) continue;
    if (nowMs - cree > HORLOGE_RETARD_FENETRE_MS) continue;
    if (!dernier || cree > dernier.cree) dernier = { cree, ps };
  }
  if (!dernier) return { enRetard: false, jours: 0 };
  const retardMs = dernier.cree - dernier.ps;
  if (retardMs < HORLOGE_RETARD_SEUIL_MS) return { enRetard: false, jours: 0 };
  return { enRetard: true, jours: Math.max(1, Math.round(retardMs / 86400000)) };
}

// ── Fraîcheur de l'extension — « ordinateur éteint » (2026-08-13) ────────────
// profiles.extension_last_seen_at est un battement SERVEUR, stampé par
// get-pending-jobs à chaque poll réussi (background toutes les 2 min, popup à
// l'ouverture). Le seuil « éteinte » doit être assez large pour qu'une
// extension VIVANTE ne le franchisse JAMAIS — un faux positif chez quelqu'un
// qui publie normalement est pire qu'un silence de quelques minutes.
// Pire silence LÉGITIME calculé sur le code réel : le poll tourne sous le
// verrou de flux (withJobFlowLock, background.js) — pendant qu'un cycle
// traite ses jobs, les alarmes suivantes ATTENDENT, et le stamp n'arrive
// qu'au cycle suivant. get-pending-jobs distribue TOUS les pending d'un coup
// (aucune limite) : un lot mobile de 12 jobs (3 articles × 4 plateformes) à
// ~3 min/job (eBay le plus lent : fieldSettle ~5 s/champ, relectures 8 s,
// pauses humaines) + 8-20 s entre jobs ≈ 40-45 min sans battement. Une sync
// dressing tient le même verrou (~8 min mesurées pour 123 articles).
// 60 min = ce pire cas (~45 min) + un tiers de marge. En dessous : RIEN.
// Au-delà de 7 jours : l'état rouge « inactive » (là, ouvrir Chrome ne
// suffira peut-être plus — reconnexion fillsell.app à proposer).
export const EXT_ETEINT_MS = 60 * 60 * 1000;
export const EXT_INACTIF_MS = 7 * 24 * 60 * 60 * 1000;

// États : 'inconnue' (jamais vue — les gardes « jamais installée » s'en
// chargent ailleurs, rien à afficher ici), 'vivante', 'eteinte' (ambre,
// informatif : rien n'est cassé, le job partira), 'inactive' (rouge),
// et 'session_expiree' (incident du 02/09 soir) : l'extension TOURNE mais son
// bootstrap de session est refusé (extension-session 401 → le serveur stampe
// profiles.extension_session_rejetee_at). Sans cet état, l'app affichait
// « ton ordinateur est éteint » à quelqu'un dont l'extension hurlait dans la
// console — il concluait que le produit est cassé. Le rejet PRIME sur la
// fraîcheur quand il est plus récent que le dernier battement (une extension
// sans session ne polle plus : last_seen gèle) et vieux de moins de 24 h ;
// dès que les polls reprennent, last_seen repasse devant et l'état redevient
// « vivante » tout seul — aucun nettoyage requis côté client.
export const EXT_REJET_FENETRE_MS = 24 * 60 * 60 * 1000;
export function fraicheurExtension(lastSeenAt, sessionRejeteeAt = null) {
  const seen = Date.parse(lastSeenAt ?? "");
  const rejet = Date.parse(sessionRejeteeAt ?? "");
  if (Number.isFinite(rejet)
      && Date.now() - rejet <= EXT_REJET_FENETRE_MS
      && (!Number.isFinite(seen) || rejet >= seen)) {
    return { etat: "session_expiree", jours: null };
  }
  if (!Number.isFinite(seen)) return { etat: "inconnue", jours: null };
  const age = Date.now() - seen;
  if (age <= EXT_ETEINT_MS) return { etat: "vivante", jours: 0 };
  const jours = Math.max(1, Math.floor(age / 86400000));
  return { etat: age > EXT_INACTIF_MS ? "inactive" : "eteinte", jours };
}

// ── UUID v4 conforme (2026-09-13, lot « le scan survit à l'app ») ────────────
// Utilisé pour le scan_id que l'app réserve auprès de lens-analysis AVANT
// d'uploader les photos : c'est la clé primaire de lens_scans, donc la garde
// de non-double-facturation et la poignée de la reprise.
// Le serveur ne l'accepte que sous la forme UUID canonique — une chaîne
// « presque UUID » serait ignorée en silence, sans persistance ni reprise, et
// rien ne le signalerait. D'où le repli manuel quand crypto.randomUUID manque
// (contexte non sécurisé, vieille webview) plutôt qu'un Date.now() bricolé.
export function uuidV4() {
  try { if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID(); }
  catch { /* contexte non sécurisé : repli ci-dessous */ }
  const o = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(o);
  else for (let i = 0; i < 16; i++) o[i] = Math.floor(Math.random() * 256);
  o[6] = (o[6] & 0x0f) | 0x40;
  o[8] = (o[8] & 0x3f) | 0x80;
  const h = [...o].map(b => b.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
