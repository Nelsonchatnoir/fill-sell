// Autotest (06/11/2026) : le module natif des notifications ne passe JAMAIS nu à travers une promesse.
//
// Un plugin Capacitor (registerPlugin, @capacitor/core) est un Proxy qui répond à TOUTE propriété — `then` compris.
// Rendu par un `.then(...)` ou une fonction `async`, il est pris pour une promesse : le moteur appelle
// `plugin.then(resolve, reject)`, l'appel part vers le natif (« then() is not implemented »), et ni resolve ni reject
// n'est jamais appelé. Avant ce correctif, pushVentes.plugin() faisait exactement cela : sur un vrai téléphone,
// `await plugin()` ne rendait jamais la main — aucune permission lue, aucun jeton, aucun canal.
//
// Ce qui est vérifié, avec le VRAI @capacitor/core et un pont natif Android simulé (en-têtes du plugin
// PushNotifications, réponses du natif), chaque cas dans son propre processus :
//   · le témoin : l'ancien geste (`import(...).then((m) => m.PushNotifications)`) reste bloqué ;
//   · etatPermission() rend la réponse du natif ('granted') ;
//   · nommerCanalVentes('en') crée le canal « Sales », id « ventes », importance 4 ; en français, « Ventes » ;
//   · aucun appel « then » n'arrive jamais au natif.
//
//     npm run selftest:push-plugin-proxy
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DELAI = 1500;
const bloque = (p) => Promise.race([p.then((v) => ({ fini: true, v })), new Promise((r) => setTimeout(() => r({ fini: false }), DELAI))]);

if (process.argv[2] === '--cas') {
  const cas = process.argv[3];
  globalThis.window = globalThis;
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k),
  };
  const appels = [];
  globalThis.androidBridge = { postMessage: () => {} };
  const methodes = ['checkPermissions', 'requestPermissions', 'register', 'unregister', 'createChannel', 'removeAllListeners']
    .map((name) => ({ name, rtype: 'promise' }));
  methodes.push({ name: 'addListener', rtype: 'callback' });
  globalThis.Capacitor = {
    PluginHeaders: [{ name: 'PushNotifications', methods: methodes }],
    nativePromise: (plugin, methode, options) => {
      appels.push({ plugin, methode, options });
      if (methode === 'checkPermissions') return Promise.resolve({ receive: 'granted' });
      return Promise.resolve({});
    },
    nativeCallback: (plugin, methode, options) => { appels.push({ plugin, methode, options }); return 'cb-1'; },
  };
  const r = { cas };
  // Sur un téléphone, ce rejet orphelin finit dans la console ; ici on le garde pour le contrôle.
  process.on('unhandledRejection', (e) => { r.rejetOrphelin = String(e?.message ?? e); });
  try {
    if (cas === 'temoin') {
      const p = import('@capacitor/push-notifications').then((m) => m.PushNotifications);
      r.fini = (await bloque(p)).fini;
    } else {
      const m = await import(new URL('../src/notifications/pushVentes.js', import.meta.url).href);
      r.disponible = m.pushDisponible();
      const e = await bloque(m.etatPermission());
      r.permission = e.fini ? e.v : 'BLOQUÉ';
      const c = await bloque(m.nommerCanalVentes(cas === 'en' ? 'en' : 'fr'));
      r.canal = c.fini ? c.v : 'BLOQUÉ';
    }
  } catch (e) {
    r.erreur = String(e?.stack ?? e?.message ?? e);
  }
  r.appels = appels.map((a) => a.methode);
  r.canalCree = appels.find((a) => a.methode === 'createChannel')?.options ?? null;
  console.log(JSON.stringify(r));
  process.exit(0);
}

let echecs = 0;
const lancer = (cas) => {
  const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url), '--cas', cas], {
    cwd: RACINE, encoding: 'utf8', env: { ...process.env, NODE_OPTIONS: '--import ./scripts/loader-ext.mjs' },
  });
  try { return JSON.parse(String(r.stdout).trim().split('\n').pop()); } catch { return { illisible: r.stdout + r.stderr }; }
};
const ok = (cond, nom, detail) => { console.log(`${cond ? '  ✓' : '  ✗'} ${nom}${cond ? '' : `   ← ${JSON.stringify(detail).slice(0, 600)}`}`); if (!cond) echecs++; };

const temoin = lancer('temoin');
ok(temoin.fini === false && !temoin.erreur, 'témoin : le plugin rendu nu par un .then reste bloqué (le défaut corrigé est réel)', temoin);
ok(/PushNotifications\.then\(\)" is not implemented/.test(temoin.rejetOrphelin ?? ''), 'témoin : la cause — « PushNotifications.then() is not implemented », rejet orphelin', temoin);

for (const lang of ['fr', 'en']) {
  const r = lancer(lang);
  ok(!r.erreur && r.disponible === true, `${lang} : module natif vu (pushDisponible)`, r);
  ok(r.permission === 'granted', `${lang} : etatPermission() rend la réponse du natif, sans blocage`, r);
  ok(r.canal === true, `${lang} : nommerCanalVentes() rend la main (vrai)`, r);
  const attendu = lang === 'en'
    ? { id: 'ventes', name: 'Sales', description: 'A notification for each sale', importance: 4, visibility: 1, sound: 'default', vibration: true }
    : { id: 'ventes', name: 'Ventes', description: 'Une notification à chaque vente', importance: 4, visibility: 1, sound: 'default', vibration: true };
  ok(JSON.stringify(r.canalCree) === JSON.stringify(attendu), `${lang} : le canal créé (id « ventes », importance 4, nom « ${attendu.name} »)`, r.canalCree);
  ok(!r.appels.includes('then'), `${lang} : aucun appel « then » vers le natif`, r.appels);
}

console.log(`\n${echecs === 0 ? '✓ push-plugin-proxy : tout est vert' : `✗ push-plugin-proxy : ${echecs} échec(s)`}`);
process.exit(echecs === 0 ? 0 : 1);
