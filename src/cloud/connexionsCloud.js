// ═══════════════════════════════════════════════════════════════════════════
// « CONNECTE TES COMPTES POUR DÉMARRER FILLSELL CLOUD » — LES RÈGLES (08/11/2026, urgent U1-U5 de Nico)
// ═══════════════════════════════════════════════════════════════════════════
// Constat (08/11, premier vrai client Cloud, web mobile + Stripe) : essai démarré à 15:16:08, poste prêt à 15:16:57,
// mais AUCUN écran de connexion ouvert — sur le web, l'essai part chez Stripe (la page quitte l'app), et au retour rien
// ne menait aux connexions : elle a vu la carte « installer l'extension », puis « Synchroniser » a lancé 4 relevés dans
// le vide. Sur iPhone (achat dans l'app), le parcours d'entrée enchaîne bien sur les connexions (Nicotest, 07/11 : 7 s).
// La RÈGLE, pour tous les canaux :
//   · un compte FillSell Cloud (essai ou payé) dont une plateforme CHOISIE n'est pas connectée voit la carte
//     « Connecte tes comptes pour démarrer FillSell Cloud » en haut du Tableau et du Stock, avec l'avancement
//     (« 2 sur 4 connectées ») ; elle ouvre l'écran de connexion ;
//   · après le début de l'essai (retour de Stripe compris), l'app ouvre DIRECTEMENT cet écran, une fois ;
//   · « Synchroniser » sans aucune plateforme Cloud connectée ne lance rien : l'écran de connexion s'ouvre, avec
//     « pas encore connecté » — jamais « reconnexion » pour qui ne s'est jamais connecté.
// Plateformes choisies : profiles.platform_settings.plateformes_vendeur (parcours d'entrée) ∩ les plateformes du Cloud
// (config/cloudOffer.js) ; rien de choisi parmi elles → toutes les plateformes du Cloud. « Connectée » = la règle de
// l'écran « Me connecter » (executant.etatConnexion). Aucun import réseau ici.
//
// ⛔ (16/11/2026 nuit, point 2 de Nico — compte a962a59e) LES PLATEFORMES DU CLOUD = CELLES COCHÉES ∪ CELLES
// OÙ LA PERSONNE A RÉELLEMENT DE L'ACTIVITÉ, MOINS CELLES QU'ELLE A ÉCARTÉES. Constat : Vinted seule cochée à
// l'inscription (09/11), Leboncoin et Beebs publiés le soir même depuis l'extension du PC (qui ne lit pas cette liste) ;
// passée au Cloud le 16/11, « Me connecter » ne lui proposait que Vinted (total 1), ouvert 15 fois sans pouvoir connecter
// Leboncoin ni Beebs. LA RÈGLE, pour tous les comptes (panneau « Me connecter », carte de connexion, total affiché) :
//   · cochées (plateformes_vendeur) ∪ actives (annonces reliées, tâches, relevés réussis — cloud/activitePlateformes.js) ;
//   · moins plateformes_ecartees (« je ne vends pas sur X » : respecté) et les plateformes fermées au pays — SAUF une
//     écartée dont un RETRAIT attend (une vente ailleurs, annonce encore en ligne : risque de double vente). La doctrine
//     des écartées (_shared/plateformes-ecartees.js) : « un retrait part toujours » ; le serveur demande alors de
//     connecter la plateforme (« En attente de ta connexion à X dans FillSell Cloud… ») — elle doit être proposée.
//     Mesuré le 16/11 : 13e274de (Beebs écartée, 7 retraits Beebs « Reconnecte Beebs dans l'app »), af37fa49 (2) ;
//   · « Me connecter » ouvert depuis les Réglages (sans liste) : toutes les plateformes du Cloud, inchangé ;
//   · seulement celles que le Cloud sait faire (CLOUD_PLATEFORMES_CONNEXION : ni eBay, qui passe par l'API, ni Opla) ;
//   · liste vide ([]) ou absente (null) = rien de choisi : TOUTES les plateformes du Cloud (moins les écartées) — c'est
//     déjà l'ensemble le plus large, l'activité n'y ajoute rien (aucune lecture). Idem si rien de retenu n'est au Cloud.
// La liste enregistrée n'est jamais réécrite : la règle se lit à chaque ouverture. Verrou : selftest:cloud-plateformes-actives.
import { CLOUD_PLATEFORMES_CONNEXION } from '../config/cloudOffer.js';
import { etatConnexion } from './executant.js';

