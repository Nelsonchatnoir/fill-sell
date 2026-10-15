// selftest:fiches-a-verifier-visibles — (15/10, P16) Les fiches en doute se
// voient AU STOCK (à part, badge « À vérifier », un tap ouvre SA question) et
// les questions viennent par petits lots (dix, les plus chères d'abord, une
// pause « Continuer / Plus tard »). ferreirasab : 515 fiches hors stock et 895
// questions d'affilée après sa synchro — elle n'a plus rien fait.
// Relevé à 360 et 1280 px (scripts/apercu/capture-a-verifier-stock.mjs, données fictives).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (p) => fs.readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');
let n = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); n++; console.log(`  ✓ ${msg}`); };

console.log('1. Visibles au Stock, hors de tout calcul');
const sec = lire('src/stock/SectionAVerifier.jsx');
const st = lire('src/tabs/StockTab.jsx');
const app = lire('src/App.jsx');
ok(/<SectionAVerifier lang=\{lang\} items=\{itemsAVerifier\} onOuvrir=\{aVerifier\.ouvrir\}\/>/.test(st), 'la section est montée dans le Stock avec les fiches « à vérifier »');
ok(/setItems\(lignes\.filter\(r=>!estAVerifier\(r\)\)\.map\(mapItem\)\);/.test(app), 'elles restent HORS de `items` : aucun total, aucun lot, aucune publication');
ok(/!modeBrouillons&&!modePrixAchat&&!modeRepublish&&!modeLot&&!modeModif&&itemsAVerifier\.length>0/.test(st), 'jamais dans un mode de sélection (lot, remontée, prix d\'achat, modification)');
ok(/'À vérifier' : 'To check'/.test(sec) && /onClick=\{\(\) => actif && onOuvrir\(it\.id\)\}/.test(sec), 'badge « À vérifier » ; un tap ouvre SA question');
const bloc = lire('src/stock/BlocSynchro.jsx');
ok(/ouvrirAVerifierRef\.current = \(id = null\) => \{ setPremiereAV\(id \?\? null\);/.test(bloc) && /premiere=\{premiereAV\}/.test(bloc), 'l\'écran s\'ouvre sur la fiche touchée');

console.log('2. Par petits lots');
const ecr = lire('src/annonces/EcranDoublons.jsx');
ok(/export const QUESTIONS_PAR_LOT = 10;/.test(ecr), 'dix questions à la fois');
ok(/\.sort\(\(x, y\) => valeurDe\(y\.d\) - valeurDe\(x\.d\) \|\| x\.i - y\.i\)/.test(ecr), 'les plus chères d\'abord (tri stable)');
ok(/const enPause = file\.length > 0 && traitees\.size > 0 && traitees\.size % QUESTIONS_PAR_LOT === 0/.test(ecr) && /'Plus tard' : 'Later'/.test(ecr) && /Continuer \(\$\{Math\.min\(QUESTIONS_PAR_LOT, file\.length\)\} de plus\)/.test(ecr), 'une pause après dix réponses : « Continuer » ou « Plus tard »');
ok(/Il en reste \$\{file\.length\}/.test(ecr) && /elles t'attendent dans « À régler », rien n'est perdu/.test(ecr), 'la pause dit ce qui reste, et où');
ok(/Question \$\{numeroDansLot\} sur \$\{tailleLot\}/.test(ecr), '« Question k sur 10 · encore N ensuite »');

console.log(`\n✓ fiches-a-verifier-visibles : ${n} contrôles verts`);
