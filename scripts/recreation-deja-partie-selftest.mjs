// Autotest de supabase/functions/_shared/recreation-deja-partie.js — un redépôt
// interrompu ne repart jamais en double (Les Petites Fioles, f554a951, 25/09).
//   node scripts/recreation-deja-partie-selftest.mjs
// Les cas sont RELEVÉS en base (work_window_state, annonces_plateforme,
// photo_empreintes du 25/09), pas imaginés.
import {
  candidatesDepuisRetrait, depotPeutEtrePartiDepuis, jugerCandidates, titreComparable,
  trierCandidatesDepuisRetrait, numerosAutresFiches, depotsAutresFiches, fichesDesJobs, motifAutreFiche, COLONNES_JOBS_AUTRES_FICHES,
  numerosVusAvantRetrait, preuveVueAvantRetrait, MARGE_LECTURE_POSTE_MS, MARGE_PUBLIEE_LBC_MS,
} from "../supabase/functions/_shared/recreation-deja-partie.js";

let ko = 0;
const ok = (nom, cond, detail = "") => {
  if (cond) console.log(`  ✓ ${nom}`);
  else { ko++; console.log(`  ✗ ${nom} ${detail}`); }
};

console.log("1. L'ESSAI SUSPECT — relu dans work_window_state");
// f554a951 : retrait 07:48:50Z, essais à 08:52 et 08:58 (étape depot, page de
// dépôt), puis 09:34:49Z sur /options — le dépôt 3276284130 est parti là.
const pfFioles = {
  republish_step: "deleted",
  deleted_at: "2026-09-25T07:48:50.884Z",
  work_window_state: {
    fins: [
      { at: "2026-09-24T12:10:00.813Z", tab_url: "https://www.leboncoin.fr/ad/vetements/3271176513", fill_step: null },
      { at: "2026-09-25T08:52:59.338Z", tab_url: "https://www.leboncoin.fr/deposer-une-annonce", fill_step: "depot" },
      { at: "2026-09-25T09:34:49.484Z", tab_url: "https://www.leboncoin.fr/deposer-une-annonce/options", fill_step: "depot" },
    ],
    at_end: { at: "2026-09-25T09:34:49.484Z", tab_url: "https://www.leboncoin.fr/deposer-une-annonce/options", fill_step: "depot" },
  },
};
const s = depotPeutEtrePartiDepuis("leboncoin", pfFioles);
ok("f554a951 : l'essai de 09:34:49 est suspect", s && s.at === "2026-09-25T09:34:49.484Z", JSON.stringify(s));
ok("vérifié APRÈS cet essai → plus suspect",
  depotPeutEtrePartiDepuis("leboncoin", { ...pfFioles, recreation_verifiee: { apres: "2026-09-25T09:34:49.484Z" } }) === null);
ok("vérifié AVANT cet essai → toujours suspect",
  depotPeutEtrePartiDepuis("leboncoin", { ...pfFioles, recreation_verifiee: { apres: "2026-09-25T08:52:59.338Z" } }) !== null);
// XEWER 25/09 : arrêts à l'étape « adresse », AVANT le dépôt — jamais suspect.
ok("arrêt à l'étape adresse (XEWER) → pas suspect", depotPeutEtrePartiDepuis("leboncoin", {
  republish_step: "deleted", deleted_at: "2026-09-25T17:40:00Z",
  work_window_state: { at_end: { at: "2026-09-25T17:54:43Z", tab_url: "https://www.leboncoin.fr/deposer-une-annonce", fill_step: "adresse" } },
}) === null);
ok("étape captured (annonce pas retirée) → jamais suspect",
  depotPeutEtrePartiDepuis("leboncoin", { ...pfFioles, republish_step: "captured" }) === null);
