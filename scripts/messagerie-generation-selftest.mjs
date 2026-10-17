// Selftest — bêta « Messages + À expédier » utilisable pour de vrai (16/10/2026, nuit).
//   npm run selftest:messagerie-generation
//
// Ce qu'il garantit, sur le code LIVRÉ (extension + migration 20261016220000) :
//   a. RÉPONDRE, JAMAIS DEUX FOIS : la clé d'idempotence de la plateforme
//      (Leboncoin clientMessageId, Depop idempotency_key) est le numéro de NOTRE
//      réponse — rejouer le même envoi porte la même clé ; l'empreinte SHA-256
//      du texte est celle de la base (texte EXACT, espaces et émoji compris) ;
//   b. GÉNÉRER, UNE SEULE FOIS : règles pures (corps Vinted, décision par
//      plateforme, issue d'un geste) ; les gestes relisent l'état JUSTE AVANT
//      et ne partent pas si l'étiquette existe déjà (0 appel qui engage) ;
//      un geste part UNE fois (Vinted : une seconde seulement après un 401) ;
//      une issue inconnue est « incertaine », jamais refaite ;
//   c. la préparation et la relève restent en LECTURE ; aucun nom, aucune
//      adresse, aucun téléphone ne sort des pages ;
//   d. background.js : capacité « generer » déclarée, décision AVANT le geste,
//      geste appelé à un seul endroit ;
//   e. la migration : une génération par commande (index), phrase d'engagement
//      exigée, extensions d'avant tenues à l'écart, REVOKE anon, inverse présent.
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => fs.readFileSync(path.join(RACINE, p), "utf8").replace(/\r\n/g, "\n");
let n = 0;
const cas = async (nom, f) => { await f(); n++; console.log(`  ✓ ${nom}`); };
console.log("messagerie-generation-selftest");

const SOURCE = lire("chrome-extension/messagerie.js");
const g = {};
new Function("globalThis", "self", SOURCE)(g, g);
const M = g.FILLSELL_MESSAGERIE;

// Un fetch espion : réponses par fin d'adresse (ou suite de réponses), journal des appels.
function espion(table) {
  const appels = [];
  const compteurs = {};
  const f = async (url, init = {}) => {
    const u = String(url);
    const methode = (init.method ?? "GET").toUpperCase();
    appels.push({ url: u, methode, init });
    const cle = Object.keys(table).filter((k) => {
      const [m, motif] = k.includes(" ") ? k.split(" ") : ["*", k];
      return (m === "*" || m === methode) && u.includes(motif);
    }).sort((a, b) => b.length - a.length)[0];
    let rep = cle ? table[cle] : { status: 404, corps: {} };
    if (Array.isArray(rep)) { compteurs[cle] = (compteurs[cle] ?? 0); rep = rep[Math.min(compteurs[cle]++, rep.length - 1)]; }
    if (rep === "reseau") throw new TypeError("Failed to fetch");
    const corps = rep.corps ?? {};
    const texte = typeof corps === "string" ? corps : JSON.stringify(corps);
    return { status: rep.status ?? 200, ok: (rep.status ?? 200) < 300, url: u, json: async () => corps, text: async () => texte, arrayBuffer: async () => new Uint8Array([37, 80, 68, 70]).buffer };
  };
  return { f, appels };
}
const gestes = (appels) => appels.filter((a) => a.methode !== "GET" && !a.url.endsWith("/web/api/auth/refresh"));

// ── a. Répondre ─────────────────────────────────────────────────────────────
await cas("empreinte : SHA-256 du texte EXACT (espaces, retour, accents, émoji) = celle de la base", async () => {
  const texte = "  Bonjour Ornella ✓ — c'est réservé 🙂\n";
  const attendu = crypto.createHash("sha256").update(texte, "utf8").digest("hex");
  assert.equal(await M.empreinteTexte(texte), attendu);
  assert.notEqual(await M.empreinteTexte(texte.trim()), attendu, "un espace en moins = un autre texte");
  // La valeur que Postgres a rendue pour « Bonjour é ✓ » le 16/10 (essai à blanc).
  assert.equal(await M.empreinteTexte("Bonjour é ✓"), "5022843c09283a29f2154dd016f5a8c5646ed7230c6fcce7ddea092db91a42d8");
});

await cas("rejouer le même envoi : Leboncoin et Depop reçoivent la MÊME clé d'idempotence (le numéro de notre réponse)", async () => {
  globalThis.localStorage = { getItem: () => "jeton" };
  globalThis.document = { cookie: "access_token=jt" };
  const { f, appels } = espion({ "POST /messages": { status: 201, corps: { id: "m-1" } }, "POST /conversations/messages/": { status: 201, corps: { id: 9 } } });
  globalThis.fetch = f;
  const r = { conversationRef: "c1", interlocuteurRef: "42", texte: " Oui, toujours dispo ", moi: "u-moi", cleEnvoi: "0e6b8c7a-1111-4222-8333-944455556666" };
  await M.ENVOYEURS.leboncoin(r); await M.ENVOYEURS.leboncoin(r);
  await M.ENVOYEURS.depop(r); await M.ENVOYEURS.depop(r);
  const lbc = appels.filter((a) => a.url.endsWith("/messages")).map((a) => JSON.parse(a.init.body));
  const dep = appels.filter((a) => a.url.endsWith("/conversations/messages/")).map((a) => JSON.parse(a.init.body));
  assert.equal(lbc.length, 2); assert.equal(dep.length, 2);
  assert.ok(lbc.every((b) => b.clientMessageId === r.cleEnvoi), "Leboncoin : même clientMessageId");
  assert.ok(dep.every((b) => b.idempotency_key === r.cleEnvoi), "Depop : même idempotency_key");
  assert.ok(lbc.every((b) => b.text === r.texte) && dep.every((b) => b.text === r.texte), "le texte part TEL QUEL (espaces compris)");
});

