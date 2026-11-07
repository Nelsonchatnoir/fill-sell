-- INVERSE de 20261107_louis_retraits_vendues_closes_* (tenue, retraits, libérations) :
--   1. les retraits créés et ENCORE en attente sont annulés (rien n'a encore été retiré chez Leboncoin pour eux) — un
--      retrait déjà fait ne se défait pas ici (l'annonce vendue est supprimée chez Leboncoin) ;
--   2. les remises ENCORE en attente retrouvent leur marqueur de série d'avant la tenue (sauvegarde), sans tenue ni
--      sortie de série. Une remise déjà partie n'est pas touchée.
BEGIN;
UPDATE public.cross_post_jobs j
   SET status = 'cancelled', error = 'Retrait annulé (inverse de la réparation du 07/11 nuit, vendues closes de Louis).'
  FROM public._backup_0711_louis_retraits_vendues b
 WHERE b.t = 'retrait' AND j.id = b.retrait_cree AND j.action = 'delete' AND j.status = 'pending';
UPDATE public.cross_post_jobs j
   SET platform_fields = (j.platform_fields - 'serie_sortie')
         || jsonb_build_object('serie_un_par_un', b.ligne #> '{platform_fields,serie_un_par_un}')
  FROM public._backup_0711_louis_retraits_vendues b
 WHERE b.t = 'remise' AND j.id::text = b.cle AND j.status = 'pending'
   AND b.ligne #> '{platform_fields,serie_un_par_un}' IS NOT NULL;
SELECT b.t, b.cle, j.status FROM public._backup_0711_louis_retraits_vendues b
  LEFT JOIN public.cross_post_jobs j ON j.id = COALESCE(b.retrait_cree, CASE WHEN b.t = 'remise' THEN b.cle::uuid END)
 ORDER BY b.t, b.cle;
COMMIT;
