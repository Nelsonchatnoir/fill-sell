// Agrège donnees/resultats/{moteur,autres}/*.json et donnees/bilan-photos.json en un seul JSON
// (donnees/synthese.json) : les chiffres du RESULTAT.md, et les écarts avec leurs exemples.
import fs from 'node:fs';
import path from 'node:path';
import { W } from './jeux.mjs';

const lire = (d) => fs.existsSync(d) ? fs.readdirSync(d).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(fs.readFileSync(path.join(d, f), 'utf8'))) : [];
const M = lire(path.join(W, 'donnees', 'resultats', 'moteur'));
const O = lire(path.join(W, 'donnees', 'resultats', 'autres'));
const photos = JSON.parse(fs.readFileSync(path.join(W, 'donnees', 'bilan-photos.json'), 'utf8'));
const court = (u) => String(u ?? '').slice(0, 8);
const min = (a, b) => (a === null || a === undefined ? b : b === null || b === undefined ? a : Math.min(a, b));

// ── moteur ──
const m = { comptes: M.length, noeuds: 0, paires: 0, candidatesA: 0, candidatesB: 0, candidates_seulement_A: 0, candidates_seulement_B: 0,
  identiques: 0, perdues: 0, nouvelles: 0, classe_changee: 0, niveau_change: 0, distance_changee_meme_verdict: 0, marge_min: null, marge_min_ex: null,
  noeuds_avec_photo_refusee: 0, noeuds_avec_fichier_supprime: 0,
  normal: { comptes_identiques: 0, comptes_meme_decisions_distance_notee: 0, comptes_differents: 0, decisions: 0, perdues: 0, nouvelles: 0, distances_notees: 0 },
  tout_le_stock: { comptes_identiques: 0, comptes_meme_decisions_distance_notee: 0, comptes_differents: 0, decisions: 0, perdues: 0, nouvelles: 0, distances_notees: 0,
    aretes: 0, aretes_diff: 0, noeuds_diff: 0 },
  ecarts_paires: [], ecarts_decisions: [], ecarts_aretes: [] };
for (const r of M) {
  const p = r.paires;
  for (const k of ['paires', 'candidatesA', 'candidatesB', 'candidates_seulement_A', 'candidates_seulement_B', 'identiques', 'perdues', 'nouvelles', 'classe_changee', 'niveau_change', 'distance_changee_meme_verdict', 'noeuds_avec_photo_refusee', 'noeuds_avec_fichier_supprime']) m[k] += p[k] ?? 0;
  if (p.marge_min !== null && (m.marge_min === null || p.marge_min < m.marge_min)) { m.marge_min = p.marge_min; m.marge_min_ex = { compte: court(r.user), ...p.marge_min_ex }; }
  for (const e of p.ecarts) m.ecarts_paires.push({ compte: court(r.user), ...e });
  for (const nom of ['normal', 'tout_le_stock']) {
    const d = r[nom].decisions, s = m[nom];
    s.decisions += d.n;
    if (d.identiques) s.comptes_identiques++;
    else if (d.memesSansDistance) { s.comptes_meme_decisions_distance_notee++; s.distances_notees += d.distancesNotees; }
    else { s.comptes_differents++; s.perdues += d.perdues.length; s.nouvelles += d.nouvelles.length;
      for (const x of d.perdues) m.ecarts_decisions.push({ compte: court(r.user), passe: nom, sens: 'perdue (A seulement)', decision: x });
      for (const x of d.nouvelles) m.ecarts_decisions.push({ compte: court(r.user), passe: nom, sens: 'nouvelle (B seulement)', decision: x }); }
  }
  const g = r.tout_le_stock.graphe;
  m.noeuds += g.noeuds; m.tout_le_stock.aretes += g.aretesA; m.tout_le_stock.aretes_diff += g.aretesDiff.length; m.tout_le_stock.noeuds_diff += g.decNoeudsDiff.length;
  for (const x of g.aretesDiff) m.ecarts_aretes.push({ compte: court(r.user), ...x });
}

// ── autres ──
const o = { comptes: O.length, photos: 0, bucket: 0, refusees_referencees: 0,
  P: { paires: 0, paires_sans_B: 0, gardees: 0, flips: 0, distance_changee_sans_flip: 0, marge_min: null, marge_ex: null, predicats: {}, exemples: [] },
  Q: { paires: 0, identiques: 0, perdues: 0, nouvelles: 0, verdict_change: 0, distance_changee_meme_verdict: 0, marge_min: null, ecarts: [] },
  fusion_photo_candidates: { paires_A: 0, paires_B: 0, perdues: 0, nouvelles: 0, degres_changes: 0, autres_photos_changees: 0, ex: [] },
  rapprochement_photo_decisions: { annonces: 0, identiques: 0, changees: 0, non_rattachees: 0, changees_non_rattachees: 0, ecarts: [] },
  fiches_meme_photo_questions: { paires_A: 0, paires_B: 0, perdues: 0, nouvelles: 0, ex: [] },
  beebs_numeros_par_sequence: { paires: 0, identiques: 0, perdues: 0, nouvelles: 0, ex: [] },
  trancher_publications_sans_lien: { paires: 0, identiques: 0, perdues: 0, nouvelles: 0, ex: [] },
  S: { univers: 0, evaluees: 0, identiques: 0, perdues: 0, nouvelles: 0, niveau_change: 0, distance_changee_meme_niveau: 0, marge_min: null, reelles: { evaluees: 0, perdues: 0, nouvelles: 0, niveau_change: 0 }, ecarts: [] } };
