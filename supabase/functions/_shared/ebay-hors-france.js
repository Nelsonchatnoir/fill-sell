// ═══════════════════════════════════════════════════════════════════════════
// eBAY HORS DE FRANCE : LA PUBLICATION EST CLOSE, JAMAIS EN PAUSE (25/10/2026)
// ═══════════════════════════════════════════════════════════════════════════
// (09/10, Marta — règle de Nico) FillSell ne publie que sur eBay France
// (EBAY_FR) ; un compte eBay inscrit sur un autre site n'est jamais publié sur
// ebay.fr à sa place (_shared/ebay-site.ts). Mais la garde d'ebay-api-worker
// mettait la publication EN PAUSE (needs_user « ebay_site_etranger ») — pour
// toujours : rien ne la levait. Audit de nuit N10 (25/10) : 9 comptes eBay
// étrangers ; 1177a0b3 et 347f9e44 (UK), c4d745bc et 027b3d8c (Belgique)
// parqués, puis arrêtés au bout de deux semaines avec « Relance-la depuis la
// fiche de l'article » — une relance qui ne pouvait pas aboutir.
// LA RÈGLE : une publication ou republication eBay d'un compte inscrit hors
// d'eBay France est CLOSE (cancelled) avec un message vrai, ne compte dans
// aucun quota, et l'app grise eBay pour ce compte. Jamais « relance-la ».
// Site inconnu (jamais lu) : rien n'est décidé, comme avant.
// Module PUR, sans import : Deno, Vite et Node le chargent tel quel.

export const SITE_EBAY_FRANCE = "France";
export const CLE_EBAY_HORS_FRANCE = "ebay_hors_france";

// Les sites que rend GetUser <Site>, dits par leur pays.
const PAYS = {
  Italy: ["Italie", "Italy"], Spain: ["Espagne", "Spain"], Germany: ["Allemagne", "Germany"],
  Austria: ["Autriche", "Austria"], Belgium_French: ["Belgique", "Belgium"], Belgium_Dutch: ["Belgique", "Belgium"],
  Netherlands: ["Pays-Bas", "the Netherlands"], Ireland: ["Irlande", "Ireland"], UK: ["Royaume-Uni", "the UK"],
  US: ["États-Unis", "the US"], eBayMotors: ["États-Unis", "the US"], Switzerland: ["Suisse", "Switzerland"],
  Poland: ["Pologne", "Poland"], Canada: ["Canada", "Canada"], CanadaFrench: ["Canada", "Canada"],
  Australia: ["Australie", "Australia"], HongKong: ["Hong Kong", "Hong Kong"], India: ["Inde", "India"],
  Malaysia: ["Malaisie", "Malaysia"], Philippines: ["Philippines", "the Philippines"], Singapore: ["Singapour", "Singapore"],
};

/** Le pays d'un site eBay, en mots (« UK » → « Royaume-Uni ») ; le code tel quel s'il est inconnu. */
export function paysDuSiteEbay(site, lang = "fr") {
  const p = PAYS[String(site ?? "")];
  return p ? p[lang === "en" ? 1 : 0] : String(site ?? "");
}

/** Le compte eBay relié est-il inscrit hors d'eBay France ? Site inconnu → non (rien n'est décidé). */
export function ebaySiteHorsFrance(site) {
  const s = String(site ?? "").trim();
  return { horsFrance: Boolean(s) && s !== SITE_EBAY_FRANCE, site: s || null, pays: s ? paysDuSiteEbay(s) : null };
}

// (26/10 nuit, point 7 — Elodie82) Les phrases NOMMENT le compte eBay quand il est connu : « US » valait pour
// @echa_5, « compte à finir » pour @aelevy.-86 — deux messages qui se contredisaient à l'écran faute de nom.
const nomCompte = (compte, lang = "fr") => {
  const c = String(compte ?? "").trim();
  return c ? (lang === "en" ? ` “${c}”` : ` « ${c} »`) : "";
};

