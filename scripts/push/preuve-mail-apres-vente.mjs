// ════════════════════════════════════════════════════════════════════════════
// PREUVE EN PROD, SANS RIEN GARDER — le mail « vendu » APRÈS la vente (09/10)
// ════════════════════════════════════════════════════════════════════════════
// Cas Bebertdeals (09/10 11:46) : deux mails « vendu » partis sur un signal du
// veilleur, AUCUNE vente enregistrée. Migrations 20261009130000 (preuve, appliquée) et 20261009160000 (mail après la vente, NON appliquée).
//
// Tout se passe dans UNE transaction qui finit TOUJOURS en erreur (le rapport
// est le message de l'erreur) : rien n'est validé, aucun appel pg_net ne part,
// AUCUN mail n'est envoyé (seule la DÉCISION de la base est éprouvée).
//
//   node scripts/push/preuve-mail-apres-vente.mjs --avec-migration=20261009160000
//        (rejoue la migration DANS la transaction : preuve AVANT application)
//   node scripts/push/preuve-mail-apres-vente.mjs            (migration déjà en prod)
//
// Le déclencheur de la migration n'est PAS posé sur cross_post_jobs pendant la
// preuve (bloc <declencheur> retiré : aucun verrou sur la table vivante) : sa
// fonction est éprouvée sur une COPIE temporaire de la table, avec la même
// condition. Compte d'essai : hoosslocal (Nico), lignes d'essai annulées.
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
  // Le déclencheur sur la table vivante n'est pas posé pendant la preuve.
  return readFileSync(path.join(RACINE, 'supabase/migrations', f), 'utf8')
    .replace(/-- <declencheur>[\s\S]*?-- <\/declencheur>/, '-- (déclencheur éprouvé sur une copie temporaire, plus bas)');
});
const U = '5322fa18-c194-458b-a222-7ee4093c4968';

