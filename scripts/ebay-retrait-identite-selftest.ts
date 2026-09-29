import assert from "node:assert/strict";
import { idAnnonceEbay, preuveIntentionRetraitRepublicationEbayMemorisee, preuveRetraitRepublicationEbayMemorisee, verifierOffreRetraitEbay, verifierSourceRetraitEbay } from "../supabase/functions/_shared/ebay-retrait-identite.ts";

const source = (listingId: string, apiListingId: string | null, handler = "ebay-api-worker 3-lens") => ({
  id: "a5d466df-4368-4777-91a7-4d84575c4fc4",
  action: "publish",
  status: "published",
  voie: "api",
  handler_build: handler,
  inventaire_id: 1789755871850004,
  listing_url: `https://www.ebay.fr/itm/${listingId}`,
  platform_listing_id: listingId,
  platform_fields: apiListingId ? {
    ebay_api: { listing_id: apiListingId, offer_id: "271090103011", sku: "fs-1789755871850004" },
  } : {},
});

// 89afc218 : une annonce de relevé, sans trace API, n'autorise aucun retrait.
const importe = verifierSourceRetraitEbay("377460399728", source("377460399728", null, "releve-annonces"));
assert.equal(importe.ok, false);
assert.equal(importe.ok ? "" : importe.motif, "source_non_depot_fillsell_api");

// 8ce613d3 / a5d466df : la colonne visait 377506248476 mais l'offre interne
// portait 377512032291. Le verdict tombe AVANT le POST /withdraw.
const contradictoire = verifierSourceRetraitEbay("377506248476", source("377506248476", "377512032291"));
assert.equal(contradictoire.ok, false);
assert.equal(contradictoire.ok ? "" : contradictoire.motif, "identifiants_source_contradictoires");
assert.equal(idAnnonceEbay({ listing_url: "https://www.ebay.fr/itm/377506248476", platform_listing_id: "377512032291" }), "",
  "deux identifiants contradictoires sur le retrait donnent une abstention, jamais un choix implicite");

const preuve = verifierSourceRetraitEbay("377506248476", source("377506248476", "377506248476"));
assert.equal(preuve.ok, true);
if (!preuve.ok) throw new Error("preuve cohérente attendue");

const sourceFicheSupprimee = { ...source("377506248476", "377506248476"), status: "cancelled" };
assert.equal(
  verifierSourceRetraitEbay("377506248476", sourceFicheSupprimee, { statutsAutorises: ["published", "cancelled"] }).ok,
  true,
  "la source exacte survit à la suppression de la fiche ; l'offre sera encore relue avant tout retrait",
);
assert.equal(verifierSourceRetraitEbay("377506248476", sourceFicheSupprimee).ok, false,
  "un appelant qui n'autorise pas explicitement une source annulée reste fermé");

assert.deepEqual(verifierOffreRetraitEbay(preuve, {
  offerId: preuve.offer_id,
  sku: preuve.sku,
  status: "PUBLISHED",
  listing: { listingId: "377512032291", listingStatus: "ACTIVE" },
}), { ok: false, motif: "listing_id_contradictoire", detail: "377512032291" });

assert.deepEqual(verifierOffreRetraitEbay(preuve, {
  offerId: preuve.offer_id,
  sku: preuve.sku,
  status: "PUBLISHED",
  listing: { listingId: preuve.cible, listingStatus: "ACTIVE" },
}), { ok: true, listing_id: preuve.cible, deja_retiree: false });

assert.deepEqual(verifierOffreRetraitEbay(preuve, {
  offerId: preuve.offer_id,
  sku: preuve.sku,
  status: "UNPUBLISHED",
  listing: null,
}, { accepterDejaRetiree: true }), {
  ok: true,
  listing_id: preuve.cible,
  deja_retiree: true,
}, "une offre exacte déjà hors ligne est reconnue, mais la règle appelante doit encore prouver l'absence de vente");

assert.deepEqual(verifierOffreRetraitEbay(preuve, {
  offerId: preuve.offer_id,
  sku: preuve.sku,
  status: "UNPUBLISHED",
  listing: null,
}), { ok: false, motif: "offre_non_publiee", detail: "UNPUBLISHED" },
"un retrait neuf ne transforme pas une offre hors ligne en permission implicite sans l'option d'idempotence");

const intention = preuveIntentionRetraitRepublicationEbayMemorisee({
  listing_url: `https://www.ebay.fr/itm/${preuve.cible}`,
  platform_listing_id: preuve.cible,
  platform_fields: {
    republish_step: "withdrawing",
    ebay_republish_withdrawal_intent: {
      source_job_id: preuve.source_job_id,
      listing_id: preuve.cible,
      offer_id: preuve.offer_id,
      sku: preuve.sku,
      requested_at: "2026-09-29T11:59:00.000Z",
    },
  },
}, Date.parse("2026-09-29T12:05:00.000Z"));
assert.deepEqual(intention, {
  cible: preuve.cible,
  offer_id: preuve.offer_id,
  sku: preuve.sku,
  source_job_id: preuve.source_job_id,
  requested_at: "2026-09-29T11:59:00.000Z",
}, "l'intention exacte écrite avant withdraw survit à un arrêt du worker");

const memorisee = preuveRetraitRepublicationEbayMemorisee({
  listing_url: `https://www.ebay.fr/itm/${preuve.cible}`,
  platform_listing_id: preuve.cible,
  platform_fields: {
    republish_step: "deleted",
    ebay_republish_withdrawal: {
      source_job_id: preuve.source_job_id,
      listing_id: preuve.cible,
      offer_id: preuve.offer_id,
      sku: preuve.sku,
      completed_at: "2026-09-29T12:00:00.000Z",
      methode: "withdraw_response",
    },
  },
}, Date.parse("2026-09-29T12:05:00.000Z"));
assert.deepEqual(memorisee, {
  cible: preuve.cible,
  offer_id: preuve.offer_id,
  sku: preuve.sku,
  source_job_id: preuve.source_job_id,
  completed_at: "2026-09-29T12:00:00.000Z",
  methode: "withdraw_response",
}, "le cycle suivant reprend la recréation depuis la preuve persistée, sans second withdraw");

assert.equal(preuveRetraitRepublicationEbayMemorisee({
  listing_url: `https://www.ebay.fr/itm/${preuve.cible}`,
  platform_listing_id: preuve.cible,
  platform_fields: {
    republish_step: "deleted",
    ebay_republish_withdrawal: {
      source_job_id: preuve.source_job_id,
      listing_id: "377512032291",
      offer_id: preuve.offer_id,
      sku: preuve.sku,
      completed_at: "2026-09-29T12:00:00.000Z",
      methode: "withdraw_response",
    },
  },
}, Date.parse("2026-09-29T12:05:00.000Z")), null,
"une preuve persistée contradictoire ne permet jamais la recréation");

console.log("✓ retrait eBay API : identité exacte, intention durable et reprise sans vente prouvée");
