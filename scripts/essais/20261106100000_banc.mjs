// ESSAI, SUR UN POSTGRES JETABLE, de la migration 20261106100000_doublon_decider_auteur_legitime (06/11, Nico, point 4) —
// jamais la prod (règle du 03/11 : plus aucun « essai à blanc » sur la prod).
//   PREUVE_PG=embarque node scripts/essais/20261106100000_banc.mjs
// Les corps touchés sont ceux de la PROD du 06/11 (fixtures/prod-0611-doublon-decider : inventaire_doublon_decider,
// armer_retrait_annonce_pour, listing_designe — pg_get_functiondef) ; armer_retrait_job_pour et la fusion sont des
// bouchons qui notent ce qu'on leur demande (ils ne lisent pas la session : hors sujet). Le banc REJOUE D'ABORD le défaut
// avec le corps d'avant (le « Oui » donné sans la session de la personne n'arme rien), puis applique la migration, rejoue
// chaque cas — la personne sur sa session doit obtenir EXACTEMENT le même résultat qu'avant, l'équipe sur ordre le même
// que la personne —, puis l'inverse.
import pg from 'pg';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const FIX = join(ROOT, 'scripts/essais/fixtures/prod-0611-doublon-decider');
const lire = (p) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
let PG_URL = process.env.PREUVE_PG;
if (!PG_URL || /supabase\.co/.test(PG_URL)) { console.error('PREUVE_PG : un Postgres JETABLE (jamais la prod), ou « embarque ».'); process.exit(2); }
let embarque = null;
if (PG_URL === 'embarque') {
  const { default: EmbeddedPostgres } = await import('embedded-postgres');
  const dossier = mkdtempSync(join(tmpdir(), 'fillsell-banc-decider-'));
  embarque = { pg: new EmbeddedPostgres({ databaseDir: dossier, user: 'postgres', password: 'banc', port: 55443, persistent: false,
    initdbFlags: ['--encoding=UTF8', '--locale=C'], onLog: () => {} }), dossier };
  await embarque.pg.initialise();
  await embarque.pg.start();
  PG_URL = 'postgres://postgres:banc@127.0.0.1:55443/postgres';
}

const DECOR = String.raw`
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role; END IF;
END $$;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
CREATE SCHEMA IF NOT EXISTS auth;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $f$
  SELECT nullif(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub', '')::uuid $f$;
CREATE TABLE public.inventaire (id bigint PRIMARY KEY, user_id uuid, titre text, statut text DEFAULT 'stock', quantite integer DEFAULT 1,
  plateforme text, fusionne_dans bigint);
CREATE TABLE public.cross_post_jobs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, inventaire_id bigint, platform text,
  status text, action text DEFAULT 'publish', photo_option text, title text, listing_url text, platform_listing_id text,
  platform_fields jsonb DEFAULT '{}'::jsonb, created_at timestamptz DEFAULT now());
CREATE TABLE public.ventes (id bigserial PRIMARY KEY, user_id uuid, inventaire_id bigint, statut text DEFAULT 'vendu', plateforme text,
  plateforme_code text);
CREATE TABLE public.annonces_plateforme (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, platform text, listing_id text,
  url text, titre text, inventaire_id bigint, job_id uuid, disparu_le timestamptz, retiree_le timestamptz, ignoree_le timestamptz,
  transaction_plateforme text);
CREATE TABLE public.usage_logs (id bigserial PRIMARY KEY, user_id uuid, feature text, metadata jsonb, created_at timestamptz DEFAULT now());
CREATE TABLE public.inventaire_doublons (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, garde bigint, absorbe bigint,
  niveau text, statut text DEFAULT 'proposee', motif text, preuves jsonb, fusion_id uuid, decide_le timestamptz, decide_par text);
CREATE OR REPLACE FUNCTION public.opla_sortie_passee() RETURNS boolean LANGUAGE sql AS $f$ SELECT true $f$;
-- Bouchons (ne lisent pas la session) : le retrait d'un dépôt n'est armé QUE sur la preuve du geste ; la fusion déplace.
CREATE OR REPLACE FUNCTION public.armer_retrait_job_pour(p_job_id uuid, p_chemin text, p_delai interval, p_preuve_geste boolean)
RETURNS uuid LANGUAGE plpgsql AS $f$
DECLARE j public.cross_post_jobs%ROWTYPE; v uuid;
BEGIN
  SELECT * INTO j FROM public.cross_post_jobs WHERE id = p_job_id;
  IF NOT FOUND OR j.status <> 'published' OR NOT COALESCE(p_preuve_geste, false) THEN RETURN NULL; END IF;
  INSERT INTO public.cross_post_jobs (user_id, inventaire_id, platform, action, status, listing_url, platform_listing_id, platform_fields)
  VALUES (j.user_id, j.inventaire_id, j.platform, 'delete', 'pending', j.listing_url, j.platform_listing_id,
          jsonb_build_object('arme_par', jsonb_build_object('chemin', p_chemin, 'depot', j.id))) RETURNING id INTO v;
  UPDATE public.cross_post_jobs SET platform_fields = platform_fields || jsonb_build_object('retrait_arme', jsonb_build_object('job', v)) WHERE id = j.id;
  RETURN v;
END $f$;
CREATE OR REPLACE FUNCTION public.inventaire_fusionner_pour(p_user uuid, p_garde bigint, p_absorbe bigint, p_par text) RETURNS jsonb
LANGUAGE plpgsql AS $f$
BEGIN
  UPDATE public.inventaire SET fusionne_dans = p_garde WHERE id = p_absorbe;
  RETURN jsonb_build_object('ok', true, 'fusion_id', gen_random_uuid(), 'deplacements', '{}'::jsonb);
END $f$;
`;

