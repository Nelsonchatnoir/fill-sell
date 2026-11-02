// Compare B (calculé) à A (stocké) sur un fichier de sortie : distances par champ.
import fs from 'node:fs';
const [fa, fb] = process.argv.slice(2);
const A = new Map(fs.readFileSync(fa, 'utf8').split('\n').filter(Boolean).map((l) => { const r = JSON.parse(l); return [r[0], r]; }));
const hex2bits = (h) => (typeof h === 'string' && h.length === 16) ? [...h].map((c) => parseInt(c, 16).toString(2).padStart(4, '0')).join('') : null;
const ham = (a, b) => { if (!a || !b || a.length !== b.length) return 99; let n = 0; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) n++; return n; };
const K = ['c70', 'p85', 'g45', 'g60', 'g35'];
for (const l of fs.readFileSync(fb, 'utf8').split('\n').filter(Boolean)) {
  const b = JSON.parse(l); const a = A.get(b.url);
  if (b.erreur) { console.log('ERREUR', b.erreur, a ? `A ${a[5]}x${a[6]} ${a[7]}` : '', b.url.slice(-60)); continue; }
  const dd = ham(hex2bits(a[1]), b.dhash), dp = ham(hex2bits(a[2]), b.phash), dc = ham(a[3], b.couleur);
  let dv = [];
  if (Array.isArray(a[4])) K.forEach((k, i) => { dv.push(ham(hex2bits(a[4][2 * i]), b.variantes[k][0]), ham(hex2bits(a[4][2 * i + 1]), b.variantes[k][1])); });
  console.log(`A ${a[5]}x${a[6]} B ${b.largeur}x${b.hauteur} ${a[7].padEnd(16)} d${dd} p${dp} c${dc} v[${dv.join(',')}] ${b.octets}o ${b.ms}ms`);
}
