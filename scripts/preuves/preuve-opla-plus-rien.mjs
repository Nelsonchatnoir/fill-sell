// ════════════════════════════════════════════════════════════════════════════
// PREUVE EN PROD, SANS RIEN GARDER — sortie d'Opla : plus AUCUNE action Opla,
// pour personne (11/10, A2 ; migration 20261011130000)
// ════════════════════════════════════════════════════════════════════════════
// Tout se passe dans UNE transaction qui finit TOUJOURS en erreur (le rapport
// est le message de l'erreur) : rien n'est validé, aucun appel pg_net ne part,
// aucun mail, aucune notification. Lignes d'essai sur le compte de Nico
// (hoosslocal), créées puis annulées ; la partie R rejoue le rattrapage sur
// les VRAIS jobs Opla du parc, puis l'annule.
//
//   node scripts/preuves/preuve-opla-plus-rien.mjs --avec-migration=20261011130000
//        (rejoue la migration DANS la transaction : preuve AVANT application)
//   node scripts/preuves/preuve-opla-plus-rien.mjs   (migration déjà en prod)
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
  return readFileSync(path.join(RACINE, 'supabase/migrations', f), 'utf8').replace(/^BEGIN;$/m, '').replace(/^COMMIT;$/m, '');
});
const RATTRAPAGE = readFileSync(path.join(RACINE, 'scripts/reparations/20261011_opla_sortie_rattrapage.sql'), 'utf8')
  .replace(/^BEGIN;$/m, '').replace(/^COMMIT;$/m, '').replace(/^SET LOCAL lock_timeout = '5s';$/m, '')
  .replace(/-- Relecture : plus rien de vivant sur Opla\.[\s\S]*$/, '');
const U = '5322fa18-c194-458b-a222-7ee4093c4968';
const MSG_RETRAIT = "Opla n'est plus pris en charge par FillSell : cette annonce vendue est peut-être encore en ligne sur Opla, retire-la toi-même sur Opla.";

