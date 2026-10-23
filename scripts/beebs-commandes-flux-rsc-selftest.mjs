// selftest:beebs-commandes-flux-rsc — (24/10, point 3) Les ventes Beebs se lisent dans les OBJETS commande du flux
// de la page « Ventes », plus dans des liens qu'elle ne porte pas.
//   npm run selftest:beebs-commandes-flux-rsc
// Le constat (23/10) : 58 lectures fantômes de la page des ventes, 0 commande vue, dont la vraie vente de Johan du
// 21/10. Le code de beebs.app (relu le 23/10) : la carte d'une commande est un composant client (OrderCard, module
// 6552, que le SERVEUR appelle : aucun module client ne l'importe) qui reçoit { order: { id, status, created_at,
// products[], amount, computed_buyer_payin }, isSale } et construit le lien `/account/orders/${id}` dans le
// navigateur — le flux de la page n'a donc AUCUN lien de commande. Le lecteur lit les objets ; les liens restent lus
// en second ; une commande dont un produit n'a pas de numéro est relue sur sa page (comme avant).
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => fs.readFileSync(path.join(RACINE, p), "utf8").replace(/\r\n/g, "\n");
const MS = lire("chrome-extension/messagerie.js");
const BG = lire("chrome-extension/background.js");
const g = {};
new Function("globalThis", "self", MS)(g, g);
const M = g.FILLSELL_MESSAGERIE;
let n = 0;
const cas = async (nom, f) => { await f(); n++; console.log(`  ✓ ${nom}`); };
const fonction = (src, nom) => {
  const i = src.indexOf(`function ${nom}(`);
  assert.ok(i >= 0, `fonction ${nom} introuvable`);
  let j = src.indexOf("{", i), prof = 0;
  for (; j < src.length; j++) { if (src[j] === "{") prof++; else if (src[j] === "}") { prof--; if (prof === 0) break; } }
  return src.slice(i, j + 1);
};
const lignesVentesBeebs = new Function(`${fonction(BG, "lignesVentesBeebs")}; return lignesVentesBeebs;`)();

// Le site simulé : une adresse → { status, texte } ; chaque appel est noté. Les attentes entre deux pages sont
// sautées (setTimeout immédiat le temps du selftest).
const appels = [];
async function avecSite(pages, f) {
  const fetch0 = globalThis.fetch, attente0 = globalThis.setTimeout;
  globalThis.fetch = async (url, init) => {
    appels.push({ url: String(url), rsc: init?.headers?.RSC, credentials: init?.credentials });
    const p = pages[String(url)];
    if (!p) return { status: 404, text: async () => "" };
    return { status: p.status ?? 200, text: async () => p.texte };
  };
  globalThis.setTimeout = (fn) => { fn(); return 0; };
  try { appels.length = 0; return await f(); } finally { globalThis.fetch = fetch0; globalThis.setTimeout = attente0; }
}
const flux = (...lignes) => lignes.join("\n");
const LISTE = "/fr/account/orders/list/seller";

