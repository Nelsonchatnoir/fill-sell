-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 20261115190000 — LE PRIX DE LA FICHE SE COMPARE AU MOMENT OÙ LE PRIX DE L'ANNONCE A ÉTÉ FIXÉ (correctif de 20261115180000)
-- (15/11/2026, point 5 de Nico — nino57270, 7153db13 ; rapport docs/enquetes/lot-1511-5-prix-republication/RAPPORT.md)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- Relu en prod après 20261115180000 (15:38) : la règle comparait la fiche à la DERNIÈRE mise en ligne. Or la republication
-- de 13:22 (partie à 13:31 au mauvais prix, 225 €) est postérieure au changement de sa fiche (13:22:04) : la prochaine
-- republication aurait encore gardé 225 €. Une republication sans prix choisi ne FIXE pas le prix, elle le recopie : la
-- fiche se compare au dernier dépôt ou à la dernière republication qui a posé un prix (prix_republication, prix repris de
-- l'annonce relevée, prix de recréation). Une seule fonction change (public.prix_de_republication) ; spend_coins_and_republish
-- et le reste : inchangés. Inverse : supabase/rollbacks/20261115190000_prix_republication_moment_du_prix_INVERSE.sql.
SET lock_timeout = '3s';
CREATE OR REPLACE FUNCTION public.prix_de_republication(p_inventaire_id bigint, p_platform text, p_src_job_id uuid,
  p_listing_id text, p_vinted_item_id text, p_prix_republication numeric DEFAULT NULL, p_baisse_pct numeric DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_pf text := lower(COALESCE(NULLIF(btrim(p_platform), ''), 'vinted'));
  v_user uuid;
  v_fiche_prix numeric;
  v_change_le timestamptz;
  v_change_par text;
  v_pub_le timestamptz;
  v_annonce numeric;
  v_src_prix numeric;
  v_fiche numeric;
  v_base numeric;
  v_prix numeric;
  v_raison text;
BEGIN
  SELECT i.user_id, i.prix_vente, i.prix_vente_change_le, i.prix_vente_change_par
    INTO v_user, v_fiche_prix, v_change_le, v_change_par
    FROM inventaire i WHERE i.id = p_inventaire_id;
  BEGIN
    -- (15/11/2026, 15:45) LE MOMENT OÙ LE PRIX DE L'ANNONCE A ÉTÉ FIXÉ — pas sa dernière mise en ligne : une republication
    -- SANS prix choisi recopie le prix d'avant (c'est le défaut corrigé ici ; la Calandre de 7153db13 est repartie à
    -- 225 € à 13:31, APRÈS sa fiche passée à 200 € à 13:22). Le prix est fixé par le dépôt, ou par une republication qui
    -- a posé un prix (prix_republication, prix repris de l'annonce relevée, prix de recréation).
    SELECT max(COALESCE(CASE WHEN (j.platform_fields ->> 'recreated_at') ~ '^\d{4}-\d{2}-\d{2}'
                             THEN (j.platform_fields ->> 'recreated_at')::timestamptz END, j.published_at))
      INTO v_pub_le
      FROM cross_post_jobs j
     WHERE j.inventaire_id = p_inventaire_id AND j.platform = v_pf AND j.published_at IS NOT NULL
       AND (j.action = 'publish'
            OR (j.action = 'republish' AND (j.platform_fields ? 'prix_republication' OR j.platform_fields ? 'prix_repris_de_l_annonce'
                                            OR j.platform_fields ? 'prix_recreation')));
    IF v_pf = 'vinted' THEN
      SELECT s.price INTO v_annonce FROM vinted_listing_snapshots s
       WHERE s.user_id = v_user AND s.vinted_item_id = p_vinted_item_id AND s.price > 0
       ORDER BY s.captured_at DESC NULLS LAST LIMIT 1;
    ELSE
      -- L'annonce copiée (la tâche source) : son prix ; le prix relevé sur CE numéro (14 j) d'abord.
      SELECT j.price INTO v_src_prix FROM cross_post_jobs j WHERE j.id = p_src_job_id;
      SELECT a.prix INTO v_annonce FROM annonces_plateforme a
       WHERE a.user_id = v_user AND a.platform = v_pf AND a.listing_id = p_listing_id
         AND a.vu_le >= now() - interval '14 days' AND a.prix > 0
       ORDER BY a.vu_le DESC LIMIT 1;
      v_annonce := COALESCE(v_annonce, NULLIF(v_src_prix, 0));
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_pub_le := NULL; v_annonce := NULL;
  END;
  -- Le prix de la fiche ne compte que s'il a été changé PAR LA PERSONNE (l'app) APRÈS la mise en ligne de l'annonce.
  IF v_change_par = 'app' AND v_fiche_prix >= 1 AND (v_pub_le IS NULL OR v_change_le > v_pub_le) THEN
    v_fiche := v_fiche_prix;
  END IF;
  v_base := COALESCE(v_fiche, v_annonce);
  IF p_prix_republication IS NOT NULL THEN
    v_prix := p_prix_republication; v_raison := 'prix_choisi';
  ELSIF p_baisse_pct IS NOT NULL AND v_base IS NOT NULL THEN
    v_prix := greatest(2, floor(v_base * (100 - p_baisse_pct) / 100)); v_raison := 'baisse';
  ELSIF p_baisse_pct IS NOT NULL THEN
    v_prix := NULL; v_raison := 'baisse_sans_prix_connu';
  ELSIF v_fiche IS NOT NULL THEN
    v_prix := v_fiche; v_raison := 'prix_de_la_fiche';
  ELSE
    v_prix := NULL; v_raison := 'prix_de_l_annonce';
  END IF;
  RETURN jsonb_build_object('prix', v_prix, 'raison', v_raison, 'base', v_base,
    'base_de', CASE WHEN v_fiche IS NOT NULL THEN 'fiche' WHEN v_annonce IS NOT NULL THEN 'annonce' END,
    'fiche_prix', v_fiche_prix, 'fiche_change_le', v_change_le, 'fiche_change_par', v_change_par,
    'annonce_publiee_le', v_pub_le, 'annonce_prix', v_annonce, 'baisse_pct', p_baisse_pct, 'le', now());
END;
$function$;
REVOKE ALL ON FUNCTION public.prix_de_republication(bigint, text, uuid, text, text, numeric, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prix_de_republication(bigint, text, uuid, text, text, numeric, numeric) TO service_role;
