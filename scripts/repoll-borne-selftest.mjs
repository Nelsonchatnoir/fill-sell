// ═══════════════════════════════════════════════════════════════════════════
// LE POLL « TOUT DE SUITE » EST BORNÉ (29/10, lot B — boucle du poll, et 4.11) — `npm run selftest:repoll-borne`
// ═══════════════════════════════════════════════════════════════════════════
// Le 29/10, des postes appelaient get-pending-jobs toutes les ~3,7 s (2189c4d8 : 826 appels de 18:00 à 18:51 ;
// 53efea05, b3897d60, 90ace0e4, 7b9d8a71). Cause prouvée (function_edge_logs, request_id UUIDv7) : chaque poll partait
// ~200 ms après la réponse du précédent — le cycle rendait le verrou « parce que quelqu'un l'attend » et ce quelqu'un
// était le POLL relancé 1,5 s plus tôt par le cycle d'avant (un poll dure 2 à 4 s, plus que la relance). Exécute le
// code LIVRÉ (fonctions extraites de chrome-extension/background.js, horloge et minuteurs simulés) :
//   1. decisionPollImmediat : raison neuve seulement, jamais deux fois de suite la même, plancher 20 s, geste 1,5 s ;
//   2. la file du verrou réelle (withJobFlowLock, pollAndProcessJobs, armerRelanceApresCycle) : l'ancienne règle
//      (modèle) s'emballe, la nouvelle s'en tient à l'alarme ; une demande de l'écran est servie une fois ; la même
//      relecture resservie ne relance pas deux fois ; une relance devenue inutile ne part pas ;
//   3. (4.11) raisonsDeNePasRecharger : une republication 'deleted' que le serveur retient (retenues_deleted, moins de
//      10 min) ne refuse plus la mise à jour ; une en cours, ou une liste périmée, la refusent toujours ;
//   4. (4.11) la trace usage_logs « maj_extension_reportee » : une par heure au plus et par poste.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..");
const BG = readFileSync(join(RACINE, "chrome-extension/background.js"), "utf8").replace(/\r\n/g, "\n");
let verts = 0, rouges = 0;
const ok = (c, m, d = "") => { if (c) { verts++; console.log(`  ok   ${m}`); } else { rouges++; console.log(`  RATÉ ${m}${d ? `  ← ${d}` : ""}`); } };

/** Le corps d'une fonction de premier niveau de background.js (de sa déclaration à la première « } » en colonne 0). */
function extraire(nom) {
  const m = new RegExp(`\\n((?:async )?function ${nom}\\()`).exec(BG);
  if (!m) throw new Error(`fonction introuvable : ${nom}`);
  const fin = BG.indexOf("\n}\n", m.index + 1);
  if (fin < 0) throw new Error(`fin introuvable : ${nom}`);
  return BG.slice(m.index + 1, fin + 2);
}
/** La ligne qui déclare une variable de premier niveau (let / const), telle que livrée. */
function declaration(nom) {
  const m = new RegExp(`\\n((?:let|const) ${nom} = [^\\n]*)\\n`).exec(BG);
  if (!m) throw new Error(`déclaration introuvable : ${nom}`);
  return m[1];
}

/** Une horloge simulée : Date, setTimeout, et une boucle qui fait avancer le temps de minuteur en minuteur. */
function horloge(debutIso = "2026-10-29T17:00:00Z") {
  const t = { now: Date.parse(debutIso), timers: [], seq: 0 };
  t.setTimeout = (cb, ms) => { const id = ++t.seq; t.timers.push({ due: t.now + Math.max(0, Number(ms) || 0), seq: id, cb }); return id; };
  t.clearTimeout = (id) => { t.timers = t.timers.filter((x) => x.seq !== id); };
  const RealDate = Date;
  t.Date = class extends RealDate { constructor(...a) { if (a.length) super(...a); else super(t.now); } static now() { return t.now; } };
  t.avancer = async (ms) => {
    const jusqua = t.now + ms;
    for (;;) {
      await new Promise((r) => setImmediate(r));
      t.timers.sort((a, b) => a.due - b.due || a.seq - b.seq);
      const x = t.timers[0];
      if (!x || x.due > jusqua) break;
      t.timers.shift();
      t.now = Math.max(t.now, x.due);
      x.cb();
    }
    await new Promise((r) => setImmediate(r));
    t.now = jusqua;
  };
  return t;
}

