// LE FILET DE CAPACITÉ (13/11/2026, décision de Nico, point 2) — mot pour mot : « si le Cloud approche de sa capacité,
// les essais au renouvellement coupé passent en dernier dans la file. Au-delà, ils s'arrêtent avec un message clair.
// Rien de ce filet ne joue tant qu'on est loin du seuil. »
//
// Un « essai coupé » : essai Cloud EN COURS (cloud_essai_debut <= maintenant < cloud_essai_fin, cloud_essai_arrete pas
// vrai), Cloud pas payé (is_cloud pas vrai), renouvellement coupé (cloud_arret_fin_periode = true) — il garde son Cloud
// jusqu'à la fin de l'essai (cloud_etat en prod le garde actif), puis s'arrête seul. (13/11, réponse de Nico : « les essais
// au renouvellement coupé », sans exception) Un pack en essai (cloud_formule, is_pro par le pack) et un Cloud seul en essai à
// côté d'une formule payée en sont aussi : le filet n'arrête QUE le Cloud (cloud_essai_arrete / cloud_essai_fin), jamais le
// palier. ⛔ Jamais un Cloud payé (is_cloud) ni un compte offert (is_comped).
//
// Les trois niveaux (niveauFilet, pure), sur la capacité RÉELLE du serveur — la même que l'alerte de capacité
// (flotte.js) : la capacité ATTEIGNABLE mesurée (cloud_capacite_mesures) en capacité automatique, NAVIGATEURS_MAX sinon :
//   · « loin »  : comptes servis < 80 % de la capacité réelle → RIEN ne change (aucune lecture de plus, même décision) ;
//   · « file »  : >= 80 % → les essais coupés passent APRÈS tous les autres comptes (planificateur.js, `derniers`) ;
//   · « arret » : >= 100 % ET plus aucune place libre dans la flotte (cloud_places_libres, rendu par le battement) →
//                 autant d'essais coupés qu'il faut pour rouvrir UNE place sont arrêtés (fin d'essai la plus proche
//                 d'abord, au plus FILET_ARRETS_MAX_PAR_TOUR par tour, jamais pendant une tâche ni un « Me connecter »).
// Réglables sans déploiement : coin_config cloud_filet_file_pct (80) et cloud_filet_arret_pct (100 ; 0 = aucun arrêt),
// relus par la flotte toutes les 10 min (flotte.js, reglages) ; absents = ces défauts.
//
// L'ARRÊT (arreterEssaiCoupe) : la représentation EXISTANTE d'un essai arrêté (cloud-option.js : « arrêter l'essai =
// effet immédiat, rien facturé ») — profiles.cloud_essai_arrete = true, cloud_essai_fin = l'instant de l'arrêt —, écrite
// par UNE mise à jour CONDITIONNELLE (toutes les gardes dans le WHERE : un paiement ou une reprise du renouvellement
// arrivés entre la lecture et l'écriture l'annulent). Le déclencheur profiles_cloud_pool (cloud_compte_synchroniser)
// libère l'IP (essai arrêté = sans grâce) et rend la voie ; le compte sort de cloud_comptes_a_servir : sa place est libre.
// Rien chez Stripe, Apple ni Google ; aucun mail client. LE MESSAGE pour l'app : profiles.platform_settings.cloud_arret
// = { cause: 'cloud_complet', le, essai_fin_prevue, v: 1 } (platform_settings_fusionner, comme cloud_verification).

export const FILET_FILE_PCT = 80;            // = SEUIL_CAPACITE_PCT (flotte.js) : l'alerte support@ et le filet partent ensemble
export const FILET_ARRET_PCT = 100;          // plus aucune place réelle
// (13/11/2026 soir, décision de Nico — « une place à la fois ») UN arrêt par tour au plus (un tour par minute).
export const FILET_ARRETS_MAX_PAR_TOUR = 1;
export const CAUSE_ARRET_FILET = 'cloud_complet';
const COLONNES_PROFIL = 'id, is_cloud, is_comped, cloud_essai_debut, cloud_essai_fin, cloud_essai_arrete, cloud_arret_fin_periode';

const instant = (v) => {
  if (v == null || v === '') return null;
  const t = v instanceof Date ? v.getTime() : typeof v === 'number' ? v : Date.parse(v);
  return Number.isFinite(t) ? t : null;
};
const entierOuNull = (v) => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));

/** Les deux réglages du filet lus dans coin_config (pure) ; une valeur hors bornes = le défaut. */
export function reglagesFilet(v = {}) {
  const file = entierOuNull(v.cloud_filet_file_pct);
  const arret = entierOuNull(v.cloud_filet_arret_pct);
  return {
    filePct: file != null && file >= 10 && file <= 100 ? file : FILET_FILE_PCT,
    arretPct: arret === 0 ? 0 : arret != null && arret >= 50 && arret <= 200 ? arret : FILET_ARRET_PCT,
  };
}

/**
 * Le niveau du filet (pure : testée). `comptes` = comptes servis par CE serveur ; `capaciteReelle` = capacité réelle de
 * CE serveur ; `placesLibres` = places libres de la FLOTTE (null = inconnu : jamais d'arrêt). Rend { niveau, taux,
 * seuilFile, seuilArret, aLiberer }.
 */
