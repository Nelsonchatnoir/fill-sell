// ═══════════════════════════════════════════════════════════════════════════
// SELFTEST — EXTENSION 0.6.178 (07/11/2026 soir)
// ═══════════════════════════════════════════════════════════════════════════
//   npm run selftest:extension-0-6-178
// Le CODE LIVRÉ est extrait de chrome-extension/ et EXÉCUTÉ (jamais une copie) :
// la vraie chaîne envoyerFillListing → envoyerFillListingBrut → remplirParMessage
// → sendMessageToTab → sendMessageToTabOnce → chrome.tabs.sendMessage (simulé) →
// le VRAI écouteur onMessage de beebs.js / vinted.js / leboncoin.js → la VRAIE garde
// abandonAvantEnvoi, sur une horloge simulée commune (arrière-plan et page).
//   A. Point 3 (Ciddjy) pour TOUS les comptes :
//      1. sans port, la borne (300 s) passe → l'arrière-plan prévient la page
//         (FILLSELL_ABANDON_REMPLISSAGE), rend « Timeout: pas de réponse du content
//         script » au mot près, et AUCUN clic n'a lieu ensuite ;
//      2. un remplissage lent SOUS la borne (290 s) aboutit comme avant ;
//      3. arrière-plan mort (aucun abandon reçu) : l'échéance locale de la page suffit ;
//      4. la page passe son échéance avant que la minuterie de l'arrière-plan ne sonne :
//         même erreur de borne, aucun clic ;
//      5. message sans borne (ancien arrière-plan) : rien n'est armé, chemin d'avant ;
//      6. une seconde demande du même job dans la page rejoint le premier remplissage ;
//         un abandon d'un autre remplissage (fillId) n'a aucun effet ;
//      7. fill_borne_ms = 20 min, port ÉTEINT : le remplissage passe par le port, un
//         remplissage de 19 min aboutit, un de 21 min est arrêté à 20 min, sans clic ;
//      8. routage : sans borne demandée et port éteint → message simple (300 s) ;
//         Depop → message simple ; port allumé → port (inchangé).
//   B. Sonia (Leboncoin, « Polo garçon Lacoste 10 ans ») :
//      1. l'attente des critères suit le poids des photos (30 s au moins, 120 s au plus) ;
//      2. le scénario du Polo (5,6 Mo de PNG, critères à ~70 s) : HEAD échoue, 0.6.178
//         trouve les critères ; un dépôt léger (465 Ko) : résultat identique à HEAD ;
//      3. les PNG de plus de 300 Ko partent en JPEG (plus léger seulement), le reste
//         jamais touché ; tout échec ou lenteur → la photo d'origine ;
//      4. uploadPhotos : poids envoyé relevé, bilan « allegees » joint ;
//   D. Beebs (republication, capture de la fiche) : le bandeau de l'application
//      (« Voir dans l’appli », « L’appli tout-en-un ») n'entre plus dans
//      attributs_affiches → beebsAspects ; tout le reste de la capture est
//      identique à HEAD ; Taille / Pointure / Âge lus quand la fiche les montre ;
//   C. version 0.6.178.
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { execFileSync } from "node:child_process";
import { extraireFonctionJs } from "./lib/extraire-fonction-js.mjs";

const lire = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const bg = lire("chrome-extension/background.js");
const sources = {
  beebs: lire("chrome-extension/content-scripts/beebs.js"),
  vinted: lire("chrome-extension/content-scripts/vinted.js"),
  leboncoin: lire("chrome-extension/content-scripts/leboncoin.js"),
};
const lbc = sources.leboncoin;
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
const ticks = async (k = 8) => { for (let i = 0; i < k; i++) await tick(); };
const TIMEOUT_CLASSIQUE = "Timeout: pas de réponse du content script";

// ── Horloge commune : deux réserves de minuteurs (arrière-plan, page) ─────────
function creerHorloge() {
  let t = 1_700_000_000_000;
  let seq = 0;
  const reserves = { bg: new Map(), page: new Map() };
  const poser = (res, retard = 0) => (fn, ms) => { const id = ++seq; reserves[res].set(id, { fn, at: t + (Number(ms) || 0) + retard }); return id; };
  class FauxDate extends Date {
    constructor(...a) { super(...(a.length ? a : [t])); }
    static now() { return t; }
  }
  return {
    now: () => t,
    FauxDate,
    reserves,
    poser,
    retirer: (res) => (id) => { reserves[res].delete(id); },
    tuer: (res) => reserves[res].clear(),
    async avancer(ms) {
      const fin = t + ms;
      for (;;) {
        let prochain = null;
        for (const res of ["bg", "page"]) for (const [id, m] of reserves[res]) if (m.at <= fin && (!prochain || m.at < prochain.m.at)) prochain = { res, id, m };
        if (!prochain) break;
        t = Math.max(t, prochain.m.at);
        reserves[prochain.res].delete(prochain.id);
        prochain.m.fn();
        await ticks();
      }
      t = fin;
      await ticks();
    },
  };
}

// ── Le vrai écouteur onMessage d'un content script (source livrée) ───────────
function ecouteurMessageDe(src) {
  const debut = "chrome.runtime.onMessage.addListener(";
  const i = src.indexOf(`${debut}(msg, _sender, sendResponse) => {`);
  const finMarque = "\n    return true; // réponse asynchrone\n  }";
  const j = src.indexOf(finMarque, i);
  assert.ok(i >= 0 && j > i, "écouteur onMessage introuvable");
  return src.slice(i + debut.length, j + finMarque.length);
}

