// ═══════════════════════════════════════════════════════════════════════════
// VERROU 3c (13/11, lot « zéro problème », étape 3) — UN NUMÉRO DONNÉ PAR LA CONFIRMATION D'UN AUTRE DÉPÔT
// DU COMPTE N'EST JAMAIS CANDIDAT ; LE DOUTE RESTE UNE QUESTION
// ═══════════════════════════════════════════════════════════════════════════
// Décision de Nico (12/11) : « Garde anti-doublon : un numéro obtenu par la confirmation d'un autre dépôt du compte
// n'est jamais candidat ; le doute reste une question. Rejeu des 3 cas réels + témoins. » Restriction : seulement un
// numéro venu de la CONFIRMATION d'un dépôt — jamais un numéro rattaché par photos ou par titre.
//
// REJEUX (données relues en base, lecture seule, le 13/11 — état AU MOMENT de chaque question : lignes du relevé
// encore « reliées à rien », le rapprochement par identifiant les a rattachées 15 s à 1 min 17 après) :
//   · compte 14e536e0, poussette 59a5cb96 (11/11 11:16:28) : question sur 34336996 = sac à dos 26601f4c ;
//   · compte ca9afe24, job 06741f92 (10/11 14:28:01) : 6 candidates, toutes des pulls du même lot ;
//   · compte ebdf29f0, job 8b4bca3b (12/11 14:49:56) : 34345993 et 34346009 = jobs fab82d2a et fce29994.
// TÉMOIN JUSTE : compte 90d11dae, job 246477ff (04/11 18:55:08) — 34296690 était SON dépôt (rattaché par photos
// 5 min après) : la question reste.
// Le module LIVRÉ (_shared/depot-sans-numero.js, celui qu'importent get-pending-jobs et beebs-lien), appelé comme
// get-pending-jobs l'appelle (plancher = numéros des jobs, empreintes absentes comme au moment de la question).
//
//   npm run selftest:depot-numero-d-un-autre-depot

import fs from "node:fs";
import * as M from "../supabase/functions/_shared/depot-sans-numero.js";

