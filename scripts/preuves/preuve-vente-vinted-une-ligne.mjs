// ════════════════════════════════════════════════════════════════════════════
// PREUVE EN PROD, SANS RIEN GARDER — toute vente Vinted reconnue a sa ligne de
// vente, une seule (11/10, A5 ; migration 20261011120000)
// ════════════════════════════════════════════════════════════════════════════
// Depuis le 09/10 ~12:00, tout PATCH de l'extension qui pose le signal de vente
// sur un job Vinted tombait en 403 (déclencheur vinted_preuve_page_veilleur
// exécuté avec les droits de l'appelant → _ts_ou_null fermée à authenticated) ;
// le repli de l'extension passait la fiche « vendu » sans ligne de vente.
//
// Tout se passe dans UNE transaction qui finit TOUJOURS en erreur (le rapport
// est le message de l'erreur) : rien n'est validé, aucun appel pg_net ne part,
// AUCUN mail ni push n'est envoyé. Lignes d'essai sur le compte de Nico
// (hoosslocal), créées puis annulées. Les écritures « client » se font sous le
// rôle authenticated, avec les claims de Nico — comme l'extension.
//
//   node scripts/preuves/preuve-vente-vinted-une-ligne.mjs --avec-migration=20261011120000
//        (rejoue la migration DANS la transaction : preuve AVANT application)
//   node scripts/preuves/preuve-vente-vinted-une-ligne.mjs   (migration déjà en prod ;
//        sans elle, A0 montre le refus 403 d'aujourd'hui)
import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const versions = (process.argv.find((a) => a.startsWith('--avec-migration='))?.split('=')[1] ?? '').split(',').filter(Boolean);
const MIGRATIONS = versions.map((v) => {
  const f = readdirSync(path.join(RACINE, 'supabase/migrations')).find((n) => n.startsWith(`${v}_`) && n.endsWith('.sql'));
  if (!f) { console.log(`migration ${v} introuvable`); process.exit(1); }
  return readFileSync(path.join(RACINE, 'supabase/migrations', f), 'utf8')
    .replace(/^BEGIN;$/m, '').replace(/^COMMIT;$/m, '');
});
const U = '5322fa18-c194-458b-a222-7ee4093c4968';

