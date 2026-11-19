// ESSAI, SUR UN POSTGRES JETABLE, de la migration 20261119200000_cloud_actif_sans_ip_prioritaire (19/11/2026, décision de
// Nico, point 5 : « un compte dont le Cloud est offert ne doit plus jamais voir l'écran de paiement du Cloud (liste
// d'attente, carte Cloud, offres). La place s'ouvre directement. ») — jamais la prod.
//   PREUVE_PG=embarque node scripts/essais/20261119200000_banc.mjs
// Ordre : les corps de PROD du 19/11 (scripts/fixtures/cloud-actif-sans-ip-1911-corps-prod.sql + l'inverse de 20261119190000
// pour ses 4 fonctions), PUIS 20261119190000 (agent IP), PUIS 20261119200000, PUIS son inverse.
//   G. la garde : 20261119200000 posée AVANT 20261119190000 s'arrête, rien n'est écrit ;
//   A. AVANT (après 20261119190000) — les défauts : une IP qui rejoint le pool n'est pas donnée au compte actif sans IP ; la
//      vente, la préparation et la liste d'attente donnent sa place à un prospect ; « deja_client » ne dit rien de l'IP ;
//   B. APRÈS — l'IP au compte actif sans IP tout de suite (payés et offerts d'abord), la vente « ip_en_preparation »
//      (raison de 20261119190000 gardée), personne de prévenu pour une place due, place_prete, erreur jamais bloquante,
//      rotation, mêmes réponses que 20261119190000 sans compte actif sans IP, droits, rejouable ;
//   C. l'INVERSE remet le corps de 20261119190000 (md5) et le corps de prod de cloud_attente_places_a_offrir.
import pg from 'pg';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const lire = (p) => readFileSync(join(ROOT, p), 'utf8');
const MIG190 = lire('supabase/migrations/20261119190000_cloud_ip_fin_de_compte.sql');
const INV190 = lire('supabase/rollbacks/20261119190000_cloud_ip_fin_de_compte_INVERSE.sql');
const MIG200 = lire('supabase/migrations/20261119200000_cloud_actif_sans_ip_prioritaire.sql');
const INV200 = lire('supabase/rollbacks/20261119200000_cloud_actif_sans_ip_prioritaire_INVERSE.sql');
const CORPS_PROD = lire('scripts/fixtures/cloud-actif-sans-ip-1911-corps-prod.sql');
const MD5 = {
  venteProd: '80f7ff7f67a9d39e4655d311102dc137',      // cloud_vente_etat en prod le 19/11 (avant 20261119190000)
  vente190: '77c880490edda8df4e8ddadc12e925a2',       // cloud_vente_etat posé par 20261119190000 (garde de 20261119200000)
  places: '047c92fb19ed1817b56fcc25033dbac3',         // cloud_attente_places_a_offrir en prod le 19/11
};

const { default: EmbeddedPostgres } = await import('embedded-postgres');
const dossier = mkdtempSync(join(tmpdir(), 'fillsell-banc-actif-sans-ip-'));
const PORT = 55462;
const bd = new EmbeddedPostgres({ databaseDir: dossier, user: 'postgres', password: 'banc', port: PORT, persistent: false,
  initdbFlags: ['--encoding=UTF8', '--locale=C'], onLog: () => {} });
await bd.initialise();
await bd.start();
const c = new pg.Client({ connectionString: `postgres://postgres:banc@127.0.0.1:${PORT}/postgres` });
await c.connect();
c.on('notice', () => {});
let verts = 0, rouges = 0;
const verifier = (m, ok, d = '') => { if (ok) { verts++; console.log(`  ✓ ${m}`); } else { rouges++; console.log(`  ✗ ${m}${d ? `\n      ← ${String(d).slice(0, 600)}` : ''}`); } };
const un = async (q, a = []) => (await c.query(q, a)).rows[0];
const md5De = async (sig) => (await un(`SELECT md5(pg_get_functiondef('${sig}'::regprocedure)) m`)).m;

