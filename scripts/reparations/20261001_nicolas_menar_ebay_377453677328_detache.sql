-- ═══════════════════════════════════════════════════════════════════════════
-- nicolas.menar — eBay 377453677328 : l'annonce collée par son TITRE à une
-- fiche vendue redevient sa propre fiche, et la question « Déjà vendu ? » est
-- posée (01/10/2026, lot du 01/10 point 6)
-- ═══════════════════════════════════════════════════════════════════════════
-- Ce qu'on a trouvé :
--   · la fiche 1790106699473000 (« Doudou mouchoir Nala le roi lion rose
--     disney baby en très bon état ») est l'article Vinted 9805817274, lu
--     « sold » par son identifiant (vinted_status) ; la vente Vinted est
--     relevée (ventes 33056, commande 22025373235, 04/09, 23,48 €) mais
--     reliée à aucune fiche (inventaire_id nul) — aucun identifiant ne la
--     relie à l'article, seulement le titre ;
--   · l'annonce eBay 377453677328 n'est reliée à cette fiche QUE par son
--     titre : rattachement automatique « releve_fiche_vendue » du 27/09 20:27
--     (chemin supprimé le soir même). retrait_job_prouve(74698fba) = false.
--   · le compte a vendu au moins cinq doudous Nala de titres voisins (Vinted
--     et Leboncoin) : l'annonce eBay peut être un AUTRE exemplaire.
-- Aucune preuve exacte que l'annonce eBay soit l'article vendu sur Vinted →
-- on ne retire rien. C'est exactement le cas que la migration
-- 20260928002000 a traité pour 7 annonces ; celle-ci en avait été exclue parce
-- que son retrait passait pour fait (clos « retiré » à tort, repassé en échec
-- le 01/10 au matin, be0395a6).
--
-- Ce fichier applique la même règle, à cette annonce seule :
--   1. sauvegarde des deux jobs et de l'annonce ;
--   2. le job de suivi (74698fba) est annulé avec le marqueur
--      detache_titre_non_prouve ; le retrait raté (be0395a6) reste en échec ;
--   3. l'annonce est détachée (et sa date de retrait, fausse, effacée) ;
--   4. rapprocher_importer(..., 'auto') l'importe comme sa propre fiche EN
--      STOCK et pose la question « Déjà vendu ? » (homonyme_vendu) contre la
--      fiche vendue. La personne tranche ; « oui » fusionne et arme le retrait
--      par la voie normale.
-- Inverse : 20261001_nicolas_menar_ebay_377453677328_detache_INVERSE.sql
-- ═══════════════════════════════════════════════════════════════════════════
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '20s';

CREATE TABLE IF NOT EXISTS public._backup_0110_ebay_377453677328 (
  quoi text PRIMARY KEY, ligne jsonb NOT NULL, le timestamptz NOT NULL DEFAULT now());
REVOKE ALL ON public._backup_0110_ebay_377453677328 FROM anon, authenticated;

INSERT INTO public._backup_0110_ebay_377453677328 (quoi, ligne)
SELECT 'job_suivi', to_jsonb(j) FROM cross_post_jobs j WHERE j.id = '74698fba-5d6c-46ba-85dd-d4c05d802214'
UNION ALL
SELECT 'job_retrait', to_jsonb(j) FROM cross_post_jobs j WHERE j.id = 'be0395a6-d9aa-45d8-8ae2-5558c0f9f1e4'
UNION ALL
SELECT 'annonce', to_jsonb(a) FROM annonces_plateforme a WHERE a.id = 'a422a5c9-89db-48c8-8386-10a3f5876be4'
ON CONFLICT (quoi) DO NOTHING;

-- Garde : on ne touche que si l'état est celui constaté le 01/10.
DO $g$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cross_post_jobs WHERE id = '74698fba-5d6c-46ba-85dd-d4c05d802214'
                  AND status = 'published' AND platform_fields #>> '{rattachement,motif}' = 'releve_fiche_vendue')
     OR NOT EXISTS (SELECT 1 FROM cross_post_jobs WHERE id = 'be0395a6-d9aa-45d8-8ae2-5558c0f9f1e4' AND status = 'failed')
     OR NOT EXISTS (SELECT 1 FROM annonces_plateforme WHERE id = 'a422a5c9-89db-48c8-8386-10a3f5876be4'
                     AND inventaire_id = 1790106699473000 AND statut_plateforme = 'en_ligne' AND disparu_le IS NULL) THEN
    RAISE EXCEPTION 'ETAT_INATTENDU : rien n''est fait';
  END IF;
END $g$;

UPDATE cross_post_jobs j SET
  status = 'cancelled',
  platform_fields = j.platform_fields || jsonb_build_object('detache_titre_non_prouve', jsonb_build_object(
    'le', now(), 'par', 'reparation 20261001 point 6', 'fiche_vendue', j.inventaire_id))
 WHERE j.id = '74698fba-5d6c-46ba-85dd-d4c05d802214';

UPDATE annonces_plateforme SET
  inventaire_id = NULL, job_id = NULL, source_rapprochement = NULL,
  retiree_le = NULL, retrait_job_id = NULL, updated_at = now()
 WHERE id = 'a422a5c9-89db-48c8-8386-10a3f5876be4';

INSERT INTO public._backup_0110_ebay_377453677328 (quoi, ligne)
SELECT 'import', public.rapprocher_importer('39bfa95a-0b8d-46fe-b836-040966d02cfd'::uuid,
                                           'a422a5c9-89db-48c8-8386-10a3f5876be4'::uuid, 'auto')
ON CONFLICT (quoi) DO NOTHING;

SELECT quoi, ligne FROM public._backup_0110_ebay_377453677328 WHERE quoi = 'import';
COMMIT;
