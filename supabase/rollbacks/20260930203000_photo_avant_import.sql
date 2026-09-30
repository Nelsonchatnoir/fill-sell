-- Inverse de 20260930203000_photo_avant_import.sql : corps relus en prod (pg_get_functiondef) le 30/09 avant application.
SET lock_timeout = '3s';
SELECT cron.unschedule('fusion-photo-1min') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'fusion-photo-1min');
CREATE OR REPLACE FUNCTION public.rapprocher_traiter_annonce(p_annonce_id uuid, p_vus text[], p_import_ouvert boolean, p_rattrapage boolean DEFAULT false, p_second_releve_requis boolean DEFAULT true)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  a annonces_plateforme%ROWTYPE;
  v_user uuid; v_pf text; v_run uuid; v_trace jsonb;
  v_cl jsonb; v_bande text; v_job uuid; v_inv bigint; v_imp jsonb;
BEGIN
  -- Verrou de ligne : le relevé de l'extension et un rattrapage ne peuvent
  -- pas traiter la même annonce en même temps ; le second la trouve traitée.
  SELECT * INTO a FROM annonces_plateforme WHERE id = p_annonce_id FOR UPDATE;
  IF a.id IS NULL THEN RETURN 'introuvable'; END IF;
  IF a.inventaire_id IS NOT NULL OR a.ignoree_le IS NOT NULL THEN RETURN 'deja_traitee'; END IF;
  -- ⛔ HORS « MES ANNONCES » (2026-09-25 nuit) : lue par un relevé dont la
  --    page n'était pas la liste du compte — ni import, ni rattachement.
  IF releve_run_hors_liste(a.run_id) THEN RETURN 'hors_liste'; END IF;
  v_user := a.user_id; v_pf := a.platform; v_run := a.run_id;
  v_trace := jsonb_build_object('run_id', v_run)
             || CASE WHEN p_rattrapage THEN jsonb_build_object('rattrapage', true) ELSE '{}'::jsonb END;

  -- ── UNE NOTIFICATION N'EST PAS UNE ANNONCE (2026-09-19) — mot pour mot ──
  IF annonce_lien_notification(a.url) THEN
    UPDATE annonces_plateforme SET ignoree_le = now(), proposition = NULL, updated_at = now() WHERE id = a.id;
    INSERT INTO rapprochements (user_id, annonce_id, inventaire_id, decision, par, score, detail)
    VALUES (v_user, a.id, NULL, 'ignore', 'auto', 0,
            v_trace || jsonb_build_object('motif', 'notification_plateforme', 'platform', v_pf, 'titre', a.titre,
                                          'ni_nt', substring(a.url from 'ni_nt(?:%3A|%3a|:|=)([A-Za-z0-9_]+)')));
    RETURN 'notification';
  END IF;

  v_cl := rapprocher_classer(v_user, v_pf, a.listing_id, a.url, a.titre, a.prix, p_vus);
  v_bande := v_cl ->> 'bande';
  v_job := NULLIF(v_cl ->> 'job_id', '')::uuid;
  v_inv := NULLIF(v_cl ->> 'inventaire_id', '')::bigint;

  -- ── JOB : l'identifiant est un dépôt FillSell ───────────────────────────
  IF v_bande = 'job' THEN
    UPDATE annonces_plateforme SET inventaire_id = v_inv, job_id = v_job, source_rapprochement = 'job', proposition = NULL, updated_at = now() WHERE id = a.id;
    INSERT INTO rapprochements (user_id, annonce_id, inventaire_id, decision, par, score, detail)
    VALUES (v_user, a.id, v_inv, 'attache', 'job', 1, v_trace || jsonb_build_object('job_id', v_job));
    IF a.statut_plateforme = 'en_ligne' THEN
      UPDATE cross_post_jobs
         SET platform_fields = (platform_fields - ARRAY['unavailable_since', 'unavailable_pending_since', 'sale_signal', 'detected_price', 'alerte_masquee_pour', 'alerte_masquee_le'])
                               || jsonb_build_object('revue_en_ligne_par_releve', jsonb_build_object('run_id', v_run, 'at', now()))
       WHERE id = v_job AND (platform_fields ? 'unavailable_since' OR platform_fields ? 'unavailable_pending_since');
    END IF;
    RETURN 'job';
  END IF;

  -- ── JOB CLOS (2026-09-25) : l'identifiant est un dépôt FillSell annulé/vendu ──
  -- On RATTACHE à la fiche d'origine, jamais d'import. Le dépôt clos garde son
  -- histoire ; un job de suivi porte l'annonce vivante. Le STATUT de la fiche
  -- n'est jamais basculé ici (une vente en main propre a la même trace qu'un
  -- faux « vendu » : c'est la personne qui tranche) :
  --   · fiche 'vendu' → le job de suivi part 'cancelled' + pending_removal :
  --     le bandeau EXISTANT « Vendu — encore en ligne sur X, retirer ? » ;
  --   · fiche en stock → job de suivi 'published', comme un rattachement normal.
  IF v_bande = 'job_clos' THEN
    v_job := rapprocher_job_de_suivi(v_user, v_pf, v_inv, a.titre, a.prix, a.url, a.listing_id, 'auto',
               v_trace || jsonb_build_object('annonce_id', a.id, 'motif', 'identifiant_depot_clos',
                                             'depot_clos', v_cl ->> 'job_id', 'statut_fiche', v_cl ->> 'statut_fiche'));
    IF (v_cl ->> 'statut_fiche') = 'vendu' THEN
      UPDATE cross_post_jobs
         SET status = 'cancelled',
             platform_fields = platform_fields || jsonb_build_object('pending_removal', true,
                               'vendu_encore_en_ligne', jsonb_build_object('run_id', v_run, 'at', now()))
       WHERE id = v_job;
    END IF;
    UPDATE annonces_plateforme SET inventaire_id = v_inv, job_id = v_job, source_rapprochement = 'job', proposition = NULL, updated_at = now() WHERE id = a.id;
    INSERT INTO rapprochements (user_id, annonce_id, inventaire_id, decision, par, score, detail)
    VALUES (v_user, a.id, v_inv, 'attache', 'job', 1,
            v_trace || jsonb_build_object('job_id', v_job, 'motif', 'identifiant_depot_clos',
                                          'depot_clos', v_cl ->> 'job_id', 'statut_fiche', v_cl ->> 'statut_fiche'));
    RETURN 'job';
  END IF;

  IF v_bande = 'certain' THEN v_bande := 'propose'; END IF;

  -- ── PROPOSE : rien sur les jobs, la proposition vit sur l'annonce ───────
  IF v_bande = 'propose' THEN
    -- (2026-09-27, audit synchro) Une annonce EN LIGNE n'attend plus une
    -- réponse HORS du stock : elle est importée plus bas, et la proposition
    -- devient une QUESTION posée sur la fiche importée (« Est-ce le même
    -- article ? »). Le rattrapage ne s'arrête sur « inchangée » que si
    -- l'import est impossible (interrupteur fermé, annonce pas en ligne,
    -- fiche supprimée exprès par la personne).
    IF p_rattrapage AND a.proposition IS NOT NULL
       AND NOT (p_import_ouvert AND a.statut_plateforme = 'en_ligne' AND a.fiche_supprimee_le IS NULL)
       AND (a.proposition ->> 'inventaire_id') IS NOT DISTINCT FROM v_inv::text
       AND (a.proposition ->> 'motif') IS NOT DISTINCT FROM (v_cl ->> 'motif') THEN
      RETURN 'propose_inchangee';
    END IF;
    UPDATE annonces_plateforme
       SET proposition = jsonb_build_object('inventaire_id', v_inv, 'job_id', v_job, 'motif', v_cl ->> 'motif', 'score', v_cl -> 'score',
                                            'candidats', COALESCE(v_cl -> 'candidats', '[]'::jsonb),
                                            'candidats_total', v_cl -> 'candidats_total',
                                            'signaux', v_cl -> 'signaux',
                                            'choix_arbitraire', v_cl -> 'choix_arbitraire',
                                            'run_id', v_run, 'at', now()),
           updated_at = now()
     WHERE id = a.id;
    INSERT INTO rapprochements (user_id, annonce_id, inventaire_id, decision, par, score, detail)
    VALUES (v_user, a.id, v_inv, 'propose', 'auto', (v_cl ->> 'score')::numeric, v_trace || jsonb_build_object('job_id', v_job, 'motif', v_cl ->> 'motif'));
    -- (2026-09-27) TOUTE annonce en ligne entre dans le stock : la ressemblance
    -- (titre, prix) ne rattache pas, elle se DEMANDE. rapprocher_importer lit la
    -- proposition posée ci-dessus et en fait la question de la fiche importée.
    IF p_import_ouvert AND a.statut_plateforme = 'en_ligne' AND a.fiche_supprimee_le IS NULL THEN
      v_imp := rapprocher_importer(v_user, a.id, 'auto');
      IF COALESCE((v_imp ->> 'ok')::boolean, false) THEN
      RETURN CASE WHEN v_imp ? 'question' THEN 'import_propose' ELSE 'import' END;
    END IF;
    END IF;
    RETURN 'propose';
  END IF;

  -- ── AUCUN CANDIDAT ──────────────────────────────────────────────────────
  IF NOT p_rattrapage THEN
    INSERT INTO rapprochements (user_id, annonce_id, inventaire_id, decision, par, score, detail)
    VALUES (v_user, a.id, NULL, 'aucune', 'auto', 0,
            v_trace || jsonb_build_object('motif', COALESCE(v_cl ->> 'motif', 'aucun_candidat'), 'platform', v_pf, 'titre', a.titre, 'prix', a.prix));
  END IF;
  -- IMPORT AUTOMATIQUE (point F, 18/09) — les trois conditions, ici.
  IF p_import_ouvert AND a.statut_plateforme = 'en_ligne'
     AND (NOT p_second_releve_requis
          OR EXISTS (SELECT 1 FROM rapprochements r
                      WHERE r.annonce_id = a.id AND r.decision = 'aucune'
                        AND COALESCE(r.detail ->> 'run_id', '') <> COALESCE(v_run::text, '')))
     -- ⛔ 2026-09-24 — QUATRIÈME CONDITION, PRÉCISE : jamais ressusciter une
     --    fiche que le vendeur a SUPPRIMÉE en gardant l'annonce en ligne
     --    (inventaire_supprimer_sans_retrait pose fiche_supprimee_le). C'est CE
     --    marqueur qui coupe la boucle de Louis — pas « déjà importée une fois »
     --    (23/09), qui bloquait aussi une annonce dont la fiche avait disparu
     --    par un autre chemin. Règle : tout ce qui est en ligne et absent du
     --    stock devient un article. Un rattachement ou un import MANUEL efface
     --    le marqueur (rapprochement_decider, rapprocher_importer).
     AND a.fiche_supprimee_le IS NULL
  THEN
    v_imp := rapprocher_importer(v_user, a.id, 'auto');
    IF COALESCE((v_imp ->> 'ok')::boolean, false) THEN
      RETURN CASE WHEN v_imp ? 'question' THEN 'import_propose' ELSE 'import' END;
    END IF;
    IF v_imp ->> 'reason' = 'jumeau_probable' THEN RETURN 'import_refuse'; END IF;
  END IF;
  RETURN 'aucune';
