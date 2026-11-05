-- INVERSE de 20261105_compte_relecture_apple.sql (05/11 soir, décision g) : test@fillsell.app revient à l'état d'avant —
-- beta_flags d'avant, les 7 articles de démo AJOUTÉS retirés seulement s'ils n'ont aucun job ; les 60 articles d'avant
-- n'ont jamais bougé. Un Cloud acheté entre-temps en bac à sable par un relecteur suit son abonnement.
BEGIN;
DO $$
BEGIN
  IF to_regclass('public._backup_0511_compte_relecture_apple') IS NULL THEN
    RAISE EXCEPTION 'pas de sauvegarde _backup_0511_compte_relecture_apple : rien à défaire';
  END IF;
  IF EXISTS (SELECT 1 FROM public.cross_post_jobs j JOIN public._backup_0511_compte_relecture_apple b
              ON b.nature = 'article_ajoute' AND j.inventaire_id = b.cle::bigint) THEN
    RAISE EXCEPTION 'des articles de démo ont des jobs : rien n''est défait (à voir à la main)';
  END IF;
END $$;
UPDATE public.profiles p SET beta_flags = b.avant
  FROM public._backup_0511_compte_relecture_apple b
 WHERE b.nature = 'profil_beta_flags' AND p.id = b.cle::uuid AND p.beta_flags IS DISTINCT FROM b.avant;
DELETE FROM public.inventaire i USING public._backup_0511_compte_relecture_apple b
 WHERE b.nature = 'article_ajoute' AND i.id = b.cle::bigint AND i.user_id = 'd6a9e726-b6f1-4b7f-a927-2487668d6d96';
DROP TABLE public._backup_0511_compte_relecture_apple;
COMMIT;
