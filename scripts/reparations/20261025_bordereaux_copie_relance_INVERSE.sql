-- INVERSE de 20261025_bordereaux_copie_relance.sql : retire les demandes posées par la relance qu'aucun poste n'a encore
-- prises (statut « demandee »). Une demande déjà prise a lu le fichier chez Vinted : sa copie reste (5 jours au plus,
-- effacée par bordereaux-purge) ; rien n'est commandé ni payé chez Vinted par une demande « recuperer ».
BEGIN;
SET LOCAL lock_timeout = '5s';
DELETE FROM public.bordereaux_demandes d
 USING public._backup_2510_bordereaux_relance b
 WHERE d.id = b.demande_id AND d.statut = 'demandee';
SELECT count(*) AS demandes_restantes_de_la_relance
  FROM public.bordereaux_demandes d JOIN public._backup_2510_bordereaux_relance b ON b.demande_id = d.id;
COMMIT;
