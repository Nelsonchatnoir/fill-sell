// ═══════════════════════════════════════════════════════════════════════════
// LE SITE DE CHAQUE COMPTE DE PLATEFORME — LU UNE FOIS, SERVI PARTOUT (13/11/2026, étape 4 « comptes hors France », L1)
// ═══════════════════════════════════════════════════════════════════════════
// Règle de Nico (International) : « identifiants plutôt que libellés ; pays, langue et monnaie de chaque compte de
// plateforme lus une fois ». Ce module dit, pour un compte de plateforme, SON site par identifiants :
//   site (EBAY_GB, VINTED_IT, DEPOP_GB, LEBONCOIN_FR, BEEBS_FR) · pays ISO 3166 · langue BCP 47 · devise ISO 4217 · domaine
// à partir de ce que la plateforme a DIT du compte :
//   · eBay : Trading GetUser <Site> (« UK », « Belgium_French »…), lu avec le jeton du vendeur (ebay_accounts.ebay_site) ;
//   · Vinted : la sonde de l'extension (users/current : country_code, locale — extension_sessions.vinted_identite) ;
//   · Depop : la sonde de l'extension (users/me : country — extension_sessions.depop_identite, 0.6.187).
// Et la LIGNE de public.comptes_plateformes (migration 20261113210000, PRÉPARÉE) qu'on en tire, la règle « une écriture »
// (jamais une ligne inchangée réécrite) et la vue servie à l'app (site_compte d'etatPublic).
// ⛔ JAMAIS EBAY_FR pour un compte étranger (règle du 25/09, D10) : seul le site GetUser « France » rend EBAY_FR (la base
//    le refuse aussi : CHECK site <> 'EBAY_FR' OR pays = 'FR').
// ⛔ INCONNU = RIEN : un site GetUser hors table, une sonde sans pays → null, aucune ligne ; jamais deviné, jamais par le
//    domaine (Alberto, compte italien, travaille sur vinted.fr — vinted-pays.ts), jamais par le pays du poste.
// ⛔ Un pays sans marketplace Inventory prouvée → EBAY_US en anglais (plan § 2), le pays du compte gardé.
// ⛔ Ce module ne dit PAS qu'un site est ouvert : l'ouverture reste celle d'ebay-site-attente.js (code qui sait y publier
//    ET interrupteur coin_config). Il ne publie rien, n'écrit rien, ne lit rien (la porte d'écriture est
//    _shared/comptes-plateformes.js).
// Aligné sur l'existant, une seule table : ebay-site.ts (domaine du compte) et ebay-site-attente.js (pays ISO) lisent
// SITES_EBAY ; les domaines Vinted de la zone euro viennent de vinted-pays.ts (relevés le 25/09). ebay-hors-france.js
// garde les NOMS de pays en mots (phrases de l'app).
// Module PUR : Deno, Vite et Node le chargent tel quel. Preuves : scripts/sites-plateformes-selftest.mjs,
// scripts/une-ecriture-selftest.mjs, banc scripts/essais/20261113210000_banc.mjs.
import { PAYS_VINTED_EURO } from "./vinted-pays.ts";

/** Les plateformes dont un compte peut avoir une ligne (CHECK de la table). */
export const PLATEFORMES_SITES = Object.freeze(["ebay", "vinted", "depop", "leboncoin", "beebs"]);

/** D'où vient la lecture (colonne `source`). */
export const SOURCES_SITES = Object.freeze({ ebay: "ebay_getuser", vinted: "vinted_sonde", depop: "depop_sonde" });

