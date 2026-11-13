// ═══════════════════════════════════════════════════════════════════════════
// VERROU — REPUBLICATION VINTED SANS PERTE (lot « zéro problème », 13/11, point 5e)
// ═══════════════════════════════════════════════════════════════════════════
//   npm run selftest:vinted-envoi-sans-perte
// Le CODE LIVRÉ est extrait de chrome-extension/ et de supabase/functions/_shared et EXÉCUTÉ (jamais une copie).
//
// A. Compte ac19c8c9, tâche acae56d5 (page Vinted en italien, 09/11, build 0.6.183) : la couleur connue (color1_id 5)
//    était ARMÉE juste avant le clic « Ajouter » ; l'armement voyage par postMessage (une TÂCHE) alors que le clic, la
//    validation et l'envoi de la page partent dans la MÊME tâche (microtâches) : la sonde a lu le corps AVANT de recevoir
//    l'armement → « color_ids: [] », 400 « Compila il campo "colore" ». Rejoué ici sur la VRAIE fin de
//    remplirFormulaireVinted (vinted.js) et la VRAIE sonde (background.js), le corps de la page étant celui relevé en
//    base. Correctif : l'armement est ACCUSÉ par la sonde avant le clic.
// B. La sonde pose l'ÉTAT (status_id) quand la page le laisse vide, par son identifiant, dans la forme que le corps porte
//    (item_attributes { code: "condition", ids }, relevé réel du 10/11 ; `status_id` seulement si la clé existe), jamais
//    par-dessus un état posé par la page. Corps relevé de la tâche 641fb37e (compte 63ad8597, 09/11, 0.6.184).
// C. L'identifiant d'état connu (copie, capture, réponse de la personne, fiche) passe par le juge d'état UNIQUE
//    (_shared/etat-correspondance.js, copie générée dans vinted.js) — jamais un libellé cherché.
// D. Tâche 641fb37e : le « Vinted refuse encore » du 11/11 21:39 n'a jamais eu lieu — la relance du correctif 0.6.186
//    gardait les compteurs d'essais (recreation_tentee n = 3) et handler-watch l'a ressortie 3 min plus tard, sans un seul
//    essai. Rejoué sur la VRAIE décision de handler-watch. (Le second réarmement : SUSPENDU, décision de Nico — garde.)
// E. Copie d'une recréation retrouvée par le NUMÉRO renvoyé par Vinted (gardé à travers la redirection vers le profil)
//    ou par l'EMPREINTE de ses photos (identifiants des photos de notre envoi) — JAMAIS par le titre.
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { extraireFonctionJs } from "./lib/extraire-fonction-js.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => fs.readFileSync(join(ROOT, p), "utf8").replace(/\r\n/g, "\n");
const bg = lire("chrome-extension/background.js");
const vt = lire("chrome-extension/content-scripts/vinted.js");

let verts = 0;
let rouges = 0;
const cas = (nom, fn) => {
  try { fn(); verts++; console.log(`  ✓ ${nom}`); } catch (e) { rouges++; console.log(`  ✗ ${nom}\n      ${String(e?.message ?? e).split("\n")[0]}`); }
};
const casA = async (nom, fn) => {
  try { await fn(); verts++; console.log(`  ✓ ${nom}`); } catch (e) { rouges++; console.log(`  ✗ ${nom}\n      ${String(e?.message ?? e).split("\n")[0]}`); }
};
const essai = (nom) => { try { return extraireFonctionJs(vt, nom); } catch { return ""; } };
const essaiBg = (nom) => { try { return extraireFonctionJs(bg, nom); } catch { return ""; } };

