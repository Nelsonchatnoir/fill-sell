// ═══════════════════════════════════════════════════════════════════════════
// LE RAYON CHOISI VAUT POUR L'ARTICLE, PAS POUR UNE PLATEFORME (20/09, passe 2)
// ═══════════════════════════════════════════════════════════════════════════
// LE CAS RÉEL, compte ornellaracano@icloud.com, 20/09 à 16:24 :
//   article « Lot de 3 vêtements enfant 12 mois velours Bitchous oboish » ;
//   elle choisit sur VINTED « Enfants › Vêtements pour filles › Bébé filles ›
//   Combinaisons » (relevé en base : edited.vinted.rayon_choisi, posé à
//   14:24:48Z) ; elle coche Vinted + Opla ; et l'écran Publier refuse TOUT le
//   lot avec « On n'a pas reconnu l'objet dans "…" : nomme l'objet dans le
//   titre ("combinaison", "dessous de plat", "veste"…) ».
//
// TROIS DÉFAUTS DANS UNE SEULE PHRASE :
//   1. le choix humain vivait sur UNE plateforme (edited[p].rayon_choisi) et
//      les autres repartaient de leur propre titre ;
//   2. le refus était GLOBAL : une plateforme qui ne sait pas se ranger
//      bloquait celles qui savaient (le test était `every`, pas `some`) ;
//   3. le message citait un titre invisible à l'écran et demandait à la
//      personne de réécrire son titre — ou de RÉGÉNÉRER, c'est-à-dire de
//      payer — pour réparer notre correspondance de catégories.
//
//   node scripts/rayon-vaut-pour-larticle-selftest.mjs
import fs from 'node:fs';
import { objetDuRayonChoisi, plateformesAvecRayonChoisi } from '../src/utils/rayonPublication.js';

let echecs = 0;
const dit = (ok, quoi) => { if (!ok) echecs++; console.log(`${ok ? '  ok  ' : ' ÉCHEC'}  ${quoi}`); };

// ── 1. La feuille du rayon choisi nomme l'objet ───────────────────────────
console.log('1. La feuille du rayon choisi nomme l\'objet');
const ornella = {
  vinted: { rayon_choisi: { id: '1514', le: '2026-09-20T14:24:48.419Z',
    chemin: ['Enfants', 'Vêtements pour filles', 'Bébé filles', 'Combinaisons'] } },
  opla: {},
  beebs: {},
};
dit(objetDuRayonChoisi(ornella) === 'combinaison',
  `le cas d'Ornella rend « combinaison » (rendu : ${JSON.stringify(objetDuRayonChoisi(ornella))})`);
dit(objetDuRayonChoisi({ opla: { rayon_choisi: { chemin: ['Mode', 'Jeans'] } } }) === 'jean',
  'le pluriel tombe : « Jeans » → « jean »');
dit(objetDuRayonChoisi({ vinted: { rayon_choisi: { chemin: ['Maison', 'Bijoux'] } } }) === 'bijou',
  'le « x » aussi : « Bijoux » → « bijou »');
dit(objetDuRayonChoisi({ vinted: { rayon_choisi: { chemin: ['Mode', 'Robes longues'] } } }) === 'robes longue'
  || objetDuRayonChoisi({ vinted: { rayon_choisi: { chemin: ['Mode', 'Robes longues'] } } }) === 'robes longue',
  'une feuille à deux mots part telle quelle, sans lemmatisation maison');

// ── 2. Ce qui ne doit JAMAIS produire de mot ──────────────────────────────
console.log('\n2. Ce qui ne doit rendre AUCUN mot (on n\'invente pas)');
dit(objetDuRayonChoisi({}) === null, 'aucune plateforme');
dit(objetDuRayonChoisi(null) === null, 'edited absent');
dit(objetDuRayonChoisi({ vinted: {} }) === null, 'plateforme sans choix');
dit(objetDuRayonChoisi({ vinted: { rayon_choisi: { chemin: [] } } }) === null, 'chemin vide');
dit(objetDuRayonChoisi({ vinted: { rayon_choisi: { chemin: ['Mode', 'Bas'] } } }) === null,
  'feuille trop courte une fois le pluriel retiré (« Bas » → « ba ») : on se tait');
dit(objetDuRayonChoisi({ vinted: { rayon_choisi: { chemin: ['Mode', 'Sac'] } } }) === 'sac',
  'mais « Sac » (pas de pluriel à retirer) reste un mot valable');

// ── 3. Qui a choisi ────────────────────────────────────────────────────────
console.log('\n3. Les plateformes qui portent un choix');
dit(JSON.stringify(plateformesAvecRayonChoisi(ornella)) === '["vinted"]',
  'chez Ornella, seule Vinted porte le choix — c\'est exactement le cas qui bloquait tout');
dit(plateformesAvecRayonChoisi({}).length === 0, 'aucun choix ⇒ liste vide');

// ── 4. Le refus n'est plus global ─────────────────────────────────────────
console.log('\n4. Un article n\'est plus bloqué partout pour une seule plateforme');
const ecran = fs.readFileSync('src/components/ListingPreviewScreen.jsx', 'utf8');
dit(!/plateformesAPublier\.every\(p => edited\[p\]\?\.rayon_choisi/.test(ecran),
  'le test `every` sur toutes les plateformes a disparu');
dit(/const unRayonChoisi = plateformesAvecRayonChoisi\(edited\)\.length > 0;/.test(ecran),
  'il est remplacé par « au moins une plateforme porte un choix »');
dit(/objetDuRayonChoisi\(edited\)/.test(ecran),
  'la feuille du rayon choisi alimente le mot de l\'objet, donc la cascade de CHAQUE plateforme');

// ── 5. Le message ne donne plus de travail ────────────────────────────────
console.log('\n5. Le message de refus');
const reso = fs.readFileSync('src/utils/resolutionPublication.js', 'utf8');
dit(!/Nomme l'objet dans le titre/.test(reso), '« Nomme l\'objet dans le titre » a disparu');
dit(!/régénère l'annonce, puis republie/.test(reso), '« régénère l\'annonce » (geste PAYANT) a disparu');
dit(!/On n'a pas su ranger cet article tout seul[^"]*\$\{/.test(reso),
  'le nouveau message ne cite aucun titre');
dit(/On n'a pas su ranger cet article tout seul\. Son rayon se choisit sur la carte de chaque plateforme/.test(reso),
  'le nouveau message dit que ça vient de chez nous et montre la porte qui existe');

// ── 6. Le garde-fou nº1 tient toujours ────────────────────────────────────
console.log('\n6. Le garde-fou du lot B n\'a pas bougé');
dit(!/rayon_choisi|choix_humain|appliquerRayonChoisi|objetDuRayonChoisi/.test(reso),
  'resolutionPublication.js ne connaît toujours RIEN du choix humain');
dit(/suite\.categorie_source = 'choix_humain';/.test(fs.readFileSync('src/utils/rayonPublication.js', 'utf8')),
  'un rayon choisi reste marqué `choix_humain` et n\'est jamais recalculé');

console.log(`\n${echecs === 0 ? '✅ Le rayon choisi vaut pour l\'article, et une plateforme muette ne bloque plus les autres.' : `❌ ${echecs} échec(s).`}`);
process.exit(echecs === 0 ? 0 : 1);
