import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { parse } from 'espree';
const source=fs.readFileSync('chrome-extension/content-scripts/vinted.js','utf8');
const arbre=parse(source,{ecmaVersion:'latest',range:true});
const fonctions=['deleteListing','deleteVintedItemViaApi'];
const extrait=arbre.body.filter(n=>n.type==='FunctionDeclaration'&&fonctions.includes(n.id.name)).map(n=>source.slice(...n.range)).join('\n');
async function scenario({page='/items/123456',proprietaire=null,attendue,session='albert',job=null}) {
  const appels=[];
  const contexte=vm.createContext({location:{pathname:page,href:'https://www.vinted.fr'+page},console:{log(){}},DELETE_DRY_RUN:false,
    proprietaireAnnonceVinted:async()=>proprietaire,
    extractVintedCsrfToken:async()=>'test',getVintedCookie:()=>null,
    fetchBorne:async(url,opts)=>{appels.push({url,method:opts.method??'GET'});return {ok:true,status:200,headers:{get:()=>null},json:async()=>({user:{id:session}}),text:async()=>'{}'};}
  });
  vm.runInContext(extrait,contexte);
  const resultat=job?await contexte.deleteListing(job):await contexte.deleteVintedItemViaApi('123456',()=>{},[],{boutiqueAttendue:attendue});
  return {resultat,posts:appels.filter(a=>a.method==='POST')};
}
for(const options of [
  {proprietaire:{vendeur:'nadege',session:'albert'}},
  {proprietaire:null},
  {proprietaire:{vendeur:'nadege',session:'nadege'},attendue:'albert'},
  {page:'/items/new'},
  {page:'/items/new',attendue:'nadege',session:'albert'},
  {job:{listing_url:'https://www.vinted.fr/items/654321'}},
  {job:{listing_url:'https://www.vinted.fr/items/123456',platform_listing_id:'654321'}},
  // 0.6.78 : page illisible + origine prouvée d'une AUTRE boutique que la session.
  {proprietaire:null,attendue:'nadege',session:'albert'},
]) {
  const r=await scenario(options);assert.equal(r.resultat.success,false);assert.equal(r.posts.length,0);
}
for(const options of [
  {proprietaire:{vendeur:'albert',session:'albert'},attendue:'albert'},
  {page:'/items/new',attendue:'albert',session:'albert'},
  // 0.6.78 : page de l'annonce illisible, origine prouvée = session relue.
  {proprietaire:null,attendue:'albert',session:'albert'},
]) { const r=await scenario(options);assert.equal(r.resultat.success,true);assert.equal(r.posts.length,1);assert.equal(r.posts[0].url,'/api/v2/items/123456/delete'); }
// 0.6.78 : la preuve manquante est nommée, et une preuve absente n'accuse personne.
{ const r=await scenario({page:'/items/new'}); assert.equal(r.resultat.verdict.preuve_manquante,'boutique_article'); assert.equal('boutiqueEtrangere' in r.resultat,false); }
{ const r=await scenario({page:'/items/new',attendue:'albert',session:null}); assert.equal(r.posts.length,0); assert.equal(r.resultat.verdict.preuve_manquante,'session'); }
{ const r=await scenario({proprietaire:{vendeur:'nadege',session:'albert'}}); assert.equal(r.resultat.boutiqueEtrangere.article,'nadege'); }
console.log('14 scénarios de retrait Vinted : aucune requête sur identité absente, étrangère ou contradictoire.');
