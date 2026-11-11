// ═══════════════════════════════════════════════════════════════════════════
// UN RETRAIT VINTED QUI ATTEND LA CONNEXION REPART DÈS QUE LA CONNEXION EST PROUVÉE (11/11, A1a, défaut D2)
// ═══════════════════════════════════════════════════════════════════════════
// Constat (compte aa957efd, 10/11) : un retrait Vinted sans session porte `attente_connexion`, « Connecte-toi à Vinted
// sur ton ordinateur… » et une échéance à 30 min (update-job-status, observation `verification_boutique_vinted`). La
// sonde a revu la BONNE boutique connectée 11 min après la dernière observation, puis 21 min après ; le retrait attendait
// encore son échéance quand le poste s'est éteint, 4 min avant elle. La levée « preuve de connexion postérieure »
// n'existait que pour `attente_session` (autres plateformes) : le message promettait « le retrait repart tout seul dès que
// tu es connecté », le serveur ne le faisait pas.
//
// RÈGLE : un RETRAIT Vinted qui porte `attente_connexion`, le message « Connecte-toi à … » et une échéance future est
// servi sans son échéance (copie servie seulement, AUCUNE écriture au poll) quand une preuve de connexion est POSTÉRIEURE
// à sa dernière observation (`verification_boutique_vinted.le`). Bornes :
//   · identité EXIGÉE et égale au `vinted_account_id` du job — une sonde « connectée » sans identité (jeton expiré,
//     session ouverte) ne prouve rien ; la preuve la plus récente tranche (une autre boutique lue après → jamais) ;
//   · domaine égal : celui de l'annonce (listing_url) et celui de la session (`vinted_identite.domaine`, que la sonde ne
//     dit que hors vinted.fr — absent = vinted.fr) ; l'un des deux illisible → jamais ;
//   · preuves : sonde (`extension_sessions.vinted_identite`, datée par `checked_at_par_plateforme.vinted`), relevé du
//     dressing (`vinted_sync_runs.vinted_user_id`, `started_at`), capture (boutique lue sur la page, `lu_le`), boutique
//     dite par CE poste à son poll (`extension_postes[poste].vinted_user_id`, `vinted_le`) ;
//   · compte au Cloud (actif ou poste Cloud) ou à plusieurs postes vivants : seule la preuve du poste qui poll ;
//   · retraits seulement (une republication garde sa cadence) ;
//   · 6 levées au plus par retrait et par 24 h : la copie servie porte `levee_connexion` ; update-job-status la retire du
//     corps reçu et la compte dans `verification_boutique_vinted.levees_connexion` à l'observation suivante (l'écriture
//     qu'il fait déjà). Une nouvelle levée exige une preuve plus récente que cette nouvelle observation.
// Pur (Node + Deno) : scripts/attente-connexion-revenue-selftest.mjs.

export const LEVEES_CONNEXION_MAX = 6;
export const LEVEES_CONNEXION_FENETRE_MS = 24 * 3600_000;
export const MARQUE_LEVEE_CONNEXION = "levee_connexion";
export const MESSAGE_CONNEXION_RE = /^Connecte-toi à /i;
// « Vivant » : même fenêtre que le routage des tâches par poste (_shared/poste-extension.ts, POSTE_VIVANT_ROUTAGE_MS).
export const POSTE_VIVANT_MS = 15 * 60_000;
// Une date « dans le futur » de plus d'une minute est une horloge fausse, jamais une preuve.
const AVANCE_TOLEREE_MS = 60_000;

/** @typedef {{ source: string, userId: string, at: number }} Preuve */

/** @param {unknown} v */
const t = (v) => { const x = Date.parse(String(v ?? "")); return Number.isFinite(x) ? x : NaN; };
const objet = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : null);
const idVinted = (v) => { const s = String(v ?? "").trim(); return /^\d{2,15}$/.test(s) ? s : ""; };

/**
 * « vinted.fr », « vinted.it »… depuis une adresse ou un hôte ; null si ce n'est pas un domaine Vinted lisible.
 * @param {unknown} v
 * @returns {string | null}
 */
export function domaineVinted(v) {
  let hote = String(v ?? "").trim().toLowerCase();
  if (!hote) return null;
  if (/^[a-z][a-z0-9+.-]*:\/\//.test(hote)) {
    try { hote = new URL(hote).hostname; } catch { return null; }
  }
  hote = hote.replace(/^www\./, "").replace(/\.$/, "");
  return /^vinted\.(?:[a-z]{2,3}|co\.uk)$/.test(hote) ? hote : null;
}

