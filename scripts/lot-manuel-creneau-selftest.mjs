// ═══════════════════════════════════════════════════════════════════════════
// UN LOT MANUEL DE PLUS DE 10 ARTICLES PART DANS LES CRÉNEAUX (09/11, décision de Nico — OPTION B avec exception)
// `npm run selftest:lot-manuel-creneau`
// ═══════════════════════════════════════════════════════════════════════════
// Décision de Nico (09/11) : avec des créneaux de republication, un lot manuel de PLUS de 10 articles part dans les
// créneaux, au rythme de chaque plateforme ; 1 à 10 articles : tout de suite ; sans créneaux : rien ne change ; la
// programmation automatique reste en pause tant que le lot est en file ; le lot de josephinecerni (77b7bf38, 299
// articles, ~724 en attente, créneaux 10:00–22:00 sur Vinted, Leboncoin, Beebs) suit la règle sans être recréé, annulé ni
// dupliqué. Garde-fous : aucune republication perdue ou doublée, rythme par plateforme inchangé, automatique intacte.
// Ce test prouve :
//   1. la règle pure (taille du lot, seuil, créneau ouvert/fermé, module actif/en pause/absent, exemptions, lot en
//      création, lecture ratée) — et le cas réel de Joséphine relu le 09/11 à 00:24 ;
//   2. get-pending-jobs : lu à l'exécution (aucune création, aucune annulation), mêmes exemptions que l'automatique, rien
//      d'écrit sur le rythme ni l'échéance (next_action_after) — le job reste « en vol » pour le balayage ; lecture des
//      lots bornée ; messages bornés et à la transition ; l'app reçoit les lots ;
//   3. le balayage SQL de l'automatique (corps de la PROD du 09/11) : tout republish pending/processing de la plateforme
//      — manuel compris — la bloque (pas de double volume) ;
//   4. l'app : la file dit « en pause (créneau) » pour un tel lot, l'avancement se compte « de créneau », la feuille le
//      dit avant le clic ; rien ne change pour l'automatique ;
//   5. le test mord.
import fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  SEUIL_LOT_MANUEL_ARTICLES, DELAI_LOT_EN_CREATION_MS, estRepublicationManuelle, lotsDepuisLignes, lotDansLesCreneaux,
  retenueLotManuel, messageRetenueLotCreneau, lotRetenuAuxCreneaux,
} from "../supabase/functions/_shared/lot-manuel-creneau.js";
import { avancementRepublication, phraseAvancement } from "../supabase/functions/_shared/avancement-republication.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => fs.readFileSync(join(ROOT, p), "utf8").split("\r\n").join("\n");
let ko = 0;
const ok = (c, nom, d = "") => { if (c) console.log(`  ✓ ${nom}`); else { console.error(`  ✗ ${nom}${d ? `\n      ${d}` : ""}`); ko++; } };

const MAINTENANT = Date.parse("2026-11-08T23:24:00Z"); // 09/11 00:24, heure de Paris : le relevé réel
const HORS = { actif: true, dans_creneau: false };      // Joséphine à 00:24 (créneau 10:00–22:00), relu en prod
const DANS = { actif: true, dans_creneau: true };
const PAUSE = { actif: false, dans_creneau: false };
const job = (o = {}) => ({ id: o.id ?? "j", action: "republish", platform: o.platform ?? "vinted", status: "pending",
  created_at: o.created_at ?? "2026-11-04T21:07:43Z", bulk_batch_id: o.lot === undefined ? "77b7bf38" : o.lot,
  platform_fields: { republish_source: o.source ?? "manuel", republish_step: o.step ?? "a_capturer", ...(o.pf ?? {}) } });
const lotJo = { articles: 299, dernier_cree: Date.parse("2026-11-04T21:14:08Z") };

