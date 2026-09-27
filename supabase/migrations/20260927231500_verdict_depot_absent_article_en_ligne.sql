-- ═══════════════════════════════════════════════════════════════════════════
-- VERDICT DE DÉPÔT : JAMAIS SUR UN RELEVÉ PARTIEL, JAMAIS « RELANCE » QUAND
-- L'ARTICLE EST DÉJÀ EN LIGNE (27/09 soir)
-- ═══════════════════════════════════════════════════════════════════════════
-- jocabroc8, « Pichet Art déco années 30 » (job c9a75a0a) : déclaré « refusé à
-- la vérification ou retiré » au relevé du 27/09 20:31. Vérifié :
--  · ce verdict vient du relevé COMPLET f3a9f69e (20:26 → 20:31, 176 lues sur
--    176 annoncées), PAS du relevé partiel de 20:20 (« 30 sur 176 » : la
--    garde « [incomplet] » a joué, aucun verdict n'en est sorti) ;
--  · le dépôt 3276308752 est bien hors ligne (page publique Leboncoin :
--    « Cette annonce est désactivée ») — le 1er dépôt 3274591172 aussi (410) ;
--  · mais l'ARTICLE est en ligne sous l'annonce 3274625576 (publiée le 22/09
--    14:55, « Pichet Art Déco Tchécoslovaquie années 1930… », mêmes mots de
--    titre), importée ce soir sur la fiche 1790533661002 (question « Est-ce le
--    même article ? » posée).
-- Ce que fait cette migration (rien n'est retiré ni supprimé) :
--  1. trancher_publications_sans_lien (définition PROD du 27/09 + ajout) : un
--     dépôt absent dont l'article est en ligne sur la même plateforme (mêmes
--     mots de titre, titre_jetons, ≥ 3 mots) est clos 'cancelled' avec la
--     phrase qui nomme l'annonce en ligne — plus de rouge, plus d'invitation à
--     republier un doublon.
--  2. releve_clos_tranche_publications (définition PROD + ceinture) : aucun
--     verdict si le run a lu moins que le total annoncé (total_entries).
--  3. Le job c9a75a0a reçoit ce verdict (seul cas du parc sur 30 jours).

CREATE OR REPLACE FUNCTION public.trancher_publications_sans_lien(p_user uuid, p_platform text, p_run_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_run vinted_sync_runs%ROWTYPE;
  j record;
  v_ids text[];
  v_url text;
  v_refund jsonb;
  v_nom text;
  v_msg text;
  v_releve_txt text;
  v_semblable record;
  n_refusees integer := 0; n_en_ligne integer := 0; n_attente integer := 0;
BEGIN
  IF p_user IS NULL OR p_platform IS NULL OR p_run_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'arguments');
  END IF;
  SELECT * INTO v_run FROM vinted_sync_runs
   WHERE id = p_run_id AND user_id = p_user AND kind = 'annonces' AND platform = p_platform;
  IF v_run.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'run_introuvable'); END IF;
  -- La preuve exigée : un relevé DONE, COMPLET, qui a lu quelque chose (ou
  -- qui dit « vide » — un compte sans annonce est un relevé réussi à 0).
  IF v_run.status <> 'done'
     OR COALESCE(v_run.erreur, '') LIKE '[incomplet]%'
     OR NOT (COALESCE(v_run.items_vus, 0) > 0 OR COALESCE(v_run.erreur, '') LIKE '[vide]%') THEN
    RETURN jsonb_build_object('ok', true, 'reason', 'releve_non_probant', 'refusees', 0, 'en_ligne', 0, 'en_attente', 0);
  END IF;
  v_nom := CASE p_platform WHEN 'leboncoin' THEN 'Leboncoin' WHEN 'beebs' THEN 'Beebs' WHEN 'ebay' THEN 'eBay' WHEN 'opla' THEN 'Opla' ELSE p_platform END;
  v_releve_txt := to_char(COALESCE(v_run.finished_at, v_run.started_at) AT TIME ZONE 'Europe/Paris', 'DD/MM à HH24"h"MI');

  FOR j IN
    SELECT id, platform_listing_id, platform_fields, COALESCE(published_at, created_at) AS publie
      FROM cross_post_jobs
     WHERE user_id = p_user AND platform = p_platform
       AND status = 'published' AND action = 'publish' AND listing_url IS NULL
     ORDER BY COALESCE(published_at, created_at)
     FOR UPDATE SKIP LOCKED
  LOOP
    v_ids := ARRAY(
      SELECT DISTINCT x FROM unnest(ARRAY[
        NULLIF(btrim(j.platform_listing_id), ''),
        NULLIF(btrim(j.platform_fields #>> '{lbc_depot,adsubmit,id}'), ''),
        NULLIF(btrim(j.platform_fields #>> '{lbc_depot,sans_adsubmit,id}'), '')
      ]) AS x WHERE x IS NOT NULL AND x ~ '^[0-9]{6,}$');
    IF COALESCE(array_length(v_ids, 1), 0) = 0 THEN n_attente := n_attente + 1; CONTINUE; END IF;

    -- EN LIGNE : l'identifiant est dans le relevé du compte, avec son lien.
    v_url := NULL;
    SELECT ap.url INTO v_url FROM annonces_plateforme ap
     WHERE ap.user_id = p_user AND ap.platform = p_platform AND ap.listing_id = ANY(v_ids)
       AND ap.url IS NOT NULL AND ap.statut_plateforme = 'en_ligne' AND ap.disparu_le IS NULL
     ORDER BY ap.vu_le DESC LIMIT 1;
    IF v_url IS NOT NULL THEN
      UPDATE cross_post_jobs SET
        listing_url = v_url,
        platform_fields = COALESCE(platform_fields, '{}'::jsonb) || jsonb_build_object(
          'lien_retrouve_par_identifiant', jsonb_build_object('le', now(), 'run_id', p_run_id, 'url', v_url, 'identifiants', to_jsonb(v_ids)))
       WHERE id = j.id;
      n_en_ligne := n_en_ligne + 1; CONTINUE;
    END IF;

    -- Présente dans un relevé sous un autre statut : ce n'est pas un refus.
    IF EXISTS (SELECT 1 FROM annonces_plateforme ap
                WHERE ap.user_id = p_user AND ap.platform = p_platform AND ap.listing_id = ANY(v_ids)) THEN
      n_attente := n_attente + 1; CONTINUE;
    END IF;

    -- BEEBS : LA MODÉRATION NE SE JUGE PAS (27/09, décision de Nico). Le lien
    -- est posé ci-dessus quand le relevé le porte ; une absence du relevé ne
    -- fait jamais dire « refusée » ni « tu peux la relancer ».
    IF p_platform = 'beebs' THEN
      n_attente := n_attente + 1; CONTINUE;
    END IF;

    -- Le relevé doit avoir commencé ≥ 2 h après la publication : la
    -- vérification de la plateforme a eu le temps de rendre son verdict.
    IF COALESCE(v_run.started_at, v_run.finished_at) < j.publie + interval '2 hours' THEN
      n_attente := n_attente + 1; CONTINUE;
    END IF;

    -- ── LE DÉPÔT N'Y EST PAS, MAIS L'ARTICLE, SI (27/09, jocabroc8) ──────────
    -- « Pichet Art déco années 30 » : le dépôt 3276308752 était bien absent
    -- (page Leboncoin « Cette annonce est désactivée »), mais l'article était
    -- EN LIGNE sous l'annonce 3274625576, mêmes mots de titre. Dire « refusée,
    -- tu peux la relancer » invitait à déposer un doublon. On clôt le dépôt
    -- sans rouge, en nommant l'annonce qui est en ligne — et on ne relance rien.
    v_semblable := NULL;
    SELECT ap.listing_id, ap.titre INTO v_semblable
      FROM annonces_plateforme ap, inventaire i
     WHERE i.id = (SELECT inventaire_id FROM cross_post_jobs WHERE id = j.id)
       AND ap.user_id = p_user AND ap.platform = p_platform AND ap.run_id = p_run_id
       AND ap.statut_plateforme = 'en_ligne' AND ap.disparu_le IS NULL
       AND cardinality(titre_jetons(ap.titre)) >= 3
       AND titre_jetons(ap.titre) = titre_jetons(i.titre)
     LIMIT 1;
    IF v_semblable.listing_id IS NOT NULL THEN
      v_refund := refund_publish_unconfirmed(j.id);
      UPDATE cross_post_jobs SET
        status = 'cancelled',
        error = 'Ce dépôt n''est pas en ligne sur ' || v_nom || ' (refusé à la vérification ou retiré), mais cet article, lui, y est en ligne : '
          || '« ' || left(COALESCE(v_semblable.titre, ''), 120) || ' » (annonce ' || v_semblable.listing_id || ', relevé complet du ' || v_releve_txt || '). '
          || 'Rien à relancer : republier créerait un doublon.',
        platform_fields = COALESCE(platform_fields, '{}'::jsonb) || jsonb_build_object(
          'verdict_moderation', jsonb_build_object(
            'verdict', 'absent_mais_article_en_ligne', 'preuve', 'absente_du_releve_complet',
            'annonce_en_ligne', v_semblable.listing_id, 'run_id', p_run_id,
            'releve_le', COALESCE(v_run.finished_at, v_run.started_at),
            'annonces_lues', COALESCE(v_run.items_vus, 0), 'identifiants', to_jsonb(v_ids),
            'refund', v_refund, 'le', now()))
       WHERE id = j.id;
      n_attente := n_attente + 1; CONTINUE;
    END IF;

    -- REFUSÉE. Rembourser d'abord (idempotent), passer 'failed' ensuite —
    -- l'ordre du balayage de nuit, et le trigger de réservation fait le reste.
    v_refund := refund_publish_unconfirmed(j.id);
    v_msg := v_nom || ' n''a pas mis cette annonce en ligne — refusée à la vérification (ou retirée depuis) : '
      || 'elle n''apparaît pas dans tes annonces ' || v_nom || ' (relevé complet du ' || v_releve_txt
      || ', ' || COALESCE(v_run.items_vus, 0)::text || ' annonce' || CASE WHEN COALESCE(v_run.items_vus, 0) > 1 THEN 's' ELSE '' END || ' lue'
      || CASE WHEN COALESCE(v_run.items_vus, 0) > 1 THEN 's' ELSE '' END || '). Rien n''est en ligne'
      || CASE WHEN COALESCE((v_refund ->> 'rembourse')::int, 0) > 0 THEN ', la publication t''est rendue' ELSE '' END
      || '. Tu peux la relancer d''ici, ou abandonner ' || v_nom || ' pour cet article.';
    UPDATE cross_post_jobs SET
      status = 'failed',
      error = v_msg,
      platform_fields = COALESCE(platform_fields, '{}'::jsonb) || jsonb_build_object(
        'verdict_moderation', jsonb_build_object(
          'verdict', 'refusee', 'preuve', 'absente_du_releve_complet',
          'run_id', p_run_id, 'releve_le', COALESCE(v_run.finished_at, v_run.started_at),
          'annonces_lues', COALESCE(v_run.items_vus, 0),
          'publie_le', j.publie, 'identifiants', to_jsonb(v_ids),
          'refund', v_refund, 'le', now()))
     WHERE id = j.id;
    n_refusees := n_refusees + 1;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'run_id', p_run_id, 'platform', p_platform,
                            'refusees', n_refusees, 'en_ligne', n_en_ligne, 'en_attente', n_attente);
END;
$function$;

CREATE OR REPLACE FUNCTION public.releve_clos_tranche_publications()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_vus      integer;
  v_verdicts jsonb;
BEGIN
  IF COALESCE(NEW.erreur, '') LIKE '[incomplet]%' THEN RETURN NULL; END IF;
  IF releve_hors_liste(NEW.erreur) THEN RETURN NULL; END IF;
  IF NEW.platform = 'ebay' AND releve_ebay_run_incomplet(NEW.id) THEN RETURN NULL; END IF;
  -- (27/09) Ceinture : le run a lu MOINS que ce que la plateforme annonce
  -- (total_entries, écrit par l'extension 0.6.75) → aucun verdict.
  IF NEW.total_entries IS NOT NULL AND COALESCE(NEW.items_vus, 0) < NEW.total_entries THEN RETURN NULL; END IF;
  SELECT count(*) INTO v_vus FROM annonces_plateforme WHERE run_id = NEW.id;
  IF v_vus = 0 AND releve_compte_avait_annonces(NEW.user_id, NEW.platform) THEN RETURN NULL; END IF;
  BEGIN
    v_verdicts := trancher_publications_sans_lien(NEW.user_id, NEW.platform, NEW.id);
    IF COALESCE((v_verdicts->>'refusees')::int, 0) + COALESCE((v_verdicts->>'en_ligne')::int, 0) > 0 THEN
      RAISE LOG 'releve_clos_tranche_publications : run % (%) → %', NEW.id, NEW.platform, v_verdicts;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'releve_clos_tranche_publications : run % : %', NEW.id, SQLERRM;
  END;
  -- ── REDÉPÔT INTERROMPU : LA PREUVE EST ARRIVÉE (2026-09-27, famouus-x3) ──
  -- Une republication Leboncoin retirée puis recréée en vain, arrêtée
  -- « annonce peut-être déjà partie — relevé introuvable » (get-pending-jobs),
  -- ne repartait JAMAIS toute seule : la garde ne relit que les jobs pending.
  -- Un relevé COMPLET de ce compte (gardes ci-dessus), COMMENCÉ après le
  -- retrait et après l'essai suspect, la remet en file : get-pending-jobs juge
  -- alors avec CE relevé — aucune annonce apparue → redépôt depuis la copie du
  -- job ; la même annonce, certaine → rattachée, rien redéposé ; un doute →
  -- la question revient. Jamais un redépôt sans cette preuve.
  IF NEW.platform = 'leboncoin' THEN
    BEGIN
      UPDATE cross_post_jobs j SET
        status = 'pending', error = NULL,
        platform_fields = (j.platform_fields - 'needs_user_source')
          || jsonb_build_object('recreation_relancee_par_releve', jsonb_build_object('le', now(), 'releve', NEW.id))
       WHERE j.user_id = NEW.user_id AND j.platform = 'leboncoin' AND j.action = 'republish' AND j.status = 'needs_user'
         AND j.platform_fields->>'needs_user_source' = 'recreation_deja_partie'
         AND j.platform_fields#>>'{recreation_deja_partie,verdict}' = 'releve_introuvable'
         AND j.platform_fields->>'republish_step' = 'deleted'
         AND NEW.started_at > GREATEST(
               COALESCE((j.platform_fields->>'deleted_at')::timestamptz, '-infinity'::timestamptz),
               COALESCE((j.platform_fields#>>'{recreation_depot_parti,at}')::timestamptz, '-infinity'::timestamptz),
               COALESCE((j.platform_fields#>>'{recreation_deja_partie,le}')::timestamptz, '-infinity'::timestamptz));
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'releve_clos_tranche_publications (redépôts) : run % : %', NEW.id, SQLERRM;
    END;
  END IF;
  RETURN NULL;
END
$function$;

UPDATE cross_post_jobs j SET
  status = 'cancelled',
  error = 'Ce dépôt n''est pas en ligne sur Leboncoin (refusé à la vérification ou retiré), mais cet article, lui, y est en ligne : '
    || '« Pichet Art Déco Tchécoslovaquie années 1930 Céramique Oiseaux Fleurs Vintage » (annonce 3274625576, relevé complet du 27/09 à 20h31). '
    || 'Rien à relancer : republier créerait un doublon.',
  platform_fields = j.platform_fields || jsonb_build_object('verdict_moderation',
    (j.platform_fields -> 'verdict_moderation') || jsonb_build_object(
      'verdict', 'absent_mais_article_en_ligne', 'annonce_en_ligne', '3274625576',
      'corrige_le', now(), 'par', 'migration 20260927231500'))
 WHERE j.id = 'c9a75a0a-ed6b-496a-a71d-dcc1627da08c' AND j.status = 'failed';