// Les comptes du banc (aucun vrai compte).
const U = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const SCHEMA = `
  CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN;
  CREATE SCHEMA auth;
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('banc.uid', true), '')::uuid $$;
  CREATE SCHEMA vault;
  CREATE TABLE vault.secrets (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text UNIQUE, secret text);
  CREATE FUNCTION vault.update_secret(secret_id uuid, new_secret text) RETURNS void LANGUAGE sql AS $$ UPDATE vault.secrets SET secret = new_secret WHERE id = secret_id $$;
  CREATE TABLE public.coin_config (key text PRIMARY KEY, value integer);
  CREATE TABLE public.profiles (id uuid PRIMARY KEY, created_at timestamptz DEFAULT now(), is_cloud boolean, cloud_canal text,
    cloud_essai_debut timestamptz, cloud_essai_fin timestamptz, cloud_essai_arrete boolean, cloud_periode_fin timestamptz,
    cloud_arret_fin_periode boolean, is_business boolean, is_pro boolean, is_premium boolean, is_comped boolean);
  CREATE TABLE public.cloud_ips (id bigint PRIMARY KEY, commande text, ip inet DEFAULT '10.0.0.1', port integer DEFAULT 12323,
    pays text DEFAULT 'FR', ville text, asn text, etat text NOT NULL, user_id uuid, dernier_user_id uuid, derniere_origine text, reserve_pour uuid,
    reserve_jusqu_au timestamptz, attribuee_le timestamptz, liberee_le timestamptz, repos_fin timestamptz, purge_preuve jsonb,
    purge_prouvee_le timestamptz, expire_le timestamptz, livree_le timestamptz, attributions integer DEFAULT 1, secret_nom text,
    rebut_critere text, rebut_le timestamptz, cree_le timestamptz DEFAULT now(), maj_le timestamptz DEFAULT now(),
    refus jsonb DEFAULT '{}'::jsonb, sante jsonb, quarantaine jsonb,
    CONSTRAINT cloud_ips_titulaire CHECK (((etat = ANY (ARRAY['attribuee_essai'::text, 'attribuee_client'::text])) = (user_id IS NOT NULL))),
    CONSTRAINT cloud_ips_reservation CHECK (((reserve_pour IS NULL) = (reserve_jusqu_au IS NULL))),
    CONSTRAINT cloud_ips_repos CHECK (((etat <> 'repos'::text) OR ((liberee_le IS NOT NULL) AND (repos_fin IS NOT NULL)))));
  CREATE UNIQUE INDEX cloud_ips_un_titulaire ON public.cloud_ips (user_id) WHERE user_id IS NOT NULL;
  CREATE UNIQUE INDEX cloud_ips_une_reservation ON public.cloud_ips (reserve_pour) WHERE reserve_pour IS NOT NULL;
  CREATE TABLE public.cloud_ip_evenements (id bigserial PRIMARY KEY, ip_id bigint REFERENCES public.cloud_ips(id), le timestamptz DEFAULT now(),
    nature text NOT NULL, user_id uuid, details jsonb DEFAULT '{}'::jsonb,
    CONSTRAINT cloud_ip_evenements_nature_check CHECK ((nature = ANY (ARRAY['achat'::text, 'controle_entree'::text, 'reservation'::text,
      'attribution'::text, 'retour_meme_compte'::text, 'conversion'::text, 'liberation'::text, 'purge'::text, 'sortie_repos'::text,
      'signalement'::text, 'rebut'::text, 'renouvellement'::text, 'identifiants_changes'::text, 'expiration'::text, 'incident'::text,
      'refus'::text, 'refus_leve'::text, 'refus_prouve'::text, 'visite_controle'::text, 'depense'::text, 'quarantaine'::text,
      'sortie_quarantaine'::text]))));
  CREATE TABLE public.cloud_attente (user_id uuid PRIMARY KEY, demande_le timestamptz DEFAULT now(), derniere_le timestamptz DEFAULT now(),
    essais integer DEFAULT 1, inscrit_le timestamptz, notifie_le timestamptz);
  CREATE TABLE public.cloud_essai_empreintes (nature text, empreinte text, user_id uuid, conserver_jusqu_au timestamptz);
  CREATE TABLE public.cloud_essai_demandes (user_id uuid PRIMARY KEY, appareil_h text, comptes_h jsonb, essai_permis boolean, raison text,
    demande_le timestamptz DEFAULT now());
  CREATE TABLE public.cloud_connexions (id bigserial PRIMARY KEY, ouverte_le timestamptz DEFAULT now());
  CREATE TABLE public.cloud_serveurs (nom text PRIMARY KEY, etat text, capacite integer, vu_le timestamptz, details jsonb);
  CREATE TABLE public.cloud_postes (user_id uuid PRIMARY KEY, etat text, session_fillsell_id uuid);
  CREATE TABLE public.cloud_coffre (user_id uuid, plateforme text, connecte boolean);
  CREATE TABLE public.vinted_sync_runs (user_id uuid, vinted_user_id bigint);
  -- Bouchons (hors du sujet : le drapeau du compte, les empreintes d'essai, le hachage).
  CREATE FUNCTION public.cloud_voie_appliquer(p_user uuid) RETURNS jsonb LANGUAGE sql AS $$ SELECT '{"ok": true}'::jsonb $$;
  CREATE FUNCTION public.cloud_empreintes_engager(p_user uuid) RETURNS void LANGUAGE sql AS $$ SELECT $$;
  CREATE FUNCTION public.cloud_hacher(p_espace text, p_valeur text) RETURNS text LANGUAGE sql AS $$ SELECT md5(p_espace || p_valeur) $$;
`;

