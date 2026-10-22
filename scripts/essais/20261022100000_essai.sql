-- Essai à blanc de 20261022100000_opla_plus_rien (22/10) : ROLLBACK, rien n'est gardé.
-- Généré par : node scripts/essais/20261022100000_essai_generer.mjs  →  scripts/essais/20261022100000_essai.sql
-- npx supabase db query --linked -f scripts/essais/20261022100000_essai.sql
-- A : structure et droits. B : XEWER (données réelles) — vente, geste « retirer », suppression de fiche.
-- C : moteur de rapprochement (annonces Opla orphelines). D : rejeu symétrique ANCIENNE / NOUVELLE fonction sur les
-- retraits armés des 7 derniers jours et sur des suppressions de fiches à copies mixtes.
begin;
set local statement_timeout = '170s';
create temp table _r (essai text, ok boolean, detail text);
grant all on _r to public;

-- Les définitions d'AVANT (prod du 22/10), sous un autre nom, pour le rejeu symétrique.
CREATE OR REPLACE FUNCTION public._avant_armer_retrait_job_pour(p_job_id uuid, p_chemin text, p_delai interval, p_preuve_geste boolean)
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

CREATE OR REPLACE FUNCTION public._avant_rapprochement_v3_lire(p_user uuid)
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

create temp table _defs_avant (nom text, definition text);
insert into _defs_avant values ('inventaire_arme_retraits_avant_suppression', $def$CREATE OR REPLACE FUNCTION public.inventaire_arme_retraits_avant_suppression()
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
$function$;$def$);

-- La migration (corps exact, sans BEGIN / COMMIT).

