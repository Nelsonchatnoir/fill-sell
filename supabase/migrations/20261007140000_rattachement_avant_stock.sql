-- ════════════════════════════════════════════════════════════════════════════
-- RATTACHEMENT AVANT STOCK (07/10/2026 — règle de Nico)
-- « Un article n'entre JAMAIS dans le stock tant qu'il n'a pas été rapproché
--   de tout ce que l'utilisateur a déjà. »
-- ════════════════════════════════════════════════════════════════════════════
-- POURQUOI. Corinne (corinnebasalo92, inscrite le 07/10 à 11:28, Vinted 353 +
-- Leboncoin 333 + Beebs 266) : chaque annonce relevée sans preuve par
-- identifiant attendait l'empreinte de SA photo (rapprochement_photo_attente),
-- comparée aux couvertures du stock QUI EN AVAIENT UNE (186 sur 353 à 12 h) ;
-- faute de preuve, elle était IMPORTÉE (règle du 27/09 « on crée, et on
-- demande »), et la ressemblance devenait une question posée entre deux
-- articles côte à côte. Résultat : 449 articles au lieu d'environ 353, des
-- titres en double, et « 281 à reprendre au prochain relevé » (la boucle de
-- l'extension s'arrête à 2 min : la suite attendait un nouvel appui).
--
-- CE QUI CHANGE (seulement pour les relevés d'annonces : Leboncoin, Beebs,
-- eBay, Opla ; le dressing Vinted reste la base, inchangé) :
--   1. rapprocher_releve ne rapproche plus dans la boucle de l'extension : il
--      met le compte en file (rapprochement_comptes) et réveille le moteur
--      serveur (fonction edge `rapprochement`), qui va AU BOUT tout seul, par
--      lots, sans nouvel appui ni cron quotidien. Un relevé interrompu est
--      repris par le déclencheur de fin de run (trg_rapprochement_fin_run) et,
--      en dernier recours, par le cron `rapprochement-1min` (ne part que s'il y
--      a du travail en retard).
--   2. Le moteur attend que TOUS les relevés du compte soient finis (la base
--      Vinted d'abord), calcule les empreintes manquantes (annonces ET
--      couvertures du stock), puis classe chaque annonce :
--        · identifiant d'un dépôt FillSell        → rattachée (comme avant) ;
--        · même photo qu'UN SEUL article en stock,
--          sur une autre plateforme                → rattachée (preuve du 06/10) ;
--        · tout autre candidat (titre exact,
--          homonyme, titre inclus, faisceau, photo
--          ambiguë)                               → PROPOSITION hors du stock
--                                                   (« Est-ce le même article ? »,
--                                                   écran de rattachement) ;
--        · aucun candidat                         → là seulement, l'article est
--                                                   créé — une fois toutes les
--                                                   annonces classées, en
--                                                   regroupant la même photo
--                                                   vue sur deux plateformes.
--   3. Le titre ne prouve toujours rien (règle du 27/09) ; un doute est une
--      proposition, jamais une fusion. Veto « type d'objet » (pantalon ≠
--      blazer) : 0 erreur sur les 1 516 paires tranchées par le parc.
--   4. La fusion déplace aussi push_ventes et remises_en_vente (et les rend
--      en défaisant) ; rattacher « oui » une annonce à un article VENDU arme
--      le bandeau existant « Vendu — encore en ligne, retirer ? ».
--
-- CE QUI NE CHANGE PAS : la garde releves_sur_geste (un relevé automatique
-- n'IMPORTE rien : il rattache les preuves sûres, pose les propositions, et
-- laisse les annonces sans candidat attendre le prochain « Synchroniser ») ;
-- aucun quota consommé ; la retenue silencieuse Beebs ; les relevés hors
-- « Mes annonces » et eBay hors compte relié ; les questions de dépôt Beebs.
--
-- CPU (règle du 04/10) : un compte à la fois, lots bornés (budget par appel),
-- rien d'écrit sur une ligne inchangée, saut si veille_cpu > 70 %. Mesures :
-- docs/rattachement-avant-stock.md.
--
-- Appliquer : db query --linked -f, puis migration repair --linked --status
-- applied 20261007140000. Inverse : scripts/reparations/20261007140000_rattachement_avant_stock_INVERSE.sql
-- (définitions EN PROD du 07/10, relues par pg_get_functiondef).
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1. LA FILE DES COMPTES À RAPPROCHER ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.rapprochement_comptes (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  etat text NOT NULL DEFAULT 'a_faire'
    CHECK (etat IN ('a_faire', 'attente_releves', 'empreintes', 'decision', 'creation', 'termine')),
  demande_le timestamptz NOT NULL DEFAULT now(),
  debut_le timestamptz,
  creation_le timestamptz,
  fin_le timestamptz,
  maj_le timestamptz NOT NULL DEFAULT now(),
  relance_le timestamptz,
  passages integer NOT NULL DEFAULT 0,
  passages_photos integer NOT NULL DEFAULT 0,
  a_traiter integer,
  traitees integer NOT NULL DEFAULT 0,
  photos_manquantes integer,
  ms_decision bigint NOT NULL DEFAULT 0,
  bilan jsonb NOT NULL DEFAULT '{}'::jsonb
);
ALTER TABLE public.rapprochement_comptes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rapprochement_comptes_lecture ON public.rapprochement_comptes;
CREATE POLICY rapprochement_comptes_lecture ON public.rapprochement_comptes FOR SELECT TO authenticated USING (user_id = auth.uid());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rapprochement_comptes TO authenticated;
CREATE INDEX IF NOT EXISTS rapprochement_comptes_actifs_idx ON public.rapprochement_comptes (maj_le) WHERE etat <> 'termine';

