// ═══════════════════════════════════════════════════════════════════════════
// VERROU — UNE ANNONCE RATTACHÉE À UN ARTICLE DÉJÀ VENDU N'EST JAMAIS UN SUIVI SILENCIEUX (19/11/2026, terminal t5)
//   npm run selftest:groupe-sur-fiche-vendue           (le verrou : vert avec la migration 20261119150000)
//   node scripts/groupe-sur-fiche-vendue-selftest.mjs --avant   (la règle attendue jouée sur le corps de PROD : ROUGE)
// ═══════════════════════════════════════════════════════════════════════════
// Le cas réel (compte ee6173b8, relu en prod le 19/11, lecture seule ; identifiants d'essai, aucun texte de la personne) :
// la fiche 1793436393772, import Leboncoin, vendue sur Leboncoin le 01/11 (annonce 2107613165, transaction « sold »,
// encore affichée) ; le relevé eBay du 16/11 lit 146078532793 aux mêmes photos ; la passe de 11:29 en fait un GROUPE
// (l'annonce Leboncoin vendue + l'eBay), rapprochement_v3_appliquer prend la fiche VENDUE pour pivot et y rattache
// l'eBay : la tâche de suivi reste « published » — ni retrait, ni question, ni ligne « À régler ». En silence.
// Ce verrou prouve, sur un Postgres JETABLE (embedded-postgres, jamais la prod), avec le corps de PROD à l'octet (l'inverse) :
//   A. AVANT (prod) : branches « groupe » et « à vérifier » vers une fiche vendue → suivi « published », aucune marque
//      (le constat) ; la branche « attacher » (07/10) marque déjà « vendu, encore en ligne » ;
//   B. APRÈS (migration) : les trois branches marquent « vendu, encore en ligne » (annulé + pending_removal + marque), que
//      l'app montre dans « À régler » (« Retirer » / « Plus tard ») ; jamais une tâche de retrait créée ; jamais une fiche en
//      stock touchée ; jamais un dépôt FillSell ; le reste du plan inchangé ;
//   C. l'INVERSE rend la prod à l'octet ; la garde md5 de la migration refuse un corps changé ;
//   D. le script de reprise (scripts/reparations/20261119_groupe_sur_fiche_vendue.sql) ne touche QUE le cas du constat,
//      sauvegarde d'abord, et son inverse rend l'état d'avant ;
//   E. l'app lit bien ces suivis (App.jsx : cancelled + pending_removal, hors « Plus tard ») — la personne les voit.
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
const MIGRATION = 'supabase/migrations/20261119150000_groupe_sur_fiche_vendue.sql';
const INVERSE = 'supabase/rollbacks/20261119150000_groupe_sur_fiche_vendue_INVERSE.sql';
const REPRISE = 'scripts/reparations/20261119_groupe_sur_fiche_vendue.sql';
const REPRISE_INVERSE = 'scripts/reparations/20261119_groupe_sur_fiche_vendue_INVERSE.sql';
const MD5_PROD = '23f59fbe54c71bf8591b4627ab7d81cc';
const SIG = "'public.rapprochement_v3_appliquer(uuid,jsonb,text,boolean)'::regprocedure";

let ko = 0, n = 0;
const ok = (c, m, d) => { n++; if (c) console.log(`  ✓ ${m}`); else { ko++; console.log(`  ✗ ${m}${d === undefined ? '' : `\n      ← ${JSON.stringify(d).slice(0, 700)}`}`); } };

// ── Le décor (identifiants d'essai ; le compte : un uuid d'essai à son id8) ──
const U = 'ee6173b8-0000-4000-8000-000000000001';
const F_VENDUE = '1793436393772';            // import Leboncoin vendu sur Leboncoin le 01/11
const F_STOCK = '1793436394490';             // autre import Leboncoin, en stock (le même modèle, une autre taille)
const A_LBC_VENDUE = 'a0000000-0000-4000-8000-000000000001';   // Leboncoin 2107613165, transaction « sold », rattachée à F_VENDUE
const A_LBC_STOCK = 'a0000000-0000-4000-8000-000000000002';    // Leboncoin 2107852206, rattachée à F_STOCK
const A_EBAY = 'a0000000-0000-4000-8000-000000000003';         // eBay 146078532793, relevée le 16/11, sans fiche
const A_EBAY2 = 'a0000000-0000-4000-8000-000000000004';        // eBay 146078528853, relevée le 16/11, sans fiche
const A_BEEBS = 'a0000000-0000-4000-8000-000000000005';        // une Beebs sans fiche (la branche « attacher »)
const J_LBC_VENDUE = 'b0000000-0000-4000-8000-000000000001';
const J_LBC_STOCK = 'b0000000-0000-4000-8000-000000000002';
const J_DEPOT = 'b0000000-0000-4000-8000-000000000009';         // un dépôt FillSell (source ≠ releve) sur la fiche vendue