CREATE OR REPLACE FUNCTION public.opla_copie_a_retirer_noter(p_job uuid, p_chemin text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
-- (22/10, XEWER — OPLA : PLUS RIEN) L'information « peut-être encore en ligne sur Opla : retire-la toi-même » est
-- posée UNE fois, sur la COPIE Opla (le job de publication), jamais par un job de plus. Rien n'est écrit si elle est
-- déjà là, si la personne a déjà dit « C'est fait » (sur la copie ou sur un ancien retrait clos de la même annonce),
-- ou si la copie n'est pas une publication Opla vivante. Aucune ligne inchangée n'est réécrite.
DECLARE
  c public.cross_post_jobs%ROWTYPE;
BEGIN
  SELECT * INTO c FROM public.cross_post_jobs WHERE id = p_job;
  IF c.id IS NULL OR c.platform IS DISTINCT FROM 'opla' OR c.status IS DISTINCT FROM 'published'
     OR coalesce(c.action, 'publish') NOT IN ('publish', 'republish') THEN
    RETURN false;
  END IF;
  IF coalesce(c.platform_fields, '{}'::jsonb) ? 'opla_a_retirer'
     OR coalesce(c.platform_fields, '{}'::jsonb) ? 'opla_retire_par_la_personne' THEN
    RETURN false;
  END IF;
  IF EXISTS (SELECT 1 FROM public.cross_post_jobs d
              WHERE d.user_id = c.user_id AND d.platform = 'opla' AND d.action = 'delete'
                AND coalesce(d.platform_fields, '{}'::jsonb) ? 'opla_retire_par_la_personne'
                AND ((c.inventaire_id IS NOT NULL AND d.inventaire_id = c.inventaire_id)
                     OR public.listing_designe(coalesce(nullif(btrim(c.platform_listing_id), ''), c.listing_url), d.listing_url, d.platform_listing_id))) THEN
    RETURN false;
  END IF;
  UPDATE public.cross_post_jobs
     SET platform_fields = coalesce(platform_fields, '{}'::jsonb)
           || jsonb_build_object('opla_a_retirer', jsonb_build_object('le', now(), 'chemin', left(coalesce(p_chemin, ''), 60)))
   WHERE id = c.id AND status = 'published';
  RETURN FOUND;
END;
$function$;
REVOKE ALL ON FUNCTION public.opla_copie_a_retirer_noter(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.opla_copie_a_retirer_noter(uuid, text) TO service_role;

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
  -- (22/10, XEWER — OPLA : PLUS RIEN) Depuis la sortie d'Opla (10/10), AUCUN retrait Opla ne naît : FillSell ne
  -- touche plus Opla. Il naissait « cancelled » (garde_opla_sortie_jobs), et un retrait clos ne comptant pas dans
  -- le contrôle des doublons ci-dessous, chaque vente et chaque suppression en recréait 2 à 4 (59 chez XEWER du
  -- 11 au 22/10, 222 sur le parc). L'information « retire-la toi-même sur Opla » est posée UNE fois, sur la
  -- copie (opla_copie_a_retirer_noter) — après toutes les preuves ci-dessus, comme le retrait d'avant.
  if j.platform = 'opla' and public.opla_sortie_passee() then
    perform public.opla_copie_a_retirer_noter(j.id, p_chemin);
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
    -- (22/10, XEWER) Opla quittée : la copie Opla d'une fiche supprimée porte l'information une fois
    -- (« retire-la toi-même sur Opla ») ; aucun retrait n'est créé.
    if public.opla_sortie_passee() then
      perform public.opla_copie_a_retirer_noter(c.id, 'suppression_article')
         from public.cross_post_jobs c
        where c.user_id = old.user_id and c.inventaire_id = old.id and c.platform = 'opla'
          and coalesce(c.action, 'publish') in ('publish', 'republish') and c.status = 'published';
    end if;
    for v_pub in
      select distinct on (j.platform) j.platform, j.id, j.listing_url, j.title
        from public.cross_post_jobs j
       where j.user_id = old.user_id
         and j.inventaire_id = old.id
         and coalesce(j.action, 'publish') in ('publish', 'republish')
         and j.status = 'published'
         and nullif(btrim(j.listing_url), '') is not null
         -- (22/10) Opla quittée : jamais de retrait Opla (l'information est posée sur la copie, plus haut).
         and not (j.platform = 'opla' and public.opla_sortie_passee())
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
  -- (22/10, XEWER — OPLA : PLUS RIEN) Un RETRAIT Opla ne naît plus : avant, il naissait « cancelled » et chaque
  -- vente ou suppression en recréait (la boucle de XEWER). Toute insertion d'un retrait Opla (ancienne app, geste
  -- « retirer ») pose l'information UNE fois sur la copie et la ligne n'est pas écrite. Publication et relance
  -- d'un job Opla existant : closes comme avant.
  IF TG_OP = 'INSERT' AND NEW.action = 'delete' THEN
    PERFORM public.opla_copie_a_retirer_noter(c.id, 'retrait_demande')
       FROM public.cross_post_jobs c
      WHERE c.user_id = NEW.user_id AND c.platform = 'opla' AND c.status = 'published'
        AND coalesce(c.action, 'publish') IN ('publish', 'republish')
        AND ((NEW.inventaire_id IS NOT NULL AND c.inventaire_id = NEW.inventaire_id)
             OR public.listing_designe(coalesce(nullif(btrim(c.platform_listing_id), ''), c.listing_url), NEW.listing_url, NEW.platform_listing_id));
    RETURN NULL;
  END IF;
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
                     AND a.platform IN ('leboncoin', 'beebs', 'ebay', 'opla', 'depop')
                     AND NOT (a.platform = 'opla' AND opla_sortie_passee()))   -- (22/10) une orpheline Opla ne relance plus de passe
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
       AND NOT (a.platform = 'opla' AND opla_sortie_passee())   -- (22/10) Opla quittée : plus rien à ranger
       AND EXISTS (SELECT 1 FROM rapprochement_comptes c WHERE c.user_id = a.user_id AND c.etat <> 'termine')
    UNION ALL
    SELECT w.annonce_id, w.platform, w.cree_le
      FROM rapprochement_photo_attente w
     WHERE w.user_id = auth.uid() AND w.etat = 'attente'
       AND NOT (w.platform = 'opla' AND opla_sortie_passee())
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
  IF a.platform = 'opla' AND opla_sortie_passee() THEN RETURN NULL; END IF;   -- (22/10) Opla quittée : jamais une fiche neuve
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
  IF a.platform = 'opla' AND opla_sortie_passee() THEN RETURN NULL; END IF;   -- (22/10) Opla quittée : jamais un job Opla neuf
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
  -- (22/10, XEWER) Opla quittée : une annonce Opla ne devient jamais une fiche de stock (2 fiches revenues le
  -- 21/10 à 21:28, dont un article vendu la veille).
  IF a.platform = 'opla' AND opla_sortie_passee() THEN RETURN jsonb_build_object('ok', false, 'reason', 'opla_sortie'); END IF;
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
    -- (22/10, XEWER) Opla quittée : ni rattachement ni import (l'écran ne les propose plus).
    IF a.platform = 'opla' AND opla_sortie_passee() THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'opla_sortie',
        'message', 'FillSell ne gère plus Opla : cette annonce ne se rattache plus et ne s''importe plus.');
    END IF;
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



-- ═══ A. Structure et droits ═════════════════════════════════════════════════
insert into _r select 'A1 dix fonctions reprises portent la règle du 22/10', count(*) = 10, count(*) || ' / 10'
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.prosrc like '%(22/10%'
   and p.proname in ('armer_retrait_job_pour', 'inventaire_arme_retraits_avant_suppression', 'garde_opla_sortie_jobs',
                     'rapprochement_v3_lire', 'rapprochement_fin_run', 'annonces_en_rangement', 'rapprochement_v3_fiche_de',
                     'rapprochement_attacher', 'rapprocher_importer', 'rapprochement_decider');
insert into _r select 'A2 opla_copie_a_retirer_noter fermée à anon et authenticated',
  not has_function_privilege('anon', 'public.opla_copie_a_retirer_noter(uuid, text)', 'execute')
  and not has_function_privilege('authenticated', 'public.opla_copie_a_retirer_noter(uuid, text)', 'execute'), '';
insert into _r select 'A3 sortie d''Opla passée (interrupteur lu)', public.opla_sortie_passee(), '';

-- ═══ B. XEWER, données réelles ══════════════════════════════════════════════
create temp table _x as select 'de63ca45-63d9-4a3c-b65a-d1345acd8b2e'::uuid u;
create temp table _avant_jobs as select id from cross_post_jobs where user_id = (select u from _x);

-- B1 Une VENTE : chaque copie Opla publiée d'une fiche vendue passe par armer_retrait_job → aucun retrait.
do $$
declare c record; r uuid; n_null int := 0; n int := 0;
begin
  for c in select j.id from cross_post_jobs j join inventaire i on i.id = j.inventaire_id
            where j.user_id = (select u from _x) and j.platform = 'opla' and j.status = 'published'
              and j.action in ('publish', 'republish') and i.statut = 'vendu' loop
    n := n + 1;
    r := public.armer_retrait_job(c.id, 'vente_article_serveur');
    if r is null then n_null := n_null + 1; end if;
  end loop;
  insert into _r values ('B1 vente : armer_retrait_job sur les copies Opla de fiches vendues → NULL', n > 0 and n_null = n, n_null || ' / ' || n);
end $$;
insert into _r select 'B2 vente : AUCUN job Opla né', count(*) = 0, count(*) || ' job(s)'
  from cross_post_jobs j where j.user_id = (select u from _x) and j.platform = 'opla' and j.id not in (select id from _avant_jobs);
-- B3 L'information posée une fois (copie dont la vente est prouvée, jamais déjà « C'est fait »).
insert into _r select 'B3 vente : information posée sur la copie (opla_a_retirer), chemin vente_article_serveur',
  count(*) > 0, count(*) || ' copie(s) marquée(s)'
  from cross_post_jobs j where j.user_id = (select u from _x) and j.platform = 'opla'
   and j.platform_fields #>> '{opla_a_retirer,chemin}' = 'vente_article_serveur';
