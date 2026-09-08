-- ═══════════════════════════════════════════════════════════════════════════
-- LA VOIE AUTO REPART DEPUIS LE SERVEUR (incident Vinted du 07/09)
-- ═══════════════════════════════════════════════════════════════════════════
-- CE QUI S'EST PASSÉ. Le 07/09 à 12h15 (Paris), Vinted a retiré le champ
-- racine `status` du payload du formulaire d'édition. Le PRÉ-VOL de capture de
-- l'extension (autoCaptureEtRepublier) juge alors la capture 'incomplet' et
-- s'arrête AVANT d'appeler spend_coins_and_republish : aucun job n'est créé,
-- aucun octet ne part vers le serveur, rien n'est réparable à distance.
-- Mesure : 225 captures de pré-vol 'incomplet' pour ce SEUL motif, 11 comptes,
-- et la voie auto à l'arrêt depuis le 07/09 03:38 sur tout le parc.
-- Le correctif d'extension existe (commit 9e411f8) mais attend la 0.6.21, elle
-- même bloquée : le Chrome Web Store n'accepte qu'UN paquet en attente et la
-- 0.6.20 (tailles Beebs de tout le parc) est en review.
--
-- CE QUE FAIT CETTE MIGRATION. Elle refait, côté serveur, le seul travail que
-- le pré-vol empêchait : CHOISIR le prochain article et appeler le RPC. Le job
-- atterrit en 'pending', l'extension le prend au poll suivant, capture
-- elle-même (comme pour tout clic manuel), et le pansement d'état de
-- get-pending-jobs lui fournit ce qui manque. C'est exactement le chemin
-- MANUEL, qui n'a jamais eu de pré-vol et qui a tourné toute la nuit du 07 au
-- 08/09 en plein incident : 45 jobs créés, 38 republiés, 6 retenus AVANT toute
-- suppression (annonces intactes), 1 refusé par Vinted à la recréation.
--
-- ⛔ CE QU'ELLE NE TOUCHE PAS, ET C'EST LE POINT IMPORTANT :
--   · spend_coins_and_republish : appelée TELLE QUELLE, aucune de ses gardes
--     n'est recopiée ici (paliers, quotas mensuels, plafond auto du jour,
--     cadence 24 h, republish_en_cours, article_sans_photo, extension vue,
--     version minimale). Les recopier, c'est se garantir qu'elles divergeront ;
--   · get-pending-jobs : ni la pause de respiration, ni les plafonds par
--     palier. Ils vivent à l'EXÉCUTION et s'appliquent quel que soit le
--     créateur du job ;
--   · l'étape 'captured' de l'extension et son refus de supprimer tant que la
--     capture n'est pas complète (verdict 'valide' + prix + titre + snapshot).
--     C'EST LE FILET QUI EMPÊCHE DE PERDRE UNE ANNONCE. Il reste intact, et
--     c'est lui — pas ce sweep — qui décide qu'on supprime ;
--   · maybeAutoRepublish dans l'extension. Les deux moteurs coexisteront le
--     jour de la 0.6.21 : l'interrupteur ci-dessous sert à ça.
--
-- COMMENT LE SERVEUR S'IDENTIFIE SANS TOUCHER LE RPC. spend_coins_and_republish
-- lit `auth.uid()`, qui n'est rien d'autre que
--   current_setting('request.jwt.claims')::jsonb ->> 'sub'
-- (définition relevée en prod le 08/09). On pose donc cette variable de session
-- LOCALE avant l'appel, et le RPC fonctionne mot pour mot comme depuis l'app.
-- Vérifié en prod avant écriture de cette migration, sur une fonction témoin
-- de même forme (SECURITY DEFINER + clause SET) : quotas_etat() a bien rendu
-- le profil de l'utilisateur visé. La variable est REMISE À VIDE après chaque
-- appel — jamais une identité qui traîne pour le compte suivant.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. PÉRIMÈTRE : une TABLE, pas une liste en dur ──────────────────────────
-- Décision Nico (08/09) : on démarre sur josephinecerni SEULE — le seul compte
-- qui utilise réellement la voie auto (sur 14 jours : elle 15-31 jobs/jour,
-- ornellaracano 1 le 03/09, nicolas.svobodny 7 le 27/08). Élargir = INSÉRER
-- UNE LIGNE, jamais redéployer. Restreindre = en supprimer une.
-- ⚠️ Pas de GRANT à `authenticated`, volontairement, contre l'habitude du
-- CLAUDE.md : cette table est un périmètre d'exploitation, aucun écran ne la
-- lit. RLS activée sans policy = personne n'y accède par PostgREST ; seules la
-- fonction SECURITY DEFINER ci-dessous et le service_role la voient.
CREATE TABLE IF NOT EXISTS public.republish_auto_serveur_comptes (
  user_id   uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  ajoute_le timestamptz NOT NULL DEFAULT now(),
  note      text
);
ALTER TABLE public.republish_auto_serveur_comptes ENABLE ROW LEVEL SECURITY;

