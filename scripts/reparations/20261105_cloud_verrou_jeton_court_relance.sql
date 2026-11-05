-- (05/11, règle de Nico) LES TÂCHES ARRÊTÉES PAR L'ANCIEN VERROU DE L'EXTENSION CLOUD REPARTENT. Le verrou ne regardait
-- que le jeton COURT (Beebs access_token, ~1 h) : expiré pendant la pause de messagerie de 02:48, il disait « beebs n'est pas
-- connecté dans ce navigateur, aucune visite » alors que le jeton long (refresh_token) était là — corrigé (jetonsConnexion.js :
-- connectée = jeton long ; le jeton court se renouvelle par une visite du site). Les tâches refusées 3 fois sont passées
-- « à relancer » (pas-de-rouge inconnu_relancer) : elles repartent comme un « Relancer » de l'app (StockTab,
-- relancerJobEchoue : pending, erreur archivée, attente et traces de geste attendu effacées).
-- Règle (pas le cas) : tâche en geste attendu dont la dernière erreur technique est ce refus du verrou. Le 05/11 à 11:40 :
-- 2 tâches, toutes deux du compte de Nico (publications Beebs « Veste lot F » et « Jean Lee », 10:32 et 10:33).
-- Inverse : 20261105_cloud_verrou_jeton_court_relance_INVERSE.sql.
BEGIN;
CREATE TABLE public._backup_0511_cloud_verrou_jeton AS
  SELECT now() AS le, to_jsonb(j.*) AS ligne FROM public.cross_post_jobs j
   WHERE j.status = 'needs_user'
     AND j.platform IN ('vinted', 'leboncoin', 'beebs', 'depop')
     AND j.platform_fields->'error_technique'->>'brut' LIKE '%n''est pas connecté dans ce navigateur, aucune visite%';
ALTER TABLE public._backup_0511_cloud_verrou_jeton ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_0511_cloud_verrou_jeton FROM PUBLIC, anon, authenticated;
UPDATE public.cross_post_jobs j
   SET status = 'pending', error = NULL,
       platform_fields = (j.platform_fields - 'next_action_after' - 'needs_user_tick_le' - 'needs_user_actif_ms' - 'needs_user_vu_le'
                          - 'needs_user_vu_erreur' - 'needs_user_source' - 'pas_de_rouge' - 'attente_session')
         || jsonb_build_object(
              'needsUserAttempts', 0,
              'pas_de_rouge_reprises', 0,
              'erreurs_archivees', COALESCE(j.platform_fields->'erreurs_archivees', '[]'::jsonb)
                || jsonb_build_array(jsonb_build_object('le', now(), 'statut', j.status, 'erreur', j.error, 'par', 'reparation_0511_verrou_jeton_court')),
              'relance_reparation', jsonb_build_object('le', now(), 'script', '20261105_cloud_verrou_jeton_court_relance'))
 WHERE j.status = 'needs_user'
   AND j.id IN (SELECT (b.ligne->>'id')::uuid FROM public._backup_0511_cloud_verrou_jeton b);
SELECT (SELECT count(*) FROM public._backup_0511_cloud_verrou_jeton) AS sauvegardees,
       (SELECT string_agg(left(j.id::text, 8) || ' ' || j.platform || ' ' || j.action || ' → ' || j.status, ' ; ')
          FROM public.cross_post_jobs j WHERE j.id IN (SELECT (b.ligne->>'id')::uuid FROM public._backup_0511_cloud_verrou_jeton b)) AS taches;
COMMIT;
