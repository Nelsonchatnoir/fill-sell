// Vérifie que la distance bornée de rejouer-autres.mjs (dPhotoBornee) rend EXACTEMENT dPhoto du dépôt (photos.js)
// quand elle vaut ≤ 16, et 99 sinon — sur des paires tirées au hasard ET sur des paires proches.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { W } from './jeux.mjs';
const { photoDepuisCompacte, dPhoto } = await import(pathToFileURL('C:/Users/nicol/fill-and-sell/supabase/functions/_shared/rapprochement/photos.js').href);
const src = fs.readFileSync(path.join(W, 'scripts', 'rejouer-autres.mjs'), 'utf8');
const corps = src.slice(src.indexOf('const pc32'), src.indexOf('// ── fin des distances'));
const { preparer, dPhotoBornee } = new Function('photoDepuisCompacte', corps + '\nreturn { preparer, dPhotoBornee };')(photoDepuisCompacte);
const emp = JSON.parse(fs.readFileSync(path.join(W, 'donnees', 'emp', process.argv[2] + '.json'), 'utf8'));
const L = emp.A.map((r) => [photoDepuisCompacte(r), preparer(r)]).filter((x) => x[0]);
let n = 0, egaux = 0, proches = 0, faux = 0;
for (let i = 0; i < L.length && n < 3e6; i++) for (let j = i + 1; j < L.length && n < 3e6; j += 1 + Math.floor(Math.random() * 7)) {
  n++;
  const ref = dPhoto(L[i][0], L[j][0]), b = dPhotoBornee(L[i][1], L[j][1]);
  const attendu = ref <= 16 ? ref : 99;
  if (attendu === b) egaux++; else { faux++; if (faux < 5) console.log('ÉCART', ref, b); }
  if (ref <= 16) proches++;
}
console.log({ paires: n, egales: egaux, dont_proches_le_16: proches, ecarts: faux });
