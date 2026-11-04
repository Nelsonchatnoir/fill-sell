// Autotest de la COPIE CLOUD de l'extension (scripts/cloud/build-extension-cloud.mjs)
// et de la capacité « poste_cloud » de get-pending-jobs.
//
//     npm run selftest:cloud-extension
//
// Prouve, sur le chrome-extension/ ACTUEL du dépôt (sans rien écrire) :
//   · chaque patch trouve son ancre UNE fois (sinon la copie Cloud ne se construit pas) ;
//   · le background patché reste du JavaScript valide ;
//   · le manifeste Cloud : Vinted, Leboncoin, Beebs, fillsell.app, Supabase — ni eBay
//     ni Opla ; une clé fixe (identifiant dnankhhfellobiobloopcjgkdioblpjd) ;
//   · chrome-extension/ lui-même n'est PAS touché (le parc reste identique) ;
//   · get-pending-jobs : sans « poste_cloud », rien ne change ; avec, ni eBay ni
//     Opla servis, ni extension_build écrasé.
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { patcherBackground, patcherManifeste, ID_EXTENSION_CLOUD, PLATEFORMES, SOURCE_CONNEXION_CLOUD, SOURCE_VERROU_CLOUD, SOURCE_FERMETURE_CLOUD, FERMETURE_CLOUD_REPOS_MS,
  SOURCE_RYTHME_BEEBS_CLOUD, RYTHME_BEEBS_CLOUD } from './cloud/build-extension-cloud.mjs';

let ko = 0, n = 0;
const ok = (c, m) => { n++; if (c) console.log(`  ✓ ${m}`); else { ko++; console.log(`  ✗ ${m}`); } };
const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bg = readFileSync(path.join(racine, 'chrome-extension', 'background.js'), 'utf8');
const man = JSON.parse(readFileSync(path.join(racine, 'chrome-extension', 'manifest.json'), 'utf8'));

console.log('\n1. Les patchs du background');
const { bg: bg2, appliques } = patcherBackground(bg);
ok(appliques.length === 20, `20 patchs appliqués, chacun sur une ancre UNIQUE (${appliques.length})`);
const tmp = mkdtempSync(path.join(tmpdir(), 'fs-cloud-'));
try {
  writeFileSync(path.join(tmp, 'bg.js'), bg2);
  execFileSync(process.execPath, ['--check', path.join(tmp, 'bg.js')], { stdio: 'pipe' });
  ok(true, 'background patché : JavaScript valide (node --check)');
} catch { ok(false, 'background patché : JavaScript valide (node --check)'); } finally { rmSync(tmp, { recursive: true, force: true }); }
ok(bg2.includes('caps.push("poste_cloud");'), 'le poste se déclare « poste_cloud »');
ok(bg2.includes('rep.connexion_commands = [];'), 'les demandes « Me connecter » de l\'extension sont ignorées (l\'écran Cloud s\'en charge)');
ok(bg2.includes('const RELEVE_PLATEFORMES = ["leboncoin", "beebs"];') && bg2.includes('const VENTES_PLATEFORMES = ["vinted", "leboncoin"];'), 'relevés : ni eBay ni Opla');
ok((bg2.match(/&platform=in\.\(vinted,leboncoin,beebs,depop\)/g) ?? []).length === 3, 'détection de vente, URL manquantes, reprise des orphelins : bornées aux plateformes du Cloud');
ok(!/FILLSELL_CLOUD/.test(bg), 'chrome-extension/background.js du dépôt : INTACT (aucune trace du Cloud)');

// (30/10, règle de Nico) Aucune visite automatique d'une plateforme non connectée : la sonde passe d'abord par
// connexionCloudPresente (cookies seulement) ; exécutée ici sur des cookies fabriqués.
ok(bg2.includes('connexionCloudPresente(pf).then((oui) => (oui ? probe(fn) : { etat: null, http: null })'),
  'sonde de session : la requête ne part que si le cookie de connexion est là (sinon « non mesurée », aucune requête)');
