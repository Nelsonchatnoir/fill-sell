// ════════════════════════════════════════════════════════════════════════════
// PREUVE EN PROD, SANS RIEN GARDER — une annonce vendue ne se signale qu'une
// fois, et la décision « remettre en vente ou non » se prend dans l'app (11/10)
// ════════════════════════════════════════════════════════════════════════════
// Cas Louis (faf5021a) : ventes déjà traitées remailées 3 à 5 jours plus tard
// (fenêtre de 3 jours du « doublon »), ventes jamais traitées invisibles dans
// l'app faute de téléphone enregistré. Migration 20261011100000.
//
// Tout se passe dans UNE transaction qui finit TOUJOURS en erreur (le rapport
// est le message de l'erreur) : rien n'est validé, aucun appel pg_net ne part,
// AUCUN mail ni push n'est envoyé (seule la DÉCISION de la base est éprouvée).
//
//   node scripts/preuves/preuve-vente-signalee-une-fois.mjs --avec-migration=20261011100000
//        (rejoue la migration DANS la transaction : preuve AVANT application)
//   node scripts/preuves/preuve-vente-signalee-une-fois.mjs   (migration déjà en prod)
//
// Partie R : les VRAIES notes et fiches de Louis (lues, puis deux décisions
// jouées et annulées). Partie S : lignes d'essai sur le compte de Nico
// (hoosslocal) — eBay multi-exemplaires, Leboncoin, compte AVEC téléphone,
// vente à l'unité.
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
  // La migration porte son BEGIN / COMMIT : ici elle vit dans la transaction de la preuve.
  return readFileSync(path.join(RACINE, 'supabase/migrations', f), 'utf8')
    .replace(/^BEGIN;$/m, '').replace(/^COMMIT;$/m, '');
});
const LOUIS = 'faf5021a-479a-4bb3-b3ec-c296770739b7';
const U = '5322fa18-c194-458b-a222-7ee4093c4968';

