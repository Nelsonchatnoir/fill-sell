// Les photos du bucket que la nouvelle méthode n'a pas pu lire (HTTP 400 / 404) : le fichier existe-t-il encore
// dans storage.objects (bucket listing-photos) ? Lecture seule. Sortie : donnees/absents.json
//   { absents: [url…] (fichier supprimé du stockage), presents_illisibles: [url…] (le fichier existe : vrai refus) }
import fs from 'node:fs';
import path from 'node:path';
import { requete, W } from './sql-lecture.mjs';
import { chargerCalculs, PREFIXE } from './jeux.mjs';

const calculs = chargerCalculs();
const http4 = [...calculs.values()].filter((c) => c.erreur && /^HTTP 4\d\d$/.test(c.erreur)).map((c) => c.url);
console.log('URL en HTTP 4xx', http4.length);
const nom = (u) => decodeURIComponent(u.slice(PREFIXE.length).split('?')[0]);
const existants = new Set();
for (let i = 0; i < http4.length; i += 1500) {
  const lot = http4.slice(i, i + 1500).map(nom);
  const lit = lot.map((x) => '$k$' + x + '$k$').join(',');
  const rows = requete(`select json_agg(o.name) j from storage.objects o where o.bucket_id = 'listing-photos' and o.name = any (array[${lit}]::text[]);`, '_absents.sql');
  for (const x of rows[0].j ?? []) existants.add(x);
}
const absents = http4.filter((u) => !existants.has(nom(u)));
const presents = http4.filter((u) => existants.has(nom(u)));
fs.writeFileSync(path.join(W, 'donnees', 'absents.json'), JSON.stringify({ absents, presents_illisibles: presents }));
console.log({ absents: absents.length, presents_illisibles: presents.length });
