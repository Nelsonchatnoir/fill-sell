// selftest:ebay-rayon-traditionnel — (24/10, décision 6 de Nico) Un vêtement traditionnel ne part jamais en
// « Costumes » : le serveur eBay joue la règle de l'app (vetementTraditionnel) avant toute suggestion d'eBay, pour toute
// résolution de rayon ; jamais sur un rayon choisi par la personne ni sur un rayon déjà dans la branche.
//   1. La djellaba de Sébastien (job 12854dbb, annonce 366745645547, 3001 « Costumes » par le catalogue Vinted) ;
//   2. ce qui ne bouge jamais ;
//   3. ebay-api-worker : branchée en tête de resoudreCategorie, avant les suggestions d'eBay.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (p) => fs.readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');
const imp = (p) => import(pathToFileURL(join(ROOT, p)).href);
const M = await imp('supabase/functions/_shared/ebay-rayon-traditionnel.js');
let n = 0;
const ok = (cond, msg, detail = '') => { assert.ok(cond, `${msg}${detail ? ` — ${detail}` : ''}`); n++; console.log(`  ✓ ${msg}`); };
const r = (titre, pf) => M.rayonTraditionnelImpose(titre, pf);

const DJELLABA = 'Djellaba traditionnelle marocaine homme / unisexe - Marron brodée';
const PF_SEB = { ebayCategoryId: '3001', categorie_source: 'catalog_vinted', categorie_icone: '🤵',
  ebayCategoryPath: ['Vêtements, accessoires', 'Homme : vêtements, accessoires', 'Homme : vêtements', 'Costumes'] };

console.log('1. La djellaba de Sébastien');
const s = r(DJELLABA, PF_SEB);
ok(s?.id === '155253' && s.chemin.at(-1) === 'Asie du Sud-Ouest/Moyen-Orient' && s.chemin.includes('Vêtements traditionnels, du monde'),
  '3001 « Costumes » → 155253, Vêtements traditionnels, du monde', JSON.stringify(s));
ok(/Djellaba/.test(s.detail), 'le détail nomme le mot lu');
ok(r('Abaya noire brodée femme', { ebayCategoryId: '63861', categorie_source: 'mot_cle' })?.id === '155253', 'sans icône : le texte suffit');
ok(r('Sari en soie rouge et or', { ebayCategoryId: '63861', categorie_icone: '👗' })?.id === '155246', 'une autre région : sa feuille');

console.log('2. Ce qui ne bouge jamais');
ok(r(DJELLABA, { ...PF_SEB, categorie_source: 'choix_humain' }) === null, 'le rayon choisi par la personne');
ok(r(DJELLABA, { ...PF_SEB, ebayCategoryId: '155241' }) === null, 'un rayon déjà dans la branche (même une autre région)');
ok(r('Poupée en djellaba marocaine', { ebayCategoryId: '3001', categorie_icone: '🧸' }) === null, 'une poupée (icône d\'un jouet)');
ok(r('Poupée en djellaba marocaine', { ebayCategoryId: '3001' }) === null, 'une poupée (le texte)');
ok(r('Kimono de judo enfant ceinture blanche', { ebayCategoryId: '3001', categorie_icone: '🥋' }) === null, 'un kimono de judo');
ok(r('Robe caftan fleurie été', { ebayCategoryId: '63861', categorie_icone: '👗' }) === null, 'un caftan de mode (mot emprunté sans origine)');
ok(r('T-shirt blanc coton homme', { ebayCategoryId: '15687', categorie_icone: '👕' }) === null, 'un vêtement ordinaire');
ok(r('', {}) === null && r(DJELLABA, null)?.id === '155253', 'sans texte : rien ; sans champs : la règle seule');

console.log('3. ebay-api-worker');
const w = lire('supabase/functions/ebay-api-worker/index.ts');
ok(w.includes('import { rayonTraditionnelImpose } from "../_shared/ebay-rayon-traditionnel.js";'), 'importée');
const debut = w.indexOf('async function resoudreCategorie(');
const corps = w.slice(debut, w.indexOf('\n}\n', debut));
const iGarde = corps.indexOf('rayonTraditionnelImpose(titre');
const iSugg = corps.indexOf('await suggererCategories(');
ok(iGarde > 0 && iSugg > iGarde, 'en tête de resoudreCategorie, avant les suggestions d\'eBay');
ok(/source: "vetement_traditionnel"/.test(corps), 'la source du rayon le dit');
ok((w.match(/resoudreCategorie\(/g) ?? []).length >= 4, 'une seule fonction pour la publication, le rayon aveugle et le rangement d\'une annonce en ligne');

console.log(`\n✓ ebay-rayon-traditionnel : ${n} contrôles verts`);
