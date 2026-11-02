// Résumé d'un résultat : catégories, puis les photos non identiques.
import fs from 'node:fs';
const L = fs.readFileSync(`donnees/${process.argv[2]}-resultat.ndjson`, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
const c = {};
for (const a of L) {
  const k = a.erreur ? 'ERREUR ' + a.erreur : [a.chargeur, 'js' + a.js, a.ws ? 'réduite' : '-', a.icc ? 'icc' : '', a.octets_identiques ? 'OCTETS=' : 'octets≠', a.empreinte_identique ? 'EMPREINTE=' : 'empreinte≠', a.ref_conforme_base ? '' : 'REF≠BASE'].join(' ');
  c[k] = (c[k] || 0) + 1;
}
console.log(c);
for (const a of L.filter((a) => !a.erreur && (!a.octets_identiques || !a.empreinte_identique || !a.ref_conforme_base))) console.log(JSON.stringify(a));
const ms = L.filter((a) => a.ms != null).map((a) => a.ms).sort((x, y) => x - y);
if (ms.length) console.log('ms reproduction : médiane', ms[ms.length >> 1], 'max', ms.at(-1));
