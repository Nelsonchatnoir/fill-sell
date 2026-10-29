// Autotest — un dépôt ou une remise en ligne coupés se tranchent au relevé — `npm run selftest:depot-coupe-tranche`
// (_shared/depot-coupe-tranche.js, handler-watch).
// Données RELEVÉES en base le 25/10 (fixture) : louis (Amiral, Leboncoin), deux remises en ligne coupées le 21/10 sur
// /deposer-une-annonce/options (« message channel closed ») ; les annonces suspectes 3292326913 et 3292489182 ont
// été vues deux fois le 21/10 puis plus jamais par les relevés complets suivants : la question attendait depuis 4 jours.
import fs from "node:fs";
import {
  decisionDepotCoupe, estDepotCoupe, presenceCandidate, relevesProbants, candidatesDepotCoupe, appariementMutuel,
  patchRelanceDepotCoupe, patchRattachementDepotCoupe, RELANCES_MAX,
} from "../supabase/functions/_shared/depot-coupe-tranche.js";
import { depotPeutEtrePartiDepuis, depotInacheveLbc, essaisArretesSurOptionsLbc } from "../supabase/functions/_shared/recreation-deja-partie.js";
import { depotPublicationPeutEtrePartiDepuis } from "../supabase/functions/_shared/depot-sans-numero.js";

let ko = 0;
const ok = (c, nom, d = "") => { if (c) console.log(`  ✓ ${nom}`); else { console.error(`  ✗ ${nom}${d ? `\n      ${d}` : ""}`); ko++; } };
const F = JSON.parse(fs.readFileSync(new URL("./fixtures/depot-coupe-louis-2110.json", import.meta.url), "utf8"));
const emp = (u) => (F.empreintes[u] ? { url: u, ...F.empreintes[u] } : undefined);
const jobGris = F.jobs.find((j) => j.id.startsWith("c7526556"));
const jobCuisine = F.jobs.find((j) => j.id.startsWith("88db7e2e"));
const plusTard = (iso, min) => new Date(Date.parse(iso) + min * 60_000).toISOString();
const dernierRun = F.runs.reduce((a, b) => (Date.parse(b.started_at) > Date.parse(a.started_at) ? b : a));

console.log("\n1. LOUIS : LES ANNONCES SUSPECTES NE SONT PLUS EN LIGNE → RELANCE UNIQUE");
ok(estDepotCoupe(jobGris) && estDepotCoupe(jobCuisine), "les deux questions « peut-être déjà partie » sont relues par la règle");
const dG = decisionDepotCoupe({ job: jobGris, lignes: F.lignes, runs: F.runs, empreinte: emp });
ok(dG.decision === "relancer", "« Rangement Gris et Vert » : 3292326913 absente des relevés complets depuis le 21/10 → relance", JSON.stringify(dG));
ok(dG.absentes?.some((a) => a.listing_id === "3292326913"), "la trace nomme l'annonce absente et sa preuve", JSON.stringify(dG.absentes));
const dC = decisionDepotCoupe({ job: jobCuisine, lignes: F.lignes, runs: F.runs, empreinte: emp });
ok(dC.decision === "relancer", "« Cuisine enfant » : 3292489182 absente de deux relevés complets et plus → relance", JSON.stringify(dC));
ok(dC.absentes?.some((a) => a.listing_id === "3292489182" && /relevés complets|inachevé/.test(a.preuve)), "preuve : relevés complets après sa dernière vue, ou dépôt inachevé sur « options » (jamais le titre)", JSON.stringify(dC.absentes));
ok(relevesProbants(F.runs, "leboncoin").length >= 2, "les relevés Leboncoin « [défilement] [adresse] … lues sur … annoncées » comptent comme complets");

