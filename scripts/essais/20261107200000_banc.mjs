// ESSAI, SUR UN POSTGRES JETABLE, de la migration 20261107200000_cloud_ref_close (07/11 soir, ordre de Nico : « un
// renouvellement de test de Nicotest ne doit jamais lui rallumer le Cloud ni lui réattribuer une place ou une IP ») —
// jamais la prod.
//   PREUVE_PG=embarque node scripts/essais/20261107200000_banc.mjs
// Corps de la PROD du 07/11 ~19:30 (scripts/essais/fixtures/prod-0711-ref-close/, pg_get_functiondef et pg_get_triggerdef
// relus en lecture seule) : la chaîne profiles → profiles_cloud_pool → cloud_compte_synchroniser → cloud_ip_attribuer,
// cloud_etat, cloud_comptes_a_servir. Décor = l'état relu en prod le 07/11 ~19:30 : Nicotest (canal apple, référence
// 2000001262935799, essai arrêté, fin 19:12 Paris), son ancienne IP 2 au repos (dernier titulaire : lui), les deux comptes
// de relecture d'Apple (d6a9e726, 953c1ca6 : Premium offert, sans Cloud).
// Les mises à jour sont celles des fonctions EN SERVICE, calculées par ecritureCloudStore (_shared/cloud-option.js).
//   A. AVANT : le DID_RENEW de Nicotest rallume son Cloud et lui rend l'IP 2 (le défaut) ;
//   B. la migration (deux fois), le geste (référence close), puis :
//      1. Nicotest, référence close : DID_RENEW, restauration (validate-apple-receipt), nouvel essai (SUBSCRIBED) →
//         rien ne se rallume, aucune IP, aucune réservation, aucune place ; les autres colonnes passent ; une ligne au
//         journal ; un « off » (EXPIRED) passe ; le BEFORE existant (acquisition) tient ; profiles_cloud_pool ne part pas ;
//      2. la même mise à jour sur un compte à référence NON close → Cloud rallumé comme aujourd'hui (IP, place) ;
//         (a) compte à référence close, NOUVEL achat avec une référence NOUVELLE → rallumé ;
//         (b) vrai client qui arrête (off / annulation) puis se réabonne avec une nouvelle référence → rallumé ;
//         (c) le même client, MÊME référence (réabonnement Apple) → rallumé ;
//      3. comptes de relecture : lignes inchangées par la migration, leurs achats bac à sable allument le Cloud ;
//      4. une mise à jour sans colonne Cloud ne déclenche rien (EXPLAIN ANALYZE : aucun appel) ;
//      5. la PREUVE de prod (scripts/reparations/…_PREUVE.sql) dit ok et n'écrit rien ;
//   C. l'INVERSE remet tout (déclencheurs = la prod, le DID_RENEW rallume de nouveau) ; la migration se rejoue.
import pg from 'pg';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { ecritureCloudStore, lectureCloudApple, PRODUIT_CLOUD_APPLE } from '../../supabase/functions/_shared/cloud-option.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const lire = (p) => readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');
let PG_URL = process.env.PREUVE_PG;
if (!PG_URL || /supabase\.co/.test(PG_URL)) { console.error('PREUVE_PG : un Postgres JETABLE (jamais la prod), ou « embarque ».'); process.exit(2); }
let embarque = null;
if (PG_URL === 'embarque') {
  const { default: EmbeddedPostgres } = await import('embedded-postgres');
  const dossier = mkdtempSync(join(tmpdir(), 'fillsell-banc-ref-close-'));
  embarque = { pg: new EmbeddedPostgres({ databaseDir: dossier, user: 'postgres', password: 'banc', port: 55451, persistent: false,
    initdbFlags: ['--encoding=UTF8', '--locale=C'], onLog: () => {} }), dossier };
  await embarque.pg.initialise();
  await embarque.pg.start();
  PG_URL = 'postgres://postgres:banc@127.0.0.1:55451/postgres';
}

const NICOTEST = '5322fa18-c194-458b-a222-7ee4093c4968';
const REF_NICOTEST = '2000001262935799';
const RELECTURE = ['d6a9e726-b6f1-4b7f-a927-2487668d6d96', '953c1ca6-4851-41e7-b2b0-fb2a18551815'];
const CLIENT_A = '00000000-0000-4000-8000-0000000000a1';   // vrai client, référence jamais close, Cloud payé VIVANT
const CLIENT_B = '00000000-0000-4000-8000-0000000000b1';   // vrai client, référence jamais close, Cloud ÉTEINT (expiré)
const COLS = ['is_cloud', 'cloud_canal', 'cloud_ref', 'cloud_periode_fin', 'cloud_essai_debut', 'cloud_essai_fin', 'cloud_essai_arrete', 'cloud_arret_fin_periode'];