ok("fins d'AVANT le retrait ignorées", depotPeutEtrePartiDepuis("leboncoin", {
  republish_step: "deleted", deleted_at: "2026-09-25T10:00:00Z", work_window_state: pfFioles.work_window_state,
}) === null);
ok("essai coupé en route (marqueur handler-watch) → suspect", depotPeutEtrePartiDepuis("leboncoin", {
  republish_step: "deleted", deleted_at: "2026-09-25T07:48:50Z",
  recreation_depot_parti: { at: "2026-09-25T08:30:00Z", raison: "coupé" },
})?.at === "2026-09-25T08:30:00.000Z");
ok("Beebs : page produit en fin d'essai → suspect", depotPeutEtrePartiDepuis("beebs", {
  republish_step: "deleted", deleted_at: "2026-09-25T07:00:00Z",
  work_window_state: { at_end: { at: "2026-09-25T07:20:00Z", tab_url: "https://www.beebs.app/fr/p/34019070", fill_step: null } },
}) !== null);
ok("Beebs : formulaire en fin d'essai → pas suspect", depotPeutEtrePartiDepuis("beebs", {
  republish_step: "deleted", deleted_at: "2026-09-25T07:00:00Z",
  work_window_state: { at_end: { at: "2026-09-25T07:20:00Z", tab_url: "https://www.beebs.app/fr/listing", fill_step: null } },
}) === null);
ok("autre plateforme → jamais", depotPeutEtrePartiDepuis("vinted", pfFioles) === null);
ok("essai commencé après le retrait sans fin relevée → suspect", depotPeutEtrePartiDepuis("leboncoin", {
  republish_step: "deleted", deleted_at: "2026-09-25T07:48:50Z",
  work_window_state: { at_start: { at: "2026-09-25T09:40:23.976Z" }, fins: [{ at: "2026-09-25T09:34:49Z", fill_step: "description" }] },
})?.at === "2026-09-25T09:40:23.976Z");
ok("essai commencé puis terminé avant le dépôt → pas suspect", depotPeutEtrePartiDepuis("leboncoin", {
  republish_step: "deleted", deleted_at: "2026-09-25T07:48:50Z",
  work_window_state: { at_start: { at: "2026-09-25T09:40:23Z" }, fins: [{ at: "2026-09-25T09:45:00Z", fill_step: "description", tab_url: "https://www.leboncoin.fr/deposer-une-annonce" }] },
}) === null);

console.log("\n2. LES CANDIDATES — apparues depuis le retrait");
// annonces_plateforme du compte, relevé en base le 25/09.
const lignes = [
  { listing_id: "3269722824", titre: "Calendrier de l'avant chaussettes à paillettes", prix: 44.99, statut_plateforme: "en_ligne", created_at: "2026-09-24T09:49:45Z", job_id: null },
  { listing_id: "3271176513", titre: "🎅 calendrier de l'avant chaussettes à paillettes personnalisé", prix: 44.99, statut_plateforme: "en_ligne", created_at: "2026-09-24T09:49:45Z", job_id: "448ff5a2", disparu_le: "2026-09-25T09:36:20Z" },
  { listing_id: "3276284130", url: "https://www.leboncoin.fr/ad/vetements/3276284130", titre: "Calendrier de l'avant chaussettes à paillettes personnalisé", prix: 45, statut_plateforme: "inconnu", created_at: "2026-09-25T09:36:09Z", job_id: null, photo_url: "p-new" },
];
const cands = candidatesDepuisRetrait({ jobId: "f554a951", ancienId: "3271176513", deletedAt: pfFioles.deleted_at, lignes });
ok("une seule candidate : 3276284130", cands.length === 1 && cands[0].listing_id === "3276284130", JSON.stringify(cands.map((c) => c.listing_id)));
ok("une annonce rattachée à un AUTRE job n'est pas candidate",
  candidatesDepuisRetrait({ jobId: "x", ancienId: "1", deletedAt: "2026-09-25T00:00:00Z", lignes: [{ listing_id: "5", created_at: "2026-09-25T01:00:00Z", job_id: "y" }] }).length === 0);
ok("identifiant plus ancien que l'annonce retirée → pas candidate",
  candidatesDepuisRetrait({ jobId: "x", ancienId: "3271176513", deletedAt: "2026-09-25T00:00:00Z", lignes: [{ listing_id: "3200000000", created_at: "2026-09-25T01:00:00Z" }] }).length === 0);

console.log("\n3. LE VERDICT");
// Empreintes relevées : ancienne 1011…0110110 / nouvelle 1011…1001001…0110 → 1 bit d'écart.
const titres = ["🎅 calendrier de l'avant chaussettes à paillettes personnalisé"];
ok("titres comparables malgré emoji et accents",
  titreComparable(titres[0]) === titreComparable("Calendrier de l'avant chaussettes à paillettes personnalisé"));
ok("aucune candidate → on peut redéposer", jugerCandidates({ candidates: [], titres, prix: 44.99, photoIdentique: () => true }).verdict === "aucune");
const v1 = jugerCandidates({ candidates: cands, titres, prix: 44.99, photoIdentique: () => true });
ok("f554a951 : statut « inconnu » (pas en ligne) → incertaine, lien donné",
  v1.verdict === "incertaine" && v1.liens[0].includes("3276284130"), JSON.stringify(v1));
const enLigne = [{ ...cands[0], statut_plateforme: "en_ligne" }];
ok("titre, prix et photo identiques ne prouvent jamais le même exemplaire",
  jugerCandidates({ candidates: enLigne, titres, prix: 44.99, photoIdentique: () => true }).verdict === "incertaine");
ok("identifiant du dépôt exact → certaine", jugerCandidates({ candidates: enLigne, listingIdProuve: "3276284130" }).verdict === "certaine");
ok("identifiant d’un autre dépôt → incertaine", jugerCandidates({ candidates: enLigne, listingIdProuve: "327628413" }).verdict === "incertaine");
ok("photo différente → incertaine",
  jugerCandidates({ candidates: enLigne, titres, prix: 44.99, photoIdentique: () => false }).verdict === "incertaine");
