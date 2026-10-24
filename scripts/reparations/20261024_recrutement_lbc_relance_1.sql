-- ═══════════════════════════════════════════════════════════════════════════
-- RÉPARATION 24/10 (décision 5 de Nico) — recrutementgroupezk704 : RELANCER UN SEUL des 4 dépôts Leboncoin « jamais
-- mis en ligne » du 14/10, par le circuit du bouton « Relancer » (StockTab relancerJobEchoue), cause corrigée.
-- ═══════════════════════════════════════════════════════════════════════════
-- Le motif exact de Leboncoin n'est donné qu'au vendeur, par mail : FillSell ne le lit nulle part (ni « Mes
-- annonces », ni l'API du tableau de bord, ni la messagerie). La cause a été établie par nos données (24/10) :
--   · les 5 dépôts du 14/10 (05:25 → 06:48) ont été faits par l'extension 0.6.110 : 5 sur 5 jamais en ligne ;
--   · ce compte est un compte Leboncoin PRO ; la 0.6.110 ne savait pas remplir le formulaire pro (critères sautés :
--     la sonde attendait 4 s ce que le formulaire pro affiche plus tard ; étape « options » du dépôt pro non tenue) —
--     aucune trace `compte_pro` sur ces 5 dépôts ;
--   · depuis la 0.6.123 → 0.6.128 (compte pro reconnu, sonde 15 s, critères posés, « Valider et payer » jamais
--     cliqué par FillSell), ses dépôts des 19 et 20/10 portent `compte_pro` : 150 déposés, 0 refusé ;
--   · même catégorie (« Mode > Vêtements »), mêmes champs, aucun téléphone, mail, autre site ni mot-clé : rien d'autre
--     ne sépare les refusés des acceptés. Le poste du vendeur sert aujourd'hui la 0.6.131.
-- Décision de Nico : un seul dépôt d'abord ; les suivants seulement s'il passe (au prochain check).
-- Premier : le jean Levi's 550 « W34 L34 (44) » (job a47bdb31, fiche 1791926965462020), le plus proche des 150 passés.
-- Gardes (sinon rien) : job « failed » prouvé jamais en ligne, fait par la 0.6.110 ; fiche au stock (1 exemplaire),
-- aucune vente, aucune commande, aucune autre publication Leboncoin vivante ou en file ; poste du vendeur ≥ 0.6.128.
-- Aucun mail, aucune notification, aucun quota (une relance ne débite rien). Inverse : …_INVERSE.sql.
BEGIN;
SET LOCAL statement_timeout = '60s';

CREATE TABLE IF NOT EXISTS public._backup_2410_recrutement_lbc_relances AS
  SELECT now() AS sauvegarde_le, c.* FROM public.cross_post_jobs c WHERE false;
ALTER TABLE public._backup_2410_recrutement_lbc_relances ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_2410_recrutement_lbc_relances FROM PUBLIC, anon, authenticated;
INSERT INTO public._backup_2410_recrutement_lbc_relances
  SELECT now(), c.* FROM public.cross_post_jobs c WHERE c.id = 'a47bdb31-10ec-4060-be20-8103973efd43';

DO $$
DECLARE
  v_job  constant uuid := 'a47bdb31-10ec-4060-be20-8103973efd43';
  v_user constant uuid := '7373c96c-c0ed-4947-a4c5-ee1b0d2b8d28';
  j public.cross_post_jobs%ROWTYPE;
  pf jsonb;
  v_retirees jsonb;
  n integer;
BEGIN
  SELECT * INTO j FROM public.cross_post_jobs WHERE id = v_job AND user_id = v_user FOR UPDATE;
  IF j.id IS NULL OR j.status <> 'failed' OR j.platform <> 'leboncoin' OR NOT (j.platform_fields ? 'depot_jamais_en_ligne')
     OR coalesce(j.handler_build, '') NOT LIKE '%v0.6.110%' THEN
    RAISE EXCEPTION 'job : état inattendu — rien n''est fait';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.inventaire i WHERE i.id = j.inventaire_id AND i.user_id = v_user AND i.statut = 'stock'
                   AND i.fusionne_dans IS NULL AND coalesce(i.quantite, 1) = 1)
     OR EXISTS (SELECT 1 FROM public.ventes v WHERE v.inventaire_id = j.inventaire_id)
     OR EXISTS (SELECT 1 FROM public.plateforme_commandes pc WHERE pc.inventaire_id = j.inventaire_id)
     OR EXISTS (SELECT 1 FROM public.cross_post_jobs x WHERE x.inventaire_id = j.inventaire_id AND x.platform = 'leboncoin'
                  AND x.id <> j.id AND x.status IN ('pending', 'processing', 'needs_user', 'published'))
     OR EXISTS (SELECT 1 FROM public.annonces_plateforme a WHERE a.inventaire_id = j.inventaire_id AND a.platform = 'leboncoin'
                  AND a.disparu_le IS NULL AND a.statut_plateforme = 'en_ligne') THEN
    RAISE EXCEPTION 'fiche : vendue, commandée ou déjà en ligne sur Leboncoin — rien n''est fait';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = v_user
                   AND substring(coalesce(p.extension_build, '') FROM '^\d{4}-\d{2}-\d{2}') >= '2026-10-18') THEN
    RAISE EXCEPTION 'le poste du vendeur n''a pas encore une extension corrigée (≥ 0.6.128) — rien n''est fait';
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
             'le', now(), 'par', 'Claude — décision 5 de Nico du 24/10 (un seul dépôt d''abord)',
             'cause', 'dépôt du 14/10 par l''extension 0.6.110, qui ne tenait pas le formulaire Leboncoin PRO ; corrigé (0.6.123 → 0.6.128 : 150 dépôts passés)',
             'pose_par', 'scripts/reparations/20261024_recrutement_lbc_relance_1.sql'));

  UPDATE public.cross_post_jobs
     SET status = 'pending', error = NULL, platform_listing_id = NULL, listing_url = NULL, published_at = NULL, platform_fields = pf
   WHERE id = v_job AND status = 'failed';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'relance : % ligne(s) au lieu de 1 — rien n''est fait', n; END IF;
END $$;

SELECT c.id, c.status, coalesce(c.platform_listing_id, '-') AS annonce, c.platform_fields ? 'depot_jamais_en_ligne' AS trace_morte,
       c.platform_fields #>> '{relance_apres_depot_mort,identifiant}' AS ancien_numero,
       (SELECT count(*) FROM public.email_logs e WHERE e.user_id = c.user_id AND e.sent_at > now() - interval '5 minutes') AS mails_5min,
       (SELECT count(*) FROM public.push_ventes p WHERE p.user_id = c.user_id AND p.cree_le > now() - interval '5 minutes') AS push_5min
  FROM public.cross_post_jobs c WHERE c.id = 'a47bdb31-10ec-4060-be20-8103973efd43';
COMMIT;
