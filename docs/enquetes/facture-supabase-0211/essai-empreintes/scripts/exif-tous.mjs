// L'orientation EXIF des photos aux grands écarts (Δ dHash ou pHash ≥ 5) : seulement les 64 premiers Ko (Range),
// en mémoire, rien d'écrit. Sortie : donnees/photos-grands-ecarts-exif.json
import fs from 'node:fs';
import path from 'node:path';
import { W } from './jeux.mjs';
const g = JSON.parse(fs.readFileSync(path.join(W, 'donnees', 'photos-grands-ecarts.json'), 'utf8'));
let total = 0;
function orientation(b) {
  for (let i = 2; i < b.length - 12; i++) {
    if (b[i] === 0x45 && b[i + 1] === 0x78 && b[i + 2] === 0x69 && b[i + 3] === 0x66 && b[i + 4] === 0 && b[i + 5] === 0) {
      const t = i + 6, le = b[t] === 0x49; const r16 = (p) => le ? b[p] | (b[p + 1] << 8) : (b[p] << 8) | b[p + 1];
      const r32 = (p) => le ? (b[p] | (b[p + 1] << 8) | (b[p + 2] << 16) | (b[p + 3] << 24)) >>> 0 : ((b[p] << 24) | (b[p + 1] << 16) | (b[p + 2] << 8) | b[p + 3]) >>> 0;
      const ifd = t + r32(t + 4); if (ifd + 2 > b.length) return 'illisible'; const n = r16(ifd);
      for (let k = 0; k < n; k++) { const e = ifd + 2 + 12 * k; if (e + 10 > b.length) break; if (r16(e) === 0x0112) return r16(e + 8); }
      return 1;
    }
  }
  return null;
}
let i = 0;
async function ouvrier() {
  for (;;) { const k = i++; if (k >= g.length) return; const x = g[k];
    if (/\/render\//.test(x.url)) throw new Error('interdit');
    const r = await fetch(x.url, { headers: { Range: 'bytes=0-65535' } }); const b = new Uint8Array(await r.arrayBuffer()); total += b.byteLength;
    x.exif = orientation(b); }
}
await Promise.all(Array.from({ length: 8 }, ouvrier));
const c = {}; for (const x of g) { const k = `${x.exif ?? 'aucune'}|${x.dd >= 20 ? 'Δ≥20' : 'Δ5-19'}`; c[k] = (c[k] ?? 0) + 1; }
fs.writeFileSync(path.join(W, 'donnees', 'photos-grands-ecarts-exif.json'), JSON.stringify(g, null, 1));
console.log(JSON.stringify(c), 'octets', total);
