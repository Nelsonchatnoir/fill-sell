// Autotest (02/10/2026) : l'OTA arrive sur des binaires SANS le plugin natif
// @capgo/capacitor-in-app-review (ni @capacitor/haptics). Rien ne doit planter,
// rien ne doit être appelé. On simule le pont natif de Capacitor (iOS, puis
// Android) avec et sans l'en-tête du plugin, dans des processus séparés —
// @capacitor/core lit l'environnement une seule fois, à son chargement.
//
//     npm run selftest:avis-plugin-absent
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

if (process.argv[2] === '--cas') {
  // ── Un cas, dans son propre processus ────────────────────────────────────
  const [, , , plateforme, entetes] = process.argv;
  const headers = entetes ? entetes.split(',').filter(Boolean).map((name) => ({ name, methods: [] })) : [];
  globalThis.window = globalThis;
  if (plateforme === 'ios') globalThis.webkit = { messageHandlers: { bridge: { postMessage() {} } } };
  if (plateforme === 'android') globalThis.androidBridge = { postMessage() {} };
  globalThis.Capacitor = { PluginHeaders: headers };
  const appels = [];
  // Si quelque chose tentait de parler au natif, on le verrait ici.
  globalThis.webkit && (globalThis.webkit.messageHandlers.bridge.postMessage = (m) => appels.push(m));
  globalThis.androidBridge && (globalThis.androidBridge.postMessage = (m) => appels.push(m));
  const { plateformeAvis } = await import(new URL('../src/utils/plateformeAvis.js', import.meta.url).href);
  const { toucherLeger } = await import(new URL('../src/utils/retourHaptique.js', import.meta.url).href);
  await import('@capgo/capacitor-in-app-review'); // l'import seul ne doit rien faire
  let erreur = null;
  let p;
  try { p = plateformeAvis(); toucherLeger(); } catch (e) { erreur = String(e?.message ?? e); }
  await new Promise((r) => setTimeout(r, 50));
  console.log(JSON.stringify({ plateforme: p, erreur, appels: appels.length }));
  process.exit(0);
}

let echecs = 0;
const cas = (nom, plateforme, entetes, attendu) => {
  const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url), '--cas', plateforme, entetes], { cwd: RACINE, encoding: 'utf8' });
  let res = null;
  try { res = JSON.parse(String(r.stdout).trim().split('\n').pop()); } catch { /* sortie illisible */ }
  const ok = res && res.erreur === null && res.plateforme === attendu.plateforme && (attendu.appels == null || res.appels === attendu.appels);
  console.log(`${ok ? '  ✓' : '  ✗'} ${nom}${ok ? '' : `   ← ${JSON.stringify(res) || r.stderr.slice(0, 300)}`}`);
  if (!ok) echecs++;
};

console.log('Binaire SANS le plugin (OTA sur un binaire d’avant 2.9.38) :');
cas('iOS : aucune demande, aucune erreur, aucun appel natif', 'ios', 'App,CapacitorUpdater', { plateforme: null, appels: 0 });
cas('Android : aucune demande, aucune erreur, aucun appel natif', 'android', 'App,CapacitorUpdater', { plateforme: null, appels: 0 });
console.log('Binaire 2.9.38 (plugin présent) :');
cas('iOS : la fenêtre officielle est possible', 'ios', 'App,CapgoInAppReview,Haptics', { plateforme: 'ios' });
cas('Android : la fenêtre officielle est possible', 'android', 'App,CapgoInAppReview,Haptics', { plateforme: 'android' });

console.log(echecs ? `\n✗ ${echecs} cas en échec` : '\n✓ tous les cas passent');
process.exit(echecs ? 1 : 0);
