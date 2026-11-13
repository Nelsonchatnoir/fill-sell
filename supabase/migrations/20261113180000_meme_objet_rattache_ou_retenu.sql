-- ═══════════════════════════════════════════════════════════════════════════
-- 20261113180000 — LE MÊME OBJET : RATTACHÉ, OU LA QUESTION HORS DU STOCK ; JAMAIS PUBLIÉ LÀ OÙ IL EST DÉJÀ EN LIGNE
-- (13/11/2026, lot du 13/11, agent N6a — PRÉPARÉE, NON APPLIQUÉE : feu vert de Nico)
-- ═══════════════════════════════════════════════════════════════════════════
-- LE CAS (compte bf85d176, relu en prod le 13/11, lecture seule) : le relevé du dressing Vinted du 12/11 à 15:33 écrit
-- la fiche 1794494010078017 (annonce Vinted 10478358207) pour un clavier Nor-Tec déjà au stock — la fiche 1790174130756,
-- import Leboncoin du 23/09, porte Leboncoin 3272015849 et eBay 407214160146, rattachées par le moteur. Trois photos
-- identiques. La passe de 15:40:54 décide « fusionner » × 2 ; la base saute (« fusionner_article_modifie » × 2 : l'import
-- n'est pas « intact » parce qu'il porte DEUX annonces), pose la question 892d1bf0 et laisse la fiche du dressing AU
-- STOCK. 15:53 : « Publier en lot » l'envoie sur Leboncoin (3307984312) ; Leboncoin refuse le doublon (relevés de 21:16
-- et 23:39). Le même objet est deux fois au stock (Vinted d'un côté, Leboncoin + eBay de l'autre) : vente double possible.
-- Mesuré le 13/11 (lecture seule) : depuis le 01/10, 145 questions « article_modifie » de ce type (28 comptes encore
-- ouvertes : 102) ; quand la personne a répondu, c'était le même article 42 fois sur 43 ; 8 paires ont déjà une copie
-- sur la plateforme de l'autre (bf85d176 1, 53efea05 2, fc37c75e 5).
--
-- LA RÈGLE (tous comptes, toutes plateformes) :
--   1. rapprochement_v3_appliquer, « fusionner » vers une fiche du dressing nouvelle : un import intact SAUF le nombre de
--      ses annonces la rejoint quand toutes ses annonces vivantes sont dans le groupe fort de la passe, qu'aucune n'a été
--      rattachée par la personne et qu'aucune plateforme n'est des deux côtés (rapprochement_v3_import_rattachable) ;
--   2. sinon (l'import est vraiment touché) : la question, comme avant, ET la fiche du dressing NÉE de ce relevé, que
--      personne n'a touchée, sort du stock le temps de la réponse (rapprochement_v3_vinted_a_verifier) — le circuit des
--      articles à vérifier ; la même sortie pour « fiche à la main face à une fiche Vinted » (règle du 08/10, morte depuis
--      que le dressing pose une tâche Vinted sur chaque fiche : rapprochement_v3_marquer la refusait toujours) ;
--   3. spend_coins_and_publish : une publication vers une plateforme où l'AUTRE fiche d'une question « Est-ce le même
--      article ? » OUVERTE (photo identique) est en ligne ou en file est retenue avant tout débit
--      (publication_meme_objet_en_ligne) — jamais pour deux exemplaires (« Non » répondu, quantité > 1, ou déjà deux
--      annonces d'une même plateforme), jamais sur un titre ni un doute à plusieurs candidats (règle du 09/10, Louis).
-- Rien d'autre ne change : les deux corps sont ceux de PROD relus le 13/11 (garde md5 ci-dessous), les ajouts entre
-- marqueurs ⟦13/11 N6a … ⟧, aucune ligne de prod modifiée ni retirée (verrou meme-objet-import). Aucune donnée réécrite à
-- l'application : la règle vaut pour les passes et les publications À VENIR (rattrapage du stock : script séparé,
-- scripts/reparations/20261113_meme_objet_import_groupe.sql, sur feu vert).
-- Banc (Postgres jetable) : node scripts/essais/20261113180000_banc.mjs via npm run selftest:meme-objet-import.
-- Inverse : supabase/rollbacks/20261113180000_meme_objet_rattache_ou_retenu_INVERSE.sql (les corps de prod à l'octet).
-- Appliquer (feu vert) : npx supabase db query --linked -f supabase/migrations/20261113180000_meme_objet_rattache_ou_retenu.sql
--                        npx supabase migration repair --linked --status applied 20261113180000
BEGIN;
SET LOCAL statement_timeout = '60s';
SET LOCAL lock_timeout = '5s';

-- Les corps EN PROD relus le 13/11 (md5 de pg_get_functiondef) : on s'arrête si l'un a changé depuis.
DO $verif$
DECLARE r record;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('public.rapprochement_v3_appliquer(uuid,jsonb,text,boolean)', '803a52270730966e7e641a03c6c9164b'),
    ('public.spend_coins_and_publish(text,jsonb)', 'f2b2a9132d1853ffe7ff713afd51b4eb')) AS t(f, m)
  LOOP
    IF md5(pg_get_functiondef(r.f::regprocedure)) <> r.m THEN
      RAISE EXCEPTION '% a changé en prod depuis sa lecture du 13/11 (md5 attendu %) : relire, reconstruire, jamais forcer', r.f, r.m;
    END IF;
  END LOOP;
END $verif$;

-- ── 1. L'IMPORT RATTACHABLE : intact (les critères de rapprochement_v3_fiche_intacte), SAUF le nombre de ses annonces —
-- au moins une annonce vivante, TOUTES dans le groupe fort de la passe (p_groupe : « A<id> »), aucune posée par la
-- personne (rattachement manuel, ou une décision « utilisateur » sur l'annonce), aucune par un dépôt FillSell (« job » :
-- l'import aurait alors une tâche hors relevé, déjà refusée ci-dessous). Jamais un titre : le groupe fort de la passe,
-- c'est la photo ET le titre sans conflit ni concurrent (moteur v3).
CREATE OR REPLACE FUNCTION public.rapprochement_v3_import_rattachable(p_user uuid, p_import bigint, p_groupe jsonb)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT jsonb_typeof(p_groupe) = 'array' AND EXISTS (
    SELECT 1 FROM inventaire i
     WHERE i.id = p_import AND i.user_id = p_user AND i.origine LIKE 'releve\_%'
       AND i.statut = 'stock' AND i.fusionne_dans IS NULL
       AND COALESCE(i.quantite, 1) <= 1
       AND i.prix_achat IS NULL AND NOT COALESCE(i.prix_achat_inconnu, false)
       AND i.prix_vente_change_par IS DISTINCT FROM 'app' AND i.poids_change_par IS DISTINCT FROM 'app'
       AND NOT EXISTS (SELECT 1 FROM ventes v WHERE v.inventaire_id = i.id)
       AND NOT EXISTS (SELECT 1 FROM cross_post_jobs j WHERE j.inventaire_id = i.id
                         AND (COALESCE(j.platform_fields ->> 'source', '') <> 'releve'
                              OR j.status IN ('pending', 'processing', 'needs_user')))
       AND NOT EXISTS (SELECT 1 FROM fiches_annonce fa WHERE fa.inventaire_id = i.id)
       AND NOT EXISTS (SELECT 1 FROM push_ventes pv WHERE pv.inventaire_id = i.id)
       AND NOT EXISTS (SELECT 1 FROM remises_en_vente rv WHERE rv.inventaire_id = i.id)
       AND NOT EXISTS (SELECT 1 FROM jsonb_each(CASE WHEN jsonb_typeof(i.attributs) = 'object' THEN i.attributs ELSE '{}'::jsonb END) e
                        WHERE jsonb_typeof(e.value) = 'object' AND e.value ->> 'source' = 'manuel')
       AND EXISTS (SELECT 1 FROM annonces_plateforme x WHERE x.inventaire_id = i.id AND x.disparu_le IS NULL)
       AND NOT EXISTS (SELECT 1 FROM annonces_plateforme x
                        WHERE x.inventaire_id = i.id AND x.disparu_le IS NULL
                          AND (NOT (p_groupe ? ('A' || x.id::text))
                               OR COALESCE(x.source_rapprochement, '') IN ('manuel', 'job')
                               OR EXISTS (SELECT 1 FROM rapprochements r WHERE r.annonce_id = x.id AND r.par = 'utilisateur'))));
$function$;
REVOKE ALL ON FUNCTION public.rapprochement_v3_import_rattachable(uuid, bigint, jsonb) FROM PUBLIC, anon, authenticated;

-- ── 2. LA FICHE DU DRESSING NOUVELLE, QUE PERSONNE N'A TOUCHÉE : née depuis la dernière passe du compte, en stock, pas
-- déjà à vérifier, quantité 1, rien de la personne (prix d'achat, prix ou poids changés dans l'app, vente, fiche
-- d'annonce, notification, remise en vente, attribut saisi), AUCUNE annonce relevée ailleurs, et pour seules tâches le
-- miroir de SON annonce Vinted posé par le dressing (publiée, numéro = vinted_item_id) — ce que rapprochement_v3_fiche_intacte
-- refuse toujours (sa tâche Vinted n'a pas de source « releve »).
CREATE OR REPLACE FUNCTION public.rapprochement_v3_vinted_nouvelle_intacte(p_user uuid, p_fiche bigint)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM inventaire i
     WHERE i.id = p_fiche AND i.user_id = p_user AND i.origine = 'vinted_sync'
       AND i.statut = 'stock' AND i.fusionne_dans IS NULL AND i.a_verifier IS NULL
       AND i.created_at > rapprochement_v3_vinted_depuis(p_user)
       AND COALESCE(i.quantite, 1) <= 1
       AND i.prix_achat IS NULL AND NOT COALESCE(i.prix_achat_inconnu, false)
       AND i.prix_vente_change_par IS DISTINCT FROM 'app' AND i.poids_change_par IS DISTINCT FROM 'app'
       AND NOT EXISTS (SELECT 1 FROM ventes v WHERE v.inventaire_id = i.id)
       AND NOT EXISTS (SELECT 1 FROM cross_post_jobs j WHERE j.inventaire_id = i.id
                         AND NOT (j.platform = 'vinted' AND j.status = 'published' AND COALESCE(j.action, 'publish') = 'publish'
                                  AND btrim(COALESCE(j.platform_listing_id, '')) = btrim(COALESCE(i.vinted_item_id, ''))))
       AND NOT EXISTS (SELECT 1 FROM fiches_annonce fa WHERE fa.inventaire_id = i.id)
       AND NOT EXISTS (SELECT 1 FROM push_ventes pv WHERE pv.inventaire_id = i.id)
       AND NOT EXISTS (SELECT 1 FROM remises_en_vente rv WHERE rv.inventaire_id = i.id)
       AND NOT EXISTS (SELECT 1 FROM jsonb_each(CASE WHEN jsonb_typeof(i.attributs) = 'object' THEN i.attributs ELSE '{}'::jsonb END) e
                        WHERE jsonb_typeof(e.value) = 'object' AND e.value ->> 'source' = 'manuel')
       AND NOT EXISTS (SELECT 1 FROM annonces_plateforme x WHERE x.inventaire_id = i.id AND x.disparu_le IS NULL));
$function$;
REVOKE ALL ON FUNCTION public.rapprochement_v3_vinted_nouvelle_intacte(uuid, bigint) FROM PUBLIC, anon, authenticated;

-- ── 3. … ELLE SORT DU STOCK LE TEMPS DE LA RÉPONSE : le même marqueur que rapprochement_v3_marquer (source
-- « rapprochement_v3 » : une réparation peut la rendre au stock ; une réponse à la question l'y rend, déclencheur
-- trg_inventaire_doublons_a_verifier). Rend vrai si la fiche a été marquée.
CREATE OR REPLACE FUNCTION public.rapprochement_v3_vinted_a_verifier(p_user uuid, p_fiche bigint, p_candidat bigint, p_annonce uuid, p_motif text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF p_user IS NULL OR p_fiche IS NULL OR p_candidat IS NULL OR p_fiche = p_candidat THEN RETURN false; END IF;
  IF NOT rapprochement_v3_vinted_nouvelle_intacte(p_user, p_fiche) THEN RETURN false; END IF;
  UPDATE inventaire
     SET a_verifier = jsonb_build_object('depuis', now(), 'source', 'rapprochement_v3', 'motif', COALESCE(NULLIF(p_motif, ''), 'photo_identique'),
                                         'candidat', p_candidat, 'annonce_id', p_annonce, 'platform', 'vinted', 'regle', 'vinted_nouvelle_1311')
   WHERE id = p_fiche AND user_id = p_user AND statut = 'stock' AND a_verifier IS NULL;
  RETURN FOUND;
END;
$function$;
REVOKE ALL ON FUNCTION public.rapprochement_v3_vinted_a_verifier(uuid, bigint, bigint, uuid, text) FROM PUBLIC, anon, authenticated;

-- ── 4. UNE FICHE EN LIGNE (OU EN FILE) SUR UNE PLATEFORME : une annonce relevée vivante ; une tâche de dépôt en file, en
-- cours, en attente, ou publiée sans retrait fait depuis ni annonce disparue (hors Vinted) ; Vinted : l'identité Vinted
-- vivante de la fiche (ni disparue, ni vendue, ni fermée). Mêmes lectures que la garde already_published de la fiche.
CREATE OR REPLACE FUNCTION public.publication_fiche_en_ligne(p_user uuid, p_fiche bigint, p_platform text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT
    EXISTS (SELECT 1 FROM annonces_plateforme a
             WHERE a.inventaire_id = p_fiche AND a.user_id = p_user AND a.platform = p_platform
               AND a.disparu_le IS NULL AND a.retiree_le IS NULL AND a.ignoree_le IS NULL AND a.fiche_supprimee_le IS NULL
               AND COALESCE(a.statut_plateforme, 'en_ligne') = 'en_ligne')
    OR EXISTS (SELECT 1 FROM cross_post_jobs c
                WHERE c.inventaire_id = p_fiche AND c.user_id = p_user AND c.platform = p_platform
                  AND COALESCE(c.action, 'publish') IN ('publish', 'republish')
                  AND (c.status IN ('pending', 'processing', 'needs_user')
                       OR (c.status = 'published' AND p_platform <> 'vinted'
                           AND NOT EXISTS (SELECT 1 FROM cross_post_jobs dd
                                            WHERE dd.inventaire_id = c.inventaire_id AND dd.user_id = p_user AND dd.platform = c.platform
                                              AND dd.action = 'delete' AND dd.status = 'deleted'
                                              AND dd.created_at > COALESCE(c.published_at, c.created_at))
                           AND NOT EXISTS (SELECT 1 FROM annonces_plateforme x
                                            WHERE x.job_id = c.id AND (x.disparu_le IS NOT NULL OR x.retiree_le IS NOT NULL)))))
    OR (p_platform = 'vinted' AND EXISTS (SELECT 1 FROM inventaire i
                                            WHERE i.id = p_fiche AND i.user_id = p_user
                                              AND NULLIF(btrim(COALESCE(i.vinted_item_id, '')), '') IS NOT NULL AND i.disparu_le IS NULL
                                              AND COALESCE(i.vinted_status, 'active') NOT IN ('sold', 'closed', 'deleted')));
$function$;
REVOKE ALL ON FUNCTION public.publication_fiche_en_ligne(uuid, bigint, text) FROM PUBLIC, anon, authenticated;

-- ── 5. LE MÊME OBJET DÉJÀ EN LIGNE : la fiche p_fiche (en stock, quantité 1) a une question « Est-ce le même article ? »
-- OUVERTE, posée sur une photo identique (motif photo_identique : la passe, ou deux fiches à la même photo), avec une
-- autre fiche du compte (en stock, quantité 1) en ligne ou en file sur p_platform — et les deux ne sont jamais déjà en
-- ligne ensemble sur une même plateforme (deux annonces d'une plateforme = deux exemplaires). Rend { question, fiche,
-- titre, platform, motif, a_verifier } ou NULL — a_verifier : l'une des deux est « à vérifier » (la question est alors
-- dans À régler › Annonces à vérifier ; sinon dans la carte « Est-ce le même article ? » de Stock › Synchroniser).
-- Lectures par index (questions ouvertes du compte, tâches et annonces par fiche).
CREATE OR REPLACE FUNCTION public.publication_meme_objet_en_ligne(p_user uuid, p_fiche bigint, p_platform text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT jsonb_build_object('question', q.id, 'fiche', y.id::text, 'titre', y.titre, 'platform', p_platform, 'motif', q.motif,
                            'a_verifier', (x.a_verifier IS NOT NULL OR y.a_verifier IS NOT NULL))
    FROM inventaire x
    JOIN inventaire_doublons q ON q.user_id = p_user AND q.statut = 'proposee' AND q.motif = 'photo_identique'
                              AND (q.garde = x.id OR q.absorbe = x.id)
    JOIN inventaire y ON y.id = CASE WHEN q.garde = x.id THEN q.absorbe ELSE q.garde END
   WHERE x.id = p_fiche AND x.user_id = p_user AND x.fusionne_dans IS NULL AND x.statut = 'stock' AND COALESCE(x.quantite, 1) <= 1
     AND p_platform IS NOT NULL
     AND y.user_id = p_user AND y.id <> x.id AND y.fusionne_dans IS NULL AND y.statut = 'stock' AND COALESCE(y.quantite, 1) <= 1
     AND publication_fiche_en_ligne(p_user, y.id, p_platform)
     AND NOT EXISTS (SELECT 1 FROM unnest(ARRAY['vinted', 'leboncoin', 'ebay', 'beebs', 'depop', 'opla']) AS pf
                      WHERE publication_fiche_en_ligne(p_user, x.id, pf) AND publication_fiche_en_ligne(p_user, y.id, pf))
   ORDER BY q.created_at, q.id
   LIMIT 1;
$function$;
REVOKE ALL ON FUNCTION public.publication_meme_objet_en_ligne(uuid, bigint, text) FROM PUBLIC, anon, authenticated;

-- ── rapprochement_v3_appliquer : le corps de PROD du 13/11, plus les trois blocs marqués ⟦13/11 N6a … ⟧ ──
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
        -- ⟦13/11 N6a — UN IMPORT AUX ANNONCES TOUTES DANS LE GROUPE FORT REJOINT LA FICHE DU DRESSING (cas bf85d176)
        -- Le 12/11 à 15:40, la passe a vu UN objet (fiche du dressing 1794494010078017, Leboncoin 3272015849 et eBay
        -- 407214160146 de l'import 1790174130756 : trois photos identiques). rapprochement_v3_fiche_intacte tient pour
        -- « touché » un import qui porte plus d'UNE annonce — ici deux, posées toutes deux par le moteur, rien de la
        -- personne — : la fusion sautait (« fusionner_article_modifie »), la fiche du dressing restait au stock à côté de
        -- l'import, puis partait sur Leboncoin où le même objet était en ligne. Désormais, un import intact SAUF le nombre
        -- de ses annonces rejoint la fiche du dressing nouvelle quand TOUTES ses annonces vivantes sont dans le groupe fort
        -- de la passe (preuve.groupe), qu'aucune n'a été rattachée par la personne (rapprochement_v3_import_rattachable),
        -- et qu'aucune plateforme n'est des deux côtés (deux annonces d'une plateforme = deux exemplaires). Même circuit,
        -- même trace que la fusion d'avant ; un refus du circuit retombe sur la règle d'avant (la question, ci-dessous).
        IF d ->> 'portee' = 'vinted_nouvelle' AND f.origine LIKE 'releve\_%' AND g.statut IS DISTINCT FROM 'vendu'
           AND NOT rapprochement_v3_fiche_intacte(f.id)
           AND rapprochement_v3_import_rattachable(p_user, f.id, d #> '{preuve,groupe}')
           AND NOT EXISTS (SELECT 1 FROM annonces_plateforme x JOIN annonces_plateforme y ON y.platform = x.platform
                            WHERE x.inventaire_id = f.id AND y.inventaire_id = g.id AND x.disparu_le IS NULL AND y.disparu_le IS NULL) THEN
          v_r := inventaire_fusionner_pour(p_user, g.id, f.id, v_par);
          IF COALESCE((v_r ->> 'ok')::boolean, false) THEN
            UPDATE inventaire_doublons SET statut = 'fusionnee', decide_le = now(), decide_par = 'rapprochement_v3', fusion_id = (v_r ->> 'fusion_id')::uuid
             WHERE user_id = p_user AND statut = 'proposee' AND least(garde, absorbe) = least(g.id, f.id) AND greatest(garde, absorbe) = greatest(g.id, f.id);
            UPDATE inventaire_doublons SET statut = 'caduque', decide_le = now(), decide_par = 'rapprochement_v3'
             WHERE user_id = p_user AND statut = 'proposee' AND (garde = f.id OR absorbe = f.id) AND motif IS DISTINCT FROM 'copie_non_prouvee';
            INSERT INTO rapprochements (user_id, annonce_id, inventaire_id, decision, par, score, detail)
            VALUES (p_user, NULLIF(d ->> 'annonce', '')::uuid, g.id, 'attache', 'auto', 1,
                    COALESCE(d -> 'preuve', '{}'::jsonb) || jsonb_build_object('motif', 'photo_identique', 'regle', 'rapprochement_v3', 'fusion', v_r ->> 'fusion_id', 'absorbe', f.id, 'mode', p_mode,
                                                                            'portee', d ->> 'portee', 'import_groupe', true));
            n_faits := n_faits || jsonb_build_object('fusionner', COALESCE((n_faits ->> 'fusionner')::int, 0) + 1,
                                                     'fusionner_import_groupe', COALESCE((n_faits ->> 'fusionner_import_groupe')::int, 0) + 1);
            CONTINUE;
          END IF;
          n_sautes := n_sautes || jsonb_build_object('fusionner_import_groupe_refuse', COALESCE((n_sautes ->> 'fusionner_import_groupe_refuse')::int, 0) + 1);
        END IF;
        -- 13/11 N6a⟧
        IF NOT (f.origine LIKE 'releve\_%') OR NOT rapprochement_v3_fiche_intacte(f.id) OR g.statut = 'vendu' THEN
          -- Un article que la personne a touché : la question, pas la fusion.
          v_posee := releve_poser_question(p_user, g.id, f.id, 'photo_identique',
                       COALESCE(d -> 'preuve', '{}'::jsonb) || jsonb_build_object('avant_stock', false, 'regle', 'rapprochement_v3', 'article_modifie', true));
          -- ⟦13/11 N6a — UN DOUTE N'ENTRE JAMAIS AU STOCK (règle du 07/10) : la fiche du dressing NÉE de ce relevé, que
          -- personne n'a touchée, sort du stock le temps de la réponse (circuit des articles à vérifier ; la réponse l'y
          -- rend : trg_inventaire_doublons_a_verifier). Jamais la fiche de la personne. Avant : la question était posée mais
          -- la fiche du dressing restait au stock, publiable (bf85d176, 12/11 15:53 : publiée sur Leboncoin).
          IF d ->> 'portee' = 'vinted_nouvelle'
             AND (v_posee OR EXISTS (SELECT 1 FROM inventaire_doublons q WHERE q.user_id = p_user AND q.statut = 'proposee'
                                       AND least(q.garde, q.absorbe) = least(g.id, f.id) AND greatest(q.garde, q.absorbe) = greatest(g.id, f.id)))
             AND rapprochement_v3_vinted_a_verifier(p_user, g.id, f.id, NULLIF(d ->> 'annonce', '')::uuid, 'photo_identique') THEN
            n_sautes := n_sautes || jsonb_build_object('fusionner_vinted_a_verifier', COALESCE((n_sautes ->> 'fusionner_vinted_a_verifier')::int, 0) + 1);
          END IF;
          -- 13/11 N6a⟧
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
          -- ⟦13/11 N6a — la fiche Vinted hors du stock (règle du 08/10) : rapprochement_v3_marquer exige une fiche « intacte »,
          -- ce que n'est JAMAIS une fiche du dressing qui porte sa tâche Vinted (platform_fields sans source « releve ») —
          -- aucune fiche Vinted n'a été marquée par cette règle depuis le 15/10. La fiche du dressing NÉE depuis la dernière
          -- passe, que personne n'a touchée, sort du stock ; une fiche plus ancienne, jamais (rapprochement_v3_vinted_a_verifier).
          PERFORM rapprochement_v3_vinted_a_verifier(p_user, v_fb, v_fa, NULL::uuid, COALESCE(NULLIF(d ->> 'motif', ''), 'photo_identique'));
          -- 13/11 N6a⟧
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
$function$
;

-- ── spend_coins_and_publish : le corps de PROD du 13/11, plus les deux blocs marqués ⟦13/11 N6a … ⟧ ──
CREATE OR REPLACE FUNCTION public.spend_coins_and_publish(p_photo_option text, p_jobs jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user          uuid := auth.uid();
  v_price         integer;
  v_price_photo   integer;
  v_price_unit    integer;
  v_price_pub     integer;
  v_photos_billed boolean := true;
  v_wallet        coin_wallets%ROWTYPE;
  v_total         integer;
  v_from_inc      integer := 0;
  v_from_pur      integer := 0;
  v_photo_inc     integer;
  v_pub_inc       integer;
  v_pub_pur       integer;
  v_job_count     integer;
  v_tier          text;
  v_conflicts     jsonb;
  v_ext_seen      timestamptz;
  v_lang          text;
  v_res_id        uuid := NULL;
  v_ebay_api_seul boolean := false;
  v_en_pause      jsonb := NULL;
  v_conflits_relie jsonb;
  v_pub_plafond   integer;
  v_pub_faites    integer;
  v_pub_remise    timestamptz;
  v_garde         jsonb;
  -- ⟦13/11 N6a
  v_meme_objet    jsonb;
  -- 13/11 N6a⟧
BEGIN
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'unauthorized');
  END IF;
  IF p_photo_option NOT IN ('original','ia_light','ia_advanced') THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'invalid_photo_option');
  END IF;
  v_job_count := COALESCE(jsonb_array_length(p_jobs), 0);
  IF v_job_count < 1 OR v_job_count > 5 THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'invalid_jobs');
  END IF;

  BEGIN
    SELECT jsonb_agg(DISTINCT j->>'platform') INTO v_en_pause
    FROM jsonb_array_elements(p_jobs) AS j
    WHERE EXISTS (SELECT 1 FROM public.platform_health h WHERE h.platform = j->>'platform' AND h.paused = true);
  EXCEPTION WHEN OTHERS THEN
    v_en_pause := NULL;
  END;
  -- (25/10, décision de Nico : « Aucun job ne doit être créé. ») LEBONCOIN N'ACCEPTE QUE LES ADRESSES EN FRANCE :
  -- une publication Leboncoin d'un compte dont l'adresse de remise est hors de France n'entre JAMAIS en file, quelle
  -- que soit la version de l'app (Marta, 25/10 : 52 jobs créés après l'OTA 2.9.115 par une app restée sur l'ancien
  -- paquet). Même verdict que _shared/lbc-adresse-france.js (lbc_adresse_hors_france) ; même réponse qu'une plateforme
  -- en pause, que toutes les versions de l'app savent dire — rien n'est créé, rien n'est décompté.
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_jobs) AS j WHERE j->>'platform' = 'leboncoin')
     AND public.lbc_adresse_hors_france(v_user) THEN
    RETURN jsonb_build_object(
      'allowed', false, 'reason', 'platform_paused', 'motif', 'lbc_hors_france', 'platforms', '["leboncoin"]'::jsonb,
      'messages', jsonb_build_object('leboncoin', jsonb_build_object('fr', 'Leboncoin n''accepte que les adresses en France. Ton adresse de remise est hors de France : FillSell ne publie donc pas sur Leboncoin pour ton compte. Rien n''a été publié, et tes autres plateformes continuent normalement.', 'en', 'Leboncoin only accepts addresses in France. Your pickup address is outside France, so FillSell doesn''t publish on Leboncoin for your account. Nothing was published, and your other platforms carry on as usual.'))
    );
  END IF;

  IF v_en_pause IS NOT NULL THEN
    RETURN jsonb_build_object(
      'allowed', false, 'reason', 'platform_paused', 'platforms', v_en_pause,
      'messages', (SELECT COALESCE(jsonb_object_agg(h.platform, jsonb_build_object('fr', h.message_fr, 'en', h.message_en)), '{}'::jsonb)
                   FROM public.platform_health h WHERE h.paused = true AND v_en_pause ? h.platform)
    );
  END IF;

  SELECT NOT EXISTS (
           SELECT 1 FROM jsonb_array_elements(p_jobs) AS j WHERE j->>'platform' IS DISTINCT FROM 'ebay'
         )
         AND COALESCE(p.ebay_voie_api, false)
         AND a.user_id IS NOT NULL
         AND a.revoked_at IS NULL
         AND a.fulfillment_policy_id IS NOT NULL
         AND a.payment_policy_id IS NOT NULL
         AND a.return_policy_id IS NOT NULL
         AND (a.seller_state->>'bloque_par_etat_ebay') = 'false'
    INTO v_ebay_api_seul
  FROM profiles p
  LEFT JOIN ebay_accounts a ON a.user_id = p.id
  WHERE p.id = v_user;
  v_ebay_api_seul := COALESCE(v_ebay_api_seul, false);

  SELECT extension_last_seen_at, lang
    INTO v_ext_seen, v_lang
  FROM profiles WHERE id = v_user;

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_jobs) AS j
    WHERE NULLIF(j->>'inventaire_id','') IS NULL
  ) THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'missing_inventaire_id');
  END IF;

  SELECT jsonb_agg(DISTINCT j->>'platform') INTO v_conflicts
  FROM jsonb_array_elements(p_jobs) AS j
  WHERE NULLIF(j->>'inventaire_id','') IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM cross_post_jobs c
      WHERE c.user_id = v_user
        AND c.inventaire_id = NULLIF(j->>'inventaire_id','')::bigint
        AND c.platform = j->>'platform'
        AND COALESCE(c.action, 'publish') <> 'delete'
        AND (
          c.status IN ('pending', 'processing', 'needs_user')
          OR (
            c.status = 'published'
            AND NOT EXISTS (
              SELECT 1 FROM cross_post_jobs d
              WHERE d.user_id = v_user
                AND d.inventaire_id = c.inventaire_id
                AND d.platform = c.platform
                AND d.action = 'delete'
                AND d.status = 'deleted'
                AND (
                  CASE
                    WHEN annonce_id_de_job(d.platform_listing_id, d.listing_url) IS NOT NULL
                     AND annonce_id_de_job(c.platform_listing_id, c.listing_url) IS NOT NULL
                    THEN annonce_id_de_job(d.platform_listing_id, d.listing_url) = annonce_id_de_job(c.platform_listing_id, c.listing_url)
                    ELSE d.created_at > COALESCE(c.published_at, c.created_at)
                  END
                )
            )
          )
        )
    );
  IF v_conflicts IS NOT NULL THEN
    RETURN jsonb_build_object(
      'allowed', false, 'reason', 'already_published',
      'platforms', v_conflicts
    );
  END IF;

  -- (20/10, Louis) COMPTES RELIÉS SUR UNE BOUTIQUE PARTAGÉE : la fiche jumelle (fiches_liees_comptes)
  -- est déjà en ligne — ou en file — sur cette plateforme, dans la MÊME boutique (un relevé l'a prouvé :
  -- jumelle_occupe_plateformes). Republier ici ferait le doublon (Leboncoin le refuse, ou le laisse passer) :
  -- refus already_published, plateforme par plateforme, AVANT tout débit. 'compte_relie' nomme celles-là.
  -- Sans fiche jumelle (tous les autres comptes) : rien de lu au-delà de l'index fiches_liees_comptes.
  SELECT jsonb_agg(DISTINCT j->>'platform') INTO v_conflits_relie
  FROM jsonb_array_elements(p_jobs) AS j
  WHERE NULLIF(j->>'inventaire_id','') IS NOT NULL
    AND EXISTS (SELECT 1 FROM fiches_liees_comptes f
                 WHERE f.fiche_a = NULLIF(j->>'inventaire_id','')::bigint OR f.fiche_b = NULLIF(j->>'inventaire_id','')::bigint)
    AND EXISTS (SELECT 1 FROM jumelle_occupe_plateformes(v_user, NULLIF(j->>'inventaire_id','')::bigint) o
                 WHERE o.platform = j->>'platform');
  IF v_conflits_relie IS NOT NULL THEN
    RETURN jsonb_build_object(
      'allowed', false, 'reason', 'already_published',
      'platforms', v_conflits_relie, 'compte_relie', v_conflits_relie
    );
  END IF;

  -- ⟦13/11 N6a — LE MÊME OBJET DÉJÀ EN LIGNE PAR UNE AUTRE FICHE, EN ATTENTE DE « EST-CE LE MÊME ARTICLE ? » (bf85d176)
  -- Le 12/11 à 15:53, la fiche du dressing 1794494010078017 est partie sur Leboncoin alors que la question « Est-ce le
  -- même article ? » (photo identique, posée à 15:40) la liait à 1790174130756, en ligne sur Leboncoin (3272015849) :
  -- Leboncoin a refusé le doublon ; s'il l'avait accepté, le « Oui » n'aurait plus pu réunir les deux fiches (deux
  -- annonces d'une plateforme) et le même objet restait vendable deux fois. Retenue, plateforme par plateforme, AVANT tout
  -- débit, tant que la question est OUVERTE : jamais pour deux exemplaires (« Non » répondu, quantité > 1, ou les deux
  -- fiches déjà en ligne sur une même plateforme), jamais sur un titre ni un doute à plusieurs candidats (Louis, 09/10 :
  -- seule une question « photo_identique » retient), jamais une question introuvable (les deux fiches au stock : la
  -- carte « Est-ce le même article ? » de Stock › Synchroniser ; une fiche à vérifier : À régler › Annonces à vérifier —
  -- le message dit laquelle). « Non, deux exemplaires » la lève pour toujours ; « Oui » réunit les deux fiches.
  -- Réponse already_published (toutes les versions de l'app sortent la plateforme et publient les autres) + meme_objet.
  SELECT jsonb_object_agg(j->>'platform', x.m) INTO v_meme_objet
  FROM jsonb_array_elements(p_jobs) AS j
  CROSS JOIN LATERAL (SELECT public.publication_meme_objet_en_ligne(v_user, NULLIF(j->>'inventaire_id','')::bigint, j->>'platform') AS m) x
  WHERE NULLIF(j->>'inventaire_id','') IS NOT NULL AND x.m IS NOT NULL;
  IF v_meme_objet IS NOT NULL THEN
    RETURN jsonb_build_object(
      'allowed', false, 'reason', 'already_published',
      'platforms', (SELECT jsonb_agg(k ORDER BY k) FROM jsonb_object_keys(v_meme_objet) AS k),
      'meme_objet', v_meme_objet,
      'message', (SELECT string_agg(format('%s : ta fiche « %s » y est peut-être déjà en ligne (mêmes photos). Réponds d''abord à « Est-ce le même article ? » (%s) : si c''est le même, rien n''est publié en double ; si ce sont deux exemplaires, publie ensuite celle-ci.',
                                           CASE e.k WHEN 'leboncoin' THEN 'Leboncoin' WHEN 'ebay' THEN 'eBay' WHEN 'beebs' THEN 'Beebs' WHEN 'depop' THEN 'Depop'
                                                    WHEN 'vinted' THEN 'Vinted' WHEN 'opla' THEN 'Opla' ELSE e.k END, e.v ->> 'titre',
                                           CASE WHEN (e.v ->> 'a_verifier')::boolean THEN 'À régler › Annonces à vérifier' ELSE 'Stock › Synchroniser' END), ' ' ORDER BY e.k)
                  FROM jsonb_each(v_meme_objet) AS e(k, v))
    );
  END IF;
  -- 13/11 N6a⟧
  -- (09/10 soir, Louis) La garde « fiche jumelle en ligne » (27/09, motif
  -- jumeau_en_ligne) est RETIRÉE : une annonce rattachée à une AUTRE fiche
  -- n'est jamais un « déjà en ligne » pour celle-ci. Seule reste la règle
  -- « une fiche, une annonce en ligne par plateforme » (already_published
  -- ci-dessus, inchangée). Migration 20261009233000.

  -- (03/11/2026, grille à 3 jauges, décision de Nico ; interrupteur coin_config.grille_trois_jauges, 0 = règles d'avant) : la jauge Publications (1 par plateforme, avec ou sans IA) et le garde-fou du jour, AVANT tout débit.
  IF jauges_actives() THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('publications:' || v_user::text, 0));
    v_pub_plafond := jauge_publications_plafond(palier_de(v_user));
    IF v_pub_plafond IS NOT NULL THEN
      v_pub_faites := publications_du_cycle(v_user, debut_cycle_quotas(v_user));
      IF v_pub_faites + v_job_count > v_pub_plafond THEN
        SELECT w.next_grant_at INTO v_pub_remise FROM coin_wallets w WHERE w.user_id = v_user;
        RETURN jsonb_build_object(
          'allowed', false, 'reason', 'quota_publications_atteint', 'jauge', 'publications',
          'plafond', v_pub_plafond, 'consommes', v_pub_faites,
          'restantes', GREATEST(0, v_pub_plafond - v_pub_faites), 'demandees', v_job_count, 'remise_le', v_pub_remise,
          'message', CASE WHEN v_pub_faites >= v_pub_plafond
            THEN format('Tes %s publications du mois sont faites%s. Rien n''a été publié ni décompté.', v_pub_plafond,
                   CASE WHEN v_pub_remise IS NOT NULL THEN ' : elles reviennent le ' || to_char(v_pub_remise AT TIME ZONE 'Europe/Paris', 'DD/MM') ELSE '' END)
            ELSE format('Il te reste %s publication%s ce mois-ci, et cet article en demande %s : décoche une plateforme. Rien n''a été publié ni décompté.',
                   v_pub_plafond - v_pub_faites, CASE WHEN v_pub_plafond - v_pub_faites > 1 THEN 's' ELSE '' END, v_job_count)
          END);
      END IF;
    END IF;
    v_garde := garde_fou_jour(v_user, 'publications', v_job_count);
    IF v_garde IS NOT NULL THEN
      RETURN v_garde;
    END IF;
  END IF;

  SELECT value INTO v_price_photo FROM coin_config WHERE key = 'price_' || p_photo_option;
  SELECT value INTO v_price_unit  FROM coin_config WHERE key = 'price_per_platform';
  IF v_price_photo IS NULL OR v_price_unit IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'price_not_configured');
  END IF;

  IF p_photo_option <> 'original' AND v_price_photo > 0 THEN
    IF NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(p_jobs) AS j
      CROSS JOIN LATERAL jsonb_array_elements(
        CASE WHEN jsonb_typeof(j->'photos') = 'array' THEN j->'photos' ELSE '[]'::jsonb END
      ) AS ph
      WHERE (jsonb_typeof(ph) = 'object' AND (
               COALESCE(ph->>'enhanced', '')   <> ''
               OR COALESCE(ph->>'bg_removed', '') <> ''
               OR COALESCE(ph->>'type', '') LIKE 'enhanced%'
               OR COALESCE(ph->>'url', '')  LIKE '%/enhanced/%'))
         OR (jsonb_typeof(ph) = 'string' AND (ph #>> '{}') LIKE '%/enhanced/%')
    ) THEN
      v_price_photo   := 0;
      v_photos_billed := false;
    END IF;
  END IF;

  v_price_pub := v_price_unit * v_job_count;
  v_price     := v_price_photo + v_price_pub;

  IF v_price > 0 THEN
    INSERT INTO coin_wallets (user_id) VALUES (v_user) ON CONFLICT (user_id) DO NOTHING;
    SELECT * INTO v_wallet FROM coin_wallets WHERE user_id = v_user FOR UPDATE;

    IF v_wallet.next_grant_at IS NULL OR v_wallet.next_grant_at <= now() THEN
      SELECT CASE
               WHEN p.is_business = true THEN 'business'
        WHEN p.is_pro = true THEN 'pro'
               WHEN p.is_premium = true OR p.is_comped = true THEN 'premium'
               ELSE 'free'
             END INTO v_tier
      FROM profiles p WHERE p.id = v_user;
      PERFORM upgrade_monthly_grant(v_user, COALESCE(v_tier, 'free'), null, 'lazy');
      SELECT * INTO v_wallet FROM coin_wallets WHERE user_id = v_user FOR UPDATE;
    END IF;

    v_total := v_wallet.included_balance + v_wallet.purchased_balance;
    IF v_total < v_price THEN
      RETURN jsonb_build_object(
        'allowed', false, 'reason', 'insufficient_coins',
        'price', v_price, 'balance', v_total,
        'price_photos', v_price_photo, 'price_publication', v_price_pub,
        'photos_billed', v_photos_billed
      );
    END IF;

    v_photo_inc := LEAST(v_wallet.included_balance, v_price_photo);
    v_pub_inc   := LEAST(v_wallet.included_balance - v_photo_inc, v_price_pub);
    v_pub_pur   := v_price_pub - v_pub_inc;
    v_from_inc  := v_photo_inc + v_pub_inc;
    v_from_pur  := v_price - v_from_inc;

    UPDATE coin_wallets SET
      included_balance  = included_balance  - v_from_inc,
      purchased_balance = purchased_balance - v_from_pur,
      reserved_balance  = reserved_balance  + v_price_pub,
      updated_at        = now()
    WHERE user_id = v_user;

    INSERT INTO coin_reservations (user_id, amount, unit_price, from_included, from_purchased, job_count, photo_option)
    VALUES (v_user, v_price_pub, v_price_unit, v_pub_inc, v_pub_pur, v_job_count, p_photo_option)
    RETURNING id INTO v_res_id;
  END IF;

  BEGIN
    INSERT INTO cross_post_jobs (user_id, inventaire_id, platform, status, photo_option,
                                 title, description, price, photos, platform_fields, reservation_id)
    SELECT
      v_user,
      NULLIF(j->>'inventaire_id','')::bigint,
      j->>'platform',
      'pending',
      p_photo_option,
      j->>'title',
      j->>'description',
      NULLIF(j->>'price','')::numeric,
      j->'photos',
      -- (03/11/2026, grille à 3 jauges, décision de Nico ; interrupteur coin_config.grille_trois_jauges, 0 = règles d'avant) : avec la grille, un appel de l'app ne pose jamais lui-même un marqueur hors quota.
      CASE WHEN jauges_actives() THEN (j->'platform_fields') - 'hors_quota' - 'opla_sortie' ELSE j->'platform_fields' END,
      v_res_id
    FROM jsonb_array_elements(p_jobs) AS j;
  EXCEPTION WHEN unique_violation THEN
    IF v_price > 0 THEN
      UPDATE coin_wallets SET
        included_balance  = included_balance  + v_from_inc,
        purchased_balance = purchased_balance + v_from_pur,
        reserved_balance  = reserved_balance  - v_price_pub,
        updated_at        = now()
      WHERE user_id = v_user;
      DELETE FROM coin_reservations WHERE id = v_res_id;
    END IF;
    RETURN jsonb_build_object(
      'allowed', false, 'reason', 'already_published',
      'platforms', (SELECT jsonb_agg(DISTINCT j->>'platform') FROM jsonb_array_elements(p_jobs) AS j)
    );
  END;

  UPDATE inventaire i
  SET photos = sub.photos
  FROM (
    SELECT DISTINCT ON (inv_id) inv_id, photos
    FROM (
      SELECT NULLIF(j->>'inventaire_id','')::bigint AS inv_id, j->'photos' AS photos,
             -- Un job PLAFONNÉ par sa plateforme (Leboncoin « Divers > Autres » :
             -- 3 photos gratuites, regles.js) ne porte qu'un extrait : il ne
             -- réécrit JAMAIS la fiche (2026-09-27).
             COALESCE(j->'platform_fields'->'lbcPhotosCapped' = 'true'::jsonb, false) AS plafonne
      FROM jsonb_array_elements(p_jobs) AS j
    ) x
    WHERE inv_id IS NOT NULL
      AND jsonb_typeof(photos) = 'array'
      AND jsonb_array_length(photos) > 0
      AND NOT plafonne
    -- Sans ORDER BY, DISTINCT ON gardait le PREMIER job venu : quand c'était
    -- celui de Leboncoin plafonné, la fiche perdait ses photos. La liste la
    -- plus longue est la liste entière.
    ORDER BY inv_id, jsonb_array_length(photos) DESC
  ) sub
  WHERE i.id = sub.inv_id AND i.user_id = v_user;

  IF v_price > 0 THEN
    INSERT INTO coin_ledger (user_id, delta, included_after, purchased_after, kind, metadata)
    VALUES (
      v_user, -v_price,
      v_wallet.included_balance - v_from_inc,
      v_wallet.purchased_balance - v_from_pur,
      'spend_publish',
      jsonb_build_object(
        'photo_option', p_photo_option, 'platforms', v_job_count,
        'price_photos', v_price_photo, 'price_publication', v_price_pub,
        'photos_billed', v_photos_billed,
        'reservation_id', v_res_id
      )
    );
  END IF;

  INSERT INTO usage_logs (user_id, feature, metadata)
  VALUES (v_user, 'publish', jsonb_build_object(
    'coins', v_price, 'photo_option', p_photo_option, 'platforms', v_job_count
  ));

  RETURN jsonb_build_object(
    'allowed', true, 'price', v_price,
    'price_photos', v_price_photo, 'price_publication', v_price_pub,
    'photos_billed', v_photos_billed,
    'included_after',  CASE WHEN v_price > 0 THEN v_wallet.included_balance - v_from_inc ELSE NULL END,
    'purchased_after', CASE WHEN v_price > 0 THEN v_wallet.purchased_balance - v_from_pur ELSE NULL END,
    'reserved_after',  CASE WHEN v_price > 0 THEN v_wallet.reserved_balance + v_price_pub ELSE NULL END
  );
END;
$function$
;

COMMIT;
