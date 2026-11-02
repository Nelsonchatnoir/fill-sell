// Le détail d'une paire de nœuds du moteur : URL des photos et distance dPhoto (photos.js) A et B, photo par photo.
// Usage : node exemple-paire.mjs <compte complet> <nœud1> <nœud2>    (nœud = F<id fiche> ou A<id annonce>)
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { W, estBucket } from './jeux.mjs';
const { photoDepuisCompacte, dPhoto } = await import(pathToFileURL('C:/Users/nicol/fill-and-sell/supabase/functions/_shared/rapprochement/photos.js').href);
const [u, n1, n2] = process.argv.slice(2);
const lu = JSON.parse(fs.readFileSync(path.join(W, 'donnees', 'moteur', u + '.json'), 'utf8'));
const emp = JSON.parse(fs.readFileSync(path.join(W, 'donnees', 'emp', u + '.json'), 'utf8'));
const mA = new Map(emp.A.map((r) => [r[0], r])), mB = new Map(emp.B.map((r) => [r[0], r]));
const urls = (n) => (n[0] === 'F' ? lu.fiches.find((f) => f.id === n.slice(1)) : lu.annonces.find((a) => a.id === n.slice(1)))?.photos?.slice(0, 6) ?? [];
const titre = (n) => (n[0] === 'F' ? lu.fiches.find((f) => f.id === n.slice(1))?.titre : lu.annonces.find((a) => a.id === n.slice(1))?.titre);
console.log(n1, titre(n1)); console.log(n2, titre(n2));
for (const x of urls(n1)) for (const y of urls(n2)) {
  const a1 = photoDepuisCompacte(mA.get(x)), a2 = photoDepuisCompacte(mA.get(y)), b1 = photoDepuisCompacte(mB.get(x)), b2 = photoDepuisCompacte(mB.get(y));
  const dA = a1 && a2 ? dPhoto(a1, a2) : null, dB = b1 && b2 ? dPhoto(b1, b2) : null;
  if ((dA ?? 99) <= 16 || (dB ?? 99) <= 16) console.log(`dA ${dA} dB ${dB}  ${estBucket(x) ? '[bucket] ' : ''}${x}\n                ${estBucket(y) ? '[bucket] ' : ''}${y}`);
}