const test = String.raw`
set local lock_timeout = '3s';
set local statement_timeout = '60s';
create temp table preuve(n serial, ok boolean, label text) on commit drop;
grant all on preuve to authenticated;
grant usage on sequence preuve_n_seq to authenticated;
create function pg_temp.verif(c boolean, l text) returns void language sql as $f$
  insert into preuve(ok, label) values (coalesce(c, false), l) $f$;

do $t$
declare
  u   uuid := '${U}';
  i1 bigint := 990000001100001; i2 bigint := 990000001100002; i3 bigint := 990000001100003; i4 bigint := 990000001100004;
  j1 uuid; j3 uuid; j4 uuid;
  v_err text; v_n int; v_m int; v_res jsonb; v_st text; v_sig text;
begin
  delete from push_ventes where user_id = u;
  insert into inventaire (id, user_id, titre, statut, quantite, prix_vente, vinted_item_id, plateforme, origine, vinted_status) values
    (i1, u, 'Robe preuve A5', 'stock', 1, 20, '990011001', 'vinted', null, 'active'),
    (i2, u, 'Pull import pur A5', 'stock', 1, 12, '990011002', 'vinted', null, 'active'),
    (i3, u, 'Veste déjà vendue A5', 'stock', 1, 30, '990011003', 'vinted', null, 'active'),
    (i4, u, 'Sac veilleur A5', 'stock', 1, 25, '990011004', 'vinted', null, 'active');
  insert into cross_post_jobs (user_id, inventaire_id, platform, status, action, title, price, platform_listing_id, listing_url, published_at)
  values (u, i1, 'vinted', 'published', 'publish', 'Robe preuve A5', 20, '990011001', 'https://www.vinted.fr/items/990011001', now() - interval '3 days')
  returning id into j1;
  insert into cross_post_jobs (user_id, inventaire_id, platform, status, action, title, price, platform_listing_id, listing_url, published_at)
  values (u, i3, 'vinted', 'published', 'publish', 'Veste déjà vendue A5', 30, '990011003', 'https://www.vinted.fr/items/990011003', now() - interval '3 days')
  returning id into j3;
  insert into cross_post_jobs (user_id, inventaire_id, platform, status, action, title, price, platform_listing_id, listing_url, published_at, last_checked_at)
  values (u, i4, 'vinted', 'published', 'publish', 'Sac veilleur A5', 25, '990011004', 'https://www.vinted.fr/items/990011004', now() - interval '3 days', now() - interval '1 hour')
  returning id into j4;

  -- A0. Le PATCH de l'extension (synchro du dressing) : le signal de vente sur le job.
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    update cross_post_jobs set platform_fields = coalesce(platform_fields, '{}'::jsonb) || jsonb_build_object(
      'sale_signal', 'sold', 'unavailable_since', to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'))
     where id = j3;
    v_err := 'ok';
  exception when others then v_err := sqlstate || ' ' || sqlerrm; end;
  execute 'reset role';
  perform pg_temp.verif(v_err = 'ok', 'A0. le signal de vente Vinted posé par l''extension passe (avant : 403 _ts_ou_null) — ' || v_err);
  -- A0b. Le veilleur de PAGE (lecture + signal dans la même écriture) : preuve exacte posée.
  execute 'set local role authenticated';
  begin
    update cross_post_jobs set last_checked_at = now(), platform_fields = coalesce(platform_fields, '{}'::jsonb) || jsonb_build_object(
      'sale_signal', 'sold', 'unavailable_since', to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
     where id = j4;
    v_err := 'ok';
  exception when others then v_err := sqlstate || ' ' || sqlerrm; end;
  execute 'reset role';
  perform pg_temp.verif(v_err = 'ok' and (select platform_fields #>> '{sale_evidence,source}' from cross_post_jobs where id = j4) = 'page_annonce_veilleur',
    'A0b. le veilleur de page : signal accepté ET preuve exacte posée (règle du 09/10 inchangée) — ' || v_err);
  update cross_post_jobs set platform_fields = platform_fields - 'sale_signal' - 'unavailable_since' where id = j3;

  -- A1. Le repli de l'extension : la fiche passée « vendu » par le dressing, un job VIVANT porte l'annonce.
  execute 'set local role authenticated';
  update inventaire set statut = 'vendu', vinted_status = 'sold' where id = i1;
  execute 'reset role';
  select statut into v_st from inventaire where id = i1;
  select platform_fields ->> 'sale_signal' into v_sig from cross_post_jobs where id = j1;
  perform pg_temp.verif(v_st = 'stock' and v_sig = 'sold',
    'A1. repli « vendu » direct avec un job vivant → la fiche RESTE en stock, le signal part sur le job (' || coalesce(v_st, '?') || ', ' || coalesce(v_sig, '∅') || ')');
  perform pg_temp.verif((select vinted_status from inventaire where id = i1) = 'sold' and (select quantite from inventaire where id = i1) = 1,
    'A1. l''état du dressing (sold) est gardé, la quantité intacte');
  perform pg_temp.verif((select platform_fields #>> '{sale_signal_pose_par,par}' from cross_post_jobs where id = j1) = 'inventaire_vendu_vinted_par_la_vente',
    'A1. le signal dit qui l''a posé (trace)');

  -- A2. La vente suit LE chemin unique : relevé « sold » après la mise en ligne → vente prouvée.
  insert into vinted_listing_snapshots (user_id, vinted_item_id, inventaire_id, captured_at, captured_on, price, status)
  values (u, '990011001', i1, now(), (now() at time zone 'Europe/Paris')::date, 20, 'sold');
  select count(*) into v_n from ventes_prouvees_a_enregistrer(now() - interval '1 day', 25, u, j1);
  perform pg_temp.verif(v_n = 1, 'A2. la vente est candidate à la vente prouvée (cron 52)');
  v_res := enregistrer_vente_prouvee(j1);
  perform pg_temp.verif(v_res ->> 'issue' = 'enregistree', 'A2. enregistrée par enregistrer_vente_prouvee (' || coalesce(v_res ->> 'issue', '?') || ' ' || coalesce(v_res ->> 'reason', '') || ')');
  select count(*) into v_n from ventes where user_id = u and (inventaire_id = i1 or annonce_id = '990011001');
  perform pg_temp.verif(v_n = 1 and (select statut from inventaire where id = i1) = 'vendu', 'A2. UNE ligne de vente, fiche vendue');
  v_res := enregistrer_vente_prouvee(j1);
  select count(*) into v_m from ventes where user_id = u and (inventaire_id = i1 or annonce_id = '990011001');
  perform pg_temp.verif(v_m = 1, 'A2. rejouée : jamais une deuxième ligne (' || coalesce(v_res ->> 'issue', '?') || ')');

  -- A3. Import pur (aucun job Vinted vivant) : le « vendu » direct passe comme avant (03/08).
  execute 'set local role authenticated';
  update inventaire set statut = 'vendu', vinted_status = 'sold' where id = i2;
  execute 'reset role';
  perform pg_temp.verif((select statut from inventaire where id = i2) = 'vendu', 'A3. sans job vivant : « vendu » direct inchangé');

  -- A4. Vente déjà écrite pour la fiche : le statut suit, aucun signal ajouté.
  insert into ventes (user_id, titre, prix_vente, vendu_le, plateforme, plateforme_code, statut, quantite, inventaire_id, source)
  values (u, 'Veste déjà vendue A5', 30, now(), 'Vinted', 'vinted', 'vendu', 1, i3, 'manuel');
  execute 'set local role authenticated';
  update inventaire set statut = 'vendu', vinted_status = 'sold' where id = i3;
  execute 'reset role';
  perform pg_temp.verif((select statut from inventaire where id = i3) = 'vendu'
                        and (select platform_fields ->> 'sale_signal' from cross_post_jobs where id = j3) is null,
    'A4. vente déjà écrite : « vendu » passe, aucun signal posé');
  select count(*) into v_n from ventes where user_id = u and inventaire_id = i3;
  perform pg_temp.verif(v_n = 1, 'A4. toujours une seule ligne');

  -- A5. Une écriture SERVEUR (fonction de vente, réparation) n'est jamais retenue.
  update inventaire set statut = 'stock' where id = i4;
  update inventaire set statut = 'vendu', vinted_status = 'sold' where id = i4;
  perform pg_temp.verif((select statut from inventaire where id = i4) = 'vendu', 'A5. écriture du serveur : passe telle quelle');

  -- A6. Une fiche « vendu » → « stock » ou une fiche sans annonce : jamais concernées.
  execute 'set local role authenticated';
  update inventaire set vinted_status = 'active' where id = i2;
  execute 'reset role';
  perform pg_temp.verif((select statut from inventaire where id = i2) = 'vendu', 'A6. la synchro ne repasse jamais une fiche vendue en stock (règle du 03/08 intacte)');
end $t$;

-- A7. La classe d'incident : aucun déclencheur aux droits de l'appelant n'appelle une fonction fermée à authenticated.
do $c$
declare v text;
begin
  with trig as (
    select distinct p.oid, p.proname, p.prosrc from pg_trigger t join pg_proc p on p.oid = t.tgfoid
      join pg_namespace n on n.oid = p.pronamespace
     where not t.tgisinternal and n.nspname = 'public' and not p.prosecdef
  ), appels as (
    select tr.proname as f, lower(m[1]) as appelee from trig tr, regexp_matches(tr.prosrc, '(?:public\.)?([a-z_][a-z0-9_]*)\s*\(', 'gi') m
  )
  select string_agg(distinct a.f || ' → ' || a.appelee, ', ') into v
    from appels a join pg_proc f on f.proname = a.appelee join pg_namespace fn on fn.oid = f.pronamespace and fn.nspname = 'public'
   where not has_function_privilege('authenticated', f.oid, 'EXECUTE');
  perform pg_temp.verif(v is null, 'A7. aucun déclencheur aux droits de l''appelant n''appelle une fonction fermée à authenticated' || coalesce(' — ' || v, ''));
end $c$;

do $r$
declare r text; k int; t int;
begin
  select string_agg(case when ok then '✓ ' else '✗ ' end || label, E'\n' order by n), count(*) filter (where not ok), count(*)
    into r, k, t from preuve;
  raise exception E'PREUVE_VENTE_UNE_LIGNE echecs=% sur %\n%', k, t, r;
end $r$;
`;

