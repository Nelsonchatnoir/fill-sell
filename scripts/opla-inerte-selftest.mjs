// `node scripts/opla-inerte-selftest.mjs`
//
// LOT 5 (b), RÉÉCRIT LE 16/09 — DEUX PROPRIÉTÉS, DEUX SANDBOX.
//
// Jusqu'au 16/09 la règle était « OPLA_ACTIF reste false, et c'est lui qui
// arrête le circuit ». Depuis le GO Nico du 16/09 (opla.co en permission d'hôte
// OPTIONNELLE), le fichier LIVRÉ porte OPLA_ACTIF = true : l'interrupteur réel
// est la permission, accordée par un clic dans le popup — sans elle, ni l'hôte
// ni ce script n'existent chez la personne (les scripts Opla s'enregistrent à
// l'octroi, ils ne sont pas dans le manifest).
//
// Ce selftest tient donc DEUX choses, sans une seule requête réseau :
//   A. le fichier LIVRÉ (drapeau à true) se charge sans rien appeler, et son
//      OPLA_PING répond actif:true — la livraison est bien allumée ;
//   B. le COUPE-CIRCUIT reste intact : sur une copie du fichier au drapeau
//      forcé à false, chaque entrée (fillListingForm, deleteListing,
//      republishListing, FILL_LISTING par message) rend un refus NET qui nomme
//      le drapeau, trace jointe, zéro requête, zéro DOM.
// Le drapeau forcé est une SUBSTITUTION TEXTUELLE contrôlée (« const
// OPLA_ACTIF = true; » → false) : le test échoue si la ligne n'a plus cette
// forme exacte, plutôt que d'exercer un fichier qu'il n'aurait pas compris.
//
// Le circuit réel passe par un content script injecté sur opla.co, et toucher
// opla.co est interdit : on exerce donc le fichier LÀ OÙ IL EST PUR, dans un
// vm Node, avec des doublures pour chrome/window/document et un `fetch` PIÉGÉ
// qui lève à la moindre requête.

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FICHIER = path.join(ROOT, 'chrome-extension', 'content-scripts', 'opla.js');
const PREVOL = path.join(ROOT, 'chrome-extension', 'content-scripts', 'opla-prevol.js');

let echecs = 0;
const ok = (nom) => console.log(`  ok   ${nom}`);
const ko = (nom, detail) => { echecs++; console.error(`  ÉCHEC ${nom}\n        ${detail}`); };
const verifier = (nom, condition, detail) => (condition ? ok(nom) : ko(nom, detail));

