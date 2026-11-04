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
import { valeurDansLaListe, type AspectDuCatalogue } from "./ebay-aspects-du-texte.ts";

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

// (04/11, point 3 — décision de Nico) + les caractéristiques (aspects : nom → valeurs ; [] retire la caractéristique) et
// les photos (adresses https, dans l'ordre, 24 au plus) : TOUT se modifie depuis FillSell, puisque eBay l'interdit sur
// son site pour ces annonces.
export interface DemandeModification {
  titre?: string | null; description?: string | null; prix?: number | null;
  aspects?: Record<string, string[]> | null; photos?: string[] | null;
}
export const PHOTOS_MAX_EBAY = 24;
const VALEUR_ASPECT_MAX = 65;

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
  if (body.aspects != null) {
    if (typeof body.aspects !== "object" || Array.isArray(body.aspects)) return { ok: false, motif: "aspects_illisibles", message: "Caractéristiques illisibles." };
    const aspects: Record<string, string[]> = {};
    for (const [nomBrut, v] of Object.entries(body.aspects as Record<string, unknown>)) {
      const nom = String(nomBrut ?? "").trim();
      if (!nom || nom.length > VALEUR_ASPECT_MAX) return { ok: false, motif: "aspect_nom", message: "Une caractéristique porte un nom illisible." };
      const valeurs = (Array.isArray(v) ? v : [v]).map((x) => String(x ?? "").trim()).filter(Boolean);
      if (valeurs.length > 30 || valeurs.some((x) => x.length > VALEUR_ASPECT_MAX)) {
        return { ok: false, motif: "aspect_valeur", message: `« ${nom} » : 65 caractères au plus par valeur.` };
      }
      aspects[nom] = [...new Set(valeurs)];
    }
    if (Object.keys(aspects).length > 60) return { ok: false, motif: "aspects_trop", message: "Trop de caractéristiques à la fois." };
    if (Object.keys(aspects).length) d.aspects = aspects;
  }
  if (body.photos != null) {
    const photos = (Array.isArray(body.photos) ? body.photos : []).map((x) => String(x ?? "").trim()).filter(Boolean);
    if (!photos.length) return { ok: false, motif: "photos_vides", message: "Une annonce eBay garde au moins une photo." };
    if (photos.length > PHOTOS_MAX_EBAY) return { ok: false, motif: "photos_trop", message: `eBay accepte ${PHOTOS_MAX_EBAY} photos au plus.` };
    if (photos.some((u) => !/^https:\/\/\S+$/i.test(u) || u.length > 500)) return { ok: false, motif: "photos_adresse", message: "Une photo n'a pas d'adresse https valide." };
    d.photos = [...new Set(photos)];
  }
  if (d.titre == null && d.description == null && d.prix == null && d.aspects == null && d.photos == null) return { ok: false, motif: "rien_a_modifier", message: "Rien à modifier." };
  return { ok: true, d };
}

export type ResultatModification =
  | { ok: true; changements: string[]; listing_id: string }
  | { ok: false; motif: string; message: string; detail?: unknown };

/**
 * Révise EN PLACE une annonce publiée par l'API. Relit tout, réécrit l'article (titre, description) puis l'offre
 * (prix, description de l'annonce), dans cet ordre ; un refus d'eBay est rendu tel quel (sa phrase).
 */
/**
 * (04/11) Les caractéristiques demandées, contrôlées contre la catégorie de l'annonce : une liste FERMÉE n'accepte
 * qu'une de ses entrées (recalée à l'écriture exacte d'eBay), une caractéristique à valeur unique n'en prend qu'une, une
 * caractéristique obligatoire ne se retire pas. Catalogue absent : eBay tranche (sa phrase est rendue).
 */
export function aspectsControles(
  demandes: Record<string, string[]>, catalogue: AspectDuCatalogue[] | null,
): { ok: true; aspects: Record<string, string[]> } | { ok: false; motif: string; message: string } {
  const out: Record<string, string[]> = {};
  for (const [nom, valeurs] of Object.entries(demandes)) {
    const a = (catalogue ?? []).find((c) => c.name === nom) as (AspectDuCatalogue & { cardinality?: string | null }) | undefined;
    if (!a) { out[nom] = valeurs; continue; }
    if (!valeurs.length) {
      if (a.required) return { ok: false, motif: "aspect_obligatoire", message: `« ${nom} » est obligatoire pour eBay : choisis une valeur au lieu de la retirer.` };
      out[nom] = []; continue;
    }
    if (a.cardinality === "SINGLE" && valeurs.length > 1) return { ok: false, motif: "aspect_unique", message: `« ${nom} » n'accepte qu'une seule valeur.` };
    const liste = Array.isArray(a.allowedValues) ? a.allowedValues : [];
    if (a.mode === "SELECTION_ONLY" && liste.length) {
      const recalees: string[] = [];
      for (const v of valeurs) {
        const r = valeurDansLaListe(v, liste);
        if (!r) return { ok: false, motif: "aspect_hors_liste", message: `« ${v} » n'est pas une valeur d'eBay pour « ${nom} » : choisis-la dans la liste.` };
        recalees.push(r);
      }
      out[nom] = recalees;
    } else {
      out[nom] = valeurs.map((v) => valeurDansLaListe(v, liste) ?? v);
    }
  }
  return { ok: true, aspects: out };
}

