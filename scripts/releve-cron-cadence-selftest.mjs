// ═══════════════════════════════════════════════════════════════════════════
// VERROU — LE RELEVÉ VINTED AUTOMATIQUE NE PERD PLUS UN JOUR (lot « zéro problème », 13/11, bloc 6 — décision de Nico)
// ═══════════════════════════════════════════════════════════════════════════
//   npm run selftest:releve-cron-cadence
// Le CODE LIVRÉ est extrait de chrome-extension/background.js (et de _shared/poste-extension.ts) et EXÉCUTÉ.
//
// Constat (audit bloc6.md, 7 jours) : ≈ 491 refus « cadence_cron » sur 127 comptes ; un relevé fait d'un GESTE le soir
// faisait refuser le relevé automatique du lendemain matin (la règle des 20 h comptait tous les relevés), et l'alarme
// suivante ne venait que 24 h plus tard. Compte 447d920c : geste le 11/11 à 20:29 (Paris), relevé automatique refusé le
// 12/11 à 10:34, ~38 h sans relevé automatique. Décision de Nico :
//   P2 — seuls les relevés AUTOMATIQUES (cron) comptent dans les 20 h (miroir SQL : migration 20261113170000) ;
//   P1 — après un refus, UNE alarme à « dernier relevé automatique + 20 h » (jamais 24 h plus tard) ;
//   P4 — l'extension dit au serveur l'heure de sa prochaine alarme (extension_postes.<poste>.prochain_releve_vinted) ;
//   compte « en vente » FIGÉ à la clôture du relevé (note « [statuts] … » du run) ;
//   le refus « cron_sans_premiere_sync » (aucun relevé, donc aucune note) laisse une trace usage_logs « cron_refuse ».
// ⛔ Jamais de relevé lancé par le serveur ; aucune synchro après la connexion d'une plateforme au Cloud (décisions de
//    Nico) : rien de tel ici, seule l'alarme LOCALE de l'extension part.
// ⛔ La note de refus garde ses motifs (« cadence cron : N sync … dernière le <ISO> ») : la migration P3 d'un autre
//    agent (20261113154000_cron_refus_journalise) les lit.
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { extraireFonctionJs } from "./lib/extraire-fonction-js.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const bg = fs.readFileSync(join(ROOT, "chrome-extension/background.js"), "utf8").replace(/\r\n/g, "\n");
let verts = 0;
let rouges = 0;
const cas = async (nom, fn) => {
  try { await fn(); verts++; console.log(`  ✓ ${nom}`); } catch (e) { rouges++; console.log(`  ✗ ${nom}\n      ${String(e?.message ?? e).split("\n")[0]}`); }
};
const essai = (nom) => { try { return extraireFonctionJs(bg, nom); } catch { return ""; } };
const constante = (nom) => bg.match(new RegExp(`^const ${nom} = [^;]+;`, "m"))?.[0] ?? "";
const H = 3600_000;

function contexte(extra = {}) {
  const ctx = vm.createContext({ Number, String, Array, Object, Set, Map, JSON, Date, Math, RegExp, Promise, console: { log() {}, warn() {}, error() {} }, ...extra });
  vm.runInContext(`${constante("SYNC_CRON_COOLDOWN_MS")}
    ${constante("SYNC_CRON_RATTRAPAGE_ALARM")}
    ${constante("SYNC_CRON_RATTRAPAGE_MARGE_MS")}
    ${constante("SYNC_DRESSING_ALARM")}
    ${essai("decisionCadenceCron")}
    ${essai("armerRattrapageCron")}
    ${essai("journaliserRefusCron")}
    ${essai("journaliserRefusSansPremiere")}
    ${essai("prochainReleveAuto")}
    ${essai("noteStatutsReleve")}
    globalThis.__f = { decisionCadenceCron: typeof decisionCadenceCron === "function" ? decisionCadenceCron : null,
      armerRattrapageCron: typeof armerRattrapageCron === "function" ? armerRattrapageCron : null,
      journaliserRefusCron, journaliserRefusSansPremiere: typeof journaliserRefusSansPremiere === "function" ? journaliserRefusSansPremiere : null,
      prochainReleveAuto: typeof prochainReleveAuto === "function" ? prochainReleveAuto : null,
      noteStatutsReleve: typeof noteStatutsReleve === "function" ? noteStatutsReleve : null };`, ctx);
  return ctx.__f;
}

