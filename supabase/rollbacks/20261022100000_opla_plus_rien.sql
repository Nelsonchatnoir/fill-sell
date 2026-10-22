-- ═══════════════════════════════════════════════════════════════════════════
-- INVERSE de 20261022100000_opla_plus_rien : les définitions lues en prod le 22/10, à l'identique
-- ═══════════════════════════════════════════════════════════════════════════
-- Les marqueurs platform_fields.opla_a_retirer déjà posés restent (inertes pour l'ancienne app).
-- ═══ CORPS DE L'INVERSE
BEGIN;

CREATE OR REPLACE FUNCTION public.armer_retrait_job_pour(p_job_id uuid, p_chemin text, p_delai interval, p_preuve_geste boolean)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  j        public.cross_post_jobs%rowtype;
  v_item   text;
  v_url    text;
  v_ident  text;
  v_sans_lien boolean;
  v_pf     jsonb;
  v_del    uuid;
  v_compte text;
begin
  select * into j from public.cross_post_jobs where id = p_job_id for update;
  if not found or j.inventaire_id is null
     or coalesce(j.action, 'publish') not in ('publish', 'republish')
     or j.status is distinct from 'published' then
    return null;
  end if;

  -- Point A, incident Angel : le dépôt prouve l'annonce, pas une vente.
  -- Lecture indexée ventes_user_inventaire_idx ; aucune réécriture de données.
  if not exists (
    select 1 from public.ventes v
    join public.inventaire i on i.id = v.inventaire_id and i.user_id = v.user_id
    where v.user_id = j.user_id and v.inventaire_id = j.inventaire_id
      and i.statut = 'vendu'
      and lower(coalesce(v.statut, '')) not in ('annule', 'annulée', 'cancelled', 'canceled')
      and coalesce(nullif(v.plateforme_code, ''), nullif(v.plateforme, '')) is not null
      and lower(coalesce(nullif(i.plateforme, ''), nullif(v.plateforme_code, ''), v.plateforme)) <> lower(j.platform)
    limit 1
  ) and not public.vente_prouvee_fiche_liee(j.inventaire_id, j.platform) then  -- (18/10) comptes reliés : la vente de la jumelle vaut preuve
    -- (2026-09-30, règle Louis partie 2 — décision Nico) Le geste de la
    -- personne vaut preuve de vente pour CE retrait-là seulement : « oui » à
    -- « Déjà vendu ? » sur l'annonce que l'app lui a montrée (preuve déjà
    -- reconnue le 27/09). La fiche doit être vendue, et jamais sur la
    -- plateforme de l'annonce retirée. Toutes les autres gardes restent.
    if not coalesce(p_preuve_geste, false) or not exists (
      select 1 from public.inventaire i
       where i.id = j.inventaire_id and i.user_id = j.user_id and i.statut = 'vendu'
         and lower(coalesce(nullif(i.plateforme, ''), '')) <> lower(j.platform)
    ) then
      return null;
    end if;
  end if;
  -- (27/09 soir) UN TITRE N'EST JAMAIS UNE PREUVE : l'annonce doit être liée à
  -- SA fiche par une preuve, et la fiche ne doit pas porter deux annonces
  -- vivantes sur cette plateforme (deux annonces = deux exemplaires).
  if not public.retrait_job_prouve(j.id) then
    return null;
  end if;
  -- (15/10, P16) Deux annonces vivantes sur la plateforme : rien d'office — sauf
  -- le « oui » de la personne à « Déjà vendu ? » sur CETTE annonce (montrée par
  -- l'écran, preuve par le geste) : c'est elle, et elle seule, qui part.
  if public.fiche_annonces_vivantes(j.inventaire_id, j.platform) >= 2 and not coalesce(p_preuve_geste, false) then
    return null;
  end if;
  if coalesce(j.platform_fields ->> 'sale_signal', '') = 'sold' then
    return null;
  end if;
  v_url := nullif(btrim(coalesce(j.listing_url, '')), '');
  if j.platform = 'vinted' then
    v_item := coalesce(case when j.platform_listing_id ~ '^\d+$' then j.platform_listing_id end,
                       substring(v_url from '/items/(\d+)'));
    if v_item is not null and public.vinted_annonce_vendue(j.user_id, v_item) then
      return null;
    end if;
  end if;
  v_sans_lien := v_url is null and nullif(btrim(coalesce(j.platform_listing_id, '')), '') is null;
  if exists (
    select 1 from public.cross_post_jobs d
     where d.user_id = j.user_id and d.inventaire_id = j.inventaire_id
       and d.platform = j.platform and d.action = 'delete'
       and (d.status in ('pending', 'processing', 'needs_user')
            or (d.status = 'deleted' and d.created_at >= coalesce(j.published_at, j.created_at)))
       and (v_sans_lien
            or public.listing_designe(coalesce(j.platform_listing_id, v_item, v_url), d.listing_url, d.platform_listing_id)
            or (v_url is not null and d.listing_url = v_url)
            or (j.platform_listing_id is not null and d.platform_listing_id = j.platform_listing_id))
  ) then
    return null;
  end if;
  v_pf := jsonb_build_object('arme_par', jsonb_build_object(
            'chemin', p_chemin, 'le', now(), 'depot', j.id,
            'pose_par', 'armer_retrait_job (serveur)'));
  if coalesce(p_preuve_geste, false) then
    v_pf := v_pf || jsonb_build_object('preuve', 'geste_deja_vendu');   -- MODIF 2026-09-30
  end if;
  if v_url is null then
    v_pf := v_pf || jsonb_build_object('removal_url_missing', true);
  end if;
  if j.platform = 'beebs' and v_sans_lien then
    v_pf := v_pf || jsonb_build_object('retrait_attend_lien', jsonb_build_object(
              'depuis', now(), 'motif', 'depot_beebs_en_verification_a_la_vente'));
  end if;
  if j.platform = 'vinted' then
    select nullif(btrim(i.vinted_account_id::text), '') into v_compte
      from public.inventaire i where i.id = j.inventaire_id;
    if v_compte is not null then
      v_pf := v_pf || jsonb_build_object('vinted_account_id', v_compte);
    end if;
  end if;
  -- (18/10, retrait Depop 81188384) Le numéro de l'annonce rendu au dépôt
  -- (depop_product_id : POST listing/products → 201 {id, slug}) suit le retrait :
  -- l'extension retire par ce numéro, sans dépendre de la lecture du lien.
  if j.platform = 'depop' and coalesce(j.platform_fields ->> 'depop_product_id', '') ~ '^[0-9]+$' then
    v_pf := v_pf || jsonb_build_object('depop_product_id', j.platform_fields -> 'depop_product_id');
  end if;
  if p_delai is not null and p_delai > interval '0' then
    v_pf := v_pf || jsonb_build_object('next_action_after', to_jsonb(now() + p_delai));
  end if;
  insert into public.cross_post_jobs
    (user_id, inventaire_id, platform, action, status, photo_option, title, listing_url, platform_listing_id, platform_fields)
  values
    (j.user_id, j.inventaire_id, j.platform, 'delete', 'pending', 'original',
     j.title, v_url, nullif(btrim(coalesce(j.platform_listing_id, '')), ''), v_pf)
  returning id into v_del;
  update public.cross_post_jobs
     set platform_fields = coalesce(platform_fields, '{}'::jsonb) || jsonb_build_object(
           'pending_removal', false,
           'retrait_arme', jsonb_build_object('job', v_del, 'le', now(), 'chemin', p_chemin))
   where id = j.id;
  return v_del;
end;
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

CREATE OR REPLACE FUNCTION public.garde_opla_sortie_jobs()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_avant text := CASE WHEN TG_OP = 'UPDATE' THEN OLD.status ELSE NEW.status END;
  v_pf    jsonb := coalesce(NEW.platform_fields, '{}'::jsonb);
BEGIN
  IF NOT public.opla_sortie_passee() THEN RETURN NEW; END IF;
  -- L'erreur d'avant est gardée (comme archiverErreur) : jamais rien d'effacé.
  IF TG_OP = 'UPDATE' AND nullif(btrim(coalesce(OLD.error, '')), '') IS NOT NULL THEN
    v_pf := jsonb_set(v_pf, '{erreurs_archivees}',
      coalesce(v_pf -> 'erreurs_archivees', '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
        'erreur', OLD.error, 'statut', OLD.status, 'archive_le', now(), 'par', 'garde_opla_sortie_jobs (sortie d''Opla)')));
  END IF;
  NEW.platform_fields := (v_pf - 'needs_user_source' - 'next_action_after') || jsonb_build_object('opla_sortie', jsonb_build_object(
    'le', now(), 'par', 'garde_opla_sortie_jobs', 'statut_avant', v_avant,
    'source_avant', v_pf ->> 'needs_user_source', 'operation', TG_OP));
  NEW.status := 'cancelled';
  NEW.error := public.opla_message_cloture(coalesce(NEW.action, 'publish'));
  RETURN NEW;
END;
$function$;

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
      'created_at', i.created_at, 'quantite', COALESCE(i.quantite, 1), 'vinted_item_id', i.vinted_item_id
    )), '[]'::jsonb)
    INTO v_fiches
    FROM inventaire i
   WHERE i.user_id = p_user AND i.fusionne_dans IS NULL AND i.statut IN ('stock', 'vendu');

  WITH runs AS (
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
      'derniere_par', d.par, 'derniere_decision', d.decision, 'derniere_motif', d.motif
    )), '[]'::jsonb)
    INTO v_annonces
    FROM annonces_plateforme a
    LEFT JOIN runs ru ON ru.id = a.run_id
    LEFT JOIN LATERAL (SELECT r.par, r.decision, r.detail ->> 'motif' motif FROM rapprochements r
                        WHERE r.annonce_id = a.id AND r.decision IN ('attache', 'import', 'ignore')
                        ORDER BY r.created_at DESC LIMIT 1) d ON true
   WHERE a.user_id = p_user AND a.disparu_le IS NULL AND a.platform IN ('leboncoin', 'beebs', 'ebay', 'opla', 'depop')
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

  RETURN jsonb_build_object(
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

CREATE OR REPLACE FUNCTION public.rapprochement_fin_run()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  BEGIN
    IF EXISTS (SELECT 1 FROM rapprochement_comptes c WHERE c.user_id = NEW.user_id AND c.etat <> 'termine')
       OR EXISTS (SELECT 1 FROM annonces_plateforme a
                   WHERE a.user_id = NEW.user_id AND a.inventaire_id IS NULL AND a.ignoree_le IS NULL AND a.disparu_le IS NULL
                     AND a.platform IN ('leboncoin', 'beebs', 'ebay', 'opla', 'depop'))
       -- (08/10, complément) des fiches du dressing Vinted nées depuis la
       -- dernière passe, dans un compte qui a des imports d'autres plateformes
       OR (EXISTS (SELECT 1 FROM inventaire v WHERE v.user_id = NEW.user_id AND v.origine = 'vinted_sync' AND v.fusionne_dans IS NULL
                     AND v.created_at > rapprochement_v3_vinted_depuis(NEW.user_id))
           AND (EXISTS (SELECT 1 FROM inventaire r WHERE r.user_id = NEW.user_id AND r.origine LIKE 'releve\_%'
                          AND r.fusionne_dans IS NULL AND r.statut IN ('stock', 'vendu'))
                OR EXISTS (SELECT 1 FROM inventaire i WHERE i.user_id = NEW.user_id AND i.fusionne_dans IS NULL AND i.statut = 'stock'
                             AND i.vinted_item_id IS NULL AND COALESCE(i.origine, '') <> 'vinted_sync' AND COALESCE(i.origine, '') NOT LIKE 'releve\_%')))
       -- (08/10 soir) des fiches créées à la main nées depuis la dernière passe,
       -- dans un compte qui a des fiches Vinted
       OR (EXISTS (SELECT 1 FROM inventaire i WHERE i.user_id = NEW.user_id AND i.fusionne_dans IS NULL AND i.statut = 'stock'
                     AND i.vinted_item_id IS NULL AND COALESCE(i.origine, '') <> 'vinted_sync' AND COALESCE(i.origine, '') NOT LIKE 'releve\_%' AND i.created_at > rapprochement_v3_fiches_main_depuis(NEW.user_id))
           AND EXISTS (SELECT 1 FROM inventaire v WHERE v.user_id = NEW.user_id AND v.fusionne_dans IS NULL AND v.statut = 'stock'
                         AND (v.vinted_item_id IS NOT NULL OR v.origine = 'vinted_sync'))) THEN
      PERFORM rapprochement_demander(NEW.user_id, 'fin_run:' || COALESCE(NEW.platform, NEW.kind));
      PERFORM rapprochement_relancer(NEW.user_id);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'rapprochement_fin_run (%) : %', NEW.id, SQLERRM;
  END;
  RETURN NULL;
END;
$function$;

CREATE OR REPLACE FUNCTION public.annonces_en_rangement()
 RETURNS TABLE(annonce_id uuid, platform text, cree_le timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT x.annonce_id, x.platform, x.cree_le FROM (
    SELECT a.id annonce_id, a.platform, COALESCE(a.vu_le, a.created_at) cree_le
      FROM annonces_plateforme a
     WHERE a.user_id = auth.uid() AND a.inventaire_id IS NULL AND a.ignoree_le IS NULL AND a.disparu_le IS NULL
       AND a.proposition IS NULL AND a.platform IN ('leboncoin', 'beebs', 'ebay', 'opla', 'depop')
       AND EXISTS (SELECT 1 FROM rapprochement_comptes c WHERE c.user_id = a.user_id AND c.etat <> 'termine')
    UNION ALL
    SELECT w.annonce_id, w.platform, w.cree_le
      FROM rapprochement_photo_attente w
     WHERE w.user_id = auth.uid() AND w.etat = 'attente'
  ) x
  ORDER BY x.cree_le
  LIMIT 2000;
$function$;

CREATE OR REPLACE FUNCTION public.rapprochement_v3_fiche_de(p_user uuid, p_annonce uuid, p_geste boolean)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE a annonces_plateforme%ROWTYPE; v_run vinted_sync_runs%ROWTYPE; v_imp jsonb;
BEGIN
  SELECT * INTO a FROM annonces_plateforme WHERE id = p_annonce AND user_id = p_user;
  IF a.id IS NULL THEN RETURN NULL; END IF;
  IF a.inventaire_id IS NOT NULL THEN RETURN a.inventaire_id; END IF;
  IF a.ignoree_le IS NOT NULL OR a.disparu_le IS NOT NULL OR a.fiche_supprimee_le IS NOT NULL THEN RETURN NULL; END IF;
  IF a.statut_plateforme IS DISTINCT FROM 'en_ligne' THEN RETURN NULL; END IF;
  IF releve_run_hors_liste(a.run_id) THEN RETURN NULL; END IF;
  IF a.platform = 'ebay' AND a.run_id IS NOT NULL AND releve_ebay_run_bloque(a.run_id) THEN RETURN NULL; END IF;
  IF a.platform = 'beebs' AND releve_dette_beebs(p_user) THEN RETURN NULL; END IF;
  IF COALESCE((SELECT value FROM coin_config WHERE key = 'import_auto_ouvert'), 0) <> 1 THEN RETURN NULL; END IF;
  IF NOT p_geste THEN
    SELECT * INTO v_run FROM vinted_sync_runs WHERE id = a.run_id;
    IF NOT releve_est_geste(v_run.declencheur) THEN RETURN NULL; END IF;
  END IF;
  v_imp := rapprocher_importer(p_user, a.id, 'rapprochement');
  IF COALESCE((v_imp ->> 'ok')::boolean, false) THEN RETURN (v_imp ->> 'inventaire_id')::bigint; END IF;
  RETURN NULL;
END;
$function$;

CREATE OR REPLACE FUNCTION public.rapprochement_attacher(p_annonce uuid, p_inv bigint, p_motif text, p_detail jsonb DEFAULT '{}'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE a annonces_plateforme%ROWTYPE; v_job uuid;
BEGIN
  SELECT * INTO a FROM annonces_plateforme WHERE id = p_annonce FOR UPDATE;
  IF a.id IS NULL OR a.inventaire_id IS NOT NULL OR a.ignoree_le IS NOT NULL THEN RETURN NULL; END IF;
  v_job := rapprocher_job_de_suivi(a.user_id, a.platform, p_inv, a.titre, a.prix, a.url, a.listing_id, 'auto',
             jsonb_build_object('annonce_id', a.id, 'motif', p_motif, 'run_id', a.run_id) || COALESCE(p_detail, '{}'::jsonb));
  UPDATE annonces_plateforme SET inventaire_id = p_inv, job_id = v_job, source_rapprochement = 'automatique',
                                 proposition = NULL, updated_at = now()
   WHERE id = a.id;
  INSERT INTO rapprochements (user_id, annonce_id, inventaire_id, decision, par, score, detail)
  VALUES (a.user_id, a.id, p_inv, 'attache', 'auto', 1,
          jsonb_build_object('run_id', a.run_id, 'job_id', v_job, 'motif', p_motif, 'regle', 'rattachement_avant_stock') || COALESCE(p_detail, '{}'::jsonb));
  RETURN v_job;
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
  v_q_inv bigint; v_q_motif text; v_q_preuves jsonb; v_q_posee boolean := false;
  v_sans_question boolean := p_par IN ('utilisateur', 'rapprochement');
BEGIN
  SELECT * INTO a FROM annonces_plateforme WHERE id = p_annonce_id AND user_id = p_user FOR UPDATE;
  IF a.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'annonce_introuvable'); END IF;
  IF a.inventaire_id IS NOT NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'deja_rattachee'); END IF;
  IF releve_run_hors_liste(a.run_id) THEN RETURN jsonb_build_object('ok', false, 'reason', 'hors_liste'); END IF;
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
  -- (2026-09-27) La décision de la personne fait foi : le trigger
  -- cross_post_jobs_lien_jamais_croise la laisse passer (transaction seule).
  PERFORM set_config('fillsell.lien_decide_par_utilisateur', 'on', true);
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
    -- (2026-09-27) L'annonce appartient à l'article choisi : les jobs des
    -- AUTRES articles qui la désignaient sont recâblés sur leur identifiant
    -- certain, sinon déliés (defaire_croisement_annonce).
    PERFORM defaire_croisement_annonce(v_user, a.platform, a.listing_id, v_inv);
    IF v_job IS NOT NULL THEN
      PERFORM rapprocher_recabler_job(v_job, a.url, a.listing_id, 'utilisateur', jsonb_build_object('annonce_id', a.id));
    ELSE
      v_job := rapprocher_job_de_suivi(v_user, a.platform, v_inv, a.titre, a.prix, a.url, a.listing_id, 'utilisateur', jsonb_build_object('annonce_id', a.id));
    END IF;
    -- (07/10) Article VENDU : le suivi part « vendu, encore en ligne ».
    IF EXISTS (SELECT 1 FROM inventaire i WHERE i.id = v_inv AND i.statut = 'vendu') THEN
      UPDATE cross_post_jobs
         SET status = 'cancelled',
             platform_fields = COALESCE(platform_fields, '{}'::jsonb) || jsonb_build_object('pending_removal', true,
                               'vendu_encore_en_ligne', jsonb_build_object('annonce_id', a.id, 'par', 'utilisateur', 'at', now()))
       WHERE id = v_job AND user_id = v_user AND platform_fields ->> 'source' = 'releve';
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

DROP FUNCTION IF EXISTS public.opla_copie_a_retirer_noter(uuid, text);

COMMIT;
-- ═══ FIN DU CORPS DE L'INVERSE ══════════════════════════════════════════════
