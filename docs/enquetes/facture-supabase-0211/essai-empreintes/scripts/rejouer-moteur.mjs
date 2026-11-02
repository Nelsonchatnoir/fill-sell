// ═══════════════════════════════════════════════════════════════════════════
// LE MOTEUR DE RAPPROCHEMENT v3 REJOUÉ À BLANC, avec A puis avec B
// ═══════════════════════════════════════════════════════════════════════════
// Les modules du dépôt, importés TELS QUELS (supabase/functions/_shared/rapprochement/*.js),
// les données lues en prod (donnees/moteur/<u>.json, miroir de rapprochement_v3_lire),
// les empreintes sous la forme compacte du moteur (photoDepuisCompacte, comme la fonction edge).
// Pour chaque compte :
//   1. passe() complète, comme le cron (mode « normal », fiches à la main et remises « nouvelles ») ;
//   2. passe() complète sur TOUT le stock (mode « réparation », fiches à la main et remises « toutes ») ;
//      → décisions comparées (plan d'écriture), arêtes (niveau, motif), décision de chaque nœud ;
//   3. paire par paire : toutes les paires candidates (actifs = tous, union des candidates A et B),
//      comparerPhotos + classe photo du moteur + evaluer (plateformes différentes), avec A puis B.
// Rien n'est écrit ailleurs que dans donnees/resultats/moteur/.
// Usage : node rejouer-moteur.mjs [k n]   (k-ième part sur n des comptes, pour paralléliser)
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { W } from './jeux.mjs';

const R = 'C:/Users/nicol/fill-and-sell/supabase/functions/_shared/rapprochement/';
const { passe, ordonner } = await import(pathToFileURL(R + 'passe.js').href);
const { photoDepuisCompacte, comparerPhotos, dPhoto } = await import(pathToFileURL(R + 'photos.js').href);
const { construireNoeuds, candidatsDe, evaluer, pesee, SEUILS } = await import(pathToFileURL(R + 'moteur.js').href);

const [k = 0, n = 1] = process.argv.slice(2).map(Number);
const dirM = path.join(W, 'donnees', 'moteur'), dirE = path.join(W, 'donnees', 'emp');
const dirR = path.join(W, 'donnees', 'resultats', 'moteur');
fs.mkdirSync(dirR, { recursive: true });
const comptes = fs.readdirSync(dirM).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)).sort()
  .filter((_, i) => i % n === k)
  .filter((x) => !process.env.SEUL || process.env.SEUL.split(',').includes(x));

// La classe photo du moteur (moteur.js evaluer), recalculée pour les paires d'une même plateforme.
const S = SEUILS;
function classe(ph) {
  const nMulti = ph.liste.filter((d) => d <= S.multi).length, nMulti3 = ph.liste.filter((d) => d <= S.multi3).length;
  return (nMulti >= 2 || nMulti3 >= 3) ? 'multi' : ph.best <= S.quasi ? 'quasi' : ph.best <= S.une ? 'une' : ph.best <= S.proche ? 'proche' : 'aucune';
}
// Les seuils sur une distance de photo que le moteur lit (moteur.js, remises-en-ligne.js, annonce-partagee.js)
const SEUILS_D = [2, 4, 7, 9, 12, 14, 16];
const marge = (d) => Math.min(...SEUILS_D.map((t) => Math.abs(d - t)));
// Une décision sans ses distances notées (preuves.photo) : pour séparer « autre décision » de « même décision, distance notée autre ».
const sansDistance = (x) => JSON.stringify(x, (key, v) => (key === 'photo' && typeof v === 'number') ? undefined : key === 'photos' && v && typeof v === 'object' && !Array.isArray(v) ? undefined : v);

