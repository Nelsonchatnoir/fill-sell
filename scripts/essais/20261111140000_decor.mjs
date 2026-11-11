// LE DÉCOR ET LES CAS du retrait « partout » entre comptes reliés (11/11/2026, L1) — partagés par le verrou
// (scripts/retrait-partout-fiche-liee-selftest.mjs) et par le banc (scripts/essais/20261111140000_banc.mjs).
// ⛔ Base JETABLE seulement (embedded-postgres sur le poste) : rien ici ne parle à la prod.
//
// Le décor = le catalogue de PROD réduit à la chaîne (fixtures/prod-1111-retrait-fiche-liee/catalogue.json, relu en prod
// le 11/11) : 197 fonctions de prod (corps sans leurs commentaires : aucune donnée client versionnée — md5_prod garde
// l'empreinte de prod), 35 tables aux colonnes de prod, TOUS les déclencheurs de prod de `inventaire`, de
// `cross_post_jobs` et de `inventaire_doublons`, la RLS et les droits de prod des tables de la chaîne.
// Les gestes sont joués comme l'app : rôle `authenticated`, identité de la personne (request.jwt.claims), sous RLS, avec
// les délais de prod d'une requête de l'API (statement_timeout et lock_timeout 8 s). Valeurs d'essai inventées seulement.
import pg from 'pg';
import { readFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const lire = (p) => readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');
export const existe = (p) => existsSync(join(ROOT, p));
export const FIXTURE = 'scripts/essais/fixtures/prod-1111-retrait-fiche-liee/catalogue.json';
export const MIGRATION = 'supabase/migrations/20261111140000_retrait_partout_fiche_liee.sql';
export const INVERSE = 'supabase/rollbacks/20261111140000_retrait_partout_fiche_liee_INVERSE.sql';
// Jamais réécrites par la migration : la vente entre comptes reliés, ses preuves, le filet de la suppression.
export const INTACTES = [
  'armer_retraits_copies(p_inventaire_id bigint, p_chemin text, p_sauf_job uuid, p_sauf_plateforme text, p_delai interval)',
  'armer_retrait_job(p_job_id uuid, p_chemin text, p_delai interval)',
  'armer_retrait_job_pour(p_job_id uuid, p_chemin text, p_delai interval, p_preuve_geste boolean)',
  'inventaire_vente_fiche_liee()', 'inventaire_vendu_retire_ses_copies()', 'vente_prouvee_fiche_liee(p_fiche bigint, p_platform text)',
  'inventaire_arme_retraits_avant_suppression()', 'retrait_job_prouve(p_job uuid)', 'rattachement_confirme(p_job uuid)',
  'fiche_annonces_vivantes(p_inventaire bigint, p_platform text)', 'comptes_sont_lies(p_a uuid, p_b uuid)',
  'listing_designe(p_listing text, p_url text, p_pid text)', 'inventaire_supprimer_sans_retrait(p_inventaire bigint)',
  'remises_en_vente_tick(p_limite integer, p_user uuid)', 'republish_planifiee_candidats(p_user uuid, p_reglage jsonb, p_platform text)',
  'controler_job_extension(p_user uuid, p_poste text, p_job uuid, p_statut text)',
  // la question de la vente et sa réponse : le mécanisme repris pour la copie au titre seul, jamais réécrit
  'poser_questions_copies_non_prouvees(p_inventaire_id bigint, p_sauf_job uuid, p_sauf_plateforme text, p_source text)',
  'inventaire_doublon_decider(p_id uuid, p_decision text, p_annonce_montree uuid)',
  'inventaire_doublon_decider_corps(p_user uuid, p_id uuid, p_decision text, p_annonce_montree uuid)',
  'boutique_partagee_compte_relie(p_user uuid, p_autre uuid, p_platform text)',
];
// Ce que la migration AJOUTE (et que l'inverse retire) : six fonctions, une table, un déclencheur.
export const NEUVES = ['public.copies_fiche_liee(uuid,bigint)', 'public.annonce_en_retrait_compte_relie(uuid)',
  'public.armer_retrait_copie_reliee(uuid,text,text,jsonb)', 'public.armer_retraits_fiche_liee(uuid,bigint,text)',
  'public.inventaire_arme_retraits_fiche_liee()', 'public.copie_retrait_partout_repondre(uuid,text,uuid)'];
export const TABLE_NEUVE = 'jumelles_retirees_partout';
// Les plateformes dont la boutique est PARTAGÉE entre A et B dans le décor (sync_import_ecartes « compte_relie:… », ce
// que lit boutique_partagee_compte_relie de prod) : la portée de la traversée. eBay et Vinted ne le sont pas.
export const PARTAGEES = ['leboncoin', 'beebs', 'depop', 'opla'];

// ── La base jetable ─────────────────────────────────────────────────────────────────────────────────────────────────
export async function demarrerBase({ port, nom = 'fillsell-retrait-fiche-liee-' }) {
  const { default: EmbeddedPostgres } = await import('embedded-postgres');
  const dossier = mkdtempSync(join(tmpdir(), nom));
  const base = new EmbeddedPostgres({ databaseDir: dossier, user: 'postgres', password: 'banc', port, persistent: false,
    initdbFlags: ['--encoding=UTF8', '--locale=C'], onLog: () => {}, onError: () => {} });
  await base.initialise();
  await base.start();
  const url = `postgres://postgres:banc@127.0.0.1:${port}/postgres`;
  const arreter = async () => { await base.stop().catch(() => {}); try { rmSync(dossier, { recursive: true, force: true }); } catch { /* dossier temporaire */ } };
  return { url, arreter };
}
export async function ouvrir(url) {
  if (/supabase\.(co|com)|pooler/.test(url)) throw new Error('base refusée : jamais la prod, une base JETABLE seulement');
  const c = new pg.Client({ connectionString: url });
  await c.connect();
  c.on('notice', () => {});
  return c;
}

const PRELUDE = String.raw`
DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE service_role NOLOGIN BYPASSRLS; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticator NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE supabase_admin NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE SCHEMA IF NOT EXISTS extensions; CREATE SCHEMA auth; CREATE SCHEMA net; CREATE SCHEMA vault; CREATE SCHEMA cron;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE TABLE auth.users (id uuid PRIMARY KEY, email text, created_at timestamptz DEFAULT now(), raw_user_meta_data jsonb DEFAULT '{}');
-- Les définitions de PROD (pg_get_functiondef, lues le 11/11) : l'identité de la session.
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $f$
  select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''),
                  (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'))::uuid $f$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $f$
  select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''),
                  (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'))::text $f$;
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $f$
  select coalesce(nullif(current_setting('request.jwt.claim', true), ''), nullif(current_setting('request.jwt.claims', true), ''))::jsonb $f$;
CREATE FUNCTION auth.email() RETURNS text LANGUAGE sql STABLE AS $f$
  select coalesce(nullif(current_setting('request.jwt.claim.email', true), ''),
                  (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email'))::text $f$;
CREATE TABLE net._appels (id bigserial PRIMARY KEY, url text, body jsonb, headers jsonb, le timestamptz DEFAULT clock_timestamp());
CREATE FUNCTION net.http_post(url text, body jsonb DEFAULT '{}'::jsonb, params jsonb DEFAULT '{}'::jsonb,
  headers jsonb DEFAULT '{"Content-Type": "application/json"}'::jsonb, timeout_milliseconds integer DEFAULT 5000) RETURNS bigint
  LANGUAGE sql AS $f$ INSERT INTO net._appels (url, body, headers) VALUES (url, body, headers) RETURNING id $f$;
CREATE TABLE vault.secrets (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text, secret text);
CREATE VIEW vault.decrypted_secrets AS SELECT s.*, s.secret AS decrypted_secret FROM vault.secrets s;
GRANT USAGE ON SCHEMA public, auth, extensions TO anon, authenticated, service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA auth TO anon, authenticated, service_role;
-- Les droits par défaut de PROD pour une fonction née dans public : postgres, authenticated, service_role (lu le 11/11).
ALTER DEFAULT PRIVILEGES FOR ROLE postgres REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO authenticated, service_role;
`;
const id = (s) => `"${String(s).replace(/"/g, '""')}"`;
const DROITS = { a: 'INSERT', r: 'SELECT', w: 'UPDATE', d: 'DELETE', D: 'TRUNCATE', x: 'REFERENCES', t: 'TRIGGER' };

/** Construit le schéma public de prod réduit à la chaîne. Rend ce qui a été créé et ce qui a été refusé. */
export async function construireDecor(c, fixture = JSON.parse(lire(FIXTURE))) {
  const echecs = [];
  const essayer = async (sql, quoi) => { try { await c.query(sql); return true; } catch (e) { echecs.push(`${quoi} : ${e.message}`); return false; } };
  await c.query(PRELUDE);
  await c.query('SET search_path = public, extensions');
  for (const s of fixture.sequences) await essayer(`CREATE SEQUENCE public.${id(s)}`, `séquence ${s}`);
  for (const t of fixture.tables) {
    const cols = t.cols.filter((k) => !k.g).map((k) => `${id(k.n)} ${k.t}${k.id === 'a' ? ' GENERATED ALWAYS AS IDENTITY' : k.id === 'd' ? ' GENERATED BY DEFAULT AS IDENTITY' : ''}${k.nn && !k.id ? ' NOT NULL' : ''}`);
    await essayer(`CREATE TABLE public.${id(t.nom)} (${cols.join(', ')})`, `table ${t.nom}`);
  }
  await c.query('SET check_function_bodies = off');
  let nf = 0;
  for (const f of fixture.fonctions) if (await essayer(f.def, `fonction ${f.nom}(${f.args})`)) nf++;
  await c.query('SET check_function_bodies = on');
  for (const t of fixture.tables) {
    for (const k of t.cols.filter((x) => x.d && !x.id && !x.g)) await essayer(`ALTER TABLE public.${id(t.nom)} ALTER COLUMN ${id(k.n)} SET DEFAULT ${k.d}`, `défaut ${t.nom}.${k.n}`);
    for (const k of t.cols.filter((x) => x.g === 's')) await essayer(`ALTER TABLE public.${id(t.nom)} ADD COLUMN ${id(k.n)} ${k.t} GENERATED ALWAYS AS (${k.d}) STORED`, `colonne générée ${t.nom}.${k.n}`);
  }
  const noms = new Set(fixture.tables.map((t) => t.nom));
  for (const passe of [['p', 'u', 'x', 'c'], ['f']]) {
    for (const t of fixture.tables) for (const k of (t.cons ?? []).filter((x) => passe.includes(x.type))) {
      // Une clé étrangère vers une table hors de la chaîne (jamais lue ici) n'est pas posée ; auth.users l'est.
      if (k.type === 'f' && !(noms.has(k.ref) || (k.refns === 'auth' && k.ref === 'users'))) continue;
      await essayer(`ALTER TABLE public.${id(t.nom)} ADD CONSTRAINT ${id(k.n)} ${k.def}`, `contrainte ${t.nom}.${k.n}`);
    }
  }
  for (const t of fixture.tables) for (const x of (t.idx ?? [])) await essayer(x, `index ${t.nom}`);
  let nt = 0, ntTotal = 0;
  for (const t of fixture.tables) for (const g of (t.trig ?? [])) {
    ntTotal++;
    if (await essayer(g.def, `déclencheur ${t.nom}.${g.n}`)) { nt++; if (g.on === 'D') await essayer(`ALTER TABLE public.${id(t.nom)} DISABLE TRIGGER ${id(g.n)}`, `désactivation ${g.n}`); }
  }
  for (const l of fixture.config.coin_config) await c.query('INSERT INTO public.coin_config (key, value) VALUES ($1, $2)', [l.key, l.value]);
  for (const l of fixture.config.platform_health) await essayer(`INSERT INTO public.platform_health (platform, paused) VALUES ('${l.platform}', ${l.paused ? 'true' : 'false'})`, `platform_health ${l.platform}`);
  // Les droits : d'abord large pour les rôles clients (les déclencheurs exécutés avec les droits de l'appelant lisent
  // des tables de réglages), puis ceux de PROD, exacts, pour les tables de la chaîne — RLS et politiques comprises.
  await c.query('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated, service_role');
  await c.query('GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role');
  for (const t of fixture.droits.tables) {
    await c.query(`REVOKE ALL ON public.${id(t.nom)} FROM anon, authenticated, service_role`);
    for (const m of String(t.acl).replace(/^\{|\}$/g, '').split(',')) {
      const [role, reste] = m.split('=');
      if (!['anon', 'authenticated', 'service_role'].includes(role)) continue;
      const liste = [...new Set(reste.split('/')[0].split('').map((l) => DROITS[l]).filter(Boolean))];
      if (liste.length) await c.query(`GRANT ${liste.join(', ')} ON public.${id(t.nom)} TO ${role}`);
    }
    if (t.rls) await c.query(`ALTER TABLE public.${id(t.nom)} ENABLE ROW LEVEL SECURITY`);
  }
  let np = 0;
  for (const p of fixture.droits.politiques) {
    const cmd = { '*': 'ALL', r: 'SELECT', a: 'INSERT', w: 'UPDATE', d: 'DELETE' }[p.cmd];
    const roles = Array.isArray(p.roles) && p.roles.length ? p.roles.join(', ') : 'PUBLIC';
    if (await essayer(`CREATE POLICY ${id(p.nom)} ON public.${id(p.table)} AS ${p.permissive ? 'PERMISSIVE' : 'RESTRICTIVE'} FOR ${cmd} TO ${roles}`
      + `${p.using ? ` USING (${p.using})` : ''}${p.check ? ` WITH CHECK (${p.check})` : ''}`, `politique ${p.table}.${p.nom}`)) np++;
  }
  return { echecs, nf, nfTotal: fixture.fonctions.length, nt, ntTotal, np, npTotal: fixture.droits.politiques.length };
}

// ── Les comptes d'essai (identifiants inventés) ─────────────────────────────────────────────────────────────────────
export const A = 'aaaaaaaa-0000-4000-8000-00000000000a'; // le compte qui agit
export const B = 'bbbbbbbb-0000-4000-8000-00000000000b'; // le compte relié à A
export const C = 'cccccccc-0000-4000-8000-00000000000c'; // un tiers
export const E = 'eeeeeeee-0000-4000-8000-00000000000e'; // deux comptes NON reliés qui portent pourtant un lien de fiches
export const F = 'ffffffff-0000-4000-8000-00000000000f';

const LIEN = {
  leboncoin: (n) => `https://www.leboncoin.fr/ad/vetements/${n}`,
  beebs: (n) => `https://www.beebs.app/fr/p/${n}`,
  vinted: (n) => `https://www.vinted.fr/items/${n}-article-d-essai`,
  ebay: (n) => `https://www.ebay.fr/itm/${n}`,
  depop: (n) => `https://www.depop.com/products/essai-article-${n}/`,
  opla: (n) => `https://www.opla.fr/product/art_${n}`,
};
export const MESSAGE_RETIREE = "Annonce retirée par le vendeur (retrait ciblé depuis l'app) — pas une vente";

/** Les outils d'un essai : écritures de mise en scène (serveur), gestes de l'app (rôle authenticated, sous RLS), lectures. */
export function outils(c, { url = null, roles = [] } = {}) {
  const q = async (sql, p = []) => (await c.query(sql, p)).rows;
  const un = async (sql, p = []) => (await q(sql, p))[0] ?? {};
  let invSuivant = 8800000000000 + Math.floor(Math.random() * 1e6) * 1000;
  let numSuivant = 3399700000 + Math.floor(Math.random() * 1e5) * 100;
  const numero = () => String(numSuivant++);

  // Les délais de PROD d'une requête de l'app (rôles lus en prod : authenticated statement_timeout 8 s ; la connexion de
  // l'API, authenticator, lock_timeout 8 s) : une traversée trop lente ou bloquée ferait échouer la suppression.
  const reglage = (role, cle, defaut) => {
    const v = (roles.find((r) => r.nom === role)?.config ?? []).find((x) => String(x).startsWith(`${cle}=`));
    return v ? String(v).split('=')[1] : defaut;
  };
  const DELAI_REQUETE = reglage('authenticated', 'statement_timeout', '8s');
  const DELAI_VERROU = reglage('authenticator', 'lock_timeout', '8s');
  const commeServeur = async () => {
    await c.query('RESET ROLE'); await c.query('RESET statement_timeout'); await c.query('RESET lock_timeout');
    await c.query(`SELECT set_config('request.jwt.claims', '', false), set_config('request.jwt.claim.sub', '', false)`);
  };
  const commeApp = async (user) => {
    await c.query('RESET ROLE');
    await c.query(`SELECT set_config('request.jwt.claims', $1, false), set_config('request.jwt.claim.sub', '', false)`, [JSON.stringify({ sub: user, role: 'authenticated' })]);
    await c.query(`SET statement_timeout = '${DELAI_REQUETE}'`);
    await c.query(`SET lock_timeout = '${DELAI_VERROU}'`);
    await c.query('SET ROLE authenticated');
  };
  /** Une SECONDE connexion à la base jetable : un autre geste qui tient des verrous pendant celui de l'essai. */
  const autre = async () => { if (!url) throw new Error('outils : url de la base jetable absente'); return ouvrir(url); };
  const enApp = async (user, f) => { await commeApp(user); try { return await f(); } finally { await commeServeur(); } };

  async function comptes() {
    for (const u of [A, B, C, E, F]) {
      await c.query(`INSERT INTO auth.users (id, email) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [u, `${u.slice(0, 8)}@exemple.invalid`]);
      await c.query(`INSERT INTO profiles (id, email, is_premium, is_pro, is_business, extension_last_seen_at, extension_version, extension_build, lang)
        VALUES ($1, $2, true, true, true, now(), '0.6.186', '0.6.186', 'fr') ON CONFLICT DO NOTHING`, [u, `${u.slice(0, 8)}@exemple.invalid`]);
    }
    await c.query(`INSERT INTO comptes_lies (user_a, user_b, motif) VALUES (least($1::uuid, $2::uuid), greatest($1::uuid, $2::uuid), 'essai : même personne') ON CONFLICT DO NOTHING`, [A, B]);
    // La boutique partagée : la trace que le relevé de prod pose quand il écarte l'import d'une annonce du compte relié.
    for (const p of PARTAGEES) await c.query(`INSERT INTO sync_import_ecartes (user_id, motif, titre) VALUES ($1, $2, 'essai')`, [B, `compte_relie:${p}`]);
  }
  async function fiche(user, { titre = 'Article d\'essai', statut = 'stock', quantite = 1, vintedCompte = null, origine = null } = {}) {
    const inv = invSuivant++;
    await c.query(`INSERT INTO inventaire (id, user_id, titre, statut, quantite, prix_vente, description, photos, origine, vinted_account_id, created_at)
      VALUES ($1, $2, $3, $4, $5, 12, 'Très bon état.', '["https://essai.supabase.co/storage/v1/object/public/photos/essai-1.jpg"]'::jsonb, $6, $7, now() - interval '60 days')`,
    [inv, user, titre, statut, quantite, origine, vintedCompte]);
    return inv;
  }
  /** Un dépôt (cross_post_jobs). numero / url : undefined = fabriqués ; null = absents. */
  async function depot(user, inv, { platform, status = 'published', action = 'publish', num, url, pf = {}, il = '45 days', titre = 'Article d\'essai', erreur = null } = {}) {
    const n = num === undefined ? (['published', 'sold'].includes(status) ? numero() : null) : num;
    const u = url === undefined ? (n ? LIEN[platform](n) : null) : url;
    // Une republication naît « publish » puis devient « republish » : la garde de maintenance ne juge que la création.
    const cree = (await un(`INSERT INTO cross_post_jobs (user_id, inventaire_id, platform, status, action, title, price, platform_listing_id, listing_url,
        published_at, created_at, handler_build, platform_fields, photo_option, error)
      VALUES ($1, $2, $3, $4, $10, $5, 12, $6, $7, CASE WHEN $4 IN ('published', 'sold') THEN now() - $8::interval END, now() - $8::interval, '0.6.186', $9, 'original', $11) RETURNING id`,
    [user, inv, platform, status, titre, n, u, il, JSON.stringify(pf), action === 'republish' ? 'publish' : action, erreur])).id;
    if (action === 'republish') await c.query(`UPDATE cross_post_jobs SET action = 'republish' WHERE id = $1`, [cree]);
    return { id: cree, num: n, url: u };
  }
  async function annonce(user, inv, { platform, num, job = null, statut = 'en_ligne', tx = null, source = 'job', vu = '1 hour', cree = '45 days' }) {
    return (await un(`INSERT INTO annonces_plateforme (user_id, platform, listing_id, url, titre, prix, statut_plateforme, inventaire_id, job_id,
        source_rapprochement, vu_le, created_at, publiee_le, transaction_plateforme)
      VALUES ($1, $2, $3, $4, 'Article d''essai', 12, $5, $6, $7, $8, now() - $9::interval, now() - $10::interval, now() - $10::interval, $11) RETURNING id`,
    [user, platform, num, LIEN[platform](num), statut, inv, job, source, vu, cree, tx])).id;
  }
  const lier = async (fa, ua, fb, ub) => (await un(`INSERT INTO fiches_liees_comptes (fiche_a, user_a, fiche_b, user_b, source) VALUES ($1, $2, $3, $4, 'essai') RETURNING id`, [fa, ua, fb, ub])).id;

  /** Une paire de fiches jumelles : celle de `moi` (dépôts `miens`) et celle de `autre` (dépôts `siens`), reliées. */
  async function paire({ moi = A, autre = B, miens = [{ platform: 'vinted' }], siens = [{ platform: 'leboncoin' }], jumelle = {}, lien = true } = {}) {
    const f = await fiche(moi, { vintedCompte: 'boutique-de-moi' });
    const g = await fiche(autre, { vintedCompte: 'boutique-de-l-autre', ...jumelle });
    const dm = [], ds = [];
    for (const d of miens) dm.push({ ...d, ...(await depot(moi, f, d)) });
    for (const d of siens) {
      const x = await depot(autre, g, d);
      // Une annonce relevée par dépôt publié — sauf Vinted, que le relevé « Mes annonces » ne suit pas (contrainte de prod).
      if (d.annonce !== false && x.num && d.platform !== 'vinted' && (d.status ?? 'published') === 'published') await annonce(autre, g, { platform: d.platform, num: x.num, job: x.id, tx: d.tx ?? null });
      ds.push({ ...d, ...x });
    }
    const l = lien ? await lier(f, moi, g, autre) : null;
    return { f, g, miens: dm, siens: ds, lien: l };
  }

  // ── Les gestes de l'app (src/App.jsx executerSuppression, src/tabs/StockTab.jsx armRemoveJob) ──
  /** « Supprimer l'article » → « Retirer aussi les annonces … et supprimer » : retraits des dépôts publiés, puis la fiche. */
  const supprimerEnRetirant = (user, inv) => enApp(user, async () => {
    const pubs = await q(`SELECT DISTINCT ON (platform) platform, title, listing_url FROM cross_post_jobs
      WHERE user_id = $1 AND inventaire_id = $2 AND action IN ('publish', 'republish') AND status = 'published' AND platform <> 'opla'
      ORDER BY platform, coalesce(published_at, created_at) DESC`, [user, inv]);
    for (const p of pubs) await c.query(`INSERT INTO cross_post_jobs (user_id, inventaire_id, platform, action, status, photo_option, title, listing_url, platform_fields)
      VALUES ($1, $2, $3, 'delete', 'pending', 'original', $4, $5, '{}'::jsonb)`, [user, inv, p.platform, p.title, p.listing_url]);
    await c.query(`UPDATE cross_post_jobs SET status = 'cancelled', error = 'Annulé : l''article a été supprimé du stock'
      WHERE user_id = $1 AND inventaire_id = $2 AND action IN ('publish', 'republish') AND status IN ('pending', 'processing', 'needs_user')`, [user, inv]);
    await c.query(`UPDATE ventes SET inventaire_id = NULL WHERE inventaire_id = $2 AND user_id = $1`, [user, inv]);
    return (await c.query(`DELETE FROM inventaire WHERE id = $1`, [inv])).rowCount;
  });
  /** La suppression seule (une app qui n'arme rien : le filet serveur arme les retraits). */
  const supprimer = (user, inv) => enApp(user, async () => (await c.query(`DELETE FROM inventaire WHERE id = $1`, [inv])).rowCount);
  /** « Supprimer la fiche, laisser les annonces en ligne » (RPC de prod). */
  const supprimerEnLaissant = (user, inv) => enApp(user, async () => (await un(`SELECT public.inventaire_supprimer_sans_retrait($1) AS r`, [inv])).r);
  /** Le retrait d'UNE annonce par son logo (un seul insert, aucune fiche supprimée). */
  const retirerParLogo = (user, inv, d) => enApp(user, async () => (await un(`INSERT INTO cross_post_jobs (user_id, inventaire_id, platform, action, status, photo_option, title, listing_url, platform_fields)
    VALUES ($1, $2, $3, 'delete', 'pending', 'original', 'Article d''essai', $4, '{}'::jsonb) RETURNING id`, [user, inv, d.platform, d.url])).id);
  /** Ce que fait l'extension quand un retrait aboutit : « deleted », puis le dépôt publié de la même annonce est clos. */
  async function executerRetrait(retrait) {
    await c.query(`UPDATE cross_post_jobs SET status = 'processing' WHERE id = $1 AND status = 'pending'`, [retrait]);
    await c.query(`UPDATE cross_post_jobs SET status = 'deleted' WHERE id = $1 AND status = 'processing'`, [retrait]);
    await c.query(`UPDATE cross_post_jobs p SET status = 'cancelled', error = $2,
        platform_fields = (coalesce(p.platform_fields, '{}'::jsonb) - 'unavailable_since' - 'sale_signal' - 'detected_price' - 'unavailable_pending_since') || '{"removed_by_user": true}'::jsonb
      FROM cross_post_jobs d
      WHERE d.id = $1 AND p.user_id = d.user_id AND p.platform = d.platform AND p.id <> d.id AND p.status = 'published'
        AND p.action IN ('publish', 'republish')
        AND public.listing_designe(coalesce(nullif(btrim(p.platform_listing_id), ''), public.annonce_id_de_job(p.platform_listing_id, p.listing_url)), d.listing_url, d.platform_listing_id)`,
    [retrait, MESSAGE_RETIREE]);
  }

  // ── Les lectures ──
  const retraits = (user, inv) => q(`SELECT id, platform, status, platform_listing_id AS num, listing_url AS url, inventaire_id, user_id, platform_fields AS pf, created_at
    FROM cross_post_jobs WHERE user_id = $1 AND inventaire_id = $2 AND action = 'delete' ORDER BY created_at, id`, [user, inv]);
  const taches = (user, inv) => q(`SELECT id, platform, action, status, error, platform_fields AS pf FROM cross_post_jobs
    WHERE user_id = $1 AND inventaire_id = $2 AND action IN ('publish', 'republish') ORDER BY created_at, id`, [user, inv]);
  const tache = (jobId) => un(`SELECT id, user_id, inventaire_id, platform, action, status, error, platform_listing_id, listing_url, created_at, published_at, vu_en_ligne_le, platform_fields FROM cross_post_jobs WHERE id = $1`, [jobId]);
  const journal = (user, feature, inv) => q(`SELECT metadata FROM usage_logs WHERE user_id = $1 AND feature = $2 AND metadata ->> 'article_id' = $3 ORDER BY created_at, id`, [user, feature, String(inv)]);
  const md5 = async () => Object.fromEntries((await q(`SELECT p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' AS f, md5(pg_get_functiondef(p.oid)) AS m
    FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace`)).map((r) => [r.f, r.m]));
  const objetsNeufs = async () => ({
    fonctions: (await q(`SELECT f FROM unnest($1::text[]) f WHERE to_regprocedure(f) IS NOT NULL`, [NEUVES])).map((r) => r.f),
    declencheur: (await q(`SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.inventaire'::regclass AND tgname = 'inventaire_arme_retraits_fiche_liee' AND NOT tgisinternal`)).length === 1,
    table: (await q(`SELECT to_regclass($1) IS NOT NULL AS t`, [`public.${TABLE_NEUVE}`]))[0].t,
  });

  return { c, q, un, numero, commeServeur, commeApp, enApp, autre, comptes, fiche, depot, annonce, lier, paire, supprimerEnRetirant, supprimer,
    supprimerEnLaissant, retirerParLogo, executerRetrait, retraits, taches, tache, journal, md5, objetsNeufs, LIEN };
}
