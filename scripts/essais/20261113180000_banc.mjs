// LE BANC de la migration 20261113180000_meme_objet_rattache_ou_retenu (13/11/2026, lot du 13/11, agent N6a — cas
// bf85d176 : le relevé du dressing Vinted du 12/11 15:33 a fait une fiche NEUVE pour un clavier déjà au stock, publiée
// ensuite sur Leboncoin où le même objet était déjà en ligne) — SUR UN POSTGRES JETABLE (embedded-postgres sur le poste),
// jamais la prod.
//   node scripts/essais/20261113180000_banc.mjs        (le verrou : npm run selftest:meme-objet-import)
// Décor : les tables que lisent les deux fonctions réécrites (colonnes utiles seulement), les fonctions de prod dont elles
// dépendent À L'OCTET (scripts/essais/fixtures/prod-1311-meme-objet/ : rapprochement_v3_fiche_intacte,
// rapprochement_v3_marquer, releve_poser_question, le déclencheur inventaire_doublons_a_verifier), et des bouchons pour le
// reste (inventaire_fusionner_pour joue le circuit de l'app : la fiche absorbée et ses annonces rejoignent la gardée).
// Les deux corps de PROD sont chargés par l'INVERSE (le corps de prod à l'octet : md5 vérifié).
import pg from 'pg';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const lire = (p) => readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');
export const MIGRATION = 'supabase/migrations/20261113180000_meme_objet_rattache_ou_retenu.sql';
export const INVERSE = 'supabase/rollbacks/20261113180000_meme_objet_rattache_ou_retenu_INVERSE.sql';
export const RATTRAPAGE = 'scripts/reparations/20261113_meme_objet_import_groupe.sql';
export const RATTRAPAGE_INVERSE = 'scripts/reparations/20261113_meme_objet_import_groupe_INVERSE.sql';
export const SANS_SAUVEGARDES = ['cibles', 'fiches', 'annonces', 'jobs', 'questions'].map((t) => `DROP TABLE IF EXISTS public._backup_1311_meme_objet_${t};`).join('\n');
export const MD5_PROD = Object.freeze({
  'rapprochement_v3_appliquer(uuid,jsonb,text,boolean)': '803a52270730966e7e641a03c6c9164b',
  'spend_coins_and_publish(text,jsonb)': 'f2b2a9132d1853ffe7ff713afd51b4eb',
});

// Le cas réel (bf85d176) : identifiants de prod des fiches, annonces et tâches ; le compte, un identifiant d'essai à son id8.
export const U = 'bf85d176-0000-4000-8000-000000000001';
export const X = '1794494010078017';   // la fiche NÉE du dressing Vinted le 12/11 15:33 (annonce Vinted 10478358207)
export const Y = '1790174130756';      // l'import Leboncoin du 23/09 : Leboncoin 3272015849 + eBay 407214160146
export const A_LBC = '0f2c7577-a096-4a3c-b905-9e74df20f73d';
export const A_EBAY = '662afa22-edda-4fe2-95ad-a76630a0d824';
export const J_LBC = '49559de2-3481-4efa-a46a-f54989fd094d';
export const J_EBAY = 'c1299f9e-cb04-4a4c-a4e3-c4f22015ce0e';
export const J_VINTED = '63afc0ac-8776-44ac-8599-4be955041d2e';
export const Q_REELLE = '892d1bf0-8d31-45b5-a6e5-ab4b24e140b5';