const PROFIL = (user, cols) => {
  const k = Object.keys(cols);
  return `INSERT INTO public.profiles (id${k.map((x) => `, ${x}`).join('')}) VALUES ('${user}'${k.map((x) => `, ${cols[x]}`).join('')})`;
};
const IP = (id, etat = 'achetee') => `INSERT INTO public.cloud_ips (id, commande, etat, attributions, expire_le, secret_nom)
  VALUES (${id}, 'c${id}', '${etat}', 0, now() + interval '30 days', 's${id}')`;
const OFFERT = (jours = 30) => ({ is_cloud: 'true', cloud_canal: "'offert'", is_business: 'true', is_pro: 'true', is_premium: 'true', created_at: `now() - interval '${jours} days'` });
const ESSAI = (jours = 60) => ({ cloud_canal: "'stripe'", cloud_essai_debut: "now() - interval '1 day'", cloud_essai_fin: "now() + interval '6 days'", cloud_essai_arrete: 'false', created_at: `now() - interval '${jours} days'` });
const vider = () => c.query(`TRUNCATE public.cloud_ip_evenements, public.cloud_attente, public.cloud_essai_demandes, public.cloud_postes,
  public.cloud_coffre, public.cloud_serveurs; DELETE FROM public.cloud_ips; DELETE FROM public.profiles; DELETE FROM public.coin_config;
  INSERT INTO public.cloud_serveurs VALUES ('banc', 'actif', 5, now(), '{"service": {"apte": true}}');`);
const vente = async (u) => (await un(`SELECT public.cloud_vente_etat('${u}'::uuid) AS r`)).r;
const placesAOffrir = async () => (await un('SELECT public.cloud_attente_places_a_offrir() AS n')).n;
const preparer = async (u) => { await c.query(`SELECT set_config('banc.uid', '${u}', false)`); return (await un(`SELECT public.cloud_essai_preparer_moi('appareil-banc') AS r`)).r; };
const ipDe = async (id) => un('SELECT etat, user_id, reserve_pour FROM public.cloud_ips WHERE id = $1', [id]);

// Le scénario des défauts : U1 (Cloud OFFERT, actif) sans IP, U2 prospect, l'IP 201 achetée qui rejoint le pool.
async function poserScenario() {
  await vider();
  await c.query(PROFIL(U(1), OFFERT()));
  await c.query(PROFIL(U(2), { created_at: "now() - interval '1 day'" }));
  await c.query(IP(201));
}