// Un décor réduit aux colonnes que lisent les fonctions de la prod (types, défauts et contraintes relus le 07/11).
const DECOR = String.raw`
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role; END IF;
END $$;
CREATE TABLE public.coin_config (key text PRIMARY KEY, value integer, updated_at timestamptz DEFAULT now());
CREATE TABLE public.profiles (id uuid PRIMARY KEY, email text, display_name text,
  is_premium boolean DEFAULT false, is_pro boolean DEFAULT false, is_business boolean NOT NULL DEFAULT false,
  is_comped boolean NOT NULL DEFAULT false, is_founder boolean DEFAULT false, subscription_period_end text,
  subscription_cancel_at_period_end boolean DEFAULT false, apple_original_transaction_id text,
  is_cloud boolean, cloud_essai_debut timestamptz, cloud_essai_fin timestamptz, cloud_essai_arrete boolean NOT NULL DEFAULT false,
  cloud_periode_fin timestamptz, cloud_arret_fin_periode boolean NOT NULL DEFAULT false, cloud_canal text, cloud_ref text,
  cloud_essai_refus text, cloud_voie boolean NOT NULL DEFAULT false, platform_settings jsonb DEFAULT '{}'::jsonb,
  acquisition_source text, acquisition_medium text, acquisition_campaign text, acquisition_content text, acquisition_fbclid text,
  acquisition_referrer text, acquisition_captured_at timestamptz,
  CONSTRAINT profiles_cloud_canal_connu CHECK (cloud_canal IS NULL OR cloud_canal = ANY (ARRAY['stripe', 'apple', 'google', 'offert'])),
  CONSTRAINT profiles_cloud_essai_coherent CHECK (cloud_essai_fin IS NULL OR (cloud_essai_debut IS NOT NULL AND cloud_essai_fin >= cloud_essai_debut)));
CREATE TABLE public.cloud_ips (id bigserial PRIMARY KEY, fournisseur text NOT NULL DEFAULT 'iproyal', commande text NOT NULL, ip inet NOT NULL,
  port integer NOT NULL DEFAULT 12323, pays text NOT NULL DEFAULT 'FR', ville text, asn text, secret_nom text, etat text NOT NULL DEFAULT 'achetee',
  user_id uuid, dernier_user_id uuid, derniere_origine text, reserve_pour uuid, reserve_jusqu_au timestamptz, attribuee_le timestamptz,
  liberee_le timestamptz, repos_fin timestamptz, purge_preuve jsonb, purge_prouvee_le timestamptz, expire_le timestamptz NOT NULL,
  livree_le timestamptz NOT NULL DEFAULT now(), attributions integer NOT NULL DEFAULT 0, rebut_critere text, rebut_le timestamptz,
  cree_le timestamptz NOT NULL DEFAULT now(), maj_le timestamptz NOT NULL DEFAULT now(), refus jsonb NOT NULL DEFAULT '{}'::jsonb,
  CHECK (etat IN ('achetee', 'disponible', 'attribuee_essai', 'attribuee_client', 'repos', 'rebut', 'expiree')),
  CHECK ((etat IN ('attribuee_essai', 'attribuee_client')) = (user_id IS NOT NULL)),
  CHECK ((reserve_pour IS NULL) = (reserve_jusqu_au IS NULL)),
  CHECK (etat <> 'repos' OR (liberee_le IS NOT NULL AND repos_fin IS NOT NULL)));
CREATE UNIQUE INDEX cloud_ips_un_titulaire ON public.cloud_ips (user_id) WHERE user_id IS NOT NULL;
CREATE TABLE public.cloud_ip_evenements (id bigserial PRIMARY KEY, ip_id bigint NOT NULL REFERENCES public.cloud_ips (id),
  le timestamptz NOT NULL DEFAULT now(), nature text NOT NULL, user_id uuid, details jsonb NOT NULL DEFAULT '{}'::jsonb);
CREATE TABLE public.cloud_attente (user_id uuid PRIMARY KEY, demande_le timestamptz DEFAULT now(), derniere_le timestamptz DEFAULT now(),
  essais integer DEFAULT 0, inscrit_le timestamptz);
CREATE TABLE public.cloud_postes (user_id uuid PRIMARY KEY, serveur text, etat text NOT NULL DEFAULT 'eteint', session_fillsell_id uuid);
CREATE TABLE public.cloud_coffre (user_id uuid, plateforme text, connecte boolean DEFAULT false);
CREATE TABLE public.cloud_essai_demandes (user_id uuid PRIMARY KEY, appareil_h text, comptes_h jsonb DEFAULT '[]'::jsonb,
  essai_permis boolean, raison text, demande_le timestamptz DEFAULT now());
CREATE TABLE public.cloud_essai_empreintes (id bigserial PRIMARY KEY, user_id uuid, nature text NOT NULL, plateforme text,
  empreinte text NOT NULL, conserver_jusqu_au timestamptz, UNIQUE (nature, empreinte));
CREATE TABLE public.cross_post_jobs (id bigserial PRIMARY KEY, user_id uuid, status text, error text, platform_fields jsonb DEFAULT '{}'::jsonb);
CREATE TABLE public.stores_notifications_journal (id bigserial PRIMARY KEY, recu_le timestamptz NOT NULL DEFAULT now(),
  canal text NOT NULL CHECK (canal = ANY (ARRAY['apple', 'google'])), type text NOT NULL, sous_type text, effet text, connu boolean,
  effet_applique text, produit text, user_id uuid, transaction_id text, transaction_originale text, detail jsonb, appel_id uuid,
  message_id text, publie_le timestamptz, evenement_le timestamptz, abonnement_pubsub text, package_name text, type_store integer,
  jeton_empreinte text, test boolean NOT NULL DEFAULT false, verification text, motif text, http_status integer, termine_le timestamptz,
  fin_periode timestamptz, renouvellement_auto boolean, etat_store text, environnement text);
ALTER TABLE public.stores_notifications_journal ENABLE ROW LEVEL SECURITY;
`;
const PROD = ['cloud_ts', 'cloud_param', 'cloud_journal', 'cloud_ip_refus_prouve', 'cloud_ip_attribuable', 'cloud_etat', 'cloud_voie_attendue',
  'cloud_voie_appliquer', 'cloud_empreintes_engager', 'cloud_ip_attribuer', 'cloud_ip_reserver', 'cloud_ip_liberer',
  'cloud_compte_synchroniser_pool', 'cloud_compte_synchroniser', 'profiles_cloud_pool', 'profiles_acquisition_immuable', 'cloud_comptes_a_servir'];
