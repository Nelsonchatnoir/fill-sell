-- ══════════════════════════════════════════════════════════════════════════════
-- LE DÉPÔT SUIT LA PROD — CAPTURE DU 26/09/2026 (audit dépôt ↔ prod, GO Nico)
-- ══════════════════════════════════════════════════════════════════════════════
-- POURQUOI. Le 26/09, la règle des ventes relevées a failli être réécrite depuis
-- un fichier du dépôt qui n'était PAS la version en prod. L'audit a trouvé 22
-- fonctions, 2 triggers et 9 policies dont la définition en prod n'est
-- portée par AUCUN fichier du dépôt (correctifs appliqués directement en prod,
-- migrations « patch » par remplacement de texte, objets créés au dashboard).
-- Une future migration partie de l'ancien fichier aurait écrasé ces correctifs
-- sans que personne ne le voie.
--
-- CE FICHIER reprend, octet pour octet, la définition EN PROD relevée le 26/09
-- (pg_get_functiondef / pg_get_triggerdef / pg_policies). Il est IDEMPOTENT :
-- l'appliquer ne changerait rien. Il n'est PAS inscrit dans l'historique
-- distant (aucune écriture en prod pendant l'audit) — ⛔ ne pas l'appliquer,
-- c'est un point de référence : la dernière définition du dépôt = la prod.
-- ══════════════════════════════════════════════════════════════════════════════

-- ── FONCTIONS ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.doublons_fiches_a_examiner(p_limite integer)
 RETURNS SETOF bigint
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT z.id FROM (
    SELECT i.id, i.created_at FROM inventaire i
     WHERE (i.origine LIKE 'releve\_%' OR i.origine = 'vinted_sync')
       AND i.created_at > now() - interval '14 days'
       AND i.fusionne_dans IS NULL AND i.statut = 'stock'
       -- (2026-09-25 après-midi) une fiche du dressing attend 30 min : le même
       -- relevé date d'abord la disparition de l'annonce qu'elle remplace.
       AND (i.origine <> 'vinted_sync' OR i.created_at < now() - interval '30 minutes')
       AND NOT EXISTS (SELECT 1 FROM inventaire_doublons_verifies v WHERE v.inventaire_id = i.id)
    UNION
    -- (2026-09-25 après-midi) REVUE : une annonce Vinted vivante déjà examinée
    -- dont une homonyme de la même boutique a été RETIRÉE depuis l'examen
    -- (remise en ligne vue en retard). rapprochement_photos_decider réhorodate
    -- l'examen : une retraite ne déclenche qu'une revue.
    SELECT i.id, i.created_at FROM inventaire i
      JOIN inventaire_doublons_verifies v ON v.inventaire_id = i.id
     WHERE i.origine = 'vinted_sync' AND i.created_at > now() - interval '14 days'
       AND i.fusionne_dans IS NULL AND i.statut = 'stock'
       AND i.vinted_status = 'active' AND i.disparu_le IS NULL
       AND EXISTS (SELECT 1 FROM inventaire m
                    WHERE m.user_id = i.user_id AND m.id <> i.id AND m.fusionne_dans IS NULL AND m.statut = 'stock'
                      AND m.vinted_status = 'closed' AND m.disparu_le > v.verifie_le
                      AND m.disparu_le > now() - interval '14 days'
                      AND m.created_at < i.created_at
                      AND titre_jetons(m.titre) && titre_jetons(i.titre)
                      AND vinted_remise_en_ligne(m.id, i.id))
  ) z
   ORDER BY z.created_at
   LIMIT greatest(p_limite, 0);
$function$;

CREATE OR REPLACE FUNCTION public.ebay_accounts_touch_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.expire_publish_reservations()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  r        record;
  v_cnt    integer;
  n_res    integer := 0;
  n_jobs   integer := 0;
  n_nu     integer := 0;
  n_sans   integer := 0;
BEGIN
  -- 1. needs_user seul, a 48 h. On ne touche QUE les jobs needs_user, et on ne
  -- relache QUE leur part : la reservation peut couvrir d'autres plateformes
  -- encore en vol (cas reel 1f02c097).
  FOR r IN
    SELECT j.id AS job_id, j.reservation_id, COALESCE(c.unit_price, 1) AS unit
    FROM cross_post_jobs j
    JOIN coin_reservations c ON c.id = j.reservation_id
    WHERE j.status = 'needs_user'
      AND c.status = 'held'
      AND j.reservation_settled_at IS NULL
      AND COALESCE(j.published_at, j.created_at) < now() - interval '48 hours'
    FOR UPDATE OF j SKIP LOCKED
  LOOP
    UPDATE cross_post_jobs SET
      status = 'cancelled',
      error  = 'Publication abandonnée : une information manquait et la question '
            || 'est restée sans réponse pendant au moins 48 heures. '
            || 'Elle ne compte pas dans tes limites — tu peux relancer '
            || 'cette publication quand tu veux depuis ton Stock.'
    WHERE id = r.job_id;
    -- Le trigger cross_post_job_settle_reservation fait le 'release' au passage
    -- en 'cancelled' : on ne le double PAS ici.
    n_nu := n_nu + 1;
  END LOOP;

  -- 2. Filet historique a 30 jours, inchange.
  FOR r IN
    SELECT id FROM coin_reservations
    WHERE status = 'held' AND created_at < now() - interval '30 days'
    FOR UPDATE SKIP LOCKED
  LOOP
    UPDATE cross_post_jobs SET
      status = 'cancelled',
      error = COALESCE(NULLIF(error, ''),
        'Publication jamais exécutée en 30 jours — elle ne compte pas dans tes limites.')
    WHERE reservation_id = r.id AND status IN ('pending', 'processing', 'needs_user');
    GET DIAGNOSTICS v_cnt = ROW_COUNT;
    n_jobs := n_jobs + v_cnt;
    PERFORM settle_publish_reservation(r.id, 'release', 2147483647, 'expired');
    UPDATE coin_reservations SET expired_at = now() WHERE id = r.id;
    n_res := n_res + 1;
  END LOOP;

  -- 3. (24/09) PUBLICATIONS SANS RESERVATION — bascule des prix a 0 du 02/09 :
  -- les branches 1 et 2 ne les voient plus. Sortie 'cancelled', comme partout.
  FOR r IN
    SELECT j.id,
      CASE
        WHEN j.inventaire_id IS NOT NULL AND i.id IS NULL THEN 'article_supprime'
        WHEN i.statut = 'vendu' THEN 'article_vendu'
        WHEN EXISTS (SELECT 1 FROM cross_post_jobs o
                     WHERE o.user_id = j.user_id AND o.inventaire_id = j.inventaire_id
                       AND o.platform = j.platform AND o.id <> j.id
                       AND o.action IN ('publish', 'republish')
                       AND o.status = 'published' AND o.sold_at IS NULL
                       AND NULLIF(trim(o.listing_url), '') IS NOT NULL) THEN 'deja_en_ligne'
        WHEN j.status = 'needs_user' AND GREATEST(j.created_at,
               COALESCE(republish_ts_safe(j.platform_fields, 'derniere_relance_manuelle'), '-infinity'::timestamptz),
               COALESCE(republish_ts_safe(j.platform_fields, 'pending_muet_clos_le'), '-infinity'::timestamptz))
             < now() - interval '14 days' THEN 'attente_14j'
        -- MODIF 2026-09-25 : jamais pendant une pause anti-robot du compte Vinted, et le temps passé en pause ne compte pas.
        WHEN j.created_at + make_interval(secs => COALESCE(NULLIF(j.platform_fields ->> 'antirobot_pause_cumul_ms', '')::double precision, 0) / 1000)
               < now() - interval '30 days'
             AND NOT (j.platform = 'vinted' AND compte_en_pause_antirobot(j.user_id)) THEN 'filet_30j'
      END AS motif
    FROM cross_post_jobs j
    LEFT JOIN inventaire i ON i.id = j.inventaire_id
    WHERE j.action = 'publish'
      AND j.status IN ('pending', 'needs_user')
      AND j.reservation_id IS NULL
      AND NULLIF(trim(j.listing_url), '') IS NULL
      AND NULLIF(trim(j.platform_listing_id), '') IS NULL
      AND j.created_at < now() - interval '1 hour'
    FOR UPDATE OF j SKIP LOCKED
  LOOP
    CONTINUE WHEN r.motif IS NULL;
    UPDATE cross_post_jobs SET
      status = 'cancelled',
      error = CASE r.motif
        WHEN 'article_vendu'    THEN 'Publication arrêtée : cet article est vendu.'
        WHEN 'article_supprime' THEN 'Publication arrêtée : cet article n''est plus dans ton stock.'
        WHEN 'deja_en_ligne'    THEN 'Publication arrêtée : cet article est déjà en ligne sur cette plateforme.'
        WHEN 'attente_14j'      THEN 'Cette publication attendait une réponse depuis plus de deux semaines : nous l''avons arrêtée. '
                                  || 'Relance-la depuis la fiche de l''article quand tu veux.'
        ELSE 'Publication jamais exécutée en 30 jours : nous l''avons arrêtée. '
          || 'Relance-la depuis la fiche de l''article quand tu veux.'
      END,
      platform_fields = COALESCE(platform_fields, '{}'::jsonb) || jsonb_build_object(
        'expiree_sans_reservation', jsonb_build_object('at', now(), 'motif', r.motif),
        'erreurs_archivees', COALESCE(platform_fields -> 'erreurs_archivees', '[]'::jsonb)
          || jsonb_build_array(jsonb_build_object('le', now(), 'statut', status,
               'erreur', left(COALESCE(error, ''), 600), 'par', 'expire_publish_reservations')))
    WHERE id = r.id AND status IN ('pending', 'needs_user');
    IF FOUND THEN n_sans := n_sans + 1; END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'reservations_expirees', n_res,
    'jobs_annules', n_jobs,
    'needs_user_48h', n_nu,
    'sans_reservation', n_sans
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.inventaire_arme_retraits_avant_suppression()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_role        text;
  v_pub         record;
  v_n           integer := 0;
  v_annules     integer := 0;
  v_plateformes text[] := '{}';
begin
  if coalesce(current_setting('fillsell.sans_retrait', true), '') = '1' then
    return old;
  end if;
  if pg_trigger_depth() > 1 then
    return old;
  end if;
  begin
    v_role := nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role';
  exception when others then
    v_role := null;
  end;
  if v_role = 'service_role' then
    return old;
  end if;

  begin
    for v_pub in
      select distinct on (j.platform) j.platform, j.id, j.listing_url, j.title
        from public.cross_post_jobs j
       where j.user_id = old.user_id
         and j.inventaire_id = old.id
         and coalesce(j.action, 'publish') in ('publish', 'republish')
         and j.status = 'published'
         and nullif(btrim(j.listing_url), '') is not null
         and not exists (
           select 1 from public.cross_post_jobs d
            where d.user_id = old.user_id
              and d.inventaire_id = old.id
              and d.action = 'delete'
              and d.platform = j.platform
              and d.status in ('pending', 'processing', 'needs_user'))
       order by j.platform, coalesce(j.published_at, j.created_at) desc, j.created_at desc
    loop
      insert into public.cross_post_jobs
        (user_id, inventaire_id, platform, action, status, photo_option, title, listing_url, platform_fields)
      values
        (old.user_id, old.id, v_pub.platform, 'delete', 'pending', 'original',
         coalesce(v_pub.title, old.titre), v_pub.listing_url,
         jsonb_build_object('filet_suppression_serveur', jsonb_build_object(
           'le', now(),
           'job_publication', v_pub.id,
           'motif', 'annonce en ligne non couverte par le plan de suppression de l''app'))
         -- 24/09 : la boutique Vinted de l'article, que la garde boutique lit
         -- quand l'article n'existe plus (retrait orphelin).
         || case when v_pub.platform = 'vinted' and nullif(btrim(old.vinted_account_id::text), '') is not null
                 then jsonb_build_object('vinted_account_id', btrim(old.vinted_account_id::text))
                 else '{}'::jsonb end);
      v_n := v_n + 1;
      v_plateformes := v_plateformes || v_pub.platform;
    end loop;

    update public.cross_post_jobs
       set status = 'cancelled',
           error  = 'Annulé : l''article a été supprimé du stock'
     where user_id = old.user_id
       and inventaire_id = old.id
       and coalesce(action, 'publish') <> 'delete'
       and status in ('pending', 'processing', 'needs_user');
    get diagnostics v_annules = row_count;

    if v_n > 0 then
      insert into public.usage_logs (user_id, feature, metadata)
      values (old.user_id, 'retrait_annonces', jsonb_build_object(
        'chemin', 'suppression_article_filet_serveur',
        'plateformes', (select coalesce(jsonb_agg(p order by p), '[]'::jsonb) from unnest(v_plateformes) as p),
        'n_annonces', v_n,
        'n_articles', 1,
        'article_id', old.id::text,
        'publications_annulees', v_annules));
    end if;
  exception when others then
    raise warning 'inventaire_arme_retraits_avant_suppression (article %) : % — suppression poursuivie', old.id, sqlerrm;
  end;
  return old;
end;
$function$;

CREATE OR REPLACE FUNCTION public.inventaire_defusionner(p_fusion_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  f inventaire_fusions%ROWTYPE;
  v_ids bigint[];
  v_uids uuid[];
  v_cle text;
BEGIN
  IF v_user IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'unauthorized'); END IF;
  SELECT * INTO f FROM inventaire_fusions WHERE id = p_fusion_id AND user_id = v_user FOR UPDATE;
  IF f.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'fusion_introuvable'); END IF;
  IF f.defait_le IS NOT NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'deja_defaite'); END IF;

  SELECT array_agg((x)::bigint) INTO v_ids FROM jsonb_array_elements_text(COALESCE(f.deplacements -> 'ventes', '[]'::jsonb)) x;
  IF v_ids IS NOT NULL THEN UPDATE ventes SET inventaire_id = f.absorbe WHERE id = ANY (v_ids) AND user_id = v_user; END IF;
  SELECT array_agg((x)::bigint) INTO v_ids FROM jsonb_array_elements_text(COALESCE(f.deplacements -> 'vinted_listing_snapshots', '[]'::jsonb)) x;
  IF v_ids IS NOT NULL THEN UPDATE vinted_listing_snapshots SET inventaire_id = f.absorbe WHERE id = ANY (v_ids); END IF;
  SELECT array_agg((x)::bigint) INTO v_ids FROM jsonb_array_elements_text(COALESCE(f.deplacements -> 'vinted_republish_captures', '[]'::jsonb)) x;
  IF v_ids IS NOT NULL THEN UPDATE vinted_republish_captures SET inventaire_id = f.absorbe WHERE id = ANY (v_ids); END IF;
  IF f.deplacements ? 'fiches_annonce' THEN
    UPDATE fiches_annonce SET inventaire_id = f.absorbe WHERE inventaire_id = f.garde AND user_id = v_user;
  END IF;
  SELECT array_agg((x)::uuid) INTO v_uids FROM jsonb_array_elements_text(COALESCE(f.deplacements -> 'cross_post_jobs', '[]'::jsonb)) x;
  IF v_uids IS NOT NULL THEN UPDATE cross_post_jobs SET inventaire_id = f.absorbe WHERE id = ANY (v_uids) AND user_id = v_user; END IF;
  SELECT array_agg((x)::uuid) INTO v_uids FROM jsonb_array_elements_text(COALESCE(f.deplacements -> 'annonces_plateforme', '[]'::jsonb)) x;
  IF v_uids IS NOT NULL THEN UPDATE annonces_plateforme SET inventaire_id = f.absorbe, updated_at = now() WHERE id = ANY (v_uids) AND user_id = v_user; END IF;
  SELECT array_agg((x)::uuid) INTO v_uids FROM jsonb_array_elements_text(COALESCE(f.deplacements -> 'rapprochements', '[]'::jsonb)) x;
  IF v_uids IS NOT NULL THEN UPDATE rapprochements SET inventaire_id = f.absorbe WHERE id = ANY (v_uids) AND user_id = v_user; END IF;

  FOR v_cle IN SELECT k FROM jsonb_object_keys(COALESCE(f.champs_repris, '{}'::jsonb)) k LOOP
    IF v_cle = 'prix_achat' THEN
      UPDATE inventaire SET prix_achat = NULLIF(f.champs_repris -> 'prix_achat' ->> 'avant', '')::numeric WHERE id = f.garde;
    ELSIF v_cle = 'prix_achat_inconnu' THEN
      UPDATE inventaire SET prix_achat_inconnu = NULLIF(f.champs_repris -> 'prix_achat_inconnu' ->> 'avant', '')::boolean WHERE id = f.garde;
    ELSIF v_cle = 'description' THEN
      UPDATE inventaire SET description = f.champs_repris -> 'description' ->> 'avant' WHERE id = f.garde;
    ELSIF v_cle = 'marque' THEN
      UPDATE inventaire SET marque = f.champs_repris -> 'marque' ->> 'avant' WHERE id = f.garde;
    ELSIF v_cle = 'photos' THEN
      UPDATE inventaire SET photos = CASE WHEN jsonb_typeof(f.champs_repris -> 'photos' -> 'avant') = 'null'
                                          THEN NULL ELSE f.champs_repris -> 'photos' -> 'avant' END WHERE id = f.garde;
    ELSIF v_cle = 'vinted_identite' AND COALESCE((f.champs_repris -> 'vinted_identite' ->> 'echange')::boolean, false) THEN
      -- AJOUT 2026-09-25 après-midi : ÉCHANGE (remise en ligne). L'absorbé
      -- porte l'annonce RETIRÉE du gardé : on la libère d'abord (index unique),
      -- puis chacun reprend la sienne, disparition et dernière synchro comprises.
      UPDATE inventaire SET vinted_item_id = NULL, vinted_status = NULL, vinted_account_id = NULL WHERE id = f.absorbe;
      UPDATE inventaire
         SET vinted_item_id = f.champs_repris -> 'vinted_identite' -> 'avant' ->> 'vinted_item_id',
             vinted_status = f.champs_repris -> 'vinted_identite' -> 'avant' ->> 'vinted_status',
             vinted_account_id = f.champs_repris -> 'vinted_identite' -> 'avant' ->> 'vinted_account_id',
             vinted_catalog_id = NULLIF(f.champs_repris -> 'vinted_identite' -> 'avant' ->> 'vinted_catalog_id', '')::integer,
             vinted_view_count = NULLIF(f.champs_repris -> 'vinted_identite' -> 'avant' ->> 'vinted_view_count', '')::integer,
             vinted_favourite_count = NULLIF(f.champs_repris -> 'vinted_identite' -> 'avant' ->> 'vinted_favourite_count', '')::integer,
             listed_at_guess = NULLIF(f.champs_repris -> 'vinted_identite' -> 'avant' ->> 'listed_at_guess', '')::timestamptz,
             disparu_le = NULLIF(f.champs_repris -> 'vinted_identite' -> 'avant' ->> 'disparu_le', '')::timestamptz,
             last_synced_at = NULLIF(f.champs_repris -> 'vinted_identite' -> 'avant' ->> 'last_synced_at', '')::timestamptz
       WHERE id = f.garde;
      UPDATE inventaire
         SET vinted_item_id = f.champs_repris -> 'vinted_identite' -> 'apres' ->> 'vinted_item_id',
             vinted_status = f.champs_repris -> 'vinted_identite' -> 'apres' ->> 'vinted_status',
             vinted_account_id = f.champs_repris -> 'vinted_identite' -> 'apres' ->> 'vinted_account_id',
             vinted_catalog_id = NULLIF(f.champs_repris -> 'vinted_identite' -> 'apres' ->> 'vinted_catalog_id', '')::integer,
             vinted_view_count = NULLIF(f.champs_repris -> 'vinted_identite' -> 'apres' ->> 'vinted_view_count', '')::integer,
             vinted_favourite_count = NULLIF(f.champs_repris -> 'vinted_identite' -> 'apres' ->> 'vinted_favourite_count', '')::integer,
             listed_at_guess = NULLIF(f.champs_repris -> 'vinted_identite' -> 'apres' ->> 'listed_at_guess', '')::timestamptz,
             disparu_le = NULLIF(f.champs_repris -> 'vinted_identite' -> 'apres' ->> 'disparu_le', '')::timestamptz,
             last_synced_at = NULLIF(f.champs_repris -> 'vinted_identite' -> 'apres' ->> 'last_synced_at', '')::timestamptz
       WHERE id = f.absorbe;
    ELSIF v_cle = 'vinted_identite' THEN
      -- AJOUT 2026-09-25 : l'identité Vinted rendue à l'absorbé (le gardé la
      -- lâche d'abord : index unique (user_id, vinted_item_id)).
      UPDATE inventaire
         SET vinted_item_id = f.champs_repris -> 'vinted_identite' -> 'avant' ->> 'vinted_item_id',
             vinted_status = f.champs_repris -> 'vinted_identite' -> 'avant' ->> 'vinted_status',
             vinted_account_id = f.champs_repris -> 'vinted_identite' -> 'avant' ->> 'vinted_account_id',
             vinted_catalog_id = NULLIF(f.champs_repris -> 'vinted_identite' -> 'avant' ->> 'vinted_catalog_id', '')::integer,
             vinted_view_count = NULLIF(f.champs_repris -> 'vinted_identite' -> 'avant' ->> 'vinted_view_count', '')::integer,
             vinted_favourite_count = NULLIF(f.champs_repris -> 'vinted_identite' -> 'avant' ->> 'vinted_favourite_count', '')::integer,
             listed_at_guess = NULLIF(f.champs_repris -> 'vinted_identite' -> 'avant' ->> 'listed_at_guess', '')::timestamptz
       WHERE id = f.garde;
      UPDATE inventaire
         SET vinted_item_id = f.champs_repris -> 'vinted_identite' -> 'apres' ->> 'vinted_item_id',
             vinted_status = f.champs_repris -> 'vinted_identite' -> 'apres' ->> 'vinted_status',
             vinted_account_id = f.champs_repris -> 'vinted_identite' -> 'apres' ->> 'vinted_account_id',
             vinted_catalog_id = NULLIF(f.champs_repris -> 'vinted_identite' -> 'apres' ->> 'vinted_catalog_id', '')::integer,
             vinted_view_count = NULLIF(f.champs_repris -> 'vinted_identite' -> 'apres' ->> 'vinted_view_count', '')::integer,
             vinted_favourite_count = NULLIF(f.champs_repris -> 'vinted_identite' -> 'apres' ->> 'vinted_favourite_count', '')::integer,
             listed_at_guess = NULLIF(f.champs_repris -> 'vinted_identite' -> 'apres' ->> 'listed_at_guess', '')::timestamptz
       WHERE id = f.absorbe;
    ELSIF v_cle = 'attributs' THEN
      UPDATE inventaire SET attributs = CASE WHEN jsonb_typeof(f.champs_repris -> 'attributs' -> 'avant') = 'null'
                                             THEN NULL ELSE f.champs_repris -> 'attributs' -> 'avant' END WHERE id = f.garde;
    END IF;
  END LOOP;

  UPDATE inventaire SET fusionne_dans = NULL, fusionne_le = NULL WHERE id = f.absorbe AND user_id = v_user;
  UPDATE inventaire_fusions SET defait_le = now() WHERE id = f.id;
  -- AJOUT 2026-09-25 : une fusion défaite n'est JAMAIS refaite ni reproposée.
  UPDATE inventaire_doublons SET statut = 'defaite', decide_le = now(), decide_par = 'utilisateur'
   WHERE user_id = v_user AND least(garde, absorbe) = least(f.garde, f.absorbe) AND greatest(garde, absorbe) = greatest(f.garde, f.absorbe);
  RETURN jsonb_build_object('ok', true, 'fusion_id', f.id, 'garde', f.garde, 'absorbe', f.absorbe);
END;
$function$;

CREATE OR REPLACE FUNCTION public.inventaire_doublon_evaluer(p_a bigint, p_b bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  a inventaire%ROWTYPE; b inventaire%ROWTYPE; g inventaire%ROWTYPE; x inventaire%ROWTYPE;
  s jsonb; nv jsonb; v_niveau text; v_motif text; v_freins text[] := '{}'::text[]; v_meme_pf text;
  v_remise boolean := false;
BEGIN
  SELECT * INTO a FROM inventaire WHERE id = p_a;
  SELECT * INTO b FROM inventaire WHERE id = p_b;
  IF a.id IS NULL OR b.id IS NULL OR a.id = b.id OR a.user_id <> b.user_id THEN
    RETURN jsonb_build_object('niveau', 'ecarte', 'motif', 'paire_invalide');
  END IF;
  IF a.fusionne_dans IS NOT NULL OR b.fusionne_dans IS NOT NULL THEN
    RETURN jsonb_build_object('niveau', 'ecarte', 'motif', 'deja_fusionnee');
  END IF;
  -- ⛔ UNE DÉCISION HUMAINE EST DÉFINITIVE.
  IF EXISTS (SELECT 1 FROM inventaire_doublons d
              WHERE d.user_id = a.user_id AND d.statut IN ('refusee', 'defaite')
                AND least(d.garde, d.absorbe) = least(a.id, b.id) AND greatest(d.garde, d.absorbe) = greatest(a.id, b.id))
     OR EXISTS (SELECT 1 FROM inventaire_fusions f
              WHERE f.user_id = a.user_id AND f.defait_le IS NOT NULL
                AND ((f.garde = a.id AND f.absorbe = b.id) OR (f.garde = b.id AND f.absorbe = a.id)))
     OR EXISTS (SELECT 1 FROM rapprochements r JOIN annonces_plateforme ap ON ap.id = r.annonce_id
              WHERE r.user_id = a.user_id AND r.par = 'utilisateur' AND r.decision IN ('refus_proposition', 'detache')
                AND ((ap.inventaire_id = b.id AND r.inventaire_id = a.id) OR (ap.inventaire_id = a.id AND r.inventaire_id = b.id))) THEN
    RETURN jsonb_build_object('niveau', 'ecarte', 'motif', 'refuse_par_la_personne');
  END IF;
  -- Deux annonces Vinted = deux identités Vinted : hors de ce que la fusion sait représenter.
  -- SAUF (2026-09-25 après-midi, migration 20260925160000) la REMISE EN LIGNE :
  -- l'une retirée (closed + disparue), l'autre vivante, apparue après, même
  -- boutique — la fusion échange alors les identités.
  IF a.vinted_item_id IS NOT NULL AND b.vinted_item_id IS NOT NULL THEN
    v_remise := vinted_remise_en_ligne(a.id, b.id) OR vinted_remise_en_ligne(b.id, a.id)
             OR vinted_retraits_successifs(a.id, b.id) OR vinted_retraits_successifs(b.id, a.id);
    IF NOT v_remise THEN
      RETURN jsonb_build_object('niveau', 'ecarte', 'motif', 'deux_annonces_vinted');
    END IF;
  END IF;

  s := meme_objet_signaux(a.titre, b.titre, fiche_marque(a.marque, a.attributs), fiche_marque(b.marque, b.attributs),
                          a.prix_vente, b.prix_vente, fiche_photos_toutes(a.id), fiche_photos_toutes(b.id));
  nv := meme_objet_niveau(s);
  v_niveau := nv ->> 'niveau'; v_motif := nv ->> 'motif';
  -- AJOUT 2026-09-25 (migration 20260925154000) : sans photo qui prouve, une
  -- autre VARIANTE (un mot rare du titre court absent de l'autre) n'est pas
  -- une question — « Hochet hippopotame » / « Hochet Koala ».
  IF v_niveau = 'probable' AND v_motif = 'titre_proche'
     AND titres_variante_substituee(a.user_id, a.titre, b.titre) THEN
    v_niveau := 'ecarte'; v_motif := 'variante_substituee';
  END IF;

  -- AJOUT 2026-09-25 après-midi (migration 20260925162000) : la REMISE EN
  -- LIGNE à l'identique — même titre, retirée puis republiée dans les 24 h —
  -- n'est pas écartée par une photo retouchée (cadre ajouté par un outil de
  -- republication : 13 paires sur 13 vérifiées à l'œil, le même objet).
  IF v_remise
     AND (v_niveau = 'probable' OR (v_niveau = 'ecarte' AND v_motif = 'photos_differentes'))
     AND lower(btrim(a.titre)) = lower(btrim(b.titre))
     AND COALESCE(s ->> 'nombre', 'ok') = 'ok' AND COALESCE(s ->> 'lot', 'ok') = 'ok'
     AND ((a.disparu_le IS NOT NULL AND b.created_at BETWEEN a.disparu_le - interval '1 day' AND a.disparu_le + interval '1 day')
       OR (b.disparu_le IS NOT NULL AND a.created_at BETWEEN b.disparu_le - interval '1 day' AND b.disparu_le + interval '1 day')) THEN
    IF COALESCE(array_length(titre_jetons(a.titre), 1), 0) >= 3 THEN
      v_niveau := 'certain'; v_motif := 'remise_en_ligne_titre_identique';
    ELSE
      v_niveau := 'probable'; v_motif := 'remise_en_ligne_titre_court';
    END IF;
  END IF;

  -- LE CONTEXTE, que ni le titre ni la photo ne savent :
  -- une fiche vendue (autre unité ? vente à rattacher ?) → jamais d'ici ;
  IF v_niveau <> 'ecarte' AND (a.statut IS DISTINCT FROM 'stock' OR b.statut IS DISTINCT FROM 'stock') THEN
    v_niveau := 'ecarte'; v_motif := 'fiche_vendue';
  END IF;
  -- plusieurs exemplaires en stock → la personne tranche ;
  IF v_niveau = 'certain' AND (COALESCE(a.quantite, 1) > 1 OR COALESCE(b.quantite, 1) > 1) THEN
    v_niveau := 'probable'; v_motif := 'quantite';
  END IF;
  -- (2026-09-25 après-midi) remise en ligne, mais PLUSIEURS exemplaires vivants
  -- du même titre sur le compte : lequel est la remise en ligne ? La personne tranche.
  IF v_remise AND v_niveau = 'certain' AND (
       SELECT count(*) FROM inventaire o
        WHERE o.user_id = a.user_id
          AND o.fusionne_dans IS NULL AND o.statut = 'stock'
          AND o.vinted_item_id IS NOT NULL AND o.disparu_le IS NULL
          AND lower(btrim(o.titre)) IN (lower(btrim(a.titre)), lower(btrim(b.titre)))) >= 2 THEN
    v_niveau := 'probable'; v_motif := 'plusieurs_exemplaires_vivants';
  END IF;
  -- deux annonces VIVANTES distinctes sur la même plateforme → la personne tranche.
  IF v_niveau <> 'ecarte' THEN
    SELECT string_agg(DISTINCT va.platform, ',') INTO v_meme_pf
      FROM fiche_annonces_vivantes(a.id) va
      JOIN fiche_annonces_vivantes(b.id) vb ON vb.platform = va.platform AND vb.listing_id <> va.listing_id
     WHERE NOT EXISTS (SELECT 1 FROM fiche_annonces_vivantes(a.id) x2 JOIN fiche_annonces_vivantes(b.id) y2
                          ON y2.platform = x2.platform AND y2.listing_id = x2.listing_id
                        WHERE x2.platform = va.platform);
    IF v_meme_pf IS NOT NULL AND v_niveau = 'certain' THEN
      v_niveau := 'probable'; v_motif := 'deux_annonces_meme_plateforme';
    END IF;
  END IF;

  -- QUI GARDE : la fiche créée par la personne quand l'autre vient d'un relevé
  -- ou du dressing ; sinon la plus ancienne. L'identité Vinted suit (fusion).
  IF (b.origine IS NULL OR b.origine = 'fillsell') AND (a.origine LIKE 'releve\_%' OR a.origine = 'vinted_sync') THEN
    g := b; x := a;
  ELSIF (a.origine IS NULL OR a.origine = 'fillsell') AND (b.origine LIKE 'releve\_%' OR b.origine = 'vinted_sync') THEN
    g := a; x := b;
  ELSIF a.created_at <= b.created_at THEN g := a; x := b;
  ELSE g := b; x := a;
  END IF;
  -- LES FREINS de la fiche qui disparaîtrait : ce que la personne y a mis.
  IF EXISTS (SELECT 1 FROM cross_post_jobs j WHERE j.inventaire_id = x.id AND j.status IN ('pending', 'processing', 'needs_user')) THEN
    v_freins := v_freins || 'job_actif'::text;
  END IF;
  IF EXISTS (SELECT 1 FROM ventes v WHERE v.inventaire_id = x.id) THEN v_freins := v_freins || 'ventes'::text; END IF;
  IF EXISTS (SELECT 1 FROM fiches_annonce fa WHERE fa.inventaire_id = x.id)
     AND EXISTS (SELECT 1 FROM fiches_annonce fa WHERE fa.inventaire_id = g.id) THEN
    v_freins := v_freins || 'deux_fiches_annonce'::text;
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_each(CASE WHEN jsonb_typeof(x.attributs) = 'object' THEN x.attributs ELSE '{}'::jsonb END) e
              WHERE jsonb_typeof(e.value) = 'object' AND e.value ->> 'source' = 'manuel') THEN
    v_freins := v_freins || 'saisie_manuelle'::text;
  END IF;
  IF g.prix_achat IS NOT NULL AND x.prix_achat IS NOT NULL AND g.prix_achat <> x.prix_achat THEN
    v_freins := v_freins || 'deux_prix_achat'::text;
  END IF;
  IF v_niveau = 'certain' AND COALESCE(array_length(v_freins, 1), 0) > 0 THEN
    v_niveau := 'probable'; v_motif := 'a_trancher';
  END IF;

  RETURN jsonb_build_object('niveau', v_niveau, 'motif', v_motif, 'garde', g.id, 'absorbe', x.id,
                            'signaux', s, 'freins', to_jsonb(v_freins), 'deux_annonces', v_meme_pf)
         || CASE WHEN v_remise THEN jsonb_build_object('remise_en_ligne_vinted', true) ELSE '{}'::jsonb END;
END;
$function$;

CREATE OR REPLACE FUNCTION public.inventaire_doublons_pour(p_fiche bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  f inventaire%ROWTYPE; v_jb text[]; v_out jsonb := '[]'::jsonb; v_c record; v_e jsonb;
  n_certains integer; n_photo integer; n_inconnus integer;
BEGIN
  SELECT * INTO f FROM inventaire WHERE id = p_fiche;
  IF f.id IS NULL OR f.fusionne_dans IS NOT NULL OR f.statut IS DISTINCT FROM 'stock' THEN RETURN '[]'::jsonb; END IF;
  v_jb := titre_jetons(f.titre);
  IF COALESCE(array_length(v_jb, 1), 0) = 0 THEN RETURN '[]'::jsonb; END IF;
  FOR v_c IN
    SELECT i.id FROM inventaire i
     WHERE i.user_id = f.user_id AND i.id <> f.id AND i.fusionne_dans IS NULL AND i.statut = 'stock'
       AND (i.created_at < f.created_at OR (i.created_at = f.created_at AND i.id < f.id))
       AND (i.vinted_item_id IS NULL OR f.vinted_item_id IS NULL
            OR vinted_remise_en_ligne(i.id, f.id) OR vinted_remise_en_ligne(f.id, i.id)
            OR vinted_retraits_successifs(i.id, f.id) OR vinted_retraits_successifs(f.id, i.id))
       AND titre_jetons(i.titre) && v_jb
  LOOP
    v_e := inventaire_doublon_evaluer(v_c.id, f.id);
    IF v_e ->> 'niveau' <> 'ecarte' THEN
      v_out := v_out || jsonb_build_array(v_e || jsonb_build_object('candidat', v_c.id));
    END IF;
  END LOOP;
  SELECT count(*) FILTER (WHERE e ->> 'niveau' = 'certain'),
         count(*) FILTER (WHERE e -> 'signaux' -> 'photo' ->> 'verdict' = 'identique'),
         count(*) FILTER (WHERE e -> 'signaux' -> 'photo' ->> 'verdict' = 'inconnue' AND (e -> 'signaux' ->> 'ov')::numeric >= 0.75)
    INTO n_certains, n_photo, n_inconnus
    FROM jsonb_array_elements(v_out) e;
  IF n_certains > 1 OR (n_certains = 1 AND (n_photo > 1 OR (n_inconnus > 0 AND n_photo = 1))) THEN
    SELECT COALESCE(jsonb_agg(CASE WHEN e ->> 'niveau' = 'certain'
                                   THEN e || jsonb_build_object('niveau', 'probable', 'motif', 'plusieurs_candidats')
                                   ELSE e END), '[]'::jsonb)
      INTO v_out FROM jsonb_array_elements(v_out) e;
  END IF;
  RETURN v_out;
END;
$function$;

CREATE OR REPLACE FUNCTION public.inventaire_supprimer_sans_retrait(p_inventaire bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  i inventaire%ROWTYPE;
  j record;
  v_lid text;
  n_annonces integer := 0;
  n_jobs integer := 0;
  v_pf jsonb;
BEGIN
  IF v_user IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'unauthorized'); END IF;
  SELECT * INTO i FROM inventaire WHERE id = p_inventaire AND user_id = v_user FOR UPDATE;
  IF i.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'article_introuvable'); END IF;

  FOR j IN
    SELECT platform, listing_url, platform_listing_id, title, price
    FROM cross_post_jobs
    WHERE user_id = v_user AND inventaire_id = p_inventaire
      AND action IN ('publish', 'republish') AND status = 'published'
      AND (NULLIF(trim(COALESCE(platform_listing_id, '')), '') IS NOT NULL
           OR NULLIF(trim(COALESCE(listing_url, '')), '') IS NOT NULL)
    ORDER BY COALESCE(published_at, created_at) DESC
  LOOP
    v_lid := COALESCE(NULLIF(trim(COALESCE(j.platform_listing_id, '')), ''), trim(j.listing_url));
    INSERT INTO annonces_plateforme (user_id, platform, listing_id, url, titre, prix,
                                     photo_url, statut_plateforme, inventaire_id, job_id,
                                     source_rapprochement, vu_le, updated_at, fiche_supprimee_le)
    VALUES (v_user, j.platform, v_lid, NULLIF(trim(COALESCE(j.listing_url, '')), ''),
            COALESCE(NULLIF(trim(COALESCE(j.title, '')), ''), i.titre), COALESCE(j.price, i.prix_vente),
            CASE WHEN jsonb_typeof(i.photos) = 'array' AND jsonb_array_length(i.photos) > 0
                 THEN i.photos ->> 0 ELSE NULL END,
            'en_ligne', NULL, NULL, NULL, now(), now(), now())
    ON CONFLICT (user_id, platform, listing_id) DO UPDATE
      SET inventaire_id = NULL, job_id = NULL, source_rapprochement = NULL,
          proposition = NULL, disparu_le = NULL, ignoree_le = NULL,
          -- Le geste du vendeur, daté : l'import automatique ne ressuscite
          -- pas cette fiche (2026-09-24, cf. rapprocher_traiter_annonce).
          fiche_supprimee_le = now(),
          statut_plateforme = 'en_ligne', updated_at = now();
    n_annonces := n_annonces + 1;
  END LOOP;

  FOR j IN
    SELECT id, platform_fields FROM cross_post_jobs
    WHERE user_id = v_user AND inventaire_id = p_inventaire
      AND status IN ('published', 'pending', 'processing', 'needs_user', 'failed')
  LOOP
    v_pf := COALESCE(j.platform_fields, '{}'::jsonb)
            || jsonb_build_object('fiche_supprimee_le', now(), 'annonces_laissees_en_ligne', true);
    UPDATE cross_post_jobs
       SET status = 'cancelled', platform_fields = v_pf,
           error = 'Fiche supprimée du stock, annonce laissée en ligne — aucun retrait demandé'
     WHERE id = j.id;
    n_jobs := n_jobs + 1;
  END LOOP;

  UPDATE ventes SET inventaire_id = NULL WHERE inventaire_id = p_inventaire AND user_id = v_user;

  DELETE FROM inventaire WHERE id = p_inventaire AND user_id = v_user;
  RETURN jsonb_build_object('ok', true, 'annonces_laissees', n_annonces, 'jobs_clos', n_jobs);
END;
$function$;

CREATE OR REPLACE FUNCTION public.planifier_premiers_releves(p_user uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_ext timestamptz; v_ver text; v_ps jsonb; v_s jsonb; v_verite jsonb;
  v_decl jsonb; v_ecart jsonb; v_min integer; v_code integer; v_multi boolean;
  v_out jsonb := '{}'::jsonb; pf text; v_etat text; v_id uuid;
  v_n integer; v_dernier timestamptz;
BEGIN
  IF p_user IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'unauthorized'); END IF;
  IF auth.uid() IS NOT NULL AND auth.uid() <> p_user THEN RETURN jsonb_build_object('ok', false, 'reason', 'unauthorized'); END IF;
  SELECT extension_last_seen_at, extension_version, COALESCE(platform_settings, '{}'::jsonb), extension_sessions
    INTO v_ext, v_ver, v_ps, v_s FROM profiles WHERE id = p_user;
  IF v_ext IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'extension_jamais_vue'); END IF;
  v_decl  := CASE WHEN jsonb_typeof(v_ps -> 'plateformes_vendeur')  = 'array' THEN v_ps -> 'plateformes_vendeur'  ELSE '[]'::jsonb END;
  v_ecart := CASE WHEN jsonb_typeof(v_ps -> 'plateformes_ecartees') = 'array' THEN v_ps -> 'plateformes_ecartees' ELSE '[]'::jsonb END;
  v_verite := plateformes_verite(p_user);
  v_multi := sync_multi_ouverte_pour(p_user);
  SELECT value INTO v_min FROM coin_config WHERE key = 'sync_multi_extension_min';
  v_min := COALESCE(v_min, 642);
  v_code := CASE WHEN v_ver ~ '^\d+\.\d+\.\d+' THEN
      (split_part(v_ver, '.', 1))::integer * 10000 + (split_part(v_ver, '.', 2))::integer * 100
      + (regexp_replace(split_part(v_ver, '.', 3), '\D.*$', ''))::integer ELSE 0 END;
  -- La purge des demandes périmées est un confort : sous le rôle authenticated
  -- (app, trigger déclenché par l'extension) son EXECUTE n'est pas accordé, et
  -- ce refus abandonnait TOUTE la planification (24/09 10:25, « permission
  -- denied for function purger_sync_queue_perimee »). On la tente, sans jamais
  -- en dépendre ; le cron et le service role la font passer de toute façon.
  BEGIN
    PERFORM purger_sync_queue_perimee(p_user);
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
  IF (v_ecart ? 'vinted') THEN
    v_out := v_out || jsonb_build_object('vinted', 'ecartee');
  ELSIF NOT ((v_decl ? 'vinted') OR (v_s ->> 'vinted') = 'true') THEN
    v_out := v_out || jsonb_build_object('vinted', 'non_declaree');
  ELSIF (v_s ->> 'vinted') = 'false' THEN
    v_out := v_out || jsonb_build_object('vinted', 'pas_connectee');
  ELSIF version_cle(v_ver) IS NULL OR version_cle(v_ver) < version_cle('0.5.0') THEN
    v_out := v_out || jsonb_build_object('vinted', 'extension_trop_ancienne');
  ELSIF EXISTS (SELECT 1 FROM vinted_sync_runs WHERE user_id = p_user AND kind = 'dressing' AND status NOT IN ('expired', 'cancelled')) THEN
    v_out := v_out || jsonb_build_object('vinted', 'deja_un_releve');
  ELSE
    BEGIN
      INSERT INTO vinted_sync_runs (user_id, kind, status, declencheur, queued_at)
      VALUES (p_user, 'dressing', 'queued', 'serveur:premier_releve', now()) RETURNING id INTO v_id;
      v_out := v_out || jsonb_build_object('vinted', 'queued');
    EXCEPTION WHEN unique_violation THEN v_out := v_out || jsonb_build_object('vinted', 'deja_en_file'); END;
  END IF;
  FOREACH pf IN ARRAY ARRAY['leboncoin', 'beebs', 'ebay', 'opla'] LOOP
    v_etat := v_verite -> 'plateformes' -> pf ->> 'etat';
    IF (v_ecart ? pf) THEN v_out := v_out || jsonb_build_object(pf, 'ecartee'); CONTINUE; END IF;
    IF NOT v_multi THEN v_out := v_out || jsonb_build_object(pf, 'releve_ferme'); CONTINUE; END IF;
    IF v_min > 0 AND v_code < v_min THEN v_out := v_out || jsonb_build_object(pf, 'extension_trop_ancienne'); CONTINUE; END IF;
    IF NOT ((v_decl ? pf) OR v_etat = 'connectee') THEN v_out := v_out || jsonb_build_object(pf, 'non_declaree'); CONTINUE; END IF;
    IF v_etat IN ('a_connecter', 'a_autoriser') THEN v_out := v_out || jsonb_build_object(pf, 'pas_connectee'); CONTINUE; END IF;
    -- eBay relié par l'API : le relevé passe par le navigateur ; on ne le
    -- retient que si la session eBay du navigateur est PROUVÉE fermée (sonde
    -- ou Hub à false), plus sur un Hub simplement inconnu (2026-09-24) — « le
    -- relevé est la sonde la plus précise ».
    IF pf = 'ebay' AND (v_verite -> 'plateformes' -> 'ebay' ->> 'source') = 'api'
       AND ((v_s ->> 'ebay_hub') = 'false' OR (v_s ->> 'ebay') = 'false') THEN
      v_out := v_out || jsonb_build_object(pf, 'api_sans_session_navigateur'); CONTINUE;
    END IF;
    IF EXISTS (SELECT 1 FROM vinted_sync_runs WHERE user_id = p_user AND kind = 'annonces' AND platform = pf AND status = 'done') THEN
      v_out := v_out || jsonb_build_object(pf, 'deja_un_releve'); CONTINUE;
    END IF;
    IF EXISTS (SELECT 1 FROM vinted_sync_runs WHERE user_id = p_user AND kind = 'annonces' AND platform = pf AND status IN ('queued', 'running')) THEN
      v_out := v_out || jsonb_build_object(pf, 'deja_en_file'); CONTINUE;
    END IF;
    -- Retentative BORNÉE (2026-09-24) : un relevé qui n'a rien donné (failed,
    -- absente, expired) est reposé au plus 3 fois, jamais à moins de 6 h du
    -- précédent, et seulement si la plateforme a été re-sondée depuis — jamais
    -- une rafale sur une sonde figée en 403.
    SELECT count(*), max(COALESCE(finished_at, queued_at)) INTO v_n, v_dernier FROM vinted_sync_runs
     WHERE user_id = p_user AND kind = 'annonces' AND platform = pf AND declencheur LIKE 'serveur:premier_releve%';
    IF v_n >= 3 THEN v_out := v_out || jsonb_build_object(pf, 'essais_epuises'); CONTINUE; END IF;
    IF v_dernier IS NOT NULL AND v_dernier > now() - interval '6 hours' THEN
      v_out := v_out || jsonb_build_object(pf, 'attente'); CONTINUE;
    END IF;
    IF v_dernier IS NOT NULL AND COALESCE((v_verite -> 'plateformes' -> pf ->> 'sonde_le')::timestamptz, v_dernier) <= v_dernier THEN
      v_out := v_out || jsonb_build_object(pf, 'attente_fait_nouveau'); CONTINUE;
    END IF;
    BEGIN
      INSERT INTO vinted_sync_runs (user_id, kind, platform, status, declencheur, queued_at)
      VALUES (p_user, 'annonces', pf, 'queued', 'serveur:premier_releve', now()) RETURNING id INTO v_id;
      v_out := v_out || jsonb_build_object(pf, 'queued');
    EXCEPTION WHEN unique_violation THEN v_out := v_out || jsonb_build_object(pf, 'deja_en_file'); END;
  END LOOP;
  RETURN jsonb_build_object('ok', true, 'plateformes', v_out);
END;
$function$;

CREATE OR REPLACE FUNCTION public.rapprochement_decider(p_annonce_id uuid, p_decision text, p_inventaire_id bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  a annonces_plateforme%ROWTYPE;
  v_inv bigint; v_job uuid; v_job_pf jsonb;
BEGIN
  IF v_user IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'unauthorized'); END IF;
  SELECT * INTO a FROM annonces_plateforme WHERE id = p_annonce_id AND user_id = v_user;
  IF a.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'annonce_introuvable'); END IF;
  -- ⛔ HORS « MES ANNONCES » (2026-09-25 nuit) : ni rattachée à une fiche, ni
  --    importée. « ignore », « detache » et « refus_proposition » restent permis.
  IF p_decision IN ('attache', 'import') AND releve_run_hors_liste(a.run_id) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'hors_liste');
  END IF;

  -- ⛔ 2026-09-26 (labouquinerie85) : UNE ANNONCE QUI N'EST PLUS EN LIGNE NE SE
  --    RATTACHE PAS. Plus en ligne (disparu_le), ou retrait demandé / en cours
  --    / abouti depuis la dernière fois qu'un relevé l'a vue. Le 25/09, quatre
  --    annonces retirées par FillSell ont été proposées « à rattacher » comme
  --    vivantes ; deux ont été rattachées à d'autres livres.
  IF p_decision IN ('attache', 'import') THEN
    IF a.disparu_le IS NOT NULL THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'annonce_plus_en_ligne',
        'message', 'Cette annonce n''est plus en ligne : il n''y a plus rien à rattacher.');
    END IF;
    IF EXISTS (SELECT 1 FROM cross_post_jobs d
                WHERE d.user_id = v_user AND d.platform = a.platform AND d.action = 'delete'
                  AND d.status IN ('pending', 'processing', 'needs_user', 'deleted')
                  AND d.created_at >= COALESCE(a.vu_le, a.created_at)
                  AND listing_designe(a.listing_id, d.listing_url, d.platform_listing_id)) THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'annonce_retiree',
        'message', 'FillSell a retiré cette annonce (ou est en train de le faire) : il n''y a plus rien à rattacher.');
    END IF;
  END IF;

  IF p_decision = 'attache' THEN
    v_inv := COALESCE(p_inventaire_id, NULLIF(a.proposition ->> 'inventaire_id', '')::bigint);
    IF v_inv IS NULL OR NOT EXISTS (SELECT 1 FROM inventaire i WHERE i.id = v_inv AND i.user_id = v_user) THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'article_introuvable');
    END IF;
    v_job := NULLIF(a.proposition ->> 'job_id', '')::uuid;
    IF v_job IS NOT NULL AND NOT EXISTS (SELECT 1 FROM cross_post_jobs j WHERE j.id = v_job AND j.user_id = v_user AND j.inventaire_id = v_inv AND j.platform = a.platform AND j.status = 'published') THEN
      v_job := NULL;
    END IF;
    IF v_job IS NULL THEN
      SELECT j.id INTO v_job FROM cross_post_jobs j
      WHERE j.user_id = v_user AND j.inventaire_id = v_inv AND j.platform = a.platform
        AND j.action IN ('publish', 'republish') AND j.status = 'published'
      ORDER BY COALESCE(j.published_at, j.created_at) DESC LIMIT 1;
    END IF;
    -- ⛔ 2026-09-26 (labouquinerie85) : ON NE DÉCROCHE JAMAIS UNE ANNONCE VIVANTE.
    --    Le job de la fiche ne se recâble que si l'annonce qu'il suit n'est
    --    plus en ligne (le cas « annonce remplacée »). Sinon la fiche porte deux
    --    annonces sur la plateforme : l'annonce rattachée reçoit SON job de
    --    suivi, l'autre garde le sien. Le 25/09, deux jobs Opla ont quitté leur
    --    annonce vivante pour une annonce retirée ; parc : 26 sur 30.
    IF v_job IS NOT NULL AND EXISTS (
         SELECT 1 FROM annonces_plateforme x, cross_post_jobs jx
          WHERE jx.id = v_job AND x.user_id = v_user AND x.platform = a.platform
            AND x.id <> a.id AND x.disparu_le IS NULL
            AND (x.job_id = v_job OR listing_designe(x.listing_id, jx.listing_url, jx.platform_listing_id))) THEN
      v_job := NULL;
    END IF;
    IF v_job IS NOT NULL THEN
      PERFORM rapprocher_recabler_job(v_job, a.url, a.listing_id, 'utilisateur', jsonb_build_object('annonce_id', a.id));
    ELSE
      v_job := rapprocher_job_de_suivi(v_user, a.platform, v_inv, a.titre, a.prix, a.url, a.listing_id, 'utilisateur', jsonb_build_object('annonce_id', a.id));
    END IF;
    UPDATE annonces_plateforme SET inventaire_id = v_inv, job_id = v_job, source_rapprochement = 'manuel', proposition = NULL, ignoree_le = NULL, fiche_supprimee_le = NULL, updated_at = now() WHERE id = a.id;
    INSERT INTO rapprochements (user_id, annonce_id, inventaire_id, decision, par, score, detail)
    VALUES (v_user, a.id, v_inv, 'attache', 'utilisateur', 1, jsonb_build_object('job_id', v_job));
    RETURN jsonb_build_object('ok', true, 'decision', 'attache', 'inventaire_id', v_inv, 'job_id', v_job);

  ELSIF p_decision = 'refus_proposition' THEN
    UPDATE annonces_plateforme SET proposition = NULL, updated_at = now() WHERE id = a.id;
    INSERT INTO rapprochements (user_id, annonce_id, inventaire_id, decision, par, detail)
    VALUES (v_user, a.id, NULLIF(a.proposition ->> 'inventaire_id', '')::bigint, 'refus_proposition', 'utilisateur', COALESCE(a.proposition, '{}'::jsonb));
    RETURN jsonb_build_object('ok', true, 'decision', 'refus_proposition');

  ELSIF p_decision = 'ignore' THEN
    UPDATE annonces_plateforme SET ignoree_le = now(), proposition = NULL, updated_at = now() WHERE id = a.id;
    INSERT INTO rapprochements (user_id, annonce_id, decision, par) VALUES (v_user, a.id, 'ignore', 'utilisateur');
    RETURN jsonb_build_object('ok', true, 'decision', 'ignore');

  ELSIF p_decision = 'import' THEN
    RETURN rapprocher_importer(v_user, a.id, 'utilisateur');

  ELSIF p_decision = 'detache' THEN
    IF a.job_id IS NOT NULL THEN
      SELECT platform_fields INTO v_job_pf FROM cross_post_jobs WHERE id = a.job_id AND user_id = v_user;
      IF v_job_pf ->> 'source' = 'releve' THEN
        UPDATE cross_post_jobs SET status = 'cancelled',
               platform_fields = COALESCE(platform_fields, '{}'::jsonb) || jsonb_build_object('detache_le', now()),
               error = 'Rattachement défait par l''utilisateur — pas une vente'
         WHERE id = a.job_id AND user_id = v_user;
      ELSIF v_job_pf ? 'listing_url_precedente' THEN
        UPDATE cross_post_jobs SET listing_url = v_job_pf ->> 'listing_url_precedente',
               platform_listing_id = v_job_pf -> 'rattachement' ->> 'ancien_listing_id',
               platform_fields = (platform_fields - ARRAY['rattachement', 'listing_url_precedente']) || jsonb_build_object('detache_le', now()),
               last_checked_at = NULL
         WHERE id = a.job_id AND user_id = v_user;
      END IF;
    END IF;
    UPDATE annonces_plateforme SET inventaire_id = NULL, job_id = NULL, source_rapprochement = NULL, proposition = NULL, updated_at = now() WHERE id = a.id;
    INSERT INTO rapprochements (user_id, annonce_id, inventaire_id, decision, par, detail)
    VALUES (v_user, a.id, a.inventaire_id, 'detache', 'utilisateur', jsonb_build_object('job_id', a.job_id));
    RETURN jsonb_build_object('ok', true, 'decision', 'detache');
  END IF;
  RETURN jsonb_build_object('ok', false, 'reason', 'decision_inconnue');