try {
  await c.query(SCHEMA);
  await c.query(CORPS_PROD);
  await c.query(INV190.slice(0, INV190.indexOf('DROP FUNCTION IF EXISTS public.cloud_ip_titulaires();')));
  verifier('0. cloud_vente_etat : corps de prod du 19/11 à l\'octet', await md5De('public.cloud_vente_etat(uuid)') === MD5.venteProd);
  verifier('0. cloud_attente_places_a_offrir : corps de prod du 19/11 à l\'octet', await md5De('public.cloud_attente_places_a_offrir()') === MD5.places);

  // ── G. La garde ──────────────────────────────────────────────────────────────────────────────────────────────────
  console.log('G. La garde (20261119200000 avant 20261119190000)');
  let refus = null;
  try { await c.query(MIG200); } catch (e) { refus = e.message; }
  verifier('G1. posée AVANT 20261119190000, la migration s\'arrête', /appliquer 20261119190000 d'abord/.test(refus ?? ''), refus ?? 'aucune erreur');
  verifier('G2. … et rien n\'est écrit (ni fonction neuve, ni corps changé)',
    (await un(`SELECT to_regprocedure('public.cloud_actifs_sans_ip(uuid)') IS NULL AS x`)).x && await md5De('public.cloud_vente_etat(uuid)') === MD5.venteProd);

  await c.query(MIG190);
  verifier('0. 20261119190000 appliquée : cloud_vente_etat = le corps que vise la garde (md5 77c88049…)', await md5De('public.cloud_vente_etat(uuid)') === MD5.vente190,
    await md5De('public.cloud_vente_etat(uuid)'));
  const aclAvant = (await c.query(`SELECT proname, proacl::text AS a FROM pg_proc WHERE proname IN ('cloud_vente_etat', 'cloud_attente_places_a_offrir', 'cloud_essai_preparer_moi') ORDER BY 1`)).rows;
  // Les corps de 20261119190000, copiés sous un autre nom : la référence des réponses sans compte actif sans IP (B9).
  const corps190 = MIG190.slice(MIG190.indexOf('CREATE OR REPLACE FUNCTION public.cloud_vente_etat(p_user uuid)'), MIG190.indexOf('$function$;', MIG190.indexOf('CREATE OR REPLACE FUNCTION public.cloud_vente_etat(p_user uuid)')) + 11);
  await c.query(corps190.replace('public.cloud_vente_etat(p_user uuid)', 'public.cloud_vente_etat_190000(p_user uuid)'));
  const corpsPlaces = CORPS_PROD.slice(CORPS_PROD.indexOf('CREATE OR REPLACE FUNCTION public.cloud_attente_places_a_offrir()'));
  await c.query(corpsPlaces.replace('public.cloud_attente_places_a_offrir()', 'public.cloud_attente_places_a_offrir_prod()'));

  // ── A. AVANT (après 20261119190000) ──────────────────────────────────────────────────────────────────────────────
  console.log('A. AVANT (20261119190000 seule)');
  await poserScenario();
  await c.query(`UPDATE public.cloud_ips SET etat = 'disponible' WHERE id = 201`);
  verifier('A1. (défaut) l\'IP 201 rejoint le pool : le compte au Cloud OFFERT, actif sans IP, ne la reçoit PAS', (await ipDe(201)).user_id === null, JSON.stringify(await ipDe(201)));
  const a2 = await vente(U(2));
  verifier(`A2. (défaut) la vente d'un prospect est ouverte avec cette place (${a2.vente_possible}, ${a2.places} place(s))`, a2.vente_possible === true, JSON.stringify(a2));
  verifier(`A3. (défaut) la liste d'attente offrirait cette place (${await placesAOffrir()})`, (await placesAOffrir()) === 1);
  const a4 = await preparer(U(2));
  verifier('A4. (défaut) la préparation du prospect RÉSERVE l\'IP due', a4.ok === true && (await ipDe(201)).reserve_pour === U(2), JSON.stringify({ a4, ip: await ipDe(201) }));
  const a5 = await vente(U(1));
  verifier('A5. (défaut) « deja_client » ne dit rien de la place', a5.raison === 'deja_client' && !('place_prete' in a5), JSON.stringify(a5));

  // ── B. APRÈS (20261119200000) ────────────────────────────────────────────────────────────────────────────────────
  console.log('B. APRÈS (20261119200000)');
  await c.query(MIG200);
  verifier('B0. la garde passe après 20261119190000 ; le déclencheur et les deux fonctions sont là',
    (await un(`SELECT count(*)::int n FROM pg_trigger WHERE tgname = 'cloud_ips_zz_servir_actif_sans_ip'`)).n === 1
      && (await un(`SELECT to_regprocedure('public.cloud_actifs_sans_ip(uuid)') IS NOT NULL AND to_regprocedure('public.cloud_ips_servir_actif_sans_ip()') IS NOT NULL AS x`)).x);

  await poserScenario();
  await c.query(`UPDATE public.cloud_ips SET etat = 'disponible' WHERE id = 201`);
  const b1 = await ipDe(201);
  const journal1 = await un(`SELECT count(*)::int n FROM public.cloud_ip_evenements WHERE ip_id = 201 AND nature = 'attribution' AND user_id = $1`, [U(1)]);
  verifier(`B1. l'IP 201 rejoint le pool : le Cloud OFFERT actif sans IP la reçoit TOUT DE SUITE (${b1.etat})`, b1.user_id === U(1) && b1.etat === 'attribuee_client' && journal1.n === 1, JSON.stringify({ b1, journal1 }));
  const b1v = await vente(U(1));
  verifier('B1 bis. sa vente dit « deja_client », place prête', b1v.raison === 'deja_client' && b1v.place_prete === true, JSON.stringify(b1v));

  // Un compte actif sans IP (U3) ; l'IP 202 posée « disponible » sans passage (insertion : aucun déclencheur).
  await vider();
  await c.query(PROFIL(U(3), OFFERT()));
  await c.query(PROFIL(U(2), { created_at: "now() - interval '1 day'" }));
  await c.query(IP(202, 'disponible'));
  const b2 = await vente(U(2));
  verifier(`B2. la vente d'un prospect se ferme : « ${b2.raison} » (raison de 20261119190000 gardée), 0 place`, b2.vente_possible === false && b2.raison === 'ip_en_preparation' && b2.places === 0, JSON.stringify(b2));
  verifier('B3. la liste d\'attente n\'offre pas la place due (0)', (await placesAOffrir()) === 0);
  const b4 = await preparer(U(2));
  const attente = await un(`SELECT count(*)::int n FROM public.cloud_attente WHERE user_id = $1`, [U(2)]);
  verifier('B4. la préparation du prospect : « ip_en_preparation », liste d\'attente, l\'IP due n\'est PAS réservée', b4.ok === false && b4.raison === 'ip_en_preparation' && attente.n === 1 && (await ipDe(202)).reserve_pour === null,
    JSON.stringify({ b4, attente, ip: await ipDe(202) }));
  const b5 = await vente(U(3));
  verifier('B5. le compte actif sans IP : « deja_client », place_prete = faux', b5.raison === 'deja_client' && b5.place_prete === false, JSON.stringify(b5));
  await un(`SELECT public.cloud_compte_synchroniser_pool('${U(3)}'::uuid) AS r`);
  const b5b = await vente(U(3));
  verifier('B5 bis. servi (entretien), place_prete = vrai', b5b.place_prete === true && (await ipDe(202)).user_id === U(3), JSON.stringify(b5b));

  // Priorité : un essai (compte plus ancien) et un Cloud offert, tous deux sans IP → l'IP va au Cloud payé / offert.
  await vider();
  await c.query(PROFIL(U(4), ESSAI(90)));
  await c.query(PROFIL(U(5), OFFERT(2)));
  await c.query(IP(203));
  await c.query(`UPDATE public.cloud_ips SET etat = 'disponible' WHERE id = 203`);
  verifier('B6. deux comptes actifs sans IP : l\'IP va au Cloud payé / offert avant l\'essai', (await ipDe(203)).user_id === U(5), JSON.stringify(await ipDe(203)));
  await c.query(IP(204));
  await c.query(`UPDATE public.cloud_ips SET etat = 'disponible' WHERE id = 204`);
  const b6b = await ipDe(204);
  verifier(`B6 bis. la suivante va à l'essai (${b6b.etat})`, b6b.user_id === U(4) && b6b.etat === 'attribuee_essai', JSON.stringify(b6b));

  // Une erreur du service n'empêche jamais l'IP de rejoindre le pool.
  await vider();
  await c.query(PROFIL(U(6), OFFERT()));
  await c.query(IP(205));
  await c.query('BEGIN');
  await c.query(`CREATE OR REPLACE FUNCTION public.cloud_compte_synchroniser_pool(p_user uuid) RETURNS jsonb LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'panne du banc'; END $$`);
  let panne = null;
  try { await c.query(`UPDATE public.cloud_ips SET etat = 'disponible' WHERE id = 205`); } catch (e) { panne = e.message; }
  const b7 = await ipDe(205);
  await c.query('ROLLBACK');
  verifier('B7. le service en panne : l\'IP rejoint quand même le pool (WARNING, jamais une erreur)', panne === null && b7.etat === 'disponible' && b7.user_id === null, JSON.stringify({ panne, b7 }));
  verifier('B7 bis. … et la panne du banc est retirée (corps de 20261119190000 rétabli)', /20261119190000/.test((await un(`SELECT pg_get_functiondef('public.cloud_compte_synchroniser_pool(uuid)'::regprocedure) d`)).d));

  // Rotation : l'IP ne borne rien, personne n'est « sans IP ».
  await vider();
  await c.query(PROFIL(U(7), OFFERT()));
  await c.query(`INSERT INTO public.coin_config VALUES ('cloud_ip_rotation', 1)`);
  await c.query(IP(206));
  await c.query(`UPDATE public.cloud_ips SET etat = 'disponible' WHERE id = 206`);
  verifier('B8. rotation : cloud_actifs_sans_ip = 0, le déclencheur ne fait rien, place_prete = vrai',
    (await un('SELECT public.cloud_actifs_sans_ip() n')).n === 0 && (await ipDe(206)).user_id === null && (await vente(U(7))).place_prete === true);

  // Sans compte actif sans IP : les réponses de 20261119190000, scénario par scénario.
  const scenarios = [
    ['une IP libre, serveur à 5', async () => { await vider(); await c.query(PROFIL(U(2), {})); await c.query(IP(210, 'disponible')); }],
    ['aucune IP, serveur à 5', async () => { await vider(); await c.query(PROFIL(U(2), {})); }],
    ['deux inscrits devant', async () => { await vider(); await c.query(PROFIL(U(2), {})); await c.query(IP(211, 'disponible')); await c.query(IP(212, 'disponible'));
      await c.query(`INSERT INTO public.cloud_attente (user_id, inscrit_le) VALUES ('${U(8)}', now() - interval '2 hours'), ('${U(9)}', now() - interval '1 hour')`); }],
    ['un inscrit prévenu (place tenue)', async () => { await vider(); await c.query(PROFIL(U(2), {})); await c.query(IP(213, 'disponible'));
      await c.query(`INSERT INTO public.cloud_attente (user_id, inscrit_le, notifie_le) VALUES ('${U(8)}', now() - interval '2 hours', now() - interval '1 hour')`); }],
    ['essai déjà pris (nature client)', async () => { await vider(); await c.query(PROFIL(U(2), { cloud_essai_debut: "now() - interval '30 days'", cloud_essai_fin: "now() - interval '23 days'" })); await c.query(IP(214, 'disponible')); }],
    ['rotation', async () => { await vider(); await c.query(PROFIL(U(2), {})); await c.query(`INSERT INTO public.coin_config VALUES ('cloud_ip_rotation', 1)`); }],
  ];
  let egaux = 0;
  const ecarts = [];
  for (const [nom, poser] of scenarios) {
    await poser();
    const apres = JSON.stringify(await vente(U(2)));
    const ref = JSON.stringify((await un(`SELECT public.cloud_vente_etat_190000('${U(2)}'::uuid) AS r`)).r);
    const pA = await placesAOffrir();
    const pR = (await un('SELECT public.cloud_attente_places_a_offrir_prod() AS n')).n;
    if (apres === ref && pA === pR) egaux++; else ecarts.push({ nom, apres, ref, pA, pR });
  }
  verifier(`B9. sans compte actif sans IP : vente et liste d'attente = 20261119190000 / prod (${egaux}/${scenarios.length} scénarios)`, egaux === scenarios.length, JSON.stringify(ecarts));

  const aclApres = (await c.query(`SELECT proname, proacl::text AS a FROM pg_proc WHERE proname IN ('cloud_vente_etat', 'cloud_attente_places_a_offrir', 'cloud_essai_preparer_moi') ORDER BY 1`)).rows;
  verifier('B10. droits des fonctions réécrites INCHANGÉS', JSON.stringify(aclAvant) === JSON.stringify(aclApres), JSON.stringify([aclAvant, aclApres]));
  const droits = await un(`SELECT has_function_privilege('anon', 'public.cloud_actifs_sans_ip(uuid)', 'EXECUTE') a, has_function_privilege('authenticated', 'public.cloud_actifs_sans_ip(uuid)', 'EXECUTE') b,
    has_function_privilege('service_role', 'public.cloud_actifs_sans_ip(uuid)', 'EXECUTE') s, has_function_privilege('authenticated', 'public.cloud_ips_servir_actif_sans_ip()', 'EXECUTE') t`);
  verifier('B10 bis. cloud_actifs_sans_ip : service_role seulement ; le déclencheur : personne', droits.a === false && droits.b === false && droits.s === true && droits.t === false, JSON.stringify(droits));
  let rejoue = null;
  try { await c.query(MIG200); } catch (e) { rejoue = e.message; }
  verifier('B11. rejouée (corps déjà posés) : la garde laisse passer, rien ne casse', rejoue === null, rejoue);

  // ── C. L'INVERSE ─────────────────────────────────────────────────────────────────────────────────────────────────
  console.log('C. L\'INVERSE');
  await c.query(INV200);
  verifier('C1. cloud_vente_etat = le corps posé par 20261119190000 (md5)', await md5De('public.cloud_vente_etat(uuid)') === MD5.vente190, await md5De('public.cloud_vente_etat(uuid)'));
  verifier('C2. cloud_attente_places_a_offrir = son corps de prod (md5)', await md5De('public.cloud_attente_places_a_offrir()') === MD5.places, await md5De('public.cloud_attente_places_a_offrir()'));
  verifier('C3. le déclencheur et les deux fonctions neuves sont retirés',
    (await un(`SELECT count(*)::int n FROM pg_trigger WHERE tgname = 'cloud_ips_zz_servir_actif_sans_ip'`)).n === 0
      && (await un(`SELECT to_regprocedure('public.cloud_actifs_sans_ip(uuid)') IS NULL AND to_regprocedure('public.cloud_ips_servir_actif_sans_ip()') IS NULL AS x`)).x);
} catch (e) {
  rouges++;
  console.log(`  ✗ le banc s'est arrêté : ${e.message}`);
} finally {
  await c.end().catch(() => {});
  await bd.stop().catch(() => {});
  try { rmSync(dossier, { recursive: true, force: true }); } catch { /* */ }
}
console.log(rouges ? `\n✗ banc 20261119200000 : ${rouges} rouge(s), ${verts} vert(s)` : `\n✓ banc 20261119200000 : ${verts}/${verts}`);
process.exit(rouges ? 1 : 0);
