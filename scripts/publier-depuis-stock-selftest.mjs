// selftest:publier-depuis-stock — cocher DANS le Stock, filtre gardé, les
// articles à publier ; « Continuer » ouvre la publication en lot EXISTANTE
// (11/10, Louis, Business).
//
//   npm run selftest:publier-depuis-stock
//   (preuve à l'écran : node scripts/apercu/capture-selection-publier.mjs)
//
// Contrôles (hors ligne) :
//   1. la porte « Choisir des articles à publier » entre dans le mode du lot
//      (entrerModeLot), seulement si la vue montre un article qui peut partir,
//      jamais dans un autre mode ni sur les vendus ;
//   2. le mode porte sur la liste FILTRÉE (stockRetenu ?? stockFiltre), et
//      seulement sur ce que la règle unique du lot accepte
//      (articleSelectionnable : en stock, avec photo, pas déjà partout) ;
//   3. « Tout (N) » et le toucher restent bornés à LOT_MAX_ARTICLES (20,
//      inchangé) ; « Continuer » ouvre LotPublication (le même composant, les
//      mêmes props que les autres portes) ;
//   4. rien d'autre ne change : la sélection du haut (« Publier »), l'appel
//      sous un filtre « Pas encore sur X », la règle des plateformes occupées.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => readFileSync(path.join(RACINE, f), 'utf8').replace(/\r\n/g, '\n');
const STOCK = lire('src/tabs/StockTab.jsx');
const REGLES = lire('src/publication/lot/regles.js');
const ENTREES = lire('src/publication/lot/EntreesStock.jsx');

let echecs = 0;
const ok = (cond, quoi, detail = '') => {
  console.log(`${cond ? '  ✓' : '  ✗'} ${quoi}${cond || !detail ? '' : `   ← ${detail}`}`);
  if (!cond) echecs += 1;
};

console.log('1. La porte');
const iPorte = STOCK.indexOf('"Choisir des articles à publier"');
ok(iPorte > 0, 'le libellé « Choisir des articles à publier » existe');
const porte = STOCK.slice(STOCK.lastIndexOf('{lotActionnablesVue.length>0&&', iPorte), iPorte + 80);
ok(/lotActionnablesVue\.length>0&&!modeModif&&!modeBrouillons&&!modePrixAchat&&!modeRepublish&&!modeLot&&vueStock!=='vendus'/.test(porte),
  'seulement si la vue a un article qui peut partir, hors de tout autre mode, jamais sur les vendus');
ok(/onClick=\{\(\)=>\{entrerModeLot\(\[\]\);/.test(porte), 'elle entre dans le mode du lot, rien de coché d\'office');
ok(/track\('lot_publication_selection'/.test(porte), 'le geste est compté (lot_publication_selection)');
ok((STOCK.match(/"Choisir des articles à publier"/g) || []).length === 1, 'une seule porte');

console.log('\n2. La liste filtrée, la règle unique');
ok(/const lotActionnablesVue = \(stockRetenu \?\? stockFiltre\)\.filter\(i => lotSelectionnables\.has\(i\.id\)\);/.test(STOCK), 'le mode porte sur la liste FILTRÉE');
ok(/articleSelectionnable\(i, jobsByInventaire\[i\.id\] \|\| \[\], plateformesLotCompte, lang\)\.ok/.test(STOCK), 'chaque article passe la règle unique du lot');
ok(/modeLot\?lotActionnablesVue/.test(STOCK), 'en mode lot, la liste affichée = ce qui peut partir dans la vue');
ok(/<BarreRecherche lang=\{lang\} search=\{search\} setSearch=\{setSearch\}/.test(STOCK)
  && !/\(stock\.length>0\|\|search\)&&!modeLot/.test(STOCK), 'la recherche et le panneau de filtres restent là pendant le mode');
ok(/if \(String\(item\.statut \?\? ""\) === "vendu" \|\| item\.sold === true\) return \{ ok: false/.test(REGLES)
  && /if \(!photosDe\(item\)\.length\) return \{ ok: false/.test(REGLES)
  && /if \(!plateformesLibres\(item, jobs, plateformesCompte\)\.length\) return \{ ok: false/.test(REGLES),
  'règle inchangée : jamais vendu, jamais sans photo, jamais déjà partout');

console.log('\n3. Bornes et suite');
ok(/export const LOT_MAX_ARTICLES = 20;/.test(REGLES), 'LOT_MAX_ARTICLES = 20 (inchangé)');
ok(/: \(prev\.length >= LOT_MAX_ARTICLES \? prev : \[\.\.\.prev, id\]\)\);/.test(STOCK), 'le toucher s\'arrête au plafond');
ok(/onTout=\{\(\)=>setLotSel\(prev=>\{const vus=lotActionnablesVue\.map\(i=>i\.id\);[^}]*if\(n\.length>=LOT_MAX_ARTICLES\)break;/.test(STOCK), '« Tout (N) » = ce que la vue montre, au plafond près');
ok(/onContinuer=\{\(\)=>ouvrirLot\(filtreDiffusion\?\.mode==='pas_encore'\?\[filtreDiffusion\.platform\]:null\)\}/.test(STOCK), '« Continuer » → ouvrirLot (plateforme du filtre pré-choisie)');
ok(/setLotOuvert\(\{ articles, plateformes \}\);/.test(STOCK) && /\{lotOuvert&&\(\s*<LotPublication/.test(STOCK), 'ouvrirLot ouvre LotPublication, le même composant');
ok(/const articles = lotSel\.map\(id => parId\.get\(id\)\)\.filter\(Boolean\)\.filter\(i => lotSelectionnables\.has\(i\.id\)\);/.test(STOCK), 'seuls les articles cochés ET acceptés partent dans le lot');

console.log('\n4. Le reste inchangé');
ok(/export function AppelFiltrePublier\(/.test(ENTREES) && /setPublierContexte\(\{ids:lotActionnablesVue\.map\(i=>i\.id\),plateformes:filtreDiffusion\?\.mode==='pas_encore'\?\[filtreDiffusion\.platform\]:null\}\);setGesteOuvert\('publier'\);/.test(STOCK),
  'l\'appel sous un filtre « Pas encore sur X » ouvre toujours la sélection pré-cochée');
ok(/titre=\{lang==='fr'\?'Publier plusieurs articles':'Publish several items'\}/.test(STOCK), 'la tuile « Publier » du haut : inchangée');
ok(/export function plateformesOccupees\(item, jobs = \[\]\)/.test(REGLES), 'plateformes occupées (en ligne, en file, en attente, réservées) : règle inchangée');

console.log(echecs ? `\n✗ ${echecs} échec(s)` : '\nTOUT PASSE');
process.exit(echecs ? 1 : 0);
