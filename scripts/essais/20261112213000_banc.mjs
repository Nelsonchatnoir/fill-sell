// LE BANC de la migration 20261112213000_releve_jamais_depuis_notre_depot (12/11/2026, point 1a de Nico : « un relevé ne
// complète JAMAIS une fiche à partir de notre propre dépôt ») — SUR UN POSTGRES JETABLE (embedded-postgres sur le poste),
// jamais la prod.
//   node scripts/essais/20261112213000_banc.mjs
// Décor : les définitions de PROD (pg_get_functiondef, lecture seule, 12/11) de tout ce que la chaîne exécute
// (fixtures/prod-1211-releve-depot/decor.json : annonce_donnees, valeur_attribut_saine, texte_sans_accents,
// type_fillsell_depuis_categorie, listing_designe, inventaire_attributs_fusion, inventaire_attributs_rang,
// journaliser_fiche…), le déclencheur de prod inventaire_attributs_fusion_trg, et les deux fonctions réécrites telles qu'en
// prod (le corps de l'inverse, md5 vérifiés). Tables réduites aux colonnes lues ; RLS de prod sur cross_post_jobs
// (« Users manage own cross_post_jobs ») et une politique « ses fiches » sur inventaire, auth.uid() d'essai.
// Étapes : A. AVANT (prod) ; garde md5 : la migration refuse une définition qui n'est pas celle de prod ;
//          B. MIGRATION ; C. INVERSE (la prod à l'octet, A de nouveau) ; D. MIGRATION rejouée (B de nouveau).
// Cas (comptes et fiches d'essai, valeurs du cas réel c7c382b7 — aucune donnée client) :
//   F  fiche « legging » : étiquette lue « EU 140cm » (attributs_visibles), dépôts FillSell Beebs (publié, annonce
//      rattachée par la tâche) et Vinted ; l'annonce Beebs relue porte « Naissance - 0 mois (45-50 cm) », « Autre ».
//   G  fiche sans dépôt, annonce Leboncoin déposée par la personne : le relevé la complète, avant comme après.
//   H  fiche Lens « EU 38 » (attributs_visibles.pointure), annonce Beebs de la personne : la taille n'est plus complétée
//      (l'étiquette la renseigne), la couleur l'est toujours.
//   K  dépôt Beebs qui n'est que le SUIVI d'un relevé (platform_fields.source = 'releve') : pas un dépôt FillSell.
//   L  dépôt Beebs DÉTACHÉ (detache_le) : pas un dépôt FillSell.
//   M  dépôt Beebs désigné seulement par l'identifiant de l'annonce (job_id vide) : un dépôt FillSell.
import pg from 'pg';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import crypto from 'node:crypto';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const lire = (p) => readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');
export const MIGRATION = 'supabase/migrations/20261112213000_releve_jamais_depuis_notre_depot.sql';
export const INVERSE = 'supabase/rollbacks/20261112213000_releve_jamais_depuis_notre_depot_INVERSE.sql';
const DECOR = JSON.parse(lire('scripts/essais/fixtures/prod-1211-releve-depot/decor.json'));
export const MD5_PROD = { fiche_completer_depuis_annonce: '041d772227b9a4a15465f7c4c7724f93', inventaire_attributs_avant_update: '0f714c6870080895bed1d0e9ee4035ca' };
const SIG = { fiche_completer_depuis_annonce: "'public.fiche_completer_depuis_annonce(uuid)'::regprocedure", inventaire_attributs_avant_update: "'public.inventaire_attributs_avant_update()'::regprocedure" };