ok("empreinte absente → question, sans attendre un calcul inutile",
  jugerCandidates({ candidates: enLigne, titres, prix: 44.99, photoIdentique: () => null }).verdict === "incertaine");
ok("prix trop différent → incertaine",
  jugerCandidates({ candidates: enLigne, titres, prix: 39, photoIdentique: () => true }).verdict === "incertaine");
ok("titre différent → incertaine",
  jugerCandidates({ candidates: [{ ...enLigne[0], titre: "Boule de Noël" }], titres, prix: 44.99, photoIdentique: () => true }).verdict === "incertaine");
ok("deux candidates → incertaine, deux liens",
  (() => { const v = jugerCandidates({ candidates: [enLigne[0], { ...enLigne[0], listing_id: "3276289397", url: "u2" }], titres, prix: 44.99, photoIdentique: () => true }); return v.verdict === "incertaine" && v.liens.length === 2; })());


console.log("\n5. LES PHOTOS DE NOTRE COPIE TRANCHENT (15/10 soir, camille.ferren 5b6c8cc9)");
// Empreintes RELEVÉES en base le 15/10 (photo_empreintes) : copie du job =
// rehosted/…_watch_0/1.jpg ; annonce 3288747290 apparue à 12:34 (photos
// acbf41…, 665e04…) ; annonce d'origine 3122354807 (photo 173941…).
const { readFileSync } = await import("node:fs");
const EMP = JSON.parse(readFileSync(new URL("./fixtures/empreintes-camille-calendrier-1510.json", import.meta.url), "utf8"));
const e = (u) => ({ url: u, ...EMP[u] });
const COPIE = [
  "https://tojihnuawsoohlolangc.supabase.co/storage/v1/object/public/listing-photos/6a7595b1-d223-4e33-8951-e32e4ff4ac59/rehosted/1791995031180005/1791995941335_watch_0.jpg",
  "https://tojihnuawsoohlolangc.supabase.co/storage/v1/object/public/listing-photos/6a7595b1-d223-4e33-8951-e32e4ff4ac59/rehosted/1791995031180005/1791995941335_watch_1.jpg",
].map(e);
const NOUVELLE = [
  "https://img.leboncoin.fr/api/v1/lbcpb1/images/ac/bf/41/acbf41f3982f231fb744302fef259b9fe865fb39.jpg?rule=ad-large",
  "https://img.leboncoin.fr/api/v1/lbcpb1/images/66/5e/04/665e049acba7bd1e5b3c3d7a8c29b3cc5f8d3ec6.jpg?rule=ad-large",
].map(e);
const ORIGINE = ["https://img.leboncoin.fr/api/v1/lbcpb1/images/17/39/41/17394166cacd6290604c16095ddf927f3df9debe.jpg?rule=ad-large"].map(e);
const candCamille = [{ listing_id: "3288747290", url: "https://www.leboncoin.fr/ad/loisirs_creatifs/3288747290", statut_plateforme: "en_ligne", created_at: "2026-10-15T10:35:45Z" }];
const vC = jugerCandidates({ candidates: candCamille, empreintesCopie: COPIE, empreintesParCandidate: new Map([["3288747290", NOUVELLE]]) });
ok("camille : photos identiques à NOTRE copie → certaine (rattachée, aucun redépôt)", vC.verdict === "certaine" && vC.retenue?.listing_id === "3288747290" && /photos/.test(vC.preuve ?? ""), JSON.stringify(vC));
const vO = jugerCandidates({ candidates: [{ ...candCamille[0], listing_id: "999" }], empreintesCopie: COPIE, empreintesParCandidate: new Map([["999", ORIGINE]]) });
ok("une annonce aux photos de la personne (pas les nôtres) → incertaine (question)", vO.verdict === "incertaine", JSON.stringify(vO));
const vSans = jugerCandidates({ candidates: candCamille, empreintesCopie: COPIE, empreintesParCandidate: new Map([["3288747290", []]]) });
ok("empreintes de la candidate absentes → incertaine (on attendra les empreintes)", vSans.verdict === "incertaine");
const vDeux = jugerCandidates({ candidates: [candCamille[0], { ...candCamille[0], listing_id: "3288747291" }], empreintesCopie: COPIE,
  empreintesParCandidate: new Map([["3288747290", NOUVELLE], ["3288747291", NOUVELLE]]) });
ok("deux candidates aux mêmes photos → incertaine (deux exemplaires possibles)", vDeux.verdict === "incertaine");
const vDeuxDont1 = jugerCandidates({ candidates: [candCamille[0], { ...candCamille[0], listing_id: "3288747291" }], empreintesCopie: COPIE,
  empreintesParCandidate: new Map([["3288747290", NOUVELLE], ["3288747291", ORIGINE]]) });