const AVANT = ['listing_designe', 'armer_retrait_annonce_pour', 'inventaire_doublon_decider'].map((n) => lire(join(FIX, `${n}.sql`)) + ';');
const MIGRATION = lire(join(ROOT, 'supabase/migrations/20261106100000_doublon_decider_auteur_legitime.sql'));
const INVERSE = lire(join(ROOT, 'supabase/rollbacks/20261106100000_doublon_decider_auteur_legitime_INVERSE.sql'));

const MENAR = '39bfa95a-0b8d-46fe-b836-040966d02cfd';   // le compte du cas (nicolas.menar)
const AUTRE = '11111111-2222-3333-4444-555555555555';
let echecs = 0, n = 0;
const ok = (c, m, d = '') => { n++; console.log(`  ${c ? '✓' : '✗'} ${m}${c || !d ? '' : `   ← ${d}`}`); if (!c) echecs++; };
const db = new pg.Client({ connectionString: PG_URL });
await db.connect();
const q = async (sql, p = []) => (await db.query(sql, p)).rows;
const un = async (sql, p = []) => (await q(sql, p))[0] ?? {};
const session = (u) => db.query(`SELECT set_config('request.jwt.claims', $1, false)`, [u ? JSON.stringify({ sub: u, role: 'authenticated' }) : '']);
const retraits = async (inv) => Number((await un(`SELECT count(*) n FROM cross_post_jobs WHERE action = 'delete' AND inventaire_id = $1`, [inv])).n);
const question = async (d) => un(`SELECT statut, decide_par, preuves FROM inventaire_doublons WHERE id = $1`, [d]);

// Les cas, chacun sur des lignes NEUVES (fiche n). « annonce » : le Doudou — le dépôt porte un AUTRE numéro que
// l'annonce montrée (le lot) → armer_retrait_annonce_pour. « depot » : le dépôt porte le numéro de l'annonce montrée →
// armer_retrait_job_pour (preuve du geste). « stock » : la fiche n'est pas vendue → sans objet, rien d'armé.
let suivant = 1000;
async function cas(genre, compte = MENAR) {
  const f = suivant++;
  const vendue = genre !== 'stock';
  await q(`INSERT INTO inventaire (id, user_id, titre, statut, quantite, plateforme) VALUES ($1, $2, 'Doudou Marie', $3, $4, 'vinted')`,
    [f, compte, vendue ? 'vendu' : 'stock', vendue ? 0 : 1]);
  if (vendue) await q(`INSERT INTO ventes (user_id, inventaire_id, plateforme, plateforme_code) VALUES ($1, $2, 'Vinted', 'vinted')`, [compte, f]);
  const num = String(3274924000 + f), autre = String(3267000000 + f);
  const numDepot = genre === 'depot' ? num : autre;
  const [{ id: job }] = await q(`INSERT INTO cross_post_jobs (user_id, inventaire_id, platform, status, action, platform_listing_id, listing_url)
    VALUES ($1, $2, 'leboncoin', 'published', 'republish', $3, 'https://www.leboncoin.fr/ad/jeux_jouets/' || $3) RETURNING id`, [compte, f, numDepot]);
  const [{ id: annonce }] = await q(`INSERT INTO annonces_plateforme (user_id, platform, listing_id, url, titre, inventaire_id, job_id)
    VALUES ($1, 'leboncoin', $2, 'https://www.leboncoin.fr/ad/jeux_jouets/' || $2, 'Doudou Marie', $3, $4) RETURNING id`, [compte, num, f, job]);
  const [{ id: d }] = await q(`INSERT INTO inventaire_doublons (user_id, garde, absorbe, niveau, motif, preuves)
    VALUES ($1, $2, $2, 'probable', 'copie_non_prouvee', jsonb_build_object('job', $3::text, 'annonce_id', $4::text, 'platform', 'leboncoin'))
    RETURNING id`, [compte, f, job, annonce]);
  return { f, d, annonce };
}
// Ce que rend une réponse, sans ses identifiants (retrait) ni la trace de l'auteur : la comparaison des issues.
const issue = (r) => { const x = { ...(r ?? {}) }; delete x.repondu_par; return JSON.stringify(Object.keys(x).sort().map((k) => [k, x[k]])); };
const scenarios = [['annonce', 'oui'], ['depot', 'oui'], ['annonce', 'non'], ['stock', 'oui']];

