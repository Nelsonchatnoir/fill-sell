-- INVERSE de 20261105_regle_vendu_retire_partout_rattrapage.sql : annule les retraits Beebs armés par le script tant qu'ils
-- ne sont pas partis (pending), et rouvre la question du Doudou. Un retrait déjà fait chez Beebs ne se défait pas ici.
BEGIN;
UPDATE public.cross_post_jobs j SET status = 'cancelled', error = 'Retrait annulé (inverse du rattrapage du 05/11).'
 WHERE j.action = 'delete' AND j.platform = 'beebs' AND j.status = 'pending'
   AND j.created_at BETWEEN (SELECT min(le) FROM public._backup_0511_vendu_retire_partout) AND (SELECT min(le) FROM public._backup_0511_vendu_retire_partout) + interval '10 minutes'
   AND j.inventaire_id IN (1790106697754007, (SELECT (ligne->>'inventaire_id')::bigint FROM public._backup_0511_vendu_retire_partout WHERE t = 'cross_post_jobs'));
UPDATE public.inventaire_doublons d SET statut = b.ligne->>'statut', decide_le = NULL, decide_par = NULL
  FROM public._backup_0511_vendu_retire_partout b
 WHERE b.t = 'inventaire_doublons' AND d.id = b.cle::uuid;
COMMIT;