const PRELUDE = String.raw`
DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE service_role NOLOGIN BYPASSRLS; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE TABLE public.inventaire (id bigint PRIMARY KEY, user_id uuid NOT NULL, titre text, statut text DEFAULT 'stock', origine text,
  fusionne_dans bigint, quantite integer DEFAULT 1, a_verifier jsonb, plateforme text, created_at timestamptz DEFAULT now());
CREATE TABLE public.annonces_plateforme (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, platform text NOT NULL,
  listing_id text, url text, titre text, prix numeric, inventaire_id bigint, job_id uuid, source_rapprochement text, proposition jsonb,
  ignoree_le timestamptz, disparu_le timestamptz, retiree_le timestamptz, fiche_supprimee_le timestamptz, statut_plateforme text DEFAULT 'en_ligne',
  run_id uuid, created_at timestamptz DEFAULT now(), updated_at timestamptz);
CREATE TABLE public.cross_post_jobs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, inventaire_id bigint,
  platform text NOT NULL, status text NOT NULL, action text DEFAULT 'publish', title text, price numeric, listing_url text,
  platform_listing_id text, platform_fields jsonb, error text, published_at timestamptz, created_at timestamptz DEFAULT now(),
  reservation_id uuid, reservation_settled_at timestamptz);
CREATE TABLE public.inventaire_doublons (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, garde bigint, absorbe bigint,
  niveau text, statut text, motif text, preuves jsonb, source text, fusion_id uuid, decide_le timestamptz, decide_par text, created_at timestamptz DEFAULT now());
CREATE TABLE public.rapprochements (id bigserial PRIMARY KEY, user_id uuid, annonce_id uuid, inventaire_id bigint, decision text, par text,
  score numeric, detail jsonb, created_at timestamptz DEFAULT now());
CREATE TABLE public.ventes (id bigserial PRIMARY KEY, user_id uuid, inventaire_id bigint, plateforme text, plateforme_code text, statut text,
  vendu_le timestamptz, created_at timestamptz DEFAULT now());
CREATE TABLE public.usage_logs (id bigserial PRIMARY KEY, user_id uuid, feature text, metadata jsonb, created_at timestamptz DEFAULT now());
-- ── bouchons (hors de ce qui est jugé : le circuit de prod, réduit à ce que les branches lisent) ──
CREATE FUNCTION public.opla_sortie_passee() RETURNS boolean LANGUAGE sql AS $f$ SELECT true $f$;
CREATE FUNCTION public.rapprochement_v3_soeur_republication(uuid, bigint) RETURNS uuid LANGUAGE sql AS $f$ SELECT NULL::uuid $f$;
CREATE FUNCTION public.rapprochement_v3_marquer(uuid, bigint, text, bigint, uuid, text) RETURNS void LANGUAGE sql AS $f$ SELECT $f$;
CREATE FUNCTION public.releve_poser_question(p_user uuid, p_garde bigint, p_absorbe bigint, p_motif text, p_preuves jsonb) RETURNS boolean
  LANGUAGE sql AS $f$ INSERT INTO public.inventaire_doublons (user_id, garde, absorbe, niveau, statut, motif, preuves, source)
  VALUES (p_user, p_garde, p_absorbe, 'probable', 'proposee', p_motif, p_preuves, 'releve') RETURNING true $f$;
-- rapprochement_v3_fiche_de : la fiche de l'annonce, ou une fiche « releve_* » neuve (import) — comme rapprocher_importer
CREATE FUNCTION public.rapprochement_v3_fiche_de(p_user uuid, p_annonce uuid, p_geste boolean) RETURNS bigint LANGUAGE plpgsql AS $f$
DECLARE a public.annonces_plateforme%ROWTYPE; v bigint; j uuid;
BEGIN
  SELECT * INTO a FROM public.annonces_plateforme WHERE id = p_annonce AND user_id = p_user;
  IF a.id IS NULL THEN RETURN NULL; END IF;
  IF a.inventaire_id IS NOT NULL THEN RETURN a.inventaire_id; END IF;
  v := (SELECT COALESCE(max(id), 1794824976000) + 1 FROM public.inventaire);
  INSERT INTO public.inventaire (id, user_id, titre, statut, origine) VALUES (v, p_user, a.titre, 'stock', 'releve_' || a.platform);
  INSERT INTO public.cross_post_jobs (user_id, inventaire_id, platform, status, platform_listing_id, platform_fields)
  VALUES (p_user, v, a.platform, 'published', a.listing_id, jsonb_build_object('source', 'releve', 'rattachement', jsonb_build_object('import', true))) RETURNING id INTO j;
  UPDATE public.annonces_plateforme SET inventaire_id = v, job_id = j WHERE id = a.id;
  RETURN v;
END $f$;
-- rapprochement_attacher : le circuit de prod (rapprocher_job_de_suivi) — une tâche de SUIVI « published », source releve,
-- la marque rattachement (par « auto », le motif, le détail), l'annonce rattachée à la fiche
CREATE FUNCTION public.rapprochement_attacher(p_annonce uuid, p_inv bigint, p_motif text, p_detail jsonb DEFAULT '{}'::jsonb) RETURNS uuid
  LANGUAGE plpgsql AS $f$
DECLARE a public.annonces_plateforme%ROWTYPE; v_job uuid;
BEGIN
  SELECT * INTO a FROM public.annonces_plateforme WHERE id = p_annonce FOR UPDATE;
  IF a.id IS NULL OR a.inventaire_id IS NOT NULL OR a.ignoree_le IS NOT NULL THEN RETURN NULL; END IF;
  INSERT INTO public.cross_post_jobs (user_id, inventaire_id, platform, status, title, platform_listing_id, listing_url, platform_fields, published_at)
  VALUES (a.user_id, p_inv, a.platform, 'published', a.titre, a.listing_id, a.url,
          jsonb_build_object('source', 'releve', 'rattachement', jsonb_build_object('annonce_id', a.id, 'motif', p_motif, 'par', 'auto', 'at', now())
                                                                  || COALESCE(p_detail, '{}'::jsonb)), now())
  RETURNING id INTO v_job;
  UPDATE public.annonces_plateforme SET inventaire_id = p_inv, job_id = v_job, source_rapprochement = 'automatique', updated_at = now() WHERE id = a.id;
  RETURN v_job;
END $f$;
`;