END;
$function$;

CREATE OR REPLACE FUNCTION public.rapprochement_photos_decider(p_limite integer DEFAULT 20)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_a record; v_f record; v_r text; v_cands jsonb; v_e jsonb; v_fus jsonb; v_jb text[];
  n_attache integer := 0; n_ambigu integer := 0; n_reste integer := 0;
  n_examinees integer := 0; n_fusions integer := 0; n_propositions integer := 0; n_attente integer := 0;
  v_debut timestamptz := clock_timestamp();
BEGIN
  -- (a) annonces proposées dont les photos sont résolues
  FOR v_a IN
    SELECT ap.* FROM annonces_plateforme ap
     WHERE ap.inventaire_id IS NULL AND ap.ignoree_le IS NULL AND ap.disparu_le IS NULL AND ap.proposition IS NOT NULL
       AND NOT (ap.proposition ? 'photo_evaluee_le')
     ORDER BY ap.updated_at DESC
     LIMIT greatest(p_limite, 0) * 3
  LOOP
    EXIT WHEN clock_timestamp() - v_debut > interval '20 seconds';
    IF NOT urls_resolues(annonce_photos_urls(v_a.photo_url, v_a.capture, 3)
                         || COALESCE((SELECT array_agg(u) FROM (
                              SELECT unnest(fiche_photos_toutes(NULLIF(c ->> 'inventaire_id', '')::bigint)) u
                                FROM jsonb_array_elements(CASE WHEN jsonb_typeof(v_a.proposition -> 'candidats') = 'array'
                                                               THEN v_a.proposition -> 'candidats' ELSE '[]'::jsonb END) c
                              UNION SELECT unnest(fiche_photos_toutes(NULLIF(v_a.proposition ->> 'inventaire_id', '')::bigint))) z), '{}'::text[])) THEN
      CONTINUE;
    END IF;
    v_r := rapprocher_confirmer_photo(v_a.id);
    IF v_r = 'attache' THEN n_attache := n_attache + 1;
    ELSE
      IF v_r = 'ambigu' THEN n_ambigu := n_ambigu + 1; ELSE n_reste := n_reste + 1; END IF;
      UPDATE annonces_plateforme
         SET proposition = proposition || jsonb_build_object('photo_evaluee_le', now(), 'photo_verdict', v_r)
       WHERE id = v_a.id AND inventaire_id IS NULL AND proposition IS NOT NULL;
    END IF;
  END LOOP;

  -- (b) fiches importées : examinées UNE fois, quand leurs photos (et celles de
  --     leurs jumelles de titre) sont résolues
  FOR v_f IN SELECT i.* FROM inventaire i WHERE i.id IN (SELECT doublons_fiches_a_examiner(greatest(p_limite, 0))) ORDER BY i.created_at LOOP
    EXIT WHEN clock_timestamp() - v_debut > interval '40 seconds';
    v_jb := titre_jetons(v_f.titre);
    IF NOT urls_resolues(fiche_photos_toutes(v_f.id)
                         || COALESCE((SELECT array_agg(u) FROM (
                              SELECT unnest(fiche_photos_toutes(j.id)) u FROM (
                                SELECT i.id FROM inventaire i
                                 WHERE i.user_id = v_f.user_id AND i.id <> v_f.id AND i.fusionne_dans IS NULL AND i.statut = 'stock'
                                   AND (i.created_at < v_f.created_at OR (i.created_at = v_f.created_at AND i.id < v_f.id))
                                   AND titre_jetons(i.titre) && v_jb
                                   AND NOT titres_variantes_incompatibles(i.titre, v_f.titre)
                                 LIMIT 10) j) z), '{}'::text[]))
       AND v_f.created_at > now() - interval '2 hours' THEN
      -- on attend les empreintes (au plus 2 h : au-delà on décide sans elles)
      n_attente := n_attente + 1;
      CONTINUE;
    END IF;
    v_cands := inventaire_doublons_pour(v_f.id);
    n_examinees := n_examinees + 1;
    v_fus := NULL;
    FOR v_e IN SELECT e FROM jsonb_array_elements(v_cands) e ORDER BY (e ->> 'niveau' = 'certain') DESC LOOP
      IF v_e ->> 'niveau' = 'certain' AND v_fus IS NULL THEN
        v_fus := inventaire_fusionner_pour(v_f.user_id, (v_e ->> 'garde')::bigint, (v_e ->> 'absorbe')::bigint,
                                           'auto (doublon certain : ' || COALESCE(v_e ->> 'motif', '') || ')');
        IF COALESCE((v_fus ->> 'ok')::boolean, false) THEN
          n_fusions := n_fusions + 1;
          INSERT INTO inventaire_doublons (user_id, garde, absorbe, niveau, statut, motif, preuves, source, fusion_id, decide_le, decide_par)
          VALUES (v_f.user_id, (v_e ->> 'garde')::bigint, (v_e ->> 'absorbe')::bigint, 'certain', 'fusionnee', v_e ->> 'motif',
                  v_e, 'balayage', NULLIF(v_fus ->> 'fusion_id', '')::uuid, now(), 'auto')
          ON CONFLICT DO NOTHING;
        END IF;
      ELSIF v_e ->> 'niveau' IN ('probable', 'certain') THEN
        INSERT INTO inventaire_doublons (user_id, garde, absorbe, niveau, statut, motif, preuves, source)
        VALUES (v_f.user_id, (v_e ->> 'garde')::bigint, (v_e ->> 'absorbe')::bigint, 'probable', 'proposee', v_e ->> 'motif', v_e, 'balayage')
        ON CONFLICT DO NOTHING;
        IF FOUND THEN n_propositions := n_propositions + 1; END IF;
      END IF;
    END LOOP;
    INSERT INTO inventaire_doublons_verifies (inventaire_id, user_id, resultat)
    VALUES (v_f.id, v_f.user_id, jsonb_build_object('candidats', jsonb_array_length(v_cands), 'fusion', v_fus))
    ON CONFLICT (inventaire_id) DO UPDATE
      SET verifie_le = now(),
          resultat = inventaire_doublons_verifies.resultat || EXCLUDED.resultat || jsonb_build_object('revue_le', now());
  END LOOP;

  -- (c) propositions devenues sans objet (une des deux fiches fusionnée ailleurs, vendue ou supprimée)
  UPDATE inventaire_doublons d SET statut = 'caduque', decide_le = now(), decide_par = 'auto'
   WHERE d.statut = 'proposee'
     AND (NOT EXISTS (SELECT 1 FROM inventaire i WHERE i.id = d.garde AND i.fusionne_dans IS NULL AND i.statut = 'stock')
       OR NOT EXISTS (SELECT 1 FROM inventaire i WHERE i.id = d.absorbe AND i.fusionne_dans IS NULL AND i.statut = 'stock'));

  RETURN jsonb_build_object('annonces_rattachees', n_attache, 'annonces_ambigues', n_ambigu, 'annonces_restees_proposees', n_reste,
                            'fiches_examinees', n_examinees, 'fiches_en_attente_photos', n_attente,
                            'fusions', n_fusions, 'propositions', n_propositions,
                            'duree_ms', round(extract(epoch FROM clock_timestamp() - v_debut) * 1000));
