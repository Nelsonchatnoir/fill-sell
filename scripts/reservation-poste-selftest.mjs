// Point C (0.6.76, f6dd466) — identité stable du poste pour la réservation.
// (03/10, point 29) La partie EXTENSION est de côté depuis le retour arrière
// du 28/09 (scripts/lib/morceaux-mis-de-cote.mjs) ; la partie serveur,
// compatible avec les anciennes extensions, est appliquée. L'assertion
// d'origine reste, intacte, pour le retour du morceau.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { morceauRevenu } from './lib/morceaux-mis-de-cote.mjs';
const ok=(cond,nom,detail='')=>{ console.log(`  ${cond?'✓':'✗'} ${nom}${cond||!detail?'':` — ${detail}`}`); assert.ok(cond,nom); };
const source=fs.readFileSync('chrome-extension/background.js','utf8');
if (morceauRevenu('poste-instance', source.includes('let posteInstancePromise = null;') || /function identifiantInstallation\(/.test(source), ok)) {
  const extrait=source.slice(source.indexOf('let posteInstancePromise = null;'),source.indexOf('async function callEdgeFunction('));
  const valeurs={};let creations=0;
  const contexte=()=>vm.createContext({chrome:{storage:{local:{
   get:async cle=>({[cle]:valeurs[cle]}),set:async obj=>Object.assign(valeurs,obj),
  }}},crypto:{randomUUID:()=>{creations++;return '12345678-1234-4321-8123-123456789abc';}}});
  const a=contexte();vm.runInContext(extrait,a);
  const [x,y]=await Promise.all([a.identifiantInstallation(),a.identifiantInstallation()]);
  assert.equal(x,y);assert.equal(creations,1);
  const b=contexte();vm.runInContext(extrait,b);
  assert.equal(await b.identifiantInstallation(),x);assert.equal(creations,1);
  console.log('Identité du poste : appels simultanés et redémarrage conservent la même installation.');
}
