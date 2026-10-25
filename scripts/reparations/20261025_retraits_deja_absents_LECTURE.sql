-- ═══════════════════════════════════════════════════════════════════════════
-- RETRAITS OUVERTS SUR UNE ANNONCE DÉJÀ ABSENTE (25/10) — LECTURE À BLANC (aucune écriture)
-- ═══════════════════════════════════════════════════════════════════════════
-- Règle de Nico (25/10) : « Un retrait sur une annonce déjà absente ne doit jamais finir en erreur … le retrait est
-- considéré comme fait et se clôt seul … Cherche tous les retraits encore ouverts qui sont dans ce cas et clos-les. »
-- ⛔ Jamais au prix d'une double vente : seules les preuves FORTES de l'enquête du 25/10 (retraits.md §3), par NUMÉRO :
--   E1 — le relevé a vu l'annonce partir : ligne annonces_plateforme disparue / retirée / vendue (Leboncoin, eBay,
--        Depop), fiche Vinted disparue au même numéro, ou dernier instantané Vinted « sold » ;
--   E2 — les deux derniers relevés COMPLETS ne la portent plus, commencés après sa dernière vue (Vinted : ceux de SA
--        boutique — la boutique du relevé qui l'a vue en dernier, sinon celle du job ; jamais « toutes ») ;
--   E3 — et, toujours, une copie de CE numéro (dépôt ou republication, quel que soit son statut aujourd'hui) relue
--        « plus en ligne » par la veille (unavailable_since), ou vendue (sale_signal sold).
--   Fort = (E1 ou E2) ET E3. Un « indice seul » (E3 seul, E2 seul) ne clôt rien.
--   Beebs : JAMAIS sur le relevé (index public en retard, vérification invisible) — seulement deux constats « page
--   404 » de l'extension à 6 h d'écart au moins, et la garde de modération (dépôt vu en ligne, ou de plus de 72 h).
-- Ce que ferait la réparation : statut « deleted » (jamais cancelled/failed : un « Oui » à « Déjà vendu ? » se
-- déferait), error NULL, erreur archivée, deja_absente + retrait_par ; la copie publiée « plus en ligne » de la même
-- annonce close comme après un retrait (« pas une vente »), sauf vente prouvée (sale_signal sold).
with j as (
  select c.id, c.user_id, c.platform, c.status, c.created_at, c.listing_url, c.platform_listing_id, c.inventaire_id,
         c.error, c.platform_fields pf,
         case when c.platform = 'vinted'
              then coalesce(substring(btrim(c.platform_listing_id) from '^([0-9]{6,})$'), substring(c.listing_url from '/items/([0-9]{6,})'))
              else coalesce(nullif(btrim(c.platform_listing_id), ''),
                            substring(c.listing_url from '(?:/ad/[^/]+/|/itm/(?:[^/]+/)?|/p/|/products/)([A-Za-z0-9_-]+)')) end numero
    from public.cross_post_jobs c
   where c.action = 'delete' and c.status in ('pending', 'needs_user', 'failed')
     and c.platform in ('vinted', 'leboncoin', 'ebay', 'depop', 'beebs')
), runs as (
  select r.user_id, r.platform, r.kind, r.vinted_user_id, r.started_at, coalesce(r.finished_at, r.updated_at) fin,
         (r.status = 'done' and r.total_entries is not null and r.items_vus >= r.total_entries
          and coalesce(r.erreur, '') !~* '\[incomplet\]') complet,
         row_number() over (partition by r.user_id, r.platform, r.kind order by r.started_at desc) rang
    from public.vinted_sync_runs r
   where r.started_at is not null and r.status not in ('queued', 'expired', 'cancelled', 'running', 'claimed')
     and r.started_at > now() - interval '120 days'
     and r.user_id in (select user_id from j)
), v as (
  select j.*,
    -- dernière vue Vinted (instantané du relevé) et son statut
    (select max(s.captured_at) from public.vinted_listing_snapshots s
      where j.platform = 'vinted' and s.user_id = j.user_id and s.vinted_item_id = j.numero) snap_vu,
    (select s.status from public.vinted_listing_snapshots s
      where j.platform = 'vinted' and s.user_id = j.user_id and s.vinted_item_id = j.numero order by s.captured_at desc limit 1) snap_statut,
    -- dernière vue hors Vinted (ligne du relevé) et ligne « partie »
    (select max(a.vu_le) from public.annonces_plateforme a
      where j.platform <> 'vinted' and a.user_id = j.user_id and a.platform = j.platform
        and public.listing_designe(a.listing_id, j.listing_url, j.platform_listing_id)) a_vu,
    exists (select 1 from public.annonces_plateforme a
      where j.platform <> 'vinted' and a.user_id = j.user_id and a.platform = j.platform
        and public.listing_designe(a.listing_id, j.listing_url, j.platform_listing_id)
        and (a.disparu_le is not null or a.retiree_le is not null or a.statut_plateforme in ('vendue', 'retiree', 'retirée'))) a_partie,
    exists (select 1 from public.annonces_plateforme a
      where j.platform <> 'vinted' and a.user_id = j.user_id and a.platform = j.platform
        and public.listing_designe(a.listing_id, j.listing_url, j.platform_listing_id) and a.statut_plateforme = 'vendue') a_vendue,
    exists (select 1 from public.inventaire i
      where j.platform = 'vinted' and i.id = j.inventaire_id and i.disparu_le is not null and i.vinted_item_id = j.numero) fiche_disparue,
    -- une copie (dépôt ou republication, tout statut) de CE numéro relue plus en ligne par la veille, ou vendue
    exists (select 1 from public.cross_post_jobs p
      where p.user_id = j.user_id and p.platform = j.platform and p.action in ('publish', 'republish')
        and p.id <> j.id
        and coalesce(nullif(btrim(p.platform_listing_id), ''),
                     substring(p.listing_url from '(?:/items/|/ad/[^/]+/|/itm/(?:[^/]+/)?|/p/|/products/)([A-Za-z0-9_-]+)')) = j.numero
        and (p.platform_fields ? 'unavailable_since' or p.platform_fields ->> 'sale_signal' = 'sold')) e3,
    exists (select 1 from public.cross_post_jobs p
      where p.user_id = j.user_id and p.platform = j.platform and p.action in ('publish', 'republish') and p.status = 'published'
        and p.id <> j.id and p.platform_fields ->> 'sale_signal' = 'sold'
        and coalesce(nullif(btrim(p.platform_listing_id), ''),
                     substring(p.listing_url from '(?:/items/|/ad/[^/]+/|/itm/(?:[^/]+/)?|/p/|/products/)([A-Za-z0-9_-]+)')) = j.numero) copie_vendue
  from j
), b as (
  -- Vinted : la boutique de l'annonce = celle du relevé COMPLET qui l'a vue en dernier, sinon celle du job.
  select v.*,
    coalesce(
      (select r.vinted_user_id::text from runs r
        where v.platform = 'vinted' and r.user_id = v.user_id and r.platform = 'vinted' and r.kind = 'dressing' and r.complet
          and r.vinted_user_id is not null and v.snap_vu is not null
          and r.started_at - interval '60 seconds' <= v.snap_vu and v.snap_vu <= r.fin + interval '60 seconds'
        order by r.started_at desc limit 1),
      nullif(btrim(v.pf ->> 'vinted_account_id'), '')) boutique
  from v
), e as (
  select b.*,
    -- E2 Vinted : les deux derniers relevés COMPLETS de sa boutique, tous deux commencés après la dernière vue.
    case when b.platform = 'vinted' and b.boutique is not null then (
      select count(*) = 2 and bool_and(x.started_at > coalesce(b.snap_vu + interval '60 seconds', b.created_at))
        from (select r.started_at from runs r
               where r.user_id = b.user_id and r.platform = 'vinted' and r.kind = 'dressing' and r.complet
                 and r.vinted_user_id::text = b.boutique
               order by r.started_at desc limit 2) x)
    -- E2 autres : les deux derniers relevés qui ont TOURNÉ sont complets, et l'annonce n'y est pas (ni vue depuis le
    -- plus ancien des deux) — et elle a été vue au moins une fois (sinon rien ne dit qu'elle vit sur ce compte).
    when b.platform in ('leboncoin', 'ebay', 'depop') and b.a_vu is not null then (
      select count(*) = 2 and bool_and(x.complet) and min(x.started_at) - interval '60 seconds' > b.a_vu
        from (select r.started_at, r.complet from runs r
               where r.user_id = b.user_id and r.platform = b.platform and r.kind = 'annonces' and r.rang <= 2) x)
    else false end e2,
    (b.a_partie or b.fiche_disparue or coalesce(b.snap_statut, '') = 'sold') e1,
    -- Beebs : deux constats « page 404 » valides à 6 h d'écart au moins (platform_fields.beebs_404_constats).
    (b.platform = 'beebs' and (
      select count(*) >= 2 and max((c ->> 'le')::timestamptz) - min((c ->> 'le')::timestamptz) >= interval '6 hours'
        from jsonb_array_elements(case when jsonb_typeof(b.pf -> 'beebs_404_constats') = 'array' then b.pf -> 'beebs_404_constats' else '[]'::jsonb end) c
       where (c ->> 'page_http') = '404' and (c ->> 'produit') = 'false' and (c ->> 'en_verification') = 'complete'
         and (c ->> 'le') ~ '^\d{4}-\d{2}-\d{2}T')) beebs_deux_constats
  from b
), d as (
  select e.*,
    case
      when e.platform = 'beebs' then case when e.beebs_deux_constats then 'clore_beebs_constats' else 'garder_beebs' end
      when (e.e1 or e.e2) and e.e3 then 'clore'
      when e.e1 or e.e2 or e.e3 then 'garder_indice_seul'
      else 'garder' end decision
  from e
)
select d.platform, left(d.id::text, 8) id, d.status, to_char(d.created_at at time zone 'Europe/Paris', 'DD/MM HH24:MI') cree,
       d.numero, d.e1, d.e2, d.e3, d.boutique, d.decision,
       (d.snap_statut = 'sold' or d.a_vendue or d.copie_vendue) vente_prouvee,
       left(coalesce(d.error, ''), 90) erreur_affichee,
       exists (select 1 from public.inventaire_doublons q where q.user_id = d.user_id and q.preuves ? 'retraits_oui'
                and (q.preuves -> 'retraits_oui') ? d.id::text) dans_fusion,
       (select count(*) from public.cross_post_jobs p
         where p.user_id = d.user_id and p.platform = d.platform and p.action in ('publish', 'republish') and p.status = 'published'
           and p.id <> d.id and (d.inventaire_id is null or p.inventaire_id = d.inventaire_id)
           and coalesce(p.platform_fields ->> 'sale_signal', '') <> 'sold'
           and coalesce(nullif(btrim(p.platform_listing_id), ''),
                        substring(p.listing_url from '(?:/items/|/ad/[^/]+/|/itm/(?:[^/]+/)?|/p/|/products/)([A-Za-z0-9_-]+)')) = d.numero) copies_a_clore
  from d
 order by d.decision, d.platform, d.created_at;
