-- INVERSE de 20261008111000_vinted_fiche_recule_sur_preuve.sql : remet la définition de 20261008110000.
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
  v_vue boolean;
BEGIN
  IF v_old IS NULL OR v_new IS NULL OR v_old = v_new THEN RETURN NEW; END IF;
  IF v_old !~ '^\d+$' OR v_new !~ '^\d+$' OR v_new::numeric > v_old::numeric THEN RETURN NEW; END IF;  -- plus récente : la fiche la suit
  -- Une annonce PLUS ANCIENNE ne reprend la fiche que si elle est EN LIGNE et
  -- que la récente ne l'est plus (statut, disparition, absente du dressing).
  IF COALESCE(NEW.vinted_status, '') = 'active' THEN
    IF COALESCE(OLD.vinted_status, '') <> 'active' OR OLD.disparu_le IS NOT NULL THEN RETURN NEW; END IF;
    SELECT EXISTS (SELECT 1 FROM vinted_listing_snapshots s
                    WHERE s.user_id = NEW.user_id AND s.vinted_item_id = v_old AND s.status = 'active'
                      AND s.captured_at > now() - interval '26 hours') INTO v_vue;
    IF NOT v_vue THEN RETURN NEW; END IF;
  END IF;
  -- La synchro écrivait l'ancienne annonce (vendue) par-dessus la récente : on
  -- garde la récente et son état (les compteurs de l'écriture sont ceux de
  -- l'ancienne).
  NEW.vinted_item_id := OLD.vinted_item_id;
  NEW.vinted_status := OLD.vinted_status;
  NEW.vinted_view_count := OLD.vinted_view_count;
  NEW.vinted_favourite_count := OLD.vinted_favourite_count;
  NEW.listed_at_guess := OLD.listed_at_guess;
  NEW.disparu_le := OLD.disparu_le;
  RETURN NEW;
END;
$function$;
COMMIT;
