// ═══════════════════════════════════════════════════════════════════════════
// LE TROU LEXICAL DE LA PROPAGATION DU RAYON (2026-09-20, passe 3, point 4-a)
// ═══════════════════════════════════════════════════════════════════════════
// Depuis la passe 2, un rayon choisi sur UNE plateforme nomme l'objet pour
// tout l'article : la FEUILLE du rayon devient le mot, et la cascade le
// traduit dans l'arbre de chaque autre plateforme. C'est robuste et ça ne
// coûte aucun mapping — mais je l'ai écrit moi-même : si la feuille choisie
// n'a pas d'équivalent LEXICAL ailleurs, l'autre plateforme reste muette.
//
// CE SCRIPT CHIFFRE LE TROU. Pour chaque feuille Vinted, on prend le mot de
// sa feuille (au singulier, comme objetDuRayonChoisi) et on demande à la
// cascade — la VRAIE, resoudreParMot — si elle trouve quelque chose sur Opla,
// Beebs et Leboncoin.
//
//   node --import ./scripts/loader-ext.mjs scripts/rayon-trou-lexical-mesure.mjs
import { feuillesDe, resoudreParMot } from '../src/utils/categorieParMot.js';
import { objetDuRayonChoisi } from '../src/utils/rayonPublication.js';

const CIBLES = ['opla', 'beebs', 'leboncoin'];

const feuilles = await feuillesDe('vinted');
console.log(`Feuilles Vinted : ${feuilles.length}`);

// Le mot qu'on propagerait, exactement comme en production.
const motDe = (f) => objetDuRayonChoisi({ x: { rayon_choisi: { chemin: f.chemin } } });

const compte = {};
for (const p of CIBLES) compte[p] = { trouve: 0, muet: 0, exemplesMuets: [] };
let sansMot = 0;
let n = 0;

for (const f of feuilles) {
  const mot = motDe(f);
  if (!mot) { sansMot++; continue; }
  n++;
  for (const p of CIBLES) {
    const r = await resoudreParMot(mot, p).catch(() => null);
    if (r?.chemin?.length) compte[p].trouve++;
    else {
      compte[p].muet++;
      if (compte[p].exemplesMuets.length < 8) compte[p].exemplesMuets.push(`${f.chemin.join(' › ')} → « ${mot} »`);
    }
  }
}

console.log(`Feuilles dont la feuille ne donne aucun mot utilisable (< 3 lettres) : ${sansMot}`);
console.log(`Feuilles testées : ${n}\n`);
for (const p of CIBLES) {
  const c = compte[p];
  const pct = n ? Math.round((c.muet / n) * 1000) / 10 : 0;
  console.log(`${p.padEnd(10)} trouve ${String(c.trouve).padStart(4)} · MUET ${String(c.muet).padStart(4)}  (${pct} % de trous)`);
}
console.log('\nExemples de trous (les 8 premiers par plateforme) :');
for (const p of CIBLES) {
  console.log(`\n  ${p} :`);
  for (const e of compte[p].exemplesMuets) console.log(`    · ${e}`);
}
