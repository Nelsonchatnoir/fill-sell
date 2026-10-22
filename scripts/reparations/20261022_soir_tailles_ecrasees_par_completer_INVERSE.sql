-- INVERSE de 20261022_soir_tailles_ecrasees_par_completer.sql : chaque fiche reprend la taille d'avant la réparation
-- (_backup_2210_soir_tailles.taille_avant), seulement si personne n'y a touché depuis (taille = celle posée ici).
BEGIN;
UPDATE public.inventaire i SET attributs = jsonb_set(i.attributs, '{taille}', b.taille_avant)
  FROM public._backup_2210_soir_tailles b
 WHERE i.id = b.inventaire_id AND i.attributs -> 'taille' = b.taille_apres;
SELECT b.inventaire_id, i.attributs -> 'taille' ->> 'v' AS taille FROM public._backup_2210_soir_tailles b JOIN public.inventaire i ON i.id = b.inventaire_id;
COMMIT;
