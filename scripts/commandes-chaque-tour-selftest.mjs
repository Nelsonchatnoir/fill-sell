// selftest:commandes-chaque-tour — (24/10 soir, décision 3 de Nico) Au-delà de 5 commandes en cours, les suivantes
// n'étaient JAMAIS détaillées (toujours les 5 premières de la liste) et passaient « inconnu » à chaque relevé : le bouton
// Bordereau disparaissait (56 commandes Vinted le 24/10). Désormais chaque commande a son tour (la tentative la plus
// ancienne d'abord, à égalité les inconnues en base), et une commande non détaillée n'écrase jamais un état connu.
//   npm run selftest:commandes-chaque-tour
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = fs.readFileSync(path.join(RACINE, "chrome-extension/messagerie.js"), "utf8").replace(/\r\n/g, "\n");
const g = {};
new Function("globalThis", "self", SOURCE)(g, g);
const M = g.FILLSELL_MESSAGERIE;
let n = 0;
const cas = async (nom, f) => { await f(); n++; console.log(`  ✓ ${nom}`); };
console.log("commandes-chaque-tour-selftest");
// Les pauses entre deux lectures (1,2 à 2,6 s dans la page) passent tout de suite ici.
globalThis.setTimeout = (f) => { f(); return 0; };

// Un faux Vinted : `nb` commandes en cours, détail de chacune (envoi 230 = bordereau prêt) ; `autres` = commandes
// d'une autre boutique (404 au détail).
function vinted(nb, { autres = [] } = {}) {
  const details = [];
  const f = async (url) => {
    const u = String(url);
    const rep = (status, corps) => ({ status, ok: status < 300, json: async () => corps, text: async () => JSON.stringify(corps) });
    if (u.includes("/my_orders")) {
      return rep(200, { my_orders: Array.from({ length: nb }, (_, i) => ({ transaction_id: 1000 + i, title: `Article ${i}`, transaction_user_status: "needs_action" })) });
    }
    const m = u.match(/\/transactions\/(\d+)$/);
    if (m) {
      details.push(m[1]);
      if (autres.includes(m[1])) return rep(404, { code: 404 });
      return rep(200, { transaction: { status: 230, item_id: 1, shipment: { id: 9, status: 230 }, order: { item_ids: [1] } } });
    }
    return rep(404, {});
  };
  return { f, details };
}

await cas("1. 12 commandes en cours, 5 par passage : en 3 passages, CHACUNE est détaillée (avant : toujours les 5 mêmes)", async () => {
  const { f, details } = vinted(12);
  globalThis.fetch = f;
  let lues = {};
  const vues = new Set();
  for (let passage = 1; passage <= 3; passage++) {
    const r = await M.LECTEURS.vinted.commandes([], 5, [], { lues, inconnues: [] });
    assert.equal(r.ok, true);
    assert.equal(r.tentes.length, 5);
    for (const ref of r.tentes) { vues.add(ref); lues = { ...lues, [ref]: passage * 1000 }; }
    // Les lignes : chaque commande détaillée a son état ; les autres sont « inconnu ».
    const lignes = M.normaliserCommandesVinted(r.commandes);
    assert.equal(lignes.filter((l) => l.etat === "a_expedier" && l.bordereau === "pret").length, 5);
  }
  assert.equal(vues.size, 12, `détaillées : ${[...vues].join(",")}`);
  assert.equal(details.length, 15);
});

await cas("2. à égalité (jamais tentées), les commandes « inconnu » en base passent d'abord", async () => {
  const { f } = vinted(8);
  globalThis.fetch = f;
  const r = await M.LECTEURS.vinted.commandes([], 5, [], { lues: {}, inconnues: ["1006", "1007"] });
  assert.deepEqual(r.tentes.slice(0, 2), ["1006", "1007"]);
  assert.deepEqual(r.tentes.slice(2), ["1000", "1001", "1002"]);
});

await cas("3. une commande d'une autre boutique (404) passe derrière : elle ne garde jamais sa place en tête", async () => {
  const { f } = vinted(12, { autres: ["2000"] });
  globalThis.fetch = f;
  let lues = {};
  const r1 = await M.LECTEURS.vinted.commandes(["2000"], 5, [], { lues, inconnues: ["2000"] });
  assert.equal(r1.tentes[0], "2000", "inconnue, jamais tentée : d'abord");
  for (const ref of r1.tentes) lues[ref] = 1000;
  const r2 = await M.LECTEURS.vinted.commandes(["2000"], 5, [], { lues, inconnues: ["2000"] });
  assert.ok(!r2.tentes.includes("2000"), `tentée au passage d'avant : derrière (${r2.tentes.join(",")})`);
  assert.deepEqual(r2.tentes, ["1004", "1005", "1006", "1007", "1008"], "les jamais tentées passent");
});

await cas("4. une ligne « inconnu » n'écrase JAMAIS un état connu en base ; une commande neuve part ; un état lu part", () => {
  const lignes = [
    { ref: "1", etat: "inconnu", bordereau: "inconnu" },        // connue en base « a_expedier » → retenue
    { ref: "2", etat: "inconnu", bordereau: "inconnu" },        // inconnue en base aussi → part (rien à protéger)
    { ref: "3", etat: "inconnu", bordereau: "inconnu" },        // neuve → part (créée, son tour viendra)
    { ref: "4", etat: "a_expedier", bordereau: "pret" },        // détaillée → part
    { ref: "5", etat: "annulee", bordereau: "sans_objet" },     // annulée (lu sans détail) → part
  ];
  const r = M.lignesSansEcraserUnEtatConnu(lignes, { 1: "a_expedier", 2: "inconnu", 4: "a_obtenir", 5: "a_expedier" });
  assert.deepEqual(r.map((l) => l.ref), ["2", "3", "4", "5"]);
  assert.deepEqual(M.lignesSansEcraserUnEtatConnu(lignes, null).map((l) => l.ref), ["1", "2", "3", "4", "5"]);
});

await cas("5. Leboncoin : même tour de rôle (jamais les 5 premières seulement) ; refsDetaillees par plateforme", async () => {
  const appels = [];
  globalThis.localStorage = { getItem: () => "jeton" };
  globalThis.fetch = async (url) => {
    const u = String(url);
    appels.push(u);
    const rep = (status, corps) => ({ status, ok: status < 300, json: async () => corps, text: async () => JSON.stringify(corps) });
    if (u.includes("/pages/transactions")) return rep(200, Array.from({ length: 9 }, (_, i) => ({ id: { purchase_id: 500 + i }, step: "in_progress", item: { title: "x" } })));
    const m = u.match(/\/purchases\/(\d+)$/);
    if (m) return rep(200, { item: { id: 1 }, fsm: { current_state: { status: "available" }, states_history: [] }, metadata: {} });
    return rep(404, {});
  };
  const lues = { 500: 9, 501: 9, 502: 9, 503: 9, 504: 9 };
  const r = await M.LECTEURS.leboncoin.commandes([], 5, { lues, inconnues: [] });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.deepEqual(r.tentes, ["505", "506", "507", "508", "500"]);
  assert.equal(M.refsDetaillees("leboncoin", r.commandes).length, 5);
  assert.deepEqual(M.refsDetaillees("vinted", [{ transaction_id: 7, detail: {} }, { transaction_id: 8 }]), ["7"]);
});

console.log(`commandes-chaque-tour-selftest : ${n} cas verts`);
