// ── AUTOTEST : « ARTICLE VENDU » SUR UNE ANNONCE LEBONCOIN VIVANTE ───────────
// (2026-09-19) Ce fichier ne relit pas le code : il l'EXÉCUTE. background.js est
// chargé dans un contexte vm avec chrome.* simulé, `fetchListingHtml` est
// remplacé par un oracle, et on observe ce que `checkListingState` conclut.
//
// LE RELEVÉ QUI FONDE CE DÉTECTEUR (19/09, pages publiques, vue visiteur) :
//   248 annonces distinctes tirées au hasard parmi nos 539 jobs Leboncoin
//   'published' sans drapeau →  227 en HTTP 200, dont 2 portant le marqueur ;
//   21 en 410/404, restées INDÉTERMINÉES. Les deux vendues portaient le
//   marqueur UNE fois, au même endroit : juste avant le <h1>.
//
// CE QUE CE FICHIER VERROUILLE, et pourquoi chaque contrôle existe :
//   · LE DICTIONNAIRE. Le HTML de CHAQUE annonce contient
//     "transaction-status-sold":{"text":"Article vendu"}. Un test sur la chaîne
//     nue déclarerait vendues les 225 annonces vivantes du relevé. C'est le
//     même piège que "sold":"Vendu" chez Beebs.
//   · LA PAGE MORTE. La page « Cette annonce est désactivée » contient
//     « Le bien a déjà été vendu et l'annonceur a supprimé son annonce » — une
//     liste de CAUSES POSSIBLES, servie à TOUTE annonce disparue, vendue ou
//     retirée. Elle ne prouve rien et ne doit JAMAIS conclure "sold".
//   · L'ANCRAGE. Le bas de page liste les annonces recommandées d'autres
//     vendeurs : un marqueur APRÈS le <h1> n'appartient pas à cette annonce.
//   · LA MÉMOIRE DES URL MORTES. Une vente se lit sur une page EN 200 : la
//     mémoriser comme morte (30 j) dégraderait la preuve positive en simple
//     doute à la relecture suivante.
//
//   node scripts/leboncoin-vendu-selftest.mjs
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DOSSIER = path.join(RACINE, "chrome-extension");
const ID = "3246781373";
const URL_ANNONCE = `https://www.leboncoin.fr/ad/jeux_jouets/${ID}`;

let echecs = 0;
const ok = (titre, condition, detail = "") => {
  if (condition) console.log(`  ok   ${titre}`);
  else { echecs += 1; console.log(`  KO   ${titre}${detail ? ` — ${detail}` : ""}`); }
};

// ── Les fragments RÉELS, recopiés du HTML servi par Leboncoin ────────────────
// Présent sur TOUTES les pages d'annonce, vendues ou non.
const DICTIONNAIRE =
  '"transaction-status-in-progress":{"text":"Un achat est en cours sur cet article"},' +
  '"transaction-status-sold":{"text":"Article vendu"}},"delivery":{"other":{"text":"le vendeur…"}}';
// Le marqueur RENDU, tel qu'il arrive : un <p> seul, juste avant le <h1>.
const MARQUEUR_RENDU = '<p class="text-body-2 text-neutral">Article vendu</p></div></div>';
const H1 = '<h1 class="text-headline-1">Peluche Réversible 2 en 1 Loup et Renard</h1>';
const CORPS = `<div class="ad"><script>window.__D={"list_id":${ID},"price":[15]}</script>`;
const RECOMMANDEES = '<section aria-label="Ces annonces peuvent vous intéresser">…</section>';

const page = ({ marqueurAvantH1 = false, marqueurApresH1 = false, id = ID } = {}) =>
  "<html><head><title>Peluche — Jeux &amp; Jouets</title></head><body>" +
  CORPS.replace(String(ID), String(id)) +
  (marqueurAvantH1 ? MARQUEUR_RENDU : "") + H1 +
  (marqueurApresH1 ? RECOMMANDEES + MARQUEUR_RENDU : RECOMMANDEES) +
  `<script>${DICTIONNAIRE}</script></body></html>`;