const test = String.raw`
set local lock_timeout = '5s';
set local statement_timeout = '90s';
create temp table preuve(n serial, ok boolean, label text) on commit drop;
grant all on preuve to authenticated;
grant usage on sequence preuve_n_seq to authenticated;
create function pg_temp.verif(c boolean, l text) returns void language sql as $f$
  insert into preuve(ok, label) values (coalesce(c, false), l) $f$;
create temp table _vivants_avant on commit drop as
  select id from cross_post_jobs where platform = 'opla' and status in ('pending', 'processing', 'needs_user');
create temp table _autres_avant on commit drop as
  select id, status from cross_post_jobs where platform <> 'opla' and status in ('pending', 'processing', 'needs_user');

do $t$
declare
  u uuid := '${U}';
  i1 bigint := 990000001300001; i2 bigint := 990000001300002;
  j_dep uuid; j_del uuid; j_pub uuid; j_v uuid; j_lbc uuid; j_dep_lbc uuid; v_n int; v_r jsonb; v_id uuid; v_txt text;
begin
  perform pg_temp.verif(public.opla_sortie_passee(), 'O0. la sortie est passée (opla_sortie_le = 10/10 00:00 Paris)');
  perform pg_temp.verif((select value from coin_config where key = 'opla_ouvert') = 0, 'O0. opla_ouvert = 0 (clé morte alignée, journalisée)');
  insert into inventaire (id, user_id, titre, statut, quantite, prix_vente, plateforme) values
    (i1, u, 'Veste preuve Opla', 'stock', 1, 30, null),
    (i2, u, 'Pull preuve Opla', 'stock', 1, 20, null);
  -- Un dépôt Opla publié (l'annonce existe chez Opla) et un dépôt Leboncoin.
  insert into cross_post_jobs (user_id, inventaire_id, platform, status, action, title, price, platform_listing_id, listing_url, published_at)
  values (u, i1, 'opla', 'published', 'publish', 'Veste preuve Opla', 30, 'opla-preuve-1', 'https://www.opla.co/annonce/opla-preuve-1', now() - interval '20 days')
  returning id into j_dep;
  insert into cross_post_jobs (user_id, inventaire_id, platform, status, action, title, price, platform_listing_id, listing_url, published_at)
  values (u, i2, 'leboncoin', 'published', 'publish', 'Pull preuve Opla', 20, '3100990001', 'https://www.leboncoin.fr/ad/vetements/3100990001', now() - interval '20 days')
  returning id into j_dep_lbc;

  -- O1. Un RETRAIT Opla qui naît (vente ailleurs) : clos aussitôt, la phrase de Nico.
  insert into cross_post_jobs (user_id, inventaire_id, platform, status, action, title, listing_url, platform_listing_id, platform_fields)
  values (u, i1, 'opla', 'pending', 'delete', 'Veste preuve Opla', 'https://www.opla.co/annonce/opla-preuve-1', 'opla-preuve-1',
          jsonb_build_object('arme_par', jsonb_build_object('chemin', 'vente_article_serveur')))
  returning id into j_del;
  select error into v_txt from cross_post_jobs where id = j_del;
  perform pg_temp.verif((select status from cross_post_jobs where id = j_del) = 'cancelled' and v_txt = '${MSG_RETRAIT.replace(/'/g, "''")}',
    'O1. retrait Opla né après la sortie → « cancelled », message : ' || coalesce(v_txt, '∅'));
  perform pg_temp.verif((select platform_fields #>> '{opla_sortie,par}' from cross_post_jobs where id = j_del) = 'garde_opla_sortie_jobs',
    'O1. la trace dit qui l''a clos (opla_sortie)');

  -- O2. Une publication Opla qui naît : close, « rien n'a été publié ».
  insert into cross_post_jobs (user_id, inventaire_id, platform, status, action, title, price)
  values (u, i2, 'opla', 'pending', 'publish', 'Pull preuve Opla', 20) returning id into j_pub;
  perform pg_temp.verif((select status from cross_post_jobs where id = j_pub) = 'cancelled'
    and (select error from cross_post_jobs where id = j_pub) like 'Opla n''est plus disponible dans FillSell. Rien n''a été publié sur Opla%',
    'O2. publication Opla née après la sortie → close, rien publié');

  -- O3. Une relance (needs_user → pending) : reclose, l'erreur d'avant archivée.
  update cross_post_jobs set status = 'needs_user', error = 'Connecte-toi à Opla (essai)' where id = j_del;
  perform pg_temp.verif((select status from cross_post_jobs where id = j_del) = 'cancelled', 'O3. remise en attente (needs_user) → reclose');
  update cross_post_jobs set status = 'pending' where id = j_del;
  perform pg_temp.verif((select status from cross_post_jobs where id = j_del) = 'cancelled'
    and (select jsonb_array_length(coalesce(platform_fields -> 'erreurs_archivees', '[]')) from cross_post_jobs where id = j_del) >= 1,
    'O3. relance (pending) → reclose, erreur d''avant archivée, rien effacé');

  -- O4. Les autres plateformes : rien ne change.
  insert into cross_post_jobs (user_id, inventaire_id, platform, status, action, title, listing_url, platform_listing_id)
  values (u, i2, 'leboncoin', 'pending', 'delete', 'Pull preuve Opla', 'https://www.leboncoin.fr/ad/vetements/3100990001', '3100990001')
  returning id into j_lbc;
  perform pg_temp.verif((select status from cross_post_jobs where id = j_lbc) = 'pending', 'O4. un retrait Leboncoin reste en file');
  insert into cross_post_jobs (user_id, inventaire_id, platform, status, action, title, price)
  values (u, i2, 'vinted', 'pending', 'publish', 'Pull preuve Opla', 20) returning id into j_v;
  perform pg_temp.verif((select status from cross_post_jobs where id = j_v) = 'pending', 'O4. une publication Vinted reste en file');

  -- O5. Aucun relevé Opla : ni le serveur, ni l'extension (cron, veilleur), ni « Synchroniser ».
  insert into vinted_sync_runs (user_id, kind, status, platform, declencheur) values (u, 'annonces', 'queued', 'opla', 'cron');
  insert into vinted_sync_runs (user_id, kind, status, platform, declencheur) values (u, 'annonces', 'queued', 'opla', 'veilleur');
  select count(*) into v_n from vinted_sync_runs where user_id = u and platform = 'opla' and updated_at >= now() - interval '1 second';
  perform pg_temp.verif(v_n = 0, 'O5. relevé Opla inséré (cron, veilleur) → ignoré, aucune ligne');
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  v_r := public.demander_sync_plateforme('opla');
  perform pg_temp.verif(v_r ->> 'reason' = 'invalid_platform' and not (v_r ->> 'ok')::boolean, 'O5. « Synchroniser » Opla → refusé (' || coalesce(v_r ->> 'reason', '?') || ')');
  v_r := public.demander_sync_plateforme('leboncoin');
  perform set_config('request.jwt.claims', '', true);
  perform pg_temp.verif(v_r ->> 'reason' is distinct from 'invalid_platform', 'O5. « Synchroniser » Leboncoin : inchangé (' || coalesce(v_r ->> 'reason', '?') || ')');

  -- O6. Aucune question « Déjà vendu ? » sur une copie Opla ; Leboncoin : comme avant.
  update cross_post_jobs set status = 'cancelled' where id = j_lbc;
  update inventaire set statut = 'vendu' where id in (i1, i2);
  delete from inventaire_doublons where garde in (i1, i2);
  perform public.poser_questions_copies_non_prouvees(i1, null, null, 'preuve');
  select count(*) into v_n from inventaire_doublons where garde = i1 and motif = 'copie_non_prouvee';
  perform pg_temp.verif(v_n = 0, 'O6. copie Opla d''un article vendu : aucune question posée');
end $t$;

-- O7. L'interrupteur à 0 (sortie désactivée) : la règle s'efface, rien d'autre.
do $s$
declare u uuid := '${U}'; j uuid;
begin
  update coin_config set value = 0 where key = 'opla_sortie_le';
  perform pg_temp.verif(not public.opla_sortie_passee(), 'O7. interrupteur à 0 → sortie désactivée');
  insert into cross_post_jobs (user_id, inventaire_id, platform, status, action, title, price)
  values (u, null, 'opla', 'pending', 'publish', 'Essai interrupteur', 9) returning id into j;
  perform pg_temp.verif((select status from cross_post_jobs where id = j) = 'pending', 'O7. … une publication Opla reste en file (avant la bascule : comme avant)');
  delete from cross_post_jobs where id = j;
  update coin_config set value = 1791583200 where key = 'opla_sortie_le';
end $s$;

-- R. Le rattrapage, rejoué sur le VRAI parc, puis annulé avec le reste.
${RATTRAPAGE}

do $r$
declare v_n int; v_m int; v_k int;
begin
  select count(*) into v_n from _vivants_avant;
  select count(*) into v_m from cross_post_jobs where platform = 'opla' and status in ('pending', 'processing', 'needs_user');
  select count(*) into v_k from cross_post_jobs j join _vivants_avant a on a.id = j.id
   where j.status = 'cancelled' and j.platform_fields ? 'opla_sortie';
  perform pg_temp.verif(v_m = 0 and v_k = v_n, 'R1. rattrapage : ' || v_n || ' job(s) Opla vivant(s) → ' || v_k || ' clos, plus aucun vivant');
  select count(*) into v_k from cross_post_jobs j join _vivants_avant a on a.id = j.id
   where j.action = 'delete' and j.error = '${MSG_RETRAIT.replace(/'/g, "''")}';
  perform pg_temp.verif(v_k >= 1, 'R1. les retraits clos portent la phrase de Nico (' || v_k || ')');
  select count(*) into v_n from _autres_avant a join cross_post_jobs j on j.id = a.id where j.status is distinct from a.status;
  perform pg_temp.verif(v_n = 0, 'R2. aucun job d''une autre plateforme n''a bougé');
  select count(*) into v_n from vinted_sync_runs where platform = 'opla' and status in ('queued', 'running');
  perform pg_temp.verif(v_n = 0, 'R3. plus aucun relevé Opla en file');
  select count(*) into v_n from inventaire_doublons where statut = 'proposee' and motif = 'copie_non_prouvee' and preuves ->> 'platform' = 'opla';
  perform pg_temp.verif(v_n = 0, 'R4. plus aucune question ouverte sur une copie Opla');
  select count(*) into v_n from push_ventes where cree_le >= now() - interval '1 second';
  perform pg_temp.verif(v_n = 0, 'R5. aucune note de vente née (aucun mail, aucune notification)');
end $r$;

do $z$
declare r text; k int; t int;
begin
  select string_agg(case when ok then '✓ ' else '✗ ' end || label, E'\n' order by n), count(*) filter (where not ok), count(*)
    into r, k, t from preuve;
  raise exception E'PREUVE_OPLA echecs=% sur %\n%', k, t, r;
end $z$;
`;

