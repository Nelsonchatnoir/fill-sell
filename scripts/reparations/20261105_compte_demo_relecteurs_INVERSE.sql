-- INVERSE de 20261105_compte_demo_relecteurs.sql (05/11 soir, décision g de Nico) : le compte de démo des relecteurs
-- revient à l'état d'avant, depuis public._backup_0511_compte_demo_relecteurs — beta_flags d'avant, l'article « Robe »
-- remis À L'IDENTIQUE (ligne entière), les 7 articles de démo retirés SEULEMENT s'ils n'ont aucun job (jamais une
-- annonce publiée laissée sans fiche). Le Cloud éventuellement acheté entre-temps par un relecteur n'est pas touché
-- (il suit son abonnement de bac à sable).
BEGIN;
DO $$
BEGIN
  IF to_regclass('public._backup_0511_compte_demo_relecteurs') IS NULL THEN
    RAISE EXCEPTION 'pas de sauvegarde _backup_0511_compte_demo_relecteurs : rien à défaire';
  END IF;
  IF EXISTS (SELECT 1 FROM public.cross_post_jobs j JOIN public.inventaire i ON i.id = j.inventaire_id
              WHERE i.user_id = '953c1ca6-4851-41e7-b2b0-fb2a18551815' AND i.titre <> 'Robe') THEN
    RAISE EXCEPTION 'des articles de démo ont des jobs : rien n''est défait (à voir à la main)';
  END IF;
END $$;

UPDATE public.profiles p SET beta_flags = b.avant
  FROM public._backup_0511_compte_demo_relecteurs b
 WHERE b.nature = 'profil_beta_flags' AND p.id = b.cle::uuid AND p.beta_flags IS DISTINCT FROM b.avant;

DELETE FROM public.inventaire i
 WHERE i.user_id = '953c1ca6-4851-41e7-b2b0-fb2a18551815'
   AND i.photos @> '[{"type": "original"}]'::jsonb
   AND (i.photos->0->>'url') LIKE 'https://fillsell.app/landing/%';

INSERT INTO public.inventaire
SELECT (jsonb_populate_record(NULL::public.inventaire, b.avant)).*
  FROM public._backup_0511_compte_demo_relecteurs b
 WHERE b.nature = 'article'
   AND NOT EXISTS (SELECT 1 FROM public.inventaire i WHERE i.id = b.cle::bigint);

DROP TABLE public._backup_0511_compte_demo_relecteurs;
COMMIT;
