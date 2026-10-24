-- ESSAI À BLANC de 20261024190000 (transaction ANNULÉE) : défaire des fusions avec échange Vinted.
BEGIN;
SET LOCAL statement_timeout = '300s';
CREATE TEMP TABLE _f ON COMMIT DROP AS
  SELECT f.id, f.user_id, f.garde, f.absorbe, f.created_at < '2026-10-24T09:53:45Z' AS ancienne,
         f.champs_repris -> 'vinted_identite' -> 'avant' ->> 'vinted_item_id' AS avant_id,
         f.champs_repris -> 'vinted_identite' -> 'apres' ->> 'vinted_item_id' AS apres_id
    FROM public.inventaire_fusions f
   WHERE f.defait_le IS NULL AND COALESCE((f.champs_repris -> 'vinted_identite' ->> 'echange')::boolean, false)
     AND (f.user_id = '63b80b36-be5a-41a4-bf31-c5f680e28dd6' AND f.par = 'utilisateur:photo_rapprochement_v3_remise' AND f.created_at >= '2026-10-24T09:53:45Z'
          OR f.id = (SELECT x.id FROM public.inventaire_fusions x
                      WHERE x.defait_le IS NULL AND x.created_at < '2026-10-24T09:53:45Z'
                        AND COALESCE((x.champs_repris -> 'vinted_identite' ->> 'echange')::boolean, false)
                        AND (x.champs_repris -> 'vinted_identite' -> 'avant' ->> 'vinted_item_id')::numeric
                            < (x.champs_repris -> 'vinted_identite' -> 'apres' ->> 'vinted_item_id')::numeric
                      ORDER BY x.created_at DESC LIMIT 1));
CREATE TEMP TABLE _avant ON COMMIT DROP AS SELECT
  (SELECT count(*) FROM public.cross_post_jobs WHERE user_id IN (SELECT user_id FROM _f)) AS jobs,
  (SELECT count(*) FROM public.cross_post_jobs WHERE user_id = '63b80b36-be5a-41a4-bf31-c5f680e28dd6' AND platform_fields ? 'remplacee_par') AS jobs_clos,
  (SELECT count(*) FROM public.inventaire_doublons WHERE user_id = '63b80b36-be5a-41a4-bf31-c5f680e28dd6' AND statut = 'caduque' AND decide_par = 'rapprochement_v3' AND decide_le >= '2026-10-24T09:53:45Z') AS caduques,
  (SELECT count(*) FROM public.email_logs WHERE user_id IN (SELECT user_id FROM _f)) AS mails,
  (SELECT count(*) FROM public.push_ventes WHERE user_id IN (SELECT user_id FROM _f)) AS push,
  (SELECT count(*) FROM public.ventes WHERE user_id IN (SELECT user_id FROM _f)) AS ventes;
DO $verif$
BEGIN
  IF md5(pg_get_functiondef('public.inventaire_defusionner_pour(uuid,uuid,text)'::regprocedure)) <> 'd311f449d31b8740c13ce5810fbea968' THEN
    RAISE EXCEPTION 'inventaire_defusionner_pour a changé en prod depuis la lecture du 24/10 — ON S''ARRÊTE';
  END IF;
END
$verif$;

