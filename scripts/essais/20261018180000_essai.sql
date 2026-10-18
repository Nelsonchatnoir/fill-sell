-- Essai à blanc de 20261018180000 (18/10) : tout est annulé (ROLLBACK). Lancer : npx supabase db query --linked -f scripts/essais/20261018180000_essai.sql
-- Prouve la règle sur le retrait réel 81188384-85a2-455e-a11a-99e3608419c8 (Depop, compte a3002ab6) et son dépôt 1661efb0 :
--   T1-T2  avant : le lien du retrait n'est pas lu ; après : il rend le slug ;
--   T3-T4  sur tout Depop : aucune lecture existante ne change, seules les lectures refusées sont gagnées ;
--   T5-T8  armer_retrait_job_pour sur le dépôt (le retrait en file est mis de côté DANS la transaction) :
--          le nouveau retrait porte le slug (déclencheur retrait_identifiant_depuis_lien) et depop_product_id.
-- Aucun mail, aucune notification : tout est dans la transaction annulée (pg_net et NOTIFY sont transactionnels).
begin;
set local statement_timeout = '60s';
set local lock_timeout = '5s';
create temp table _r (essai text, ok boolean, detail text);

create temp table _avant as
  select id, public.identifiant_annonce_depuis_lien(platform, listing_url) as a, public.annonce_id_depuis_url(platform, listing_url) as b
    from public.cross_post_jobs where platform = 'depop';
insert into _r select 'T1 avant : le lien du retrait réel n''est pas lu', a is null and b is null, coalesce(a, '∅') || ' / ' || coalesce(b, '∅')
  from _avant where id = '81188384-85a2-455e-a11a-99e3608419c8';

-- ── La migration, telle quelle ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.annonce_id_depuis_url(p_platform text, p_url text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT CASE lower(COALESCE(p_platform, ''))
    WHEN 'leboncoin' THEN substring(COALESCE(p_url, '') from '/(\d{6,})(?:[/?#]|$)')
    WHEN 'beebs'     THEN substring(COALESCE(p_url, '') from '/p/(\d+)(?:[-/?#]|$)')
    WHEN 'opla'      THEN substring(COALESCE(p_url, '') from '(art_[A-Za-z0-9_-]+)')
    WHEN 'depop'     THEN substring(COALESCE(p_url, '') from '/products/([A-Za-z0-9_]+-[A-Za-z0-9-]*[A-Za-z0-9])')  -- (18/10) « _ » admis : pseudo du vendeur (thard_733-…)
    WHEN 'ebay'      THEN substring(COALESCE(p_url, '') from '/itm/(?:[^/?#]*/)?(\d{9,})')
    ELSE NULL END
$function$;

CREATE OR REPLACE FUNCTION public.identifiant_annonce_depuis_lien(p_platform text, p_url text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT CASE p_platform
    WHEN 'vinted'    THEN substring(p_url from '/items/([0-9]+)')
    WHEN 'beebs'     THEN substring(p_url from '/p/([0-9]+)(?:[-/?#]|$)')
    WHEN 'ebay'      THEN substring(p_url from '/itm/(?:[^/?#]*/)?([0-9]{9,})')
    WHEN 'leboncoin' THEN substring(p_url from '/([0-9]{6,})(?:\.htm)?(?:[/?#]|$)')
    WHEN 'opla'      THEN substring(p_url from '(art_[A-Za-z0-9_-]+)')
    WHEN 'depop'     THEN substring(p_url from '/products/([A-Za-z0-9_]+-[A-Za-z0-9-]*[A-Za-z0-9])')  -- (18/10) « _ » admis : pseudo du vendeur (thard_733-…)
  END;
$function$;

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
  ) then
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

-- ── Contrôles ───────────────────────────────────────────────────────────────
insert into _r select 'T2 après : le lien du retrait rend le slug (deux fonctions)',
  public.identifiant_annonce_depuis_lien(platform, listing_url) = 'thard_733-jean-bonobo-taille-40-coupe-aceb' and public.annonce_id_depuis_url(platform, listing_url) = 'thard_733-jean-bonobo-taille-40-coupe-aceb',
  coalesce(public.identifiant_annonce_depuis_lien(platform, listing_url), '∅')
  from public.cross_post_jobs where id = '81188384-85a2-455e-a11a-99e3608419c8';
insert into _r select 'T3 aucune lecture Depop existante ne change',
  count(*) = 0, count(*)::text || ' lecture(s) changée(s)'
  from _avant v join public.cross_post_jobs j on j.id = v.id
 where (v.a is not null and v.a is distinct from public.identifiant_annonce_depuis_lien(j.platform, j.listing_url))
    or (v.b is not null and v.b is distinct from public.annonce_id_depuis_url(j.platform, j.listing_url));
insert into _r select 'T4 lectures gagnées (71 attendues le 18/10), aucune contredit un identifiant posé',
  count(*) > 0 and count(*) filter (where nullif(btrim(j.platform_listing_id), '') is not null
                                     and btrim(j.platform_listing_id) <> public.identifiant_annonce_depuis_lien(j.platform, j.listing_url)) = 0,
  count(*)::text || ' gagnée(s)'
  from _avant v join public.cross_post_jobs j on j.id = v.id
 where v.a is null and public.identifiant_annonce_depuis_lien(j.platform, j.listing_url) is not null;

-- Le retrait en file est mis de côté (dans la transaction) pour que le dépôt puisse être ré-armé.
update public.cross_post_jobs set status = 'cancelled' where id = '81188384-85a2-455e-a11a-99e3608419c8' and status in ('pending', 'processing', 'needs_user');
create temp table _arme as select public.armer_retrait_job_pour('1661efb0-f893-4056-903e-f8a64e6bae78'::uuid, 'essai_20261018180000', null, false) as id;
insert into _r select 'T5 armer_retrait_job_pour ré-arme le retrait du dépôt', a.id is not null, coalesce(a.id::text, 'null (une garde a refusé)') from _arme a;
insert into _r select 'T6 le nouveau retrait porte le slug (déclencheur BEFORE INSERT)',
  j.platform_listing_id = 'thard_733-jean-bonobo-taille-40-coupe-aceb', coalesce(j.platform_listing_id, '∅')
  from _arme a join public.cross_post_jobs j on j.id = a.id;
insert into _r select 'T7 le nouveau retrait porte depop_product_id du dépôt',
  (j.platform_fields ->> 'depop_product_id') = (d.platform_fields ->> 'depop_product_id'), coalesce(j.platform_fields ->> 'depop_product_id', '∅')
  from _arme a join public.cross_post_jobs j on j.id = a.id join public.cross_post_jobs d on d.id = '1661efb0-f893-4056-903e-f8a64e6bae78';
insert into _r select 'T8 le nouveau retrait garde le lien du dépôt, rien d''autre de copié',
  j.listing_url = d.listing_url and j.action = 'delete' and j.status in ('pending', 'needs_user'),
  j.status || ' ' || coalesce(j.listing_url, '∅')
  from _arme a join public.cross_post_jobs j on j.id = a.id join public.cross_post_jobs d on d.id = '1661efb0-f893-4056-903e-f8a64e6bae78';
select * from _r;
rollback;
