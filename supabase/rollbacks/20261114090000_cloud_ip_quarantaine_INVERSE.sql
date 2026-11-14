-- INVERSE de supabase/migrations/20261114090000_cloud_ip_quarantaine.sql (la quarantaine des IP, 14/11/2026).
-- À jouer SEULEMENT après avoir redéployé l'orchestrateur d'avant (sinon il appellerait cloud_ip_quarantaine_noter, absente :
-- il n'écrirait rien, sans dommage, mais ses contrôles douteux ne seraient plus notés).
-- 1. Les IP en quarantaine (jamais tenues par un compte) redeviennent « achetee » — JAMAIS « rebut » : l'ancien contrôle
--    d'entrée les rejugera (et, lui, les mettrait au rebut sur un nouvel échec). Leur quarantaine est gardée dans
--    _backup_1411_cloud_ip_quarantaine_lignes avant que la colonne parte.
-- 2. cloud_ip_controle_entree : le corps de la prod du 13/11 (scripts/essais/fixtures/prod-1311-ip-quarantaine/, md5
--    ce8f38b4… à la fin de ligne près) ; cloud_ip_quarantaine_noter et cloud_ip_quarantaine_defaut supprimées.
-- 3. Les CHECK d'avant ; celui du journal en NOT VALID si des événements « quarantaine » / « sortie_quarantaine » existent
--    (le journal n'est jamais réécrit : ils restent, lisibles).
SET lock_timeout = '5s';
BEGIN;

CREATE TABLE IF NOT EXISTS public._backup_1411_cloud_ip_quarantaine_lignes AS
  SELECT now() AS le, id, etat, quarantaine FROM public.cloud_ips WHERE quarantaine IS NOT NULL OR etat = 'quarantaine';
ALTER TABLE public._backup_1411_cloud_ip_quarantaine_lignes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_1411_cloud_ip_quarantaine_lignes FROM PUBLIC, anon, authenticated;

UPDATE public.cloud_ips SET etat = 'achetee', maj_le = now() WHERE etat = 'quarantaine' AND user_id IS NULL;

CREATE OR REPLACE FUNCTION public.cloud_ip_controle_entree(p_ip bigint, p_controle jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v public.cloud_ips%ROWTYPE;
  v_manques text[];
BEGIN
  SELECT * INTO v FROM public.cloud_ips WHERE id = p_ip FOR UPDATE;
  IF NOT FOUND OR v.etat <> 'achetee' THEN RETURN jsonb_build_object('ok', false, 'raison', 'pas_achetee'); END IF;
  v_manques := public.cloud_controle_manques(p_controle, v.ip);
  PERFORM public.cloud_journal(p_ip, 'controle_entree', NULL, jsonb_build_object('controle', p_controle, 'manques', to_jsonb(v_manques)));
  IF cardinality(v_manques) > 0 THEN
    PERFORM public.cloud_ip_signaler(p_ip, 'controle_entree', jsonb_build_object('manques', to_jsonb(v_manques)));
    RETURN jsonb_build_object('ok', false, 'raison', 'rebut', 'manques', to_jsonb(v_manques), 'demander_remplacement', true);
  END IF;
  UPDATE public.cloud_ips SET etat = 'disponible', maj_le = now() WHERE id = p_ip;
  RETURN jsonb_build_object('ok', true);
END;
$function$;

DROP FUNCTION IF EXISTS public.cloud_ip_quarantaine_noter(bigint, jsonb, jsonb);
DROP FUNCTION IF EXISTS public.cloud_ip_quarantaine_defaut(jsonb, jsonb, text[]);

ALTER TABLE public.cloud_ips DROP CONSTRAINT IF EXISTS cloud_ips_quarantaine;
ALTER TABLE public.cloud_ips DROP CONSTRAINT IF EXISTS cloud_ips_quarantaine_lisible;
ALTER TABLE public.cloud_ips DROP CONSTRAINT IF EXISTS cloud_ips_etat_check;
ALTER TABLE public.cloud_ips ADD CONSTRAINT cloud_ips_etat_check
  CHECK (etat IN ('achetee', 'disponible', 'attribuee_essai', 'attribuee_client', 'repos', 'rebut', 'expiree'));
ALTER TABLE public.cloud_ips DROP COLUMN IF EXISTS quarantaine;

ALTER TABLE public.cloud_ip_evenements DROP CONSTRAINT IF EXISTS cloud_ip_evenements_nature_check;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.cloud_ip_evenements WHERE nature IN ('quarantaine', 'sortie_quarantaine')) THEN
    ALTER TABLE public.cloud_ip_evenements ADD CONSTRAINT cloud_ip_evenements_nature_check
      CHECK (nature IN ('achat', 'controle_entree', 'reservation', 'attribution', 'retour_meme_compte', 'conversion', 'liberation',
        'purge', 'sortie_repos', 'signalement', 'rebut', 'renouvellement', 'identifiants_changes', 'expiration', 'incident', 'refus',
        'refus_leve', 'refus_prouve', 'visite_controle', 'depense')) NOT VALID;
  ELSE
    ALTER TABLE public.cloud_ip_evenements ADD CONSTRAINT cloud_ip_evenements_nature_check
      CHECK (nature IN ('achat', 'controle_entree', 'reservation', 'attribution', 'retour_meme_compte', 'conversion', 'liberation',
        'purge', 'sortie_repos', 'signalement', 'rebut', 'renouvellement', 'identifiants_changes', 'expiration', 'incident', 'refus',
        'refus_leve', 'refus_prouve', 'visite_controle', 'depense'));
  END IF;
END $$;

COMMIT;