const sql = `begin;\n${MIGRATIONS.join('\n')}\n${test}\nrollback;\n`;
const dossier = mkdtempSync(path.join(tmpdir(), 'preuve-opla-'));
const fichier = path.join(dossier, 'preuve.sql');
writeFileSync(fichier, sql);
const r = spawnSync('npx', ['supabase', 'db', 'query', '--linked', '-f', fichier], { cwd: RACINE, encoding: 'utf8', shell: true });
const sortie = `${r.stdout}\n${r.stderr}`;
const m = sortie.match(/PREUVE_OPLA echecs=(\d+) sur (\d+)([\s\S]*?)(?:\\n"|"\}|$)/);
if (!m) { console.log(sortie.slice(0, 4000)); console.log('\n✗ rapport introuvable (la transaction a échoué AVANT les vérifications)'); process.exit(1); }
console.log(`Preuve « sortie d'Opla : plus aucune action »${versions.length ? ` (migration ${versions.join(', ')} rejouée dans la transaction, puis annulée)` : ''} :`);
console.log(m[3].split(/\\+n/).map((l) => l.replace(/\\+$/, '')).filter((l) => /[✓✗]/.test(l)).join('\n'));
console.log(Number(m[1]) === 0 ? `\n✓ ${m[2]} vérifications, toutes vertes — rien n'a été gardé (transaction annulée, aucun mail ni push)` : `\n✗ ${m[1]} échec(s) sur ${m[2]}`);
process.exit(Number(m[1]) === 0 ? 0 : 1);
