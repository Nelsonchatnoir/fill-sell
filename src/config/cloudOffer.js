import { interrupteurOuvert } from './interrupteurs.js';
import { CLE_INTERRUPTEUR_FORMULES as CLES_FORMULES } from '../../supabase/functions/_shared/formules-cloud.js';

// ── Drapeau UNIQUE de l'option « FillSell Cloud » (sans ordinateur) — 04/10/2026 ──
//
// CONCEPTION, NON LIVRÉE. Sur le modèle de businessOffer.js : UNE constante,
// UN point de décision, et plus aucune lecture directe du drapeau côté UI.
//
// Tant qu'il est à `false`, RIEN ne change pour personne, même si la branche
// était fusionnée par erreur :
//   · la feuille des formules (ConversionModal) n'affiche aucun interrupteur
//     et appelle `onUpgrade(tier)` EXACTEMENT comme avant (un seul argument) ;
//   · ni l'étape « extension » du parcours d'entrée, ni le mur « installe
//     l'extension », ni Réglages › Abonnement ne montrent la voie Cloud ;
//   · aucune lecture des colonnes Cloud n'est tentée (useCloudProfil ne part
//     pas) — elles n'existent pas encore en base.
//
// ⛔ AVANT DE PASSER À `true` — les cinq conditions, toutes, le même jour :
//   1. la migration des colonnes (profiles.is_cloud, cloud_essai_debut,
//      cloud_essai_fin, cloud_essai_arrete, cloud_periode_fin,
//      cloud_arret_fin_periode) et `cloud_etat()` APPLIQUÉES et inscrites ;
//   2. les produits de paiement de l'option créés et alignés à 24,99 € sur les
//      TROIS canaux (Stripe, Apple, Google — décision de Nico du 03/11) — le
//      prix est affiché en dur (CLOUD_PRIX_AFFICHE, utils/palier.js), comme
//      PLAN_PRICES ;
//   3. l'hôte (App.jsx) lit le 2e argument d'`onUpgrade(tier, { cloud })` et
//      ouvre l'essai / ajoute l'option au paiement, et sait prendre l'option
//      SEULE sur un compte Free (`onCloudSeul`, décision du 04/10 soir) —
//      essai de 7 jours, carte demandée ;
//   4. la SORTIE existe : « Arrêter le Cloud » est câblée (HoteCloud reçoit
//      `actions.arreter`) — on ne vend pas un essai qu'on ne sait pas arrêter.
//      scripts/cloud-ecrans-selftest.mjs refuse le drapeau levé sans elle ;
//   5. le navigateur Cloud tourne vraiment (pool d'adresses, docs/cloud/).
// (06/11/2026 soir, décision de Nico : « le binaire soumis doit être complet dès l'installation ») PLUS DE DRAPEAU
// FIGÉ DANS LE BUNDLE : l'ouverture du Cloud est l'interrupteur SERVEUR coin_config.cloud_offre_ouverte — le même que
// create-checkout-session lit déjà —, lu au démarrage par config/interrupteurs.js. Pas encore lu, illisible, absent ou
// ≠ 1 = FERMÉ. Ouvrir à tous = `insert into coin_config (key, value) values ('cloud_offre_ouverte', 1)` (les cinq
// conditions ci-dessus restent la règle) ; refermer = value 0. Ni OTA, ni binaire.
export const CLE_OUVERTURE_CLOUD = 'cloud_offre_ouverte';
/** L'offre Cloud est-elle ouverte à tous (interrupteur serveur lu) ? Faux tant qu'il n'est pas lu. */
export const cloudOffreOuverte = () => interrupteurOuvert(CLE_OUVERTURE_CLOUD);

