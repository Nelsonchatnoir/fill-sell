// selftest:doublon-attribut-distinctif — (11/10, Louis) « Est-ce le même
// article ? » en boucle : un attribut distinctif différent (couleur, nombre qui
// dit l'objet, taille) écarte la paire d'office ; deux fiches vraiment
// identiques restent posées en question.
//   1. le verdict JS (_shared/rapprochement/texte.js attributDistinctif) ;
//   2. la parité JS ↔ SQL (mig 20261011190000 : mêmes couleurs, nuances, voisines) ;
//   3. la garde en base : AVANT insertion, journalisée, copies exclues, reclassement sauvegardé ;
//   4. l'écran : le vrai nombre restant, le bandeau « Noté » rattaché à la paire précédente.
// Le moteur (même photo, couleur ou taille différente → ni question ni fusion)
// est éprouvé par selftest:moteur-rattachement et selftest:fiche-main-vinted.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { attributDistinctif, D_BASES, D_NUANCES, D_VOISINES } from '../supabase/functions/_shared/rapprochement/texte.js';

const ici = path.dirname(fileURLToPath(import.meta.url));
const lire = (p) => fs.readFileSync(path.join(ici, '..', p), 'utf8').replace(/\r\n/g, '\n');
let n = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); n++; console.log(`  ✓ ${msg}`); };

console.log('1. Le verdict');
const cas = [
  ['Rangement Gris et Rose pour 12 pots et 12 couvercles pour yaourtière Multidélices', 'Rangement Noir et Rose pour 12 pots et 12 couvercles pour yaourtière Multidélices', 'couleur', 'Louis : Gris et Rose / Noir et Rose (une couleur commune) → deux articles'],
  ['Support de rangement Gris et Noir pots et couvercles', 'Rangement Gris et Marron pour 12 pots et 12 couvercles', 'couleur', 'Gris et Noir / Gris et Marron → deux articles'],
  ['Rangement Noir et Orange pour 12 pots', 'Rangement Noir et Vert Pomme pour 12 pots', 'couleur', 'Noir et Orange / Noir et Vert Pomme → deux articles'],
  ['Pull gris', 'Pull noir', 'couleur', 'gris / noir (deux couleurs de base) → deux articles'],
  ['Pull anthracite', 'Pull noir', null, 'anthracite ~ noir (nuance voisine) → doute possible, jamais écarté'],
  ['Robe fleurie rouge', 'Robe rouge', null, 'mêmes couleurs → rien d\'écarté'],
  ['Rangement Gris et Rose pour 12 pots', 'Rangement Gris et Rose pour 12 pots', null, 'titres identiques → la question reste (vrai doute)'],
  ['Rangement Rouge et Noir pour 12 pots', 'Rangement Noir et Rouge pour 12 pots', null, 'mêmes couleurs dans un autre ordre → rien d\'écarté'],
  ['Lot de 3 bodies', 'Lot de 5 bodies', 'nombre', 'lot de 3 / lot de 5 → deux articles'],
  ['Rangement pour 6 pots', 'Rangement pour 12 pots', 'nombre', '6 pots / 12 pots → deux articles'],
  ['Casio G-Shock GA-2100 noir', 'Casio G-Shock GA-B2100 noir', 'nombre', 'référence GA-2100 / GA-B2100 → deux articles'],
  ['Jean Levi\'s 501 W32', 'Jean Levi\'s 501 W34', 'nombre', 'W32 / W34 → deux articles'],
  ['Parfum 50 ml', 'Parfum 100 ml', 'nombre', 'contenance 50 / 100 ml → deux articles'],
  ['0620 - Lot de 3 magazines', '1004 - Lot de 3 magazines', null, 'codes de rangement en tête (0620 / 1004) : jamais lus'],
  ['Robe taille 38', 'Robe taille 38 neuve', null, 'même taille → rien d\'écarté'],
  ['Robe multicolore', 'Robe bleue', null, 'multicolore : la couleur ne se juge pas'],
];
for (const [a, b, attendu, msg] of cas) ok(attributDistinctif(a, b) === attendu, `${msg} [${attributDistinctif(a, b)}]`);

