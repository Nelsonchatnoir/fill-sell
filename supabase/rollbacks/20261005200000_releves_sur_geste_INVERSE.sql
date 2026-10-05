-- INVERSE de supabase/migrations/20261005200000_releves_sur_geste.sql (05/10, Marine).
-- Définitions lues EN PROD avant application (pg_get_functiondef /
-- pg_get_triggerdef), le 2026-10-05T18:18:56.160Z.
-- Rejouer : npx supabase db query --linked -f <ce fichier>
BEGIN;
DROP TRIGGER IF EXISTS garde_releve_sans_geste ON public.vinted_sync_runs;
DROP FUNCTION IF EXISTS public.garde_releve_sans_geste();

CREATE OR REPLACE FUNCTION public.reprendre_releves_absents(p_user uuid, p_simulation boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_ext timestamptz; v_ver text; v_ps jsonb; v_decl jsonb;
  v_min integer; v_code integer;
  v_out jsonb := '{}'::jsonb;
  r record; v_n integer; v_id uuid;
BEGIN
  IF p_user IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'unauthorized'); END IF;
  IF auth.uid() IS NOT NULL AND auth.uid() <> p_user THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unauthorized');
  END IF;
  SELECT extension_last_seen_at, extension_version, COALESCE(platform_settings, '{}'::jsonb)
    INTO v_ext, v_ver, v_ps FROM profiles WHERE id = p_user;
  IF v_ext IS NULL OR v_ext < now() - interval '15 minutes' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'extension_pas_vivante');
  END IF;
  IF NOT sync_multi_ouverte_pour(p_user) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'releve_ferme');
  END IF;
  SELECT value INTO v_min FROM coin_config WHERE key = 'sync_multi_extension_min';
  v_min := COALESCE(v_min, 642);
  v_code := CASE WHEN v_ver ~ '^\d+\.\d+\.\d+' THEN
      (split_part(v_ver, '.', 1))::integer * 10000 + (split_part(v_ver, '.', 2))::integer * 100
      + (regexp_replace(split_part(v_ver, '.', 3), '\D.*$', ''))::integer ELSE 0 END;
  IF v_min > 0 AND v_code < v_min THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'extension_trop_ancienne');
  END IF;
  v_decl := CASE WHEN jsonb_typeof(v_ps -> 'plateformes_vendeur') = 'array' THEN v_ps -> 'plateformes_vendeur' ELSE '[]'::jsonb END;

  -- Le DERNIER relevé de chaque plateforme fait foi (tous statuts sauf
  -- annulé) : un relevé réussi, en file ou en cours après le mur sort la
  -- plateforme des candidats.
  FOR r IN
    SELECT DISTINCT ON (s.platform) s.platform, s.status, s.erreur,
           COALESCE(s.finished_at, s.updated_at, s.queued_at, s.started_at) AS fin
      FROM vinted_sync_runs s
     WHERE s.user_id = p_user AND s.kind = 'annonces'
       AND s.platform IN ('leboncoin', 'beebs', 'ebay', 'opla')
       AND s.status <> 'cancelled'
     ORDER BY s.platform, COALESCE(s.finished_at, s.updated_at, s.queued_at, s.started_at) DESC NULLS LAST
  LOOP
    IF r.status <> 'absente' THEN CONTINUE; END IF;
    -- (01/10, après mise en service) « accès Opla non accordé » n'est pas un
    -- « pas connecté » : c'est l'autorisation à donner dans l'extension, un
    -- geste ; un relevé reposé ne peut rien y changer (et reste en file quand
    -- le poste n'a pas l'accès). handler-watch le reprend à l'autorisation.
    IF COALESCE(r.erreur, '') ~* 'opla non accord' THEN
      v_out := v_out || jsonb_build_object(r.platform, 'autorisation_opla'); CONTINUE;
    END IF;
    IF plateforme_ecartee_pour(p_user, r.platform) THEN
      v_out := v_out || jsonb_build_object(r.platform, 'ecartee'); CONTINUE;
    END IF;
    IF NOT ((v_decl ? r.platform) OR releve_compte_avait_annonces(p_user, r.platform)) THEN
      v_out := v_out || jsonb_build_object(r.platform, 'non_declaree_sans_annonce'); CONTINUE;
    END IF;
    IF r.fin IS NOT NULL AND r.fin > now() - interval '8 hours' THEN
      v_out := v_out || jsonb_build_object(r.platform, 'attente_8h'); CONTINUE;
    END IF;
    SELECT count(*) INTO v_n FROM vinted_sync_runs s
     WHERE s.user_id = p_user AND s.kind = 'annonces' AND s.platform = r.platform
       AND s.declencheur LIKE 'serveur:reprise_absente%' AND s.queued_at > now() - interval '24 hours';
    IF v_n >= 3 THEN
      v_out := v_out || jsonb_build_object(r.platform, 'plafond_24h'); CONTINUE;
    END IF;
    IF p_simulation THEN
      v_out := v_out || jsonb_build_object(r.platform, 'a_reprendre'); CONTINUE;
    END IF;
    BEGIN
      INSERT INTO vinted_sync_runs (user_id, kind, platform, status, declencheur, queued_at)
      VALUES (p_user, 'annonces', r.platform, 'queued', 'serveur:reprise_absente', now())
      RETURNING id INTO v_id;
      v_out := v_out || jsonb_build_object(r.platform, 'queued');
    EXCEPTION
      WHEN unique_violation THEN v_out := v_out || jsonb_build_object(r.platform, 'deja_en_file');
      WHEN raise_exception THEN v_out := v_out || jsonb_build_object(r.platform, 'refuse_par_garde');
    END;
  END LOOP;
  RETURN jsonb_build_object('ok', true, 'plateformes', v_out);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.rapprocher_releve(p_run_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_run vinted_sync_runs%ROWTYPE;
  v_user uuid; v_pf text; v_vus text[];
  v_id uuid; v_res text;
  n_job integer := 0; n_auto integer := 0; n_prop integer := 0; n_disp integer := 0; n_aucune integer := 0;
  n_notif integer := 0; n_import integer := 0; n_refus integer := 0; n_restantes integer := 0; n_sautees integer := 0;
  v_complet boolean; v_import_ouvert boolean;
  v_debut timestamptz := clock_timestamp();
  v_budget interval := rapprocher_budget(0.7, interval '60 seconds');
  v_budget_epuise boolean := false;
  v_verdicts jsonb := NULL;
  v_questions jsonb;
  v_vide_non_probant boolean := false;
  v_dette_beebs boolean := false;
  n_retenues integer := 0;
BEGIN
  SELECT * INTO v_run FROM vinted_sync_runs WHERE id = p_run_id;
  IF v_run.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'run_introuvable'); END IF;
  IF auth.uid() IS NOT NULL AND auth.uid() <> v_run.user_id THEN RETURN jsonb_build_object('ok', false, 'reason', 'unauthorized'); END IF;
  v_user := v_run.user_id; v_pf := v_run.platform;
  IF v_pf NOT IN ('leboncoin', 'beebs', 'ebay', 'opla') THEN RETURN jsonb_build_object('ok', false, 'reason', 'plateforme'); END IF;
  SELECT COALESCE(array_agg(listing_id), ARRAY[]::text[]) INTO v_vus FROM annonces_plateforme WHERE run_id = p_run_id;
  v_complet := releve_preuve_absence(p_run_id);
  -- ⛔ HORS « MES ANNONCES » (2026-09-25 nuit) : la page lue n'était pas la
  --    liste du compte. Rien n'est traité, rien n'est daté, rien n'est tranché.
  IF releve_hors_liste(v_run.erreur) THEN
    RETURN jsonb_build_object('ok', true, 'run_id', p_run_id, 'platform', v_pf, 'hors_liste', true,
                              'relevees', COALESCE(array_length(v_vus, 1), 0), 'verdicts', NULL,
                              'par_job', 0, 'auto', 0, 'proposees', 0, 'sans_candidat', 0,
                              'importees', 0, 'import_refusees', 0, 'ecartees_notification', 0,
                              'restantes', 0, 'budget_epuise', false, 'sautees', 0,
                              'disparues', 0, 'complet', false, 'vide_non_probant', false);
  END IF;
  -- ── UN RELEVÉ VIDE N'EST JAMAIS UNE PREUVE (2026-09-24) ──────────────────
  -- Il n'a RIEN vu, sur un compte qui avait des annonces ici : ce n'est ni une
  -- preuve de disparition ni une preuve de vente. Pas de disparu_le, pas de
  -- verdict « refusée ». bertin.dr (24/09) : 238 annonces EN LIGNE datées
  -- disparues par un relevé à « 0 vue(s) sur 0 annoncée(s) ».
  -- ⛔ eBAY RELIÉ PAR L'API (2026-09-26) : le relevé ne traite QUE le compte
  --    relié. Chrome connecté à un autre compte, ou identité non prouvée :
  --    ni rattachement, ni import, ni disparition — et le run le dit.
  IF v_pf = 'ebay' AND releve_ebay_run_bloque(p_run_id) THEN
    PERFORM releve_ebay_noter_run(p_run_id);
    RETURN jsonb_build_object('ok', true, 'run_id', p_run_id, 'platform', v_pf, 'hors_compte_ebay', true,
                              'relevees', COALESCE(array_length(v_vus, 1), 0), 'verdicts', NULL,
                              'par_job', 0, 'auto', 0, 'proposees', 0, 'sans_candidat', 0,
                              'importees', 0, 'import_refusees', 0, 'ecartees_notification', 0,
                              'restantes', 0, 'budget_epuise', false, 'sautees', 0,
                              'disparues', 0, 'complet', false, 'vide_non_probant', false);
  END IF;
  -- Identité prouvée, mais des annonces encore inconnues ont été laissées de
  -- côté : ce relevé n'a pas tout écrit, il ne date aucune disparition.
  IF v_pf = 'ebay' AND releve_ebay_run_incomplet(p_run_id) THEN
    v_complet := false;
  END IF;
  IF v_complet AND COALESCE(array_length(v_vus, 1), 0) = 0
     AND releve_compte_avait_annonces(v_user, v_pf) THEN
    v_complet := false;
    v_vide_non_probant := true;
  END IF;
  -- L'interrupteur, FAIL-CLOSED : absent, illisible ou différent de 1 => aucun import.
  v_import_ouvert := COALESCE((SELECT value FROM coin_config WHERE key = 'import_auto_ouvert'), 0) = 1;

  -- retenue_silencieuse_beebs (29/09 soir) : périmètre de la garde
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
  n_prop := COALESCE((v_questions->>'questions_posees')::integer,0);

  FOR v_id IN
    SELECT a.id FROM annonces_plateforme a
    WHERE a.run_id = p_run_id AND a.user_id = v_user AND a.platform = v_pf
      AND a.inventaire_id IS NULL AND a.ignoree_le IS NULL
      -- Déjà traitée pour CE run (appel précédent arrêté au budget, puis
      -- rappel de l'extension) : on ne la rejoue pas, on avance.
      AND NOT EXISTS (SELECT 1 FROM rapprochements r WHERE r.annonce_id = a.id AND r.detail ->> 'run_id' = p_run_id::text)
    -- Les annonces les MOINS évaluées d'abord : si un relevé précédent s'est
    -- arrêté au budget, sa queue passe devant. Au premier relevé tout est à 0
    -- et l'ordre est celui de toujours (vu_le).
    ORDER BY (SELECT count(*) FROM rapprochements r WHERE r.annonce_id = a.id), a.vu_le
  LOOP
    IF v_budget_epuise OR clock_timestamp() - v_debut > v_budget THEN
      v_budget_epuise := true; n_restantes := n_restantes + 1; CONTINUE;
    END IF;
    -- p_second_releve_requis := false (2026-09-24) : on importe TOUT ce qui est
    -- en ligne et sans candidat dès ce relevé, on rattache ensuite. La règle
    -- du « deuxième relevé » (18/09) laissait un inscrit sans stock jusqu'au
    -- prochain passage — 20 h, ou un clic (laura.rml38, labouquinerie85).
    -- depot_beebs_sans_identifiant_reste_proposition (29/09) : tant
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
    END IF;
    CASE v_res
      WHEN 'job'           THEN n_job := n_job + 1;
      WHEN 'certain'       THEN n_auto := n_auto + 1;
      WHEN 'propose'       THEN n_prop := n_prop + 1;
      WHEN 'notification'  THEN n_notif := n_notif + 1;
      WHEN 'aucune'        THEN n_aucune := n_aucune + 1;
      WHEN 'import_propose' THEN n_prop := n_prop + 1; n_import := n_import + 1;
      WHEN 'import'        THEN n_aucune := n_aucune + 1; n_import := n_import + 1;
      WHEN 'import_refuse' THEN n_aucune := n_aucune + 1; n_refus := n_refus + 1;
      ELSE n_sautees := n_sautees + 1;
    END CASE;
  END LOOP;

  IF v_complet THEN
    n_disp := COALESCE((constater_absences_releve(p_run_id)->>'disparues')::integer,0);
  END IF;

  -- ── LE RELEVÉ TRANCHE LES PUBLICATIONS SANS LIEN (2026-09-23 soir) ─────────
  -- Un dépôt 'published' sans lien mais AVEC identifiant ne pouvait plus jamais
  -- être clos (balayage de nuit : « un job qui porte son identifiant n'est
  -- jamais "sans lien" »). Or ce relevé-ci, quand il est COMPLET, est la preuve
  -- qui manquait : l'annonce y est (EN LIGNE, lien posé) ou n'y est pas
  -- (REFUSÉE à la vérification, ou retirée). Jamais bloquant pour le relevé.
  IF v_complet THEN
    BEGIN
      v_verdicts := trancher_publications_sans_lien(v_user, v_pf, p_run_id);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'trancher_publications_sans_lien(%) : %', p_run_id, SQLERRM;
      v_verdicts := jsonb_build_object('ok', false, 'erreur', SQLERRM);
    END;
  END IF;

  RETURN jsonb_build_object('ok', true, 'run_id', p_run_id, 'platform', v_pf, 'relevees', COALESCE(array_length(v_vus, 1), 0),
                            'verdicts', v_verdicts,
                            'par_job', n_job, 'auto', n_auto, 'proposees', n_prop, 'sans_candidat', n_aucune,
                            'importees', n_import, 'import_refusees', n_refus,
                            'ecartees_notification', n_notif,
                            'restantes', n_restantes, 'budget_epuise', v_budget_epuise, 'sautees', n_sautees,
                            'disparues', n_disp, 'complet', v_complet,
                            'vide_non_probant', v_vide_non_probant,
                            'retenues_beebs', n_retenues);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.inventaire_ecarte_import_sync()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_motif text;
begin
  -- Ne concerne QUE les lignes ecrites par la sync dressing.
  -- La saisie manuelle (origine NULL) n'est JAMAIS touchee : 1 074 articles
  -- manuels sans photo chez 239 comptes, c'est du stock legitime.
  if coalesce(new.origine,'') <> 'vinted_sync' then
    return new;
  end if;

  -- Le contrôle précède aussi l'upsert : une ligne historique étrangère
  -- n'autorise pas un nouveau relevé. Lecture du profil par sa clé primaire.
  if not boutique_vinted_confirmee(new.user_id,new.vinted_account_id) then
    raise exception '[boutique_a_confirmer] Cette boutique Vinted n’est pas confirmée sur ton compte FillSell. Confirme-la dans « Actualiser mon dressing » si elle t’appartient. Aucun article n’a été importé.';
  end if;
  if TG_OP='UPDATE' then return new; end if;

  -- INSERT PUR UNIQUEMENT (28/08, resserrage).
  -- En PostgreSQL un BEFORE INSERT tire AVANT la resolution du ON CONFLICT :
  -- un RETURN NULL annulerait aussi le DO UPDATE de l'upsert de la sync, et
  -- figerait la ligne existante (vues, favoris, prix, statut) pour toujours.
  -- Si l'article existe deja, on laisse passer : la derive draft/hidden se
  -- traite a l'affichage, pas en gelant la donnee.
  if exists (
    select 1 from inventaire i
    where i.user_id = new.user_id
      and i.vinted_item_id is not distinct from new.vinted_item_id
  ) then
    return new;
  end if;

  if new.vinted_status = 'draft' then
    v_motif := 'brouillon';
  elsif new.photos is null
     or jsonb_typeof(new.photos) <> 'array'
     or jsonb_array_length(new.photos) = 0 then
    v_motif := 'sans_photo';
  else
    return new;
  end if;

  insert into sync_import_ecartes (user_id, vinted_item_id, vinted_status, titre, motif)
  values (new.user_id, new.vinted_item_id, new.vinted_status, left(coalesce(new.titre,''),120), v_motif);

  return null;
end;
$function$
;

DROP TRIGGER IF EXISTS profiles_premiers_releves_trg ON public.profiles;
CREATE TRIGGER profiles_premiers_releves_trg AFTER UPDATE OF extension_last_seen_at, extension_sessions, platform_settings ON public.profiles FOR EACH ROW WHEN (((new.extension_last_seen_at IS NOT NULL) AND ((old.extension_last_seen_at IS NULL) OR (old.extension_sessions IS DISTINCT FROM new.extension_sessions) OR (old.platform_settings IS DISTINCT FROM new.platform_settings)))) EXECUTE FUNCTION profiles_premiers_releves_trg_fn();

DROP TRIGGER IF EXISTS releve_incomplet_reprise ON public.vinted_sync_runs;
CREATE TRIGGER releve_incomplet_reprise AFTER UPDATE OF status ON public.vinted_sync_runs FOR EACH ROW WHEN (((new.kind = 'annonces'::text) AND (old.status = 'running'::text) AND (new.status = ANY (ARRAY['done'::text, 'failed'::text, 'expired'::text])) AND (new.platform = ANY (ARRAY['leboncoin'::text, 'beebs'::text, 'ebay'::text, 'opla'::text])))) EXECUTE FUNCTION releve_incomplet_reprise();


-- Les deux aides ne servent plus à rien une fois les définitions d'avant remises.
DROP FUNCTION IF EXISTS public.releve_est_geste(text);
DROP FUNCTION IF EXISTS public.releve_est_veille(text);

COMMIT;