const FIX = 'scripts/essais/fixtures/prod-1311-meme-objet';
const PRELUDE = String.raw`
DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE service_role NOLOGIN BYPASSRLS; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE SCHEMA auth;
CREATE TABLE auth.users (id uuid PRIMARY KEY);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $f$
  SELECT nullif(coalesce(current_setting('request.jwt.claim.sub', true), (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')), '')::uuid $f$;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

CREATE TABLE public.profiles (id uuid PRIMARY KEY, ebay_voie_api boolean, extension_last_seen_at timestamptz, lang text,
  is_business boolean, is_pro boolean, is_premium boolean, is_comped boolean);
CREATE TABLE public.ebay_accounts (user_id uuid, revoked_at timestamptz, fulfillment_policy_id text, payment_policy_id text,
  return_policy_id text, seller_state jsonb);
CREATE TABLE public.platform_health (platform text PRIMARY KEY, paused boolean, message_fr text, message_en text);
CREATE TABLE public.inventaire (
  id bigint PRIMARY KEY, user_id uuid NOT NULL, titre text, statut text DEFAULT 'stock', origine text, fusionne_dans bigint,
  fusionne_le timestamptz, quantite integer DEFAULT 1, prix_achat numeric, prix_achat_inconnu boolean DEFAULT false,
  prix_vente numeric, prix_vente_change_par text, poids_change_par text, attributs jsonb DEFAULT '{}'::jsonb,
  a_verifier jsonb, vinted_item_id text, vinted_status text, disparu_le timestamptz, created_at timestamptz DEFAULT now(),
  photos jsonb DEFAULT '[]'::jsonb);
CREATE TABLE public.annonces_plateforme (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, platform text NOT NULL, listing_id text, url text,
  titre text, prix numeric, inventaire_id bigint, job_id uuid, source_rapprochement text, proposition jsonb,
  ignoree_le timestamptz, disparu_le timestamptz, retiree_le timestamptz, fiche_supprimee_le timestamptz,
  statut_plateforme text DEFAULT 'en_ligne', run_id uuid, created_at timestamptz DEFAULT now(), updated_at timestamptz);
CREATE TABLE public.cross_post_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, inventaire_id bigint, platform text NOT NULL,
  status text NOT NULL, action text DEFAULT 'publish', photo_option text, title text, description text, price numeric,
  photos jsonb, platform_fields jsonb, platform_listing_id text, listing_url text, published_at timestamptz,
  created_at timestamptz DEFAULT now(), reservation_id uuid, error text);
CREATE TABLE public.inventaire_doublons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, garde bigint, absorbe bigint, niveau text,
  statut text, motif text, preuves jsonb, source text, fusion_id uuid, decide_le timestamptz, decide_par text,
  created_at timestamptz DEFAULT now());
CREATE UNIQUE INDEX inventaire_doublons_paire ON public.inventaire_doublons (user_id, LEAST(garde, absorbe), GREATEST(garde, absorbe))
  WHERE motif IS DISTINCT FROM 'copie_non_prouvee';
CREATE TABLE public.rapprochements (id bigserial PRIMARY KEY, user_id uuid, annonce_id uuid, inventaire_id bigint, decision text,
  par text, score numeric, detail jsonb, created_at timestamptz DEFAULT now());
CREATE TABLE public.ventes (id bigserial PRIMARY KEY, inventaire_id bigint, user_id uuid);
CREATE TABLE public.fiches_annonce (id bigserial PRIMARY KEY, inventaire_id bigint);
CREATE TABLE public.push_ventes (id bigserial PRIMARY KEY, inventaire_id bigint, user_id uuid);
CREATE TABLE public.email_logs (id bigserial PRIMARY KEY, user_id uuid);
CREATE TABLE public.remises_en_vente (id bigserial PRIMARY KEY, inventaire_id bigint);
CREATE TABLE public.usage_logs (id bigserial PRIMARY KEY, user_id uuid, feature text, metadata jsonb, created_at timestamptz DEFAULT now());
CREATE TABLE public.coin_config (key text PRIMARY KEY, value integer);
CREATE TABLE public.coin_wallets (user_id uuid PRIMARY KEY, included_balance integer DEFAULT 0, purchased_balance integer DEFAULT 0,
  reserved_balance integer DEFAULT 0, next_grant_at timestamptz, updated_at timestamptz);
CREATE TABLE public.coin_reservations (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, amount integer, unit_price integer,
  from_included integer, from_purchased integer, job_count integer, photo_option text);
CREATE TABLE public.coin_ledger (id bigserial PRIMARY KEY, user_id uuid, delta integer, included_after integer, purchased_after integer,
  kind text, metadata jsonb);
CREATE TABLE public.fiches_liees_comptes (fiche_a bigint, fiche_b bigint);
CREATE TABLE public.inventaire_fusions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, garde bigint, absorbe bigint,
  par text, defait_le timestamptz, created_at timestamptz DEFAULT clock_timestamp(), deplaces jsonb);

-- ── bouchons (hors de ce qui est jugé ici) ──
CREATE FUNCTION public.lbc_adresse_hors_france(uuid) RETURNS boolean LANGUAGE sql AS $f$ SELECT false $f$;
CREATE FUNCTION public.jumelle_occupe_plateformes(uuid, bigint) RETURNS TABLE(platform text) LANGUAGE sql AS $f$ SELECT NULL::text WHERE false $f$;
CREATE FUNCTION public.jauges_actives() RETURNS boolean LANGUAGE sql AS $f$ SELECT false $f$;
CREATE FUNCTION public.annonce_id_de_job(text, text) RETURNS text LANGUAGE sql AS $f$ SELECT NULL::text $f$;
CREATE FUNCTION public.titre_en_serie(uuid, text) RETURNS boolean LANGUAGE sql AS $f$ SELECT false $f$;
-- la dernière passe du compte : avant la naissance de la fiche du dressing (12/11 15:33:30 à Paris)
CREATE FUNCTION public.rapprochement_v3_vinted_depuis(uuid) RETURNS timestamptz LANGUAGE sql AS $f$ SELECT '2026-11-12 14:33:00+00'::timestamptz $f$;
CREATE FUNCTION public.rapprochement_republication_prouvee(uuid, uuid) RETURNS boolean LANGUAGE sql AS $f$ SELECT false $f$;
CREATE FUNCTION public.rapprochement_v3_soeur_republication(uuid, bigint) RETURNS uuid LANGUAGE sql AS $f$ SELECT NULL::uuid $f$;
CREATE FUNCTION public.rapprochement_attacher(uuid, bigint, text, jsonb) RETURNS uuid LANGUAGE sql AS $f$ SELECT NULL::uuid $f$;
CREATE FUNCTION public.rapprochement_v3_fiche_de(uuid, uuid, boolean) RETURNS bigint LANGUAGE sql AS $f$ SELECT NULL::bigint $f$;
-- « fiche à la main face à une fiche Vinted » : la base y voit un doute (la question), jamais une fusion, dans ce banc
CREATE FUNCTION public.rapprochement_v3_fiches_fusionnables(uuid, bigint, bigint) RETURNS text LANGUAGE sql AS $f$ SELECT 'doute_banc'::text $f$;
CREATE FUNCTION public.rapprochement_v3_remise_possible(uuid, bigint, bigint) RETURNS text LANGUAGE sql AS $f$ SELECT 'introuvable'::text $f$;
CREATE FUNCTION public.rapprochement_v3_remise_maillon(uuid, bigint, bigint) RETURNS text LANGUAGE sql AS $f$ SELECT 'introuvable'::text $f$;
-- le circuit de l'app (« Fusionner », défaisable) : la fiche absorbée, ses annonces et ses tâches rejoignent la gardée
-- (bouchon : il garde ce qu'il déplace, pour que « Défaire la fusion » le rende)
CREATE FUNCTION public.inventaire_fusionner_pour(p_user uuid, p_garde bigint, p_absorbe bigint, p_par text) RETURNS jsonb LANGUAGE plpgsql AS $f$
DECLARE v_id uuid; v_a jsonb; v_j jsonb;
BEGIN
  UPDATE public.inventaire SET fusionne_dans = p_garde, fusionne_le = now() WHERE id = p_absorbe AND user_id = p_user AND fusionne_dans IS NULL;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'introuvable'); END IF;
  SELECT COALESCE(jsonb_agg(id), '[]') INTO v_a FROM public.annonces_plateforme WHERE inventaire_id = p_absorbe;
  SELECT COALESCE(jsonb_agg(id), '[]') INTO v_j FROM public.cross_post_jobs WHERE inventaire_id = p_absorbe;
  UPDATE public.annonces_plateforme SET inventaire_id = p_garde WHERE inventaire_id = p_absorbe;
  UPDATE public.cross_post_jobs SET inventaire_id = p_garde WHERE inventaire_id = p_absorbe;
  INSERT INTO public.inventaire_fusions (user_id, garde, absorbe, par, deplaces) VALUES (p_user, p_garde, p_absorbe, p_par, jsonb_build_object('a', v_a, 'j', v_j)) RETURNING id INTO v_id;
  RETURN jsonb_build_object('ok', true, 'fusion_id', v_id);
END $f$;
CREATE FUNCTION public.inventaire_defusionner_pour(p_user uuid, p_fusion uuid, p_par text) RETURNS jsonb LANGUAGE plpgsql AS $f$
DECLARE f record;
BEGIN
  SELECT * INTO f FROM public.inventaire_fusions WHERE id = p_fusion AND user_id = p_user AND defait_le IS NULL;
  IF f.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'introuvable'); END IF;
  UPDATE public.annonces_plateforme SET inventaire_id = f.absorbe WHERE id IN (SELECT (x #>> '{}')::uuid FROM jsonb_array_elements(f.deplaces -> 'a') x);
  UPDATE public.cross_post_jobs SET inventaire_id = f.absorbe WHERE id IN (SELECT (x #>> '{}')::uuid FROM jsonb_array_elements(f.deplaces -> 'j') x);
  UPDATE public.inventaire SET fusionne_dans = NULL, fusionne_le = NULL WHERE id = f.absorbe;
  UPDATE public.inventaire_fusions SET defait_le = now() WHERE id = f.id;
  RETURN jsonb_build_object('ok', true);
END $f$;
INSERT INTO public.coin_config (key, value) VALUES ('price_original', 0), ('price_ia_light', 0), ('price_ia_advanced', 0), ('price_per_platform', 0);
`;