ok(!bg.includes('connexionCloudPresente'), 'la sonde de l’extension du parc (bureau) : INCHANGÉE');
{
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const jwt = (o) => `e30.${b64(o)}.sig`;
  const verifier = async (pf, cookies) => {
    const chrome = { cookies: { getAll: async ({ domain }) => cookies.filter((c) => c.domain === domain) } };
    const f = new Function('chrome', 'atob', `${SOURCE_CONNEXION_CLOUD}; return connexionCloudPresente;`)(chrome, (s) => Buffer.from(s, 'base64').toString('binary'));
    return f(pf);
  };
  ok(await verifier('leboncoin', []) === false, 'profil neuf, Leboncoin : non connectée → aucune visite');
  ok(await verifier('leboncoin', [{ domain: 'leboncoin.fr', name: 'datadome', value: 'x' }]) === false, 'Leboncoin avec le seul cookie DataDome (page déjà vue) : toujours non connectée');
  ok(await verifier('leboncoin', [{ domain: 'leboncoin.fr', name: '__Secure-Login', value: 'abc' }]) === true, 'Leboncoin avec __Secure-Login : connectée → la sonde part');
  ok(await verifier('beebs', [{ domain: 'beebs.app', name: 'access_token', value: jwt({ sub: 'g', role: 'guest' }) }]) === false, 'Beebs, jeton d’invité : non connectée');
  ok(await verifier('beebs', [{ domain: 'beebs.app', name: 'access_token', value: jwt({ sub: '42', role: 'user' }) }]) === true, 'Beebs, jeton d’utilisateur : connectée');
  ok(await verifier('beebs', [{ domain: 'beebs.app', name: 'access_token', value: jwt({ sub: 'u1', user_id: 'u1', provider_id: 'anonymous', firebase: { identities: {}, sign_in_provider: 'anonymous' } }) }]) === false,
    'Beebs, jeton Firebase ANONYME de tout visiteur (essai du 30/10) : non connectée → aucune visite');
  ok(await verifier('beebs', [{ domain: 'beebs.app', name: 'access_token', value: jwt({ sub: 'u1', firebase: { sign_in_provider: 'google.com' } }) }]) === true, 'Beebs, connecté par Google : connectée');
  ok(await verifier('vinted', [{ domain: 'vinted.fr', name: 'access_token_web', value: jwt({ sub: 7 }) }]) === false, 'Vinted sans refresh_token_web : non connectée');
  ok(await verifier('vinted', [{ domain: 'vinted.fr', name: 'access_token_web', value: jwt({ sub: 7 }) }, { domain: 'vinted.fr', name: 'refresh_token_web', value: 'r' }]) === true, 'Vinted jeton + refresh : connectée');
  ok(await verifier('depop', [{ domain: 'depop.com', name: 'access_token', value: 't' }]) === true && await verifier('depop', []) === false, 'Depop : access_token présent / absent');
  ok(await verifier('ebay', []) === false, 'plateforme hors Cloud : jamais « connectée »');
  // (02/11, 00:00) Chromium 156 : getAll ne rend pas un cookie posé SANS « Secure » depuis https (les jetons de Beebs) ;
  // get({ url, name }) le rend. Beebs connectée n'était jamais vue : 14 visites refusées, sa republication jamais commencée.
  const verifierCache = async (pf, visibles, parAdresse) => {
    const chrome = { cookies: {
      getAll: async ({ domain }) => visibles.filter((c) => c.domain === domain),
      get: async ({ url, name }) => parAdresse.find((c) => url.includes(c.domain) && c.name === name) ?? null,
    } };
    const f = new Function('chrome', 'atob', `${SOURCE_CONNEXION_CLOUD}; return connexionCloudPresente;`)(chrome, (s) => Buffer.from(s, 'base64').toString('binary'));
    return f(pf);
  };
  const jetonBeebs = { domain: 'www.beebs.app', name: 'access_token', value: jwt({ sub: 'u1', firebase: { sign_in_provider: 'google.com' } }) };
  ok(await verifierCache('beebs', [{ domain: 'beebs.app', name: 'axeptio_cookies', value: 'x' }], [jetonBeebs]) === true,
    'Beebs : le jeton invisible à getAll (sans « Secure ») est lu par son adresse → connectée');
  ok(await verifierCache('beebs', [], []) === false, 'Beebs sans jeton nulle part : non connectée');
  ok(await verifierCache('leboncoin', [], [{ domain: 'auth.leboncoin.fr', name: '__Secure-Login', value: 'a' }]) === true, 'Leboncoin : __Secure-Login de auth.leboncoin.fr lu par son adresse');
}

