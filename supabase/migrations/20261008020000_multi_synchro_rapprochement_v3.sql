-- ════════════════════════════════════════════════════════════════════════════
-- MULTI-SYNCHRO — LE RAPPROCHEMENT v3, TOUT EN UNE PASSE (08/10/2026, nuit)
-- ════════════════════════════════════════════════════════════════════════════
-- Règle de Nico (07/10) : « un article n'entre JAMAIS dans le stock tant qu'il
-- n'a pas été rapproché de tout ce que l'utilisateur a déjà ». Ce qu'il a vu
-- le 07/10 (Corinne : 790 cartes pour ~350 articles, 334 « à vérifier » DANS
-- le stock ; videdressingtiandco : 759 propositions pour 253 annonces Opla,
-- jamais tranchées ; coronado.maeva, hu.anastasia : annonces sans carte) :
--   · le moteur du 07/10 comparait UNE couverture à UNE couverture, la VIGNETTE
--     Leboncoin (79×140) comprise, sur l'image entière (d ≤ 5 / p ≤ 8) ; Vinted
--     recadre en 3:4 → deux photos identiques ressortaient à 11-31 bits ;
--   · tout autre signal devenait un doute, et le doute une carte « à vérifier »
--     (que l'app 2.9.65 affichait dans le stock) ;
--   · une annonce qui portait déjà une proposition était sautée pour toujours.
--
-- CE QUI CHANGE. La DÉCISION sort de la base : la fonction edge `rapprochement`
-- lit tout le compte en un appel (rapprochement_v3_lire), compare TOUTES les
-- photos (6 par annonce, 6 lectures par photo — photo_empreintes.variantes),
-- tranche avec le moteur partagé (_shared/rapprochement/moteur.js : jamais la
-- photo seule, jamais le titre seul, jamais deux annonces d'une même
-- plateforme), puis ÉCRIT son plan en une fois (rapprochement_v3_appliquer).
-- La base garde les gardes : une fusion ne touche qu'un article INTACT
-- (rapprochement_v3_fiche_intacte), un article modifié par la personne reçoit
-- une question ; une annonce ignorée par la personne n'est jamais rejugée ;
-- une paire tranchée par la personne n'est jamais reposée (index unique).
-- Réponses de Nico (08/10) : « Annonce en double ? » (même photo + même titre
-- deux fois sur une plateforme : question dédiée, hors du stock, jamais une
-- fusion), photo identique mais titre/taille contradictoires → à vérifier,
-- titre identique sans photo → à vérifier.
--
-- Et aussi : « Synchroniser » pendant la cadence (15 min) n'est plus un refus
-- (demander_sync_plateforme rend `recent` et relance le rapprochement) ; un
-- compte eBay relié par l'API voit son relevé partir TOUT DE SUITE par l'API
-- (pg_net vers ebay-releve-api), plus jamais par l'extension (cas fmallet25,
-- 07/10 : relevé « page de connexion » par l'extension, puis « Déconnecter
-- eBay » cliqué par la personne — la ligne ebay_accounts disparaissait par
-- SON geste, provoqué par notre erreur de voie).
--
-- Inverse : scripts/reparations/20261008020000_multi_synchro_rapprochement_v3_INVERSE.sql
-- Appliquer : db query --linked -f, puis migration repair --linked --status applied 20261008020000.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;
SET LOCAL lock_timeout = '10s';

-- ── 1. LES VARIANTES D'EMPREINTE (centre 70 %, quatre carrés centraux) ──────
-- { "c70": [dhash, phash], "p85": [...], "g45": [...], "g60": [...], "g35": [...] }
-- Calculées par empreintes-urls à partir du 08/10 ; une ligne sans variantes
-- est recalculée (cache, aucune donnée de la personne).
ALTER TABLE public.photo_empreintes ADD COLUMN IF NOT EXISTS variantes jsonb;

-- ── 2. UN ARTICLE INTACT : rien de la personne dessus ────────────────────────
-- Les mêmes critères que le rattrapage du 07/10 : en stock, quantité 1, pas de
-- vente, pas de dépôt FillSell (hors suivi de relevé), pas de prix d'achat, pas
-- de prix/poids changés dans l'app, pas de fiche d'annonce, pas de notification
-- ni de remise en vente, aucun attribut saisi à la main, une seule annonce.
CREATE OR REPLACE FUNCTION public.rapprochement_v3_fiche_intacte(p_fiche bigint)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM inventaire i
     WHERE i.id = p_fiche AND i.statut = 'stock' AND i.fusionne_dans IS NULL
       AND COALESCE(i.quantite, 1) <= 1
       AND i.prix_achat IS NULL AND NOT COALESCE(i.prix_achat_inconnu, false)
       AND i.prix_vente_change_par IS DISTINCT FROM 'app' AND i.poids_change_par IS DISTINCT FROM 'app'
       AND NOT EXISTS (SELECT 1 FROM ventes v WHERE v.inventaire_id = i.id)
       AND NOT EXISTS (SELECT 1 FROM cross_post_jobs j WHERE j.inventaire_id = i.id
                         AND (COALESCE(j.platform_fields ->> 'source', '') <> 'releve'
                              OR j.status IN ('pending', 'processing', 'needs_user')))
       AND NOT EXISTS (SELECT 1 FROM fiches_annonce fa WHERE fa.inventaire_id = i.id)
       AND NOT EXISTS (SELECT 1 FROM push_ventes pv WHERE pv.inventaire_id = i.id)
       AND NOT EXISTS (SELECT 1 FROM remises_en_vente rv WHERE rv.inventaire_id = i.id)
       AND NOT EXISTS (SELECT 1 FROM jsonb_each(CASE WHEN jsonb_typeof(i.attributs) = 'object' THEN i.attributs ELSE '{}'::jsonb END) e
                        WHERE jsonb_typeof(e.value) = 'object' AND e.value ->> 'source' = 'manuel')
       AND (SELECT count(*) FROM annonces_plateforme x WHERE x.inventaire_id = i.id AND x.disparu_le IS NULL) <= 1);
$function$;
REVOKE ALL ON FUNCTION public.rapprochement_v3_fiche_intacte(bigint) FROM PUBLIC, anon, authenticated;

