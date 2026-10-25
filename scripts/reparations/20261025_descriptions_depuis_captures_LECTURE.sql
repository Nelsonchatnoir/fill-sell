-- ═══════════════════════════════════════════════════════════════════════════
-- RATTRAPAGE 25/10 (chantier « importer son Vinted puis publier ailleurs ») — LECTURE À BLANC
-- ═══════════════════════════════════════════════════════════════════════════
-- Les fiches importées de Vinted SANS description dont FillSell a DÉJÀ le texte du vendeur : la capture de
-- republication (vinted_republish_captures, verdict « valide ») lue sur SON annonce. La règle est celle de l'app
-- (src/publication/texteDuVendeur.js, « LE CACHE AVANT LE RÉSEAU », 07/09) : capture valide de moins de 30 jours, et
-- article inchangé depuis — même titre ET même prix (une republication garde l'un et l'autre ; l'identifiant
-- d'annonce change à chaque recréation, il n'est donc pas comparé). Aucune écriture ici.
with derniere as (
  select distinct on (c.inventaire_id) c.inventaire_id, c.id as capture_id, c.captured_at,
         nullif(btrim(coalesce(c.payload->>'description', c.payload->'natif'->>'description')), '') as description,
         btrim(coalesce(c.payload->>'titre', c.payload->'natif'->>'title', '')) as titre_capture,
         nullif(c.payload->'natif'->'price'->>'amount', '')::numeric as prix_capture,
         coalesce(nullif(c.libelles->>'catalog_id_depot', ''), nullif(c.payload->'natif'->>'catalog_id', ''))::bigint as catalog_id
    from public.vinted_republish_captures c
   where c.verdict = 'valide' and c.captured_at > now() - interval '30 days'
   order by c.inventaire_id, c.captured_at desc
)
select count(*) as fiches, count(distinct i.user_id) as comptes,
       count(*) filter (where p.extension_last_seen_at > now() - interval '7 days') as fiches_comptes_actifs,
       count(*) filter (where public.palier_de(i.user_id) in ('premium', 'pro', 'business')) as fiches_comptes_payants,
       count(*) filter (where i.vinted_catalog_id is null and d.catalog_id is not null) as rayons_poses
  from public.inventaire i
  join derniere d on d.inventaire_id = i.id
  left join public.profiles p on p.id = i.user_id
 where i.origine = 'vinted_sync' and i.statut = 'stock' and i.disparu_le is null
   and coalesce(btrim(i.description), '') = '' and d.description is not null
   and d.titre_capture = btrim(coalesce(i.titre, ''))
   and (d.prix_capture is null or i.prix_vente is null or abs(d.prix_capture - i.prix_vente) < 0.005);