// ── 1. La décision pure ─────────────────────────────────────────────────────
console.log("1. decisionPollImmediat — une raison neuve, jamais deux fois de suite, au plancher");
{
  const ctx = { console: { log() {} }, Number, String, Math, Infinity };
  vm.createContext(ctx);
  const { decisionPollImmediat: d, REPOLL_PLANCHER_MS, REPOLL_DELAI_MIN_MS } = vm.runInContext(
    `${declaration("REPOLL_PLANCHER_MS")}\n${declaration("REPOLL_DELAI_MIN_MS")}\n${extraire("decisionPollImmediat")}\n;({ decisionPollImmediat, REPOLL_PLANCHER_MS, REPOLL_DELAI_MIN_MS })`, ctx);
  const t0 = 1_000_000;
  ok(REPOLL_PLANCHER_MS === 20_000 && REPOLL_DELAI_MIN_MS === 1500, "plancher 20 s, relance la plus courte 1,5 s");
  ok(d(null, null, t0, t0).permis === false && d({}, null, t0, t0).permis === false, "sans raison : jamais");
  let r = d({ raison: "releve_devant", cle: "a" }, null, t0 + 3300, t0);
  ok(r.permis && r.delaiMs === 16_700, "raison neuve, poll commencé il y a 3,3 s : relance 20 s après son début (16,7 s)", JSON.stringify(r));
  r = d({ raison: "releve_devant", cle: "a" }, null, t0 + 25_000, t0);
  ok(r.permis && r.delaiMs === 1500, "poll long (25 s) : relance à 1,5 s", JSON.stringify(r));
  r = d({ raison: "releve_devant", cle: "a" }, { raison: "releve_devant", cle: "a" }, t0 + 25_000, t0);
  ok(!r.permis && r.motif === "meme_raison_deux_fois", "la même raison (même clé) que la relance d'avant : refusée — l'alarme s'en charge");
  ok(d({ raison: "releve_devant", cle: "b" }, { raison: "releve_devant", cle: "a" }, t0 + 25_000, t0).permis, "une autre relecture (clé neuve) : permise");
  ok(d({ raison: "attente_verrou", cle: "poll" }, { raison: "releve_devant", cle: "poll" }, t0 + 25_000, t0).permis, "même clé, autre raison : permise");
  r = d({ raison: "synchro", cle: "synchro", geste: true }, null, t0 + 2000, t0);
  ok(r.permis && r.delaiMs === 1500, "un geste de la personne (Synchroniser) : 1,5 s, sans plancher", JSON.stringify(r));
  ok(!d({ raison: "synchro", cle: "synchro", geste: true }, { raison: "synchro", cle: "synchro", geste: true }, t0 + 2000, t0).permis, "le même geste resservi au cycle suivant (synchro pas encore partie) : pas une seconde relance");
}

