CREATE OR REPLACE FUNCTION public.cross_post_jobs_publie_sur_article_vendu()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_vendu boolean;
begin
  if coalesce(current_setting('fillsell.sans_retrait', true), '') = '1' then
    return new;
  end if;
  begin
    v_vendu := public.article_vendu(new.inventaire_id);
    if not v_vendu then
      select exists (
        select 1 from public.cross_post_jobs s
          join public.inventaire i on i.id = s.inventaire_id
         where s.inventaire_id = new.inventaire_id and s.id <> new.id
           and s.status = 'published'
           and coalesce(s.action, 'publish') in ('publish', 'republish')
           and (s.platform_fields ->> 'sale_signal') = 'sold'
           and coalesce(i.quantite, 1) <= 1
           and i.fusionne_dans is null)
        into v_vendu;
    end if;
    if v_vendu then
      if public.armer_retrait_job(new.id, 'publie_apres_vente_serveur', interval '0') is not null then
        insert into public.usage_logs (user_id, feature, metadata)
        values (new.user_id, 'retrait_annonces', jsonb_build_object(
          'chemin', 'publie_apres_vente_serveur', 'plateformes', jsonb_build_array(new.platform),
          'n_annonces', 1, 'n_articles', 1, 'article_id', new.inventaire_id::text, 'job_publie', new.id));
      end if;
    end if;
  exception when others then
    raise warning 'cross_post_jobs_publie_sur_article_vendu (job %) : %', new.id, sqlerrm;
  end;
  return new;
end;
$function$
