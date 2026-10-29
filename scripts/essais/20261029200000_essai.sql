-- Essai à blanc de 20261029200000_beebs_un_seul_juge_jamais_en_ligne : ROLLBACK. Généré par 20261029200000_generer.sh.
begin;
set local statement_timeout = '120s';
-- Essai de 20261029200000 (29/10, lot B 4.5/4.9) — partie AVANT la migration, assemblée par 20261029200000_generer.sh
-- (transaction annulée). Les trois dépôts « fantômes » du 4.5 et Polly sont remis tels que la seconde boucle de
-- trancher_publications_sans_lien les lit (publiés, jamais vus en ligne, sans verdict), puis jugés par la fonction DE LA
-- PROD sur le dernier relevé probant de leur compte : le verdict est gardé (sous-bloc annulé par une exception), pour le
-- comparer à celui de la nouvelle règle.
create temp table _r (essai text, ok boolean, detail text);
grant all on _r to public;
create temp table _cas (id uuid, user_id uuid, numero text, nom text);
insert into _cas values
  ('abd12bb5-2899-4bd2-a394-02dc6763f3cc', 'de63ca45-63d9-4a3c-b65a-d1345acd8b2e', '34198358', 'XEWER abd12bb5 34198358'),
  ('22362f3a-86fe-4eb3-a986-ef4569f6d89f', '447d920c-976a-4d8f-aff4-a2998050358c', '34200634', 'louis-seller 22362f3a 34200634'),
  ('ef037533-8fc0-4997-b436-3c562f3256a5', '447d920c-976a-4d8f-aff4-a2998050358c', '34200711', 'louis-seller ef037533 34200711'),
  ('4cdadbc1-886e-4af1-a40c-37bfa2f805ff', '447d920c-976a-4d8f-aff4-a2998050358c', '34206489', 'louis-seller Polly 4cdadbc1 34206489');
create temp table _runs (user_id uuid, run uuid, debut timestamptz);
insert into _runs
  select distinct on (r.user_id) r.user_id, r.id, r.started_at
    from public.vinted_sync_runs r
   where r.user_id in (select user_id from _cas) and r.platform = 'beebs' and r.kind = 'annonces'
     and r.started_at > now() - interval '3 days' and public.releve_preuve_absence(r.id)
   order by r.user_id, r.started_at desc;
create temp table _avant (v jsonb);
create temp table _bilans (quand text, user_id uuid, bilan jsonb);

