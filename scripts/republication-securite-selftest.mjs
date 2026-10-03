// Point D (0.6.76, 078ee88) — file par article, identité de la page, colis.
// (03/10, point 29) La partie EXTENSION du point D est de côté depuis le
// retour arrière du 28/09 : chaque bloc ci-dessous lit le registre
// scripts/lib/morceaux-mis-de-cote.mjs. Ses assertions d'origine restent,
// intactes, et reprennent le jour où le morceau revient, prouvé. La partie
// SERVEUR (_shared/file-republication.js) est livrée : elle est vérifiée ici.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { recreationRetientFile } from '../supabase/functions/_shared/file-republication.js';
import { morceauRevenu } from './lib/morceaux-mis-de-cote.mjs';
const bg=fs.readFileSync('chrome-extension/background.js','utf8').replaceAll('\r\n','\n');
const ok=(cond,nom,detail='')=>{ console.log(`  ${cond?'✓':'✗'} ${nom}${cond||!detail?'':` — ${detail}`}`); assert.ok(cond,nom); };
function extraire(source, signature) {
  const a=source.indexOf(signature); assert.ok(a>=0,signature);
  return source.slice(a,source.indexOf('\n}',a)+2);
}
const CAS_FILE=[
  ['pending',{republish_step:'deleted'},true],
  ['pending',{republish_step:'deleted',recreation_reprise:{n:1}},false],
  ['processing',{republish_step:'deleted',recreation_reprise:{n:1}},true],
  ['needs_user',{republish_step:'deleted'},false],
  ['pending',{republish_step:'captured'},false],
];
// Serveur (livré) : une question en attente ne retient pas toute la file.
for (const [status,pf,attendu] of CAS_FILE) assert.equal(recreationRetientFile({status,platform_fields:pf}),attendu);
ok(true,'serveur : seule une recréation réellement en cours retient la file (5 cas)');
if (morceauRevenu('file-par-article-extension', bg.includes('function recreationRetientFile('), ok)) {
  const miroir=vm.runInNewContext('('+extraire(bg,'function recreationRetientFile(')+')');
  for (const [status,pf,attendu] of CAS_FILE) {
    const j={status,platform_fields:pf};
    assert.equal(recreationRetientFile(j),attendu); assert.equal(miroir(j),attendu);
  }
}
const id=vm.runInNewContext('('+extraire(bg,'function extractListingId(')+')',{URL});
// Ce que les deux versions disent pareil : l'adresse d'une annonce donne son
// identifiant, une page de membre Vinted n'en donne aucun.
assert.equal(id('https://www.vinted.fr/items/10124335822-buste','vinted'),'10124335822');
assert.equal(id('https://www.vinted.fr/member/10124335822','vinted'),null);
assert.equal(id('https://www.beebs.app/fr/p/34058194-pot','beebs'),'34058194');
assert.equal(id('https://www.ebay.fr/itm/nom/407236479670','ebay'),'407236479670');
ok(true,'identifiant : annonce Vinted, Beebs et eBay lus, page de membre Vinted refusée');
const strict=id('https://intrus.fr/items/10124335822','vinted')===null
  || id('https://www.beebs.app/fr/account/my-adverts?searchText=34058194','beebs')===null;
if (morceauRevenu('identifiant-annonce-strict', strict, ok)) {
  assert.equal(id('https://intrus.fr/items/10124335822','vinted'),null);
  assert.equal(id('https://www.beebs.app/fr/account/my-adverts?searchText=34058194','beebs'),null);
}
const vi=fs.readFileSync('chrome-extension/content-scripts/vinted.js','utf8').replaceAll('\r\n','\n');
const select=extraire(vi,'async function selectPackageSize(');
if (morceauRevenu('colis-strict-point-d', /async function selectPackageSize\([^)]*strict/.test(select), ok)) {
  const ctx={VINTED_PACKAGE_SIZES_PAR_ID:{1:'Petit'},Number,Object,console:{warn(){},log(){}},
    waitForKey:async()=>{throw Error('absent');},document:{querySelectorAll:()=>[]}};
  const choisir=vm.runInNewContext('('+select+')',ctx);
  await assert.rejects(()=>choisir('Petit',1,{strict:true}),/aucun retrait/);
  assert.equal(await choisir('Petit',1),'section_absente');
  const radio={checked:false,id:'package_type_selector_1',disabled:false};
  ctx.waitForKey=async()=>radio;ctx.simulateFullClick=()=>{};ctx.humanPause=async()=>{};
  ctx.sel=async()=>({resolveSelector:()=>({el:radio})});
  await assert.rejects(()=>choisir('Petit',1,{strict:true}),/pas été conservé/);
  radio.checked=true;await choisir('Petit',1,{strict:true});
}
console.log('File indépendante par article (serveur), identité de la page : réussis ; morceaux de côté : registre à jour.');