-- ── 3. LIRE TOUT LE COMPTE, EN UN APPEL ─────────────────────────────────────
-- Les articles (la base Vinted et les articles de l'app ; les imports de
-- relevé sont représentés par leur annonce), les annonces vivantes des quatre
-- plateformes relevées, les fusions et les questions. Lecture seule.
CREATE OR REPLACE FUNCTION public.rapprochement_v3_lire(p_user uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
 SET statement_timeout TO '90s'
AS $function$
DECLARE v_fiches jsonb; v_annonces jsonb; v_fusions jsonb; v_doublons jsonb;
BEGIN
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', i.id::text, 'titre', i.titre, 'prix', i.prix_vente, 'statut', i.statut, 'origine', i.origine,
      'marque', COALESCE(NULLIF(trim(i.marque), ''), CASE WHEN jsonb_typeof(i.attributs -> 'marque') = 'object' THEN i.attributs -> 'marque' ->> 'v' ELSE i.attributs ->> 'marque' END),
      'taille', CASE WHEN jsonb_typeof(i.attributs -> 'taille') = 'object' THEN i.attributs -> 'taille' ->> 'v' ELSE i.attributs ->> 'taille' END,
      'photos', COALESCE((SELECT jsonb_agg(z.u ORDER BY z.o) FROM (
                  SELECT CASE WHEN jsonb_typeof(e) = 'string' THEN e #>> '{}' WHEN jsonb_typeof(e) = 'object' THEN COALESCE(e ->> 'url', e ->> 'original') END u, o
                    FROM jsonb_array_elements(CASE WHEN jsonb_typeof(i.photos) = 'array' THEN i.photos ELSE '[]'::jsonb END) WITH ORDINALITY x(e, o)
                   LIMIT 6) z WHERE z.u ~ '^https://'), '[]'::jsonb),
      'a_verifier', i.a_verifier IS NOT NULL,
      'a_verifier_auto', i.a_verifier IS NOT NULL AND COALESCE(i.a_verifier ->> 'source', '') IN ('moteur', 'rattrapage_0710', 'rapprochement_v3'),
      'created_at', i.created_at, 'quantite', COALESCE(i.quantite, 1), 'vinted_item_id', i.vinted_item_id,
      'intact', rapprochement_v3_fiche_intacte(i.id)
    )), '[]'::jsonb)
    INTO v_fiches
    FROM inventaire i
   WHERE i.user_id = p_user AND i.fusionne_dans IS NULL AND i.statut IN ('stock', 'vendu');

  WITH runs AS (
    SELECT r.id, releve_run_hors_liste(r.id) hors_liste, releve_est_geste(r.declencheur) geste,
           (r.platform = 'ebay' AND releve_ebay_run_bloque(r.id)) ebay_bloque
      FROM vinted_sync_runs r
     WHERE r.id IN (SELECT DISTINCT a.run_id FROM annonces_plateforme a WHERE a.user_id = p_user AND a.disparu_le IS NULL AND a.run_id IS NOT NULL)
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', a.id, 'platform', a.platform, 'listing_id', a.listing_id, 'url', a.url, 'titre', a.titre, 'prix', a.prix,
      'photo_url', a.photo_url,
      'photos', (
        -- les photos de la fiche rapatriée (notre stockage) quand il y en a, sinon la
        -- capture (Leboncoin : la grande image, jamais la vignette), sinon la couverture
        SELECT COALESCE(
          (SELECT jsonb_agg(z.u ORDER BY z.o) FROM (
             SELECT CASE WHEN jsonb_typeof(e) = 'string' THEN e #>> '{}' WHEN jsonb_typeof(e) = 'object' THEN COALESCE(e ->> 'url', e ->> 'original') END u, o
               FROM inventaire i2, jsonb_array_elements(CASE WHEN jsonb_typeof(i2.photos) = 'array' THEN i2.photos ELSE '[]'::jsonb END) WITH ORDINALITY x(e, o)
              WHERE i2.id = a.inventaire_id AND i2.origine = 'releve_' || a.platform
                AND (i2.photos -> 0) #>> '{}' LIKE '%/storage/v1/object/public/listing-photos/%'
              LIMIT 6) z WHERE z.u ~ '^https://'),
          (SELECT jsonb_agg(regexp_replace(z.u, 'rule=ad-(thumb|small|medium)', 'rule=ad-large') ORDER BY z.o) FROM (
             SELECT e #>> '{}' u, o FROM jsonb_array_elements(CASE WHEN jsonb_typeof(a.capture -> 'photos') = 'array' THEN a.capture -> 'photos' ELSE '[]'::jsonb END) WITH ORDINALITY x(e, o)
              WHERE jsonb_typeof(e) = 'string' LIMIT 6) z WHERE z.u ~ '^https://'),
          CASE WHEN a.photo_url ~ '^https://' THEN jsonb_build_array(regexp_replace(a.photo_url, 'rule=ad-(thumb|small|medium)', 'rule=ad-large')) ELSE '[]'::jsonb END)),
      'taille', a.capture ->> 'taille', 'marque', a.capture ->> 'marque',
      'inventaire_id', a.inventaire_id::text,
      'ignoree', a.ignoree_le IS NOT NULL,
      'ignoree_par_utilisateur', a.ignoree_le IS NOT NULL AND EXISTS (SELECT 1 FROM rapprochements r WHERE r.annonce_id = a.id AND r.decision = 'ignore' AND r.par = 'utilisateur'),
      'proposition_motif', a.proposition ->> 'motif',
      'source', a.source_rapprochement, 'run_id', a.run_id,
      'en_ligne', a.statut_plateforme = 'en_ligne' AND a.fiche_supprimee_le IS NULL,
      'hors_liste', COALESCE(ru.hors_liste, false), 'ebay_bloque', COALESCE(ru.ebay_bloque, false), 'geste', COALESCE(ru.geste, false),
      'derniere_par', d.par, 'derniere_decision', d.decision, 'derniere_motif', d.motif
    )), '[]'::jsonb)
    INTO v_annonces
    FROM annonces_plateforme a
    LEFT JOIN runs ru ON ru.id = a.run_id
    LEFT JOIN LATERAL (SELECT r.par, r.decision, r.detail ->> 'motif' motif FROM rapprochements r
                        WHERE r.annonce_id = a.id AND r.decision IN ('attache', 'import', 'ignore')
                        ORDER BY r.created_at DESC LIMIT 1) d ON true
   WHERE a.user_id = p_user AND a.disparu_le IS NULL AND a.platform IN ('leboncoin', 'beebs', 'ebay', 'opla')
     AND NOT (a.url IS NOT NULL AND annonce_lien_notification(a.url));

  SELECT COALESCE(jsonb_agg(jsonb_build_object('garde', f.garde::text, 'absorbe', f.absorbe::text, 'par', f.par, 'defaite', f.defait_le IS NOT NULL)), '[]'::jsonb)
    INTO v_fusions FROM inventaire_fusions f WHERE f.user_id = p_user;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', d.id, 'garde', d.garde::text, 'absorbe', d.absorbe::text, 'statut', d.statut, 'motif', d.motif,
                                                 'decide_par', d.decide_par, 'source', d.source,
                                                 'auto', d.decide_par IS NULL AND COALESCE(d.source, '') = 'releve' AND d.motif IS DISTINCT FROM 'copie_non_prouvee')), '[]'::jsonb)
    INTO v_doublons FROM inventaire_doublons d WHERE d.user_id = p_user AND d.statut IN ('proposee', 'refusee', 'fusionnee');

  RETURN jsonb_build_object(
    'user_id', p_user, 'fiches', v_fiches, 'annonces', v_annonces, 'fusions', v_fusions, 'doublons', v_doublons,
    'dette_beebs', releve_dette_beebs(p_user),
    'import_ouvert', COALESCE((SELECT value FROM coin_config WHERE key = 'import_auto_ouvert'), 0) = 1,
    'geste_recent', EXISTS (SELECT 1 FROM vinted_sync_runs s WHERE s.user_id = p_user AND s.kind IN ('annonces', 'dressing')
                             AND releve_est_geste(s.declencheur) AND COALESCE(s.queued_at, s.started_at) > now() - interval '2 hours'),
    'lu_le', now());
