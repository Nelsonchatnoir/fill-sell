// ═══════════════════════════════════════════════════════════════════════════
// RATTRAPAGE — LES VENTES PROUVÉES « SOLD » RESTÉES EN STOCK (08/10/2026)
// ═══════════════════════════════════════════════════════════════════════════
// Du 28/09 16:46 au 08/10, aucune vente prouvée ne s'est enregistrée seule
// (audit docs/audit/audit-fiabilisation-0810.md, U1). Le cron de la migration
// 20261008233100 ne traite que les preuves arrivées APRÈS son application :
// l'arriéré, c'est ce script, compte par compte, sur décision de Nico.
//
// MÊME RÈGLE que le cron : la sélection est LUE dans la migration
// (scripts/lib/ventes-prouvees-selection.mjs) — preuve « sold » uniquement,
// jamais « unavailable », annonce introuvable ni disparue. MÊME CHAÎNE : en
// --appliquer, chaque vente passe par public.enregistrer_vente_prouvee(job) →
// enregistrer_vente_atomique (inchangée) → retraits des copies prouvées et
// questions « Déjà vendu ? » par inventaire_vendu_retire_ses_copies.
// En plus des gardes de la base, le rattrapage NE TOUCHE PAS aux cas douteux
// (liste « à vérifier », avec le motif) : quantité > 1, plusieurs annonces
// vivantes sur la plateforme, annonce non prouvée, vente déjà liée, dressing
// qui revoit l'annonce en ligne, article peut-être remis en ligne sous une autre
// fiche (cas Bebertdeals), relevé en cours, comptes internes.
//
//   node scripts/reparations/20261008_rattrapage_ventes_prouvees.mjs
//        → À BLANC (défaut) : LECTURE SEULE (set transaction read only), rien n'est écrit ;
//          rapport dans docs/enquetes/ventes-prouvees-0810/RATTRAPAGE-A-BLANC.md (+ .json)
//   node scripts/reparations/20261008_rattrapage_ventes_prouvees.mjs --appliquer --feu-vert-nico --user <uuid>
//   node scripts/reparations/20261008_rattrapage_ventes_prouvees.mjs --appliquer --feu-vert-nico --tous
//        → APRÈS la migration 20261008233100 et le feu vert NOMMÉ de Nico seulement.
//          Sauvegarde AVANT (_backup_0810_ventes_prouvees_*), journal (_rattrapage_0810_ventes_prouvees),
//          puis les ventes par lots de 10, sous le verrou du cron (jamais en même temps que lui).
//          Inverse : scripts/reparations/20261008_rattrapage_ventes_prouvees_INVERSE.sql
//          ⛔ Un retrait de copie déjà EXÉCUTÉ sur une plateforme est irréversible.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { requeteSelection } from '../lib/ventes-prouvees-selection.mjs';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const APPLIQUER = process.argv.includes('--appliquer');
const FEU_VERT = process.argv.includes('--feu-vert-nico');
const USER = arg('--user');
const TOUS = process.argv.includes('--tous');
const SORTIE = arg('--sortie') ?? path.join(RACINE, 'docs', 'enquetes', 'ventes-prouvees-0810');

// Comptes internes (tests, Nico, Ornella) : listés à part, jamais comptés.
export const INTERNES_SQL = `
  select id from auth.users
   where lower(email) = any (array['nicolas.svobodny@gmail.com','hoosslocal@gmail.com','sbooby.stan@gmail.com','ornella.berthier@gmail.com','ornellaracano@icloud.com','bensvo91@hotmail.fr','nicotest@mail.fr'])
      or email ilike '%test%' or email ilike '%@fillsell.app' or email ilike '%example.%'
      or id = 'f8aa02a5-23cb-4325-bba8-127f61a75741'`;

