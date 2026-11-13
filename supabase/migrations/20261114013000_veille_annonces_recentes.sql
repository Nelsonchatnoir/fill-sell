-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 20261114013000 — LA VEILLE LIT AUSSI LA PREMIÈRE PAGE DES ANNONCES RÉCENTES ET IMPORTE TOUT NUMÉRO INCONNU
-- (14/11/2026, bloc C2 — demande de Nico ; PRÉPARÉE, NON APPLIQUÉE : feu vert de Nico)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- LA DEMANDE : « Veille des ventes : pendant chaque passage, lire aussi la première page des annonces les plus récentes
-- et importer tout numéro inconnu. Une seule page par passage, rattachement par empreinte des photos, même mécanisme
-- Cloud et extension, aucun quota, aucun doublon créé. »
--
-- LE CONSTAT (13/11, lecture seule) : la veille (cron, veilleur, veille des commandes) n'importe RIEN (règle du 05/10) ;
-- une annonce créée sur la plateforme hors FillSell attend un « Synchroniser ». Vus par un relevé des 7 derniers jours,
-- en ligne, sans fiche, sans tâche, jamais écartés : Vinted 2 575 numéros (49 comptes ; 78 chez 12 comptes payants, les
-- seuls que la veille des commandes sert) ; Leboncoin 1 196 annonces en ligne sans fiche (37 comptes ; 834 jamais
-- décidées ni portées par une tâche ; 81 chez des comptes payants).
--
-- LA RÈGLE (tous comptes servis par la veille, ordinateur et Cloud — la copie Cloud est construite depuis la même
-- extension) :
--   · à chaque passage de la veille (10 min ± 90 s, par plateforme), l'extension lit UNE page : Vinted, la page 1 du
--     dressing « les plus récentes d'abord » (la même lecture que le relevé, SYNC_DRESSING_PAGE) ; Leboncoin, la page 1
--     de « Mes annonces » (releverLeboncoinParApi({ pagesMax: 1 }), triée par date) ;
--   · les numéros jamais vus par CE poste partent à veille_recentes_ouvrir (ci-dessous), qui seule dit lesquels sont
--     INCONNUS — un numéro déjà connu n'est JAMAIS réimporté : une fiche le porte (Vinted), une tâche le porte (dépôt
--     FillSell, job de suivi d'un import : il survit à la fiche supprimée, ON DELETE SET NULL — 3 729 des 3 761 numéros
--     Vinted « importés puis absents » du 13/11 le prouvent), il a été écarté (brouillon, sans photo, compte relié,
--     autre compte), ou (Leboncoin) son annonce a déjà une décision (rattachée, ignorée, fiche supprimée, retirée,
--     disparue, question posée, ligne de rapprochement) ;
--   · inconnus → un relevé d'UNE page (vinted_sync_runs.kind = 'recentes', déclencheur 'veille:recentes') : Vinted, le
--     chemin d'import du dressing (enregistrerArticlesDressing, importer) ; Leboncoin, l'écriture du relevé
--     (annonces_plateforme, run_id de ce relevé) ; clos par veille_recentes_clore en 'incomplete' (« [incomplet] » :
--     aucun verdict, jamais un relevé complet), il réveille le moteur v3 (trg_rapprochement_fin_recentes →
--     rapprochement_fin_run, inchangée) qui RATTACHE PAR LES PHOTOS (empreintes) ou pose la question hors du stock,
--     sinon crée — les règles du moteur, inchangées (jamais le titre seul, deux annonces d'une plateforme = deux
--     exemplaires, le doute devient une question) ;
--   · la seule ouverture : rapprochement_v3_fiche_de laisse créer la fiche d'une annonce apportée par un relevé
--     'recentes' CLOS 'incomplete' (comme un geste) — aucune autre ;
--   · rapprochement_v3_releves_en_cours compte aussi un relevé 'recentes' en cours : le moteur attend la fin de
--     l'écriture (photos de la liste comprises) ;
--   · aucun quota : ni débit, ni compteur (aucune table de pièces ni de quota n'est lue ou écrite ici) ;
--   · interrupteur coin_config.veille_recentes_ouverte (posé à 0 : rien ne part avant le feu vert de Nico), lu par
--     l'extension (veille_recentes_droits) ET par la porte (veille_recentes_ouvrir, fail-closed).
-- Le genre 'recentes' n'entre dans AUCUNE lecture des relevés complets (toutes filtrent kind IN ('annonces','dressing') :
-- 52 fonctions relues le 13/11 ; l'app : syncPlateformes.js, vintedSync.js, boutonSynchro.js filtrent le genre) : ni
-- cadence du relevé quotidien, ni preuve d'absence, ni « relevé mort » masqué (releves_morts_veille ne compte que
-- 'done'), ni écran de synchronisation. Gardes reprises dans la porte : interrupteur, palier payant (palier_de),
-- plateforme écartée, pause des relevés, pause anti-robot Vinted, boutique Vinted confirmée, compte Leboncoin nommé et égal à celui du dernier relevé complet, aucun relevé de la
-- plateforme en cours ou en file, aucune republication engagée (retrait fait, recréation pas encore), aucune tâche de
-- la plateforme en cours (« processing »).
-- Rien d'autre ne change : les deux corps modifiés sont ceux de PROD relus le 13/11 (garde md5), les ajouts entre
-- marqueurs ⟦14/11 C2 … ⟧, aucune ligne de prod modifiée ni retirée. Aucune donnée réécrite à l'application.
-- Banc (Postgres jetable) : node scripts/veille-annonces-recentes-banc.mjs (PREUVE_PG, ou un Postgres embarqué neuf).
-- Verrou : npm run selftest:veille-annonces-recentes.
-- Inverse : supabase/rollbacks/20261114013000_veille_annonces_recentes_INVERSE.sql (les corps de prod à l'octet).
-- Appliquer (feu vert) : npx supabase db query --linked -f supabase/migrations/20261114013000_veille_annonces_recentes.sql
--                        npx supabase migration repair --linked --status applied 20261114013000
--   puis, sur un second feu vert : UPDATE coin_config SET value = 1 WHERE key = 'veille_recentes_ouverte';
BEGIN;
SET LOCAL statement_timeout = '60s';
SET LOCAL lock_timeout = '5s';

-- Les corps EN PROD relus le 13/11 (md5 de pg_get_functiondef) : on s'arrête si l'un a changé depuis. Le second md5 est
-- celui de CETTE migration déjà appliquée (rejouée : idempotente).
DO $verif$
DECLARE r record;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('public.rapprochement_v3_fiche_de(uuid,uuid,boolean)', '43a77328b052658dc5b4f646b767ef7d', 'ebdcb9c21bdad9d566f3bee583a0fb79'),
    ('public.rapprochement_v3_releves_en_cours(uuid)', '6d7c4f4801fd15fb2cebbdd2eae00b11', '20d565d0c1b266e4bf8a1e22cf0eddfd'),
    ('public.rapprochement_fin_run()', '1cc2a2516cda582dd0ef68603ed626c5', '1cc2a2516cda582dd0ef68603ed626c5')) AS t(f, m, m_apres)
  LOOP
    IF md5(pg_get_functiondef(r.f::regprocedure)) NOT IN (r.m, r.m_apres) THEN
      RAISE EXCEPTION '% a changé en prod depuis sa lecture du 13/11 (md5 attendu %) : relire, reconstruire, jamais forcer', r.f, r.m;
    END IF;
  END LOOP;