const FIX = 'scripts/essais/fixtures/prod-0711-ref-close';
const MIGRATION = 'supabase/migrations/20261107200000_cloud_ref_close.sql';
const INVERSE = 'supabase/rollbacks/20261107200000_cloud_ref_close_INVERSE.sql';
const GESTE = 'scripts/reparations/20261107_nicotest_ref_close.sql';
const GESTE_INVERSE = 'scripts/reparations/20261107_nicotest_ref_close_INVERSE.sql';
const PREUVE = 'scripts/reparations/20261107_nicotest_ref_close_PREUVE.sql';
const ETAT = String.raw`
TRUNCATE public.cloud_ip_evenements, public.cloud_attente, public.cloud_postes, public.cloud_essai_demandes, public.cloud_essai_empreintes,
  public.stores_notifications_journal RESTART IDENTITY;
DELETE FROM public.cloud_ips; DELETE FROM public.profiles; DELETE FROM public.coin_config;
INSERT INTO public.coin_config (key, value) VALUES ('cloud_ip_marge', 3), ('cloud_ip_rotation', 0), ('cloud_ip_stock_min', 2), ('cloud_places_seuil', 2);
-- Nicotest (relu en prod le 07/11 ~19:30) : achat bac à sable 18:51 Paris, essai arrêté, fin ramenée à 19:12 Paris.
INSERT INTO public.profiles (id, email, is_cloud, cloud_canal, cloud_ref, cloud_essai_debut, cloud_essai_fin, cloud_periode_fin,
  cloud_essai_arrete, acquisition_source, acquisition_captured_at)
VALUES ('${NICOTEST}', 'nicotest@essai', false, 'apple', '${REF_NICOTEST}', '2026-11-07T17:51:03Z', '2026-11-07T18:12:00.059812Z',
  '2026-11-07T18:12:00.059812Z', true, 'testflight', '2026-11-01T10:00:00Z');
INSERT INTO public.profiles (id, email, is_premium, is_comped) VALUES
  ('${RELECTURE[0]}', 'test@essai', true, true), ('${RELECTURE[1]}', 'googlereview@essai', true, true);
INSERT INTO public.profiles (id, email, is_cloud, cloud_canal, cloud_ref, cloud_periode_fin) VALUES
  ('${CLIENT_A}', 'client-a@essai', true, 'apple', '2000000999000001', now() + interval '20 days'),
  ('${CLIENT_B}', 'client-b@essai', false, 'apple', '2000000999000002', now() - interval '2 days');
-- L'IP 2 au repos, dernier titulaire Nicotest (relu en prod) ; le client A tient l'IP 42 ; un stock libre.
INSERT INTO public.cloud_ips (id, commande, ip, etat, dernier_user_id, attributions, expire_le, liberee_le, repos_fin) VALUES
  (2, '86965910', '185.134.194.88', 'repos', '${NICOTEST}', 1, now() + interval '21.7 days', now() - interval '1 hour', now() + interval '7 days');
INSERT INTO public.cloud_ips (id, commande, ip, etat, user_id, dernier_user_id, attributions, expire_le) VALUES
  (42, '87509051', '94.194.94.68', 'attribuee_client', '${CLIENT_A}', '${CLIENT_A}', 1, now() + interval '27 days');
INSERT INTO public.cloud_ips (id, commande, ip, etat, attributions, expire_le) VALUES
  (1, '84458881', '94.194.94.233', 'disponible', 1, now() + interval '26.8 days'),
  (3, '87004978', '81.181.239.136', 'disponible', 1, now() + interval '22.1 days'),
  (4, '87277315', '185.134.192.253', 'disponible', 1, now() + interval '24.7 days'),
  (41, '87495735', '88.151.56.82', 'disponible', 1, now() + interval '26.85 days');
SELECT setval('public.cloud_ips_id_seq', 1000);
`;

