-- Corps de PROD relu le 19/11/2026 (pg_get_functiondef armer_retraits_copies(bigint,text,uuid,text,interval), md5 e69108472d6e0db3664cd412e6ef73ae), commentaires retirés pour le banc.
CREATE OR REPLACE FUNCTION public.armer_retraits_copies(p_inventaire_id bigint, p_chemin text, p_sauf_job uuid DEFAULT NULL::uuid, p_sauf_plateforme text DEFAULT NULL::text, p_delai interval DEFAULT '00:00:00'::interval)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_inv   public.inventaire%rowtype;
  v_pub   record;
  v_del   uuid;
  v_n     integer := 0;
  v_pl    text[] := '{}';
  v_url   text;
  v_pf    jsonb;
  v_q     integer := 0;
begin
  select * into v_inv from public.inventaire where id = p_inventaire_id;
  if not found or v_inv.fusionne_dans is not null then
    return jsonb_build_object('armes', 0);
  end if;
  for v_pub in
    select x.id, x.platform from (
      (select distinct on (j.platform) j.id, j.platform
         from public.cross_post_jobs j
        where j.user_id = v_inv.user_id and j.inventaire_id = p_inventaire_id
          and coalesce(j.action, 'publish') in ('publish', 'republish')
          and j.status = 'published'
          and (p_sauf_job is null or j.id <> p_sauf_job)
          and (p_sauf_plateforme is null or j.platform <> p_sauf_plateforme)
          and public.retrait_job_prouve(j.id)
          and public.rattachement_confirme(j.id)
          and public.fiche_annonces_vivantes(p_inventaire_id, j.platform) < 2
        order by j.platform, coalesce(j.published_at, j.created_at) desc, j.created_at desc)
    ) x
  loop
    v_del := public.armer_retrait_job(v_pub.id, p_chemin, p_delai);
    if v_del is not null then
      v_n := v_n + 1;
      v_pl := v_pl || v_pub.platform;
    end if;
  end loop;
  for v_pub in
    select j.id, j.title, j.listing_url, btrim(j.platform_listing_id) as pl
      from public.cross_post_jobs j
     where j.user_id = v_inv.user_id and j.inventaire_id = p_inventaire_id
       and j.platform = 'beebs' and coalesce(j.action, 'publish') = 'publish'
       and j.status = 'failed'
       and coalesce(j.platform_fields, '{}'::jsonb) ? 'depot_jamais_en_ligne'
       and btrim(coalesce(j.platform_listing_id, '')) ~ '^[0-9]+$'
       and (j.platform_fields #>> '{preuve_identifiant_beebs,methode}') is not null
       and public.rattachement_confirme(j.id)
       and (p_sauf_job is null or j.id <> p_sauf_job)
       and (p_sauf_plateforme is null or p_sauf_plateforme <> 'beebs')
       and v_inv.statut = 'vendu'
       and exists (
         select 1 from public.ventes v
          where v.user_id = j.user_id and v.inventaire_id = j.inventaire_id
            and lower(coalesce(v.statut, '')) not in ('annule', 'annulée', 'cancelled', 'canceled')
            and lower(coalesce(nullif(v.plateforme_code, ''), nullif(v.plateforme, ''), '')) not in ('', 'beebs'))
       and not exists (
         select 1 from public.cross_post_jobs p
          where p.user_id = j.user_id and p.inventaire_id = j.inventaire_id and p.platform = 'beebs'
            and coalesce(p.action, 'publish') in ('publish', 'republish') and p.status = 'published')
       and not exists (
         select 1 from public.cross_post_jobs d
          where d.user_id = j.user_id and d.inventaire_id = j.inventaire_id and d.platform = 'beebs' and d.action = 'delete'
            and btrim(coalesce(d.platform_listing_id, '')) = btrim(j.platform_listing_id)
            and (d.status in ('pending', 'processing', 'needs_user') or d.created_at >= j.created_at))
  loop
    insert into public.cross_post_jobs
      (user_id, inventaire_id, platform, action, status, photo_option, title, listing_url, platform_listing_id, platform_fields)
    values
      (v_inv.user_id, p_inventaire_id, 'beebs', 'delete', 'pending', 'original', v_pub.title,
       coalesce(nullif(btrim(coalesce(v_pub.listing_url, '')), ''), 'https://www.beebs.app/fr/p/' || v_pub.pl), v_pub.pl,
       jsonb_build_object('arme_par', jsonb_build_object(
         'chemin', p_chemin, 'le', now(), 'depot', v_pub.id,
         'pose_par', 'armer_retraits_copies (dépôt Beebs « jamais en ligne », numéro du dépôt)')));
    v_n := v_n + 1;
    v_pl := v_pl || 'beebs'::text;
  end loop;
  if v_n > 0 then
    insert into public.usage_logs (user_id, feature, metadata)
    values (v_inv.user_id, 'retrait_annonces', jsonb_build_object(
      'chemin', p_chemin,
      'plateformes', (select coalesce(jsonb_agg(p order by p), '[]'::jsonb) from unnest(v_pl) as p),
      'n_annonces', v_n,
      'n_articles', 1,
      'article_id', v_inv.id::text));
  end if;
  begin
    v_q := public.poser_questions_copies_non_prouvees(p_inventaire_id, p_sauf_job, p_sauf_plateforme, 'vente:' || coalesce(p_chemin, ''));
  exception when others then
    raise warning 'armer_retraits_copies (article %) : question copie non posée : %', p_inventaire_id, sqlerrm;
    v_q := 0;
  end;
  return jsonb_build_object('armes', v_n, 'plateformes', to_jsonb(v_pl), 'questions', v_q);
end;
$function$
;
