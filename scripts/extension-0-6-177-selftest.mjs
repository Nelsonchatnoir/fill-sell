// ═══════════════════════════════════════════════════════════════════════════
// SELFTEST — EXTENSION 0.6.177 (lot du 07/11/2026, enquêtes du jour)
// ═══════════════════════════════════════════════════════════════════════════
//   npm run selftest:extension-0-6-177
// Le CODE LIVRÉ est extrait de chrome-extension/ et EXÉCUTÉ (jamais une copie) :
//   1. Leboncoin (Louis) : les statuts du relevé comptés par annonce UNIQUE
//      (5 pages, 10 de chevauchement : « active 400 », plus « active 440 ») ;
//   2. borne de remplissage (Ciddjy) : borne adaptative [10, 25] min ; à la borne,
//      le background prévient la page (« abandon ») AVANT de rendre l'échec, avec
//      la vraie dernière phase ; la page (beebs.js, vinted.js, leboncoin.js) ne
//      clique plus rien — port branché de bout en bout sur le vrai écouteur ;
//   3. Beebs : phases marquées et relayées (FILLSELL_FILL_STEP) dans l'ordre ;
//   4. pré-vol trop lent : rien n'est retiré, texte exact, étape inchangée ;
//   5. Vinted (ayadi007) : rayon « neuf seulement » = attente de la personne,
//      message inchangé au caractère près (comparé à HEAD) ;
//   6. Vinted : dimensions du colis jamais demandées, message exact ;
//   7. Vinted (Marta MELE) : couleur aux identifiants connus posée au POST si la
//      page n'en a posé aucune, jamais par-dessus ; relue après fermeture ; une
//      couleur vide d'une republication arrête AVANT le retrait ;
//   8. Vinted (linda.sidhoum) : référentiel relu 2 fois sur accroc réseau / 5xx ;
//   9. version 0.6.177.
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { execFileSync } from "node:child_process";
import { extraireFonctionJs } from "./lib/extraire-fonction-js.mjs";

const lire = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const bg = lire("chrome-extension/background.js");
const beebs = lire("chrome-extension/content-scripts/beebs.js");
const vt = lire("chrome-extension/content-scripts/vinted.js");
const lbc = lire("chrome-extension/content-scripts/leboncoin.js");
const manifest = JSON.parse(lire("chrome-extension/manifest.json"));

let n = 0;
const log = console.log;
const ok = (m) => { n++; log(`  ✓ ${m}`); };
const tranche = (src, debut, fin) => {
  const i = src.indexOf(debut);
  const j = src.indexOf(fin, i + debut.length);
  assert.ok(i >= 0 && j > i, `bloc introuvable : ${debut.slice(0, 60)}`);
  return src.slice(i, j);
};
const tick = () => new Promise((r) => setImmediate(r));
const ticks = async (k = 6) => { for (let i = 0; i < k; i++) await tick(); };