const test = String.raw`
set local lock_timeout = '3s';
create temp table preuve(n serial, ok boolean, label text) on commit drop;
create function pg_temp.verif(c boolean, l text) returns void language sql as $f$
  insert into preuve(ok, label) values (coalesce(c, false), l) $f$;

-- ── P. Le déclencheur « preuve de page », sur une COPIE de cross_post_jobs ──
create temp table cpj_essai (like public.cross_post_jobs including defaults) on commit drop;
create trigger essai_preuve_page before update of platform_fields on cpj_essai for each row
  when (new.platform = 'vinted' and new.action in ('publish', 'republish') and new.status = 'published'
        and (new.platform_fields ->> 'sale_signal') = 'sold'
        and (old.platform_fields ->> 'sale_signal') is distinct from 'sold'
        and not (new.platform_fields ? 'sale_evidence'))
  execute function public.vinted_preuve_page_veilleur();

do $t$
declare
  u uuid := '${U}';
  t timestamptz := now() - interval '10 minutes';
  ts text := to_char((now() - interval '10 minutes') at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  v_n int;
begin
  insert into cpj_essai (id, user_id, platform, action, status, title, listing_url, platform_listing_id, platform_fields, last_checked_at) values
    ('00000000-0000-4000-8000-0000000000a1', u, 'vinted', 'publish', 'published', 'P1', 'https://www.vinted.fr/items/990000301-p1', '990000301', '{}', now() - interval '2 hours'),
    ('00000000-0000-4000-8000-0000000000a2', u, 'vinted', 'publish', 'published', 'P2', 'https://www.vinted.fr/items/990000302-p2', '990000302', '{}', now() - interval '2 hours'),
    ('00000000-0000-4000-8000-0000000000a3', u, 'vinted', 'publish', 'published', 'P3', 'https://www.vinted.fr/items/990000399-autre', '990000303', '{}', now() - interval '2 hours'),
    ('00000000-0000-4000-8000-0000000000a4', u, 'leboncoin', 'publish', 'published', 'P4', 'https://www.leboncoin.fr/ad/x/990000304', '990000304', '{}', now() - interval '2 hours'),
    ('00000000-0000-4000-8000-0000000000a5', u, 'vinted', 'publish', 'published', 'P5', 'https://www.vinted.fr/items/990000305', '990000305', '{}', now() - interval '2 hours');
  -- P1. Écriture du VEILLEUR de page (lecture + signal, même instant) → preuve exacte.
  update cpj_essai set last_checked_at = t,
    platform_fields = platform_fields || jsonb_build_object('sale_signal', 'sold', 'unavailable_since', ts, 'detected_price', 21)
   where id = '00000000-0000-4000-8000-0000000000a1';
  select count(*) into v_n from cpj_essai where id = '00000000-0000-4000-8000-0000000000a1'
     and platform_fields #>> '{sale_evidence,listing_id}' = '990000301' and platform_fields #>> '{sale_evidence,exact}' = 'true'
     and platform_fields #>> '{sale_evidence,source}' = 'page_annonce_veilleur';
  perform pg_temp.verif(v_n = 1, 'P1. veilleur de page Vinted (lecture + signal au même instant, numéro exact) → preuve sale_evidence posée');
  -- P2. Écriture de la SYNCHRO du dressing (signal seul, last_checked_at inchangé) → aucune preuve.
  update cpj_essai set platform_fields = platform_fields || jsonb_build_object('sale_signal', 'sold', 'unavailable_since', ts)
   where id = '00000000-0000-4000-8000-0000000000a2';
  select count(*) into v_n from cpj_essai where id = '00000000-0000-4000-8000-0000000000a2' and platform_fields ? 'sale_evidence';
  perform pg_temp.verif(v_n = 0, 'P2. signal de la synchro du dressing (sans lecture de page) → AUCUNE preuve (reste une question)');
  -- P3. Page lue d'une AUTRE annonce que celle du job → aucune preuve.
  update cpj_essai set last_checked_at = t,
    platform_fields = platform_fields || jsonb_build_object('sale_signal', 'sold', 'unavailable_since', ts)
   where id = '00000000-0000-4000-8000-0000000000a3';
  select count(*) into v_n from cpj_essai where id = '00000000-0000-4000-8000-0000000000a3' and platform_fields ? 'sale_evidence';
  perform pg_temp.verif(v_n = 0, 'P3. lien d''une autre annonce que le numéro du job → AUCUNE preuve');
  -- P4. Leboncoin : la lecture « vendue » reste un signal.
  update cpj_essai set last_checked_at = t,
    platform_fields = platform_fields || jsonb_build_object('sale_signal', 'sold', 'unavailable_since', ts)
   where id = '00000000-0000-4000-8000-0000000000a4';
  select count(*) into v_n from cpj_essai where id = '00000000-0000-4000-8000-0000000000a4' and platform_fields ? 'sale_evidence';
  perform pg_temp.verif(v_n = 0, 'P4. Leboncoin : lecture « vendue » = signal, AUCUNE preuve posée');
  -- P5. Lecture et signal à 10 s d'écart (deux écritures distinctes) → aucune preuve.
  update cpj_essai set last_checked_at = t + interval '10 seconds',
    platform_fields = platform_fields || jsonb_build_object('sale_signal', 'sold', 'unavailable_since', ts)
   where id = '00000000-0000-4000-8000-0000000000a5';
  select count(*) into v_n from cpj_essai where id = '00000000-0000-4000-8000-0000000000a5' and platform_fields ? 'sale_evidence';
  perform pg_temp.verif(v_n = 0, 'P5. lecture et signal à 10 s d''écart → AUCUNE preuve');
end $t$;

-- ── D. La décision des mails, sur les vraies tables (annulée) ───────────────
do $t$
declare
  u   uuid := '${U}';
  i1 bigint := 990000000000201; i2 bigint := 990000000000202; i3 bigint := 990000000000203; i4 bigint := 990000000000204;
  j1 uuid; j2 uuid; j3 uuid; j4 uuid;
  ts text := to_char((now() - interval '10 minutes') at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  v_n int; v_m int; v_res jsonb; v_notes jsonb := '[]'::jsonb;
begin
  delete from vinted_sync_runs where user_id = u and status = 'running';
  insert into inventaire (id, user_id, titre, statut, quantite, prix_vente, prix_achat, vinted_item_id, plateforme) values
    (i1, u, 'Jean preuve signal sans vente', 'stock', 1, 21, null, '990000201', 'vinted'),
    (i2, u, 'Chino preuve vente prouvée', 'stock', 1, 16, 4, '990000202', 'vinted'),
    (i3, u, 'Pull preuve 24 h', 'stock', 1, 12, null, '990000203', 'vinted'),
    (i4, u, 'Veste preuve déclarée', 'stock', 1, 30, null, '990000204', 'vinted');
  insert into cross_post_jobs (user_id, inventaire_id, platform, status, action, title, price, platform_listing_id, listing_url, published_at, last_checked_at, vu_en_ligne_le)
  values (u, i1, 'vinted', 'published', 'publish', 'Jean preuve signal sans vente', 21, '990000201', 'https://www.vinted.fr/items/990000201', now() - interval '3 days', now() - interval '1 hour', now() - interval '1 hour')
  returning id into j1;
  insert into cross_post_jobs (user_id, inventaire_id, platform, status, action, title, price, platform_listing_id, listing_url, published_at, last_checked_at, vu_en_ligne_le)
  values (u, i2, 'vinted', 'published', 'publish', 'Chino preuve vente prouvée', 16, '990000202', 'https://www.vinted.fr/items/990000202', now() - interval '3 days', now() - interval '1 hour', now() - interval '1 hour')
  returning id into j2;
  insert into cross_post_jobs (user_id, inventaire_id, platform, status, action, title, price, platform_listing_id, listing_url, published_at, last_checked_at, vu_en_ligne_le)
  values (u, i3, 'vinted', 'published', 'publish', 'Pull preuve 24 h', 12, '990000203', 'https://www.vinted.fr/items/990000203', now() - interval '3 days', now() - interval '1 hour', now() - interval '1 hour')
  returning id into j3;
  insert into cross_post_jobs (user_id, inventaire_id, platform, status, action, title, price, platform_listing_id, listing_url, published_at, last_checked_at, vu_en_ligne_le)
  values (u, i4, 'vinted', 'published', 'publish', 'Veste preuve déclarée', 30, '990000204', 'https://www.vinted.fr/items/990000204', now() - interval '3 days', now() - interval '1 hour', now() - interval '1 hour')
  returning id into j4;

  -- D1. CAS BEBERTDEALS : signal « vendue » SANS preuve enregistrable → la note naît…
  update cross_post_jobs set platform_fields = coalesce(platform_fields, '{}'::jsonb)
    || jsonb_build_object('sale_signal', 'sold', 'unavailable_since', ts, 'detected_price', 21) where id = j1;
  select count(*) into v_n from push_ventes where user_id = u and job_id = j1 and statut = 'a_envoyer';
  perform pg_temp.verif(v_n = 1, 'D1a. signal « vendue » sur un job → une note (en attente)');
  update push_ventes set cree_le = cree_le - interval '3 minutes' where user_id = u and job_id = j1;
  v_res := public.push_ventes_a_envoyer(50);
  v_notes := v_notes || coalesce(v_res -> 'notes', '[]'::jsonb);
  select count(*) into v_n from jsonb_array_elements(coalesce(v_res -> 'notes', '[]'::jsonb)) x
   where (x ->> 'id')::bigint in (select id from push_ventes where job_id = j1);
  select count(*) into v_m from push_ventes where job_id = j1 and part_le is null and statut = 'a_envoyer';
  perform pg_temp.verif(v_n = 0 and v_m = 1, 'D1b. CAS BEBERTDEALS : vente NON enregistrée → AUCUN mail, la note attend');
  select count(*) into v_n from ventes where user_id = u and inventaire_id = i1;
  perform pg_temp.verif(v_n = 0, 'D1c. aucune vente écrite, stock intact (statut « stock »)');

  -- D2. Vente PROUVÉE (preuve exacte posée par le veilleur de page) → enregistrée, PUIS le mail.
  update cross_post_jobs set last_checked_at = now() - interval '10 minutes',
    platform_fields = coalesce(platform_fields, '{}'::jsonb)
    || jsonb_build_object('sale_signal', 'sold', 'unavailable_since', ts, 'detected_price', 16,
         'sale_evidence', jsonb_build_object('platform', 'vinted', 'listing_id', '990000202', 'state', 'sold', 'exact', true,
                                             'source', 'page_annonce_veilleur', 'lu_le', ts))
   where id = j2;
  update push_ventes set cree_le = cree_le - interval '3 minutes' where user_id = u and job_id = j2;
  v_res := public.push_ventes_a_envoyer(50);
  select count(*) into v_n from jsonb_array_elements(coalesce(v_res -> 'notes', '[]'::jsonb)) x
   where (x ->> 'id')::bigint in (select id from push_ventes where job_id = j2);
  perform pg_temp.verif(v_n = 0, 'D2a. preuve posée mais vente PAS ENCORE enregistrée → pas de mail (jamais AVANT la vente)');
  v_res := public.enregistrer_vente_prouvee(j2);
  perform pg_temp.verif(v_res ->> 'issue' = 'enregistree', 'D2b. ventes_prouvees : la preuve de page s''enregistre seule (' || coalesce(v_res ->> 'issue', '?') || ')');
  select count(*) into v_n from ventes where user_id = u and inventaire_id = i2 and plateforme_code = 'vinted';
  select count(*) into v_m from inventaire where id = i2 and statut = 'vendu';
  perform pg_temp.verif(v_n = 1 and v_m = 1, 'D2c. vente « Vinted » écrite, article vendu');
  update push_ventes set cree_le = cree_le - interval '3 minutes' where user_id = u and job_id = j2 and cree_le > now() - interval '1 minute';
  v_res := public.push_ventes_a_envoyer(50);
  select count(*) into v_n from jsonb_array_elements(coalesce(v_res -> 'notes', '[]'::jsonb)) x
   where (x ->> 'id')::bigint in (select id from push_ventes where job_id = j2) and (x ->> 'mail')::boolean;
  select count(*) into v_m from push_ventes where job_id = j2 and part_le is not null;
  perform pg_temp.verif(v_n = 1 and v_m = 1, 'D2d. vente ENREGISTRÉE → UN mail décidé, après la vente (doublons écartés)');

  -- D3. Signal jamais suivi d'une vente : 24 h plus tard, la note se clôt SANS rien envoyer.
  update cross_post_jobs set platform_fields = coalesce(platform_fields, '{}'::jsonb)
    || jsonb_build_object('sale_signal', 'sold', 'unavailable_since', ts) where id = j3;
  update push_ventes set cree_le = cree_le - interval '25 hours' where user_id = u and job_id = j3;
  v_res := public.push_ventes_a_envoyer(50);
  select count(*) into v_n from push_ventes where job_id = j3 and statut = 'ignoree' and motif = 'vente_non_enregistree' and part_le is null;
  perform pg_temp.verif(v_n = 1, 'D3. 24 h sans vente enregistrée → note close « vente_non_enregistree », aucun mail');

  -- D4. Signal non prouvé, puis la personne CONFIRME (« Vendue ? ») → vente déclarée, aucun mail.
  update cross_post_jobs set platform_fields = coalesce(platform_fields, '{}'::jsonb)
    || jsonb_build_object('sale_signal', 'unavailable', 'unavailable_since', ts) where id = j4;
  update cross_post_jobs set platform_fields = platform_fields || jsonb_build_object('sale_signal', 'sold') where id = j4;
  v_res := public.enregistrer_vente_declaree(u, j4, 30);
  perform set_config('fillsell.vente_declaree', '', true);
  perform pg_temp.verif((v_res ->> 'ok')::boolean, 'D4a. la personne confirme : vente enregistrée');
  update push_ventes set cree_le = cree_le - interval '3 minutes' where user_id = u and job_id = j4;
  v_res := public.push_ventes_a_envoyer(50);
  select count(*) into v_n from push_ventes where job_id = j4 and part_le is not null;
  perform pg_temp.verif(v_n = 0, 'D4b. vente confirmée par la personne → aucun mail (règle du 06/10 inchangée)');

  -- D5. Ce que la règle ne touche pas : une commande relevée (vente déjà écrite) part comme avant.
  insert into vinted_sync_runs (user_id, kind, status, platform, started_at, finished_at, declencheur)
  values (u, 'dressing', 'done', 'vinted', now() - interval '70 minutes', now() - interval '60 minutes', 'bouton');
  insert into ventes (user_id, titre, prix_vente, vendu_le, plateforme, plateforme_code, commande_ref, source, statut, quantite, annonce_id)
  values (u, 'Commande preuve', 18, now() - interval '20 minutes', 'vinted', 'vinted', 'PREUVE-D5', 'releve', 'vendu', 1, '990000205');
  update push_ventes set cree_le = cree_le - interval '4 minutes' where user_id = u and commande_ref = 'PREUVE-D5';
  v_res := public.push_ventes_a_envoyer(50);
  select count(*) into v_n from push_ventes where user_id = u and commande_ref = 'PREUVE-D5' and part_le is not null and mail_statut = 'en_envoi';
  perform pg_temp.verif(v_n = 1, 'D5. commande relevée (vente déjà enregistrée) → mail décidé comme avant');
end $t$;

do $r$
declare r text; k int; t int;
begin
  select string_agg(case when ok then '✓ ' else '✗ ' end || label, E'\n' order by n), count(*) filter (where not ok), count(*)
    into r, k, t from preuve;
  raise exception E'PREUVE_MAIL_APRES_VENTE echecs=% sur %\n%', k, t, r;
end $r$;
`;

