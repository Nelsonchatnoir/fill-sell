// LE BANC de la migration 20261113203000_lbc_refus_dit_refus (13/11/2026, lot du 13/11 — 2e réponse de Nico, agent LBC :
// « REFUS LEBONCOIN SANS MOTIF », compte f0acd3af) — SUR UN POSTGRES JETABLE (embedded-postgres sur le poste), jamais la prod.
//   node scripts/essais/20261113203000_banc.mjs            (A → D, vert attendu)
//   node scripts/essais/20261113203000_banc.mjs --avant    (la RÈGLE jugée sur le corps de PROD seul : rouge attendu)
// Décor : les tables que lit trancher_publications_sans_lien (colonnes utiles, lues en prod le 13/11), ses appels réduits à
// leur effet dans ces scénarios (refermeture, rejugement, remboursement : neutres ; releve_preuve_absence : la règle de
// prod sans les cas eBay ; phrase_rien_vendu : le corps de prod). Le cas réel : un dépôt Leboncoin confirmé, sans lien,
// absent de deux relevés complets (« active 64 », 64 lues sur 64) commencés 6 h 20 et 16 h après lui.
// Étapes : A. AVANT — corps de prod : le texte d'avant (« absente », « annonce semblable » sans preuve) ; B. MIGRATION —
// Leboncoin dit « Leboncoin a refusé cette annonce juste après son dépôt du … » (boucle sans lien ET avec lien), la photo
// identique prouvée garde sa phrase, eBay inchangé à l'octet, statut et trace inchangés ; C. INVERSE — le corps de prod à
// l'octet (md5), la fonction de texte retirée, le texte d'avant revient ; D. MIGRATION rejouée — B de nouveau.
import pg from 'pg';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const lire = (p) => readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');
export const MIGRATION = 'supabase/migrations/20261113203000_lbc_refus_dit_refus.sql';
export const INVERSE = 'supabase/rollbacks/20261113203000_lbc_refus_dit_refus_INVERSE.sql';
const MD5_PROD = '58a5c7faaa12ba8a66e9b8b9db98afdf';