// ── Une sandbox par scénario : doublures minimales + fetch piégé ─────────────
function creerSandbox() {
  const requetes = [];
  const ecouteurs = [];
  const contexte = {
    console,
    fetch: (...args) => {
      requetes.push(String(args[0]));
      throw new Error(`REQUÊTE INTERDITE vers ${String(args[0])}`);
    },
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
  const sandbox = vm.createContext(contexte);
  // Le pré-vol publie sur globalThis : opla.js l'y lit. Chargé d'abord, dans
  // le MÊME contexte — exactement comme le background les enregistre ensemble.
  vm.runInContext(fs.readFileSync(PREVOL, 'utf8'), sandbox, { filename: 'opla-prevol.js' });
  return { sandbox, requetes, ecouteurs };
}

const repondre = (ecouteurs, msg) => new Promise((resolve) => {
  const garde = setTimeout(() => resolve({ __timeout: true }), 2000);
  ecouteurs[0](msg, {}, (r) => { clearTimeout(garde); resolve(r); });
});

const sourceLivree = fs.readFileSync(FICHIER, 'utf8');

// ═══════════════════════════════════════════════════════════════════════════
// A. LE FICHIER LIVRÉ : allumé, et inerte au chargement
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n▸ A. fichier livré — chargement (fetch piégé)');
const A = creerSandbox();
try {
  vm.runInContext(sourceLivree, A.sandbox, { filename: 'opla.js' });
  ok('le fichier se charge sans lever');
} catch (e) {
  ko('le fichier se charge sans lever', String(e?.message ?? e));
  process.exit(1);
}
verifier('aucune requête au chargement', A.requetes.length === 0, `requêtes : ${JSON.stringify(A.requetes)}`);
verifier('OPLA_ACTIF vaut true (GO Nico 16/09, permission optionnelle)',
  vm.runInContext('OPLA_ACTIF', A.sandbox) === true,
  'le drapeau livré doit être à true — l\'interrupteur réel est la permission d\'hôte, pas ce drapeau');
verifier('un écouteur de messages est posé', A.ecouteurs.length === 1, `écouteurs : ${A.ecouteurs.length}`);
const pongA = await repondre(A.ecouteurs, { type: 'OPLA_PING' });
verifier('OPLA_PING répond actif:true', pongA?.pong === true && pongA?.actif === true, JSON.stringify(pongA));
verifier('aucune requête après le ping', A.requetes.length === 0, JSON.stringify(A.requetes));

// ═══════════════════════════════════════════════════════════════════════════
// B. LE COUPE-CIRCUIT : drapeau forcé à false, refus net partout
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n▸ B. coupe-circuit — copie du fichier au drapeau forcé à false');
const LIGNE_DRAPEAU = /const OPLA_ACTIF = true;/g;
const occurrences = (sourceLivree.match(LIGNE_DRAPEAU) ?? []).length;
verifier('la ligne du drapeau a la forme attendue (une seule fois)', occurrences === 1,
  `« const OPLA_ACTIF = true; » trouvée ${occurrences} fois — adapter ce selftest si la forme a changé`);
if (occurrences !== 1) process.exit(1);
const sourceEteinte = sourceLivree.replace(LIGNE_DRAPEAU, 'const OPLA_ACTIF = false;');

const B = creerSandbox();
try {
  vm.runInContext(sourceEteinte, B.sandbox, { filename: 'opla.js' });
  ok('la copie éteinte se charge sans lever');
} catch (e) {
  ko('la copie éteinte se charge sans lever', String(e?.message ?? e));
  process.exit(1);
}
verifier('OPLA_ACTIF vaut false dans la copie', vm.runInContext('OPLA_ACTIF', B.sandbox) === false, 'substitution inopérante');

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

console.log('\n▸ points d\'entrée (copie éteinte)');
const fill = vm.runInContext('fillListingForm', B.sandbox);
const del = vm.runInContext('deleteListing', B.sandbox);

const r1 = await fill(job);
verifier('fillListingForm refuse (success:false)', r1?.success === false, JSON.stringify(r1));
verifier('le refus NOMME le drapeau',
  /OPLA_ACTIF\s*=\s*false/.test(String(r1?.diagnostic ?? '')),
  `diagnostic : ${JSON.stringify(r1?.diagnostic)}`);
verifier('le refus porte un message lisible', typeof r1?.error === 'string' && r1.error.length > 0, JSON.stringify(r1));
verifier('aucune requête pendant fillListingForm', B.requetes.length === 0, JSON.stringify(B.requetes));

const r2 = await del(job);
verifier('deleteListing refuse (success:false)', r2?.success === false, JSON.stringify(r2));
verifier('aucune requête pendant deleteListing', B.requetes.length === 0, JSON.stringify(B.requetes));

// Lot 7 : deleteListing et republishListing ne sont plus des souches — ils
// appellent l'API pour de vrai. Le drapeau doit donc les arrêter EUX AUSSI,
// avant la première requête.
const rep = vm.runInContext('republishListing', B.sandbox);
const jobAvecLien = { ...job, listing_url: 'https://www.opla.co/product/art_0123456789abcdef0123456789abcdef' };
const r3 = await rep(jobAvecLien);
verifier('republishListing refuse (success:false)', r3?.success === false, JSON.stringify(r3));
verifier('le refus de republishListing NOMME le drapeau',
  /OPLA_ACTIF\s*=\s*false/.test(String(r3?.diagnostic ?? '')),
  `diagnostic : ${JSON.stringify(r3?.diagnostic)}`);
verifier('aucune requête pendant republishListing', B.requetes.length === 0, JSON.stringify(B.requetes));

// Et avec un lien EXPLOITABLE, deleteListing non plus ne doit rien appeler.
const r4 = await del(jobAvecLien);
verifier('deleteListing refuse AUSSI avec un lien exploitable', r4?.success === false, JSON.stringify(r4));
verifier('aucune requête pendant deleteListing (lien exploitable)', B.requetes.length === 0, JSON.stringify(B.requetes));

console.log('\n▸ le handler est ATTEIGNABLE (canal de messages, copie éteinte)');
verifier('un écouteur de messages est posé', B.ecouteurs.length === 1, `écouteurs : ${B.ecouteurs.length}`);
const pongB = await repondre(B.ecouteurs, { type: 'OPLA_PING' });
verifier('OPLA_PING répond', pongB?.pong === true, JSON.stringify(pongB));
verifier('OPLA_PING dit le drapeau éteint', pongB?.actif === false, JSON.stringify(pongB));

const parMessage = await repondre(B.ecouteurs, { type: 'FILL_LISTING', job });
verifier('FILL_LISTING refuse par le canal', parMessage?.success === false, JSON.stringify(parMessage));
verifier('la trace est jointe', Array.isArray(parMessage?.trace), JSON.stringify(parMessage));
verifier('aucune requête sur tout le parcours', B.requetes.length === 0, JSON.stringify(B.requetes));

console.log(echecs
  ? `\nÉCHEC — ${echecs} contrôle(s)\n`
  : '\nTOUT PASSE — livré allumé et inerte au chargement ; coupe-circuit intact, refus net, zéro requête\n');
process.exit(echecs ? 1 : 0);