// ── 2. La file du verrou, de bout en bout (code livré, horloge simulée) ─────
console.log("\n2. La file du verrou — l'alarme fait la cadence, la relance n'est jamais une boucle");
const DUREE_POLL_MS = 3300;   // 2189c4d8, 29/10 18:00-18:51 : 3,3 s d'exécution moyenne
function poste({ ancienneRegle = false } = {}) {
  const h = horloge();
  const sim = { polls: [], cedes: 0, maintenances: 0, relectureDevant: null, synchro: false, ecran: 0, dureePoll: DUREE_POLL_MS, dureeMaintenance: 400 };
  const ctx = {
    console: { log() {}, warn() {}, error() {} }, Date: h.Date, setTimeout: h.setTimeout, clearTimeout: h.clearTimeout,
    Promise, Math, Number, String, Boolean, Array, Object, Map, Set, Infinity, sim,
  };
  vm.createContext(ctx);
  const doublures = `
    let majPlanifiee = false; let commandeSyncEnAttente = null; let commandesAnnoncesEnAttente = []; let relevesDemandes = new Set();
    let travailEnCours = null;
    function demarrerBattementPresence() { return () => {}; }
    async function appliquerMajSiSansRisque() { return false; }
    async function envoyerTraceMajSiBesoin() {} async function verifierCopieDevSurDisque() {} async function verifierMiseAJourSiDue() {}
    async function traiterRelevesEnAttente() {} async function traiterCommandeSyncDistante() {}
    function attendre(ms) { return new Promise((r) => setTimeout(r, ms)); }
    // Le cycle, réduit à ce qui compte ici : get-pending-jobs (3,3 s), les relances que le cycle peut demander (aux
    // mêmes sites que pollAndProcessJobsUnlocked), puis la maintenance — ou le verrou cédé aux demandes qui attendent.
    async function pollAndProcessJobsUnlocked() {
      sim.polls.push(Date.now());
      await attendre(sim.dureePoll);
      if (sim.relectureDevant) demanderRepoll({ raison: "releve_devant", cle: sim.relectureDevant });
      if (sim.synchro) { sim.synchro = false; demanderRepoll({ raison: "synchro", cle: "synchro", geste: true }); }
      if (cederAuxDemandesEnAttente()) { sim.cedes++; sim.dernier = "cede"; return; }
      sim.maintenances++; sim.dernier = "maintenance";
      await attendre(sim.dureeMaintenance);
    }`;
  // Modèle de l'ANCIENNE règle (0.6.146 → 0.6.155, telle que lue dans le dépôt avant ce lot) : tout flux en attente
  // (polls compris) faisait céder la maintenance, et la relance partait 1,5 s après, sans condition.
  const ancienne = `
    function cederAuxDemandesEnAttente() { if (jobFlowWaiters > 0 && !majPlanifiee) { repollApresCycle = true; return true; } return false; }
    function demanderRepoll() { repollApresCycle = true; return true; }
    function armerRelanceApresCycle() { if (repollApresCycle) { repollApresCycle = false; setTimeout(() => { pollAndProcessJobs(); }, 1500); } }`;
  // (29/10, lot C 1) withJobFlowLock draine d'abord la file des lectures prioritaires (vide ici : rien ne change).
  const noms = ["withJobFlowLock", "drainerLecturesPrioritaires", "noterAttenteVerrou", "attentesHorsPoll", "pollAndProcessJobs", "decisionPollImmediat"]
    .concat(ancienneRegle ? [] : ["demanderRepoll", "cederAuxDemandesEnAttente", "armerRelanceApresCycle"]);
  const decl = ["jobFlowTail", "jobFlowBusyLabel", "jobFlowWaiters", "attentesVerrouParLabel", "repollApresCycle", "REPOLL_PLANCHER_MS",
    "REPOLL_DELAI_MIN_MS", "debutDernierPoll", "pollsDemarres", "relanceDuCycle", "relancePrecedente", "pollEnAttenteDuVerrou",
    "lecturesPrioritaires", "drainPrioritaireEnCours"].map(declaration).join("\n");
  const api = vm.runInContext(`${decl}\n${doublures}\n${ancienneRegle ? ancienne : ""}\n${noms.map(extraire).join("\n")}
    ;({ pollAndProcessJobs, withJobFlowLock, attendre })`, ctx);
  const alarme = () => { api.pollAndProcessJobs(); h.setTimeout(alarme, 2 * 60_000); };   // l'alarme de 2 min
  return { h, sim, api, alarme };
}
const ecarts = (p) => p.slice(1).map((t, i) => t - p[i]);

