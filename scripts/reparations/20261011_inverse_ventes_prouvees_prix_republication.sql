-- INVERSE de la migration 20261011170000 : la définition de ventes_prouvees_a_enregistrer
-- telle qu'en prod le 11/10/2026 (pg_get_functiondef), prix = detected_price puis price.
CREATE OR REPLACE FUNCTION public.ventes_prouvees_a_enregistrer(p_depuis timestamp with time zone, p_limite integer DEFAULT 25, p_user uuid DEFAULT NULL::uuid, p_job uuid DEFAULT NULL::uuid, p_ignorer_refus boolean DEFAULT false)
 RETURNS TABLE(job_id uuid, user_id uuid, inventaire_id bigint, platform text, listing_id text, preuve text, preuve_le timestamp with time zone, prix numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT c.id, c.user_id, c.inventaire_id, c.platform, btrim(c.platform_listing_id), p.preuve, p.preuve_le,
         coalesce(CASE WHEN c.platform_fields ->> 'detected_price' ~ '^[0-9]+([.][0-9]+)?$'
                       THEN (c.platform_fields ->> 'detected_price')::numeric END, c.price)
    FROM cross_post_jobs c
    JOIN inventaire i ON i.id = c.inventaire_id AND i.user_id = c.user_id
    CROSS JOIN LATERAL (
      SELECT x.preuve, x.preuve_le FROM (
        -- Vinted : le DERNIER relevé du dressing de CETTE annonce dit « sold »,
        -- et il a été pris après sa mise en ligne. L'instant de la preuve : le
        -- premier relevé « sold » de cette annonce après sa mise en ligne.
        SELECT 'releve_vinted_sold'::text AS preuve,
               (SELECT min(s2.captured_at) FROM vinted_listing_snapshots s2
                 WHERE s2.user_id = c.user_id AND s2.vinted_item_id = btrim(c.platform_listing_id)
                   AND s2.status = 'sold' AND s2.captured_at >= coalesce(c.published_at, c.created_at)) AS preuve_le
         WHERE c.platform = 'vinted'
           AND (SELECT s.status = 'sold' AND s.captured_at >= coalesce(c.published_at, c.created_at)
                  FROM vinted_listing_snapshots s
                 WHERE s.user_id = c.user_id AND s.vinted_item_id = btrim(c.platform_listing_id)
                 ORDER BY s.captured_at DESC LIMIT 1)
        UNION ALL
        -- Toute plateforme : la page de CETTE annonce lue « vendue », identifiant exact.
        SELECT 'page_annonce_sold'::text,
               coalesce(_ts_ou_null(c.platform_fields #>> '{sale_evidence,observed_at}'),
                        _ts_ou_null(c.platform_fields #>> '{sale_evidence,lu_le}'),
                        _ts_ou_null(c.platform_fields ->> 'unavailable_since'), c.last_checked_at)
         WHERE c.platform_fields #>> '{sale_evidence,listing_id}' = btrim(c.platform_listing_id)
           AND c.platform_fields #>> '{sale_evidence,platform}' = c.platform
           AND c.platform_fields #>> '{sale_evidence,state}' = 'sold'
           AND c.platform_fields #>> '{sale_evidence,exact}' = 'true'
      ) x
      WHERE x.preuve_le IS NOT NULL
      ORDER BY x.preuve_le
      LIMIT 1
    ) p
   WHERE c.status = 'published' AND (c.platform_fields ->> 'sale_signal') = 'sold'   -- l'index partiel
     AND c.action IN ('publish', 'republish')
     AND (p_user IS NULL OR c.user_id = p_user)
     AND (p_job IS NULL OR c.id = p_job)
     AND nullif(btrim(c.platform_listing_id), '') IS NOT NULL
     AND i.statut = 'stock' AND coalesce(i.quantite, 1) > 0 AND i.fusionne_dans IS NULL
     AND p.preuve_le >= p_depuis
     AND NOT EXISTS (SELECT 1 FROM ventes_operations o
                      WHERE o.user_id = c.user_id AND o.cle = 'annonce:' || c.platform || ':' || btrim(c.platform_listing_id))
     AND NOT EXISTS (SELECT 1 FROM ventes_operations o
                      WHERE o.user_id = c.user_id AND o.cle = c.platform_fields ->> 'vente_operation_cle')
     /*refus*/AND (p_ignorer_refus OR NOT EXISTS (SELECT 1 FROM ventes_prouvees_refus r
                                                 WHERE r.job_id = c.id AND r.reessayer_apres > now()))/*fin refus*/
   ORDER BY p.preuve_le, c.id
   LIMIT greatest(1, least(coalesce(p_limite, 25), 1000));
$function$;

-- ventes_a_decider telle qu'en prod le 11/10/2026
CREATE OR REPLACE FUNCTION public.ventes_a_decider()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
 SET statement_timeout TO '5s'
AS $function$
declare
  v_user uuid := auth.uid();
  v_out  jsonb;
begin
  if v_user is null then return '[]'::jsonb; end if;
  select coalesce(jsonb_agg(x.ligne order by x.detectee_le desc), '[]'::jsonb) into v_out
  from (
    select a.detectee_le, jsonb_build_object(
      'cle', 'annonce:' || a.pf || ':' || a.annonce_id,
      'plateforme', a.pf, 'annonce_id', a.annonce_id,
      'job_id', j.id, 'inventaire_id', i.id,
      'titre', coalesce(nullif(btrim(i.titre), ''), j.title, a.titre),
      'prix', coalesce(case when j.platform_fields ->> 'detected_price' ~ '^[0-9]+([.][0-9]+)?$'
                            then (j.platform_fields ->> 'detected_price')::numeric end, j.price, a.prix),
      'quantite', coalesce(i.quantite, 1),
      'listing_url', j.listing_url,
      'detectee_le', a.detectee_le) as ligne
    from (
      select p.plateforme as pf, btrim(p.annonce_id) as annonce_id, min(p.part_le) as detectee_le,
             (array_agg(p.titre order by p.id desc))[1] as titre,
             (array_agg(p.prix order by p.id desc))[1] as prix
        from public.push_ventes p
       where p.user_id = v_user and p.part_le is not null
         and p.origine not in ('declaree', 'essai') and p.vente_id is null
         and nullif(btrim(coalesce(p.annonce_id, '')), '') is not null
         and p.plateforme in ('vinted', 'leboncoin', 'beebs', 'opla', 'depop')
       group by 1, 2
    ) a
    cross join lateral (
      select c.* from public.cross_post_jobs c
       where c.user_id = v_user and c.platform = a.pf and btrim(c.platform_listing_id) = a.annonce_id
         and coalesce(c.action, 'publish') in ('publish', 'republish')
       order by c.created_at desc limit 1) j
    join public.inventaire i on i.id = j.inventaire_id and i.user_id = v_user
   where j.status = 'published'
     -- Le bandeau « Vendue ? » du job la porte déjà : jamais deux questions.
     and j.platform_fields ->> 'sale_signal' is null
     and j.platform_fields ->> 'unavailable_since' is null
     -- Traitée : reçu de la vente, ou vente déclarée par la personne.
     and not exists (select 1 from public.ventes_operations o
                      where o.user_id = v_user
                        and o.cle in ('annonce:' || a.pf || ':' || a.annonce_id,
                                      coalesce(j.platform_fields ->> 'vente_operation_cle', '')))
     and not exists (select 1 from public.push_ventes d
                      where d.user_id = v_user and d.statut = 'declaree'
                        and d.cles @> array['annonce:' || a.pf || ':' || a.annonce_id])
     and i.fusionne_dans is null and i.statut <> 'vendu' and coalesce(i.quantite, 1) > 0
     -- Toujours vendue au dernier relevé de la plateforme.
     and (case when a.pf = 'vinted' then (
             select s.status = 'sold' from public.vinted_listing_snapshots s
              where s.user_id = v_user and s.vinted_item_id = a.annonce_id
              order by s.captured_at desc limit 1)
           else (
             select ap.statut_plateforme = 'vendue' from public.annonces_plateforme ap
              where ap.user_id = v_user and ap.platform = a.pf and ap.listing_id = a.annonce_id
              order by ap.vu_le desc nulls last limit 1) end) is true
     -- Vinted : remplacée par une autre annonce EN LIGNE de la même fiche → pas une vente.
     and not (a.pf = 'vinted' and nullif(btrim(i.vinted_item_id), '') is not null
              and btrim(i.vinted_item_id) <> a.annonce_id
              and coalesce(i.vinted_status, '') = 'active' and i.disparu_le is null
              and exists (select 1 from public.vinted_listing_snapshots s2
                           where s2.user_id = v_user and s2.vinted_item_id = btrim(i.vinted_item_id)
                             and s2.status = 'active' and s2.captured_at > now() - interval '26 hours'))
     and public.retrait_job_prouve(j.id) and public.fiche_annonces_vivantes(i.id, a.pf) < 2
   order by a.detectee_le desc
   limit 100
  ) x;
  return v_out;
end;
$function$;
