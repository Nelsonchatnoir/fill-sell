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
import { patcherBackground, patcherManifeste, ID_EXTENSION_CLOUD, PLATEFORMES, SOURCE_CONNEXION_CLOUD, SOURCE_VERROU_CLOUD } from './cloud/build-extension-cloud.mjs';

let ko = 0, n = 0;
const ok = (c, m) => { n++; if (c) console.log(`  ✓ ${m}`); else { ko++; console.log(`  ✗ ${m}`); } };
const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bg = readFileSync(path.join(racine, 'chrome-extension', 'background.js'), 'utf8');
const man = JSON.parse(readFileSync(path.join(racine, 'chrome-extension', 'manifest.json'), 'utf8'));

console.log('\n1. Les patchs du background');
const { bg: bg2, appliques } = patcherBackground(bg);
ok(appliques.length === 12, `12 patchs appliqués, chacun sur une ancre UNIQUE (${appliques.length})`);
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

console.log(`\n${ko === 0 ? 'Tout est vert' : `${ko} ÉCHEC(S)`} — ${n} contrôles.`);
process.exit(ko === 0 ? 0 : 1);