// (05/10) Les textes légaux de l'option (CGV article 7, CGU 3.9, confidentialité
// 4.7 et 4.8 — src/cloud/textesLegaux.js) : publiés sur /legal AVEC l'offre, le
// même jour, par ce seul interrupteur. Page publique, sans compte : jamais
// ouverts aux seuls témoins (règle du 15/09 : un service non ouvert ne
// s'annonce pas). À lever seul, plus tôt, uniquement si la revue Apple l'exige.
// (06/11/2026, ordre de Nico) LEVÉ SEUL, avant l'offre : l'abonnement FillSell Cloud est soumis à Apple (06/11 10:37)
// et le relecteur l'achète — les conditions qu'il accepte doivent être publiques. L'offre, elle, reste fermée
// (CLOUD_OFFER_ENABLED) : seuls les témoins la voient.
export const CLOUD_TEXTES_LEGAUX = true;

// (05/10) Comptes TÉMOINS de l'OFFRE (paiement compris) avant l'ouverture : le
// compte de démonstration remis à la revue Apple (le premier abonnement d'un
// groupe se soumet avec une version de l'app, le relecteur doit pouvoir
// l'acheter), et Nico pour un achat d'essai réel. VIDE = personne.
// (05/10, décision de Nico : écran B du test, DANS l'app) Nico SEUL — aucun
// autre compte ne voit rien, ni à l'écran ni dans le comportement
// (scripts/cloud/preuve-identite-compte-ordinaire.mjs le prouve avant l'OTA).
// (30/10, lot D, décision de Nico : « visible UNIQUEMENT sur mon compte, drapeau PAR COMPTE ») Les listes écrites
// en dur sont VIDES : un témoin est un compte qui porte profiles.beta_flags.cloud = true (posé par le serveur seul,
// beta_flags n'est pas inscriptible par les clients), lu une fois à la connexion par chargerTemoinCloud (App).
// Ouvrir à un autre compte = une ligne en base, jamais une OTA.
// L'identifiant de Nico reste exporté pour la page de maquettes (MaquettesLot.jsx) — il n'ouvre plus le Cloud.
export const NICO_USER_ID = 'f44b5917-bccc-4431-ba41-f40571a2ed18';
export const CLOUD_OFFRE_TEMOINS = Object.freeze([]);
// Les comptes dont le drapeau a été LU vrai (cette session de l'app seulement).
const TEMOINS_PAR_DRAPEAU = new Set();
/** Lit le drapeau du compte (profiles.beta_flags.cloud) ; rend vrai si c'est un témoin. Jamais d'exception. */
export async function chargerTemoinCloud(supabase, userId) {
  if (!supabase || !userId) return false;
  try {
    const { data, error } = await supabase.from('profiles').select('beta_flags').eq('id', userId).maybeSingle();
    const oui = !error && data?.beta_flags?.cloud === true;
    if (oui) TEMOINS_PAR_DRAPEAU.add(userId); else TEMOINS_PAR_DRAPEAU.delete(userId);
    return oui;
  } catch {
    return false;
  }
}
const estTemoin = (userId) => userId != null && (CLOUD_OFFRE_TEMOINS.includes(userId) || TEMOINS_PAR_DRAPEAU.has(userId));

// LE point de décision. Le paramètre `userId` est gardé (même signature que
// businessOfferVisible) : c'est lui qui ouvre l'option aux comptes témoins
// sans retoucher les appelants.
export const cloudOfferVisible = (userId) => cloudOffreOuverte() || estTemoin(userId);

