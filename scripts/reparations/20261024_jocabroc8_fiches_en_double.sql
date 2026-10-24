-- (24/10, étape 1 du lot de Nico) jocabroc8 — l'estampe et le tableau ont chacun TROIS fiches en stock : une par
-- remise en ligne faite par le vendeur lui-même (il supprime son annonce et la recrée ; le relevé en a fait chaque fois
-- une fiche neuve). Les annonces mortes y posent encore « vendue ? ».
--
-- Preuves (relues le 24/10, 09:55 → 10:30) — jamais le titre seul :
--  · photos : estampe, mêmes fichiers (sommes de contrôle identiques) sur 1790174159221 et 1791040801501, et la même
--    photo retouchée sur 1791818408222 ; tableau, la même toile (lièvre pendu au pilier, lierre, même jardin, même
--    nappe) sur les trois fiches ;
--  · jamais deux annonces en ligne ensemble : chaque annonce disparaît quand la suivante apparaît (Leboncoin 3274383890
--    → 3281462401 → 3286304245 ; Vinted 10191253036 → 10221845199 → 10357380180, republiée par FillSell en
--    10480086312) ;
--  · pages relues : Vinted 10191253036 et 10221845199 « Page not found » (témoin du même vendeur ouvert) ; Vinted
--    10480086312 en ligne (17 €) ; eBay 407302931655 en ligne ; 407302958488 terminée ;
--  · 0 vente, 0 commande sur les 8 fiches.
--
-- La vraie fiche = celle qui porte les annonces VIVANTES :
--  · estampe : 1791818408222 (Leboncoin 3286304245, eBay 407302931655) ; 1791040801501 et 1790174159221 s'y fondent ;
--  · tableau : 1791983641199002 (Vinted 10480086312 : l'identité Vinted vivante doit rester sur la fiche visible, la
--    synchro retrouve les fiches par vinted_item_id) ; 1790781836119004 (Leboncoin 3285665098, eBay 407277758112) et
--    1791087674193002 s'y fondent, leurs annonces suivent.
--
-- Geste, par les circuits de l'app :
--  1. les 5 annonces mortes sont closes « remplacée par ta remise en ligne — ce n'est pas une vente » (forme de la
--     règle du 22/10, cross_post_jobs_alerte_tenue (1b)) : leurs questions « vendue ? » tombent ;
--  2. fusion par inventaire_fusionner_pour (le circuit du bouton « Fusionner », défaisable), tracée comme les fusions
--     sur décision de Nico avec preuve photo (utilisateur:photo_go_nico_3009, …_0910).
-- Aucun retrait, aucune vente, aucun mail, aucune notification, aucun quota (vérifié dans la transaction).
-- Inverse : scripts/reparations/20261024_jocabroc8_fiches_en_double_INVERSE.sql (défusion par le circuit + jobs rendus).
BEGIN;
SET LOCAL statement_timeout = '60s';

CREATE TABLE public._backup_2410_jocabroc8_doubles_fiches AS
  SELECT now() AS sauvegarde_le, i.* FROM public.inventaire i
   WHERE i.id IN (1790174159221, 1791040801501, 1791818408222, 1792588306955,
                  1790781836119004, 1791087674193002, 1791983641199002, 1790783386506);
ALTER TABLE public._backup_2410_jocabroc8_doubles_fiches ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_2410_jocabroc8_doubles_fiches FROM PUBLIC, anon, authenticated;

CREATE TABLE public._backup_2410_jocabroc8_doubles_jobs AS
  SELECT now() AS sauvegarde_le, c.* FROM public.cross_post_jobs c
   WHERE c.inventaire_id IN (SELECT id FROM public._backup_2410_jocabroc8_doubles_fiches);
ALTER TABLE public._backup_2410_jocabroc8_doubles_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_2410_jocabroc8_doubles_jobs FROM PUBLIC, anon, authenticated;

CREATE TABLE public._backup_2410_jocabroc8_doubles_annonces AS
  SELECT now() AS sauvegarde_le, a.* FROM public.annonces_plateforme a
   WHERE a.inventaire_id IN (SELECT id FROM public._backup_2410_jocabroc8_doubles_fiches);
ALTER TABLE public._backup_2410_jocabroc8_doubles_annonces ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_2410_jocabroc8_doubles_annonces FROM PUBLIC, anon, authenticated;

-- Les compteurs « avant », pour prouver qu'aucun déclencheur n'a d'effet de bord.
CREATE TEMP TABLE _avant ON COMMIT DROP AS
  SELECT (SELECT count(*) FROM public.email_logs WHERE user_id = '53efea05-dc2d-4467-a8cd-c6fa52a47a61') AS mails,
         (SELECT count(*) FROM public.push_ventes WHERE user_id = '53efea05-dc2d-4467-a8cd-c6fa52a47a61') AS push,
         (SELECT count(*) FROM public.coin_ledger WHERE user_id = '53efea05-dc2d-4467-a8cd-c6fa52a47a61') AS quotas,
         (SELECT count(*) FROM public.cross_post_jobs WHERE user_id = '53efea05-dc2d-4467-a8cd-c6fa52a47a61') AS jobs,
         (SELECT count(*) FROM public.ventes WHERE user_id = '53efea05-dc2d-4467-a8cd-c6fa52a47a61') AS ventes;

