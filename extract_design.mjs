import fs from 'fs';
import zlib from 'zlib';
import path from 'path';

const binPath = 'C:/Users/nicol/.claude/projects/C--Users-nicol-fill-and-sell/e69807e3-50cc-4dbe-bf87-a39b1bbe45b7/tool-results/webfetch-1778189133762-vy6npi.bin';
const outDir = 'C:/Users/nicol/fill-and-sell/design_extract';

const bin = fs.readFileSync(binPath);
const decompressed = zlib.gunzipSync(bin);
console.log('Decompressed size:', decompressed.length);

const files = {};
let offset = 0;
while (offset + 512 <= decompressed.length) {
  const header = decompressed.slice(offset, offset + 512);
  const name = header.slice(0, 100).toString('utf8').replace(/\0/g, '').trim();
  if (!name) { offset += 512; continue; }
  const sizeOctal = header.slice(124, 136).toString('utf8').replace(/\0/g, '').trim();
  const size = parseInt(sizeOctal, 8) || 0;
  const typeFlag = String.fromCharCode(header[156]);
  offset += 512;
  if (size > 0 && typeFlag !== '5') {
    files[name] = decompressed.slice(offset, offset + size);
  }
  offset += Math.ceil(size / 512) * 512;
}

console.log('Files found:', Object.keys(files));

fs.mkdirSync(outDir, { recursive: true });
for (const [name, buf] of Object.entries(files)) {
  const filePath = path.join(outDir, name);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, buf);
  console.log('Wrote:', name, '(', buf.length, 'bytes)');
}
