// En-têtes (64 premiers Ko, requête Range) des photos du jour HORS test : orientation EXIF, composantes, PNG.
import fs from 'node:fs'; import os from 'node:os';
const s = fs.readFileSync('donnees/A.json', 'utf8'); const A = JSON.parse(s.slice(s.indexOf('{'))).rows;
const exclus = new Set(JSON.parse(fs.readFileSync('donnees/test.json', 'utf8')).map((r) => r.url));
const L = A.filter((r) => !exclus.has(r.url));
function lire(b) {
  const r = {};
  if (b[0] === 0x89 && b[1] === 0x50) { r.fmt = 'png'; r.prof = b[24]; r.type = b[25]; return r; }
  if (b[0] !== 0xff || b[1] !== 0xd8) { r.fmt = 'autre'; return r; }
  r.fmt = 'jpg'; let i = 2;
  while (i + 4 < b.length) {
    if (b[i] !== 0xff) break; const m = b[i + 1]; if (m === 0xff) { i++; continue; }
    const len = (b[i + 2] << 8) | b[i + 3];
    if (m === 0xe1 && b.toString('latin1', i + 4, i + 8) === 'Exif') {
      const t = i + 10, le = b[t] === 0x49; const u16 = (o) => le ? b.readUInt16LE(o) : b.readUInt16BE(o); const u32 = (o) => le ? b.readUInt32LE(o) : b.readUInt32BE(o);
      try { const ifd = t + u32(t + 4); const n = u16(ifd); for (let k = 0; k < n; k++) { const e = ifd + 2 + 12 * k; if (u16(e) === 0x112) r.orient = u16(e + 8); } } catch { r.exif = 'illisible'; }
    }
    if (m === 0xee) r.adobe = true;
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) { r.sof = m.toString(16); r.comp = b[i + 9]; break; }
    if (m === 0xda) break;
    i += 2 + len;
  }
  return r;
}
const res = [];
for (const r of L) {
  if (os.freemem() < 1.5 * 2 ** 30) { console.log('ARRÊT mémoire'); process.exit(2); }
  try { const x = await fetch(r.url, { headers: { Range: 'bytes=0-65535' } }); const b = Buffer.from(await x.arrayBuffer()); res.push({ url: r.url, ...lire(b) }); }
  catch (e) { res.push({ url: r.url, erreur: String(e) }); }
}
fs.writeFileSync('donnees/entetes.json', JSON.stringify(res));
const c = {}; for (const r of res) { const k = [r.fmt, r.sof, 'c' + r.comp, 'o' + (r.orient ?? '-'), r.adobe ? 'adobe' : '', r.fmt === 'png' ? `t${r.type}p${r.prof}` : '', r.erreur ? 'ERR' : ''].join(' '); c[k] = (c[k] || 0) + 1; }
console.log(L.length, c);