await cas("Vinted et Beebs : le texte part tel quel (aucun trim, aucune réécriture)", async () => {
  globalThis.document = { querySelectorAll: () => [{ textContent: '{\\"csrf_token\\":\\"tok\\"}' }], cookie: "anon_id=a1; access_token=xx.eyJwaG9uZV9udW1iZXIiOiIrMzMifQ.yy" };
  const { f, appels } = espion({ "POST /replies": { corps: { conversation: { messages: [{ entity: { id: 1 } }] } } }, "POST /chats/v3": { corps: { data: { id: 3 } } } });
  globalThis.fetch = f;
  const texte = "\n Ligne 1\n  Ligne 2 ✓ ";
  await M.ENVOYEURS.vinted({ conversationRef: "501", texte });
  await M.ENVOYEURS.beebs({ conversationRef: "b1", interlocuteurRef: "u2", texte });
  assert.equal(JSON.parse(appels[0].init.body).reply.body, texte);
  assert.equal(JSON.parse(appels[1].init.body).text, texte);
});

// ── b. Générer : règles pures ───────────────────────────────────────────────
const OPT = (x = {}) => ({ transporteur: "Mondial Relay", telephone_requis: "optional", telephone_present: false,
  depots: [{ type: "point", options: [{ type: "x", types: [1, 3], date: false, heure: false, reutilisable: false }] }], ...x });

await cas("Vinted : le corps de « commander l'étiquette » suit le site, et refuse ce que FillSell ne choisit pas", () => {
  assert.equal(M.corpsCommandeVinted(OPT(), null, 1).refus, "adresse_vinted_absente");
  assert.equal(M.corpsCommandeVinted(OPT(), { id: 5, complete: false }, 1).refus, "adresse_vinted_incomplete");
  assert.equal(M.corpsCommandeVinted(OPT({ telephone_requis: "mandatory", telephone_present: false }), { id: 5, complete: true }, 1).refus, "telephone_vinted_requis");
  assert.equal(M.corpsCommandeVinted(OPT({ depots: [{ type: "home", options: [{ types: [1], date: true }] }] }), { id: 5, complete: true }, 1).refus, "enlevement_domicile_sur_vinted");
  assert.equal(M.corpsCommandeVinted(OPT({ depots: [{ type: "point", options: [{ types: [1], date: true }] }] }), { id: 5, complete: true }, 1).refus, "date_a_choisir_sur_vinted");
  assert.equal(M.corpsCommandeVinted(OPT(), { id: 5, complete: true }, null).refus, "type_etiquette_a_choisir", "deux types : la personne choisit dans l'app");
  assert.deepEqual(M.corpsCommandeVinted(OPT(), { id: 5, complete: true }, 3).corps, { seller_address_id: 5, drop_off_type: null, label_type: 3 });
  // Un seul type : celui-là ; point + domicile : « point » ; emballage réutilisable proposé : le sien.
  assert.equal(M.corpsCommandeVinted(OPT({ depots: [{ type: "point", options: [{ types: [1] }] }] }), { id: 5, complete: true }).corps.label_type, 1);
  const deux = M.corpsCommandeVinted(OPT({ depots: [{ type: "point", options: [{ types: [1], reutilisable: true }] }, { type: "home", options: [{ types: [1], date: true }] }] }), { id: 5, complete: true });
  assert.equal(deux.corps.drop_off_type, "point");
  assert.equal(deux.corps.reusable_package_selected, false);
});

await cas("décision : déjà fait chez la plateforme → AUCUN geste ; sinon refus clair ou arguments du geste", () => {
  const cmdV = { commande_ref: "T1" };
  assert.deepEqual(M.decisionGeneration("vinted", { ok: true, statut: 220 }, {}, cmdV), { deja: true });
  assert.deepEqual(M.decisionGeneration("vinted", { ok: true, statut: 200 }, {}, cmdV), { deja: true });
  assert.equal(M.decisionGeneration("vinted", { ok: true, statut: 210 }, {}, cmdV).refus, "etiquette_echouee_chez_vinted");
  assert.equal(M.decisionGeneration("vinted", { ok: true, statut: 300 }, {}, cmdV).refus, "deja_expediee");
  const v = M.decisionGeneration("vinted", { ok: true, statut: 100, options: OPT(), adresse: { id: 7, complete: true } }, { type_etiquette: 1 }, cmdV);
  assert.deepEqual(v.args, { transactionId: "T1", corps: { seller_address_id: 7, drop_off_type: null, label_type: 1 } });
  const cmdL = { commande_ref: "P1" };
  assert.deepEqual(M.decisionGeneration("leboncoin", { ok: true, statut: "available" }, {}, cmdL), { deja: true });
  // (17/10) Colissimo : générable depuis FillSell, l'adresse de l'expéditeur part avec le geste.
  assert.deepEqual(M.decisionGeneration("leboncoin", { ok: true, statut: "reserved", type_envoi: "colissimo" }, {}, cmdL).args, { purchaseId: "P1", adresseRequise: true });
  assert.equal(M.decisionGeneration("leboncoin", { ok: true, statut: "reserved", type_envoi: "custom_shipping" }, {}, cmdL).refus, "confirmation_sur_leboncoin");
  assert.deepEqual(M.decisionGeneration("leboncoin", { ok: true, statut: "reserved", type_envoi: "Shop2Shop" }, {}, cmdL).args, { purchaseId: "P1" });
  assert.deepEqual(M.decisionGeneration("leboncoin", { ok: true, statut: "reserved", type_envoi: "mondial_relay" }, {}, cmdL).args, { purchaseId: "P1" });
  const cmdB = { commande_ref: "B1" };
  const prepB = { ok: true, statut: "WAIT_SELLER_CONFIRM", carrier_id: "3t2zzoKB5G3LrYlVdXa9p4", telephone: true, action: "7f33aa" };
  assert.deepEqual(M.decisionGeneration("beebs", prepB, {}, cmdB).args, { orderId: "B1", action: "7f33aa" });
  assert.deepEqual(M.decisionGeneration("beebs", { ...prepB, statut: "LABEL_PRINTED" }, {}, cmdB), { deja: true });
  assert.equal(M.decisionGeneration("beebs", { ...prepB, carrier_id: M.BEEBS_RMP }, {}, cmdB).refus, "remise_en_main_propre_sur_beebs");
  assert.equal(M.decisionGeneration("beebs", { ...prepB, telephone: false }, {}, cmdB).refus, "telephone_beebs_non_verifie");
  assert.equal(M.decisionGeneration("beebs", { ...prepB, action: null }, {}, cmdB).refus, "action_beebs_introuvable");
  assert.equal(M.decisionGeneration("ebay", { ok: true }, {}, cmdB).refus, "plateforme_sans_generation", "eBay : jamais (conditions d'eBay)");
  assert.equal(M.decisionGeneration("vinted", { ok: false, motif: "http_401" }, {}, cmdV).refus, "http_401");
});

