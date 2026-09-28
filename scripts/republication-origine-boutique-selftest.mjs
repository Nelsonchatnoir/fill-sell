// ═══════════════════════════════════════════════════════════════════════════
// LA UNE-PASSE VINTED REÇOIT LA BOUTIQUE D'ORIGINE PROUVÉE (0.6.78, 28/09)
// ═══════════════════════════════════════════════════════════════════════════
// LA PANNE, 0.6.76, trois republications sur trois arrêtées :
//   3a721b23 lowvaucher « Pantalon droit »   item 9649184767  boutique 8944020
//   b07b735e lowvaucher « Jean G-STAR »      item 9707128035  boutique 8944020
//   f3ba2985 begantonmatheo « Lot de 3 t-shirts » item 10026664652 boutique 138188364
// garde_boutique = boutique_ok (article = session), puis suppression_verdict
// = identite_non_prouvee, http null : AUCUNE requête envoyée. La une-passe
// supprime depuis /items/new, où la page ne montre pas le vendeur ; la seule
// preuve est « origine posée par get-pending-jobs = session relue ». Elle
// était lue sur le job de RECRÉATION (construireJobRecreation), qui ne
// recopiait pas vinted_account_id. Le message disait « Relance depuis l'app
// quand tu veux » : chaque relance rejouait le même mur.
//
// Ce fichier CHARGE background.js (vm) et la vraie porte de vinted.js :
//   1. le job de recréation porte l'origine du job servi, jamais inventée ;
//   2. les 3 cas réels : une requête, sur l'annonce exacte ; une session
//      étrangère : aucune ;
//   3. le site d'appel de la une-passe lit bien cette clé ;
//   4. le message nomme la preuve manquante, sans « quand tu veux ».
//
//   node scripts/republication-origine-boutique-selftest.mjs
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { parse } from "espree";

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DOSSIER = path.join(RACINE, "chrome-extension");
let ko = 0;
const ok = (titre, c, detail = "") => { console.log(`  ${c ? "✓" : "✗"} ${titre}${!c && detail ? ` — ${detail}` : ""}`); if (!c) ko++; };

function chargerBackground() {
  const rien = { addListener: () => {} };
  const aire = () => ({ get: async () => ({}), set: async () => {}, remove: async () => {} });
  const ctx = {
    console: { log: () => {}, warn: () => {}, error: () => {}, info: () => {}, debug: () => {} },
    setTimeout, clearTimeout, setInterval, clearInterval,
    URL, TextEncoder, TextDecoder, crypto: globalThis.crypto,
    Blob: globalThis.Blob, FormData: globalThis.FormData,
    atob: (s) => Buffer.from(s, "base64").toString("binary"),
    btoa: (s) => Buffer.from(s, "binary").toString("base64"),
    importScripts: (f) => vm.runInContext(fs.readFileSync(path.join(DOSSIER, f), "utf8"), contexte, { filename: f }),
    fetch: async () => ({ ok: true, status: 200, json: async () => [], text: async () => "[]" }),
    chrome: {
      runtime: { onMessage: rien, onInstalled: rien, onStartup: rien, onUpdateAvailable: rien,
                 lastError: null, id: "selftest", getManifest: () => ({ version: "0.0.0" }) },
      alarms: { onAlarm: rien, create: () => {}, getAll: async () => [], get: async () => null, clear: async () => false },
      storage: { local: aire(), session: aire(), onChanged: rien },
      tabs: { onRemoved: rien, onUpdated: rien, query: async () => [], create: async () => ({ id: 1 }),
              remove: async () => {}, sendMessage: () => {}, update: async () => ({ id: 1 }), get: async () => ({ id: 1 }) },
      windows: { onRemoved: rien, create: async () => ({ id: 1, tabs: [{ id: 1 }] }), getAll: async () => [], remove: async () => {}, update: async () => {} },
      scripting: { executeScript: async () => [] },
      cookies: { get: async () => null, getAll: async () => [] },
      action: { onClicked: rien, setBadgeText: () => {}, setBadgeBackgroundColor: () => {} },
      power: { requestKeepAwake: () => {}, releaseKeepAwake: () => {} },
      notifications: { create: () => {} },
    },
  };
  ctx.globalThis = ctx; ctx.self = ctx;
  const contexte = vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(DOSSIER, "background.js"), "utf8"), contexte, { filename: "background.js" });
  return ctx;
}

const sourceVinted = fs.readFileSync(path.join(DOSSIER, "content-scripts/vinted.js"), "utf8");
const arbre = parse(sourceVinted, { ecmaVersion: "latest", range: true });
const porte = arbre.body.filter((n) => n.type === "FunctionDeclaration" && n.id.name === "deleteVintedItemViaApi")
  .map((n) => sourceVinted.slice(...n.range)).join("\n");