ok("deux candidates, une seule aux photos de la copie, l'autre sans photo approchante → certaine sur la bonne", vDeuxDont1.verdict === "certaine" && vDeuxDont1.retenue.listing_id === "3288747290", JSON.stringify(vDeuxDont1.photos));
ok("annonce disparue entre-temps (statut autre) → jamais rattachée", jugerCandidates({ candidates: [{ ...candCamille[0], statut_plateforme: "desactivee" }], empreintesCopie: COPIE, empreintesParCandidate: new Map([["3288747290", NOUVELLE]]) }).verdict === "incertaine");


console.log("\n6. UNE ANNONCE D'UNE AUTRE FICHE N'EST PAS CETTE COPIE (29/10, tiblancdeshaut c9fe1ee1 ; Leboncoin 1660ea94)");
// Relevé en base le 29/10. Beebs, « Sweat GAP » c9fe1ee1 (fiche 1792587088278), annonce 34209525 retirée le
// 27/10 à 14:02:31 (Paris). Relevé 51de8deb du 28/10 08:15 (aucun depuis le 26/10 12:21) : 34245064 et 34246760
// vues pour la première fois à 08:15:57 → question du 28/10 08:17 (« 2 annonces apparues depuis le retrait »).
// 34245064 = « Sac à main Michael Kors » (job 9a096169, fiche 1792586354104, dépôt du 27/10 03:41) ;
// 34246760 = « Pantalon de ski Quicksilver » (job c002a882, fiche 1792586859815, dépôt du 27/10 13:03).
const retraitGap = "2026-10-27T13:02:31.506Z";
const lignesGap = [
  { listing_id: "34245064", url: "https://www.beebs.app/fr/p/34245064-sac-main-michael-kors-orange-en-cuir-synth-tique", titre: "Sac à main Michael Kors orange en cuir synthétique",
    statut_plateforme: "en_ligne", created_at: "2026-10-28T07:15:57.126Z", job_id: null, inventaire_id: null, proposition: null, disparu_le: null },
  { listing_id: "34246760", url: "https://www.beebs.app/fr/p/34246760-pantalon-de-ski-quicksilver-vintage-noir-avec-bretelles", titre: "Pantalon de ski Quicksilver Vintage noir avec bretelles",
    statut_plateforme: "en_ligne", created_at: "2026-10-28T07:15:57.126Z", job_id: null, inventaire_id: null, proposition: null, disparu_le: null },
];
// Les jobs du compte, lus comme get-pending-jobs les lit (COLONNES_JOBS_AUTRES_FICHES) — numéros tels que posés
// le 29/10 à 18:27 (séquence) ; c9fe1ee1 porte encore son ancienne annonce.
const jobsGap = [
  { id: "c9fe1ee1-391d-458c-bb47-e7cc2f2b3a4f", inventaire_id: 1792587088278, platform_listing_id: "34209525", new_platform_listing_id: null, preuve_beebs_id: null, adsubmit_id: null, lien_par_titre: null },
  { id: "9a096169-3c9f-4245-a417-5ddbe6b01a2a", inventaire_id: 1792586354104, platform_listing_id: "34245064", new_platform_listing_id: null, preuve_beebs_id: null, adsubmit_id: null, lien_par_titre: null },
  { id: "c002a882-bc66-4c70-a54b-c56c626bcb89", inventaire_id: 1792586859815, platform_listing_id: "34246760", new_platform_listing_id: null, preuve_beebs_id: null, adsubmit_id: null, lien_par_titre: null },
  { id: "00000000-0000-0000-0000-0000000005a5", inventaire_id: null, platform_listing_id: "34299999", new_platform_listing_id: null, preuve_beebs_id: null, adsubmit_id: null, lien_par_titre: null },
];
const argGap = { jobId: "c9fe1ee1-391d-458c-bb47-e7cc2f2b3a4f", ancienId: "34209525", deletedAt: retraitGap, lignes: lignesGap, inventaireId: 1792587088278 };
ok("les colonnes lues : les quatre sources du numéro, plus le lien retrouvé par le titre",
  ["platform_listing_id", "platform_fields->>new_platform_listing_id", "preuve_identifiant_beebs->>id", "lbc_depot->adsubmit->>id", "listing_url_recovery"].every((c) => COLONNES_JOBS_AUTRES_FICHES.includes(c)));
const autresGap = numerosAutresFiches(jobsGap, 1792587088278);
ok("numéros des autres fiches : 34245064 et 34246760, jamais l'annonce de la fiche jugée, jamais un job sans fiche",
  autresGap.has("34245064") && autresGap.has("34246760") && !autresGap.has("34209525") && !autresGap.has("34299999") && autresGap.size === 2, JSON.stringify([...autresGap]));
