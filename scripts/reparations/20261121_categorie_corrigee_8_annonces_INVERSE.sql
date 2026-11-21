-- INVERSE de 20261121_categorie_corrigee_8_annonces.sql. La fusion des attributs (inventaire_attributs_avant_update) ne
-- retire jamais une clé : la catégorie corrigée est remplacée par un objet VIDE au même rang (« manuel ») — sans effet
-- (_shared/categorie-republication.js ne lit qu'un chemin). La tâche Vans reprend ses platform_fields d'avant si elle est
-- encore en file. Rien retiré, rien republié.
BEGIN;
UPDATE public.inventaire i
   SET attributs = jsonb_build_object('categorie_corrigee', jsonb_build_object('v', '{}'::jsonb, 'source', 'manuel', 'at', now()::text,
       'motif', 'inverse reparation_2111_coherence_categories'))
  FROM public._backup_2111_categorie_corrigee b
 WHERE b.quoi = 'inventaire' AND i.id = b.cle::bigint AND NOT (b.avant ? 'categorie_corrigee');
UPDATE public.cross_post_jobs j SET platform_fields = b.avant
  FROM public._backup_2111_categorie_corrigee b
 WHERE b.quoi = 'job' AND j.id = b.cle::uuid AND j.status = 'pending';
COMMIT;
