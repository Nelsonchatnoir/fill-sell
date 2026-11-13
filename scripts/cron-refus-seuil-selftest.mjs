// ═══════════════════════════════════════════════════════════════════════════
// VERROU — LES REFUS DU RELEVÉ VINTED AUTOMATIQUE : ROUGE AU-DELÀ D'UN SEUIL (13/11/2026, lot NU, I5)
//   npm run selftest:cron-refus-seuil
// ═══════════════════════════════════════════════════════════════════════════
// Décision de Nico (13/11, question I5 de l'étape 5) : « oui, rouge au-delà d'un seuil que tu proposes ». La section P3
// d'ops-digest (« Refus de cadence du relevé Vinted automatique ») était INFORMATIVE : jamais rouge, hors des anomalies.
// LE SEUIL PROPOSÉ, chiffré sur la prod (lecture seule du 13/11, repli « notes » d'ops-digest rejoué à chacun de ses
// passages — cron 08:50 UTC — du 31/10 au 13/11 : 14 passages) :
//   · par passage : 27 à 121 refus (médiane ≈ 59), 26 à 62 comptes ;
//   · par compte et par passage : 1 à 5 d'ordinaire (centile 99 des comptes-jours : 5), un compte à 6 une fois
//     (229c7b07, 10/11) ; AU-DELÀ, un seul compte, f44b5917 : 8 (31/10), 7 (02/11), 11 (03/11), 14 (05/11) — l'alarme
//     relancée en boucle (redémarrages, plusieurs postes), exactement ce qu'il faut voir ; plus rien depuis le 06/11.
//   ROUGE = un compte à PLUS DE 6 refus en 24 h (signature de boucle), OU PLUS DE 150 refus en 24 h en tout (vague
//   générale : 1,25 × le plus haut des 14 jours, 121). Rejoué sur les 14 passages : 4 rouges, tous f44b5917, 0 par le total.
// Le rouge entre dans les anomalies du digest (une ligne : cron_refus_au_dela_du_seuil = 1) — comme toute section rouge ;
// sous le seuil, la section reste informative. Ni la cadence ni la règle des 20 h ne changent.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RACINE = process.env.FILLSELL_RACINE ? path.resolve(process.env.FILLSELL_RACINE) : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (p) => { try { return fs.readFileSync(path.join(RACINE, p), 'utf8'); } catch { return ''; } };
let R = {};
try { R = await import(pathToFileURL(path.join(RACINE, 'supabase/functions/_shared/cron-refus.js')).href); } catch { R = {}; }
const fn = (nom) => (typeof R[nom] === 'function' ? R[nom] : null);

let ko = 0, n = 0;
const ok = (c, nom, d = '') => { n++; if (c) console.log(`  ✓ ${nom}`); else { ko++; console.log(`  ✗ ${nom}${d ? `\n      ← ${d}` : ''}`); } };

// Les 14 passages réels (refus par compte, du plus haut au plus bas ; id8 nommé pour les comptes au-delà ou au seuil).
const PASSAGES = {
  '2026-10-31': { nomme: ['f44b5917', 8], reste: [4, 4, 3, 3, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1] },
  '2026-11-01': { reste: [3, 3, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1] },
  '2026-11-02': { nomme: ['f44b5917', 7], reste: [3, 3, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1] },
  '2026-11-03': { nomme: ['f44b5917', 11], reste: [4, 4, 4, 3, 3, 3, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1] },
  '2026-11-04': { reste: [3, 2, 2, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1] },
  '2026-11-05': { nomme: ['f44b5917', 14], reste: [3, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1] },
  '2026-11-06': { reste: [5, 4, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1] },
  '2026-11-07': { reste: [3, 3, 3, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1] },
  '2026-11-08': { reste: [4, 4, 3, 3, 3, 3, 3, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1] },
  '2026-11-09': { reste: [5, 3, 3, 3, 3, 3, 3, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1] },
  '2026-11-10': { nomme: ['229c7b07', 6], reste: [5, 4, 4, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1] },
  '2026-11-11': { reste: [4, 3, 2, 2, 2, 2, 2, 2, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1] },
  '2026-11-12': { reste: [2, 2, 2, 2, 2, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1] },
  '2026-11-13': { reste: [2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1] },
};
const TOTAUX = { '2026-10-31': 63, '2026-11-01': 40, '2026-11-02': 71, '2026-11-03': 100, '2026-11-04': 33, '2026-11-05': 63, '2026-11-06': 50, '2026-11-07': 55, '2026-11-08': 83, '2026-11-09': 78, '2026-11-10': 121, '2026-11-11': 47, '2026-11-12': 49, '2026-11-13': 27 };
const uid = (id8, i) => `${id8 ?? String(i).padStart(8, '0')}-0000-4000-8000-${String(i).padStart(12, '0')}`;
// Le passage en lignes usage_logs « cron_refuse » (source « journal ») : une ligne par refus.
const lignesDe = (p) => {
  const out = [];
  const comptes = [...(p.nomme ? [[p.nomme[0], p.nomme[1]]] : []), ...p.reste.map((k) => [null, k])];
  comptes.forEach(([id8, k], i) => { for (let j = 0; j < k; j++) out.push({ user_id: uid(id8, i + 1), feature: 'cron_refuse', metadata: { age_min: 300, nouveaux: 1 } }); });
  return out;
};
// Le même passage en notes de relevés porteurs (source « notes », repli d'avant la migration) : un porteur par compte.
const notesDe = (p) => {
  const comptes = [...(p.nomme ? [[p.nomme[0], p.nomme[1]]] : []), ...p.reste.map((k) => [null, k])];
  return comptes.map(([id8, k], i) => ({ user_id: uid(id8, i + 1), finished_at: '2026-11-04T18:00:00Z',
    erreur: `[note] cadence cron : ${k} sync 'cron' refusée(s) depuis ce run (fenêtre de 20 h), dernière le 2026-11-05T06:00:00.000Z` }));
};

