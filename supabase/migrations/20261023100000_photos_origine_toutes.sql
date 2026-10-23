-- ═══════════════════════════════════════════════════════════════════════════
-- TOUTES LES PHOTOS DE L'ANNONCE D'ORIGINE, DANS L'ORDRE (23/10, point 1 — Thierry, antikcollections, eBay)
-- ═══════════════════════════════════════════════════════════════════════════
-- CE QUI S'EST PASSÉ (vérifié en base, rapport docs/enquetes/lot-2210-soir/RAPPORT.md § 23/10) : le relevé eBay par
-- l'API lit la LISTE des annonces (GetMyeBaySelling : titre, prix, vignette 140 px) puis le DÉTAIL (GetItem : toutes
-- les photos, texte, état) de 60 annonces par passage. Thierry importe ses 507 annonces à 10:52 : 447 fiches naissent
-- avec la seule vignette. La base les complète quand le détail arrive (annonce_capture_complete_fiche) — mais seulement
-- si la photo de la fiche EST encore l'adresse de la vignette : dès que la publication vers Vinted l'a recopiée chez
-- nous (`rehosted/<fiche>/`, au format {url}), la comparaison échoue et la fiche garde UNE photo de 140 px. Et la
-- garde du départ (lectureOrigineEnAttente) tenait eBay pour « lu en entier » : rien n'attendait.
--
-- LA RÈGLE (Nico, 23/10) : toutes les photos d'une annonce importée, dans l'ordre ; une fiche importée ne part jamais
-- avant que TOUTES ses photos d'origine soient lues (la même garde que pour le texte).
--   1. photo_est_vignette_de_fiche — la photo d'une fiche est-elle (une copie de) la vignette de son annonce :
--      l'adresse de la vignette, la même image eBay (clé d'image identique, quelle que soit la taille), ou une copie
--      faite par FillSell pour CETTE fiche (rapatrie-fiche/<id>/, et rehosted/<id>/ pour une fiche née d'un relevé).
--      ⛔ Une photo retouchée (enhanced/) ou ajoutée par la personne n'est jamais une copie de vignette.
--   2. fiche_completer_photos_capture — toutes les photos de l'annonce, dans SON ordre, sans doublon, à la place de la
--      vignette (ou de sa copie) ; jamais au-dessus d'une fiche qui a déjà deux photos ; tracé (inventaire_journal,
--      champ « photos », motif photos_origine_completees).
--   3. fiches_contenu_vendeur — ses annonces disent aussi la lecture du DÉTAIL eBay (detail_le) et combien de photos
--      l'annonce d'origine porte (photos_origine) ; photos_lues_le compte le détail eBay et la complétion de la fiche.
--   4. demander_lecture_origine — une fiche eBay demande aussi sa lecture (relevé de veille eBay).
-- Fonctions RÉÉCRITES depuis pg_get_functiondef relu en prod le 23/10 vers 11:40 (corps relus juste avant).
-- Inverse : supabase/rollbacks/20261023100000_photos_origine_toutes_INVERSE.sql
BEGIN;

