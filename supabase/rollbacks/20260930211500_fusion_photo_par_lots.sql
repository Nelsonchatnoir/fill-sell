-- Inverse de 20260930211500 : le passage d'avant (relu en prod), sans lot.
SET lock_timeout = '3s';
SELECT cron.unschedule('fusion-photo-lot-10min') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'fusion-photo-lot-10min');
DROP FUNCTION IF EXISTS public.fusion_photo_lot(integer);
UPDATE public.fusion_photo_file SET etat = 'a_faire' WHERE etat = 'pret';
ALTER TABLE public.fusion_photo_file DROP CONSTRAINT IF EXISTS fusion_photo_file_etat_check;
ALTER TABLE public.fusion_photo_file ADD CONSTRAINT fusion_photo_file_etat_check CHECK (etat IN ('a_faire', 'termine', 'abandonne'));
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
  c_headers constant jsonb := '{"Content-Type":"application/json","x-cron-secret":"__CRON_SECRET_DU_VAULT__"}'::jsonb;
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
  IF f.passages >= 20 THEN
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
  IF v_urls IS NOT NULL AND f.passages < 8 THEN
    FOR n_lot IN 0 .. LEAST(5, (array_length(v_urls, 1) - 1) / 4) LOOP
      PERFORM net.http_post(url := c_url, body := jsonb_build_object('urls', to_jsonb(v_urls[n_lot * 4 + 1 : n_lot * 4 + 4])),
                            headers := c_headers, timeout_milliseconds := 60000);
      n_appels := n_appels + 1;
    END LOOP;
    UPDATE fusion_photo_file SET bilan = COALESCE(bilan, '{}'::jsonb) || jsonb_build_object('photos_manquantes', array_length(v_urls, 1))
     WHERE user_id = f.user_id;
    RETURN jsonb_build_object('issue', 'empreintes', 'user', f.user_id, 'photos_manquantes', array_length(v_urls, 1), 'appels', n_appels);
  END IF;

  r := fusion_photo_compte(f.user_id, f.depuis, 1, 'utilisateur:photo_auto', 800);
  UPDATE fusion_photo_file
     SET fusions = fusions + COALESCE((r ->> 'fusions')::int, 0),
         bilan = COALESCE(bilan, '{}'::jsonb) || jsonb_build_object('dernier', r),
         etat = CASE WHEN COALESCE((r ->> 'ok')::boolean, false) AND COALESCE((r ->> 'restantes')::int, 0) = 0 THEN 'termine' ELSE etat END
   WHERE user_id = f.user_id;
  RETURN jsonb_build_object('issue', 'fusions', 'user', f.user_id, 'resultat', r,
                            'ms', round(extract(epoch FROM clock_timestamp() - t0) * 1000));
END $function$;

