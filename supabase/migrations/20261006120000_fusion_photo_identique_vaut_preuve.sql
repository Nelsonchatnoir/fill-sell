-- ═══════════════════════════════════════════════════════════════════════════
-- (06/10, Nico) UNE FUSION AUTOMATIQUE PAR PHOTO IDENTIQUE VAUT PREUVE
-- ═══════════════════════════════════════════════════════════════════════════
-- Cas Ornella, « Pyjama Tape à l'œil » (fiche 1789975294002001) : vendu sur
-- Vinted le 05/10, sa copie Beebs (job 48126211) est restée en ligne. Elle était
-- arrivée sur la fiche par une fusion « auto (doublon certain : photo_identique) »,
-- et retrait_job_prouve refusait TOUT dépôt déplacé par une fusion qui n'est pas
-- 'utilisateur%' — alors que la photo identique compte déjà comme preuve dans le
-- rattachement (motif 'photo_identique').
--
-- Désormais : une fusion automatique dont le motif est la photo identique
-- (« … photo_identique) » en fin de `par` : la fusion auto et le recensement du
-- 25/09) vaut preuve, comme le rattachement. Les autres fusions automatiques
-- (titre exact + prix égal, remise en ligne par titre, check support) restent
-- refusées. Mesuré le 06/10 : 19 dépôts publiés débloqués par la fusion auto,
-- 115 par le recensement photo ; 94 restent bloqués (titre).
--
-- Partie de la définition EN PROD du 06/10 (pg_get_functiondef), une seule
-- ligne ajoutée. Inverse : retirer la ligne « photo\_identique) ».
CREATE OR REPLACE FUNCTION public.retrait_job_prouve(p_job uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT COALESCE((
    SELECT NOT EXISTS (
             SELECT 1 FROM inventaire_fusions f
              WHERE f.defait_le IS NULL AND COALESCE(f.par, '') NOT LIKE 'utilisateur%'
                AND COALESCE(f.par, '') NOT LIKE '%photo\_identique)'   -- (06/10) photo identique = preuve
                AND jsonb_typeof(f.deplacements -> 'cross_post_jobs') = 'array'
                AND (f.deplacements -> 'cross_post_jobs') ? j.id::text)
       AND (COALESCE(j.platform_fields #>> '{rattachement,par}', '') IN ('', 'utilisateur')
            OR COALESCE(j.platform_fields #>> '{rattachement,motif}', '') IN ('identifiant_depot_clos', 'photo_identique')
            OR COALESCE(j.platform_fields #>> '{rattachement,import}', '') = 'true')
       AND (COALESCE(j.platform_fields ->> 'source', '') <> 'releve'
            OR COALESCE(j.platform_fields #>> '{rattachement,par}', '') = 'utilisateur'
            OR COALESCE(j.platform_fields #>> '{rattachement,motif}', '') IN ('identifiant_depot_clos', 'photo_identique')
            OR COALESCE(j.platform_fields #>> '{rattachement,import}', '') = 'true')
      FROM cross_post_jobs j WHERE j.id = p_job), false);
$function$;
