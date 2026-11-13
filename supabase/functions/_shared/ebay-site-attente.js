// ═══════════════════════════════════════════════════════════════════════════
// eBAY HORS DE FRANCE : AUCUNE TÂCHE CLOSE, UNE ATTENTE VRAIE (13/11/2026, décisions D9 et D10 de Nico)
// ═══════════════════════════════════════════════════════════════════════════
// Mot pour mot (13/11) : « D9 : oui pour lancer L0 maintenant, mais AUCUNE tâche close. Les tâches eBay des comptes
// découverts hors France passent en attente avec un message vrai (« ton site eBay arrive bientôt, rien n'est perdu »)
// et repartent seules à l'ouverture de leur site. Un job bloqué se laisse retenter, jamais fermé. »
// « D10 : les comptes eBay FRANÇAIS par l'extension restent sur ebay.fr. Un compte eBay ÉTRANGER ne passe jamais par
// ebay.fr, même par l'extension (règle du 25/09) : il est orienté vers l'API (« relie ton eBay à FillSell »). »
// Ce qu'on corrige : la clôture du 25/10 (_shared/ebay-hors-france.js, clotureEbayHorsFrance) fermait la tâche
// (cancelled) — 33 tâches sur 3 comptes en 30 jours (c7c382b7 ×30, b7b4033a ×2, 9ea76b27 ×1), dont 12 du compte
// c7c382b7 fermées d'un coup à la lecture de son site (12/11 18:30) ; la lecture des 54 comptes au site inconnu en
// aurait fermé autant. Désormais :
//   · une publication ou republication eBay d'un compte inscrit sur un site eBay FERMÉ passe en ATTENTE : needs_user,
//     source `ebay_site_etranger` (déjà connue de l'app et de l'extension : « En pause », _shared/etat-job.js), message
//     vrai, marque `ebay_site_attente`, hors quota (comme la clôture d'avant : elle ne mange pas les limites) ;
//   · elle REPART SEULE (pending) dès que son site est ouvert, ou que le compte relié est sur eBay France ; relancée
//     à la main avant, elle revient en attente — jamais close ;
//   · une tâche de l'extension d'un compte connu étranger n'est jamais servie à l'extension (ebay.fr) : en attente,
//     avec « relie ton eBay à FillSell » quand l'eBay n'est pas relié.
// SITE OUVERT = le CODE sait y publier (SITES_EBAY_PUBLIABLES : eBay France seul aujourd'hui ; un site n'y entre
// qu'avec le code qui publie vraiment sur ce site, lot L2/L4 du plan) ET l'interrupteur coin_config du pays est à 1
// (`ebay_pays_<cc>`, la clé de _shared/plateformes-pays.js — une seule vérité « eBay de ce pays est prouvé », posée
// par Nico après la preuve réelle). eBay France : toujours ouvert. Un interrupteur posé trop tôt n'ouvre donc rien.
// Site inconnu (jamais lu) : rien n'est décidé ici (comme avant).
// Module PUR : Deno, Vite et Node le chargent tel quel. Preuve : scripts/ebay-site-attente-selftest.mjs.
import { paysDuSiteEbay, SITE_EBAY_FRANCE } from "./ebay-hors-france.js";

/** La source d'attente : celle que l'app (« En pause : … ») et l'extension connaissent déjà (etat-job.js). */
export const SOURCE_EBAY_SITE_ATTENTE = "ebay_site_etranger";
/** La marque posée sur la tâche en attente (date, site, compte, d'où elle vient, ce qu'elle attend). */
export const CLE_EBAY_SITE_ATTENTE = "ebay_site_attente";

/** Les sites GetUser où le CODE sait publier (EBAY_FR seul : marketplace, arbre, emplacement, langue figés FR). */
export const SITES_EBAY_PUBLIABLES = Object.freeze([SITE_EBAY_FRANCE]);

// Le pays ISO d'un site GetUser (la clé de l'interrupteur).
const ISO = Object.freeze({
  France: "FR", UK: "GB", US: "US", eBayMotors: "US", Germany: "DE", Austria: "AT", Italy: "IT", Spain: "ES",
  Belgium_French: "BE", Belgium_Dutch: "BE", Netherlands: "NL", Ireland: "IE", Switzerland: "CH", Poland: "PL",
  Canada: "CA", CanadaFrench: "CA", Australia: "AU", HongKong: "HK", India: "IN", Malaysia: "MY", Philippines: "PH",
  Singapore: "SG",
});

/** @typedef {{ ouvertes?: Iterable<string> }} OptionsOuverture */

/** Le pays ISO d'un site eBay (« UK » → « GB ») ; null s'il est inconnu. */
export function paysIsoDuSiteEbay(site) {
  return ISO[String(site ?? "").trim()] ?? null;
}

