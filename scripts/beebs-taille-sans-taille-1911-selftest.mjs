// VERROU (19/11/2026 soir, point 6 de Nico — « zéro friction Beebs ») : un bijou et une montre n'ont pas de taille de
// vêtement ; Beebs exige pourtant une « Taille ». Les deux cas du 19/11 (champ_requis_bloquant « Taille ») :
//   · boncoin59300, 16:17, « Bijoux (femme) » : « Bracelet ruban noir … » dont la description dit « ( anneau) » (une maille),
//     taille partagée « Unique » → la règle voyait « anneau » = bague → la question ; maintenant l'objet nommé EN TÊTE
//     (bracelet) décide → « Ajustable » (la grille de Beebs n'a pas « Taille unique » : jamais une valeur hors liste) ;
//   · sebastien64310, 16:52, « Montres (homme) » : taille partagée « 42 », aucun diamètre écrit → la question ; maintenant
//     « Taille unique » de la grille (règle f rejouée sur une valeur hors grille).
// Rouge sur e331f8e, vert après. Les grilles sont celles de platform_category_aspects (prod, lues le 19/11).
import { tailleUniqueHorsGrille, tailleBijouBeebsAuto } from '../supabase/functions/_shared/champs-requis-auto.js';

let echecs = 0, total = 0;
const ok = (c, m) => { total++; if (c) console.log(`  ✓ ${m}`); else { echecs++; console.log(`  ✗ ${m}`); } };
const BIJOUX = ['14,1 mm', '14,5 mm', '14,9 mm', '15,3 mm', '15,7 mm', '16,1 mm', '16,5 mm', '16,9 mm', '17,3 mm', '17,7 mm', '18,1 mm', '18,5 mm', '19 mm',
  '19,4 mm', '19,8 mm', '20,2 mm', '20,6 mm', '21 mm', '21,4 mm', '21,8 mm', '22,2 mm', '22,6 mm', 'Ajustable'];
const MONTRES = ["Jusqu'à 30 mm", '31 mm - 38 mm', '39 mm - 42 mm', '43 mm - 46 mm', '47 mm et plus', 'Taille unique'];
const cheminB = ['Mode', 'Femme', 'Accessoires (femme)', 'Bijoux (femme)'];
const cheminM = ['Mode', 'Homme', 'Accessoires (homme)', 'Montres (homme)'];
const bracelet = ['Bracelet ruban noir or jaune et coeur nacre 0,03g OR 750/0oo Jaune',
  'Bracelet ruban noir or jaune et coeur nacre 0,03g OR 750/0oo Jaune. Bracelet ruban noir cœur en nacré et or jaune 750/1000 ( anneau) 0.3g Certificat fourni'];
const montre = ["Montre Vintage Tintin et Milou L'Affaire Tournesol - Citime Editions / Hergé T.L",
  'Montre vintage de collection sur le thème des Aventures de Tintin et Milou. Cadran illustré représentant Tintin et Milou sur fond vert/noir. Gravure au dos du boîtier en acier inoxydable.'];

const b = tailleUniqueHorsGrille({ valeur: 'Unique', chemin: cheminB, textes: bracelet, allowedValues: BIJOUX });
ok(b?.valeur === 'Ajustable', `bracelet « ( anneau) » + « Unique » → « Ajustable » (${b?.valeur ?? 'question'})`);
ok(tailleBijouBeebsAuto({ chemin: cheminB, textes: bracelet, allowedValues: BIJOUX })?.valeur === 'Ajustable', 'le même bracelet, case vide → « Ajustable »');
ok(tailleBijouBeebsAuto({ chemin: cheminB, textes: ['Bague or jaune 750', 'Jolie bague, anneau fin'], allowedValues: BIJOUX }) === null, 'une BAGUE garde sa question');
ok(tailleBijouBeebsAuto({ chemin: cheminB, textes: ['Bracelet et bague assortis', ''], allowedValues: BIJOUX }) === null, 'une bague nommée en tête avec un bracelet : la question');
ok(tailleBijouBeebsAuto({ chemin: cheminB, textes: ['Parure collier bracelet', ''], allowedValues: BIJOUX }) === null, 'une parure : la question');
ok(BIJOUX.includes(b?.valeur), 'toujours une valeur de la liste de Beebs');

const m = tailleUniqueHorsGrille({ valeur: '42', chemin: cheminM, textes: montre, allowedValues: MONTRES });
ok(m?.valeur === 'Taille unique', `montre « 42 » sans diamètre écrit → « Taille unique » (${m?.valeur ?? 'question'})`);
const d = tailleUniqueHorsGrille({ valeur: '42', chemin: cheminM, textes: ['Montre Casio', 'Boîtier 44 mm, bracelet 20 mm'], allowedValues: MONTRES });
ok(d?.valeur === '43 mm - 46 mm', `diamètre ÉCRIT collé au boîtier (44 mm) → sa tranche (${d?.valeur ?? 'question'})`);
ok(tailleUniqueHorsGrille({ valeur: '42', chemin: cheminM, textes: ['Montre', 'boîtier 40 mm, cadran 44 mm'], allowedValues: MONTRES }) === null, 'deux diamètres différents : la question');
ok(tailleUniqueHorsGrille({ valeur: '42', chemin: cheminM, textes: montre, allowedValues: MONTRES.filter((x) => x !== 'Taille unique') }) === null,
  'une grille sans « Taille unique » : jamais une valeur hors liste, la question');
ok(tailleUniqueHorsGrille({ valeur: '39 mm - 42 mm', chemin: cheminM, textes: montre, allowedValues: MONTRES }) === null, 'une valeur DE la grille n\'est jamais recouverte');
ok(tailleUniqueHorsGrille({ valeur: 'M', chemin: ['Mode', 'Femme', 'Vêtements (femme)', 'Robes'], textes: ['Robe'], allowedValues: ['S', 'M', 'L'] }) === null, 'un vêtement : rien ne change');

console.log(echecs ? `✗ beebs-taille-sans-taille-1911 : ${total - echecs}/${total}` : `✓ beebs-taille-sans-taille-1911 : ${total}/${total}`);
process.exit(echecs ? 1 : 0);
