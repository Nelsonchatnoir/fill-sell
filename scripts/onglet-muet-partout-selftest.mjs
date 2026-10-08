// ═══════════════════════════════════════════════════════════════════════════
// UN ONGLET DE TRAVAIL N'EST RENDU QU'AVEC UN CONTENT SCRIPT QUI RÉPOND —
// PARTOUT (0.6.104, 08/10/2026 : Jonathan Rabany, Carla)
// ═══════════════════════════════════════════════════════════════════════════
// La 0.6.103 relançait l'onglet muet (« déjà chargé, non réinjecté ») à deux
// endroits seulement ; la capture Vinted avant republication, le pré-vol de
// dépôt, la publication, le retrait, les relevés ouvraient leur onglet par
// getOrCreateWorkTab et attendaient 300 s un script muet, sans rien écrire :
// « tâche sans démarrage ». Ce test EXÉCUTE la garde (extraite du background,
// source lisible ET zip minifié s'il est passé) et échoue si :
//   · un onglet est rendu sans que le content script de la plateforme ait
//     répondu au PING ;
//   · un script pas encore injecté (document_idle) déclenche une relance au
//     lieu d'une courte patience ;
//   · un script muet n'est pas relancé (rechargement puis onglet neuf) ;
//   · une relance impossible ne finit pas en erreur de la liste technique
//     (reprise automatique) ;
//   · Opla (pas de script du manifeste) est soumis au PING ;
//   · un chemin de job ouvre un onglet de travail sans passer par
//     getOrCreateWorkTab / ouvrirOngletTravailJob.
//
//   npm run selftest:onglet-muet-partout
//   node scripts/onglet-muet-partout-selftest.mjs --zip <chemin du zip>
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extraireFonctionJs } from './lib/extraire-fonction-js.mjs';

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let ko = 0;
const ok = (c, quoi) => { if (!c) { ko++; console.log(`  ✗ ${quoi}`); } else console.log(`  ✓ ${quoi}`); };

async function sources() {
  const out = [['source', fs.readFileSync(path.join(racine, 'chrome-extension/background.js'), 'utf8')]];
  const i = process.argv.indexOf('--zip');
  if (i > 0) {
    const { default: JSZip } = await import('jszip');
    const z = await JSZip.loadAsync(fs.readFileSync(process.argv[i + 1]));
    out.push(['zip', await z.file('background.js').async('string')]);
  }
  return out;
}

function monter(src, scenario) {
  const appels = { ping: 0, relance: 0, brut: 0 };
  const corps = [
    extraireFonctionJs(src, 'contentScriptRepondSurOnglet'),
    extraireFonctionJs(src, 'getOrCreateWorkTab'),
  ].join('\n');
  const constantes = src.match(/const PLATEFORMES_SCRIPT_DU_MANIFESTE\s*=\s*new Set\(\[[^\]]*\]\)/)?.[0];
  const patience = src.match(/const PATIENCE_INJECTION_MS\s*=\s*[\d_]+/)?.[0];
  const fabrique = new Function('env', `
    const { sendMessageToTabOnce, sleep, relancerOngletMuet, getOrCreateWorkTabBrut, SYNC_PING_TIMEOUT_MS, console } = env;
    ${constantes}; ${patience};
    ${corps}
    return { getOrCreateWorkTab, contentScriptRepondSurOnglet };`);
  let horloge = 0;
  const env = {
    SYNC_PING_TIMEOUT_MS: 8000,
    console: { warn() {}, log() {} },
    sleep: async (ms) => { horloge += ms; },
    getOrCreateWorkTabBrut: async () => { appels.brut++; return 11; },
    sendMessageToTabOnce: async (tabId, msg) => {
      appels.ping++;
      return scenario.ping(tabId, msg, appels.ping);
    },
    relancerOngletMuet: async (platform, tabId, url, ping) => {
      appels.relance++;
      if (!scenario.relanceOk) return { ok: false, tabId, geste: 'rechargement puis onglet neuf' };
      return (await ping(22)) ? { ok: true, tabId: 22, geste: 'rechargement' } : { ok: false, tabId, geste: 'rechargement puis onglet neuf' };
    },
  };
  const realNow = Date.now;
  Date.now = () => realNow() + horloge;
  return { api: fabrique(env), appels, fin: () => { Date.now = realNow; } };
}