{
  // Le déclencheur du 29/10 : un poll de plus arrive PENDANT un poll (l'alarme, un retour de veille) — une fois.
  const vieux = poste({ ancienneRegle: true });
  vieux.alarme();
  vieux.h.setTimeout(() => vieux.api.pollAndProcessJobs(), 1000);
  await vieux.h.avancer(10 * 60_000);
  const e = ecarts(vieux.sim.polls);
  ok(vieux.sim.polls.length > 100 && Math.min(...e.slice(2)) <= DUREE_POLL_MS + 10 && vieux.sim.maintenances <= 2,
    `modèle de l'ancienne règle : ${vieux.sim.polls.length} polls en 10 min, collés l'un à l'autre, ${vieux.sim.maintenances} maintenance(s) (la boucle du 29/10 reproduite)`);

  const neuf = poste();
  neuf.alarme();
  neuf.h.setTimeout(() => neuf.api.pollAndProcessJobs(), 1000);
  await neuf.h.avancer(10 * 60_000 + 10_000);
  // Alarmes à 0, 2, 4, 6, 8 et 10 min (6) + le poll de trop du déclencheur (1).
  ok(neuf.sim.polls.length === 7 && neuf.sim.cedes === 0 && neuf.sim.maintenances === neuf.sim.polls.length,
    `règle du 29/10 : ${neuf.sim.polls.length} polls en 10 min (6 alarmes + celui de trop, une fois), aucun cycle ne cède à un poll, maintenance à chaque cycle`);
}
{
  // Une demande de l'écran (page publique Vinted au clic « Publier ») arrive pendant le poll : servie tout de suite.
  const p = poste();
  p.api.pollAndProcessJobs();
  let servieA = null;
  p.h.setTimeout(() => { p.api.withJobFlowLock("page-publique-vinted", () => p.api.attendre(900)).then(() => { servieA = p.h.now; }); }, 1000);
  await p.h.avancer(60_000);
  const e = ecarts(p.sim.polls);
  ok(p.sim.cedes === 1 && servieA != null && servieA - p.sim.polls[0] <= DUREE_POLL_MS + 1000,
    "une demande de l'écran : le cycle lui cède le verrou, elle est servie à la fin du poll (pas après la maintenance)");
  ok(p.sim.polls.length === 2 && e[0] >= 20_000 && e[0] <= 20_100 && p.sim.maintenances === 1,
    `puis UNE relance, 20 s après le début du poll (${e[0]} ms), qui fait la maintenance`);
}
{
  // L'écran redemande à chaque cycle : la maintenance ne cède jamais deux cycles de suite.
  const p = poste();
  const ecran = () => { p.api.withJobFlowLock("page-publique-vinted", () => p.api.attendre(300)); };
  const pendantChaquePoll = () => { ecran(); p.h.setTimeout(pendantChaquePoll, 1500); };
  p.alarme();
  p.h.setTimeout(pendantChaquePoll, 1000);
  const suite = [];
  const avant = p.sim.polls.length;
  for (let i = 0; i < 200; i++) { await p.h.avancer(3000); if (p.sim.dernier) { suite.push(p.sim.dernier); p.sim.dernier = null; } }
  const deuxDeSuite = suite.some((x, i) => i > 0 && x === "cede" && suite[i - 1] === "cede");
  ok(!deuxDeSuite && p.sim.maintenances >= 5, `une demande à chaque cycle : ${p.sim.polls.length - avant} polls en 10 min, jamais deux cessions de suite (${p.sim.maintenances} maintenances)`);
}
{
  // La même relecture avant redépôt servie `devant` à chaque poll (relevé pas encore jugé) : une relance, pas une boucle.
  const p = poste();
  p.sim.relectureDevant = "run-1";
  p.alarme();
  await p.h.avancer(10 * 60_000);
  const e = ecarts(p.sim.polls);
  // Une relance par alarme au plus (le cycle relancé la redemande pour la même raison : refusée) — 6 alarmes en 10 min.
  ok(p.sim.polls.length <= 12 && Math.min(...e) >= 20_000, `même relecture resservie : ${p.sim.polls.length} polls en 10 min (une relance par alarme au plus), jamais deux à moins de 20 s (min ${Math.min(...e)} ms)`);
  p.sim.relectureDevant = null;
}
{
  // « Synchroniser » (geste) : le poll qui emporte la synchro part 1,5 s après le cycle.
  const p = poste();
  p.sim.synchro = true;
  p.api.pollAndProcessJobs();
  await p.h.avancer(30_000);
  const e = ecarts(p.sim.polls);
  ok(p.sim.polls.length === 2 && e[0] === DUREE_POLL_MS + p.sim.dureeMaintenance + 1500, `un geste : relance 1,5 s après la fin du cycle (${e[0]} ms après son début)`);
}
{
  // Une relance armée (20 s) qu'un poll de l'alarme a devancée : elle ne part pas (aucun poll en double).
  const p = poste();
  p.api.pollAndProcessJobs();
  p.h.setTimeout(() => { p.api.withJobFlowLock("capture-vinted-item", () => p.api.attendre(500)); }, 1000);
  p.h.setTimeout(() => p.api.pollAndProcessJobs(), 10_000);   // l'alarme sonne avant la relance
  await p.h.avancer(60_000);
  ok(p.sim.polls.length === 2, `relance devancée par l'alarme : ${p.sim.polls.length} polls en 60 s (pas trois)`);
}

