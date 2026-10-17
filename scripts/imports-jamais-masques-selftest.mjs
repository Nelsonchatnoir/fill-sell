// selftest:imports-jamais-masques — un nom IMPORTÉ n'est jamais redéclaré
// (const/let/var/function/class) dans le même fichier (18/10, 20:18 : écran blanc
// ced6cfd — StockTab importait `alertesCompte` et possédait déjà une constante
// locale du même nom ; la constante masque l'import dans tout le composant, le
// useMemo l'a lue avant son initialisation : ReferenceError pour tout le parc,
// invisible au build). Règle : l'import prend un autre nom (`as`), jamais l'ombre.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fichiers = [];
const marcher = (d) => { for (const f of readdirSync(d)) { const p = path.join(d, f); if (statSync(p).isDirectory()) marcher(p); else if (/\.(jsx?|mjs)$/.test(f)) fichiers.push(p); } };
marcher(path.join(RACINE, 'src'));
let ko = 0, importsVus = 0;
const sansTextes = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
for (const f of fichiers) {
  const src = sansTextes(readFileSync(f, 'utf8').replace(/\r\n/g, '\n'));
  const noms = new Set();
  for (const m of src.matchAll(/^import\s+(?:(\w+)\s*,?\s*)?(?:\{([^}]*)\})?\s*(?:,\s*\*\s+as\s+(\w+))?\s*from\s+['"][^'"]+['"]/gm)) {
    if (m[1]) noms.add(m[1]);
    if (m[3]) noms.add(m[3]);
    for (const part of (m[2] ?? '').split(',')) {
      const seg = part.trim(); if (!seg) continue;
      const alias = seg.match(/\bas\s+(\w+)$/); noms.add(alias ? alias[1] : seg.split(/\s+/)[0]);
    }
  }
  for (const m of src.matchAll(/^import\s+\*\s+as\s+(\w+)\s+from/gm)) noms.add(m[1]);
  for (const n of noms) {
    if (!/^[A-Za-z_$][\w$]*$/.test(n)) continue;
    importsVus++;
    const re = new RegExp(`(?<![\w$.])(?:const|let|var|function|class)\s+${n}(?![\w$])`, 'g');
    const hits = [...src.matchAll(re)];
    if (hits.length) {
      ko++;
      const ligne = src.slice(0, hits[0].index).split('\n').length;
      console.log(`✗ ${path.relative(RACINE, f)} : l'import « ${n} » est redéclaré localement (ligne ${ligne})`);
    }
  }
}
console.log(ko ? `\n${ko} ombre(s) sur ${importsVus} imports — à renommer avec « as ».` : `\n✓ aucun import masqué (${importsVus} imports, ${fichiers.length} fichiers)`);
process.exit(ko ? 1 : 0);