ok("rétrocompatible : sans les jobs du compte, les deux annonces restent candidates (la question du 28/10)",
  candidatesDepuisRetrait(argGap).length === 2);
const triGap = trierCandidatesDepuisRetrait({ ...argGap, numerosAutres: depotsAutresFiches(jobsGap, 1792587088278), fichesJobs: fichesDesJobs(jobsGap) });
ok("c9fe1ee1 : les deux annonces des autres fiches sont écartées → aucune candidate", triGap.candidates.length === 0, JSON.stringify(triGap));
ok("→ verdict « aucune » (plus de question sur le sac ni le pantalon)", jugerCandidates({ candidates: triGap.candidates }).verdict === "aucune");
ok("les écartées sont tracées avec leur motif (job, fiche, source du numéro)",
  triGap.ecartees.length === 2 && triGap.ecartees.some((e) => e.listing_id === "34245064" && /9a096169/.test(e.motif) && /1792586354104/.test(e.motif) && /platform_listing_id/.test(e.motif)),
  JSON.stringify(triGap.ecartees));
ok("un Set seul (numerosAutresFiches) écarte aussi", candidatesDepuisRetrait({ ...argGap, numerosAutres: autresGap }).length === 0);
// LIMITE (relue en base) : le 28/10 à 08:17, 9a096169 et c002a882 étaient des dépôts « ordre non prouvé », sans
// AUCUN numéro (numéros posés le 29/10 à 18:27). Avec les jobs tels qu'ils étaient, rien ne les écartait.
const jobsGapLe28 = jobsGap.map((j) => (j.inventaire_id === 1792587088278 ? j : { ...j, platform_listing_id: null }));
ok("jobs sans numéro (état du 28/10 08:17), aucune liste lue : les numéros seuls ne les écartent pas (section 7 : l'antériorité)",
  candidatesDepuisRetrait({ ...argGap, numerosAutres: depotsAutresFiches(jobsGapLe28, 1792587088278), fichesJobs: fichesDesJobs(jobsGapLe28) }).length === 2);

// La MÊME fiche reste candidate (risque de doublon) : le doute reste la question, jamais un redépôt.
const jobMemeFiche = { id: "11111111-0000-0000-0000-000000000001", inventaire_id: 1792587088278, platform_listing_id: "34250000" };
const ligneMeme = { listing_id: "34250000", statut_plateforme: "en_ligne", created_at: "2026-10-28T07:15:57Z", job_id: null, inventaire_id: null };
ok("même fiche : numéro donné par un autre job de LA MÊME fiche → reste candidate",
  candidatesDepuisRetrait({ ...argGap, lignes: [ligneMeme], numerosAutres: depotsAutresFiches([...jobsGap, jobMemeFiche], 1792587088278), fichesJobs: fichesDesJobs([...jobsGap, jobMemeFiche]) }).length === 1);
ok("même fiche : un numéro porté à la fois par la fiche jugée et par une autre → jamais écarté (doute)",
  !numerosAutresFiches([...jobsGap, { ...jobMemeFiche, platform_listing_id: "34245064" }], 1792587088278).has("34245064"));
ok("même fiche : ligne rattachée à la fiche jugée, numéro réclamé par une autre fiche → reste candidate",
  candidatesDepuisRetrait({ ...argGap, lignes: [{ ...lignesGap[0], inventaire_id: 1792587088278 }], numerosAutres: autresGap, fichesJobs: fichesDesJobs(jobsGap) }).length === 1);
ok("même fiche : ligne rattachée à un autre job DE LA MÊME fiche (fiche lue sur le job) → reste candidate",
  candidatesDepuisRetrait({ ...argGap, lignes: [{ ...ligneMeme, job_id: jobMemeFiche.id }], numerosAutres: autresGap, fichesJobs: fichesDesJobs([...jobsGap, jobMemeFiche]) }).length === 1);
ok("rétrocompatible : sans fichesJobs, cette même ligne reste écartée comme avant le 29/10",
  candidatesDepuisRetrait({ ...argGap, lignes: [{ ...ligneMeme, job_id: jobMemeFiche.id }] }).length === 0);
ok("proposition du relevé vers un job d'une autre fiche → écartée",
  candidatesDepuisRetrait({ ...argGap, lignes: [{ ...ligneMeme, proposition: { job_id: "9a096169-3c9f-4245-a417-5ddbe6b01a2a", motif: "rang" } }], numerosAutres: new Set(), fichesJobs: fichesDesJobs(jobsGap) }).length === 0);
ok("proposition du relevé vers un job de la MÊME fiche → reste candidate",
  candidatesDepuisRetrait({ ...argGap, lignes: [{ ...ligneMeme, proposition: { job_id: jobMemeFiche.id } }], numerosAutres: new Set(), fichesJobs: fichesDesJobs([...jobsGap, jobMemeFiche]) }).length === 1);
