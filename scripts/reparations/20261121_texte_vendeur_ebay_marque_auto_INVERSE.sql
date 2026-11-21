-- INVERSE de 20261121_texte_vendeur_ebay_marque_auto.sql : la marque « texte_vendeur_a_remettre » part des tâches marquées
-- (celles de la sauvegarde) — une tâche que l'entretien a déjà corrigée garde sa correction (texte_vendeur_remis : la
-- description d'avant est dans la sauvegarde de la fiche, _backup_2111_texte_ia_8fd44622).
BEGIN;
UPDATE public.cross_post_jobs j SET platform_fields = j.platform_fields - 'texte_vendeur_a_remettre'
  FROM public._backup_2111_texte_vendeur_marque b WHERE j.id = b.id AND j.platform_fields ? 'texte_vendeur_a_remettre';
SELECT count(*) AS marques_restantes FROM public.cross_post_jobs j JOIN public._backup_2111_texte_vendeur_marque b ON b.id = j.id
 WHERE j.platform_fields ? 'texte_vendeur_a_remettre';
COMMIT;
