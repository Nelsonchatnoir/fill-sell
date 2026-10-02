// Autotest de la règle de demande d'avis (02/10/2026).
// `npm run selftest:avis-demande`
import assert from "node:assert/strict";
import { AVIS, issueJob, serieReussites, decisionAvis } from "../supabase/functions/_shared/avis-demande.js";

const now = Date.parse("2026-10-02T12:00:00Z");
const J = 24 * 3600_000;
const il_y_a = (n) => new Date(now - n).toISOString();

let k = 0;
const job = (status, extra = {}) => ({
  id: `j${++k}`, action: "publish", status, created_at: il_y_a((1000 - k) * 60_000),
  published_at: status === "published" || status === "sold" ? il_y_a(60_000) : null,
  handler_build: "2026-10-01T17:33:08Z+9411980", platform_fields: {}, ...extra,
});
const reussites = (n, extra = {}) => Array.from({ length: n }, () => job("published", extra));

// ── Issue d'un job ──────────────────────────────────────────────────────────
assert.equal(issueJob(job("published")), "reussite");
assert.equal(issueJob(job("sold")), "reussite");
assert.equal(issueJob({ ...job("deleted"), action: "delete" }), "reussite");
assert.equal(issueJob({ ...job("published"), action: "republish" }), "reussite");
assert.equal(issueJob(job("published", { published_at: null })), "neutre", "publié sans date = rien prouvé");
assert.equal(issueJob(job("failed")), "echec");
assert.equal(issueJob(job("needs_user")), "echec");
assert.equal(issueJob(job("pending", { platform_fields: { pas_de_rouge: { verdict: "reprise" } } })), "echec", "pause de notre fait");
assert.equal(issueJob(job("pending", { platform_fields: { retenue_serveur: { motif: "isbn" } } })), "echec", "retenue serveur = pause de notre fait");
assert.equal(issueJob(job("pending", { platform_fields: { retenue_serveur: { motif: "isbn" }, retenue_levee: true } })), "neutre");
assert.equal(issueJob(job("pending")), "neutre", "en file, pas encore tenté");
assert.equal(issueJob(job("processing")), "en_cours");
assert.equal(issueJob(job("cancelled")), "neutre", "annulé par la personne");
assert.equal(issueJob(job("cancelled", { platform_fields: { pas_de_rouge: { verdict: "info" } } })), "echec", "clos par notre classeur");
assert.equal(issueJob(job("published", { handler_build: "releve-annonces" })), "neutre", "import ≠ publication");
assert.equal(issueJob(job("published", { handler_build: "sync-dressing 0.6.80" })), "neutre");
assert.equal(issueJob(job("cancelled", { platform: "opla", platform_fields: { opla_sortie: { le: "2026-10-02" } } })), "neutre", "sortie d'Opla : ni réussite ni échec");
assert.equal(issueJob({ ...job("published"), action: "sync" }), "neutre");

// ── Série ───────────────────────────────────────────────────────────────────
k = 0;
const vieil_echec = job("failed");
const dix = reussites(10);
assert.equal(serieReussites([vieil_echec, ...dix]).serie, 10, "un échec AVANT les 10 ne compte pas");
k = 0;
const neuf = reussites(9);
const echec_recent = job("needs_user");
const une = reussites(1);
assert.equal(serieReussites([...neuf, echec_recent, ...une]).serie, 1, "le moindre échec remet à zéro");
assert.equal(serieReussites([...dix].reverse()).serie, 10, "l'ordre d'entrée ne compte pas");