console.log("\n2. ENCORE EN LIGNE : JAMAIS DE REDÉPÔT, LA PREUVE OU LA QUESTION");
// (29/10) « encore en ligne » = revue EN LIGNE : une annonce revue au statut « inactive » d'un essai arrêté sur
// /options est un dépôt inachevé (section 9), jamais une copie en ligne.
const revue = F.lignes.map((l) => (l.listing_id === "3292489182" ? { ...l, vu_le: plusTard(dernierRun.started_at, 1), disparu_le: null, statut_plateforme: "en_ligne" } : l));
const sansEmp = decisionDepotCoupe({ job: jobCuisine, lignes: revue, runs: F.runs, empreinte: emp });
ok(sansEmp.decision === "empreintes" && sansEmp.urls.some((u) => u.includes("9703dcb26f3a6aa632839124ef41c68f8a237a34")),
  "annonce revue au dernier relevé, photos sans empreinte → on les fait calculer (jamais une relance)", JSON.stringify(sansEmp));
const urlCopie = (jobCuisine.photos.map((p) => (typeof p === "string" ? p : p.url)).find((u) => F.empreintes[u]));
const urlCand = sansEmp.urls.find((u) => u.includes("9703dcb2"));
const empMeme = (u) => (u === urlCand ? { url: u, ...F.empreintes[urlCopie] } : emp(u));
const meme = decisionDepotCoupe({ job: jobCuisine, lignes: revue.map((l) => (l.listing_id === "3292489182" ? { ...l, statut_plateforme: "en_ligne" } : l)), runs: F.runs, empreinte: empMeme });
ok(meme.decision === "rattacher" && meme.annonce?.listing_id === "3292489182", "mêmes photos que notre copie, en ligne → rattachée, aucun redépôt", JSON.stringify({ d: meme.decision, p: meme.photos }));
const inverse = (bits) => String(bits).split("").map((b) => (b === "1" ? "0" : "1")).join("");
const empAutre = (u) => (u === urlCand ? { url: u, dhash: inverse(F.empreintes[urlCopie].dhash), phash: inverse(F.empreintes[urlCopie].phash) } : emp(u));
const autre = decisionDepotCoupe({ job: jobCuisine, lignes: revue, runs: F.runs, empreinte: empAutre });
ok(autre.decision === "question", "en ligne, aucune preuve ne la désigne → la question reste (le doute ne se tranche pas seul)", JSON.stringify(autre));
const unSeul = F.lignes.map((l) => (l.listing_id === "3292489182" ? { ...l, vu_le: plusTard(dernierRun.started_at, -2), disparu_le: null, statut_plateforme: "en_ligne" } : l));
ok(decisionDepotCoupe({ job: jobCuisine, lignes: unSeul, runs: F.runs, empreinte: emp }).decision !== "relancer",
  "absente d'UN seul relevé complet depuis sa dernière vue → pas encore une absence");

console.log("\n3. BOUTIQUE PARTAGÉE : UNE VUE SOUS UN AUTRE COMPTE COMPTE");
const partagee = [...F.lignes.map((l) => (l.listing_id === "3292489182" ? { ...l, statut_plateforme: "en_ligne" } : l)), { user_id: "447d920c-976a-4d8f-aff4-a2998050358c", listing_id: "3292489182", vu_le: plusTard(dernierRun.started_at, 30), disparu_le: null }];
const dP = decisionDepotCoupe({ job: jobCuisine, lignes: partagee, runs: F.runs, empreinte: emp });
ok(dP.decision !== "relancer", "vue par le relevé de louis-seller (même boutique Leboncoin) après les relevés de louis → encore en ligne", JSON.stringify(dP));
ok(candidatesDepotCoupe(jobCuisine, partagee).every((c) => c.user_id === jobCuisine.user_id), "les lignes d'un autre compte ne sont jamais des candidates");

