// selftest:vente-vinted-annulee-statut — une commande Vinted annulée ferme aussi
// l'annonce de la fiche, et le reçu effacé reste dans la trace (17/10, point 12 ;
// migration 20261017140000).
//
//   npm run selftest:vente-vinted-annulee-statut      contrôles du dépôt (hors ligne)
//
//   1. la migration part du corps de prod lu le 17/10 14:05 (garde md5) et ne touche que
//      les lignes de la règle : 2 lignes d'origine remplacées, le reste ajouté ;
//   2. l'état d'annonce posé est celui que le relevé du dressing écrit ('closed' fermée
//      sans vente, 'active' en ligne), seulement si la fiche porte CETTE annonce et si la
//      valeur change — tracé dans inventaire_journal ;
//   3. le reçu effacé part dans la trace vente_retiree AVANT d'être effacé ;
//   4. tout le reste est inchangé (ventes retirées, fiche au stock, job clos ou republié,
//      interrupteur, liste d'attente, aucun envoi) ;
//   5. l'inverse rend le corps de prod à l'octet (md5) ;
//   6. l'essai à blanc rejoue le corps exact de la migration, sur le compte de Nico
//      seulement, et finit par ROLLBACK ;
//   7. la règle, en clair (miroir pur de la décision SQL).
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const F_MIG = 'supabase/migrations/20261017140000_vente_vinted_annulee_statut_annonce.sql';
const F_INV = 'supabase/rollbacks/20261017140000_vente_vinted_annulee_statut_annonce.sql';
const F_ESS = 'scripts/essais/20261017140000_essai.sql';
const F_VINTED = 'chrome-extension/content-scripts/vinted.js';
const MD5_PROD = '0dd6dc8aedf022b9cd3226459f16a83e';
const NICO = 'f44b5917-bccc-4431-ba41-f40571a2ed18';

let echecs = 0, total = 0;
const ok = (c, l, detail = '') => { total++; if (!c) echecs++; console.log(`${c ? '✓' : '✗'} ${l}${c || !detail ? '' : `   ← ${detail}`}`); };
for (const f of [F_MIG, F_INV, F_ESS]) {
  if (!existsSync(path.join(RACINE, f))) { console.log(`✗ fichier absent : ${f}`); process.exit(1); }
}
const lire = (f) => readFileSync(path.join(RACINE, f), 'utf8').replace(/\r\n/g, '\n');
const MIG = lire(F_MIG), INV = lire(F_INV), ESS = lire(F_ESS), VINTED = lire(F_VINTED);
const md5 = (s) => createHash('md5').update(s, 'utf8').digest('hex');
const SIG = 'CREATE OR REPLACE FUNCTION public.vente_commande_annulee_vinted(';
const corps = (t) => {
  const i = t.indexOf(SIG); if (i < 0) return '';
  const a = t.indexOf('AS $function$', i); const b = t.indexOf('$function$\n', a + 13);
  return a < 0 || b < 0 ? '' : t.slice(i, b + 11);
};
const NEUF = corps(MIG), PROD = corps(INV);
const bloc = (t) => {
  const d = t.indexOf('-- ═══ CORPS DE LA MIGRATION'); const f = t.indexOf('-- ═══ FIN DU CORPS DE LA MIGRATION');
  return d < 0 || f < 0 ? '' : t.slice(d, t.indexOf('\n', f));
};

console.log('1. La migration part du corps de prod et ne touche que la règle');
ok(MIG.includes(`IS DISTINCT FROM '${MD5_PROD}'`) && MIG.includes("md5(pg_get_functiondef('public.vente_commande_annulee_vinted(bigint,text,text,timestamptz)'::regprocedure))"),
  'garde md5 du corps de prod lu le 17/10 14:05 : la migration s\'arrête s\'il a bougé');
ok(/^BEGIN;$/m.test(MIG) && /^COMMIT;$/m.test(MIG) && MIG.indexOf('DO $garde$') < MIG.indexOf(SIG), 'une transaction ; la garde passe avant la définition');
ok(/REVOKE ALL ON FUNCTION public\.vente_commande_annulee_vinted\(bigint, text, text, timestamptz\) FROM PUBLIC, anon, authenticated;/.test(MIG),
  'la règle reste fermée à l\'app (REVOKE)');
