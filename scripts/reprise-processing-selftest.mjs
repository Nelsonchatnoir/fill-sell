// Autotest de la reprise des jobs 'processing' figés (handler-watch, 02/10).
// Cas fondateur : ornellaracano, retrait Vinted fb9cd238, 22 h en cours.
import assert from "node:assert/strict";
import {
  motifReprise, silenceDuDetenteur, sessionDuPoste, ageProcessing, estEtapeDestructive,
  REPRISE_PLAFOND_MS,
} from "../supabase/functions/_shared/reprise-processing.js";

const now = Date.parse("2026-10-01T21:20:00Z");
const min = (n) => n * 60_000;
const il_y_a = (ms) => new Date(now - ms).toISOString();

// Le cas d'Ornella : pris à 01:43 par 250107fb, muet depuis ; trois autres
// postes du compte vivants (le compte n'est jamais muet).
const postes = {
  "250107fb-95ce-47d9-bc00-0ccdbc8fcfcf": { le: "2026-09-30T23:43:03.187Z" },
  "08912348-5bbe-47bd-a07e-0f8b90044ffd": { le: il_y_a(min(1)) },
};
const retrait = { id: "fb9cd238", action: "delete", platform: "vinted", voie: "extension",
  created_at: "2026-09-30T19:13:00Z", platform_fields: { processing_since: "2026-09-30T23:43:00Z" } };
const s = silenceDuDetenteur({ reservationPoste: "250107fb-95ce-47d9-bc00-0ccdbc8fcfcf", postes, compteVuLe: il_y_a(min(1)), now });
assert.equal(s.source, "poste");
assert.ok(s.ms > min(30));
assert.equal(motifReprise(retrait, { silenceMs: s.ms, now }), "plafond");
// Même job à 50 min : détenteur muet → repris ; détenteur vivant → laissé.
const recent = { ...retrait, platform_fields: { processing_since: il_y_a(min(50)) } };
assert.equal(motifReprise(recent, { silenceMs: s.ms, now }), "poste_muet");
assert.equal(motifReprise(recent, { silenceMs: min(2), now }), null);
// Moins de 45 min : jamais, même poste muet (l'extension elle-même attend 15 min).
assert.equal(motifReprise({ ...retrait, platform_fields: { processing_since: il_y_a(min(40)) } }, { silenceMs: Infinity, now }), null);
// Plafond 2 h : repris même si le détenteur parle encore.
assert.equal(motifReprise({ ...retrait, platform_fields: { processing_since: il_y_a(REPRISE_PLAFOND_MS) } }, { silenceMs: 0, now }), "plafond");
// Retrait SANS lien d'annonce : même règle (aucune condition sur listing_url).
assert.equal(motifReprise({ ...recent, listing_url: null }, { silenceMs: Infinity, now }), "poste_muet");
// Publication, republication a_capturer : même règle.
assert.equal(motifReprise({ ...recent, action: "publish" }, { silenceMs: Infinity, now }), "poste_muet");
assert.equal(motifReprise({ ...recent, action: "republish" }, { silenceMs: Infinity, now }), "poste_muet");
// Étapes qui retirent l'annonce : 24 h seulement (leurs reprises 30/45 min, capture valide, sont à part).
const capt = { ...recent, action: "republish", platform_fields: { ...recent.platform_fields, republish_step: "captured" } };
assert.equal(estEtapeDestructive(capt), true);
assert.equal(motifReprise(capt, { silenceMs: Infinity, now }), null);
assert.equal(motifReprise({ ...capt, platform_fields: { republish_step: "deleted", processing_since: il_y_a(min(3 * 60)) } }, { silenceMs: Infinity, now }), null);
assert.equal(motifReprise({ ...capt, platform_fields: { republish_step: "deleted", processing_since: il_y_a(25 * 3600_000) } }, { silenceMs: 0, now }), "destructive_24h");
// Voie API eBay : jamais ici.
assert.equal(motifReprise({ ...retrait, voie: "api" }, { silenceMs: Infinity, now }), null);
// processing_since illisible → created_at, jamais NaN.
assert.equal(ageProcessing({ created_at: il_y_a(min(60)), platform_fields: { processing_since: "n'importe quoi" } }, now), min(60));
assert.equal(ageProcessing({}, now), Infinity);
// Identifiant de poste « session/instance » (deux extensions, même JWT).
assert.equal(sessionDuPoste("250107fb-95ce-47d9-bc00-0ccdbc8fcfcf/0f0e0d0c-0b0a-0908-0706-050403020100"), "250107fb-95ce-47d9-bc00-0ccdbc8fcfcf");
assert.equal(sessionDuPoste(""), null);
// Poste détenteur absent des postes connus (purgé après 48 h) : silence infini.
assert.equal(silenceDuDetenteur({ reservationPoste: "inconnu", postes, compteVuLe: il_y_a(0), now }).ms, Infinity);
// Sans réservation : le compte.
const c = silenceDuDetenteur({ reservationPoste: null, postes, compteVuLe: il_y_a(min(5)), now });
assert.equal(c.source, "compte");
assert.equal(c.ms, min(5));
console.log("Reprise des « en cours » figés : 22 contrôles OK (poste détenteur, plafond 2 h, étapes destructives, voie API).");
