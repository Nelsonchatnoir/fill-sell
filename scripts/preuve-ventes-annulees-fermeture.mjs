// PREUVE, SUR UN POSTGRES JETABLE, de la migration 20261107150000_ventes_annulees_fermeture (07/11, compte d'Ornella) :
//   1. départ = les définitions de PROD du 07/11 (portées par l'inverse), md5 identiques à ceux lus en prod ;
//   2. la garde de la migration refuse une prod qui a changé ; la migration passe, deux fois de suite ;
//   3. chaque ligne de la définition de prod de remises_en_vente_tick est gardée, dans l'ordre (sauf la ligne du bilan) ;
//   4. pré-fermeture : jumelle vendue → « vendu_sous_autre_fiche » (toutes les plateformes) ; jumelle en stock en ligne →
//      « deja_en_vente_autre_fiche » ; en ligne ensemble, deux exemplaires apparus la même minute, photos différentes,
//      autre boutique, apparue avant la vente, plusieurs exemplaires, jumelle hors ligne, jumelle faite dans l'app, titre
//      seul → la ligne RESTE ;
//      (07/11, décision de Nico — la preuve SOLIDE) une photo de chaque côté (la spatule), 2 photos communes sur 7 et 9
//      (le pantalon), une même image en double, une seconde fiche à une photo commune → la ligne RESTE ; 2 photos
//      communes sur 2 et 3 (le pull rayé) → fermée ;
//      fiche hors stock (vendue, fondue, effacée) → « plus_en_stock » ;
//   5. la même garde juste avant l'INSERT (ligne « à faire ») ; une ligne sans jumelle crée toujours sa publication ;
//   6. ventes_annulees_ne_pas_remettre : la fiche et le compte appelant seulement ; sans session : refus ; droits ;
//   7. ventes_annulees_a_remettre : une fiche hors stock ou fondue ne s'affiche plus ; les motifs nouveaux sont rendus ;
//   8. second passage : rien de plus ; l'inverse rend les définitions de prod (md5) et retire les quatre fonctions.
//
//   PREUVE_PG=embarque node scripts/preuve-ventes-annulees-fermeture.mjs   (Postgres jetable sur le PC, port libre ≥ 55452)
//
// Jamais la prod. Bouchons dits comme tels : releve_preuve_absence, remise_en_vente_place (jamais lue pour une vente
// annulée : hors quota).
import pg from 'pg';
import net from 'node:net';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const MD5_PROD = { remises_en_vente_tick: '8727977d992fbdf357f76718908554ca', ventes_annulees_a_remettre: '9dd603b95e08cd6d8c91587be2ad4882' };

