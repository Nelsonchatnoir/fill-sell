-- INVERSE de 20261108_relance_ebay_contenu_actif.sql : rend la tâche 8d59f147 telle qu'elle était (statut, message,
-- platform_fields), SEULEMENT si elle n'a pas bougé depuis la relance (toujours 'pending', jamais reprise par le worker).
BEGIN;
DO $ecrit$ DECLARE n int; BEGIN
  UPDATE public.cross_post_jobs j SET status = b.status, error = b.error, platform_fields = b.platform_fields
    FROM public._backup_0811_ebay_contenu_actif b
   WHERE j.id = b.id AND j.status = 'pending' AND j.platform_fields ? 'relance_contenu_actif_ebay';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'la tâche a déjà été reprise par le worker : rien n''est écrit (lire son état)'; END IF;
END $ecrit$;
DROP TABLE public._backup_0811_ebay_contenu_actif;
COMMIT;