-- B4 Deuxième passage : aucune réécriture (même date posée).
create temp table _b4 as select id, platform_fields -> 'opla_a_retirer' m from cross_post_jobs
 where user_id = (select u from _x) and platform = 'opla' and platform_fields ? 'opla_a_retirer';
do $$ declare c record; begin
  for c in select id from _b4 loop perform public.armer_retrait_job(c.id, 'vente_article_serveur'); perform public.opla_copie_a_retirer_noter(c.id, 'autre'); end loop;
end $$;
insert into _r select 'B4 deuxième passage : aucune réécriture (information unique)',
  bool_and(j.platform_fields -> 'opla_a_retirer' = b.m), count(*) || ' copie(s) relue(s)'
  from _b4 b join cross_post_jobs j on j.id = b.id;
-- B5 « C'est fait » déjà dit sur un ancien retrait clos de la même annonce : jamais d'information de plus.
insert into _r select 'B5 « C''est fait » d''avant respecté : aucune copie marquée dont un retrait porte opla_retire_par_la_personne',
  count(*) = 0, count(*) || ' copie(s) en trop'
  from cross_post_jobs j where j.user_id = (select u from _x) and j.platform = 'opla' and j.platform_fields ? 'opla_a_retirer'
   and exists (select 1 from cross_post_jobs d where d.user_id = j.user_id and d.platform = 'opla' and d.action = 'delete'
                and d.platform_fields ? 'opla_retire_par_la_personne'
                and ((j.inventaire_id is not null and d.inventaire_id = j.inventaire_id)
                     or listing_designe(coalesce(nullif(btrim(j.platform_listing_id), ''), j.listing_url), d.listing_url, d.platform_listing_id)));
