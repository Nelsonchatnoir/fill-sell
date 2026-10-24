-- ════════════════════════════════════════════════════════════════════════════
-- INVERSE DES FUSIONS « REMISE EN LIGNE VINTED » D'UN COMPTE (08/10/2026 soir)
-- ════════════════════════════════════════════════════════════════════════════
-- Défait, UNE PAR UNE et dans l'ordre inverse, les fusions journalisées par la
-- règle (inventaire_fusions.par = 'utilisateur:photo_rapprochement_v3_remise',
-- non défaites) : inventaire_defusionner rend chaque identité Vinted à sa fiche
-- (échange compris), les jobs et les annonces à leur fiche d'avant
-- (inventaire_defusionner_pour : la voie de l'app, sans session ici). Puis les
-- jobs Vinted que la règle a clos (« remplacée, pas une vente ») retrouvent
-- leur statut d'avant, et (24/10) les questions qu'elle a closes « caduque »
-- se rouvrent. __USER__ est remplacé par le lanceur ; __DEPUIS__ par la
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
-- (24/10) Les questions encore ouvertes que la règle a closes « caduque » (une de leurs fiches absorbée par une de
-- ces fusions) retrouvent leur état d'avant, lu dans la sauvegarde du compte prise juste avant le rattrapage.
UPDATE inventaire_doublons d
   SET statut = b.statut, decide_le = b.decide_le, decide_par = b.decide_par
  FROM (SELECT DISTINCT ON (s.id) s.id, s.statut, s.decide_le, s.decide_par
          FROM public._backup_0810_remise_doublons s
         WHERE s.user_id = '__USER__' AND s.sauvegarde_le >= '__DEPUIS__'::timestamptz
         ORDER BY s.id, s.sauvegarde_le) b
 WHERE d.id = b.id AND d.user_id = '__USER__' AND b.statut = 'proposee'
   AND d.statut = 'caduque' AND d.decide_par = 'rapprochement_v3' AND d.decide_le >= '__DEPUIS__'::timestamptz
   AND EXISTS (SELECT 1 FROM inventaire_fusions f
                WHERE f.user_id = '__USER__' AND f.par = 'utilisateur:photo_rapprochement_v3_remise'
                  AND f.created_at >= '__DEPUIS__'::timestamptz AND f.absorbe IN (d.garde, d.absorbe));
COMMIT;