END $verif$;

-- ── 0. L'interrupteur, FERMÉ ─────────────────────────────────────────────────────────────────────────────────────────
INSERT INTO public.coin_config (key, value) VALUES ('veille_recentes_ouverte', 0) ON CONFLICT (key) DO NOTHING;

-- ── 1. Le tri des numéros lus : NULL = inconnu (à importer), sinon ce qui le fait connaître ─────────────────────────
-- Pure lecture, bornée à 120 numéros, un balayage par table et par appel (index : inventaire (user_id, vinted_item_id),
-- annonces_plateforme (user_id, platform, listing_id), cross_post_jobs (user_id, …)).
CREATE OR REPLACE FUNCTION public.veille_recentes_trier(p_user uuid, p_platform text, p_ids text[])
 RETURNS TABLE(listing_id text, connu text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH ids AS (
    SELECT DISTINCT btrim(x) AS id FROM unnest(COALESCE(p_ids, '{}'::text[])) AS x
     WHERE btrim(x) ~ '^[0-9]{4,20}$'
     LIMIT 120),
  t AS (SELECT COALESCE(array_agg(id), '{}'::text[]) AS a FROM ids),
  fiches AS (
    SELECT DISTINCT i.vinted_item_id AS id FROM inventaire i, t
     WHERE p_platform = 'vinted' AND i.user_id = p_user AND i.vinted_item_id = ANY (t.a)),
  taches AS (
    SELECT DISTINCT v.id FROM cross_post_jobs j, t,
      LATERAL (VALUES (btrim(COALESCE(j.platform_listing_id, ''))),
                      (btrim(COALESCE(j.platform_fields -> 'copie_par_numero' ->> 'id', ''))),
                      (btrim(COALESCE(j.platform_fields -> 'lbc_depot' -> 'adsubmit' ->> 'id', '')))) AS v(id)
     WHERE j.user_id = p_user AND j.platform = p_platform AND v.id <> '' AND v.id = ANY (t.a)),
  ecartees AS (
    SELECT DISTINCT e.vinted_item_id AS id FROM sync_import_ecartes e, t
     WHERE e.user_id = p_user AND e.vinted_item_id = ANY (t.a)
       AND ((p_platform = 'vinted' AND (COALESCE(e.motif, '') NOT LIKE '%:%' OR e.motif LIKE '%:vinted'))
            OR (p_platform <> 'vinted' AND e.motif LIKE '%:' || p_platform))),
  annonces AS (
    SELECT a.listing_id AS id FROM annonces_plateforme a, t
     WHERE p_platform <> 'vinted' AND a.user_id = p_user AND a.platform = p_platform AND a.listing_id = ANY (t.a)
       AND (a.inventaire_id IS NOT NULL OR a.ignoree_le IS NOT NULL OR a.fiche_supprimee_le IS NOT NULL
            OR a.retiree_le IS NOT NULL OR a.disparu_le IS NOT NULL OR a.proposition IS NOT NULL
            OR EXISTS (SELECT 1 FROM rapprochements r WHERE r.annonce_id = a.id)))
  SELECT ids.id,
         CASE WHEN ids.id IN (SELECT f.id FROM fiches f) THEN 'fiche'
              WHEN ids.id IN (SELECT k.id FROM taches k) THEN 'tache'
              WHEN ids.id IN (SELECT e.id FROM ecartees e) THEN 'ecartee'
              WHEN ids.id IN (SELECT n.id FROM annonces n) THEN 'annonce'
         END
    FROM ids
   ORDER BY ids.id;
$function$;
REVOKE ALL ON FUNCTION public.veille_recentes_trier(uuid, text, text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.veille_recentes_trier(uuid, text, text[]) TO service_role;

-- ── 2. Les droits de la veille des annonces récentes (lus par l'extension avec ceux de la veille, toutes les 30 min) ─
CREATE OR REPLACE FUNCTION public.veille_recentes_droits()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT jsonb_build_object(
    'ouverte', COALESCE((SELECT value FROM coin_config WHERE key = 'veille_recentes_ouverte'), 0) = 1,
    'plateformes', jsonb_build_array('vinted', 'leboncoin'))
   WHERE auth.uid() IS NOT NULL;
$function$;
REVOKE ALL ON FUNCTION public.veille_recentes_droits() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.veille_recentes_droits() TO authenticated, service_role;

-- ── 3. LA PORTE : ce que la veille a lu → les inconnus, et le relevé d'une page qui les importera ──────────────────
-- Rend { ok, motif?, lues, inconnus[], connus{raison: n}, run_id? }. Aucune écriture quand rien n'est inconnu (sauf la
-- clôture d'un relevé 'recentes' FIGÉ de ce compte, plus de 10 min sans nouvelle : jamais un verrou).
CREATE OR REPLACE FUNCTION public.veille_recentes_ouvrir(p_platform text, p_ids text[], p_compte text DEFAULT NULL, p_build text DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_palier text;
  v_lues int := 0;
  v_inconnus text[] := '{}'::text[];
  v_connus jsonb := '{}'::jsonb;
  v_run uuid;
BEGIN
  IF v_user IS NULL THEN RETURN jsonb_build_object('ok', false, 'motif', 'session'); END IF;
  IF COALESCE((SELECT value FROM coin_config WHERE key = 'veille_recentes_ouverte'), 0) <> 1 THEN
    RETURN jsonb_build_object('ok', false, 'motif', 'fermee');
  END IF;
  IF p_platform IS NULL OR p_platform NOT IN ('vinted', 'leboncoin') THEN RETURN jsonb_build_object('ok', false, 'motif', 'plateforme'); END IF;
  v_palier := palier_de(v_user);
  IF v_palier IS NULL OR v_palier NOT IN ('premium', 'pro', 'business') THEN RETURN jsonb_build_object('ok', false, 'motif', 'palier'); END IF;
  IF plateforme_ecartee_pour(v_user, p_platform) THEN RETURN jsonb_build_object('ok', false, 'motif', 'ecartee'); END IF;
  IF EXISTS (SELECT 1 FROM pause_releves pr WHERE pr.user_id = v_user AND pr.leve_le IS NULL AND p_platform = ANY (pr.platforms)) THEN
    RETURN jsonb_build_object('ok', false, 'motif', 'pause_releves');
  END IF;
  IF p_platform = 'vinted' AND compte_en_pause_antirobot(v_user) THEN RETURN jsonb_build_object('ok', false, 'motif', 'pause_antirobot'); END IF;
  -- Vinted : la boutique lue doit être une boutique CONFIRMÉE du compte (jamais adoptée ici, jamais une question).
  IF p_platform = 'vinted' AND NOT COALESCE(boutique_vinted_confirmee(v_user, p_compte), false) THEN
    RETURN jsonb_build_object('ok', false, 'motif', 'boutique');
  END IF;
  -- Leboncoin : le compte lu doit être nommé, et celui du dernier relevé complet quand il est connu (règle du 08/11 : deux
  -- comptes ne se mélangent jamais) — un autre compte ouvert dans Chrome n'est jamais importé d'office.
  IF p_platform = 'leboncoin' AND (p_compte IS NULL OR p_compte !~ '^[A-Za-z0-9-]{3,80}$') THEN
    RETURN jsonb_build_object('ok', false, 'motif', 'compte_inconnu');
  END IF;
  IF p_platform = 'leboncoin' AND EXISTS (
       SELECT 1 FROM (SELECT s.compte_plateforme FROM vinted_sync_runs s
                       WHERE s.user_id = v_user AND s.kind = 'annonces' AND s.platform = 'leboncoin' AND s.status = 'done'
                         AND s.compte_plateforme IS NOT NULL
                       ORDER BY s.started_at DESC NULLS LAST LIMIT 1) d
        WHERE d.compte_plateforme IS DISTINCT FROM p_compte) THEN
    RETURN jsonb_build_object('ok', false, 'motif', 'compte_change');
  END IF;
  -- Un passage 'recentes' FIGÉ (service worker tué en route) ne retient jamais le suivant : clos, rien conclu.
  UPDATE vinted_sync_runs SET status = 'expired', finished_at = now(), updated_at = now(),
         erreur = '[veille_recentes] passage interrompu (aucune nouvelle de l''extension depuis 10 min) — rien conclu'
   WHERE user_id = v_user AND kind = 'recentes' AND platform = p_platform AND status IN ('queued', 'running')
     AND COALESCE(progres_le, updated_at, started_at) < now() - interval '10 minutes';
  -- Un relevé de la plateforme en cours ou en file : c'est lui qui lira (jamais deux lectures ensemble).
  IF EXISTS (SELECT 1 FROM vinted_sync_runs s
              WHERE s.user_id = v_user AND s.status IN ('queued', 'running')
                AND ((p_platform = 'vinted' AND s.kind = 'dressing') OR (s.kind IN ('annonces', 'recentes') AND s.platform = p_platform))) THEN
    RETURN jsonb_build_object('ok', false, 'motif', 'releve_en_cours');
  END IF;
  -- Une republication engagée (retrait fait, recréation à venir ou en vol) : sa copie ne s'importe jamais à sa place.
  IF republication_entre_retrait_et_recreation(v_user, p_platform) IS NOT NULL
     OR EXISTS (SELECT 1 FROM cross_post_jobs j
                 WHERE j.user_id = v_user AND j.platform = p_platform AND j.action = 'republish'
                   AND j.status IN ('pending', 'processing', 'needs_user')
                   AND j.platform_fields ->> 'republish_step' = 'deleted') THEN
    RETURN jsonb_build_object('ok', false, 'motif', 'republication');
  END IF;
  -- Une tâche de la plateforme en cours (dépôt dont le numéro n'est pas encore rendu) : on attend le passage suivant.
  IF EXISTS (SELECT 1 FROM cross_post_jobs j WHERE j.user_id = v_user AND j.platform = p_platform AND j.status = 'processing') THEN
    RETURN jsonb_build_object('ok', false, 'motif', 'tache_en_cours');
  END IF;

  -- Un seul tri (mesuré en prod le 13/11 sur le compte le plus chargé, 100 numéros Leboncoin : 70 ms, lecture seule).
  WITH t AS MATERIALIZED (SELECT * FROM veille_recentes_trier(v_user, p_platform, p_ids))
  SELECT (SELECT count(*)::int FROM t),
         COALESCE((SELECT array_agg(t.listing_id ORDER BY t.listing_id) FROM t WHERE t.connu IS NULL), '{}'::text[]),
         COALESCE((SELECT jsonb_object_agg(x.connu, x.n) FROM (SELECT t.connu, count(*) n FROM t WHERE t.connu IS NOT NULL GROUP BY 1) x), '{}'::jsonb)
    INTO v_lues, v_inconnus, v_connus;

  IF cardinality(v_inconnus) = 0 THEN
    RETURN jsonb_build_object('ok', true, 'lues', v_lues, 'inconnus', '[]'::jsonb, 'connus', v_connus);
  END IF;

  BEGIN
    INSERT INTO vinted_sync_runs (user_id, kind, platform, status, declencheur, extension_build, items_vus, total_entries,
                                  compte_plateforme, started_at, claimed_at, updated_at)
    VALUES (v_user, 'recentes', p_platform, 'running', 'veille:recentes', left(p_build, 120), v_lues, cardinality(v_inconnus),
            CASE WHEN p_platform = 'leboncoin' AND p_compte ~ '^[A-Za-z0-9-]{3,80}$' THEN p_compte END, now(), now(), now())
    RETURNING id INTO v_run;
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('ok', false, 'motif', 'releve_en_cours');
  END;
  IF v_run IS NULL THEN RETURN jsonb_build_object('ok', false, 'motif', 'garde'); END IF;   -- un déclencheur l'a écarté
  RETURN jsonb_build_object('ok', true, 'lues', v_lues, 'inconnus', to_jsonb(v_inconnus), 'connus', v_connus, 'run_id', v_run);
END;
$function$;
REVOKE ALL ON FUNCTION public.veille_recentes_ouvrir(text, text[], text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.veille_recentes_ouvrir(text, text[], text, text) TO authenticated, service_role;

-- ── 4. La clôture : 'incomplete' (« [incomplet] » : une page, aucun verdict) ou 'failed' — jamais 'done' ───────────────
CREATE OR REPLACE FUNCTION public.veille_recentes_clore(p_run uuid, p_bilan jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_ok boolean := COALESCE(p_bilan ->> 'ok', '') = 'true';
  v_crees int := CASE WHEN COALESCE(p_bilan ->> 'crees', '') ~ '^[0-9]{1,5}$' THEN (p_bilan ->> 'crees')::int ELSE 0 END;
  v_ecrites int := CASE WHEN COALESCE(p_bilan ->> 'ecrites', '') ~ '^[0-9]{1,5}$' THEN (p_bilan ->> 'ecrites')::int ELSE 0 END;
  v_n int;
BEGIN
  IF v_user IS NULL THEN RETURN jsonb_build_object('ok', false, 'motif', 'session'); END IF;
  UPDATE vinted_sync_runs SET
         status = CASE WHEN v_ok THEN 'incomplete' ELSE 'failed' END,
         finished_at = now(), updated_at = now(),
         items_crees = v_crees, items_maj = v_ecrites,
         erreur = left(CASE WHEN v_ok THEN '[incomplet] [veille_recentes] première page seulement — '
                            ELSE '[veille_recentes] échec — ' END || COALESCE(p_bilan ->> 'note', ''), 500)
   WHERE id = p_run AND user_id = v_user AND kind = 'recentes' AND status = 'running';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN jsonb_build_object('ok', v_n = 1, 'statut', CASE WHEN v_n = 1 THEN (CASE WHEN v_ok THEN 'incomplete' ELSE 'failed' END) END);
END;
$function$;
REVOKE ALL ON FUNCTION public.veille_recentes_clore(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.veille_recentes_clore(uuid, jsonb) TO authenticated, service_role;

-- ── 5. La fin d'un relevé 'recentes' réveille le moteur (la fonction de prod, inchangée) ──────────────────────────────
DROP TRIGGER IF EXISTS trg_rapprochement_fin_recentes ON public.vinted_sync_runs;
CREATE TRIGGER trg_rapprochement_fin_recentes AFTER UPDATE OF status ON public.vinted_sync_runs
  FOR EACH ROW WHEN (((old.status IS DISTINCT FROM new.status) AND (new.status <> ALL (ARRAY['queued'::text, 'running'::text]))
                      AND (new.kind = 'recentes'::text)))
  EXECUTE FUNCTION rapprochement_fin_run();

-- ── 6. rapprochement_v3_releves_en_cours : le corps de prod + le relevé 'recentes' en cours ⟦14/11 C2⟧ ──────────────
-- (la seule ligne de prod touchée : la dernière perd son « ; », l'ajout la suit)
CREATE OR REPLACE FUNCTION public.rapprochement_v3_releves_en_cours(p_user uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT EXISTS (SELECT 1 FROM vinted_sync_runs s
                  WHERE s.user_id = p_user AND s.kind IN ('annonces', 'dressing')
                    AND ((s.status = 'queued' AND COALESCE(s.queued_at, s.updated_at) > now() - interval '30 minutes')
                      OR (s.status = 'running' AND COALESCE(s.progres_le, s.updated_at, s.started_at) > now() - interval '10 minutes')))
      -- ⟦14/11 C2⟧ le relevé d'une page de la veille (genre 'recentes') : le moteur attend qu'il ait fini d'écrire
      OR EXISTS (SELECT 1 FROM vinted_sync_runs s
                  WHERE s.user_id = p_user AND s.kind = 'recentes' AND s.status = 'running'
                    AND COALESCE(s.progres_le, s.updated_at, s.started_at) > now() - interval '10 minutes');
$function$;

-- ── 7. rapprochement_v3_fiche_de : le corps de prod + l'annonce d'un relevé 'recentes' CLOS importe comme un geste ⟦14/11 C2⟧
CREATE OR REPLACE FUNCTION public.rapprochement_v3_fiche_de(p_user uuid, p_annonce uuid, p_geste boolean)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE a annonces_plateforme%ROWTYPE; v_run vinted_sync_runs%ROWTYPE; v_imp jsonb;
BEGIN
  SELECT * INTO a FROM annonces_plateforme WHERE id = p_annonce AND user_id = p_user;
  IF a.id IS NULL THEN RETURN NULL; END IF;
  IF a.inventaire_id IS NOT NULL THEN RETURN a.inventaire_id; END IF;
  IF a.platform = 'opla' AND opla_sortie_passee() THEN RETURN NULL; END IF;   -- (22/10) Opla quittée : jamais une fiche neuve
  IF a.ignoree_le IS NOT NULL OR a.disparu_le IS NOT NULL OR a.fiche_supprimee_le IS NOT NULL THEN RETURN NULL; END IF;
  IF a.statut_plateforme IS DISTINCT FROM 'en_ligne' THEN RETURN NULL; END IF;
  IF releve_run_hors_liste(a.run_id) THEN RETURN NULL; END IF;
  IF a.platform = 'ebay' AND a.run_id IS NOT NULL AND releve_ebay_run_bloque(a.run_id) THEN RETURN NULL; END IF;
  -- (26/10, B1) La dette Beebs ne retient plus QUE les annonces apparues après le dépôt sans numéro le plus ancien
  -- (elles seules peuvent être lui) : une annonce vue avant — un stock réinitialisé — se réimporte.
  IF a.platform = 'beebs' AND releve_dette_beebs_depuis(p_user, COALESCE(a.publiee_le, a.created_at)) THEN RETURN NULL; END IF;
  IF COALESCE((SELECT value FROM coin_config WHERE key = 'import_auto_ouvert'), 0) <> 1 THEN RETURN NULL; END IF;
  -- ⟦14/11 C2⟧ la veille des annonces récentes (demande de Nico) : l'annonce INCONNUE qu'un relevé d'une page
  -- 'recentes' a apportée, ce relevé CLOS (« incomplete » : aucun verdict), s'importe comme sur « Synchroniser » —
  -- par rapprocher_importer et les règles du moteur (photos d'abord, la question en cas de doute). Aucune autre ouverture.
  IF NOT p_geste AND a.run_id IS NOT NULL
     AND EXISTS (SELECT 1 FROM vinted_sync_runs r WHERE r.id = a.run_id AND r.user_id = p_user AND r.kind = 'recentes'
                   AND r.declencheur = 'veille:recentes' AND r.status = 'incomplete') THEN
    p_geste := true;
  END IF;
  -- ⟦14/11 C2 — fin⟧
  IF NOT p_geste THEN
    SELECT * INTO v_run FROM vinted_sync_runs WHERE id = a.run_id;
    -- (26/10, Julian Boissel — Nico) Le relevé serveur d'un compte eBay relié importe comme « Synchroniser »
    -- (même exception que PROPOSITION_20261026171000, pour que l'ordre d'application ne la perde jamais).
    IF NOT (releve_est_geste(v_run.declencheur)
            OR (a.platform = 'ebay' AND v_run.declencheur IN ('serveur:quotidien_api', 'serveur:lecture_origine'))) THEN
      RETURN NULL;
    END IF;
  END IF;
  v_imp := rapprocher_importer(p_user, a.id, 'rapprochement');
  IF COALESCE((v_imp ->> 'ok')::boolean, false) THEN RETURN (v_imp ->> 'inventaire_id')::bigint; END IF;
  RETURN NULL;
END;
$function$;

COMMIT;