-- B6 Le geste « retirer » d'une ancienne app : l'insertion d'un retrait Opla n'écrit rien.
do $$ declare c record; v uuid; begin
  select j.* into c from cross_post_jobs j where j.user_id = (select u from _x) and j.platform = 'opla' and j.status = 'published'
     and j.inventaire_id is not null and not (j.platform_fields ? 'opla_a_retirer') limit 1;
  insert into cross_post_jobs (user_id, inventaire_id, platform, action, status, photo_option, title, listing_url, platform_listing_id)
  values (c.user_id, c.inventaire_id, 'opla', 'delete', 'pending', 'original', c.title, c.listing_url, c.platform_listing_id)
  returning id into v;
  insert into _r select 'B6 ancienne app : un retrait Opla inséré n''est pas écrit', v is null and not exists (select 1 from cross_post_jobs where id = v), coalesce(v::text, 'aucune ligne');
  insert into _r select 'B7 ancienne app : l''information est posée sur la copie (retrait_demande)',
    (select platform_fields #>> '{opla_a_retirer,chemin}' from cross_post_jobs where id = c.id) = 'retrait_demande', c.id::text;
end $$;
-- B8 Une relance d'un job Opla existant reste close (comportement d'avant).
do $$ declare c uuid; s text; begin
  select id into c from cross_post_jobs where user_id = (select u from _x) and platform = 'opla' and status = 'cancelled' and action = 'delete' limit 1;
  update cross_post_jobs set status = 'pending' where id = c;
  select status into s from cross_post_jobs where id = c;
  insert into _r values ('B8 relance d''un job Opla : close comme avant', s = 'cancelled', s);
end $$;
-- B9 Suppression d'une fiche de XEWER portant une copie Opla : aucun retrait Opla, information sur la copie.
do $$ declare f bigint; c uuid; n int; ch text; begin
  select j.inventaire_id, j.id into f, c from cross_post_jobs j join inventaire i on i.id = j.inventaire_id
   where j.user_id = (select u from _x) and j.platform = 'opla' and j.status = 'published' and i.statut = 'stock'
     and not (j.platform_fields ? 'opla_a_retirer')
     and not exists (select 1 from cross_post_jobs d where d.user_id = j.user_id and d.platform = 'opla' and d.action = 'delete'
                      and d.platform_fields ? 'opla_retire_par_la_personne'
                      and (d.inventaire_id = j.inventaire_id or listing_designe(coalesce(nullif(btrim(j.platform_listing_id), ''), j.listing_url), d.listing_url, d.platform_listing_id)))
   order by i.created_at desc limit 1;
  begin
    delete from inventaire where id = f;
  exception when others then
    insert into _r values ('B9 suppression d''une fiche', false, 'erreur : ' || sqlerrm); return;
  end;
  select count(*) into n from cross_post_jobs where user_id = (select u from _x) and platform = 'opla' and action = 'delete' and id not in (select id from _avant_jobs);
  select platform_fields #>> '{opla_a_retirer,chemin}' into ch from cross_post_jobs where id = c;
  insert into _r values ('B9 suppression d''une fiche : aucun retrait Opla, information sur la copie', n = 0 and ch = 'suppression_article', 'fiche ' || f || ', retraits ' || n || ', chemin ' || coalesce(ch, '-'));