END;
$function$;
REVOKE ALL ON FUNCTION public.rapprochement_v3_lire(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rapprochement_v3_lire(uuid) TO service_role;

-- ── 4. LES EMPREINTES D'UNE LISTE D'URL (et les photos illisibles) ──────────
CREATE OR REPLACE FUNCTION public.rapprochement_v3_empreintes(p_urls text[])
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT jsonb_build_object(
    'empreintes', COALESCE((SELECT jsonb_agg(jsonb_build_object('url', e.url, 'dhash', e.dhash, 'phash', e.phash, 'variantes', e.variantes))
                              FROM photo_empreintes e WHERE e.url = ANY (p_urls)), '[]'::jsonb),
    'illisibles', COALESCE((SELECT jsonb_agg(x.url) FROM photo_empreintes_echecs x WHERE x.url = ANY (p_urls)), '[]'::jsonb));
$function$;
REVOKE ALL ON FUNCTION public.rapprochement_v3_empreintes(text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rapprochement_v3_empreintes(text[]) TO service_role;

-- ── 5. UN RELEVÉ DU COMPTE EST-IL ENCORE EN COURS ? (même règle que la phase A) ─
CREATE OR REPLACE FUNCTION public.rapprochement_v3_releves_en_cours(p_user uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT EXISTS (SELECT 1 FROM vinted_sync_runs s
                  WHERE s.user_id = p_user AND s.kind IN ('annonces', 'dressing')
                    AND ((s.status = 'queued' AND COALESCE(s.queued_at, s.updated_at) > now() - interval '30 minutes')
                      OR (s.status = 'running' AND COALESCE(s.progres_le, s.updated_at, s.started_at) > now() - interval '10 minutes')));
$function$;
REVOKE ALL ON FUNCTION public.rapprochement_v3_releves_en_cours(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rapprochement_v3_releves_en_cours(uuid) TO service_role;

-- ── 6. L'ARTICLE D'UNE ANNONCE : celui qu'elle a, sinon créé (sous conditions) ─
-- Jamais sans geste (releves_sur_geste, 05/10) sauf p_geste (la personne vient
-- d'appuyer, ou la réparation décidée par Nico) ; jamais une annonce hors
-- ligne, ignorée, hors liste, supprimée exprès ; jamais pendant la dette Beebs.
CREATE OR REPLACE FUNCTION public.rapprochement_v3_fiche_de(p_user uuid, p_annonce uuid, p_geste boolean)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE a annonces_plateforme%ROWTYPE; v_run vinted_sync_runs%ROWTYPE; v_imp jsonb;
BEGIN
  SELECT * INTO a FROM annonces_plateforme WHERE id = p_annonce AND user_id = p_user;
  IF a.id IS NULL THEN RETURN NULL; END IF;
  IF a.inventaire_id IS NOT NULL THEN RETURN a.inventaire_id; END IF;
  IF a.ignoree_le IS NOT NULL OR a.disparu_le IS NOT NULL OR a.fiche_supprimee_le IS NOT NULL THEN RETURN NULL; END IF;
  IF a.statut_plateforme IS DISTINCT FROM 'en_ligne' THEN RETURN NULL; END IF;
  IF releve_run_hors_liste(a.run_id) THEN RETURN NULL; END IF;
  IF a.platform = 'ebay' AND a.run_id IS NOT NULL AND releve_ebay_run_bloque(a.run_id) THEN RETURN NULL; END IF;
  IF a.platform = 'beebs' AND releve_dette_beebs(p_user) THEN RETURN NULL; END IF;
  IF COALESCE((SELECT value FROM coin_config WHERE key = 'import_auto_ouvert'), 0) <> 1 THEN RETURN NULL; END IF;
  IF NOT p_geste THEN
    SELECT * INTO v_run FROM vinted_sync_runs WHERE id = a.run_id;
    IF NOT releve_est_geste(v_run.declencheur) THEN RETURN NULL; END IF;
  END IF;
  v_imp := rapprocher_importer(p_user, a.id, 'rapprochement');
  IF COALESCE((v_imp ->> 'ok')::boolean, false) THEN RETURN (v_imp ->> 'inventaire_id')::bigint; END IF;
  RETURN NULL;
END;
$function$;
REVOKE ALL ON FUNCTION public.rapprochement_v3_fiche_de(uuid, uuid, boolean) FROM PUBLIC, anon, authenticated;

-- ── 7. LE MARQUEUR « À VÉRIFIER » : un article intact, jamais un article vendu ─
CREATE OR REPLACE FUNCTION public.rapprochement_v3_marquer(p_user uuid, p_fiche bigint, p_motif text, p_candidat bigint, p_annonce uuid, p_platform text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF p_fiche IS NULL THEN RETURN false; END IF;
  IF NOT rapprochement_v3_fiche_intacte(p_fiche) THEN RETURN false; END IF;
  UPDATE inventaire
     SET a_verifier = jsonb_build_object('depuis', now(), 'source', 'rapprochement_v3', 'motif', p_motif,
                                         'candidat', p_candidat, 'annonce_id', p_annonce, 'platform', p_platform)
   WHERE id = p_fiche AND user_id = p_user AND statut = 'stock' AND a_verifier IS NULL;
  RETURN FOUND;
END;
$function$;
REVOKE ALL ON FUNCTION public.rapprochement_v3_marquer(uuid, bigint, text, bigint, uuid, text) FROM PUBLIC, anon, authenticated;

-- ── 8. APPLIQUER LE PLAN DU MOTEUR ──────────────────────────────────────────
-- p_decisions : la liste ordonnée que rend planifier() (moteur.js). Chaque
-- décision est tentée dans sa propre sous-transaction : une erreur en journal,
-- jamais un arrêt. p_mode 'normal' | 'reparation' ; p_geste : la personne a
-- appuyé (ou Nico a décidé la réparation) — autorise les créations.
-- GARDES (la base tranche, quoi que dise le plan) :
--   · annonce et article du compte, annonce vivante et pas ignorée ;
--   · une annonce par plateforme et par article (deux exemplaires sinon) ;
--   · une fusion ne touche qu'un article INTACT, jamais vendu, jamais un
--     article qui porte une vente/un dépôt ; un article modifié → question ;
--   · une paire déjà tranchée par la personne n'est jamais reposée (index) ;
--   · le marqueur « à vérifier » ne se pose que sur un article intact.
CREATE OR REPLACE FUNCTION public.rapprochement_v3_appliquer(p_user uuid, p_decisions jsonb, p_mode text DEFAULT 'normal', p_geste boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
 SET statement_timeout TO '120s'
AS $function$
DECLARE
  d jsonb; v_type text; a annonces_plateforme%ROWTYPE; f inventaire%ROWTYPE; g inventaire%ROWTYPE;
  v_fiche bigint; v_cand bigint; v_fa bigint; v_fb bigint; v_job uuid; v_r jsonb; v_posee boolean; v_motif text;
  v_ids uuid[]; v_id uuid; v_premiere uuid; v_n integer; v_ok boolean;
  n_faits jsonb := '{}'::jsonb; n_sautes jsonb := '{}'::jsonb; v_erreurs jsonb := '[]'::jsonb; v_journal jsonb := '[]'::jsonb;
  t0 timestamptz := clock_timestamp();
  v_par text := 'utilisateur:photo_rapprochement_v3';
BEGIN
  IF p_user IS NULL OR jsonb_typeof(p_decisions) <> 'array' THEN RETURN jsonb_build_object('ok', false, 'reason', 'parametres'); END IF;
  IF NOT pg_try_advisory_xact_lock(hashtext('rapprochement:' || p_user::text)) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'occupe');
  END IF;
  PERFORM set_config('fillsell.rapprochement_moteur', 'on', true);

  FOR d IN SELECT * FROM jsonb_array_elements(p_decisions) LOOP
    v_type := d ->> 'type';
    BEGIN
      -- ── ATTACHER : une annonce sans article rejoint l'article du groupe ──
      IF v_type = 'attacher' THEN
        SELECT * INTO a FROM annonces_plateforme WHERE id = (d ->> 'annonce')::uuid AND user_id = p_user FOR UPDATE;
        v_fiche := (d ->> 'fiche')::bigint;
        SELECT * INTO f FROM inventaire WHERE id = v_fiche AND user_id = p_user AND fusionne_dans IS NULL;
        IF a.id IS NULL OR f.id IS NULL THEN n_sautes := n_sautes || jsonb_build_object('attacher_introuvable', COALESCE((n_sautes ->> 'attacher_introuvable')::int, 0) + 1); CONTINUE; END IF;
        IF a.inventaire_id IS NOT NULL OR a.ignoree_le IS NOT NULL OR a.disparu_le IS NOT NULL THEN
          n_sautes := n_sautes || jsonb_build_object('attacher_deja_decidee', COALESCE((n_sautes ->> 'attacher_deja_decidee')::int, 0) + 1); CONTINUE;
        END IF;
        IF EXISTS (SELECT 1 FROM annonces_plateforme x WHERE x.inventaire_id = v_fiche AND x.platform = a.platform AND x.disparu_le IS NULL AND x.id <> a.id) THEN
          n_sautes := n_sautes || jsonb_build_object('attacher_deux_exemplaires', COALESCE((n_sautes ->> 'attacher_deux_exemplaires')::int, 0) + 1); CONTINUE;
        END IF;
        v_job := rapprochement_attacher(a.id, v_fiche, 'photo_identique', COALESCE(d -> 'preuve', '{}'::jsonb) || jsonb_build_object('regle', 'rapprochement_v3', 'mode', p_mode));
        IF v_job IS NULL THEN n_sautes := n_sautes || jsonb_build_object('attacher_refuse', COALESCE((n_sautes ->> 'attacher_refuse')::int, 0) + 1); CONTINUE; END IF;
        -- (07/10) Article VENDU : le suivi part « vendu, encore en ligne ».
        IF f.statut = 'vendu' THEN
          UPDATE cross_post_jobs
             SET status = 'cancelled',
                 platform_fields = COALESCE(platform_fields, '{}'::jsonb) || jsonb_build_object('pending_removal', true,
                                   'vendu_encore_en_ligne', jsonb_build_object('annonce_id', a.id, 'par', 'rapprochement_v3', 'at', now()))
           WHERE id = v_job AND user_id = p_user AND platform_fields ->> 'source' = 'releve';
        END IF;
        n_faits := n_faits || jsonb_build_object('attacher', COALESCE((n_faits ->> 'attacher')::int, 0) + 1);

      -- ── FUSIONNER (réparation) : l'article importé, intact, rejoint la base ──
      ELSIF v_type = 'fusionner' THEN
        IF p_mode <> 'reparation' THEN n_sautes := n_sautes || jsonb_build_object('fusionner_hors_reparation', COALESCE((n_sautes ->> 'fusionner_hors_reparation')::int, 0) + 1); CONTINUE; END IF;
        SELECT * INTO f FROM inventaire WHERE id = (d ->> 'absorbe')::bigint AND user_id = p_user FOR UPDATE;
        SELECT * INTO g FROM inventaire WHERE id = (d ->> 'garde')::bigint AND user_id = p_user FOR UPDATE;
        IF f.id IS NULL OR g.id IS NULL OR f.fusionne_dans IS NOT NULL OR g.fusionne_dans IS NOT NULL OR f.id = g.id THEN
          n_sautes := n_sautes || jsonb_build_object('fusionner_introuvable', COALESCE((n_sautes ->> 'fusionner_introuvable')::int, 0) + 1); CONTINUE;
        END IF;
        IF NOT (f.origine LIKE 'releve\_%') OR NOT rapprochement_v3_fiche_intacte(f.id) OR g.statut = 'vendu' THEN
          -- Un article que la personne a touché : la question, pas la fusion.
          v_posee := releve_poser_question(p_user, g.id, f.id, 'photo_identique',
                       COALESCE(d -> 'preuve', '{}'::jsonb) || jsonb_build_object('avant_stock', false, 'regle', 'rapprochement_v3', 'article_modifie', true));
          n_sautes := n_sautes || jsonb_build_object('fusionner_article_modifie', COALESCE((n_sautes ->> 'fusionner_article_modifie')::int, 0) + 1,
                                                       'fusionner_question_posee', COALESCE((n_sautes ->> 'fusionner_question_posee')::int, 0) + CASE WHEN v_posee THEN 1 ELSE 0 END);
          CONTINUE;
        END IF;
        -- jamais deux annonces vivantes de la même plateforme sur un article
        IF EXISTS (SELECT 1 FROM annonces_plateforme x JOIN annonces_plateforme y ON y.platform = x.platform
                    WHERE x.inventaire_id = f.id AND y.inventaire_id = g.id AND x.disparu_le IS NULL AND y.disparu_le IS NULL) THEN
          n_sautes := n_sautes || jsonb_build_object('fusionner_deux_exemplaires', COALESCE((n_sautes ->> 'fusionner_deux_exemplaires')::int, 0) + 1); CONTINUE;
        END IF;
        v_r := inventaire_fusionner_pour(p_user, g.id, f.id, v_par);
        IF NOT COALESCE((v_r ->> 'ok')::boolean, false) THEN
          n_sautes := n_sautes || jsonb_build_object('fusionner_refuse', COALESCE((n_sautes ->> 'fusionner_refuse')::int, 0) + 1); CONTINUE;
        END IF;
        UPDATE inventaire_doublons SET statut = 'fusionnee', decide_le = now(), decide_par = 'rapprochement_v3', fusion_id = (v_r ->> 'fusion_id')::uuid
         WHERE user_id = p_user AND statut = 'proposee' AND least(garde, absorbe) = least(g.id, f.id) AND greatest(garde, absorbe) = greatest(g.id, f.id);
        UPDATE inventaire_doublons SET statut = 'caduque', decide_le = now(), decide_par = 'rapprochement_v3'
         WHERE user_id = p_user AND statut = 'proposee' AND (garde = f.id OR absorbe = f.id) AND motif IS DISTINCT FROM 'copie_non_prouvee';
        INSERT INTO rapprochements (user_id, annonce_id, inventaire_id, decision, par, score, detail)
        VALUES (p_user, NULLIF(d ->> 'annonce', '')::uuid, g.id, 'attache', 'auto', 1,
                COALESCE(d -> 'preuve', '{}'::jsonb) || jsonb_build_object('motif', 'photo_identique', 'regle', 'rapprochement_v3', 'fusion', v_r ->> 'fusion_id', 'absorbe', f.id));
        n_faits := n_faits || jsonb_build_object('fusionner', COALESCE((n_faits ->> 'fusionner')::int, 0) + 1);

      -- ── GROUPE sans base : un article pour la première, les autres s'y rattachent ──
      ELSIF v_type = 'groupe' THEN
        SELECT COALESCE(array_agg((x)::uuid), ARRAY[]::uuid[]) INTO v_ids FROM jsonb_array_elements_text(d -> 'annonces') x;
        v_fiche := NULL;
        -- un article déjà là (import d'avant) sert de pivot
        SELECT a2.inventaire_id INTO v_fiche FROM annonces_plateforme a2 JOIN inventaire i2 ON i2.id = a2.inventaire_id
         WHERE a2.id = ANY (v_ids) AND a2.user_id = p_user AND i2.fusionne_dans IS NULL ORDER BY i2.created_at LIMIT 1;
        IF v_fiche IS NULL THEN
          FOREACH v_id IN ARRAY v_ids LOOP
            v_fiche := rapprochement_v3_fiche_de(p_user, v_id, p_geste);
            EXIT WHEN v_fiche IS NOT NULL;
          END LOOP;
        END IF;
        IF v_fiche IS NULL THEN n_sautes := n_sautes || jsonb_build_object('groupe_sans_article', COALESCE((n_sautes ->> 'groupe_sans_article')::int, 0) + 1); CONTINUE; END IF;
        n_faits := n_faits || jsonb_build_object('groupe', COALESCE((n_faits ->> 'groupe')::int, 0) + 1);
        FOREACH v_id IN ARRAY v_ids LOOP
          SELECT * INTO a FROM annonces_plateforme WHERE id = v_id AND user_id = p_user;
          IF a.id IS NULL OR a.inventaire_id = v_fiche THEN CONTINUE; END IF;
          IF a.inventaire_id IS NULL THEN
            IF a.ignoree_le IS NULL AND a.disparu_le IS NULL
               AND NOT EXISTS (SELECT 1 FROM annonces_plateforme x WHERE x.inventaire_id = v_fiche AND x.platform = a.platform AND x.disparu_le IS NULL) THEN
              v_job := rapprochement_attacher(a.id, v_fiche, 'photo_identique', COALESCE(d -> 'preuve', '{}'::jsonb) || jsonb_build_object('regle', 'rapprochement_v3', 'groupe_creation', true, 'mode', p_mode));
              IF v_job IS NOT NULL THEN n_faits := n_faits || jsonb_build_object('attacher', COALESCE((n_faits ->> 'attacher')::int, 0) + 1); END IF;
            END IF;
          ELSIF p_mode = 'reparation' THEN
            SELECT * INTO f FROM inventaire WHERE id = a.inventaire_id AND user_id = p_user AND fusionne_dans IS NULL;
            IF f.id IS NOT NULL AND f.origine LIKE 'releve\_%' AND rapprochement_v3_fiche_intacte(f.id)
               AND NOT EXISTS (SELECT 1 FROM annonces_plateforme x JOIN annonces_plateforme y ON y.platform = x.platform
                                WHERE x.inventaire_id = f.id AND y.inventaire_id = v_fiche AND x.disparu_le IS NULL AND y.disparu_le IS NULL) THEN
              v_r := inventaire_fusionner_pour(p_user, v_fiche, f.id, v_par);
              IF COALESCE((v_r ->> 'ok')::boolean, false) THEN
                UPDATE inventaire_doublons SET statut = 'caduque', decide_le = now(), decide_par = 'rapprochement_v3'
                 WHERE user_id = p_user AND statut = 'proposee' AND (garde = f.id OR absorbe = f.id) AND motif IS DISTINCT FROM 'copie_non_prouvee';
                n_faits := n_faits || jsonb_build_object('fusionner', COALESCE((n_faits ->> 'fusionner')::int, 0) + 1);
              END IF;
            END IF;
          END IF;
        END LOOP;

      -- ── À VÉRIFIER : un VRAI article, hors du stock, avec sa question ──────
      ELSIF v_type = 'a_verifier' THEN
        SELECT COALESCE(array_agg((x)::uuid), ARRAY[]::uuid[]) INTO v_ids FROM jsonb_array_elements_text(d -> 'annonces') x;
        v_fiche := NULL; v_premiere := NULL;
        SELECT a2.inventaire_id INTO v_fiche FROM annonces_plateforme a2 JOIN inventaire i2 ON i2.id = a2.inventaire_id
         WHERE a2.id = ANY (v_ids) AND a2.user_id = p_user AND i2.fusionne_dans IS NULL ORDER BY i2.created_at LIMIT 1;
        IF v_fiche IS NULL THEN
          FOREACH v_id IN ARRAY v_ids LOOP
            v_fiche := rapprochement_v3_fiche_de(p_user, v_id, p_geste);
            IF v_fiche IS NOT NULL THEN v_premiere := v_id; EXIT; END IF;
          END LOOP;
        END IF;
        IF v_fiche IS NULL THEN n_sautes := n_sautes || jsonb_build_object('a_verifier_sans_article', COALESCE((n_sautes ->> 'a_verifier_sans_article')::int, 0) + 1); CONTINUE; END IF;
        -- les autres annonces du groupe rejoignent l'article
        FOREACH v_id IN ARRAY v_ids LOOP
          SELECT * INTO a FROM annonces_plateforme WHERE id = v_id AND user_id = p_user;
          IF a.id IS NULL OR a.inventaire_id IS NOT NULL OR a.ignoree_le IS NOT NULL OR a.disparu_le IS NOT NULL THEN CONTINUE; END IF;
          IF NOT EXISTS (SELECT 1 FROM annonces_plateforme x WHERE x.inventaire_id = v_fiche AND x.platform = a.platform AND x.disparu_le IS NULL) THEN
            PERFORM rapprochement_attacher(a.id, v_fiche, 'photo_identique', jsonb_build_object('regle', 'rapprochement_v3', 'groupe_creation', true, 'mode', p_mode));
          END IF;
        END LOOP;
        -- le candidat : un article, ou l'article d'une annonce (créé au besoin)
        v_cand := NULLIF(d #>> '{candidat,fiche}', '')::bigint;
        IF v_cand IS NULL AND NULLIF(d #>> '{candidat,annonce}', '') IS NOT NULL THEN
          v_cand := rapprochement_v3_fiche_de(p_user, (d #>> '{candidat,annonce}')::uuid, p_geste);
        END IF;
        -- la chaîne des fusions : toujours l'article vivant
        WHILE v_cand IS NOT NULL AND (SELECT fusionne_dans FROM inventaire WHERE id = v_cand) IS NOT NULL LOOP
          v_cand := (SELECT fusionne_dans FROM inventaire WHERE id = v_cand);
        END LOOP;
        SELECT * INTO a FROM annonces_plateforme WHERE id = COALESCE(v_premiere, v_ids[1]) AND user_id = p_user;
        v_motif := COALESCE(NULLIF(d ->> 'motif', ''), 'rapprochement');
        v_posee := false;
        IF v_cand IS NOT NULL AND v_cand <> v_fiche THEN
          v_posee := releve_poser_question(p_user, v_cand, v_fiche, v_motif,
                       COALESCE(d -> 'preuves', '{}'::jsonb) || jsonb_build_object('avant_stock', true, 'regle', 'rapprochement_v3', 'annonce_id', a.id,
                                                                                   'platform', a.platform, 'listing_id', a.listing_id, 'url', a.url, 'prix', a.prix, 'titre_annonce', a.titre));
          -- déjà posée (par le moteur du 07/10, le rattrapage) : elle vaut
          IF NOT v_posee AND EXISTS (SELECT 1 FROM inventaire_doublons q WHERE q.user_id = p_user AND q.statut = 'proposee'
                                       AND least(q.garde, q.absorbe) = least(v_cand, v_fiche) AND greatest(q.garde, q.absorbe) = greatest(v_cand, v_fiche)) THEN
            v_posee := true;
          END IF;
        END IF;
        IF v_posee THEN
          PERFORM rapprochement_v3_marquer(p_user, v_fiche, v_motif, v_cand, a.id, a.platform);
          n_faits := n_faits || jsonb_build_object('a_verifier', COALESCE((n_faits ->> 'a_verifier')::int, 0) + 1);
        ELSE
          -- paire déjà tranchée (« non ») ou candidat impossible : un autre article, au stock
          n_faits := n_faits || jsonb_build_object('creer', COALESCE((n_faits ->> 'creer')::int, 0) + 1);
          n_sautes := n_sautes || jsonb_build_object('a_verifier_paire_tranchee', COALESCE((n_sautes ->> 'a_verifier_paire_tranchee')::int, 0) + 1);
        END IF;

      -- ── ANNONCE EN DOUBLE ? (même plateforme, même photo, même titre) ─────
      ELSIF v_type = 'annonce_en_double' THEN
        v_fa := NULLIF(d #>> '{a,fiche}', '')::bigint;
        IF v_fa IS NULL AND NULLIF(d #>> '{a,annonce}', '') IS NOT NULL THEN v_fa := rapprochement_v3_fiche_de(p_user, (d #>> '{a,annonce}')::uuid, p_geste); END IF;
        v_fb := NULLIF(d #>> '{b,fiche}', '')::bigint;
        IF v_fb IS NULL AND NULLIF(d #>> '{b,annonce}', '') IS NOT NULL THEN v_fb := rapprochement_v3_fiche_de(p_user, (d #>> '{b,annonce}')::uuid, p_geste); END IF;
        IF v_fa IS NULL OR v_fb IS NULL OR v_fa = v_fb THEN n_sautes := n_sautes || jsonb_build_object('double_sans_article', COALESCE((n_sautes ->> 'double_sans_article')::int, 0) + 1); CONTINUE; END IF;
        -- garde = le plus ancien ; jamais un article vendu
        SELECT * INTO f FROM inventaire WHERE id = v_fa; SELECT * INTO g FROM inventaire WHERE id = v_fb;
        IF f.statut = 'vendu' OR g.statut = 'vendu' THEN n_sautes := n_sautes || jsonb_build_object('double_vendu', COALESCE((n_sautes ->> 'double_vendu')::int, 0) + 1); CONTINUE; END IF;
        IF g.created_at < f.created_at THEN v_fa := g.id; v_fb := f.id; END IF;
        v_posee := releve_poser_question(p_user, v_fa, v_fb, 'annonce_en_double',
                     COALESCE(d -> 'preuves', '{}'::jsonb) || jsonb_build_object('avant_stock', true, 'regle', 'rapprochement_v3', 'platform', d ->> 'platform'));
        IF v_posee THEN
          PERFORM rapprochement_v3_marquer(p_user, v_fa, 'annonce_en_double', v_fb, NULLIF(d #>> '{a,annonce}', '')::uuid, d ->> 'platform');
          PERFORM rapprochement_v3_marquer(p_user, v_fb, 'annonce_en_double', v_fa, NULLIF(d #>> '{b,annonce}', '')::uuid, d ->> 'platform');
          n_faits := n_faits || jsonb_build_object('annonce_en_double', COALESCE((n_faits ->> 'annonce_en_double')::int, 0) + 1);
        ELSE
          n_sautes := n_sautes || jsonb_build_object('double_paire_tranchee', COALESCE((n_sautes ->> 'double_paire_tranchee')::int, 0) + 1);
        END IF;

      -- ── CRÉER : aucun candidat, l'article entre au stock ─────────────────
      ELSIF v_type = 'creer' THEN
        v_fiche := rapprochement_v3_fiche_de(p_user, (d ->> 'annonce')::uuid, p_geste);
        IF v_fiche IS NULL THEN n_sautes := n_sautes || jsonb_build_object('creer_refuse', COALESCE((n_sautes ->> 'creer_refuse')::int, 0) + 1);
        ELSE n_faits := n_faits || jsonb_build_object('creer', COALESCE((n_faits ->> 'creer')::int, 0) + 1); END IF;

      -- ── ENTRER AU STOCK (réparation) : un marqueur automatique sans raison ─
      ELSIF v_type = 'entrer_stock' THEN
        IF p_mode <> 'reparation' THEN CONTINUE; END IF;
        UPDATE inventaire SET a_verifier = NULL
         WHERE id = (d ->> 'fiche')::bigint AND user_id = p_user AND a_verifier IS NOT NULL
           AND COALESCE(a_verifier ->> 'source', '') IN ('moteur', 'rattrapage_0710', 'rapprochement_v3');
        IF FOUND THEN
          UPDATE inventaire_doublons SET statut = 'caduque', decide_le = now(), decide_par = 'rapprochement_v3'
           WHERE user_id = p_user AND statut = 'proposee' AND decide_par IS NULL AND COALESCE(source, '') = 'releve'
             AND (garde = (d ->> 'fiche')::bigint OR absorbe = (d ->> 'fiche')::bigint) AND motif IS DISTINCT FROM 'copie_non_prouvee';
          n_faits := n_faits || jsonb_build_object('entrer_stock', COALESCE((n_faits ->> 'entrer_stock')::int, 0) + 1);
        END IF;

      -- ── QUESTION CADUQUE (réparation) : une question automatique que v3 ne confirme pas ─
      ELSIF v_type = 'question_caduque' THEN
        IF p_mode <> 'reparation' THEN CONTINUE; END IF;
        UPDATE inventaire_doublons SET statut = 'caduque', decide_le = now(), decide_par = 'rapprochement_v3'
         WHERE id = (d ->> 'id')::uuid AND user_id = p_user AND statut = 'proposee' AND decide_par IS NULL
           AND COALESCE(source, '') = 'releve' AND motif IS DISTINCT FROM 'copie_non_prouvee';
        IF FOUND THEN n_faits := n_faits || jsonb_build_object('question_caduque', COALESCE((n_faits ->> 'question_caduque')::int, 0) + 1); END IF;

      -- ── IGNORER : un relevé non probant (hors liste, eBay hors compte) ──
      ELSIF v_type = 'ignorer' THEN
        UPDATE annonces_plateforme SET ignoree_le = now(), updated_at = now()
         WHERE id = (d ->> 'annonce')::uuid AND user_id = p_user AND inventaire_id IS NULL AND ignoree_le IS NULL;
        IF FOUND THEN
          INSERT INTO rapprochements (user_id, annonce_id, decision, par, score, detail)
          VALUES (p_user, (d ->> 'annonce')::uuid, 'ignore', 'auto', 0, jsonb_build_object('motif', COALESCE(d ->> 'motif', 'releve_non_probant'), 'regle', 'rapprochement_v3'));
          n_faits := n_faits || jsonb_build_object('ignorer', COALESCE((n_faits ->> 'ignorer')::int, 0) + 1);
        END IF;
      ELSE
        n_sautes := n_sautes || jsonb_build_object('type_inconnu', COALESCE((n_sautes ->> 'type_inconnu')::int, 0) + 1);
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_erreurs := v_erreurs || jsonb_build_array(jsonb_build_object('type', v_type, 'decision', d - 'preuves' - 'preuve', 'erreur', left(SQLERRM, 300)));
    END;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'faits', n_faits, 'sautes', n_sautes, 'erreurs', v_erreurs,
                            'ms', round(extract(epoch FROM clock_timestamp() - t0) * 1000));
END;
$function$;
REVOKE ALL ON FUNCTION public.rapprochement_v3_appliquer(uuid, jsonb, text, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rapprochement_v3_appliquer(uuid, jsonb, text, boolean) TO service_role;

-- ── 9. « SYNCHRONISER » PENDANT LA CADENCE N'EST PLUS UN REFUS ──────────────
-- Définition EN PROD du 08/10 (pg_get_functiondef), deux changements :
--   · cadence (relevé fini il y a < 15 min) → ok:true, reason 'recent', et le
--     rapprochement du compte est relancé (une relance reprend les orphelines
--     et les propositions figées sans toucher la plateforme) ;
--   · eBay relié par l'API → la fonction ebay-releve-api est réveillée tout de
--     suite (pg_net), au lieu d'attendre le passage du cron (10 min).
CREATE OR REPLACE FUNCTION public.demander_sync_plateforme(p_platform text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_pf   text := lower(COALESCE(NULLIF(trim(p_platform), ''), ''));
  v_ext  timestamptz;
  v_ver  text;
  v_min  integer;
  v_code integer;
  v_actif record;
  v_fini timestamptz;
  v_id   uuid;
  v_api  boolean;
BEGIN
  IF v_user IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'unauthorized'); END IF;
  IF v_pf NOT IN ('leboncoin', 'beebs', 'ebay', 'opla') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_platform');
  END IF;
  IF NOT sync_multi_ouverte_pour(v_user) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'non_expose');
  END IF;
  -- (27/09) « Je ne vends pas sur X » : aucun relevé, même demandé à la main.
  IF plateforme_ecartee_pour(v_user, v_pf) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'plateforme_ecartee');
  END IF;
  -- (04/10) eBay relié officiellement : le serveur lit le compte par l'API.
  v_api := v_pf = 'ebay' AND compte_ebay_api(v_user) IS NOT NULL;
  IF NOT v_api THEN
    SELECT extension_last_seen_at, extension_version INTO v_ext, v_ver FROM profiles WHERE id = v_user;
    IF v_ext IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'extension_jamais_vue');
    END IF;
    SELECT value INTO v_min FROM coin_config WHERE key = 'sync_multi_extension_min';
    v_min := COALESCE(v_min, 642);
    v_code := CASE WHEN v_ver ~ '^\d+\.\d+\.\d+' THEN
        (split_part(v_ver, '.', 1))::integer * 10000 + (split_part(v_ver, '.', 2))::integer * 100
        + (regexp_replace(split_part(v_ver, '.', 3), '\D.*$', ''))::integer ELSE 0 END;
    IF v_min > 0 AND v_code < v_min THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'extension_trop_ancienne', 'version', v_ver, 'minimum', v_min);
    END IF;
  END IF;
  PERFORM purger_sync_queue_perimee(v_user);
  SELECT id, status INTO v_actif FROM vinted_sync_runs
  WHERE user_id = v_user AND kind = 'annonces' AND platform = v_pf AND status IN ('queued', 'running')
  ORDER BY COALESCE(queued_at, started_at) DESC LIMIT 1;
  IF v_actif.id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'reason', CASE WHEN v_actif.status = 'running' THEN 'sync_en_cours' ELSE 'deja_en_attente' END, 'run_id', v_actif.id);
  END IF;
  SELECT max(finished_at) INTO v_fini FROM vinted_sync_runs
  WHERE user_id = v_user AND kind = 'annonces' AND platform = v_pf AND status = 'done';
  IF v_fini IS NOT NULL AND v_fini > now() - interval '15 minutes' THEN
    -- (08/10) Pas un refus : la plateforme vient d'être lue, le rangement repart.
    PERFORM rapprochement_demander(v_user, 'recent:' || v_pf);
    PERFORM rapprochement_relancer(v_user);
    RETURN jsonb_build_object('ok', true, 'reason', 'recent', 'dernier', v_fini);
  END IF;
  INSERT INTO vinted_sync_runs (user_id, kind, platform, status, declencheur, queued_at)
  VALUES (v_user, 'annonces', v_pf, 'queued', 'app', now())
  RETURNING id INTO v_id;
  IF v_api THEN
    -- (08/10) Le relevé par l'API part tout de suite, jamais par l'extension.
    BEGIN
      PERFORM net.http_post(
        url := 'https://tojihnuawsoohlolangc.supabase.co/functions/v1/ebay-releve-api',
        body := jsonb_build_object('quotidien', false, 'user_id', v_user),
        headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', public.cron_secret()),
        timeout_milliseconds := 120000);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'demander_sync_plateforme(ebay api, %) : %', v_user, SQLERRM;
    END;
  END IF;
  RETURN jsonb_build_object('ok', true, 'reason', 'queued', 'run_id', v_id, 'par_api', v_api);
END;
$function$;

-- ── 10. L'AVANCEMENT : une proposition figée compte comme « en attente » ────
-- Définition EN PROD du 08/10, un filtre retiré (a.proposition IS NULL) : le
-- moteur v3 tranche aussi les annonces qui portaient une vieille proposition.
CREATE OR REPLACE FUNCTION public.synchro_avancement()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_runs jsonb := '[]'::jsonb; r record; v jsonb;
  v_restant_releves numeric := 0; v_restant_vinted numeric := 0; v_restant_rap numeric := 0;
  v_total numeric := 0; v_fait numeric := 0; v_volume numeric; v_attendu numeric; v_ecoule numeric;
  c rapprochement_comptes%ROWTYPE; v_en_attente integer := 0; v_nouvelles integer := 0; v_a_verifier integer := 0;
  v_actif boolean := false; v_vague timestamptz;
BEGIN
  IF v_user IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'unauthorized'); END IF;
  SELECT * INTO c FROM rapprochement_comptes WHERE user_id = v_user;
  v_vague := now() - interval '2 hours';
  FOR r IN
    SELECT DISTINCT ON (CASE WHEN s.kind = 'dressing' THEN 'vinted' ELSE s.platform END)
           CASE WHEN s.kind = 'dressing' THEN 'vinted' ELSE s.platform END pf, s.kind, s.status, s.items_vus, s.total_entries,
           s.queued_at, s.started_at, s.finished_at, s.progres_le
      FROM vinted_sync_runs s
     WHERE s.user_id = v_user AND s.kind IN ('annonces', 'dressing')
       AND COALESCE(s.queued_at, s.started_at) > v_vague AND releve_est_geste(s.declencheur)
     ORDER BY CASE WHEN s.kind = 'dressing' THEN 'vinted' ELSE s.platform END, COALESCE(s.queued_at, s.started_at) DESC
  LOOP
    SELECT to_jsonb(x) INTO v FROM synchro_vitesses x WHERE x.platform = r.pf;
    v_volume := COALESCE(r.total_entries, (SELECT s2.items_vus FROM vinted_sync_runs s2
                                             WHERE s2.user_id = v_user AND s2.status IN ('done', 'incomplete')
                                               AND (CASE WHEN s2.kind = 'dressing' THEN 'vinted' ELSE s2.platform END) = r.pf
                                             ORDER BY s2.finished_at DESC NULLS LAST LIMIT 1), 100);
    v_attendu := COALESCE((v ->> 's_base')::numeric, 20) + COALESCE((v ->> 's_par_annonce')::numeric, 0.5) * v_volume;
    v_ecoule := CASE WHEN r.status = 'running' THEN extract(epoch FROM now() - COALESCE(r.started_at, now())) ELSE 0 END;
    v_total := v_total + v_attendu;
    IF r.status = 'queued' THEN
      IF r.pf = 'vinted' THEN v_restant_vinted := greatest(v_restant_vinted, v_attendu); ELSE v_restant_releves := v_restant_releves + v_attendu; END IF;
      v_actif := true;
    ELSIF r.status = 'running' THEN
      IF r.pf = 'vinted' THEN v_restant_vinted := greatest(v_restant_vinted, greatest(5, v_attendu - v_ecoule));
      ELSE v_restant_releves := v_restant_releves + greatest(5, v_attendu - v_ecoule); END IF;
      v_fait := v_fait + least(v_attendu * 0.95, v_ecoule);
      v_actif := true;
    ELSE
      v_fait := v_fait + v_attendu;
    END IF;
    v_runs := v_runs || jsonb_build_array(jsonb_build_object(
      'platform', r.pf, 'status', r.status, 'lues', r.items_vus, 'annoncees', r.total_entries, 'volume', v_volume,
      'debut', r.started_at, 'fin', r.finished_at, 'attendu_s', round(v_attendu)));
  END LOOP;

  IF c.user_id IS NOT NULL AND c.etat <> 'termine' THEN
    SELECT count(*) INTO v_en_attente FROM annonces_plateforme a
     WHERE a.user_id = v_user AND a.inventaire_id IS NULL AND a.ignoree_le IS NULL AND a.disparu_le IS NULL
       AND a.platform IN ('leboncoin', 'beebs', 'ebay', 'opla');
    v_nouvelles := 0;
    -- v3 : les photos (≈ 25/s en parallèle) puis une passe de quelques secondes
    v_restant_rap := 8 + COALESCE(c.photos_manquantes, 0) / 25.0
                   + v_en_attente * COALESCE(c.ms_decision::numeric / NULLIF(c.traitees, 0), 20) / 1000.0;
    v_actif := true;
  END IF;
  SELECT (SELECT count(*) FROM inventaire i
           WHERE i.user_id = v_user AND i.a_verifier IS NOT NULL AND i.statut = 'stock' AND i.fusionne_dans IS NULL)
       + (SELECT count(*) FROM annonces_plateforme a
           WHERE a.user_id = v_user AND a.inventaire_id IS NULL AND a.ignoree_le IS NULL AND a.disparu_le IS NULL
             AND a.proposition IS NOT NULL)
    INTO v_a_verifier;

  RETURN jsonb_build_object(
    'ok', true, 'actif', v_actif, 'releves', v_runs,
    'rapprochement', CASE WHEN c.user_id IS NULL THEN NULL ELSE jsonb_build_object(
        'etat', c.etat, 'demande_le', c.demande_le, 'debut_le', c.debut_le, 'fin_le', c.fin_le,
        'en_attente', v_en_attente, 'nouvelles', v_nouvelles, 'traitees', c.traitees,
        'photos_manquantes', c.photos_manquantes, 'bilan', c.bilan) END,
    'a_verifier', v_a_verifier,
    'secondes_restantes', round(greatest(v_restant_vinted, v_restant_releves) + v_restant_rap),
    'avancement', CASE WHEN v_total + v_restant_rap <= 0 THEN 1
                       ELSE round(least(1, v_fait / (v_fait + greatest(v_restant_vinted, v_restant_releves) + v_restant_rap))::numeric, 3) END);
END;
$function$;

-- ── 11. LA FIN D'UN RELEVÉ RÉVEILLE LE MOTEUR, proposition figée comprise ───
CREATE OR REPLACE FUNCTION public.rapprochement_fin_run()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  BEGIN
    IF EXISTS (SELECT 1 FROM rapprochement_comptes c WHERE c.user_id = NEW.user_id AND c.etat <> 'termine')
       OR EXISTS (SELECT 1 FROM annonces_plateforme a
                   WHERE a.user_id = NEW.user_id AND a.inventaire_id IS NULL AND a.ignoree_le IS NULL AND a.disparu_le IS NULL
                     AND a.platform IN ('leboncoin', 'beebs', 'ebay', 'opla')) THEN
      PERFORM rapprochement_demander(NEW.user_id, 'fin_run:' || COALESCE(NEW.platform, NEW.kind));
      PERFORM rapprochement_relancer(NEW.user_id);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'rapprochement_fin_run (%) : %', NEW.id, SQLERRM;
  END;
  RETURN NULL;
END;
$function$;

-- ── 12. « SYNCHRONISER » PENDANT LA CADENCE VINTED : le rangement repart ─────
-- Appelée par l'app (JWT) quand Vinted vient d'être relu (< 15 min) : pas un
-- refus, le compte est remis en file et le moteur relancé — une relance ne
-- rejuge rien, elle reprend ce qui n'a pas encore d'article.
CREATE OR REPLACE FUNCTION public.synchro_relancer_rangement()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_user uuid := auth.uid(); v_n integer;
BEGIN
  IF v_user IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'unauthorized'); END IF;
  SELECT count(*) INTO v_n FROM annonces_plateforme a
   WHERE a.user_id = v_user AND a.inventaire_id IS NULL AND a.ignoree_le IS NULL AND a.disparu_le IS NULL
     AND a.platform IN ('leboncoin', 'beebs', 'ebay', 'opla');
  PERFORM rapprochement_demander(v_user, 'recent:vinted');
  PERFORM rapprochement_relancer(v_user);
  RETURN jsonb_build_object('ok', true, 'en_attente', v_n);
END;
$function$;
GRANT EXECUTE ON FUNCTION public.synchro_relancer_rangement() TO authenticated;

COMMIT;