-- Les annonces classées « aucun candidat » : elles attendent la phase de
-- création (toutes les annonces du compte classées d'abord).
CREATE TABLE IF NOT EXISTS public.rapprochement_nouvelles (
  annonce_id uuid PRIMARY KEY REFERENCES public.annonces_plateforme(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  platform text NOT NULL,
  cree_le timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rapprochement_nouvelles_user_idx ON public.rapprochement_nouvelles (user_id);
ALTER TABLE public.rapprochement_nouvelles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rapprochement_nouvelles_lecture ON public.rapprochement_nouvelles;
CREATE POLICY rapprochement_nouvelles_lecture ON public.rapprochement_nouvelles FOR SELECT TO authenticated USING (user_id = auth.uid());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rapprochement_nouvelles TO authenticated;

-- Les vitesses mesurées des relevés (pour « environ X min ») : un cache
-- recalculé au plus une fois par heure par le moteur.
CREATE TABLE IF NOT EXISTS public.synchro_vitesses (
  platform text PRIMARY KEY,
  s_base numeric NOT NULL,
  s_par_annonce numeric NOT NULL,
  n integer NOT NULL DEFAULT 0,
  mesure_le timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.synchro_vitesses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS synchro_vitesses_lecture ON public.synchro_vitesses;
CREATE POLICY synchro_vitesses_lecture ON public.synchro_vitesses FOR SELECT TO authenticated USING (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.synchro_vitesses TO authenticated;

-- ── 2. LE TYPE D'OBJET : UN PANTALON N'EST PAS UN BLAZER ────────────────────
-- Familles FERMÉES. Deux titres qui nomment chacun un type, sans type commun,
-- ne sont jamais candidats l'un pour l'autre. Mesuré sur les 1 516 paires
-- « Est-ce le même article ? » tranchées par le parc au 07/10 : 6 refus
-- évités, 0 « oui » écarté. Un titre sans type connu ne veto rien.
CREATE OR REPLACE FUNCTION public.titre_types_objet(t text)
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
AS $function$
  SELECT COALESCE(array_agg(DISTINCT f.famille ORDER BY f.famille), '{}'::text[])
    FROM unnest(string_to_array(titre_norm(t), ' ')) m
    JOIN (VALUES
      ('bas', ARRAY['pantalon','pantalons','jean','jeans','legging','leggings','jogging','joggings','short','shorts','bermuda','pantacourt','jegging','treillis','chino']),
      ('robe', ARRAY['robe','robes']),
      ('jupe', ARRAY['jupe','jupes']),
      ('dessus_chaud', ARRAY['veste','vestes','blazer','manteau','manteaux','doudoune','parka','blouson','trench','impermeable','kimono']),
      ('maille', ARRAY['pull','pulls','sweat','sweatshirt','hoodie','cardigan','gilet']),
      ('haut', ARRAY['chemise','chemisier','blouse','top','tshirt','tee','debardeur','polo','body','brassiere','crop']),
      ('tete', ARRAY['bonnet','beret','berret','casquette','chapeau','bob']),
      ('pieds', ARRAY['bottines','bottine','bottes','botte','baskets','basket','chaussures','chaussure','sandales','sandale','escarpins','escarpin','mocassins','ballerines','tongs','sneakers','derbies','boots']),
      ('sac', ARRAY['sac','sacs','pochette','cabas','sacoche','cartable','valise']),
      ('echarpe', ARRAY['echarpe','foulard','snood','etole']),
      ('ceinture', ARRAY['ceinture']),
      ('combi', ARRAY['combinaison','salopette']),
      ('maillot', ARRAY['maillot']),
      ('pyjama', ARRAY['pyjama','nuisette']),
      ('lunettes', ARRAY['lunettes']),
      ('montre', ARRAY['montre']),
      ('bijou', ARRAY['collier','bracelet','bague','boucles'])
    ) AS f(famille, mots) ON m = ANY (f.mots);
$function$;

CREATE OR REPLACE FUNCTION public.titres_types_exclusifs(a text, b text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
AS $function$
  SELECT cardinality(titre_types_objet(a)) > 0 AND cardinality(titre_types_objet(b)) > 0
     AND NOT (titre_types_objet(a) && titre_types_objet(b));
$function$;

-- ── 3. L'IDENTIFIANT SEUL (premier tour de rapprocher_classer, à l'identique) ─
CREATE OR REPLACE FUNCTION public.rapprocher_classer_identifiant(p_user uuid, p_platform text, p_listing_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_id text := nullif(btrim(coalesce(p_listing_id, '')), '');
  v_job record;
  v_job_clos record;
BEGIN
  IF v_id IS NULL THEN RETURN NULL; END IF;
  SELECT j.id, j.inventaire_id INTO v_job FROM cross_post_jobs j
  WHERE j.user_id = p_user AND j.platform = p_platform
    AND j.action IN ('publish', 'republish') AND j.status = 'published'
    AND listing_designe(v_id, j.listing_url, j.platform_listing_id)
  ORDER BY COALESCE(j.published_at, j.created_at) DESC LIMIT 1;
  IF v_job.id IS NOT NULL THEN
    RETURN jsonb_build_object('bande', 'job', 'inventaire_id', v_job.inventaire_id, 'job_id', v_job.id, 'score', 1, 'motif', 'identifiant');
  END IF;
  SELECT j.id, j.inventaire_id, i.statut INTO v_job_clos
    FROM cross_post_jobs j
    JOIN inventaire i ON i.id = j.inventaire_id AND i.user_id = p_user AND i.fusionne_dans IS NULL
   WHERE j.user_id = p_user AND j.platform = p_platform
     AND j.action IN ('publish', 'republish') AND j.status IN ('cancelled', 'sold')
     AND NOT (COALESCE(j.platform_fields, '{}'::jsonb) ? 'detache_le')
     AND listing_designe(v_id, j.listing_url, j.platform_listing_id)
   ORDER BY COALESCE(j.published_at, j.created_at) DESC LIMIT 1;
  IF v_job_clos.id IS NOT NULL THEN
    RETURN jsonb_build_object('bande', 'job_clos', 'inventaire_id', v_job_clos.inventaire_id, 'job_id', v_job_clos.id,
                              'statut_fiche', v_job_clos.statut, 'score', 1, 'motif', 'identifiant_depot_clos');
  END IF;
  RETURN NULL;
END;
$function$;

-- ── 4. METTRE UN COMPTE EN FILE, RÉVEILLER LE MOTEUR ────────────────────────
CREATE OR REPLACE FUNCTION public.rapprochement_demander(p_user uuid, p_motif text DEFAULT NULL)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF p_user IS NULL THEN RETURN; END IF;
  INSERT INTO rapprochement_comptes AS c (user_id, etat, demande_le, maj_le, bilan)
  VALUES (p_user, 'a_faire', now(), now(), jsonb_build_object('motif', p_motif))
  ON CONFLICT (user_id) DO UPDATE
     SET etat = CASE WHEN c.etat = 'termine' THEN 'a_faire' ELSE c.etat END,
         demande_le = now(),
         debut_le = CASE WHEN c.etat = 'termine' THEN NULL ELSE c.debut_le END,
         creation_le = CASE WHEN c.etat = 'termine' THEN NULL ELSE c.creation_le END,
         fin_le = CASE WHEN c.etat = 'termine' THEN NULL ELSE c.fin_le END,
         traitees = CASE WHEN c.etat = 'termine' THEN 0 ELSE c.traitees END,
         ms_decision = CASE WHEN c.etat = 'termine' THEN 0 ELSE c.ms_decision END,
         passages_photos = CASE WHEN c.etat = 'termine' THEN 0 ELSE c.passages_photos END,
         bilan = CASE WHEN c.etat = 'termine' THEN jsonb_build_object('motif', p_motif) ELSE c.bilan END,
         maj_le = now();
END;
$function$;

-- Le réveil : la fonction edge `rapprochement` pour CE compte. Au plus un
-- réveil toutes les 20 s par compte (un relevé de 4 plateformes ne réveille
-- pas 4 fois). Jamais bloquant.
CREATE OR REPLACE FUNCTION public.rapprochement_relancer(p_user uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF p_user IS NULL THEN RETURN; END IF;
  UPDATE rapprochement_comptes SET relance_le = now()
   WHERE user_id = p_user AND (relance_le IS NULL OR relance_le < now() - interval '20 seconds');
  IF NOT FOUND THEN RETURN; END IF;
  BEGIN
    PERFORM net.http_post(
      url := 'https://tojihnuawsoohlolangc.supabase.co/functions/v1/rapprochement',
      body := jsonb_build_object('user_id', p_user),
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', public.cron_secret()),
      timeout_milliseconds := 150000);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'rapprochement_relancer(%) : %', p_user, SQLERRM;
  END;
END;
$function$;

-- ── 5. L'ANNONCE ISOLÉE : L'IDENTIFIANT, SINON LE MOTEUR DU COMPTE ──────────
-- Appelée par fusion_photo_tick (file photo d'avant le 07/10) et
-- rapprocher_rattraper. Identifiant, lien de notification, relevé hors liste,
-- question de dépôt Beebs : à l'identique. Tout le reste attend le moteur du
-- compte (« differe ») : plus jamais d'article créé ici.
CREATE OR REPLACE FUNCTION public.rapprocher_traiter_annonce(p_annonce_id uuid, p_vus text[], p_import_ouvert boolean, p_rattrapage boolean DEFAULT false, p_second_releve_requis boolean DEFAULT true)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  a annonces_plateforme%ROWTYPE;
  v_user uuid; v_pf text; v_run uuid; v_trace jsonb;
  v_cl jsonb; v_bande text; v_job uuid; v_inv bigint;
BEGIN
  SELECT * INTO a FROM annonces_plateforme WHERE id = p_annonce_id FOR UPDATE;
  IF a.id IS NULL THEN RETURN 'introuvable'; END IF;
  IF a.inventaire_id IS NOT NULL OR a.ignoree_le IS NOT NULL THEN RETURN 'deja_traitee'; END IF;
  IF releve_run_hors_liste(a.run_id) THEN RETURN 'hors_liste'; END IF;
  IF a.proposition ->> 'motif' IN ('depot_beebs_photo_proche', 'depot_beebs_a_confirmer') THEN RETURN 'question_depot'; END IF;
  v_user := a.user_id; v_pf := a.platform; v_run := a.run_id;
  v_trace := jsonb_build_object('run_id', v_run)
             || CASE WHEN p_rattrapage THEN jsonb_build_object('rattrapage', true) ELSE '{}'::jsonb END;

  -- ── UNE NOTIFICATION N'EST PAS UNE ANNONCE (2026-09-19) — mot pour mot ──
  IF annonce_lien_notification(a.url) THEN
    UPDATE annonces_plateforme SET ignoree_le = now(), proposition = NULL, updated_at = now() WHERE id = a.id;
    INSERT INTO rapprochements (user_id, annonce_id, inventaire_id, decision, par, score, detail)
    VALUES (v_user, a.id, NULL, 'ignore', 'auto', 0,
            v_trace || jsonb_build_object('motif', 'notification_plateforme', 'platform', v_pf, 'titre', a.titre,
                                          'ni_nt', substring(a.url from 'ni_nt(?:%3A|%3a|:|=)([A-Za-z0-9_]+)')));
    RETURN 'notification';
  END IF;

  v_cl := rapprocher_classer_identifiant(v_user, v_pf, a.listing_id);
  v_bande := v_cl ->> 'bande';
  v_job := NULLIF(v_cl ->> 'job_id', '')::uuid;
  v_inv := NULLIF(v_cl ->> 'inventaire_id', '')::bigint;

  -- ── JOB : l'identifiant est un dépôt FillSell ───────────────────────────
  IF v_bande = 'job' THEN
    UPDATE annonces_plateforme SET inventaire_id = v_inv, job_id = v_job, source_rapprochement = 'job', proposition = NULL, updated_at = now() WHERE id = a.id;
    INSERT INTO rapprochements (user_id, annonce_id, inventaire_id, decision, par, score, detail)
    VALUES (v_user, a.id, v_inv, 'attache', 'job', 1, v_trace || jsonb_build_object('job_id', v_job));
    IF a.statut_plateforme = 'en_ligne' THEN
      UPDATE cross_post_jobs
         SET platform_fields = (platform_fields - ARRAY['unavailable_since', 'unavailable_pending_since', 'sale_signal', 'detected_price', 'alerte_masquee_pour', 'alerte_masquee_le'])
                               || jsonb_build_object('revue_en_ligne_par_releve', jsonb_build_object('run_id', v_run, 'at', now()))
       WHERE id = v_job AND (platform_fields ? 'unavailable_since' OR platform_fields ? 'unavailable_pending_since');
    END IF;
    RETURN 'job';
  END IF;

  -- ── JOB CLOS (2026-09-25) : l'identifiant est un dépôt FillSell annulé/vendu ──
  IF v_bande = 'job_clos' THEN
    v_job := rapprocher_job_de_suivi(v_user, v_pf, v_inv, a.titre, a.prix, a.url, a.listing_id, 'auto',
               v_trace || jsonb_build_object('annonce_id', a.id, 'motif', 'identifiant_depot_clos',
                                             'depot_clos', v_cl ->> 'job_id', 'statut_fiche', v_cl ->> 'statut_fiche'));
    IF (v_cl ->> 'statut_fiche') = 'vendu' THEN
      UPDATE cross_post_jobs
         SET status = 'cancelled',
             platform_fields = platform_fields || jsonb_build_object('pending_removal', true,
                               'vendu_encore_en_ligne', jsonb_build_object('run_id', v_run, 'at', now()))
       WHERE id = v_job;
    END IF;
    UPDATE annonces_plateforme SET inventaire_id = v_inv, job_id = v_job, source_rapprochement = 'job', proposition = NULL, updated_at = now() WHERE id = a.id;
    INSERT INTO rapprochements (user_id, annonce_id, inventaire_id, decision, par, score, detail)
    VALUES (v_user, a.id, v_inv, 'attache', 'job', 1,
            v_trace || jsonb_build_object('job_id', v_job, 'motif', 'identifiant_depot_clos',
                                          'depot_clos', v_cl ->> 'job_id', 'statut_fiche', v_cl ->> 'statut_fiche'));
    RETURN 'job';
  END IF;

  -- (07/10, règle de Nico) Rien de sûr par l'identifiant : l'annonce attend
  -- le moteur du compte, qui la compare à TOUT le stock avant toute création.
  IF COALESCE(current_setting('fillsell.rapprochement_moteur', true), '') <> 'on' THEN
    PERFORM rapprochement_demander(v_user, 'annonce:' || v_pf);
  END IF;
  RETURN 'differe';
END;
$function$;

-- ── 6. L'IMPORT : LA VOIE DU MOTEUR NE REPOSE PAS LA QUESTION ──────────────
-- p_par = 'rapprochement' : le moteur a DÉJÀ comparé l'annonce à tout le stock
-- (aucun candidat) ; l'import ne pose ni question ni proposition. Les autres
-- voies (« utilisateur ») : inchangées.
CREATE OR REPLACE FUNCTION public.rapprocher_importer(p_user uuid, p_annonce_id uuid, p_par text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  a annonces_plateforme%ROWTYPE;
  v_cap jsonb; v_photos jsonb; v_attr jsonb; v_cle text;
  v_new_inv bigint; v_job uuid; v_titre text; v_prix numeric;
  v_tn text; v_jumeau bigint; v_jumeau_titre text;
  v_homo bigint; v_homo_titre text; v_homo_statut text; v_homo_n integer;
  v_q_inv bigint; v_q_motif text; v_q_preuves jsonb; v_q_posee boolean := false;
  v_sans_question boolean := p_par IN ('utilisateur', 'rapprochement');
BEGIN
  SELECT * INTO a FROM annonces_plateforme WHERE id = p_annonce_id AND user_id = p_user FOR UPDATE;
  IF a.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'annonce_introuvable'); END IF;
  IF a.inventaire_id IS NOT NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'deja_rattachee'); END IF;
  IF releve_run_hors_liste(a.run_id) THEN RETURN jsonb_build_object('ok', false, 'reason', 'hors_liste'); END IF;
  v_titre := COALESCE(NULLIF(trim(a.titre), ''), 'Annonce ' || a.platform);
  v_prix := a.prix;
  v_tn := titre_norm(NULLIF(trim(a.titre), ''));

  -- La garde des homonymes et du jumeau (20/09, 26/09, 27/09) : seulement hors
  -- des deux voies qui ont DÉJÀ tranché (la personne, le moteur du compte).
  IF NOT v_sans_question AND COALESCE(v_tn, '') <> ''
     AND COALESCE(array_length(titre_jetons(a.titre), 1), 0) > 0 THEN
    SELECT i.id, i.titre, i.statut, count(*) OVER ()
      INTO v_homo, v_homo_titre, v_homo_statut, v_homo_n
      FROM inventaire i
     WHERE i.user_id = p_user AND i.fusionne_dans IS NULL AND i.statut IN ('stock', 'vendu')
       AND (titre_norm(i.titre) = v_tn OR titre_jetons(i.titre) = titre_jetons(a.titre))
     ORDER BY (i.statut = 'stock') DESC, (titre_norm(i.titre) = v_tn) DESC, i.created_at ASC
     LIMIT 1;
    IF v_homo IS NOT NULL THEN
      v_q_inv := v_homo;
      v_q_motif := CASE WHEN v_homo_statut = 'vendu' THEN 'homonyme_vendu' ELSE 'homonyme_en_stock' END;
      v_q_preuves := jsonb_build_object('titre_annonce', v_titre, 'titre_article', v_homo_titre,
                                        'statut_fiche', v_homo_statut, 'homonymes', v_homo_n,
                                        'signaux', jsonb_build_object('exact', titre_norm(v_homo_titre) = v_tn));
    END IF;
  END IF;
  IF v_q_inv IS NULL AND NOT v_sans_question AND a.proposition IS NOT NULL
     AND NULLIF(a.proposition ->> 'inventaire_id', '') IS NOT NULL THEN
    v_q_inv := (a.proposition ->> 'inventaire_id')::bigint;
    v_q_motif := COALESCE(NULLIF(a.proposition ->> 'motif', ''), 'proposition');
    v_q_preuves := jsonb_build_object('titre_annonce', v_titre, 'proposition', a.proposition,
                                      'signaux', jsonb_build_object(
                                        'ov', a.proposition -> 'signaux' -> 'recouvrement',
                                        'prix', CASE WHEN a.proposition -> 'signaux' ->> 'prix' = 'exact' THEN 'egal' END));
  END IF;
  IF v_q_inv IS NULL AND NOT v_sans_question AND length(COALESCE(v_tn, '')) > 12 THEN
    SELECT i.id, i.titre INTO v_jumeau, v_jumeau_titre
      FROM inventaire i
     WHERE i.user_id = p_user
       AND i.statut = 'stock'
       AND i.disparu_le IS NULL
       AND i.fusionne_dans IS NULL
       AND length(titre_norm(i.titre)) > 12
       AND NOT titres_variantes_incompatibles(a.titre, i.titre)
       AND (' ' || v_tn || ' ' LIKE '% ' || titre_norm(i.titre) || ' %'
            OR ' ' || titre_norm(i.titre) || ' ' LIKE '% ' || v_tn || ' %')
     ORDER BY (titre_norm(i.titre) = v_tn) DESC, i.created_at ASC
     LIMIT 1;
    IF v_jumeau IS NOT NULL THEN
      v_q_inv := v_jumeau; v_q_motif := 'titre_inclus';
      v_q_preuves := jsonb_build_object('titre_annonce', v_titre, 'titre_article', v_jumeau_titre,
                                        'signaux', jsonb_build_object('ov', 0.8));
    END IF;
  END IF;

  -- inventaire.id n'a pas de DEFAULT (convention du front : horodatage ms).
  v_new_inv := (extract(epoch FROM clock_timestamp()) * 1000)::bigint;
  WHILE EXISTS (SELECT 1 FROM inventaire WHERE id = v_new_inv) LOOP v_new_inv := v_new_inv + 1; END LOOP;
  v_cap := a.capture;
  v_photos := CASE
    WHEN jsonb_typeof(v_cap -> 'photos') = 'array' AND jsonb_array_length(v_cap -> 'photos') > 0 THEN v_cap -> 'photos'
    WHEN a.photo_url IS NOT NULL THEN jsonb_build_array(a.photo_url)
    ELSE NULL END;
  v_attr := '{}'::jsonb;
  FOR v_cle IN SELECT unnest(ARRAY['taille', 'etat', 'couleur', 'matiere', 'marque']) LOOP
    IF NULLIF(trim(v_cap ->> v_cle), '') IS NOT NULL THEN
      v_attr := v_attr || jsonb_build_object(v_cle, jsonb_build_object('v', trim(v_cap ->> v_cle), 'source', 'releve_' || a.platform, 'at', now()));
    END IF;
  END LOOP;
  INSERT INTO inventaire (id, user_id, titre, prix_vente, statut, plateforme, origine, quantite, photos, attributs,
                          description, marque, first_seen_at, last_synced_at, photos_a_rapatrier)
  VALUES (v_new_inv, p_user, v_titre, v_prix, 'stock', a.platform, 'releve_' || a.platform, 1,
          v_photos, v_attr,
          NULLIF(trim(v_cap ->> 'description'), ''), NULLIF(trim(v_cap ->> 'marque'), ''), now(), now(),
          v_photos IS NOT NULL);
  v_job := rapprocher_job_de_suivi(p_user, a.platform, v_new_inv, v_titre, v_prix, a.url, a.listing_id, p_par,
                                   jsonb_build_object('annonce_id', a.id, 'import', true));
  UPDATE annonces_plateforme
     SET inventaire_id = v_new_inv, job_id = v_job,
         source_rapprochement = CASE WHEN p_par = 'utilisateur' THEN 'manuel' ELSE 'automatique' END,
         proposition = NULL, ignoree_le = NULL, fiche_supprimee_le = NULL, updated_at = now()
   WHERE id = a.id;
  IF v_q_inv IS NOT NULL THEN
    v_q_posee := releve_poser_question(p_user, v_q_inv, v_new_inv, v_q_motif,
                   COALESCE(v_q_preuves, '{}'::jsonb) || jsonb_build_object('annonce_id', a.id, 'platform', a.platform,
                                                                         'listing_id', a.listing_id, 'url', a.url, 'prix', a.prix));
  END IF;
  INSERT INTO rapprochements (user_id, annonce_id, inventaire_id, decision, par, score, detail)
  VALUES (p_user, a.id, v_new_inv, 'import', CASE WHEN p_par = 'rapprochement' THEN 'auto' ELSE p_par END, 1, jsonb_build_object('job_id', v_job, 'voie', p_par)
          || CASE WHEN v_q_inv IS NOT NULL
                  THEN jsonb_build_object('question', jsonb_build_object('inventaire_id', v_q_inv, 'motif', v_q_motif, 'posee', v_q_posee))
                  ELSE '{}'::jsonb END);
  RETURN jsonb_build_object('ok', true, 'decision', 'import', 'inventaire_id', v_new_inv, 'job_id', v_job)
         || CASE WHEN v_q_inv IS NOT NULL
                 THEN jsonb_build_object('question', jsonb_build_object('inventaire_id', v_q_inv, 'motif', v_q_motif, 'posee', v_q_posee))
                 ELSE '{}'::jsonb END;
END;
$function$;

-- ── 7. LES FICHES DU COMPTE, LUES UNE FOIS PAR PASSAGE ──────────────────────
-- Table temporaire de la transaction : titres normalisés, mots qui comptent,
-- marque, taille, prix, empreintes (couverture + photos des annonces
-- rattachées), plateformes où l'article a une annonce en ligne. Mesuré le
-- 07/10 : rapprocher_classer relisait tout cela pour CHAQUE annonce
-- (143 ms/annonce chez Corinne) — ici une fois, puis des jointures.
CREATE OR REPLACE FUNCTION public.rapprochement_lire_fiches(p_user uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE n integer;
BEGIN
  CREATE TEMP TABLE IF NOT EXISTS _rf (
    id bigint PRIMARY KEY, statut text, titre text, tn text, jt text[], ty text[], m text, ta text,
    prix numeric, pfs text[], created_at timestamptz, origine text
  ) ON COMMIT DROP;
  CREATE TEMP TABLE IF NOT EXISTS _rfp (id bigint, d bit(64), p bit(64)) ON COMMIT DROP;
  TRUNCATE _rf; TRUNCATE _rfp;
  INSERT INTO _rf
  SELECT i.id, i.statut, i.titre, titre_norm(i.titre), titre_jetons(i.titre), titre_types_objet(i.titre),
         titre_marque_utile(COALESCE(NULLIF(trim(i.marque), ''),
                             CASE WHEN jsonb_typeof(i.attributs -> 'marque') = 'object'
                                  THEN i.attributs -> 'marque' ->> 'v' ELSE i.attributs ->> 'marque' END)),
         titre_norm(CASE WHEN jsonb_typeof(i.attributs -> 'taille') = 'object'
                         THEN i.attributs -> 'taille' ->> 'v' ELSE i.attributs ->> 'taille' END),
         i.prix_vente, COALESCE(ap.pfs, '{}'::text[]), i.created_at, i.origine
    FROM inventaire i
    LEFT JOIN (SELECT x.inventaire_id, array_agg(DISTINCT x.platform) pfs
                 FROM annonces_plateforme x
                WHERE x.user_id = p_user AND x.inventaire_id IS NOT NULL AND x.disparu_le IS NULL
                GROUP BY 1) ap ON ap.inventaire_id = i.id
   WHERE i.user_id = p_user AND i.fusionne_dans IS NULL AND i.statut IN ('stock', 'vendu');
  GET DIAGNOSTICS n = ROW_COUNT;
  -- Les empreintes : la couverture de chaque article EN STOCK, et la photo
  -- de chacune de ses annonces en ligne (la vignette Leboncoin d'un article
  -- importé n'a pas l'adresse de sa couverture rapatriée).
  INSERT INTO _rfp
  SELECT f.id, e.dhash::bit(64), e.phash::bit(64)
    FROM _rf f JOIN inventaire i ON i.id = f.id
    JOIN photo_empreintes e ON e.url = fiche_couverture(i.photos)
   WHERE f.statut = 'stock';
  INSERT INTO _rfp
  SELECT x.inventaire_id, e.dhash::bit(64), e.phash::bit(64)
    FROM annonces_plateforme x
    JOIN _rf f ON f.id = x.inventaire_id AND f.statut = 'stock'
    JOIN photo_empreintes e ON e.url = x.photo_url
   WHERE x.user_id = p_user AND x.disparu_le IS NULL;
  RETURN n;
END;
$function$;

-- ── 8. LES CANDIDATS D'UNE ANNONCE (sur _rf / _rfp) ─────────────────────────
-- Les mêmes signaux qu'avant, réunis : titre exact (rapprocher_classer, 1er
-- tour), dépôt de même titre dont l'annonce a disparu (annonce remplacée),
-- homonymes en stock ET vendus (garde de l'import, 26/09), titre inclus
-- (jumeau, 20/09), faisceau (18/09), et la photo. Rend :
--   { "sur": inventaire_id }                 — même photo qu'UN SEUL article
--                                              en stock, autre plateforme ;
--   { "candidats": [...], "motif": ... }     — un doute : proposition ;
--   {}                                       — aucun candidat.
-- p_depuis : ne regarder que les articles créés depuis (phase de création).
CREATE OR REPLACE FUNCTION public.rapprochement_candidats(p_annonce uuid, p_depuis timestamptz DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  a annonces_plateforme%ROWTYPE;
  v_tn text; v_ja text[]; v_ty text[]; v_d bit(64); v_p bit(64);
  v_photo bigint[]; v_photo_n integer := 0; v_ambigu text := NULL;
  v_cands jsonb; v_best jsonb; v_n integer;
BEGIN
  SELECT * INTO a FROM annonces_plateforme WHERE id = p_annonce;
  IF a.id IS NULL THEN RETURN '{}'::jsonb; END IF;
  v_tn := titre_norm(a.titre);
  v_ja := titre_jetons(a.titre);
  v_ty := titre_types_objet(a.titre);
  SELECT e.dhash::bit(64), e.phash::bit(64) INTO v_d, v_p FROM photo_empreintes e WHERE e.url = a.photo_url;

  -- ── LA PHOTO ──────────────────────────────────────────────────────────────
  IF v_d IS NOT NULL THEN
    SELECT array_agg(DISTINCT q.id) INTO v_photo
      FROM _rfp q JOIN _rf f ON f.id = q.id
     WHERE f.statut = 'stock' AND (p_depuis IS NULL OR f.created_at >= p_depuis)
       AND bit_count(q.d # v_d) <= 5 AND bit_count(q.p # v_p) <= 8;
    v_photo_n := COALESCE(cardinality(v_photo), 0);
    IF v_photo_n = 1 THEN
      -- Les gardes de rapprochement_photo_decisions (30/09), à l'identique :
      -- même plateforme (deux exemplaires, ou une annonce remplacée), deux
      -- annonces de même photo sur la plateforme, variantes exclusives — et
      -- le type d'objet (07/10). Chacune fait un DOUTE, jamais une preuve.
      IF EXISTS (SELECT 1 FROM annonces_plateforme x
                  WHERE x.inventaire_id = v_photo[1] AND x.platform = a.platform AND x.disparu_le IS NULL AND x.id <> a.id)
         OR EXISTS (SELECT 1 FROM cross_post_jobs j
                     WHERE j.inventaire_id = v_photo[1] AND j.platform = a.platform AND j.status = 'published'
                       AND j.action IN ('publish', 'republish') AND j.id IS DISTINCT FROM a.job_id) THEN
        v_ambigu := 'photo_meme_plateforme';
      ELSIF EXISTS (SELECT 1 FROM annonces_plateforme y JOIN photo_empreintes ey ON ey.url = y.photo_url
                     WHERE y.user_id = a.user_id AND y.platform = a.platform AND y.id <> a.id AND y.disparu_le IS NULL
                       AND bit_count(ey.dhash::bit(64) # v_d) <= 5 AND bit_count(ey.phash::bit(64) # v_p) <= 8) THEN
        v_ambigu := 'photo_deux_annonces';
      ELSIF EXISTS (SELECT 1 FROM _rf f WHERE f.id = v_photo[1]
                       AND (titres_variantes_exclusives(a.titre, f.titre) OR titres_types_exclusifs(a.titre, f.titre))) THEN
        v_ambigu := 'photo_variantes';
      ELSE
        RETURN jsonb_build_object('sur', v_photo[1], 'motif', 'photo_identique');
      END IF;
    ELSIF v_photo_n > 1 THEN
      v_ambigu := 'photo_plusieurs';
    END IF;
  END IF;

  -- ── LES DOUTES ────────────────────────────────────────────────────────────
  WITH c AS (
    -- la photo ambiguë
    SELECT f.id, 1 AS rang, COALESCE(v_ambigu, 'photo_identique') AS motif, 0.9::numeric AS score, NULL::uuid AS job_id, NULL::jsonb AS signaux
      FROM _rf f WHERE v_ambigu IS NOT NULL AND f.id = ANY (COALESCE(v_photo, '{}'::bigint[]))
    UNION ALL
    -- titre exact, article en stock sans annonce en ligne sur cette plateforme
    SELECT f.id, 2, 'titre_exact', 0.8, NULL, NULL
      FROM _rf f WHERE v_tn <> '' AND f.statut = 'stock' AND f.tn = v_tn AND NOT (a.platform = ANY (f.pfs))
       AND (p_depuis IS NULL OR f.created_at >= p_depuis)
    UNION ALL
    -- un dépôt de même titre sur cette plateforme dont l'annonce n'est plus là
    -- (annonce remplacée hors FillSell)
    SELECT j.inventaire_id, 3, 'annonce_remplacee', 0.75, j.id, NULL
      FROM cross_post_jobs j JOIN _rf f ON f.id = j.inventaire_id
     WHERE p_depuis IS NULL AND v_tn <> '' AND j.user_id = a.user_id AND j.platform = a.platform
       AND j.action IN ('publish', 'republish') AND j.status = 'published'
       AND titre_norm(j.title) = v_tn
       AND NOT EXISTS (SELECT 1 FROM annonces_plateforme ap WHERE ap.job_id = j.id AND ap.disparu_le IS NULL)
    UNION ALL
    -- homonymes (mêmes mots qui comptent), en stock ou VENDUS
    SELECT f.id, CASE WHEN f.statut = 'stock' THEN 3 ELSE 6 END,
           CASE WHEN f.statut = 'vendu' THEN 'homonyme_vendu' ELSE 'homonyme_en_stock' END, 0.7, NULL, NULL
      FROM _rf f WHERE cardinality(v_ja) > 0 AND (f.tn = v_tn OR f.jt = v_ja)
       AND (p_depuis IS NULL OR f.created_at >= p_depuis)
    UNION ALL
    -- titre inclus (jumeau)
    SELECT f.id, 4, 'titre_inclus', 0.6, NULL, NULL
      FROM _rf f WHERE f.statut = 'stock' AND length(v_tn) > 12 AND length(f.tn) > 12 AND f.tn <> v_tn
       AND NOT (a.platform = ANY (f.pfs))
       AND (p_depuis IS NULL OR f.created_at >= p_depuis)
       AND (' ' || v_tn || ' ' LIKE '% ' || f.tn || ' %' OR ' ' || f.tn || ' ' LIKE '% ' || v_tn || ' %')
       AND NOT titres_variantes_incompatibles(a.titre, f.titre)
       AND NOT (cardinality(v_ty) > 0 AND cardinality(f.ty) > 0 AND NOT (v_ty && f.ty))
    UNION ALL
    -- le faisceau (rapprocher_classer, 2e tour, mêmes seuils)
    SELECT q.id, 5, 'faisceau', round(least(0.85, q.sc), 2), NULL,
           jsonb_build_object('recouvrement', round(q.rec, 2),
                              'prix', CASE WHEN q.prix_exact THEN 'exact' WHEN q.prix_proche THEN 'proche' ELSE 'non' END,
                              'marque', q.marque_ok, 'taille', q.taille_ok, 'remplace_annonce', false)
      FROM (
        SELECT f.id, k.rec, x.prix_exact, x.prix_proche, x.marque_ok, x.taille_ok,
               0.50 * k.rec + CASE WHEN x.prix_exact THEN 0.20 WHEN x.prix_proche THEN 0.08 ELSE 0 END
                            + CASE WHEN x.marque_ok THEN 0.15 ELSE 0 END
                            + CASE WHEN x.taille_ok THEN 0.07 ELSE 0 END AS sc
          FROM _rf f
          CROSS JOIN LATERAL (
            SELECT (SELECT count(*) FROM unnest(f.jt) z WHERE z = ANY (v_ja))::numeric
                   / NULLIF(greatest(cardinality(f.jt), cardinality(v_ja)), 0)::numeric AS rec) k
          CROSS JOIN LATERAL (
            SELECT (a.prix IS NOT NULL AND f.prix IS NOT NULL AND abs(a.prix - f.prix) < 0.01) AS prix_exact,
                   (a.prix IS NOT NULL AND f.prix IS NOT NULL AND f.prix > 0 AND abs(a.prix - f.prix) / f.prix <= 0.15) AS prix_proche,
                   (f.m <> '' AND position(f.m in v_tn) > 0) AS marque_ok,
                   (f.ta <> '' AND (' ' || v_tn || ' ') LIKE ('% ' || f.ta || ' %')) AS taille_ok) x
         WHERE f.statut = 'stock' AND cardinality(v_ja) > 0 AND f.jt && v_ja
           AND NOT (a.platform = ANY (f.pfs))
           AND (p_depuis IS NULL OR f.created_at >= p_depuis)
           AND NOT titres_variantes_exclusives(a.titre, f.titre)
           AND NOT (cardinality(v_ty) > 0 AND cardinality(f.ty) > 0 AND NOT (v_ty && f.ty))
      ) q
     WHERE q.rec >= 0.34 AND (q.sc >= 0.45 OR q.rec >= 0.6)
  ),
  u AS (
    SELECT DISTINCT ON (c.id) c.* FROM c ORDER BY c.id, c.rang, c.score DESC
  ),
  o AS (
    SELECT u.*, f.titre, f.prix, f.statut FROM u JOIN _rf f ON f.id = u.id
     ORDER BY u.rang, u.score DESC, u.id DESC LIMIT 6
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object('type', 'inventaire', 'inventaire_id', o.id, 'job_id', o.job_id, 'titre', o.titre,
                                               'prix', o.prix, 'statut', o.statut, 'motif', o.motif, 'score', o.score,
                                               'signaux', o.signaux) ORDER BY o.rang, o.score DESC, o.id DESC), '[]'::jsonb),
         count(*)
    INTO v_cands, v_n
    FROM o;
  IF v_n = 0 THEN RETURN '{}'::jsonb; END IF;
  v_best := v_cands -> 0;
  RETURN jsonb_build_object('candidats', v_cands, 'candidats_total', v_n,
                            'inventaire_id', (v_best ->> 'inventaire_id')::bigint,
                            'job_id', NULLIF(v_best ->> 'job_id', '')::uuid,
                            'motif', CASE WHEN v_n > 1 AND (v_best ->> 'motif') = 'titre_exact' THEN 'plusieurs_candidats' ELSE v_best ->> 'motif' END,
                            'score', (v_best ->> 'score')::numeric,
                            'signaux', v_best -> 'signaux');
END;
$function$;

-- ── 9. RATTACHER SUR PREUVE (photo identique) ───────────────────────────────
CREATE OR REPLACE FUNCTION public.rapprochement_attacher(p_annonce uuid, p_inv bigint, p_motif text, p_detail jsonb DEFAULT '{}'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE a annonces_plateforme%ROWTYPE; v_job uuid;
BEGIN
  SELECT * INTO a FROM annonces_plateforme WHERE id = p_annonce FOR UPDATE;
  IF a.id IS NULL OR a.inventaire_id IS NOT NULL OR a.ignoree_le IS NOT NULL THEN RETURN NULL; END IF;
  v_job := rapprocher_job_de_suivi(a.user_id, a.platform, p_inv, a.titre, a.prix, a.url, a.listing_id, 'auto',
             jsonb_build_object('annonce_id', a.id, 'motif', p_motif, 'run_id', a.run_id) || COALESCE(p_detail, '{}'::jsonb));
  UPDATE annonces_plateforme SET inventaire_id = p_inv, job_id = v_job, source_rapprochement = 'automatique',
                                 proposition = NULL, updated_at = now()
   WHERE id = a.id;
  INSERT INTO rapprochements (user_id, annonce_id, inventaire_id, decision, par, score, detail)
  VALUES (a.user_id, a.id, p_inv, 'attache', 'auto', 1,
          jsonb_build_object('run_id', a.run_id, 'job_id', v_job, 'motif', p_motif, 'regle', 'rattachement_avant_stock') || COALESCE(p_detail, '{}'::jsonb));
  RETURN v_job;
END;
$function$;

-- ── 10. LE MOTEUR : UN PASSAGE BORNÉ POUR UN COMPTE ─────────────────────────
-- Appelé en boucle par la fonction edge `rapprochement` (clé de service).
-- Rend l'état et, s'il faut des empreintes, la liste des photos à empreinter.
-- Un seul passage à la fois par compte (verrou consultatif).
CREATE OR REPLACE FUNCTION public.rapprochement_avancer(p_user uuid, p_budget_ms integer DEFAULT 6000)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
 SET statement_timeout TO '30s'
AS $function$
DECLARE
  c rapprochement_comptes%ROWTYPE;
  t0 timestamptz := clock_timestamp();
  v_budget interval := make_interval(secs => greatest(1000, least(p_budget_ms, 20000)) / 1000.0);
  v_cpu numeric; v_urls text[]; v_n integer; v_reste integer;
  v_import boolean; v_dette boolean; v_grand boolean;
  an annonces_plateforme%ROWTYPE; v_res text; v_cand jsonb; v_inv bigint; v_job uuid; v_imp jsonb;
  v_geste boolean; n_dec integer := 0; n_att integer := 0; n_prop integer := 0; n_nouv integer := 0; n_job integer := 0;
  n_crees integer := 0; n_groupes integer := 0; n_err integer := 0; n_ret integer := 0;
  v_fus jsonb := NULL; v_ms bigint;
BEGIN
  IF p_user IS NULL THEN RETURN jsonb_build_object('etat', 'rien'); END IF;
  IF NOT pg_try_advisory_xact_lock(hashtext('rapprochement:' || p_user::text)) THEN
    RETURN jsonb_build_object('etat', 'occupe');
  END IF;
  SELECT * INTO c FROM rapprochement_comptes WHERE user_id = p_user FOR UPDATE;
  IF c.user_id IS NULL THEN
    PERFORM rapprochement_demander(p_user, 'moteur');
    SELECT * INTO c FROM rapprochement_comptes WHERE user_id = p_user FOR UPDATE;
  END IF;
  IF c.etat = 'termine' THEN RETURN jsonb_build_object('etat', 'termine'); END IF;

  -- La base qui peine passe avant tout (règle du 04/10).
  SELECT pct INTO v_cpu FROM veille_cpu WHERE pct IS NOT NULL ORDER BY le DESC LIMIT 1;
  IF v_cpu IS NOT NULL AND v_cpu > 70 THEN
    UPDATE rapprochement_comptes SET maj_le = now() WHERE user_id = p_user;
    RETURN jsonb_build_object('etat', 'cpu', 'cpu', v_cpu);
  END IF;

  -- ── A. LES RELEVÉS D'ABORD : rien ne se tranche tant qu'un relevé du compte
  --    (la base Vinted comprise) est en file ou en cours, et vivant.
  IF EXISTS (SELECT 1 FROM vinted_sync_runs s
              WHERE s.user_id = p_user AND s.kind IN ('annonces', 'dressing')
                AND ((s.status = 'queued' AND COALESCE(s.queued_at, s.updated_at) > now() - interval '30 minutes')
                  OR (s.status = 'running' AND COALESCE(s.progres_le, s.updated_at, s.started_at) > now() - interval '10 minutes'))) THEN
    UPDATE rapprochement_comptes SET etat = 'attente_releves', maj_le = now(), passages = passages + 1,
           debut_le = COALESCE(debut_le, now())
     WHERE user_id = p_user;
    RETURN jsonb_build_object('etat', 'attente_releves');
  END IF;
  UPDATE rapprochement_comptes SET debut_le = COALESCE(debut_le, now()), passages = passages + 1 WHERE user_id = p_user;

  v_grand := (SELECT count(*) FROM inventaire i WHERE i.user_id = p_user AND i.statut = 'stock' AND i.fusionne_dans IS NULL) > 5000;

  -- ── B. LES EMPREINTES MANQUANTES (annonces à classer, nouvelles, couvertures
  --    du stock). Huit passages au plus : une photo qui ne se lit pas ne
  --    bloque jamais le compte.
  IF NOT v_grand AND c.passages_photos < 8 THEN
    SELECT array_agg(z.u) INTO v_urls FROM (
      SELECT DISTINCT y.u FROM (
        SELECT a.photo_url u FROM annonces_plateforme a
         WHERE a.user_id = p_user AND a.inventaire_id IS NULL AND a.ignoree_le IS NULL AND a.disparu_le IS NULL
           AND a.platform IN ('leboncoin', 'beebs', 'ebay', 'opla')
        UNION ALL
        SELECT fiche_couverture(i.photos) FROM inventaire i
         WHERE i.user_id = p_user AND i.statut = 'stock' AND i.fusionne_dans IS NULL
      ) y
       WHERE y.u ~ '^https://'
         AND NOT EXISTS (SELECT 1 FROM photo_empreintes e WHERE e.url = y.u)
         AND NOT EXISTS (SELECT 1 FROM photo_empreintes_echecs e WHERE e.url = y.u)
       LIMIT 200) z;
    IF v_urls IS NOT NULL THEN
      UPDATE rapprochement_comptes SET etat = 'empreintes', maj_le = now(), passages_photos = passages_photos + 1,
             photos_manquantes = cardinality(v_urls)
       WHERE user_id = p_user;
      RETURN jsonb_build_object('etat', 'empreintes', 'urls', to_jsonb(v_urls));
    END IF;
  END IF;

  PERFORM set_config('fillsell.rapprochement_moteur', 'on', true);
  v_import := COALESCE((SELECT value FROM coin_config WHERE key = 'import_auto_ouvert'), 0) = 1;
  v_dette := releve_dette_beebs(p_user);
  PERFORM rapprochement_lire_fiches(p_user);

  -- ── C. CLASSER chaque annonce en attente ──────────────────────────────────
  UPDATE rapprochement_comptes SET etat = 'decision', photos_manquantes = 0, maj_le = now() WHERE user_id = p_user;
  FOR an IN
    SELECT a.* FROM annonces_plateforme a
     WHERE a.user_id = p_user AND a.inventaire_id IS NULL AND a.ignoree_le IS NULL AND a.disparu_le IS NULL
       AND a.proposition IS NULL
       AND a.platform IN ('leboncoin', 'beebs', 'ebay', 'opla')
       AND NOT EXISTS (SELECT 1 FROM rapprochement_nouvelles n WHERE n.annonce_id = a.id)
       AND NOT EXISTS (SELECT 1 FROM rapprochements r WHERE r.annonce_id = a.id AND r.decision = 'aucune' AND r.detail ->> 'motif' = 'erreur_moteur'
                          AND r.created_at > now() - interval '1 day')
     ORDER BY a.vu_le, a.id
  LOOP
    IF clock_timestamp() - t0 > v_budget THEN EXIT; END IF;
    BEGIN
      -- Relevé hors « Mes annonces », eBay hors compte relié : jamais rien.
      IF releve_run_hors_liste(an.run_id) OR (an.platform = 'ebay' AND an.run_id IS NOT NULL AND releve_ebay_run_bloque(an.run_id)) THEN
        UPDATE annonces_plateforme SET ignoree_le = now(), updated_at = now() WHERE id = an.id AND inventaire_id IS NULL;
        INSERT INTO rapprochements (user_id, annonce_id, decision, par, score, detail)
        VALUES (p_user, an.id, 'ignore', 'auto', 0, jsonb_build_object('run_id', an.run_id, 'motif', 'releve_non_probant', 'regle', 'rattachement_avant_stock'));
        n_dec := n_dec + 1; CONTINUE;
      END IF;
      -- L'identifiant (et la notification) : la voie d'avant, à l'identique.
      v_res := rapprocher_traiter_annonce(an.id, ARRAY[]::text[], false, false, false);
      IF v_res IN ('job', 'notification', 'deja_traitee', 'introuvable', 'hors_liste', 'question_depot') THEN
        IF v_res = 'job' THEN n_job := n_job + 1; END IF;
        n_dec := n_dec + 1; CONTINUE;
      END IF;
      v_cand := rapprochement_candidats(an.id, NULL);
      IF v_cand ? 'sur' THEN
        v_job := rapprochement_attacher(an.id, (v_cand ->> 'sur')::bigint, 'photo_identique');
        n_att := n_att + 1;
      ELSIF v_cand ? 'candidats' THEN
        IF v_dette AND an.platform = 'beebs' THEN
          -- Retenue silencieuse Beebs (29/09 soir) : ni question ni import.
          UPDATE annonces_plateforme SET ignoree_le = now(), updated_at = now() WHERE id = an.id AND inventaire_id IS NULL;
          INSERT INTO rapprochements (user_id, annonce_id, decision, par, score, detail)
          VALUES (p_user, an.id, 'ignore', 'auto', 0, jsonb_build_object('run_id', an.run_id, 'motif', 'retenue_silencieuse_beebs', 'resultat', 'propose',
                  'regle', 'dépôt Beebs sans identifiant : ni import ni question avant preuve exacte'));
          n_ret := n_ret + 1;
        ELSE
          UPDATE annonces_plateforme
             SET proposition = (v_cand - 'sur') || jsonb_build_object('run_id', an.run_id, 'at', now(), 'avant_stock', true),
                 updated_at = now()
           WHERE id = an.id;
          INSERT INTO rapprochements (user_id, annonce_id, inventaire_id, decision, par, score, detail)
          VALUES (p_user, an.id, (v_cand ->> 'inventaire_id')::bigint, 'propose', 'auto', (v_cand ->> 'score')::numeric,
                  jsonb_build_object('run_id', an.run_id, 'motif', v_cand ->> 'motif', 'candidats_total', v_cand -> 'candidats_total',
                                     'regle', 'rattachement_avant_stock'));
          n_prop := n_prop + 1;
        END IF;
      ELSE
        INSERT INTO rapprochement_nouvelles (annonce_id, user_id, platform) VALUES (an.id, p_user, an.platform)
        ON CONFLICT (annonce_id) DO NOTHING;
        n_nouv := n_nouv + 1;
      END IF;
      n_dec := n_dec + 1;
    EXCEPTION WHEN OTHERS THEN
      n_err := n_err + 1;
      INSERT INTO rapprochements (user_id, annonce_id, decision, par, score, detail)
      VALUES (p_user, an.id, 'aucune', 'auto', 0, jsonb_build_object('motif', 'erreur_moteur', 'erreur', left(SQLERRM, 300), 'regle', 'rattachement_avant_stock'));
    END;
  END LOOP;

  SELECT count(*) INTO v_reste FROM annonces_plateforme a
   WHERE a.user_id = p_user AND a.inventaire_id IS NULL AND a.ignoree_le IS NULL AND a.disparu_le IS NULL
     AND a.proposition IS NULL AND a.platform IN ('leboncoin', 'beebs', 'ebay', 'opla')
     AND NOT EXISTS (SELECT 1 FROM rapprochement_nouvelles n WHERE n.annonce_id = a.id)
     AND NOT EXISTS (SELECT 1 FROM rapprochements r WHERE r.annonce_id = a.id AND r.decision = 'aucune' AND r.detail ->> 'motif' = 'erreur_moteur'
                        AND r.created_at > now() - interval '1 day');
  v_ms := round(extract(epoch FROM clock_timestamp() - t0) * 1000);
  IF v_reste > 0 THEN
    UPDATE rapprochement_comptes
       SET etat = 'decision', maj_le = now(), a_traiter = v_reste, traitees = traitees + n_dec, ms_decision = ms_decision + v_ms,
           bilan = bilan || jsonb_build_object(
             'job', COALESCE((bilan ->> 'job')::int, 0) + n_job, 'photo', COALESCE((bilan ->> 'photo')::int, 0) + n_att,
             'propositions', COALESCE((bilan ->> 'propositions')::int, 0) + n_prop, 'nouvelles', COALESCE((bilan ->> 'nouvelles')::int, 0) + n_nouv,
             'retenues_beebs', COALESCE((bilan ->> 'retenues_beebs')::int, 0) + n_ret, 'erreurs', COALESCE((bilan ->> 'erreurs')::int, 0) + n_err)
     WHERE user_id = p_user;
    RETURN jsonb_build_object('etat', 'decision', 'traitees', n_dec, 'restantes', v_reste, 'ms', v_ms);
  END IF;

  -- ── D. CRÉER ce qui n'a aucun candidat — toutes les annonces classées ─────
  UPDATE rapprochement_comptes
     SET etat = 'creation', creation_le = COALESCE(creation_le, now()), a_traiter = 0,
         traitees = traitees + n_dec, ms_decision = ms_decision + v_ms,
         bilan = bilan || jsonb_build_object(
           'job', COALESCE((bilan ->> 'job')::int, 0) + n_job, 'photo', COALESCE((bilan ->> 'photo')::int, 0) + n_att,
           'propositions', COALESCE((bilan ->> 'propositions')::int, 0) + n_prop, 'nouvelles', COALESCE((bilan ->> 'nouvelles')::int, 0) + n_nouv,
           'retenues_beebs', COALESCE((bilan ->> 'retenues_beebs')::int, 0) + n_ret, 'erreurs', COALESCE((bilan ->> 'erreurs')::int, 0) + n_err),
         maj_le = now()
   WHERE user_id = p_user
  RETURNING * INTO c;
  n_att := 0; n_prop := 0;
  FOR an IN
    SELECT a.* FROM rapprochement_nouvelles n JOIN annonces_plateforme a ON a.id = n.annonce_id
     WHERE n.user_id = p_user
     ORDER BY CASE a.platform WHEN 'leboncoin' THEN 1 WHEN 'beebs' THEN 2 WHEN 'ebay' THEN 3 ELSE 4 END, a.vu_le, a.id
  LOOP
    IF clock_timestamp() - t0 > v_budget THEN EXIT; END IF;
    -- Plus en attente (rattachée ou tranchée entre-temps) : elle sort.
    IF an.inventaire_id IS NOT NULL OR an.ignoree_le IS NOT NULL OR an.disparu_le IS NOT NULL OR an.proposition IS NOT NULL THEN
      DELETE FROM rapprochement_nouvelles WHERE annonce_id = an.id; CONTINUE;
    END IF;
    SELECT releve_est_geste(s.declencheur) INTO v_geste FROM vinted_sync_runs s WHERE s.id = an.run_id;
    -- Pas de création sans geste (relevé automatique), annonce pas en ligne,
    -- interrupteur fermé, fiche supprimée exprès, dette Beebs : elle attend.
    IF NOT (v_import AND COALESCE(v_geste, false) AND an.statut_plateforme = 'en_ligne' AND an.fiche_supprimee_le IS NULL
            AND NOT (v_dette AND an.platform = 'beebs')) THEN
      CONTINUE;
    END IF;
    BEGIN
      -- Contre les articles créés DANS CETTE PHASE (la même robe relevée sur
      -- Leboncoin puis sur Beebs) : même photo → rattachée ; un doute →
      -- proposition ; sinon, l'article est créé.
      v_cand := rapprochement_candidats(an.id, c.creation_le);
      IF v_cand ? 'sur' THEN
        -- Motif « photo_identique » EXACT : c'est lui que lit retrait_job_prouve
        -- (une vente retire cette copie).
        PERFORM rapprochement_attacher(an.id, (v_cand ->> 'sur')::bigint, 'photo_identique', jsonb_build_object('groupe_creation', true));
        n_groupes := n_groupes + 1;
      ELSIF v_cand ? 'candidats' THEN
        UPDATE annonces_plateforme
           SET proposition = (v_cand - 'sur') || jsonb_build_object('run_id', an.run_id, 'at', now(), 'avant_stock', true),
               updated_at = now()
         WHERE id = an.id;
        INSERT INTO rapprochements (user_id, annonce_id, inventaire_id, decision, par, score, detail)
        VALUES (p_user, an.id, (v_cand ->> 'inventaire_id')::bigint, 'propose', 'auto', (v_cand ->> 'score')::numeric,
                jsonb_build_object('run_id', an.run_id, 'motif', v_cand ->> 'motif', 'regle', 'rattachement_avant_stock', 'phase', 'creation'));
        n_prop := n_prop + 1;
      ELSE
        v_imp := rapprocher_importer(p_user, an.id, 'rapprochement');
        IF COALESCE((v_imp ->> 'ok')::boolean, false) THEN
          v_inv := (v_imp ->> 'inventaire_id')::bigint;
          -- L'article créé entre dans la lecture du passage : les annonces
          -- suivantes se comparent à lui.
          INSERT INTO _rf
          SELECT i.id, i.statut, i.titre, titre_norm(i.titre), titre_jetons(i.titre), titre_types_objet(i.titre),
                 COALESCE(titre_marque_utile(NULLIF(trim(COALESCE(i.marque, '')), '')), ''), '', i.prix_vente, ARRAY[an.platform], i.created_at, i.origine
            FROM inventaire i WHERE i.id = v_inv
          ON CONFLICT (id) DO NOTHING;
          INSERT INTO _rfp SELECT v_inv, e.dhash::bit(64), e.phash::bit(64) FROM photo_empreintes e WHERE e.url = an.photo_url;
          n_crees := n_crees + 1;
        END IF;
      END IF;
      DELETE FROM rapprochement_nouvelles WHERE annonce_id = an.id;
    EXCEPTION WHEN OTHERS THEN
      n_err := n_err + 1;
      DELETE FROM rapprochement_nouvelles WHERE annonce_id = an.id;
      INSERT INTO rapprochements (user_id, annonce_id, decision, par, score, detail)
      VALUES (p_user, an.id, 'aucune', 'auto', 0, jsonb_build_object('motif', 'erreur_moteur', 'erreur', left(SQLERRM, 300), 'phase', 'creation', 'regle', 'rattachement_avant_stock'));
    END;
  END LOOP;

  UPDATE rapprochement_comptes
     SET bilan = bilan || jsonb_build_object(
           'crees', COALESCE((bilan ->> 'crees')::int, 0) + n_crees,
           'groupees', COALESCE((bilan ->> 'groupees')::int, 0) + n_groupes,
           'propositions', COALESCE((bilan ->> 'propositions')::int, 0) + n_prop,
           'erreurs', COALESCE((bilan ->> 'erreurs')::int, 0) + n_err),
         maj_le = now()
   WHERE user_id = p_user;

  -- Reste-t-il des nouvelles CRÉABLES ? (celles qui attendent un geste ne
  -- retiennent pas le compte : elles partiront au prochain « Synchroniser ».)
  SELECT count(*) INTO v_reste
    FROM rapprochement_nouvelles n JOIN annonces_plateforme a ON a.id = n.annonce_id
    LEFT JOIN vinted_sync_runs s ON s.id = a.run_id
   WHERE n.user_id = p_user AND a.inventaire_id IS NULL AND a.ignoree_le IS NULL AND a.disparu_le IS NULL AND a.proposition IS NULL
     AND v_import AND releve_est_geste(s.declencheur) AND a.statut_plateforme = 'en_ligne' AND a.fiche_supprimee_le IS NULL
     AND NOT (v_dette AND a.platform = 'beebs');
  IF v_reste > 0 THEN
    RETURN jsonb_build_object('etat', 'creation', 'crees', n_crees, 'restantes', v_reste,
                              'ms', round(extract(epoch FROM clock_timestamp() - t0) * 1000));
  END IF;

  -- ── E. FIN. Le dressing Vinted relevé pendant la vague a pu créer l'article
  --    d'une annonce déjà importée d'une autre plateforme : la fusion photo
  --    SÛRE existante (fusion_photo_compte : même photo, isolée, plateformes
  --    différentes, aucun frein) passe sur les articles de la vague.
  IF c.debut_le IS NOT NULL AND EXISTS (SELECT 1 FROM vinted_sync_runs s WHERE s.user_id = p_user AND s.kind = 'dressing'
                                          AND s.finished_at >= c.debut_le - interval '30 minutes')
     AND clock_timestamp() - t0 < v_budget THEN
    BEGIN
      v_fus := fusion_photo_compte(p_user, c.debut_le - interval '30 minutes', 20, 'utilisateur:photo_auto', 2000);
    EXCEPTION WHEN OTHERS THEN
      v_fus := jsonb_build_object('ok', false, 'erreur', left(SQLERRM, 200));
    END;
  END IF;
  UPDATE rapprochement_comptes
     SET etat = 'termine', fin_le = now(), maj_le = now(), a_traiter = 0, photos_manquantes = 0,
         bilan = bilan || CASE WHEN v_fus IS NOT NULL THEN jsonb_build_object('fusion_photo', v_fus) ELSE '{}'::jsonb END
   WHERE user_id = p_user;
  RETURN jsonb_build_object('etat', 'termine', 'crees', n_crees, 'fusion_photo', v_fus,
                            'ms', round(extract(epoch FROM clock_timestamp() - t0) * 1000));
END;
$function$;
REVOKE ALL ON FUNCTION public.rapprochement_avancer(uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.rapprochement_lire_fiches(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.rapprochement_candidats(uuid, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.rapprochement_attacher(uuid, bigint, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.rapprochement_relancer(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.rapprochement_demander(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rapprochement_avancer(uuid, integer) TO service_role;

-- ── 11. LE RELEVÉ NE RAPPROCHE PLUS DANS L'EXTENSION ────────────────────────
-- Définition EN PROD du 07/10 (pg_get_functiondef), boucle retirée : les
-- gardes, la revue des questions, les absences et les verdicts sont
-- inchangés ; le rapprochement part au moteur du compte, qui va au bout.
-- La réponse garde sa forme (l'extension 0.6.102 lit `restantes` : 0 → un
-- seul tour, la fin du relevé n'attend plus 2 minutes).
CREATE OR REPLACE FUNCTION public.rapprocher_releve(p_run_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_run vinted_sync_runs%ROWTYPE;
  v_user uuid; v_pf text; v_vus text[];
  n_prop integer := 0; n_disp integer := 0;
  v_complet boolean;
  v_verdicts jsonb := NULL;
  v_questions jsonb;
  v_vide_non_probant boolean := false;
  v_dette_beebs boolean := false;
BEGIN
  SELECT * INTO v_run FROM vinted_sync_runs WHERE id = p_run_id;
  IF v_run.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'run_introuvable'); END IF;
  IF auth.uid() IS NOT NULL AND auth.uid() <> v_run.user_id THEN RETURN jsonb_build_object('ok', false, 'reason', 'unauthorized'); END IF;
  v_user := v_run.user_id; v_pf := v_run.platform;
  IF v_pf NOT IN ('leboncoin', 'beebs', 'ebay', 'opla') THEN RETURN jsonb_build_object('ok', false, 'reason', 'plateforme'); END IF;
  SELECT COALESCE(array_agg(listing_id), ARRAY[]::text[]) INTO v_vus FROM annonces_plateforme WHERE run_id = p_run_id;
  v_complet := releve_preuve_absence(p_run_id);
  IF releve_hors_liste(v_run.erreur) THEN
    RETURN jsonb_build_object('ok', true, 'run_id', p_run_id, 'platform', v_pf, 'hors_liste', true,
                              'relevees', COALESCE(array_length(v_vus, 1), 0), 'verdicts', NULL,
                              'par_job', 0, 'auto', 0, 'proposees', 0, 'sans_candidat', 0,
                              'importees', 0, 'import_refusees', 0, 'ecartees_notification', 0,
                              'restantes', 0, 'budget_epuise', false, 'sautees', 0,
                              'disparues', 0, 'complet', false, 'vide_non_probant', false);
  END IF;
  IF v_pf = 'ebay' AND releve_ebay_run_bloque(p_run_id) THEN
    PERFORM releve_ebay_noter_run(p_run_id);
    RETURN jsonb_build_object('ok', true, 'run_id', p_run_id, 'platform', v_pf, 'hors_compte_ebay', true,
                              'relevees', COALESCE(array_length(v_vus, 1), 0), 'verdicts', NULL,
                              'par_job', 0, 'auto', 0, 'proposees', 0, 'sans_candidat', 0,
                              'importees', 0, 'import_refusees', 0, 'ecartees_notification', 0,
                              'restantes', 0, 'budget_epuise', false, 'sautees', 0,
                              'disparues', 0, 'complet', false, 'vide_non_probant', false);
  END IF;
  IF v_pf = 'ebay' AND releve_ebay_run_incomplet(p_run_id) THEN
    v_complet := false;
  END IF;
  IF v_complet AND COALESCE(array_length(v_vus, 1), 0) = 0
     AND releve_compte_avait_annonces(v_user, v_pf) THEN
    v_complet := false;
    v_vide_non_probant := true;
  END IF;
  v_dette_beebs := v_pf = 'beebs' AND releve_dette_beebs(v_user);
  IF v_dette_beebs THEN
    v_questions := jsonb_build_object('ok', true, 'examinees', 0, 'questions_posees', 0, 'retenue_beebs', true);
  ELSE
    v_questions := revoir_questions_releve(v_user, v_pf, 1);
  END IF;
  n_prop := COALESCE((v_questions ->> 'questions_posees')::integer, 0);

  IF v_complet THEN
    n_disp := COALESCE((constater_absences_releve(p_run_id) ->> 'disparues')::integer, 0);
  END IF;
  IF v_complet THEN
    BEGIN
      v_verdicts := trancher_publications_sans_lien(v_user, v_pf, p_run_id);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'trancher_publications_sans_lien(%) : %', p_run_id, SQLERRM;
      v_verdicts := jsonb_build_object('ok', false, 'erreur', SQLERRM);
    END;
  END IF;

  -- (07/10) Le rapprochement du relevé part au moteur du compte.
  PERFORM rapprochement_demander(v_user, 'releve:' || v_pf);
  PERFORM rapprochement_relancer(v_user);

  RETURN jsonb_build_object('ok', true, 'run_id', p_run_id, 'platform', v_pf, 'relevees', COALESCE(array_length(v_vus, 1), 0),
                            'verdicts', v_verdicts,
                            'par_job', 0, 'auto', 0, 'proposees', n_prop, 'sans_candidat', 0,
                            'importees', 0, 'import_refusees', 0,
                            'ecartees_notification', 0,
                            'restantes', 0, 'budget_epuise', false, 'sautees', 0,
                            'disparues', n_disp, 'complet', v_complet,
                            'vide_non_probant', v_vide_non_probant,
                            'retenues_beebs', 0, 'rapprochement', 'serveur');
END;
$function$;

-- ── 12. LA FIN D'UN RELEVÉ RÉVEILLE LE MOTEUR (relevé interrompu compris) ───
CREATE OR REPLACE FUNCTION public.rapprochement_fin_run()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  BEGIN
    IF EXISTS (SELECT 1 FROM rapprochement_comptes c WHERE c.user_id = NEW.user_id AND c.etat <> 'termine')
       OR EXISTS (SELECT 1 FROM annonces_plateforme a
                   WHERE a.user_id = NEW.user_id AND a.inventaire_id IS NULL AND a.ignoree_le IS NULL AND a.disparu_le IS NULL
                     AND a.proposition IS NULL AND a.platform IN ('leboncoin', 'beebs', 'ebay', 'opla')
                     AND NOT EXISTS (SELECT 1 FROM rapprochement_nouvelles n WHERE n.annonce_id = a.id)) THEN
      PERFORM rapprochement_demander(NEW.user_id, 'fin_run:' || COALESCE(NEW.platform, NEW.kind));
      PERFORM rapprochement_relancer(NEW.user_id);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'rapprochement_fin_run (%) : %', NEW.id, SQLERRM;
  END;
  RETURN NULL;
END;
$function$;
DROP TRIGGER IF EXISTS trg_rapprochement_fin_run ON public.vinted_sync_runs;
CREATE TRIGGER trg_rapprochement_fin_run
  AFTER UPDATE OF status ON public.vinted_sync_runs
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status
        AND NEW.status NOT IN ('queued', 'running')
        AND NEW.kind IN ('annonces', 'dressing'))
  EXECUTE FUNCTION public.rapprochement_fin_run();

-- ── 13. « RANGEMENT EN COURS » : ce que le moteur n'a pas encore tranché ────
-- Même contrat qu'avant (annonce_id, platform, cree_le) : l'app retire ces
-- annonces de « à rattacher » et dit « N annonces trouvées, rangement en
-- cours ». Les nouvelles qui attendent un geste n'en font pas partie.
CREATE OR REPLACE FUNCTION public.annonces_en_rangement()
 RETURNS TABLE(annonce_id uuid, platform text, cree_le timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT x.annonce_id, x.platform, x.cree_le FROM (
    SELECT a.id annonce_id, a.platform, COALESCE(a.vu_le, a.created_at) cree_le
      FROM annonces_plateforme a
     WHERE a.user_id = auth.uid() AND a.inventaire_id IS NULL AND a.ignoree_le IS NULL AND a.disparu_le IS NULL
       AND a.proposition IS NULL AND a.platform IN ('leboncoin', 'beebs', 'ebay', 'opla')
       AND EXISTS (SELECT 1 FROM rapprochement_comptes c WHERE c.user_id = a.user_id AND c.etat <> 'termine')
    UNION ALL
    SELECT w.annonce_id, w.platform, w.cree_le
      FROM rapprochement_photo_attente w
     WHERE w.user_id = auth.uid() AND w.etat = 'attente'
  ) x
  ORDER BY x.cree_le
  LIMIT 2000;
$function$;

-- ── 14. L'AVANCEMENT D'UNE SYNCHRO, ET SON TEMPS ESTIMÉ ─────────────────────
-- Pour la barre de l'app : par plateforme, le relevé de la vague (statut, lu,
-- annoncé par la plateforme), puis le rapprochement ; et « environ X min »,
-- calculé sur le volume ANNONCÉ par chaque plateforme (total_entries, ou le
-- dernier relevé réussi) et sur les vitesses MESURÉES (synchro_vitesses,
-- relevés terminés des 14 derniers jours, recalculées au plus une fois par
-- heure). Les relevés passent un par un (l'extension n'en tient qu'un) : leurs
-- restes s'additionnent ; le dressing Vinted part par son propre chemin.
CREATE OR REPLACE FUNCTION public.synchro_vitesses_relire()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF EXISTS (SELECT 1 FROM synchro_vitesses WHERE mesure_le > now() - interval '1 hour') THEN RETURN; END IF;
  INSERT INTO synchro_vitesses AS v (platform, s_base, s_par_annonce, n, mesure_le)
  SELECT z.pf,
         greatest(5, least(120, COALESCE(percentile_cont(0.5) WITHIN GROUP (ORDER BY z.d) FILTER (WHERE z.items < 20), 20))),
         greatest(0.02, least(3, COALESCE(percentile_cont(0.5) WITHIN GROUP (ORDER BY z.d / z.items) FILTER (WHERE z.items >= 20), 0.5))),
         count(*), now()
    FROM (SELECT CASE WHEN s.kind = 'dressing' THEN 'vinted' ELSE s.platform END pf,
                 extract(epoch FROM s.finished_at - COALESCE(s.started_at, s.claimed_at)) d,
                 greatest(1, COALESCE(s.items_vus, 0)) items
            FROM vinted_sync_runs s
           WHERE s.finished_at > now() - interval '14 days' AND s.status IN ('done', 'incomplete')
             AND s.kind IN ('annonces', 'dressing') AND COALESCE(s.started_at, s.claimed_at) IS NOT NULL
             AND s.finished_at > COALESCE(s.started_at, s.claimed_at)
             AND s.finished_at - COALESCE(s.started_at, s.claimed_at) < interval '40 minutes'
           LIMIT 5000) z
   WHERE z.pf IS NOT NULL
   GROUP BY z.pf
  ON CONFLICT (platform) DO UPDATE SET s_base = EXCLUDED.s_base, s_par_annonce = EXCLUDED.s_par_annonce, n = EXCLUDED.n, mesure_le = EXCLUDED.mesure_le;
END;
$function$;
REVOKE ALL ON FUNCTION public.synchro_vitesses_relire() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.synchro_vitesses_relire() TO service_role;

CREATE OR REPLACE FUNCTION public.synchro_avancement()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_runs jsonb := '[]'::jsonb; r record; v jsonb;
  v_restant_releves numeric := 0; v_restant_vinted numeric := 0; v_restant_rap numeric := 0;
  v_total numeric := 0; v_fait numeric := 0; v_volume numeric; v_attendu numeric; v_ecoule numeric;
  c rapprochement_comptes%ROWTYPE; v_en_attente integer := 0; v_nouvelles integer := 0; v_a_verifier integer := 0;
  v_actif boolean := false; v_vague timestamptz;
BEGIN
  IF v_user IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'unauthorized'); END IF;
  SELECT * INTO c FROM rapprochement_comptes WHERE user_id = v_user;
  -- La vague : les relevés DEMANDÉS par la personne depuis 2 h, le plus
  -- récent par plateforme (une veille ne s'affiche jamais, règle du 05/10).
  v_vague := now() - interval '2 hours';
  FOR r IN
    SELECT DISTINCT ON (CASE WHEN s.kind = 'dressing' THEN 'vinted' ELSE s.platform END)
           CASE WHEN s.kind = 'dressing' THEN 'vinted' ELSE s.platform END pf, s.kind, s.status, s.items_vus, s.total_entries,
           s.queued_at, s.started_at, s.finished_at, s.progres_le
      FROM vinted_sync_runs s
     WHERE s.user_id = v_user AND s.kind IN ('annonces', 'dressing')
       AND COALESCE(s.queued_at, s.started_at) > v_vague AND releve_est_geste(s.declencheur)
     ORDER BY CASE WHEN s.kind = 'dressing' THEN 'vinted' ELSE s.platform END, COALESCE(s.queued_at, s.started_at) DESC
  LOOP
    SELECT to_jsonb(x) INTO v FROM synchro_vitesses x WHERE x.platform = r.pf;
    -- Le volume réel annoncé par la plateforme, sinon le dernier relevé réussi.
    v_volume := COALESCE(r.total_entries, (SELECT s2.items_vus FROM vinted_sync_runs s2
                                             WHERE s2.user_id = v_user AND s2.status IN ('done', 'incomplete')
                                               AND (CASE WHEN s2.kind = 'dressing' THEN 'vinted' ELSE s2.platform END) = r.pf
                                             ORDER BY s2.finished_at DESC NULLS LAST LIMIT 1), 100);
    v_attendu := COALESCE((v ->> 's_base')::numeric, 20) + COALESCE((v ->> 's_par_annonce')::numeric, 0.5) * v_volume;
    v_ecoule := CASE WHEN r.status = 'running' THEN extract(epoch FROM now() - COALESCE(r.started_at, now())) ELSE 0 END;
    v_total := v_total + v_attendu;
    IF r.status = 'queued' THEN
      IF r.pf = 'vinted' THEN v_restant_vinted := greatest(v_restant_vinted, v_attendu); ELSE v_restant_releves := v_restant_releves + v_attendu; END IF;
      v_actif := true;
    ELSIF r.status = 'running' THEN
      IF r.pf = 'vinted' THEN v_restant_vinted := greatest(v_restant_vinted, greatest(5, v_attendu - v_ecoule));
      ELSE v_restant_releves := v_restant_releves + greatest(5, v_attendu - v_ecoule); END IF;
      v_fait := v_fait + least(v_attendu * 0.95, v_ecoule);
      v_actif := true;
    ELSE
      v_fait := v_fait + v_attendu;
    END IF;
    v_runs := v_runs || jsonb_build_array(jsonb_build_object(
      'platform', r.pf, 'status', r.status, 'lues', r.items_vus, 'annoncees', r.total_entries, 'volume', v_volume,
      'debut', r.started_at, 'fin', r.finished_at, 'attendu_s', round(v_attendu)));
  END LOOP;

  IF c.user_id IS NOT NULL AND c.etat <> 'termine' THEN
    SELECT count(*) INTO v_en_attente FROM annonces_plateforme a
     WHERE a.user_id = v_user AND a.inventaire_id IS NULL AND a.ignoree_le IS NULL AND a.disparu_le IS NULL
       AND a.proposition IS NULL AND a.platform IN ('leboncoin', 'beebs', 'ebay', 'opla');
    SELECT count(*) INTO v_nouvelles FROM rapprochement_nouvelles n WHERE n.user_id = v_user;
    -- Vitesse mesurée du moteur sur CE compte (ms par annonce), sinon 60 ms ;
    -- photos : environ 25 par seconde en parallèle.
    v_restant_rap := 5 + COALESCE(c.photos_manquantes, 0) / 25.0
                   + v_en_attente * COALESCE(c.ms_decision::numeric / NULLIF(c.traitees, 0), 60) / 1000.0
                   + v_nouvelles * 0.08;
    v_actif := true;
  END IF;
  SELECT count(*) INTO v_a_verifier FROM annonces_plateforme a
   WHERE a.user_id = v_user AND a.inventaire_id IS NULL AND a.ignoree_le IS NULL AND a.disparu_le IS NULL
     AND a.proposition IS NOT NULL;

  RETURN jsonb_build_object(
    'ok', true, 'actif', v_actif, 'releves', v_runs,
    'rapprochement', CASE WHEN c.user_id IS NULL THEN NULL ELSE jsonb_build_object(
        'etat', c.etat, 'demande_le', c.demande_le, 'debut_le', c.debut_le, 'fin_le', c.fin_le,
        'en_attente', v_en_attente, 'nouvelles', v_nouvelles, 'traitees', c.traitees,
        'photos_manquantes', c.photos_manquantes, 'bilan', c.bilan) END,
    'a_verifier', v_a_verifier,
    'secondes_restantes', round(greatest(v_restant_vinted, v_restant_releves) + v_restant_rap),
    'avancement', CASE WHEN v_total + v_restant_rap <= 0 THEN 1
                       ELSE round(least(1, v_fait / (v_fait + greatest(v_restant_vinted, v_restant_releves) + v_restant_rap))::numeric, 3) END);
END;
$function$;
REVOKE ALL ON FUNCTION public.synchro_avancement() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.synchro_avancement() TO authenticated;

SELECT public.synchro_vitesses_relire();

-- ── 15. LA FUSION DÉPLACE TOUT (push_ventes, remises_en_vente) ──────────────
-- Définitions EN PROD du 07/10, deux blocs ajoutés (et leur retour en
-- défaisant). Rien d'autre ne change.
DO $do$
DECLARE d text;
BEGIN
  d := pg_get_functiondef('public.inventaire_fusionner_pour(uuid,bigint,bigint,text)'::regprocedure);
  IF position('push_ventes' in d) = 0 THEN
    d := replace(d,
      $a$  SELECT jsonb_agg(id) INTO v_ids FROM rapprochements WHERE inventaire_id = p_absorbe AND user_id = v_user;$a$,
      $b$  -- (07/10) Les notifications de vente et les remises en vente suivent l'article.
  SELECT jsonb_agg(id) INTO v_ids FROM push_ventes WHERE inventaire_id = p_absorbe AND user_id = v_user;
  IF v_ids IS NOT NULL THEN
    UPDATE push_ventes SET inventaire_id = p_garde WHERE inventaire_id = p_absorbe AND user_id = v_user;
    v_dep := v_dep || jsonb_build_object('push_ventes', v_ids);
  END IF;
  SELECT jsonb_agg(id) INTO v_ids FROM remises_en_vente WHERE inventaire_id = p_absorbe AND user_id = v_user;
  IF v_ids IS NOT NULL THEN
    UPDATE remises_en_vente SET inventaire_id = p_garde WHERE inventaire_id = p_absorbe AND user_id = v_user;
    v_dep := v_dep || jsonb_build_object('remises_en_vente', v_ids);
  END IF;
  SELECT jsonb_agg(id) INTO v_ids FROM rapprochements WHERE inventaire_id = p_absorbe AND user_id = v_user;$b$);
    IF position('push_ventes' in d) = 0 THEN RAISE EXCEPTION 'inventaire_fusionner_pour : ancre introuvable'; END IF;
    EXECUTE d;
  END IF;
  d := pg_get_functiondef('public.inventaire_defusionner_pour(uuid,uuid,text)'::regprocedure);
  IF position('push_ventes' in d) = 0 THEN
    d := replace(d,
      $a$  SELECT array_agg((x)::bigint) INTO v_ids FROM jsonb_array_elements_text(COALESCE(f.deplacements -> 'vinted_listing_snapshots', '[]'::jsonb)) x;$a$,
      $b$  SELECT array_agg((x)::bigint) INTO v_ids FROM jsonb_array_elements_text(COALESCE(f.deplacements -> 'push_ventes', '[]'::jsonb)) x;
  IF v_ids IS NOT NULL THEN UPDATE push_ventes SET inventaire_id = f.absorbe WHERE id = ANY (v_ids) AND user_id = v_user; END IF;
  SELECT array_agg((x)::bigint) INTO v_ids FROM jsonb_array_elements_text(COALESCE(f.deplacements -> 'remises_en_vente', '[]'::jsonb)) x;
  IF v_ids IS NOT NULL THEN UPDATE remises_en_vente SET inventaire_id = f.absorbe WHERE id = ANY (v_ids) AND user_id = v_user; END IF;
  SELECT array_agg((x)::bigint) INTO v_ids FROM jsonb_array_elements_text(COALESCE(f.deplacements -> 'vinted_listing_snapshots', '[]'::jsonb)) x;$b$);
    IF position('push_ventes' in d) = 0 THEN RAISE EXCEPTION 'inventaire_defusionner_pour : ancre introuvable'; END IF;
    EXECUTE d;
  END IF;
END
$do$;

-- ── 16. « OUI, C'EST LE MÊME » SUR UN ARTICLE VENDU ─────────────────────────
-- L'annonce en ligne d'un article déjà VENDU, rattachée par la personne :
-- son job de suivi part « vendu, encore en ligne » (le bandeau existant
-- « Vendu — encore en ligne sur X, retirer ? »), comme un dépôt clos retrouvé
-- par son identifiant (25/09). Jamais un article en vente ressuscité.
DO $do$
DECLARE d text;
BEGIN
  d := pg_get_functiondef('public.rapprochement_decider(uuid,text,bigint)'::regprocedure);
  IF position('vendu_encore_en_ligne' in d) = 0 THEN
    d := replace(d,
      $a$    UPDATE annonces_plateforme SET inventaire_id = v_inv, job_id = v_job, source_rapprochement = 'manuel', proposition = NULL, ignoree_le = NULL, fiche_supprimee_le = NULL, updated_at = now() WHERE id = a.id;$a$,
      $b$    -- (07/10) Article VENDU : le suivi part « vendu, encore en ligne ».
    IF EXISTS (SELECT 1 FROM inventaire i WHERE i.id = v_inv AND i.statut = 'vendu') THEN
      UPDATE cross_post_jobs
         SET status = 'cancelled',
             platform_fields = COALESCE(platform_fields, '{}'::jsonb) || jsonb_build_object('pending_removal', true,
                               'vendu_encore_en_ligne', jsonb_build_object('annonce_id', a.id, 'par', 'utilisateur', 'at', now()))
       WHERE id = v_job AND user_id = v_user AND platform_fields ->> 'source' = 'releve';
    END IF;
    UPDATE annonces_plateforme SET inventaire_id = v_inv, job_id = v_job, source_rapprochement = 'manuel', proposition = NULL, ignoree_le = NULL, fiche_supprimee_le = NULL, updated_at = now() WHERE id = a.id;$b$);
    IF position('vendu_encore_en_ligne' in d) = 0 THEN RAISE EXCEPTION 'rapprochement_decider : ancre introuvable'; END IF;
    EXECUTE d;
  END IF;
END
$do$;

-- ── 17. LE FILET : le moteur repart s'il a du retard (au plus chaque minute)
-- Ne part QUE s'il y a un compte en retard (maj_le > 45 s) : un compte au
-- repos ne coûte rien. Le réveil normal vient du relevé (rapprocher_releve,
-- trg_rapprochement_fin_run).
DO $do$
BEGIN
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'rapprochement-1min';
  PERFORM cron.schedule('rapprochement-1min', '* * * * *', $cron$
    SELECT net.http_post(
      url := 'https://tojihnuawsoohlolangc.supabase.co/functions/v1/rapprochement',
      body := '{}'::jsonb,
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', public.cron_secret()),
      timeout_milliseconds := 150000)
    WHERE EXISTS (SELECT 1 FROM public.rapprochement_comptes
                   WHERE etat <> 'termine' AND maj_le < now() - interval '45 seconds');
  $cron$);
END
$do$;

COMMIT;
