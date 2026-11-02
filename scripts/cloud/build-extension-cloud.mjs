// LA COPIE CLOUD DE L'EXTENSION — celle qui tourne dans les navigateurs FillSell
// Cloud (serveurs Hetzner). Construite à partir du chrome-extension/ COMMITÉ
// (git archive : jamais un fichier de travail), transformée EXACTEMENT comme le
// paquet du Chrome Web Store (scripts/minify-extension.mjs), puis ajustée par
// des patchs à ancre UNIQUE (une ancre absente ou double = arrêt, rien n'est
// produit). Le dossier chrome-extension/ n'est JAMAIS modifié : l'extension
// du parc reste strictement identique.
//
//   node scripts/cloud/build-extension-cloud.mjs [--commit=HEAD]
//   → build/extension-cloud/ (copiée sur le serveur par serveur-cloud/outils/deployer.sh)
//
// Ce qui change dans la copie Cloud (et rien d'autre) :
//   · Vinted, Leboncoin, Beebs, Depop (30/10) seulement : eBay passe par l'API (jamais par ce
//     navigateur), Opla sort le 10/10 (aucune permission Opla → « sans_opla ») ;
//   · le poste se déclare « poste_cloud » à get-pending-jobs (qui ne lui sert que
//     ces plateformes et n'écrase pas profiles.extension_build de l'ordinateur) ;
//   · les demandes « Me connecter » de l'extension sont ignorées : dans le Cloud,
//     c'est l'écran de l'app (orchestrateur) qui ouvre la page de connexion ;
//   · identifiant fixe (clé de manifeste) : dnankhhfellobiobloopcjgkdioblpjd ;
//   · BUILD_ID « …-cloud » : handler_build dit qui a traité quoi ;
//   · (30/10, règle de Nico) la sonde de session ne visite JAMAIS une plateforme dont le cookie de connexion est
//     absent de ce navigateur (même règle que estConnectee, serveur-cloud/src/plateformes.js) : sur un profil neuf,
//     chaque sonde était un 403 DataDome sur l'IP du compte, toutes les heures.
import { execFileSync } from 'node:child_process';
import { readFile, writeFile, mkdir, rm, readdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SORTIE = path.join(RACINE, 'build', 'extension-cloud');
const TRAVAIL = path.join(RACINE, 'build', 'extension-cloud-src');
const BUILD_TOKEN = '__FILLSELL_BUILD_ID__';
// Clé PUBLIQUE de la copie Cloud (fixe l'identifiant ; rien de secret).
const CLE_PUBLIQUE = 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAnz+xal/tm6qqr81BGvwBZtEVu295j+t0LAHLM4nAiJwbRL6E+uSRMBEBQ9n4cM8wg9YJuV0QyCuotpO6JkfZcCKmZzlN3RCRNdzWsyRqvf+jjw/7J3FpIPcHSDeqxJbMpLfN1smMBNIPPmZT1/laTAeHjmw9htncYuysvTeMOHpViDuJgUTSfG1+8NX5Fw6v6cF/FnvEMaYAWqguWpKFqt4HgWDTDAZL5/bMOOtx6a7wu7+rqnqXnMnrNtORR1B8SYhjuzsaDD3bUMXOg7s8o+pT65HJ/KXBDm96WDKThA9Bh4xZ/q+rlF5esJIVdutY0IAxy7hz8BdZOb1k8x+pYwIDAQAB';
export const ID_EXTENSION_CLOUD = 'dnankhhfellobiobloopcjgkdioblpjd';
// (30/10, lot D) + Depop (Nico : « un bouton Me connecter par plateforme ») : son accès d'hôte est DONNÉ dans la
// copie Cloud (host_permissions), ses scripts s'enregistrent au démarrage (assurerScriptsDepop, inchangé).
export const PLATEFORMES = ['vinted', 'leboncoin', 'beebs', 'depop'];
// Les plateformes dont les scripts sont DÉCLARÉS dans le manifeste (Depop s'enregistre à l'exécution).
const PLATEFORMES_SCRIPTS_MANIFESTE = PLATEFORMES.filter((p) => p !== 'depop');
const PF = PLATEFORMES.join(',');
const L = (a) => '[' + a.map((x) => JSON.stringify(x)).join(', ') + ']';

// (30/10) La connexion d'une plateforme lue dans les SEULS cookies du navigateur (aucune requête) — portage de
// estConnectee (serveur-cloud/src/plateformes.js) : Vinted = jeton d'accès portant un utilisateur + refresh token ;
// Leboncoin = __Secure-Login ; Beebs = jeton d'accès d'un utilisateur non invité ; Depop = access_token.
// Exporté pour l'autotest, qui l'exécute sur des cookies fabriqués.
// (02/11, 00:00) chrome.cookies.getAll ne rend PAS un cookie posé SANS « Secure » depuis une page https (Chromium 156,
// cookies liés au schéma : secure faux, sourceScheme « Secure ») — c'est le cas des jetons de Beebs (access_token,
// refresh_token). Beebs était dit « non connecté » par ce verrou alors que sa session était là : 14 visites refusées,
// la republication Beebs de Nico jamais commencée (« lecture_impossible »). chrome.cookies.get({ url, name }) les rend :
// chaque cookie de connexion se lit aussi par son adresse (www, le domaine, auth.).
export const SOURCE_CONNEXION_CLOUD = `async function connexionCloudPresente(pf) {
  const domaine = { vinted: "vinted.fr", leboncoin: "leboncoin.fr", beebs: "beebs.app", depop: "depop.com" }[pf];
  if (!domaine) return false;
  const cookies = await chrome.cookies.getAll({ domain: domaine }).catch(() => []);
  const origines = ["https://www." + domaine + "/", "https://" + domaine + "/", "https://auth." + domaine + "/"];
  const val = async (nom) => {
    const c = (cookies ?? []).find((x) => x.name === nom);
    if (c) return String(c.value ?? "").trim();
    if (typeof chrome.cookies.get !== "function") return "";
    for (const url of origines) {
      const x = await chrome.cookies.get({ url, name: nom }).catch(() => null);
      if (x && String(x.value ?? "").trim()) return String(x.value).trim();
    }
    return "";
  };
  const jwt = (v) => { try { return JSON.parse(atob(String(v).split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))); } catch { return null; } };
  if (pf === "vinted") return Boolean(jwt(await val("access_token_web"))?.sub) && (await val("refresh_token_web")).length > 0;
  if (pf === "leboncoin") return (await val("__Secure-Login")).length > 0;
  if (pf === "beebs") {
    const cl = jwt(await val("access_token"));
    if (!cl) return false;
    const role = String(cl.role ?? cl.type ?? cl.user_type ?? "").toLowerCase();
    const anonyme = [cl.provider_id, cl.firebase?.sign_in_provider].some((p) => String(p ?? "").toLowerCase() === "anonymous");
    return Boolean(cl.sub ?? cl.user_id ?? cl.id) && !anonyme && !/guest|anon|invite/.test(role) && cl.is_guest !== true;
  }
  if (pf === "depop") return (await val("access_token")).length > 0;
  return false;
}`;

// (01/11, règle de Nico du 30/10 portée sur le moteur steel) LE VERROU DES PLATEFORMES DANS LA COPIE CLOUD : une
// plateforme n'est JAMAIS jointe par cette extension tant que son cookie de connexion est absent de ce navigateur
// (connexionCloudPresente) — ni par fetch (service worker), ni par un onglet ou une fenêtre ouverts par l'extension.
// « Me connecter » passe par l'orchestrateur (DevTools), pas par l'extension : il n'est pas touché. C'est le SECOND verrou :
// le premier, dans l'orchestrateur (interception DevTools du navigateur entier, serveur-cloud/src/navigateur.js), a arrêté
// le 01/11 les trois pages ouvertes par l'extension avant toute connexion (Vinted, Leboncoin, Beebs : ERR_BLOCKED_BY_CLIENT)
// mais n'est pas prouvé sur les requêtes du service worker ; celui-ci les couvre, avec les onglets et les fenêtres.
// Exporté pour l'autotest, qui l'exécute avec un faux `chrome` et un faux `fetch`.
export const SOURCE_VERROU_CLOUD = `const VERROU_DOMAINES_CLOUD = { vinted: ["vinted.fr", "vinted.com", "vinted.net"], leboncoin: ["leboncoin.fr"], beebs: ["beebs.app"], depop: ["depop.com"] };
const verrouCloud = { bloquees: 0, derniere: null, onglets: false };
function plateformeVerrouCloud(url) {
  let h = "";
  try { h = new URL(String(url)).hostname.toLowerCase(); } catch { return null; }
  for (const [pf, domaines] of Object.entries(VERROU_DOMAINES_CLOUD)) if (domaines.some((d) => h === d || h.endsWith("." + d))) return pf;
  return null;
}
async function verrouCloudRefuse(url) {
  const pf = plateformeVerrouCloud(url);
  if (!pf) return null;
  return (await connexionCloudPresente(pf).catch(() => false)) ? null : pf;
}
function refusVerrouCloud(pf) {
  verrouCloud.bloquees++;
  verrouCloud.derniere = { plateforme: pf, le: new Date().toISOString() };
  return new TypeError("FillSell Cloud : " + pf + " n'est pas connecté dans ce navigateur, aucune visite");
}
const fetchSansVerrouCloud = globalThis.fetch.bind(globalThis);
globalThis.fetch = async function fetch(entree, options) {
  const pf = await verrouCloudRefuse(typeof entree === "string" ? entree : entree?.url ?? String(entree));
  if (pf) throw refusVerrouCloud(pf);
  return fetchSansVerrouCloud(entree, options);
};
function envelopperVerrouCloud(objet, nom, adresses) {
  const origine = objet?.[nom];
  if (typeof origine !== "function") return false;
  try {
    objet[nom] = async function (...args) {
      for (const u of [].concat(adresses(args) ?? [])) {
        const pf = u ? await verrouCloudRefuse(u) : null;
        if (pf) throw refusVerrouCloud(pf);
      }
      return origine.apply(this, args);
    };
  } catch { return false; }
  return objet[nom] !== origine;
}
verrouCloud.onglets = [
  envelopperVerrouCloud(chrome.tabs, "create", (a) => a[0]?.url),
  envelopperVerrouCloud(chrome.tabs, "update", (a) => (typeof a[0] === "object" && a[0] ? a[0] : a[1])?.url),
  envelopperVerrouCloud(chrome.windows, "create", (a) => a[0]?.url),
].every(Boolean);
globalThis.__fillsellVerrouCloud = { etat: () => ({ ...verrouCloud, fetch: globalThis.fetch !== fetchSansVerrouCloud }), refuse: verrouCloudRefuse };`;

// (02/11 soir, décision de Nico) LES ONGLETS DE TRAVAIL SANS TÂCHE SONT DÉCHARGÉS. Mesuré le 02/11 (rapport
// machine-cloud-3010 § 26) : le navigateur Cloud d'un compte garde chargés ses quatre onglets de travail entre deux tâches
// (1,16 à 1,9 Go sur 2 Go permis ; l'accueil Leboncoin seul : 24 cadres de pub, 22 processus, ≈ 670 Mo) et le noyau a tué
// un processus de page de 406 Mo à 18:51:52, à la seconde du retrait Leboncoin d'une republication. Sur un PC, c'est la
// mémoire de la personne ; ici, la nôtre, plafonnée par compte.
// Règle (copie Cloud seulement ; le parc ne change pas) :
//   · en fin de cycle du poll, SOUS le verrou des tâches (aucune tâche ne tourne), l'onglet de travail Leboncoin, Beebs
//     ou Depop resté sans usage depuis DECHARGE_CLOUD_REPOS_MS est déchargé (chrome.tabs.discard : la page et ses
//     processus partent, l'onglet et son id restent — le chemin déjà suivi par navigateWorkTab) ;
//   · « usage » = l'onglet rendu par getOrCreateWorkTab ou workTabForFetch (noté en storage.session, qui survit au
//     sommeil du service worker) ; un onglet jamais vu commence son repos au premier passage ;
//   · Vinted reste chargé : sa page vivante sert les lectures SANS le verrou (lirePagePubliqueVintedSansVerrou, la
//     description qu'une personne attend à l'écran) ; l'onglet rendu à la personne (Leboncoin « Valider et payer ») :
//     jamais touché ;
//   · tout onglet déchargé est RÉVEILLÉ avant une lecture (workTabForFetch : accueil de la plateforme, comme Vinted et
//     Depop le faisaient déjà) — jamais une lecture tentée dans une page morte, jamais un repli sur le fetch du service
//     worker (que DataDome refuse).
export const DECHARGE_CLOUD_PLATEFORMES = ['leboncoin', 'beebs', 'depop'];
export const DECHARGE_CLOUD_REPOS_MS = 5 * 60_000;
export const SOURCE_DECHARGE_CLOUD = `const DECHARGE_CLOUD_PLATEFORMES = ${L(DECHARGE_CLOUD_PLATEFORMES)};
const DECHARGE_CLOUD_REPOS_MS = ${DECHARGE_CLOUD_REPOS_MS};
const USAGE_ONGLETS_CLOUD_KEY = "fillsell_cloud_usage_onglets";
const usageOngletsCloudEcrit = new Map();
async function noterUsageOngletCloud(tabId) {
  if (!Number.isInteger(tabId)) return tabId;
  const maintenant = Date.now();
  if (maintenant - (usageOngletsCloudEcrit.get(tabId) ?? 0) < 30_000) return tabId;
  usageOngletsCloudEcrit.set(tabId, maintenant);
  try {
    const s = await chrome.storage.session.get(USAGE_ONGLETS_CLOUD_KEY);
    await chrome.storage.session.set({ [USAGE_ONGLETS_CLOUD_KEY]: { ...(s?.[USAGE_ONGLETS_CLOUD_KEY] ?? {}), [tabId]: maintenant } });
  } catch { /* un usage manqué retarde au pire un déchargement */ }
  return tabId;
}
async function dechargerOngletsTravailInactifsCloud(maintenant = Date.now()) {
  const s = await chrome.storage.session.get([...DECHARGE_CLOUD_PLATEFORMES.map(workTabKey), USAGE_ONGLETS_CLOUD_KEY]).catch(() => ({}));
  const usage = { ...(s?.[USAGE_ONGLETS_CLOUD_KEY] ?? {}) };
  const attente = await lireAttentePaiementLbc().catch(() => null);
  const faits = [];
  for (const pf of DECHARGE_CLOUD_PLATEFORMES) {
    const id = s?.[workTabKey(pf)];
    if (!Number.isInteger(id) || id === attente?.tabId) continue;
    const t = await chrome.tabs.get(id).catch(() => null);
    if (!t || t.discarded) continue;
    const vu = Number(usage[id]);
    if (!Number.isFinite(vu)) { usage[id] = maintenant; continue; }
    if (maintenant - vu < DECHARGE_CLOUD_REPOS_MS) continue;
    if (t.active) {
      // Chrome ne décharge pas l'onglet montré de sa fenêtre : le premier onglet de la fenêtre de travail (le porte-page)
      // redevient l'onglet montré. Personne ne regarde un écran Cloud.
      const [premier] = await chrome.tabs.query({ windowId: t.windowId, index: 0 }).catch(() => []);
      if (!premier || premier.id === id) continue;
      await chrome.tabs.update(premier.id, { active: true }).catch(() => {});
    }
    const d = await chrome.tabs.discard(id).catch(() => null);
    if (!d) continue;
    if (Number.isInteger(d.id) && d.id !== id) await chrome.storage.session.set({ [workTabKey(pf)]: d.id }).catch(() => {});
    delete usage[id];
    usageOngletsCloudEcrit.delete(id);
    faits.push(pf);
  }
  for (const k of Object.keys(usage)) if (maintenant - Number(usage[k]) > 3_600_000) delete usage[k];
  await chrome.storage.session.set({ [USAGE_ONGLETS_CLOUD_KEY]: usage }).catch(() => {});
  if (faits.length) console.log("[cloud] onglet(s) de travail déchargé(s), sans tâche depuis " + (DECHARGE_CLOUD_REPOS_MS / 60000) + " min : " + faits.join(", "));
  return faits;
}`;

/** Les patchs de background.js (pur : testé par scripts/cloud-extension-selftest.mjs). */
export function patcherBackground(bg) {
  const appliques = [];
  const patch = (nom, ancre, remplacement) => {
    const n = bg.split(ancre).length - 1;
    if (n !== 1) throw new Error(`patch « ${nom} » : ancre trouvée ${n} fois (attendu 1) :\n  ${ancre}`);
    bg = bg.replace(ancre, () => remplacement);
    appliques.push(nom);
  };
  patch('constantes Cloud et verrou des plateformes (01/11)',
    'const FILLSELL_BUILD_ID = "__FILLSELL_BUILD_ID__";',
    'const FILLSELL_BUILD_ID = "__FILLSELL_BUILD_ID__";\n'
    + `const FILLSELL_CLOUD = true; // copie Cloud (scripts/cloud/build-extension-cloud.mjs)\n`
    + `const CLOUD_PLATEFORMES = ${L(PLATEFORMES)};\n`
    + `${SOURCE_CONNEXION_CLOUD}\n`
    + `${SOURCE_VERROU_CLOUD}\n`
    + `${SOURCE_DECHARGE_CLOUD}`);
  patch('onglets de travail déchargés : usage noté (getOrCreateWorkTab) (02/11)',
    'async function getOrCreateWorkTab(platform, url) {',
    'async function getOrCreateWorkTab(platform, url) {\n  return noterUsageOngletCloud(await getOrCreateWorkTabCloudBrut(platform, url));\n}\nasync function getOrCreateWorkTabCloudBrut(platform, url) {');
  patch('onglets de travail déchargés : usage noté (workTabForFetch) (02/11)',
    'async function workTabForFetch(platform) {',
    'async function workTabForFetch(platform) {\n  return noterUsageOngletCloud(await workTabForFetchCloudBrut(platform));\n}\nasync function workTabForFetchCloudBrut(platform) {');
  patch('onglets de travail déchargés : réveillés avant toute lecture (02/11)',
    'if ((platform === "vinted" || platform === "opla" || platform === "depop") && tab.discarded) {',
    'if (tab.discarded) { // Cloud (02/11) : toute plateforme — ses onglets sans tâche sont déchargés en fin de cycle');
  // Ancre sur UNE ligne (le dépôt de travail est en CRLF, l'archive git en LF) : la fin du cycle du poll.
  patch('onglets de travail déchargés : en fin de cycle, sous le verrou (02/11)',
    '  await cleanupOrphanWorkTabs().catch((e) =>',
    '  await dechargerOngletsTravailInactifsCloud().catch((e) => console.warn("[cloud] déchargement des onglets :", String(e?.message ?? e)));\n'
    + '  await cleanupOrphanWorkTabs().catch((e) =>');
  patch('jobs : plateformes du Cloud seulement (le serveur filtre aussi)',
    '    jobs = rep.jobs;',
    '    jobs = (Array.isArray(rep.jobs) ? rep.jobs : []).filter((j) => CLOUD_PLATEFORMES.includes(j.platform));');
  patch('capacités : poste_cloud',
    'caps.push((await oplaAccesAccorde()) ? "opla_acces" : "sans_opla");',
    'caps.push((await oplaAccesAccorde()) ? "opla_acces" : "sans_opla");\n  caps.push("poste_cloud");');
  patch('« Me connecter » : géré par l\'écran Cloud de l\'app',
    'if (Array.isArray(rep.connexion_commands) && rep.connexion_commands.length) {',
    'rep.connexion_commands = []; // Cloud : la connexion passe par l\'écran « Me connecter » de l\'app\n    if (Array.isArray(rep.connexion_commands) && rep.connexion_commands.length) {');
  patch('sondes de session (rapport)',
    'async function reportPlatformSessions(accessToken, { plateformes = ["vinted", "leboncoin", "ebay", "beebs", "opla"]',
    `async function reportPlatformSessions(accessToken, { plateformes = ${L(PLATEFORMES)}`);
  patch('sondes de session (lecture)',
    'async function probePlatformSessions(plateformes = ["vinted", "leboncoin", "ebay", "beebs", "opla"])',
    `async function probePlatformSessions(plateformes = ${L(PLATEFORMES)})`);
  patch('sondes de session : aucune visite d\'une plateforme non connectée (30/10)',
    '  const sonde = (pf, fn) => (plateformes.includes(pf) ? probe(fn) : Promise.resolve({ etat: null, http: null }));',
    '  // Cloud (30/10, règle de Nico) : sans cookie de connexion dans CE navigateur, AUCUNE requête vers la plateforme ;\n'
    + '  // la sonde rend « non mesurée » (null/null : rien n\'est réécrit, rien n\'est accusé).\n'
    + '  const sonde = (pf, fn) => (!plateformes.includes(pf) ? Promise.resolve({ etat: null, http: null })\n'
    + '    : connexionCloudPresente(pf).then((oui) => (oui ? probe(fn) : { etat: null, http: null }), () => ({ etat: null, http: null })));');
  patch('détection de vente : plateformes du Cloud',
    '"&status=eq.published&action=in.(publish,republish)&listing_url=not.is.null" +',
    `"&status=eq.published&action=in.(publish,republish)&listing_url=not.is.null&platform=in.(${PF})" +`);
  patch('URL manquantes : plateformes du Cloud',
    '"&status=eq.published&action=in.(publish,republish)&listing_url=is.null" +',
    `"&status=eq.published&action=in.(publish,republish)&listing_url=is.null&platform=in.(${PF})" +`);
  patch('relevés d\'annonces : Leboncoin, Beebs',
    'const RELEVE_PLATEFORMES = ["leboncoin", "beebs", "ebay", "opla"];',
    'const RELEVE_PLATEFORMES = ["leboncoin", "beebs"]; // Cloud : eBay par l\'API, Opla sorti');
  patch('relevés de ventes : Vinted, Leboncoin',
    'const VENTES_PLATEFORMES = ["vinted", "leboncoin", "opla"];',
    'const VENTES_PLATEFORMES = ["vinted", "leboncoin"]; // Cloud');
  patch('reprise des jobs orphelins : plateformes du Cloud',
    '"cross_post_jobs?select=id,platform,action,title,inventaire_id,created_at,platform_fields&status=eq.processing",',
    `"cross_post_jobs?select=id,platform,action,title,inventaire_id,created_at,platform_fields&status=eq.processing&platform=in.(${PF})",`);
  return { bg, appliques };
}

/** Le manifeste de la copie Cloud (pur : testé). */
export function patcherManifeste(man) {
  const MATCHES = { vinted: ['https://*.vinted.fr/*', 'https://*.vinted.com/*'], leboncoin: ['https://*.leboncoin.fr/*'], beebs: ['https://*.beebs.app/*'], depop: ['https://www.depop.com/*'] };
  const permis = new Set([...PLATEFORMES.flatMap((p) => MATCHES[p]), 'https://fillsell.app/*']);
  const supabase = (man.host_permissions ?? []).filter((h) => /supabase\.co/.test(h));
  if (supabase.length !== 1) throw new Error('manifeste : hôte Supabase introuvable');
  const m = { ...man };
  m.host_permissions = [...permis, ...supabase];
  delete m.optional_host_permissions;
  m.content_scripts = (man.content_scripts ?? []).filter((cs) => (cs.matches ?? []).every((x) => permis.has(x)));
  if (m.content_scripts.length !== 1 + PLATEFORMES_SCRIPTS_MANIFESTE.length) throw new Error(`manifeste : ${m.content_scripts.length} content_scripts gardés (attendu ${1 + PLATEFORMES_SCRIPTS_MANIFESTE.length})`);
  m.web_accessible_resources = (man.web_accessible_resources ?? []).map((w) => ({ ...w, matches: (w.matches ?? []).filter((x) => permis.has(x)) }));
  m.version_name = `${man.version}-cloud`;
  m.key = CLE_PUBLIQUE;
  return m;
}

async function main() {
  const commit = (process.argv.find((a) => a.startsWith('--commit='))?.slice(9)) || 'HEAD';
  const require = createRequire(path.join(RACINE, 'package.json'));
  const JSZip = require('jszip');
  const { transformExtensionFile, isExcludedFromPackage } = await import(pathToFileURL(path.join(RACINE, 'scripts', 'minify-extension.mjs')).href);
  const sha = execFileSync('git', ['-C', RACINE, 'rev-parse', '--short=7', commit]).toString().trim();
  await rm(TRAVAIL, { recursive: true, force: true });
  await mkdir(TRAVAIL, { recursive: true });
  const archive = execFileSync('git', ['-C', RACINE, 'archive', '--format=zip', commit, 'chrome-extension'], { maxBuffer: 256 * 1024 * 1024 });
  const zin = await JSZip.loadAsync(archive);
  for (const [nom, e] of Object.entries(zin.files)) {
    if (e.dir) continue;
    const dest = path.join(TRAVAIL, ...nom.split('/'));
    await mkdir(path.dirname(dest), { recursive: true });
    await writeFile(dest, await e.async('nodebuffer'));
  }
  const SRC = path.join(TRAVAIL, 'chrome-extension');
  const bgChemin = path.join(SRC, 'background.js');
  const { bg, appliques } = patcherBackground(await readFile(bgChemin, 'utf8'));
  await writeFile(bgChemin, bg);
  execFileSync(process.execPath, ['--check', bgChemin], { stdio: 'pipe' });
  const manChemin = path.join(SRC, 'manifest.json');
  const man = patcherManifeste(JSON.parse(await readFile(manChemin, 'utf8')));
  await writeFile(manChemin, JSON.stringify(man, null, 2) + '\n');
  const BUILD_ID = `${new Date().toISOString().replace(/\.\d+Z$/, 'Z')}+${sha}-cloud`;
  await rm(SORTIE, { recursive: true, force: true });
  let nJs = 0, nAutres = 0;
  async function parcourir(dir) {
    for (const e of await readdir(dir, { withFileTypes: true })) {
      const abs = path.join(dir, e.name);
      if (e.isDirectory()) { await parcourir(abs); continue; }
      const rel = path.relative(SRC, abs).split(path.sep).join('/');
      if (isExcludedFromPackage(rel)) continue;
      let contenu = await transformExtensionFile(rel, await readFile(abs));
      if (/\.js$/i.test(rel)) { contenu = Buffer.from(contenu.toString('utf8').split(BUILD_TOKEN).join(BUILD_ID), 'utf8'); nJs++; } else nAutres++;
      const out = path.join(SORTIE, ...rel.split('/'));
      await mkdir(path.dirname(out), { recursive: true });
      await writeFile(out, contenu);
    }
  }
  await parcourir(SRC);
  await rm(TRAVAIL, { recursive: true, force: true });
  console.log('── Extension Cloud ──');
  console.log(`  commit      : ${sha} (${commit})`);
  console.log(`  version     : ${man.version} (${man.version_name})`);
  console.log(`  BUILD_ID    : ${BUILD_ID}`);
  console.log(`  identifiant : ${ID_EXTENSION_CLOUD}`);
  console.log(`  fichiers    : ${nJs} .js · ${nAutres} autres → ${SORTIE}`);
  for (const a of appliques) console.log(`  ✓ ${a}`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(`ÉCHEC : ${e.message}`); process.exit(1); });
}
