-- (04/11 soir, ordre de Nico avant l'essai « recette de prod » sur une machine à vraie puce) LES DEUX PRÉPARATIFS :
--   1. coin_config.cloud_ip_achats_auto = 0 : aucun achat d'IP automatique tant que le Cloud n'est pas ouvert ; un achat ne
--      se fait plus que sur accord écrit de Nico (outils/acheter-une-ip.mjs --accord-ecrit) ;
--   2. les refus Beebs des IP 40 (essai du 04/11 13:40) et 41 (essai du 04/11 15:45) notés en base, sans aucune visite :
--      cloud_visites_controle_beebs = 0 (vérifié ci-dessous, sinon rien n'est écrit).
-- Exécution : npx supabase db query --linked -f <ce fichier>. Inverse : 20261104_cloud_essai_gpu_preparatifs_INVERSE.sql.
BEGIN;
CREATE TABLE public._backup_0411_essai_gpu_prep AS
  SELECT now() AS le, 'coin_config'::text AS t, to_jsonb(c.*) AS ligne FROM public.coin_config c WHERE c.key = 'cloud_ip_achats_auto'
  UNION ALL
  SELECT now(), 'cloud_ips', to_jsonb(i.*) FROM public.cloud_ips i WHERE i.id IN (40, 41);
ALTER TABLE public._backup_0411_essai_gpu_prep ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_0411_essai_gpu_prep FROM PUBLIC, anon, authenticated;
DO $$
BEGIN
  IF COALESCE((SELECT value FROM public.coin_config WHERE key = 'cloud_visites_controle_beebs'), 1) <> 0 THEN
    RAISE EXCEPTION 'visites de contrôle Beebs allumées : noter un refus déclencherait une visite';
  END IF;
  IF (SELECT count(*) FROM public.cloud_ips WHERE id IN (40, 41) AND etat = 'disponible' AND user_id IS NULL AND NOT (refus ? 'beebs')) <> 2 THEN
    RAISE EXCEPTION 'IP 40 / 41 pas dans l''état attendu (disponibles, sans refus Beebs)';
  END IF;
  UPDATE public.coin_config SET value = 0, updated_at = now() WHERE key = 'cloud_ip_achats_auto';
  PERFORM public.cloud_ip_refus_noter(40, 'beebs', 'restreint', jsonb_build_object(
    'source', 'essai_me_connecter', 'le', '2026-11-04T12:40:03Z',
    'detail', '403 dès GET /fr/auth, vérification de l''appareil ratée (POST /interstitial/ 13:40:07), glissière, accès restreint',
    'fichier', 'etat/essais/beebs-2026-11-04T12-40-03-527Z-connexion.jsonl', 'note_le', 'essai GPU 04/11 soir (ordre de Nico)'));
  PERFORM public.cloud_ip_refus_noter(41, 'beebs', 'restreint', jsonb_build_object(
    'source', 'essai_me_connecter', 'le', '2026-11-04T14:44:53Z',
    'detail', '403 dès GET /fr/auth, vérification de l''appareil (POST /interstitial/ 15:44:56) → captcha, accès restreint',
    'fichier', 'etat/essais/beebs-2026-11-04T14-44-53-440Z-connexion.jsonl', 'note_le', 'essai GPU 04/11 soir (ordre de Nico)'));
END $$;
SELECT (SELECT value FROM public.coin_config WHERE key = 'cloud_ip_achats_auto') AS achats_auto,
       (SELECT string_agg(id || ':' || etat || ':' || (refus ? 'beebs')::text, ' ' ORDER BY id) FROM public.cloud_ips WHERE id IN (40, 41)) AS ips,
       (SELECT count(*) FROM public._backup_0411_essai_gpu_prep) AS sauvegardees;
COMMIT;
