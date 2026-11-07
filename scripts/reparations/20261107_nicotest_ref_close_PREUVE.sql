-- PREUVE EN BASE (07/11/2026 soir) — à lancer APRÈS la migration 20261107200000 ET le geste
-- scripts/reparations/20261107_nicotest_ref_close.sql. RIEN N'EST ÉCRIT : le bloc rejoue sur Nicotest l'UPDATE EXACT
-- qu'écrit apple-iap-webhook pour un DID_RENEW (ecritureCloudStore, sens « on », lecture payée :
-- cloud_canal, cloud_ref, cloud_periode_fin, cloud_arret_fin_periode = false, is_cloud = true), relit le compte, son IP,
-- ses réservations, sa place, puis lève TOUJOURS une exception « PREUVE » : la transaction entière est annulée
-- (profil, IP, journal), et le message porte le résultat.
-- Attendu : « PREUVE … {"ok": true, …} » avec is_cloud false, actif false, ip_tenue 0, reservee 0, servi false,
-- evenements_ip 0, journal 1, periode_fin inchangée. « ok": false » = la garde n'a PAS tenu (à dire à Nico).
DO $preuve$
DECLARE
  c_user CONSTANT uuid := '5322fa18-c194-458b-a222-7ee4093c4968';
  c_ref  CONSTANT text := '2000001262935799';
  v_avant jsonb; v_apres jsonb; v_t0 timestamptz := clock_timestamp();
  v_ip int; v_res int; v_serv boolean; v_ev int; v_j int; v_close boolean; v_trg boolean;
BEGIN
  SELECT EXISTS (SELECT 1 FROM public.cloud_refs_closes WHERE ref = c_ref) INTO v_close;
  SELECT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'profiles_zz_cloud_ref_close' AND tgrelid = 'public.profiles'::regclass)
    INTO v_trg;
  SELECT jsonb_build_object('is_cloud', is_cloud, 'canal', cloud_canal, 'ref', cloud_ref, 'periode_fin', cloud_periode_fin,
           'essai_fin', cloud_essai_fin, 'essai_arrete', cloud_essai_arrete, 'actif', public.cloud_etat(id) ->> 'actif')
    INTO v_avant FROM public.profiles WHERE id = c_user;
  -- L'UPDATE exact du DID_RENEW (bac à sable : période de 5 min)
  UPDATE public.profiles
     SET cloud_canal = 'apple', cloud_ref = c_ref, cloud_periode_fin = now() + interval '5 minutes',
         cloud_arret_fin_periode = false, is_cloud = true
   WHERE id = c_user;
  SELECT jsonb_build_object('is_cloud', is_cloud, 'canal', cloud_canal, 'ref', cloud_ref, 'periode_fin', cloud_periode_fin,
           'essai_fin', cloud_essai_fin, 'essai_arrete', cloud_essai_arrete, 'actif', public.cloud_etat(id) ->> 'actif')
    INTO v_apres FROM public.profiles WHERE id = c_user;
  SELECT count(*) INTO v_ip FROM public.cloud_ips WHERE user_id = c_user;
  SELECT count(*) INTO v_res FROM public.cloud_ips WHERE reserve_pour = c_user AND reserve_jusqu_au > now();
  SELECT EXISTS (SELECT 1 FROM public.cloud_comptes_a_servir() s WHERE s.user_id = c_user) INTO v_serv;
  SELECT count(*) INTO v_ev FROM public.cloud_ip_evenements WHERE user_id = c_user AND le >= v_t0;
  SELECT count(*) INTO v_j FROM public.stores_notifications_journal
   WHERE type = 'CLOUD_REF_CLOSE' AND user_id = c_user AND recu_le >= now();   -- now() = début de CETTE transaction
  RAISE EXCEPTION 'PREUVE (transaction annulée, rien écrit) : %', jsonb_build_object(
    'ok', v_close AND v_trg AND (v_apres ->> 'is_cloud')::boolean IS NOT TRUE AND v_apres ->> 'actif' = 'false'
          AND v_apres = v_avant AND v_ip = 0 AND v_res = 0 AND NOT v_serv AND v_ev = 0 AND v_j = 1,
    'ref_close', v_close, 'declencheur', v_trg, 'avant', v_avant, 'apres', v_apres,
    'ip_tenue', v_ip, 'reservee', v_res, 'servi', v_serv, 'evenements_ip', v_ev, 'journal', v_j);
END
$preuve$;
