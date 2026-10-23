-- ═══════════════════════════════════════════════════════════════════════════
-- RÉPARATION 23/10 (point 1, consigne de Nico 11:5x) — COMPLÉTER LES ANNONCES VINTED DE THIERRY PARTIES À UNE PHOTO
-- ═══════════════════════════════════════════════════════════════════════════
-- Le geste : « Republier » (spend_coins_and_republish, source « manuel »), en tant que le compte — le circuit normal de
-- l'app. La republication Vinted retire puis recrée l'annonce depuis sa capture ; get-pending-jobs (v273) remplace, à
-- l'étape « captured », les photos de la capture par TOUTES celles de la fiche (avers ET revers, dans l'ordre), et
-- retient la recréation tant qu'elles ne sont pas rapatriées chez nous (l'annonce reste en ligne). Un formulaire
-- incomplet s'arrête sans rien retirer (pré-vol) : l'annonce n'est jamais perdue.
-- Cibles : annonces Vinted de antikcollections déposées le 23/10 depuis une fiche née du relevé eBay, dont le dépôt
-- portait MOINS de photos que la fiche n'en a maintenant (fiche complétée par la lecture du détail eBay, APRÈS le dépôt).
-- Gardes (sinon SAUTÉE et dite) : fiche au stock (non fusionnée), dépôt publié avec son numéro, aucune tâche déjà en
-- file sur cette fiche et Vinted, aucun retrait en file, aucune alerte « plus en ligne » ni signal de vente.
-- Plafonds, quotas et créneaux : ceux du compte (la RPC refuse au-delà). Aucun mail.
-- Sauvegarde : _backup_2310_thierry_republications. Essai : remplacer COMMIT par ROLLBACK.
BEGIN;
SET LOCAL statement_timeout = '170s';
CREATE TABLE IF NOT EXISTS public._backup_2310_thierry_republications (
  le timestamptz DEFAULT now(), job_source uuid PRIMARY KEY, user_id uuid, inventaire_id bigint, annonce text,
  photos_depot integer, photos_fiche integer, source_avant jsonb, garde text, resultat jsonb);
ALTER TABLE public._backup_2310_thierry_republications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_2310_thierry_republications FROM anon, authenticated;

CREATE TEMP TABLE _jugees AS
SELECT j.id AS job_source, j.user_id, j.inventaire_id, btrim(j.platform_listing_id) AS annonce,
  jsonb_array_length(CASE WHEN jsonb_typeof(j.photos) = 'array' THEN j.photos ELSE '[]' END) AS photos_depot,
  jsonb_array_length(CASE WHEN jsonb_typeof(i.photos) = 'array' THEN i.photos ELSE '[]' END) AS photos_fiche,
  to_jsonb(j.*) - 'description' AS source_avant,
  CASE
    WHEN i.statut IS DISTINCT FROM 'stock' OR i.fusionne_dans IS NOT NULL THEN 'fiche hors stock'
    WHEN btrim(coalesce(j.platform_listing_id, '')) !~ '^\d+$' THEN 'dépôt sans numéro'
    WHEN EXISTS (SELECT 1 FROM cross_post_jobs x WHERE x.inventaire_id = j.inventaire_id AND x.platform = 'vinted'
                   AND x.status IN ('pending', 'processing', 'needs_user')) THEN 'une tâche est déjà en file (pas de doublon)'
    WHEN EXISTS (SELECT 1 FROM cross_post_jobs x WHERE x.inventaire_id = j.inventaire_id AND x.action = 'delete'
                   AND x.status IN ('pending', 'processing', 'needs_user')) THEN 'un retrait est en file sur la fiche'
    WHEN j.platform_fields ? 'unavailable_since' OR coalesce(j.platform_fields ->> 'sale_signal', '') <> '' THEN 'alerte ou signal de vente'
    ELSE 'ok'
  END AS garde
  FROM cross_post_jobs j JOIN inventaire i ON i.id = j.inventaire_id AND i.user_id = j.user_id
 WHERE j.user_id = 'c2175e91-3854-4a66-8388-e28810166a3e' AND j.platform = 'vinted' AND j.action = 'publish'
   AND j.status = 'published' AND j.created_at >= '2026-10-23 11:00:00+02'
   AND i.origine = 'releve_ebay' AND coalesce(j.photo_option, 'original') = 'original'
   AND jsonb_array_length(CASE WHEN jsonb_typeof(i.photos) = 'array' THEN i.photos ELSE '[]' END) >= 2
   AND jsonb_array_length(CASE WHEN jsonb_typeof(j.photos) = 'array' THEN j.photos ELSE '[]' END)
       < jsonb_array_length(CASE WHEN jsonb_typeof(i.photos) = 'array' THEN i.photos ELSE '[]' END)
   AND NOT EXISTS (SELECT 1 FROM public._backup_2310_thierry_republications b WHERE b.job_source = j.id AND b.resultat IS NOT NULL);

INSERT INTO public._backup_2310_thierry_republications (job_source, user_id, inventaire_id, annonce, photos_depot, photos_fiche, source_avant, garde)
SELECT job_source, user_id, inventaire_id, annonce, photos_depot, photos_fiche, source_avant, garde FROM _jugees
ON CONFLICT (job_source) DO UPDATE SET garde = EXCLUDED.garde, photos_fiche = EXCLUDED.photos_fiche;

DO $$
DECLARE g record; r jsonb;
BEGIN
  FOR g IN SELECT * FROM _jugees WHERE garde = 'ok' ORDER BY annonce LOOP
    PERFORM set_config('request.jwt.claims', json_build_object('sub', g.user_id, 'role', 'authenticated')::text, true);
    r := public.spend_coins_and_republish(g.inventaire_id, g.annonce, 'manuel', NULL, 'vinted');
    UPDATE public._backup_2310_thierry_republications SET resultat = r WHERE job_source = g.job_source;
  END LOOP;
  PERFORM set_config('request.jwt.claims', '', true);
END $$;

SELECT annonce, photos_depot, photos_fiche, garde, coalesce(resultat ->> 'allowed', '-') autorise,
       coalesce(resultat ->> 'reason', '') motif, coalesce(resultat ->> 'job_id', '') job
  FROM public._backup_2310_thierry_republications WHERE job_source IN (SELECT job_source FROM _jugees) ORDER BY annonce;
COMMIT;
