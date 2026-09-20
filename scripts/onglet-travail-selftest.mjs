// `node scripts/onglet-travail-selftest.mjs`
//
// LE « complete » D'UNE NAVIGATION QUI N'EST PAS LA NÔTRE (2026-09-20).
//
// Défaut mesuré : `waitForTabComplete` acceptait le PROCHAIN événement
// « complete » de l'onglet, quel qu'il soit. Le postulat écrit dans le code —
// « la navigation est déclenchée juste après l'attachement de cet écouteur,
// donc le prochain complete est le nôtre » — tombe dès que l'onglet de travail
// chargeait DÉJÀ autre chose : son « complete » arrivait pendant l'attente de
// `neutralizeBeforeUnload`, on le prenait pour le nôtre, et `getOrCreateWorkTab`
// rendait un onglet encore sur la page précédente. Le handler agissait ensuite
// sur la mauvaise page :
//   · 96eed62c (Ornella, 20/09 18:54) « Page inattendue pour une suppression
//     LBC : https://www.leboncoin.fr/compte/part/mes-transactions?page=achats » ;
//   · ed8bbd42 (Ornella, 19/09 22:48) « …Vinted : https://www.vinted.fr/ ».
//
// ⛔ CE TEST EXÉCUTE LE VRAI CODE. Il extrait `waitForTabComplete` de
//    chrome-extension/background.js — le texte exact qui part dans le zip — et
//    le fait tourner contre un faux `chrome.tabs` qui REJOUE la course :
//    un chargement étranger en vol, puis le nôtre. Rien n'est relu, rien n'est
//    recopié : si la fonction change, ce test change de verdict.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ⛔ ET ON PEUT LE FAIRE SUR LE PAQUET :
//    `node scripts/onglet-travail-selftest.mjs build/extension/background.js`
//    exécute le fichier MINIFIÉ qui part au Chrome Web Store. Un grep sur un
//    fichier minifié ne prouve rien ; l'exécuter prouve tout.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FICHIER = (process.argv[2] ? String(process.argv[2]).replace(/\\/g, '/') : 'chrome-extension/background.js');
console.log(`fichier exécuté : ${FICHIER}\n`);
const SRC = fs.readFileSync(path.join(ROOT, FICHIER), 'utf8');

/** Extrait une fonction nommée de la source, par équilibrage d'accolades. */
function extraireFonction(source, nom) {
  const debut = source.indexOf(`function ${nom}(`);
  if (debut < 0) throw new Error(`${nom} introuvable dans background.js`);
  // ⚠️ Le corps commence APRÈS la parenthèse fermante des paramètres : la liste
  //    de paramètres peut elle-même contenir des accolades (déstructuration
  //    `{ differer = false } = {}`), et partir du premier « { » rendait une
  //    fonction tronquée — vu en écrivant ce test.
  let p = source.indexOf('(', debut);
  let parens = 0;
  for (; p < source.length; p++) {
    if (source[p] === '(') parens++;
    else if (source[p] === ')') { parens--; if (parens === 0) break; }
  }
  let i = source.indexOf('{', p);
  let profondeur = 0;
  for (; i < source.length; i++) {
    if (source[i] === '{') profondeur++;
    else if (source[i] === '}') { profondeur--; if (profondeur === 0) return source.slice(debut, i + 1); }
  }
  throw new Error(`${nom} : accolades non équilibrées`);
}

const SOURCE_FN = extraireFonction(SRC, 'waitForTabComplete');

// ── Le faux chrome.tabs : une horloge, des événements, rien d'autre ─────────
function faireChrome() {
  const ecouteursUpdated = new Set();
  const ecouteursRemoved = new Set();
  const onglets = new Map();
  return {
    api: {
      tabs: {
        onUpdated: { addListener: (f) => ecouteursUpdated.add(f), removeListener: (f) => ecouteursUpdated.delete(f) },
        onRemoved: { addListener: (f) => ecouteursRemoved.add(f), removeListener: (f) => ecouteursRemoved.delete(f) },
        get: async (id) => {
          const t = onglets.get(id);
          if (!t) throw new Error('No tab with id');
          return { ...t };
        },
      },
    },
    poser: (id, etat) => onglets.set(id, { id, ...etat }),
    /** Émet un « complete » comme Chrome le ferait : (tabId, changeInfo, tab). */
    complete: (id, url) => {
      onglets.set(id, { id, url, status: 'complete', discarded: false });
      for (const f of [...ecouteursUpdated]) f(id, { status: 'complete' }, { id, url, status: 'complete' });
    },
  };
}

let ko = 0;
const ok = (nom, cond, detail = '') => { console.log(`${cond ? '  ok  ' : '  ⚠ KO'} ${nom}${detail ? ' — ' + detail : ''}`); if (!cond) ko++; };
const dans = (ms) => new Promise((r) => setTimeout(r, ms));
/** Résolue ? rejetée ? toujours en attente ? — sans jamais bloquer le test. */
const etatDe = (p) => Promise.race([p.then(() => 'resolue', () => 'rejetee'), dans(60).then(() => 'en attente')]);

const CIBLE = 'https://www.leboncoin.fr/ad/chaussures/3263132424#fillsell-worker';
const ETRANGERE = 'https://www.leboncoin.fr/compte/part/mes-transactions?page=achats';

