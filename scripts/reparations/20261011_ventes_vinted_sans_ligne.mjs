// ═══════════════════════════════════════════════════════════════════════════
// RATTRAPAGE — LES VENTES VINTED PASSÉES « VENDU » SANS LIGNE DE VENTE (11/10, A5)
// ═══════════════════════════════════════════════════════════════════════════
// Du 09/10 11:43 (dernier signal de vente Vinted accepté) à l'application de la
// migration 20261011120000 (11/10), tout signal de vente posé par l'extension
// tombait en 403 ; son repli passait la fiche « vendu » sans ligne de vente ni
// retrait des copies. Ce script remet ces ventes sur LE chemin unique, par la
// règle de la migration — rien d'inventé :
//   · fiche « vendu », dressing « sold », quantité ≤ 1, non fusionnée ;
//   · un job Vinted VIVANT porte cette annonce exacte (numéro, jamais le titre) ;
//   · preuve : un relevé du dressing « sold » pris APRÈS la mise en ligne du job,
//     le premier depuis le 09/10 11:43:52 (fenêtre de l'incident), et le DERNIER
//     relevé de l'annonce dit encore « sold » ;
//   · aucune ligne de vente (fiche ou annonce), aucun reçu.
// Pour chacune : sauvegarde, fiche remise « stock » (quantité 1), signal posé sur
// le job (ce que l'extension voulait écrire), puis public.enregistrer_vente_prouvee
// (= le cron 52) → enregistrer_vente_atomique : UNE ligne, le stock, les retraits
// des copies prouvées. Une vente refusée par ses gardes reste en stock avec son
// signal : la question « Vendue ? » de l'app (jamais « vendu » sans ligne).
// Louis : comme les autres (décision de Nico, 11/10).
// AUCUN mail, AUCUNE notification : les notes nées dans la transaction sont
// classées « ignoree » (motif rattrapage_1110_ventes_vinted) avant tout envoi.
//
//   node scripts/reparations/20261011_ventes_vinted_sans_ligne.mjs
//        → À BLANC (défaut) : lecture seule ; la liste, par compte, et les copies en ligne ailleurs
//   node scripts/reparations/20261011_ventes_vinted_sans_ligne.mjs --essai
//        → tout le rattrapage dans UNE transaction ANNULÉE : le verdict de chaque vente, rien de gardé
//   node scripts/reparations/20261011_ventes_vinted_sans_ligne.mjs --appliquer --feu-vert-nico
//        → APRÈS la migration 20261011120000. Sauvegarde AVANT (_backup_1110_ventes_vinted_*),
//          journal (_rattrapage_1110_ventes_vinted), lots de 10, sous le verrou du cron 52.
//          Inverse (hors retraits déjà exécutés, irréversibles) :
//          scripts/reparations/20261011_ventes_vinted_sans_ligne_INVERSE.sql
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const APPLIQUER = process.argv.includes('--appliquer');
const FEU_VERT = process.argv.includes('--feu-vert-nico');
const ESSAI = process.argv.includes('--essai');   // tout rejoué dans UNE transaction ANNULÉE : le verdict, rien de gardé
const DEBUT_INCIDENT = '2026-10-09 09:43:52+00';   // dernier sale_signal Vinted accepté (11:43:52 Paris)

