-- ═════════════════════════════════════════════════════════════════════════════
-- REPUBLICATION PLANIFIÉE — UNE LIGNE DE CRÉNEAU PAR BOUTIQUE
-- 2026-09-19.
-- ═════════════════════════════════════════════════════════════════════════════
-- LE DÉFAUT (Ornella, multi-boutiques Vinted). La clé d'unicité des créneaux
-- était (user_id, platform, debut). Une seule ligne par créneau, donc, quelle
-- que soit la boutique au bout du fil. Conséquence, en trois temps :
--
--   1. 16 h 00, boutique A connectée → la ligne naît avec boutique = A, et
--      `prevues` / `eligibles_debut` calculés sur le PARC DE A ;
--   2. 16 h 20, Ornella bascule sur la boutique B → le sweep relit la MÊME
--      ligne (la clé ne distingue pas B de A) ;
--   3. `boutique = COALESCE(boutique, v_boutique)` ne pouvait plus rien écrire :
--      la colonne n'était pas NULL, elle valait A. La ligne mentait sur son
--      propriétaire, et la borne `prevues` — celle de A — s'appliquait à B.
--
--   Les 14 lignes vécues à ce jour le montrent : afeef3c7 porte 14521594 sur
--   ses 5 créneaux, sans exception, alors que le compte a plusieurs dressings.
--
-- LE CORRECTIF — trois gestes, dans la même migration, parce qu'ils ne valent
-- rien séparés :
--
--   (A) LA CLÉ. `UNIQUE (user_id, platform, debut, COALESCE(boutique,''))`.
--       Une contrainte UNIQUE ne porte pas d'expression : c'est donc un INDEX
--       UNIQUE, et la contrainte nommée est déposée. Le COALESCE est ce qui
--       rend NULL comparable — sans lui, deux lignes sans boutique seraient
--       toutes deux acceptées, et l'unicité ne voudrait plus rien dire.
--       La clé nouvelle est STRICTEMENT PLUS LARGE que l'ancienne : ce qui
--       était unique le reste. Aucune ligne existante n'est touchée.
--
--   (B) LE SWEEP, dans le MÊME lot. Sinon il insérerait `ON CONFLICT
--       (user_id, platform, debut)` contre une contrainte qui n'existe plus —
--       erreur à chaque passage, toutes les 3 minutes. Il lit désormais la
--       ligne DE SA BOUTIQUE, et le `COALESCE(boutique, v_boutique)` — le gel —
--       disparaît : une boutique ne réécrit plus la ligne d'une autre, elle
--       obtient la sienne. Deux replis pour ne pas fabriquer de doublon :
--       une ligne sans nom du même créneau est BAPTISÉE quand la sonde parle ;
--       une boutique inconnue REPREND la ligne existante au lieu d'en créer
--       une seconde (un doublon sans nom réserverait de la capacité partagée
--       pour les trois autres plateformes sans jamais rien produire).
--
--   (C) L'ÉCRAN. `republish_planifiee_etat` montrait « le dernier créneau »
--       sans regarder la boutique : avec une ligne par boutique, il montrerait
--       n'importe laquelle. Il prend celle de la boutique connectée. Et chaque
--       boutique porte maintenant `vu_le` (max(debut) de SES créneaux) et
--       `eligibles` — de quoi dire « ce dressing n'a pas été servi depuis
--       X jours », un chiffre qui n'existait pas avant cette clé.
--
-- Le plafond par boutique (`plafond_boutique[<id>]`, LEAST avec le plafond du
-- jour) existait déjà et n'est PAS retouché : il se calcule sur `v_boutique`,
-- donc sur la boutique réellement connectée, à chaque passage.
--
-- Idempotente. Retour arrière : rejouer 20260918200100 + 20260918200200, puis
-- DROP INDEX republish_creneaux_unique_idx et
-- ALTER TABLE ... ADD CONSTRAINT republish_creneaux_unique UNIQUE (user_id, platform, debut).
-- ═════════════════════════════════════════════════════════════════════════════

