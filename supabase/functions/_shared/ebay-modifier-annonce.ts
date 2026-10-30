// ═══════════════════════════════════════════════════════════════════════════
// MODIFIER UNE ANNONCE eBAY EN LIGNE DEPUIS FILLSELL (30/10/2026, lot E — thecloset72000)
// ═══════════════════════════════════════════════════════════════════════════
// CE QUI S'EST PASSÉ : « je ne peux pas modifier mes annonces eBay ». Confirmé :
// la voie API publie par l'Inventory API (createOrReplaceInventoryItem →
// createOffer → publishOffer, ebay-api-worker) — et eBay interdit de modifier
// ces annonces dans Seller Hub / Mes ventes : elles ne se modifient QUE par
// cette même API. FillSell n'offrait que « Republier » (retrait + nouvelle
// annonce : vues et favoris perdus, quota consommé).
// RÈGLE : la personne modifie titre, description et prix d'une annonce eBay
// publiée par l'API depuis FillSell ; on relit l'offre et l'article EN ENTIER,
// on ne réécrit que les champs demandés (PUT inventory_item, PUT offer — eBay
// révise l'annonce EN PLACE : même numéro, vues et favoris gardés), jamais un
// champ qu'on ne sait pas réécrire (une réécriture partielle l'effacerait).
// Mêmes listes que la révision de rayon du 11/10 (reviserRayonParLaRegle),
// prouvée sur de vraies annonces : elles vivent ici, le worker les importe.
import { appelEbay, type EbayEnv } from "./ebay-oauth.ts";
import { descriptionEbay, lireErreurEbay, titreEbay } from "./ebay-publication.ts";

export const CLES_OFFRE_ECRITES = ["availableQuantity", "categoryId", "charity", "extendedProducerResponsibility", "format", "hideBuyerDetails",
  "includeCatalogProductDetails", "listingDescription", "listingDuration", "listingPolicies", "listingStartDate", "lotSize",
  "merchantLocationKey", "pricingSummary", "quantityLimitPerBuyer", "regulatory", "secondaryCategoryId", "storeCategoryNames", "tax"];
export const CLES_OFFRE_LUES = ["offerId", "sku", "marketplaceId", "listing", "status"];
export const CLES_ARTICLE_ECRITES = ["availability", "condition", "conditionDescription", "conditionDescriptors", "packageWeightAndSize", "product"];
export const CLES_ARTICLE_LUES = ["sku", "locale", "groupIds", "inventoryItemGroupKeys"];

export function sousObjet(o: Record<string, unknown>, cles: string[]): Record<string, unknown> {
  const r: Record<string, unknown> = {};
  for (const k of cles) if (o[k] !== undefined) r[k] = o[k];
  return r;
}

export interface DemandeModification { titre?: string | null; description?: string | null; prix?: number | null }

/** La demande, propre : { titre, description, prix } retenus, ou l'erreur à dire. */
export function demandePropre(body: Record<string, unknown>): { ok: true; d: DemandeModification } | { ok: false; motif: string; message: string } {
  const d: DemandeModification = {};
  if (typeof body.titre === "string") {
    const t = titreEbay(body.titre);
    if (!t) return { ok: false, motif: "titre_vide", message: "Le titre ne peut pas être vide." };
    d.titre = t;
  }
  if (typeof body.description === "string") {
    const t = body.description.trim();
    if (!t) return { ok: false, motif: "description_vide", message: "La description ne peut pas être vide." };
    d.description = t;
  }
  if (body.prix != null && String(body.prix).trim() !== "") {
    const p = Number(String(body.prix).replace(",", "."));
    if (!Number.isFinite(p) || p <= 0 || p >= 100000) return { ok: false, motif: "prix_invalide", message: "Écris un prix en euros, par exemple 25 ou 19,90." };
    d.prix = Math.round(p * 100) / 100;
  }
  if (d.titre == null && d.description == null && d.prix == null) return { ok: false, motif: "rien_a_modifier", message: "Rien à modifier." };
  return { ok: true, d };
}

export type ResultatModification =
  | { ok: true; changements: string[]; listing_id: string }
  | { ok: false; motif: string; message: string; detail?: unknown };

/**
 * Révise EN PLACE une annonce publiée par l'API. Relit tout, réécrit l'article (titre, description) puis l'offre
 * (prix, description de l'annonce), dans cet ordre ; un refus d'eBay est rendu tel quel (sa phrase).
 */