const DONNEES = `
TRUNCATE public.inventaire, public.annonces_plateforme, public.cross_post_jobs, public.inventaire_doublons, public.rapprochements,
  public.ventes, public.usage_logs;
INSERT INTO public.inventaire (id, user_id, titre, statut, origine, quantite, plateforme) VALUES
  (${F_VENDUE}, '${U}', 'Escarpins (essai) taille 39', 'vendu', 'releve_leboncoin', 0, NULL),
  (${F_STOCK}, '${U}', 'Escarpins (essai) taille 38', 'stock', 'releve_leboncoin', 1, NULL);
INSERT INTO public.ventes (user_id, inventaire_id, plateforme, statut, created_at) VALUES
  ('${U}', ${F_VENDUE}, 'Leboncoin', NULL, '2026-11-01 16:09:00+00');
INSERT INTO public.cross_post_jobs (id, user_id, inventaire_id, platform, status, action, platform_listing_id, platform_fields, created_at) VALUES
  ('${J_LBC_VENDUE}', '${U}', ${F_VENDUE}, 'leboncoin', 'sold', 'publish', '2107613165', '{"source": "releve", "sale_signal": "sold"}', '2026-10-31 08:46:00+00'),
  ('${J_LBC_STOCK}', '${U}', ${F_STOCK}, 'leboncoin', 'published', 'publish', '2107852206', '{"source": "releve"}', '2026-10-31 08:46:00+00');
INSERT INTO public.annonces_plateforme (id, user_id, platform, listing_id, url, titre, inventaire_id, job_id, source_rapprochement, statut_plateforme, created_at) VALUES
  ('${A_LBC_VENDUE}', '${U}', 'leboncoin', '2107613165', NULL, 'Escarpins (essai)', ${F_VENDUE}, '${J_LBC_VENDUE}', 'automatique', 'en_ligne', '2026-10-31 08:42:00+00'),
  ('${A_LBC_STOCK}', '${U}', 'leboncoin', '2107852206', NULL, 'Escarpins (essai) 38', ${F_STOCK}, '${J_LBC_STOCK}', 'automatique', 'en_ligne', '2026-10-31 08:42:00+00'),
  ('${A_EBAY}', '${U}', 'ebay', '146078532793', 'https://www.ebay.fr/itm/146078532793', 'Escarpins (essai) Taille 39', NULL, NULL, NULL, 'en_ligne', '2026-11-16 10:26:00+00'),
  ('${A_EBAY2}', '${U}', 'ebay', '146078528853', 'https://www.ebay.fr/itm/146078528853', 'Escarpins (essai) Taille 38', NULL, NULL, NULL, 'en_ligne', '2026-11-16 10:26:00+00'),
  ('${A_BEEBS}', '${U}', 'beebs', '34000001', 'https://www.beebs.app/fr/p/34000001', 'Escarpins (essai)', NULL, NULL, NULL, 'en_ligne', '2026-11-16 10:26:00+00');
`;