// ── La sonde réelle (monde MAIN de la page), extraite d'installNetworkProbe ──────────────────────────────────────────
const iProbe = bg.indexOf("async function installNetworkProbe(");
const iFunc = bg.indexOf("func: (endpointSrc, platform) => {", iProbe);
assert.ok(iProbe > 0 && iFunc > iProbe, "sonde introuvable");
const corpsSonde = extraireFonctionJs(`function __sonde(endpointSrc, platform) ${bg.slice(bg.indexOf("{", iFunc + 30))}`, "__sonde");
const endpointVinted = bg.match(/vinted: String\.raw`([^`]+)`/)?.[1];
assert.ok(endpointVinted, "motif de la sonde Vinted introuvable");

/** Une page Vinted minimale : un window, une file de TÂCHES pour postMessage (setImmediate), sessionStorage. */
const REFUS_400 = { status: 400, corps: '{"code":99,"message_code":"validation_error"}' };
function monterPage(opts = {}) {
  const reponse = opts.reponse ?? REFUS_400;
  const ecouteurs = [];
  const stockage = new Map();
  const envois = [];
  const win = {
    location: { origin: "https://www.vinted.fr", href: "https://www.vinted.fr/items/new" },
    addEventListener: (t, f) => { if (t === "message") ecouteurs.push(f); },
    removeEventListener: (t, f) => { const i = ecouteurs.indexOf(f); if (i >= 0) ecouteurs.splice(i, 1); },
    // postMessage = une TÂCHE (jamais une microtâche) : c'est tout le défaut d'acae56d5.
    postMessage: (data) => { setImmediate(() => { for (const f of [...ecouteurs]) f({ source: win, data }); }); },
    fetch: async (url, init) => {
      envois.push({ url: String(url), corps: init?.body });
      return { status: reponse.status, clone: () => ({ text: async () => reponse.corps }) };
    },
    sessionStorage: {
      getItem: (k) => (stockage.has(k) ? stockage.get(k) : null),
      setItem: (k, v) => stockage.set(k, String(v)),
      removeItem: (k) => stockage.delete(k),
    },
  };
  class XHR { open(m, u) { this.__m = m; this.__u = u; } send() {} addEventListener() {} }
  const ctx = vm.createContext({
    window: win, sessionStorage: win.sessionStorage, XMLHttpRequest: XHR, console: { log() {}, warn() {}, error() {} },
    setTimeout, clearTimeout, setImmediate, Promise, Date, Number, String, Array, Set, Map, Object, JSON, Error, RegExp, Math,
  });
  vm.runInContext(`${corpsSonde}\n__sonde(${JSON.stringify(endpointVinted)}, "vinted");`, ctx);
  return { win, ctx, envois, stockage };
}

// ── La VRAIE fin de remplirFormulaireVinted : de l'armement de la couleur au clic « Ajouter » ─────────────────────────
const fv = extraireFonctionJs(vt, "remplirFormulaireVinted");
// Ancre sans nom de personne (verrou donnees-clients) : la ligne du commentaire du 07/11 sur la couleur, prise entière.
const ANCRE_QUEUE = "La couleur aux identifiants connus part au POST si la";
const iQ = fv.lastIndexOf("\n", fv.indexOf(ANCRE_QUEUE)) + 1;
const jQ = fv.indexOf("publishBtn.click();", iQ);
assert.ok(iQ > 0 && jQ > iQ, "fin de remplirFormulaireVinted introuvable");
const queue = fv.slice(iQ, jQ + "publishBtn.click();".length);
const blocJuge = (() => {
  const d = vt.indexOf("// ═══ DÉBUT — COPIE GÉNÉRÉE de supabase/functions/_shared/etat-correspondance.js");
  const f = vt.indexOf("// ═══ FIN — COPIE GÉNÉRÉE du juge d'état ═══");
  return d >= 0 && f > d ? vt.slice(d, f) : "";
})();
const aides = ["vintedFieldSelector", "armerCouleurPourPost", "idsCouleurConnusDuJob", "waitForElement", "waitForKey",
  "planifierSurWorker", "armerEtatPourPost", "idEtatConnuDuJob", "attendreAccuseArmement"].map(essai).join("\n");

/**
 * Rejoue la fin du remplissage sur une page dont le bouton « Ajouter » envoie le corps relevé.
 * `envoiMemeTache` : la page envoie dans la même tâche que le clic (microtâches) — le cas d'acae56d5 ;
 * sinon après une tâche (le cas où l'armement gagnait la course par chance).
 */
async function rejouerQueue({ fields, color = "", corps, envoiMemeTache = true, champs = ["color", "condition"] }) {
  const { win, ctx, envois } = monterPage();
  const bouton = {
    click() {
      const partir = () => win.fetch("https://www.vinted.fr/api/v2/item_upload/items", { method: "POST", body: JSON.stringify(corps) });
      if (envoiMemeTache) Promise.resolve().then(() => Promise.resolve()).then(partir);
      else setImmediate(partir);
    },
  };
  const presents = new Set(champs.map((c) => (c === "color" ? "#color" : c === "condition" ? "#condition" : `#${c}`)));
  ctx.document = { querySelector: (sel) => ([...presents].some((p) => String(sel).startsWith(p)) ? { id: "champ" } : null), body: {} };
  ctx.CSS = { escape: (s) => s };
  ctx.MutationObserver = class { observe() {} disconnect() {} };
  const diag = [];
  vm.runInContext(`var __timerWorker = null; var __timerSeq = 0; var __timerCallbacks = new Map();
    ${blocJuge}
    ${aides}
    const __S = Promise.resolve({ resolveSelector: () => ({ el: globalThis.__bouton }) });
    function sel() { return __S; }
    function marquerPhase() {}
    function abandonAvantEnvoi() { return null; }
    function envoyerInstantaneMesures() {}
    globalThis.__queue = async function (job, fields, _color, onePassDeleted, diagnosticsRecreation, warnings) {
      ${queue}
    };`, ctx);
  ctx.__bouton = bouton;
  await ctx.__queue({ id: "tache-essai" }, fields, color, false, diag, []);
  for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r));
  const parti = envois.find((e) => /item_upload\/items/.test(e.url));
  return { item: parti ? JSON.parse(parti.corps).item : null, diag };
}

