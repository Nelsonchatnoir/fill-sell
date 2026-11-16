// selftest:ventes-beebs-historique — VERROU du point 8 de Nico (16/11/2026, extension 0.6.192) : l'historique COMPLET des
// ventes Beebs entre dans `ventes`, en silence.
//   npm run selftest:ventes-beebs-historique            (lecteur, extension, migration)
//   npm run selftest:ventes-beebs-historique -- --banc  (+ le banc jetable scripts/essais/20261116170000_banc.mjs)
// Constat (docs/enquetes/lot-1611-2-midi/annexe-p7.md) : la page « Ventes » de Beebs porte toutes les commandes en UNE
// requête (faf5021a : 18 commandes 07/2023 → 02/2026), le lecteur n'en gardait que 5 (`COMMANDES_DETAILS_MAX`, coupe sur
// TOUTES les commandes), sans titre, et aucune ne devenait une vente : 0 vente Beebs relevée dans tout le parc.
// ROUGE sur le code d'avant : pas de champ `historique`, pas d'import, pas de migration.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => fs.readFileSync(path.join(RACINE, p), "utf8").replace(/\r\n/g, "\n");
const existe = (p) => fs.existsSync(path.join(RACINE, p));
const MS = lire("chrome-extension/messagerie.js");
const BG = lire("chrome-extension/background.js");
const MIGRATION = "supabase/migrations/20261116170000_ventes_beebs_historique.sql";
const INVERSE = "supabase/rollbacks/20261116170000_ventes_beebs_historique_INVERSE.sql";
const g = {};
new Function("globalThis", "self", MS)(g, g);
const M = g.FILLSELL_MESSAGERIE;
let n = 0, echecs = 0;
const cas = async (nom, f) => {
  try { await f(); n++; console.log(`  ✓ ${nom}`); } catch (e) { echecs++; console.log(`  ✗ ${nom}\n      ${String(e?.message ?? e).split("\n")[0].slice(0, 300)}`); }
};
const fonction = (src, nom) => {
  const i = src.search(new RegExp(`(?:async )?function ${nom}\\(`));
  assert.ok(i >= 0, `fonction ${nom} introuvable`);
  let j = src.indexOf("{", src.indexOf(")", i)), prof = 0;
  for (; j < src.length; j++) { if (src[j] === "{") prof++; else if (src[j] === "}") { prof--; if (prof === 0) break; } }
  return src.slice(i, j + 1);
};

// ── Le site simulé (même forme que beebs-commandes-flux-rsc-selftest) : le DOCUMENT, flux self.__next_f.push ──
globalThis.location = { href: "https://www.beebs.app/fr/account/orders/list/seller", origin: "https://www.beebs.app" };
const documentDe = (flux) => {
  const morceaux = [];
  for (let i = 0; i < flux.length; i += 37) morceaux.push(flux.slice(i, i + 37));
  return '<!DOCTYPE html><html><body>' + morceaux.map((m) => "<script>self.__next_f.push([1," + JSON.stringify(m).replace(/</g, "\\u003c") + "])</script>").join("") + "</body></html>";
};
const appels = [];
async function avecSite(pages, f) {
  const fetch0 = globalThis.fetch, attente0 = globalThis.setTimeout;
  globalThis.fetch = async (url, init) => {
    appels.push({ url: String(url), rsc: init?.headers?.RSC });
    const p = pages[String(url)];
    if (!p) return { status: 404, url: "https://www.beebs.app" + url, headers: { get: () => null }, text: async () => "" };
    return { status: 200, url: "https://www.beebs.app" + url, headers: { get: () => null }, text: async () => documentDe(p) };
  };
  globalThis.setTimeout = (fn) => { fn(); return 0; };
  try { appels.length = 0; return await f(); } finally { globalThis.fetch = fetch0; globalThis.setTimeout = attente0; }
}
const LISTE = "/fr/account/orders/list/seller";
// La page « Ventes » de faf5021a (forme relue) : 18 commandes complètes (07/2023 → 02/2026), un achat, une commande dont
// le produit n'a pas de numéro (en 20e), et l'acheteur dans chaque objet (jamais rendu). Données inventées.
const lignesPage = ['0:{"P":null,"b":"essai","c":["","fr","account","orders","list","seller"],"i":false}', '5a:I[6552,["static/chunks/2_essai.js"],"OrderCard"]'];
const cartes = [];
for (let k = 0; k < 18; k++) {
  const d = new Date(Date.UTC(2023, 6 + k * 2, 18, 10)).toISOString();
  cartes.push(`["$","$L5a","${679585 + k * 50000}",{"order":{"id":${679585 + k * 50000},"status":"SELLER_PAID","created_at":"${d}","amount":${10 + k},"total_price":${12 + k},"buyer":{"first_name":"Prénom","last_name":"Nom"},"shipping":{"tracking_number":"TRK${k}"},"products":[{"id":${22204993 + k},"title":"Article ${k}","price":${10 + k},"images":["https://img.essai/${k}.jpg"]}]},"isSale":true}]`);
}
cartes.push('["$","$L5a","999999",{"order":{"id":999999,"status":"SELLER_PAID","created_at":"2026-01-01T09:00:00.000Z","products":[{"id":34101551}],"amount":100},"isSale":false}]');
cartes.push('["$","$L5a","1700000",{"order":{"id":1700000,"status":"SELLER_PAID","created_at":"2026-02-01T09:00:00.000Z","products":[{"title":"Sans numéro"}],"amount":5},"isSale":true}]');
lignesPage.push(`7d:["$","div",null,{"hasMore":false,"total":19,"children":[${cartes.join(",")}]}]`);
const PAGE = lignesPage.join("\n");