async function demarrer(port) {
  const { default: EmbeddedPostgres } = await import('embedded-postgres');
  const dossier = mkdtempSync(join(tmpdir(), 'fillsell-banc-groupe-vendu-'));
  const base = new EmbeddedPostgres({ databaseDir: dossier, user: 'postgres', password: 'banc', port, persistent: false,
    initdbFlags: ['--encoding=UTF8', '--locale=C'], onLog: () => {}, onError: () => {} });
  await base.initialise(); await base.start();
  const c = new pg.Client({ connectionString: `postgres://postgres:banc@127.0.0.1:${port}/postgres` });
  await c.connect(); c.on('notice', () => {});
  await c.query(PRELUDE);
  await c.query(lire(INVERSE));    // le corps de PROD à l'octet
  const arreter = async () => { await c.end().catch(() => {}); await base.stop().catch(() => {}); try { rmSync(dossier, { recursive: true, force: true }); } catch { /* temp */ } };
  return { c, arreter };
}
const md5 = async (c) => (await c.query(`SELECT md5(pg_get_functiondef(${SIG})) m`)).rows[0].m;
const appliquer = async (c, decisions) => (await c.query('SELECT public.rapprochement_v3_appliquer($1::uuid, $2::jsonb, $3, false) r',
  [U, JSON.stringify(decisions), 'normal'])).rows[0].r;
const suiviDe = async (c, annonce) => (await c.query(
  `SELECT j.id::text, j.status, j.inventaire_id::text fiche, j.platform_fields pf FROM public.cross_post_jobs j
     JOIN public.annonces_plateforme a ON a.job_id = j.id WHERE a.id = $1`, [annonce])).rows[0] ?? null;
const retraits = async (c) => Number((await c.query(`SELECT count(*) n FROM public.cross_post_jobs WHERE action = 'delete'`)).rows[0].n);
const marque = (s) => !!s && s.status === 'cancelled' && s.pf?.pending_removal === true && !!s.pf?.vendu_encore_en_ligne;

const GROUPE = [{ type: 'groupe', annonces: [A_LBC_VENDUE, A_EBAY] }];
const GROUPE_STOCK = [{ type: 'groupe', annonces: [A_LBC_STOCK, A_EBAY2] }];
const A_VERIFIER = [{ type: 'a_verifier', annonces: [A_LBC_VENDUE, A_EBAY], candidat: { fiche: F_STOCK }, motif: 'photo_proche' }];
const ATTACHER = [{ type: 'attacher', annonce: A_BEEBS, fiche: F_VENDUE }];

/** Un tour : l'état neuf, le plan appliqué, ce que la passe a laissé. */
async function tour(c, plan, extra = '') {
  await c.query(DONNEES); if (extra) await c.query(extra);
  const r = await appliquer(c, plan);
  return { r, ebay: await suiviDe(c, A_EBAY), ebay2: await suiviDe(c, A_EBAY2), beebs: await suiviDe(c, A_BEEBS), retraits: await retraits(c) };
}