console.log('2. Parité JS ↔ SQL (mig 20261011190000)');
const mig = lire('supabase/migrations/20261011190000_doublons_attribut_distinctif.sql');
const jsonSql = (nom) => {
  const m = mig.match(new RegExp(`${nom} jsonb := '(\\{[\\s\\S]*?\\})'::jsonb`));
  assert.ok(m, `table ${nom} introuvable dans la migration`);
  return JSON.parse(m[1]);
};
const memes = (a, b) => JSON.stringify(Object.fromEntries(Object.entries(a).sort().map(([k, v]) => [k, [...v].sort()])))
  === JSON.stringify(Object.fromEntries(Object.entries(b).sort().map(([k, v]) => [k, [...v].sort()])));
ok(memes(jsonSql('v_dico'), D_BASES), 'couleurs de base identiques (SQL v_dico = JS D_BASES)');
ok(memes(jsonSql('v_nuances'), D_NUANCES), 'nuances identiques (SQL v_nuances = JS D_NUANCES)');
ok(memes(jsonSql('v_voisines'), D_VOISINES), 'voisines identiques (SQL v_voisines = JS D_VOISINES)');

console.log('3. La garde en base');
ok(/CREATE TRIGGER trg_inventaire_doublons_attribut_distinctif\s+BEFORE INSERT ON public\.inventaire_doublons/.test(mig), 'garde AVANT insertion (aucune fiche « à vérifier » sans question)');
ok(/INSERT INTO doublons_ecartes_par_regle[\s\S]*?RETURN NULL;\s+-- pas de question/.test(mig), 'question écartée = pas posée, et journalisée');
ok(/NEW\.motif = 'copie_non_prouvee'[\s\S]*?RETURN NEW;/.test(mig), 'les copies d\'une vente (« Déjà vendu ? ») ne sont pas concernées');
ok(/EXCEPTION WHEN OTHERS THEN[\s\S]*?RETURN NEW;\s+-- jamais bloquant/.test(mig), 'une erreur de la règle ne bloque jamais : la question reste posée');
ok(/'plusieurs_exemplaires'/.test(mig) && /COALESCE\(a\.quantite, 1\) > 1/.test(mig), 'fiche vendue face à une fiche à plusieurs exemplaires : écartée');
ok(/d\.decide_par = 'utilisateur'[\s\S]*?v_refus >= 2 THEN RETURN 'variantes_deja_refusees'/.test(mig), 'rafale : ≥ 2 « non » de la personne + titres différents → plus de nouvelle paire');
ok(/INSERT INTO public\._backup_1110_doublons_attribut_distinctif/.test(mig) && /SET statut = 'refusee', decide_par = 'regle'/.test(mig), 'reclassement des paires ouvertes : sauvegardé, effet d\'un « Non » (jamais une fusion)');
ok(!/statut = 'fusionnee'/.test(mig), 'jamais aucune fusion automatique');
const inv = lire('supabase/rollbacks/20261011190000_doublons_attribut_distinctif_INVERSE.sql');
ok(/DROP TRIGGER IF EXISTS trg_inventaire_doublons_attribut_distinctif/.test(inv) && /FROM public\._backup_1110_doublons_attribut_distinctif b/.test(inv), 'inverse prêt (garde retirée, paires restaurées)');
const moteur = lire('supabase/functions/_shared/rapprochement/moteur.js');
ok(/d\.decide_par !== 'regle'/.test(moteur), 'le moteur tient une paire close par la règle pour un « non » définitif');

console.log('4. L\'écran « Est-ce le même article ? »');
const ecran = lire('src/annonces/EcranDoublons.jsx');
ok(!/`1 sur \$\{file\.length\}`/.test(ecran) && /questions restantes/.test(ecran), 'le compteur dit le vrai nombre restant (plus « 1 sur N »)');
ok(/Paire précédente — \$\{fait\}/.test(ecran) && /setTimeout\(\(\) => setFait\(null\), 4000\)/.test(ecran), 'le bandeau « Noté » dit qu\'il concerne la paire précédente, puis s\'efface');

console.log(`\n✓ doublon-attribut-distinctif : ${n} contrôles verts`);