const PROD_DEPENDANCES = ['rapprochement_v3_fiche_intacte', 'rapprochement_v3_marquer', 'releve_poser_question', 'inventaire_doublons_a_verifier'];
const DECLENCHEUR = `CREATE TRIGGER trg_inventaire_doublons_a_verifier AFTER DELETE OR UPDATE OF statut ON public.inventaire_doublons
  FOR EACH ROW WHEN ((old.statut = 'proposee'::text)) EXECUTE FUNCTION inventaire_doublons_a_verifier();`;

/** Les données du cas réel, telles qu'en prod à la passe du 12/11 15:40 (avant toute réponse). */
export const DONNEES = `
TRUNCATE public.inventaire, public.annonces_plateforme, public.cross_post_jobs, public.inventaire_doublons, public.rapprochements,
  public.ventes, public.fiches_annonce, public.push_ventes, public.remises_en_vente, public.usage_logs, public.inventaire_fusions,
  public.coin_wallets, public.coin_reservations, public.coin_ledger, public.profiles;
INSERT INTO public.profiles (id, lang) VALUES ('${U}', 'fr');
INSERT INTO public.inventaire (id, user_id, titre, statut, origine, quantite, prix_vente, prix_vente_change_par, poids_change_par, attributs, vinted_item_id, vinted_status, created_at) VALUES
  (${Y}, '${U}', 'Clavier Bluetooth Universel Nor-Tec - Neuf', 'stock', 'releve_leboncoin', 1, 10, NULL, 'releve:ebay',
   '{"marque": {"v": "Logitech", "at": "2026-09-23T14:35:26Z", "source": "releve_leboncoin"}}', NULL, NULL, '2026-09-23 14:35:26.959805+00'),
  (${X}, '${U}', 'Clavier Bluetooth Nor-Tec Universel azerty – Android, iOS, Windows – avec boîte', 'stock', 'vinted_sync', 1, 15, NULL, NULL,
   '{}', '10478358207', 'active', '2026-11-12 14:33:30.896947+00');
INSERT INTO public.cross_post_jobs (id, user_id, inventaire_id, platform, status, action, platform_listing_id, platform_fields, published_at, created_at) VALUES
  ('${J_LBC}', '${U}', ${Y}, 'leboncoin', 'published', 'publish', '3272015849', '{"source": "releve"}', '2026-09-23 14:35:26+00', '2026-09-23 14:35:26+00'),
  ('${J_EBAY}', '${U}', ${Y}, 'ebay', 'published', 'publish', '407214160146', '{"source": "releve"}', '2026-10-15 08:00:29+00', '2026-10-15 08:00:29+00'),
  ('${J_VINTED}', '${U}', ${X}, 'vinted', 'published', 'publish', '10478358207', NULL, '2026-11-12 14:33:29+00', '2026-11-12 14:33:31+00');
INSERT INTO public.annonces_plateforme (id, user_id, platform, listing_id, titre, prix, inventaire_id, job_id, source_rapprochement, statut_plateforme) VALUES
  ('${A_LBC}', '${U}', 'leboncoin', '3272015849', 'Clavier Bluetooth Universel Nor-Tec - Neuf', 10, ${Y}, '${J_LBC}', 'automatique', 'en_ligne'),
  ('${A_EBAY}', '${U}', 'ebay', '407214160146', 'nor-tec Bluetooth Keyboard Universal Clavier autonome AZERTY FR Bluetooth noir', 20, ${Y}, '${J_EBAY}', 'automatique', 'en_ligne');
INSERT INTO public.rapprochements (user_id, annonce_id, inventaire_id, decision, par, score, detail) VALUES
  ('${U}', '${A_LBC}', ${Y}, 'import', 'auto', 1, '{"job_id": "${J_LBC}"}'),
  ('${U}', '${A_EBAY}', ${Y}, 'attache', 'auto', 1, '{"motif": "photo_identique", "regle": "rapprochement_v3"}');
`;

