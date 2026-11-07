// Autotest de la règle « NOS PROPRES DÉPÔTS EN DOUBLE » (07/11, Ciddjy 49342549) —
// supabase/functions/_shared/recreation-deja-partie.js (essaisSuspectsDepuisRetrait, doublonsDeNosEssais,
// jugerCandidates `doublons`, retraitDoublonDeNosEssais, questionDoublonsARejuger) et son branchement dans
// get-pending-jobs.
//   node scripts/doublons-de-nos-essais-selftest.mjs
// Les cas sont RELEVÉS en base le 07/11 (lecture seule) : job 49342549 (journal_etapes, work_window_state,
// recreation_essais_avant_relance, question du 13:40), annonces_plateforme des 4 annonces Beebs, photo_empreintes
// (scripts/fixtures/empreintes-ciddjy-doublons-0711.json), fiche 1790852574684002 (quantite 1) ; et la seule autre
// question à plusieurs liens du parc (Leboncoin db4617d6, « Billard Japonais »).
import { readFileSync } from "node:fs";
import {
  essaisSuspectsDepuisRetrait, doublonsDeNosEssais, jugerCandidates, retraitDoublonDeNosEssais, trierCandidatesDepuisRetrait,
  questionDoublonsARejuger, marqueDoublonsRejuge, releveCompletAvantRedepot, patchRattachementRecreation, depotPeutEtrePartiDepuis,
  MOTIF_DOUBLON_DE_NOS_ESSAIS, REJUGES_DOUBLONS_MAX, REJUGE_DOUBLONS_ESPACEMENT_MS, QUESTIONS_DOUBLONS_PAR_PASSAGE, urlsPhotos,
} from "../supabase/functions/_shared/recreation-deja-partie.js";

let ko = 0;
const ok = (nom, cond, detail = "") => {
  if (cond) console.log(`  ✓ ${nom}`);
  else { ko++; console.log(`  ✗ ${nom} ${detail}`); }
};

