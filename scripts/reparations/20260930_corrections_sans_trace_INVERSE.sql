-- ═══════════════════════════════════════════════════════════════════════════
-- INVERSES DES CORRECTIONS SANS TRACE DU 30/09 — VERROUILLÉS
-- ═══════════════════════════════════════════════════════════════════════════
-- Relevé et constat : 20260930_corrections_sans_trace.sql.
-- ⛔ Rien ne part sans décision de Nico. Chaque bloc ne fait RIEN tant que la
-- session ne le nomme pas :
--     SELECT set_config('fillsell.inverse_3009', '<nom du bloc>[,<autre bloc>…]', false);
-- Essai sur quelques lignes seulement :
--     SELECT set_config('fillsell.inverse_3009_limite', '3', false);
-- Chaque bloc commence par copier ce qu'il va changer dans une table de
-- sauvegarde (RLS active, fermée à anon/authenticated), ne touche que les
-- lignes qui portent ENCORE la marque de la correction (une ligne re-décidée
-- depuis par la personne n'est jamais reprise), puis compte ce qu'il a fait.
--
-- ORDRE OBLIGATOIRE :
--   rattachements  AVANT  numeros_photo   (sinon des annonces restent
--                                          accrochées à un numéro retiré) ;
--   fusions        AVANT  questions_4_5   (ces questions n'ont de sens que si
--                                          les deux fiches sont de nouveau
--                                          séparées) ;
--   questions_6_7 : indépendant.
-- Les fusions se défont par lots (limite 100 conseillée), latence relue entre
-- deux lots : chaque défusion touche 6 à 8 tables.
--
-- ⚠️ JAMAIS REJOUÉS. Le 01/10 à 00:50, le contrôle automatique de la session
-- a refusé le rejeu annulé (BEGIN … RAISE EXCEPTION, rien gardé) parce qu'il
-- écrit dans la base de prod. Avant tout usage : rejeu annulé avec
-- fillsell.inverse_3009_limite = 3, lecture des comptes, puis seulement le vrai.
-- Les noms de colonnes et les contraintes (statuts, décisions, sources) ont
-- été relus en prod le 01/10 ; la logique, elle, n'a pas tourné.
-- ═══════════════════════════════════════════════════════════════════════════

SET statement_timeout = '60s';
SET lock_timeout = '2s';

-- ── rattachements : défait la correction 2 (94 annonces) ───────────────────
-- L'annonce revient à son état d'avant (detail.avant : job, source, date
-- d'écartement), sans fiche ; une ligne rapprochements « ignore » le dit.
DO $rattachements$
DECLARE
  v_lim integer := NULLIF(current_setting('fillsell.inverse_3009_limite', true), '')::integer;
  r record; n integer := 0;
BEGIN
  IF NOT ('rattachements' = ANY (string_to_array(COALESCE(current_setting('fillsell.inverse_3009', true), ''), ','))) THEN RETURN; END IF;
  CREATE TABLE IF NOT EXISTS public._backup_inverse_3009_annonces (
    annonce_id uuid PRIMARY KEY, ligne jsonb NOT NULL, sauvegarde_le timestamptz NOT NULL DEFAULT now());
  ALTER TABLE public._backup_inverse_3009_annonces ENABLE ROW LEVEL SECURITY;
  REVOKE ALL ON public._backup_inverse_3009_annonces FROM public, anon, authenticated;
  FOR r IN
    SELECT a.*, rp.detail AS rdetail
      FROM public.rapprochements rp
      JOIN public.annonces_plateforme a ON a.id = rp.annonce_id
     WHERE rp.detail ->> 'motif' = 'liberation_retenue_3009'
       AND a.job_id = (rp.detail ->> 'job_id')::uuid
       AND a.source_rapprochement = 'job'
     ORDER BY a.id
     LIMIT v_lim
  LOOP
    INSERT INTO public._backup_inverse_3009_annonces (annonce_id, ligne)
      SELECT a.id, to_jsonb(a) FROM public.annonces_plateforme a WHERE a.id = r.id
      ON CONFLICT (annonce_id) DO NOTHING;
    UPDATE public.annonces_plateforme
       SET inventaire_id = NULL,
           job_id = NULLIF(r.rdetail -> 'avant' ->> 'job_id', '')::uuid,
           source_rapprochement = NULLIF(r.rdetail -> 'avant' ->> 'source_rapprochement', ''),
           ignoree_le = NULLIF(r.rdetail -> 'avant' ->> 'ignoree_le', '')::timestamptz,
           updated_at = now()
     WHERE id = r.id;
    INSERT INTO public.rapprochements (user_id, annonce_id, inventaire_id, decision, par, score, detail)
    VALUES (r.user_id, r.id, NULL, 'ignore', 'auto', NULL,
            jsonb_build_object('motif', 'inverse_liberation_retenue_3009', 'job_id', r.job_id));
    n := n + 1;
  END LOOP;
  RAISE NOTICE 'rattachements défaits : %', n;
END
$rattachements$;

-- ── numeros_photo : défait la correction 1 (185 dépôts Beebs) ──────────────
-- Numéro, lien, lien en attente et identifiant non prouvé reviennent à la
-- sauvegarde faite dans le job (platform_fields.avant_numero_photo_3009).
DO $numeros$
DECLARE
  v_lim integer := NULLIF(current_setting('fillsell.inverse_3009_limite', true), '')::integer;
  n integer;
BEGIN
  IF NOT ('numeros_photo' = ANY (string_to_array(COALESCE(current_setting('fillsell.inverse_3009', true), ''), ','))) THEN RETURN; END IF;
  IF EXISTS (SELECT 1 FROM public.rapprochements rp JOIN public.annonces_plateforme a ON a.id = rp.annonce_id
              WHERE rp.detail ->> 'motif' = 'liberation_retenue_3009'
                AND a.job_id = (rp.detail ->> 'job_id')::uuid AND a.source_rapprochement = 'job') THEN
    RAISE EXCEPTION 'défaire d''abord le bloc « rattachements »';
  END IF;
  CREATE TABLE IF NOT EXISTS public._backup_inverse_3009_jobs (
    job_id uuid PRIMARY KEY, ligne jsonb NOT NULL, sauvegarde_le timestamptz NOT NULL DEFAULT now());
  ALTER TABLE public._backup_inverse_3009_jobs ENABLE ROW LEVEL SECURITY;
  REVOKE ALL ON public._backup_inverse_3009_jobs FROM public, anon, authenticated;
  CREATE TEMP TABLE _inv_jobs ON COMMIT DROP AS
    SELECT j.id FROM public.cross_post_jobs j
     WHERE j.platform_fields ? 'numero_par_photo' AND j.platform_fields ? 'avant_numero_photo_3009'
       AND j.platform_listing_id = j.platform_fields -> 'numero_par_photo' ->> 'numero'
     ORDER BY j.id LIMIT v_lim;
  INSERT INTO public._backup_inverse_3009_jobs (job_id, ligne)
    SELECT j.id, to_jsonb(j) FROM public.cross_post_jobs j JOIN _inv_jobs USING (id)
    ON CONFLICT (job_id) DO NOTHING;
  UPDATE public.cross_post_jobs j
     SET platform_listing_id = j.platform_fields -> 'avant_numero_photo_3009' ->> 'platform_listing_id',
         listing_url = j.platform_fields -> 'avant_numero_photo_3009' ->> 'listing_url',
         platform_fields = (j.platform_fields - 'numero_par_photo' - 'avant_numero_photo_3009')
           || jsonb_strip_nulls(jsonb_build_object(
                'lien_en_attente', j.platform_fields -> 'avant_numero_photo_3009' -> 'lien_en_attente',
                'identifiant_beebs_non_prouve', j.platform_fields -> 'avant_numero_photo_3009' -> 'identifiant_beebs_non_prouve'))
    FROM _inv_jobs c WHERE j.id = c.id;
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE 'dépôts dénumérotés : %', n;
END
$numeros$;

-- ── fusions : défait la correction 3 (1 090 fusions) ───────────────────────
-- Par la fonction du bouton « Défaire » (inventaire_defusionner_pour), la plus
-- récente d'abord. Les 581 questions qui avaient mené à une fusion
-- redeviennent ouvertes (« proposee »), comme avant le 30/09.
DO $fusions$
DECLARE
  v_lim integer := NULLIF(current_setting('fillsell.inverse_3009_limite', true), '')::integer;
  r record; v jsonb; n_ok integer := 0; n_ko integer := 0; n_q integer;
BEGIN
  IF NOT ('fusions' = ANY (string_to_array(COALESCE(current_setting('fillsell.inverse_3009', true), ''), ','))) THEN RETURN; END IF;
  CREATE TABLE IF NOT EXISTS public._backup_inverse_3009_fusions (
    fusion_id uuid PRIMARY KEY, fusion jsonb NOT NULL, garde jsonb, absorbe jsonb, question jsonb,
    resultat jsonb, sauvegarde_le timestamptz NOT NULL DEFAULT now());
  ALTER TABLE public._backup_inverse_3009_fusions ENABLE ROW LEVEL SECURITY;
  REVOKE ALL ON public._backup_inverse_3009_fusions FROM public, anon, authenticated;
  FOR r IN
    SELECT f.* FROM public.inventaire_fusions f
     WHERE f.par = 'utilisateur:photo_go_nico_3009' AND f.defait_le IS NULL
     ORDER BY f.created_at DESC
     LIMIT v_lim
  LOOP
    INSERT INTO public._backup_inverse_3009_fusions (fusion_id, fusion, garde, absorbe, question)
      SELECT r.id, to_jsonb(r),
             (SELECT to_jsonb(i) FROM public.inventaire i WHERE i.id = r.garde),
             (SELECT to_jsonb(i) FROM public.inventaire i WHERE i.id = r.absorbe),
             (SELECT to_jsonb(d) FROM public.inventaire_doublons d WHERE d.fusion_id = r.id)
      ON CONFLICT (fusion_id) DO NOTHING;
    v := public.inventaire_defusionner_pour(r.user_id, r.id, 'retour_photo_go_nico_3009');
    UPDATE public._backup_inverse_3009_fusions SET resultat = v WHERE fusion_id = r.id;
    IF COALESCE((v ->> 'ok')::boolean, false) THEN n_ok := n_ok + 1; ELSE n_ko := n_ko + 1; END IF;
  END LOOP;
  UPDATE public.inventaire_doublons d
     SET statut = 'proposee', decide_le = NULL, decide_par = NULL, fusion_id = NULL
    FROM public._backup_inverse_3009_fusions b
   WHERE b.question IS NOT NULL AND d.id = (b.question ->> 'id')::uuid
     AND d.statut = 'defaite' AND d.decide_par = 'retour_photo_go_nico_3009';
  GET DIAGNOSTICS n_q = ROW_COUNT;
  RAISE NOTICE 'fusions défaites : %, refusées : %, questions rouvertes : %', n_ok, n_ko, n_q;
END
$fusions$;

-- ── questions_4_5 : rouvre les questions 4 et 5 (501 + 89) ─────────────────
-- Seulement si les deux fiches sont de nouveau séparées, en stock.
DO $questions45$
DECLARE
  v_lim integer := NULLIF(current_setting('fillsell.inverse_3009_limite', true), '')::integer;
  n integer;
BEGIN
  IF NOT ('questions_4_5' = ANY (string_to_array(COALESCE(current_setting('fillsell.inverse_3009', true), ''), ','))) THEN RETURN; END IF;
  CREATE TABLE IF NOT EXISTS public._backup_inverse_3009_questions (
    id uuid PRIMARY KEY, ligne jsonb NOT NULL, sauvegarde_le timestamptz NOT NULL DEFAULT now());
  ALTER TABLE public._backup_inverse_3009_questions ENABLE ROW LEVEL SECURITY;
  REVOKE ALL ON public._backup_inverse_3009_questions FROM public, anon, authenticated;
  CREATE TEMP TABLE _inv_q45 ON COMMIT DROP AS
    SELECT d.id FROM public.inventaire_doublons d
      JOIN public.inventaire ig ON ig.id = d.garde JOIN public.inventaire ia ON ia.id = d.absorbe
     WHERE d.statut = 'caduque' AND d.decide_par IN ('photo_go_nico_3009', 'perimee_go_nico_3009')
       AND ig.fusionne_dans IS NULL AND ia.fusionne_dans IS NULL AND ig.statut = 'stock' AND ia.statut = 'stock'
     ORDER BY d.id LIMIT v_lim;
  INSERT INTO public._backup_inverse_3009_questions (id, ligne)
    SELECT d.id, to_jsonb(d) FROM public.inventaire_doublons d JOIN _inv_q45 USING (id)
    ON CONFLICT (id) DO NOTHING;
  UPDATE public.inventaire_doublons d SET statut = 'proposee', decide_le = NULL, decide_par = NULL
    FROM _inv_q45 c WHERE d.id = c.id;
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE 'questions 4/5 rouvertes : %', n;
END
$questions45$;

-- ── questions_6_7 : rouvre les questions 6 et 7 (146 + 92) ─────────────────
DO $questions67$
DECLARE
  v_lim integer := NULLIF(current_setting('fillsell.inverse_3009_limite', true), '')::integer;
  n integer;
BEGIN
  IF NOT ('questions_6_7' = ANY (string_to_array(COALESCE(current_setting('fillsell.inverse_3009', true), ''), ','))) THEN RETURN; END IF;
  CREATE TABLE IF NOT EXISTS public._backup_inverse_3009_questions (
    id uuid PRIMARY KEY, ligne jsonb NOT NULL, sauvegarde_le timestamptz NOT NULL DEFAULT now());
  ALTER TABLE public._backup_inverse_3009_questions ENABLE ROW LEVEL SECURITY;
  REVOKE ALL ON public._backup_inverse_3009_questions FROM public, anon, authenticated;
  CREATE TEMP TABLE _inv_q67 ON COMMIT DROP AS
    SELECT d.id FROM public.inventaire_doublons d
      JOIN public.inventaire ig ON ig.id = d.garde JOIN public.inventaire ia ON ia.id = d.absorbe
     WHERE d.statut = 'caduque' AND d.decide_par IN ('pas_le_meme_article_photos_3009', 'regle_deux_exemplaires_3009')
       AND ig.fusionne_dans IS NULL AND ia.fusionne_dans IS NULL AND ig.statut = 'stock' AND ia.statut = 'stock'
     ORDER BY d.id LIMIT v_lim;
  INSERT INTO public._backup_inverse_3009_questions (id, ligne)
    SELECT d.id, to_jsonb(d) FROM public.inventaire_doublons d JOIN _inv_q67 USING (id)
    ON CONFLICT (id) DO NOTHING;
  UPDATE public.inventaire_doublons d SET statut = 'proposee', decide_le = NULL, decide_par = NULL
    FROM _inv_q67 c WHERE d.id = c.id;
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE 'questions 6/7 rouvertes : %', n;
END
$questions67$;
