-- (20/11/2026, lot « problèmes », point 2 de Nico — thecloset72000 8ac5bbda) LA QUESTION « EST-CE LE MÊME ARTICLE ? »
-- ENTRE DEUX RÉFÉRENCES DIFFÉRENTES EST CLOSE PAR LA RÈGLE. Question 2a7958c3 (photo_identique, rapprochement_v3, 20/11
-- 07:40) : fiche 1795156645552 « Wrangler … #409C14 » (Très bon état) / fiche 1795101900457 « Jean Wrangler Hero …
-- #407C15 » (Bon état). Règle de Nico (20/11) : une référence différente = un article différent ; la base l'applique
-- désormais à toute nouvelle question (doublon_attribut_distinctif → 'reference', migration 20261120120000). Celle-ci,
-- posée avant, est la SEULE question ouverte du parc entre deux références différentes (compté le 20/11).
-- « refusee » par la « regle » : jamais reposée (forcesDe → « non »), comme une paire écartée par attribut distinctif.
-- Sauvegarde : _backup_2011_question_2a7958c3. Inverse : 20261120_thecloset_question_references_differentes_INVERSE.sql.
BEGIN;
SET LOCAL lock_timeout = '5s';
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.inventaire_doublons
                  WHERE id = '2a7958c3-b7e1-4485-a284-945675f3b792' AND user_id = '8ac5bbda-0947-4612-82fd-effdaa3ca84a'
                    AND statut = 'proposee' AND motif = 'photo_identique'
                    AND garde = 1795156645552 AND absorbe = 1795101900457) THEN
    RAISE EXCEPTION 'question 2a7958c3 : plus dans l''état attendu (relire)';
  END IF;
  IF public.doublon_attribut_distinctif(
       (SELECT titre FROM public.inventaire WHERE id = 1795156645552),
       (SELECT titre FROM public.inventaire WHERE id = 1795101900457)) IS DISTINCT FROM 'reference' THEN
    RAISE EXCEPTION 'la règle de référence ne s''applique pas (migration 20261120120000 appliquée ?)';
  END IF;
END $$;
CREATE TABLE public._backup_2011_question_2a7958c3 AS
  SELECT now() AS le, * FROM public.inventaire_doublons WHERE id = '2a7958c3-b7e1-4485-a284-945675f3b792';
ALTER TABLE public._backup_2011_question_2a7958c3 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_2011_question_2a7958c3 FROM PUBLIC, anon, authenticated;
UPDATE public.inventaire_doublons
   SET statut = 'refusee', decide_par = 'regle', decide_le = now(),
       preuves = COALESCE(preuves, '{}'::jsonb) || jsonb_build_object('close_par_regle', jsonb_build_object(
         'le', now(), 'raison', 'reference', 'references', '#409C14 / #407C15',
         'par', 'scripts/reparations/20261120_thecloset_question_references_differentes.sql'))
 WHERE id = '2a7958c3-b7e1-4485-a284-945675f3b792' AND statut = 'proposee';
SELECT id, statut, decide_par, decide_le FROM public.inventaire_doublons WHERE id = '2a7958c3-b7e1-4485-a284-945675f3b792';
COMMIT;
