-- ═══════════════════════════════════════════════════════════════════════════
-- 20261103203000_cloud_voie_place_attente — FillSell Cloud, POINTS 3 ET 5 DE NICO (03/11/2026, go de Nico)
--
-- 3. ARRÊT DU CLOUD → RETOUR SUR L'EXTENSION, AUTOMATIQUE, TOUS CANAUX (Stripe, Apple, Google, offert)
--    UNE règle en base : profiles.cloud_voie = le Cloud du compte est ACTIF (cloud_etat : essai en cours, payé,
--    offert). Plus jamais un script de réparation pour la poser ou la retirer.
--      · cloud_voie_appliquer(compte) : pose ou retire le drapeau, seulement s'il change (aucune ligne inchangée
--        réécrite). Au retrait, les tâches EN ATTENTE repartent vers l'extension (get-pending-jobs ne lit que
--        cloud_voie) sans rien qui les retienne : la marque « attente_verification_cloud » et son message (posés
--        par le serveur Cloud, verifications.js) partent, l'état « Résoudre la vérification » du Cloud
--        (platform_settings.<pf>.cloud_verification) aussi (par platform_settings_fusionner, seule voie permise).
--      · cloud_compte_synchroniser (appelée par le déclencheur profiles_cloud_pool à chaque changement de
--        is_cloud / cloud_essai_* — webhooks Stripe, Apple, Google — et par l'entretien horaire) applique la
--        règle AVANT son travail d'IP. Sa version en place est RENOMMÉE cloud_compte_synchroniser_pool, corps
--        intact (jamais recopié : une réécriture d'un autre chantier appliquée avant celle-ci est gardée), et
--        appelée par la nouvelle. Le drapeau s'écrit sur la colonne cloud_voie seule : le déclencheur (AFTER
--        UPDATE OF is_cloud, cloud_essai_*) ne se redéclenche pas.
--      · Une fin d'essai arrive SANS écriture (l'heure passe) : cloud_voies_synchroniser(), pg_cron toutes les
--        5 min (cloud-voies-5min), sur les seuls comptes candidats (drapeau levé, is_cloud, essai daté non fini),
--        une lecture de profiles (3 550 lignes le 03/11) ; rien n'est écrit si rien ne change.
-- 5. CONTRÔLE DE PLACE AVANT LA VENTE + LISTE D'ATTENTE
--      · cloud_vente_etat(compte) : vente possible = une PLACE SERVEUR (cloud_places_libres(), migration
--        20261103201000 du chantier A : capacité des serveurs vivants − comptes servis − places gardées par une
--        réservation d'IP) moins les places tenues par la liste d'attente (prévenus depuis < 24 h) et les inscrits
--        qui attendent DEVANT, ET une IP attribuable (ou la rotation). Sans place : « complet » ; sans IP :
--        « pool_vide ». Jamais une place vendue qui n'existe pas.
--      · cloud_essai_preparer_moi (réécrite depuis pg_get_functiondef en prod le 03/11, corps inchangé sinon)
--        refuse « complet » AVANT de réserver une IP : ni essai, ni paiement Stripe, ni feuille d'achat Apple /
--        Google (l'app ne l'ouvre qu'après une préparation acceptée, src/cloud/achatCloud.js).
--      · cloud_disponibilite_moi() (l'app : bouton d'achat ou « Être prévenu(e) »), cloud_attente_inscrire_moi(),
--        cloud_attente_quitter_moi().
--      · La liste d'attente = cloud_attente (déjà la trace des demandes refusées) + inscription EXPLICITE
--        (inscrit_le). Une place libre → les premiers inscrits, autant que de places, reçoivent UNE notification
--        push (fonction edge push-cloud-place, pg_cron push-cloud-place-5min, seulement s'il y a quelqu'un à
--        prévenir) et voient le bandeau dans l'app pendant 24 h. Aucun mail. Une inscription vaut 30 jours (le
--        ménage de cloud_pool_entretien, inchangé).
--
-- Rien d'autre : ni get-pending-jobs, ni l'extension, ni les fonctions d'IP, ni les quotas.
-- Application (go de Nico du 03/11 ; APRÈS 20261103201000 et 20261103202000) :
--   essai à blanc : npx supabase db query --remote -f scripts/essais/20261103203000_essai.sql   (ROLLBACK)
--   npx supabase db query --linked -f supabase/migrations/20261103203000_cloud_voie_place_attente.sql
--   npx supabase migration repair --linked --status applied 20261103203000
--   puis la fonction edge push-cloud-place (--no-verify-jwt : appelée par pg_cron, garde x-cron-secret).
-- Inverse : supabase/rollbacks/20261103203000_cloud_voie_place_attente_INVERSE.sql
-- Idempotente. db push INTERDIT.
-- ═══════════════════════════════════════════════════════════════════════════
BEGIN;
SET LOCAL lock_timeout = '5s';

-- ── 3.1 LA RÈGLE : cloud_voie = le Cloud du compte est actif ─────────────────
CREATE OR REPLACE FUNCTION public.cloud_voie_attendue(p_user uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT COALESCE((public.cloud_etat(p_user) ->> 'actif')::boolean, false);
$function$;

-- ── 3.2 L'APPLICATION POUR UN COMPTE (pose / retrait ; au retrait, les tâches rendues à l'extension) ──
CREATE OR REPLACE FUNCTION public.cloud_voie_appliquer(p_user uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_avant boolean;
  v_ps jsonb;
  v_attendue boolean;
  v_taches integer := 0;
  v_etats integer := 0;
  v_pf text;
BEGIN
  IF p_user IS NULL THEN RETURN jsonb_build_object('ok', false, 'raison', 'compte_inconnu'); END IF;
  SELECT p.cloud_voie, p.platform_settings INTO v_avant, v_ps FROM public.profiles p WHERE p.id = p_user;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'raison', 'compte_inconnu'); END IF;
  v_attendue := public.cloud_voie_attendue(p_user);
  IF v_avant IS NOT DISTINCT FROM v_attendue THEN
    RETURN jsonb_build_object('ok', true, 'change', false, 'cloud_voie', v_attendue);
  END IF;
  UPDATE public.profiles SET cloud_voie = v_attendue WHERE id = p_user AND cloud_voie IS DISTINCT FROM v_attendue;
  IF v_attendue IS FALSE THEN
    -- Les tâches en attente : plus rien du Cloud ne les retient (la marque et SON message seulement ; un autre
    -- message reste). get-pending-jobs les sert à l'ordinateur dès son prochain poll.
    UPDATE public.cross_post_jobs j
       SET error = CASE WHEN j.error IS NOT DISTINCT FROM (j.platform_fields -> 'attente_verification_cloud' ->> 'message')
                        THEN NULL ELSE j.error END,
           platform_fields = j.platform_fields - 'attente_verification_cloud'
     WHERE j.user_id = p_user AND j.status = 'pending' AND j.platform_fields ? 'attente_verification_cloud';
    GET DIAGNOSTICS v_taches = ROW_COUNT;
    -- « Résoudre la vérification » du Cloud n'a plus de sens : l'état part (lu par l'app seulement).
    FOREACH v_pf IN ARRAY ARRAY['vinted', 'leboncoin', 'beebs', 'depop'] LOOP
      IF jsonb_typeof(v_ps -> v_pf) = 'object' AND (v_ps -> v_pf) ? 'cloud_verification' THEN
        BEGIN
          PERFORM public.platform_settings_fusionner(ARRAY[v_pf], NULL, ARRAY['cloud_verification'], p_user);
          v_etats := v_etats + 1;
        EXCEPTION WHEN OTHERS THEN
          RAISE WARNING 'cloud_voie_appliquer : compte % : état de vérification % non retiré : %', p_user, v_pf, SQLERRM;
        END;
      END IF;
    END LOOP;
  END IF;
  RAISE LOG 'cloud_voie_appliquer : compte % : cloud_voie % → % (tâches rendues : %, vérifications retirées : %)',
    p_user, v_avant, v_attendue, v_taches, v_etats;
  RETURN jsonb_build_object('ok', true, 'change', true, 'cloud_voie', v_attendue,
    'taches_rendues', v_taches, 'verifications_retirees', v_etats);
END;
$function$;

-- ── 3.3 cloud_compte_synchroniser : la règle d'abord, puis le travail d'IP (corps en place, renommé) ──
DO $do$
BEGIN
  IF to_regprocedure('public.cloud_compte_synchroniser_pool(uuid)') IS NULL THEN
    ALTER FUNCTION public.cloud_compte_synchroniser(uuid) RENAME TO cloud_compte_synchroniser_pool;
  END IF;
END
$do$;

CREATE OR REPLACE FUNCTION public.cloud_compte_synchroniser(p_user uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_voie jsonb;
  v_pool jsonb;
BEGIN
  -- (03/11) Le drapeau du compte suit son état Cloud, tous canaux. Un échec ici ne bloque jamais l'IP.
  BEGIN
    v_voie := public.cloud_voie_appliquer(p_user);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'cloud_compte_synchroniser : drapeau du compte % : %', p_user, SQLERRM;
    v_voie := jsonb_build_object('ok', false, 'erreur', left(SQLERRM, 200));
  END;
  v_pool := public.cloud_compte_synchroniser_pool(p_user);
  RETURN COALESCE(v_pool, '{}'::jsonb) || jsonb_build_object('voie', v_voie);
END;
$function$;

-- ── 3.4 LES FINS D'ESSAI QUI ARRIVENT SANS ÉCRITURE : un passage toutes les 5 min ──
CREATE OR REPLACE FUNCTION public.cloud_voies_synchroniser()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  r record;
  v jsonb;
  v_vus integer := 0;
  v_changes integer := 0;
  v_echecs integer := 0;
BEGIN
  -- Les candidats : drapeau levé (à retirer peut-être), payé, essai pas encore fini (à poser peut-être).
  FOR r IN
    SELECT p.id, p.cloud_voie FROM public.profiles p
     WHERE p.cloud_voie IS TRUE OR p.is_cloud IS TRUE OR p.cloud_essai_fin > now()
     ORDER BY p.id
     LIMIT 2000
  LOOP
    v_vus := v_vus + 1;
    CONTINUE WHEN public.cloud_voie_attendue(r.id) IS NOT DISTINCT FROM r.cloud_voie;
    BEGIN
      v := public.cloud_voie_appliquer(r.id);
      IF (v ->> 'change')::boolean IS TRUE THEN v_changes := v_changes + 1; END IF;
    EXCEPTION WHEN OTHERS THEN
      v_echecs := v_echecs + 1;
      RAISE WARNING 'cloud_voies_synchroniser : compte % : %', r.id, SQLERRM;
    END;
  END LOOP;
  RETURN jsonb_build_object('vus', v_vus, 'changes', v_changes, 'echecs', v_echecs);
END;
$function$;

-- ── 5.1 LA LISTE D'ATTENTE : inscription explicite, notification une fois ────
ALTER TABLE public.cloud_attente
  ADD COLUMN IF NOT EXISTS inscrit_le timestamptz,
  ADD COLUMN IF NOT EXISTS notifie_le timestamptz,
  ADD COLUMN IF NOT EXISTS notif_statut text,
  ADD COLUMN IF NOT EXISTS notif_essais integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS notif_motif text,
  ADD COLUMN IF NOT EXISTS notif_resultat jsonb;
ALTER TABLE public.cloud_attente DROP CONSTRAINT IF EXISTS cloud_attente_notif_statut_check;
ALTER TABLE public.cloud_attente ADD CONSTRAINT cloud_attente_notif_statut_check
  CHECK (notif_statut IS NULL OR notif_statut IN ('a_envoyer', 'en_envoi', 'envoyee', 'sans_appareil', 'echec'));
CREATE INDEX IF NOT EXISTS cloud_attente_inscrits ON public.cloud_attente (inscrit_le) WHERE inscrit_le IS NOT NULL;
COMMENT ON COLUMN public.cloud_attente.inscrit_le IS
  '03/11 : inscription EXPLICITE à la liste d''attente du Cloud (bouton « Être prévenu(e) ») ; NULL = simple trace d''une demande refusée.';
COMMENT ON COLUMN public.cloud_attente.notifie_le IS
  '03/11 : prévenu(e) qu''une place est libre (push + bandeau) ; la place lui est gardée 24 h.';

-- ── 5.2 LA VENTE EST-ELLE POSSIBLE POUR CE COMPTE ? (place serveur ET IP) ──────
CREATE OR REPLACE FUNCTION public.cloud_vente_etat(p_user uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_rotation boolean := public.cloud_param('ip_rotation', 0) = 1;
  v_trouve boolean;
  v_debut timestamptz;
  v_nature text;
  v_libres integer := 0;
  v_sa_resa boolean;
  v_inscrit timestamptz;
  v_tenues integer;
  v_devant integer;
  v_places integer;
  v_ip boolean;
BEGIN
  IF p_user IS NULL THEN RETURN jsonb_build_object('vente_possible', false, 'raison', 'compte_inconnu'); END IF;
  SELECT true, p.cloud_essai_debut INTO v_trouve, v_debut FROM public.profiles p WHERE p.id = p_user;
  IF v_trouve IS NOT TRUE THEN RETURN jsonb_build_object('vente_possible', false, 'raison', 'compte_inconnu'); END IF;
  IF public.cloud_voie_attendue(p_user) THEN
    RETURN jsonb_build_object('vente_possible', false, 'raison', 'deja_client');
  END IF;
  v_nature := CASE WHEN v_debut IS NULL THEN 'essai' ELSE 'client' END;
  -- 1. La place serveur (chantier A). Fonction absente = capacité inconnue = pas de vente.
  IF to_regprocedure('public.cloud_places_libres()') IS NOT NULL THEN
    v_libres := COALESCE(public.cloud_places_libres(), 0);
  END IF;
  -- Sa propre réservation d'IP (préparation en cours) est déjà retirée des places libres : elle lui revient.
  v_sa_resa := EXISTS (SELECT 1 FROM public.cloud_ips i
                        WHERE i.reserve_pour = p_user AND i.reserve_jusqu_au > now() AND i.user_id IS NULL);
  SELECT a.inscrit_le INTO v_inscrit FROM public.cloud_attente a WHERE a.user_id = p_user;
  -- Les places gardées 24 h aux inscrits prévenus (sans réservation d'IP : sinon déjà comptées).
  SELECT count(*)::int INTO v_tenues FROM public.cloud_attente a
   WHERE a.user_id <> p_user AND a.inscrit_le IS NOT NULL AND a.notifie_le > now() - interval '24 hours'
     AND NOT EXISTS (SELECT 1 FROM public.cloud_ips i WHERE i.reserve_pour = a.user_id AND i.reserve_jusqu_au > now());
  -- La file : les inscrits pas encore prévenus passent avant (tous, pour un compte qui n'est pas inscrit).
  SELECT count(*)::int INTO v_devant FROM public.cloud_attente a
   WHERE a.user_id <> p_user AND a.inscrit_le IS NOT NULL AND a.notifie_le IS NULL
     AND (v_inscrit IS NULL OR a.inscrit_le < v_inscrit);
  v_places := v_libres + (CASE WHEN v_sa_resa THEN 1 ELSE 0 END) - v_tenues - v_devant;
  -- 2. L'IP : la sienne, sa réservation, une IP au repos qui lui revient, ou une libre attribuable (rotation : toujours).
  v_ip := v_rotation OR EXISTS (
    SELECT 1 FROM public.cloud_ips i
     WHERE i.user_id = p_user
        OR (i.reserve_pour = p_user AND i.reserve_jusqu_au > now())
        OR (i.etat IN ('disponible', 'repos') AND public.cloud_ip_attribuable(i, p_user, v_nature)));
  RETURN jsonb_build_object(
    'vente_possible', v_places > 0 AND v_ip,
    'raison', CASE WHEN v_places <= 0 THEN 'complet' WHEN NOT v_ip THEN 'pool_vide' ELSE NULL END,
    'places', GREATEST(v_places, 0),
    'ip', v_ip,
    'nature', v_nature);
END;
$function$;

-- ── 5.3 LA PRÉPARATION (réécrite depuis la prod du 03/11) : « complet » avant toute IP réservée ──
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
  v_vente jsonb;
BEGIN
  SELECT true, p.is_cloud, p.cloud_essai_debut INTO v_trouve, v_cloud, v_debut FROM public.profiles p WHERE p.id = v_user;
  IF v_trouve IS NOT TRUE THEN RETURN jsonb_build_object('ok', false, 'raison', 'compte_inconnu'); END IF;
  IF v_cloud IS TRUE THEN RETURN jsonb_build_object('ok', false, 'raison', 'deja_client'); END IF;
  -- (03/11, point 5) La PLACE SERVEUR d'abord (et la file d'attente) : sans elle, rien ne démarre.
  v_vente := public.cloud_vente_etat(v_user);
  IF v_vente ->> 'raison' = 'complet' THEN
    INSERT INTO public.cloud_attente AS a (user_id) VALUES (v_user)
    ON CONFLICT (user_id) DO UPDATE SET derniere_le = now(), essais = a.essais + 1;
    RETURN jsonb_build_object('ok', false, 'raison', 'complet',
      'inscrit', EXISTS (SELECT 1 FROM public.cloud_attente WHERE user_id = v_user AND inscrit_le IS NOT NULL));
  END IF;
  -- La place d'abord : sans IP, rien ne démarre (ni essai, ni paiement) — sauf en rotation (30/10, lot D).
  IF NOT v_rotation THEN
    v_ip := public.cloud_ip_reserver(v_user);
    IF v_ip IS NULL THEN
      INSERT INTO public.cloud_attente AS a (user_id) VALUES (v_user)
      ON CONFLICT (user_id) DO UPDATE SET derniere_le = now(), essais = a.essais + 1;
      RETURN jsonb_build_object('ok', false, 'raison', 'pool_vide',
        'inscrit', EXISTS (SELECT 1 FROM public.cloud_attente WHERE user_id = v_user AND inscrit_le IS NOT NULL));
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

-- ── 5.4 L'APP : disponibilité, inscription, sortie de la liste ────────────────
CREATE OR REPLACE FUNCTION public.cloud_disponibilite_moi()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_vente jsonb;
  a public.cloud_attente%ROWTYPE;
  v_rang integer;
BEGIN
  IF v_user IS NULL THEN RETURN jsonb_build_object('vente_possible', false, 'raison', 'compte_inconnu'); END IF;
  v_vente := public.cloud_vente_etat(v_user);
  SELECT * INTO a FROM public.cloud_attente WHERE user_id = v_user;
  IF a.inscrit_le IS NOT NULL AND a.notifie_le IS NULL THEN
    SELECT count(*)::int + 1 INTO v_rang FROM public.cloud_attente x
     WHERE x.inscrit_le IS NOT NULL AND x.notifie_le IS NULL AND x.inscrit_le < a.inscrit_le;
  END IF;
  RETURN v_vente || jsonb_build_object('attente', jsonb_build_object(
    'inscrit', a.inscrit_le IS NOT NULL,
    'inscrit_le', a.inscrit_le,
    'notifie_le', a.notifie_le,
    'rang', v_rang,
    'place_pour_toi', a.inscrit_le IS NOT NULL AND a.notifie_le > now() - interval '24 hours'
                      AND COALESCE((v_vente ->> 'vente_possible')::boolean, false)));
END;
$function$;

CREATE OR REPLACE FUNCTION public.cloud_attente_inscrire_moi()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user uuid := auth.uid();
BEGIN
  IF v_user IS NULL OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_user) THEN
    RETURN jsonb_build_object('ok', false, 'raison', 'compte_inconnu');
  END IF;
  IF public.cloud_voie_attendue(v_user) THEN RETURN jsonb_build_object('ok', false, 'raison', 'deja_client'); END IF;
  -- Déjà inscrit(e) et pas encore prévenu(e) : sa place dans la file ne bouge pas. Prévenu(e) avant : nouvelle
  -- inscription, en fin de file, une notification de plus permise.
  INSERT INTO public.cloud_attente AS a (user_id, inscrit_le) VALUES (v_user, now())
  ON CONFLICT (user_id) DO UPDATE
    SET inscrit_le = CASE WHEN a.inscrit_le IS NOT NULL AND a.notifie_le IS NULL THEN a.inscrit_le ELSE now() END,
        notifie_le = CASE WHEN a.inscrit_le IS NOT NULL AND a.notifie_le IS NULL THEN a.notifie_le ELSE NULL END,
        notif_statut = CASE WHEN a.inscrit_le IS NOT NULL AND a.notifie_le IS NULL THEN a.notif_statut ELSE NULL END,
        notif_essais = CASE WHEN a.inscrit_le IS NOT NULL AND a.notifie_le IS NULL THEN a.notif_essais ELSE 0 END,
        derniere_le = now();
  RETURN jsonb_build_object('ok', true) || public.cloud_disponibilite_moi();
END;
$function$;

CREATE OR REPLACE FUNCTION public.cloud_attente_quitter_moi()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN RETURN jsonb_build_object('ok', false, 'raison', 'compte_inconnu'); END IF;
  UPDATE public.cloud_attente
     SET inscrit_le = NULL, notifie_le = NULL, notif_statut = NULL, notif_essais = 0
   WHERE user_id = auth.uid() AND inscrit_le IS NOT NULL;
  RETURN jsonb_build_object('ok', true);
END;
$function$;

-- ── 5.5 LA NOTIFICATION (push-cloud-place, clé de service) ────────────────────
-- Combien d'inscrits prévenir maintenant : les places libres (serveur ET IP) moins celles déjà gardées 24 h.
CREATE OR REPLACE FUNCTION public.cloud_attente_places_a_offrir()
 RETURNS integer
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_libres integer := 0;
  v_tenues integer;
  v_ips integer;
BEGIN
  IF to_regprocedure('public.cloud_places_libres()') IS NOT NULL THEN
    v_libres := COALESCE(public.cloud_places_libres(), 0);
  END IF;
  SELECT count(*)::int INTO v_tenues FROM public.cloud_attente a
   WHERE a.inscrit_le IS NOT NULL AND a.notifie_le > now() - interval '24 hours'
     AND NOT EXISTS (SELECT 1 FROM public.cloud_ips i WHERE i.reserve_pour = a.user_id AND i.reserve_jusqu_au > now());
  IF public.cloud_param('ip_rotation', 0) = 1 THEN
    v_ips := v_libres;
  ELSE
    SELECT count(*)::int INTO v_ips FROM public.cloud_ips i
     WHERE i.etat = 'disponible' AND public.cloud_ip_attribuable(i, NULL, 'essai');
  END IF;
  RETURN GREATEST(LEAST(v_libres, v_ips) - v_tenues, 0);
END;
$function$;

CREATE OR REPLACE FUNCTION public.cloud_attente_a_prevenir_existe()
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  -- Un renvoi en attente (échec passager), ou un inscrit à prévenir ET une place à offrir. Jamais d'erreur (cron).
  IF EXISTS (SELECT 1 FROM public.cloud_attente WHERE notif_statut = 'a_envoyer' AND notif_essais < 3) THEN RETURN true; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.cloud_attente WHERE inscrit_le IS NOT NULL AND notifie_le IS NULL) THEN RETURN false; END IF;
  RETURN public.cloud_attente_places_a_offrir() > 0;
EXCEPTION WHEN OTHERS THEN
  RETURN false;
END;
$function$;

CREATE OR REPLACE FUNCTION public.cloud_attente_a_prevenir(p_limite integer DEFAULT 20)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_n integer;
  r record;
  v_app jsonb;
  v_lang text;
  v_out jsonb := '[]'::jsonb;
BEGIN
  -- Un seul passage à la fois (deux crons qui se chevauchent ne préviennent jamais deux fois la même place).
  IF NOT pg_try_advisory_xact_lock(hashtextextended('cloud_attente_a_prevenir', 0)) THEN RETURN v_out; END IF;
  -- 1. Les renvois (échec passager, 3 essais au plus) : leur place est déjà gardée depuis notifie_le.
  FOR r IN SELECT a.user_id FROM public.cloud_attente a
            WHERE a.notif_statut = 'a_envoyer' AND a.notif_essais < 3
            ORDER BY a.notifie_le LIMIT GREATEST(COALESCE(p_limite, 20), 1) FOR UPDATE SKIP LOCKED LOOP
    SELECT COALESCE(jsonb_agg(jsonb_build_object('id', ap.id, 'plateforme', ap.plateforme, 'jeton', ap.jeton,
                                                 'apns_env', ap.apns_env)), '[]'::jsonb)
      INTO v_app FROM public.appareils_push ap WHERE ap.user_id = r.user_id;
    SELECT COALESCE(p.lang, 'fr') INTO v_lang FROM public.profiles p WHERE p.id = r.user_id;
    UPDATE public.cloud_attente SET notif_statut = CASE WHEN jsonb_array_length(v_app) = 0 THEN 'sans_appareil' ELSE 'en_envoi' END,
           notif_essais = notif_essais + 1 WHERE user_id = r.user_id;
    IF jsonb_array_length(v_app) > 0 THEN
      v_out := v_out || jsonb_build_array(jsonb_build_object('id', r.user_id, 'user_id', r.user_id, 'appareils', v_app, 'lang', v_lang));
    END IF;
  END LOOP;
  -- 2. Les nouveaux : autant d'inscrits (les plus anciens d'abord) que de places à offrir.
  v_n := LEAST(public.cloud_attente_places_a_offrir(), GREATEST(COALESCE(p_limite, 20), 1));
  IF v_n > 0 THEN
    FOR r IN SELECT a.user_id FROM public.cloud_attente a
              WHERE a.inscrit_le IS NOT NULL AND a.notifie_le IS NULL
                AND NOT public.cloud_voie_attendue(a.user_id)
              ORDER BY a.inscrit_le LIMIT v_n FOR UPDATE SKIP LOCKED LOOP
      SELECT COALESCE(jsonb_agg(jsonb_build_object('id', ap.id, 'plateforme', ap.plateforme, 'jeton', ap.jeton,
                                                   'apns_env', ap.apns_env)), '[]'::jsonb)
        INTO v_app FROM public.appareils_push ap WHERE ap.user_id = r.user_id;
      SELECT COALESCE(p.lang, 'fr') INTO v_lang FROM public.profiles p WHERE p.id = r.user_id;
      -- La place est gardée dès maintenant (24 h), push ou non : le bandeau de l'app la montre.
      UPDATE public.cloud_attente
         SET notifie_le = now(), derniere_le = now(), notif_essais = 1,
             notif_statut = CASE WHEN jsonb_array_length(v_app) = 0 THEN 'sans_appareil' ELSE 'en_envoi' END
       WHERE user_id = r.user_id;
      IF jsonb_array_length(v_app) > 0 THEN
        v_out := v_out || jsonb_build_array(jsonb_build_object('id', r.user_id, 'user_id', r.user_id, 'appareils', v_app, 'lang', v_lang));
      END IF;
    END LOOP;
  END IF;
  RETURN v_out;
END;
$function$;

CREATE OR REPLACE FUNCTION public.cloud_attente_resultat(p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  x jsonb;
  v jsonb;
BEGIN
  FOR x IN SELECT value FROM jsonb_array_elements(COALESCE(p -> 'notes', '[]'::jsonb)) LOOP
    UPDATE public.cloud_attente SET
      notif_statut = CASE x ->> 'statut'
                       WHEN 'envoyee' THEN 'envoyee'
                       WHEN 'a_reessayer' THEN CASE WHEN notif_essais >= 3 THEN 'echec' ELSE 'a_envoyer' END
                       ELSE 'echec' END,
      notif_motif = NULLIF(x ->> 'motif', ''),
      notif_resultat = x -> 'resultat'
    WHERE user_id = (x ->> 'id')::uuid AND notif_statut = 'en_envoi';
  END LOOP;
  -- Les jetons morts sont oubliés comme pour une vente (une seule règle : push_ventes_resultat).
  v := public.push_ventes_resultat(jsonb_build_object(
         'notes', '[]'::jsonb,
         'invalides', COALESCE(p -> 'invalides', '[]'::jsonb), 'ok', COALESCE(p -> 'ok', '[]'::jsonb),
         'sandbox', COALESCE(p -> 'sandbox', '[]'::jsonb), 'echecs', COALESCE(p -> 'echecs', '[]'::jsonb)));
  RETURN jsonb_build_object('ok', true, 'appareils_oublies', COALESCE((v ->> 'appareils_oublies')::integer, 0));
END;
$function$;

-- ── DROITS : l'app n'a que ses trois fonctions « _moi » ; le reste, la clé de service ─────────
REVOKE ALL ON FUNCTION public.cloud_voie_attendue(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cloud_voie_appliquer(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cloud_compte_synchroniser(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cloud_compte_synchroniser_pool(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cloud_voies_synchroniser() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cloud_vente_etat(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cloud_attente_places_a_offrir() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cloud_attente_a_prevenir_existe() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cloud_attente_a_prevenir(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cloud_attente_resultat(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cloud_voie_attendue(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.cloud_voie_appliquer(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.cloud_compte_synchroniser(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.cloud_compte_synchroniser_pool(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.cloud_voies_synchroniser() TO service_role;
GRANT EXECUTE ON FUNCTION public.cloud_vente_etat(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.cloud_attente_places_a_offrir() TO service_role;
GRANT EXECUTE ON FUNCTION public.cloud_attente_a_prevenir_existe() TO service_role;
GRANT EXECUTE ON FUNCTION public.cloud_attente_a_prevenir(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.cloud_attente_resultat(jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.cloud_essai_preparer_moi(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cloud_disponibilite_moi() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cloud_attente_inscrire_moi() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cloud_attente_quitter_moi() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cloud_essai_preparer_moi(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cloud_disponibilite_moi() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cloud_attente_inscrire_moi() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cloud_attente_quitter_moi() TO authenticated, service_role;

-- ── LES DEUX RÉVEILS ──────────────────────────────────────────────────────────
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'cloud-voies-5min';
SELECT cron.schedule('cloud-voies-5min', '*/5 * * * *', $cron$ SELECT public.cloud_voies_synchroniser(); $cron$);
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'push-cloud-place-5min';
SELECT cron.schedule('push-cloud-place-5min', '*/5 * * * *', $cron$
  SELECT net.http_post(
    url     := 'https://tojihnuawsoohlolangc.supabase.co/functions/v1/push-cloud-place',
    headers := ('{"Content-Type":"application/json"}'::jsonb || jsonb_build_object('x-cron-secret', public.cron_secret())),
    body    := '{"trigger":"push_cloud_place_cron"}'::jsonb,
    timeout_milliseconds := 60000
  )
  WHERE public.cloud_attente_a_prevenir_existe();
$cron$);

-- ── LA RÈGLE APPLIQUÉE UNE FOIS À TOUT LE PARC (03/11 : le compte de Nico, offert, reste à vrai) ──
SELECT public.cloud_voies_synchroniser();

COMMIT;

-- ═══ VÉRIFICATIONS (après application, lecture seule)
-- select id, cloud_voie, public.cloud_voie_attendue(id) from profiles where cloud_voie or is_cloud or cloud_essai_fin > now();
-- select jobid, jobname, schedule, active from cron.job where jobname in ('cloud-voies-5min', 'push-cloud-place-5min');
-- select proname from pg_proc where proname in ('cloud_compte_synchroniser', 'cloud_compte_synchroniser_pool');
-- select public.cloud_vente_etat('<compte>');
