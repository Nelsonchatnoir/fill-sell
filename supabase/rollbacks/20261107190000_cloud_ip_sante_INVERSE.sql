-- ═══════════════════════════════════════════════════════════════════════════
-- INVERSE de supabase/migrations/20261107190000_cloud_ip_sante.sql — les corps de la PROD du 07/11 ~17:45
-- (pg_get_functiondef, fixtures : scripts/essais/fixtures/prod-0711-ip-sante/), mot pour mot.
-- Ordre : couper d'abord coin_config cloud_ip_sante_controle et cloud_ip_renouveler_saines_seulement (0) ; puis ce fichier :
-- cloud_ip_attribuable et cloud_ip_garde_nombre d'avant (une IP grillée redevient attribuable et comptée), la fonction
-- neuve retirée, la colonne cloud_ips.sante retirée (les verdicts sont perdus : les relire avant si besoin ; leurs
-- changements restent au journal cloud_ip_evenements, nature « visite_controle », details.sante), les deux réglages retirés.
-- L'orchestrateur qui lit la colonne n'a pas besoin d'être redéployé : sans elle, il relit le pool sans santé (lireIps).
-- ═══════════════════════════════════════════════════════════════════════════
SET lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.cloud_ip_attribuable(p cloud_ips, p_user uuid, p_nature text)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT p.expire_le >= CASE WHEN p_nature = 'essai'
                             THEN now() + make_interval(days => 7 + public.cloud_param('grace_jours', 2)
                                                              + public.cloud_param('marge_expiration_jours', 1))
                             ELSE now() + make_interval(days => public.cloud_param('renouvellement_avant_jours', 3)) END
     AND CASE
           WHEN p.etat = 'repos' THEN p_user IS NOT NULL AND p.dernier_user_id = p_user
           WHEN p.etat = 'disponible' THEN p.attributions < public.cloud_param('attributions_max', 6)
                AND (p.reserve_pour IS NULL OR p.reserve_pour = p_user OR p.reserve_jusqu_au < now())
           ELSE false END;
$function$;

CREATE OR REPLACE FUNCTION public.cloud_ip_garde_nombre(p_quantite integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH v AS (
    SELECT
      (SELECT count(*) FROM public.cloud_ips i
        WHERE i.etat IN ('attribuee_essai', 'attribuee_client')
           OR (i.etat IN ('achetee', 'disponible')
               AND i.expire_le >= now() + make_interval(days => 7 + public.cloud_param('grace_jours', 2)
                                                         + public.cloud_param('marge_expiration_jours', 1))
               AND i.attributions < public.cloud_param('attributions_max', 6)
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

DROP FUNCTION IF EXISTS public.cloud_ip_sante_noter(bigint, jsonb);
ALTER TABLE public.cloud_ips DROP CONSTRAINT IF EXISTS cloud_ips_sante_lisible;
ALTER TABLE public.cloud_ips DROP COLUMN IF EXISTS sante;
DELETE FROM public.coin_config WHERE key IN ('cloud_ip_sante_controle', 'cloud_ip_renouveler_saines_seulement');
