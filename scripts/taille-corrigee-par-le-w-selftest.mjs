// selftest:taille-corrigee-par-le-w — (24/10, décision 1 de Nico) Un tour de taille n'est jamais reposté comme une
// taille française. Une republication recopie la taille de l'ancienne copie ; celles d'avant le 23/10 portaient le W
// ou la longueur d'un jean en « taille française » (« W34 L34 (44) » → « 34 », un XS). Pour un bas au W certain, ce
// nombre est servi en taille française du W (table publiée par Vinted) ; rien d'autre ne change.
//   1. Les vrais cas (Levi's 517 de recrutementgroupezk704, jean de Johan) ;
//   2. tout ce qui ne change JAMAIS (autre nombre, lettre, sans W certain, deux W, ambigu, hors table, chaussure…) ;
//   3. get-pending-jobs : branché avant la conversion Leboncoin, Beebs et Leboncoin, publication et republication,
//      copie servie seulement (jamais la base), trace posée.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (p) => fs.readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');
const imp = (p) => import(pathToFileURL(join(ROOT, p)).href);
const M = await imp('supabase/functions/_shared/taille-corrigee-par-le-w.js');
let n = 0;
const ok = (cond, msg, detail = '') => { assert.ok(cond, `${msg}${detail ? ` — ${detail}` : ''}`); n++; console.log(`  ✓ ${msg}`); };
const c = (p) => M.tailleCorrigeeParLeW(p);
const val = (p) => c(p)?.valeur ?? null;

const LEVIS_517 = "Jeans Levi's Homme 517 coupe Bootcut  braguette surpiqûres en arc de cercle bleu W34 L34 (44) j509";
const JOHAN = "Jean Levi's 501 bleu délavé taille 33/34";
const CH_BEEBS = ['Mode', 'Homme', 'Vêtements (homme)', 'Jeans (homme)', 'Autres jeans (homme)'];

console.log('1. Les vrais cas');
const r517 = c({ tailleCopie: '34', ficheTaille: { v: 'L', source: 'releve_leboncoin' }, textes: [LEVIS_517], chemin: CH_BEEBS });
ok(r517?.valeur === '44' && r517.w === 34 && r517.source === 'texte', 'Levi\'s 517 (Beebs 34165464) : « 34 » → « 44 » (W34 lu au titre)', JSON.stringify(r517));
ok(/le tour de taille d'un W34/.test(r517.motif) && /W34 = FR 44/.test(r517.motif), 'le motif dit pourquoi');
const rJ = c({ tailleCopie: '34', ficheTaille: { v: 'W34 | FR 44', source: 'manuel' }, textes: [JOHAN] });
ok(rJ?.valeur === '44' && rJ.source === 'fiche', 'Johan : sa réponse « W34 | FR 44 » l\'emporte sur le « 33/34 » du titre → « 44 »', JSON.stringify(rJ));
ok(val({ tailleCopie: '34', textes: [JOHAN] }) === '42', 'sans réponse : « 33/34 » = W33, « 34 » est la longueur → « 42 »');
ok(val({ tailleCopie: 'FR 34', ficheTaille: 'W34 | FR 44', textes: [JOHAN] }) === '44', '« FR 34 » aussi');
ok(val({ tailleCopie: '28', textes: ['Jean femme slim W28 L32'] }) === '38', 'jean femme : « 28 » (le W) → « 38 »');
ok(val({ tailleCopie: '32', textes: ['Jean femme slim W28 L32'] }) === '38', 'jean femme : « 32 » (la longueur) → « 38 »');

console.log('2. Ce qui ne change jamais');
ok(c({ tailleCopie: '44', ficheTaille: 'W34 | FR 44', textes: [JOHAN] }) === null, 'déjà la taille française du W');
ok(c({ tailleCopie: '42', ficheTaille: 'W34 | FR 44', textes: [JOHAN] }) === null, 'un autre nombre : le choix de la personne');
ok(c({ tailleCopie: 'L', textes: [LEVIS_517] }) === null && c({ tailleCopie: 'W34', textes: [LEVIS_517] }) === null
  && c({ tailleCopie: '', textes: [LEVIS_517] }) === null, 'une lettre, un W, rien');
ok(c({ tailleCopie: '34', textes: ['Pull en laine taille 34'] }) === null, 'pas un bas');
ok(c({ tailleCopie: '34', textes: ['Bottes en cuir pointure 34, jean assorti W34'] }) === null, 'une chaussure');
ok(c({ tailleCopie: '34', textes: ['Jean droit taille 34'] }) === null, 'aucun W certain');
ok(c({ tailleCopie: '34', textes: ['Lot de deux jeans W30 et W34'] }) === null, 'deux W différents');
ok(c({ tailleCopie: '34', textes: ['Jean taille 32/34'] }) === null, '« 32/34 » : ambigu (fourchette FR ou W32 L34)');
ok(c({ tailleCopie: '37', textes: ['Jean W37 L32'] }) === null, 'W hors table publiée');
ok(c({ tailleCopie: '34', ficheTaille: '32/34', textes: ['Jean W34'] }) === null, 'réponse ambiguë : rien');
ok(c({ tailleCopie: '34' }) === null && c({}) === null, 'sans texte ni fiche');

console.log('3. get-pending-jobs');
const gpj = lire('supabase/functions/get-pending-jobs/index.ts');
const iRegle = gpj.indexOf('UN TOUR DE TAILLE N\'EST JAMAIS REPOSTÉ COMME UNE TAILLE FRANÇAISE');
const iLbc = gpj.indexOf('LEBONCOIN : UN TOUR DE TAILLE SERVI EN TAILLE FRANÇAISE');
ok(gpj.includes('import { tailleCorrigeeParLeW } from "../_shared/taille-corrigee-par-le-w.js";'), 'importée');
ok(iRegle > 0 && iLbc > iRegle, 'branchée avant la conversion Leboncoin du tour de taille');
const bloc = gpj.slice(iRegle, iLbc);
ok(/\["beebs", "leboncoin"\]\.includes/.test(bloc) && /\["publish", "republish"\]\.includes/.test(bloc), 'Beebs et Leboncoin, publication et republication');
ok(bloc.includes('taille_corrigee_par_le_w') && bloc.includes('pose_par: "get-pending-jobs"'), 'la trace est posée sur la copie servie');
ok(!/\.update\(|\.insert\(|\.upsert\(|\.rpc\(/.test(bloc), 'jamais une écriture en base : la copie servie seulement');
ok(/catch \(e\)/.test(bloc) && bloc.includes('copies servies telles quelles'), 'une erreur de lecture sert la file telle quelle');

console.log(`\n✓ taille-corrigee-par-le-w : ${n} contrôles verts`);