const U = '0c7c382b-0000-4000-8000-000000000001';   // compte d'essai (le cas réel : c7c382b7)
const V = '0c7c382b-0000-4000-8000-000000000002';   // un autre compte
const PRELUDE = String.raw`
DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE service_role NOLOGIN BYPASSRLS; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $f$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $f$;
GRANT USAGE ON SCHEMA auth TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated, anon, service_role;
CREATE TABLE public.inventaire (id bigint PRIMARY KEY, user_id uuid NOT NULL, titre text, description text, marque text, type text,
  prix_vente numeric, statut text DEFAULT 'stock', poids_g integer, attributs jsonb, fusionne_dans bigint, origine text);
CREATE TABLE public.annonces_plateforme (id uuid PRIMARY KEY, user_id uuid NOT NULL, inventaire_id bigint, platform text, listing_id text,
  job_id uuid, capture jsonb, donnees_index jsonb, prix numeric);
CREATE TABLE public.cross_post_jobs (id uuid PRIMARY KEY, user_id uuid NOT NULL, inventaire_id bigint, platform text, action text,
  status text, platform_fields jsonb, platform_listing_id text, listing_url text);
CREATE INDEX cross_post_jobs_inventaire ON public.cross_post_jobs (inventaire_id) WHERE inventaire_id IS NOT NULL;
CREATE TABLE public.inventaire_journal (id bigserial PRIMARY KEY, user_id uuid, inventaire_id bigint, champ text, avant text, apres text,
  source text, motif text, detail jsonb, created_at timestamptz DEFAULT now());
CREATE TABLE public.beebs_formats_colis (id text PRIMARY KEY, poids_g numeric);
CREATE FUNCTION public.poids_g_de_texte(p text) RETURNS integer LANGUAGE sql IMMUTABLE AS $f$ SELECT NULL::integer $f$;
ALTER TABLE public.cross_post_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own cross_post_jobs" ON public.cross_post_jobs TO authenticated
  USING ((SELECT auth.uid() AS uid) = user_id) WITH CHECK ((SELECT auth.uid() AS uid) = user_id);
ALTER TABLE public.inventaire ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ses fiches" ON public.inventaire TO authenticated USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id);
GRANT USAGE ON SCHEMA public TO authenticated, anon, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventaire, public.cross_post_jobs, public.annonces_plateforme TO authenticated, service_role;
`;

export async function demarrer(port) {
  const { default: EmbeddedPostgres } = await import('embedded-postgres');
  const dossier = mkdtempSync(join(tmpdir(), 'fillsell-banc-releve-depot-'));
  const base = new EmbeddedPostgres({ databaseDir: dossier, user: 'postgres', password: 'banc', port, persistent: false,
    initdbFlags: ['--encoding=UTF8', '--locale=C'], onLog: () => {}, onError: () => {} });
  await base.initialise(); await base.start();
  const c = new pg.Client({ connectionString: `postgres://postgres:banc@127.0.0.1:${port}/postgres` });
  await c.connect(); c.on('notice', () => {});
  await c.query(PRELUDE);
  for (const nom of ['texte_sans_accents', 'valeur_attribut_saine', 'annonce_poids_g', 'opla_valeur_affichee', 'annonce_donnees',
    'type_fillsell_depuis_categorie', 'listing_designe', 'inventaire_attributs_rang', 'inventaire_attributs_fusion', 'journaliser_fiche']) {
    const f = DECOR.fonctions[nom];
    if (crypto.createHash('md5').update(f.def).digest('hex') !== f.md5) throw new Error(`décor : ${nom} altéré`);
    await c.query(f.def);
  }
  // Les deux fonctions réécrites, telles qu'en PROD : le corps de l'inverse (sans son DROP de la fonction nouvelle).
  await c.query(lire(INVERSE));
  await c.query(`REVOKE ALL ON FUNCTION public.fiche_completer_depuis_annonce(uuid) FROM PUBLIC;
    GRANT EXECUTE ON FUNCTION public.fiche_completer_depuis_annonce(uuid) TO service_role`);
  await c.query(DECOR.declencheur);
  const arreter = async () => { await c.end().catch(() => {}); await base.stop().catch(() => {}); try { rmSync(dossier, { recursive: true, force: true }); } catch { /* temp */ } };
  return { c, arreter };
}

export const md5 = async (c, nom) => (await c.query(`SELECT md5(pg_get_functiondef(${SIG[nom]})) m`)).rows[0].m;
export const droits = async (c) => (await c.query(`SELECT proname, proacl::text a, prosecdef s, pg_get_userbyid(proowner) o, proconfig::text cfg
  FROM pg_proc WHERE proname IN ('fiche_completer_depuis_annonce', 'inventaire_attributs_avant_update') ORDER BY 1`)).rows;