// (01/11) LE VERROU DES PLATEFORMES dans la copie Cloud : fetch, onglets et fenêtres ouverts par l'extension
// refusent une plateforme non connectée dans CE navigateur ; exécuté ici avec un faux chrome et un faux fetch.
ok(bg2.includes('globalThis.fetch = async function fetch(entree, options)') && bg2.indexOf('const verrouCloud = ') < bg2.indexOf('async function reportPlatformSessions'),
  'verrou posé en tête du service worker, avant toute fonction qui joint une plateforme');
ok(!bg.includes('verrouCloud'), 'l’extension du parc (bureau) : aucun verrou, INCHANGÉE');
{
  const parti = [];
  const ouverts = [];
  const cookies = [{ domain: 'leboncoin.fr', name: '__Secure-Login', value: 'abc' }];
  const chrome = {
    cookies: { getAll: async ({ domain }) => cookies.filter((c) => c.domain === domain) },
    tabs: { create: async (p) => { ouverts.push(p.url); return { id: 1 }; }, update: async (id, p) => { ouverts.push(p?.url); return { id }; } },
    windows: { create: async (p) => { ouverts.push(p?.url); return { id: 2 }; } },
  };
  const globalFaux = { fetch: async (u) => { parti.push(String(u)); return { ok: true, status: 200 }; } };
  const v = new Function('chrome', 'atob', 'globalThis', `${SOURCE_CONNEXION_CLOUD}\n${SOURCE_VERROU_CLOUD}\nreturn globalThis.__fillsellVerrouCloud;`)(
    chrome, (s) => Buffer.from(s, 'base64').toString('binary'), globalFaux);
  const essayer = (p) => p.then(() => 'passe', (e) => `refuse:${e.message}`);
  ok(await essayer(globalFaux.fetch('https://www.beebs.app/fr/api/x')) === "refuse:FillSell Cloud : beebs n'est pas connecté dans ce navigateur, aucune visite" && !parti.length,
    'fetch vers Beebs non connecté : refusé AVANT le réseau (rien n’est parti)');
  ok(await essayer(globalFaux.fetch('https://www.leboncoin.fr/ad/1')) === 'passe' && parti.at(-1) === 'https://www.leboncoin.fr/ad/1', 'fetch vers Leboncoin connecté : passe tel quel');
  ok(await essayer(globalFaux.fetch('https://tojihnuawsoohlolangc.supabase.co/rest/v1/x')) === 'passe', 'fetch vers FillSell (Supabase) : jamais touché');
  ok(await essayer(globalFaux.fetch({ url: 'https://images1.vinted.net/t/1.jpg' })) !== 'passe', 'une requête (objet) vers un domaine de Vinted non connecté : refusée');
  ok(await essayer(chrome.tabs.create({ url: 'https://www.depop.com/products/x' })) !== 'passe' && !ouverts.length, 'onglet ouvert vers Depop non connecté : refusé, aucun onglet');
  ok(await essayer(chrome.tabs.update(5, { url: 'https://www.vinted.fr/items/1' })) !== 'passe' && !ouverts.length, 'onglet redirigé vers Vinted non connecté : refusé');
  ok(await essayer(chrome.tabs.create({ url: 'https://www.leboncoin.fr/compte' })) === 'passe' && ouverts.at(-1) === 'https://www.leboncoin.fr/compte', 'onglet vers Leboncoin connecté : ouvert');
  ok(await essayer(chrome.windows.create({ url: ['https://fillsell.app/', 'https://www.beebs.app/fr'] })) !== 'passe', 'fenêtre dont une adresse vise Beebs non connecté : refusée');
  const e = v.etat();
  ok(e.fetch === true && e.onglets === true && e.bloquees === 5 && e.derniere?.plateforme === 'beebs', `état du verrou lisible (${JSON.stringify({ bloquees: e.bloquees, onglets: e.onglets })})`);
  ok(await v.refuse('https://www.leboncoin.fr/') === null && await v.refuse('https://www.vinted.fr/') === 'vinted' && await v.refuse('https://example.com/') === null, 'décision lisible sans requête (outil de vérification)');
}

