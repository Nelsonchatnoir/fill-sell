-- ═══════════════════════════════════════════════════════════════════════════
-- RÉPARATION 25/10 — LES RETRAITS OUVERTS SUR UNE ANNONCE DÉJÀ ABSENTE SE CLOSENT (règle de Nico)
-- ═══════════════════════════════════════════════════════════════════════════
-- Nico, 25/10 : « Un retrait sur une annonce déjà absente ne doit jamais finir en erreur … le retrait est considéré
-- comme fait et se clôt seul, sans erreur ni message à l'utilisateur. Sur toutes les plateformes. Cherche tous les
-- retraits encore ouverts qui sont dans ce cas et clos-les. » La règle est corrigée pour tous (extension 0.6.144,
-- update-job-status, handler-watch : balayage « retrait déjà absent », ebay-api-worker) ; ceci clôt l'EXISTANT.
-- Lecture à blanc (20261025_retraits_deja_absents_LECTURE.sql, 25/10 ~15:00) : 9 retraits, 2 copies publiées.
--   Leboncoin 6cfd3329, c22f55e3 (Billy, armés le 26/09 sur des copies déjà « plus en ligne »), f38fc7f6 (Hassan Said,
--   un « Oui » à « Déjà vendu ? » : clos `deleted`, la fusion de la personne reste) ;
--   Vinted 68fc8be0, 828bbf63, 49d0def6, 21fa96b2, c0b42f04 (Sandrine Jocaille, 26/09), fd6ed14c (Choupette 185).
-- ⛔ Seulement les preuves FORTES, par NUMÉRO : (E1 relevé qui l'a vue partir OU E2 deux relevés complets sans elle
--    depuis sa dernière vue — Vinted : ceux de SA boutique) ET E3 (une copie de ce numéro relue « plus en ligne » par
--    la veille, ou vendue). Un « indice seul » (9e50c151 eBay, 969d8550 / 9774defd / eca8aaa9 Leboncoin) reste ouvert.
--    Beebs : jamais sur le relevé — seulement deux constats « page 404 » de l'extension à 6 h d'écart (aucun à ce jour).
-- Ce qui est écrit : le retrait passe `deleted` (jamais cancelled / failed : un « Oui » se déferait), error NULL,
-- l'erreur d'avant archivée, deja_absente { preuve, vente } + retrait_par + delete_confirmed_by, attente close ;
-- puis la copie publiée « plus en ligne » de la MÊME annonce est close comme l'extension le fait après tout retrait
-- (« Annonce retirée par le vendeur (retrait ciblé depuis l'app) — pas une vente »), jamais une vente prouvée.
-- Effets des déclencheurs (sauvegardés aussi) : annonces_plateforme.retiree_le / disparu_le (Leboncoin),
-- inventaire.disparu_le / vinted_status (Vinted). Aucune annonce touchée chez une plateforme, aucun mail, aucun push.
-- Sauvegarde : _backup_2510_retraits_deja_absents (+ _annonces, _fiches). Inverse : …_INVERSE.sql.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

CREATE TABLE IF NOT EXISTS public._backup_2510_retraits_deja_absents AS
  SELECT now() AS sauvegarde_le, NULL::text AS role, NULL::jsonb AS pf_apres, NULL::text AS status_apres, c.*
    FROM public.cross_post_jobs c WHERE false;
ALTER TABLE public._backup_2510_retraits_deja_absents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public._backup_2510_retraits_deja_absents FROM PUBLIC, anon, authenticated;
CREATE TABLE IF NOT EXISTS public._backup_2510_retraits_deja_absents_annonces AS
  SELECT now() AS sauvegarde_le, NULL::uuid AS retrait_id, a.* FROM public.annonces_plateforme a WHERE false;
ALTER TABLE public._backup_2510_retraits_deja_absents_annonces ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public._backup_2510_retraits_deja_absents_annonces FROM PUBLIC, anon, authenticated;
CREATE TABLE IF NOT EXISTS public._backup_2510_retraits_deja_absents_fiches AS
  SELECT now() AS sauvegarde_le, NULL::uuid AS retrait_id, i.id, i.user_id, i.disparu_le, i.vinted_status, i.vinted_item_id
    FROM public.inventaire i WHERE false;
ALTER TABLE public._backup_2510_retraits_deja_absents_fiches ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public._backup_2510_retraits_deja_absents_fiches FROM PUBLIC, anon, authenticated;

-- ── 1. Les retraits à clore : la règle de la lecture à blanc, à l'identique ─────────────────────────────────
CREATE TEMPORARY TABLE _a_clore ON COMMIT DROP AS
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
    (select max(s.captured_at) from public.vinted_listing_snapshots s
      where j.platform = 'vinted' and s.user_id = j.user_id and s.vinted_item_id = j.numero) snap_vu,
    (select s.status from public.vinted_listing_snapshots s
      where j.platform = 'vinted' and s.user_id = j.user_id and s.vinted_item_id = j.numero order by s.captured_at desc limit 1) snap_statut,
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
    exists (select 1 from public.cross_post_jobs p
      where p.user_id = j.user_id and p.platform = j.platform and p.action in ('publish', 'republish') and p.id <> j.id
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
    case when b.platform = 'vinted' and b.boutique is not null then (
      select count(*) = 2 and bool_and(x.started_at > coalesce(b.snap_vu + interval '60 seconds', b.created_at))
        from (select r.started_at from runs r
               where r.user_id = b.user_id and r.platform = 'vinted' and r.kind = 'dressing' and r.complet
                 and r.vinted_user_id::text = b.boutique
               order by r.started_at desc limit 2) x)
    when b.platform in ('leboncoin', 'ebay', 'depop') and b.a_vu is not null then (
      select count(*) = 2 and bool_and(x.complet) and min(x.started_at) - interval '60 seconds' > b.a_vu
        from (select r.started_at, r.complet from runs r
               where r.user_id = b.user_id and r.platform = b.platform and r.kind = 'annonces' and r.rang <= 2) x)
    else false end e2,
    (b.a_partie or b.fiche_disparue or coalesce(b.snap_statut, '') = 'sold') e1,
    (b.platform = 'beebs' and (
      select count(*) >= 2 and max((c ->> 'le')::timestamptz) - min((c ->> 'le')::timestamptz) >= interval '6 hours'
        from jsonb_array_elements(case when jsonb_typeof(b.pf -> 'beebs_404_constats') = 'array' then b.pf -> 'beebs_404_constats' else '[]'::jsonb end) c
       where (c ->> 'page_http') = '404' and (c ->> 'produit') = 'false' and (c ->> 'en_verification') = 'complete'
         and (c ->> 'le') ~ '^\d{4}-\d{2}-\d{2}T')) beebs_deux_constats
  from b
)
select e.id, e.user_id, e.platform, e.status AS status_avant, e.numero, e.inventaire_id, e.listing_url, e.platform_listing_id,
       (e.snap_statut = 'sold' or e.a_vendue or e.copie_vendue) AS vendue,
       case when e.platform = 'beebs' then 'constats_404_beebs' else 'releves' end AS confirme_par,
       jsonb_strip_nulls(jsonb_build_object(
         'source', case when e.platform = 'beebs' then 'constats_404_beebs' else 'releves_et_veille' end,
         'releve_vu_partir', e.e1, 'deux_releves_complets', e.e2, 'veille_plus_en_ligne', e.e3,
         'boutique', e.boutique, 'derniere_vue', coalesce(e.snap_vu, e.a_vu), 'statut_releve', e.snap_statut,
         'lecture', 'scripts/reparations/20261025_retraits_deja_absents_LECTURE.sql')) AS preuve
  from e
 where (e.platform = 'beebs' and e.beebs_deux_constats)
    or (e.platform <> 'beebs' and (e.e1 or e.e2) and e.e3);

-- ── 2. Les copies publiées de la même annonce, à clore comme après un retrait (jamais une vente prouvée) ─────
CREATE TEMPORARY TABLE _copies ON COMMIT DROP AS
select p.id, a.id AS retrait_id, a.numero
  from _a_clore a
  join public.cross_post_jobs p
    on p.user_id = a.user_id and p.platform = a.platform and p.action in ('publish', 'republish') and p.status = 'published'
   and p.id <> a.id and (a.inventaire_id is null or p.inventaire_id = a.inventaire_id)
   and coalesce(p.platform_fields ->> 'sale_signal', '') <> 'sold'
   and coalesce(nullif(btrim(p.platform_listing_id), ''),
                substring(p.listing_url from '(?:/items/|/ad/[^/]+/|/itm/(?:[^/]+/)?|/p/|/products/)([A-Za-z0-9_-]+)')) = a.numero;

-- ── 3. Sauvegardes (avant toute écriture) ────────────────────────────────────────────────────────────────
INSERT INTO public._backup_2510_retraits_deja_absents
SELECT now(), 'retrait', NULL, NULL, c.* FROM public.cross_post_jobs c
 WHERE c.id IN (SELECT id FROM _a_clore)
   AND NOT EXISTS (SELECT 1 FROM public._backup_2510_retraits_deja_absents b WHERE b.id = c.id);
INSERT INTO public._backup_2510_retraits_deja_absents
SELECT now(), 'copie', NULL, NULL, c.* FROM public.cross_post_jobs c
 WHERE c.id IN (SELECT id FROM _copies)
   AND NOT EXISTS (SELECT 1 FROM public._backup_2510_retraits_deja_absents b WHERE b.id = c.id);
INSERT INTO public._backup_2510_retraits_deja_absents_annonces
SELECT now(), r.id, a.* FROM _a_clore r
  JOIN public.annonces_plateforme a ON a.user_id = r.user_id AND a.platform = r.platform AND a.retiree_le IS NULL
   AND public.listing_designe(a.listing_id, r.listing_url, r.platform_listing_id)
 WHERE r.platform IN ('leboncoin', 'beebs', 'ebay', 'depop')
   AND NOT EXISTS (SELECT 1 FROM public._backup_2510_retraits_deja_absents_annonces b WHERE b.id = a.id);
INSERT INTO public._backup_2510_retraits_deja_absents_fiches
SELECT now(), r.id, i.id, i.user_id, i.disparu_le, i.vinted_status, i.vinted_item_id FROM _a_clore r
  JOIN public.inventaire i ON i.id = r.inventaire_id AND i.user_id = r.user_id AND i.vinted_item_id = r.numero
 WHERE r.platform = 'vinted'
   AND NOT EXISTS (SELECT 1 FROM public._backup_2510_retraits_deja_absents_fiches b WHERE b.id = i.id);

-- ── 4. Les écritures ────────────────────────────────────────────────────────────────────────────────────
-- Deux outils de la transaction (schéma pg_temp, disparus avec la session), jumeaux exacts du code :
--   pg_temp.archiver      = archiverErreur (_shared/erreurs-archivees.js) + « jamais deux fois le même texte »,
--                           20 entrées au plus, la date d'origine en `du` ;
--   pg_temp.attente_close = champsAttenteClose (_shared/etat-terminal.js) : brut technique et message de l'attente
--                           archivés, marqueurs d'attente retirés (processing_since gardé : il est lu).
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

DO $$
DECLARE n integer; attendus integer; copies integer;
  v_par constant text := 'scripts/reparations/20261025_retraits_deja_absents.sql';
BEGIN
  SELECT count(*) INTO attendus FROM _a_clore;
  SELECT count(*) INTO copies FROM _copies;
  IF attendus > 30 THEN RAISE EXCEPTION 'garde : % retraits (la lecture à blanc en voyait 9) — rien n''est fait', attendus; END IF;
  IF copies > 30 THEN RAISE EXCEPTION 'garde : % copies (la lecture à blanc en voyait 2) — rien n''est fait', copies; END IF;

  -- Le retrait : fait. L'erreur affichée archivée (jamais perdue), l'attente close, le drapeau unique
  -- (forme de _shared/retrait-deja-absent.js, champsRetraitDejaAbsent).
  UPDATE public.cross_post_jobs d
     SET status = 'deleted', error = NULL,
         platform_fields = (pg_temp.attente_close(
               coalesce(d.platform_fields, '{}'::jsonb) || jsonb_build_object('erreurs_archivees',
                 pg_temp.archiver(coalesce(case when jsonb_typeof(d.platform_fields -> 'erreurs_archivees') = 'array' then d.platform_fields -> 'erreurs_archivees' end, '[]'::jsonb),
                                  d.error, d.status, v_par)),
               v_par)
             - array['verification_boutique_vinted', 'retrait_attente_second_constat', 'beebs_en_moderation', 'attente_identifiant_beebs', 'lecture_etat_retrait'])
           || jsonb_build_object(
                'deja_absente', jsonb_build_object('le', now(), 'plateforme', d.platform, 'numero', a.numero, 'preuve', a.preuve,
                  'vente', case when a.vendue then true end, 'pose_par', v_par),
                'retrait_par', case when a.vendue then 'vendue_sur_la_plateforme' else 'annonce_deja_hors_ligne' end,
                'delete_confirmed_by', a.confirme_par,
                'ferme_par_support', jsonb_build_object('le', now(), 'regle', 'Nico, 25/10 : un retrait sur une annonce déjà absente se clôt seul',
                  'pose_par', v_par))
    FROM _a_clore a
   WHERE d.id = a.id AND d.action = 'delete' AND d.status = a.status_avant;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> attendus THEN RAISE EXCEPTION 'retraits : % écrit(s) sur % attendu(s) — un retrait a bougé, rien n''est fait', n, attendus; END IF;
  RAISE NOTICE '% retrait(s) clos « deleted » (annonce déjà absente)', n;

  -- La copie publiée : close comme après un retrait (cancelPublishAfterDelete), « pas une vente ».
  UPDATE public.cross_post_jobs s
     SET status = 'cancelled',
         error = 'Annonce retirée par le vendeur (retrait ciblé depuis l''app) — pas une vente',
         platform_fields = (coalesce(s.platform_fields, '{}'::jsonb) - 'unavailable_since' - 'sale_signal' - 'detected_price' - 'unavailable_pending_since')
           || case when s.platform_fields ? 'unavailable_pending_since'
                   then jsonb_build_object('unavailable_pending_at_delete', s.platform_fields -> 'unavailable_pending_since', 'unavailable_pending_archived_at', now())
                   else '{}'::jsonb end
           || jsonb_build_object('removed_by_user', true,
                'close_par_retrait_deja_absent', jsonb_build_object('le', now(), 'retrait', c.retrait_id, 'annonce', c.numero, 'pose_par', v_par))
    FROM _copies c
   WHERE s.id = c.id AND s.status = 'published' AND coalesce(s.platform_fields ->> 'sale_signal', '') <> 'sold';
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE '% copie(s) publiée(s) close(s) — pas une vente', n;
END $$;

-- L'état d'après, pour l'inverse (qui ne défait qu'une ligne restée telle quelle).
UPDATE public._backup_2510_retraits_deja_absents b
   SET pf_apres = c.platform_fields, status_apres = c.status
  FROM public.cross_post_jobs c
 WHERE c.id = b.id AND b.pf_apres IS NULL;

SELECT c.platform, left(c.id::text, 8) AS job, b.role, c.status, c.platform_fields ->> 'retrait_par' AS retrait_par,
       c.platform_fields #>> '{deja_absente,preuve,source}' AS preuve, left(coalesce(c.error, ''), 70) AS message,
       exists (select 1 from public.inventaire_doublons q where q.user_id = c.user_id and q.statut = 'fusionnee'
                and q.preuves ? 'retraits_oui' and (q.preuves -> 'retraits_oui') ? c.id::text) AS fusion_gardee,
       (SELECT count(*) FROM public.email_logs e WHERE e.user_id = c.user_id AND e.sent_at > now() - interval '5 minutes') AS mails_5_min
  FROM public._backup_2510_retraits_deja_absents b JOIN public.cross_post_jobs c ON c.id = b.id
 ORDER BY b.role DESC, c.platform, c.id;
COMMIT;