END;
$function$;

CREATE OR REPLACE FUNCTION public.rapprocher_classer(p_user uuid, p_platform text, p_listing_id text, p_url text, p_titre text, p_prix numeric, p_vus text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_t      text := titre_norm(p_titre);
  v_id     text := nullif(btrim(coalesce(p_listing_id, '')), '');
  v_job    record;
  v_job_clos record;
  v_cands  jsonb := '[]'::jsonb;
  v_c      record;
  v_n      integer := 0;
  v_best   jsonb := NULL;
  v_prix_connu boolean;
  v_prix_ok boolean;
  v_homonymes integer;
  v_motif  text;
  v_ja     text[];
  v_cf     jsonb := '[]'::jsonb;
  v_nf     integer := 0;
  v_identiques boolean := false;
  v_sortie jsonb;
BEGIN
  -- ⛔ UN IDENTIFIANT VIDE N'IDENTIFIE RIEN. Sans cette garde,
  --    `position('' in <url>) > 0` est vrai pour tous les jobs et la fonction
  --    rend « identifiant » sur le dernier job publié du compte (cf. en-tête).
  IF v_id IS NOT NULL THEN
    SELECT j.id, j.inventaire_id INTO v_job FROM cross_post_jobs j
    WHERE j.user_id = p_user AND j.platform = p_platform
      AND j.action IN ('publish', 'republish') AND j.status = 'published'
      AND (j.platform_listing_id = v_id
           OR (v_id ~ '^\d+$' AND COALESCE(j.listing_url, '') ~ ('(^|[^0-9])' || v_id || '([^0-9]|$)'))
           OR (v_id !~ '^\d+$' AND position(v_id in COALESCE(j.listing_url, '')) > 0))
    ORDER BY COALESCE(j.published_at, j.created_at) DESC LIMIT 1;
    IF v_job.id IS NOT NULL THEN
      RETURN jsonb_build_object('bande', 'job', 'inventaire_id', v_job.inventaire_id, 'job_id', v_job.id, 'score', 1, 'motif', 'identifiant');
    END IF;
    -- ⛔ 2026-09-25 (Ornella) : un dépôt FillSell CLOS — 'cancelled' (« je l'ai
    --    retirée », frère d'une vente) ou 'sold' — dont l'identifiant est
    --    RETROUVÉ par un relevé désigne toujours SA fiche, même 'vendu'.
    --    Sans ce bloc : « aucun_candidat » → import → doublon (5 annonces LBC,
    --    rattrapage du 23/09 16:35). Identifiant seulement, jamais le titre.
    SELECT j.id, j.inventaire_id, i.statut INTO v_job_clos
      FROM cross_post_jobs j
      JOIN inventaire i ON i.id = j.inventaire_id AND i.user_id = p_user AND i.fusionne_dans IS NULL
     WHERE j.user_id = p_user AND j.platform = p_platform
       AND j.action IN ('publish', 'republish') AND j.status IN ('cancelled', 'sold')
       -- un rattachement DÉFAIT par la personne (detache_le) ne se refait jamais tout seul
       AND NOT (COALESCE(j.platform_fields, '{}'::jsonb) ? 'detache_le')
       AND (j.platform_listing_id = v_id
            OR (v_id ~ '^\d+$' AND COALESCE(j.listing_url, '') ~ ('(^|[^0-9])' || v_id || '([^0-9]|$)'))
            OR (v_id !~ '^\d+$' AND position(v_id in COALESCE(j.listing_url, '')) > 0))
     ORDER BY COALESCE(j.published_at, j.created_at) DESC LIMIT 1;
    IF v_job_clos.id IS NOT NULL THEN
      RETURN jsonb_build_object('bande', 'job_clos', 'inventaire_id', v_job_clos.inventaire_id, 'job_id', v_job_clos.id,
                                'statut_fiche', v_job_clos.statut, 'score', 1, 'motif', 'identifiant_depot_clos');
    END IF;
  END IF;
  IF v_t = '' THEN RETURN jsonb_build_object('bande', 'aucune', 'motif', 'sans_titre'); END IF;

  FOR v_c IN
    SELECT j.id AS job_id, j.inventaire_id, j.price AS prix, j.title AS titre,
           (j.platform_fields ? 'unavailable_since') AS deja_disparu
    FROM cross_post_jobs j
    WHERE j.user_id = p_user AND j.platform = p_platform
      AND j.action IN ('publish', 'republish') AND j.status = 'published'
      AND titre_norm(j.title) = v_t
      AND NOT (COALESCE(j.platform_listing_id, '') = ANY (p_vus))
      AND NOT EXISTS (SELECT 1 FROM unnest(p_vus) v WHERE v <> '' AND (
            (v ~ '^\d+$' AND COALESCE(j.listing_url, '') ~ ('(^|[^0-9])' || v || '([^0-9]|$)'))
            OR (v !~ '^\d+$' AND position(v in COALESCE(j.listing_url, '')) > 0)))
      AND NOT EXISTS (SELECT 1 FROM annonces_plateforme ap WHERE ap.job_id = j.id AND ap.disparu_le IS NULL)
    ORDER BY (j.platform_fields ? 'unavailable_since') DESC, COALESCE(j.published_at, j.created_at) DESC
  LOOP
    v_n := v_n + 1;
    v_cands := v_cands || jsonb_build_object('type', 'job', 'job_id', v_c.job_id, 'inventaire_id', v_c.inventaire_id,
                                             'prix', v_c.prix, 'titre', v_c.titre, 'deja_disparu', v_c.deja_disparu);
  END LOOP;
  FOR v_c IN
    SELECT i.id AS inventaire_id, i.prix_vente AS prix, i.titre, i.created_at
    FROM inventaire i
    WHERE i.user_id = p_user AND i.statut = 'stock' AND i.disparu_le IS NULL AND i.fusionne_dans IS NULL
      AND titre_norm(i.titre) = v_t
      AND NOT EXISTS (SELECT 1 FROM cross_post_jobs j WHERE j.inventaire_id = i.id AND j.platform = p_platform
                        AND j.action IN ('publish', 'republish') AND j.status = 'published')
      AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_cands) c WHERE (c ->> 'inventaire_id')::bigint = i.id)
    ORDER BY i.created_at DESC
  LOOP
    v_n := v_n + 1;
    v_cands := v_cands || jsonb_build_object('type', 'inventaire', 'job_id', NULL, 'inventaire_id', v_c.inventaire_id,
                                             'prix', v_c.prix, 'titre', v_c.titre, 'created_at', v_c.created_at);
  END LOOP;

  IF v_n = 0 THEN
    v_ja := titre_jetons(p_titre); -- MODIF 2026-09-25 : les mots qui comptent (racinisés, hors mots vides)
    IF COALESCE(array_length(v_ja, 1), 0) = 0 THEN
      RETURN jsonb_build_object('bande', 'aucune', 'motif', 'aucun_candidat');
    END IF;
    FOR v_c IN
      SELECT q.* FROM (
        SELECT i.id AS inventaire_id, i.titre, i.prix_vente AS prix, jr.id AS job_remplace,
               (k.communs / NULLIF(k.largeur, 0)) AS recouvrement,
               (s.m <> '' AND position(s.m in v_t) > 0) AS marque_ok,
               (s.ta <> '' AND (' ' || v_t || ' ') LIKE ('% ' || s.ta || ' %')) AS taille_ok,
               (p_prix IS NOT NULL AND i.prix_vente IS NOT NULL
                  AND abs(p_prix - i.prix_vente) < 0.01) AS prix_exact,
               (p_prix IS NOT NULL AND i.prix_vente IS NOT NULL AND i.prix_vente > 0
                  AND abs(p_prix - i.prix_vente) / i.prix_vente <= 0.15) AS prix_proche
        FROM inventaire i
        CROSS JOIN LATERAL (
          SELECT
            titre_jetons(i.titre) AS jt, -- MODIF 2026-09-25
            titre_marque_utile(COALESCE(NULLIF(trim(i.marque), ''), -- MODIF 2026-09-25 : « Vintage » n'est pas une marque
                                CASE WHEN jsonb_typeof(i.attributs -> 'marque') = 'object'
                                     THEN i.attributs -> 'marque' ->> 'v' ELSE i.attributs ->> 'marque' END)) AS m,
            titre_norm(CASE WHEN jsonb_typeof(i.attributs -> 'taille') = 'object'
                            THEN i.attributs -> 'taille' ->> 'v' ELSE i.attributs ->> 'taille' END) AS ta
        ) s
        CROSS JOIN LATERAL (
          SELECT (SELECT count(*) FROM unnest(s.jt) x WHERE x = ANY (v_ja))::numeric AS communs,
                 greatest(COALESCE(array_length(s.jt, 1), 0), COALESCE(array_length(v_ja, 1), 0))::numeric AS largeur
        ) k
        LEFT JOIN LATERAL (
          SELECT j.id FROM cross_post_jobs j
          WHERE j.user_id = p_user AND j.inventaire_id = i.id AND j.platform = p_platform
            AND j.action IN ('publish', 'republish') AND j.status = 'published'
          ORDER BY COALESCE(j.published_at, j.created_at) DESC LIMIT 1
        ) jr ON true
        WHERE i.user_id = p_user AND i.statut = 'stock' AND i.fusionne_dans IS NULL -- MODIF 2026-09-25 : une fiche « disparue » de Vinted est toujours en stock, elle reste candidate
          AND NOT titres_variantes_exclusives(p_titre, i.titre) -- MODIF 2026-09-25 : la couleur exclut ; le nombre seulement si aucun côté ne contient l'autre
          AND NOT EXISTS (
            SELECT 1 FROM cross_post_jobs j
            WHERE j.user_id = p_user AND j.inventaire_id = i.id AND j.platform = p_platform
              AND j.action IN ('publish', 'republish') AND j.status = 'published'
              AND (COALESCE(j.platform_listing_id, '') = ANY (p_vus)
                   OR EXISTS (SELECT 1 FROM unnest(p_vus) v WHERE v <> '' AND (
                        (v ~ '^\d+$' AND COALESCE(j.listing_url, '') ~ ('(^|[^0-9])' || v || '([^0-9]|$)'))
                        OR (v !~ '^\d+$' AND position(v in COALESCE(j.listing_url, '')) > 0)))
                   OR EXISTS (SELECT 1 FROM annonces_plateforme ap2 WHERE ap2.job_id = j.id AND ap2.disparu_le IS NULL)))
          AND NOT EXISTS (SELECT 1 FROM annonces_plateforme ap WHERE ap.user_id = p_user AND ap.platform = p_platform
                            AND ap.inventaire_id = i.id AND ap.disparu_le IS NULL)
      ) q
      WHERE q.recouvrement >= 0.34
        AND ((0.50 * q.recouvrement
             + CASE WHEN q.prix_exact THEN 0.20 WHEN q.prix_proche THEN 0.08 ELSE 0 END
             + CASE WHEN q.marque_ok THEN 0.15 ELSE 0 END
             + CASE WHEN q.taille_ok THEN 0.07 ELSE 0 END) >= 0.45
             OR q.recouvrement >= 0.6) -- MODIF 2026-09-25 : le prix change d'une plateforme à l'autre ; un titre qui recouvre à 60 % suffit à PROPOSER
      ORDER BY (0.50 * q.recouvrement
                + CASE WHEN q.prix_exact THEN 0.20 WHEN q.prix_proche THEN 0.08 ELSE 0 END
                + CASE WHEN q.marque_ok THEN 0.15 ELSE 0 END
                + CASE WHEN q.taille_ok THEN 0.07 ELSE 0 END) DESC,
               q.recouvrement DESC, q.inventaire_id DESC
      LIMIT 5
    LOOP
      v_nf := v_nf + 1;
      v_cf := v_cf || jsonb_build_object(
        'type', 'inventaire', 'job_id', v_c.job_remplace, 'inventaire_id', v_c.inventaire_id,
        'prix', v_c.prix, 'titre', v_c.titre,
        'score', round(least(0.85,
            0.50 * v_c.recouvrement
          + CASE WHEN v_c.prix_exact THEN 0.20 WHEN v_c.prix_proche THEN 0.08 ELSE 0 END
          + CASE WHEN v_c.marque_ok THEN 0.15 ELSE 0 END
          + CASE WHEN v_c.taille_ok THEN 0.07 ELSE 0 END), 2),
        'signaux', jsonb_build_object('recouvrement', round(v_c.recouvrement, 2),
                                      'prix', CASE WHEN v_c.prix_exact THEN 'exact' WHEN v_c.prix_proche THEN 'proche' ELSE 'non' END,
                                      'marque', v_c.marque_ok, 'taille', v_c.taille_ok,
                                      'remplace_annonce', v_c.job_remplace IS NOT NULL));
    END LOOP;
    IF v_nf = 0 THEN
      RETURN jsonb_build_object('bande', 'aucune', 'motif', 'aucun_candidat');
    END IF;
    v_best := v_cf -> 0;
    RETURN jsonb_build_object('bande', 'propose', 'inventaire_id', (v_best ->> 'inventaire_id')::bigint,
                              'job_id', NULLIF(v_best ->> 'job_id', '')::uuid,
                              'score', (v_best ->> 'score')::numeric,
                              'motif', 'faisceau', 'candidats', v_cf,
                              'signaux', v_best -> 'signaux');
  END IF;

  IF v_n > 1 THEN
    SELECT count(*) = 0 INTO v_identiques
      FROM jsonb_array_elements(v_cands) c
     WHERE c ->> 'type' <> 'inventaire'
        OR (c ->> 'prix') IS DISTINCT FROM (v_cands -> 0 ->> 'prix');
    IF v_identiques THEN
      SELECT jsonb_agg(c ORDER BY (c ->> 'created_at')) INTO v_cands
        FROM jsonb_array_elements(v_cands) c;
    END IF;
  END IF;

  v_best := v_cands -> 0;
  v_prix_connu := p_prix IS NOT NULL AND (v_best ->> 'prix') IS NOT NULL;
  v_prix_ok := v_prix_connu AND abs(p_prix - (v_best ->> 'prix')::numeric) < 0.01;
  SELECT count(*) INTO v_homonymes FROM inventaire i
  WHERE i.user_id = p_user AND i.statut = 'stock' AND titre_norm(i.titre) = v_t;
  v_motif := CASE
    WHEN v_identiques THEN 'homonymes_tranches'
    WHEN v_n > 1 THEN 'plusieurs_candidats'
    WHEN v_homonymes > 1 THEN 'homonymes'
    WHEN NOT v_prix_connu THEN 'prix_inconnu'
    WHEN NOT v_prix_ok THEN 'prix_different'
    ELSE 'titre_exact' END;
  IF v_n = 1 AND v_prix_ok AND v_homonymes <= 1 THEN
    RETURN jsonb_build_object('bande', 'certain', 'inventaire_id', (v_best ->> 'inventaire_id')::bigint,
                              'job_id', NULLIF(v_best ->> 'job_id', '')::uuid, 'score', 0.95, 'motif', v_motif, 'candidats', v_cands);
  END IF;
  SELECT COALESCE(jsonb_agg(c), '[]'::jsonb) INTO v_sortie
    FROM (SELECT c FROM jsonb_array_elements(v_cands) c LIMIT 8) s;
  RETURN jsonb_build_object('bande', 'propose', 'inventaire_id', (v_best ->> 'inventaire_id')::bigint,
                            'job_id', NULLIF(v_best ->> 'job_id', '')::uuid,
                            'score', CASE WHEN v_prix_ok THEN 0.7 WHEN NOT v_prix_connu THEN 0.6 ELSE 0.5 END,
                            'motif', v_motif, 'candidats', v_sortie, 'candidats_total', v_n,
                            'choix_arbitraire', CASE WHEN v_identiques THEN
                              jsonb_build_object('regle', 'la plus ancienne', 'total', v_n) ELSE NULL END);