-- 0. La clé d'une image eBay (la même photo sous toutes ses tailles : s-l140, s-l1600, $_1.JPG…).
CREATE OR REPLACE FUNCTION public.ebay_cle_image(p_url text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT COALESCE(substring(p_url from '^https?://i\.ebayimg\.com/(?:thumbs/)?images/g/([A-Za-z0-9_~-]{6,})/'),
                  substring(p_url from '^https?://i\.ebayimg\.com/00/s/[^/]+/z/([A-Za-z0-9_~-]{6,})/'))
$function$;

-- 1. La photo d'une fiche est-elle (une copie de) la vignette de son annonce ?
CREATE OR REPLACE FUNCTION public.photo_est_vignette_de_fiche(p_inventaire bigint, p_origine text, p_url text,
                                                              p_vignette text, p_premiere text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT NULLIF(btrim(COALESCE(p_url, '')), '') IS NULL
      OR p_url = p_vignette
      OR p_url = p_premiere
      -- la copie chez nous de la photo de CETTE fiche (rapatriement de handler-watch)
      OR p_url LIKE '%/rapatrie-fiche/' || p_inventaire::text || '/%'
      -- la copie faite au départ d'une publication (generate-listing, handler-watch) d'une fiche née d'un relevé
      OR (COALESCE(p_origine, '') LIKE 'releve\_%' AND p_url LIKE '%/rehosted/' || p_inventaire::text || '/%')
      -- la même image eBay, à une autre taille
      OR (public.ebay_cle_image(p_url) IS NOT NULL
          AND public.ebay_cle_image(p_url) IN (public.ebay_cle_image(p_vignette), public.ebay_cle_image(p_premiere)))
$function$;

-- 2. Les photos de l'annonce à la place de la vignette.
CREATE OR REPLACE FUNCTION public.fiche_completer_photos_capture(p_inventaire bigint, p_vignette text, p_capture jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_photos jsonb;
  v_avant jsonb;
  v_user uuid;
  n integer;
BEGIN

  -- (20/10, sécurité) Appelée sous une session (authenticated, ou tout rôle porté
  -- par un jeton autre que service_role) — y compris par le déclencheur
  -- annonce_capture_complete_fiche lors d'une écriture de l'extension : la fiche
  -- doit appartenir à auth.uid(). service_role, cron et SQL d'administration :
  -- inchangés. Le déclencheur attrape l'exception (WARNING) : l'écriture de
  -- l'annonce n'est jamais refusée pour autant.
  IF auth.role() IS NOT NULL AND auth.role() <> 'service_role' THEN
    IF auth.uid() IS NULL
       OR NOT EXISTS (SELECT 1 FROM inventaire i WHERE i.id = p_inventaire AND i.user_id = auth.uid()) THEN
      RAISE EXCEPTION 'fiche non autorisée' USING ERRCODE = '42501';
    END IF;
  END IF;
  IF p_inventaire IS NULL OR jsonb_typeof(p_capture -> 'photos') IS DISTINCT FROM 'array' THEN RETURN false; END IF;
  -- (23/10) Toutes les photos de l'annonce, dans SON ordre, sans doublon.
  SELECT COALESCE(jsonb_agg(x.p ORDER BY x.o), '[]'::jsonb) INTO v_photos
    FROM (SELECT DISTINCT ON (t.p #>> '{}') t.p, t.o
            FROM jsonb_array_elements(p_capture -> 'photos') WITH ORDINALITY AS t(p, o)
           WHERE jsonb_typeof(t.p) = 'string' AND (t.p #>> '{}') ~ '^https?://'
           ORDER BY t.p #>> '{}', t.o) x;
  IF jsonb_array_length(v_photos) < 2 THEN RETURN false; END IF;
  SELECT i.photos, i.user_id INTO v_avant, v_user FROM inventaire i WHERE i.id = p_inventaire;
  -- (23/10) La photo de la fiche se lit sous ses deux formes (chaîne nue, objet {url}) ; sa copie chez nous
  -- (rapatriement, départ d'une publication) et la même image eBay à une autre taille sont la vignette.
  UPDATE inventaire i SET
    photos = v_photos,
    photos_a_rapatrier = true
   WHERE i.id = p_inventaire
     AND i.fusionne_dans IS NULL
     AND jsonb_array_length(CASE WHEN jsonb_typeof(i.photos) = 'array' THEN i.photos ELSE '[]'::jsonb END) <= 1
     AND public.photo_est_vignette_de_fiche(i.id, i.origine,
           CASE WHEN jsonb_typeof(i.photos) = 'array' THEN COALESCE(i.photos -> 0 ->> 'url', i.photos ->> 0) END,
           p_vignette, v_photos ->> 0);
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n > 0 THEN
    PERFORM journaliser_fiche(v_user, p_inventaire, 'photos', left(COALESCE(v_avant::text, ''), 500),
      jsonb_array_length(v_photos)::text || ' photo(s) de l''annonce d''origine', 'releve', 'photos_origine_completees',
      jsonb_build_object('avant', CASE WHEN jsonb_typeof(v_avant) = 'array' THEN jsonb_array_length(v_avant) ELSE 0 END,
                         'apres', jsonb_array_length(v_photos), 'vignette', p_vignette));
  END IF;
  RETURN n > 0;
END;
$function$;

-- 3. Les fiches d'un compte, avec les dates de lecture de leur contenu chez le vendeur, et leurs annonces.
CREATE OR REPLACE FUNCTION public.fiches_contenu_vendeur(p_user uuid, p_ids bigint[])
 RETURNS TABLE(id bigint, origine text, titre text, description text, photos jsonb, attributs jsonb, vinted_item_id text, description_lue_le timestamp with time zone, etat_lu_le timestamp with time zone, photos_lues_le timestamp with time zone, annonces jsonb, origine_lue_le timestamp with time zone, disparu_le timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select i.id, i.origine, i.titre, i.description, i.photos, i.attributs, i.vinted_item_id,
         greatest(public._ts_ou_null(i.attributs #>> '{description_source,at}'),
                  (select max(jl.created_at) from public.inventaire_journal jl
                    where jl.inventaire_id = i.id and jl.champ = 'description')),
         greatest(public._ts_ou_null(i.attributs #>> '{etat,at}'),
                  (select max(jl.created_at) from public.inventaire_journal jl
                    where jl.inventaire_id = i.id and jl.champ = 'attributs.etat')),
         -- (23/10) Les photos sont LUES par la capture de la page, par le DÉTAIL eBay (API), et la fiche les a REÇUES
         -- quand la base l'a complétée (photos_origine_completees) : la plus récente des trois.
         greatest(
           (select max(a.capture_le) from public.annonces_plateforme a where a.inventaire_id = i.id and a.user_id = i.user_id),
           (select max(a.donnees_index_le) from public.annonces_plateforme a
             where a.inventaire_id = i.id and a.user_id = i.user_id and a.platform = 'ebay'
               and jsonb_typeof(a.donnees_index -> 'photos') = 'array'),
           (select max(jl.created_at) from public.inventaire_journal jl
             where jl.inventaire_id = i.id and jl.champ = 'photos' and jl.motif = 'photos_origine_completees')),
         (select coalesce(jsonb_agg(jsonb_build_object('platform', a.platform, 'capture_le', a.capture_le,
                                                       'disparu_le', a.disparu_le, 'listing_id', a.listing_id,
                                                       -- (23/10) eBay : le détail lu par l'API (GetItem ou Browse)
                                                       'detail_le', case when a.platform = 'ebay' then a.donnees_index_le end,
                                                       -- (23/10) combien de photos l'annonce d'origine porte (lues)
                                                       'photos_origine', greatest(
                                                          case when jsonb_typeof(a.capture -> 'photos') = 'array'
                                                               then jsonb_array_length(a.capture -> 'photos') end,
                                                          case when a.platform = 'ebay' and jsonb_typeof(a.donnees_index -> 'photos') = 'array'
                                                               then jsonb_array_length(a.donnees_index -> 'photos') end))), '[]'::jsonb)
            from public.annonces_plateforme a where a.inventaire_id = i.id and a.user_id = i.user_id),
         -- La lecture de l'origine déjà FAITE (détail Vinted lu par l'extension ou l'app) : ce qui manque encore
         -- n'existe pas chez le vendeur — on n'attend plus (jamais une attente sans fin).
         (select max(d.faite_le) from public.lectures_origine_demandees d
           where d.user_id = i.user_id and d.inventaire_id = i.id),
         i.disparu_le
    from public.inventaire i
   where i.user_id = p_user and i.id = any (coalesce(p_ids, array[]::bigint[]))
$function$;

-- 4. Une fiche eBay demande aussi la lecture de son annonce d'origine (relevé de veille eBay : liste + détails).
CREATE OR REPLACE FUNCTION public.demander_lecture_origine(p_fiche bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_user uuid := auth.uid();
  v_origine text; v_pf text; v_id uuid;
begin
  if v_user is null then return jsonb_build_object('ok', false, 'reason', 'unauthorized'); end if;
  select origine into v_origine from public.inventaire where id = p_fiche and user_id = v_user;
  if not found then return jsonb_build_object('ok', false, 'reason', 'introuvable'); end if;
  v_pf := case when v_origine = 'vinted_sync' then 'vinted'
               when v_origine ~ '^releve_(leboncoin|beebs|depop|ebay)$' then substring(v_origine from 8) end;
  if v_pf is null then return jsonb_build_object('ok', true, 'reason', 'sans_origine_a_lire'); end if;
  insert into public.lectures_origine_demandees (user_id, inventaire_id, plateforme)
  values (v_user, p_fiche, v_pf)
  on conflict (user_id, inventaire_id) do update
    set demandee_le = now(), faite_le = null, plateforme = excluded.plateforme
    where public.lectures_origine_demandees.faite_le is not null
       or public.lectures_origine_demandees.demandee_le < now() - interval '15 minutes';
  if v_pf = 'vinted' then
    return jsonb_build_object('ok', true, 'reason', 'lecture_par_l_extension', 'plateforme', v_pf);
  end if;
  if exists (select 1 from public.vinted_sync_runs s where s.user_id = v_user and s.kind = 'annonces'
               and s.platform = v_pf and s.status in ('queued', 'running')) then
    return jsonb_build_object('ok', true, 'reason', 'releve_deja_en_file', 'plateforme', v_pf);
  end if;
  if exists (select 1 from public.vinted_sync_runs s where s.user_id = v_user and s.kind = 'annonces'
               and s.platform = v_pf and s.declencheur = 'serveur:lecture_origine'
               and coalesce(s.queued_at, s.started_at) > now() - interval '15 minutes') then
    return jsonb_build_object('ok', true, 'reason', 'releve_recent', 'plateforme', v_pf);
  end if;
  begin
    insert into public.vinted_sync_runs (user_id, kind, platform, status, declencheur, queued_at)
    values (v_user, 'annonces', v_pf, 'queued', 'serveur:lecture_origine', now())
    returning id into v_id;
  exception when others then
    return jsonb_build_object('ok', true, 'reason', 'releve_non_pose', 'detail', left(sqlerrm, 200), 'plateforme', v_pf);
  end;
  return jsonb_build_object('ok', true, 'reason', case when v_id is null then 'releve_non_pose' else 'releve_demande' end,
                            'plateforme', v_pf, 'run_id', v_id);
end $function$;

COMMIT;
