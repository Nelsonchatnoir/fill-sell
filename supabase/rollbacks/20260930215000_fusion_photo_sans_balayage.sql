-- Inverse de 20260930215000 : versions d'avant (20260930203000 / 211500), relues.
SET lock_timeout = '3s';
-- ── B ──────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rapprochement_photo_decisions(p_user uuid, p_annonces uuid[])
RETURNS TABLE (annonce_id uuid, inventaire_id bigint, motif text, n_fiches integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $f$
  WITH an AS (
    SELECT a.id, a.platform, a.titre, a.job_id, e.dhash::bit(64) d, e.phash::bit(64) p
      FROM annonces_plateforme a
      LEFT JOIN photo_empreintes e ON e.url = a.photo_url
     WHERE a.user_id = p_user AND a.id = ANY (p_annonces)),
  fe AS (
    SELECT f.id, f.titre, e.dhash::bit(64) d, e.phash::bit(64) p
      FROM (SELECT i.id, i.titre, (fiche_photos_urls(i.photos, 1))[1] url
              FROM inventaire i
             WHERE i.user_id = p_user AND i.statut = 'stock' AND i.fusionne_dans IS NULL) f
      JOIN photo_empreintes e ON e.url = f.url),
  m AS (
    SELECT an.id aid, fe.id fid, fe.titre ftitre
      FROM an JOIN fe ON an.d IS NOT NULL
       AND bit_count(an.d # fe.d) <= 5 AND bit_count(an.p # fe.p) <= 8),
  n AS (SELECT m.aid, count(*)::int nb, min(m.fid) fid, min(m.ftitre) ftitre FROM m GROUP BY m.aid)
  SELECT an.id,
         CASE WHEN x.motif = 'photo_identique' THEN n.fid END,
         x.motif, COALESCE(n.nb, 0)
    FROM an
    LEFT JOIN n ON n.aid = an.id
    CROSS JOIN LATERAL (SELECT CASE
      WHEN an.d IS NULL THEN 'sans_empreinte'
      WHEN n.nb IS NULL THEN 'aucune_photo_identique'
      WHEN n.nb > 1 THEN 'plusieurs_fiches_meme_photo'
      WHEN EXISTS (SELECT 1 FROM annonces_plateforme x
                    WHERE x.inventaire_id = n.fid AND x.platform = an.platform AND x.disparu_le IS NULL AND x.id <> an.id)
        OR EXISTS (SELECT 1 FROM cross_post_jobs j
                    WHERE j.inventaire_id = n.fid AND j.platform = an.platform AND j.status = 'published'
                      AND j.action IN ('publish', 'republish') AND j.id IS DISTINCT FROM an.job_id)
        THEN 'meme_plateforme'
      WHEN EXISTS (SELECT 1 FROM annonces_plateforme y JOIN photo_empreintes ey ON ey.url = y.photo_url
                    WHERE y.user_id = p_user AND y.platform = an.platform AND y.id <> an.id AND y.disparu_le IS NULL
                      AND bit_count(ey.dhash::bit(64) # an.d) <= 5 AND bit_count(ey.phash::bit(64) # an.p) <= 8)
        THEN 'deux_annonces_meme_plateforme'
      WHEN titres_variantes_exclusives(an.titre, n.ftitre) THEN 'variantes_exclusives'
      ELSE 'photo_identique' END motif) x;
$f$;
CREATE OR REPLACE FUNCTION public.fusion_photo_candidates(p_user uuid, p_depuis timestamptz)
RETURNS TABLE (ida bigint, idb bigint, meme_pf boolean, sans_pf boolean, isolee boolean,
               a_x boolean, b_x boolean, x_ok boolean, eval jsonb, job_en_cours boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $f$
  WITH f AS (
    SELECT i.id, (p_depuis IS NULL OR i.created_at >= p_depuis) touchee,
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
  t0 timestamptz := clock_timestamp();
  v_user uuid; v_ids uuid[]; v_pass integer; d record; a annonces_plateforme%ROWTYPE; v_job uuid;
  v_vus text[]; v_res text; v_import boolean; v_dette boolean;
  n_rat integer := 0; n_rel integer := 0; n_err integer := 0; n_reste integer := 0; v_motifs jsonb := '{}'::jsonb;
BEGIN
  -- Les demandes déposées par les synchros entrent dans la file.
  WITH dm AS (DELETE FROM fusion_photo_demandes RETURNING user_id, depuis, cree_le)
  INSERT INTO fusion_photo_file AS fp (user_id, depuis, demande_le, etat, passages)
  SELECT dm.user_id, min(dm.depuis), max(dm.cree_le), 'a_faire', 0 FROM dm
   WHERE EXISTS (SELECT 1 FROM auth.users u WHERE u.id = dm.user_id)
   GROUP BY dm.user_id
  ON CONFLICT (user_id) DO UPDATE
     SET depuis = CASE WHEN fp.etat = 'a_faire' THEN LEAST(fp.depuis, EXCLUDED.depuis) ELSE EXCLUDED.depuis END,
         demande_le = EXCLUDED.demande_le,
         passages = CASE WHEN fp.etat = 'a_faire' THEN fp.passages ELSE 0 END,
         etat = 'a_faire';

  -- ── 1. Annonces en attente de photo ──────────────────────────────────────
  SELECT w.user_id INTO v_user FROM rapprochement_photo_attente w
   WHERE w.etat = 'attente' AND (w.dernier_passage IS NULL OR w.dernier_passage < now() - interval '40 seconds')
   ORDER BY w.dernier_passage NULLS FIRST, w.cree_le LIMIT 1;
  IF v_user IS NOT NULL THEN
    SELECT array_agg(z.annonce_id), max(z.passages) INTO v_ids, v_pass FROM (
      SELECT w.annonce_id, w.passages FROM rapprochement_photo_attente w
       WHERE w.user_id = v_user AND w.etat = 'attente' ORDER BY w.cree_le LIMIT 40) z;
    UPDATE rapprochement_photo_attente SET passages = passages + 1, dernier_passage = now() WHERE annonce_id = ANY (v_ids);

    SELECT array_agg(z.u) INTO v_urls FROM (
      SELECT y.u FROM (
        SELECT w.photo_url u, 0 prio FROM rapprochement_photo_attente w WHERE w.annonce_id = ANY (v_ids)
        UNION ALL
        SELECT (fiche_photos_urls(i.photos, 1))[1], 1 FROM inventaire i
         WHERE i.user_id = v_user AND i.statut = 'stock' AND i.fusionne_dans IS NULL) y
       WHERE y.u IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM photo_empreintes e WHERE e.url = y.u)
         AND NOT EXISTS (SELECT 1 FROM photo_empreintes_echecs e WHERE e.url = y.u)
       GROUP BY y.u ORDER BY min(y.prio) LIMIT 24) z;
    IF v_urls IS NOT NULL AND COALESCE(v_pass, 0) < 8 THEN
      FOR n_lot IN 0 .. LEAST(5, (array_length(v_urls, 1) - 1) / 4) LOOP
        PERFORM net.http_post(url := c_url, body := jsonb_build_object('urls', to_jsonb(v_urls[n_lot * 4 + 1 : n_lot * 4 + 4])),
                              headers := c_headers, timeout_milliseconds := 60000);
        n_appels := n_appels + 1;
      END LOOP;
      RETURN jsonb_build_object('issue', 'empreintes_attente', 'user', v_user, 'annonces', array_length(v_ids, 1),
                                'photos_manquantes', array_length(v_urls, 1), 'appels', n_appels,
                                'ms', round(extract(epoch FROM clock_timestamp() - t0) * 1000));
    END IF;

    v_import := COALESCE((SELECT value FROM coin_config WHERE key = 'import_auto_ouvert'), 0) = 1;
    v_dette := releve_dette_beebs(v_user);
    FOR d IN SELECT * FROM rapprochement_photo_decisions(v_user, v_ids) LOOP
      IF clock_timestamp() - t0 > interval '2500 milliseconds' THEN n_reste := n_reste + 1; CONTINUE; END IF;
      v_motifs := v_motifs || jsonb_build_object(d.motif, COALESCE((v_motifs ->> d.motif)::int, 0) + 1);
      BEGIN
        SELECT * INTO a FROM annonces_plateforme WHERE id = d.annonce_id FOR UPDATE;
        IF d.inventaire_id IS NOT NULL AND a.inventaire_id IS NULL AND a.ignoree_le IS NULL THEN
          v_job := rapprocher_job_de_suivi(v_user, a.platform, d.inventaire_id, a.titre, a.prix, a.url, a.listing_id, 'auto',
                     jsonb_build_object('annonce_id', a.id, 'motif', 'photo_identique', 'run_id', a.run_id));
          UPDATE annonces_plateforme SET inventaire_id = d.inventaire_id, job_id = v_job, source_rapprochement = 'automatique',
                                         proposition = NULL, updated_at = now()
           WHERE id = a.id;
          INSERT INTO rapprochements (user_id, annonce_id, inventaire_id, decision, par, score, detail)
          VALUES (v_user, a.id, d.inventaire_id, 'attache', 'auto', 1,
                  jsonb_build_object('run_id', a.run_id, 'job_id', v_job, 'motif', 'photo_identique'));
          UPDATE rapprochement_photo_attente SET etat = 'rattachee', tranche_le = now(),
                 bilan = jsonb_build_object('motif', d.motif, 'inventaire_id', d.inventaire_id, 'job_id', v_job)
           WHERE annonce_id = a.id;
          n_rat := n_rat + 1;
        ELSE
          UPDATE rapprochement_photo_attente SET etat = 'relachee', tranche_le = now(),
                 bilan = jsonb_build_object('motif', d.motif, 'fiches_meme_photo', d.n_fiches)
           WHERE annonce_id = d.annonce_id;
          IF a.id IS NOT NULL AND a.inventaire_id IS NULL AND a.ignoree_le IS NULL THEN
            SELECT COALESCE(array_agg(x.listing_id), ARRAY[]::text[]) INTO v_vus FROM annonces_plateforme x WHERE x.run_id = a.run_id;
            v_res := rapprocher_traiter_annonce(a.id, v_vus, v_import AND NOT (a.platform = 'beebs' AND v_dette), false, false);
            -- Retenue silencieuse Beebs (29/09 soir), comme rapprocher_releve.
            IF a.platform = 'beebs' AND v_dette AND v_res IN ('propose', 'propose_inchangee', 'aucune') THEN
              UPDATE annonces_plateforme SET ignoree_le = now(), updated_at = now()
               WHERE id = a.id AND inventaire_id IS NULL AND ignoree_le IS NULL;
              IF FOUND THEN
                INSERT INTO rapprochements (user_id, annonce_id, inventaire_id, decision, par, score, detail)
                VALUES (v_user, a.id, NULL, 'ignore', 'auto', 0,
                        jsonb_build_object('run_id', a.run_id, 'motif', 'retenue_silencieuse_beebs', 'resultat', v_res,
                                           'regle', 'dépôt Beebs sans identifiant : ni import ni question avant preuve exacte'));
              END IF;
            END IF;
          END IF;
          n_rel := n_rel + 1;
        END IF;
      EXCEPTION WHEN OTHERS THEN
        n_err := n_err + 1;
        UPDATE rapprochement_photo_attente SET etat = 'relachee', tranche_le = now(),
               bilan = jsonb_build_object('motif', d.motif, 'erreur', left(SQLERRM, 200))
         WHERE annonce_id = d.annonce_id;
      END;
    END LOOP;
    RETURN jsonb_build_object('issue', 'attente_tranchee', 'user', v_user, 'rattachees', n_rat, 'relachees', n_rel,
                              'erreurs', n_err, 'reste', n_reste, 'motifs', v_motifs,
                              'ms', round(extract(epoch FROM clock_timestamp() - t0) * 1000));
  END IF;

  -- ── 2. Fiches créées par une synchro ────────────────────────────────────
  SELECT * INTO f FROM fusion_photo_file fp
   WHERE fp.etat = 'a_faire'
     AND NOT fusion_photo_synchro_en_cours(fp.user_id)
     AND (fp.dernier_passage IS NULL OR fp.dernier_passage < now() - interval '45 seconds')
   ORDER BY fp.dernier_passage NULLS FIRST, fp.demande_le
   LIMIT 1;
  IF f.user_id IS NULL THEN RETURN jsonb_build_object('issue', 'rien'); END IF;

  UPDATE fusion_photo_file SET passages = passages + 1, dernier_passage = now() WHERE user_id = f.user_id;
  IF f.passages >= 45 THEN
    UPDATE fusion_photo_file SET etat = 'abandonne', bilan = COALESCE(bilan, '{}'::jsonb) || jsonb_build_object('abandonne_le', now()) WHERE user_id = f.user_id;
    RETURN jsonb_build_object('issue', 'abandonne', 'user', f.user_id);
  END IF;
  -- Rien de neuf depuis la synchro : c'est fini, sans rien relire d'autre.
  IF NOT EXISTS (SELECT 1 FROM inventaire i WHERE i.user_id = f.user_id AND i.statut = 'stock'
                    AND i.fusionne_dans IS NULL AND i.created_at >= f.depuis) THEN
    UPDATE fusion_photo_file SET etat = 'termine', bilan = COALESCE(bilan, '{}'::jsonb) || jsonb_build_object('rien_de_neuf', now())
     WHERE user_id = f.user_id;
    RETURN jsonb_build_object('issue', 'rien_de_neuf', 'user', f.user_id);
  END IF;
  -- Couvertures manquantes : les fiches neuves d'abord, puis le reste du stock.
  SELECT array_agg(z.u) INTO v_urls FROM (
    SELECT y.u FROM (
      SELECT (fiche_photos_urls(i.photos, 1))[1] u, (i.created_at < f.depuis)::int prio FROM inventaire i
       WHERE i.user_id = f.user_id AND i.statut = 'stock' AND i.fusionne_dans IS NULL) y
     WHERE y.u IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM photo_empreintes e WHERE e.url = y.u)
       AND NOT EXISTS (SELECT 1 FROM photo_empreintes_echecs e WHERE e.url = y.u)
     GROUP BY y.u ORDER BY min(y.prio) LIMIT 24) z;
  IF v_urls IS NOT NULL AND f.passages < 40 THEN
    FOR n_lot IN 0 .. LEAST(5, (array_length(v_urls, 1) - 1) / 4) LOOP
      PERFORM net.http_post(url := c_url, body := jsonb_build_object('urls', to_jsonb(v_urls[n_lot * 4 + 1 : n_lot * 4 + 4])),
                            headers := c_headers, timeout_milliseconds := 60000);
      n_appels := n_appels + 1;
    END LOOP;
    UPDATE fusion_photo_file SET bilan = COALESCE(bilan, '{}'::jsonb) || jsonb_build_object('photos_manquantes', array_length(v_urls, 1))
     WHERE user_id = f.user_id;
    RETURN jsonb_build_object('issue', 'empreintes', 'user', f.user_id, 'photos_manquantes', array_length(v_urls, 1), 'appels', n_appels);
  END IF;

  -- Les empreintes sont là : le compte est PRÊT. La fusion elle-même n'est
  -- JAMAIS faite ici : la première fusion d'une connexion coûte 5 à 6 s
  -- (laury.larrieu, 30/09 20:05 et 20:06 : 8 s coupé, puis 5,6 s), et chaque
  -- passage de cron est une connexion neuve. Elles partent par lots, espacés
  -- (fusion_photo_lot, toutes les 10 min) : une seule mise en route par lot.
  UPDATE fusion_photo_file SET etat = 'pret' WHERE user_id = f.user_id;
  RETURN jsonb_build_object('issue', 'pret', 'user', f.user_id,
                            'ms', round(extract(epoch FROM clock_timestamp() - t0) * 1000));
END $function$;
DROP FUNCTION IF EXISTS public.fiche_couverture(jsonb);
