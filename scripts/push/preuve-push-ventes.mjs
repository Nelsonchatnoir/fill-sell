// ════════════════════════════════════════════════════════════════════════════
// PREUVE EN PROD, SANS RIEN GARDER — notifications push à chaque vente (06/10)
// ════════════════════════════════════════════════════════════════════════════
// Tout se passe dans UNE transaction qui finit TOUJOURS en erreur (le rapport
// est le message de l'erreur) : rien n'est validé, rien ne reste, et l'appel
// pg_net mis en file par push_noter disparaît avec elle.
//
//   node scripts/push/preuve-push-ventes.mjs            (migration déjà en prod)
//   node scripts/push/preuve-push-ventes.mjs --avec-migration=20261006150000
//        (rejoue la ou les migrations nommées DANS la transaction : preuve
//        AVANT application ; versions séparées par des virgules)
//
// Compte d'essai : celui de Nico (lignes d'essai créées puis annulées).
// Ce que la preuve couvre : inertie sans appareil, garde « ventes anciennes »
// (date, premier relevé), une vente vue par trois chemins = UNE note, vente
// déclarée jamais notifiée (bouton « Vendue ? », saisie manuelle), fiche en
// plusieurs exemplaires, rattrapage de masse, panne de la notification qui
// n'empêche NI la vente NI la fin du relevé, purge d'un jeton refusé, remise
// en file d'un envoi transitoire, jeton qui change de compte, RLS, un seul
// appel pg_net par transaction, cron présent.
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
const avecMigration = MIGRATIONS.length > 0;
const U = '5322fa18-c194-458b-a222-7ee4093c4968';