console.log("ventes-beebs-historique-selftest");

let r;
await cas("1. lecteur : en mode historique, les 18 commandes complètes sont rendues (titre, prix, date) en UNE requête ; les détails restent ≤ 5", async () => {
  r = await avecSite({ [LISTE]: PAGE }, () => M.LECTEURS.beebs.commandes([], M.COMMANDES_DETAILS_MAX, null, false, { historique: true }));
  assert.equal(r.ok, true);
  assert.ok(Array.isArray(r.historique), "champ « historique » absent (le lecteur s'arrêtait à 5 commandes)");
  assert.equal(r.historique.length, 18, `historique : ${r.historique.length}`);
  assert.ok(r.commandes.length <= 5, `détails : ${r.commandes.length}`);
  assert.equal(r.requetes, 1);
  assert.deepEqual(appels.map((a) => a.url), [LISTE]);
  const h = r.historique.find((x) => x.id === "679585");
  assert.deepEqual(h, { id: "679585", status: "SELLER_PAID", created_at: "2023-07-18T10:00:00.000Z", amount: 10, total_price: 12, currency: null,
    products: [{ id: 22204993, title: "Article 0", price: 10 }] });
});
await cas("2. jamais l'acheteur ni le suivi ; un ACHAT n'est jamais une vente ; la commande sans numéro de produit attend son détail", () => {
  const tout = JSON.stringify(r.historique);
  assert.ok(!/Prénom|TRK|first_name|shipping|buyer|img\.essai/.test(tout), "champs hors contrat dans l'historique");
  assert.ok(!r.historique.some((x) => x.id === "999999"), "achat compté");
  assert.ok(!r.historique.some((x) => x.id === "1700000"), "commande incomplète comptée");
  assert.equal(r.liste_total, 19);
  assert.equal(r.incompletes, 1);
});
await cas("3. la pagination est MESURÉE (marqueurs rendus), jamais suivie (aucune page de plus)", () => {
  assert.ok(Array.isArray(r.marqueurs_pagination) && r.marqueurs_pagination.includes("hasMore=false") && r.marqueurs_pagination.includes("total=19"),
    JSON.stringify(r.marqueurs_pagination));
  assert.ok(!appels.some((a) => /page=|cursor|offset/.test(a.url)));
});
await cas("4. sans l'option : réponse d'avant, sans historique (circuit vivant inchangé)", async () => {
  const r0 = await avecSite({ [LISTE]: PAGE }, () => M.LECTEURS.beebs.commandes([], M.COMMANDES_DETAILS_MAX, null));
  assert.equal(r0.historique, undefined);
  assert.equal(r0.commandes.length, 5);
});
await cas("5. autonomie : le lecteur reconstruit depuis son seul texte (executeScript) rend les mêmes 18", async () => {
  const seul = new Function(`return (${M.LECTEURS.beebs.commandes.toString()})`)();
  const r2 = await avecSite({ [LISTE]: PAGE }, () => seul([], 5, null, false, { historique: true }));
  assert.equal(r2.historique?.length, 18);
});