// ── eBay ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
// Clé = la valeur GetUser <Site> (SiteCodeType). siteId = SITEID Trading. marketplace = MarketplaceIdEnum du site quand
// l'API Inventory y publie, null sinon (→ EBAY_US en anglais). domaineCompte = le site où le compte est INSCRIT (les
// 16 domaines d'ebay-site.ts, à l'octet). Sites relevés EN PROD (GetUser, 13/11) : France, US, UK, Italy, Germany,
// Belgium_French, Austria, Canada. Les autres n'ont aucun compte aujourd'hui : leurs valeurs sont celles des
// énumérations d'eBay et seront MESURÉES (Metadata, Taxonomy) avant qu'aucun site ne s'ouvre (L2) ; HongKong,
// Singapore, India, Malaysia, Philippines : marketplace Inventory non prouvée → EBAY_US (question posée à Nico).
const E = (siteId, pays, marketplace, langue, devise, domaineCompte) => Object.freeze({ siteId, pays, marketplace, langue, devise, domaineCompte });
export const SITES_EBAY = Object.freeze({
  France: E(71, "FR", "EBAY_FR", "fr-FR", "EUR", "ebay.fr"),
  UK: E(3, "GB", "EBAY_GB", "en-GB", "GBP", "ebay.co.uk"),
  US: E(0, "US", "EBAY_US", "en-US", "USD", "ebay.com"),
  eBayMotors: E(100, "US", "EBAY_US", "en-US", "USD", "ebay.com"),
  Germany: E(77, "DE", "EBAY_DE", "de-DE", "EUR", "ebay.de"),
  Austria: E(16, "AT", "EBAY_AT", "de-AT", "EUR", "ebay.at"),
  Switzerland: E(193, "CH", "EBAY_CH", "de-CH", "CHF", "ebay.ch"),
  Italy: E(101, "IT", "EBAY_IT", "it-IT", "EUR", "ebay.it"),
  Spain: E(186, "ES", "EBAY_ES", "es-ES", "EUR", "ebay.es"),
  Belgium_French: E(23, "BE", "EBAY_BE", "fr-BE", "EUR", "befr.ebay.be"),
  Belgium_Dutch: E(123, "BE", "EBAY_BE", "nl-BE", "EUR", "benl.ebay.be"),
  Netherlands: E(146, "NL", "EBAY_NL", "nl-NL", "EUR", "ebay.nl"),
  Ireland: E(205, "IE", "EBAY_IE", "en-IE", "EUR", "ebay.ie"),
  Poland: E(212, "PL", "EBAY_PL", "pl-PL", "PLN", "ebay.pl"),
  Canada: E(2, "CA", "EBAY_CA", "en-CA", "CAD", "ebay.ca"),
  CanadaFrench: E(210, "CA", "EBAY_CA", "fr-CA", "CAD", "cafr.ebay.ca"),
  Australia: E(15, "AU", "EBAY_AU", "en-AU", "AUD", "ebay.com.au"),
  HongKong: E(201, "HK", null, null, null, "ebay.com.hk"),
  Singapore: E(216, "SG", null, null, null, "ebay.com.sg"),
  India: E(203, "IN", null, null, null, "ebay.in"),
  Malaysia: E(207, "MY", null, null, null, "ebay.com.my"),
  Philippines: E(211, "PH", null, null, null, "ebay.ph"),
});
// Sans marketplace Inventory : l'annonce part sur eBay.com, en anglais, en dollars (le domaine du compte reste dans
// domaineCompte). Avec : le domaine du site d'inscription (benl.ebay.be pour EBAY_BE en nl-BE, cafr.ebay.ca en fr-CA).
const REPLI_SANS_INVENTAIRE = Object.freeze({ site: "EBAY_US", langue: "en-US", devise: "USD", domaine: "ebay.com" });

const cleSite = (site) => (typeof site === "string" && Object.prototype.hasOwnProperty.call(SITES_EBAY, site) ? site : null);

/**
 * Le site d'un compte eBay, par identifiants, depuis GetUser <Site>. null = inconnu (rien n'est décidé).
 * @param {string|null|undefined} siteGetUser
 * @returns {null | { site: string, pays: string, langue: string, devise: string, domaine: string, domaineCompte: string, siteId: number, inventaire: boolean, siteGetUser: string }}
 */
