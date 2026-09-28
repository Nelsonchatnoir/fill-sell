import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const source=fs.readFileSync('chrome-extension/background.js','utf8');
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