// ── background.js : lignes, import par paquets, mémoire des commandes réglées ──
const ctx = {};
const charger = () => new Function("ctx", `
  const HISTORIQUE_BEEBS_PAQUET = 100, HISTORIQUE_BEEBS_PAQUETS_MAX = 5, HISTORIQUE_BEEBS_REGLE_MS = 30 * 24 * 3600_000;
  const VENTES_BEEBS_HISTORIQUE_KEY = "fillsell_ventes_beebs_historique";
  const decodeJwtSub = () => "compte-A";
  const rpcMessagerie = (...a) => ctx.rpc(...a);
  const chrome = ctx.chrome;
  ${fonction(BG, "lignesHistoriqueBeebs")}
  ${fonction(BG, "lignesHistoriqueAEnvoyer")}
  ${fonction(BG, "reglesHistoriqueApresBilan")}
  ${fonction(BG, "importerHistoriqueVentesBeebs")}
  return { lignesHistoriqueBeebs, lignesHistoriqueAEnvoyer, reglesHistoriqueApresBilan, importerHistoriqueVentesBeebs };`)(ctx);
const store = {};
ctx.chrome = { storage: { local: { get: async (k) => ({ [k]: store[k] }), set: async (o) => Object.assign(store, o) } } };
let F;
await cas("6. background : les fonctions de l'import existent (constantes de la cadence comprises)", () => {
  assert.ok(/const HISTORIQUE_BEEBS_PAQUET = 100, HISTORIQUE_BEEBS_PAQUETS_MAX = 5, HISTORIQUE_BEEBS_REGLE_MS = 30 \* 24 \* 3600_000;/.test(BG));
  F = charger();
});
await cas("7. lignes : numéro, statut, date, montant / total / monnaie, produits (numéro, titre, prix) — jamais l'acheteur", () => {
  const l = F.lignesHistoriqueBeebs([...r.historique, { id: "x y", status: "SELLER_PAID", products: [{ id: 1 }] }, { id: "77", status: "SELLER_PAID", products: [{ title: "sans id" }] }]);
  assert.equal(l.length, 18);
  assert.deepEqual(l[0], { ref: "679585", statut: "SELLER_PAID", date: "2023-07-18T10:00:00.000Z", produits: [{ id: "22204993", titre: "Article 0", prix: 10 }], montant: 10, total: 12 });
});
const beaucoup = Array.from({ length: 250 }, (_, k) => ({ id: String(5000000 + k), status: "SELLER_PAID", created_at: "2025-01-01T00:00:00Z", total_price: 12, products: [{ id: 30000000 + k, title: "a", price: 10 }] }));
await cas("8. import : seulement après une lecture RÉUSSIE ; paquets de 100 (250 → 100/100/50) vers ventes_beebs_historique_noter", async () => {
  const vus = [];
  ctx.rpc = async (nom, p) => { vus.push([nom, p.p_rows.length, p.p_lecture.paquet, p.p_lecture.paquets]); return { mode: "ecrit", creees: p.p_rows.length, a_relire: [] }; };
  assert.equal(await F.importerHistoriqueVentesBeebs("jeton", { ok: false, bot: true, http: 403, historique: beaucoup }, "entretien"), null);
  assert.equal(await F.importerHistoriqueVentesBeebs("jeton", { ok: false, motif: "session_absente" }, "entretien"), null);
  assert.equal(vus.length, 0, "aucun appel sur un refus");
  await F.importerHistoriqueVentesBeebs("jeton", { ok: true, historique: beaucoup, liste_total: 250, requetes: 1, forme: "document", marqueurs_pagination: [] }, "entretien");
  assert.deepEqual(vus, [["ventes_beebs_historique_noter", 100, 1, 3], ["ventes_beebs_historique_noter", 100, 2, 3], ["ventes_beebs_historique_noter", 50, 3, 3]]);
});
await cas("9. une commande RÉGLÉE n'est plus renvoyée (30 jours) ; une commande « à relire » l'est ; en fantôme rien n'est réglé", async () => {
  const vus = [];
  ctx.rpc = async (nom, p) => { vus.push(p.p_rows.map((x) => x.ref)); return { mode: "ecrit", creees: 0, a_relire: ["5000003"] }; };
  const ajout = { id: "6000001", status: "SELLER_PAID", created_at: "2025-02-01T00:00:00Z", total_price: 9, products: [{ id: 31000001 }] };
  await F.importerHistoriqueVentesBeebs("jeton", { ok: true, historique: [...beaucoup, ajout] }, "entretien");
  assert.deepEqual(vus, [["6000001"]], JSON.stringify(vus));
  // fantôme : rien n'est réglé
  const R0 = F.reglesHistoriqueApresBilan({}, [{ ref: "1" }], { mode: "fantome" }, Date.now());
  assert.deepEqual(Object.keys(R0), []);
  const R1 = F.reglesHistoriqueApresBilan({}, [{ ref: "1" }, { ref: "2" }], { mode: "ecrit", a_relire: ["2"] }, Date.now());
  assert.deepEqual(Object.keys(R1), ["1"]);
});
await cas("10. un refus de la RPC arrête l'import (aucun paquet de plus)", async () => {
  delete store.fillsell_ventes_beebs_historique;
  let k = 0;
  ctx.rpc = async () => { k++; if (k === 2) throw new Error("HTTP 500"); return { mode: "ecrit", a_relire: [] }; };
  await F.importerHistoriqueVentesBeebs("jeton", { ok: true, historique: beaucoup }, "entretien");
  assert.equal(k, 2);
});
await cas("11. branchement : les deux voies (lecture des ventes, messagerie) demandent l'historique et l'importent APRÈS une lecture réussie ; aucun minuteur", () => {
  const lire = fonction(BG, "lireVentesBeebsSiDue");
  assert.ok(/\[\[\], M\.COMMANDES_DETAILS_MAX, null, Number\(d\.etat\.commandes_vues\) > 0, \{ historique: true \}\]/.test(lire), "option historique (lecture des ventes)");
  const iRetour = lire.indexOf("if (!cmd?.ok) {"), iImport = lire.indexOf("importerHistoriqueVentesBeebs(token, cmd, voie)");
  assert.ok(iRetour > 0 && iImport > iRetour, "import après la sortie sur échec");
  assert.ok(/platform === "beebs" \? \[refsSuivies, M\.COMMANDES_DETAILS_MAX, priorite, false, \{ historique: true \}\]/.test(BG), "option historique (messagerie)");
  assert.ok(/await importerHistoriqueVentesBeebs\(token, cmd, "messagerie"\)/.test(BG));
  const corps = ["lignesHistoriqueBeebs", "lignesHistoriqueAEnvoyer", "reglesHistoriqueApresBilan", "importerHistoriqueVentesBeebs"].map((x) => fonction(BG, x)).join("\n");
  assert.ok(!/setInterval|setTimeout|chrome\.alarms|fetch\(/.test(corps), "aucun minuteur ni requête Beebs de plus");
});

// ── La migration (texte) ──
await cas("12. migration et inverse présents", () => { assert.ok(existe(MIGRATION), MIGRATION); assert.ok(existe(INVERSE), INVERSE); });
const SQL = existe(MIGRATION) ? lire(MIGRATION) : "";
const CORPS = SQL.slice(SQL.indexOf("AS $function$"));
await cas("13. migration : interrupteur fail-closed, date obligatoire ≥ 48 h, commandes TERMINÉES seulement, source « releve »", () => {
  assert.ok(/v_ecrit := coalesce\(\(SELECT c\.value FROM coin_config c WHERE c\.key = 'ventes_beebs_historique'\), 0\) = 1;/.test(CORPS));
  assert.ok(/IF v_date IS NULL THEN/.test(CORPS) && /IF v_date > now\(\) - interval '48 hours' THEN/.test(CORPS));
  assert.ok(/IF NOT \(v_statut LIKE 'SELLER_PAID%' OR v_statut = 'APPROVED_BY_BUYER'\) THEN/.test(CORPS));
  assert.ok(/'beebs', 'beebs',\s+NULL, v_cle, 'releve'/.test(CORPS));
  assert.ok(/ON CONFLICT \(user_id, plateforme_code, commande_ref\) WHERE commande_ref IS NOT NULL AND plateforme_code IS NOT NULL\s+DO NOTHING/.test(CORPS));
});
await cas("14. migration : SILENCE — aucune écriture de tâche, de note, de mail, de remise ; fiche seulement prix_vente vide d'une fiche vendue", () => {
  assert.ok(!/UPDATE\s+(public\.)?cross_post_jobs/i.test(CORPS), "UPDATE cross_post_jobs");
  assert.ok(!/INSERT\s+INTO\s+(public\.)?(push_ventes|email_logs|remises_en_vente|annonces_plateforme|cross_post_jobs)/i.test(CORPS));
  const majFiches = [...CORPS.matchAll(/UPDATE\s+inventaire[^;]*;/gi)].map((m) => m[0]);
  assert.equal(majFiches.length, 1);
  assert.ok(/SET prix_vente = v_prix_v WHERE i\.id = v_inv AND i\.statut = 'vendu' AND i\.prix_vente IS NULL/.test(majFiches[0]));
});
await cas("15. migration : gardes — supprimées, comptes reliés, poste Cloud, circuit vivant ; jamais un titre pour rapprocher", () => {
  assert.ok(/FROM ventes_supprimees s WHERE s\.user_id = v_user AND s\.plateforme_code = 'beebs'/.test(CORPS));
  assert.ok(/FROM comptes_lies l WHERE v_user IN \(l\.user_a, l\.user_b\)/.test(CORPS));
  assert.ok(/IF public\.ecriture_poste_hors_cloud\(v_user\) THEN/.test(CORPS));
  assert.ok(/least\(j\.created_at, coalesce\(j\.published_at, j\.created_at\)\) <= v_date\) THEN/.test(CORPS), "domaine du circuit vivant");
  assert.ok(!/titre\s*(=|ILIKE|LIKE|~)/i.test(CORPS.replace(/titre = coalesce\(nullif\(btrim\(v\.titre\), ''\), v_titre\)/, "")), "rapprochement par titre");
});
await cas("16. migration : le seuil de 48 h tient au-delà des 24 h de push_trg_ventes('releve') (définition de PROD du 16/11)", () => {
  const prod = JSON.parse(lire("scripts/essais/fixtures/prod-1611-ventes-beebs-historique/fonctions.json")).fonctions.find((f) => f.nom === "push_trg_ventes");
  assert.ok(prod && /new\.vendu_le < now\(\) - interval '24 hours' then return new;/i.test(prod.def), "garde des 24 h de push_trg_ventes");
});
await cas("17. migration : le prix n'est gardé que si son unité est prouvée par le total (jamais ×100)", () => {
  assert.ok(/v_unite_ok := \(v_devise IS NULL OR v_devise = 'EUR'\) AND v_total IS NOT NULL\s+AND \(v_montant IS NULL OR v_montant <= v_total \* 1\.5\) AND \(v_somme IS NULL OR v_somme <= v_total \* 1\.5\);/.test(CORPS));
});

if (process.argv.includes("--banc")) {
  await cas("18. banc jetable (scripts/essais/20261116170000_banc.mjs) VERT", () => {
    const x = spawnSync(process.execPath, [path.join(RACINE, "scripts/essais/20261116170000_banc.mjs")], { encoding: "utf8", timeout: 600_000 });
    assert.equal(x.status, 0, (x.stdout + x.stderr).split("\n").filter((l) => /✗|ROUGE/.test(l)).join(" | ").slice(0, 400));
  });
}

console.log(echecs ? `\nROUGE : ${echecs} échec(s), ${n} vert(s)` : `\nVERT : ${n} contrôles`);
process.exit(echecs ? 1 : 0);
