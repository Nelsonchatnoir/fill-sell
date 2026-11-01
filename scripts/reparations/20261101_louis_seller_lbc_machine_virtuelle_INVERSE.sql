-- INVERSE de 20261101_louis_seller_lbc_machine_virtuelle.sql : beta_flags de louis-seller rendu à sa valeur d'avant
-- (sauvegarde _backup_0111_louis_seller_beta_flags), puis la sauvegarde retirée. La garde machine virtuelle
-- s'applique de nouveau à ce compte au poll suivant.
BEGIN;
DO $$
BEGIN
  IF to_regclass('public._backup_0111_louis_seller_beta_flags') IS NULL
     OR NOT EXISTS (SELECT 1 FROM public._backup_0111_louis_seller_beta_flags WHERE user_id = '447d920c-976a-4d8f-aff4-a2998050358c') THEN
    RAISE EXCEPTION 'sauvegarde absente : rien n''est écrit';
  END IF;
END
$$;
UPDATE public.profiles p SET beta_flags = b.beta_flags
  FROM public._backup_0111_louis_seller_beta_flags b
 WHERE p.id = b.user_id AND p.id = '447d920c-976a-4d8f-aff4-a2998050358c';
DROP TABLE public._backup_0111_louis_seller_beta_flags;
COMMIT;