/** La clé coin_config qui ouvre le site d'un pays (`ebay_pays_gb`) ; null pour un site inconnu. */
export function cleOuvertureSiteEbay(site) {
  const cc = paysIsoDuSiteEbay(site);
  return cc ? `ebay_pays_${cc.toLowerCase()}` : null;
}

/**
 * Le site est-il OUVERT à la publication ? France : toujours. Ailleurs : publiable par le code ET interrupteur à 1.
 * @param {string|null|undefined} site — le site GetUser (ebay_accounts.ebay_site)
 * @param {OptionsOuverture} [o] — les clés coin_config `ebay_pays_*` à 1
 */
export function siteEbayOuvert(site, { ouvertes = [] } = {}) {
  const s = String(site ?? "").trim();
  if (s === SITE_EBAY_FRANCE) return true;
  if (!s || !SITES_EBAY_PUBLIABLES.includes(s)) return false;
  const cle = cleOuvertureSiteEbay(s);
  return Boolean(cle) && new Set(ouvertes ?? []).has(cle);
}

/**
 * Le site connu d'un compte, hors de France et pas (encore) ouvert : la tâche attend. Site inconnu → false.
 * @param {string|null|undefined} site
 * @param {OptionsOuverture} [o]
 */
export function siteEbayEnAttente(site, { ouvertes = [] } = {}) {
  const s = String(site ?? "").trim();
  return Boolean(s) && s !== SITE_EBAY_FRANCE && !siteEbayOuvert(s, { ouvertes });
}

const nomCompte = (compte, lang) => {
  const c = String(compte ?? "").trim();
  return c ? (lang === "en" ? ` “${c}”` : ` « ${c} »`) : "";
};
const estRepublication = (action) => String(action ?? "publish") === "republish";

/**
 * Le message de la tâche en attente de son site (compte relié). Jamais « ordinateur » ni « Chrome ».
 * @param {string|null|undefined} site
 * @param {string|null} [compte]
 * @param {{ action?: string, lang?: string }} [o]
 */
export function messageAttenteSiteEbay(site, compte = null, { action = "publish", lang = "fr" } = {}) {
  if (lang === "en") {
    const quoi = estRepublication(action) ? "this repost will start again on its own" : "this listing will go out on its own";
    return `Your eBay account${nomCompte(compte, "en")} is on eBay ${paysDuSiteEbay(site, "en")}: FillSell doesn't list there yet, `
      + `and will never list on ebay.fr in its place. Your eBay site is coming soon, nothing is lost: ${quoi} as soon as it opens.`;
  }
  const quoi = estRepublication(action) ? "cette republication repartira toute seule" : "cette publication partira toute seule";
  return `Ton compte eBay${nomCompte(compte, "fr")} est sur eBay ${paysDuSiteEbay(site)} : FillSell n'y publie pas encore, `
    + `et ne publiera jamais sur ebay.fr à sa place. Ton site eBay arrive bientôt, rien n'est perdu : ${quoi} dès son ouverture.`;
}

/**
 * Le message D10 : un compte connu étranger dont l'eBay n'est pas (ou plus) relié — le seul geste vrai est de le relier.
 * @param {string|null|undefined} site
 * @param {string|null} [compte]
 * @param {{ action?: string, lang?: string }} [o]
 */
export function messageRelierEbayEtranger(site, compte = null, { action = "publish", lang = "fr" } = {}) {
  if (lang === "en") {
    const quoi = estRepublication(action) ? "this repost" : "this listing";
    return `Your eBay account${nomCompte(compte, "en")} is on eBay ${paysDuSiteEbay(site, "en")}: FillSell never lists it on ebay.fr. `
      + `Connect your eBay to FillSell (Settings › My platforms › eBay): ${quoi} will go out on your eBay site as soon as it opens. Nothing is lost.`;
  }
  const quoi = estRepublication(action) ? "cette republication" : "cette publication";
  return `Ton compte eBay${nomCompte(compte, "fr")} est sur eBay ${paysDuSiteEbay(site)} : FillSell ne le publie jamais sur ebay.fr. `
    + `Relie ton eBay à FillSell (Réglages › Mes plateformes › eBay) : ${quoi} partira sur ton site eBay dès son ouverture. Rien n'est perdu.`;
}

const pfDe = (job) => ((job?.platform_fields && typeof job.platform_fields === "object") ? job.platform_fields : {});

/** La tâche attend-elle son site eBay ? */
export function estAttenteSiteEbay(job) {
  return String(job?.status ?? "") === "needs_user" && pfDe(job).needs_user_source === SOURCE_EBAY_SITE_ATTENTE;
}

