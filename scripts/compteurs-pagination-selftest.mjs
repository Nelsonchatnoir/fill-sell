import assert from 'node:assert/strict';
import { lireToutesPages } from '../src/utils/lireToutesPages.js';
function source(n, plafond=1000, erreurA=-1) {
  let appels=0, actifs=0;
  const rows=Array.from({length:n},(_,id)=>({id:id+1}));
  return () => {
    let apres=0, taille=0;
    return {order(){return this;},limit(n){taille=n;return this;},gt(k,v){apres=v;return this;},
      async then(resolve,reject){
        try {
          assert.equal(++actifs,1); await Promise.resolve(); actifs--;
          resolve(++appels===erreurA?{error:new Error('lecture interrompue')}:
            {data:rows.filter(r=>r.id>apres).slice(0,Math.min(taille,plafond)),error:null});
        } catch(e){reject(e);}
      }};
  };
}
for(const n of [0,1000,2001,4507]) {
  const rows=await lireToutesPages(source(n,200));
  assert.equal(rows.length,n);assert.equal(new Set(rows.map(x=>x.id)).size,n);
}
await assert.rejects(lireToutesPages(source(2500,500,3)),/interrompue/);
console.log('Compteurs : plus de 2000 lignes, plafond serveur, pages séquentielles, erreur sans résultat partiel : OK');
