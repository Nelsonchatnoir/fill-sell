-- ════════════════════════════════════════════════════════════════════════════
-- LA FICHE NE RECULE QUE SUR UNE PREUVE (08/10/2026, correctif de 20261008110000)
-- ════════════════════════════════════════════════════════════════════════════
-- 20261008110000 laissait une annonce PLUS ANCIENNE et en ligne reprendre la
-- fiche quand la récente n'avait pas été vue au dressing depuis 26 h. Faux
-- pour une REPUBLICATION du jour : l'annonce neuve n'est pas encore passée par
-- le dressing, l'ancienne (supprimée par la republication) y était encore
-- « active » hier — l'aperçu de la réparation l'a montré (140 fiches, dont 120
-- republiées le 08/10). Aucune fiche n'a reculé entre-temps (vérifié sur les
-- trois synchros passées depuis : 0 ligne).
-- RÈGLE : une annonce plus ancienne, en ligne, ne reprend la fiche que sur une
-- PREUVE que l'annonce actuelle n'est plus en ligne : statut vendu/fermé,
-- disparition datée, ou son job clos (vendu, annulé, supprimé) ou signalé
-- « plus en ligne » par la veille. Jamais sur un silence du dressing.
-- Inverse : la définition de 20261008110000 (supabase/rollbacks/20261008111000_vinted_fiche_recule_sur_preuve_INVERSE.sql).
BEGIN;
CREATE OR REPLACE FUNCTION public.inventaire_vinted_suit_annonce_en_ligne()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_old text := NULLIF(btrim(COALESCE(OLD.vinted_item_id, '')), '');
  v_new text := NULLIF(btrim(COALESCE(NEW.vinted_item_id, '')), '');
BEGIN
  IF v_old IS NULL OR v_new IS NULL OR v_old = v_new THEN RETURN NEW; END IF;
  IF v_old !~ '^\d+$' OR v_new !~ '^\d+$' OR v_new::numeric > v_old::numeric THEN RETURN NEW; END IF;  -- plus récente : la fiche la suit
  -- Une annonce PLUS ANCIENNE ne reprend la fiche que si elle est EN LIGNE et
  -- que la récente n'y est plus, PREUVE à l'appui.
  IF COALESCE(NEW.vinted_status, '') = 'active' AND (
       COALESCE(OLD.vinted_status, '') IN ('sold', 'closed') OR OLD.disparu_le IS NOT NULL
       OR EXISTS (SELECT 1 FROM cross_post_jobs j
                   WHERE j.inventaire_id = OLD.id AND j.user_id = OLD.user_id AND j.platform = 'vinted'
                     AND j.action IN ('publish', 'republish') AND btrim(j.platform_listing_id) = v_old
                     AND (j.status IN ('sold', 'cancelled', 'deleted') OR j.platform_fields ? 'unavailable_since'))) THEN
    RETURN NEW;
  END IF;
  -- La synchro écrivait une annonce plus ancienne (vendue, ou en ligne quand
  -- la récente l'est aussi) par-dessus la récente : on garde la récente.
  NEW.vinted_item_id := OLD.vinted_item_id;
  NEW.vinted_status := OLD.vinted_status;
  NEW.vinted_view_count := OLD.vinted_view_count;
  NEW.vinted_favourite_count := OLD.vinted_favourite_count;
  NEW.listed_at_guess := OLD.listed_at_guess;
  NEW.disparu_le := OLD.disparu_le;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.inventaire_vinted_suit_annonce_en_ligne() FROM PUBLIC, anon, authenticated;
COMMIT;
