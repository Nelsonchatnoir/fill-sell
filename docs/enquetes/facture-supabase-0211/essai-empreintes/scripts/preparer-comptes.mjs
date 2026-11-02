// Prépare, compte par compte, les empreintes A et B de TOUTES les photos que ce compte peut comparer :
// les nœuds du moteur (donnees/moteur/<u>.json) et les lignes brutes (donnees/tables : photos des fiches,
// couverture et capture des annonces, photos des dépôts). Sortie : donnees/emp/<u>.json
//   { A: [compacte…], B: [compacte…], refusees: { url: motif } }  (B sans les photos refusées)
// et donnees/bilan-photos.json (partie 1 du rapport : écarts A ↔ B par photo, octets, refus).
import fs from 'node:fs';
import path from 'node:path';
import { W, chargerA, chargerCalculs, construireB, estBucket, hamHex, hamTexte, bitsVersHexa } from './jeux.mjs';

const t0 = Date.now();
const { A, meta } = chargerA();
const calculs = chargerCalculs();
const { B, refusees, manquantes } = construireB(A, calculs);
// Les fichiers SUPPRIMÉS du stockage (HTTP 400 et absents de storage.objects : verifier-absents.mjs) : aucune des deux
// méthodes ne peut plus les lire. Ils sortent des DEUX jeux (A et B) : la comparaison ne porte que sur ce que la
// nouvelle méthode a mesuré — jamais une empreinte ancienne face à une nouvelle. Comptés à part.
const fAbs = path.join(W, 'donnees', 'absents.json');
const absents = new Set(fs.existsSync(fAbs) ? JSON.parse(fs.readFileSync(fAbs, 'utf8')).absents : []);
for (const u of absents) refusees.delete(u);
console.log('A', A.size, 'calculs', calculs.size, 'B', B.size, 'refusées (méthode)', refusees.size, 'fichiers supprimés', absents.size, 'sans calcul', manquantes.length);

// ── Partie 1 : les photos ────────────────────────────────────────────────
const hist = () => ({ 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, '>=5': 0 });
const pose = (h, d) => { h[d >= 5 ? '>=5' : d] = (h[d >= 5 ? '>=5' : d] ?? 0) + 1; };
const H = { dhash: hist(), phash: hist(), couleur: hist(), variantes_max: hist(), variantes_toutes: hist() };
const motifs = {};
let octets = 0, ok = 0, ko = 0, msTotal = 0, dejaOriginale = 0, dejaOriginaleDelta0 = 0;
const parSource = {};
for (const [url, c] of calculs) {
  octets += Number(c.octets) || 0;
  if (c.erreur) { ko++; const m = String(c.erreur).replace(/\(\d+×\d+\)/, '(L×H)').replace(/\(\d+ o\)/, '(n o)'); motifs[m] = (motifs[m] ?? 0) + 1; continue; }
  ok++; msTotal += Number(c.ms) || 0;
  const a = A.get(url); if (!a) continue;
  const m = meta.get(url);
  const dd = hamHex(a[1], bitsVersHexa(c.dhash)), dp = hamHex(a[2], bitsVersHexa(c.phash)), dc = hamTexte(m.couleur, c.couleur);
  pose(H.dhash, dd); pose(H.phash, dp); if (dc != null) pose(H.couleur, dc);
  if (a[3] === 1) {
    const K = ['c70', 'p85', 'g45', 'g60', 'g35'];
    let mx = 0;
    K.forEach((k, i) => [0, 1].forEach((t) => { const d = hamHex(a[4 + 2 * i + t], bitsVersHexa(c.variantes?.[k]?.[t])); pose(H.variantes_toutes, d ?? 99); mx = Math.max(mx, d ?? 99); }));
    pose(H.variantes_max, mx);
  }
  const s = m.source ?? '?'; parSource[s] ??= { n: 0, delta0: 0 }; parSource[s].n++;
  const tout0 = dd === 0 && dp === 0 && dc === 0;
  if (tout0) parSource[s].delta0++;
  if (Math.max(m.largeur ?? 0, m.hauteur ?? 0) > 400) { dejaOriginale++; if (tout0) dejaOriginaleDelta0++; }
}
const bilan = { fichiers_supprimes: absents.size, a_lignes: A.size, bucket_lignes: [...A.keys()].filter(estBucket).length, calculees: calculs.size, ok, ko, sans_calcul: manquantes.length,
  octets, ms_decodage_moyen: ok ? Math.round(msTotal / ok) : null, motifs_refus: motifs, histogrammes: H, par_source: parSource,
  deja_sur_originale: { n: dejaOriginale, delta0: dejaOriginaleDelta0 } };
fs.writeFileSync(path.join(W, 'donnees', 'bilan-photos.json'), JSON.stringify(bilan, null, 1));
console.log(JSON.stringify(bilan));

// ── Les URL de chaque compte ─────────────────────────────────────────────
const urlsParCompte = new Map();
const ajoute = (u, url) => { if (typeof url !== 'string') return; let s = urlsParCompte.get(u); if (!s) urlsParCompte.set(u, (s = new Set())); s.add(url); };
const dirM = path.join(W, 'donnees', 'moteur');
for (const f of fs.readdirSync(dirM)) {
  const u = f.slice(0, -5);
  const d = JSON.parse(fs.readFileSync(path.join(dirM, f), 'utf8'));
  for (const x of d.fiches ?? []) for (const url of x.photos ?? []) ajoute(u, url);
  for (const x of d.annonces ?? []) { for (const url of x.photos ?? []) ajoute(u, url); ajoute(u, x.photo_url); }
}
const lireTable = (nom, f) => {
  const txt = fs.readFileSync(path.join(W, 'donnees', 'tables', nom + '.ndjson'), 'utf8').split('\n');
  for (let i = 1; i < txt.length; i++) if (txt[i]) f(JSON.parse(txt[i]));
};
if (fs.existsSync(path.join(W, 'donnees', 'tables', 'jobs.ndjson'))) {
  lireTable('inventaire', (r) => { for (const x of r[8]) ajoute(r[1], x); for (const x of r[10]) ajoute(r[1], x); for (const x of r[11]) ajoute(r[1], x); ajoute(r[1], r[9]); });
  lireTable('annonces', (r) => { ajoute(r[1], r[4]); for (const x of r[5]) ajoute(r[1], x); for (const x of r[6]) ajoute(r[1], x);
    for (const x of [r[4], ...r[5]]) if (typeof x === 'string') ajoute(r[1], x.replace(/rule=ad-(thumb|small|medium)/, 'rule=ad-large')); });
  lireTable('jobs', (r) => { for (const x of r[6]) ajoute(r[1], x); });
} else console.log('⚠ tables brutes absentes : seulement les URL du moteur');

const dirE = path.join(W, 'donnees', 'emp');
fs.mkdirSync(dirE, { recursive: true });
let n = 0, refuseesRef = 0;
for (const [u, s] of urlsParCompte) {
  const a = [], b = [], ref = {}, abs = [];
  for (const url of s) {
    if (absents.has(url)) { abs.push(url); continue; }
    if (A.has(url)) a.push(A.get(url));
    if (B.has(url)) b.push(B.get(url));
    if (refusees.has(url)) { ref[url] = refusees.get(url); refuseesRef++; }
  }
  fs.writeFileSync(path.join(dirE, u + '.json'), JSON.stringify({ A: a, B: b, refusees: ref, absents: abs }));
  n++;
}
console.log('comptes', n, 'photos refusées référencées (avec doublons entre comptes)', refuseesRef, ((Date.now() - t0) / 1000).toFixed(0) + ' s');
