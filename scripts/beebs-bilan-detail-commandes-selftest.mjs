// selftest:beebs-bilan-detail-commandes — (24/10, feu vert 2 de Nico) Le bilan Beebs garde le détail de chaque commande,
// en fantôme comme en écrit, pour tous les comptes ; rien d'autre ne change (mêmes compteurs, mêmes gardes, même
// écriture, seulement si ventes_beebs_commandes = 1 — qui reste à 0).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (p) => fs.readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');
let n = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); n++; console.log(`  ✓ ${msg}`); };
const M = lire('supabase/migrations/20261024160000_beebs_bilan_detail_commandes.sql');
const I = lire('supabase/rollbacks/20261024160000_beebs_bilan_detail_commandes_INVERSE.sql');
const E = lire('scripts/essais/20261024160000_essai.sql');
const sansCommentaires = (s) => s.split('\n').map((l) => l.replace(/--.*$/, '')).join('\n');

console.log('1. Le détail');
ok(M.includes("v_bilan := v_bilan || jsonb_build_object('commandes', v_detail)"), 'le bilan porte « commandes »');
for (const cle of ["'ref', v_ref", "'statut', v_statut", "'classe', v_classe", "'date', v_date"]) ok(M.includes(cle), `chaque commande : ${cle}`);
ok(M.includes("jsonb_build_object('id', v_id, 'verdict', v_verdict, 'job', v_job, 'fiche', v_fiche::text, 'titre', v_titre)"), 'chaque produit : verdict, job, fiche, titre');
for (const v of ["'forme_inconnue'", "'deja_vendue'", "'sans_job'", "'doute'", "'deja_prouvee'", "'fiche_deja_vendue'", "'aurait_prouve'"]) ok(M.includes(`v_verdict := ${v}`) || M.includes(`ELSE ${v} END`), `verdict ${v}`);
ok(M.includes("jsonb_build_object('build', left(v_build, 60))"), 'l\'extension du compte au moment du bilan');

console.log('2. Rien d\'autre ne change');
for (const c of ['c_recues', 'c_prouvees', 'c_deja', 'c_doute', 'c_sans_job', 'c_forme', 'c_annulees', 'c_levees', 'c_annulee_apres', 'c_inconnu', 'c_fiche_vendue', 'c_produits']) {
  const avant = (I.match(new RegExp(`${c} := ${c} \\+`, 'g')) ?? []).length;
  const apres = (M.match(new RegExp(`${c} := ${c} \\+`, 'g')) ?? []).length;
  ok(avant === apres, `${c} : ${apres} incrément(s), comme avant`);
}
ok((sansCommentaires(M).match(/UPDATE cross_post_jobs/g) ?? []).length === (sansCommentaires(I).match(/UPDATE cross_post_jobs/g) ?? []).length, 'même écriture sur les jobs');
ok(M.includes("v_ecrit := coalesce((SELECT c.value FROM coin_config c WHERE c.key = 'ventes_beebs_commandes'), 0) = 1;") && !/UPDATE\s+(public\.)?coin_config/i.test(sansCommentaires(M)),
  'l\'interrupteur est seulement lu (il reste à 0)');
ok(M.includes('IF v_ecrit THEN') && /IF v_ecrit THEN\s+UPDATE cross_post_jobs c/.test(M), 'une écriture seulement si l\'interrupteur est à 1');

console.log('3. L\'inverse et l\'essai');
ok(!I.includes('v_detail') && (I.match(/CREATE OR REPLACE FUNCTION public\.commandes_beebs_noter/g) ?? []).length === 1, 'l\'inverse rend le corps d\'avant');
ok(E.trim().endsWith('ROLLBACK;') && !/^COMMIT;$/m.test(E), 'l\'essai est une transaction annulée');

console.log(`\n✓ beebs-bilan-detail-commandes : ${n} contrôles verts`);
