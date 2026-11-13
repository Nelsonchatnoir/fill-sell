-- Définition de PROD relue le 13/11/2026 (pg_get_functiondef, lecture seule) — décor du banc 20261113180000, jamais appliquée.
CREATE OR REPLACE FUNCTION public.inventaire_doublons_a_verifier()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_id bigint;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.statut = 'proposee' THEN RETURN NULL; END IF;
  FOREACH v_id IN ARRAY ARRAY[OLD.garde, OLD.absorbe] LOOP
    UPDATE inventaire i SET a_verifier = NULL
     WHERE i.id = v_id AND i.a_verifier IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM inventaire_doublons d
                        WHERE d.user_id = OLD.user_id AND d.statut = 'proposee' AND d.id <> OLD.id
                          AND (d.garde = v_id OR d.absorbe = v_id));
  END LOOP;
  RETURN NULL;
END;
$function$
;
