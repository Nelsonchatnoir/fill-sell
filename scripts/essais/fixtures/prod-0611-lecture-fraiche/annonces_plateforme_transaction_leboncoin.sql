CREATE OR REPLACE FUNCTION public.annonces_plateforme_transaction_leboncoin()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_new text; v_old text; v_lue_new timestamptz; v_lue_old timestamptz;
BEGIN
  BEGIN
    v_new := public.leboncoin_transaction_lue(NEW.transaction_plateforme, NEW.capture);
    IF v_new IS NULL THEN RETURN NULL; END IF;
    IF TG_OP = 'UPDATE' THEN
      v_old := public.leboncoin_transaction_lue(OLD.transaction_plateforme, OLD.capture);
      IF v_new IS NOT DISTINCT FROM v_old THEN
        -- (24/10, décision 7 de Nico) LA LECTURE FRAÎCHE D'UNE VENTE NON ENREGISTRÉE. Le même état relu (« Achat en
        -- cours » ou « Vendu ») ne disait rien : une fiche importée APRÈS la première lecture, ou une lecture ancienne
        -- reprise par une extension plus récente, attendait un script. Désormais, quand un relevé relit cet état
        -- (lecture de moins d'une heure, plus récente que la précédente, annonce vue en ligne dans les 24 h) et que le
        -- job Leboncoin publié de CE numéro, exactement, porte une fiche au stock sans preuve de vente, la règle joue
        -- comme au changement d'état (le rattrapage du 22/10, par le relevé lui-même). Aucun mail pour une vente de
        -- plus de 24 h : push_trg_job (rattrapage, première lecture).
        IF v_new IN ('pending', 'sold') THEN
          v_lue_new := greatest(NEW.transaction_lue_le, NEW.capture_le);
          v_lue_old := greatest(OLD.transaction_lue_le, OLD.capture_le);
          IF v_lue_new > now() - interval '1 hour' AND v_lue_new > coalesce(v_lue_old, '-infinity'::timestamptz)
             AND NEW.statut_plateforme = 'en_ligne' AND NEW.disparu_le IS NULL AND NEW.vu_le > now() - interval '24 hours'
             AND EXISTS (SELECT 1 FROM public.cross_post_jobs c
                           JOIN public.inventaire i ON i.id = c.inventaire_id AND i.user_id = c.user_id
                          WHERE c.user_id = NEW.user_id AND c.platform = 'leboncoin' AND c.status = 'published'
                            AND coalesce(c.action, 'publish') IN ('publish', 'republish')
                            AND btrim(coalesce(c.platform_listing_id, '')) = btrim(NEW.listing_id)
                            AND i.statut = 'stock' AND i.fusionne_dans IS NULL
                            AND coalesce(c.platform_fields ->> 'sale_signal', '') <> 'sold') THEN
            PERFORM public.leboncoin_transaction_noter(NEW.id, v_new, v_old);
          END IF;
        END IF;
        RETURN NULL;
      END IF;
    END IF;
    -- Une annonce lue pour la première fois sans transaction n'a rien à dire.
    IF v_old IS NULL AND v_new = 'aucune' THEN RETURN NULL; END IF;
    PERFORM public.leboncoin_transaction_noter(NEW.id, v_new, v_old);
  EXCEPTION WHEN OTHERS THEN
    -- Jamais un relevé perdu à cause de la règle : la panne est dite, l'écriture passe.
    RAISE WARNING 'annonces_plateforme_transaction_leboncoin (annonce %) : %', NEW.id, SQLERRM;
  END;
  RETURN NULL;
END;
$function$