console.log("\n4. JAMAIS SANS RELEVÉ, JAMAIS DEUX FOIS");
const avant = F.runs.filter((r) => Date.parse(r.started_at) < Date.parse(jobCuisine.platform_fields.recreation_deja_partie.essai.at));
ok(decisionDepotCoupe({ job: jobCuisine, lignes: F.lignes, runs: avant, empreinte: emp }).decision === "attendre", "aucun relevé complet après l'essai → on attend");
const incomplets = F.runs.map((r) => ({ ...r, erreur: `[incomplet] ${r.erreur ?? ""}` }));
ok(decisionDepotCoupe({ job: jobCuisine, lignes: F.lignes, runs: incomplets, empreinte: emp }).decision === "attendre", "relevés incomplets → rien n'est prouvé");
const dejaRelance = { ...jobCuisine, platform_fields: { ...jobCuisine.platform_fields, relance_depot_coupe: { n: RELANCES_MAX } } };
ok(decisionDepotCoupe({ job: dejaRelance, lignes: F.lignes, runs: F.runs, empreinte: emp }).decision === "attendre", "déjà relancé une fois par le relevé → plus rien d'automatique");
ok(!estDepotCoupe({ ...jobCuisine, platform: "vinted" }), "Vinted a sa propre règle (recreation-vinted-verifiee.js)");
ok(!estDepotCoupe({ ...jobCuisine, status: "pending" }), "seulement les questions posées (needs_user)");

console.log("\n5. LE PATCH DE RELANCE : MÊME GESTE QUE « RELANCER », SANS REPOSER LA QUESTION");
const now = "2026-10-25T00:30:00.000Z";
const pR = patchRelanceDepotCoupe(jobCuisine, dC, { maintenant: now });
ok(pR.status === "pending" && pR.error === null, "le job repart (pending), sans message d'erreur");
ok(!("needs_user_source" in pR.platform_fields) && pR.platform_fields.needsUserAttempts === 0, "question levée, compteurs à zéro");
ok(pR.platform_fields.relance_depot_coupe?.n === 1 && pR.platform_fields.recreation_verifiee?.apres === now, "relance tracée (n = 1), vérification datée");
ok(depotPeutEtrePartiDepuis("leboncoin", jobCuisine.platform_fields) !== null, "avant : get-pending-jobs retiendrait le job (essai suspect)");
ok(depotPeutEtrePartiDepuis("leboncoin", pR.platform_fields) === null, "après : la vérification couvre l'essai → servi une fois, pas de nouvelle question pour le même essai");
const nouvelEssai = { ...pR.platform_fields, work_window_state: { at_start: { at: plusTard(now, 10) }, fins: [{ at: plusTard(now, 11), fill_step: "depot", tab_url: "https://www.leboncoin.fr/deposer-une-annonce/options" }] } };
ok(depotPeutEtrePartiDepuis("leboncoin", nouvelEssai) !== null, "un NOUVEL essai coupé après la relance est de nouveau vérifié avant tout redépôt");

console.log("\n6. BEEBS, DÉPÔT COUPÉ (depot_deja_parti)");
const essaiB = "2026-10-20T11:00:00.000Z";
const depotB = { id: "00000000-0000-0000-0000-00000000beeb", user_id: "u-beebs", platform: "beebs", action: "publish", status: "needs_user", inventaire_id: 42,
  photos: [{ url: "https://exemple.supabase.co/storage/v1/object/public/listing-photos/u/1.jpg" }],
  platform_fields: { needs_user_source: "depot_deja_parti", depot_deja_parti: { le: "2026-10-20T13:00:00Z", verdict: "incertaine", essai: { at: essaiB, raison: "essai terminé sans réponse du formulaire" } },
    work_window_state: { at_start: { at: "2026-10-20T10:55:00Z" }, fins: [{ at: essaiB }] }, error_technique: { at: "2026-10-20T11:00:01Z", brut: "Timeout: pas de réponse du content script" } } };