/** La question telle que la prod l'a posée le 12/11 à 15:40:52 (pour juger la garde de publication). */
export const QUESTION_REELLE = (statut = 'proposee', motif = 'photo_identique') => `
INSERT INTO public.inventaire_doublons (id, user_id, garde, absorbe, niveau, statut, motif, preuves, source) VALUES
  ('${Q_REELLE}', '${U}', ${X}, ${Y}, 'probable', '${statut}', '${motif}',
   '{"regle": "rapprochement_v3", "groupe": ["F${X}", "A${A_LBC}", "A${A_EBAY}"], "avant_stock": false, "article_modifie": true, "vinted_nouvelle": "${X}"}', 'releve');`;

export async function demarrer(port) {
  const { default: EmbeddedPostgres } = await import('embedded-postgres');
  const dossier = mkdtempSync(join(tmpdir(), 'fillsell-banc-meme-objet-'));
  const base = new EmbeddedPostgres({ databaseDir: dossier, user: 'postgres', password: 'banc', port, persistent: false,
    initdbFlags: ['--encoding=UTF8', '--locale=C'], onLog: () => {}, onError: () => {} });
  await base.initialise(); await base.start();
  const c = new pg.Client({ connectionString: `postgres://postgres:banc@127.0.0.1:${port}/postgres` });
  await c.connect(); c.on('notice', () => {});
  await c.query(PRELUDE);
  for (const f of PROD_DEPENDANCES) await c.query(lire(`${FIX}/${f}.sql`));
  await c.query(DECLENCHEUR);
  // les deux corps de PROD, à l'octet (l'inverse)
  await c.query(lire(INVERSE));
  await c.query(DONNEES);
  const arreter = async () => { await c.end().catch(() => {}); await base.stop().catch(() => {}); try { rmSync(dossier, { recursive: true, force: true }); } catch { /* temp */ } };
  return { c, arreter };
}