const existeAide = async (c) => (await c.query(`SELECT to_regprocedure('public.annonce_vient_de_notre_depot(bigint,uuid,text,text,uuid)') IS NOT NULL e`)).rows[0].e;

const ATT = (v, source, at = '2026-11-02T14:45:15.568Z') => ({ v, source, at });
async function semer(c) {
  await c.query('TRUNCATE public.inventaire, public.annonces_plateforme, public.cross_post_jobs, public.inventaire_journal');
  const fiches = [
    [1, U, 'girls green ribbed leggings, EU 140cm', 'River Island', { attributs_visibles: { at: '2026-11-02T14:45:15.568Z', source: 'lens', v: { coupe: 'legging', taille: 'EU 140cm' } }, couleur: ATT('Green', 'lens'), etat: ATT('Très bon état', 'vinted_liste', '2026-11-12T19:24:45.660Z') }],
    [2, U, 'pull bleu', null, {}],
    [3, U, 'bottines noires', 'Marque essai', { attributs_visibles: { source: 'lens', v: { pointure: 'EU 38' } } }],
    [4, U, 'robe suivie', 'Marque essai', {}],
    [5, U, 'jupe détachée', 'Marque essai', {}],
    [6, U, 'veste désignée', 'Marque essai', {}],
  ];
  for (const [id, u, titre, marque, attributs] of fiches) {
    await c.query('INSERT INTO public.inventaire (id, user_id, titre, marque, attributs) VALUES ($1, $2, $3, $4, $5)', [id, u, titre, marque, attributs]);
  }
  const job = (id, inv, pf, action, status, pid, pfx = {}) => c.query(`INSERT INTO public.cross_post_jobs (id, user_id, inventaire_id, platform, action,
    status, platform_listing_id, platform_fields) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`, [id, U, inv, pf, action, status, pid, { taille: 'x', ...pfx }]);
  await job('8c447bfa-0000-4000-8000-000000000001', 1, 'beebs', 'publish', 'published', '34348231');
  await job('e05bc4ae-0000-4000-8000-000000000001', 1, 'vinted', 'publish', 'published', '10782832009');
  await job('00000004-0000-4000-8000-000000000001', 4, 'beebs', 'publish', 'published', '44000001', { source: 'releve' });
  await job('00000005-0000-4000-8000-000000000001', 5, 'beebs', 'publish', 'published', '55000001', { detache_le: '2026-11-01T00:00:00Z' });
  await job('00000006-0000-4000-8000-000000000001', 6, 'beebs', 'publish', 'cancelled', '66000001');
  const annonce = (id, inv, pf, listing, jobId, capture) => c.query(`INSERT INTO public.annonces_plateforme (id, user_id, inventaire_id, platform,
    listing_id, job_id, capture) VALUES ($1, $2, $3, $4, $5, $6, $7)`, [id, U, inv, pf, listing, jobId, capture]);
  const cap = { taille: 'Naissance - 0 mois (45-50 cm)', marque: 'Autre', description: 'Leggings côtelés verts.', etat: 'Très bon état', couleur: 'Vert', age: '10 ans' };
  await annonce('5fe588f5-0000-4000-8000-000000000001', 1, 'beebs', '34348231', '8c447bfa-0000-4000-8000-000000000001', cap);
  await annonce('00000002-0000-4000-8000-0000000000a2', 2, 'leboncoin', '2900000001', null, { taille: 'M', etat: 'Bon état', couleur: 'Bleu', description: 'Pull bleu en laine.' });
  await annonce('00000003-0000-4000-8000-0000000000a3', 3, 'beebs', '33000001', null, { taille: '38', couleur: 'Noir' });
  await annonce('00000004-0000-4000-8000-0000000000a4', 4, 'beebs', '44000001', '00000004-0000-4000-8000-000000000001', { taille: 'S', couleur: 'Rouge' });
  await annonce('00000005-0000-4000-8000-0000000000a5', 5, 'beebs', '55000001', '00000005-0000-4000-8000-000000000001', { taille: 'L', couleur: 'Jaune' });
  await annonce('00000006-0000-4000-8000-0000000000a6', 6, 'beebs', '66000001', null, { taille: 'XL', couleur: 'Gris' });
}

