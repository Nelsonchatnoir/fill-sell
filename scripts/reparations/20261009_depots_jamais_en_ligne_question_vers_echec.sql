-- ═══════════════════════════════════════════════════════════════════════════
-- RÉPARATION (09/10, chantier E) — ⛔ NON EXÉCUTÉE, SUR GO DE NICO SEULEMENT,
-- APRÈS l'application de la migration 20261009140000.
-- ═══════════════════════════════════════════════════════════════════════════
-- Quatre bandeaux « Plus en ligne — Vendue ? » sont ouverts (09/10 12:30) sur
-- des dépôts Leboncoin JAMAIS vus en ligne (aucun lien, aucun relevé, jamais
-- revus par la veille), posés par trancher_publications_sans_lien (point E du
-- 28/09). Un appui sur « Oui » y enregistrerait une vente « Ailleurs » et
-- retirerait les copies de l'article ailleurs.
--   Nadia (bd380fbf…) : 3280170490 (Veste parka), 3280174176 (Veste Ralph
--     Lauren), 3282746279 (Gilet Jacadi) ;
--   Tech-t (6eb8400b…) : 3284211028 (Pokémon Rongrigou V).
-- Le geste : lever la question puis rejouer la règle MIGRÉE sur leur dernier
-- relevé complet (la migration, elle, ne touche jamais une question ouverte) — rejoué le 09/10 en transaction annulée :
-- ces 4 jobs passent 'failed' (« Leboncoin n'a jamais mis cette annonce en
-- ligne… »), aucun autre statut ne bouge, 0 vente, 0 retrait.
-- Sauvegarde d'abord ; inverse en bas.

BEGIN;
CREATE TABLE IF NOT EXISTS public._backup_0910_depots_jamais_en_ligne AS
  SELECT id, status, error, platform_fields, now() AS sauve_le
    FROM public.cross_post_jobs
   WHERE id IN ('3adc2b67-9ea6-4d32-a8e6-b068e2902b71', 'f2518adf-9756-4fc3-a142-973810563c28',
                '4c056e58-6571-42a6-a489-b02937347f87', '4beff138-7c97-4c8a-b08c-b27369b87e0d');
-- La migration appliquée laisse EXPRÈS intacte une question déjà ouverte : on
-- la lève d'abord, sur ces 4 jobs seulement (sauvegardés ci-dessus), puis la
-- règle conclut comme pour un dépôt sans question.
UPDATE public.cross_post_jobs
   SET platform_fields = platform_fields - ARRAY['unavailable_since', 'unavailable_pending_since', 'sale_signal']
 WHERE id IN (SELECT id FROM public._backup_0910_depots_jamais_en_ligne) AND status = 'published';
SELECT public.trancher_publications_sans_lien('bd380fbf-a120-4647-ab17-6bfdea14bafa', 'leboncoin', '03513d12-bc61-485a-8f36-ad6bbcb35856');
SELECT public.trancher_publications_sans_lien('6eb8400b-a2a0-458d-8b85-a05c92d1f4b7', 'leboncoin', 'a5b7142f-da2b-4c97-82c5-a30f3fdb543f');
SELECT id, status, left(error, 120) FROM public.cross_post_jobs
 WHERE id IN (SELECT id FROM public._backup_0910_depots_jamais_en_ligne);
COMMIT;

-- INVERSE (à lancer seul, sur décision) :
-- UPDATE public.cross_post_jobs c SET status = b.status, error = b.error, platform_fields = b.platform_fields
--   FROM public._backup_0910_depots_jamais_en_ligne b WHERE c.id = b.id;