export function siteEbayDuGetUser(siteGetUser) {
  const k = cleSite(siteGetUser);
  if (!k) return null;
  const s = SITES_EBAY[k];
  const inventaire = Boolean(s.marketplace);
  const r = inventaire
    ? { site: s.marketplace, langue: s.langue, devise: s.devise, domaine: s.domaineCompte }
    : { ...REPLI_SANS_INVENTAIRE };
  // ⛔ Garde : EBAY_FR n'est jamais le site d'un compte inscrit ailleurs qu'en France.
  if (r.site === "EBAY_FR" && k !== "France") return null;
  return { ...r, pays: s.pays, domaineCompte: s.domaineCompte, siteId: s.siteId, inventaire, siteGetUser: k };
}

/** Le pays ISO d'un site GetUser (« UK » → « GB ») ; null s'il est inconnu. (Lu par ebay-site-attente.js.) */
export function paysIsoDuSiteEbay(siteGetUser) {
  const k = cleSite(typeof siteGetUser === "string" ? siteGetUser.trim() : siteGetUser);
  return k ? SITES_EBAY[k].pays : null;
}

/** Le domaine où le compte eBay est INSCRIT (« UK » → « ebay.co.uk ») ; null s'il est inconnu. (Lu par ebay-site.ts.) */
export function domaineCompteEbay(siteGetUser) {
  const k = cleSite(siteGetUser);
  return k ? SITES_EBAY[k].domaineCompte : null;
}

// ── Vinted ───────────────────────────────────────────────────────────────────────────────────────────────────────────
/**
 * La langue (BCP 47, sous-étiquette principale) d'une locale Vinted. Vinted écrit « <langue>-<portail> » (« it-fr » :
 * italien sur le portail .fr, relevé en prod le 13/11) : la 2e partie n'est PAS une région — seule la langue est gardée.
 * @param {unknown} locale
 * @returns {string|null}
 */
export function langueDeLocale(locale) {
  const m = /^([a-z]{2,3})(?:[-_][a-z0-9]{2,8})*$/.exec(String(locale ?? "").trim().toLowerCase());
  return m ? m[1] : null;
}

/**
 * Le site d'un compte Vinted, depuis la sonde (pays du compte, locale). Pays absent → null. Hors zone euro (non relevé) :
 * VINTED_xx avec devise et domaine null (jamais devinés).
 * @param {{ pays?: unknown, locale?: unknown }} [identite]
 */
export function siteVinted({ pays = null, locale = null } = {}) {
  const cc = String(pays ?? "").trim();
  if (!/^[A-Z]{2}$/.test(cc)) return null;
  const euro = Object.prototype.hasOwnProperty.call(PAYS_VINTED_EURO, cc) ? PAYS_VINTED_EURO[cc] : null;
  return {
    site: `VINTED_${cc}`, pays: cc, langue: langueDeLocale(locale),
    devise: euro ? "EUR" : null, domaine: euro ? euro.domaine.replace(/^www\./, "") : null,
  };
}

// ── Depop ────────────────────────────────────────────────────────────────────────────────────────────────────────────
/** La zone euro de Depop — copie à l'identique de DEPOP_PAYS_EURO (chrome-extension/content-scripts/depop.js), vérifiée par le verrou. */
export const PAYS_DEPOP_EURO = Object.freeze(["FR", "BE", "DE", "IT", "ES", "NL", "IE", "AT", "PT", "FI", "LU", "GR", "SK", "SI", "EE", "LV", "LT", "MT", "CY", "HR"]);
// Hors euro : les régions de grille de l'extension (depopRegion : GB, US, AU), devise de getCurrencyCodeFromCountryCode.
const DEVISES_DEPOP = Object.freeze({ GB: "GBP", US: "USD", AU: "AUD" });

/**
 * Le site d'un compte Depop, depuis la sonde (pays du profil). Langue : jamais lue → null.
 * @param {{ pays?: unknown }} [identite]
 */
export function siteDepop({ pays = null } = {}) {
  const cc = String(pays ?? "").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(cc)) return null;
  return { site: `DEPOP_${cc}`, pays: cc, langue: null, devise: PAYS_DEPOP_EURO.includes(cc) ? "EUR" : (DEVISES_DEPOP[cc] ?? null), domaine: "depop.com" };
}