// (05/11 soir, lot « Ouverture du Cloud », PHASE 3 point 3 — ordre de Nico, corrigé à 21:44) LE CLOUD SE VEND EN
// FRANCE SEULEMENT : un vendeur étranger ne passe jamais par une IP française (anti-robot, restriction de compte,
// redirections de site selon l'IP). Un pays s'ouvrira après une preuve réelle avec une IP DE CE PAYS (IPRoyal par pays,
// même plafond d'achat) : il s'ajoute alors à PAYS_CLOUD_OUVERTS. Le pays se lit sur le téléphone (fuseau horaire, comme
// pour la zone euro : utils/vintedEtrangerApp.js) ; inconnu = pas la France. Les témoins (Nico, comptes de relecture
// Apple et Google) voient l'offre partout : le relecteur Apple, aux États-Unis, doit pouvoir l'acheter.
// ⛔ Seule la VENTE est bornée (achat, essai, offre dans les feuilles) : un compte qui a déjà le Cloud garde ses écrans
// — état, « Me connecter », arrêt, reprise — où qu'il soit (cloudOfferVisible, inchangé). Les prix des boutiques ne
// bougent pas (ordre de Nico) : l'offre est seulement masquée hors de France.
export const PAYS_CLOUD_OUVERTS = Object.freeze(['FR']);
const FUSEAUX_PAYS_CLOUD = Object.freeze({ 'Europe/Paris': 'FR' });
/** Le pays du téléphone pour le Cloud (fuseau horaire IANA), ou null (inconnu, ou pays sans Cloud). */
export function paysDuTelephoneCloud(fuseau) {
  let f = fuseau;
  if (f === undefined) {
    try { f = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { f = null; }
  }
  return FUSEAUX_PAYS_CLOUD[String(f ?? '').trim()] ?? null;
}
// (08/11/2026, jour J, consigne de Nico « Android sans le nouveau binaire : rien à moitié, sinon invisible jusqu'à la
// vc36 ») DANS L'APP, LE CLOUD NE SE VEND QU'À PARTIR DU BINAIRE RELU AVEC LUI (CLOUD_BINAIRE_MIN = 2.9.164, Apple
// build 2611071917, Google vc36). Un binaire plus ancien (Android 2.9.10, iPhone 2.8) n'a pas le module de
// notifications : la liste d'attente y promettrait une notification qui n'arrive jamais. Il reçoit pourtant l'OTA :
// l'offre lui reste donc MASQUÉE (même règle que le pays), et s'allume seule le jour où la personne installe le
// binaire 2.9.164 — ni OTA, ni interrupteur. Web : sans objet (aucun binaire). Le binaire est lu UNE fois au démarrage
// (App.jsx : Capacitor App.getInfo → noterBinaireCloud) ; pas encore lu ou illisible sur un téléphone = PAS vendu.
// ⛔ Seule la VENTE est bornée : un compte qui a déjà le Cloud garde ses écrans, l'arrêt et la reprise (cloudOfferVisible).
export const CLOUD_BINAIRE_MIN = '2.9.164';
/** Compare deux versions « a.b.c » segment par segment (pur) ; une version illisible vaut -1. */
export function comparerVersions(a, b) {
  const lire = (v) => (/^\d+(\.\d+)*$/.test(String(v ?? '').trim()) ? String(v).trim().split('.').map(Number) : null);
  const x = lire(a), y = lire(b);
  if (!x || !y) return -1;
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0);
    if (d !== 0) return d > 0 ? 1 : -1;
  }
  return 0;
}
// (08/11/2026 soir, point 4 de Nico : « jamais sur Android tant que Google n'a pas validé le Cloud ») Sur ANDROID, le
// binaire relu avec le Cloud est la vc37 (2.9.167) : la vc36 (2.9.164) a été REFUSÉE par Google (devises). Un Android
// 2.9.164 (APK d'essai seulement, jamais publié) ne vend donc rien ; le jour où Google publie la vc37, l'offre s'allume
// seule chez ceux qui l'installent — ni OTA, ni interrupteur. iPhone : inchangé (2.9.164, validé par Apple).
export const CLOUD_BINAIRE_MIN_ANDROID = '2.9.167';
/** Le binaire porte-t-il le Cloud ? (pur) 'web' = oui ; un numéro natif ≥ au minimum de SA plateforme = oui ; sinon
 *  (inconnu) non. `plateforme` : 'android' → CLOUD_BINAIRE_MIN_ANDROID ; tout le reste → CLOUD_BINAIRE_MIN. */
export function binairePorteLeCloud(binaire, plateforme = null) {
  if (binaire === 'web') return true;
  return comparerVersions(binaire, plateforme === 'android' ? CLOUD_BINAIRE_MIN_ANDROID : CLOUD_BINAIRE_MIN) >= 0;
}
let binaireCloud = null;   // null = pas encore lu ; 'web' ; ou la version du binaire natif (« 2.9.164 »)
let plateformeCloud = null; // 'ios' | 'android' | 'web' | null (Capacitor.getPlatform, noté avec le binaire)
/** Note le binaire (valeur ou promesse : 'web', une version, null si illisible) et sa plateforme. Rend une promesse ;
 *  jamais d'exception. */