/**
 * Le domaine de la session Vinted lue par la sonde (absent = vinted.fr, contrat de l'extension ≥ 0.6.106) ; null sans identité lue.
 * @param {Record<string, unknown> | null | undefined} sessions
 * @returns {string | null}
 */
export function domaineDeLaSession(sessions) {
  const vi = objet(objet(sessions)?.vinted_identite);
  if (!vi || !idVinted(vi.user_id)) return null;
  return vi.domaine == null || String(vi.domaine).trim() === "" ? "vinted.fr" : domaineVinted(vi.domaine);
}

/**
 * Un RETRAIT Vinted qui attend la connexion (marqueur + message) avec une échéance future et une observation datée.
 * @param {Record<string, any>} job
 * @param {number} [maintenant]
 * @returns {boolean}
 */
export function retraitEnAttenteDeConnexion(job, maintenant = Date.now()) {
  if (String(job?.action ?? "") !== "delete" || String(job?.platform ?? "") !== "vinted") return false;
  const pf = objet(job?.platform_fields);
  const att = objet(pf?.attente_connexion);
  if (!att || (att.platform != null && String(att.platform) !== "vinted")) return false;
  if (!MESSAGE_CONNEXION_RE.test(String(job?.error ?? ""))) return false;
  const echeance = t(pf.next_action_after);
  if (!Number.isFinite(echeance) || echeance <= maintenant) return false;
  return Number.isFinite(t(objet(pf.verification_boutique_vinted)?.le));
}

/**
 * Les levées déjà comptées pour ce retrait dans les dernières 24 h (dates en ms, triées).
 * @param {Record<string, any> | null | undefined} pf
 * @param {number} [maintenant]
 * @returns {number[]}
 */
export function leveesRecentes(pf, maintenant = Date.now()) {
  const liste = objet(objet(pf)?.verification_boutique_vinted)?.levees_connexion;
  return (Array.isArray(liste) ? liste : []).map(t)
    .filter((x) => Number.isFinite(x) && x > maintenant - LEVEES_CONNEXION_FENETRE_MS && x <= maintenant + AVANCE_TOLEREE_MS)
    .sort((a, b) => a - b);
}

/**
 * Les preuves d'identité Vinted disponibles, chacune { source, userId, at }. `sessions` = profiles.extension_sessions ;
 * `run` = dernier relevé du dressing ({ vinted_user_id, started_at }) ; `capture` = boutique lue sur la page par la
 * dernière capture ({ session, lu_le }) ; `poste` = CE poste tel qu'il est après son poll ({ vinted_user_id, vinted_le }).
 * @param {{ sessions?: Record<string, any> | null, run?: Record<string, any> | null, capture?: Record<string, any> | null,
 *           poste?: Record<string, any> | null }} [p]
 * @returns {Preuve[]}
 */
export function preuvesConnexionVinted({ sessions = null, run = null, capture = null, poste = null } = {}) {
  const out = [];
  const s = objet(sessions);
  const vi = objet(s?.vinted_identite);
  if (s && vi && s.vinted !== false) {
    const par = objet(s.checked_at_par_plateforme);
    out.push({ source: "sonde", userId: idVinted(vi.user_id), at: t(par ? par.vinted : s.checked_at) });
  }
  const r = objet(run);
  if (r) out.push({ source: "releve_dressing", userId: idVinted(r.vinted_user_id), at: t(r.started_at) });
  const c = objet(capture);
  if (c) out.push({ source: "capture", userId: idVinted(c.session), at: t(c.lu_le) });
  const p = objet(poste);
  if (p) out.push({ source: "poste", userId: idVinted(p.vinted_user_id), at: t(p.vinted_le) });
  return out.filter((x) => x.userId && Number.isFinite(x.at));
}

/**
 * Seule la preuve du poste qui poll compte-t-elle ? Oui pour un poste Cloud, un compte au Cloud actif (ou dont le drapeau
 * n'a pas pu être lu : on ne devine pas), un compte à plusieurs postes vivants.
 * @param {{ posteCloud?: boolean, cloudVoie?: boolean | null, postes?: Record<string, any> | null, maintenant?: number }} [p]
 * @returns {boolean}
 */
