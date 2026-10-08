-- ════════════════════════════════════════════════════════════════════════════
-- INVERSE DES FUSIONS « REMISE EN LIGNE VINTED » D'UN COMPTE (08/10/2026 soir)
-- ════════════════════════════════════════════════════════════════════════════
-- Défait, UNE PAR UNE et dans l'ordre inverse, les fusions journalisées par la
-- règle (inventaire_fusions.par = 'utilisateur:photo_rapprochement_v3_remise',
-- non défaites) : inventaire_defusionner rend chaque identité Vinted à sa fiche
-- (échange compris), les jobs et les annonces à leur fiche d'avant
-- (inventaire_defusionner_pour : la voie de l'app, sans session ici). Puis les
-- jobs Vinted que la règle a clos (« remplacée, pas une vente ») retrouvent
-- leur statut d'avant. __USER__ est remplacé par le lanceur ; __DEPUIS__ par la
-- date du rattrapage (ISO). Rien d'autre n'est touché.
BEGIN;
SET LOCAL statement_timeout = '120s';
DO $inv$
DECLARE f record; n integer := 0; r jsonb;
BEGIN
  FOR f IN SELECT id FROM inventaire_fusions
            WHERE user_id = '__USER__' AND par = 'utilisateur:photo_rapprochement_v3_remise'
              AND defait_le IS NULL AND created_at >= '__DEPUIS__'::timestamptz
            ORDER BY created_at DESC LOOP
    r := public.inventaire_defusionner_pour('__USER__'::uuid, f.id, 'utilisateur:inverse_remise_en_ligne_0810');
    n := n + 1;
  END LOOP;
  RAISE NOTICE 'fusions défaites : %', n;
END
$inv$;
UPDATE cross_post_jobs
   SET status = COALESCE(platform_fields -> 'remplacee_par' ->> 'statut_avant', 'published'),
       error = NULL,
       platform_fields = platform_fields - 'remplacee_par'
 WHERE user_id = '__USER__' AND platform = 'vinted' AND status = 'cancelled'
   AND platform_fields -> 'remplacee_par' ->> 'par' = 'rapprochement_v3'
   AND (platform_fields -> 'remplacee_par' ->> 'le')::timestamptz >= '__DEPUIS__'::timestamptz;
COMMIT;