-- ── (A) LA CLÉ ───────────────────────────────────────────────────────────────
DO $mig$
DECLARE v_dup integer; v_def text;
BEGIN
  -- On ne dépose rien avant d'avoir la preuve que la clé neuve tient.
  SELECT count(*) INTO v_dup FROM (
    SELECT user_id, platform, debut, COALESCE(boutique, '') AS b
    FROM public.republish_creneaux
    GROUP BY 1,2,3,4 HAVING count(*) > 1
  ) d;
  IF v_dup > 0 THEN
    RAISE EXCEPTION 'republish_creneaux : % groupe(s) en double sous (user_id, platform, debut, COALESCE(boutique,'''')) — rien n''est touché', v_dup;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_class WHERE relname = 'republish_creneaux_unique_idx' AND relkind = 'i'
  ) THEN
    CREATE UNIQUE INDEX republish_creneaux_unique_idx
      ON public.republish_creneaux (user_id, platform, debut, (COALESCE(boutique, ''::text)));
    RAISE NOTICE 'republish_creneaux_unique_idx : posé (user_id, platform, debut, COALESCE(boutique,''''))';
  ELSE
    RAISE NOTICE 'republish_creneaux_unique_idx : déjà là — inchangé';
  END IF;

  SELECT pg_get_constraintdef(oid) INTO v_def FROM pg_constraint
  WHERE conrelid = 'public.republish_creneaux'::regclass AND conname = 'republish_creneaux_unique';
  IF v_def IS NOT NULL THEN
    ALTER TABLE public.republish_creneaux DROP CONSTRAINT republish_creneaux_unique;
    RAISE NOTICE 'republish_creneaux_unique : déposée (était « % »)', v_def;
  ELSE
    RAISE NOTICE 'republish_creneaux_unique : déjà absente';
  END IF;
END
$mig$;