// Une page « Ventes » de la forme relue sur beebs.app (ligne = « clé hexa:JSON » ; « $L5a » = la carte cliente ;
// « $7b » = une autre ligne ; « $42:props:… » = un chemin dans une autre ligne). Données inventées.
const PAGE_VENTES = flux(
  '0:{"P":null,"b":"essai","p":"","c":["","fr","account","orders","list","seller"],"i":false}',
  '5a:I[6552,["static/chunks/2_essai.js"],"OrderCard"]',
  '7b:[{"id":34101549,"title":"Robe TEST","images":["https://img.essai/a.jpg"],"price":1200}]',
  '7c:{"id":1234567,"status":"SELLER_PAID","created_at":"2026-10-21T10:00:00.000Z","products":"$7b","amount":1200,"computed_buyer_payin":1450}',
  '7d:["$","div",null,{"children":[["$","$L5a","1234567",{"order":"$7c","isSale":true,"className":"x"}],'
    + '["$","$L5a","890",{"order":{"id":890,"status":"CANCELLED","created_at":"2026-10-20T09:00:00.000Z","products":[{"id":34101550,"title":"Jouet"}],"amount":500},"isSale":true}],'
    + '["$","$L5a","555123",{"order":{"id":"555123","status":"DELIVERED","created_at":"2026-10-19T09:00:00.000Z","products":["$7e"],"amount":900},"isSale":true}]]}]',
  '7e:{"title":"Gilet sans numéro","images":[]}',
  '7f:["$","$L5a","1234567bis",{"order":"$7d:props:children:0:props:order","isSale":true}]',
  '80:["$","$L5a","999999",{"order":{"id":999999,"status":"SELLER_PAID","created_at":"2026-10-18T09:00:00.000Z","products":[{"id":34101551}],"amount":100},"isSale":false}]',
  '81:{"ligne cassée',
  '82:"un texte"',
);
// La page d'une commande (relue seulement pour 555123, dont le produit n'a pas de numéro).
const PAGE_555123 = flux(
  '1:{"first_name":"Prénom","last_name":"Nom","phone":"0600000000","address":"1 rue Essai"}',
  '2:[{"id":34101552,"title":"Gilet","price":900,"images":["https://img.essai/g.jpg"]}]',
  '3:["$","$L9",null,{"order":{"id":555123,"status":"DELIVERED","created_at":"2026-10-19T09:00:00.000Z","buyer":"$1","products":"$2","total_price":900,"shipping":{"tracking_number":"TRK1","parcel_id":"P1","address":"1 rue Essai"}}}]',
);

console.log("beebs-commandes-flux-rsc-selftest");

await cas("1. le flux est lu ligne à ligne (clé hexa:JSON) ; une ligne cassée ou un texte n'arrête rien", () => {
  const c = M.LECTEURS.beebs.commandes;
  assert.equal(typeof c, "function");
  assert.ok(/function lignesFluxRsc\(texte\)/.test(MS) && /function commandesDuFluxRsc\(texte\)/.test(MS) && /function resolveurFluxRsc\(lignes\)/.test(MS));
});

let r1;
await cas("2. les objets commande des cartes sont lus : direct, par « $7c », par chemin « $7d:props:children:0:props:order »", async () => {
  r1 = await avecSite({ [LISTE]: { texte: PAGE_VENTES }, "/fr/account/orders/555123": { texte: PAGE_555123 } },
    () => M.LECTEURS.beebs.commandes([], 5));
  assert.equal(r1.ok, true);
  const ids = r1.commandes.map((c) => c.id);
  assert.deepEqual(ids, ["1234567", "890", "555123"], `commandes lues : ${ids.join(", ")}`);
  assert.equal(r1.illisibles, 0);
});

await cas("3. un ACHAT (isSale false) n'est jamais une vente ; la même commande reprise deux fois n'est comptée qu'une fois", () => {
  assert.ok(!r1.commandes.some((c) => c.id === "999999"), "l'achat 999999 est ignoré");
  assert.equal(r1.commandes.filter((c) => c.id === "1234567").length, 1);
});

await cas("4. une commande dont chaque produit porte son numéro n'est PAS relue (1 page lue de moins par vente) ; sinon sa page est relue", () => {
  const urls = appels.map((a) => a.url);
  assert.deepEqual(urls, [LISTE, "/fr/account/orders/555123"], `pages lues : ${urls.join(" ; ")}`);
  assert.equal(r1.requetes, 2);
  assert.ok(appels.every((a) => a.rsc === "1" && a.credentials === "include"), "lecture RSC, session du vendeur");
});

