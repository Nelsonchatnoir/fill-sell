import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const src=fs.readFileSync('chrome-extension/background.js','utf8');
const extraire=(de,a)=>src.slice(src.indexOf(de),src.indexOf(a,src.indexOf(de)));
let nettoyes=0;
const contexte=vm.createContext({console,URL,setTimeout:(f)=>setTimeout(f,1),clearTimeout:(t)=>{nettoyes++;clearTimeout(t);},
  LISTING_URL_PATTERNS:{beebs:/\/p\/\d+/},COMPTEUR_LBC_ATTENTE_MS:10,CHEMIN_LISTE_DU_COMPTE:{},
  chrome:{scripting:{executeScript:()=>new Promise(()=>{})}}});
vm.runInContext(extraire('async function releverLiensAnnoncesDansOnglet','/** L’état de la page eBay').split('/** L\'état de la page eBay')[0],contexte);
await assert.rejects(contexte.releverLiensAnnoncesDansOnglet(1,'beebs'),/3 minutes/);
assert.equal(nettoyes,1);
let intervalles=0,fermes=0;
const run=vm.createContext({console,setInterval:()=>{intervalles++;return 42;},clearInterval:(id)=>{assert.equal(id,42);fermes++;},
  RELEVE_PLATEFORMES:['beebs'],releveEnCours:false,SYNC_ERREUR_TECHNIQUE_RE:/jamais/,
  getValidSession:async()=>({access_token:'jeton-simule'}),decodeJwtSub:()=> 'user',syncMultiOuverte:async()=>true,
  restRequest:async()=>[{id:'run',platform:'beebs'}],FILLSELL_BUILD_ID:'test',
  releverAnnoncesPlateforme:async()=>{throw new Error('lecture interrompue pour le test');}});
// Charger le corps complet, y compris ses commentaires et le finally.
vm.runInContext(extraire('async function lancerRelevePlateforme','async function traiterRelevesEnAttente'),run);
await run.lancerRelevePlateforme({platform:'beebs',runId:'run'});
assert.equal(intervalles,1);assert.equal(fermes,1);assert.equal(run.releveEnCours,false);
console.log('Lecture figée bornée, maintien du worker et nettoyage sur erreur : OK');