// ── Une page simulée : le VRAI bloc de port + le VRAI écouteur onMessage ─────
function chargerPage(fichier, horloge, remplir) {
  const src = sources[fichier];
  const blocPort = tranche(src, 'const FILL_PORT_NOM = "fillsell-remplissage";', "// ── FIN PORT DE REMPLISSAGE CONTENT-SCRIPT");
  let ecouteurMessage = null; let ecouteurPort = null;
  const ctx = vm.createContext({
    chrome: {
      runtime: {
        onMessage: { addListener: (f) => { ecouteurMessage = f; } },
        onConnect: { addListener: (f) => { ecouteurPort = f; } },
        sendMessage: () => Promise.resolve(),
      },
    },
    setTimeout: horloge.poser("page"), clearTimeout: horloge.retirer("page"),
    setInterval: () => 1, clearInterval: () => {},
    repeterSurWorker: () => () => {}, jalonRemplissage: () => {},
    joindreBilanPhotosLbc: (r) => r,
    reponseEchecInterne: (e) => ({ success: false, error: String(e?.message ?? e) }),
    __remplir: remplir,
    console: { log() {}, warn() {}, error() {} },
    Date: horloge.FauxDate, Promise, String, Number, Math, Error, Map, Set, JSON, Object,
  });
  vm.runInContext(`var etapeCourante = null; var MARQUE_HORS_LISTE = null; var MARQUE_HORS_LISTE_BEEBS = null;
    async function fillListingForm(job) {
      ${fichier === "beebs" ? 'jobIdRemplissageCourant = String(job?.id ?? "");' : ""}
      return globalThis.__remplir(job, { abandonAvantEnvoi, marquerPhase });
    }
    ${blocPort}
    chrome.runtime.onMessage.addListener(${ecouteurMessageDe(src)});
    globalThis.__page = { abandonAvantEnvoi, remplissagesParMessage };`, ctx);
  return { page: ctx.__page, ecouteurMessage: () => ecouteurMessage, ecouteurPort: () => ecouteurPort };
}

// Remplissage simulé : une durée de travail (horloge de la page), puis la VRAIE garde
// JUSTE avant « le clic » — comme fillListingForm le fait devant son clic d'envoi.
function remplissageSimule(horloge, dureeMs) {
  const trace = { debuts: 0, clics: 0, abandons: [] };
  const remplir = async (job, { abandonAvantEnvoi, marquerPhase }) => {
    trace.debuts++;
    marquerPhase("photos");
    await new Promise((r) => horloge.poser("page")(r, dureeMs));
    const a = abandonAvantEnvoi(job.id);
    if (a) {
      trace.abandons.push(a);
      return { success: false, abandonneAvantEnvoi: true, error: "Remplissage abandonné avant l'envoi (borne dépassée) : rien n'a été envoyé." };
    }
    trace.clics++;
    return { success: true, listingUrl: `https://exemple/${job.id}` };
  };
  return { remplir, trace };
}

// ── L'arrière-plan : le VRAI bloc du port + les VRAIS sendMessageToTab(Once) ──
const blocPortBg = tranche(bg, "// ── PORT DE REMPLISSAGE (2026-09-17) — début du bloc testé par le harnais ──", "// ── FIN PORT DE REMPLISSAGE ────");
function chargerBackground({ horloge, page, keepalive = false, retardBorneBg = 0, messages = [] }) {
  const chromeBg = {
    runtime: { lastError: undefined },
    storage: { session: { get: async () => ({}), set: async () => {}, remove: async () => {} } },
    tabs: {
      // Livraison asynchrone comme Chrome ; écouteur absent ou sans réponse → lastError.
      sendMessage: (_tabId, message, cb) => {
        messages.push(JSON.parse(JSON.stringify(message)));
        queueMicrotask(() => {
          let repondu = false;
          const repondre = (r) => { if (repondu) return; repondu = true; queueMicrotask(() => cb(r === undefined ? undefined : JSON.parse(JSON.stringify(r)))); };
          const ec = page.ecouteurMessage();
          const ret = ec ? ec(JSON.parse(JSON.stringify(message)), {}, repondre) : undefined;
          if (ret !== true && !repondu) {
            queueMicrotask(() => { chromeBg.runtime.lastError = { message: "The message port closed before a response was received." }; cb(undefined); chromeBg.runtime.lastError = undefined; });
          }
        });
      },
      connect: (_tabId, { name }) => relierPort(page, name),
    },
  };
  const ctx = vm.createContext({
    chrome: chromeBg,
    keepaliveActif: keepalive,
    setTimeout: (fn, ms) => horloge.poser("bg", Number(ms) >= 60_000 ? retardBorneBg : 0)(fn, ms),
    clearTimeout: horloge.retirer("bg"),
    sleep: (ms) => new Promise((r) => horloge.poser("bg")(r, ms)),
    console: { log() {}, warn() {}, error() {} },
    Date: horloge.FauxDate, Math, Number, String, Promise, Error, Set, Map, JSON, Object, Array,
  });
  vm.runInContext(`${extraireFonctionJs(bg, "sendMessageToTabOnce")}
    ${blocPortBg}
    ${extraireFonctionJs(bg, "sendMessageToTab")}
    globalThis.__api = { envoyerFillListing, borneEffectiveRemplissage, portPourRemplissage, remplirParMessage,
      FILL_BORNE_CLASSIQUE_MS, FILL_ABANDON_MESSAGE, setKeepalive: (v) => { keepaliveActif = v; } };`, ctx);
  return ctx.__api;
}
// Ports reliés background ↔ page, livraison asynchrone (même banc que la 0.6.177).
function relierPort(page, name) {
  const bgL = { msg: [], disc: [] }; const csL = { msg: [], disc: [] };
  let ouvert = true;
  const portBg = {
    name,
    postMessage: (m) => { if (!ouvert) throw new Error("port fermé"); queueMicrotask(() => csL.msg.forEach((f) => f(JSON.parse(JSON.stringify(m))))); },
    disconnect: () => { if (!ouvert) return; ouvert = false; queueMicrotask(() => csL.disc.forEach((f) => f())); },
    onMessage: { addListener: (f) => bgL.msg.push(f) },
    onDisconnect: { addListener: (f) => bgL.disc.push(f) },
  };
  const portPage = {
    name,
    postMessage: (m) => { if (!ouvert) throw new Error("port fermé"); queueMicrotask(() => bgL.msg.forEach((f) => f(JSON.parse(JSON.stringify(m))))); },
    disconnect: () => { if (!ouvert) return; ouvert = false; queueMicrotask(() => bgL.disc.forEach((f) => f())); },
    onMessage: { addListener: (f) => csL.msg.push(f) },
    onDisconnect: { addListener: (f) => csL.disc.push(f) },
  };
  const ec = page.ecouteurPort();
  if (ec) ec(portPage);
  else queueMicrotask(() => { ouvert = false; bgL.disc.forEach((f) => f()); });
  return portBg;
}

async function lancer(api, job) {
  const etat = { resultat: undefined, erreur: undefined, fini: false };
  api.envoyerFillListing(7, job).then((r) => { etat.resultat = r; etat.fini = true; }, (e) => { etat.erreur = e; etat.fini = true; });
  await ticks();
  return etat;
}

