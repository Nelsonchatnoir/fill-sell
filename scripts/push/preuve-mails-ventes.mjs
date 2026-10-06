// ════════════════════════════════════════════════════════════════════════════
// PREUVE EN PROD, SANS RIEN GARDER — un mail à chaque vente (06/10, Nico)
// ════════════════════════════════════════════════════════════════════════════
// Tout se passe dans UNE transaction qui finit TOUJOURS en erreur (le rapport
// est le message de l'erreur) : rien n'est validé, rien ne reste, aucun appel
// pg_net ne part (il disparaît avec la transaction), AUCUN mail n'est envoyé
// (la décision seule est éprouvée ; l'envoi réel se prouve à part, sur la
// boîte de Nico).
//
//   node scripts/push/preuve-mails-ventes.mjs --avec-migration=20261006180000
//        (rejoue la migration DANS la transaction : preuve AVANT application)
//   node scripts/push/preuve-mails-ventes.mjs            (migration déjà en prod)
//
// Compte d'essai : hoosslocal (Nico), lignes d'essai créées puis annulées.
// Ce que la preuve couvre (règle de Nico du 06/10) :
//   · une vente récente → UN mail décidé, même sans téléphone ;
//   · une vente vue par plusieurs chemins → un seul mail ;
//   · vente ancienne (relevé, job dont l'annonce a disparu il y a des jours,
//     job jamais revu en ligne, plateforme non relevée depuis plus de 24 h) →
//     aucun mail ;
//   · vente déclarée par la personne (« Vendue ? », saisie dans l'app) → aucun ;
//   · rattrapage de masse → aucun ;
//   · un compte qui a reçu 5 mails de support le jour même → son mail de vente
//     part quand même (aucun compteur de mails n'est lu) ;
//   · relances par canal (mail en échec transitoire, push à réessayer) sans
//     refaire la décision ; un mail par note (index unique) ; cron 34.
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
  return path.join(RACINE, 'supabase/migrations', f);
});
const U = '5322fa18-c194-458b-a222-7ee4093c4968';