end $$;

-- ═══ C. Moteur de rapprochement : annonces Opla orphelines ══════════════════
create temp table _orph as select a.* from annonces_plateforme a
 where a.user_id = (select u from _x) and a.platform = 'opla' and a.inventaire_id is null and a.disparu_le is null and a.ignoree_le is null;
insert into _r select 'C0 XEWER : annonces Opla orphelines présentes (données de l''essai)', count(*) > 0, count(*) || ' orpheline(s)' from _orph;
do $$ declare a record; r jsonb; n_ok int := 0; n int := 0; f bigint; j uuid; n_f int := 0; n_j int := 0; begin
  for a in select * from _orph loop
    n := n + 1;
    r := public.rapprocher_importer(a.user_id, a.id, 'rapprochement');
    if r ->> 'reason' = 'opla_sortie' and coalesce((r ->> 'ok')::boolean, false) = false then n_ok := n_ok + 1; end if;
    f := public.rapprochement_v3_fiche_de(a.user_id, a.id, true); if f is null then n_f := n_f + 1; end if;
    j := public.rapprochement_attacher(a.id, (select id from inventaire where user_id = a.user_id and statut = 'stock' limit 1), 'essai'); if j is null then n_j := n_j + 1; end if;
  end loop;
  insert into _r values ('C1 rapprocher_importer refuse (opla_sortie)', n > 0 and n_ok = n, n_ok || ' / ' || n);
  insert into _r values ('C2 rapprochement_v3_fiche_de : jamais une fiche neuve', n_f = n, n_f || ' / ' || n);
  insert into _r values ('C3 rapprochement_attacher : jamais un job Opla neuf', n_j = n, n_j || ' / ' || n);
end $$;
insert into _r select 'C4 aucune fiche ni job Opla créés par le moteur', count(*) = 0, count(*) || ''
  from cross_post_jobs j where j.user_id = (select u from _x) and j.platform = 'opla' and j.id not in (select id from _avant_jobs);
do $$ declare r jsonb; a uuid; n int; begin
  perform set_config('request.jwt.claims', json_build_object('sub', (select u from _x)::text, 'role', 'authenticated')::text, true);
  select id into a from _orph limit 1;
  r := public.rapprochement_decider(a, 'import');
  insert into _r values ('C5 rapprochement_decider (la personne) : import refusé', r ->> 'reason' = 'opla_sortie', r::text);
  r := public.rapprochement_decider(a, 'attache', (select id from inventaire where user_id = (select u from _x) and statut = 'stock' limit 1));
  insert into _r values ('C6 rapprochement_decider (la personne) : rattachement refusé', r ->> 'reason' = 'opla_sortie', left(r::text, 120));
  select count(*) into n from public.annonces_en_rangement() x where x.platform = 'opla';
  insert into _r values ('C7 annonces_en_rangement : plus aucune annonce Opla', n = 0, n || '');
  perform set_config('request.jwt.claims', '', true);
end $$;
-- C8 Rejeu symétrique de la lecture du moteur : la seule différence = les annonces Opla orphelines.
do $$ declare u uuid; av jsonb; ap jsonb; n_av int; n_ap int; n_o int; n_comptes int := 0; n_bons int := 0; det text := ''; begin
  for u in select distinct a.user_id from annonces_plateforme a where a.platform = 'opla' and a.inventaire_id is null and a.disparu_le is null limit 6 loop
    av := public._avant_rapprochement_v3_lire(u) -> 'annonces'; ap := public.rapprochement_v3_lire(u) -> 'annonces';
    n_av := jsonb_array_length(coalesce(av, '[]')); n_ap := jsonb_array_length(coalesce(ap, '[]'));
    select count(*) into n_o from annonces_plateforme a where a.user_id = u and a.platform = 'opla' and a.inventaire_id is null and a.disparu_le is null
       and not (a.url is not null and annonce_lien_notification(a.url));
    n_comptes := n_comptes + 1;
    -- Toute annonce de la nouvelle lecture est dans l'ancienne, à l'identique ; l'écart = les orphelines Opla.
    if n_av - n_ap = n_o and not exists (select 1 from jsonb_array_elements(ap) e where not (av @> jsonb_build_array(e))) then n_bons := n_bons + 1;
    else det := det || u::text || ' ' || n_av || '→' || n_ap || ' (orphelines ' || n_o || ') ; '; end if;
  end loop;
  insert into _r values ('C8 rejeu de rapprochement_v3_lire : seules les orphelines Opla disparaissent', n_comptes > 0 and n_bons = n_comptes, n_bons || ' / ' || n_comptes || ' compte(s) ' || det);