// Les relevés réels (corps envoyés, base) — comptes cités par id8, aucune donnée de personne.
const CORPS_ACAE56D5 = { item: { id: null, catalog_id: 221, isbn: null, ai_photo: false, price: "5", package_size_id: 1, color_ids: [],
  brand_id: null, brand: "Powermiss", item_attributes: [{ code: "condition", ids: [2] }, { code: "material", ids: [44] }] }, feedback_id: null };
const FIELDS_ACAE56D5 = { vinted_ids: { catalog_id: 221, status_id: 2, color_ids: [5] }, vintedAspects: { condition: "Ottime" },
  vinted_ids_actifs: true, etat: "Ottime" };
const CORPS_641FB37E = { item: { id: null, catalog_id: 2942, isbn: null, ai_photo: false, price: "15", package_size_id: 2, color_ids: [4, 1],
  brand_id: 1, brand: "Sans marque", item_attributes: [{ code: "material", ids: [300] }] }, feedback_id: null };
const FIELDS_641FB37E = { vinted_ids: { catalog_id: 2942, status_id: 1, color_ids: [4, 1] }, etat: "Neuf sans étiquette" };

console.log("A. Compte ac19c8c9, tâche acae56d5 — la couleur armée juste avant le clic (rejeu de la vraie fin du remplissage)");
await casA("la page envoie dans la même tâche que le clic (cas réel) : la couleur 5 PART dans le corps", async () => {
  const r = await rejouerQueue({ fields: FIELDS_ACAE56D5, corps: CORPS_ACAE56D5, envoiMemeTache: true });
  assert.ok(r.item, "aucun envoi");
  assert.deepEqual(r.item.color_ids, [5], `corps parti avec color_ids ${JSON.stringify(r.item.color_ids)} (relevé du 09/11 : [])`);
});
await casA("la page envoie une tâche plus tard : couleur posée aussi (le défaut était une course, pas une règle)", async () => {
  const r = await rejouerQueue({ fields: FIELDS_ACAE56D5, corps: CORPS_ACAE56D5, envoiMemeTache: false });
  assert.deepEqual(r.item?.color_ids, [5]);
});
await casA("l'état posé par la page (condition [2]) n'est jamais touché", async () => {
  const r = await rejouerQueue({ fields: FIELDS_ACAE56D5, corps: CORPS_ACAE56D5, envoiMemeTache: true });
  assert.deepEqual(r.item.item_attributes.filter((a) => a.code === "condition"), [{ code: "condition", ids: [2] }]);
});
await casA("le diagnostic dit que l'armement a été ACCUSÉ par la sonde avant le clic", async () => {
  const r = await rejouerQueue({ fields: FIELDS_ACAE56D5, corps: CORPS_ACAE56D5, envoiMemeTache: true });
  assert.ok(r.diag.some((l) => /couleur 5 .*accusé par la sonde/.test(l)), JSON.stringify(r.diag));
});
await casA("une couleur choisie par la personne (vintedAspects.color) : rien armé, rien posé", async () => {
  const r = await rejouerQueue({ fields: FIELDS_ACAE56D5, color: "Rosa", corps: CORPS_ACAE56D5, envoiMemeTache: true });
  assert.deepEqual(r.item.color_ids, []);
});