export const CLE_PLATEFORMES_CHOISIES = 'plateformes_vendeur';
export const CLE_PLATEFORMES_ECARTEES = 'plateformes_ecartees';

const listeDe = (v) => (Array.isArray(v) ? v.map(String).filter(Boolean) : []);
/** « Je ne vends pas sur X » (platform_settings.plateformes_ecartees), pur. */
export const plateformesEcartees = (platformSettings) => listeDe(platformSettings?.[CLE_PLATEFORMES_ECARTEES]);

/**
 * Les plateformes du Cloud dont l'ACTIVITÉ est à lire (pur) : celles du Cloud, ni cochées, ni écartées, ni fermées.
 * Rien de coché → aucune (toutes sont déjà proposées).
 */
export function plateformesActiviteALire(platformSettings, plateformesFermees = []) {
  const choisies = listeDe(platformSettings?.[CLE_PLATEFORMES_CHOISIES]);
  if (!choisies.length) return [];
  const ecartees = plateformesEcartees(platformSettings);
  return CLOUD_PLATEFORMES_CONNEXION.map((p) => p.id)
    .filter((id) => !choisies.includes(id) && !ecartees.includes(id) && !(plateformesFermees ?? []).includes(id));
}

/** Les écartées du Cloud dont il faut savoir si un RETRAIT attend (pur) : écartées, au Cloud, pas fermées au pays. */
export function plateformesRetraitsALire(platformSettings, plateformesFermees = []) {
  const ecartees = plateformesEcartees(platformSettings);
  return CLOUD_PLATEFORMES_CONNEXION.map((p) => p.id).filter((id) => ecartees.includes(id) && !(plateformesFermees ?? []).includes(id));
}

/**
 * Les plateformes Cloud à connecter pour CE compte, dans l'ordre du Cloud (pur).
 *   actives : les plateformes où le compte a de l'activité (cloud/activitePlateformes.js) — ajoutées aux cochées.
 *   retraitsEnAttente : les plateformes (écartées comprises) où un retrait attend — toujours proposées.
 */
export function plateformesCloudChoisies(platformSettings, plateformesFermees = [], actives = [], retraitsEnAttente = []) {
  const choisies = listeDe(platformSettings?.[CLE_PLATEFORMES_CHOISIES]);
  const retraits = listeDe(retraitsEnAttente);
  const ecartees = plateformesEcartees(platformSettings).filter((id) => !retraits.includes(id));
  const retenues = new Set([...choisies, ...listeDe(actives), ...retraits]);
  const cloud = CLOUD_PLATEFORMES_CONNEXION.filter((p) => !(plateformesFermees ?? []).includes(p.id) && !ecartees.includes(p.id));
  const parmi = choisies.length ? cloud.filter((p) => retenues.has(p.id)) : [];
  return (parmi.length ? parmi : cloud).map((p) => ({ id: p.id, nom: p.nom }));
}

/**
 * L'avancement (pur) : { total, connectees, aConnecter: [{id, nom}], toutes, aucune }.
 *   etats : la réponse de cloud_coffre_etat_moi ({ vinted: …, leboncoin: … }) ; isoles : connectées dans leur navigateur
 *   réservé (platform_settings.<pf>.cloud_isole) — elles comptent comme connectées, comme à l'écran « Me connecter ».
 */
export function avancementConnexions({ plateformes = [], etats = null, isoles = [] } = {}) {
  const connecte = (id) => etatConnexion(etats?.[id]) === 'connecte' || isoles.includes(id);
  const aConnecter = plateformes.filter((p) => !connecte(p.id));
  const total = plateformes.length;
  const connectees = total - aConnecter.length;
  return { total, connectees, aConnecter, toutes: total > 0 && connectees === total, aucune: connectees === 0 };
}

/**
 * (14/11/2026 soir, cliente af37fa49) LE BILAN D'UN ÉCRAN « ME CONNECTER » REFERMÉ (pur) — la trace
 * « cloud_me_connecter_ferme ». À 17:49:16 un « Me connecter » s'est ouvert (« ouvert », visible) sans aucune connexion :
 * rien ne disait si l'écran était resté muet ou si personne n'avait touché de ligne — il a fallu le déduire de la carte
 * du Stock remontée à 17:49:32 (elle ne se monte qu'écran fermé). Désormais chaque toucher d'une ligne est tracé
 * (« cloud_me_connecter_ligne_clic ») et la fermeture dit combien de temps l'écran est resté et ce qui a été touché.
 * Rend { duree_s, touchees, aucune_touchee, origine? }.
 */