/** Le message du job clos (la phrase validée, jamais « relance-la »). */
export function messageClotureEbayHorsFrance(site, compte = null) {
  return `FillSell publie seulement sur eBay France : ton compte eBay${nomCompte(compte)} est sur eBay ${paysDuSiteEbay(site)}. Rien n'a été publié.`;
}

/** La phrase de l'app sous la case eBay grisée (stepper, lot). */
export function texteEbayHorsFrance(site, lang = "fr", compte = null) {
  return lang === "en"
    ? `eBay: FillSell only publishes on eBay France — your eBay account${nomCompte(compte, "en")} is on eBay ${paysDuSiteEbay(site, "en")}.`
    : `eBay : FillSell publie seulement sur eBay France — ton compte eBay${nomCompte(compte)} est sur eBay ${paysDuSiteEbay(site)}.`;
}

/**
 * Ce qu'on écrit sur la publication close. `archiver` = archiverErreur
 * (erreurs-archivees.js), passé par l'appelant. Rend { status, error,
 * platform_fields } — 'cancelled', état neutre partout, aucune relance.
 * @param {Record<string, any> | null | undefined} job
 * @param {{ par?: string, site?: string | null, compte?: string | null, maintenant?: number, archiver?: Function }} [options]
 */
export function clotureEbayHorsFrance(job, { par, site = null, compte = null, maintenant, archiver } = {}) {
  const pf = { ...((job?.platform_fields && typeof job.platform_fields === "object") ? job.platform_fields : {}) };
  const le = new Date(Number.isFinite(maintenant) ? maintenant : Date.now()).toISOString();
  if (typeof archiver === "function") {
    pf.erreurs_archivees = archiver(pf.erreurs_archivees, job?.error, String(job?.status ?? ""), `${par ?? CLE_EBAY_HORS_FRANCE} (eBay hors de France)`);
  }
  pf[CLE_EBAY_HORS_FRANCE] = {
    le,
    par: String(par ?? CLE_EBAY_HORS_FRANCE),
    statut_avant: job?.status ?? null,
    source_avant: pf.needs_user_source ?? null,
    preuve: site == null ? null : String(site),
    compte: compte == null || String(compte).trim() === "" ? null : String(compte).trim(),
  };
  pf.hors_quota = true;
  delete pf.needs_user_source;
  delete pf.next_action_after;
  delete pf.processing_since;
  return { status: "cancelled", error: messageClotureEbayHorsFrance(site, compte), platform_fields: pf };
}

/** Une publication eBay close par cette règle (état neutre, aucune relance). */
export function estClotureEbayHorsFrance(job) {
  const m = job?.platform_fields?.[CLE_EBAY_HORS_FRANCE];
  return String(job?.status ?? "") === "cancelled" && Boolean(m) && typeof m === "object";
}

// ── (26/10 nuit, point 7 — Elodie82) UN CHANGEMENT DE COMPTE ROUVRE, UNE FOIS, CE QUE L'ANCIEN A FERMÉ ──────────
// Cinq publications closes « compte eBay aux États-Unis » (@echa_5 : juste), puis @aelevy.-86 relié, sur eBay
// France : rien ne les rouvrait. Une clôture de cette règle se ROUVRE une fois quand TOUT tient :
//   · une publication (jamais une republication), jamais publiée, close depuis moins de 30 jours ;
//   · le compte relié est MAINTENANT sur eBay France, site lu APRÈS la clôture (ebay-oauth-callback le lit à la
//     connexion ; handler-watch en filet) ;
//   · la fiche est en stock (non vendue, quantité > 0, non fusionnée), sans autre publication eBay vivante ni
//     annonce eBay en ligne (jamais un doublon) ; pas déjà rouverte.
export const REOUVERTURE_EBAY_JOURS = 30;
const quand = (v) => { const x = Date.parse(String(v ?? "")); return Number.isFinite(x) ? x : NaN; };