export interface AnnonceLue { titre: string; description: string; prix: number | null; aspects: Record<string, string[]>; photos: string[]; categoryId: string }

/** (04/11) L'annonce telle qu'eBay la porte (article + offre), pour pré-remplir l'écran de modification. */
export async function lireAnnonceEbay(
  env: EbayEnv, token: string, ids: { sku: string; offerId: string; listingId: string },
): Promise<{ ok: true; annonce: AnnonceLue } | { ok: false; motif: string; message: string }> {
  const [ro, ra] = await Promise.all([
    appelEbay(env, token, `/sell/inventory/v1/offer/${encodeURIComponent(ids.offerId)}`),
    appelEbay(env, token, `/sell/inventory/v1/inventory_item/${encodeURIComponent(ids.sku)}`),
  ]);
  if (ro.http !== 200 || !ro.json || ra.http !== 200 || !ra.json) {
    return { ok: false, motif: `lecture_${ro.http}_${ra.http}`, message: "eBay n'a pas rendu l'annonce : réessaie dans un instant." };
  }
  const offre = ro.json as Record<string, any>;
  const article = ra.json as Record<string, any>;
  if (offre.status !== "PUBLISHED" || offre.listing?.listingStatus !== "ACTIVE") {
    return { ok: false, motif: "annonce_pas_en_vente", message: "Cette annonce n'est plus en vente sur eBay : elle ne peut plus être modifiée." };
  }
  if (ids.listingId && String(offre.listing?.listingId ?? "") !== ids.listingId) {
    return { ok: false, motif: "annonce_differente", message: "L'annonce eBay ne correspond plus à cette publication." };
  }
  const prix = Number(offre.pricingSummary?.price?.value);
  const aspects: Record<string, string[]> = {};
  for (const [k, v] of Object.entries((article.product?.aspects ?? {}) as Record<string, unknown>)) {
    aspects[k] = (Array.isArray(v) ? v : [v]).map((x) => String(x ?? "")).filter(Boolean);
  }
  return { ok: true, annonce: {
    titre: String(article.product?.title ?? ""), description: String(article.product?.description ?? ""),
    prix: Number.isFinite(prix) ? prix : null, aspects,
    photos: (Array.isArray(article.product?.imageUrls) ? article.product.imageUrls : []).map((u: unknown) => String(u)).filter(Boolean),
    categoryId: String(offre.categoryId ?? ""),
  } };
}

export async function modifierAnnonceEbay(
  env: EbayEnv, token: string, ids: { sku: string; offerId: string; listingId: string }, d: DemandeModification,
  catalogue: ((categoryId: string) => Promise<AspectDuCatalogue[] | null>) | null = null,
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
  // (04/11) Les caractéristiques, contrôlées contre la catégorie de l'annonce AVANT toute écriture.
  let aspectsEcrits: Record<string, string[]> | null = null;
  if (d.aspects) {
    const cat = catalogue ? await catalogue(String(offre.categoryId ?? "")).catch(() => null) : null;
    const c = aspectsControles(d.aspects, cat);
    if (!c.ok) return c;
    aspectsEcrits = c.aspects;
  }
  // 1. L'article : titre, description, caractéristiques, photos.
  if (d.titre != null || d.description != null || aspectsEcrits || d.photos) {
    const product = { ...(article.product ?? {}) };
    if (d.titre != null && d.titre !== product.title) { product.title = d.titre; changements.push("titre"); }
    if (d.description != null) { product.description = descriptionEbay(d.description, titre); changements.push("description"); }
    if (aspectsEcrits) {
      const aspects: Record<string, string[]> = { ...((product.aspects ?? {}) as Record<string, string[]>) };
      for (const [k, v] of Object.entries(aspectsEcrits)) { if (v.length) aspects[k] = v; else delete aspects[k]; }
      product.aspects = aspects;
      changements.push("caracteristiques");
    }
    if (d.photos) { product.imageUrls = d.photos; changements.push("photos"); }
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
