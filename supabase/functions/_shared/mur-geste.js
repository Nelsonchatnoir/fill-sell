// ═══════════════════════════════════════════════════════════════════════════
// UN MUR QUI DEMANDE UN GESTE SE MONTRE (02/10 soir, point 4)
// ═══════════════════════════════════════════════════════════════════════════
// Règle de Nico : « dès qu'un job ne peut avancer QUE par un geste de
// l'utilisateur (vérification à résoudre, reconnexion), l'utilisateur doit le
// voir (needs_user, message court), au lieu d'une attente silencieuse. Un
// simple retard, ou un anti-robot qui se lève tout seul, reste une attente
// sans alarme. »
// Cas fondateurs :
//   · 9cdr9rm4rn a6692748 (Beebs) : le pré-vol rendait « CHALLENGE DATADOME :
//     Beebs affiche une vérification anti-robot… résoudre la vérification » —
//     rangé « illisible », pending, `error` vide, repris toutes les 30 min ;
//   · xxewwer : 7 republications Leboncoin pending depuis le 02/10 06:00,
//     session Leboncoin fermée (« le titre n'est plus au rendez-vous » / mur) ;
//   · gabyaviat10700 : pause anti-robot Vinted du compte depuis le 17/09.
// Ce qui distingue le geste du retard : la PERSISTANCE, mesurée sur des
// observations distinctes (jamais une seule) :
//   · connexion : l'attente de session (page qui montre le mur de connexion)
//     observée 3 fois (barème 3, 6, 10 min : ~20 min) → « Connexion X
//     requise » — début de phrase lu par relancer_jobs_connexion (sonde ou
//     relevé réussi : relance automatique, déclencheurs en base) et par
//     handler-watch ;
//   · vérification anti-robot à résoudre : le même challenge vu à 2 essais
//     distants d'au moins 25 min (un challenge qui se lève passe au second) →
//     needs_user `verification_antirobot` ; handler-watch le relance quand la
//     sonde revoit la plateforme répondre.
// L'annonce n'est jamais touchée : ces murs tombent AVANT tout retrait, sauf
// à l'étape 'deleted' (recréation) où le message le dit.
// Pur (Deno + Node).

import { ATTENTE_SESSION_RE } from "./attente-session.js";

const NOM = { vinted: "Vinted", leboncoin: "Leboncoin", ebay: "eBay", beebs: "Beebs", opla: "Opla", depop: "Depop" };
const SITE = { vinted: "vinted.fr", leboncoin: "leboncoin.fr", ebay: "ebay.fr", beebs: "beebs.app", opla: "opla.co", depop: "depop.com" };

export const CONNEXION_OBSERVATIONS_MIN = 3;
export const ANTIROBOT_OBSERVATIONS_MIN = 2;
export const ANTIROBOT_ECART_MIN_MS = 25 * 60_000;

/** Un challenge à RÉSOUDRE (pas un 403 muet) : ce que nos handlers écrivent. */
const CHALLENGE_RE = /CHALLENGE DATADOME|v[ée]rification anti-?robot|captcha|r[ée]soudre la v[ée]rification/i;

const ms = (v) => { const t = Date.parse(String(v ?? "")); return Number.isFinite(t) ? t : NaN; };

/**
 * L'observation de challenge que porte le job (texte + heure), ou null.
 * Sources : pré-vol de formulaire (Beebs), pré-vol de page (Leboncoin).
 * @param {Record<string, any>} pf
 */
export function observationChallenge(pf) {
  const p = pf && typeof pf === "object" ? pf : {};
  const pv = p.republish_prevol_formulaire;
  if (pv && typeof pv === "object" && pv.verdict !== "ok" && CHALLENGE_RE.test(String(pv.detail ?? ""))) {
    const t = ms(pv.at);
    if (Number.isFinite(t)) return { at: t, texte: String(pv.detail).slice(0, 200), source: "prevol_formulaire" };
  }
  const pp = p.republish_prevol_page;
  if (pp && typeof pp === "object" && CHALLENGE_RE.test(String(pp.mur ?? ""))) {
    const t = ms(pp.at);
    if (Number.isFinite(t)) return { at: t, texte: String(pp.mur).slice(0, 200), source: "prevol_page" };
  }
  // (03/10, point 23 — nivake03 0b54edbc) La RECRÉATION Vinted reportée parce
  // que Vinted ne dit plus qui est connecté (« identité Vinted illisible ») :
  // session à rouvrir ou vérification à passer, à l'étape où l'annonce est
  // HORS LIGNE. Reportée de 5 min en 5 min depuis le 29/09 — quatre jours
  // hors ligne, et l'app disait « hors ligne quelques minutes ».
  const pr = p.gardes && typeof p.gardes === "object" ? p.gardes.prevol_recreation : null;
  if (pr && typeof pr === "object" && pr.verdict === "report" && RECREATION_BLOQUEE_RE.test(String(pr.detail ?? ""))) {
    const t = ms(pr.at);
    if (Number.isFinite(t)) return { at: t, texte: String(pr.detail).slice(0, 200), source: "prevol_recreation" };
  }
  return null;
}

