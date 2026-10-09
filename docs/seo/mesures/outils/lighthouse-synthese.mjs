// Synthèse légère des rapports Lighthouse (lh/*.json) -> un .json par mesure + médianes.
// Usage : node lh-synth.mjs <dossier lh> <dossier de sortie>
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const [src, out] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const METRICS = ['first-contentful-paint', 'largest-contentful-paint', 'total-blocking-time', 'cumulative-layout-shift', 'speed-index', 'interactive', 'max-potential-fid', 'server-response-time'];
const files = readdirSync(src).filter(f => /^(home|blog|cross-listing|extension)-(mobile|desktop)-\d\.json$/.test(f)).sort();
const all = [];
for (const f of files) {
  const r = JSON.parse(readFileSync(path.join(src, f), 'utf8'));
  const [page, ff, run] = f.replace('.json', '').split(/-(?=mobile|desktop)|-(?=\d$)/);
  const scores = Object.fromEntries(Object.entries(r.categories).map(([k, c]) => [k, Math.round(c.score * 100)]));
  const metrics = Object.fromEntries(METRICS.filter(m => r.audits[m]).map(m => [m, { valeur: r.audits[m].numericValue, affiche: r.audits[m].displayValue }]));
  const lcpEl = r.audits['lcp-breakdown-insight']?.details?.items?.find(i => i.type === 'node');
  const echecs = {};
  for (const [k, c] of Object.entries(r.categories)) {
    echecs[k] = c.auditRefs.map(a => r.audits[a.id])
      .filter(a => a && a.score !== null && a.score < 0.9 && !['informative', 'notApplicable', 'manual'].includes(a.scoreDisplayMode))
      .map(a => `${a.id}${a.displayValue ? ` (${a.displayValue})` : ''}`);
  }
  const reqs = r.audits['network-requests']?.details?.items ?? [];
  const s = {
    mesure: f.replace('.json', ''),
    methode: `Lighthouse ${r.lighthouseVersion} local (npx), ${r.configSettings.formFactor}, throttling ${r.configSettings.throttlingMethod}`,
    url: r.finalDisplayedUrl ?? r.finalUrl,
    date_utc: r.fetchTime,
    agent_emule: r.environment?.networkUserAgent,
    chrome_hote: r.environment?.hostUserAgent,
    benchmark_index: r.environment?.benchmarkIndex,
    scores, metriques: metrics,
    element_lcp: lcpEl ? { selecteur: lcpEl.selector, texte: lcpEl.nodeLabel } : null,
    requetes: reqs.length,
    poids_transfere_kio: Math.round(reqs.reduce((t, x) => t + (x.transferSize || 0), 0) / 1024),
    audits_sous_90: echecs,
    erreurs_execution: r.runtimeError ?? null, avertissements: r.runWarnings,
  };
  writeFileSync(path.join(out, `lighthouse-${s.mesure}.json`), JSON.stringify(s, null, 2));
  all.push({ page, ff, s });
}
const med = a => { const b = [...a].sort((x, y) => x - y); return b[Math.floor(b.length / 2)]; };
const groups = {};
for (const { page, ff, s } of all) (groups[`${page}-${ff}`] ??= []).push(s);
const synth = {};
for (const [k, arr] of Object.entries(groups)) {
  synth[k] = {
    url: arr[0].url, passages: arr.length,
    scores_medians: Object.fromEntries(Object.keys(arr[0].scores).map(c => [c, med(arr.map(x => x.scores[c]))])),
    scores_par_passage: arr.map(x => x.scores),
    metriques_medianes: Object.fromEntries(Object.keys(arr[0].metriques).map(m => [m, Math.round(med(arr.map(x => x.metriques[m].valeur)) * 1000) / 1000])),
    element_lcp: arr[0].element_lcp,
    poids_transfere_kio: med(arr.map(x => x.poids_transfere_kio)), requetes: med(arr.map(x => x.requetes)),
  };
}
writeFileSync(path.join(out, 'lighthouse-synthese-medianes.json'), JSON.stringify({ date: '2026-10-09', methode: all[0]?.s.methode.replace(/, (mobile|desktop),/, ','), note: 'médiane de 3 passages par page et par appareil ; unités : ms sauf CLS', mesures: synth }, null, 2));
for (const [k, v] of Object.entries(synth)) {
  const m = v.metriques_medianes;
  console.log(k.padEnd(24), JSON.stringify(v.scores_medians), 'LCP', m['largest-contentful-paint'], 'FCP', m['first-contentful-paint'], 'TBT', m['total-blocking-time'], 'CLS', m['cumulative-layout-shift'], 'SI', m['speed-index'], 'TTI', m.interactive, '| runs', v.scores_par_passage.map(x => x.performance).join('/'), '|', v.poids_transfere_kio, 'KiB', v.requetes, 'req | LCP el:', v.element_lcp?.texte?.slice(0, 50));
}