END;
$function$;

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
BEGIN
  SELECT * INTO a FROM annonces_plateforme WHERE id = p_annonce_id AND user_id = p_user FOR UPDATE;
  IF a.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'annonce_introuvable'); END IF;
  IF a.inventaire_id IS NOT NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'deja_rattachee'); END IF;
  -- ⛔ HORS « MES ANNONCES » (2026-09-25 nuit) : jamais d'article créé depuis
  --    une annonce que rien ne prouve être au vendeur — geste manuel compris
  --    (Louis, 19/09 : une balance Wii d'un autre vendeur importée à la main).
  IF releve_run_hors_liste(a.run_id) THEN RETURN jsonb_build_object('ok', false, 'reason', 'hors_liste'); END IF;
  v_titre := COALESCE(NULLIF(trim(a.titre), ''), 'Annonce ' || a.platform);
  v_prix := a.prix;

  -- ── LA GARDE DU JUMEAU (2026-09-20) ──────────────────────────────────────
  -- Le relevé du 19/09 a créé trois lignes d'inventaire neuves pour trois
  -- articles déjà présents : le faisceau compare les titres MOT À MOT, et un
  -- préfixe de référence (« FIG001 - Jeux/Jouets - ») fait tomber le
  -- recouvrement sous la barre. L'annonce finit dans la bande « aucune »,
  -- seule bande où l'import automatique crée sans demander.
  -- On ajoute l'inclusion d'un titre dans l'autre, aux frontières de mots,
  -- les deux normalisés à plus de 12 caractères. Mesuré sur 200 annonces non
  -- rattachées tirées au hasard : 3 gagnent un candidat, et les trois sont
  -- justes ; 108 avaient déjà un titre exact (inchangées) ; 89 ne bougent pas.
  -- ⛔ ON PRÉVIENT, ON N'INTERDIT PAS : au lieu de créer, on POSE la
  --    proposition sur l'annonce (motif `titre_inclus`) — l'écran de
  --    rattachement affiche « C'est peut-être… » avec son bouton.
  -- ⛔ Le geste MANUEL n'est pas touché ici (p_par = 'utilisateur').
  -- ⛔ Le refus est tracé UNE FOIS (decision 'refus_jumeau') : sans trace,
  --    « pourquoi celle-ci n'est pas entrée ? » redevient une reconstitution.
  -- ⛔ Le titre de SECOURS (« Annonce vinted ») ne reconnaît rien : on part du
  --    titre RÉEL, ou on ne cherche pas.
  v_tn := titre_norm(NULLIF(trim(a.titre), ''));

  -- ── L'IMPORT RECONNAÎT LES FICHES EXISTANTES, VENDUES COMPRISES (2026-09-26) ──
  -- labouquinerie85, relevé Opla du 24/09 : 9 fiches créées sous le titre exact
  -- d'un article VENDU, 1 sous celui d'un article en stock déjà publié. Le
  -- premier tour du moteur ne voit que le stock sans annonce sur la
  -- plateforme ; ces fiches existantes lui étaient invisibles.
  -- ⛔ ON NE CRÉE PAS, ON DEMANDE : même titre (titre_norm, ou mêmes mots qui
  --    comptent) qu'une fiche en stock OU vendue → proposition posée sur
  --    l'annonce ; la personne tranche. Jamais de rattachement automatique à
  --    une fiche vendue ou déjà publiée : un titre ne prouve pas l'exemplaire.
  -- ⛔ Le geste MANUEL n'est pas touché (p_par = 'utilisateur').
  IF p_par IS DISTINCT FROM 'utilisateur' AND COALESCE(v_tn, '') <> ''
     AND COALESCE(array_length(titre_jetons(a.titre), 1), 0) > 0 THEN
    SELECT i.id, i.titre, i.statut, count(*) OVER ()
      INTO v_homo, v_homo_titre, v_homo_statut, v_homo_n
      FROM inventaire i
     WHERE i.user_id = p_user AND i.fusionne_dans IS NULL AND i.statut IN ('stock', 'vendu')
       AND (titre_norm(i.titre) = v_tn OR titre_jetons(i.titre) = titre_jetons(a.titre))
     ORDER BY (i.statut = 'stock') DESC, (titre_norm(i.titre) = v_tn) DESC, i.created_at ASC
     LIMIT 1;
    IF v_homo IS NOT NULL THEN
      UPDATE annonces_plateforme
         SET proposition = jsonb_build_object('inventaire_id', v_homo, 'job_id', NULL,
                                              'motif', CASE WHEN v_homo_statut = 'vendu' THEN 'homonyme_vendu' ELSE 'homonyme_en_stock' END,
                                              'score', 0.5, 'statut_fiche', v_homo_statut, 'titre_fiche', v_homo_titre,
                                              'candidats', '[]'::jsonb, 'candidats_total', v_homo_n,
                                              'at', now()),
             updated_at = now()
       WHERE id = a.id;
      IF NOT EXISTS (SELECT 1 FROM rapprochements r
                      WHERE r.annonce_id = a.id AND r.decision = 'refus_jumeau') THEN
        INSERT INTO rapprochements (user_id, annonce_id, inventaire_id, decision, par, score, detail)
        VALUES (p_user, a.id, v_homo, 'refus_jumeau', p_par, 1,
                jsonb_build_object('titre_annonce', v_titre, 'titre_article', v_homo_titre,
                                   'motif', CASE WHEN v_homo_statut = 'vendu' THEN 'homonyme_vendu' ELSE 'homonyme_en_stock' END,
                                   'statut_fiche', v_homo_statut, 'homonymes', v_homo_n));
      END IF;
      RETURN jsonb_build_object('ok', false, 'reason', 'jumeau_probable',
                                'inventaire_id', v_homo, 'titre_article', v_homo_titre,
                                'motif', CASE WHEN v_homo_statut = 'vendu' THEN 'homonyme_vendu' ELSE 'homonyme_en_stock' END);
    END IF;
  END IF;

  IF p_par IS DISTINCT FROM 'utilisateur' AND length(COALESCE(v_tn, '')) > 12 THEN
    SELECT i.id, i.titre INTO v_jumeau, v_jumeau_titre
      FROM inventaire i
     WHERE i.user_id = p_user
       AND i.statut = 'stock'
       AND i.disparu_le IS NULL
       AND i.fusionne_dans IS NULL
       AND length(titre_norm(i.titre)) > 12
       AND NOT titres_variantes_incompatibles(a.titre, i.titre) -- AJOUT 2026-09-24 : une autre couleur n'est pas un jumeau
       AND (' ' || v_tn || ' ' LIKE '% ' || titre_norm(i.titre) || ' %'
            OR ' ' || titre_norm(i.titre) || ' ' LIKE '% ' || v_tn || ' %')
     ORDER BY (titre_norm(i.titre) = v_tn) DESC, i.created_at ASC
     LIMIT 1;
    IF v_jumeau IS NOT NULL THEN
      UPDATE annonces_plateforme
         SET proposition = jsonb_build_object('inventaire_id', v_jumeau, 'job_id', NULL,
                                              'motif', 'titre_inclus', 'score', 0.5,
                                              'candidats', '[]'::jsonb, 'candidats_total', 1,
                                              'at', now()),
             updated_at = now()
       WHERE id = a.id;
      IF NOT EXISTS (SELECT 1 FROM rapprochements r
                      WHERE r.annonce_id = a.id AND r.decision = 'refus_jumeau') THEN
        INSERT INTO rapprochements (user_id, annonce_id, inventaire_id, decision, par, score, detail)
        VALUES (p_user, a.id, v_jumeau, 'refus_jumeau', p_par, 1,
                jsonb_build_object('titre_annonce', v_titre, 'titre_article', v_jumeau_titre));
      END IF;
      RETURN jsonb_build_object('ok', false, 'reason', 'jumeau_probable',
                                'inventaire_id', v_jumeau, 'titre_article', v_jumeau_titre);
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
  INSERT INTO inventaire (id, user_id, titre, prix_vente, statut, plateforme, origine, quantite, photos, attributs,
                          description, marque, first_seen_at, last_synced_at, photos_a_rapatrier)
  VALUES (v_new_inv, p_user, v_titre, v_prix, 'stock', a.platform, 'releve_' || a.platform, 1,
          v_photos, v_attr,
          NULLIF(trim(v_cap ->> 'description'), ''), NULLIF(trim(v_cap ->> 'marque'), ''), now(), now(),
          -- La fiche entre dans la file dès qu'elle a une photo, quelle qu'en
          -- soit l'adresse : c'est handler-watch qui sait ce qui est à nous.
          v_photos IS NOT NULL);
  v_job := rapprocher_job_de_suivi(p_user, a.platform, v_new_inv, v_titre, v_prix, a.url, a.listing_id, p_par,
                                   jsonb_build_object('annonce_id', a.id, 'import', true));
  UPDATE annonces_plateforme
     SET inventaire_id = v_new_inv, job_id = v_job,
         source_rapprochement = CASE WHEN p_par = 'utilisateur' THEN 'manuel' ELSE 'automatique' END,
         proposition = NULL, ignoree_le = NULL, fiche_supprimee_le = NULL, updated_at = now()
   WHERE id = a.id;
  INSERT INTO rapprochements (user_id, annonce_id, inventaire_id, decision, par, score, detail)
  VALUES (p_user, a.id, v_new_inv, 'import', p_par, 1, jsonb_build_object('job_id', v_job));
  RETURN jsonb_build_object('ok', true, 'decision', 'import', 'inventaire_id', v_new_inv, 'job_id', v_job);
END;
$function$;

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
  v_vide_non_probant boolean := false;
BEGIN
  SELECT * INTO v_run FROM vinted_sync_runs WHERE id = p_run_id;
  IF v_run.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'run_introuvable'); END IF;
  IF auth.uid() IS NOT NULL AND auth.uid() <> v_run.user_id THEN RETURN jsonb_build_object('ok', false, 'reason', 'unauthorized'); END IF;
  v_user := v_run.user_id; v_pf := v_run.platform;
  IF v_pf NOT IN ('leboncoin', 'beebs', 'ebay', 'opla') THEN RETURN jsonb_build_object('ok', false, 'reason', 'plateforme'); END IF;
  SELECT COALESCE(array_agg(listing_id), ARRAY[]::text[]) INTO v_vus FROM annonces_plateforme WHERE run_id = p_run_id;
  v_complet := COALESCE(v_run.erreur, '') NOT LIKE '[incomplet]%';
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
    v_res := rapprocher_traiter_annonce(v_id, v_vus, v_import_ouvert, false, false);
    CASE v_res
      WHEN 'job'           THEN n_job := n_job + 1;
      WHEN 'certain'       THEN n_auto := n_auto + 1;
      WHEN 'propose'       THEN n_prop := n_prop + 1;
      WHEN 'notification'  THEN n_notif := n_notif + 1;
      WHEN 'aucune'        THEN n_aucune := n_aucune + 1;
      WHEN 'import'        THEN n_aucune := n_aucune + 1; n_import := n_import + 1;
      WHEN 'import_refuse' THEN n_aucune := n_aucune + 1; n_refus := n_refus + 1;
      ELSE n_sautees := n_sautees + 1;
    END CASE;
  END LOOP;

  -- Disparitions : les annonces de cette plateforme non revues par un relevé
  -- COMPLET. Aucun signal de vente ici — c'est le veilleur qui tranche sur les
  -- jobs, avec ses propres règles ; on date seulement l'annonce.
  IF v_complet THEN
    UPDATE annonces_plateforme SET disparu_le = now(), updated_at = now()
     WHERE user_id = v_user AND platform = v_pf AND disparu_le IS NULL
       AND run_id IS DISTINCT FROM p_run_id AND vu_le < COALESCE(v_run.started_at, now());
    GET DIAGNOSTICS n_disp = ROW_COUNT;
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
                            'vide_non_probant', v_vide_non_probant);