/** Ce que le pré-vol de recréation écrit quand Vinted ne dit plus qui est connecté. */
const RECREATION_BLOQUEE_RE = /identit[ée] Vinted illisible/i;

/** Le message de la recréation bloquée : la date du retrait, le geste, la suite. */
export function messageRecreationBloquee(platform, deletedAt) {
  const nom = NOM[platform] ?? platform;
  const t = ms(deletedAt);
  const le = Number.isFinite(t)
    ? new Date(t).toLocaleDateString("fr-FR", { timeZone: "Europe/Paris", day: "numeric", month: "long" })
    : null;
  return `${nom} ne répond plus à FillSell sur ton ordinateur : ouvre ${SITE[platform] ?? nom} dans Chrome, connecte-toi si ${nom} te le demande ` +
    `et passe la vérification si elle s'affiche. Ton annonce${le ? `, retirée le ${le},` : ""} sera remise en ligne toute seule ensuite.`;
}

// (05/10) Pour un RETRAIT, « Ton annonce est intacte » était faux et
// dangereux : l'article est vendu et son annonce reste en ligne tant que le
// geste n'est pas fait (Joséphine, 8 retraits Opla). La fin de phrase le dit.
// (15/10, lot C — Hassan Said) Pour une PUBLICATION, il n'y a pas encore
// d'annonce : « Ton annonce est intacte » était faux (« Connexion Beebs
// requise… Ton annonce est intacte » sur ses dépôts Beebs).
function suiteDuMessage(platform, { etapeRetiree = false, retrait = false, publication = false } = {}) {
  const nom = NOM[platform] ?? platform;
  if (retrait) {
    return `Ton article est vendu mais son annonce est encore en ligne sur ${nom} (risque de double vente) : ` +
      "FillSell la retire tout seul dès que c'est fait.";
  }
  if (publication) return "Rien n'a été publié ; tout repartira tout seul ensuite.";
  return etapeRetiree ? "Ton annonce sera remise en ligne toute seule ensuite." : "Ton annonce est intacte ; tout repartira tout seul ensuite.";
}

/** Le message « connexion » — début de phrase partagé (relancer_jobs_connexion, handler-watch, app). */
export function messageConnexionRequise(platform, opts = {}) {
  const nom = NOM[platform] ?? platform;
  // (11/10, Nico) Depop : « connecte-toi à Depop sur ton ordinateur », point —
  // ni navigateur ni onglet. Le début « Connexion Depop requise » reste : c'est
  // lui que reconnaissent le serveur et l'app (bouton « Me connecter »).
  if (platform === "depop") return `Connexion ${nom} requise : connecte-toi à ${nom} sur ton ordinateur. ` + suiteDuMessage(platform, opts);
  return `Connexion ${nom} requise : reconnecte-toi à ${nom} dans Chrome, sur ton ordinateur. ` + suiteDuMessage(platform, opts);
}

/** Le message « vérification à résoudre ». */
export function messageVerificationAntirobot(platform, opts = {}) {
  const nom = NOM[platform] ?? platform;
  return `${nom} te demande une vérification anti-robot : ouvre ${SITE[platform] ?? nom} dans Chrome et fais la vérification. ` +
    suiteDuMessage(platform, opts);
}

/**
 * (05/10) Un retrait bloqué par une CONNEXION à la plateforme : en attente de
 * session, ou mur « Connexion X requise » posé. handler-watch ne le solde
 * jamais (l'annonce d'un article vendu resterait en ligne sans plus aucun
 * signal) ; l'app le montre en tête du Stock.
 */
export function retraitBloqueParConnexion(job) {
  if (job?.action !== "delete") return false;
  const pf = (job?.platform_fields && typeof job.platform_fields === "object") ? job.platform_fields : {};
  const err = String(job?.error ?? "");
  if (job?.status === "pending") return Boolean(pf.attente_session) && ATTENTE_SESSION_RE.test(err);
  if (job?.status !== "needs_user") return false;
  return pf.needs_user_source === "connexion" || pf.mur_geste?.type === "connexion"
    || /^(Connexion|Reconnexion) \S+ requise/.test(err) || ATTENTE_SESSION_RE.test(err);
}