const runsB = [1, 2, 3].map((k) => ({ id: `r${k}`, status: "done", started_at: plusTard(essaiB, 60 * 24 * k), finished_at: plusTard(essaiB, 60 * 24 * k + 2), items_vus: 50, total_entries: 50, erreur: null }));
const ligneB = { user_id: "u-beebs", listing_id: "34202692", url: "https://www.beebs.app/fr/p/34202692-pyjama", statut_plateforme: "en_ligne", photo_url: "https://cdn.beebs.app/p/1.jpg", job_id: null, inventaire_id: null,
  created_at: plusTard(essaiB, 30), vu_le: plusTard(essaiB, 31), disparu_le: null };
const plancher = { user_id: "u-beebs", listing_id: "34100000", created_at: "2026-10-18T10:00:00Z", vu_le: "2026-10-24T10:00:00Z", job_id: "x", inventaire_id: 7, statut_plateforme: "en_ligne" };
const dB = decisionDepotCoupe({ job: depotB, lignes: [plancher, ligneB], runs: runsB, empreinte: () => undefined });
ok(dB.decision === "relancer", "candidate Beebs vue juste après l'essai puis absente de 3 relevés complets → redépôt unique", JSON.stringify(dB));
const pB = patchRelanceDepotCoupe(depotB, dB, { maintenant: now });
ok(pB.platform_fields.depot_verifie?.apres === now && depotPublicationPeutEtrePartiDepuis("beebs", pB.platform_fields) === null,
  "après la relance, get-pending-jobs ne retient plus le dépôt pour le même essai");
const ligneBVue = { ...ligneB, vu_le: plusTard(runsB[2].started_at, 1) };
const empB = (u) => ({ url: u, dhash: "10".repeat(32), phash: "1100".repeat(16) });
const dBr = decisionDepotCoupe({ job: depotB, lignes: [plancher, ligneBVue], runs: runsB, empreinte: empB });
ok(dBr.decision === "rattacher" && dBr.annonce.listing_id === "34202692", "encore en ligne, mêmes photos que notre copie → rattachée", JSON.stringify(dBr));
const pBr = patchRattachementDepotCoupe(depotB, dBr, { maintenant: now, lienDepuisId: (p, id) => `https://www.beebs.app/fr/p/${id}` });
ok(pBr.status === "published" && pBr.platform_listing_id === "34202692" && pBr.platform_fields.lien_par_photos?.listing_id === "34202692", "dépôt rattaché : publié sur ce numéro, preuve tracée");
const runsTot = [{ id: "rt", status: "done", started_at: plusTard(essaiB, 20), finished_at: plusTard(essaiB, 22), items_vus: 50, total_entries: 50, erreur: null }];
ok(decisionDepotCoupe({ job: depotB, lignes: [plancher], runs: runsTot, empreinte: () => undefined }).decision === "attendre",
  "aucune annonce apparue mais seul relevé 20 min après l'essai → on attend (une annonce en vérification a 1 h pour apparaître)");
ok(decisionDepotCoupe({ job: depotB, lignes: [plancher], runs: runsB, empreinte: () => undefined }).decision === "relancer",
  "Ciddjy (25/10) : aucune annonce apparue, relevés complets des 20/10 16:44 et 22/10 18:01 → redépôt unique");
const avantDepot = { ...ligneBVue, listing_id: "34000001" };
ok(decisionDepotCoupe({ job: depotB, lignes: [plancher, avantDepot], runs: runsB, empreinte: empB }).decision === "relancer",
  "une annonce au numéro plus petit que ceux du compte avant l'essai n'est jamais ce dépôt");

console.log("\n7. APPARIEMENT MUTUEL : DEUX DÉPÔTS, UNE ANNONCE → AUCUN DES DEUX");
const m = appariementMutuel(new Map([["a", { decision: "rattacher", annonce: { listing_id: "1" } }], ["b", { decision: "rattacher", annonce: { listing_id: "1" } }], ["c", { decision: "relancer" }]]));
ok(m.get("a").decision === "question" && m.get("b").decision === "question" && m.get("c").decision === "relancer", "deux pyjamas aux mêmes photos désignent la même annonce → la question, jamais un rattachement au hasard");