CREATE OR REPLACE FUNCTION public.inventaire_defusionner_pour(p_user uuid, p_fusion_id uuid, p_par text DEFAULT 'utilisateur'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := p_user; -- MODIF 2026-09-30 : l'appelant dit pour qui (inventaire_defusionner passe auth.uid())
  f inventaire_fusions%ROWTYPE;
  v_ids bigint[];
  v_uids uuid[];
  v_cle text;
BEGIN
  IF v_user IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'unauthorized'); END IF;
  SELECT * INTO f FROM inventaire_fusions WHERE id = p_fusion_id AND user_id = v_user FOR UPDATE;
  IF f.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'fusion_introuvable'); END IF;
  IF f.defait_le IS NOT NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'deja_defaite'); END IF;

  SELECT array_agg((x)::bigint) INTO v_ids FROM jsonb_array_elements_text(COALESCE(f.deplacements -> 'ventes', '[]'::jsonb)) x;
  IF v_ids IS NOT NULL THEN UPDATE ventes SET inventaire_id = f.absorbe WHERE id = ANY (v_ids) AND user_id = v_user; END IF;
  SELECT array_agg((x)::bigint) INTO v_ids FROM jsonb_array_elements_text(COALESCE(f.deplacements -> 'push_ventes', '[]'::jsonb)) x;
  IF v_ids IS NOT NULL THEN UPDATE push_ventes SET inventaire_id = f.absorbe WHERE id = ANY (v_ids) AND user_id = v_user; END IF;
  SELECT array_agg((x)::bigint) INTO v_ids FROM jsonb_array_elements_text(COALESCE(f.deplacements -> 'remises_en_vente', '[]'::jsonb)) x;
  IF v_ids IS NOT NULL THEN UPDATE remises_en_vente SET inventaire_id = f.absorbe WHERE id = ANY (v_ids) AND user_id = v_user; END IF;
  SELECT array_agg((x)::bigint) INTO v_ids FROM jsonb_array_elements_text(COALESCE(f.deplacements -> 'vinted_listing_snapshots', '[]'::jsonb)) x;
  IF v_ids IS NOT NULL THEN UPDATE vinted_listing_snapshots SET inventaire_id = f.absorbe WHERE id = ANY (v_ids); END IF;
  SELECT array_agg((x)::bigint) INTO v_ids FROM jsonb_array_elements_text(COALESCE(f.deplacements -> 'vinted_republish_captures', '[]'::jsonb)) x;
  IF v_ids IS NOT NULL THEN UPDATE vinted_republish_captures SET inventaire_id = f.absorbe WHERE id = ANY (v_ids); END IF;
  IF f.deplacements ? 'fiches_annonce' THEN
    UPDATE fiches_annonce SET inventaire_id = f.absorbe WHERE inventaire_id = f.garde AND user_id = v_user;
  END IF;
  SELECT array_agg((x)::uuid) INTO v_uids FROM jsonb_array_elements_text(COALESCE(f.deplacements -> 'cross_post_jobs', '[]'::jsonb)) x;
  IF v_uids IS NOT NULL THEN UPDATE cross_post_jobs SET inventaire_id = f.absorbe WHERE id = ANY (v_uids) AND user_id = v_user; END IF;
  SELECT array_agg((x)::uuid) INTO v_uids FROM jsonb_array_elements_text(COALESCE(f.deplacements -> 'annonces_plateforme', '[]'::jsonb)) x;
  IF v_uids IS NOT NULL THEN UPDATE annonces_plateforme SET inventaire_id = f.absorbe, updated_at = now() WHERE id = ANY (v_uids) AND user_id = v_user; END IF;
  SELECT array_agg((x)::uuid) INTO v_uids FROM jsonb_array_elements_text(COALESCE(f.deplacements -> 'rapprochements', '[]'::jsonb)) x;
  IF v_uids IS NOT NULL THEN UPDATE rapprochements SET inventaire_id = f.absorbe WHERE id = ANY (v_uids) AND user_id = v_user; END IF;

  FOR v_cle IN SELECT k FROM jsonb_object_keys(COALESCE(f.champs_repris, '{}'::jsonb)) k LOOP
    IF v_cle = 'prix_achat' THEN
      UPDATE inventaire SET prix_achat = NULLIF(f.champs_repris -> 'prix_achat' ->> 'avant', '')::numeric WHERE id = f.garde;
    ELSIF v_cle = 'prix_achat_inconnu' THEN
      UPDATE inventaire SET prix_achat_inconnu = NULLIF(f.champs_repris -> 'prix_achat_inconnu' ->> 'avant', '')::boolean WHERE id = f.garde;
    ELSIF v_cle = 'description' THEN
      UPDATE inventaire SET description = f.champs_repris -> 'description' ->> 'avant' WHERE id = f.garde;
    ELSIF v_cle = 'marque' THEN
      UPDATE inventaire SET marque = f.champs_repris -> 'marque' ->> 'avant' WHERE id = f.garde;
    ELSIF v_cle = 'photos' THEN
      UPDATE inventaire SET photos = CASE WHEN jsonb_typeof(f.champs_repris -> 'photos' -> 'avant') = 'null'
                                          THEN NULL ELSE f.champs_repris -> 'photos' -> 'avant' END WHERE id = f.garde;
    ELSIF v_cle = 'vinted_identite' AND COALESCE((f.champs_repris -> 'vinted_identite' ->> 'echange')::boolean, false) THEN
      -- AJOUT 2026-09-25 après-midi : ÉCHANGE (remise en ligne). L'absorbé
      -- porte l'annonce RETIRÉE du gardé : on la libère d'abord (index unique),
      -- puis chacun reprend la sienne, disparition et dernière synchro comprises.
      UPDATE inventaire SET vinted_item_id = NULL, vinted_status = NULL, vinted_account_id = NULL WHERE id = f.absorbe;
      -- AJOUT 2026-10-24 : le gardé lâche AUSSI la sienne d'abord. Sans cela, la garde du 08/10
      -- (inventaire_vinted_suit_annonce_en_ligne : une fiche ne recule jamais sur une annonce plus ancienne) lui
      -- laissait l'annonce récente et l'absorbé butait sur l'index unique : aucun échange ne se défaisait.
      UPDATE inventaire SET vinted_item_id = NULL, vinted_status = NULL, vinted_account_id = NULL WHERE id = f.garde;
      UPDATE inventaire
         SET vinted_item_id = f.champs_repris -> 'vinted_identite' -> 'avant' ->> 'vinted_item_id',
             vinted_status = f.champs_repris -> 'vinted_identite' -> 'avant' ->> 'vinted_status',
             vinted_account_id = f.champs_repris -> 'vinted_identite' -> 'avant' ->> 'vinted_account_id',
             vinted_catalog_id = NULLIF(f.champs_repris -> 'vinted_identite' -> 'avant' ->> 'vinted_catalog_id', '')::integer,
             vinted_view_count = NULLIF(f.champs_repris -> 'vinted_identite' -> 'avant' ->> 'vinted_view_count', '')::integer,
             vinted_favourite_count = NULLIF(f.champs_repris -> 'vinted_identite' -> 'avant' ->> 'vinted_favourite_count', '')::integer,
             listed_at_guess = NULLIF(f.champs_repris -> 'vinted_identite' -> 'avant' ->> 'listed_at_guess', '')::timestamptz,
             disparu_le = NULLIF(f.champs_repris -> 'vinted_identite' -> 'avant' ->> 'disparu_le', '')::timestamptz,
             last_synced_at = NULLIF(f.champs_repris -> 'vinted_identite' -> 'avant' ->> 'last_synced_at', '')::timestamptz
       WHERE id = f.garde;
      UPDATE inventaire
         SET vinted_item_id = f.champs_repris -> 'vinted_identite' -> 'apres' ->> 'vinted_item_id',
             vinted_status = f.champs_repris -> 'vinted_identite' -> 'apres' ->> 'vinted_status',
             vinted_account_id = f.champs_repris -> 'vinted_identite' -> 'apres' ->> 'vinted_account_id',
             vinted_catalog_id = NULLIF(f.champs_repris -> 'vinted_identite' -> 'apres' ->> 'vinted_catalog_id', '')::integer,
             vinted_view_count = NULLIF(f.champs_repris -> 'vinted_identite' -> 'apres' ->> 'vinted_view_count', '')::integer,
             vinted_favourite_count = NULLIF(f.champs_repris -> 'vinted_identite' -> 'apres' ->> 'vinted_favourite_count', '')::integer,
             listed_at_guess = NULLIF(f.champs_repris -> 'vinted_identite' -> 'apres' ->> 'listed_at_guess', '')::timestamptz,
             disparu_le = NULLIF(f.champs_repris -> 'vinted_identite' -> 'apres' ->> 'disparu_le', '')::timestamptz,
             last_synced_at = NULLIF(f.champs_repris -> 'vinted_identite' -> 'apres' ->> 'last_synced_at', '')::timestamptz
       WHERE id = f.absorbe;
    ELSIF v_cle = 'vinted_identite' THEN
      -- AJOUT 2026-09-25 : l'identité Vinted rendue à l'absorbé (le gardé la
      -- lâche d'abord : index unique (user_id, vinted_item_id)).
      UPDATE inventaire
         SET vinted_item_id = f.champs_repris -> 'vinted_identite' -> 'avant' ->> 'vinted_item_id',
             vinted_status = f.champs_repris -> 'vinted_identite' -> 'avant' ->> 'vinted_status',
             vinted_account_id = f.champs_repris -> 'vinted_identite' -> 'avant' ->> 'vinted_account_id',
             vinted_catalog_id = NULLIF(f.champs_repris -> 'vinted_identite' -> 'avant' ->> 'vinted_catalog_id', '')::integer,
             vinted_view_count = NULLIF(f.champs_repris -> 'vinted_identite' -> 'avant' ->> 'vinted_view_count', '')::integer,
             vinted_favourite_count = NULLIF(f.champs_repris -> 'vinted_identite' -> 'avant' ->> 'vinted_favourite_count', '')::integer,
             listed_at_guess = NULLIF(f.champs_repris -> 'vinted_identite' -> 'avant' ->> 'listed_at_guess', '')::timestamptz
       WHERE id = f.garde;
      UPDATE inventaire
         SET vinted_item_id = f.champs_repris -> 'vinted_identite' -> 'apres' ->> 'vinted_item_id',
             vinted_status = f.champs_repris -> 'vinted_identite' -> 'apres' ->> 'vinted_status',
             vinted_account_id = f.champs_repris -> 'vinted_identite' -> 'apres' ->> 'vinted_account_id',
             vinted_catalog_id = NULLIF(f.champs_repris -> 'vinted_identite' -> 'apres' ->> 'vinted_catalog_id', '')::integer,
             vinted_view_count = NULLIF(f.champs_repris -> 'vinted_identite' -> 'apres' ->> 'vinted_view_count', '')::integer,
             vinted_favourite_count = NULLIF(f.champs_repris -> 'vinted_identite' -> 'apres' ->> 'vinted_favourite_count', '')::integer,
             listed_at_guess = NULLIF(f.champs_repris -> 'vinted_identite' -> 'apres' ->> 'listed_at_guess', '')::timestamptz
       WHERE id = f.absorbe;
    ELSIF v_cle = 'attributs' THEN
      UPDATE inventaire SET attributs = CASE WHEN jsonb_typeof(f.champs_repris -> 'attributs' -> 'avant') = 'null'
                                             THEN NULL ELSE f.champs_repris -> 'attributs' -> 'avant' END WHERE id = f.garde;
    END IF;
  END LOOP;

  UPDATE inventaire SET fusionne_dans = NULL, fusionne_le = NULL WHERE id = f.absorbe AND user_id = v_user;
  UPDATE inventaire_fusions SET defait_le = now() WHERE id = f.id;
  -- AJOUT 2026-09-25 : une fusion défaite n'est JAMAIS refaite ni reproposée.
  UPDATE inventaire_doublons SET statut = 'defaite', decide_le = now(), decide_par = COALESCE(NULLIF(p_par, ''), 'utilisateur') -- MODIF 2026-09-30
   WHERE user_id = v_user AND least(garde, absorbe) = least(f.garde, f.absorbe) AND greatest(garde, absorbe) = greatest(f.garde, f.absorbe);
  RETURN jsonb_build_object('ok', true, 'fusion_id', f.id, 'garde', f.garde, 'absorbe', f.absorbe);
END;
$function$;

-- (A) l'inverse du rattrapage, tel quel, sur 63b80b36
-- ════════════════════════════════════════════════════════════════════════════
-- INVERSE DES FUSIONS « REMISE EN LIGNE VINTED » D'UN COMPTE (08/10/2026 soir)
-- ════════════════════════════════════════════════════════════════════════════
-- Défait, UNE PAR UNE et dans l'ordre inverse, les fusions journalisées par la
-- règle (inventaire_fusions.par = 'utilisateur:photo_rapprochement_v3_remise',
-- non défaites) : inventaire_defusionner rend chaque identité Vinted à sa fiche
-- (échange compris), les jobs et les annonces à leur fiche d'avant
-- (inventaire_defusionner_pour : la voie de l'app, sans session ici). Puis les
-- jobs Vinted que la règle a clos (« remplacée, pas une vente ») retrouvent
-- leur statut d'avant, et (24/10) les questions qu'elle a closes « caduque »
-- se rouvrent. 63b80b36-be5a-41a4-bf31-c5f680e28dd6 est remplacé par le lanceur ; 2026-10-24T09:53:45Z par la
-- date du rattrapage (ISO). Rien d'autre n'est touché.
SET LOCAL statement_timeout = '120s';
DO $inv$
DECLARE f record; n integer := 0; r jsonb;
BEGIN
  FOR f IN SELECT id FROM inventaire_fusions
            WHERE user_id = '63b80b36-be5a-41a4-bf31-c5f680e28dd6' AND par = 'utilisateur:photo_rapprochement_v3_remise'
              AND defait_le IS NULL AND created_at >= '2026-10-24T09:53:45Z'::timestamptz
            ORDER BY created_at DESC LOOP
    r := public.inventaire_defusionner_pour('63b80b36-be5a-41a4-bf31-c5f680e28dd6'::uuid, f.id, 'utilisateur:inverse_remise_en_ligne_0810');
    n := n + 1;
  END LOOP;
  RAISE NOTICE 'fusions défaites : %', n;
END
$inv$;
UPDATE cross_post_jobs
   SET status = COALESCE(platform_fields -> 'remplacee_par' ->> 'statut_avant', 'published'),
       error = NULL,
       platform_fields = platform_fields - 'remplacee_par'
 WHERE user_id = '63b80b36-be5a-41a4-bf31-c5f680e28dd6' AND platform = 'vinted' AND status = 'cancelled'
   AND platform_fields -> 'remplacee_par' ->> 'par' = 'rapprochement_v3'
   AND (platform_fields -> 'remplacee_par' ->> 'le')::timestamptz >= '2026-10-24T09:53:45Z'::timestamptz;
-- (24/10) Les questions encore ouvertes que la règle a closes « caduque » (une de leurs fiches absorbée par une de
-- ces fusions) retrouvent leur état d'avant, lu dans la sauvegarde du compte prise juste avant le rattrapage.
UPDATE inventaire_doublons d
   SET statut = b.statut, decide_le = b.decide_le, decide_par = b.decide_par
  FROM (SELECT DISTINCT ON (s.id) s.id, s.statut, s.decide_le, s.decide_par
          FROM public._backup_0810_remise_doublons s
         WHERE s.user_id = '63b80b36-be5a-41a4-bf31-c5f680e28dd6' AND s.sauvegarde_le >= '2026-10-24T09:53:45Z'::timestamptz
         ORDER BY s.id, s.sauvegarde_le) b
 WHERE d.id = b.id AND d.user_id = '63b80b36-be5a-41a4-bf31-c5f680e28dd6' AND b.statut = 'proposee'
   AND d.statut = 'caduque' AND d.decide_par = 'rapprochement_v3' AND d.decide_le >= '2026-10-24T09:53:45Z'::timestamptz
   AND EXISTS (SELECT 1 FROM inventaire_fusions f
                WHERE f.user_id = '63b80b36-be5a-41a4-bf31-c5f680e28dd6' AND f.par = 'utilisateur:photo_rapprochement_v3_remise'
                  AND f.created_at >= '2026-10-24T09:53:45Z'::timestamptz AND f.absorbe IN (d.garde, d.absorbe));

-- (B) la fusion d'avant le rattrapage, par la voie du bouton de l'app (même fonction, pour son compte)
CREATE TEMP TABLE _b ON COMMIT DROP AS
  SELECT f.id, public.inventaire_defusionner_pour(f.user_id, f.id, 'utilisateur:essai_20261024190000') AS r FROM _f f WHERE f.ancienne;
SELECT o, k, v FROM (
  SELECT 1 AS o, 'fusions essayées (rattrapage / avant)' AS k,
         count(*) FILTER (WHERE NOT ancienne) || ' / ' || count(*) FILTER (WHERE ancienne) AS v FROM _f
  UNION ALL SELECT 2, 'défaites', (SELECT count(*) FROM public.inventaire_fusions x JOIN _f USING (id) WHERE x.defait_le IS NOT NULL)::text
  UNION ALL SELECT 3, 'chacune reprend son annonce (gardée = avant, absorbée = après, plus fondue)',
         (SELECT count(*) FROM _f f JOIN public.inventaire g ON g.id = f.garde JOIN public.inventaire a ON a.id = f.absorbe
           WHERE g.vinted_item_id = f.avant_id AND a.vinted_item_id = f.apres_id AND a.fusionne_dans IS NULL)::text
  UNION ALL SELECT 4, 'retour de la voie de l app (B)', COALESCE((SELECT string_agg(r::text, ' ') FROM _b), '-')
  UNION ALL SELECT 5, 'jobs Vinted rouverts (clos avant → après)',
         a.jobs_clos || ' → ' || (SELECT count(*) FROM public.cross_post_jobs WHERE user_id = '63b80b36-be5a-41a4-bf31-c5f680e28dd6' AND platform_fields ? 'remplacee_par') FROM _avant a
  UNION ALL SELECT 6, 'questions closes « caduque » (avant → après)',
         a.caduques || ' → ' || (SELECT count(*) FROM public.inventaire_doublons WHERE user_id = '63b80b36-be5a-41a4-bf31-c5f680e28dd6' AND statut = 'caduque' AND decide_par = 'rapprochement_v3' AND decide_le >= '2026-10-24T09:53:45Z') FROM _avant a
  UNION ALL SELECT 7, 'nés pendant l essai : jobs / mails / push / ventes',
         ((SELECT count(*) FROM public.cross_post_jobs WHERE user_id IN (SELECT user_id FROM _f)) - a.jobs) || ' / '
         || ((SELECT count(*) FROM public.email_logs WHERE user_id IN (SELECT user_id FROM _f)) - a.mails) || ' / '
         || ((SELECT count(*) FROM public.push_ventes WHERE user_id IN (SELECT user_id FROM _f)) - a.push) || ' / '
         || ((SELECT count(*) FROM public.ventes WHERE user_id IN (SELECT user_id FROM _f)) - a.ventes) FROM _avant a
) t ORDER BY o;
ROLLBACK;
