-- INVERSE de 20261101_louis_delegation_leboncoin.sql : beta_flags des deux comptes rendus à leur valeur d'avant (l'exception
-- « Leboncoin autorisé sur machine virtuelle » de louis-seller revient, la délégation part des deux côtés), et la tâche
-- 9aa5edb9 rendue à son état d'avant SI elle est encore en attente (pending) : une tâche déjà faite, en cours ou close
-- n'est jamais remise en arrière. La liste des annonces sauvegardée est gardée (preuve), effacée à la main ensuite.
BEGIN;
DO $$
BEGIN
  IF to_regclass('public._backup_0111_delegation_lbc_flags') IS NULL
     OR (SELECT count(*) FROM public._backup_0111_delegation_lbc_flags
          WHERE user_id IN ('447d920c-976a-4d8f-aff4-a2998050358c', 'faf5021a-479a-4bb3-b3ec-c296770739b7')) <> 2 THEN
    RAISE EXCEPTION 'sauvegarde absente : rien n''est écrit';
  END IF;
END
$$;

UPDATE public.profiles p SET beta_flags = b.beta_flags
  FROM public._backup_0111_delegation_lbc_flags b
 WHERE p.id = b.user_id AND p.id IN ('447d920c-976a-4d8f-aff4-a2998050358c', 'faf5021a-479a-4bb3-b3ec-c296770739b7');

UPDATE public.cross_post_jobs j SET status = b.status, error = b.error, platform_fields = b.platform_fields
  FROM public._backup_0111_delegation_lbc_job b
 WHERE j.id = b.id AND j.id = '9aa5edb9-eacf-4735-82d8-15e28625269a' AND j.status = 'pending';

SELECT u.email, p.beta_flags FROM public.profiles p JOIN auth.users u ON u.id = p.id
 WHERE p.id IN ('447d920c-976a-4d8f-aff4-a2998050358c', 'faf5021a-479a-4bb3-b3ec-c296770739b7');
SELECT id, status, left(error, 120) AS error FROM public.cross_post_jobs WHERE id = '9aa5edb9-eacf-4735-82d8-15e28625269a';

DROP TABLE public._backup_0111_delegation_lbc_flags;
DROP TABLE public._backup_0111_delegation_lbc_job;
COMMIT;
