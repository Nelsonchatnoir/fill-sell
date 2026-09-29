-- Inverse de 20260929233500_beebs_retenue_silencieuse.sql.
-- Rend rapprocher_releve à la définition relue le 29/09 à 23:15
-- (md5 af90bb59fdc9989454e6669854b14ca3) : garde 222500 seule, rien d'autre.
-- Ne libère PAS les annonces déjà retenues (ignoree_le) : geste séparé,
-- borné, soumis à Nico (requête en fin de fichier, commentée).

BEGIN;
SET LOCAL statement_timeout = '5s';
SET LOCAL lock_timeout = '1s';

DO $rollback$
DECLARE
  v_src text;
  a1 constant text := $a1$  v_vide_non_probant boolean := false;
BEGIN$a1$;
  n1 constant text := $n1$  v_vide_non_probant boolean := false;
  v_dette_beebs boolean := false;
  n_retenues integer := 0;
BEGIN$n1$;
  a2 constant text := $a2$  v_questions := revoir_questions_releve(v_user,v_pf,1);
$a2$;
  n2 constant text := $n2$  -- retenue_silencieuse_beebs (29/09 soir) : périmètre de la garde
  -- depot_beebs_sans_identifiant_reste_proposition, limité aux dépôts de
  -- l'incident, évalué UNE fois par relevé.
  -- Tant qu'un dépôt Beebs confirmé n'a ni lien ni identifiant, aucune question
  -- Beebs ne naît pour ce compte : le client ne voit rien de l'incident.
  v_dette_beebs := v_pf = 'beebs' AND EXISTS (
    SELECT 1
    FROM cross_post_jobs j
    WHERE j.user_id = v_user
      AND j.platform = 'beebs'
      AND j.action IN ('publish', 'republish')
      AND j.status = 'published'
      AND j.platform_listing_id IS NULL
      AND j.listing_url IS NULL
      AND (
        COALESCE(j.platform_fields, '{}'::jsonb) ? 'lien_en_attente'
        OR COALESCE(j.platform_fields, '{}'::jsonb) ? 'retour_arriere_attente_identifiant_beebs'
      )
      -- Décision Nico (nuit du 29/09) : la dette ne compte que les dépôts de
      -- l'incident, publiés depuis le 29/09 20:22 (Paris). Les dépôts sans
      -- identifiant plus anciens (xxewwer : 48, du 21 au 28/09) ont déjà été
      -- relevés avant l'incident et ne ferment rien.
      AND COALESCE(j.published_at, j.created_at) >= '2026-09-29 20:22:00+02'::timestamptz
  );
  IF v_dette_beebs THEN
    v_questions := jsonb_build_object('ok', true, 'examinees', 0, 'questions_posees', 0, 'retenue_beebs', true);
  ELSE
    v_questions := revoir_questions_releve(v_user,v_pf,1);
  END IF;
$n2$;
  a3 constant text := $a3$    -- depot_beebs_sans_identifiant_reste_proposition (29/09) : tant
    -- qu'un dépôt confirmé n'a ni lien ni identifiant, une annonce neuve du
    -- relevé peut être ce dépôt. Le titre ne tranche rien : proposition oui/non,
    -- jamais création automatique d'une seconde fiche.
    v_res := rapprocher_traiter_annonce(
      v_id,
      v_vus,
      v_import_ouvert AND NOT (
        v_pf = 'beebs'
        AND EXISTS (
          SELECT 1
          FROM cross_post_jobs j
          WHERE j.user_id = v_user
            AND j.platform = 'beebs'
            AND j.action IN ('publish', 'republish')
            AND j.status = 'published'
            AND j.platform_listing_id IS NULL
            AND j.listing_url IS NULL
            AND (
              COALESCE(j.platform_fields, '{}'::jsonb) ? 'lien_en_attente'
              OR COALESCE(j.platform_fields, '{}'::jsonb) ? 'retour_arriere_attente_identifiant_beebs'
            )
        )
      ),
      false,
      false
    );$a3$;
  n3 constant text := $n3$    -- depot_beebs_sans_identifiant_reste_proposition (29/09) : tant
    -- qu'un dépôt confirmé n'a ni lien ni identifiant, une annonce neuve du
    -- relevé peut être ce dépôt. Le titre ne tranche rien : jamais création
    -- automatique d'une seconde fiche.
    v_res := rapprocher_traiter_annonce(v_id, v_vus, v_import_ouvert AND NOT v_dette_beebs, false, false);
    -- retenue_silencieuse_beebs (29/09 soir) : ni import ni question. L'annonce
    -- non rattachée par identifiant sort de la file affichée (ignoree_le) avec
    -- une trace exacte ; elle sera rendue au moteur quand l'identifiant exact
    -- du dépôt sera connu. Le rattachement par identifiant ('job') est inchangé.
    IF v_dette_beebs AND v_res IN ('propose', 'propose_inchangee', 'aucune') THEN
      UPDATE annonces_plateforme
         SET ignoree_le = now(), updated_at = now()
       WHERE id = v_id AND inventaire_id IS NULL AND ignoree_le IS NULL;
      IF FOUND THEN
        INSERT INTO rapprochements (user_id, annonce_id, inventaire_id, decision, par, score, detail)
        VALUES (v_user, v_id, NULL, 'ignore', 'auto', 0,
                jsonb_build_object('run_id', p_run_id, 'motif', 'retenue_silencieuse_beebs',
                                   'resultat', v_res,
                                   'regle', 'dépôt Beebs sans identifiant : ni import ni question avant preuve exacte'));
        n_retenues := n_retenues + 1;
      END IF;
    END IF;$n3$;
  a4 constant text := $a4$                            'vide_non_probant', v_vide_non_probant);$a4$;
  n4 constant text := $n4$                            'vide_non_probant', v_vide_non_probant,
                            'retenues_beebs', n_retenues);$n4$;
BEGIN
  SELECT pg_get_functiondef('public.rapprocher_releve(uuid)'::regprocedure) INTO v_src;
  IF position('retenue_silencieuse_beebs' IN v_src) = 0 THEN
    RETURN; -- rien à défaire
  END IF;
  IF position(n1 IN v_src) = 0 OR position(n2 IN v_src) = 0
     OR position(n3 IN v_src) = 0 OR position(n4 IN v_src) = 0 THEN
    RAISE EXCEPTION 'rapprocher_releve a dérivé depuis la migration : retour arrière à la main, depuis pg_get_functiondef';
  END IF;
  v_src := replace(v_src, n4, a4);
  v_src := replace(v_src, n3, a3);
  v_src := replace(v_src, n2, a2);
  v_src := replace(v_src, n1, a1);
  IF md5(v_src) <> 'af90bb59fdc9989454e6669854b14ca3' THEN
    RAISE EXCEPTION 'retour arrière : la définition reconstruite ne redonne pas af90bb59 (md5 %)', md5(v_src);
  END IF;
  EXECUTE v_src;
END
$rollback$;

REVOKE ALL ON FUNCTION public.rapprocher_releve(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rapprocher_releve(uuid) TO authenticated, service_role;
COMMIT;

-- Libération des annonces retenues (NE PAS lancer sans GO distinct, et
-- seulement quand l'identifiant exact des dépôts est connu) :
-- UPDATE annonces_plateforme a SET ignoree_le = NULL, updated_at = now()
--  WHERE a.inventaire_id IS NULL
--    AND a.id IN (SELECT r.annonce_id FROM rapprochements r
--                  WHERE r.decision = 'ignore' AND r.par = 'auto'
--                    AND r.detail->>'motif' = 'retenue_silencieuse_beebs');
