// ═══════════════════════════════════════════════════════════════════════════
// VERROU P2 — UNE VENTE VINTED PROUVÉE PAR LE NUMÉRO DE SA COMMANDE RETIRE NOS DÉPÔTS (19/11/2026, terminal t5)
//   npm run selftest:vente-vinted-par-numero            (vert avec la migration 20261119175000)
//   node scripts/vente-vinted-par-numero-selftest.mjs --avant   (la règle attendue jouée sur les corps de PROD : ROUGE)
// ═══════════════════════════════════════════════════════════════════════════
// Le cas (compte c385e244, relu en prod le 19/11, lecture seule ; identifiants d'essai) : une fiche née du dressing sans
// tâche Vinted passe « vendu » quand le dressing lit l'annonce « sold », AVANT la vente enregistrée (commande « waiting ») ;
// armer_retrait_job_pour exige une vente : notre dépôt Beebs reste en ligne, sans retrait ni question.
// Banc : Postgres JETABLE (embedded-postgres), corps de PROD (scripts/essais/fixtures/prod-1911-p2, commentaires retirés ;
// vente_prouvee_fiche_liee à l'octet par l'inverse). Ce verrou prouve :
//   A. AVANT : fiche « vendu » + commande « waiting » → aucun retrait du dépôt (le constat) ;
//   B. APRÈS : le dépôt reçoit SON retrait (à la fiche « vendu », ou à l'arrivée de la commande) ; JAMAIS une annonce
//      importée (garde du 03/11) ; jamais sur une commande « failed », une commande de plus de 30 jours (déclencheur), une
//      fiche en plusieurs exemplaires, une annonce Vinted ; jamais deux retraits ; la vente enregistrée garde son circuit ;
//   C. l'INVERSE rend vente_prouvee_fiche_liee à l'octet et retire le reste ; la garde md5 refuse un corps changé ;
//   D. la reprise du stock déjà là ne touche que le cas, est idempotente, et son inverse annule ce qu'elle a armé.
import pg from 'pg';
import fs from 'node:fs';
import { mkdtempSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (p) => fs.readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');
const existe = (p) => fs.existsSync(join(ROOT, p));
const AVANT = process.argv.includes('--avant');
const MIGRATION = 'supabase/migrations/20261119175000_vente_vinted_par_numero.sql';
const INVERSE = 'supabase/rollbacks/20261119175000_vente_vinted_par_numero_INVERSE.sql';
const REPRISE = 'scripts/reparations/20261119_vente_vinted_par_numero_reprise.sql';
const REPRISE_INVERSE = 'scripts/reparations/20261119_vente_vinted_par_numero_reprise_INVERSE.sql';
const FIX = 'scripts/essais/fixtures/prod-1911-p2';
const MD5_PROD = 'ecdc2abb172975c78f0fc9d12cd94b6e';
const SIG = "'public.vente_prouvee_fiche_liee(bigint,text)'::regprocedure";
const CORPS = ['vente_instant', 'listing_designe', 'leboncoin_transaction_lue', 'annonce_importee', 'annonce_mise_en_ligne',
  'vente_apres_mise_en_ligne', 'retrait_job_prouve', 'rattachement_confirme', 'fiche_annonces_vivantes', 'armer_retrait_job_pour',
  'armer_retrait_job', 'armer_retraits_copies', 'inventaire_vendu_retire_ses_copies'];

let ko = 0, n = 0;
const ok = (c, m, d) => { n++; if (c) console.log(`  ✓ ${m}`); else { ko++; console.log(`  ✗ ${m}${d === undefined ? '' : `\n      ← ${JSON.stringify(d).slice(0, 600)}`}`); } };

const U = 'c385e244-0000-4000-8000-000000000001';
const F = '1794665798832018';           // la fiche du dressing (annonce Vinted 10780293206), sans tâche Vinted
const ITEM = '10780293206';
const J_DEPOT = 'd0000000-0000-4000-8000-000000000001';   // notre dépôt Beebs 34358308
const J_IMPORT = 'd0000000-0000-4000-8000-000000000002';  // l'import Leboncoin 3309488788 rattaché par photo identique

const PRELUDE = String.raw`
DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE service_role NOLOGIN BYPASSRLS; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE TABLE public.inventaire (id bigint PRIMARY KEY, user_id uuid NOT NULL, titre text, statut text DEFAULT 'stock', origine text,
  fusionne_dans bigint, quantite integer DEFAULT 1, plateforme text, vinted_item_id text, vinted_status text, created_at timestamptz DEFAULT now());
CREATE TABLE public.ventes (id bigserial PRIMARY KEY, user_id uuid, inventaire_id bigint, plateforme text, plateforme_code text, statut text,
  vendu_le timestamptz, date date, annonce_id text, created_at timestamptz DEFAULT now());
CREATE TABLE public.cross_post_jobs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, inventaire_id bigint,
  platform text NOT NULL, status text NOT NULL, action text DEFAULT 'publish', photo_option text, title text, listing_url text,
  platform_listing_id text, platform_fields jsonb, error text, published_at timestamptz, created_at timestamptz DEFAULT now());
CREATE TABLE public.annonces_plateforme (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, platform text NOT NULL,
  listing_id text, url text, titre text, inventaire_id bigint, job_id uuid, statut_plateforme text DEFAULT 'en_ligne', disparu_le timestamptz,
  retiree_le timestamptz, ignoree_le timestamptz, publiee_le timestamptz, transaction_plateforme text, capture jsonb, quantite integer,
  created_at timestamptz DEFAULT now());
CREATE TABLE public.inventaire_fusions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, par text, defait_le timestamptz,
  deplacements jsonb, created_at timestamptz DEFAULT now());
CREATE TABLE public.fiches_liees_comptes (fiche_a bigint, fiche_b bigint, user_a uuid, user_b uuid);
CREATE TABLE public.ventes_operations (user_id uuid, cle text);
CREATE TABLE public.vinted_listing_snapshots (user_id uuid, vinted_item_id text, captured_at timestamptz, status text);
CREATE TABLE public.vinted_commandes_articles (user_id uuid NOT NULL, commande_ref text NOT NULL, item_id text NOT NULL, statut text,
  commande_le timestamptz, maj_le timestamptz DEFAULT now(), PRIMARY KEY (user_id, commande_ref, item_id));
CREATE TABLE public.usage_logs (id bigserial PRIMARY KEY, user_id uuid, feature text, metadata jsonb, created_at timestamptz DEFAULT now());
CREATE TABLE public.inventaire_doublons (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, statut text, source text);
-- ── bouchons (hors de ce qui est jugé) ──
CREATE FUNCTION public.comptes_sont_lies(uuid, uuid) RETURNS boolean LANGUAGE sql AS $f$ SELECT false $f$;
CREATE FUNCTION public.opla_sortie_passee() RETURNS boolean LANGUAGE sql AS $f$ SELECT true $f$;
CREATE FUNCTION public.opla_copie_a_retirer_noter(uuid, text) RETURNS void LANGUAGE sql AS $f$ SELECT $f$;
CREATE FUNCTION public.vinted_annonce_vendue(uuid, text) RETURNS boolean LANGUAGE sql AS $f$ SELECT false $f$;
CREATE FUNCTION public.poser_questions_copies_non_prouvees(bigint, uuid, text, text) RETURNS integer LANGUAGE sql AS $f$ SELECT 0 $f$;
`;
const DONNEES = `
TRUNCATE public.inventaire, public.ventes, public.cross_post_jobs, public.annonces_plateforme, public.vinted_commandes_articles, public.usage_logs,
  public.inventaire_doublons, public.vinted_listing_snapshots;
INSERT INTO public.inventaire (id, user_id, titre, statut, origine, quantite, vinted_item_id, vinted_status, created_at)
VALUES (${F}, '${U}', 'Jeu (essai)', 'stock', 'vinted_sync', 1, '${ITEM}', 'active', '2026-11-14 14:16:00+00');
INSERT INTO public.cross_post_jobs (id, user_id, inventaire_id, platform, status, action, title, listing_url, platform_listing_id, platform_fields, published_at, created_at) VALUES
  ('${J_DEPOT}', '${U}', ${F}, 'beebs', 'published', 'publish', 'Jeu (essai)', 'https://www.beebs.app/fr/p/34358308', '34358308', '{}', '2026-11-14 15:06:00+00', '2026-11-14 15:06:00+00'),
  ('${J_IMPORT}', '${U}', ${F}, 'leboncoin', 'published', 'publish', 'Jeu (essai)', NULL, '3309488788',
   '{"source": "releve", "rattachement": {"par": "auto", "motif": "photo_identique", "regle": "rapprochement_v3"}}', '2026-11-14 20:56:00+00', '2026-11-14 20:56:00+00');
INSERT INTO public.annonces_plateforme (user_id, platform, listing_id, inventaire_id, job_id, created_at) VALUES
  ('${U}', 'beebs', '34358308', ${F}, '${J_DEPOT}', '2026-11-14 15:10:00+00'),
  ('${U}', 'leboncoin', '3309488788', ${F}, '${J_IMPORT}', '2026-11-14 20:50:00+00');
`;
const commande = (statut, jours = 2, ref = '24206260255') =>
  `INSERT INTO public.vinted_commandes_articles (user_id, commande_ref, item_id, statut, commande_le) VALUES ('${U}', '${ref}', '${ITEM}', '${statut}', now() - interval '${jours} days')
   ON CONFLICT (user_id, commande_ref, item_id) DO UPDATE SET statut = excluded.statut, maj_le = now();`;
const vendu = `UPDATE public.inventaire SET statut = 'vendu', vinted_status = 'sold' WHERE id = ${F};`;

async function demarrer(port) {
  const { default: EmbeddedPostgres } = await import('embedded-postgres');
  const dossier = mkdtempSync(join(tmpdir(), 'fillsell-banc-p2-'));
  const base = new EmbeddedPostgres({ databaseDir: dossier, user: 'postgres', password: 'banc', port, persistent: false,
    initdbFlags: ['--encoding=UTF8', '--locale=C'], onLog: () => {}, onError: () => {} });
  await base.initialise(); await base.start();
  const c = new pg.Client({ connectionString: `postgres://postgres:banc@127.0.0.1:${port}/postgres` });
  await c.connect(); c.on('notice', () => {});
  await c.query(PRELUDE);
  await c.query(lire(INVERSE).replace(/DROP TRIGGER IF EXISTS vinted_commande_retire_nos_depots[^;]*;/, ''));   // vente_prouvee_fiche_liee de prod, à l'octet
  for (const f of CORPS) await c.query(lire(`${FIX}/${f}.sql`));
  await c.query(`CREATE TRIGGER inventaire_vendu_retire_ses_copies AFTER UPDATE OF statut, quantite ON public.inventaire FOR EACH ROW EXECUTE FUNCTION inventaire_vendu_retire_ses_copies();`);
  const arreter = async () => { await c.end().catch(() => {}); await base.stop().catch(() => {}); try { rmSync(dossier, { recursive: true, force: true }); } catch { /* temp */ } };
  return { c, arreter };
}
const md5 = async (c) => (await c.query(`SELECT md5(pg_get_functiondef(${SIG})) m`)).rows[0].m;
const retraits = async (c) => (await c.query(`SELECT platform, platform_listing_id pl, status, platform_fields pf FROM public.cross_post_jobs WHERE action = 'delete' ORDER BY created_at`)).rows;
const tour = async (c, ...sql) => { await c.query(DONNEES); for (const s of sql) await c.query(s); return retraits(c); };
const depotRetire = (r) => r.filter((d) => d.platform === 'beebs' && d.pl === '34358308' && d.status === 'pending').length === 1;
const importRetire = (r) => r.some((d) => d.platform === 'leboncoin');

async function jouer(c, prefixe, attendu) {
  const r1 = await tour(c, commande('waiting'), vendu);
  ok(depotRetire(r1) === attendu, `${prefixe} : commande « waiting » déjà là, la fiche passe « vendu » → ${attendu ? 'notre dépôt Beebs reçoit SON retrait' : 'aucun retrait (le constat du 19/11)'}`, r1);
  ok(!importRetire(r1), `${prefixe} : … jamais l'annonce IMPORTÉE (rattachée par photo, sans vente enregistrée : garde du 03/11)`, r1);
  const r2 = await tour(c, vendu, commande('waiting'));
  ok(depotRetire(r2) === attendu, `${prefixe} : fiche « vendu » d'abord, la commande arrive ensuite → ${attendu ? 'le retrait du dépôt part (déclencheur de la commande)' : 'aucun retrait'}`, r2);
  ok(!attendu || r2.find((d) => d.platform === 'beebs')?.pf?.arme_par?.chemin === 'commande_vinted_serveur', `${prefixe} : … ${attendu ? 'armé par « commande_vinted_serveur », sans délai' : '(rien à lire)'}`, r2);
  ok(!attendu || !r2.find((d) => d.platform === 'beebs')?.pf?.next_action_after, `${prefixe} : … ${attendu ? 'servi tout de suite (aucune échéance : la commande est la preuve)' : '(rien à lire)'}`, r2);
  ok(!importRetire(r2), `${prefixe} : … jamais l'annonce importée`, r2);
  const r3 = await tour(c, vendu, commande('waiting'), commande('completed'));
  ok(r3.filter((d) => d.platform === 'beebs').length === (attendu ? 1 : 0), `${prefixe} : commande « waiting » puis « completed » → jamais deux retraits`, r3);
  ok((await tour(c, vendu, commande('failed'))).length === 0, `${prefixe} : commande « failed » → aucun retrait`);
  ok((await tour(c, vendu, commande('waiting', 45))).length === 0, `${prefixe} : commande de plus de 30 jours arrivée après → aucun retrait (jamais l'historique)`);
  ok((await tour(c, `UPDATE public.inventaire SET quantite = 3 WHERE id = ${F};`, commande('waiting'), vendu)).length === 0, `${prefixe} : fiche en plusieurs exemplaires → aucun retrait`);
  ok((await tour(c, `UPDATE public.cross_post_jobs SET platform = 'vinted' WHERE id = '${J_DEPOT}';`, commande('waiting'), vendu)).length === 0, `${prefixe} : une tâche Vinted (la plateforme de la vente) → jamais retirée`);
  ok((await tour(c, vendu, `UPDATE public.inventaire SET statut = 'stock' WHERE id = ${F};`, commande('waiting'))).length === 0, `${prefixe} : fiche remise en stock → la commande ne retire rien`);
  // la vente enregistrée garde son circuit (inchangé) : une vente Vinted sur la fiche, puis la fiche « vendu »
  const r4 = await tour(c, `INSERT INTO public.ventes (user_id, inventaire_id, plateforme, created_at) VALUES ('${U}', ${F}, 'Vinted', now());`, vendu);
  ok(depotRetire(r4), `${prefixe} : vente enregistrée → le circuit d'avant retire le dépôt (inchangé)`, r4);
  const r5 = await tour(c, `INSERT INTO public.ventes (user_id, inventaire_id, plateforme, annonce_id, created_at) VALUES ('${U}', NULL, 'Vinted', '${ITEM}', now());`, vendu);
  ok(depotRetire(r5) === attendu, `${prefixe} : vente Vinted relevée SANS fiche, même numéro (14/11) → ${attendu ? 'le dépôt est retiré' : 'aucun retrait'}`, r5);
}

console.log('LES FICHIERS');
ok(existe(MIGRATION) && existe(INVERSE), 'la migration 20261119175000 et son inverse existent');
ok(existe(REPRISE) && existe(REPRISE_INVERSE), 'la reprise et son inverse existent');
const mig = existe(MIGRATION) ? lire(MIGRATION) : '';
ok(mig.includes(`'${MD5_PROD}'`), 'la migration garde le md5 de vente_prouvee_fiche_liee relu le 19/11');
ok(CORPS.every((f) => existe(`${FIX}/${f}.sql`)), 'les corps de prod du banc sont là (commentaires retirés)');
// (19/11) Aucun nom de client ÉCRIT ici, même pour le chercher (selftest:donnees-clients balaie tout le dépôt) : on vérifie
// seulement qu'aucune adresse e-mail ne traîne dans les corps du banc.
ok(CORPS.every((f) => !/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+.[a-z]{2,}/.test(lire(`${FIX}/${f}.sql`))), 'aucune adresse e-mail dans les corps du banc');

const { c, arreter } = await demarrer(59900 + Math.floor(Math.random() * 1000));
try {
  console.log('\nA. AVANT — les corps de PROD');
  ok(await md5(c) === MD5_PROD, "vente_prouvee_fiche_liee de l'inverse = la prod à l'octet");
  await jouer(c, 'avant', AVANT);
  if (!AVANT) {
    console.log('\nB. APRÈS — la migration 20261119175000');
    await c.query(mig);
    const corps = (await c.query(`SELECT pg_get_functiondef(${SIG}) d`)).rows[0].d;
    const prod = lire(INVERSE).match(/CREATE OR REPLACE FUNCTION public\.vente_prouvee_fiche_liee[\s\S]*?\n\$function\$\n/)[0];
    ok(corps.replace(/  -- ⟦19\/11 P2[\s\S]*?-- 19\/11 P2⟧\n/, '') === prod, 'hors du bloc ⟦19/11 P2⟧, vente_prouvee_fiche_liee est celle de PROD à l\'octet');
    await jouer(c, 'après', true);

    console.log('\nC. L\'INVERSE ET LA GARDE');
    await c.query(lire(INVERSE));
    ok(await md5(c) === MD5_PROD, "l'inverse rend vente_prouvee_fiche_liee à l'octet");
    ok(Number((await c.query(`SELECT count(*) n FROM pg_proc WHERE proname IN ('vente_vinted_prouvee_par_numero', 'vinted_commande_retire_nos_depots')`)).rows[0].n) === 0, "l'inverse retire les fonctions nouvelles");
    ok(Number((await c.query(`SELECT count(*) n FROM pg_trigger WHERE tgname = 'vinted_commande_retire_nos_depots'`)).rows[0].n) === 0, "l'inverse retire le déclencheur");
    await c.query(`CREATE OR REPLACE FUNCTION public.vente_prouvee_fiche_liee(p_fiche bigint, p_platform text) RETURNS boolean LANGUAGE sql AS $f$ SELECT false $f$`);
    let refus = null; try { await c.query(mig); } catch (e) { refus = e.message; await c.query('ROLLBACK').catch(() => {}); }
    ok(!!refus && /a changé en prod/.test(refus), 'la garde md5 refuse un corps qui a changé', refus);
    await c.query(lire(INVERSE)); await c.query(mig);

    console.log('\nD. LA REPRISE DU STOCK DÉJÀ LÀ (commandes lues avant la règle)');
    await c.query('ALTER TABLE public.vinted_commandes_articles DISABLE TRIGGER vinted_commande_retire_nos_depots');
    await c.query(DONNEES); await c.query(commande('needs_action')); await c.query(`SET fillsell.sans_retrait = '1'`); await c.query(vendu); await c.query(`RESET fillsell.sans_retrait`);
    await c.query('ALTER TABLE public.vinted_commandes_articles ENABLE TRIGGER vinted_commande_retire_nos_depots');
    // une autre fiche vendue SANS commande (jamais touchée) et une fiche avec une commande « failed »
    await c.query(`INSERT INTO public.inventaire (id, user_id, titre, statut, origine, quantite, vinted_item_id) VALUES
      (1794665798832099, '${U}', 'Autre (essai)', 'vendu', 'vinted_sync', 1, '10780299999'), (1794665798832098, '${U}', 'Annulée (essai)', 'vendu', 'vinted_sync', 1, '10780299998');
      INSERT INTO public.cross_post_jobs (user_id, inventaire_id, platform, status, platform_listing_id, platform_fields) VALUES
      ('${U}', 1794665798832099, 'beebs', 'published', '34358399', '{}'), ('${U}', 1794665798832098, 'beebs', 'published', '34358398', '{}');
      INSERT INTO public.vinted_commandes_articles (user_id, commande_ref, item_id, statut, commande_le) VALUES ('${U}', '24206260298', '10780299998', 'failed', now() - interval '1 day');`);
    ok((await retraits(c)).length === 0, "état d'avant la reprise : la fiche « vendu », sa commande lue, aucun retrait (le cas de prod)");
    const avant = (await c.query(`SELECT id::text, status, platform_fields FROM public.cross_post_jobs ORDER BY id`)).rows;
    await c.query(lire(REPRISE));
    const r = await retraits(c);
    ok(depotRetire(r) && r.length === 1 && r[0].pf?.arme_par?.chemin === 'reprise_1911_commande_vinted', 'la reprise arme UN retrait : notre dépôt Beebs de la fiche à la commande (chemin reprise_1911_commande_vinted)', r);
    await c.query(lire(REPRISE));
    ok((await retraits(c)).length === 1, 'la reprise rejouée ne double rien');
    ok(Number((await c.query(`SELECT count(*) n FROM public._backup_1911_vinted_numero_depots`)).rows[0].n) >= 1, 'la reprise sauvegarde les dépôts avant d\'écrire');
    await c.query(lire(REPRISE_INVERSE));
    ok((await retraits(c)).every((d) => d.status === 'cancelled'), "l'inverse annule le retrait pas encore commencé");
    const apres = (await c.query(`SELECT id::text, status, platform_fields FROM public.cross_post_jobs WHERE action <> 'delete' ORDER BY id`)).rows;
    ok(JSON.stringify(apres) === JSON.stringify(avant), "… et rend aux dépôts leurs champs d'avant", apres);
  }
} finally {
  await arreter();
}
console.log(`\n${n - ko}/${n} ${ko ? `— ${ko} ROUGE(S)` : '— VERT'}`);
process.exit(ko ? 1 : 0);
