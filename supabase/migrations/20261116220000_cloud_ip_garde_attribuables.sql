-- 20261116220000_cloud_ip_garde_attribuables — LE RACHAT D'IP NE COMPTE QUE LES IP RÉELLEMENT ATTRIBUABLES (16/11/2026,
-- ordre URGENT de Nico : « l'app affiche Complet sur le Cloud depuis ~15:39 … le rachat automatique n'a rien acheté …
-- corrige le rachat pour qu'il ne compte que les IP réellement attribuables. Complet ne doit plus jamais s'afficher tant
-- qu'une IP peut être achetée. »)
--
-- Constat (prod, 16/11 ~18:05) : la vente (cloud_vente_etat) compte les IP « disponible » ATTRIBUABLES à un nouveau compte
-- (cloud_ip_attribuable(i, NULL, 'essai')) — 0 : la 3 réservée jusqu'au soir, la 39 gardée à Nico jusqu'au 03/12, la 40 et la
-- 76 au repos (à leur dernier titulaire seulement). Mais la garde du nombre (cloud_ip_garde_nombre) comptait TOUTE IP
-- « disponible » vivante, réservées comprises : vivantes 11 = 9 attribuées + la 3 + la 39 → borne atteinte, le rachat
-- refusé (la 2e IP demandée par Nico le 16/11 : « garde_nombre »). Le plan du jour (cloud-pool.js, planDuJour) faisait la
-- même erreur pour aCommander.
-- RÈGLE : une IP libre ne compte dans la garde que si elle est « achetee » (en route : le contrôle d'entrée la rend
-- disponible) ou « disponible » ET attribuable à un nouveau compte (cloud_ip_attribuable(i, NULL, 'essai') : couverture
-- de l'essai, non grillée, non usée, pas réservée à quelqu'un d'autre). Les IP attribuées comptent comme avant. Le miroir
-- JS (gardeNombre, planDuJour) suit la même règle. Rien d'autre ne change (borne = comptes + marge + attente).
--
-- Garde : le corps de PROD relu le 16/11 (md5 f5b37e208dd87aa50de028a87789cdb1) ; ailleurs, la migration s'arrête.
-- Banc jetable : scripts/essais/20261116220000_banc.mjs. Inverse : supabase/rollbacks/20261116220000_cloud_ip_garde_attribuables_INVERSE.sql.

DO $garde$
BEGIN
  IF md5(pg_get_functiondef('public.cloud_ip_garde_nombre(integer)'::regprocedure)) NOT IN ('f5b37e208dd87aa50de028a87789cdb1')
     AND pg_get_functiondef('public.cloud_ip_garde_nombre(integer)'::regprocedure) NOT LIKE '%20261116220000%' THEN
    RAISE EXCEPTION 'cloud_ip_garde_nombre a changé en prod depuis sa lecture du 16/11 : relire, jamais forcer';
  END IF;
END
$garde$;

CREATE OR REPLACE FUNCTION public.cloud_ip_garde_nombre(p_quantite integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  -- (16/11, 20261116220000) Une IP libre ne compte que si elle est en route (« achetee ») ou ATTRIBUABLE à un nouveau
  -- compte — la même règle que la vente (cloud_vente_etat) : une IP réservée à quelqu'un d'autre ou au repos ne compte pas.
  WITH v AS (
    SELECT
      (SELECT count(*) FROM public.cloud_ips i
        WHERE i.etat IN ('attribuee_essai', 'attribuee_client')
           OR (i.etat = 'achetee'
               AND i.expire_le >= now() + make_interval(days => 7 + public.cloud_param('grace_jours', 2)
                                                         + public.cloud_param('marge_expiration_jours', 1))
               AND i.attributions < public.cloud_param('attributions_max', 6)
               AND NOT public.cloud_ip_refus_prouve(i.refus)
               AND COALESCE(i.sante ->> 'verdict', '') <> 'grillee')
           OR (i.etat = 'disponible'
               AND public.cloud_ip_attribuable(i, NULL::uuid, 'essai')
               AND NOT public.cloud_ip_refus_prouve(i.refus)))::int AS vivantes,
      (SELECT COALESCE(sum(c.quantite), 0) FROM public.cloud_ip_commandes c
        WHERE c.nature = 'achat' AND c.statut IN ('demandee', 'en_cours'))::int AS en_commande,
      (SELECT count(*) FROM (
         SELECT p.id FROM public.profiles p
          WHERE p.is_cloud IS TRUE OR (p.cloud_essai_fin > now() AND p.cloud_essai_debut <= now() AND p.cloud_essai_arrete IS NOT TRUE)
         UNION
         SELECT i.user_id FROM public.cloud_ips i
          WHERE i.user_id IS NOT NULL AND i.etat IN ('attribuee_essai', 'attribuee_client')) s)::int AS comptes,
      GREATEST(public.cloud_param('ip_marge', 3), 0) AS marge,
      (SELECT count(*) FROM public.cloud_attente)::int AS attente,
      GREATEST(COALESCE(p_quantite, 0), 0) AS demandees)
  SELECT jsonb_build_object(
    'ok', v.vivantes + v.en_commande + v.demandees <= v.comptes + v.marge + v.attente,
    'comptees', v.vivantes + v.en_commande + v.demandees,
    'borne', v.comptes + v.marge + v.attente,
    'vivantes', v.vivantes, 'en_commande', v.en_commande, 'demandees', v.demandees,
    'comptes', v.comptes, 'marge', v.marge, 'attente', v.attente)
  FROM v;
$function$;