const test = String.raw`
set local lock_timeout = '3s';
set local statement_timeout = '60s';
create temp table preuve(n serial, ok boolean, label text) on commit drop;
create function pg_temp.verif(c boolean, l text) returns void language sql as $f$
  insert into preuve(ok, label) values (coalesce(c, false), l) $f$;
create function pg_temp.motif(p_id bigint) returns text language sql as $f$
  select public.push_vente_deja_signalee(p.user_id, p.plateforme, p.cles, p.cree_le, p.id, true)
    from public.push_ventes p where p.id = p_id $f$;
create function pg_temp.en_tant_que(p_user uuid) returns void language sql as $f$
  select set_config('request.jwt.claims', case when p_user is null then '' else
    json_build_object('sub', p_user, 'role', 'authenticated')::text end, true) $f$;
create function pg_temp.liste(p_user uuid) returns text[] language plpgsql as $f$
declare v jsonb;
begin
  perform pg_temp.en_tant_que(p_user);
  v := public.ventes_a_decider();
  perform pg_temp.en_tant_que(null);
  return array(select e ->> 'annonce_id' from jsonb_array_elements(v) e order by 1);
end $f$;

do $t$
declare
  louis uuid := '${LOUIS}';
  u uuid := '${U}';
  v_res jsonb; v_n int; v_m int; v_l text[]; v_q0 int; v_q1 int; v_net0 bigint; v_net1 bigint;
  inv_a bigint := 990000000000001; inv_b bigint := 990000000000002;
  j_a uuid := '00000000-0000-4000-8000-00000000b001';
  j_b uuid := '00000000-0000-4000-8000-00000000b002';
begin
  -- ══ R. Les vraies notes de Louis ════════════════════════════════════════
  -- R1. Ventes DÉJÀ traitées (reçu ventes_operations) puis revues « vendues » : doublon.
  perform pg_temp.verif(pg_temp.motif(1236) = 'vente_deja_enregistree', 'R1a. 10254091481 (traitée 06/10 17:02, remailée 11/10) → doublon « vente_deja_enregistree »');
  perform pg_temp.verif(pg_temp.motif(1214) = 'vente_deja_enregistree', 'R1b. 10251765273 (traitée 06/10, remailée 10/10) → doublon');
  perform pg_temp.verif(pg_temp.motif(1107) = 'vente_deja_enregistree', 'R1c. 10248443064 (traitée 06/10, remailée 09/10) → doublon');
  perform pg_temp.verif(pg_temp.motif(311) = 'vente_deja_enregistree' and pg_temp.motif(312) = 'vente_deja_enregistree'
                        and pg_temp.motif(313) = 'vente_deja_enregistree' and pg_temp.motif(314) = 'vente_deja_enregistree',
                        'R1d. les 4 cas du 06/10 17:03 (ventes de septembre-octobre déjà enregistrées) → doublon');
  -- R2. Ventes jamais traitées, mailées le 08/10 puis le 11/10 : le 2e mail est un doublon…
  perform pg_temp.verif(pg_temp.motif(1233) = 'vente_deja_annoncee' and pg_temp.motif(1234) = 'vente_deja_annoncee'
                        and pg_temp.motif(1235) = 'vente_deja_annoncee',
                        'R2a. 10276053804 / 10276047846 / 10269303712 : 2e mail (11/10) → doublon « vente_deja_annoncee »');
  perform pg_temp.verif(pg_temp.motif(650) is null and pg_temp.motif(652) is null and pg_temp.motif(654) is null,
                        'R2b. … leur 1er mail (08/10) reste le seul signalement');
  -- … et elles sont dans la liste « Ventes à confirmer », avec les deux autres ventes mailées non traitées.
  v_l := pg_temp.liste(louis);
  perform pg_temp.verif(v_l = array['10269303712','10276047846','10276053804','10289137208','10289147239'],
                        'R2c. liste de Louis = les 5 ventes mailées jamais traitées : ' || array_to_string(v_l, ', '));
  perform pg_temp.verif(not (v_l && array['10254091481','10251765273','10248443064','10248430500','10269317193']),
                        'R2d. aucune vente traitée dans la liste (06/10, 08/10)');
  perform pg_temp.verif(not (v_l && array['10289157745','10289168362']),
                        'R2e. mail du 08/10 sur des annonces revues EN LIGNE depuis (dressing 11/10) : pas dans la liste');
  perform pg_temp.verif(pg_temp.motif(1106) is null and pg_temp.motif(1213) is null,
                        'R2f. 10289147239 (09/10) et 10289137208 (10/10) : premier et seul mail');

  -- R3. « Ne pas remettre en vente » : même chemin que la déclaration, la remise naît close.
  select quantite into v_q0 from inventaire where id = 1791020342181;
  v_res := public.enregistrer_vente_declaree(louis, '776e18eb-204f-4734-bb0e-b0f59c9147cc', null, false);
  perform set_config('fillsell.vente_declaree', '', true);
  perform set_config('fillsell.remise_en_vente_refusee', '', true);
  perform pg_temp.verif((v_res ->> 'ok')::boolean, 'R3a. « Ne pas remettre » : vente enregistrée (' || coalesce(v_res ->> 'reason', 'ok') || ')');
  select quantite into v_q1 from inventaire where id = 1791020342181;
  perform pg_temp.verif(v_q1 = v_q0 - 1, 'R3b. quantité ' || v_q0 || ' → ' || v_q1);
  perform pg_temp.verif(exists (select 1 from ventes_operations where user_id = louis and cle = 'annonce:vinted:10276053804'),
                        'R3c. reçu ventes_operations annonce:vinted:10276053804');
  perform pg_temp.verif(exists (select 1 from remises_en_vente where job_vendu = '776e18eb-204f-4734-bb0e-b0f59c9147cc'
                                  and statut = 'abandonnee' and motif = 'choix_personne'),
                        'R3d. remises_en_vente : abandonnee / choix_personne (la file ne la reprend jamais)');
  select count(*) into v_n from push_ventes where user_id = louis and annonce_id = '10276053804' and statut = 'a_envoyer';
  perform pg_temp.verif(v_n = 0, 'R3e. aucune note « à envoyer » (la déclaration ne se mail pas)');
  v_l := pg_temp.liste(louis);
  perform pg_temp.verif(not ('10276053804' = any (v_l)) and cardinality(v_l) = 4, 'R3f. la vente traitée quitte la liste (4 restent)');

  -- R4. « Remettre en vente » : la remise part dans la file, comme avant.
  v_res := public.enregistrer_vente_declaree(louis, '1340db6e-1b9c-4f07-87bf-86988976aab2', null, true);
  perform set_config('fillsell.vente_declaree', '', true);
  perform pg_temp.verif((v_res ->> 'ok')::boolean, 'R4a. « Remettre en vente » : vente enregistrée (' || coalesce(v_res ->> 'reason', 'ok') || ')');
  perform pg_temp.verif(exists (select 1 from remises_en_vente where job_vendu = '1340db6e-1b9c-4f07-87bf-86988976aab2' and statut = 'a_faire'),
                        'R4b. remises_en_vente : a_faire (remise en ligne par la file habituelle)');
  -- R5. La même annonce revue « vendue » plus tard : la note naît doublon, rien ne part.
  update ventes_operations set cree_le = cree_le - interval '2 minutes'
   where user_id = louis and cle in ('annonce:vinted:10276053804', 'annonce:vinted:10276047846');
  select count(*) into v_net0 from net.http_request_queue;
  perform public.push_noter(louis, 'vinted', 'vinted', null, 1791020342181, null, null, '10276053804', 'R5', 10, null, null, false);
  select count(*) into v_net1 from net.http_request_queue;
  select count(*) into v_n from push_ventes where user_id = louis and titre = 'R5' and statut = 'doublon' and motif = 'vente_deja_enregistree';
  perform pg_temp.verif(v_n = 1 and v_net1 = v_net0, 'R5. annonce revue vendue après la décision → note « doublon » à la naissance, aucun appel push-ventes');
  v_l := pg_temp.liste(louis);
  perform pg_temp.verif(cardinality(v_l) = 3, 'R5b. la liste ne la ramène jamais (3 restent)');

  -- ══ S. Lignes d'essai (compte de Nico) ═════════════════════════════════
  -- S1. eBay en quantité : deux commandes sur la même annonce = deux ventes.
  perform public.push_noter(u, 'commande', 'ebay', null, null, null, 'PREUVE-C1', '990000900001', 'S1a', 10, 'EUR', now(), false);
  update push_ventes set part_le = now() - interval '1 minute', statut = 'sans_appareil', mail_statut = 'envoye'
   where user_id = u and titre = 'S1a';
  perform public.push_noter(u, 'commande', 'ebay', null, null, null, 'PREUVE-C2', '990000900001', 'S1b', 10, 'EUR', now(), false);
  select count(*) into v_n from push_ventes where user_id = u and titre = 'S1b' and statut = 'a_envoyer';
  perform pg_temp.verif(v_n = 1, 'S1a. eBay : 2e commande sur la même annonce → vente à annoncer (jamais doublon sur l''annonce seule)');
  perform public.push_noter(u, 'commande', 'ebay', null, null, null, 'PREUVE-C1', '990000900001', 'S1c', 10, 'EUR', now(), false);
  select count(*) into v_n from push_ventes where user_id = u and titre = 'S1c' and statut = 'doublon' and motif = 'vente_deja_annoncee';
  perform pg_temp.verif(v_n = 1, 'S1b. eBay : la MÊME commande revue → doublon');
  perform public.push_noter(u, 'job', 'ebay', null, null, null, null, '990000900001', 'S1d', 10, null, null, false);
  select count(*) into v_n from push_ventes where user_id = u and titre = 'S1d' and statut = 'a_envoyer';
  perform pg_temp.verif(v_n = 1, 'S1c. eBay : un signal d''annonce sans commande n''est jamais jugé sur l''annonce');
  -- S1d. Décision (push_ventes_a_envoyer) : la 2e commande part.
  update push_ventes set cree_le = now() - interval '1 minute' where user_id = u and titre = 'S1b';
  v_res := public.push_ventes_a_envoyer(50);
  select count(*) into v_n from push_ventes where user_id = u and titre = 'S1b' and part_le is not null;
  perform pg_temp.verif(v_n = 1, 'S1d. décision : la 2e commande eBay est annoncée (mail)');

  -- S2. Leboncoin : deux commandes différentes = deux ventes ; annonce déjà annoncée sans commande = même vente.
  perform public.push_noter(u, 'commande', 'leboncoin', null, null, null, 'PREUVE-L1', '990000900002', 'S2a', 10, 'EUR', now(), false);
  update push_ventes set part_le = now() - interval '1 minute', statut = 'sans_appareil', mail_statut = 'envoye' where user_id = u and titre = 'S2a';
  perform public.push_noter(u, 'commande', 'leboncoin', null, null, null, 'PREUVE-L2', '990000900002', 'S2b', 10, 'EUR', now(), false);
  select count(*) into v_n from push_ventes where user_id = u and titre = 'S2b' and statut = 'a_envoyer';
  perform pg_temp.verif(v_n = 1, 'S2a. Leboncoin : 2e commande lue sur la même annonce → vente à annoncer');
  perform public.push_noter(u, 'annonce', 'leboncoin', null, null, null, null, '990000900003', 'S2c', 10, null, null, false);
  update push_ventes set part_le = now() - interval '5 days', cree_le = now() - interval '5 days', statut = 'sans_appareil', mail_statut = 'envoye' where user_id = u and titre = 'S2c';
  perform public.push_noter(u, 'job', 'leboncoin', null, null, null, null, '990000900003', 'S2d', 10, null, null, false);
  select count(*) into v_n from push_ventes where user_id = u and titre = 'S2d' and statut = 'doublon';
  perform pg_temp.verif(v_n = 1, 'S2b. Leboncoin : même annonce déjà annoncée il y a 5 jours → doublon (plus de fenêtre de 3 jours)');

  -- S3. Vente de job qui ATTEND son enregistrement (ventes prouvées) : le reçu posé APRÈS le signal ne la rend pas doublon.
  insert into inventaire (id, user_id, titre, statut, quantite, prix_vente) values
    (inv_a, u, 'Preuve S3', 'stock', 1, 20), (inv_b, u, 'Preuve S5', 'stock', 3, 20);
  insert into cross_post_jobs (id, user_id, inventaire_id, platform, action, status, title, price, platform_listing_id, listing_url, published_at, platform_fields) values
    (j_a, u, inv_a, 'vinted', 'publish', 'published', 'Preuve S3', 20, '990000900004', 'https://www.vinted.fr/items/990000900004-s3', now() - interval '3 hours', '{}'),
    (j_b, u, inv_b, 'vinted', 'publish', 'published', 'Preuve S5', 20, '990000900005', 'https://www.vinted.fr/items/990000900005-s5', now() - interval '3 hours', '{}');
  perform public.push_noter(u, 'job', 'vinted', null, inv_a, j_a, null, '990000900004', 'S3', 20, null, null, false);
  update push_ventes set cree_le = now() - interval '10 minutes' where user_id = u and titre = 'S3';
  insert into ventes_operations (user_id, cle, inventaire_id, job_id, resultat) values (u, 'annonce:vinted:990000900004', inv_a, j_a, '{"ok":true}');
  select count(*) into v_n from push_ventes p where p.user_id = u and p.titre = 'S3'
     and public.push_vente_deja_signalee(p.user_id, p.plateforme, p.cles, p.cree_le, p.id, false) is null;
  perform pg_temp.verif(v_n = 1, 'S3. note de job puis vente enregistrée APRÈS elle → elle annonce SA vente (pas doublon)');
  delete from ventes_operations where user_id = u and cle = 'annonce:vinted:990000900004';
  delete from push_ventes where user_id = u and titre = 'S3';

  -- S4. Compte AVEC téléphone : la notification part comme avant (push + mail).
  insert into appareils_push (user_id, plateforme, jeton, version_app) values (u, 'android', 'jeton-preuve-1110-fillsell-android', '2.9.79');
  insert into vinted_listing_snapshots (user_id, vinted_item_id, captured_at, captured_on, price, status)
  values (u, '990000900005', now() - interval '30 hours', ((now() - interval '30 hours') at time zone 'Europe/Paris')::date, 20, 'active'),
         (u, '990000900005', now(), (now() at time zone 'Europe/Paris')::date, 20, 'sold');
  perform set_config('fillsell.push_preuve', 'releve:preuve', true);
  perform public.push_noter(u, 'vinted', 'vinted', null, inv_b, null, null, '990000900005', 'S4', 20, null, null, false);
  update push_ventes set cree_le = now() - interval '1 minute' where user_id = u and titre = 'S4';
  v_res := public.push_ventes_a_envoyer(50);
  select count(*) into v_n from jsonb_array_elements(v_res -> 'notes') x
   where (x ->> 'id')::bigint in (select id from push_ventes where user_id = u and titre = 'S4')
     and (x ->> 'push')::boolean and (x ->> 'mail')::boolean and (x ->> 'a_decider')::boolean
     and jsonb_array_length(x -> 'appareils') = 1;
  select count(*) into v_m from push_ventes where user_id = u and titre = 'S4' and statut = 'en_envoi' and mail_statut = 'en_envoi';
  perform pg_temp.verif(v_n = 1 and v_m = 1, 'S4a. compte avec téléphone : push ET mail décidés, « à confirmer » signalé au mail');
  -- S5. … la vente détectée est dans SA liste, et la quitte dès la décision.
  v_l := pg_temp.liste(u);
  perform pg_temp.verif('990000900005' = any (v_l), 'S5a. vente détectée (avec téléphone) dans la liste « à confirmer »');
  v_res := public.enregistrer_vente_declaree(u, j_b, null, true);
  perform set_config('fillsell.vente_declaree', '', true);
  v_l := pg_temp.liste(u);
  perform pg_temp.verif((v_res ->> 'ok')::boolean and not ('990000900005' = any (v_l)),
                        'S5b. décidée → hors de la liste (' || coalesce(v_res ->> 'reason', 'ok') || ')');
  perform pg_temp.verif(exists (select 1 from remises_en_vente where job_vendu = j_b and statut = 'a_faire')
                        and (select quantite from inventaire where id = inv_b) = 2,
                        'S5c. quantité 3 → 2, remise en vente en file');

  -- S6. Vente à l'unité (ventes prouvées) : la note du job part APRÈS la vente, une seule fois.
  update cross_post_jobs set platform_fields = platform_fields || jsonb_build_object('sale_signal', 'sold',
         'unavailable_since', to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')) where id = j_a;
  v_res := public.enregistrer_vente_atomique(u, null, p_job := j_a, p_prix := 20);
  perform pg_temp.verif((v_res ->> 'ok')::boolean, 'S6a. vente à l''unité enregistrée (' || coalesce(v_res ->> 'reason', 'ok') || ')');
  update push_ventes set cree_le = cree_le - interval '3 minutes' where user_id = u and job_id = j_a;
  v_res := public.push_ventes_a_envoyer(50);
  select count(*) into v_n from push_ventes where user_id = u and job_id = j_a and part_le is not null;
  select count(*) into v_m from jsonb_array_elements(v_res -> 'notes') x
   where (x ->> 'id')::bigint in (select id from push_ventes where user_id = u and job_id = j_a)
     and (x ->> 'push')::boolean and not (x ->> 'a_decider')::boolean;
  perform pg_temp.verif(v_n = 1 and v_m = 1, 'S6b. une seule note annoncée (push + mail, vente déjà enregistrée : rien à confirmer)');
  perform pg_temp.verif(not ('990000900004' = any (pg_temp.liste(u))), 'S6c. vente enregistrée : jamais dans la liste');
end $t$;

do $r$
declare r text; k int; t int;
begin
  select string_agg(case when ok then '✓ ' else '✗ ' end || label, E'\n' order by n), count(*) filter (where not ok), count(*)
    into r, k, t from preuve;
  raise exception E'PREUVE_VENTE_SIGNALEE echecs=% sur %\n%', k, t, r;
end $r$;
`;