// ── Les données relues en base (07/11) ──────────────────────────────────────────────────────────────────────────────
const JOB_ID = "49342549-372a-4826-80ed-d9c45e96994e";
const USER = "eacbe32c-1929-41a8-927d-7f3cff621f5a";
const FICHE = 1790852574684002;
const RETRAIT = "2026-11-07T05:27:02.912Z";
const URL_COPIE = (i) => `https://tojihnuawsoohlolangc.supabase.co/storage/v1/object/public/listing-photos/${USER}/rehosted/${FICHE}/1790855059258_${i}.jpg`;
const pfCiddjy = {
  republish_step: "deleted", deleted_at: RETRAIT, old_platform_listing_id: "34177027",
  old_listing_url: "https://www.beebs.app/fr/p/34177027", needs_user_source: "recreation_deja_partie",
  journal_etapes: [
    { le: "2026-11-06T15:41:28.727Z", etape: "captured", statut: "pending" },
    { le: "2026-11-07T05:23:31.251Z", etape: "captured", statut: "processing" },
    { le: "2026-11-07T05:27:03.000Z", etape: "deleted", statut: "pending" },
    { le: "2026-11-07T05:34:35.810Z", etape: "deleted", statut: "processing" },
    { le: "2026-11-07T05:44:41.025Z", etape: "deleted", statut: "pending" },
    { le: "2026-11-07T05:54:00.489Z", etape: "deleted", statut: "processing" },
    { le: "2026-11-07T06:04:16.966Z", etape: "deleted", statut: "pending" },
    { le: "2026-11-07T06:15:35.913Z", etape: "deleted", statut: "processing" },
    { le: "2026-11-07T06:25:42.435Z", etape: "deleted", statut: "pending" },
    { le: "2026-11-07T06:49:35.544Z", etape: "deleted", statut: "processing" },
    { le: "2026-11-07T06:59:42.898Z", etape: "deleted", statut: "pending" },
    { le: "2026-11-07T07:30:08.950Z", etape: "deleted", statut: "needs_user" },
    { le: "2026-11-07T12:30:11.888Z", etape: "deleted", statut: "pending" },
    { le: "2026-11-07T12:40:31.733Z", etape: "deleted", statut: "needs_user" },
  ],
  work_window_state: {
    fins: [
      { at: "2026-11-07T05:44:40.205Z", tab_url: "https://www.beebs.app/fr/listing", fill_step: null },
      { at: "2026-11-07T06:04:16.230Z", tab_url: "https://www.beebs.app/fr/listing", fill_step: null },
      { at: "2026-11-07T06:25:41.781Z", tab_url: "https://www.beebs.app/fr/listing", fill_step: null },
      { at: "2026-11-07T06:59:42.165Z", tab_url: "https://www.beebs.app/fr/listing", fill_step: null },
    ],
    at_end: { at: "2026-11-07T06:59:42.165Z", tab_url: "https://www.beebs.app/fr/listing", fill_step: null },
    at_start: { at: "2026-11-07T06:49:38.772Z", tab_url: "https://www.beebs.app/fr/listing", fill_step: null },
  },
  // error_technique a été mis de côté par la relance « remplissage_borne_depassee » de 12:30 (champsRelanceCauseLevee).
  recreation_essais_avant_relance: {
    le: "2026-11-07T12:30:11.871Z", recreation_reprises: 4, recreation_tentee: null,
    recreation_bloquee: { le: "2026-11-07T07:30:08.931Z", par: "handler-watch", essais: 4, statut_avant: "pending" },
    recreation_reprise: { n: 4, at: "2026-11-07T06:59:43.462Z", statut_recu: "needs_user",
      brut: "Ton annonce a été retirée de Beebs et n'a pas pu être redéposée automatiquement : Timeout: pas de réponse du content script (borne 10 min dépassée, dernière phase : debut). Rien n'est perdu" },
  },
  recreation_depot_parti: { at: "2026-11-07T12:40:31.706Z", raison: "annonce peut-être déjà partie — relue avant toute relance" },
  recreation_deja_partie: {
    le: "2026-11-07T12:40:31.706Z", verdict: "incertaine", releve: "0d50dea3-19f8-4ee0-8554-ce139ad6ce73",
    essai: { at: "2026-11-07T12:30:11.871Z", raison: "remise en ligne arrêtée à la borne du remplissage : annonces relues avant tout redépôt" },
    raisons: ["4 annonces apparues depuis le retrait"],
    liens: ["34309865", "34309820", "34309782", "34309939"].map((n) => `https://www.beebs.app/fr/p/${n}-lot-4-pantalons-gar-on-18-mois`),
  },
};
const jobCiddjy = {
  id: JOB_ID, user_id: USER, platform: "beebs", action: "republish", status: "needs_user", inventaire_id: FICHE,
  title: "Lot 4 pantalons garçon 18 mois",
  error: "Une annonce Beebs pourrait correspondre à cet article : … (4 annonces apparues depuis le retrait) …",
  photos: Array.from({ length: 9 }, (_, i) => ({ url: URL_COPIE(i), type: i ? `photo_${i}` : "original" })),
  platform_fields: pfCiddjy,
};
const VIGNETTE = {
  34309782: "https://cdn.beebs.app/3c268b6e-8925-4358-90a7-2309f532cc67.jpg",
  34309820: "https://cdn.beebs.app/87ff5489-75e8-42cb-8581-d0319b8a6bce.jpg",
  34309865: "https://cdn.beebs.app/0491e347-fcca-455f-89ea-937fd11281d5.jpg",
  34309939: "https://cdn.beebs.app/95d61a97-3dd3-430a-9dae-74d6734d4368.jpg",
};
// Lignes annonces_plateforme telles que get-pending-jobs les lit (première vue du relevé 67a507a6, revues par 0d50dea3).
const ligne = (n) => ({
  listing_id: String(n), url: `https://www.beebs.app/fr/p/${n}-lot-4-pantalons-gar-on-18-mois`, titre: "Lot 4 pantalons garçon 18 mois",
  prix: "8", photo_url: VIGNETTE[n], capture: null, statut_plateforme: "en_ligne", job_id: null, inventaire_id: null,
  created_at: "2026-11-07T12:34:33.996759Z", vu_le: "2026-11-07T12:38:02.184Z", disparu_le: null, proposition: null, publiee_le: null,
});
const LIGNES = [34309782, 34309820, 34309865, 34309939].map(ligne);
const RELEVE_DEPUIS = "2026-11-07T12:37:36.022Z"; // relevé complet 0d50dea3 (123 annonces)
const FICHE_LUE = { quantite: 1, statut: "stock", fusionne_dans: null };
const EMP = JSON.parse(readFileSync(new URL("./fixtures/empreintes-ciddjy-doublons-0711.json", import.meta.url), "utf8")).lignes;
const empDe = (u) => EMP.find((e) => e.url === u);
const empreintesCopie = urlsPhotos(jobCiddjy.photos).map(empDe).filter(Boolean);
const parCandidate = (cands) => new Map(cands.map((c) => [String(c.listing_id), [empDe(c.photo_url)].filter(Boolean)]));

console.log("1. LE CONSTAT — essais suspects de CE job depuis le retrait (journal du serveur)");
const essais = essaisSuspectsDepuisRetrait("beebs", pfCiddjy);
ok("Ciddjy : 4 essais suspects (06:34, 06:54, 07:15, 07:49 à Paris)", essais.length === 4, JSON.stringify(essais));
ok("leurs débuts sont ceux du journal", JSON.stringify(essais.map((e) => e.debut)) === JSON.stringify([
  "2026-11-07T05:34:35.810Z", "2026-11-07T05:54:00.489Z", "2026-11-07T06:15:35.913Z", "2026-11-07T06:49:35.544Z"]));