console.log("\n8. HANDLER-WATCH L'APPLIQUE");
const hw = fs.readFileSync(new URL("../supabase/functions/handler-watch/index.ts", import.meta.url), "utf8");
ok(hw.includes("decisionDepotCoupe({") && hw.includes("appariementMutuel(decisions)") && hw.includes('.eq("status", "needs_user").select("id")'),
  "handler-watch juge, apparie, écrit sous condition de statut");
ok(hw.includes("/functions/v1/empreintes-urls") && hw.includes('"x-cron-secret": secretEmpreintes'), "les empreintes manquantes sont demandées à empreintes-urls (secret de cron, jamais écrit)");
ok(hw.includes('feature: "depot_coupe_tranche"'), "chaque relance laisse une trace dans usage_logs");
ok(presenceCandidate({ listing_id: "x", created_at: "2026-10-01T00:00:00Z" }, [], []).etat === "presente", "sans relevé, une annonce n'est jamais déclarée absente");

console.log("\n9. LOUIS 29/10 : LE DÉPÔT INACHEVÉ SUR « OPTIONS » NE RETIENT PAS LA REMISE EN LIGNE");
// Relevé en base le 29/10 (job 68e39f7c « Rangement Noir et Vert Pomme ») : essai arrêté sur /options à 08:22:42Z
// (« Leboncoin a refusé l'accès à la page à l'instant »), annonce 3297429776 apparue au statut Leboncoin
// « inactive » (relevé : inconnu), sans date de mise en ligne ; page publique relue 410 « Cette annonce est désactivée ».
const jobVP = {
  id: "68e39f7c-c58d-4d7f-96a7-d9aeb340c714", user_id: "faf5021a-479a-4bb3-b3ec-c296770739b7", platform: "leboncoin",
  action: "republish", status: "needs_user", inventaire_id: 1791020281558, photos: [],
  platform_fields: {
    republish_step: "deleted", deleted_at: "2026-10-29T08:13:18.275Z", old_platform_listing_id: "3291302906",
    needs_user_source: "recreation_deja_partie",
    recreation_deja_partie: { le: "2026-10-29T08:24:17.517Z", essai: { at: "2026-10-29T08:23:30.783Z", raison: "annonce peut-être déjà partie — relue avant toute relance" }, verdict: "incertaine" },
    work_window_state: {
      fins: [
        { at: "2026-10-29T08:18:17.829Z", tab_url: "https://www.leboncoin.fr/deposer-une-annonce", fill_step: "wizard_entree" },
        { at: "2026-10-29T08:22:42.721Z", tab_url: "https://www.leboncoin.fr/deposer-une-annonce/options", fill_step: "depot" },
      ],
      at_end: { at: "2026-10-29T08:22:42.721Z", tab_url: "https://www.leboncoin.fr/deposer-une-annonce/options", fill_step: "depot" },
      at_start: { at: "2026-10-29T08:21:24.845Z", tab_url: "https://www.leboncoin.fr/deposer-une-annonce" },
    },
  },
};
const ligneVP = { user_id: jobVP.user_id, listing_id: "3297429776", url: "https://www.leboncoin.fr/ad/vetements/3297429776",
  statut_plateforme: "inconnu", publiee_le: null, job_id: null, inventaire_id: null, created_at: "2026-10-29T08:22:58.095Z",
  vu_le: "2026-10-29T08:23:48.569Z", disparu_le: null, photo_url: "https://img.leboncoin.fr/api/v1/lbcpb1/images/55/c3/7d/55c37d4cd8007c3c64e9e44e345d12679d7b1b64.jpg?rule=ad-thumb" };