export function bilanFermetureMeConnecter({ ouvertLe = null, fermeLe = null, touchees = [], origine = null } = {}) {
  const d = ouvertLe == null || fermeLe == null ? NaN : Number(fermeLe) - Number(ouvertLe);
  const liste = [...new Set((Array.isArray(touchees) ? touchees : []).map(String).filter(Boolean))].slice(0, 10);
  return {
    duree_s: Number.isFinite(d) && d >= 0 ? Math.round(d / 1000) : null,
    touchees: liste,
    aucune_touchee: liste.length === 0,
    ...(origine ? { origine: String(origine) } : {}),
  };
}

/** La carte s'affiche-t-elle ? (pur) Compte Cloud lu, connexions lues, au moins une plateforme choisie à connecter. */
export const carteConnexionVisible = ({ clientCloud = false, lu = false, avancement = null } = {}) =>
  Boolean(clientCloud && lu && avancement && avancement.total > 0 && !avancement.toutes);

/**
 * L'écran s'ouvre-t-il TOUT SEUL ? (pur) Une fois par essai et par appareil (`dejaOuvert`), ou quand le retour de
 * Stripe le demande (`demande`), tant que RIEN n'est connecté — jamais par-dessus le parcours d'entrée.
 */
// (20/11/2026 nuit, ordre de Nico — cliente Cloud 35ab6f0f) LA PLATEFORME A REFUSÉ LE COMPTE au clic « Mettre en vente »
// (Beebs : « Vous devez être connecté pour ajouter un produit », alors que le coffre la dit connectée) : update-job-status
// marque la tâche `refus_compte` et sa file attend. « Me connecter » s'ouvre alors DE LUI-MÊME, une fois par refus et par
// appareil, pour que la personne voie et finisse ce que la plateforme lui demande. `lignes` : [{ platform, rc: { le } }]
// (tâches ouvertes portant refus_compte) ; `vus` : { plateforme: le } déjà ouverts sur cet appareil. Rend le refus le plus
// récent pas encore ouvert ({ plateforme, le }), ou null. Un refus de plus de 24 h n'ouvre plus rien. Pure (testée).
export const REFUS_COMPTE_OUVERTURE_MAX_MS = 24 * 3600_000;
// (20/11/2026, ordre de Nico) L'écran ouvert pour un refus DIT quelle plateforme a refusé (avant : « 4 sur 4 connectées »,
// rien d'autre). Court et vrai : la plateforme a refusé le compte au clic « Mettre en vente », sa file attend (retenue par
// le serveur, rien d'annulé). Jamais « Chrome » ni « extension » : c'est l'écran du Cloud. Plateforme inconnue : null.
const NOMS_REFUS = { vinted: 'Vinted', leboncoin: 'Leboncoin', beebs: 'Beebs', depop: 'Depop', opla: 'Opla' };
export function phraseRefusDeCompte(plateforme, lang = 'fr') {
  const nom = NOMS_REFUS[String(plateforme ?? '')];
  if (!nom) return null;
  return lang === 'en'
    ? `${nom} refused your account when listing. Open ${nom} below and do what it asks: your ${nom} listings are waiting, nothing is lost.`
    : `${nom} a refusé ton compte au moment de mettre en vente. Ouvre ${nom} ci-dessous et fais ce qu'elle demande : tes publications ${nom} attendent, rien n'est perdu.`;
}
export function refusCompteAOuvrir(lignes, { vus = {}, maintenant = Date.now() } = {}) {
  let choisi = null;
  for (const l of Array.isArray(lignes) ? lignes : []) {
    const le = String(l?.rc?.le ?? '');
    const t = Date.parse(le);
    const pf = String(l?.platform ?? '');
    if (!pf || !Number.isFinite(t) || maintenant - t > REFUS_COMPTE_OUVERTURE_MAX_MS) continue;
    const dejaVu = Date.parse(String(vus?.[pf] ?? ''));
    if (Number.isFinite(dejaVu) && dejaVu >= t) continue;
    if (!choisi || t > choisi.t) choisi = { plateforme: pf, le, t };
  }
  return choisi ? { plateforme: choisi.plateforme, le: choisi.le } : null;
}

