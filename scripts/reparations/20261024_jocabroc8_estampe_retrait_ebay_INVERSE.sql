-- Inverse de scripts/reparations/20261024_jocabroc8_estampe_retrait_ebay.sql (jocabroc8, estampe en double).
-- · Retrait pas encore fait (pending / needs_user) : il est annulé, rien n'est parti chez eBay. Un retrait en cours
--   chez l'extension (processing) n'est jamais touché : relancer cet inverse après sa fin.
-- · Retrait fait (deleted) : l'annonce 407302958488 est TERMINÉE chez eBay, ce qui ne se défait pas d'ici. La remettre
--   en vente : « Remettre en vente » sur eBay par le vendeur, ou une publication depuis la fiche 1791040801501. Les
--   lignes d'avant (publication b55aefd3, annonce relevée 9d6878eb) restent dans les sauvegardes
--   _backup_2410_jocabroc8_estampe_jobs / _annonces : les rendre telles quelles sur une annonce terminée ferait
--   naître une fausse question « vendue ? ».
-- · La phrase du job 20587777 est rendue telle qu'avant.
BEGIN;
SET LOCAL statement_timeout = '60s';

UPDATE public.cross_post_jobs d
   SET status = 'cancelled',
       error = 'Retrait annulé avant d''être fait (inverse du script du 24/10) : rien n''a été touché chez eBay.'
 WHERE d.platform_fields #>> '{arme_par,pose_par}' = 'scripts/reparations/20261024_jocabroc8_estampe_retrait_ebay.sql'
   AND d.action = 'delete' AND d.status IN ('pending', 'needs_user');

UPDATE public.cross_post_jobs c
   SET error = b.error
  FROM public._backup_2410_jocabroc8_estampe_jobs b
 WHERE c.id = '20587777-4821-4548-ac1b-9c14722a4c43' AND b.id = c.id;

SELECT d.id, d.status, left(d.error, 100) AS motif
  FROM public.cross_post_jobs d
 WHERE d.platform_fields #>> '{arme_par,pose_par}' = 'scripts/reparations/20261024_jocabroc8_estampe_retrait_ebay.sql'
    OR d.id = '20587777-4821-4548-ac1b-9c14722a4c43';
COMMIT;