console.log("B. Compte 63ad8597, tâche 641fb37e — l'état part par son identifiant quand la page le laisse vide");
await casA("corps relevé du 09/11 (aucun état) : item_attributes condition [1] posé par la sonde", async () => {
  const r = await rejouerQueue({ fields: FIELDS_641FB37E, corps: CORPS_641FB37E, envoiMemeTache: true });
  assert.ok(r.item);
  assert.deepEqual(r.item.item_attributes.find((a) => a.code === "condition"), { code: "condition", ids: [1] },
    JSON.stringify(r.item.item_attributes));
  assert.deepEqual(r.item.item_attributes.find((a) => a.code === "material"), { code: "material", ids: [300] }, "les autres attributs restent");
});
await casA("formulaire sans champ État : rien armé, rien posé", async () => {
  const r = await rejouerQueue({ fields: FIELDS_641FB37E, corps: CORPS_641FB37E, envoiMemeTache: true, champs: ["color"] });
  assert.ok(!r.item.item_attributes.some((a) => a.code === "condition"));
});
{
  // La sonde seule : armement direct, corps variés.
  const armer = async (data) => {
    const p = monterPage();
    p.win.postMessage({ __fillsellArmeEtat: true, ...data });
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setImmediate(r));
    return p;
  };
  const envoyer = async (p, item) => {
    await p.win.fetch("https://www.vinted.fr/api/v2/item_upload/items", { method: "POST", body: JSON.stringify({ item }) });
    const e = p.envois.at(-1);
    return JSON.parse(e.corps).item;
  };
  await casA("clé status_id présente et vide : posée (et l'entrée condition d'item_attributes)", async () => {
    const p = await armer({ id: 2 });
    const it = await envoyer(p, { catalog_id: 221, status_id: null, item_attributes: [] });
    assert.equal(it.status_id, 2);
    assert.deepEqual(it.item_attributes, [{ code: "condition", ids: [2] }]);
  });
  await casA("⛔ jamais par-dessus un état de la page (status_id ou condition)", async () => {
    const p = await armer({ id: 2 });
    assert.equal((await envoyer(p, { catalog_id: 221, status_id: 3, item_attributes: [] })).status_id, 3);
    const it = await envoyer(p, { catalog_id: 221, item_attributes: [{ code: "condition", ids: [6] }] });
    assert.deepEqual(it.item_attributes, [{ code: "condition", ids: [6] }]);
  });
  await casA("non armé, désarmé, identifiant illisible, autre requête, corps sans article : rien", async () => {
    const p0 = monterPage();
    assert.ok(!(await envoyer(p0, { catalog_id: 1, item_attributes: [] })).item_attributes.length);
    const p1 = await armer({ id: null });
    assert.ok(!(await envoyer(p1, { catalog_id: 1, item_attributes: [] })).item_attributes.length);
    const p2 = await armer({ id: "x" });
    assert.ok(!(await envoyer(p2, { catalog_id: 1, item_attributes: [] })).item_attributes.length);
    const p3 = await armer({ id: 1 });
    await p3.win.fetch("https://www.vinted.fr/api/v2/item_upload/attributes", { method: "POST", body: JSON.stringify({ item: { catalog_id: 1 } }) });
    assert.equal(JSON.parse(p3.envois.at(-1).corps).item.item_attributes, undefined);
    await p3.win.fetch("https://www.vinted.fr/api/v2/item_upload/items", { method: "POST", body: JSON.stringify({ foo: 1 }) });
    assert.deepEqual(JSON.parse(p3.envois.at(-1).corps), { foo: 1 });
  });
  await casA("la sonde ACCUSE l'armement (couleur et état) : c'est ce que le remplissage attend avant le clic", async () => {
    const p = monterPage();
    const recus = [];
    p.win.addEventListener("message", (e) => { if (e.data?.__fillsellArmeAccuse) recus.push(e.data.quoi); });
    p.win.postMessage({ __fillsellArmeEtat: true, id: 1 });
    p.win.postMessage({ __fillsellArmeCouleur: true, ids: [5] });
    for (let i = 0; i < 4; i++) await new Promise((r) => setImmediate(r));
    assert.deepEqual(recus.sort(), ["couleur", "etat"]);
  });
}