export function noterBinaireCloud(v, plateforme = null) {
  plateformeCloud = plateforme ?? null;
  return Promise.resolve(v).then((x) => { binaireCloud = x ?? null; }, () => { binaireCloud = null; }).then(() => binaireCloud);
}
/** Pour les selftests seulement. */
export function _binaireCloudAZero(v = null, plateforme = null) { binaireCloud = v; plateformeCloud = plateforme; }
/** La règle (pure, testée : scripts/cloud-pays-selftest.mjs) : témoin partout ; sinon l'offre ouverte ET un pays ouvert
 *  ET (08/11) un binaire qui porte le Cloud (`binaire` absent = sans objet, comme avant). */
export function cloudVendableDansLePays({ temoin = false, ouvert = false, pays = null, binaire = true } = {}) {
  if (temoin) return true;
  return Boolean(ouvert) && PAYS_CLOUD_OUVERTS.includes(pays) && binaire === true;
}
/** Le point de décision de la VENTE du Cloud (achat, essai, offre) : à la place de cloudOfferVisible sur ces gestes-là. */
export const cloudOffreVendable = (userId, fuseau = undefined) =>
  cloudVendableDansLePays({ temoin: estTemoin(userId), ouvert: cloudOffreOuverte(), pays: paysDuTelephoneCloud(fuseau),
    binaire: binairePorteLeCloud(binaireCloud, plateformeCloud) });

// ── LES FORMULES AVEC CLOUD (11/11/2026, décisions de Nico) ───────────────────────────────────────────────────────
// Premium + Cloud, Pro + Cloud (mis en avant), Business + Cloud : UN abonnement chacune, sur le même canal que la
// formule seule. Le CONTRAT (noms, essai, supplément, produits des boutiques, interrupteurs) a UNE source, partagée
// avec le serveur : supabase/functions/_shared/formules-cloud.js — ré-exporté ici, jamais redéfini (comme les
// conditions du Cloud ci-dessous). ⛔ Essai de 7 jours sur Premium + Cloud et Pro + Cloud SEULEMENT : Business + Cloud
// est payé dès la souscription (correction de Nico du 11/11, 21:45).
export {
  FORMULES_CLOUD, PALIER_DE_FORMULE, FORMULE_CLOUD_DU_PALIER, FORMULE_MISE_EN_AVANT, ESSAI_JOURS as FORMULES_ESSAI_JOURS,
  FORMULES_AVEC_ESSAI, essaiPossiblePourFormule, PRIX_AVEC_CLOUD_EUR, SUPPLEMENT_CLOUD_EUR, supplementCloud,
  PRODUITS_BOUTIQUES, formuleDuProduitBoutique, CLE_INTERRUPTEUR_FORMULES,
} from '../../supabase/functions/_shared/formules-cloud.js';
/** Le canal de VENTE de l'app en cours (pur) : iPhone → 'apple', Android → 'google', tout le reste (web) → 'stripe'. */
export const canalDeVente = (plateforme) => (plateforme === 'ios' ? 'apple' : plateforme === 'android' ? 'google' : 'stripe');
/** L'interrupteur serveur des formules avec Cloud d'UN canal (coin_config.cloud_formules_<canal>) : 1 = ouvert ;
 *  absent, illisible, pas encore lu ou ≠ 1 = FERMÉ. */
export const formulesCloudOuvertes = (canal) => interrupteurOuvert(CLES_FORMULES[canal] ?? '');
/**
 * LE point de décision des formules avec Cloud (fenêtre d'offres, parcours d'entrée, Réglages, achat). Même règle que
 * la vente du Cloud (cloudVendableDansLePays : témoin partout ; sinon France + binaire qui porte le Cloud), mais
 * l'interrupteur est CELUI DU CANAL de l'app (stripe sur le web, apple sur iPhone, google sur Android). Fermé : l'app
 * reste EXACTEMENT celle d'avant pour un compte ordinaire (verrou scripts/formules-cloud-ferme-selftest.mjs).
 * `plateforme` absente : celle notée au démarrage (noterBinaireCloud), web sinon.
 */
