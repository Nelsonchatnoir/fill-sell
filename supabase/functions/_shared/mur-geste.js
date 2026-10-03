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

const NOM = { vinted: "Vinted", leboncoin: "Leboncoin", ebay: "eBay", beebs: "Beebs", opla: "Opla" };
const SITE = { vinted: "vinted.fr", leboncoin: "leboncoin.fr", ebay: "ebay.fr", beebs: "beebs.app", opla: "opla.co" };

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

/** Le message « connexion » — début de phrase partagé (relancer_jobs_connexion, handler-watch, app). */
export function messageConnexionRequise(platform, { etapeRetiree = false } = {}) {
  const nom = NOM[platform] ?? platform;
  return `Connexion ${nom} requise : reconnecte-toi à ${nom} dans Chrome, sur ton ordinateur. ` +
    (etapeRetiree ? "Ton annonce sera remise en ligne toute seule ensuite." : "Ton annonce est intacte ; tout repartira tout seul ensuite.");
}

/** Le message « vérification à résoudre ». */
export function messageVerificationAntirobot(platform, { etapeRetiree = false } = {}) {
  const nom = NOM[platform] ?? platform;
  return `${nom} te demande une vérification anti-robot : ouvre ${SITE[platform] ?? nom} dans Chrome et fais la vérification. ` +
    (etapeRetiree ? "Ton annonce sera remise en ligne toute seule ensuite." : "Ton annonce est intacte ; tout repartira tout seul ensuite.");
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
  // 1. Connexion : l'attente de session, nommée par la page, persistante.
  const att = pf.attente_session;
  if (att && typeof att === "object" && ATTENTE_SESSION_RE.test(String(job?.error ?? ""))
      && (Number(att.observations) || 0) >= CONNEXION_OBSERVATIONS_MIN) {
    pf.mur_geste = { type: "connexion", le: new Date().toISOString(), depuis: att.depuis ?? null, observations: Number(att.observations) || 0 };
    pf.needs_user_source = "connexion";
    return { geste: "connexion", message: messageConnexionRequise(plat, { etapeRetiree }), pf, change: true };
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
      : messageVerificationAntirobot(plat, { etapeRetiree });
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
export function messagePauseVintedGeste() {
  return "Vinted bloque tes actions depuis plusieurs heures : ouvre vinted.fr dans Chrome, connecte-toi si Vinted te le demande " +
    "et passe la vérification si elle s'affiche. Ton annonce est intacte ; tout repartira tout seul ensuite.";
}
