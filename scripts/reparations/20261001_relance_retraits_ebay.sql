-- ═══════════════════════════════════════════════════════════════════════════
-- eBay — ARTICLES VENDUS ENCORE ACHETABLES : CLÔTURES À TORT ET RELANCES (01/10)
-- ═══════════════════════════════════════════════════════════════════════════
-- GO de Nico, 01/10 matin. Annonces vérifiées EN VENTE sur leur page eBay le
-- 01/10 (bouton Achat immédiat présent, aucun message de fin) :
--   · ornellaracano 307204072564 — vente Leboncoin enregistrée le 30/09 ;
--     retrait ea012a37 refusé par la voie API (annonce importée) → RELANCE ;
--   · xxewwer 377462623400 — vente Vinted enregistrée le 22/09, fiche à 0 ; retraits
--     2773c89d (22/09) et c0d918a5 (27/09) clos « retirés » À TORT (« aucune
--     offre pour ce SKU » : une annonce importée n'a jamais d'offre chez nous) ;
--     ils bloquaient tout nouveau retrait → repassés « échec ». PAS de relance
--     (garde : voir plus bas) ;
--   · nicolas.menar 377453677328 — retrait be0395a6 clos « retiré » À TORT le
--     27/09 → repassé « échec ». PAS de relance : AUCUNE vente enregistrée
--     (fiche passée « vendue » par la synchro Vinted, sans ligne ventes) —
--     garde « aucun retrait sans vente enregistrée ». Décision de Nico.
-- Les relances passent par armer_retrait_job (toutes ses gardes : vente
-- enregistrée, preuve du dépôt, une seule annonce vivante, pas de retrait en
-- cours) ; la voie est décidée par cross_post_jobs_voie_ebay (20261001064500) :
-- import + vente → EXTENSION, Hub vendeur filtré par le numéro exact.
-- Cause racine des clôtures à tort : chemin « aucune offre → deleted » de
-- ebay-api-worker, SUPPRIMÉ le 29/09 (8a0b3e8) : le worker exige depuis la
-- publication API exacte et une fin d'annonce prouvée par eBay.
-- INVERSE : en bas du fichier (commenté).
-- ═══════════════════════════════════════════════════════════════════════════
SET statement_timeout = '20s';
SET lock_timeout = '2s';

CREATE TABLE IF NOT EXISTS public._backup_retraits_ebay_0110 (
  job_id uuid PRIMARY KEY, ligne jsonb NOT NULL, sauvegarde_le timestamptz NOT NULL DEFAULT now());
ALTER TABLE public._backup_retraits_ebay_0110 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_retraits_ebay_0110 FROM public, anon, authenticated;

INSERT INTO public._backup_retraits_ebay_0110 (job_id, ligne)
SELECT j.id, to_jsonb(j) FROM public.cross_post_jobs j
 WHERE j.id IN ('be0395a6-d9aa-45d8-8ae2-5558c0f9f1e4', '2773c89d-2363-47a0-9663-15d5bc8019e3',
                'c0d918a5-db00-4c93-a207-df4b81bdd6bf', 'ea012a37-cee1-4fe9-9a10-04f97a49d1da',
                'b0c680d9-1d63-462a-96a3-39b4dc81731f', '91320446-455b-4b0b-8e33-f22bb771714b',
                '74698fba-5d6c-46ba-85dd-d4c05d802214')
ON CONFLICT (job_id) DO NOTHING;

-- Clôtures à tort → échec, avec la vérité écrite.
UPDATE public.cross_post_jobs j
   SET status = 'failed',
       error = 'Retrait eBay NON fait : clos « retiré » à tort (aucune offre FillSell pour une annonce importée — ce n''était pas une preuve que l''annonce était finie). Annonce vérifiée encore en vente sur eBay le 01/10.',
       platform_fields = coalesce(j.platform_fields, '{}'::jsonb) || jsonb_build_object('cloture_a_tort', jsonb_build_object(
         'le', now(), 'statut_avant', 'deleted', 'motif', 'aucune_offre sans preuve de fin d''annonce',
         'annonce_en_vente_le', '2026-10-01', 'pose_par', 'scripts/reparations/20261001_relance_retraits_ebay.sql'))
 WHERE j.id IN ('be0395a6-d9aa-45d8-8ae2-5558c0f9f1e4', '2773c89d-2363-47a0-9663-15d5bc8019e3',
                'c0d918a5-db00-4c93-a207-df4b81bdd6bf')
   AND j.status = 'deleted' AND j.platform = 'ebay' AND j.action = 'delete';

-- Relances (rendent l'id du nouveau retrait, ou NULL si une garde refuse).
-- xxewwer 377462623400 : PAS de relance. Rejeu annulé du 01/10 09:20 :
-- armer_retrait_job refuse — la fiche porte plateforme = 'ebay' (fiche CRÉÉE
-- par l'import eBay), que la garde lit comme la plateforme de la VENTE (la
-- vente enregistrée est Vinted). Changer la garde = décision de Nico. Et
-- l'annonce eBay affiche « 2 disponibles » : la fiche à 0 vient d'un import
-- à 1 exemplaire par défaut, pas d'un stock prouvé épuisé.
SELECT 'ornellaracano 307204072564' AS cas,
       public.armer_retrait_job('b0c680d9-1d63-462a-96a3-39b4dc81731f', 'relance_go_nico_0110', interval '0') AS retrait;

-- ── INVERSE (à lancer seulement sur décision) ──────────────────────────────
-- UPDATE public.cross_post_jobs SET status = 'cancelled', error = 'Relance du 01/10 annulée'
--  WHERE action = 'delete' AND status IN ('pending', 'needs_user')
--    AND platform_fields -> 'arme_par' ->> 'chemin' = 'relance_go_nico_0110';
-- UPDATE public.cross_post_jobs j SET status = b.ligne ->> 'status', error = b.ligne ->> 'error',
--        platform_fields = b.ligne -> 'platform_fields'
--   FROM public._backup_retraits_ebay_0110 b
--  WHERE j.id = b.job_id AND j.id IN ('be0395a6-d9aa-45d8-8ae2-5558c0f9f1e4',
--        '2773c89d-2363-47a0-9663-15d5bc8019e3', 'c0d918a5-db00-4c93-a207-df4b81bdd6bf');