const test = String.raw`
create temp table preuve(n serial, ok boolean, label text) on commit drop;
create function pg_temp.verif(c boolean, l text) returns void language sql as $f$
  insert into preuve(ok, label) values (coalesce(c, false), l) $f$;

do $t$
declare
  u   uuid := '${U}';
  i1 bigint := 990000000000101; i2 bigint := 990000000000102; i3 bigint := 990000000000103;
  i4 bigint := 990000000000104; i5 bigint := 990000000000105; i6 bigint := 990000000000106;
  j1 uuid; j2 uuid; j3 uuid; j4 uuid; j5 uuid; j6 uuid;
  v_n int; v_m int; v_res jsonb; v_id bigint; v_err text; v_note jsonb;
begin
  delete from push_ventes where user_id = u;
  delete from appareils_push where user_id = u;
  delete from vinted_sync_runs where user_id = u and platform in ('vinted', 'leboncoin');
  -- Vinted suivie : un relevé réussi fini il y a 1 h.
  insert into vinted_sync_runs (user_id, kind, status, platform, started_at, finished_at, declencheur)
  values (u, 'dressing', 'done', 'vinted', now() - interval '70 minutes', now() - interval '60 minutes', 'bouton');
  -- Leboncoin relevé il y a 30 h seulement : plus « suivie » (24 h).
  insert into vinted_sync_runs (user_id, kind, status, platform, started_at, finished_at, declencheur)
  values (u, 'annonces', 'done', 'leboncoin', now() - interval '31 hours', now() - interval '30 hours', 'bouton');
  insert into inventaire (id, user_id, titre, statut, quantite, prix_vente, prix_achat, vinted_item_id, plateforme) values
    (i1, u, 'Baskets preuve mail', 'stock', 1, 40, 12, '990000101', 'vinted'),
    (i2, u, 'Veste déclarée preuve', 'stock', 1, 30, null, '990000102', 'vinted'),
    (i3, u, 'Pull ancien preuve', 'stock', 1, 15, null, '990000103', 'vinted'),
    (i4, u, 'Robe jamais revue preuve', 'stock', 1, 25, null, '990000104', 'vinted'),
    (i5, u, 'Livre eBay preuve', 'stock', 1, 9, 2, null, 'ebay'),
    (i6, u, 'Lampe LBC preuve', 'stock', 1, 18, null, null, 'leboncoin');
  -- Cinq mails de support reçus aujourd'hui (comme Louis du 03 au 05/10).
  for v_n in 1..5 loop
    insert into email_logs (user_id, email_type, email, sent_at) values (u, 'support_preuve_' || v_n, 'hoosslocal@gmail.com', now() - (v_n || ' hours')::interval);
  end loop;

  -- M1. Vente récente détectée par la veille (annonce disparue il y a 1 h),
  --     compte SANS téléphone → une note (avant : rien, la table restait vide).
  insert into cross_post_jobs (user_id, inventaire_id, platform, status, action, title, price, platform_listing_id, published_at, last_checked_at)
  values (u, i1, 'vinted', 'published', 'publish', 'Baskets preuve mail', 40, '990000101', now() - interval '3 days', now() - interval '2 hours')
  returning id into j1;
  update cross_post_jobs set platform_fields = coalesce(platform_fields, '{}'::jsonb)
    || jsonb_build_object('sale_signal', 'sold', 'unavailable_since', to_char(now() - interval '1 hour', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'))
   where id = j1;
  select count(*) into v_n from push_ventes where user_id = u and job_id = j1 and statut = 'a_envoyer';
  perform pg_temp.verif(v_n = 1, 'M1. vente récente, compte sans téléphone → une note (avant : aucune)');

  -- M2. La même vente vue par le relevé Vinted (fiche vendue) et par la commande.
  update inventaire set vinted_status = 'sold', statut = 'vendu' where id = i1;
  insert into ventes (user_id, titre, prix_vente, vendu_le, plateforme, plateforme_code, commande_ref, source, statut, quantite, inventaire_id, annonce_id)
  values (u, 'Baskets preuve mail', 40, now() - interval '50 minutes', 'vinted', 'vinted', 'PREUVE-M2', 'releve', 'vendu', 1, i1, '990000101');
  select count(*) into v_n from push_ventes where user_id = u and inventaire_id = i1;
  perform pg_temp.verif(v_n = 3, 'M2. trois chemins → trois notes en file (avant tri)');

  -- M3. Cas Louis : commandes Vinted des 13/09 et 16/09 retrouvées par un relevé.
  insert into ventes (user_id, titre, prix_vente, vendu_le, plateforme, plateforme_code, commande_ref, source, statut, quantite)
  values (u, 'Ancienne 13/09', 12, '2026-09-13 21:39:00+02', 'vinted', 'vinted', 'PREUVE-M3a', 'releve', 'vendu', 1),
         (u, 'Ancienne 16/09', 12, '2026-09-16 11:58:00+02', 'vinted', 'vinted', 'PREUVE-M3b', 'releve', 'vendu', 1);
  select count(*) into v_n from push_ventes where user_id = u and commande_ref like 'PREUVE-M3%';
  perform pg_temp.verif(v_n = 0, 'M3. ventes des 13 et 16/09 retrouvées par un relevé → aucune note');

  -- M4. Job vendu dont l'annonce a disparu il y a 5 jours (vente ancienne).
  insert into cross_post_jobs (user_id, inventaire_id, platform, status, action, title, price, platform_listing_id, published_at, last_checked_at)
  values (u, i3, 'vinted', 'published', 'publish', 'Pull ancien preuve', 15, '990000103', now() - interval '20 days', now() - interval '1 hour')
  returning id into j3;
  update cross_post_jobs set platform_fields = coalesce(platform_fields, '{}'::jsonb)
    || jsonb_build_object('sale_signal', 'sold', 'unavailable_since', to_char(now() - interval '5 days', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'))
   where id = j3;
  select count(*) into v_n from push_ventes where user_id = u and job_id = j3;
  perform pg_temp.verif(v_n = 0, 'M4. annonce disparue il y a 5 jours, vendue confirmée aujourd''hui → aucune note');

  -- M5. Job vendu sans date de disparition, jamais revu en ligne depuis 3 jours.
  insert into cross_post_jobs (user_id, inventaire_id, platform, status, action, title, price, platform_listing_id, published_at, last_checked_at)
  values (u, i4, 'vinted', 'published', 'publish', 'Robe jamais revue preuve', 25, '990000104', now() - interval '20 days', now() - interval '3 days')
  returning id into j4;
  update cross_post_jobs set status = 'sold', sold_at = now() where id = j4;
  select count(*) into v_n from push_ventes where user_id = u and job_id = j4;
  perform pg_temp.verif(v_n = 0, 'M5. vendue sans date, annonce pas revue depuis 3 jours → aucune note (on ne date pas la vente)');

  -- M6. Commande eBay vue il y a 2 h (ORDER_CONFIRMATION / veille : annonce disparue il y a 2 h).
  insert into cross_post_jobs (user_id, inventaire_id, platform, status, action, title, price, platform_listing_id, published_at, voie)
  values (u, i5, 'ebay', 'published', 'publish', 'Livre eBay preuve', 9, '990000105', now() - interval '20 days', 'extension')
  returning id into j5;
  update cross_post_jobs set status = 'sold', sold_at = now(), platform_fields = coalesce(platform_fields, '{}'::jsonb)
    || jsonb_build_object('sale_signal', 'sold', 'commandes_ebay', jsonb_build_array('PREUVE-CMD'), 'unavailable_since', to_char(now() - interval '2 hours', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'))
   where id = j5;
  select count(*) into v_n from push_ventes where user_id = u and job_id = j5 and statut = 'a_envoyer';
  perform pg_temp.verif(v_n = 1, 'M6. commande eBay du moment (disparue il y a 2 h) → une note');

  -- M7. « Vendue ? » confirmée par la personne → déclarée, jamais envoyée.
  insert into cross_post_jobs (user_id, inventaire_id, platform, status, action, title, price, platform_listing_id, published_at, last_checked_at)
  values (u, i2, 'vinted', 'published', 'publish', 'Veste déclarée preuve', 30, '990000102', now() - interval '2 days', now() - interval '1 hour')
  returning id into j2;
  perform set_config('fillsell.vente_declaree', '1', true);
  update cross_post_jobs set status = 'sold', sold_at = now() where id = j2;
  perform set_config('fillsell.vente_declaree', '', true);
  select count(*) into v_n from push_ventes where user_id = u and job_id = j2 and statut = 'declaree';
  perform pg_temp.verif(v_n = 1, 'M7. vente confirmée par la personne (« Vendue ? ») → déclarée');

  -- M8. Saisie dans l'app → déclarée.
  insert into ventes_operations (user_id, cle, inventaire_id, resultat) values (u, 'manuel:preuve-m8', i2, '{}');
  insert into ventes (user_id, titre, prix_vente, plateforme, plateforme_code, statut, quantite, inventaire_id)
  values (u, 'Veste saisie', 30, 'Vinted', 'vinted', 'vendu', 1, i2);
  select count(*) into v_n from push_ventes where user_id = u and origine = 'declaree' and vente_id is not null;
  perform pg_temp.verif(v_n = 1, 'M8. vente saisie dans l''app → déclarée');

  -- M9. Plateforme relevée il y a 30 h : une annonce vue « vendue » n'est pas annoncée.
  insert into annonces_plateforme (user_id, platform, listing_id, titre, prix, statut_plateforme, inventaire_id)
  values (u, 'leboncoin', 'PREUVE-LBC-1', 'Lampe LBC preuve', 18, 'en_ligne', i6);
  update annonces_plateforme set statut_plateforme = 'vendue' where user_id = u and listing_id = 'PREUVE-LBC-1';
  select count(*) into v_n from push_ventes where user_id = u and annonce_id = 'PREUVE-LBC-1';
  perform pg_temp.verif(v_n = 0, 'M9. Leboncoin non relevé depuis 30 h → vente non annoncée (rattrapage)');

  -- ── La décision ────────────────────────────────────────────────────────
  update push_ventes set cree_le = cree_le - interval '1 minute' where user_id = u;
  v_res := push_ventes_a_envoyer(50);
  select count(*) into v_n from jsonb_array_elements(v_res -> 'notes') e where (e ->> 'inventaire_id')::bigint = i1;
  select count(*) into v_m from push_ventes where user_id = u and inventaire_id = i1 and statut = 'doublon';
  perform pg_temp.verif(v_n = 1 and v_m = 2, 'M2. une vente vue par trois chemins → UN mail décidé, deux doublons');
  select e into v_note from jsonb_array_elements(v_res -> 'notes') e where (e ->> 'inventaire_id')::bigint = i1;
  perform pg_temp.verif((v_note ->> 'mail')::boolean and not (v_note ->> 'push')::boolean and v_note ->> 'email' = 'hoosslocal@gmail.com',
    'M1. sans téléphone : mail oui, push non, adresse du compte servie');
  select count(*) into v_n from push_ventes where user_id = u and inventaire_id = i1 and statut = 'sans_appareil' and mail_statut = 'en_envoi' and part_le is not null;
  perform pg_temp.verif(v_n = 1, 'M1. note décidée : push « sans_appareil », mail « en_envoi »');
  perform pg_temp.verif((select count(*) from email_logs where user_id = u and sent_at > now() - interval '24 hours') >= 5,
    'M10. le compte a reçu 5 mails de support aujourd''hui…');
  perform pg_temp.verif(v_n = 1, 'M10. … et son mail de vente est décidé quand même (aucun plafond lu)');
  select count(*) into v_n from jsonb_array_elements(v_res -> 'notes') e where (e ->> 'inventaire_id')::bigint = i5;
  perform pg_temp.verif(v_n = 1, 'M6. la commande eBay part (un mail)');
  select count(*) into v_n from jsonb_array_elements(v_res -> 'notes') e where (e ->> 'inventaire_id')::bigint = i2;
  perform pg_temp.verif(v_n = 0, 'M7-M8. aucune vente déclarée ne part');

  -- M11. Verdicts du mail : envoyé ; à réessayer → relancé SEUL ; 3 essais → échec.
  select id into v_id from push_ventes where user_id = u and inventaire_id = i1 and part_le is not null;
  perform push_ventes_resultat(jsonb_build_object('notes', jsonb_build_array(jsonb_build_object('id', v_id, 'mail', jsonb_build_object('statut', 'envoye')))));
  select count(*) into v_n from push_ventes where id = v_id and mail_statut = 'envoye' and statut = 'sans_appareil';
  perform pg_temp.verif(v_n = 1, 'M11. mail parti → « envoye » (le push reste « sans_appareil »)');
  select id into v_id from push_ventes where user_id = u and job_id = j5;
  perform push_ventes_resultat(jsonb_build_object('notes', jsonb_build_array(jsonb_build_object('id', v_id, 'mail', jsonb_build_object('statut', 'a_reessayer', 'motif', 'resend_echec')))));
  select count(*) into v_n from push_ventes where id = v_id and mail_statut = 'a_envoyer';
  perform pg_temp.verif(v_n = 1, 'M11. Resend en échec → mail remis en file');
  v_res := push_ventes_a_envoyer(50);
  select e into v_note from jsonb_array_elements(v_res -> 'notes') e where (e ->> 'id')::bigint = v_id;
  perform pg_temp.verif(v_note is not null and (v_note ->> 'mail')::boolean and not (v_note ->> 'push')::boolean,
    'M11. relance : le mail seul repart, sans refaire la décision');
  select count(*) into v_n from push_ventes where id = v_id and mail_essais = 2 and part_le is not null;
  perform pg_temp.verif(v_n = 1, 'M11. deuxième essai compté');
  perform push_ventes_resultat(jsonb_build_object('notes', jsonb_build_array(jsonb_build_object('id', v_id, 'mail', jsonb_build_object('statut', 'a_reessayer')))));
  v_res := push_ventes_a_envoyer(50);
  perform push_ventes_resultat(jsonb_build_object('notes', jsonb_build_array(jsonb_build_object('id', v_id, 'mail', jsonb_build_object('statut', 'a_reessayer')))));
  select count(*) into v_n from push_ventes where id = v_id and mail_statut = 'echec';
  perform pg_temp.verif(v_n = 1, 'M11. trois essais en échec → « echec » (lisible en base), jamais une boucle');

  -- M12. Avec un téléphone : push ET mail ; un push à réessayer repart seul.
  insert into appareils_push (user_id, plateforme, jeton) values (u, 'android', 'fcm-preuve-mail-' || repeat('m', 40));
  insert into cross_post_jobs (user_id, inventaire_id, platform, status, action, title, price, platform_listing_id, published_at, last_checked_at)
  values (u, i6, 'leboncoin', 'published', 'publish', 'Lampe LBC preuve', 18, 'PREUVE-LBC-J', now() - interval '3 days', now() - interval '30 minutes')
  returning id into j6;
  update cross_post_jobs set status = 'sold', sold_at = now() where id = j6;
  update push_ventes set cree_le = cree_le - interval '1 minute' where user_id = u and job_id = j6;
  v_res := push_ventes_a_envoyer(50);
  select e into v_note from jsonb_array_elements(v_res -> 'notes') e where (e ->> 'inventaire_id')::bigint = i6;
  perform pg_temp.verif((v_note ->> 'push')::boolean and (v_note ->> 'mail')::boolean and jsonb_array_length(v_note -> 'appareils') = 1,
    'M12. avec un téléphone : push ET mail, une seule décision');
  v_id := (v_note ->> 'id')::bigint;
  perform push_ventes_resultat(jsonb_build_object('notes', jsonb_build_array(
    jsonb_build_object('id', v_id, 'statut', 'a_reessayer', 'motif', 'transitoire', 'mail', jsonb_build_object('statut', 'envoye')))));
  v_res := push_ventes_a_envoyer(50);
  select e into v_note from jsonb_array_elements(v_res -> 'notes') e where (e ->> 'id')::bigint = v_id;
  perform pg_temp.verif(v_note is not null and (v_note ->> 'push')::boolean and not (v_note ->> 'mail')::boolean,
    'M12. push à réessayer : le push seul repart, le mail déjà parti ne repart pas');

  -- M13. Un mail par note : l'index unique refuse la seconde ligne.
  v_err := null;
  begin
    insert into email_logs (user_id, email_type, email) values (u, 'vente:' || v_id, 'hoosslocal@gmail.com');
    insert into email_logs (user_id, email_type, email) values (u, 'vente:' || v_id, 'hoosslocal@gmail.com');
  exception when unique_violation then v_err := 'refuse';
  end;
  perform pg_temp.verif(v_err = 'refuse', 'M13. deux mails pour une même note → refusé (23505)');

  -- M14. Rattrapage de masse : 9 ventes distinctes d'un coup → aucun mail.
  delete from push_ventes where user_id = u;
  for v_n in 1..9 loop
    insert into ventes (user_id, titre, prix_vente, vendu_le, plateforme, plateforme_code, commande_ref, source, statut, quantite, annonce_id)
    values (u, 'Masse ' || v_n, 5, now() - interval '30 minutes', 'vinted', 'vinted', 'PREUVE-M14-' || v_n, 'releve', 'vendu', 1, '99000020' || v_n);
  end loop;
  update push_ventes set cree_le = cree_le - interval '30 seconds' where user_id = u;
  v_res := push_ventes_a_envoyer(50);
  select count(*) into v_n from push_ventes where user_id = u and statut = 'ignoree' and motif = 'rattrapage_de_masse' and part_le is null;
  perform pg_temp.verif(jsonb_array_length(v_res -> 'notes') = 0 and v_n = 9, 'M14. 9 ventes d''un coup (rattrapage) → aucun mail');

  -- M15. Cron 34 : il appelle aussi quand un mail attend.
  select count(*) into v_n from cron.job where jobname = 'push-ventes-1min' and active and command like '%mail_statut%';
  perform pg_temp.verif(v_n = 1, 'M15. cron push-ventes-1min actif, attentif aux mails');
  -- M16. Fermé aux comptes : la décision reste au serveur.
  begin
    execute 'set local role authenticated';
    perform push_ventes_a_envoyer(1);
    v_err := 'ouvert';
  exception when others then v_err := sqlstate; end;
  execute 'reset role';
  perform pg_temp.verif(v_err = '42501', 'M16. le choix des envois est fermé aux comptes (service seulement)');
end $t$;

do $r$
declare r text; k int; t int;
begin
  select string_agg(case when ok then '  ✓ ' else '  ✗ ' end || label, E'\n' order by n),
         count(*) filter (where not ok), count(*)
    into r, k, t from preuve;
  raise exception E'PREUVE_MAILS echecs=% sur %\n%', k, t, r;
end $r$;
`;

