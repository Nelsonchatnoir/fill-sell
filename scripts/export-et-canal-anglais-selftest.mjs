// Autotest — L'EXPORT EXCEL ET LE CANAL ANDROID « VENTES » DANS LA LANGUE DE L'APP (06/11/2026, phase 3, décision de Nico)
//   npm run selftest:export-et-canal-anglais
//
// 1. L'export Excel (App.jsx, handleExport) prend ses textes dans utils/exportTextes.js : en français, chaque en-tête,
//    feuille, mois, format de date et titre de partage est MOT POUR MOT celui d'avant (recopiés ici depuis HEAD
//    976f13b) ; en anglais, tout est anglais ; les données de la personne ne passent jamais par une traduction.
// 2. Le canal Android des ventes (notifications/pushVentes.js) : en français, l'objet passé à createChannel est
//    EXACTEMENT celui d'avant (« Ventes », « Une notification à chaque vente ») ; en anglais « Sales » ; l'id
//    ('ventes', visé par le serveur) et l'importance ne changent jamais. Le module natif est simulé (pont Android ou
//    iOS, plugin présent ou absent), chaque cas dans son propre processus — @capacitor/core lit l'environnement une
//    seule fois, à son chargement.
import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// ── Un cas du canal, dans son processus (appelé par le test lui-même) ─────────
if (process.argv[2] === "--cas") {
  const [, , , plateforme, avecPlugin, fsLang, scenario] = process.argv;
  const { registerHooks } = await import("node:module");
  // Le plugin natif simulé : il note chaque appel (jamais « thenable »).
  globalThis.__appelsPush = [];
  const faux = "export const PushNotifications = {"
    + " createChannel: async (o) => { globalThis.__appelsPush.push(['createChannel', o]); },"
    + " addListener: async (e) => { globalThis.__appelsPush.push(['addListener', e]); return { remove: async () => {} }; },"
    + " checkPermissions: async () => ({ receive: 'prompt' }), requestPermissions: async () => ({ receive: 'prompt' }),"
    + " register: async () => { globalThis.__appelsPush.push(['register']); }, unregister: async () => {} };";
  registerHooks({
    resolve(specifier, context, next) {
      if (specifier === "@capacitor/push-notifications") return { url: `data:text/javascript,${encodeURIComponent(faux)}`, shortCircuit: true };
      return next(specifier, context);
    },
  });
  globalThis.window = globalThis;
  const store = new Map(fsLang && fsLang !== "-" ? [["fs_lang", fsLang]] : []);
  globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
  const pont = [];
  if (plateforme === "ios") globalThis.webkit = { messageHandlers: { bridge: { postMessage: (m) => pont.push(m) } } };
  if (plateforme === "android") globalThis.androidBridge = { postMessage: (m) => pont.push(m) };
  const entetes = ["App", "SplashScreen", ...(avecPlugin === "oui" ? ["PushNotifications"] : [])];
  globalThis.Capacitor = { PluginHeaders: entetes.map((name) => ({ name, methods: [] })) };
  let erreur = null;
  const r = {};
  try {
    const m = await import(pathToFileURL(join(ROOT, "src/notifications/pushVentes.js")).href);
    if (scenario === "init") {
      r.init = (await m.initialiserPush({ versionApp: "essai" })).etat;
    } else {
      r.premier = await m.nommerCanalVentes(scenario.split(",")[0]);
      for (const l of scenario.split(",").slice(1)) r[`ensuite_${l}`] = await m.nommerCanalVentes(l);
    }
  } catch (e) {
    erreur = String(e?.stack ?? e?.message ?? e);
  }
  console.log(JSON.stringify({ ...r, erreur, canaux: globalThis.__appelsPush.filter((a) => a[0] === "createChannel").map((a) => a[1]), pont: pont.length }));
  process.exit(0);
}

let ko = 0;
const ok = (c, nom, d = "") => { if (c) console.log(`  ✓ ${nom}`); else { console.error(`  ✗ ${nom}${d ? `\n      ${d}` : ""}`); ko++; } };
const lire = (p) => fs.readFileSync(join(ROOT, p), "utf8").split("\r\n").join("\n");
const memes = (a, b) => JSON.stringify(a) === JSON.stringify(b);

