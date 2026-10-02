-- ═══════════════════════════════════════════════════════════════════════════
-- INVERSE du rattachement des ventes RELEVÉES par le second temps (0.6.88 +
-- migration 20261002210000) — 02/10 soir, point 9. NE PAS EXÉCUTER sans décision.
-- ═══════════════════════════════════════════════════════════════════════════
-- Ce rattachement n'est pas un script : c'est la RPC enregistrer_ventes_relevees
-- qui relie chaque vente relevée à sa fiche quand l'extension lit le numéro
-- d'annonce (item_id Vinted), et qui fusionne la ligne relevée dans la vente
-- saisie de la même cession. Pour le défaire :
--   · les ventes créées avant le 02/10 20:00 sont dans la sauvegarde
--     _backup_0210_ventes_rattrapage (lignes complètes) : on remet à l'état
--     sauvegardé les seuls champs que le second temps remplit ;
--   · une ligne relevée FUSIONNÉE (supprimée) est gardée entière dans
--     usage_logs (feature 'vente_fusionnee', metadata.fusionnee) : on la
--     réinsère telle quelle.
-- Bornes : seulement ce qui a bougé APRÈS la mise en service (releve_le ≥ T0).
BEGIN;
SET LOCAL lock_timeout = '3s';

-- T0 = mise en service de la migration 20261002210000 (02/10 ~19:45 Paris).
CREATE TEMP TABLE _t0 ON COMMIT DROP AS SELECT '2026-10-02 17:40:00+00'::timestamptz AS t0;

-- 1. Les lignes fusionnées, réinsérées depuis leur trace.
INSERT INTO public.ventes
SELECT (jsonb_populate_record(NULL::public.ventes, u.metadata -> 'fusionnee')).*
  FROM public.usage_logs u, _t0
 WHERE u.feature = 'vente_fusionnee' AND u.created_at >= _t0.t0
   AND u.metadata ->> 'par' = 'enregistrer_ventes_relevees'
   AND NOT EXISTS (SELECT 1 FROM public.ventes v WHERE v.id = (u.metadata -> 'fusionnee' ->> 'id')::bigint);

-- 2. Les champs remplis par le second temps, remis à l'état sauvegardé.
UPDATE public.ventes v SET
  inventaire_id = b.inventaire_id, annonce_id = b.annonce_id, prix_achat = b.prix_achat, benefice = b.benefice,
  commande_ref = b.commande_ref, plateforme_code = b.plateforme_code, vendu_le = b.vendu_le,
  frais_plateforme = b.frais_plateforme, devise = b.devise, releve_le = b.releve_le
  FROM public._backup_0210_ventes_rattrapage b, _t0
 WHERE v.id = b.id AND v.releve_le >= _t0.t0
   AND (v.inventaire_id IS DISTINCT FROM b.inventaire_id OR v.annonce_id IS DISTINCT FROM b.annonce_id
        OR v.commande_ref IS DISTINCT FROM b.commande_ref);

-- 3. Les ventes saisies PLUS ANCIENNES complétées par le second temps (sauvegarde
--    _backup_0210_ventes_saisies_second_temps, prise le 02/10 ~21:15).
UPDATE public.ventes v SET
  inventaire_id = b.inventaire_id, annonce_id = b.annonce_id, prix_achat = b.prix_achat, benefice = b.benefice,
  commande_ref = b.commande_ref, plateforme_code = b.plateforme_code, vendu_le = b.vendu_le,
  frais_plateforme = b.frais_plateforme, devise = b.devise, releve_le = b.releve_le
  FROM public._backup_0210_ventes_saisies_second_temps b, _t0
 WHERE v.id = b.id AND v.releve_le >= _t0.t0;

COMMIT;
