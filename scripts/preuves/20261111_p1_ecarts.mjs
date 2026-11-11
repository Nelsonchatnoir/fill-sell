#!/usr/bin/env node
// P1 (11/11/2026) — ÉCARTS entre deux ou trois relevés de scripts/preuves/20261111_p1_releve.sql. Rien en base : ce script
// ne lit que les fichiers JSON rendus par `npx supabase db query --linked --read-only -f … > R.json`.
//   node scripts/preuves/20261111_p1_ecarts.mjs R0.json R1.json            → une fenêtre, son verdict
//   node scripts/preuves/20261111_p1_ecarts.mjs Ravant.json R0.json R1.json → la fenêtre d'avant, celle d'après, le gain
// Verdict VERT (critères de l'enquête P1, § 5) : pour CHAQUE requête, au moins un appel dans la fenêtre, moins de
// 200 pages et moins de 5 ms par appel. Une fenêtre traversée par un redémarrage de la base ou une remise à zéro de
// pg_stat_statements ne vaut rien : le verdict le dit, on reprend une fenêtre neuve.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

export const SEUILS = { pagesParAppel: 200, msParAppel: 5 };

/** Les lignes d'un relevé : la sortie JSON de la CLI (avec ou sans ligne « Target: » devant), ou un tableau de lignes. */
export function lireReleve(texteOuLignes) {
  if (Array.isArray(texteOuLignes)) return texteOuLignes;
  const t = String(texteOuLignes);
  const i = t.indexOf('{'), k = t.indexOf('[');
  const debut = i < 0 ? k : k < 0 ? i : Math.min(i, k);
  if (debut < 0) throw new Error('relevé illisible : aucun JSON');
  const j = JSON.parse(t.slice(debut));
  const lignes = Array.isArray(j) ? j : j.rows;
  if (!Array.isArray(lignes) || !lignes.length) throw new Error('relevé illisible : aucune ligne');
  return lignes;
}

const nb = (v) => (v === null || v === undefined || v === '' ? 0 : Number(v));

/** L'écart entre deux relevés : par requête (appels, ms et pages par appel) et pour la table (par minute). */
export function ecarts(avant, apres) {
  const a = lireReleve(avant), b = lireReleve(apres);
  const minutes = (nb(b[0].t) - nb(a[0].t)) / 60;
  const motifs = [];
  if (!(minutes > 0)) motifs.push('fenêtre vide ou relevés inversés');
  if (a[0].demarrage !== b[0].demarrage) motifs.push(`la base a redémarré (${a[0].demarrage} → ${b[0].demarrage})`);
  const requetes = b.map((rb) => {
    const ra = a.find((x) => String(x.queryid) === String(rb.queryid)) ?? {};
    if (ra.depuis && rb.depuis && ra.depuis !== rb.depuis) motifs.push(`${rb.nom} : compteurs remis à zéro (${ra.depuis} → ${rb.depuis})`);
    const appels = nb(rb.calls) - nb(ra.calls);
    if (appels < 0) motifs.push(`${rb.nom} : compteur d'appels en baisse`);
    return {
      nom: rb.nom, queryid: String(rb.queryid), appels,
      appelsParMin: minutes > 0 ? appels / minutes : null,
      msParAppel: appels > 0 ? (nb(rb.total_ms) - nb(ra.total_ms)) / appels : null,
      pagesParAppel: appels > 0 ? (nb(rb.pages) - nb(ra.pages)) / appels : null,
      maxMs: nb(rb.max_ms),
    };
  });
  const parMin = (cle) => (minutes > 0 ? (nb(b[0][cle]) - nb(a[0][cle])) / minutes : null);
  const table = { seqScanParMin: parMin('seq_scan'), seqTupReadParMin: parMin('seq_tup_read'),
    idxTupFetchParMin: parMin('idx_tup_fetch'), toastIdxScanParMin: parMin('toast_idx_scan') };
  return { minutes, requetes, table, valide: motifs.length === 0, motifs };
}

/** Le verdict d'une fenêtre : 'VERT', 'ROUGE' ou 'INVALIDE' (fenêtre à reprendre), avec ses raisons. */
export function verdict(e) {
  if (!e.valide) return { etat: 'INVALIDE', raisons: e.motifs };
  const raisons = [];
  for (const r of e.requetes) {
    if (!(r.appels > 0)) { raisons.push(`${r.nom} : aucun appel dans la fenêtre (trop courte, ou chemin non servi)`); continue; }
    if (!(r.pagesParAppel < SEUILS.pagesParAppel)) raisons.push(`${r.nom} : ${Math.round(r.pagesParAppel)} pages par appel (seuil ${SEUILS.pagesParAppel})`);
    if (!(r.msParAppel < SEUILS.msParAppel)) raisons.push(`${r.nom} : ${r.msParAppel.toFixed(1)} ms par appel (seuil ${SEUILS.msParAppel})`);
  }
  return { etat: raisons.length ? 'ROUGE' : 'VERT', raisons };
}

const f1 = (v) => (v === null ? '—' : Number(v).toLocaleString('fr-FR', { maximumFractionDigits: 1 }));
export function decrire(titre, e) {
  const v = verdict(e);
  const l = [`${titre} : ${f1(e.minutes)} min — ${v.etat}`];
  for (const r of e.requetes) l.push(`  ${r.nom} : ${r.appels} appels (${f1(r.appelsParMin)}/min), ${f1(r.msParAppel)} ms et ${f1(r.pagesParAppel)} pages par appel`);
  l.push(`  table : ${f1(e.table.seqScanParMin)} seq_scan/min, ${f1(e.table.seqTupReadParMin)} seq_tup_read/min, ` +
    `${f1(e.table.idxTupFetchParMin)} idx_tup_fetch/min, TOAST ${f1(e.table.toastIdxScanParMin)} idx_scan/min`);
  for (const r of v.raisons) l.push(`  · ${r}`);
  return l.join('\n');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === fs.realpathSync(process.argv[1])) {
  const fichiers = process.argv.slice(2);
  if (fichiers.length < 2 || fichiers.length > 3) {
    console.error('usage : node scripts/preuves/20261111_p1_ecarts.mjs [Ravant.json] R0.json R1.json');
    process.exit(2);
  }
  const r = fichiers.map((f) => fs.readFileSync(f, 'utf8'));
  if (r.length === 2) {
    const e = ecarts(r[0], r[1]);
    console.log(decrire('Fenêtre', e));
    process.exit(verdict(e).etat === 'VERT' ? 0 : 1);
  }
  const av = ecarts(r[0], r[1]), ap = ecarts(r[1], r[2]);
  console.log(decrire('AVANT (Ravant → R0)', av));
  console.log(decrire('APRÈS (R0 → R1)', ap));
  for (const q of ap.requetes) {
    const p = av.requetes.find((x) => x.queryid === q.queryid);
    if (p?.pagesParAppel && q.pagesParAppel !== null) console.log(`  gain ${q.nom} : pages par appel ÷ ${f1(p.pagesParAppel / Math.max(q.pagesParAppel, 1))}`);
  }
  process.exit(verdict(ap).etat === 'VERT' ? 0 : 1);
}
