// ═══════════════════════════════════════════════════════════════════════════
// VERROU — lot du 21/11/2026, point 3 : une republication Leboncoin ne s'arrête plus sur un champ que la structure de
// Leboncoin donne (Butin d'Or : « Leboncoin exige « Univers » », annonces en ligne SANS Univers)
// ═══════════════════════════════════════════════════════════════════════════
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { valeurParDependance } from '../supabase/functions/_shared/lbc-valeur-par-dependance.js';

let ok = 0;
const t = (nom, f) => { f(); ok++; console.log(`  ✓ ${nom}`); };
// Les listes RÉELLES relevées chez Leboncoin (lbc_grilles_relevees, 21/11) : le Produit selon l'Univers.
const K = 'children_room_furniture_universe';
const RELEVES = [
  { field_key: 'children_room_furniture_product', contexte: { [K]: 'Hygiène et Santé' }, options: ['Baignoire', 'Barrière de sécurité', 'Poubelle à couches', 'Sécurité domestique', 'Table à langer', 'Autre'] },
  { field_key: 'children_room_furniture_product', contexte: { [K]: 'Eveil' }, options: ["Tapis d'éveil", 'Tipi et cabane', "Tour d'observation", 'Transat & balancelle', 'Trotteur et charriot', 'Autre'] },
  { field_key: 'children_room_furniture_product', contexte: { [K]: 'Autres' }, options: ['Autre'] },
];
const KB = 'baby_equipment_universe';
const RELEVES_BEBE = [
  { field_key: 'baby_equipment_type', contexte: { [KB]: 'Alimentation' }, options: ['Bavoir', 'Biberon', 'Chauffe-biberon', 'Autre'] },
  { field_key: 'baby_equipment_type', contexte: { [KB]: 'Sommeil' }, options: ['Gigoteuse', "Nid d'ange", 'Autre'] },
];

console.log('1. La valeur exigée se lit dans les listes dépendantes de Leboncoin');
t('« Table à langer » → Univers « Hygiène et Santé » (Butin d\'Or, 08:54)', () => {
  const d = valeurParDependance({ cle: K, aspects: { children_room_furniture_product: 'Table à langer', furniture_color: 'Blanc' }, releves: RELEVES });
  assert.equal(d?.valeur, 'Hygiène et Santé');
  assert.match(d.preuve, /Table à langer/);
});
t('un produit qu\'aucune liste relevée ne porte (« Porte-bébé… », 09:36) : rien — la question reste', () => {
  assert.equal(valeurParDependance({ cle: KB, aspects: { baby_equipment_type: 'Porte-bébé et écharpe de portage' }, releves: RELEVES_BEBE }), null);
});
t('« Autre » ne désigne rien (il est sous chaque univers)', () => {
  assert.equal(valeurParDependance({ cle: K, aspects: { children_room_furniture_product: 'Autre' }, releves: RELEVES }), null);
});
t('deux univers possibles, ou deux valeurs qui se contredisent : rien', () => {
  const doubles = [...RELEVES, { field_key: 'children_room_furniture_product', contexte: { [K]: 'Chambre' }, options: ['Table à langer', 'Lit'] }];
  assert.equal(valeurParDependance({ cle: K, aspects: { children_room_furniture_product: 'Table à langer' }, releves: doubles }), null);
  const contradiction = [...RELEVES, { field_key: 'furniture_color', contexte: { [K]: 'Eveil' }, options: ['Blanc', 'Noir'] }];
  assert.equal(valeurParDependance({ cle: K, aspects: { children_room_furniture_product: 'Table à langer', furniture_color: 'Blanc' }, releves: contradiction }), null);
});
t('une valeur hors des valeurs permises du champ : rien', () => {
  assert.equal(valeurParDependance({ cle: K, aspects: { children_room_furniture_product: 'Table à langer' }, releves: RELEVES, valeursPermises: ['Chambre', 'Eveil'] }), null);
  assert.equal(valeurParDependance({ cle: K, aspects: { children_room_furniture_product: 'Table à langer' }, releves: RELEVES, valeursPermises: ['Chambre', 'Hygiène et Santé'] })?.valeur, 'Hygiène et Santé');
});

console.log('2. Le serveur (get-pending-jobs) : seulement une republication arrêtée sur un champ à choisir, puis elle repart');
t('branché, borné, relancé seulement si le champ bloquant est celui qu\'on vient de lire', () => {
  const g = fs.readFileSync(new URL('../supabase/functions/get-pending-jobs/index.ts', import.meta.url), 'utf8');
  assert.match(g, /import \{ valeurParDependance \} from "\.\.\/_shared\/lbc-valeur-par-dependance\.js";/);
  assert.match(g, /const bloqueeSurUnChamp = \(j as \{ status\?: unknown \}\)\.status === "needs_user" && String\(pf\["needs_user_source"\] \?\? ""\) === "champ_a_choisir";/);
  assert.match(g, /\.from\("lbc_grilles_relevees"\)\.select\("field_key, contexte, options"\)[\s\S]{0,200}\.limit\(400\)/);
  assert.match(g, /deduits\.includes\(String\(nufJ\["field_key"\] \?\? ""\)\)/);
  assert.match(g, /String\(pf\["republish_step"\] \?\? ""\) === "captured" && !pf\["deleted_at"\]/);
  assert.match(g, /if \(relancerLbcDeduits\.has\(String\(j\.id\)\) && !estHorsLigne\) \{/);
});

console.log(`\n${ok} vérifications vertes — lot du 21/11, point 3 (champ exigé lu chez Leboncoin).`);