// ── Leboncoin, Beebs : des sites français ──────────────────────────────────────────────────────────────────────────
const FRANCE_SEULE = Object.freeze({
  leboncoin: Object.freeze({ site: "LEBONCOIN_FR", pays: "FR", langue: "fr-FR", devise: "EUR", domaine: "leboncoin.fr" }),
  beebs: Object.freeze({ site: "BEEBS_FR", pays: "FR", langue: "fr-FR", devise: "EUR", domaine: "beebs.app" }),
});
/** Le site d'une plateforme qui n'existe qu'en France (Leboncoin, Beebs) ; null pour les autres. */
export function siteFranceSeule(plateforme) {
  const s = FRANCE_SEULE[String(plateforme ?? "")];
  return s ? { ...s } : null;
}

// ── La ligne de public.comptes_plateformes ─────────────────────────────────────────────────────────────────────────
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const compteValide = (c) => { const s = String(c ?? "").trim(); return s && s.length <= 200 ? s : null; };
function ligne(userId, plateforme, compte, lu, brut) {
  const c = compteValide(compte);
  if (!UUID.test(String(userId ?? "")) || !c || !lu) return null;
  return { user_id: String(userId), plateforme, compte: c, site: lu.site, pays: lu.pays, langue: lu.langue ?? null,
    devise: lu.devise ?? null, domaine: lu.domaine ?? null, source: SOURCES_SITES[plateforme], brut };
}

/**
 * La ligne d'un compte eBay. compte = l'identifiant IMMUABLE du vendeur (EIASToken), jamais le pseudo (il change).
 * @param {{ userId: string, compte: string|null|undefined, siteGetUser: string|null|undefined }} p
 */
export function ligneCompteEbay({ userId, compte, siteGetUser } = {}) {
  const lu = siteEbayDuGetUser(siteGetUser);
  return lu ? ligne(userId, "ebay", compte, lu, { site: lu.siteGetUser }) : null;
}

/**
 * La ligne d'un compte Vinted, depuis extension_sessions.vinted_identite ({ user_id, login, pays, langue = locale,
 * domaine }). compte = le numéro Vinted. Le domaine de SESSION (poste) n'entre pas dans brut : il bouge avec le poste.
 */
export function ligneCompteVinted({ userId, identite } = {}) {
  const i = identite && typeof identite === "object" ? identite : null;
  const lu = i ? siteVinted({ pays: i.pays, locale: i.langue }) : null;
  if (!lu) return null;
  const brut = { pays: lu.pays, ...(typeof i.langue === "string" && i.langue.trim() ? { locale: i.langue.trim() } : {}) };
  return ligne(userId, "vinted", i.user_id, lu, brut);
}

/** La ligne d'un compte Depop, depuis extension_sessions.depop_identite ({ user_id, login, pays }). */
export function ligneCompteDepop({ userId, identite } = {}) {
  const i = identite && typeof identite === "object" ? identite : null;
  const lu = i ? siteDepop({ pays: i.pays }) : null;
  return lu ? ligne(userId, "depop", i.user_id, lu, { pays: lu.pays }) : null;
}

/** Les lignes que disent les sessions de l'extension (Vinted, Depop) ; [] si rien n'est lu. */
export function lignesDesSessions(userId, sessions) {
  const s = sessions && typeof sessions === "object" ? sessions : {};
  return [ligneCompteVinted({ userId, identite: s.vinted_identite }), ligneCompteDepop({ userId, identite: s.depop_identite })].filter(Boolean);
}

// ── Une écriture, jamais une ligne inchangée réécrite ───────────────────────────────────────────────────────────────
/** Les champs qui disent le site (lu_le et pilote n'en font pas partie). */
export const CHAMPS_SITE = Object.freeze(["site", "pays", "langue", "devise", "domaine", "source", "brut"]);
const canonique = (v) => {
  if (Array.isArray(v)) return `[${v.map(canonique).join(",")}]`;
  if (v && typeof v === "object") return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonique(v[k])}`).join(",")}}`;
  return JSON.stringify(v ?? null);
};