ok("ligne rattachée à une autre fiche (inventaire_id, sans job) → écartée quand les jobs ont été lus",
  candidatesDepuisRetrait({ ...argGap, lignes: [{ ...ligneMeme, inventaire_id: 1792586354104 }], numerosAutres: new Set(), fichesJobs: new Map() }).length === 0);
ok("rétrocompatible : sans les jobs lus, cette ligne reste candidate comme avant le 29/10",
  candidatesDepuisRetrait({ ...argGap, lignes: [{ ...ligneMeme, inventaire_id: 1792586354104 }] }).length === 1);
ok("fiche du job jugé inconnue → rien n'est écarté par numéro",
  candidatesDepuisRetrait({ ...argGap, inventaireId: null, numerosAutres: depotsAutresFiches(jobsGap, null), fichesJobs: fichesDesJobs(jobsGap) }).length === 2
  && numerosAutresFiches(jobsGap, null).size === 0);
ok("un lien retrouvé par le TITRE (listing_url_recovery) ne donne pas de numéro",
  !numerosAutresFiches([{ ...jobsGap[1], lien_par_titre: { at: "2026-10-27T03:00:00Z" } }], 1792587088278).has("34245064"));
ok("les autres sources comptent : identifiant Beebs prouvé, adsubmit Leboncoin, nouvel identifiant",
  ["34245064", "3284198810", "34246760"].every((n) => numerosAutresFiches([
    { id: "a", inventaire_id: 1, platform_fields: { preuve_identifiant_beebs: { id: "34245064" } } },
    { id: "b", inventaire_id: 2, platform_fields: { lbc_depot: { adsubmit: { id: 3284198810 } } } },
    { id: "c", inventaire_id: 3, new_platform_listing_id: "34246760" },
  ], 9).has(n)));
ok("motifAutreFiche : notre propre job → jamais un motif",
  motifAutreFiche({ listing_id: "34245064", job_id: argGap.jobId }, { jobId: argGap.jobId, inventaireId: 1792587088278, numerosAutres: autresGap }) === null);

// Leboncoin, « Service à thé » 1660ea94 (fiche 1790847723391), annonce 3279968973 retirée le 07/10 à 21:01:08.
// Relevé 33357123 du 08/10 06:55:50 : trois annonces vues pour la première fois → question du 08/10 07:04:40 avec
// 3284289939 (« Service à thé », arts de la table), 3284198810 (« Sculpture en bronze », fiche 1790835242041) et
// 3284198745 (« Lampe Concord », fiche 1790663577320). Leurs jobs 0ed2a9b5 / 1bd4a153 sont nés du MÊME relevé à
// 07:05:04, 24 s après la question (limite connue) : le cas est rejugé ici tel qu'il se relit ensuite.
const lignesThe = [
  { listing_id: "3284289939", url: "https://www.leboncoin.fr/ad/arts_de_la_table/3284289939", titre: "Service à thé vintage céramique jaune vert théière", statut_plateforme: "en_ligne", created_at: "2026-10-08T04:55:50.917Z", job_id: null, inventaire_id: null, publiee_le: null },
  { listing_id: "3284198810", url: "https://www.leboncoin.fr/ad/antiquites/3284198810", titre: "Sculpture en bronze asiatique – Divinité musicienne", statut_plateforme: "en_ligne", created_at: "2026-10-08T04:55:50.917Z", job_id: null, inventaire_id: null, publiee_le: "2026-10-07T18:55:27Z" },
  { listing_id: "3284198745", url: "https://www.leboncoin.fr/ad/ameublement/3284198745", titre: "Lampe Concord Simone Vintage 1970 Cristal Marbre", statut_plateforme: "en_ligne", created_at: "2026-10-08T04:55:50.917Z", job_id: null, inventaire_id: null, publiee_le: "2026-10-07T18:55:17Z" },
];
const jobsThe = [
  { id: "0ed2a9b5-39e4-4e87-89e1-293bc5648f65", inventaire_id: 1790835242041, platform_listing_id: "3284198810", new_platform_listing_id: null, preuve_beebs_id: null, adsubmit_id: null, lien_par_titre: null },
  { id: "1bd4a153-ca10-4154-9d64-a9c87d96db32", inventaire_id: 1790663577320, platform_listing_id: "3284198745", new_platform_listing_id: null, preuve_beebs_id: null, adsubmit_id: null, lien_par_titre: null },
];
const argThe = { jobId: "1660ea94-fbf4-4b29-96a2-ea92bf792f8b", ancienId: "3279968973", deletedAt: "2026-10-07T19:01:08.995Z", lignes: lignesThe, inventaireId: 1790847723391 };
ok("1660ea94 rétrocompatible : sans les jobs, trois candidates (la question du 08/10)", candidatesDepuisRetrait(argThe).length === 3);
const triThe = trierCandidatesDepuisRetrait({ ...argThe, numerosAutres: depotsAutresFiches(jobsThe, 1790847723391), fichesJobs: fichesDesJobs(jobsThe) });
ok("1660ea94 : sculpture et lampe (autres fiches) écartées, seul le service à thé reste candidat",
  triThe.candidates.length === 1 && triThe.candidates[0].listing_id === "3284289939" && triThe.ecartees.map((e) => e.listing_id).sort().join() === "3284198745,3284198810",
  JSON.stringify(triThe));