const c = new pg.Client({ connectionString: PG_URL });
await c.connect();
let echecs = 0, total = 0;
const verifier = (nom, cond, detail = '') => { total++; console.log(`${cond ? '✓' : '✗'} ${nom}${!cond && detail !== '' ? ` — ${detail}` : ''}`); if (!cond) echecs++; };
const un = async (q, p) => (await c.query(q, p)).rows[0];
const profil = async (id) => un(`SELECT ${COLS.join(', ')}, is_premium, is_pro, subscription_period_end, apple_original_transaction_id, display_name,
  acquisition_source, public.cloud_etat(id) ->> 'etat' AS etat, (public.cloud_etat(id) ->> 'actif')::boolean AS actif FROM public.profiles WHERE id = $1`, [id]);
const cloudDe = (p) => JSON.stringify(COLS.map((k) => (p[k] instanceof Date ? p[k].toISOString() : p[k])));
const ipDe = async (id) => un(`SELECT (SELECT id FROM public.cloud_ips WHERE user_id = $1) AS tenue,
  (SELECT count(*)::int FROM public.cloud_ips WHERE reserve_pour = $1) AS reservees,
  EXISTS (SELECT 1 FROM public.cloud_comptes_a_servir() s WHERE s.user_id = $1) AS servi,
  (SELECT count(*)::int FROM public.cloud_ip_evenements WHERE user_id = $1) AS evenements`, [id]);
const journal = async (id) => (await un(`SELECT count(*)::int AS n FROM public.stores_notifications_journal WHERE type = 'CLOUD_REF_CLOSE' AND user_id = $1`, [id])).n;
const places = async () => (await un(`SELECT count(*)::int AS n FROM public.cloud_comptes_a_servir()`)).n;
// La ligne que lit profilCloudPourStore (_shared/cloud-essai-store.ts) — l'essai n'est pas interdit par la préparation.
const profilStore = async (id) => ({ ...(await un(`SELECT cloud_canal, cloud_ref, is_cloud, cloud_essai_debut, cloud_essai_fin, cloud_essai_arrete
  FROM public.profiles WHERE id = $1`, [id])), cloud_essai_interdit: false });
// La lecture d'une transaction Apple (signedTransactionInfo) : bac à sable, un mois = 5 minutes.
const txApple = (ref, { essai = false, minutes = 5 } = {}) => lectureCloudApple({ productId: PRODUIT_CLOUD_APPLE, originalTransactionId: ref,
  purchaseDate: Date.now(), expiresDate: Date.now() + minutes * 60_000, ...(essai ? { offerType: 1, offerDiscountType: 'FREE_TRIAL' } : {}) });
// L'UPDATE qu'écrit une fonction edge : { col: valeur } → UPDATE public.profiles SET … WHERE id = $1 (types : ceux des colonnes).
const ecrire = async (id, update, cl = c) => {
  const cles = Object.keys(update);
  await cl.query(`UPDATE public.profiles SET ${cles.map((k, i) => `${k} = $${i + 2}`).join(', ')} WHERE id = $1`, [id, ...cles.map((k) => update[k])]);
};
// apple-iap-webhook (v47) : sens « on » (SUBSCRIBED, DID_RENEW, RESUBSCRIBE) / « off » (EXPIRED…) / « annulation ».
const majApple = async (id, sens, ref, opts = {}) => ecritureCloudStore({ canal: 'apple', lecture: txApple(ref, opts), sens, ref, profil: await profilStore(id) });
const declencheurs = async (sql, p) => {   // les déclencheurs réellement appelés par une mise à jour (EXPLAIN ANALYZE), annulée
  await c.query('BEGIN');
  try {
    const plan = (await c.query(`EXPLAIN (ANALYZE, FORMAT JSON) ${sql}`, p)).rows[0]['QUERY PLAN'][0];
    return Object.fromEntries((plan.Triggers ?? []).map((t) => [t['Trigger Name'], t.Calls]));
  } finally { await c.query('ROLLBACK'); }
};
const triggersProfiles = async () => (await c.query(`SELECT tgname, pg_get_triggerdef(oid) AS d FROM pg_trigger
  WHERE tgrelid = 'public.profiles'::regclass AND NOT tgisinternal ORDER BY tgname`)).rows.map((r) => r.d).join('\n');

