-- ═══════════════════════════════════════════════════════════════════════════
-- RÉPARATION 24/10 (lot « zéro blocage », point A8) — recrutementgroupezk704 : RELANCER LES 3 AUTRES dépôts Leboncoin
-- « jamais mis en ligne » du 14/10, par le circuit du bouton « Relancer » (StockTab relancerJobEchoue), cause corrigée.
-- ═══════════════════════════════════════════════════════════════════════════
-- Décision 5 de Nico (24/10 matin) : un seul dépôt d'abord (a47bdb31, script 20261024_recrutement_lbc_relance_1.sql),
-- les suivants seulement s'il passe. Il est passé : publié le 24/10 à 12:17 (3294225638, extension 0.6.131), vu en
-- ligne à 14:17. Ordre de Nico (lot « zéro blocage », A8) : relancer les 3 autres dépôts du 14/10.
--   · 5087eddb — Levi's 505 W40 (fiche 1791926965462008) ;
--   · 42f2e8eb — short compression Adidas (fiche 1789120450062000) ;
--   · c10316c6 — short Nike Dri Fit (fiche 1789120451647005).
-- Le 5e dépôt du 14/10 (46522917, Levi's 505 W33) n'est PAS touché : l'article est vendu.
-- Même geste, mêmes gardes que le script du premier dépôt (sinon RIEN, pour les trois) : job « failed » prouvé jamais
-- en ligne, fait par la 0.6.110 ; fiche au stock (1 exemplaire), aucune vente, aucune commande, aucune autre
-- publication Leboncoin vivante ou en file ; poste du vendeur ≥ 0.6.128.
-- Aucun mail, aucune notification, aucun quota (une relance ne débite rien). Inverse : …_INVERSE.sql.
BEGIN;
SET LOCAL statement_timeout = '60s';

CREATE TABLE IF NOT EXISTS public._backup_2410_recrutement_lbc_relances AS
  SELECT now() AS sauvegarde_le, c.* FROM public.cross_post_jobs c WHERE false;
ALTER TABLE public._backup_2410_recrutement_lbc_relances ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_2410_recrutement_lbc_relances FROM PUBLIC, anon, authenticated;
INSERT INTO public._backup_2410_recrutement_lbc_relances
  SELECT now(), c.* FROM public.cross_post_jobs c
   WHERE c.id IN ('5087eddb-2eb4-458f-b377-4f0cf7a661e0', '42f2e8eb-3b4e-4104-86fa-33d22f6bfd20',
                  'c10316c6-1d06-4181-b884-cf17b224de6d');

DO $$
DECLARE
  v_jobs constant uuid[] := ARRAY['5087eddb-2eb4-458f-b377-4f0cf7a661e0', '42f2e8eb-3b4e-4104-86fa-33d22f6bfd20',
                                  'c10316c6-1d06-4181-b884-cf17b224de6d']::uuid[];
  v_user constant uuid := '7373c96c-c0ed-4947-a4c5-ee1b0d2b8d28';
  v_job uuid;
  j public.cross_post_jobs%ROWTYPE;
  pf jsonb;
  v_retirees jsonb;
  n integer;
BEGIN
  -- Le premier dépôt relancé doit être passé (décision de Nico) : publié et vu en ligne.
  IF NOT EXISTS (SELECT 1 FROM public.cross_post_jobs x WHERE x.id = 'a47bdb31-10ec-4060-be20-8103973efd43'
                   AND x.status = 'published' AND x.vu_en_ligne_le IS NOT NULL) THEN
    RAISE EXCEPTION 'le premier dépôt relancé (a47bdb31) n''est pas encore vu en ligne — rien n''est fait';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = v_user
                   AND substring(coalesce(p.extension_build, '') FROM '^\d{4}-\d{2}-\d{2}') >= '2026-10-18') THEN
    RAISE EXCEPTION 'le poste du vendeur n''a pas encore une extension corrigée (≥ 0.6.128) — rien n''est fait';
  END IF;

  FOREACH v_job IN ARRAY v_jobs LOOP
    SELECT * INTO j FROM public.cross_post_jobs WHERE id = v_job AND user_id = v_user FOR UPDATE;
    IF j.id IS NULL OR j.status <> 'failed' OR j.platform <> 'leboncoin' OR NOT (j.platform_fields ? 'depot_jamais_en_ligne')
       OR coalesce(j.handler_build, '') NOT LIKE '%v0.6.110%' THEN
      RAISE EXCEPTION 'job % : état inattendu — rien n''est fait', v_job;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.inventaire i WHERE i.id = j.inventaire_id AND i.user_id = v_user AND i.statut = 'stock'
                     AND i.fusionne_dans IS NULL AND coalesce(i.quantite, 1) = 1)
       OR EXISTS (SELECT 1 FROM public.ventes v WHERE v.inventaire_id = j.inventaire_id)
       OR EXISTS (SELECT 1 FROM public.plateforme_commandes pc WHERE pc.inventaire_id = j.inventaire_id)
       OR EXISTS (SELECT 1 FROM public.cross_post_jobs x WHERE x.inventaire_id = j.inventaire_id AND x.platform = 'leboncoin'
                    AND x.id <> j.id AND x.status IN ('pending', 'processing', 'needs_user', 'published'))
       OR EXISTS (SELECT 1 FROM public.annonces_plateforme a WHERE a.inventaire_id = j.inventaire_id AND a.platform = 'leboncoin'
                    AND a.disparu_le IS NULL AND a.statut_plateforme = 'en_ligne') THEN
      RAISE EXCEPTION 'job % : fiche vendue, commandée ou déjà en ligne sur Leboncoin — rien n''est fait', v_job;
    END IF;

    -- Le geste du bouton « Relancer » (StockTab relancerJobEchoue, mode « repend »), ligne pour ligne.
    pf := coalesce(j.platform_fields, '{}'::jsonb)
          - 'next_action_after' - 'needs_user_tick_le' - 'needs_user_actif_ms' - 'needs_user_vu_le' - 'needs_user_vu_erreur'
          - 'attente_session' - 'refus_passager';
    pf := pf || jsonb_build_object('needsUserAttempts', 0,
                                   'relances_manuelles', coalesce((pf ->> 'relances_manuelles')::int, 0) + 1,
                                   'derniere_relance_manuelle', now());
    -- archiverErreur (_shared/erreurs-archivees.js) : l'erreur affichée est archivée avant d'être effacée.
    pf := jsonb_set(pf, '{erreurs_archivees}',
            coalesce(CASE WHEN jsonb_typeof(pf -> 'erreurs_archivees') = 'array' THEN pf -> 'erreurs_archivees' END, '[]'::jsonb)
            || jsonb_build_array(jsonb_build_object('le', now(), 'statut', j.status, 'erreur', left(btrim(j.error), 600), 'par', 'relance_manuelle')));
    -- relanceSansDepotMort (src/utils/relanceDepotMort.js) : le redépôt portera SON numéro.
    SELECT coalesce(jsonb_agg(k), '[]'::jsonb) INTO v_retirees
      FROM unnest(ARRAY['lbc_depot', 'depot_jamais_en_ligne', 'moderation_probe', 'lien_en_attente', 'refund_unconfirmed',
                        'listing_url_recovery', 'listing_url_recovery_refus', 'listing_url_abandon', 'lien_refuse', 'lien_suit_identifiant',
                        'sale_signal', 'unavailable_since', 'unavailable_pending_since', 'absence_releves', 'pas_encore_visible']) k
     WHERE pf ? k;
    pf := (pf - ARRAY['lbc_depot', 'depot_jamais_en_ligne', 'moderation_probe', 'lien_en_attente', 'refund_unconfirmed',
                      'listing_url_recovery', 'listing_url_recovery_refus', 'listing_url_abandon', 'lien_refuse', 'lien_suit_identifiant',
                      'sale_signal', 'unavailable_since', 'unavailable_pending_since', 'absence_releves', 'pas_encore_visible'])
          || jsonb_build_object('relance_apres_depot_mort', jsonb_build_object(
               'le', now(), 'identifiant', j.platform_listing_id, 'lien', j.listing_url,
               'issue', j.platform_fields #>> '{depot_jamais_en_ligne,issue}', 'constat', j.platform_fields -> 'depot_jamais_en_ligne',
               'traces_retirees', v_retirees))
          || jsonb_build_object('relance_support', jsonb_build_object(
               'le', now(), 'par', 'Claude — lot « zéro blocage » A8, ordre de Nico du 24/10 (le premier dépôt relancé est passé)',
               'cause', 'dépôt du 14/10 par l''extension 0.6.110, qui ne tenait pas le formulaire Leboncoin PRO ; corrigé (0.6.123 → 0.6.128 : 150 dépôts passés ; a47bdb31 relancé passé le 24/10 12:17)',
               'pose_par', 'scripts/reparations/20261024_recrutement_lbc_relance_3.sql'));

    UPDATE public.cross_post_jobs
       SET status = 'pending', error = NULL, platform_listing_id = NULL, listing_url = NULL, published_at = NULL, platform_fields = pf
     WHERE id = v_job AND status = 'failed';
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n <> 1 THEN RAISE EXCEPTION 'relance % : % ligne(s) au lieu de 1 — rien n''est fait', v_job, n; END IF;
  END LOOP;
END $$;

SELECT c.id, c.status, coalesce(c.platform_listing_id, '-') AS annonce, c.platform_fields ? 'depot_jamais_en_ligne' AS trace_morte,
       c.platform_fields #>> '{relance_apres_depot_mort,identifiant}' AS ancien_numero,
       (SELECT count(*) FROM public.email_logs e WHERE e.user_id = c.user_id AND e.sent_at > now() - interval '5 minutes') AS mails_5min,
       (SELECT count(*) FROM public.push_ventes p WHERE p.user_id = c.user_id AND p.cree_le > now() - interval '5 minutes') AS push_5min
  FROM public.cross_post_jobs c
 WHERE c.id IN ('5087eddb-2eb4-458f-b377-4f0cf7a661e0', '42f2e8eb-3b4e-4104-86fa-33d22f6bfd20', 'c10316c6-1d06-4181-b884-cf17b224de6d');
COMMIT;