// La page servie quand l'annonce n'existe plus. Relevée telle quelle : elle est
// IDENTIQUE que l'annonce ait été vendue ou retirée (410 dans les deux cas).
const PAGE_DESACTIVEE =
  "<html><head><title>Annonce introuvable</title></head><body>" +
  "<h1>Cette annonce est désactivée</h1>" +
  "<p>Causes possibles :</p><ul><li>Le bien a déjà été vendu et l’annonceur a supprimé son annonce.</li>" +
  "<li>Si vous venez de recevoir l’email de validation de votre annonce…</li></ul>" +
  `<script>${DICTIONNAIRE}</script></body></html>`;

// ── Bac à sable ──────────────────────────────────────────────────────────────
function charger(oracle) {
  const local = {};
  const aire = (bag) => ({
    get: async (k) => (k == null ? { ...bag }
      : typeof k === "string" ? (k in bag ? { [k]: bag[k] } : {})
      : Object.fromEntries((Array.isArray(k) ? k : [k]).filter((n) => n in bag).map((n) => [n, bag[n]]))),
    set: async (o) => { Object.assign(bag, o); },
    remove: async (k) => { delete bag[k]; },
  });
  const rien = { addListener: () => {}, removeListener: () => {} };
  const ctx = {
    console: { log: () => {}, warn: () => {}, error: () => {}, info: () => {}, debug: () => {} },
    setTimeout, clearTimeout, setInterval, clearInterval,
    URL, TextEncoder, TextDecoder, crypto: globalThis.crypto,
    Blob: globalThis.Blob, FormData: globalThis.FormData,
    atob: (s) => Buffer.from(s, "base64").toString("binary"),
    btoa: (s) => Buffer.from(s, "binary").toString("base64"),
    importScripts: (f) => vm.runInContext(fs.readFileSync(path.join(DOSSIER, f), "utf8"), contexte, { filename: f }),
    fetch: async () => ({ ok: false, status: 429, text: async () => "", url: "" }),
    chrome: {
      runtime: { onMessage: rien, onInstalled: rien, onStartup: rien, onUpdateAvailable: rien,
        lastError: null, id: "selftest", getManifest: () => ({ version: "0.0.0" }) },
      alarms: { onAlarm: rien, create: () => {}, getAll: async () => [], get: async () => null, clear: async () => false },
      storage: { local: aire(local), session: aire({}), onChanged: rien },
      tabs: { onRemoved: rien, onUpdated: rien, query: async () => [], create: async () => ({ id: 99 }),
        remove: async () => {}, sendMessage: () => {}, update: async () => ({ id: 42 }), get: async () => null },
      windows: { onRemoved: rien, create: async () => ({ id: 1, tabs: [{ id: 1 }] }), getAll: async () => [], remove: async () => {}, update: async () => {} },
      scripting: { executeScript: async () => [{ result: null }] },
      cookies: { get: async () => null, getAll: async () => [] },
      action: { onClicked: rien, setBadgeText: () => {}, setBadgeBackgroundColor: () => {} },
      power: { requestKeepAwake: () => {}, releaseKeepAwake: () => {} },
      notifications: { create: () => {} },
    },
  };
  ctx.globalThis = ctx; ctx.self = ctx;
  const contexte = vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(DOSSIER, "background.js"), "utf8"), contexte, { filename: "background.js" });
  // L'oracle remplace la couche réseau : c'est le DÉTECTEUR qu'on teste, pas le
  // transport. `sleep` est neutralisé — les 3 tirs Leboncoin s'espacent de 0,7 à
  // 1,6 s en vrai, on ne veut pas les attendre ici.
  let appels = 0;
  ctx.fetchListingHtml = async (url) => { appels += 1; return oracle(url); };
  ctx.sleep = async () => {};
  return { ctx, local, nbAppels: () => appels };
}

const lire = async (oracle) => {
  const { ctx, local, nbAppels } = charger(oracle);
  const r = await ctx.checkListingState(URL_ANNONCE, "leboncoin");
  return { ...r, urlsMortes: local.lbc_urls_mortes ?? {}, appels: nbAppels() };
};
const servie = (html, status = 200) => async (url) => ({ ok: status >= 200 && status < 300, status, html, finalUrl: url });

