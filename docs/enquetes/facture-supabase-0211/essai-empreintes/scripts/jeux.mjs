// Les deux jeux d'empreintes, sous la forme COMPACTE que lit le moteur en prod
// (rapprochement_v3_empreintes_compactes → photos.js photoDepuisCompacte) :
//   [url, dhashHex, phashHex, aDesVariantes(1|0), c70d, c70p, p85d, p85p, g45d, g45p, g60d, g60p, g35d, g35p]
// A = toutes les lignes STOCKÉES (donnees/empreintes-A.ndjson, lues en prod le 02/11).
// B = les mêmes, où CHAQUE ligne de notre bucket (listing-photos) est remplacée par sa version NOUVELLE
//     (donnees/B/shard*.ndjson, code 40e4bd3) : dhash, phash, couleur, et les variantes quand la ligne
//     A en a (une ligne A sans variantes reste sans variantes : seule la MÉTHODE change). Une photo que
//     la nouvelle méthode refuse (illisible, trop de pixels, fichier absent…) est ABSENTE de B.
//     Les lignes hors bucket sont identiques dans A et B.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const W = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const PREFIXE = 'https://tojihnuawsoohlolangc.supabase.co/storage/v1/object/public/listing-photos/';
export const estBucket = (u) => typeof u === 'string' && u.startsWith(PREFIXE);
const K = ['c70', 'p85', 'g45', 'g60', 'g35'];

export function bitsVersHexa(b) {
  if (typeof b !== 'string' || !/^[01]{64}$/.test(b)) return b == null ? null : { brut: b };
  let h = '';
  for (let i = 0; i < 64; i += 4) h += parseInt(b.slice(i, i + 4), 2).toString(16);
  return h;
}
export function hexaVersBits(h) {
  if (typeof h !== 'string' || h.length !== 16) return null;
  let b = '';
  for (const c of h) b += parseInt(c, 16).toString(2).padStart(4, '0');
  return b;
}

/** A : Map url → compacte ; meta : Map url → { couleur, largeur, hauteur, source, calculee_le } */
export function chargerA() {
  const A = new Map(), meta = new Map();
  const txt = fs.readFileSync(path.join(W, 'donnees', 'empreintes-A.ndjson'), 'utf8');
  let i = 0;
  while (i < txt.length) {
    let j = txt.indexOf('\n', i); if (j < 0) j = txt.length;
    if (j > i) {
      const r = JSON.parse(txt.slice(i, j));
      const v = Array.isArray(r[4]) ? r[4] : null;
      A.set(r[0], [r[0], r[1], r[2], v ? 1 : 0, ...(v ?? Array(10).fill(null))]);
      meta.set(r[0], { couleur: r[3], largeur: r[5], hauteur: r[6], source: r[7], calculee_le: r[8], brutVar: r[4] && !Array.isArray(r[4]) ? r[4] : undefined });
    }
    i = j + 1;
  }
  return { A, meta };
}

/** Les résultats de la nouvelle méthode : Map url → ligne de sortie (ok ou erreur). */
export function chargerCalculs() {
  const dir = path.join(W, 'donnees', 'B');
  const res = new Map();
  for (const f of fs.readdirSync(dir).filter((x) => /^shard\d+\.ndjson$/.test(x)).sort()) {
    for (const l of fs.readFileSync(path.join(dir, f), 'utf8').split('\n')) {
      if (!l.trim()) continue;
      let o; try { o = JSON.parse(l); } catch { continue; }
      // une ligne réussie l'emporte sur un échec passager noté avant elle (reprise)
      if (res.has(o.url) && !res.get(o.url).erreur) continue;
      res.set(o.url, o);
    }
  }
  return res;
}

/** B à partir de A et des calculs. Rend { B, refusees: Map url → motif, manquantes: [url] (bucket sans calcul) }. */
export function construireB(A, calculs) {
  const B = new Map(A);
  const refusees = new Map();
  const manquantes = [];
  for (const [url, a] of A) {
    if (!estBucket(url)) continue;
    const c = calculs.get(url);
    if (!c) { manquantes.push(url); B.delete(url); continue; }
    if (c.erreur) { refusees.set(url, c.erreur); B.delete(url); continue; }
    const avecVar = a[3] === 1;
    const v = avecVar ? K.flatMap((k) => [bitsVersHexa(c.variantes?.[k]?.[0]), bitsVersHexa(c.variantes?.[k]?.[1])]) : Array(10).fill(null);
    B.set(url, [url, bitsVersHexa(c.dhash), bitsVersHexa(c.phash), avecVar ? 1 : 0, ...v]);
  }
  return { B, refusees, manquantes };
}

// ── distances sur la forme compacte ──
const pc32 = (x) => { x -= (x >>> 1) & 0x55555555; x = (x & 0x33333333) + ((x >>> 2) & 0x33333333); return (((x + (x >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24; };
export const hex2 = (h) => (typeof h === 'string' && h.length === 16) ? [parseInt(h.slice(0, 8), 16) >>> 0, parseInt(h.slice(8), 16) >>> 0] : null;
export const hamHex = (a, b) => { const x = hex2(a), y = hex2(b); return x && y ? pc32(x[0] ^ y[0]) + pc32(x[1] ^ y[1]) : null; };
export const hamTexte = (a, b) => { if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return null; let n = 0; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) n++; return n; };
