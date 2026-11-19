-- ═══════════════════════════════════════════════════════════════════════════
-- 20261119180000 — UNE QUESTION SUR UNE ANNONCE VENDUE ENCORE EN LIGNE EST RELANCÉE DANS L'APP (bandeau + push), PAS UN MAIL
-- (19/11/2026, terminal t5, décision de Nico : « aucune double vente » — PRÉPARÉE, NON APPLIQUÉE : feu vert ; interrupteur à 0)
-- ═══════════════════════════════════════════════════════════════════════════
-- Constat du 19/11 (lecture seule) : 87 annonces d'articles vendus vues en ligne après la vente (32 comptes) ; 72 attendent
-- une réponse de la personne (« À régler — Retirer / Plus tard », « Déjà vendu ? ») et rien ne la relance ; 69 ont été
-- revues en ligne APRÈS la question (26 comptes). « Plus tard » disait « la question ne revient plus ».
-- LA RÈGLE : supabase/functions/_shared/rappel-encore-en-ligne.js (pure ; le bandeau de l'app et le push de push-ventes).
-- Ici, la base :
--   1. coin_config rappel_encore_en_ligne_actif = 0 (Nico l'allume ; 0 = ni bandeau ni push) ;
--   2. encore_en_ligne_questions(p_user, p_limite) (serveur) : les questions OUVERTES d'un article vendu — tâche annulée
--      + pending_removal, ou copie_non_prouvee « proposee » — avec le numéro, la plateforme de la vente, la dernière vue en
--      ligne du MÊME numéro (relevé ou veille), le report « Plus tard » ; jamais Opla, jamais sans numéro, jamais une
--      annonce dont un retrait est en file ou fait depuis la question ;
--   3. encore_en_ligne_mes_questions() (la personne, sa session) : les mêmes, pour SON compte, et l'interrupteur ;
--   4. un index partiel des tâches « pending_removal » (158 lignes sur 236 670 le 19/11 ; la lecture du parc passe de
--      1,05 s à quelques ms) ;
--   5. le réveil push-rappels-encore-en-ligne (toutes les 15 min, seulement si l'interrupteur est à 1 et qu'une question
--      est ouverte) → push-ventes, corps {"trigger":"rappels_encore_en_ligne_cron"} (secret : public.cron_secret()).
-- Verrou : npm run selftest:rappel-encore-en-ligne. Inverse : supabase/rollbacks/20261119180000_rappel_encore_en_ligne_INVERSE.sql.
-- Appliquer (feu vert) : npx supabase db query --linked -f supabase/migrations/20261119180000_rappel_encore_en_ligne.sql
--                        npx supabase migration repair --linked --status applied 20261119180000
BEGIN;
SET LOCAL statement_timeout = '120s';
SET LOCAL lock_timeout = '5s';

INSERT INTO public.coin_config (key, value) VALUES ('rappel_encore_en_ligne_actif', 0) ON CONFLICT (key) DO NOTHING;

CREATE INDEX IF NOT EXISTS cross_post_jobs_pending_removal_idx ON public.cross_post_jobs (user_id)
  WHERE status = 'cancelled' AND (platform_fields ->> 'pending_removal') = 'true';

CREATE OR REPLACE FUNCTION public.encore_en_ligne_questions(p_user uuid, p_limite integer DEFAULT 500)
 RETURNS SETOF jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT to_jsonb(r) FROM (
  WITH aregler AS (
    SELECT 'job:' || j.id AS cle, 'a_regler'::text AS sorte, j.user_id, j.inventaire_id AS fiche, j.platform,
           NULLIF(btrim(COALESCE(j.platform_listing_id, '')), '') AS listing, NULLIF(btrim(COALESCE(j.listing_url, '')), '') AS url,
           COALESCE(NULLIF(btrim(COALESCE(j.title, '')), ''), i.titre) AS titre,
           COALESCE(NULLIF(j.platform_fields #>> '{vendu_encore_en_ligne,at}', ''), NULLIF(j.platform_fields #>> '{rattachement,at}', ''), j.created_at::text)::timestamptz AS question_le,
           NULLIF(j.platform_fields ->> 'pending_removal_reporte_le', '')::timestamptz AS report_le,
           COALESCE(NULLIF(j.platform_fields ->> 'pending_removal_reporte_jours', ''), '0') ~ '^[1-9][0-9]*$' AS report_borne,
           jsonb_build_object('id', j.id, 'platform', j.platform, 'title', j.title, 'inventaire_id', j.inventaire_id,
                              'listing_url', j.listing_url, 'platform_listing_id', j.platform_listing_id, 'platform_fields', j.platform_fields) AS job
      FROM public.cross_post_jobs j
      JOIN public.inventaire i ON i.id = j.inventaire_id AND i.user_id = j.user_id
     WHERE (p_user IS NULL OR j.user_id = p_user)
       AND j.status = 'cancelled' AND COALESCE(j.action, 'publish') IN ('publish', 'republish')
       AND (j.platform_fields ->> 'pending_removal') = 'true'
       AND i.fusionne_dans IS NULL AND (i.statut = 'vendu' OR COALESCE(i.quantite, 1) <= 0)
       AND j.platform <> 'opla'
  ), dv AS (
    SELECT 'question:' || q.id, 'deja_vendu'::text, q.user_id, q.garde, COALESCE(NULLIF(q.preuves ->> 'platform', ''), j.platform),
           COALESCE(NULLIF(btrim(COALESCE(q.preuves ->> 'listing_id', '')), ''), NULLIF(btrim(COALESCE(j.platform_listing_id, '')), '')),
           COALESCE(NULLIF(btrim(COALESCE(q.preuves ->> 'url', '')), ''), NULLIF(btrim(COALESCE(j.listing_url, '')), '')),
           COALESCE(NULLIF(btrim(COALESCE(q.preuves ->> 'titre', '')), ''), i.titre),
           q.created_at, NULL::timestamptz, false, NULL::jsonb
      FROM public.inventaire_doublons q
      JOIN public.inventaire i ON i.id = q.garde AND i.user_id = q.user_id
      LEFT JOIN public.cross_post_jobs j ON j.id = CASE WHEN COALESCE(q.preuves ->> 'job', '') ~ '^[0-9a-f-]{36}$' THEN (q.preuves ->> 'job')::uuid END
     WHERE (p_user IS NULL OR q.user_id = p_user)
       AND q.motif = 'copie_non_prouvee' AND q.statut = 'proposee'
       AND i.fusionne_dans IS NULL AND i.statut = 'vendu'
       AND COALESCE(NULLIF(q.preuves ->> 'platform', ''), j.platform, '') <> 'opla'
  ), u AS (SELECT * FROM aregler UNION ALL SELECT * FROM dv)
  SELECT u.cle, u.sorte, u.user_id, u.fiche, u.platform, u.listing, u.url, u.titre, u.question_le, u.report_le, u.report_borne, u.job,
         (SELECT lower(COALESCE(NULLIF(v.plateforme_code, ''), NULLIF(v.plateforme, ''))) FROM public.ventes v
           WHERE v.user_id = u.user_id AND v.inventaire_id = u.fiche AND lower(COALESCE(v.statut, '')) NOT IN ('annule', 'annulée', 'cancelled', 'canceled')
           ORDER BY v.created_at DESC LIMIT 1) AS vendu_sur,
         GREATEST(
           (SELECT max(a.vu_le) FROM public.annonces_plateforme a
             WHERE a.user_id = u.user_id AND a.platform = u.platform AND btrim(a.listing_id) = u.listing
               AND a.disparu_le IS NULL AND a.retiree_le IS NULL AND a.ignoree_le IS NULL AND a.statut_plateforme IN ('en_ligne', 'en_verification')),
           (SELECT max(x.vu_en_ligne_le) FROM public.cross_post_jobs x
             WHERE x.user_id = u.user_id AND x.platform = u.platform AND btrim(x.platform_listing_id) = u.listing
               AND COALESCE(x.action, 'publish') IN ('publish', 'republish'))) AS vu_le
    FROM u
   WHERE u.listing IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.cross_post_jobs d
                      WHERE d.user_id = u.user_id AND d.platform = u.platform AND d.action = 'delete'
                        AND (d.status IN ('pending', 'processing', 'needs_user') OR (d.status = 'deleted' AND d.created_at >= u.question_le))
                        AND public.listing_designe(u.listing, d.listing_url, d.platform_listing_id))
   ORDER BY u.user_id, u.question_le
   LIMIT GREATEST(1, LEAST(COALESCE(p_limite, 500), 2000))
  ) r;
$function$;
REVOKE ALL ON FUNCTION public.encore_en_ligne_questions(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.encore_en_ligne_questions(uuid, integer) TO service_role;

CREATE OR REPLACE FUNCTION public.encore_en_ligne_mes_questions()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT CASE WHEN auth.uid() IS NULL THEN jsonb_build_object('actif', false, 'questions', '[]'::jsonb)
         ELSE jsonb_build_object(
           'actif', COALESCE((SELECT value FROM public.coin_config WHERE key = 'rappel_encore_en_ligne_actif'), 0) = 1,
           'questions', COALESCE((SELECT jsonb_agg(q) FROM public.encore_en_ligne_questions(auth.uid(), 200) q), '[]'::jsonb)) END;
$function$;
REVOKE ALL ON FUNCTION public.encore_en_ligne_mes_questions() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.encore_en_ligne_mes_questions() TO authenticated, service_role;

-- Le réveil : seulement si l'interrupteur est à 1 ET qu'une question est ouverte (aucun appel sinon).
CREATE OR REPLACE FUNCTION public.encore_en_ligne_a_relancer_existe()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT COALESCE((SELECT value FROM public.coin_config WHERE key = 'rappel_encore_en_ligne_actif'), 0) = 1
     AND (EXISTS (SELECT 1 FROM public.cross_post_jobs j WHERE j.status = 'cancelled' AND (j.platform_fields ->> 'pending_removal') = 'true')
          OR EXISTS (SELECT 1 FROM public.inventaire_doublons q WHERE q.motif = 'copie_non_prouvee' AND q.statut = 'proposee'));
$function$;
REVOKE ALL ON FUNCTION public.encore_en_ligne_a_relancer_existe() FROM PUBLIC, anon, authenticated;

SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'push-rappels-encore-en-ligne';
SELECT cron.schedule('push-rappels-encore-en-ligne', '7,22,37,52 * * * *', $cron$
  SELECT net.http_post(
    url     := 'https://tojihnuawsoohlolangc.supabase.co/functions/v1/push-ventes',
    headers := ('{"Content-Type":"application/json"}'::jsonb || jsonb_build_object('x-cron-secret', public.cron_secret())),
    body    := '{"trigger":"rappels_encore_en_ligne_cron"}'::jsonb,
    timeout_milliseconds := 60000
  )
  WHERE public.encore_en_ligne_a_relancer_existe();
$cron$);

COMMIT;
