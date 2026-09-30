-- ═══════════════════════════════════════════════════════════════════════════
-- FUSION PAR LA PHOTO APRÈS CHAQUE SYNCHRO (30/09, décision de Nico)
-- ═══════════════════════════════════════════════════════════════════════════
-- « Plus aucun doublon visible, pour personne. » La photo est une preuve, le
-- titre jamais. Deux fiches EN STOCK du même compte sont regroupées en une
-- seule, sans question, quand TOUT est vrai :
--   · même photo de couverture (dHash ≤ 5 ET pHash ≤ 8) ;
--   · deux plateformes DIFFÉRENTES : aucune plateforme commune entre les deux
--     fiches (Vinted, relevé d'origine, annonces rattachées, dépôts publiés) —
--     deux annonces sur la même plateforme sont deux exemplaires (cas Louis) ;
--   · 1 ↔ 1 : chacune n'a qu'UNE jumelle photo dans tout le stock du compte ;
--   · pas contredite : si les deux ont d'autres photos, au moins une autre
--     photo est identique ;
--   · jamais une fiche vendue (statut 'stock' seulement), aucun job en cours
--     sur l'une ou l'autre, aucune synchro en cours sur le compte ;
--   · aucun frein du moteur (inventaire_doublon_evaluer : ventes, deux fiches
--     annonce, saisie manuelle, deux prix d'achat) ni refus passé de la personne.
-- Sinon : rien. La question « Est-ce le même article ? » ne reste que pour
-- ces cas-là (les questions qu'une fusion règle sont closes).
--
-- La fusion passe par inventaire_fusionner_pour (journal inventaire_fusions,
-- réversible par inventaire_defusionner) avec par = 'utilisateur:photo_auto' :
-- décision de Nico, une fusion par photo est PROUVÉE, retraits compris
-- (retrait_job_prouve lit par LIKE 'utilisateur%').
--
-- PAS DE BALAYAGE GLOBAL (doublons-balayage : 8 à 13 s). Seul le compte qui
-- vient de finir une synchro est examiné, et seules les paires où l'une des
-- fiches est nouvelle (ou son annonce modifiée) depuis le début de la
-- synchro. Mesuré le 30/09 (rejeu annulé) : recherche 0,2 à 0,7 s (Nadia 936
-- fiches, doriane 709, Pironneau 1 085) ; fusion ~60 ms, sauf la PREMIÈRE
-- d'une connexion, 1 à 5 s de mise en route (pas d'attente de verrou :
-- log_lock_waits n'a rien relevé). Chaque passage cron ouvre une connexion :
-- après 1,5 s aucune nouvelle fusion n'est commencée, la suite au passage
-- suivant — les deux fiches d'une fusion restent verrouillées au plus le
-- temps du passage.
--
-- Trois pièces :
--   1. fusion_photo_demandes (déposées par la synchro) → fusion_photo_file
--      (un compte à traiter, une ligne par compte, écrite par le seul passage) ;
--   2. trigger sur vinted_sync_runs : une synchro terminée (done) dépose une
--      demande — un INSERT simple, jamais d'attente, jamais d'erreur remontée ;
--   3. fusion_photo_tick() : UN compte par appel, borné :
--        a) photos de couverture manquantes → au plus 6 appels (24 photos) à
--           empreintes-urls, puis on revient au passage suivant ;
--        b) autres photos des paires candidates manquantes → idem ;
--        c) sinon fusion_photo_compte(…, 20 fusions au plus) ;
--        d) plus rien à faire → ligne close (etat 'termine', bilan gardé).
--      Appelée par cron (fichier séparé, activé seulement sur GO, après mesure).
-- ═══════════════════════════════════════════════════════════════════════════

-- Le trigger sur vinted_sync_runs prend un verrou court sur la table : on ne
-- l'attend jamais plus de 3 s (sinon la migration échoue et rien n'est posé).
SET lock_timeout = '3s';

