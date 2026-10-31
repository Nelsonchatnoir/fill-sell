// ═══════════════════════════════════════════════════════════════════════════
// LOT F (31/10) — `npm run selftest:lot-f-3110`
// ═══════════════════════════════════════════════════════════════════════════
// Exécute le code LIVRÉ (leçon du 25/10 : un motif de texte ne prouve rien) :
//   1. background.js — l'extension se rétablit seule après une mise à jour : mise à jour constatée sans onInstalled
//      (cas Sébastien), poll relancé quand il ne part plus, rechargement propre d'un verrou figé — jamais pendant un
//      job, jamais sans la base, jamais plus de 2 fois en 6 h ; aucun geste sans session.
//   2. fillsell-auth.js — la page apprend pour QUEL compte l'extension travaille (meme oui/non), ou que son service
//      worker ne répond pas ; une copie coupée se tait.
//   3. extensionAutreCompte.js — « autre compte » seulement sur preuve ; un silence = « ordinateur qui ne répond pas »,
//      sans durée.
//   4. La pause : une seule vérité (etat-job = get-pending-jobs), « En pause à ta demande » partout ; les deux
//      recréations de Johan après sa pause relèvent bien de l'exception (annonce déjà retirée).
//   5. republication-cible.js — une republication sur un numéro périmé se clôt (déjà remise en ligne) ou attend,
//      jamais un retrait suivi d'un doublon.
//   6. Le moteur de rapprochement : une annonce remise en ligne sur la même plateforme (prix changé, photo ajoutée)
//      devient la question vers sa fiche, hors du stock — jamais une fiche neuve ; deux annonces en ligne ensemble
//      restent deux exemplaires (lots, « Annonce en double ? » inchangés).
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => readFileSync(join(RACINE, p), "utf8").replace(/\r\n/g, "\n");
const BG = lire("chrome-extension/background.js");
let verts = 0, rouges = 0;
const ok = (c, m, d = "") => { if (c) { verts++; console.log(`  ok   ${m}`); } else { rouges++; console.log(`  RATÉ ${m}${d ? `  ← ${d}` : ""}`); } };

function extraire(nom) {
  const re = new RegExp(`\\n((?:async )?function ${nom}\\()`);
  const m = re.exec(BG);
  if (!m) throw new Error(`fonction introuvable : ${nom}`);
  const debut = m.index + 1;
  const fin = BG.indexOf("\n}\n", debut);
  return BG.slice(debut, fin + 2);
}
const constante = (nom) => { const m = new RegExp(`\\nconst ${nom} = [^\\n]*\\n`).exec(BG); if (!m) throw new Error(`constante ${nom}`); return m[0]; };

