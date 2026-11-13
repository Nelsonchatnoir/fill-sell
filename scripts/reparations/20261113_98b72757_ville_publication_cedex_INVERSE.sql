-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- INVERSE de 20261113_98b72757_ville_publication_cedex.sql — le réglage retrouve sa valeur d'avant (Cholet 49308)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- SEULEMENT si le réglage porte encore exactement ce que la réparation a écrit (Cholet 49300) : une valeur changée
-- depuis par la personne n'est jamais touchée. Écriture par platform_settings_fusionner. La sauvegarde reste en place
-- (preuve) ; à supprimer à la main une fois l'inverse validé. Sans effet sur les publications (get-pending-jobs les
-- sert avec Cholet 49300 dans les deux cas, règle N6b).
-- À jouer : npx supabase db query --linked -f scripts/reparations/20261113_98b72757_ville_publication_cedex_INVERSE.sql
BEGIN;
SET LOCAL lock_timeout = '5s';

DO $garde$
BEGIN
  IF to_regclass('public._backup_1311_98b72757_ville_publication') IS NULL THEN
    RAISE EXCEPTION 'sauvegarde absente : la réparation n''a pas été jouée, rien à rendre';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p JOIN public._backup_1311_98b72757_ville_publication b ON b.user_id = p.id
     WHERE p.platform_settings -> 'leboncoin' -> 'ville_publication' = b.ville_publication_apres
  ) THEN
    RAISE EXCEPTION 'le réglage a changé depuis la réparation (geste de la personne) : rien n''est rendu';
  END IF;
END
$garde$;

SELECT public.platform_settings_fusionner(
         array['leboncoin'],
         jsonb_build_object('ville_publication', b.ville_publication_avant),
         '{}'::text[],
         b.user_id
       ) -> 'leboncoin' -> 'ville_publication' AS ville_publication_rendue
  FROM public._backup_1311_98b72757_ville_publication b
 WHERE b.ville_publication_avant IS NOT NULL;

SELECT b.user_id, b.ville_publication_avant, p.platform_settings -> 'leboncoin' -> 'ville_publication' AS ville_publication_maintenant
  FROM public._backup_1311_98b72757_ville_publication b JOIN public.profiles p ON p.id = b.user_id;
COMMIT;
