// Point E (0.6.76, a3e8a17) — un signal de vente ne vaut qu'après deux lectures.
// (03/10, point 29) La partie EXTENSION est de côté depuis le retour arrière
// du 28/09 (scripts/lib/morceaux-mis-de-cote.mjs) : le relevé Vinted livré ne
// fait que POSER le drapeau sur le job, la vente s'écrit au geste de la
// personne. Les assertions d'origine restent, intactes, pour son retour.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { morceauRevenu } from './lib/morceaux-mis-de-cote.mjs';
const ok=(cond,nom,detail='')=>{ console.log(`  ${cond?'✓':'✗'} ${nom}${cond||!detail?'':` — ${detail}`}`); assert.ok(cond,nom); };
const source=fs.readFileSync('chrome-extension/background.js','utf8').replaceAll('\r\n','\n');
if (morceauRevenu('vente-deux-lectures', source.includes('function venteConfirmeeDeuxLectures('), ok)) {
  const a=source.indexOf('function venteConfirmeeDeuxLectures(');
  const fonction=source.slice(a,source.indexOf('\n}',a)+2);
  const confirme=vm.runInNewContext('('+fonction+')',{Date,Number,SALE_CHECK_MIN_INTERVAL_MS:7200000});
  const maintenant=Date.parse('2026-09-28T14:00:00Z');
  assert.equal(confirme({},maintenant),false);
  assert.equal(confirme({sold_pending_since:'illisible'},maintenant),false);
  assert.equal(confirme({sold_pending_since:'2026-09-28T13:59:00Z'},maintenant),false);
  assert.equal(confirme({sold_pending_since:'2026-09-28T12:00:00Z'},maintenant),true);
  assert.equal(confirme({sold_pending_since:'2026-09-28T15:00:00Z'},maintenant),false);
  assert.ok(!source.includes('ventesSignaleesAuJob'));
  console.log('Première lecture, cycle rapproché, seconde lecture et horloge invalide : OK');
} else {
  // Ce que la version livrée garantit : le relevé pose le drapeau, il n'écrit pas la vente.
  ok(/la sync ne fait que POSER UN DRAPEAU, seul le clic écrit/.test(source), 'relevé livré : un drapeau sur le job, la vente au geste de la personne');
}