// ── Décision ────────────────────────────────────────────────────────────────
const base = {
  maintenant: now,
  compteCreeLe: il_y_a(30 * J),
  entreeFinieLe: il_y_a(29 * J),
  jobs: dix,
  evenements: [],
  paiementsLes: [],
};
assert.deepEqual(decisionAvis(base), { ouvrir: true, motif: "serie_atteinte", serie: 10 });
assert.equal(decisionAvis({ ...base, jobs: dix.slice(1) }).ouvrir, false, "9 ne suffit pas");
assert.equal(decisionAvis({ ...base, compteCreeLe: il_y_a(2 * J) }).motif, "compte_trop_recent");
assert.equal(decisionAvis({ ...base, compteCreeLe: il_y_a(3 * J + 1) }).ouvrir, true, "3 jours passés");
assert.equal(decisionAvis({ ...base, entreeFinieLe: null }).motif, "entree_pas_finie");
assert.equal(decisionAvis({ ...base, compteCreeLe: null }).motif, "compte_illisible", "fait illisible = on n'ouvre pas");
assert.equal(decisionAvis({ ...base, paiementsLes: [il_y_a(23 * 3600_000)] }).motif, "paiement_recent");
assert.equal(decisionAvis({ ...base, paiementsLes: [il_y_a(25 * 3600_000)] }).ouvrir, true);
assert.equal(decisionAvis({ ...base, jobs: [...dix, job("processing")] }).motif, "action_en_cours");

const ev = (evenement, age) => ({ created_at: il_y_a(age), metadata: { evenement, plateforme: "web" } });
assert.equal(decisionAvis({ ...base, evenements: [ev("deja_fait", 400 * J)] }).motif, "deja_fait", "déjà fait = plus jamais");
// Décision de Nico (02/10) : « Laisser un avis » / « C'est déjà fait » sur
// l'extension ou le web = plus jamais SUR CE CANAL (chrome) ; le mobile ne
// garde que la règle des 60 jours.
const evp = (evenement, age, plateforme) => ({ created_at: il_y_a(age), metadata: { evenement, plateforme } });
assert.equal(decisionAvis({ ...base, plateforme: "web", evenements: [evp("laisser_avis", 400 * J, "extension")] }).motif, "avis_laisse", "laissé depuis l'extension : plus jamais sur le web (même page d'avis)");
assert.equal(decisionAvis({ ...base, plateforme: "extension", evenements: [evp("laisser_avis", 400 * J, "web")] }).motif, "avis_laisse");
assert.equal(decisionAvis({ ...base, plateforme: "ios", evenements: [evp("laisser_avis", 400 * J, "web")] }).ouvrir, true, "le mobile n'est pas concerné");
assert.equal(decisionAvis({ ...base, plateforme: "android", evenements: [evp("deja_fait", 400 * J, "extension")] }).ouvrir, true);
assert.equal(decisionAvis({ ...base, plateforme: "ios", evenements: [evp("affiche", 59 * J, "web")] }).motif, "demande_recente", "60 jours entre deux demandes, tous canaux");
assert.equal(decisionAvis({ ...base, plateforme: "android", evenements: [evp("affiche", 61 * J, "android")] }).ouvrir, true, "mobile : 60 jours, puis de nouveau");
assert.equal(decisionAvis({ ...base, plateforme: "ios", evenements: [evp("plus_tard", 10 * J, "web")] }).ouvrir, true, "« Plus tard » (web) ne ferme pas le mobile");
assert.equal(decisionAvis({ ...base, evenements: [ev("affiche", 59 * J)] }).motif, "demande_recente", "60 jours entre deux demandes");
assert.equal(decisionAvis({ ...base, evenements: [ev("plus_tard", 29 * J)] }).motif, "plus_tard", "plus tard = 30 jours");
assert.equal(decisionAvis({ ...base, evenements: [ev("plus_tard", 31 * J)] }).ouvrir, true);
// Une demande consomme la série : 10 réussites AVANT la demande ne rouvrent rien.
assert.equal(decisionAvis({ ...base, evenements: [ev("affiche", 61 * J)], jobs: dix.map((j) => ({ ...j, created_at: il_y_a(62 * J) })) }).motif, "serie_insuffisante");
assert.equal(decisionAvis({ ...base, evenements: [ev("affiche", 61 * J)] }).ouvrir, true, "10 nouvelles réussites après la demande");
assert.equal(AVIS.URL_AVIS_EXTENSION, "https://chromewebstore.google.com/detail/ooeagobimgoabciggfamljdfpkginhnm/reviews");

console.log("avis-demande : tous les contrôles passent");