/**
 * @param {Record<string, any>} job
 * @param {{ siteActuel?: string|null, siteLuLe?: string|null, fiche?: any, autresEbayVivants?: number, annonceEbayLiee?: boolean, maintenant?: number }} [ctx]
 * @returns {{ rouvrir: boolean, motif: string }}
 */
export function reouvertureEbayHorsFrance(job, { siteActuel = null, siteLuLe = null, fiche = null, autresEbayVivants = 0, annonceEbayLiee = false, maintenant = Date.now() } = {}) {
  if (!estClotureEbayHorsFrance(job)) return { rouvrir: false, motif: "pas_close_hors_france" };
  if (String(job?.action ?? "publish") !== "publish") return { rouvrir: false, motif: "pas_une_publication" };
  const pf = job?.platform_fields ?? {};
  if (pf.ebay_hors_france_rouverte) return { rouvrir: false, motif: "deja_rouverte" };
  if (job?.published_at || String(job?.platform_listing_id ?? "").trim() || String(job?.listing_url ?? "").trim()) return { rouvrir: false, motif: "deja_publiee" };
  if (String(siteActuel ?? "").trim() !== SITE_EBAY_FRANCE) return { rouvrir: false, motif: "site_pas_france" };
  const close = quand(pf[CLE_EBAY_HORS_FRANCE]?.le);
  if (!Number.isFinite(close) || maintenant - close > REOUVERTURE_EBAY_JOURS * 86_400_000) return { rouvrir: false, motif: "trop_ancienne" };
  if (!(quand(siteLuLe) > close)) return { rouvrir: false, motif: "site_pas_relu_depuis" };
  if (!fiche) return { rouvrir: false, motif: "fiche_inconnue" };
  if (String(fiche.statut ?? "") === "vendu" || fiche.fusionne_dans != null) return { rouvrir: false, motif: "fiche_pas_en_stock" };
  if (fiche.quantite != null && !(Number(fiche.quantite) > 0)) return { rouvrir: false, motif: "fiche_pas_en_stock" };
  if ((Number(autresEbayVivants) || 0) > 0) return { rouvrir: false, motif: "autre_publication_ebay" };
  if (annonceEbayLiee) return { rouvrir: false, motif: "annonce_ebay_en_ligne" };
  return { rouvrir: true, motif: "compte_ebay_france" };
}

/**
 * Ce qu'on écrit sur la publication rouverte : « compte à finir » (needs_user ebay_compte_a_finir — le ré-armement
 * existant la publie dès que le compte est prêt), la clôture archivée, le marqueur de la réouverture. hors_quota gardé.
 * @param {Record<string, any>} job
 * @param {{ site?: string|null, compte?: string|null, message: string, par?: string, maintenant?: number, archiver?: Function }} opts
 */
export function ecritureReouvertureEbayHorsFrance(job, { site = SITE_EBAY_FRANCE, compte = null, message, par = "serveur", maintenant, archiver } = {}) {
  const pf = { ...((job?.platform_fields && typeof job.platform_fields === "object") ? job.platform_fields : {}) };
  const le = new Date(Number.isFinite(maintenant) ? maintenant : Date.now()).toISOString();
  if (typeof archiver === "function") pf.erreurs_archivees = archiver(pf.erreurs_archivees, job?.error, String(job?.status ?? ""), `${par} (réouverture eBay : compte sur eBay France)`);
  const avant = pf[CLE_EBAY_HORS_FRANCE] ?? {};
  pf.ebay_hors_france_rouverte = {
    le, par, site_avant: avant.preuve ?? null, compte_avant: avant.compte ?? null,
    site_apres: site ?? null, compte_apres: compte == null || String(compte).trim() === "" ? null : String(compte).trim(),
  };
  pf.needs_user_source = "ebay_compte_a_finir";
  delete pf.next_action_after;
  delete pf.processing_since;
  return { status: "needs_user", error: String(message ?? ""), platform_fields: pf };
}