INSERT INTO public.republish_auto_serveur_comptes (user_id, note)
SELECT id, 'incident etat Vinted 07/09 — voie auto rendue au serveur, compte temoin (GO Nico 08/09)'
FROM auth.users WHERE email = 'josephinecerni@gmail.com'
ON CONFLICT (user_id) DO NOTHING;

-- ── 2. INTERRUPTEUR : ÉTEINT À LA POSE ──────────────────────────────────────
-- 0 (ou clé absente) = le sweep ne fait RIEN et le dit. 1 = il travaille.
-- Le défaut est l'extinction : une clé oubliée n'allume jamais un automate.
-- ⚠️ Sémantique INVERSE de free_stock_limit, où un 0 VERROUILLAIT par accident
-- (2013 comptes bloqués, 04/09) : ici le 0 est la position de repos, il est
-- écrit, et c'est la valeur posée par cette migration.
INSERT INTO public.coin_config (key, value)
VALUES ('republish_auto_serveur_actif', 0)
ON CONFLICT (key) DO NOTHING;

-- ── 3. LE SWEEP ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.republish_auto_sweep_serveur()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actif     integer;
  v_compte    record;
  v_cfg       jsonb;
  v_age       integer;
  v_seuil     timestamptz;
  v_probant   boolean;
  v_premier   date;
  v_cand      record;
  v_dernier   record;
  v_rpc       jsonb;
  v_job       uuid;
  v_examines  integer;
  v_rapport   jsonb := '[]'::jsonb;
  v_ligne     jsonb;