const TECHNIQUE = /le content script ne répond pas/i; // SYNC_ERREUR_TECHNIQUE_RE (liste fermée)

for (const [nom, src] of await sources()) {
  console.log(`— ${nom}`);
  {
    const m = monter(src, { ping: () => ({ pong: true }) });
    const t = await m.api.getOrCreateWorkTab('vinted', 'https://www.vinted.fr/');
    m.fin();
    ok(t === 11 && m.appels.ping === 1 && m.appels.relance === 0, 'script qui répond : l\'onglet est rendu, aucune relance');
  }
  {
    const m = monter(src, { ping: (id, msg, n) => { if (n <= 2) throw new Error('Could not establish connection. Receiving end does not exist.'); return { pong: true }; } });
    const t = await m.api.getOrCreateWorkTab('beebs', 'https://www.beebs.app/fr/');
    m.fin();
    ok(t === 11 && m.appels.relance === 0 && m.appels.ping === 3, 'script pas encore injecté : courte patience, jamais une relance');
  }
  {
    const m = monter(src, { relanceOk: true, ping: (id) => { if (id === 11) throw new Error('Timeout: pas de réponse du content script'); return { pong: true }; } });
    const t = await m.api.getOrCreateWorkTab('leboncoin', 'https://www.leboncoin.fr/');
    m.fin();
    ok(t === 22 && m.appels.relance === 1, 'script muet : relancé (rechargement puis onglet neuf), l\'onglet relancé est rendu');
  }
  {
    const m = monter(src, { relanceOk: false, ping: () => { throw new Error('Timeout: pas de réponse du content script'); } });
    let err = null;
    try { await m.api.getOrCreateWorkTab('ebay', 'https://www.ebay.fr/'); } catch (e) { err = String(e.message); }
    m.fin();
    ok(err && TECHNIQUE.test(err) && /ebay/.test(err), `relance impossible : erreur de la liste technique (« ${err} »)`);
  }
  {
    const m = monter(src, { ping: () => { throw new Error('ne doit pas être appelé'); } });
    const t = await m.api.getOrCreateWorkTab('opla', 'https://www.opla.co/');
    m.fin();
    ok(t === 11 && m.appels.ping === 0, 'Opla (pas de script du manifeste) : aucun PING, comportement inchangé');
  }
  {
    const m = monter(src, { ping: (id, msg) => (msg.type === 'VINTED_PING' ? { pong: true } : null) });
    const t = await m.api.getOrCreateWorkTab('vinted', 'https://www.vinted.fr/items/1');
    m.fin();
    ok(t === 11, 'Vinted : le PING de Vinted (VINTED_PING)');
  }
}

console.log('— chemins');
{
  const src = fs.readFileSync(path.join(racine, 'chrome-extension/background.js'), 'utf8');
  // Seuls l'onglet temporaire de vérification, la relance et la fonction brute
  // créent un onglet de travail sans la garde.
  const createurs = [...src.matchAll(/createWorkTabInWorkWindow\(/g)].map((m) => {
    const avant = src.slice(0, m.index);
    const fn = [...avant.matchAll(/(?:async\s+)?function\s+([A-Za-z0-9_]+)\s*\(/g)].pop()?.[1];
    return fn;
  }).filter((f) => f && f !== 'createWorkTabInWorkWindow');
  const permis = new Set(['getOrCreateWorkTabBrut', 'relancerOngletMuet', 'fenetreTravailEtOngletTemporaire', 'ouvrirOngletTemporaire']);
  const hors = [...new Set(createurs)].filter((f) => !permis.has(f));
  ok(true, `créateurs d'onglet de travail : ${[...new Set(createurs)].join(', ')}`);
  ok(!hors.some((f) => /process|Job|Republish|Retrait|releve|capture/i.test(f)), `aucun chemin de job ne crée son onglet sans la garde${hors.length ? ' (autres : ' + hors.join(', ') + ')' : ''}`);
  const s = src.split('\n');
  ok(/async function getOrCreateWorkTab\(platform, url\) \{\s*const tabId = await getOrCreateWorkTabBrut\(platform, url\);/.test(src), 'getOrCreateWorkTab passe toujours par la garde');
  ok(s.length > 1000, 'background lu');
}

console.log(ko ? `\n${ko} contrôle(s) en échec.` : '\nTout est vert.');
process.exit(ko ? 1 : 0);