const sql = `begin;\n${MIGRATIONS.join('\n')}\n${test}\nrollback;\n`;
const dossier = mkdtempSync(path.join(tmpdir(), 'preuve-vente-signalee-'));
const fichier = path.join(dossier, 'preuve.sql');
writeFileSync(fichier, sql);
const r = spawnSync('npx', ['supabase', 'db', 'query', '--linked', '-f', fichier], { cwd: RACINE, encoding: 'utf8', shell: true });
const sortie = `${r.stdout}\n${r.stderr}`;
const m = sortie.match(/PREUVE_VENTE_SIGNALEE echecs=(\d+) sur (\d+)([\s\S]*?)(?:\\n"|"\}|$)/);
if (!m) { console.log(sortie.slice(0, 4000)); console.log('\n✗ rapport introuvable (la transaction a échoué AVANT les vérifications)'); process.exit(1); }
console.log(`Preuve « une annonce vendue ne se signale qu'une fois »${versions.length ? ` (migration ${versions.join(', ')} rejouée dans la transaction, puis annulée)` : ''} :`);
console.log(m[3].split(/\\+n/).map((l) => l.replace(/\\+$/, '')).filter((l) => /[✓✗]/.test(l)).join('\n'));
console.log(Number(m[1]) === 0 ? `\n✓ ${m[2]} vérifications, toutes vertes — rien n'a été gardé (transaction annulée, aucun mail ni push)` : `\n✗ ${m[1]} échec(s) sur ${m[2]}`);
process.exit(Number(m[1]) === 0 ? 0 : 1);