const sql = `begin;\n${MIGRATIONS.map((f) => readFileSync(f, 'utf8')).join('\n')}\n${test}\nrollback;\n`;
const dossier = mkdtempSync(path.join(tmpdir(), 'preuve-mails-'));
const fichier = path.join(dossier, 'preuve.sql');
writeFileSync(fichier, sql);
const r = spawnSync('npx', ['supabase', 'db', 'query', '--linked', '-f', fichier], { cwd: RACINE, encoding: 'utf8', shell: true });
const sortie = `${r.stdout}\n${r.stderr}`;
const m = sortie.match(/PREUVE_MAILS echecs=(\d+) sur (\d+)([\s\S]*?)(?:\\n"|"\}|$)/);
if (!m) { console.log(sortie.slice(0, 4000)); console.log('\n✗ rapport introuvable (la transaction a échoué AVANT les vérifications)'); process.exit(1); }
console.log(`Preuve mails de vente${versions.length ? ` (migration ${versions.join(', ')} rejouée dans la transaction, puis annulée)` : ''} :`);
console.log(m[3].split(/\\+n/).map((l) => l.replace(/\\+$/, '')).filter((l) => /[✓✗]/.test(l)).join('\n'));
console.log(Number(m[1]) === 0 ? `\n✓ ${m[2]} vérifications, toutes vertes — rien n'a été gardé (transaction annulée)` : `\n✗ ${m[1]} échec(s) sur ${m[2]}`);
process.exit(Number(m[1]) === 0 ? 0 : 1);
