-- ═══════════════════════════════════════════════════════════════════════════
-- LIEN BEEBS ÉCRIT PAR LE SERVEUR À PARTIR DU NUMÉRO PROUVÉ (30/09, 23:15)
-- ═══════════════════════════════════════════════════════════════════════════
-- Constat : la republication Beebs de test en 0.6.81 (T-shirt Picture Organic,
-- 22:47) a rendu son numéro 34085052 (preuve acceptée par update-job-status),
-- mais listing_url et new_listing_url sont restés vides : l'extension ne pose
-- le lien qu'en relisant /fr/p/<numéro> une fois l'annonce validée par Beebs,
-- et ne l'avait toujours pas fait 10 min après la mise en ligne.
-- Vérifié dans le navigateur (30/09, 23:10) : https://www.beebs.app/fr/p/<numéro>
-- sans le reste du titre ouvre l'annonce (redirection vers /fr/p/<numéro>-<titre>,
-- HTTP 200) — 34085052, 34076509, 34003891.
--
-- 1. Trigger (tout le parc, tous les builds) : un job Beebs publié
--    (publish / republish) dont platform_listing_id est un numéro reçoit
--    listing_url = https://www.beebs.app/fr/p/<numéro> s'il est vide, et, pour
--    une republication, platform_fields.new_listing_url s'il est vide. Placé
--    APRÈS cross_post_jobs_lien_jamais_croise (ordre alphabétique des
--    triggers) : le numéro a déjà passé la garde « jamais croisé ».
-- 2. Rattrapage : même règle pour les jobs publiés numérotés sans lien.
-- 3. Rattrapage inverse : un job publié qui porte SON lien /fr/p/<chiffres>
--    sans numéro reçoit ces chiffres comme numéro — SAUF si ce lien a été
--    retrouvé par le titre ou reste douteux (listing_url_recovery,
--    lien_en_attente, identifiant_beebs_non_prouve,
--    retour_arriere_attente_identifiant_beebs, listing_url_recovery_refus :
--    172 jobs, laissés tels quels), si un autre article publié porte le même
--    numéro, ou si un retrait Beebs de la fiche attend.
-- Jamais un lien réécrit. Jamais un titre, un prix ou une photo.
-- Sauvegarde : _backup_beebs_lien_numero_3009 (valeurs d'avant).
-- Retour arrière : supabase/rollbacks/20260930231500_beebs_lien_depuis_numero.sql
-- ═══════════════════════════════════════════════════════════════════════════
SET lock_timeout = '3s';

CREATE OR REPLACE FUNCTION public.cross_post_jobs_lien_numero_beebs()
RETURNS trigger LANGUAGE plpgsql AS $f$
DECLARE v_url text;
BEGIN
  v_url := 'https://www.beebs.app/fr/p/' || btrim(NEW.platform_listing_id);
  IF NULLIF(btrim(COALESCE(NEW.listing_url, '')), '') IS NULL THEN
    NEW.listing_url := v_url;
    NEW.platform_fields := COALESCE(NEW.platform_fields, '{}'::jsonb)
      || jsonb_build_object('lien_depuis_numero', jsonb_build_object('le', now(), 'numero', btrim(NEW.platform_listing_id)));
  END IF;
  IF NEW.action = 'republish' AND NULLIF(btrim(COALESCE(NEW.platform_fields ->> 'new_listing_url', '')), '') IS NULL THEN
    NEW.platform_fields := COALESCE(NEW.platform_fields, '{}'::jsonb) || jsonb_build_object('new_listing_url', v_url);
  END IF;
  RETURN NEW;
END $f$;

DROP TRIGGER IF EXISTS cross_post_jobs_lien_numero_beebs ON public.cross_post_jobs;
CREATE TRIGGER cross_post_jobs_lien_numero_beebs
  BEFORE INSERT OR UPDATE OF status, platform_listing_id, listing_url, platform_fields ON public.cross_post_jobs
  FOR EACH ROW
  WHEN (NEW.platform = 'beebs' AND NEW.status = 'published' AND NEW.action IN ('publish', 'republish')
        AND NEW.platform_listing_id ~ '^\s*[0-9]{6,}\s*$'
        AND (NULLIF(btrim(COALESCE(NEW.listing_url, '')), '') IS NULL
             OR (NEW.action = 'republish' AND NULLIF(btrim(COALESCE(NEW.platform_fields ->> 'new_listing_url', '')), '') IS NULL)))
  EXECUTE FUNCTION public.cross_post_jobs_lien_numero_beebs();

-- ── Sauvegarde des lignes touchées par les rattrapages ─────────────────────
CREATE TABLE IF NOT EXISTS public._backup_beebs_lien_numero_3009 (
  job_id uuid PRIMARY KEY, sens text NOT NULL, listing_url_avant text, platform_listing_id_avant text,
  new_listing_url_avant text, sauve_le timestamptz NOT NULL DEFAULT now());
ALTER TABLE public._backup_beebs_lien_numero_3009 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_beebs_lien_numero_3009 FROM anon, authenticated;

-- ── 2. Numéro → lien ─────────────────────────────────────────────────────────
INSERT INTO public._backup_beebs_lien_numero_3009 (job_id, sens, listing_url_avant, platform_listing_id_avant, new_listing_url_avant)
SELECT j.id, 'numero_vers_lien', j.listing_url, j.platform_listing_id, j.platform_fields ->> 'new_listing_url'
  FROM public.cross_post_jobs j
 WHERE j.platform = 'beebs' AND j.status = 'published' AND j.action IN ('publish', 'republish')
   AND j.platform_listing_id ~ '^\s*[0-9]{6,}\s*$'
   AND (NULLIF(btrim(COALESCE(j.listing_url, '')), '') IS NULL
        OR (j.action = 'republish' AND NULLIF(btrim(COALESCE(j.platform_fields ->> 'new_listing_url', '')), '') IS NULL))
ON CONFLICT (job_id) DO NOTHING;
-- Une écriture neutre suffit : le trigger ci-dessus pose le lien.
UPDATE public.cross_post_jobs j SET platform_listing_id = btrim(j.platform_listing_id)
  FROM public._backup_beebs_lien_numero_3009 b
 WHERE b.job_id = j.id AND b.sens = 'numero_vers_lien';

-- ── 3. Lien du job → numéro ─────────────────────────────────────────────────
INSERT INTO public._backup_beebs_lien_numero_3009 (job_id, sens, listing_url_avant, platform_listing_id_avant, new_listing_url_avant)
SELECT j.id, 'lien_vers_numero', j.listing_url, j.platform_listing_id, j.platform_fields ->> 'new_listing_url'
  FROM public.cross_post_jobs j
 WHERE j.platform = 'beebs' AND j.status = 'published' AND j.action IN ('publish', 'republish')
   AND NULLIF(btrim(COALESCE(j.platform_listing_id, '')), '') IS NULL
   AND j.listing_url ~ '^https://www\.beebs\.app/fr/p/[0-9]{6,}(-|/|$)'
   AND NOT (COALESCE(j.platform_fields, '{}'::jsonb) ?| ARRAY['listing_url_recovery', 'lien_en_attente',
            'identifiant_beebs_non_prouve', 'retour_arriere_attente_identifiant_beebs', 'listing_url_recovery_refus'])
   AND NOT EXISTS (SELECT 1 FROM public.cross_post_jobs o
                    WHERE o.id <> j.id AND o.platform = 'beebs' AND o.user_id = j.user_id
                      AND o.inventaire_id IS DISTINCT FROM j.inventaire_id AND o.status = 'published'
                      AND (substring(o.listing_url from '/p/([0-9]{6,})') = substring(j.listing_url from '/p/([0-9]{6,})')
                           OR btrim(o.platform_listing_id) = substring(j.listing_url from '/p/([0-9]{6,})')))
   AND NOT EXISTS (SELECT 1 FROM public.cross_post_jobs d
                    WHERE d.user_id = j.user_id AND d.inventaire_id = j.inventaire_id AND d.platform = 'beebs'
                      AND d.action = 'delete'
                      AND (d.status = 'pending' OR (d.status = 'needs_user' AND d.platform_fields ? 'retrait_en_attente')))
ON CONFLICT (job_id) DO NOTHING;
UPDATE public.cross_post_jobs j
   SET platform_listing_id = substring(j.listing_url from '/p/([0-9]{6,})'),
       platform_fields = COALESCE(j.platform_fields, '{}'::jsonb)
         || jsonb_build_object('numero_depuis_lien', jsonb_build_object('le', now(), 'lien', j.listing_url))
  FROM public._backup_beebs_lien_numero_3009 b
 WHERE b.job_id = j.id AND b.sens = 'lien_vers_numero';