ok("les trois premiers : arrêtés à la borne (10 min) — le 4e : brut « borne 10 min dépassée » mis de côté par la relance",
  essais.slice(0, 3).every((e) => /borne du remplissage/.test(e.raison)) && /muet ou arrêté à la borne/.test(essais[3].raison), JSON.stringify(essais.map((e) => e.raison)));
ok("les marqueurs (question 12:40, relance 12:30) ne sont pas des essais",
  essaisSuspectsDepuisRetrait("beebs", { ...pfCiddjy, recreation_depot_parti: { at: "2026-11-07T12:30:11.871Z", raison: "remise en ligne arrêtée à la borne du remplissage : annonces relues avant tout redépôt" } }).length === 4);
ok("l'essai d'AVANT le retrait (05:23, étape captured) n'est pas compté", !essais.some((e) => e.debut < RETRAIT));
ok("garde du 25/09 inchangée : le job reste suspect tant qu'il est à l'étape deleted",
  depotPeutEtrePartiDepuis("beebs", { ...pfCiddjy, recreation_depot_parti: { at: "2026-11-07T12:30:11.871Z", raison: "x" } }) !== null);
// Un essai Beebs court (formulaire refusé à 3 min) n'a pas cliqué : pas suspect.
const journalCourt = [
  { le: "2026-11-07T05:27:03.000Z", etape: "deleted", statut: "pending" },
  { le: "2026-11-07T05:34:00.000Z", etape: "deleted", statut: "processing" },
  { le: "2026-11-07T05:37:00.000Z", etape: "deleted", statut: "pending" },
];
ok("Beebs : essai de 3 min sur le formulaire, sans brut muet → pas suspect",
  essaisSuspectsDepuisRetrait("beebs", { deleted_at: RETRAIT, journal_etapes: journalCourt, work_window_state: { fins: [{ at: "2026-11-07T05:36:59Z", tab_url: "https://www.beebs.app/fr/listing" }] } }).length === 0);
ok("Beebs : essai de 3 min terminé sur la page produit → suspect",
  essaisSuspectsDepuisRetrait("beebs", { deleted_at: RETRAIT, journal_etapes: journalCourt, work_window_state: { fins: [{ at: "2026-11-07T05:36:59Z", tab_url: "https://www.beebs.app/fr/p/34309000" }] } }).length === 1);
ok("Beebs : essai de 3 min avec un brut « pas de réponse du content script » (error_technique.precedents) → suspect",
  essaisSuspectsDepuisRetrait("beebs", { deleted_at: RETRAIT, journal_etapes: journalCourt,
    error_technique: { at: "2026-11-07T05:37:01Z", brut: "x", precedents: [{ at: "2026-11-07T05:36:58Z", brut: "Timeout: pas de réponse du content script" }] } }).length === 1);
ok("deux essais courts qui se touchent : la fin sur la page produit du 1er ne rend pas le 2e suspect (un signe = un essai)",
  essaisSuspectsDepuisRetrait("beebs", { deleted_at: RETRAIT, journal_etapes: [
    { le: "2026-11-07T05:34:00.000Z", etape: "deleted", statut: "processing" },
    { le: "2026-11-07T05:37:00.000Z", etape: "deleted", statut: "pending" },
    { le: "2026-11-07T05:37:30.000Z", etape: "deleted", statut: "processing" },
    { le: "2026-11-07T05:40:00.000Z", etape: "deleted", statut: "pending" }],
  work_window_state: { fins: [{ at: "2026-11-07T05:36:59Z", tab_url: "https://www.beebs.app/fr/p/34309000" },
    { at: "2026-11-07T05:39:59Z", tab_url: "https://www.beebs.app/fr/listing" }] } }).length === 1);
ok("un essai qui a abouti (published) n'est jamais compté à la borne",
  essaisSuspectsDepuisRetrait("beebs", { deleted_at: RETRAIT, journal_etapes: [
    { le: "2026-11-07T05:34:00.000Z", etape: "deleted", statut: "processing" },
    { le: "2026-11-07T05:46:00.000Z", etape: "recreated", statut: "published" }] }).length === 0);
// Leboncoin : l'étape relayée fait foi ; la durée seule ne compte pas.
ok("Leboncoin : essai arrêté sur /options → suspect ; arrêté à l'étape adresse → pas suspect",
  essaisSuspectsDepuisRetrait("leboncoin", { deleted_at: RETRAIT, journal_etapes: journalCourt,
    work_window_state: { fins: [{ at: "2026-11-07T05:36:59Z", tab_url: "https://www.leboncoin.fr/deposer-une-annonce/options", fill_step: "depot" }] } }).length === 1
  && essaisSuspectsDepuisRetrait("leboncoin", { deleted_at: RETRAIT, journal_etapes: [
    { le: "2026-11-07T05:34:00.000Z", etape: "deleted", statut: "processing" }, { le: "2026-11-07T05:46:00.000Z", etape: "deleted", statut: "pending" }],
  work_window_state: { fins: [{ at: "2026-11-07T05:45:59Z", tab_url: "https://www.leboncoin.fr/deposer-une-annonce", fill_step: "adresse" }] } }).length === 0);
