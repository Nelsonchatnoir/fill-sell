// VERROU — 15/11/2026, cliente 13e274de (Pro, essai Cloud) — Nico : « un job qui ne peut pas partir ne bloque jamais les
// autres ; si une attente est voulue, l'utilisateur doit la VOIR sur le job concerné, jamais de job en attente muette ».
// Cas réel : le dépôt Leboncoin « Lot 4 bracelets joncs acier inoxydable doré large » attend « Valider et payer » depuis le
// 14/11 21:47 (compte pro hors forfait). La « Jupe courte velours côtelé Cache Cache bleu canard » (publication créée à
// 21:41) restait en file SANS RIEN DIRE — ni erreur, ni échéance, ni marqueur : get-pending-jobs la gardait « silencieuse »
// toutes les 2 min (« aucune publication servie (un dépôt attend « Valider et payer »), 1 en file »), l'app la disait « En
// file : elle part à son tour ». La retenue est voulue (un dépôt payant à la fois, décision du 18/10) ; le silence non.
// Ce verrou casse si une publication gardée derrière un dépôt à payer redevient muette (aucun marqueur, aucun message),
// si l'app la dit « en file », si le marqueur est réécrit à l'identique à chaque passage, ou s'il survit à la reprise.
import fs from "node:fs";
import {
  partagerCandidatsAPayer, attentePaiementVivante, depotQuiRetient, ecritureAttenteDepotPayant, leveeAttenteDepotPayant,
  attenteDepotPayantDe, messageAttenteDepotPayant, CLE_ATTENTE_DEPOT_PAYANT,
} from "../supabase/functions/_shared/lbc-forfait.js";
import { situationJob, depotPayantEnPause } from "../src/utils/fileDesJobs.js";
import { sansEstimation, ETATS } from "../supabase/functions/_shared/etat-job.js";

let ko = 0, n = 0;
const ok = (c, m, d) => { n++; if (c) console.log("  ✓", m); else { ko++; console.log("  ✗", m, d === undefined ? "" : JSON.stringify(d).slice(0, 400)); } };

// Les deux tâches de 13e274de, telles qu'en base le 15/11 à 00:15 (heure de Paris).
const BRACELETS = {
  id: "c7c98610-c837-4db7-ab0a-964bda23fa31", platform: "leboncoin", action: "publish", status: "needs_user",
  created_at: "2026-11-14T20:34:42.199Z", title: "Lot 4 bracelets joncs acier inoxydable doré large \nLot de 4",
  platform_fields: {
    last_diagnostic: { at: "2026-11-14T20:47:00.773Z", quoi: "lbc_valider_et_payer" },
    attente_paiement: { depuis: "2026-11-14T20:47:00.773Z" },
  },
};
const JUPE = {
  id: "99c09d0f-e372-4c6b-8921-770324e71c85", platform: "leboncoin", action: "publish", status: "pending",
  created_at: "2026-11-14T20:41:49.108Z", title: "Jupe courte velours côtelé Cache Cache bleu canard", error: null,
  platform_fields: { lbcCategoryPath: ["Mode", "Vêtements"], lot_publication: { id: "x" } },
};
const T0 = Date.parse("2026-11-14T23:15:04Z");   // un passage réel de get-pending-jobs (journal du 15/11 00:15)

console.log("1. Le passage de get-pending-jobs : la jupe reste en file (retenue voulue)…");
ok(attentePaiementVivante(BRACELETS, T0), "le dépôt des bracelets attend « Valider et payer » (attente vivante)");
const { servis, silencieux } = partagerCandidatsAPayer([JUPE], false, Date.parse(BRACELETS.platform_fields.last_diagnostic.at));
ok(!servis.length && silencieux.length === 1 && silencieux[0].id === JUPE.id, "la jupe n'est pas servie (un dépôt payant à la fois) — inchangé");

console.log("2. …mais elle porte désormais la raison, écrite une fois");
const qui = depotQuiRetient([BRACELETS], T0);
ok(qui?.depot?.id === BRACELETS.id && qui.etat === "a_payer", "le dépôt qui la retient : les bracelets, état « a_payer »", qui);
const w = ecritureAttenteDepotPayant(JUPE, { id: BRACELETS.id, title: BRACELETS.title }, qui.etat, new Date(T0).toISOString());
ok(w && w.platform_fields[CLE_ATTENTE_DEPOT_PAYANT]?.job === BRACELETS.id, "marqueur attente_depot_payant posé sur la jupe", w?.platform_fields);
ok(/« Lot 4 bracelets joncs acier inoxydable doré large »/.test(w?.error ?? "") && /Valider et payer/.test(w?.error ?? "") && /À régler/.test(w?.error ?? ""),
  "le message nomme le dépôt qui attend et le geste (« Valider et payer », dans « À régler »)", w?.error);
ok(!/ordinateur|Chrome|onglet|extension/i.test(w?.error ?? ""), "aucun « ordinateur / Chrome / onglet / extension » (vrai pour le PC comme pour le Cloud)");
ok(w?.platform_fields.lbcCategoryPath?.[0] === "Mode" && w?.platform_fields.lot_publication?.id === "x", "les autres champs de la tâche sont gardés");
const jupeEcrite = { ...JUPE, error: w.error, platform_fields: w.platform_fields };
ok(ecritureAttenteDepotPayant(jupeEcrite, { id: BRACELETS.id, title: BRACELETS.title }, "a_payer", new Date(T0 + 120_000).toISOString()) === null,
  "passage suivant (2 min après) : rien à réécrire — aucune ligne inchangée réécrite");