export const formulesCloudVendables = (userId, { plateforme = undefined, fuseau = undefined } = {}) =>
  cloudVendableDansLePays({
    temoin: estTemoin(userId), ouvert: formulesCloudOuvertes(canalDeVente(plateforme ?? plateformeCloud ?? 'web')),
    pays: paysDuTelephoneCloud(fuseau), binaire: binairePorteLeCloud(binaireCloud, plateformeCloud),
  });

// ── L'écran « Me connecter » (05/10) ──────────────────────────────────────
// (07/11, décision de Nico, voie b) CLOUD_DOMAINE retiré : l'adresse vient du serveur du compte (cloud_serveur_moi,
// src/cloud/MeConnecterCloud.jsx), jamais d'un nom fixe — cloud.fillsell.app n'a plus de serveur ni de DNS.
// (30/10, lot D) La version en vigueur des conditions d'utilisation du Cloud (src/cloud/conditionsCloud.js) — même
// valeur que supabase/functions/_shared/cloud-conditions.js. Changer le texte = changer cette version.
// (04/11) 2026-10-30 → 2026-11-04 : le prix de l'article 6 passe à 24,99 € (décision de Nico du 03/11). Une personne
// qui avait accepté la version du 30/10 se voit présenter la nouvelle avant tout paiement Cloud.
// (11/11, point C1 du méga lot de Nico) L'article 4 est REFORMULÉ sans rien changer sur le fond (et la case ne cite
// plus le risque) → version neuve. La version, la version MINIMALE et la règle d'acceptation (date AAAA-MM-JJ réelle
// ET ≥ la minimale) ont UNE source : supabase/functions/_shared/cloud-conditions.js, la même que create-checkout-session.
// Ré-exportées ici, jamais redéfinies : une reformulation garde valables les acceptations depuis la minimale (2026-11-04)
// sans redéploiement synchronisé ; un changement de FOND relève la minimale en DEUX TEMPS (procédure dans ce fichier).
export { CGU_CLOUD_VERSION, CGU_CLOUD_VERSION_MINIMALE, CGU_CLOUD_HISTORIQUE, versionCguValable } from '../../supabase/functions/_shared/cloud-conditions.js';
// Les plateformes proposées : SEULEMENT celles prouvées en réel depuis le Cloud.
// (Une plateforme qui bloque le Cloud n'est jamais promise : elle s'ajoute ici
// après son test réel, sur décision de Nico.) eBay a sa propre ligne (API).
// (30/10, lot D, Nico : « un bouton Me connecter par plateforme ») Beebs et Depop ajoutés pour le test du compte
// témoin (Beebs : DataDome le 26/09 sur une autre IP et un autre navigateur — retesté le 30/10).
export const CLOUD_PLATEFORMES_CONNEXION = Object.freeze([
  Object.freeze({ id: 'vinted', nom: 'Vinted' }),
  Object.freeze({ id: 'leboncoin', nom: 'Leboncoin' }),
  Object.freeze({ id: 'beebs', nom: 'Beebs' }),
  Object.freeze({ id: 'depop', nom: 'Depop' }),
]);
// Comptes TÉMOINS du test réel : l'écran « Me connecter » et la lecture de
// l'état Cloud leur sont ouverts même drapeau baissé — l'OFFRE (paiement)
// reste fermée. VIDE = personne : rien ne change pour aucun compte.
// (05/10) Nico SEUL, pour le test réel (écran B).
export const CLOUD_TEMOINS = Object.freeze([]);
export const cloudConnexionVisible = (userId) => cloudOfferVisible(userId) || (userId != null && (CLOUD_TEMOINS.includes(userId) || estTemoin(userId)));