try {
  await c.query(DECOR);
  for (const f of PROD) await c.query(`${lire(`${FIX}/${f}.sql`)};`);
  await c.query(lire(`${FIX}/profiles_triggers.sql`));
  await c.query(ETAT);
  const trgAvant = await triggersProfiles();

  // ── A. AVANT — la prod du 07/11 ──────────────────────────────────────────────────────────────────────────────
  await c.query('BEGIN');
  const renewA = await majApple(NICOTEST, 'on', REF_NICOTEST);
  await ecrire(NICOTEST, renewA.update);
  const pA = await profil(NICOTEST); const iA = await ipDe(NICOTEST);
  verifier('A. AVANT : le DID_RENEW de Nicotest (bac à sable) RALLUME son Cloud (payé, actif) et lui rend l\'IP 2 — le défaut',
    pA.is_cloud === true && pA.actif === true && Number(iA.tenue) === 2 && iA.servi === true, JSON.stringify({ pA, iA, u: renewA.update }));
  await c.query('ROLLBACK');
  const relectureAvant = (await c.query(`SELECT to_jsonb(p) AS j FROM public.profiles p WHERE id = ANY($1) ORDER BY id`, [RELECTURE])).rows;

  // ── B. LA MIGRATION (deux fois : idempotente), puis le geste ──────────────────────────────────────────────────
  await c.query(lire(MIGRATION));
  await c.query(lire(MIGRATION));
  verifier('B0. la migration passe deux fois (idempotente)', true);
  const t = await un(`SELECT relrowsecurity AS rls, (SELECT count(*)::int FROM pg_policy WHERE polrelid = 'public.cloud_refs_closes'::regclass) AS politiques,
    relacl::text AS acl FROM pg_class WHERE oid = 'public.cloud_refs_closes'::regclass`);
  verifier('B0. cloud_refs_closes : RLS activée, AUCUNE politique, service_role seul (ni anon, ni authenticated, ni PUBLIC)',
    t.rls === true && t.politiques === 0 && /service_role=arwd/.test(t.acl) && !/anon|authenticated|(^|[{,])=/.test(t.acl), JSON.stringify(t));
  const ordre = (await c.query(`SELECT tgname FROM pg_trigger WHERE tgrelid = 'public.profiles'::regclass AND NOT tgisinternal
    AND (tgtype & 2) = 2 AND (tgtype & 16) = 16 ORDER BY tgname`)).rows.map((r) => r.tgname);
  verifier('B0. ordre : profiles_zz_cloud_ref_close est le DERNIER des BEFORE UPDATE (après profiles_acquisition_immuable_trg)',
    ordre[ordre.length - 1] === 'profiles_zz_cloud_ref_close' && ordre.includes('profiles_acquisition_immuable_trg'), JSON.stringify(ordre));
  const relectureMig = (await c.query(`SELECT to_jsonb(p) AS j FROM public.profiles p WHERE id = ANY($1) ORDER BY id`, [RELECTURE])).rows;
  verifier('B3. comptes de relecture d\'Apple : lignes IDENTIQUES après la migration', JSON.stringify(relectureMig) === JSON.stringify(relectureAvant));
  const g = (await c.query(lire(GESTE))).rows;
  verifier('B0. le geste ferme la référence 2000001262935799 (apple, Nicotest, raison écrite)', g.length === 1 && g[0].ref === REF_NICOTEST
    && g[0].canal === 'apple' && g[0].user_id === NICOTEST && /bac à sable TestFlight de Nicotest/.test(g[0].raison), JSON.stringify(g));
  verifier('B0. … rejouable (ON CONFLICT : 0 ligne la 2e fois)', (await c.query(lire(GESTE))).rows.length === 0);

  // ── B1. Nicotest, référence CLOSE ─────────────────────────────────────────────────────────────────────────────
  const p0 = await profil(NICOTEST); const places0 = await places();
  const renew = await majApple(NICOTEST, 'on', REF_NICOTEST);
  verifier('B1. l\'UPDATE exact du DID_RENEW (ecritureCloudStore, sens « on ») : canal, ref, période, arrêt fin de période, is_cloud = vrai',
    JSON.stringify(Object.keys(renew.update).sort()) === JSON.stringify(['cloud_arret_fin_periode', 'cloud_canal', 'cloud_periode_fin', 'cloud_ref', 'is_cloud'])
    && renew.update.is_cloud === true, JSON.stringify(renew));
  const appels = await declencheurs(`UPDATE public.profiles SET cloud_canal = $2, cloud_ref = $3, cloud_periode_fin = $4, cloud_arret_fin_periode = $5,
    is_cloud = $6 WHERE id = $1`, [NICOTEST, 'apple', REF_NICOTEST, renew.update.cloud_periode_fin, false, true]);
  verifier('B1. ordre réel : la garde (zz) et le BEFORE d\'acquisition sont appelés ; profiles_cloud_pool (AFTER → IP) ne l\'est PAS',
    appels.profiles_zz_cloud_ref_close === 1 && appels.profiles_acquisition_immuable_trg === 1 && !('profiles_cloud_pool' in appels), JSON.stringify(appels));
  await ecrire(NICOTEST, renew.update);
  let p1 = await profil(NICOTEST); let i1 = await ipDe(NICOTEST);
  verifier('B1. DID_RENEW sur la référence close : NE RALLUME RIEN — les 8 colonnes Cloud = avant, état « essai_termine », inactif',
    cloudDe(p1) === cloudDe(p0) && p1.actif === false && p1.etat === 'essai_termine', JSON.stringify({ p0, p1 }));
  verifier('B1. … aucune IP attribuée (l\'IP 2 reste au repos), aucune réservation, aucune place prise, aucun événement d\'IP',
    i1.tenue === null && i1.reservees === 0 && i1.servi === false && i1.evenements === 0 && (await places()) === places0
    && (await un(`SELECT etat FROM public.cloud_ips WHERE id = 2`)).etat === 'repos', JSON.stringify({ i1, places0 }));
  const lj = await un(`SELECT canal, type, effet, connu, effet_applique, transaction_originale, motif, detail FROM public.stores_notifications_journal
    WHERE type = 'CLOUD_REF_CLOSE' AND user_id = $1 ORDER BY id DESC LIMIT 1`, [NICOTEST]);
  verifier('B1. … une ligne au journal (stores_notifications_journal : apple, CLOUD_REF_CLOSE, connu, rallumage_neutralise, la demande)',
    (await journal(NICOTEST)) === 1 && lj.canal === 'apple' && lj.connu === true && lj.effet_applique === 'rallumage_neutralise'
    && lj.transaction_originale === REF_NICOTEST && lj.detail?.demande?.is_cloud === true && /non annulable/.test(lj.detail?.raison), JSON.stringify(lj));
  await c.query(`SELECT 1`);   // le webhook répond 200 : aucune exception levée (l'UPDATE ci-dessus a réussi)
  verifier('B1. … AUCUNE exception (le webhook répond 200 à Apple, qui ne rejoue pas)', true);

  // Restauration (validate-apple-receipt sans option : la formule ET le Cloud dans la même mise à jour) + un BEFORE existant
  const restau = await ecritureCloudStore({ canal: 'apple', lecture: txApple(REF_NICOTEST), sens: 'on', ref: REF_NICOTEST, profil: await profilStore(NICOTEST) });
  const majRestau = { is_premium: true, is_pro: true, subscription_period_end: '2026-12-07T18:00:00.000Z', apple_original_transaction_id: '2000001111111111',
    display_name: 'Nicotest restauré', acquisition_source: 'pirate', ...restau.update };
  await ecrire(NICOTEST, majRestau);
  p1 = await profil(NICOTEST); i1 = await ipDe(NICOTEST);
  verifier('B1. restauration (validate-apple-receipt) : le Cloud ne se rallume pas, aucune IP',
    cloudDe(p1) === cloudDe(p0) && p1.actif === false && i1.tenue === null && i1.servi === false, JSON.stringify({ p1, i1 }));
  verifier('B1. … les AUTRES colonnes de la même mise à jour passent (is_premium, is_pro, échéance, transaction d\'origine, nom)',
    p1.is_premium === true && p1.is_pro === true && p1.subscription_period_end === '2026-12-07T18:00:00.000Z'
    && p1.apple_original_transaction_id === '2000001111111111' && p1.display_name === 'Nicotest restauré', JSON.stringify(p1));
  verifier('B1. … le BEFORE existant n\'est pas contourné (acquisition_source reste « testflight », profiles_acquisition_immuable)',
    p1.acquisition_source === 'testflight', p1.acquisition_source);
  await ecrire(NICOTEST, { is_premium: false, is_pro: false });
  // Un nouvel essai sur la même référence (SUBSCRIBED, offre d'introduction) : la date de fin repart dans le futur
  const sub = await majApple(NICOTEST, 'on', REF_NICOTEST, { essai: true, minutes: 3 });
  await ecrire(NICOTEST, sub.update);
  p1 = await profil(NICOTEST); i1 = await ipDe(NICOTEST);
  verifier('B1. SUBSCRIBED (essai) sur la référence close : période / essai qui repartent → neutralisés, aucune IP',
    cloudDe(p1) === cloudDe(p0) && p1.actif === false && i1.tenue === null, JSON.stringify({ u: sub.update, p1 }));
  await ecrire(NICOTEST, { cloud_essai_arrete: false });
  p1 = await profil(NICOTEST);
  verifier('B1. cloud_essai_arrete remis à faux sur la référence close → neutralisé', p1.cloud_essai_arrete === true && cloudDe(p1) === cloudDe(p0), JSON.stringify(p1));
  // Un « off » (EXPIRED) sur la référence close : il ÉTEINT, il passe.
  const off = await majApple(NICOTEST, 'off', REF_NICOTEST, { minutes: -1 });
  await ecrire(NICOTEST, off.update);
  p1 = await profil(NICOTEST);
  verifier('B1. EXPIRED (« off ») sur la référence close : passe (is_cloud faux, période écrite) — éteindre n\'est jamais bloqué',
    p1.is_cloud === false && p1.cloud_periode_fin?.toISOString() === off.update.cloud_periode_fin && p1.actif === false, JSON.stringify({ u: off.update, p1 }));
  verifier('B1. bilan Nicotest : 4 neutralisations journalisées, 0 IP, 0 place', (await journal(NICOTEST)) === 4
    && (await ipDe(NICOTEST)).tenue === null && (await places()) === places0);

  // ── B2. Les autres comptes : aucune régression ───────────────────────────────────────────────────────────────
  // (a) le compte à référence close fait un NOUVEL achat (nouvel identifiant Apple → nouvelle référence)
  await c.query('BEGIN');
  const neuf = await majApple(NICOTEST, 'on', '2000009999999999');
  await ecrire(NICOTEST, neuf.update);
  let p = await profil(NICOTEST); let i = await ipDe(NICOTEST);
  verifier('B2(a). référence close sur le compte, NOUVEL achat avec une référence NOUVELLE → Cloud rallumé (payé), IP rendue, place prise',
    p.is_cloud === true && p.cloud_ref === '2000009999999999' && p.actif === true && Number(i.tenue) === 2 && i.servi === true
    && (await places()) === places0 + 1 && (await journal(NICOTEST)) === 4, JSON.stringify({ p, i }));
  await c.query('ROLLBACK');
  // (b) le client A (référence jamais close, payé) arrête (annulation puis off) puis se réabonne avec une nouvelle référence
  const a0 = await profil(CLIENT_A);
  await ecrire(CLIENT_A, (await majApple(CLIENT_A, 'annulation', a0.cloud_ref)).update);
  p = await profil(CLIENT_A);
  verifier('B2(b). vrai client : l\'annulation passe (arrêt à la fin de la période, Cloud encore actif)', p.cloud_arret_fin_periode === true && p.actif === true, JSON.stringify(p));
  await ecrire(CLIENT_A, (await majApple(CLIENT_A, 'off', a0.cloud_ref, { minutes: -1 })).update);
  p = await profil(CLIENT_A); i = await ipDe(CLIENT_A);
  verifier('B2(b). … l\'expiration passe : Cloud éteint, IP 42 rendue (repos)', p.is_cloud === false && p.actif === false && i.tenue === null
    && (await un(`SELECT etat FROM public.cloud_ips WHERE id = 42`)).etat === 'repos', JSON.stringify({ p, i }));
  await ecrire(CLIENT_A, (await majApple(CLIENT_A, 'on', '2000000999000077')).update);
  p = await profil(CLIENT_A); i = await ipDe(CLIENT_A);
  verifier('B2(b). … réabonnement avec une NOUVELLE référence → rallumé (payé, actif), une IP, une place',
    p.is_cloud === true && p.cloud_ref === '2000000999000077' && p.actif === true && i.tenue !== null && i.servi === true, JSON.stringify({ p, i }));
  // (c) le client B (référence jamais close, éteint) se réabonne avec la MÊME référence d'origine (cas Apple courant)
  const b0 = await profil(CLIENT_B);
  const renewB = await majApple(CLIENT_B, 'on', b0.cloud_ref);
  verifier('B2. la même mise à jour que le DID_RENEW de Nicotest (mêmes colonnes)', JSON.stringify(Object.keys(renewB.update).sort()) === JSON.stringify(Object.keys(renew.update).sort()));
  await ecrire(CLIENT_B, renewB.update);
  p = await profil(CLIENT_B); i = await ipDe(CLIENT_B);
  verifier('B2(c). vrai client, MÊME référence (jamais close) → rallumé comme aujourd\'hui (payé, actif), une IP, une place, rien au journal',
    p.is_cloud === true && p.cloud_ref === b0.cloud_ref && p.actif === true && i.tenue !== null && i.servi === true && (await journal(CLIENT_B)) === 0,
    JSON.stringify({ p, i }));

  // ── B3. Les comptes de relecture d'Apple : leurs achats bac à sable allument le Cloud comme avant ────────────────
  for (const [k, id] of RELECTURE.entries()) {
    await c.query('BEGIN');
    const refR = `20000012000000${k}${k}`;
    const essai = await majApple(id, 'on', refR, { essai: true, minutes: 3 });
    await ecrire(id, essai.update);
    let r = await profil(id); let ri = await ipDe(id);
    const okEssai = r.etat === 'essai' && r.actif === true && ri.tenue !== null && ri.servi === true;
    await ecrire(id, (await majApple(id, 'on', refR)).update);
    r = await profil(id); ri = await ipDe(id);
    verifier(`B3. compte de relecture ${id.slice(0, 8)} : essai bac à sable (SUBSCRIBED) puis DID_RENEW → Cloud allumé, IP, place (jamais bloqué)`,
      okEssai && r.is_cloud === true && r.actif === true && ri.tenue !== null && (await journal(id)) === 0, JSON.stringify({ okEssai, r, ri }));
    await c.query('ROLLBACK');
  }

  // ── B4. Une mise à jour sans colonne Cloud ne déclenche rien ─────────────────────────────────────────────────
  const sans = await declencheurs(`UPDATE public.profiles SET display_name = 'x', is_premium = NOT COALESCE(is_premium, false) WHERE id = $1`, [NICOTEST]);
  verifier('B4. UPDATE sans colonne Cloud (Nicotest, référence close) : la garde n\'est PAS appelée', !('profiles_zz_cloud_ref_close' in sans), JSON.stringify(sans));
  const meme = await declencheurs(`UPDATE public.profiles SET is_cloud = is_cloud, cloud_ref = cloud_ref WHERE id = $1`, [NICOTEST]);
  verifier('B4. colonnes Cloud nommées mais INCHANGÉES : la garde n\'est pas appelée (WHEN)', !('profiles_zz_cloud_ref_close' in meme), JSON.stringify(meme));
  const relec = await declencheurs(`UPDATE public.profiles SET is_premium = true, cloud_essai_arrete = false WHERE id = $1`, [RELECTURE[0]]);
  verifier('B4. compte sans référence Cloud (relecture) : la garde n\'est pas appelée (WHEN : cloud_ref NULL)', !('profiles_zz_cloud_ref_close' in relec), JSON.stringify(relec));
  const masse = await declencheurs(`UPDATE public.profiles SET display_name = 'm'`, []);
  verifier('B4. mise à jour de masse sans colonne Cloud (5 comptes) : 0 appel', !('profiles_zz_cloud_ref_close' in masse), JSON.stringify(masse));

  // ── B5. La PREUVE de prod (rien écrit) ───────────────────────────────────────────────────────────────────────
  const avantPreuve = cloudDe(await profil(NICOTEST)); const jPreuve = await journal(NICOTEST);
  let msg = '';
  try { await c.query(lire(PREUVE)); } catch (e) { msg = e.message; }
  const res = msg.startsWith('PREUVE') ? JSON.parse(msg.slice(msg.indexOf('{'))) : null;
  verifier('B5. la requête de PREUVE de prod rend ok (référence close, déclencheur présent, rien rallumé, 0 IP, 0 place, 1 ligne de journal)',
    res?.ok === true, msg);
  verifier('B5. … et n\'écrit RIEN (transaction annulée : profil et journal inchangés)', cloudDe(await profil(NICOTEST)) === avantPreuve && (await journal(NICOTEST)) === jPreuve);

  // ── C. L'INVERSE ─────────────────────────────────────────────────────────────────────────────────────────────
  const gi = (await c.query(lire(GESTE_INVERSE))).rows;
  verifier('C. inverse du geste : la référence est rouverte (1 ligne retirée)', gi.length === 1 && gi[0].ref === REF_NICOTEST);
  await c.query(lire(GESTE));
  await c.query(lire(INVERSE));
  verifier('C. INVERSE : déclencheur, fonction et table retirés ; les déclencheurs de profiles = ceux de la PROD, mot pour mot',
    (await triggersProfiles()) === trgAvant
    && (await un(`SELECT count(*)::int AS n FROM pg_proc WHERE proname = 'profiles_cloud_ref_close'`)).n === 0
    && (await un(`SELECT to_regclass('public.cloud_refs_closes') IS NULL AS x`)).x === true);
  await c.query('BEGIN');
  await ecrire(NICOTEST, (await majApple(NICOTEST, 'on', REF_NICOTEST)).update);
  p = await profil(NICOTEST); i = await ipDe(NICOTEST);
  verifier('C. INVERSE : le DID_RENEW de Nicotest rallume de nouveau son Cloud et lui rend l\'IP 2 (comportement d\'avant)',
    p.is_cloud === true && p.actif === true && Number(i.tenue) === 2, JSON.stringify({ p, i }));
  await c.query('ROLLBACK');
  await c.query(lire(MIGRATION));
  await c.query(lire(GESTE));
  await ecrire(NICOTEST, (await majApple(NICOTEST, 'on', REF_NICOTEST)).update);
  p = await profil(NICOTEST);
  verifier('C. la migration se rejoue après l\'inverse (et la garde tient de nouveau)', p.is_cloud === false && p.actif === false, JSON.stringify(p));
} catch (e) {
  verifier('banc', false, e.stack ?? e.message);
} finally {
  await c.end();
  if (embarque) { await embarque.pg.stop(); rmSync(embarque.dossier, { recursive: true, force: true }); }
}
console.log(echecs ? `✗ ${echecs} échec(s) sur ${total}` : `✓ essai complet (${total}/${total})`);
process.exit(echecs ? 1 : 0);