const compte = (lignes) => lignes.reduce((m, l) => m.set(l, (m.get(l) ?? 0) + 1), new Map());
const cP = compte(PROD.split('\n')), cN = compte(NEUF.split('\n'));
const retirees = [...cP].filter(([l, n]) => (cN.get(l) ?? 0) < n).map(([l]) => l.trim());
ok(retirees.length === 2
   && retirees.some((l) => l.startsWith("jsonb_build_object('vente', to_jsonb(v), 'statut', p_statut, 'commande', p_commande, 'source', 'releve_vinted', 'motif', v_motif));"))
   && retirees.some((l) => l.startsWith("RETURN jsonb_build_object('action', 'retiree', 'fiche', v_rendue, 'copie_effacee', v_hist, 'job', v_job);")),
  'seules 2 lignes d\'origine changent (la trace prend « recus », le retour prend « vinted_status ») ; le reste est ajouté', retirees.join(' | '));

console.log('\n2. L\'état d\'annonce de la fiche : la valeur du relevé, tracée');
ok(/statut = it\.item_closing_action === "sold" \? "sold" : "closed";/.test(VINTED), "'closed' est le mot du relevé du dressing pour une annonce fermée sans vente (content-scripts/vinted.js)");
ok(/v_vs := CASE WHEN v_snap\.status = 'active' AND v_snap\.captured_at > coalesce\(j\.sold_at, v\.created_at\)\s+THEN 'active' ELSE 'closed' END;/.test(NEUF),
  "'active' si un relevé a revu l'annonce en ligne APRÈS la vente, 'closed' sinon — la même lecture que le job");
ok(/IF v\.annonce_id IS NOT NULL AND btrim\(coalesce\(i\.vinted_item_id, ''\)\) = v\.annonce_id THEN/.test(NEUF), 'seulement si la fiche porte CETTE annonce (jamais une autre)');
ok(/IF i\.vinted_status IS DISTINCT FROM v_vs THEN\s+UPDATE inventaire SET vinted_status = v_vs WHERE id = i\.id AND vinted_status IS DISTINCT FROM v_vs;/.test(NEUF),
  'aucune ligne inchangée réécrite');
ok(/'vinted_status', i\.vinted_status, v_vs, 'releve_vinted', 'commande_annulee'/.test(NEUF), 'tracé dans inventaire_journal (champ vinted_status, source releve_vinted, motif commande_annulee)');
const iRendue = NEUF.indexOf('IF v_rendue IS NOT NULL THEN'), iVs = NEUF.indexOf('v_vs := CASE'), iJob = NEUF.indexOf("-- L'annonce : revue EN LIGNE");
ok(iRendue > 0 && iRendue < iVs && iVs < iJob, 'posé seulement quand la fiche revient (fiche ou exemplaire), avant la décision du job');
const nSnap = NEUF.split('SELECT s.status, s.captured_at INTO v_snap').length - 1;
ok(nSnap === 1 && NEUF.indexOf('INTO v_snap') < NEUF.indexOf('-- La fiche revient au stock.'), 'le dernier relevé est lu UNE fois, avant la fiche');

console.log('\n3. Le reçu effacé reste dans la trace');
ok(NEUF.indexOf('SELECT jsonb_agg(to_jsonb(o)) INTO v_recus') > 0
   && NEUF.indexOf('SELECT jsonb_agg(to_jsonb(o)) INTO v_recus') < NEUF.indexOf('DELETE FROM ventes_operations o'),
  'le reçu est lu AVANT d\'être effacé');
ok(/'motif', v_motif,\s+'recus', v_recus\)\);/.test(NEUF), 'et il part dans la trace vente_retiree (clé recus)');

console.log('\n4. Le reste de la règle ne bouge pas');
ok(/'ventes_annulees_retrait_pause'/.test(NEUF) && /ventes_annulees_attente_go/.test(NEUF), 'même interrupteur, même liste d\'attente');
ok(/coalesce\(v\.source, ''\) = 'releve' OR j\.id IS NOT NULL/.test(NEUF) && /timestamptz '2026-10-13 00:00:00\+02'/.test(NEUF), 'retirée seulement sur preuve, commande du 13/10 ou après ; sinon signalée');
ok(/INSERT INTO ventes_supprimees/.test(NEUF) && /DELETE FROM ventes WHERE id = v\.id;/.test(NEUF), 'vente tracée (ventes_supprimees) puis retirée');
ok(/UPDATE inventaire SET statut = 'stock', quantite = v_q WHERE id = i\.id AND statut = 'vendu';/.test(NEUF)
   && /UPDATE inventaire SET quantite = coalesce\(quantite, 0\) \+ v_q WHERE id = i\.id;/.test(NEUF), 'fiche au stock, ou exemplaire rendu (+1)');