// ── 3. raisonsDeNePasRecharger : les recréations que le serveur retient ─────
console.log("\n3. (4.11) La mise à jour n'est plus refusée par une recréation que le serveur retient");
function bacMaj(h, repub) {
  const appels = [];
  const ctx = {
    console: { log() {}, warn() {}, error() {} }, Date: h.Date, Math, Number, String, Array, Set, Map, Promise, JSON, encodeURIComponent,
    republishSupprimes: new Map(),
    getValidSession: async () => ({ access_token: "jeton" }),
    restRequest: async (url) => {
      appels.push(url);
      if (url.startsWith("cross_post_jobs?status=eq.processing")) return [];
      if (url.includes("republish_step=eq.deleted")) return repub;
      if (url.startsWith("vinted_sync_runs")) return [];
      return [];
    },
  };
  vm.createContext(ctx);
  return vm.runInContext(`${declaration("retenuesDeletedServeur")}\n${declaration("RETENUES_DELETED_VALIDITE_MS")}\n${["noterRetenuesDeletedServeur", "retenueDeletedParLeServeur", "raisonsDeNePasRecharger"].map(extraire).join("\n")}
    ;({ noterRetenuesDeletedServeur, raisonsDeNePasRecharger })`, ctx);
}
{
  const h = horloge();
  const m = bacMaj(h, [{ id: "44169148-0000", status: "pending", nao: null }]);
  let r = await m.raisonsDeNePasRecharger();
  ok(r.length === 1 && /étape 'deleted'/.test(r[0]), "sans liste du serveur (worker neuf, serveur plus ancien) : refusée comme avant", JSON.stringify(r));
  m.noterRetenuesDeletedServeur(["44169148-0000"]);
  r = await m.raisonsDeNePasRecharger();
  ok(r.length === 0, "retenue par le serveur au dernier poll (2189c4d8, 44169148) : plus une raison de refuser", JSON.stringify(r));
  await h.avancer(11 * 60_000);
  r = await m.raisonsDeNePasRecharger();
  ok(r.length === 1, "liste de plus de 10 min (plus de poll) : elle refuse de nouveau");
  m.noterRetenuesDeletedServeur(undefined);
  ok((await m.raisonsDeNePasRecharger()).length === 1, "réponse sans le champ : rien n'est exclu");
  const m2 = bacMaj(h, [{ id: "a", status: "processing", nao: null }]);
  m2.noterRetenuesDeletedServeur(["a"]);
  ok((await m2.raisonsDeNePasRecharger()).length === 1, "une recréation EN COURS refuse toujours (même listée)");
  const m3 = bacMaj(h, [{ id: "a", status: "pending", nao: null }, { id: "b", status: "pending", nao: null }]);
  m3.noterRetenuesDeletedServeur(["a"]);
  r = await m3.raisonsDeNePasRecharger();
  ok(r.length === 1 && /^1 republication/.test(r[0]), "une retenue, une autre libre : seule la libre compte", JSON.stringify(r));
}

