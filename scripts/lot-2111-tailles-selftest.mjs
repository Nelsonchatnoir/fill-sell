// ═══════════════════════════════════════════════════════════════════════════
// VERROU — lot du 21/11/2026, point 1 (tailles Leboncoin, GRAVE)
// ═══════════════════════════════════════════════════════════════════════════
// Rouge avant le correctif, vert après (rejoué sur les grilles RÉELLES relevées chez Leboncoin le 21/11) :
//   · vetis.shop : « 50 » face aux pointures « … 49,5 · 50 et plus » → « La grille de ce rayon va de 16 à 49,5 : 50 n'y
//     figure pas » ; la robe « 5XL / 50 / 22 » rangée en Baskets recevait la pointure « 22 » ;
//   · « 8XL » face à « 8XL et plus » / « 56 - 8XL et plus » : introuvable ; « LG » (assopmfrance) : introuvable ;
//   · un jean HOMME « 50 » jugé dans la grille FEMME (« 50 - 5XL ») à l'écran, puis la question APRÈS la publication.
import assert from 'node:assert/strict';
import { tailleDansGrille, baseDuPalierOuvert, porteUneLettreDeVetement } from '../supabase/functions/_shared/tailles.js';
import { jugerValeurContreListe, pointureHorsGrille, tailleDuJob } from '../src/publication/moteur/listes.js';
import { GRILLES_LBC_TAILLE_VETEMENTS, grilleTailleLbcDeLUnivers, lignesLbcAvecGrilleDeLUnivers } from '../supabase/functions/_shared/lbc-grilles-univers.js';
import { tailleLbcHomme, GRILLE_LBC_HOMME } from '../supabase/functions/_shared/lbc-taille-homme.js';
import { classerChamps } from '../src/utils/champsDuRayon.js';
import { ecartsGrillesParUnivers, libellesAbsents, champsAListesDependantes } from '../supabase/functions/_shared/controle-listes-plateformes.js';

let ok = 0;
const t = (nom, f) => { f(); ok++; console.log(`  ✓ ${nom}`); };
const POINTURES = []; for (let x = 16; x < 50; x += 0.5) POINTURES.push(String(x).replace('.', ',')); POINTURES.push('50 et plus');
const FEMME = GRILLES_LBC_TAILLE_VETEMENTS.Femme, HOMME = GRILLES_LBC_TAILLE_VETEMENTS.Homme, ENFANT = GRILLES_LBC_TAILLE_VETEMENTS.Enfant;
const juger = (value, allowedValues, key) => jugerValeurContreListe({ platform: 'leboncoin', key, value, allowedValues,
  cheminCategorie: key === 'shoe_size' ? ['Mode', 'Chaussures'] : ['Mode', 'Vêtements'] });

console.log('1. Le palier ouvert (« 50 et plus », « 8XL et plus »)');
t('base du palier', () => {
  assert.equal(baseDuPalierOuvert('50 et plus'), '50');
  assert.equal(baseDuPalierOuvert('56 - 8XL et plus'), '56 - 8XL');
  assert.equal(baseDuPalierOuvert('18 ans / 182 cm +'), '18 ans / 182 cm');
  assert.equal(baseDuPalierOuvert('et plus'), null);
  assert.equal(baseDuPalierOuvert('38 - M'), null);
});
t('« 50 » / « EU 50 » / « 51 » → « 50 et plus » (pointures)', () => {
  assert.equal(tailleDansGrille('50', POINTURES)?.valeur, '50 et plus');
  assert.equal(tailleDansGrille('51', POINTURES)?.valeur, '50 et plus');
  assert.equal(juger('EU 50', POINTURES, 'shoe_size').valeurListe, '50 et plus');
  assert.equal(juger('49,5', POINTURES, 'shoe_size').valeurListe, '49,5');
  // ⛔ Borne : « EU 99 » n'est pas une pointure — jamais « 50 et plus », c'est la question.
  assert.equal(tailleDansGrille('59', POINTURES), null);
  assert.equal(juger('EU 99', POINTURES, 'shoe_size').dans, false);
  assert.equal(tailleDansGrille('58', POINTURES)?.valeur, '50 et plus');
});
t('plus jamais « va de 16 à 49,5 : 50 n\'y figure pas »', () => {
  assert.equal(pointureHorsGrille({ platform: 'leboncoin', key: 'shoe_size', value: '50', allowedValues: POINTURES }), null);
  assert.equal(pointureHorsGrille({ platform: 'leboncoin', key: 'shoe_size', value: '52', allowedValues: POINTURES }), null);
  // Le bas de la grille, lui, reste dit.
  assert.match(pointureHorsGrille({ platform: 'leboncoin', key: 'shoe_size', value: '15', allowedValues: POINTURES })?.motif ?? '', /va de 16 à 50/);
});
t('« 8XL » → « 8XL et plus » (homme) / « 56 - 8XL et plus » (femme) ; « 58 » → le palier femme', () => {
  assert.equal(tailleDansGrille('8XL', HOMME)?.valeur, '8XL et plus');
  assert.equal(tailleDansGrille('8XL', FEMME)?.valeur, '56 - 8XL et plus');
  assert.equal(tailleDansGrille('58', FEMME)?.valeur, '56 - 8XL et plus');
  assert.equal(tailleDansGrille('50', FEMME)?.valeur, '50 - 5XL');
});

