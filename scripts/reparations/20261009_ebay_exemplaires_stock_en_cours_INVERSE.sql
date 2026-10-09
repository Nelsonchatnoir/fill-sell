-- INVERSE de scripts/reparations/20261009_ebay_exemplaires_stock_en_cours.sql (09/10 soir).
-- Rend aux trois fiches et à TOUS leurs jobs leur ligne entière d'avant (sans
-- déclencheurs : session_replication_role local), annule les retraits armés depuis
-- (s'ils n'ont pas encore été exécutés — un retrait exécuté a supprimé l'annonce chez
-- la plateforme, ce qui ne se défait pas ici), retire les décisions et les lignes de
-- journal posées, éteint une note de vente née du passage.
-- npx supabase db query --linked -f scripts/reparations/20261009_ebay_exemplaires_stock_en_cours_INVERSE.sql
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL session_replication_role = replica;

DO $r$
DECLARE t text; cols text; v_debut timestamptz;
BEGIN
  SELECT (ligne ->> 'le')::timestamptz INTO v_debut FROM _backup_0910_ebay_exemplaires WHERE k = 'debut';
  FOREACH t IN ARRAY ARRAY['inventaire', 'cross_post_jobs'] LOOP
    SELECT string_agg(format('%I = r.%I', column_name, column_name), ', ' ORDER BY ordinal_position) INTO cols
      FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = t AND column_name <> 'id' AND is_generated = 'NEVER';
    EXECUTE format(
      'UPDATE public.%I x SET %s FROM public._backup_0910_ebay_exemplaires b, jsonb_populate_record(NULL::public.%I, b.ligne) r
        WHERE b.k = %L AND x.id = r.id',
      t, cols, t, CASE t WHEN 'inventaire' THEN 'inventaire' ELSE 'job' END);
  END LOOP;
  UPDATE cross_post_jobs SET status = 'cancelled',
         error = 'Retrait annulé : la décision « commande eBay » du 09/10 a été défaite (inverse).'
   WHERE inventaire_id IN (1791015782859, 1790174168241, 1790174236694) AND action = 'delete'
     AND status IN ('pending', 'needs_user') AND created_at > v_debut;
  DELETE FROM ventes_ebay_exemplaires WHERE vente_id IN (99461, 52666, 99441);
  DELETE FROM inventaire_journal WHERE inventaire_id IN (1791015782859, 1790174168241, 1790174236694)
     AND source = 'commande_ebay' AND created_at > v_debut;
  UPDATE push_ventes SET statut = 'ignoree', motif = 'inverse_commande_ebay', traite_le = now()
   WHERE inventaire_id IN (1791015782859, 1790174168241, 1790174236694) AND statut = 'a_envoyer' AND part_le IS NULL AND cree_le > v_debut;
END $r$;

SET LOCAL session_replication_role = origin;
COMMIT;
