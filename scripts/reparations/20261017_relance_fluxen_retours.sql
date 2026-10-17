-- ═══════════════════════════════════════════════════════════════════════════
-- 17/10 — POINT 9 : RELANCE UNIQUE de la publication eBay de Fluxen (b731ae0f)
-- ═══════════════════════════════════════════════════════════════════════════
-- Cause corrigée (ebay-api-worker v88, ebay-account v18, déployées le 17/10 à
-- 13:13) : un refus 25002 « ReturnsAcceptedOption » (eBay exige des retours
-- acceptés de ce compte, vendeur pro) n'est plus un « relancer » muet — la
-- politique de retours retenue est retirée et le job passe « compte à finir —
-- retours », ré-armé tout seul quand la personne choisit « Acceptés sous 30
-- jours » (creer_politique met désormais à jour la politique du même nom au
-- lieu de la recréer — ses trois essais du 15/10 avaient échoué sur ce nom).
-- Cette relance fait entrer le job dans ce circuit ; FillSell ne choisit JAMAIS
-- la politique à sa place.
-- Conditions relues le 17/10 avant la relance : fiche 1792097086601 en stock
-- (quantité 1), aucune vente, aucune annonce eBay (offre 313720326011 non
-- publiée, réutilisée) ; ses deux annonces eBay relevées sans fiche sont
-- d'autres objets (coffret de prothèses oculaires, jeu d'échecs) : aucun doublon.
-- Même geste que « Relancer » dans l'app (relancerJobEchoue) : CAS sur le statut
-- lu, erreur archivée, échéances et compteurs d'attente levés. Aucun mail.
-- Sauvegarde : _backup_1710_relance_fluxen ; inverse en bas du fichier.
begin;

create table if not exists public._backup_1710_relance_fluxen as
  select id, status, error, platform_fields, now() as sauve_le from public.cross_post_jobs where false;

insert into public._backup_1710_relance_fluxen
select id, status, error, platform_fields, now() from public.cross_post_jobs
 where id = 'b731ae0f-5847-4731-a97f-dea7faa27c5c' and status = 'needs_user' and platform = 'ebay' and action = 'publish'
   and platform_listing_id is null and listing_url is null
   and not exists (select 1 from public._backup_1710_relance_fluxen b where b.id = 'b731ae0f-5847-4731-a97f-dea7faa27c5c');

update public.cross_post_jobs j set
  status = 'pending',
  error = null,
  platform_fields = (j.platform_fields - 'next_action_after' - 'needs_user_tick_le' - 'needs_user_actif_ms'
                     - 'needs_user_vu_le' - 'needs_user_vu_erreur' - 'attente_session' - 'refus_passager')
    || jsonb_build_object(
      'needsUserAttempts', 0,
      'relance_reparation_1710', jsonb_build_object('le', now(), 'par', 'scripts/reparations/20261017_relance_fluxen_retours.sql',
        'raison', 'refus 25002 retours : entrée dans le circuit « compte à finir — retours » (point 9)'),
      'erreurs_archivees', coalesce(j.platform_fields->'erreurs_archivees', '[]'::jsonb)
        || jsonb_build_array(jsonb_build_object('le', now(), 'statut', j.status, 'erreur', left(j.error, 2000), 'par', 'relance_reparation_1710')))
from public._backup_1710_relance_fluxen b
where j.id = b.id and j.status = 'needs_user'
  and (select i.statut from public.inventaire i where i.id = j.inventaire_id) = 'stock'
  and not exists (select 1 from public.ventes v where v.inventaire_id = j.inventaire_id);

do $$
begin
  if (select count(*) from public.cross_post_jobs where id = 'b731ae0f-5847-4731-a97f-dea7faa27c5c' and status = 'pending'
        and platform_fields ? 'relance_reparation_1710') <> 1 then
    raise exception 'relance Fluxen : le job n''est pas repassé en file — tout est annulé';
  end if;
end $$;

select left(id::text, 8) as job, status, platform_fields->'relance_reparation_1710'->>'le' as relance_le
  from public.cross_post_jobs where id = 'b731ae0f-5847-4731-a97f-dea7faa27c5c';

commit;

-- INVERSE (seulement si le job n'a pas bougé depuis : encore en file, pas pris) :
-- begin;
-- update public.cross_post_jobs j set status = b.status, error = b.error, platform_fields = b.platform_fields
--   from public._backup_1710_relance_fluxen b
--  where j.id = b.id and j.status = 'pending' and j.platform_fields ? 'relance_reparation_1710';
-- commit;
