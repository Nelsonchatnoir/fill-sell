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
  const appels = { ping: 0, relance: 0, brut: 0, notes: [] };
  const corps = [
    extraireFonctionJs(src, 'patienceApprise'),
    extraireFonctionJs(src, 'contentScriptRepondSurOnglet'),
    extraireFonctionJs(src, 'getOrCreateWorkTab'),
  ].join('\n');
  // (04/11, gjehly) La patience apprise du poste : ses constantes, telles qu'écrites dans le background.
  const reveil = ['REVEIL_FACTEUR', 'PATIENCE_APPRISE_MAX_MS', 'REVEIL_SEUIL_MS'].map((n) => src.match(new RegExp(`const ${n}\\s*=\\s*[\\d_.]+`))?.[0]).join('; ');
  const constantes = src.match(/const PLATEFORMES_SCRIPT_DU_MANIFESTE\s*=\s*new Set\(\[[^\]]*\]\)/)?.[0];
  const patience = src.match(/const PATIENCE_INJECTION_MS\s*=\s*[\d_]+/)?.[0];
  const fabrique = new Function('env', `
    const { sendMessageToTabOnce, sleep, relancerOngletMuet, getOrCreateWorkTabBrut, SYNC_PING_TIMEOUT_MS, console, restaurerFenetrePourOngletMuet, sonderEtSoignerOngletMuet, lireReveilsOnglet, noterReveilOnglet } = env;
    ${constantes}; ${patience}; ${reveil};
    ${corps}
    return { getOrCreateWorkTab, contentScriptRepondSurOnglet, patienceApprise };`);
  let horloge = 0;
  const env = {
    SYNC_PING_TIMEOUT_MS: 8000,
    console: { warn() {}, log() {} },
    sleep: async (ms) => { horloge += ms; },
    getOrCreateWorkTabBrut: async () => { appels.brut++; return 11; },
    sendMessageToTabOnce: async (tabId, msg, delai) => {
      appels.ping++;
      return scenario.ping(tabId, msg, appels.ping, { horloge: () => horloge, delai, avancer: (ms) => { horloge += ms; } });
    },
    // (04/11) Les mesures du poste : celles du scénario (aucune par défaut), et le journal de ce qui est noté.
    lireReveilsOnglet: async () => scenario.reveils ?? [],
    noterReveilOnglet: async (platform, ms, echec = false) => { appels.notes.push({ platform, ms, echec }); },
    // (24/10 soir) La fenêtre de travail rendue visible (dernier geste) : absente par défaut, sauf scénario dédié.
    restaurerFenetrePourOngletMuet: async () => { appels.visible = (appels.visible ?? 0) + 1; return scenario.fenetreVisible === true; },
    // (01/11 soir, 0.6.165) La sonde de l'onglet muet et son remède : rien de soigné par défaut, sauf scénario dédié.
    sonderEtSoignerOngletMuet: async (platform, tabId, moment) => { (appels.sondes ??= []).push(moment); return scenario.soigne === moment; },
    relancerOngletMuet: async (platform, tabId, url, ping, opts) => {
      appels.relance++;
      (appels.relanceOpts ??= []).push(opts ?? null);
      const depuis = Date.now();
      horloge += 5_000;
      if (!scenario.relanceOk) return { ok: false, tabId, geste: 'rechargement puis onglet neuf', depuis };
      return (await ping(22)) ? { ok: true, tabId: 22, geste: 'rechargement', depuis } : { ok: false, tabId, geste: 'rechargement puis onglet neuf', depuis };
    },
  };
  const realNow = Date.now;
  Date.now = () => realNow() + horloge;
  return { api: fabrique(env), appels, fin: () => { Date.now = realNow; }, horloge: () => horloge };
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
    ok(m.appels.sondes?.join() === 'apres_relance', `(0.6.165) la page muette est sondée après la relance, avant l'erreur (${m.appels.sondes})`);
  }
  {
    // (01/11 soir, gjehly) Fenêtre rendue visible : la relance montre l'onglet neuf ; la sonde passe avant ET après.
    const m = monter(src, { relanceOk: false, fenetreVisible: true, ping: () => { throw new Error('Timeout: pas de réponse du content script'); } });
    let err = null;
    try { await m.api.getOrCreateWorkTab('vinted', 'https://www.vinted.fr/items/new'); } catch (e) { err = String(e.message); }
    m.fin();
    ok(err && TECHNIQUE.test(err) && /ni fenêtre de travail visible/.test(err) && !/sonde|loading|DataDome|anti-?robot/i.test(err),
      `toujours muet, fenêtre visible : même message de la liste technique, la sonde n'y entre pas (« ${err} »)`);
    ok(m.appels.sondes?.join() === 'apres_relance,fenetre_visible', `sondée après la relance puis fenêtre visible (${m.appels.sondes})`);
    ok(m.appels.relanceOpts?.[0] == null && m.appels.relanceOpts?.[1]?.montrer === true, 'la seconde relance (fenêtre visible) montre son onglet neuf ; la première non');
  }
  {
    const m = monter(src, { relanceOk: false, soigne: 'apres_relance', ping: () => { throw new Error('Timeout: pas de réponse du content script'); } });
    const t = await m.api.getOrCreateWorkTab('vinted', 'https://www.vinted.fr/items/new');
    m.fin();
    ok(t === 11 && !m.appels.visible, 'scripts injectés par le remède : l\'onglet est rendu, sans fenêtre visible');
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
  // ── (04/11, gjehly) Un poste lent garde sa première page le temps qu'il lui faut ; un poste rapide, rien ne change.
  {
    const m = monter(src, { ping: () => ({ pong: true }) });
    const P = m.api.patienceApprise;
    const mes = (...ms) => ms.map((x) => ({ ms: x }));
    m.fin();
    ok(P([]) === 0 && P(mes(36_000, 36_000)) === 0, 'patience apprise : rien sous 3 mesures');
    ok(P(mes(5_000, 6_000, 7_000, 8_000, 10_000)) === 0, 'poste rapide (5 à 10 s) : aucune patience apprise, la règle d\'avant');
    ok(P(mes(36_000, 36_000, 36_000)) === 54_000, 'poste lent (36 s) : 1,5 × le 80e centile = 54 s');
    ok(P(mes(1e6, 1e6, 1e6)) === 90_000, 'plafond : 90 s');
    ok(P([null, { ms: 'x' }, { ms: -1 }, ...mes(36_000, 36_000, 36_000)]) === 54_000, 'mesures illisibles ignorées');
  }
  const timeout = (o) => { o.avancer(o.delai ?? 8000); throw new Error('Timeout: pas de réponse du content script'); };
  {
    const m = monter(src, { reveils: [5_000, 6_000, 7_000, 8_000].map((ms) => ({ ms })), relanceOk: true,
      ping: (id, msg, n, o) => (id === 11 ? timeout(o) : { pong: true }) });
    const t = await m.api.getOrCreateWorkTab('vinted', 'https://www.vinted.fr/items/new');
    m.fin();
    ok(t === 22 && m.appels.relance === 1 && m.appels.ping === 2, 'poste rapide appris + page muette : relancée exactement comme avant (un seul ping jugé)');
    ok(m.appels.notes.length === 1 && m.appels.notes[0].echec === false && m.appels.notes[0].ms === 5_000, `réveil après relance noté depuis la relance (${JSON.stringify(m.appels.notes)})`);
  }
  {
    const m = monter(src, { reveils: [36_000, 36_000, 36_000].map((ms) => ({ ms })),
      ping: (id, msg, n, o) => (o.horloge() < 30_000 ? timeout(o) : { pong: true }) });
    const t = await m.api.getOrCreateWorkTab('vinted', 'https://www.vinted.fr/items/new');
    m.fin();
    ok(t === 11 && m.appels.relance === 0, 'poste lent appris + pings sans réponse 30 s puis pong : aucune relance, la première page est rendue');
    ok(m.appels.notes.length === 1 && !m.appels.notes[0].echec && m.appels.notes[0].ms >= 30_000, `l'âge au réveil est noté (${JSON.stringify(m.appels.notes)})`);
  }
  {
    const m = monter(src, { reveils: [36_000, 36_000, 36_000].map((ms) => ({ ms })),
      ping: (id, msg, n, o) => { if (o.horloge() < 45_000) throw new Error('Could not establish connection. Receiving end does not exist.'); return { pong: true }; } });
    const t = await m.api.getOrCreateWorkTab('vinted', 'https://www.vinted.fr/items/new');
    m.fin();
    ok(t === 11 && m.appels.relance === 0, 'poste lent appris + script absent 45 s puis pong : aucune relance');
  }
  {
    const m = monter(src, { reveils: [36_000, 36_000, 36_000].map((ms) => ({ ms })), relanceOk: false, ping: (id, msg, n, o) => timeout(o) });
    let err = null;
    try { await m.api.getOrCreateWorkTab('vinted', 'https://www.vinted.fr/items/new'); } catch (e) { err = String(e.message); }
    const total = m.horloge();
    m.fin();
    ok(err && TECHNIQUE.test(err) && m.appels.relance === 1, `page muette malgré la patience : relancée, même message de la liste technique (« ${err} »)`);
    ok(total <= 54_000 + 8_000 + 5_000 + 1_000, `la patience ne dépasse jamais la borne apprise (${total} ms au total, relance comprise)`);
    ok(m.appels.notes.length === 1 && m.appels.notes[0].echec === true && m.appels.notes[0].ms >= 54_000, `l'échec est noté avec l'âge atteint (${JSON.stringify(m.appels.notes)})`);
  }
  {
    const m = monter(src, { ping: () => ({ pong: true }) });
    await m.api.getOrCreateWorkTab('beebs', 'https://www.beebs.app/fr/');
    m.fin();
    ok(m.appels.notes.length === 1 && m.appels.notes[0].platform === 'beebs' && m.appels.notes[0].echec === false, 'chaque réveil est noté par plateforme');
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
  ok(/async function getOrCreateWorkTab\(platform, url\) \{\s*(const depuis = Date\.now\(\);\s*)?const tabId = await getOrCreateWorkTabBrut\(platform, url\);/.test(src), 'getOrCreateWorkTab passe toujours par la garde');
  ok(s.length > 1000, 'background lu');
}

console.log(ko ? `\n${ko} contrôle(s) en échec.` : '\nTout est vert.');
process.exit(ko ? 1 : 0);
