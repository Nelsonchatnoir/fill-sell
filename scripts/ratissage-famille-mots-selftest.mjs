// ═══════════════════════════════════════════════════════════════════════════
// VERROU DU POINT 10 DU LOT DU 16/11/2026 MIDI — « VERRE » DOIT FAIRE ENTRER « VERRERIE » DANS LES CANDIDATES
//     npm run selftest:ratissage-famille-mots
// ═══════════════════════════════════════════════════════════════════════════
// Constat (lizzaa, lot eBay du 15/11, 7 verres) : le mot-objet « verre » ne faisait jamais entrer « Maison › Cuisine, arts
// de la table › Verrerie » (20696) dans les candidates soumises à l'IA : le ratissage (candidatsParMot) ne compare que des
// jetons identiques, et « verrerie » n'est pas le jeton « verre ». L'IA a choisi le moins faux de candidates toutes fausses
// (« Livres, BD › Produits dérivés › Verres et mugs »).
// La règle (src/utils/categorieParMot.js, motsDeLaMemeFamille) : AU RATISSAGE SEULEMENT (jamais pour une correspondance
// exacte, qui pose une catégorie avec certitude), un jeton de la feuille qui est le MÊME MOT suivi d'un suffixe de collection
// ou de métier (-erie / -rie / -terie : verre → verrerie, bijou → bijouterie, maroquin → maroquinerie, linge → lingerie)
// fait entrer la feuille, dans les deux sens. Jamais un simple début de mot (« table » ≠ « tablette », « sac » ≠ « sachet »).
// Ce test prouve :
//   A. la règle pure : verre ↔ verrerie, bijou ↔ bijouterie, linge ↔ lingerie ; jamais table/tablette, sac/sachet,
//      montre/montreur, robe/robert, ni un mot trop court ;
//   B. le vrai arbre eBay : « verre » (titre « Verre à shot ») fait entrer 20696 « Verrerie » parmi les candidates ;
//   C. rien de neuf pour un mot sans famille : « robe » rend la même liste qu'avant (pas de feuille sans jeton commun).
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let verts = 0, rouges = 0;
const ok = (c, m, d = '') => {
  if (c) { verts++; console.log(`  ok   ${m}`); }
  else { rouges++; console.log(`  RATÉ ${m}${d ? `\n         ← ${String(d).slice(0, 500)}` : ''}`); }
};
const { createServer } = await import('vite');
const vite = await createServer({
  root: ROOT, configFile: false, logLevel: 'silent', appType: 'custom',
  server: { middlewareMode: true, hmr: false, watch: null }, ssr: { noExternal: [] }, optimizeDeps: { noDiscovery: true, include: [] },
});
try {
  const M = await vite.ssrLoadModule('/src/utils/categorieParMot.js');

  console.log('\nA. La règle pure : même mot + suffixe de collection ou de métier');
  const f = M.motsDeLaMemeFamille;
  ok(typeof f === 'function', 'motsDeLaMemeFamille existe (src/utils/categorieParMot.js)');
  if (typeof f === 'function') {
    for (const [a, b] of [['verre', 'verrerie'], ['verrerie', 'verre'], ['bijou', 'bijouterie'], ['linge', 'lingerie'], ['maroquin', 'maroquinerie']]) {
      ok(f(a, b) === true, `« ${a} » et « ${b} » : même famille`);
    }
    for (const [a, b] of [['table', 'tablette'], ['sac', 'sachet'], ['montre', 'montreur'], ['robe', 'robert'], ['verre', 'verre'], ['pot', 'poterie'], ['lit', 'literie']]) {
      ok(f(a, b) === false, `« ${a} » et « ${b} » : ${a === b ? 'identiques (déjà comptés ailleurs)' : 'pas la même famille (début de mot, ou mot trop court)'}`);
    }
  }

  console.log('\nB. Le vrai arbre eBay : « verre » fait entrer « Verrerie » (20696)');
  const liste = await M.candidatsParMot('verre', 'ebay', { titre: 'Verre à shot transparent', genre: '' });
  ok(liste.some((c) => String(c.id) === '20696'), `20696 « Verrerie » parmi les ${liste.length} candidates`, liste.map((c) => `${c.id} ${c.chemin.join(' > ')}`).join(' | '));

  console.log('\nC. Un mot sans famille : la liste ne change pas de nature');
  const robes = await M.candidatsParMot('robe', 'ebay', { titre: 'Robe longue fleurie', genre: 'femme' });
  ok(robes.length > 0 && robes.every((c) => /rob/i.test(c.chemin[c.chemin.length - 1])), `« robe » : seulement des feuilles qui portent le mot (${robes.length})`, robes.map((c) => c.chemin.at(-1)).join(' | '));
} finally {
  await vite.close();
}
console.log(`\n${verts} verts, ${rouges} rouges`);
process.exit(rouges ? 1 : 0);