await cas("issue d'un geste : réseau coupé, 5xx, onglet figé = INCERTAIN (jamais refait) ; 4xx = refusé (rien fait) ; déjà fait reconnu", () => {
  assert.equal(M.issueGeneration("vinted", { http: 0 }).issue, "incertain");
  assert.equal(M.issueGeneration("vinted", { http: 502 }).issue, "incertain");
  assert.equal(M.issueGeneration("vinted", { ok: false, motif: "onglet_fige" }).issue, "incertain");
  assert.equal(M.issueGeneration("vinted", { ok: false, motif: "injection_impossible" }).issue, "incertain");
  assert.equal(M.issueGeneration("vinted", { ok: false, motif: "onglet_indisponible" }).issue, "refuse");
  assert.equal(M.issueGeneration("vinted", { http: 422 }).issue, "refuse");
  const bot = M.issueGeneration("vinted", { http: 403 });
  assert.equal(bot.issue, "refuse"); assert.equal(bot.bot, true);
  assert.equal(M.issueGeneration("vinted", { http: 200, erreurs: true }).issue, "refuse");
  assert.equal(M.issueGeneration("vinted", { http: 200, code: 0 }).issue, "fait");
  assert.equal(M.issueGeneration("vinted", { avant: true, deja: true }).issue, "deja_fait");
  assert.equal(M.issueGeneration("vinted", { avant: true, motif: "csrf_absent" }).issue, "refuse");
  assert.equal(M.issueGeneration("leboncoin", { http: 409, code: "USECASE_ENTITY_ALREADY_EXISTS" }).issue, "refuse", "un 4xx reste un refus");
  assert.equal(M.issueGeneration("leboncoin", { http: 200, code: "USECASE_ENTITY_ALREADY_EXISTS" }).issue, "deja_fait");
  assert.equal(M.issueGeneration("beebs", { http: 200, succes: true }).issue, "fait");
  assert.equal(M.issueGeneration("beebs", { http: 200, succes: false }).issue, "refuse");
  assert.equal(M.issueGeneration("beebs", { http: 200, succes: null }).issue, "incertain");
  assert.equal(M.issueGeneration("beebs", { http: 404 }).issue, "refuse", "action inconnue : rien exécuté");
});

// ── b. Générer : les gestes, avec un fetch espion ───────────────────────────
globalThis.document = { querySelectorAll: () => [{ textContent: '{\\"csrf_token\\":\\"tok\\"}' }], cookie: "anon_id=a1" };

await cas("Vinted : étiquette DÉJÀ commandée (relue juste avant) → 0 appel qui engage", async () => {
  for (const s of [200, 220, 230, 250]) {
    const { f, appels } = espion({ "GET /transactions/T1": { corps: { transaction: { shipment: { id: 9, status: s } } } } });
    globalThis.fetch = f;
    const r = await M.GESTES_GENERATION.vinted({ transactionId: "T1", corps: { seller_address_id: 1 } });
    assert.equal(r.avant, true); assert.equal(r.deja, true);
    assert.equal(gestes(appels).length, 0, `statut ${s} : aucun PUT`);
  }
});

