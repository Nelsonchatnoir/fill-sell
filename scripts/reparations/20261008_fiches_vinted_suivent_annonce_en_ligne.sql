-- ════════════════════════════════════════════════════════════════════════════
-- LES FICHES VINTED SUIVENT L'ANNONCE EN LIGNE (08/10/2026, feu vert de Nico)
-- ════════════════════════════════════════════════════════════════════════════
-- Même règle que la migration 20261008110000/111000, appliquée à l'état du
-- jour : une fiche dont l'annonce portée est PROUVÉE hors ligne (vendue,
-- disparue, job clos ou signalé « plus en ligne ») suit sa plus récente
-- annonce VUE EN LIGNE par le dressing (relevé actif < 26 h, postérieur à la
-- publication de l'annonce portée, job jamais annulé). Jamais une fiche
-- « pas vendue » (vinted_status 'closed' = réponse de la personne).
-- Aperçu du 08/10 : 7 fiches, toutes chez louis@ttfamily.fr.
-- Rien n'est touché sur Vinted, aucune vente n'est créée ni supprimée.
-- Sauvegarde : _backup_0810_fiches_vinted (RLS, aucun accès anon/authenticated).
-- Inverse : 20261008_fiches_vinted_suivent_annonce_en_ligne_INVERSE.sql
BEGIN;
CREATE TABLE IF NOT EXISTS public._backup_0810_fiches_vinted (
  id bigint NOT NULL, user_id uuid NOT NULL, vinted_item_id text, vinted_status text, disparu_le timestamptz,
  vinted_view_count integer, vinted_favourite_count integer, listed_at_guess timestamptz, nouvel_id text,
  sauvegarde_le timestamptz NOT NULL DEFAULT now());
ALTER TABLE public._backup_0810_fiches_vinted ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_0810_fiches_vinted FROM PUBLIC, anon, authenticated;

CREATE TEMP TABLE _cible AS
with dern as (
  select distinct on (s.user_id, s.vinted_item_id) s.user_id, s.vinted_item_id, s.status, s.captured_at
    from vinted_listing_snapshots s where s.captured_on > current_date - 3
   order by s.user_id, s.vinted_item_id, s.captured_at desc),
fiches as (   -- fiches dont l'annonce portée est PROUVÉE hors ligne (jamais un « pas vendue » de la personne)
  select i.id, i.user_id, btrim(i.vinted_item_id) p,
         (select max(coalesce(j.published_at, j.created_at)) from cross_post_jobs j where j.inventaire_id=i.id and j.platform='vinted'
           and j.action in ('publish','republish') and btrim(j.platform_listing_id)=btrim(i.vinted_item_id)) p_publiee_le
    from inventaire i
   where i.statut='stock' and i.fusionne_dans is null and i.vinted_item_id ~ '^\d+$' and coalesce(i.vinted_status,'') <> 'closed'
     and (coalesce(i.vinted_status,'')='sold' or i.disparu_le is not null
          or exists (select 1 from cross_post_jobs j where j.inventaire_id=i.id and j.user_id=i.user_id and j.platform='vinted'
                       and j.action in ('publish','republish') and btrim(j.platform_listing_id)=btrim(i.vinted_item_id)
                       and (j.status in ('sold','cancelled','deleted') or j.platform_fields ? 'unavailable_since')))),
cible as (    -- l'annonce la plus récente de la fiche VUE EN LIGNE après la publication de la portée, job jamais annulé
  select distinct on (f.id) f.id fiche, f.user_id, f.p avant, btrim(j.platform_listing_id) apres
    from fiches f join cross_post_jobs j on j.inventaire_id=f.id and j.user_id=f.user_id and j.platform='vinted'
         and j.action in ('publish','republish') and j.platform_listing_id ~ '^\d+$' and j.status not in ('cancelled','deleted')
    join dern d on d.user_id=f.user_id and d.vinted_item_id=btrim(j.platform_listing_id)
   where d.status='active' and d.captured_at > now() - interval '26 hours'
     and d.captured_at > coalesce(f.p_publiee_le, '-infinity'::timestamptz)
     and btrim(j.platform_listing_id) <> f.p
   order by f.id, btrim(j.platform_listing_id)::numeric desc)
SELECT * FROM cible;

INSERT INTO public._backup_0810_fiches_vinted (id, user_id, vinted_item_id, vinted_status, disparu_le, vinted_view_count, vinted_favourite_count, listed_at_guess, nouvel_id)
SELECT i.id, i.user_id, i.vinted_item_id, i.vinted_status, i.disparu_le, i.vinted_view_count, i.vinted_favourite_count, i.listed_at_guess, c.apres
  FROM inventaire i JOIN _cible c ON c.fiche = i.id;

UPDATE inventaire i SET vinted_item_id = c.apres, vinted_status = 'active', disparu_le = NULL
  FROM _cible c WHERE i.id = c.fiche AND btrim(i.vinted_item_id) = c.avant;

SELECT (SELECT count(*) FROM public._backup_0810_fiches_vinted) sauvegardees,
       (SELECT jsonb_agg(jsonb_build_object('fiche', i.id, 'annonce', i.vinted_item_id, 'statut', i.vinted_status) ORDER BY i.id)
          FROM inventaire i JOIN _cible c ON c.fiche = i.id) apres;
COMMIT;
