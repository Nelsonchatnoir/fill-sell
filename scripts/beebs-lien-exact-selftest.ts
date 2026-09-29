import { strict as assert } from "node:assert";
import fs from "node:fs";
import vm from "node:vm";
import {
  choisirIdentifiantBeebsExact,
  restaurerPublicationBeebsConfirmee,
  type ReleveBeebsExact,
} from "../supabase/functions/_shared/beebs-lien-exact.ts";

const depot = { id: "job-a", user_id: "u1", inventaire_id: 42 };
const ligne = (patch: Partial<ReleveBeebsExact> = {}): ReleveBeebsExact => ({
  job_id: "job-a",
  user_id: "u1",
  inventaire_id: 42,
  listing_id: "34015033",
  disparu_le: null,
  source_rapprochement: "job",
  ...patch,
});

assert.deepEqual(
  choisirIdentifiantBeebsExact(depot, [ligne()], 1),
  { ok: true, id: "34015033", preuve: "job_id_exact" },
  "le job_id exact rattache l'identifiant exact",
);
assert.deepEqual(
  choisirIdentifiantBeebsExact(depot, [ligne({ job_id: "suivi", source_rapprochement: "manuel" })], 1),
  { ok: true, id: "34015033", preuve: "inventaire_confirme_par_utilisateur" },
  "le geste utilisateur rattache l'identifiant exact à l'unique dépôt de la fiche",
);
assert.equal(
  choisirIdentifiantBeebsExact(depot, [ligne({ job_id: "suivi", source_rapprochement: "automatique" })], 1).ok,
  false,
  "un rapprochement automatique ne prouve rien",
);
assert.deepEqual(
  choisirIdentifiantBeebsExact(depot, [ligne({ job_id: "suivi", source_rapprochement: "manuel" })], 2),
  { ok: false, raison: "inventaire_ambigu" },
  "deux dépôts sans identité sur la même fiche restent ambigus",
);
assert.deepEqual(
  choisirIdentifiantBeebsExact(depot, [
    ligne(),
    ligne({ listing_id: "34015034" }),
  ], 1),
  { ok: false, raison: "ambigu" },
  "deux identifiants exacts pour le même job ne sont jamais départagés",
);
assert.equal(
  choisirIdentifiantBeebsExact(depot, [ligne({ user_id: "autre" })], 1).ok,
  false,
  "un relevé d'un autre compte est ignoré",
);
assert.equal(
  choisirIdentifiantBeebsExact(depot, [ligne({ listing_id: "pas-un-id" })], 1).ok,
  false,
  "un lien non durable est ignoré",
);
assert.equal(
  choisirIdentifiantBeebsExact(depot, [ligne({ disparu_le: "2026-09-29T12:00:00Z" })], 1).ok,
  false,
  "une annonce disparue ne peut pas débloquer un retrait",
);

const restauration = restaurerPublicationBeebsConfirmee({
  processing_since: "2026-09-29T18:21:00Z",
  attente_identifiant_beebs: {
    depuis: "2026-09-29T18:22:00Z",
    depot_confirme_le: "2026-09-29T18:22:00Z",
    pose_par: "update-job-status",
  },
});
assert.equal(restauration?.publishedAt, "2026-09-29T18:22:00.000Z",
  "la date de publication reste celle de la confirmation Beebs");
assert.equal(restauration?.platformFields.processing_since, undefined,
  "un dépôt confirmé ne garde pas de verrou de traitement");
assert.equal(restauration?.platformFields.attente_identifiant_beebs, undefined,
  "le marqueur à l'origine de l'impasse disparaît");
assert.equal((restauration?.platformFields.lien_en_attente as Record<string, unknown>)?.plateforme, "beebs",
  "le lien manquant reste explicite sans permettre une resoumission");
assert.equal(restaurerPublicationBeebsConfirmee({ attente_identifiant_beebs: {} }), null,
  "un pending ordinaire sans confirmation datée n'est jamais restauré");