function requete(sql) {
  const f = path.join(os.tmpdir(), `rattrapage-1110-${process.pid}-${Date.now()}.sql`);
  fs.writeFileSync(f, sql);
  try {
    const out = execSync(`npx supabase db query --linked -f "${f}"`, { cwd: RACINE, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
    const j = JSON.parse(out.slice(out.indexOf('{')));
    return j.rows ?? [];
  } finally { fs.rmSync(f, { force: true }); }
}

// LA règle, une seule fois écrite : la sélection (les ids optionnels bornent un lot).
export function selection(ids = null) {
  return `
select i.id as inventaire_id, i.user_id, j.id as job_id, btrim(i.vinted_item_id) as annonce, i.titre, i.quantite,
       s.sold_le, j.platform_fields ->> 'sale_signal' as signal,
       (select coalesce(array_agg(distinct c.platform order by c.platform), '{}') from public.cross_post_jobs c
         where c.user_id = i.user_id and c.inventaire_id = i.id and c.status = 'published'
           and coalesce(c.action, 'publish') in ('publish', 'republish') and c.platform <> 'vinted') as copies
  from public.inventaire i
  join lateral (select c.* from public.cross_post_jobs c
                 where c.user_id = i.user_id and c.platform = 'vinted' and c.status = 'published'
                   and coalesce(c.action, 'publish') in ('publish', 'republish')
                   and (btrim(coalesce(c.platform_listing_id, '')) = btrim(i.vinted_item_id)
                        or substring(coalesce(c.listing_url, '') from '/items/([0-9]+)') = btrim(i.vinted_item_id))
                 order by c.created_at desc limit 1) j on true
  join lateral (select min(s.captured_at) as sold_le from public.vinted_listing_snapshots s
                 where s.user_id = i.user_id and s.vinted_item_id = btrim(i.vinted_item_id) and s.status = 'sold'
                   and s.captured_at >= coalesce(j.published_at, j.created_at)) s on true
 where i.statut = 'vendu' and i.vinted_status = 'sold' and i.fusionne_dans is null and coalesce(i.quantite, 0) <= 1
   and nullif(btrim(coalesce(i.vinted_item_id, '')), '') is not null
   and s.sold_le >= '${DEBUT_INCIDENT}'
   and (select s2.status from public.vinted_listing_snapshots s2
         where s2.user_id = i.user_id and s2.vinted_item_id = btrim(i.vinted_item_id)
         order by s2.captured_at desc limit 1) = 'sold'
   and not exists (select 1 from public.ventes v where v.user_id = i.user_id
                    and (v.inventaire_id = i.id or v.annonce_id = btrim(i.vinted_item_id)))
   and not exists (select 1 from public.ventes_operations o where o.user_id = i.user_id
                    and o.cle in ('annonce:vinted:' || btrim(i.vinted_item_id), coalesce(j.platform_fields ->> 'vente_operation_cle', '')))
   ${ids ? `and i.id in (${ids.join(',')})` : ''}
 order by s.sold_le, i.id`;
}

function sqlLot(ids) {
  return `begin;
set local statement_timeout = '90s';
select pg_advisory_xact_lock(hashtextextended('ventes_prouvees_tick', 0));
create temp table _c on commit drop as ${selection(ids)};
create table if not exists public._backup_1110_ventes_vinted_inventaire as select now() as sauve_le, i.* from public.inventaire i where false;
create table if not exists public._backup_1110_ventes_vinted_jobs as select now() as sauve_le, j.* from public.cross_post_jobs j where false;
create table if not exists public._rattrapage_1110_ventes_vinted (le timestamptz not null default now(), job_id uuid not null,
  inventaire_id bigint, user_id uuid, resultat jsonb, retraits uuid[], questions uuid[], notes_neutralisees text[]);
alter table public._backup_1110_ventes_vinted_inventaire enable row level security;
alter table public._backup_1110_ventes_vinted_jobs enable row level security;
alter table public._rattrapage_1110_ventes_vinted enable row level security;
revoke all on public._backup_1110_ventes_vinted_inventaire, public._backup_1110_ventes_vinted_jobs, public._rattrapage_1110_ventes_vinted from anon, authenticated;
insert into public._backup_1110_ventes_vinted_inventaire select now(), i.* from public.inventaire i where i.id in (select inventaire_id from _c);
insert into public._backup_1110_ventes_vinted_jobs select now(), j.* from public.cross_post_jobs j where j.inventaire_id in (select inventaire_id from _c);
create temp table _avant on commit drop as select id from public.cross_post_jobs where inventaire_id in (select inventaire_id from _c);
create temp table _q_avant on commit drop as select id from public.inventaire_doublons where garde in (select inventaire_id from _c);
-- La règle de la migration 20261011120000 : la fiche reste en stock, le signal part sur le job.
update public.inventaire i set statut = 'stock', quantite = 1 where i.id in (select inventaire_id from _c);
update public.cross_post_jobs j
   set platform_fields = coalesce(j.platform_fields, '{}'::jsonb) || jsonb_build_object(
         'sale_signal', 'sold',
         'unavailable_since', coalesce(j.platform_fields ->> 'unavailable_since', to_char(c.sold_le at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')),
         'sale_signal_pose_par', jsonb_build_object('par', 'rattrapage_1110_ventes_vinted', 'le', now(),
           'motif', 'dressing_sold_fiche_vendue_par_le_client'))
  from _c c where j.id = c.job_id and coalesce(j.platform_fields ->> 'sale_signal', '') <> 'sold';
-- Puis LE chemin unique (= cron 52).
create temp table _r on commit drop as select c.job_id, c.inventaire_id, c.user_id, public.enregistrer_vente_prouvee(c.job_id) resultat from _c c;
-- AUCUNE notification, AUCUN mail : les notes nées dans CETTE transaction pour CES fiches sont classées.
create temp table _n on commit drop as select p.id::text id, p.inventaire_id from public.push_ventes p
  where p.statut = 'a_envoyer' and p.part_le is null and p.cree_le >= now() and p.inventaire_id in (select inventaire_id from _c);
update public.push_ventes p set statut = 'ignoree', motif = 'rattrapage_1110_ventes_vinted', traite_le = now() where p.id::text in (select id from _n);
insert into public._rattrapage_1110_ventes_vinted (job_id, inventaire_id, user_id, resultat, retraits, questions, notes_neutralisees)
select r.job_id, r.inventaire_id, r.user_id, r.resultat,
  array(select d.id from public.cross_post_jobs d where d.inventaire_id = r.inventaire_id and d.action = 'delete' and d.id not in (select id from _avant)),
  array(select q.id from public.inventaire_doublons q where q.garde = r.inventaire_id and q.id not in (select id from _q_avant)),
  array(select n.id from _n n where n.inventaire_id = r.inventaire_id)
  from _r r;
commit;
select j.inventaire_id, j.resultat ->> 'issue' issue, j.resultat ->> 'reason' raison, cardinality(j.retraits) retraits,
       cardinality(j.questions) questions, cardinality(j.notes_neutralisees) notes,
       (select statut from public.inventaire where id = j.inventaire_id) statut,
       (select count(*) from public.ventes v where v.user_id = j.user_id and v.inventaire_id = j.inventaire_id) lignes
  from public._rattrapage_1110_ventes_vinted j where j.inventaire_id in (${ids.join(',')}) order by j.le desc;`;
}

const liste = requete(`set transaction read only;\n${selection()};`);
const parCompte = new Map();
for (const l of liste) parCompte.set(l.user_id, (parCompte.get(l.user_id) ?? 0) + 1);
console.log(`Ventes Vinted passées « vendu » sans ligne depuis le 09/10 11:43 : ${liste.length} fiches, ${parCompte.size} comptes`);
console.log(`  avec une copie en ligne ailleurs (retrait à armer) : ${liste.filter((l) => (l.copies ?? []).length).length}`);
console.log(`  signal déjà posé sur le job : ${liste.filter((l) => l.signal === 'sold').length}`);
for (const [u, n] of [...parCompte].sort((a, b) => b[1] - a[1])) console.log(`    ${u.slice(0, 8)} : ${n}`);
if (ESSAI) {
  const ids = liste.map((l) => l.inventaire_id);
  const corps = sqlLot(ids).replace(/^begin;/, '').replace(/commit;\n[\s\S]*$/, '');
  const verdict = `do $e$ declare v text; begin
  select string_agg(format('%s:%s:%s:retraits=%s:lignes=%s:statut=%s', r.inventaire_id, r.resultat ->> 'issue', coalesce(r.resultat ->> 'reason', ''),
         (select count(*) from public.cross_post_jobs d where d.inventaire_id = r.inventaire_id and d.action = 'delete' and d.id not in (select id from _avant)),
         (select count(*) from public.ventes v where v.user_id = r.user_id and v.inventaire_id = r.inventaire_id),
         (select statut from public.inventaire where id = r.inventaire_id)), '|') into v from _r r;
  raise exception 'ESSAI_1110 %', v; end $e$;`;
  const f = path.join(os.tmpdir(), `essai-1110-${process.pid}.sql`);
  fs.writeFileSync(f, `begin;\n${corps}\n${verdict}\nrollback;\n`);
  let out = '';
  try { out = execSync(`npx supabase db query --linked -f "${f}"`, { cwd: RACINE, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); }
  catch (e) { out = String(e.stdout ?? '') + String(e.stderr ?? ''); }
  fs.rmSync(f, { force: true });
  const m = out.match(/ESSAI_1110 ([^\\"]*)/);
  if (!m) { console.log(out.slice(0, 3000)); process.exit(1); }
  const lignes = m[1].split('|');
  const issues = {};
  for (const l of lignes) {
    const [, issue, raison, , n] = l.split(':');
    const k = `${issue}${raison ? ` (${raison})` : ''}`;
    issues[k] = (issues[k] ?? 0) + 1;
    if (issue !== 'enregistree' || n.split('=')[1] !== '1') console.log('   ', l);
  }
  console.log('ESSAI (transaction annulée, rien de gardé) :', JSON.stringify(issues));
  console.log('  retraits qui seraient armés :', lignes.reduce((a, l) => a + Number(l.split(':')[3].split('=')[1]), 0));
  process.exit(0);
}
if (!APPLIQUER) {
  console.log('\nÀ BLANC : rien n\'a été écrit. --appliquer --feu-vert-nico pour appliquer.');
  process.exit(0);
}
if (!FEU_VERT) { console.log('✗ --feu-vert-nico manquant : rien n\'est écrit.'); process.exit(1); }
const presente = requete("set transaction read only;\nselect count(*) n from pg_trigger where tgname = 'inventaire_0_vendu_vinted_par_la_vente';")[0];
if (Number(presente?.n) !== 1) { console.log('✗ migration 20261011120000 absente : rien n\'est écrit.'); process.exit(1); }
const ids = liste.map((l) => l.inventaire_id);
let ok = 0; let autres = 0;
for (let k = 0; k < ids.length; k += 10) {
  const lot = ids.slice(k, k + 10);
  const r = requete(sqlLot(lot));
  for (const x of r) {
    if (x.issue === 'enregistree') ok += 1; else autres += 1;
    console.log(`  ${x.inventaire_id} : ${x.issue}${x.raison ? ` (${x.raison})` : ''} — statut ${x.statut}, ${x.lignes} ligne(s), ${x.retraits} retrait(s), ${x.questions} question(s), ${x.notes} note(s) classée(s)`);
  }
}
console.log(`\nFait : ${ok} ventes enregistrées, ${autres} laissées à la question « Vendue ? ». Journal : public._rattrapage_1110_ventes_vinted`);
