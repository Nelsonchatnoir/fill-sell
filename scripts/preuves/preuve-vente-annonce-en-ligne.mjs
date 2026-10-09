// ════════════════════════════════════════════════════════════════════════════
// PREUVE EN PROD, SANS RIEN GARDER — une annonce encore en ligne n'est pas
// vendue sans preuve (migration 20261009120000, 09/10, Marta — chantier A)
// ════════════════════════════════════════════════════════════════════════════
// Tout se passe dans UNE transaction qui finit TOUJOURS en erreur (le rapport
// est le message de l'erreur) : rien n'est validé, rien ne reste (vente, stock,
// job, notes push, journaux), aucun appel pg_net ne part.
//
//   node scripts/preuves/preuve-vente-annonce-en-ligne.mjs --avec-migration
//        (rejoue la migration DANS la transaction : preuve AVANT application)
//   node scripts/preuves/preuve-vente-annonce-en-ligne.mjs   (migration en prod)
//
// Sur les jobs RÉELS de Marta (ac19c8c9…), modifiés puis annulés :
//   1. l'enchère 920016444915 (fin 14/10) « Plus en ligne » → « Vendue » REFUSÉ ;
//   2. même job sans date de fin, vu en vente par le veilleur après l'alerte → REFUSÉ ;
//   3. 398423978704, relevée en ligne à 09:27:50Z, alerte posée AVANT → REFUSÉ ;
//   4. 398423978704, alerte posée APRÈS la dernière vue → la déclaration PASSE
//      (la personne reste maîtresse de sa réponse quand rien ne la dément) ;
//   5. l'enchère, preuve « sold » posée → la vente PASSE (une preuve n'est
//      jamais retenue par la garde).
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const avec = process.argv.includes('--avec-migration');
const migration = avec
  ? readFileSync(path.join(RACINE, 'supabase/migrations/20261009120000_vente_sans_preuve_annonce_en_ligne.sql'), 'utf8')
  : '';
const U = 'ac19c8c9-586a-4f76-a0fc-55e4e59ab3c3';
const ENCHERE = '3a4dd818-b4e9-4c32-9017-daf8fd5638c5';
const FIXE = '04f76ff7-1d9e-4be1-a6f9-c919e2f8bdf2';

