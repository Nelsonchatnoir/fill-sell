-- INVERSE de 20261029201000_beebs_rearmer_retrait_vente_sans_fiche (29/10, lot B 4.9 B).
-- Rend retraits_beebs_rearmer_revus tel que LU EN PROD le 29/10 (pg_get_functiondef, md5
-- 0756d52c09e79dedc45a66971a8ebf2c — relu à la fin). Les retraits réarmés entre-temps restent ce qu'ils sont (pending,
-- rearme_revu_en_ligne) : un retrait d'une annonce vue en ligne après la vente.
-- ⛔ À jouer seulement sur ordre de Nico : npx supabase db query --linked -f <ce fichier>.

BEGIN;

CREATE OR REPLACE FUNCTION public.retraits_beebs_rearmer_revus(p_user uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare d record; n integer := 0;
begin
  for d in
    select j.id, j.platform_fields as pf, a.id as annonce, a.vu_le, a.run_id
      from public.cross_post_jobs j
      join public.annonces_plateforme a
        on a.user_id = j.user_id and a.platform = 'beebs' and a.listing_id = btrim(j.platform_listing_id)
       and a.statut_plateforme = 'en_ligne' and a.disparu_le is null
     where j.user_id = p_user and j.platform = 'beebs' and j.action = 'delete' and j.status = 'deleted'
       and btrim(coalesce(j.platform_listing_id, '')) ~ '^\d+$'
       and j.platform_fields #>> '{arme_par,chemin}' in ('vente_article_serveur', 'vente_copie_prouvee')
       and coalesce((j.platform_fields -> 'delete_trace')::text, '') !~* 'confirmation (envoy|re[cç]u)'
       and coalesce((j.platform_fields #>> '{rearme_revu_en_ligne,n}')::int, 0) < 3
       and a.vu_le > greatest(j.created_at,
                              coalesce(public._ts_ou_null(j.platform_fields ->> 'processing_since'), '-infinity'::timestamptz),
                              coalesce(public._ts_ou_null(j.platform_fields #>> '{delete_preuve,lu_le}'), '-infinity'::timestamptz),
                              coalesce(public._ts_ou_null(j.platform_fields #>> '{rearme_revu_en_ligne,le}'), '-infinity'::timestamptz))
                     + interval '10 minutes'
       and not exists (select 1 from public.cross_post_jobs o
                        where o.user_id = j.user_id and o.platform = 'beebs' and o.action = 'delete'
                          and o.status in ('pending', 'processing', 'needs_user')
                          and btrim(coalesce(o.platform_listing_id, '')) = btrim(j.platform_listing_id))
       and exists (select 1 from public.cross_post_jobs dep
                     join public.inventaire i on i.id = dep.inventaire_id and i.user_id = dep.user_id
                    where (j.platform_fields #>> '{arme_par,depot}') ~ '^[0-9a-fA-F-]{36}$'
                      and dep.id = (j.platform_fields #>> '{arme_par,depot}')::uuid
                      and i.statut = 'vendu')
     limit 20
  loop
    update public.cross_post_jobs set
           status = 'pending',
           error = 'Revue en ligne sur Beebs après la clôture de son retrait : l''article est vendu, FillSell la retire.',
           platform_fields = (platform_fields - array['processing_since', 'next_action_after', 'delete_confirmed_by',
                                                      'delete_preuve', 'beebs_en_moderation'])
             || jsonb_build_object('rearme_revu_en_ligne', jsonb_build_object('le', now(), 'vu_le', d.vu_le,
                  'releve', d.run_id, 'n', coalesce((d.pf #>> '{rearme_revu_en_ligne,n}')::int, 0) + 1,
                  'trace_precedente', d.pf -> 'delete_trace'))
     where id = d.id and status = 'deleted';
    if found then
      update public.annonces_plateforme set retiree_le = null, retrait_job_id = null, updated_at = now()
       where id = d.annonce and retrait_job_id = d.id;
      n := n + 1;
    end if;
  end loop;
  return n;
end $function$
;

DO $relu$
BEGIN
  IF md5(pg_get_functiondef('public.retraits_beebs_rearmer_revus(uuid)'::regprocedure)) <> '0756d52c09e79dedc45a66971a8ebf2c' THEN
    RAISE EXCEPTION 'inverse 20261029201000 : retraits_beebs_rearmer_revus n''est pas revenue à la définition lue en prod le 29/10';
  END IF;
END
$relu$;

COMMIT;