function comparerDecisions(dA, dB) {
  const jA = dA.map((x) => JSON.stringify(x)), jB = dB.map((x) => JSON.stringify(x));
  if (jA.length === jB.length && jA.every((x, i) => x === jB[i])) return { identiques: true, n: dA.length };
  const sA = dA.map(sansDistance), sB = dB.map(sansDistance);
  const cA = new Map(); for (const s of sA) cA.set(s, (cA.get(s) ?? 0) + 1);
  const cB = new Map(); for (const s of sB) cB.set(s, (cB.get(s) ?? 0) + 1);
  const perdues = [], nouvelles = [];
  for (const [s, c] of cA) for (let i = 0; i < c - (cB.get(s) ?? 0); i++) perdues.push(JSON.parse(s));
  for (const [s, c] of cB) for (let i = 0; i < c - (cA.get(s) ?? 0); i++) nouvelles.push(JSON.parse(s));
  const memesSansDistance = !perdues.length && !nouvelles.length;
  let distancesNotees = 0;
  if (memesSansDistance) for (let i = 0; i < jA.length; i++) if (jA[i] !== jB[i]) distancesNotees++;
  return { identiques: false, n: dA.length, nB: dB.length, memesSansDistance, distancesNotees, perdues, nouvelles };
}

function cleArete(e) { return [e.x.id, e.y.id].sort().join('|'); }
function comparerR(rA, rB) {
  const aA = new Map(rA.R.aretes.map((e) => [cleArete(e), e])), aB = new Map(rB.R.aretes.map((e) => [cleArete(e), e]));
  const diff = [];
  for (const c of new Set([...aA.keys(), ...aB.keys()])) {
    const x = aA.get(c), y = aB.get(c);
    const vx = x ? `${x.niveau}/${x.motif}` : 'absente', vy = y ? `${y.niveau}/${y.motif}` : 'absente';
    if (vx !== vy) diff.push({ paire: c, A: vx, B: vy, photoA: x?.ph?.best ?? null, photoB: y?.ph?.best ?? null });
  }
  const dec = [];
  for (const nd of rA.N) {
    const x = rA.R.dec.get(nd.id), y = rB.R.dec.get(nd.id);
    const vx = x ? `${x.decision}:${[...(x.groupe ?? [])].sort().join(',')}` : '?', vy = y ? `${y.decision}:${[...(y.groupe ?? [])].sort().join(',')}` : '?';
    if (vx !== vy) dec.push({ noeud: nd.id, A: vx, B: vy });
  }
  return { aretesA: rA.R.aretes.length, aretesB: rB.R.aretes.length, aretesDiff: diff, noeuds: rA.N.length, decNoeudsDiff: dec };
}

