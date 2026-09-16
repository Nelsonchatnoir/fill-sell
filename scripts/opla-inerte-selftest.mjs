// `node scripts/opla-inerte-selftest.mjs`
//
// LOT 5 (b) — PROUVE QUE LE DRAPEAU ARRÊTE LE CIRCUIT, ET QU'IL L'ARRÊTE NET.
//
// La règle de Nico : « OPLA_ACTIF reste false, et c'est lui qui doit arrêter le
// circuit. Si le refus n'est pas NET et tracé, le lot est raté. »
// Or le circuit réel passe par un content script injecté sur opla.co, et
// toucher opla.co est interdit. On exerce donc le fichier LÀ OÙ IL EST PUR :
// dans un vm Node, avec des doublures pour chrome/window/document, et un
// `fetch` PIÉGÉ qui lève à la moindre requête.
//
// Ce que ce selftest établit, sans une seule requête réseau :
//   1. content-scripts/opla.js se charge sans rien appeler ;
//   2. OPLA_ACTIF vaut false ;
//   3. fillListingForm rend un refus NET (success:false) qui NOMME le drapeau,
//      et n'a touché ni au réseau ni au DOM ;
//   4. deleteListing pareil ;
//   5. le handler est ATTEIGNABLE : OPLA_PING répond { pong:true, actif:false } ;
//   6. FILL_LISTING par message rend le même refus, trace jointe.
//
// ⛔ Si un jour ce selftest échoue parce qu'OPLA_ACTIF est passé à true, ce
//    n'est pas le selftest qu'il faut corriger : c'est que la livraison d'Opla
//    a commencé, et elle se décide ailleurs.

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FICHIER = path.join(ROOT, 'chrome-extension', 'content-scripts', 'opla.js');

let echecs = 0;
const ok = (nom) => console.log(`  ok   ${nom}`);
const ko = (nom, detail) => { echecs++; console.error(`  ÉCHEC ${nom}\n        ${detail}`); };
const verifier = (nom, condition, detail) => (condition ? ok(nom) : ko(nom, detail));

// ── Le piège : toute requête sortante fait échouer le test ───────────────────
const requetes = [];
const fetchPiege = (...args) => {
  requetes.push(String(args[0]));
  throw new Error(`REQUÊTE INTERDITE vers ${String(args[0])} — le drapeau aurait dû arrêter avant`);
};

// Doublures minimales : juste ce que le fichier touche au CHARGEMENT.
const ecouteurs = [];
const contexte = {
  console,
  fetch: fetchPiege,
  setTimeout,
  clearTimeout,
  chrome: {
    runtime: {
      onMessage: { addListener: (fn) => ecouteurs.push(fn) },
      sendMessage: () => Promise.resolve(),
    },
  },
  window: { addEventListener: () => {}, location: { origin: 'https://exemple.invalid' }, postMessage: () => {} },
  document: {
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener: () => {},
  },
  getComputedStyle: () => ({}),
};
contexte.globalThis = contexte;
contexte.self = contexte;

// Le pré-vol publie sur globalThis : opla.js l'y lit. On le charge d'abord,
// dans le MÊME contexte — exactement comme le manifest les injecte ensemble.
const sandbox = vm.createContext(contexte);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'chrome-extension', 'content-scripts', 'opla-prevol.js'), 'utf8'), sandbox, { filename: 'opla-prevol.js' });

console.log('\n▸ chargement de content-scripts/opla.js (fetch piégé)');
try {
  vm.runInContext(fs.readFileSync(FICHIER, 'utf8'), sandbox, { filename: 'opla.js' });
  ok('le fichier se charge sans lever');
} catch (e) {
  ko('le fichier se charge sans lever', String(e?.message ?? e));
  process.exit(1);
}
verifier('aucune requête au chargement', requetes.length === 0, `requêtes : ${JSON.stringify(requetes)}`);
verifier('OPLA_ACTIF vaut false', vm.runInContext('OPLA_ACTIF', sandbox) === false,
  'le drapeau n\'est plus éteint — la livraison d\'Opla se décide ailleurs que dans ce test');

