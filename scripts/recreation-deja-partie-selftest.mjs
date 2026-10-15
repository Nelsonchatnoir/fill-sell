// Autotest de supabase/functions/_shared/recreation-deja-partie.js — un redépôt
// interrompu ne repart jamais en double (Les Petites Fioles, f554a951, 25/09).
//   node scripts/recreation-deja-partie-selftest.mjs
// Les cas sont RELEVÉS en base (work_window_state, annonces_plateforme,
// photo_empreintes du 25/09), pas imaginés.
import {
  candidatesDepuisRetrait, depotPeutEtrePartiDepuis, jugerCandidates, titreComparable,
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


if (ko) { console.log(`\n✗ ${ko} échec(s)`); process.exit(1); }
console.log("\n✓ tous les cas passent");