const { candidatesDuDepot, jugerCycleDepots, rattacherParPhotos } = M;
let ko = 0;
const ok = (c, quoi, d = "") => { if (c) console.log(`  ✓ ${quoi}`); else { ko++; console.error(`  ✗ ${quoi}${d ? `\n      ${d}` : ""}`); } };
const egal = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// [numéro, première vue, job relié AU MOMENT de la question, statut, disparue] ; [job, numéro, publié le, preuve du numéro]
const CAS = {
  "14e536e0": { job: "59a5cb96", essai: "2026-11-11T10:14:54.204Z", question: "2026-11-11T10:16:28Z", vue: ["34336996"],
    lignes: [["34336771","2026-11-11T10:15:38.404Z",null,"en_ligne",0],["34336776","2026-11-11T10:15:38.404Z",null,"en_ligne",0],["34336782","2026-11-11T10:15:38.404Z",null,"en_ligne",0],["34336790","2026-11-11T10:15:38.404Z",null,"en_ligne",0],["34336798","2026-11-11T10:15:38.404Z",null,"en_ligne",0],["34336936","2026-11-11T10:15:38.404Z",null,"en_ligne",0],["34336943","2026-11-11T10:15:38.404Z",null,"en_ligne",0],["34336978","2026-11-11T10:15:38.404Z",null,"en_ligne",0],["34336996","2026-11-11T10:15:38.404Z",null,"en_ligne",0]],
    jobs: [["26601f4c","34336996","2026-11-11T10:04:46.762Z","acceptee"],["eed1aaa1","34336978","2026-11-11T10:02:13.285Z","acceptee"],["ba23a2fd","34336943","2026-11-11T09:58:07.779Z","acceptee"],["4dd6ab3f","34336936","2026-11-11T09:57:14.624Z","acceptee"],["200c2940","34336817","2026-11-11T09:44:04.187Z","acceptee"],["9624034a","34336798","2026-11-11T09:40:12.077Z","acceptee"],["e8e748c6","34336790","2026-11-11T09:38:51.551Z","acceptee"],["4ec3c130","34336782","2026-11-11T09:37:53.189Z","acceptee"],["d00393fb","34336776","2026-11-11T09:36:52.701Z","acceptee"],["447200fd","34336771","2026-11-11T09:35:40.922Z","acceptee"]] },
  "ca9afe24": { job: "06741f92", essai: "2026-11-10T13:12:26.160Z", question: "2026-11-10T13:28:01Z", vue: ["34331900", "34331923", "34331930"],
    lignes: [["34331831","2026-11-10T13:25:48.292Z",null,"en_ligne",0],["34331859","2026-11-10T13:25:48.292Z",null,"en_ligne",0],["34331874","2026-11-10T13:25:48.292Z",null,"en_ligne",0],["34331900","2026-11-10T13:25:48.292Z",null,"en_ligne",0],["34331923","2026-11-10T13:25:48.292Z",null,"en_ligne",0],["34331930","2026-11-10T13:25:48.292Z",null,"en_ligne",0],["34331995","2026-11-10T13:25:48.292Z",null,"en_ligne",0],["34332017","2026-11-10T13:25:48.292Z",null,"en_ligne",0],["34332075","2026-11-10T13:25:48.292Z",null,"en_ligne",0]],
    jobs: [["dbbb288f","34332075","2026-11-10T13:23:37.386Z","acceptee"],["9268a0f8","34332017","2026-11-10T13:17:56.130Z","acceptee"],["4268a5e7","34331995","2026-11-10T13:15:41.786Z","acceptee"],["30e56ba8","34331930","2026-11-10T13:06:41.717Z","acceptee"],["64520308","34331923","2026-11-10T13:05:26.395Z","acceptee"],["a1b528f0","34331900","2026-11-10T13:00:13.417Z","acceptee"],["f8f1b01e","34331874","2026-11-10T12:55:36.209Z","acceptee"],["bea3a406","34331859","2026-11-10T12:53:13.393Z","acceptee"],["fcfa5b7c","34331831","2026-11-10T12:48:28.701Z","acceptee"]] },
  "ebdf29f0": { job: "8b4bca3b", essai: "2026-11-12T13:42:40.218Z", question: "2026-11-12T13:49:56Z", vue: ["34345993", "34346009"],
    lignes: [["34345993","2026-11-12T13:45:35.583Z",null,"en_ligne",0],["34346009","2026-11-12T13:45:35.583Z",null,"en_ligne",0]],
    jobs: [["fce29994","34346009","2026-11-12T13:40:27.724Z","acceptee"],["fab82d2a","34345993","2026-11-12T13:37:53.833Z","acceptee"]] },
  // Témoin juste : 34296690 était le dépôt de 246477ff lui-même (aucun autre job ne portait ce numéro).
  "90d11dae": { job: "246477ff", essai: "2026-11-04T17:30:13.352Z", question: "2026-11-04T17:55:08Z", vue: ["34296690"],
    lignes: [["34296690","2026-11-04T17:42:35.469Z",null,"en_ligne",0]],
    jobs: [] },
};

// Une ligne de cross_post_jobs comme la lit get-pending-jobs (COLONNES_NUMEROS_CONFIRMES, alias à plat).
function rangeeJob([id, n, publie, preuve]) {
  const r = { id, platform_listing_id: n, published_at: publie };
  if (preuve === "acceptee") Object.assign(r, { preuve_acceptee: n, preuve_id: n, preuve_ok: "true" });
  if (preuve === "sonde") r.preuve_sonde = n;
  if (preuve === "photos") r.lien_photos = n;
  if (preuve === "titre") r.lien_titre = { url: "x" };
  return r;
}
// Ce que get-pending-jobs construit : les lignes du relevé, plus le plancher (numéros des jobs, datés de leur dépôt).
function contexte(c, { jobs = c.jobs, lignesEnPlus = [] } = {}) {
  const lignes = [...c.lignes, ...lignesEnPlus].map(([n, vu, job, st, disp]) => ({ id: `ap-${n}`, listing_id: n, created_at: vu, job_id: job, inventaire_id: null, statut_plateforme: st, disparu_le: disp ? vu : null }));
  for (const [, n, publie] of jobs) lignes.push({ listing_id: n, created_at: publie, job_id: "plancher", inventaire_id: -1 });
  const rangees = jobs.map(rangeeJob);
  const numerosConfirmes = typeof M.numerosConfirmesParDepot === "function" ? M.numerosConfirmesParDepot(rangees) : undefined;
  const depot = { id: c.job, photos: [], published_at: c.essai, created_at: c.essai };
  return { lignes, numerosConfirmes, depot };
}
const juger = (c, opts) => {
  const { lignes, numerosConfirmes, depot } = contexte(c, opts);
  const cy = jugerCycleDepots({ depots: [depot], lignes, empreinte: () => undefined, numerosConfirmes });
  return { question: (cy.question.get(c.job) ?? []).map((a) => a.listing_id), aucune: cy.aucune.includes(c.job), ecartees: cy.ecartees?.get(c.job) ?? [] };
};
const avant = (c) => {
  const { lignes, depot } = contexte(c);
  return candidatesDuDepot(depot, lignes, "beebs").map((a) => a.listing_id);
};