const test = String.raw`
create temp table preuve(n serial, ok boolean, label text) on commit drop;
create function pg_temp.verif(c boolean, l text) returns void language sql as $f$
  insert into preuve(ok, label) values (coalesce(c, false), l) $f$;

do $t$
declare
  u   uuid := '${U}';
  u2  uuid;
  i1 bigint := 990000000000001; i2 bigint := 990000000000002; i3 bigint := 990000000000003;
  j1 uuid; j2 uuid; v_n int; v_m int; v_res jsonb; v_id bigint; v_ios uuid; v_and uuid; v_err text;
  v_kick0 int;
begin
  select id into u2 from auth.users where id <> u order by created_at limit 1;
  delete from push_ventes where user_id in (u, u2);
  delete from appareils_push where user_id in (u, u2);
  select count(*) into v_kick0 from net.http_request_queue where url like '%/push-ventes';
  -- Plateformes « suivies » : un relevé réussi fini il y a 1 h. Leboncoin : aucun.
  delete from vinted_sync_runs where user_id = u and platform = 'leboncoin';
  insert into vinted_sync_runs (user_id, kind, status, platform, started_at, finished_at, declencheur)
  values (u, 'dressing', 'done', 'vinted', now() - interval '70 minutes', now() - interval '60 minutes', 'bouton');
  insert into inventaire (id, user_id, titre, statut, quantite, prix_vente, vinted_item_id, plateforme) values
    (i1, u, 'Robe Mango corail (preuve)', 'stock', 1, 15, '990000001', 'vinted'),
    (i2, u, 'Veste preuve', 'stock', 1, 30, '990000002', 'vinted'),
    (i3, u, 'Lot de 3 bols (preuve)', 'stock', 3, 8, null, null);

  -- A. Sans appareil : le système est inerte.
  insert into ventes (user_id, titre, prix_vente, vendu_le, plateforme, plateforme_code, commande_ref, source, statut, quantite)
  values (u, 'Sans appareil', 10, now() - interval '1 hour', 'vinted', 'vinted', 'PREUVE-A', 'releve', 'vendu', 1);
  select count(*) into v_n from push_ventes where user_id = u;
  perform pg_temp.verif(v_n = 0, 'A. aucun appareil → aucune note (inerte)');

  insert into appareils_push (user_id, plateforme, jeton) values (u, 'ios', repeat('a', 64)) returning id into v_ios;
  insert into appareils_push (user_id, plateforme, jeton) values (u, 'android', 'fcm-preuve-' || repeat('b', 40)) returning id into v_and;

  -- B1. Commande relevée du jour, plateforme suivie → notée.
  insert into ventes (user_id, titre, prix_vente, vendu_le, plateforme, plateforme_code, commande_ref, source, statut, quantite)
  values (u, 'Pull B1', 12, now() - interval '20 minutes', 'vinted', 'vinted', 'PREUVE-B1', 'releve', 'vendu', 1);
  select count(*) into v_n from push_ventes where user_id = u and commande_ref = 'PREUVE-B1' and statut = 'a_envoyer' and origine = 'commande';
  perform pg_temp.verif(v_n = 1, 'B1. commande relevée du jour → notée à envoyer');

  -- B2. Vente ancienne (3 jours) découverte par un relevé → rien.
  insert into ventes (user_id, titre, prix_vente, vendu_le, plateforme, plateforme_code, commande_ref, source, statut, quantite)
  values (u, 'Ancienne B2', 12, now() - interval '3 days', 'vinted', 'vinted', 'PREUVE-B2', 'releve', 'vendu', 1);
  select count(*) into v_n from push_ventes where user_id = u and commande_ref = 'PREUVE-B2';
  perform pg_temp.verif(v_n = 0, 'B2. vente de plus de 24 h découverte par un relevé → aucune note');

  -- B3. Premier relevé d'une plateforme (aucun relevé réussi avant) → rien.
  insert into ventes (user_id, titre, prix_vente, vendu_le, plateforme, plateforme_code, commande_ref, source, statut, quantite)
  values (u, 'Premier import B3', 12, now() - interval '10 minutes', 'leboncoin', 'leboncoin', 'PREUVE-B3', 'releve', 'vendu', 1);
  select count(*) into v_n from push_ventes where user_id = u and commande_ref = 'PREUVE-B3';
  perform pg_temp.verif(v_n = 0, 'B3. premier relevé (plateforme pas encore suivie) → aucune note');

  -- B4. UNE vente vue par trois chemins : signal de la veille sur l'annonce
  --     FillSell, relevé Vinted « sold », commande relevée.
  insert into cross_post_jobs (user_id, inventaire_id, platform, status, action, title, price, platform_listing_id, published_at)
  values (u, i1, 'vinted', 'published', 'publish', 'Robe Mango corail (preuve)', 15, '990000001', now() - interval '2 days')
  returning id into j1;
  update cross_post_jobs set platform_fields = coalesce(platform_fields, '{}'::jsonb) || '{"sale_signal":"sold"}' where id = j1;
  update inventaire set vinted_status = 'sold', statut = 'vendu' where id = i1;
  insert into ventes (user_id, titre, prix_vente, vendu_le, plateforme, plateforme_code, commande_ref, source, statut, quantite, inventaire_id, annonce_id)
  values (u, 'Robe Mango corail (preuve)', 15, now() - interval '5 minutes', 'vinted', 'vinted', 'PREUVE-B4', 'releve', 'vendu', 1, i1, '990000001');
  select count(*) into v_n from push_ventes where user_id = u and inventaire_id = i1 and statut = 'a_envoyer';
  perform pg_temp.verif(v_n = 3, 'B4. trois chemins → trois notes en file (avant tri)');

  -- B5. Vente DÉCLARÉE par la personne (bouton « Vendue ? ») → journal seulement.
  insert into cross_post_jobs (user_id, inventaire_id, platform, status, action, title, price, platform_listing_id, published_at)
  values (u, i2, 'vinted', 'published', 'publish', 'Veste preuve', 30, '990000002', now() - interval '2 days')
  returning id into j2;
  perform set_config('fillsell.vente_declaree', '1', true);
  update cross_post_jobs set status = 'sold', sold_at = now() where id = j2;
  perform set_config('fillsell.vente_declaree', '', true);
  select count(*) into v_n from push_ventes where user_id = u and job_id = j2 and statut = 'declaree';
  perform pg_temp.verif(v_n = 1, 'B5. « Vendue ? » confirmée par la personne → notée déclarée, jamais envoyée');
  insert into ventes (user_id, titre, prix_vente, vendu_le, plateforme, plateforme_code, commande_ref, source, statut, quantite, inventaire_id, annonce_id)
  values (u, 'Veste preuve', 30, now() - interval '5 minutes', 'vinted', 'vinted', 'PREUVE-B5', 'releve', 'vendu', 1, i2, '990000002');

  -- B6. Saisie manuelle dans l'app (reçu « manuel: » de la transaction).
  insert into ventes_operations (user_id, cle, inventaire_id, resultat) values (u, 'manuel:preuve-b6', i3, '{}');
  insert into ventes (user_id, titre, prix_vente, plateforme, plateforme_code, statut, quantite, inventaire_id)
  values (u, 'Bol saisi', 8, 'Vinted', 'vinted', 'vendu', 1, i3);
  select count(*) into v_n from push_ventes where user_id = u and inventaire_id = i3 and statut = 'declaree';
  perform pg_temp.verif(v_n = 1, 'B6. vente saisie dans l''app → notée déclarée, jamais envoyée');

  -- B7. Fiche en plusieurs exemplaires : deux commandes = deux ventes.
  insert into ventes (user_id, titre, prix_vente, vendu_le, plateforme, plateforme_code, commande_ref, source, statut, quantite, inventaire_id)
  values (u, 'Bol 1', 8, now() - interval '5 minutes', 'vinted', 'vinted', 'PREUVE-B7a', 'releve', 'vendu', 1, i3),
         (u, 'Bol 2', 8, now() - interval '4 minutes', 'vinted', 'vinted', 'PREUVE-B7b', 'releve', 'vendu', 1, i3);
  select count(*) into v_n from push_ventes where user_id = u and commande_ref like 'PREUVE-B7%' and not (cles && array['fiche:' || i3::text]);
  perform pg_temp.verif(v_n = 2, 'B7. fiche à 3 exemplaires : la fiche n''identifie pas la vente');

  -- B8. La notification tombe en panne : la vente et le job passent quand même.
  perform set_config('fillsell.push_essai_panne', '1', true);
  insert into ventes (user_id, titre, prix_vente, vendu_le, plateforme, plateforme_code, commande_ref, source, statut, quantite)
  values (u, 'Panne B8', 9, now() - interval '5 minutes', 'vinted', 'vinted', 'PREUVE-B8', 'releve', 'vendu', 1)
  returning id into v_id;
  update cross_post_jobs set status = 'sold' where id = j1;
  perform set_config('fillsell.push_essai_panne', '', true);
  select count(*) into v_n from ventes where id = v_id;
  select count(*) into v_m from push_ventes where user_id = u and commande_ref = 'PREUVE-B8';
  perform pg_temp.verif(v_n = 1 and v_m = 0, 'B8. panne de la notification → vente enregistrée quand même, aucune note');
  select count(*) into v_n from cross_post_jobs where id = j1 and status = 'sold';
  perform pg_temp.verif(v_n = 1, 'B8. panne de la notification → le job passe vendu quand même');

  -- B9. Beebs / Leboncoin / eBay / Opla : l'annonce relevée passe « vendue ».
  insert into vinted_sync_runs (user_id, kind, status, platform, started_at, finished_at, declencheur)
  values (u, 'annonces', 'done', 'beebs', now() - interval '70 minutes', now() - interval '60 minutes', 'bouton');
  insert into annonces_plateforme (user_id, platform, listing_id, titre, prix, statut_plateforme)
  values (u, 'beebs', 'PREUVE-BEEBS-1', 'Body bébé (preuve)', 6, 'en_ligne');
  update annonces_plateforme set statut_plateforme = 'vendue' where user_id = u and platform = 'beebs' and listing_id = 'PREUVE-BEEBS-1';
  select count(*) into v_n from push_ventes where user_id = u and origine = 'annonce' and annonce_id = 'PREUVE-BEEBS-1' and statut = 'a_envoyer';
  perform pg_temp.verif(v_n = 1, 'B9. annonce Beebs vue « vendue » par le relevé → notée à envoyer');
  insert into annonces_plateforme (user_id, platform, listing_id, titre, prix, statut_plateforme)
  values (u, 'beebs', 'PREUVE-BEEBS-2', 'Déjà vendue à l''import (preuve)', 6, 'vendue');
  select count(*) into v_n from push_ventes where user_id = u and annonce_id = 'PREUVE-BEEBS-2';
  perform pg_temp.verif(v_n = 0, 'B9. annonce importée déjà vendue → aucune note');

  -- Tri : tout a plus de 15 s (sauf B1 qui attend son annonce, < 3 min).
  update push_ventes set cree_le = cree_le - interval '1 minute' where user_id = u;
  update push_ventes set cree_le = cree_le - interval '4 minutes' where user_id = u and commande_ref like 'PREUVE-B7%';
  v_res := push_ventes_a_envoyer(50);
  select count(*) into v_n from jsonb_array_elements(v_res -> 'notes') e where (e ->> 'inventaire_id')::bigint = i1;
  select count(*) into v_m from push_ventes where user_id = u and inventaire_id = i1 and statut = 'doublon';
  perform pg_temp.verif(v_n = 1 and v_m = 2, 'B4. une vente vue par trois chemins → UNE notification, deux doublons');
  select count(*) into v_n from push_ventes where user_id = u and commande_ref = 'PREUVE-B5' and statut = 'doublon';
  perform pg_temp.verif(v_n = 1, 'B5. le relevé retrouve la vente déclarée → doublon, jamais envoyée');
  select count(*) into v_n from jsonb_array_elements(v_res -> 'notes') e where e ->> 'titre' like 'Bol %';
  perform pg_temp.verif(v_n = 2, 'B7. les deux ventes d''une fiche à exemplaires partent toutes les deux');
  select count(*) into v_n from push_ventes where user_id = u and commande_ref = 'PREUVE-B1' and statut = 'a_envoyer';
  perform pg_temp.verif(v_n = 1, 'B1. commande sans annonce ni fiche → attend son second temps (3 min au plus)');
  select jsonb_array_length((v_res -> 'notes' -> 0 -> 'appareils')) into v_n;
  perform pg_temp.verif(v_n = 2, 'C. chaque note part vers les deux appareils du compte');
  update push_ventes set cree_le = cree_le - interval '3 minutes' where user_id = u and commande_ref = 'PREUVE-B1';
  v_res := push_ventes_a_envoyer(50);
  select count(*) into v_n from jsonb_array_elements(v_res -> 'notes') e where e ->> 'titre' = 'Pull B1';
  perform pg_temp.verif(v_n = 1, 'B1. après 3 min sans second temps → part quand même');

  -- D. Le verdict : jeton iOS refusé par Apple → appareil oublié ; envoi
  --    transitoire → remis en file.
  select id into v_id from push_ventes where user_id = u and inventaire_id = i1 and statut = 'en_envoi';
  perform push_ventes_resultat(jsonb_build_object(
    'notes', jsonb_build_array(jsonb_build_object('id', v_id, 'statut', 'envoyee')),
    'invalides', jsonb_build_array(repeat('a', 64)), 'ok', jsonb_build_array(v_and)));
  select count(*) into v_n from appareils_push where id = v_ios;
  select count(*) into v_m from appareils_push where id = v_and and dernier_envoi_le is not null;
  perform pg_temp.verif(v_n = 0 and v_m = 1, 'D. jeton refusé par Apple → appareil oublié ; l''autre garde son envoi');
  select count(*) into v_n from push_ventes where id = v_id and statut = 'envoyee';
  perform pg_temp.verif(v_n = 1, 'D. note envoyée → « envoyee »');
  select id into v_id from push_ventes where user_id = u and commande_ref = 'PREUVE-B1';
  perform push_ventes_resultat(jsonb_build_object('notes', jsonb_build_array(jsonb_build_object('id', v_id, 'statut', 'a_reessayer'))));
  select count(*) into v_n from push_ventes where id = v_id and statut = 'a_envoyer';
  perform pg_temp.verif(v_n = 1, 'D. échec transitoire (réseau, 5xx) → remise en file');

  -- E0. Trois ventes, chacune vue par trois chemins (9 notes) : ce n'est PAS
  --     un rattrapage — trois notifications, six doublons.
  delete from push_ventes where user_id = u;
  for v_n in 1..3 loop
    insert into push_ventes (user_id, origine, plateforme, titre, cles, statut, cree_le) values
      (u, 'job', 'vinted', 'Trio ' || v_n, array['job:trio' || v_n, 'annonce:vinted:trio' || v_n, 'fiche:trio' || v_n], 'a_envoyer', now() - interval '40 seconds'),
      (u, 'vinted', 'vinted', 'Trio ' || v_n, array['fiche:trio' || v_n, 'annonce:vinted:trio' || v_n], 'a_envoyer', now() - interval '35 seconds'),
      (u, 'commande', 'vinted', 'Trio ' || v_n, array['commande:vinted:T' || v_n, 'annonce:vinted:trio' || v_n], 'a_envoyer', now() - interval '30 seconds');
  end loop;
  v_res := push_ventes_a_envoyer(50);
  select count(*) into v_m from push_ventes where user_id = u and statut = 'doublon';
  perform pg_temp.verif(jsonb_array_length(v_res -> 'notes') = 3 and v_m = 6,
    'E0. 3 ventes vues chacune par 3 chemins → 3 notifications (pas un rattrapage), 6 doublons');

  -- E. Rattrapage de masse : 9 ventes en quelques minutes → aucune notification.
  delete from push_ventes where user_id = u;
  for v_n in 1..9 loop
    insert into ventes (user_id, titre, prix_vente, vendu_le, plateforme, plateforme_code, commande_ref, source, statut, quantite, annonce_id)
    values (u, 'Masse ' || v_n, 5, now() - interval '30 minutes', 'vinted', 'vinted', 'PREUVE-E' || v_n, 'releve', 'vendu', 1, '99000010' || v_n);
  end loop;
  update push_ventes set cree_le = cree_le - interval '30 seconds' where user_id = u;
  v_res := push_ventes_a_envoyer(50);
  select count(*) into v_n from push_ventes where user_id = u and statut = 'ignoree' and motif = 'rattrapage_de_masse';
  perform pg_temp.verif(jsonb_array_length(v_res -> 'notes') = 0 and v_n = 9, 'E. 9 ventes d''un coup (rattrapage) → aucune notification');

  -- F. Un seul appel à la fonction d'envoi par transaction.
  select count(*) into v_n from net.http_request_queue where url like '%/push-ventes';
  perform pg_temp.verif(v_n - v_kick0 = 1, 'F. un seul appel pg_net pour toute la transaction');

  -- G. L'app enregistre son jeton ; le téléphone change de compte.
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  perform push_enregistrer_appareil('tok-preuve-' || repeat('c', 30), 'android', '2.9.62');
  perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
  perform push_enregistrer_appareil('tok-preuve-' || repeat('c', 30), 'android', '2.9.62');
  select count(*) into v_n from appareils_push where jeton = 'tok-preuve-' || repeat('c', 30) and user_id = u2;
  perform pg_temp.verif(v_n = 1, 'G. le jeton suit le dernier compte connecté (un seul propriétaire)');
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  v_res := push_oublier_appareil('tok-preuve-' || repeat('c', 30));
  perform pg_temp.verif((v_res ->> 'oublies')::int = 0, 'G. on ne peut oublier que SES appareils');
  perform set_config('request.jwt.claims', '', true);
  v_err := null;
  begin perform push_enregistrer_appareil('tok-preuve-' || repeat('d', 30), 'ios', null);
  exception when others then v_err := sqlerrm; end;
  perform pg_temp.verif(v_err is not null, 'G. sans session : enregistrement refusé');

  -- H. RLS : chacun ne voit que ses appareils, personne n'écrit en direct.
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into v_n from appareils_push;
  v_err := null;
  begin insert into appareils_push (user_id, plateforme, jeton) values (u, 'ios', repeat('e', 64));
  exception when others then v_err := sqlstate; end;
  execute 'reset role';
  select count(*) into v_m from appareils_push where user_id = u;
  perform pg_temp.verif(v_n = v_m, 'H. RLS : la lecture ne rend que ses propres appareils');
  perform pg_temp.verif(v_err = '42501', 'H. RLS : écriture directe refusée (42501)');
  begin
    execute 'set local role authenticated';
    perform push_ventes_a_envoyer(1);
    v_err := 'ouvert';
  exception when others then v_err := sqlstate; end;
  execute 'reset role';
  perform pg_temp.verif(v_err = '42501', 'H. le choix des envois est fermé aux comptes (service seulement)');

  select count(*) into v_n from cron.job where jobname = 'push-ventes-1min' and active;
  perform pg_temp.verif(v_n = 1, 'I. cron push-ventes-1min actif');
end $t$;

do $r$
declare r text; k int; t int;
begin
  select string_agg(case when ok then '  ✓ ' else '  ✗ ' end || label, E'\n' order by n),
         count(*) filter (where not ok), count(*)
    into r, k, t from preuve;
  raise exception E'PREUVE_PUSH echecs=% sur %\n%', k, t, r;
end $r$;
`;