function requete(sql) {
  const f = path.join(os.tmpdir(), `rattrapage-vp-${process.pid}-${Date.now()}.sql`);
  fs.writeFileSync(f, sql);
  try {
    const out = execSync(`npx supabase db query --linked -f "${f}"`, { cwd: RACINE, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
    const j = JSON.parse(out.slice(out.indexOf('{')));
    if (!j.rows) throw new Error(out.slice(0, 400));
    return j.rows;
  } finally { fs.rmSync(f, { force: true }); }
}

// ── Le diagnostic (LECTURE SEULE) : la sélection du cron, sans borne d'armement,
// puis, par annonce, ce que la base ferait et ce qui la rend douteuse. ─────────
export function sqlDiagnostic({ user = null } = {}) {
  const sel = requeteSelection({ depuis: '-infinity', limite: 1000, user, ignorerRefus: true, sansRefus: true });
  return `set transaction read only;
set local statement_timeout = '90s';
with internes as (${INTERNES_SQL}),
sel as (${sel}),
c as (
  select s.*, j.platform_fields pf, j.published_at, j.created_at job_cree, j.title,
         i.quantite, i.titre, i.vinted_item_id fiche_vid, i.vinted_status fiche_vstatus, i.plateforme fiche_pf,
         (s.user_id in (select id from internes)) interne
    from sel s join public.cross_post_jobs j on j.id = s.job_id join public.inventaire i on i.id = s.inventaire_id
)
select left(c.user_id::text, 8) u, c.user_id, c.job_id, c.inventaire_id inv, c.platform, c.listing_id lid, c.preuve,
  to_char(c.preuve_le at time zone 'Europe/Paris', 'DD/MM HH24:MI') preuve_le_paris, c.preuve_le, c.prix, c.quantite q, c.interne,
  left(c.titre, 70) titre,
  public.retrait_job_prouve(c.job_id) prouve,
  public.fiche_annonces_vivantes(c.inventaire_id, c.platform) vivantes,
  exists (select 1 from public.ventes v where v.user_id = c.user_id and v.inventaire_id = c.inventaire_id
           and v.created_at >= coalesce(c.published_at, c.job_cree)
           and not exists (select 1 from public.ventes_operations o where o.user_id = c.user_id and o.inventaire_id = c.inventaire_id
                            and o.resultat -> 'ventes_ids' @> to_jsonb(array[v.id]))) vente_deja_liee,
  exists (select 1 from public.vinted_sync_runs r where r.user_id = c.user_id and r.status = 'running') releve_en_cours,
  (c.platform = 'vinted' and (select s.status = 'active' from public.vinted_listing_snapshots s
     where s.user_id = c.user_id and s.vinted_item_id = c.listing_id order by s.captured_at desc limit 1)) dementi_dressing,
  (c.platform = 'vinted' and nullif(btrim(c.fiche_vid), '') is not null and btrim(c.fiche_vid) <> c.listing_id and coalesce(c.fiche_vstatus, '') = 'active') fiche_suit_autre_annonce,
  (select count(*) from public.inventaire o
     where o.user_id = c.user_id and o.id <> c.inventaire_id and o.fusionne_dans is null and o.statut = 'stock'
       and public.titre_norm(o.titre) = public.titre_norm(c.titre) and nullif(btrim(o.vinted_item_id), '') is not null
       and exists (select 1 from public.vinted_listing_snapshots s where s.user_id = o.user_id and s.vinted_item_id = btrim(o.vinted_item_id)
                    and s.status = 'active' and s.captured_at > c.preuve_le)) remise_en_ligne_possible,
  coalesce((select jsonb_agg(jsonb_build_object(
      'job', o.id, 'pf', o.platform, 'lid', o.platform_listing_id, 'statut', o.status, 'action', o.action,
      'prouve', public.retrait_job_prouve(o.id), 'vivantes', public.fiche_annonces_vivantes(c.inventaire_id, o.platform),
      'signal', o.platform_fields ->> 'sale_signal',
      'vu', to_char(o.vu_en_ligne_le at time zone 'Europe/Paris', 'DD/MM HH24:MI'), 'vu_3j', o.vu_en_ligne_le > now() - interval '3 days',
      'annonce_liee', exists (select 1 from public.annonces_plateforme ap where ap.job_id = o.id and ap.user_id = o.user_id and ap.disparu_le is null and ap.retiree_le is null),
      'retrait_ouvert', exists (select 1 from public.cross_post_jobs d where d.user_id = o.user_id and d.inventaire_id = o.inventaire_id
          and d.platform = o.platform and d.action = 'delete' and d.status in ('pending', 'processing', 'needs_user'))))
     from public.cross_post_jobs o
    where o.inventaire_id = c.inventaire_id and o.user_id = c.user_id and o.id <> c.job_id
      and o.action in ('publish', 'republish') and o.status in ('published', 'pending', 'needs_user', 'processing')), '[]'::jsonb) copies,
  c.fiche_vstatus
from c order by c.user_id, c.preuve_le;`;
}

// Les signaux « sold » SANS preuve (dressing qui dit autre chose, rien de lu) : jamais enregistrés, listés.
export function sqlSansPreuve() {
  return `set transaction read only;
set local statement_timeout = '60s';
with internes as (${INTERNES_SQL})
select left(c.user_id::text, 8) u, c.inventaire_id inv, c.platform, c.platform_listing_id lid, i.quantite q,
  (c.user_id in (select id from internes)) interne,
  (select s.status || ' le ' || to_char(s.captured_at at time zone 'Europe/Paris', 'DD/MM HH24:MI') from public.vinted_listing_snapshots s
    where s.user_id = c.user_id and s.vinted_item_id = btrim(c.platform_listing_id) order by s.captured_at desc limit 1) dernier_releve
  from public.cross_post_jobs c join public.inventaire i on i.id = c.inventaire_id and i.user_id = c.user_id
 where c.status = 'published' and (c.platform_fields ->> 'sale_signal') = 'sold' and c.action in ('publish', 'republish')
   and i.statut = 'stock' and i.fusionne_dans is null
   and not exists (select 1 from (${requeteSelection({ depuis: '-infinity', limite: 1000, ignorerRefus: true, sansRefus: true })}) s where s.job_id = c.id)
 order by 1, 2;`;
}

// Ce que la chaîne existante ferait d'une copie (réplique des règles de prod,
// lues le 08/10 : enregistrer_vente_atomique, armer_retrait_job_pour,
// armer_retraits_copies, poser_questions_copies_non_prouvees). Le banc
// scripts/ventes-prouvees-banc.mjs les exécute pour de vrai.
export function sortCopie(c, vente) {
  if (c.statut !== 'published') return c.pf === vente.platform ? 'rien' : 'publication_arretee';
  if (c.signal === 'sold') return 'rien';
  if (c.retrait_ouvert) return 'deja_en_retrait';
  if (Number(c.vivantes) >= 2) return 'rien_deux_exemplaires';
  if (c.pf === vente.platform) {
    // même plateforme : armer_retraits_copies n'épargne la plateforme Vinted que si la fiche dit « sold »
    if (vente.platform !== 'vinted' || vente.fiche_vstatus === 'sold') return 'rien';
    return c.prouve ? 'retrait' : 'rien';
  }
  if (c.prouve) return 'retrait';
  return c.annonce_liee ? 'question' : 'rien';
}

export function douteDe(r) {
  const d = [];
  if (r.interne) d.push('compte_interne');
  if (Number(r.q ?? 1) > 1) d.push(`quantite_${r.q}`);
  if (!r.prouve) d.push('annonce_non_prouvee');
  if (Number(r.vivantes) >= 2) d.push('plusieurs_annonces_vivantes');
  if (r.vente_deja_liee) d.push('vente_deja_liee');
  if (r.dementi_dressing) d.push('dressing_la_revoit_en_ligne');
  if (r.fiche_suit_autre_annonce) d.push('fiche_suit_une_autre_annonce_en_ligne');
  if (Number(r.remise_en_ligne_possible) > 0) d.push(`remise_en_ligne_possible(${r.remise_en_ligne_possible})`);
  if (r.releve_en_cours) d.push('releve_en_cours');
  if (!(Number(r.prix) > 0)) d.push('prix');
  return d;
}

function aBlanc() {
  const lignes = requete(sqlDiagnostic({ user: USER }));
  const sansPreuve = USER ? [] : requete(sqlSansPreuve());
  const enr = [], douteux = [];
  for (const r of lignes) {
    const copies = (r.copies ?? []).map((c) => ({ ...c, sort: sortCopie(c, r) }));
    const e = { ...r, copies, doutes: douteDe(r) };
    (e.doutes.length ? douteux : enr).push(e);
  }
  const ext = (a) => a.filter((r) => !r.interne);
  const parCompte = {};
  for (const r of ext(enr)) {
    const p = (parCompte[r.u] ??= { articles: 0, retraits: {}, questions: {}, arretees: {}, urgents: 0 });
    p.articles++;
    for (const c of r.copies) {
      if (c.sort === 'retrait') p.retraits[c.pf] = (p.retraits[c.pf] ?? 0) + 1;
      if (c.sort === 'question') p.questions[c.pf] = (p.questions[c.pf] ?? 0) + 1;
      if (c.sort === 'publication_arretee') p.arretees[c.pf] = (p.arretees[c.pf] ?? 0) + 1;
    }
    if (r.copies.some((c) => c.vu_3j)) p.urgents++;
  }
  const somme = (k) => { const t = {}; for (const p of Object.values(parCompte)) for (const [pf, n] of Object.entries(p[k])) t[pf] = (t[pf] ?? 0) + n; return t; };
  const urgents = ext(enr).filter((r) => r.copies.some((c) => c.vu_3j));
  const urgentsDouteux = ext(douteux).filter((r) => r.copies.some((c) => c.vu_3j));
  const res = {
    produit_le: new Date().toISOString(), mode: 'a_blanc', lecture_seule: true,
    regle: 'sélection lue dans supabase/migrations/20261008233100_ventes_prouvees_automatiques.sql (ventes_prouvees_a_enregistrer, sans borne d’armement)',
    totaux: {
      selection: lignes.length, internes: lignes.filter((r) => r.interne).length,
      a_enregistrer: ext(enr).length, a_enregistrer_comptes: Object.keys(parCompte).length,
      a_verifier: ext(douteux).length, a_verifier_comptes: new Set(ext(douteux).map((r) => r.u)).size,
      retraits_par_plateforme: somme('retraits'), questions_par_plateforme: somme('questions'), publications_arretees: somme('arretees'),
      urgents: urgents.length, urgents_douteux: urgentsDouteux.length,
      sans_preuve: sansPreuve.filter((r) => !r.interne).length,
    },
    par_compte: parCompte, urgents, a_enregistrer: ext(enr), a_verifier: ext(douteux),
    sans_preuve: sansPreuve.filter((r) => !r.interne), internes: lignes.filter((r) => r.interne).map((r) => ({ u: r.u, inv: r.inv, platform: r.platform })),
  };
  fs.mkdirSync(SORTIE, { recursive: true });
  // Le fichier versionné ne porte que les 8 premiers caractères des comptes.
  const sansUuid = JSON.parse(JSON.stringify(res, (k, v) => (k === 'user_id' ? undefined : v)));
  fs.writeFileSync(path.join(SORTIE, 'rattrapage-a-blanc.json'), JSON.stringify(sansUuid, null, 1));
  fs.writeFileSync(path.join(SORTIE, 'RATTRAPAGE-A-BLANC.md'), rapport(res));
  console.log(JSON.stringify(res.totaux, null, 1));
  console.log(`→ ${path.relative(RACINE, path.join(SORTIE, 'RATTRAPAGE-A-BLANC.md'))}`);
}

const pfs = (o) => Object.entries(o).map(([k, v]) => `${k} ${v}`).join(', ') || '—';
function ligneArticle(r) {
  const ret = r.copies.filter((c) => c.sort === 'retrait').map((c) => `${c.pf} ${c.lid ?? '(sans n°)'}${c.vu_3j ? ' (vue ' + c.vu + ')' : ''}`);
  const qu = r.copies.filter((c) => c.sort === 'question').map((c) => `${c.pf} ${c.lid ?? ''}${c.vu_3j ? ' (vue ' + c.vu + ')' : ''}`);
  const ar = r.copies.filter((c) => c.sort === 'publication_arretee').map((c) => c.pf);
  const rien = r.copies.filter((c) => c.sort.startsWith('rien') && c.statut === 'published' && c.pf !== r.platform).map((c) => `${c.pf} (${c.sort})`);
  return `| ${r.u} | ${r.inv} | ${r.platform} ${r.lid} | ${r.preuve_le_paris} | ${ret.join(' ; ') || '—'} | ${qu.join(' ; ') || '—'}${ar.length ? ` · arrêt : ${ar.join(', ')}` : ''}${rien.length ? ` · non touchées : ${rien.join(', ')}` : ''} |`;
}
function rapport(res) {
  const t = res.totaux;
  const L = [];
  L.push('# Rattrapage des ventes prouvées « sold » — À BLANC (lecture seule)', '');
  L.push(`Produit le ${new Date(res.produit_le).toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })} (heure de Paris) par`,
    '`node scripts/reparations/20261008_rattrapage_ventes_prouvees.mjs` — **rien n\'a été écrit** (`set transaction read only`).',
    'Règle : la sélection du cron, lue dans la migration 20261008233100 (preuve « sold » seulement). Chaîne simulée :',
    'retrait des copies prouvées, question « Déjà vendu ? » pour les copies non prouvées, publications en attente arrêtées.',
    'Comptes de test, de Nico et d\'Ornella exclus des comptages (listés à part en fin). Heures de Paris.', '');
  L.push('## Totaux', '',
    `- Annonces « sold » prouvées encore en stock (sélection) : **${t.selection}** (dont ${t.internes} sur des comptes internes).`,
    `- **À enregistrer** (aucun doute) : **${t.a_enregistrer} articles, ${t.a_enregistrer_comptes} comptes**.`,
    `- Copies qui seraient **retirées** : ${pfs(t.retraits_par_plateforme)}.`,
    `- Questions « Déjà vendu ? » qui seraient posées (copies non prouvées) : ${pfs(t.questions_par_plateforme)}.`,
    `- Publications en attente qui seraient arrêtées : ${pfs(t.publications_arretees)}.`,
    `- **À vérifier** (rien enregistré) : ${t.a_verifier} articles, ${t.a_verifier_comptes} comptes.`,
    `- Signaux « sold » SANS preuve (jamais enregistrés) : ${t.sans_preuve}.`, '');
  L.push(`## 1. URGENTS — une copie vue en ligne ailleurs depuis 3 jours (${res.urgents.length} à enregistrer + ${t.urgents_douteux} à vérifier)`, '',
    '| Compte | Fiche | Annonce vendue | Preuve « sold » | Copies retirées | Questions / autres |', '|---|---|---|---|---|---|');
  for (const r of res.urgents) L.push(ligneArticle(r));
  for (const r of res.a_verifier.filter((r) => r.copies.some((c) => c.vu_3j))) L.push(`| ${r.u} | ${r.inv} | ${r.platform} ${r.lid} | ${r.preuve_le_paris} | **à vérifier : ${r.doutes.join(', ')}** | copies vues : ${r.copies.filter((c) => c.vu_3j).map((c) => `${c.pf} ${c.lid ?? ''} (${c.vu})`).join(' ; ')} |`);
  L.push('', '## 2. Par compte (à enregistrer)', '', '| Compte | Articles | Retraits par plateforme | Questions | Publications arrêtées | Dont urgents |', '|---|---|---|---|---|---|');
  for (const [u, p] of Object.entries(res.par_compte).sort((a, b) => b[1].articles - a[1].articles)) L.push(`| ${u} | ${p.articles} | ${pfs(p.retraits)} | ${pfs(p.questions)} | ${pfs(p.arretees)} | ${p.urgents} |`);
  L.push('', '## 3. Détail des articles à enregistrer', '', '| Compte | Fiche | Annonce vendue | Preuve « sold » | Copies retirées | Questions / autres |', '|---|---|---|---|---|---|');
  for (const r of res.a_enregistrer) L.push(ligneArticle(r));
  L.push('', '## 4. À vérifier — rien ne sera enregistré par le rattrapage', '',
    'Motifs : `annonce_non_prouvee` / `plusieurs_annonces_vivantes` / `vente_deja_liee` (la base refuserait) ; `quantite_N` (plusieurs exemplaires) ;',
    '`remise_en_ligne_possible(n)` : n autre(s) fiche(s) en stock du compte, même titre, dont l\'annonce Vinted a été revue EN LIGNE après la preuve',
    '(article peut-être remis en ligne, cas Bebertdeals) ; `fiche_suit_une_autre_annonce_en_ligne` ; `dressing_la_revoit_en_ligne` ; `releve_en_cours`.', '',
    '| Compte | Fiche | Annonce | Preuve | Motif(s) | Copies vues < 3 j |', '|---|---|---|---|---|---|');
  for (const r of res.a_verifier) L.push(`| ${r.u} | ${r.inv} | ${r.platform} ${r.lid} | ${r.preuve_le_paris} | ${r.doutes.join(', ')} | ${r.copies.filter((c) => c.vu_3j).map((c) => c.pf).join(', ') || '—'} |`);
  L.push('', `## 5. Signaux « sold » SANS preuve (${res.sans_preuve.length}) — jamais une vente`, '',
    'Le job porte `sale_signal = sold` mais le dernier relevé du dressing de cette annonce ne dit pas « sold » (ou rien n\'a été lu) :',
    'une vente n\'est jamais enregistrée sur ce seul signal (cas Louis, 06/10).', '', '| Compte | Fiche | Annonce | Q | Dernier relevé |', '|---|---|---|---|---|');
  for (const r of res.sans_preuve) L.push(`| ${r.u} | ${r.inv} | ${r.platform} ${r.lid} | ${r.q} | ${r.dernier_releve ?? 'aucun'} |`);
  L.push('', `## 6. Comptes internes (non comptés) : ${res.internes.length} annonce(s)`, '', res.internes.map((r) => `${r.u} ${r.inv} ${r.platform}`).join(' · ') || '—', '');
  return L.join('\n');
}

// ── Les deux écritures du mode --appliquer (exportées : le banc les rejoue) ──
// Sauvegarde AVANT (tables fermées : RLS sans policy) + le journal.
export function sqlSauvegarde(invs) {
  return `begin;
create table if not exists public._backup_0810_ventes_prouvees_inventaire as select now() as sauve_le, i.* from public.inventaire i where false;
create table if not exists public._backup_0810_ventes_prouvees_jobs as select now() as sauve_le, j.* from public.cross_post_jobs j where false;
create table if not exists public._rattrapage_0810_ventes_prouvees (le timestamptz not null default now(), job_id uuid not null, inventaire_id bigint, resultat jsonb,
  retraits uuid[], questions uuid[], publications_arretees uuid[]);
alter table public._backup_0810_ventes_prouvees_inventaire enable row level security;
alter table public._backup_0810_ventes_prouvees_jobs enable row level security;
alter table public._rattrapage_0810_ventes_prouvees enable row level security;
revoke all on public._backup_0810_ventes_prouvees_inventaire, public._backup_0810_ventes_prouvees_jobs, public._rattrapage_0810_ventes_prouvees from anon, authenticated;
insert into public._backup_0810_ventes_prouvees_inventaire select now(), i.* from public.inventaire i where i.id in (${invs.join(',')});
insert into public._backup_0810_ventes_prouvees_jobs select now(), j.* from public.cross_post_jobs j where j.inventaire_id in (${invs.join(',')});
commit;
select count(*) n from public._backup_0810_ventes_prouvees_jobs;`;
}
// Un lot de ventes (≤ 10), sous le verrou du cron ; le journal note les
// retraits, questions et publications arrêtées que la chaîne a produits.
export function sqlLot(lot) {
  return `begin;
set local statement_timeout = '60s';
select pg_advisory_xact_lock(hashtextextended('ventes_prouvees_tick', 0));
create temp table _avant on commit drop as select id from public.cross_post_jobs where inventaire_id in (select inventaire_id from public.cross_post_jobs where id in (${lot.join(',')}));
create temp table _q_avant on commit drop as select id from public.inventaire_doublons where garde in (select inventaire_id from public.cross_post_jobs where id in (${lot.join(',')}));
create temp table _r on commit drop as select j.id job_id, j.inventaire_id, public.enregistrer_vente_prouvee(j.id) resultat from public.cross_post_jobs j where j.id in (${lot.join(',')});
insert into public._rattrapage_0810_ventes_prouvees (job_id, inventaire_id, resultat, retraits, questions, publications_arretees)
select r.job_id, r.inventaire_id, r.resultat,
  array(select d.id from public.cross_post_jobs d where d.inventaire_id = r.inventaire_id and d.action = 'delete' and d.id not in (select id from _avant)),
  array(select q.id from public.inventaire_doublons q where q.garde = r.inventaire_id and q.id not in (select id from _q_avant)),
  array(select p.id from public.cross_post_jobs p where p.inventaire_id = r.inventaire_id and p.status = 'cancelled' and p.id in (select id from _avant)
          and p.error = 'Cet exemplaire a été vendu ; cette publication est arrêtée.')
  from _r r;
commit;
select j.job_id, j.resultat ->> 'issue' issue, j.resultat ->> 'reason' raison, cardinality(j.retraits) retraits, cardinality(j.questions) questions
  from public._rattrapage_0810_ventes_prouvees j where j.job_id in (${lot.join(',')}) order by j.le desc;`;
}

// ── APPLIQUER (feu vert nommé de Nico, après la migration) ──────────────────
function appliquer() {
  if (!FEU_VERT) { console.error('⛔ --appliquer exige --feu-vert-nico (décision nommée de Nico).'); process.exit(2); }
  if (!USER && !TOUS) { console.error('⛔ --appliquer exige --user <uuid> ou --tous.'); process.exit(2); }
  if (USER && !/^[0-9a-f-]{36}$/.test(USER)) { console.error('⛔ --user : un uuid complet.'); process.exit(2); }
  const presente = requete("set transaction read only;\nselect count(*) n from pg_proc where proname = 'enregistrer_vente_prouvee';")[0];
  if (!Number(presente.n)) { console.error('⛔ La migration 20261008233100 n’est pas appliquée : rien n’est fait.'); process.exit(2); }
  // Le même diagnostic qu'à blanc, relu MAINTENANT : seuls les articles sans doute.
  const lignes = requete(sqlDiagnostic({ user: USER }));
  const cibles = lignes.filter((r) => !r.interne && douteDe(r).length === 0);
  console.log(`${cibles.length} vente(s) à enregistrer, ${lignes.length - cibles.length} écartée(s) (à vérifier / internes).`);
  if (!cibles.length) return;
  const invs = [...new Set(cibles.map((r) => r.inv))];
  const jobs = cibles.map((r) => `'${r.job_id}'::uuid`);
  // 1. Sauvegarde AVANT (tables fermées : RLS sans policy) + journal.
  requete(sqlSauvegarde(invs));
  // 2. Les ventes, par lots de 10, sous le verrou du cron.
  for (let i = 0; i < jobs.length; i += 10) {
    const lot = jobs.slice(i, i + 10);
    const rows = requete(sqlLot(lot));
    for (const r of rows) console.log(`${r.job_id} ${r.issue}${r.raison ? ' — ' + r.raison : ''} · retraits ${r.retraits} · questions ${r.questions}`);
  }
  console.log('Journal : public._rattrapage_0810_ventes_prouvees ; inverse : scripts/reparations/20261008_rattrapage_ventes_prouvees_INVERSE.sql');
}

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  if (APPLIQUER) appliquer(); else aBlanc();
}