console.log("C. L'identifiant d'état connu passe par le juge d'état unique (copie générée dans vinted.js)");
{
  const { genererCopieVinted } = await import(pathToFileURL(join(ROOT, "scripts/gen-etat-correspondance-extension.mjs")).href).catch(() => ({}));
  cas("vinted.js porte la copie GÉNÉRÉE et à jour du juge d'état", () => {
    assert.equal(typeof genererCopieVinted, "function", "générateur sans copie Vinted");
    assert.ok(blocJuge.length > 0, "copie absente de vinted.js");
    assert.equal(genererCopieVinted(vt), vt, "copie périmée : node scripts/gen-etat-correspondance-extension.mjs");
  });
  const ctx = vm.createContext({ Number, String, Array, Object, Set, Map, JSON, RegExp });
  let idEtat = null;
  try {
    vm.runInContext(`${blocJuge}\n${essai("idEtatConnuDuJob")}\nglobalThis.__f = idEtatConnuDuJob;`, ctx);
    idEtat = ctx.__f;
  } catch { /* absente : rouge ci-dessous */ }
  const v = (pf) => (typeof idEtat === "function" ? idEtat(pf) : "absente");
  cas("capture : vinted_ids.status_id, puis la copie (republish_snapshot), puis l'attribut condition capturé", () => {
    assert.equal(v({ vinted_ids: { status_id: 1 } }), 1);
    assert.equal(v({ republish_snapshot: { status_id: 2 } }), 2);
    assert.equal(v({ itemAttributesCaptures: [{ code: "condition", ids: [3] }] }), 3);
  });
  cas("la réponse de la personne prime, dans n'importe quelle langue de Vinted (« Très bon état », « Ottime »)", () => {
    assert.equal(v({ vintedAspects: { condition: "Très bon état" }, vinted_ids: { status_id: 1 } }), 2);
    assert.equal(v({ vintedAspects: { condition: "Ottime" } }), 2);
    assert.equal(v({ vintedAspects: { condition: "New with tags" } }), 6);
  });
  cas("⛔ une réponse illisible n'est jamais remplacée par la copie ; un niveau sans identifiant (« Neuf ») : rien", () => {
    assert.equal(v({ vintedAspects: { condition: "blabla" }, vinted_ids: { status_id: 1 } }), null);
    assert.equal(v({ etat: "Neuf" }), null);
  });
  cas("fiche (publication) : « Neuf avec étiquette » → 6 ; identifiant inconnu de Vinted (99) : rien ; rien : null", () => {
    assert.equal(v({ etat: "Neuf avec étiquette" }), 6);
    assert.equal(v({ vinted_ids: { status_id: 99 } }), null);
    assert.equal(v({}), null);
  });
}