// ── 4. La trace « maj_extension_reportee » ───────────────────────────────────
console.log("\n4. (4.11) La trace d'une mise à jour reportée : une par heure au plus et par poste");
{
  const h = horloge();
  const posts = [];
  const stock = {};
  const ctx = {
    console: { log() {}, warn() {}, error() {} }, Date: h.Date, Math, Number, String, Array, JSON, Promise, Set, Map,
    FILLSELL_BUILD_ID: "2026-10-28T21:51:44Z+f567f2e",
    chrome: {
      storage: { local: { get: async (k) => ({ [k]: stock[k] }), set: async (o) => { Object.assign(stock, o); } } },
      runtime: { getManifest: () => ({ version: "0.6.152" }) },
    },
    getValidSession: async () => ({ access_token: "jeton" }),
    decodeJwtSub: () => "2189c4d8-d31f-4f79-ae04-0bef8dded385",
    restRequest: async (url, _t, init) => { posts.push({ url, corps: JSON.parse(init.body) }); return null; },
    lireMajEnAttente: async () => "0.6.153",
    raisonsDeNePasRecharger: async () => ["1 republication(s) à l'étape 'deleted' (annonce hors ligne, recréation non conclue)"],
    demarrerBattementPresence: () => () => {},
  };
  vm.createContext(ctx);
  const t = vm.runInContext(`${declaration("MAJ_REPORTEE_TRACE_KEY")}\n${["jobFlowTail", "jobFlowBusyLabel", "jobFlowWaiters", "attentesVerrouParLabel", "lecturesPrioritaires", "drainPrioritaireEnCours"].map(declaration).join("\n")}
    let travailEnCours = null;
    ${["tracerMajReportee", "withJobFlowLock", "drainerLecturesPrioritaires", "noterAttenteVerrou", "appliquerMajSiSansRisque"].map(extraire).join("\n")}
    ;({ appliquerMajSiSansRisque })`, ctx);
  await t.appliquerMajSiSansRisque("fin de cycle");
  await h.avancer(10);
  await t.appliquerMajSiSansRisque("fin de cycle");
  await h.avancer(10);
  ok(posts.length === 1 && posts[0].url === "usage_logs" && posts[0].corps.feature === "maj_extension_reportee",
    "mise à jour refusée deux fois de suite : UNE trace usage_logs « maj_extension_reportee »", JSON.stringify(posts.map((p) => p.corps.feature)));
  const md = posts[0]?.corps?.metadata ?? {};
  ok(md.version_visee === "0.6.153" && md.declencheur === "fin de cycle" && Array.isArray(md.raisons) && /'deleted'/.test(md.raisons[0]) && md.build && md.version === "0.6.152",
    "la trace dit la version visée, le déclencheur, les raisons en clair, le build et la version du poste");
  await h.avancer(61 * 60_000);
  await t.appliquerMajSiSansRisque("entre deux jobs");
  await h.avancer(10);
  ok(posts.length === 2, "une heure plus tard : une nouvelle trace");
}

// ── 5. Le câblage livré ───────────────────────────────────────────────────────
console.log("\n5. Le câblage livré (background.js, get-pending-jobs)");
{
  ok(/noterRetenuesDeletedServeur\(rep\.retenues_deleted\)/.test(BG), "le poll garde la liste `retenues_deleted` du serveur");
  ok(/if \(cederAuxDemandesEnAttente\(\)\) return;/.test(BG) && !/if \(jobFlowWaiters > 0 && !majPlanifiee\)/.test(BG), "la maintenance ne cède plus qu'aux demandes hors poll");
  ok(!/setTimeout\(\(\) => \{ pollAndProcessJobs\(\); \}, 1500\)/.test(BG) && /armerRelanceApresCycle\(\);/.test(BG), "plus aucune relance de poll inconditionnelle à 1,5 s");
  ok(!/repollApresCycle = true;/.test(BG), "plus aucun site ne pose la relance sans raison (demanderRepoll)");
  const gpj = readFileSync(join(RACINE, "supabase/functions/get-pending-jobs/index.ts"), "utf8").replace(/\r\n/g, "\n");
  ok(/retenues_deleted: \[\.\.\.retenuesDeleted\]/.test(gpj) && (gpj.match(/noterRetenuesDeleted\(out, (retenusV|retirerDeLaFile)\)/g) ?? []).length === 2,
    "get-pending-jobs rend les republications 'deleted' qu'il retient (dressing Vinted relu, vérification avant redépôt)");
}

console.log(`\n${rouges ? `✗ ${rouges} RATÉ(S)` : "✓ tout est vert"} — ${verts} vérifications`);
process.exit(rouges ? 1 : 0);