await cas("5. le contrat : numéro, statut brut, date, produits (numéro, titre, prix, image) ; jamais une adresse ni un téléphone", () => {
  const vente = r1.commandes.find((c) => c.id === "1234567").order;
  assert.equal(vente.status, "SELLER_PAID");
  assert.equal(vente.created_at, "2026-10-21T10:00:00.000Z");
  assert.equal(vente.total_price, 1200);
  assert.deepEqual(vente.products, [{ id: 34101549, title: "Robe TEST", price: 1200, image: "https://img.essai/a.jpg" }]);
  const relue = r1.commandes.find((c) => c.id === "555123").order;
  assert.deepEqual(relue.products.map((p) => p.id), [34101552], "produit lu sur la page de la commande, références « $2 » suivies");
  assert.deepEqual(relue.buyer, { first_name: "Prénom", last_name: "Nom" });
  const tout = JSON.stringify(r1);
  assert.ok(!tout.includes("0600000000") && !tout.includes("1 rue Essai"), "aucune adresse, aucun téléphone");
  for (const c of r1.commandes) {
    assert.deepEqual(Object.keys(c.order).sort(), ["buyer", "carrier_id", "carrier_name", "created_at", "id", "products", "shipping", "status", "status_updated_at", "total_price"].sort());
  }
});

await cas("6. ce qui part au serveur : référence, statut, date, numéros de produit — la vente de 1234567 est rattachable au job 34101549", () => {
  const l = lignesVentesBeebs(r1.commandes);
  assert.deepEqual(l[0], { ref: "1234567", statut: "SELLER_PAID", date: "2026-10-21T10:00:00.000Z", produits: ["34101549"] });
  assert.deepEqual(l.map((x) => x.statut), ["SELLER_PAID", "CANCELLED", "DELIVERED"]);
  assert.ok(!JSON.stringify(l).includes("Prénom"), "aucun nom ne sort");
  // Les classes de statut sont celles de l'extension (vente / annulée), déjà verrouillées par ventes-beebs-commandes.
  assert.equal(M.etatCommandeBeebs("SELLER_PAID").etat, "terminee");
  assert.equal(M.etatCommandeBeebs("CANCELLED").etat, "annulee");
});

await cas("7. la page des ventes du 23/10 (aucune commande, aucun lien) : 0 commande, 1 page lue, rien d'inventé", async () => {
  const vide = flux('0:{"P":null,"c":["","fr","account","orders","list","seller"]}', '42:["$","$L58","/account/orders/list/buyer",{"href":"/fr/account/orders/list/buyer"}]',
    '43:["$","$L58","/account/orders/list/seller",{"href":"/fr/account/orders/list/seller","localeCookie":"$42:props:localeCookie"}]');
  const r = await avecSite({ [LISTE]: { texte: vide } }, () => M.LECTEURS.beebs.commandes([], 5));
  assert.equal(r.ok, true);
  assert.deepEqual(r.commandes, []);
  assert.equal(r.requetes, 1);
});

await cas("8. les liens restent lus en second (si Beebs les rendait un jour) ; une commande suivie est relue ; plafond respecté", async () => {
  const avecLien = flux('5:["$","a",null,{"href":"/fr/account/orders/7654321"}]', '6:["$","a",null,{"href":"/fr/account/orders/list/buyer"}]');
  const page = (id) => flux(`1:{"id":${id},"status":"LABEL_PRINTED","created_at":"2026-10-21T10:00:00.000Z","buyer":{"first_name":"A"},"products":[{"id":34101560}]}`);
  const r = await avecSite({ [LISTE]: { texte: avecLien }, "/fr/account/orders/7654321": { texte: page(7654321) }, "/fr/account/orders/2222222": { texte: page(2222222) } },
    () => M.LECTEURS.beebs.commandes(["2222222"], 5));
  assert.deepEqual(r.commandes.map((c) => c.id), ["7654321", "2222222"]);
  const r2 = await avecSite({ [LISTE]: { texte: PAGE_VENTES } }, () => M.LECTEURS.beebs.commandes([], 1));
  assert.equal(r2.commandes.length, 1, "detailsMax = 1 : une seule commande");
});

await cas("9. 403 / 429 : Beebs bloque — on s'arrête et on le dit (bot) ; une page de commande muette compte comme illisible", async () => {
  const r = await avecSite({ [LISTE]: { status: 403, texte: "" } }, () => M.LECTEURS.beebs.commandes([], 5));
  assert.equal(r.ok, false);
  assert.equal(r.bot, true);
  const muette = await avecSite({ [LISTE]: { texte: flux('5:["$","a",null,{"href":"/fr/account/orders/7654321"}]') }, "/fr/account/orders/7654321": { texte: '1:{"rien":true}' } },
    () => M.LECTEURS.beebs.commandes([], 5));
  assert.equal(muette.ok, true);
  assert.deepEqual(muette.commandes, []);
  assert.equal(muette.illisibles, 1);
});