console.log("\n1. L'EXPORT EXCEL");
const { textesExport } = await import(pathToFileURL(join(ROOT, "src/utils/exportTextes.js")).href);
// Les textes de l'export tels qu'App.jsx les écrivait (HEAD 976f13b, handleExport) — le français ne change pas d'un mot.
const AVANT = {
  mois: ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"],
  colonnesVentes: ["Nom", "Marque", "Catégorie", "Description", "Quantité", "Prix achat", "Frais", "Prix vente", "Bénéfice", "Marge %", "Emplacement", "Date vente"],
  colonnesRecap: ["Mois", "Nb ventes", "CA total (€)", "Bénéfice total (€)", "Marge moyenne (%)"],
  feuilleRecap: "Récapitulatif",
  colonnesInventaire: ["Nom", "Marque", "Catégorie", "Description", "Quantité", "Prix achat unit.", "Total investi", "Emplacement", "Date ajout"],
  feuilleInventaire: "Inventaire",
  locale: "fr-FR",
  titrePartage: "Export FillSell",
};
const fr = textesExport("fr");
for (const cle of Object.keys(AVANT)) ok(memes(fr[cle], AVANT[cle]), `français, ${cle} : mot pour mot comme avant`, `${JSON.stringify(fr[cle])}`);
ok(memes(Object.keys(fr).sort(), Object.keys(AVANT).sort()), "français : aucune clé de plus, aucune de moins");
ok(textesExport() === fr && textesExport("de") === fr && textesExport(undefined) === fr, "langue absente ou inconnue : le français d'avant");
const en = textesExport("en");
ok(memes(Object.keys(en).sort(), Object.keys(fr).sort()), "anglais : les mêmes textes, un pour un");
for (const cle of ["mois", "colonnesVentes", "colonnesRecap", "colonnesInventaire"]) ok(en[cle].length === fr[cle].length, `anglais, ${cle} : autant de colonnes (${fr[cle].length})`);
const textesEn = [...en.mois, ...en.colonnesVentes, ...en.colonnesRecap, ...en.colonnesInventaire, en.feuilleRecap, en.feuilleInventaire, en.titrePartage];
// « Description » et « Total » s'écrivent pareil ; tout le reste diffère du français et n'a aucun accent français.
const pareils = new Set(["Description"]);
ok(textesEn.every((t) => !/[àâçéèêëîïôûùœ]/i.test(t)), "anglais : aucun accent français", textesEn.filter((t) => /[àâçéèêëîïôûùœ]/i.test(t)).join(", "));
ok([...en.colonnesVentes, ...en.colonnesInventaire, ...en.colonnesRecap].every((t, i) => pareils.has(t) || t !== [...fr.colonnesVentes, ...fr.colonnesInventaire, ...fr.colonnesRecap][i]),
  "anglais : chaque en-tête traduit (sauf « Description », identique)");
ok(memes(en.mois, ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]) && en.locale === "en-GB"
  && en.feuilleRecap === "Summary" && en.feuilleInventaire === "Inventory", "anglais : mois, dates (en-GB, comme le reste de l'app) et feuilles");
ok(Object.isFrozen(fr) && Object.isFrozen(fr.mois) && Object.isFrozen(en.colonnesVentes), "textes figés (personne ne les modifie en route)");
ok([...en.mois.map((m) => `${m} 2026`), en.feuilleRecap, en.feuilleInventaire].every((n) => n.length <= 31 && !/[\\/?*[\]:]/.test(n)), "noms de feuilles valides pour Excel (≤ 31 caractères, sans caractère interdit)");
// App.jsx : handleExport prend TOUS ses textes dans exportTextes.js — plus aucun libellé français en dur.
const app = lire("src/App.jsx");
const debut = app.indexOf("async function handleExport(){");
const fin = app.indexOf("const handleAppleSignIn", debut);
const exp = debut >= 0 && fin > debut ? app.slice(debut, fin) : "";
ok(exp.length > 0, "handleExport trouvé dans App.jsx");
ok(/const TX=textesExport\(lang\);/.test(exp) && /const FULL_MONTHS=TX\.mois;/.test(exp) && /const MONTH_HEADERS=TX\.colonnesVentes;/.test(exp)
  && /const RECAP_HEADERS=TX\.colonnesRecap;/.test(exp) && /const INV_HEADERS=TX\.colonnesInventaire;/.test(exp)
  && /book_append_sheet\(wb,recapWs,TX\.feuilleRecap\)/.test(exp) && /book_append_sheet\(wb,invWs,TX\.feuilleInventaire\)/.test(exp)
  && (exp.match(/toLocaleDateString\(TX\.locale\)/g) ?? []).length === 2 && /title:TX\.titrePartage/.test(exp), "handleExport : en-têtes, mois, feuilles, dates et titre viennent de textesExport(lang)");
ok(!/'Janvier'|'Récapitulatif'|'Inventaire'|'Prix achat unit\.'|'Date vente'|toLocaleDateString\('fr-FR'\)|'Export FillSell'/.test(exp), "handleExport : plus aucun libellé français en dur");
ok(/\{v:item\.title\|\|'',t:'s',s:rs\}/.test(exp) && /\{v:item\.marque\|\|'',t:'s',s:rs\}/.test(exp) && /\{v:item\.type\|\|'',t:'s',s:rs\}/.test(exp),
  "les données de la personne (titre, marque, catégorie) passent telles quelles");