console.log("D. Compte 63ad8597, tâche 641fb37e — la relance du 11/11 21:39 n'a jamais essayé (rejeu de handler-watch)");
{
  const RB = await import(pathToFileURL(join(ROOT, "supabase/functions/_shared/recreation-bloquee.js")).href);
  const CE = await import(pathToFileURL(join(ROOT, "supabase/functions/_shared/correctifs-extension.js")).href);
  // L'état RÉEL de la tâche en base (relu le 13/11, lecture seule), réduit aux clés qui décident.
  const PF_EN_BASE = {
    republish_step: "deleted", deleted_at: "2026-11-09T20:35:06.000Z", deleted_at_serveur: "2026-11-09T20:35:06.000Z",
    deleted_at_client: "2026-11-09T20:35:06.654Z",
    recreation_envois: ["2026-11-09T20:35:06.000Z", "2026-11-09T20:35:57.527Z", "2026-11-09T20:41:55.501Z", "2026-11-09T20:53:55.188Z"],
    recreation_tentee: { at: "2026-11-09T20:53:55.188Z", n: 3 }, recreation_retries: 2, recreation_reprises: 1,
    recreation_reprise: { at: "2026-11-11T20:39:05.894Z", n: 1, statut_recu: "needs_user" },
    recreation_bloquee: { essais: 2, le: "2026-11-11T20:42:06.642Z", par: "handler-watch", statut_avant: "pending" },
    needs_user_source: "recreation_bloquee",
    republish_snapshot: { etat: "Neuf sans étiquette", status_id: 1, color1_id: 4, color2_id: 1, catalog_id: 2942 },
    correctif_leve: { cle: "vinted_etat_a_confirmer", version: "0.6.186", le: "2026-11-11T20:39:02.637Z",
      build_echec: "2026-11-09T09:46:04Z+6d36bb4 · v0.6.184", build_poste: "2026-11-10T14:10:14Z+ba13a51" },
    last_diagnostic: "refus serveur HTTP 400 (/api/v2/item_upload/items) || réponse : {\"code\":99,\"message_code\":\"validation_error\",\"errors\":[{\"field\":\"condition\",\"value\":\"Le champ État doit être renseigné\"}]} || champs exigés : État (condition)",
  };
  const JOB = { id: "641fb37e", action: "republish", platform: "vinted", status: "needs_user", created_at: "2026-11-09T20:06:36.590Z",
    handler_build: "2026-11-10T14:10:14Z+ba13a51 · v0.6.186", platform_fields: PF_EN_BASE,
    error: "Ton annonce a été retirée de Vinted le 09/11 et FillSell n'a pas réussi à la remettre en ligne (2 essais)." };
  cas("preuve : la relance du 11/11 a laissé recreation_tentee n = 3 → handler-watch « signaler » (sortie sans essai)", () => {
    // L'écriture de get-pending-jobs le 11/11 à 20:39:02 UTC (avant 4d52c91) : statut pending, compteurs gardés.
    const relancee = { ...JOB, status: "pending", platform_fields: { ...PF_EN_BASE, needs_user_source: undefined, recreation_reprises: 0, recreation_reprise: undefined } };
    assert.equal(RB.essaisRates(relancee.platform_fields), 2);
    assert.equal(RB.decisionRecreationBloquee(relancee, Date.parse("2026-11-11T20:42:06Z")), "signaler");
    assert.ok(PF_EN_BASE.recreation_envois.every((e) => e < PF_EN_BASE.correctif_leve.le), "aucun envoi depuis la relance");
  });
  cas("le réarmement d'aujourd'hui (remettreEnFile, 4d52c91) remet le budget : plus jamais ressortie avant un essai", () => {
    const c = CE.CORRECTIFS_EXTENSION.find((x) => x.cle === "vinted_etat_a_confirmer");
    const pf = CE.champsReamorcageCorrectif({ ...JOB, handler_build: "2026-11-09T09:46:04Z+6d36bb4 · v0.6.184" }, c,
      { buildDuPoll: "2026-11-10T14:10:14Z+ba13a51", maintenant: "2026-11-11T20:39:02.637Z" });
    assert.equal(RB.decisionRecreationBloquee({ ...JOB, status: "pending", platform_fields: pf }, Date.parse("2026-11-11T20:42:06Z")), null);
  });
  // (13/11, intégration) Le second réarmement du « réarmement mangé » relancerait SEUL une tâche arrêtée par la garde
  // recreation_bloquee : garde-fou de Nico (« ne relance jamais un job dont le needs_user_source est une garde
  // volontaire ») → SUSPENDU, question posée à Nico (code gardé hors lot : scratchpad/etape5/K-rearmement-mange-SUSPENDU.patch).
  cas("garde recreation_bloquee : aucun correctif ne relance 641fb37e sans décision de Nico", () => {
    assert.equal(JOB.platform_fields.needs_user_source, "recreation_bloquee");
    assert.equal(CE.correctifPourJob(JOB), null, "la tâche arrêtée par la garde attend la décision de Nico (ou le geste de la personne)");
  });
  cas("un envoi APRÈS la relance (vrai essai) consomme le correctif ; une publication n'est jamais concernée", () => {
    const essaye = { ...JOB, platform_fields: { ...PF_EN_BASE, recreation_envois: [...PF_EN_BASE.recreation_envois, "2026-11-11T20:45:00.000Z"] } };
    assert.equal(CE.correctifPourJob(essaye), null);
    const pub = { ...JOB, action: "publish", platform_fields: { ...PF_EN_BASE, republish_step: undefined, etat: "Neuf sans étiquette" } };
    assert.equal(CE.correctifPourJob(pub), null);
  });
}