export function ouvrirConnexionToutSeul({ clientCloud = false, lu = false, avancement = null, dejaOuvert = false, demande = false, parcoursEntree = false } = {}) {
  if (!clientCloud || !lu || parcoursEntree || !avancement || avancement.total === 0 || avancement.toutes) return false;
  if (demande) return true;
  return avancement.aucune && !dejaOuvert;
}

const FR = {
  carteTitre: 'Connecte tes comptes pour démarrer FillSell Cloud',
  carteTexte: (a) => (a.connectees > 0
    ? `${a.connectees} sur ${a.total} connectée${a.connectees > 1 ? 's' : ''}. Il reste ${a.aConnecter.map((p) => p.nom).join(', ')} : FillSell Cloud ne peut rien publier ni relever là-bas avant.`
    : `0 sur ${a.total} connectée. Tant que tes comptes ne sont pas connectés, FillSell Cloud ne peut rien publier ni relever.`),
  carteCta: 'Connecter mes comptes',
  avancement: (a) => `${a.connectees} sur ${a.total} connectée${a.connectees > 1 ? 's' : ''}`,
  syncPasConnecte: "Pas encore connecté : connecte tes comptes pour que FillSell Cloud relève tes annonces.",
  syncPfPasConnecte: (nom) => `${nom} : pas encore connecté. Connecte-le pour que FillSell Cloud relève tes annonces.`,
  syncPfAReconnecter: (nom) => `${nom} : connexion à refaire. Reconnecte-le pour que FillSell Cloud relève tes annonces.`,
  lignePasConnecte: 'pas encore connecté',
  murCloud: (nom) => `${nom} n'est pas connecté à FillSell Cloud.`,
  titreCloudPasPris: "FillSell Cloud n'a pas pris la demande",
  texteCloudPasPris: (noms) => `La synchronisation ${noms ? `(${noms}) ` : ''}n'est pas partie : réessaie un peu plus tard.`,
  // (12/11, complément de Nico — cas b695d990) eBay d'un client Cloud se relit par l'API : il faut l'avoir relié.
  syncEbayARelier: "eBay : avec FillSell Cloud, il se relit depuis nos serveurs par sa connexion directe. Relie ton compte eBay à FillSell une seule fois (Réglages › Mes plateformes › eBay), puis appuie sur « Synchroniser ».",
  titreEbayARelier: 'eBay : à relier à FillSell',
};
const EN = {
  carteTitre: 'Connect your accounts to start FillSell Cloud',
  carteTexte: (a) => (a.connectees > 0
    ? `${a.connectees} of ${a.total} connected. Still to connect: ${a.aConnecter.map((p) => p.nom).join(', ')} — FillSell Cloud can't post or read anything there until then.`
    : `0 of ${a.total} connected. Until your accounts are connected, FillSell Cloud can't post or read anything.`),
  carteCta: 'Connect my accounts',
  avancement: (a) => `${a.connectees} of ${a.total} connected`,
  syncPasConnecte: 'Not connected yet: connect your accounts so FillSell Cloud can read your listings.',
  syncPfPasConnecte: (nom) => `${nom}: not connected yet. Connect it so FillSell Cloud can read your listings.`,
  syncPfAReconnecter: (nom) => `${nom}: connection to redo. Reconnect it so FillSell Cloud can read your listings.`,
  lignePasConnecte: 'not connected yet',
  murCloud: (nom) => `${nom} isn't connected to FillSell Cloud.`,
  titreCloudPasPris: "FillSell Cloud didn't pick up the request",
  texteCloudPasPris: (noms) => `The sync ${noms ? `(${noms}) ` : ''}didn't start: try again a little later.`,
  syncEbayARelier: 'eBay: with FillSell Cloud, it is read from our servers through its direct connection. Link your eBay account to FillSell once (Settings › My platforms › eBay), then tap “Sync”.',
  titreEbayARelier: 'eBay: link it to FillSell',
};
export const textesConnexionsCloud = (lang = 'fr') => (lang === 'en' ? EN : FR);