console.log("\n── LEBONCOIN : « Article vendu » sur une annonce VIVANTE ───────");

console.log("\n1. Les trois cas RELEVÉS le 19/09");
{
  const vendue = await lire(servie(page({ marqueurAvantH1: true })));
  ok("200 + marqueur rendu avant le <h1> → sold", vendue.state === "sold", vendue.state);
  ok("aucun prix rendu (le prix affiché n'est pas le prix payé)", vendue.price === null, String(vendue.price));

  const vivante = await lire(servie(page()));
  ok("200 sans marqueur rendu → active (225 cas sur 227)", vivante.state === "active", vivante.state);

  const morte = await lire(servie(PAGE_DESACTIVEE, 410));
  ok("410 « annonce désactivée » → unavailable, JAMAIS sold", morte.state === "unavailable", morte.state);
}

console.log("\n2. Les deux pièges mortels");
{
  // Le dictionnaire est présent dans TOUTES les pages ci-dessus : si le test
  // portait sur la chaîne nue, le cas « vivante » serait déjà tombé en sold.
  const vivante = await lire(servie(page()));
  ok("le dictionnaire i18n ne vaut pas preuve (\"text\":\"Article vendu\")",
    vivante.state === "active", vivante.state);

  // Même page morte, servie en 200 (le filet du détecteur, pas le 410 amont).
  const morteEn200 = await lire(servie(PAGE_DESACTIVEE, 200));
  ok("« Le bien a déjà été vendu… » de la page morte ne conclut PAS sold",
    morteEn200.state === "unavailable", morteEn200.state);
}

console.log("\n3. L'ancrage avant le <h1>");
{
  const recommandee = await lire(servie(page({ marqueurApresH1: true })));
  ok("un marqueur APRÈS le <h1> (annonces recommandées) → active",
    recommandee.state === "active", recommandee.state);
  const lesDeux = await lire(servie(page({ marqueurAvantH1: true, marqueurApresH1: true })));
  ok("marqueur avant ET après → sold (le sien compte)", lesDeux.state === "sold", lesDeux.state);
}

console.log("\n4. L'annonce doit être CELLE QU'ON CHERCHE");
{
  const autre = await lire(servie(page({ marqueurAvantH1: true, id: "9999999999" })));
  ok("list_id d'une AUTRE annonce → unknown, jamais sold", autre.state === "unknown", autre.state);
}

console.log("\n5. La mémoire des URL mortes");
{
  const vendue = await lire(servie(page({ marqueurAvantH1: true })));
  ok("une VENTE n'entre PAS dans les URL mortes (la page est en 200)",
    Object.keys(vendue.urlsMortes).length === 0, JSON.stringify(vendue.urlsMortes));
  ok("une vente tranche au 1er tir (aucune relecture inutile)", vendue.appels === 1, String(vendue.appels));

  const morte = await lire(servie(PAGE_DESACTIVEE, 410));
  ok("une annonce MORTE entre dans les URL mortes", Object.keys(morte.urlsMortes).length === 1,
    JSON.stringify(morte.urlsMortes));
}

console.log("\n6. Aucune lecture ratée ne conclut");
{
  const botShield = await lire(servie("<html><body>datadome captcha</body></html>", 403));
  ok("HTTP 403 (bot-shield) → unknown", botShield.state === "unknown", botShield.state);
  const vide = await lire(servie("<html><body>page inattendue</body></html>"));
  ok("page sans list_id ni marqueur → unknown", vide.state === "unknown", vide.state);
  const casse = await lire(async () => { throw new Error("réseau coupé"); });
  ok("exception réseau → unknown", casse.state === "unknown", casse.state);
}

console.log(echecs === 0
  ? `\n✅ ${"tous les contrôles passent"}\n`
  : `\n❌ ${echecs} contrôle(s) en échec\n`);
process.exit(echecs === 0 ? 0 : 1);
