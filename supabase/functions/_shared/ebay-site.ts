// ═══════════════════════════════════════════════════════════════════════════
// LE SITE eBAY DU COMPTE RELIÉ (09/10, Marta — règle de Nico)
// ═══════════════════════════════════════════════════════════════════════════
// Règle validée par Nico : on publie sur le site eBay où le vendeur a son
// compte, dans la langue de ce site, JAMAIS sur ebay.fr pour un compte
// étranger. Le code ne la tenait pas : tout part sur EBAY_FR (politiques,
// emplacement « FR », arbre de catégories 71, Content-Language fr-FR). Marta
// (compte « marte9087 », Italie) n'était retenue que par son compte inachevé
// (bloque_par_etat_ebay) ; une fois la configuration finie, ses annonces
// seraient parties sur ebay.fr, pays faux, texte français.
//
// Ici : le site d'inscription du compte (Trading GetUser → <Site>, lu avec le
// jeton DU vendeur, en lecture seule) est noté une fois dans
// ebay_accounts.ebay_site. Tant que FillSell ne publie que sur ebay.fr, un
// compte d'un autre site est RETENU, avec une phrase qui le dit — jamais
// envoyé sur ebay.fr. Site illisible → rien n'est décidé (comme avant).
// deno-lint-ignore-file no-explicit-any
import { lireIdentiteEbay, obtenirAccessToken, type EbayEnv } from "./ebay-oauth.ts";

/** Le site eBay sur lequel FillSell publie aujourd'hui (EBAY_FR, SITEID 71). */
export const SITE_EBAY_PUBLIE = "France";

/** Nom affiché d'un site GetUser, avec son domaine. */
const DOMAINES: Record<string, string> = {
  France: "ebay.fr", Italy: "ebay.it", Spain: "ebay.es", Germany: "ebay.de", Austria: "ebay.at",
  Belgium_French: "befr.ebay.be", Belgium_Dutch: "benl.ebay.be", Netherlands: "ebay.nl", Ireland: "ebay.ie",
  UK: "ebay.co.uk", US: "ebay.com", Switzerland: "ebay.ch", Poland: "ebay.pl", Canada: "ebay.ca",
  CanadaFrench: "cafr.ebay.ca", Australia: "ebay.com.au",
};
export function domaineSiteEbay(site: string | null | undefined): string | null {
  return site ? (DOMAINES[site] ?? null) : null;
}

/** Un compte d'un AUTRE site qu'ebay.fr (site connu seulement). */
export function siteEbayEtranger(site: string | null | undefined): boolean {
  return !!site && site !== SITE_EBAY_PUBLIE;
}

export const SOURCE_EBAY_SITE_ETRANGER = "ebay_site_etranger";

export function messageSiteEtranger(site: string, pseudo: string | null): string {
  const dom = domaineSiteEbay(site) ?? `eBay ${site}`;
  return `Ton compte eBay${pseudo ? ` « ${pseudo} »` : ""} est inscrit sur ${dom}. FillSell ne publie pas encore sur ${dom}, `
    + `et ne publiera jamais sur ebay.fr à la place d'un compte étranger : rien n'a été envoyé à eBay. `
    + `Tes annonces déjà en ligne restent suivies.`;
}

/**
 * Le site du compte relié : lu en base, sinon UNE lecture GetUser (au plus
 * une par 24 h quand elle échoue), notée dans ebay_accounts. null = inconnu.
 */
export async function siteDuCompteEbay(admin: any, env: EbayEnv, userId: string): Promise<{ site: string | null; pseudo: string | null }> {
  try {
    const { data } = await admin.from("ebay_accounts")
      .select("ebay_user_id, ebay_site, ebay_site_lu_le, revoked_at").eq("user_id", userId).maybeSingle();
    const ligne = data as { ebay_user_id?: string | null; ebay_site?: string | null; ebay_site_lu_le?: string | null; revoked_at?: string | null } | null;
    if (!ligne || ligne.revoked_at) return { site: null, pseudo: ligne?.ebay_user_id ?? null };
    if (ligne.ebay_site) return { site: ligne.ebay_site, pseudo: ligne.ebay_user_id ?? null };
    const essai = Date.parse(String(ligne.ebay_site_lu_le ?? ""));
    if (Number.isFinite(essai) && Date.now() - essai < 24 * 3600_000) return { site: null, pseudo: ligne.ebay_user_id ?? null };
    const jeton = await obtenirAccessToken(admin, userId);
    if (!jeton.ok) return { site: null, pseudo: ligne.ebay_user_id ?? null };
    const identite = await lireIdentiteEbay(env, jeton.token);
    await admin.from("ebay_accounts")
      .update({ ebay_site: identite.site ?? null, ebay_site_lu_le: new Date().toISOString() })
      .eq("user_id", userId);
    return { site: identite.site ?? null, pseudo: ligne.ebay_user_id ?? identite.username ?? null };
  } catch {
    return { site: null, pseudo: null };
  }
}