/**
 * Que faire de ce qu'on vient de lire (pur) ?
 *   · rien de lu → rien (jamais une ligne effacée sur une sonde muette) ;
 *   · pas de ligne → UN insert (lu_le = maintenant ; pilote laissé à la valeur de la base) ;
 *   · ligne identique → rien ;
 *   · ligne différente → UN update des seuls champs changés + lu_le (jamais pilote, jamais la clé).
 * @param {Record<string, any>|null} actuelle — la ligne en base (ou null)
 * @param {Record<string, any>|null} nouvelle — ligneCompte*()
 * @param {{ maintenant?: number }} [o]
 * @returns {{ ecrire: false, motif: "sans_ligne"|"inchangee" } | { ecrire: true, motif: "nouvelle", insert: Record<string, any> } | { ecrire: true, motif: "changee", champs: Record<string, any> }}
 */
export function ecritureComptePlateforme(actuelle, nouvelle, { maintenant = Date.now() } = {}) {
  if (!nouvelle) return { ecrire: false, motif: "sans_ligne" };
  const lu_le = new Date(maintenant).toISOString();
  if (!actuelle) return { ecrire: true, motif: "nouvelle", insert: { ...nouvelle, lu_le } };
  const champs = {};
  for (const k of CHAMPS_SITE) if (canonique(actuelle[k]) !== canonique(nouvelle[k])) champs[k] = nouvelle[k] ?? null;
  if (!Object.keys(champs).length) return { ecrire: false, motif: "inchangee" };
  return { ecrire: true, motif: "changee", champs: { ...champs, lu_le } };
}

/** La signature d'une ligne (mémoire de la porte d'écriture). */
export function signatureLigne(l) {
  return l ? `${l.user_id}|${l.plateforme}|${l.compte}|${CHAMPS_SITE.map((k) => canonique(l[k])).join("|")}` : "";
}

// ── Ce que l'app voit ────────────────────────────────────────────────────────────────────────────────────────────────
/**
 * La vue publique d'une ligne : jamais l'identifiant du compte ni le brut. `depuis` dit d'où elle vient : la ligne lue
 * (« comptes_plateformes » — seule à porter un vrai `pilote`) ou le site GetUser d'ebay_accounts (« ebay_accounts »).
 */
export function vueSiteCompte(l, depuis = "comptes_plateformes") {
  if (!l || !l.site) return null;
  return { site: l.site, pays: l.pays ?? null, langue: l.langue ?? null, devise: l.devise ?? null, domaine: l.domaine ?? null,
    source: l.source ?? null, lu_le: l.lu_le ?? null, pilote: l.pilote === true, depuis };
}

/**
 * site_compte d'etatPublic : la ligne lue de comptes_plateformes si elle est celle de CE compte eBay (même EIAS), sinon
 * le site GetUser d'ebay_accounts par la même règle (avant la migration, ou ligne pas encore écrite). null = jamais lu.
 * @param {{ ebay_eias_token?: string|null, ebay_site?: string|null, ebay_site_lu_le?: string|null }|null} compte
 * @param {Record<string, any>|null} [ligneLue]
 */
export function siteCompteEbayPublic(compte, ligneLue = null) {
  if (!compte) return null;
  const eias = String(compte.ebay_eias_token ?? "").trim();
  if (ligneLue && ligneLue.plateforme === "ebay" && eias && String(ligneLue.compte ?? "") === eias) return vueSiteCompte(ligneLue);
  const lu = siteEbayDuGetUser(compte.ebay_site);
  if (!lu) return null;
  return vueSiteCompte({ site: lu.site, pays: lu.pays, langue: lu.langue, devise: lu.devise, domaine: lu.domaine,
    source: SOURCES_SITES.ebay, lu_le: compte.ebay_site_lu_le ?? null, pilote: false }, "ebay_accounts");
}
