// ══════════════════════════════════════════════════════════════════════════
// eBay (VOIE API) : UN REFUS QUI VISE LE COMPTE N'EST JAMAIS « RELANCER » — UN MUR PAR COMPTE, UN ÉCLAIREUR (09/11)
// ══════════════════════════════════════════════════════════════════════════
// Cas fondateur (point 2 de Nico, 09/11) : nicolas.menar (Premium), 11 publications eBay refusées du 06/11 23:16 au
// 08/11 23:26 avec errorId 25019 et le code TRISK_pmts2_Issue_617_Block_BuyingandSellingandm2m : « Il semble que vous
// n'avez pas fourni les informations requises pour confirmer votre identité ou vos données financières… ». Le worker ne
// nommait que la famille KYC_ (relevée le 10/09) : tout autre code citait la phrase d'eBay SANS source, et le déclencheur
// cross_post_jobs_needs_user_motif posait « relancer » par défaut — l'app proposait « Relancer maintenant » sur un mur
// que seule la personne peut lever chez eBay, et chaque NOUVELLE publication retapait le même mur (9 le 08/11 en 20 min).
// Même famille sur pièce : USER_ON_HOLD (25002, « Votre compte eBay a été bloqué » : paiement refusé, arriéré), 5
// publications le 27/10, rangées « relancer » elles aussi.
//
// LA RÈGLE DE CLASSEMENT (une seule, pour tous les comptes) : un refus eBay se range selon QUI peut le lever.
//   · le COMPTE chez eBay (vérification d'identité ou des données financières ; compte bloqué ou suspendu) → une source
//     dédiée, jamais « relancer » : `ebay_verification_identite`, `ebay_compte_bloque` ; le message dit le geste et où le
//     faire ; aucun champ à compléter ;
//   · l'ARTICLE (aspects, EAN, rayon, retours…) → ses chemins existants, inchangés ;
//   · le passager (5xx, réseau) → pending, inchangé.
// Le code d'eBay fait foi (familles KYC_*, TRISK_* — Trust & Risk —, USER_ON_HOLD) ; sans code connu, la PHRASE d'eBay
// (FR / EN) range le refus quand elle nomme sans ambiguïté l'identité, les données financières ou le blocage du compte.
// Jamais deviné au-delà : un refus inconnu garde la phrase d'eBay, comme avant.
//
// LE MUR PAR COMPTE (voie API, ebay-api-worker) — même patron que _shared/vendeur-ebay.js (voie extension) :
//   · le mur VU : un job eBay du compte porte `ebay_refus_compte.vu_le` (posé au refus), depuis moins de 30 jours ;
//   · une publication eBay faite APRÈS le dernier mur (toute voie, hors relevé) prouve que le compte vend : le mur tombe,
//     et les tâches retenues repartent toutes seules ;
//   · tant que le mur tient, le worker n'envoie RIEN à eBay pour les publications du compte : chacune passe en attente du
//     même geste (needs_user, même source, même message), sauf UN éclaireur : la tâche que la personne a relancée APRÈS
//     le mur (« C'est fait, relancer » — derniere_relance_manuelle) ;
//   · l'éclaireur publié → toutes les autres repartent ; refusé de nouveau → le mur est revu (nouvelle date), rien d'autre.
// L'annonce n'est jamais touchée : une publication retenue n'a encore rien créé chez eBay. Les retraits ne sont jamais
// retenus. Pur (Deno + Node + Vite), sans import.

export const SOURCE_EBAY_VERIFICATION_IDENTITE = "ebay_verification_identite";
export const SOURCE_EBAY_COMPTE_BLOQUE = "ebay_compte_bloque";
export const SOURCES_MUR_COMPTE_EBAY = Object.freeze([SOURCE_EBAY_VERIFICATION_IDENTITE, SOURCE_EBAY_COMPTE_BLOQUE]);
export const FENETRE_MUR_COMPTE_EBAY_MS = 30 * 86_400_000;
export const CLE_REFUS_COMPTE = "ebay_refus_compte";
// La seule porte vivante chez eBay (relevé du 10/09 : les pages de vérification directes redirigent vers une erreur).
export const EBAY_SELLER_HUB_URL = "https://www.ebay.fr/sh/ovw";

export const MESSAGE_VERIFICATION_IDENTITE =
  "eBay bloque la mise en vente sur ton compte : il attend que tu finalises la vérification de ton identité (ou de tes " +
  "données financières). C'est à faire une seule fois, sur ton compte eBay (ebay.fr ou l'app eBay) : FillSell ne peut pas " +
  "le faire à ta place, et ça ne vient pas de ton article. Rien n'a été publié. Quand c'est fait, touche « C'est fait, " +
  "relancer » : FillSell relance cette publication, et tes autres publications eBay repartent dès qu'eBay l'accepte.";