// ── 1. background.js ───────────────────────────────────────────────────────
console.log("1. background.js — l'extension se rétablit seule après une mise à jour");
function bacExtension({ stockage = {}, session = { access_token: "t" }, raisons = [], verrou = null, travail = null, progresIlYaMin = 0, pollEnAttente = null, supprimes = 0, version = "0.6.162", build = "2026-10-31T10:00:00Z+abc1234" } = {}) {
  const store = JSON.parse(JSON.stringify(stockage));
  const journal = { polls: 0, alarmes: 0, recharge: 0, traces: [], fermees: 0 };
  const chrome = {
    storage: { local: {
      get: async (cles) => { const out = {}; for (const k of [].concat(cles)) if (k in store) out[k] = JSON.parse(JSON.stringify(store[k])); return out; },
      set: async (o) => { Object.assign(store, JSON.parse(JSON.stringify(o))); },
    } },
    runtime: { getManifest: () => ({ version }), reload: () => { journal.recharge++; } },
  };
  const prelude = [
    "MAJ_TRACE_KEY", "VERSION_VUE_KEY", "POLL_OK_KEY", "REDEMARRAGES_KEY", "POLL_MUET_MS", "VERROU_FIGE_MS", "REDEMARRAGES_MAX", "REDEMARRAGES_FENETRE_MS",
  ].map(constante).join("") + `
    const FILLSELL_BUILD_ID = ${JSON.stringify(build)};
    let dernierProgresFlux = Date.now() - ${progresIlYaMin} * 60000;
    let veillePollEnCours = false; let tracePlafondRedemarrageLe = 0;
    let jobFlowBusyLabel = ${JSON.stringify(verrou)}; let pollEnAttenteDuVerrou = ${pollEnAttente ? "Promise.resolve()" : "null"};
    let travailEnCours = ${JSON.stringify(travail)};
    const republishSupprimes = new Map(Array.from({ length: ${supprimes} }, (_, i) => [String(i), {}]));
    async function getValidSession() { return ${JSON.stringify(session)}; }
    async function raisonsDeNePasRecharger() { return ${JSON.stringify(raisons)}; }
    async function fermerFenetresAvantMaj() { journal.fermees++; }
    async function planifierAlarmes() { journal.alarmes++; }
    function pollAndProcessJobs() { journal.polls++; }
    async function tracerRedemarrage(motif, detail) { journal.traces.push({ motif, ...detail }); }
  `;
  const noms = ["constaterVersionAuDemarrage", "msDepuisDernierPollOk", "redemarrerProprement", "veillerPoll"];
  const ctx = { console: { log() {}, warn() {}, error() {} }, JSON, Date, Math, Number, String, Boolean, Array, Object, Set, Map, Promise, chrome, journal };
  vm.createContext(ctx);
  const f = vm.runInContext(`${prelude}\n${noms.map(extraire).join("\n")}\n;({ ${noms.join(", ")} })`, ctx);
  return { f, store, journal };
}
const ilYa = (min) => new Date(Date.now() - min * 60000).toISOString();
{
  // Sébastien : la 0.6.161 tourne, Chrome installe la 0.6.162 sans onInstalled.
  const b = bacExtension({ stockage: { fillsell_version_vue: { version: "0.6.161", build: "2026-10-30T22:19:48Z+162998e" } } });
  const r = await b.f.constaterVersionAuDemarrage();
  const t = b.store.fillsell_maj_trace;
  ok(r === true, "version changée depuis le dernier démarrage : mise à jour constatée sans runtime.onInstalled");
  ok(t?.installee_le && t.ancienne_version === "0.6.161" && t.declencheur === "chrome" && t.constatee_au_demarrage === true,
    "la trace « maj_extension » est complète (ancienne version, installée le) : elle part au premier envoi", JSON.stringify(t));
  ok(b.store.fillsell_version_vue?.version === "0.6.162", "la version vue est tenue à jour");
  const r2 = await b.f.constaterVersionAuDemarrage();
  ok(r2 === false, "redémarrage suivant sur la même version : rien de constaté (pas de seconde trace)");
}
{
  // Première 0.6.162 après une 0.6.161 qui a laissé sa trace de rechargement (sans « installee_le »).
  const b = bacExtension({ stockage: { fillsell_maj_trace: { declencheur: "rechargement:onUpdateAvailable", ancienne_version: "0.6.161", version_visee: "0.6.162", ancien_build: "x" } } });
  ok(await b.f.constaterVersionAuDemarrage() === true, "trace de rechargement laissée par l'ancienne version : la mise à jour est constatée");
  ok(b.store.fillsell_maj_trace.installee_le && b.store.fillsell_maj_trace.declencheur === "rechargement:onUpdateAvailable", "le déclencheur d'origine est gardé, « installee_le » posé");
}
{
  const b = bacExtension({});
  ok(await b.f.constaterVersionAuDemarrage() === false && !b.store.fillsell_maj_trace, "installation neuve (rien en mémoire) : aucune trace inventée");
}
{
  const b = bacExtension({ stockage: { fillsell_dernier_poll_ok: ilYa(30) } });
  await b.f.veillerPoll("alarme");
  ok(b.journal.polls === 1 && b.journal.alarmes === 1, "aucun poll réussi depuis 30 min, personne ne tient le verrou : alarmes reposées, poll relancé");
  ok(b.journal.recharge === 0, "… sans rechargement");
}
{
  const b = bacExtension({ stockage: { fillsell_dernier_poll_ok: ilYa(2) } });
  await b.f.veillerPoll("alarme");
  ok(b.journal.polls === 0 && b.journal.recharge === 0, "poll réussi il y a 2 min : la veille ne fait rien");
}
{
  const b = bacExtension({ stockage: { fillsell_dernier_poll_ok: ilYa(55) }, verrou: "poll", progresIlYaMin: 50, pollEnAttente: true });
  await b.f.veillerPoll("alarme");
  ok(b.journal.recharge === 1 && b.journal.fermees === 1, "verrou tenu 50 min sans job ni progrès, base sans job en vol : rechargement propre");
  ok((b.store.fillsell_redemarrages_auto ?? []).length === 1 && b.journal.traces[0]?.motif === "verrou_fige", "le redémarrage est compté et journalisé (extension_redemarrage_auto)");
}
{
  const b = bacExtension({ stockage: { fillsell_dernier_poll_ok: ilYa(55) }, verrou: "poll", progresIlYaMin: 50, travail: { job: "j1", plateforme: "leboncoin" } });
  await b.f.veillerPoll("alarme");
  ok(b.journal.recharge === 0, "un job commencé tient le verrou : JAMAIS de rechargement au milieu d'un job");
}
{
  const b = bacExtension({ stockage: { fillsell_dernier_poll_ok: ilYa(55) }, verrou: "poll", progresIlYaMin: 50, supprimes: 1 });
  await b.f.veillerPoll("alarme");
  ok(b.journal.recharge === 0, "une republication supprimée dont la recréation n'est pas conclue : jamais de rechargement");
}
{
  const b = bacExtension({ stockage: { fillsell_dernier_poll_ok: ilYa(55) }, verrou: "poll", progresIlYaMin: 50, raisons: ["1 job(s) en 'processing' (leboncoin/republish)"] });
  await b.f.veillerPoll("alarme");
  ok(b.journal.recharge === 0, "la base dit un job en vol (raisonsDeNePasRecharger) : rechargement refusé");
}
{
  const b = bacExtension({ stockage: { fillsell_dernier_poll_ok: ilYa(55), fillsell_redemarrages_auto: [ilYa(60), ilYa(200)] }, verrou: "poll", progresIlYaMin: 50 });
  await b.f.veillerPoll("alarme");
  ok(b.journal.recharge === 0 && b.journal.traces[0]?.motif === "plafond_atteint", "plafond anti-boucle : 2 redémarrages en 6 h, plus aucun (et le plafond est journalisé)");
}
{
  const b = bacExtension({ stockage: { fillsell_dernier_poll_ok: ilYa(55) }, verrou: "poll", progresIlYaMin: 10 });
  await b.f.veillerPoll("alarme");
  ok(b.journal.recharge === 0 && b.journal.polls === 0, "verrou tenu avec un progrès récent (long cycle qui travaille) : on attend");
}
{
  const b = bacExtension({ stockage: { fillsell_dernier_poll_ok: ilYa(500) }, session: null });
  await b.f.veillerPoll("alarme");
  ok(b.journal.polls === 0 && b.journal.recharge === 0, "sans session FillSell : la veille ne fait rien");
}
// Le câblage : la veille et le constat de version tournent au démarrage du worker, à chaque alarme, à chaque appel de la page.
ok(/Promise\.resolve\(\)\.then\(async \(\) => \{\n\s+await planifierAlarmes\(\);\n\s+const majConstatee = await constaterVersionAuDemarrage\(\)/.test(BG),
  "au démarrage du worker (après l'évaluation du script) : alarmes reposées puis version constatée");
ok(/if \(alarm\.name === ALARM_NAME\) \{[\s\S]{0,300}veillerPoll\("alarme"\)/.test(BG), "chaque alarme de poll passe par la veille");
ok(/FILLSELL_ETAT_COMPTE[\s\S]{0,1500}veillerPoll\("page"\)/.test(BG), "un appel de la page réveille la veille");
ok(/chrome\.storage\.local\.set\(\{ \[POLL_OK_KEY\]: new Date\(\)\.toISOString\(\) \}\)/.test(BG), "le dernier poll réussi est noté (survit aux redémarrages du worker)");

// ── 2. fillsell-auth.js ─────────────────────────────────────────────────────
console.log("2. fillsell-auth.js — la page apprend pour quel compte l'extension travaille");
const SCRIPT = lire("chrome-extension/content-scripts/fillsell-auth.js");
const jwt = (sub) => `x.${Buffer.from(JSON.stringify({ sub })).toString("base64url")}.y`;
function page({ vivant = true, repondre = true, meme = true } = {}) {
  const ecouteurs = [], recus = [], envoyes = [], minuteurs = [];
  const fenetre = {
    location: { origin: "https://fillsell.app" },
    addEventListener: (t, f) => { if (t === "message") ecouteurs.push(f); },
    removeEventListener: (t, f) => { const i = ecouteurs.indexOf(f); if (i >= 0) ecouteurs.splice(i, 1); },
    postMessage: (data) => { recus.push(data); for (const f of [...ecouteurs]) f({ source: fenetre, data }); },
  };
  const runtime = {
    get id() { return vivant ? "ext" : undefined; },
    sendMessage: (msg, cb) => {
      envoyes.push(msg);
      if (msg.type === "FILLSELL_ETAT_COMPTE") { if (repondre) cb?.({ ok: true, meme, connecte: true, poll_ok_le: null, version: "0.6.162" }); return; }
      cb?.({ ok: true });
    },
    getManifest: () => ({ version: "0.6.162" }), lastError: null,
  };
  const session = JSON.stringify({ access_token: jwt("compte-page") });
  const ctx = { window: fenetre, localStorage: { length: 1, key: () => "sb-ref-auth-token", getItem: () => session }, chrome: { runtime },
    console: { log() {} }, atob: (s) => Buffer.from(s, "base64").toString("binary"), setTimeout: (f, ms) => { minuteurs.push({ f, ms }); return minuteurs.length; }, clearTimeout: () => {} };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  return { recus, envoyes, minuteurs, jouer: () => vm.runInContext(SCRIPT, ctx), ping: () => fenetre.postMessage({ __fillsellPing: true }) };
}
{
  const p = page({ meme: false });
  p.jouer();
  const demande = p.envoyes.find((m) => m.type === "FILLSELL_ETAT_COMPTE");
  ok(demande?.sub === "compte-page", "le pont demande au service worker s'il travaille pour le compte connecté sur la page");
  ok(p.recus.some((d) => d.__fillsellCompte?.vivant === true && d.__fillsellCompte.meme === false), "extension sur un autre compte : la page reçoit la PREUVE (meme: false)");
}
{
  const p = page({ meme: true });
  p.jouer();
  ok(p.recus.some((d) => d.__fillsellCompte?.meme === true), "même compte : meme: true");
}
{
  const p = page({ repondre: false });
  p.jouer();
  ok(!p.recus.some((d) => d.__fillsellCompte), "service worker muet : aucune réponse tout de suite");
  for (const m of p.minuteurs.filter((x) => x.ms === 4000)) m.f();
  ok(p.recus.some((d) => d.__fillsellCompte?.vivant === false && !("meme" in d.__fillsellCompte)), "au bout de 4 s : « service worker muet » (vivant: false), jamais « autre compte »");
}
{
  const p = page({ vivant: false });
  p.jouer();
  ok(!p.recus.some((d) => d.__fillsellCompte || d.__fillsellExt), "copie coupée de son extension : elle se tait (ni présence, ni compte)");
}
{
  const p = page({ meme: true });
  p.jouer();
  const n = p.envoyes.filter((m) => m.type === "FILLSELL_ETAT_COMPTE").length;
  p.ping();
  ok(p.envoyes.filter((m) => m.type === "FILLSELL_ETAT_COMPTE").length === n + 1, "un ping de la page redemande le compte (et réveille la veille du poll)");
}

// ── 3. extensionAutreCompte.js ──────────────────────────────────────────────
console.log("3. « autre compte » seulement sur preuve ; un silence = ordinateur qui ne répond pas");
const EAC = await import("../src/utils/extensionAutreCompte.js");
ok(EAC.etatExtensionDuNavigateur({ compte: null, silenceConfirme: true }) === "muette", "silence sans preuve (Johan, Sébastien, extensions ≤ 0.6.161) : « muette », jamais « autre compte »");
ok(EAC.etatExtensionDuNavigateur({ compte: { vivant: false }, silenceConfirme: true }) === "muette", "service worker muet + silence : « muette »");
ok(EAC.etatExtensionDuNavigateur({ compte: { vivant: true, meme: true }, silenceConfirme: true }) === "muette", "même compte mais aucun passage : « muette »");
ok(EAC.etatExtensionDuNavigateur({ compte: { vivant: true, meme: false }, silenceConfirme: false }) === "autre_compte", "l'extension DIT travailler pour un autre compte : « autre compte » (le vrai cas reste détecté)");
ok(EAC.etatExtensionDuNavigateur({ compte: { vivant: true, meme: false }, silenceConfirme: true }) === "autre_compte", "… même pendant un silence");
ok(EAC.etatExtensionDuNavigateur({ compte: { vivant: true, meme: true }, silenceConfirme: false }) === null, "même compte, présence fraîche : rien à dire");
const tm = EAC.texteExtensionMuette("fr");
ok(/ne répond pas/.test(tm.titre) && !/\d/.test(tm.titre + tm.texte) && !/\b(min|minutes?|heures?|jours?)\b/i.test(tm.texte), "« Ton ordinateur ne répond pas » : sans durée affichée");
const SRC_STOCK = lire("src/tabs/StockTab.jsx");
ok(/else if \(extensionMuette\) \{[\s\S]{0,300}cle: 'ext-muette'[\s\S]{0,80}ton: 'regler'/.test(SRC_STOCK), "l'état « muette » va dans « À régler » (ton regler), pas en bandeau");

// ── 4. La pause ────────────────────────────────────────────────────────────
console.log("4. la pause : une seule vérité, « En pause à ta demande » partout");
const FP = await import("../supabase/functions/_shared/file-pause.js");
const EJ = await import("../supabase/functions/_shared/etat-job.js");
const FDJ = await import("../src/utils/fileDesJobs.js");
const BJ = await import("../src/utils/barresJobs.js");
const repub = (pf = {}, extra = {}) => ({ id: "r1", platform: "leboncoin", action: "republish", status: "pending", error: "En file : ta republication passera à son tour, une à la fois. Ton annonce est toujours en ligne.", platform_fields: { republish_step: "captured", ...pf }, created_at: "2026-10-22T13:00:00Z", ...extra });
{
  const v = EJ.etatJob(repub(), { filePause: true });
  ok(v.etat === "en_pause" && v.motif === "file_en_pause", "file en pause : la republication en file (texte « En file » en base) se dit « en pause à ta demande »");
  const s = FDJ.situationJob(repub(), { filePause: true, lang: "fr" });
  ok(/^En pause à ta demande/.test(s.raison), "la ligne du job dit « En pause à ta demande »", s.raison);
  const pi = BJ.pisteJob(repub(), { filePause: true, lang: "fr" });
  ok(pi.etat === "pause" && /En pause à ta demande/.test(pi.phrasePause ?? ""), "la barre de progression aussi");
  ok(/^En pause à ta demande/.test(FP.messageFileEnPause(73, "fr")) && /attendent ta reprise/.test(FP.messageFileEnPause(73, "fr")), "l'en-tête de la file et « À régler » : « En pause à ta demande : 73 publications attendent ta reprise »");
  const f = FDJ.lireFile([repub(), repub({}, { id: "r2" }), { ...repub({ deleted_at: "2026-10-26T14:49:52Z", republish_step: "deleted" }, { id: "r3" }) }], { filePause: true, lang: "fr" });
  ok(f.compteurs.enPauseDemande === 2 && /2 en pause à ta demande/.test(FDJ.phraseCompteurs(f.compteurs, "fr")), "les compteurs : « 2 en pause à ta demande »", FDJ.phraseCompteurs(f.compteurs, "fr"));
  ok(/^En pause à ta demande/.test(FP.MESSAGE_REPUBLICATION_EN_PAUSE), "le texte que le serveur écrit pendant une pause : « En pause à ta demande … »");
}
{
  // L'exception : une republication dont l'annonce est DÉJÀ retirée va au bout (Johan 7ff873c5 et 098cab75).
  const j7ff = repub({ republish_step: "deleted", deleted_at: "2026-10-26T14:49:52.290Z", deleted_at_serveur: "2026-10-26T14:49:52.290Z" }, { id: "7ff873c5" });
  const j098 = repub({ republish_step: "deleted", deleted_at: "2026-10-27T09:41:50.666Z" }, { id: "098cab75" });
  const pause = Date.parse("2026-10-30T13:59:02.700803+00:00");
  ok(!FP.jobRetenuParPause(j7ff) && !FP.jobRetenuParPause(j098), "7ff873c5 et 098cab75 : annonce retirée → jamais retenues par la pause (règle du serveur)");
  ok(Date.parse(j7ff.platform_fields.deleted_at) < pause && Date.parse(j098.platform_fields.deleted_at) < pause, "… et retirées le 26/10 et le 27/10, AVANT la pause du 30/10 14:59 : l'exception admise, rien d'autre n'est passé");
  ok(FP.jobRetenuParPause(repub()) && FP.jobRetenuParPause({ ...repub(), action: "publish", platform_fields: {} }), "une republication en file (annonce intacte) et une publication restent en pause");
  ok(!FP.jobRetenuParPause({ ...repub(), action: "delete" }), "un retrait n'est jamais en pause");
  // Même règle à l'écran et au serveur, y compris la trace écrite d'une suppression envoyée.
  const trace = repub({ republish_step: "captured" }, { error: "Suppression envoyée à Leboncoin, attente de la preuve" });
  ok(FP.jobRetenuParPause(trace) === false && EJ.etatJob(trace, { filePause: true }).motif !== "file_en_pause", "suppression envoyée (trace écrite) : servie par le serveur, jamais dite « en pause » à l'écran");
}
const GPJ = lire("supabase/functions/get-pending-jobs/index.ts");
ok(/const msgL = filePause && jobRetenuParPause\(/.test(GPJ) && /update\(\{ error: msgL, platform_fields: pfW \}\)/.test(GPJ), "serveur : une retenue levée pendant la pause écrit « En pause à ta demande », plus « En file »");
ok(/eq\("error", MESSAGE_REPUBLICATION_EN_PAUSE\)/.test(GPJ), "serveur : à la reprise, ces lignes repassent « En file » (24 h après la reprise, lignes concernées seulement)");
ok(GPJ.indexOf("let filePause = false;") < GPJ.indexOf("UNE REPUBLICATION VISE L'ANNONCE EN LIGNE ACTUELLE")
  && GPJ.indexOf("UNE REPUBLICATION VISE L'ANNONCE EN LIGNE ACTUELLE") < GPJ.indexOf("PAS DE RETRAIT SANS RECRÉATION GARANTIE (02/10 soir"),
  "serveur : la garde de la cible tourne APRÈS la pause (une file en pause n'est jamais touchée) et AVANT l'étape qui retire");
const POP = lire("chrome-extension/popup.js");
ok(/`En pause à ta demande · \$\{n\} en attente/.test(POP), "le popup de l'extension dit « En pause à ta demande »");
ok(/'Ta file est en pause à ta demande'/.test(SRC_STOCK), "« À régler » : « Ta file est en pause à ta demande »");

// ── 5. republication-cible.js ───────────────────────────────────────────────
console.log("5. une republication vise l'annonce en ligne actuelle, jamais un numéro périmé");
const RC = await import("../supabase/functions/_shared/republication-cible.js");
const releve = { id: "aa8f2a83", started_at: "2026-10-31T06:59:14Z" };
const jobJ = { id: "ee32823f", platform: "leboncoin", action: "republish", status: "pending", inventaire_id: 1792681809620, platform_listing_id: "3293222567", platform_fields: { republish_step: "captured" } };
{
  const v = RC.jugerCibleRepublication({ job: jobJ, releve, cible: { listing_id: "3293222567", vu_le: "2026-10-26T18:40:11Z" },
    fiche: [{ listing_id: "3293222567", vu_le: "2026-10-26T18:40:11Z" }, { listing_id: "3298253160", vu_le: "2026-10-31T06:59:15Z", publiee_le: "2026-10-30T14:10:29Z" }] });
  ok(v.verdict === "sans_objet" && v.successeur === "3298253160", "Johan : 3293222567 absente du dernier relevé, 3298253160 vue sur la fiche → « déjà remise en ligne », rien retiré ni recréé", JSON.stringify(v));
  ok(/déjà remise en ligne \(annonce n° 3298253160\)/.test(RC.messageRepublicationSansObjet("leboncoin", "3298253160")) && /Rien n'a été retiré ni recréé/.test(RC.messageRepublicationSansObjet("leboncoin", "x")), "le texte de la clôture le dit en clair");
}
{
  const v2 = RC.jugerCibleRepublication({ job: jobJ, releve, cible: { listing_id: "3293222567", vu_le: "2026-10-26T18:40:11Z" },
    fiche: [{ listing_id: "3298253160", vu_le: "2026-10-31T06:59:15Z" }, { listing_id: "3298299999", vu_le: "2026-10-31T06:59:15Z" }] });
  ok(v2.verdict === "cible_absente" && v2.motif === "plusieurs_annonces_en_ligne", "deux annonces de la fiche en ligne (deux exemplaires) : jamais « sans objet » sur un doute, la republication attend");
  const v = RC.jugerCibleRepublication({ job: jobJ, releve, cible: { listing_id: "3293222567", vu_le: "2026-10-26T18:40:11Z" }, fiche: [] });
  ok(v.verdict === "cible_absente", "absente sans annonce plus récente sur la fiche : RETENUE avant tout retrait (jamais recréée à l'aveugle)");
  ok(EJ.etatJob({ ...jobJ, platform_fields: { republish_step: "captured", cible_absente_releve: { cible: "3293222567" } } }, {}).motif === "releve", "l'écran : « En pause, rien n'a été retiré : FillSell attend le relevé »");
}
{
  const v = RC.jugerCibleRepublication({ job: { ...jobJ, platform: "beebs" }, releve, cible: { listing_id: "3293222567", vu_le: "2026-10-26T18:40:11Z" }, fiche: [] });
  ok(v.verdict === "servir", "Beebs : jamais retenue sur une absence (sa modération cache des annonces un temps)");
}
ok(RC.jugerCibleRepublication({ job: jobJ, releve, cible: { listing_id: "3293222567", vu_le: "2026-10-31T06:59:15Z" }, fiche: [] }).verdict === "servir", "cible vue au dernier relevé : la republication part comme avant");
ok(RC.jugerCibleRepublication({ job: jobJ, releve, cible: null, fiche: [], publieeLe: "2026-10-31T07:30:00Z" }).verdict === "servir", "cible publiée APRÈS le relevé (pas encore relevée) : la republication part");
ok(RC.jugerCibleRepublication({ job: jobJ, releve: null, cible: null, fiche: [] }).verdict === "servir", "aucun relevé probant : la republication part (rien n'est conclu)");
ok(RC.jugerCibleRepublication({ job: { ...jobJ, platform_fields: { republish_step: "deleted", deleted_at: "2026-10-31T07:00:00Z" } }, releve, cible: null, fiche: [{ listing_id: "9", vu_le: "2026-10-31T07:00:00Z" }] }).verdict === "servir",
  "republication engagée (annonce déjà retirée) : jamais jugée ici, elle va au bout");
ok(RC.jugerCibleRepublication({ job: { ...jobJ, platform: "vinted" }, releve, cible: null, fiche: [] }).verdict === "servir", "Vinted : hors de cette règle (la remise en ligne Vinted a la sienne)");
{
  const fini = { ...jobJ, status: "cancelled", platform_fields: { republish_step: "captured", republication_sans_objet: { successeur: "3298253160" } } };
  ok(EJ.etatJob(fini, {}).etat === "fait" && EJ.etatJob(fini, {}).motif === "deja_en_ligne", "la republication close « sans objet » est FAITE (jamais « arrêtée »)");
  const pi = BJ.pisteJob(fini, { lang: "fr" });
  ok(pi.etat === "termine" && /Déjà remise en ligne sur Leboncoin/.test(pi.phraseFin ?? ""), "la barre : « Déjà remise en ligne sur Leboncoin : rien retiré ni recréé »");
  ok(/last\.status === 'cancelled' && last\.platform_fields\?\.republication_sans_objet\) return false/.test(SRC_STOCK), "le filtre « republications à relancer » ne la propose pas");
}

// ── 6. Le moteur de rapprochement ───────────────────────────────────────────
console.log("6. une annonce remise en ligne sur la même plateforme : la question, jamais une fiche neuve");
const M = await import("../supabase/functions/_shared/rapprochement/moteur.js");
const graine = (s) => { let x = s >>> 0; return () => (x = (Math.imul(x ^ (x >>> 15), 2246822519) + 0x9e3779b9) >>> 0); };
const alea = graine(31102026);
const EMPREINTES = new Map();
const empreinte = (u) => { if (!EMPREINTES.has(u)) EMPREINTES.set(u, { u, lectures: [{ k: "plein", d: [alea(), alea()], p: [alea(), alea()] }] }); return EMPREINTES.get(u); };
const photosDe = (urls) => (urls ?? []).map(empreinte);
const P = ["p1", "p2", "p3", "p4", "p5"].map((x) => `https://img.leboncoin.fr/${x}.jpg`);
const P6 = "https://img.leboncoin.fr/p6.jpg";
function compte({ runNouvelle = "R3", runAncienne = "R1", avecImport = false, couvertureAjoutee = true } = {}) {
  const fiches = [{ id: "1792681809620", titre: "Sweatshirt Pull & Bear taupe taille M", prix: 5, statut: "stock", origine: "manuel", photos: P, created_at: "2026-10-20T10:00:00Z", quantite: 1 }];
  const annonces = [
    { id: "a-ancienne", platform: "leboncoin", listing_id: "3293222567", titre: "Sweatshirt Pull & Bear taupe taille M", prix: 5, photos: P, desc_h: "d1", inventaire_id: "1792681809620", source: "job", run_id: runAncienne, quantite: 1 },
    { id: "a-nouvelle", platform: "leboncoin", listing_id: "3298253160", titre: "Sweatshirt Pull & Bear taupe taille M", prix: 3, photos: couvertureAjoutee ? [P6, ...P] : P, desc_h: "d1", inventaire_id: null, source: null, run_id: runNouvelle, quantite: 1 },
  ];
  if (avecImport) {
    fiches.push({ id: "1793354281854", titre: "Sweatshirt Pull & Bear taupe taille M", prix: 5, statut: "stock", origine: "releve_leboncoin", photos: [], created_at: "2026-10-30T09:58:01Z", quantite: 1 });
    annonces.push({ id: "a-2910", platform: "leboncoin", listing_id: "3297738346", titre: "Sweatshirt Pull & Bear taupe taille M", prix: 5, photos: couvertureAjoutee ? [P6, ...P] : P, desc_h: "d1", inventaire_id: "1793354281854", source: "automatique", run_id: "R2", quantite: 1 });
  }
  return { fiches, annonces, fusions: [], doublons: [] };
}
function passer(donnees, mode = "normal") {
  const N = M.construireNoeuds(donnees, photosDe);
  const R = M.rapprocher(N, { forces: M.forcesDe(donnees) });
  return { R, plan: M.planifier(donnees, N, R, { mode }) };
}
{
  const { R, plan } = passer(compte());
  const d = R.dec.get("Aa-nouvelle");
  ok(d?.decision === "a_verifier" && d.succession === true, "Johan, prix 5 → 3 € et une photo ajoutée, l'ancienne absente du relevé : « à vérifier », plus « nouveau »", JSON.stringify({ decision: d?.decision }));
  ok(!plan.some((x) => x.type === "creer"), "aucune fiche créée dans le stock pour ce doute (règle du 07/10)");
  const q = plan.find((x) => x.type === "a_verifier");
  ok(q?.candidat?.annonce === "a-ancienne" && q.motif === "remise_en_ligne_meme_plateforme" && q.preuves?.avant_stock === true,
    "la question vise la fiche de l'ancienne annonce, hors du stock (avant_stock)", JSON.stringify(q?.candidat));
}
{
  const { R, plan } = passer(compte({ avecImport: true }));
  const q = plan.find((x) => x.type === "a_verifier" && x.annonces.includes("a-nouvelle"));
  ok(q?.candidat?.annonce === "a-ancienne", "deux annonces plus anciennes (fiche d'origine, import du 30/10 10:58) : la question vise la fiche d'ORIGINE");
  ok(!plan.some((x) => x.type === "creer"), "… et rien n'est créé (plus de « vendeur de lots » pour trois annonces successives)");
  void R;
}
{
  // Deux annonces vues par le MÊME relevé : deux exemplaires en ligne ensemble — inchangé (« Annonce en double ? »).
  const donnees = compte({ runNouvelle: "R1", runAncienne: "R1", couvertureAjoutee: false });
  const { R, plan } = passer(donnees);
  ok(R.dec.get("Aa-nouvelle")?.decision !== "a_verifier" || !R.dec.get("Aa-nouvelle")?.succession, "en ligne ensemble (même relevé) : pas de succession");
  ok(plan.some((x) => x.type === "annonce_en_double"), "… la question « Annonce en double ? » reste posée, comme avant");
}
{
  // Trois annonces en ligne ensemble sur la même photo : un vendeur de lots — inchangé (rien de posé).
  const d = compte({ runNouvelle: "R1", runAncienne: "R1", avecImport: true, couvertureAjoutee: false });
  d.annonces.find((a) => a.id === "a-2910").run_id = "R1";
  const { R, plan } = passer(d);
  ok(R.dec.get("Aa-nouvelle")?.succession !== true && !plan.some((x) => x.type === "annonce_en_double"), "trois annonces en ligne ensemble : la règle des lots est intacte");
}
{
  // Republication v23 (tout identique) : rattachée comme avant.
  const d = compte({ runNouvelle: "R3", runAncienne: "R1" });
  const n = d.annonces.find((a) => a.id === "a-nouvelle"); n.prix = 5; n.photos = P;
  const { plan } = passer(d);
  ok(plan.some((x) => x.type === "attacher" && x.annonce === "a-nouvelle" && x.motif === "republication"), "republication identique (v23) : rattachée automatiquement, comme avant");
}

console.log(`\n${rouges ? "✗" : "✓"} lot F : ${verts} vérification(s), ${rouges} rouge(s)`);
process.exit(rouges ? 1 : 0);