// (02/11 soir, décision de Nico) Les onglets de travail sans tâche sont FERMÉS en fin de cycle — exécuté ici contre
// un faux Chrome (la fonction exacte de la copie Cloud).
console.log('\n1 bis. Onglets de travail sans tâche fermés (copie Cloud)');
ok(bg2.includes('return noterUsageOngletCloud(await getOrCreateWorkTabCloudBrut(platform, url));')
  && bg2.includes('return noterUsageOngletCloud(await workTabForFetchCloudBrut(platform));'), 'usage noté à chaque onglet rendu (getOrCreateWorkTab, workTabForFetch)');
ok(bg2.includes('if (tab.discarded) { // Cloud (02/11)') && !bg2.includes('(platform === "vinted" || platform === "opla" || platform === "depop") && tab.discarded'),
  'un onglet déchargé est réveillé avant toute lecture, toutes plateformes (jamais lu mort, jamais le fetch du service worker)');
{
  const iCleanup = bg2.indexOf('await cleanupOrphanWorkTabs().catch((e) =>');
  const iFerme = bg2.indexOf('await fermerOngletsTravailInactifsCloud()');
  const iFinCycle = bg2.indexOf('async function pollAndProcessJobsUnlocked(');
  ok(iFinCycle > 0 && iFerme > iFinCycle && iCleanup > iFerme && iCleanup - iFerme < 200,
    'fermeture en fin de cycle du poll, avec le ménage des orphelins (sous le verrou)');
}
ok(!bg.includes('fermerOngletsTravailInactifsCloud'), 'l’extension du parc : aucune fermeture d’onglet sans tâche (inchangée sur ce point)');
ok(!SOURCE_FERMETURE_CLOUD.includes('chrome.tabs.discard'), 'jamais chrome.tabs.discard : dans le navigateur Cloud la page déchargée se recharge aussitôt (mesuré 02/11 21:36:47)');
{
  // fermerOngletTravail est celle de background.js (extraite telle quelle) : beforeunload neutralisé, clé oubliée.
  const extraire = (nom) => {
    const d = bg.indexOf(`async function ${nom}(`);
    let i = bg.indexOf('{', bg.indexOf(')', d)); let prof = 0;
    for (; i < bg.length; i++) { if (bg[i] === '{') prof++; else if (bg[i] === '}') { prof--; if (prof === 0) break; } }
    return bg.slice(d, i + 1);
  };
  const SOURCE_FERMER_ONGLET = extraire('fermerOngletTravail');
  const faire = ({ onglets, usage = {}, attente = null, bloque = [] }) => {
    const session = { ...Object.fromEntries(onglets.map((o) => [`fillsell_work_tab_${o.pf}`, o.id])), fillsell_cloud_usage_onglets: usage };
    const etat = new Map(onglets.map((o) => [o.id, { id: o.id, windowId: 7, index: 2, active: Boolean(o.active) }]));
    const j = { fermes: [], neutralises: [] };
    const chrome = {
      storage: { session: {
        get: async (k) => Object.fromEntries([].concat(k).filter((x) => x in session).map((x) => [x, structuredClone(session[x])])),
        set: async (v) => { Object.assign(session, structuredClone(v)); },
        remove: async (k) => { for (const x of [].concat(k)) delete session[x]; },
      } },
      tabs: {
        get: async (id) => { if (!etat.has(id)) throw new Error('No tab'); return { ...etat.get(id) }; },
        remove: async (id) => { if (bloque.includes(id)) throw new Error('beforeunload'); etat.delete(id); j.fermes.push(id); },
        discard: async () => { throw new Error('discard interdit'); },
      },
    };
    const f = new Function('chrome', 'workTabKey', 'lireAttentePaiementLbc', 'neutralizeBeforeUnload', 'console',
      `${SOURCE_FERMER_ONGLET}\n${SOURCE_FERMETURE_CLOUD}\nreturn { fermerOngletsTravailInactifsCloud, noterUsageOngletCloud };`)(
      chrome, (p) => `fillsell_work_tab_${p}`, async () => attente, async (id) => { j.neutralises.push(id); return true; }, { log: () => {}, warn: () => {} });
    return { f, j, session, etat };
  };
  const T = 1_000_000_000_000;
  const vieux = T - FERMETURE_CLOUD_REPOS_MS - 1;
  {
    const { f, j, session } = faire({ onglets: [{ pf: 'leboncoin', id: 20 }, { pf: 'depop', id: 30 }, { pf: 'beebs', id: 40 }, { pf: 'vinted', id: 10 }], usage: { 20: vieux, 30: T - 60_000, 10: vieux } });
    const faits = await f.fermerOngletsTravailInactifsCloud(T);
    ok(JSON.stringify(faits) === '["leboncoin"]' && JSON.stringify(j.fermes) === '[20]' && JSON.stringify(j.neutralises) === '[20]' && !('fillsell_work_tab_leboncoin' in session),
      `sans tâche depuis ${FERMETURE_CLOUD_REPOS_MS / 60000} min : fermé (beforeunload neutralisé, clé oubliée) ; utilisé il y a 1 min : gardé ; jamais vu : gardé ; Vinted : jamais (${JSON.stringify(faits)})`);
  }
  {
    const { f, j, session } = faire({ onglets: [{ pf: 'beebs', id: 40 }] });
    await f.fermerOngletsTravailInactifsCloud(T);
    ok(!j.fermes.length && session.fillsell_cloud_usage_onglets[40] === T, 'onglet jamais vu : noté au premier passage, fermé seulement 5 min plus tard');
    await f.fermerOngletsTravailInactifsCloud(T + FERMETURE_CLOUD_REPOS_MS + 1);
    ok(JSON.stringify(j.fermes) === '[40]', '… puis fermé au passage suivant si personne ne s’en est servi');
  }
  {
    const { f, j } = faire({ onglets: [{ pf: 'leboncoin', id: 20 }], usage: { 20: vieux }, attente: { tabId: 20, jobId: 'x' } });
    await f.fermerOngletsTravailInactifsCloud(T);
    ok(!j.fermes.length, 'l’onglet rendu à la personne (Leboncoin « Valider et payer ») : jamais touché');
  }
  {
    const { f, j } = faire({ onglets: [{ pf: 'depop', id: 30, active: true }], usage: { 30: vieux } });
    await f.fermerOngletsTravailInactifsCloud(T);
    ok(JSON.stringify(j.fermes) === '[30]', 'onglet montré dans la fenêtre de travail : fermé aussi (personne ne regarde un écran Cloud)');
  }
  {
    const { f, j, session } = faire({ onglets: [{ pf: 'beebs', id: 40 }], usage: { 40: vieux }, bloque: [40] });
    const faits = await f.fermerOngletsTravailInactifsCloud(T);
    ok(!faits.length && !j.fermes.length && Number.isFinite(session.fillsell_cloud_usage_onglets[40]), 'fermeture refusée (dialogue) : rien de compté, retentée au cycle suivant');
  }
  {
    const { f, session } = faire({ onglets: [{ pf: 'leboncoin', id: 20 }] });
    await f.noterUsageOngletCloud(20);
    const avant = session.fillsell_cloud_usage_onglets[20];
    ok(Number.isFinite(avant) && (await f.noterUsageOngletCloud(20)) === 20, 'l’usage est noté et l’id rendu tel quel (aucun effet sur l’appelant)');
  }
}