const t0 = Date.now();
for (const u of comptes) {
  const sortie = path.join(dirR, u + '.json');
  if (fs.existsSync(sortie)) continue;
  if (!fs.existsSync(path.join(dirE, u + '.json'))) { console.log('sans empreintes préparées :', u); continue; }
  const t1 = Date.now();
  const lu = JSON.parse(fs.readFileSync(path.join(dirM, u + '.json'), 'utf8'));
  const emp = JSON.parse(fs.readFileSync(path.join(dirE, u + '.json'), 'utf8'));
  const mA = new Map(emp.A.map((r) => [r[0], r])), mB = process.env.TEST_AA ? mA : new Map(emp.B.map((r) => [r[0], r]));
  const photosDeA = (us) => us.map((x) => photoDepuisCompacte(mA.get(x))).filter(Boolean);
  const photosDeB = (us) => us.map((x) => photoDepuisCompacte(mB.get(x))).filter(Boolean);
  const res = { user: u };
  // photos du compte (nœuds du moteur) : bucket, et bucket refusées par la nouvelle méthode
  const donnees = ordonner(lu);
  // 1 et 2 : les passes complètes
  for (const [nom, cfg] of [['normal', { mode: 'normal', fichesMain: 'nouvelles', remises: 'nouvelles' }],
                            ['tout_le_stock', { mode: 'reparation', fichesMain: 'toutes', remises: 'toutes' }]]) {
    const rA = passe(donnees, null, { ...cfg, photosDe: photosDeA });
    const rB = passe(donnees, null, { ...cfg, photosDe: photosDeB });
    res[nom] = { decisions: comparerDecisions(rA.decisions, rB.decisions), plan: { A: rA.bilan.plan, B: rB.bilan.plan } };
    if (nom === 'tout_le_stock') res[nom].graphe = comparerR(rA, rB);
  }
  // 3 : paire par paire, toutes les candidates (A ∪ B)
  const NA = construireNoeuds(donnees, photosDeA), NB = construireNoeuds(donnees, photosDeB);
  pesee(NA);
  const vues = new Set(), paires = [];
  const cA0 = candidatsDe(NA, null), cB0 = candidatsDe(NB, null);
  for (const [i, j] of [...cA0, ...cB0]) {
    const c = i < j ? i * 100000 + j : j * 100000 + i; if (vues.has(c)) continue; vues.add(c); paires.push([Math.min(i, j), Math.max(i, j)]);
  }
  const st = { paires: paires.length, candidatesA: 0, candidatesB: 0, identiques: 0, perdues: 0, nouvelles: 0, classe_changee: 0,
    niveau_change: 0, distance_changee_meme_verdict: 0, marge_min: null, marge_min_ex: null, ecarts: [] };
  const candA = new Set(cA0.map(([i, j]) => Math.min(i, j) * 100000 + Math.max(i, j)));
  const candB = new Set(cB0.map(([i, j]) => Math.min(i, j) * 100000 + Math.max(i, j)));
  st.candidatesA = candA.size; st.candidatesB = candB.size;
  st.candidates_seulement_A = [...candA].filter((c) => !candB.has(c)).length;
  st.candidates_seulement_B = [...candB].filter((c) => !candA.has(c)).length;
  for (const [i, j] of paires) {
    const xA = NA[i], yA = NA[j], xB = NB[i], yB = NB[j];
    const phA = comparerPhotos(xA.emps, yA.emps), phB = comparerPhotos(xB.emps, yB.emps);
    const kA = classe(phA), kB = classe(phB);
    let nivA = null, nivB = null;
    if (xA.pf !== yA.pf) { const eA = evaluer(xA, yA), eB = evaluer(xB, yB); nivA = `${eA.niveau}/${eA.motif}`; nivB = `${eB.niveau}/${eB.motif}`; }
    const memeListe = phA.liste.length === phB.liste.length && phA.liste.every((d, q) => d === phB.liste[q]);
    const vraiA = kA !== 'aucune', vraiB = kB !== 'aucune';
    const ecart = { a: xA.id, b: yA.id, pf: `${xA.pf}/${yA.pf}`, classeA: kA, classeB: kB, bestA: phA.best, bestB: phB.best, listeA: phA.liste.slice(0, 6), listeB: phB.liste.slice(0, 6), niveauA: nivA, niveauB: nivB };
    if (vraiA && !vraiB) { st.perdues++; st.ecarts.push({ type: 'perdue', ...ecart }); }
    else if (!vraiA && vraiB) { st.nouvelles++; st.ecarts.push({ type: 'nouvelle', ...ecart }); }
    else if (kA !== kB) { st.classe_changee++; st.ecarts.push({ type: 'classe', ...ecart }); }
    else if (nivA !== nivB) { st.niveau_change++; st.ecarts.push({ type: 'niveau', ...ecart }); }
    else if (!memeListe) {
      st.distance_changee_meme_verdict++;
      // la marge au seuil le plus proche, sur la meilleure distance et les distances de la liste qui comptent (≤ 16)
      const m = Math.min(marge(phB.best), ...phB.liste.filter((d) => d <= 17).map(marge));
      if (st.marge_min === null || m < st.marge_min) { st.marge_min = m; st.marge_min_ex = ecart; }
    } else st.identiques++;
  }
  // les nœuds qui portent une photo refusée par la nouvelle méthode
  const refusees = new Set(Object.keys(emp.refusees ?? {}));
  st.noeuds_avec_photo_refusee = NA.filter((nd) => (nd.ref?.photos ?? []).slice(0, 6).some((x) => refusees.has(x))).length;
  const supprimees = new Set(emp.absents ?? []);
  st.noeuds_avec_fichier_supprime = NA.filter((nd) => (nd.ref?.photos ?? []).slice(0, 6).some((x) => supprimees.has(x))).length;
  res.paires = st;
  res.ms = Date.now() - t1;
  fs.writeFileSync(sortie, JSON.stringify(res));
  console.log(`${u.slice(0, 8)} nœuds ${NA.length} paires ${paires.length} perdues ${st.perdues} nouvelles ${st.nouvelles} classe ${st.classe_changee} niveau ${st.niveau_change} dist ${st.distance_changee_meme_verdict} décisions normal ${res.normal.decisions.identiques ? '=' : '≠'} stock ${res.tout_le_stock.decisions.identiques ? '=' : '≠'} (${res.ms} ms)`);
}
console.log('FIN', ((Date.now() - t0) / 1000).toFixed(0) + ' s');