const sql = `begin;\n${MIGRATIONS.join('\n')}\n${test}\nrollback;\n`;
const dossier = mkdtempSync(path.join(tmpdir(), 'preuve-vente-une-ligne-'));
const fichier = path.join(dossier, 'preuve.sql');
writeFileSync(fichier, sql);
const r = spawnSync('npx', ['supabase', 'db', 'query', '--linked', '-f', fichier], { cwd: RACINE, encoding: 'utf8', shell: true });
const sortie = `${r.stdout}\n${r.stderr}`;
const m = sortie.match(/PREUVE_VENTE_UNE_LIGNE echecs=(\d+) sur (\d+)([\s\S]*?)(?:\\n"|"\}|$)/);
if (!m) { console.log(sortie.slice(0, 4000)); console.log('\n✗ rapport introuvable (la transaction a échoué AVANT les vérifications)'); process.exit(1); }
console.log(`Preuve « toute vente Vinted reconnue a sa ligne »${versions.length ? ` (migration ${versions.join(', ')} rejouée dans la transaction, puis annulée)` : ''} :`);
console.log(m[3].split(/\\+n/).map((l) => l.replace(/\\+$/, '')).filter((l) => /[✓✗]/.test(l)).join('\n'));
console.log(Number(m[1]) === 0 ? `\n✓ ${m[2]} vérifications, toutes vertes — rien n'a été gardé (transaction annulée, aucun mail ni push)` : `\n✗ ${m[1]} échec(s) sur ${m[2]}`);
process.exit(Number(m[1]) === 0 ? 0 : 1);
