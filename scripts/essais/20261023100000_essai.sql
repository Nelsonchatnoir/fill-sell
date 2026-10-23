-- Essai à blanc de 20261023100000_photos_origine_toutes : ROLLBACK. Généré par 20261023100000_generer.sh.
begin;
set local statement_timeout = '120s';
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

-- Tests de 20261023100000_photos_origine_toutes (assemblés par 20261023100000_generer.sh, transaction annulée).
create temp table _r (essai text, ok boolean, detail text);
grant all on _r to public;
do $$
declare
  thierry uuid := 'c2175e91-3854-4a66-8388-e28810166a3e';
  r jsonb; n integer; ok boolean; rec record; v_ann record; v_av jsonb; v_id bigint;
begin
  -- A. La clé d'une image eBay, sous ses trois formes
  insert into _r values ('A1 clé eBay : vignette 140 px et grande taille = même clé',
    public.ebay_cle_image('https://i.ebayimg.com/images/g/QVgAAeSwd4xqonZY/s-l140.jpg') = 'QVgAAeSwd4xqonZY'
    and public.ebay_cle_image('https://i.ebayimg.com/images/g/QVgAAeSwd4xqonZY/s-l1600.jpg') = 'QVgAAeSwd4xqonZY', null);
  insert into _r values ('A2 clé eBay : forme $_1.JPG (Trading)',
    public.ebay_cle_image('https://i.ebayimg.com/00/s/NTEyWDUwOQ==/z/Jk8AAeSwJDpq2a78/$_1.JPG?set_id=8800005007') = 'Jk8AAeSwJDpq2a78', null);
  insert into _r values ('A3 clé eBay : une adresse qui n''est pas eBay → aucune clé',
    public.ebay_cle_image('https://tojihnuawsoohlolangc.supabase.co/storage/v1/object/public/listing-photos/x/rehosted/1/2_0.jpg') is null, null);

  -- B. La photo d'une fiche est-elle la vignette (ou sa copie) ?
  insert into _r values ('B1 copie rehosted/<fiche> d''une fiche née d''un relevé = vignette',
    public.photo_est_vignette_de_fiche(1792745533806, 'releve_ebay',
      'https://x.supabase.co/storage/v1/object/public/listing-photos/u/rehosted/1792745533806/1792747072642_0.jpg', 'https://i.ebayimg.com/images/g/QVgAAeSwd4xqonZY/s-l140.jpg', null), null);
  insert into _r values ('B2 copie rehosted d''une AUTRE fiche ≠ vignette',
    not coalesce(public.photo_est_vignette_de_fiche(1792745533806, 'releve_ebay',
      'https://x.supabase.co/storage/v1/object/public/listing-photos/u/rehosted/1792745533999/1_0.jpg', 'https://i.ebayimg.com/images/g/QVgAAeSwd4xqonZY/s-l140.jpg', null), false), null);
  insert into _r values ('B3 photo retouchée (enhanced) ≠ vignette',
    not coalesce(public.photo_est_vignette_de_fiche(1792745534214, 'releve_ebay',
      'https://x.supabase.co/storage/v1/object/public/listing-photos/u/enhanced/1792746017692_0.png', 'https://i.ebayimg.com/images/g/abcdefgh/s-l140.jpg', null), false), null);
  insert into _r values ('B4 rehosted d''une fiche écrite dans FillSell (pas un relevé) ≠ vignette',
    not coalesce(public.photo_est_vignette_de_fiche(1792745533806, null,
      'https://x.supabase.co/storage/v1/object/public/listing-photos/u/rehosted/1792745533806/1_0.jpg', 'https://i.ebayimg.com/images/g/QVgAAeSwd4xqonZY/s-l140.jpg', null), false), null);
  insert into _r values ('B5 même image eBay en grande taille = vignette',
    public.photo_est_vignette_de_fiche(1, 'releve_ebay', 'https://i.ebayimg.com/images/g/QVgAAeSwd4xqonZY/s-l1600.jpg',
      'https://i.ebayimg.com/images/g/QVgAAeSwd4xqonZY/s-l140.jpg', null), null);
  insert into _r values ('B6 une autre image eBay ≠ vignette',
    not coalesce(public.photo_est_vignette_de_fiche(1, 'releve_ebay', 'https://i.ebayimg.com/images/g/ZZZZAAeSwd4xqonZ/s-l1600.jpg',
      'https://i.ebayimg.com/images/g/QVgAAeSwd4xqonZY/s-l140.jpg', 'https://i.ebayimg.com/images/g/QVgAAeSwd4xqonZY/s-l1600.jpg'), false), null);

  -- C. Une fiche de Thierry restée à 1 photo (copie rehosted, au format {url}) alors que son détail eBay en porte 2
  select a.photo_url, a.donnees_index into v_ann from annonces_plateforme a where a.inventaire_id = 1792745533806 and a.platform = 'ebay';
  select photos into v_av from inventaire where id = 1792745533806;
  ok := public.fiche_completer_photos_capture(1792745533806, v_ann.photo_url, v_ann.donnees_index);
  select * into rec from inventaire where id = 1792745533806;
  insert into _r values ('C1 fiche 1792745533806 : complétée (copie rehosted au format {url})', ok and jsonb_array_length(rec.photos) = jsonb_array_length(v_ann.donnees_index -> 'photos') and rec.photos_a_rapatrier,
    jsonb_array_length(v_av)::text || ' → ' || jsonb_array_length(rec.photos)::text);
  insert into _r values ('C2 dans l''ordre de l''annonce (avers puis revers)', rec.photos -> 0 = v_ann.donnees_index -> 'photos' -> 0 and rec.photos -> 1 = v_ann.donnees_index -> 'photos' -> 1, rec.photos::text);
  select count(*) into n from inventaire_journal where inventaire_id = 1792745533806 and champ = 'photos' and motif = 'photos_origine_completees';
  insert into _r values ('C3 tracé au journal de la fiche', n = 1, n::text);
  ok := public.fiche_completer_photos_capture(1792745533806, v_ann.photo_url, v_ann.donnees_index);
  insert into _r values ('C4 rejouée : rien (la fiche a déjà ses photos)', not ok, null);

  -- D. Jamais au-dessus d'une fiche qui a déjà 2 photos, ni d'une photo retouchée
  select i.id into v_id from annonces_plateforme a join inventaire i on i.id = a.inventaire_id
   where i.user_id = thierry and a.platform = 'ebay' and jsonb_array_length(i.photos) = 2 limit 1;
  ok := public.fiche_completer_photos_capture(v_id, 'https://i.ebayimg.com/images/g/AAAAAAAAAA/s-l140.jpg',
          jsonb_build_object('photos', jsonb_build_array('https://i.ebayimg.com/images/g/AAAAAAAAAA/s-l1600.jpg', 'https://i.ebayimg.com/images/g/BBBBBBBBBB/s-l1600.jpg', 'https://i.ebayimg.com/images/g/CCCCCCCCCC/s-l1600.jpg')));
  insert into _r values ('D1 fiche à 2 photos : jamais touchée', not ok, v_id::text);
  ok := public.fiche_completer_photos_capture(1792745534214, 'https://i.ebayimg.com/images/g/AAAAAAAAAA/s-l140.jpg',
          jsonb_build_object('photos', jsonb_build_array('https://i.ebayimg.com/images/g/AAAAAAAAAA/s-l1600.jpg', 'https://i.ebayimg.com/images/g/BBBBBBBBBB/s-l1600.jpg')));
  insert into _r values ('D2 fiche à photo retouchée (enhanced) : jamais touchée', not ok, null);
  ok := public.fiche_completer_photos_capture(1792745533806, null, jsonb_build_object('photos', jsonb_build_array('https://a/1.jpg')));
  insert into _r values ('D3 une seule photo à l''origine : rien', not ok, null);

  -- E. Doublons retirés, ordre gardé
  update inventaire set photos = jsonb_build_array('https://i.ebayimg.com/images/g/ikcAAeSwCNFqomp7/s-l140.jpg') where id = 1792745533317;
  ok := public.fiche_completer_photos_capture(1792745533317, 'https://i.ebayimg.com/images/g/ikcAAeSwCNFqomp7/s-l140.jpg',
          jsonb_build_object('photos', jsonb_build_array('https://i.ebayimg.com/images/g/ikcAAeSwCNFqomp7/s-l1600.jpg', 'https://i.ebayimg.com/images/g/eIMAAeSw4T1qomqC/s-l1600.jpg', 'https://i.ebayimg.com/images/g/ikcAAeSwCNFqomp7/s-l1600.jpg')));
  select * into rec from inventaire where id = 1792745533317;
  insert into _r values ('E1 doublon de l''annonce retiré, ordre gardé', ok and jsonb_array_length(rec.photos) = 2 and rec.photos ->> 0 like '%ikcAAeSwCNFqomp7/s-l1600%', rec.photos::text);

  -- F. Le fournisseur de contenu dit la lecture du détail eBay et le nombre de photos de l'origine
  select * into rec from public.fiches_contenu_vendeur(thierry, array[1792745533806]::bigint[]);
  insert into _r values ('F1 annonces : detail_le et photos_origine (2)', (rec.annonces -> 0 ->> 'detail_le') is not null and (rec.annonces -> 0 ->> 'photos_origine')::int = 2, rec.annonces::text);
  insert into _r values ('F2 photos_lues_le : la complétion (C1) compte', rec.photos_lues_le >= now() - interval '1 minute', coalesce(rec.photos_lues_le::text, 'null'));
  select i.id into v_id from inventaire i join annonces_plateforme a on a.inventaire_id = i.id
   where i.user_id = thierry and a.platform = 'ebay' and a.donnees_index_le is null limit 1;
  select * into rec from public.fiches_contenu_vendeur(thierry, array[v_id]::bigint[]);
  insert into _r values ('F3 fiche eBay jamais lue : detail_le vide, photos_origine vide', (rec.annonces -> 0 ->> 'detail_le') is null and (rec.annonces -> 0 ->> 'photos_origine') is null, rec.annonces::text);

  -- G. Une fiche eBay demande sa lecture (relevé de veille eBay)
  perform set_config('request.jwt.claims', json_build_object('sub', thierry, 'role', 'authenticated')::text, true);
  r := public.demander_lecture_origine(1792745533806);
  insert into _r values ('G1 fiche eBay : lecture demandée (relevé eBay)', r ->> 'plateforme' = 'ebay' and r ->> 'reason' in ('releve_demande', 'releve_deja_en_file', 'releve_recent'), r::text);
  r := public.demander_lecture_origine((select id from inventaire where user_id = thierry and origine = 'vinted_sync' limit 1));
  insert into _r values ('G2 fiche Vinted : inchangé (l''extension)', r ->> 'reason' = 'lecture_par_l_extension', r::text);
  r := public.demander_lecture_origine(1792497207175);   -- fiche d'un AUTRE compte (Louis)
  insert into _r values ('G3 fiche d''un autre compte : introuvable', r ->> 'reason' = 'introuvable', r::text);
  perform set_config('request.jwt.claims', '', true);
end $$;
select essai, ok, left(coalesce(detail, ''), 160) detail from _r order by essai;
select count(*) filter (where ok) || ' / ' || count(*) as bilan from _r;
rollback;