// (04/11, mesure Beebs) Le rythme des lectures de FOND de Beebs : exécuté ici avec un faux `chrome` et un faux minuteur.
console.log('\n1 ter. Le rythme des lectures de fond Beebs (04/11)');
{
  const appels = [], attentes = [];
  const chrome = { tabs: { update: async (...a) => { appels.push(a); return a; }, create: async (a) => { appels.push([a]); return a; } } };
  const fauxSetTimeout = (f, ms) => { attentes.push(ms); f(); };
  let releve = async () => {};
  const R = new Function('chrome', 'intervalleSonde', 'releverQuotidien', 'plateformeVerrouCloud', 'setTimeout',
    `${SOURCE_RYTHME_BEEBS_CLOUD}\nreturn { prochainMessagerieBeebsCloud, intervalleSondeCloud, fichesBeebsParTourCloud, releverQuotidienCloud, releveFondCloud };`)(
    chrome, (pf) => (pf === 'vinted' ? 600_000 : 3_600_000), (...a) => releve(...a),
    (u) => (/beebs\.app/.test(String(u)) ? 'beebs' : /vinted/.test(String(u)) ? 'vinted' : null), fauxSetTimeout);
  const MIN = 60_000;
  // Messagerie : exécutée au premier tour de poll (2 min) qui suit l'échéance tirée.
  const surGrille = (d) => Math.ceil(d / (2 * MIN)) * 2;
  const tirages = Array.from({ length: 20_000 }, (_, i) => surGrille(R.prochainMessagerieBeebsCloud((i + 0.5) / 20_000)));
  const moyenne = tirages.reduce((s, x) => s + x, 0) / tirages.length;
  ok(R.prochainMessagerieBeebsCloud(0) === 7 * MIN && R.prochainMessagerieBeebsCloud(1) === 15 * MIN, 'messagerie Beebs : échéance tirée entre 7 et 15 min');
  ok(Math.min(...tirages) === 8 && Math.max(...tirages) === 16 && Math.abs(moyenne - 12) < 0.05,
    `sur la grille du poll : 8 à 16 min, moyenne ${moyenne.toFixed(2)} min — la moyenne d'avant (12 min pile) est gardée`);
  ok(new Set(tirages).size === 5, 'cinq écarts possibles (8, 10, 12, 14, 16 min) : plus jamais le même');
  const sondes = Array.from({ length: 5000 }, (_, i) => R.intervalleSondeCloud('beebs', 1_762_000_000_000 + i * 7919) / MIN);
  const ms = sondes.reduce((s, x) => s + x, 0) / sondes.length;
  ok(Math.min(...sondes) >= 45 && Math.max(...sondes) <= 75 && Math.abs(ms - 60) < 1.5, `sonde Beebs : 45 à 75 min, moyenne ${ms.toFixed(1)} min (avant : 60 pile)`);
  ok(R.intervalleSondeCloud('beebs', 123456) === R.intervalleSondeCloud('beebs', 123456), 'sonde Beebs : le même écart d’un tour à l’autre (tiré de la sonde précédente)');
  ok(R.intervalleSondeCloud('vinted', 5) === 600_000 && R.intervalleSondeCloud('leboncoin', 5) === 3_600_000, 'les sondes Vinted, Leboncoin, Depop : INCHANGÉES');
  const b = (id) => ({ id, platform: 'beebs' }), v = (id) => ({ id, platform: 'vinted' });
  const dues = [b('p'), ...Array.from({ length: 8 }, (_, i) => b(`b${i}`)), v('v1'), v('v2')];
  const gardees = dues.filter(R.fichesBeebsParTourCloud(new Set(['p'])));
  ok(gardees.filter((j) => j.platform === 'beebs' && j.id !== 'p').length === 4 && gardees.some((j) => j.id === 'p') && gardees.filter((j) => j.platform === 'vinted').length === 2,
    'détection : 8 fiches Beebs dues → 4 ce tour (une par tranche de deux), la relecture prioritaire (commande neuve) et Vinted intactes');
  ok([b('x')].filter(R.fichesBeebsParTourCloud(new Set())).length === 1, 'détection : une seule fiche due → lue tout de suite (régime établi : aucun changement)');
  releve = async () => {
    await chrome.tabs.update(1, { url: 'https://www.beebs.app/fr/account/my-adverts#fillsell-worker' });
    await chrome.tabs.update(1, { url: 'https://www.beebs.app/fr/p/1#fillsell-worker' });
    await chrome.tabs.update(2, { url: 'https://www.vinted.fr/' });
  };
  await chrome.tabs.update(1, { url: 'https://www.beebs.app/' });
  ok(attentes.length === 0, 'hors du relevé quotidien de fond (une tâche, un relevé lancé par la personne) : aucune attente');
  await R.releverQuotidienCloud();
  ok(attentes.length === 1 && attentes[0] >= 6000 - 50 && attentes[0] <= 15_000 && appels.length === 4,
    `relevé quotidien : 6 à 15 s entre deux pages Beebs (${attentes[0]} ms), aucune pour Vinted, toutes les navigations passent`);
  ok(R.releveFondCloud.actif === false, 'le relevé fini : le rythme ne s’applique plus');
  ok(!bg.includes('prochainMessagerieBeebsCloud') && bg2.includes('prochainMessagerieBeebsCloud()') && bg2.includes('releverQuotidienCloud)'),
    'branché dans la copie Cloud seulement (le parc : INCHANGÉ)');
  ok(RYTHME_BEEBS_CLOUD.messagerieMaxMs === 15 * MIN, 'réglage exporté (tests et rapport)');
}

