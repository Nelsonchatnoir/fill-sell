-- INVERSE : remet les fiches de test (les jobs et annonces gardent leur lien
-- inventaire_id remis à NULL par la suppression : on le repose).
INSERT INTO public.inventaire SELECT * FROM public._backup_0510_fiches_test_nico ON CONFLICT (id) DO NOTHING;
UPDATE public.cross_post_jobs c SET inventaire_id = b.inventaire_id
  FROM public._backup_0510_fiches_test_nico_jobs b WHERE c.id = b.id AND c.inventaire_id IS NULL;
UPDATE public.annonces_plateforme a SET inventaire_id = b.inventaire_id
  FROM public._backup_0510_fiches_test_nico_annonces b WHERE a.id = b.id AND a.inventaire_id IS NULL;