console.log("3. L'attente close sans paiement (24 h passées) : le message change une fois");
const T24 = Date.parse("2026-11-15T20:48:00Z");
const qui24 = depotQuiRetient([BRACELETS], T24);
ok(qui24?.etat === "non_valide", "24 h après : « non_valide » (le dépôt n'a pas été validé)", qui24);
const w24 = ecritureAttenteDepotPayant(jupeEcrite, { id: BRACELETS.id, title: BRACELETS.title }, "non_valide", new Date(T24).toISOString());
ok(w24 && /n'a pas été validé/.test(w24.error) && w24.platform_fields[CLE_ATTENTE_DEPOT_PAYANT].depuis === w.platform_fields[CLE_ATTENTE_DEPOT_PAYANT].depuis,
  "nouvel état écrit, « depuis » gardé", w24);
ok(depotQuiRetient([], T0) === null, "aucun dépôt qui retient : aucun marqueur (la file suit son tour)");

console.log("4. Ce que l'app affiche");
const avant = situationJob(JUPE, { lang: "fr", maintenant: T0 });
ok(avant.motif === "tour" && avant.groupe === "en_file", "AVANT (14/11) : sans marqueur, la jupe se disait « En file : elle part à son tour » — muette", avant);
const s = situationJob(jupeEcrite, { lang: "fr", maintenant: T0, cloud: true });
ok(s.groupe === "en_pause" && s.motif === "depot_payant_lbc", "APRÈS : « En pause », motif depot_payant_lbc (jamais « en file » ni « nouvel essai automatique »)", s);
ok(/« Lot 4 bracelets joncs acier inoxydable doré large »/.test(s.raison) && /Valider et payer/.test(s.raison), "la raison nomme le dépôt et le geste", s.raison);
ok(sansEstimation(s.raison) === s.raison, "aucune estimation de temps (règle du 15/10 : la phrase n'est pas retirée)", s.raison);
ok(!/ordinateur|Chrome|onglet/i.test(s.raison), "aucun mot du PC pour un compte Cloud");
const sEn = situationJob(jupeEcrite, { lang: "en", maintenant: T0 });
ok(sEn.motif === "depot_payant_lbc" && /Valider et payer/.test(sEn.raison), "en anglais aussi", sEn.raison);
const s24 = situationJob({ ...JUPE, error: w24.error, platform_fields: w24.platform_fields }, { lang: "fr", maintenant: T24 });
ok(/n'a pas été validé/.test(s24.raison) && /À régler/.test(s24.raison), "attente close : « n'a pas été validé — valide-le ou annule-le dans « À régler » »", s24.raison);
ok(depotPayantEnPause({ ...jupeEcrite, status: "processing" }, { etat: ETATS.EN_COURS, motif: "ordinateur" }).motif === "ordinateur", "une tâche en cours n'est jamais dite en pause");
ok(depotPayantEnPause(jupeEcrite, { etat: ETATS.EN_PAUSE, motif: "file_en_pause" }).motif === "file_en_pause", "une pause de la file demandée par la personne garde sa phrase");

console.log("5. La levée : la publication repart, l'attente disparaît");
const l = leveeAttenteDepotPayant(jupeEcrite, new Date(T0 + 3_600_000).toISOString(), "get-pending-jobs");
ok(l && l.error === null && !attenteDepotPayantDe(l.platform_fields) && l.platform_fields.attente_depot_payant_levee?.job === BRACELETS.id,
  "marqueur et message retirés, trace attente_depot_payant_levee", l);
ok(leveeAttenteDepotPayant(JUPE, "x", "y") === null, "rien à lever sur une tâche sans marqueur (aucune écriture)");
ok(leveeAttenteDepotPayant({ ...jupeEcrite, error: "Autre message" }, "x", "y")?.error === "Autre message", "un message qui n'est pas le nôtre n'est jamais effacé");
ok(situationJob({ ...JUPE, platform_fields: l.platform_fields, error: null }, { lang: "fr", maintenant: T0 }).motif === "tour", "levée : « En file » de nouveau");

console.log("6. Le câblage dans get-pending-jobs");
const gpj = fs.readFileSync(new URL("../supabase/functions/get-pending-jobs/index.ts", import.meta.url), "utf8");
const branche = gpj.slice(gpj.indexOf("const { servis, silencieux, retenus } = partagerCandidatsAPayer("), gpj.indexOf("// ══ ANCIENNE EXTENSION (17/10)"));
ok(/depotQuiRetient\(mursLus/.test(branche) && /for \(const j of silencieux\)[\s\S]{0,400}ecritureAttenteDepotPayant\(/.test(branche) && /\.eq\("status", "pending"\)/.test(branche),
  "les publications silencieuses reçoivent l'attente (compare-and-swap sur pending)");
ok(/gardesDepot\.has\(String\(j\.id\)\)[\s\S]{0,300}leveeAttenteDepotPayant\(/.test(gpj), "levée pour toute publication qui n'est plus gardée ainsi");
ok(/select\("id, status, action, created_at, title, diag:platform_fields->last_diagnostic/.test(gpj), "le titre du dépôt qui retient est lu avec le mur (aucune lecture de plus)");
ok(messageAttenteDepotPayant(null).includes("ton annonce précédente"), "sans titre : « ton annonce précédente »");

console.log(ko ? `\n${ko} échec(s) sur ${n}` : `\nOK ${n}/${n}`);
process.exit(ko ? 1 : 0);