/**
 * Ce qu'on écrit sur une tâche qui passe en attente de son site (pur). `geste` : "attendre" (compte relié) ou
 * "relier" (eBay pas relié). `archiver` = archiverErreur (erreurs-archivees.js), passé par l'appelant.
 * @param {Record<string, any>} job
 * @param {{ par?: string, site?: string|null, compte?: string|null, geste?: string, maintenant?: number, archiver?: Function }} [o]
 * @returns {{ status: "needs_user", error: string, platform_fields: Record<string, any> }}
 */
export function ecritureAttenteSiteEbay(job, { par, site, compte = null, geste = "attendre", maintenant, archiver } = {}) {
  const pf = { ...pfDe(job) };
  const le = new Date(Number.isFinite(maintenant) ? maintenant : Date.now()).toISOString();
  const action = String(job?.action ?? "publish");
  const message = geste === "relier" ? messageRelierEbayEtranger(site, compte, { action }) : messageAttenteSiteEbay(site, compte, { action });
  if (typeof archiver === "function" && job?.error && job.error !== message) {
    pf.erreurs_archivees = archiver(pf.erreurs_archivees, job.error, String(job?.status ?? ""), `${par ?? CLE_EBAY_SITE_ATTENTE} (attente du site eBay)`);
  }
  const et = pf.error_technique;
  const brut = String((et && typeof et === "object" ? et.brut : et) ?? "").trim();
  if (brut && typeof archiver === "function") {
    pf.erreurs_archivees = archiver(pf.erreurs_archivees, brut, String(job?.status ?? ""), `${par ?? CLE_EBAY_SITE_ATTENTE} (brut technique, attente du site eBay)`);
    delete pf.error_technique;
  }
  const avant = pf[CLE_EBAY_SITE_ATTENTE] && typeof pf[CLE_EBAY_SITE_ATTENTE] === "object" ? pf[CLE_EBAY_SITE_ATTENTE] : null;
  pf[CLE_EBAY_SITE_ATTENTE] = {
    depuis: avant?.depuis ?? le,
    le,
    par: String(par ?? CLE_EBAY_SITE_ATTENTE),
    site: site == null ? null : String(site),
    compte: compte == null || String(compte).trim() === "" ? null : String(compte).trim(),
    geste,
    statut_avant: job?.status ?? null,
    source_avant: pf.needs_user_source && pf.needs_user_source !== SOURCE_EBAY_SITE_ATTENTE ? pf.needs_user_source : (avant?.source_avant ?? null),
    voie_avant: job?.voie ?? null,
  };
  pf.hors_quota = true;
  pf.needs_user_source = SOURCE_EBAY_SITE_ATTENTE;
  for (const k of ["ebay_a_finir", "needs_user_sans_motif", "next_action_after", "processing_since", "needsUserField",
    "needs_user_tick_le", "needs_user_actif_ms", "needs_user_vu_le", "needs_user_vu_erreur"]) delete pf[k];
  return { status: "needs_user", error: message, platform_fields: pf };
}

/**
 * Une tâche en attente de son site : que faire à ce passage ? (pur)
 *   · reprendre : le compte relié est sur eBay France, ou son site est ouvert (voie API ; une publication de
 *     l'extension d'un compte relié passe à l'API) → pending, l'attente levée et tracée ;
 *   · remessage : toujours fermé, mais le geste a changé (relié ↔ pas relié) → le message vrai, rien d'autre ;
 *   · rien.
 * Jamais une clôture. Un compte délié, ou relié sans site lu : la tâche attend (le doute ne la publie pas sur ebay.fr).
 * @param {Record<string, any>} job
 * @param {{ compte?: { ebay_site?: string|null, ebay_user_id?: string|null, revoked_at?: string|null }|null, drapeauApi?: boolean, ouvertes?: Iterable<string> }} [ctx]
 * @returns {{ action: "reprendre"|"remessage"|"rien", motif: string, voie?: string, geste?: string }}
 */