-- Les quatre dépôts, remis « publiés » sans verdict (le marqueur « pas encore visible » de Polly, posé par
-- handler-watch le 20/10, reste : c'est lui qui date sa sortie de vérification).
update public.cross_post_jobs c set status = 'published', error = null,
       platform_fields = coalesce(c.platform_fields, '{}'::jsonb)
         - array['depot_jamais_en_ligne', 'unavailable_since', 'sale_signal', 'unavailable_pending_since',
                 'removed_by_user', 'pending_removal', 'retrait_arme', 'constat_en_ligne_2810']
 where c.id in (select id from _cas);

-- La règle d'AVANT (prod) : verdicts gardés, écritures annulées (sous-bloc défait par l'exception).
do $avant$
declare c record; v text; b jsonb := '[]'::jsonb;
begin
  begin
    for c in select * from _runs loop
      b := b || jsonb_build_array(jsonb_build_object('user', c.user_id,
             'bilan', public.trancher_publications_sans_lien(c.user_id, 'beebs', c.run)));
    end loop;
    select jsonb_build_object('bilans', b, 'cas', jsonb_agg(jsonb_build_object('id', j.id, 'status', j.status,
             'error', left(j.error, 200), 'issue', j.platform_fields #>> '{depot_jamais_en_ligne,issue}'))) ::text
      into v from public.cross_post_jobs j where j.id in (select id from _cas);
    raise exception using message = v, errcode = 'P0001';
  exception when sqlstate 'P0001' then
    insert into _avant values (sqlerrm::jsonb);
  end;
end
$avant$;
-- 20261029200000 — (29/10, lot B 4.5/4.9) BEEBS : UN SEUL JUGE « JAMAIS MISE EN LIGNE » ; LE MESSAGE VRAI, DATÉ.
-- ⛔ NON APPLIQUÉE. À appliquer seulement sur feu vert NOMMÉ de Nico, après l'essai à blanc :
--   npx supabase db query --linked -f supabase/migrations/20261029200000_beebs_un_seul_juge_jamais_en_ligne.sql
--   npx supabase migration repair --linked --status applied 20261029200000
-- Inverse : supabase/rollbacks/20261029200000_beebs_un_seul_juge_jamais_en_ligne_INVERSE.sql (rend le corps lu en prod,
-- md5 relu). Essai : scripts/essais/20261029200000_essai.sql (20261029200000_generer.sh : migration + tests, ROLLBACK).
--
-- CONSTAT (enquête du 29/10) : deux juges disaient « Beebs n'a jamais mis cette annonce en ligne ».
--   · handler-watch (_shared/beebs-sortie-verification.js) exige une lecture qui voit TOUT « en ligne » par la PAGE —
--     jamais pour un compte de plus de 60 annonces (la page n'en montre que 60) ;
--   · trancher_publications_sans_lien (seconde boucle, p_platform <> 'vinted') passait par releve_preuve_absence, qui
--     accepte un relevé dont total_entries est le compteur de l'INDEX public, en retard sur les annonces neuves.
--   louis-seller 22362f3a (34200634) et ef037533 (34200711) le 20/10, XEWER abd12bb5 (34198358) le 19/10 : ARRIVÉS chez
--   Beebs (preuve_identifiant_beebs, mes_annonces_avant_apres), sortis de vérification sans mise en ligne, jugés ici.
--   Précédent : Polly 34206489 (louis-seller), « jamais en ligne » le 24/10 sur deux relevés fondés sur l'index, EN LIGNE
--   le 28/10 à 22:03 (constat_en_ligne_2810).
-- RÈGLE (R1) : la seconde boucle ne conclut un dépôt Beebs (« failed », ou clos « en ligne ailleurs ») que sur l'une des
-- deux preuves du juge JS, lues par beebs_preuve_jamais_en_ligne :
--   1. CE relevé a vu TOUT « en ligne » par la PAGE (releve_beebs_voit_tout_en_ligne : nombre lu par la page ≥ compteur
--      de l'index, ou « [flux] en ligne X/Y » avec X ≥ Y — miroir de releveVoitToutEnLigne) ;
--   2. deux constats « page 404 » de l'extension sur le numéro EXACT (fiche absente, « en vérification » lue en entier),
--      à 6 h d'écart au moins (beebs_404_constats du dépôt ou de ses retraits, même compte) ;
--   le relevé, ou le dernier constat, 7 jours au moins après la dernière vue « en vérification » ; jamais une annonce vue
--   « en ligne » par une lecture « Mes annonces » ; jamais à 500 € ou plus (Beebs les examine invisibles).
--   Sinon : platform_fields.pas_encore_visible (règle beebs_sans_preuve_de_refus_2910), posé UNE fois — jamais « refusée ».
-- MESSAGE (R3) : « Beebs a reçu ton annonce (n° …, en vérification à HHhMM le JJ/MM), puis l'a retirée de sa vérification
--   sans la mettre en ligne (elle n'y était plus à HHhMM le JJ/MM) ; Beebs ne dit pas pourquoi. » + la preuve datée (heure
--   de Paris) — le même texte que messageRefusVerificationBeebs (beebs_message_jamais_en_ligne). Deux heures constatées,
--   jamais une durée ni une heure promise (règle du 16/10, selftest aucune-estimation).
-- Inchangé : la première boucle (Beebs n'y est jamais jugé), Leboncoin, eBay, Depop, Opla (texte à l'octet près), la
-- refermeture (depot_jamais_en_ligne_refermer), les quotas (rendus seulement sur un refus prouvé).
-- CPU : 25 dépôts par relevé au plus (inchangé) ; par dépôt Beebs, deux lectures bornées des jobs du compte depuis le
-- dépôt (index cross_post_jobs_user_created_idx), une lecture du relevé par sa clé. Mesure dans l'essai.
-- trancher_publications_sans_lien : corps repris de pg_get_functiondef EN PROD le 29/10 (md5
-- 6ea3fdf30588cf009c3bf3ba50ec1058, 23 751 caractères) ; six ajouts, rien d'autre.


-- La définition lue le 29/10 doit être encore celle de la prod : sinon, rien n'est remplacé (régénérer depuis la prod).
DO $garde$
BEGIN
  IF md5(pg_get_functiondef('public.trancher_publications_sans_lien(uuid,text,uuid)'::regprocedure)) <> '6ea3fdf30588cf009c3bf3ba50ec1058' THEN
    RAISE EXCEPTION 'trancher_publications_sans_lien a changé en prod depuis sa lecture du 29/10 : régénérer 20261029200000 depuis pg_get_functiondef';
  END IF;
END
$garde$;

-- ── 1. Miroir SQL de releveVoitToutEnLigne (_shared/beebs-sortie-verification.js) ─────────────────────────────────────
-- Un relevé Beebs complet (releveComplet : done, total connu, items_vus ≥ total, jamais « [incomplet] », fini) dont la
-- PAGE « en ligne » a montré toutes les annonces : « [flux] en ligne X/Y » avec X ≥ Y > 0 ; sinon « page : N annonce(s)
-- affichée(s) » (la première) et « index public Beebs : T annonce(s) en ligne » avec N ≥ T.
CREATE OR REPLACE FUNCTION public.releve_beebs_voit_tout_en_ligne(p_run uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  r vinted_sync_runs%ROWTYPE;
  e text;
  v_flux text[];
  v_page integer;
  v_index integer;
BEGIN
  SELECT * INTO r FROM vinted_sync_runs WHERE id = p_run;
  IF r.id IS NULL OR r.platform <> 'beebs' OR r.kind <> 'annonces' OR r.status <> 'done' OR r.finished_at IS NULL
     OR r.total_entries IS NULL OR r.total_entries < 0 OR COALESCE(r.items_vus, -1) < r.total_entries
     OR COALESCE(r.erreur, '') ~* '\[incomplet\]' THEN
    RETURN false;
  END IF;
  e := COALESCE(r.erreur, '');
  v_flux := regexp_match(e, '\[flux\] en ligne (\d+)/(\d+)');
  IF v_flux IS NOT NULL THEN
    RETURN v_flux[1]::integer >= v_flux[2]::integer AND v_flux[2]::integer > 0;
  END IF;
  v_page := (regexp_match(e, 'page : (\d+) annonce\(s\) affichée\(s\)'))[1]::integer;
  v_index := (regexp_match(e, 'index public Beebs : (\d+) annonce\(s\) en ligne'))[1]::integer;
  RETURN v_page IS NOT NULL AND v_index IS NOT NULL AND v_page >= v_index;
END
$function$;

-- ── 2. La preuve qu'un dépôt Beebs n'a jamais été mis en ligne — ou NULL (rien n'est conclu) ──────────────────────────
-- Les mêmes preuves que jugerSortieVerificationBeebs (handler-watch) : la page qui voit tout, ou deux constats 404.
-- Rend { source: 'releve' | 'constats_404', numero, le, premier?, n?, releve?, page?, index?, vu_en_verification_le,
-- derniere_vue, sortie_constatee_le } — ce que dit le message (beebs_message_jamais_en_ligne).
CREATE OR REPLACE FUNCTION public.beebs_preuve_jamais_en_ligne(p_user uuid, p_numero text, p_publie timestamp with time zone, p_prix numeric, p_pf jsonb, p_run uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_vu timestamptz;
  v_derniere timestamptz;
  v_vue_en_ligne boolean;
  v_sortie timestamptz;
  v_run vinted_sync_runs%ROWTYPE;
  v_c1 timestamptz;
  v_c2 timestamptz;
  v_cn integer;
BEGIN
  IF p_user IS NULL OR p_publie IS NULL OR COALESCE(p_numero, '') !~ '^[0-9]{6,}$' THEN RETURN NULL; END IF;
  -- Beebs examine les annonces chères dans un état invisible, jusqu'à deux jours et plus (PRIX_EXAMEN_INVISIBLE_BEEBS) :
  -- jamais jugées ici, comme en JS.
  IF p_prix IS NULL OR p_prix <= 0 OR p_prix >= 500 THEN RETURN NULL; END IF;
  -- Les lectures « Mes annonces » portées par les dépôts Beebs du compte (preuve_identifiant_beebs, avant et après) qui
  -- portent CE numéro : vue « en ligne » une fois = jamais rien ; la première et la dernière vue « en vérification ».
  SELECT min(l.le) FILTER (WHERE l.page = 'en_verification'), max(l.le) FILTER (WHERE l.page = 'en_verification'),
         COALESCE(bool_or(l.page = 'en_ligne'), false)
    INTO v_vu, v_derniere, v_vue_en_ligne
    FROM (SELECT _ts_ou_null(x.l ->> 'lu_le') AS le, pg.p ->> 'page' AS page
            FROM cross_post_jobs o
            CROSS JOIN LATERAL (VALUES (o.platform_fields #> '{preuve_identifiant_beebs,avant}'),
                                       (o.platform_fields #> '{preuve_identifiant_beebs,apres}')) x(l)
            CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(x.l -> 'pages') = 'array' THEN x.l -> 'pages'
                                                         ELSE '[]'::jsonb END) pg(p)
           WHERE o.user_id = p_user AND o.created_at >= p_publie - interval '1 day'
             AND o.platform = 'beebs' AND o.action IN ('publish', 'republish')
             AND o.platform_fields ? 'preuve_identifiant_beebs'
             AND pg.p ->> 'ok' = 'true' AND jsonb_typeof(pg.p -> 'ids') = 'array'
             AND (pg.p -> 'ids') ? p_numero) l
   WHERE l.le IS NOT NULL;
  IF v_vue_en_ligne THEN RETURN NULL; END IF;
  v_derniere := greatest(COALESCE(v_derniere, p_publie), p_publie);
  -- La sortie constatée par le juge de handler-watch (même numéro), quand il l'a posée.
  IF p_pf #>> '{pas_encore_visible,numero}' = p_numero THEN
    v_sortie := _ts_ou_null(p_pf #>> '{pas_encore_visible,sortie_constatee_le}');
  END IF;

  -- 1. CE relevé a vu TOUT « en ligne » par la page, 7 jours au moins après la dernière vue en vérification.
  SELECT * INTO v_run FROM vinted_sync_runs WHERE id = p_run AND user_id = p_user;
  IF v_run.id IS NOT NULL AND v_run.started_at >= v_derniere + interval '7 days' AND releve_beebs_voit_tout_en_ligne(p_run) THEN
    RETURN jsonb_build_object('source', 'releve', 'numero', p_numero, 'le', v_run.started_at, 'releve', p_run,
      'page', (regexp_match(COALESCE(v_run.erreur, ''), 'page : (\d+) annonce\(s\) affichée\(s\)'))[1]::integer,
      'index', (regexp_match(COALESCE(v_run.erreur, ''), 'index public Beebs : (\d+) annonce\(s\) en ligne'))[1]::integer,
      'vu_en_verification_le', v_vu, 'derniere_vue', v_derniere, 'sortie_constatee_le', v_sortie);
  END IF;

  -- 2. Deux constats « page 404 » de l'extension (constats404Beebs : 404, sans fiche, « en vérification » lue en entier)
  --    sur le numéro EXACT, après la dernière vue, à 6 h d'écart, le dernier 7 jours au moins après elle.
  SELECT min(c.le), max(c.le), count(*) INTO v_c1, v_c2, v_cn
    FROM (SELECT _ts_ou_null(e ->> 'le') AS le
            FROM cross_post_jobs o
            CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(o.platform_fields -> 'beebs_404_constats') = 'array'
                                                         THEN o.platform_fields -> 'beebs_404_constats' ELSE '[]'::jsonb END) e
           WHERE o.user_id = p_user AND o.created_at >= p_publie - interval '1 day'
             AND o.platform = 'beebs' AND o.platform_fields ? 'beebs_404_constats'
             AND (btrim(COALESCE(o.platform_listing_id, '')) = p_numero OR annonce_id_job('beebs', o.listing_url) = p_numero)
             AND e -> 'page_http' = '404'::jsonb AND e -> 'produit' = 'false'::jsonb
             AND e ->> 'en_verification' = 'complete') c
   WHERE c.le > v_derniere;
  IF v_cn >= 2 AND v_c2 - v_c1 >= interval '6 hours' AND v_c2 >= v_derniere + interval '7 days' THEN
    RETURN jsonb_build_object('source', 'constats_404', 'numero', p_numero, 'le', v_c2, 'premier', v_c1, 'n', v_cn,
      'vu_en_verification_le', v_vu, 'derniere_vue', v_derniere, 'sortie_constatee_le', v_sortie);
  END IF;
  RETURN NULL;
END
$function$;

-- ── 3. Le message vrai, daté (R3) — le même texte que messageRefusVerificationBeebs ──────────────────────────────────
-- « Beebs a reçu ton annonce (n° …, en vérification à HHhMM le JJ/MM), puis l'a retirée de sa vérification sans la
-- mettre en ligne (elle n'y était plus à HHhMM le JJ/MM) ; Beebs ne dit pas pourquoi. » + la preuve datée + (SQL
-- seulement) la photo en double + rien en ligne, rien vendu, publication rendue. Heure de Paris ; deux heures constatées,
-- jamais une durée ni une heure promise.
CREATE OR REPLACE FUNCTION public.beebs_message_jamais_en_ligne(p_preuve jsonb, p_republication boolean DEFAULT false, p_doublon text DEFAULT NULL::text)
 RETURNS text
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_vu timestamptz := _ts_ou_null(p_preuve ->> 'vu_en_verification_le');
  v_sortie timestamptz := _ts_ou_null(p_preuve ->> 'sortie_constatee_le');
  v_le timestamptz := _ts_ou_null(p_preuve ->> 'le');
  v_premier timestamptz := _ts_ou_null(p_preuve ->> 'premier');
  v_preuve_txt text := '';
  v_fin text := ' : Beebs n''a jamais mis cette annonce en ligne.';
BEGIN
  IF v_le IS NOT NULL THEN
    v_preuve_txt := CASE p_preuve ->> 'source'
      WHEN 'releve' THEN ' Le relevé fait à ' || to_char(v_le AT TIME ZONE 'Europe/Paris', 'HH24"h"MI" le "DD/MM')
        || ', qui a lu toutes tes annonces en ligne, ne la montre pas' || v_fin
      WHEN 'mes_annonces' THEN ' Tes annonces en ligne, lues en entier à ' || to_char(v_le AT TIME ZONE 'Europe/Paris', 'HH24"h"MI" le "DD/MM')
        || ', ne la montrent pas' || v_fin
      WHEN 'constats_404' THEN ' Sa page est introuvable (404) à ' || to_char(COALESCE(v_premier, v_le) AT TIME ZONE 'Europe/Paris', 'HH24"h"MI" le "DD/MM')
        || ' et encore à ' || to_char(v_le AT TIME ZONE 'Europe/Paris', 'HH24"h"MI" le "DD/MM')
        || ', et elle n''est plus dans tes annonces en vérification' || v_fin
      ELSE '' END;
  END IF;
  RETURN 'Beebs a reçu ' || CASE WHEN p_republication THEN 'ta nouvelle annonce' ELSE 'ton annonce' END
    || ' (n° ' || COALESCE(p_preuve ->> 'numero', '')
    || CASE WHEN v_vu IS NOT NULL THEN ', en vérification à ' || to_char(v_vu AT TIME ZONE 'Europe/Paris', 'HH24"h"MI" le "DD/MM') ELSE '' END
    || '), puis l''a retirée de sa vérification sans la mettre en ligne'
    || CASE WHEN v_sortie IS NOT NULL AND (v_vu IS NULL OR v_sortie >= v_vu)
         THEN ' (elle n''y était plus à ' || to_char(v_sortie AT TIME ZONE 'Europe/Paris', 'HH24"h"MI" le "DD/MM') || ')' ELSE '' END
    || ' ; Beebs ne dit pas pourquoi.'
    || v_preuve_txt
    || CASE WHEN NULLIF(btrim(COALESCE(p_doublon, '')), '') IS NOT NULL
         THEN ' Elle porte la même photo que ton annonce ' || btrim(p_doublon) || ', déjà en ligne sur Beebs.' ELSE '' END
    || CASE WHEN p_republication
         THEN ' L''ancienne annonce avait été retirée : ton article n''est plus en ligne sur Beebs. Rien n''est vendu, ton article reste dans ton stock, et cette republication ne compte pas dans tes limites.'
         ELSE ' Rien n''est en ligne, rien n''est vendu : ton article reste dans ton stock, et cette publication ne compte pas dans tes limites.' END
    || ' Pour la reproposer, change d''abord ce que Beebs a pu refuser (photos, titre, description, rayon).';
END
$function$;

-- Droits : serveur seulement (appelées par trancher_publications_sans_lien, SECURITY DEFINER).
REVOKE ALL ON FUNCTION public.releve_beebs_voit_tout_en_ligne(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.beebs_preuve_jamais_en_ligne(uuid, text, timestamp with time zone, numeric, jsonb, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.beebs_message_jamais_en_ligne(jsonb, boolean, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.releve_beebs_voit_tout_en_ligne(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.beebs_preuve_jamais_en_ligne(uuid, text, timestamp with time zone, numeric, jsonb, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.beebs_message_jamais_en_ligne(jsonb, boolean, text) TO service_role;

-- ── 4. trancher_publications_sans_lien : corps de la PROD (29/10) + le juge Beebs unique et son message ──────────────
CREATE OR REPLACE FUNCTION public.trancher_publications_sans_lien(p_user uuid, p_platform text, p_run_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_run vinted_sync_runs%ROWTYPE;
  v_precedent vinted_sync_runs%ROWTYPE;
  j record;
  v_ids text[];
  v_url text;
  v_refund jsonb;
  v_nom text;
  v_msg text;
  v_releve_txt text;
  n_refusees integer := 0; n_en_ligne integer := 0; n_attente integer := 0;
  v_vivante record; v_doublon record;
  v_jum_id text;
  v_grace interval;
  n_jumelle integer := 0; n_jamais_vues integer := 0; n_visibles integer := 0;
  v_refermees jsonb := NULL;
  -- (29/10, lot B 4.5/4.9) Beebs : la preuve du refus (beebs_preuve_jamais_en_ligne), son numéro, les dépôts sans preuve.
  v_preuve jsonb; v_num text; n_beebs_sans_preuve integer := 0;
BEGIN
  IF p_user IS NULL OR p_platform IS NULL OR p_run_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'arguments');
  END IF;
  SELECT * INTO v_run FROM vinted_sync_runs
   WHERE id = p_run_id AND user_id = p_user AND kind = 'annonces' AND platform = p_platform;
  IF v_run.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'run_introuvable'); END IF;
  -- (20/10) « PAS ENCORE VISIBLE » LEVÉ PAR LE RELEVÉ : une annonce que le relevé de CE compte voit en ligne (ou
  -- vendue) n'est plus « pas encore visible » — le marqueur posé par cross_post_jobs_vue_ou_pas_encore_visible
  -- s'efface. Bornée aux jobs qui le portent ; aucune autre ligne réécrite.
  UPDATE cross_post_jobs c SET platform_fields = c.platform_fields - 'pas_encore_visible'
   WHERE c.user_id = p_user AND c.platform = p_platform AND c.platform_fields ? 'pas_encore_visible'
     AND EXISTS (SELECT 1 FROM annonces_plateforme ap
                  WHERE ap.user_id = p_user AND ap.platform = p_platform AND ap.statut_plateforme IN ('en_ligne', 'vendue')
                    AND ap.listing_id IN (btrim(c.platform_listing_id), annonce_id_job(p_platform, c.listing_url)));
  GET DIAGNOSTICS n_visibles = ROW_COUNT;
  -- (27/10, GTA de BONCOIN) UNE LIGNE « JAMAIS MISE EN LIGNE » DONT L'ARTICLE EST RETROUVÉ EN LIGNE SE REFERME :
  -- même numéro (le dépôt lui-même), ou une autre annonce de la MÊME fiche sur la MÊME plateforme, vue en ligne
  -- par un relevé de ce compte (depot_jamais_en_ligne_refermer). Le déclencheur des annonces la referme dès le
  -- rattachement ; cette passe, à chaque relevé, rattrape ce qu'il n'aurait pas vu. Jamais sur un titre.
  BEGIN
    v_refermees := depot_jamais_en_ligne_refermer(p_user, p_platform, NULL, NULL, p_run_id);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'trancher_publications_sans_lien : refermeture (%, %) : %', p_user, p_platform, SQLERRM;
  END;

  IF NOT releve_preuve_absence(p_run_id) THEN
    RETURN jsonb_build_object('ok',true,'reason','releve_non_probant','refusees',0,'en_ligne',0,'en_attente',0);
  END IF;
  SELECT s.* INTO v_precedent FROM (
    SELECT * FROM vinted_sync_runs WHERE user_id=p_user AND started_at<v_run.started_at
    ORDER BY started_at DESC LIMIT 50
  ) s WHERE s.platform=p_platform AND s.kind='annonces'
    AND s.vinted_user_id IS NOT DISTINCT FROM v_run.vinted_user_id
    AND s.finished_at<=v_run.started_at AND s.started_at<=v_run.started_at-interval '5 minutes'
    AND releve_preuve_absence(s.id)
  ORDER BY s.started_at DESC LIMIT 1;
  v_nom := CASE p_platform WHEN 'leboncoin' THEN 'Leboncoin' WHEN 'beebs' THEN 'Beebs' WHEN 'ebay' THEN 'eBay' WHEN 'opla' THEN 'Opla' WHEN 'depop' THEN 'Depop' ELSE p_platform END;
  v_releve_txt := to_char(COALESCE(v_run.finished_at, v_run.started_at) AT TIME ZONE 'Europe/Paris', 'DD/MM à HH24"h"MI');

  FOR j IN
    SELECT id, platform_listing_id, platform_fields, inventaire_id, vu_en_ligne_le, COALESCE(published_at, created_at) AS publie
      FROM cross_post_jobs
     WHERE user_id = p_user AND platform = p_platform
       AND status = 'published' AND action = 'publish' AND listing_url IS NULL
     ORDER BY COALESCE(published_at, created_at)
     LIMIT 25 FOR UPDATE SKIP LOCKED
  LOOP
    v_ids := ARRAY(
      SELECT DISTINCT x FROM unnest(ARRAY[
        NULLIF(btrim(j.platform_listing_id), ''),
        NULLIF(btrim(j.platform_fields #>> '{lbc_depot,adsubmit,id}'), ''),
        NULLIF(btrim(j.platform_fields #>> '{lbc_depot,sans_adsubmit,id}'), '')
      ]) AS x WHERE x IS NOT NULL AND x ~ '^[0-9]{6,}$');
    IF COALESCE(array_length(v_ids, 1), 0) = 0 THEN n_attente := n_attente + 1; CONTINUE; END IF;

    -- EN LIGNE : l'identifiant est dans le relevé du compte, avec son lien.
    v_url := NULL;
    SELECT ap.url INTO v_url FROM annonces_plateforme ap
     WHERE ap.user_id = p_user AND ap.platform = p_platform AND ap.listing_id = ANY(v_ids)
       AND ap.url IS NOT NULL AND ap.statut_plateforme = 'en_ligne' AND ap.disparu_le IS NULL
     ORDER BY ap.vu_le DESC LIMIT 1;
    IF v_url IS NOT NULL THEN
      UPDATE cross_post_jobs SET
        listing_url = v_url,
        platform_fields = COALESCE(platform_fields, '{}'::jsonb) || jsonb_build_object(
          'lien_retrouve_par_identifiant', jsonb_build_object('le', now(), 'run_id', p_run_id, 'url', v_url, 'identifiants', to_jsonb(v_ids)))
       WHERE id = j.id;
      n_en_ligne := n_en_ligne + 1; CONTINUE;
    END IF;

    -- Présente dans un relevé sous un autre statut : ce n'est pas un refus.
    IF EXISTS (SELECT 1 FROM annonces_plateforme ap
                WHERE ap.user_id = p_user AND ap.platform = p_platform AND ap.listing_id = ANY(v_ids)) THEN
      n_attente := n_attente + 1; CONTINUE;
    END IF;

    -- BEEBS : LA MODÉRATION NE SE JUGE PAS (27/09, décision de Nico). Le lien
    -- est posé ci-dessus quand le relevé le porte ; une absence du relevé ne
    -- fait jamais dire « refusée » ni « tu peux la relancer ».
    IF p_platform = 'beebs' THEN
      n_attente := n_attente + 1; CONTINUE;
    END IF;

    -- Deux cycles complets après la grâce commune.
    IF v_precedent.id IS NULL OR v_precedent.started_at<j.publie+interval '4 hours' THEN
      n_attente:=n_attente+1; CONTINUE;
    END IF;
    -- (09/10, chantier E) UN DÉPÔT JAMAIS VU EN LIGNE N'EST JAMAIS UNE « VENTE
    -- POSSIBLE ». Depuis le 28/09 (point E), cette absence ouvrait la question
    -- « Plus en ligne — Vendue ? » : la G-Shock de Nico (3283733957), REFUSÉE
    -- par la modération Leboncoin 6 s après son dépôt, s'est retrouvée en
    -- bandeau « Vendue ? » le 08/10 ; 8 dépôts du parc ainsi depuis le 30/09.
    -- Ici l'annonce n'a JAMAIS été vue en ligne : aucun lien, jamais revue par
    -- la veille, absente de TOUT relevé (testé plus haut), absente de deux
    -- relevés complets après la grâce → ÉCHEC DE PUBLICATION, de notre côté
    -- (règle de Nico : un refus de modération est notre faute) : 'failed' avec
    -- son motif, publication rendue (refund_publish_unconfirmed, idempotent).
    -- Ni vente, ni stock touché, ni retrait, ni question.
    -- Une question « Vendue ? » déjà ouverte reste telle quelle (réparation sur GO).
    IF j.platform_fields ? 'unavailable_since' THEN
      n_attente := n_attente + 1; CONTINUE;
    END IF;
    IF j.vu_en_ligne_le IS NOT NULL THEN
      -- Vue en ligne un jour par la veille : la question d'avant tient.
      UPDATE cross_post_jobs SET platform_fields=COALESCE(platform_fields,'{}'::jsonb)
        || jsonb_build_object('sale_signal','unavailable','unavailable_since',v_run.finished_at,
          'absence_releves',jsonb_build_object('premier',v_precedent.id,'second',v_run.id,
            'identifiants',to_jsonb(v_ids),'le',now()))
        WHERE id=j.id;
      n_attente:=n_attente+1; CONTINUE;
    END IF;
    -- L'article est EN LIGNE sur cette plateforme sous une autre annonce DE LA
    -- MÊME FICHE (lien prouvé par la fiche, jamais par un titre) : ce dépôt est
    -- sans objet — clos sans rouge, sans invitation à republier un doublon.
    v_vivante := NULL;
    SELECT ap.listing_id, ap.url INTO v_vivante FROM annonces_plateforme ap
     WHERE j.inventaire_id IS NOT NULL AND ap.user_id = p_user AND ap.platform = p_platform
       AND ap.inventaire_id = j.inventaire_id AND ap.statut_plateforme = 'en_ligne' AND ap.disparu_le IS NULL
       AND ap.listing_id <> ALL(v_ids)
     ORDER BY ap.vu_le DESC LIMIT 1;
    -- Même PHOTO (empreinte identique) qu'une annonce EN LIGNE de ce compte sur
    -- cette plateforme : le doublon le plus probable du refus — dit dans le motif.
    v_doublon := NULL;
    SELECT ap.listing_id INTO v_doublon
      FROM inventaire i
      CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(i.photos::jsonb)='array' THEN i.photos::jsonb ELSE '[]'::jsonb END) ph
      JOIN photo_empreintes e1 ON e1.url = ph->>'url' AND e1.dhash IS NOT NULL
      JOIN annonces_plateforme ap ON ap.user_id = p_user AND ap.platform = p_platform
        AND ap.statut_plateforme = 'en_ligne' AND ap.disparu_le IS NULL AND ap.listing_id <> ALL(v_ids)
      JOIN photo_empreintes e2 ON e2.url = ap.photo_url AND e2.dhash = e1.dhash
     WHERE i.id = j.inventaire_id AND i.user_id = p_user
     LIMIT 1;
    IF v_vivante.listing_id IS NOT NULL THEN
      UPDATE cross_post_jobs SET status='cancelled',
        error = 'Ce dépôt n''a jamais été retrouvé dans tes annonces ' || v_nom || ', mais ton article y est en ligne sous l''annonce '
          || v_vivante.listing_id || ' : rien à refaire, rien n''est vendu.',
        platform_fields = (COALESCE(platform_fields,'{}'::jsonb) - ARRAY['sale_signal','unavailable_since','unavailable_pending_since'])
          || jsonb_build_object('depot_jamais_en_ligne', jsonb_build_object(
            'le', now(), 'premier', v_precedent.id, 'second', v_run.id, 'identifiants', to_jsonb(v_ids),
            'issue', 'article_en_ligne_ailleurs', 'annonce_en_ligne', v_vivante.listing_id))
       WHERE id = j.id AND status = 'published';
      n_attente := n_attente + 1; CONTINUE;
    END IF;
    -- (20/10, Louis) Comptes reliés sur une boutique PARTAGÉE : la fiche JUMELLE y est en ligne (vue par le relevé
    -- du compte relié) — ce dépôt était le doublon, refusé par la plateforme : clos sans rouge, rien à refaire.
    v_jum_id := NULL;
    IF j.inventaire_id IS NOT NULL
       AND EXISTS (SELECT 1 FROM fiches_liees_comptes f WHERE f.fiche_a = j.inventaire_id OR f.fiche_b = j.inventaire_id) THEN
      SELECT o.listing_id INTO v_jum_id FROM jumelle_occupe_plateformes(p_user, j.inventaire_id) o
       WHERE o.platform = p_platform AND o.statut = 'en_ligne' AND coalesce(o.listing_id, '') <> ALL(v_ids) LIMIT 1;
    END IF;
    IF v_jum_id IS NOT NULL THEN
      UPDATE cross_post_jobs SET status='cancelled',
        error = 'Ce dépôt n''a pas été mis en ligne par ' || v_nom || ' : ton article y est DÉJÀ en ligne sous l''annonce '
          || v_jum_id || ', publiée par ton compte FillSell relié — ' || v_nom || ' refuse les doublons. Rien à refaire, rien n''est vendu.',
        platform_fields = (COALESCE(platform_fields,'{}'::jsonb) - ARRAY['sale_signal','unavailable_since','unavailable_pending_since'])
          || jsonb_build_object('depot_jamais_en_ligne', jsonb_build_object(
            'le', now(), 'premier', v_precedent.id, 'second', v_run.id, 'identifiants', to_jsonb(v_ids),
            'issue', 'en_ligne_par_compte_relie', 'annonce_en_ligne', v_jum_id))
       WHERE id = j.id AND status = 'published';
      n_jumelle := n_jumelle + 1; n_attente := n_attente + 1; CONTINUE;
    END IF;
    v_refund := refund_publish_unconfirmed(j.id);
    -- (27/10) Aucune plateforme ne donne de motif ici : le texte dit l'absence constatée, jamais « refusée par sa
    -- modération » (une déduction). Un vrai motif lu au dépôt (adsubmit 4xx) a son propre texte, ailleurs.
    v_msg := 'Cette annonce est absente de tes annonces ' || v_nom || ' aux relevés complets du '
      || to_char(COALESCE(v_precedent.finished_at, v_precedent.started_at) AT TIME ZONE 'Europe/Paris', 'DD/MM à HH24"h"MI')
      || ' et du ' || v_releve_txt || ', et ' || v_nom || ' n''a donné aucun motif. '
      || CASE WHEN v_doublon.listing_id IS NOT NULL
           THEN 'Elle porte la même photo que ton annonce ' || v_doublon.listing_id || ', déjà en ligne sur ' || v_nom || '. '
           ELSE '' END
      || 'Rien n''est vendu, ton article reste dans ton stock, et cette publication ne compte pas dans tes limites.';
    UPDATE cross_post_jobs SET status = 'failed', error = v_msg,
      platform_fields = (COALESCE(platform_fields,'{}'::jsonb) - ARRAY['sale_signal','unavailable_since','unavailable_pending_since'])
        || jsonb_build_object('depot_jamais_en_ligne', jsonb_build_object(
          'le', now(), 'premier', v_precedent.id, 'second', v_run.id, 'identifiants', to_jsonb(v_ids),
          'issue', 'refus_moderation_probable', 'doublon_photo_de', v_doublon.listing_id, 'refund', v_refund))
     WHERE id = j.id AND status = 'published';
    n_refusees := n_refusees + 1;
  END LOOP;

  -- ── (20/10, Sébastien) UN DÉPÔT JAMAIS VU EN LIGNE N'EST JAMAIS UNE VENTE — AUSSI QUAND IL A UN LIEN ────────
  -- La boucle ci-dessus ne lit que les dépôts SANS lien. Un dépôt Beebs a toujours son lien (numéro → /fr/p/,
  -- déclencheur du 30/09) ; Leboncoin, eBay, Depop souvent. Jamais vu en ligne (aucun relevé de ce compte ne l'a
  -- vu, sous aucun statut ; la veille non plus), il ne pose plus la question « Plus en ligne — Vendue ? »
  -- (cross_post_jobs_vue_ou_pas_encore_visible) : il reste « pas encore visible ». Toujours absent de deux
  -- relevés complets après la grâce — 72 h pour Beebs (sa vérification est humaine), 4 h ailleurs — c'est un
  -- ÉCHEC DE PUBLICATION, traité comme celui d'au-dessus : 'failed' + motif + publication rendue, ou clos sans
  -- rouge quand l'article est en ligne ailleurs (même fiche, ou fiche jumelle d'un compte relié). Ni vente, ni
  -- stock touché, ni retrait, ni question. Vinted jamais (sa preuve est le dressing). Une question déjà ouverte
  -- reste telle quelle. Bornée : 14 derniers jours, 25 par relevé.
  IF p_platform <> 'vinted' THEN
    -- (25/10, proposition — mesure N11) Beebs : 7 jours, pas 72 h. 18 dépôts sortis de la vérification sans être en
    -- ligne le sont devenus 48 à 126 h plus tard (bd380fbf 34113827 : 67,6 h ; DeadRoz : 16 annonces à 86-126 h) ;
    -- à 7 jours, 0 faux refus sur 1 293 dépôts vus en ligne (31 jours).
    v_grace := CASE WHEN p_platform = 'beebs' THEN interval '7 days' ELSE interval '4 hours' END;
    FOR j IN
      SELECT c.id, c.platform_listing_id, c.listing_url, c.platform_fields, c.inventaire_id, c.vu_en_ligne_le, c.price,
             COALESCE(c.published_at, c.created_at) AS publie
        FROM cross_post_jobs c
       WHERE c.user_id = p_user AND c.platform = p_platform
         AND c.status = 'published' AND c.action = 'publish' AND c.listing_url IS NOT NULL
         AND c.vu_en_ligne_le IS NULL
         AND NOT (COALESCE(c.platform_fields, '{}'::jsonb) ? 'unavailable_since')
         AND COALESCE(c.published_at, c.created_at) > now() - interval '14 days'
         AND COALESCE(c.published_at, c.created_at) < now() - v_grace
         AND NOT EXISTS (SELECT 1 FROM annonces_plateforme ap
                          WHERE ap.user_id = p_user AND ap.platform = p_platform
                            AND ap.listing_id IN (btrim(c.platform_listing_id), annonce_id_job(p_platform, c.listing_url)))
       ORDER BY COALESCE(c.published_at, c.created_at)
       LIMIT 25 FOR UPDATE OF c SKIP LOCKED
    LOOP
      v_ids := ARRAY(
        SELECT DISTINCT x FROM unnest(ARRAY[
          NULLIF(btrim(j.platform_listing_id), ''),
          annonce_id_job(p_platform, j.listing_url),
          NULLIF(btrim(j.platform_fields #>> '{lbc_depot,adsubmit,id}'), ''),
          NULLIF(btrim(j.platform_fields #>> '{lbc_depot,sans_adsubmit,id}'), '')
        ]) AS x WHERE x IS NOT NULL AND x ~ '^[0-9]{6,}$');
      IF COALESCE(array_length(v_ids, 1), 0) = 0 THEN n_attente := n_attente + 1; CONTINUE; END IF;
      -- Vue par un relevé sous un de ses identifiants, ou rattachée au job (tout statut, « en vérification »
      -- compris) : ce n'est pas un refus — la plateforme l'examine encore, ou elle est en ligne.
      IF EXISTS (SELECT 1 FROM annonces_plateforme ap
                  WHERE ap.user_id = p_user AND ap.platform = p_platform
                    AND (ap.listing_id = ANY(v_ids) OR ap.job_id = j.id)) THEN
        n_attente := n_attente + 1; CONTINUE;
      END IF;
      IF v_precedent.id IS NULL OR v_precedent.started_at < j.publie + v_grace THEN
        n_attente := n_attente + 1; CONTINUE;
      END IF;
      -- ── (29/10, lot B 4.5/4.9) BEEBS : UN SEUL JUGE, DEUX PREUVES — JAMAIS « REFUSÉE » SANS ELLES ─────────────────
      -- louis-seller 22362f3a (34200634) et ef037533 (34200711) le 20/10, XEWER abd12bb5 (34198358) le 19/10 : ARRIVÉS
      -- chez Beebs (numéro lu « en vérification », preuve_identifiant_beebs), puis jugés ici sur deux relevés dits
      -- complets dont le total est le compteur de l'INDEX public (releve_preuve_absence) — en retard sur les annonces
      -- neuves, et la page « en ligne » n'en montre que 60. Polly 34206489 (louis-seller) : jugée « jamais en ligne » le
      -- 24/10 sur deux relevés ainsi faits, EN LIGNE le 28/10 à 22:03 (constat_en_ligne_2810). Désormais un dépôt Beebs
      -- ne se conclut (ni « failed », ni clos « en ligne ailleurs ») que sur l'une des preuves du juge de handler-watch
      -- (_shared/beebs-sortie-verification.js), lues par beebs_preuve_jamais_en_ligne : CE relevé a vu TOUT « en ligne »
      -- par la PAGE (releve_beebs_voit_tout_en_ligne, miroir de releveVoitToutEnLigne), ou deux constats « page 404 » de
      -- l'extension sur le numéro EXACT à 6 h d'écart (« en vérification » lue en entier) — le relevé, ou le dernier
      -- constat, 7 jours au moins après la dernière vue en vérification. Sinon : « pas encore visible », posé une fois
      -- (aucune ligne inchangée réécrite), jamais « refusée ». Un seul numéro, ou rien n'est conclu.
      v_preuve := NULL; v_num := NULL;
      IF p_platform = 'beebs' THEN
        v_num := CASE WHEN array_length(v_ids, 1) = 1 THEN v_ids[1] END;
        IF v_num IS NOT NULL THEN
          v_preuve := beebs_preuve_jamais_en_ligne(p_user, v_num, j.publie, j.price, j.platform_fields, p_run_id);
        END IF;
        IF v_preuve IS NULL THEN
          IF NOT (COALESCE(j.platform_fields, '{}'::jsonb) ? 'pas_encore_visible') THEN
            UPDATE cross_post_jobs SET platform_fields = COALESCE(platform_fields, '{}'::jsonb) || jsonb_build_object('pas_encore_visible',
                jsonb_build_object('depuis', now(), 'derniere', now(), 'regle', 'beebs_sans_preuve_de_refus_2910',
                                   'numero', v_num, 'releve', p_run_id))
             WHERE id = j.id AND status = 'published' AND NOT (COALESCE(platform_fields, '{}'::jsonb) ? 'pas_encore_visible');
          END IF;
          n_beebs_sans_preuve := n_beebs_sans_preuve + 1;
          n_attente := n_attente + 1; CONTINUE;
        END IF;
      END IF;
      v_vivante := NULL;
      SELECT ap.listing_id, ap.url INTO v_vivante FROM annonces_plateforme ap
       WHERE j.inventaire_id IS NOT NULL AND ap.user_id = p_user AND ap.platform = p_platform
         AND ap.inventaire_id = j.inventaire_id AND ap.statut_plateforme = 'en_ligne' AND ap.disparu_le IS NULL
         AND ap.listing_id <> ALL(v_ids)
       ORDER BY ap.vu_le DESC LIMIT 1;
      v_jum_id := NULL;
      IF v_vivante.listing_id IS NULL AND j.inventaire_id IS NOT NULL
         AND EXISTS (SELECT 1 FROM fiches_liees_comptes f WHERE f.fiche_a = j.inventaire_id OR f.fiche_b = j.inventaire_id) THEN
        SELECT o.listing_id INTO v_jum_id FROM jumelle_occupe_plateformes(p_user, j.inventaire_id) o
         WHERE o.platform = p_platform AND o.statut = 'en_ligne' AND coalesce(o.listing_id, '') <> ALL(v_ids) LIMIT 1;
      END IF;
      -- (24/10, point 6 — jocabroc8) Une annonce eBay dont la veille a lu la FIN (fin_ebay.fin, aucune vente) a été
      -- EN LIGNE : eBay l'a acceptée, puis elle y a été arrêtée — pas par FillSell (ce job est encore « publié » :
      -- aucun retrait FillSell ne l'a close). Pages eBay relues le 23/10 : « Le vendeur a mis fin à cette annonce …
      -- car elle comportait une erreur », 2 et 17 min après la mise en ligne. Ce n'est PAS un refus : close sans
      -- rouge, avec sa date (et l'annonce sous laquelle l'article est en ligne, s'il l'est). Quotas comme avant :
      -- rendue seulement là où l'ancien jugement la rendait (aucun article en ligne ailleurs).
      IF p_platform = 'ebay' AND _ts_ou_null(j.platform_fields #>> '{fin_ebay,fin}') IS NOT NULL
         AND coalesce(j.platform_fields #>> '{fin_ebay,vendus}', '0') ~ '^0+$' THEN
        v_refund := CASE WHEN v_vivante.listing_id IS NULL AND v_jum_id IS NULL THEN refund_publish_unconfirmed(j.id) END;
        UPDATE cross_post_jobs SET status = 'cancelled',
          error = 'Cette annonce a bien été en ligne sur eBay, puis elle y a été arrêtée le '
            || to_char(_ts_ou_null(j.platform_fields #>> '{fin_ebay,fin}') AT TIME ZONE 'Europe/Paris', 'DD/MM à HH24"h"MI')
            || ' — pas par FillSell, et sans vente. Ce n''est pas un refus d''eBay. '
            || CASE WHEN v_vivante.listing_id IS NOT NULL
                 THEN 'Ton article y est en ligne sous l''annonce ' || v_vivante.listing_id || ' : rien à refaire.'
                 WHEN v_jum_id IS NOT NULL
                 THEN 'Ton article y est en ligne sous l''annonce ' || v_jum_id || ', publiée par ton compte FillSell relié : rien à refaire.'
                 ELSE 'Ton article reste dans ton stock ; si cet arrêt n''était pas voulu, relance la publication depuis la fiche.' END,
          platform_fields = (COALESCE(platform_fields, '{}'::jsonb) - ARRAY['sale_signal','unavailable_since','unavailable_pending_since','pas_encore_visible'])
            || jsonb_build_object('depot_jamais_en_ligne', jsonb_build_object(
              'le', now(), 'premier', v_precedent.id, 'second', v_run.id, 'identifiants', to_jsonb(v_ids),
              'issue', 'arretee_sur_ebay', 'fin', j.platform_fields #>> '{fin_ebay,fin}',
              'annonce_en_ligne', coalesce(v_vivante.listing_id, v_jum_id), 'refund', v_refund, 'avec_lien', true))
         WHERE id = j.id AND status = 'published';
        n_attente := n_attente + 1; CONTINUE;
      END IF;
      IF v_vivante.listing_id IS NOT NULL OR v_jum_id IS NOT NULL THEN
        UPDATE cross_post_jobs SET status = 'cancelled',
          error = CASE WHEN v_vivante.listing_id IS NOT NULL
            THEN 'Ce dépôt n''a jamais été retrouvé dans tes annonces ' || v_nom || ', mais ton article y est en ligne sous l''annonce '
                 || v_vivante.listing_id || ' : rien à refaire, rien n''est vendu.'
            ELSE 'Ce dépôt n''a pas été mis en ligne par ' || v_nom || ' : ton article y est DÉJÀ en ligne sous l''annonce '
                 || v_jum_id || ', publiée par ton compte FillSell relié — ' || v_nom || ' refuse les doublons. Rien à refaire, rien n''est vendu.' END,
          platform_fields = (COALESCE(platform_fields, '{}'::jsonb) - ARRAY['sale_signal','unavailable_since','unavailable_pending_since','pas_encore_visible'])
            || jsonb_build_object('depot_jamais_en_ligne', jsonb_build_object(
              'le', now(), 'premier', v_precedent.id, 'second', v_run.id, 'identifiants', to_jsonb(v_ids),
              'issue', CASE WHEN v_vivante.listing_id IS NOT NULL THEN 'article_en_ligne_ailleurs' ELSE 'en_ligne_par_compte_relie' END,
              'annonce_en_ligne', coalesce(v_vivante.listing_id, v_jum_id), 'avec_lien', true))
         WHERE id = j.id AND status = 'published';
        IF v_jum_id IS NOT NULL THEN n_jumelle := n_jumelle + 1; END IF;
        n_attente := n_attente + 1; CONTINUE;
      END IF;
      v_doublon := NULL;
      SELECT ap.listing_id INTO v_doublon
        FROM inventaire i
        CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(i.photos::jsonb)='array' THEN i.photos::jsonb ELSE '[]'::jsonb END) ph
        JOIN photo_empreintes e1 ON e1.url = ph->>'url' AND e1.dhash IS NOT NULL
        JOIN annonces_plateforme ap ON ap.user_id = p_user AND ap.platform = p_platform
          AND ap.statut_plateforme = 'en_ligne' AND ap.disparu_le IS NULL AND ap.listing_id <> ALL(v_ids)
        JOIN photo_empreintes e2 ON e2.url = ap.photo_url AND e2.dhash = e1.dhash
       WHERE i.id = j.inventaire_id AND i.user_id = p_user
       LIMIT 1;
      v_refund := refund_publish_unconfirmed(j.id);
      v_msg := 'Cette annonce est absente de tes annonces ' || v_nom
        || ' aux relevés complets du ' || to_char(COALESCE(v_precedent.finished_at, v_precedent.started_at) AT TIME ZONE 'Europe/Paris', 'DD/MM à HH24"h"MI')
        || ' et du ' || v_releve_txt || ', et ' || v_nom || ' n''a donné aucun motif. '
        || CASE WHEN v_doublon.listing_id IS NOT NULL
             THEN 'Elle porte la même photo que ton annonce ' || v_doublon.listing_id || ', déjà en ligne sur ' || v_nom || '. '
             ELSE '' END
        || 'Rien n''est vendu, ton article reste dans ton stock, et cette publication ne compte pas dans tes limites.';
      -- (29/10, lot B 4.5 — R3, Nico) Beebs : « Beebs a reçu ton annonce (n° …, en vérification à HHhMM le JJ/MM), puis l'a
      -- retirée de sa vérification sans la mettre en ligne (elle n'y était plus à HHhMM le JJ/MM) ; Beebs ne dit pas
      -- pourquoi. » + la preuve datée — le même texte que messageRefusVerificationBeebs (handler-watch). Aucune durée.
      IF p_platform = 'beebs' THEN
        v_msg := beebs_message_jamais_en_ligne(v_preuve, false, v_doublon.listing_id);
      END IF;
      UPDATE cross_post_jobs SET status = 'failed', error = v_msg,
        platform_fields = (COALESCE(platform_fields, '{}'::jsonb) - ARRAY['sale_signal','unavailable_since','unavailable_pending_since','pas_encore_visible'])
          || jsonb_build_object('depot_jamais_en_ligne', jsonb_build_object(
            'le', now(), 'premier', v_precedent.id, 'second', v_run.id, 'identifiants', to_jsonb(v_ids),
            'issue', 'refus_moderation_probable', 'doublon_photo_de', v_doublon.listing_id, 'refund', v_refund, 'avec_lien', true)
            || CASE WHEN v_preuve IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('preuve', v_preuve) END)
       WHERE id = j.id AND status = 'published';
      n_jamais_vues := n_jamais_vues + 1;
    END LOOP;
  END IF;

  RETURN jsonb_build_object('ok', true, 'run_id', p_run_id, 'platform', p_platform,
                            'refusees', n_refusees + n_jamais_vues, 'en_ligne', n_en_ligne, 'en_attente', n_attente,
                            'jamais_vues_avec_lien', n_jamais_vues, 'compte_relie', n_jumelle, 'redevenues_visibles', n_visibles,
                            'refermees', v_refermees, 'beebs_sans_preuve', n_beebs_sans_preuve);
END;
$function$
;

-- Essai de 20261029200000 (29/10, lot B 4.5/4.9) — tests APRÈS la migration, assemblés par 20261029200000_generer.sh
-- (transaction annulée). Sur les vraies lignes ; les constats « page 404 » d'essai sont posés dans la transaction.
do $tests$
declare
  v_xewer uuid := 'abd12bb5-2899-4bd2-a394-02dc6763f3cc';
  v_l634 uuid := '22362f3a-86fe-4eb3-a986-ef4569f6d89f';
  v_l711 uuid := 'ef037533-8fc0-4997-b436-3c562f3256a5';
  v_polly uuid := '4cdadbc1-886e-4af1-a40c-37bfa2f805ff';
  v_louis uuid := '447d920c-976a-4d8f-aff4-a2998050358c';
  v_xu uuid := 'de63ca45-63d9-4a3c-b65a-d1345acd8b2e';
  v_av jsonb := (select v from _avant limit 1);
  c record; j record; b jsonb; t0 timestamptz; v_ms numeric; v_plan jsonb;
  v_xmin_avant text; v_xmin_apres text; n_jobs_avant integer; v_def text;
begin
  -- A. Ce que la règle d'AVANT (prod) disait des quatre, sur les mêmes relevés.
  -- Polly n'est pas jugée ce jour-là (le relevé précédent du compte est antérieur à son dépôt + 7 jours) : c'est le
  -- relevé du 24/10 (grâce de 72 h) qui l'avait dite « jamais en ligne » ; voir N4 et N4b.
  insert into _r values ('A1 AVANT (prod) : les 3 dépôts du 4.5 jugés « failed » sur le même relevé (louis-seller : page 60 < index 253)',
    (select count(*) from jsonb_array_elements(v_av -> 'cas') x where x ->> 'status' = 'failed' and x ->> 'id' <> v_polly::text) = 3,
    (select string_agg((x ->> 'id')::text || '=' || (x ->> 'status') || ' « ' || left(coalesce(x ->> 'error', ''), 70) || '… »', ' | ') from jsonb_array_elements(v_av -> 'cas') x)
    || ' || bilans : ' || (select string_agg((x ->> 'user') || ' refusées ' || (x #>> '{bilan,refusees}') || ', en attente ' || (x #>> '{bilan,en_attente}'), ' | ') from jsonb_array_elements(v_av -> 'bilans') x));

  -- C. Corps, droits.
  insert into _r values ('C1 droits : trois fonctions nouvelles {postgres, service_role} ; trancher inchangé',
    (select bool_and(proacl::text = '{postgres=X/postgres,service_role=X/postgres}') from pg_proc
      where oid in ('public.releve_beebs_voit_tout_en_ligne(uuid)'::regprocedure,
                    'public.beebs_preuve_jamais_en_ligne(uuid,text,timestamp with time zone,numeric,jsonb,uuid)'::regprocedure,
                    'public.beebs_message_jamais_en_ligne(jsonb,boolean,text)'::regprocedure,
                    'public.trancher_publications_sans_lien(uuid,text,uuid)'::regprocedure)),
    null);
  v_def := regexp_replace(pg_get_functiondef('public.trancher_publications_sans_lien(uuid,text,uuid)'::regprocedure), '--[^\n]*', '', 'g');
  insert into _r values ('C2 hors Beebs, le texte du motif est celui d''avant ; plus « Sept jours après le dépôt » ; un seul juge appelé',
    v_def ~ 'v_msg := ''Cette annonce est absente de tes annonces '' \|\| v_nom\s+\|\| '' aux relevés complets du '''
    and v_def !~ 'Sept jours après le dépôt' and (length(v_def) - length(replace(v_def, 'beebs_preuve_jamais_en_ligne(', ''))) / length('beebs_preuve_jamais_en_ligne(') = 1,
    md5(pg_get_functiondef('public.trancher_publications_sans_lien(uuid,text,uuid)'::regprocedure)));

  -- R. Le miroir de releveVoitToutEnLigne sur les relevés réels.
  insert into _r values ('R1 relevé de XEWER (page = index) : la page a tout vu ; louis-seller (page 60 < index) : jamais ; relevé inconnu : jamais',
    public.releve_beebs_voit_tout_en_ligne((select run from _runs where user_id = v_xu))
    and not public.releve_beebs_voit_tout_en_ligne((select run from _runs where user_id = v_louis))
    and not public.releve_beebs_voit_tout_en_ligne(gen_random_uuid()),
    (select string_agg(r.user_id::text || ' : ' || substring(r.erreur from 'page : \d+ annonce\(s\) affichée\(s\)') || ' / ' || substring(r.erreur from 'index public Beebs : \d+'), ' | ')
       from public.vinted_sync_runs r where r.id in (select run from _runs)));

  -- N. La règle nouvelle, mêmes relevés.
  select count(*) into n_jobs_avant from public.cross_post_jobs where user_id in (v_louis, v_xu) and created_at >= now();
  for c in select * from _runs loop
    t0 := clock_timestamp();
    b := public.trancher_publications_sans_lien(c.user_id, 'beebs', c.run);
    insert into _bilans values ('nouvelle', c.user_id, b || jsonb_build_object('ms', round(extract(epoch from clock_timestamp() - t0) * 1000)));
  end loop;
  select status, error, platform_fields pf into j from public.cross_post_jobs where id = v_xewer;
  insert into _r values ('N1 XEWER 34198358 (compte de 31 annonces, la page les a toutes vues) : « failed », preuve « relevé », message vrai et daté',
    j.status = 'failed' and j.pf #>> '{depot_jamais_en_ligne,preuve,source}' = 'releve'
    and j.error ~ '^Beebs a reçu ton annonce \(n° 34198358, en vérification à \d\dh\d\d le 19/10\), puis l''a retirée de sa vérification '
    and j.error ~ 'Beebs ne dit pas pourquoi\. Le relevé fait à \d\dh\d\d le \d\d/\d\d, qui a lu toutes tes annonces en ligne, ne la montre pas : Beebs n''a jamais mis cette annonce en ligne\.'
    and j.error !~ 'refusée|serait refusé',
    j.error);
  select status, error, platform_fields pf into j from public.cross_post_jobs where id = v_l634;
  insert into _r values ('N2 louis-seller 34200634 (page 60 < index 253) : reste « publiée », « pas encore visible » posé, aucun rouge',
    j.status = 'published' and j.error is null and j.pf #>> '{pas_encore_visible,regle}' = 'beebs_sans_preuve_de_refus_2910'
    and j.pf #>> '{pas_encore_visible,numero}' = '34200634' and not (j.pf ? 'depot_jamais_en_ligne'),
    j.status || ' ' || coalesce(j.pf ->> 'pas_encore_visible', '∅'));
  select status, error, platform_fields pf into j from public.cross_post_jobs where id = v_l711;
  insert into _r values ('N3 louis-seller 34200711 : idem', j.status = 'published' and j.error is null
    and j.pf #>> '{pas_encore_visible,regle}' = 'beebs_sans_preuve_de_refus_2910', j.status || ' ' || coalesce(j.pf ->> 'pas_encore_visible', '∅'));
  select status, error, platform_fields pf into j from public.cross_post_jobs where id = v_polly;
  insert into _r values ('N4 Polly 34206489 (EN LIGNE le 28/10 à 22:03) : jamais « refusée » — publiée, son marqueur du 20/10 gardé tel quel',
    j.status = 'published' and j.error is null and j.pf #>> '{pas_encore_visible,regle}' = 'sortie_de_verification_2510',
    j.status || ' ' || coalesce(j.pf ->> 'pas_encore_visible', '∅'));
  insert into _r values ('N4b Polly : le relevé de louis-seller, « complet » pour l''ancienne règle (index), n''est JAMAIS une preuve pour la nouvelle',
    public.releve_preuve_absence((select run from _runs where user_id = v_louis))
    and public.beebs_preuve_jamais_en_ligne(v_louis, '34206489', '2026-10-20T21:51:59.769Z'::timestamptz, 10, j.pf, (select run from _runs where user_id = v_louis)) is null,
    null);
  insert into _r values ('N5 bilans de la nouvelle règle (refusées / en attente / Beebs sans preuve / ms)', true,
    (select string_agg(user_id::text || ' : ' || (bilan ->> 'refusees') || ' / ' || (bilan ->> 'en_attente') || ' / ' || coalesce(bilan ->> 'beebs_sans_preuve', '?') || ' / ' || (bilan ->> 'ms') || ' ms', ' | ') from _bilans));

  -- Le même relevé relu : aucune ligne réécrite.
  select string_agg(id::text || xmin::text, ',' order by id) into v_xmin_avant from public.cross_post_jobs where user_id in (v_louis, v_xu) and platform = 'beebs';
  for c in select * from _runs loop perform public.trancher_publications_sans_lien(c.user_id, 'beebs', c.run); end loop;
  select string_agg(id::text || xmin::text, ',' order by id) into v_xmin_apres from public.cross_post_jobs where user_id in (v_louis, v_xu) and platform = 'beebs';
  insert into _r values ('N6 le même relevé relu : aucun job Beebs des deux comptes réécrit', v_xmin_avant = v_xmin_apres, null);

  -- La seconde preuve : deux constats « page 404 » (en vérification lue en entier) à 7 h d'écart, 8 jours après le dépôt.
  update public.cross_post_jobs set platform_fields = platform_fields || jsonb_build_object('beebs_404_constats', jsonb_build_array(
      jsonb_build_object('le', '2026-10-28T10:00:00.000Z', 'page_http', 404, 'produit', false, 'en_verification', 'complete'),
      jsonb_build_object('le', '2026-10-28T17:00:00.000Z', 'page_http', 404, 'produit', false, 'en_verification', 'complete')))
   where id = v_l634;
  -- … à 3 h d'écart seulement ; et « en vérification » non lue : jamais une preuve de refus.
  update public.cross_post_jobs set platform_fields = platform_fields || jsonb_build_object('beebs_404_constats', jsonb_build_array(
      jsonb_build_object('le', '2026-10-28T10:00:00.000Z', 'page_http', 404, 'produit', false, 'en_verification', 'complete'),
      jsonb_build_object('le', '2026-10-28T13:00:00.000Z', 'page_http', 404, 'produit', false, 'en_verification', 'complete'),
      jsonb_build_object('le', '2026-10-28T20:00:00.000Z', 'page_http', 404, 'produit', false, 'en_verification', 'non_lue')))
   where id = v_l711;
  t0 := clock_timestamp();
  perform public.trancher_publications_sans_lien(v_louis, 'beebs', (select run from _runs where user_id = v_louis));
  v_ms := round(extract(epoch from clock_timestamp() - t0) * 1000);
  select status, error, platform_fields pf into j from public.cross_post_jobs where id = v_l634;
  insert into _r values ('N7 34200634 + deux constats 404 à 7 h d''écart (8 jours après) : « failed », preuve « constats_404 », heure de sortie jamais devinée',
    j.status = 'failed' and j.pf #>> '{depot_jamais_en_ligne,preuve,source}' = 'constats_404'
    and j.error ~ '^Beebs a reçu ton annonce \(n° 34200634, en vérification à 03h02 le 20/10\), puis l''a retirée de sa vérification sans la mettre en ligne ; Beebs ne dit pas pourquoi\. Sa page est introuvable \(404\) à 11h00 le 28/10 et encore à 18h00 le 28/10, et elle n''est plus dans tes annonces en vérification : Beebs n''a jamais mis cette annonce en ligne\.',
    j.error);
  select status, error, platform_fields pf into j from public.cross_post_jobs where id = v_l711;
  insert into _r values ('N8 34200711 + constats à 3 h d''écart (et un « en vérification » non lue) : toujours publiée', j.status = 'published', j.status);
  insert into _r values ('N9 durée de la règle sur le compte de louis-seller (relevé + 2 dépôts jugés)', v_ms < 2000, v_ms || ' ms');
  -- 500 € et plus : jamais jugée (Beebs les examine invisibles), même avec deux constats.
  insert into _r values ('N10 999 € : jamais une preuve, même avec deux constats 404',
    public.beebs_preuve_jamais_en_ligne(v_louis, '34200634', '2026-10-20T01:02:44Z'::timestamptz, 999, '{}'::jsonb, null) is null
    and public.beebs_preuve_jamais_en_ligne(v_louis, '34200634', '2026-10-20T01:02:44Z'::timestamptz, 1.5, '{}'::jsonb, null) ->> 'source' = 'constats_404', null);

  -- M. Le message : à l'octet près celui de messageRefusVerificationBeebs (mêmes entrées, sorties du JS le 29/10).
  insert into _r values ('M1 message SQL = message JS (relevé)',
    public.beebs_message_jamais_en_ligne(jsonb_build_object('source', 'releve', 'numero', '34198358', 'le', '2026-10-29T16:18:31Z',
      'vu_en_verification_le', '2026-10-19T16:09:07Z', 'sortie_constatee_le', '2026-10-19T16:12:30Z'), false, null)
    = 'Beebs a reçu ton annonce (n° 34198358, en vérification à 18h09 le 19/10), puis l''a retirée de sa vérification sans la mettre en ligne (elle n''y était plus à 18h12 le 19/10) ; Beebs ne dit pas pourquoi. Le relevé fait à 17h18 le 29/10, qui a lu toutes tes annonces en ligne, ne la montre pas : Beebs n''a jamais mis cette annonce en ligne. Rien n''est en ligne, rien n''est vendu : ton article reste dans ton stock, et cette publication ne compte pas dans tes limites. Pour la reproposer, change d''abord ce que Beebs a pu refuser (photos, titre, description, rayon).', null);
  insert into _r values ('M2 message SQL = message JS (constats 404)',
    public.beebs_message_jamais_en_ligne(jsonb_build_object('source', 'constats_404', 'numero', '34200634', 'le', '2026-10-28T17:00:00Z', 'premier', '2026-10-28T10:00:00Z',
      'vu_en_verification_le', '2026-10-20T01:02:40Z', 'sortie_constatee_le', '2026-10-20T03:32:40Z'), false, null)
    = 'Beebs a reçu ton annonce (n° 34200634, en vérification à 03h02 le 20/10), puis l''a retirée de sa vérification sans la mettre en ligne (elle n''y était plus à 05h32 le 20/10) ; Beebs ne dit pas pourquoi. Sa page est introuvable (404) à 11h00 le 28/10 et encore à 18h00 le 28/10, et elle n''est plus dans tes annonces en vérification : Beebs n''a jamais mis cette annonce en ligne. Rien n''est en ligne, rien n''est vendu : ton article reste dans ton stock, et cette publication ne compte pas dans tes limites. Pour la reproposer, change d''abord ce que Beebs a pu refuser (photos, titre, description, rayon).', null);
  insert into _r values ('M3 message SQL = message JS (republication)',
    public.beebs_message_jamais_en_ligne(jsonb_build_object('source', 'releve', 'numero', '34206489', 'le', '2026-10-29T16:17:35Z',
      'vu_en_verification_le', '2026-10-20T21:51:59Z', 'sortie_constatee_le', '2026-10-23T21:51:59Z'), true, null)
    = 'Beebs a reçu ta nouvelle annonce (n° 34206489, en vérification à 23h51 le 20/10), puis l''a retirée de sa vérification sans la mettre en ligne (elle n''y était plus à 23h51 le 23/10) ; Beebs ne dit pas pourquoi. Le relevé fait à 17h17 le 29/10, qui a lu toutes tes annonces en ligne, ne la montre pas : Beebs n''a jamais mis cette annonce en ligne. L''ancienne annonce avait été retirée : ton article n''est plus en ligne sur Beebs. Rien n''est vendu, ton article reste dans ton stock, et cette republication ne compte pas dans tes limites. Pour la reproposer, change d''abord ce que Beebs a pu refuser (photos, titre, description, rayon).', null);
  insert into _r values ('M4 message SQL = message JS (sans vue en vérification ; sortie dite par son heure)',
    public.beebs_message_jamais_en_ligne(jsonb_build_object('source', 'releve', 'numero', '34200711', 'le', '2026-10-29T16:17:35Z'), false, null)
    = 'Beebs a reçu ton annonce (n° 34200711), puis l''a retirée de sa vérification sans la mettre en ligne ; Beebs ne dit pas pourquoi. Le relevé fait à 17h17 le 29/10, qui a lu toutes tes annonces en ligne, ne la montre pas : Beebs n''a jamais mis cette annonce en ligne. Rien n''est en ligne, rien n''est vendu : ton article reste dans ton stock, et cette publication ne compte pas dans tes limites. Pour la reproposer, change d''abord ce que Beebs a pu refuser (photos, titre, description, rayon).'
    and public.beebs_message_jamais_en_ligne(jsonb_build_object('source', 'releve', 'numero', '34200712', 'le', '2026-10-29T16:17:35Z',
      'vu_en_verification_le', '2026-10-20T01:02:40Z', 'sortie_constatee_le', '2026-10-20T01:02:50Z'), false, null)
    ~ 'sans la mettre en ligne \(elle n''y était plus à 03h02 le 20/10\) ; Beebs ne dit pas pourquoi\.', null);
  insert into _r values ('M5 la photo en double se dit après la preuve, avant « Rien n''est en ligne »',
    public.beebs_message_jamais_en_ligne(jsonb_build_object('source', 'releve', 'numero', '34200711', 'le', '2026-10-29T16:17:35Z'), false, '34199999')
    ~ 'ne la montre pas : Beebs n''a jamais mis cette annonce en ligne\. Elle porte la même photo que ton annonce 34199999, déjà en ligne sur Beebs\. Rien n''est en ligne', null);

  -- P. Ce que coûtent les deux lectures de la preuve (compte de louis-seller, le plus gros des quatre).
  execute format('explain (analyze, buffers, format json) select min(_ts_ou_null(x.l ->> ''lu_le'')) from public.cross_post_jobs o
      cross join lateral (values (o.platform_fields #> ''{preuve_identifiant_beebs,avant}''), (o.platform_fields #> ''{preuve_identifiant_beebs,apres}'')) x(l)
      cross join lateral jsonb_array_elements(case when jsonb_typeof(x.l -> ''pages'') = ''array'' then x.l -> ''pages'' else ''[]''::jsonb end) pg(p)
     where o.user_id = %L and o.created_at >= %L::timestamptz and o.platform = ''beebs'' and o.action in (''publish'', ''republish'')
       and o.platform_fields ? ''preuve_identifiant_beebs'' and pg.p ->> ''ok'' = ''true'' and jsonb_typeof(pg.p -> ''ids'') = ''array''
       and (pg.p -> ''ids'') ? ''34200634''', v_louis, '2026-10-19T01:02:44Z') into v_plan;
  insert into _r values ('P1 lecture des vues « en vérification » (louis-seller, dépôts depuis le 19/10) < 50 ms',
    (v_plan -> 0 ->> 'Execution Time')::numeric < 50, (v_plan -> 0 ->> 'Execution Time') || ' ms, ' || (v_plan -> 0 -> 'Plan' ->> 'Node Type'));
  execute format('explain (analyze, buffers, format json) select count(*) from public.cross_post_jobs o
      cross join lateral jsonb_array_elements(case when jsonb_typeof(o.platform_fields -> ''beebs_404_constats'') = ''array'' then o.platform_fields -> ''beebs_404_constats'' else ''[]''::jsonb end) e
     where o.user_id = %L and o.created_at >= %L::timestamptz and o.platform = ''beebs'' and o.platform_fields ? ''beebs_404_constats''
       and (btrim(coalesce(o.platform_listing_id, '''')) = ''34200634'' or annonce_id_job(''beebs'', o.listing_url) = ''34200634'')', v_louis, '2026-10-19T01:02:44Z') into v_plan;
  insert into _r values ('P2 lecture des constats 404 du numéro (louis-seller) < 50 ms',
    (v_plan -> 0 ->> 'Execution Time')::numeric < 50, (v_plan -> 0 ->> 'Execution Time') || ' ms');

  -- X. Rien d'autre.
  insert into _r values ('X1 aucun job créé par les jugements, aucun mail',
    (select count(*) from public.cross_post_jobs where user_id in (v_louis, v_xu) and created_at >= now()) = n_jobs_avant
    and (select count(*) from public.email_logs where sent_at >= now()) = 0, null);
end
$tests$;
-- INVERSE de 20261029200000_beebs_un_seul_juge_jamais_en_ligne (29/10, lot B 4.5/4.9).
-- Rend trancher_publications_sans_lien tel que LU EN PROD le 29/10 avant la migration (pg_get_functiondef, md5
-- 6ea3fdf30588cf009c3bf3ba50ec1058 — relu à la fin), puis retire les trois fonctions ajoutées.
-- Laissés tels quels (sans effet sur l'ancienne règle) : les marqueurs pas_encore_visible { regle:
-- 'beebs_sans_preuve_de_refus_2910' } posés entre-temps — l'ancienne fonction les efface elle-même en concluant, et
-- l'app y lit « Beebs vérifie ton annonce », comme pour le marqueur du 20/10.
-- ⛔ À jouer seulement sur ordre de Nico : npx supabase db query --linked -f <ce fichier>.


CREATE OR REPLACE FUNCTION public.trancher_publications_sans_lien(p_user uuid, p_platform text, p_run_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_run vinted_sync_runs%ROWTYPE;
  v_precedent vinted_sync_runs%ROWTYPE;
  j record;
  v_ids text[];
  v_url text;
  v_refund jsonb;
  v_nom text;
  v_msg text;
  v_releve_txt text;
  n_refusees integer := 0; n_en_ligne integer := 0; n_attente integer := 0;
  v_vivante record; v_doublon record;
  v_jum_id text;
  v_grace interval;
  n_jumelle integer := 0; n_jamais_vues integer := 0; n_visibles integer := 0;
  v_refermees jsonb := NULL;
BEGIN
  IF p_user IS NULL OR p_platform IS NULL OR p_run_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'arguments');
  END IF;
  SELECT * INTO v_run FROM vinted_sync_runs
   WHERE id = p_run_id AND user_id = p_user AND kind = 'annonces' AND platform = p_platform;
  IF v_run.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'run_introuvable'); END IF;
  -- (20/10) « PAS ENCORE VISIBLE » LEVÉ PAR LE RELEVÉ : une annonce que le relevé de CE compte voit en ligne (ou
  -- vendue) n'est plus « pas encore visible » — le marqueur posé par cross_post_jobs_vue_ou_pas_encore_visible
  -- s'efface. Bornée aux jobs qui le portent ; aucune autre ligne réécrite.
  UPDATE cross_post_jobs c SET platform_fields = c.platform_fields - 'pas_encore_visible'
   WHERE c.user_id = p_user AND c.platform = p_platform AND c.platform_fields ? 'pas_encore_visible'
     AND EXISTS (SELECT 1 FROM annonces_plateforme ap
                  WHERE ap.user_id = p_user AND ap.platform = p_platform AND ap.statut_plateforme IN ('en_ligne', 'vendue')
                    AND ap.listing_id IN (btrim(c.platform_listing_id), annonce_id_job(p_platform, c.listing_url)));
  GET DIAGNOSTICS n_visibles = ROW_COUNT;
  -- (27/10, GTA de BONCOIN) UNE LIGNE « JAMAIS MISE EN LIGNE » DONT L'ARTICLE EST RETROUVÉ EN LIGNE SE REFERME :
  -- même numéro (le dépôt lui-même), ou une autre annonce de la MÊME fiche sur la MÊME plateforme, vue en ligne
  -- par un relevé de ce compte (depot_jamais_en_ligne_refermer). Le déclencheur des annonces la referme dès le
  -- rattachement ; cette passe, à chaque relevé, rattrape ce qu'il n'aurait pas vu. Jamais sur un titre.
  BEGIN
    v_refermees := depot_jamais_en_ligne_refermer(p_user, p_platform, NULL, NULL, p_run_id);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'trancher_publications_sans_lien : refermeture (%, %) : %', p_user, p_platform, SQLERRM;
  END;

  IF NOT releve_preuve_absence(p_run_id) THEN
    RETURN jsonb_build_object('ok',true,'reason','releve_non_probant','refusees',0,'en_ligne',0,'en_attente',0);
  END IF;
  SELECT s.* INTO v_precedent FROM (
    SELECT * FROM vinted_sync_runs WHERE user_id=p_user AND started_at<v_run.started_at
    ORDER BY started_at DESC LIMIT 50
  ) s WHERE s.platform=p_platform AND s.kind='annonces'
    AND s.vinted_user_id IS NOT DISTINCT FROM v_run.vinted_user_id
    AND s.finished_at<=v_run.started_at AND s.started_at<=v_run.started_at-interval '5 minutes'
    AND releve_preuve_absence(s.id)
  ORDER BY s.started_at DESC LIMIT 1;
  v_nom := CASE p_platform WHEN 'leboncoin' THEN 'Leboncoin' WHEN 'beebs' THEN 'Beebs' WHEN 'ebay' THEN 'eBay' WHEN 'opla' THEN 'Opla' WHEN 'depop' THEN 'Depop' ELSE p_platform END;
  v_releve_txt := to_char(COALESCE(v_run.finished_at, v_run.started_at) AT TIME ZONE 'Europe/Paris', 'DD/MM à HH24"h"MI');

  FOR j IN
    SELECT id, platform_listing_id, platform_fields, inventaire_id, vu_en_ligne_le, COALESCE(published_at, created_at) AS publie
      FROM cross_post_jobs
     WHERE user_id = p_user AND platform = p_platform
       AND status = 'published' AND action = 'publish' AND listing_url IS NULL
     ORDER BY COALESCE(published_at, created_at)
     LIMIT 25 FOR UPDATE SKIP LOCKED
  LOOP
    v_ids := ARRAY(
      SELECT DISTINCT x FROM unnest(ARRAY[
        NULLIF(btrim(j.platform_listing_id), ''),
        NULLIF(btrim(j.platform_fields #>> '{lbc_depot,adsubmit,id}'), ''),
        NULLIF(btrim(j.platform_fields #>> '{lbc_depot,sans_adsubmit,id}'), '')
      ]) AS x WHERE x IS NOT NULL AND x ~ '^[0-9]{6,}$');
    IF COALESCE(array_length(v_ids, 1), 0) = 0 THEN n_attente := n_attente + 1; CONTINUE; END IF;

    -- EN LIGNE : l'identifiant est dans le relevé du compte, avec son lien.
    v_url := NULL;
    SELECT ap.url INTO v_url FROM annonces_plateforme ap
     WHERE ap.user_id = p_user AND ap.platform = p_platform AND ap.listing_id = ANY(v_ids)
       AND ap.url IS NOT NULL AND ap.statut_plateforme = 'en_ligne' AND ap.disparu_le IS NULL
     ORDER BY ap.vu_le DESC LIMIT 1;
    IF v_url IS NOT NULL THEN
      UPDATE cross_post_jobs SET
        listing_url = v_url,
        platform_fields = COALESCE(platform_fields, '{}'::jsonb) || jsonb_build_object(
          'lien_retrouve_par_identifiant', jsonb_build_object('le', now(), 'run_id', p_run_id, 'url', v_url, 'identifiants', to_jsonb(v_ids)))
       WHERE id = j.id;
      n_en_ligne := n_en_ligne + 1; CONTINUE;
    END IF;

    -- Présente dans un relevé sous un autre statut : ce n'est pas un refus.
    IF EXISTS (SELECT 1 FROM annonces_plateforme ap
                WHERE ap.user_id = p_user AND ap.platform = p_platform AND ap.listing_id = ANY(v_ids)) THEN
      n_attente := n_attente + 1; CONTINUE;
    END IF;

    -- BEEBS : LA MODÉRATION NE SE JUGE PAS (27/09, décision de Nico). Le lien
    -- est posé ci-dessus quand le relevé le porte ; une absence du relevé ne
    -- fait jamais dire « refusée » ni « tu peux la relancer ».
    IF p_platform = 'beebs' THEN
      n_attente := n_attente + 1; CONTINUE;
    END IF;

    -- Deux cycles complets après la grâce commune.
    IF v_precedent.id IS NULL OR v_precedent.started_at<j.publie+interval '4 hours' THEN
      n_attente:=n_attente+1; CONTINUE;
    END IF;
    -- (09/10, chantier E) UN DÉPÔT JAMAIS VU EN LIGNE N'EST JAMAIS UNE « VENTE
    -- POSSIBLE ». Depuis le 28/09 (point E), cette absence ouvrait la question
    -- « Plus en ligne — Vendue ? » : la G-Shock de Nico (3283733957), REFUSÉE
    -- par la modération Leboncoin 6 s après son dépôt, s'est retrouvée en
    -- bandeau « Vendue ? » le 08/10 ; 8 dépôts du parc ainsi depuis le 30/09.
    -- Ici l'annonce n'a JAMAIS été vue en ligne : aucun lien, jamais revue par
    -- la veille, absente de TOUT relevé (testé plus haut), absente de deux
    -- relevés complets après la grâce → ÉCHEC DE PUBLICATION, de notre côté
    -- (règle de Nico : un refus de modération est notre faute) : 'failed' avec
    -- son motif, publication rendue (refund_publish_unconfirmed, idempotent).
    -- Ni vente, ni stock touché, ni retrait, ni question.
    -- Une question « Vendue ? » déjà ouverte reste telle quelle (réparation sur GO).
    IF j.platform_fields ? 'unavailable_since' THEN
      n_attente := n_attente + 1; CONTINUE;
    END IF;
    IF j.vu_en_ligne_le IS NOT NULL THEN
      -- Vue en ligne un jour par la veille : la question d'avant tient.
      UPDATE cross_post_jobs SET platform_fields=COALESCE(platform_fields,'{}'::jsonb)
        || jsonb_build_object('sale_signal','unavailable','unavailable_since',v_run.finished_at,
          'absence_releves',jsonb_build_object('premier',v_precedent.id,'second',v_run.id,
            'identifiants',to_jsonb(v_ids),'le',now()))
        WHERE id=j.id;
      n_attente:=n_attente+1; CONTINUE;
    END IF;
    -- L'article est EN LIGNE sur cette plateforme sous une autre annonce DE LA
    -- MÊME FICHE (lien prouvé par la fiche, jamais par un titre) : ce dépôt est
    -- sans objet — clos sans rouge, sans invitation à republier un doublon.
    v_vivante := NULL;
    SELECT ap.listing_id, ap.url INTO v_vivante FROM annonces_plateforme ap
     WHERE j.inventaire_id IS NOT NULL AND ap.user_id = p_user AND ap.platform = p_platform
       AND ap.inventaire_id = j.inventaire_id AND ap.statut_plateforme = 'en_ligne' AND ap.disparu_le IS NULL
       AND ap.listing_id <> ALL(v_ids)
     ORDER BY ap.vu_le DESC LIMIT 1;
    -- Même PHOTO (empreinte identique) qu'une annonce EN LIGNE de ce compte sur
    -- cette plateforme : le doublon le plus probable du refus — dit dans le motif.
    v_doublon := NULL;
    SELECT ap.listing_id INTO v_doublon
      FROM inventaire i
      CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(i.photos::jsonb)='array' THEN i.photos::jsonb ELSE '[]'::jsonb END) ph
      JOIN photo_empreintes e1 ON e1.url = ph->>'url' AND e1.dhash IS NOT NULL
      JOIN annonces_plateforme ap ON ap.user_id = p_user AND ap.platform = p_platform
        AND ap.statut_plateforme = 'en_ligne' AND ap.disparu_le IS NULL AND ap.listing_id <> ALL(v_ids)
      JOIN photo_empreintes e2 ON e2.url = ap.photo_url AND e2.dhash = e1.dhash
     WHERE i.id = j.inventaire_id AND i.user_id = p_user
     LIMIT 1;
    IF v_vivante.listing_id IS NOT NULL THEN
      UPDATE cross_post_jobs SET status='cancelled',
        error = 'Ce dépôt n''a jamais été retrouvé dans tes annonces ' || v_nom || ', mais ton article y est en ligne sous l''annonce '
          || v_vivante.listing_id || ' : rien à refaire, rien n''est vendu.',
        platform_fields = (COALESCE(platform_fields,'{}'::jsonb) - ARRAY['sale_signal','unavailable_since','unavailable_pending_since'])
          || jsonb_build_object('depot_jamais_en_ligne', jsonb_build_object(
            'le', now(), 'premier', v_precedent.id, 'second', v_run.id, 'identifiants', to_jsonb(v_ids),
            'issue', 'article_en_ligne_ailleurs', 'annonce_en_ligne', v_vivante.listing_id))
       WHERE id = j.id AND status = 'published';
      n_attente := n_attente + 1; CONTINUE;
    END IF;
    -- (20/10, Louis) Comptes reliés sur une boutique PARTAGÉE : la fiche JUMELLE y est en ligne (vue par le relevé
    -- du compte relié) — ce dépôt était le doublon, refusé par la plateforme : clos sans rouge, rien à refaire.
    v_jum_id := NULL;
    IF j.inventaire_id IS NOT NULL
       AND EXISTS (SELECT 1 FROM fiches_liees_comptes f WHERE f.fiche_a = j.inventaire_id OR f.fiche_b = j.inventaire_id) THEN
      SELECT o.listing_id INTO v_jum_id FROM jumelle_occupe_plateformes(p_user, j.inventaire_id) o
       WHERE o.platform = p_platform AND o.statut = 'en_ligne' AND coalesce(o.listing_id, '') <> ALL(v_ids) LIMIT 1;
    END IF;
    IF v_jum_id IS NOT NULL THEN
      UPDATE cross_post_jobs SET status='cancelled',
        error = 'Ce dépôt n''a pas été mis en ligne par ' || v_nom || ' : ton article y est DÉJÀ en ligne sous l''annonce '
          || v_jum_id || ', publiée par ton compte FillSell relié — ' || v_nom || ' refuse les doublons. Rien à refaire, rien n''est vendu.',
        platform_fields = (COALESCE(platform_fields,'{}'::jsonb) - ARRAY['sale_signal','unavailable_since','unavailable_pending_since'])
          || jsonb_build_object('depot_jamais_en_ligne', jsonb_build_object(
            'le', now(), 'premier', v_precedent.id, 'second', v_run.id, 'identifiants', to_jsonb(v_ids),
            'issue', 'en_ligne_par_compte_relie', 'annonce_en_ligne', v_jum_id))
       WHERE id = j.id AND status = 'published';
      n_jumelle := n_jumelle + 1; n_attente := n_attente + 1; CONTINUE;
    END IF;
    v_refund := refund_publish_unconfirmed(j.id);
    -- (27/10) Aucune plateforme ne donne de motif ici : le texte dit l'absence constatée, jamais « refusée par sa
    -- modération » (une déduction). Un vrai motif lu au dépôt (adsubmit 4xx) a son propre texte, ailleurs.
    v_msg := 'Cette annonce est absente de tes annonces ' || v_nom || ' aux relevés complets du '
      || to_char(COALESCE(v_precedent.finished_at, v_precedent.started_at) AT TIME ZONE 'Europe/Paris', 'DD/MM à HH24"h"MI')
      || ' et du ' || v_releve_txt || ', et ' || v_nom || ' n''a donné aucun motif. '
      || CASE WHEN v_doublon.listing_id IS NOT NULL
           THEN 'Elle porte la même photo que ton annonce ' || v_doublon.listing_id || ', déjà en ligne sur ' || v_nom || '. '
           ELSE '' END
      || 'Rien n''est vendu, ton article reste dans ton stock, et cette publication ne compte pas dans tes limites.';
    UPDATE cross_post_jobs SET status = 'failed', error = v_msg,
      platform_fields = (COALESCE(platform_fields,'{}'::jsonb) - ARRAY['sale_signal','unavailable_since','unavailable_pending_since'])
        || jsonb_build_object('depot_jamais_en_ligne', jsonb_build_object(
          'le', now(), 'premier', v_precedent.id, 'second', v_run.id, 'identifiants', to_jsonb(v_ids),
          'issue', 'refus_moderation_probable', 'doublon_photo_de', v_doublon.listing_id, 'refund', v_refund))
     WHERE id = j.id AND status = 'published';
    n_refusees := n_refusees + 1;
  END LOOP;

  -- ── (20/10, Sébastien) UN DÉPÔT JAMAIS VU EN LIGNE N'EST JAMAIS UNE VENTE — AUSSI QUAND IL A UN LIEN ────────
  -- La boucle ci-dessus ne lit que les dépôts SANS lien. Un dépôt Beebs a toujours son lien (numéro → /fr/p/,
  -- déclencheur du 30/09) ; Leboncoin, eBay, Depop souvent. Jamais vu en ligne (aucun relevé de ce compte ne l'a
  -- vu, sous aucun statut ; la veille non plus), il ne pose plus la question « Plus en ligne — Vendue ? »
  -- (cross_post_jobs_vue_ou_pas_encore_visible) : il reste « pas encore visible ». Toujours absent de deux
  -- relevés complets après la grâce — 72 h pour Beebs (sa vérification est humaine), 4 h ailleurs — c'est un
  -- ÉCHEC DE PUBLICATION, traité comme celui d'au-dessus : 'failed' + motif + publication rendue, ou clos sans
  -- rouge quand l'article est en ligne ailleurs (même fiche, ou fiche jumelle d'un compte relié). Ni vente, ni
  -- stock touché, ni retrait, ni question. Vinted jamais (sa preuve est le dressing). Une question déjà ouverte
  -- reste telle quelle. Bornée : 14 derniers jours, 25 par relevé.
  IF p_platform <> 'vinted' THEN
    -- (25/10, proposition — mesure N11) Beebs : 7 jours, pas 72 h. 18 dépôts sortis de la vérification sans être en
    -- ligne le sont devenus 48 à 126 h plus tard (bd380fbf 34113827 : 67,6 h ; DeadRoz : 16 annonces à 86-126 h) ;
    -- à 7 jours, 0 faux refus sur 1 293 dépôts vus en ligne (31 jours).
    v_grace := CASE WHEN p_platform = 'beebs' THEN interval '7 days' ELSE interval '4 hours' END;
    FOR j IN
      SELECT c.id, c.platform_listing_id, c.listing_url, c.platform_fields, c.inventaire_id, c.vu_en_ligne_le,
             COALESCE(c.published_at, c.created_at) AS publie
        FROM cross_post_jobs c
       WHERE c.user_id = p_user AND c.platform = p_platform
         AND c.status = 'published' AND c.action = 'publish' AND c.listing_url IS NOT NULL
         AND c.vu_en_ligne_le IS NULL
         AND NOT (COALESCE(c.platform_fields, '{}'::jsonb) ? 'unavailable_since')
         AND COALESCE(c.published_at, c.created_at) > now() - interval '14 days'
         AND COALESCE(c.published_at, c.created_at) < now() - v_grace
         AND NOT EXISTS (SELECT 1 FROM annonces_plateforme ap
                          WHERE ap.user_id = p_user AND ap.platform = p_platform
                            AND ap.listing_id IN (btrim(c.platform_listing_id), annonce_id_job(p_platform, c.listing_url)))
       ORDER BY COALESCE(c.published_at, c.created_at)
       LIMIT 25 FOR UPDATE OF c SKIP LOCKED
    LOOP
      v_ids := ARRAY(
        SELECT DISTINCT x FROM unnest(ARRAY[
          NULLIF(btrim(j.platform_listing_id), ''),
          annonce_id_job(p_platform, j.listing_url),
          NULLIF(btrim(j.platform_fields #>> '{lbc_depot,adsubmit,id}'), ''),
          NULLIF(btrim(j.platform_fields #>> '{lbc_depot,sans_adsubmit,id}'), '')
        ]) AS x WHERE x IS NOT NULL AND x ~ '^[0-9]{6,}$');
      IF COALESCE(array_length(v_ids, 1), 0) = 0 THEN n_attente := n_attente + 1; CONTINUE; END IF;
      -- Vue par un relevé sous un de ses identifiants, ou rattachée au job (tout statut, « en vérification »
      -- compris) : ce n'est pas un refus — la plateforme l'examine encore, ou elle est en ligne.
      IF EXISTS (SELECT 1 FROM annonces_plateforme ap
                  WHERE ap.user_id = p_user AND ap.platform = p_platform
                    AND (ap.listing_id = ANY(v_ids) OR ap.job_id = j.id)) THEN
        n_attente := n_attente + 1; CONTINUE;
      END IF;
      IF v_precedent.id IS NULL OR v_precedent.started_at < j.publie + v_grace THEN
        n_attente := n_attente + 1; CONTINUE;
      END IF;
      v_vivante := NULL;
      SELECT ap.listing_id, ap.url INTO v_vivante FROM annonces_plateforme ap
       WHERE j.inventaire_id IS NOT NULL AND ap.user_id = p_user AND ap.platform = p_platform
         AND ap.inventaire_id = j.inventaire_id AND ap.statut_plateforme = 'en_ligne' AND ap.disparu_le IS NULL
         AND ap.listing_id <> ALL(v_ids)
       ORDER BY ap.vu_le DESC LIMIT 1;
      v_jum_id := NULL;
      IF v_vivante.listing_id IS NULL AND j.inventaire_id IS NOT NULL
         AND EXISTS (SELECT 1 FROM fiches_liees_comptes f WHERE f.fiche_a = j.inventaire_id OR f.fiche_b = j.inventaire_id) THEN
        SELECT o.listing_id INTO v_jum_id FROM jumelle_occupe_plateformes(p_user, j.inventaire_id) o
         WHERE o.platform = p_platform AND o.statut = 'en_ligne' AND coalesce(o.listing_id, '') <> ALL(v_ids) LIMIT 1;
      END IF;
      -- (24/10, point 6 — jocabroc8) Une annonce eBay dont la veille a lu la FIN (fin_ebay.fin, aucune vente) a été
      -- EN LIGNE : eBay l'a acceptée, puis elle y a été arrêtée — pas par FillSell (ce job est encore « publié » :
      -- aucun retrait FillSell ne l'a close). Pages eBay relues le 23/10 : « Le vendeur a mis fin à cette annonce …
      -- car elle comportait une erreur », 2 et 17 min après la mise en ligne. Ce n'est PAS un refus : close sans
      -- rouge, avec sa date (et l'annonce sous laquelle l'article est en ligne, s'il l'est). Quotas comme avant :
      -- rendue seulement là où l'ancien jugement la rendait (aucun article en ligne ailleurs).
      IF p_platform = 'ebay' AND _ts_ou_null(j.platform_fields #>> '{fin_ebay,fin}') IS NOT NULL
         AND coalesce(j.platform_fields #>> '{fin_ebay,vendus}', '0') ~ '^0+$' THEN
        v_refund := CASE WHEN v_vivante.listing_id IS NULL AND v_jum_id IS NULL THEN refund_publish_unconfirmed(j.id) END;
        UPDATE cross_post_jobs SET status = 'cancelled',
          error = 'Cette annonce a bien été en ligne sur eBay, puis elle y a été arrêtée le '
            || to_char(_ts_ou_null(j.platform_fields #>> '{fin_ebay,fin}') AT TIME ZONE 'Europe/Paris', 'DD/MM à HH24"h"MI')
            || ' — pas par FillSell, et sans vente. Ce n''est pas un refus d''eBay. '
            || CASE WHEN v_vivante.listing_id IS NOT NULL
                 THEN 'Ton article y est en ligne sous l''annonce ' || v_vivante.listing_id || ' : rien à refaire.'
                 WHEN v_jum_id IS NOT NULL
                 THEN 'Ton article y est en ligne sous l''annonce ' || v_jum_id || ', publiée par ton compte FillSell relié : rien à refaire.'
                 ELSE 'Ton article reste dans ton stock ; si cet arrêt n''était pas voulu, relance la publication depuis la fiche.' END,
          platform_fields = (COALESCE(platform_fields, '{}'::jsonb) - ARRAY['sale_signal','unavailable_since','unavailable_pending_since','pas_encore_visible'])
            || jsonb_build_object('depot_jamais_en_ligne', jsonb_build_object(
              'le', now(), 'premier', v_precedent.id, 'second', v_run.id, 'identifiants', to_jsonb(v_ids),
              'issue', 'arretee_sur_ebay', 'fin', j.platform_fields #>> '{fin_ebay,fin}',
              'annonce_en_ligne', coalesce(v_vivante.listing_id, v_jum_id), 'refund', v_refund, 'avec_lien', true))
         WHERE id = j.id AND status = 'published';
        n_attente := n_attente + 1; CONTINUE;
      END IF;
      IF v_vivante.listing_id IS NOT NULL OR v_jum_id IS NOT NULL THEN
        UPDATE cross_post_jobs SET status = 'cancelled',
          error = CASE WHEN v_vivante.listing_id IS NOT NULL
            THEN 'Ce dépôt n''a jamais été retrouvé dans tes annonces ' || v_nom || ', mais ton article y est en ligne sous l''annonce '
                 || v_vivante.listing_id || ' : rien à refaire, rien n''est vendu.'
            ELSE 'Ce dépôt n''a pas été mis en ligne par ' || v_nom || ' : ton article y est DÉJÀ en ligne sous l''annonce '
                 || v_jum_id || ', publiée par ton compte FillSell relié — ' || v_nom || ' refuse les doublons. Rien à refaire, rien n''est vendu.' END,
          platform_fields = (COALESCE(platform_fields, '{}'::jsonb) - ARRAY['sale_signal','unavailable_since','unavailable_pending_since','pas_encore_visible'])
            || jsonb_build_object('depot_jamais_en_ligne', jsonb_build_object(
              'le', now(), 'premier', v_precedent.id, 'second', v_run.id, 'identifiants', to_jsonb(v_ids),
              'issue', CASE WHEN v_vivante.listing_id IS NOT NULL THEN 'article_en_ligne_ailleurs' ELSE 'en_ligne_par_compte_relie' END,
              'annonce_en_ligne', coalesce(v_vivante.listing_id, v_jum_id), 'avec_lien', true))
         WHERE id = j.id AND status = 'published';
        IF v_jum_id IS NOT NULL THEN n_jumelle := n_jumelle + 1; END IF;
        n_attente := n_attente + 1; CONTINUE;
      END IF;
      v_doublon := NULL;
      SELECT ap.listing_id INTO v_doublon
        FROM inventaire i
        CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(i.photos::jsonb)='array' THEN i.photos::jsonb ELSE '[]'::jsonb END) ph
        JOIN photo_empreintes e1 ON e1.url = ph->>'url' AND e1.dhash IS NOT NULL
        JOIN annonces_plateforme ap ON ap.user_id = p_user AND ap.platform = p_platform
          AND ap.statut_plateforme = 'en_ligne' AND ap.disparu_le IS NULL AND ap.listing_id <> ALL(v_ids)
        JOIN photo_empreintes e2 ON e2.url = ap.photo_url AND e2.dhash = e1.dhash
       WHERE i.id = j.inventaire_id AND i.user_id = p_user
       LIMIT 1;
      v_refund := refund_publish_unconfirmed(j.id);
      v_msg := CASE WHEN p_platform = 'beebs'
             THEN 'Sept jours après le dépôt, cette annonce n''est ni en ligne ni « en vérification » dans tes annonces Beebs'
             ELSE 'Cette annonce est absente de tes annonces ' || v_nom END
        || ' aux relevés complets du ' || to_char(COALESCE(v_precedent.finished_at, v_precedent.started_at) AT TIME ZONE 'Europe/Paris', 'DD/MM à HH24"h"MI')
        || ' et du ' || v_releve_txt || ', et ' || v_nom || ' n''a donné aucun motif. '
        || CASE WHEN v_doublon.listing_id IS NOT NULL
             THEN 'Elle porte la même photo que ton annonce ' || v_doublon.listing_id || ', déjà en ligne sur ' || v_nom || '. '
             ELSE '' END
        || 'Rien n''est vendu, ton article reste dans ton stock, et cette publication ne compte pas dans tes limites.';
      UPDATE cross_post_jobs SET status = 'failed', error = v_msg,
        platform_fields = (COALESCE(platform_fields, '{}'::jsonb) - ARRAY['sale_signal','unavailable_since','unavailable_pending_since','pas_encore_visible'])
          || jsonb_build_object('depot_jamais_en_ligne', jsonb_build_object(
            'le', now(), 'premier', v_precedent.id, 'second', v_run.id, 'identifiants', to_jsonb(v_ids),
            'issue', 'refus_moderation_probable', 'doublon_photo_de', v_doublon.listing_id, 'refund', v_refund, 'avec_lien', true))
       WHERE id = j.id AND status = 'published';
      n_jamais_vues := n_jamais_vues + 1;
    END LOOP;
  END IF;

  RETURN jsonb_build_object('ok', true, 'run_id', p_run_id, 'platform', p_platform,
                            'refusees', n_refusees + n_jamais_vues, 'en_ligne', n_en_ligne, 'en_attente', n_attente,
                            'jamais_vues_avec_lien', n_jamais_vues, 'compte_relie', n_jumelle, 'redevenues_visibles', n_visibles,
                            'refermees', v_refermees);
END;
$function$
;

DROP FUNCTION IF EXISTS public.beebs_message_jamais_en_ligne(jsonb, boolean, text);
DROP FUNCTION IF EXISTS public.beebs_preuve_jamais_en_ligne(uuid, text, timestamp with time zone, numeric, jsonb, uuid);
DROP FUNCTION IF EXISTS public.releve_beebs_voit_tout_en_ligne(uuid);

DO $relu$
BEGIN
  IF md5(pg_get_functiondef('public.trancher_publications_sans_lien(uuid,text,uuid)'::regprocedure)) <> '6ea3fdf30588cf009c3bf3ba50ec1058' THEN
    RAISE EXCEPTION 'inverse 20261029200000 : trancher_publications_sans_lien n''est pas revenue à la définition lue en prod le 29/10';
  END IF;
END
$relu$;

do $inverse$
begin
  insert into _r values ('I1 inverse rejoué : trancher revenue à la prod (md5 6ea3fdf…), les trois fonctions retirées',
    md5(pg_get_functiondef('public.trancher_publications_sans_lien(uuid,text,uuid)'::regprocedure)) = '6ea3fdf30588cf009c3bf3ba50ec1058'
    and to_regprocedure('public.beebs_preuve_jamais_en_ligne(uuid,text,timestamp with time zone,numeric,jsonb,uuid)') is null
    and to_regprocedure('public.releve_beebs_voit_tout_en_ligne(uuid)') is null
    and to_regprocedure('public.beebs_message_jamais_en_ligne(jsonb,boolean,text)') is null, null);
end
$inverse$;
select essai, ok, detail from (
  select essai, ok, detail from _r
  union all select 'Σ verts', bool_and(ok), (count(*) filter (where ok))::text || '/' || count(*)::text from _r) s
 order by essai;
rollback;