const U = 'f0acd3af-0000-4000-8000-000000000001';   // préfixe du compte du cas, id d'essai
const J1 = 'ae8d7ec6-0000-4000-8000-0000000000a1';  // dépôt Leboncoin SANS lien (le cas : 3308018636)
const J2 = '9e22b88c-0000-4000-8000-0000000000a2';  // dépôt Leboncoin AVEC lien (seconde boucle)
const J3 = 'e8000000-0000-4000-8000-0000000000a3';  // dépôt eBay avec lien : texte inchangé
const J4 = 'd0000000-0000-4000-8000-0000000000a4';  // dépôt Leboncoin sans lien, photo identique à une annonce en ligne
const H = 3600_000;
const T = Math.floor(Date.now() / 60_000) * 60_000;   // maintenant, à la minute
const iso = (ms) => new Date(ms).toISOString();
const DEPOT = T - 17 * H, R0 = T - 10 * H - 40 * 60_000, R1 = T - 1 * H;
const paris = (ms) => {
  const p = Object.fromEntries(new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return `${p.day}/${p.month} à ${p.hour}h${p.minute}`;
};

const PRELUDE = String.raw`
DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE service_role NOLOGIN BYPASSRLS; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE TABLE public.vinted_sync_runs (id uuid PRIMARY KEY, user_id uuid, kind text, status text, platform text, started_at timestamptz,
  finished_at timestamptz, items_vus integer, total_entries integer, erreur text, vinted_user_id text);
CREATE TABLE public.cross_post_jobs (id uuid PRIMARY KEY, user_id uuid, platform text, status text, action text, listing_url text,
  platform_listing_id text, platform_fields jsonb, inventaire_id bigint, vu_en_ligne_le timestamptz, published_at timestamptz,
  created_at timestamptz DEFAULT now(), error text, price numeric);
CREATE TABLE public.annonces_plateforme (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, platform text, listing_id text, url text,
  statut_plateforme text, disparu_le timestamptz, vu_le timestamptz, inventaire_id bigint, job_id uuid, photo_url text);
CREATE TABLE public.inventaire (id bigint PRIMARY KEY, user_id uuid, photos jsonb);
CREATE TABLE public.photo_empreintes (url text PRIMARY KEY, dhash text);
CREATE TABLE public.fiches_liees_comptes (fiche_a bigint, fiche_b bigint);
-- La règle de prod (lue le 13/11), sans ses cas eBay (releve_ebay_run_bloque / _incomplet) ni releve_hors_liste.
CREATE FUNCTION public.releve_preuve_absence(p_run uuid) RETURNS boolean LANGUAGE sql STABLE AS $f$
  SELECT COALESCE((SELECT r.status = 'done' AND r.kind = 'annonces' AND COALESCE(r.items_vus, 0) > 0 AND r.finished_at IS NOT NULL
    AND COALESCE(r.erreur, '') NOT LIKE '[incomplet]%' AND (r.total_entries IS NULL OR r.items_vus >= r.total_entries)
    FROM public.vinted_sync_runs r WHERE r.id = p_run), false) $f$;
CREATE FUNCTION public.depot_jamais_en_ligne_refermer(uuid, text, bigint, text, uuid) RETURNS jsonb LANGUAGE sql AS $f$ SELECT NULL::jsonb $f$;
CREATE FUNCTION public.depots_clos_sur_annonce_vendue_rejuger(uuid, text, uuid) RETURNS jsonb LANGUAGE sql AS $f$ SELECT NULL::jsonb $f$;
CREATE FUNCTION public.annonce_prise_par_une_vente(uuid, text, text) RETURNS boolean LANGUAGE sql AS $f$ SELECT false $f$;
CREATE FUNCTION public.refund_publish_unconfirmed(uuid) RETURNS jsonb LANGUAGE sql AS $f$ SELECT '{"rembourse":0,"raison":"sans_reservation"}'::jsonb $f$;
CREATE FUNCTION public.annonce_id_job(p_platform text, p_url text) RETURNS text LANGUAGE sql IMMUTABLE AS $f$ SELECT substring(coalesce(p_url, '') from '(\d{6,})') $f$;
CREATE FUNCTION public.jumelle_occupe_plateformes(uuid, bigint) RETURNS TABLE(platform text, statut text, listing_id text, compte uuid)
  LANGUAGE sql AS $f$ SELECT NULL::text, NULL::text, NULL::text, NULL::uuid WHERE false $f$;
CREATE FUNCTION public._ts_ou_null(text) RETURNS timestamptz LANGUAGE sql IMMUTABLE AS $f$ SELECT NULL::timestamptz $f$;
CREATE FUNCTION public.beebs_preuve_jamais_en_ligne(uuid, text, timestamptz, numeric, jsonb, uuid) RETURNS jsonb LANGUAGE sql AS $f$ SELECT NULL::jsonb $f$;
CREATE FUNCTION public.beebs_message_jamais_en_ligne(jsonb, boolean, text) RETURNS text LANGUAGE sql AS $f$ SELECT 'beebs'::text $f$;
-- phrase_rien_vendu : le corps de PROD (20261107140000).
CREATE OR REPLACE FUNCTION public.phrase_rien_vendu(p_platform_fields jsonb, p_majuscule boolean DEFAULT false)
 RETURNS text LANGUAGE sql IMMUTABLE SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT CASE WHEN COALESCE(p_platform_fields, '{}'::jsonb) ? 'remise_en_vente'
              THEN CASE WHEN p_majuscule THEN 'Ta vente d''avant n''est pas touchée' ELSE 'ta vente d''avant n''est pas touchée' END
              ELSE CASE WHEN p_majuscule THEN 'Rien n''est vendu' ELSE 'rien n''est vendu' END END;
$function$;
`;

const run = (id, platform, debut) => `('${id}', '${U}', 'annonces', 'done', '${platform}', '${iso(debut)}', '${iso(debut + 30_000)}', 64, 64,
  '[défilement] [adresse] 1 page(s), 64 en ligne lues sur 64 annoncées · [statuts] active 64', NULL)`;
const DONNEES = `
TRUNCATE public.vinted_sync_runs, public.cross_post_jobs, public.annonces_plateforme, public.inventaire, public.photo_empreintes, public.fiches_liees_comptes;
INSERT INTO public.vinted_sync_runs VALUES
  ${run('cb84553f-0000-4000-8000-000000000001', 'leboncoin', R0)}, ${run('993ceab6-0000-4000-8000-000000000002', 'leboncoin', R1)},
  ${run('cb84553f-0000-4000-8000-0000000000e1', 'ebay', R0)}, ${run('993ceab6-0000-4000-8000-0000000000e2', 'ebay', R1)};
INSERT INTO public.inventaire VALUES (1792852026414000, '${U}', '[{"url":"https://photos.invalid/haut-1.jpg"}]'),
  (1794000000000004, '${U}', '[{"url":"https://photos.invalid/pull-1.jpg"}]'), (1794000000000099, '${U}', '[]');
INSERT INTO public.photo_empreintes VALUES ('https://photos.invalid/pull-1.jpg', 'a1b2c3'), ('https://img.leboncoin.invalid/vignette-3300000001.jpg', 'a1b2c3');
INSERT INTO public.annonces_plateforme (user_id, platform, listing_id, url, statut_plateforme, vu_le, inventaire_id, photo_url) VALUES
  ('${U}', 'leboncoin', '3300000001', 'https://www.leboncoin.fr/ad/vetements/3300000001', 'en_ligne', '${iso(R1)}', 1794000000000099,
   'https://img.leboncoin.invalid/vignette-3300000001.jpg');
INSERT INTO public.cross_post_jobs (id, user_id, platform, status, action, listing_url, platform_listing_id, platform_fields, inventaire_id, published_at, created_at, price) VALUES
  ('${J1}', '${U}', 'leboncoin', 'published', 'publish', NULL, '3308018636',
   '{"lbc_depot":{"adsubmit":null,"sans_adsubmit":{"id":"3308018636","cle":"ad_id"}},"moderation_probe":{"misses":1}}', 1792852026414000, '${iso(DEPOT)}', '${iso(DEPOT - H)}', 12),
  ('${J2}', '${U}', 'leboncoin', 'published', 'publish', 'https://www.leboncoin.fr/ad/informatique/3307984312', '3307984312',
   '{"lbc_depot":{"adsubmit":{"id":"3307984312","status":201}}}', NULL, '${iso(DEPOT)}', '${iso(DEPOT - H)}', 15),
  ('${J3}', '${U}', 'ebay', 'published', 'publish', 'https://www.ebay.fr/itm/407300000003', '407300000003', '{}', NULL, '${iso(DEPOT)}', '${iso(DEPOT - H)}', 20),
  ('${J4}', '${U}', 'leboncoin', 'published', 'publish', NULL, '3308000004', '{"lbc_depot":{"adsubmit":{"id":"3308000004","status":201}}}',
   1794000000000004, '${iso(DEPOT)}', '${iso(DEPOT - H)}', 18);
`;

export async function demarrer(port) {
  const { default: EmbeddedPostgres } = await import('embedded-postgres');
  const dossier = mkdtempSync(join(tmpdir(), 'fillsell-banc-lbc-refus-'));
  const base = new EmbeddedPostgres({ databaseDir: dossier, user: 'postgres', password: 'banc', port, persistent: false,
    initdbFlags: ['--encoding=UTF8', '--locale=C'], onLog: () => {}, onError: () => {} });
  await base.initialise(); await base.start();
  const c = new pg.Client({ connectionString: `postgres://postgres:banc@127.0.0.1:${port}/postgres` });
  await c.connect(); c.on('notice', () => {});
  await c.query(PRELUDE);
  const arreter = async () => { await c.end().catch(() => {}); await base.stop().catch(() => {}); try { rmSync(dossier, { recursive: true, force: true }); } catch { /* temp */ } };
  return { c, arreter };
}

const trancher = async (c) => {
  await c.query(DONNEES);
  const r1 = (await c.query(`SELECT public.trancher_publications_sans_lien($1, 'leboncoin', '993ceab6-0000-4000-8000-000000000002') r`, [U])).rows[0].r;
  const r2 = (await c.query(`SELECT public.trancher_publications_sans_lien($1, 'ebay', '993ceab6-0000-4000-8000-0000000000e2') r`, [U])).rows[0].r;
  const jobs = Object.fromEntries((await c.query(`SELECT id::text, status, error, platform_fields FROM public.cross_post_jobs`)).rows.map((x) => [x.id, x]));
  return { r1, r2, jobs };
};
const md5Trancher = async (c) => (await c.query(`SELECT md5(pg_get_functiondef('public.trancher_publications_sans_lien(uuid,text,uuid)'::regprocedure)) m`)).rows[0].m;
const aFonctionTexte = async (c) => (await c.query(`SELECT count(*)::int n FROM pg_proc WHERE proname = 'message_refus_leboncoin'`)).rows[0].n === 1;

// LA RÈGLE (ce que Nico demande) : un refus Leboncoin se dit « refusée par Leboncoin », ni « absente », ni un doublon non prouvé.
function verifierRegle(e, ok, p) {
  const attendu1 = `Leboncoin a refusé cette annonce juste après son dépôt du ${paris(DEPOT)} : elle n'est jamais apparue dans tes annonces `
    + `Leboncoin (relevés complets du ${paris(R0 + 30_000)} et du ${paris(R1 + 30_000)}), où Leboncoin ne montre pas une annonce refusée. `
    + `Son motif est dans le mail « Votre annonce … a été refusée » qu'il t'a envoyé ; corrige ce qu'il dit avant de la relancer, sinon la même `
    + `annonce serait refusée de même. Rien n'est vendu, ton article reste dans ton stock, et cette publication ne compte pas dans tes limites.`;
  const j1 = e.jobs[J1], j2 = e.jobs[J2], j4 = e.jobs[J4];
  ok(j1?.status === 'failed' && j1.error === attendu1, `${p} : le cas f0acd3af (sans lien) — « Leboncoin a refusé cette annonce juste après son dépôt du ${paris(DEPOT)} … »`, j1?.error);
  ok(!/absente|semblable|doublon|disparu/i.test(j1?.error ?? ''), `${p} : ni « absente », ni « semblable », ni « doublon », ni « disparue » sans preuve`, j1?.error);
  ok(j2?.status === 'failed' && j2.error === attendu1, `${p} : la boucle AVEC lien dit la même chose`, j2?.error);
  ok(j4?.status === 'failed' && /^Leboncoin a refusé cette annonce/.test(j4.error ?? '')
    && /Elle porte la même photo que ton annonce 3300000001, déjà en ligne sur Leboncoin : Leboncoin refuse une annonce semblable à une annonce déjà en ligne\./.test(j4.error ?? ''),
  `${p} : une photo identique PROUVÉE (empreinte) garde sa phrase, et seulement elle parle d'annonce semblable`, j4?.error);
}
function verifierInchange(e, ok, p) {
  const j1 = e.jobs[J1], j3 = e.jobs[J3], j4 = e.jobs[J4];
  ok(e.r1?.ok === true && e.r1.refusees === 3 && e.r2?.refusees === 1, `${p} : 3 refus Leboncoin, 1 eBay (compteurs de la fonction)`, { r1: e.r1, r2: e.r2 });
  ok(j1?.platform_fields?.depot_jamais_en_ligne?.issue === 'refus_moderation_probable' && j1.platform_fields.depot_jamais_en_ligne.premier === 'cb84553f-0000-4000-8000-000000000001'
    && j1.platform_fields.depot_jamais_en_ligne.refund?.raison === 'sans_reservation', `${p} : la trace depot_jamais_en_ligne (issue, relevés, publication rendue) inchangée`, j1?.platform_fields);
  ok(j4?.platform_fields?.depot_jamais_en_ligne?.doublon_photo_de === '3300000001', `${p} : la preuve de photo reste tracée`, j4?.platform_fields);
  ok(j3?.status === 'failed' && j3.error === `Cette annonce est absente de tes annonces eBay aux relevés complets du ${paris(R0 + 30_000)} et du ${paris(R1 + 30_000)}, et eBay n'a donné aucun motif. Rien n'est vendu, ton article reste dans ton stock, et cette publication ne compte pas dans tes limites.`,
    `${p} : eBay : texte d'avant, à l'octet`, j3?.error);
}

const principal = !!process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (principal) {
  const avantSeul = process.argv.includes('--avant');
  let n = 0, ko = 0;
  const ok = (cond, msg, d) => { n++; if (cond) console.log(`  ✓ ${msg}`); else { ko++; console.log(`  ✗ ${msg}${d === undefined ? '' : `\n      ← ${JSON.stringify(d).slice(0, 700)}`}`); } };
  const { c, arreter } = await demarrer(58000 + Math.floor(Math.random() * 2000));
  try {
    // Le corps de PROD : le fichier inverse le pose à l'octet (et retire une fonction de texte absente : sans effet).
    await c.query(lire(INVERSE));
    console.log('A. AVANT — le corps de prod lu le 13/11');
    ok(await md5Trancher(c) === MD5_PROD, 'A : md5 du corps posé = md5 de la prod du 13/11');
    const A = await trancher(c);
    if (avantSeul) {
      console.log('   (--avant) la règle jugée sur la prod :');
      verifierRegle(A, ok, 'A');
    } else {
      ok(/^Cette annonce est absente de tes annonces Leboncoin aux relevés complets du /.test(A.jobs[J1]?.error ?? '')
        && /par exemple quand une annonce semblable est déjà en ligne/.test(A.jobs[J1].error), 'A : le défaut — « absente » et « annonce semblable » sans aucune preuve de doublon', A.jobs[J1]?.error);
      verifierInchange(A, ok, 'A');

      console.log('B. MIGRATION');
      await c.query(lire(MIGRATION));
      ok(await aFonctionTexte(c), 'B : message_refus_leboncoin créée');
      const dr = (await c.query(`SELECT proacl::text a FROM pg_proc WHERE proname = 'message_refus_leboncoin'`)).rows[0];
      ok(!/(^|[{,])=X/.test(dr.a) && !/anon=X/.test(dr.a), 'B : la fonction de texte n\'est exécutable ni par PUBLIC ni par anon', dr);
      const B = await trancher(c);
      verifierRegle(B, ok, 'B'); verifierInchange(B, ok, 'B');
      // L'app en anglais (src/utils/messagesServeur.js) : les textes neufs se traduisent, le français reste à l'octet.
      const { traduireMessageServeur: tr } = await import(pathToFileURL(join(ROOT, 'src/utils/messagesServeur.js')).href);
      const { MESSAGE_JAMAIS_EN_LIGNE_LBC } = await import(pathToFileURL(join(ROOT, 'supabase/functions/_shared/depot-lbc-jamais-en-ligne.js')).href);
      const e1 = tr(B.jobs[J1].error, 'en'), e4 = tr(B.jobs[J4].error, 'en'), eh = tr(MESSAGE_JAMAIS_EN_LIGNE_LBC, 'en');
      ok(tr(B.jobs[J1].error, 'fr') === B.jobs[J1].error && /^Leboncoin refused this listing right after it was posted on \d{2}\/\d{2} at \d{2}:\d{2}: it never appeared/.test(e1)
        && /Nothing is sold, your item stays in your stock/.test(e1), 'B : app en anglais — le refus se lit « Leboncoin refused this listing … » (français inchangé)', e1);
      ok(/It has the same photo as your listing 3300000001, already online on Leboncoin: Leboncoin refuses a listing similar/.test(e4), 'B : app en anglais — la photo prouvée traduite', e4);
      ok(/^Leboncoin refused this listing: it never appeared/.test(eh), 'B : app en anglais — le texte de handler-watch (page fermée) traduit', eh);

      console.log('C. INVERSE');
      await c.query(lire(INVERSE));
      ok(await md5Trancher(c) === MD5_PROD && !(await aFonctionTexte(c)), 'C : corps de prod à l\'octet (md5), fonction de texte retirée');
      const C = await trancher(c);
      ok(C.jobs[J1]?.error === A.jobs[J1]?.error && C.jobs[J3]?.error === A.jobs[J3]?.error, 'C : les textes d\'avant reviennent à l\'identique');

      console.log('D. MIGRATION rejouée');
      await c.query(lire(MIGRATION));
      const D = await trancher(c);
      verifierRegle(D, ok, 'D'); verifierInchange(D, ok, 'D');
      const garde = await c.query(lire(MIGRATION)).then(() => null, (e) => e.message);
      await c.query('ROLLBACK').catch(() => {});
      ok(/a changé en prod/.test(garde ?? ''), 'D : rejouée sur un corps déjà migré → la garde md5 arrête tout (jamais forcer)', garde);
    }
  } finally { await arreter(); }
  console.log(`\n${n - ko}/${n} contrôles verts${ko ? ` — ${ko} ROUGE(S)` : ''}`);
  process.exit(ko ? 1 : 0);
}
