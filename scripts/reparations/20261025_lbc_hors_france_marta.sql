-- ═══════════════════════════════════════════════════════════════════════════
-- RÉPARATION 25/10 — Marta (mele.marta@gmail.com, ac19c8c9-586a-4f76-a0fc-55e4e59ab3c3) :
-- LEBONCOIN RÉSERVÉ AUX ADRESSES EN FRANCE (décision de Nico, 25/10)
-- ═══════════════════════════════════════════════════════════════════════════
-- « Pas de Leboncoin pour les adresses hors de France (cas Marta, Italie) : la plateforme ne doit plus être proposée
-- ni tentée pour ces comptes. Ses dépôts Leboncoin en attente sont à clore proprement, sans alarme. »
-- Constat (relu le 25/10 à 10:12, heure de Paris) : adresse de remise « Via CANALE 24 C 16035 RAPALLO » — 16035
-- n'est pas dans la base officielle des codes postaux français (geo.api.gouv.fr, _shared/codes-postaux-fr.js).
-- 0 dépôt Leboncoin réussi sur 52 depuis le 24/10 11:44 (« … sans suggestion dans l'autocomplete Leboncoin »).
-- 34 en file (pending), 3 déjà en needs_user « relancer » (« … écris-nous, on regarde avec toi »), 1 en cours
-- (processing : LAISSÉ, le poste le tient — la règle de get-pending-jobs le clôt quand il retombe).
-- CE SCRIPT, pour ses publications/republications Leboncoin SANS annonce (ni lien, ni identifiant), en pending,
-- needs_user ou failed — jamais le processing, jamais un retrait, jamais une republication dont le retrait a
-- commencé :
--   · status 'cancelled', le message de Nico, la marque platform_fields.lbc_hors_france {le, par, statut_avant,
--     source_avant, preuve: '16035'} et hors_quota — la MÊME forme que get-pending-jobs
--     (_shared/lbc-adresse-france.js, clotureLbcHorsFrance) ; jamais arret_utilisateur (« à ta demande » serait faux) ;
--   · l'ancienne erreur archivée (erreurs_archivees) ; sans needs_user_source, next_action_after, processing_since.
-- ⛔ Garde : le code postal du profil est TOUJOURS 16035 au moment du geste, sinon rien n'est fait. Le nombre de
--    lignes closes doit être EXACTEMENT celui de la sauvegarde (une ligne qui a bougé entre-temps = tout annulé).
-- Rien n'est publié ni retiré, rien n'est envoyé à Leboncoin ; aucune réservation (0 sur ces jobs) ; 0 mail, 0 push
-- (aucun déclencheur de mail ni de push sur 'cancelled' d'une publication — relu en fin de script).
-- Sauvegarde : _backup_2510_lbc_hors_france_marta (RLS activée, droits retirés).
-- Inverse : 20261025_lbc_hors_france_marta_INVERSE.sql.
-- ⛔ ÉCRIT, JAMAIS LANCÉ par l'agent : feu vert de Nico, puis
--    npx supabase db query --linked -f scripts/reparations/20261025_lbc_hors_france_marta.sql
BEGIN;
SET LOCAL statement_timeout = '60s';
CREATE TABLE IF NOT EXISTS public._backup_2510_lbc_hors_france_marta AS
  SELECT now() AS sauvegarde_le, c.* FROM public.cross_post_jobs c WHERE false;
ALTER TABLE public._backup_2510_lbc_hors_france_marta ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_2510_lbc_hors_france_marta FROM PUBLIC, anon, authenticated;

-- La cible, sauvegardée telle qu'elle est AU MOMENT du geste (now() est fixe dans la transaction : il signe ce passage).
INSERT INTO public._backup_2510_lbc_hors_france_marta
SELECT now(), c.* FROM public.cross_post_jobs c
 WHERE c.user_id = 'ac19c8c9-586a-4f76-a0fc-55e4e59ab3c3'
   AND c.platform = 'leboncoin'
   AND COALESCE(NULLIF(c.action, ''), 'publish') IN ('publish', 'republish')
   AND c.status IN ('pending', 'needs_user', 'failed')
   AND NULLIF(btrim(COALESCE(c.listing_url, '')), '') IS NULL
   AND NULLIF(btrim(COALESCE(c.platform_listing_id, '')), '') IS NULL
   AND COALESCE(c.platform_fields->>'republish_step', '') <> 'deleted'
   AND NOT (COALESCE(c.platform_fields, '{}'::jsonb) ?| ARRAY['deleted_at', 'republish_suppression_envoyee'])
   AND COALESCE(c.error, '') !~ 'Suppression envoyée à';

DO $$
DECLARE
  v_user   constant uuid := 'ac19c8c9-586a-4f76-a0fc-55e4e59ab3c3';
  v_par    constant text := 'scripts/reparations/20261025_lbc_hors_france_marta.sql';
  v_msg    constant text := 'Leboncoin n''accepte que les adresses en France. Ton adresse de remise est hors de France : '
                         || 'FillSell ne publie donc pas sur Leboncoin pour ton compte. Rien n''a été publié, et tes autres '
                         || 'plateformes continuent normalement.';
  v_sauves integer;
  n        integer;
BEGIN
  -- La garde, relue AU MOMENT du geste : l'adresse de remise est toujours 16035 (Rapallo).
  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = v_user
                   AND btrim(COALESCE(p.platform_settings->'leboncoin'->>'code_postal', '')) = '16035') THEN
    RAISE EXCEPTION 'le code postal de l''adresse de remise n''est plus 16035 — rien n''est fait';
  END IF;
  SELECT count(*) INTO v_sauves FROM public._backup_2510_lbc_hors_france_marta b WHERE b.sauvegarde_le = now();
  -- Borne : 52 jobs Leboncoin au total sur ce compte ; 37 à clore le 25/10 à 10:12 (34 pending + 3 needs_user).
  IF v_sauves < 1 OR v_sauves > 60 THEN
    RAISE EXCEPTION 'attendu entre 1 et 60 jobs Leboncoin à clore, trouvé % — rien n''est fait', v_sauves;
  END IF;
  UPDATE public.cross_post_jobs c
     SET status = 'cancelled',
         error = v_msg,
         platform_fields = (COALESCE(c.platform_fields, '{}'::jsonb) - 'needs_user_source' - 'next_action_after' - 'processing_since')
           || jsonb_build_object(
                'lbc_hors_france', jsonb_build_object('le', now(), 'par', v_par, 'statut_avant', c.status,
                                                      'source_avant', c.platform_fields->'needs_user_source', 'preuve', '16035'),
                'hors_quota', true,
                'erreurs_archivees', COALESCE(CASE WHEN jsonb_typeof(c.platform_fields->'erreurs_archivees') = 'array'
                                                   THEN c.platform_fields->'erreurs_archivees' END, '[]'::jsonb)
                  || CASE WHEN NULLIF(btrim(COALESCE(c.error, '')), '') IS NULL THEN '[]'::jsonb
                          ELSE jsonb_build_array(jsonb_build_object('le', now(), 'statut', c.status, 'erreur', left(c.error, 600),
                                 'par', 'réparation 25/10 : Leboncoin hors de France (16035 Rapallo)')) END)
    FROM public._backup_2510_lbc_hors_france_marta b
   WHERE c.id = b.id AND b.sauvegarde_le = now()
     AND c.user_id = v_user AND c.platform = 'leboncoin'
     AND c.status = b.status AND c.status IN ('pending', 'needs_user', 'failed');
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> v_sauves THEN
    RAISE EXCEPTION 'attendu % jobs clos (la sauvegarde), obtenu % — une ligne a bougé entre-temps, rien n''est fait', v_sauves, n;
  END IF;
  RAISE NOTICE '% job(s) Leboncoin de Marta clos (hors de France) — sauvegardés dans _backup_2510_lbc_hors_france_marta', n;
END $$;

-- Relecture (heure de Paris) : ce qui reste vivant sur Leboncoin pour ce compte, et aucun mail parti.
SELECT c.status, count(*) AS n,
       count(*) FILTER (WHERE c.platform_fields ? 'lbc_hors_france') AS marques_hors_france,
       to_char(max(c.created_at) AT TIME ZONE 'Europe/Paris', 'DD/MM HH24:MI') AS dernier_cree
  FROM public.cross_post_jobs c
 WHERE c.user_id = 'ac19c8c9-586a-4f76-a0fc-55e4e59ab3c3' AND c.platform = 'leboncoin'
 GROUP BY c.status ORDER BY c.status;
SELECT (SELECT count(*) FROM public.email_logs e
         WHERE e.user_id = 'ac19c8c9-586a-4f76-a0fc-55e4e59ab3c3' AND e.sent_at > now() - interval '5 minutes') AS mails_5min,
       (SELECT count(*) FROM public._backup_2510_lbc_hors_france_marta) AS lignes_sauvegardees;
COMMIT;