for (const r of O) {
  o.photos += r.photos; o.bucket += r.bucket; o.refusees_referencees += r.refusees;
  const P = r.P;
  for (const k of ['paires', 'paires_sans_B', 'gardees', 'flips', 'distance_changee_sans_flip']) o.P[k] += P[k];
  if (P.marge_min !== null && (o.P.marge_min === null || P.marge_min < o.P.marge_min)) { o.P.marge_min = P.marge_min; o.P.marge_ex = { compte: court(r.user), ...P.marge_ex }; }
  for (const [k, v] of Object.entries(P.predicats)) { o.P.predicats[k] ??= { A_seulement: 0, B_seulement: 0, les_deux: 0 }; o.P.predicats[k].A_seulement += v[0]; o.P.predicats[k].B_seulement += v[1]; o.P.predicats[k].les_deux += v[2]; }
  for (const e of P.exemples_flips) o.P.exemples.push({ compte: court(r.user), ...e });
  const Q = r.Q;
  for (const k of ['paires', 'identiques', 'perdues', 'nouvelles', 'verdict_change', 'distance_changee_meme_verdict']) o.Q[k] += Q[k];
  o.Q.marge_min = min(o.Q.marge_min, Q.marge_min);
  for (const e of Q.ecarts) o.Q.ecarts.push({ compte: court(r.user), ...e });
  const F = r.R.fusion_photo_candidates;
  for (const k of ['paires_A', 'paires_B', 'perdues', 'nouvelles', 'degres_changes', 'autres_photos_changees']) o.fusion_photo_candidates[k] += F[k];
  for (const x of [...F.ex_perdues.map((p) => ({ sens: 'perdue', p })), ...F.ex_nouvelles.map((p) => ({ sens: 'nouvelle', p }))]) o.fusion_photo_candidates.ex.push({ compte: court(r.user), ...x });
  const D = r.R.rapprochement_photo_decisions;
  for (const k of ['annonces', 'identiques', 'changees', 'non_rattachees', 'changees_non_rattachees']) o.rapprochement_photo_decisions[k] += D[k];
  for (const e of D.ecarts) o.rapprochement_photo_decisions.ecarts.push({ compte: court(r.user), ...e });
  const Fq = r.R.fiches_meme_photo_questions;
  o.fiches_meme_photo_questions.paires_A += Fq.paires_A; o.fiches_meme_photo_questions.paires_B += Fq.paires_B;
  o.fiches_meme_photo_questions.perdues += Fq.perdues.length; o.fiches_meme_photo_questions.nouvelles += Fq.nouvelles.length;
  for (const x of Fq.perdues) o.fiches_meme_photo_questions.ex.push({ compte: court(r.user), sens: 'perdue', paire: x });
  for (const x of Fq.nouvelles) o.fiches_meme_photo_questions.ex.push({ compte: court(r.user), sens: 'nouvelle', paire: x });
  for (const nom of ['beebs_numeros_par_sequence', 'trancher_publications_sans_lien']) {
    const X = r.R[nom];
    for (const k of ['paires', 'identiques', 'perdues', 'nouvelles']) o[nom][k] += X[k];
    for (const e of X.ex) o[nom].ex.push({ compte: court(r.user), ...e });
  }
  const S = r.S;
  for (const k of ['univers', 'evaluees', 'identiques', 'perdues', 'nouvelles', 'niveau_change', 'distance_changee_meme_niveau']) o.S[k] += S[k];
  o.S.marge_min = min(o.S.marge_min, S.marge_min);
  for (const k of ['evaluees', 'perdues', 'nouvelles', 'niveau_change']) o.S.reelles[k] += S.reelles?.[k] ?? 0;
  for (const e of S.ecarts) o.S.ecarts.push({ compte: court(r.user), ...e });
}
const synthese = { photos, moteur: m, autres: o };
fs.writeFileSync(path.join(W, 'donnees', 'synthese.json'), JSON.stringify(synthese, null, 1));
const resume = JSON.parse(JSON.stringify(synthese, (k, v) => (Array.isArray(v) && /^(ecarts|exemples|ex|ecarts_paires|ecarts_decisions|ecarts_aretes)$/.test(k) ? `${v.length} élément(s)` : v)));
console.log(JSON.stringify(resume, null, 1));