// ═══ A. LA BORNE POUR TOUS LES COMPTES ════════════════════════════════════════
log("A. Point 3 (Ciddjy) — l'arrêt à la borne sans port, et fill_borne_ms pour tous");
for (const fichier of ["beebs", "vinted", "leboncoin"]) {
  // 1. Sans port : borne de 300 s → abandon prévenu → Timeout au mot près → aucun clic.
  {
    const horloge = creerHorloge();
    const sim = remplissageSimule(horloge, 400_000);
    const page = chargerPage(fichier, horloge, sim.remplir);
    const messages = [];
    const api = chargerBackground({ horloge, page, messages });
    const etat = await lancer(api, { id: `${fichier}-1`, platform: fichier, platform_fields: {} });
    const envoi = messages.find((m) => m.type === "FILL_LISTING");
    assert.ok(envoi, `${fichier} : FILL_LISTING envoyé`);
    assert.equal(envoi.borneMs, 300_000, `${fichier} : la borne voyage avec le message (300 s, celle d'aujourd'hui)`);
    assert.match(String(envoi.fillId), new RegExp(`^${fichier}-1#`), `${fichier} : identifiant de remplissage`);
    await horloge.avancer(299_000);
    assert.equal(etat.fini, false, `${fichier} : rien n'est tranché avant la borne`);
    assert.equal(page.page.abandonAvantEnvoi(`${fichier}-1`), null, `${fichier} : avant la borne, la garde laisse passer`);
    await horloge.avancer(1_000);
    const abandon = messages.find((m) => m.type === "FILLSELL_ABANDON_REMPLISSAGE");
    assert.ok(abandon && abandon.jobId === `${fichier}-1` && abandon.fillId === envoi.fillId, `${fichier} : l'arrière-plan prévient la page à SA borne`);
    assert.ok(etat.erreur, `${fichier} : l'échec est rendu`);
    assert.equal(etat.erreur.message, TIMEOUT_CLASSIQUE, `${fichier} : message d'échec inchangé, au mot près (le serveur le reconnaît)`);
    assert.equal(page.page.abandonAvantEnvoi(`${fichier}-1`), "abandon reçu de l'arrière-plan (borne dépassée)", `${fichier} : la page sait`);
    await horloge.avancer(120_000);
    assert.equal(sim.trace.clics, 0, `${fichier} : AUCUN clic après la borne`);
    assert.equal(sim.trace.abandons.length, 1, `${fichier} : abandon rendu à la place du clic`);
    assert.equal(page.page.remplissagesParMessage.size, 0, `${fichier} : l'état du remplissage est lâché à sa fin`);
  }
  // 2. Un remplissage lent SOUS la borne (290 s) aboutit comme avant.
  {
    const horloge = creerHorloge();
    const sim = remplissageSimule(horloge, 290_000);
    const page = chargerPage(fichier, horloge, sim.remplir);
    const messages = [];
    const api = chargerBackground({ horloge, page, messages });
    const etat = await lancer(api, { id: `${fichier}-2`, platform: fichier, platform_fields: {} });
    await horloge.avancer(290_000);
    assert.deepEqual(etat.resultat, { success: true, listingUrl: `https://exemple/${fichier}-2` }, `${fichier} : résultat rendu`);
    assert.equal(sim.trace.clics, 1, `${fichier} : le clic part`);
    assert.ok(!messages.some((m) => m.type === "FILLSELL_ABANDON_REMPLISSAGE"), `${fichier} : aucun abandon`);
    await horloge.avancer(60_000);
    assert.equal(etat.erreur, undefined, `${fichier} : la borne passée ensuite ne change rien`);
  }
  // 3. Arrière-plan MORT pendant le remplissage (aucune minuterie, aucun abandon) :
  //    l'échéance locale de la page suffit.
  {
    const horloge = creerHorloge();
    const sim = remplissageSimule(horloge, 350_000);
    const page = chargerPage(fichier, horloge, sim.remplir);
    const messages = [];
    const api = chargerBackground({ horloge, page, messages });
    await lancer(api, { id: `${fichier}-3`, platform: fichier, platform_fields: {} });
    horloge.tuer("bg");
    await horloge.avancer(400_000);
    assert.ok(!messages.some((m) => m.type === "FILLSELL_ABANDON_REMPLISSAGE"), `${fichier} : personne n'a prévenu la page`);
    assert.equal(sim.trace.clics, 0, `${fichier} : AUCUN clic après l'échéance locale`);
    assert.match(sim.trace.abandons[0] ?? "", /borne du remplissage dépassée/, `${fichier} : l'échéance de la page a tranché`);
  }
  // 4. La page passe son échéance avant que la minuterie de l'arrière-plan ne sonne
  //    (minuterie en retard de 5 s) : même verdict de borne, aucun clic.
  {
    const horloge = creerHorloge();
    const sim = remplissageSimule(horloge, 302_000);
    const page = chargerPage(fichier, horloge, sim.remplir);
    const api = chargerBackground({ horloge, page, retardBorneBg: 5_000 });
    const etat = await lancer(api, { id: `${fichier}-4`, platform: fichier, platform_fields: {} });
    await horloge.avancer(302_500);
    assert.ok(etat.erreur, `${fichier} : échec rendu dès le retour de la page`);
    assert.equal(etat.erreur.message, TIMEOUT_CLASSIQUE, `${fichier} : la même erreur de borne, jamais un autre verdict`);
    assert.equal(sim.trace.clics, 0, `${fichier} : aucun clic`);
  }
  // 5. Message SANS borne (ancien arrière-plan) : rien n'est armé, chemin d'avant (le clic part).
  {
    const horloge = creerHorloge();
    const sim = remplissageSimule(horloge, 400_000);
    const page = chargerPage(fichier, horloge, sim.remplir);
    let reponse;
    const ret = page.ecouteurMessage()({ type: "FILL_LISTING", job: { id: `${fichier}-5`, platform: fichier } }, {}, (r) => { reponse = r; });
    assert.equal(ret, true, `${fichier} : réponse asynchrone`);
    await horloge.avancer(400_000);
    assert.equal(page.page.remplissagesParMessage.size, 0, `${fichier} : aucune échéance armée`);
    assert.equal(sim.trace.clics, 1, `${fichier} : comportement d'avant (le clic part)`);
    assert.equal(reponse?.success, true);
  }
  // 6. Seconde demande du même job pendant le premier remplissage : on le rejoint ;
  //    l'abandon d'un AUTRE remplissage (fillId) est sans effet.
  {
    const horloge = creerHorloge();
    const sim = remplissageSimule(horloge, 100_000);
    const page = chargerPage(fichier, horloge, sim.remplir);
    const ec = page.ecouteurMessage();
    const job = { id: `${fichier}-6`, platform: fichier };
    const reps = [];
    ec({ type: "FILL_LISTING", job, borneMs: 300_000, fillId: "A" }, {}, (r) => reps.push(r));
    await ticks();
    ec({ type: "FILL_LISTING", job, borneMs: 300_000, fillId: "B" }, {}, (r) => reps.push(r));
    let r1; ec({ type: "FILLSELL_ABANDON_REMPLISSAGE", jobId: job.id, fillId: "B" }, {}, (r) => { r1 = r; });
    assert.deepEqual(JSON.parse(JSON.stringify(r1)), { ok: false }, `${fichier} : abandon d'un autre remplissage ignoré`);
    await horloge.avancer(100_000);
    assert.equal(sim.trace.debuts, 1, `${fichier} : un seul remplissage pour deux demandes`);
    assert.equal(sim.trace.clics, 1, `${fichier} : un seul clic`);
    assert.equal(reps.length, 2, `${fichier} : les deux demandes ont leur réponse`);
    let r2; ec({ type: "FILLSELL_ABANDON_REMPLISSAGE", jobId: job.id, fillId: "A" }, {}, (r) => { r2 = r; });
    assert.deepEqual(JSON.parse(JSON.stringify(r2)), { ok: false }, `${fichier} : remplissage fini : rien à abandonner`);
  }
  // 6 bis. Un remplissage lancé par le PORT, rejoint par un message simple (repli) : la borne
  //        du message s'applique ; un abandon reçu ne se lève jamais (une nouvelle demande
  //        du même job ne le réarme pas).
  {
    const horloge = creerHorloge();
    const sim = remplissageSimule(horloge, 400_000);
    const page = chargerPage(fichier, horloge, sim.remplir);
    const job = { id: `${fichier}-6b`, platform: fichier };
    const port = relierPort(page, "fillsell-remplissage");
    const versBg = [];
    port.onMessage.addListener((m) => versBg.push(m));
    port.postMessage({ type: "FILL_LISTING_PORT", job });
    await ticks();
    assert.ok(versBg.some((m) => m.type === "pret"), `${fichier} : le port a lancé le remplissage`);
    port.disconnect(); await ticks(); // le worker meurt : personne n'écoute plus le port
    const ec = page.ecouteurMessage();
    ec({ type: "FILL_LISTING", job, borneMs: 300_000, fillId: "C1" }, {}, () => {});
    assert.equal(page.page.abandonAvantEnvoi(job.id), null, `${fichier} : le repli classique attend de nouveau (garde levée)`);
    let r; ec({ type: "FILLSELL_ABANDON_REMPLISSAGE", jobId: job.id, fillId: "C1" }, {}, (x) => { r = x; });
    assert.deepEqual(JSON.parse(JSON.stringify(r)), { ok: true }, `${fichier} : abandon du repli reçu`);
    ec({ type: "FILL_LISTING", job, borneMs: 300_000, fillId: "C2" }, {}, () => {});
    assert.match(String(page.page.abandonAvantEnvoi(job.id)), /abandon reçu/, `${fichier} : une nouvelle demande ne lève pas l'abandon`);
    await horloge.avancer(400_000);
    assert.equal(sim.trace.debuts, 1, `${fichier} : un seul remplissage`);
    assert.equal(sim.trace.clics, 0, `${fichier} : aucun clic`);
  }
  ok(`${fichier}.js : sans port, borne → abandon → aucun clic (et sans abandon reçu) ; 290 s aboutit ; message sans borne inchangé ; jamais deux remplissages ; un abandon ne se lève jamais`);
}

