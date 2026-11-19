// ESSAI, SUR UN POSTGRES JETABLE, de la migration 20261119230000_cloud_ip_controle_avant_attribution (19/11/2026 soir,
// décision de Nico : « Contrôle obligatoire avant TOUTE attribution d'IP […] Aucune IP ne doit être donnée à un client sans
// avoir passé ce contrôle juste avant, y compris au retour du repos et après un remplacement IPRoyal » ; contrôle
// PRAGMATIQUE : hébergeur / proxy / pays / plateforme qui ne s'ouvre pas, quel que soit l'opérateur) — jamais la prod.
//   PREUVE_PG=embarque node scripts/essais/20261119230000_banc.mjs
// Ordre : les corps de PROD du 19/11 (scripts/fixtures/cloud-actif-sans-ip-1911-corps-prod.sql — cloud_ip_attribuer,
// cloud_ip_reserver, cloud_ip_attribuable relus IDENTIQUES le 19/11 soir — + scripts/fixtures/cloud-ip-controle-attribution-
// 1911-corps-prod.sql + l'inverse de 20261119190000 pour ses 4 fonctions), PUIS 20261119190000, PUIS 20261119200000, PUIS
// 20261119230000, PUIS son inverse.
//   G. la garde : posée AVANT 20261119200000, la migration s'arrête, rien n'est écrit ;
//   A. AVANT — les défauts : une IP jamais contrôlée est donnée ; l'IP au repos revient à son titulaire sur son contrôle
//      d'avant ;
//   B. APRÈS — jamais une IP non contrôlée, périmée (2 h), revenue du repos sans recontrôle, remplacée, hébergeur / proxy ;
//      une IP contrôlée il y a 5 min (opérateur quelconque) donnée ; la 1re échoue → la 2e ; le contrôle écrit sert tout de
//      suite le compte qui attend (réservation d'abord) ; la réservation prend d'abord une IP contrôlée ; la vente compte
//      toujours la même place (jamais un achat pour ça) ; cloud_ip_attendus ; le contrôle avant renouvellement ; droits ;
//      rejouable ;
//   C. l'INVERSE remet les corps de prod (md5) et ceux de 20261119200000, retire le neuf.
import pg from 'pg';
import { readFileSync, mkdtempSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const lire = (p) => readFileSync(join(ROOT, p), 'utf8');
const MIG190 = lire('supabase/migrations/20261119190000_cloud_ip_fin_de_compte.sql');
const INV190 = lire('supabase/rollbacks/20261119190000_cloud_ip_fin_de_compte_INVERSE.sql');
const MIG200 = lire('supabase/migrations/20261119200000_cloud_actif_sans_ip_prioritaire.sql');
const MIG230 = lire('supabase/migrations/20261119230000_cloud_ip_controle_avant_attribution.sql');
const INV230 = lire('supabase/rollbacks/20261119230000_cloud_ip_controle_avant_attribution_INVERSE.sql');
const CORPS_PROD = lire('scripts/fixtures/cloud-actif-sans-ip-1911-corps-prod.sql');
const CORPS_PROD_230 = lire('scripts/fixtures/cloud-ip-controle-attribution-1911-corps-prod.sql');
const MD5 = {
  attribuer: '6c56aac90065aa2366c3d717315af904',   // sans CR (avec : b09eaf83…)   // cloud_ip_attribuer en prod, relu le 19/11 soir
  reserver: '46db9ef1c9861d713a4574b684e8244d',    // sans CR (avec : b6bddb50…)    // cloud_ip_reserver en prod, relu le 19/11 soir
  attribuable: 'c9e58dd38010c0fa83d2a082f180ad59', // sans CR (avec : a6d76077…) // cloud_ip_attribuable en prod (inchangée)
  santeNoter: '5009147a6f4766dabfcd9b6576ecace8',  // cloud_ip_sante_noter en prod (inchangée)
};

const { default: EmbeddedPostgres } = await import('embedded-postgres');
const dossier = mkdtempSync(join(tmpdir(), 'fillsell-banc-controle-attribution-'));
const PORT = 55463;
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
// (20/11/2026 nuit) md5 SANS les retours chariot : les corps de prod en portent, le dépôt (et l'inverse) n'en garde pas.
const md5De = async (sig) => (await un(`SELECT md5(replace(pg_get_functiondef('${sig}'::regprocedure), E'\r', '')) m`)).m;
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
const IP = (id, etat = 'disponible', sante = null) => `INSERT INTO public.cloud_ips (id, commande, ip, etat, attributions, expire_le, secret_nom, livree_le, sante)
  VALUES (${id}, 'c${id}', '10.9.0.${id % 250}', '${etat}', 0, now() + interval '30 days', 's${id}', now() - interval '10 days', ${sante ?? 'NULL'})`;
const OFFERT = (jours = 30) => ({ is_cloud: 'true', cloud_canal: "'offert'", is_business: 'true', is_pro: 'true', is_premium: 'true', created_at: `now() - interval '${jours} days'` });
const ESSAI = (jours = 60) => ({ cloud_canal: "'stripe'", cloud_essai_debut: "now() - interval '1 day'", cloud_essai_fin: "now() + interval '6 days'", cloud_essai_arrete: 'false', created_at: `now() - interval '${jours} days'` });
// La santé écrite par le contrôle de l'orchestrateur (cloud-pool.js santeSuivante) : « saine » il y a N minutes.
const SAINE = (min, as = '2914') => `jsonb_build_object('version', 1, 'verdict', 'saine', 'le', to_jsonb(now() - interval '${min} minutes'),
  'saine_le', to_jsonb(now() - interval '${min} minutes'), 'controles', 3, 'echecs', '[]'::jsonb,
  'operateur', jsonb_build_object('as', '${as}', 'rang', 2))`;
const ECHEC = (verdict, codes) => `jsonb_build_object('version', 1, 'verdict', '${verdict}', 'le', to_jsonb(now() - interval '3 minutes'),
  'saine_le', to_jsonb(now() - interval '2 days'), 'suspecte_le', to_jsonb(now() - interval '40 minutes'), 'echecs', '${JSON.stringify(codes)}'::jsonb)`;
const vider = () => c.query(`TRUNCATE public.cloud_ip_evenements, public.cloud_attente, public.cloud_essai_demandes, public.cloud_postes,
  public.cloud_coffre, public.cloud_serveurs; DELETE FROM public.cloud_ips; DELETE FROM public.profiles; DELETE FROM public.coin_config;
  INSERT INTO public.cloud_serveurs VALUES ('banc', 'actif', 5, now(), '{"service": {"apte": true}}');`);
const sync = async (u) => (await un(`SELECT public.cloud_compte_synchroniser_pool('${u}'::uuid) AS r`)).r;
const ipDe = async (id) => un('SELECT id, etat, user_id, reserve_pour FROM public.cloud_ips WHERE id = $1', [id]);
const tient = async (u) => { const r = (await un('SELECT id FROM public.cloud_ips WHERE user_id = $1', [u]))?.id; return r == null ? null : Number(r); };
const noterSante = async (id, sql) => (await un(`SELECT public.cloud_ip_sante_noter(${id}, ${sql}) AS r`)).r;
const journalDe = async (id, nature) => un('SELECT details FROM public.cloud_ip_evenements WHERE ip_id = $1 AND nature = $2 ORDER BY id DESC LIMIT 1', [id, nature]);
const trig = async () => (await un(`SELECT pg_get_triggerdef(t.oid) d FROM pg_trigger t WHERE tgname = 'cloud_ips_zz_servir_actif_sans_ip'`))?.d ?? null;

// Les scénarios rejoués AVANT et APRÈS : ce que reçoit le compte actif sans IP.
async function jamaisControlee() {
  await vider(); await c.query(PROFIL(U(1), OFFERT())); await c.query(IP(101));
  await sync(U(1)); return tient(U(1));
}
async function retourDuRepos() {
  // U(2) a tenu la 102 (contrôlée saine il y a 3 h, AVANT sa libération d'il y a 1 h) ; il revient pendant le repos.
  await vider(); await c.query(PROFIL(U(2), OFFERT()));
  await c.query(`INSERT INTO public.cloud_ips (id, commande, ip, etat, attributions, expire_le, secret_nom, livree_le, sante, dernier_user_id,
    attribuee_le, liberee_le, repos_fin) VALUES (102, 'c102', '10.9.0.102', 'repos', 1, now() + interval '30 days', 's102', now() - interval '10 days',
    ${SAINE(180)}, '${U(2)}', now() - interval '3 days', now() - interval '1 hour', now() + interval '6 days')`);
  await sync(U(2)); return tient(U(2));
}

try {
  await c.query(SCHEMA);
  await c.query(CORPS_PROD);
  await c.query(CORPS_PROD_230);
  await c.query(INV190.slice(0, INV190.indexOf('DROP FUNCTION IF EXISTS public.cloud_ip_titulaires();')));
  verifier('0. cloud_ip_attribuer : corps de prod du 19/11 soir à l\'octet', await md5De('public.cloud_ip_attribuer(uuid,text)') === MD5.attribuer);
  verifier('0. cloud_ip_reserver : corps de prod du 19/11 soir à l\'octet', await md5De('public.cloud_ip_reserver(uuid)') === MD5.reserver);
  verifier('0. cloud_ip_attribuable : corps de prod à l\'octet', await md5De('public.cloud_ip_attribuable(cloud_ips,uuid,text)') === MD5.attribuable);
  verifier('0. cloud_ip_sante_noter : corps de prod à l\'octet', await md5De('public.cloud_ip_sante_noter(bigint,jsonb)') === MD5.santeNoter);
  await c.query(MIG190);

  // ── G. La garde ──────────────────────────────────────────────────────────────────────────────────────────────────
  console.log('G. La garde (20261119230000 avant 20261119200000)');
  let refus = null;
  try { await c.query(MIG230); } catch (e) { refus = e.message; }
  verifier('G1. posée AVANT 20261119200000, la migration s\'arrête', /appliquer 20261119200000 d'abord/.test(refus ?? ''), refus ?? 'aucune erreur');
  verifier('G2. … et rien n\'est écrit', (await un(`SELECT to_regprocedure('public.cloud_ip_controlee_avant_attribution(cloud_ips)') IS NULL AS x`)).x
    && await md5De('public.cloud_ip_attribuer(uuid,text)') === MD5.attribuer);
  await c.query(MIG200);
  const md5Servir200 = await md5De('public.cloud_ips_servir_actif_sans_ip()');
  const trig200 = await trig();
  console.log(`  (md5 de cloud_ips_servir_actif_sans_ip posé par 20261119200000 : ${md5Servir200})`);
  verifier('G3. la garde vise ce corps de 20261119200000 (md5 écrit dans la migration)', MIG230.includes(`'${md5Servir200}'`), md5Servir200);
  const aclAvant = (await c.query(`SELECT proname, proacl::text AS a FROM pg_proc WHERE proname IN ('cloud_ip_attribuer', 'cloud_ip_reserver', 'cloud_ips_servir_actif_sans_ip') ORDER BY 1`)).rows;

  // ── A. AVANT (20261119190000 + 20261119200000) ───────────────────────────────────────────────────────────────────
  console.log('A. AVANT');
  verifier('A1. (défaut) une IP JAMAIS contrôlée est donnée au compte actif', (await jamaisControlee()) === 101);
  verifier('A2. (défaut) l\'IP au repos revient à son titulaire sur un contrôle d\'AVANT sa libération', (await retourDuRepos()) === 102);
  await vider(); await c.query(PROFIL(U(3), OFFERT())); await c.query(IP(103, 'disponible', SAINE(120))); await sync(U(3));
  verifier('A3. (défaut) une IP contrôlée il y a 2 h est donnée', (await tient(U(3))) === 103);
  await vider(); await c.query(PROFIL(U(4), OFFERT())); await c.query(IP(104, 'disponible', ECHEC('suspecte', ['sortie:hebergeur', 'sortie:proxy']))); await sync(U(4));
  verifier('A4. (défaut) une IP SUSPECTE hébergeur + proxy (un échec pas encore relu) est donnée', (await tient(U(4))) === 104);

  // ── B. APRÈS (20261119230000) ────────────────────────────────────────────────────────────────────────────────────
  console.log('B. APRÈS (20261119230000)');
  await c.query(MIG230);
  verifier('B0. la garde passe après 20261119200000 ; fonctions, colonne, déclencheur sur etat ET sante',
    (await un(`SELECT to_regprocedure('public.cloud_ip_controlee_avant_attribution(cloud_ips)') IS NOT NULL AND to_regprocedure('public.cloud_ip_attendus()') IS NOT NULL
      AND to_regprocedure('public.cloud_ip_controle_renouvellement_noter(bigint,jsonb)') IS NOT NULL
      AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'cloud_ips' AND column_name = 'controle_renouvellement') AS x`)).x
      && /AFTER UPDATE OF etat, sante ON public\.cloud_ips/.test(await trig() ?? ''), await trig());
  verifier('B0 bis. cloud_ip_attribuable et cloud_ip_sante_noter inchangées (md5)', await md5De('public.cloud_ip_attribuable(cloud_ips,uuid,text)') === MD5.attribuable
    && await md5De('public.cloud_ip_sante_noter(bigint,jsonb)') === MD5.santeNoter);

  const r1 = await jamaisControlee();
  const s1 = await sync(U(1));
  verifier(`B1. une IP JAMAIS contrôlée n'est PAS donnée : le compte attend (« ${s1.action} »), l'IP reste disponible`,
    r1 === null && s1.action === 'sans_place' && (await ipDe(101)).etat === 'disponible', JSON.stringify(s1));
  verifier('B2. retour du repos SANS recontrôle (contrôle d\'avant la libération) : sa propre IP n\'est PAS rendue', (await retourDuRepos()) === null);
  const b2 = await noterSante(102, SAINE(0));
  const b2j = await journalDe(102, 'retour_meme_compte');
  verifier('B2 bis. … recontrôlée saine (cloud_ip_sante_noter) : le déclencheur la lui rend TOUT DE SUITE (retour_meme_compte, date du contrôle au journal)',
    b2.ok === true && (await tient(U(2))) === 102 && typeof b2j?.details?.controle_le === 'string', JSON.stringify({ b2, b2j, ip: await ipDe(102) }));
  await vider(); await c.query(PROFIL(U(3), OFFERT())); await c.query(IP(103, 'disponible', SAINE(120))); await sync(U(3));
  verifier('B3. une IP contrôlée il y a 2 h (périmée, > 60 min) n\'est PAS donnée', (await tient(U(3))) === null);
  await c.query(`INSERT INTO public.coin_config VALUES ('cloud_controle_attribution_min', 180)`); await sync(U(3));
  verifier('B3 bis. la fraîcheur se règle en base (coin_config cloud_controle_attribution_min = 180) : alors elle l\'est', (await tient(U(3))) === 103);
  await vider(); await c.query(PROFIL(U(4), OFFERT()));
  await c.query(IP(104, 'disponible', ECHEC('suspecte', ['sortie:hebergeur', 'sortie:proxy'])));
  await c.query(IP(105, 'disponible', ECHEC('grillee', ['sortie:pays'])));
  await c.query(IP(106, 'disponible', ECHEC('suspecte', ['vinted'])));
  await sync(U(4));
  verifier('B4. hébergeur + proxy (suspecte), pays ≠ FR (grillée), une plateforme qui ne s\'ouvre pas (suspecte Vinted) : AUCUNE donnée', (await tient(U(4))) === null);
  await c.query(IP(107, 'disponible', SAINE(5, '2914')));
  await c.query(`UPDATE public.cloud_ips SET expire_le = now() + interval '20 days' WHERE id = 107`);
  await sync(U(4));
  const b5j = await journalDe(107, 'attribution');
  verifier('B5. la 1re échoue → la SAINE suivante, contrôlée il y a 5 min, est donnée — opérateur quelconque (NTT, AS2914, rang 2)',
    (await tient(U(4))) === 107 && typeof b5j?.details?.controle_le === 'string', JSON.stringify({ ip: await ipDe(107), b5j }));
  await vider(); await c.query(PROFIL(U(5), OFFERT())); await c.query(IP(108, 'disponible', SAINE(5)));
  await c.query(`UPDATE public.cloud_ips SET livree_le = now() - interval '1 minute' WHERE id = 108`); await sync(U(5));
  verifier('B6. adresse REMPLACÉE par IPRoyal (livree_le après le contrôle) : pas donnée avant un nouveau contrôle', (await tient(U(5))) === null);
  await noterSante(108, SAINE(0));
  verifier('B6 bis. … recontrôlée : donnée par le déclencheur', (await tient(U(5))) === 108);

  // Le contrôle écrit sert le compte qui attend ; celui qui a réservé CETTE IP d'abord.
  await vider();
  await c.query(PROFIL(U(6), OFFERT(90)));          // le plus ancien, offert, sans IP
  await c.query(PROFIL(U(7), ESSAI(1)));            // essai qui vient de payer : il avait réservé la 109
  await c.query(IP(109, 'disponible'));
  await c.query(`UPDATE public.cloud_ips SET reserve_pour = '${U(7)}', reserve_jusqu_au = now() + interval '20 minutes' WHERE id = 109`);
  const s7 = await sync(U(7));
  verifier(`B7. au paiement, sa réservation pas encore contrôlée : pas donnée (« ${s7.action} »), la réservation reste`,
    s7.action === 'sans_place' && (await ipDe(109)).reserve_pour === U(7), JSON.stringify(s7));
  await noterSante(109, SAINE(0));
  verifier('B7 bis. le contrôle écrit : la 109 va TOUT DE SUITE à celui qui l\'avait réservée (avant le compte offert plus ancien)',
    (await tient(U(7))) === 109 && (await tient(U(6))) === null, JSON.stringify(await ipDe(109)));
  await c.query(IP(110, 'disponible'));
  await noterSante(110, SAINE(0));
  verifier('B7 ter. la suivante contrôlée va au compte offert qui attendait', (await tient(U(6))) === 110);
  await c.query(PROFIL(U(13), OFFERT(1)));
  await c.query(IP(111, 'disponible'));
  await noterSante(111, ECHEC('suspecte', ['sortie:hebergeur']));
  verifier('B7 quater. un contrôle RATÉ écrit : rien n\'est donné au compte qui attend', (await ipDe(111)).user_id === null && (await tient(U(13))) === null);

  // La réservation prend d'abord une IP contrôlée ; la vente compte la même place qu'avant (jamais un achat pour ça).
  await vider(); await c.query(PROFIL(U(8), { created_at: "now() - interval '1 day'" }));
  await c.query(IP(112, 'disponible')); await c.query(`UPDATE public.cloud_ips SET expire_le = now() + interval '12 days' WHERE id = 112`);
  await c.query(IP(113, 'disponible', SAINE(10)));
  const r8 = (await un(`SELECT public.cloud_ip_reserver('${U(8)}'::uuid) AS r`)).r;
  verifier('B8. la réservation prend d\'abord l\'IP contrôlée (113), pas la plus proche de l\'échéance (112)', Number(r8) === 113, String(r8));
  await vider(); await c.query(PROFIL(U(8), { created_at: "now() - interval '1 day'" })); await c.query(IP(112, 'disponible'));
  const v8 = (await un(`SELECT public.cloud_vente_etat('${U(8)}'::uuid) AS r`)).r;
  verifier(`B9. une IP saine pas encore recontrôlée reste une PLACE à la vente (${v8.vente_possible}, ${v8.places} place) : elle sera contrôlée avant d'être donnée, jamais rachetée`,
    v8.vente_possible === true && v8.places === 1, JSON.stringify(v8));

  // Les comptes qui attendent.
  await vider(); await c.query(PROFIL(U(9), OFFERT(5))); await c.query(PROFIL(U(10), ESSAI(3))); await c.query(PROFIL(U(11), {}));
  await c.query(IP(114, 'disponible'));
  await c.query(`UPDATE public.cloud_ips SET reserve_pour = '${U(10)}', reserve_jusqu_au = now() + interval '10 minutes' WHERE id = 114`);
  const att10 = (await c.query('SELECT user_id::text, nature, reserve_ip FROM public.cloud_ip_attendus()')).rows;
  verifier('B10. cloud_ip_attendus : les comptes au Cloud actif sans IP (offert d\'abord), leur nature et leur réservation',
    JSON.stringify(att10) === JSON.stringify([{ user_id: U(9), nature: 'client', reserve_ip: '114' === null ? null : null }, { user_id: U(10), nature: 'essai', reserve_ip: '114' }]), JSON.stringify(att10));

  // Le contrôle avant renouvellement (IP tenue).
  await vider(); await c.query(PROFIL(U(12), OFFERT())); await c.query(IP(115, 'disponible', SAINE(1))); await sync(U(12));
  const ill = (await un(`SELECT public.cloud_ip_controle_renouvellement_noter(115, '{"echecs": []}'::jsonb) AS r`)).r;
  const bon = (await un(`SELECT public.cloud_ip_controle_renouvellement_noter(115, jsonb_build_object('fait_le', now(), 'echecs', '["sortie:hebergeur"]'::jsonb, 'inconnus', '[]'::jsonb)) AS r`)).r;
  const lu = await un('SELECT controle_renouvellement c, user_id FROM public.cloud_ips WHERE id = 115');
  const jr = await journalDe(115, 'visite_controle');
  verifier('B11. contrôle avant renouvellement d\'une IP TENUE : illisible refusé ; lisible écrit (le client garde son IP), journalisé',
    ill.ok === false && bon.ok === true && lu.user_id === U(12) && lu.c.echecs[0] === 'sortie:hebergeur' && jr?.details?.renouvellement?.echecs?.[0] === 'sortie:hebergeur',
    JSON.stringify({ ill, bon, lu, jr }));

  // Les droits.
  const droits = (await c.query(`SELECT p.proname, has_function_privilege('anon', p.oid, 'EXECUTE') AS anon, has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth,
    has_function_privilege('service_role', p.oid, 'EXECUTE') AS srv FROM pg_proc p
    WHERE p.proname IN ('cloud_ip_attendus', 'cloud_ip_controle_renouvellement_noter', 'cloud_ip_controlee_avant_attribution')`)).rows;
  verifier('B12. fonctions neuves : service_role seulement', droits.length === 3 && droits.every((d) => !d.anon && !d.auth && d.srv), JSON.stringify(droits));
  const aclApres = (await c.query(`SELECT proname, proacl::text AS a FROM pg_proc WHERE proname IN ('cloud_ip_attribuer', 'cloud_ip_reserver', 'cloud_ips_servir_actif_sans_ip') ORDER BY 1`)).rows;
  verifier('B12 bis. droits des fonctions réécrites inchangés', JSON.stringify(aclApres) === JSON.stringify(aclAvant), JSON.stringify({ aclAvant, aclApres }));
  let rejoue = null; try { await c.query(MIG230); } catch (e) { rejoue = e.message; }
  verifier('B13. rejouable (la garde reconnaît son propre corps)', rejoue === null, rejoue);

  // ── C. L'INVERSE ─────────────────────────────────────────────────────────────────────────────────────────────────
  console.log('C. L\'INVERSE');
  await c.query(INV230);
  verifier('C1. cloud_ip_attribuer et cloud_ip_reserver : corps de prod à l\'octet', await md5De('public.cloud_ip_attribuer(uuid,text)') === MD5.attribuer
    && await md5De('public.cloud_ip_reserver(uuid)') === MD5.reserver);
  verifier('C2. cloud_ips_servir_actif_sans_ip et son déclencheur : ceux de 20261119200000', await md5De('public.cloud_ips_servir_actif_sans_ip()') === md5Servir200
    && (await trig()) === trig200, JSON.stringify({ trig: await trig(), trig200 }));
  verifier('C3. fonctions neuves et colonne retirées', (await un(`SELECT to_regprocedure('public.cloud_ip_controlee_avant_attribution(cloud_ips)') IS NULL
    AND to_regprocedure('public.cloud_ip_attendus()') IS NULL AND to_regprocedure('public.cloud_ip_controle_renouvellement_noter(bigint,jsonb)') IS NULL
    AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'cloud_ips' AND column_name = 'controle_renouvellement') AS x`)).x);
  verifier('C4. après l\'inverse, le défaut revient (une IP jamais contrôlée est donnée) : l\'inverse rend bien l\'avant', (await jamaisControlee()) === 101);
  let reapp = null; try { await c.query(MIG230); } catch (e) { reapp = e.message; }
  verifier('C5. et la migration se repose après l\'inverse', reapp === null, reapp);
} catch (e) {
  rouges++; console.log(`  ✗ ERREUR : ${e.stack ?? e.message}`);
} finally {
  await c.end().catch(() => {});
  await bd.stop().catch(() => {});
}
console.log(rouges ? `\n✗ banc 20261119230000 : ${rouges} rouge(s), ${verts} vert(s)` : `\n✓ banc 20261119230000 : ${verts}/${verts}`);
process.exit(rouges ? 1 : 0);
