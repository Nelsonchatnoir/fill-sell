-- Définition de PROD relue le 13/11/2026 (pg_get_functiondef, lecture seule) — décor du banc 20261113180000, jamais appliquée.
CREATE OR REPLACE FUNCTION public.rapprochement_v3_fiche_intacte(p_fiche bigint)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM inventaire i
     WHERE i.id = p_fiche AND i.statut = 'stock' AND i.fusionne_dans IS NULL
       AND COALESCE(i.quantite, 1) <= 1
       AND i.prix_achat IS NULL AND NOT COALESCE(i.prix_achat_inconnu, false)
       AND i.prix_vente_change_par IS DISTINCT FROM 'app' AND i.poids_change_par IS DISTINCT FROM 'app'
       AND NOT EXISTS (SELECT 1 FROM ventes v WHERE v.inventaire_id = i.id)
       AND NOT EXISTS (SELECT 1 FROM cross_post_jobs j WHERE j.inventaire_id = i.id
                         AND (COALESCE(j.platform_fields ->> 'source', '') <> 'releve'
                              OR j.status IN ('pending', 'processing', 'needs_user')))
       AND NOT EXISTS (SELECT 1 FROM fiches_annonce fa WHERE fa.inventaire_id = i.id)
       AND NOT EXISTS (SELECT 1 FROM push_ventes pv WHERE pv.inventaire_id = i.id)
       AND NOT EXISTS (SELECT 1 FROM remises_en_vente rv WHERE rv.inventaire_id = i.id)
       AND NOT EXISTS (SELECT 1 FROM jsonb_each(CASE WHEN jsonb_typeof(i.attributs) = 'object' THEN i.attributs ELSE '{}'::jsonb END) e
                        WHERE jsonb_typeof(e.value) = 'object' AND e.value ->> 'source' = 'manuel')
       AND (SELECT count(*) FROM annonces_plateforme x WHERE x.inventaire_id = i.id AND x.disparu_le IS NULL) <= 1);
$function$
;
