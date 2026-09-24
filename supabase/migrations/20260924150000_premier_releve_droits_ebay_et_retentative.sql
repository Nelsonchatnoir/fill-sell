-- ═══════════════════════════════════════════════════════════════════════════
-- LES RELEVÉS QUI NE PARTAIENT PAS À L'INSCRIPTION (2026-09-24)
-- ═══════════════════════════════════════════════════════════════════════════
-- labouquinerie85, inscrit le 24/09 à 09:08, cinq plateformes cochées : eBay,
-- Beebs et Opla jamais relevées. Cause unique, prouvée par postgres_logs :
--   « planifier_premiers_releves(<uid>) : permission denied for table ebay_accounts »
--   2 128 fois entre le 23/09 17:03 et le 24/09 09:54, 61 comptes.
-- plateformes_verite (SECURITY INVOKER, appelée par l'app en `authenticated`
-- et par le trigger profiles_premiers_releves_trg) lisait ebay_accounts en
-- direct — table REVOKE pour anon/authenticated depuis
-- 20260905213647_ebay_accounts_oauth.sql (elle porte les jetons OAuth). Le
-- trigger avale l'exception (RAISE WARNING) : aucun relevé n'était planifié à
-- l'inscription, pour personne, et l'écran Plateformes de l'app échouait
-- 253 fois par jour sur la même RPC.
--
-- Trois changements, TOUS dérivés du corps prod relu le 24/09 (pg_get_functiondef),
-- par remplacement ANCRÉ : si une ancre manque, la migration ÉCHOUE au lieu
-- de se taire.
--   1. ebay_compte_relie_le(uuid) — DEFINER, ne rend QUE la date de liaison,
--      jamais un jeton ; plateformes_verite l'appelle à la place du SELECT.
--   2. plateformes_verite — compte eBay relié par l'API mais session eBay
--      FERMÉE dans Chrome (sonde false) : action_secondaire = 'connexion'
--      (« Me connecter », c'est SA session ; le relevé passe par le navigateur).
--   3. planifier_premiers_releves —
--      · eBay-API n'est plus retenu sur un Hub simplement INCONNU, seulement
--        sur une session navigateur PROUVÉE fermée (sonde ou Hub à false) ;
--      · retentative BORNÉE : un relevé qui n'a rien donné (failed, absente,
--        expired) est reposé au plus 3 fois par plateforme, jamais à moins de
--        6 h du précédent, et seulement si la plateforme a été re-sondée
--        depuis — jamais une rafale sur une sonde figée en 403 (Beebs).
-- Rattrapage : rien à lancer à la main — le trigger repart au prochain
-- mouvement d'extension_sessions (sonde Vinted, 10 min) de chaque poste allumé.
-- Appliquée en prod le 24/09/2026 (execute_sql), fichier pour la trace.