async function supprimer(itemId, attendue, session) {
  const posts = [];
  const ctx = vm.createContext({
    location: { pathname: "/items/new", href: "https://www.vinted.fr/items/new" }, console: { log() {} },
    proprietaireAnnonceVinted: async () => null,
    extractVintedCsrfToken: async () => "jeton", getVintedCookie: () => "anon",
    fetchBorne: async (url, opts = {}) => {
      if (opts.method === "POST") posts.push(url);
      if (url === "/api/v2/users/current") return { ok: true, status: 200, json: async () => ({ user: { id: Number(session), login: "boutique" } }) };
      return { ok: true, status: 200, headers: { get: () => null }, text: async () => "{\"code\":0}" };
    },
  });
  vm.runInContext(porte, ctx);
  const r = await ctx.deleteVintedItemViaApi(itemId, () => {}, [], { preuveRequise: true, boutiqueAttendue: attendue });
  return { r, posts };
}

const bg = chargerBackground();
const CAPTURE = { verdict: "valide", payload: { titre: "Article", natif: { catalog_id: 1, package_size_id: 1 } }, libelles: {}, photos_urls: [] };
const CAS = [
  { job: "3a721b23-6a73-40f4-8f54-784ceb6421ef", item: "9649184767", boutique: "8944020" },
  { job: "b07b735e-c96c-413b-8d47-5fa9938baee3", item: "9707128035", boutique: "8944020" },
  { job: "f3ba2985-efdf-4577-b08b-eb9943d8e0e4", item: "10026664652", boutique: "138188364" },
];
const recreation = (pf) => bg.construireJobRecreation(
  { id: "j", platform: "vinted", action: "republish", title: "Article", inventaire_id: 1, platform_fields: pf }, pf, CAPTURE, 10);

console.log("\n1. Le job de recréation porte l'origine du job servi");
{
  ok("origine recopiée telle quelle", recreation({ vinted_account_id: "8944020" }).platform_fields.vinted_account_id === "8944020");
  ok("origine numérique ramenée en texte", recreation({ vinted_account_id: 138188364 }).platform_fields.vinted_account_id === "138188364");
  ok("origine absente : aucune clé, rien d'inventé", !("vinted_account_id" in recreation({}).platform_fields));
  ok("origine vide : aucune clé", !("vinted_account_id" in recreation({ vinted_account_id: "  " }).platform_fields));
}

console.log("\n2. Les trois republications réelles");
for (const c of CAS) {
  const jr = recreation({ vinted_account_id: c.boutique, vinted_item_id: c.item });
  const bon = await supprimer(c.item, jr.platform_fields.vinted_account_id, c.boutique);
  ok(`${c.job.slice(0, 8)} : preuve acquise, une requête sur /api/v2/items/${c.item}/delete`,
    bon.r.success === true && bon.posts.length === 1 && bon.posts[0] === `/api/v2/items/${c.item}/delete`,
    JSON.stringify(bon.r.verdict));
  const autre = await supprimer(c.item, jr.platform_fields.vinted_account_id, "1");
  ok(`${c.job.slice(0, 8)} : Chrome sur une autre boutique → boutique_etrangere, aucune requête`,
    autre.r.success === false && autre.posts.length === 0 && autre.r.verdict?.conclusion === "boutique_etrangere");
}

console.log("\n3. Sans preuve, rien ne part — et la preuve manquante est nommée");
{
  const sans = await supprimer("9649184767", recreation({}).platform_fields.vinted_account_id, "8944020");
  ok("origine absente → identite_non_prouvee/boutique_article, aucune requête",
    sans.posts.length === 0 && sans.r.verdict?.conclusion === "identite_non_prouvee" && sans.r.verdict?.preuve_manquante === "boutique_article");
  ok("une preuve absente n'accuse aucune boutique (pas de boutiqueEtrangere)", !("boutiqueEtrangere" in sans.r));
  ok("le site d'appel de la une-passe lit job.platform_fields?.vinted_account_id",
    /deleteVintedItemViaApi\(String\(onePass\.item_id\), tDel, traceDel, \{ preuveRequise: true, boutiqueAttendue: job\.platform_fields\?\.vinted_account_id \}\)/.test(sourceVinted));
}

console.log("\n4. Le message nomme le mur");
{
  const bgSrc = fs.readFileSync(path.join(DOSSIER, "background.js"), "utf8");
  const bloc = bgSrc.slice(bgSrc.indexOf("const murBoutique ="), bgSrc.indexOf("const murBoutique =") + 1400);
  ok("les trois murs de boutique ont leur phrase", /boutique_etrangere[\s\S]*identite_non_prouvee[\s\S]*preuve_manquante === "session"[\s\S]*Actualiser mon dressing/.test(bloc));
  ok("aucune ne dit « quand tu veux »", !/quand tu veux/.test(bloc.slice(0, bloc.indexOf("// Formulation (2026-09-11)"))));
  ok("le mur passe AVANT le message générique", /error: state === "active" && murBoutique/.test(bgSrc));
  ok("preuve_manquante survit au nettoyage du verdict",
    bg.nettoyerVerdictSuppression({ conclusion: "identite_non_prouvee", preuve_manquante: "boutique_article" }).preuve_manquante === "boutique_article");
}

