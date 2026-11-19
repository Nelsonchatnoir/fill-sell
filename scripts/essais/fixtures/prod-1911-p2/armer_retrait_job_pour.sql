-- Corps de PROD relu le 19/11/2026 (pg_get_functiondef armer_retrait_job_pour(uuid,text,interval,boolean), md5 6ae927733a30ed5f88c2d649f5ec0c5e), commentaires retirés pour le banc.
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

  if not exists (
    select 1 from public.ventes v
    join public.inventaire i on i.id = v.inventaire_id and i.user_id = v.user_id
    where v.user_id = j.user_id and v.inventaire_id = j.inventaire_id
      and i.statut = 'vendu'
      and lower(coalesce(v.statut, '')) not in ('annule', 'annulée', 'cancelled', 'canceled')
      and coalesce(nullif(v.plateforme_code, ''), nullif(v.plateforme, '')) is not null
      and lower(coalesce(nullif(i.plateforme, ''), nullif(v.plateforme_code, ''), v.plateforme)) <> lower(j.platform)
    limit 1
  ) and not public.vente_prouvee_fiche_liee(j.inventaire_id, j.platform) then
    if not coalesce(p_preuve_geste, false) or not exists (
      select 1 from public.inventaire i
       where i.id = j.inventaire_id and i.user_id = j.user_id and i.statut = 'vendu'
         and lower(coalesce(nullif(i.plateforme, ''), '')) <> lower(j.platform)
    ) then
      return null;
    end if;
  end if;
  if not public.retrait_job_prouve(j.id) then
    return null;
  end if;
  if not coalesce(p_preuve_geste, false) and not public.rattachement_confirme(j.id) then
    insert into public.usage_logs (user_id, feature, metadata)
    values (j.user_id, 'retrait_refuse_rattachement_automatique', jsonb_build_object(
      'chemin', p_chemin, 'job', j.id, 'platform', j.platform, 'article_id', j.inventaire_id::text,
      'rattachement', j.platform_fields -> 'rattachement'));
    return null;
  end if;
  if public.annonce_importee(j.id) and not public.vente_apres_mise_en_ligne(j.id) then
    insert into public.usage_logs (user_id, feature, metadata)
    values (j.user_id, 'retrait_refuse_vente_avant_mise_en_ligne', jsonb_build_object(
      'chemin', p_chemin, 'job', j.id, 'platform', j.platform, 'article_id', j.inventaire_id::text,
      'mise_en_ligne', public.annonce_mise_en_ligne(j.id)));
    return null;
  end if;
  if public.fiche_annonces_vivantes(j.inventaire_id, j.platform) >= 2 and not coalesce(p_preuve_geste, false) then
    return null;
  end if;
  if coalesce(j.platform_fields ->> 'sale_signal', '') = 'sold' then
    return null;
  end if;
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
    v_pf := v_pf || jsonb_build_object('preuve', 'geste_deja_vendu');
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
$function$
;