export const MESSAGE_COMPTE_BLOQUE =
  "eBay a bloqué ton compte vendeur (paiement refusé ou solde impayé chez eBay) : rien ne peut être mis en vente tant " +
  "que ce n'est pas réglé sur ton compte eBay (ebay.fr › Mon eBay › Paiements). FillSell ne peut pas le faire à ta place, " +
  "et ça ne vient pas de ton article. Rien n'a été publié. Quand c'est réglé, touche « C'est fait, relancer » : FillSell " +
  "relance cette publication, et tes autres publications eBay repartent dès qu'eBay l'accepte.";

const FAMILLES = Object.freeze([
  {
    famille: "verification_identite",
    source: SOURCE_EBAY_VERIFICATION_IDENTITE,
    message: MESSAGE_VERIFICATION_IDENTITE,
    // KYC_DSAReq_EUB2C_SYI (10/09), TRISK_pmts2_Issue_617_Block_BuyingandSellingandm2m (06-08/11).
    code: /^(KYC|TRISK)_/i,
    phrase: /confirmer\s+votre\s+identit|v[ée]rifi(?:er|cation\s+de)\s+(?:votre|ton|vos|tes)\s+(?:identit|informations)|donn[ée]es\s+financi[èe]res|seuls\s+les\s+vendeurs\s+v[ée]rifi|verify\s+your\s+(?:identity|information)|confirm\s+your\s+identity|financial\s+information/i,
  },
  {
    famille: "compte_bloque",
    source: SOURCE_EBAY_COMPTE_BLOQUE,
    message: MESSAGE_COMPTE_BLOQUE,
    // USER_ON_HOLD (25002, 27/10).
    code: /^USER_ON_HOLD$/i,
    phrase: /compte\s+(?:eBay\s+)?a\s+[ée]t[ée]\s+(?:bloqu|suspendu)|account\s+(?:has\s+been\s+)?(?:blocked|suspended|on\s+hold)/i,
  },
]);