await cas("Vinted : le geste part UNE fois (PUT …/shipment/order, corps exact, CSRF) ; jamais deux, même rejoué après une erreur", async () => {
  const corps = { seller_address_id: 7, drop_off_type: null, label_type: 1 };
  let { f, appels } = espion({ "GET /transactions/T2": { corps: { transaction: { shipment: { id: 9, status: 100 } } } }, "PUT /shipment/order": { corps: { code: 0 } } });
  globalThis.fetch = f;
  let r = await M.GESTES_GENERATION.vinted({ transactionId: "T2", corps });
  assert.equal(r.http, 200);
  assert.equal(gestes(appels).length, 1);
  assert.ok(gestes(appels)[0].url.endsWith("/api/v2/transactions/T2/shipment/order"));
  assert.deepEqual(JSON.parse(gestes(appels)[0].init.body), corps);
  assert.equal(gestes(appels)[0].init.headers["X-CSRF-Token"], "tok");
  // 500 : une seule tentative.
  ({ f, appels } = espion({ "GET /transactions/T3": { corps: { transaction: { shipment: { id: 9, status: 100 } } } }, "PUT /shipment/order": { status: 500 } }));
  globalThis.fetch = f;
  r = await M.GESTES_GENERATION.vinted({ transactionId: "T3", corps });
  assert.equal(gestes(appels).length, 1);
  assert.equal(M.issueGeneration("vinted", r).issue, "incertain", "un 500 n'est jamais retenté : incertain");
  // 401 (refusé avant tout traitement) : jeton renouvelé, UNE seconde tentative.
  ({ f, appels } = espion({ "GET /transactions/T4": { corps: { transaction: { shipment: { id: 9, status: 100 } } } },
    "POST /web/api/auth/refresh": { corps: {} }, "PUT /shipment/order": [{ status: 401 }, { corps: { code: 0 } }] }));
  globalThis.fetch = f;
  r = await M.GESTES_GENERATION.vinted({ transactionId: "T4", corps });
  assert.equal(gestes(appels).length, 2, "le 401 refusé + la bonne");
  assert.equal(M.issueGeneration("vinted", r).issue, "fait");
  // Réseau coupé pendant le PUT : incertain (jamais refait).
  ({ f, appels } = espion({ "GET /transactions/T5": { corps: { transaction: { shipment: { id: 9, status: 100 } } } }, "PUT /shipment/order": "reseau" }));
  globalThis.fetch = f;
  r = await M.GESTES_GENERATION.vinted({ transactionId: "T5", corps });
  assert.equal(gestes(appels).length, 1);
  assert.equal(M.issueGeneration("vinted", r).issue, "incertain");
});

await cas("Leboncoin : disponibilité DÉJÀ confirmée → 0 appel ; sinon UN POST …/action/validate-availability, sans corps", async () => {
  globalThis.localStorage = { getItem: () => "jeton" };
  let { f, appels } = espion({ "GET /purchase/v2/purchases/P1": { corps: { fsm: { current_state: { status: "available" } } } } });
  globalThis.fetch = f;
  let r = await M.GESTES_GENERATION.leboncoin({ purchaseId: "P1" });
  assert.equal(r.avant, true); assert.equal(r.deja, true);
  assert.equal(gestes(appels).length, 0);
  ({ f, appels } = espion({ "GET /purchase/v2/purchases/P2": { corps: { fsm: { current_state: { status: "reserved" } } } }, "POST /validate-availability": { corps: {} } }));
  globalThis.fetch = f;
  r = await M.GESTES_GENERATION.leboncoin({ purchaseId: "P2" });
  assert.equal(gestes(appels).length, 1);
  assert.equal(gestes(appels)[0].url, "https://api.leboncoin.fr/api/consumergoods/purchase/v1/purchases/P2/action/validate-availability");
  assert.equal(gestes(appels)[0].init.body, undefined);
  assert.equal(gestes(appels)[0].init.headers.authorization, "Bearer jeton");
  assert.equal(M.issueGeneration("leboncoin", r).issue, "fait");
});

await cas("Beebs : commande DÉJÀ acceptée → 0 appel ; sinon UNE action serveur sellerConfirmAction([id]) et son résultat lu", async () => {
  const page = (statut) => `0:{"x":1}\n5:[["$","div",null,{"order":{"id":"B9","status":"${statut}","products":[{"id":"p"}],"buyer":{"id":"u"}}}]]`;
  let { f, appels } = espion({ "GET /fr/account/orders/B9": { corps: page("LABEL_PRINTED") } });
  globalThis.fetch = f;
  let r = await M.GESTES_GENERATION.beebs({ orderId: "B9", action: "7f33a89f02529c251879b96621f4fc409193cc626f" });
  assert.equal(r.avant, true); assert.equal(r.deja, true);
  assert.equal(gestes(appels).length, 0);
  ({ f, appels } = espion({ "GET /fr/account/orders/B9": { corps: page("WAIT_SELLER_CONFIRM") },
    "POST /fr/account/orders/B9": { corps: '0:{"a":"$@1","f":"","b":"x"}\n1:{"success":true}' } }));
  globalThis.fetch = f;
  r = await M.GESTES_GENERATION.beebs({ orderId: "B9", action: "7f33a89f02529c251879b96621f4fc409193cc626f" });
  assert.equal(gestes(appels).length, 1);
  assert.equal(gestes(appels)[0].init.headers["Next-Action"], "7f33a89f02529c251879b96621f4fc409193cc626f");
  assert.equal(gestes(appels)[0].init.body, JSON.stringify(["B9"]));
  assert.equal(r.succes, true);
  assert.equal(M.issueGeneration("beebs", r).issue, "fait");
});

