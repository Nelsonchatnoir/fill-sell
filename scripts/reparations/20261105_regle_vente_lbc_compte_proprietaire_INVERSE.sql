-- INVERSE de 20261105_regle_vente_lbc_compte_proprietaire.sql : chaque vente déplacée revient au compte d'avant (sauvegarde
-- public._backup_0511_vente_lbc_compte_proprietaire), seulement si elle est toujours chez le compte où le script l'a mise.
BEGIN;
UPDATE public.ventes v SET user_id = b.user_id_avant
  FROM public._backup_0511_vente_lbc_compte_proprietaire b
 WHERE v.id = b.vente_id AND v.user_id = b.user_id_apres;
SELECT b.vente_id, left(v.user_id::text, 8) AS compte
  FROM public._backup_0511_vente_lbc_compte_proprietaire b JOIN public.ventes v ON v.id = b.vente_id;
COMMIT;
