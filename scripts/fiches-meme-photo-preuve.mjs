// PREUVE EN PROD, SANS RIEN GARDER — fiches_meme_photo_questions (migration 20261009200000).
// Transaction qui finit toujours en erreur : la fonction est posée, appelée sur TOUS les
// comptes qui ont deux fiches de même photo, puis tout est annulé. On mesure la durée,
// on compte les questions par motif, on vérifie que ni fiche, ni vente, ni job ne bouge,
// qu'un second appel ne repose rien, et le cas 5 reconstitué (compte d'essai).
//   node scripts/fiches-meme-photo-preuve.mjs [--avec-migration]
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIG = process.argv.includes('--avec-migration')
  ? readFileSync(path.join(RACINE, 'supabase/migrations/20261009200000_fiches_meme_photo_questions.sql'), 'utf8') : '';
const U = '5322fa18-c194-458b-a222-7ee4093c4968';
const test = String.raw`
create temp table comptes on commit drop as
  select distinct i.user_id from inventaire i join photo_empreintes e on e.url = i.photos ->> 0
   where i.fusionne_dans is null and i.statut in ('stock','vendu') and jsonb_typeof(i.photos) = 'array' and e.phash is not null
   group by i.user_id, e.phash having count(*) > 1;
create temp table empreinte(k text, v text) on commit drop;
insert into empreinte select 'avant',
  md5(coalesce((select string_agg(md5(to_jsonb(i)::text), '' order by i.id) from inventaire i where i.user_id in (select user_id from comptes)), '')) ||
  md5(coalesce((select string_agg(md5(to_jsonb(v)::text), '' order by v.id) from ventes v where v.user_id in (select user_id from comptes)), '')) ||
  md5(coalesce((select string_agg(md5(to_jsonb(j)::text), '' order by j.id) from cross_post_jobs j where j.user_id in (select user_id from comptes)), ''));
do $t$
declare
  t0 timestamptz; ms numeric; n1 int := 0; n2 int := 0; c record; a text; b text; q int; m text; g bigint; f bigint := 990000000000200;
  rap text;
begin
  t0 := clock_timestamp();
  for c in select user_id from comptes loop n1 := n1 + public.fiches_meme_photo_questions(c.user_id, 50); end loop;
  ms := round(extract(epoch from clock_timestamp() - t0) * 1000);
  for c in select user_id from comptes loop n2 := n2 + public.fiches_meme_photo_questions(c.user_id, 50); end loop;
  select string_agg(motif || '=' || k, ' ') into rap from (select motif, count(*)::text k from inventaire_doublons where source = 'meme_photo' group by motif) x;
  insert into empreinte select 'apres',
    md5(coalesce((select string_agg(md5(to_jsonb(i)::text), '' order by i.id) from inventaire i where i.user_id in (select user_id from comptes)), '')) ||
    md5(coalesce((select string_agg(md5(to_jsonb(v)::text), '' order by v.id) from ventes v where v.user_id in (select user_id from comptes)), '')) ||
    md5(coalesce((select string_agg(md5(to_jsonb(j)::text), '' order by j.id) from cross_post_jobs j where j.user_id in (select user_id from comptes)), ''));
  select v into a from empreinte where k = 'avant'; select v into b from empreinte where k = 'apres';
  -- Cas 5 reconstitué : une fiche vendue et une fiche en stock, même photo.
  insert into photo_empreintes (url, phash, dhash, source, calculee_le) values ('https://essai.invalid/cas5.jpg', 'abcdef0123456789', 'abcdef0123456789', 'essai', now())
    on conflict (url) do nothing;
  insert into inventaire (id, user_id, titre, statut, quantite, photos) values
    (f+1, '${U}', 'Xbox vendue', 'vendu', 0, '["https://essai.invalid/cas5.jpg"]'),
    (f+2, '${U}', 'Xbox en stock', 'stock', 1, '["https://essai.invalid/cas5.jpg"]');
  q := public.fiches_meme_photo_questions('${U}', 20);
  select motif, garde into m, g from inventaire_doublons where user_id = '${U}' and source = 'meme_photo' and least(garde, absorbe) = f+1;
  raise exception 'PREUVE_PHOTO comptes=% questions=% (%) ms=% second_appel=% fiches_ventes_jobs_identiques=% cas5=% motif=% garde_est_la_vendue=%',
    (select count(*) from comptes), n1, rap, ms, n2, (a = b), q, m, (g = f+1);
end $t$;
`;
// REPEATABLE READ : les deux empreintes voient le MÊME instantané de la base (la prod
// écrit pendant la preuve ; en READ COMMITTED, ses écritures fausseraient la comparaison).
const sql = `begin isolation level repeatable read;\n${MIG}\n${test}\nrollback;\n`;
const dossier = mkdtempSync(path.join(tmpdir(), 'preuve-photo-'));
const fichier = path.join(dossier, 'preuve.sql');
writeFileSync(fichier, sql);
const r = spawnSync('npx', ['supabase', 'db', 'query', '--linked', '-f', fichier], { cwd: RACINE, encoding: 'utf8', shell: true });
const m = `${r.stdout}\n${r.stderr}`.match(/PREUVE_PHOTO ([^"\\]*)/);
if (!m) { console.log(`${r.stdout}\n${r.stderr}`.slice(0, 3000)); process.exit(1); }
console.log(m[1]);
const ok = /second_appel=0 /.test(m[1]) && /identiques=t /.test(m[1]) && /cas5=1 motif=homonyme_vendu garde_est_la_vendue=t/.test(m[1]);
console.log(ok ? '✓ preuve verte — rien n\'a été gardé' : '✗ preuve rouge — rien n\'a été gardé');
process.exit(ok ? 0 : 1);
