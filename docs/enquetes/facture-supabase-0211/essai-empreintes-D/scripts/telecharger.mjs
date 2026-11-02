// Originale + référence Supabase (render/image, mêmes paramètres et même Accept que la prod) pour un jeu.
// Un seul processus, une requête à la fois ; arrêt si la mémoire libre passe sous 1,5 Go.
import fs from 'node:fs'; import os from 'node:os'; import crypto from 'node:crypto';
const [jeu] = process.argv.slice(2);
const L = JSON.parse(fs.readFileSync(`donnees/${jeu}.json`, 'utf8'));
fs.mkdirSync(`donnees/${jeu}`, { recursive: true });
const ACCEPT = 'image/jpeg,image/png,image/*;q=0.5,*/*;q=0.1';
const id = (u) => crypto.createHash('sha256').update(u).digest('hex').slice(0, 16);
let octets = 0, n = 0;
for (const r of L) {
  if (os.freemem() < 1.5 * 2 ** 30) { console.log('ARRÊT : mémoire libre', (os.freemem() / 2 ** 30).toFixed(2), 'Go'); process.exit(2); }
  const base = `donnees/${jeu}/${id(r.url)}`;
  if (fs.existsSync(base + '.r') && fs.existsSync(base + '.o')) continue;
  const rend = r.url.replace('/storage/v1/object/public/', '/storage/v1/render/image/public/') + '?width=400&height=400&resize=contain&quality=80';
  for (const [u, ext] of [[r.url, '.o'], [rend, '.r']]) {
    const res = await fetch(u, { headers: { Accept: ACCEPT } });
    if (!res.ok) { console.log('HTTP', res.status, ext, id(r.url)); continue; }
    const b = Buffer.from(await res.arrayBuffer()); octets += b.length;
    fs.writeFileSync(base + ext, b);
    if (ext === '.r') fs.writeFileSync(base + '.h', JSON.stringify({ ct: res.headers.get('content-type'), cache: res.headers.get('cf-cache-status'), tr: res.headers.get('x-transformations') }));
  }
  n++;
}
console.log(jeu, 'photos', n, 'octets', octets);
