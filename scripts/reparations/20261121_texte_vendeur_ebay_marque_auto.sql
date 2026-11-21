-- (21/11/2026 midi, point 4 de Nico : « la correction doit partir TOUTE SEULE dès que ses fiches sont relues. Plus aucune
-- relance à la main ») LA MARQUE « texte_vendeur_a_remettre » sur les annonces eBay EN LIGNE publiées par l'API dont la fiche
-- attend le texte du vendeur (marqueur « à relire » : attributs.description_source.via = 'reference_a_relire'). L'entretien
-- d'ebay-api-worker (_shared/remise-texte-vendeur-ebay.ts) les relit une passe sur cinq : texte pas encore lu → rien ; lu → le
-- texte du vendeur est remis sur place (description seule), la marque part. Lu en prod le 21/11 ~13:00 : 4 tâches, toutes du
-- compte 8fd44622 (407375028015, 407375028601, 407375028972, 407375034126). Règle, pas cas : toute fiche « à relire » publiée
-- sur eBay par l'API ; une tâche déjà marquée ou déjà corrigée (texte_vendeur_remis) n'est pas touchée.
-- Sauvegarde : _backup_2111_texte_vendeur_marque ; inverse : 20261121_texte_vendeur_ebay_marque_auto_INVERSE.sql.
-- Lancer : npx supabase db query --linked --yes -f scripts/reparations/20261121_texte_vendeur_ebay_marque_auto.sql
BEGIN;
SET LOCAL lock_timeout = '5s';
CREATE TABLE public._backup_2111_texte_vendeur_marque AS
  SELECT now() AS le, j.id, j.user_id, j.platform_fields
    FROM public.cross_post_jobs j JOIN public.inventaire i ON i.id = j.inventaire_id AND i.user_id = j.user_id
   WHERE j.platform = 'ebay' AND j.voie = 'api' AND j.status = 'published'
     AND i.attributs -> 'description_source' ->> 'via' = 'reference_a_relire'
     AND NOT (j.platform_fields ? 'texte_vendeur_a_remettre') AND NOT (j.platform_fields ? 'texte_vendeur_remis');
ALTER TABLE public._backup_2111_texte_vendeur_marque ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_2111_texte_vendeur_marque FROM PUBLIC, anon, authenticated;
DO $$ DECLARE n int := (SELECT count(*) FROM public._backup_2111_texte_vendeur_marque);
BEGIN IF n = 0 OR n > 20 THEN RAISE EXCEPTION 'tâches à marquer : % (attendu 1 à 20, relire)', n; END IF; END $$;
UPDATE public.cross_post_jobs j
   SET platform_fields = COALESCE(j.platform_fields, '{}'::jsonb) || jsonb_build_object('texte_vendeur_a_remettre',
       jsonb_build_object('demande_le', now(), 'par', 'réparation du 21/11 (point 4 de Nico)', 'essais', 0))
  FROM public._backup_2111_texte_vendeur_marque b
 WHERE j.id = b.id AND j.status = 'published';
SELECT left(j.user_id::text, 8) AS compte, j.platform_listing_id, j.platform_fields -> 'texte_vendeur_a_remettre' AS marque
  FROM public.cross_post_jobs j JOIN public._backup_2111_texte_vendeur_marque b ON b.id = j.id ORDER BY j.platform_listing_id;
COMMIT;
