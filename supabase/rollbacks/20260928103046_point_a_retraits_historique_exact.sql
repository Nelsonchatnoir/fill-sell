-- Point A : une redirection suit le dépôt exact, aucune vente rapprochée par titre.
-- GO Nico du 28/09. Idempotent ; aucune réécriture de données historiques.
SET LOCAL statement_timeout='5s';
SET LOCAL lock_timeout='1s';
CREATE OR REPLACE FUNCTION public.retrait_cible_vivante(p_user uuid, p_inv bigint, p_platform text, p_url text, p_pid text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_pf       text := lower(coalesce(p_platform, ''));
  v_nom      text;
  v_cible    text;
  v_rempl    record;
  v_encours  record;
  v_ids      text[];
  v_vers     text;
  v_sans_lien integer;
  intacte    constant jsonb := jsonb_build_object('verdict', 'intacte');
begin
  if v_pf not in ('vinted', 'leboncoin', 'beebs', 'opla') or p_inv is null or p_user is null then
    return intacte;
  end if;
  v_nom := case v_pf when 'vinted' then 'Vinted' when 'leboncoin' then 'Leboncoin' when 'beebs' then 'Beebs' else 'Opla' end;
  v_cible := coalesce(public.annonce_id_job(v_pf, p_url), nullif(btrim(p_pid), ''));
  -- Un identifiant de moins de 4 caractères ne désigne rien (règle de listing_designe).
  if v_cible is null or length(v_cible) < 4 then return intacte; end if;

  -- a) La cible est VIVANTE (un job publié la porte) : rien ne change.
  if exists (
    select 1 from public.cross_post_jobs j
     where j.user_id = p_user and j.platform = v_pf and j.status = 'published'
       and coalesce(j.action, 'publish') in ('publish', 'republish')
       and (public.annonce_id_job(v_pf, j.listing_url) = v_cible
            or nullif(btrim(j.platform_listing_id), '') = v_cible)) then
    return intacte;
  end if;

  -- b) Une republication de CET article l'a-t-elle remplacée ?
  select r.id, r.status, r.platform_fields ->> 'republish_step' as etape
    into v_rempl
    from public.cross_post_jobs r
   where r.user_id = p_user and r.inventaire_id = p_inv and r.platform = v_pf and r.action = 'republish'
     and v_cible in (
           nullif(btrim(r.platform_fields ->> 'old_platform_listing_id'), ''),
           public.annonce_id_job(v_pf, r.platform_fields ->> 'old_listing_url'),
           public.annonce_id_job(v_pf, r.platform_fields -> 'republish_snapshot' ->> 'listing_url'),
           case when v_pf = 'vinted' then nullif(btrim(r.platform_fields ->> 'vinted_item_id_avant'), '') end,
           case when v_pf = 'vinted' then nullif(btrim(r.platform_fields ->> 'vinted_item_id'), '') end)
     and (r.platform_fields ->> 'republish_step' = 'recreated'
          or coalesce(case when v_pf = 'vinted' then nullif(btrim(r.platform_fields ->> 'new_vinted_item_id'), '') end,
                      nullif(btrim(r.platform_listing_id), ''),
                      public.annonce_id_job(v_pf, r.listing_url)) is distinct from v_cible)
   order by r.created_at desc
   limit 1;

  if v_rempl.id is null then
    -- b') …ou est-elle en train de le faire ? Étape 'deleted' : l'ancienne
    --     annonce n'existe déjà plus, la nouvelle n'existe pas encore.
    select r.id into v_encours
      from public.cross_post_jobs r
     where r.user_id = p_user and r.inventaire_id = p_inv and r.platform = v_pf and r.action = 'republish'
       and r.status in ('pending', 'processing', 'needs_user')
       and r.platform_fields ->> 'republish_step' = 'deleted'
       and v_cible in (
             nullif(btrim(r.platform_fields ->> 'old_platform_listing_id'), ''),
             public.annonce_id_job(v_pf, r.platform_fields ->> 'old_listing_url'),
             public.annonce_id_job(v_pf, r.platform_fields -> 'republish_snapshot' ->> 'listing_url'),
             public.annonce_id_job(v_pf, r.listing_url),
             case when v_pf = 'vinted' then nullif(btrim(r.platform_fields ->> 'vinted_item_id_avant'), '') end,
             case when v_pf = 'vinted' then nullif(btrim(r.platform_fields ->> 'vinted_item_id'), '') end)
     order by r.created_at desc
     limit 1;
    if v_encours.id is null then
      return intacte;                     -- pas une annonce remplacée : comportement d'avant
    end if;
    return jsonb_build_object('verdict', 'attente', 'raison', 'republication_en_cours', 'cible', v_cible,
      'republication', v_encours.id,
      'motif', format('Retrait en attente : cette annonce %s est en cours de republication (l''ancienne est déjà retirée, la nouvelle pas encore en ligne). Le retrait visera la nouvelle annonce dès qu''elle existera — rien n''est retiré à l''aveugle.', v_nom));
  end if;

  -- c) L'annonce vivante de l'article sur la plateforme : UNE seule, avec lien.
  select coalesce(array_agg(distinct x.id_annonce) filter (where x.id_annonce is not null), '{}'),
         count(*) filter (where x.id_annonce is null)
    into v_ids, v_sans_lien
    from (select coalesce(public.annonce_id_job(v_pf, j.listing_url), nullif(btrim(j.platform_listing_id), '')) as id_annonce
            from public.cross_post_jobs j
           where j.user_id = p_user and j.inventaire_id = p_inv and j.platform = v_pf and j.status = 'published'
             and coalesce(j.action, 'publish') in ('publish', 'republish')) x
   where x.id_annonce is distinct from v_cible;

  if coalesce(array_length(v_ids, 1), 0) = 0 and v_sans_lien = 0 then
    -- Rien de vivant pour cet article ici : l'ancienne est déjà hors ligne,
    -- la retirer ne peut rien abîmer. Comportement d'avant.
    return intacte;
  end if;
  if coalesce(array_length(v_ids, 1), 0) = 1 and v_sans_lien = 0 then
    select j.listing_url into v_vers
      from public.cross_post_jobs j
     where j.user_id = p_user and j.inventaire_id = p_inv and j.platform = v_pf and j.status = 'published'
       and coalesce(j.action, 'publish') in ('publish', 'republish')
       and coalesce(public.annonce_id_job(v_pf, j.listing_url), nullif(btrim(j.platform_listing_id), '')) = v_ids[1]
       and nullif(btrim(j.listing_url), '') is not null
     order by coalesce(j.published_at, j.created_at) desc
     limit 1;
    if v_vers is not null then
      return jsonb_build_object('verdict', 'redirigee', 'cible', v_cible, 'vers', v_vers,
                                'vers_id', v_ids[1], 'republication', v_rempl.id);
    end if;
  end if;
  return jsonb_build_object('verdict', 'attente', 'cible', v_cible, 'republication', v_rempl.id,
    'raison', case when coalesce(array_length(v_ids, 1), 0) = 0 then 'lien_inconnu' else 'plusieurs_vivantes' end,
    'motif', case when coalesce(array_length(v_ids, 1), 0) = 0
      then format('Retrait en attente : cette annonce %s a été remplacée par une republication dont le lien n''est pas encore connu. Le retrait visera la nouvelle annonce dès que son lien sera repéré — rien n''est retiré à l''aveugle.', v_nom)
      else format('Retrait en attente : cette annonce %s a été remplacée par une republication, et plusieurs annonces de cet article sont en ligne sur %s. Rien n''est retiré à l''aveugle : retire la bonne depuis la fiche de l''article.', v_nom, v_nom) end);