-- ── 1. La date de liaison eBay, sans exposer la table ───────────────────────
CREATE OR REPLACE FUNCTION public.ebay_compte_relie_le(p_user uuid)
RETURNS timestamptz
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT connected_at FROM ebay_accounts e
   WHERE e.user_id = p_user AND e.revoked_at IS NULL
     AND COALESCE(e.refresh_token_expires_at, now() + interval '1 day') > now()
   ORDER BY connected_at DESC NULLS LAST LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.ebay_compte_relie_le(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ebay_compte_relie_le(uuid) TO authenticated, service_role;

-- ── 2. plateformes_verite : lecture par le helper + action secondaire eBay-API ─
DO $do$
DECLARE
  v_def text; v_new text;
  a1 text := 'SELECT connected_at INTO v_ebay_api FROM ebay_accounts e
   WHERE e.user_id = p_user AND e.revoked_at IS NULL
     AND COALESCE(e.refresh_token_expires_at, now() + interval ''1 day'') > now()
   ORDER BY connected_at DESC NULLS LAST LIMIT 1;';
  r1 text := '-- ebay_accounts est REVOKE pour authenticated (jetons OAuth) : lue par une
  -- fonction DEFINER qui ne rend QUE la date (2026-09-24). Avant, ce SELECT
  -- direct échouait « permission denied » sous l''app et sous le trigger du
  -- premier relevé : 2 128 échecs en 24 h, aucun relevé planifié à l''inscription.
  v_ebay_api := ebay_compte_relie_le(p_user);';
  a2 text := '    v_action2 := CASE WHEN v_etat = ''a_connecter'' AND pf = ''ebay'' THEN ''connexion'' ELSE NULL END;';
  r2 text := '    -- Compte eBay relié par l''API mais session eBay FERMÉE dans Chrome
    -- (sonde false) : l''état reste « connectée », et « Me connecter » est
    -- proposé en action secondaire — le relevé passe par le navigateur (2026-09-24).
    v_action2 := CASE WHEN v_etat = ''a_connecter'' AND pf = ''ebay'' THEN ''connexion''
                      WHEN pf = ''ebay'' AND v_source = ''api'' AND v_sonde_v = ''false'' THEN ''connexion''
                      ELSE NULL END;';
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'plateformes_verite';
  IF v_def IS NULL THEN RAISE EXCEPTION 'plateformes_verite introuvable'; END IF;
  IF position(r1 IN v_def) > 0 AND position(r2 IN v_def) > 0 THEN
    RAISE NOTICE 'plateformes_verite : déjà migrée';
    RETURN;
  END IF;
  IF position(a1 IN v_def) = 0 THEN RAISE EXCEPTION 'plateformes_verite : ancre 1 (SELECT ebay_accounts) introuvable — corps prod différent de celui relu le 24/09'; END IF;
  IF position(a2 IN v_def) = 0 THEN RAISE EXCEPTION 'plateformes_verite : ancre 2 (v_action2) introuvable — corps prod différent de celui relu le 24/09'; END IF;
  v_new := replace(replace(v_def, a1, r1), a2, r2);
  EXECUTE v_new;
END
$do$;

-- ── 3. planifier_premiers_releves : eBay-API et retentative bornée ───────────
DO $do$
DECLARE
  v_def text; v_new text;
  a0 text := '  v_out jsonb := ''{}''::jsonb; pf text; v_etat text; v_id uuid;';
  r0 text := '  v_out jsonb := ''{}''::jsonb; pf text; v_etat text; v_id uuid;
  v_n integer; v_dernier timestamptz;';
  a1 text := '    IF pf = ''ebay'' AND (v_verite -> ''plateformes'' -> ''ebay'' ->> ''source'') = ''api'' AND (v_s ->> ''ebay_hub'') IS DISTINCT FROM ''true'' THEN
      v_out := v_out || jsonb_build_object(pf, ''api_sans_hub''); CONTINUE;
    END IF;';
  r1 text := '    -- eBay relié par l''API : le relevé passe par le navigateur ; on ne le
    -- retient que si la session eBay du navigateur est PROUVÉE fermée (sonde
    -- ou Hub à false), plus sur un Hub simplement inconnu (2026-09-24) — « le
    -- relevé est la sonde la plus précise ».
    IF pf = ''ebay'' AND (v_verite -> ''plateformes'' -> ''ebay'' ->> ''source'') = ''api''
       AND ((v_s ->> ''ebay_hub'') = ''false'' OR (v_s ->> ''ebay'') = ''false'') THEN
      v_out := v_out || jsonb_build_object(pf, ''api_sans_session_navigateur''); CONTINUE;
    END IF;';
  a2 text := '    IF EXISTS (SELECT 1 FROM vinted_sync_runs WHERE user_id = p_user AND kind = ''annonces'' AND platform = pf AND status NOT IN (''expired'', ''cancelled'')) THEN
      v_out := v_out || jsonb_build_object(pf, ''deja_un_releve''); CONTINUE;
    END IF;';
  r2 text := '    IF EXISTS (SELECT 1 FROM vinted_sync_runs WHERE user_id = p_user AND kind = ''annonces'' AND platform = pf AND status = ''done'') THEN
      v_out := v_out || jsonb_build_object(pf, ''deja_un_releve''); CONTINUE;
    END IF;
    IF EXISTS (SELECT 1 FROM vinted_sync_runs WHERE user_id = p_user AND kind = ''annonces'' AND platform = pf AND status IN (''queued'', ''running'')) THEN
      v_out := v_out || jsonb_build_object(pf, ''deja_en_file''); CONTINUE;
    END IF;
    -- Retentative BORNÉE (2026-09-24) : un relevé qui n''a rien donné (failed,
    -- absente, expired) est reposé au plus 3 fois, jamais à moins de 6 h du
    -- précédent, et seulement si la plateforme a été re-sondée depuis — jamais
    -- une rafale sur une sonde figée en 403.
    SELECT count(*), max(COALESCE(finished_at, queued_at)) INTO v_n, v_dernier FROM vinted_sync_runs
     WHERE user_id = p_user AND kind = ''annonces'' AND platform = pf AND declencheur LIKE ''serveur:premier_releve%'';
    IF v_n >= 3 THEN v_out := v_out || jsonb_build_object(pf, ''essais_epuises''); CONTINUE; END IF;
    IF v_dernier IS NOT NULL AND v_dernier > now() - interval ''6 hours'' THEN
      v_out := v_out || jsonb_build_object(pf, ''attente''); CONTINUE;
    END IF;
    IF v_dernier IS NOT NULL AND COALESCE((v_verite -> ''plateformes'' -> pf ->> ''sonde_le'')::timestamptz, v_dernier) <= v_dernier THEN
      v_out := v_out || jsonb_build_object(pf, ''attente_fait_nouveau''); CONTINUE;
    END IF;';
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'planifier_premiers_releves';
  IF v_def IS NULL THEN RAISE EXCEPTION 'planifier_premiers_releves introuvable'; END IF;
  IF position(r1 IN v_def) > 0 AND position(r2 IN v_def) > 0 THEN
    RAISE NOTICE 'planifier_premiers_releves : déjà migrée';
    RETURN;
  END IF;
  IF position(a0 IN v_def) = 0 THEN RAISE EXCEPTION 'planifier_premiers_releves : ancre 0 (DECLARE) introuvable — corps prod différent de celui relu le 24/09'; END IF;
  IF position(a1 IN v_def) = 0 THEN RAISE EXCEPTION 'planifier_premiers_releves : ancre 1 (api_sans_hub) introuvable — corps prod différent de celui relu le 24/09'; END IF;
  IF position(a2 IN v_def) = 0 THEN RAISE EXCEPTION 'planifier_premiers_releves : ancre 2 (deja_un_releve) introuvable — corps prod différent de celui relu le 24/09'; END IF;
  v_new := replace(replace(replace(v_def, a0, r0), a1, r1), a2, r2);
  EXECUTE v_new;
END
$do$;
