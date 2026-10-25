-- ESSAI (BEGIN … ROLLBACK) de la migration 20261025200000_rythme_par_plateforme — NE LAISSE RIEN.
-- Jouer : npx supabase db query --linked -f scripts/essais/20261025200000_rythme_par_plateforme_essai.sql
-- 1. balayage de PROD (ancien corps) ; 2. nouveau corps, interrupteur ÉTEINT (doit être identique à 1) ;
-- 3. nouveau corps, interrupteur ALLUMÉ (ce qui changerait). Chaque balayage est annulé en sous-transaction.
BEGIN ISOLATION LEVEL REPEATABLE READ;
SET LOCAL statement_timeout = '120s';
SET LOCAL lock_timeout = '3s';
CREATE TEMP TABLE essai_out (phase text, sortie jsonb, jobs jsonb, notes jsonb, ms integer) ON COMMIT DROP;

CREATE OR REPLACE FUNCTION essai_debut() RETURNS timestamptz LANGUAGE sql STABLE AS $f$ SELECT now() $f$;

DO $b$
DECLARE v jsonb; v_jobs jsonb; v_notes jsonb; t0 timestamptz := clock_timestamp(); v_ms integer;
BEGIN
  BEGIN
    v := public.republish_planifiee_sweep();
    v_ms := round(extract(epoch FROM clock_timestamp() - t0) * 1000)::integer;
    SELECT COALESCE(jsonb_agg(jsonb_build_object('compte', split_part(p.email, '@', 1), 'pf', j.platform, 'inv', j.inventaire_id) ORDER BY p.email, j.platform, j.inventaire_id), '[]'::jsonb)
      INTO v_jobs
      FROM cross_post_jobs j JOIN profiles p ON p.id = j.user_id
     WHERE j.action = 'republish' AND j.platform_fields ->> 'republish_source' = 'auto' AND j.created_at >= essai_debut();
    SELECT COALESCE(jsonb_agg(jsonb_build_object('creneau', r.id, 'compte', split_part(p.email, '@', 1), 'pf', r.platform,
             'cles', (SELECT jsonb_agg(k ORDER BY k) FROM jsonb_object_keys(r.sautes) k WHERE k LIKE '_%'),
             'espacement', r.sautes -> '_espacement') ORDER BY r.id), '[]'::jsonb)
      INTO v_notes
      FROM republish_creneaux r JOIN profiles p ON p.id = r.user_id WHERE r.statut = 'en_cours';
    RAISE EXCEPTION 'annule' USING ERRCODE = 'ZZ003';
  EXCEPTION WHEN SQLSTATE 'ZZ003' THEN NULL;
  END;
  -- Après l'annulation : seules les variables PL/pgSQL ont survécu.
  INSERT INTO essai_out (phase, sortie, jobs, notes, ms) VALUES ('1_prod', v, v_jobs, v_notes, v_ms);
END $b$;

-- 2. Le nouveau corps (garde md5 comprise), interrupteur éteint.
DO $garde$
BEGIN
  IF md5(pg_get_functiondef('public.republish_planifiee_sweep()'::regprocedure)) <> '22bb479d7197e7ec9e316aceb00aab01' THEN
    RAISE EXCEPTION 'La prod a changé : refaire la migration.';
  END IF;
END
$garde$;
CREATE OR REPLACE FUNCTION public.republish_planifiee_sweep()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_actif      integer;
  v_compte     record;
  v_pf         text;
  v_regl       jsonb;
  v_fen        jsonb;
  v_row        republish_creneaux%ROWTYPE;
  v_ident      jsonb;
  v_boutique   text;
  v_multi      boolean;
  v_esp        jsonb;
  v_capacite   integer;
  v_elig       integer;
  v_prevues    integer;
  v_minuit     timestamptz;
  v_plafond    integer;
  v_faits      integer;
  v_plafond_b  integer;
  v_faits_b    integer;
  v_intervalle numeric;
  v_dernier    timestamptz;
  v_cand       record;
  v_cle        text;
  v_notes      jsonb;
  v_rpc        jsonb;
  v_reason     text;
  v_job        uuid;
  v_examines   integer;
  v_rapport    jsonb := '[]'::jsonb;
  v_ligne      jsonb;
  v_comptes    integer := 0;
  v_hors_ligne integer;
  v_mobiles    integer;
  v_parques    integer;
  v_bloque     jsonb;
  v_faits_cr   integer;
  -- 18/09 : multiplateforme
  v_palier     text;
  v_cree       boolean;
  v_grace      integer;
  v_perdu      timestamptz;
  v_ps         jsonb;
  v_cur        jsonb;
  v_disj_n     integer;
  v_disj_max   integer;
  v_j          record;
  v_duree      integer;  -- (08/10, Louis) durée estimée d'une republication
  v_fin_regl   timestamptz;  -- (11/10, Louis) fin du créneau selon le RÉGLAGE courant
  v_debut_ryt  timestamptz;  -- (11/10) départ du rythme (réalignement compris)
  v_prev_ryt   integer;      -- (11/10) prévues comptées depuis ce départ
  v_portee     text;         -- (12/10, A4) portée d'un échec : compte | article
  -- (25/10, Jocabroc 53efea05) la place d'un candidat sauté est rendue ; toute retenue dit son motif
  v_reels_cr    integer;     -- jobs du créneau qui ont agi, agissent ou vont agir (non sautés)
  v_sautes_cr   integer;     -- essais sautés du créneau (republish_essai_saute)
  v_remplace    boolean;     -- la place des sautés est-elle encore rendue ? (au plus `prevues`)
  v_dernier_pf  text;        -- plateforme de la republication qui fixe le rythme
  v_prochaine   timestamptz; -- l'heure à laquelle le rythme laisse partir la suivante
  v_job_cree_pf boolean;     -- un job est né pour CETTE plateforme pendant ce passage
  v_sortie_cpt  boolean;     -- le passage s'est arrêté sur un refus du COMPTE
  v_tentes      integer;     -- candidats éligibles soumis au RPC pendant ce passage
  v_rythme_pf   boolean;     -- (25/10 soir, Nico) le rythme compté PAR PLATEFORME (coin_config.republish_rythme_par_plateforme = 1)
