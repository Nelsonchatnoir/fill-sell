// ═══════════════════════════════════════════════════════════════════════════
// Selftest LA MARQUE DE COMPATIBILITÉ (06/11 soir, décision de Nico — Louis, « SEB ») — npm run selftest:marque-compatible
// ═══════════════════════════════════════════════════════════════════════════
// Un article « pour / compatible / adapté à / s'adapte sur » une marque ne prend JAMAIS cette marque (Sans marque), même
// pré-remplie par la plateforme, même à la republication ; un vrai produit de marque la garde. Sur les règles RÉELLES :
//   A. _shared/marque-compatible.js (cas de Louis relevés le 06/11, vrais produits, faux positifs mesurés sur le parc) ;
//   B. la tâche servie (jobSansMarqueDeCompatibilite) : marque et caractéristique eBay, trace, idempotence ;
//   C. branchements : get-pending-jobs (toutes plateformes à l'extension), ebay-api-worker (voie API), extension
//      Leboncoin (copie identique de la règle, pré-rempli jamais gardé, chemin « Sans marque » par identifiant).
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => readFileSync(path.join(RACINE, f), 'utf8').replace(/\r\n/g, '\n');
const { marqueSeulementCompatible: c, marquePourLeDepot, jobSansMarqueDeCompatibilite, marqueGenerique, CLE_MARQUE_RETIREE } =
  await import(pathToFileURL(path.join(RACINE, 'supabase/functions/_shared/marque-compatible.js')).href);

let ko = 0;
const ok = (cond, nom, detail = '') => {
  if (!cond) ko++;
  console.log(`  ${cond ? 'ok  ' : 'KO  '} ${nom}${cond ? '' : `   ← ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`}`);
};

console.log('A. Accessoire compatible → aucune marque ; vrai produit de marque → marque gardée');
const louis = [
  ['Rangement Noir et Rouge pour 12 pots et 12 couvercles pour yaourtière Multidélices', 'Optimisez le rangement de votre yaourtière Multidélices de chez SEB 🥣 ⚠️ Pots et couvercles non fournis'],
  ['Rangement Blanc et Vert Pomme pour 12 pots et 12 couvercles pour yaourtière Multidélices', 'Rangement pratique pour yaourtière Multidélices de chez SEB 🥣 📦 Capacité : 12 pots + 12 couvercles'],
  ['12 adaptateurs Orange pour pots La Laitière – Seb Multidélices', "Lot de 12 adaptateurs orange pour yaourtière Seb Multidélices, permettant d'utiliser les pots"],
];
for (const [t, d] of louis) ok(c('SEB', t, d), `Louis : « ${t.slice(0, 48)}… » → SEB retirée`);
ok(c('Multidélices', louis[0][0], louis[0][1]), 'Louis : « Multidélices » (pré-rempli par Leboncoin) → retirée aussi');
const compatibles = [
  ['Apple', 'Coque pour iPhone 12 Apple', ''],
  ['Nintendo', 'Housse compatible avec Nintendo Switch', ''],
  ['Thermomix', "Couvercle s'adapte sur Thermomix TM6", ''],
  ['Waeco', 'Sonde température NTC pour glacière Waeco CF40', ''],
  ['Lego', 'Blooming Blocks Orchidée 527 pièces', '100% compatible avec les briques Lego'],
  ['Dyson', 'Filtre adapté aux aspirateurs Dyson V10', ''],
  ['Bosch', 'Joint conçu pour lave-vaisselle Bosch', ''],
];
for (const [m, t, d] of compatibles) ok(c(m, t, d), `compatible : « ${t} ${d} » → ${m} retirée`);
const vrais = [
  ['SEB', 'Yaourtière SEB Multidélices 12 pots', 'Très bon état'],
  ['Apple', 'Chargeur Apple pour iPhone', "Chargeur Apple d'origine"],
  ['Longchamp', 'Sac pour femme Longchamp', ''],
  ['Longchamp', 'Sac Le Pliage', 'Craquez pour ce sac Longchamp'],
  ['Moser', '⚠️Tondeuse pour chiens', 'Tondeuse pour chiens Moser valeur neuf 130 €'],
  ['Nintendo', 'Jeu Zelda GameBoy', "Jeu The Legend of Zelda Link's Awakening pour Nintendo Game Boy en vente, sa protection"],
  ['Nintendo', 'Super Smash Bros. for Wii U Nintendo Wii U PAL FR avec guide et livret', ''],
  ['Zara', 'Robe fleurie', ''],
  ['SEB', 'Rangement', ''],
];
for (const [m, t, d] of vrais) ok(!c(m, t, d), `vrai produit (ou rien de dit) : « ${`${t} ${d}`.trim().slice(0, 60)} » → ${m} gardée`);
ok(!c('Sans marque', 'Rangement pour SEB', '') && marqueGenerique('Marque générique') && marqueGenerique('Autre'), 'une valeur générique n\'est jamais une marque de compatibilité');
ok(JSON.stringify(marquePourLeDepot('SEB', { titre: louis[0][0], description: louis[0][1] })) === JSON.stringify({ marque: 'Sans marque', retiree: 'SEB' }), 'marquePourLeDepot : « Sans marque », SEB nommée');

