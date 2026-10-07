-- ════════════════════════════════════════════════════════════════════════════
-- REMISE EN STOCK — rattrapage_0710 hors Corinne (07/10/2026 ~16:10 Paris, ordre de Nico)
-- ════════════════════════════════════════════════════════════════════════════
-- Le rattrapage du parc a été appliqué par erreur (15:30–15:53 Paris) : Nico
-- avait demandé de ne pas le faire. On retire SEULEMENT le marqueur a_verifier
-- posé par le rattrapage (887 articles, 54 comptes) ; Corinne (100) garde le
-- sien. Fusions, jobs, annonces, questions : rien ne bouge.
-- Sauvegarde : _backup_0710_remise_a_verifier (RLS, fermée). Inverse :
--   UPDATE inventaire i SET a_verifier = b.a_verifier FROM _backup_0710_remise_a_verifier b WHERE i.id = b.id;
-- APPLIQUÉ le 07/10 ~14:05 UTC : 887 remis, 54 comptes ; contrôle 0 hors Corinne,
-- 97 comptes écart 0 (stock = avant − fusions), Jocabroc 737 − 29 = 708.
BEGIN;
CREATE TABLE IF NOT EXISTS public._backup_0710_remise_a_verifier AS
  SELECT id, user_id, a_verifier, now() AS sauve_le FROM inventaire WHERE false;
ALTER TABLE public._backup_0710_remise_a_verifier ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_0710_remise_a_verifier FROM PUBLIC, anon, authenticated;
INSERT INTO public._backup_0710_remise_a_verifier (id, user_id, a_verifier, sauve_le)
  SELECT id, user_id, a_verifier, now() FROM inventaire
   WHERE a_verifier ->> 'source' = 'rattrapage_0710' AND user_id <> '771ac4d9-727c-4f68-bd8c-f4c7e8056a03';
WITH u AS (
  UPDATE inventaire SET a_verifier = NULL
   WHERE a_verifier ->> 'source' = 'rattrapage_0710' AND user_id <> '771ac4d9-727c-4f68-bd8c-f4c7e8056a03'
  RETURNING user_id)
SELECT count(*) remis, count(DISTINCT user_id) comptes FROM u;
COMMIT;
