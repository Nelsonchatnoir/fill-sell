// Lit l'orientation EXIF (balise 0x0112) d'originales du bucket (quelques fichiers, en mémoire, rien d'écrit).
import fs from 'node:fs';
const urls = fs.readFileSync(process.argv[2], 'utf8').split('\n').filter(Boolean).map((l) => l.split(' ').pop());
let total = 0;
for (const u of urls) {
  if (/\/render\//.test(u)) throw new Error('interdit');
  const r = await fetch(u); const b = new Uint8Array(await r.arrayBuffer()); total += b.byteLength;
  let o = null;
  for (let i = 2; i < Math.min(b.length - 12, 65536); i++) {
    if (b[i] === 0x45 && b[i + 1] === 0x78 && b[i + 2] === 0x69 && b[i + 3] === 0x66 && b[i + 4] === 0 && b[i + 5] === 0) {
      const t = i + 6, le = b[t] === 0x49; const r16 = (p) => le ? b[p] | (b[p + 1] << 8) : (b[p] << 8) | b[p + 1];
      const r32 = (p) => le ? (b[p] | (b[p + 1] << 8) | (b[p + 2] << 16) | (b[p + 3] << 24)) >>> 0 : ((b[p] << 24) | (b[p + 1] << 16) | (b[p + 2] << 8) | b[p + 3]) >>> 0;
      const ifd = t + r32(t + 4); const n = r16(ifd);
      for (let k = 0; k < n; k++) { const e = ifd + 2 + 12 * k; if (r16(e) === 0x0112) o = r16(e + 8); }
      break;
    }
  }
  console.log('orientation EXIF', o, b.byteLength, 'o', u.slice(81));
}
console.log('octets', total);