console.log("\n0. FIDÉLITÉ DU REJEU : sans la règle, on retrouve exactement les questions posées en production");
for (const [compte, c] of Object.entries(CAS)) {
  const v = avant(c);
  ok(egal(v.slice(0, 3), c.vue), `${compte} / ${c.job} : candidates d'avant ${JSON.stringify(v)} (liens montrés : ${c.vue.join(", ")})`);
}

console.log("\n1. LES 3 CAS RÉELS : plus aucune question, redépôt autorisé, la preuve tracée");
for (const compte of ["14e536e0", "ca9afe24", "ebdf29f0"]) {
  const c = CAS[compte];
  const r = juger(c);
  ok(r.question.length === 0 && r.aucune, `${compte} / ${c.job} : aucune candidate (avant : ${JSON.stringify(avant(c))})`, JSON.stringify(r));
  ok(r.ecartees.length > 0 && r.ecartees.every((e) => /confirmation du dépôt/.test(e.motif)), `${compte} : chaque annonce écartée dit quel dépôt l'a confirmée`, JSON.stringify(r.ecartees));
}
{
  const r = juger(CAS["14e536e0"]);
  ok(r.ecartees.some((e) => e.listing_id === "34336996" && /26601f4c/.test(e.motif)), "14e536e0 : 34336996 écartée — numéro donné à la confirmation du dépôt 26601f4c (le sac à dos)", JSON.stringify(r.ecartees));
}

console.log("\n2. TÉMOINS : LE DOUTE RESTE UNE QUESTION");
{
  const c = CAS["90d11dae"];
  ok(egal(juger(c).question, ["34296690"]), "90d11dae / 246477ff (question JUSTE, son propre dépôt) : la question reste sur 34296690");
  // Le même numéro porté par le dépôt jugé lui-même : jamais exclu par son propre numéro.
  ok(egal(juger(c, { jobs: [["246477ff", "34296690", "2026-11-04T17:30:13.352Z", "acceptee"]] }).question, ["34296690"]), "le numéro du dépôt jugé lui-même ne l'exclut jamais");
  const c1 = CAS["14e536e0"];
  const avec = (preuve) => c1.jobs.map((j) => (j[0] === "26601f4c" ? [j[0], j[1], j[2], preuve] : j));
  ok(egal(juger(c1, { jobs: avec("photos") }).question, ["34336996"]), "numéro du sac rattaché par PHOTOS (lien_par_photos) : 34336996 reste candidate → la question");
  ok(egal(juger(c1, { jobs: avec("titre") }).question, ["34336996"]), "numéro rattaché par TITRE (listing_url_recovery) : reste candidate → la question");
  ok(egal(juger(c1, { jobs: avec("autre") }).question, ["34336996"]), "numéro sans preuve de confirmation (relevé, main) : reste candidate → la question");
  ok(juger(c1, { jobs: avec("sonde") }).question.length === 0, "numéro rendu par Beebs à la requête du dépôt (sonde) : écartée");
  ok(egal(juger(c1, { lignesEnPlus: [["34337010", "2026-11-11T10:15:38.404Z", null, "en_ligne", 0]] }).question, ["34337010"]),
    "une annonce apparue que AUCUN dépôt n'a confirmée (34337010) : la question reste, sur elle seule");
  const pfComplet = { id: "x", platform_listing_id: "34336996", platform_fields: { preuve_identifiant_beebs: { ok: true, id: "34336996" }, lien_par_photos: { listing_id: "34336996" } } };
  ok(typeof M.numeroConfirmeParDepot === "function" && M.numeroConfirmeParDepot(pfComplet) === null, "une trace de dépôt ET un rattachement par photos du même numéro : le rattachement gagne (pas une confirmation)");
  ok(typeof M.numeroConfirmeParDepot === "function"
    && M.numeroConfirmeParDepot({ id: "y", platform_listing_id: "34336996", platform_fields: { preuve_identifiant_beebs: { ok: false, motif: "plusieurs_nouveaux_identifiants" } } }) === null,
    "une preuve avant/après en échec ne vaut pas confirmation");
  ok(typeof M.numeroConfirmeParDepot === "function"
    && M.numeroConfirmeParDepot({ id: "z", platform_listing_id: "3292326913", platform_fields: { lbc_depot: { adsubmit: { id: "3292326913" } } } })?.preuve === "lbc_depot.adsubmit",
    "Leboncoin : le numéro rendu par Leboncoin au dépôt (adsubmit) est une confirmation");
}