-- ── (B) LE SWEEP ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.republish_planifiee_sweep()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
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
  v_faits_cpt  integer;
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
  v_plafond_cpt integer;
  v_cree       boolean;
  v_grace      integer;
  v_perdu      timestamptz;
  v_ps         jsonb;
  v_cur        jsonb;
  v_disj_n     integer;
  v_disj_max   integer;
  v_j          record;
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

    v_plafond_cpt := republish_plafond_palier(v_palier);

    -- 1. Historique : clôturer ce qui est passé (toutes plateformes).
    PERFORM republish_creneau_cloturer(v_compte.id);

    FOREACH v_pf IN ARRAY republish_planifiee_plateformes() LOOP
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

      v_plafond  := (v_regl ->> 'plafond_jour')::integer;
      -- Deux compteurs : CETTE plateforme, et le COMPTE (l'enveloppe).
      SELECT count(*) FILTER (WHERE j.platform = v_pf), count(*)
      INTO v_faits, v_faits_cpt
      FROM cross_post_jobs j
      WHERE j.user_id = v_compte.id AND j.action = 'republish'
        AND j.platform_fields ->> 'republish_source' = 'auto'
        AND j.created_at >= v_minuit;

      v_plafond_b := NULL; v_faits_b := 0;
      IF v_pf = 'vinted' AND v_boutique IS NOT NULL THEN
        v_plafond_b := LEAST(v_plafond, GREATEST(1, COALESCE(
          NULLIF(v_regl -> 'plafond_boutique' ->> v_boutique, '')::integer, v_plafond)));
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
        v_capacite := republish_planifiee_capacite_partagee(v_compte.id, v_pf,
          extract(epoch FROM ((v_fen ->> 'courant_fin')::timestamptz - now()))::integer,
          (v_esp ->> 'sec')::integer);
        SELECT count(*) INTO v_elig
        FROM republish_planifiee_candidats(v_compte.id, v_regl, v_pf) c
        WHERE c.motif IS NULL
          AND (v_boutique IS NULL OR NOT v_multi OR c.boutique IS NULL OR c.boutique = v_boutique);
        v_prevues := LEAST(GREATEST(0, v_plafond - v_faits),
                           GREATEST(0, v_plafond_cpt - v_faits_cpt),
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

      -- 3. Extension vivante ? 10 MINUTES : au-delà on créerait des jobs pour
      -- des Chrome éteints, qui dormiraient en pending en consommant le plafond.
      CONTINUE WHEN v_compte.extension_last_seen_at IS NULL
                 OR v_compte.extension_last_seen_at <= now() - interval '10 minutes';
      -- ⛔ Plus de `boutique = COALESCE(boutique, v_boutique)` ici : c'était le
      -- gel. La ligne PORTE sa boutique depuis sa lecture ; une autre boutique
      -- ne réécrit plus celle-ci, elle obtient la sienne.
      IF NOT v_row.extension_vue THEN
        UPDATE republish_creneaux
           SET extension_vue = true, updated_at = now()
         WHERE id = v_row.id;
      END IF;

      -- 3bis. LE DISJONCTEUR : les échecs CONSÉCUTIFS de ce créneau, sur cette
      -- plateforme, sans réussite intercalée. Un 'failed'/'needs_user' à
      -- l'étape a_capturer/captured = un RETRAIT qui n'a pas abouti (l'annonce
      -- est restée en ligne) ; à l'étape 'deleted' = un redépôt manqué, plus
      -- grave encore. Les deux comptent.
      v_disj_n := 0;
      FOR v_j IN
        SELECT j.status, COALESCE(j.platform_fields ->> 'republish_step', 'a_capturer') AS step
        FROM cross_post_jobs j
        WHERE j.user_id = v_compte.id AND j.action = 'republish' AND j.platform = v_pf
          AND j.platform_fields ->> 'republish_creneau_id' = v_row.id::text
        ORDER BY j.created_at DESC
      LOOP
        EXIT WHEN v_j.status = 'published';
        IF v_j.status IN ('failed', 'needs_user') THEN v_disj_n := v_disj_n + 1;
        ELSE EXIT;  -- pending / processing : en cours, pas un échec
        END IF;
      END LOOP;
      IF v_disj_n >= v_disj_max THEN
        PERFORM republish_creneau_noter(v_row.id,
          jsonb_build_object('_disjoncteur', jsonb_build_object(
            'motif', 'echecs_consecutifs', 'platform', v_pf,
            'echecs', v_disj_n, 'seuil', v_disj_max, 'at', now())));
        CONTINUE;
      END IF;

      -- 4. Garde anti-rafale, PAR PLATEFORME : une republication en vol → rien
      -- de neuf. Seules comptent celles qui PEUVENT bouger sous la boutique
      -- connectée (Vinted) ; un job parqué pour une autre boutique n'est pas
      -- « en vol ». L'étape 'deleted' bloque TOUJOURS.
      SELECT count(*) FILTER (WHERE j.platform_fields ->> 'republish_step' = 'deleted'),
             count(*) FILTER (WHERE COALESCE(j.platform_fields ->> 'republish_step', 'a_capturer') <> 'deleted'
                                AND (v_boutique IS NULL OR NULLIF(trim(i.vinted_account_id), '') IS NULL
                                     OR trim(i.vinted_account_id) = v_boutique)),
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

      -- 5. Plafonds du jour : celui de la plateforme, puis l'ENVELOPPE de
      -- compte (la somme des quatre ne dépasse pas le palier).
      IF v_faits >= v_plafond THEN
        PERFORM republish_creneau_noter(v_row.id,
          jsonb_build_object('_plafond_jour', jsonb_build_object('motif', 'plafond_jour', 'plafond', v_plafond, 'at', now())));
        CONTINUE;
      END IF;
      IF v_faits_cpt >= v_plafond_cpt THEN
        PERFORM republish_creneau_noter(v_row.id,
          jsonb_build_object('_plafond_compte', jsonb_build_object('motif', 'plafond_compte',
            'plafond', v_plafond_cpt, 'faits', v_faits_cpt, 'at', now())));
        CONTINUE;
      END IF;

      -- 6. Espacement déterministe : durée / prevues, mesuré depuis le dernier
      -- job auto créé dans CE créneau — et depuis le dernier geste TOUTES
      -- PLATEFORMES (un seul Chrome : deux files qui se croisent se gênent).
      v_intervalle := extract(epoch FROM (v_row.fin - v_row.debut)) / GREATEST(1, COALESCE(v_row.prevues, 1));
      SELECT max(j.created_at) INTO v_dernier FROM cross_post_jobs j
      WHERE j.user_id = v_compte.id AND j.action = 'republish'
        AND j.platform_fields ->> 'republish_source' = 'auto'
        AND j.created_at >= v_row.debut;
      CONTINUE WHEN v_dernier IS NOT NULL AND v_dernier > now() - make_interval(secs => v_intervalle);
      -- 6bis. Le créneau s'arrête à ce qu'il a ANNONCÉ.
      SELECT count(*) INTO v_faits_cr FROM cross_post_jobs j
      WHERE j.user_id = v_compte.id AND j.action = 'republish' AND j.platform = v_pf
        AND j.platform_fields ->> 'republish_creneau_id' = v_row.id::text;
      IF v_row.prevues IS NOT NULL AND v_faits_cr >= v_row.prevues THEN
        PERFORM republish_creneau_noter(v_row.id,
          jsonb_build_object('_prevues_atteintes', jsonb_build_object('motif', 'prevues_atteintes', 'prevues', v_row.prevues, 'at', now())));
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
      v_notes := '{}'::jsonb; v_examines := 0;
      FOR v_cand IN
        SELECT c.inv_id, c.item_id, c.boutique, c.titre, c.motif, c.rang
        FROM republish_planifiee_candidats(v_compte.id, v_regl, v_pf) c
        ORDER BY CASE WHEN v_boutique IS NOT NULL AND c.boutique = v_boutique THEN 0
                      WHEN c.boutique IS NULL THEN 1
                      ELSE 2 END,
                 c.rang
        LIMIT 50
      LOOP
        v_examines := v_examines + 1;
        v_cle := CASE WHEN v_pf = 'vinted' AND v_cand.item_id IS NOT NULL
                      THEN v_cand.item_id ELSE 'inv:' || v_cand.inv_id::text END;
        IF v_cand.motif IS NOT NULL THEN
          IF NOT (v_row.sautes ? v_cle) AND NOT (v_notes ? v_cle)
             AND NOT EXISTS (
               SELECT 1 FROM cross_post_jobs j
               WHERE j.user_id = v_compte.id AND j.action = 'republish' AND j.platform = v_pf
                 AND j.platform_fields ->> 'republish_creneau_id' = v_row.id::text
                 AND j.inventaire_id = v_cand.inv_id) THEN
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
        IF v_reason IN ('invalid_item', 'republish_en_cours', 'cadence_24h',
                        'article_sans_photo', 'article_vendu', 'annonce_introuvable') THEN
          CONTINUE;
        END IF;
        v_notes := v_notes || jsonb_build_object('_refus_compte',
          jsonb_build_object('motif', COALESCE(v_reason, 'refus_sans_motif'), 'message', v_rpc ->> 'message',
                             'platform', v_pf, 'at', now()));
        EXIT;
      END LOOP;

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
$$;

-- ── (C) L'ÉCRAN ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.republish_planifiee_etat(p_platform text DEFAULT 'vinted')
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_pf text := lower(COALESCE(NULLIF(trim(p_platform), ''), 'vinted'));
  v_regl jsonb; v_fen jsonb; v_esp jsonb; v_legacy jsonb;
  v_palier text; v_plafond_palier integer;
  v_quota integer; v_cycle timestamptz; v_faits_mois integer;
  v_fuseau text; v_minuit timestamptz;
  v_crees_pf integer; v_abouties_pf integer; v_crees_compte integer; v_crees_total integer;
  v_ident jsonb; v_boutique text; v_boutiques jsonb; v_multi boolean;
  v_elig_total integer; v_elig_boutique integer; v_exclus jsonb; v_par_boutique jsonb;
  v_duree integer; v_capacite integer; v_restants integer; v_attendu integer; v_borne text;
  v_restants_compte integer;
  v_plafond_b integer; v_faits_b integer; v_restants_b integer;
  v_jour_prochain boolean;
  v_courant jsonb; v_dernier jsonb;
  v_faites_live integer; v_blocage jsonb; v_disjoncteur jsonb;
  v_ouverte boolean; v_en_ligne integer;
BEGIN
  IF v_user IS NULL THEN RETURN jsonb_build_object('error', 'unauthorized'); END IF;
  IF NOT (v_pf = ANY (republish_planifiee_plateformes())) THEN
    RETURN jsonb_build_object('error', 'invalid_platform', 'platform', v_pf);
  END IF;

  v_palier := republish_palier(v_user);
  v_plafond_palier := republish_plafond_palier(v_palier);
  v_regl := republish_planifiee_reglage(v_user, v_pf);
  v_ouverte := republish_planifiee_pf_ouverte(v_pf);
  v_en_ligne := republish_planifiee_annonces_en_ligne(v_user, v_pf);
  SELECT p.platform_settings #> '{vinted,republish_auto}' INTO v_legacy FROM profiles p WHERE p.id = v_user;

  -- Quota mensuel : même définition que le RPC (cycle = dernier grant), COMMUN
  -- à toutes les plateformes — une republication est une republication.
  IF v_palier IN ('premium', 'pro') THEN
    SELECT value INTO v_quota FROM coin_config WHERE key = 'quota_republication_' || v_palier;
    IF v_quota IS NOT NULL AND v_quota > 0 THEN
      SELECT COALESCE(max(l.created_at), date_trunc('month', now())) INTO v_cycle
      FROM coin_ledger l WHERE l.user_id = v_user AND l.kind IN ('grant_monthly', 'grant_upgrade');
      SELECT count(*) INTO v_faits_mois FROM cross_post_jobs j
      WHERE j.user_id = v_user AND j.action = 'republish' AND j.created_at >= v_cycle;
    ELSE
      v_quota := NULL;
    END IF;
  END IF;

  v_fuseau := COALESCE(v_regl ->> 'fuseau', 'Europe/Paris');
  v_minuit := republish_minuit_local(v_fuseau);
  -- Trois compteurs du jour : CETTE plateforme, le COMPTE (l'enveloppe), et le
  -- total manuel + auto (affichage).
  SELECT count(*) FILTER (WHERE j.platform = v_pf AND j.platform_fields ->> 'republish_source' = 'auto'),
         count(*) FILTER (WHERE j.platform = v_pf AND j.platform_fields ->> 'republish_source' = 'auto' AND j.status = 'published'),
         count(*) FILTER (WHERE j.platform_fields ->> 'republish_source' = 'auto'),
         count(*)
  INTO v_crees_pf, v_abouties_pf, v_crees_compte, v_crees_total
  FROM cross_post_jobs j
  WHERE j.user_id = v_user AND j.action = 'republish' AND j.created_at >= v_minuit;

  IF v_pf = 'vinted' THEN
    v_ident := republish_boutique_connectee(v_user);
    v_boutique := v_ident ->> 'user_id';
    v_boutiques := republish_boutiques(v_user);
    v_multi := jsonb_array_length(v_boutiques) >= 2;
  ELSE
    v_ident := NULL; v_boutique := NULL; v_boutiques := '[]'::jsonb; v_multi := false;
  END IF;

  -- Pas de réglage (ou réglage sans droit) : l'app propose l'activation.
  IF v_regl IS NULL OR NOT COALESCE((v_regl ->> 'actif')::boolean, false) THEN
    RETURN jsonb_build_object(
      'platform', v_pf,
      'actif', false,
      'configure', v_regl IS NOT NULL,
      'ouverte', v_ouverte,
      'annonces_en_ligne', v_en_ligne,
      'reglage', v_regl,
      'palier', v_palier, 'plafond_palier', v_plafond_palier,
      'autorise', v_palier IN ('pro', 'business'),
      'quota_mensuel', v_quota, 'faits_mois', v_faits_mois,
      'aujourdhui', jsonb_build_object(
        'minuit', v_minuit, 'crees_auto', v_crees_pf, 'abouties_auto', v_abouties_pf,
        'crees_compte', v_crees_compte, 'crees_total', v_crees_total,
        'plafond_compte', v_plafond_palier,
        'restants_compte', GREATEST(0, v_plafond_palier - v_crees_compte)),
      'boutiques', v_boutiques, 'boutique_connectee', v_ident, 'multi_boutiques', v_multi,
      'legacy', CASE WHEN v_pf = 'vinted' THEN v_legacy ELSE NULL END,
      'moteur', CASE WHEN v_pf = 'vinted' AND COALESCE((v_legacy ->> 'actif')::boolean, false) THEN 'legacy' ELSE 'aucun' END
    );
  END IF;

  v_fen := republish_planifiee_fenetre(v_regl, now());
  v_esp := republish_planifiee_espacement(v_user, v_pf);

  WITH cand AS MATERIALIZED (
    SELECT c.boutique, c.motif FROM republish_planifiee_candidats(v_user, v_regl, v_pf) c
  )
  SELECT (SELECT count(*) FROM cand WHERE motif IS NULL),
         (SELECT count(*) FROM cand WHERE motif IS NULL AND (boutique IS NULL OR boutique = v_boutique)),
         (SELECT COALESCE(jsonb_object_agg(x.m, x.n), '{}'::jsonb)
            FROM (SELECT motif AS m, count(*) AS n FROM cand WHERE motif IS NOT NULL GROUP BY motif) x),
         (SELECT COALESCE(jsonb_object_agg(COALESCE(x.b, ''), x.n), '{}'::jsonb)
            FROM (SELECT boutique AS b, count(*) AS n FROM cand WHERE motif IS NULL GROUP BY boutique) x)
  INTO v_elig_total, v_elig_boutique, v_exclus, v_par_boutique;

  -- « Ce dressing n'a pas été servi depuis X jours » : avec une ligne par
  -- boutique, la dernière fois qu'une boutique a été servie est lisible —
  -- max(debut) de SES créneaux. Avant la clé par boutique, ce chiffre
  -- n'existait pas : toutes les lignes portaient la première boutique vue.
  IF jsonb_array_length(v_boutiques) > 0 THEN
    SELECT COALESCE(jsonb_agg(b || jsonb_build_object(
             'vu_le', (SELECT max(r.debut) FROM republish_creneaux r
                        WHERE r.user_id = v_user AND r.platform = v_pf
                          AND r.boutique = b ->> 'user_id'),
             'eligibles', COALESCE((v_par_boutique ->> (b ->> 'user_id'))::integer, 0),
             'connectee', (b ->> 'user_id') IS NOT DISTINCT FROM v_boutique)
           ORDER BY o), '[]'::jsonb)
    INTO v_boutiques
    FROM jsonb_array_elements(v_boutiques) WITH ORDINALITY AS t(b, o);
  END IF;

  IF COALESCE((v_fen ->> 'dans_creneau')::boolean, false) THEN
    v_duree := extract(epoch FROM ((v_fen ->> 'courant_fin')::timestamptz - now()))::integer;
    v_jour_prochain := false;
  ELSIF (v_fen ->> 'prochain_debut') IS NOT NULL THEN
    v_duree := extract(epoch FROM ((v_fen ->> 'prochain_fin')::timestamptz - (v_fen ->> 'prochain_debut')::timestamptz))::integer;
    v_jour_prochain := ((v_fen ->> 'prochain_debut')::timestamptz AT TIME ZONE v_fuseau)::date <> (now() AT TIME ZONE v_fuseau)::date;
  ELSE
    v_duree := 0; v_jour_prochain := true;
  END IF;
  v_capacite := republish_planifiee_capacite_partagee(v_user, v_pf, v_duree, (v_esp ->> 'sec')::integer);

  v_restants := CASE WHEN v_jour_prochain THEN (v_regl ->> 'plafond_jour')::integer
                     ELSE GREATEST(0, (v_regl ->> 'plafond_jour')::integer - v_crees_pf) END;
  -- L'ENVELOPPE DE COMPTE : la somme de toutes les plateformes ne dépasse pas
  -- le plafond du palier. Un créneau de demain repart d'une enveloppe pleine.
  v_restants_compte := CASE WHEN v_jour_prochain THEN v_plafond_palier
                            ELSE GREATEST(0, v_plafond_palier - v_crees_compte) END;

  IF v_pf = 'vinted' AND v_boutique IS NOT NULL THEN
    v_plafond_b := LEAST((v_regl ->> 'plafond_jour')::integer, GREATEST(1, COALESCE(
      NULLIF(v_regl -> 'plafond_boutique' ->> v_boutique, '')::integer, (v_regl ->> 'plafond_jour')::integer)));
    SELECT count(*) INTO v_faits_b
    FROM cross_post_jobs j JOIN inventaire i ON i.id = j.inventaire_id
    WHERE j.user_id = v_user AND j.action = 'republish' AND j.platform = 'vinted'
      AND j.platform_fields ->> 'republish_source' = 'auto'
      AND j.created_at >= v_minuit
      AND i.vinted_account_id = v_boutique;
    v_restants_b := CASE WHEN v_jour_prochain THEN v_plafond_b ELSE GREATEST(0, v_plafond_b - v_faits_b) END;
    v_restants := LEAST(v_restants, v_restants_b);
  END IF;

  v_attendu := LEAST(v_restants, v_restants_compte,
                     CASE WHEN v_multi AND v_boutique IS NOT NULL THEN v_elig_boutique ELSE v_elig_total END,
                     v_capacite);
  -- L'interrupteur de la plateforme : à 0, rien ne part. On le dit, on
  -- n'affiche pas un nombre qui ne se réalisera pas.
  IF NOT v_ouverte THEN v_attendu := 0; END IF;
  v_borne := CASE
    WHEN NOT v_ouverte THEN 'plateforme_fermee'
    WHEN v_attendu = v_restants THEN 'plafond'
    WHEN v_attendu = v_restants_compte THEN 'plafond_compte'
    WHEN v_attendu = v_capacite THEN 'creneau'
    ELSE 'eligibles' END;

  -- Une ligne par boutique : l'écran montre CELLE de la boutique connectée.
  -- Boutique inconnue → la plus récente, comme avant.
  SELECT to_jsonb(r) INTO v_courant FROM republish_creneaux r
  WHERE r.user_id = v_user AND r.platform = v_pf AND r.statut = 'en_cours'
    AND (v_boutique IS NULL OR r.boutique IS NULL OR r.boutique = v_boutique)
  ORDER BY (r.boutique IS NOT DISTINCT FROM v_boutique) DESC, r.debut DESC LIMIT 1;
  SELECT to_jsonb(r) INTO v_dernier FROM republish_creneaux r
  WHERE r.user_id = v_user AND r.platform = v_pf AND r.statut <> 'en_cours'
    AND (v_boutique IS NULL OR r.boutique IS NULL OR r.boutique = v_boutique)
  ORDER BY (r.boutique IS NOT DISTINCT FROM v_boutique) DESC, r.debut DESC LIMIT 1;
  IF v_courant IS NOT NULL THEN
    SELECT count(*) INTO v_faites_live FROM cross_post_jobs j
    WHERE j.user_id = v_user AND j.action = 'republish' AND j.status = 'published'
      AND j.platform_fields ->> 'republish_creneau_id' = (v_courant ->> 'id');
    v_blocage := v_courant -> 'sautes' -> '_bloque_en_vol';
    IF v_blocage IS NOT NULL AND (v_blocage ? 'leve_le') THEN v_blocage := NULL; END IF;
    v_disjoncteur := v_courant -> 'sautes' -> '_disjoncteur';
  END IF;

  RETURN jsonb_build_object(
    'platform', v_pf,
    'actif', true,
    'configure', true,
    'ouverte', v_ouverte,
    'annonces_en_ligne', v_en_ligne,
    'reglage', v_regl,
    'palier', v_palier, 'plafond_palier', v_plafond_palier,
    'autorise', true,
    'quota_mensuel', v_quota, 'faits_mois', v_faits_mois,
    'fenetre', v_fen,
    'aujourdhui', jsonb_build_object(
      'minuit', v_minuit, 'crees_auto', v_crees_pf, 'abouties_auto', v_abouties_pf,
      'crees_compte', v_crees_compte, 'crees_total', v_crees_total,
      'plafond_jour', (v_regl ->> 'plafond_jour')::integer, 'restants', v_restants,
      'plafond_compte', v_plafond_palier, 'restants_compte', v_restants_compte,
      'plafond_boutique', v_plafond_b, 'crees_boutique', v_faits_b, 'restants_boutique', v_restants_b),
    'eligibles', jsonb_build_object('total', v_elig_total, 'boutique_connectee', v_elig_boutique,
                                    'par_boutique', v_par_boutique, 'exclus', v_exclus),
    'espacement', v_esp,
    'capacite', v_capacite, 'duree_sec', v_duree,
    'attendu', v_attendu, 'borne', v_borne,
    'boutiques', v_boutiques, 'boutique_connectee', v_ident, 'multi_boutiques', v_multi,
    'creneau_courant', v_courant, 'dernier_creneau', v_dernier,
    'faites_live', COALESCE(v_faites_live, 0), 'blocage', v_blocage, 'disjoncteur', v_disjoncteur,
    'legacy', CASE WHEN v_pf = 'vinted' THEN v_legacy ELSE NULL END,
    'moteur', 'planifie'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.republish_planifiee_sweep() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.republish_planifiee_sweep() TO service_role;
REVOKE ALL ON FUNCTION public.republish_planifiee_etat(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.republish_planifiee_etat(text) TO authenticated, service_role;

-- Contrôle (aucune écriture) :
--   SELECT indexdef FROM pg_indexes WHERE indexname = 'republish_creneaux_unique_idx';
--   SELECT conname FROM pg_constraint WHERE conrelid = 'public.republish_creneaux'::regclass;
--   SELECT jsonb_pretty(public.republish_planifiee_sweep() - 'detail');
