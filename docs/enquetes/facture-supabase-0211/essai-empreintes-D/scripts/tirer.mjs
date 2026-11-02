// Tirage déterministe (sha256 de l'URL) : 200 photos de TEST, puis 60 de MISE AU POINT (disjointes).
import fs from 'node:fs'; import crypto from 'node:crypto';
const s = fs.readFileSync('donnees/A.json', 'utf8'); const rows = JSON.parse(s.slice(s.indexOf('{'))).rows;
const h = (u) => crypto.createHash('sha256').update('essaiD|' + u).digest('hex');
const tries = [...rows].sort((a, b) => h(a.url) < h(b.url) ? -1 : 1);
const test = tries.slice(0, 200), dev = tries.slice(200, 260);
fs.writeFileSync('donnees/test.json', JSON.stringify(test)); fs.writeFileSync('donnees/dev.json', JSON.stringify(dev));
const jeton = (u) => (u.split('?')[0].match(/\/([^/]+)\.[a-z]+$/i) || [])[1];
fs.writeFileSync('donnees/jetons.txt', [...test, ...dev].map((r) => `'${jeton(r.url)}'`).join(','));
const png = (l) => l.filter((r) => /\.png$/i.test(r.url.split('?')[0])).length;
console.log('test', test.length, 'png', png(test), '| dev', dev.length, 'png', png(dev), '| jetons uniques', new Set([...test, ...dev].map((r) => jeton(r.url))).size);