/** Les attentes de la RÈGLE (vraies après la migration) ; « attendu » = ce que la branche doit faire sur ce corps. */
async function jouer(c, prefixe, attendu) {
  const g = await tour(c, GROUPE);
  ok(g.ebay?.fiche === F_VENDUE, `${prefixe} : groupe (Leboncoin vendue + eBay) → l'eBay rejoint la fiche du groupe (le pivot, inchangé)`, g);
  ok(marque(g.ebay) === attendu, `${prefixe} : … pivot VENDU → ${attendu ? 'le suivi eBay part « vendu, encore en ligne » (annulé + pending_removal + marque)' : 'le suivi eBay reste « published » en silence (le constat du 16/11)'}`, g.ebay);
  ok(!attendu || g.ebay?.pf?.vendu_encore_en_ligne?.branche === 'groupe', `${prefixe} : … ${attendu ? 'la marque nomme la branche « groupe »' : '(aucune marque à lire)'}`, g.ebay?.pf);
  ok(g.retraits === 0, `${prefixe} : … JAMAIS une tâche de retrait (un rattachement ne déclenche jamais de retrait, 03/11)`, g.retraits);
  ok((g.r?.erreurs ?? []).length === 0, `${prefixe} : … aucune erreur de la passe`, g.r);

  const s = await tour(c, GROUPE_STOCK);
  ok(s.ebay2?.fiche === F_STOCK && s.ebay2?.status === 'published' && !s.ebay2?.pf?.vendu_encore_en_ligne && !s.ebay2?.pf?.pending_removal,
    `${prefixe} : groupe vers une fiche EN STOCK → suivi « published », aucune marque (inchangé)`, s.ebay2);

  const v = await tour(c, A_VERIFIER);
  ok(v.ebay?.fiche === F_VENDUE, `${prefixe} : à vérifier (pivot vendu) → l'eBay rejoint la fiche du groupe, la question est posée`, v);
  ok(marque(v.ebay) === attendu, `${prefixe} : … pivot VENDU → ${attendu ? 'le suivi eBay part « vendu, encore en ligne »' : 'le suivi eBay reste « published » en silence'}`, v.ebay);
  ok(v.retraits === 0, `${prefixe} : … jamais une tâche de retrait`, v.retraits);

  const a = await tour(c, ATTACHER);
  ok(marque(a.beebs), `${prefixe} : attacher vers une fiche vendue → « vendu, encore en ligne » (règle du 07/10, inchangée)`, a.beebs);
  ok(a.retraits === 0, `${prefixe} : … jamais une tâche de retrait`, a.retraits);

  // la fiche vendue porte un dépôt FillSell (source ≠ releve) : jamais touché par la règle
  await c.query(DONNEES);
  await c.query(`INSERT INTO public.cross_post_jobs (id, user_id, inventaire_id, platform, status, platform_listing_id, platform_fields)
                 VALUES ('${J_DEPOT}', '${U}', ${F_VENDUE}, 'beebs', 'published', '34000099', '{}')`);
  const avantDepot = (await c.query(`SELECT status, platform_fields FROM public.cross_post_jobs WHERE id = '${J_DEPOT}'`)).rows[0];
  const aLaRegle = Number((await c.query(`SELECT count(*) n FROM pg_proc WHERE proname = 'rapprochement_v3_vendu_encore_en_ligne'`)).rows[0].n) > 0;
  ok(aLaRegle === attendu, `${prefixe} : la règle « vendu, encore en ligne » ${attendu ? 'existe en base (une seule fois écrite)' : "n'existe pas encore"}`);
  if (aLaRegle) {
    const r = (await c.query(`SELECT public.rapprochement_v3_vendu_encore_en_ligne('${U}', '${J_DEPOT}', ${F_VENDUE}, NULL, 'banc') r`)).rows[0].r;
    ok(r === false, `${prefixe} : un DÉPÔT FillSell sur la fiche vendue n'est jamais marqué par la règle`, r);
    const r2 = (await c.query(`SELECT public.rapprochement_v3_vendu_encore_en_ligne('${U}', '${J_LBC_STOCK}', ${F_STOCK}, NULL, 'banc') r`)).rows[0].r;
    ok(r2 === false, `${prefixe} : un suivi d'une fiche EN STOCK n'est jamais marqué`, r2);
  }
  const apresDepot = (await c.query(`SELECT status, platform_fields FROM public.cross_post_jobs WHERE id = '${J_DEPOT}'`)).rows[0];
  ok(JSON.stringify(apresDepot) === JSON.stringify(avantDepot), `${prefixe} : le dépôt FillSell reste intact`, apresDepot);
}

