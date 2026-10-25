-- ═══════════════════════════════════════════════════════════════════════════
-- RÉPARATION 25/10 (Thibault 44d125ac) — UNE TÂCHE PUBLIÉE N'ATTEND PLUS PERSONNE : SES MARQUEURS D'ATTENTE TOMBENT
-- ═══════════════════════════════════════════════════════════════════════════
-- Republication Vinted « Short » (44d125ac, boutique tandrieux) publiée le 25/10 à 11:03 — ancienne annonce 10389680588
-- supprimée, nouvelle 10522043426 en ligne — et la tâche finie portait encore needs_user_source « relancer »,
-- needs_user_sans_motif, error_technique et les compteurs d'une pause du 24/10 à 12:17 : un état contradictoire. Le
-- réveil par capture (handler-watch) l'avait remise en file sans retirer les marqueurs ; l'entrée en published
-- (update-job-status) ne retirait que `error`. La RÈGLE est corrigée pour tous (_shared/etat-terminal.js : une liste
-- UNIQUE, appliquée à toute entrée en published / deleted et au réveil) ; ceci répare l'EXISTANT, sur 7 jours
-- (lecture à blanc 20261025_published_marqueurs_residuels_LECTURE.sql, 25/10 ~15:00 : 392 tâches, 33 comptes ;
-- 717 sur 30 jours, 883 en tout — à étendre sur décision).
-- Périmètre (jamais une ligne inchangée) : status published, publiée depuis 7 jours, error NULL (les tâches « Impossible
-- de vérifier cette annonce… » d'un autre flux restent), au moins un marqueur, aucun marqueur daté APRÈS la publication
-- (aucun épisode postérieur n'est effacé) ; écartées aussi les lignes qu'une écriture ferait bouger AILLEURS par un
-- déclencheur (lien Beebs à poser, « pas encore visible » à lever, vente signalée) — 0 aujourd'hui.
-- Ce qui est écrit (forme de champsAttenteClose / champsRepublicationFinie) : le brut technique (error_technique) et
-- le message montré pendant l'attente (needs_user_vu_erreur) archivés dans erreurs_archivees s'ils n'y sont pas
-- (jamais perdus, date d'origine en `du`), les marqueurs d'attente retirés (processing_since gardé : il est lu),
-- republication_finie { annonce } posée sur une republication dont la nouvelle annonce est connue, une trace
-- attente_close_par_reparation. Rien d'autre : statut, error, published_at, liens, étapes, preuves, traces intacts.
-- Aucune annonce touchée, aucun mail, aucun push. Sauvegarde : _backup_2510_published_marqueurs. Inverse : …_INVERSE.sql.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

CREATE TABLE IF NOT EXISTS public._backup_2510_published_marqueurs AS
  SELECT now() AS sauvegarde_le, c.id, c.user_id, c.status, c.platform_fields, NULL::jsonb AS pf_apres
    FROM public.cross_post_jobs c WHERE false;
ALTER TABLE public._backup_2510_published_marqueurs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public._backup_2510_published_marqueurs FROM PUBLIC, anon, authenticated;

-- Deux outils de la transaction (schéma pg_temp, disparus avec la session), jumeaux exacts du code :
--   pg_temp.archiver      = archiverErreur (_shared/erreurs-archivees.js) + « jamais deux fois le même texte »,
--                           20 entrées au plus, la date d'origine en `du` ;
--   pg_temp.attente_close = champsAttenteClose (_shared/etat-terminal.js).
CREATE FUNCTION pg_temp.archiver(arr jsonb, texte text, statut text, par text, du text DEFAULT NULL)
RETURNS jsonb LANGUAGE sql STABLE AS $f$
  select case
    when nullif(btrim(coalesce(texte, '')), '') is null then arr
    when exists (select 1 from jsonb_array_elements(arr) e where e ->> 'erreur' = left(btrim(texte), 600)) then arr
    else (select coalesce(jsonb_agg(x.v order by x.o), '[]'::jsonb) from (
            select t.v, t.o, count(*) over () as n
              from jsonb_array_elements(arr || jsonb_build_array(
                     jsonb_build_object('le', now(), 'statut', statut, 'erreur', left(btrim(texte), 600), 'par', left(par, 80))
                     || case when du is not null then jsonb_build_object('du', du) else '{}'::jsonb end)) with ordinality t(v, o)) x
          where x.o > x.n - 20)
  end
$f$;
CREATE FUNCTION pg_temp.attente_close(pf jsonb, par text)
RETURNS jsonb LANGUAGE sql STABLE AS $f$
  select (pf - array['needs_user_source', 'needs_user_sans_motif', 'needsUserField', 'needsUserFields', 'champs_a_completer',
                     'needs_user_tick_le', 'needs_user_actif_ms', 'needs_user_vu_le', 'needs_user_vu_erreur', 'next_action_after',
                     'error_technique', 'erreurs_archivees'])
         || case when jsonb_array_length(a.arch) > 0 then jsonb_build_object('erreurs_archivees', a.arch) else '{}'::jsonb end
    from (select pg_temp.archiver(
                   pg_temp.archiver(coalesce(case when jsonb_typeof(pf -> 'erreurs_archivees') = 'array' then pf -> 'erreurs_archivees' end, '[]'::jsonb),
                                    case when jsonb_typeof(pf -> 'error_technique') = 'object' then pf #>> '{error_technique,brut}' else pf ->> 'error_technique' end,
                                    null, left(par, 60) || ' (error_technique)', pf #>> '{error_technique,at}'),
                   pf ->> 'needs_user_vu_erreur', 'needs_user', left(par, 60) || ' (message de l''attente)', pf ->> 'needs_user_vu_le') as arch) a
$f$;

CREATE TEMPORARY TABLE _a_nettoyer ON COMMIT DROP AS
select c.id, c.user_id, c.platform_fields AS pf_avant,
       pg_temp.attente_close(c.platform_fields, 'scripts/reparations/20261025_published_marqueurs_residuels.sql')
       || jsonb_build_object('attente_close_par_reparation', jsonb_build_object(
            'le', now(), 'pose_par', 'scripts/reparations/20261025_published_marqueurs_residuels.sql',
            'cles', (select coalesce(jsonb_agg(k order by k), '[]'::jsonb) from jsonb_object_keys(c.platform_fields) k
                      where k = any (array['needs_user_source', 'needs_user_sans_motif', 'needsUserField', 'needsUserFields', 'champs_a_completer',
                                           'needs_user_tick_le', 'needs_user_actif_ms', 'needs_user_vu_le', 'needs_user_vu_erreur', 'next_action_after', 'error_technique']))))
       || case when c.action = 'republish' and not (c.platform_fields ? 'republication_finie')
                    and nullif(btrim(coalesce(c.platform_listing_id, '')), '') is not null
                    and btrim(c.platform_listing_id) is distinct from coalesce(c.platform_fields ->> 'old_vinted_item_id', c.platform_fields ->> 'old_platform_listing_id')
               then jsonb_build_object('republication_finie', jsonb_build_object('le', now(), 'annonce', btrim(c.platform_listing_id),
                      'pose_par', 'scripts/reparations/20261025_published_marqueurs_residuels.sql'))
               else '{}'::jsonb end AS pf_apres
  from public.cross_post_jobs c
 where c.status = 'published' and c.published_at >= now() - interval '7 days' and c.error is null
   and c.platform_fields ?| array['needs_user_source', 'needs_user_sans_motif', 'needsUserField', 'needsUserFields', 'champs_a_completer',
                                  'needs_user_tick_le', 'needs_user_actif_ms', 'needs_user_vu_le', 'needs_user_vu_erreur', 'next_action_after', 'error_technique']
   and coalesce((c.platform_fields #>> '{error_technique,at}')::timestamptz, c.published_at) <= c.published_at
   and coalesce((c.platform_fields #>> '{needs_user_sans_motif,le}')::timestamptz, c.published_at) <= c.published_at
   -- Aucune ligne qu'un déclencheur ferait bouger ailleurs (rien d'autre que les marqueurs).
   and coalesce(c.platform_fields ->> 'sale_signal', '') <> 'sold'
   and not (c.platform <> 'vinted' and c.platform_fields ? 'pas_encore_visible' and c.vu_en_ligne_le is not null)
   and not (c.platform = 'beebs' and c.platform_listing_id ~ '^\s*[0-9]{6,}\s*$'
            and (nullif(btrim(coalesce(c.listing_url, '')), '') is null
                 or (c.action = 'republish' and nullif(btrim(coalesce(c.platform_fields ->> 'new_listing_url', '')), '') is null)));

INSERT INTO public._backup_2510_published_marqueurs (sauvegarde_le, id, user_id, status, platform_fields)
SELECT now(), c.id, c.user_id, c.status, c.platform_fields FROM public.cross_post_jobs c JOIN _a_nettoyer a ON a.id = c.id
 WHERE NOT EXISTS (SELECT 1 FROM public._backup_2510_published_marqueurs b WHERE b.id = c.id);

DO $$
DECLARE n integer; attendus integer;
BEGIN
  SELECT count(*) INTO attendus FROM _a_nettoyer;
  IF attendus > 450 THEN RAISE EXCEPTION 'garde : % tâches (la lecture à blanc en voyait 392) — rien n''est fait', attendus; END IF;
  IF NOT EXISTS (SELECT 1 FROM _a_nettoyer WHERE id = '44d125ac-47ff-4623-bcd8-eea509ebb810') THEN
    RAISE EXCEPTION 'garde : la tâche de Thibault (44d125ac) n''est plus dans le périmètre — état relu inattendu, rien n''est fait';
  END IF;
  -- Compare-and-swap sur platform_fields : une ligne qui a bougé depuis la lecture n'est jamais écrasée.
  UPDATE public.cross_post_jobs c
     SET platform_fields = a.pf_apres
    FROM _a_nettoyer a
   WHERE c.id = a.id AND c.status = 'published' AND c.platform_fields = a.pf_avant;
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE '% tâche(s) publiée(s) débarrassée(s) de leurs marqueurs d''attente, sur % attendue(s)', n, attendus;
END $$;

UPDATE public._backup_2510_published_marqueurs b
   SET pf_apres = c.platform_fields
  FROM public.cross_post_jobs c
 WHERE c.id = b.id AND b.pf_apres IS NULL
   AND c.platform_fields #>> '{attente_close_par_reparation,pose_par}' = 'scripts/reparations/20261025_published_marqueurs_residuels.sql';

SELECT count(*) AS taches_nettoyees,
       count(*) FILTER (WHERE c.platform_fields ?| array['needs_user_source', 'needs_user_sans_motif', 'error_technique', 'needs_user_vu_erreur']) AS marqueurs_restants,
       count(*) FILTER (WHERE c.platform_fields ? 'republication_finie') AS republication_finie,
       (SELECT jsonb_build_object('cles', (SELECT jsonb_agg(k ORDER BY k) FROM jsonb_object_keys(t.platform_fields) k),
                                  'archives', jsonb_array_length(t.platform_fields -> 'erreurs_archivees'))
          FROM public.cross_post_jobs t WHERE t.id = '44d125ac-47ff-4623-bcd8-eea509ebb810') AS thibault_44d125ac,
       (SELECT count(*) FROM public.email_logs e WHERE e.sent_at > now() - interval '5 minutes') AS mails_5_min
  FROM public._backup_2510_published_marqueurs b JOIN public.cross_post_jobs c ON c.id = b.id
 WHERE b.pf_apres IS NOT NULL;
COMMIT;