export function preuveDuSeulPoste({ posteCloud = false, cloudVoie = null, postes = null, maintenant = Date.now() } = {}) {
  if (posteCloud) return true;
  if (cloudVoie !== false) return true;
  const vivants = Object.values(objet(postes) ?? {}).filter((p) => {
    const le = t(objet(p)?.le);
    return Number.isFinite(le) && maintenant - le < POSTE_VIVANT_MS;
  });
  return vivants.length >= 2;
}

/**
 * La décision pour UN job. ctx = { preuves, domaineSession, posteSeul, maintenant }.
 * Rend { lever: true, preuve } ou { lever: false, motif }.
 * @param {Record<string, any>} job
 * @param {{ preuves?: Preuve[], domaineSession?: string | null, posteSeul?: boolean, maintenant?: number }} [ctx]
 * @returns {{ lever: boolean, motif: string, preuve: Preuve | null }}
 */
export function decisionConnexionRevenue(job, { preuves = [], domaineSession = null, posteSeul = true, maintenant = Date.now() } = {}) {
  if (!retraitEnAttenteDeConnexion(job, maintenant)) return { lever: false, motif: "hors_champ", preuve: null };
  const pf = job.platform_fields;
  const compte = idVinted(pf.vinted_account_id);
  if (!compte) return { lever: false, motif: "boutique_du_retrait_inconnue", preuve: null };
  const domaineAnnonce = domaineVinted(job.listing_url);
  if (!domaineAnnonce || !domaineSession) return { lever: false, motif: "domaine_illisible", preuve: null };
  if (domaineAnnonce !== domaineSession) return { lever: false, motif: "autre_domaine", preuve: null };
  if (leveesRecentes(pf, maintenant).length >= LEVEES_CONNEXION_MAX) return { lever: false, motif: "plafond_24h", preuve: null };
  const depuis = t(pf.verification_boutique_vinted.le);
  const admises = (preuves ?? [])
    .filter((x) => (!posteSeul || x.source === "poste") && x.at <= maintenant + AVANCE_TOLEREE_MS)
    .sort((a, b) => b.at - a.at);
  const derniere = admises[0];
  if (!derniere || derniere.at <= depuis) return { lever: false, motif: posteSeul ? "aucune_preuve_du_poste" : "aucune_preuve_posterieure", preuve: null };
  if (derniere.userId !== compte) return { lever: false, motif: "autre_boutique", preuve: null };
  return { lever: true, motif: "connexion_revenue", preuve: derniere };
}

/**
 * Le job tel qu'il part : sans l'échéance, avec la marque comptée par update-job-status. La base ne change pas.
 * @param {Record<string, any>} job
 * @param {Preuve | null} preuve
 * @param {number} [maintenant]
 * @returns {Record<string, any>}
 */
export function retraitServiConnexionRevenue(job, preuve, maintenant = Date.now()) {
  const pf = { ...(job?.platform_fields ?? {}) };
  delete pf.next_action_after;
  pf[MARQUE_LEVEE_CONNEXION] = {
    le: new Date(maintenant).toISOString(),
    preuve: String(preuve?.source ?? ""),
    preuve_le: Number.isFinite(preuve?.at) ? new Date(preuve.at).toISOString() : null,
    par: "get-pending-jobs",
  };
  return { ...job, platform_fields: pf };
}

/**
 * update-job-status, à l'observation suivante : les levées à garder dans `verification_boutique_vinted.levees_connexion`
 * — celles de la base (`avant`, 24 h) plus la marque reçue dans le corps (`marque`), une fois. 6 dates au plus.
 * @param {Record<string, any> | null | undefined} avant
 * @param {unknown} marque
 * @param {number} [maintenant]
 * @returns {string[]}
 */
export function leveesApresObservation(avant, marque, maintenant = Date.now()) {
  const dates = leveesRecentes({ verification_boutique_vinted: objet(avant) ?? {} }, maintenant);
  const le = t(objet(marque)?.le);
  if (Number.isFinite(le) && le > maintenant - LEVEES_CONNEXION_FENETRE_MS && le <= maintenant + AVANCE_TOLEREE_MS
    && !dates.includes(le)) dates.push(le);
  return dates.sort((a, b) => a - b).slice(-LEVEES_CONNEXION_MAX).map((x) => new Date(x).toISOString());
}