export async function modifierAnnonceEbay(
  env: EbayEnv, token: string, ids: { sku: string; offerId: string; listingId: string }, d: DemandeModification,
): Promise<ResultatModification> {
  const [ro, ra] = await Promise.all([
    appelEbay(env, token, `/sell/inventory/v1/offer/${encodeURIComponent(ids.offerId)}`),
    appelEbay(env, token, `/sell/inventory/v1/inventory_item/${encodeURIComponent(ids.sku)}`),
  ]);
  if (ro.http !== 200 || !ro.json) return { ok: false, motif: `lecture_offre_${ro.http}`, message: "eBay n'a pas rendu l'annonce : réessaie dans un instant.", detail: lireErreurEbay(ro.json, ro.texte).message };
  if (ra.http !== 200 || !ra.json) return { ok: false, motif: `lecture_article_${ra.http}`, message: "eBay n'a pas rendu l'annonce : réessaie dans un instant.", detail: lireErreurEbay(ra.json, ra.texte).message };
  const offre = ro.json as Record<string, any>;
  const article = ra.json as Record<string, any>;
  if (offre.status !== "PUBLISHED" || offre.listing?.listingStatus !== "ACTIVE") {
    return { ok: false, motif: "annonce_pas_en_vente", message: "Cette annonce n'est plus en vente sur eBay : elle ne peut plus être modifiée." };
  }
  if (ids.listingId && String(offre.listing?.listingId ?? "") !== ids.listingId) {
    return { ok: false, motif: "annonce_differente", message: "L'annonce eBay ne correspond plus à cette publication : rien n'a été modifié." };
  }
  const inconnusOffre = Object.keys(offre).filter((k) => !CLES_OFFRE_ECRITES.includes(k) && !CLES_OFFRE_LUES.includes(k));
  const inconnusArticle = Object.keys(article).filter((k) => !CLES_ARTICLE_ECRITES.includes(k) && !CLES_ARTICLE_LUES.includes(k));
  if (inconnusOffre.length || inconnusArticle.length) {
    return { ok: false, motif: "champ_non_reecrivable", message: "Cette annonce porte un réglage eBay que FillSell ne sait pas réécrire : rien n'a été modifié.", detail: { offre: inconnusOffre, article: inconnusArticle } };
  }
  const changements: string[] = [];
  const titre = d.titre ?? String(article.product?.title ?? "");
  // 1. L'article : titre et description.
  if (d.titre != null || d.description != null) {
    const product = { ...(article.product ?? {}) };
    if (d.titre != null && d.titre !== product.title) { product.title = d.titre; changements.push("titre"); }
    if (d.description != null) { product.description = descriptionEbay(d.description, titre); changements.push("description"); }
    const corps = { ...sousObjet(article, CLES_ARTICLE_ECRITES), product };
    const p = await appelEbay(env, token, `/sell/inventory/v1/inventory_item/${encodeURIComponent(ids.sku)}`, { method: "PUT", body: corps });
    if (![200, 201, 204].includes(p.http)) {
      const e = lireErreurEbay(p.json, p.texte);
      return { ok: false, motif: `refus_article_${p.http}`, message: `eBay a refusé la modification : ${e.message}`, detail: { errorId: e.errorId } };
    }
  }
  // 2. L'offre : prix et description de l'annonce (eBay révise l'annonce en ligne).
  if (d.prix != null || d.description != null) {
    const corps = sousObjet(offre, CLES_OFFRE_ECRITES);
    if (d.prix != null) {
      const ps = (corps.pricingSummary ?? {}) as Record<string, any>;
      corps.pricingSummary = { ...ps, price: { ...(ps.price ?? {}), value: d.prix.toFixed(2), currency: String(ps.price?.currency ?? "EUR") } };
      changements.push("prix");
    }
    if (d.description != null) corps.listingDescription = descriptionEbay(d.description, titre);
    const p = await appelEbay(env, token, `/sell/inventory/v1/offer/${encodeURIComponent(ids.offerId)}`, { method: "PUT", body: corps });
    if (![200, 201, 204].includes(p.http)) {
      const e = lireErreurEbay(p.json, p.texte);
      const deja = changements.filter((c) => c !== "prix");
      return { ok: false, motif: `refus_offre_${p.http}`, message: `eBay a refusé la modification${deja.length ? ` du prix (${deja.join(", ")} déjà modifié${deja.length > 1 ? "s" : ""})` : ""} : ${e.message}`, detail: { errorId: e.errorId } };
    }
  }
  return { ok: true, changements: [...new Set(changements)], listing_id: String(offre.listing?.listingId ?? ids.listingId) };
}
