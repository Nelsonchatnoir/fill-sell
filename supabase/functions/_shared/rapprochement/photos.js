// ═══════════════════════════════════════════════════════════════════════════
// LA PHOTO : « ces deux images sont-elles la même ? » (08/10/2026, multi-synchro)
// ═══════════════════════════════════════════════════════════════════════════
// Une annonce porte jusqu'à 6 photos ; chaque photo porte PLUSIEURS lectures
// (photo_empreintes.dhash/phash = l'image entière, photo_empreintes.variantes =
// centre 70 % et quatre carrés centraux à des échelles différentes). Mesuré le
// 07/10 sur Corinne : Vinted recadre en 3:4, Leboncoin met un filigrane et sert
// une vignette 79×140 ; deux photos IDENTIQUES ressortaient à 11-31 bits de
// distance sur l'image entière, 0-4 sur un carré central. La distance d'une
// paire de photos est donc la MEILLEURE de ses lectures ; la distance de deux
// annonces, un appariement glouton 1-1 de leurs photos (jamais la même photo
// comptée deux fois).
// ⛔ Aucune décision ici : ce module mesure, moteur.js tranche.
const pc32 = (x) => { x -= (x >>> 1) & 0x55555555; x = (x & 0x33333333) + ((x >>> 2) & 0x33333333); return (((x + (x >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24; };

/** Chaîne de 64 bits → deux entiers non signés (null si illisible). */
export function bits(s) {
  if (typeof s !== 'string' || s.length !== 64) return null;
  return [parseInt(s.slice(0, 32), 2) >>> 0, parseInt(s.slice(32), 2) >>> 0];
}
/** Distance de Hamming entre deux empreintes (99 si l'une manque). */
export const ham = (a, b) => (a && b) ? pc32(a[0] ^ b[0]) + pc32(a[1] ^ b[1]) : 99;

/** Les variantes attendues dans photo_empreintes.variantes (clé → [dhash, phash]). */
export const VARIANTES = Object.freeze(['c70', 'p85', 'g45', 'g60', 'g35']);

/**
 * Une photo prête à comparer, depuis une ligne photo_empreintes
 * { url, dhash, phash, variantes: { c70: [d, p], p85: [d, p], … } }.
 * Rend null si l'image entière n'a pas d'empreinte.
 */
export function photoDepuisEmpreinte(row) {
  if (!row) return null;
  const d = bits(row.dhash), p = bits(row.phash);
  if (!d || !p) return null;
  const lectures = [{ k: 'plein', d, p }];
  const v = row.variantes && typeof row.variantes === 'object' ? row.variantes : {};
  for (const k of VARIANTES) {
    const x = v[k];
    if (Array.isArray(x) && x.length === 2) { const dd = bits(x[0]), pp = bits(x[1]); if (dd && pp) lectures.push({ k, d: dd, p: pp }); }
  }
  return { u: row.url, lectures };
}

/** Distance d'une lecture : le dHash, et le pHash pondéré (il est plus sévère). */
const dLecture = (a, b) => Math.max(ham(a.d, b.d), ham(a.p, b.p) * 0.8);

/** Distance de deux photos : la meilleure de toutes les paires de lectures. */
export function dPhoto(a, b) {
  let m = 99;
  for (const x of a.lectures) for (const y of b.lectures) { const v = dLecture(x, y); if (v < m) m = v; }
  return m;
}

/**
 * Deux ensembles de photos : appariement glouton 1-1, de la paire la plus
 * proche à la plus lointaine. { best, second, liste } (99 = rien à comparer).
 */
export function comparerPhotos(A, B) {
  if (!A?.length || !B?.length) return { best: 99, second: 99, liste: [] };
  const paires = [];
  for (let i = 0; i < A.length; i++) for (let j = 0; j < B.length; j++) paires.push([dPhoto(A[i], B[j]), i, j]);
  paires.sort((x, y) => x[0] - y[0]);
  const ui = new Set(), uj = new Set(), choisies = [];
  for (const [d, i, j] of paires) { if (ui.has(i) || uj.has(j)) continue; ui.add(i); uj.add(j); choisies.push(d); }
  return { best: choisies[0] ?? 99, second: choisies[1] ?? 99, liste: choisies };
}