ok(/import \{ textesExport \} from '\.\/utils\/exportTextes';/.test(app), "App.jsx importe exportTextes");

console.log("\n2. LE CANAL ANDROID « VENTES »");
const { canalVentes, CANAL_VENTES_ID } = await import(pathToFileURL(join(ROOT, "src/notifications/pushVentes.js")).href);
// L'objet passé à createChannel avant ce changement (HEAD 976f13b, pushVentes.js, brancherEcoutes).
const CANAL_AVANT = { id: "ventes", name: "Ventes", description: "Une notification à chaque vente", importance: 4, visibility: 1, sound: "default", vibration: true };
const trie = (o) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)));
ok(memes(trie(canalVentes("fr")), trie(CANAL_AVANT)), "français : le canal d'avant, mot pour mot (« Ventes », sa description, id, importance, son, vibration)");
ok(memes(trie(canalVentes()), trie(CANAL_AVANT)) && memes(trie(canalVentes("de")), trie(CANAL_AVANT)), "langue absente ou inconnue : le canal français");
const canalEn = canalVentes("en");
ok(canalEn.name === "Sales" && canalEn.description === "A notification for each sale", "anglais : « Sales », « A notification for each sale »");
ok(memes(trie({ ...canalEn, name: CANAL_AVANT.name, description: CANAL_AVANT.description }), trie(CANAL_AVANT)) && CANAL_VENTES_ID === "ventes",
  "anglais : l'id ('ventes'), l'importance (4), la visibilité, le son et la vibration ne changent pas");
const push = lire("src/notifications/pushVentes.js");
// (06/11) La façade PluginPush (push-plugin-proxy) relaie createChannel : seul l'APPEL de l'app (p.createChannel) compte.
ok((push.match(/\bp\.createChannel\(/g) ?? []).length === 1 && /await p\.createChannel\(canalVentes\(l\)\);/.test(push), "un seul createChannel dans le code, toujours avec canalVentes(langue)");
ok(/await nommerCanalVentes\(langueDeLApp\(\)\);/.test(push), "à la connexion et à l'ouverture : le canal prend la langue de l'app");
ok(/c\.setLang\(l\); nommerCanalVentes\(l\)\.catch\(\(\) => \{\}\);/.test(lire("src/reglages/SousPagePreferences.jsx")), "Réglages › Préférences : changer de langue renomme le canal");
ok(/channel_id/.test(push) && !/CANAL_VENTES_ID = '(?!ventes')/.test(push), "le serveur vise toujours le canal 'ventes'");

const cas = (nom, plateforme, avecPlugin, fsLang, scenario, verifie) => {
  const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url), "--cas", plateforme, avecPlugin, fsLang, scenario], {
    cwd: ROOT, encoding: "utf8", env: { ...process.env, NODE_OPTIONS: "--import ./scripts/loader-ext.mjs" },
  });
  let res = null;
  try { res = JSON.parse(String(r.stdout).trim().split("\n").pop()); } catch { /* sortie illisible */ }
  ok(Boolean(res && res.erreur === null && verifie(res)), nom, JSON.stringify(res) || String(r.stderr).slice(0, 600));
};
const enFr = (o) => memes(trie(o), trie(CANAL_AVANT));
const enEn = (o) => memes(trie(o), trie(canalEn));
cas("Android, app en français : à l'ouverture, createChannel reçoit l'objet d'avant", "android", "oui", "fr", "init", (r) => r.canaux.length === 1 && enFr(r.canaux[0]));
cas("Android, app en anglais : à l'ouverture, le canal s'appelle « Sales » (même id)", "android", "oui", "en", "init", (r) => r.canaux.length === 1 && enEn(r.canaux[0]));
cas("Android : passer en anglais puis revenir au français renomme le canal, deux fois le même id", "android", "oui", "fr", "en,fr", (r) => r.canaux.length === 2 && enEn(r.canaux[0]) && enFr(r.canaux[1]));
cas("Android : la même langue deux fois de suite n'appelle createChannel qu'une fois", "android", "oui", "-", "fr,fr", (r) => r.canaux.length === 1 && enFr(r.canaux[0]) && r.ensuite_fr === true);
cas("iOS : aucun canal (Android seulement)", "ios", "oui", "en", "en", (r) => r.premier === false && r.canaux.length === 0);
cas("Android SANS le module natif (binaire d'avant 2.9.62) : rien, aucune erreur", "android", "non", "en", "en", (r) => r.premier === false && r.canaux.length === 0 && r.pont === 0);
cas("navigateur : rien", "web", "non", "en", "en", (r) => r.premier === false && r.canaux.length === 0);

console.log(ko ? `\n✗ ${ko} échec(s)` : "\n✓ export et canal des ventes : français inchangé, anglais traduit");
process.exit(ko ? 1 : 0);