BEGIN
  SELECT value INTO v_actif FROM coin_config WHERE key = 'republish_planifiee_actif';
  IF COALESCE(v_actif, 0) <> 1 THEN
    RETURN jsonb_build_object('actif', false, 'comptes', 0, 'crees', 0,
      'motif', 'interrupteur coin_config.republish_planifiee_actif <> 1');
  END IF;
  SELECT value INTO v_disj_max FROM coin_config WHERE key = 'republish_disjoncteur_echecs';
  v_disj_max := GREATEST(1, COALESCE(v_disj_max, 2));
  SELECT value INTO v_grace FROM coin_config WHERE key = 'republish_palier_perdu_grace_h';
  v_grace := GREATEST(1, COALESCE(v_grace, 48));
  -- (25/10 soir, décision de Nico) LE RYTHME PAR PLATEFORME, derrière un interrupteur ÉTEINT par défaut (clé absente
  -- ou ≠ 1 : le rythme reste celui du COMPTE, toutes plateformes, règle du 18/09). Allumé : chaque plateforme compte
  -- son attente depuis SA dernière republication (Vinted 30 min, Leboncoin 36 min chez Jocabroc) — l'extension fait
  -- toujours UNE action à la fois (verrou de flux, file unique), « un job par compte et par passage » reste.
  v_rythme_pf := COALESCE((SELECT value FROM coin_config WHERE key = 'republish_rythme_par_plateforme'), 0) = 1;

  -- Les comptes qui ont AU MOINS UNE plateforme active.
  FOR v_compte IN
    SELECT p.id, p.email, p.extension_last_seen_at
    FROM profiles p
    WHERE EXISTS (
      SELECT 1 FROM unnest(republish_planifiee_plateformes()) pf
      WHERE COALESCE((p.platform_settings #> ARRAY[pf, 'republish_planifiee'] ->> 'actif')::boolean, false)
    )
    ORDER BY p.id
  LOOP
    v_comptes := v_comptes + 1;
    v_cree := false;

    -- 0. LE DROIT. Un compte actif sans palier Pro : on pose la date, puis on
    -- arrête au-delà de la grâce — une seule fois, pour les quatre.
    v_palier := republish_palier(v_compte.id);
    IF v_palier NOT IN ('pro', 'business') THEN
      SELECT COALESCE(p2.platform_settings, '{}'::jsonb) INTO v_ps FROM profiles p2 WHERE p2.id = v_compte.id FOR UPDATE;
      FOREACH v_pf IN ARRAY republish_planifiee_plateformes() LOOP
        v_cur := v_ps #> ARRAY[v_pf, 'republish_planifiee'];
        CONTINUE WHEN v_cur IS NULL OR jsonb_typeof(v_cur) <> 'object'
                   OR NOT COALESCE((v_cur ->> 'actif')::boolean, false);
        v_perdu := NULLIF(v_cur ->> 'palier_perdu_le', '')::timestamptz;
        IF v_perdu IS NULL THEN
          v_cur := v_cur || jsonb_build_object('palier_perdu_le', now());
        ELSIF v_perdu < now() - make_interval(hours => v_grace) THEN
          v_cur := v_cur || jsonb_build_object('actif', false, 'arrete_le', now(),
                                               'arret_motif', 'palier_perdu');
        ELSE
          CONTINUE;
        END IF;
        v_ps := jsonb_set(v_ps, ARRAY[v_pf, 'republish_planifiee'], v_cur, true);
      END LOOP;
      UPDATE profiles SET platform_settings = v_ps WHERE id = v_compte.id;
      CONTINUE;
    END IF;

    -- 1. Historique : clôturer ce qui est passé (toutes plateformes).
    PERFORM republish_creneau_cloturer(v_compte.id);

    FOR v_pf IN
      SELECT pf FROM unnest(republish_planifiee_plateformes()) AS pf
      ORDER BY (SELECT count(*) FROM cross_post_jobs j
                 WHERE j.user_id = v_compte.id AND j.action = 'republish' AND j.platform = pf
                   AND j.platform_fields ->> 'republish_source' = 'auto'
                   AND j.created_at >= date_trunc('day', now())) ASC,  -- MODIF FAMINE 2026-09-24 : la plateforme la MOINS servie aujourd hui passe d abord (tour de role), au lieu de Vinted toujours en tete
               array_position(republish_planifiee_plateformes(), pf)
    LOOP
      EXIT WHEN v_cree;  -- UN job par compte et par passage, toutes plateformes.

      v_regl := republish_planifiee_reglage(v_compte.id, v_pf);
      CONTINUE WHEN v_regl IS NULL OR NOT COALESCE((v_regl ->> 'actif')::boolean, false);
      -- Interrupteur de la plateforme (fail-closed).
      CONTINUE WHEN NOT republish_planifiee_pf_ouverte(v_pf);
      -- La date de palier perdu n'a plus lieu d'être : le droit est là.
      IF v_regl ->> 'palier_perdu_le' IS NOT NULL THEN
        UPDATE profiles
           SET platform_settings = jsonb_set(platform_settings, ARRAY[v_pf, 'republish_planifiee'],
                 (platform_settings #> ARRAY[v_pf, 'republish_planifiee']) - 'palier_perdu_le', true)
         WHERE id = v_compte.id;
      END IF;

      -- 2. Hors créneau → rien. Un créneau manqué n'est jamais rattrapé.
      v_fen := republish_planifiee_fenetre(v_regl, now());
      CONTINUE WHEN NOT COALESCE((v_fen ->> 'dans_creneau')::boolean, false);

      v_minuit := republish_minuit_local(COALESCE(v_regl ->> 'fuseau', 'Europe/Paris'));

      -- 2bis. DISJONCTEUR DU JOUR : cette plateforme s'est-elle déjà arrêtée
      -- aujourd'hui ? (note posée sur un créneau de la journée locale)
      IF EXISTS (
        SELECT 1 FROM republish_creneaux r
        WHERE r.user_id = v_compte.id AND r.platform = v_pf
          AND r.debut >= v_minuit AND r.sautes ? '_disjoncteur'
      ) THEN
        CONTINUE;
      END IF;

      IF v_pf = 'vinted' THEN
        v_ident    := republish_boutique_connectee(v_compte.id);
        v_boutique := v_ident ->> 'user_id';
        v_multi    := jsonb_array_length(republish_boutiques(v_compte.id)) >= 2;
      ELSE
        v_ident := NULL; v_boutique := NULL; v_multi := false;
      END IF;

      -- (24/10, décision de Nico) Plus de plafond du palier ni d'enveloppe de
      -- compte : le nombre par jour CHOISI pour cette plateforme (NULL = aucun).
      v_plafond  := (v_regl ->> 'plafond_jour')::integer;
      SELECT count(*) INTO v_faits
      FROM cross_post_jobs j
      WHERE j.user_id = v_compte.id AND j.action = 'republish' AND j.platform = v_pf
        AND j.platform_fields ->> 'republish_source' = 'auto'
        AND j.created_at >= v_minuit;

      v_plafond_b := NULL; v_faits_b := 0;
      IF v_pf = 'vinted' AND v_boutique IS NOT NULL THEN
        v_plafond_b := NULLIF(v_regl -> 'plafond_boutique' ->> v_boutique, '')::integer;
        v_plafond_b := CASE WHEN v_plafond_b IS NULL THEN v_plafond ELSE LEAST(GREATEST(1, v_plafond_b), v_plafond) END;
        SELECT count(*) INTO v_faits_b
        FROM cross_post_jobs j JOIN inventaire i ON i.id = j.inventaire_id
        WHERE j.user_id = v_compte.id AND j.action = 'republish' AND j.platform = 'vinted'
          AND j.platform_fields ->> 'republish_source' = 'auto'
          AND j.created_at >= v_minuit
          AND i.vinted_account_id = v_boutique;
      END IF;

      -- La ligne du créneau courant, créée au premier passage avec ce que le
      -- serveur ATTEND à cet instant (c'est ce que l'app annonce). La capacité
      -- est PARTAGÉE : le temps déjà réservé par les autres plateformes est
      -- déduit — un seul Chrome pour quatre files.
      SELECT * INTO v_row FROM republish_creneaux
      WHERE user_id = v_compte.id AND platform = v_pf AND debut = (v_fen ->> 'courant_debut')::timestamptz
        AND COALESCE(boutique, '') = COALESCE(v_boutique, '');
      -- Boutique connue, aucune ligne à son nom : une ligne SANS boutique du
      -- même créneau est née avant que la sonde ne parle — elle lui appartient.
      -- On la BAPTISE, on n'en crée pas une seconde. (Baptiser n'est pas geler :
      -- l'autre boutique aura, elle, sa PROPRE ligne, parce que la lecture
      -- ci-dessus discrimine sur la boutique à chaque passage.)
      IF NOT FOUND AND v_boutique IS NOT NULL THEN
        UPDATE republish_creneaux
           SET boutique = v_boutique, updated_at = now()
         WHERE user_id = v_compte.id AND platform = v_pf
           AND debut = (v_fen ->> 'courant_debut')::timestamptz AND boutique IS NULL
        RETURNING * INTO v_row;
      END IF;
      -- Boutique INCONNUE alors que le créneau a déjà une ligne : on ne fabrique
      -- pas un doublon sans nom (il réserverait de la capacité pour les autres
      -- plateformes sans jamais rien produire). On reprend celle qui existe.
      IF NOT FOUND AND v_boutique IS NULL THEN
        SELECT * INTO v_row FROM republish_creneaux
        WHERE user_id = v_compte.id AND platform = v_pf
          AND debut = (v_fen ->> 'courant_debut')::timestamptz
        ORDER BY updated_at DESC LIMIT 1;
      END IF;
      IF NOT FOUND THEN
        v_esp := republish_planifiee_espacement(v_compte.id, v_pf);
        -- MODIF FAMINE 2026-09-24 : part EGALE du creneau entre les plateformes actives+eligibles
        -- (republish_planifiee_actives_eligibles), au lieu de reserver tout le temps a la premiere
        -- (Vinted). Un compte mono-plateforme -> N=1 -> part pleine -> INCHANGE. On ne touche NI a
        -- l espacement (v_esp, propre a la plateforme), NI aux plafonds/quotas (LEAST plus bas).
        v_capacite := republish_planifiee_capacite(
          GREATEST(60, (extract(epoch FROM ((v_fen ->> 'courant_fin')::timestamptz - now()))::integer
                        / republish_planifiee_actives_eligibles(v_compte.id)))::integer,
          (v_esp ->> 'sec')::integer);
        SELECT count(*) INTO v_elig
        FROM republish_planifiee_candidats(v_compte.id, v_regl, v_pf) c
        WHERE c.motif IS NULL
          AND (v_boutique IS NULL OR NOT v_multi OR c.boutique IS NULL OR c.boutique = v_boutique);
        v_prevues := LEAST(CASE WHEN v_plafond IS NULL THEN NULL ELSE GREATEST(0, v_plafond - v_faits) END,
                           v_elig, v_capacite);
        IF v_plafond_b IS NOT NULL THEN
          v_prevues := LEAST(v_prevues, GREATEST(0, v_plafond_b - v_faits_b));
        END IF;
        INSERT INTO republish_creneaux
          (user_id, platform, jour, de, a, fuseau, debut, fin, statut, boutique,
           eligibles_debut, prevues, espacement_sec, extension_vue)
        VALUES
          (v_compte.id, v_pf, (v_fen ->> 'jour_local')::date, (v_regl ->> 'de')::time, (v_regl ->> 'a')::time,
           COALESCE(v_regl ->> 'fuseau', 'Europe/Paris'),
           (v_fen ->> 'courant_debut')::timestamptz, (v_fen ->> 'courant_fin')::timestamptz, 'en_cours', v_boutique,
           v_elig, v_prevues, (v_esp ->> 'sec')::integer,
           v_compte.extension_last_seen_at > now() - interval '10 minutes')
        ON CONFLICT (user_id, platform, debut, (COALESCE(boutique, ''::text))) DO NOTHING;
        SELECT * INTO v_row FROM republish_creneaux
        WHERE user_id = v_compte.id AND platform = v_pf AND debut = (v_fen ->> 'courant_debut')::timestamptz
          AND COALESCE(boutique, '') = COALESCE(v_boutique, '');
      END IF;

      -- 2ter. (11/10, Louis — @evat, plus rien après 14:00) LA LIGNE DU CRÉNEAU
      -- SUIT LE RÉGLAGE. Elle est retrouvée par son DÉBUT : déplacer la FIN du
      -- créneau (14:00 → 17:00 → 23:59) reprenait la ligne née avec l'ancienne
      -- fin — 6ter coupait tout à 14:00, la clôture la passait « ecourte », et
      -- l'app annonçait des republications que le balayage ne faisait plus.
      -- Désormais, une fin (ou des heures) qui ne sont plus celles du réglage
      -- RÉALIGNENT la ligne : nouvelle fin, ligne rouverte si la fin est à venir,
      -- prévues recalculées pour le TEMPS RESTANT exactement comme à la
      -- création (part égale, espacement réel, plafonds, éligibles), et le
      -- rythme repart de cet instant (6). Raccourcir le créneau le raccourcit
      -- aussi : plus rien ne part après la nouvelle fin (6ter).
      v_fin_regl := (v_fen ->> 'courant_fin')::timestamptz;
      IF v_row.id IS NOT NULL AND v_fin_regl IS NOT NULL
         AND (v_row.fin IS DISTINCT FROM v_fin_regl
              OR v_row.a IS DISTINCT FROM (v_regl ->> 'a')::time
              OR v_row.de IS DISTINCT FROM (v_regl ->> 'de')::time) THEN
        v_esp := republish_planifiee_espacement(v_compte.id, v_pf);
        v_capacite := republish_planifiee_capacite(
          GREATEST(60, (extract(epoch FROM (v_fin_regl - now()))::integer
                        / republish_planifiee_actives_eligibles(v_compte.id)))::integer,
          (v_esp ->> 'sec')::integer);
        SELECT count(*) INTO v_elig
        FROM republish_planifiee_candidats(v_compte.id, v_regl, v_pf) c
        WHERE c.motif IS NULL
          AND (v_boutique IS NULL OR NOT v_multi OR c.boutique IS NULL OR c.boutique = v_boutique);
        -- (25/10) un essai SAUTÉ (republish_essai_saute) n'est pas une faite : sa place reste
        -- rendue après le réalignement (même lecture qu'en 6bis).
        SELECT count(*) FILTER (WHERE NOT republish_essai_saute(j.status, j.platform_fields, j.error))
          INTO v_faits_cr FROM cross_post_jobs j
        WHERE j.user_id = v_compte.id AND j.action = 'republish' AND j.platform = v_pf
          AND j.platform_fields ->> 'republish_creneau_id' = v_row.id::text;
        v_prevues := LEAST(CASE WHEN v_plafond IS NULL THEN NULL ELSE GREATEST(0, v_plafond - v_faits) END,
                           v_elig, v_capacite);
        IF v_plafond_b IS NOT NULL THEN
          v_prevues := LEAST(v_prevues, GREATEST(0, v_plafond_b - v_faits_b));
        END IF;
        UPDATE republish_creneaux
           SET de = (v_regl ->> 'de')::time, a = (v_regl ->> 'a')::time,
               fin = v_fin_regl,
               prevues = v_faits_cr + v_prevues,
               espacement_sec = (v_esp ->> 'sec')::integer,
               statut = CASE WHEN v_fin_regl > now() THEN 'en_cours' ELSE statut END,
               sautes = (sautes - '_fin_de_creneau' - '_prevues_atteintes')
                        || jsonb_build_object('_reglage_change', jsonb_build_object(
                             'motif', 'reglage_change', 'platform', v_pf,
                             'fin_avant', v_row.fin, 'fin', v_fin_regl,
                             'prevues_avant', v_row.prevues, 'prevues', v_faits_cr + v_prevues,
                             'faites_avant', v_faits_cr, 'depuis', now(),
                             'statut_avant', v_row.statut, 'at', now())),
               updated_at = now()
         WHERE id = v_row.id
        RETURNING * INTO v_row;
      END IF;

      -- 3. Extension vivante ? 10 MINUTES : au-delà on créerait des jobs pour
      -- des Chrome éteints, qui dormiraient en pending en consommant le plafond.
      -- (25/10, Jocabroc 53efea05) CETTE RETENUE DIT SON MOTIF. Le 24/10, Chrome est resté muet
      -- de 16:58 à 21:12 (heure de Paris) : le créneau Leboncoin s'est clos « manque » avec
      -- sautes = {} et l'app a dit « Rien n'est parti. 51 annonces étaient éligibles. ». Un ÉTAT
      -- daté, comme _bloque_en_vol : posé à la transition, levé au retour (leve_le) — jamais une
      -- ligne réécrite à chaque passage.
      IF v_compte.extension_last_seen_at IS NULL
         OR v_compte.extension_last_seen_at <= now() - interval '10 minutes' THEN
        IF NOT (v_row.sautes ? '_extension_absente') OR (v_row.sautes -> '_extension_absente' ? 'leve_le') THEN
          UPDATE republish_creneaux
             SET sautes = sautes || jsonb_build_object('_extension_absente', jsonb_build_object(
                   'motif', 'extension_absente', 'platform', v_pf,
                   'depuis', now(),
                   'premiere', COALESCE(v_row.sautes -> '_extension_absente' -> 'premiere', to_jsonb(now())),
                   'episodes', COALESCE((v_row.sautes -> '_extension_absente' ->> 'episodes')::integer, 0) + 1,
                   'derniere_vue', v_compte.extension_last_seen_at,
                   'at', now())),
                 updated_at = now()
           WHERE id = v_row.id;
        END IF;
        CONTINUE;
      END IF;
      IF v_row.sautes ? '_extension_absente' AND NOT (v_row.sautes -> '_extension_absente' ? 'leve_le') THEN
        UPDATE republish_creneaux
           SET sautes = jsonb_set(sautes, '{_extension_absente,leve_le}', to_jsonb(now())), updated_at = now()
         WHERE id = v_row.id
        RETURNING * INTO v_row;
      END IF;
      -- ⛔ Plus de `boutique = COALESCE(boutique, v_boutique)` ici : c'était le
      -- gel. La ligne PORTE sa boutique depuis sa lecture ; une autre boutique
      -- ne réécrit plus celle-ci, elle obtient la sienne.
      IF NOT v_row.extension_vue THEN
        UPDATE republish_creneaux
           SET extension_vue = true, updated_at = now()
         WHERE id = v_row.id;
      END IF;

      -- 3bis. LE DISJONCTEUR : les échecs DU COMPTE consécutifs de ce créneau,
      -- sur cette plateforme, sans réussite intercalée.
      -- (12/10, A4) Il comptait un échec d'ARTICLE (un failed quel qu'en soit
      -- le motif) comme une panne du compte, et ne voyait pas une panne du
      -- compte parquée en needs_user (session, anti-robot) : deux articles
      -- refusés arrêtaient la plateforme pour la journée. Désormais
      -- (republish_echec_portee) : seul un échec qui vient du COMPTE (session,
      -- anti-robot, compte bloqué, restriction Vinted, accès, boutique ouverte
      -- étrangère…) compte ; un article en échec ne bloque que lui — il ne
      -- compte pas et ne coupe pas la chaîne ; un job en cours (pending,
      -- processing sans cause du compte) l'arrête comme avant.
      v_disj_n := 0;
      FOR v_j IN
        SELECT j.status, j.platform_fields AS pf, j.error
        FROM cross_post_jobs j
        WHERE j.user_id = v_compte.id AND j.action = 'republish' AND j.platform = v_pf
          AND j.platform_fields ->> 'republish_creneau_id' = v_row.id::text
        ORDER BY j.created_at DESC
      LOOP
        EXIT WHEN v_j.status = 'published';
        v_portee := republish_echec_portee(v_j.status, v_j.pf, v_j.error);
        IF v_portee = 'compte' THEN v_disj_n := v_disj_n + 1;
        ELSIF v_portee = 'article' THEN CONTINUE;  -- un article en échec ne bloque que lui
        ELSE EXIT;  -- pending / processing sans cause du compte : en cours, pas un échec
        END IF;
      END LOOP;
      IF v_disj_n >= v_disj_max THEN
        PERFORM republish_creneau_noter(v_row.id,
          jsonb_build_object('_disjoncteur', jsonb_build_object(
            'motif', 'echecs_compte_consecutifs', 'platform', v_pf,
            'echecs', v_disj_n, 'seuil', v_disj_max, 'at', now())));
        CONTINUE;
      END IF;

      -- 4. Garde anti-rafale, PAR PLATEFORME.
      -- (08/10, Louis) une suppression ENVOYÉE (pas encore prouvée) compte comme
      -- un retrait engagé : l'annonce est peut-être déjà hors ligne, le créneau attend.
      SELECT count(*) FILTER (WHERE j.platform_fields ->> 'republish_step' = 'deleted' OR j.platform_fields ? 'republish_suppression_envoyee'),
             count(*) FILTER (WHERE COALESCE(j.platform_fields ->> 'republish_step', 'a_capturer') <> 'deleted'
                                AND (v_boutique IS NULL OR NULLIF(trim(i.vinted_account_id), '') IS NULL
                                     OR trim(i.vinted_account_id) = v_boutique)
                                AND COALESCE(republish_ts_safe(j.platform_fields, 'next_action_after'), now()) <= now()),  -- MODIF 2026-09-24 : un job PARQUE (reprise future : anti-robot 45 min, session 60 min) et sans suppression (step <> deleted) n'occupe pas le creneau ; il n'est plus compte en vol, le creneau continue avec un autre article, l'annonce parquee reste en ligne
             count(*) FILTER (WHERE COALESCE(j.platform_fields ->> 'republish_step', 'a_capturer') <> 'deleted'
                                AND v_boutique IS NOT NULL AND NULLIF(trim(i.vinted_account_id), '') IS NOT NULL
                                AND trim(i.vinted_account_id) <> v_boutique)
      INTO v_hors_ligne, v_mobiles, v_parques
      FROM cross_post_jobs j LEFT JOIN inventaire i ON i.id = j.inventaire_id
      WHERE j.user_id = v_compte.id AND j.action = 'republish' AND j.platform = v_pf
        AND j.status IN ('pending', 'processing');
      IF v_hors_ligne + v_mobiles > 0 THEN
        v_bloque := COALESCE(v_row.sautes -> '_bloque_en_vol', '{}'::jsonb);
        v_bloque := (v_bloque - 'leve_le') || jsonb_build_object(
          'motif', CASE WHEN v_hors_ligne > 0 THEN 'annonce_hors_ligne' ELSE 'republication_en_vol' END,
          'platform', v_pf,
          'en_vol', v_hors_ligne + v_mobiles,
          'hors_ligne', v_hors_ligne,
          'parques_autre_boutique', v_parques,
          'boutique', v_boutique,
          'depuis', COALESCE(v_bloque ->> 'depuis', to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SSOF')),
          'at', now());
        UPDATE republish_creneaux
           SET sautes = sautes || jsonb_build_object('_bloque_en_vol', v_bloque), updated_at = now()
         WHERE id = v_row.id;
        CONTINUE;
      END IF;
      IF v_row.sautes ? '_bloque_en_vol' AND NOT (v_row.sautes -> '_bloque_en_vol' ? 'leve_le') THEN
        UPDATE republish_creneaux
           SET sautes = jsonb_set(sautes, '{_bloque_en_vol,leve_le}', to_jsonb(now())), updated_at = now()
         WHERE id = v_row.id;
      END IF;
      IF v_parques > 0 THEN
        PERFORM republish_creneau_noter(v_row.id,
          jsonb_build_object('_parques_autre_boutique',
            jsonb_build_object('motif', 'parques_autre_boutique', 'n', v_parques, 'boutique', v_boutique, 'at', now())));
      END IF;

      -- 5. Le nombre par jour CHOISI pour la plateforme, s'il y en a un.
      -- (24/10, décision de Nico) Plus d'enveloppe de compte ni de plafond du palier.
      IF v_plafond IS NOT NULL AND v_faits >= v_plafond THEN
        PERFORM republish_creneau_noter(v_row.id,
          jsonb_build_object('_plafond_jour', jsonb_build_object('motif', 'plafond_jour', 'plafond', v_plafond, 'at', now())));
        CONTINUE;
      END IF;

      -- 6. Espacement déterministe.
      -- (11/10) Ligne réalignée sur un nouveau réglage : le rythme repart du
      -- réalignement, sur les prévues qui restaient à faire (sinon la fenêtre
      -- entière, comme avant). Jamais plus serré que la création ne l'aurait fait.
      v_debut_ryt := COALESCE(NULLIF(v_row.sautes -> '_reglage_change' ->> 'depuis', '')::timestamptz, v_row.debut);
      v_prev_ryt := COALESCE(v_row.prevues, 1)
                    - CASE WHEN v_row.sautes ? '_reglage_change'
                           THEN COALESCE((v_row.sautes -> '_reglage_change' ->> 'faites_avant')::integer, 0) ELSE 0 END;
      v_intervalle := extract(epoch FROM (v_row.fin - v_debut_ryt)) / GREATEST(1, v_prev_ryt);
      -- (25/10, Jocabroc 53efea05) LA PLACE D'UN CANDIDAT SAUTÉ EST RENDUE. Un essai de portée
      -- ARTICLE arrêté sans rien avoir retiré ni redéposé (republish_essai_saute : annonce
      -- introuvable, question, garde) n'est pas une republication : il ne compte ni dans les
      -- prévues du créneau (6bis) ni dans le rythme (6) — le candidat suivant prend sa place au
      -- passage suivant. Le 23/10, trois annonces mortes ont pris trois des six places Vinted et
      -- 1 h 30 de rythme (fde3d484, d4281e1d, 961f0a27). L'intervalle (durée / prévues) et la
      -- règle « un seul Chrome : le rythme est celui du COMPTE, toutes plateformes » (18/09) ne
      -- changent pas : deux republications qui ont AGI restent espacées comme avant. Les sautés
      -- rendus sont bornés à `prevues` par créneau (au-delà : comptés comme avant, motif
      -- _remplacements_epuises). Le nombre par jour choisi et le quota du mois comptent toujours
      -- tous les jobs nés (spend_coins_and_republish, étape 5) : intouchés.
      SELECT count(*) FILTER (WHERE NOT republish_essai_saute(j.status, j.platform_fields, j.error)),
             count(*) FILTER (WHERE republish_essai_saute(j.status, j.platform_fields, j.error))
        INTO v_reels_cr, v_sautes_cr
      FROM cross_post_jobs j
      WHERE j.user_id = v_compte.id AND j.action = 'republish' AND j.platform = v_pf
        AND j.platform_fields ->> 'republish_creneau_id' = v_row.id::text;
      v_remplace := v_sautes_cr <= COALESCE(v_row.prevues, 0);
      v_dernier := NULL; v_dernier_pf := NULL;
      SELECT j.created_at, j.platform INTO v_dernier, v_dernier_pf FROM cross_post_jobs j
      WHERE j.user_id = v_compte.id AND j.action = 'republish'
        AND j.platform_fields ->> 'republish_source' = 'auto'
        AND j.created_at >= v_row.debut
        AND (NOT v_remplace OR NOT republish_essai_saute(j.status, j.platform_fields, j.error))
        -- (25/10 soir) Interrupteur allumé : la republication de référence est celle de CETTE plateforme.
        AND (NOT v_rythme_pf OR j.platform = v_pf)
      ORDER BY j.created_at DESC
      LIMIT 1;
      IF v_dernier IS NOT NULL AND v_dernier > now() - make_interval(secs => v_intervalle) THEN
        -- (25/10) LE RYTHME QUI RETIENT LE DIT : la republication de référence (sa plateforme
        -- comprise) et l'heure qu'elle fixe ; apres_fin = plus rien ne pourra partir dans ce
        -- créneau. Une écriture par republication de référence, jamais à chaque passage. Le
        -- 24/10, Leboncoin (36 min) attendait derrière chaque republication Vinted (30 min) et
        -- n'est jamais passé, sans un mot.
        v_prochaine := v_dernier + make_interval(secs => v_intervalle);
        IF (v_row.sautes -> '_espacement' ->> 'dernier') IS DISTINCT FROM (to_jsonb(v_dernier) #>> '{}') THEN
          UPDATE republish_creneaux
             SET sautes = sautes || jsonb_build_object('_espacement', jsonb_build_object(
                   'motif', 'espacement', 'platform', v_pf,
                   'dernier', v_dernier, 'dernier_platform', v_dernier_pf,
                   'intervalle_s', round(v_intervalle)::integer,
                   'prochaine', v_prochaine,
                   'apres_fin', v_prochaine >= v_row.fin,
                   'at', now())),
                 updated_at = now()
           WHERE id = v_row.id;
        END IF;
        CONTINUE;
      END IF;
      -- 6bis. Le créneau s'arrête à ce qu'il a ANNONCÉ — compté (25/10) en jobs non sautés ;
      -- au-delà de `prevues` sautés, ils comptent comme avant et le créneau le dit.
      v_faits_cr := v_reels_cr + CASE WHEN v_remplace THEN 0 ELSE v_sautes_cr END;
      IF NOT v_remplace AND NOT (v_row.sautes ? '_remplacements_epuises') THEN
        PERFORM republish_creneau_noter(v_row.id,
          jsonb_build_object('_remplacements_epuises', jsonb_build_object(
            'motif', 'remplacements_epuises', 'platform', v_pf,
            'sautes', v_sautes_cr, 'prevues', v_row.prevues, 'at', now())));
      END IF;
      IF v_row.prevues IS NOT NULL AND v_faits_cr >= v_row.prevues THEN
        PERFORM republish_creneau_noter(v_row.id,
          jsonb_build_object('_prevues_atteintes', jsonb_build_object('motif', 'prevues_atteintes', 'prevues', v_row.prevues, 'at', now())));
        CONTINUE;
      END IF;

      -- 6ter. (08/10, Louis) JAMAIS UNE REPUBLICATION LANCÉE QUI NE PEUT PAS FINIR
      -- DANS LE CRÉNEAU. Le 06/10, la 9e republication Beebs de Louis est partie
      -- à 21:54 (créneau 19:00–22:00, ~20 min par republication Beebs) : sa
      -- suppression a eu lieu à 21:58, la remise en ligne tombait hors créneau.
      -- Il reste moins que la durée d'une republication sur cette plateforme pour
      -- ce compte (republish_duree_estimee) : on n'en lance plus, l'article
      -- reste en ligne, intact, et part au créneau suivant.
      v_duree := republish_duree_estimee(v_compte.id, v_pf);
      IF v_row.fin IS NOT NULL AND v_row.fin - now() < make_interval(secs => v_duree) THEN
        PERFORM republish_creneau_noter(v_row.id,
          jsonb_build_object('_fin_de_creneau', jsonb_build_object('motif', 'fin_de_creneau', 'platform', v_pf,
            'reste_s', GREATEST(0, extract(epoch FROM v_row.fin - now())::integer), 'duree_s', v_duree, 'at', now())));
        CONTINUE;
      END IF;

      -- 7. Plafond de la boutique connectée (Vinted, calculé plus haut).
      IF v_plafond_b IS NOT NULL AND v_faits_b >= v_plafond_b THEN
        PERFORM republish_creneau_noter(v_row.id,
          jsonb_build_object('_plafond_boutique:' || v_boutique,
            jsonb_build_object('motif', 'plafond_boutique', 'boutique', v_boutique, 'plafond', v_plafond_b, 'at', now())));
        CONTINUE;
      END IF;

      -- 8. Candidats : boutique connectée d'abord, sans boutique ensuite,
      -- autres boutiques jamais pendant ce créneau (Vinted seul).
      -- (25/10, Jocabroc 53efea05) Les candidats lus : les 50 premiers ÉLIGIBLES et les 50
      -- premiers mis de côté, dans l'ordre du rang (100 au plus ; au plus 50 appels au RPC, comme
      -- avant). Avant, LIMIT 50 tombait sur les rangs bruts : cinquante annonces mises de côté en
      -- tête (Leboncoin « anciennes » : 83 introuvables sur 134 chez Jocabroc) cachaient tout
      -- éligible, et le passage finissait sans job et sans mot.
      v_notes := '{}'::jsonb; v_examines := 0;
      v_job_cree_pf := false; v_sortie_cpt := false; v_tentes := 0;
      FOR v_cand IN
        SELECT x.inv_id, x.item_id, x.boutique, x.titre, x.motif, x.rang
        FROM (
          SELECT c.inv_id, c.item_id, c.boutique, c.titre, c.motif, c.rang,
                 CASE WHEN v_boutique IS NOT NULL AND c.boutique = v_boutique THEN 0
                      WHEN c.boutique IS NULL THEN 1
                      ELSE 2 END AS ordre_b,
                 row_number() OVER (PARTITION BY (c.motif IS NULL)
                   ORDER BY CASE WHEN v_boutique IS NOT NULL AND c.boutique = v_boutique THEN 0
                                 WHEN c.boutique IS NULL THEN 1
                                 ELSE 2 END, c.rang) AS n_groupe
          FROM republish_planifiee_candidats(v_compte.id, v_regl, v_pf) c
        ) x
        WHERE x.n_groupe <= 50
        ORDER BY x.ordre_b, x.rang
        LIMIT 100
      LOOP
        v_examines := v_examines + 1;
        v_cle := CASE WHEN v_pf = 'vinted' AND v_cand.item_id IS NOT NULL
                      THEN v_cand.item_id ELSE 'inv:' || v_cand.inv_id::text END;
        IF v_cand.motif IS NOT NULL THEN
          -- (25/10) Une annonce introuvable (ou vendue) le dit UNE fois : notée au premier créneau
          -- qui l'écarte, plus dans les suivants (30 jours) — et elle n'est plus jamais tentée.
          IF NOT (v_row.sautes ? v_cle) AND NOT (v_notes ? v_cle)
             AND NOT EXISTS (
               SELECT 1 FROM cross_post_jobs j
               WHERE j.user_id = v_compte.id AND j.action = 'republish' AND j.platform = v_pf
                 AND j.platform_fields ->> 'republish_creneau_id' = v_row.id::text
                 AND j.inventaire_id = v_cand.inv_id)
             AND NOT (v_cand.motif IN ('annonce_introuvable', 'annonce_vendue') AND EXISTS (
               SELECT 1 FROM republish_creneaux r2
               WHERE r2.user_id = v_compte.id AND r2.platform = v_pf AND r2.id <> v_row.id
                 AND r2.debut > now() - interval '30 days'
                 AND r2.sautes -> v_cle ->> 'motif' = v_cand.motif)) THEN
            v_notes := v_notes || jsonb_build_object(v_cle,
              jsonb_build_object('motif', v_cand.motif, 'titre', left(COALESCE(v_cand.titre, ''), 80),
                                 'platform', v_pf, 'at', now()));
          END IF;
          CONTINUE;
        END IF;
        IF v_boutique IS NOT NULL AND v_multi AND v_cand.boutique IS NOT NULL AND v_cand.boutique <> v_boutique THEN
          IF NOT (v_row.sautes ? v_cle) AND NOT (v_notes ? v_cle) THEN
            v_notes := v_notes || jsonb_build_object(v_cle,
              jsonb_build_object('motif', 'autre_boutique', 'boutique', v_cand.boutique,
                                 'titre', left(COALESCE(v_cand.titre, ''), 80), 'platform', v_pf, 'at', now()));
          END IF;
          CONTINUE;
        END IF;
        -- (25/10) Un article n'est tenté qu'UNE fois par créneau : un essai sauté rend sa place
        -- au candidat SUIVANT, jamais à lui-même (une annulation ne le remet pas en tête).
        IF EXISTS (
          SELECT 1 FROM cross_post_jobs j
          WHERE j.user_id = v_compte.id AND j.action = 'republish' AND j.platform = v_pf
            AND j.platform_fields ->> 'republish_creneau_id' = v_row.id::text
            AND j.inventaire_id = v_cand.inv_id) THEN
          CONTINUE;
        END IF;
        v_tentes := v_tentes + 1;

        -- 9. L'APPEL, avec l'identité de l'utilisateur et rien d'autre.
        BEGIN
          PERFORM set_config('request.jwt.claims',
            json_build_object('sub', v_compte.id, 'role', 'authenticated')::text, true);
          v_rpc := public.spend_coins_and_republish(v_cand.inv_id, v_cand.item_id, 'auto', NULL, v_pf);
          PERFORM set_config('request.jwt.claims', '', true);
        EXCEPTION WHEN OTHERS THEN
          PERFORM set_config('request.jwt.claims', '', true);
          v_rpc := jsonb_build_object('allowed', false, 'reason', 'exception',
                                      'message', left(SQLERRM, 200));
        END;
        v_reason := v_rpc ->> 'reason';

        v_ligne := jsonb_build_object(
          'compte', v_compte.email, 'platform', v_pf, 'inventaire_id', v_cand.inv_id,
          'vinted_item_id', v_cand.item_id, 'examines', v_examines,
          'creneau_id', v_row.id, 'boutique', v_boutique,
          'allowed', COALESCE((v_rpc ->> 'allowed')::boolean, false),
          'reason', v_reason);

        IF COALESCE((v_rpc ->> 'allowed')::boolean, false) THEN
          v_job := NULLIF(v_rpc ->> 'job_id', '')::uuid;
          UPDATE cross_post_jobs
             SET platform_fields = platform_fields || jsonb_build_object(
                   'republish_moteur', 'serveur',
                   'republish_planifie', true,
                   'republish_creneau_id', v_row.id::text,
                   'republish_sweep_at', to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SSOF'))
           WHERE id = v_job;
          v_ligne := v_ligne || jsonb_build_object('job_id', v_job);
          v_rapport := v_rapport || v_ligne;
          v_cree := true;
          v_job_cree_pf := true;
          EXIT;
        END IF;

        IF NOT (v_row.sautes ? v_cle) AND NOT (v_notes ? v_cle) THEN
          v_notes := v_notes || jsonb_build_object(v_cle,
            jsonb_build_object('motif', COALESCE(v_reason, 'refus_sans_motif'),
                               'titre', left(COALESCE(v_cand.titre, ''), 80),
                               'platform', v_pf, 'at', now()));
        END IF;
        v_rapport := v_rapport || v_ligne;
        -- Portée ARTICLE → candidat suivant ; portée COMPTE → on sort.
        -- (17/10) lien_annonce_incertain : le lien exact de CETTE annonce n'est pas sûr,
        -- seul cet article attend (spend_coins_and_republish, Amiral 317adae1).
        IF v_reason IN ('invalid_item', 'republish_en_cours', 'cadence_24h',
                        'article_sans_photo', 'article_vendu', 'annonce_introuvable', 'lien_annonce_incertain') THEN
          CONTINUE;
        END IF;
        v_notes := v_notes || jsonb_build_object('_refus_compte',
          jsonb_build_object('motif', COALESCE(v_reason, 'refus_sans_motif'), 'message', v_rpc ->> 'message',
                             'platform', v_pf, 'at', now()));
        v_sortie_cpt := true;
        EXIT;
      END LOOP;

      -- (25/10) Rien n'est né et rien ne l'a dit (tout candidat mis de côté, déjà tenté ou refusé
      -- pour lui-même) : le créneau le note, une fois.
      IF NOT v_job_cree_pf AND NOT v_sortie_cpt AND NOT (v_row.sautes ? '_aucun_candidat') THEN
        v_notes := v_notes || jsonb_build_object('_aucun_candidat', jsonb_build_object(
          'motif', 'aucun_candidat_eligible', 'platform', v_pf,
          'examines', v_examines, 'tentes', v_tentes, 'at', now()));
      END IF;

      IF v_notes <> '{}'::jsonb THEN
        PERFORM republish_creneau_noter(v_row.id, v_notes);
      END IF;
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object(
    'actif', true,
    'comptes', v_comptes,
    'traites', jsonb_array_length(v_rapport),
    'crees', (SELECT count(*) FROM jsonb_array_elements(v_rapport) e
              WHERE COALESCE((e ->> 'allowed')::boolean, false)),
    'detail', v_rapport);
END;
$function$
;
DELETE FROM coin_config WHERE key = 'republish_rythme_par_plateforme';

DO $b$
DECLARE v jsonb; v_jobs jsonb; v_notes jsonb; t0 timestamptz := clock_timestamp(); v_ms integer;
BEGIN
  BEGIN
    v := public.republish_planifiee_sweep();
    v_ms := round(extract(epoch FROM clock_timestamp() - t0) * 1000)::integer;
    SELECT COALESCE(jsonb_agg(jsonb_build_object('compte', split_part(p.email, '@', 1), 'pf', j.platform, 'inv', j.inventaire_id) ORDER BY p.email, j.platform, j.inventaire_id), '[]'::jsonb)
      INTO v_jobs
      FROM cross_post_jobs j JOIN profiles p ON p.id = j.user_id
     WHERE j.action = 'republish' AND j.platform_fields ->> 'republish_source' = 'auto' AND j.created_at >= essai_debut();
    SELECT COALESCE(jsonb_agg(jsonb_build_object('creneau', r.id, 'compte', split_part(p.email, '@', 1), 'pf', r.platform,
             'cles', (SELECT jsonb_agg(k ORDER BY k) FROM jsonb_object_keys(r.sautes) k WHERE k LIKE '_%'),
             'espacement', r.sautes -> '_espacement') ORDER BY r.id), '[]'::jsonb)
      INTO v_notes
      FROM republish_creneaux r JOIN profiles p ON p.id = r.user_id WHERE r.statut = 'en_cours';
    RAISE EXCEPTION 'annule' USING ERRCODE = 'ZZ003';
  EXCEPTION WHEN SQLSTATE 'ZZ003' THEN NULL;
  END;
  -- Après l'annulation : seules les variables PL/pgSQL ont survécu.
  INSERT INTO essai_out (phase, sortie, jobs, notes, ms) VALUES ('2_eteint', v, v_jobs, v_notes, v_ms);
END $b$;

-- 3. Interrupteur allumé (dans la transaction seulement).
INSERT INTO coin_config (key, value) VALUES ('republish_rythme_par_plateforme', 1);

DO $b$
DECLARE v jsonb; v_jobs jsonb; v_notes jsonb; t0 timestamptz := clock_timestamp(); v_ms integer;
BEGIN
  BEGIN
    v := public.republish_planifiee_sweep();
    v_ms := round(extract(epoch FROM clock_timestamp() - t0) * 1000)::integer;
    SELECT COALESCE(jsonb_agg(jsonb_build_object('compte', split_part(p.email, '@', 1), 'pf', j.platform, 'inv', j.inventaire_id) ORDER BY p.email, j.platform, j.inventaire_id), '[]'::jsonb)
      INTO v_jobs
      FROM cross_post_jobs j JOIN profiles p ON p.id = j.user_id
     WHERE j.action = 'republish' AND j.platform_fields ->> 'republish_source' = 'auto' AND j.created_at >= essai_debut();
    SELECT COALESCE(jsonb_agg(jsonb_build_object('creneau', r.id, 'compte', split_part(p.email, '@', 1), 'pf', r.platform,
             'cles', (SELECT jsonb_agg(k ORDER BY k) FROM jsonb_object_keys(r.sautes) k WHERE k LIKE '_%'),
             'espacement', r.sautes -> '_espacement') ORDER BY r.id), '[]'::jsonb)
      INTO v_notes
      FROM republish_creneaux r JOIN profiles p ON p.id = r.user_id WHERE r.statut = 'en_cours';
    RAISE EXCEPTION 'annule' USING ERRCODE = 'ZZ003';
  EXCEPTION WHEN SQLSTATE 'ZZ003' THEN NULL;
  END;
  -- Après l'annulation : seules les variables PL/pgSQL ont survécu.
  INSERT INTO essai_out (phase, sortie, jobs, notes, ms) VALUES ('3_allume', v, v_jobs, v_notes, v_ms);
END $b$;

DROP FUNCTION essai_debut();
SELECT phase, ms, sortie - 'detail' AS sortie, jobs, notes FROM essai_out ORDER BY phase;
ROLLBACK;
