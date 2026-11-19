-- ═══════════════════════════════════════════════════════════════════════════
-- REPRISE 19/11/2026 — les suivis « groupe » déjà posés sur un article DÉJÀ VENDU partent « vendu, encore en ligne »
-- (terminal t5 — PRÉPARÉE, NON JOUÉE : feu vert de Nico ; APRÈS la migration 20261119150000, dont elle appelle la règle)
-- ═══════════════════════════════════════════════════════════════════════════
-- Le même geste que la règle (rapprochement_v3_vendu_encore_en_ligne), pour les suivis posés AVANT elle : une tâche de
-- SUIVI (source « releve ») rattachée par la branche « groupe » ou « à vérifier » (rattachement.groupe_creation) du moteur
-- v3 à une fiche VENDUE, alors que la vente était DÉJÀ enregistrée au moment du rattachement, dont l'annonce vit encore,
-- sur une autre plateforme que la vente, sans retrait ouvert. Annulée + pending_removal + marque : la personne voit
-- « Vendu, encore en ligne — Retirer » dans « À régler » et décide. JAMAIS un retrait créé ici.
-- Simulée le 19/11 (lecture seule) : 1 ligne — compte ee6173b8, eBay 146078532793 (tâche d7542d32), fiche 1793436393772.
-- Sauvegarde AVANT écriture : public._backup_1911_groupe_vendu_jobs (id, status, platform_fields). Idempotente.
-- Inverse : scripts/reparations/20261119_groupe_sur_fiche_vendue_INVERSE.sql.
-- Jouer (feu vert) : npx supabase db query --linked -f scripts/reparations/20261119_groupe_sur_fiche_vendue.sql
BEGIN;
SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public._backup_1911_groupe_vendu_jobs (
  id uuid PRIMARY KEY, status text, platform_fields jsonb, sauve_le timestamptz DEFAULT now());
ALTER TABLE public._backup_1911_groupe_vendu_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_1911_groupe_vendu_jobs FROM PUBLIC, anon, authenticated;

CREATE TEMP TABLE _cibles_1911 ON COMMIT DROP AS
SELECT j.id, j.user_id, j.inventaire_id, NULLIF(j.platform_fields #>> '{rattachement,annonce_id}', '')::uuid AS annonce
  FROM public.cross_post_jobs j
  JOIN public.inventaire i ON i.id = j.inventaire_id AND i.user_id = j.user_id
 WHERE j.status = 'published' AND COALESCE(j.action, 'publish') = 'publish'
   AND j.platform_fields ->> 'source' = 'releve'
   AND j.platform_fields #>> '{rattachement,regle}' = 'rapprochement_v3'
   AND j.platform_fields #>> '{rattachement,groupe_creation}' = 'true'
   AND j.platform_fields #>> '{rattachement,at}' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}[T ][0-9]{2}:[0-9]{2}'
   AND NOT (j.platform_fields ? 'vendu_encore_en_ligne')
   AND i.statut = 'vendu' AND i.fusionne_dans IS NULL
   -- la fiche était DÉJÀ vendue au rattachement : une vente non annulée enregistrée avant lui
   AND EXISTS (SELECT 1 FROM public.ventes v
                WHERE v.user_id = j.user_id AND v.inventaire_id = j.inventaire_id
                  AND lower(COALESCE(v.statut, '')) NOT IN ('annule', 'annulée', 'cancelled', 'canceled')
                  AND v.created_at < (j.platform_fields #>> '{rattachement,at}')::timestamptz)
   -- jamais la plateforme d'une vente de la fiche (l'annonce vendue elle-même, ou deux exemplaires)
   AND NOT EXISTS (SELECT 1 FROM public.ventes v
                    WHERE v.user_id = j.user_id AND v.inventaire_id = j.inventaire_id
                      AND lower(COALESCE(v.statut, '')) NOT IN ('annule', 'annulée', 'cancelled', 'canceled')
                      AND lower(COALESCE(NULLIF(v.plateforme_code, ''), NULLIF(v.plateforme, ''), '')) = lower(j.platform))
   -- l'annonce rattachée vit encore (sinon rien à demander)
   AND EXISTS (SELECT 1 FROM public.annonces_plateforme a
                WHERE a.user_id = j.user_id AND a.job_id = j.id
                  AND a.disparu_le IS NULL AND a.retiree_le IS NULL AND a.ignoree_le IS NULL
                  AND a.statut_plateforme IN ('en_ligne', 'en_verification'))
   -- aucun retrait ouvert de cette annonce
   AND NOT EXISTS (SELECT 1 FROM public.cross_post_jobs d
                    WHERE d.user_id = j.user_id AND d.platform = j.platform AND d.action = 'delete'
                      AND d.status IN ('pending', 'processing', 'needs_user')
                      AND (btrim(COALESCE(d.platform_listing_id, '')) = btrim(COALESCE(j.platform_listing_id, ''))
                           OR (d.listing_url IS NOT NULL AND d.listing_url = j.listing_url)));

INSERT INTO public._backup_1911_groupe_vendu_jobs (id, status, platform_fields)
SELECT j.id, j.status, j.platform_fields FROM public.cross_post_jobs j JOIN _cibles_1911 c ON c.id = j.id
ON CONFLICT (id) DO NOTHING;

SELECT c.id, public.rapprochement_v3_vendu_encore_en_ligne(c.user_id, c.id, c.inventaire_id, c.annonce, 'reprise_1911') AS marque
  FROM _cibles_1911 c;

COMMIT;