ok("journal absent : chaque signe daté compte (à plus de 3 min), at_end répété compte une fois",
  essaisSuspectsDepuisRetrait("leboncoin", { deleted_at: RETRAIT, work_window_state: {
    fins: [{ at: "2026-11-07T06:00:00Z", tab_url: "https://www.leboncoin.fr/deposer-une-annonce/options", fill_step: "depot" },
      { at: "2026-11-07T06:30:00Z", tab_url: "https://www.leboncoin.fr/deposer-une-annonce/options", fill_step: "depot" }],
    at_end: { at: "2026-11-07T06:30:00Z", tab_url: "https://www.leboncoin.fr/deposer-une-annonce/options", fill_step: "depot" } } }).length === 2);
ok("plateforme sans règle de redépôt (vinted) → aucun essai", essaisSuspectsDepuisRetrait("vinted", pfCiddjy).length === 0);
// L'autre question à plusieurs liens du parc (relue le 07/11) : Leboncoin db4617d6, journal tronqué à 3 entrées.
const pfBillard = {
  republish_step: "deleted", deleted_at: "2026-11-06T06:25:00.453Z", old_platform_listing_id: "3301959712",
  journal_etapes: [
    { le: "2026-11-06T13:40:58.482Z", etape: "deleted", statut: "needs_user" },
    { le: "2026-11-06T13:43:32.097Z", etape: "deleted", statut: "pending" },
    { le: "2026-11-06T13:52:43.780Z", etape: "deleted", statut: "needs_user" }],
  work_window_state: { fins: [{ at: "2026-11-06T13:35:18.082Z", tab_url: "https://www.leboncoin.fr/deposer-une-annonce", fill_step: "depot" }],
    at_end: { at: "2026-11-06T13:35:18.082Z", tab_url: "https://www.leboncoin.fr/deposer-une-annonce", fill_step: "depot" } },
  error_technique: { at: "2026-11-06T13:35:23.229Z", brut: "Timeout: pas de réponse du content script (borne 10 min dépassée, dernière phase : debut)" },
};
ok("db4617d6 (Billard, Leboncoin) : 1 essai suspect (fin à l'étape « depot »), 2 annonces → la règle ne joue pas",
  essaisSuspectsDepuisRetrait("leboncoin", pfBillard).length === 1
  && doublonsDeNosEssais({ candidates: [{ listing_id: "3302976541" }, { listing_id: "3303479720" }], niveaux: {}, essais: essaisSuspectsDepuisRetrait("leboncoin", pfBillard), fiche: { quantite: 1 }, deletedAt: pfBillard.deleted_at, inventaireId: 1 }).raison === "2 annonces pour 1 essai(s) suspect(s) de cette remise en ligne");

console.log("2. LA RÈGLE — Ciddjy : 4 essais, 4 annonces aux photos de la copie → 1 rattachée, 3 retraits");
const tri = trierCandidatesDepuisRetrait({ jobId: JOB_ID, ancienId: "34177027", deletedAt: RETRAIT, lignes: LIGNES, inventaireId: FICHE,
  numerosAutres: new Map(), fichesJobs: new Map(), platform: "beebs", vusAvant: new Map() });
ok("les 4 annonces sont candidates (apparues depuis le retrait, inconnues de FillSell)", tri.candidates.length === 4 && !tri.ecartees.length);
const doublons = { essais, fiche: FICHE_LUE, deletedAt: RETRAIT, ancienId: "34177027", jobId: JOB_ID, inventaireId: FICHE, releveDepuis: RELEVE_DEPUIS };
const v = jugerCandidates({ candidates: tri.candidates, empreintesCopie, empreintesParCandidate: parCandidate(tri.candidates), doublons });
ok("verdict « doublons_nos_essais »", v.verdict === "doublons_nos_essais", JSON.stringify(v).slice(0, 300));
ok("toutes au niveau « meme » (vignette à 0 bit de la photo 1 de notre copie)", Object.values(v.photos ?? {}).length === 4 && Object.values(v.photos).every((n) => n === "meme"));
ok("la plus ANCIENNE est gardée : 34309782", String(v.retenue?.listing_id) === "34309782");
ok("les trois autres partent : 34309820, 34309865, 34309939", JSON.stringify((v.aRetirer ?? []).map((c) => c.listing_id)) === JSON.stringify(["34309820", "34309865", "34309939"]));
ok("4 essais suspects tracés", v.essais === 4);
// L'ordre des lignes ne change rien.
const vInverse = jugerCandidates({ candidates: [...tri.candidates].reverse(), empreintesCopie, empreintesParCandidate: parCandidate(tri.candidates), doublons });
ok("ordre des lignes inversé → même annonce gardée", String(vInverse.retenue?.listing_id) === "34309782");