// ── L'ÉTAT PARTAGÉ (publié par l'app, lu au geste par le Stock) ─────────────────────────────────────────────────────
// Une seule lecture (useConnexionsCloud, dans App.jsx) ; les écrans du Stock (Synchroniser, lignes d'avancement) lisent
// le dernier état publié, sans requête de plus. L'app enregistre aussi l'ouvreur de l'écran de connexion.
// ebayApi : profiles.ebay_voie_api LU (true / false), null tant qu'il ne l'est pas (12/11).
const VIDE_PARTAGE = Object.freeze({ clientCloud: false, lu: false, etats: null, isoles: [], avancement: null, ebayApi: null });
let partage = VIDE_PARTAGE;
let ouvreur = null;
const abonnes = new Set();
export function publierConnexionsCloud(e) {
  partage = e ? { ...VIDE_PARTAGE, ...e } : VIDE_PARTAGE;
  for (const f of abonnes) { try { f(); } catch { /* un abonné ne casse pas les autres */ } }
}
export const lireConnexionsCloud = () => partage;
export function abonnerConnexionsCloud(f) { abonnes.add(f); return () => { abonnes.delete(f); }; }
export const poserOuvreurConnexionCloud = (f) => { ouvreur = typeof f === 'function' ? f : null; };

const ID_CLOUD = new Set(CLOUD_PLATEFORMES_CONNEXION.map((p) => p.id));
const NOM_CLOUD = Object.fromEntries(CLOUD_PLATEFORMES_CONNEXION.map((p) => [p.id, p.nom]));

/**
 * La connexion Cloud d'UNE plateforme (pur) : 'connecte' | 'a_connecter' (jamais connectée : aucune ligne au coffre)
 * | 'a_reconnecter' (connectée un jour, tombée) | null (pas un client Cloud lu, ou plateforme hors Cloud : on ne dit rien).
 */
export function connexionCloudDe(e, pf) {
  if (!e?.clientCloud || !e.lu || !ID_CLOUD.has(pf)) return null;
  if ((e.isoles ?? []).includes(pf)) return 'connecte';
  return etatConnexion(e.etats?.[pf]);
}

/**
 * « Synchroniser » doit-il être refusé ? (pur, urgent U4) — null, ou { texte, plateforme }.
 *   · sans plateforme visée (Tout relever) : refusé quand AUCUNE plateforme choisie n'est connectée ;
 *   · une plateforme visée : refusée quand c'est une plateforme du Cloud qui n'est pas connectée — « pas encore
 *     connecté » si elle ne l'a jamais été, « connexion à refaire » si elle est tombée.
 */
export function refusSyncCloud(e, pf = null, lang = 'fr') {
  const T = textesConnexionsCloud(lang);
  if (!e?.clientCloud || !e.lu) return null;
  if (pf == null) {
    const a = e.avancement;
    return a && a.total > 0 && a.aucune ? { texte: T.syncPasConnecte, plateforme: null } : null;
  }
  // (12/11, complément de Nico — cas b695d990) eBay d'un client Cloud : la copie Cloud de l'extension n'a pas eBay, il
  // passe par l'API — non relié à FillSell, la demande attendait un ORDINATEUR et expirait en lui parlant de Chrome.
  // Rien ne part ; le geste est de relier eBay (drapeau LU seulement : jamais sur un « pas encore lu »).
  if (pf === 'ebay') return e.ebayApi === false ? { texte: T.syncEbayARelier, plateforme: 'ebay', geste: 'relier_ebay' } : null;
  const c = connexionCloudDe(e, pf);
  if (c === 'a_connecter') return { texte: T.syncPfPasConnecte(NOM_CLOUD[pf] ?? pf), plateforme: pf };
  if (c === 'a_reconnecter') return { texte: T.syncPfAReconnecter(NOM_CLOUD[pf] ?? pf), plateforme: pf };
  return null;
}

/** Le geste : refusé → l'écran de connexion s'ouvre (ouvreur posé par l'app) et le texte à dire est rendu ; sinon null. */
export function gardeSyncCloud(pf = null, lang = 'fr') {
  let r = null;
  try { r = refusSyncCloud(partage, pf, lang); } catch { return null; }
  if (!r) return null;
  // eBay à relier : l'écran de connexion du Cloud ne relie pas eBay (le texte dit où) — il ne s'ouvre pas.
  if (r.geste !== 'relier_ebay') {
    try { ouvreur?.('synchroniser'); } catch { /* l'écran ne s'ouvre pas : le texte le dit quand même */ }
  }
  return r.texte;
}

/** Ouvre l'écran de connexion (ouvreur posé par l'app) — pour un geste qui a déjà rendu son refus lui-même. */
export function ouvrirConnexionCloud(origine = 'synchroniser') {
  try { ouvreur?.(origine); } catch { /* rien à ouvrir */ }
}

/** Le compte courant est-il un client FillSell Cloud (état publié par l'app) ? Pour les règles pures des textes. */
export const estClientCloud = () => partage.clientCloud === true;