const sql = `begin;\n${MIGRATIONS.map((f) => readFileSync(f, 'utf8')).join('\n')}\n${test}\nrollback;\n`;
const dossier = mkdtempSync(path.join(tmpdir(), 'preuve-push-'));
const fichier = path.join(dossier, 'preuve.sql');
writeFileSync(fichier, sql);
const r = spawnSync('npx', ['supabase', 'db', 'query', '--linked', '-f', fichier], { cwd: RACINE, encoding: 'utf8', shell: true });
const sortie = `${r.stdout}\n${r.stderr}`;
const m = sortie.match(/PREUVE_PUSH echecs=(\d+) sur (\d+)([\s\S]*?)(?:\\n"|"\}|$)/);
if (!m) { console.log(sortie.slice(0, 4000)); console.log('\n✗ rapport introuvable (la transaction a échoué AVANT les vérifications)'); process.exit(1); }
console.log(`Preuve push-ventes${avecMigration ? ` (migration ${versions.join(', ')} rejouée dans la transaction, puis annulée)` : ''} :`);
// Le rapport arrive échappé (JSON dans un message d'erreur) : une ligne par « \n ».
console.log(m[3].split(/\\+n/).map((l) => l.replace(/\\+$/, '')).filter((l) => /[✓✗]/.test(l)).join('\n'));
console.log(Number(m[1]) === 0 ? `\n✓ ${m[2]} vérifications, toutes vertes — rien n'a été gardé (transaction annulée)` : `\n✗ ${m[1]} échec(s) sur ${m[2]}`);
process.exit(Number(m[1]) === 0 ? 0 : 1);
