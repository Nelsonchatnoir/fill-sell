-- ═══════════════════════════════════════════════════════════════════════════
-- RETRAITS OUVERTS SUR DES ANNONCES DÉCLARÉES « RETIRÉES MOI-MÊME » — CLOS
-- (01/10 suite, point 6, GO Nico)
-- ═══════════════════════════════════════════════════════════════════════════
-- Même règle que la migration 20261001140000 (trigger
-- cross_post_jobs_declaration_retiree_ferme_retraits), appliquée aux lignes
-- déjà dans ce cas : retrait en attente, à compléter ou en échec dont
-- l'annonce a été déclarée retirée par la personne (job de publication clos
-- avec la réponse « je l'ai retirée moi-même »). Jamais un retrait en cours,
-- jamais un retrait d'un « Déjà vendu ? oui ».
-- Rejeu à blanc (01/10) : 1 ligne — laforge.vinted, eBay 198641288930,
-- retrait 42212b6d en échec.
-- Sauvegarde : _backup_0110_retraits_declares. Inverse : …_INVERSE.sql
-- ═══════════════════════════════════════════════════════════════════════════
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '30s';

CREATE TABLE IF NOT EXISTS public._backup_0110_retraits_declares (
  job_id uuid PRIMARY KEY, ligne jsonb NOT NULL, le timestamptz NOT NULL DEFAULT now());
ALTER TABLE public._backup_0110_retraits_declares ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_0110_retraits_declares FROM PUBLIC, anon, authenticated;

CREATE TEMP TABLE _cibles ON COMMIT DROP AS
SELECT DISTINCT d.id
  FROM cross_post_jobs d
  JOIN cross_post_jobs p ON p.user_id = d.user_id AND p.platform = d.platform
   AND coalesce(p.action, 'publish') IN ('publish', 'republish') AND p.status = 'cancelled'
   AND p.error IN ('Réponse dans l''app : « je l''ai retirée moi-même » — pas une vente',
                   'Annonce retirée par le vendeur (confirmé dans l''app)')
   AND public.retrait_meme_annonce(d.platform, d.platform_listing_id, d.listing_url, p.platform_listing_id, p.listing_url)
 WHERE d.action = 'delete' AND d.status IN ('pending', 'needs_user', 'failed')
   AND NOT EXISTS (SELECT 1 FROM public.inventaire_doublons q
                    WHERE q.user_id = d.user_id AND q.preuves ? 'retraits_oui'
                      AND (q.preuves -> 'retraits_oui') ? d.id::text);

INSERT INTO public._backup_0110_retraits_declares (job_id, ligne)
SELECT d.id, to_jsonb(d) FROM cross_post_jobs d JOIN _cibles c USING (id)
ON CONFLICT (job_id) DO NOTHING;

UPDATE cross_post_jobs d
   SET status = 'cancelled',
       error = 'Rien à retirer : tu as indiqué avoir retiré cette annonce toi-même.',
       platform_fields = coalesce(d.platform_fields, '{}'::jsonb) || jsonb_build_object(
         'clos_par_declaration', jsonb_build_object('le', now(), 'statut_avant', d.status, 'par', 'reparation 20261001 point 6'))
  FROM _cibles c WHERE d.id = c.id;

SELECT d.id, d.platform, d.listing_url, d.status FROM cross_post_jobs d JOIN _cibles c USING (id);
COMMIT;