END;
$function$;

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

  -- ── CERTAIN : un seul candidat, titre exact, prix égal, aucun homonyme ──
  IF v_bande = 'certain' THEN
    IF v_job IS NOT NULL THEN
      PERFORM rapprocher_recabler_job(v_job, a.url, a.listing_id, 'auto',
                                      v_trace || jsonb_build_object('annonce_id', a.id, 'motif', v_cl ->> 'motif', 'score', v_cl -> 'score'));
    ELSE
      v_job := rapprocher_job_de_suivi(v_user, v_pf, v_inv, a.titre, a.prix, a.url, a.listing_id, 'auto',
                                       v_trace || jsonb_build_object('annonce_id', a.id, 'motif', v_cl ->> 'motif', 'score', v_cl -> 'score'));
    END IF;
    UPDATE annonces_plateforme SET inventaire_id = v_inv, job_id = v_job, source_rapprochement = 'automatique', proposition = NULL, updated_at = now() WHERE id = a.id;
    INSERT INTO rapprochements (user_id, annonce_id, inventaire_id, decision, par, score, detail)
    VALUES (v_user, a.id, v_inv, 'attache', 'auto', (v_cl ->> 'score')::numeric, v_trace || jsonb_build_object('job_id', v_job, 'motif', v_cl ->> 'motif'));
    RETURN 'certain';
  END IF;

  -- ── PROPOSE : rien sur les jobs, la proposition vit sur l'annonce ───────
  IF v_bande = 'propose' THEN
    IF p_rattrapage AND a.proposition IS NOT NULL
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
    IF COALESCE((v_imp ->> 'ok')::boolean, false) THEN RETURN 'import'; END IF;
    IF v_imp ->> 'reason' = 'jumeau_probable' THEN RETURN 'import_refuse'; END IF;
  END IF;
  RETURN 'aucune';