try {
  await db.query(DECOR);
  for (const s of AVANT) await db.query(s);

  console.log('0. AVANT (corps de prod du 06/11) : le défaut se rejoue');
  const c0 = await cas('annonce');
  await session(null);
  const r0 = (await un(`SELECT inventaire_doublon_decider($1, 'oui', $2) r`, [c0.d, c0.annonce])).r;
  ok(r0?.reason === 'unauthorized' && (await retraits(c0.f)) === 0 && (await question(c0.d)).statut === 'proposee',
    '« Oui » donné hors de la session de la personne (l\'équipe, sur ordre) : « unauthorized », AUCUN retrait, question ouverte', JSON.stringify(r0));
  const issuesAvant = [];
  for (const [g, dec] of scenarios) {
    const c = await cas(g);
    await session(MENAR);
    const r = (await un(`SELECT inventaire_doublon_decider($1, $2, $3) r`, [c.d, dec, c.annonce])).r;
    const qq = await question(c.d);
    issuesAvant.push({ r: issue(r), retraits: await retraits(c.f), statut: qq.statut, par: qq.decide_par });
  }
  ok(issuesAvant[0].retraits === 1 && issuesAvant[1].retraits === 1 && issuesAvant[2].retraits === 0 && issuesAvant[3].retraits === 0,
    'la personne sur sa session : « Oui » arme le retrait (annonce montrée, dépôt), « Non » et fiche non vendue n\'arment rien',
    JSON.stringify(issuesAvant));

  console.log('1. La migration');
  await session(null);
  await db.query(MIGRATION);
  ok(true, 'appliquée');

  console.log('2. APRÈS : la personne sur sa session — exactement les mêmes issues qu\'avant');
  for (let k = 0; k < scenarios.length; k++) {
    const [g, dec] = scenarios[k];
    const c = await cas(g);
    await session(MENAR);
    const r = (await un(`SELECT inventaire_doublon_decider($1, $2, $3) r`, [c.d, dec, c.annonce])).r;
    const qq = await question(c.d);
    const apres = { r: issue(r), retraits: await retraits(c.f), statut: qq.statut, par: qq.decide_par };
    ok(JSON.stringify(apres) === JSON.stringify(issuesAvant[k]) && !qq.preuves?.repondu_par,
      `${g} / ${dec} : même réponse, ${apres.retraits} retrait, statut ${apres.statut}, decide_par ${apres.par}`, `${JSON.stringify(apres)} ≠ ${JSON.stringify(issuesAvant[k])}`);
  }
  await session(null);
  const c2 = await cas('annonce');
  ok((await un(`SELECT inventaire_doublon_decider($1, 'oui', $2) r`, [c2.d, c2.annonce])).r?.reason === 'unauthorized' && (await retraits(c2.f)) === 0,
    'sans session, l\'entrée de l\'app refuse toujours (« unauthorized »)');
  await session(AUTRE);
  ok((await un(`SELECT inventaire_doublon_decider($1, 'oui', $2) r`, [c2.d, c2.annonce])).r?.reason === 'introuvable' && (await retraits(c2.f)) === 0,
    'la session d\'un AUTRE compte : « introuvable », rien d\'armé');

  console.log('3. APRÈS : l\'équipe sur ordre (inventaire_doublon_decider_pour) — la MÊME règle que la personne');
  await session(null);
  for (let k = 0; k < scenarios.length; k++) {
    const [g, dec] = scenarios[k];
    const c = await cas(g);
    const r = (await un(`SELECT inventaire_doublon_decider_pour($1, $2, $3, 'nico : ordre du 06/11 (point 4)') r`, [c.d, dec, c.annonce])).r;
    const qq = await question(c.d);
    const pour = { r: issue(r), retraits: await retraits(c.f), statut: qq.statut, par: qq.decide_par };
    const trace = qq.statut !== 'proposee' ? qq.preuves?.repondu_par?.auteur === 'nico : ordre du 06/11 (point 4)' : !qq.preuves?.repondu_par;
    ok(JSON.stringify(pour) === JSON.stringify(issuesAvant[k]) && trace && r?.repondu_par === 'nico : ordre du 06/11 (point 4)',
      `${g} / ${dec} : même issue que la personne (${pour.retraits} retrait, ${pour.statut}), auteur écrit sur la question`, `${JSON.stringify(pour)} ≠ ${JSON.stringify(issuesAvant[k])} ; ${JSON.stringify(qq.preuves?.repondu_par)}`);
  }
  const c3 = await cas('annonce');
  const r3 = (await un(`SELECT inventaire_doublon_decider_pour($1, 'oui', $2, 'nico') r`, [c3.d, c3.annonce])).r;
  const del3 = await un(`SELECT platform_fields->'arme_par'->>'chemin' c, platform_listing_id p, platform_fields->>'preuve' pr FROM cross_post_jobs
    WHERE action = 'delete' AND inventaire_id = $1`, [c3.f]);
  ok(r3?.ok === true && del3.c === 'copie_confirmee_vendue' && del3.p === String(3274924000 + c3.f) && del3.pr === 'geste_deja_vendu',
    'le retrait armé vise L\'ANNONCE MONTRÉE (son numéro), chemin copie_confirmee_vendue, preuve du geste', JSON.stringify(del3));
  for (const auteur of ['', '   ', 'ia', 'utilisateur', null]) {
    const c = await cas('annonce');
    const r = (await un(`SELECT inventaire_doublon_decider_pour($1, 'oui', $2, $3) r`, [c.d, c.annonce, auteur])).r;
    ok(r?.reason === 'auteur_absent' && (await retraits(c.f)) === 0 && (await question(c.d)).statut === 'proposee',
      `auteur ${JSON.stringify(auteur)} : refusé (« auteur_absent »), rien d'armé, question ouverte`, JSON.stringify(r));
  }
  ok((await un(`SELECT inventaire_doublon_decider_pour(gen_random_uuid(), 'oui', NULL, 'nico') r`)).r?.reason === 'introuvable', 'question inconnue : « introuvable »');
  const c4 = await cas('annonce');
  await un(`SELECT inventaire_doublon_decider_pour($1, 'oui', $2, 'nico') r`, [c4.d, c4.annonce]);
  const r4 = (await un(`SELECT inventaire_doublon_decider_pour($1, 'oui', $2, 'nico') r`, [c4.d, c4.annonce])).r;
  ok(r4?.reason === 'deja_tranchee' && (await retraits(c4.f)) === 1, 'une question déjà tranchée ne s\'arme jamais deux fois');

  console.log('4. APRÈS : qui peut appeler quoi');
  for (const role of ['anon', 'authenticated']) {
    for (const [fn, args] of [['inventaire_doublon_decider_pour', `gen_random_uuid(), 'oui', NULL, 'x'`], ['inventaire_doublon_decider_corps', `gen_random_uuid(), gen_random_uuid(), 'oui', NULL`]]) {
      let refuse = false;
      await db.query(`SET ROLE ${role}`);
      try { await db.query(`SELECT ${fn}(${args})`); } catch (e) { refuse = /permission denied/.test(e.message); }
      await db.query('RESET ROLE');
      ok(refuse, `${role} ne peut pas appeler ${fn}`);
    }
  }
  for (const fn of ['inventaire_doublon_decider_pour(uuid, text, uuid, text)', 'inventaire_doublon_decider_corps(uuid, uuid, text, uuid)']) {
    ok((await un(`SELECT has_function_privilege('service_role', 'public.${fn}', 'EXECUTE') x`)).x === true, `service_role peut appeler ${fn.split('(')[0]}`);
  }

  console.log('5. L\'inverse');
  await db.query(INVERSE);
  const c5 = await cas('annonce');
  await session(null);
  ok((await un(`SELECT inventaire_doublon_decider($1, 'oui', $2) r`, [c5.d, c5.annonce])).r?.reason === 'unauthorized', 'corps d\'avant rétabli (sans session : « unauthorized »)');
  ok((await un(`SELECT to_regprocedure('public.inventaire_doublon_decider_pour(uuid, text, uuid, text)') IS NULL AND to_regprocedure('public.inventaire_doublon_decider_corps(uuid, uuid, text, uuid)') IS NULL x`)).x === true,
    'les deux fonctions ajoutées sont supprimées');
  await session(MENAR);
  ok((await un(`SELECT inventaire_doublon_decider($1, 'oui', $2) r`, [c5.d, c5.annonce])).r?.ok === true && (await retraits(c5.f)) === 1, 'la personne sur sa session : inchangée');
} catch (e) {
  echecs++;
  console.error('✗ ERREUR :', e.message);
} finally {
  await db.end();
  if (embarque) { await embarque.pg.stop(); rmSync(embarque.dossier, { recursive: true, force: true }); }
}
console.log(`\n${n - echecs}/${n} vérifications, ${echecs} échec(s)`);
process.exit(echecs ? 1 : 0);
