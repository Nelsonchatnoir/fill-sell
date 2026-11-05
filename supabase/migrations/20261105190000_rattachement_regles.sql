-- ═══════════════════════════════════════════════════════════════════════════
-- RÈGLES DE NICO (05/11) SUR LE RATTACHEMENT — TOUTES LES PLATEFORMES
-- ═══════════════════════════════════════════════════════════════════════════
-- Constat (assopmfrance ca9afe24) : un « Oui » à « même article ? » posée sur une photo seulement PROCHE (écussons ronds
-- sur fond blanc, Albator ≠ UJ2 à 9) a donné à la fiche UJ2 (quantité 1) une 2e annonce Leboncoin. Parc : 338 couples
-- fiche unitaire × plateforme à ≥ 2 annonces vivantes ; le chemin AUTOMATIQUE du moteur signait « utilisateur:… » et
-- posait « manuel » ; les retraits de copie partaient sur des rattachements automatiques jamais confirmés.
-- Règles : (a) une fiche unitaire ne porte jamais deux annonces de la même plateforme ; (b) « manuel » / « utilisateur »
-- seulement sur un vrai geste de la personne ; (c) un retrait de copie n'est jamais armé sur un rattachement automatique
-- non confirmé — la copie devient la question « Déjà vendu ? » (mécanisme du 06/10 : copie_non_prouvee) ; (d) la
-- question « photo proche » n'est plus posée sur un titre en série (≥ 3 annonces d'une plateforme au même titre).
-- ⛔ DÉCISIONS DE NICO DU 05/11 SOIR (cette version) :
--   a) NON pour l'instant : une PHOTO IDENTIQUE reste une preuve. Un rattachement automatique « photo_identique »
--      (moteur v3, rapprochement_attacher) et une fusion automatique par photo identique (« …(photo_identique) »,
--      « utilisateur:photo_… ») comptent comme CONFIRMÉS : les retraits de copie s'y arment comme aujourd'hui. Seuls
--      les rattachements automatiques SANS photo identique (titre, IA…), jamais confirmés par un geste, ne déclenchent
--      plus de retrait : la copie devient « Déjà vendu ? ». Mesuré en prod le 05/11 soir (lecture seule, état du jour) :
--      0 des 1 588 retraits armés en 30 jours et 0 des 116 188 dépôts prouvés des fiches en stock ne changent de chemin
--      (la version de l'après-midi en changeait 273 — 9 par jour, 37 le 30/10 — et 10 503) : aujourd'hui toute fusion ou
--      tout rattachement automatique sans photo identique est déjà refusé par retrait_job_prouve ; rattachement_confirme
--      reste la garde des chemins automatiques à venir et d'une copie confirmée puis déplacée par une fusion automatique.
--   b) Oui : l'exception « republication prouvée » (P16, deux annonces d'une plateforme sur une fiche) est gardée.
--   c) Oui : « Annonce en double ? » → « Oui » est refusé sur une fiche unitaire (2e annonce de la même plateforme),
--      sauf republication prouvée — c'est la garde (a) d'inventaire_fusionner_pour ; la question reste ouverte avec son
--      motif lisible (preuves.fusion_refusee, et le retour de la RPC que l'écran Doublons affiche).
--   d) Oui : le moteur (_shared/rapprochement/moteur.js, fonction edge rapprochement) ne rattache plus jamais
--      automatiquement sur un titre en série ni entre deux titres sans mot commun (hors de ce fichier).
-- 1. inventaire_fusionner_pour : (a) refus « deux_annonces_meme_plateforme » (message lisible ; exception inchangée :
--    la republication PROUVÉE, P16) ; (b) « manuel » seulement sur le geste ('utilisateur', 'utilisateur (…)') ;
--    accepte les marques automatiques « auto:photo_rapprochement_v3… (photo_identique) ».
-- 2. inventaire_doublon_decider : sur ce refus, la question reste « proposee » et porte preuves.fusion_refusee.
-- 3. rapprochement_v3_appliquer : ses trois fusions automatiques signent « auto:… (photo_identique) » (avant
--    « utilisateur:… ») — retrait_job_prouve les reconnaît comme avant (« …photo_identique) ») : ventes, relevés,
--    messagerie INCHANGÉS (retrait_job_prouve n'est pas réécrite).
-- 4. rattachement_confirme (NEUVE) : la définition de « confirmé » (photo identique comprise, décision a).
--    armer_retrait_job_pour (sauf p_preuve_geste), armer_retraits_copies (les deux boucles) et
--    poser_questions_copies_non_prouvees s'en servent.
-- 5. titre_en_serie (NEUVE) + releve_poser_question : (d), trace usage_logs 'question_photo_proche_ecartee'.
-- Définitions de départ lues EN PROD le 05/11 (pg_get_functiondef), md5 sans CR — relues le 05/11 soir, après les
-- migrations 20261105170000 et 20261105180000 : INCHANGÉES (retrait_job_prouve aussi : aa37decdd369f3b7bb8438f62004b418) :
--   inventaire_fusionner_pour            9bcfcd661b1561731fe2ab33e7a5a136
--   inventaire_doublon_decider           3a9d7674e6c14d8df66e65063a1fff51
--   rapprochement_v3_appliquer           f417a5e0eead76135922c03d6c05b494
--   armer_retrait_job_pour               0985562bc7f9d611dbf5cf520816d3d9
--   armer_retraits_copies                15e05ec507246ffe51dbccc69b79b9c8
--   poser_questions_copies_non_prouvees  3f69b70226669e19fb219574056bceb3
--   releve_poser_question                f954fea62a0dccac94d011e41ded1290
-- Rien n'est défait : les 338 couples existants, les « manuel » déjà posés, les questions ouvertes restent tels quels.
-- Aucune table, aucune donnée, aucune cadence touchée par la migration.
-- Inverse : supabase/rollbacks/20261105190000_rattachement_regles_INVERSE.sql (prod mot pour mot + DROP des deux neuves).
-- Preuve sur un Postgres jetable : scripts/preuve-rattachement-regles.mjs ; selftest : scripts/rattachement-regles-selftest.mjs.
BEGIN;

CREATE OR REPLACE FUNCTION public.rattachement_confirme(p_job uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  -- ⛔ (05/11, Nico) Un retrait de copie n'est jamais armé sur un rattachement AUTOMATIQUE non confirmé.
  -- (05/11 soir, décision a de Nico : « une PHOTO IDENTIQUE reste une preuve ») CONFIRMÉ = seule une preuve relie ce
  -- dépôt à sa fiche :
  --   · le lien d'origine : dépôt de FillSell pour la fiche (aucun rattachement), annonce qui a fait naître la fiche
  --     (rattachement.import), identifiant (identifiant_depot_clos), PHOTO IDENTIQUE (rattachement automatique
  --     « photo_identique » : moteur v3 / rapprochement_attacher), rattachement à la main ou « Oui, la retirer »
  --     (rattachement.par = 'utilisateur', motif meme_article_confirme) ;
  --   · ET aucune fusion AUTOMATIQUE SANS PHOTO IDENTIQUE active ne l'a amené sur sa fiche (depuis la confirmation de
  --     la personne, s'il y en a une). Preuves : la personne — 'utilisateur' (fusion à la main), 'utilisateur (doublon
  --     proposé)' (son « Oui ») ; un identifiant — 'regle:identifiant…' ; la photo identique — « …(photo_identique) »
  --     (moteur v3 depuis le 05/11, doublon certain, recensement du 25/09) et « utilisateur:photo_… » (moteur v3 avant
  --     le 05/11, fusion photo du 30/09, rattrapage du 07/10, go de Nico sur photo). Toute autre est automatique sans
  --     photo identique : « ia (…) », « auto (doublon certain : titre_exact_prix_egal) », « recensement … (remise_en_
  --     ligne_titre_identique) », « support (…) » — et tout chemin automatique à venir.
  -- NON CONFIRMÉ : rattachement.par = 'auto' sur autre chose qu'une photo identique (titre_exact, reparation_2609_suivi_
  -- orphelin, releve_fiche_vendue…) ou déplacé par une fusion automatique sans photo identique. Rien d'autre n'en
  -- dépend : retrait_job_prouve (ventes, relevés, messagerie) est inchangée. Mesuré le 05/11 soir : en prod, toute
  -- copie non confirmée ainsi est déjà refusée par retrait_job_prouve (0 retrait sur 30 jours ne change de chemin) ;
  -- cette garde vaut pour les chemins automatiques à venir et pour la copie confirmée puis déplacée par une fusion
  -- automatique sans photo identique (retrait_job_prouve la croit encore prouvée).
  -- LIMITE VOULUE : le DÉPÔT DE FILLSELL lui-même (ni relevé, ni rattachement) reste confirmé même déplacé par une
  -- fusion automatique — il n'a pas d'annonce relevée, il ne peut pas devenir la question « Déjà vendu ? » et
  -- resterait en ligne en silence (05/11 : 976 dépôts Vinted ainsi, sur 42 comptes, presque tous des remises en
  -- ligne Vinted — la même annonce reprise). Le juger demande d'abord une question sans annonce relevée (l'app).
  SELECT COALESCE((
    SELECT (COALESCE(j.platform_fields ->> 'source', '') <> 'releve' AND (j.platform_fields -> 'rattachement') IS NULL)
        OR ((COALESCE(j.platform_fields #>> '{rattachement,par}', '') <> 'auto'
             OR COALESCE(j.platform_fields #>> '{rattachement,import}', '') = 'true'
             OR COALESCE(j.platform_fields #>> '{rattachement,motif}', '') IN ('identifiant_depot_clos', 'photo_identique'))
       AND NOT EXISTS (
             SELECT 1 FROM inventaire_fusions f
              WHERE f.user_id = j.user_id AND f.defait_le IS NULL
                AND COALESCE(f.par, '') NOT IN ('utilisateur', 'utilisateur (doublon proposé)')
                AND COALESCE(f.par, '') NOT LIKE 'regle:identifiant%'
                AND COALESCE(f.par, '') NOT LIKE 'utilisateur:photo\_%'      -- (05/11 soir, a) photo : moteur v3, 30/09, 07/10, go de Nico
                AND COALESCE(f.par, '') NOT LIKE '%photo\_identique)'        -- (05/11 soir, a) photo identique (06/10, retrait_job_prouve)
                AND jsonb_typeof(f.deplacements -> 'cross_post_jobs') = 'array'
                AND (f.deplacements -> 'cross_post_jobs') ? j.id::text
                AND f.created_at > COALESCE(
                      CASE WHEN COALESCE(j.platform_fields #>> '{rattachement,motif}', '') = 'meme_article_confirme'
                                AND COALESCE(j.platform_fields #>> '{rattachement,confirme,le}', '') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}[T ][0-9]{2}:[0-9]{2}'
                           THEN (j.platform_fields #>> '{rattachement,confirme,le}')::timestamptz END,
                      '-infinity'::timestamptz)))
      FROM cross_post_jobs j WHERE j.id = p_job), false);
$function$;

CREATE OR REPLACE FUNCTION public.titre_en_serie(p_user uuid, p_titre text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  -- (05/11, Nico) Un titre EN SÉRIE chez le compte : au moins 3 annonces vivantes d'UNE même plateforme (ou 3 fiches
  -- Vinted vivantes) portent ce titre normalisé (rapprochement_texte_norm, comme le moteur). Par plateforme : un objet
  -- publié sur 4 plateformes porte 4 fois son titre sans être une série. Un titre vide n'est jamais une série.
  -- Coût mesuré le 05/11 sur le plus gros compte (3 014 annonces, 3 434 fiches) : ~0,2 s ; appelée seulement pour une
  -- question « photo proche » (releve_poser_question).
  WITH t AS (SELECT public.rapprochement_texte_norm(p_titre) AS n)
  SELECT COALESCE((SELECT t.n <> '' FROM t), false) AND (
    EXISTS (SELECT 1 FROM annonces_plateforme ap, t
             WHERE ap.user_id = p_user AND ap.disparu_le IS NULL AND ap.ignoree_le IS NULL
               AND public.rapprochement_texte_norm(ap.titre) = t.n
             GROUP BY ap.platform HAVING count(*) >= 3)
    OR (SELECT count(*) FROM inventaire i, t
         WHERE i.user_id = p_user AND i.fusionne_dans IS NULL AND i.statut IN ('stock', 'vendu')
           AND NULLIF(btrim(COALESCE(i.vinted_item_id, '')), '') IS NOT NULL AND i.disparu_le IS NULL
           AND public.rapprochement_texte_norm(i.titre) = t.n) >= 3);
$function$;

-- Les deux neuves : jamais appelées par l'app (comme retrait_job_prouve, 24/10).
REVOKE EXECUTE ON FUNCTION public.rattachement_confirme(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.titre_en_serie(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rattachement_confirme(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.titre_en_serie(uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION public.inventaire_fusionner_pour(p_user uuid, p_garde bigint, p_absorbe bigint, p_par text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := p_user; -- MODIF 2026-09-25 : l'appelant dit pour qui (inventaire_fusionner passe auth.uid())
  g inventaire%ROWTYPE;
  a inventaire%ROWTYPE;
  v_dep jsonb := '{}'::jsonb;
  v_champs jsonb := '{}'::jsonb;
  v_ids jsonb;
  v_attr jsonb;
  v_cle text;
  v_id uuid;
  -- (05/11, Nico) « manuel » seulement sur un VRAI geste de la personne : sa fusion à la main (inventaire_fusionner,
  -- 'utilisateur') ou son « Oui » à une question (inventaire_doublon_decider, 'utilisateur (doublon proposé)').
  -- Les anciennes étiquettes « utilisateur:photo_… » sont des chemins AUTOMATIQUES (moteur, lots) : jamais un geste.
  v_geste boolean := COALESCE(p_par, '') = 'utilisateur' OR COALESCE(p_par, '') LIKE 'utilisateur (%';
  v_conflits jsonb;
BEGIN
  -- Point A : une ressemblance ne permet jamais une fusion automatique.
  -- (15/10, décision 3 de Nico) Exception : le verdict de l'IA sur un DOUTE du
  -- moteur (inventaire_doublon_decider_ia, p_par 'ia (…)'), rendu avec ses
  -- garde-fous : photos comparées (jamais le titre seul), jamais deux annonces
  -- d'une même plateforme, jamais une fiche vendue, jamais chez un compte qui a
  -- répondu « Non, deux exemplaires ». Toute autre voie reste refusée.
  -- (05/11, Nico) Le moteur v3 signe désormais ses fusions automatiques « auto:photo_rapprochement_v3… (photo_identique) »
  -- (avant : « utilisateur:photo_rapprochement_v3… », une étiquette de geste sur un chemin automatique) ; seules
  -- ces trois marques automatiques entrent ici, en plus des voies d'avant.
  IF COALESCE(p_par, '') NOT LIKE 'utilisateur%' AND COALESCE(p_par, '') NOT LIKE 'ia (%'
     AND COALESCE(p_par, '') NOT IN ('auto:photo_rapprochement_v3 (photo_identique)',
                                     'auto:photo_rapprochement_v3_main (photo_identique)',
                                     'auto:photo_rapprochement_v3_remise (photo_identique)') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'confirmation_utilisateur_requise');
  END IF;
  IF v_user IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'unauthorized'); END IF;
  IF p_garde IS NULL OR p_absorbe IS NULL OR p_garde = p_absorbe THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'articles_identiques');
  END IF;
  SELECT * INTO g FROM inventaire WHERE id = p_garde AND user_id = v_user FOR UPDATE;
  SELECT * INTO a FROM inventaire WHERE id = p_absorbe AND user_id = v_user FOR UPDATE;
  IF g.id IS NULL OR a.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'article_introuvable'); END IF;
  IF g.fusionne_dans IS NOT NULL OR a.fusionne_dans IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'deja_fusionne');
  END IF;

  -- ⛔ (05/11, Nico — assopmfrance : un « Oui » à une photo PROCHE a donné à l'écusson UJ2 une 2e annonce Leboncoin,
  -- l'Albator) UNE FICHE UNITAIRE NE PORTE JAMAIS DEUX ANNONCES DE LA MÊME PLATEFORME : deux annonces d'une plateforme
  -- sont deux exemplaires. La gardée (quantité ≤ 1) porte une annonce vivante d'une plateforme où l'absorbée en porte
  -- une AUTRE → rien n'est regroupé, motif nommé ; la question qui a demandé la fusion reste ouverte (l'appelant le dit).
  -- Vivante : annonce relevée ni disparue, ni retirée, ni ignorée ; dépôt « published » qu'aucune annonce relevée ne
  -- représente (hors Vinted) ; Vinted : l'identité en ligne de la fiche (vinted_item_id, disparu_le vide) — l'échange
  -- d'une remise en ligne (vinted_remise_en_ligne / vinted_retraits_successifs) n'est pas un doublon. Seule exception,
  -- inchangée : la republication PROUVÉE (P16, 15/10 : rapprochement_republication_prouvee — même titre, prix,
  -- description, ni lot ni quantité ; la même annonce publiée deux fois, voulue par Nico ; gardée le 05/11 soir, b).
  -- (05/11 soir, décision c) Vaut aussi pour « Annonce en double ? » → « Oui » (inventaire_doublon_decider) : refusé
  -- sur une fiche unitaire, sauf republication prouvée. Le message est lu tel quel par l'écran Doublons.
  IF COALESCE(g.quantite, 1) <= 1 THEN
    WITH l AS (
      SELECT CASE WHEN ap.inventaire_id = p_garde THEN 'g' ELSE 'a' END AS cote, ap.platform, btrim(ap.listing_id) AS lid, ap.id AS annonce
        FROM annonces_plateforme ap
       WHERE ap.inventaire_id IN (p_garde, p_absorbe) AND ap.user_id = v_user
         AND ap.disparu_le IS NULL AND ap.retiree_le IS NULL AND ap.ignoree_le IS NULL
      UNION ALL
      SELECT CASE WHEN j.inventaire_id = p_garde THEN 'g' ELSE 'a' END, j.platform,
             COALESCE(NULLIF(btrim(j.platform_listing_id), ''), 'job:' || j.id::text), NULL::uuid
        FROM cross_post_jobs j
       WHERE j.inventaire_id IN (p_garde, p_absorbe) AND j.user_id = v_user AND j.platform <> 'vinted'
         AND j.status = 'published' AND COALESCE(j.action, 'publish') IN ('publish', 'republish')
         AND NOT EXISTS (SELECT 1 FROM annonces_plateforme x WHERE x.job_id = j.id)
      UNION ALL
      SELECT 'g', 'vinted', btrim(g.vinted_item_id), NULL::uuid
       WHERE NULLIF(btrim(COALESCE(g.vinted_item_id, '')), '') IS NOT NULL AND g.disparu_le IS NULL
      UNION ALL
      SELECT 'a', 'vinted', btrim(a.vinted_item_id), NULL::uuid
       WHERE NULLIF(btrim(COALESCE(a.vinted_item_id, '')), '') IS NOT NULL AND a.disparu_le IS NULL)
    SELECT jsonb_agg(DISTINCT x.platform) INTO v_conflits
      FROM l x JOIN l y ON y.platform = x.platform AND y.cote = 'g'
     WHERE x.cote = 'a' AND x.lid IS DISTINCT FROM y.lid
       AND NOT (x.annonce IS NOT NULL AND y.annonce IS NOT NULL
                AND COALESCE(rapprochement_republication_prouvee(x.annonce, y.annonce), false))
       AND NOT (x.platform = 'vinted' AND (COALESCE(vinted_remise_en_ligne(g.id, a.id), false)
                                           OR COALESCE(vinted_retraits_successifs(g.id, a.id), false)));
    IF v_conflits IS NOT NULL THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'deux_annonces_meme_plateforme', 'plateformes', v_conflits,
        'message', 'Cette fiche a déjà une annonce '
                   || (SELECT string_agg(CASE p WHEN 'leboncoin' THEN 'Leboncoin' WHEN 'ebay' THEN 'eBay' WHEN 'beebs' THEN 'Beebs'
                                                WHEN 'depop' THEN 'Depop' WHEN 'vinted' THEN 'Vinted' WHEN 'opla' THEN 'Opla' ELSE p END, ' et une annonce ')
                         FROM jsonb_array_elements_text(v_conflits) p)
                   || ' en ligne, et l''autre fiche en '
                   || CASE WHEN jsonb_array_length(v_conflits) > 1 THEN 'a d''autres' ELSE 'a une autre' END
                   || ' : deux annonces d''une même plateforme, ce sont deux exemplaires. Rien n''a été regroupé.');
    END IF;
  END IF;

  SELECT jsonb_agg(id) INTO v_ids FROM ventes WHERE inventaire_id = p_absorbe AND user_id = v_user;
  IF v_ids IS NOT NULL THEN
    UPDATE ventes SET inventaire_id = p_garde WHERE inventaire_id = p_absorbe AND user_id = v_user;
    v_dep := v_dep || jsonb_build_object('ventes', v_ids);
  END IF;

  SELECT jsonb_agg(id) INTO v_ids FROM cross_post_jobs WHERE inventaire_id = p_absorbe AND user_id = v_user;
  IF v_ids IS NOT NULL THEN
    UPDATE cross_post_jobs SET inventaire_id = p_garde WHERE inventaire_id = p_absorbe AND user_id = v_user;
    v_dep := v_dep || jsonb_build_object('cross_post_jobs', v_ids);
  END IF;

  SELECT jsonb_agg(id) INTO v_ids FROM annonces_plateforme WHERE inventaire_id = p_absorbe AND user_id = v_user;
  IF v_ids IS NOT NULL THEN
    -- (05/11, Nico) « manuel » seulement sur le geste de la personne ; une fusion automatique laisse la source d'avant.
    UPDATE annonces_plateforme SET inventaire_id = p_garde,
           source_rapprochement = CASE WHEN v_geste THEN 'manuel' ELSE source_rapprochement END,
           proposition = NULL, updated_at = now()
     WHERE inventaire_id = p_absorbe AND user_id = v_user;
    v_dep := v_dep || jsonb_build_object('annonces_plateforme', v_ids);
  END IF;

  SELECT jsonb_agg(id) INTO v_ids FROM vinted_listing_snapshots WHERE inventaire_id = p_absorbe;
  IF v_ids IS NOT NULL THEN
    UPDATE vinted_listing_snapshots SET inventaire_id = p_garde WHERE inventaire_id = p_absorbe;
    v_dep := v_dep || jsonb_build_object('vinted_listing_snapshots', v_ids);
  END IF;
  SELECT jsonb_agg(id) INTO v_ids FROM vinted_republish_captures WHERE inventaire_id = p_absorbe;
  IF v_ids IS NOT NULL THEN
    UPDATE vinted_republish_captures SET inventaire_id = p_garde WHERE inventaire_id = p_absorbe;
    v_dep := v_dep || jsonb_build_object('vinted_republish_captures', v_ids);
  END IF;
  IF EXISTS (SELECT 1 FROM fiches_annonce WHERE inventaire_id = p_absorbe AND user_id = v_user)
     AND NOT EXISTS (SELECT 1 FROM fiches_annonce WHERE inventaire_id = p_garde AND user_id = v_user) THEN
    UPDATE fiches_annonce SET inventaire_id = p_garde WHERE inventaire_id = p_absorbe AND user_id = v_user;
    v_dep := v_dep || jsonb_build_object('fiches_annonce', jsonb_build_array(p_absorbe));
  END IF;
  -- (07/10) Les notifications de vente et les remises en vente suivent l'article.
  SELECT jsonb_agg(id) INTO v_ids FROM push_ventes WHERE inventaire_id = p_absorbe AND user_id = v_user;
  IF v_ids IS NOT NULL THEN
    UPDATE push_ventes SET inventaire_id = p_garde WHERE inventaire_id = p_absorbe AND user_id = v_user;
    v_dep := v_dep || jsonb_build_object('push_ventes', v_ids);
  END IF;
  SELECT jsonb_agg(id) INTO v_ids FROM remises_en_vente WHERE inventaire_id = p_absorbe AND user_id = v_user;
  IF v_ids IS NOT NULL THEN
    UPDATE remises_en_vente SET inventaire_id = p_garde WHERE inventaire_id = p_absorbe AND user_id = v_user;
    v_dep := v_dep || jsonb_build_object('remises_en_vente', v_ids);
  END IF;
  SELECT jsonb_agg(id) INTO v_ids FROM rapprochements WHERE inventaire_id = p_absorbe AND user_id = v_user;
  IF v_ids IS NOT NULL THEN
    UPDATE rapprochements SET inventaire_id = p_garde WHERE inventaire_id = p_absorbe AND user_id = v_user;
    v_dep := v_dep || jsonb_build_object('rapprochements', v_ids);
  END IF;

  IF g.prix_achat IS NULL AND COALESCE(g.prix_achat_inconnu, false) = false
     AND (a.prix_achat IS NOT NULL OR COALESCE(a.prix_achat_inconnu, false) = true) THEN
    UPDATE inventaire SET prix_achat = a.prix_achat, prix_achat_inconnu = a.prix_achat_inconnu WHERE id = p_garde;
    v_champs := v_champs || jsonb_build_object(
      'prix_achat', jsonb_build_object('avant', NULL, 'apres', a.prix_achat),
      'prix_achat_inconnu', jsonb_build_object('avant', g.prix_achat_inconnu, 'apres', a.prix_achat_inconnu));
  END IF;

  IF NULLIF(trim(COALESCE(g.description, '')), '') IS NULL AND NULLIF(trim(COALESCE(a.description, '')), '') IS NOT NULL THEN
    UPDATE inventaire SET description = a.description WHERE id = p_garde;
    v_champs := v_champs || jsonb_build_object('description', jsonb_build_object('avant', g.description, 'apres', a.description));
  END IF;
  IF NULLIF(trim(COALESCE(g.marque, '')), '') IS NULL AND NULLIF(trim(COALESCE(a.marque, '')), '') IS NOT NULL THEN
    UPDATE inventaire SET marque = a.marque WHERE id = p_garde;
    v_champs := v_champs || jsonb_build_object('marque', jsonb_build_object('avant', g.marque, 'apres', a.marque));
  END IF;
  IF (g.photos IS NULL OR jsonb_typeof(g.photos) <> 'array' OR jsonb_array_length(g.photos) = 0)
     AND jsonb_typeof(a.photos) = 'array' AND jsonb_array_length(a.photos) > 0 THEN
    UPDATE inventaire SET photos = a.photos WHERE id = p_garde;
    v_champs := v_champs || jsonb_build_object('photos', jsonb_build_object('avant', g.photos, 'apres', a.photos));
  END IF;
  IF jsonb_typeof(a.attributs) = 'object' THEN
    v_attr := COALESCE(g.attributs, '{}'::jsonb);
    FOR v_cle IN SELECT k FROM jsonb_object_keys(a.attributs) k LOOP
      IF NOT (v_attr ? v_cle) THEN v_attr := v_attr || jsonb_build_object(v_cle, a.attributs -> v_cle); END IF;
    END LOOP;
    IF v_attr <> COALESCE(g.attributs, '{}'::jsonb) THEN
      UPDATE inventaire SET attributs = v_attr WHERE id = p_garde;
      v_champs := v_champs || jsonb_build_object('attributs', jsonb_build_object('avant', g.attributs, 'apres', v_attr));
    END IF;
  END IF;

  -- ── AJOUT 2026-09-25 : L'IDENTITÉ VINTED SUIT L'OBJET ─────────────────────
  -- L'absorbé porte l'annonce Vinted VIVANTE et le gardé n'en a pas : elle
  -- passe au gardé. Sans ça, la fiche gardée se croit hors de Vinted et rouvre
  -- une publication Vinted (le doublon qu'on vient d'éviter — Romain, 21/09).
  -- Journalisée dans champs_repris : inventaire_defusionner la rend.
  -- (Index unique (user_id, vinted_item_id) : l'absorbé la lâche d'abord.)
  IF g.vinted_item_id IS NULL AND a.vinted_item_id IS NOT NULL AND a.disparu_le IS NULL THEN
    UPDATE inventaire SET vinted_item_id = NULL, vinted_status = NULL, vinted_account_id = NULL WHERE id = p_absorbe;
    UPDATE inventaire
       SET vinted_item_id = a.vinted_item_id, vinted_status = a.vinted_status, vinted_account_id = a.vinted_account_id,
           vinted_catalog_id = COALESCE(g.vinted_catalog_id, a.vinted_catalog_id),
           vinted_view_count = a.vinted_view_count, vinted_favourite_count = a.vinted_favourite_count,
           listed_at_guess = COALESCE(g.listed_at_guess, a.listed_at_guess)
     WHERE id = p_garde;
    v_champs := v_champs || jsonb_build_object('vinted_identite', jsonb_build_object(
      'avant', jsonb_build_object('vinted_item_id', g.vinted_item_id, 'vinted_status', g.vinted_status,
                                  'vinted_account_id', g.vinted_account_id, 'vinted_catalog_id', g.vinted_catalog_id,
                                  'vinted_view_count', g.vinted_view_count, 'vinted_favourite_count', g.vinted_favourite_count,
                                  'listed_at_guess', g.listed_at_guess),
      'apres', jsonb_build_object('vinted_item_id', a.vinted_item_id, 'vinted_status', a.vinted_status,
                                  'vinted_account_id', a.vinted_account_id, 'vinted_catalog_id', a.vinted_catalog_id,
                                  'vinted_view_count', a.vinted_view_count, 'vinted_favourite_count', a.vinted_favourite_count,
                                  'listed_at_guess', a.listed_at_guess)));
  -- ── AJOUT 2026-09-25 après-midi : LA REMISE EN LIGNE — ÉCHANGE ─────────
  -- Le gardé porte l'annonce RETIRÉE, l'absorbé la VIVANTE qui l'a remplacée :
  -- le gardé prend la vivante (il redevient en ligne), l'absorbé GARDE la
  -- retirée — jamais effacée : la synchro retrouve les fiches par
  -- vinted_item_id, une retirée sans fiche serait réimportée. Ordre imposé par
  -- l'index unique (user_id, vinted_item_id) : libérer, poser, reposer.
  -- (migration 20260925163000) et deux annonces RETIRÉES successives : le gardé
  -- prend la plus récente, pour que le maillon suivant d'une chaîne se compare à elle.
  ELSIF g.vinted_item_id IS NOT NULL AND a.vinted_item_id IS NOT NULL
        AND (vinted_remise_en_ligne(g.id, a.id) OR vinted_retraits_successifs(g.id, a.id)) THEN
    UPDATE inventaire SET vinted_item_id = NULL, vinted_status = NULL, vinted_account_id = NULL WHERE id = p_absorbe;
    UPDATE inventaire
       SET vinted_item_id = a.vinted_item_id, vinted_status = a.vinted_status, vinted_account_id = a.vinted_account_id,
           vinted_catalog_id = COALESCE(a.vinted_catalog_id, g.vinted_catalog_id),
           vinted_view_count = a.vinted_view_count, vinted_favourite_count = a.vinted_favourite_count,
           listed_at_guess = COALESCE(g.listed_at_guess, a.listed_at_guess),
           disparu_le = a.disparu_le, last_synced_at = COALESCE(a.last_synced_at, g.last_synced_at)
     WHERE id = p_garde;
    UPDATE inventaire
       SET vinted_item_id = g.vinted_item_id, vinted_status = g.vinted_status, vinted_account_id = g.vinted_account_id,
           disparu_le = g.disparu_le
     WHERE id = p_absorbe;
    v_champs := v_champs || jsonb_build_object('vinted_identite', jsonb_build_object(
      'echange', true,
      'avant', jsonb_build_object('vinted_item_id', g.vinted_item_id, 'vinted_status', g.vinted_status,
                                  'vinted_account_id', g.vinted_account_id, 'vinted_catalog_id', g.vinted_catalog_id,
                                  'vinted_view_count', g.vinted_view_count, 'vinted_favourite_count', g.vinted_favourite_count,
                                  'listed_at_guess', g.listed_at_guess, 'disparu_le', g.disparu_le, 'last_synced_at', g.last_synced_at),
      'apres', jsonb_build_object('vinted_item_id', a.vinted_item_id, 'vinted_status', a.vinted_status,
                                  'vinted_account_id', a.vinted_account_id, 'vinted_catalog_id', a.vinted_catalog_id,
                                  'vinted_view_count', a.vinted_view_count, 'vinted_favourite_count', a.vinted_favourite_count,
                                  'listed_at_guess', a.listed_at_guess, 'disparu_le', a.disparu_le, 'last_synced_at', a.last_synced_at)));
  END IF;

  UPDATE inventaire SET fusionne_dans = p_garde, fusionne_le = now() WHERE id = p_absorbe;

  INSERT INTO inventaire_fusions (user_id, garde, absorbe, deplacements, champs_repris, par)
  VALUES (v_user, p_garde, p_absorbe, v_dep, v_champs, COALESCE(NULLIF(p_par, ''), 'utilisateur')) -- MODIF 2026-09-25
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('ok', true, 'fusion_id', v_id, 'garde', p_garde, 'absorbe', p_absorbe,
                            'deplacements', v_dep, 'champs_repris', v_champs);
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

CREATE OR REPLACE FUNCTION public.rapprochement_v3_appliquer(p_user uuid, p_decisions jsonb, p_mode text DEFAULT 'normal'::text, p_geste boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
 SET statement_timeout TO '120s'
AS $function$
DECLARE
  d jsonb; v_type text; a annonces_plateforme%ROWTYPE; f inventaire%ROWTYPE; g inventaire%ROWTYPE;
  v_fiche bigint; v_cand bigint; v_fa bigint; v_fb bigint; v_job uuid; v_r jsonb; v_posee boolean; v_motif text;
  v_ids uuid[]; v_id uuid; v_premiere uuid; v_n integer; v_ok boolean;
  v_vivante text; v_morts text[]; v_absorbes bigint[]; v_maillon bigint; v_mort text; v_motif_maillon text; v_r2 jsonb; v_jobs_clos integer;
  n_faits jsonb := '{}'::jsonb; n_sautes jsonb := '{}'::jsonb; v_erreurs jsonb := '[]'::jsonb; v_journal jsonb := '[]'::jsonb;
  t0 timestamptz := clock_timestamp();
  -- (05/11, Nico) un chemin AUTOMATIQUE ne signe jamais « utilisateur » : « auto:… (photo_identique) » — la fusion
  -- automatique par photo identique que retrait_job_prouve reconnaît déjà (même effet sur les ventes qu'avant), jamais
  -- un geste (ni « manuel », ni un retrait de copie sans confirmation : rattachement_confirme).
  v_par text := 'auto:photo_rapprochement_v3 (photo_identique)';
BEGIN
  IF p_user IS NULL OR jsonb_typeof(p_decisions) <> 'array' THEN RETURN jsonb_build_object('ok', false, 'reason', 'parametres'); END IF;
  IF NOT pg_try_advisory_xact_lock(hashtext('rapprochement:' || p_user::text)) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'occupe');
  END IF;
  PERFORM set_config('fillsell.rapprochement_moteur', 'on', true);

  FOR d IN SELECT * FROM jsonb_array_elements(p_decisions) LOOP
    v_type := d ->> 'type';
    BEGIN
      -- ── ATTACHER : une annonce sans article rejoint l'article du groupe ──
      IF v_type = 'attacher' THEN
        SELECT * INTO a FROM annonces_plateforme WHERE id = (d ->> 'annonce')::uuid AND user_id = p_user FOR UPDATE;
        v_fiche := (d ->> 'fiche')::bigint;
        SELECT * INTO f FROM inventaire WHERE id = v_fiche AND user_id = p_user AND fusionne_dans IS NULL;
        IF a.id IS NULL OR f.id IS NULL THEN n_sautes := n_sautes || jsonb_build_object('attacher_introuvable', COALESCE((n_sautes ->> 'attacher_introuvable')::int, 0) + 1); CONTINUE; END IF;
        IF a.inventaire_id IS NOT NULL OR a.ignoree_le IS NOT NULL OR a.disparu_le IS NOT NULL THEN
          n_sautes := n_sautes || jsonb_build_object('attacher_deja_decidee', COALESCE((n_sautes ->> 'attacher_deja_decidee')::int, 0) + 1); CONTINUE;
        END IF;
        IF EXISTS (SELECT 1 FROM annonces_plateforme x WHERE x.inventaire_id = v_fiche AND x.platform = a.platform AND x.disparu_le IS NULL AND x.id <> a.id)
           -- (15/10, P16) sauf la republication PROUVÉE : la même annonce publiée deux fois
           AND NOT (COALESCE(d ->> 'motif', '') = 'republication' AND rapprochement_v3_soeur_republication(a.id, v_fiche) IS NOT NULL) THEN
          n_sautes := n_sautes || jsonb_build_object('attacher_deux_exemplaires', COALESCE((n_sautes ->> 'attacher_deux_exemplaires')::int, 0) + 1); CONTINUE;
        END IF;
        v_job := rapprochement_attacher(a.id, v_fiche, 'photo_identique', COALESCE(d -> 'preuve', '{}'::jsonb) || jsonb_build_object('regle', 'rapprochement_v3', 'mode', p_mode)
                   || CASE WHEN d ->> 'motif' = 'republication' THEN jsonb_build_object('republication', true) ELSE '{}'::jsonb END);
        IF v_job IS NULL THEN n_sautes := n_sautes || jsonb_build_object('attacher_refuse', COALESCE((n_sautes ->> 'attacher_refuse')::int, 0) + 1); CONTINUE; END IF;
        -- (07/10) Article VENDU : le suivi part « vendu, encore en ligne ».
        IF f.statut = 'vendu' THEN
          UPDATE cross_post_jobs
             SET status = 'cancelled',
                 platform_fields = COALESCE(platform_fields, '{}'::jsonb) || jsonb_build_object('pending_removal', true,
                                   'vendu_encore_en_ligne', jsonb_build_object('annonce_id', a.id, 'par', 'rapprochement_v3', 'at', now()))
           WHERE id = v_job AND user_id = p_user AND platform_fields ->> 'source' = 'releve';
        END IF;
        n_faits := n_faits || jsonb_build_object('attacher', COALESCE((n_faits ->> 'attacher')::int, 0) + 1);

      -- ── FUSIONNER (réparation) : l'article importé, intact, rejoint la base ──
      ELSIF v_type = 'fusionner' THEN
        -- (08/10, complément) hors réparation : seulement vers une fiche du dressing
        -- Vinted pas encore jugée (née depuis la dernière passe) ; les gardes
        -- ci-dessous valent pareil (article importé intact, sinon la question).
        IF p_mode <> 'reparation' AND NOT (
             d ->> 'portee' = 'vinted_nouvelle'
             AND EXISTS (SELECT 1 FROM inventaire v WHERE v.id = NULLIF(d ->> 'garde', '')::bigint AND v.user_id = p_user
                           AND v.origine = 'vinted_sync' AND v.created_at > rapprochement_v3_vinted_depuis(p_user))) THEN
          n_sautes := n_sautes || jsonb_build_object('fusionner_hors_reparation', COALESCE((n_sautes ->> 'fusionner_hors_reparation')::int, 0) + 1); CONTINUE;
        END IF;
        SELECT * INTO f FROM inventaire WHERE id = (d ->> 'absorbe')::bigint AND user_id = p_user FOR UPDATE;
        SELECT * INTO g FROM inventaire WHERE id = (d ->> 'garde')::bigint AND user_id = p_user FOR UPDATE;
        IF f.id IS NULL OR g.id IS NULL OR f.fusionne_dans IS NOT NULL OR g.fusionne_dans IS NOT NULL OR f.id = g.id THEN
          n_sautes := n_sautes || jsonb_build_object('fusionner_introuvable', COALESCE((n_sautes ->> 'fusionner_introuvable')::int, 0) + 1); CONTINUE;
        END IF;
        IF NOT (f.origine LIKE 'releve\_%') OR NOT rapprochement_v3_fiche_intacte(f.id) OR g.statut = 'vendu' THEN
          -- Un article que la personne a touché : la question, pas la fusion.
          v_posee := releve_poser_question(p_user, g.id, f.id, 'photo_identique',
                       COALESCE(d -> 'preuve', '{}'::jsonb) || jsonb_build_object('avant_stock', false, 'regle', 'rapprochement_v3', 'article_modifie', true));
          n_sautes := n_sautes || jsonb_build_object('fusionner_article_modifie', COALESCE((n_sautes ->> 'fusionner_article_modifie')::int, 0) + 1,
                                                       'fusionner_question_posee', COALESCE((n_sautes ->> 'fusionner_question_posee')::int, 0) + CASE WHEN v_posee THEN 1 ELSE 0 END);
          CONTINUE;
        END IF;
        -- jamais deux annonces vivantes de la même plateforme sur un article
        IF EXISTS (SELECT 1 FROM annonces_plateforme x JOIN annonces_plateforme y ON y.platform = x.platform
                    WHERE x.inventaire_id = f.id AND y.inventaire_id = g.id AND x.disparu_le IS NULL AND y.disparu_le IS NULL
                      -- (15/10, P16) sauf la republication PROUVÉE : l'article importé d'une
                      -- annonce publiée deux fois rejoint la base qui porte sa sœur
                      AND NOT (COALESCE(d ->> 'republication', '') = 'true' AND COALESCE(rapprochement_republication_prouvee(x.id, y.id), false))) THEN
          n_sautes := n_sautes || jsonb_build_object('fusionner_deux_exemplaires', COALESCE((n_sautes ->> 'fusionner_deux_exemplaires')::int, 0) + 1); CONTINUE;
        END IF;
        v_r := inventaire_fusionner_pour(p_user, g.id, f.id, v_par);
        IF NOT COALESCE((v_r ->> 'ok')::boolean, false) THEN
          n_sautes := n_sautes || jsonb_build_object('fusionner_refuse', COALESCE((n_sautes ->> 'fusionner_refuse')::int, 0) + 1); CONTINUE;
        END IF;
        UPDATE inventaire_doublons SET statut = 'fusionnee', decide_le = now(), decide_par = 'rapprochement_v3', fusion_id = (v_r ->> 'fusion_id')::uuid
         WHERE user_id = p_user AND statut = 'proposee' AND least(garde, absorbe) = least(g.id, f.id) AND greatest(garde, absorbe) = greatest(g.id, f.id);
        UPDATE inventaire_doublons SET statut = 'caduque', decide_le = now(), decide_par = 'rapprochement_v3'
         WHERE user_id = p_user AND statut = 'proposee' AND (garde = f.id OR absorbe = f.id) AND motif IS DISTINCT FROM 'copie_non_prouvee';
        INSERT INTO rapprochements (user_id, annonce_id, inventaire_id, decision, par, score, detail)
        VALUES (p_user, NULLIF(d ->> 'annonce', '')::uuid, g.id, 'attache', 'auto', 1,
                COALESCE(d -> 'preuve', '{}'::jsonb) || jsonb_build_object('motif', 'photo_identique', 'regle', 'rapprochement_v3', 'fusion', v_r ->> 'fusion_id', 'absorbe', f.id, 'mode', p_mode)
                || CASE WHEN d ? 'portee' THEN jsonb_build_object('portee', d ->> 'portee') ELSE '{}'::jsonb END);
        n_faits := n_faits || jsonb_build_object('fusionner', COALESCE((n_faits ->> 'fusionner')::int, 0) + 1);

      -- ── GROUPE sans base : un article pour la première, les autres s'y rattachent ──
      ELSIF v_type = 'groupe' THEN
        SELECT COALESCE(array_agg((x)::uuid), ARRAY[]::uuid[]) INTO v_ids FROM jsonb_array_elements_text(d -> 'annonces') x;
        v_fiche := NULL;
        -- un article déjà là (import d'avant) sert de pivot
        SELECT a2.inventaire_id INTO v_fiche FROM annonces_plateforme a2 JOIN inventaire i2 ON i2.id = a2.inventaire_id
         WHERE a2.id = ANY (v_ids) AND a2.user_id = p_user AND i2.fusionne_dans IS NULL ORDER BY i2.created_at LIMIT 1;
        IF v_fiche IS NULL THEN
          FOREACH v_id IN ARRAY v_ids LOOP
            v_fiche := rapprochement_v3_fiche_de(p_user, v_id, p_geste);
            EXIT WHEN v_fiche IS NOT NULL;
          END LOOP;
        END IF;
        IF v_fiche IS NULL THEN n_sautes := n_sautes || jsonb_build_object('groupe_sans_article', COALESCE((n_sautes ->> 'groupe_sans_article')::int, 0) + 1); CONTINUE; END IF;
        n_faits := n_faits || jsonb_build_object('groupe', COALESCE((n_faits ->> 'groupe')::int, 0) + 1);
        FOREACH v_id IN ARRAY v_ids LOOP
          SELECT * INTO a FROM annonces_plateforme WHERE id = v_id AND user_id = p_user;
          IF a.id IS NULL OR a.inventaire_id = v_fiche THEN CONTINUE; END IF;
          IF a.inventaire_id IS NULL THEN
            IF a.ignoree_le IS NULL AND a.disparu_le IS NULL
               AND (NOT EXISTS (SELECT 1 FROM annonces_plateforme x WHERE x.inventaire_id = v_fiche AND x.platform = a.platform AND x.disparu_le IS NULL)
                    -- (15/10, P16) la republication prouvée d'une annonce du groupe
                    OR (COALESCE(d -> 'republications', '[]'::jsonb) ? a.id::text AND rapprochement_v3_soeur_republication(a.id, v_fiche) IS NOT NULL)) THEN
              v_job := rapprochement_attacher(a.id, v_fiche, 'photo_identique', COALESCE(d -> 'preuve', '{}'::jsonb) || jsonb_build_object('regle', 'rapprochement_v3', 'groupe_creation', true, 'mode', p_mode));
              IF v_job IS NOT NULL THEN n_faits := n_faits || jsonb_build_object('attacher', COALESCE((n_faits ->> 'attacher')::int, 0) + 1); END IF;
            END IF;
          ELSIF p_mode = 'reparation' THEN
            SELECT * INTO f FROM inventaire WHERE id = a.inventaire_id AND user_id = p_user AND fusionne_dans IS NULL;
            IF f.id IS NOT NULL AND f.origine LIKE 'releve\_%' AND rapprochement_v3_fiche_intacte(f.id)
               AND NOT EXISTS (SELECT 1 FROM annonces_plateforme x JOIN annonces_plateforme y ON y.platform = x.platform
                                WHERE x.inventaire_id = f.id AND y.inventaire_id = v_fiche AND x.disparu_le IS NULL AND y.disparu_le IS NULL) THEN
              v_r := inventaire_fusionner_pour(p_user, v_fiche, f.id, v_par);
              IF COALESCE((v_r ->> 'ok')::boolean, false) THEN
                UPDATE inventaire_doublons SET statut = 'caduque', decide_le = now(), decide_par = 'rapprochement_v3'
                 WHERE user_id = p_user AND statut = 'proposee' AND (garde = f.id OR absorbe = f.id) AND motif IS DISTINCT FROM 'copie_non_prouvee';
                n_faits := n_faits || jsonb_build_object('fusionner', COALESCE((n_faits ->> 'fusionner')::int, 0) + 1);
              END IF;
            END IF;
          END IF;
        END LOOP;

      -- ── À VÉRIFIER : un VRAI article, hors du stock, avec sa question ──────
      ELSIF v_type = 'a_verifier' THEN
        SELECT COALESCE(array_agg((x)::uuid), ARRAY[]::uuid[]) INTO v_ids FROM jsonb_array_elements_text(d -> 'annonces') x;
        v_fiche := NULL; v_premiere := NULL;
        SELECT a2.inventaire_id INTO v_fiche FROM annonces_plateforme a2 JOIN inventaire i2 ON i2.id = a2.inventaire_id
         WHERE a2.id = ANY (v_ids) AND a2.user_id = p_user AND i2.fusionne_dans IS NULL ORDER BY i2.created_at LIMIT 1;
        IF v_fiche IS NULL THEN
          FOREACH v_id IN ARRAY v_ids LOOP
            v_fiche := rapprochement_v3_fiche_de(p_user, v_id, p_geste);
            IF v_fiche IS NOT NULL THEN v_premiere := v_id; EXIT; END IF;
          END LOOP;
        END IF;
        IF v_fiche IS NULL THEN n_sautes := n_sautes || jsonb_build_object('a_verifier_sans_article', COALESCE((n_sautes ->> 'a_verifier_sans_article')::int, 0) + 1); CONTINUE; END IF;
        -- les autres annonces du groupe rejoignent l'article
        FOREACH v_id IN ARRAY v_ids LOOP
          SELECT * INTO a FROM annonces_plateforme WHERE id = v_id AND user_id = p_user;
          IF a.id IS NULL OR a.inventaire_id IS NOT NULL OR a.ignoree_le IS NOT NULL OR a.disparu_le IS NOT NULL THEN CONTINUE; END IF;
          IF NOT EXISTS (SELECT 1 FROM annonces_plateforme x WHERE x.inventaire_id = v_fiche AND x.platform = a.platform AND x.disparu_le IS NULL)
             -- (15/10, P16) la republication prouvée d'une annonce du groupe
             OR (COALESCE(d -> 'republications', '[]'::jsonb) ? a.id::text AND rapprochement_v3_soeur_republication(a.id, v_fiche) IS NOT NULL) THEN
            PERFORM rapprochement_attacher(a.id, v_fiche, 'photo_identique', jsonb_build_object('regle', 'rapprochement_v3', 'groupe_creation', true, 'mode', p_mode));
          END IF;
        END LOOP;
        -- le candidat : un article, ou l'article d'une annonce (créé au besoin)
        v_cand := NULLIF(d #>> '{candidat,fiche}', '')::bigint;
        IF v_cand IS NULL AND NULLIF(d #>> '{candidat,annonce}', '') IS NOT NULL THEN
          v_cand := rapprochement_v3_fiche_de(p_user, (d #>> '{candidat,annonce}')::uuid, p_geste);
        END IF;
        -- la chaîne des fusions : toujours l'article vivant
        WHILE v_cand IS NOT NULL AND (SELECT fusionne_dans FROM inventaire WHERE id = v_cand) IS NOT NULL LOOP
          v_cand := (SELECT fusionne_dans FROM inventaire WHERE id = v_cand);
        END LOOP;
        SELECT * INTO a FROM annonces_plateforme WHERE id = COALESCE(v_premiere, v_ids[1]) AND user_id = p_user;
        v_motif := COALESCE(NULLIF(d ->> 'motif', ''), 'rapprochement');
        v_posee := false;
        IF v_cand IS NOT NULL AND v_cand <> v_fiche THEN
          v_posee := releve_poser_question(p_user, v_cand, v_fiche, v_motif,
                       COALESCE(d -> 'preuves', '{}'::jsonb) || jsonb_build_object('avant_stock', true, 'regle', 'rapprochement_v3', 'annonce_id', a.id,
                                                                                   'platform', a.platform, 'listing_id', a.listing_id, 'url', a.url, 'prix', a.prix, 'titre_annonce', a.titre));
          -- déjà posée (par le moteur du 07/10, le rattrapage) : elle vaut
          IF NOT v_posee AND EXISTS (SELECT 1 FROM inventaire_doublons q WHERE q.user_id = p_user AND q.statut = 'proposee'
                                       AND least(q.garde, q.absorbe) = least(v_cand, v_fiche) AND greatest(q.garde, q.absorbe) = greatest(v_cand, v_fiche)) THEN
            v_posee := true;
          END IF;
        END IF;
        IF v_posee THEN
          PERFORM rapprochement_v3_marquer(p_user, v_fiche, v_motif, v_cand, a.id, a.platform);
          n_faits := n_faits || jsonb_build_object('a_verifier', COALESCE((n_faits ->> 'a_verifier')::int, 0) + 1);
        ELSE
          -- paire déjà tranchée (« non ») ou candidat impossible : un autre article, au stock
          n_faits := n_faits || jsonb_build_object('creer', COALESCE((n_faits ->> 'creer')::int, 0) + 1);
          n_sautes := n_sautes || jsonb_build_object('a_verifier_paire_tranchee', COALESCE((n_sautes ->> 'a_verifier_paire_tranchee')::int, 0) + 1);
        END IF;

      -- ── ANNONCE EN DOUBLE ? (même plateforme, même photo, même titre) ─────
      ELSIF v_type = 'annonce_en_double' THEN
        v_fa := NULLIF(d #>> '{a,fiche}', '')::bigint;
        IF v_fa IS NULL AND NULLIF(d #>> '{a,annonce}', '') IS NOT NULL THEN v_fa := rapprochement_v3_fiche_de(p_user, (d #>> '{a,annonce}')::uuid, p_geste); END IF;
        v_fb := NULLIF(d #>> '{b,fiche}', '')::bigint;
        IF v_fb IS NULL AND NULLIF(d #>> '{b,annonce}', '') IS NOT NULL THEN v_fb := rapprochement_v3_fiche_de(p_user, (d #>> '{b,annonce}')::uuid, p_geste); END IF;
        IF v_fa IS NULL OR v_fb IS NULL OR v_fa = v_fb THEN n_sautes := n_sautes || jsonb_build_object('double_sans_article', COALESCE((n_sautes ->> 'double_sans_article')::int, 0) + 1); CONTINUE; END IF;
        -- garde = le plus ancien ; jamais un article vendu
        SELECT * INTO f FROM inventaire WHERE id = v_fa; SELECT * INTO g FROM inventaire WHERE id = v_fb;
        IF f.statut = 'vendu' OR g.statut = 'vendu' THEN n_sautes := n_sautes || jsonb_build_object('double_vendu', COALESCE((n_sautes ->> 'double_vendu')::int, 0) + 1); CONTINUE; END IF;
        IF g.created_at < f.created_at THEN v_fa := g.id; v_fb := f.id; END IF;
        v_posee := releve_poser_question(p_user, v_fa, v_fb, 'annonce_en_double',
                     COALESCE(d -> 'preuves', '{}'::jsonb) || jsonb_build_object('avant_stock', true, 'regle', 'rapprochement_v3', 'platform', d ->> 'platform'));
        IF v_posee THEN
          PERFORM rapprochement_v3_marquer(p_user, v_fa, 'annonce_en_double', v_fb, NULLIF(d #>> '{a,annonce}', '')::uuid, d ->> 'platform');
          PERFORM rapprochement_v3_marquer(p_user, v_fb, 'annonce_en_double', v_fa, NULLIF(d #>> '{b,annonce}', '')::uuid, d ->> 'platform');
          n_faits := n_faits || jsonb_build_object('annonce_en_double', COALESCE((n_faits ->> 'annonce_en_double')::int, 0) + 1);
        ELSE
          n_sautes := n_sautes || jsonb_build_object('double_paire_tranchee', COALESCE((n_sautes ->> 'double_paire_tranchee')::int, 0) + 1);
        END IF;

      -- ── CRÉER : aucun candidat, l'article entre au stock ─────────────────
      ELSIF v_type = 'creer' THEN
        v_fiche := rapprochement_v3_fiche_de(p_user, (d ->> 'annonce')::uuid, p_geste);
        IF v_fiche IS NULL THEN n_sautes := n_sautes || jsonb_build_object('creer_refuse', COALESCE((n_sautes ->> 'creer_refuse')::int, 0) + 1);
        ELSE n_faits := n_faits || jsonb_build_object('creer', COALESCE((n_faits ->> 'creer')::int, 0) + 1); END IF;

      -- ── ENTRER AU STOCK (réparation) : un marqueur automatique sans raison ─
      ELSIF v_type = 'entrer_stock' THEN
        IF p_mode <> 'reparation' THEN CONTINUE; END IF;
        UPDATE inventaire SET a_verifier = NULL
         WHERE id = (d ->> 'fiche')::bigint AND user_id = p_user AND a_verifier IS NOT NULL
           AND COALESCE(a_verifier ->> 'source', '') IN ('moteur', 'rattrapage_0710', 'rapprochement_v3');
        IF FOUND THEN
          UPDATE inventaire_doublons SET statut = 'caduque', decide_le = now(), decide_par = 'rapprochement_v3'
           WHERE user_id = p_user AND statut = 'proposee' AND decide_par IS NULL AND COALESCE(source, '') = 'releve'
             AND (garde = (d ->> 'fiche')::bigint OR absorbe = (d ->> 'fiche')::bigint) AND motif IS DISTINCT FROM 'copie_non_prouvee';
          n_faits := n_faits || jsonb_build_object('entrer_stock', COALESCE((n_faits ->> 'entrer_stock')::int, 0) + 1);
        END IF;

      -- ── QUESTION CADUQUE (réparation) : une question automatique que v3 ne confirme pas ─
      ELSIF v_type = 'question_caduque' THEN
        IF p_mode <> 'reparation' THEN CONTINUE; END IF;
        UPDATE inventaire_doublons SET statut = 'caduque', decide_le = now(), decide_par = 'rapprochement_v3'
         WHERE id = (d ->> 'id')::uuid AND user_id = p_user AND statut = 'proposee' AND decide_par IS NULL
           AND COALESCE(source, '') = 'releve' AND motif IS DISTINCT FROM 'copie_non_prouvee';
        IF FOUND THEN n_faits := n_faits || jsonb_build_object('question_caduque', COALESCE((n_faits ->> 'question_caduque')::int, 0) + 1); END IF;

      -- ── IGNORER : un relevé non probant (hors liste, eBay hors compte) ──
      ELSIF v_type = 'ignorer' THEN
        UPDATE annonces_plateforme SET ignoree_le = now(), updated_at = now()
         WHERE id = (d ->> 'annonce')::uuid AND user_id = p_user AND inventaire_id IS NULL AND ignoree_le IS NULL;
        IF FOUND THEN
          INSERT INTO rapprochements (user_id, annonce_id, decision, par, score, detail)
          VALUES (p_user, (d ->> 'annonce')::uuid, 'ignore', 'auto', 0, jsonb_build_object('motif', COALESCE(d ->> 'motif', 'releve_non_probant'), 'regle', 'rapprochement_v3'));
          n_faits := n_faits || jsonb_build_object('ignorer', COALESCE((n_faits ->> 'ignorer')::int, 0) + 1);
        END IF;
      -- ── (08/10 soir) FICHE CRÉÉE À LA MAIN FACE À UNE FICHE VINTED ────────
      -- garde = la fiche de la personne, absorbe = la fiche Vinted. « fusionner_fiche » :
      -- photo ET titre, aucun concurrent (le moteur) ; la base fond la fiche
      -- Vinted dans celle de la personne si rien ne s'y oppose
      -- (rapprochement_v3_fiches_fusionnables), sinon la question. « fiche_a_verifier » :
      -- un doute, toujours la question. La fiche Vinted sort du stock le temps
      -- de la réponse (rapprochement_v3_marquer : seulement si personne ne l'a
      -- touchée) ; la fiche de la personne, jamais.
      ELSIF v_type IN ('fusionner_fiche', 'fiche_a_verifier') THEN
        v_fa := NULLIF(d ->> 'garde', '')::bigint;
        v_fb := NULLIF(d ->> 'absorbe', '')::bigint;
        v_motif := rapprochement_v3_fiches_fusionnables(p_user, v_fa, v_fb);
        -- rien : la paire n'existe plus, la personne l'a tranchée, ou ce n'est pas
        -- une fiche à la main face à une fiche Vinted ; un article vendu ou retiré
        IF v_motif IN ('introuvable', 'paire_tranchee', 'main_pas_a_la_main', 'vinted_sans_annonce',
                       'main_pas_en_stock', 'vinted_pas_en_stock', 'vinted_disparue') THEN
          n_sautes := n_sautes || jsonb_build_object(v_type || '_' || v_motif, COALESCE((n_sautes ->> (v_type || '_' || v_motif))::int, 0) + 1);
          CONTINUE;
        END IF;
        IF v_type = 'fusionner_fiche' AND v_motif IS NULL THEN
          v_r := inventaire_fusionner_pour(p_user, v_fa, v_fb, 'auto:photo_rapprochement_v3_main (photo_identique)');
          IF COALESCE((v_r ->> 'ok')::boolean, false) THEN
            UPDATE inventaire_doublons SET statut = 'fusionnee', decide_le = now(), decide_par = 'rapprochement_v3', fusion_id = (v_r ->> 'fusion_id')::uuid
             WHERE user_id = p_user AND statut = 'proposee' AND least(garde, absorbe) = least(v_fa, v_fb) AND greatest(garde, absorbe) = greatest(v_fa, v_fb);
            UPDATE inventaire_doublons SET statut = 'caduque', decide_le = now(), decide_par = 'rapprochement_v3'
             WHERE user_id = p_user AND statut = 'proposee' AND (garde = v_fb OR absorbe = v_fb) AND motif IS DISTINCT FROM 'copie_non_prouvee';
            -- (le journal : inventaire_fusions, par = 'auto:photo_rapprochement_v3_main (photo_identique)',
            -- propre à cette règle — rapprochements exige une annonce, il n'y en a pas)
            n_faits := n_faits || jsonb_build_object('fusionner_fiche', COALESCE((n_faits ->> 'fusionner_fiche')::int, 0) + 1);
            CONTINUE;
          END IF;
          v_motif := 'fusion_refusee:' || COALESCE(v_r ->> 'reason', '?');
        END IF;
        v_posee := releve_poser_question(p_user, v_fa, v_fb, COALESCE(NULLIF(d ->> 'motif', ''), 'photo_identique'),
                     COALESCE(d -> 'preuves', d -> 'preuve', '{}'::jsonb)
                     || jsonb_build_object('avant_stock', true, 'regle', 'rapprochement_v3', 'portee', 'fiche_main')
                     || CASE WHEN v_motif IS NOT NULL THEN jsonb_build_object('refus_fusion', v_motif) ELSE '{}'::jsonb END);
        IF NOT v_posee AND EXISTS (SELECT 1 FROM inventaire_doublons q WHERE q.user_id = p_user AND q.statut = 'proposee'
                                     AND least(q.garde, q.absorbe) = least(v_fa, v_fb) AND greatest(q.garde, q.absorbe) = greatest(v_fa, v_fb)) THEN
          v_posee := true;
        END IF;
        IF v_posee THEN
          PERFORM rapprochement_v3_marquer(p_user, v_fb, COALESCE(NULLIF(d ->> 'motif', ''), 'photo_identique'), v_fa, NULL::uuid, 'vinted');
          n_faits := n_faits || jsonb_build_object('fiche_a_verifier', COALESCE((n_faits ->> 'fiche_a_verifier')::int, 0) + 1);
          IF v_motif IS NOT NULL AND v_type = 'fusionner_fiche' THEN
            n_sautes := n_sautes || jsonb_build_object('fusionner_fiche_question:' || v_motif, COALESCE((n_sautes ->> ('fusionner_fiche_question:' || v_motif))::int, 0) + 1);
          END IF;
        ELSE
          n_sautes := n_sautes || jsonb_build_object(v_type || '_paire_tranchee', COALESCE((n_sautes ->> (v_type || '_paire_tranchee'))::int, 0) + 1);
        END IF;

      -- ── (08/10 soir, Bebertdeals) LA REMISE EN LIGNE VINTED ─────────────────
      -- garde = la fiche la plus ancienne (annonce Vinted morte : dépôts, copies,
      -- prix d'achat), absorbe = la fiche née de la nouvelle annonce, chaine = les
      -- fiches intermédiaires (annonces mortes). « remise_en_ligne » : la base
      -- vérifie (rapprochement_v3_remise_possible), fond la nouvelle dans la
      -- gardée (l'identité Vinted vivante passe à la gardée : échange journalisé,
      -- réversible), puis les maillons ; les jobs Vinted des annonces mortes sont
      -- clos « remplacée, pas une vente ». Ce qui demande la personne devient la
      -- question. « remise_en_ligne_a_verifier » : toujours la question, rien caché.
      ELSIF v_type IN ('remise_en_ligne', 'remise_en_ligne_a_verifier') THEN
        v_fa := NULLIF(d ->> 'garde', '')::bigint;
        v_fb := NULLIF(d ->> 'absorbe', '')::bigint;
        v_motif := rapprochement_v3_remise_possible(p_user, v_fa, v_fb);
        IF v_motif IN ('introuvable', 'paire_tranchee', 'pas_vinted', 'boutiques_differentes', 'ancienne_vendue', 'vente_en_cours')
           OR (v_type = 'remise_en_ligne' AND v_motif IN ('nouvelle_pas_en_ligne', 'pas_une_remise_en_ligne')) THEN
          n_sautes := n_sautes || jsonb_build_object(v_type || '_' || v_motif, COALESCE((n_sautes ->> (v_type || '_' || v_motif))::int, 0) + 1);
          CONTINUE;
        END IF;
        IF v_type = 'remise_en_ligne' AND v_motif IS NULL THEN
          SELECT btrim(vinted_item_id) INTO v_mort FROM inventaire WHERE id = v_fa;
          SELECT btrim(vinted_item_id) INTO v_vivante FROM inventaire WHERE id = v_fb;
          v_r := inventaire_fusionner_pour(p_user, v_fa, v_fb, 'auto:photo_rapprochement_v3_remise (photo_identique)');
          IF COALESCE((v_r ->> 'ok')::boolean, false) THEN
            v_morts := ARRAY[v_mort]; v_absorbes := ARRAY[v_fb];
            FOR v_maillon IN SELECT (x #>> '{}')::bigint FROM jsonb_array_elements(CASE WHEN jsonb_typeof(d -> 'chaine') = 'array' THEN d -> 'chaine' ELSE '[]'::jsonb END) x LOOP
              v_motif_maillon := rapprochement_v3_remise_maillon(p_user, v_fa, v_maillon);
              IF v_motif_maillon IS NULL THEN
                SELECT btrim(vinted_item_id) INTO v_mort FROM inventaire WHERE id = v_maillon;
                v_r2 := inventaire_fusionner_pour(p_user, v_fa, v_maillon, 'auto:photo_rapprochement_v3_remise (photo_identique)');
                IF COALESCE((v_r2 ->> 'ok')::boolean, false) THEN
                  v_morts := v_morts || v_mort; v_absorbes := v_absorbes || v_maillon;
                  n_faits := n_faits || jsonb_build_object('remise_en_ligne_maillon', COALESCE((n_faits ->> 'remise_en_ligne_maillon')::int, 0) + 1);
                ELSE
                  v_motif_maillon := 'fusion_refusee:' || COALESCE(v_r2 ->> 'reason', '?');
                END IF;
              END IF;
              IF v_motif_maillon IS NOT NULL THEN
                n_sautes := n_sautes || jsonb_build_object('remise_en_ligne_maillon_' || v_motif_maillon, COALESCE((n_sautes ->> ('remise_en_ligne_maillon_' || v_motif_maillon))::int, 0) + 1);
              END IF;
            END LOOP;
            -- les jobs Vinted des annonces mortes, sur la gardée : clos, ce n'est pas une vente
            UPDATE cross_post_jobs
               SET status = 'cancelled',
                   error = 'Annonce Vinted remplacée par une remise en ligne (annonce ' || v_vivante || ') — pas une vente',
                   platform_fields = COALESCE(platform_fields, '{}'::jsonb) || jsonb_build_object('remplacee_par', jsonb_build_object(
                     'vinted_item_id', v_vivante, 'le', now(), 'par', 'rapprochement_v3', 'statut_avant', status))
             WHERE user_id = p_user AND inventaire_id = v_fa AND platform = 'vinted' AND action IN ('publish', 'republish')
               AND status = 'published' AND btrim(platform_listing_id) = ANY (v_morts)
               AND (reservation_id IS NULL OR reservation_settled_at IS NOT NULL);
            GET DIAGNOSTICS v_jobs_clos = ROW_COUNT;
            UPDATE inventaire_doublons SET statut = 'caduque', decide_le = now(), decide_par = 'rapprochement_v3'
             WHERE user_id = p_user AND statut = 'proposee' AND (garde = ANY (v_absorbes) OR absorbe = ANY (v_absorbes))
               AND motif IS DISTINCT FROM 'copie_non_prouvee';
            n_faits := n_faits || jsonb_build_object('remise_en_ligne', COALESCE((n_faits ->> 'remise_en_ligne')::int, 0) + 1,
                                                     'remise_en_ligne_jobs_clos', COALESCE((n_faits ->> 'remise_en_ligne_jobs_clos')::int, 0) + v_jobs_clos);
            CONTINUE;
          END IF;
          v_motif := 'fusion_refusee:' || COALESCE(v_r ->> 'reason', '?');
        END IF;
        v_posee := releve_poser_question(p_user, v_fa, v_fb, COALESCE(NULLIF(d ->> 'motif', ''), 'remise_en_ligne'),
                     COALESCE(d -> 'preuves', d -> 'preuve', '{}'::jsonb)
                     || jsonb_build_object('regle', 'rapprochement_v3', 'portee', 'remise_en_ligne')
                     || CASE WHEN v_motif IS NOT NULL THEN jsonb_build_object('refus_fusion', v_motif) ELSE '{}'::jsonb END);
        IF v_posee THEN
          n_faits := n_faits || jsonb_build_object('remise_en_ligne_a_verifier', COALESCE((n_faits ->> 'remise_en_ligne_a_verifier')::int, 0) + 1);
          IF v_motif IS NOT NULL AND v_type = 'remise_en_ligne' THEN
            n_sautes := n_sautes || jsonb_build_object('remise_en_ligne_question:' || v_motif, COALESCE((n_sautes ->> ('remise_en_ligne_question:' || v_motif))::int, 0) + 1);
          END IF;
        ELSE
          n_sautes := n_sautes || jsonb_build_object(v_type || '_paire_tranchee', COALESCE((n_sautes ->> (v_type || '_paire_tranchee'))::int, 0) + 1);
        END IF;

      ELSE
        n_sautes := n_sautes || jsonb_build_object('type_inconnu', COALESCE((n_sautes ->> 'type_inconnu')::int, 0) + 1);
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_erreurs := v_erreurs || jsonb_build_array(jsonb_build_object('type', v_type, 'decision', d - 'preuves' - 'preuve', 'erreur', left(SQLERRM, 300)));
    END;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'faits', n_faits, 'sautes', n_sautes, 'erreurs', v_erreurs,
                            'ms', round(extract(epoch FROM clock_timestamp() - t0) * 1000));
END;
$function$;

CREATE OR REPLACE FUNCTION public.armer_retrait_job_pour(p_job_id uuid, p_chemin text, p_delai interval, p_preuve_geste boolean)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  j        public.cross_post_jobs%rowtype;
  v_item   text;
  v_url    text;
  v_ident  text;
  v_sans_lien boolean;
  v_pf     jsonb;
  v_del    uuid;
  v_compte text;
begin
  select * into j from public.cross_post_jobs where id = p_job_id for update;
  if not found or j.inventaire_id is null
     or coalesce(j.action, 'publish') not in ('publish', 'republish')
     or j.status is distinct from 'published' then
    return null;
  end if;

  -- Point A, incident Angel : le dépôt prouve l'annonce, pas une vente.
  -- Lecture indexée ventes_user_inventaire_idx ; aucune réécriture de données.
  if not exists (
    select 1 from public.ventes v
    join public.inventaire i on i.id = v.inventaire_id and i.user_id = v.user_id
    where v.user_id = j.user_id and v.inventaire_id = j.inventaire_id
      and i.statut = 'vendu'
      and lower(coalesce(v.statut, '')) not in ('annule', 'annulée', 'cancelled', 'canceled')
      and coalesce(nullif(v.plateforme_code, ''), nullif(v.plateforme, '')) is not null
      and lower(coalesce(nullif(i.plateforme, ''), nullif(v.plateforme_code, ''), v.plateforme)) <> lower(j.platform)
    limit 1
  ) and not public.vente_prouvee_fiche_liee(j.inventaire_id, j.platform) then  -- (18/10) comptes reliés : la vente de la jumelle vaut preuve
    -- (2026-09-30, règle Louis partie 2 — décision Nico) Le geste de la
    -- personne vaut preuve de vente pour CE retrait-là seulement : « oui » à
    -- « Déjà vendu ? » sur l'annonce que l'app lui a montrée (preuve déjà
    -- reconnue le 27/09). La fiche doit être vendue, et jamais sur la
    -- plateforme de l'annonce retirée. Toutes les autres gardes restent.
    if not coalesce(p_preuve_geste, false) or not exists (
      select 1 from public.inventaire i
       where i.id = j.inventaire_id and i.user_id = j.user_id and i.statut = 'vendu'
         and lower(coalesce(nullif(i.plateforme, ''), '')) <> lower(j.platform)
    ) then
      return null;
    end if;
  end if;
  -- (27/09 soir) UN TITRE N'EST JAMAIS UNE PREUVE : l'annonce doit être liée à
  -- SA fiche par une preuve, et la fiche ne doit pas porter deux annonces
  -- vivantes sur cette plateforme (deux annonces = deux exemplaires).
  if not public.retrait_job_prouve(j.id) then
    return null;
  end if;
  -- ⛔ (05/11, Nico — assopmfrance) UN RETRAIT DE COPIE N'EST JAMAIS ARMÉ SUR UN RATTACHEMENT AUTOMATIQUE NON CONFIRMÉ
  -- (rattachement_confirme) : rien n'est retiré, la copie devient la question « Déjà vendu ? » (poser_questions_copies_
  -- non_prouvees, appelée par armer_retraits_copies). Le « Oui, la retirer » de la personne sur CETTE annonce
  -- (p_preuve_geste) est la confirmation : il passe. (05/11 soir, décision a) Une PHOTO IDENTIQUE reste une preuve :
  -- un rattachement ou une fusion automatique par photo identique est confirmé, le retrait s'arme comme avant.
  if not coalesce(p_preuve_geste, false) and not public.rattachement_confirme(j.id) then
    insert into public.usage_logs (user_id, feature, metadata)
    values (j.user_id, 'retrait_refuse_rattachement_automatique', jsonb_build_object(
      'chemin', p_chemin, 'job', j.id, 'platform', j.platform, 'article_id', j.inventaire_id::text,
      'rattachement', j.platform_fields -> 'rattachement'));
    return null;
  end if;
  -- ⛔ (03/11 soir, Nico — JEAN-LUC LASSARAT, Dylan Fontaine, louis-seller) SEULE UNE VENTE PROUVÉE, SURVENUE APRÈS LA
  -- MISE EN LIGNE DE L'ANNONCE, PEUT LA RETIRER. Une annonce importée par un relevé (née hors FillSell) mise en ligne
  -- après la vente n'est pas l'objet vendu : un autre exemplaire, une remise en vente. Mise en ligne = sa plus ancienne
  -- trace (annonce_mise_en_ligne) ; vente = vendu_le, sinon la fin de son jour (vente_instant). Une annonce que FillSell a
  -- déposée pour la fiche n'existait pas avant le dépôt : la règle d'avant (une vente vue en retard retire toujours la
  -- copie de l'objet). Jamais un retrait sans trace.
  if public.annonce_importee(j.id) and not public.vente_apres_mise_en_ligne(j.id) then
    insert into public.usage_logs (user_id, feature, metadata)
    values (j.user_id, 'retrait_refuse_vente_avant_mise_en_ligne', jsonb_build_object(
      'chemin', p_chemin, 'job', j.id, 'platform', j.platform, 'article_id', j.inventaire_id::text,
      'mise_en_ligne', public.annonce_mise_en_ligne(j.id)));
    return null;
  end if;
  -- (15/10, P16) Deux annonces vivantes sur la plateforme : rien d'office — sauf
  -- le « oui » de la personne à « Déjà vendu ? » sur CETTE annonce (montrée par
  -- l'écran, preuve par le geste) : c'est elle, et elle seule, qui part.
  if public.fiche_annonces_vivantes(j.inventaire_id, j.platform) >= 2 and not coalesce(p_preuve_geste, false) then
    return null;
  end if;
  if coalesce(j.platform_fields ->> 'sale_signal', '') = 'sold' then
    return null;
  end if;
  -- (22/10, XEWER — OPLA : PLUS RIEN) Depuis la sortie d'Opla (10/10), AUCUN retrait Opla ne naît : FillSell ne
  -- touche plus Opla. Il naissait « cancelled » (garde_opla_sortie_jobs), et un retrait clos ne comptant pas dans
  -- le contrôle des doublons ci-dessous, chaque vente et chaque suppression en recréait 2 à 4 (59 chez XEWER du
  -- 11 au 22/10, 222 sur le parc). L'information « retire-la toi-même sur Opla » est posée UNE fois, sur la
  -- copie (opla_copie_a_retirer_noter) — après toutes les preuves ci-dessus, comme le retrait d'avant.
  if j.platform = 'opla' and public.opla_sortie_passee() then
    perform public.opla_copie_a_retirer_noter(j.id, p_chemin);
    return null;
  end if;
  v_url := nullif(btrim(coalesce(j.listing_url, '')), '');
  if j.platform = 'vinted' then
    v_item := coalesce(case when j.platform_listing_id ~ '^\d+$' then j.platform_listing_id end,
                       substring(v_url from '/items/(\d+)'));
    if v_item is not null and public.vinted_annonce_vendue(j.user_id, v_item) then
      return null;
    end if;
  end if;
  v_sans_lien := v_url is null and nullif(btrim(coalesce(j.platform_listing_id, '')), '') is null;
  if exists (
    select 1 from public.cross_post_jobs d
     where d.user_id = j.user_id and d.inventaire_id = j.inventaire_id
       and d.platform = j.platform and d.action = 'delete'
       and (d.status in ('pending', 'processing', 'needs_user')
            or (d.status = 'deleted' and d.created_at >= coalesce(j.published_at, j.created_at)))
       and (v_sans_lien
            or public.listing_designe(coalesce(j.platform_listing_id, v_item, v_url), d.listing_url, d.platform_listing_id)
            or (v_url is not null and d.listing_url = v_url)
            or (j.platform_listing_id is not null and d.platform_listing_id = j.platform_listing_id))
  ) then
    return null;
  end if;
  v_pf := jsonb_build_object('arme_par', jsonb_build_object(
            'chemin', p_chemin, 'le', now(), 'depot', j.id,
            'pose_par', 'armer_retrait_job (serveur)'));
  if coalesce(p_preuve_geste, false) then
    v_pf := v_pf || jsonb_build_object('preuve', 'geste_deja_vendu');   -- MODIF 2026-09-30
  end if;
  if v_url is null then
    v_pf := v_pf || jsonb_build_object('removal_url_missing', true);
  end if;
  if j.platform = 'beebs' and v_sans_lien then
    v_pf := v_pf || jsonb_build_object('retrait_attend_lien', jsonb_build_object(
              'depuis', now(), 'motif', 'depot_beebs_en_verification_a_la_vente'));
  end if;
  if j.platform = 'vinted' then
    select nullif(btrim(i.vinted_account_id::text), '') into v_compte
      from public.inventaire i where i.id = j.inventaire_id;
    if v_compte is not null then
      v_pf := v_pf || jsonb_build_object('vinted_account_id', v_compte);
    end if;
  end if;
  -- (18/10, retrait Depop 81188384) Le numéro de l'annonce rendu au dépôt
  -- (depop_product_id : POST listing/products → 201 {id, slug}) suit le retrait :
  -- l'extension retire par ce numéro, sans dépendre de la lecture du lien.
  if j.platform = 'depop' and coalesce(j.platform_fields ->> 'depop_product_id', '') ~ '^[0-9]+$' then
    v_pf := v_pf || jsonb_build_object('depop_product_id', j.platform_fields -> 'depop_product_id');
  end if;
  if p_delai is not null and p_delai > interval '0' then
    v_pf := v_pf || jsonb_build_object('next_action_after', to_jsonb(now() + p_delai));
  end if;
  insert into public.cross_post_jobs
    (user_id, inventaire_id, platform, action, status, photo_option, title, listing_url, platform_listing_id, platform_fields)
  values
    (j.user_id, j.inventaire_id, j.platform, 'delete', 'pending', 'original',
     j.title, v_url, nullif(btrim(coalesce(j.platform_listing_id, '')), ''), v_pf)
  returning id into v_del;
  update public.cross_post_jobs
     set platform_fields = coalesce(platform_fields, '{}'::jsonb) || jsonb_build_object(
           'pending_removal', false,
           'retrait_arme', jsonb_build_object('job', v_del, 'le', now(), 'chemin', p_chemin))
   where id = j.id;
  return v_del;
end;
$function$;

CREATE OR REPLACE FUNCTION public.armer_retraits_copies(p_inventaire_id bigint, p_chemin text, p_sauf_job uuid DEFAULT NULL::uuid, p_sauf_plateforme text DEFAULT NULL::text, p_delai interval DEFAULT '00:00:00'::interval)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_inv   public.inventaire%rowtype;
  v_pub   record;
  v_del   uuid;
  v_n     integer := 0;
  v_pl    text[] := '{}';
  v_url   text;
  v_pf    jsonb;
  v_q     integer := 0;
begin
  select * into v_inv from public.inventaire where id = p_inventaire_id;
  if not found or v_inv.fusionne_dans is not null then
    return jsonb_build_object('armes', 0);
  end if;
  -- (2026-09-27, audit synchro) une fiche peut porter PLUSIEURS annonces
  -- vivantes sur la même plateforme (rattachement de la personne, deux
  -- dépôts) : la plus récente par plateforme ET toute autre dont un relevé
  -- atteste qu'elle vit encore sur cette fiche. Avant : une seule par
  -- plateforme — la seconde restait en vente après la vente (Louis, Beebs,
  -- 27/09). armer_retrait_job ne double jamais un retrait de la même annonce.
  for v_pub in
    -- (27/09 soir) UNE annonce par plateforme, la plus récente PROUVÉE ;
    -- jamais la plateforme de la vente ; jamais une plateforme où la fiche
    -- porte deux annonces vivantes (deux exemplaires) — armer_retrait_job
    -- le vérifie aussi, pour tous ses appelants.
    select x.id, x.platform from (
      (select distinct on (j.platform) j.id, j.platform
         from public.cross_post_jobs j
        where j.user_id = v_inv.user_id and j.inventaire_id = p_inventaire_id
          and coalesce(j.action, 'publish') in ('publish', 'republish')
          and j.status = 'published'
          and (p_sauf_job is null or j.id <> p_sauf_job)
          and (p_sauf_plateforme is null or j.platform <> p_sauf_plateforme)
          and public.retrait_job_prouve(j.id)
          and public.rattachement_confirme(j.id)   -- (05/11, Nico) jamais un rattachement automatique non confirmé
          and public.fiche_annonces_vivantes(p_inventaire_id, j.platform) < 2
        order by j.platform, coalesce(j.published_at, j.created_at) desc, j.created_at desc)
    ) x
  loop
    v_del := public.armer_retrait_job(v_pub.id, p_chemin, p_delai);
    if v_del is not null then
      v_n := v_n + 1;
      v_pl := v_pl || v_pub.platform;
    end if;
  end loop;
  -- ── (28/10 soir, Nico — Polly Pocket de louis-seller) UN DÉPÔT BEEBS « JAMAIS EN LIGNE » QUI A UN NUMÉRO ──────────
  -- 34206489 était jugé « jamais mis en ligne » (règle des 72 h) puis s'est retrouvé EN LIGNE et achetable, l'article
  -- vendu sur Leboncoin : la boucle ci-dessus ne regarde que les dépôts « published », aucun retrait n'était armé.
  -- Désormais, à la vente, le dépôt Beebs « jamais en ligne » de CETTE fiche qui porte SON numéro (lu au dépôt dans
  -- « Mes annonces », preuve_identifiant_beebs) reçoit aussi son retrait ; si l'annonce est vraiment absente, le
  -- retrait se clôt seul (règle « déjà absente »). Gardes : même compte, même fiche, plateforme ≠ celle de la vente,
  -- vente prouvée sur une AUTRE plateforme (comme armer_retrait_job), aucune annonce Beebs publiée sur la fiche
  -- (deux exemplaires = la règle d'au-dessus), jamais deux retraits de la même annonce. Jamais une autre annonce.
  for v_pub in
    select j.id, j.title, j.listing_url, btrim(j.platform_listing_id) as pl
      from public.cross_post_jobs j
     where j.user_id = v_inv.user_id and j.inventaire_id = p_inventaire_id
       and j.platform = 'beebs' and coalesce(j.action, 'publish') = 'publish'
       and j.status = 'failed'
       and coalesce(j.platform_fields, '{}'::jsonb) ? 'depot_jamais_en_ligne'
       and btrim(coalesce(j.platform_listing_id, '')) ~ '^[0-9]+$'
       and (j.platform_fields #>> '{preuve_identifiant_beebs,methode}') is not null
       and public.rattachement_confirme(j.id)   -- (05/11, Nico) jamais un rattachement automatique non confirmé
       and (p_sauf_job is null or j.id <> p_sauf_job)
       and (p_sauf_plateforme is null or p_sauf_plateforme <> 'beebs')
       and v_inv.statut = 'vendu'
       and exists (
         select 1 from public.ventes v
          where v.user_id = j.user_id and v.inventaire_id = j.inventaire_id
            and lower(coalesce(v.statut, '')) not in ('annule', 'annulée', 'cancelled', 'canceled')
            and lower(coalesce(nullif(v.plateforme_code, ''), nullif(v.plateforme, ''), '')) not in ('', 'beebs'))
       and not exists (
         select 1 from public.cross_post_jobs p
          where p.user_id = j.user_id and p.inventaire_id = j.inventaire_id and p.platform = 'beebs'
            and coalesce(p.action, 'publish') in ('publish', 'republish') and p.status = 'published')
       and not exists (
         select 1 from public.cross_post_jobs d
          where d.user_id = j.user_id and d.inventaire_id = j.inventaire_id and d.platform = 'beebs' and d.action = 'delete'
            and btrim(coalesce(d.platform_listing_id, '')) = btrim(j.platform_listing_id)
            and (d.status in ('pending', 'processing', 'needs_user') or d.created_at >= j.created_at))
  loop
    insert into public.cross_post_jobs
      (user_id, inventaire_id, platform, action, status, photo_option, title, listing_url, platform_listing_id, platform_fields)
    values
      (v_inv.user_id, p_inventaire_id, 'beebs', 'delete', 'pending', 'original', v_pub.title,
       coalesce(nullif(btrim(coalesce(v_pub.listing_url, '')), ''), 'https://www.beebs.app/fr/p/' || v_pub.pl), v_pub.pl,
       jsonb_build_object('arme_par', jsonb_build_object(
         'chemin', p_chemin, 'le', now(), 'depot', v_pub.id,
         'pose_par', 'armer_retraits_copies (dépôt Beebs « jamais en ligne », numéro du dépôt)')));
    v_n := v_n + 1;
    v_pl := v_pl || 'beebs'::text;
  end loop;
  -- Point A : sans dépôt prouvé, ne pas déduire un retrait de la seule fiche.
  if v_n > 0 then
    insert into public.usage_logs (user_id, feature, metadata)
    values (v_inv.user_id, 'retrait_annonces', jsonb_build_object(
      'chemin', p_chemin,
      'plateformes', (select coalesce(jsonb_agg(p order by p), '[]'::jsonb) from unnest(v_pl) as p),
      'n_annonces', v_n,
      'n_articles', 1,
      'article_id', v_inv.id::text));
  end if;
  -- (06/10, Nico) une copie encore en ligne qu'aucune preuve ne lie à CET
  -- article ne reste plus en silence : elle devient la question « Déjà vendu ? »
  -- (inventaire_doublons, motif 'copie_non_prouvee'), une par copie. Jamais un
  -- retrait sans preuve ni sans le oui de la personne ; une erreur ici
  -- n'empêche jamais les retraits prouvés armés ci-dessus.
  begin
    v_q := public.poser_questions_copies_non_prouvees(p_inventaire_id, p_sauf_job, p_sauf_plateforme, 'vente:' || coalesce(p_chemin, ''));
  exception when others then
    raise warning 'armer_retraits_copies (article %) : question copie non posée : %', p_inventaire_id, sqlerrm;
    v_q := 0;
  end;
  return jsonb_build_object('armes', v_n, 'plateformes', to_jsonb(v_pl), 'questions', v_q);
end;
$function$;

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
       ORDER BY a.vu_le DESC NULLS LAST LIMIT 1) ap ON true
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
  RETURN n;
END;
$function$;

CREATE OR REPLACE FUNCTION public.releve_poser_question(p_user uuid, p_existante bigint, p_nouvelle bigint, p_motif text, p_preuves jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- (2026-09-27, audit synchro) La question « Est-ce le même article ? » entre
-- une fiche existante (gardée si « oui ») et la fiche que le relevé vient de
-- créer. Jamais un rattachement : l'écran Doublons la pose, la personne
-- tranche (inventaire_doublon_decider). Une paire déjà tranchée (refusée,
-- défaite, fusionnée) n'est jamais reposée : l'index unique de la paire le
-- garantit (ON CONFLICT DO NOTHING).
DECLARE
  v_t1 text; v_t2 text;
BEGIN
  IF p_user IS NULL OR p_existante IS NULL OR p_nouvelle IS NULL OR p_existante = p_nouvelle THEN RETURN false; END IF;
  IF NOT EXISTS (SELECT 1 FROM inventaire WHERE id = p_existante AND user_id = p_user AND fusionne_dans IS NULL) THEN RETURN false; END IF;
  IF NOT EXISTS (SELECT 1 FROM inventaire WHERE id = p_nouvelle AND user_id = p_user AND fusionne_dans IS NULL) THEN RETURN false; END IF;
  -- ⛔ (05/11, Nico — assopmfrance, écussons ronds sur fond blanc : Albator ≠ UJ2 à 9, un écusson sans rapport à 8)
  -- « Même article ? » n'est JAMAIS posée sur une photo seulement PROCHE quand un des deux titres est en série chez le
  -- compte (titre_en_serie : ≥ 3 annonces d'une plateforme, ou 3 fiches Vinted, au même titre normalisé) : la photo
  -- proche n'en départage pas les pièces, le titre non plus — aucune autre preuve. L'article reste un article à part
  -- (deux exemplaires). Les photos quasi identiques, multiples, identiques : inchangées. Trace : usage_logs (1 par paire et par jour).
  IF p_motif = 'photo_proche' THEN
    SELECT titre INTO v_t1 FROM inventaire WHERE id = p_existante;
    SELECT titre INTO v_t2 FROM inventaire WHERE id = p_nouvelle;
    IF titre_en_serie(p_user, v_t1) OR titre_en_serie(p_user, v_t2) THEN
      IF NOT EXISTS (SELECT 1 FROM usage_logs l WHERE l.user_id = p_user AND l.feature = 'question_photo_proche_ecartee'
                        AND l.created_at > now() - interval '1 day'
                        AND l.metadata ->> 'paire' = least(p_existante, p_nouvelle)::text || '-' || greatest(p_existante, p_nouvelle)::text) THEN
        INSERT INTO usage_logs (user_id, feature, metadata)
        VALUES (p_user, 'question_photo_proche_ecartee', jsonb_build_object(
          'paire', least(p_existante, p_nouvelle)::text || '-' || greatest(p_existante, p_nouvelle)::text,
          'existante', p_existante::text, 'nouvelle', p_nouvelle::text, 'motif', p_motif, 'raison', 'titre_en_serie',
          'photo', p_preuves -> 'photo', 'titres', jsonb_build_array(v_t1, v_t2)));
      END IF;
      RETURN false;
    END IF;
  END IF;
  INSERT INTO inventaire_doublons (user_id, garde, absorbe, niveau, statut, motif, preuves, source)
  VALUES (p_user, p_existante, p_nouvelle, 'probable', 'proposee', COALESCE(p_motif, 'releve'), COALESCE(p_preuves, '{}'::jsonb), 'releve')
  ON CONFLICT DO NOTHING;
  RETURN FOUND;
END;
$function$;

COMMIT;
