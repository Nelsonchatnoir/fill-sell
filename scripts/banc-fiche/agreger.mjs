// BANC « OUVERTURE DE LA FICHE » (31/10) — 3. profils CPU : temps propre et inclusif par fonction (mesurer.mjs … profil.json).
import fs from 'node:fs';
const p = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const parId = new Map(p.nodes.map((n) => [n.id, n]));
const parent = new Map(); for (const n of p.nodes) for (const c of n.children ?? []) parent.set(c, n.id);
const self = new Map(); const dt = p.timeDeltas; const total = new Map();
for (let i = 0; i < p.samples.length; i++) { const id = p.samples[i]; self.set(id, (self.get(id) || 0) + (dt[i] || 0)); }
const cle = (n) => `${n.callFrame.functionName || '(anon)'} ${n.callFrame.url.split('/').pop()}:${n.callFrame.lineNumber + 1}`;
const parFn = new Map(); const inclus = new Map();
for (const [id, t] of self) {
  const n = parId.get(id); const k = cle(n); parFn.set(k, (parFn.get(k) || 0) + t);
  const vus = new Set(); let x = id; while (x != null) { const kk = cle(parId.get(x)); if (!vus.has(kk)) { inclus.set(kk, (inclus.get(kk) || 0) + t); vus.add(kk); } x = parent.get(x); }
}
const top = (m, k) => [...m].sort((a, b) => b[1] - a[1]).slice(0, k).map(([n, t]) => `${(t / 1000).toFixed(0).padStart(6)} ms  ${n}`).join('\n');
console.log('--- SELF ---\n' + top(parFn, 25)); console.log('--- INCLUSIF ---\n' + top(inclus, 45));
