import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { recreationRetientFile } from '../supabase/functions/_shared/file-republication.js';
const bg=fs.readFileSync('chrome-extension/background.js','utf8').replaceAll('\r\n','\n');
function extraire(source, signature) {
  const a=source.indexOf(signature); assert.ok(a>=0,signature);
  return source.slice(a,source.indexOf('\n}',a)+2);
}
const miroir=vm.runInNewContext('('+extraire(bg,'function recreationRetientFile(')+')');
for (const [status,pf,attendu] of [
  ['pending',{republish_step:'deleted'},true],
  ['pending',{republish_step:'deleted',recreation_reprise:{n:1}},false],
  ['processing',{republish_step:'deleted',recreation_reprise:{n:1}},true],
  ['needs_user',{republish_step:'deleted'},false],
  ['pending',{republish_step:'captured'},false],
]) {
  const j={status,platform_fields:pf};
  assert.equal(recreationRetientFile(j),attendu); assert.equal(miroir(j),attendu);
}
const id=vm.runInNewContext('('+extraire(bg,'function extractListingId(')+')',{URL});
assert.equal(id('https://www.vinted.fr/items/10124335822-buste','vinted'),'10124335822');
assert.equal(id('https://www.vinted.fr/member/10124335822','vinted'),null);
assert.equal(id('https://intrus.fr/items/10124335822','vinted'),null);
assert.equal(id('https://www.beebs.app/fr/p/34058194-pot','beebs'),'34058194');
assert.equal(id('https://www.beebs.app/fr/account/my-adverts?searchText=34058194','beebs'),null);
assert.equal(id('https://www.ebay.fr/itm/nom/407236479670','ebay'),'407236479670');
const vi=fs.readFileSync('chrome-extension/content-scripts/vinted.js','utf8').replaceAll('\r\n','\n');
const select=extraire(vi,'async function selectPackageSize(');
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
console.log('File indépendante par article, identité de la page et colis réellement posé : réussis.');