/**
 * Le verdict pour un job en file.
 * @param {{ platform?: string, action?: string, error?: string|null, platform_fields?: Record<string, any>|null }} job
 * @returns {{ geste: null|'connexion'|'verification_antirobot', message?: string, pf: Record<string, any>, change: boolean }}
 */
export function jugerMurGeste(job) {
  const pf0 = (job?.platform_fields && typeof job.platform_fields === "object") ? job.platform_fields : {};
  const pf = { ...pf0 };
  const plat = String(job?.platform ?? "");
  const etapeRetiree = job?.action === "republish" && pf.republish_step === "deleted";
  const retrait = job?.action === "delete";
  const publication = job?.action === "publish";
  // 1. Connexion : l'attente de session, nommée par la page, persistante.
  const att = pf.attente_session;
  if (att && typeof att === "object" && ATTENTE_SESSION_RE.test(String(job?.error ?? ""))
      && (Number(att.observations) || 0) >= CONNEXION_OBSERVATIONS_MIN) {
    pf.mur_geste = { type: "connexion", le: new Date().toISOString(), depuis: att.depuis ?? null, observations: Number(att.observations) || 0 };
    pf.needs_user_source = "connexion";
    return { geste: "connexion", message: messageConnexionRequise(plat, { etapeRetiree, retrait, publication }), pf, change: true };
  }
  // 2. Challenge à résoudre : compté par observation distincte.
  const obs = observationChallenge(pf);
  if (!obs) {
    if (pf.mur_antirobot) { delete pf.mur_antirobot; return { geste: null, pf, change: true }; }
    return { geste: null, pf, change: false };
  }
  const m = (pf.mur_antirobot && typeof pf.mur_antirobot === "object") ? { ...pf.mur_antirobot } : {};
  const derniere = ms(m.derniere_obs);
  let change = false;
  if (!Number.isFinite(derniere) || obs.at > derniere) {
    m.depuis = Number.isFinite(ms(m.depuis)) ? m.depuis : new Date(obs.at).toISOString();
    m.derniere_obs = new Date(obs.at).toISOString();
    m.observations = (Number(m.observations) || 0) + 1;
    m.source = obs.source;
    pf.mur_antirobot = m;
    change = true;
  }
  const ecart = ms(m.derniere_obs) - ms(m.depuis);
  if ((Number(m.observations) || 0) >= ANTIROBOT_OBSERVATIONS_MIN && ecart >= ANTIROBOT_ECART_MIN_MS) {
    pf.mur_geste = { type: "verification_antirobot", le: new Date().toISOString(), depuis: m.depuis, observations: m.observations, texte: obs.texte };
    pf.needs_user_source = "verification_antirobot";
    const message = obs.source === "prevol_recreation"
      ? messageRecreationBloquee(plat, pf.deleted_at ?? pf.deleted_at_serveur ?? null)
      : messageVerificationAntirobot(plat, { etapeRetiree, retrait, publication });
    return { geste: "verification_antirobot", message, pf, change: true };
  }
  return { geste: null, pf, change };
}

// ── VINTED : LA PAUSE ANTI-ROBOT DU COMPTE QUI NE SE LÈVE PAS ───────────────
// (gabyaviat10700 : en pause depuis le 17/09, sonde 403 sans interruption.)
// La pause du compte (get-pending-jobs) garde UN job « sonde » servi, qui
// re-teste Vinted ; les autres attendent. Au-delà de 6 h sans levée, ce n'est
// plus un retard : les jobs en pause passent à la personne (le job sonde,
// lui, continue de tester). handler-watch les relance quand la sonde de
// sessions revoit Vinted répondre.
export const PAUSE_VINTED_GESTE_MS = 6 * 3600_000;
// (15/10, lot C — carhoa) « depuis plusieurs heures » était faux : deux refus à
// trois minutes d'écart, puis l'ordinateur éteint six heures. On dit ce qu'on
// a VU (le premier refus, daté), et la fin de phrase suit l'action.
// `opts` : { depuis: ISO du premier refus, publication, etapeRetiree, retrait }.
export function messagePauseVintedGeste(opts = {}) {
  const t = ms(opts?.depuis);
  const quand = Number.isFinite(t)
    ? ` depuis le ${new Date(t).toLocaleDateString("fr-FR", { timeZone: "Europe/Paris", day: "2-digit", month: "2-digit" })} à ${new Date(t).toLocaleTimeString("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit" })}`
    : "";
  return `Vinted refuse l'accès à tes annonces${quand} : ouvre vinted.fr dans Chrome, connecte-toi si Vinted te le demande ` +
    "et passe la vérification si elle s'affiche. " + suiteDuMessage("vinted", opts);
}