// Un job plausible : si le drapeau ne coupait pas, il irait loin.
const job = {
  id: 'selftest-opla-inerte',
  platform: 'opla',
  title: 'Robe d\'été Zara',
  description: 'Portée deux fois, aucun défaut.',
  price: 15,
  photos: [{ type: 'original', url: 'https://exemple.invalid/photo-1.jpg' }],
  platform_fields: { oplaCategoryCode: 'SUMMER_DRESSES', marque: 'Zara', etat: 'good', taille: 'M' },
};

console.log('\n▸ points d\'entrée');
const fill = vm.runInContext('fillListingForm', sandbox);
const del = vm.runInContext('deleteListing', sandbox);

const r1 = await fill(job);
verifier('fillListingForm refuse (success:false)', r1?.success === false, JSON.stringify(r1));
verifier('le refus NOMME le drapeau',
  /OPLA_ACTIF\s*=\s*false/.test(String(r1?.diagnostic ?? '')),
  `diagnostic : ${JSON.stringify(r1?.diagnostic)}`);
verifier('le refus porte un message lisible', typeof r1?.error === 'string' && r1.error.length > 0, JSON.stringify(r1));
verifier('aucune requête pendant fillListingForm', requetes.length === 0, JSON.stringify(requetes));

const r2 = await del(job);
verifier('deleteListing refuse (success:false)', r2?.success === false, JSON.stringify(r2));
verifier('aucune requête pendant deleteListing', requetes.length === 0, JSON.stringify(requetes));

// Lot 7 : deleteListing et republishListing ne sont plus des souches — ils
// appellent l'API pour de vrai. Le drapeau doit donc les arrêter EUX AUSSI,
// avant la première requête. C'est la seule chose qui ait changé de nature
// depuis le lot 5, et c'est exactement ce que ce test existe pour tenir.
const rep = vm.runInContext('republishListing', sandbox);
const jobAvecLien = { ...job, listing_url: 'https://www.opla.co/product/art_0123456789abcdef0123456789abcdef' };
const r3 = await rep(jobAvecLien);
verifier('republishListing refuse (success:false)', r3?.success === false, JSON.stringify(r3));
verifier('le refus de republishListing NOMME le drapeau',
  /OPLA_ACTIF\s*=\s*false/.test(String(r3?.diagnostic ?? '')),
  `diagnostic : ${JSON.stringify(r3?.diagnostic)}`);
verifier('aucune requête pendant republishListing', requetes.length === 0, JSON.stringify(requetes));

// Et avec un lien EXPLOITABLE, deleteListing non plus ne doit rien appeler :
// la souche d'avant sortait avant d'avoir une cible, désormais il en a une.
const r4 = await del(jobAvecLien);
verifier('deleteListing refuse AUSSI avec un lien exploitable', r4?.success === false, JSON.stringify(r4));
verifier('aucune requête pendant deleteListing (lien exploitable)', requetes.length === 0, JSON.stringify(requetes));

console.log('\n▸ le handler est ATTEIGNABLE (canal de messages)');
verifier('un écouteur de messages est posé', ecouteurs.length === 1, `écouteurs : ${ecouteurs.length}`);

const repondre = (msg) => new Promise((resolve) => {
  const garde = setTimeout(() => resolve({ __timeout: true }), 2000);
  ecouteurs[0](msg, {}, (r) => { clearTimeout(garde); resolve(r); });
});

const pong = await repondre({ type: 'OPLA_PING' });
verifier('OPLA_PING répond', pong?.pong === true, JSON.stringify(pong));
verifier('OPLA_PING dit le drapeau éteint', pong?.actif === false, JSON.stringify(pong));

const parMessage = await repondre({ type: 'FILL_LISTING', job });
verifier('FILL_LISTING refuse par le canal', parMessage?.success === false, JSON.stringify(parMessage));
verifier('la trace est jointe', Array.isArray(parMessage?.trace), JSON.stringify(parMessage));
verifier('aucune requête sur tout le parcours', requetes.length === 0, JSON.stringify(requetes));

console.log(echecs ? `\nÉCHEC — ${echecs} contrôle(s)\n` : '\nTOUT PASSE — le drapeau arrête le circuit, refus net, zéro requête\n');
process.exit(echecs ? 1 : 0);
