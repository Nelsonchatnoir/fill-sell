-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 20261114163000 — PLUS JAMAIS DE FICHE RECRÉÉE DEPUIS UNE ANNONCE NON PROUVÉE VIVANTE
-- (14/11/2026, demande 2 de Nico — compte 13e274de, Beebs, Cloud ; PRÉPARÉE, NON APPLIQUÉE : feu vert de Nico)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- LE FAIT (lu en prod, lecture seule) : les six fantômes de l'index Beebs (27214557, 27214877, 27214883, 27214891,
-- 27214895, 27214901 ; pages 404) ont été réimportés en fiches par le MOTEUR serveur (fonction edge rapprochement →
-- rapprochement_v3_appliquer « creer » → rapprochement_v3_fiche_de → rapprocher_importer, par « rapprochement »,
-- import true) à 11:05:09, 11:19:01, 12:21:02 (6 jobs de suivi) et 14:11:12 (4 ; bilan « creer: 4 », beebs « nouveau: 6 ») —
-- chaque passe réveillée par la FIN d'un relevé du compte (14:10:35, relevé Leboncoin de « Synchroniser » ; passe « geste »),
-- jamais par un relevé Beebs neuf : leur dernière vue (vu_le 11:18:49) venait du relevé 9d5f7b9b (« veilleur »,
-- « incomplete » : « « Mes annonces » de Beebs n'a rien rendu alors que l'index public en montre 6 »), soit l'INDEX SEUL.
-- Aucune garde ne lisait la preuve de vie :
--   · rapprochement_v3_lire : « perimee » ne compare qu'au dernier relevé « done » (11:03:20) — 11:18:49 est plus récent ;
--   · rapprochement_v3_fiche_de : une passe « geste » saute le contrôle du déclencheur du relevé (veilleur) ;
--   · rapprocher_importer (la seule porte d'une fiche « releve_* ») ne regardait ni retiree_le (posé à 02:15-02:19 :
--     retraits « déjà hors ligne », vrais), ni les retraits demandés depuis la dernière vue (13:31-13:34, en attente),
--     ni l'origine de la dernière vue. Même boucle chez a6bbc6c3 le 05/11 (34279046 : retrait « déjà absente » à 00:30:09,
--     réimportée à 00:30:52 depuis un relevé « index seul »). 30 jours : 85 imports d'annonces déjà retirées par FillSell
--     (7 annonces, 2 comptes, toutes Beebs) ; 0 import légitime touché (mesuré : imports du moteur depuis un relevé
--     « index seul » = 11, tous des fantômes de 13e274de ; imports depuis un relevé incomplet qui a LU la liste — Leboncoin
--     « couverture partielle 108/111 » — inchangés).
-- LA RÈGLE (tous comptes, toutes plateformes relevées ; Vinted n'est pas concernée : son import passe par le dressing) :
--   une fiche « releve_* » n'est créée — et une annonce sans fiche n'est rattachée par le moteur — que depuis une annonce
--   PROUVÉE VIVANTE (annonce_non_prouvee_vivante = NULL) : ni disparue, ni vue hors de la liste, ni vue SEULEMENT dans
--   l'index (releve_run_index_seul), ni sous un retrait demandé / en cours / abouti depuis sa dernière vue ; et, pour le
--   moteur, jamais une annonce que FillSell a déjà retirée (retiree_le). Le refus est rendu tel quel
--   ({ ok:false, reason:'annonce_non_prouvee_vivante', motif, message }) — rapprochement_decider l'affiche à la personne
--   (r.message). Le moteur ne la voit plus (« perimee » dans rapprochement_v3_lire, motif dans « non_prouvee ») : ni
--   import, ni rattachement, aucune ligne réécrite, aucun déploiement de fonction edge.
-- Rien d'autre ne change : les deux corps modifiés sont ceux de PROD relus le 14/11 (garde md5), les ajouts entre
-- marqueurs ⟦14/11 point 2⟧, aucune ligne de prod modifiée ni retirée (sauf l'expression « perimee », mise entre parenthèses
-- et complétée). Aucune donnée réécrite à l'application. Charge mesurée le 14/11 (lecture seule) : 544 annonces sans fiche
-- de trois gros comptes jugées en 71 ms (0,06 ms par annonce ; index cross_post_jobs_user_status).
-- Banc (Postgres jetable) et verrou : npm run selftest:annonce-prouvee-vivante (scripts/annonce-prouvee-vivante-selftest.mjs).
-- Inverse : supabase/rollbacks/20261114163000_annonce_prouvee_vivante_INVERSE.sql (les corps de prod à l'octet).
-- Appliquer (feu vert) : npx supabase db query --linked -f supabase/migrations/20261114163000_annonce_prouvee_vivante.sql
--                        npx supabase migration repair --linked --status applied 20261114163000
BEGIN;
SET LOCAL statement_timeout = '60s';
SET LOCAL lock_timeout = '5s';

-- Les corps EN PROD relus le 14/11 (md5 de pg_get_functiondef) : on s'arrête si l'un a changé depuis. Le second md5 est
-- celui de CETTE migration déjà appliquée (rejouée : idempotente).
DO $verif$
DECLARE r record;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('public.rapprocher_importer(uuid,uuid,text)', 'dfb2605d0546b20abebeab6c73d38abc', '83b289b56cd667b6d358e32beeb87ad6'),
    ('public.rapprochement_v3_lire(uuid)', '316a269cbc11e51f7cf78810a6738669', '5ad32d189cbf726b69aa84a38f9ef9df')) AS t(f, m, m_apres)
  LOOP
    IF md5(pg_get_functiondef(r.f::regprocedure)) NOT IN (r.m, r.m_apres) THEN
      RAISE EXCEPTION '% a changé en prod depuis sa lecture du 14/11 (md5 attendu %) : relire, reconstruire, jamais forcer', r.f, r.m;
    END IF;
  END LOOP;
END $verif$;

-- ── 1. « Ce relevé n'a vu que l'index public » (Beebs, « Mes annonces » muette) ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.releve_run_index_seul(p_run_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  -- ⚠️ Libellé écrit par l'extension (background.js, releverAnnoncesPlateforme, couverture Beebs : « « Mes annonces »
  --    de Beebs n'a rien rendu alors que l'index public en montre N ») : le reformuler là-bas sans bouger ici rouvre la
  --    porte (même règle que releve_hors_liste). Toutes les annonces d'un tel relevé ne viennent QUE de l'index.
  SELECT p_run_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.vinted_sync_runs r
     WHERE r.id = p_run_id AND r.platform = 'beebs' AND r.kind = 'annonces'
       AND COALESCE(r.erreur, '') LIKE '%n''a rien rendu alors que l''index public en montre%');
