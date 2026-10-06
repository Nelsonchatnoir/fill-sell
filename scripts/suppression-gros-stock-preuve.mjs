// Preuve EN BASE — effacer un gros stock sans délai dépassé ni retrait (06/10/2026).
//
//     node scripts/suppression-gros-stock-preuve.mjs [--articles 3500] [--plafond-ms 8000]
//
// ⚠️ Touche la base de PROD (`supabase db query --linked`), mais N'Y LAISSE
// RIEN : tout se joue dans UN bloc DO qui finit par une exception, donc par un
// ROLLBACK — compte, profil, fiches, annonces, jobs, ventes : rien n'est
// gardé. Le compte d'essai est créé SANS e-mail (aucun mail de bienvenue mis
// en file, et pg_net est transactionnel : sa file part avec le ROLLBACK).
//
// Ce que le bloc fait, dans la même transaction :
//   1. un utilisateur d'essai + N fiches, et autour d'elles ce qu'un vrai gros
//      compte porte : annonces Leboncoin rattachées (43 %), rapprochements,
//      un relevé Vinted par fiche, publications EN LIGNE (30 %, liens réels
//      de forme Leboncoin), ventes reliées (9 %) ;
//   2. appelle `supprimer_mon_stock_sans_retrait()` EN TANT QUE la personne
//      (rôle authenticated, jeton simulé), comme l'app ;
//   3. mesure la durée et vérifie : plus aucune fiche ni vente, AUCUN retrait
//      armé (aucun job « delete », aucune trace « retrait_annonces »), les
//      autres comptes intacts (mêmes nombres de fiches, ventes et jobs avant /
//      après), les annonces et relevés détachés (pas effacés) comme avant.
// Sort en 1 si la durée dépasse le plafond (8 s = le délai d'une requête de
// l'app) ou si une seule vérification tombe.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import { join } from 'node:path';

const arg = (nom, defaut) => { const i = process.argv.indexOf(`--${nom}`); return i > 0 ? Number(process.argv[i + 1]) : defaut; };
const N = Math.max(1, Math.floor(arg('articles', 3500)));
const PLAFOND = arg('plafond-ms', 8000);
// --index-essai : construit les trois index du 06/10 DANS la transaction
// annulée — mesure l'effet du correctif avant de l'appliquer (verrou SHARE de
// quelques secondes sur les trois tables, rien ne reste).
const INDEX_ESSAI = process.argv.includes('--index-essai');
const indexEssai = INDEX_ESSAI ? ['vinted_listing_snapshots', 'rapprochements', 'vinted_republish_captures']
  .map((t) => `  create index if not exists ${t}_inventaire_idx on public.${t} (inventaire_id);`).join(String.fromCharCode(10)) : '';

