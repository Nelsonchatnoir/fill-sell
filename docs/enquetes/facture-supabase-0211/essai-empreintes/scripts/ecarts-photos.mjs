// Les photos aux plus grands écarts A ↔ B (dHash, pHash) : distribution fine, dimensions, exemples.
import fs from 'node:fs';
import path from 'node:path';
import { W, chargerA, chargerCalculs, hamHex, bitsVersHexa } from './jeux.mjs';
const { A, meta } = chargerA();
const C = chargerCalculs();
const lignes = [];
for (const [url, c] of C) {
  if (c.erreur) continue;
  const a = A.get(url), m = meta.get(url);
  const dd = hamHex(a[1], bitsVersHexa(c.dhash)), dp = hamHex(a[2], bitsVersHexa(c.phash));
  lignes.push({ url, dd, dp, A: `${m.largeur}x${m.hauteur}`, B: `${c.largeur}x${c.hauteur}`, source: m.source, le: m.calculee_le,
    ratioA: m.largeur / m.hauteur, ratioB: c.largeur / c.hauteur, ext: (url.match(/\.(\w+)$/) || [])[1] });
}
const h = {}; for (const l of lignes) { const k = Math.min(l.dd, 40); h[k] = (h[k] ?? 0) + 1; }
console.log('dHash Δ fin :', JSON.stringify(h));
const hp = {}; for (const l of lignes) { const k = Math.min(l.dp, 40); hp[k] = (hp[k] ?? 0) + 1; }
console.log('pHash Δ fin :', JSON.stringify(hp));
const gros = lignes.filter((l) => l.dd >= 5 || l.dp >= 5);
const orient = gros.filter((l) => Math.abs(l.ratioA - 1 / l.ratioB) < 0.02 && Math.abs(l.ratioA - l.ratioB) > 0.02).length;
const memeRatio = gros.filter((l) => Math.abs(l.ratioA - l.ratioB) <= 0.02).length;
const ext = {}; for (const l of gros) ext[l.ext] = (ext[l.ext] ?? 0) + 1;
console.log('Δ ≥ 5 :', gros.length, '— ratio inversé (rotation EXIF ?)', orient, '— même ratio', memeRatio, 'ext', JSON.stringify(ext));
fs.writeFileSync(path.join(W, 'donnees', 'photos-grands-ecarts.json'), JSON.stringify(gros.sort((x, y) => y.dd - x.dd), null, 1));
for (const l of gros.slice(0, 8)) console.log(l.dd, l.dp, l.A, '→', l.B, l.source, l.url.slice(81));