// ── (15/10, lot C — carhoa) UN 403 VINTED SANS CONNEXION N'EST PAS UN ANTI-ROBOT ──
// carhoa : 17 republications passées « Vinted bloque tes actions… vérification
// anti-robot » alors que le relevé de 01:32 avait LU les cookies du navigateur
// et n'y avait trouvé AUCUNE session (marqueur « [cause403] session_absente »,
// cookie v_uid posé par la connexion Vinted, background.js classifierCause403).
// Un 403 seul ne dit ni « bloqué » ni « déconnecté » ; ce cookie, lui, tranche.
// Connexion PROUVÉE absente = le dernier relevé Vinted fini porte ce marqueur,
// dans les 24 h, et rien n'a marché sur Vinted depuis (ni dépôt, ni sonde qui
// revoit Vinted répondre). Alors le geste est « Connexion Vinted requise » (le
// début de phrase que relancer_jobs_connexion et l'app reconnaissent), et le
// job repart seul à la reconnexion — jamais « vérification anti-robot ».
export const CAUSE403_SESSION_ABSENTE_RE = /\[cause403\]\s*session_absente/i;
/**
 * @param {{ runs?: Array<{ status?: string, erreur?: string|null, started_at?: string, finished_at?: string|null }>,
 *           dernierSucces?: number, sessions?: Record<string, any>|null, maintenant?: number }} p
 * @returns {{ prouvee: boolean, le: string|null }}
 */
export function connexionVintedAbsenteProuvee({ runs = [], dernierSucces = -Infinity, sessions = null, maintenant = Date.now() } = {}) {
  const finis = (runs ?? []).filter((r) => r && !["queued", "running", "claimed"].includes(String(r.status ?? "")))
    .sort((a, b) => (ms(b.started_at) || 0) - (ms(a.started_at) || 0));
  const dernier = finis[0];
  const non = { prouvee: false, le: null };
  if (!dernier || !CAUSE403_SESSION_ABSENTE_RE.test(String(dernier.erreur ?? ""))) return non;
  const t = ms(dernier.finished_at ?? dernier.started_at);
  if (!Number.isFinite(t) || maintenant - t > 24 * 3600_000) return non;
  if (Number.isFinite(dernierSucces) && dernierSucces > t) return non;
  const s = sessions && typeof sessions === "object" ? sessions : {};
  const vu = ms(s.checked_at_par_plateforme?.vinted ?? s.checked_at);
  if (s.vinted === true && Number.isFinite(vu) && vu > t) return non;
  return { prouvee: true, le: new Date(t).toISOString() };
}

/**
 * (15/10, lot C — carhoa) Le mur « Connexion Vinted requise » posé sur PREUVE
 * (connexionVintedAbsenteProuvee) : les marqueurs anti-robot sont mis de côté
 * (relancer_jobs_connexion ne relance jamais un job qui les porte), le geste
 * est celui de la connexion — l'app montre « Me connecter », la sonde ou le
 * relevé qui revoit Vinted le relance. L'appelant archive l'ancien message.
 * @returns {{ pf: Record<string, any>, message: string }}
 */
export function murConnexionVintedProuve(job, pf0, preuveLe, posePar) {
  const pf = { ...(pf0 && typeof pf0 === "object" ? pf0 : {}) };
  const antirobot = {};
  for (const k of ["attente_antirobot_compte", "blocage_antirobot", "mur_antirobot"]) { if (k in pf) { antirobot[k] = pf[k]; delete pf[k]; } }
  if (Object.keys(antirobot).length) pf.antirobot_requalifie = { le: new Date().toISOString(), preuve: "cause403_session_absente", preuve_le: preuveLe ?? null, ...antirobot };
  pf.needs_user_source = "connexion";
  pf.mur_geste = { type: "connexion", le: new Date().toISOString(), preuve: "cause403_session_absente", preuve_le: preuveLe ?? null, pose_par: posePar };
  delete pf.next_action_after; delete pf.processing_since;
  const message = messageConnexionRequise("vinted", {
    etapeRetiree: job?.action === "republish" && pf.republish_step === "deleted",
    retrait: job?.action === "delete",
    publication: job?.action === "publish",
  });
  return { pf, message };
}