const sql = `
do $$
declare
  uid uuid := gen_random_uuid();
  t_seme timestamptz := clock_timestamp();
  t0 timestamptz; t1 timestamptz;
  autres_inv_avant bigint; autres_inv_apres bigint;
  autres_ventes_avant bigint; autres_ventes_apres bigint;
  autres_jobs_avant bigint; autres_jobs_apres bigint;
  n_annonces int; n_snap int; n_rap int; n_pub int; n_ventes int;
  r jsonb;
begin
${indexEssai}
  insert into auth.users (id, aud, role, email, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
  values (uid, 'authenticated', 'authenticated', null, now(), now(), '{}'::jsonb, '{}'::jsonb);
  -- Identifiants hors de la plage de l'app (horodatages en µs, ~1,8e15) : la
  -- transaction est annulée de toute façon.
  insert into public.inventaire (id, user_id, titre, prix_vente, quantite)
    select 8000000000000000 + g, uid, 'Essai suppression gros stock ' || g, 10, 1 from generate_series(1, ${N}) g;
  insert into public.annonces_plateforme (user_id, platform, listing_id, inventaire_id)
    select uid, 'leboncoin', 'essai-' || i.id, i.id from public.inventaire i where i.user_id = uid order by i.id limit ${Math.ceil(N * 0.43)};
  insert into public.rapprochements (user_id, annonce_id, decision, par, inventaire_id)
    select uid, a.id, 'attache', 'auto', a.inventaire_id from public.annonces_plateforme a where a.user_id = uid;
  insert into public.vinted_listing_snapshots (user_id, vinted_item_id, captured_on, inventaire_id)
    select uid, 'essai-' || i.id, current_date, i.id from public.inventaire i where i.user_id = uid;
  insert into public.cross_post_jobs (user_id, platform, action, status, listing_url, inventaire_id, title)
    select uid, 'leboncoin', 'publish', 'published', 'https://www.leboncoin.fr/ad/essai/' || i.id, i.id, i.titre
      from public.inventaire i where i.user_id = uid order by i.id limit ${Math.ceil(N * 0.3)};
  insert into public.ventes (id, user_id, titre, prix_vente, quantite, inventaire_id, plateforme, vendu_le)
    select i.id, uid, i.titre, 10, 1, i.id, 'Vinted', now() from public.inventaire i where i.user_id = uid order by i.id desc limit ${Math.ceil(N * 0.09)};

  select count(*) into n_annonces from public.annonces_plateforme where user_id = uid;
  select count(*) into n_snap from public.vinted_listing_snapshots where user_id = uid;
  select count(*) into n_rap from public.rapprochements where user_id = uid;
  select count(*) into n_pub from public.cross_post_jobs where user_id = uid and status = 'published';
  select count(*) into n_ventes from public.ventes where user_id = uid;
  select count(*) into autres_inv_avant from public.inventaire where user_id <> uid;
  select count(*) into autres_ventes_avant from public.ventes where user_id <> uid;
  select count(*) into autres_jobs_avant from public.cross_post_jobs where user_id <> uid;

  -- La personne, comme l'app : rôle authenticated, jeton à son nom.
  perform set_config('request.jwt.claims', json_build_object('sub', uid::text, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  t0 := clock_timestamp();
  perform public.supprimer_mon_stock_sans_retrait();
  t1 := clock_timestamp();
  execute 'reset role';

  select count(*) into autres_inv_apres from public.inventaire where user_id <> uid;
  select count(*) into autres_ventes_apres from public.ventes where user_id <> uid;
  select count(*) into autres_jobs_apres from public.cross_post_jobs where user_id <> uid;

  r := jsonb_build_object(
    'articles', ${N},
    'index_essai', ${INDEX_ESSAI},
    'index_en_place', (select count(*) from pg_indexes where schemaname = 'public' and indexname in ('vinted_listing_snapshots_inventaire_idx', 'rapprochements_inventaire_idx', 'vinted_republish_captures_inventaire_idx')),
    'semis_ms', round(extract(epoch from t0 - t_seme) * 1000),
    'duree_ms', round(extract(epoch from t1 - t0) * 1000),
    'avant', jsonb_build_object('annonces', n_annonces, 'releves_vinted', n_snap, 'rapprochements', n_rap, 'publications_en_ligne', n_pub, 'ventes', n_ventes),
    'fiches_restantes', (select count(*) from public.inventaire where user_id = uid),
    'ventes_restantes', (select count(*) from public.ventes where user_id = uid),
    'retraits_armes', (select count(*) from public.cross_post_jobs where user_id = uid and action = 'delete'),
    'traces_retrait', (select count(*) from public.usage_logs where user_id = uid and feature = 'retrait_annonces'),
    'publications_annulees', (select count(*) from public.cross_post_jobs where user_id = uid and status = 'cancelled'),
    'annonces_gardees_detachees', (select count(*) from public.annonces_plateforme where user_id = uid and inventaire_id is null),
    'releves_gardes_detaches', (select count(*) from public.vinted_listing_snapshots where user_id = uid and inventaire_id is null),
    'rapprochements_gardes_detaches', (select count(*) from public.rapprochements where user_id = uid and inventaire_id is null),
    'jobs_gardes_detaches', (select count(*) from public.cross_post_jobs where user_id = uid and inventaire_id is null),
    'autres_comptes_intacts', autres_inv_avant = autres_inv_apres and autres_ventes_avant = autres_ventes_apres and autres_jobs_avant = autres_jobs_apres
  );
  raise exception 'RESULTAT %', r;
end $$;
`;

const fichier = join(os.tmpdir(), `preuve-suppression-${process.pid}.sql`);
fs.writeFileSync(fichier, sql);
let sortie = '';
try {
  sortie = execFileSync('npx', ['supabase', 'db', 'query', '--linked', '-f', fichier, '-o', 'json'], { encoding: 'utf8', shell: process.platform === 'win32', stdio: ['ignore', 'pipe', 'pipe'] });
} catch (e) {
  sortie = `${e.stdout ?? ''}${e.stderr ?? ''}`;
} finally {
  fs.rmSync(fichier, { force: true });
}
const m = /RESULTAT (\{.*?\})(?:\\n|\s*\(|")/s.exec(sortie.replace(/\\"/g, '"'));
if (!m) { console.log('Pas de résultat lisible :\n' + sortie.slice(0, 1500)); process.exit(1); }
const r = JSON.parse(m[1]);
console.log(JSON.stringify(r, null, 2));

let ko = 0;
const ok = (c, msg) => { if (c) console.log(`  ✓ ${msg}`); else { ko++; console.log(`  ✗ ${msg}`); } };
ok(r.duree_ms < PLAFOND, `${r.articles} articles effacés en ${r.duree_ms} ms (plafond ${PLAFOND} ms, délai d'une requête de l'app)`);
ok(r.fiches_restantes === 0 && r.ventes_restantes === 0, 'plus aucune fiche ni vente');
ok(r.retraits_armes === 0 && r.traces_retrait === 0, 'aucun retrait armé sur une plateforme');
ok(r.publications_annulees === 0, 'aucune publication touchée (le filet n\'a pas tourné)');
ok(r.autres_comptes_intacts === true, 'les autres comptes sont intacts');
ok(r.annonces_gardees_detachees === r.avant.annonces && r.releves_gardes_detaches === r.avant.releves_vinted
  && r.rapprochements_gardes_detaches === r.avant.rapprochements && r.jobs_gardes_detaches >= r.avant.publications_en_ligne,
  'annonces, relevés, rapprochements et jobs détachés comme avant, pas effacés (ils partent avec le compte)');
console.log(ko ? `\n${ko} échec(s) — transaction annulée, rien n'est resté en base` : '\nTout est vert — transaction annulée, rien n\'est resté en base.');
process.exit(ko ? 1 : 0);