const vThe = jugerCandidates({ candidates: triThe.candidates });
ok("→ la question reste, sur la seule annonce qui peut être ce service à thé (un seul lien)",
  vThe.verdict === "incertaine" && vThe.liens.length === 1 && vThe.liens[0].includes("3284289939"), JSON.stringify(vThe));


console.log("\n7. UNE ANNONCE VUE AVANT LE RETRAIT N'EST PAS LE REDÉPÔT (29/10, Nico : « un candidat doit correspondre réellement à l'article »)");
// Les deux cas du jour, tels qu'ils étaient : AUCUN numéro sur les jobs (relu en base le 29/10).
// Beebs : les listes « Mes annonces » de nos dépôts (preuve_identifiant_beebs, relevées en base) — 9a096169 avant
// 03:23:24 / après 03:41:46, c002a882 avant 12:47:21 / après 13:04:16 (Paris, 27/10) ; retrait de c9fe1ee1 à 14:02:31.
const MES_ANNONCES_0227 = ["34220603", "34210783", "34222058", "34209392", "34241092", "34240769", "34240540", "34240243", "34239711",
  "34239227", "34210654", "34211184", "34211489", "34211207", "34209247", "34216502", "34216633", "34215733", "34216701", "34210740",
  "34216731", "34222090", "34216617", "34216550", "34216511", "34216423", "34216401", "34211523", "34211477", "34211461", "34211158",
  "34211128", "34210802", "34210727", "34210692", "34210662", "34210619", "34209525", "34209507"];
const sans34209507 = MES_ANNONCES_0227.filter((n) => n !== "34209507");
const jobsGapListes = [
  { id: "c9fe1ee1-391d-458c-bb47-e7cc2f2b3a4f", inventaire_id: 1792587088278, platform_listing_id: "34209525",
    lecture_avant_ids: null, lecture_avant_le: null, lecture_apres_ids: null, lecture_apres_le: null },
  { id: "9a096169-3c9f-4245-a417-5ddbe6b01a2a", inventaire_id: 1792586354104, platform_listing_id: null,
    lecture_avant_ids: MES_ANNONCES_0227, lecture_avant_le: "2026-10-27T02:23:24.979Z",
    lecture_apres_ids: ["34245064", ...MES_ANNONCES_0227], lecture_apres_le: "2026-10-27T02:41:46.296Z" },
  { id: "c002a882-bc66-4c70-a54b-c56c626bcb89", inventaire_id: 1792586859815, platform_listing_id: null,
    lecture_avant_ids: ["34245064", ...sans34209507], lecture_avant_le: "2026-10-27T11:47:21.218Z",
    lecture_apres_ids: ["34246760", "34245064", ...sans34209507], lecture_apres_le: "2026-10-27T12:04:16.169Z" },
];
ok("les colonnes lues portent les listes « avant » / « après » et leur heure de lecture",
  ["preuve_identifiant_beebs->avant->ids", "preuve_identifiant_beebs->avant->>lu_le", "preuve_identifiant_beebs->apres->ids", "preuve_identifiant_beebs->apres->>lu_le"]
    .every((c) => COLONNES_JOBS_AUTRES_FICHES.includes(c)));
ok("marges : 15 min sur l'heure du poste (lu_le), 5 min sur la mise en ligne Leboncoin", MARGE_LECTURE_POSTE_MS === 15 * 60_000 && MARGE_PUBLIEE_LBC_MS === 5 * 60_000);
const vusGap = numerosVusAvantRetrait(jobsGapListes, retraitGap);
ok("34245064 lu le 27/10 à 03:41:46 (et dans la liste « avant » de c002a882 à 12:47:21), 34246760 lu à 13:04:16 — avant le retrait",
  vusGap.get("34245064")?.lu_le === "2026-10-27T02:41:46.296Z" && vusGap.get("34246760")?.lu_le === "2026-10-27T12:04:16.169Z"
  && vusGap.get("34246760")?.job_id.startsWith("c002a882"), JSON.stringify([...vusGap].filter(([n]) => n >= "34245000")));
const triGapAvant = trierCandidatesDepuisRetrait({ ...argGap, numerosAutres: depotsAutresFiches(jobsGapListes, 1792587088278),
  fichesJobs: fichesDesJobs(jobsGapListes), platform: "beebs", vusAvant: vusGap });
