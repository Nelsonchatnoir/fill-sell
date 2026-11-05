-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 20261105240000_vendu_retire_partout — ⛔ VENDU QUELQUE PART = RETIRÉ PARTOUT (règle de Nico, 05/11 soir)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- APPLIQUÉE le 05/11 à 22:21:06 (feu vert nommé de Nico). Toutes plateformes. Les articles en plusieurs exemplaires et les séries ne sont JAMAIS concernés.
--
-- CAUSE PROUVÉE (lecture seule en prod, 05/11 soir) — le Doudou de nicolas.menar, fiche 1790106697754007, vendue sur
-- Vinted le 06/10 à 22:32 (Paris) : ventes_operations « annonce:vinted:10101127941 » → retraitsArmes 0 ; une seule question
-- « Déjà vendu ? » (copie_non_prouvee 60621113, Beebs, posée à la même seconde, JAMAIS répondue) ; rien pour Leboncoin.
--   · Leboncoin : le dépôt de republication 13627ae2 porte le numéro 3267000921 — « Lot 2 doudous », une AUTRE annonce
--     (publiée le 10/09), prise pour le lien le 22/09 (listing_url_recovery) alors que l'adsubmit avait rendu 3274924341.
--     Les deux annonces sont rattachées au même dépôt : fiche_annonces_vivantes(fiche, 'leboncoin') = 2 = « deux
--     exemplaires » → aucun retrait ; et la version du 06/10 de poser_questions_copies_non_prouvees écartait AUSSI de la
--     question une plateforme à deux annonces vivantes (corrigé le 15/10, P16, pour les ventes suivantes seulement).
--     Silence complet depuis le 06/10. Le retrait ciblé de l'app (logo du Stock) viserait 3267000921, pas 3274924341.
--   · Beebs : le dépôt d23190b7 (republication, platform_listing_id VIDE mais lien …/p/34032772) a hérité du
--     rattachement automatique « titre_exact » de son dépôt d'origine → retrait_job_prouve faux → pas de retrait, la
--     question posée. ⛔ Le numéro vide n'est PAS la cause : armer_retrait_job_pour arme un retrait par le lien.
-- Sur le parc (fiches vendues, pièce unique, annonce vue en ligne sur une autre plateforme APRÈS la vente) : voir
-- docs/enquetes/rattachements-0511/VENDU-RETIRE-PARTOUT.md.
--
-- CE QUI CHANGE (rien d'autre) :
--   1. poser_questions_copies_non_prouvees (appelée par armer_retraits_copies à chaque vente) : en plus des dépôts
--      publiés, CHAQUE annonce relevée vivante de la fiche, sur une autre plateforme, qu'aucun dépôt publié ne porte sous
--      SON numéro (deuxième annonce d'un dépôt, dépôt annulé ou échoué, pas de dépôt) devient la question « Déjà vendu ? »
--      — pièce unique seulement (une vente), jamais une série (titre_en_serie), jamais une annonce mise en ligne après la
--      vente, jamais Opla, jamais une annonce Leboncoin sous transaction, jamais deux fois (un « Non » n'est jamais
--      reposé). La question d'un dépôt montre l'annonce qui porte SON numéro.
--   2. inventaire_doublon_decider : le « Oui, la retirer » retire L'ANNONCE MONTRÉE par son numéro et son lien
--      (armer_retrait_annonce_pour) quand la question est portée par l'annonce, ou quand le numéro du dépôt désigne une
--      autre annonce — jamais l'annonce d'à côté. Toutes les autres branches : la prod à l'octet près.
--   3. armer_retrait_annonce_pour (NEUVE, serveur seulement) : le retrait d'une annonce relevée, sur le seul geste de la
--      personne.
--   4. Index unique inventaire_doublons_copie_annonce : une question par annonce (questions portées par l'annonce).
-- INCHANGÉS : armer_retraits_copies, armer_retrait_job_pour, retrait_job_prouve, rattachement_confirme (règles du 05/11 :
-- un rattachement automatique non confirmé n'est jamais retiré d'office, la photo identique reste une preuve), le
-- retrait d'office des dépôts prouvés (avec ou sans numéro : par le lien), les déclencheurs, les cadences, l'app.
-- RATTRAPAGE : aucun. Une vente PASSÉE n'est reprise par aucun chemin automatique (la règle joue à la vente) ; la
-- liste des cas existants et le geste de chacun : VENDU-RETIRE-PARTOUT.md (Nico relit chaque annonce avant tout retrait).
-- Définitions de départ lues EN PROD le 05/11 soir (pg_get_functiondef, md5 sans CR) — vérifiées ci-dessous :
--   poser_questions_copies_non_prouvees  c045dd68dcf39340dfb65249ca0b969f
--   inventaire_doublon_decider           5ada387c781c2767cc0019c9845811c3
-- Inverse : supabase/rollbacks/20261105240000_vendu_retire_partout_INVERSE.sql (prod mot pour mot + DROP de la neuve et de
-- l'index). Preuve sur un Postgres jetable : scripts/preuve-vendu-retire-partout.mjs ; selftest :
-- scripts/vendu-retire-partout-selftest.mjs.
BEGIN;

DO $garde$
BEGIN
  IF md5(replace(pg_get_functiondef('public.poser_questions_copies_non_prouvees(bigint,uuid,text,text)'::regprocedure), chr(13), '')) <> 'c045dd68dcf39340dfb65249ca0b969f' THEN
    RAISE EXCEPTION 'poser_questions_copies_non_prouvees a changé en prod depuis sa lecture du 05/11 : régénérer 20261105240000 depuis pg_get_functiondef';
  END IF;
  IF md5(replace(pg_get_functiondef('public.inventaire_doublon_decider(uuid,text,uuid)'::regprocedure), chr(13), '')) <> '5ada387c781c2767cc0019c9845811c3' THEN
    RAISE EXCEPTION 'inventaire_doublon_decider a changé en prod depuis sa lecture du 05/11 : régénérer 20261105240000 depuis pg_get_functiondef';
  END IF;
END
$garde$;

-- Une question par ANNONCE pour les questions portées par l'annonce (celles d'un dépôt gardent inventaire_doublons_copie).
CREATE UNIQUE INDEX IF NOT EXISTS inventaire_doublons_copie_annonce ON public.inventaire_doublons
  USING btree (user_id, ((preuves ->> 'annonce_id')))
  WHERE motif = 'copie_non_prouvee' AND NOT (preuves ? 'job');

CREATE OR REPLACE FUNCTION public.armer_retrait_annonce_pour(p_annonce uuid, p_chemin text, p_delai interval, p_preuve_geste boolean)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  a      public.annonces_plateforme%ROWTYPE;
  i      public.inventaire%ROWTYPE;
  v_url  text;
  v_pf   jsonb;
  v_del  uuid;
BEGIN
  -- ⛔ (05/11 soir, Nico — VENDU QUELQUE PART = RETIRÉ PARTOUT) Le retrait d'UNE annonce relevée d'une fiche VENDUE, par
  -- SON numéro et SON lien (la ligne du relevé) — jamais le numéro d'un autre dépôt, jamais un titre. Seul appelant : le
  -- « Oui, la retirer » de la personne sur CETTE annonce (inventaire_doublon_decider, p_preuve_geste) ; sans ce geste,
  -- rien. Gardes : fiche vendue, non fusionnée, même compte ; jamais la plateforme de la vente ; annonce vivante (ni
  -- disparue, ni retirée, ni écartée), numéro d'au moins 4 signes ; jamais Opla (quittée) ; jamais une annonce Leboncoin
  -- sous transaction (elle est elle-même vendue) ; un seul retrait ouvert par annonce. Les déclencheurs de création des
  -- retraits (annonce déclarée retirée par la personne, annonce Vinted vendue, doublon, annonce remplacée) restent juges.
  IF NOT COALESCE(p_preuve_geste, false) THEN
    RETURN NULL;
  END IF;
  SELECT * INTO a FROM public.annonces_plateforme WHERE id = p_annonce FOR UPDATE;
  IF NOT FOUND OR a.inventaire_id IS NULL OR a.disparu_le IS NOT NULL OR a.retiree_le IS NOT NULL OR a.ignoree_le IS NOT NULL
     OR length(btrim(COALESCE(a.listing_id, ''))) < 4 THEN
    RETURN NULL;
  END IF;
  SELECT * INTO i FROM public.inventaire WHERE id = a.inventaire_id AND user_id = a.user_id;
  IF NOT FOUND OR i.fusionne_dans IS NOT NULL OR i.statut IS DISTINCT FROM 'vendu'
     OR lower(COALESCE(NULLIF(i.plateforme, ''), '')) = lower(a.platform) THEN
    RETURN NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM public.ventes v
              WHERE v.user_id = a.user_id AND v.inventaire_id = a.inventaire_id
                AND lower(COALESCE(v.statut, '')) NOT IN ('annule', 'annulée', 'cancelled', 'canceled')
                AND lower(COALESCE(NULLIF(v.plateforme_code, ''), NULLIF(v.plateforme, ''), '')) = lower(a.platform)) THEN
    RETURN NULL;
  END IF;
  IF a.platform = 'opla' AND public.opla_sortie_passee() THEN
    RETURN NULL;
  END IF;
  IF COALESCE(a.transaction_plateforme, '') IN ('pending', 'sold') THEN
    RETURN NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM public.cross_post_jobs d
              WHERE d.user_id = a.user_id AND d.platform = a.platform AND d.action = 'delete'
                AND d.status IN ('pending', 'processing', 'needs_user')
                AND public.listing_designe(a.listing_id, d.listing_url, d.platform_listing_id)) THEN
    RETURN NULL;
  END IF;
  v_url := NULLIF(btrim(COALESCE(a.url, '')), '');
  v_pf := jsonb_build_object('arme_par', jsonb_build_object(
            'chemin', p_chemin, 'le', now(), 'annonce', a.id, 'depot', a.job_id,
            'pose_par', 'armer_retrait_annonce_pour (serveur)'),
          'preuve', 'geste_deja_vendu');
  IF v_url IS NULL THEN
    v_pf := v_pf || jsonb_build_object('removal_url_missing', true);
  END IF;
  IF p_delai IS NOT NULL AND p_delai > interval '0' THEN
    v_pf := v_pf || jsonb_build_object('next_action_after', to_jsonb(now() + p_delai));
  END IF;
  INSERT INTO public.cross_post_jobs
    (user_id, inventaire_id, platform, action, status, photo_option, title, listing_url, platform_listing_id, platform_fields)
  VALUES
    (a.user_id, a.inventaire_id, a.platform, 'delete', 'pending', 'original',
     COALESCE(NULLIF(btrim(COALESCE(a.titre, '')), ''), i.titre), v_url, btrim(a.listing_id), v_pf)
  RETURNING id INTO v_del;
  IF v_del IS NOT NULL THEN
    INSERT INTO public.usage_logs (user_id, feature, metadata)
    VALUES (a.user_id, 'retrait_annonces', jsonb_build_object(
      'chemin', p_chemin, 'plateformes', jsonb_build_array(a.platform), 'n_annonces', 1, 'n_articles', 1,
      'article_id', a.inventaire_id::text, 'annonce', a.id, 'listing_id', a.listing_id));
  END IF;
  RETURN v_del;
END;
$function$
;
REVOKE ALL ON FUNCTION public.armer_retrait_annonce_pour(uuid, text, interval, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.armer_retrait_annonce_pour(uuid, text, interval, boolean) TO service_role;

CREATE OR REPLACE FUNCTION public.poser_questions_copies_non_prouvees(p_inventaire_id bigint, p_sauf_job uuid DEFAULT NULL::uuid, p_sauf_plateforme text DEFAULT NULL::text, p_source text DEFAULT 'vente'::text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_inv inventaire%ROWTYPE;
  v_vendu_sur text;
  n integer := 0;
  v_n integer := 0;
  v_vente timestamptz;
  v_unique boolean;
BEGIN
  SELECT * INTO v_inv FROM inventaire WHERE id = p_inventaire_id;
  IF NOT FOUND OR v_inv.fusionne_dans IS NOT NULL OR v_inv.statut IS DISTINCT FROM 'vendu' THEN
    RETURN 0;
  END IF;
  -- La plateforme de la vente, pour le texte : la vente enregistrée, sinon la fiche.
  SELECT lower(COALESCE(NULLIF(v.plateforme_code, ''), NULLIF(v.plateforme, ''))) INTO v_vendu_sur
    FROM ventes v
   WHERE v.user_id = v_inv.user_id AND v.inventaire_id = v_inv.id
     AND lower(COALESCE(v.statut, '')) NOT IN ('annule', 'annulée', 'cancelled', 'canceled')
   ORDER BY v.created_at DESC LIMIT 1;
  v_vendu_sur := COALESCE(v_vendu_sur, lower(NULLIF(btrim(COALESCE(v_inv.plateforme, '')), '')));
  -- (05/11 soir, Nico — VENDU QUELQUE PART = RETIRÉ PARTOUT) L'instant de la vente (vente_instant : vendu_le, sinon la
  -- fin de son jour, heure de Paris) et « pièce unique » : au plus UNE vente non annulée sur la fiche. Une fiche en
  -- plusieurs exemplaires (deux ventes ou plus) n'est jamais concernée par la règle de l'annonce (plus bas).
  SELECT max(public.vente_instant(v.vendu_le, v.date, v.created_at)), count(*) <= 1 INTO v_vente, v_unique
    FROM ventes v
   WHERE v.user_id = v_inv.user_id AND v.inventaire_id = v_inv.id
     AND lower(COALESCE(v.statut, '')) NOT IN ('annule', 'annulée', 'cancelled', 'canceled');

  INSERT INTO inventaire_doublons (user_id, garde, absorbe, niveau, statut, motif, preuves, source)
  SELECT v_inv.user_id, v_inv.id, v_inv.id, 'probable', 'proposee', 'copie_non_prouvee',
         jsonb_build_object(
           'job', j.id, 'annonce_id', ap.id, 'platform', j.platform,
           'url', COALESCE(NULLIF(btrim(COALESCE(ap.url, '')), ''), NULLIF(btrim(COALESCE(j.listing_url, '')), '')),
           'titre', COALESCE(NULLIF(btrim(COALESCE(ap.titre, '')), ''), NULLIF(btrim(COALESCE(j.title, '')), ''), v_inv.titre),
           'vendu_sur', v_vendu_sur,
           'rattachement', j.platform_fields -> 'rattachement',
           'rattachement_automatique', NOT public.rattachement_confirme(j.id)),
         left(COALESCE(p_source, 'vente'), 80)
    FROM cross_post_jobs j
    JOIN LATERAL (
      SELECT a.id, a.url, a.titre FROM annonces_plateforme a
       WHERE a.job_id = j.id AND a.user_id = j.user_id AND a.disparu_le IS NULL AND a.retiree_le IS NULL
       -- (05/11 soir) l'annonce montrée est celle qui porte le NUMÉRO du dépôt (celle que le « Oui » retirera) ; une
       -- autre annonce rattachée au même dépôt reçoit sa propre question (règle de l'annonce, plus bas).
       ORDER BY (a.listing_id = btrim(COALESCE(j.platform_listing_id, ''))) DESC, a.vu_le DESC NULLS LAST LIMIT 1) ap ON true
   WHERE j.user_id = v_inv.user_id AND j.inventaire_id = v_inv.id
     AND COALESCE(j.action, 'publish') IN ('publish', 'republish') AND j.status = 'published'
     AND (p_sauf_job IS NULL OR j.id <> p_sauf_job)
     AND (p_sauf_plateforme IS NULL OR j.platform <> p_sauf_plateforme)
     AND lower(COALESCE(NULLIF(v_inv.plateforme, ''), '')) <> lower(j.platform)
     AND (v_vendu_sur IS NULL OR v_vendu_sur <> lower(j.platform))
     AND COALESCE(j.platform_fields ->> 'sale_signal', '') <> 'sold'
     -- (11/10, Nico) Sortie d'Opla : aucune question sur une copie Opla (elle ne se retire plus d'ici).
     AND NOT (j.platform = 'opla' AND public.opla_sortie_passee())
     -- (15/10, P16) une plateforme où la fiche porte DEUX annonces vivantes (deux
     -- exemplaires, ou la même annonce publiée deux fois) : aucune n'est retirée
     -- d'office (armer_retraits_copies) — chacune devient la question « Déjà
     -- vendu ? », jamais le silence (les deux restaient en vente après la vente).
     AND (public.fiche_annonces_vivantes(v_inv.id, j.platform) >= 2
          OR (NOT public.retrait_job_prouve(j.id) AND public.fiche_annonces_vivantes(v_inv.id, j.platform) < 2)
          -- (05/11, Nico) une copie rattachée AUTOMATIQUEMENT sans photo identique et jamais confirmée : la question,
          -- jamais le retrait (05/11 soir, décision a : la photo identique reste une preuve)
          OR NOT public.rattachement_confirme(j.id))
     AND NOT EXISTS (SELECT 1 FROM cross_post_jobs d
                      WHERE d.user_id = j.user_id AND d.inventaire_id = j.inventaire_id AND d.platform = j.platform
                        AND d.action = 'delete' AND d.status IN ('pending', 'processing', 'needs_user'))
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS n = ROW_COUNT;

  -- ⛔ (05/11 soir, Nico) VENDU QUELQUE PART = RETIRÉ PARTOUT, toutes plateformes. Une PIÈCE UNIQUE vendue ne laisse
  -- AUCUNE annonce vivante en silence : en plus des dépôts publiés (ci-dessus, et les retraits prouvés armés par
  -- armer_retraits_copies), CHAQUE annonce relevée de la fiche, encore en ligne sur une autre plateforme, qu'aucun dépôt
  -- publié ne porte sous SON numéro, devient la question « Déjà vendu ? » — jamais un retrait d'office (son lien à la
  -- fiche n'est pas porté par un dépôt de FillSell : le geste de la personne le prouve). Le « Oui » retire CETTE annonce,
  -- par son numéro et son lien (armer_retrait_annonce_pour, depuis inventaire_doublon_decider).
  -- Cas réel : le Doudou de nicolas.menar (fiche 1790106697754007, vendue sur Vinted le 06/10) — le dépôt Leboncoin
  -- 13627ae2 porte le numéro 3267000921 (« Lot 2 doudous », lien mal relu le 22/09) ; l'annonce déposée, 3274924341,
  -- rattachée au même dépôt, n'avait ni retrait ni question (deux annonces vivantes : silence avant le 15/10).
  -- Jamais concernés : une fiche en plusieurs exemplaires (v_unique), une annonce en quantité, un titre en série
  -- (titre_en_serie), Opla (quittée le 10/10), la plateforme de la vente, une annonce Leboncoin sous transaction (elle
  -- est elle-même vendue), une annonce mise en ligne APRÈS la vente (règle du 03/11 : un autre exemplaire), une annonce
  -- que la personne a dit avoir retirée elle-même, une annonce dont le retrait est en cours, une annonce déjà
  -- interrogée (un « Non » n'est jamais reposé), un dépôt annulé « Vendu, encore en ligne — Retirer » (la ligne de
  -- « À régler » attend déjà la personne). Un titre seul ne décide jamais rien : la personne répond.
  IF v_unique THEN
    INSERT INTO inventaire_doublons (user_id, garde, absorbe, niveau, statut, motif, preuves, source)
    WITH c AS MATERIALIZED (
      SELECT a.id, a.platform, a.listing_id, a.url, a.titre, a.job_id, a.source_rapprochement
        FROM annonces_plateforme a
        LEFT JOIN cross_post_jobs j ON j.id = a.job_id
       WHERE a.user_id = v_inv.user_id AND a.inventaire_id = v_inv.id
         AND a.disparu_le IS NULL AND a.retiree_le IS NULL AND a.ignoree_le IS NULL
         AND a.statut_plateforme IN ('en_ligne', 'en_verification')
         AND length(btrim(COALESCE(a.listing_id, ''))) >= 4
         AND (p_sauf_job IS NULL OR a.job_id IS DISTINCT FROM p_sauf_job)
         AND (p_sauf_plateforme IS NULL OR a.platform <> p_sauf_plateforme)
         AND lower(COALESCE(NULLIF(v_inv.plateforme, ''), '')) <> lower(a.platform)
         AND (v_vendu_sur IS NULL OR v_vendu_sur <> lower(a.platform))
         AND NOT (a.platform = 'opla' AND public.opla_sortie_passee())
         AND COALESCE(a.quantite, 1) <= 1
         AND COALESCE(a.transaction_plateforme, '') NOT IN ('pending', 'sold')
         AND (v_vente IS NULL OR LEAST(COALESCE(a.publiee_le, a.created_at), a.created_at) <= v_vente)
         -- portée par un dépôt publié sous SON numéro (ou un dépôt sans numéro ni lien) : la question du dépôt la couvre
         AND NOT (j.id IS NOT NULL AND j.status = 'published' AND COALESCE(j.action, 'publish') IN ('publish', 'republish')
                  AND ((NULLIF(btrim(COALESCE(j.platform_listing_id, '')), '') IS NULL AND NULLIF(btrim(COALESCE(j.listing_url, '')), '') IS NULL)
                       OR public.listing_designe(a.listing_id, j.listing_url, j.platform_listing_id)))
         AND NOT (j.id IS NOT NULL AND j.status = 'cancelled' AND COALESCE(j.platform_fields ->> 'pending_removal', '') = 'true')
         AND NOT EXISTS (SELECT 1 FROM cross_post_jobs p
                          WHERE p.user_id = a.user_id AND p.platform = a.platform
                            AND COALESCE(p.action, 'publish') IN ('publish', 'republish') AND p.status = 'cancelled'
                            AND p.error IN ('Réponse dans l''app : « je l''ai retirée moi-même » — pas une vente',
                                            'Annonce retirée par le vendeur (confirmé dans l''app)')
                            AND public.retrait_meme_annonce(a.platform, a.listing_id, a.url, p.platform_listing_id, p.listing_url))
         AND NOT EXISTS (SELECT 1 FROM inventaire_doublons q
                          WHERE q.user_id = v_inv.user_id AND q.motif = 'copie_non_prouvee' AND q.preuves ->> 'annonce_id' = a.id::text)
         AND NOT EXISTS (SELECT 1 FROM cross_post_jobs d
                          WHERE d.user_id = a.user_id AND d.platform = a.platform AND d.action = 'delete'
                            AND (d.status IN ('pending', 'processing', 'needs_user') OR (d.status = 'deleted' AND d.created_at >= a.vu_le))
                            AND public.listing_designe(a.listing_id, d.listing_url, d.platform_listing_id)))
    SELECT v_inv.user_id, v_inv.id, v_inv.id, 'probable', 'proposee', 'copie_non_prouvee',
           jsonb_build_object(
             'annonce_id', c.id, 'platform', c.platform, 'listing_id', c.listing_id,
             'url', NULLIF(btrim(COALESCE(c.url, '')), ''),
             'titre', COALESCE(NULLIF(btrim(COALESCE(c.titre, '')), ''), v_inv.titre),
             'vendu_sur', v_vendu_sur,
             'portee_par', 'annonce', 'depot', c.job_id,
             'rattachement_automatique', COALESCE(c.source_rapprochement, '') <> 'manuel'),
           left(COALESCE(p_source, 'vente'), 80)
      FROM c
     WHERE NOT public.titre_en_serie(v_inv.user_id, c.titre)
    ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    n := n + v_n;
  END IF;
  RETURN n;
END;
$function$;

CREATE OR REPLACE FUNCTION public.inventaire_doublon_decider(p_id uuid, p_decision text, p_annonce_montree uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  d inventaire_doublons%ROWTYPE;
  r jsonb;
  v_job uuid; v_del uuid; v_retraits jsonb; v_sans int; v_geste boolean; v_pf_sans jsonb; v_detail text;
BEGIN
  IF v_user IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'unauthorized'); END IF;
  SELECT * INTO d FROM inventaire_doublons WHERE id = p_id AND user_id = v_user FOR UPDATE;
  IF d.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'introuvable'); END IF;
  IF d.statut <> 'proposee' THEN RETURN jsonb_build_object('ok', false, 'reason', 'deja_tranchee', 'statut', d.statut); END IF;
  -- (06/10, Nico) « Déjà vendu ? » sur une COPIE de la fiche vendue, liée par
  -- le seul titre : « Oui, la retirer » = le geste de la personne prouve que
  -- c'est le même article (rattachement 'utilisateur') ET vaut preuve de vente
  -- pour CE retrait (p_preuve_geste, règle Louis du 30/09) ; le retrait passe
  -- par armer_retrait_job_pour, toutes ses gardes comprises (deux annonces
  -- vivantes sur la plateforme = deux exemplaires = rien). Sans retrait armé,
  -- rien n'est écrit. « Non, c'est un autre exemplaire » : on n'y touche plus,
  -- la question n'est jamais reposée (index unique par dépôt).
  IF d.motif = 'copie_non_prouvee' THEN
    v_job := NULLIF(d.preuves ->> 'job', '')::uuid;
    IF p_decision = 'non' THEN
      UPDATE inventaire_doublons SET statut = 'refusee', decide_le = now(), decide_par = 'utilisateur' WHERE id = d.id;
      RETURN jsonb_build_object('ok', true, 'decision', 'non');
    ELSIF p_decision IS DISTINCT FROM 'oui' THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'decision_inconnue');
    END IF;
    -- jamais un retrait sur une annonce que l'écran n'a pas montrée
    IF p_annonce_montree IS NULL OR p_annonce_montree::text IS DISTINCT FROM (d.preuves ->> 'annonce_id') THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'annonce_non_montree');
    END IF;
    -- ⛔ (05/11 soir, Nico — VENDU QUELQUE PART = RETIRÉ PARTOUT) Le « Oui » retire L'ANNONCE MONTRÉE, par SON numéro et
    -- son lien : une question portée par l'annonce (aucun dépôt publié ne la porte sous son numéro), ou un dépôt dont le
    -- numéro désigne une AUTRE annonce que celle montrée (le Doudou de nicolas.menar : le dépôt 13627ae2 porte 3267000921,
    -- « Lot 2 doudous » ; l'annonce montrée est 3274924341) → armer_retrait_annonce_pour, jamais le numéro du dépôt.
    IF v_job IS NULL OR EXISTS (
         SELECT 1 FROM cross_post_jobs j, annonces_plateforme a
          WHERE j.id = v_job AND a.id = p_annonce_montree
            AND (NULLIF(btrim(COALESCE(j.platform_listing_id, '')), '') IS NOT NULL OR NULLIF(btrim(COALESCE(j.listing_url, '')), '') IS NOT NULL)
            AND NOT listing_designe(a.listing_id, j.listing_url, j.platform_listing_id)) THEN
      IF NOT EXISTS (SELECT 1 FROM annonces_plateforme a JOIN inventaire i ON i.id = a.inventaire_id AND i.user_id = a.user_id
                      WHERE a.id = p_annonce_montree AND a.user_id = v_user AND a.inventaire_id = d.garde
                        AND a.disparu_le IS NULL AND a.retiree_le IS NULL AND i.fusionne_dans IS NULL AND i.statut = 'vendu') THEN
        UPDATE inventaire_doublons SET statut = 'caduque', decide_le = now(), decide_par = 'utilisateur' WHERE id = d.id;
        RETURN jsonb_build_object('ok', false, 'reason', 'sans_objet');
      END IF;
      v_del := armer_retrait_annonce_pour(p_annonce_montree, 'copie_confirmee_vendue', interval '0', true);
      IF v_del IS NULL THEN   -- déjà en file pour CETTE annonce : jamais deux retraits
        SELECT dj.id INTO v_del
          FROM cross_post_jobs dj, annonces_plateforme a
         WHERE a.id = p_annonce_montree AND dj.user_id = v_user AND dj.platform = a.platform AND dj.action = 'delete'
           AND dj.status IN ('pending', 'processing', 'needs_user') AND listing_designe(a.listing_id, dj.listing_url, dj.platform_listing_id)
         ORDER BY dj.created_at LIMIT 1;
      END IF;
      IF v_del IS NULL THEN   -- rien n'est écrit, la question reste ouverte
        RETURN jsonb_build_object('ok', false, 'reason', 'retrait_impossible', 'decision', 'oui',
                                  'plateformes', jsonb_build_array(d.preuves ->> 'platform'));
      END IF;
      UPDATE inventaire_doublons SET statut = 'confirmee', decide_le = now(), decide_par = 'utilisateur',
                                     preuves = COALESCE(preuves, '{}'::jsonb) || jsonb_build_object('retrait', v_del, 'retrait_par', 'annonce')
       WHERE id = d.id;
      RETURN jsonb_build_object('ok', true, 'decision', 'oui', 'retraits', 1, 'plateformes', jsonb_build_array(d.preuves ->> 'platform'));
    END IF;
    IF v_job IS NULL
       OR NOT EXISTS (SELECT 1 FROM inventaire i WHERE i.id = d.garde AND i.user_id = v_user AND i.fusionne_dans IS NULL AND i.statut = 'vendu')
       OR NOT EXISTS (SELECT 1 FROM cross_post_jobs j WHERE j.id = v_job AND j.user_id = v_user AND j.inventaire_id = d.garde
                       AND j.status = 'published' AND COALESCE(j.action, 'publish') IN ('publish', 'republish')) THEN
      UPDATE inventaire_doublons SET statut = 'caduque', decide_le = now(), decide_par = 'utilisateur' WHERE id = d.id;
      RETURN jsonb_build_object('ok', false, 'reason', 'sans_objet');
    END IF;
    BEGIN
      UPDATE cross_post_jobs
         SET platform_fields = COALESCE(platform_fields, '{}'::jsonb) || jsonb_build_object('rattachement',
               COALESCE(platform_fields -> 'rattachement', '{}'::jsonb) || jsonb_build_object(
                 'par', 'utilisateur', 'motif', 'meme_article_confirme',
                 'confirme', jsonb_build_object('question', d.id, 'le', now(),
                   'avant', jsonb_build_object('par', platform_fields #> '{rattachement,par}',
                                               'motif', platform_fields #> '{rattachement,motif}'))))
       WHERE id = v_job;
      v_del := armer_retrait_job_pour(v_job, 'copie_confirmee_vendue', interval '0', true);
      IF v_del IS NULL THEN   -- déjà armé par un autre chemin : armer_retrait_job ne double jamais
        SELECT dj.id INTO v_del
          FROM cross_post_jobs j JOIN cross_post_jobs dj ON dj.id = NULLIF(j.platform_fields -> 'retrait_arme' ->> 'job', '')::uuid
         WHERE j.id = v_job AND dj.action = 'delete' AND dj.status IN ('pending', 'processing', 'needs_user');
      END IF;
      IF v_del IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = 'P0R01', MESSAGE = 'retrait_impossible', DETAIL = jsonb_build_array(d.preuves ->> 'platform')::text;
      END IF;
      UPDATE inventaire_doublons SET statut = 'confirmee', decide_le = now(), decide_par = 'utilisateur',
                                     preuves = COALESCE(preuves, '{}'::jsonb) || jsonb_build_object('retrait', v_del)
       WHERE id = d.id;
      RETURN jsonb_build_object('ok', true, 'decision', 'oui', 'retraits', 1, 'plateformes', jsonb_build_array(d.preuves ->> 'platform'));
    EXCEPTION WHEN SQLSTATE 'P0R01' THEN
      -- rattachement et retrait annulés ; la question reste ouverte
      GET STACKED DIAGNOSTICS v_detail = PG_EXCEPTION_DETAIL;
      RETURN jsonb_build_object('ok', false, 'reason', 'retrait_impossible', 'decision', 'oui',
                                'plateformes', COALESCE(NULLIF(v_detail, '')::jsonb, '[]'::jsonb));
    END;
  END IF;
  IF p_decision = 'non' THEN
    UPDATE inventaire_doublons SET statut = 'refusee', decide_le = now(), decide_par = 'utilisateur' WHERE id = d.id;
    RETURN jsonb_build_object('ok', true, 'decision', 'non');
  ELSIF p_decision = 'oui' THEN
    IF NOT EXISTS (SELECT 1 FROM inventaire WHERE id = d.garde AND user_id = v_user AND fusionne_dans IS NULL)
       OR NOT EXISTS (SELECT 1 FROM inventaire WHERE id = d.absorbe AND user_id = v_user AND fusionne_dans IS NULL) THEN
      UPDATE inventaire_doublons SET statut = 'caduque', decide_le = now(), decide_par = 'utilisateur' WHERE id = d.id;
      RETURN jsonb_build_object('ok', false, 'reason', 'fiche_introuvable');
    END IF;
    -- (2026-09-30, règle Louis partie 2) La fiche gardée est VENDUE : on
    -- regroupe, puis SEULS les dépôts venus de la fiche en ligne reçoivent un
    -- retrait. Si une annonce vivante venue de la fiche en ligne reste sans
    -- retrait, tout est annulé (jamais une annonce vivante cachée sous une
    -- fiche vendue).
    -- ⛔ (03/11 soir, Nico — JEAN-LUC LASSARAT 16:19, Dylan Fontaine 16:28) UNE ANNONCE EN LIGNE QUI RESSEMBLE À UN ARTICLE
    -- DÉJÀ VENDU N'EST JAMAIS RETIRÉE, ni réunie à la fiche vendue : elle entre dans le stock comme un article à part
    -- (des exemplaires de plus d'un vendeur de neuf ; une carte mise en ligne trois mois après la vente de l'autre).
    -- Le « oui » d'avant (30/09, règle Louis partie 2) réunissait les fiches et retirait l'annonce : 8 retraits à tort le
    -- 03/11. Une fiche sans annonce en ligne se réunit comme avant (rien à retirer). La copie interrogée à la vente du
    -- jour (copie_non_prouvee, plus haut) garde son « Oui, la retirer ».
    IF EXISTS (SELECT 1 FROM inventaire WHERE id = d.garde AND statut = 'vendu')
       AND (EXISTS (SELECT 1 FROM annonces_plateforme ap
                     WHERE ap.user_id = v_user AND ap.inventaire_id = d.absorbe
                       AND ap.disparu_le IS NULL AND ap.retiree_le IS NULL)
            OR EXISTS (SELECT 1 FROM cross_post_jobs j
                        WHERE j.user_id = v_user AND j.inventaire_id = d.absorbe AND j.status = 'published'
                          AND COALESCE(j.action, 'publish') IN ('publish', 'republish'))) THEN
      UPDATE inventaire_doublons SET statut = 'refusee', decide_le = now(), decide_par = 'utilisateur',
             preuves = COALESCE(preuves, '{}'::jsonb) || jsonb_build_object(
               'reponse', p_decision, 'issue', 'article_a_part_annonce_en_ligne', 'le', now())
       WHERE id = d.id;
      INSERT INTO usage_logs (user_id, feature, metadata)
      VALUES (v_user, 'doublon_vendu_article_a_part', jsonb_build_object(
        'doublon', d.id, 'garde', d.garde::text, 'absorbe', d.absorbe::text, 'motif', d.motif, 'reponse', p_decision));
      RETURN jsonb_build_object('ok', true, 'decision', p_decision, 'retraits', 0, 'article_a_part', true);
    END IF;
    IF EXISTS (SELECT 1 FROM inventaire WHERE id = d.garde AND statut = 'vendu') THEN
      BEGIN
        r := inventaire_fusionner_pour(v_user, d.garde, d.absorbe, 'utilisateur (doublon proposé)');
        IF NOT COALESCE((r ->> 'ok')::boolean, false) THEN
          -- (05/11, Nico) deux annonces d'une même plateforme : rien n'est regroupé, la question reste ouverte, sa raison est écrite.
          IF r ->> 'reason' = 'deux_annonces_meme_plateforme' THEN
            UPDATE inventaire_doublons
               SET preuves = COALESCE(preuves, '{}'::jsonb) || jsonb_build_object('fusion_refusee', jsonb_build_object(
                     'motif', 'deux_annonces_meme_plateforme', 'plateformes', r -> 'plateformes', 'message', r ->> 'message', 'le', now()))
             WHERE id = d.id AND statut = 'proposee';
          END IF;
          RETURN r || jsonb_build_object('decision', 'oui');
        END IF;
        FOR v_job IN
          SELECT j.id FROM cross_post_jobs j
           WHERE j.id IN (SELECT (x)::uuid FROM jsonb_array_elements_text(COALESCE(r -> 'deplacements' -> 'cross_post_jobs', '[]'::jsonb)) x)
             AND j.status = 'published' AND COALESCE(j.action, 'publish') IN ('publish', 'republish')
        LOOP
          -- (2026-09-30, décision Nico) le « oui » vaut preuve de vente pour le
          -- seul retrait de l'annonce que l'app a montrée (p_annonce_montree),
          -- et seulement si elle vient bien de la fiche en ligne.
          v_geste := p_annonce_montree IS NOT NULL AND EXISTS (
            SELECT 1 FROM annonces_plateforme ap
             WHERE ap.id = p_annonce_montree AND ap.user_id = v_user AND ap.job_id = v_job AND ap.disparu_le IS NULL
               AND ap.id IN (SELECT (x)::uuid FROM jsonb_array_elements_text(COALESCE(r -> 'deplacements' -> 'annonces_plateforme', '[]'::jsonb)) x));
          v_del := armer_retrait_job_pour(v_job, 'doublon_vendu_confirme', interval '0', v_geste);
        END LOOP;
        -- Les retraits en cours des dépôts venus de la fiche en ligne (armés
        -- ici, ou déjà par un autre chemin : armer_retrait_job ne double jamais).
        SELECT COALESCE(jsonb_agg(DISTINCT dj.id::text), '[]'::jsonb) INTO v_retraits
          FROM cross_post_jobs j JOIN cross_post_jobs dj ON dj.id = NULLIF(j.platform_fields -> 'retrait_arme' ->> 'job', '')::uuid
         WHERE j.id IN (SELECT (x)::uuid FROM jsonb_array_elements_text(COALESCE(r -> 'deplacements' -> 'cross_post_jobs', '[]'::jsonb)) x)
           AND dj.action = 'delete' AND dj.status IN ('pending', 'processing', 'needs_user');
        -- Une annonce vivante venue de la fiche en ligne sans retrait en cours ?
        SELECT count(*) INTO v_sans
          FROM annonces_plateforme ap
         WHERE ap.id IN (SELECT (x)::uuid FROM jsonb_array_elements_text(COALESCE(r -> 'deplacements' -> 'annonces_plateforme', '[]'::jsonb)) x)
           AND ap.disparu_le IS NULL
           AND NOT EXISTS (SELECT 1 FROM cross_post_jobs j JOIN cross_post_jobs dj ON dj.id = NULLIF(j.platform_fields -> 'retrait_arme' ->> 'job', '')::uuid
                            WHERE j.id = ap.job_id AND dj.action = 'delete' AND dj.status IN ('pending', 'processing', 'needs_user'));
        IF v_sans > 0 THEN
          -- les plateformes où la personne devra retirer elle-même
          SELECT COALESCE(jsonb_agg(DISTINCT ap.platform), '[]'::jsonb) INTO v_pf_sans
            FROM annonces_plateforme ap
           WHERE ap.id IN (SELECT (x)::uuid FROM jsonb_array_elements_text(COALESCE(r -> 'deplacements' -> 'annonces_plateforme', '[]'::jsonb)) x)
             AND ap.disparu_le IS NULL
             AND NOT EXISTS (SELECT 1 FROM cross_post_jobs j JOIN cross_post_jobs dj ON dj.id = NULLIF(j.platform_fields -> 'retrait_arme' ->> 'job', '')::uuid
                              WHERE j.id = ap.job_id AND dj.action = 'delete' AND dj.status IN ('pending', 'processing', 'needs_user'));
          RAISE EXCEPTION USING ERRCODE = 'P0R01', MESSAGE = 'retrait_impossible', DETAIL = v_pf_sans::text;
        END IF;
        UPDATE inventaire_doublons SET statut = 'fusionnee', decide_le = now(), decide_par = 'utilisateur',
                                       fusion_id = NULLIF(r ->> 'fusion_id', '')::uuid,
                                       preuves = COALESCE(preuves, '{}'::jsonb) || jsonb_build_object('retraits_oui', v_retraits)
         WHERE id = d.id;
        RETURN r || jsonb_build_object('decision', 'oui', 'retraits', jsonb_array_length(v_retraits));
      EXCEPTION WHEN SQLSTATE 'P0R01' THEN
        -- regroupement et retraits annulés ; la question reste ouverte
        GET STACKED DIAGNOSTICS v_detail = PG_EXCEPTION_DETAIL;   -- (texte jsonb des plateformes)
        RETURN jsonb_build_object('ok', false, 'reason', 'retrait_impossible', 'decision', 'oui',
                                  'plateformes', COALESCE(NULLIF(v_detail, '')::jsonb, '[]'::jsonb));
      END;
    END IF;
    r := inventaire_fusionner_pour(v_user, d.garde, d.absorbe, 'utilisateur (doublon proposé)');
    -- (05/11, Nico) deux annonces d'une même plateforme : rien n'est regroupé, la question reste ouverte, sa raison est écrite.
    -- (05/11 soir, décision c) « Annonce en double ? » → « Oui » passe ici : refusé sur une fiche unitaire, sauf
    -- republication prouvée ; l'écran Doublons montre r.message (sinon preuves.fusion_refusee.message).
    IF r ->> 'reason' = 'deux_annonces_meme_plateforme' THEN
      UPDATE inventaire_doublons
         SET preuves = COALESCE(preuves, '{}'::jsonb) || jsonb_build_object('fusion_refusee', jsonb_build_object(
               'motif', 'deux_annonces_meme_plateforme', 'plateformes', r -> 'plateformes', 'message', r ->> 'message', 'le', now()))
       WHERE id = d.id AND statut = 'proposee';
    END IF;
    IF COALESCE((r ->> 'ok')::boolean, false) THEN
      UPDATE inventaire_doublons SET statut = 'fusionnee', decide_le = now(), decide_par = 'utilisateur',
                                     fusion_id = NULLIF(r ->> 'fusion_id', '')::uuid
       WHERE id = d.id;
    END IF;
    RETURN r || jsonb_build_object('decision', 'oui');
  END IF;
  RETURN jsonb_build_object('ok', false, 'reason', 'decision_inconnue');
END;
$function$;

COMMIT;