ok(/L''annonce Vinted reste fermée : remets-le en vente quand tu veux\./.test(NEUF) && /v_job := 'en_ligne';/.test(NEUF), 'job clos et dit, ou republié si l\'annonce a été revue en ligne');
ok(!/push_ventes|push_noter|email_logs|net\.http_post/.test(NEUF), 'aucun envoi (ni note, ni mail)');

console.log('\n5. L\'inverse');
ok(md5(PROD) === MD5_PROD, `l'inverse rend le corps de prod à l'octet (md5 ${MD5_PROD})`, md5(PROD));
ok(INV.includes("position('''recus'', v_recus' IN pg_get_functiondef('public.vente_commande_annulee_vinted(bigint,text,text,timestamptz)'::regprocedure)) = 0"),
  'l\'inverse ne part que si la prod porte la version de la migration');
ok(/REVOKE ALL ON FUNCTION public\.vente_commande_annulee_vinted\(bigint, text, text, timestamptz\) FROM PUBLIC, anon, authenticated;/.test(INV), 'l\'inverse garde la règle fermée à l\'app');

console.log('\n6. L\'essai à blanc');
const B = bloc(MIG);
ok(B.length > 1000 && ESS.includes(B), 'il rejoue le corps EXACT de la migration (garde md5 + définition + droits)');
ok(/^BEGIN;$/m.test(ESS) && /^ROLLBACK;$/m.test(ESS) && !/^COMMIT;$/m.test(ESS), 'BEGIN … ROLLBACK, jamais de COMMIT');
const uuids = [...new Set(ESS.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g) ?? [])];
ok(uuids.length === 1 && uuids[0] === NICO, 'données d\'essai sur le compte de Nico SEULEMENT', uuids.join(', '));
ok(['A1 avant', 'A2 avant', 'A4 avant', 'A5 avant', 'C1 après', 'C2 après', 'C3 après', 'C4 après', 'C5 après', 'C6 après', 'C7 après', 'C8 après', 'C9 après']
  .every((c) => ESS.includes(`'${c}`)), 'contrôles A1-A5 (avant, défaut rejoué) et C1-C9 (après)');
ok(/FROM public\.email_logs WHERE user_id = 'f44b5917/.test(ESS) && /FROM public\.push_ventes WHERE user_id = 'f44b5917/.test(ESS), 'email_logs et push_ventes comptés avant et après');
ok(ESS.includes(`'${MD5_PROD}'`), 'md5 de prod vérifié AVANT');

console.log('\n7. La règle, en clair');
// Miroir pur de la décision SQL (nouvel état d'annonce de la fiche ; null = rien d'écrit).
const etatAnnonce = ({ ficheAnnonce, venteAnnonce, releve, venduLe, actuel }) => {
  if (!venteAnnonce || (ficheAnnonce ?? '').trim() !== venteAnnonce) return null;
  const vs = releve?.status === 'active' && releve.le > venduLe ? 'active' : 'closed';
  return actuel === vs ? null : vs;
};
const t = (j) => Date.parse(`2026-10-${j}T09:00:00Z`);
ok(etatAnnonce({ ficheAnnonce: '1', venteAnnonce: '1', releve: { status: 'sold', le: t(16) }, venduLe: t(13), actuel: 'sold' }) === 'closed', 'annonce encore « sold » au relevé → closed');
ok(etatAnnonce({ ficheAnnonce: '1', venteAnnonce: '1', releve: { status: 'active', le: t(14) }, venduLe: t(13), actuel: 'sold' }) === 'active', 'revue en ligne après la vente → active');
ok(etatAnnonce({ ficheAnnonce: '1', venteAnnonce: '1', releve: { status: 'active', le: t(12) }, venduLe: t(13), actuel: 'sold' }) === 'closed', 'vue en ligne AVANT la vente seulement → closed');
ok(etatAnnonce({ ficheAnnonce: '1', venteAnnonce: '1', releve: null, venduLe: t(13), actuel: 'sold' }) === 'closed', 'aucun relevé → closed');
ok(etatAnnonce({ ficheAnnonce: '2', venteAnnonce: '1', releve: { status: 'sold', le: t(16) }, venduLe: t(13), actuel: 'sold' }) === null, 'la fiche porte une autre annonce → rien');
ok(etatAnnonce({ ficheAnnonce: '1', venteAnnonce: '1', releve: { status: 'sold', le: t(16) }, venduLe: t(13), actuel: 'closed' }) === null, 'déjà closed → rien d\'écrit');

console.log(`\n${total - echecs}/${total} contrôles verts`);
process.exit(echecs ? 1 : 0);
