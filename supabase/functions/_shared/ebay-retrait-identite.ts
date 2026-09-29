export interface SourceRetraitEbay {
  id?: unknown;
  action?: unknown;
  status?: unknown;
  voie?: unknown;
  handler_build?: unknown;
  inventaire_id?: unknown;
  listing_url?: unknown;
  platform_listing_id?: unknown;
  platform_fields?: unknown;
}

export interface OffreRetraitEbay {
  offerId?: unknown;
  sku?: unknown;
  status?: unknown;
  listing?: { listingId?: unknown; listingStatus?: unknown } | null;
}

function texte(v: unknown): string {
  return String(v ?? "").trim();
}

export function idAnnonceEbay(v: Pick<SourceRetraitEbay, "listing_url" | "platform_listing_id">): string {
  const depuisLien = idDepuisLienEbay(v.listing_url);
  const colonne = texte(v.platform_listing_id);
  if (depuisLien && colonne && depuisLien !== colonne) return "";
  return depuisLien || colonne;
}

function idDepuisLienEbay(v: unknown): string {
  return texte(v).match(/\/itm\/(?:[^/?#]*\/)?(\d{9,})(?:[/?#]|$)/i)?.[1] ?? "";
}

export type VerdictIdentiteRetraitEbay =
  | { ok: true; cible: string; source_job_id: string; offer_id: string; sku: string }
  | { ok: false; motif: string; cible: string; detail?: string };

export function verifierSourceRetraitEbay(
  cibleBrute: unknown,
  source: SourceRetraitEbay | null,
  { statutsAutorises = ["published"] }: { statutsAutorises?: string[] } = {},
): VerdictIdentiteRetraitEbay {
  const cible = texte(cibleBrute);
  if (!/^\d{9,}$/.test(cible)) return { ok: false, motif: "cible_absente", cible };
  if (!source) return { ok: false, motif: "publication_api_absente", cible };

  const pf = source.platform_fields && typeof source.platform_fields === "object"
    ? source.platform_fields as Record<string, unknown> : {};
  const api = pf.ebay_api && typeof pf.ebay_api === "object"
    ? pf.ebay_api as Record<string, unknown> : {};
  const ids = {
    colonne: texte(source.platform_listing_id),
    lien: idDepuisLienEbay(source.listing_url),
    api: texte(api.listing_id),
  };
  const handler = texte(source.handler_build);
  const offerId = texte(api.offer_id);
  const sku = texte(api.sku);

  if (!["publish", "republish"].includes(texte(source.action)) || texte(source.voie) !== "api"
      || /sync-dressing|releve-annonces/i.test(handler)) {
    return { ok: false, motif: "source_non_depot_fillsell_api", cible, detail: handler || "handler absent" };
  }
  if (!statutsAutorises.includes(texte(source.status))) {
    return { ok: false, motif: "source_non_publiee", cible, detail: texte(source.status) };
  }
  if (!ids.colonne || !ids.api || !offerId || !sku) {
    return { ok: false, motif: "preuve_api_incomplete", cible };
  }
  const contradictoire = Object.entries(ids).find(([, id]) => id && id !== cible);
  if (contradictoire) {
    return { ok: false, motif: "identifiants_source_contradictoires", cible, detail: `${contradictoire[0]}=${contradictoire[1]}` };
  }
  if (ids.colonne !== cible || ids.api !== cible) {
    return { ok: false, motif: "preuve_api_incomplete", cible };
  }
  return { ok: true, cible, source_job_id: texte(source.id), offer_id: offerId, sku };
}

type PreuveCycleRetraitEbay = {
  cible: string;
  offer_id: string;
  sku: string;
  source_job_id: string;
};

function preuveCycleRetraitEbay(
  job: Pick<SourceRetraitEbay, "listing_url" | "platform_listing_id" | "platform_fields">,
  cle: "ebay_republish_withdrawal_intent" | "ebay_republish_withdrawal",
  etape: "withdrawing" | "deleted",
  dateCle: "requested_at" | "completed_at",
  maintenant: number,
): (PreuveCycleRetraitEbay & { at: string; methode?: string }) | null {
  const pf = job.platform_fields && typeof job.platform_fields === "object"
    ? job.platform_fields as Record<string, unknown>
    : {};
  const trace = pf[cle] && typeof pf[cle] === "object"
    ? pf[cle] as Record<string, unknown>
    : null;
  const cible = idAnnonceEbay(job);
  if (pf.republish_step !== etape || !trace || !cible) return null;
  const listingId = texte(trace.listing_id);
  const offerId = texte(trace.offer_id);
  const sku = texte(trace.sku);
  const sourceJobId = texte(trace.source_job_id);
  const at = texte(trace[dateCle]);
  const atMs = Date.parse(at);
  if (listingId !== cible || !offerId || !sku || !sourceJobId || !Number.isFinite(atMs)
      || atMs > maintenant + 60_000) return null;
  return { cible, offer_id: offerId, sku, source_job_id: sourceJobId, at, methode: texte(trace.methode) || undefined };
}

export function preuveIntentionRetraitRepublicationEbayMemorisee(
  job: Pick<SourceRetraitEbay, "listing_url" | "platform_listing_id" | "platform_fields">,
  maintenant = Date.now(),
): (PreuveCycleRetraitEbay & { requested_at: string }) | null {
  const preuve = preuveCycleRetraitEbay(
    job,
    "ebay_republish_withdrawal_intent",
    "withdrawing",
    "requested_at",
    maintenant,
  );
  return preuve && {
    cible: preuve.cible,
    offer_id: preuve.offer_id,
    sku: preuve.sku,
    source_job_id: preuve.source_job_id,
    requested_at: preuve.at,
  };
}

export function verifierOffreRetraitEbay(
  preuve: Extract<VerdictIdentiteRetraitEbay, { ok: true }>,
  offre: OffreRetraitEbay | null,
  { accepterDejaRetiree = false }: { accepterDejaRetiree?: boolean } = {},
): { ok: true; listing_id: string; deja_retiree: boolean } | { ok: false; motif: string; detail?: string } {
  if (!offre) return { ok: false, motif: "offre_api_illisible" };
  const offerId = texte(offre.offerId);
  const sku = texte(offre.sku);
  const statut = texte(offre.status);
  const listingId = texte(offre.listing?.listingId);
  if (offerId && offerId !== preuve.offer_id) return { ok: false, motif: "offre_id_contradictoire", detail: offerId };
  if (sku !== preuve.sku) return { ok: false, motif: "sku_contradictoire", detail: sku };
  if (listingId && listingId !== preuve.cible) return { ok: false, motif: "listing_id_contradictoire", detail: listingId };
  if (statut === "PUBLISHED") {
    if (!listingId) return { ok: false, motif: "listing_id_absent" };
    return { ok: true, listing_id: listingId, deja_retiree: false };
  }
  if (accepterDejaRetiree && statut === "UNPUBLISHED") {
    return { ok: true, listing_id: listingId || preuve.cible, deja_retiree: true };
  }
  return { ok: false, motif: "offre_non_publiee", detail: statut };
}

export function preuveRetraitRepublicationEbayMemorisee(
  job: Pick<SourceRetraitEbay, "listing_url" | "platform_listing_id" | "platform_fields">,
  maintenant = Date.now(),
): (PreuveCycleRetraitEbay & { completed_at: string; methode: "withdraw_response" | "offer_unpublished_browse_no_sale" }) | null {
  const preuve = preuveCycleRetraitEbay(
    job,
    "ebay_republish_withdrawal",
    "deleted",
    "completed_at",
    maintenant,
  );
  if (!preuve || !["withdraw_response", "offer_unpublished_browse_no_sale"].includes(preuve.methode ?? "")) return null;
  return {
    cible: preuve.cible,
    offer_id: preuve.offer_id,
    sku: preuve.sku,
    source_job_id: preuve.source_job_id,
    completed_at: preuve.at,
    methode: preuve.methode as "withdraw_response" | "offer_unpublished_browse_no_sale",
  };
}
