set statement_timeout = '4s';
set lock_timeout = '1s';
CREATE OR REPLACE FUNCTION public.armer_retrait_job(p_job_id uuid, p_chemin text, p_delai interval DEFAULT '00:00:00'::interval)
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
  select * into j from public.cross_post_jobs where id = p_job_id;
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
    return null;
  end if;
  -- (27/09 soir) UN TITRE N'EST JAMAIS UNE PREUVE : l'annonce doit être liée à
  -- SA fiche par une preuve, et la fiche ne doit pas porter deux annonces
  -- vivantes sur cette plateforme (deux annonces = deux exemplaires).
  if not public.retrait_job_prouve(j.id) then
    return null;
  end if;
  if public.fiche_annonces_vivantes(j.inventaire_id, j.platform) >= 2 then
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
       and d.status in ('pending', 'processing', 'needs_user')
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
$function$
;
