// selftest:commandes-toutes-suivies — (29/10, point 7) « À expédier » : des commandes n'étaient PLUS JAMAIS relues.
// Le poste ne suivait que les 20 commandes en base changées le plus récemment (order=maj_le.desc&limit=20) ; or
// maj_le ne bouge que si la commande change (commandes_enregistrer n'écrit jamais une ligne inchangée) : une commande
// « à expédier » inchangée glissait hors des 20 et, sortie de la 1re page Vinted (20 en cours), restait figée.
// Et une liste de conversations illisible (hors mur) sautait la lecture des commandes (bêta : Ornella).
//   npm run selftest:commandes-toutes-suivies
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const lire = (f) => fs.readFileSync(path.join(RACINE, f), "utf8").replace(/\r\n/g, "\n");
const BG = lire("chrome-extension/background.js");
const SOURCE = lire("chrome-extension/messagerie.js");
const g = {};
new Function("globalThis", "self", SOURCE)(g, g);
const M = g.FILLSELL_MESSAGERIE;
let n = 0;
const cas = async (nom, f) => { await f(); n++; console.log(`  ✓ ${nom}`); };
console.log("commandes-toutes-suivies-selftest");
globalThis.setTimeout = (f) => { f(); return 0; };

const i = BG.indexOf("async function releverMessagerieUnePlateforme");
const corps = BG.slice(i, BG.indexOf("\n}\n", i));

await cas("1. le poste suit TOUTES les commandes en cours (100 au plus), la plus anciennement changée d'abord", () => {
  // (29/10, lot C 2) Vinted suit AUSSI les commandes livrées de moins de 10 jours (jusqu'à « vente finalisée ») ; les
  // autres plateformes : la liste d'avant, à l'identique.
  assert.ok(corps.includes("&${etatsSuivis}&select=commande_ref,etat&order=maj_le.asc&limit=100"));
  assert.ok(corps.includes('"etat=in.(a_confirmer,a_expedier,expediee,inconnu)"'), "hors Vinted : la liste d'avant");
  assert.ok(corps.includes("or=(etat.in.(a_confirmer,a_expedier,expediee,inconnu),and(etat.eq.livree,maj_le.gt."), "Vinted : + les livrées récentes");
  assert.ok(!corps.includes("order=maj_le.desc&limit=20"), "plus de fenêtre des 20 changées le plus récemment");
});

await cas("2. une liste de conversations illisible (hors mur) ne saute plus les commandes ; un signe de blocage, si", () => {
  assert.ok(!/if \(motifListe && !liste\?\.mur\) return/.test(corps), "plus de retour avant les commandes");
  assert.ok(/const bloc1 = commandesSeules \? null : M\.signeBlocage\(liste\);\s*if \(bloc1\) return \{ bloque: bloc1, requetes \};/.test(corps));
  assert.ok(corps.indexOf("// 3. Les commandes en cours") > corps.indexOf("const motifListe"));
  assert.ok(corps.includes("if (motifListe) return { motif: motifListe, requetes, bilanCommandes };"), "le motif de la liste reste rendu");
});

await cas("3. 20 en cours sur la 1re page Vinted + 30 suivies plus anciennes : en 10 passages de 5, CHACUNE est détaillée", async () => {
  const details = [];
  globalThis.fetch = async (url) => {
    const u = String(url);
    const rep = (status, corps) => ({ status, ok: status < 300, json: async () => corps, text: async () => JSON.stringify(corps) });
    if (u.includes("/my_orders")) {
      return rep(200, { my_orders: Array.from({ length: 20 }, (_, k) => ({ transaction_id: 1000 + k, transaction_user_status: "needs_action" })) });
    }
    const m = u.match(/\/transactions\/(\d+)$/);
    if (m) { details.push(m[1]); return rep(200, { transaction: { status: 230, shipment: { id: 9, status: 300 }, order: { item_ids: [1] } } }); }
    return rep(404, {});
  };
  const suivies = Array.from({ length: 30 }, (_, k) => String(2000 + k));
  let lues = {};
  const vues = new Set();
  for (let passage = 1; passage <= 10; passage++) {
    const r = await M.LECTEURS.vinted.commandes(suivies, M.COMMANDES_DETAILS_MAX, [], { lues, inconnues: [] });
    assert.equal(r.ok, true);
    assert.equal(r.tentes.length, 5, "5 détails par passage, jamais plus (cadence inchangée)");
    for (const ref of r.tentes) { vues.add(ref); lues = { ...lues, [ref]: passage * 1000 }; }
  }
  assert.equal(vues.size, 50, "chaque commande suivie a eu son tour");
  assert.equal(details.length, 50);
  // Une suivie relue (envoi 300) sort « expédiée » : elle ne reste jamais « à expédier ».
  const r = await M.LECTEURS.vinted.commandes(["2000"], 5, [], { lues: {}, inconnues: ["2000"] });
  const ligne = M.normaliserCommandesVinted(r.commandes).find((l) => l.ref === "2000");
  assert.equal(ligne?.etat, "expediee");
});

console.log(`commandes-toutes-suivies-selftest : ${n} cas OK`);
