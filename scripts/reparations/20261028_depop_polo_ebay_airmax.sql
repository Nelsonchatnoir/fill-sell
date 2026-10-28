-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- JOUÉES le 28/10 ~22:25 (mission de Nico « débloquer tous les utilisateurs »), points 11 a et 11 b.
-- Circuit : copier chaque bloc dans scripts/reparations/20261028_<sujet>.sql, essai ROLLBACK, relecture, COMMIT.
-- Passage : npx supabase db query --linked -f <fichier>. Sauvegardes : GRANT SELECT … TO service_role si une
-- fonction doit les lire (NOTIFY pgrst, 'reload schema' juste après une création lue par l'API).
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════

-- ── 11 a — gatignol.pro, publication Depop « Polo Province Of Canada » (6584f843) ──────────────────────────────
-- Retour à l'attente de la configuration vendeur Depop du compte (carte « À régler »), comme ses quatre sœurs
-- (b18e096e éclaireur revu au mur le 28/10 à 12:19, 8a109727, 85e83806, aa4042a9). Elle repartira seule quand Depop
-- acceptera le vendeur (update-job-status, « contrôle vendeur passé »). Rien chez Depop, rien sur l'annonce.
BEGIN;
CREATE TABLE IF NOT EXISTS public._backup_2810_polo_vendeur_depop AS
  SELECT id, status, error, platform_fields, now() AS sauve_le
    FROM public.cross_post_jobs WHERE id = '6584f843-ed1a-4bde-aa9b-f489ca5ee840';
ALTER TABLE public._backup_2810_polo_vendeur_depop ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_2810_polo_vendeur_depop FROM PUBLIC, anon, authenticated;
UPDATE public.cross_post_jobs SET
  error = 'Depop demande de terminer ta configuration de vendeur (ajouter un moyen de paiement) avant ta première mise en ligne. '
       || 'Fais-le une seule fois sur depop.com, sur ton ordinateur : tes publications Depop repartiront toutes seules. Rien n''a été publié ni retiré.',
  platform_fields = platform_fields || jsonb_build_object(
    'needs_user_source', 'depop_vendeur',
    'erreurs_archivees', coalesce(platform_fields->'erreurs_archivees', '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
      'le', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), 'statut', 'needs_user', 'erreur', error,
      'par', 'réparation 28/10 (point 11 a : retour à l''attente vendeur Depop)')))
WHERE id = '6584f843-ed1a-4bde-aa9b-f489ca5ee840'
  AND status = 'needs_user'
  AND coalesce(platform_fields->>'needs_user_source', '') <> 'depop_vendeur'
  AND platform_fields->'last_diagnostic'->>'quoi' = 'depop_vendeur_a_configurer';
SELECT id, status, left(error, 80) AS error, platform_fields->>'needs_user_source' AS source,
       jsonb_array_length(platform_fields->'erreurs_archivees') AS archives
  FROM public.cross_post_jobs WHERE id = '6584f843-ed1a-4bde-aa9b-f489ca5ee840';
COMMIT;
-- INVERSE :
-- UPDATE public.cross_post_jobs j SET error = b.error, platform_fields = b.platform_fields
--   FROM public._backup_2810_polo_vendeur_depop b WHERE j.id = b.id;

-- ── 11 b — mataich67, publication eBay « Air Max Command enfant » (43e3371c, annonce 336857790393) ──────────────
-- La ligne est ROUGE (failed, « eBay n'a donné aucun motif ») alors que la page publique d'eBay, relue le 27/10, dit :
-- « Le vendeur a mis fin à cette annonce le 24/10 à 16:07, car elle comportait une erreur » — en ligne du 22/10 21:53
-- au 24/10 16:07, aucune vente. La règle du 24/10 (trancher_publications_sans_lien, migration 20261024140000) clôt
-- ce cas SANS rouge ; elle n'a pas joué faute de fin_ebay (compte sans API eBay : la veille ne l'a pas lue).
-- Même écriture que la règle (texte compris). Rien relancé (décision de Nico, 27/10). Quotas : inchangés (refund déjà
-- tranché « sans_reservation » le 25/10). 24/10 = heure d'été : 16:07 Paris = 14:07 UTC.
BEGIN;
CREATE TABLE IF NOT EXISTS public._backup_2810_ebay_arretee_mataich AS
  SELECT id, status, error, platform_fields, now() AS sauve_le
    FROM public.cross_post_jobs WHERE id = '43e3371c-39bd-45ec-9686-05e500000828';
ALTER TABLE public._backup_2810_ebay_arretee_mataich ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_2810_ebay_arretee_mataich FROM PUBLIC, anon, authenticated;
UPDATE public.cross_post_jobs SET
  status = 'cancelled',
  error = 'Cette annonce a bien été en ligne sur eBay, puis elle y a été arrêtée le 24/10 à 16h07 — pas par FillSell, et sans vente. '
       || 'Ce n''est pas un refus d''eBay. Ton article reste dans ton stock ; si cet arrêt n''était pas voulu, relance la publication depuis la fiche.',
  platform_fields = (platform_fields - ARRAY['sale_signal', 'unavailable_since', 'unavailable_pending_since', 'pas_encore_visible'])
    || jsonb_build_object(
      'fin_ebay', jsonb_build_object('fin', '2026-10-24T14:07:00Z', 'vendus', 0, 'lu_le', '2026-10-27',
        'source', 'page publique eBay relue le 27/10 : « Le vendeur a mis fin à cette annonce … car elle comportait une erreur »'),
      'depot_jamais_en_ligne', coalesce(platform_fields->'depot_jamais_en_ligne', '{}'::jsonb)
        || jsonb_build_object('issue', 'arretee_sur_ebay', 'fin', '2026-10-24T14:07:00Z', 'reecrit_le', now()),
      'erreurs_archivees', coalesce(platform_fields->'erreurs_archivees', '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
        'le', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), 'statut', 'failed', 'erreur', error,
        'par', 'réparation 28/10 (point 11 b : arrêtée sur eBay par le vendeur, page relue le 27/10)')))
WHERE id = '43e3371c-39bd-45ec-9686-05e500000828' AND status = 'failed';
SELECT id, status, left(error, 90) AS error, platform_fields->'fin_ebay' AS fin_ebay
  FROM public.cross_post_jobs WHERE id = '43e3371c-39bd-45ec-9686-05e500000828';
COMMIT;
-- INVERSE :
-- UPDATE public.cross_post_jobs j SET status = b.status, error = b.error, platform_fields = b.platform_fields
--   FROM public._backup_2810_ebay_arretee_mataich b WHERE j.id = b.id;
