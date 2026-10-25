-- ═══════════════════════════════════════════════════════════════════════════
-- TÂCHES « PUBLIÉES » QUI PORTENT ENCORE LES MARQUEURS D'UNE ATTENTE PASSÉE (25/10, Thibault 44d125ac) — LECTURE
-- ═══════════════════════════════════════════════════════════════════════════
-- Republication Vinted « Short » publiée le 25/10 à 11:03 avec needs_user_source, needs_user_sans_motif,
-- error_technique et les compteurs d'une pause du 24/10 (« état contradictoire ») : ni le réveil par capture
-- (handler-watch) ni l'entrée en published (update-job-status) ne les retiraient. La règle est corrigée
-- (_shared/etat-terminal.js, liste UNIQUE) ; ceci mesure l'EXISTANT, sur 7 jours (comme l'enquête du 25/10).
-- Périmètre (jamais une ligne inchangée) : status published, publiée depuis 7 jours, error NULL (les 7 tâches « Impossible
-- de vérifier cette annonce… » d'un autre flux restent), au moins un marqueur, aucun marqueur daté APRÈS la publication.
-- Ce que ferait la réparation : brut technique et message de l'attente archivés (erreurs_archivees, jamais perdus),
-- marqueurs retirés (processing_since gardé : il est lu), republication_finie posée sur une republication dont la
-- nouvelle annonce est connue. Rien d'autre : statut, error, published_at, liens, étapes, preuves, traces intacts.
with p as (
  select c.id, c.user_id, c.platform, c.action, c.published_at, c.platform_listing_id, c.platform_fields pf
    from public.cross_post_jobs c
   where c.status = 'published' and c.published_at >= now() - interval '7 days' and c.error is null
     and c.platform_fields ?| array['needs_user_source', 'needs_user_sans_motif', 'needsUserField', 'needsUserFields', 'champs_a_completer',
                                    'needs_user_tick_le', 'needs_user_actif_ms', 'needs_user_vu_le', 'needs_user_vu_erreur', 'next_action_after', 'error_technique']
     and coalesce((c.platform_fields #>> '{error_technique,at}')::timestamptz, c.published_at) <= c.published_at
     and coalesce((c.platform_fields #>> '{needs_user_sans_motif,le}')::timestamptz, c.published_at) <= c.published_at
)
select p.platform, p.action, count(*) as taches, count(distinct p.user_id) as comptes,
       count(*) filter (where p.pf ? 'needs_user_source') as avec_source,
       count(*) filter (where p.pf ? 'needs_user_sans_motif') as avec_sans_motif,
       count(*) filter (where p.pf ? 'error_technique') as bruts_a_archiver,
       count(*) filter (where nullif(btrim(coalesce(p.pf ->> 'needs_user_vu_erreur', '')), '') is not null
                          and not exists (select 1 from jsonb_array_elements(case when jsonb_typeof(p.pf -> 'erreurs_archivees') = 'array' then p.pf -> 'erreurs_archivees' else '[]'::jsonb end) e
                                           where e ->> 'erreur' = left(btrim(p.pf ->> 'needs_user_vu_erreur'), 600))) as messages_perdus_a_archiver,
       count(*) filter (where p.action = 'republish' and not (p.pf ? 'republication_finie')
                          and nullif(btrim(coalesce(p.platform_listing_id, '')), '') is not null
                          and btrim(p.platform_listing_id) is distinct from coalesce(p.pf ->> 'old_vinted_item_id', p.pf ->> 'old_platform_listing_id')) as republication_finie_a_poser,
       count(*) filter (where p.id = '44d125ac-47ff-4623-bcd8-eea509ebb810') as dont_thibault_44d125ac
  from p
 group by rollup ((p.platform, p.action))
 order by taches desc;