$function$;
REVOKE ALL ON FUNCTION public.releve_run_index_seul(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.releve_run_index_seul(uuid) TO service_role;

-- ── 2. La preuve de vie d'une annonce relevée : NULL = prouvée vivante, sinon le motif ──────────────────────────────
CREATE OR REPLACE FUNCTION public.annonce_non_prouvee_vivante(p_annonce uuid, p_auto boolean DEFAULT true)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE a annonces_plateforme%ROWTYPE;
BEGIN
  -- (14/11/2026, demande 2 de Nico — 13e274de, fantômes de l'index Beebs) Une annonce n'est « prouvée vivante » que si
  -- sa dernière vue vient d'un relevé qui a LU la liste de la personne, et que FillSell ne l'a pas retirée depuis.
  -- Pour toutes les voies (p_auto = false : le geste de la personne) :
  --   disparue · relevé hors de la liste (releve_run_hors_liste) · vue seulement dans l'index (releve_run_index_seul) ·
  --   retrait demandé, en cours ou abouti DEPUIS la dernière vue (la règle de rapprochement_decider, 26/09) ;
  -- et pour la voie automatique (p_auto = true : le moteur) :
  --   déjà retirée par FillSell (retiree_le : retrait abouti, ou « déjà hors ligne » prouvé) — un numéro retiré qui
  --   « revient » est un fantôme d'index ou un retrait raté, jamais un article neuf ; la personne en décide.
  SELECT * INTO a FROM annonces_plateforme WHERE id = p_annonce;
  IF a.id IS NULL THEN RETURN 'introuvable'; END IF;
  IF a.disparu_le IS NOT NULL THEN RETURN 'disparue'; END IF;
  IF releve_run_hors_liste(a.run_id) THEN RETURN 'hors_liste'; END IF;
  IF releve_run_index_seul(a.run_id) THEN RETURN 'vue_seulement_dans_l_index'; END IF;
  IF EXISTS (SELECT 1 FROM cross_post_jobs d
              WHERE d.user_id = a.user_id AND d.platform = a.platform AND d.action = 'delete'
                AND d.status IN ('pending', 'processing', 'needs_user', 'deleted')
                AND d.created_at >= COALESCE(a.vu_le, a.created_at)
                AND listing_designe(a.listing_id, d.listing_url, d.platform_listing_id)) THEN
    RETURN 'retrait_demande';
  END IF;
  IF p_auto AND a.retiree_le IS NOT NULL THEN RETURN 'retiree_par_fillsell'; END IF;
  RETURN NULL;
END;
$function$;
REVOKE ALL ON FUNCTION public.annonce_non_prouvee_vivante(uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.annonce_non_prouvee_vivante(uuid, boolean) TO service_role;

-- ── 3. rapprocher_importer : le corps de prod + la preuve de vie avant toute fiche ou rattachement ⟦14/11 point 2⟧ ─────
CREATE OR REPLACE FUNCTION public.rapprocher_importer(p_user uuid, p_annonce_id uuid, p_par text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  a annonces_plateforme%ROWTYPE;
  v_cap jsonb; v_photos jsonb; v_attr jsonb; v_cle text;
  v_new_inv bigint; v_job uuid; v_titre text; v_prix numeric;
  v_tn text; v_jumeau bigint; v_jumeau_titre text;
  v_homo bigint; v_homo_titre text; v_homo_statut text; v_homo_n integer;
  v_q_inv bigint; v_q_motif text; v_q_preuves jsonb; v_q_posee boolean := false;
  v_sans_question boolean := p_par IN ('utilisateur', 'rapprochement');
  v_ident jsonb;
  v_vie text; -- ⟦14/11 point 2⟧
BEGIN
  SELECT * INTO a FROM annonces_plateforme WHERE id = p_annonce_id AND user_id = p_user FOR UPDATE;
  IF a.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'annonce_introuvable'); END IF;
  IF a.inventaire_id IS NOT NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'deja_rattachee'); END IF;
  -- (22/10, XEWER) Opla quittée : une annonce Opla ne devient jamais une fiche de stock (2 fiches revenues le
  -- 21/10 à 21:28, dont un article vendu la veille).
  IF a.platform = 'opla' AND opla_sortie_passee() THEN RETURN jsonb_build_object('ok', false, 'reason', 'opla_sortie'); END IF;
  IF releve_run_hors_liste(a.run_id) THEN RETURN jsonb_build_object('ok', false, 'reason', 'hors_liste'); END IF;
  -- ⟦14/11 point 2 — demande 2 de Nico⟧ PLUS JAMAIS DE FICHE (NI DE RATTACHEMENT) DEPUIS UNE ANNONCE NON PROUVÉE VIVANTE.
  -- 13e274de (Beebs, Cloud), 14/11 : six annonces que seul l'index public de Beebs portait encore (pages 404) ont été
  -- réimportées en fiches à 11:05, 11:19, 12:21 et 14:11 — vues pour la dernière fois par un relevé dont « Mes annonces »
  -- n'avait rien rendu (index seul), déjà retirées par FillSell (« déjà hors ligne »), et à 14:11 sous un retrait en
  -- attente. La seule porte d'une fiche « releve_* » refuse désormais (annonce_non_prouvee_vivante) : disparue, relevé hors
  -- de la liste, vue seulement dans l'index, retrait demandé / en cours / abouti depuis la dernière vue ; et, sur la voie
  -- automatique (le moteur), une annonce que FillSell a déjà retirée. La personne garde son geste sur une annonce revue
  -- par un relevé qui a lu sa liste. AVANT l'identifiant : une annonce morte ne rejoint pas non plus la fiche d'un dépôt.
  v_vie := annonce_non_prouvee_vivante(a.id, p_par IS DISTINCT FROM 'utilisateur');
  IF v_vie IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'annonce_non_prouvee_vivante', 'motif', v_vie,
      'message', CASE v_vie
        WHEN 'vue_seulement_dans_l_index' THEN 'Beebs ne montre plus cette annonce dans « Mes annonces », seulement dans son index public : FillSell attend qu''un relevé la voie dans ta liste avant d''en faire un article.'
        WHEN 'retrait_demande' THEN 'FillSell a retiré cette annonce (ou est en train de le faire) : il n''y a plus rien à importer.'
        WHEN 'disparue' THEN 'Cette annonce n''est plus en ligne : il n''y a plus rien à importer.'
        ELSE 'Cette annonce n''est pas prouvée en ligne : FillSell attend qu''un relevé la voie dans ta liste.' END);
  END IF;
  -- ⟦14/11 point 2 — fin⟧
  -- (27/10, Nico/Depop, XEWER/Leboncoin) L'IDENTIFIANT D'ABORD : une annonce qu'un dépôt FillSell de CE compte, sur
  -- CETTE plateforme, désigne déjà (publié, vendu ou annulé) rejoint la fiche de ce dépôt — jamais une fiche neuve,
  -- quelle que soit la voie (le moteur, la personne, un rattrapage). Rendu tel quel : { ok, decision 'attache',
  -- inventaire_id, job_id } ; rapprochement_v3_fiche_de et la personne lisent l'article qu'il nomme.
  v_ident := annonce_rattacher_par_identifiant(a.id, p_par);
  IF v_ident IS NOT NULL THEN RETURN v_ident; END IF;
  v_titre := COALESCE(NULLIF(trim(a.titre), ''), 'Annonce ' || a.platform);
  v_prix := a.prix;
  v_tn := titre_norm(NULLIF(trim(a.titre), ''));

  -- La garde des homonymes et du jumeau (20/09, 26/09, 27/09) : seulement hors
  -- des deux voies qui ont DÉJÀ tranché (la personne, le moteur du compte).
  IF NOT v_sans_question AND COALESCE(v_tn, '') <> ''
     AND COALESCE(array_length(titre_jetons(a.titre), 1), 0) > 0 THEN
    SELECT i.id, i.titre, i.statut, count(*) OVER ()
      INTO v_homo, v_homo_titre, v_homo_statut, v_homo_n
      FROM inventaire i
     WHERE i.user_id = p_user AND i.fusionne_dans IS NULL AND i.statut IN ('stock', 'vendu')
       AND (titre_norm(i.titre) = v_tn OR titre_jetons(i.titre) = titre_jetons(a.titre))
     ORDER BY (i.statut = 'stock') DESC, (titre_norm(i.titre) = v_tn) DESC, i.created_at ASC
     LIMIT 1;
    IF v_homo IS NOT NULL THEN
      v_q_inv := v_homo;
      v_q_motif := CASE WHEN v_homo_statut = 'vendu' THEN 'homonyme_vendu' ELSE 'homonyme_en_stock' END;
      v_q_preuves := jsonb_build_object('titre_annonce', v_titre, 'titre_article', v_homo_titre,
                                        'statut_fiche', v_homo_statut, 'homonymes', v_homo_n,
                                        'signaux', jsonb_build_object('exact', titre_norm(v_homo_titre) = v_tn));
    END IF;
  END IF;
  IF v_q_inv IS NULL AND NOT v_sans_question AND a.proposition IS NOT NULL
     AND NULLIF(a.proposition ->> 'inventaire_id', '') IS NOT NULL THEN
    v_q_inv := (a.proposition ->> 'inventaire_id')::bigint;
    v_q_motif := COALESCE(NULLIF(a.proposition ->> 'motif', ''), 'proposition');
    v_q_preuves := jsonb_build_object('titre_annonce', v_titre, 'proposition', a.proposition,
                                      'signaux', jsonb_build_object(
                                        'ov', a.proposition -> 'signaux' -> 'recouvrement',
                                        'prix', CASE WHEN a.proposition -> 'signaux' ->> 'prix' = 'exact' THEN 'egal' END));
  END IF;
  IF v_q_inv IS NULL AND NOT v_sans_question AND length(COALESCE(v_tn, '')) > 12 THEN
    SELECT i.id, i.titre INTO v_jumeau, v_jumeau_titre
      FROM inventaire i
     WHERE i.user_id = p_user
       AND i.statut = 'stock'
       AND i.disparu_le IS NULL
       AND i.fusionne_dans IS NULL
       AND length(titre_norm(i.titre)) > 12
       AND NOT titres_variantes_incompatibles(a.titre, i.titre)
       AND (' ' || v_tn || ' ' LIKE '% ' || titre_norm(i.titre) || ' %'
            OR ' ' || titre_norm(i.titre) || ' ' LIKE '% ' || v_tn || ' %')
     ORDER BY (titre_norm(i.titre) = v_tn) DESC, i.created_at ASC
     LIMIT 1;
    IF v_jumeau IS NOT NULL THEN
      v_q_inv := v_jumeau; v_q_motif := 'titre_inclus';
      v_q_preuves := jsonb_build_object('titre_annonce', v_titre, 'titre_article', v_jumeau_titre,
                                        'signaux', jsonb_build_object('ov', 0.8));
    END IF;
  END IF;

  -- inventaire.id n'a pas de DEFAULT (convention du front : horodatage ms).
  v_new_inv := (extract(epoch FROM clock_timestamp()) * 1000)::bigint;
  WHILE EXISTS (SELECT 1 FROM inventaire WHERE id = v_new_inv) LOOP v_new_inv := v_new_inv + 1; END LOOP;
  v_cap := a.capture;
  v_photos := CASE
    WHEN jsonb_typeof(v_cap -> 'photos') = 'array' AND jsonb_array_length(v_cap -> 'photos') > 0 THEN v_cap -> 'photos'
    WHEN a.photo_url IS NOT NULL THEN jsonb_build_array(a.photo_url)
    ELSE NULL END;
  v_attr := '{}'::jsonb;
  FOR v_cle IN SELECT unnest(ARRAY['taille', 'etat', 'couleur', 'matiere', 'marque']) LOOP
    IF NULLIF(trim(v_cap ->> v_cle), '') IS NOT NULL THEN
      v_attr := v_attr || jsonb_build_object(v_cle, jsonb_build_object('v', trim(v_cap ->> v_cle), 'source', 'releve_' || a.platform, 'at', now()));
    END IF;
  END LOOP;
  -- (08/10, complément) la seule porte d'une fiche « releve_* » : la garde de la
  -- base (inventaire_releve_par_decision) refuse toute autre écriture.
  PERFORM set_config('fillsell.import_releve', 'on', true);
  INSERT INTO inventaire (id, user_id, titre, prix_vente, statut, plateforme, origine, quantite, photos, attributs,
                          description, marque, first_seen_at, last_synced_at, photos_a_rapatrier)
  VALUES (v_new_inv, p_user, v_titre, v_prix, 'stock', a.platform, 'releve_' || a.platform, 1,
          v_photos, v_attr,
          NULLIF(trim(v_cap ->> 'description'), ''), NULLIF(trim(v_cap ->> 'marque'), ''), now(), now(),
          v_photos IS NOT NULL);
  PERFORM set_config('fillsell.import_releve', '', true);
  v_job := rapprocher_job_de_suivi(p_user, a.platform, v_new_inv, v_titre, v_prix, a.url, a.listing_id, p_par,
                                   jsonb_build_object('annonce_id', a.id, 'import', true));
  UPDATE annonces_plateforme
     SET inventaire_id = v_new_inv, job_id = v_job,
         source_rapprochement = CASE WHEN p_par = 'utilisateur' THEN 'manuel' ELSE 'automatique' END,
         proposition = NULL, ignoree_le = NULL, fiche_supprimee_le = NULL, updated_at = now()
   WHERE id = a.id;
  IF v_q_inv IS NOT NULL THEN
    v_q_posee := releve_poser_question(p_user, v_q_inv, v_new_inv, v_q_motif,
                   COALESCE(v_q_preuves, '{}'::jsonb) || jsonb_build_object('annonce_id', a.id, 'platform', a.platform,
                                                                         'listing_id', a.listing_id, 'url', a.url, 'prix', a.prix));
  END IF;
  INSERT INTO rapprochements (user_id, annonce_id, inventaire_id, decision, par, score, detail)
  VALUES (p_user, a.id, v_new_inv, 'import', CASE WHEN p_par = 'rapprochement' THEN 'auto' ELSE p_par END, 1, jsonb_build_object('job_id', v_job, 'voie', p_par)
          || CASE WHEN p_par = 'rapprochement' THEN jsonb_build_object('regle', 'rapprochement_v3') ELSE '{}'::jsonb END
          || CASE WHEN v_q_inv IS NOT NULL
                  THEN jsonb_build_object('question', jsonb_build_object('inventaire_id', v_q_inv, 'motif', v_q_motif, 'posee', v_q_posee))
                  ELSE '{}'::jsonb END);
  RETURN jsonb_build_object('ok', true, 'decision', 'import', 'inventaire_id', v_new_inv, 'job_id', v_job)
         || CASE WHEN v_q_inv IS NOT NULL
                 THEN jsonb_build_object('question', jsonb_build_object('inventaire_id', v_q_inv, 'motif', v_q_motif, 'posee', v_q_posee))
                 ELSE '{}'::jsonb END;
END;
$function$;

-- ── 4. rapprochement_v3_lire : le corps de prod + une annonce sans fiche non prouvée vivante lue « périmée » ⟦14/11 point 2⟧
CREATE OR REPLACE FUNCTION public.rapprochement_v3_lire(p_user uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
 SET statement_timeout TO '90s'
AS $function$
DECLARE v_fiches jsonb; v_annonces jsonb; v_fusions jsonb; v_doublons jsonb;
        v_depuis timestamptz := rapprochement_v3_vinted_depuis(p_user); v_vinted jsonb; v_vinted_max timestamptz; v_vinted_reste boolean;
        v_main_depuis timestamptz := rapprochement_v3_fiches_main_depuis(p_user); v_main jsonb := '[]'::jsonb; v_main_max timestamptz; v_main_reste boolean := false;
        v_nouvelles jsonb := '[]'::jsonb; v_releves jsonb := '{}'::jsonb;
BEGIN
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', i.id::text, 'titre', i.titre, 'prix', i.prix_vente, 'statut', i.statut, 'origine', i.origine,
      'marque', COALESCE(NULLIF(trim(i.marque), ''), CASE WHEN jsonb_typeof(i.attributs -> 'marque') = 'object' THEN i.attributs -> 'marque' ->> 'v' ELSE i.attributs ->> 'marque' END),
      'taille', CASE WHEN jsonb_typeof(i.attributs -> 'taille') = 'object' THEN i.attributs -> 'taille' ->> 'v' ELSE i.attributs ->> 'taille' END,
      'photos', COALESCE((SELECT jsonb_agg(z.u ORDER BY z.o) FROM (
                  SELECT CASE WHEN jsonb_typeof(e) = 'string' THEN e #>> '{}' WHEN jsonb_typeof(e) = 'object' THEN COALESCE(e ->> 'url', e ->> 'original') END u, o
                    FROM jsonb_array_elements(CASE WHEN jsonb_typeof(i.photos) = 'array' THEN i.photos ELSE '[]'::jsonb END) WITH ORDINALITY x(e, o)
                   LIMIT 6) z WHERE z.u ~ '^https://'), '[]'::jsonb),
      'a_verifier', i.a_verifier IS NOT NULL,
      'a_verifier_auto', i.a_verifier IS NOT NULL AND COALESCE(i.a_verifier ->> 'source', '') IN ('moteur', 'rattrapage_0710', 'rapprochement_v3'),
      'created_at', i.created_at, 'quantite', COALESCE(i.quantite, 1), 'vinted_item_id', i.vinted_item_id,
      -- (08/10 soir, reconstruit le 24/10) la remise en ligne Vinted : l'état de l'annonce Vinted de la fiche
      'vinted_status', i.vinted_status, 'disparu_le', i.disparu_le, 'last_synced_at', i.last_synced_at,
      'first_seen_at', i.first_seen_at, 'vinted_account_id', i.vinted_account_id
    )), '[]'::jsonb)
    INTO v_fiches
    FROM inventaire i
   WHERE i.user_id = p_user AND i.fusionne_dans IS NULL AND i.statut IN ('stock', 'vendu');

  -- (08/11, ayadi007) Le DERNIER relevé terminé (« done ») de chaque plateforme du compte : une annonce qu'il n'a pas
  -- revue (ni par son run, ni par une vue d'après) est « perimee » — le moteur ne l'importe ni ne la rattache jamais
  -- quand elle n'a pas de fiche (moteur.js, construireNoeuds). 10 min de marge : vu_le et started_at peuvent venir de
  -- deux horloges (le poste, le serveur).
  WITH derniers AS (
    SELECT DISTINCT ON (r.platform) r.platform, r.id, r.started_at
      FROM vinted_sync_runs r
     WHERE r.user_id = p_user AND r.kind = 'annonces' AND r.status = 'done' AND r.started_at IS NOT NULL
     ORDER BY r.platform, r.started_at DESC
  ),
  runs AS (
    SELECT r.id, releve_run_hors_liste(r.id) hors_liste, releve_est_geste(r.declencheur) geste,
           (r.platform = 'ebay' AND releve_ebay_run_bloque(r.id)) ebay_bloque
      FROM vinted_sync_runs r
     WHERE r.id IN (SELECT DISTINCT a.run_id FROM annonces_plateforme a WHERE a.user_id = p_user AND a.disparu_le IS NULL AND a.run_id IS NOT NULL)
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', a.id, 'platform', a.platform, 'listing_id', a.listing_id, 'url', a.url, 'titre', a.titre, 'prix', a.prix,
      'photo_url', a.photo_url,
      'photos', (
        -- les photos de la fiche rapatriée (notre stockage) quand il y en a, sinon la
        -- capture (Leboncoin : la grande image, jamais la vignette), sinon la couverture
        SELECT COALESCE(
          (SELECT jsonb_agg(z.u ORDER BY z.o) FROM (
             SELECT CASE WHEN jsonb_typeof(e) = 'string' THEN e #>> '{}' WHEN jsonb_typeof(e) = 'object' THEN COALESCE(e ->> 'url', e ->> 'original') END u, o
               FROM inventaire i2, jsonb_array_elements(CASE WHEN jsonb_typeof(i2.photos) = 'array' THEN i2.photos ELSE '[]'::jsonb END) WITH ORDINALITY x(e, o)
              WHERE i2.id = a.inventaire_id AND i2.origine = 'releve_' || a.platform
                AND (i2.photos -> 0) #>> '{}' LIKE '%/storage/v1/object/public/listing-photos/%'
              LIMIT 6) z WHERE z.u ~ '^https://'),
          (SELECT jsonb_agg(regexp_replace(z.u, 'rule=ad-(thumb|small|medium)', 'rule=ad-large') ORDER BY z.o) FROM (
             SELECT e #>> '{}' u, o FROM jsonb_array_elements(CASE WHEN jsonb_typeof(a.capture -> 'photos') = 'array' THEN a.capture -> 'photos' ELSE '[]'::jsonb END) WITH ORDINALITY x(e, o)
              WHERE jsonb_typeof(e) = 'string' LIMIT 6) z WHERE z.u ~ '^https://'),
          CASE WHEN a.photo_url ~ '^https://' THEN jsonb_build_array(regexp_replace(a.photo_url, 'rule=ad-(thumb|small|medium)', 'rule=ad-large')) ELSE '[]'::jsonb END)),
      'taille', a.capture ->> 'taille', 'marque', a.capture ->> 'marque',
      -- (15/10, P16) la republication : la clé de la description (20 caractères
      -- et plus, jamais le texte), « lot / plusieurs / au choix », la quantité
      'desc_h', rapprochement_description_cle(a.capture ->> 'description'),
      'desc_lot', rapprochement_description_lot(a.capture ->> 'description', a.titre),
      'quantite', a.quantite,
      'inventaire_id', a.inventaire_id::text,
      'ignoree', a.ignoree_le IS NOT NULL,
      'ignoree_par_utilisateur', a.ignoree_le IS NOT NULL AND EXISTS (SELECT 1 FROM rapprochements r WHERE r.annonce_id = a.id AND r.decision = 'ignore' AND r.par = 'utilisateur'),
      'proposition_motif', a.proposition ->> 'motif',
      'source', a.source_rapprochement, 'run_id', a.run_id,
      'en_ligne', a.statut_plateforme = 'en_ligne' AND a.fiche_supprimee_le IS NULL,
      'hors_liste', COALESCE(ru.hors_liste, false), 'ebay_bloque', COALESCE(ru.ebay_bloque, false), 'geste', COALESCE(ru.geste, false),
      'derniere_par', d.par, 'derniere_decision', d.decision, 'derniere_motif', d.motif,
      'perimee', (dr.id IS NOT NULL AND a.run_id IS DISTINCT FROM dr.id
                  AND COALESCE(a.vu_le, a.created_at) < dr.started_at - interval '10 minutes')
                 -- ⟦14/11 point 2⟧ une annonce sans fiche NON PROUVÉE VIVANTE est lue comme périmée : le moteur (moteur.js,
                 -- construireNoeuds) ne l'importe ni ne la rattache — même effet, aucun déploiement de la fonction edge.
                 OR nv.motif IS NOT NULL,
      'non_prouvee', nv.motif
    )), '[]'::jsonb)
    INTO v_annonces
    FROM annonces_plateforme a
    LEFT JOIN runs ru ON ru.id = a.run_id
    LEFT JOIN derniers dr ON dr.platform = a.platform
    -- ⟦14/11 point 2⟧ la preuve de vie d'une annonce SANS fiche (voie automatique : annonce_non_prouvee_vivante)
    LEFT JOIN LATERAL (SELECT CASE WHEN a.inventaire_id IS NULL THEN annonce_non_prouvee_vivante(a.id, true) END AS motif) nv ON true
    LEFT JOIN LATERAL (SELECT r.par, r.decision, r.detail ->> 'motif' motif FROM rapprochements r
                        WHERE r.annonce_id = a.id AND r.decision IN ('attache', 'import', 'ignore')
                        ORDER BY r.created_at DESC LIMIT 1) d ON true
   WHERE a.user_id = p_user AND a.disparu_le IS NULL AND a.platform IN ('leboncoin', 'beebs', 'ebay', 'opla', 'depop')
     -- (22/10, XEWER) Opla quittée : une annonce Opla ORPHELINE (fiche supprimée, jamais rattachée) n'est plus
     -- jamais importée ni rattachée ; les annonces Opla déjà rattachées restent lues (preuves du graphe).
     AND NOT (a.platform = 'opla' AND a.inventaire_id IS NULL AND opla_sortie_passee())
     AND NOT (a.url IS NOT NULL AND annonce_lien_notification(a.url));

  SELECT COALESCE(jsonb_agg(jsonb_build_object('garde', f.garde::text, 'absorbe', f.absorbe::text, 'par', f.par, 'defaite', f.defait_le IS NOT NULL)), '[]'::jsonb)
    INTO v_fusions FROM inventaire_fusions f WHERE f.user_id = p_user;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', d.id, 'garde', d.garde::text, 'absorbe', d.absorbe::text, 'statut', d.statut, 'motif', d.motif,
                                                 'decide_par', d.decide_par, 'source', d.source,
                                                 'auto', d.decide_par IS NULL AND COALESCE(d.source, '') = 'releve' AND d.motif IS DISTINCT FROM 'copie_non_prouvee')), '[]'::jsonb)
    INTO v_doublons FROM inventaire_doublons d WHERE d.user_id = p_user AND d.statut IN ('proposee', 'refusee', 'fusionnee');

  -- (08/10, complément) les fiches du dressing Vinted nées depuis la dernière
  -- passe : jugées contre les imports déjà au stock (rien à juger sans import).
  -- 200 par passe au plus (une fonction edge n'a que 2 s de CPU) : la date de la
  -- 200e, et toutes celles de la même date (un lot du dressing partage la sienne) ;
  -- la suite part à la passe d'après (vinted_reste).
  SELECT max(x.created_at) INTO v_vinted_max FROM (
    SELECT i.created_at FROM inventaire i
     WHERE i.user_id = p_user AND i.origine = 'vinted_sync' AND i.created_at > v_depuis
     ORDER BY i.created_at LIMIT 200) x;
  v_vinted_reste := v_vinted_max IS NOT NULL AND EXISTS (
    SELECT 1 FROM inventaire i WHERE i.user_id = p_user AND i.origine = 'vinted_sync' AND i.created_at > v_vinted_max);
  SELECT COALESCE(jsonb_agg(i.id::text ORDER BY i.created_at), '[]'::jsonb) INTO v_vinted FROM inventaire i
   WHERE i.user_id = p_user AND i.origine = 'vinted_sync' AND i.created_at > v_depuis AND i.created_at <= v_vinted_max
     AND i.fusionne_dans IS NULL AND i.statut IN ('stock', 'vendu')
     AND (EXISTS (SELECT 1 FROM inventaire r WHERE r.user_id = p_user AND r.origine LIKE 'releve\_%'
                   AND r.fusionne_dans IS NULL AND r.statut IN ('stock', 'vendu'))
          -- (08/10 soir) … ou contre les fiches créées à la main (règle de Nico)
          OR EXISTS (SELECT 1 FROM inventaire i WHERE i.user_id = p_user AND i.fusionne_dans IS NULL AND i.statut = 'stock'
                       AND i.vinted_item_id IS NULL AND COALESCE(i.origine, '') <> 'vinted_sync' AND COALESCE(i.origine, '') NOT LIKE 'releve\_%'));

  -- (08/10 soir) les fiches créées à la main nées depuis la dernière passe :
  -- jugées contre les fiches Vinted (rien à juger sans fiche Vinted). 200 par
  -- passe, la suite à la passe d'après (fiches_main_reste).
  IF EXISTS (SELECT 1 FROM inventaire v WHERE v.user_id = p_user AND v.fusionne_dans IS NULL AND v.statut = 'stock'
               AND (v.vinted_item_id IS NOT NULL OR v.origine = 'vinted_sync')) THEN
    SELECT max(x.created_at) INTO v_main_max FROM (
      SELECT i.created_at FROM inventaire i
       WHERE i.user_id = p_user AND i.vinted_item_id IS NULL AND COALESCE(i.origine, '') <> 'vinted_sync' AND COALESCE(i.origine, '') NOT LIKE 'releve\_%' AND i.created_at > v_main_depuis
       ORDER BY i.created_at LIMIT 200) x;
    v_main_reste := v_main_max IS NOT NULL AND EXISTS (
      SELECT 1 FROM inventaire i WHERE i.user_id = p_user AND i.vinted_item_id IS NULL AND COALESCE(i.origine, '') <> 'vinted_sync' AND COALESCE(i.origine, '') NOT LIKE 'releve\_%' AND i.created_at > v_main_max);
    SELECT COALESCE(jsonb_agg(i.id::text ORDER BY i.created_at), '[]'::jsonb) INTO v_main FROM inventaire i
     WHERE i.user_id = p_user AND i.vinted_item_id IS NULL AND COALESCE(i.origine, '') <> 'vinted_sync' AND COALESCE(i.origine, '') NOT LIKE 'releve\_%' AND i.created_at > v_main_depuis AND i.created_at <= v_main_max
       AND i.fusionne_dans IS NULL AND i.statut = 'stock';
  END IF;

  -- (08/10 soir, Bebertdeals ; reconstruit sur la prod le 24/10) LA REMISE EN LIGNE VINTED : les fiches du dressing
  -- nées depuis la dernière passe (la fenêtre de vinted_a_juger, sans sa condition), et le dernier relevé COMPLET de
  -- chaque boutique (une fiche absente de ce relevé a quitté le dressing). Inerte tant que coin_config
  -- rapprochement_remise_en_ligne <> 1.
  IF v_vinted_max IS NOT NULL THEN
    SELECT COALESCE(jsonb_agg(i.id::text ORDER BY i.created_at), '[]'::jsonb) INTO v_nouvelles FROM inventaire i
     WHERE i.user_id = p_user AND i.origine = 'vinted_sync' AND i.created_at > v_depuis AND i.created_at <= v_vinted_max
       AND i.fusionne_dans IS NULL AND i.statut = 'stock';
  END IF;
  SELECT COALESCE(jsonb_object_agg(x.acc, x.le), '{}'::jsonb) INTO v_releves FROM (
    SELECT COALESCE(r.vinted_user_id, '') acc, max(r.started_at) le FROM vinted_sync_runs r
     WHERE r.user_id = p_user AND r.kind = 'dressing' AND r.status = 'done' AND r.items_vus > 0
       AND r.items_vus >= COALESCE(r.total_entries, r.items_vus)
     GROUP BY 1) x;

  RETURN jsonb_build_object(
    'remise_en_ligne_actif', COALESCE((SELECT value FROM coin_config WHERE key = 'rapprochement_remise_en_ligne'), 0) = 1,
    'vinted_nouvelles', v_nouvelles, 'vinted_releves_complets', v_releves,
    'fiches_main_actif', true, 'fiches_main_a_juger', v_main, 'fiches_main_juge_jusqu_a', v_main_max,
    'fiches_main_depuis', v_main_depuis, 'fiches_main_reste', COALESCE(v_main_reste, false),
    'vinted_a_juger', v_vinted, 'vinted_juge_jusqu_a', v_vinted_max, 'vinted_depuis', v_depuis, 'vinted_reste', COALESCE(v_vinted_reste, false),
    'user_id', p_user, 'fiches', v_fiches, 'annonces', v_annonces, 'fusions', v_fusions, 'doublons', v_doublons,
    'dette_beebs', releve_dette_beebs(p_user),
    'import_ouvert', COALESCE((SELECT value FROM coin_config WHERE key = 'import_auto_ouvert'), 0) = 1,
    'geste_recent', EXISTS (SELECT 1 FROM vinted_sync_runs s WHERE s.user_id = p_user AND s.kind IN ('annonces', 'dressing')
                             AND releve_est_geste(s.declencheur) AND COALESCE(s.queued_at, s.started_at) > now() - interval '2 hours'),
    'lu_le', now());
END;
$function$;

COMMIT;
