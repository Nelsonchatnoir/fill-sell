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

/** Le message du job clos (la phrase validée, jamais « relance-la »). */
export function messageClotureEbayHorsFrance(site) {
  return `FillSell publie seulement sur eBay France : ton compte eBay est sur eBay ${paysDuSiteEbay(site)}. Rien n'a été publié.`;
}

/** La phrase de l'app sous la case eBay grisée (stepper, lot). */
export function texteEbayHorsFrance(site, lang = "fr") {
  return lang === "en"
    ? `eBay: FillSell only publishes on eBay France — your eBay account is on eBay ${paysDuSiteEbay(site, "en")}.`
    : `eBay : FillSell publie seulement sur eBay France — ton compte eBay est sur eBay ${paysDuSiteEbay(site)}.`;
}

/**
 * Ce qu'on écrit sur la publication close. `archiver` = archiverErreur
 * (erreurs-archivees.js), passé par l'appelant. Rend { status, error,
 * platform_fields } — 'cancelled', état neutre partout, aucune relance.
 * @param {Record<string, any> | null | undefined} job
 * @param {{ par?: string, site?: string | null, maintenant?: number, archiver?: Function }} [options]
 */
export function clotureEbayHorsFrance(job, { par, site = null, maintenant, archiver } = {}) {
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
  };
  pf.hors_quota = true;
  delete pf.needs_user_source;
  delete pf.next_action_after;
  delete pf.processing_since;
  return { status: "cancelled", error: messageClotureEbayHorsFrance(site), platform_fields: pf };
}

/** Une publication eBay close par cette règle (état neutre, aucune relance). */
export function estClotureEbayHorsFrance(job) {
  const m = job?.platform_fields?.[CLE_EBAY_HORS_FRANCE];
  return String(job?.status ?? "") === "cancelled" && Boolean(m) && typeof m === "object";
}