const texteDe = (v) => String(v ?? "").replace(/<[^>]*>/g, " ").replace(/&#39;/g, "'").replace(/&[a-z]+;/gi, " ");

/**
 * Le classement d'un refus eBay (voie API). `codes` : les valeurs des `parameters` (et le code lu) ; `phrases` : le
 * message d'eBay, ses paramètres en clair.
 * @param {{ codes?: Array<string|null|undefined>, phrases?: Array<string|null|undefined> }} r
 * @returns {{ famille: string, source: string, message: string, code: string|null } | null} null = pas un refus de compte.
 */
export function classerRefusEbay({ codes = [], phrases = [] } = {}) {
  const cs = (Array.isArray(codes) ? codes : []).map((c) => String(c ?? "").trim()).filter(Boolean);
  for (const f of FAMILLES) {
    const code = cs.find((c) => f.code.test(c));
    if (code) return { famille: f.famille, source: f.source, message: f.message, code };
  }
  const ps = (Array.isArray(phrases) ? phrases : []).map(texteDe).filter((t) => t.trim());
  for (const f of FAMILLES) {
    if (ps.some((t) => f.phrase.test(t))) return { famille: f.famille, source: f.source, message: f.message, code: cs[0] ?? null };
  }
  return null;
}

/** Le classement d'une ErreurEbay du worker ({ message, params: [{value}], parametres }). */
export function classerErreurEbay(e) {
  const params = Array.isArray(e?.params) ? e.params.map((p) => String(p?.value ?? "")) : [];
  return classerRefusEbay({ codes: params, phrases: [e?.message, e?.parametres, ...params] });
}

const pfDe = (job) => (job && job.platform_fields && typeof job.platform_fields === "object" ? job.platform_fields : {});
const ms = (v) => { const t = Date.parse(String(v ?? "")); return Number.isFinite(t) ? t : NaN; };

/** Une publication (ou republication) eBay : seule concernée par le mur (jamais un retrait). */
export function estDepotEbay(job) {
  return !!job && job.platform === "ebay" && ["publish", "republish"].includes(String(job.action ?? "publish"));
}

/** La date (ms) du mur de compte VU sur ce job, depuis moins de 30 jours ; NaN sinon. */
export function murCompteVuLe(job, maintenant = Date.now()) {
  if (!estDepotEbay(job)) return NaN;
  const m = pfDe(job)[CLE_REFUS_COMPTE];
  const t = m && typeof m === "object" ? ms(m.vu_le) : NaN;
  return Number.isFinite(t) && maintenant - t < FENETRE_MUR_COMPTE_EBAY_MS ? t : NaN;
}

/** Une publication eBay faite après `depuisMs` (toute voie, jamais un relevé) : le compte vend. */
export function compteEbayAPublieDepuis(jobs, depuisMs) {
  return (Array.isArray(jobs) ? jobs : []).some((j) => estDepotEbay(j)
    && ["published", "sold"].includes(String(j.status ?? ""))
    && String(j.handler_build ?? "") !== "releve-annonces"
    && ms(j.published_at) > depuisMs);
}

/**
 * Le mur de compte en vigueur pour un compte, d'après ses jobs eBay (les derniers suffisent) : le plus récent mur VU,
 * s'il n'a pas été levé par une publication faite après lui. null = aucun mur.
 * @returns {{ vu_le: number, famille: string, source: string, message: string } | null}
 */
export function murCompteEbay(jobs, maintenant = Date.now()) {
  let dernier = null; let t = -Infinity;
  for (const j of Array.isArray(jobs) ? jobs : []) {
    const v = murCompteVuLe(j, maintenant);
    if (Number.isFinite(v) && v > t) { t = v; dernier = j; }
  }
  if (!dernier || compteEbayAPublieDepuis(jobs, t)) return null;
  const m = pfDe(dernier)[CLE_REFUS_COMPTE];
  const f = FAMILLES.find((x) => x.famille === m.famille) ?? FAMILLES[0];
  return { vu_le: t, famille: f.famille, source: f.source, message: f.message };
}

/**
 * Faut-il envoyer CETTE publication à eBay ? `servir` sans mur ; sous un mur, seul l'éclaireur part : la tâche relancée
 * par la personne APRÈS le mur (« C'est fait, relancer »). Les autres : `retenir` (rien n'est envoyé à eBay).
 */
export function decisionMurCompteEbay(job, jobsCompte, maintenant = Date.now()) {
  if (!estDepotEbay(job)) return { action: "servir", raison: "pas_un_depot" };
  const mur = murCompteEbay(jobsCompte, maintenant);
  if (!mur) return { action: "servir", raison: "aucun_mur" };
  const relance = ms(pfDe(job).derniere_relance_manuelle);
  if (Number.isFinite(relance) && relance > mur.vu_le) return { action: "servir", raison: "eclaireur", mur };
  return { action: "retenir", raison: "mur_du_compte", mur };
}

/**
 * Le marqueur posé au refus (le mur VU) ou à la retenue (`retenue_le`, le mur reste daté du refus).
 * @param {{ famille: string, code?: string|null }} classe
 * @param {{ maintenant?: number, code?: string|null, retenue?: boolean, murVuLe?: number|null }} [o]
 */
export function marqueurRefusCompte(classe, { maintenant = Date.now(), code = null, retenue = false, murVuLe = null } = {}) {
  const iso = new Date(maintenant).toISOString();
  return retenue
    ? { famille: classe.famille, vu_le: new Date(murVuLe ?? maintenant).toISOString(), retenue_le: iso, pose_par: "ebay-api-worker (mur du compte)" }
    : { famille: classe.famille, vu_le: iso, code: code ?? classe.code ?? null, pose_par: "ebay-api-worker (refus eBay)" };
}

/** Une tâche qui attend ce geste sur le compte eBay (needs_user, source du mur). */
export function attendMurCompteEbay(job) {
  return !!job && job.status === "needs_user" && estDepotEbay(job)
    && SOURCES_MUR_COMPTE_EBAY.includes(String(pfDe(job).needs_user_source ?? ""));
}

/**
 * Ce que l'app montre sous une tâche qui attend ce geste : le lien chez eBay, et la relance qui ne tourne pas en rond
 * (« C'est fait, relancer » : seulement une fois le geste fait chez eBay). null sur toute autre tâche.
 */
export function gesteMurCompteEbay(job, lang = "fr") {
  if (!attendMurCompteEbay(job)) return null;
  const en = lang === "en";
  const bloque = String(pfDe(job).needs_user_source) === SOURCE_EBAY_COMPTE_BLOQUE;
  return {
    url: EBAY_SELLER_HUB_URL,
    libelle: bloque
      ? (en ? "Sort out my eBay account" : "Régler mon compte sur eBay")
      : (en ? "Finish my verification on eBay" : "Finaliser ma vérification sur eBay"),
    aide: en
      ? "eBay shows what it needs on your seller account. Nothing to do in FillSell until then."
      : "eBay y affiche ce qu'il attend, sur ton compte vendeur. Rien à faire dans FillSell d'ici là.",
    relancer: en ? "Done, relaunch" : "C'est fait, relancer",
    relancerAide: en
      ? "Only once it's done on eBay: FillSell relaunches this listing, and your other eBay listings follow as soon as eBay accepts it."
      : "Seulement une fois que c'est fait sur eBay : FillSell relance cette publication, et tes autres publications eBay suivent dès qu'eBay l'accepte.",
  };
}
