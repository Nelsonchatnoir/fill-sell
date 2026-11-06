-- Inverse de 20261106_couples_vrais_retraits_<lot>.sql : les retraits créés et ENCORE en attente sont annulés (rien
-- n'a encore été retiré chez la plateforme pour eux). Un retrait déjà fait ne se défait pas ici : l'annonce se republie.
BEGIN;
UPDATE public.cross_post_jobs j
   SET status = 'cancelled', error = 'Retrait annulé (inverse de la réparation du 06/11, couples vrais).'
  FROM public._backup_0611_couples_retraits b
 WHERE j.id = b.retrait_cree AND j.action = 'delete' AND j.status = 'pending';
SELECT b.lot, b.listing_id, j.status FROM public._backup_0611_couples_retraits b LEFT JOIN public.cross_post_jobs j ON j.id = b.retrait_cree;
COMMIT;
