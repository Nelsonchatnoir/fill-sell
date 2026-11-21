-- Définition de PROD de quota_annonces_consommees, lue le 21/11/2026 vers 00:30 (heure de Paris) :
-- md5(pg_get_functiondef) = 6e2f60f0c9fd6d67797f182e81d84f86, longueur 1912 — identique au texte de la migration
-- 20261110170000 (vérifié à l'octet). Propriétaire postgres ; EXECUTE : postgres, service_role.
CREATE OR REPLACE FUNCTION public.quota_annonces_consommees(p_user_id uuid, p_cycle timestamp with time zone)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH borne AS (
    SELECT GREATEST(
      p_cycle,
      to_timestamp(COALESCE((SELECT value FROM coin_config WHERE key = 'quotas_annonces_depuis'), 0))
    ) AS t
  )
  SELECT (
    -- Annonces générées (portes A et B) — dédup régénération 24 h inchangée.
    -- (10/11/2026, règle de Nico) Une passe légère — titre ET description du vendeur — ne compte jamais, et
    -- n'ouvre pas la dédup : une vraie rédaction qui la suit compte.
    (SELECT count(*) FROM usage_logs u, borne
      WHERE u.user_id = p_user_id AND u.feature = 'generate_listing'
        AND u.created_at >= borne.t
        AND NOT (COALESCE(u.metadata->>'texte_vendeur_titre', '') = 'true'
                 AND COALESCE(u.metadata->>'texte_vendeur_description', '') = 'true')
        AND NOT (
          u.metadata ? 'inventaire_id' AND EXISTS (
            SELECT 1 FROM usage_logs prev
            WHERE prev.user_id = u.user_id AND prev.feature = 'generate_listing'
              AND prev.metadata->>'inventaire_id' = u.metadata->>'inventaire_id'
              AND prev.created_at <  u.created_at
              AND prev.created_at >= u.created_at - interval '24 hours'
              AND NOT (COALESCE(prev.metadata->>'texte_vendeur_titre', '') = 'true'
                       AND COALESCE(prev.metadata->>'texte_vendeur_description', '') = 'true')
          )
        ))
    -- + scans NON unifiés depuis la borne : 1 unité chacun. Les scans unifiés
    -- (unifie:true) sont portés par leur ligne generate_listing.
    + (SELECT count(*) FROM usage_logs l, borne
        WHERE l.user_id = p_user_id AND l.feature = 'lens'
          AND l.created_at >= borne.t
          AND NOT (l.metadata ? 'unifie'))
  )::int;
$function$;
