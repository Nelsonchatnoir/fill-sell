-- Inverse de 20261103203000_cloud_voie_place_attente (03/11/2026).
-- Rend : cloud_compte_synchroniser d'avant (le corps renommé reprend son nom), cloud_essai_preparer_moi de la prod du
-- 03/11 (pg_get_functiondef, copiée telle quelle), aucune fonction neuve, aucun réveil neuf, cloud_attente sans ses
-- colonnes d'inscription. Les drapeaux cloud_voie restent ce qu'ils sont (la règle les avait mis justes).
-- Après : redéployer l'app sans la liste d'attente si elle a été servie (les RPC _moi disparaissent).
BEGIN;
SET LOCAL lock_timeout = '5s';
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname IN ('cloud-voies-5min', 'push-cloud-place-5min');
DROP FUNCTION IF EXISTS public.cloud_attente_resultat(jsonb);
DROP FUNCTION IF EXISTS public.cloud_attente_a_prevenir(integer);
DROP FUNCTION IF EXISTS public.cloud_attente_a_prevenir_existe();
DROP FUNCTION IF EXISTS public.cloud_attente_places_a_offrir();
DROP FUNCTION IF EXISTS public.cloud_attente_quitter_moi();
DROP FUNCTION IF EXISTS public.cloud_attente_inscrire_moi();
DROP FUNCTION IF EXISTS public.cloud_disponibilite_moi();
DO $do$
BEGIN
  IF to_regprocedure('public.cloud_compte_synchroniser_pool(uuid)') IS NOT NULL THEN
    DROP FUNCTION IF EXISTS public.cloud_compte_synchroniser(uuid);
    ALTER FUNCTION public.cloud_compte_synchroniser_pool(uuid) RENAME TO cloud_compte_synchroniser;
  END IF;
END
$do$;
REVOKE ALL ON FUNCTION public.cloud_compte_synchroniser(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cloud_compte_synchroniser(uuid) TO service_role;
CREATE OR REPLACE FUNCTION public.cloud_essai_preparer_moi(p_appareil text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_trouve boolean; v_cloud boolean; v_debut timestamptz;
  v_h_app text; v_raison text; v_permis boolean := true; v_ip bigint;
  v_comptes jsonb := '[]'::jsonb; c record; v_h text;
  v_rotation boolean := public.cloud_param('ip_rotation', 0) = 1;
BEGIN
  SELECT true, p.is_cloud, p.cloud_essai_debut INTO v_trouve, v_cloud, v_debut FROM public.profiles p WHERE p.id = v_user;
  IF v_trouve IS NOT TRUE THEN RETURN jsonb_build_object('ok', false, 'raison', 'compte_inconnu'); END IF;
  IF v_cloud IS TRUE THEN RETURN jsonb_build_object('ok', false, 'raison', 'deja_client'); END IF;
  -- La place d'abord : sans IP, rien ne démarre (ni essai, ni paiement) — sauf en rotation (30/10, lot D).
  IF NOT v_rotation THEN
    v_ip := public.cloud_ip_reserver(v_user);
    IF v_ip IS NULL THEN
      INSERT INTO public.cloud_attente AS a (user_id) VALUES (v_user)
      ON CONFLICT (user_id) DO UPDATE SET derniere_le = now(), essais = a.essais + 1;
      RETURN jsonb_build_object('ok', false, 'raison', 'pool_vide');
    END IF;
  END IF;
  DELETE FROM public.cloud_attente WHERE user_id = v_user;
  -- Les verrous de l'ESSAI (l'option, elle, reste possible).
  IF v_debut IS NOT NULL THEN
    v_permis := false; v_raison := 'essai_deja_pris';
  ELSIF COALESCE(btrim(p_appareil), '') = '' THEN
    v_permis := false; v_raison := 'appareil_inconnu';
  ELSE
    v_h_app := public.cloud_hacher('appareil', p_appareil);
    IF EXISTS (SELECT 1 FROM public.cloud_essai_empreintes WHERE nature = 'appareil' AND empreinte = v_h_app
                 AND user_id IS DISTINCT FROM v_user) THEN
      v_permis := false; v_raison := 'appareil_deja_vu';
    END IF;
  END IF;
  -- Les comptes Vinted que l'extension de CE compte a déjà relevés (au plus 10).
  FOR c IN SELECT DISTINCT r.vinted_user_id::text AS ident FROM public.vinted_sync_runs r
            WHERE r.user_id = v_user AND r.vinted_user_id IS NOT NULL LIMIT 10 LOOP
    v_h := public.cloud_hacher('vinted', c.ident);
    CONTINUE WHEN v_h IS NULL;
    v_comptes := v_comptes || jsonb_build_object('plateforme', 'vinted', 'h', v_h);
    IF v_permis AND EXISTS (SELECT 1 FROM public.cloud_essai_empreintes WHERE nature = 'compte_plateforme' AND empreinte = v_h
                              AND user_id IS DISTINCT FROM v_user) THEN
      v_permis := false; v_raison := 'compte_plateforme_deja_vu';
    END IF;
  END LOOP;
  INSERT INTO public.cloud_essai_demandes (user_id, appareil_h, comptes_h, essai_permis, raison)
  VALUES (v_user, v_h_app, v_comptes, v_permis, v_raison)
  ON CONFLICT (user_id) DO UPDATE SET appareil_h = EXCLUDED.appareil_h, comptes_h = EXCLUDED.comptes_h,
    essai_permis = EXCLUDED.essai_permis, raison = EXCLUDED.raison, demande_le = now();
  RETURN jsonb_build_object('ok', true, 'essai', v_permis, 'raison', v_raison,
    'place_jusqu_au', CASE WHEN v_ip IS NULL THEN NULL ELSE (SELECT reserve_jusqu_au FROM public.cloud_ips WHERE id = v_ip) END);
END;
$function$;
REVOKE ALL ON FUNCTION public.cloud_essai_preparer_moi(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cloud_essai_preparer_moi(text) TO authenticated, service_role;
DROP FUNCTION IF EXISTS public.cloud_vente_etat(uuid);
DROP FUNCTION IF EXISTS public.cloud_voies_synchroniser();
DROP FUNCTION IF EXISTS public.cloud_voie_appliquer(uuid);
DROP FUNCTION IF EXISTS public.cloud_voie_attendue(uuid);
DROP INDEX IF EXISTS public.cloud_attente_inscrits;
ALTER TABLE public.cloud_attente DROP CONSTRAINT IF EXISTS cloud_attente_notif_statut_check;
ALTER TABLE public.cloud_attente
  DROP COLUMN IF EXISTS notif_resultat, DROP COLUMN IF EXISTS notif_motif, DROP COLUMN IF EXISTS notif_essais,
  DROP COLUMN IF EXISTS notif_statut, DROP COLUMN IF EXISTS notifie_le, DROP COLUMN IF EXISTS inscrit_le;
COMMIT;