export async function md5s(c) {
  const out = {};
  for (const sig of Object.keys(MD5_PROD)) {
    out[sig] = (await c.query(`SELECT md5(pg_get_functiondef('public.${sig}'::regprocedure)) m`)).rows[0].m;
  }
  return out;
}

/** La passe écrit son plan (le rôle du serveur). */
export async function appliquer(c, decisions, mode = 'normal') {
  const r = await c.query('SELECT public.rapprochement_v3_appliquer($1::uuid, $2::jsonb, $3, false) r', [U, JSON.stringify(decisions), mode]);
  return r.rows[0].r;
}

/** Une publication « depuis l'app » (rôle authenticated, session du compte) : un article, ses plateformes. */
export async function publier(c, fiche, plateformes, uid = U) {
  const jobs = plateformes.map((p) => ({ inventaire_id: String(fiche), platform: p, title: 'banc', description: 'banc', price: 15, photos: [], platform_fields: {} }));
  await c.query('BEGIN');
  try {
    await c.query('SET LOCAL ROLE authenticated');
    await c.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [uid]);
    const r = await c.query('SELECT public.spend_coins_and_publish($1, $2::jsonb) r', ['original', JSON.stringify(jobs)]);
    await c.query('ROLLBACK');   // jamais une tâche gardée : chaque essai repart du même état
    return r.rows[0].r;
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {});
    return { erreur: e.message };
  }
}

export async function etat(c) {
  const fiches = Object.fromEntries((await c.query(`SELECT id::text, statut, fusionne_dans::text, a_verifier FROM public.inventaire ORDER BY id`)).rows.map((r) => [r.id, r]));
  const questions = (await c.query(`SELECT id::text, garde::text, absorbe::text, statut, motif, preuves FROM public.inventaire_doublons ORDER BY created_at, id`)).rows;
  const annonces = Object.fromEntries((await c.query(`SELECT id::text, inventaire_id::text FROM public.annonces_plateforme`)).rows.map((r) => [r.id, r.inventaire_id]));
  return { fiches, questions, annonces };
}
