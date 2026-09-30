import { strict as assert } from "node:assert";
import fs from "node:fs";
import vm from "node:vm";
import {
  choisirIdentifiantBeebsExact,
  controlerNumeroBeebsEnBase,
  verifierPreuveAvantApresBeebs,
  mettreLienBeebsRecupereEnAttenteConfirmation,
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

const lienTitre = mettreLienBeebsRecupereEnAttenteConfirmation({
  created_at: "2026-09-29T20:15:00Z",
  listing_url: "https://www.beebs.app/fr/p/34077577-un-titre",
  platform_listing_id: null,
  platform_fields: {
    lien_en_attente: { depuis: "2026-09-29T20:18:00Z" },
    listing_url_recovery: { at: "2026-09-29T20:23:00Z", page: "beebs.app/fr/account/my-adverts" },
  },
}, "2026-09-29T20:30:00Z");
assert.equal(lienTitre?.idCandidat, "34077577",
  "le numéro récupéré par titre reste une piste, pas une preuve");
assert.equal((lienTitre?.platformFields.candidat_identifiant_beebs as Record<string, unknown>)?.source,
  "listing_url_recovery_par_titre_non_probante",
  "la piste attend la confirmation de la personne");
assert.equal(mettreLienBeebsRecupereEnAttenteConfirmation({
  created_at: "2026-09-28T20:15:00Z",
  listing_url: "https://www.beebs.app/fr/p/34077577-un-titre",
  platform_listing_id: null,
  platform_fields: {
    lien_en_attente: { depuis: "2026-09-28T20:18:00Z" },
    listing_url_recovery: { at: "2026-09-28T20:23:00Z" },
  },
}), null, "les liens historiques ne sont pas réécrits sans audit séparé");
assert.equal(mettreLienBeebsRecupereEnAttenteConfirmation({
  created_at: "2026-09-29T20:15:00Z",
  listing_url: "https://www.beebs.app/fr/p/34077577-un-titre",
  platform_listing_id: "34077577",
  platform_fields: {
    lien_en_attente: { depuis: "2026-09-29T20:18:00Z" },
    listing_url_recovery: { at: "2026-09-29T20:23:00Z" },
  },
}), null, "un identifiant déjà prouvé n'est jamais rétrogradé");

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

// ── Numéro d'un dépôt par « Mes annonces » avant / après (0.6.80, 30/09) ─────
{
  const maintenant = Date.parse("2026-09-30T10:05:00.000Z");
  const trace = (patch: Record<string, unknown> = {}) => ({
    methode: "mes_annonces_avant_apres",
    ok: true,
    id: "34080001",
    avant: { ok: true, lu_le: "2026-09-30T10:00:00.000Z", ids: ["34076808", "34076827"] },
    apres: { ok: true, lu_le: "2026-09-30T10:01:10.000Z", ids: ["34076808", "34076827", "34080001"] },
    ...patch,
  });
  const ok = verifierPreuveAvantApresBeebs(trace(), "34080001", maintenant);
  assert.equal(ok.ok, true, "un seul nouveau, le numéro envoyé : accepté");
  const motif = (t: unknown, id = "34080001") => {
    const v = verifierPreuveAvantApresBeebs(t, id, maintenant);
    return v.ok ? "ok" : v.motif;
  };
  assert.equal(motif(null), "trace_absente");
  assert.equal(motif(trace({ methode: "titre" })), "methode_inconnue");
  assert.equal(motif(trace(), "34080002"), "numero_different_de_la_trace", "le numéro envoyé doit être celui de la trace");
  assert.equal(motif(trace({ ok: false })), "numero_different_de_la_trace");
  assert.equal(motif(trace({ avant: { ok: false, lu_le: "2026-09-30T10:00:00.000Z", ids: [] } })), "lecture_avant_illisible");
  assert.equal(motif(trace({ apres: { ok: false, lu_le: "2026-09-30T10:01:10.000Z", ids: ["34080001"] } })), "lecture_apres_illisible");
  // le serveur refait le calcul : il ne croit pas l'extension sur parole
  assert.equal(motif(trace({ apres: { ok: true, lu_le: "2026-09-30T10:01:10.000Z", ids: ["34076808", "34076827"] } })),
    "aucun_nouvel_identifiant");
  assert.equal(motif(trace({ apres: { ok: true, lu_le: "2026-09-30T10:01:10.000Z", ids: ["34076808", "34080001", "34080002"] } })),
    "plusieurs_nouveaux_identifiants");
  assert.equal(motif(trace({ apres: { ok: true, lu_le: "2026-09-30T10:01:10.000Z", ids: ["34076808", "34080009"] } })),
    "nouvel_identifiant_different");
  // une ancienne annonce qui réapparaît ne compte pas
  assert.equal(motif(trace({ apres: { ok: true, lu_le: "2026-09-30T10:01:10.000Z", ids: ["34076808", "33000000", "34080001"] } })), "ok");
  assert.equal(motif(trace({ id: "33000000" }), "33000000"), "nouvel_identifiant_different");
  assert.equal(motif({ ...trace({ id: "33000000" }), apres: { ok: true, lu_le: "2026-09-30T10:01:10.000Z", ids: ["34076808", "33000000"] } }, "33000000"),
    "aucun_nouvel_identifiant", "un numéro sous le plancher n'est jamais un dépôt neuf");
  // bornes de temps
  assert.equal(motif(trace({ apres: { ok: true, lu_le: "2026-09-30T09:59:00.000Z", ids: ["34080001"] } })), "lectures_trop_eloignees");
  assert.equal(motif(trace({ apres: { ok: true, lu_le: "2026-09-30T10:20:00.000Z", ids: ["34080001"] } })), "lectures_trop_eloignees");
  assert.equal(motif(trace(), "34080001") , "ok");
  assert.equal(verifierPreuveAvantApresBeebs(trace(), "34080001", Date.parse("2026-09-30T11:00:00.000Z")).ok, false,
    "une trace de plus de 30 min ne prouve plus rien");
  assert.equal(motif(trace({ avant: { ok: true, lu_le: "pas une date", ids: [] } })), "horodatage_illisible");

  // contrôles en base, sur une doublure du client
  const client = (reponses: Record<string, unknown[] | "erreur">) => {
    const vus: string[] = [];
    return {
      vus,
      from(table: string) {
        const filtres: string[] = [table];
        const q: Record<string, unknown> = {};
        for (const m of ["select", "eq", "neq", "lt", "gte", "lte", "in"]) {
          q[m] = (...a: unknown[]) => { filtres.push(`${m}:${a.map(String).join("=")}`); return q; };
        }
        q.limit = () => {
          const cle = filtres.join("|");
          vus.push(cle);
          const nom = table === "annonces_plateforme" ? "connue"
            : cle.includes("eq:platform_listing_id") ? "porte"
            : cle.includes("eq:status=processing") ? "enCours" : "concurrents";
          const r = reponses[nom] ?? [];
          return Promise.resolve(r === "erreur" ? { data: null, error: { message: "x" } } : { data: r, error: null });
        };
        return q;
      },
    };
  };
  const p = { id: "34080001", jobId: "job-a", userId: "u1", avantLe: "2026-09-30T10:00:00.000Z", apresLe: "2026-09-30T10:01:10.000Z" };
  assert.equal(await controlerNumeroBeebsEnBase(client({}), p), null, "rien ne s'y oppose");
  assert.equal(await controlerNumeroBeebsEnBase(client({ porte: [{ id: "job-b" }] }), p), "numero_deja_porte_par_un_autre_depot");
  assert.equal(await controlerNumeroBeebsEnBase(client({ connue: [{ id: 1 }] }), p), "annonce_connue_avant_le_depot");
  assert.equal(await controlerNumeroBeebsEnBase(client({ concurrents: [{ id: "job-c" }] }), p), "autre_depot_beebs_pendant_la_fenetre");
  assert.equal(await controlerNumeroBeebsEnBase(client({ enCours: [{ id: "job-d" }] }), p), "autre_depot_beebs_pendant_la_fenetre");
  assert.equal(await controlerNumeroBeebsEnBase(client({ connue: "erreur" }), p), "verification_impossible", "une lecture en échec refuse");
  const c = client({});
  await controlerNumeroBeebsEnBase(c, p);
  assert.ok(c.vus.some((v) => v.includes("eq:platform_listing_id=34080001") && v.includes("neq:id=job-a")), "le dépôt lui-même est exclu");
  assert.ok(c.vus.some((v) => v.startsWith("annonces_plateforme") && v.includes("lt:created_at=2026-09-30T10:00:00.000Z")),
    "seule une annonce relevée AVANT la lecture d'avant bloque");

  // câblage dans update-job-status
  const ujs = fs.readFileSync(new URL("../supabase/functions/update-job-status/index.ts", import.meta.url), "utf8");
  const iVerif = ujs.indexOf("verifierPreuveAvantApresBeebs(tracePreuve, idBeebsFourni)");
  const iPose = ujs.indexOf("if (idBeebsFourni) patch.platform_listing_id = idBeebsFourni;");
  assert.ok(iVerif > 0 && iPose > iVerif, "le numéro n'est posé qu'après la vérification");
  assert.match(ujs.slice(iVerif, iPose), /controlerNumeroBeebsEnBase\(adminP/, "les contrôles en base suivent le calcul");
  assert.match(ujs.slice(iVerif, iPose), /idBeebsFourni = null;/, "un refus retire le numéro");
}

console.log("OK — Beebs : preuve exacte si disponible, sinon dépôt confirmé terminal sans resoumission");
