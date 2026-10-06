// Autotest (06/10/2026) : l'OTA des notifications de vente arrive aussi sur des
// binaires SANS le module natif @capacitor/push-notifications (tous ceux
// d'avant 2.9.62). Rien ne doit planter, rien ne doit s'afficher, rien ne doit
// être demandé au natif. On simule le pont natif de Capacitor (iOS, Android)
// avec et sans l'en-tête du plugin, chaque cas dans son propre processus —
// @capacitor/core lit l'environnement une seule fois, à son chargement.
//
// Ce qui est vérifié, binaire SANS le module :
//   · pushDisponible() = false, sans exception ;
//   · initialiserPush / activerPush / couperPush / oublierAvantDeconnexion :
//     aucune erreur, AUCUN message au pont natif ;
//   · pas de proposition (doitProposer = false), pas d'interrupteur dans
//     Réglages (etatInterrupteur = null) ;
//   · le module JS du plugin n'est jamais chargé.
// Binaire 2.9.62 (module présent) : pushDisponible() = true.
// Web (aucun pont) : rien non plus.
//
//     npm run selftest:push-plugin-absent
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

if (process.argv[2] === '--cas') {
  const [, , , plateforme, entetes] = process.argv;
  const headers = entetes ? entetes.split(',').filter(Boolean).map((name) => ({ name, methods: [] })) : [];
  globalThis.window = globalThis;
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k),
  };
  const appels = [];
  if (plateforme === 'ios') globalThis.webkit = { messageHandlers: { bridge: { postMessage: (m) => appels.push(m) } } };
  if (plateforme === 'android') globalThis.androidBridge = { postMessage: (m) => appels.push(m) };
  globalThis.Capacitor = { PluginHeaders: headers };
  // Un compte « connecté » avec un jeton déjà gardé : le pire cas pour un
  // appel oublié (déconnexion, coupure).
  store.set('fillsell:push:jeton', 'jeton-garde-' + 'x'.repeat(30));
  store.set('fillsell:push:accepte', '1');
  let erreur = null;
  const r = {};
  try {
    const m = await import(new URL('../src/notifications/pushVentes.js', import.meta.url).href);
    r.disponible = m.pushDisponible();
    if (!r.disponible) {
      r.init = (await m.initialiserPush({ versionApp: 'essai' })).etat;
      r.activer = await m.activerPush();
      r.permission = await m.etatPermission();
      r.proposer = await m.doitProposer({ aSynchroOuVente: true });
      r.interrupteur = await m.etatInterrupteur();
      await m.oublierAvantDeconnexion();
      await m.couperPush().catch((e) => { r.couper = String(e?.message ?? e); });
      m.surOuverturePush(() => {});
    }
  } catch (e) {
    erreur = String(e?.stack ?? e?.message ?? e);
  }
  await new Promise((res) => setTimeout(res, 50));
  console.log(JSON.stringify({ ...r, erreur, appels: appels.length }));
  process.exit(0);
}

let echecs = 0;
const cas = (nom, plateforme, entetes, verifie) => {
  const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url), '--cas', plateforme, entetes], {
    cwd: RACINE, encoding: 'utf8', env: { ...process.env, NODE_OPTIONS: '--import ./scripts/loader-ext.mjs' },
  });
  let res = null;
  try { res = JSON.parse(String(r.stdout).trim().split('\n').pop()); } catch { /* sortie illisible */ }
  const ok = res && res.erreur === null && verifie(res);
  console.log(`${ok ? '  ✓' : '  ✗'} ${nom}${ok ? '' : `   ← ${JSON.stringify(res) || r.stderr.slice(0, 600)}`}`);
  if (!ok) echecs++;
};

const rienDuTout = (r) => r.disponible === false && r.init === 'indisponible' && r.activer === 'indisponible'
  && r.permission === 'indisponible' && r.proposer === false && r.interrupteur === null && r.appels === 0 && !r.couper;

// En-têtes réels d'un binaire 2.9.38 (le dernier publié avant celui-ci).
const ANCIEN = 'App,Browser,Camera,CapacitorUpdater,SplashScreen,Haptics,CapgoInAppReview,NativePurchases';
console.log('Binaire SANS le module (OTA sur un binaire d’avant 2.9.62) :');
cas('iOS : aucune erreur, aucun appel natif, ni proposition ni interrupteur', 'ios', ANCIEN, rienDuTout);
cas('Android : aucune erreur, aucun appel natif, ni proposition ni interrupteur', 'android', ANCIEN, rienDuTout);
console.log('Web (aucun pont natif) :');
cas('navigateur : rien non plus', 'web', '', rienDuTout);
console.log('Binaire 2.9.62 (module présent) :');
cas('iOS : notifications disponibles', 'ios', `${ANCIEN},PushNotifications`, (r) => r.disponible === true);
cas('Android : notifications disponibles', 'android', `${ANCIEN},PushNotifications`, (r) => r.disponible === true);

console.log(echecs ? `\n✗ ${echecs} cas en échec` : '\n✓ tous les cas passent');
process.exit(echecs ? 1 : 0);
