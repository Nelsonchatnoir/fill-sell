// Verrou du 14/11/2026 soir (cliente af37fa49, point 1c de Nico) : le « Me connecter » de 17:49 s'est ouvert (« ouvert »,
// visible) sans qu'aucune connexion ne parte — il a fallu DÉDUIRE de la carte du Stock remontée à 17:49:32 que l'écran
// avait été refermé 15 s plus tard sans aucun toucher. Désormais :
//   1. chaque toucher d'une ligne (Vinted, Leboncoin, Beebs, Depop, eBay) est tracé « cloud_me_connecter_ligne_clic »
//      AVANT l'ouverture de la page de connexion ;
//   2. la fermeture de l'écran est tracée « cloud_me_connecter_ferme » : durée, lignes touchées, aucune_touchee ;
//   3. bilanFermetureMeConnecter (pur) rend ce bilan.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => readFileSync(path.join(racine, f), 'utf8').replace(/\r\n/g, '\n');
let n = 0, ko = 0;
const ok = (c, m) => { n++; if (c) console.log(`  ✓ ${m}`); else { ko++; console.log(`  ✗ ${m}`); } };

console.log('1. Le bilan de fermeture (pur)');
let bilan = null;
try { ({ bilanFermetureMeConnecter: bilan } = await import(pathToFileURL(path.join(racine, 'src/cloud/connexionsCloud.js')).href)); } catch (e) { console.log(`  (import : ${e.message})`); }
ok(typeof bilan === 'function', 'bilanFermetureMeConnecter existe');
if (typeof bilan === 'function') {
  const cas1749 = bilan({ ouvertLe: Date.parse('2026-11-14T16:49:17Z'), fermeLe: Date.parse('2026-11-14T16:49:32Z'), touchees: [], origine: 'carte_stock' });
  ok(JSON.stringify(cas1749) === JSON.stringify({ duree_s: 15, touchees: [], aucune_touchee: true, origine: 'carte_stock' }), `17:49 : 15 s, aucune ligne touchée (${JSON.stringify(cas1749)})`);
  const cas1717 = bilan({ ouvertLe: 1000, fermeLe: 37_400, touchees: ['beebs', 'beebs'] });
  ok(cas1717.duree_s === 36 && cas1717.touchees.join() === 'beebs' && cas1717.aucune_touchee === false && !('origine' in cas1717), 'une ligne touchée deux fois : comptée une fois, sans origine inventée');
  ok(bilan({}).duree_s === null && bilan({ ouvertLe: 5, fermeLe: 1 }).duree_s === null, 'instants absents ou à l’envers : durée nulle, jamais un nombre faux');
}

console.log('\n2. L\'écran trace chaque toucher de ligne AVANT d\'ouvrir la connexion, et sa fermeture');
const me = lire('src/cloud/MeConnecterCloud.jsx');
ok(/tracerCloud\(userId, 'cloud_me_connecter_ligne_clic', \{ plateforme: p\.id, etat/.test(me), 'trace « cloud_me_connecter_ligne_clic » (plateforme, état)');
ok(/toucherLigne\(q, verif \?\? etatConnexion\(etats\?\.\[p\.id\]\)\); setOuverte\(q\);/.test(me), 'une ligne de plateforme : tracée puis ouverte (dans cet ordre)');
ok(/toucherLigne\(\{ id: 'ebay' \}, ebay\.relie \? 'relie' : 'a_relier'\); ebay\.onRelier\(\);/.test(me), 'la ligne eBay aussi');
ok(/useEffect\(\(\) => \(\) => \{\s*tracerCloud\(userId, 'cloud_me_connecter_ferme', bilanFermetureMeConnecter\(\{ ouvertLe: ouvertLe\.current, fermeLe: Date\.now\(\), touchees: touchees\.current, origine \}\)\);/.test(me),
  'la fermeture (démontage de l\'écran) trace « cloud_me_connecter_ferme » avec le bilan');
ok(!/onClick=\{\(\) => setOuverte\(verif === 'a_resoudre'/.test(me), 'plus aucune ligne qui ouvre sans tracer');

console.log(`\n${n - ko}/${n} vérifications`);
if (ko) { console.log(`ÉCHEC : ${ko}`); process.exit(1); }
