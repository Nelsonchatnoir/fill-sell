// ═══════════════════════════════════════════════════════════════════════════
// LES AUTRES DÉCISIONS QUI LISENT UNE EMPREINTE, rejouées à blanc avec A puis B
// ═══════════════════════════════════════════════════════════════════════════
// Par compte (donnees/emp/<u>.json : A et B de toutes ses photos ; donnees/tables : lignes brutes) :
//  P. TOUTES les paires de photos du compte qui touchent une photo de notre bucket : distance du moteur
//     (photos.js dPhoto, lectures plein + 5 variantes) et image entière (dHash, pHash), avec A puis B ;
//     chaque prédicat de décision compté (vrai A seulement / vrai B seulement / les deux) :
//       identique SQL (d ≤ 5 et p ≤ 8), proche SQL (d ≤ 10), dHash égal, pHash égal, moteur ≤ 2/4/7/9/12/14/16.
//  Q. SQL photos_distance (inventaire_doublon_evaluer → meme_objet_niveau) : TOUTES les paires de fiches
//     en stock du compte, fiche_photos_toutes (corps lu en prod), verdict identique / proche / differente / inconnue.
//  R. SQL sur les couvertures : fusion_photo_candidates (paires, degrés, autres photos), rapprochement_photo_decisions
//     (chaque annonce), fiches_meme_photo_questions (pHash égal), beebs_numeros_par_sequence, trancher_publications_sans_lien.
//  S. JS trancherParPhotos / niveauPhoto (annonce-partagee.js, importé tel quel) : dépôt (photos de notre copie) ↔
//     annonces de sa plateforme (depot-sans-numero, depot-coupe-tranche, recreation-deja-partie, beebs-lien,
//     get-pending-jobs) ; annonce ↔ fiche (rapprochement-ia, titre-aligne / handler-watch).
// Usage : node rejouer-autres.mjs [k n]
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { W, estBucket, hexaVersBits } from './jeux.mjs';

const R = 'C:/Users/nicol/fill-and-sell/supabase/functions/_shared/';
const { photoDepuisCompacte, photoDepuisEmpreinte, dPhoto, comparerPhotos } = await import(pathToFileURL(R + 'rapprochement/photos.js').href);
const { niveauPhoto } = await import(pathToFileURL(R + 'annonce-partagee.js').href);

const [k = 0, n = 1] = process.argv.slice(2).map(Number);
const dirE = path.join(W, 'donnees', 'emp'), dirR = path.join(W, 'donnees', 'resultats', 'autres');
fs.mkdirSync(dirR, { recursive: true });

// ── les tables brutes, par compte ──
function lireTable(nom) {
  const txt = fs.readFileSync(path.join(W, 'donnees', 'tables', nom + '.ndjson'), 'utf8').split('\n');
  const par = new Map();
  for (let i = 1; i < txt.length; i++) { if (!txt[i]) continue; const r = JSON.parse(txt[i]); let l = par.get(r[1]); if (!l) par.set(r[1], (l = [])); l.push(r); }
  return par;
}
const INV = lireTable('inventaire'), ANN = lireTable('annonces'), JOBS = lireTable('jobs');
const comptes = fs.readdirSync(dirE).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)).sort().filter((_, i) => i % n === k)
  .filter((x) => !process.env.SEUL || process.env.SEUL.split(',').includes(x));