// ── 1. LEBONCOIN : STATUTS COMPTÉS PAR ANNONCE UNIQUE ─────────────────────────
log("1. Leboncoin — relevé « Mes annonces » par l'API (Louis, 5 pages)");
{
  const corps = tranche(bg, "async (perPage, pagesMax) => {", "}, [LBC_API_PAGE, LBC_API_PAGES_MAX]);") + "}";
  const perPage = Number(bg.match(/^const LBC_API_PAGE = (\d+);/m)?.[1]);
  const pagesMax = Number(bg.match(/^const LBC_API_PAGES_MAX = (\d+);/m)?.[1]);
  assert.equal(perPage, 100);
  const total = 400;
  const appels = [];
  const charge = Buffer.from(JSON.stringify({ account_id: "7788", exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64").replace(/=+$/, "");
  const ctx = vm.createContext({
    localStorage: { getItem: (k) => (k === "luat" ? `x.${charge}.y` : null) },
    document: { cookie: "lbc_user_id=7788; cnfdVisitorId=abc" },
    atob: (s) => Buffer.from(s, "base64").toString("binary"),
    btoa: (s) => Buffer.from(s, "binary").toString("base64"),
    setTimeout: (fn) => { fn(); return 0; },
    Intl, Date, JSON, Math, Number, String, Array, Object, Map, Promise,
    fetch: async (url, init) => {
      const b = JSON.parse(init.body);
      appels.push(b.offset);
      const ads = [];
      for (let i = b.offset; i < Math.min(total, b.offset + b.limit); i++) {
        ads.push({ list_id: 3000000000 + i, status: i % 50 === 7 ? "pending_review" : "active", subject: `Annonce ${i}`, price_cents: 1000, attributes: [] });
      }
      return { status: 200, json: async () => ({ ads, total, account_stats: { active_ads: 392 } }) };
    },
  });
  const fn = vm.runInContext(`(${corps})`, ctx);
  const r = await fn(perPage, pagesMax);
  assert.deepEqual(appels, [0, 90, 180, 270, 360], "pages avec 10 annonces de chevauchement");
  assert.equal(r.pages, 5);
  assert.equal(r.annonces.length, 400);
  const somme = Object.values(r.statuts).reduce((a, b) => a + b, 0);
  assert.equal(somme, 400, `statuts comptés par annonce unique (${JSON.stringify(r.statuts)})`);
  assert.equal(r.statuts.active, 392);
  assert.equal(r.statuts.pending_review, 8);
  assert.equal(r.enLigne, 392);
  ok(`5 pages, 440 occurrences, 400 annonces : statuts ${JSON.stringify(r.statuts)} (somme 400, plus 440)`);
}

// ── 2. BORNE DE REMPLISSAGE : BACKGROUND ───────────────────────────────────────
log("2. Borne de remplissage — background (borne adaptative, « abandon », dernière phase)");
const blocPort = tranche(bg, "// ── PORT DE REMPLISSAGE (2026-09-17) — début du bloc testé par le harnais ──", "// ── FIN PORT DE REMPLISSAGE ────");
function chargerBackground({ keepalive = true } = {}) {
  const minuteurs = new Map(); let seq = 0;
  const ctx = vm.createContext({
    setTimeout: (fn, ms) => { const id = ++seq; minuteurs.set(id, { fn, ms }); return id; },
    clearTimeout: (id) => { minuteurs.delete(id); },
    chrome: { storage: { session: { get: async () => ({}), set: async () => {}, remove: async () => {} } }, tabs: { connect: () => { throw new Error("pas de vrai chrome"); } } },
    sendMessageToTab: async () => { throw new Error("pas de canal classique dans ce banc"); },
    keepaliveActif: keepalive,
    console: { log() {}, warn() {}, error() {} },
    Date, Math, Number, String, Promise, Error, Set, Map, JSON,
  });
  vm.runInContext(`${blocPort}
    globalThis.__api = { borneRemplissageJob, borneEffectiveRemplissage, remplirAvecPort, FILL_BORNE_MS, FILL_BORNE_MAX_MS, FILL_BORNE_CLASSIQUE_MS };`, ctx);
  const declencher = (ms) => { for (const [id, t] of [...minuteurs]) if (t.ms === ms) { minuteurs.delete(id); t.fn(); return true; } return false; };
  return { api: ctx.__api, minuteurs, declencher };
}
{
  const { api } = chargerBackground();
  const b = (pf) => api.borneRemplissageJob({ platform_fields: pf });
  assert.equal(api.FILL_BORNE_MS, 600_000);
  assert.equal(b(undefined), 600_000, "absent : 10 min");
  assert.equal(b({ fill_borne_ms: 300_000 }), 600_000, "5 min → 10 min (plancher)");
  assert.equal(b({ fill_borne_ms: 1_200_000 }), 1_200_000, "20 min → 20 min");
  assert.equal(b({ fill_borne_ms: 3_600_000 }), 1_500_000, "60 min → 25 min (plafond)");
  assert.equal(b({ fill_borne_ms: "1200000" }), 600_000, "pas un nombre → 10 min");
  assert.equal(b({ fill_borne_ms: NaN }), 600_000, "NaN → 10 min");
  assert.equal(api.borneEffectiveRemplissage({ platform: "beebs", platform_fields: { fill_borne_ms: 1_200_000 } }), 1_200_000, "port allumé : borne adaptative");
  assert.equal(api.borneEffectiveRemplissage({ platform: "depop", platform_fields: { fill_borne_ms: 1_200_000 } }), 300_000, "Depop (sans écouteur de port) : borne classique 300 s");
  const { api: apiSansPort } = chargerBackground({ keepalive: false });
  assert.equal(apiSansPort.borneEffectiveRemplissage({ platform: "beebs", platform_fields: { fill_borne_ms: 1_200_000 } }), 300_000, "port éteint : borne classique 300 s");
  ok("borne adaptative : clamp(fill_borne_ms, 10 min, 25 min) ; borne effective = classique (300 s) sans port ou sur Depop");
}

// ── Faux ports reliés (background ↔ page), livraison asynchrone comme Chrome ──
function relier(ecouteurPage) {
  const ports = [];
  const connect = (_tabId, { name }) => {
    const bgL = { msg: [], disc: [] }; const csL = { msg: [], disc: [] };
    let ouvert = true;
    const versPage = []; const versBg = [];
    const portBg = {
      name,
      postMessage: (m) => { if (!ouvert) throw new Error("port fermé"); versPage.push(m); queueMicrotask(() => csL.msg.forEach((f) => f(m))); },
      disconnect: () => { if (!ouvert) return; ouvert = false; queueMicrotask(() => csL.disc.forEach((f) => f())); },
      onMessage: { addListener: (f) => bgL.msg.push(f) },
      onDisconnect: { addListener: (f) => bgL.disc.push(f) },
    };
    const portPage = {
      name,
      postMessage: (m) => { if (!ouvert) throw new Error("port fermé"); versBg.push(m); queueMicrotask(() => bgL.msg.forEach((f) => f(m))); },
      disconnect: () => { if (!ouvert) return; ouvert = false; queueMicrotask(() => bgL.disc.forEach((f) => f())); },
      onMessage: { addListener: (f) => csL.msg.push(f) },
      onDisconnect: { addListener: (f) => csL.disc.push(f) },
    };
    // La « mort du worker » : le port se coupe côté page sans message.
    const tuerWorker = () => { if (!ouvert) return; ouvert = false; queueMicrotask(() => csL.disc.forEach((f) => f())); };
    ports.push({ name, versPage, versBg, tuerWorker, portBg });
    ecouteurPage(portPage);
    return portBg;
  };
  return { connect, ports };
}

// ── Écouteur de port d'un content script (code LIVRÉ), monté dans une page simulée ──
function chargerPage(fichier, src, remplir) {
  const bloc = tranche(src, 'const FILL_PORT_NOM = "fillsell-remplissage";', "// ── FIN PORT DE REMPLISSAGE CONTENT-SCRIPT");
  let ecouteur = null;
  const relais = [];
  const g = {};
  const ctx = vm.createContext({
    chrome: {
      runtime: {
        onConnect: { addListener: (f) => { ecouteur = f; } },
        sendMessage: (m) => { relais.push(m); return Promise.resolve(); },
      },
    },
    setInterval: () => 1, clearInterval: () => {},
    repeterSurWorker: () => () => {}, jalonRemplissage: () => {},
    joindreBilanPhotosLbc: (r) => r, reponseEchecInterne: (e) => ({ success: false, error: String(e?.message ?? e) }),
    __remplir: remplir,
    console: { log() {}, warn() {}, error() {} },
    Date, Promise, String, Number, Math, Error,
  });
  vm.runInContext(`var etapeCourante = null;
    async function fillListingForm(job) {
      ${fichier === "beebs" ? 'jobIdRemplissageCourant = String(job?.id ?? "");' : ""}
      return globalThis.__remplir(job, { marquerPhase, abandonAvantEnvoi });
    }
    ${bloc}
    globalThis.__page = { abandonAvantEnvoi, marquerPhase, etat: () => globalThis.__fillsellRemplissage };`, ctx);
  void g;
  return { page: ctx.__page, ecouteur: (p) => ecouteur(p), relais };
}

// Remplissage simulé : marque ses phases, attend le feu de l'essai, puis lit la garde
// JUSTE avant « le clic » — comme fillListingForm le fait devant publishBtn.click().
function remplissageSimule() {
  let liberer; const barriere = new Promise((r) => { liberer = r; });
  const trace = { clics: 0, abandon: null };
  const remplir = async (job, { marquerPhase, abandonAvantEnvoi }) => {
    marquerPhase("photos");
    marquerPhase("adresse");
    await barriere;
    const a = abandonAvantEnvoi(job.id);
    if (a) { trace.abandon = a; return { success: false, error: "Remplissage abandonné avant l'envoi (borne dépassée) : rien n'a été envoyé." }; }
    trace.clics++;
    return { success: true };
  };
  return { remplir, liberer: () => liberer(), trace };
}

for (const [fichier, src] of [["beebs", beebs], ["vinted", vt], ["leboncoin", lbc]]) {
  // a. La borne passe : « abandon » AVANT l'échec ; la page ne clique pas.
  {
    const sim = remplissageSimule();
    const { page, ecouteur } = chargerPage(fichier, src, sim.remplir);
    const { api, declencher } = chargerBackground();
    const { connect, ports } = relier(ecouteur);
    const job = { id: "job-1", platform: fichier, platform_fields: {} };
    const p = api.remplirAvecPort(7, job, { connect, now: () => 0 });
    let rejet = null; p.catch((e) => { rejet = e; });
    await ticks();
    declencher(2000); // le port « etat? » répond avant : sans effet
    await ticks();
    const portRemplissage = ports.find((x) => x.versPage.some((m) => m.type === "FILL_LISTING_PORT"));
    assert.ok(portRemplissage, `${fichier} : FILL_LISTING_PORT envoyé`);
    assert.ok(portRemplissage.versBg.some((m) => m.type === "pret"), `${fichier} : « pret »`);
    assert.equal(page.abandonAvantEnvoi("job-1"), null, `${fichier} : personne n'a abandonné`);
    assert.ok(declencher(600_000), `${fichier} : borne de 10 min armée`);
    await ticks();
    const iAbandon = portRemplissage.versPage.findIndex((m) => m.type === "abandon" && m.jobId === "job-1");
    assert.ok(iAbandon >= 0, `${fichier} : « abandon » envoyé à la page`);
    assert.ok(rejet, `${fichier} : l'échec est rendu`);
    assert.match(rejet.message, /^Timeout: pas de réponse du content script \(borne 10 min dépassée, dernière phase : /, `${fichier} : préfixe inchangé`);
    if (fichier === "beebs") assert.equal(rejet.message, "Timeout: pas de réponse du content script (borne 10 min dépassée, dernière phase : adresse)", "beebs : la VRAIE dernière phase");
    assert.match(String(page.abandonAvantEnvoi("job-1")), /abandon reçu de l'arrière-plan/, `${fichier} : la page sait`);
    sim.liberer(); await ticks();
    assert.equal(sim.trace.clics, 0, `${fichier} : AUCUN clic après la borne`);
    assert.ok(sim.trace.abandon, `${fichier} : abandon rendu à la place du clic`);
  }
  // b. Chemin normal : aucun abandon, le clic part, le résultat revient.
  {
    const sim = remplissageSimule();
    const { ecouteur } = chargerPage(fichier, src, sim.remplir);
    const { api, declencher } = chargerBackground();
    const { connect } = relier(ecouteur);
    const p = api.remplirAvecPort(7, { id: "job-2", platform: fichier, platform_fields: {} }, { connect, now: () => 0 });
    await ticks(); declencher(2000); await ticks();
    sim.liberer(); await ticks(10);
    assert.deepEqual(await p, { success: true }, `${fichier} : résultat rendu`);
    assert.equal(sim.trace.clics, 1, `${fichier} : le clic part quand on attend encore`);
  }
  // c. Le worker meurt (port coupé sans message) : plus personne n'attend → rien ne part ;
  //    un worker revenu qui se RATTACHE lève la garde. Un port « etat? » ne compte jamais.
  {
    const sim = remplissageSimule();
    const { page, ecouteur } = chargerPage(fichier, src, sim.remplir);
    const { api, declencher } = chargerBackground();
    const { connect, ports } = relier(ecouteur);
    api.remplirAvecPort(7, { id: "job-3", platform: fichier, platform_fields: {} }, { connect, now: () => 0 }).catch(() => {});
    await ticks(); declencher(2000); await ticks();
    // Une simple question « etat? » pendant le remplissage : ouverte puis fermée, sans effet.
    const q = relier(ecouteur);
    const pq = q.connect(7, { name: "fillsell-remplissage" });
    pq.postMessage({ type: "etat?" }); await ticks(); pq.disconnect(); await ticks();
    assert.equal(page.abandonAvantEnvoi("job-3"), null, `${fichier} : un port « etat? » qui se ferme ne compte pas`);
    ports.find((x) => x.versPage.some((m) => m.type === "FILL_LISTING_PORT")).tuerWorker();
    await ticks();
    assert.match(String(page.abandonAvantEnvoi("job-3")), /plus personne n'attend/, `${fichier} : port coupé sans relève → garde posée`);
    const r = relier(ecouteur);
    const pr = r.connect(7, { name: "fillsell-remplissage" });
    pr.postMessage({ type: "rattache", jobId: "job-3" }); await ticks();
    assert.equal(page.abandonAvantEnvoi("job-3"), null, `${fichier} : rattaché → la garde se lève`);
    assert.equal(page.abandonAvantEnvoi("autre-job"), null, `${fichier} : jamais pour un autre job`);
  }
  ok(`${fichier}.js : « abandon » reçu ou port coupé sans relève → aucun clic ; rattache / chemin normal inchangés ; « etat? » neutre`);
}

// Le vrai fillListingForm lit la garde JUSTE avant son clic irréversible.
{
  const fb = extraireFonctionJs(beebs, "fillListingForm");
  const iGarde = fb.indexOf("const abandon = abandonAvantEnvoi(job.id);");
  const iClic = fb.indexOf("publishBtn?.click();");
  const iPrevol = fb.indexOf("republishPreflight: true");
  assert.ok(iPrevol > 0 && iGarde > iPrevol && iClic > iGarde, "beebs : garde après le pré-vol, avant le clic");
  assert.ok(!/await /.test(fb.slice(iGarde, iClic).replace(/\/\/[^\n]*/g, "")), "beebs : aucun await entre la garde et le clic");
  assert.ok(fb.includes(`error: "Remplissage abandonné avant l'envoi (borne dépassée) : rien n'a été envoyé à Beebs."`), "beebs : texte exact");
  const fv = extraireFonctionJs(vt, "remplirFormulaireVinted");
  const iGv = fv.indexOf("const abandon = onePassDeleted ? null : abandonAvantEnvoi(job?.id);");
  const iCv = fv.indexOf("publishBtn.click();");
  assert.ok(iGv > 0 && iCv > iGv && !/await /.test(fv.slice(iGv, iCv).replace(/\/\/[^\n]*/g, "")), "vinted : garde juste avant « Publier » (une-passe retirée sous feu vert exclue)");
  const fl = extraireFonctionJs(lbc, "fillListingForm");
  const iGl = fl.indexOf("const abandon = abandonAvantEnvoi(job?.id);");
  const iCl = fl.indexOf("realClick(finalContinue);");
  assert.ok(iGl > 0 && iCl > iGl && !/await /.test(fl.slice(iGl, iCl).replace(/\/\/[^\n]*/g, "")), "leboncoin : garde juste avant le Continuer final");
  for (const [nom, s] of [["beebs", beebs], ["vinted", vt], ["leboncoin", lbc]]) {
    assert.match(s, /if \(enCours\?\.promesse && enCours\.jobId === String\(msg\.job\?\.id \?\? ""\)\) \{\s*\/\/[^\n]*\n\s*enCours\.sansEcoute = false;/, `${nom} : le repli vers le canal classique lève la garde`);
  }
  ok("les trois fillListingForm lisent la garde sans await avant le clic ; le canal classique de repli la lève");
}

// ── 3. BEEBS : PHASES ─────────────────────────────────────────────────────────
log("3. Beebs — phases marquées, poussées sur le port, relayées");
{
  const fb = extraireFonctionJs(beebs, "fillListingForm");
  const phases = [...fb.matchAll(/marquerPhase\("([a-z_]+)"(?:, true)?\)/g)].map((m) => m[1]);
  assert.deepEqual(phases, ["photos", "titre", "description", "categorie", "champs", "colis", "prix", "adresse", "mes_annonces", "envoi", "confirmation"]);
  assert.ok(fb.includes('marquerPhase("envoi", true);'), "l'envoi marque envoye=true");
  // Relais et poussée sur le port, avec le vrai marquerPhase.
  const { page, ecouteur, relais } = chargerPage("beebs", beebs, async (job, { marquerPhase }) => { marquerPhase("champs"); return { success: true }; });
  const { connect, ports } = relier(ecouteur);
  const pb = connect(7, { name: "fillsell-remplissage" });
  pb.postMessage({ type: "FILL_LISTING_PORT", job: { id: "job-p" } }); await ticks();
  page.marquerPhase("prix"); await ticks();
  assert.ok(relais.some((m) => m.type === "FILLSELL_FILL_STEP" && m.step === "beebs:champs"), "FILLSELL_FILL_STEP beebs:champs");
  assert.ok(ports[0].versBg.some((m) => m.type === "vivant" && m.phase === "prix"), "la phase part tout de suite sur le port (pas au battement de 20 s)");
  ok(`11 phases dans l'ordre (${phases.join(" → ")}), relayées et poussées sur le port`);
}

// ── 4. PRÉ-VOL TROP LENT ──────────────────────────────────────────────────────
log("4. Pré-vol avant retrait trop lent : rien n'est retiré");
{
  const part = bg.match(/^const PREVOL_PART_MAX_DE_LA_BORNE = ([\d.]+);$/m)?.[1];
  assert.equal(part, "0.7");
  const statuts = [];
  const ctx = vm.createContext({ updateJobStatus: async (_t, id, status, extra) => { statuts.push({ id, status, extra }); }, console: { warn() {} }, Date, Math, Number });
  vm.runInContext(`const PREVOL_PART_MAX_DE_LA_BORNE = ${part};
    ${extraireFonctionJs(bg, "prevolTropLent")}
    ${extraireFonctionJs(bg, "rendreEchecPrevolTropLent")}
    globalThis.__f = { prevolTropLent, rendreEchecPrevolTropLent };`, ctx);
  const { prevolTropLent, rendreEchecPrevolTropLent } = ctx.__f;
  const lent = prevolTropLent(602_000, 600_000);
  assert.equal(lent.message, "Contrôle avant retrait trop lent sur ce poste (602 s pour remplir le formulaire, borne 600 s) : rien n'a été retiré.");
  assert.equal(prevolTropLent(420_000, 600_000), null, "0,7 × 600 s = 420 s : passe");
  assert.ok(prevolTropLent(420_500, 600_000), "au-delà : bloque");
  assert.equal(prevolTropLent(602_000, 1_200_000), null, "borne élargie à 20 min : 602 s passe");
  assert.equal(prevolTropLent(null, 600_000), null, "sans mesure : rien");
  const job = { id: "ciddjy" }; const pf = { republish_step: "captured" };
  const r = await rendreEchecPrevolTropLent("t", job, pf, lent, "beebs");
  assert.deepEqual(JSON.parse(JSON.stringify(r)), { status: "failed", error: lent.message });
  assert.equal(statuts[0].status, "failed");
  assert.equal(statuts[0].extra.error, lent.message);
  assert.equal(statuts[0].extra.platform_fields.republish_step, "captured", "republish_step inchangé");
  assert.equal(pf.republish_prevol_formulaire.verdict, "trop_lent");
  // Le circuit Beebs : la mesure tranche AVANT le retrait.
  const prp = extraireFonctionJs(bg, "processRepublishJobPlateforme");
  const iPrevol = prp.indexOf("prevolFormulaireRecreationBeebs({ ...job, platform_fields: pf })");
  const iLent = prp.indexOf('if (lent) return await rendreEchecPrevolTropLent(accessToken, job, pf, lent, "beebs");');
  const iRetrait = prp.indexOf("await executerRetraitViaHandler(job, accessToken)");
  assert.ok(iPrevol > 0 && iLent > iPrevol && iRetrait > iLent, "Beebs : pré-vol → trop lent → (sinon) retrait");
  assert.match(prp.slice(iPrevol - 200, iPrevol), /dureeMs: dureePrevolMs, borneMs: bornePrevolMs/);
  const pfb = extraireFonctionJs(bg, "prevolFormulaireRecreationBeebs");
  assert.match(pfb, /const debut = Date\.now\(\);\s*const result = await envoyerFillListing\(tabId, jobPrevol\);\s*return \{ tabId, result, dureeMs: Date\.now\(\) - debut, borneMs: borneEffectiveRemplissage\(jobPrevol\) \};/);
  ok("> 0,7 × la borne effective → échec au texte exact, republish_step inchangé (Beebs ; Leboncoin/Depop : selftest prevol-recreation-lbc-depop)");
}

// ── 5. VINTED : RAYON « NEUF SEULEMENT » ─────────────────────────────────────
log("5. Vinted — rayon « neuf seulement » : la personne, tout de suite");
{
  const normalizeFuzzy = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
  const monter = (src) => new Function("normalizeFuzzy", `${extraireFonctionJs(src, "rayonNeufSeulementVinted")}\nreturn rayonNeufSeulementVinted;`)(normalizeFuzzy);
  const nouveau = monter(vt);
  let avant = null;
  try { avant = monter(execFileSync("git", ["show", "HEAD:chrome-extension/content-scripts/vinted.js"], { encoding: "utf8", maxBuffer: 64 << 20 }).replace(/\r\n/g, "\n")); } catch { avant = null; }
  const fields = { etat: "Très bon état", categoryPath: ["Femmes", "Beauté", "Accessoires de beauté", "Accessoires maquillage"] };
  const requis = { discovered: [{ key: "condition", options: [{ title: "Neuf avec étiquette" }, { title: "Neuf sans étiquette" }] }] };
  const r = nouveau(fields, requis, { warnings: [] });
  assert.equal(r.attenteUtilisateur, true);
  assert.equal(r.needsUser, true);
  assert.equal(r.error, "Le rayon Vinted « Femmes > Beauté > Accessoires de beauté > Accessoires maquillage » n'accepte que des articles neufs, et ton article est « Très bon état ». Choisis un autre rayon Vinted pour cet article depuis l'app, puis relance la publication.");
  if (avant) assert.equal(r.error, avant(fields, requis, { warnings: [] }).error, "message identique à HEAD, au caractère près");
  assert.equal(nouveau({ etat: "Neuf avec étiquette" }, requis), null, "état accepté : rien");
  // La sortie du background : attenteUtilisateur → marquerAttenteUtilisateur, AVANT rearmBounded.
  const iAttente = bg.indexOf("if (result.attenteUtilisateur === true) {\n        await marquerAttenteUtilisateur(accessToken, job, result);");
  const iRearm = bg.indexOf("await rearmBounded(accessToken, job, result.error);\n      return { status: \"needsUser\", error: result.error };\n    } else if (result?.success) {");
  assert.ok(iAttente > 0 && iRearm > iAttente, "background : l'attente nommée passe avant la reprise bornée");
  ok(`attenteUtilisateur: true (motif vinted_rayon_neuf_seulement), message inchangé${avant ? " (comparé à HEAD)" : ""}`);
}

// ── 6. VINTED : DIMENSIONS DU COLIS ───────────────────────────────────────────
log("6. Vinted — dimensions du colis jamais demandées");
{
  const sets = [...bg.matchAll(/const NON_RESOLUBLES = new Set\(\[([^\]]+)\]\);/g)].map((m) => m[1]);
  assert.equal(sets.length, 2, "publication ET recréation");
  for (const s of sets) for (const k of ["parcel_dimensions_height", "parcel_dimensions_width", "parcel_dimensions_length", "package_size_id", "package_size"]) assert.ok(s.includes(`"${k}"`), k);
  const fv = extraireFonctionJs(vt, "remplirFormulaireVinted");
  const reSrc = fv.match(/const CLE_DIMENSION_COLIS_RE = (\/[^\n]+\/);/)?.[1];
  const re = new Function(`return ${reSrc};`)();
  const seulColis = (keys) => keys.length > 0 && keys.every((k) => /^package_size(_id)?$/.test(k) || re.test(k));
  const dims = (keys) => seulColis(keys) && keys.some((k) => re.test(k));
  assert.ok(dims(["parcel_dimensions_height"]) && dims(["parcel_dimensions_height", "parcel_dimensions_width", "parcel_dimensions_length", "package_size"]));
  assert.ok(!dims(["package_size"]) && seulColis(["package_size"]), "format seul : chemin d'avant");
  assert.ok(!seulColis(["parcel_dimensions_height", "color"]), "un autre champ : chemin d'avant");
  assert.ok(fv.includes(`"Vinted exige les dimensions du colis (hauteur, largeur, longueur) pour ce rayon, et FillSell ne sait pas encore les renseigner : rien n'a été publié. Choisis un autre rayon Vinted pour cet article, ou publie-le toi-même sur Vinted."`), "message exact");
  assert.match(fv, /\.\.\.\(seulColis && !dimensionsColis \? \{ colisNonPropose: true \} : \{\}\),/, "pas de reprise « format refusé » pour des dimensions");
  ok("parcel_dimensions_* hors du mini-éditeur (2 listes) ; seulColis les couvre avec le message exact");
}

// ── 7. VINTED : COULEUR ───────────────────────────────────────────────────────
log("7. Vinted — couleur (Marta MELE)");
// a. La sonde du POST (background.js, monde MAIN).
{
  const bloc = tranche(bg, "        window.__fsCouleurAPoser = null;", "        const origFetch = window.fetch;");
  const monter = (armement, ageMs = 0) => {
    const ecouteurs = [];
    const win = { addEventListener: (_t, f) => ecouteurs.push(f), __fsCouleurAPoser: null };
    const api = new Function("window", "ISBN_ARME_TTL_MS", "corpsPourDepot", `${bloc}; return { corpsPourDepotAvecCouleur, couleurEnvoyeeOf, derniere: () => dernierePoseCouleur };`)(win, 15 * 60_000, () => null);
    if (armement !== undefined) {
      for (const f of ecouteurs) f({ source: win, data: { __fillsellArmeCouleur: true, ...armement } });
      if (win.__fsCouleurAPoser && ageMs) win.__fsCouleurAPoser.armeeA -= ageMs;
    }
    return api;
  };
  const URL_ = "https://www.vinted.it/api/v2/item_upload/items";
  const corps = (item) => JSON.stringify({ item, feedback_id: null });
  const robe = (x = {}) => ({ id: null, title: "Vestito rosa WITCH", catalog_id: 1878, isbn: null, ai_photo: false, price: "20", package_size_id: 1, item_attributes: [{ code: "condition", ids: [2] }], ...x });
  {
    const s = monter({ ids: [5] });
    const j = JSON.parse(s.corpsPourDepotAvecCouleur(URL_, corps(robe({ color_ids: [] }))));
    assert.deepEqual(j.item.color_ids, [5]); assert.ok(!j.item.item_attributes.some((a) => a.code === "color"));
    assert.equal(s.derniere(), "color_ids=5");
  }
  {
    const s = monter({ ids: [5, 24] });
    const j = JSON.parse(s.corpsPourDepotAvecCouleur(URL_, corps(robe())));
    assert.deepEqual(j.item.item_attributes, [{ code: "condition", ids: [2] }, { code: "color", ids: [5, 24] }]);
    assert.ok(!("color_ids" in j.item), "aucune clé inventée à la racine");
    assert.equal(s.derniere(), "item_attributes color=5|24");
  }
  assert.equal(monter({ ids: [5] }).corpsPourDepotAvecCouleur(URL_, corps(robe({ color_ids: [9] }))), null, "⛔ jamais par-dessus color_ids posé");
  assert.equal(monter({ ids: [5] }).corpsPourDepotAvecCouleur(URL_, corps(robe({ item_attributes: [{ code: "color", ids: [9] }] }))), null, "⛔ jamais par-dessus une entrée color");
  assert.equal(monter().corpsPourDepotAvecCouleur(URL_, corps(robe())), null, "non armé : rien");
  assert.equal(monter({ ids: null }).corpsPourDepotAvecCouleur(URL_, corps(robe())), null, "désarmé : rien");
  assert.equal(monter({ ids: [5] }, 16 * 60_000).corpsPourDepotAvecCouleur(URL_, corps(robe())), null, "armement de plus de 15 min : rien");
  assert.equal(monter({ ids: [5] }).corpsPourDepotAvecCouleur("https://www.vinted.it/api/v2/item_upload/attributes", corps(robe())), null, "autre requête : rien");
  assert.equal(monter({ ids: [5] }).corpsPourDepotAvecCouleur(URL_, JSON.stringify({ foo: 1 })), null, "pas un corps d'article : rien");
  assert.equal(monter({ ids: [5] }).corpsPourDepotAvecCouleur(URL_, "{pas du json"), null, "illisible : rien, jamais d'exception");
  assert.equal(monter({ ids: ["x", -1] }).corpsPourDepotAvecCouleur(URL_, corps(robe())), null, "ids illisibles écartés à l'armement");
  const e = monter().couleurEnvoyeeOf(URL_, corps(robe({ color_ids: [5], color1: "Rosa" })));
  assert.deepEqual(e, { color_ids: "[5]", color1: "Rosa" });
  assert.deepEqual(monter().couleurEnvoyeeOf(URL_, corps(robe())), { aucune: "ni clé color*, ni entrée color" });
  assert.equal((bg.match(/corpsPourDepotAvecCouleur\(/g) ?? []).length, 2, "fetch ET XMLHttpRequest passent par la chaîne avec couleur");
  assert.equal((bg.match(/couleurPosee = dernierePoseCouleur/g) ?? []).length, 2, "fetch ET XMLHttpRequest relèvent la pose");
  assert.equal((bg.match(/^\s+couleurPosee,$/gm) ?? []).length, 2, "fetch ET XMLHttpRequest relaient couleurPosee");
  assert.equal((bg.match(/couleurEnvoyee: couleurEnvoyeeOf\(/g) ?? []).length, 2, "la forme envoyée relevée à chaque création");
  ok("sonde : couleur posée dans la clé que le corps porte (color_ids, sinon item_attributes), jamais par-dessus, bornée, relevée");
}
// b. vinted.js : armement, ids connus.
{
  const ids = new Function(`${extraireFonctionJs(vt, "idsCouleurConnusDuJob")}\nreturn idsCouleurConnusDuJob;`)();
  assert.deepEqual(ids({ vinted_ids: { color_ids: [5, 24, 3] } }), [5, 24]);
  assert.deepEqual(ids({ republish_snapshot: { color1_id: "9", color2_id: null } }), [9]);
  assert.deepEqual(ids({ vinted_ids: { color_ids: [] }, republish_snapshot: { color1_id: 5, color2_id: 5 } }), [5]);
  assert.deepEqual(ids({}), []); assert.deepEqual(ids(null), []);
  const fv = extraireFonctionJs(vt, "remplirFormulaireVinted");
  const iArme = fv.indexOf('if (!_color && document.querySelector(vintedFieldSelector("color"))) {');
  const iSoumission = fv.indexOf('marquerPhase("soumission");');
  assert.ok(iArme > 0 && iSoumission > iArme, "armée juste avant la soumission, jamais contre un choix de la personne ni sans champ Couleur");
  assert.match(fv, /armerCouleurPourPost\(null\);\s*couleurAttendueVinted = false;\s*couleurConfirmeeParCasesVinted = false;/, "désarmée à chaque remplissage");
  assert.match(fv, /couleurAttendueVinted = Boolean\(onePass\) && !recreation && copieAUneCouleur;/, "porte armée sur une republication AVANT le retrait seulement");
  assert.match(fv, /selectCouleursParIds\(idsVinted\.color_ids, warnings, diagnosticsRecreation\)/, "trace dans diagnosticsRecreation");
  assert.match(vt, /const ATTRIBUTS_ORIGINE_CANAUX_DEDIES = new Set\(\["condition", "size", "material", "language_book", "color", "isbn", "brand"\]\);/, "la couleur garde son canal dédié (jamais les canaux génériques)");
  ok("vinted.js : ids connus (vinted_ids, sinon color1_id/color2_id), armés avant la soumission, désarmés à chaque remplissage");
}
// c. selectCouleursParIds : la valeur RETENUE après fermeture.
{
  const monter = (scenario) => {
    const etat = { ouvert: false, coches: new Set(), trigger: "", ouvertures: 0 };
    const cell = (id) => ({
      id: `color-${id}`, textContent: `C${id}`,
      getAttribute: (a) => (a === "aria-checked" ? String(etat.coches.has(id)) : null),
      closest() { return this; },
      click() { if (etat.coches.has(id)) etat.coches.delete(id); else if (!(scenario.recocheSansEffet && etat.ouvertures > 1)) etat.coches.add(id); },
    });
    const cells = new Map([5, 24, 9].map((id) => [`color-${id}`, cell(id)]));
    const document = {
      querySelector: (sel) => (sel.startsWith("#color,") ? { value: etat.trigger } : null),
      querySelectorAll: (sel) => (etat.ouvert && sel.includes('[aria-checked="true"]') ? [...etat.coches].map((id) => cells.get(`color-${id}`)) : []),
      getElementById: (id) => (etat.ouvert ? cells.get(id) ?? null : null),
    };
    const ctx = vm.createContext({
      document,
      openDropdown: async () => { etat.ouvert = true; etat.ouvertures++; },
      closeAnyOpenDropdown: async () => {
        if (!etat.ouvert) return;
        etat.ouvert = false;
        etat.trigger = scenario.trigger(etat);
        if (scenario.casesPerdues) etat.coches.clear();
      },
      waitForElement: async (sel) => (etat.ouvert ? cells.get(sel.slice(1)) ?? null : null),
      humanPause: async () => {},
      estMenuVintedBloom: () => false,
      Number, String, Set, Array, Object, Error,
    });
    vm.runInContext(`var couleurConfirmeeParCasesVinted = false;
      ${extraireFonctionJs(vt, "cocherOptionSansBasculer")}
      ${extraireFonctionJs(vt, "valeurChampVinted")}
      ${extraireFonctionJs(vt, "readCommittedValue")}
      ${extraireFonctionJs(vt, "selectCouleursParIds")}
      globalThis.__s = selectCouleursParIds; globalThis.__cases = () => couleurConfirmeeParCasesVinted;`, ctx);
    return { f: ctx.__s, parCases: ctx.__cases, etat };
  };
  {
    const { f, parCases } = monter({ trigger: () => "Rosa" });
    const w = [], t = [];
    assert.equal(await f([5], w, t), true);
    assert.equal(parCases(), false);
    assert.match(t.join(" | "), /couleur par identifiants 5 : champ relu « Rosa » après fermeture/);
  }
  {
    const { f, parCases } = monter({ trigger: () => "" }); // cases gardées, déclencheur vide (pré-remplissage)
    const t = [];
    assert.equal(await f([5], [], t), true);
    assert.equal(parCases(), true, "confirmée par les cases : la porte ne la compte pas vide");
    assert.match(t.join(" | "), /champ relu vide après fermeture, case\(s\) cochée\(s\) — conservée\(s\)/);
  }
  {
    const { f } = monter({ trigger: () => "", casesPerdues: true, recocheSansEffet: true }); // perdue, la recoche ne prend pas
    const w = [], t = [];
    assert.equal(await f([5], w, t), false, "jamais « posée » sur la foi d'un panneau ouvert");
    assert.match(t.join(" | "), /échec \(champ Couleur relu VIDE après fermeture, case\(s\) non retenue\(s\)\) — pose par libellé/);
    assert.match(w.join(" | "), /couleur par id : champ Couleur relu VIDE après fermeture/);
  }
  {
    const { f } = monter({ trigger: (e) => (e.ouvertures > 1 ? "Rosa" : ""), casesPerdues: true }); // perdue, recochée, retenue
    const t = [];
    assert.equal(await f([5], [], t), true);
    assert.match(t.join(" | "), /champ relu « Rosa » après fermeture/);
  }
  ok("selectCouleursParIds : relue APRÈS fermeture ; vide → cases rouvertes, une recoche ; sinon échec — tout tracé au diagnostic");
}
// d. computeVintedRequiredState : couleur vide d'une copie qui en porte une → requis vide.
{
  const monter = ({ attendue, parCases, valeur, config = [], champ = true }) => {
    const ctx = vm.createContext({
      readLatestAttrsConfig: async () => config,
      lireGrilleColisFormulaire: () => [],
      estMenuVintedBloom: () => false,
      document: {
        querySelector: (sel) => (champ && sel.startsWith("#color,") ? { value: valeur } : null),
        querySelectorAll: () => [],
      },
      CSS: { escape: (s) => s },
      Map, Set, Array, Object, String, Number, Boolean,
    });
    vm.runInContext(`
      var couleurAttendueVinted = ${attendue}; var couleurConfirmeeParCasesVinted = ${parCases}; var paletteCouleursRelevee = ["Rosa", "Blu"];
      const VINTED_SERVER_FIELD_LABELS = { color: "Couleur", model: "Modèle", brand: "Marque" };
      ${extraireFonctionJs(vt, "vintedFieldSelector")}
      ${extraireFonctionJs(vt, "valeurChampVinted")}
      ${extraireFonctionJs(vt, "readCommittedValue")}
      ${extraireFonctionJs(vt, "computeVintedRequiredState")}
      globalThis.__c = computeVintedRequiredState;`, ctx);
    return ctx.__c();
  };
  const cfgIt = [{ code: "color", title: "Colore", required: false, display: "multi-list", options: null }];
  const a = await monter({ attendue: true, parCases: false, valeur: "", config: cfgIt });
  assert.deepEqual([...a.unfilled], ["Colore"], "copie avec couleur, champ vide → requis vide (libellé de la page)");
  assert.equal(a.discovered.find((d) => d.key === "color")?.label, "Colore");
  assert.deepEqual([...(await monter({ attendue: true, parCases: false, valeur: "Rosa", config: cfgIt })).unfilled], [], "champ rempli : rien");
  assert.deepEqual([...(await monter({ attendue: true, parCases: true, valeur: "", config: cfgIt })).unfilled], [], "confirmée par ses cases : jamais comptée vide");
  assert.deepEqual([...(await monter({ attendue: false, parCases: false, valeur: "", config: cfgIt })).unfilled], [], "porte non armée (publication, recréation) : chemin d'avant");
  assert.deepEqual([...(await monter({ attendue: true, parCases: false, valeur: "", config: cfgIt, champ: false })).unfilled], [], "pas de champ Couleur : rien");
  const b = await monter({ attendue: true, parCases: false, valeur: "", config: [] });
  assert.deepEqual([...b.unfilled], ["Couleur"]);
  assert.ok(b.discovered.some((d) => d.key === "color" && d.label === "Couleur"), "l'entrée color existe pour la question (needsUserField color)");
  ok("porte des requis : couleur vide d'une republication avant retrait = requis vide (arrêt AVANT tout retrait), jamais sur une case cochée");
}

// ── 8. VINTED : RÉFÉRENTIEL RELU ──────────────────────────────────────────────
log("8. Vinted — référentiel relu sur accroc réseau ou 5xx (linda.sidhoum)");
{
  const monter = (reponses) => {
    const appels = []; const pauses = [];
    const ctx = vm.createContext({
      fetchBorne: async (chemin) => {
        appels.push(chemin);
        const r = reponses.shift();
        if (r instanceof Error) throw r;
        return { status: r.status, ok: r.status >= 200 && r.status < 300, headers: { get: () => "application/json" }, text: async () => r.corps ?? "" };
      },
      sleep: async (ms) => { pauses.push(ms); },
      Math, JSON, Object, Array, String, Number, Error, TypeError,
    });
    vm.runInContext(`const _refCache = {};
      ${tranche(vt, "const REFERENTIEL_VINTED_ESSAIS = ", "\n// opts.memoiser=false")}
      ${extraireFonctionJs(vt, "lireReferentielVinted")}
      globalThis.__l = lireReferentielVinted; globalThis.__cache = _refCache;`, ctx);
    return { lire: ctx.__l, cache: ctx.__cache, appels, pauses };
  };
  const extraire = (d) => (Array.isArray(d?.size_groups) ? new Map(d.size_groups.flatMap((g) => g.sizes.map((s) => [s.id, s.title]))) : null);
  const ok200 = { status: 200, corps: JSON.stringify({ size_groups: [{ id: 14, sizes: [{ id: 208, title: "M" }] }] }) };
  {
    const m = monter([new TypeError("Failed to fetch"), new TypeError("Failed to fetch"), ok200]);
    const diag = [];
    const t = await m.lire("size_groups", "/api/v2/size_groups", extraire, diag);
    assert.equal(t?.get(208), "M");
    assert.equal(m.appels.length, 3);
    assert.ok(m.pauses.length === 2 && m.pauses.every((p) => p >= 1000 && p <= 3000), `pauses 1–3 s (${m.pauses})`);
    assert.equal(diag[0].reprises.length, 2);
    assert.ok(m.cache.size_groups, "succès mis en cache");
  }
  {
    const m = monter([{ status: 503 }, { status: 502 }, { status: 503 }, ok200]);
    assert.equal(await m.lire("size_groups", "/api/v2/size_groups", extraire, []), null);
    assert.equal(m.appels.length, 3, "3 essais au plus");
    assert.equal(m.cache.size_groups, undefined, "l'échec n'est jamais mis en cache");
    assert.equal((await m.lire("size_groups", "/api/v2/size_groups", extraire, []))?.get(208), "M", "l'appel suivant relit");
  }
  {
    const m = monter([new TypeError("Failed to fetch"), new TypeError("Failed to fetch"), new TypeError("Failed to fetch")]);
    const diag = [];
    assert.equal(await m.lire("size_groups", "/api/v2/size_groups", extraire, diag), null);
    assert.equal(m.appels.length, 3);
    assert.match(diag[0].erreur, /Failed to fetch/);
  }
  for (const [quoi, rep] of [["404", { status: 404, corps: "<html>" }], ["borne de temps", Object.assign(new Error("Vinted n'a pas répondu en 30 s"), { timeoutBorne: true })], ["erreur de notre code", new TypeError("x is not a function")]]) {
    const m = monter([rep, ok200]);
    assert.equal(await m.lire("size_groups", "/api/v2/size_groups", extraire, []), null, quoi);
    assert.equal(m.appels.length, 1, `${quoi} : aucune relecture`);
  }
  ok("« Failed to fetch » / 5xx : 2 relectures (1–3 s), échec jamais en cache ; 404, borne, défaut de code : un seul essai");
}

// ── 9. VERSION ────────────────────────────────────────────────────────────────
log("9. Version");
{
  assert.equal(manifest.version, "0.6.177");
  assert.match(bg, /^const FILLSELL_BUILD =\n {2}"2026-11-07 \(0\.6\.177 :/m);
  ok("manifest 0.6.177 ; FILLSELL_BUILD daté du 07/11");
}

log(`\n✓ extension 0.6.177 : ${n} contrôles verts`);