end;
$function$;

CREATE OR REPLACE FUNCTION public.ventes_garde_annonce_de_la_vente()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_brut text;
  v_pf   text;
  v_inv  bigint;
  v_nb   integer;
begin
  begin
    v_brut := lower(coalesce(nullif(btrim(new.plateforme_code), ''), new.plateforme, ''));
    v_pf := case
      when v_brut like '%vinted%' then 'vinted'
      when v_brut like '%leboncoin%' or v_brut in ('lbc', 'le bon coin') then 'leboncoin'
      when v_brut like '%beebs%' then 'beebs'
      when v_brut like '%ebay%' then 'ebay'
      when v_brut like '%opla%' then 'opla'
      else null end;
    if v_pf is null then
      return new;
    end if;
    v_inv := new.inventaire_id;
    if v_inv is null and nullif(btrim(coalesce(new.titre, '')), '') is not null then
      select count(distinct d.inventaire_id), min(d.inventaire_id) into v_nb, v_inv
        from public.cross_post_jobs d
        join public.inventaire i on i.id = d.inventaire_id
       where d.user_id = new.user_id and d.action = 'delete' and d.status = 'pending'
         and d.platform_fields -> 'arme_par' ->> 'chemin' = 'vente_article_serveur'
         and d.created_at > now() - interval '15 minutes'
         and lower(btrim(i.titre)) = lower(btrim(new.titre));
      if coalesce(v_nb, 0) <> 1 then
        return new;
      end if;
    end if;
    if v_inv is null then
      return new;
    end if;
    update public.cross_post_jobs d
       set status = 'cancelled',
           error = 'Retrait inutile : l''article a été vendu sur cette plateforme — l''annonce vendue n''est pas touchée.',
           platform_fields = coalesce(d.platform_fields, '{}'::jsonb) || jsonb_build_object(
             'retrait_non_envoye', jsonb_build_object('le', now(), 'motif', 'plateforme_de_la_vente',
               'vente', new.id, 'pose_par', 'ventes_garde_annonce_de_la_vente'))
     where d.user_id = new.user_id and d.inventaire_id = v_inv
       and d.platform = v_pf and d.action = 'delete' and d.status = 'pending'
       and d.platform_fields -> 'arme_par' ->> 'chemin' = 'vente_article_serveur'
       and d.created_at > now() - interval '15 minutes';
  exception when others then
    raise warning 'ventes_garde_annonce_de_la_vente (vente %) : %', new.id, sqlerrm;
  end;
  return new;
end;
$function$;