console.log('\nA. LE SEUIL, NOMMÉ ET PARTAGÉ');
ok(R.SEUILS_REFUS_CRON && R.SEUILS_REFUS_CRON.parCompte24h === 6 && R.SEUILS_REFUS_CRON.total24h === 150, 'seuils : plus de 6 refus pour UN compte, ou plus de 150 en tout, en 24 h', JSON.stringify(R.SEUILS_REFUS_CRON));
ok(Boolean(fn('jugerRefusCron')), 'jugerRefusCron(résumé) existe');

console.log('\nB. LES 14 PASSAGES RÉELS (31/10 → 13/11) — source « journal »');
const rouges = [];
for (const [jour, p] of Object.entries(PASSAGES)) {
  const r = fn('resumerRefusCron') ? R.resumerRefusCron(lignesDe(p)) : null;
  if (!r || r.total !== TOTAUX[jour]) { ok(false, `${jour} : total ${TOTAUX[jour]}`, JSON.stringify(r?.total)); continue; }
  const j = fn('jugerRefusCron') ? R.jugerRefusCron(r) : null;
  if (j?.rouge) rouges.push(`${jour}:${j.comptesAuDela.map(([u, k]) => `${u}x${k}`).join('+')}${j.totalAuDela ? ':total' : ''}`);
}
ok(rouges.join(' ') === '2026-10-31:f44b5917x8 2026-11-02:f44b5917x7 2026-11-03:f44b5917x11 2026-11-05:f44b5917x14', '4 passages rouges sur 14, tous f44b5917 (8, 7, 11, 14 refus) ; aucun par le total', rouges.join(' '));
const r10 = fn('resumerRefusCron') ? R.resumerRefusCron(lignesDe(PASSAGES['2026-11-10'])) : null;
const j10 = r10 && fn('jugerRefusCron') ? R.jugerRefusCron(r10) : null;
ok(j10 && j10.rouge === false && r10.total === 121, '10/11 : 121 refus, 62 comptes, 229c7b07 à 6 (le seuil, pas au-delà) → pas rouge', JSON.stringify(j10));
const r13 = fn('resumerRefusCron') ? R.resumerRefusCron(lignesDe(PASSAGES['2026-11-13'])) : null;
ok(r13 && fn('jugerRefusCron') && R.jugerRefusCron(r13).rouge === false, '13/11 : 27 refus, au plus 2 par compte → pas rouge');

console.log('\nC. UNE VAGUE GÉNÉRALE (total), ET LE REPLI « NOTES »');
const vague = { reste: [...Array(75).fill(2), 1] }; // 151 refus, au plus 2 par compte
const rv = fn('resumerRefusCron') ? R.resumerRefusCron(lignesDe(vague)) : null;
const jv = rv && fn('jugerRefusCron') ? R.jugerRefusCron(rv) : null;
ok(jv && rv.total === 151 && jv.rouge === true && jv.totalAuDela === true && jv.comptesAuDela.length === 0, '151 refus sur 76 comptes, aucun compte au-delà → rouge par le total', JSON.stringify(jv));
const rn = fn('resumerNotesPorteurs') ? R.resumerNotesPorteurs(notesDe(PASSAGES['2026-11-05']), '2026-11-04T08:50:00Z') : null;
const jn = rn && fn('jugerRefusCron') ? R.jugerRefusCron(rn) : null;
ok(jn && rn.total === 63 && jn.rouge === true && jn.comptesAuDela.map(([u]) => u).join() === 'f44b5917', 'repli « notes » (migration pas encore appliquée), passage du 05/11 : f44b5917 ×14 → rouge', JSON.stringify(jn));
ok(fn('jugerRefusCron') && R.jugerRefusCron(null).rouge === false && R.jugerRefusCron({ total: 0, comptes: 0, top: [] }).rouge === false, 'aucun refus, ou résumé illisible → jamais rouge (rien d\'inventé)');
const txt = jn && fn('texteSeuilRefusCron') ? R.texteSeuilRefusCron(jn) : '';
ok(/f44b5917 ×14/.test(txt) && /plus de 6/.test(txt), 'la ligne rouge nomme le compte (id8) et le seuil', txt);

console.log('\nD. OPS-DIGEST');
const od = lire('supabase/functions/ops-digest/index.ts');
const counts = od.slice(od.indexOf('const counts = {'), od.indexOf('const total = Object.values(counts)'));
ok(/jugerRefusCron\(/.test(od) && /from "\.\.\/_shared\/cron-refus\.js"/.test(od), 'ops-digest juge avec la règle partagée (_shared/cron-refus.js)');
ok(/cron_refus_au_dela_du_seuil:\s*cronRefusRouge \? 1 : 0/.test(counts), 'rouge = une anomalie (cron_refus_au_dela_du_seuil, 0 ou 1) — jamais le nombre brut de refus', counts.match(/cron_refus[^\n]*/)?.[0] ?? '');
ok(/cronRefusRouge \? "#B91C1C"/.test(od) && /cronRefusRouge \? "🔴" : "•"/.test(od), 'la section passe en rouge (🔴, #B91C1C) au-delà du seuil, reste « • » sinon');
ok(/rouge: cronRefusRouge/.test(od), 'la réponse JSON (cron_refus_24h) dit si le seuil est franchi');

console.log(ko ? `\n${ko} ÉCHEC(S) sur ${n}` : `\nTOUT VERT (${n})`);
process.exit(ko ? 1 : 0);