console.log('2. Les lettres autrement écrites (« LG » d\'assopmfrance)');
t('LG/LRG → L, SM/SML → S, MD/MED → M, XLG → XL, XSM → XS', () => {
  for (const [v, l] of [['LG', 'L'], ['lrg', 'L'], ['SM', 'S'], ['Sml', 'S'], ['MD', 'M'], ['MED', 'M'], ['XLG', 'XL'], ['XSM', 'XS'], ['X LARGE', 'XL']]) {
    assert.equal(tailleDansGrille(v, HOMME)?.valeur, l, v);
  }
});
t('⛔ jamais un nombre changé en lettre (« 38 », « 50 » dans la grille homme)', () => {
  assert.equal(tailleDansGrille('38', HOMME), null);
  assert.equal(tailleDansGrille('50', HOMME), null);
  assert.equal(tailleDansGrille('FR 52', HOMME), null);
});

console.log('3. Une taille de vêtement n\'est jamais une pointure (la robe « 5XL / 50 / 22 » de vetis.shop)');
t('porteUneLettreDeVetement', () => {
  assert.equal(porteUneLettreDeVetement('5XL / 50 / 22'), true);
  assert.equal(porteUneLettreDeVetement('M'), true);
  assert.equal(porteUneLettreDeVetement('EU 38'), false);
  assert.equal(porteUneLettreDeVetement('38,5'), false);
});
t('pointure : refusée, et le rayon est mis en cause', () => {
  assert.equal(juger('5XL / 50 / 22', POINTURES, 'shoe_size').dans, false);
  assert.match(pointureHorsGrille({ platform: 'leboncoin', key: 'shoe_size', value: '5XL / 50 / 22', allowedValues: POINTURES })?.motif ?? '', /taille de vêtement, pas une pointure/);
  // Sur un vêtement, la même taille passe toujours.
  assert.equal(juger('5XL / 50 / 22', FEMME, 'clothing_st').valeurListe, '50 - 5XL');
});

console.log('4. La grille de l\'UNIVERS (Femme, Homme, Enfant), la même pour l\'écran, la carte et le serveur');
t('grilles relevées : Homme = la grille de la règle serveur', () => {
  assert.equal(GRILLES_LBC_TAILLE_VETEMENTS.Homme, GRILLE_LBC_HOMME);
  assert.equal(grilleTailleLbcDeLUnivers({ chemin: 'Mode > Vêtements', univers: 'Femme' }), FEMME);
  assert.equal(grilleTailleLbcDeLUnivers({ chemin: ['Mode', 'Vêtements'], univers: 'Enfant' }), ENFANT);
  assert.equal(grilleTailleLbcDeLUnivers({ chemin: 'Mode > Vêtements', univers: 'Maternité' }), null);
  assert.equal(grilleTailleLbcDeLUnivers({ chemin: 'Mode > Chaussures', univers: 'Homme' }), null);
});
const UNIVERS = { field_key: 'clothing_type', field_label: 'Univers', required: true, input_type: 'combobox', allowed_values: ['Femme', 'Maternité', 'Homme', 'Enfant'] };
t('lignes : synthétique seulement si la copie PORTE une taille ; ligne du catalogue remplacée', () => {
  const avec = lignesLbcAvecGrilleDeLUnivers({ chemin: 'Mode > Vêtements', lignes: [UNIVERS], univers: 'Homme', taille: '50' });
  const st = avec.find((l) => l.field_key === 'clothing_st');
  assert.deepEqual(st?.allowed_values, [...HOMME]);
  assert.equal(st?.input_type, 'combobox');
  assert.equal(lignesLbcAvecGrilleDeLUnivers({ chemin: 'Mode > Vêtements', lignes: [UNIVERS], univers: 'Homme', taille: '' }).length, 1);
  const cat = [UNIVERS, { field_key: 'clothing_st', field_label: 'Taille', required: true, input_type: 'combobox', allowed_values: [...FEMME] }];
  assert.deepEqual(lignesLbcAvecGrilleDeLUnivers({ chemin: 'Mode > Vêtements', lignes: cat, univers: 'Homme', taille: 'L' })[1].allowed_values, [...HOMME]);
  assert.equal(lignesLbcAvecGrilleDeLUnivers({ chemin: 'Mode > Chaussures', lignes: [UNIVERS], univers: 'Homme', taille: '50' }).length, 1);
});
t('carte du rayon : Homme « 50 » = la question AVANT l\'envoi ; Femme « 50 » et Homme « LG » passent', () => {
  const carte = (univers, taille) => classerChamps([UNIVERS], { univers, taille }, 'leboncoin', { regle: 'nouvelle', cheminCategorie: ['Mode', 'Vêtements'] });
  assert.deepEqual(carte('Homme', '50').questions.map((q) => [q.cle, q.horsGrille === true]), [['clothing_st', true]]);
  assert.equal(carte('Femme', '50').questions.length, 0);
  assert.equal(carte('Homme', 'LG').questions.length, 0);
  assert.equal(carte('Homme', '').questions.length, 0);
});
t('le JOB part écrit comme la grille de l\'univers (Femme « 50 » → « 50 - 5XL », Homme « LG » → « L »)', () => {
  const ligne = (g) => [{ key: 'clothing_st', allowedValues: [...g] }];
  assert.equal(tailleDuJob({ platform: 'leboncoin', taille: '50', lignes: ligne(FEMME), cheminCategorie: ['Mode', 'Vêtements'] }), '50 - 5XL');
  assert.equal(tailleDuJob({ platform: 'leboncoin', taille: 'LG', lignes: ligne(HOMME), cheminCategorie: ['Mode', 'Vêtements'] }), 'L');
  assert.equal(tailleDuJob({ platform: 'leboncoin', taille: '50', lignes: [{ key: 'shoe_size', allowedValues: POINTURES }], cheminCategorie: ['Mode', 'Chaussures'] }), '50 et plus');
});
t('serveur (tailleLbcHomme) : LG → L, 8XL → 8XL et plus ; « 38 » reste la question ; « M / 38 / 10 » → M', () => {
  const s = (taille) => tailleLbcHomme({ taille, univers: 'Homme', chemin: 'Mode > Vêtements' });
  assert.equal(s('LG')?.valeur, 'L');
  assert.equal(s('8XL')?.valeur, '8XL et plus');
  assert.equal(s('38')?.question, true);
  assert.equal(s('M / 38 / 10')?.valeur, 'M');
  assert.equal(s('L'), null);
});

