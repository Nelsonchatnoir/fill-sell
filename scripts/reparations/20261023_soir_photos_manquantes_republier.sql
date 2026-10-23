-- ═══════════════════════════════════════════════════════════════════════════
-- RÉPARATION 23/10 soir (décision 1 de Nico) — REPUBLIER, PAR LE CIRCUIT NORMAL ET HORS QUOTA, LES ANNONCES EN LIGNE
-- À QUI IL MANQUE DES PHOTOS
-- ═══════════════════════════════════════════════════════════════════════════
-- Le geste : « Republier » (spend_coins_and_republish, source « manuel »), en tant que le compte. Au départ :
--   · Leboncoin : get-pending-jobs (v275) impose TOUTES les photos de la fiche, remises par la base le 23/10
--     (`photos_origine_completees`) — dans la limite gratuite que la page de dépôt lit (`photos_lbc.gratuites`) ;
--   · Vinted : la capture est corrigée à l'étape « captured » (photosDeLaFicheALaRecreation), avant tout retrait.
-- Cibles (rejeu du 23/10 18:10) : seulement les annonces qui GAGNENT des photos. Écartées, et pourquoi :
--   jocabroc8 LBC 3292079853 (20 photos, le maximum de l'app), 3278764402 (fiche à 5 = l'annonce, laissée par
--   décision 3), 3279067385 (10 photos à lui) ; nino57270 LBC 3291893782 (Leboncoin n'en accepte que 3 gratuites :
--   déjà 3), 3290695149 (fiche à 3 = l'annonce) ; xxewwer LBC 3293844895 (déjà 12 / 12).
-- Gardes (sinon SAUTÉE et dite) : fiche au stock, dépôt publié avec son numéro, aucune tâche déjà en file sur la fiche et
-- la plateforme, aucun retrait en file, aucune alerte « plus en ligne » ni signal de vente, aucune transaction
-- Leboncoin, aucune vente Vinted relevée. Plafonds, quotas et créneaux : ceux du compte ; marquées `hors_quota`.
-- Aucun mail. Sauvegarde : _backup_2310_soir_republications. Essai : COMMIT → ROLLBACK.
BEGIN;
SET LOCAL statement_timeout = '170s';
CREATE TABLE IF NOT EXISTS public._backup_2310_soir_republications (
  le timestamptz DEFAULT now(), job_source uuid PRIMARY KEY, user_id uuid, inventaire_id bigint, platform text,
  annonce text, source_avant jsonb, garde text, resultat jsonb);
ALTER TABLE public._backup_2310_soir_republications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_2310_soir_republications FROM anon, authenticated;

CREATE TEMP TABLE _cibles (job uuid, platform text, annonce text);
INSERT INTO _cibles VALUES
  ('7a33d14b-d9b9-4c9f-9346-abd11c9cb757', 'leboncoin', '3278102982'),   -- jocabroc8, 5 → 20 photos
  ('f597c171-91b5-41ad-b112-c27175cebed7', 'leboncoin', '3278109059'),   -- jocabroc8, 5 → 11
  ('e6afe7af-4b79-4159-8039-f1cfa6f08877', 'leboncoin', '3279059780'),   -- jocabroc8, 5 → 12
  ('cf5df540-1932-4dc7-bb51-30d0e8641108', 'leboncoin', '3278109961'),   -- jocabroc8, 5 → 15
  ('9e2b9c86-3d2f-4e12-88ad-dd8427f635ec', 'leboncoin', '3291557956'),   -- jocabroc8, 5 → 12 (20 gratuites lues)
  ('b0f73d51-2cfc-4960-893e-a671422c8ae0', 'vinted',    '10172888526'),  -- jocabroc8, 5 → 9
  ('292660bf-bd53-4e76-abe4-ceb541dd39c0', 'vinted',    '10438871696');  -- jocabroc8, 5 → 12

CREATE TEMP TABLE _jugees AS
SELECT c.*, j.user_id, j.inventaire_id, to_jsonb(j.*) - 'description' AS source_avant,
  CASE
    WHEN j.id IS NULL OR j.status <> 'published' OR btrim(coalesce(j.platform_listing_id, '')) <> c.annonce THEN 'dépôt publié introuvable sous ce numéro'
    WHEN i.statut IS DISTINCT FROM 'stock' OR i.fusionne_dans IS NOT NULL THEN 'fiche hors stock'
    WHEN EXISTS (SELECT 1 FROM cross_post_jobs x WHERE x.inventaire_id = j.inventaire_id AND x.platform = c.platform
                   AND x.status IN ('pending', 'processing', 'needs_user')) THEN 'une tâche est déjà en file (pas de doublon)'
    WHEN EXISTS (SELECT 1 FROM cross_post_jobs x WHERE x.inventaire_id = j.inventaire_id AND x.action = 'delete'
                   AND x.status IN ('pending', 'processing', 'needs_user')) THEN 'un retrait est en file sur la fiche'
    WHEN j.platform_fields ? 'unavailable_since' OR coalesce(j.platform_fields ->> 'sale_signal', '') <> '' THEN 'alerte ou signal de vente'
    WHEN c.platform = 'leboncoin' AND EXISTS (SELECT 1 FROM annonces_plateforme a WHERE a.platform = 'leboncoin' AND a.user_id = j.user_id
                   AND a.listing_id = c.annonce AND leboncoin_transaction_lue(a.transaction_plateforme, a.capture) IN ('pending', 'sold')) THEN 'transaction Leboncoin en cours'
    WHEN c.platform = 'vinted' AND EXISTS (SELECT 1 FROM vinted_listing_snapshots s WHERE s.user_id = j.user_id AND s.vinted_item_id = c.annonce
                   AND s.status IN ('sold', 'reserved')) THEN 'vente Vinted relevée'
    ELSE 'ok'
  END AS garde
  FROM _cibles c
  LEFT JOIN cross_post_jobs j ON j.id = c.job
  LEFT JOIN inventaire i ON i.id = j.inventaire_id;

INSERT INTO public._backup_2310_soir_republications (job_source, user_id, inventaire_id, platform, annonce, source_avant, garde)
SELECT job, user_id, inventaire_id, platform, annonce, source_avant, garde FROM _jugees WHERE user_id IS NOT NULL
ON CONFLICT (job_source) DO UPDATE SET garde = EXCLUDED.garde;

DO $$
DECLARE g record; r jsonb;
BEGIN
  FOR g IN SELECT * FROM _jugees WHERE garde = 'ok' LOOP
    PERFORM set_config('request.jwt.claims', json_build_object('sub', g.user_id, 'role', 'authenticated')::text, true);
    IF g.platform = 'vinted' THEN
      r := public.spend_coins_and_republish(g.inventaire_id, g.annonce, 'manuel', NULL, 'vinted');
    ELSE
      r := public.spend_coins_and_republish(g.inventaire_id, NULL, 'manuel', NULL, g.platform);
    END IF;
    UPDATE public._backup_2310_soir_republications SET resultat = r WHERE job_source = g.job;
    IF COALESCE((r ->> 'allowed')::boolean, false) THEN
      UPDATE cross_post_jobs SET platform_fields = COALESCE(platform_fields, '{}'::jsonb) || jsonb_build_object('hors_quota',
               jsonb_build_object('motif', 'erreur FillSell 23/10 : annonce partie avant toutes ses photos d''origine', 'le', now()))
       WHERE id = (r ->> 'job_id')::uuid AND user_id = g.user_id;
    END IF;
  END LOOP;
  PERFORM set_config('request.jwt.claims', '', true);
END $$;

SELECT b.platform, b.annonce, b.garde, coalesce(b.resultat ->> 'allowed', '-') autorise, coalesce(b.resultat ->> 'reason', '') motif,
       coalesce(b.resultat ->> 'job_id', '') job, coalesce(b.resultat ->> 'price', '') prix
  FROM public._backup_2310_soir_republications b WHERE b.job_source IN (SELECT job FROM _cibles) ORDER BY 1, 2;
COMMIT;