ok("c9fe1ee1 tel qu'au 28/10 (jobs sans numéro) : sac et pantalon vus avant le retrait → 0 candidate", triGapAvant.candidates.length === 0, JSON.stringify(triGapAvant));
ok("→ verdict « aucune » le jour même", jugerCandidates({ candidates: triGapAvant.candidates }).verdict === "aucune");
ok("motif « vue_avant_retrait », avec la preuve (dépôt et heure de la lecture)",
  triGapAvant.ecartees.length === 2 && triGapAvant.ecartees.every((e) => e.motif === "vue_avant_retrait" && /Mes annonces/.test(e.preuve ?? "")),
  JSON.stringify(triGapAvant.ecartees));
const lueTropTard = [{ ...jobsGapListes[2], lecture_avant_ids: null, lecture_apres_le: "2026-10-27T12:48:00.000Z" }];
ok("liste lue moins de 15 min avant le retrait (heure du poste) → ne prouve rien, l'annonce reste candidate",
  !numerosVusAvantRetrait(lueTropTard, retraitGap).has("34246760")
  && candidatesDepuisRetrait({ ...argGap, platform: "beebs", vusAvant: numerosVusAvantRetrait(lueTropTard, retraitGap) }).length === 2);
ok("liste lue APRÈS le retrait (notre redépôt peut y être) → jamais une preuve",
  numerosVusAvantRetrait([{ id: "x", lecture_apres_ids: ["34250000"], lecture_apres_le: "2026-10-27T14:30:00Z" }], retraitGap).size === 0);
ok("même fiche : une annonce de LA fiche jugée vue avant le retrait n'est pas le redépôt non plus",
  candidatesDepuisRetrait({ ...argGap, lignes: [{ ...ligneMeme, inventaire_id: 1792587088278 }], platform: "beebs",
    vusAvant: numerosVusAvantRetrait([{ id: "y", lecture_apres_ids: ["34250000"], lecture_apres_le: "2026-10-27T10:00:00Z" }], retraitGap) }).length === 0);
ok("platform_fields complet (preuve_identifiant_beebs) lu comme les alias", numerosVusAvantRetrait([{ id: "z", platform_fields: {
  preuve_identifiant_beebs: { apres: { ids: ["34246760"], lu_le: "2026-10-27T12:04:16.169Z" } } } }], retraitGap).has("34246760"));
ok("rétrocompatible : sans vusAvant, rien n'est écarté pour l'antériorité", candidatesDepuisRetrait({ ...argGap, platform: "beebs" }).length === 2);

// Leboncoin 1660ea94 : publiee_le (date de mise en ligne donnée par Leboncoin) des deux annonces, 07/10 à 20:55:27 et
// 20:55:17, retrait à 21:01:08 (deleted_at = heure du serveur). Aucun job pour elles à 07:04:40 le 08/10.
const triTheAvant = trierCandidatesDepuisRetrait({ ...argThe, numerosAutres: new Map(), fichesJobs: new Map(), platform: "leboncoin", vusAvant: new Map() });
ok("1660ea94 tel qu'au 08/10 (aucun job) : sculpture et lampe mises en ligne avant le retrait → écartées",
  triTheAvant.candidates.map((c) => c.listing_id).join() === "3284289939"
  && triTheAvant.ecartees.map((e) => `${e.listing_id}:${e.motif}`).sort().join() === "3284198745:vue_avant_retrait,3284198810:vue_avant_retrait",
  JSON.stringify(triTheAvant));
ok("→ la question ne porte plus que sur le service à thé", jugerCandidates({ candidates: triTheAvant.candidates }).liens?.length === 1);
const notreRedepot = { ...lignesThe[0], listing_id: "3284300000", publiee_le: "2026-10-07T19:04:33Z" }; // + 3,4 min : le plus court mesuré
ok("un vrai redépôt (mis en ligne 3,4 min après le retrait, le plus court mesuré sur 579) reste candidat",
  preuveVueAvantRetrait("leboncoin", notreRedepot, { deletedAt: argThe.deletedAt, vusAvant: new Map() }) === null);
ok("mise en ligne moins de 5 min avant le retrait → ne prouve rien",
  preuveVueAvantRetrait("leboncoin", { listing_id: "1", publiee_le: "2026-10-07T18:57:00Z" }, { deletedAt: argThe.deletedAt, vusAvant: new Map() }) === null);
ok("publiee_le ne vaut que pour Leboncoin", preuveVueAvantRetrait("beebs", lignesThe[1], { deletedAt: argThe.deletedAt, vusAvant: new Map() }) === null);
ok("rétrocompatible : sans vusAvant, les trois restent candidates", candidatesDepuisRetrait({ ...argThe, platform: "leboncoin" }).length === 3);


if (ko) { console.log(`\n✗ ${ko} échec(s)`); process.exit(1); }
console.log("\n✓ tous les cas passent");