console.log("3. LE CIRCUIT DE RETRAIT RÉUTILISÉ — un job « delete » par doublon, numéro exact");
const lignesRetrait = v.aRetirer.map((c) => retraitDoublonDeNosEssais({ userId: USER, job: jobCiddjy, annonce: c, garde: v.retenue.listing_id,
  numeros: ["34309782", "34309820", "34309865", "34309939"], essais: v.essais, lien: c.url, maintenant: "2026-11-07T20:00:00.000Z" }));
const r0 = lignesRetrait[0];
ok("action delete, statut pending, voie extension, photo_option original (forme du doublon_de_republication)",
  lignesRetrait.every((r) => r.action === "delete" && r.status === "pending" && r.voie === "extension" && r.photo_option === "original" && r.platform === "beebs" && r.user_id === USER));
ok("numéro EXACT et lien de l'annonce visée", r0.platform_listing_id === "34309820" && r0.listing_url === "https://www.beebs.app/fr/p/34309820-lot-4-pantalons-gar-on-18-mois");
ok("sur la fiche de l'article", lignesRetrait.every((r) => r.inventaire_id === FICHE));
ok("tracé : motif doublon_de_nos_essais, tâche source, annonce gardée, numéros",
  r0.platform_fields.arme_par.chemin === "doublon_de_republication" && r0.platform_fields.arme_par.motif === MOTIF_DOUBLON_DE_NOS_ESSAIS
  && r0.platform_fields.arme_par.republication === JOB_ID && r0.platform_fields.arme_par.garde === "34309782"
  && r0.platform_fields.arme_par.numeros.length === 4 && r0.platform_fields.arme_par.essais_suspects === 4);
ok("jamais armé comme un retrait de vente (pas « armer_retrait_job », pas « vente_… »)",
  !/armer_retrait_job/.test(r0.platform_fields.arme_par.pose_par) && !/^vente_/.test(r0.platform_fields.arme_par.chemin));
ok("le retrait ne vise jamais l'annonce gardée", !lignesRetrait.some((r) => r.platform_listing_id === "34309782"));
const patch = patchRattachementRecreation(pfCiddjy, v.retenue, { trace: { verdict: v.verdict }, preuve: v.preuve, photos: v.photos, posePar: "get-pending-jobs (redépôt interrompu : doublons de nos propres essais)", maintenant: "2026-11-07T20:00:00.000Z" });
ok("rattachement de 34309782 : published, étape recreated, lien et numéro, la question levée",
  patch.status === "published" && patch.platform_listing_id === "34309782" && /\/p\/34309782-/.test(patch.listing_url)
  && patch.platform_fields.republish_step === "recreated" && !("needs_user_source" in patch.platform_fields));