END;
$function$;

CREATE OR REPLACE FUNCTION public.republish_planifiee_candidats(p_user uuid, p_reglage jsonb, p_platform text DEFAULT 'vinted'::text)
 RETURNS TABLE(inv_id bigint, item_id text, boutique text, titre text, motif text, rang integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_pf text := lower(COALESCE(NULLIF(trim(p_platform), ''), 'vinted'));
  v_age integer := LEAST(365, GREATEST(7, COALESCE(NULLIF(p_reglage ->> 'age_jours', '')::integer, 30)));
  v_seuil timestamptz;
  v_ordre text := COALESCE(p_reglage ->> 'ordre', 'anciennes');
  v_premier date; v_probant boolean;
BEGIN
  v_seuil := now() - make_interval(days => v_age);

  IF v_pf <> 'vinted' THEN
    RETURN QUERY
    WITH base AS (
      SELECT i.id, i.titre, i.prix_vente, d.listing_id, d.mise_en_ligne
      FROM inventaire i
      JOIN LATERAL (
        SELECT COALESCE(NULLIF(trim(j.platform_listing_id), ''), NULL) AS listing_id,
               COALESCE(j.published_at, j.created_at) AS mise_en_ligne,
               j.photos
        FROM cross_post_jobs j
        WHERE j.user_id = p_user AND j.inventaire_id = i.id AND j.platform = v_pf
          AND j.action IN ('publish', 'republish') AND j.status = 'published'
          AND NULLIF(trim(j.listing_url), '') IS NOT NULL
        ORDER BY COALESCE(j.published_at, j.created_at) DESC
        LIMIT 1
      ) d ON true
      WHERE i.user_id = p_user
        AND i.statut = 'stock'
        AND i.disparu_le IS NULL
        -- 24/09 : alignée sur spend_coins_and_republish (756f090). Les photos
        -- viennent du job source, SINON de la fiche (article importé ou
        -- rattaché par un relevé). Hors Opla, la fiche n'est acceptée que si
        -- TOUTES ses photos sont sur notre Storage (retrait puis redépôt : une
        -- photo de CDN de plateforme ne se télécharge pas). Opla modifie en
        -- place et n'envoie pas d'images.
        AND (
          (jsonb_typeof(d.photos) = 'array' AND jsonb_array_length(d.photos) > 0)
          OR (
            jsonb_typeof(i.photos) = 'array'
            AND EXISTS (
              SELECT 1 FROM jsonb_array_elements(i.photos) a(v)
              WHERE NULLIF(trim(CASE WHEN jsonb_typeof(a.v) = 'string'
                                     THEN a.v #>> '{}' ELSE a.v ->> 'url' END), '') IS NOT NULL)
            AND (v_pf = 'opla' OR NOT EXISTS (
              SELECT 1 FROM jsonb_array_elements(i.photos) a(v)
              WHERE NULLIF(trim(CASE WHEN jsonb_typeof(a.v) = 'string'
                                     THEN a.v #>> '{}' ELSE a.v ->> 'url' END), '') IS NOT NULL
                AND trim(CASE WHEN jsonb_typeof(a.v) = 'string'
                              THEN a.v #>> '{}' ELSE a.v ->> 'url' END)
                    !~ '^https://[a-z0-9]+\.supabase\.co/storage/v1/object/public/'))
          )
        )
        AND d.mise_en_ligne < v_seuil
    ),
    dernier AS (
      SELECT DISTINCT ON (j.inventaire_id)
        j.inventaire_id AS inv, j.status, j.published_at, j.created_at
      FROM cross_post_jobs j
      WHERE j.user_id = p_user AND j.action = 'republish' AND j.platform = v_pf
        AND j.inventaire_id IN (SELECT b.id FROM base b)
      ORDER BY j.inventaire_id, j.created_at DESC
    )
    SELECT b.id, b.listing_id, NULL::text, b.titre,
      CASE
        WHEN d.status IN ('pending', 'processing') THEN 'en_cours'
        WHEN d.status = 'needs_user' THEN 'attente_decision'
        WHEN d.status = 'failed' AND d.created_at > now() - interval '24 hours' THEN 'echec_recent'
        WHEN d.status = 'published' AND d.published_at > now() - interval '24 hours' THEN 'republiee_recemment'
        ELSE NULL
      END,
      (row_number() OVER (ORDER BY
         CASE WHEN v_ordre = 'prix' THEN b.prix_vente END DESC NULLS LAST,
         b.mise_en_ligne ASC, b.id ASC))::integer
    FROM base b
    LEFT JOIN dernier d ON d.inv = b.id
    ORDER BY 6;
    RETURN;
  END IF;

  -- ── VINTED : inchangé depuis le 12/09 ────────────────────────────────────
  SELECT min(s.captured_on) INTO v_premier FROM vinted_listing_snapshots s WHERE s.user_id = p_user;
  v_probant := v_premier IS NOT NULL AND v_premier <= v_seuil::date;

  RETURN QUERY
  WITH base AS (
    SELECT i.id, i.vinted_item_id, i.vinted_account_id, i.titre, i.prix_vente, i.vinted_view_count, i.listed_at_guess
    FROM inventaire i
    WHERE i.user_id = p_user
      AND i.statut = 'stock'
      AND i.vinted_item_id IS NOT NULL
      AND i.photos IS NOT NULL AND jsonb_array_length(i.photos) > 0
      AND (i.vinted_status IS NULL OR i.vinted_status NOT IN ('hidden', 'draft'))
      AND i.disparu_le IS NULL
      AND i.listed_at_guess IS NOT NULL
      AND i.listed_at_guess < v_seuil
  ),
  dernier AS (
    SELECT DISTINCT ON (j.platform_fields ->> 'vinted_item_id')
      j.platform_fields ->> 'vinted_item_id' AS item, j.status, j.published_at, j.created_at
    FROM cross_post_jobs j
    WHERE j.user_id = p_user AND j.action = 'republish'
      AND j.platform_fields ->> 'vinted_item_id' IN (SELECT b.vinted_item_id FROM base b)
    ORDER BY j.platform_fields ->> 'vinted_item_id', j.created_at DESC
  ),
  snap AS (
    SELECT s.vinted_item_id AS item, min(s.captured_on) AS premier
    FROM vinted_listing_snapshots s
    WHERE v_probant AND s.user_id = p_user
      AND s.vinted_item_id IN (SELECT b.vinted_item_id FROM base b)
    GROUP BY s.vinted_item_id
  )
  SELECT b.id, b.vinted_item_id, b.vinted_account_id, b.titre,
    CASE
      WHEN d.status IN ('pending', 'processing') THEN 'en_cours'
      WHEN d.status = 'needs_user' THEN 'attente_decision'
      WHEN d.status = 'failed' AND d.created_at > now() - interval '24 hours' THEN 'echec_recent'
      WHEN d.status = 'published' AND d.published_at > now() - interval '24 hours' THEN 'republiee_recemment'
      WHEN v_probant AND sn.premier IS NOT NULL AND sn.premier > v_seuil::date THEN 'observee_trop_recente'
      ELSE NULL
    END,
    (row_number() OVER (ORDER BY
       CASE WHEN v_ordre = 'prix' THEN b.prix_vente END DESC NULLS LAST,
       CASE WHEN v_ordre = 'vues'
            THEN b.vinted_view_count::numeric / GREATEST(1, extract(epoch FROM (now() - b.listed_at_guess)) / 86400)
       END ASC NULLS LAST,
       b.listed_at_guess ASC, b.id ASC))::integer
  FROM base b
  LEFT JOIN dernier d ON d.item = b.vinted_item_id
  LEFT JOIN snap sn ON sn.item = b.vinted_item_id
  ORDER BY 6;
END;
$function$;

CREATE OR REPLACE FUNCTION public.republish_planifiee_sweep()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_actif      integer;
  v_compte     record;
  v_pf         text;
  v_regl       jsonb;
  v_fen        jsonb;
  v_row        republish_creneaux%ROWTYPE;
  v_ident      jsonb;
  v_boutique   text;
  v_multi      boolean;
  v_esp        jsonb;
  v_capacite   integer;
  v_elig       integer;
  v_prevues    integer;
  v_minuit     timestamptz;
  v_plafond    integer;
  v_faits      integer;
  v_faits_cpt  integer;
  v_plafond_b  integer;
  v_faits_b    integer;
  v_intervalle numeric;
  v_dernier    timestamptz;
  v_cand       record;
  v_cle        text;
  v_notes      jsonb;
  v_rpc        jsonb;
  v_reason     text;
  v_job        uuid;
  v_examines   integer;
  v_rapport    jsonb := '[]'::jsonb;
  v_ligne      jsonb;
  v_comptes    integer := 0;
  v_hors_ligne integer;
  v_mobiles    integer;
  v_parques    integer;
  v_bloque     jsonb;
  v_faits_cr   integer;
  -- 18/09 : multiplateforme
  v_palier     text;
  v_plafond_cpt integer;
  v_cree       boolean;
  v_grace      integer;
  v_perdu      timestamptz;
  v_ps         jsonb;
  v_cur        jsonb;
  v_disj_n     integer;
  v_disj_max   integer;
  v_j          record;
BEGIN
  SELECT value INTO v_actif FROM coin_config WHERE key = 'republish_planifiee_actif';
  IF COALESCE(v_actif, 0) <> 1 THEN
    RETURN jsonb_build_object('actif', false, 'comptes', 0, 'crees', 0,
      'motif', 'interrupteur coin_config.republish_planifiee_actif <> 1');
  END IF;
  SELECT value INTO v_disj_max FROM coin_config WHERE key = 'republish_disjoncteur_echecs';
  v_disj_max := GREATEST(1, COALESCE(v_disj_max, 2));
  SELECT value INTO v_grace FROM coin_config WHERE key = 'republish_palier_perdu_grace_h';
  v_grace := GREATEST(1, COALESCE(v_grace, 48));

  -- Les comptes qui ont AU MOINS UNE plateforme active.
  FOR v_compte IN
    SELECT p.id, p.email, p.extension_last_seen_at
    FROM profiles p
    WHERE EXISTS (
      SELECT 1 FROM unnest(republish_planifiee_plateformes()) pf
      WHERE COALESCE((p.platform_settings #> ARRAY[pf, 'republish_planifiee'] ->> 'actif')::boolean, false)
    )
    ORDER BY p.id
  LOOP
    v_comptes := v_comptes + 1;
    v_cree := false;

    -- 0. LE DROIT. Un compte actif sans palier Pro : on pose la date, puis on
    -- arrête au-delà de la grâce — une seule fois, pour les quatre.
    v_palier := republish_palier(v_compte.id);
    IF v_palier NOT IN ('pro', 'business') THEN
      SELECT COALESCE(p2.platform_settings, '{}'::jsonb) INTO v_ps FROM profiles p2 WHERE p2.id = v_compte.id FOR UPDATE;
      FOREACH v_pf IN ARRAY republish_planifiee_plateformes() LOOP
        v_cur := v_ps #> ARRAY[v_pf, 'republish_planifiee'];
        CONTINUE WHEN v_cur IS NULL OR jsonb_typeof(v_cur) <> 'object'
                   OR NOT COALESCE((v_cur ->> 'actif')::boolean, false);
        v_perdu := NULLIF(v_cur ->> 'palier_perdu_le', '')::timestamptz;
        IF v_perdu IS NULL THEN
          v_cur := v_cur || jsonb_build_object('palier_perdu_le', now());
        ELSIF v_perdu < now() - make_interval(hours => v_grace) THEN
          v_cur := v_cur || jsonb_build_object('actif', false, 'arrete_le', now(),
                                               'arret_motif', 'palier_perdu');
        ELSE
          CONTINUE;
        END IF;
        v_ps := jsonb_set(v_ps, ARRAY[v_pf, 'republish_planifiee'], v_cur, true);
      END LOOP;
      UPDATE profiles SET platform_settings = v_ps WHERE id = v_compte.id;
      CONTINUE;
    END IF;

    v_plafond_cpt := republish_plafond_palier(v_palier);

    -- 1. Historique : clôturer ce qui est passé (toutes plateformes).
    PERFORM republish_creneau_cloturer(v_compte.id);

    FOR v_pf IN
      SELECT pf FROM unnest(republish_planifiee_plateformes()) AS pf
      ORDER BY (SELECT count(*) FROM cross_post_jobs j
                 WHERE j.user_id = v_compte.id AND j.action = 'republish' AND j.platform = pf
                   AND j.platform_fields ->> 'republish_source' = 'auto'
                   AND j.created_at >= date_trunc('day', now())) ASC,  -- MODIF FAMINE 2026-09-24 : la plateforme la MOINS servie aujourd hui passe d abord (tour de role), au lieu de Vinted toujours en tete
               array_position(republish_planifiee_plateformes(), pf)
    LOOP
      EXIT WHEN v_cree;  -- UN job par compte et par passage, toutes plateformes.

      v_regl := republish_planifiee_reglage(v_compte.id, v_pf);
      CONTINUE WHEN v_regl IS NULL OR NOT COALESCE((v_regl ->> 'actif')::boolean, false);
      -- Interrupteur de la plateforme (fail-closed).
      CONTINUE WHEN NOT republish_planifiee_pf_ouverte(v_pf);
      -- La date de palier perdu n'a plus lieu d'être : le droit est là.
      IF v_regl ->> 'palier_perdu_le' IS NOT NULL THEN
        UPDATE profiles
           SET platform_settings = jsonb_set(platform_settings, ARRAY[v_pf, 'republish_planifiee'],
                 (platform_settings #> ARRAY[v_pf, 'republish_planifiee']) - 'palier_perdu_le', true)
         WHERE id = v_compte.id;
      END IF;

      -- 2. Hors créneau → rien. Un créneau manqué n'est jamais rattrapé.
      v_fen := republish_planifiee_fenetre(v_regl, now());
      CONTINUE WHEN NOT COALESCE((v_fen ->> 'dans_creneau')::boolean, false);

      v_minuit := republish_minuit_local(COALESCE(v_regl ->> 'fuseau', 'Europe/Paris'));

      -- 2bis. DISJONCTEUR DU JOUR : cette plateforme s'est-elle déjà arrêtée
      -- aujourd'hui ? (note posée sur un créneau de la journée locale)
      IF EXISTS (
        SELECT 1 FROM republish_creneaux r
        WHERE r.user_id = v_compte.id AND r.platform = v_pf
          AND r.debut >= v_minuit AND r.sautes ? '_disjoncteur'
      ) THEN
        CONTINUE;
      END IF;

      IF v_pf = 'vinted' THEN
        v_ident    := republish_boutique_connectee(v_compte.id);
        v_boutique := v_ident ->> 'user_id';
        v_multi    := jsonb_array_length(republish_boutiques(v_compte.id)) >= 2;
      ELSE
        v_ident := NULL; v_boutique := NULL; v_multi := false;
      END IF;

      v_plafond  := (v_regl ->> 'plafond_jour')::integer;
      -- Deux compteurs : CETTE plateforme, et le COMPTE (l'enveloppe).
      SELECT count(*) FILTER (WHERE j.platform = v_pf), count(*)
      INTO v_faits, v_faits_cpt
      FROM cross_post_jobs j
      WHERE j.user_id = v_compte.id AND j.action = 'republish'
        AND j.platform_fields ->> 'republish_source' = 'auto'
        AND j.created_at >= v_minuit;

      v_plafond_b := NULL; v_faits_b := 0;
      IF v_pf = 'vinted' AND v_boutique IS NOT NULL THEN
        v_plafond_b := LEAST(v_plafond, GREATEST(1, COALESCE(
          NULLIF(v_regl -> 'plafond_boutique' ->> v_boutique, '')::integer, v_plafond)));
        SELECT count(*) INTO v_faits_b
        FROM cross_post_jobs j JOIN inventaire i ON i.id = j.inventaire_id
        WHERE j.user_id = v_compte.id AND j.action = 'republish' AND j.platform = 'vinted'
          AND j.platform_fields ->> 'republish_source' = 'auto'
          AND j.created_at >= v_minuit
          AND i.vinted_account_id = v_boutique;
      END IF;

      -- La ligne du créneau courant, créée au premier passage avec ce que le
      -- serveur ATTEND à cet instant (c'est ce que l'app annonce). La capacité
      -- est PARTAGÉE : le temps déjà réservé par les autres plateformes est
      -- déduit — un seul Chrome pour quatre files.
      SELECT * INTO v_row FROM republish_creneaux
      WHERE user_id = v_compte.id AND platform = v_pf AND debut = (v_fen ->> 'courant_debut')::timestamptz
        AND COALESCE(boutique, '') = COALESCE(v_boutique, '');
      -- Boutique connue, aucune ligne à son nom : une ligne SANS boutique du
      -- même créneau est née avant que la sonde ne parle — elle lui appartient.
      -- On la BAPTISE, on n'en crée pas une seconde. (Baptiser n'est pas geler :
      -- l'autre boutique aura, elle, sa PROPRE ligne, parce que la lecture
      -- ci-dessus discrimine sur la boutique à chaque passage.)
      IF NOT FOUND AND v_boutique IS NOT NULL THEN
        UPDATE republish_creneaux
           SET boutique = v_boutique, updated_at = now()
         WHERE user_id = v_compte.id AND platform = v_pf
           AND debut = (v_fen ->> 'courant_debut')::timestamptz AND boutique IS NULL
        RETURNING * INTO v_row;
      END IF;
      -- Boutique INCONNUE alors que le créneau a déjà une ligne : on ne fabrique
      -- pas un doublon sans nom (il réserverait de la capacité pour les autres
      -- plateformes sans jamais rien produire). On reprend celle qui existe.
      IF NOT FOUND AND v_boutique IS NULL THEN
        SELECT * INTO v_row FROM republish_creneaux
        WHERE user_id = v_compte.id AND platform = v_pf
          AND debut = (v_fen ->> 'courant_debut')::timestamptz
        ORDER BY updated_at DESC LIMIT 1;
      END IF;
      IF NOT FOUND THEN
        v_esp := republish_planifiee_espacement(v_compte.id, v_pf);
        -- MODIF FAMINE 2026-09-24 : part EGALE du creneau entre les plateformes actives+eligibles
        -- (republish_planifiee_actives_eligibles), au lieu de reserver tout le temps a la premiere
        -- (Vinted). Un compte mono-plateforme -> N=1 -> part pleine -> INCHANGE. On ne touche NI a
        -- l espacement (v_esp, propre a la plateforme), NI aux plafonds/quotas (LEAST plus bas).
        v_capacite := republish_planifiee_capacite(
          GREATEST(60, (extract(epoch FROM ((v_fen ->> 'courant_fin')::timestamptz - now()))::integer
                        / republish_planifiee_actives_eligibles(v_compte.id)))::integer,
          (v_esp ->> 'sec')::integer);
        SELECT count(*) INTO v_elig
        FROM republish_planifiee_candidats(v_compte.id, v_regl, v_pf) c
        WHERE c.motif IS NULL
          AND (v_boutique IS NULL OR NOT v_multi OR c.boutique IS NULL OR c.boutique = v_boutique);
        v_prevues := LEAST(GREATEST(0, v_plafond - v_faits),
                           GREATEST(0, v_plafond_cpt - v_faits_cpt),
                           v_elig, v_capacite);
        IF v_plafond_b IS NOT NULL THEN
          v_prevues := LEAST(v_prevues, GREATEST(0, v_plafond_b - v_faits_b));
        END IF;
        INSERT INTO republish_creneaux
          (user_id, platform, jour, de, a, fuseau, debut, fin, statut, boutique,
           eligibles_debut, prevues, espacement_sec, extension_vue)
        VALUES
          (v_compte.id, v_pf, (v_fen ->> 'jour_local')::date, (v_regl ->> 'de')::time, (v_regl ->> 'a')::time,
           COALESCE(v_regl ->> 'fuseau', 'Europe/Paris'),
           (v_fen ->> 'courant_debut')::timestamptz, (v_fen ->> 'courant_fin')::timestamptz, 'en_cours', v_boutique,
           v_elig, v_prevues, (v_esp ->> 'sec')::integer,
           v_compte.extension_last_seen_at > now() - interval '10 minutes')
        ON CONFLICT (user_id, platform, debut, (COALESCE(boutique, ''::text))) DO NOTHING;
        SELECT * INTO v_row FROM republish_creneaux
        WHERE user_id = v_compte.id AND platform = v_pf AND debut = (v_fen ->> 'courant_debut')::timestamptz
          AND COALESCE(boutique, '') = COALESCE(v_boutique, '');
      END IF;

      -- 3. Extension vivante ? 10 MINUTES : au-delà on créerait des jobs pour
      -- des Chrome éteints, qui dormiraient en pending en consommant le plafond.
      CONTINUE WHEN v_compte.extension_last_seen_at IS NULL
                 OR v_compte.extension_last_seen_at <= now() - interval '10 minutes';
      -- ⛔ Plus de `boutique = COALESCE(boutique, v_boutique)` ici : c'était le
      -- gel. La ligne PORTE sa boutique depuis sa lecture ; une autre boutique
      -- ne réécrit plus celle-ci, elle obtient la sienne.
      IF NOT v_row.extension_vue THEN
        UPDATE republish_creneaux
           SET extension_vue = true, updated_at = now()
         WHERE id = v_row.id;
      END IF;

      -- 3bis. LE DISJONCTEUR : les échecs CONSÉCUTIFS de ce créneau, sur cette
      -- plateforme, sans réussite intercalée.
      v_disj_n := 0;
      FOR v_j IN
        SELECT j.status, COALESCE(j.platform_fields ->> 'republish_step', 'a_capturer') AS step
        FROM cross_post_jobs j
        WHERE j.user_id = v_compte.id AND j.action = 'republish' AND j.platform = v_pf
          AND j.platform_fields ->> 'republish_creneau_id' = v_row.id::text
        ORDER BY j.created_at DESC
      LOOP
        EXIT WHEN v_j.status = 'published';
        EXIT WHEN v_j.status = 'needs_user';  -- AJOUT 2026-09-24 : needs_user (taille a choisir, champ, session) est PARQUE en attente de l'utilisateur, pas un echec anti-robot — il arrete le comptage consecutif sans le grossir
        IF v_j.status = 'failed' THEN v_disj_n := v_disj_n + 1;  -- MODIF 2026-09-24 : le disjoncteur ne pese plus que les vrais failed consecutifs (la panne anti-robot qu'il existe pour arreter)
        ELSE EXIT;  -- pending / processing : en cours, pas un échec
        END IF;
      END LOOP;
      IF v_disj_n >= v_disj_max THEN
        PERFORM republish_creneau_noter(v_row.id,
          jsonb_build_object('_disjoncteur', jsonb_build_object(
            'motif', 'echecs_consecutifs', 'platform', v_pf,
            'echecs', v_disj_n, 'seuil', v_disj_max, 'at', now())));
        CONTINUE;
      END IF;

      -- 4. Garde anti-rafale, PAR PLATEFORME.
      SELECT count(*) FILTER (WHERE j.platform_fields ->> 'republish_step' = 'deleted'),
             count(*) FILTER (WHERE COALESCE(j.platform_fields ->> 'republish_step', 'a_capturer') <> 'deleted'
                                AND (v_boutique IS NULL OR NULLIF(trim(i.vinted_account_id), '') IS NULL
                                     OR trim(i.vinted_account_id) = v_boutique)
                                AND COALESCE(republish_ts_safe(j.platform_fields, 'next_action_after'), now()) <= now()),  -- MODIF 2026-09-24 : un job PARQUE (reprise future : anti-robot 45 min, session 60 min) et sans suppression (step <> deleted) n'occupe pas le creneau ; il n'est plus compte en vol, le creneau continue avec un autre article, l'annonce parquee reste en ligne
             count(*) FILTER (WHERE COALESCE(j.platform_fields ->> 'republish_step', 'a_capturer') <> 'deleted'
                                AND v_boutique IS NOT NULL AND NULLIF(trim(i.vinted_account_id), '') IS NOT NULL
                                AND trim(i.vinted_account_id) <> v_boutique)
      INTO v_hors_ligne, v_mobiles, v_parques
      FROM cross_post_jobs j LEFT JOIN inventaire i ON i.id = j.inventaire_id
      WHERE j.user_id = v_compte.id AND j.action = 'republish' AND j.platform = v_pf
        AND j.status IN ('pending', 'processing');
      IF v_hors_ligne + v_mobiles > 0 THEN
        v_bloque := COALESCE(v_row.sautes -> '_bloque_en_vol', '{}'::jsonb);
        v_bloque := (v_bloque - 'leve_le') || jsonb_build_object(
          'motif', CASE WHEN v_hors_ligne > 0 THEN 'annonce_hors_ligne' ELSE 'republication_en_vol' END,
          'platform', v_pf,
          'en_vol', v_hors_ligne + v_mobiles,
          'hors_ligne', v_hors_ligne,
          'parques_autre_boutique', v_parques,
          'boutique', v_boutique,
          'depuis', COALESCE(v_bloque ->> 'depuis', to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SSOF')),
          'at', now());
        UPDATE republish_creneaux
           SET sautes = sautes || jsonb_build_object('_bloque_en_vol', v_bloque), updated_at = now()
         WHERE id = v_row.id;
        CONTINUE;
      END IF;
      IF v_row.sautes ? '_bloque_en_vol' AND NOT (v_row.sautes -> '_bloque_en_vol' ? 'leve_le') THEN
        UPDATE republish_creneaux
           SET sautes = jsonb_set(sautes, '{_bloque_en_vol,leve_le}', to_jsonb(now())), updated_at = now()
         WHERE id = v_row.id;
      END IF;
      IF v_parques > 0 THEN
        PERFORM republish_creneau_noter(v_row.id,
          jsonb_build_object('_parques_autre_boutique',
            jsonb_build_object('motif', 'parques_autre_boutique', 'n', v_parques, 'boutique', v_boutique, 'at', now())));
      END IF;

      -- 5. Plafonds du jour : celui de la plateforme, puis l'ENVELOPPE de compte.
      IF v_faits >= v_plafond THEN
        PERFORM republish_creneau_noter(v_row.id,
          jsonb_build_object('_plafond_jour', jsonb_build_object('motif', 'plafond_jour', 'plafond', v_plafond, 'at', now())));
        CONTINUE;
      END IF;
      IF v_faits_cpt >= v_plafond_cpt THEN
        PERFORM republish_creneau_noter(v_row.id,
          jsonb_build_object('_plafond_compte', jsonb_build_object('motif', 'plafond_compte',
            'plafond', v_plafond_cpt, 'faits', v_faits_cpt, 'at', now())));
        CONTINUE;
      END IF;

      -- 6. Espacement déterministe.
      v_intervalle := extract(epoch FROM (v_row.fin - v_row.debut)) / GREATEST(1, COALESCE(v_row.prevues, 1));
      SELECT max(j.created_at) INTO v_dernier FROM cross_post_jobs j
      WHERE j.user_id = v_compte.id AND j.action = 'republish'
        AND j.platform_fields ->> 'republish_source' = 'auto'
        AND j.created_at >= v_row.debut;
      CONTINUE WHEN v_dernier IS NOT NULL AND v_dernier > now() - make_interval(secs => v_intervalle);
      -- 6bis. Le créneau s'arrête à ce qu'il a ANNONCÉ.
      SELECT count(*) INTO v_faits_cr FROM cross_post_jobs j
      WHERE j.user_id = v_compte.id AND j.action = 'republish' AND j.platform = v_pf
        AND j.platform_fields ->> 'republish_creneau_id' = v_row.id::text;
      IF v_row.prevues IS NOT NULL AND v_faits_cr >= v_row.prevues THEN
        PERFORM republish_creneau_noter(v_row.id,
          jsonb_build_object('_prevues_atteintes', jsonb_build_object('motif', 'prevues_atteintes', 'prevues', v_row.prevues, 'at', now())));
        CONTINUE;
      END IF;

      -- 7. Plafond de la boutique connectée (Vinted, calculé plus haut).
      IF v_plafond_b IS NOT NULL AND v_faits_b >= v_plafond_b THEN
        PERFORM republish_creneau_noter(v_row.id,
          jsonb_build_object('_plafond_boutique:' || v_boutique,
            jsonb_build_object('motif', 'plafond_boutique', 'boutique', v_boutique, 'plafond', v_plafond_b, 'at', now())));
        CONTINUE;
      END IF;

      -- 8. Candidats : boutique connectée d'abord, sans boutique ensuite,
      -- autres boutiques jamais pendant ce créneau (Vinted seul).
      v_notes := '{}'::jsonb; v_examines := 0;
      FOR v_cand IN
        SELECT c.inv_id, c.item_id, c.boutique, c.titre, c.motif, c.rang
        FROM republish_planifiee_candidats(v_compte.id, v_regl, v_pf) c
        ORDER BY CASE WHEN v_boutique IS NOT NULL AND c.boutique = v_boutique THEN 0
                      WHEN c.boutique IS NULL THEN 1
                      ELSE 2 END,
                 c.rang
        LIMIT 50
      LOOP
        v_examines := v_examines + 1;
        v_cle := CASE WHEN v_pf = 'vinted' AND v_cand.item_id IS NOT NULL
                      THEN v_cand.item_id ELSE 'inv:' || v_cand.inv_id::text END;
        IF v_cand.motif IS NOT NULL THEN
          IF NOT (v_row.sautes ? v_cle) AND NOT (v_notes ? v_cle)
             AND NOT EXISTS (
               SELECT 1 FROM cross_post_jobs j
               WHERE j.user_id = v_compte.id AND j.action = 'republish' AND j.platform = v_pf
                 AND j.platform_fields ->> 'republish_creneau_id' = v_row.id::text
                 AND j.inventaire_id = v_cand.inv_id) THEN
            v_notes := v_notes || jsonb_build_object(v_cle,
              jsonb_build_object('motif', v_cand.motif, 'titre', left(COALESCE(v_cand.titre, ''), 80),
                                 'platform', v_pf, 'at', now()));
          END IF;
          CONTINUE;
        END IF;
        IF v_boutique IS NOT NULL AND v_multi AND v_cand.boutique IS NOT NULL AND v_cand.boutique <> v_boutique THEN
          IF NOT (v_row.sautes ? v_cle) AND NOT (v_notes ? v_cle) THEN
            v_notes := v_notes || jsonb_build_object(v_cle,
              jsonb_build_object('motif', 'autre_boutique', 'boutique', v_cand.boutique,
                                 'titre', left(COALESCE(v_cand.titre, ''), 80), 'platform', v_pf, 'at', now()));
          END IF;
          CONTINUE;
        END IF;

        -- 9. L'APPEL, avec l'identité de l'utilisateur et rien d'autre.
        BEGIN
          PERFORM set_config('request.jwt.claims',
            json_build_object('sub', v_compte.id, 'role', 'authenticated')::text, true);
          v_rpc := public.spend_coins_and_republish(v_cand.inv_id, v_cand.item_id, 'auto', NULL, v_pf);
          PERFORM set_config('request.jwt.claims', '', true);
        EXCEPTION WHEN OTHERS THEN
          PERFORM set_config('request.jwt.claims', '', true);
          v_rpc := jsonb_build_object('allowed', false, 'reason', 'exception',
                                      'message', left(SQLERRM, 200));
        END;
        v_reason := v_rpc ->> 'reason';

        v_ligne := jsonb_build_object(
          'compte', v_compte.email, 'platform', v_pf, 'inventaire_id', v_cand.inv_id,
          'vinted_item_id', v_cand.item_id, 'examines', v_examines,
          'creneau_id', v_row.id, 'boutique', v_boutique,
          'allowed', COALESCE((v_rpc ->> 'allowed')::boolean, false),
          'reason', v_reason);

        IF COALESCE((v_rpc ->> 'allowed')::boolean, false) THEN
          v_job := NULLIF(v_rpc ->> 'job_id', '')::uuid;
          UPDATE cross_post_jobs
             SET platform_fields = platform_fields || jsonb_build_object(
                   'republish_moteur', 'serveur',
                   'republish_planifie', true,
                   'republish_creneau_id', v_row.id::text,
                   'republish_sweep_at', to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SSOF'))
           WHERE id = v_job;
          v_ligne := v_ligne || jsonb_build_object('job_id', v_job);
          v_rapport := v_rapport || v_ligne;
          v_cree := true;
          EXIT;
        END IF;

        IF NOT (v_row.sautes ? v_cle) AND NOT (v_notes ? v_cle) THEN
          v_notes := v_notes || jsonb_build_object(v_cle,
            jsonb_build_object('motif', COALESCE(v_reason, 'refus_sans_motif'),
                               'titre', left(COALESCE(v_cand.titre, ''), 80),
                               'platform', v_pf, 'at', now()));
        END IF;
        v_rapport := v_rapport || v_ligne;
        -- Portée ARTICLE → candidat suivant ; portée COMPTE → on sort.
        IF v_reason IN ('invalid_item', 'republish_en_cours', 'cadence_24h',
                        'article_sans_photo', 'article_vendu', 'annonce_introuvable') THEN
          CONTINUE;
        END IF;
        v_notes := v_notes || jsonb_build_object('_refus_compte',
          jsonb_build_object('motif', COALESCE(v_reason, 'refus_sans_motif'), 'message', v_rpc ->> 'message',
                             'platform', v_pf, 'at', now()));
        EXIT;
      END LOOP;

      IF v_notes <> '{}'::jsonb THEN
        PERFORM republish_creneau_noter(v_row.id, v_notes);
      END IF;
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object(
    'actif', true,
    'comptes', v_comptes,
    'traites', jsonb_array_length(v_rapport),
    'crees', (SELECT count(*) FROM jsonb_array_elements(v_rapport) e
              WHERE COALESCE((e ->> 'allowed')::boolean, false)),
    'detail', v_rapport);
END;
$function$;

CREATE OR REPLACE FUNCTION public.titre_norm(t text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT trim(regexp_replace(
    lower(translate(coalesce(t, ''),
      'àâäáãåéèêëíìîïóòôöõúùûüçñýÿœæÀÂÄÁÃÅÉÈÊËÍÌÎÏÓÒÔÖÕÚÙÛÜÇÑÝŒÆ',
      'aaaaaaeeeeiiiiooooouuuucnyyoaAAAAAAEEEEIIIIOOOOOUUUUCNYOA')),
    '[^a-z0-9]+', ' ', 'g'));
$function$;

CREATE OR REPLACE FUNCTION public.aspects_garde_corroboration()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_observer      text;
  v_categorie_nee timestamptz;
  v_deja          boolean;
  v_temoins       integer;
  v_releveurs     integer;
  v_champ_vu      timestamptz;
BEGIN
  v_observer := coalesce(auth.uid()::text, 'service');

  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.platform_category_aspect_observations
           (platform, category_key, field_key, observer, required, source)
    VALUES (NEW.platform, NEW.category_key, NEW.field_key, v_observer,
            NEW.required, NEW.source)
    ON CONFLICT (platform, category_key, field_key, observer) DO UPDATE
       SET required     = EXCLUDED.required,
           source       = EXCLUDED.source,
           last_seen_at = now(),
           seen_count   = platform_category_aspect_observations.seen_count + 1;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    v_deja := OLD.required;
  ELSE
    SELECT a.required INTO v_deja
      FROM public.platform_category_aspects a
     WHERE a.platform = NEW.platform
       AND a.category_key = NEW.category_key
       AND a.field_key = NEW.field_key;
  END IF;

  IF NEW.required IS NOT TRUE
     OR NEW.source <> 'dom'
     OR v_observer = 'service'
     OR v_deja IS TRUE THEN
    RETURN NEW;
  END IF;

  SELECT min(first_seen_at) INTO v_categorie_nee
    FROM public.platform_category_aspects
   WHERE platform = NEW.platform AND category_key = NEW.category_key;

  IF v_categorie_nee IS NULL OR v_categorie_nee > now() - interval '24 hours' THEN
    RETURN NEW;
  END IF;

  SELECT min(first_seen_at) INTO v_champ_vu
    FROM public.platform_category_aspect_observations
   WHERE platform = NEW.platform AND category_key = NEW.category_key
     AND field_key = NEW.field_key;

  SELECT count(DISTINCT observer) INTO v_temoins
    FROM public.platform_category_aspect_observations
   WHERE platform = NEW.platform AND category_key = NEW.category_key
     AND field_key = NEW.field_key AND required IS TRUE;

  SELECT count(DISTINCT observer) INTO v_releveurs
    FROM public.platform_category_aspect_observations
   WHERE platform = NEW.platform AND category_key = NEW.category_key
     AND last_seen_at >= coalesce(v_champ_vu, now());

  IF v_temoins >= 2 AND v_temoins * 2 >= greatest(v_releveurs, 1) THEN
    RETURN NEW;
  END IF;

  RAISE LOG 'aspects: quarantaine % / % / % — % temoin(s) requis sur % releveur(s), observe par %',
    NEW.platform, NEW.category_key, NEW.field_key, v_temoins, v_releveurs, v_observer;
  NEW.required := false;
  RETURN NEW;
END;
$function$;

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
BEGIN
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
    UPDATE annonces_plateforme SET inventaire_id = p_garde, source_rapprochement = 'manuel', proposition = NULL, updated_at = now()
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

CREATE OR REPLACE FUNCTION public.rapprocher_budget(p_part numeric DEFAULT 0.7, p_defaut interval DEFAULT '00:01:00'::interval)
 RETURNS interval
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE v_txt text := current_setting('statement_timeout', true); v_b interval;
BEGIN
  IF v_txt IS NULL OR v_txt = '' THEN RETURN p_defaut; END IF;
  BEGIN
    IF v_txt ~ '^\d+$' THEN v_b := make_interval(secs => (v_txt::numeric / 1000.0)::double precision);
    ELSE v_b := v_txt::interval; END IF;
  EXCEPTION WHEN OTHERS THEN RETURN p_defaut; END;
  IF v_b <= interval '0' THEN RETURN p_defaut; END IF;
  RETURN v_b * p_part::double precision;
END;
$function$;

CREATE OR REPLACE FUNCTION public.rapprocher_rattraper(p_user uuid, p_platform text, p_simulation boolean DEFAULT true, p_second_releve_requis boolean DEFAULT true, p_budget_secondes numeric DEFAULT 50)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_vus text[]; v_id uuid; v_res text; v_import_ouvert boolean;
  v_debut timestamptz := clock_timestamp();
  v_issues jsonb := '{}'::jsonb;
  n_examinees integer := 0; n_restantes integer := 0;
  v_inv_avant integer; v_inv_apres integer; v_ratt_avant integer; v_ratt_apres integer;
BEGIN
  IF p_platform NOT IN ('leboncoin', 'beebs', 'ebay', 'opla') THEN RETURN jsonb_build_object('ok', false, 'reason', 'plateforme'); END IF;
  v_import_ouvert := COALESCE((SELECT value FROM coin_config WHERE key = 'import_auto_ouvert'), 0) = 1;
  SELECT COALESCE(array_agg(listing_id), ARRAY[]::text[]) INTO v_vus
    FROM annonces_plateforme WHERE user_id = p_user AND platform = p_platform AND disparu_le IS NULL;
  SELECT count(*) INTO v_inv_avant FROM inventaire WHERE user_id = p_user AND fusionne_dans IS NULL;
  SELECT count(*) INTO v_ratt_avant FROM annonces_plateforme
   WHERE user_id = p_user AND platform = p_platform AND disparu_le IS NULL AND inventaire_id IS NOT NULL;
  BEGIN
    FOR v_id IN
      SELECT a.id FROM annonces_plateforme a
      WHERE a.user_id = p_user AND a.platform = p_platform
        AND a.inventaire_id IS NULL AND a.ignoree_le IS NULL AND a.disparu_le IS NULL
      -- Les annonces SANS proposition d'abord : une proposition déjà posée n'a
      -- rien à gagner à repasser avant celles qui n'ont encore rien.
      ORDER BY (a.proposition IS NOT NULL), a.vu_le, a.created_at
    LOOP
      n_examinees := n_examinees + 1;
      IF clock_timestamp() - v_debut > make_interval(secs => p_budget_secondes::double precision) THEN
        n_restantes := n_restantes + 1; CONTINUE;
      END IF;
      v_res := rapprocher_traiter_annonce(v_id, v_vus, v_import_ouvert, true, p_second_releve_requis);
      v_issues := jsonb_set(v_issues, ARRAY[v_res], to_jsonb(COALESCE((v_issues ->> v_res)::integer, 0) + 1));
    END LOOP;
    SELECT count(*) INTO v_inv_apres FROM inventaire WHERE user_id = p_user AND fusionne_dans IS NULL;
    SELECT count(*) INTO v_ratt_apres FROM annonces_plateforme
     WHERE user_id = p_user AND platform = p_platform AND disparu_le IS NULL AND inventaire_id IS NOT NULL;
    IF p_simulation THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'rapprocher_rattraper:simulation';
    END IF;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'rapprocher_rattraper:simulation' THEN RAISE; END IF;
  END;
  RETURN jsonb_build_object('ok', true, 'simulation', p_simulation, 'user_id', p_user, 'platform', p_platform,
                            'import_ouvert', v_import_ouvert, 'second_releve_requis', p_second_releve_requis,
                            'examinees', n_examinees, 'restantes', n_restantes, 'issues', v_issues,
                            'inventaire_avant', v_inv_avant, 'inventaire_apres', v_inv_apres,
                            'rattachees_avant', v_ratt_avant, 'rattachees_apres', v_ratt_apres,
                            'duree_ms', round(extract(epoch FROM (clock_timestamp() - v_debut)) * 1000));
END;
$function$;

-- ── TRIGGERS ─────────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS cross_post_jobs_republish_maintenance ON public.cross_post_jobs;
CREATE TRIGGER cross_post_jobs_republish_maintenance BEFORE INSERT ON public.cross_post_jobs FOR EACH ROW EXECUTE FUNCTION republish_maintenance_guard();

DROP TRIGGER IF EXISTS enforce_inventory_limit ON public.inventaire;
CREATE TRIGGER enforce_inventory_limit BEFORE INSERT ON public.inventaire FOR EACH ROW EXECUTE FUNCTION check_inventory_limit();

-- ── POLICIES (créées hors migrations) ───────────────────────────────────────
DROP POLICY IF EXISTS "founder_config_read_public" ON public.founder_config;
CREATE POLICY "founder_config_read_public" ON public.founder_config AS PERMISSIVE FOR SELECT TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "delete own" ON public.inventaire;
CREATE POLICY "delete own" ON public.inventaire AS PERMISSIVE FOR DELETE TO public
  USING ((auth.uid() = user_id));

DROP POLICY IF EXISTS "insert own" ON public.inventaire;
CREATE POLICY "insert own" ON public.inventaire AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((auth.uid() = user_id));

DROP POLICY IF EXISTS "select own" ON public.inventaire;
CREATE POLICY "select own" ON public.inventaire AS PERMISSIVE FOR SELECT TO public
  USING ((auth.uid() = user_id));

DROP POLICY IF EXISTS "update own" ON public.inventaire;
CREATE POLICY "update own" ON public.inventaire AS PERMISSIVE FOR UPDATE TO public
  USING ((auth.uid() = user_id));

DROP POLICY IF EXISTS "select own profile" ON public.profiles;
CREATE POLICY "select own profile" ON public.profiles AS PERMISSIVE FOR SELECT TO public
  USING ((auth.uid() = id));

DROP POLICY IF EXISTS "delete own" ON public.ventes;
CREATE POLICY "delete own" ON public.ventes AS PERMISSIVE FOR DELETE TO public
  USING ((auth.uid() = user_id));

DROP POLICY IF EXISTS "insert own" ON public.ventes;
CREATE POLICY "insert own" ON public.ventes AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((auth.uid() = user_id));

DROP POLICY IF EXISTS "select own" ON public.ventes;
CREATE POLICY "select own" ON public.ventes AS PERMISSIVE FOR SELECT TO public
  USING ((auth.uid() = user_id));
