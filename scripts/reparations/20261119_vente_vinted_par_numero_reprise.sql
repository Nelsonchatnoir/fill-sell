-- ═══════════════════════════════════════════════════════════════════════════
-- REPRISE 19/11/2026 (P2) — les fiches déjà « vendu » par le dressing, vente prouvée par le NUMÉRO de leur commande
-- Vinted, dont NOS dépôts sont encore publiés ailleurs : le retrait part par le circuit normal (armer_retraits_copies)
-- (terminal t5 — PRÉPARÉE, NON JOUÉE : feu vert de Nico ; APRÈS la migration 20261119175000, dont elle appelle la règle)
-- ═══════════════════════════════════════════════════════════════════════════
-- Le même geste que le déclencheur vinted_commande_retire_nos_depots, pour les commandes lues AVANT lui : fiche « vendu »,
-- une pièce, non fondue, SANS vente enregistrée, dont le numéro Vinted porte une commande (waiting / needs_action /
-- completed) de moins de 30 jours ou une vente Vinted du même numéro ; au moins un DÉPÔT FillSell publié hors Vinted
-- (ni relevé, ni rattachement) sans retrait ouvert. armer_retraits_copies garde TOUTES ses gardes (une annonce importée
-- n'est jamais retirée ici : garde du 03/11). Simulée le 19/11 (lecture seule) : 1 fiche — compte c385e244, fiche
-- 1794665798832018, dépôt Beebs 34358308 (tâche bc0de4eb), vu en ligne le 19/11 à 11:02.
-- Sauvegarde AVANT écriture (les champs des dépôts que le retrait marque) : public._backup_1911_vinted_numero_depots.
-- Idempotente (armer_retrait_job_pour ne double jamais un retrait). Inverse : …_reprise_INVERSE.sql.
-- Jouer (feu vert) : npx supabase db query --linked -f scripts/reparations/20261119_vente_vinted_par_numero_reprise.sql
BEGIN;
SET LOCAL statement_timeout = '60s';
SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public._backup_1911_vinted_numero_depots (
  id uuid PRIMARY KEY, inventaire_id bigint, platform_fields jsonb, sauve_le timestamptz DEFAULT now());
ALTER TABLE public._backup_1911_vinted_numero_depots ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_1911_vinted_numero_depots FROM PUBLIC, anon, authenticated;

CREATE TEMP TABLE _fiches_1911_p2 ON COMMIT DROP AS
SELECT i.id, i.user_id
  FROM public.inventaire i
 WHERE i.statut = 'vendu' AND i.fusionne_dans IS NULL AND COALESCE(i.quantite, 1) <= 1
   AND NULLIF(btrim(COALESCE(i.vinted_item_id, '')), '') IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM public.ventes v WHERE v.user_id = i.user_id AND v.inventaire_id = i.id
                     AND lower(COALESCE(v.statut, '')) NOT IN ('annule', 'annulée', 'cancelled', 'canceled'))
   AND (EXISTS (SELECT 1 FROM public.vinted_commandes_articles c
                 WHERE c.user_id = i.user_id AND c.item_id = btrim(i.vinted_item_id)
                   AND c.statut IN ('waiting', 'needs_action', 'completed') AND c.commande_le > now() - interval '30 days')
        OR EXISTS (SELECT 1 FROM public.ventes v
                    WHERE v.user_id = i.user_id AND v.inventaire_id IS NULL AND v.annonce_id = btrim(i.vinted_item_id)
                      AND lower(COALESCE(NULLIF(v.plateforme_code, ''), NULLIF(v.plateforme, ''), '')) = 'vinted'
                      AND lower(COALESCE(v.statut, '')) NOT IN ('annule', 'annulée', 'cancelled', 'canceled')
                      AND v.created_at > now() - interval '30 days'))
   AND EXISTS (SELECT 1 FROM public.cross_post_jobs j
                WHERE j.user_id = i.user_id AND j.inventaire_id = i.id AND j.platform <> 'vinted'
                  AND COALESCE(j.action, 'publish') IN ('publish', 'republish') AND j.status = 'published'
                  AND COALESCE(j.platform_fields ->> 'source', '') <> 'releve' AND (j.platform_fields -> 'rattachement') IS NULL
                  AND NOT EXISTS (SELECT 1 FROM public.cross_post_jobs d
                                   WHERE d.user_id = j.user_id AND d.inventaire_id = j.inventaire_id AND d.platform = j.platform
                                     AND d.action = 'delete' AND d.status IN ('pending', 'processing', 'needs_user')));

INSERT INTO public._backup_1911_vinted_numero_depots (id, inventaire_id, platform_fields)
SELECT j.id, j.inventaire_id, j.platform_fields
  FROM public.cross_post_jobs j JOIN _fiches_1911_p2 f ON f.id = j.inventaire_id AND f.user_id = j.user_id
 WHERE j.platform <> 'vinted' AND COALESCE(j.action, 'publish') IN ('publish', 'republish') AND j.status = 'published'
ON CONFLICT (id) DO NOTHING;

SELECT f.id AS fiche, public.armer_retraits_copies(f.id, 'reprise_1911_commande_vinted', NULL, 'vinted', interval '0') AS bilan
  FROM _fiches_1911_p2 f;

COMMIT;