const sql = `begin;\n${MIGRATIONS.join('\n')}\n${test}\nrollback;\n`;
const dossier = mkdtempSync(path.join(tmpdir(), 'preuve-mail-apres-vente-'));
const fichier = path.join(dossier, 'preuve.sql');
writeFileSync(fichier, sql);
const r = spawnSync('npx', ['supabase', 'db', 'query', '--linked', '-f', fichier], { cwd: RACINE, encoding: 'utf8', shell: true });
const sortie = `${r.stdout}\n${r.stderr}`;
const m = sortie.match(/PREUVE_MAIL_APRES_VENTE echecs=(\d+) sur (\d+)([\s\S]*?)(?:\\n"|"\}|$)/);
if (!m) { console.log(sortie.slice(0, 4000)); console.log('\n✗ rapport introuvable (la transaction a échoué AVANT les vérifications)'); process.exit(1); }
console.log(`Preuve « le mail après la vente »${versions.length ? ` (migration ${versions.join(', ')} rejouée dans la transaction, puis annulée)` : ''} :`);
console.log(m[3].split(/\\+n/).map((l) => l.replace(/\\+$/, '')).filter((l) => /[✓✗]/.test(l)).join('\n'));
console.log(Number(m[1]) === 0 ? `\n✓ ${m[2]} vérifications, toutes vertes — rien n'a été gardé (transaction annulée, aucun mail)` : `\n✗ ${m[1]} échec(s) sur ${m[2]}`);
process.exit(Number(m[1]) === 0 ? 0 : 1);