end $$;
-- C9 Sans annonce Opla, la lecture est identique (comptes sans Opla ; chaque liste triée : jsonb_agg n'a pas d'ordre).
create function public._essai_lecture_triee(x jsonb) returns jsonb language sql immutable as $f$
  select coalesce(jsonb_object_agg(k, case when jsonb_typeof(v) = 'array'
           then (select coalesce(jsonb_agg(e order by e::text), '[]'::jsonb) from jsonb_array_elements(v) e) else v end), '{}'::jsonb)
    from jsonb_each(x) t(k, v)
$f$;
do $$ declare u uuid; n int := 0; n_id int := 0; begin
  for u in select distinct a.user_id from annonces_plateforme a where a.platform in ('leboncoin', 'beebs') and a.inventaire_id is null and a.disparu_le is null
            and not exists (select 1 from annonces_plateforme o where o.user_id = a.user_id and o.platform = 'opla') limit 5 loop
    n := n + 1;
    if public._essai_lecture_triee(public._avant_rapprochement_v3_lire(u)) = public._essai_lecture_triee(public.rapprochement_v3_lire(u)) then n_id := n_id + 1; end if;
  end loop;
  insert into _r values ('C9 comptes sans Opla : lecture du moteur identique', n > 0 and n_id = n, n_id || ' / ' || n);
end $$;