const test = String.raw`
do $t$
declare
  u uuid := '${U}';
  r jsonb; rapport jsonb := '[]'::jsonb;
  vu timestamptz;
begin
  -- Le reçu de la fausse vente du 09/10 (laissé en place après l'annulation)
  -- rejouerait l'ancien résultat : il est écarté, DANS la transaction annulée.
  delete from ventes_operations where user_id = u and cle = 'annonce:ebay:920016444915';

  -- 1. L'enchère, fin future, alerte posée.
  update cross_post_jobs set platform_fields = platform_fields
    || jsonb_build_object('unavailable_since', (now() - interval '2 minutes')::text)
    where id = '${ENCHERE}';
  r := enregistrer_vente_declaree(u, '${ENCHERE}', 15);
  rapport := rapport || jsonb_build_object('cas', '1 enchère fin future', 'attendu', 'refus', 'ok', r->'ok', 'code', r->'code', 'raison', r->'reason');

  -- 2. Sans fin connue, vue en vente par le veilleur APRÈS l'alerte.
  update cross_post_jobs set platform_fields = (platform_fields - 'fin_ebay')
    || jsonb_build_object('unavailable_since', (now() - interval '2 hours')::text,
                          'quantite_ebay', jsonb_build_object('disponible', 1, 'vendus', 0, 'exacte', true, 'vu_le', (now() - interval '1 hour')::text))
    where id = '${ENCHERE}';
  r := enregistrer_vente_declaree(u, '${ENCHERE}', 15);
  rapport := rapport || jsonb_build_object('cas', '2 vue en vente après l''alerte', 'attendu', 'refus', 'ok', r->'ok', 'code', r->'code', 'raison', r->'reason');

  -- 3. Prix fixe relevé en ligne APRÈS l'alerte.
  select a.vu_le into vu from annonces_plateforme a where a.user_id = u and a.platform = 'ebay' and a.listing_id = '398423978704';
  update cross_post_jobs set platform_fields = (platform_fields - 'quantite_ebay' - 'fin_ebay')
    || jsonb_build_object('unavailable_since', (vu - interval '10 minutes')::text)
    where id = '${FIXE}';
  r := enregistrer_vente_declaree(u, '${FIXE}', 5.97);
  rapport := rapport || jsonb_build_object('cas', '3 relevée en ligne après l''alerte', 'attendu', 'refus', 'ok', r->'ok', 'code', r->'code', 'raison', r->'reason');

  -- 4. Prix fixe, alerte APRÈS la dernière vue : rien ne la dément.
  update cross_post_jobs set platform_fields = platform_fields
    || jsonb_build_object('unavailable_since', (vu + interval '10 minutes')::text)
    where id = '${FIXE}';
  r := enregistrer_vente_declaree(u, '${FIXE}', 5.97);
  rapport := rapport || jsonb_build_object('cas', '4 alerte non démentie', 'attendu', 'vente', 'ok', r->'ok', 'plateforme',
    (select v.plateforme from ventes v where v.id = ((r->'ventes_ids')->>0)::bigint));

  -- 5. L'enchère avec une preuve « sold » (fin future gardée) : jamais retenue.
  update cross_post_jobs set platform_fields = platform_fields
    || jsonb_build_object('sale_signal', 'sold', 'unavailable_since', now()::text,
                          'fin_ebay', jsonb_build_object('fin', '2026-10-14T06:36:52.000Z', 'vendus', 0))
    where id = '${ENCHERE}';
  r := enregistrer_vente_atomique(u, null, p_job := '${ENCHERE}', p_prix := 15);
  rapport := rapport || jsonb_build_object('cas', '5 preuve sold', 'attendu', 'vente', 'ok', r->'ok', 'plateforme',
    (select v.plateforme from ventes v where v.id = ((r->'ventes_ids')->>0)::bigint));

  raise exception 'RAPPORT %', rapport;
end
$t$;
`;

const dir = mkdtempSync(path.join(tmpdir(), 'preuve-vente-en-ligne-'));
const f = path.join(dir, 'preuve.sql');
writeFileSync(f, migration + '\n' + test);
const res = spawnSync('npx', ['supabase', 'db', 'query', '--linked', '-f', f], { cwd: RACINE, encoding: 'utf8', shell: true });
const sortie = `${res.stdout}\n${res.stderr}`;
// L'erreur voulue revient en JSON imbriqué (CLI → API → Postgres) : on dépile.
let texte = sortie;
for (let k = 0; k < 4 && !/RAPPORT \[\{"/.test(texte); k++) {
  const deb = texte.indexOf('{');
  if (deb < 0) break;
  try {
    const o = JSON.parse(texte.slice(deb, texte.lastIndexOf('}') + 1));
    texte = String(o?.error?.message ?? o?.message ?? '');
  } catch { break; }
}
const m = texte.match(/RAPPORT (\[\{"[\s\S]*\}\])/);
if (!m) { console.log(sortie.slice(-2000)); process.exit(1); }
const cas = JSON.parse(m[1]);
let rouge = 0;
for (const c of cas) {
  const bon = c.attendu === 'refus' ? c.ok === false && c.code === 'annonce_en_ligne' : c.ok === true;
  if (!bon) rouge++;
  console.log(`${bon ? '✓' : '✗'} ${c.cas} → ${c.attendu === 'refus' ? (c.raison ?? JSON.stringify(c)) : `vente ${c.plateforme ?? '?'}`}`);
}
console.log(rouge ? `ROUGE : ${rouge} cas` : `VERT : ${cas.length} cas (transaction annulée, rien n'est resté)`);
process.exit(rouge ? 1 : 0);