export function decisionAttenteSiteEbay(job, { compte = null, drapeauApi = false, ouvertes = [] } = {}) {
  if (!estAttenteSiteEbay(job)) return { action: "rien", motif: "pas_en_attente" };
  const site = String(compte?.ebay_site ?? "").trim() || null;
  const lieActif = Boolean(compte) && !compte.revoked_at && drapeauApi === true;
  const voie = String(job?.voie ?? "");
  const act = String(job?.action ?? "publish");
  if (compte && site === SITE_EBAY_FRANCE) return { action: "reprendre", motif: "compte_ebay_france" };
  if (compte && site && siteEbayOuvert(site, { ouvertes })) {
    if (voie === "api") return { action: "reprendre", motif: "site_ouvert" };
    if (act === "publish" && lieActif) return { action: "reprendre", motif: "site_ouvert", voie: "api" };
  }
  const geste = lieActif ? "attendre" : "relier";
  const marque = pfDe(job)[CLE_EBAY_SITE_ATTENTE];
  const siteMessage = site ?? marque?.site ?? null;
  // Un compte relié (non révoqué) à une publication restée « voie extension » : l'API la reprend (elle y attendra son site).
  if (lieActif && voie === "extension" && act === "publish") return { action: "reprendre", motif: "ebay_relie", voie: "api" };
  if (marque?.geste !== geste && siteMessage) return { action: "remessage", motif: geste === "relier" ? "ebay_pas_relie" : "ebay_relie", geste };
  return { action: "rien", motif: site ? "site_ferme" : "site_inconnu" };
}

/**
 * L'écriture d'une reprise : en file, message effacé, attente archivée et levée tracée (pur).
 * @param {Record<string, any>} job
 * @param {{ motif?: string, voie?: string|null, maintenant?: number, archiver?: Function, par?: string }} [o]
 * @returns {{ status: "pending", error: null, platform_fields: Record<string, any>, voie?: string }}
 */
export function ecritureRepriseAttenteSiteEbay(job, { motif, voie = null, maintenant, archiver, par = "serveur" } = {}) {
  const pf = { ...pfDe(job) };
  const le = new Date(Number.isFinite(maintenant) ? maintenant : Date.now()).toISOString();
  if (typeof archiver === "function" && job?.error) pf.erreurs_archivees = archiver(pf.erreurs_archivees, job.error, String(job?.status ?? ""), `${par} (attente du site eBay levée : ${motif})`);
  const pose = pf[CLE_EBAY_SITE_ATTENTE] ?? null;
  delete pf[CLE_EBAY_SITE_ATTENTE];
  delete pf.needs_user_source;
  for (const k of ["next_action_after", "processing_since", "needs_user_tick_le", "needs_user_actif_ms", "needs_user_vu_le", "needs_user_vu_erreur"]) delete pf[k];
  pf.ebay_site_attente_levee = { le, motif: String(motif ?? ""), par, pose };
  /** @type {{ status: "pending", error: null, platform_fields: Record<string, any>, voie?: string }} */
  const out = { status: "pending", error: null, platform_fields: pf };
  if (voie) out.voie = voie;
  return out;
}

/**
 * D10 — get-pending-jobs : une tâche eBay de l'EXTENSION (publication, republication) d'un compte dont le site lu
 * n'est PAS eBay France n'est jamais servie (l'extension ne publie que sur ebay.fr). Pur.
 *   · servir : site inconnu (aucune liaison, ou site jamais lu) ou eBay France → comme avant ;
 *   · sinon ne pas servir ; `ecrire` : la tâche passe en attente (geste « attendre » si l'eBay est relié, « relier »
 *     sinon) — sauf une publication d'un compte relié, que l'API reprend déjà (ebay-api-worker, voie extension → api)
 *     et une tâche déjà en attente.
 * Un retrait n'est jamais retenu (l'annonce en ligne doit pouvoir partir).
 * @param {Record<string, any>} job
 * @param {{ compte?: { ebay_site?: string|null, revoked_at?: string|null }|null, drapeauApi?: boolean }} [ctx]
 * @returns {{ servir: boolean, ecrire: boolean, geste?: string, site?: string, motif: string }}
 */
export function decisionEbayEtrangerExtension(job, { compte = null, drapeauApi = false } = {}) {
  const act = String(job?.action ?? "publish");
  if (String(job?.platform ?? "") !== "ebay" || !["publish", "republish"].includes(act)) return { servir: true, ecrire: false, motif: "hors_regle" };
  const site = String(compte?.ebay_site ?? "").trim();
  if (!compte || !site || site === SITE_EBAY_FRANCE) return { servir: true, ecrire: false, motif: site === SITE_EBAY_FRANCE ? "ebay_france" : "site_inconnu" };
  const lieActif = !compte.revoked_at && drapeauApi === true;
  if (estAttenteSiteEbay(job)) return { servir: false, ecrire: false, site, motif: "deja_en_attente" };
  if (act === "publish" && lieActif) return { servir: false, ecrire: false, site, motif: "repris_par_api" };
  if (!["pending", "needs_user"].includes(String(job?.status ?? ""))) return { servir: false, ecrire: false, site, motif: "statut" };
  return { servir: false, ecrire: true, geste: lieActif ? "attendre" : "relier", site, motif: "compte_ebay_etranger" };
}