console.log('\n2. Le manifeste Cloud');
const m2 = patcherManifeste(man);
const hotes = m2.host_permissions.join(' ');
ok(!/ebay|opla/.test(hotes), 'ni eBay ni Opla dans les permissions d\'hôte');
ok(PLATEFORMES.every((p) => hotes.includes(p === 'beebs' ? 'beebs.app' : p === 'depop' ? 'www.depop.com' : `${p}.fr`)) && hotes.includes('fillsell.app') && /supabase\.co/.test(hotes), 'Vinted, Leboncoin, Beebs, Depop (30/10), fillsell.app, Supabase');
ok(!('optional_host_permissions' in m2), 'aucune permission optionnelle (Opla) : le poste dit « sans_opla »');
ok(m2.content_scripts.length === 4 && !JSON.stringify(m2.content_scripts).includes('ebay'), 'content scripts : fillsell.app + les 3 plateformes');
const der = Buffer.from(m2.key, 'base64');
const id = [...createHash('sha256').update(der).digest('hex').slice(0, 32)].map((c) => String.fromCharCode(97 + parseInt(c, 16))).join('');
ok(id === ID_EXTENSION_CLOUD, `identifiant fixe : ${id}`);
ok(m2.version === man.version && m2.version_name === `${man.version}-cloud`, `même version que le parc (${man.version}), nom « -cloud »`);
ok(!('key' in man), 'le manifeste du parc n\'a pas de clé (identifiant du Chrome Web Store intact)');

