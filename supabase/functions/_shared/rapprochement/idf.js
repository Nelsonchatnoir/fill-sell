import * as T from './texte.js';
// (12/10) Le poids d'un mot ne se calcule qu'à la première question : une
// invocation de la passe en tranches qui ne compare rien ne lit aucun titre.
export function idf(N) {
  let df = null;
  const tot = N.length;
  return (t) => {
    if (!df) { df = new Map(); for (const n of N) for (const x of n.je) df.set(x, (df.get(x) || 0) + 1); }
    return Math.log((tot + 1) / ((df.get(t) || 0) + 1)) + 0.1;
  };
}
export function wjac(A, B, w) {
  let c = 0, u = 0; for (const a of A) { u += w(a); if (B.has(a)) c += w(a); } for (const b of B) if (!A.has(b)) u += w(b);
  return u ? c / u : 0;
}