-- ═══ D. Rejeu symétrique : retraits armés (7 jours) et suppressions de fiches à copies mixtes ══════════════
create temp table _rejeu (cas text, depot uuid, platform text, avant text, apres text);
-- D1 Les dépôts des retraits armés par armer_retrait_job ces 7 derniers jours (toutes plateformes) : le retrait est
-- effacé dans la transaction, puis l'ANCIENNE et la NOUVELLE fonction sont jouées chacune dans un sous-bloc annulé.
do $$ declare d record; r_av text; r_ap text; v_prep text; begin
  for d in select distinct on (nullif(x.platform_fields #>> '{arme_par,depot}', '')::uuid) x.id retrait,
                  nullif(x.platform_fields #>> '{arme_par,depot}', '')::uuid depot, x.platform, x.platform_fields #>> '{arme_par,chemin}' chemin
             from cross_post_jobs x
            where x.action = 'delete' and x.created_at > now() - interval '7 days'
              and x.platform_fields #>> '{arme_par,pose_par}' like 'armer_retrait_job%'
              and nullif(x.platform_fields #>> '{arme_par,depot}', '') is not null
            order by nullif(x.platform_fields #>> '{arme_par,depot}', '')::uuid, x.created_at desc
            limit 150 loop
    r_av := null; r_ap := null; v_prep := null;
    begin
      delete from cross_post_jobs where id = d.retrait;
      update cross_post_jobs set status = 'published' where id = d.depot and status <> 'published';
      begin
        r_av := coalesce(public._avant_armer_retrait_job_pour(d.depot, d.chemin, null, false)::text, 'null');
        r_av := case when r_av = 'null' then 'null' else 'retrait:' || (select status from cross_post_jobs where id = r_av::uuid) end;
        raise exception 'annule';
      exception when raise_exception then null; when others then r_av := 'erreur:' || sqlerrm; end;
      begin
        r_ap := coalesce(public.armer_retrait_job_pour(d.depot, d.chemin, null, false)::text, 'null');
        r_ap := case when r_ap = 'null' then 'null' else 'retrait:' || (select status from cross_post_jobs where id = r_ap::uuid) end;
        raise exception 'annule';
      exception when raise_exception then null; when others then r_ap := 'erreur:' || sqlerrm; end;
      raise exception 'annule_cas';
    exception when raise_exception then null;
      when others then v_prep := sqlerrm;
    end;
    -- Écrit APRÈS le sous-bloc annulé (sinon la ligne partirait avec lui).
    if v_prep is not null then insert into _rejeu values ('D1_prep', d.depot, d.platform, 'erreur_preparation', v_prep);
    else insert into _rejeu values ('D1', d.depot, d.platform, r_av, r_ap); end if;
  end loop;
end $$;
insert into _r select 'D1 retraits des 7 jours rejoués (toutes plateformes)', count(*) > 0, count(*) || ' dépôt(s) : '
  || coalesce(string_agg(distinct platform || ' ' || avant || '→' || apres, ' | '), '') from _rejeu where cas = 'D1';
insert into _r select 'D1b préparations en erreur', count(*) = 0, count(*) || ' ' || coalesce(string_agg(apres, ' ; '), '') from _rejeu where cas = 'D1_prep';
insert into _r select 'D2 hors Opla : ancienne et nouvelle fonction rendent la même chose', count(*) = 0,
  count(*) || ' écart(s) ' || coalesce(string_agg(depot::text || ' ' || avant || '→' || apres, ' ; '), '')
  from _rejeu where cas = 'D1' and platform <> 'opla' and avant is distinct from apres;
insert into _r select 'D3 Opla : aucun retrait né (la nouvelle fonction rend NULL ; l''ancienne, sous la nouvelle garde, n''écrit rien non plus)', bool_and(apres = 'null'),
  count(*) || ' dépôt(s) Opla : ' || coalesce(string_agg(distinct avant || '→' || apres, ' | '), '')
  from _rejeu where cas = 'D1' and platform = 'opla';
-- D4 Suppression de fiches EN STOCK à copies mixtes (Opla + autre plateforme) : ancien filet / nouveau filet.
create temp table _d4_avant as select id from cross_post_jobs where action = 'delete' and created_at = now();
do $$ declare f record; av text; ap text; begin
  for f in select i.id, i.user_id from inventaire i
            where i.statut = 'stock' and i.fusionne_dans is null
              and exists (select 1 from cross_post_jobs o where o.inventaire_id = i.id and o.platform = 'opla' and o.status = 'published')
              and exists (select 1 from cross_post_jobs o where o.inventaire_id = i.id and o.platform <> 'opla' and o.status = 'published'
                             and o.action in ('publish', 'republish') and nullif(btrim(o.listing_url), '') is not null)
            order by i.created_at desc limit 25 loop
    begin
      execute (select definition from _defs_avant where nom = 'inventaire_arme_retraits_avant_suppression');
      delete from inventaire where id = f.id;
      select string_agg(platform || ':' || status, ',' order by platform) into av from cross_post_jobs
       where user_id = f.user_id and action = 'delete' and created_at = now() and platform_fields ? 'filet_suppression_serveur'
         and id not in (select id from _d4_avant);
      raise exception 'annule';
    exception when raise_exception then null; when others then av := 'erreur:' || sqlerrm; end;
    begin
      delete from inventaire where id = f.id;
      select string_agg(platform || ':' || status, ',' order by platform) into ap from cross_post_jobs
       where user_id = f.user_id and action = 'delete' and created_at = now() and platform_fields ? 'filet_suppression_serveur'
         and id not in (select id from _d4_avant);
      raise exception 'annule';
    exception when raise_exception then null; when others then ap := 'erreur:' || sqlerrm; end;
    insert into _rejeu values ('D4', null, f.id::text, coalesce(av, '-'), coalesce(ap, '-'));
  end loop;
end $$;
insert into _r select 'D4 suppressions rejouées (fiches à copies Opla + autre)', count(*) > 0, count(*) || ' fiche(s) : '
  || coalesce(string_agg(distinct avant || '→' || apres, ' | '), '') from _rejeu where cas = 'D4';
insert into _r select 'D5 suppression : les retraits hors Opla sont identiques, seul le retrait Opla disparaît', count(*) = 0,
  count(*) || ' écart(s) ' || coalesce(string_agg(platform || ' ' || avant || '→' || apres, ' ; '), '')
  from _rejeu where cas = 'D4'
   and regexp_replace(regexp_replace(avant, '(^|,)opla:[a-z]+', '', 'g'), '^,', '') is distinct from apres
   and not (avant = 'opla:cancelled' and apres = '-');

select essai, ok, left(detail, 400) detail from _r order by essai;
rollback;