await cas("10. un renvoi « $… » qui n'est pas une ligne (« $L5a », « $D2026-… », « $undefined ») ne casse rien", async () => {
  const bizarre = flux('5:{"order":{"id":"$undefined","status":"SELLER_PAID","products":"$L5a","created_at":"$D2026-10-21T10:00:00.000Z"},"isSale":true}');
  const r = await avecSite({ [LISTE]: { texte: bizarre } }, () => M.LECTEURS.beebs.commandes([], 5));
  assert.equal(r.ok, true);
  assert.deepEqual(r.commandes, [], "produits illisibles : pas une commande");
});

await cas("11. le serveur accepte un numéro de commande court (migration 20261024130000) ; le rattachement reste le numéro de PRODUIT exact", () => {
  const MIG = lire("supabase/migrations/20261024130000_beebs_commande_ref_courte.sql");
  const INV = lire("supabase/rollbacks/20261024130000_beebs_commande_ref_courte_INVERSE.sql");
  assert.ok(MIG.includes("IF v_ref !~ '^[A-Za-z0-9_-]{1,80}$' THEN c_forme := c_forme + 1; CONTINUE; END IF;"), "garde {1,80}");
  assert.ok(!MIG.includes("{6,80}") || /^--.*\{6,80\}/m.test(MIG), "plus de {6,80} dans le corps");
  assert.ok(MIG.includes("IF v_id !~ '^[0-9]{6,}$' THEN c_forme := c_forme + 1; CONTINUE; END IF;"), "produit : toujours ^[0-9]{6,}$");
  assert.ok(/j\.user_id = v_user AND j\.platform = 'beebs' AND j\.status = 'published'[\s\S]{0,160}btrim\(coalesce\(j\.platform_listing_id, ''\)\) = v_id/.test(MIG), "un job de CE compte, ce numéro");
  assert.equal([...MIG.matchAll(/sale_evidence,commande\}' = v_ref/g)].length, 2, "les deux recherches par commande");
  assert.ok([...MIG.matchAll(/WHERE j\.user_id = v_user AND j\.platform = 'beebs' AND j\.status = '(?:published|sold)'\s+AND j\.platform_fields #>> '\{sale_evidence,source\}' = 'commande_beebs'\s+AND j\.platform_fields #>> '\{sale_evidence,commande\}' = v_ref/g)].length === 2,
    "toute recherche par numéro de commande est bornée au compte");
  assert.ok(/v_ecrit := coalesce\(\(SELECT c\.value FROM coin_config c WHERE c\.key = 'ventes_beebs_commandes'\), 0\) = 1;/.test(MIG), "interrupteur fail-closed intact");
  assert.ok(/REVOKE ALL ON FUNCTION public\.commandes_beebs_noter\(jsonb, uuid, jsonb\) FROM PUBLIC, anon;\nGRANT EXECUTE ON FUNCTION public\.commandes_beebs_noter\(jsonb, uuid, jsonb\) TO authenticated, service_role;/.test(MIG), "droits explicites");
  assert.ok(INV.includes("IF v_ref !~ '^[A-Za-z0-9_-]{6,80}$' THEN") && !INV.includes("{1,80}"), "l'inverse rend la garde d'avant");
  // Une seule ligne du corps change.
  const corps = (s) => s.slice(s.indexOf("CREATE OR REPLACE FUNCTION"), s.indexOf("$function$;")).split("\n");
  const a = corps(INV), b = corps(MIG);
  assert.equal(a.length, b.length);
  assert.equal(a.filter((l, i) => l !== b[i]).length, 1, "une seule ligne diffère de l'inverse");
});

console.log(`\n✓ beebs-commandes-flux-rsc : ${n} cas verts`);
