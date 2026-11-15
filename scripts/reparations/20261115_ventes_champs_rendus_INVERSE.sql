-- INVERSE de 20261115_ventes_champs_rendus.sql : chaque champ rendu reprend sa valeur d'avant (vide), SEULEMENT s'il
-- porte encore la valeur rendue (un champ changé depuis par la personne garde sa valeur) ; le lien vers la fiche n'est
-- défait que s'il pointe encore vers la fiche reliée. Aucune fiche n'est touchée ; aucun déclencheur UPDATE sur ventes.
-- La sauvegarde est gardée (renommée). À jouer seulement sur ordre de Nico, AVANT l'inverse des doutes remis.
BEGIN;
SET LOCAL lock_timeout = '5s';
DO $inverse$
DECLARE v_n integer;
BEGIN
  IF to_regclass('public._backup_1511c_ventes_champs_rendus') IS NULL THEN RAISE EXCEPTION 'sauvegarde absente : rien à défaire'; END IF;
  UPDATE public.ventes v
     SET prix_achat       = CASE WHEN b.prix_achat_avant IS NULL AND v.prix_achat IS NOT DISTINCT FROM b.prix_achat_lu THEN NULL ELSE v.prix_achat END,
         benefice         = CASE WHEN b.benefice_avant IS NULL AND b.prix_achat_avant IS NULL AND v.benefice IS NOT DISTINCT FROM b.benefice_lu THEN NULL ELSE v.benefice END,
         selling_fees     = CASE WHEN b.selling_fees_avant IS NULL AND v.selling_fees IS NOT DISTINCT FROM b.selling_fees_lu THEN NULL ELSE v.selling_fees END,
         frais_plateforme = CASE WHEN b.frais_plateforme_avant IS NULL AND v.frais_plateforme IS NOT DISTINCT FROM b.frais_plateforme_lu THEN NULL ELSE v.frais_plateforme END,
         marque           = CASE WHEN b.marque_avant IS NULL AND v.marque IS NOT DISTINCT FROM b.marque_lu THEN NULL ELSE v.marque END,
         inventaire_id    = CASE WHEN b.lien = 'reliee' AND v.inventaire_id = b.fiche_id THEN NULL ELSE v.inventaire_id END
    FROM public._backup_1511c_ventes_champs_rendus b
   WHERE b.id = v.id;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  ALTER TABLE public._backup_1511c_ventes_champs_rendus RENAME TO _backup_1511c_ventes_champs_rendus_defait;
  RAISE NOTICE 'ventes remises dans leur état d''avant : %', v_n;
END
$inverse$;
COMMIT;