DO $$
DECLARE
  v_user constant uuid := '53efea05-dc2d-4467-a8cd-c6fa52a47a61';
  v_par  constant text := 'utilisateur:photo_go_nico_2410';
  v_le   constant timestamptz := now();
  v_fusion jsonb;
  n integer;
  r record;
BEGIN
  IF (SELECT count(*) FROM public._backup_2410_jocabroc8_doubles_fiches) <> 8 THEN
    RAISE EXCEPTION 'sauvegarde : 8 fiches attendues';
  END IF;

  -- Gardes : l'état relu le 24/10, sinon rien.
  IF (SELECT count(*) FROM public.inventaire WHERE user_id = v_user AND statut = 'stock' AND fusionne_dans IS NULL
        AND id IN (1790174159221, 1791040801501, 1791818408222, 1790781836119004, 1791087674193002, 1791983641199002)) <> 6
     OR NOT EXISTS (SELECT 1 FROM public.inventaire WHERE id = 1792588306955 AND fusionne_dans = 1791040801501)
     OR NOT EXISTS (SELECT 1 FROM public.inventaire WHERE id = 1790783386506 AND fusionne_dans = 1790781836119004)
     OR NOT EXISTS (SELECT 1 FROM public.inventaire WHERE id = 1791983641199002 AND vinted_item_id::text = '10480086312'
                     AND disparu_le IS NULL) THEN
    RAISE EXCEPTION 'fiches : état inattendu — rien n''est fait';
  END IF;
  IF EXISTS (SELECT 1 FROM public.ventes WHERE inventaire_id IN (SELECT id FROM public._backup_2410_jocabroc8_doubles_fiches))
     OR EXISTS (SELECT 1 FROM public.plateforme_commandes WHERE inventaire_id IN (SELECT id FROM public._backup_2410_jocabroc8_doubles_fiches)) THEN
    RAISE EXCEPTION 'une vente ou une commande existe : rien n''est fait';
  END IF;
  IF EXISTS (SELECT 1 FROM public.cross_post_jobs WHERE inventaire_id IN (SELECT id FROM public._backup_2410_jocabroc8_doubles_fiches)
               AND status IN ('pending', 'processing', 'needs_user', 'retry')) THEN
    RAISE EXCEPTION 'un geste est en cours sur une de ces fiches : rien n''est fait';
  END IF;
  -- Les annonces vivantes, intactes et sans question.
  IF (SELECT count(*) FROM public.cross_post_jobs
       WHERE user_id = v_user AND status = 'published' AND coalesce(platform_fields ->> 'sale_signal', '') = ''
         AND (id::text LIKE '08386adf%' AND btrim(platform_listing_id) = '3286304245'
           OR id::text LIKE 'e4954f7d%' AND btrim(platform_listing_id) = '407302931655'
           OR id::text LIKE '306256a0%' AND btrim(platform_listing_id) = '3285665098'
           OR id::text LIKE '65d945f7%' AND btrim(platform_listing_id) = '407277758112'
           OR id::text LIKE '91e3e838%' AND btrim(platform_listing_id) = '10480086312')) <> 5 THEN
    RAISE EXCEPTION 'annonces vivantes : état inattendu — rien n''est fait';
  END IF;

  -- 1. Les 5 annonces mortes : closes « remplacée par ta remise en ligne », jamais une vente.
  FOR r IN
    SELECT c.id, c.platform, c.platform_listing_id AS morte, v.annonce AS vivante, v.job AS job_vivant
      FROM public.cross_post_jobs c
      JOIN (VALUES ('c0b379dc', '3274383890', '3286304245', '08386adf'),
                   ('ee4ce15c', '3281462401', '3286304245', '08386adf'),
                   ('84aa0f07', '3279551924', '3285665098', '306256a0'),
                   ('7d3b1c3f', '10191253036', '10480086312', '91e3e838'),
                   ('769904e6', '10221845199', '10480086312', '91e3e838')) AS v(debut, morte, annonce, job)
        ON c.id::text LIKE v.debut || '%' AND btrim(c.platform_listing_id) = v.morte
     WHERE c.user_id = v_user AND c.status = 'published' AND c.platform_fields ->> 'sale_signal' = 'unavailable'
  LOOP
    UPDATE public.cross_post_jobs c
       SET status = 'cancelled',
           error = 'Annonce remplacée par ta remise en ligne (nouvelle annonce ' || r.vivante || ') — ce n''est pas une vente.',
           platform_fields = (c.platform_fields - array['unavailable_since', 'sale_signal', 'unavailable_pending_since', 'detected_price'] - 'absence_releves')
             || jsonb_build_object('remplacee_par_remise_en_ligne', jsonb_build_object(
                  'le', v_le, 'annonce', r.vivante,
                  'job', (SELECT j.id FROM public.cross_post_jobs j WHERE j.user_id = v_user AND j.id::text LIKE r.job_vivant || '%'),
                  'question_levee', jsonb_build_object('unavailable_since', c.platform_fields ->> 'unavailable_since',
                                                       'unavailable_pending_since', c.platform_fields ->> 'unavailable_pending_since'),
                  'par', 'Claude — décision de Nico du 24/10 (étape 1), preuve photo',
                  'pose_par', 'scripts/reparations/20261024_jocabroc8_fiches_en_double.sql'))
     WHERE c.id = r.id AND c.status = 'published';
  END LOOP;
  SELECT count(*) INTO n FROM public.cross_post_jobs
   WHERE user_id = v_user AND platform_fields #>> '{remplacee_par_remise_en_ligne,pose_par}' = 'scripts/reparations/20261024_jocabroc8_fiches_en_double.sql';
  IF n <> 5 THEN RAISE EXCEPTION 'annonces mortes : % close(s) au lieu de 5 — rien n''est fait', n; END IF;

  -- 2. Les fusions, par le circuit de l'app (défaisables).
  FOR r IN SELECT * FROM (VALUES (1791818408222::bigint, 1791040801501::bigint), (1791818408222, 1790174159221),
                                 (1791983641199002, 1790781836119004), (1791983641199002, 1791087674193002)) AS f(garde, absorbe)
  LOOP
    v_fusion := public.inventaire_fusionner_pour(v_user, r.garde, r.absorbe, v_par);
    IF coalesce((v_fusion ->> 'ok')::boolean, false) IS NOT TRUE THEN
      RAISE EXCEPTION 'fusion % ← % refusée : % — rien n''est fait', r.garde, r.absorbe, v_fusion;
    END IF;
    RAISE NOTICE 'fusion % ← % : %', r.garde, r.absorbe, v_fusion -> 'deplacements';
  END LOOP;

  -- 3. Contrôles : une seule annonce vivante par plateforme sur chaque vraie fiche, aucune question restée.
  IF (SELECT count(*) FROM public.cross_post_jobs WHERE inventaire_id = 1791818408222 AND status = 'published') <> 2
     OR (SELECT count(*) FROM public.cross_post_jobs WHERE inventaire_id = 1791983641199002 AND status = 'published') <> 3
     OR EXISTS (SELECT 1 FROM public.cross_post_jobs WHERE inventaire_id IN (1791818408222, 1791983641199002)
                  AND status = 'published' AND coalesce(platform_fields ->> 'sale_signal', '') <> '')
     OR (SELECT vinted_item_id::text FROM public.inventaire WHERE id = 1791983641199002) IS DISTINCT FROM '10480086312'
     OR (SELECT statut FROM public.inventaire WHERE id = 1791818408222) <> 'stock'
     OR (SELECT statut FROM public.inventaire WHERE id = 1791983641199002) <> 'stock' THEN
    RAISE EXCEPTION 'contrôle après fusion : état inattendu — rien n''est fait';
  END IF;
