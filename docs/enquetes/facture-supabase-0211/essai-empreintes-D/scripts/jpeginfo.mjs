// Structure d'un JPEG : marqueurs, trame (SOF), échantillonnage, tables de quantification, balayages.
import fs from 'node:fs';
export function info(b) {
  const out = { marqueurs: [], dqt: [], sof: null, scans: 0, app: [] };
  let i = 2;
  while (i < b.length) {
    if (b[i] !== 0xff) { i++; continue; }
    const m = b[i + 1];
    if (m === 0xd9) { out.marqueurs.push('EOI'); break; }
    if (m === 0xff || m === 0x00 || (m >= 0xd0 && m <= 0xd7)) { i++; continue; }
    const len = (b[i + 2] << 8) | b[i + 3];
    const seg = b.subarray(i + 4, i + 2 + len);
    const nom = m.toString(16);
    out.marqueurs.push(nom);
    if (m >= 0xe0 && m <= 0xef) out.app.push(nom + ':' + Buffer.from(seg.subarray(0, 14)).toString('latin1').replace(/[^\x20-\x7e]/g, '.') + ' (' + len + ')');
    if (m === 0xdb) { let k = 0; while (k < seg.length) { const pq = seg[k] >> 4, tq = seg[k] & 15; const t = []; for (let j = 0; j < 64; j++) t.push(pq ? (seg[k + 1 + 2 * j] << 8) | seg[k + 2 + 2 * j] : seg[k + 1 + j]); out.dqt.push({ tq, t: t.slice(0, 8).join(',') }); k += 1 + 64 * (pq ? 2 : 1); } }
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
      const nc = seg[5]; const comps = []; for (let c = 0; c < nc; c++) comps.push(`${seg[6 + 3 * c]}:${seg[7 + 3 * c] >> 4}x${seg[7 + 3 * c] & 15}q${seg[8 + 3 * c]}`);
      out.sof = { type: nom, h: (seg[1] << 8) | seg[2], w: (seg[3] << 8) | seg[4], comps };
    }
    if (m === 0xda) { out.scans++; i += 2 + len; while (i < b.length && !(b[i] === 0xff && b[i + 1] !== 0 && !(b[i + 1] >= 0xd0 && b[i + 1] <= 0xd7))) i++; continue; }
    i += 2 + len;
  }
  return out;
}
if (process.argv[2]) for (const f of process.argv.slice(2)) { const r = info(fs.readFileSync(f)); console.log(f, JSON.stringify({ ...r, marqueurs: r.marqueurs.join(' ') })); }