// ── 5. LA RECRÉATION SE RATTACHE PAR L'IDENTIFIANT DE NOTRE DÉPÔT ──────────
// Test réel du 28/09 (poste Nico, job 221274a6, T-shirt Adidas) : suppression
// 9974779287 HTTP 200, recréation 10173633450 en ligne, mais rattachement
// refusé (titre = soupçon, point A) → question, puis doublon au relevé de
// 21:42. La redirection de l'onglet vers /items/10173633450 est la preuve.
console.log("\n5. Rattachement de la recréation par la redirection de notre dépôt");
{
  const ecouteurs = new Set();
  bg.chrome.tabs = { ...bg.chrome.tabs,
    onUpdated: { addListener: (f) => ecouteurs.add(f), removeListener: (f) => ecouteurs.delete(f) },
    get: async () => ({ id: 7, url: "https://www.vinted.fr/items/10173633450-t-shirt-adidas-sergio-garcia-vintage?referrer=upload" }) };
  const suivi = bg.suivreRedirectionsAnnonce(7);
  for (const f of ecouteurs) {
    f(7, { url: "https://www.vinted.fr/items/new" }, {});
    f(8, { url: "https://www.vinted.fr/items/555" }, {}); // autre onglet : ignoré
    f(7, { status: "loading", url: "https://www.vinted.fr/items/10173633450-t-shirt-adidas-sergio-garcia-vintage" }, {});
  }
  const ids = await suivi.arreter();
  ok("seul l'identifiant de NOTRE onglet est retenu, une fois", JSON.stringify(ids) === JSON.stringify(["10173633450"]), JSON.stringify(ids));
  ok("l'écoute est retirée à la fin du dépôt", ecouteurs.size === 0);

  const dressing = [
    { vinted_item_id: "10173633450", titre: "T-shirt Adidas Sergio Garcia vintage", url: "https://www.vinted.fr/items/10173633450" },
    { vinted_item_id: "10144115529", titre: "Short de bain Quiksilver taille M orange" },
  ];
  const trouve = bg.annonceDeNotreDepot(ids, "9974779287", dressing, new Set(["9974779287"]));
  ok("cas réel : 10173633450 rattachée sans passer par le titre", trouve?.vinted_item_id === "10173633450");
  ok("deux annonces vues dans l'onglet : ambigu, rien", bg.annonceDeNotreDepot(["10173633450", "10144115529"], "9974779287", dressing, new Set()) === null);
  ok("identifiant déjà connu de l'inventaire : rien", bg.annonceDeNotreDepot(ids, "9974779287", dressing, new Set(["10173633450"])) === null);
  ok("absente du dressing du compte connecté : rien", bg.annonceDeNotreDepot(ids, "9974779287", dressing.slice(1), new Set()) === null);
  ok("seule l'ancienne annonce vue : rien", bg.annonceDeNotreDepot(["9974779287"], "9974779287", dressing, new Set()) === null);
  ok("aucune redirection (modale Vinted) : rien, la question reste", bg.annonceDeNotreDepot([], "9974779287", dressing, new Set()) === null);

  const bgSrc = fs.readFileSync(path.join(DOSSIER, "background.js"), "utf8");
  ok("les deux dépôts de recréation suivent la redirection",
    (bgSrc.match(/const suiviRedirection = suivreRedirectionsAnnonce\(tabId\);\n      try \{\n        result = await envoyerFillListing\(tabId, jobRecreation\);/g) ?? []).length === 2);
  ok("après coupure : l'identifiant de notre dépôt passe AVANT le titre",
    bgSrc.indexOf("annonceDeNotreDepot(result?.idsRedirection") < bgSrc.indexOf("reconnaitreAnnonceRecreee(page2.articles"));
  ok("avant une nouvelle tentative : la redirection précédente passe AVANT le titre",
    bgSrc.indexOf("annonceDeNotreDepot(pf.recreation_redirection?.ids") < bgSrc.indexOf("reconnaitreAnnonceRecreee(page.articles"));
  ok("le titre seul ne rattache toujours rien (point A intact)",
    /identité à confirmer`, candidats \};/.test(bgSrc));
}

console.log(ko ? `\n${ko} échec(s).` : "\nUne-passe Vinted : origine transmise, preuve exacte ou aucune requête ; recréation rattachée par son identifiant.");
process.exit(ko ? 1 : 0);