console.log('E. L\'APP MONTRE CES SUIVIS (« À régler » : Vendu, encore en ligne — Retirer / Plus tard)');
const app = lire('src/App.jsx');
const iApp = app.indexOf(".contains('platform_fields',{pending_removal:true})");
ok(iApp > 0 && app.slice(iApp - 400, iApp).includes(".eq('status','cancelled')") && app.slice(iApp - 400, iApp).includes("in('action',['publish','republish'])"),
  'App.jsx lit les suivis annulés + pending_removal (publish/republish) — la ligne de la personne');
ok(lire('src/utils/retraitsBloques.js').includes('pending_removal'), 'retraitsBloques.js range ces annonces « à retirer avec ton accord » (À régler)');

console.log('\nLES FICHIERS');
ok(existe(MIGRATION), 'la migration 20261119150000 existe');
ok(existe(INVERSE), "l'inverse existe (le corps de prod à l'octet)");
ok(existe(REPRISE) && existe(REPRISE_INVERSE), 'le script de reprise et son inverse existent');
const mig = existe(MIGRATION) ? lire(MIGRATION) : '';
ok(mig.includes(`'${MD5_PROD}'`), 'la migration garde le md5 du corps de prod relu le 19/11');

const { c, arreter } = await demarrer(58600 + Math.floor(Math.random() * 1200));
try {
  console.log('\nA. AVANT — le corps de PROD (l\'inverse)');
  ok(await md5(c) === MD5_PROD, "l'inverse rend le corps de prod à l'octet (md5 23f59fbe…)");
  if (AVANT) {
    console.log('   (--avant : la RÈGLE attendue jouée sur le corps de prod — rouge attendu)');
    await jouer(c, 'avant', true);
  } else {
    await jouer(c, 'avant', false);
  }

  if (!AVANT) {
    console.log('\nB. APRÈS — la migration 20261119150000');
    await c.query(mig);
    ok(await md5(c) !== MD5_PROD, 'la migration a remplacé le corps');
    const corps = (await c.query(`SELECT pg_get_functiondef(${SIG}) d`)).rows[0].d;
    const prod = lire(INVERSE).match(/CREATE OR REPLACE FUNCTION public\.rapprochement_v3_appliquer[\s\S]*?\n\$function\$\n/)[0];
    const sansBlocs = corps.replace(/\n[ ]*-- ⟦19\/11[\s\S]*?-- 19\/11⟧/g, '');
    ok(sansBlocs.replace(/\s+$/, '') === prod.replace(/\s+$/, ''), 'hors des blocs ⟦19/11⟧, le corps est celui de PROD à l\'octet (aucune ligne modifiée ni retirée)');
    await jouer(c, 'après', true);

    console.log('\nC. L\'INVERSE ET LA GARDE');
    await c.query(lire(INVERSE));
    ok(await md5(c) === MD5_PROD, "l'inverse rend la prod à l'octet");
    ok(Number((await c.query(`SELECT count(*) n FROM pg_proc WHERE proname = 'rapprochement_v3_vendu_encore_en_ligne'`)).rows[0].n) === 0, "l'inverse retire la fonction nouvelle");
    await c.query(`CREATE OR REPLACE FUNCTION public.rapprochement_v3_appliquer(p_user uuid, p_decisions jsonb, p_mode text DEFAULT 'normal'::text, p_geste boolean DEFAULT false)
      RETURNS jsonb LANGUAGE sql AS $f$ SELECT '{}'::jsonb $f$`);
    let refus = null; try { await c.query(mig); } catch (e) { refus = e.message; await c.query('ROLLBACK').catch(() => {}); }
    ok(!!refus && /a changé en prod/.test(refus), 'la garde md5 refuse un corps qui a changé (jamais forcer)', refus);
    await c.query(lire(INVERSE));
    await c.query(mig);

    console.log('\nD. LA REPRISE DU CAS DÉJÀ LÀ (le même geste, script séparé, sur feu vert)');
    // l'état de prod du 19/11 : l'eBay rattaché par « groupe » à la fiche vendue, suivi « published » ; à côté, un suivi
    // « groupe » vers une fiche en stock, et un suivi rattaché AVANT la vente (jamais repris)
    await c.query(DONNEES);
    await c.query(`
      INSERT INTO public.cross_post_jobs (id, user_id, inventaire_id, platform, status, platform_listing_id, platform_fields) VALUES
        ('c0000000-0000-4000-8000-000000000001', '${U}', ${F_VENDUE}, 'ebay', 'published', '146078532793',
         '{"source": "releve", "rattachement": {"annonce_id": "${A_EBAY}", "at": "2026-11-16T10:29:35+00:00", "groupe_creation": true, "mode": "normal", "motif": "photo_identique", "par": "auto", "regle": "rapprochement_v3"}}'),
        ('c0000000-0000-4000-8000-000000000002', '${U}', ${F_STOCK}, 'ebay', 'published', '146078528853',
         '{"source": "releve", "rattachement": {"annonce_id": "${A_EBAY2}", "at": "2026-11-16T10:29:35+00:00", "groupe_creation": true, "mode": "normal", "motif": "photo_identique", "par": "auto", "regle": "rapprochement_v3"}}'),
        ('c0000000-0000-4000-8000-000000000003', '${U}', ${F_VENDUE}, 'beebs', 'published', '34000001',
         '{"source": "releve", "rattachement": {"annonce_id": "${A_BEEBS}", "at": "2026-10-31T10:00:00+00:00", "groupe_creation": true, "mode": "normal", "motif": "photo_identique", "par": "auto", "regle": "rapprochement_v3"}}');
      UPDATE public.annonces_plateforme SET inventaire_id = ${F_VENDUE}, job_id = 'c0000000-0000-4000-8000-000000000001' WHERE id = '${A_EBAY}';
      UPDATE public.annonces_plateforme SET inventaire_id = ${F_STOCK}, job_id = 'c0000000-0000-4000-8000-000000000002' WHERE id = '${A_EBAY2}';
      UPDATE public.annonces_plateforme SET inventaire_id = ${F_VENDUE}, job_id = 'c0000000-0000-4000-8000-000000000003' WHERE id = '${A_BEEBS}';`);
    const avant = (await c.query(`SELECT id::text, status, platform_fields FROM public.cross_post_jobs ORDER BY id`)).rows;
    await c.query(lire(REPRISE));
    const cas = await suiviDe(c, A_EBAY);
    ok(marque(cas) && cas.pf.vendu_encore_en_ligne.branche === 'reprise_1911', 'la reprise marque le cas du constat « vendu, encore en ligne » (branche reprise_1911)', cas);
    const autres = (await c.query(`SELECT id::text, status, platform_fields FROM public.cross_post_jobs WHERE id <> '${cas.id}' ORDER BY id`)).rows;
    ok(JSON.stringify(autres) === JSON.stringify(avant.filter((r) => r.id !== cas.id)),
      'la reprise ne touche RIEN d\'autre (fiche en stock, suivi rattaché avant la vente, dépôts)', autres);
    ok(await retraits(c) === 0, 'la reprise ne crée aucune tâche de retrait');
    ok(Number((await c.query(`SELECT count(*) n FROM public._backup_1911_groupe_vendu_jobs`)).rows[0].n) === 1, 'la reprise sauvegarde la ligne avant de l\'écrire');
    await c.query(lire(REPRISE));
    ok(Number((await c.query(`SELECT count(*) n FROM public._backup_1911_groupe_vendu_jobs`)).rows[0].n) === 1, 'la reprise rejouée ne fait rien de plus (idempotente)');
    await c.query(lire(REPRISE_INVERSE));
    const rendu = (await c.query(`SELECT id::text, status, platform_fields FROM public.cross_post_jobs ORDER BY id`)).rows;
    ok(JSON.stringify(rendu) === JSON.stringify(avant), "l'inverse de la reprise rend l'état d'avant à l'identique", rendu);
  }
} finally {
  await arreter();
}

console.log(`\n${n - ko}/${n} ${ko ? `— ${ko} ROUGE(S)` : '— VERT'}`);
process.exit(ko ? 1 : 0);
