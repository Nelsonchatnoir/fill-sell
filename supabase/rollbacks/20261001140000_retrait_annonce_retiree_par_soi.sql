-- Retour arrière de 20261001140000.
SET lock_timeout = '3s';
DROP TRIGGER IF EXISTS cross_post_jobs_declaration_retiree_ferme_retraits ON public.cross_post_jobs;
DROP FUNCTION IF EXISTS public.retraits_clos_par_declaration_retiree();

CREATE OR REPLACE FUNCTION public.retrait_garde_vendue_et_doublon()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_item   text;
  v_url    text;
  v_ident  text;
  v_autre  uuid;
begin
  if new.action is distinct from 'delete' or new.status is distinct from 'pending' then
    return new;
  end if;

  -- Jamais un point de panne : sur une erreur imprévue, le retrait est créé
  -- COMME AVANT (les gardes de service de get-pending-jobs restent derrière),
  -- et la cause part en WARNING.
  begin

  if new.platform = 'vinted' then
    v_item := coalesce(
      case when new.platform_listing_id ~ '^\d+$' then new.platform_listing_id end,
      substring(new.listing_url from '/items/(\d+)'));
    v_ident := case when v_item is not null then 'vinted:' || v_item end;
  elsif nullif(btrim(new.platform_listing_id), '') is not null then
    v_ident := new.platform || ':' || btrim(new.platform_listing_id);
  elsif nullif(btrim(new.listing_url), '') is not null then
    v_url := regexp_replace(split_part(split_part(btrim(new.listing_url), '?', 1), '#', 1), '/$', '');
    v_ident := new.platform || ':' || v_url;
  end if;

  -- Annonce vendue : rien à retirer, aucune requête ne partira.
  if v_item is not null and public.vinted_annonce_vendue(new.user_id, v_item) then
    new.status := 'cancelled';
    new.error := 'Retrait inutile : cette annonce est vendue sur Vinted, elle n''est plus en vente. Aucune requête envoyée.';
    new.platform_fields := coalesce(new.platform_fields, '{}'::jsonb) || jsonb_build_object(
      'retrait_par', 'vendue_sur_la_plateforme',
      'retrait_non_envoye', jsonb_build_object('le', now(), 'motif', 'annonce_vendue', 'item', v_item,
        'pose_par', 'retrait_garde_vendue_et_doublon (création)'));
    return new;
  end if;

  -- Un seul retrait ouvert par annonce.
  if v_ident is not null then
    perform pg_advisory_xact_lock(hashtextextended(new.user_id::text || '|' || v_ident, 0));
    select j.id into v_autre
    from public.cross_post_jobs j
    where j.user_id = new.user_id and j.platform = new.platform and j.action = 'delete'
      and j.status in ('pending', 'processing', 'needs_user')
      and j.id <> new.id
      and case
            when new.platform = 'vinted' then
              coalesce(case when j.platform_listing_id ~ '^\d+$' then j.platform_listing_id end,
                       substring(j.listing_url from '/items/(\d+)')) = v_item
            when nullif(btrim(new.platform_listing_id), '') is not null then
              btrim(j.platform_listing_id) = btrim(new.platform_listing_id)
            else
              regexp_replace(split_part(split_part(btrim(j.listing_url), '?', 1), '#', 1), '/$', '') = v_url
          end
    order by j.created_at
    limit 1;
    if v_autre is not null then
      new.status := 'cancelled';
      new.error := 'Doublon : un retrait est déjà en cours pour cette annonce.';
      new.platform_fields := coalesce(new.platform_fields, '{}'::jsonb) || jsonb_build_object(
        'retrait_doublon_de', jsonb_build_object('job', v_autre, 'le', now(), 'annonce', v_ident,
          'pose_par', 'retrait_garde_vendue_et_doublon (création)'));
    end if;
  end if;

  exception when others then
    raise warning 'retrait_garde_vendue_et_doublon (job %) : % — retrait créé comme avant', new.id, sqlerrm;
  end;
  return new;
end;
$function$;

DROP FUNCTION IF EXISTS public.retrait_meme_annonce(text, text, text, text, text);