const background = fs.readFileSync(new URL("../chrome-extension/background.js", import.meta.url), "utf8");
const debutIdentifiants = background.indexOf("function identifiantsBeebsPortes");
const finIdentifiants = background.indexOf("async function enrichirCibleBeebs", debutIdentifiants);
assert.ok(debutIdentifiants > 0 && finIdentifiants > debutIdentifiants, "la preuve directe Beebs est isolée");
const contexte = vm.createContext({});
vm.runInContext(background.slice(debutIdentifiants, finIdentifiants), contexte);
assert.equal(contexte.identifiantsBeebsPortes({
  platform_listing_id: "34015033",
  listing_url: "https://www.beebs.app/fr/p/34015033-bottines",
}).ids.size, 1, "colonne et lien concordants donnent un seul identifiant");
assert.equal(contexte.identifiantsBeebsPortes({
  platform_listing_id: "34015033",
  listing_url: "https://www.beebs.app/fr/p/34015034-autre",
}).ids.size, 2, "deux identifiants contradictoires ne sont jamais départagés");
assert.equal(contexte.identifiantsBeebsPortes({
  platform_listing_id: "titre",
  listing_url: null,
}).invalide, true, "une colonne non durable ferme la porte");
const debut = background.indexOf("async function enrichirCibleBeebs");
const fin = background.indexOf("async function executerRetraitViaHandler", debut);
const enrichissement = background.slice(debut, fin);
assert.ok(debut > 0 && fin > debut, "la porte de retrait Beebs est présente");
assert.match(enrichissement, /arme_par\?\.depot[\s\S]*republish_source_job_id[\s\S]*republish_snapshot\?\.source_job_id/,
  "le retrait retrouve son dépôt exact même après SET NULL de la fiche");
assert.match(enrichissement, /annonces_plateforme[\s\S]*job_id=eq\.\$\{encodeURIComponent\(sourceId\)\}/,
  "seule la ligne de relevé portant le job_id exact est recevable");
assert.doesNotMatch(enrichissement, /inventaire_id=eq|job\.title|prix|photo/i,
  "la fiche, le titre, le prix et la photo ne participent jamais à l'identité");

const serveur = fs.readFileSync(new URL("../supabase/functions/get-pending-jobs/index.ts", import.meta.url), "utf8");
const sourceExacte = serveur.slice(serveur.indexOf("const depotProuve ="), serveur.indexOf("// 2. et 3. l'IDENTIFIANT"));
assert.match(sourceExacte, /\.eq\("id", depotProuve\)/,
  "le serveur relit le dépôt exact porté par le retrait");
assert.doesNotMatch(sourceExacte, /\.eq\("inventaire_id"/,
  "la preuve survit à inventaire_id = NULL");

const statutServeur = fs.readFileSync(new URL("../supabase/functions/update-job-status/index.ts", import.meta.url), "utf8");
assert.match(background, /platform_listing_id: beebsProductId \?\? undefined/,
  "l'extension transmet l'identifiant Beebs avec son verdict de dépôt");
assert.match(statutServeur, /if \(idBeebsFourni\) patch\.platform_listing_id = idBeebsFourni/,
  "le serveur écrit l'identifiant dans la même transition atomique que published");
assert.doesNotMatch(statutServeur, /jobRow\?\.platform === "beebs" && !\/\^\\d\+\$\/\.test\(idConnu\)/,
  "le retour arrière ne remet plus un dépôt Beebs confirmé en pending");
assert.match(statutServeur, /restaurerPublicationBeebsConfirmee[\s\S]*statutEffectif = "published"/,
  "le serveur couvre aussi la 0.6.80 qui envoie elle-même l'attente après succès");

const lienServeur = fs.readFileSync(new URL("../supabase/functions/beebs-lien/index.ts", import.meta.url), "utf8");
const selectionLien = lienServeur.slice(lienServeur.indexOf("const selection ="), lienServeur.indexOf("const { data: relevesDirectsBruts"));
assert.match(selectionLien, /\.eq\("status", "pending"\)[\s\S]*?\.not\("platform_fields->attente_identifiant_beebs", "is", null\)/,
  "un pending n'est examiné qu'après confirmation explicite du dépôt");
assert.doesNotMatch(selectionLien, /\.in\("status", \["published", "pending"\]\)/,
  "un pending ordinaire ne peut jamais être pris pour une publication Beebs");
assert.match(lienServeur, /const selectionExhaustive = [\s\S]*?tousLesCandidats\.length <= JOBS_MAX/,
  "la voie manuelle sait si tous les dépôts sans identité ont été comptés");
assert.match(lienServeur, /!selectionExhaustive[\s\S]*?\? 2/,
  "une sélection bornée non exhaustive ferme le rattachement manuel");
assert.match(lienServeur, /job\.status === "pending"[\s\S]*?publicationsRestaurees\+\+/,
  "les dépôts déjà confirmés sont restaurés sans être redistribués");
assert.doesNotMatch(lienServeur, /status: "pending", error: null, published_at: null/,
  "la reclassification conserve la date historique du dépôt");

console.log("OK — Beebs : preuve exacte si disponible, sinon dépôt confirmé terminal sans resoumission");