let PG_URL = process.env.PREUVE_PG;
if (!PG_URL || /supabase\.co/.test(PG_URL)) { console.error('PREUVE_PG : un Postgres JETABLE (jamais la prod), ou « embarque ».'); process.exit(2); }
const portLibre = async (depuis) => {
  for (let p = depuis; p < depuis + 40; p++) {
    const libre = await new Promise((ok) => { const s = net.createServer().once('error', () => ok(false)).once('listening', () => s.close(() => ok(true))).listen(p, '127.0.0.1'); });
    if (libre) return p;
  }
  throw new Error('aucun port libre');
};
let embarque = null;
if (PG_URL === 'embarque') {
  const { default: EmbeddedPostgres } = await import('embedded-postgres');
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { tmpdir } = await import('node:os');
  const port = await portLibre(55452);
  const dossier = mkdtempSync(join(tmpdir(), 'fillsell-preuve-ventes-annulees-'));
  embarque = { pg: new EmbeddedPostgres({ databaseDir: dossier, user: 'postgres', password: 'preuve', port, persistent: false,
    initdbFlags: ['--encoding=UTF8', '--locale=C'], onLog: () => {} }), dossier, rmSync };
  await embarque.pg.initialise();
  await embarque.pg.start();
  PG_URL = `postgres://postgres:preuve@127.0.0.1:${port}/postgres`;
}
const lire = (p) => readFileSync(new URL(p, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const MIGRATION = lire('../supabase/migrations/20261107150000_ventes_annulees_fermeture.sql');
const INVERSE = lire('../supabase/rollbacks/20261107150000_ventes_annulees_fermeture_INVERSE.sql');

// Le banc : les colonnes lues par ces fonctions ; leurs dépendances = définitions de PROD du 07/11 (pg_get_functiondef),
// sauf les deux bouchons nommés plus haut.
const BANC = String.raw`
CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $f$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $f$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $f$ SELECT nullif(current_setting('request.jwt.claim.role', true), '') $f$;
CREATE TABLE veille_cpu (pct numeric, le timestamptz DEFAULT now());
CREATE TABLE coin_config (key text PRIMARY KEY, value bigint);
CREATE TABLE inventaire (id bigint PRIMARY KEY, user_id uuid, titre text, description text, prix_vente numeric, statut text DEFAULT 'stock',
  quantite integer DEFAULT 1, photos jsonb, fusionne_dans bigint, vinted_item_id text, vinted_account_id text, vinted_status text,
  disparu_le timestamptz, first_seen_at timestamptz, last_synced_at timestamptz, created_at timestamptz DEFAULT now(), origine text);
CREATE TABLE cross_post_jobs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, inventaire_id bigint, platform text,
  status text, action text, photo_option text, title text, description text, price numeric, photos jsonb, platform_listing_id text,
  listing_url text, platform_fields jsonb, published_at timestamptz, created_at timestamptz DEFAULT now(), sold_at timestamptz,
  reservation_id uuid, reservation_settled_at timestamptz);
CREATE TABLE remises_en_vente (id bigserial PRIMARY KEY, user_id uuid, inventaire_id bigint, platform text, job_vendu uuid UNIQUE,
  statut text CHECK (statut IN ('a_faire', 'faite', 'abandonnee', 'proposee')), motif text, job_cree uuid, essais integer DEFAULT 0,
  prochain_essai timestamptz DEFAULT now(), cree_le timestamptz DEFAULT now(), traite_le timestamptz, accepte_le timestamptz);
CREATE TABLE vinted_listing_snapshots (id bigserial PRIMARY KEY, user_id uuid, vinted_item_id text, inventaire_id bigint, captured_at timestamptz, status text);
CREATE TABLE annonces_plateforme (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, platform text, listing_id text,
  inventaire_id bigint, statut_plateforme text, disparu_le timestamptz, retiree_le timestamptz, ignoree_le timestamptz,
  vu_le timestamptz DEFAULT now(), created_at timestamptz DEFAULT now(), transaction_plateforme text, capture jsonb, job_id uuid);
CREATE TABLE ventes_operations (user_id uuid, cle text, resultat jsonb, PRIMARY KEY (user_id, cle));
CREATE TABLE platform_health (platform text PRIMARY KEY, paused boolean);
CREATE TABLE profiles (id uuid PRIMARY KEY, extension_last_seen_at timestamptz, ebay_voie_api boolean);
CREATE TABLE plateforme_commandes (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, platform text, commande_ref text,
  conversation_ref text, maj_le timestamptz, etat text, inventaire_id bigint);
CREATE TABLE usage_logs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, feature text, metadata jsonb, created_at timestamptz DEFAULT now());
CREATE TABLE photo_empreintes (url text PRIMARY KEY, dhash text, phash text);
CREATE TABLE ventes_supprimees (id bigserial PRIMARY KEY, user_id uuid, vente_id bigint, vendu_le timestamptz, plateforme_code text, annonce_id text);
CREATE TABLE vinted_sync_runs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, platform text, kind text, status text,
  started_at timestamptz, finished_at timestamptz, items_vus int, total_entries int, erreur text);
-- bouchons (dits comme tels)
CREATE OR REPLACE FUNCTION public.releve_preuve_absence(p_run uuid) RETURNS boolean LANGUAGE sql AS $f$
  SELECT EXISTS (SELECT 1 FROM vinted_sync_runs r WHERE r.id = p_run AND r.status = 'done' AND r.kind = 'annonces' AND coalesce(r.items_vus, 0) > 0) $f$;
CREATE OR REPLACE FUNCTION public.remise_en_vente_place(p_user uuid) RETURNS jsonb LANGUAGE sql AS $f$ SELECT jsonb_build_object('place', true) $f$;
-- Définitions de PROD du 07/11 (pg_get_functiondef).
CREATE OR REPLACE FUNCTION public.annonce_id_de_job(p_listing_id text, p_listing_url text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT COALESCE(
    NULLIF(btrim(p_listing_id), ''),
    substring(p_listing_url from '/itm/([0-9]+)'),
    substring(p_listing_url from '/items/([0-9]+)'),
    substring(p_listing_url from '/([0-9]{6,})(?:[/?#]|$)')
  );
$function$;
CREATE OR REPLACE FUNCTION public.leboncoin_transaction_lue(p_colonne text, p_capture jsonb)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT CASE
    WHEN nullif(btrim(p_colonne), '') IS NOT NULL THEN left(lower(btrim(p_colonne)), 40)
    WHEN jsonb_typeof(p_capture -> 'attributs_bruts') = 'array' THEN coalesce(
      (SELECT left(lower(btrim(e ->> 'value')), 40) FROM jsonb_array_elements(p_capture -> 'attributs_bruts') e
        WHERE e ->> 'key' = 'transaction_status' AND nullif(btrim(e ->> 'value'), '') IS NOT NULL LIMIT 1),
      'aucune')
    ELSE NULL END;
$function$;
CREATE OR REPLACE FUNCTION public.photos_ordre_article(p_job jsonb, p_article jsonb, p_pf jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  v_job_cles text[];
  v_art_cles text[] := '{}';
  v_art_ent  jsonb[] := '{}';
  v_e        jsonb;
  v_c        text;
  v_i        integer;
  v_n        integer;
  v_plaf     boolean;
  v_sortie   jsonb := '[]'::jsonb;
BEGIN
  IF p_job IS NULL OR jsonb_typeof(p_job) <> 'array' OR jsonb_array_length(p_job) = 0 THEN RETURN p_job; END IF;
  -- Un ordre choisi pour CETTE plateforme : le sien, tel quel.
  IF COALESCE(p_pf ->> 'photos_choisies', '') = 'true' THEN RETURN p_job; END IF;
  IF p_article IS NULL OR jsonb_typeof(p_article) <> 'array' OR jsonb_array_length(p_article) = 0 THEN RETURN p_job; END IF;
  -- La clé d'une photo : son URL sans la requête (?v=…).
  SELECT array_agg(NULLIF(split_part(btrim(CASE jsonb_typeof(e) WHEN 'string' THEN e #>> '{}'
                                                                 WHEN 'object' THEN e ->> 'url' END, E' \t\r\n'), '?', 1), '')
                   ORDER BY o)
    INTO v_job_cles
    FROM jsonb_array_elements(p_job) WITH ORDINALITY AS t(e, o);
  IF array_position(v_job_cles, NULL) IS NOT NULL
     OR (SELECT count(DISTINCT c) FROM unnest(v_job_cles) AS c) <> cardinality(v_job_cles) THEN
    RETURN p_job;
  END IF;
  FOR v_e IN SELECT e FROM jsonb_array_elements(p_article) WITH ORDINALITY AS t(e, o) ORDER BY o LOOP
    v_c := NULLIF(split_part(btrim(CASE jsonb_typeof(v_e) WHEN 'string' THEN v_e #>> '{}'
                                                          WHEN 'object' THEN v_e ->> 'url' END, E' \t\r\n'), '?', 1), '');
    IF v_c IS NOT NULL AND NOT (v_c = ANY (v_art_cles)) THEN
      v_art_cles := array_append(v_art_cles, v_c);
      v_art_ent := array_append(v_art_ent, v_e);
    END IF;
  END LOOP;
  -- Une photo du job que l'article ne porte pas (autre hébergement, photo retirée) : aucune déduction.
  IF NOT (v_job_cles <@ v_art_cles) THEN RETURN p_job; END IF;
  v_plaf := COALESCE(p_pf ->> 'lbcPhotosCapped', '') = 'true';
  v_n := cardinality(v_job_cles);
  FOR v_i IN 1 .. cardinality(v_art_cles) LOOP
    v_c := v_art_cles[v_i];
    IF v_plaf THEN
      -- Dépôt plafonné : les N premières de l'article.
      EXIT WHEN jsonb_array_length(v_sortie) >= v_n;
      IF v_c = ANY (v_job_cles) THEN
        v_sortie := v_sortie || jsonb_build_array(p_job -> (array_position(v_job_cles, v_c) - 1));
      ELSIF jsonb_typeof(v_art_ent[v_i]) = 'string' THEN
        v_sortie := v_sortie || jsonb_build_array(jsonb_build_object('url', v_art_ent[v_i] #>> '{}',
          'type', CASE WHEN jsonb_array_length(v_sortie) = 0 THEN 'original' ELSE 'photo_' || jsonb_array_length(v_sortie) END));
      ELSE
        v_sortie := v_sortie || jsonb_build_array(v_art_ent[v_i]);
      END IF;
    ELSIF v_c = ANY (v_job_cles) THEN
      -- Les photos du job, dans l'ordre de l'article.
      v_sortie := v_sortie || jsonb_build_array(p_job -> (array_position(v_job_cles, v_c) - 1));
    END IF;
  END LOOP;
  IF v_sortie = p_job THEN RETURN p_job; END IF;
  RETURN v_sortie;
EXCEPTION WHEN OTHERS THEN
  -- Jamais une republication, une remise en vente ou une écriture de fiche refusée à cause de l'ordre : le job tel quel.
  RETURN p_job;
END
$function$;
CREATE OR REPLACE FUNCTION public.remise_en_vente_champs(p_pf jsonb)
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT COALESCE(jsonb_object_agg(e.key, e.value), '{}'::jsonb)
    FROM jsonb_each(CASE WHEN jsonb_typeof(p_pf) = 'object' THEN p_pf ELSE '{}'::jsonb END) e
   WHERE e.key !~ ('^(source|rattachement|check_|work_window|processing_since|veille_|quantite_ebay|'
     || 'last_diagnostic|unavailable|sale_|sold_|warnings|listing_url|lbc_depot|livraison_lbc|detected_price|'
     || 'beebs_moderation|beebs_valeurs_posees|beebs_index|beebs_rouvert|revue_|absence_|fin_ebay|reporte_|'
     || 'lien_|lien$|erreurs_|alerte_|numero_|vente|candidat_|needsUserAttempts|needsUserBoucle|'
     || 'needsUserField|needs_user|ebay_api|ebay_draft|ebay_format|ebay_connexion|ebayCategorieAttente|'
     || 'ebay_rayon_aveugle|moderation_|avant_|error_|retour_|preuve_|sequence_|opla_acces|opla_cookies|'
     || 'opla_sortie|publish_|derniere_|relance|pending_removal|retrait_|identifiant_|unfilled_|'
     || 'server_required|pas_de_rouge|attente_|lot_publication|suspect_|verdict_|stale_|reprise|'
     || 'rattrapage_|horloge_|plateforme_reprise|next_action|fige_|tache_|vinted_account_proof|gel_|'
     || 'remise_en_vente|republish|superseded|statut_reel|boucle|mur_|refus_|repare|requalif|'
     || 'reparation|titre_corrige|sonde_|compte_vendeur|build_min|correctif|verifier_doublon|'
     || 'new_listing|vinted_item_id|item_id|marque_traduite|colis_au_service|livraison_au_service)');
$function$;
CREATE OR REPLACE FUNCTION public.releve_apres_annulation(p_user uuid, p_platform text, p_depuis timestamp with time zone)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_kind text := CASE WHEN p_platform = 'vinted' THEN 'dressing' ELSE 'annonces' END;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vinted_sync_runs s WHERE s.user_id = p_user AND s.platform = p_platform AND s.kind = v_kind
                    AND s.status = 'done' AND s.finished_at > now() - interval '30 days') THEN
    RETURN 'sans_releve';
  END IF;
  IF EXISTS (SELECT 1 FROM vinted_sync_runs s WHERE s.user_id = p_user AND s.platform = p_platform AND s.kind = v_kind
                AND s.status = 'done' AND s.finished_at > p_depuis
                AND (CASE WHEN v_kind = 'annonces' THEN public.releve_preuve_absence(s.id)
                          ELSE COALESCE(s.items_vus, 0) > 0 AND COALESCE(s.erreur, '') NOT LIKE '[incomplet]%'
                               AND (s.total_entries IS NULL OR s.items_vus >= s.total_entries) END)) THEN
    RETURN 'vu';
  END IF;
  RETURN 'attendu';
END;
$function$;
`;

const client = new pg.Client({ connectionString: PG_URL });
await client.connect();
let ok = 0, ko = 0;
const verifier = (cond, msg) => { if (cond) { ok++; console.log('  ✓', msg); } else { ko++; console.log('  ✗', msg); } };
const q = async (sql, args = []) => (await client.query(sql, args)).rows;
const md5 = (s) => createHash('md5').update(s.replace(/\r/g, '')).digest('hex');
const NOMS = ['remises_en_vente_tick', 'ventes_annulees_a_remettre'];
const NOUVELLES = ['fiche_jumelle_prouvee', 'remise_annulee_vente_le', 'remise_annulee_jumelle_fermer', 'ventes_annulees_ne_pas_remettre'];
const defs = async () => Object.fromEntries((await q(`SELECT p.proname, pg_get_functiondef(p.oid) d FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = ANY($1)`, [NOMS])).map((r) => [r.proname, r.d]));
const ins = async (table, o) => {
  const k = Object.keys(o);
  return (await q(`INSERT INTO ${table} (${k.join(',')}) VALUES (${k.map((_, i) => '$' + (i + 1)).join(',')}) RETURNING *`, Object.values(o)))[0];
};
const jours = (n) => new Date(Date.now() + n * 86400_000).toISOString();
// dHash : 64 bits « 0/1 » déterministes ; voisin(d, k) = d avec k bits retournés (k ≤ 4 : quasi identique).
const dhash = (graine) => [...createHash('md5').update('photo:' + graine).digest().subarray(0, 8)].map((o) => o.toString(2).padStart(8, '0')).join('');
const voisin = (d, k) => d.split('').map((c, i) => (i < k ? (c === '0' ? '1' : '0') : c)).join('');
const photo = async (url, d) => { await ins('photo_empreintes', { url, dhash: d }); return url; };

const U = '11111111-1111-1111-1111-111111111111', V = '22222222-2222-2222-2222-222222222222';
const BOUTIQUE = '257364012';
const S = jours(-10);   // la vente (annulée ensuite)

// Une fiche dont la vente a été annulée : ses photos (fiche), ses remises proposées (une par plateforme).
let numero = 100;
async function ficheAnnulee(id, { user = U, plateformes = ['vinted'], photos = 3, graine = id, quantite = 1, statut = 'stock', fusionne = null,
  boutique = BOUTIQUE, avecSoldAt = true, vente = 1000 + id, statutRemise = 'proposee', photosDepot = null, titre = 'Article ' + id } = {}) {
  const urls = [];
  for (let k = 0; k < photos; k++) urls.push(await photo(`https://stockage/fiche-${id}-${k}.jpg`, dhash(graine * 10 + k)));
  const vid = String(9_000_000_000 + id);
  await ins('inventaire', { id, user_id: user, titre, statut, quantite, fusionne_dans: fusionne, photos: JSON.stringify(urls.map((url) => ({ url }))),
    vinted_item_id: vid, vinted_account_id: boutique, vinted_status: 'sold', created_at: jours(-40), origine: 'vinted_sync' });
  await ins('ventes_supprimees', { user_id: user, vente_id: vente, vendu_le: S, plateforme_code: 'vinted', annonce_id: vid });
  const lignes = [];
  for (const pf of plateformes) {
    const commande = String(5_000_000 + (numero++));
    const j = await ins('cross_post_jobs', { user_id: user, inventaire_id: id, platform: pf, status: 'cancelled', action: pf === 'vinted' ? 'republish' : 'publish',
      platform_listing_id: pf === 'vinted' ? vid : String(3_000_000_000 + id), sold_at: pf === 'vinted' && avecSoldAt ? S : null, title: titre, price: 10,
      photos: JSON.stringify(photosDepot ?? urls), platform_fields: JSON.stringify({ vente_annulee_remise: { commande, le: jours(-8), vente, statut: 'failed' } }) });
    lignes.push(await ins('remises_en_vente', { user_id: user, inventaire_id: id, platform: pf, job_vendu: j.id, statut: statutRemise,
      cree_le: jours(-8), ...(statutRemise === 'a_faire' ? { accepte_le: jours(-0.05), prochain_essai: jours(-0.01) } : {}) }));
  }
  await ins('vinted_listing_snapshots', { user_id: user, vinted_item_id: vid, inventaire_id: id, captured_at: jours(-11), status: 'active' });
  await ins('vinted_listing_snapshots', { user_id: user, vinted_item_id: vid, inventaire_id: id, captured_at: jours(-2), status: 'sold' });
  return { id, urls, graine, vid, lignes };
}
// La fiche née de la remise en ligne (synchro du dressing) : ses photos = voisines de celles de la fiche d'origine.
async function jumelle(id, f, { user = U, statut = 'stock', apparue = jours(-7), communes = 3, ecart = 2, boutique = BOUTIQUE, enLigne = true,
  photos = null, origine = 'vinted_sync', vinted = true, titre = 'Article ' + f.id } = {}) {
  const n = photos ?? f.urls.length;
  const urls = [];
  for (let k = 0; k < n; k++) urls.push(await photo(`https://images1.vinted.net/t/${id}-${k}.jpeg`, k < communes ? voisin(dhash(f.graine * 10 + k), ecart) : voisin(dhash(f.graine * 10 + k), 24)));
  await ins('inventaire', { id, user_id: user, titre, statut, quantite: statut === 'vendu' ? 0 : 1, photos: JSON.stringify(urls),
    vinted_item_id: vinted ? String(9_500_000_000 + id) : null, vinted_account_id: vinted ? boutique : null,
    vinted_status: vinted ? (statut === 'vendu' ? 'sold' : enLigne ? 'active' : 'closed') : null, disparu_le: enLigne ? null : jours(-1),
    created_at: apparue, first_seen_at: vinted ? apparue : null, origine });
  return id;
}
const lignesDe = async (fiche) => q('SELECT platform, statut, motif FROM remises_en_vente WHERE inventaire_id = $1 ORDER BY platform', [fiche]);
const fermees = (ls, motif) => ls.length > 0 && ls.every((l) => l.statut === 'abandonnee' && l.motif === motif);
const restent = (ls) => ls.length > 0 && ls.every((l) => l.statut === 'proposee');
const sous = async (uid, fn) => { await q(`SELECT set_config('request.jwt.claim.sub', $1, false), set_config('request.jwt.claim.role', $2, false)`, [uid ?? '', uid ? 'authenticated' : '']); try { return await fn(); } finally { await q(`SELECT set_config('request.jwt.claim.sub', '', false), set_config('request.jwt.claim.role', '', false)`); } };

try {
  await client.query(BANC);
  console.log('1. Départ = les définitions de PROD du 07/11');
  await client.query(INVERSE);   // ses DROP IF EXISTS ne trouvent rien, son UPDATE aucune ligne
  const avant = await defs();
  verifier(NOMS.every((n) => md5(avant[n] ?? '') === MD5_PROD[n]), `md5 identiques à la prod (${NOMS.map((n) => md5(avant[n] ?? '').slice(0, 8)).join(', ')})`);

  console.log('2. La garde, puis la migration');
  await client.query(avant.remises_en_vente_tick.replace('BEGIN\n  SELECT pct INTO v_cpu', 'BEGIN\n  -- retouche faite en prod\n  SELECT pct INTO v_cpu'));
  let refus = null;
  try { await client.query(MIGRATION); } catch (e) { refus = e.message; }
  verifier(/a changé en prod depuis le 07\/11/.test(refus ?? ''), 'une prod qui a changé depuis la lecture : la migration refuse, rien n\'est appliqué');
  verifier((await q(`SELECT count(*)::int n FROM pg_proc WHERE proname = ANY($1)`, [NOUVELLES]))[0].n === 0, '… et aucune fonction nouvelle n\'est posée');
  await client.query(avant.remises_en_vente_tick);
  await client.query(MIGRATION);
  await client.query(MIGRATION); // rejouable (la garde reconnaît sa propre version)
  verifier(true, 'la migration s\'applique, deux fois de suite');
  const apres = await defs();
  const lignesProd = avant.remises_en_vente_tick.split('\n'), lignesNeuves = apres.remises_en_vente_tick.split('\n');
  let k = 0; const manquantes = [];
  for (const l of lignesProd) { const at = lignesNeuves.indexOf(l, k); if (at < 0) manquantes.push(l.trim()); else k = at + 1; }
  verifier(manquantes.length === 1 && /'abandonnees', v_abandons, 'cpu', v_cpu\);/.test(manquantes[0]),
    `chaque ligne de prod de remises_en_vente_tick est gardée, dans l'ordre (seule change la ligne du bilan : ${manquantes.length})`);

  console.log('3. Pré-fermeture avant l\'appui');
  await ins('profiles', { id: U, extension_last_seen_at: jours(0) });
  await ins('profiles', { id: V, extension_last_seen_at: jours(0) });
  // F1 : jumelle VENDUE → toutes les plateformes « vendu_sous_autre_fiche »
  const F1 = await ficheAnnulee(1, { plateformes: ['vinted', 'ebay', 'leboncoin'] });
  const T1 = await jumelle(101, F1, { statut: 'vendu' });
  // F2 : seulement des copies (eBay, Leboncoin : le repère vient de la vente retirée) ; les photos communes sont celles
  //      d'un DÉPÔT de la fiche (photos du CDN Vinted), pas celles de la fiche → jumelle en stock en ligne
  const F2 = await ficheAnnulee(2, { plateformes: ['ebay', 'leboncoin'], photos: 4 });
  const depot2 = [];
  for (let n = 0; n < 2; n++) depot2.push(await photo(`https://images1.vinted.net/t/depot-2-${n}.jpeg`, dhash(77_000 + n)));
  await ins('cross_post_jobs', { user_id: U, inventaire_id: 2, platform: 'vinted', status: 'cancelled', action: 'republish', platform_listing_id: '9000000002', photos: JSON.stringify(depot2), platform_fields: '{}' });
  const T2 = await jumelle(102, F2, { communes: 0, photos: 3 });
  await q(`UPDATE photo_empreintes SET dhash = $1 WHERE url = 'https://images1.vinted.net/t/102-0.jpeg'`, [voisin(dhash(77_000), 1)]);
  await q(`UPDATE photo_empreintes SET dhash = $1 WHERE url = 'https://images1.vinted.net/t/102-1.jpeg'`, [voisin(dhash(77_001), 2)]);
  // F3 : copies seulement (eBay, Leboncoin) ; jumelle en stock, mais l'ancienne annonce Vinted de la fiche revue EN LIGNE
  //      après l'apparition de la jumelle (en ligne ensemble = deux exemplaires) → reste. (Une ligne Vinted serait déjà
  //      fermée « deja_en_vente » par la règle du 24/10 : l'annonce vendue revue active après l'annulation.)
  const F3 = await ficheAnnulee(3, { plateformes: ['ebay', 'leboncoin'] });
  await jumelle(103, F3);
  await ins('vinted_listing_snapshots', { user_id: U, vinted_item_id: F3.vid, inventaire_id: 3, captured_at: jours(-1), status: 'active' });
  // F4 : DEUX exemplaires remis en ligne la même minute, mêmes photos → deux jumelles = le doute → reste
  const F4 = await ficheAnnulee(4);
  await jumelle(104, F4, { apparue: jours(-6) });
  await jumelle(1040, F4, { apparue: jours(-6) });
  // F5 : photos différentes (24 bits) → reste
  const F5 = await ficheAnnulee(5);
  await jumelle(105, F5, { communes: 0 });
  // F6 : fiche VENDUE ; F7 : fondue dans une autre ; F8 : effacée → « plus_en_stock »
  await ficheAnnulee(6, { statut: 'vendu', quantite: 0 });
  await ficheAnnulee(7, { fusionne: 1 });
  await ficheAnnulee(8);
  await q('DELETE FROM inventaire WHERE id = 8');
  // F9 : autre boutique Vinted → reste ; F10 : apparue AVANT la vente → reste ; F11 : un seul exemplaire de chaque côté ?
  //      non : la fiche en a 2 → reste ; F12 : jumelle en stock HORS LIGNE → reste ; F13 : titre identique, aucune photo
  //      commune → reste (jamais sur un titre)
  const F9 = await ficheAnnulee(9); await jumelle(109, F9, { boutique: '999' });
  const F10 = await ficheAnnulee(10); await jumelle(110, F10, { apparue: jours(-12) });
  const F11 = await ficheAnnulee(11, { quantite: 2 }); await jumelle(111, F11);
  const F12 = await ficheAnnulee(12); await jumelle(112, F12, { enLigne: false });
  const F13 = await ficheAnnulee(13, { titre: 'Robe portefeuille verte taille 36' }); await jumelle(113, F13, { communes: 0, titre: 'Robe portefeuille verte taille 36' });
  // F14 : UNE photo de chaque côté, quasi identique (la spatule de 02ca0f20) ; la jumelle est une annonce Leboncoin en
  //       ligne → la ligne RESTE (07/11, décision de Nico : plus jamais « 1 photo suffit »)
  const F14 = await ficheAnnulee(14, { photos: 1 });
  await jumelle(114, F14, { photos: 1, communes: 1, vinted: false, origine: 'releve_leboncoin' });
  await ins('annonces_plateforme', { user_id: U, platform: 'leboncoin', listing_id: '3300000114', inventaire_id: 114, statut_plateforme: 'en_ligne', vu_le: jours(-1) });
  // F17 : 2 photos communes sur 7 (fiche) et 9 (jumelle) — le pantalon de f0acd3af : une ressemblance → RESTE
  const F17 = await ficheAnnulee(17, { photos: 7 }); await jumelle(117, F17, { photos: 9, communes: 2 });
  // F18 : la même image en DOUBLE de chaque côté (deux photos de la fiche quasi identiques entre elles, deux de la
  //       jumelle aussi) : 2 « photos communes » qui ne sont qu'une image → RESTE
  const F18 = await ficheAnnulee(18, { photos: 2 });
  await q(`UPDATE photo_empreintes SET dhash = $1 WHERE url = $2`, [voisin(dhash(180), 1), F18.urls[1]]);
  await jumelle(118, F18, { photos: 2, communes: 1 });
  await q(`UPDATE photo_empreintes SET dhash = $1 WHERE url = 'https://images1.vinted.net/t/118-1.jpeg'`, [voisin(dhash(180), 3)]);
  // F19 : une jumelle solide (3 sur 3) ET une seconde fiche née du relevé avec UNE photo commune → le doute → RESTE
  const F19 = await ficheAnnulee(19); await jumelle(119, F19);
  await jumelle(1190, F19, { communes: 1, enLigne: false });
  // F21 : le pull rayé d'Ornella — fiche à 2 photos, jumelle à 3, les 2 photos de la fiche dans la jumelle → fermée
  const F21 = await ficheAnnulee(21, { photos: 2 }); const T21 = await jumelle(121, F21, { photos: 3, communes: 2 });
  // F15 : une autre annonce de la fiche vue EN LIGNE après l'apparition de la jumelle (deux exemplaires ?) → reste
  const F15 = await ficheAnnulee(15); await jumelle(115, F15);
  await ins('annonces_plateforme', { user_id: U, platform: 'depop', listing_id: 'depop-15', inventaire_id: 15, statut_plateforme: 'en_ligne', vu_le: jours(-1) });
  // F16 : la « jumelle » est une fiche faite dans l'APP (un second exemplaire dupliqué à la main, origine vide) → reste
  const F16 = await ficheAnnulee(16); await jumelle(116, F16, { origine: null });
  // V : un autre compte, sa propre proposition
  const FV = await ficheAnnulee(20, { user: V });
  await jumelle(120, FV, { user: V, boutique: '777' });   // autre boutique : la ligne de V reste

  console.log('   (d) l\'écran, avant le passage : une fiche hors stock ou fondue ne s\'affiche plus');
  const ecranAvant = await sous(U, () => q('SELECT * FROM ventes_annulees_a_remettre()'));
  const vus = new Set(ecranAvant.map((r) => Number(r.inventaire_id)));
  verifier(!vus.has(6) && !vus.has(7) && !vus.has(8) && vus.has(1) && vus.has(3), `fiches 6 (vendue), 7 (fondue), 8 (effacée) absentes ; 1 et 3 présentes (${[...vus].sort((a, b) => a - b).join(',')})`);

  const bilan = (await q('SELECT remises_en_vente_tick(20) b'))[0].b;
  console.log('   bilan du passage :', JSON.stringify(bilan));
  verifier(fermees(await lignesDe(1), 'vendu_sous_autre_fiche') && (await lignesDe(1)).length === 3, 'F1 jumelle vendue : vinted, ebay, leboncoin → « vendu_sous_autre_fiche » (aucune nouvelle annonce pour un article vendu)');
  verifier(fermees(await lignesDe(2), 'deja_en_vente_autre_fiche'), 'F2 jumelle en stock en ligne (photos d\'un dépôt, repère = la vente retirée) → « deja_en_vente_autre_fiche »');
  verifier(restent(await lignesDe(3)), 'F3 l\'ancienne revue en ligne après l\'apparition de la jumelle (en ligne ensemble) → la ligne reste');
  verifier(restent(await lignesDe(4)), 'F4 deux exemplaires apparus la même minute → la ligne reste (le doute)');
  verifier(restent(await lignesDe(5)), 'F5 photos différentes → la ligne reste');
  verifier(fermees(await lignesDe(6), 'plus_en_stock') && fermees(await lignesDe(7), 'plus_en_stock') && fermees(await lignesDe(8), 'plus_en_stock'),
    'F6 vendue, F7 fondue, F8 effacée → « plus_en_stock »');
  verifier(restent(await lignesDe(9)) && restent(await lignesDe(10)) && restent(await lignesDe(11)) && restent(await lignesDe(12)) && restent(await lignesDe(13)),
    'F9 autre boutique, F10 apparue avant la vente, F11 deux exemplaires, F12 jumelle hors ligne, F13 titre seul → les lignes restent');
  verifier(restent(await lignesDe(14)), 'F14 une photo de chaque côté (la spatule) → la ligne RESTE (plus jamais « 1 photo suffit »)');
  verifier(restent(await lignesDe(17)), 'F17 2 photos communes sur 7 et 9 (le pantalon) → la ligne RESTE');
  verifier(restent(await lignesDe(18)), 'F18 la même image en double de chaque côté → la ligne RESTE');
  verifier(restent(await lignesDe(19)), 'F19 une jumelle solide ET une seconde fiche à une photo commune → la ligne RESTE (le doute)');
  verifier(fermees(await lignesDe(21), 'deja_en_vente_autre_fiche'), 'F21 2 photos communes sur 2 et 3 (le pull rayé) → « deja_en_vente_autre_fiche »');
  verifier(restent(await lignesDe(15)), 'F15 une autre annonce de la fiche vue en ligne après la jumelle → la ligne reste');
  verifier(restent(await lignesDe(16)), 'F16 « jumelle » faite dans l\'app (second exemplaire dupliqué à la main) → la ligne reste');
  verifier(restent(await lignesDe(20)), 'V (autre compte, autre boutique) : sa ligne reste');
  const traces = Object.fromEntries((await q(`SELECT metadata FROM usage_logs WHERE feature = 'remise_annulee_fermee_jumelle'`)).map((t) => [t.metadata.inventaire_id, t.metadata]));
  verifier(Object.keys(traces).length === 3 && traces['1']?.jumelle === String(T1) && traces['1']?.lignes === 3 && traces['2']?.jumelle === String(T2)
    && traces['21']?.jumelle === String(T21) && traces['21']?.photos_communes === 2 && !traces['14'],
    `une trace par fiche fermée, jumelle nommée (${Object.values(traces).map((t) => t.inventaire_id + '→' + t.jumelle + ' ' + t.motif).join(', ')})`);
  verifier(bilan.jumelles === 3 && bilan.hors_stock === 3, 'le bilan compte 3 jumelles et 3 lignes hors stock');
  verifier((await q(`SELECT count(*)::int n FROM cross_post_jobs WHERE status = 'pending'`))[0].n === 0, 'aucune publication créée');

  console.log('4. La même garde juste avant l\'INSERT (lignes « à faire »)');
  const F30 = await ficheAnnulee(30, { plateformes: ['vinted', 'ebay'], statutRemise: 'a_faire' });
  await jumelle(130, F30, { statut: 'vendu' });
  const F31 = await ficheAnnulee(31, { statutRemise: 'a_faire' });   // sans jumelle : la publication part comme avant
  const b2 = (await q('SELECT remises_en_vente_tick(20) b'))[0].b;
  verifier(fermees(await lignesDe(30), 'vendu_sous_autre_fiche'), 'F30 acceptée (« à faire »), jumelle vendue : vinted ET ebay fermées « vendu_sous_autre_fiche »');
  verifier((await q(`SELECT count(*)::int n FROM cross_post_jobs WHERE inventaire_id = 30 AND status = 'pending'`))[0].n === 0, 'F30 : aucune publication créée');
  const l31 = (await lignesDe(31))[0];
  const j31 = await q(`SELECT platform_fields FROM cross_post_jobs WHERE inventaire_id = 31 AND status = 'pending' AND action = 'publish'`);
  verifier(l31.statut === 'faite' && j31.length === 1 && j31[0].platform_fields.remise_par_republier?.item_id === F31.vid && j31[0].platform_fields.hors_quota === true,
    'F31 sans jumelle : la publication part comme avant (« Republier » de Vinted, hors quota)');
  verifier(b2.faites === 1 && b2.abandonnees === 1 && b2.jumelles === 1, `bilan : 1 faite, 1 fiche fermée par la garde (${JSON.stringify(b2)})`);

  console.log('5. « Ne pas remettre en vente » (ventes_annulees_ne_pas_remettre)');
  let refusSession = null;
  try { await q('SELECT ventes_annulees_ne_pas_remettre(5)'); } catch (e) { refusSession = e.code; }
  verifier(refusSession === '42501', 'sans session : refus 42501');
  const parV = await sous(V, () => q('SELECT ventes_annulees_ne_pas_remettre(5) r'));
  verifier(parV[0].r.ok === false && restent(await lignesDe(5)), 'un AUTRE compte sur la fiche de U : rien (« rien_a_remettre »), la ligne de U reste');
  const parU = await sous(U, () => q('SELECT ventes_annulees_ne_pas_remettre(5) r'));
  verifier(parU[0].r.ok === true && JSON.stringify(parU[0].r.plateformes) === '["vinted"]' && fermees(await lignesDe(5), 'choix_personne'), 'U sur sa fiche 5 : « abandonnee », motif « choix_personne »');
  verifier(restent(await lignesDe(3)) && restent(await lignesDe(4)) && restent(await lignesDe(20)), 'les autres fiches de U et la ligne de V : intactes');
  verifier((await sous(U, () => q('SELECT ventes_annulees_ne_pas_remettre(5) r')))[0].r.ok === false, 'second appui : rien à refaire');
  const droits = (await q(`SELECT has_function_privilege('anon', 'public.ventes_annulees_ne_pas_remettre(bigint)', 'EXECUTE') a,
    has_function_privilege('authenticated', 'public.ventes_annulees_ne_pas_remettre(bigint)', 'EXECUTE') b,
    has_function_privilege('authenticated', 'public.fiche_jumelle_prouvee(uuid,bigint,timestamptz)', 'EXECUTE') c,
    has_function_privilege('authenticated', 'public.remise_annulee_jumelle_fermer(uuid,bigint)', 'EXECUTE') d,
    has_function_privilege('anon', 'public.remise_annulee_vente_le(uuid,bigint)', 'EXECUTE') e`))[0];
  verifier(!droits.a && droits.b && !droits.c && !droits.d && !droits.e, 'droits : le geste à authenticated seulement ; les aides fermées aux clients');

  console.log('6. L\'écran « Ventes annulées »');
  const ecran = Object.fromEntries((await sous(U, () => q('SELECT * FROM ventes_annulees_a_remettre()'))).map((r) => [Number(r.inventaire_id), r]));
  verifier(ecran[1]?.etat === 'abandonnee' && ecran[1]?.motif === 'vendu_sous_autre_fiche', 'F1 : « abandonnee », motif « vendu_sous_autre_fiche » (24 h)');
  verifier(ecran[2]?.motif === 'deja_en_vente_autre_fiche' && ecran[5]?.motif === 'choix_personne' && ecran[3]?.etat === 'proposee', 'F2 « deja_en_vente_autre_fiche », F5 « choix_personne », F3 toujours proposée');
  verifier(!ecran[6] && !ecran[7] && !ecran[8] && !ecran[20], 'hors stock / fondue / effacée / autre compte : absentes');

  console.log('7. Idempotence');
  const logsAvant = (await q('SELECT count(*)::int n FROM usage_logs'))[0].n;
  const etatAvant = JSON.stringify(await q('SELECT id, statut, motif, traite_le FROM remises_en_vente ORDER BY id'));
  const b3 = (await q('SELECT remises_en_vente_tick(20) b'))[0].b;
  verifier(JSON.stringify(await q('SELECT id, statut, motif, traite_le FROM remises_en_vente ORDER BY id')) === etatAvant
    && (await q('SELECT count(*)::int n FROM usage_logs'))[0].n === logsAvant && b3.jumelles === 0 && b3.hors_stock === 0,
    'second passage : aucune ligne réécrite, aucune trace de plus');

  console.log('8. L\'inverse');
  await client.query(INVERSE);
  const rendu = await defs();
  verifier(NOMS.every((n) => md5(rendu[n]) === MD5_PROD[n]), 'les deux définitions de prod reviennent à l\'identique (md5 de la prod)');
  verifier((await q(`SELECT count(*)::int n FROM pg_proc WHERE proname = ANY($1)`, [NOUVELLES]))[0].n === 0, 'les quatre fonctions nouvelles sont retirées');
  verifier(restent(await lignesDe(1)) && restent(await lignesDe(6)) && fermees(await lignesDe(5), 'choix_personne'),
    'les lignes fermées par la règle redeviennent « proposée » ; le choix de la personne reste');
} catch (e) {
  ko++; console.error('ERREUR', e.message);
} finally {
  await client.end();
  if (embarque) { await embarque.pg.stop(); try { embarque.rmSync(embarque.dossier, { recursive: true, force: true }); } catch { /* */ } }
}
console.log(`\n${ok} vérifiés, ${ko} en échec`);
process.exit(ko ? 1 : 0);