END $$;

-- Effets de bord : aucun attendu (mails, notifications, quotas, jobs créés, ventes : tous à 0).
SELECT quoi, cle, detail FROM (
  SELECT 1 AS o, 'effets' AS quoi, 'jocabroc8' AS cle,
         'mails ' || ((SELECT count(*) FROM public.email_logs WHERE user_id = '53efea05-dc2d-4467-a8cd-c6fa52a47a61') - a.mails)
         || ' · push ' || ((SELECT count(*) FROM public.push_ventes WHERE user_id = '53efea05-dc2d-4467-a8cd-c6fa52a47a61') - a.push)
         || ' · quotas ' || ((SELECT count(*) FROM public.coin_ledger WHERE user_id = '53efea05-dc2d-4467-a8cd-c6fa52a47a61') - a.quotas)
         || ' · jobs créés ' || ((SELECT count(*) FROM public.cross_post_jobs WHERE user_id = '53efea05-dc2d-4467-a8cd-c6fa52a47a61') - a.jobs)
         || ' · ventes ' || ((SELECT count(*) FROM public.ventes WHERE user_id = '53efea05-dc2d-4467-a8cd-c6fa52a47a61') - a.ventes) AS detail
    FROM _avant a
  UNION ALL
  SELECT 2, 'fiche', i.id::text, i.statut || ' · fusionnée dans ' || coalesce(i.fusionne_dans::text, '-')
         || ' · vinted ' || coalesce(i.vinted_item_id::text, '-') || ' · ' || left(i.titre, 50)
    FROM public.inventaire i WHERE i.id IN (SELECT id FROM public._backup_2410_jocabroc8_doubles_fiches)
  UNION ALL
  SELECT 3, 'job', c.inventaire_id::text || ' ' || c.platform,
         c.status || ' · ' || coalesce(c.platform_listing_id, '-') || ' · ' || left(coalesce(c.error, ''), 80)
    FROM public.cross_post_jobs c
   WHERE c.inventaire_id IN (1791818408222, 1791983641199002)
     AND (c.status = 'published' OR c.platform_fields ? 'remplacee_par_remise_en_ligne')
) t ORDER BY o, cle, detail;
COMMIT;