export function niveauFilet({ comptes, capaciteReelle, placesLibres = null, filePct = FILET_FILE_PCT, arretPct = FILET_ARRET_PCT } = {}) {
  const n = entierOuNull(comptes);
  const c = entierOuNull(capaciteReelle);
  if (n == null || c == null || c <= 0) return { niveau: 'loin', raison: 'capacite_inconnue', aLiberer: 0 };
  const taux = Math.round((100 * n) / c);
  const seuilFile = Math.max(1, Math.ceil((c * (Number(filePct) || FILET_FILE_PCT)) / 100));
  const seuilArret = Number(arretPct) > 0 ? Math.max(1, Math.ceil((c * Number(arretPct)) / 100)) : null;
  const base = { taux, comptes: n, capaciteReelle: c, seuilFile, seuilArret, placesLibres: entierOuNull(placesLibres) };
  if (n < seuilFile) return { ...base, niveau: 'loin', aLiberer: 0 };
  const plein = seuilArret != null && n >= seuilArret && base.placesLibres != null && base.placesLibres <= 0;
  if (!plein) return { ...base, niveau: 'file', aLiberer: 0 };
  return { ...base, niveau: 'arret', aLiberer: n - seuilArret + 1 };
}

/** Un essai au renouvellement coupé, d'après les colonnes du profil (pure : testée). */
export function estEssaiCoupe(p, maintenant = Date.now()) {
  const now = instant(maintenant) ?? Date.now();
  const debut = instant(p?.cloud_essai_debut);
  const fin = instant(p?.cloud_essai_fin);
  if (p?.is_cloud === true || p?.is_comped === true) return false;                               // Cloud payé, offert : jamais
  if (p?.cloud_arret_fin_periode !== true) return false;                                         // renouvellement actif : jamais
  return debut != null && fin != null && debut <= now && now < fin && p?.cloud_essai_arrete !== true;
}

/**
 * Les essais coupés à arrêter (pure : testée) : jamais un compte dont une tâche est EN COURS ni dont l'écran « Me
 * connecter » est ouvert ; la fin d'essai la plus proche d'abord (il perd le moins) ; au plus min(aLiberer, max).
 */
export function choisirArrets({ coupes = new Map(), aLiberer = 0, max = FILET_ARRETS_MAX_PAR_TOUR, enCours = new Set(), connexions = new Set() } = {}) {
  const k = Math.max(0, Math.min(Math.floor(Number(aLiberer) || 0), Math.floor(Number(max) || 0)));
  if (!k) return [];
  return [...coupes.entries()]
    .filter(([u]) => !enCours.has(u) && !connexions.has(u))
    .sort(([ua, a], [ub, b]) => (instant(a?.cloud_essai_fin) ?? Infinity) - (instant(b?.cloud_essai_fin) ?? Infinity) || String(ua).localeCompare(String(ub)))
    .slice(0, k)
    .map(([u]) => u);
}

/** Les essais coupés parmi ces comptes : UNE lecture bornée (clé primaire, au plus la capacité du serveur). */
export async function lireEssaisCoupes(base, users, maintenant = Date.now()) {
  const ids = [...new Set((users ?? []).filter(Boolean))];
  if (!ids.length) return new Map();
  const { data, error } = await base.from('profiles').select(COLONNES_PROFIL).in('id', ids).limit(ids.length);
  if (error) throw new Error(`profiles (filet) : ${error.message}`);
  return new Map((data ?? []).filter((p) => estEssaiCoupe(p, maintenant)).map((p) => [p.id, p]));
}

/**
 * ARRÊTE un essai coupé : mise à jour conditionnelle de profiles (toutes les gardes dans le WHERE), puis le message de
 * l'app. Rend { arrete: false, raison } quand l'état a changé entre la lecture et l'écriture (rien n'est écrit).
 */
export async function arreterEssaiCoupe({ base, user, essaiFinPrevue = null, maintenant = Date.now() }) {
  const le = new Date(instant(maintenant) ?? Date.now()).toISOString();
  const { data, error } = await base.from('profiles')
    .update({ cloud_essai_arrete: true, cloud_essai_fin: le })
    .eq('id', user).eq('cloud_essai_arrete', false).eq('cloud_arret_fin_periode', true)
    .not('is_cloud', 'is', true).not('is_comped', 'is', true)
    .lte('cloud_essai_debut', le).gt('cloud_essai_fin', le)
    .select('id');
  if (error) throw new Error(`profiles (arrêt du filet) : ${error.message}`);
  if (!(data ?? []).length) return { arrete: false, raison: 'etat_change' };
  const message = { cause: CAUSE_ARRET_FILET, le, essai_fin_prevue: essaiFinPrevue ?? null, v: 1 };
  const m = await base.rpc('platform_settings_fusionner', { p_chemin: ['cloud_arret'], p_patch: message, p_user: user });
  return { arrete: true, le, message, messageEcrit: !m?.error, erreurMessage: m?.error?.message ?? null };
}

const id8 = (u) => String(u ?? '').slice(0, 8);
const dateParis = (iso) => {
  const t = instant(iso);
  return t == null ? '?' : new Date(t).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
};

/** Le texte de l'alerte support@ (pure : testée) — comptes par id8, heure de Paris. Le début reste fixe (rappel par heure). */
export function texteAlerteFilet({ serveur, niveau, arretes = [], coupesEnAttente = 0 }) {
  const etat = `${niveau.comptes} comptes pour une capacité réelle de ${niveau.capaciteReelle} (${niveau.taux} %)`;
  if (niveau.niveau === 'arret' && arretes.length) {
    return `Filet de capacité — arrêt sur ${serveur} : ${arretes.length} essai(s) au renouvellement coupé arrêté(s) `
      + `(${arretes.map((a) => `${id8(a.user)}, fin prévue le ${dateParis(a.essaiFinPrevue)}`).join(' ; ')}) — ${etat}, `
      + `aucune place libre. Place et IP libérées ; rien n'est prélevé ; aucun mail client ; message dans l'app (platform_settings.cloud_arret).`;
  }
  return `Filet de capacité — file sur ${serveur} : ${coupesEnAttente} essai(s) au renouvellement coupé passent après les autres comptes — ${etat}. `
    + 'Aucun essai arrêté.';
}
