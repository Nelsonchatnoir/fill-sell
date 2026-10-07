import * as T from './texte.js';
export function idf(N) {
  const df = new Map(); for (const n of N) for (const t of n.je) df.set(t, (df.get(t) || 0) + 1);
  const tot = N.length; const w = (t) => Math.log((tot + 1) / ((df.get(t) || 0) + 1)) + 0.1;
  return w;
}
export function wjac(A, B, w) {
  let c = 0, u = 0; for (const a of A) { u += w(a); if (B.has(a)) c += w(a); } for (const b of B) if (!A.has(b)) u += w(b);
  return u ? c / u : 0;
}
