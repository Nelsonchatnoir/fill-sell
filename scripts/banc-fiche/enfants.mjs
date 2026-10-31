// BANC « OUVERTURE DE LA FICHE » (31/10) — 3b. ce que coûte chaque appel fait DEPUIS une fonction (node enfants.mjs profil.json StockTab).
import fs from 'node:fs';
const p = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')); const cible = process.argv[3] || 'StockTab';
const parId = new Map(p.nodes.map((n) => [n.id, n])); const self = new Map();
for (let i = 0; i < p.samples.length; i++) self.set(p.samples[i], (self.get(p.samples[i]) || 0) + (p.timeDeltas[i] || 0));
const incl = (id) => { const n = parId.get(id); let t = self.get(id) || 0; for (const c of n.children ?? []) t += incl(c); return t; };
const agg = new Map();
for (const n of p.nodes) if (n.callFrame.functionName === cible) for (const c of n.children ?? []) { const cn = parId.get(c); const k = `${cn.callFrame.functionName || '(anon)'}:${cn.callFrame.lineNumber + 1}`; agg.set(k, (agg.get(k) || 0) + incl(c)); }
console.log([...agg].sort((a, b) => b[1] - a[1]).slice(0, 30).map(([k, t]) => `${(t / 1000).toFixed(1).padStart(7)} ms ${k}`).join('\n'));