console.log('B. La tâche servie');
{
  const job = { action: 'publish', title: louis[1][0], description: louis[1][1], platform_fields: { marque: 'SEB', ebayAspects: { Marque: 'SEB', Type: 'Rangement' }, autre: 1 } };
  const r = jobSansMarqueDeCompatibilite(job, { maintenant: '2026-11-06T21:00:00Z' });
  ok(r !== job && r.platform_fields.marque === 'Sans marque' && r.platform_fields.ebayAspects.Marque === 'Sans marque' && r.platform_fields.ebayAspects.Type === 'Rangement', 'marque et « Marque » eBay → Sans marque, le reste intact');
  ok(r.platform_fields[CLE_MARQUE_RETIREE]?.marque === 'SEB' && r.title === job.title && r.description === job.description, 'trace posée ; titre et description jamais touchés');
  ok(jobSansMarqueDeCompatibilite(r) === r, 'idempotent : servie deux fois, rien ne bouge');
  ok(jobSansMarqueDeCompatibilite({ ...job, action: 'republish' }).platform_fields.marque === 'Sans marque', 'republication : même règle');
  const vrai = { action: 'publish', title: 'Yaourtière SEB Multidélices', description: '', platform_fields: { marque: 'SEB' } };
  ok(jobSansMarqueDeCompatibilite(vrai) === vrai, 'vrai produit de marque : la tâche part telle quelle');
  ok(jobSansMarqueDeCompatibilite({ ...job, action: 'delete' }).platform_fields.marque === 'SEB', 'un retrait n\'est jamais touché');
  ok(jobSansMarqueDeCompatibilite(job, { parLeVendeur: true }).platform_fields[CLE_MARQUE_RETIREE].par_le_vendeur === true, 'marque écrite par la personne : dit dans la trace');
}

console.log('C. Branchements');
{
  const gpj = lire('supabase/functions/get-pending-jobs/index.ts');
  const iM = gpj.indexOf('jobSansMarqueDeCompatibilite(j)');
  const iI = gpj.indexOf('out = out.map((j) => jobSansInvisibles(j)');
  const iP = gpj.indexOf('out = out.map((j) => jobDansLaLimitePhotos(j)');
  ok(iM > 0 && iM < iI && iI < iP, 'get-pending-jobs : chaque tâche servie passe par la règle (puis invisibles, puis limite des photos)');
  ok(/\.update\(\{ platform_fields: pfAPersister\(pfN\) \}\)\s*\n\s*\.eq\("id", String\(j\.id\)\)\.eq\("status"/.test(gpj), 'get-pending-jobs : la trace s\'écrit une fois, en compare-and-set sur le statut');
  const eb = lire('supabase/functions/ebay-api-worker/index.ts');
  ok(/jobSansMarqueDeCompatibilite\(brut/.test(eb) && /const pfPrise = \{ \.\.\.\(pfMarque \?\? \{\}\)/.test(eb), 'ebay-api-worker : la marque corrigée part avec la prise');
  const lbc = lire('chrome-extension/content-scripts/leboncoin.js');
  const partage = lire('supabase/functions/_shared/marque-compatible.js');
  const bloc = (t) => { const d = t.indexOf('// ⟦marque-compatible:début⟧'); const f = t.indexOf('// ⟦marque-compatible:fin⟧'); return d >= 0 && f > d ? t.slice(d, f) : null; };
  ok(bloc(lbc) !== null && bloc(lbc) === bloc(partage).replace(/^export /gm, ''), 'extension Leboncoin : copie IDENTIQUE de la règle');
  ok(/function marqueCiteeDansLArticle\(marque\) \{[\s\S]{0,700}if \(marqueSeulementCompatible\(String\(marque \?\? ""\), TITRE_ARTICLE_LBC, DESCRIPTION_ARTICLE_LBC\)\) return false;/.test(lbc),
    'extension : une marque citée seulement « pour… » n\'est pas « nommée par l\'article » (le pré-rempli n\'est plus gardé)');
  ok(/const prefilledConvient = prefilled && !prefilledCompat && \(/.test(lbc), 'extension : un pré-rempli de compatibilité ne « convient » jamais, même égal à notre valeur');
  ok(/TITRE_ARTICLE_LBC = String\(job\.title \?\? ""\);/.test(lbc) && /DESCRIPTION_ARTICLE_LBC = String\(job\.description \?\? ""\);/.test(lbc), 'extension : titre et description bruts posés à chaque dépôt');
}

console.log(ko ? `\n${ko} KO — une marque de compatibilité peut repartir : ne pas livrer.` : '\nTout est vert.');
process.exit(ko ? 1 : 0);
