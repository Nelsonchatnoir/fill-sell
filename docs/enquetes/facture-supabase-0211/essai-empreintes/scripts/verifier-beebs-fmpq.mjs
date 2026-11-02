// Deux précisions, en lecture seule :
//  1. beebs_numeros_par_sequence ne regarde que les dépôts Beebs « published » SANS numéro ni lien : parmi les paires
//     (première photo de la fiche du dépôt, photo de l'annonce Beebs) dont le prédicat « identique » change, celles-là.
//  2. fiches_meme_photo_questions écarte une paire qui a DÉJÀ une ligne inventaire_doublons (motif ≠ copie_non_prouvee) :
//     parmi les paires perdues / nouvelles, celles qui changeraient vraiment une question.
import fs from 'node:fs';
import path from 'node:path';
import { W } from './jeux.mjs';
import { requete } from './sql-lecture.mjs';
const s = JSON.parse(fs.readFileSync(path.join(W, 'donnees', 'synthese.json'), 'utf8'));
// 1.
const jobs = fs.readFileSync(path.join(W, 'donnees', 'tables', 'jobs.ndjson'), 'utf8').split('\n').slice(1).filter(Boolean).map(JSON.parse);
const sansNumero = new Set(jobs.filter((j) => j[2] === 'beebs' && ['publish', 'republish'].includes(j[3]) && j[4] === 'published'
  && !/^[0-9]{6,}$/.test(String(j[7] ?? '').trim()) && !j[8] && j[5]).map((j) => j[5]));
const comptesB = new Set(s.autres.beebs_numeros_par_sequence.ex.map((e) => e.compte));
const tous = [];
for (const f of fs.readdirSync(path.join(W, 'donnees', 'resultats', 'autres'))) {
  const r = JSON.parse(fs.readFileSync(path.join(W, 'donnees', 'resultats', 'autres', f), 'utf8'));
  for (const e of r.R.beebs_numeros_par_sequence.ex) tous.push({ compte: r.user.slice(0, 8), ...e, n: r.R.beebs_numeros_par_sequence.perdues + r.R.beebs_numeros_par_sequence.nouvelles });
}
const vraies = tous.filter((e) => sansNumero.has(e.fiche));
console.log('beebs : paires changées listées', tous.length, '(total', s.autres.beebs_numeros_par_sequence.perdues + s.autres.beebs_numeros_par_sequence.nouvelles, ') — dont fiche avec un dépôt Beebs publié sans numéro ni lien :', vraies.length, JSON.stringify(vraies));
void comptesB;
// 2.
const ex = s.autres.fiches_meme_photo_questions.ex;
const paires = ex.map((e) => e.paire.split('|'));
const lit = paires.map(([a, b]) => `(${a}::bigint, ${b}::bigint)`).join(',');
const rows = requete(`select json_agg(json_build_array(p.a::text, p.b::text, d.statut, d.motif)) j from (values ${lit}) p(a, b)
  join inventaire_doublons d on least(d.garde, d.absorbe) = p.a and greatest(d.garde, d.absorbe) = p.b and d.motif is distinct from 'copie_non_prouvee';`, '_fmpq.sql');
const deja = new Set((rows[0].j ?? []).map((x) => x[0] + '|' + x[1]));
const parSens = {}; for (const e of ex) { const k = `${e.sens}${deja.has(e.paire) ? ' (déjà une ligne inventaire_doublons : sans effet)' : ' (aucune ligne : effet réel)'}`; parSens[k] = (parSens[k] ?? 0) + 1; }
console.log('fiches_meme_photo_questions :', JSON.stringify(parSens));
fs.writeFileSync(path.join(W, 'donnees', 'resultats', 'beebs-fmpq.json'), JSON.stringify({ beebs: vraies, fmpq: ex.map((e) => ({ ...e, deja: deja.has(e.paire) })) }, null, 1));