const runsVP = [
  { id: "73643b3e", status: "done", started_at: "2026-10-29T08:22:49.078Z", finished_at: "2026-10-29T08:23:27.408Z", items_vus: 412, total_entries: 411, erreur: "[défilement] [adresse] 5 page(s), 411 en ligne lues sur 411 annoncées · [rattachement] par identifiant 0" },
  { id: "7f259f45", status: "done", started_at: "2026-10-29T08:23:39.922Z", finished_at: "2026-10-29T08:24:13.931Z", items_vus: 412, total_entries: 411, erreur: "[défilement] [adresse] 5 page(s), 411 en ligne lues sur 411 annoncées · [rattachement] par identifiant 0" },
];
ok(essaisArretesSurOptionsLbc(jobVP.platform_fields, Date.parse(jobVP.platform_fields.deleted_at)).length === 1, "l'essai de 08:22:42Z s'est arrêté sur /options, sans confirmation");
ok(depotInacheveLbc("leboncoin", jobVP.platform_fields, ligneVP, { depuis: Date.parse(jobVP.platform_fields.deleted_at) }), "3297429776 (inactive, sans date de mise en ligne, apparue pendant cet essai) = dépôt inachevé");
const dVP = decisionDepotCoupe({ job: jobVP, lignes: [ligneVP], runs: runsVP, empreinte: () => undefined });
ok(dVP.decision === "relancer" && dVP.absentes?.[0]?.listing_id === "3297429776" && /inachevé/.test(dVP.absentes[0].preuve),
  "→ la remise en ligne repart une fois (aucune annonce en ligne), la trace dit « dépôt inachevé »", JSON.stringify(dVP));
ok(!depotInacheveLbc("leboncoin", jobVP.platform_fields, { ...ligneVP, statut_plateforme: "en_ligne" }, {}), "vue « en ligne » une seule fois → jamais un dépôt inachevé (garde intacte)");
ok(!depotInacheveLbc("leboncoin", jobVP.platform_fields, { ...ligneVP, publiee_le: "2026-10-29T08:30:00Z" }, {}), "une date de mise en ligne → jamais un dépôt inachevé");
const confirme = { ...jobVP.platform_fields, work_window_state: { ...jobVP.platform_fields.work_window_state,
  fins: [...jobVP.platform_fields.work_window_state.fins, { at: "2026-10-29T08:23:10.000Z", tab_url: "https://www.leboncoin.fr/deposer-une-annonce/confirmation", fill_step: "depot" }] } };
ok(!depotInacheveLbc("leboncoin", confirme, ligneVP, {}), "essai passé par la confirmation (option choisie, annonce en vérification) → la question reste");
ok(!depotInacheveLbc("beebs", jobVP.platform_fields, ligneVP, {}), "Leboncoin seulement");
const sansOptions = { ...jobVP.platform_fields, work_window_state: { at_end: { at: "2026-10-29T08:22:42.721Z", tab_url: "https://www.leboncoin.fr/deposer-une-annonce", fill_step: "photos" } } };
ok(!depotInacheveLbc("leboncoin", sansOptions, ligneVP, {}), "un essai qui ne s'est pas arrêté sur /options ne prouve rien");
ok(decisionDepotCoupe({ job: { ...jobVP, platform_fields: sansOptions }, lignes: [ligneVP], runs: runsVP, empreinte: () => undefined }).decision !== "relancer",
  "sans cette preuve, une annonce apparue depuis l'essai et encore relevée retient toujours le redépôt");
const gpj = fs.readFileSync(new URL("../supabase/functions/get-pending-jobs/index.ts", import.meta.url), "utf8");
ok(gpj.includes("depotInacheveLbc(plateforme, pf, c,") && /publiee_le"\)\s*\n\s*\.eq\("platform", plateforme\)/.test(gpj), "get-pending-jobs écarte le dépôt inachevé avant de juger (publiee_le lu)");
ok(hw.includes("retiree_le, publiee_le\")"), "handler-watch lit publiee_le des candidates");

if (ko) { console.error(`\n✗ ${ko} contrôle(s) en échec`); process.exit(1); }
console.log("\n✓ dépôts coupés : tous les contrôles passent");