const fiche = async (c, id) => (await c.query('SELECT description, marque, type, attributs FROM public.inventaire WHERE id = $1', [id])).rows[0];
const sansAt = (a) => Object.fromEntries(Object.entries(a ?? {}).map(([k, x]) => [k, x && typeof x === 'object' && 'v' in x ? { v: x.v, source: x.source } : x]));

/** Le relevé de l'extension (PATCH inventaire.attributs, JWT du compte) : ses propositions, puis la fiche obtenue. */
async function patchExtension(c, id, propositions, compte = U) {
  await c.query('BEGIN');
  try {
    await c.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [compte]);
    await c.query('SET LOCAL ROLE authenticated');
    const r = await c.query(`UPDATE public.inventaire SET attributs = COALESCE(attributs, '{}'::jsonb) || $2::jsonb WHERE id = $1 RETURNING id`, [id, propositions]);
    await c.query('COMMIT');
    return r.rowCount;
  } catch (e) { await c.query('ROLLBACK'); throw e; }
}

/** Le tour d'une étape : chaque cas, sur un semis neuf ; rend un instantané comparable. */
export async function tour(c) {
  const out = {};
  await semer(c);
  const completer = async (annonce) => (await c.query('SELECT public.fiche_completer_depuis_annonce($1) r', [annonce])).rows[0].r;
  out.F_completer = await completer('5fe588f5-0000-4000-8000-000000000001');
  out.F_apres_completer = sansAt((await fiche(c, 1)).attributs);
  out.F_description = (await fiche(c, 1)).description;
  out.G_completer = await completer('00000002-0000-4000-8000-0000000000a2');
  out.G = sansAt((await fiche(c, 2)).attributs);
  out.H_completer = await completer('00000003-0000-4000-8000-0000000000a3');
  out.H = sansAt((await fiche(c, 3)).attributs);
  out.K_completer = await completer('00000004-0000-4000-8000-0000000000a4');
  out.L_completer = await completer('00000005-0000-4000-8000-0000000000a5');
  out.M_completer = await completer('00000006-0000-4000-8000-0000000000a6');
  out.journal = (await c.query('SELECT inventaire_id, champ, apres, source FROM public.inventaire_journal ORDER BY inventaire_id, champ')).rows;
  // Le relevé de l'extension, sur un semis neuf (le chemin réel du 12/11 21:10).
  await semer(c);
  const at = '2026-11-12T20:10:40.921Z';
  await patchExtension(c, 1, { taille: ATT('Naissance - 0 mois (45-50 cm)', 'releve_beebs', at), marque: ATT('Autre', 'releve_beebs', at) });
  out.F_extension = sansAt((await fiche(c, 1)).attributs);
  await patchExtension(c, 1, { contenu_divergent: { v: false, source: 'releve_beebs', at } });
  out.F_divergent = (await fiche(c, 1)).attributs.contenu_divergent?.source ?? null;
  await patchExtension(c, 1, { couleur: ATT('Vert', 'releve_leboncoin', at) });
  out.F_autre_plateforme = (await fiche(c, 1)).attributs.couleur;
  await patchExtension(c, 1, { taille: ATT('10 ans', 'manuel', at) });
  out.F_manuel = (await fiche(c, 1)).attributs.taille ?? null;
  await patchExtension(c, 2, { taille: ATT('M', 'releve_leboncoin', at) });
  out.G_extension = (await fiche(c, 2)).attributs.taille ?? null;
  await patchExtension(c, 4, { taille: ATT('S', 'releve_beebs', at) });
  out.K_extension = (await fiche(c, 4)).attributs.taille ?? null;
  await patchExtension(c, 5, { taille: ATT('L', 'releve_beebs', at) });
  out.L_extension = (await fiche(c, 5)).attributs.taille ?? null;
  await patchExtension(c, 6, { taille: ATT('XL', 'releve_beebs', at) });
  out.M_extension = (await fiche(c, 6)).attributs.taille ?? null;
  // Un autre compte ne voit rien de U (RLS) : la fonction nouvelle ne renseigne jamais sur les tâches d'autrui.
  if (await existeAide(c)) {
    await c.query('BEGIN');
    await c.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [V]);
    await c.query('SET LOCAL ROLE authenticated');
    out.aide_autre_compte = (await c.query(`SELECT public.annonce_vient_de_notre_depot(1, $1::uuid, 'beebs') r`, [U])).rows[0].r;
    await c.query('ROLLBACK');
  }
  return out;
}

