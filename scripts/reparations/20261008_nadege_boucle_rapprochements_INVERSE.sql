-- INVERSE de 20261008_nadege_boucle_rapprochements.sql (08/10/2026)
-- Remet les lignes de la boucle depuis la sauvegarde. Le trigger
-- rapprochements_jamais_repete (migration 20261008100000) sauterait des lignes
-- identiques : il est suspendu le temps de la remise, dans la transaction.
BEGIN;
ALTER TABLE public.rapprochements DISABLE TRIGGER rapprochements_jamais_repete;
INSERT INTO public.rapprochements (id, user_id, annonce_id, inventaire_id, decision, par, score, detail, created_at)
SELECT b.id, b.user_id, b.annonce_id, b.inventaire_id, b.decision, b.par, b.score, b.detail, b.created_at
  FROM public._backup_0810_boucle_rapprochements b
 WHERE NOT EXISTS (SELECT 1 FROM public.rapprochements r WHERE r.id = b.id);
ALTER TABLE public.rapprochements ENABLE TRIGGER rapprochements_jamais_repete;
SELECT count(*) lignes_annonce FROM public.rapprochements WHERE annonce_id = '7f1bb50d-3854-4ebd-af11-c96d03e6b30e';
COMMIT;
