-- INVERSE de 20261115_ventes_doutes_remises.sql : retire les 14 ventes remises (par leur id, seulement si elles portent
-- encore la commande remise), rend aux pierres tombales leur source et leur motif d'avant, garde la sauvegarde (renommée).
-- La suppression est JOURNALISÉE (ventes_suppressions_journal, motif posé) ; aucune pierre tombale neuve (rôle serveur) ;
-- les déclencheurs de push ne regardent que l'INSERT. À jouer seulement sur ordre de Nico, et APRÈS l'inverse de
-- 20261115_ventes_champs_rendus.sql si les deux sont à défaire (l'ordre inverse de leur passage).
BEGIN;
SET LOCAL lock_timeout = '5s';
DO $inverse$
DECLARE v_n integer;
BEGIN
  IF to_regclass('public._backup_1511b_ventes_doutes') IS NULL THEN RAISE EXCEPTION 'sauvegarde absente : rien à défaire'; END IF;
  PERFORM set_config('fillsell.motif_suppression_ventes', 'inverse_doutes_remises_1511', true);
  DELETE FROM public.ventes v USING public._backup_1511b_ventes_doutes b
   WHERE b.decision = 'remise' AND v.id = b.vente_id AND v.user_id = b.user_id AND v.commande_ref IS NOT DISTINCT FROM b.commande_ref;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  UPDATE public.ventes_supprimees s SET source = r.source_avant, motif = r.motif_avant
    FROM public._backup_1511b_ventes_doutes b JOIN public._backup_1511_ventes_reinitialisation r ON r.supprimee_id = b.supprimee_id
   WHERE b.decision = 'remise' AND s.id = b.supprimee_id;
  ALTER TABLE public._backup_1511b_ventes_doutes RENAME TO _backup_1511b_ventes_doutes_defait;
  RAISE NOTICE 'ventes retirées : %', v_n;
END
$inverse$;
COMMIT;