console.log('\n3. get-pending-jobs — la capacité « poste_cloud »');
const gpj = readFileSync(path.join(racine, 'supabase', 'functions', 'get-pending-jobs', 'index.ts'), 'utf8');
ok(/const posteCloud = capacites\.includes\("poste_cloud"\);/.test(gpj), 'lue dans les capacités déclarées (absente pour tout le parc)');
ok(/if \(build && !posteCloud\) patch\.extension_build = build;/.test(gpj), 'un poste Cloud n\'écrase pas profiles.extension_build');
ok(/if \(majAttente !== null && !posteCloud\)/.test(gpj), 'ni la mise à jour en attente de l\'ordinateur');
const iFiltre = gpj.indexOf('if (posteCloud && out.some(');
const iReserve = gpj.indexOf('admin.rpc("reserver_jobs_extension"');
ok(iFiltre > 0 && iFiltre < iReserve, 'le filtre des plateformes passe AVANT la réservation (jamais réservé ce qu\'il ne fera pas)');
ok(/const PLATEFORMES_POSTE_CLOUD = \["vinted", "leboncoin", "beebs", "depop"\];/.test(gpj), 'Vinted, Leboncoin, Beebs, Depop — même liste que la copie Cloud');


console.log('\n4. (04/11 soir, règle de Nico) Leboncoin : les lectures de fond faites comme la page (PC ET Cloud)');
{
  const L = await import('./leboncoin-comme-la-page.mjs');
  const vm = await import('node:vm');
  const b64 = (t) => Buffer.from(t, 'binary').toString('base64');
  // Les en-têtes : ceux du client de la page (module « S » des chunks Leboncoin), calculés depuis les mêmes cookies.
  const enTetes = (cookie) => JSON.parse(JSON.stringify(vm.runInNewContext(`(() => { const tok = "T"; ${L.SOURCE_H_PAGE} return H; })()`, { document: { cookie }, btoa: b64 })));
  const H = enTetes('pa_privacy=1; cnfdVisitorId=v-1; rollout_user_id=u-2; autre=x');
  const attendu = Buffer.from(JSON.stringify({ version: 1, rollout_visitor_id: 'v-1', rollout_user_id: 'u-2' })).toString('base64');
  ok(JSON.stringify(Object.keys(H)) === JSON.stringify(['Authorization', 'x-lbc-experiment', 'Content-Type']), 'en-têtes de la page, dans son ordre (Authorization, x-lbc-experiment, Content-Type)');
  ok(H.Authorization === 'Bearer T' && H['x-lbc-experiment'] === attendu && H['Content-Type'] === 'application/json', 'x-lbc-experiment = base64({version, rollout_visitor_id ← cnfdVisitorId, rollout_user_id}) comme la page');
  ok(enTetes('')['x-lbc-experiment'] === Buffer.from('{"version":1}').toString('base64'), 'sans cookie d\'expérience : {version:1} seul, comme la page (aucune valeur inventée)');
  const typeDe = (valeur) => vm.runInNewContext(`(() => { let type = null; ${L.SOURCE_TYPE_PAGE} return type; })()`, { sessionStorage: { getItem: (k) => (k === L.CLE_CACHE_COMPTE ? valeur : null) } });
  ok(typeDe(JSON.stringify({ account: { type: 'individual' } })) === 'individual' && typeDe(null) === null && typeDe('{pas du json') === null,
    'le type du compte : lu dans le cache de session de la page ; absent ou illisible → rien (jamais redemandé)');
  // Les sources : transformées une fois (PC), transformées au build (Cloud, d426d23), plus aucun appel de compte direct.
  const lire = (rel) => readFileSync(path.join(racine, 'chrome-extension', ...rel.split('/')), 'utf8').replace(/\r\n/g, '\n');
  const pc = { bg: lire('background.js'), msg: lire('messagerie.js'), cs: lire('content-scripts/leboncoin.js') };
  ok(pc.bg.includes(L.MARQUE) && pc.msg.includes(L.MARQUE) && pc.cs.includes(L.MARQUE), 'PC : background, messagerie, content script portent la règle');
  ok(!/members\/me\/account",\s*\{ headers/.test(pc.bg) && !/members\/me\/account",\s*\{ headers/.test(pc.cs), 'PC : plus aucun appel de compte fait par l\'extension');
  const lecteurs = pc.msg.slice(pc.msg.indexOf('async function lecteurListeLeboncoin'), pc.msg.indexOf('async function lecteurCommandesLeboncoin') + 1600);
  ok(lecteurs.length > 2000 && !/accept: "application\/json" \}/.test(lecteurs), 'PC : les lecteurs de fond Leboncoin de la messagerie n\'envoient plus les en-têtes faits main');
  ok(L.patcherBackgroundLeboncoin(pc.bg).deja && L.patcherMessagerieLeboncoin(pc.msg).deja && L.patcherContentLeboncoin(pc.cs).deja, 'déjà transformées : la copie Cloud d\'un commit récent ne les retransforme pas');
  const ancien = (rel) => execFileSync('git', ['-C', racine, 'show', `d426d23:chrome-extension/${rel}`], { maxBuffer: 64 * 1024 * 1024 }).toString('utf8');
  const nb = L.patcherBackgroundLeboncoin(ancien('background.js')).appliques.length + L.patcherMessagerieLeboncoin(ancien('messagerie.js')).appliques.length
    + L.patcherContentLeboncoin(ancien('content-scripts/leboncoin.js')).appliques.length;
  ok(nb === 15, `Cloud (d426d23, la copie déployée) : les 15 transformations s'appliquent (${nb})`);
}
console.log(`\n${ko === 0 ? 'Tout est vert' : `${ko} ÉCHEC(S)`} — ${n} contrôles.`);
process.exit(ko === 0 ? 0 : 1);
