CREATE OR REPLACE FUNCTION public.cloud_comptes_a_servir()
 RETURNS TABLE(user_id uuid, ip_id bigint, ip text, port integer, etat_cloud text, poste_etat text, session_fillsell_id uuid, plateformes_connectees text[], delai_sessions_min integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH t AS (
    SELECT i.user_id AS u, i.id AS ip_id, host(i.ip) AS ip, i.port, public.cloud_etat(i.user_id) AS e
      FROM public.cloud_ips i WHERE i.etat IN ('attribuee_essai', 'attribuee_client')
    UNION ALL
    -- (30/10, lot D) Rotation : les comptes actifs SANS IP attribuée, sortie choisie par l'orchestrateur.
    SELECT p.id, NULL::bigint, NULL::text, NULL::integer, public.cloud_etat(p.id)
      FROM public.profiles p
     WHERE public.cloud_param('ip_rotation', 0) = 1
       AND (p.is_cloud IS TRUE OR p.cloud_essai_debut IS NOT NULL)
       AND NOT EXISTS (SELECT 1 FROM public.cloud_ips i2 WHERE i2.user_id = p.id))
  SELECT t.u, t.ip_id, t.ip, t.port, t.e ->> 'etat', po.etat, po.session_fillsell_id,
         COALESCE((SELECT array_agg(c.plateforme ORDER BY c.plateforme) FROM public.cloud_coffre c
                    WHERE c.user_id = t.u AND c.connecte AND c.plateforme <> 'fillsell'), '{}'),
         NULLIF(public.cloud_param('delai_sessions_min', -1), -1)
    FROM t LEFT JOIN public.cloud_postes po ON po.user_id = t.u
   -- actif, ou essai fini pendant sa grâce (le navigateur peut finir ses jobs) ;
   -- un compte inactif hors grâce n'a déjà plus d'IP (cloud_compte_synchroniser).
   WHERE COALESCE((t.e ->> 'actif')::boolean, false) OR t.e ->> 'etat' = 'essai_termine';
$function$