END;
$function$;


CREATE OR REPLACE FUNCTION public.retrait_job_prouve(p_job uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT COALESCE((
    SELECT NOT EXISTS (
             SELECT 1 FROM inventaire_fusions f
              WHERE f.defait_le IS NULL AND COALESCE(f.par, '') NOT LIKE 'utilisateur%'
                AND jsonb_typeof(f.deplacements -> 'cross_post_jobs') = 'array'
                AND (f.deplacements -> 'cross_post_jobs') ? j.id::text)
       AND (COALESCE(j.platform_fields #>> '{rattachement,par}', '') IN ('', 'utilisateur')
            OR COALESCE(j.platform_fields #>> '{rattachement,motif}', '') = 'identifiant_depot_clos'
            OR COALESCE(j.platform_fields #>> '{rattachement,import}', '') = 'true')
       AND (COALESCE(j.platform_fields ->> 'source', '') <> 'releve'
            OR COALESCE(j.platform_fields #>> '{rattachement,par}', '') = 'utilisateur'
            OR COALESCE(j.platform_fields #>> '{rattachement,motif}', '') = 'identifiant_depot_clos'
            OR COALESCE(j.platform_fields #>> '{rattachement,import}', '') = 'true')
      FROM cross_post_jobs j WHERE j.id = p_job), false);
$function$;


CREATE OR REPLACE FUNCTION public.fusion_photo_candidates(p_user uuid, p_depuis timestamp with time zone)
 RETURNS TABLE(ida bigint, idb bigint, meme_pf boolean, sans_pf boolean, isolee boolean, a_x boolean, b_x boolean, x_ok boolean, eval jsonb, job_en_cours boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH f AS (
    SELECT i.id, (p_depuis IS NULL OR i.created_at >= p_depuis
                  OR EXISTS (SELECT 1 FROM annonces_plateforme a WHERE a.inventaire_id = i.id AND a.updated_at >= p_depuis)) touchee,
           (fiche_photos_urls(i.photos, 1))[1] url
      FROM inventaire i WHERE i.user_id = p_user AND i.statut = 'stock' AND i.fusionne_dans IS NULL),
  fe AS (
    SELECT f.id, f.touchee, e.dhash::bit(64) d, e.phash::bit(64) p,
           ARRAY(SELECT DISTINCT x FROM (
             SELECT CASE WHEN i.vinted_item_id IS NOT NULL OR i.origine = 'vinted_sync' THEN 'vinted' END x FROM inventaire i WHERE i.id = f.id
             UNION ALL SELECT CASE WHEN i.origine LIKE 'releve\_%' THEN substr(i.origine, 8) END FROM inventaire i WHERE i.id = f.id
             UNION ALL SELECT a.platform FROM annonces_plateforme a WHERE a.inventaire_id = f.id
             UNION ALL SELECT j.platform FROM cross_post_jobs j WHERE j.inventaire_id = f.id AND j.status = 'published' AND j.action IN ('publish', 'republish')
           ) z WHERE x IS NOT NULL) pf
      FROM f JOIN photo_empreintes e ON e.url = f.url),
  paires AS (
    SELECT a.id ida, b.id idb, a.d da, a.p pa, b.d db, b.p pb, (a.pf && b.pf) meme_pf,
           cardinality(a.pf) = 0 OR cardinality(b.pf) = 0 sans_pf
      FROM fe a JOIN fe b ON a.id < b.id
     WHERE bit_count(a.d # b.d) <= 5 AND bit_count(a.p # b.p) <= 8
       AND (a.touchee OR b.touchee)),
  deg AS (
    SELECT g.id, count(*) n FROM fe g JOIN fe h ON h.id <> g.id
     WHERE g.id IN (SELECT ida FROM paires UNION SELECT idb FROM paires)
       AND bit_count(g.d # h.d) <= 5 AND bit_count(g.p # h.p) <= 8
     GROUP BY g.id),
  cl AS (
    SELECT p.*, (SELECT n FROM deg WHERE deg.id = p.ida) = 1 AND (SELECT n FROM deg WHERE deg.id = p.idb) = 1 isolee FROM paires p),
  xa AS (
    SELECT cl.ida, cl.idb, e.dhash::bit(64) d, e.phash::bit(64) p FROM cl
      CROSS JOIN LATERAL unnest(fiche_photos_toutes(cl.ida)) x(url) JOIN photo_empreintes e ON e.url = x.url
     WHERE cl.isolee AND NOT cl.meme_pf AND NOT cl.sans_pf
       AND NOT (bit_count(e.dhash::bit(64) # cl.da) <= 5 AND bit_count(e.phash::bit(64) # cl.pa) <= 8)),
  xb AS (
    SELECT cl.ida, cl.idb, e.dhash::bit(64) d, e.phash::bit(64) p FROM cl
      CROSS JOIN LATERAL unnest(fiche_photos_toutes(cl.idb)) x(url) JOIN photo_empreintes e ON e.url = x.url
     WHERE cl.isolee AND NOT cl.meme_pf AND NOT cl.sans_pf
       AND NOT (bit_count(e.dhash::bit(64) # cl.db) <= 5 AND bit_count(e.phash::bit(64) # cl.pb) <= 8))
  SELECT cl.ida, cl.idb, cl.meme_pf, cl.sans_pf, cl.isolee,
         EXISTS (SELECT 1 FROM xa WHERE xa.ida = cl.ida AND xa.idb = cl.idb),
         EXISTS (SELECT 1 FROM xb WHERE xb.ida = cl.ida AND xb.idb = cl.idb),
         EXISTS (SELECT 1 FROM xa JOIN xb ON xa.ida = xb.ida AND xa.idb = xb.idb
                  WHERE xa.ida = cl.ida AND xa.idb = cl.idb AND bit_count(xa.d # xb.d) <= 5 AND bit_count(xa.p # xb.p) <= 8),
         CASE WHEN cl.isolee AND NOT cl.meme_pf AND NOT cl.sans_pf THEN inventaire_doublon_evaluer(cl.ida, cl.idb) END,
         EXISTS (SELECT 1 FROM cross_post_jobs jj WHERE jj.inventaire_id IN (cl.ida, cl.idb) AND jj.status IN ('pending', 'processing', 'needs_user'))
    FROM cl;
$function$;


CREATE OR REPLACE FUNCTION public.fusion_photo_tick()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  f fusion_photo_file%ROWTYPE; v_urls text[]; n_appels integer := 0; r jsonb; n_lot integer;
  c_url constant text := 'https://tojihnuawsoohlolangc.supabase.co/functions/v1/empreintes-urls';
  -- ⚠️ secret de cron en clair : même clé que les autres crons (chantier rotation, CLAUDE.md)
  c_headers constant jsonb := '{"Content-Type":"application/json","x-cron-secret":"fs-cron-2026-tunnel"}'::jsonb;
BEGIN
  -- Les demandes déposées par les synchros entrent dans la file (une ligne
  -- par compte ; « depuis » garde la plus ancienne tant que le travail n'est pas fini).
  WITH d AS (DELETE FROM fusion_photo_demandes RETURNING user_id, depuis, cree_le)
  INSERT INTO fusion_photo_file AS fp (user_id, depuis, demande_le, etat, passages)
  SELECT d.user_id, min(d.depuis), max(d.cree_le), 'a_faire', 0 FROM d
   WHERE EXISTS (SELECT 1 FROM auth.users u WHERE u.id = d.user_id)
   GROUP BY d.user_id
  ON CONFLICT (user_id) DO UPDATE
     SET depuis = CASE WHEN fp.etat = 'a_faire' THEN LEAST(fp.depuis, EXCLUDED.depuis) ELSE EXCLUDED.depuis END,
         demande_le = EXCLUDED.demande_le,
         passages = CASE WHEN fp.etat = 'a_faire' THEN fp.passages ELSE 0 END,
         etat = 'a_faire';

  SELECT * INTO f FROM fusion_photo_file fp
   WHERE fp.etat = 'a_faire'
     AND NOT fusion_photo_synchro_en_cours(fp.user_id)
     AND (fp.dernier_passage IS NULL OR fp.dernier_passage < now() - interval '45 seconds')
   ORDER BY fp.dernier_passage NULLS FIRST, fp.demande_le   -- tourniquet : un gros compte ne prend pas tous les passages
   LIMIT 1;
  IF f.user_id IS NULL THEN RETURN jsonb_build_object('issue', 'rien'); END IF;

  UPDATE fusion_photo_file SET passages = passages + 1, dernier_passage = now() WHERE user_id = f.user_id;
  IF f.passages >= 90 THEN
    UPDATE fusion_photo_file SET etat = 'abandonne', bilan = COALESCE(bilan, '{}'::jsonb) || jsonb_build_object('abandonne_le', now()) WHERE user_id = f.user_id;
    RETURN jsonb_build_object('issue', 'abandonne', 'user', f.user_id);
  END IF;

  -- a) couvertures manquantes de TOUT le stock du compte (l'unicité 1 ↔ 1 se juge sur tout le stock)
  SELECT array_agg(url) INTO v_urls FROM (
    SELECT DISTINCT (fiche_photos_urls(i.photos, 1))[1] url FROM inventaire i
     WHERE i.user_id = f.user_id AND i.statut = 'stock' AND i.fusionne_dans IS NULL) z
   WHERE url IS NOT NULL AND url NOT LIKE 'https://d2f61lx5s6m7uh.cloudfront.net/%'
     AND NOT EXISTS (SELECT 1 FROM photo_empreintes e WHERE e.url = z.url)
     AND NOT EXISTS (SELECT 1 FROM photo_empreintes_echecs e WHERE e.url = z.url);
  -- b) sinon, autres photos des paires candidates
  IF v_urls IS NULL THEN
    SELECT array_agg(DISTINCT u) INTO v_urls FROM fusion_photo_candidates(f.user_id, f.depuis) c
      CROSS JOIN LATERAL unnest(fiche_photos_toutes(c.ida) || fiche_photos_toutes(c.idb)) u
     WHERE c.isolee AND NOT c.meme_pf AND NOT c.sans_pf
       AND u NOT LIKE 'https://d2f61lx5s6m7uh.cloudfront.net/%'
       AND NOT EXISTS (SELECT 1 FROM photo_empreintes e WHERE e.url = u)
       AND NOT EXISTS (SELECT 1 FROM photo_empreintes_echecs e WHERE e.url = u);
  END IF;
  -- (au-delà de 60 passages d'empreintes, on regroupe avec ce qui est lu :
  --  une photo illisible ne gèle pas le compte)
  IF v_urls IS NOT NULL AND f.passages < 60 THEN
    FOR n_lot IN 0 .. LEAST(5, (array_length(v_urls, 1) - 1) / 4) LOOP
      PERFORM net.http_post(url := c_url, body := jsonb_build_object('urls', to_jsonb(v_urls[n_lot * 4 + 1 : n_lot * 4 + 4])),
                            headers := c_headers, timeout_milliseconds := 60000);
      n_appels := n_appels + 1;
    END LOOP;
    UPDATE fusion_photo_file SET bilan = COALESCE(bilan, '{}'::jsonb) || jsonb_build_object('photos_manquantes', array_length(v_urls, 1))
     WHERE user_id = f.user_id;
    RETURN jsonb_build_object('issue', 'empreintes', 'user', f.user_id, 'photos_manquantes', array_length(v_urls, 1), 'appels', n_appels);
  END IF;

  -- c) fusions
  r := fusion_photo_compte(f.user_id, f.depuis, 20, 'utilisateur:photo_auto');
  UPDATE fusion_photo_file
     SET fusions = fusions + COALESCE((r ->> 'fusions')::int, 0),
         bilan = COALESCE(bilan, '{}'::jsonb) || jsonb_build_object('dernier', r),
         etat = CASE WHEN COALESCE((r ->> 'ok')::boolean, false) AND COALESCE((r ->> 'restantes')::int, 0) = 0 THEN 'termine' ELSE etat END
   WHERE user_id = f.user_id;
  RETURN jsonb_build_object('issue', 'fusions', 'user', f.user_id, 'resultat', r);
END $function$;


DROP FUNCTION IF EXISTS public.rapprochement_photo_decisions(uuid, uuid[]);
DROP FUNCTION IF EXISTS public.releve_dette_beebs(uuid);
-- Les annonces encore en attente reprennent le chemin d'avant au prochain relevé.
DROP TABLE IF EXISTS public.rapprochement_photo_attente;
REVOKE ALL ON FUNCTION public.fusion_photo_tick() FROM PUBLIC, anon, authenticated; GRANT EXECUTE ON FUNCTION public.fusion_photo_tick() TO service_role;