console.log("E. La copie d'une recréation : par son numéro ou l'empreinte de ses photos, JAMAIS par le titre");
{
  const ctxR = vm.createContext({ Number, String, Array, Object, Set, Map, JSON, Date, RegExp, Math });
  let reconnaitre = null;
  try {
    vm.runInContext(`const RECREATION_SEUIL_TOLERANCE_MS = 2000;
      ${essaiBg("jetonPhotoVinted")}
      ${essaiBg("empreintePhotosArticle")}
      ${essaiBg("reconnaitreAnnonceRecreee")}
      globalThis.__r = reconnaitreAnnonceRecreee;`, ctxR);
    reconnaitre = ctxR.__r;
  } catch { /* rouge ci-dessous */ }
  const retrait = "2026-10-29T14:29:29.000Z";
  const photo = (id, jeton, ts) => ({ id, url: `https://images1.vinted.net/t/${jeton}/f800/${ts}.jpeg?s=x`, ts });
  const art = (id, titre, photos, extra = {}) => ({ vinted_item_id: id, titre, statut: "active", photos, photo_ids: photos.map((p) => p.id),
    photo_ts: Math.min(...photos.map((p) => p.ts)), ...extra });
  const TS = Math.floor(Date.parse("2026-10-29T14:29:50Z") / 1000);
  const nos = { ids: [45800000001, 45800000002], jetons: ["06_0012c_aaaaaaaaaaaaaaaaaaaaaaa1", "06_0012c_aaaaaaaaaaaaaaaaaaaaaaa2"] };
  const copie = art("10583000001", "Titre quelconque", [photo(45800000001, nos.jetons[0], TS), photo(45800000002, nos.jetons[1], TS)]);
  const jumelle = art("10583000002", "Titre quelconque", [photo(45800009999, "06_0012c_bbbbbbbbbbbbbbbbbbbbbbb9", TS)]);
  const r = (articles, o = {}) => (typeof reconnaitre === "function"
    ? reconnaitre(articles, { photos: nos, deletedAt: retrait, idsConnus: new Set(), ...o })
    : { item: "absente" });
  cas("compte 2189c4d8 (44169148) : la copie aux identifiants de NOS photos est reconnue", () => {
    assert.equal(r([jumelle, copie]).item?.vinted_item_id, "10583000001");
  });
  cas("⛔ même titre, autres photos : jamais reconnue (le titre ne prouve rien)", () => {
    assert.equal(r([jumelle]).item, null);
  });
  cas("titre réécrit par Vinted mais nos photos : reconnue (par le jeton d'image si l'identifiant manque)", () => {
    const sansId = { ...copie, titre: "Autre titre", photo_ids: [] };
    assert.equal(r([sansId]).item?.vinted_item_id, "10583000001");
  });
  cas("empreinte de nos photos inconnue : rien reconnu, et le DOUTE est rendu (jamais une recréation à l'aveugle)", () => {
    const x = r([copie], { photos: { ids: [], jetons: [] } });
    assert.equal(x.item, null);
    assert.equal(x.doute, true);
  });
  cas("déjà suivie par l'inventaire, brouillon, photos d'avant le retrait : jamais", () => {
    assert.equal(r([copie], { idsConnus: new Set(["10583000001"]) }).item, null);
    assert.equal(r([{ ...copie, statut: "draft" }]).item, null);
    assert.equal(r([{ ...copie, photo_ts: TS - 3600 }]).item, null);
  });
  cas("deux annonces portent nos photos : abstention (jamais un choix au hasard)", () => {
    const x = r([copie, { ...copie, vinted_item_id: "10583000003" }]);
    assert.equal(x.item, null);
    assert.match(String(x.raison), /annonces correspondent/);
  });
  await casA("le numéro renvoyé par Vinted survit à la redirection vers le profil : réponse 200 « item.id » → numéro gardé dans l'onglet, avec l'heure", async () => {
    const p = monterPage({ reponse: { status: 200, corps: '{"item":{"id":10583000001,"title":"x"},"code":0}' } });
    await p.win.fetch("https://www.vinted.fr/api/v2/item_upload/items", { method: "POST", body: JSON.stringify({ item: { catalog_id: 224, assigned_photos: [{ id: 45800000001, orientation: 0 }] } }) });
    const garde = JSON.parse(p.stockage.get("__fillsell_depot_vinted") ?? "null");
    assert.equal(String(garde?.id), "10583000001");
    assert.ok(Number.isFinite(garde?.at));
  });
  await casA("…et les identifiants des photos de NOTRE envoi sont relevés au départ (avant toute réponse)", async () => {
    const p = monterPage();
    const vus = [];
    p.win.addEventListener("message", (e) => { if (e.data?.envoi) vus.push(e.data.envoi); });
    await p.win.fetch("https://www.vinted.fr/api/v2/item_upload/items", { method: "POST", body: JSON.stringify({ item: { catalog_id: 224, assigned_photos: [{ id: 45800000001, orientation: 0 }, { id: 45800000002, orientation: 0 }] } }) });
    for (let i = 0; i < 3; i++) await new Promise((res) => setImmediate(res));
    assert.deepEqual(vus.at(-1)?.photos, [45800000001, 45800000002]);
  });
  cas("conclureRecreationApresSoumission : le numéro gardé est lu AVANT toute lecture du dressing, sans titre", () => {
    const conclure = essaiBg("conclureRecreationApresSoumission");
    const iGarde = conclure.indexOf("lireDepotGardeParLaSonde(");
    const iDressing = conclure.indexOf("chercherCopieRecreeeDansDressing(");
    assert.ok(iGarde > 0 && iDressing > iGarde, "numéro gardé non lu, ou lu après le dressing");
    assert.ok(!/vintedUploadSucceededForTitle\(/.test(conclure), "la réponse de la sonde se lit par son numéro, jamais par le titre");
    assert.ok(!/titre:\s*titreCopie/.test(conclure), "le dressing ne se lit plus par le titre");
  });
  cas("la page du dressing rend les identifiants des photos (photo_ids) — l'empreinte de chaque annonce", () => {
    const lp = essai("lirePageDressing");
    assert.match(lp, /photo_ids:/);
  });
}

console.log("F. (5a, agent H) La recréation Vinted écrit la phrase de test du jour servie (job.phrase_de_test)");
{
  // Compte de63ca45 : ses consignes — « Jeu testé aujourd’hui, le [date], et fonctionnel. » le jour même, « Jeu testé le
  // [date] et fonctionnel. » plus tard. Le texte CAPTURÉ de l'annonce en ligne porte la phrase figée du jour du test.
  const P = await import(pathToFileURL(join(ROOT, "src/utils/phraseDeTest.js")).href);
  const MODELE = { jourMeme: "Jeu testé aujourd’hui, le [date], et fonctionnel.", plusTard: "Jeu testé le [date] et fonctionnel.", sansDate: "Jeu testé et fonctionnel." };
  const CAPTURE = "Jeu de société complet, toutes les pièces.\n\nJeu testé aujourd’hui, le 2 novembre 2026, et fonctionnel.\n\nVendu comme sur les photos.";
  const motifs = P.motifsDePhraseDeTest(MODELE);
  const phraseDuJour = P.phraseDeTest({ testeLe: "2026-11-02", aujourdhui: "2026-11-13", modele: MODELE });
  const ctxP = vm.createContext({ RegExp, Array, String, Object });
  let appliquer = null;
  try {
    vm.runInContext(`${essaiBg("descriptionAvecPhraseDeTest")}\nglobalThis.__p = descriptionAvecPhraseDeTest;`, ctxP);
    appliquer = ctxP.__p;
  } catch { /* rouge ci-dessous */ }
  const ap = (d, pt) => (typeof appliquer === "function" ? appliquer(d, pt) : "absente");
  cas("la phrase figée du texte capturé devient la phrase du jour servie (une seule fois, à sa place)", () => {
    assert.equal(phraseDuJour, "Jeu testé le 2 novembre 2026 et fonctionnel.");
    assert.equal(ap(CAPTURE, { phrase: phraseDuJour, date: "2026-11-02", omise: false, motifs }),
      CAPTURE.replace("Jeu testé aujourd’hui, le 2 novembre 2026, et fonctionnel.", phraseDuJour));
  });
  cas("deux phrases du modèle : la première remplacée, la seconde retirée (une passe, jamais reprise)", () => {
    const deux = `${CAPTURE}\n\nJeu testé le 30 octobre 2026 et fonctionnel.`;
    const r = ap(deux, { phrase: phraseDuJour, motifs });
    assert.equal((r.match(/Jeu testé/g) ?? []).length, 1);
    assert.ok(r.includes(phraseDuJour));
  });
  cas("plateforme qui refuse la phrase (omise, phrase nulle) : retirée ; aucun service (ancien serveur) : texte intact", () => {
    assert.ok(!/Jeu testé/.test(ap(CAPTURE, { phrase: null, omise: true, motifs })));
    assert.equal(ap(CAPTURE, undefined), CAPTURE);
    assert.equal(ap(CAPTURE, { phrase: phraseDuJour, motifs: [] }), CAPTURE);
    const sansPhrase = ["Texte sans phrase de test.", "", "", "", "Fin.  "].join("\n");
    assert.equal(ap(sansPhrase, { phrase: phraseDuJour, motifs }), sansPhrase, "aucune phrase du modèle : le texte part à l'octet près");
  });
  cas("construireJobRecreation applique job.phrase_de_test à la description capturée", () => {
    const c = essaiBg("construireJobRecreation");
    assert.match(c, /description: descriptionAvecPhraseDeTest\(cap\.payload\?\.description \?\? "", job\?\.phrase_de_test \?\? pf\?\.phrase_de_test\)/);
  });
}

console.log(`\n${verts} vert(s), ${rouges} rouge(s)`);
if (rouges) process.exit(1);