// ── c. Lecture seule, aucune donnée personnelle ─────────────────────────────
// La page de Vinted (la passerelle se lit sur son domaine : api.<domaine>, jamais écrit en dur).
globalThis.location = { host: "www.vinted.fr" };
await cas("PRÉPARER reste en lecture (aucun POST/PUT hors renouvellement du jeton Vinted) ; aucun nom, adresse ni téléphone ne sort", async () => {
  const RENOUV = /const renouveler = async \(\) => \{ try \{ const x = await fetch\("\/web\/api\/auth\/refresh", \{ method: "POST", credentials: "include", headers: \{ Accept: "application\/json" \} \}\); return x\.ok; \} catch \{ return false; \} \};/;
  for (const [pf, fn] of Object.entries(M.PREPARATIONS_GENERATION)) {
    const sans = fn.toString().replace(RENOUV, "");
    assert.ok(!/method\s*:\s*["'](POST|PUT|PATCH|DELETE)/i.test(sans), `préparer ${pf}`);
  }
  const { f } = espion({
    "GET /transactions/T7": { corps: { transaction: { shipment: { id: 9, status: 100 } } } },
    "GET /label_options": { corps: { label_options: { carrier: { name: "Mondial Relay" }, sender: { phone_number: "+33600000000", phone_number_requirement: "mandatory" },
      receiver: { name: "Prénom Nom" }, drop_offs: [{ type: "point", options: [{ type: "o", label_types: [1, 3] }] }] } } },
    "GET /shipping-estimation/external/shipping_address": { corps: { address: { id: 77, full_name: "Prénom Nom", line_1: "1 rue X", postal_code: "75001", is_complete: true } } },
  });
  globalThis.fetch = f;
  const p = await M.PREPARATIONS_GENERATION.vinted({ transactionId: "T7" });
  const sortie = JSON.stringify(p);
  assert.equal(p.ok, true);
  assert.deepEqual(p.adresse, { id: 77, complete: true });
  for (const interdit of ["+33600000000", "Prénom Nom", "1 rue X", "75001"]) assert.ok(!sortie.includes(interdit), `ne sort jamais : ${interdit}`);
  assert.equal(p.options.telephone_present, true);
});

await cas("Vinted : la passerelle (adresse d'expédition) suit le domaine de la page — vendeurs des autres pays compris", async () => {
  for (const [hote, attendu] of [["www.vinted.fr", "https://api.vinted.fr/"], ["www.vinted.be", "https://api.vinted.be/"]]) {
    globalThis.location = { host: hote };
    const { f, appels } = espion({
      "GET /transactions/T8": { corps: { transaction: { shipment: { id: 9, status: 100 } } } },
      "GET /label_options": { corps: { label_options: { drop_offs: [] } } },
      "GET /shipping-estimation/external/shipping_address": { corps: { address: { id: 3, is_complete: true } } },
    });
    globalThis.fetch = f;
    await M.PREPARATIONS_GENERATION.vinted({ transactionId: "T8" });
    assert.ok(appels.some((a) => a.url.startsWith(`${attendu}shipping-estimation/external/shipping_address`)), `${hote} → ${attendu}`);
  }
  globalThis.location = { host: "www.vinted.fr" };
});

await cas("relève Vinted : options d'étiquette lues UNE fois (connues = sautées), types et booléens seulement", async () => {
  const table = {
    "GET /my_orders": { corps: { my_orders: [{ transaction_id: 41, title: "Robe", price: { amount: "10", currency_code: "EUR" }, transaction_user_status: "in_progress" }] } },
    "GET /transactions/41": { corps: { transaction: { status: 230, shipment: { id: 99, status: 100 }, buyer: { login: "b" }, order: { item_ids: [5] } } } },
    "GET /label_options": { corps: { label_options: { carrier: { name: "Vinted Go" }, sender: { phone_number: "+33611111111", phone_number_requirement: "optional" },
      drop_offs: [{ type: "point", options: [{ label_types: [1, 3] }] }] } } },
  };
  let { f, appels } = espion(table);
  globalThis.fetch = f;
  let r = await M.LECTEURS.vinted.commandes([], 5, []);
  assert.equal(appels.filter((a) => a.url.includes("label_options")).length, 1);
  const lignes = M.normaliserCommandesVinted(r.commandes);
  assert.deepEqual(lignes[0].options_bordereau, { transporteur: "Vinted Go", types_etiquette: [1, 3], domicile_seul: false, telephone_manquant: false, generable: true });
  assert.ok(!JSON.stringify(lignes).includes("+33611111111"));
  ({ f, appels } = espion(table));
  globalThis.fetch = f;
  r = await M.LECTEURS.vinted.commandes([], 5, ["41"]);
  assert.equal(appels.filter((a) => a.url.includes("label_options")).length, 0, "déjà connues : pas relues");
  assert.ok(appels.every((a) => a.methode === "GET"));
});

await cas("commandes Beebs : transporteur en clair, remise en main propre jamais générable ; Leboncoin : générable selon le type d'envoi", () => {
  const b = M.normaliserCommandesBeebs([
    { id: "B1", order: { id: "B1", status: "WAIT_SELLER_CONFIRM", carrier_id: "3t2zzoKB5G3LrYlVdXa9p4", products: [{ id: "p", title: "Body" }] } },
    { id: "B2", order: { id: "B2", status: "WAIT_SELLER_CONFIRM", carrier_id: M.BEEBS_RMP, products: [{ id: "q", title: "Jouet" }] } },
  ]);
  assert.equal(b[0].transporteur, "Mondial Relay");
  assert.deepEqual(b[0].options_bordereau, { transporteur: "Mondial Relay", generable: true });
  assert.equal(b[1].options_bordereau.generable, false);
  const l = M.normaliserCommandesLeboncoin([
    { purchase_id: "P1", step: "in_progress", price: 1000, detail: { statut: "reserved", evenements: [], shipping_type: "shop2shop" } },
    { purchase_id: "P2", step: "in_progress", price: 1000, detail: { statut: "reserved", evenements: [], shipping_type: "colissimo" } },
  ]);
  assert.deepEqual(l[0].options_bordereau, { type_envoi: "shop2shop", generable: true });
  assert.deepEqual(l[1].options_bordereau, { type_envoi: "colissimo", generable: true, adresse_requise: true }, "(17/10) Colissimo : générable, adresse requise");
});

await cas("les fonctions de page sont AUTONOMES : recréées depuis leur seul texte (comme executeScript), elles tournent", async () => {
  // Une référence à une fonction voisine de messagerie.js passerait les tests
  // ci-dessus (même portée) et casserait dans la page : ReferenceError.
  const autonome = (fn) => new Function(`return (${fn.toString()})`)();
  globalThis.localStorage = { getItem: () => "jeton" };
  globalThis.document = { querySelectorAll: () => [{ textContent: '{\\"csrf_token\\":\\"tok\\"}' }], cookie: "anon_id=a1; access_token=xx.eyJwaG9uZV9udW1iZXIiOiIrMzMifQ.yy" };
  const page = (statut) => `5:[["$","div",null,{"order":{"id":"B9","status":"${statut}","carrier_id":"x","products":[{"id":"p"}],"buyer":{"id":"u"}}}]]`;
  const scenarios = [
    ["preparer vinted", M.PREPARATIONS_GENERATION.vinted, { transactionId: "T1" }, { "GET /transactions/T1": { corps: { transaction: { shipment: { id: 9, status: 100 } } } }, "GET /label_options": { corps: { label_options: { drop_offs: [] } } }, "GET /shipping_address": { corps: { address: { id: 1, is_complete: true } } } }],
    ["geste vinted", M.GESTES_GENERATION.vinted, { transactionId: "T1", corps: { seller_address_id: 1 } }, { "GET /transactions/T1": { corps: { transaction: { shipment: { id: 9, status: 100 } } } }, "PUT /shipment/order": { corps: { code: 0 } } }],
    ["preparer leboncoin", M.PREPARATIONS_GENERATION.leboncoin, { purchaseId: "P1" }, { "GET /purchases/P1": { corps: { fsm: { current_state: { status: "reserved" } }, metadata: { parcelShippingType: "shop2shop" } } } }],
    ["geste leboncoin", M.GESTES_GENERATION.leboncoin, { purchaseId: "P1" }, { "GET /purchases/P1": { corps: { fsm: { current_state: { status: "reserved" } } } }, "POST /validate-availability": { corps: {} } }],
    ["preparer beebs", M.PREPARATIONS_GENERATION.beebs, { orderId: "B9" }, { "GET /fr/account/orders/B9": { corps: page("WAIT_SELLER_CONFIRM") } }],
    ["geste beebs", M.GESTES_GENERATION.beebs, { orderId: "B9", action: "7f00" }, { "GET /fr/account/orders/B9": { corps: page("WAIT_SELLER_CONFIRM") }, "POST /fr/account/orders/B9": { corps: '1:{"success":true}' } }],
    ["chemin beebs", M.CHEMINS_BORDEREAU.beebs, { orderId: "B9", derniereMarche: true }, { "GET /fr/account/orders/B9": { corps: page("LABEL_PRINTED") } }],
    ["commandes vinted", M.LECTEURS.vinted.commandes, [[], 5, []], { "GET /my_orders": { corps: { my_orders: [] } } }],
  ];
  for (const [nom, fn, args, table] of scenarios) {
    globalThis.fetch = espion(table).f;
    const f = autonome(fn);
    const r = await (Array.isArray(args) ? f(...args) : f(args));
    assert.ok(r && typeof r === "object", `${nom} : un résultat`);
  }
});

// ── d. background.js ────────────────────────────────────────────────────────
const BG = lire("chrome-extension/background.js");
// ── (17/10) « Tout dans FillSell » : Colissimo, type d'étiquette, fichier Beebs ──
await cas("(17/10) expéditeur Leboncoin = l'adresse du COMPTE Leboncoin (pré-remplie par le site), complète seulement (nom, rue, code postal, ville, téléphone)", () => {
  const lbc = { firstname: "A", lastname: "B", street: "2 av X", complement: "Bât C", zipcode: "75002", city: "Paris", country_isocode: "FR", phone_number: "+33612345678" };
  assert.deepEqual(M.expediteurLeboncoin(lbc), { firstname: "A", lastname: "B", street: "2 av X", complement: "Bât C", zipcode: "75002", city: "Paris", country_isocode: "FR", phone: "+33612345678" });
  assert.equal(M.expediteurLeboncoin({ ...lbc, phone_number: "06 12 34 56 78" }).phone, "0612345678");
  assert.equal(M.expediteurLeboncoin({ ...lbc, phone_number: "" }), null, "sans téléphone : incomplet");
  assert.equal(M.expediteurLeboncoin({ ...lbc, zipcode: "7500" }), null);
  assert.equal(M.expediteurLeboncoin({ ...lbc, lastname: " " }), null);
  assert.equal(M.expediteurLeboncoin({ ...lbc, country_isocode: "BE" }), null, "Leboncoin : France seulement");
  assert.equal(M.expediteurLeboncoin(null), null);
  const d = M.decisionGeneration("leboncoin", { ok: true, statut: "reserved", type_envoi: "courrier_suivi" }, {}, { commande_ref: "P5" });
  assert.deepEqual(d.args, { purchaseId: "P5", adresseRequise: true }, "aucune adresse ne transite par FillSell");
});

await cas("(17/10) Vinted : un type choisi que Vinted ne propose pas pour cette commande → rien n'est commandé (jamais un autre type)", () => {
  const un = OPT({ depots: [{ type: "point", options: [{ types: [3] }] }] });
  assert.equal(M.corpsCommandeVinted(un, { id: 5, complete: true }, 1).refus, "type_etiquette_indisponible");
  assert.equal(M.corpsCommandeVinted(un, { id: 5, complete: true }).corps.label_type, 3, "sans choix et un seul type : celui-là");
  assert.equal(M.corpsCommandeVinted(un, { id: 5, complete: true }, 3).corps.label_type, 3);
  assert.equal(M.corpsCommandeVinted(OPT(), { id: 5, complete: true }, 2).refus, "type_etiquette_indisponible", "deux types proposés, un troisième demandé");
});

await cas("(17/10) Leboncoin Colissimo : l'adresse du compte (lue dans la page, jamais sortie) → UN POST …/proxy/v1/purchases/<id>/validate-availability ; déjà confirmée → 0 appel ; incomplète → 0 appel qui engage", async () => {
  globalThis.localStorage = { getItem: () => "jeton" };
  const pre = { parcel: { sender_address: { firstname: "A", lastname: "B", street: "2 av X", complement: "", zipcode: "75002", city: "Paris", country_isocode: "FR", phone_number: "0611223344" } } };
  let { f, appels } = espion({ "GET /purchase/v2/purchases/P8": { corps: { fsm: { current_state: { status: "reserved" } } } },
    "GET /pages/availability-confirmation/P8": { corps: pre }, "POST /proxy/v1/purchases/P8/validate-availability": { corps: {} } });
  globalThis.fetch = f;
  let r = await M.GESTES_GENERATION.leboncoin({ purchaseId: "P8", adresseRequise: true });
  assert.equal(gestes(appels).length, 1);
  assert.equal(gestes(appels)[0].url, "https://api.leboncoin.fr/api/consumergoods/proxy/v1/purchases/P8/validate-availability");
  assert.deepEqual(JSON.parse(gestes(appels)[0].init.body), { sender: { address: { firstname: "A", lastname: "B", street: "2 av X", complement: "", zipcode: "75002", city: "Paris", country_isocode: "FR" }, contact: { phone: "0611223344" } } });
  assert.equal(gestes(appels)[0].init.headers["content-type"], "application/json");
  assert.ok(!JSON.stringify(r).includes("Paris") && !JSON.stringify(r).includes("0611223344"), "l'adresse du compte ne sort jamais de la page");
  assert.equal(M.issueGeneration("leboncoin", r).issue, "fait");
  // Déjà confirmée : 0 appel qui engage, et l'adresse n'est même pas lue.
  ({ f, appels } = espion({ "GET /purchase/v2/purchases/P8": { corps: { fsm: { current_state: { status: "available" } } } } }));
  globalThis.fetch = f;
  r = await M.GESTES_GENERATION.leboncoin({ purchaseId: "P8", adresseRequise: true });
  assert.equal(gestes(appels).length, 0); assert.equal(M.issueGeneration("leboncoin", r).issue, "deja_fait");
  assert.ok(!appels.some((a) => a.url.includes("availability-confirmation")));
  // Adresse du compte incomplète (sans téléphone) : rien ne part, l'app le dit.
  ({ f, appels } = espion({ "GET /purchase/v2/purchases/P8": { corps: { fsm: { current_state: { status: "reserved" } } } },
    "GET /pages/availability-confirmation/P8": { corps: { parcel: { sender_address: { ...pre.parcel.sender_address, phone_number: "" } } } } }));
  globalThis.fetch = f;
  r = await M.GESTES_GENERATION.leboncoin({ purchaseId: "P8", adresseRequise: true });
  assert.equal(gestes(appels).length, 0, "incomplète : rien ne part");
  const issue = M.issueGeneration("leboncoin", r);
  assert.equal(issue.issue, "refuse"); assert.equal(issue.motif, "adresse_expediteur_a_completer");
});

await cas("(17/10) Beebs : une adresse de bordereau rendue par le geste est gardée (jamais un lien de suivi) ; la récupération l'essaie d'abord", async () => {
  const page = (statut) => `0:{"x":1}\n5:[["$","div",null,{"order":{"id":"B9","status":"${statut}","products":[{"id":"p"}],"buyer":{"id":"u"},"shipping":{"tracking_url":"https://suivi.example/123"}}}]]`;
  let { f } = espion({ "GET /fr/account/orders/B9": { corps: page("WAIT_SELLER_CONFIRM") },
    "POST /fr/account/orders/B9": { corps: '0:{"a":"$@1"}\n1:{"success":true,"data":{"label":"https://cdn.beebs.example/labels/B9.pdf"}}' } });
  globalThis.fetch = f;
  let r = await M.GESTES_GENERATION.beebs({ orderId: "B9", action: "7f33a89f02529c251879b96621f4fc409193cc626f" });
  assert.equal(r.fichier, "https://cdn.beebs.example/labels/B9.pdf");
  ({ f } = espion({ "GET /fr/account/orders/B9": { corps: page("WAIT_SELLER_CONFIRM") },
    "POST /fr/account/orders/B9": { corps: '0:{"a":"$@1"}\n1:{"success":true,"suivi":"https://tracking.example/label/1"}' } }));
  globalThis.fetch = f;
  r = await M.GESTES_GENERATION.beebs({ orderId: "B9", action: "7f33a89f02529c251879b96621f4fc409193cc626f" });
  assert.equal(r.fichier, null, "un lien de suivi n'est jamais pris pour un bordereau");
  // Récupération : le lien connu d'abord ; sans lui, la commande (6 niveaux), jamais tracking_url.
  let appels;
  ({ f, appels } = espion({ "GET /fr/account/orders/B9": { corps: page("LABEL_PRINTED") }, "GET cdn.beebs.example/labels/B9.pdf": { corps: "%PDF" } }));
  globalThis.fetch = f;
  r = await M.CHEMINS_BORDEREAU.beebs({ orderId: "B9", derniereMarche: true, fichierConnu: "https://cdn.beebs.example/labels/B9.pdf" });
  assert.equal(r.ok, true);
  assert.ok(appels.some((a) => a.url === "https://cdn.beebs.example/labels/B9.pdf"));
  ({ f, appels } = espion({ "GET /fr/account/orders/B9": { corps: page("LABEL_PRINTED") } }));
  globalThis.fetch = f;
  r = await M.CHEMINS_BORDEREAU.beebs({ orderId: "B9", derniereMarche: true });
  assert.equal(r.motif, "fichier_sur_beebs", "aucun bordereau dans la commande : dit, jamais deviné (le lien de suivi n'est pas pris)");
});

await cas("background.js : capacité « generer » déclarée ; décision AVANT le geste ; le geste n'est appelé qu'à UN endroit", () => {
  assert.ok(/rpcMessagerie\("bordereau_demande_a_traiter", \{ p_capacites: \["generer"\] \}, token\)/.test(BG));
  const i = BG.indexOf("async function genererBordereauBeta(");
  const corps = BG.slice(i, BG.indexOf("/** La suite d'une génération faite", i));
  const iDecision = corps.indexOf("M.decisionGeneration(");
  const iGeste = corps.indexOf("executerDansOngletPlateforme(d.platform, geste,");
  assert.ok(iDecision > 0 && iGeste > iDecision, "décision avant le geste");
  assert.equal((BG.match(/executerDansOngletPlateforme\(d\.platform, geste,/g) || []).length, 1, "un seul appel du geste dans tout background.js");
  assert.equal((BG.match(/GESTES_GENERATION/g) || []).length, 1, "GESTES_GENERATION n'est lu qu'à un endroit");
  assert.ok(/issue\.issue === "incertain"[\s\S]{0,120}etape\("incertaine"/.test(corps), "issue inconnue → incertaine");
  assert.ok(!/genererBordereauBeta\(/.test(BG.replace(/async function genererBordereauBeta\(/, "").replace(/await genererBordereauBeta\(d, token, etat\)/, "")), "appelée seulement par l'exécutant des demandes");
});

// ── e. La migration ─────────────────────────────────────────────────────────
const MIG = lire("supabase/migrations/20261016220000_messagerie_ouverte_bordereaux_generes.sql");
await cas("migration 20261016220000 : une génération par commande, phrase d'engagement, extensions d'avant à l'écart, REVOKE anon, inverse", () => {
  assert.ok(/CREATE UNIQUE INDEX IF NOT EXISTS bordereaux_demandes_une_generation\s+ON public\.bordereaux_demandes \(commande_id\)\s+WHERE action = 'generer' AND statut IN \('demandee','en_cours','generee','prete','incertaine'\)/.test(MIG));
  const generer = MIG.slice(MIG.indexOf("CREATE OR REPLACE FUNCTION public.bordereau_generer("), MIG.indexOf("-- ── 9."));
  assert.ok(/v_user uuid := auth\.uid\(\);/.test(generer) && /RAISE EXCEPTION 'session requise'/.test(generer), "seule une session (l'app) génère");
  assert.ok(/char_length\(v_engagement\) NOT BETWEEN 10 AND 400/.test(generer), "phrase de confirmation exigée");
  assert.ok(/'deja', true/.test(generer), "la génération existante est rendue, jamais une seconde");
  const traiter = MIG.slice(MIG.indexOf("CREATE OR REPLACE FUNCTION public.bordereau_demande_a_traiter("), MIG.indexOf("-- ── 10."));
  assert.ok(/'generer' = ANY \(p_capacites\)/.test(traiter) && /d\.action = 'recuperer' OR v_generer/.test(traiter), "sans capacité : jamais une génération");
  assert.ok(/statut = 'incertaine', motif = 'sans_confirmation'/.test(traiter), "prise sans réponse → incertaine");
  for (const f of ["messagerie_repondre(uuid, text, text, text)", "bordereau_generer(uuid, jsonb, text)", "bordereau_demande_a_traiter(uuid, text[])",
    "bordereau_demande_etape(uuid, text, text, uuid, text, uuid)", "commandes_enregistrer(text, jsonb, uuid)", "messagerie_reponse_a_envoyer(text[], uuid)"]) {
    assert.ok(MIG.includes(`REVOKE ALL ON FUNCTION public.${f} FROM PUBLIC, anon;`), `REVOKE ${f}`);
  }
  const repondre = MIG.slice(MIG.indexOf("CREATE OR REPLACE FUNCTION public.messagerie_repondre("), MIG.indexOf("-- ── 3."));
  assert.ok(!/btrim\(coalesce\(p_texte/.test(repondre) && /v_texte text := p_texte;/.test(repondre), "texte gardé tel quel");
  assert.ok(/encode\(sha256\(convert_to\(v_texte, 'UTF8'\)\), 'hex'\)/.test(repondre), "empreinte calculée en base");
  assert.ok(/interval '10 minutes'/.test(repondre), "même texte en 10 min = même envoi");
  const prise = MIG.slice(MIG.indexOf("CREATE OR REPLACE FUNCTION public.messagerie_reponse_a_envoyer("), MIG.indexOf("-- ── 4."));
  assert.ok(/statut = 'echec', motif = 'trop_ancienne'[\s\S]{0,160}statut = 'en_attente' AND cree_le < now\(\) - interval '24 hours'/.test(prise), "non prise en 24 h : jamais envoyée en retard");
  assert.ok(fs.existsSync(path.join(RACINE, "supabase/rollbacks/20261016220000_messagerie_ouverte_bordereaux_generes.sql")), "inverse présent");
});

console.log(`messagerie-generation-selftest : ${n} cas verts`);