const principal = !!process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (principal) {
  let n = 0, ko = 0;
  const ok = (cond, msg, d) => { n++; if (cond) console.log(`  ✓ ${msg}`); else { ko++; console.log(`  ✗ ${msg}${d === undefined ? '' : `\n      ← ${JSON.stringify(d).slice(0, 700)}`}`); } };
  const egal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const { c, arreter } = await demarrer(54000 + Math.floor(Math.random() * 2000));
  try {
    for (const nom of Object.keys(MD5_PROD)) ok(await md5(c, nom) === MD5_PROD[nom], `décor : ${nom}, la définition de prod à l'octet (md5 ${MD5_PROD[nom]})`);
    const D0 = await droits(c);
    console.log('A. AVANT — la prod');
    const A = await tour(c);
    ok(A.F_apres_completer.taille?.v === 'Naissance - 0 mois (45-50 cm)' && A.F_apres_completer.taille?.source === 'releve_beebs',
      'A (le défaut) : fiche_completer_depuis_annonce pose « Naissance… » de NOTRE dépôt Beebs sur une fiche dont l\'étiquette dit EU 140cm', A.F_apres_completer);
    ok(A.F_extension.taille?.v === 'Naissance - 0 mois (45-50 cm)' && A.F_extension.marque?.v === 'Autre',
      'A (le défaut, chemin réel du 12/11) : le relevé de l\'extension réécrit taille et marque depuis notre dépôt', A.F_extension);
    ok(A.H.taille?.v === '38', 'A : la taille de H est complétée alors que l\'étiquette (attributs_visibles.pointure) la dit', A.H);
    // La garde : une définition qui n'est pas celle de prod → la migration refuse, rien n'est réécrit.
    await c.query(`CREATE OR REPLACE FUNCTION public.inventaire_attributs_avant_update() RETURNS trigger LANGUAGE plpgsql AS $f$ BEGIN RETURN NEW; END $f$`);
    let refus = null;
    try { await c.query(lire(MIGRATION)); } catch (e) { refus = e.message; await c.query('ROLLBACK').catch(() => {}); }
    ok(/a changé en prod depuis sa lecture du 12\/11/.test(refus ?? ''), 'garde : la migration refuse une définition autre que celle de prod', refus);
    ok(!(await existeAide(c)), 'garde : rien n\'a été créé (transaction annulée)');
    await c.query(lire(INVERSE));
    ok(await md5(c, 'inventaire_attributs_avant_update') === MD5_PROD.inventaire_attributs_avant_update, 'la prod remise (inverse)');

    console.log('B. MIGRATION');
    await c.query(lire(MIGRATION));
    ok(await existeAide(c), 'B : annonce_vient_de_notre_depot créée');
    const B = await tour(c);
    ok(egal(B.F_completer, { ok: true, champs: [], raison: 'depot_fillsell' }), 'B : fiche_completer_depuis_annonce ne complète RIEN depuis notre dépôt Beebs', B.F_completer);
    ok(!('taille' in B.F_apres_completer) && !('marque' in B.F_apres_completer) && B.F_description === null, 'B : ni taille, ni marque, ni description reprises de notre dépôt', B.F_apres_completer);
    ok(!('taille' in B.F_extension) && !('marque' in B.F_extension), 'B : le relevé de l\'extension n\'écrit plus taille ni marque depuis notre dépôt (chemin réel)', B.F_extension);
    ok(egal(B.F_extension, A.F_extension.taille ? Object.fromEntries(Object.entries(A.F_extension).filter(([k]) => k !== 'taille' && k !== 'marque')) : null),
      'B : le reste de la fiche est identique à A (étiquette, couleur, état)', { A: A.F_extension, B: B.F_extension });
    ok(B.F_divergent === 'releve_beebs' && A.F_divergent === 'releve_beebs', 'B : contenu_divergent (signal, pas une valeur) passe comme avant');
    ok(egal(B.F_autre_plateforme, A.F_autre_plateforme) && B.F_autre_plateforme?.source === 'releve_leboncoin', 'B : un relevé d\'une plateforme SANS dépôt de la fiche passe comme avant', B.F_autre_plateforme);
    ok(egal(B.F_manuel, A.F_manuel) && B.F_manuel?.source === 'manuel', 'B : une saisie (manuel) passe comme avant');
    ok(egal(B.G_completer, A.G_completer) && egal(B.G, A.G) && B.G.taille?.v === 'M', 'B : G (annonce de la personne, sans dépôt) complétée à l\'identique', { A: A.G, B: B.G });
    ok(egal(B.G_extension, A.G_extension), 'B : G, le relevé de l\'extension à l\'identique');
    ok(!('taille' in B.H) && B.H.couleur?.v === 'Noir' && A.H.couleur?.v === 'Noir', 'B : H, la taille n\'est plus complétée (l\'étiquette la renseigne), la couleur l\'est toujours', B.H);
    ok(egal(B.K_completer, A.K_completer) && egal(B.K_extension, A.K_extension) && B.K_extension?.v === 'S', 'B : K, un suivi de relevé n\'est pas un dépôt FillSell (inchangé)', { A: A.K_completer, B: B.K_completer });
    ok(egal(B.L_completer, A.L_completer) && egal(B.L_extension, A.L_extension) && B.L_extension?.v === 'L', 'B : L, un dépôt détaché n\'est pas un dépôt FillSell (inchangé)');
    ok(B.M_completer?.raison === 'depot_fillsell' && B.M_extension === null && A.M_extension?.v === 'XL', 'B : M, un dépôt désigné par l\'identifiant de l\'annonce compte (job_id vide)', { A: A.M_extension, B: B.M_completer });
    ok(B.journal.every((l) => l.inventaire_id !== 1 && l.inventaire_id !== 6), 'B : aucune ligne de journal pour les fiches déposées', B.journal);
    ok(B.aide_autre_compte === false, 'B : un autre compte n\'apprend rien des tâches d\'autrui (RLS)', B.aide_autre_compte);
    ok(egal(await droits(c), D0), 'B : droits, SECURITY DEFINER, propriétaire, search_path inchangés', await droits(c));

    console.log('C. INVERSE');
    await c.query(lire(INVERSE));
    const C = await tour(c);
    ok(await md5(c, 'fiche_completer_depuis_annonce') === MD5_PROD.fiche_completer_depuis_annonce
      && await md5(c, 'inventaire_attributs_avant_update') === MD5_PROD.inventaire_attributs_avant_update && !(await existeAide(c)),
    'C : la prod à l\'octet (md5), la fonction nouvelle retirée');
    ok(egal(C, A), 'C : A de nouveau, cas par cas', { A, C });
    ok(egal(await droits(c), D0), 'C : droits inchangés');
    console.log('D. MIGRATION rejouée');
    await c.query(lire(MIGRATION));
    ok(egal(await tour(c), B), 'D : B de nouveau');

    console.log('E. LA RÉPARATION DE LA FICHE 1793630721658 (scripts/reparations/20261112_c7c382b7_fiche_legging*.sql)');
    const REP = 'scripts/reparations/20261112_c7c382b7_fiche_legging.sql', REP_INV = 'scripts/reparations/20261112_c7c382b7_fiche_legging_INVERSE.sql';
    const W = 'c7c382b7-0000-4000-8000-0000000000e2';   // un compte d'essai dont l'id8 est celui du cas
    const semerFiche = async () => {
      await c.query('TRUNCATE public.inventaire, public.annonces_plateforme, public.cross_post_jobs, public.inventaire_journal');
      await c.query('DROP TABLE IF EXISTS public._backup_1112_c7c382b7_fiche_legging');
      await c.query(`INSERT INTO public.inventaire (id, user_id, titre, marque, attributs) VALUES (1793630721658, $1, 'leggings', 'River Island', $2)`, [W, {
        attributs_visibles: { at: '2026-11-02T14:45:15.568Z', source: 'lens', v: { coupe: 'legging', reference_fabricant: '451458', taille: 'EU 140cm' } },
        couleur: ATT('Green', 'lens'), etat: ATT('Très bon état', 'vinted_liste', '2026-11-12T19:24:45.660Z'),
        marque: ATT('Autre', 'releve_beebs', '2026-11-12T20:10:40.921Z'), taille: ATT('Naissance - 0 mois (45-50 cm)', 'releve_beebs', '2026-11-12T20:10:40.921Z'),
      }]);
      await c.query(`INSERT INTO public.cross_post_jobs (id, user_id, inventaire_id, platform, action, status, platform_listing_id, platform_fields)
        VALUES ('8c447bfa-0000-4000-8000-0000000000e2', $1, 1793630721658, 'beebs', 'publish', 'published', '34348231', '{"taille":"Naissance - 0 mois (45-50 cm)"}')`, [W]);
    };
    const attrs = async () => (await c.query('SELECT attributs FROM public.inventaire WHERE id = 1793630721658')).rows[0].attributs;
    const tente = async (fichier) => { try { await c.query(lire(fichier)); return null; } catch (e) { await c.query('ROLLBACK').catch(() => {}); return e.message; } };
    // Sans la migration : refus.
    await c.query(lire(INVERSE));
    await semerFiche();
    const avant0 = await attrs();
    const r0 = await tente(REP);
    ok(/migration 20261112213000 absente/.test(r0 ?? '') && egal(await attrs(), avant0), 'E : sans la migration, la réparation refuse et n\'écrit rien', r0);
    await c.query(lire(MIGRATION));
    await semerFiche();
    const avant = await attrs();
    const r1 = await tente(REP);
    const apres = await attrs();
    ok(r1 === null && !('taille' in apres) && !('marque' in apres), 'E : taille et marque du relevé retirées', { r1, apres });
    const { taille: _t, marque: _m, ...reste } = avant;
    ok(egal(apres, reste), 'E : rien d\'autre ne bouge (étiquette, couleur, état)', { avant, apres });
    ok((await c.query('SELECT count(*)::int n FROM public._backup_1112_c7c382b7_fiche_legging')).rows[0].n === 1, 'E : la sauvegarde porte la fiche');
    ok(/script déjà passé/.test((await tente(REP)) ?? ''), 'E : rejouée, elle refuse (sauvegarde présente)');
    // Un relevé Beebs suivant (notre dépôt) ne la réécrit plus.
    await patchExtension(c, 1793630721658, { taille: ATT('Naissance - 0 mois (45-50 cm)', 'releve_beebs', '2026-11-13T08:00:00.000Z'), marque: ATT('Autre', 'releve_beebs', '2026-11-13T08:00:00.000Z') }, W);
    ok(!('taille' in (await attrs())) && !('marque' in (await attrs())), 'E : le relevé suivant de notre dépôt Beebs ne réécrit plus la fiche');
    const r2 = await tente(REP_INV);
    ok(r2 === null && egal(await attrs(), avant), 'E : l\'inverse rend la fiche telle qu\'avant, à l\'octet', { r2, a: await attrs() });
    // Une fiche déjà retouchée : refus.
    await semerFiche();
    await c.query(`UPDATE public.inventaire SET attributs = attributs || '{"taille":{"v":"10 ans","source":"manuel","at":"2026-11-13T09:00:00Z"}}' WHERE id = 1793630721658`);
    ok(/ne porte plus les valeurs du relevé/.test((await tente(REP)) ?? ''), 'E : une fiche retouchée depuis le relevé n\'est pas touchée');
  } finally { await arreter(); }
  console.log(`\n${n - ko}/${n} contrôles verts${ko ? ` — ${ko} ROUGE(S)` : ''}`);
  process.exit(ko ? 1 : 0);
}