-- La demande (écrite par la synchro) et l'état du travail (écrit par le seul
-- passage) sont deux tables : la synchro n'attend JAMAIS un verrou du passage
-- — un INSERT dans une table sans clé unique ne bloque sur rien.
CREATE TABLE IF NOT EXISTS public.fusion_photo_demandes (
  id      bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL,
  depuis  timestamptz NOT NULL,
  cree_le timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.fusion_photo_file (
  user_id        uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  depuis         timestamptz NOT NULL,
  demande_le     timestamptz NOT NULL DEFAULT now(),
  etat           text NOT NULL DEFAULT 'a_faire' CHECK (etat IN ('a_faire', 'termine', 'abandonne')),
  passages       integer NOT NULL DEFAULT 0,
  dernier_passage timestamptz,
  fusions        integer NOT NULL DEFAULT 0,
  bilan          jsonb
);
ALTER TABLE public.fusion_photo_demandes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fusion_photo_file ENABLE ROW LEVEL SECURITY;
-- (règle du dépôt : toute table publique reçoit le GRANT ; sans politique RLS,
--  un utilisateur n'en voit rien — ces tables ne servent qu'au serveur)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fusion_photo_demandes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fusion_photo_file TO authenticated;

-- ── 2. Une synchro terminée dépose une demande ─────────────────────────────
-- Jamais d'erreur remontée à la synchro : un échec ici est un avertissement.
CREATE OR REPLACE FUNCTION public.fusion_photo_file_apres_synchro()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $f$
BEGIN
  BEGIN
    INSERT INTO fusion_photo_demandes (user_id, depuis)
    VALUES (NEW.user_id, COALESCE(NEW.started_at, NEW.claimed_at, NEW.queued_at, now()) - interval '5 minutes');
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'fusion_photo_file_apres_synchro (%): %', NEW.id, SQLERRM;
  END;
  RETURN NULL;
END $f$;

DROP TRIGGER IF EXISTS fusion_photo_apres_synchro ON public.vinted_sync_runs;
CREATE TRIGGER fusion_photo_apres_synchro
  AFTER UPDATE OF status ON public.vinted_sync_runs
  FOR EACH ROW
  WHEN (NEW.status = 'done' AND OLD.status IS DISTINCT FROM 'done' AND NEW.kind IN ('dressing', 'annonces'))
  EXECUTE FUNCTION public.fusion_photo_file_apres_synchro();

-- ── Les candidates d'un compte (lecture seule) ─────────────────────────────
-- Paires photo où l'une des fiches est nouvelle depuis p_depuis, ou porte une
-- annonce modifiée depuis, avec tout ce qu'il faut pour trancher (l'unicité
-- 1 ↔ 1 se juge sur TOUT le stock). p_depuis NULL = tout le stock (rejeu).
CREATE OR REPLACE FUNCTION public.fusion_photo_candidates(p_user uuid, p_depuis timestamptz)
RETURNS TABLE (ida bigint, idb bigint, meme_pf boolean, sans_pf boolean, isolee boolean,
               a_x boolean, b_x boolean, x_ok boolean, eval jsonb, job_en_cours boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $f$
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
$f$;

-- ── Les fusions d'un compte (bornées) ──────────────────────────────────────
-- ── Une synchro est-elle en cours sur le compte ? ──────────────────────────
-- 'running' bloque toujours ; 'queued' bloque pendant 1 h (au-delà, c'est une
-- demande que l'extension n'a jamais prise — vu le 30/09 : des 'queued' de
-- plusieurs heures —, elle ne doit pas geler le compte pour toujours).
CREATE OR REPLACE FUNCTION public.fusion_photo_synchro_en_cours(p_user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $f$
  SELECT EXISTS (SELECT 1 FROM vinted_sync_runs s WHERE s.user_id = p_user
                   AND (s.status = 'running' OR (s.status = 'queued' AND COALESCE(s.queued_at, s.updated_at) > now() - interval '1 hour')));
$f$;

-- ── Pourquoi une paire est écartée (NULL = regroupable) ────────────────────
CREATE OR REPLACE FUNCTION public.fusion_photo_ecart(x jsonb)
RETURNS text LANGUAGE sql IMMUTABLE AS $f$
  SELECT CASE
    WHEN (x ->> 'meme_pf')::boolean THEN 'meme_plateforme'
    WHEN (x ->> 'sans_pf')::boolean THEN 'fiche_sans_plateforme'
    WHEN NOT (x ->> 'isolee')::boolean THEN 'ambigu_groupe'
    WHEN COALESCE(x -> 'eval' ->> 'motif', '') IN ('refuse_par_la_personne', 'deja_fusionnee', 'paire_invalide', 'deux_annonces_vinted') THEN x -> 'eval' ->> 'motif'
    WHEN NOT (x ->> 'x_ok')::boolean AND (x ->> 'a_x')::boolean AND (x ->> 'b_x')::boolean THEN 'autres_photos_differentes'
    WHEN jsonb_array_length(COALESCE(x -> 'eval' -> 'freins', '[]'::jsonb)) > 0 THEN 'frein_' || (x -> 'eval' -> 'freins' ->> 0)
    WHEN (x ->> 'job_en_cours')::boolean THEN 'job_en_cours'
  END;
$f$;

CREATE OR REPLACE FUNCTION public.fusion_photo_compte(p_user uuid, p_depuis timestamptz, p_limite integer DEFAULT 20,
                                                      p_par text DEFAULT 'utilisateur:photo_auto', p_budget_ms integer DEFAULT 1500)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $f$
DECLARE
  c record; r jsonb; v_cands jsonb; v_snap jsonb; v_fus uuid; fg inventaire%ROWTYPE; fa inventaire%ROWTYPE;
  v_garde bigint; v_abs bigint; k integer; v_gph jsonb; v_grap boolean; v_gph2 jsonb;
  n_ok integer := 0; n_ko integer := 0; n_q integer := 0; n_restantes integer := 0;
  v_ecartes jsonb; v_ko jsonb := '[]'::jsonb; t0 timestamptz := clock_timestamp(); t1 timestamptz;
  v_lecture_ms integer; v_fusions_ms jsonb := '[]'::jsonb;
  v_decide text := substr(p_par, length('utilisateur:') + 1);   -- 'photo_auto', ou le nom d'un lot passé à la main
BEGIN
  IF p_par IS NULL OR p_par NOT LIKE 'utilisateur:photo%' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'par_invalide');
  END IF;
  IF fusion_photo_synchro_en_cours(p_user) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'synchro_en_cours');
  END IF;
  SELECT COALESCE(jsonb_agg(to_jsonb(x)), '[]'::jsonb) INTO v_cands FROM fusion_photo_candidates(p_user, p_depuis) x;
  SELECT COALESCE(jsonb_object_agg(k2, n2), '{}'::jsonb) INTO v_ecartes FROM (
    SELECT fusion_photo_ecart(x) k2, count(*) n2 FROM jsonb_array_elements(v_cands) x GROUP BY 1) z WHERE k2 IS NOT NULL;
  v_lecture_ms := round(extract(epoch FROM clock_timestamp() - t0) * 1000);

  FOR c IN
    SELECT (x -> 'eval' ->> 'garde')::bigint garde, (x -> 'eval' ->> 'absorbe')::bigint absorbe
      FROM jsonb_array_elements(v_cands) x
     WHERE fusion_photo_ecart(x) IS NULL AND x -> 'eval' ->> 'garde' IS NOT NULL AND x -> 'eval' ->> 'absorbe' IS NOT NULL
     ORDER BY 1
  LOOP
    IF n_ok >= p_limite OR clock_timestamp() - t0 > make_interval(secs => p_budget_ms / 1000.0) THEN
      n_restantes := n_restantes + 1;
      CONTINUE;
    END IF;
    BEGIN
      v_garde := c.garde; v_abs := c.absorbe; t1 := clock_timestamp();
      SELECT * INTO fg FROM inventaire WHERE id = c.garde;
      SELECT * INTO fa FROM inventaire WHERE id = c.absorbe;
      IF fg.statut IS DISTINCT FROM 'stock' OR fa.statut IS DISTINCT FROM 'stock' OR fg.fusionne_dans IS NOT NULL OR fa.fusionne_dans IS NOT NULL THEN
        CONTINUE;
      END IF;
      -- L'absorbée porte l'identité Vinted vivante et la gardée n'en a pas :
      -- inventaire_fusionner_pour commencerait par vider cette identité, ce que
      -- inventaire_ecarte_import_sync refuse. On garde la fiche du dressing ;
      -- les freins sont revérifiés pour la nouvelle absorbée.
      IF fg.vinted_item_id IS NULL AND fa.vinted_item_id IS NOT NULL AND fa.disparu_le IS NULL THEN
        v_garde := c.absorbe; v_abs := c.garde;
        IF EXISTS (SELECT 1 FROM ventes v WHERE v.inventaire_id = v_abs)
           OR EXISTS (SELECT 1 FROM jsonb_each(CASE WHEN jsonb_typeof(fg.attributs) = 'object' THEN fg.attributs ELSE '{}'::jsonb END) e
                       WHERE jsonb_typeof(e.value) = 'object' AND e.value ->> 'source' = 'manuel') THEN
          v_ecartes := v_ecartes || jsonb_build_object('frein_apres_inversion', COALESCE((v_ecartes ->> 'frein_apres_inversion')::int, 0) + 1);
          CONTINUE;
        END IF;
      END IF;
      SELECT COALESCE(jsonb_agg(jsonb_build_object('id', id, 'source', source_rapprochement, 'proposition', proposition)), '[]'::jsonb)
        INTO v_snap FROM annonces_plateforme WHERE inventaire_id = v_abs AND user_id = p_user;
      SELECT photos, photos_a_rapatrier INTO v_gph, v_grap FROM inventaire WHERE id = v_garde;
      r := inventaire_fusionner_pour(p_user, v_garde, v_abs, p_par);
      IF NOT COALESCE((r ->> 'ok')::boolean, false) THEN
        n_ko := n_ko + 1; v_ko := v_ko || jsonb_build_array(jsonb_build_object('garde', v_garde, 'absorbe', v_abs, 'r', r));
        CONTINUE;
      END IF;
      v_fus := (r ->> 'fusion_id')::uuid;
      -- Photos de capture posées sur la gardée par annonce_capture_complete_fiche :
      -- écrites au journal pour qu'on puisse les rendre en défaisant.
      SELECT photos INTO v_gph2 FROM inventaire WHERE id = v_garde;
      IF v_gph2 IS DISTINCT FROM v_gph AND NOT (r -> 'champs_repris' ? 'photos') THEN
        UPDATE inventaire_fusions
           SET champs_repris = COALESCE(champs_repris, '{}'::jsonb)
                 || jsonb_build_object('photos', jsonb_build_object('avant', v_gph, 'apres', v_gph2), 'photos_a_rapatrier_avant', v_grap)
         WHERE id = v_fus;
      END IF;
      -- La fusion passe les annonces déplacées en 'manuel' (preuve de numéro pour
      -- beebs-lien) : on remet leur source et leur proposition d'avant.
      UPDATE annonces_plateforme ap
         SET source_rapprochement = s ->> 'source',
             proposition = CASE WHEN jsonb_typeof(s -> 'proposition') = 'null' THEN NULL ELSE s -> 'proposition' END
        FROM jsonb_array_elements(v_snap) s
       WHERE ap.id = (s ->> 'id')::uuid AND ap.user_id = p_user;
      -- Les questions que cette fusion règle se ferment.
      UPDATE inventaire_doublons SET statut = 'fusionnee', decide_le = now(), decide_par = v_decide, fusion_id = v_fus
       WHERE user_id = p_user AND statut = 'proposee'
         AND least(garde, absorbe) = least(c.garde, c.absorbe) AND greatest(garde, absorbe) = greatest(c.garde, c.absorbe);
      GET DIAGNOSTICS k = ROW_COUNT; n_q := n_q + k;
      UPDATE inventaire_doublons SET statut = 'caduque', decide_le = now(), decide_par = v_decide
       WHERE user_id = p_user AND statut = 'proposee' AND (garde = v_abs OR absorbe = v_abs);
      GET DIAGNOSTICS k = ROW_COUNT; n_q := n_q + k;
      n_ok := n_ok + 1;
      v_fusions_ms := v_fusions_ms || to_jsonb(round(extract(epoch FROM clock_timestamp() - t1) * 1000));
    EXCEPTION WHEN OTHERS THEN
      n_ko := n_ko + 1; v_ko := v_ko || jsonb_build_array(jsonb_build_object('garde', v_garde, 'absorbe', v_abs, 'err', left(SQLERRM, 160)));
    END;
  END LOOP;
  RETURN jsonb_build_object('ok', true, 'candidates', jsonb_array_length(v_cands), 'fusions', n_ok, 'restantes', n_restantes,
    'echecs', n_ko, 'questions_fermees', n_q, 'ecartes', v_ecartes,
    'duree_ms', round(extract(epoch FROM clock_timestamp() - t0) * 1000), 'lecture_ms', v_lecture_ms, 'fusions_ms', v_fusions_ms,
    'detail_echecs', (SELECT jsonb_agg(x) FROM (SELECT x FROM jsonb_array_elements(v_ko) x LIMIT 5) z));
END $f$;

-- ── 3. Un passage : UN compte, borné ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fusion_photo_tick()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $f$
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
END $f$;

REVOKE ALL ON FUNCTION public.fusion_photo_synchro_en_cours(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fusion_photo_candidates(uuid, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fusion_photo_compte(uuid, timestamptz, integer, text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fusion_photo_tick() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fusion_photo_file_apres_synchro() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fusion_photo_candidates(uuid, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.fusion_photo_compte(uuid, timestamptz, integer, text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.fusion_photo_tick() TO service_role;

-- Le cron n'est PAS posé ici (GO séparé, après mesure) :
--   SELECT cron.schedule('fusion-photo-1min', '* * * * *', $$SELECT public.fusion_photo_tick()$$);
-- Retour arrière immédiat :
--   SELECT cron.unschedule('fusion-photo-1min');
--   DROP TRIGGER IF EXISTS fusion_photo_apres_synchro ON public.vinted_sync_runs;
