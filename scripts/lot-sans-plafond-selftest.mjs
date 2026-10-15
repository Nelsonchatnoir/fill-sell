// ═══════════════════════════════════════════════════════════════════════════
// PUBLICATION EN LOT SANS PLAFOND DE 20, FLUIDE AVEC DES CENTAINES D'ARTICLES — `npm run selftest:lot-sans-plafond`
// ═══════════════════════════════════════════════════════════════════════════
// 12/10 (A1, A2 — Louis, Business, bloqué à 20 ; lien « Choisir des articles à
// publier » introuvable). Contrôles hors ligne :
//   1. plus AUCUN plafond de 20 (regles, Stock, portes du lot, sélection) ;
//   2. la seule limite est le quota du palier, dite AVANT de lancer ;
//   3. rythme anti-robot inchangé : un article après l'autre (un appel RPC par
//      article, attente de son verdict), jamais deux boucles d'envoi ;
//   4. aucun job en double : l'index unique du serveur + un seul envoi à la fois ;
//   5. fluide : appartenance par Set, moteurs démontés une fois l'article
//      parti, aucune relecture à cadence fixe par moteur, lectures par lots,
//      jamais la relecture complète des jobs toutes les 20 s ;
//   6. le plafond d'appels de resolve-categorie suit le palier ;
//   7. le bouton « Choisir des articles à publier » est un vrai bouton.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => readFileSync(join(RACINE, f), 'utf8').replace(/\r\n/g, '\n');
let ko = 0, ok = 0;
const verifier = (c, quoi, detail = '') => { if (c) { ok++; console.log(`  ✓ ${quoi}`); } else { ko++; console.log(`  ✗ ${quoi}${detail ? `   ← ${detail}` : ''}`); } };
const fichiers = (d) => readdirSync(join(RACINE, d)).flatMap((n) => {
  const p = `${d}/${n}`;
  return statSync(join(RACINE, p)).isDirectory() ? fichiers(p) : /\.(jsx?|mjs)$/.test(n) ? [p] : [];
});