console.log('5. Le contrôle automatique : nos listes face aux leurs');
t('écarts d\'une grille figée (manquante, en trop, ordre, sans relevé)', () => {
  const e = ecartsGrillesParUnivers({ figees: { Homme: ['S', 'M', 'L'], Femme: ['36 - S'], Enfant: ['3 ans / 98 cm'] }, releves: [
    { univers: 'Homme', options: ['S', 'M'], le: '2026-11-20' }, { univers: 'Homme', options: ['S', 'M', 'L', 'XL'], le: '2026-11-21' },
    { univers: 'Femme', options: ['36 - S'], le: '2026-11-21' }] });
  assert.deepEqual(e.find((x) => x.univers === 'Homme')?.manquantes, ['XL']);
  assert.equal(e.some((x) => x.univers === 'Femme'), false);
  assert.equal(e.find((x) => x.univers === 'Enfant')?.sansReleve, true);
  const o = ecartsGrillesParUnivers({ figees: { Homme: ['M', 'S'] }, releves: [{ univers: 'Homme', options: ['S', 'M'], le: 'x' }] });
  assert.equal(o[0].ordre, true);
  const trop = ecartsGrillesParUnivers({ figees: { Homme: ['S', 'M', '9XL'] }, releves: [{ univers: 'Homme', options: ['S', { label: 'M' }], le: 'x' }] });
  assert.deepEqual(trop[0].enTrop, ['9XL']);
});
t('libellés absents ; listes dépendantes (avec et sans regroupement)', () => {
  assert.deepEqual(libellesAbsents({ libelles: ['3 mois / 62 cm', '7 mois'], valeursRelevees: ['3 mois / 62 cm'] }), ['7 mois']);
  const d = champsAListesDependantes([
    { categorie: 'Maison & Jardin > Bricolage', champ: 'diy_product', options: ['a', 'b'], n: 5 },
    { categorie: 'Maison & Jardin > Bricolage', champ: 'diy_product', options: ['c'], n: 3 },
    { categorie: 'Mode > Vêtements', champ: 'clothing_st', univers: 'Homme', options: ['S'], n: 9 },
    { categorie: 'Mode > Vêtements', champ: 'clothing_st', univers: 'Femme', options: ['36 - S'], n: 9 },
    { categorie: 'X', champ: 'y', options: ['1'] }, { categorie: 'X', champ: 'y', options: ['2'] }]);
  assert.deepEqual(d.map((x) => `${x.categorie}|${x.champ}|${x.grilles}`), ['Maison & Jardin > Bricolage|diy_product|2']);
});

console.log(`\n${ok} vérifications vertes — lot du 21/11, point 1 (tailles Leboncoin).`);