// 7. fill_borne_ms = 20 min, port ÉTEINT : le port sert, sa borne de 20 min est tenue.
for (const fichier of ["beebs", "vinted", "leboncoin"]) {
  for (const [duree, aboutit] of [[19 * 60_000, true], [21 * 60_000, false]]) {
    const horloge = creerHorloge();
    const sim = remplissageSimule(horloge, duree);
    const page = chargerPage(fichier, horloge, sim.remplir);
    const messages = [];
    const api = chargerBackground({ horloge, page, messages, keepalive: false });
    const job = { id: `${fichier}-7-${duree}`, platform: fichier, platform_fields: { fill_borne_ms: 20 * 60_000 } };
    assert.equal(api.borneEffectiveRemplissage(job), 20 * 60_000, `${fichier} : borne effective 20 min, port éteint`);
    const etat = await lancer(api, job);
    await ticks();
    assert.ok(!messages.some((m) => m.type === "FILL_LISTING"), `${fichier} : pas de message simple (un appel unique de 20 min tuerait le worker)`);
    await horloge.avancer(duree + 1_000);
    if (aboutit) {
      assert.equal(etat.resultat?.success, true, `${fichier} : 19 min sous une borne de 20 min → abouti`);
      assert.equal(sim.trace.clics, 1);
    } else {
      assert.match(String(etat.erreur?.message), /^Timeout: pas de réponse du content script \(borne 20 min dépassée, dernière phase : /, `${fichier} : arrêt à 20 min`);
      assert.equal(sim.trace.clics, 0, `${fichier} : aucun clic après 20 min`);
    }
  }
}
ok("fill_borne_ms = 20 min sans port allumé : passe par le port, 19 min aboutit, 21 min arrêté à 20 min sans clic (Beebs, Vinted, Leboncoin)");

// 8. Routage et bornes : jamais plus court qu'aujourd'hui.
{
  const horloge = creerHorloge();
  const page = chargerPage("beebs", horloge, async () => ({ success: true }));
  const api = chargerBackground({ horloge, page, keepalive: false });
  const be = (job, port) => api.borneEffectiveRemplissage(job, port === undefined ? undefined : { port });
  assert.equal(be({ platform: "beebs", platform_fields: {} }), 300_000, "port éteint, aucune borne demandée : 300 s (chemin d'aujourd'hui)");
  assert.equal(api.portPourRemplissage({ platform: "beebs", platform_fields: {} }), false);
  assert.equal(be({ platform: "beebs", platform_fields: { fill_borne_ms: 60_000 } }), 600_000, "borne demandée trop courte : 10 min (jamais moins qu'aujourd'hui)");
  assert.equal(be({ platform: "leboncoin", platform_fields: { fill_borne_ms: 3_600_000 } }), 1_500_000, "plafond 25 min");
  assert.equal(be({ platform: "depop", platform_fields: { fill_borne_ms: 1_200_000 } }), 300_000, "Depop (sans écouteur de port) : message simple, 300 s");
  assert.equal(be({ platform: "vinted", platform_fields: {} }, true), 600_000, "port allumé : 10 min (inchangé)");
  assert.equal(be({ platform: "vinted", platform_fields: { fill_borne_ms: "1200000" } }), 300_000, "borne illisible : chemin d'aujourd'hui");
  for (const [j, attendu] of [[{ platform: "beebs", platform_fields: {} }, 300_000], [{ platform: "beebs", platform_fields: { fill_borne_ms: 1_200_000 } }, 1_200_000], [{ platform: "depop", platform_fields: {} }, 300_000]]) {
    assert.ok(be(j) >= 300_000 && be(j) === attendu);
  }
  // Le prévol Beebs (et Leboncoin/Depop) mesure contre la borne qui s'appliquera vraiment.
  assert.equal((bg.match(/borneMs: borneEffectiveRemplissage\(jobPrevol\)/g) ?? []).length, 2, "les deux pré-vols lisent la borne effective");
  // Le repli du port (aucun « pret ») passe par le message simple borné.
  assert.match(bg, /const fallback = deps\.fallback \?\? \(\(t, m\) => remplirParMessage\(t, m\?\.job \?\? job\)\);/);
  assert.match(bg, /if \(!keepaliveActif && !portPourRemplissage\(job\)\) return remplirParMessage\(tabId, job\);/);
  ok("routage : sans borne demandée → message simple 300 s ; borne demandée → port 10-25 min ; Depop → 300 s ; port allumé inchangé ; repli du port borné");
}
// Les trois écouteurs : l'abandon répond tout de suite, avant FILL_LISTING, sans geste.
for (const [fichier, src] of Object.entries(sources)) {
  const ec = ecouteurMessageDe(src);
  const iAb = ec.indexOf('if (msg?.type === "FILLSELL_ABANDON_REMPLISSAGE") {\n      sendResponse({ ok: abandonParMessage(msg) });\n      return true;\n    }');
  const iFl = ec.indexOf('if (msg?.type !== "FILL_LISTING") return;');
  assert.ok(iAb > 0 && iFl > iAb, `${fichier} : abandon traité avant FILL_LISTING`);
  const fa = extraireFonctionJs(src, "abandonAvantEnvoi");
  assert.ok(fa.indexOf("remplissagesParMessage.get(") < fa.indexOf("globalThis.__fillsellRemplissage"), `${fichier} : la garde lit aussi le message simple`);
}
ok("beebs.js, vinted.js, leboncoin.js : FILLSELL_ABANDON_REMPLISSAGE répond sans geste ; abandonAvantEnvoi lit le message simple puis le port");

// ═══ B. LEBONCOIN : CRITÈRES APRÈS DES PHOTOS LOURDES (Sonia) ═════════════════
log("B. Leboncoin — Sonia, « Polo garçon Lacoste 10 ans » : critères après les photos");
const constante = (src, nom) => {
  const m = src.match(new RegExp(`^const ${nom} = ([^\\n]+);$`, "m"));
  assert.ok(m, `constante ${nom} introuvable`);
  return `const ${nom} = ${m[1]};`;
};
{
  const ctx = vm.createContext({ Math, Number });
  vm.runInContext(`${constante(lbc, "LBC_SONDE_TARDIVE_MS")} ${constante(lbc, "LBC_SONDE_TARDIVE_MAX_MS")} ${constante(lbc, "LBC_DEBIT_PHOTOS_MIN_OCTETS_S")}
    ${extraireFonctionJs(lbc, "budgetCriteresTardifsLbc")} globalThis.__b = budgetCriteresTardifsLbc;`, ctx);
  const b = ctx.__b;
  assert.equal(b(0), 30_000, "sans photo : 30 s (inchangé)");
  assert.equal(b(465 * 1024), 30_000, "Tee shirt Adidas, 3 JPEG 465 Ko : 30 s (inchangé)");
  assert.equal(b(1_500_000), 30_000, "1,5 Mo : 30 s (inchangé)");
  assert.equal(b((1605 + 2091 + 2015) * 1024), 117_000, "Polo, 3 PNG 5 711 Ko : 117 s");
  assert.equal(b(7_789 * 1024), 120_000, "13 JPEG 7,8 Mo (4ab4651b) : 120 s (plafond)");
  assert.equal(b(NaN), 30_000); assert.equal(b(-5), 30_000); assert.equal(b(undefined), 30_000);
  ok("attente prolongée des critères = clamp(poids / 50 Ko/s, 30 s, 120 s) — rien ne change jusqu'à 1,5 Mo");
}
// Le VRAI attendreCriteresTardifsLbc sur un faux formulaire où les critères paraissent à T s.
function monterAttente(src, { octets, criteresA }) {
  const etat = { t: 0 };
  const fauxCritere = { tagName: "LABEL" };
  const document = {
    visibilityState: "hidden",
    body: { lastElementChild: { scrollIntoView() {} } },
    querySelector: (sel) => (sel.includes("label[for") && !sel.includes("submit") && etat.t >= criteresA ? fauxCritere : null),
    querySelectorAll: () => [],
  };
  class D extends Date { static now() { return etat.t; } }
  const ctx = vm.createContext({
    document, window: { scrollTo() {} }, console: { log() {}, warn() {} },
    sleep: async (ms) => { etat.t += ms; },
    Date: D, Math, Number, String, JSON,
  });
  const avecBudget = src.includes("function budgetCriteresTardifsLbc(");
  vm.runInContext(`${constante(src, "LBC_SONDE_TARDIVE_MS")}
    ${avecBudget ? `${constante(src, "LBC_SONDE_TARDIVE_MAX_MS")} ${constante(src, "LBC_DEBIT_PHOTOS_MIN_OCTETS_S")} let octetsPhotosEnvoyesLbc = ${octets}; ${extraireFonctionJs(src, "budgetCriteresTardifsLbc")}` : ""}
    ${constante(src, "LBC_SONDE_CRITERES_SELECTOR")} ${constante(src, "LBC_ETAT_LIBELLE_RE")}
    ${extraireFonctionJs(src, "findCriterionInputByLabelText")}
    ${extraireFonctionJs(src, "indicesChargementLbc")}
    ${extraireFonctionJs(src, "attendreCriteresTardifsLbc")}
    globalThis.__a = attendreCriteresTardifsLbc;`, ctx);
  return async () => { const w = []; const vu = await ctx.__a({}, w); return { vu, w, t: etat.t }; };
}
{
  let head = null;
  try { head = execFileSync("git", ["show", "HEAD:chrome-extension/content-scripts/leboncoin.js"], { encoding: "utf8", maxBuffer: 64 << 20 }).replace(/\r\n/g, "\n"); } catch { head = null; }
  const polo = (1605 + 2091 + 2015) * 1024;
  // Le Polo : critères ~70 s après la sonde (5,6 Mo de PNG sur une connexion modeste).
  const apres = await monterAttente(lbc, { octets: polo, criteresA: 70_000 })();
  assert.ok(apres.vu, "0.6.178 : critères trouvés");
  assert.match(apres.w.join(" | "), /critères : rendus tard, 70 s après la sonde/);
  if (head && !head.includes("function budgetCriteresTardifsLbc(")) {
    const avant = await monterAttente(head, { octets: polo, criteresA: 70_000 })();
    assert.equal(avant.vu, null, "HEAD : rien trouvé — le constat de Sonia reproduit");
    assert.match(avant.w.join(" | "), /critères : toujours aucun champ après 30 s de plus/);
  }
  // Critères jamais rendus : arrêt borné, note datée du poids (prefixe inchangé, lu par lot-i-3110).
  const jamais = await monterAttente(lbc, { octets: polo, criteresA: Infinity })();
  assert.equal(jamais.vu, null);
  assert.match(jamais.w.join(" | "), /^critères : toujours aucun champ après 117 s de plus \(avant : visibilité hidden .* ; photos envoyées : 5711 Ko\)$/);
  assert.ok(jamais.t >= 117_000 && jamais.t < 118_000, `arrêt borné à 117 s (${jamais.t})`);
  // Les dépôts qui passent : résultat identique à HEAD.
  for (const [octets, criteresA] of [[465 * 1024, 3_000], [465 * 1024, 24_000], [0, 10_000], [900 * 1024, 40_000]]) {
    const n178 = await monterAttente(lbc, { octets, criteresA })();
    if (head && !head.includes("function budgetCriteresTardifsLbc(")) {
      const nHead = await monterAttente(head, { octets, criteresA })();
      assert.equal(Boolean(n178.vu), Boolean(nHead.vu), `même issue que HEAD (${octets} o, critères à ${criteresA} ms)`);
      // Seul ajout : le poids envoyé, en fin de note (diagnostic) — le reste au caractère près.
      assert.deepEqual(n178.w.map((x) => x.replace(/ ; photos envoyées : \d+ Ko\)$/, ")")), nHead.w, `mêmes notes que HEAD (${octets} o, critères à ${criteresA} ms)`);
    }
  }
  ok(`attendreCriteresTardifsLbc : Polo (5,6 Mo, critères à 70 s) trouvé${head ? " — HEAD ne trouvait rien" : ""} ; jamais rendu → arrêt à 117 s ; dépôts légers identiques à HEAD`);
  assert.match(extraireFonctionJs(lbc, "lbcRemplirJusquAApercu"), /octetsPhotosEnvoyesLbc = 0;[^\n]*\n\s*const photoInput = await advanceWizardTo/, "poids remis à zéro à chaque remplissage, avant les photos");
}
// allegerPhotoLbc (vrai code) avec une conversion injectée.
{
  const ctx = vm.createContext({ File, Blob, Promise, String, Number, Math, sleep: () => new Promise(() => {}) }); // la borne de 10 s ne sonne jamais ici : la conversion injectée tranche
  vm.runInContext(`${constante(lbc, "LBC_PNG_A_ALLEGER_OCTETS")} ${constante(lbc, "LBC_JPEG_QUALITE")} ${constante(lbc, "LBC_ALLEGEMENT_DELAI_MS")}
    async function pngEnJpegLbc() { throw new Error("non injectée"); }
    ${extraireFonctionJs(lbc, "allegerPhotoLbc")}
    ${extraireFonctionJs(lbc, "bilanAllegementLbc")}
    globalThis.__f = { allegerPhotoLbc, bilanAllegementLbc };`, ctx);
  const { allegerPhotoLbc, bilanAllegementLbc } = ctx.__f;
  const png = (ko) => new File([new Uint8Array(ko * 1024)], "photo_0.png", { type: "image/png" });
  const jpeg = (ko) => new Blob([new Uint8Array(ko * 1024)], { type: "image/jpeg" });
  const qualites = [];
  const r1 = await allegerPhotoLbc(png(2015), async (_b, q) => { qualites.push(q); return jpeg(290); });
  assert.equal(r1.file.type, "image/jpeg"); assert.equal(r1.file.name, "photo_0.jpg"); assert.equal(r1.file.size, 290 * 1024);
  assert.deepEqual(JSON.parse(JSON.stringify(r1.allegee)), { avant: 2015 * 1024, apres: 290 * 1024 }); assert.deepEqual(qualites, [0.92]);
  const j0 = new File([new Uint8Array(150 * 1024)], "photo_1.jpg", { type: "image/jpeg" });
  let appel = 0; const espion = async () => { appel++; return jpeg(1); };
  assert.equal((await allegerPhotoLbc(j0, espion)).file, j0, "JPEG : jamais touché");
  const p0 = png(200);
  assert.equal((await allegerPhotoLbc(p0, espion)).file, p0, "petit PNG (≤ 300 Ko) : jamais touché");
  const w0 = new File([new Uint8Array(900 * 1024)], "photo_2.webp", { type: "image/webp" });
  assert.equal((await allegerPhotoLbc(w0, espion)).file, w0, "WebP : jamais touché");
  assert.equal(appel, 0, "aucune conversion tentée hors PNG lourd");
  const p1 = png(800);
  assert.equal((await allegerPhotoLbc(p1, async () => jpeg(900))).file, p1, "JPEG plus lourd : le PNG d'origine");
  assert.equal((await allegerPhotoLbc(p1, async () => { throw new Error("décodage impossible"); })).file, p1, "échec : le PNG d'origine");
  assert.equal((await allegerPhotoLbc(p1, () => new Promise(() => {}), async () => {})).file, p1, "lenteur (10 s) : le PNG d'origine");
  assert.equal((await allegerPhotoLbc(p1, async () => new Blob([new Uint8Array(10)], { type: "image/png" }))).file, p1, "conversion qui ne rend pas de JPEG : le PNG d'origine");
  assert.deepEqual(JSON.parse(JSON.stringify(bilanAllegementLbc([r1, { file: j0, allegee: null }, { file: p1, allegee: { gardee: "x" } }]))),
    { n: 1, avant_ko: 2015, apres_ko: 290, png_gardes: 1 });
  assert.equal(bilanAllegementLbc([{ allegee: null }]), null, "rien d'allégé : aucun bilan");
  ok("allegerPhotoLbc : PNG > 300 Ko → JPEG 0,92 seulement s'il est plus léger ; JPEG, WebP, petit PNG jamais touchés ; échec ou lenteur → l'original");
}
// pngEnJpegLbc (vrai code) sur une toile simulée : fond blanc d'abord, mêmes dimensions, JPEG 0,92.
{
  const appels = [];
  class OffscreenCanvas {
    constructor(w, h) { appels.push(["toile", w, h]); }
    getContext() { return { set fillStyle(v) { appels.push(["fond", v]); }, fillRect: (...a) => appels.push(["rect", ...a]), drawImage: (_i, x, y) => appels.push(["image", x, y]) }; }
    async convertToBlob(o) { appels.push(["jpeg", o.type, o.quality]); return new Blob([new Uint8Array(5)], { type: o.type }); }
  }
  let ferme = false;
  const ctx = vm.createContext({ OffscreenCanvas, createImageBitmap: async () => ({ width: 1024, height: 1024, close: () => { ferme = true; } }), document: {}, Promise });
  vm.runInContext(`${extraireFonctionJs(lbc, "pngEnJpegLbc")} globalThis.__p = pngEnJpegLbc;`, ctx);
  const sortie = await ctx.__p(new Blob([new Uint8Array(3)], { type: "image/png" }), 0.92);
  assert.equal(sortie.type, "image/jpeg");
  assert.deepEqual(appels, [["toile", 1024, 1024], ["fond", "#ffffff"], ["rect", 0, 0, 1024, 1024], ["image", 0, 0], ["jpeg", "image/jpeg", 0.92]]);
  assert.ok(ferme, "image libérée");
  ok("pngEnJpegLbc : mêmes dimensions, fond blanc avant l'image (une transparence ne devient jamais noire), JPEG 0,92");
}
// uploadPhotos (vrai code) : photos allégées remises au formulaire, poids relevé, bilan joint.
{
  const ctx = vm.createContext({
    File, Blob, Promise, String, Number, Math, console: { log() {}, warn() {} }, Event: class { constructor(t) { this.type = t; } },
    DataTransfer: class { constructor() { const l = []; this.items = { add: (f) => l.push(f) }; this.files = l; } },
    sleep: () => new Promise(() => {}), humanPause: async () => {}, photoPreviewCount: () => 0, budgetPhotosMs: () => 0,
    waitPhotosUploaded: async () => ({ confirmed: true, note: null }),
  });
  vm.runInContext(`${constante(lbc, "LBC_PNG_A_ALLEGER_OCTETS")} ${constante(lbc, "LBC_JPEG_QUALITE")} ${constante(lbc, "LBC_ALLEGEMENT_DELAI_MS")}
    let octetsPhotosEnvoyesLbc = 0; let bilanPhotosLbc = { gratuites: 3, envoyees: 3 };
    const tailles = { a: [2015, "image/png"], b: [150, "image/jpeg"], c: [1605, "image/png"] };
    async function urlToFile(url, i) { const [ko, type] = tailles[url]; return new File([new Uint8Array(ko * 1024)], "photo_" + i + (type === "image/png" ? ".png" : ".jpg"), { type }); }
    async function pngEnJpegLbc(f) { return new Blob([new Uint8Array(Math.round(f.size / 7))], { type: "image/jpeg" }); }
    ${extraireFonctionJs(lbc, "allegerPhotoLbc")}
    ${extraireFonctionJs(lbc, "bilanAllegementLbc")}
    ${extraireFonctionJs(lbc, "uploadPhotos")}
    globalThis.__u = { uploadPhotos, etat: () => ({ octetsPhotosEnvoyesLbc, bilanPhotosLbc }) };`, ctx);
  const input = { files: null, evenements: [], dispatchEvent(e) { this.evenements.push(e.type); } };
  const note = await ctx.__u.uploadPhotos(input, [{ url: "a" }, { url: "b" }, { url: "c" }]);
  assert.equal(note, null);
  assert.deepEqual(input.files.map((f) => f.type), ["image/jpeg", "image/jpeg", "image/jpeg"], "les deux PNG lourds partent en JPEG, le JPEG tel quel");
  assert.deepEqual(input.files.map((f) => f.name), ["photo_0.jpg", "photo_1.jpg", "photo_2.jpg"], "ordre de la fiche gardé");
  assert.equal(input.files[1].size, 150 * 1024, "le JPEG d'origine intact");
  const { octetsPhotosEnvoyesLbc, bilanPhotosLbc } = ctx.__u.etat();
  assert.equal(octetsPhotosEnvoyesLbc, input.files.reduce((s, f) => s + f.size, 0), "le poids RÉELLEMENT remis au formulaire");
  assert.equal(bilanPhotosLbc.allegees.n, 2);
  assert.equal(bilanPhotosLbc.allegees.avant_ko, 2015 + 1605);
  assert.deepEqual(input.evenements, ["change"]);
  ok("uploadPhotos : PNG lourds remplacés par leur JPEG, ordre gardé, poids envoyé relevé, bilan photos_lbc.allegees joint");
}