console.log("4. UNE CONDITION MANQUE → la question, comme aujourd'hui");
const sansDoublons = (cands) => jugerCandidates({ candidates: cands, empreintesCopie, empreintesParCandidate: parCandidate(cands) });
const cinq = [...tri.candidates, { ...ligne(34309990), photo_url: VIGNETTE[34309939] }];
const v5 = jugerCandidates({ candidates: cinq, empreintesCopie, empreintesParCandidate: parCandidate(cinq), doublons });
ok("5 annonces pour 4 essais → question", v5.verdict === "incertaine" && /5 annonces pour 4 essai/.test(v5.doublons_refus ?? ""), JSON.stringify(v5).slice(0, 200));
ok("… avec le message et les liens d'aujourd'hui", JSON.stringify(v5.raisons) === JSON.stringify(["5 annonces apparues depuis le retrait"]) && v5.liens.length === 5);
// Une photo différente : la vignette d'une autre pièce (empreintes inversées : aucune paire à moins de 12 bits).
const inverse = (s) => [...s].map((b) => (b === "0" ? "1" : "0")).join("");
const autre = { url: "https://cdn.beebs.app/autre-piece.jpg", dhash: inverse(EMP[0].dhash), phash: inverse(EMP[0].phash) };
const unePhotoDiff = tri.candidates.map((c, i) => (i === 2 ? { ...c, photo_url: autre.url } : c));
const empAvecAutre = new Map(unePhotoDiff.map((c) => [String(c.listing_id), [c.photo_url === autre.url ? autre : empDe(c.photo_url)].filter(Boolean)]));
const vDiff = jugerCandidates({ candidates: unePhotoDiff, empreintesCopie, empreintesParCandidate: empAvecAutre, doublons });
ok("une photo différente → question", vDiff.verdict === "incertaine" && /34309865 ne porte pas les photos de notre copie \(autre\)/.test(vDiff.doublons_refus ?? ""), JSON.stringify(vDiff).slice(0, 300));
const sansEmpreinte = new Map(tri.candidates.map((c, i) => [String(c.listing_id), i === 1 ? [] : [empDe(c.photo_url)]]));
const vSansEmp = jugerCandidates({ candidates: tri.candidates, empreintesCopie, empreintesParCandidate: sansEmpreinte, doublons });
ok("une annonce sans empreinte encore → question (non comparée)", vSansEmp.verdict === "incertaine" && /34309820 .*inconnu/.test(vSansEmp.doublons_refus ?? ""), vSansEmp.doublons_refus);
const vQ2 = jugerCandidates({ candidates: tri.candidates, empreintesCopie, empreintesParCandidate: parCandidate(tri.candidates), doublons: { ...doublons, fiche: { ...FICHE_LUE, quantite: 2 } } });
ok("fiche à 2 exemplaires → question", vQ2.verdict === "incertaine" && /2 exemplaires/.test(vQ2.doublons_refus ?? ""));
ok("fiche à quantité NULL vaut 1 → la règle joue", jugerCandidates({ candidates: tri.candidates, empreintesCopie, empreintesParCandidate: parCandidate(tri.candidates), doublons: { ...doublons, fiche: { quantite: null, statut: "stock" } } }).verdict === "doublons_nos_essais");
ok("fiche illisible → question", jugerCandidates({ candidates: tri.candidates, empreintesCopie, empreintesParCandidate: parCandidate(tri.candidates), doublons: { ...doublons, fiche: null } }).verdict === "incertaine");
ok("article vendu → question", jugerCandidates({ candidates: tri.candidates, empreintesCopie, empreintesParCandidate: parCandidate(tri.candidates), doublons: { ...doublons, fiche: { quantite: 1, statut: "vendu" } } }).verdict === "incertaine");
ok("fiche fusionnée → question", jugerCandidates({ candidates: tri.candidates, empreintesCopie, empreintesParCandidate: parCandidate(tri.candidates), doublons: { ...doublons, fiche: { quantite: 1, fusionne_dans: 123 } } }).verdict === "incertaine");
ok("tâche sans fiche → question", jugerCandidates({ candidates: tri.candidates, empreintesCopie, empreintesParCandidate: parCandidate(tri.candidates), doublons: { ...doublons, inventaireId: null } }).verdict === "incertaine");
const avantRetrait = tri.candidates.map((c, i) => (i === 3 ? { ...c, created_at: "2026-11-07T05:00:00Z" } : c));
ok("une annonce apparue avant le retrait → question", /apparue avant le retrait/.test(doublonsDeNosEssais({ candidates: avantRetrait, niveaux: v.photos, ...doublons }).raison ?? ""));
ok("une annonce plus ancienne que l'annonce retirée → question",
  /plus ancienne que l'annonce retirée/.test(doublonsDeNosEssais({ candidates: tri.candidates, niveaux: v.photos, ...doublons, ancienId: "34309800" }).raison ?? ""));
ok("une annonce non revue par le dernier relevé complet → question",
  /pas été revue/.test(doublonsDeNosEssais({ candidates: tri.candidates.map((c, i) => (i === 0 ? { ...c, vu_le: "2026-11-07T12:35:00Z" } : c)), niveaux: v.photos, ...doublons }).raison ?? ""));
ok("une annonce rattachée à un autre job → question",
  /autre job/.test(doublonsDeNosEssais({ candidates: tri.candidates.map((c, i) => (i === 1 ? { ...c, job_id: "aaaaaaaa-0000-0000-0000-000000000000" } : c)), niveaux: v.photos, ...doublons }).raison ?? ""));
ok("une annonce hors ligne (désactivée) → question",
  /n'est pas en ligne/.test(doublonsDeNosEssais({ candidates: tri.candidates.map((c, i) => (i === 1 ? { ...c, statut_plateforme: "desactivee" } : c)), niveaux: v.photos, ...doublons }).raison ?? ""));
ok("essais illisibles (aucun) → question", jugerCandidates({ candidates: tri.candidates, empreintesCopie, empreintesParCandidate: parCandidate(tri.candidates), doublons: { ...doublons, essais: [] } }).verdict === "incertaine");

console.log("5. ZÉRO RÉGRESSION — une seule annonce, ou sans `doublons` : les verdicts d'avant, à l'identique");
const une = [tri.candidates[0]];
const vUneAvant = sansDoublons(une);
const vUneApres = jugerCandidates({ candidates: une, empreintesCopie, empreintesParCandidate: parCandidate(une), doublons });
ok("une seule annonce aux photos de la copie → « certaine » (cascade du 15/10), avec ou sans la règle",
  vUneAvant.verdict === "certaine" && JSON.stringify(vUneApres) === JSON.stringify(vUneAvant));
const uneAutre = [{ ...tri.candidates[0], photo_url: autre.url }];
const empUneAutre = new Map([[String(uneAutre[0].listing_id), [autre]]]);
ok("une seule annonce, autre photo → « incertaine », identique avec ou sans la règle",
  JSON.stringify(jugerCandidates({ candidates: uneAutre, empreintesCopie, empreintesParCandidate: empUneAutre }))
  === JSON.stringify(jugerCandidates({ candidates: uneAutre, empreintesCopie, empreintesParCandidate: empUneAutre, doublons })));
const v4Avant = sansDoublons(tri.candidates);
ok("Ciddjy SANS `doublons` : la question d'aujourd'hui, mot pour mot (aucune clé ajoutée)",
  v4Avant.verdict === "incertaine" && JSON.stringify(v4Avant.raisons) === JSON.stringify(["4 annonces apparues depuis le retrait"])
  && !("doublons_refus" in v4Avant) && JSON.stringify(Object.keys(v4Avant)) === JSON.stringify(["verdict", "raisons", "liens", "photos"]));
ok("aucune annonce → « aucune », avec ou sans la règle", jugerCandidates({ candidates: [], doublons }).verdict === "aucune");
ok("sans empreintes du tout → la question d'avant (branche sans photos), la règle ne joue pas",
  JSON.stringify(jugerCandidates({ candidates: tri.candidates, doublons })) === JSON.stringify(jugerCandidates({ candidates: tri.candidates })));
ok("identifiant conservé exact (une annonce) → « certaine », la règle ne s'en mêle pas",
  jugerCandidates({ candidates: [tri.candidates[0]], listingIdProuve: "34309782", doublons }).verdict === "certaine");
// 2 « meme » + 1 « autre » : la cascade d'avant ne tranche pas (deux mêmes photos), la règle non plus (pas TOUTES).
const deuxPlusAutre = [tri.candidates[0], tri.candidates[1], { ...tri.candidates[2], photo_url: autre.url }];
const empDPA = new Map(deuxPlusAutre.map((c) => [String(c.listing_id), [c.photo_url === autre.url ? autre : empDe(c.photo_url)]]));
ok("deux aux photos de la copie + une autre pièce → question (comme avant)",
  jugerCandidates({ candidates: deuxPlusAutre, empreintesCopie, empreintesParCandidate: empDPA, doublons }).verdict === "incertaine");

console.log("6. LES QUESTIONS DÉJÀ POSÉES — rejugées, bornées");
const now = Date.parse("2026-11-07T20:00:00Z");
ok("la question de Ciddjy (4 liens, incertaine) est à rejuger", questionDoublonsARejuger(jobCiddjy, now));
ok("une question à 1 lien ne l'est pas (la cascade d'avant suffit)",
  !questionDoublonsARejuger({ ...jobCiddjy, platform_fields: { ...pfCiddjy, recreation_deja_partie: { ...pfCiddjy.recreation_deja_partie, liens: ["x"] } } }, now));
ok("ni « relevé introuvable », ni un autre motif, ni une publication, ni Vinted",
  !questionDoublonsARejuger({ ...jobCiddjy, platform_fields: { ...pfCiddjy, recreation_deja_partie: { ...pfCiddjy.recreation_deja_partie, verdict: "releve_introuvable" } } }, now)
  && !questionDoublonsARejuger({ ...jobCiddjy, platform_fields: { ...pfCiddjy, needs_user_source: "depot_deja_parti" } }, now)
  && !questionDoublonsARejuger({ ...jobCiddjy, action: "publish" }, now)
  && !questionDoublonsARejuger({ ...jobCiddjy, platform: "vinted" }, now)
  && !questionDoublonsARejuger({ ...jobCiddjy, status: "pending" }, now));
const pfM1 = { ...pfCiddjy, doublons_rejuge: marqueDoublonsRejuge(pfCiddjy, { raison: "test", maintenant: new Date(now).toISOString() }) };
ok("rejugée il y a moins de 30 min → pas cette fois", !questionDoublonsARejuger({ ...jobCiddjy, platform_fields: pfM1 }, now + 10 * 60_000));
ok("30 min plus tard → de nouveau", questionDoublonsARejuger({ ...jobCiddjy, platform_fields: pfM1 }, now + REJUGE_DOUBLONS_ESPACEMENT_MS));
let pfN = pfCiddjy;
for (let i = 0; i < REJUGES_DOUBLONS_MAX; i++) pfN = { ...pfN, doublons_rejuge: marqueDoublonsRejuge(pfN, { maintenant: new Date(now + i * 3600_000).toISOString() }) };
ok(`au plus ${REJUGES_DOUBLONS_MAX} fois par question`, pfN.doublons_rejuge.n === REJUGES_DOUBLONS_MAX && !questionDoublonsARejuger({ ...jobCiddjy, platform_fields: pfN }, now + 99 * 3600_000));
const pfNouvelle = { ...pfN, recreation_deja_partie: { ...pfN.recreation_deja_partie, le: "2026-11-08T08:00:00.000Z" } };
ok("une NOUVELLE question (autre « le ») repart de zéro", questionDoublonsARejuger({ ...jobCiddjy, platform_fields: pfNouvelle }, now)
  && marqueDoublonsRejuge(pfNouvelle).n === 1);
ok(`borné à ${QUESTIONS_DOUBLONS_PAR_PASSAGE} questions par passage`, QUESTIONS_DOUBLONS_PAR_PASSAGE === 2);
ok("relevés de Ciddjy (heure de Paris) : 02:01 complet, 13:33 [incomplet] anti-robot écarté, 13:37 complet",
  releveCompletAvantRedepot({ status: "done", items_vus: 120, erreur: "[défilement] …" })
  && !releveCompletAvantRedepot({ status: "incomplete", items_vus: 123, erreur: "[incomplet] [anti_robot] …" })
  && !releveCompletAvantRedepot({ status: "done", items_vus: 123, erreur: "[incomplet] …" })
  && releveCompletAvantRedepot({ status: "done", items_vus: 123, erreur: "[défilement] …" })
  && releveCompletAvantRedepot({ status: "done", items_vus: 0, erreur: "[vide] …" })
  && !releveCompletAvantRedepot({ status: "done", items_vus: 0, erreur: "" }));

console.log("7. LE BRANCHEMENT (get-pending-jobs)");
const gpj = readFileSync(new URL("../supabase/functions/get-pending-jobs/index.ts", import.meta.url), "utf8");
const iDoub = gpj.indexOf('if (juge.verdict === "doublons_nos_essais") {');
const iCert = gpj.indexOf('if (juge.verdict === "certaine") {');
ok("le verdict « doublons » est traité AVANT « certaine », la question en repli", iDoub > 0 && iCert > iDoub
  && /armerDoublonsEtRattacher\(j, pf, juge, trace, "pending"\)\) continue;\s*\n\s*Object\.assign\(juge, \{ verdict: "incertaine"/.test(gpj));
const iArm = gpj.indexOf("const armerDoublonsEtRattacher = async");
const corpsArm = gpj.slice(iArm, gpj.indexOf("for (const j of suspects) {", iArm));
ok("les retraits d'abord (insert), le rattachement ensuite (update) ; un retrait non armé → false, rien n'est rattaché",
  corpsArm.indexOf(".insert(ligne)") > 0 && corpsArm.indexOf(".insert(ligne)") < corpsArm.indexOf(".update(patch)")
  && /non armé[^\n]*\n\s*return false;/.test(corpsArm));
ok("un retrait déjà ouvert sur ce numéro compte (jamais deux)", corpsArm.includes('.not("status", "in", "(cancelled,failed)").eq("platform_listing_id", n)'));
ok("rattachement écrit seulement si le job est toujours dans le statut attendu", corpsArm.includes('.eq("id", idJ).eq("status", statutAttendu)'));
ok("la fiche (exemplaires) lue seulement quand il y a plusieurs annonces", /if \(candidates\.length >= 2 && j\.inventaire_id != null\)/.test(gpj)
  && gpj.includes('.from("inventaire").select("quantite, statut, fusionne_dans")'));
ok("la règle reçoit les essais suspects, la fiche, le retrait, le relevé qui fait foi",
  gpj.includes("essais: essaisSuspectsDepuisRetrait(plateforme, pf), fiche, deletedAt: pf[\"deleted_at\"], ancienId,") && gpj.includes("jobId: idJ, inventaireId: j.inventaire_id ?? null, releveDepuis,"));
ok("vu_le lu (annonce revue par le dernier relevé)", gpj.includes("created_at, vu_le, disparu_le, proposition, publiee_le"));
const iQ = gpj.indexOf("LES QUESTIONS DÉJÀ POSÉES, REJUGÉES PAR LA RÈGLE DES DOUBLONS DE NOS ESSAIS");
const corpsQ = gpj.slice(iQ, gpj.indexOf("if (retirerDeLaFile.size) {", iQ));
ok("questions rejugées : poll ordinaire seulement, bornées, filtrées par questionDoublonsARejuger",
  corpsQ.includes("if (!includeProcessing && !includeNeedsUser) { try {") && corpsQ.includes(".slice(0, QUESTIONS_DOUBLONS_PAR_PASSAGE)")
  && corpsQ.includes("questionDoublonsARejuger(q, Date.now())"));
ok("… sur un relevé complet commencé après l'essai de la question, sinon rien d'écrit",
  /if \(!dernierQ \|\| !\(Date\.parse\(String\(dernierQ\.started_at \?\? ""\)\) > essaiQ\)\) continue;/.test(corpsQ));
ok("… needs_user → published seulement par armerDoublonsEtRattacher (statut attendu needs_user)", corpsQ.includes('armerDoublonsEtRattacher(q, pfQ, jugeQ, traceQ, "needs_user")'));
ok("… un refus est tracé (doublons_rejuge), écrit seulement sur needs_user", corpsQ.includes("doublons_rejuge: marqueDoublonsRejuge(pfQ, { raison: raisonQ })")
  && corpsQ.includes('.eq("id", String(q.id)).eq("status", "needs_user")'));
ok("… une erreur ne touche jamais la file (try/catch propre)", /\} catch \(e\) \{\s*\n\s*\/\/ Jamais un point de panne pour la file/.test(corpsQ));

console.log(ko ? `\n✗ ${ko} cas en échec` : "\n✓ tous les cas passent");
process.exit(ko ? 1 : 0);
