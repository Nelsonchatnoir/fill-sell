-- (24/10 nuit, décision de Nico) jocabroc8 — estampe « Scène Mystérieuse 99x73 cm » en double : deux fiches
-- (1791040801501 du 03/10, 1791818408222 du 12/10) et DEUX annonces eBay en ligne pour un seul objet (pages eBay
-- relues le 24/10 à 00:50 : même vendeur JocaBroc, 0 vendu, mêmes photos eBay). Risque de vente double.
-- Décision : garder la plus ancienne, retirer l'autre par le circuit normal de l'app, sans message au vendeur.
--   · gardée : 407302931655 (40 €, publiée par l'API FillSell le 20/10 à 07:40:10 — job e4954f7d, fiche 1791818408222) ;
--   · retirée : 407302958488 (50 USD ≈ 44,58 €, créée après : numéro postérieur, photos eBay copiées de la première ;
--     import du relevé rattaché à la main le 21/10 — job b55aefd3, fiche 1791040801501).
-- Geste : UN job de retrait, celui du retrait ciblé de l'app (armRemoveJob, src/tabs/StockTab.jsx), ligne pour ligne,
-- chemin d'audit « intervention_support » (src/utils/journalRetraits.js). L'extension le fait si le poste se rallume ;
-- sinon l'API Trading au bout de 15 min (retraitAttendLePoste) : GetItem avant (même numéro, même vendeur, active),
-- EndFixedPriceItem, GetItem après ; la publication d'origine est alors close « retirée — pas une vente »
-- (ebay-api-worker v94), sans question « vendue ? ». Aucun mail, aucune notification : aucun déclencheur ne vise un
-- retrait (push_trg_job : ventes seulement). Aucune vente touchée : 0 vente, 0 commande sur les deux fiches.
-- Et la phrase écrite le 23/10 sur le job 20587777 (« Ton article y est en ligne sous l'annonce 407302958488 »)
-- deviendrait fausse : elle nomme l'annonce gardée.
-- Inverse : scripts/reparations/20261024_jocabroc8_estampe_retrait_ebay_INVERSE.sql.
BEGIN;
SET LOCAL statement_timeout = '60s';

CREATE TABLE public._backup_2410_jocabroc8_estampe_jobs AS
  SELECT now() AS sauvegarde_le, c.* FROM public.cross_post_jobs c
   WHERE c.id IN ('b55aefd3-a678-43bf-973e-1903780a3590', 'e4954f7d-5f2d-400c-ae43-35846b0fa9c8', '20587777-4821-4548-ac1b-9c14722a4c43');
ALTER TABLE public._backup_2410_jocabroc8_estampe_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_2410_jocabroc8_estampe_jobs FROM PUBLIC, anon, authenticated;

CREATE TABLE public._backup_2410_jocabroc8_estampe_annonces AS
  SELECT now() AS sauvegarde_le, a.* FROM public.annonces_plateforme a
   WHERE a.id IN ('9d6878eb-f38b-4167-afb5-fa47666ac26a', '55ab4a17-2331-4d7f-a55d-cd4d0df29eea');
ALTER TABLE public._backup_2410_jocabroc8_estampe_annonces ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_2410_jocabroc8_estampe_annonces FROM PUBLIC, anon, authenticated;

DO $$
DECLARE
  v_user constant uuid := '53efea05-dc2d-4467-a8cd-c6fa52a47a61';
  v_del uuid;
  v_statut text;
  v_voie text;
  n integer;
BEGIN
  IF (SELECT count(*) FROM public._backup_2410_jocabroc8_estampe_jobs) <> 3
     OR (SELECT count(*) FROM public._backup_2410_jocabroc8_estampe_annonces) <> 2 THEN
    RAISE EXCEPTION 'sauvegarde : 3 jobs et 2 annonces attendus';
  END IF;

  -- Gardes : l'état relu le 24/10 à 00:50, sinon rien.
  IF NOT EXISTS (SELECT 1 FROM public.inventaire i WHERE i.id = 1791040801501 AND i.user_id = v_user AND i.statut = 'stock') THEN
    RAISE EXCEPTION 'fiche 1791040801501 : état inattendu';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.cross_post_jobs c
                  WHERE c.id = 'b55aefd3-a678-43bf-973e-1903780a3590' AND c.user_id = v_user AND c.inventaire_id = 1791040801501
                    AND c.platform = 'ebay' AND c.action = 'publish' AND c.status = 'published'
                    AND btrim(c.platform_listing_id) = '407302958488' AND c.listing_url = 'https://www.ebay.fr/itm/407302958488'
                    AND coalesce(c.platform_fields ->> 'sale_signal', '') = '') THEN
    RAISE EXCEPTION 'publication b55aefd3 (407302958488) : état inattendu';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.cross_post_jobs c
                  WHERE c.id = 'e4954f7d-5f2d-400c-ae43-35846b0fa9c8' AND c.user_id = v_user AND c.inventaire_id = 1791818408222
                    AND c.platform = 'ebay' AND c.action = 'publish' AND c.status = 'published'
                    AND btrim(c.platform_listing_id) = '407302931655' AND coalesce(c.platform_fields ->> 'sale_signal', '') = '') THEN
    RAISE EXCEPTION 'annonce gardée 407302931655 : état inattendu';
  END IF;
  IF EXISTS (SELECT 1 FROM public.ventes v WHERE v.inventaire_id IN (1791040801501, 1791818408222))
     OR EXISTS (SELECT 1 FROM public.plateforme_commandes pc WHERE pc.inventaire_id IN (1791040801501, 1791818408222))
     OR EXISTS (SELECT 1 FROM public.ventes_ebay_exemplaires x
                 WHERE x.inventaire_id IN (1791040801501, 1791818408222) OR x.listing_id IN ('407302958488', '407302931655')) THEN
    RAISE EXCEPTION 'une vente ou une commande existe : rien n''est fait';
  END IF;
  IF EXISTS (SELECT 1 FROM public.cross_post_jobs d
              WHERE d.user_id = v_user AND d.platform = 'ebay' AND d.action = 'delete'
                AND (btrim(coalesce(d.platform_listing_id, '')) IN ('407302958488', '407302931655')
                     OR coalesce(d.listing_url, '') ~ '/itm/(407302958488|407302931655)')) THEN
    RAISE EXCEPTION 'un retrait existe déjà pour l''une des deux annonces';
  END IF;

  -- Le retrait ciblé de l'app (armRemoveJob), ligne pour ligne : la publication la plus récente « published » de la
  -- plateforme sur la fiche, son titre et son lien ; la trace dit qui l'a armé et pourquoi.
  INSERT INTO public.cross_post_jobs (user_id, inventaire_id, platform, action, status, photo_option, title, listing_url, platform_fields)
  SELECT c.user_id, c.inventaire_id, 'ebay', 'delete', 'pending', 'original', c.title, c.listing_url,
         jsonb_build_object('arme_par', jsonb_build_object(
           'chemin', 'intervention_support', 'le', now(), 'depot', c.id,
           'par', 'Claude — décision de Nico du 24/10 : estampe en double, la plus ancienne annonce eBay (407302931655) est gardée',
           'pose_par', 'scripts/reparations/20261024_jocabroc8_estampe_retrait_ebay.sql'))
    FROM public.cross_post_jobs c WHERE c.id = 'b55aefd3-a678-43bf-973e-1903780a3590'
  RETURNING id, status, voie INTO v_del, v_statut, v_voie;
  IF v_del IS NULL OR v_statut IS DISTINCT FROM 'pending' THEN
    RAISE EXCEPTION 'retrait né « % » au lieu de pending : rien n''est fait', v_statut;
  END IF;

  -- Journal d'audit des gestes irréversibles (journalRetraits.js) : la ligne que l'app écrit, chemin du support.
  INSERT INTO public.usage_logs (user_id, feature, metadata)
  VALUES (v_user, 'retrait_annonces', jsonb_build_object(
    'chemin', 'intervention_support', 'plateformes', jsonb_build_array('ebay'), 'n_annonces', 1, 'n_articles', 1,
    'article_id', '1791040801501', 'retrait_job', v_del,
    'par', 'Claude — décision de Nico du 24/10 (estampe en double, 407302958488 retirée, 407302931655 gardée)'));

  -- La phrase du 23/10 qui deviendrait fausse.
  UPDATE public.cross_post_jobs c
     SET error = replace(c.error, 'Ton article y est en ligne sous l''annonce 407302958488 : rien à refaire.',
                         'Ton article y reste en ligne sous l''annonce 407302931655 (ta fiche du 12/10) : rien à refaire.')
   WHERE c.id = '20587777-4821-4548-ac1b-9c14722a4c43' AND c.status = 'cancelled'
     AND c.error LIKE '%Ton article y est en ligne sous l''annonce 407302958488 : rien à refaire.';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'job 20587777 : % ligne(s) au lieu de 1 — rien n''est fait', n; END IF;

  RAISE NOTICE 'retrait % armé (voie %, pending)', v_del, v_voie;
END $$;

SELECT d.id, d.status, d.voie, d.platform_listing_id, d.listing_url, d.platform_fields #>> '{arme_par,chemin}' AS chemin
  FROM public.cross_post_jobs d
 WHERE d.platform_fields #>> '{arme_par,pose_par}' = 'scripts/reparations/20261024_jocabroc8_estampe_retrait_ebay.sql';
COMMIT;