console.log("P2. Seuls les relevés automatiques comptent dans les 20 h");
await cas("compte 447d920c : geste le 11/11 20:29, dernier automatique le 09/11 → le relevé du 12/11 10:34 PART", () => {
  const f = contexte();
  assert.ok(f.decisionCadenceCron, "decisionCadenceCron absente");
  const d = f.decisionCadenceCron({
    dernierDone: { id: "geste", declencheur: "bouton", finished_at: "2026-11-11T19:29:00Z" },
    dernierCronDone: { id: "cron", declencheur: "cron", finished_at: "2026-11-09T13:50:00Z" },
    maintenant: Date.parse("2026-11-12T09:34:00Z"),
  });
  assert.equal(d.ok, true, JSON.stringify(d));
});
await cas("compte faf5021a (automatiques seuls) : relevé automatique fini il y a 9 h → refusé, prochaine possible à fin + 20 h", () => {
  const f = contexte();
  const fini = "2026-11-12T00:21:00Z";
  const d = f.decisionCadenceCron({ dernierDone: { declencheur: "cron", finished_at: fini }, dernierCronDone: { id: "c1", declencheur: "cron", finished_at: fini },
    maintenant: Date.parse(fini) + 9 * H });
  assert.equal(d.ok, false);
  assert.equal(d.reason, "cadence_cron");
  assert.equal(d.prochaineMs, Date.parse(fini) + 20 * H);
});
await cas("aucun relevé réussi : le cron n'inaugure jamais (règle du 07/08 inchangée)", () => {
  const f = contexte();
  assert.equal(f.decisionCadenceCron({ dernierDone: null, dernierCronDone: null, maintenant: Date.now() }).reason, "cron_sans_premiere_sync");
});
await cas("des gestes seulement, jamais d'automatique : le cron part (rien ne le retient)", () => {
  const f = contexte();
  assert.equal(f.decisionCadenceCron({ dernierDone: { declencheur: "bouton", finished_at: new Date().toISOString() }, dernierCronDone: null }).ok, true);
});
await cas("la garde du cron lit le dernier relevé automatique (declencheur=eq.cron) et décide par decisionCadenceCron", () => {
  const i = bg.indexOf('if (declencheur === "cron") {', bg.indexOf("async function syncDressingVinted("));
  const bloc = bg.slice(i, bg.indexOf('if (declencheur === "bouton") {', i));
  assert.match(bloc, /declencheur=eq\.cron/);
  assert.match(bloc, /decisionCadenceCron\(/);
  assert.match(bloc, /armerRattrapageCron\(/);
});

console.log("P1. Après un refus : UNE alarme à « dernier automatique + 20 h », jamais 24 h plus tard");
await cas("refus → alarme unique fillsell-sync-cron-rattrapage à fin + 20 h + marge", async () => {
  const crees = [];
  const f = contexte({ chrome: { alarms: { create: (nom, o) => crees.push({ nom, ...o }) } } });
  assert.ok(f.armerRattrapageCron, "armerRattrapageCron absente");
  const cible = Date.now() + 11 * H;
  await f.armerRattrapageCron(cible);
  assert.equal(crees.length, 1);
  assert.equal(crees[0].nom, "fillsell-sync-cron-rattrapage");
  assert.ok(crees[0].when >= cible && crees[0].when <= cible + 15 * 60_000, `when ${crees[0].when - cible} ms après la cible`);
  assert.ok(!("periodInMinutes" in crees[0]), "jamais une alarme périodique de plus");
});
await cas("une échéance déjà passée → dans la minute, jamais dans le passé", async () => {
  const crees = [];
  const f = contexte({ chrome: { alarms: { create: (nom, o) => crees.push({ nom, ...o }) } } });
  await f.armerRattrapageCron(Date.now() - H);
  assert.ok(crees[0].when > Date.now() && crees[0].when <= Date.now() + 2 * 60_000);
});
await cas("l'alarme de rattrapage lance le MÊME relevé automatique (declencheur « cron », gardes comprises)", () => {
  const ecoute = bg.slice(bg.indexOf("chrome.alarms.onAlarm.addListener((alarm) => {"));
  assert.match(ecoute.slice(0, 6000), /alarm\.name === SYNC_CRON_RATTRAPAGE_ALARM\)\s*\{\s*syncDressingVinted\(\{ declencheur: "cron" \}\)/);
});
await cas("un refus de la BASE (SYNC_CRON_CADENCE, avant la migration P2) arme aussi le rattrapage", () => {
  const i = bg.indexOf('const cree = await restRequest("vinted_sync_runs", token, {');
  assert.ok(i > 0);
  const bloc = bg.slice(i, i + 3500);
  assert.match(bloc, /if \(declencheur === "cron"\) refusBaseCron = true;/);
  assert.match(bloc, /finiBase \+ SYNC_CRON_COOLDOWN_MS > Date\.now\(\)\) \{\s*await armerRattrapageCron\(finiBase \+ SYNC_CRON_COOLDOWN_MS\)/);
});

console.log("P3 (lu par la migration 20261113154000) : la note de refus garde ses motifs ; le refus sans premier relevé laisse une trace");
await cas("note « cadence cron : N sync … dernière le <ISO> » inchangée (motifs de cron_refus_journaliser)", async () => {
  const patches = [];
  const f = contexte({ restRequest: async (url, _t, o) => { patches.push({ url, body: JSON.parse(o.body) }); return null; } });
  await f.journaliserRefusCron({ id: "run-1", erreur: "[note] autre chose | [note] cadence cron : 2 sync 'cron' refusée(s) depuis ce run (fenêtre de 20 h), dernière le 2026-11-12T09:34:00.000Z" }, "jeton");
  const e = patches[0].body.erreur;
  assert.equal(Number(e.match(/cadence cron :\s*(\d+)\s+sync/)?.[1]), 3);
  assert.ok(Number.isFinite(Date.parse(e.match(/derni[eè]re le ([^ |]+)/)?.[1])));
  assert.match(e, /\[note\] autre chose/);
});
await cas("cron_sans_premiere_sync : une ligne usage_logs « cron_refuse » (motif), au plus une par 20 h et par poste", async () => {
  const lignes = [];
  const memoire = {};
  const f = contexte({
    restRequest: async (url, _t, o) => { if (url === "usage_logs") lignes.push(...JSON.parse(o.body)); return null; },
    chrome: { storage: { local: { get: async (k) => ({ [k]: memoire[k] }), set: async (o) => Object.assign(memoire, o) } } },
    FILLSELL_BUILD_ID: "2026-11-13T00:00:00Z+essai", decodeJwtSub: () => "447d920c-0000-0000-0000-000000000000",
  });
  assert.ok(f.journaliserRefusSansPremiere, "journaliserRefusSansPremiere absente");
  await f.journaliserRefusSansPremiere("jeton", "447d920c-0000-0000-0000-000000000000");
  await f.journaliserRefusSansPremiere("jeton", "447d920c-0000-0000-0000-000000000000");
  assert.equal(lignes.length, 1);
  assert.equal(lignes[0].feature, "cron_refuse");
  assert.equal(lignes[0].metadata.motif, "cron_sans_premiere_sync");
});

console.log("P4. L'extension dit l'heure de sa prochaine alarme ; le serveur la range sur le poste");
await cas("prochainReleveAuto : la plus proche des deux alarmes (quotidienne, rattrapage)", async () => {
  const t1 = Date.now() + 5 * H; const t2 = Date.now() + 2 * H;
  const f = contexte({ chrome: { alarms: { get: async (n) => (n === "fillsell-sync-dressing" ? { scheduledTime: t1 } : n === "fillsell-sync-cron-rattrapage" ? { scheduledTime: t2 } : undefined) } } });
  assert.ok(f.prochainReleveAuto, "prochainReleveAuto absente");
  const p = await f.prochainReleveAuto();
  assert.equal(p.vinted, new Date(t2).toISOString());
  assert.equal(p.rattrapage, new Date(t2).toISOString());
  assert.equal(p.quotidienne, new Date(t1).toISOString());
});
await cas("le poll porte prochain_releve_auto", () => {
  const i = bg.indexOf('const rep = await callEdgeFunction("get-pending-jobs", session.access_token, {');
  assert.match(bg.slice(i, i + 3000), /prochain_releve_auto: await prochainReleveAuto\(\)/);
});
await cas("serveur : patchPosteDuPoll range prochain_releve_vinted (heure plausible seulement)", async () => {
  const { patchPosteDuPoll } = await import(pathToFileURL(join(ROOT, "supabase/functions/_shared/poste-extension.ts")).href);
  const maintenant = Date.parse("2026-11-13T08:00:00Z");
  const ok = patchPosteDuPoll({ prochain_releve_auto: { vinted: "2026-11-13T20:21:00.000Z" } }, maintenant);
  assert.equal(ok.prochain_releve_vinted, "2026-11-13T20:21:00.000Z");
  assert.equal(patchPosteDuPoll({ prochain_releve_auto: { vinted: "2027-01-01T00:00:00Z" } }, maintenant).prochain_releve_vinted, undefined);
  assert.equal(patchPosteDuPoll({ prochain_releve_auto: { vinted: "n'importe quoi" } }, maintenant).prochain_releve_vinted, undefined);
  assert.equal(patchPosteDuPoll({}, maintenant).prochain_releve_vinted, undefined);
});

console.log("Compte « en vente » figé à la clôture du relevé (note du run)");
await cas("compte 447d920c, relevé du 11/11 : 256 lus = 245 en vente + 11 vendues → « [statuts] active 245, sold 11 »", () => {
  const f = contexte();
  assert.ok(f.noteStatutsReleve, "noteStatutsReleve absente");
  const m = new Map();
  for (let i = 0; i < 245; i++) m.set(`a${i}`, "active");
  for (let i = 0; i < 11; i++) m.set(`s${i}`, "sold");
  assert.equal(f.noteStatutsReleve(m), "[statuts] active 245, sold 11");
  const m2 = new Map([["x", "active"], ["y", "reserved"], ["z", "hidden"], ["w", "draft"]]);
  assert.equal(f.noteStatutsReleve(m2), "[statuts] active 1, reserved 1, hidden 1, draft 1");
  assert.equal(f.noteStatutsReleve(new Map()), null);
});
await cas("écrite à la clôture d'un relevé COMPLET seulement (ni repris, ni incomplet, ni harnais), juste après les marqueurs de reprise", () => {
  const i = bg.indexOf("const NOTE = \"[note] \";");
  const clo = bg.slice(i, bg.indexOf("await clore({", i));
  assert.match(clo, /noteStatutsReleve\(statutsCetteSync\)/);
  assert.match(clo, /!runRepris && !releveIncomplet && !mock/);
  assert.match(bg, /statutsCetteSync\.set\(a\.vinted_item_id,/);
});

console.log(`\n${verts} vert(s), ${rouges} rouge(s)`);
if (rouges) process.exit(1);
