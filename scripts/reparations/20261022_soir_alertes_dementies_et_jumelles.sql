-- ═══════════════════════════════════════════════════════════════════════════
-- RÉPARATION 22/10 au soir (point 3 — Louis) — les « Plus en ligne — Vendue ? » déjà posées, rejugées par la règle
-- ═══════════════════════════════════════════════════════════════════════════
-- La règle est en base depuis 20261022200000 (déclencheur cross_post_jobs_zz_alerte_tenue) : elle juge chaque
-- NOUVELLE alerte. Les alertes posées AVANT restent affichées ; ce script leur applique LA MÊME décision, champ pour
-- champ (aucune autre écriture) :
--   (3) boutique partagée — la fiche jumelle du compte relié est EN LIGNE sur la plateforme (Louis : 8 annonces
--       Leboncoin de louis@ désactivées le 21/10, ses copies louis-seller en ligne) :
--         · absence constatée par deux relevés complets → la copie est close « remplacée par l'annonce de ton compte
--           relié » (cancelled, phrase vraie : l'article reste en vente), jamais « vendue ? » ;
--         · sinon → l'alerte attend la confirmation d'un relevé (unavailable_pending_since), sans question ;
--   (2) alerte de la veille RE-posée après qu'un relevé a revu l'annonce en ligne, sans constat de deux relevés
--       (10 Leboncoin, 4 Opla) → elle attend la confirmation d'un relevé, sans question.
-- Puis alerte_lever_revues_plateformes() lève, pour tout le parc, les alertes qu'un relevé a démenties depuis.
-- Aucun retrait, aucune vente, aucun remboursement (jobs déjà publiés), aucun mail.
-- Sauvegarde : _backup_2210_soir_alertes (statut, erreur, platform_fields avant) ; inverse :
--   UPDATE cross_post_jobs j SET status = b.status, error = b.error, platform_fields = b.platform_fields
--     FROM _backup_2210_soir_alertes b WHERE j.id = b.job;   (avec SET LOCAL fillsell.restauration = 'on')
-- Essai : remplacer COMMIT par ROLLBACK.
BEGIN;
SET LOCAL statement_timeout = '120s';
CREATE TABLE IF NOT EXISTS public._backup_2210_soir_alertes (
  le timestamptz DEFAULT now(), job uuid PRIMARY KEY, user_id uuid, status text, error text, platform_fields jsonb,
  decision text, apres jsonb);
ALTER TABLE public._backup_2210_soir_alertes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_2210_soir_alertes FROM anon, authenticated;

CREATE TEMP TABLE _al AS
SELECT j.id, j.user_id, j.platform, j.status, j.error, j.platform_fields,
       j.platform_fields ? 'absence_releves' AS constat,
       (j.platform_fields ->> 'unavailable_since')::timestamptz AS alerte,
       (j.platform_fields #>> '{revue_en_ligne_par_releve,at}')::timestamptz AS revue,
       (SELECT o.listing_id || '|' || o.compte FROM public.jumelle_occupe_plateformes(j.user_id, j.inventaire_id) o
         WHERE o.platform = j.platform AND o.statut IN ('en_ligne', 'en_verification', 'published')
           AND o.listing_id IS DISTINCT FROM nullif(btrim(coalesce(j.platform_listing_id, '')), '') LIMIT 1) AS jumelle
  FROM cross_post_jobs j
 WHERE j.status = 'published' AND j.platform <> 'vinted' AND j.inventaire_id IS NOT NULL
   AND coalesce(j.action, 'publish') IN ('publish', 'republish')
   AND j.platform_fields ? 'unavailable_since'
   AND coalesce(j.platform_fields ->> 'sale_signal', 'unavailable') = 'unavailable';

CREATE TEMP TABLE _decision AS
SELECT a.*, CASE
         WHEN a.jumelle IS NOT NULL AND a.constat THEN 'jumelle_close'
         WHEN a.jumelle IS NOT NULL THEN 'jumelle_a_confirmer'
         WHEN a.revue IS NOT NULL AND a.alerte > a.revue AND NOT a.constat THEN 'dementie_a_confirmer'
       END AS decision
  FROM _al a;
DELETE FROM _decision WHERE decision IS NULL;

INSERT INTO public._backup_2210_soir_alertes (job, user_id, status, error, platform_fields, decision)
SELECT id, user_id, status, error, platform_fields, decision FROM _decision
ON CONFLICT (job) DO NOTHING;

UPDATE cross_post_jobs j SET
  status = 'cancelled',
  platform_fields = (j.platform_fields - array['unavailable_since', 'sale_signal', 'unavailable_pending_since', 'detected_price'])
    || jsonb_build_object('copie_remplacee_par_compte_relie', jsonb_build_object('le', now(),
         'annonce', split_part(d.jumelle, '|', 1), 'compte', split_part(d.jumelle, '|', 2), 'par', 'reparation_2210_soir')),
  error = 'Cette annonce ' || CASE j.platform WHEN 'leboncoin' THEN 'Leboncoin' WHEN 'beebs' THEN 'Beebs' WHEN 'ebay' THEN 'eBay'
            WHEN 'depop' THEN 'Depop' WHEN 'opla' THEN 'Opla' ELSE j.platform END
          || ' n''est plus en ligne ; ton article reste en vente sur '
          || CASE j.platform WHEN 'leboncoin' THEN 'Leboncoin' WHEN 'beebs' THEN 'Beebs' WHEN 'ebay' THEN 'eBay'
            WHEN 'depop' THEN 'Depop' WHEN 'opla' THEN 'Opla' ELSE j.platform END
          || ' sous l''annonce ' || split_part(d.jumelle, '|', 1) || ' de ton compte FillSell relié (même boutique). Rien à refaire.'
  FROM _decision d WHERE d.id = j.id AND d.decision = 'jumelle_close' AND j.status = 'published';

UPDATE cross_post_jobs j SET
  platform_fields = (j.platform_fields - array['unavailable_since', 'sale_signal', 'detected_price'])
    || jsonb_build_object('unavailable_pending_since', j.platform_fields ->> 'unavailable_since',
         'alerte_a_confirmer_par_releve', jsonb_build_object('le', now(),
           'motif', CASE d.decision WHEN 'jumelle_a_confirmer' THEN 'jumelle_en_ligne' ELSE 'dementie_par_releve' END,
           'annonce', CASE WHEN d.decision = 'jumelle_a_confirmer' THEN split_part(d.jumelle, '|', 1) END,
           'dementie_le', d.revue, 'par', 'reparation_2210_soir'))
  FROM _decision d WHERE d.id = j.id AND d.decision IN ('jumelle_a_confirmer', 'dementie_a_confirmer') AND j.status = 'published';

UPDATE public._backup_2210_soir_alertes b SET apres = jsonb_build_object('status', j.status, 'error', j.error,
         'pending', j.platform_fields ? 'unavailable_pending_since', 'alerte', j.platform_fields ? 'unavailable_since')
  FROM cross_post_jobs j WHERE j.id = b.job AND b.apres IS NULL;

-- Le parc : les alertes qu'un relevé a démenties depuis sont levées (même fonction que la clôture d'un relevé).
CREATE TEMP TABLE _levees AS SELECT public.alerte_lever_revues_plateformes(NULL, NULL) AS r;

SELECT 'decision' AS quoi, b.decision AS valeur, count(*)::text AS n, string_agg(DISTINCT split_part(p.email, '@', 1), ', ') AS comptes
  FROM public._backup_2210_soir_alertes b JOIN profiles p ON p.id = b.user_id GROUP BY b.decision
UNION ALL
SELECT 'levees_parc', (SELECT r::text FROM _levees), '', ''
ORDER BY 1, 2;
COMMIT;