console.log("\n1. LA RÈGLE");
{
  ok(SEUIL_LOT_MANUEL_ARTICLES === 10 && DELAI_LOT_EN_CREATION_MS === 90_000, "seuil 10 articles, lot en création 90 s");
  const lots = lotsDepuisLignes([
    { bulk_batch_id: "A", inventaire_id: 1, created_at: "2026-11-04T21:07:43Z" },
    { bulk_batch_id: "A", inventaire_id: 1, created_at: "2026-11-04T21:07:44Z" }, // même article, autre plateforme
    { bulk_batch_id: "A", inventaire_id: 2, created_at: "2026-11-04T21:14:08Z" },
    { bulk_batch_id: null, inventaire_id: 3, created_at: "2026-11-04T21:14:09Z" },
  ]);
  ok(lots.get("A")?.articles === 2 && lots.get("A").dernier_cree === Date.parse("2026-11-04T21:14:08Z") && lots.size === 1, "taille = articles distincts, toutes plateformes ; dernière tâche du lot");
  ok(!lotDansLesCreneaux({ articles: 10 }) && lotDansLesCreneaux({ articles: 11 }), "10 articles : tout de suite ; 11 : dans les créneaux");
  const r = (j, o) => retenueLotManuel(j, { maintenant: MAINTENANT, ...o });
  ok(r(job(), { fenetre: HORS, lot: lotJo }).retenir && r(job(), { fenetre: HORS, lot: lotJo }).motif === "lot_dans_creneaux", "Joséphine à 00:24 : son lot (299 articles) attend le créneau de 10:00");
  for (const pf of ["vinted", "leboncoin", "beebs"]) ok(r(job({ platform: pf }), { fenetre: HORS, lot: lotJo }).retenir, `…sur ${pf} aussi (créneau de la plateforme)`);
  ok(!r(job(), { fenetre: DANS, lot: lotJo }).retenir, "dans le créneau : servi, au rythme habituel");
  ok(!r(job(), { fenetre: PAUSE, lot: lotJo }).retenir, "module en pause ou arrêté : rien ne change (part tout de suite)");
  ok(!r(job(), { fenetre: null, lot: lotJo }).retenir, "aucun module sur la plateforme : rien ne change");
  ok(!r(job(), { fenetre: HORS, lot: { articles: 10, dernier_cree: lotJo.dernier_cree } }).retenir, "lot de 10 articles hors créneau : tout de suite");
  ok(r(job(), { fenetre: HORS, lot: { articles: 11, dernier_cree: lotJo.dernier_cree } }).retenir, "lot de 11 articles hors créneau : retenu");
  ok(!r(job({ lot: null }), { fenetre: HORS, lot: null }).retenir, "republication à l'unité (sans lot) : tout de suite");
  ok(!r(job({ source: "auto" }), { fenetre: HORS, lot: lotJo }).retenir, "l'automatique n'est pas lue ici (son filtre à elle, inchangé)");
  ok(!r(job(), { fenetre: HORS, lot: lotJo, exemptee: true }).retenir, "suppression partie / étape deleted / exception : va au bout");
  ok(!r(job(), { fenetre: HORS, lot: null }).retenir, "taille du lot illisible : jamais une retenue sur une panne");
  const neuf = new Date(MAINTENANT - 20_000).toISOString();
  ok(r(job({ created_at: neuf, lot: null }), { fenetre: HORS }).motif === "lot_en_creation", "hors créneau, une tâche née il y a 20 s (numéro du lot pas encore posé) attend la fin de la création");
  ok(!r(job({ created_at: neuf, lot: null }), { fenetre: DANS }).retenir, "…dans le créneau : rien n'attend");
  ok(r(job({ created_at: new Date(MAINTENANT - 200_000).toISOString() }), { fenetre: HORS, lot: { articles: 4, dernier_cree: MAINTENANT - 30_000 } }).motif === "lot_en_creation",
    "lot encore en création (dernière tâche il y a 30 s) : on ne le juge pas sur ses 4 premiers articles");
  ok(!r(job({ created_at: new Date(MAINTENANT - 200_000).toISOString() }), { fenetre: HORS, lot: { articles: 4, dernier_cree: MAINTENANT - 120_000 } }).retenir,
    "petit lot complet (4 articles) : tout de suite");
  ok(estRepublicationManuelle(job()) && !estRepublicationManuelle({ ...job(), action: "publish" }), "seule une republication est concernée (jamais une publication)");
  const msg = messageRetenueLotCreneau("leboncoin");
  ok(/créneau Leboncoin/.test(msg) && /rien n'a été retiré/.test(msg) && !/\d{1,2}[:h]\d{2}/.test(msg), "le message nomme la plateforme, dit que l'annonce est intacte, sans heure");
}

console.log("\n2. GET-PENDING-JOBS");
{
  const g = lire("supabase/functions/get-pending-jobs/index.ts");
  ok(/import \{ estRepublicationManuelle, lotsDepuisLignes, lotDansLesCreneaux, retenueLotManuel, messageRetenueLotCreneau \} from "\.\.\/_shared\/lot-manuel-creneau\.js";/.test(g), "la règle unique est importée");
  ok((g.match(/listing_url, platform_listing_id, created_at, error, bulk_batch_id/g) ?? []).length === 2, "la file lue porte le numéro du lot (deux lectures)");
  ok(/const manuelCandidat = [^\n]*\n[^\n]*\n\s*return estRepublicationManuelle\(j\) && pf\["republish_step"\] !== "deleted" && !retraitEngage\(j\) && !exceptionCreneau\(pf\);/.test(g),
    "mêmes exemptions que l'automatique (deleted, suppression partie, exception de créneau)");
  const iLot = g.indexOf("const d = retenueLotManuel(j, { fenetre: fenetres[plat]");
  const iAuto = g.indexOf("if (!autoHorsDeleted(j)) return true;");
  ok(iLot > 0 && iAuto > iLot, "le lot manuel est jugé dans le même passage que l'automatique, par la fenêtre de SA plateforme");
  ok(/if \(!includeProcessing && !includeNeedsUser && \(out\.some\(autoHorsDeleted\) \|\| out\.some\(manuelCandidat\)\)\)/.test(g), "poll d'exécution seul (le popup voit toute la file)");
  const bloc = g.slice(g.indexOf("let heldLotManuel = 0;"), iAuto);
  ok(!/next_action_after|status: "(cancelled|failed|needs_user)"|\.insert\(|\.delete\(/.test(bloc), "rien n'est annulé, recréé, ni repoussé (aucune échéance écrite : la tâche reste « en vol » pour le balayage)");
  ok(/\.update\(\{ error: messageRetenueLotCreneau\(plat\) \}\)\s*\n\s*\.in\("id", tranche\)\.eq\("status", "pending"\);/.test(bloc), "seul le message est écrit, sur des tâches encore en attente");
  ok(/!== messageRetenueLotCreneau\(plat\)\)/.test(bloc) && /i \+= 100/.test(bloc) && /ecrites < 300/.test(bloc), "message à la transition seulement, par 100, 300 au plus par passage");
  ok(/\.in\("bulk_batch_id", manquants\.slice\(0, 20\)\)\s*\n\s*\.order\("created_at", \{ ascending: false \}\)\.limit\(1000\);/.test(g), "taille des lots : une lecture bornée (20 lots, 1000 lignes)");
  ok(/lots_dans_creneaux: lotsCreneaux \}/.test(g) && /plateformesEnCreneaux,\n/.test(g), "l'app reçoit les lots retenus et l'avancement « de créneau »");
  ok(!/Le MANUEL n'est pas concerné \(décision Nico, point 7\)/.test(g), "la décision du « point 7 » est remplacée dans le commentaire de la règle");
}

console.log("\n3. LA PROGRAMMATION AUTOMATIQUE RESTE EN PAUSE TANT QUE LE LOT EST EN FILE (balayage SQL de la prod, 09/11)");
{
  const sweep = lire("scripts/essais/fixtures/prod-0911-sweep/republish_planifiee_sweep.sql");
  const garde = sweep.slice(sweep.indexOf("-- 4. Garde anti-rafale, PAR PLATEFORME."), sweep.indexOf("_bloque_en_vol', v_bloque), updated_at = now()"));
  ok(/WHERE j\.user_id = v_compte\.id AND j\.action = 'republish' AND j\.platform = v_pf\s*\n\s*AND j\.status IN \('pending', 'processing'\);/.test(garde), "en vol = tout republish pending/processing de la plateforme");
  ok(!/republish_source/.test(garde), "…sans filtre de source : le lot manuel retenu bloque l'automatique (jamais deux volumes)");
  ok(/COALESCE\(republish_ts_safe\(j\.platform_fields, 'next_action_after'\), now\(\)\) <= now\(\)/.test(garde), "seule une échéance future sort une tâche du « en vol » — la retenue du lot n'en écrit aucune");
}

console.log("\n4. L'APP");
{
  const { situationJob, lotEnPauseCreneau } = await import("../src/utils/fileDesJobs.js");
  const ctxL = (fen, lots = ["77b7bf38"]) => ({ lang: "fr", maintenant: MAINTENANT, extension: { etat: "actif", vu_le: new Date(MAINTENANT).toISOString(), lastSeenAt: new Date(MAINTENANT).toISOString() },
    creneaux: { vinted: fen }, lotsCreneaux: lots });
  const jj = { ...job(), error: messageRetenueLotCreneau("vinted") };
  ok(situationJob(jj, ctxL(HORS)).motif === "creneau" && situationJob(jj, ctxL(HORS)).groupe === "en_pause", "la file : « en pause (créneau) » pour le lot retenu hors créneau", JSON.stringify(situationJob(jj, ctxL(HORS))));
  ok(situationJob(jj, ctxL(DANS)).motif !== "creneau", "dans le créneau : plus en pause de créneau");
  ok(situationJob(jj, ctxL(PAUSE)).motif !== "creneau", "module en pause : jamais « créneau » pour le manuel");
  ok(situationJob(jj, ctxL(HORS, [])).motif !== "creneau", "lot que le serveur ne nomme pas (≤ 10 articles) : rien ne change");
  ok(lotEnPauseCreneau({ ...jj, platform_fields: { ...jj.platform_fields, republish_step: "deleted" } }, ctxL(HORS), { etat: "en_file", motif: "tour" }).motif === "tour", "annonce déjà retirée : jamais « en pause »");
  ok(lotEnPauseCreneau({ ...jj, platform_fields: { ...jj.platform_fields, republish_suppression_envoyee: true } }, ctxL(HORS), { etat: "en_file", motif: "tour" }).motif === "tour", "suppression partie : jamais « en pause »");
  ok(lotEnPauseCreneau({ ...jj, status: "processing" }, ctxL(HORS), { etat: "en_cours", motif: "ordinateur" }).etat === "en_cours", "une tâche en cours reste en cours");
  ok(lotEnPauseCreneau(jj, ctxL(HORS), { etat: "en_pause", motif: "rythme" }).motif === "rythme", "la pause de respiration, la boutique… gardent leur rang (avant le créneau)");
  ok(!/lotsCreneaux|lot-manuel-creneau/.test(lire("supabase/functions/_shared/etat-job.js")), "etat-job.js (recopié dans l'extension) n'est pas touché : aucune nouvelle version d'extension");
  ok(lotRetenuAuxCreneaux(job(), ["77b7bf38"]) && !lotRetenuAuxCreneaux(job(), ["autre"]) && !lotRetenuAuxCreneaux(job({ source: "auto" }), ["77b7bf38"]), "lotRetenuAuxCreneaux : le lot nommé par le serveur, manuel seulement");
  const fdj = lire("src/components/FileDesJobs.jsx");
  ok(/lotsCreneaux: retenues\?\.lots \?\? null,/.test(fdj) && /lots: Array\.isArray\(data\?\.lots_dans_creneaux\)/.test(fdj) && /listing_url, bulk_batch_id";/.test(fdj), "FileDesJobs : lots du serveur, numéro du lot lu");
  const a = avancementRepublication({ enFile: Array.from({ length: 8 }, (_, i) => ({ platform: "vinted", status: "pending", created_at: "2026-11-04T21:07:43Z" })),
    faites: Array.from({ length: 6 }, (_, i) => ({ platform: "vinted", created_at: "2026-11-04T21:07:43Z", published_at: new Date(MAINTENANT - i * 120_000).toISOString() })),
    maintenant: MAINTENANT, pauseApres: 50, pauseDureeMin: 120, plateformesEnCreneaux: ["vinted"] });
  ok(a?.plateformes?.vinted?.creneaux === true, "avancement : la plateforme qui ne part que dans ses créneaux est marquée");
  ok(/de créneau \(ordinateur allumé\)/.test(phraseAvancement(a.plateformes.vinted, { lang: "fr" })?.fin ?? ""), "…et sa fin se dit « de créneau »", phraseAvancement(a.plateformes.vinted, { lang: "fr" })?.fin);
  const sans = avancementRepublication({ enFile: [{ platform: "vinted", status: "pending", created_at: "2026-11-04T21:07:43Z" }], maintenant: MAINTENANT });
  ok(sans?.plateformes?.vinted?.creneaux === undefined, "sans créneau : l'avancement d'avant, à l'identique");
  const st = lire("src/tabs/StockTab.jsx");
  ok(/if \(solo \|\| items\.length <= SEUIL_LOT_MANUEL_ARTICLES\) return null;/.test(st) && /plateformesCreneaux=\{planifieeActives\}/.test(st), "la feuille le dit avant le clic, d'après les modules actifs du compte");
  ok(/ils partiront dans ton créneau de republication, au rythme habituel de chaque plateforme/.test(st), "…en clair, sans heure");
}

console.log("\n5. LE TEST MORD");
{
  // Le filtre d'avant (« le MANUEL n'est pas concerné ») servait le lot de Joséphine à 00:24.
  const avant = (j, fenetre) => !(j.platform_fields.republish_source === "auto" && fenetre.actif && !fenetre.dans_creneau);
  ok(avant(job(), HORS) === true && retenueLotManuel(job(), { fenetre: HORS, lot: lotJo, maintenant: MAINTENANT }).retenir === true,
    "l'ancienne règle servait le lot hors créneau (le contrôle 1 le distingue)");
  ok(retenueLotManuel(job(), { fenetre: HORS, lot: { articles: 10, dernier_cree: 0 }, maintenant: MAINTENANT }).retenir === false, "et la nouvelle ne retient pas un lot de 10 (l'exception)");
}

if (ko) { console.error(`\n✗ ${ko} contrôle(s) en échec`); process.exit(1); }
console.log("\n✓ lot-manuel-creneau : tout est vert");