BEGIN
  SELECT value INTO v_actif FROM coin_config WHERE key = 'republish_auto_serveur_actif';
  IF COALESCE(v_actif, 0) <> 1 THEN
    RETURN jsonb_build_object(
      'actif', false, 'comptes', 0, 'crees', 0,
      'motif', 'interrupteur coin_config.republish_auto_serveur_actif <> 1');
  END IF;

  FOR v_compte IN
    SELECT p.id, p.email, p.platform_settings
    FROM republish_auto_serveur_comptes c
    JOIN profiles p ON p.id = c.user_id
    -- Le réglage de l'utilisatrice fait foi : couper « Republication
    -- automatique » dans l'app coupe AUSSI le serveur, sans rien à faire ici.
    WHERE COALESCE((p.platform_settings #> '{vinted,republish_auto}' ->> 'actif')::boolean, false)
    -- ⚠️ 10 MINUTES, et non les 7 JOURS du RPC (décision Nico 08/09). Le RPC
    -- accepte une extension vue dans la semaine ; sur ce critère, le sweep
    -- créerait des jobs pour des Chrome éteints — ils dormiraient en 'pending'
    -- tout en consommant le plafond du jour, qui compte les jobs CRÉÉS.
      AND p.extension_last_seen_at > now() - interval '10 minutes'
    ORDER BY p.id
  LOOP
    -- GARDE ANTI-RAFALE, reproduite de maybeAutoRepublish. Le RPC, lui, ne
    -- garde que le MÊME vinted_item_id : sans cette ligne, le sweep
    -- empilerait une file pendant qu'une republication est en vol (annonce
    -- peut-être déjà supprimée, recréation en route). C'est l'invariant
    -- une-passe, il ne bouge pas.
    -- ⚠️ 'needs_user' N'Y EST PAS, volontairement : il gelait le cycle entier
    -- (panne du 30/08, 38 h à zéro). Un needs_user attend une décision sur UN
    -- article ; il est écarté plus bas, article par article, et lui seul.
    CONTINUE WHEN EXISTS (
      SELECT 1 FROM cross_post_jobs j
      WHERE j.user_id = v_compte.id AND j.action = 'republish'
        AND j.status IN ('pending', 'processing'));

    v_cfg  := v_compte.platform_settings #> '{vinted,republish_auto}';
    -- Mêmes bornes que l'extension (7..365, défaut 30). Le plancher de 7 jours
    -- n'est pas arbitraire : republier une annonce de 1-2 jours est un motif
    -- que Vinted sait repérer, et c'est le compte de l'utilisatrice qui prend.
    v_age   := LEAST(365, GREATEST(7, COALESCE(NULLIF(v_cfg ->> 'age_jours', '')::integer, 30)));
    v_seuil := now() - make_interval(days => v_age);

    -- Garde « historique probant » (option a du 23/08) : les relevés n'existent
    -- que depuis le 03/08. Exiger un premier relevé par article vieux de
    -- v_age était insatisfaisable pendant les v_age premiers jours. Si
    -- l'historique du COMPTE n'atteint pas v_age, la garde par article se tait
    -- et listed_at_guess fait foi seul.
    SELECT min(captured_on) INTO v_premier
    FROM vinted_listing_snapshots WHERE user_id = v_compte.id;
    v_probant := v_premier IS NOT NULL AND v_premier <= v_seuil::date;

    v_examines := 0;

    FOR v_cand IN
      SELECT i.id, i.vinted_item_id
      FROM inventaire i
      WHERE i.user_id = v_compte.id
        AND i.statut = 'stock'
        AND i.vinted_item_id IS NOT NULL
        -- Coquilles vides exclues en amont (28/08) : un dépôt Vinted abandonné,
        -- importé par la sync, n'a aucune photo — sa republication ne peut pas
        -- aboutir et grillerait le tour du cycle à chaque passage.
        AND i.photos IS NOT NULL AND jsonb_array_length(i.photos) > 0
        -- hidden/draft exclus (28/08, décision Nico) : republier une annonce
        -- masquée la remettrait VISIBLE — l'inverse du geste de l'utilisateur
        -- (mode vacances, stock saisonnier). NULL passe : article né FillSell
        -- jamais relu par la sync.
        AND (i.vinted_status IS NULL OR i.vinted_status NOT IN ('hidden', 'draft'))
        AND i.disparu_le IS NULL
        -- Donnée manquante = PAS de republication auto. Jamais.
        AND i.listed_at_guess IS NOT NULL
        AND i.listed_at_guess < v_seuil
      ORDER BY i.listed_at_guess ASC
      LIMIT 50
    LOOP
      v_examines := v_examines + 1;

      SELECT j.status, j.published_at, j.created_at INTO v_dernier
      FROM cross_post_jobs j
      WHERE j.user_id = v_compte.id AND j.action = 'republish'
        AND j.platform_fields ->> 'vinted_item_id' = v_cand.vinted_item_id
      ORDER BY j.created_at DESC LIMIT 1;

      IF FOUND THEN
        -- L'article en attente d'une décision de l'utilisateur est écarté ICI,
        -- et lui seul : le reproposer fabriquerait la boucle du 30/08.
        CONTINUE WHEN v_dernier.status IN ('pending', 'processing', 'needs_user');
        -- 'failed' est terminal donc republiable — mais pas dans la seconde qui
        -- suit, sinon l'article repart à chaque cycle indéfiniment.
        CONTINUE WHEN v_dernier.status = 'failed'
                  AND v_dernier.created_at > now() - interval '24 hours';
        CONTINUE WHEN v_dernier.status = 'published'
                  AND v_dernier.published_at > now() - interval '24 hours';
      END IF;

      IF v_probant THEN
        SELECT min(captured_on) INTO v_premier
        FROM vinted_listing_snapshots
        WHERE user_id = v_compte.id AND vinted_item_id = v_cand.vinted_item_id;
        CONTINUE WHEN v_premier IS NOT NULL AND v_premier > v_seuil::date;
      END IF;

      -- ── L'APPEL, avec l'identité de l'utilisatrice et rien d'autre ────────
      BEGIN
        PERFORM set_config('request.jwt.claims',
          json_build_object('sub', v_compte.id, 'role', 'authenticated')::text, true);
        v_rpc := public.spend_coins_and_republish(
          v_cand.id, v_cand.vinted_item_id, 'auto', NULL);
        PERFORM set_config('request.jwt.claims', '', true);
      EXCEPTION WHEN OTHERS THEN
        -- Le trigger de maintenance lève une exception (REPUBLISH_MAINTENANCE) :
        -- sans ce bloc, elle emporterait le sweep entier. On note et on sort.
        PERFORM set_config('request.jwt.claims', '', true);
        v_rpc := jsonb_build_object('allowed', false, 'reason', 'exception',
                                    'message', left(SQLERRM, 200));
      END;

      v_ligne := jsonb_build_object(
        'compte', v_compte.email, 'inventaire_id', v_cand.id,
        'vinted_item_id', v_cand.vinted_item_id, 'examines', v_examines,
        'allowed', COALESCE((v_rpc ->> 'allowed')::boolean, false),
        'reason', v_rpc ->> 'reason');

      IF COALESCE((v_rpc ->> 'allowed')::boolean, false) THEN
        v_job := NULLIF(v_rpc ->> 'job_id', '')::uuid;
        -- ⚠️ republish_source RESTE 'auto' — il n'est PAS remplacé par
        -- 'auto_serveur' comme envisagé, et c'est délibéré : le plafond
        -- quotidien du RPC compte exactement
        --   platform_fields->>'republish_source' = 'auto'.
        -- Le renommer aurait remis ce compteur à zéro à chaque passage — un
        -- job toutes les 3 min, 480 par jour au lieu de 20 : précisément le
        -- rattrapage massif que la consigne interdit. La distinction demandée
        -- vit donc dans une clé PROPRE, qui ne désarme rien :
        --   platform_fields.republish_moteur = 'serveur'.
        -- Lecture : WHERE platform_fields->>'republish_moteur' = 'serveur'.
        UPDATE cross_post_jobs
           SET platform_fields = platform_fields || jsonb_build_object(
                 'republish_moteur', 'serveur',
                 'republish_sweep_at', to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SSOF'))
         WHERE id = v_job;
        v_ligne := v_ligne || jsonb_build_object('job_id', v_job);
      END IF;

      v_rapport := v_rapport || v_ligne;
      -- UN article par compte et par passage, réussi ou pas — jamais de
      -- rafale. Même règle que maybeAutoRepublish : le rythme humain vient de
      -- là autant que de la machine à étapes.
      EXIT;
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object(
    'actif', true,
    'traites', jsonb_array_length(v_rapport),
    'crees', (SELECT count(*) FROM jsonb_array_elements(v_rapport) e
              WHERE (e ->> 'allowed')::boolean),
    'detail', v_rapport);
END;
$$;

REVOKE ALL ON FUNCTION public.republish_auto_sweep_serveur() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.republish_auto_sweep_serveur() TO service_role;

-- ── 4. LE CRON ──────────────────────────────────────────────────────────────
-- Toutes les 3 minutes, vers l'Edge Function (qui journalise et sert de point
-- d'observation). Même en-tête x-cron-secret que les autres crons pg_net —
-- ni query param, ni Authorization : seul le header custom fonctionne.
-- GARDÉ contre le double-schedule : un cron planté deux fois, c'est deux jobs
-- créés par passage (incident 'handler-watch-3min' cité dans le CLAUDE.md).
-- ⚠️ Le cron tourne à vide tant que l'interrupteur est à 0 — c'est voulu :
-- il se pose AVEC la migration et se vérifie AVANT d'être allumé.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'republish-auto-sweep-3min') THEN
    PERFORM cron.schedule(
      'republish-auto-sweep-3min',
      '*/3 * * * *',
      $cmd$
  select net.http_post(
    url     := 'https://tojihnuawsoohlolangc.supabase.co/functions/v1/republish-auto-sweep',
    headers := '{"Content-Type":"application/json","x-cron-secret":"fs-cron-2026-tunnel"}'::jsonb,
    body    := '{}'::jsonb
  );
  $cmd$
    );
  END IF;
END;
$$;