// ═══ D. BEEBS : LA FICHE LUE AVANT UNE REPUBLICATION (bandeau de l'application) ═
log("D. Beebs — capture de la fiche : le bandeau « Voir dans l’appli / L’appli tout-en-un » n'est pas un attribut");
{
  // Un DOM minimal : des éléments, leurs enfants, leur texte (les seules propriétés que lit la branche Beebs).
  class El {
    constructor(tag, kids = [], text = null) {
      this.tagName = tag.toUpperCase(); this.children = []; this.parentElement = null; this._text = text;
      for (const k of kids) { k.parentElement = this; this.children.push(k); }
    }
    get textContent() { return this._text ?? this.children.map((c) => c.textContent).join(""); }
    querySelectorAll(sel) { return sel === "*" ? descendants(this) : []; }
    querySelector() { return null; }
    closest() { return null; }
  }
  const descendants = (el) => el.children.flatMap((c) => [c, ...descendants(c)]);
  const ligne = (l, v) => new El("div", [new El("span", [], l), new El("span", [], v)]);
  // Fiches reconstituées sur les lectures RÉELLES en base (champs_lus_sur_l_annonce.lus.attributs_affiches) :
  // f09c38ae (Boucles d'oreilles, 26780884), 0324061c (Bijoux « Taille : Ajustable », index size_ring),
  // a6b3a29e (« Pointure : 38 »), 0f07bbd0 (Baby Unicorn, Jeux scientifiques, sans Âge à l'index).
  const BANDEAU = [["Voir dans l’appli", "C’est plus d’économies et moins de chichis."], ["L’appli tout-en-un", "Télécharger l’application"]];
  const fiche = (lignes, { titre = "Annonce", produit = {} } = {}) => {
    const body = new El("body", [new El("main", [new El("h1", [], titre), new El("section", lignes.map(([l, v]) => ligne(l, v)))])]);
    const ld = { "@context": "https://schema.org", "@type": "Product", name: titre, image: ["https://cdn.beebs.app/0123456789abcdef0123/1.jpg"], ...produit };
    return {
      querySelectorAll(sel) {
        if (sel === "body *") return descendants(body);
        if (sel === "script[type='application/ld+json']") return [{ textContent: JSON.stringify(ld) }];
        return [];
      },
      querySelector() { return null; },
      getElementById() { return null; },
      createElement() { return { set innerHTML(v) { this._t = String(v); }, get textContent() { return this._t ?? ""; } }; },
    };
  };
  const debut = "function capturerFicheEnPage(plateforme, html = null) {";
  const extraireCapture = (src) => src.slice(src.indexOf(debut), src.indexOf("\n}\n", src.indexOf(debut)) + 2);
  const capturer = (src, doc) => new Function("document", `${extraireCapture(src)}; return capturerFicheEnPage("beebs");`)(doc);
  let headBg = null;
  try { headBg = execFileSync("git", ["show", "HEAD:chrome-extension/background.js"], { encoding: "utf8", maxBuffer: 64 << 20 }).replace(/\r\n/g, "\n"); } catch { headBg = null; }
  const cas = [
    ["f09c38ae — Boucles d'oreilles (Bijoux femme)", [["État", "Très bon état"], ["Marque", "Autre"], ["Couleur", "Doré"], ...BANDEAU], { brand: { name: "Autre" }, color: "Doré" },
      { "État": "Très bon état", "Marque": "Autre", "Couleur": "Doré" }],
    ["0324061c — Lot de bijoux (Taille : Ajustable)", [["État", "Très bon état"], ["Marque", "Sans marque"], ["Taille", "Ajustable"], ["Couleur", "Multicolore"], ...BANDEAU], {},
      { "État": "Très bon état", "Marque": "Sans marque", "Taille": "Ajustable", "Couleur": "Multicolore" }],
    ["a6b3a29e — tennis fille (Pointure : 38)", [["État", "Très bon état"], ["Marque", "Tissaia"], ["Couleur", "Rose"], ["Pointure", "38"], ...BANDEAU], {},
      { "État": "Très bon état", "Marque": "Tissaia", "Couleur": "Rose", "Pointure": "38" }],
    ["0f07bbd0 — Baby Unicorn (Âge absent de l'annonce)", [["État", "Très bon état"], ["Marque", "IMC Toys"], ...BANDEAU], { brand: { name: "IMC Toys" } },
      { "État": "Très bon état", "Marque": "IMC Toys" }],
    ["fiche sans bandeau (Âge, Fermeture)", [["État", "Bon état"], ["Âge", "8 ans - 12 ans"], ["Fermeture", "À enfiler"]], {},
      { "État": "Bon état", "Âge": "8 ans - 12 ans", "Fermeture": "À enfiler" }],
    ["fiche réduite au bandeau", [...BANDEAU], {}, null],
  ];
  for (const [nom, lignes, produit, attendu] of cas) {
    const c = capturer(bg, fiche(lignes, { produit }));
    assert.deepEqual(JSON.parse(JSON.stringify(c.attributs_affiches)), attendu, `${nom} : attributs affichés sans le bandeau`);
    if (headBg) {
      const h = capturer(headBg, fiche(lignes, { produit }));
      const hSans = h.attributs_affiches ? Object.fromEntries(Object.entries(h.attributs_affiches).filter(([k]) => !BANDEAU.some(([l]) => l === k))) : null;
      assert.deepEqual(JSON.parse(JSON.stringify(c.attributs_affiches)), Object.keys(hSans ?? {}).length ? JSON.parse(JSON.stringify(hSans)) : null, `${nom} : HEAD moins le bandeau, au caractère près`);
      const { attributs_affiches: _a, ...resteNouveau } = c; const { attributs_affiches: _b, ...resteHead } = h;
      assert.deepEqual(JSON.parse(JSON.stringify(resteNouveau)), JSON.parse(JSON.stringify(resteHead)), `${nom} : tout le reste de la capture identique à HEAD (taille, âge, état, marque…)`);
    }
  }
  const c2 = capturer(bg, fiche(cas[1][1]));
  assert.equal(c2.taille, "Ajustable", "la Taille affichée est lue (ligneLibellee) ");
  const c5 = capturer(bg, fiche(cas[4][1]));
  assert.equal(c5.age, "8 ans - 12 ans", "l'Âge affiché est lu");
  const c1 = capturer(bg, fiche(cas[0][1]));
  assert.equal(c1.taille, null, "f09c38ae : aucune Taille sur la fiche → null (jamais inventée)");
  ok(`capturerFicheEnPage (Beebs) : bandeau écarté sur ${cas.length} fiches${headBg ? ", tout le reste identique à HEAD" : ""} ; Taille, Pointure, Âge, Fermeture lus quand la fiche les montre ; jamais inventés`);
}

// ═══ C. VERSION ═══════════════════════════════════════════════════════════════
log("C. Version");
{
  assert.equal(manifest.version, "0.6.178");
  assert.match(bg, /^const FILLSELL_BUILD =\n {2}"2026-11-07-soir \(0\.6\.178 :/m);
  assert.match(lbc, /^const LEBONCOIN_BUILD = "2026-11-07-soir-photos-lourdes \(0\.6\.178 :/m);
  ok("manifest 0.6.178 ; FILLSELL_BUILD et LEBONCOIN_BUILD datés du 07/11 soir");
}

log(`\n✓ extension 0.6.178 : ${n} contrôles verts`);