console.log('1. Plus de plafond de 20');
const avecPlafond = fichiers('src').filter((f) => /LOT_MAX_ARTICLES/.test(lire(f)));
verifier(!avecPlafond.length, 'aucune trace de LOT_MAX_ARTICLES dans src/', avecPlafond.join(', '));
const stock = lire('src/tabs/StockTab.jsx');
// (15/10, P17) La sélection « Publier » d'un compte gratuit pré-coche au plus
// ce que le mois offre (prop `initiale`) — ce n'est PAS un plafond : aucun `max`.
const iPub = stock.indexOf("titre={lang==='fr'?'Publier plusieurs articles':'Publish several items'}");
const blocPub = stock.slice(iPub, stock.indexOf('onConfirmer=', iPub));
verifier(!/max=\{LOT_MAX/.test(stock) && iPub > 0 && /articles=\{articles\}\n/.test(blocPub) && !/\bmax=/.test(blocPub), 'la sélection « Publier » (EcranSelection) n’a plus de max');
const entrees = lire('src/publication/lot/EntreesStock.jsx');
verifier(!/20 au plus|at most/.test(entrees), 'plus aucun texte « 20 au plus »');

console.log('\n2. Le quota du palier, dit avant de lancer');
verifier(/const auDela = Number\.isFinite\(restantes\) && n > restantes;/.test(entrees) && /il te reste \$\{restantes\} annonce/.test(entrees), 'la barre de sélection dit le quota restant quand la sélection le dépasse');
const lot = lire('src/publication/lot/LotPublication.jsx');
verifier(/partagerQuota/.test(lot) && /murActif/.test(lot), 'l’écran du lot garde son mur de quota avant l’envoi (choix : formule au-dessus ou ce qui tient)');

console.log('\n3. Rythme : un article après l’autre');
verifier(/for \(const id of ids\) \{[\s\S]{0,1500}await m\.publier\(\);[\s\S]{0,300}await attendre\(/.test(lot), 'envoi séquentiel : un article, son verdict, puis le suivant');
verifier(/JOB_DELAY_MS/.test(lire('chrome-extension/config.js')), 'l’extension garde son délai entre deux dépôts (8 à 20 s)');

console.log('\n4. Aucun job en double');
verifier(/if \(envoiEnCoursRef\.current\) return;/.test(lot) && /finally \{ envoiEnCoursRef\.current = false; \}/.test(lot), 'un seul envoi à la fois (double appui sans effet)');
verifier(/cross_post_jobs_un_seul_publish_actif_par_article_plateforme/.test(lire('supabase/migrations/20260923000000_un_seul_publish_actif_par_article.sql')), 'l’index unique du serveur (un publish actif par article et plateforme)');

console.log('\n5. Fluide avec des centaines d’articles');
verifier(/const lotSelSet = useMemo\(\(\) => new Set\(lotSel\), \[lotSel\]\);/.test(stock) && /coche: lotSelSet\.has\(item\.id\)/.test(stock), 'appartenance à la sélection par Set (plus de includes par carte)');
verifier(/\["quota", "rien", "erreur", "retire", "refuse", "envoye"\]\.includes/.test(lot), 'un article parti démonte son moteur');
const lps = lire('src/components/ListingPreviewScreen.jsx');
verifier(/if \(pilote\) return \(\) => \{ alive = false; \};\s*\n\s*const timer = setInterval\(lire, 60_000\);/.test(lps), 'dans un lot, aucun moteur ne relit platform_health toutes les 60 s');
verifier(/Promise\.all\(parLots\(ids\)\.map\(/.test(lot) && /k \+= 150/.test(lire('src/publication/lot/arretLot.js')), 'lectures et arrêt par lots (adresses bornées)');
const J = await import(pathToFileURL(join(RACINE, 'src/stock/jobsIncrementaux.js')).href);
verifier(J.filtreLeger({ vivants: Array.from({ length: 900 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`), depuis: 'x' }) !== null, '900 jobs en cours : jamais la relecture complète des jobs toutes les 20 s');

console.log('\n6. resolve-categorie suit le palier');
const Pl = await import(pathToFileURL(join(RACINE, 'supabase/functions/_shared/plafond-resolve-categorie.js')).href);
verifier(Pl.plafondResolveCategorie('business') >= 3000 && Pl.plafondResolveCategorie('pro') >= 1500 && Pl.plafondResolveCategorie('free') === 300 && Pl.plafondResolveCategorie(null) === 300, 'business ≥ 3 000, pro ≥ 1 500, gratuit 300, inconnu = le plus bas');
verifier(/plafondResolveCategorie\(typeof palier === "string" \? palier : null\)/.test(lire('supabase/functions/resolve-categorie/index.ts')), 'resolve-categorie lit le palier (palier_de) avant le garde-fou');

console.log('\n7. Le bouton « Choisir des articles à publier »');
verifier(/className="sk-btn fs-focus stock-choisir-lot" data-geste="choisir-articles-a-publier"/.test(stock) && /background:DEGRADE,color:"#fff"/.test(stock) && /minHeight:44/.test(stock.slice(stock.indexOf('stock-choisir-lot'), stock.indexOf('stock-choisir-lot') + 900)), 'un vrai bouton : plein (dégradé), texte blanc, 44 px, icône');
verifier(/\.stock-choisir-lot \{ width: 100%; \}/.test(lire('src/App.css')), 'pleine largeur sur téléphone');
verifier(stock.indexOf('data-geste="choisir-articles-a-publier"') < stock.indexOf('Modifier le prix ou la quantité de plusieurs articles'), 'placé avant le lien « Modifier le prix… » (vu en premier)');

console.log(`\n${ko ? `✗ ${ko} échec(s)` : '✓ tout est vert'} — ${ok} contrôles`);
process.exit(ko ? 1 : 0);
