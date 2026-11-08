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
import { CLOUD_PLATEFORMES_CONNEXION } from '../config/cloudOffer.js';
import { etatConnexion } from './executant.js';

export const CLE_PLATEFORMES_CHOISIES = 'plateformes_vendeur';

/** Les plateformes Cloud à connecter pour CE compte, dans l'ordre du Cloud (pur). */
export function plateformesCloudChoisies(platformSettings, plateformesFermees = []) {
  const brut = platformSettings?.[CLE_PLATEFORMES_CHOISIES];
  const choisies = Array.isArray(brut) ? brut.map(String) : [];
  const cloud = CLOUD_PLATEFORMES_CONNEXION.filter((p) => !plateformesFermees.includes(p.id));
  const parmi = cloud.filter((p) => choisies.includes(p.id));
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

/** La carte s'affiche-t-elle ? (pur) Compte Cloud lu, connexions lues, au moins une plateforme choisie à connecter. */
export const carteConnexionVisible = ({ clientCloud = false, lu = false, avancement = null } = {}) =>
  Boolean(clientCloud && lu && avancement && avancement.total > 0 && !avancement.toutes);

/**
 * L'écran s'ouvre-t-il TOUT SEUL ? (pur) Une fois par essai et par appareil (`dejaOuvert`), ou quand le retour de
 * Stripe le demande (`demande`), tant que RIEN n'est connecté — jamais par-dessus le parcours d'entrée.
 */
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
};
export const textesConnexionsCloud = (lang = 'fr') => (lang === 'en' ? EN : FR);

// ── L'ÉTAT PARTAGÉ (publié par l'app, lu au geste par le Stock) ─────────────────────────────────────────────────────
// Une seule lecture (useConnexionsCloud, dans App.jsx) ; les écrans du Stock (Synchroniser, lignes d'avancement) lisent
// le dernier état publié, sans requête de plus. L'app enregistre aussi l'ouvreur de l'écran de connexion.
const VIDE_PARTAGE = Object.freeze({ clientCloud: false, lu: false, etats: null, isoles: [], avancement: null });
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
  try { ouvreur?.('synchroniser'); } catch { /* l'écran ne s'ouvre pas : le texte le dit quand même */ }
  return r.texte;
}

/** Ouvre l'écran de connexion (ouvreur posé par l'app) — pour un geste qui a déjà rendu son refus lui-même. */
export function ouvrirConnexionCloud(origine = 'synchroniser') {
  try { ouvreur?.(origine); } catch { /* rien à ouvrir */ }
}