// ── popcount, lectures ──
const pc32 = (x) => { x -= (x >>> 1) & 0x55555555; x = (x & 0x33333333) + ((x >>> 2) & 0x33333333); return (((x + (x >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24; };
const httpsOk = (u) => typeof u === 'string' && /^https?:\/\//.test(u);
const https = (u) => typeof u === 'string' && /^https:\/\//.test(u);

/** Une photo prête : lectures (photoDepuisCompacte du dépôt) en Int32Array [d0,d1,p0,p1]×n, et l'image entière. */
function preparer(r) {
  const ph = photoDepuisCompacte(r);
  if (!ph) return null;
  const L = new Int32Array(ph.lectures.length * 4);
  ph.lectures.forEach((l, q) => { L[4 * q] = l.d[0] | 0; L[4 * q + 1] = l.d[1] | 0; L[4 * q + 2] = l.p[0] | 0; L[4 * q + 3] = l.p[1] | 0; });
  return { L, n: ph.lectures.length, ph, dh: r[1], phx: r[2] };
}
/** dPhoto (photos.js) exacte quand elle est ≤ PLAFOND, sinon 99 — mêmes valeurs (vérifié contre dPhoto du dépôt). */
const PLAFOND = 16;
function dPhotoBornee(a, b) {
  let m = 99;
  const A = a.L, B = b.L;
  for (let x = 0; x < a.n; x++) {
    const ad0 = A[4 * x], ad1 = A[4 * x + 1], ap0 = A[4 * x + 2], ap1 = A[4 * x + 3];
    for (let y = 0; y < b.n; y++) {
      const dd = pc32(ad0 ^ B[4 * y]) + pc32(ad1 ^ B[4 * y + 1]);
      if (dd >= m || dd > PLAFOND) continue;
      const dp = (pc32(ap0 ^ B[4 * y + 2]) + pc32(ap1 ^ B[4 * y + 3])) * 0.8;
      const v = dd > dp ? dd : dp;
      if (v < m) m = v;
    }
  }
  return m <= PLAFOND ? m : 99;
}
// image entière : dHash et pHash de la première lecture (« plein »), sans allocation
const pd = (a, b) => pc32(a.L[0] ^ b.L[0]) + pc32(a.L[1] ^ b.L[1]);
const pp = (a, b) => pc32(a.L[2] ^ b.L[2]) + pc32(a.L[3] ^ b.L[3]);
// ── fin des distances ──

// ── fonctions SQL, corps lus en prod (defs/*.sql) ──
const elementUrl = (e) => e; // les tables ont déjà extrait la chaîne, ou url / original (fiche_photos_urls)
/** fiche_photos_urls(p, n) : les n premières URL http(s) */
const fichePhotosUrls = (urls, nmax) => urls.filter(httpsOk).slice(0, nmax);
/** fiche_couverture(p) : la première URL http(s) parmi les éléments 0, 1, 2 */
const ficheCouverture = (urls) => urls.slice(0, 3).find(httpsOk) ?? null;
/** annonce_photos_urls(photo_url, capture, n) */
function annoncePhotosUrls(a, nmax) {
  const vus = new Map();
  [[a[4], 0], ...a[5].map((u, i) => [u, i + 1])].forEach(([u, o]) => { if (httpsOk(u) && !vus.has(u)) vus.set(u, o); });
  return [...vus.entries()].sort((x, y) => x[1] - y[1]).slice(0, nmax).map((x) => x[0]);
}
/** fiche_photos_toutes(id) */
function fichePhotosToutes(f, annoncesDe) {
  const r = new Map();
  fichePhotosUrls(f[8], 3).forEach((u, i) => { if (!r.has(u) || r.get(u) > i + 1) r.set(u, i + 1); });
  for (const a of annoncesDe.get(f[0]) ?? []) annoncePhotosUrls(a, 2).forEach((u, i) => { if (!r.has(u) || r.get(u) > 10 + i + 1) r.set(u, 10 + i + 1); });
  return [...r.entries()].sort((x, y) => x[1] - y[1]).slice(0, 8).map((x) => x[0]);
}
/** photos_distance(p_a, p_b) : la paire au plus petit d + p (puis d), son verdict ; 'inconnue' sans empreinte */
function photosDistance(SA, SB) {
  let bd = -1, bp = -1;
  for (const a of SA) for (const b of SB) {
    const d = pd(a, b), p = pp(a, b);
    if (bd < 0 || d + p < bd + bp || (d + p === bd + bp && d < bd)) { bd = d; bp = p; }
  }
  if (bd < 0) return { v: 'inconnue', d: null, p: null };
  const d = bd, p = bp;
  return { v: d <= 5 && p <= 8 ? 'identique' : d <= 10 ? 'proche' : 'differente', d, p };
}
const identique = (a, b) => !!a && !!b && pd(a, b) <= 5 && pp(a, b) <= 8;

// ── JS : urlsPhotos (recreation-deja-partie.js), urlsAnnonce (depot-sans-numero.js) ──
const urlsPhotos = (v, nmax = 6) => v.filter(https).slice(0, nmax);
const urlsAnnonceJs = (a) => [...new Set([...urlsPhotos(a[6], 4), ...urlsPhotos([a[4]], 1)])];
/** la ligne photo_empreintes { url, dhash, phash, variantes } d'une compacte (pour photoDepuisEmpreinte, comme en prod JS) */
const K = ['c70', 'p85', 'g45', 'g60', 'g35'];
function ligne(r) {
  if (!r) return undefined;
  return { url: r[0], dhash: hexaVersBits(r[1]), phash: hexaVersBits(r[2]),
    variantes: r[3] === 1 ? Object.fromEntries(K.map((k, q) => [k, [hexaVersBits(r[4 + 2 * q]), hexaVersBits(r[5 + 2 * q])]])) : null };
}

const t0 = Date.now();
for (const u of comptes) {
  const sortie = path.join(dirR, u + '.json');
  if (fs.existsSync(sortie)) continue;
  const t1 = Date.now();
  const emp = JSON.parse(fs.readFileSync(path.join(dirE, u + '.json'), 'utf8'));
  const rA = new Map(emp.A.map((r) => [r[0], r])), rB = new Map(emp.B.map((r) => [r[0], r]));
  const pA = new Map(), pB = new Map();
  for (const [url, r] of rA) { const x = preparer(r); if (x) pA.set(url, x); }
  for (const [url, r] of rB) { const x = preparer(r); if (x) pB.set(url, x); }
  const inv = INV.get(u) ?? [], ann = ANN.get(u) ?? [], jobs = JOBS.get(u) ?? [];
  const res = { user: u, photos: pA.size, bucket: [...pA.keys()].filter(estBucket).length, refusees: Object.keys(emp.refusees ?? {}).length };

  // ── P. paires de photos ──
  const urls = [...pA.keys()];
  const bucketIdx = urls.map((x, i) => (estBucket(x) ? i : -1)).filter((i) => i >= 0);
  const estB = new Uint8Array(urls.length); for (const i of bucketIdx) estB[i] = 1;
  const PA = urls.map((x) => pA.get(x)), PB = urls.map((x) => pB.get(x) ?? null);
  const predicats = { identique_sql: [0, 0, 0], proche_sql: [0, 0, 0], dhash_egal: [0, 0, 0], phash_egal: [0, 0, 0] };
  for (const t of [2, 4, 7, 9, 12, 14, 16]) predicats['moteur_le_' + t] = [0, 0, 0];
  const proches = []; // paires gardées : [i, j, dA, dB, fdA, fpA, fdB, fpB]
  let pairesP = 0, pairesSansB = 0, distChangee = 0, margeMin = null, margeEx = null;
  const flips = [];
  const SEUILS_D = [2, 4, 7, 9, 12, 14, 16];
  for (const i of bucketIdx) {
    const ai = PA[i], bi = PB[i];
    for (let j = 0; j < urls.length; j++) {
      if (j === i || (estB[j] && j < i)) continue;
      pairesP++;
      const aj = PA[j], bj = PB[j];
      const dA = dPhotoBornee(ai, aj);
      const fdA = pd(ai, aj), fpA = pp(ai, aj);
      let dB = null, fdB = null, fpB = null;
      if (bi && bj) { dB = dPhotoBornee(bi, bj); fdB = pd(bi, bj); fpB = pp(bi, bj); } else pairesSansB++;
      const garder = dA <= 16 || fdA <= 10 || fpA <= 8 || (dB !== null && (dB <= 16 || fdB <= 10 || fpB <= 8));
      if (!garder) continue;
      proches.push([i, j, dA, dB, fdA, fpA, fdB, fpB]);
      const vA = { identique_sql: fdA <= 5 && fpA <= 8, proche_sql: fdA <= 10, dhash_egal: fdA === 0, phash_egal: fpA === 0 };
      const vB = dB === null ? null : { identique_sql: fdB <= 5 && fpB <= 8, proche_sql: fdB <= 10, dhash_egal: fdB === 0, phash_egal: fpB === 0 };
      for (const t of SEUILS_D) { vA['moteur_le_' + t] = dA <= t; if (vB) vB['moteur_le_' + t] = dB <= t; }
      let flip = false;
      for (const key of Object.keys(predicats)) {
        const a = vA[key], b = vB ? vB[key] : false;
        if (a && b) predicats[key][2]++; else if (a) { predicats[key][0]++; flip = true; } else if (b) { predicats[key][1]++; flip = true; }
      }
      if (flip) flips.push({ a: urls[i], b: urls[j], dA, dB, pleinA: [fdA, fpA], pleinB: vB ? [fdB, fpB] : null });
      else if (vB && (dA !== dB || fdA !== fdB || fpA !== fpB)) {
        distChangee++;
        const m = Math.min(...[dA, dB].filter((x) => x <= 16).flatMap((x) => SEUILS_D.map((t) => Math.abs(x - t))),
          Math.abs(fdB - 5), Math.abs(fdB - 10), Math.abs(fpB - 8));
        if (margeMin === null || m < margeMin) { margeMin = m; margeEx = { a: urls[i], b: urls[j], dA, dB, pleinA: [fdA, fpA], pleinB: [fdB, fpB] }; }
      }
    }
  }
  res.P = { paires: pairesP, paires_sans_B: pairesSansB, gardees: proches.length, predicats, flips: flips.length, exemples_flips: flips.slice(0, 30), distance_changee_sans_flip: distChangee, marge_min: margeMin, marge_ex: margeEx };

  // ── Q. photos_distance sur toutes les paires de fiches en stock ──
  const annoncesDe = new Map();
  for (const a of ann) if (a[7]) { let l = annoncesDe.get(a[7]); if (!l) annoncesDe.set(a[7], (l = [])); l.push(a); }
  const stock = inv.filter((f) => !f[3] && f[2] === 'stock');
  const toutes = stock.map((f) => fichePhotosToutes(f, annoncesDe));
  const SA_A = toutes.map((us) => us.map((x) => pA.get(x)).filter(Boolean)), SA_B = toutes.map((us) => us.map((x) => pB.get(x)).filter(Boolean));
  const aBucket = toutes.map((us) => us.some((x) => estBucket(x) && pA.has(x)));
  const q = { paires: 0, identiques: 0, perdues: 0, nouvelles: 0, verdict_change: 0, distance_changee_meme_verdict: 0, marge_min: null, ecarts: [] };
  for (let x = 0; x < stock.length; x++) for (let y = x + 1; y < stock.length; y++) {
    q.paires++;
    if (!aBucket[x] && !aBucket[y]) { q.identiques++; continue; }
    const a = photosDistance(SA_A[x], SA_A[y]), b = photosDistance(SA_B[x], SA_B[y]);
    if (a.v === b.v) {
      if (a.d === b.d && a.p === b.p) q.identiques++;
      else { q.distance_changee_meme_verdict++; if (b.d !== null) { const m = Math.min(Math.abs(b.d - 5), Math.abs(b.d - 10), Math.abs(b.p - 8)); if (q.marge_min === null || m < q.marge_min) q.marge_min = m; } }
      continue;
    }
    const rang = { identique: 3, proche: 2, differente: 1, inconnue: 0 };
    if (rang[a.v] > rang[b.v]) q.perdues++; else q.nouvelles++;
    q.verdict_change++;
    q.ecarts.push({ a: stock[x][0], b: stock[y][0], titreA: stock[x][7], titreB: stock[y][7], A: a, B: b });
  }
  res.Q = q;

  // ── R. couvertures ──
  const r = {};
  // fusion_photo_candidates : paires0 et degrés (fiches en stock dont la couverture a une empreinte)
  const cov = stock.map((f) => ficheCouverture(f[8]));
  const fe = (P) => stock.map((f, i) => (cov[i] && P.get(cov[i])) || null);
  const feA = fe(pA), feB = fe(pB);
  const p0 = (FE) => { const s = new Set(); const deg = new Map();
    for (let x = 0; x < FE.length; x++) if (FE[x]) for (let y = x + 1; y < FE.length; y++) if (FE[y] && identique(FE[x], FE[y])) {
      s.add(stock[x][0] + '|' + stock[y][0]); deg.set(x, (deg.get(x) ?? 0) + 1); deg.set(y, (deg.get(y) ?? 0) + 1); }
    return { s, deg }; };
  const cA = p0(feA), cB = p0(feB);
  const perduesC = [...cA.s].filter((x) => !cB.s.has(x)), nouvellesC = [...cB.s].filter((x) => !cA.s.has(x));
  let degChange = 0; for (let x = 0; x < stock.length; x++) if ((cA.deg.get(x) ?? 0) !== (cB.deg.get(x) ?? 0)) degChange++;
  // autres photos (xa, xb, x_ok) pour les paires des deux jeux
  const idx = new Map(stock.map((f, i) => [f[0], i]));
  const xs = (P, FE, ia, ib) => {
    const autres = (i) => toutes[i].map((x) => P.get(x)).filter(Boolean).filter((e) => !identique(e, FE[i]));
    const xa = autres(ia), xb = autres(ib);
    let ok = false; for (const e1 of xa) for (const e2 of xb) if (identique(e1, e2)) ok = true;
    return `${xa.length > 0}/${xb.length > 0}/${ok}`;
  };
  let xChange = 0;
  for (const c of new Set([...cA.s, ...cB.s])) { const [a, b] = c.split('|'); const ia = idx.get(a), ib = idx.get(b);
    if (xs(pA, feA, ia, ib) !== xs(pB, feB, ia, ib)) xChange++; }
  r.fusion_photo_candidates = { fiches_couverture_A: feA.filter(Boolean).length, fiches_couverture_B: feB.filter(Boolean).length,
    paires_A: cA.s.size, paires_B: cB.s.size, perdues: perduesC.length, nouvelles: nouvellesC.length, ex_perdues: perduesC.slice(0, 10), ex_nouvelles: nouvellesC.slice(0, 10),
    degres_changes: degChange, autres_photos_changees: xChange };
  // rapprochement_photo_decisions : chaque annonce (couverture photo_url) contre les couvertures des fiches en stock
  const rpd = { annonces: 0, identiques: 0, changees: 0, non_rattachees: 0, changees_non_rattachees: 0, ecarts: [] };
  const vivantesParPf = new Map();
  for (const a of ann) if (!a[8]) { let l = vivantesParPf.get(a[2]); if (!l) vivantesParPf.set(a[2], (l = [])); l.push(a); }
  const decision = (P, FE, a) => {
    const e = a[4] ? P.get(a[4]) : null;
    if (!e) return 'sans_empreinte';
    const m = []; FE.forEach((f, i) => { if (f && identique(e, f)) m.push(Number(stock[i][0])); });
    const deux = (vivantesParPf.get(a[2]) ?? []).some((y) => y[0] !== a[0] && y[4] && P.get(y[4]) && identique(P.get(y[4]), e));
    // CASE de rapprochement_photo_decisions : aucune / plusieurs / une seule (fiche, et le test « deux annonces »)
    return m.length === 0 ? 'aucune_photo_identique' : m.length > 1 ? 'plusieurs_fiches_meme_photo' : `une:${m[0]}:deux_annonces=${deux}`;
  };
  for (const a of ann) {
    if (!a[4]) continue;
    rpd.annonces++;
    const da = decision(pA, feA, a), db = decision(pB, feB, a);
    const libre = !a[7] && !a[9] && !a[8];
    if (libre) rpd.non_rattachees++;
    if (da === db) rpd.identiques++; else { rpd.changees++; if (libre) rpd.changees_non_rattachees++; rpd.ecarts.push({ annonce: a[0], platform: a[2], rattachee: !libre, photo: a[4], A: da, B: db }); }
  }
  r.rapprochement_photo_decisions = rpd;
  // fiches_meme_photo_questions : couverture photos->>0, pHash ÉGAL, fiches stock / vendu
  const fq = inv.filter((f) => !f[3] && (f[2] === 'stock' || f[2] === 'vendu') && f[9]);
  const fmpq = (RM) => { const parPh = new Map(); const s = new Set();
    for (const f of fq) { const e = RM.get(f[9]); if (!e || typeof e[2] !== 'string' || /^0+$/.test(e[2])) continue; let l = parPh.get(e[2]); if (!l) parPh.set(e[2], (l = [])); l.push(f); }
    for (const l of parPh.values()) for (let x = 0; x < l.length; x++) for (let y = 0; y < l.length; y++) {
      const a = l[x], b = l[y]; if (!(BigInt(a[0]) < BigInt(b[0]))) continue;
      if (a[5] && b[5]) continue; if (a[2] === 'vendu' && b[2] === 'vendu') continue; s.add(a[0] + '|' + b[0]); }
    return s; };
  const fA = fmpq(rA), fB = fmpq(rB);
  r.fiches_meme_photo_questions = { paires_A: fA.size, paires_B: fB.size, perdues: [...fA].filter((x) => !fB.has(x)), nouvelles: [...fB].filter((x) => !fA.has(x)) };
  // beebs_numeros_par_sequence : première photo de la fiche du dépôt Beebs ↔ photo_url des annonces Beebs vivantes à numéro
  const fiches = new Map(inv.map((f) => [f[0], f]));
  const annB = ann.filter((a) => a[2] === 'beebs' && !a[8] && /^[0-9]{6,}$/.test(String(a[3] ?? '')) && a[4]);
  const depotsB = jobs.filter((j) => j[2] === 'beebs' && j[5] && fiches.has(j[5]));
  const premiere = new Map();
  for (const j of depotsB) { const f = fiches.get(j[5]); let v = fichePhotosUrls(f[8], 1)[0] ?? null; premiere.set(j[5], v); }
  const bn = { paires: 0, identiques: 0, perdues: 0, nouvelles: 0, ex: [] };
  for (const [fid, v] of premiere) { if (!v) continue; for (const a of annB) {
    bn.paires++;
    const x = identique(pA.get(v), pA.get(a[4])), y = identique(pB.get(v), pB.get(a[4]));
    if (x === y) bn.identiques++; else { if (x) bn.perdues++; else bn.nouvelles++; if (bn.ex.length < 10) bn.ex.push({ fiche: fid, annonce: a[0], photo_fiche: v, photo_annonce: a[4], A: x, B: y }); } } }
  r.beebs_numeros_par_sequence = bn;
  // trancher_publications_sans_lien : ph->>'url' des photos de la fiche ↔ photo_url des annonces EN LIGNE, dHash ÉGAL
  const enLigne = ann.filter((a) => a[10] === 'en_ligne' && !a[8] && a[4]);
  const tp = { paires: 0, identiques: 0, perdues: 0, nouvelles: 0, ex: [] };
  const fichesAvecDepot = new Set(jobs.map((j) => j[5]).filter(Boolean));
  for (const f of inv) { if (!fichesAvecDepot.has(f[0])) continue; const us = [...new Set(f[11].filter(Boolean))];
    for (const x of us) for (const a of enLigne) { tp.paires++;
      const ea = rA.get(x), eb = rA.get(a[4]), fa = rB.get(x), fb = rB.get(a[4]);
      const vA = !!(ea && eb && ea[1] === eb[1]), vB = !!(fa && fb && fa[1] === fb[1]);
      if (vA === vB) tp.identiques++; else { if (vA) tp.perdues++; else tp.nouvelles++; if (tp.ex.length < 10) tp.ex.push({ fiche: f[0], photo: x, annonce: a[0], A: vA, B: vB }); } } }
  r.trancher_publications_sans_lien = tp;
  res.R = r;

  // ── S. trancherParPhotos / niveauPhoto ──
  // Seules les paires d'objets qui contiennent une paire de photos « proche » (≤ 16 avec A ou B) touchant notre bucket
  // peuvent changer de niveau (les seuils de niveauPhoto sont 4, 9, 12) : elles sont évaluées en entier ; les autres
  // sont « autre » avec A comme avec B (ou identiques : aucune photo de notre bucket).
  const objets = []; // { type, id, pf, urls }
  for (const j of jobs) { const us = urlsPhotos(j[6]); if (us.length) objets.push({ t: 'J', id: j[0], pf: j[2], urls: us, ref: j }); }
  for (const a of ann) { const us = urlsAnnonceJs(a); if (us.length) objets.push({ t: 'A', id: a[0], pf: a[2], urls: us, ref: a }); }
  for (const f of inv) { if (f[3]) continue; const u4 = urlsPhotos(f[10], 4), u6 = urlsPhotos(f[10], 6);
    if (u4.length) objets.push({ t: 'F4', id: f[0], pf: null, urls: u4, ref: f }); if (u6.length > u4.length) objets.push({ t: 'F6', id: f[0], pf: null, urls: u6, ref: f }); }
  const parPhoto = new Map();
  objets.forEach((o, oi) => { for (const x of o.urls) { let l = parPhoto.get(x); if (!l) parPhoto.set(x, (l = [])); l.push(oi); } });
  const compatibles = (o1, o2) => (o1.t === 'J' && o2.t === 'A' && o1.pf === o2.pf) || (o1.t === 'A' && (o2.t === 'F4' || o2.t === 'F6'));
  const aEvaluer = new Set();
  for (const [i, j, dA, dB] of proches) {
    if (!(dA <= 16 || (dB !== null && dB <= 16))) continue;
    for (const [x, y] of [[urls[i], urls[j]], [urls[j], urls[i]]]) {
      for (const o1 of parPhoto.get(x) ?? []) for (const o2 of parPhoto.get(y) ?? []) {
        if (o1 === o2) continue;
        const a = objets[o1], b = objets[o2];
        if (compatibles(a, b)) aEvaluer.add(o1 * 1e7 + o2); else if (compatibles(b, a)) aEvaluer.add(o2 * 1e7 + o1);
      }
    }
  }
  // l'univers : toutes les paires (dépôt, annonce de sa plateforme) et (annonce, fiche)
  const nJ = new Map(); for (const o of objets) if (o.t === 'A') nJ.set(o.pf, (nJ.get(o.pf) ?? 0) + 1);
  let univers = 0; const nF = objets.filter((o) => o.t === 'F4' || o.t === 'F6').length, nA = objets.filter((o) => o.t === 'A').length;
  for (const o of objets) if (o.t === 'J') univers += nJ.get(o.pf) ?? 0;
  univers += nA * nF;
  const s = { univers, evaluees: aEvaluer.size, identiques: 0, perdues: 0, nouvelles: 0, niveau_change: 0, distance_changee_meme_niveau: 0, marge_min: null,
    reelles: { evaluees: 0, perdues: 0, nouvelles: 0, niveau_change: 0 }, ecarts: [] };
  const cacheA = new Map(), cacheB = new Map();
  const photo = (c, rm, x) => { if (!c.has(x)) { const l = ligne(rm.get(x)); c.set(x, l ? photoDepuisEmpreinte(l) : null); } return c.get(x); };
  // l'univers RÉEL : dépôt ↔ annonce candidate (depot-sans-numero candidatesDuDepot, sans « numérotée avant le dépôt ») ;
  // annonce ↔ fiche liée (un dépôt de la fiche porte le numéro de l'annonce, ou l'annonce est rangée sur la fiche)
  const msDe = (v) => { const t = Date.parse(String(v ?? '')); return Number.isFinite(t) ? t : NaN; };
  const liees = new Set();
  for (const j of jobs) if (j[5] && j[7]) liees.add(j[2] + '|' + j[7] + '|' + j[5]);
  const reelle = (a, b) => {
    if (a.t === 'J') { const an = b.ref, t = msDe(a.ref[9] ?? a.ref[10]);
      return !an[11] && !an[7] && !an[8] && !an[14] && /^(en_ligne|en_verification)$/.test(String(an[10] ?? '')) && Number.isFinite(t) && msDe(an[13]) >= t - 600000; }
    const an = a.ref, f = b.ref; return an[7] === f[0] || liees.has(an[2] + '|' + an[3] + '|' + f[0]);
  };
  const rang = { meme: 2, proche: 1, autre: 0, inconnu: -1 };
  for (const c of aEvaluer) {
    const a = objets[Math.floor(c / 1e7)], b = objets[c % 1e7];
    const lA = (o) => o.urls.map((x) => photo(cacheA, rA, x)).filter(Boolean);
    const lB = (o) => o.urls.map((x) => photo(cacheB, rB, x)).filter(Boolean);
    const vraie = reelle(a, b); if (vraie) s.reelles.evaluees++;
    const XA = lA(a), YA = lA(b), XB = lB(a), YB = lB(b);
    const cmpA = XA.length && YA.length ? comparerPhotos(XA, YA) : null, cmpB = XB.length && YB.length ? comparerPhotos(XB, YB) : null;
    const nA2 = cmpA ? niveauPhoto(cmpA) : 'inconnu', nB2 = cmpB ? niveauPhoto(cmpB) : 'inconnu';
    if (nA2 === nB2) {
      const memeL = cmpA && cmpB && cmpA.liste.length === cmpB.liste.length && cmpA.liste.every((d, q2) => d === cmpB.liste[q2]);
      if (memeL || (!cmpA && !cmpB)) s.identiques++;
      else { s.distance_changee_meme_niveau++; if (cmpB) { const m = Math.min(...[cmpB.best, ...cmpB.liste.filter((d) => d <= 13)].flatMap((d) => [4, 9, 12].map((t) => Math.abs(d - t)))); if (s.marge_min === null || m < s.marge_min) s.marge_min = m; } }
      continue;
    }
    if (rang[nA2] > rang[nB2]) s.perdues++; else s.nouvelles++;
    s.niveau_change++;
    if (vraie) { s.reelles.niveau_change++; if (rang[nA2] > rang[nB2]) s.reelles.perdues++; else s.reelles.nouvelles++; }
    if (vraie || s.ecarts.length < 30) s.ecarts.push({ reelle: vraie, type: `${a.t}-${b.t}`, a: a.id, b: b.id, pf: a.pf ?? b.pf, A: nA2, B: nB2, bestA: cmpA?.best, bestB: cmpB?.best, listeA: cmpA?.liste?.slice(0, 6), listeB: cmpB?.liste?.slice(0, 6), urlsA: a.urls, urlsB: b.urls });
  }
  res.S = s;
  res.ms = Date.now() - t1;
  fs.writeFileSync(sortie, JSON.stringify(res));
  console.log(`${u.slice(0, 8)} photos ${res.photos} bucket ${res.bucket} P ${pairesP} flips ${flips.length} | Q ${q.paires} chg ${q.verdict_change} | S ${s.evaluees} chg ${s.niveau_change} (${res.ms} ms)`);
}
console.log('FIN', ((Date.now() - t0) / 1000).toFixed(0) + ' s');
