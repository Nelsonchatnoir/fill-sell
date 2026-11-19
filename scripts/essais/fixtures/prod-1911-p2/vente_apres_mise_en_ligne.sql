-- Corps de PROD relu le 19/11/2026 (pg_get_functiondef vente_apres_mise_en_ligne(uuid), md5 438ba8b4451e4b953f6eef797e3d886a), commentaires retirés pour le banc.
CREATE OR REPLACE FUNCTION public.vente_apres_mise_en_ligne(p_job uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH j AS (SELECT c.id, c.user_id, c.inventaire_id, c.platform, public.annonce_mise_en_ligne(c.id) AS mise_en_ligne
               FROM public.cross_post_jobs c WHERE c.id = p_job)
  SELECT EXISTS (
           SELECT 1 FROM j JOIN public.ventes v ON v.user_id = j.user_id AND v.inventaire_id = j.inventaire_id
            WHERE lower(COALESCE(v.statut, '')) NOT IN ('annule', 'annulée', 'cancelled', 'canceled')
              AND COALESCE(NULLIF(v.plateforme_code, ''), NULLIF(v.plateforme, '')) IS NOT NULL
              AND lower(COALESCE(NULLIF(v.plateforme_code, ''), NULLIF(v.plateforme, ''))) <> lower(j.platform)
              AND public.vente_instant(v.vendu_le, v.date, v.created_at) > j.mise_en_ligne)
      OR EXISTS (
           SELECT 1 FROM j
             JOIN public.fiches_liees_comptes f ON f.fiche_a = j.inventaire_id OR f.fiche_b = j.inventaire_id
             JOIN LATERAL (SELECT CASE WHEN f.fiche_a = j.inventaire_id THEN f.fiche_b ELSE f.fiche_a END AS fiche,
                                  CASE WHEN f.fiche_a = j.inventaire_id THEN f.user_b ELSE f.user_a END AS uid,
                                  CASE WHEN f.fiche_a = j.inventaire_id THEN f.user_a ELSE f.user_b END AS moi) x ON true
             JOIN public.ventes v ON v.inventaire_id = x.fiche AND v.user_id = x.uid
            WHERE public.comptes_sont_lies(x.moi, x.uid)
              AND lower(COALESCE(v.statut, '')) NOT IN ('annule', 'annulée', 'cancelled', 'canceled')
              AND COALESCE(NULLIF(v.plateforme_code, ''), NULLIF(v.plateforme, '')) IS NOT NULL
              AND lower(COALESCE(NULLIF(v.plateforme_code, ''), NULLIF(v.plateforme, ''))) <> lower(j.platform)
              AND public.vente_instant(v.vendu_le, v.date, v.created_at) > j.mise_en_ligne);
$function$
;