console.log("\n3. BEEBS-LIEN : DEUX EXEMPLAIRES AUX MÊMES PHOTOS — LE SECOND NE PREND JAMAIS LE NUMÉRO DU PREMIER");
{
  const F = JSON.parse(fs.readFileSync(new URL("./fixtures/depots-sans-numero-nicolas-menar-1510.json", import.meta.url), "utf8"));
  const emp = (u) => (F.empreintes[u] ? { url: u, ...F.empreintes[u] } : undefined);
  const d0 = F.depots.find((d) => d.id.startsWith("80053a31"));
  ok(rattacherParPhotos({ depots: [d0], lignes: F.lignes, empreinte: emp }).get(d0.id)?.listing_id === "34085142", "fixture 39bfa95a : sans autre dépôt, les photos rattachent 80053a31 → 34085142 (inchangé)");
  const premier = { id: "11111111-aaaa-bbbb-cccc-000000000001", platform_listing_id: "34085142", preuve_acceptee: "34085142" };
  const nc = typeof M.numerosConfirmesParDepot === "function" ? M.numerosConfirmesParDepot([premier]) : undefined;
  ok(!rattacherParPhotos({ depots: [d0], lignes: F.lignes, empreinte: emp, numerosConfirmes: nc }).has(d0.id),
    "34085142 confirmé au dépôt d'un AUTRE exemplaire (ligne pas encore rattachée) : jamais donné à 80053a31");
}

console.log("\n4. BRANCHEMENTS : get-pending-jobs et beebs-lien passent les numéros confirmés");
{
  const gpj = fs.readFileSync(new URL("../supabase/functions/get-pending-jobs/index.ts", import.meta.url), "utf8");
  ok(/select\(COLONNES_NUMEROS_CONFIRMES\)/.test(gpj) && /numerosConfirmesParDepot\(/.test(gpj), "get-pending-jobs lit la preuve du numéro des jobs du compte (même lecture que le plancher)");
  ok(/jugerCycleDepots\(\{[^}]*numerosConfirmes\s*\}\)/.test(gpj) && /candidatesDuDepot\(x\.depot, lignes, "beebs", \{ numerosConfirmes \}\)/.test(gpj), "get-pending-jobs juge le cycle avec eux (question ET empreintes)");
  ok(/numeros_d_autres_depots/.test(gpj), "la trace (depot_verifie / depot_deja_parti) nomme les annonces écartées");
  const bl = fs.readFileSync(new URL("../supabase/functions/beebs-lien/index.ts", import.meta.url), "utf8");
  ok(/select\(COLONNES_NUMEROS_CONFIRMES\)/.test(bl) && /rattacherParPhotos\(\{[^}]*numerosConfirmes\s*\}\)/.test(bl), "beebs-lien rattache par photos sans jamais prendre un numéro confirmé ailleurs");
}

console.log(ko ? `\n${ko} ÉCHEC(S)` : "\nTOUT VERT");
process.exit(ko ? 1 : 0);