async function scenario({ differer, armerApres }) {
  const faux = faireChrome();
  const waitForTabComplete = new Function('chrome', `${SOURCE_FN}; return waitForTabComplete;`)(faux.api);
  // L'onglet charge DÉJÀ autre chose — l'état exact relevé dans
  // work_window_state.at_start des deux jobs d'Ornella.
  faux.poser(42, { url: ETRANGERE, status: 'loading', discarded: false });

  const attente = waitForTabComplete(42, CIBLE, 5_000, differer ? { differer: true } : undefined);
  // Le « complete » de la navigation ÉTRANGÈRE, pendant que nous préparons la
  // nôtre (neutralizeBeforeUnload) — c'est lui qu'on prenait pour le nôtre.
  faux.complete(42, ETRANGERE);
  const apresEtranger = await etatDe(attente);

  if (armerApres) {
    faux.poser(42, { url: ETRANGERE, status: 'loading', discarded: false });
    attente.armer();
    await dans(20);
    faux.complete(42, CIBLE);            // notre page, enfin
  }
  // succeed() laisse 2 s à la page pour s'initialiser : on attend un peu plus.
  const fin = await Promise.race([attente.then(() => 'resolue', () => 'rejetee'), dans(2_600).then(() => 'en attente')]);
  return { apresEtranger, fin };
}

console.log('=== LA COURSE, REJOUÉE SUR LE VRAI CODE ===');

const avant = await scenario({ differer: false, armerApres: false });
ok("sans `differer` : le « complete » ÉTRANGER est accepté (c'est le défaut du 20/09)",
  avant.apresEtranger === 'en attente' && avant.fin === 'resolue',
  `pendant les 2 s de grâce : ${avant.apresEtranger} · à la fin : ${avant.fin}`);

const apres = await scenario({ differer: true, armerApres: false });
ok('avec `differer` : le « complete » étranger est IGNORÉ, on attend toujours',
  apres.fin === 'en attente', `à la fin : ${apres.fin}`);

const arme = await scenario({ differer: true, armerApres: true });
ok('avec `differer` : une fois ARMÉ, notre « complete » est bien accepté',
  arme.fin === 'resolue', `à la fin : ${arme.fin}`);

// ── Ce qui marchait doit continuer de marcher ────────────────────────────────
console.log('\n=== G0 — LES CHEMINS QUI MARCHAIENT ===');

{ // eBay redirige : le « complete » porte une AUTRE url que la cible, et il
  // doit être accepté une fois armé. C'est la permissivité qu'on ne casse pas.
  const faux = faireChrome();
  const w = new Function('chrome', `${SOURCE_FN}; return waitForTabComplete;`)(faux.api);
  faux.poser(7, { url: 'https://www.ebay.fr/lstng?draftId=1', status: 'loading', discarded: false });
  const p = w(7, 'https://www.ebay.fr/itm/123#fillsell-worker', 5_000, { differer: true });
  p.armer();
  faux.complete(7, 'https://www.ebay.fr/sl/prelist/identify?redirected=1');
  ok('eBay : une redirection vers une autre URL reste acceptée (une fois armé)',
    (await Promise.race([p.then(() => 'resolue', () => 'rejetee'), dans(2_600).then(() => 'en attente')])) === 'resolue');
}

{ // Onglet DÉJÀ chargé sur la cible : le rattrapage doit conclure tout seul,
  // armé ou non — c'est le cas légitime, et le seul, d'un « complete » d'avant.
  const faux = faireChrome();
  const w = new Function('chrome', `${SOURCE_FN}; return waitForTabComplete;`)(faux.api);
  faux.poser(9, { url: CIBLE, status: 'complete', discarded: false });
  const p = w(9, CIBLE, 5_000, { differer: true });
  ok('déjà chargé SUR LA CIBLE : conclu sans attendre, même non armé',
    (await Promise.race([p.then(() => 'resolue', () => 'rejetee'), dans(2_600).then(() => 'en attente')])) === 'resolue');
}

{ // Un appelant qui n'ordonne aucune navigation garde le comportement d'avant.
  const faux = faireChrome();
  const w = new Function('chrome', `${SOURCE_FN}; return waitForTabComplete;`)(faux.api);
  faux.poser(11, { url: 'https://www.vinted.fr/items/1', status: 'loading', discarded: false });
  const p = w(11);                       // ni cible, ni differer : comme avant
  faux.complete(11, 'https://www.vinted.fr/items/1');
  ok("sans `differer` : l'attente simple d'un chargement est inchangée",
    (await Promise.race([p.then(() => 'resolue', () => 'rejetee'), dans(2_600).then(() => 'en attente')])) === 'resolue');
}

{ // Le timeout reste un timeout.
  const faux = faireChrome();
  const w = new Function('chrome', `${SOURCE_FN}; return waitForTabComplete;`)(faux.api);
  faux.poser(13, { url: ETRANGERE, status: 'loading', discarded: false });
  const p = w(13, CIBLE, 300, { differer: true });
  ok('jamais armé et rien ne vient : le timeout tranche, il ne reste pas pendu',
    (await Promise.race([p.then(() => 'resolue', () => 'rejetee'), dans(900).then(() => 'en attente')])) === 'rejetee');
}

console.log(ko ? `\n⚠ ${ko} CAS EN ECHEC` : '\n✓ TOUS LES CAS PASSENT');
if (ko) process.exit(1);
