-- ════════════════════════════════════════════════════════════════════════════
-- LA REMISE EN LIGNE VINTED : la fiche suit l'article, la vente ne se déclare
-- pas sur une annonce remplacée (08/10/2026 soir, cas Bebertdeals)
-- ════════════════════════════════════════════════════════════════════════════
-- LE CAS (c15f4b0e, enquête docs/enquetes/bebertdeals-0810/RAPPORT.md) : le
-- vendeur supprime ses annonces Vinted et les republie lui-même sous un NOUVEL
-- identifiant tous les 5 à 10 jours. La synchro du dressing ne rattache que par
-- identifiant d'annonce : chaque remise en ligne = une fiche neuve (268 le 08/10
-- à 19:14, dont 206 d'un article déjà connu — code article du vendeur ou titre
-- exact) ; la fiche d'origine (dépôts Leboncoin, historique) reste « en stock »
-- sur une annonce morte. 1 025 fiches pour 403 articles ; deux annonces
-- Leboncoin en ligne pour des articles déjà vendus sur Vinted sous leur
-- nouvelle annonce ; « Plus en ligne — Vendue ? » posée sur l'annonce morte.
-- La règle du 25/09 (vinted_remise_en_ligne : ancienne « closed ») ne voyait pas
-- une annonce SUPPRIMÉE ; le balayage qui l'appliquait (cron 17) est coupé
-- depuis le 28/09 ; le moteur v3 ne compare jamais deux fiches Vinted.
--
-- CE QUI CHANGE :
--  1. Deux drapeaux coin_config, posés à 0 (RIEN ne change avant qu'on les arme) :
--     rapprochement_remise_en_ligne (la passe normale juge les remises en ligne)
--     et vente_garde_remise_en_ligne (la garde de vente).
--  2. vinted_absente_dun_releve_complet, rapprochement_v3_remise_possible,
--     rapprochement_v3_remise_maillon : les gardes de la base.
--  3. vinted_remise_en_ligne : en plus de l'ancienne « closed », l'ancienne
--     SUPPRIMÉE (jamais vue vendue, jamais en ligne en même temps que la
--     nouvelle, absente d'un relevé complet). C'est ce qui fait passer, à la
--     fusion (inventaire_fusionner_pour, y compris la fusion faite à la main
--     dans l'app), l'identité Vinted vivante à la fiche gardée.
--  4. rapprochement_v3_lire : l'état Vinted des fiches, les fiches du dressing
--     nées depuis la dernière passe, le dernier relevé complet par boutique,
--     le drapeau.
--  5. rapprochement_v3_appliquer : « remise_en_ligne » (fusion vers la fiche la
--     plus ancienne, maillons, jobs Vinted des annonces mortes clos « remplacée,
--     pas une vente ») et « remise_en_ligne_a_verifier » (la question).
--  6. enregistrer_vente_atomique (chemin « job », Vinted, SANS preuve « sold ») :
--     refuse la vente d'une annonce remplacée par une remise en ligne (une autre
--     fiche de la même boutique, même titre, apparue après la dernière vue de
--     l'annonce, vue en ligne ces 72 h) — la vente se déclare depuis la fiche en
--     ligne. Une vente prouvée (« sold ») ne passe jamais par là : ses retraits
--     de copies sont inchangés.
-- Moteur : supabase/functions/_shared/rapprochement/remises-en-ligne.js
-- (fonction edge rapprochement v15, inerte sans cette migration et sans le drapeau).
-- Mesure : rejeu à blanc Bebertdeals (1 025 fiches) 166 chaînes, 0 code article
-- différent ; le parc : scripts/reparations/20261008_remises_en_ligne_vinted.mjs --parc.
-- Coût : la lecture ajoute deux lectures indexées par compte ; la garde de vente,
-- une lecture par vente déclarée sans preuve.
-- Armer : UPDATE coin_config SET value = 1 WHERE key IN ('rapprochement_remise_en_ligne', 'vente_garde_remise_en_ligne');
-- Couper : la même ligne avec value = 0 (journalisé dans coin_config_journal).
-- Inverse : supabase/rollbacks/20261008160000_remise_en_ligne_vinted_INVERSE.sql

BEGIN;
SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '3s';

-- Corps PROD relus (md5 de pg_get_functiondef), patchés par ancres exactes ; on
-- s'arrête si l'un a changé depuis la lecture.
DO $verif$
DECLARE r record;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('public.rapprochement_v3_lire(uuid)', '3d45f23b56f23ccdb9efeed97d798019'),
    ('public.rapprochement_v3_appliquer(uuid,jsonb,text,boolean)', '94925e0e98f8811f2e122f37fe43f9c8'),
    ('public.enregistrer_vente_atomique(uuid,text,bigint,uuid,numeric,numeric,integer,integer,text)', 'be4682964d4dabce1c89112f52a99ec1'),
    ('public.vinted_remise_en_ligne(bigint,bigint)', 'e6c4cc857e465bd3c4880c1be4f86170')) v(f, m) LOOP
    IF md5(pg_get_functiondef(r.f::regprocedure)) <> r.m THEN
      RAISE EXCEPTION '% a changé en prod depuis la lecture — ON S''ARRÊTE', r.f;
    END IF;
  END LOOP;
END
$verif$;

-- ── 1. Les deux drapeaux (coin_config, journalisés) ─────────────────────────
--   rapprochement_remise_en_ligne : 0 = la passe normale ne juge pas les remises
--     en ligne (ligne absente = 0 : rien ne fusionne sans décision) ; 1 = armée.
--   vente_garde_remise_en_ligne : 0 = coupée ; 1 = armée ; ligne absente = armée
--     (la garde protège : elle refuse une vente, elle n'en écrit aucune).
-- Les deux sont posés à 0 : la passe et la vente ne changent pas tant que Nico ne
-- les arme pas. Seul effet immédiat de la migration (point 3) : une fusion faite
-- À LA MAIN entre la fiche d'une annonce supprimée et celle de sa remise en ligne
-- donne l'annonce vivante à la fiche gardée (comme pour « closed » depuis le 25/09).
WITH ins AS (
  INSERT INTO public.coin_config (key, value, updated_at)
  VALUES ('rapprochement_remise_en_ligne', 0, now()), ('vente_garde_remise_en_ligne', 0, now())
  ON CONFLICT (key) DO NOTHING RETURNING key, value)
INSERT INTO public.coin_config_journal (key, avant, apres, par)
SELECT key, NULL, value, 'migration 20261008160000' FROM ins;

-- ── 2. Les gardes de la base (fonctions nouvelles) ──────────────────────────
-- Une fiche Vinted a quitté le dressing : un relevé COMPLET de sa boutique a
-- commencé après sa dernière vue (5 min de marge : la même synchro date tout).
CREATE OR REPLACE FUNCTION public.vinted_absente_dun_releve_complet(p_fiche bigint)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM inventaire m JOIN vinted_sync_runs r ON r.user_id = m.user_id
     WHERE m.id = p_fiche AND m.last_synced_at IS NOT NULL
       AND r.kind = 'dressing' AND r.status = 'done' AND r.items_vus > 0
       AND r.items_vus >= COALESCE(r.total_entries, r.items_vus)
       AND r.started_at > m.last_synced_at + interval '5 minutes'
       AND (m.vinted_account_id IS NULL OR r.vinted_user_id IS NOT DISTINCT FROM m.vinted_account_id));
$function$;

-- La paire (ancienne fiche, fiche de la nouvelle annonce) : NULL = la fusion peut
-- se faire ; sinon le motif. Rien (saut) : introuvable, paire_tranchee,
-- pas_vinted, boutiques_differentes, ancienne_vendue, nouvelle_pas_en_ligne,
-- pas_une_remise_en_ligne. La question (jamais la fusion) : quantite,
-- job_en_vol, nouvelle_touchee, deux_exemplaires.
CREATE OR REPLACE FUNCTION public.rapprochement_v3_remise_possible(p_user uuid, p_ancienne bigint, p_nouvelle bigint)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE m inventaire%ROWTYPE; n inventaire%ROWTYPE;
BEGIN
  SELECT * INTO m FROM inventaire WHERE id = p_ancienne AND user_id = p_user;
  SELECT * INTO n FROM inventaire WHERE id = p_nouvelle AND user_id = p_user;
  IF m.id IS NULL OR n.id IS NULL OR m.id = n.id OR m.fusionne_dans IS NOT NULL OR n.fusionne_dans IS NOT NULL THEN
    RETURN 'introuvable';
  END IF;
  -- une décision de la personne sur la paire est définitive (réponse, fusion défaite)
  IF EXISTS (SELECT 1 FROM inventaire_doublons q WHERE q.user_id = p_user AND q.decide_par = 'utilisateur'
               AND least(q.garde, q.absorbe) = least(m.id, n.id) AND greatest(q.garde, q.absorbe) = greatest(m.id, n.id))
     OR EXISTS (SELECT 1 FROM inventaire_fusions f WHERE f.user_id = p_user AND f.defait_le IS NOT NULL
                  AND least(f.garde, f.absorbe) = least(m.id, n.id) AND greatest(f.garde, f.absorbe) = greatest(m.id, n.id)) THEN
    RETURN 'paire_tranchee';
  END IF;
  IF NULLIF(btrim(COALESCE(m.vinted_item_id, '')), '') IS NULL OR NULLIF(btrim(COALESCE(n.vinted_item_id, '')), '') IS NULL
     OR btrim(m.vinted_item_id) = btrim(n.vinted_item_id) THEN
    RETURN 'pas_vinted';
  END IF;
  IF COALESCE(m.vinted_account_id, '') <> COALESCE(n.vinted_account_id, '') THEN RETURN 'boutiques_differentes'; END IF;
  IF m.statut IS DISTINCT FROM 'stock' OR COALESCE(m.vinted_status, '') = 'sold'
     OR n.statut IS DISTINCT FROM 'stock' AND (n.statut = 'vendu' OR COALESCE(n.vinted_status, '') = 'sold') THEN
    RETURN 'ancienne_vendue';
  END IF;
  IF n.statut IS DISTINCT FROM 'stock' OR COALESCE(n.vinted_status, '') <> 'active' OR n.disparu_le IS NOT NULL THEN
    RETURN 'nouvelle_pas_en_ligne';
  END IF;
  -- jamais en ligne ensemble, l'ancienne a quitté le dressing sans y être vue vendue
  IF NOT vinted_remise_en_ligne(m.id, n.id) THEN RETURN 'pas_une_remise_en_ligne'; END IF;
  -- ce qui demande la personne : la question, jamais la fusion
  IF COALESCE(m.quantite, 1) > 1 OR COALESCE(n.quantite, 1) > 1 THEN RETURN 'quantite'; END IF;
  IF EXISTS (SELECT 1 FROM cross_post_jobs j WHERE j.user_id = p_user AND j.inventaire_id IN (m.id, n.id)
               AND j.status IN ('pending', 'processing', 'needs_user')) THEN
    RETURN 'job_en_vol';
  END IF;
  IF n.prix_achat IS NOT NULL OR COALESCE(n.prix_achat_inconnu, false)
     OR n.prix_vente_change_par = 'app' OR n.poids_change_par = 'app'
     OR EXISTS (SELECT 1 FROM ventes x WHERE x.inventaire_id = n.id)
     OR EXISTS (SELECT 1 FROM fiches_annonce fa WHERE fa.inventaire_id = n.id)
     OR EXISTS (SELECT 1 FROM push_ventes pv WHERE pv.inventaire_id = n.id)
     OR EXISTS (SELECT 1 FROM remises_en_vente rv WHERE rv.inventaire_id = n.id)
     OR EXISTS (SELECT 1 FROM jsonb_each(CASE WHEN jsonb_typeof(n.attributs) = 'object' THEN n.attributs ELSE '{}'::jsonb END) e
                 WHERE jsonb_typeof(e.value) = 'object' AND e.value ->> 'source' = 'manuel') THEN
    RETURN 'nouvelle_touchee';
  END IF;
  -- jamais deux annonces vivantes d'une même autre plateforme sur un article
  IF EXISTS (SELECT 1 FROM annonces_plateforme x JOIN annonces_plateforme y ON y.platform = x.platform
              WHERE x.inventaire_id = m.id AND y.inventaire_id = n.id AND x.disparu_le IS NULL AND y.disparu_le IS NULL)
     OR EXISTS (SELECT 1 FROM cross_post_jobs x JOIN cross_post_jobs y ON y.platform = x.platform
                 WHERE x.inventaire_id = m.id AND y.inventaire_id = n.id AND x.platform <> 'vinted'
                   AND x.status = 'published' AND y.status = 'published'
                   AND x.action IN ('publish', 'republish') AND y.action IN ('publish', 'republish')) THEN
    RETURN 'deux_exemplaires';
  END IF;
  RETURN NULL;
END;
$function$;

-- Un maillon de la chaîne (une fiche intermédiaire : annonce Vinted morte) qui
-- rejoint la gardée APRÈS l'échange : NULL = la fusion peut se faire.
CREATE OR REPLACE FUNCTION public.rapprochement_v3_remise_maillon(p_user uuid, p_garde bigint, p_maillon bigint)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE g inventaire%ROWTYPE; m inventaire%ROWTYPE;
BEGIN
  SELECT * INTO g FROM inventaire WHERE id = p_garde AND user_id = p_user;
  SELECT * INTO m FROM inventaire WHERE id = p_maillon AND user_id = p_user;
  IF g.id IS NULL OR m.id IS NULL OR g.id = m.id OR g.fusionne_dans IS NOT NULL OR m.fusionne_dans IS NOT NULL THEN RETURN 'introuvable'; END IF;
  IF EXISTS (SELECT 1 FROM inventaire_doublons q WHERE q.user_id = p_user AND q.decide_par = 'utilisateur'
               AND least(q.garde, q.absorbe) = least(g.id, m.id) AND greatest(q.garde, q.absorbe) = greatest(g.id, m.id))
     OR EXISTS (SELECT 1 FROM inventaire_fusions f WHERE f.user_id = p_user AND f.defait_le IS NOT NULL
                  AND least(f.garde, f.absorbe) = least(g.id, m.id) AND greatest(f.garde, f.absorbe) = greatest(g.id, m.id)) THEN
    RETURN 'paire_tranchee';
  END IF;
  IF NULLIF(btrim(COALESCE(m.vinted_item_id, '')), '') IS NULL OR btrim(m.vinted_item_id) = btrim(COALESCE(g.vinted_item_id, '')) THEN RETURN 'pas_vinted'; END IF;
  IF COALESCE(m.vinted_account_id, '') <> COALESCE(g.vinted_account_id, '') THEN RETURN 'boutiques_differentes'; END IF;
  IF m.statut IS DISTINCT FROM 'stock' OR COALESCE(m.vinted_status, '') = 'sold' THEN RETURN 'vendu'; END IF;
  -- une annonce morte : datée disparue, ou absente d'un relevé complet de sa boutique
  IF m.disparu_le IS NULL AND NOT vinted_absente_dun_releve_complet(m.id) THEN RETURN 'encore_en_ligne'; END IF;
  IF COALESCE(m.quantite, 1) > 1 THEN RETURN 'quantite'; END IF;
  IF EXISTS (SELECT 1 FROM cross_post_jobs j WHERE j.user_id = p_user AND j.inventaire_id = m.id
               AND j.status IN ('pending', 'processing', 'needs_user')) THEN
    RETURN 'job_en_vol';
  END IF;
  IF EXISTS (SELECT 1 FROM annonces_plateforme x JOIN annonces_plateforme y ON y.platform = x.platform
              WHERE x.inventaire_id = g.id AND y.inventaire_id = m.id AND x.disparu_le IS NULL AND y.disparu_le IS NULL)
     OR EXISTS (SELECT 1 FROM cross_post_jobs x JOIN cross_post_jobs y ON y.platform = x.platform
                 WHERE x.inventaire_id = g.id AND y.inventaire_id = m.id AND x.platform <> 'vinted'
                   AND x.status = 'published' AND y.status = 'published'
                   AND x.action IN ('publish', 'republish') AND y.action IN ('publish', 'republish')) THEN
    RETURN 'deux_exemplaires';
  END IF;
  RETURN NULL;
END;
$function$;

REVOKE ALL ON FUNCTION public.rapprochement_v3_remise_possible(uuid, bigint, bigint) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.rapprochement_v3_remise_maillon(uuid, bigint, bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rapprochement_v3_remise_possible(uuid, bigint, bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.rapprochement_v3_remise_maillon(uuid, bigint, bigint) TO service_role;

-- ── 3. La règle de l'échange d'identités, élargie (inventaire_fusionner_pour) ──
CREATE OR REPLACE FUNCTION public.vinted_remise_en_ligne(p_retiree bigint, p_vivante bigint)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM inventaire m, inventaire n
     WHERE m.id = p_retiree AND n.id = p_vivante AND m.id <> n.id AND m.user_id = n.user_id
       AND m.vinted_item_id IS NOT NULL AND n.vinted_item_id IS NOT NULL AND m.vinted_item_id <> n.vinted_item_id
       AND n.vinted_status = 'active' AND n.disparu_le IS NULL
       AND COALESCE(m.vinted_account_id, '') = COALESCE(n.vinted_account_id, '')
       AND (
         -- (25/09) l'ancienne fermée par Vinted (closed), datée disparue
         (m.vinted_status = 'closed' AND m.disparu_le IS NOT NULL AND n.created_at >= m.disparu_le - interval '1 day')
         -- (08/10 soir, Bebertdeals) l'ancienne SUPPRIMÉE par la personne pour la republier :
         -- jamais vue vendue, jamais en ligne en même temps que la nouvelle (dernière vue de
         -- l'ancienne AVANT la première de la nouvelle), absente d'un relevé complet de sa boutique
         OR (COALESCE(m.vinted_status, '') <> 'sold'
             AND m.last_synced_at IS NOT NULL AND n.first_seen_at IS NOT NULL AND m.last_synced_at < n.first_seen_at
             AND (m.disparu_le IS NOT NULL OR vinted_absente_dun_releve_complet(m.id)))));
$function$;

-- ── 5. La lecture de la passe ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rapprochement_v3_lire(p_user uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
 SET statement_timeout TO '90s'
AS $function$
DECLARE v_fiches jsonb; v_annonces jsonb; v_fusions jsonb; v_doublons jsonb;
        v_depuis timestamptz := rapprochement_v3_vinted_depuis(p_user); v_vinted jsonb; v_vinted_max timestamptz; v_vinted_reste boolean;
        v_main_depuis timestamptz := rapprochement_v3_fiches_main_depuis(p_user); v_main jsonb := '[]'::jsonb; v_main_max timestamptz; v_main_reste boolean := false;
        v_nouvelles jsonb := '[]'::jsonb; v_releves jsonb := '{}'::jsonb;
BEGIN
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', i.id::text, 'titre', i.titre, 'prix', i.prix_vente, 'statut', i.statut, 'origine', i.origine,
      'marque', COALESCE(NULLIF(trim(i.marque), ''), CASE WHEN jsonb_typeof(i.attributs -> 'marque') = 'object' THEN i.attributs -> 'marque' ->> 'v' ELSE i.attributs ->> 'marque' END),
      'taille', CASE WHEN jsonb_typeof(i.attributs -> 'taille') = 'object' THEN i.attributs -> 'taille' ->> 'v' ELSE i.attributs ->> 'taille' END,
      'photos', COALESCE((SELECT jsonb_agg(z.u ORDER BY z.o) FROM (
                  SELECT CASE WHEN jsonb_typeof(e) = 'string' THEN e #>> '{}' WHEN jsonb_typeof(e) = 'object' THEN COALESCE(e ->> 'url', e ->> 'original') END u, o
                    FROM jsonb_array_elements(CASE WHEN jsonb_typeof(i.photos) = 'array' THEN i.photos ELSE '[]'::jsonb END) WITH ORDINALITY x(e, o)
                   LIMIT 6) z WHERE z.u ~ '^https://'), '[]'::jsonb),
      'a_verifier', i.a_verifier IS NOT NULL,
      'a_verifier_auto', i.a_verifier IS NOT NULL AND COALESCE(i.a_verifier ->> 'source', '') IN ('moteur', 'rattrapage_0710', 'rapprochement_v3'),
      'created_at', i.created_at, 'quantite', COALESCE(i.quantite, 1), 'vinted_item_id', i.vinted_item_id,
      -- (08/10 soir) la remise en ligne Vinted : l'état de l'annonce Vinted de la fiche
      'vinted_status', i.vinted_status, 'disparu_le', i.disparu_le, 'last_synced_at', i.last_synced_at,
      'first_seen_at', i.first_seen_at, 'vinted_account_id', i.vinted_account_id
    )), '[]'::jsonb)
    INTO v_fiches
    FROM inventaire i
   WHERE i.user_id = p_user AND i.fusionne_dans IS NULL AND i.statut IN ('stock', 'vendu');

  WITH runs AS (
    SELECT r.id, releve_run_hors_liste(r.id) hors_liste, releve_est_geste(r.declencheur) geste,
           (r.platform = 'ebay' AND releve_ebay_run_bloque(r.id)) ebay_bloque
      FROM vinted_sync_runs r
     WHERE r.id IN (SELECT DISTINCT a.run_id FROM annonces_plateforme a WHERE a.user_id = p_user AND a.disparu_le IS NULL AND a.run_id IS NOT NULL)
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', a.id, 'platform', a.platform, 'listing_id', a.listing_id, 'url', a.url, 'titre', a.titre, 'prix', a.prix,
      'photo_url', a.photo_url,
      'photos', (
        -- les photos de la fiche rapatriée (notre stockage) quand il y en a, sinon la
        -- capture (Leboncoin : la grande image, jamais la vignette), sinon la couverture
        SELECT COALESCE(
          (SELECT jsonb_agg(z.u ORDER BY z.o) FROM (
             SELECT CASE WHEN jsonb_typeof(e) = 'string' THEN e #>> '{}' WHEN jsonb_typeof(e) = 'object' THEN COALESCE(e ->> 'url', e ->> 'original') END u, o
               FROM inventaire i2, jsonb_array_elements(CASE WHEN jsonb_typeof(i2.photos) = 'array' THEN i2.photos ELSE '[]'::jsonb END) WITH ORDINALITY x(e, o)
              WHERE i2.id = a.inventaire_id AND i2.origine = 'releve_' || a.platform
                AND (i2.photos -> 0) #>> '{}' LIKE '%/storage/v1/object/public/listing-photos/%'
              LIMIT 6) z WHERE z.u ~ '^https://'),
          (SELECT jsonb_agg(regexp_replace(z.u, 'rule=ad-(thumb|small|medium)', 'rule=ad-large') ORDER BY z.o) FROM (
             SELECT e #>> '{}' u, o FROM jsonb_array_elements(CASE WHEN jsonb_typeof(a.capture -> 'photos') = 'array' THEN a.capture -> 'photos' ELSE '[]'::jsonb END) WITH ORDINALITY x(e, o)
              WHERE jsonb_typeof(e) = 'string' LIMIT 6) z WHERE z.u ~ '^https://'),
          CASE WHEN a.photo_url ~ '^https://' THEN jsonb_build_array(regexp_replace(a.photo_url, 'rule=ad-(thumb|small|medium)', 'rule=ad-large')) ELSE '[]'::jsonb END)),
      'taille', a.capture ->> 'taille', 'marque', a.capture ->> 'marque',
      'inventaire_id', a.inventaire_id::text,
      'ignoree', a.ignoree_le IS NOT NULL,
      'ignoree_par_utilisateur', a.ignoree_le IS NOT NULL AND EXISTS (SELECT 1 FROM rapprochements r WHERE r.annonce_id = a.id AND r.decision = 'ignore' AND r.par = 'utilisateur'),
      'proposition_motif', a.proposition ->> 'motif',
      'source', a.source_rapprochement, 'run_id', a.run_id,
      'en_ligne', a.statut_plateforme = 'en_ligne' AND a.fiche_supprimee_le IS NULL,
      'hors_liste', COALESCE(ru.hors_liste, false), 'ebay_bloque', COALESCE(ru.ebay_bloque, false), 'geste', COALESCE(ru.geste, false),
      'derniere_par', d.par, 'derniere_decision', d.decision, 'derniere_motif', d.motif
    )), '[]'::jsonb)
    INTO v_annonces
    FROM annonces_plateforme a
    LEFT JOIN runs ru ON ru.id = a.run_id
    LEFT JOIN LATERAL (SELECT r.par, r.decision, r.detail ->> 'motif' motif FROM rapprochements r
                        WHERE r.annonce_id = a.id AND r.decision IN ('attache', 'import', 'ignore')
                        ORDER BY r.created_at DESC LIMIT 1) d ON true
   WHERE a.user_id = p_user AND a.disparu_le IS NULL AND a.platform IN ('leboncoin', 'beebs', 'ebay', 'opla')
     AND NOT (a.url IS NOT NULL AND annonce_lien_notification(a.url));

  SELECT COALESCE(jsonb_agg(jsonb_build_object('garde', f.garde::text, 'absorbe', f.absorbe::text, 'par', f.par, 'defaite', f.defait_le IS NOT NULL)), '[]'::jsonb)
    INTO v_fusions FROM inventaire_fusions f WHERE f.user_id = p_user;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', d.id, 'garde', d.garde::text, 'absorbe', d.absorbe::text, 'statut', d.statut, 'motif', d.motif,
                                                 'decide_par', d.decide_par, 'source', d.source,
                                                 'auto', d.decide_par IS NULL AND COALESCE(d.source, '') = 'releve' AND d.motif IS DISTINCT FROM 'copie_non_prouvee')), '[]'::jsonb)
    INTO v_doublons FROM inventaire_doublons d WHERE d.user_id = p_user AND d.statut IN ('proposee', 'refusee', 'fusionnee');

  -- (08/10, complément) les fiches du dressing Vinted nées depuis la dernière
  -- passe : jugées contre les imports déjà au stock (rien à juger sans import).
  -- 200 par passe au plus (une fonction edge n'a que 2 s de CPU) : la date de la
  -- 200e, et toutes celles de la même date (un lot du dressing partage la sienne) ;
  -- la suite part à la passe d'après (vinted_reste).
  SELECT max(x.created_at) INTO v_vinted_max FROM (
    SELECT i.created_at FROM inventaire i
     WHERE i.user_id = p_user AND i.origine = 'vinted_sync' AND i.created_at > v_depuis
     ORDER BY i.created_at LIMIT 200) x;
  v_vinted_reste := v_vinted_max IS NOT NULL AND EXISTS (
    SELECT 1 FROM inventaire i WHERE i.user_id = p_user AND i.origine = 'vinted_sync' AND i.created_at > v_vinted_max);
  SELECT COALESCE(jsonb_agg(i.id::text ORDER BY i.created_at), '[]'::jsonb) INTO v_vinted FROM inventaire i
   WHERE i.user_id = p_user AND i.origine = 'vinted_sync' AND i.created_at > v_depuis AND i.created_at <= v_vinted_max
     AND i.fusionne_dans IS NULL AND i.statut IN ('stock', 'vendu')
     AND (EXISTS (SELECT 1 FROM inventaire r WHERE r.user_id = p_user AND r.origine LIKE 'releve\_%'
                   AND r.fusionne_dans IS NULL AND r.statut IN ('stock', 'vendu'))
          -- (08/10 soir) … ou contre les fiches créées à la main (règle de Nico)
          OR EXISTS (SELECT 1 FROM inventaire i WHERE i.user_id = p_user AND i.fusionne_dans IS NULL AND i.statut = 'stock'
                       AND i.vinted_item_id IS NULL AND COALESCE(i.origine, '') <> 'vinted_sync' AND COALESCE(i.origine, '') NOT LIKE 'releve\_%'));

  -- (08/10 soir) les fiches créées à la main nées depuis la dernière passe :
  -- jugées contre les fiches Vinted (rien à juger sans fiche Vinted). 200 par
  -- passe, la suite à la passe d'après (fiches_main_reste).
  IF EXISTS (SELECT 1 FROM inventaire v WHERE v.user_id = p_user AND v.fusionne_dans IS NULL AND v.statut = 'stock'
               AND (v.vinted_item_id IS NOT NULL OR v.origine = 'vinted_sync')) THEN
    SELECT max(x.created_at) INTO v_main_max FROM (
      SELECT i.created_at FROM inventaire i
       WHERE i.user_id = p_user AND i.vinted_item_id IS NULL AND COALESCE(i.origine, '') <> 'vinted_sync' AND COALESCE(i.origine, '') NOT LIKE 'releve\_%' AND i.created_at > v_main_depuis
       ORDER BY i.created_at LIMIT 200) x;
    v_main_reste := v_main_max IS NOT NULL AND EXISTS (
      SELECT 1 FROM inventaire i WHERE i.user_id = p_user AND i.vinted_item_id IS NULL AND COALESCE(i.origine, '') <> 'vinted_sync' AND COALESCE(i.origine, '') NOT LIKE 'releve\_%' AND i.created_at > v_main_max);
    SELECT COALESCE(jsonb_agg(i.id::text ORDER BY i.created_at), '[]'::jsonb) INTO v_main FROM inventaire i
     WHERE i.user_id = p_user AND i.vinted_item_id IS NULL AND COALESCE(i.origine, '') <> 'vinted_sync' AND COALESCE(i.origine, '') NOT LIKE 'releve\_%' AND i.created_at > v_main_depuis AND i.created_at <= v_main_max
       AND i.fusionne_dans IS NULL AND i.statut = 'stock';
  END IF;

  -- (08/10 soir, Bebertdeals) LA REMISE EN LIGNE VINTED : les fiches du dressing nées
  -- depuis la dernière passe (la fenêtre de vinted_a_juger, sans sa condition), et le
  -- dernier relevé COMPLET de chaque boutique (une fiche absente de ce relevé a quitté
  -- le dressing). Inerte tant que coin_config rapprochement_remise_en_ligne <> 1.
  IF v_vinted_max IS NOT NULL THEN
    SELECT COALESCE(jsonb_agg(i.id::text ORDER BY i.created_at), '[]'::jsonb) INTO v_nouvelles FROM inventaire i
     WHERE i.user_id = p_user AND i.origine = 'vinted_sync' AND i.created_at > v_depuis AND i.created_at <= v_vinted_max
       AND i.fusionne_dans IS NULL AND i.statut = 'stock';
  END IF;
  SELECT COALESCE(jsonb_object_agg(x.acc, x.le), '{}'::jsonb) INTO v_releves FROM (
    SELECT COALESCE(r.vinted_user_id, '') acc, max(r.started_at) le FROM vinted_sync_runs r
     WHERE r.user_id = p_user AND r.kind = 'dressing' AND r.status = 'done' AND r.items_vus > 0
       AND r.items_vus >= COALESCE(r.total_entries, r.items_vus)
     GROUP BY 1) x;

  RETURN jsonb_build_object(
    'remise_en_ligne_actif', COALESCE((SELECT value FROM coin_config WHERE key = 'rapprochement_remise_en_ligne'), 0) = 1,
    'vinted_nouvelles', v_nouvelles, 'vinted_releves_complets', v_releves,
    'fiches_main_actif', true, 'fiches_main_a_juger', v_main, 'fiches_main_juge_jusqu_a', v_main_max,
    'fiches_main_depuis', v_main_depuis, 'fiches_main_reste', COALESCE(v_main_reste, false),
    'vinted_a_juger', v_vinted, 'vinted_juge_jusqu_a', v_vinted_max, 'vinted_depuis', v_depuis, 'vinted_reste', COALESCE(v_vinted_reste, false),
    'user_id', p_user, 'fiches', v_fiches, 'annonces', v_annonces, 'fusions', v_fusions, 'doublons', v_doublons,
    'dette_beebs', releve_dette_beebs(p_user),
    'import_ouvert', COALESCE((SELECT value FROM coin_config WHERE key = 'import_auto_ouvert'), 0) = 1,
    'geste_recent', EXISTS (SELECT 1 FROM vinted_sync_runs s WHERE s.user_id = p_user AND s.kind IN ('annonces', 'dressing')
                             AND releve_est_geste(s.declencheur) AND COALESCE(s.queued_at, s.started_at) > now() - interval '2 hours'),
    'lu_le', now());
END;
$function$;

-- ── 6. L'écriture de la passe ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rapprochement_v3_appliquer(p_user uuid, p_decisions jsonb, p_mode text DEFAULT 'normal'::text, p_geste boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
 SET statement_timeout TO '120s'
AS $function$
DECLARE
  d jsonb; v_type text; a annonces_plateforme%ROWTYPE; f inventaire%ROWTYPE; g inventaire%ROWTYPE;
  v_fiche bigint; v_cand bigint; v_fa bigint; v_fb bigint; v_job uuid; v_r jsonb; v_posee boolean; v_motif text;
  v_ids uuid[]; v_id uuid; v_premiere uuid; v_n integer; v_ok boolean;
  v_vivante text; v_morts text[]; v_absorbes bigint[]; v_maillon bigint; v_mort text; v_motif_maillon text; v_r2 jsonb; v_jobs_clos integer;
  n_faits jsonb := '{}'::jsonb; n_sautes jsonb := '{}'::jsonb; v_erreurs jsonb := '[]'::jsonb; v_journal jsonb := '[]'::jsonb;
  t0 timestamptz := clock_timestamp();
  v_par text := 'utilisateur:photo_rapprochement_v3';
BEGIN
  IF p_user IS NULL OR jsonb_typeof(p_decisions) <> 'array' THEN RETURN jsonb_build_object('ok', false, 'reason', 'parametres'); END IF;
  IF NOT pg_try_advisory_xact_lock(hashtext('rapprochement:' || p_user::text)) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'occupe');
  END IF;
  PERFORM set_config('fillsell.rapprochement_moteur', 'on', true);

  FOR d IN SELECT * FROM jsonb_array_elements(p_decisions) LOOP
    v_type := d ->> 'type';
    BEGIN
      -- ── ATTACHER : une annonce sans article rejoint l'article du groupe ──
      IF v_type = 'attacher' THEN
        SELECT * INTO a FROM annonces_plateforme WHERE id = (d ->> 'annonce')::uuid AND user_id = p_user FOR UPDATE;
        v_fiche := (d ->> 'fiche')::bigint;
        SELECT * INTO f FROM inventaire WHERE id = v_fiche AND user_id = p_user AND fusionne_dans IS NULL;
        IF a.id IS NULL OR f.id IS NULL THEN n_sautes := n_sautes || jsonb_build_object('attacher_introuvable', COALESCE((n_sautes ->> 'attacher_introuvable')::int, 0) + 1); CONTINUE; END IF;
        IF a.inventaire_id IS NOT NULL OR a.ignoree_le IS NOT NULL OR a.disparu_le IS NOT NULL THEN
          n_sautes := n_sautes || jsonb_build_object('attacher_deja_decidee', COALESCE((n_sautes ->> 'attacher_deja_decidee')::int, 0) + 1); CONTINUE;
        END IF;
        IF EXISTS (SELECT 1 FROM annonces_plateforme x WHERE x.inventaire_id = v_fiche AND x.platform = a.platform AND x.disparu_le IS NULL AND x.id <> a.id) THEN
          n_sautes := n_sautes || jsonb_build_object('attacher_deux_exemplaires', COALESCE((n_sautes ->> 'attacher_deux_exemplaires')::int, 0) + 1); CONTINUE;
        END IF;
        v_job := rapprochement_attacher(a.id, v_fiche, 'photo_identique', COALESCE(d -> 'preuve', '{}'::jsonb) || jsonb_build_object('regle', 'rapprochement_v3', 'mode', p_mode));
        IF v_job IS NULL THEN n_sautes := n_sautes || jsonb_build_object('attacher_refuse', COALESCE((n_sautes ->> 'attacher_refuse')::int, 0) + 1); CONTINUE; END IF;
        -- (07/10) Article VENDU : le suivi part « vendu, encore en ligne ».
        IF f.statut = 'vendu' THEN
          UPDATE cross_post_jobs
             SET status = 'cancelled',
                 platform_fields = COALESCE(platform_fields, '{}'::jsonb) || jsonb_build_object('pending_removal', true,
                                   'vendu_encore_en_ligne', jsonb_build_object('annonce_id', a.id, 'par', 'rapprochement_v3', 'at', now()))
           WHERE id = v_job AND user_id = p_user AND platform_fields ->> 'source' = 'releve';
        END IF;
        n_faits := n_faits || jsonb_build_object('attacher', COALESCE((n_faits ->> 'attacher')::int, 0) + 1);

      -- ── FUSIONNER (réparation) : l'article importé, intact, rejoint la base ──
      ELSIF v_type = 'fusionner' THEN
        -- (08/10, complément) hors réparation : seulement vers une fiche du dressing
        -- Vinted pas encore jugée (née depuis la dernière passe) ; les gardes
        -- ci-dessous valent pareil (article importé intact, sinon la question).
        IF p_mode <> 'reparation' AND NOT (
             d ->> 'portee' = 'vinted_nouvelle'
             AND EXISTS (SELECT 1 FROM inventaire v WHERE v.id = NULLIF(d ->> 'garde', '')::bigint AND v.user_id = p_user
                           AND v.origine = 'vinted_sync' AND v.created_at > rapprochement_v3_vinted_depuis(p_user))) THEN
          n_sautes := n_sautes || jsonb_build_object('fusionner_hors_reparation', COALESCE((n_sautes ->> 'fusionner_hors_reparation')::int, 0) + 1); CONTINUE;
        END IF;
        SELECT * INTO f FROM inventaire WHERE id = (d ->> 'absorbe')::bigint AND user_id = p_user FOR UPDATE;
        SELECT * INTO g FROM inventaire WHERE id = (d ->> 'garde')::bigint AND user_id = p_user FOR UPDATE;
        IF f.id IS NULL OR g.id IS NULL OR f.fusionne_dans IS NOT NULL OR g.fusionne_dans IS NOT NULL OR f.id = g.id THEN
          n_sautes := n_sautes || jsonb_build_object('fusionner_introuvable', COALESCE((n_sautes ->> 'fusionner_introuvable')::int, 0) + 1); CONTINUE;
        END IF;
        IF NOT (f.origine LIKE 'releve\_%') OR NOT rapprochement_v3_fiche_intacte(f.id) OR g.statut = 'vendu' THEN
          -- Un article que la personne a touché : la question, pas la fusion.
          v_posee := releve_poser_question(p_user, g.id, f.id, 'photo_identique',
                       COALESCE(d -> 'preuve', '{}'::jsonb) || jsonb_build_object('avant_stock', false, 'regle', 'rapprochement_v3', 'article_modifie', true));
          n_sautes := n_sautes || jsonb_build_object('fusionner_article_modifie', COALESCE((n_sautes ->> 'fusionner_article_modifie')::int, 0) + 1,
                                                       'fusionner_question_posee', COALESCE((n_sautes ->> 'fusionner_question_posee')::int, 0) + CASE WHEN v_posee THEN 1 ELSE 0 END);
          CONTINUE;
        END IF;
        -- jamais deux annonces vivantes de la même plateforme sur un article
        IF EXISTS (SELECT 1 FROM annonces_plateforme x JOIN annonces_plateforme y ON y.platform = x.platform
                    WHERE x.inventaire_id = f.id AND y.inventaire_id = g.id AND x.disparu_le IS NULL AND y.disparu_le IS NULL) THEN
          n_sautes := n_sautes || jsonb_build_object('fusionner_deux_exemplaires', COALESCE((n_sautes ->> 'fusionner_deux_exemplaires')::int, 0) + 1); CONTINUE;
        END IF;
        v_r := inventaire_fusionner_pour(p_user, g.id, f.id, v_par);
        IF NOT COALESCE((v_r ->> 'ok')::boolean, false) THEN
          n_sautes := n_sautes || jsonb_build_object('fusionner_refuse', COALESCE((n_sautes ->> 'fusionner_refuse')::int, 0) + 1); CONTINUE;
        END IF;
        UPDATE inventaire_doublons SET statut = 'fusionnee', decide_le = now(), decide_par = 'rapprochement_v3', fusion_id = (v_r ->> 'fusion_id')::uuid
         WHERE user_id = p_user AND statut = 'proposee' AND least(garde, absorbe) = least(g.id, f.id) AND greatest(garde, absorbe) = greatest(g.id, f.id);
        UPDATE inventaire_doublons SET statut = 'caduque', decide_le = now(), decide_par = 'rapprochement_v3'
         WHERE user_id = p_user AND statut = 'proposee' AND (garde = f.id OR absorbe = f.id) AND motif IS DISTINCT FROM 'copie_non_prouvee';
        INSERT INTO rapprochements (user_id, annonce_id, inventaire_id, decision, par, score, detail)
        VALUES (p_user, NULLIF(d ->> 'annonce', '')::uuid, g.id, 'attache', 'auto', 1,
                COALESCE(d -> 'preuve', '{}'::jsonb) || jsonb_build_object('motif', 'photo_identique', 'regle', 'rapprochement_v3', 'fusion', v_r ->> 'fusion_id', 'absorbe', f.id, 'mode', p_mode)
                || CASE WHEN d ? 'portee' THEN jsonb_build_object('portee', d ->> 'portee') ELSE '{}'::jsonb END);
        n_faits := n_faits || jsonb_build_object('fusionner', COALESCE((n_faits ->> 'fusionner')::int, 0) + 1);

      -- ── GROUPE sans base : un article pour la première, les autres s'y rattachent ──
      ELSIF v_type = 'groupe' THEN
        SELECT COALESCE(array_agg((x)::uuid), ARRAY[]::uuid[]) INTO v_ids FROM jsonb_array_elements_text(d -> 'annonces') x;
        v_fiche := NULL;
        -- un article déjà là (import d'avant) sert de pivot
        SELECT a2.inventaire_id INTO v_fiche FROM annonces_plateforme a2 JOIN inventaire i2 ON i2.id = a2.inventaire_id
         WHERE a2.id = ANY (v_ids) AND a2.user_id = p_user AND i2.fusionne_dans IS NULL ORDER BY i2.created_at LIMIT 1;
        IF v_fiche IS NULL THEN
          FOREACH v_id IN ARRAY v_ids LOOP
            v_fiche := rapprochement_v3_fiche_de(p_user, v_id, p_geste);
            EXIT WHEN v_fiche IS NOT NULL;
          END LOOP;
        END IF;
        IF v_fiche IS NULL THEN n_sautes := n_sautes || jsonb_build_object('groupe_sans_article', COALESCE((n_sautes ->> 'groupe_sans_article')::int, 0) + 1); CONTINUE; END IF;
        n_faits := n_faits || jsonb_build_object('groupe', COALESCE((n_faits ->> 'groupe')::int, 0) + 1);
        FOREACH v_id IN ARRAY v_ids LOOP
          SELECT * INTO a FROM annonces_plateforme WHERE id = v_id AND user_id = p_user;
          IF a.id IS NULL OR a.inventaire_id = v_fiche THEN CONTINUE; END IF;
          IF a.inventaire_id IS NULL THEN
            IF a.ignoree_le IS NULL AND a.disparu_le IS NULL
               AND NOT EXISTS (SELECT 1 FROM annonces_plateforme x WHERE x.inventaire_id = v_fiche AND x.platform = a.platform AND x.disparu_le IS NULL) THEN
              v_job := rapprochement_attacher(a.id, v_fiche, 'photo_identique', COALESCE(d -> 'preuve', '{}'::jsonb) || jsonb_build_object('regle', 'rapprochement_v3', 'groupe_creation', true, 'mode', p_mode));
              IF v_job IS NOT NULL THEN n_faits := n_faits || jsonb_build_object('attacher', COALESCE((n_faits ->> 'attacher')::int, 0) + 1); END IF;
            END IF;
          ELSIF p_mode = 'reparation' THEN
            SELECT * INTO f FROM inventaire WHERE id = a.inventaire_id AND user_id = p_user AND fusionne_dans IS NULL;
            IF f.id IS NOT NULL AND f.origine LIKE 'releve\_%' AND rapprochement_v3_fiche_intacte(f.id)
               AND NOT EXISTS (SELECT 1 FROM annonces_plateforme x JOIN annonces_plateforme y ON y.platform = x.platform
                                WHERE x.inventaire_id = f.id AND y.inventaire_id = v_fiche AND x.disparu_le IS NULL AND y.disparu_le IS NULL) THEN
              v_r := inventaire_fusionner_pour(p_user, v_fiche, f.id, v_par);
              IF COALESCE((v_r ->> 'ok')::boolean, false) THEN
                UPDATE inventaire_doublons SET statut = 'caduque', decide_le = now(), decide_par = 'rapprochement_v3'
                 WHERE user_id = p_user AND statut = 'proposee' AND (garde = f.id OR absorbe = f.id) AND motif IS DISTINCT FROM 'copie_non_prouvee';
                n_faits := n_faits || jsonb_build_object('fusionner', COALESCE((n_faits ->> 'fusionner')::int, 0) + 1);
              END IF;
            END IF;
          END IF;
        END LOOP;

      -- ── À VÉRIFIER : un VRAI article, hors du stock, avec sa question ──────
      ELSIF v_type = 'a_verifier' THEN
        SELECT COALESCE(array_agg((x)::uuid), ARRAY[]::uuid[]) INTO v_ids FROM jsonb_array_elements_text(d -> 'annonces') x;
        v_fiche := NULL; v_premiere := NULL;
        SELECT a2.inventaire_id INTO v_fiche FROM annonces_plateforme a2 JOIN inventaire i2 ON i2.id = a2.inventaire_id
         WHERE a2.id = ANY (v_ids) AND a2.user_id = p_user AND i2.fusionne_dans IS NULL ORDER BY i2.created_at LIMIT 1;
        IF v_fiche IS NULL THEN
          FOREACH v_id IN ARRAY v_ids LOOP
            v_fiche := rapprochement_v3_fiche_de(p_user, v_id, p_geste);
            IF v_fiche IS NOT NULL THEN v_premiere := v_id; EXIT; END IF;
          END LOOP;
        END IF;
        IF v_fiche IS NULL THEN n_sautes := n_sautes || jsonb_build_object('a_verifier_sans_article', COALESCE((n_sautes ->> 'a_verifier_sans_article')::int, 0) + 1); CONTINUE; END IF;
        -- les autres annonces du groupe rejoignent l'article
        FOREACH v_id IN ARRAY v_ids LOOP
          SELECT * INTO a FROM annonces_plateforme WHERE id = v_id AND user_id = p_user;
          IF a.id IS NULL OR a.inventaire_id IS NOT NULL OR a.ignoree_le IS NOT NULL OR a.disparu_le IS NOT NULL THEN CONTINUE; END IF;
          IF NOT EXISTS (SELECT 1 FROM annonces_plateforme x WHERE x.inventaire_id = v_fiche AND x.platform = a.platform AND x.disparu_le IS NULL) THEN
            PERFORM rapprochement_attacher(a.id, v_fiche, 'photo_identique', jsonb_build_object('regle', 'rapprochement_v3', 'groupe_creation', true, 'mode', p_mode));
          END IF;
        END LOOP;
        -- le candidat : un article, ou l'article d'une annonce (créé au besoin)
        v_cand := NULLIF(d #>> '{candidat,fiche}', '')::bigint;
        IF v_cand IS NULL AND NULLIF(d #>> '{candidat,annonce}', '') IS NOT NULL THEN
          v_cand := rapprochement_v3_fiche_de(p_user, (d #>> '{candidat,annonce}')::uuid, p_geste);
        END IF;
        -- la chaîne des fusions : toujours l'article vivant
        WHILE v_cand IS NOT NULL AND (SELECT fusionne_dans FROM inventaire WHERE id = v_cand) IS NOT NULL LOOP
          v_cand := (SELECT fusionne_dans FROM inventaire WHERE id = v_cand);
        END LOOP;
        SELECT * INTO a FROM annonces_plateforme WHERE id = COALESCE(v_premiere, v_ids[1]) AND user_id = p_user;
        v_motif := COALESCE(NULLIF(d ->> 'motif', ''), 'rapprochement');
        v_posee := false;
        IF v_cand IS NOT NULL AND v_cand <> v_fiche THEN
          v_posee := releve_poser_question(p_user, v_cand, v_fiche, v_motif,
                       COALESCE(d -> 'preuves', '{}'::jsonb) || jsonb_build_object('avant_stock', true, 'regle', 'rapprochement_v3', 'annonce_id', a.id,
                                                                                   'platform', a.platform, 'listing_id', a.listing_id, 'url', a.url, 'prix', a.prix, 'titre_annonce', a.titre));
          -- déjà posée (par le moteur du 07/10, le rattrapage) : elle vaut
          IF NOT v_posee AND EXISTS (SELECT 1 FROM inventaire_doublons q WHERE q.user_id = p_user AND q.statut = 'proposee'
                                       AND least(q.garde, q.absorbe) = least(v_cand, v_fiche) AND greatest(q.garde, q.absorbe) = greatest(v_cand, v_fiche)) THEN
            v_posee := true;
          END IF;
        END IF;
        IF v_posee THEN
          PERFORM rapprochement_v3_marquer(p_user, v_fiche, v_motif, v_cand, a.id, a.platform);
          n_faits := n_faits || jsonb_build_object('a_verifier', COALESCE((n_faits ->> 'a_verifier')::int, 0) + 1);
        ELSE
          -- paire déjà tranchée (« non ») ou candidat impossible : un autre article, au stock
          n_faits := n_faits || jsonb_build_object('creer', COALESCE((n_faits ->> 'creer')::int, 0) + 1);
          n_sautes := n_sautes || jsonb_build_object('a_verifier_paire_tranchee', COALESCE((n_sautes ->> 'a_verifier_paire_tranchee')::int, 0) + 1);
        END IF;

      -- ── ANNONCE EN DOUBLE ? (même plateforme, même photo, même titre) ─────
      ELSIF v_type = 'annonce_en_double' THEN
        v_fa := NULLIF(d #>> '{a,fiche}', '')::bigint;
        IF v_fa IS NULL AND NULLIF(d #>> '{a,annonce}', '') IS NOT NULL THEN v_fa := rapprochement_v3_fiche_de(p_user, (d #>> '{a,annonce}')::uuid, p_geste); END IF;
        v_fb := NULLIF(d #>> '{b,fiche}', '')::bigint;
        IF v_fb IS NULL AND NULLIF(d #>> '{b,annonce}', '') IS NOT NULL THEN v_fb := rapprochement_v3_fiche_de(p_user, (d #>> '{b,annonce}')::uuid, p_geste); END IF;
        IF v_fa IS NULL OR v_fb IS NULL OR v_fa = v_fb THEN n_sautes := n_sautes || jsonb_build_object('double_sans_article', COALESCE((n_sautes ->> 'double_sans_article')::int, 0) + 1); CONTINUE; END IF;
        -- garde = le plus ancien ; jamais un article vendu
        SELECT * INTO f FROM inventaire WHERE id = v_fa; SELECT * INTO g FROM inventaire WHERE id = v_fb;
        IF f.statut = 'vendu' OR g.statut = 'vendu' THEN n_sautes := n_sautes || jsonb_build_object('double_vendu', COALESCE((n_sautes ->> 'double_vendu')::int, 0) + 1); CONTINUE; END IF;
        IF g.created_at < f.created_at THEN v_fa := g.id; v_fb := f.id; END IF;
        v_posee := releve_poser_question(p_user, v_fa, v_fb, 'annonce_en_double',
                     COALESCE(d -> 'preuves', '{}'::jsonb) || jsonb_build_object('avant_stock', true, 'regle', 'rapprochement_v3', 'platform', d ->> 'platform'));
        IF v_posee THEN
          PERFORM rapprochement_v3_marquer(p_user, v_fa, 'annonce_en_double', v_fb, NULLIF(d #>> '{a,annonce}', '')::uuid, d ->> 'platform');
          PERFORM rapprochement_v3_marquer(p_user, v_fb, 'annonce_en_double', v_fa, NULLIF(d #>> '{b,annonce}', '')::uuid, d ->> 'platform');
          n_faits := n_faits || jsonb_build_object('annonce_en_double', COALESCE((n_faits ->> 'annonce_en_double')::int, 0) + 1);
        ELSE
          n_sautes := n_sautes || jsonb_build_object('double_paire_tranchee', COALESCE((n_sautes ->> 'double_paire_tranchee')::int, 0) + 1);
        END IF;

      -- ── CRÉER : aucun candidat, l'article entre au stock ─────────────────
      ELSIF v_type = 'creer' THEN
        v_fiche := rapprochement_v3_fiche_de(p_user, (d ->> 'annonce')::uuid, p_geste);
        IF v_fiche IS NULL THEN n_sautes := n_sautes || jsonb_build_object('creer_refuse', COALESCE((n_sautes ->> 'creer_refuse')::int, 0) + 1);
        ELSE n_faits := n_faits || jsonb_build_object('creer', COALESCE((n_faits ->> 'creer')::int, 0) + 1); END IF;

      -- ── ENTRER AU STOCK (réparation) : un marqueur automatique sans raison ─
      ELSIF v_type = 'entrer_stock' THEN
        IF p_mode <> 'reparation' THEN CONTINUE; END IF;
        UPDATE inventaire SET a_verifier = NULL
         WHERE id = (d ->> 'fiche')::bigint AND user_id = p_user AND a_verifier IS NOT NULL
           AND COALESCE(a_verifier ->> 'source', '') IN ('moteur', 'rattrapage_0710', 'rapprochement_v3');
        IF FOUND THEN
          UPDATE inventaire_doublons SET statut = 'caduque', decide_le = now(), decide_par = 'rapprochement_v3'
           WHERE user_id = p_user AND statut = 'proposee' AND decide_par IS NULL AND COALESCE(source, '') = 'releve'
             AND (garde = (d ->> 'fiche')::bigint OR absorbe = (d ->> 'fiche')::bigint) AND motif IS DISTINCT FROM 'copie_non_prouvee';
          n_faits := n_faits || jsonb_build_object('entrer_stock', COALESCE((n_faits ->> 'entrer_stock')::int, 0) + 1);
        END IF;

      -- ── QUESTION CADUQUE (réparation) : une question automatique que v3 ne confirme pas ─
      ELSIF v_type = 'question_caduque' THEN
        IF p_mode <> 'reparation' THEN CONTINUE; END IF;
        UPDATE inventaire_doublons SET statut = 'caduque', decide_le = now(), decide_par = 'rapprochement_v3'
         WHERE id = (d ->> 'id')::uuid AND user_id = p_user AND statut = 'proposee' AND decide_par IS NULL
           AND COALESCE(source, '') = 'releve' AND motif IS DISTINCT FROM 'copie_non_prouvee';
        IF FOUND THEN n_faits := n_faits || jsonb_build_object('question_caduque', COALESCE((n_faits ->> 'question_caduque')::int, 0) + 1); END IF;

      -- ── IGNORER : un relevé non probant (hors liste, eBay hors compte) ──
      ELSIF v_type = 'ignorer' THEN
        UPDATE annonces_plateforme SET ignoree_le = now(), updated_at = now()
         WHERE id = (d ->> 'annonce')::uuid AND user_id = p_user AND inventaire_id IS NULL AND ignoree_le IS NULL;
        IF FOUND THEN
          INSERT INTO rapprochements (user_id, annonce_id, decision, par, score, detail)
          VALUES (p_user, (d ->> 'annonce')::uuid, 'ignore', 'auto', 0, jsonb_build_object('motif', COALESCE(d ->> 'motif', 'releve_non_probant'), 'regle', 'rapprochement_v3'));
          n_faits := n_faits || jsonb_build_object('ignorer', COALESCE((n_faits ->> 'ignorer')::int, 0) + 1);
        END IF;
      -- ── (08/10 soir) FICHE CRÉÉE À LA MAIN FACE À UNE FICHE VINTED ────────
      -- garde = la fiche de la personne, absorbe = la fiche Vinted. « fusionner_fiche » :
      -- photo ET titre, aucun concurrent (le moteur) ; la base fond la fiche
      -- Vinted dans celle de la personne si rien ne s'y oppose
      -- (rapprochement_v3_fiches_fusionnables), sinon la question. « fiche_a_verifier » :
      -- un doute, toujours la question. La fiche Vinted sort du stock le temps
      -- de la réponse (rapprochement_v3_marquer : seulement si personne ne l'a
      -- touchée) ; la fiche de la personne, jamais.
      ELSIF v_type IN ('fusionner_fiche', 'fiche_a_verifier') THEN
        v_fa := NULLIF(d ->> 'garde', '')::bigint;
        v_fb := NULLIF(d ->> 'absorbe', '')::bigint;
        v_motif := rapprochement_v3_fiches_fusionnables(p_user, v_fa, v_fb);
        -- rien : la paire n'existe plus, la personne l'a tranchée, ou ce n'est pas
        -- une fiche à la main face à une fiche Vinted ; un article vendu ou retiré
        IF v_motif IN ('introuvable', 'paire_tranchee', 'main_pas_a_la_main', 'vinted_sans_annonce',
                       'main_pas_en_stock', 'vinted_pas_en_stock', 'vinted_disparue') THEN
          n_sautes := n_sautes || jsonb_build_object(v_type || '_' || v_motif, COALESCE((n_sautes ->> (v_type || '_' || v_motif))::int, 0) + 1);
          CONTINUE;
        END IF;
        IF v_type = 'fusionner_fiche' AND v_motif IS NULL THEN
          v_r := inventaire_fusionner_pour(p_user, v_fa, v_fb, 'utilisateur:photo_rapprochement_v3_main');
          IF COALESCE((v_r ->> 'ok')::boolean, false) THEN
            UPDATE inventaire_doublons SET statut = 'fusionnee', decide_le = now(), decide_par = 'rapprochement_v3', fusion_id = (v_r ->> 'fusion_id')::uuid
             WHERE user_id = p_user AND statut = 'proposee' AND least(garde, absorbe) = least(v_fa, v_fb) AND greatest(garde, absorbe) = greatest(v_fa, v_fb);
            UPDATE inventaire_doublons SET statut = 'caduque', decide_le = now(), decide_par = 'rapprochement_v3'
             WHERE user_id = p_user AND statut = 'proposee' AND (garde = v_fb OR absorbe = v_fb) AND motif IS DISTINCT FROM 'copie_non_prouvee';
            -- (le journal : inventaire_fusions, par = 'utilisateur:photo_rapprochement_v3_main',
            -- propre à cette règle — rapprochements exige une annonce, il n'y en a pas)
            n_faits := n_faits || jsonb_build_object('fusionner_fiche', COALESCE((n_faits ->> 'fusionner_fiche')::int, 0) + 1);
            CONTINUE;
          END IF;
          v_motif := 'fusion_refusee:' || COALESCE(v_r ->> 'reason', '?');
        END IF;
        v_posee := releve_poser_question(p_user, v_fa, v_fb, COALESCE(NULLIF(d ->> 'motif', ''), 'photo_identique'),
                     COALESCE(d -> 'preuves', d -> 'preuve', '{}'::jsonb)
                     || jsonb_build_object('avant_stock', true, 'regle', 'rapprochement_v3', 'portee', 'fiche_main')
                     || CASE WHEN v_motif IS NOT NULL THEN jsonb_build_object('refus_fusion', v_motif) ELSE '{}'::jsonb END);
        IF NOT v_posee AND EXISTS (SELECT 1 FROM inventaire_doublons q WHERE q.user_id = p_user AND q.statut = 'proposee'
                                     AND least(q.garde, q.absorbe) = least(v_fa, v_fb) AND greatest(q.garde, q.absorbe) = greatest(v_fa, v_fb)) THEN
          v_posee := true;
        END IF;
        IF v_posee THEN
          PERFORM rapprochement_v3_marquer(p_user, v_fb, COALESCE(NULLIF(d ->> 'motif', ''), 'photo_identique'), v_fa, NULL::uuid, 'vinted');
          n_faits := n_faits || jsonb_build_object('fiche_a_verifier', COALESCE((n_faits ->> 'fiche_a_verifier')::int, 0) + 1);
          IF v_motif IS NOT NULL AND v_type = 'fusionner_fiche' THEN
            n_sautes := n_sautes || jsonb_build_object('fusionner_fiche_question:' || v_motif, COALESCE((n_sautes ->> ('fusionner_fiche_question:' || v_motif))::int, 0) + 1);
          END IF;
        ELSE
          n_sautes := n_sautes || jsonb_build_object(v_type || '_paire_tranchee', COALESCE((n_sautes ->> (v_type || '_paire_tranchee'))::int, 0) + 1);
        END IF;

      -- ── (08/10 soir, Bebertdeals) LA REMISE EN LIGNE VINTED ─────────────────
      -- garde = la fiche la plus ancienne (annonce Vinted morte : dépôts, copies,
      -- prix d'achat), absorbe = la fiche née de la nouvelle annonce, chaine = les
      -- fiches intermédiaires (annonces mortes). « remise_en_ligne » : la base
      -- vérifie (rapprochement_v3_remise_possible), fond la nouvelle dans la
      -- gardée (l'identité Vinted vivante passe à la gardée : échange journalisé,
      -- réversible), puis les maillons ; les jobs Vinted des annonces mortes sont
      -- clos « remplacée, pas une vente ». Ce qui demande la personne devient la
      -- question. « remise_en_ligne_a_verifier » : toujours la question, rien caché.
      ELSIF v_type IN ('remise_en_ligne', 'remise_en_ligne_a_verifier') THEN
        v_fa := NULLIF(d ->> 'garde', '')::bigint;
        v_fb := NULLIF(d ->> 'absorbe', '')::bigint;
        v_motif := rapprochement_v3_remise_possible(p_user, v_fa, v_fb);
        IF v_motif IN ('introuvable', 'paire_tranchee', 'pas_vinted', 'boutiques_differentes', 'ancienne_vendue')
           OR (v_type = 'remise_en_ligne' AND v_motif IN ('nouvelle_pas_en_ligne', 'pas_une_remise_en_ligne')) THEN
          n_sautes := n_sautes || jsonb_build_object(v_type || '_' || v_motif, COALESCE((n_sautes ->> (v_type || '_' || v_motif))::int, 0) + 1);
          CONTINUE;
        END IF;
        IF v_type = 'remise_en_ligne' AND v_motif IS NULL THEN
          SELECT btrim(vinted_item_id) INTO v_mort FROM inventaire WHERE id = v_fa;
          SELECT btrim(vinted_item_id) INTO v_vivante FROM inventaire WHERE id = v_fb;
          v_r := inventaire_fusionner_pour(p_user, v_fa, v_fb, 'utilisateur:photo_rapprochement_v3_remise');
          IF COALESCE((v_r ->> 'ok')::boolean, false) THEN
            v_morts := ARRAY[v_mort]; v_absorbes := ARRAY[v_fb];
            FOR v_maillon IN SELECT (x #>> '{}')::bigint FROM jsonb_array_elements(CASE WHEN jsonb_typeof(d -> 'chaine') = 'array' THEN d -> 'chaine' ELSE '[]'::jsonb END) x LOOP
              v_motif_maillon := rapprochement_v3_remise_maillon(p_user, v_fa, v_maillon);
              IF v_motif_maillon IS NULL THEN
                SELECT btrim(vinted_item_id) INTO v_mort FROM inventaire WHERE id = v_maillon;
                v_r2 := inventaire_fusionner_pour(p_user, v_fa, v_maillon, 'utilisateur:photo_rapprochement_v3_remise');
                IF COALESCE((v_r2 ->> 'ok')::boolean, false) THEN
                  v_morts := v_morts || v_mort; v_absorbes := v_absorbes || v_maillon;
                  n_faits := n_faits || jsonb_build_object('remise_en_ligne_maillon', COALESCE((n_faits ->> 'remise_en_ligne_maillon')::int, 0) + 1);
                ELSE
                  v_motif_maillon := 'fusion_refusee:' || COALESCE(v_r2 ->> 'reason', '?');
                END IF;
              END IF;
              IF v_motif_maillon IS NOT NULL THEN
                n_sautes := n_sautes || jsonb_build_object('remise_en_ligne_maillon_' || v_motif_maillon, COALESCE((n_sautes ->> ('remise_en_ligne_maillon_' || v_motif_maillon))::int, 0) + 1);
              END IF;
            END LOOP;
            -- les jobs Vinted des annonces mortes, sur la gardée : clos, ce n'est pas une vente
            UPDATE cross_post_jobs
               SET status = 'cancelled',
                   error = 'Annonce Vinted remplacée par une remise en ligne (annonce ' || v_vivante || ') — pas une vente',
                   platform_fields = COALESCE(platform_fields, '{}'::jsonb) || jsonb_build_object('remplacee_par', jsonb_build_object(
                     'vinted_item_id', v_vivante, 'le', now(), 'par', 'rapprochement_v3', 'statut_avant', status))
             WHERE user_id = p_user AND inventaire_id = v_fa AND platform = 'vinted' AND action IN ('publish', 'republish')
               AND status = 'published' AND btrim(platform_listing_id) = ANY (v_morts)
               AND (reservation_id IS NULL OR reservation_settled_at IS NOT NULL);
            GET DIAGNOSTICS v_jobs_clos = ROW_COUNT;
            UPDATE inventaire_doublons SET statut = 'caduque', decide_le = now(), decide_par = 'rapprochement_v3'
             WHERE user_id = p_user AND statut = 'proposee' AND (garde = ANY (v_absorbes) OR absorbe = ANY (v_absorbes))
               AND motif IS DISTINCT FROM 'copie_non_prouvee';
            n_faits := n_faits || jsonb_build_object('remise_en_ligne', COALESCE((n_faits ->> 'remise_en_ligne')::int, 0) + 1,
                                                     'remise_en_ligne_jobs_clos', COALESCE((n_faits ->> 'remise_en_ligne_jobs_clos')::int, 0) + v_jobs_clos);
            CONTINUE;
          END IF;
          v_motif := 'fusion_refusee:' || COALESCE(v_r ->> 'reason', '?');
        END IF;
        v_posee := releve_poser_question(p_user, v_fa, v_fb, COALESCE(NULLIF(d ->> 'motif', ''), 'remise_en_ligne'),
                     COALESCE(d -> 'preuves', d -> 'preuve', '{}'::jsonb)
                     || jsonb_build_object('regle', 'rapprochement_v3', 'portee', 'remise_en_ligne')
                     || CASE WHEN v_motif IS NOT NULL THEN jsonb_build_object('refus_fusion', v_motif) ELSE '{}'::jsonb END);
        IF v_posee THEN
          n_faits := n_faits || jsonb_build_object('remise_en_ligne_a_verifier', COALESCE((n_faits ->> 'remise_en_ligne_a_verifier')::int, 0) + 1);
          IF v_motif IS NOT NULL AND v_type = 'remise_en_ligne' THEN
            n_sautes := n_sautes || jsonb_build_object('remise_en_ligne_question:' || v_motif, COALESCE((n_sautes ->> ('remise_en_ligne_question:' || v_motif))::int, 0) + 1);
          END IF;
        ELSE
          n_sautes := n_sautes || jsonb_build_object(v_type || '_paire_tranchee', COALESCE((n_sautes ->> (v_type || '_paire_tranchee'))::int, 0) + 1);
        END IF;

      ELSE
        n_sautes := n_sautes || jsonb_build_object('type_inconnu', COALESCE((n_sautes ->> 'type_inconnu')::int, 0) + 1);
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_erreurs := v_erreurs || jsonb_build_array(jsonb_build_object('type', v_type, 'decision', d - 'preuves' - 'preuve', 'erreur', left(SQLERRM, 300)));
    END;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'faits', n_faits, 'sautes', n_sautes, 'erreurs', v_erreurs,
                            'ms', round(extract(epoch FROM clock_timestamp() - t0) * 1000));
END;
$function$;

-- ── 7. La vente : la garde de la remise en ligne ────────────────────────────
CREATE OR REPLACE FUNCTION public.enregistrer_vente_atomique(p_user uuid, p_cle text, p_inventaire bigint DEFAULT NULL::bigint, p_job uuid DEFAULT NULL::uuid, p_prix numeric DEFAULT NULL::numeric, p_frais numeric DEFAULT 0, p_quantite integer DEFAULT 1, p_quantite_attendue integer DEFAULT NULL::integer, p_plateforme text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
 SET lock_timeout TO '1500ms'
 SET statement_timeout TO '5s'
AS $function$
DECLARE
 j cross_post_jobs%ROWTYPE; i inventaire%ROWTYPE; copie record;
 v_inv bigint:=p_inventaire; v_cle text; precedent jsonb; v_resultat jsonb;
 v_prix numeric; v_pa numeric; v_benef numeric; v_pct numeric; v_frais numeric:=coalesce(p_frais,0);
 v_pf text:=p_plateforme; v_code text; v_libelle text; v_q integer:=coalesce(p_quantite,1); v_restant integer;
 v_vente bigint; v_ids bigint[]:='{}'; v_historique bigint; v_n integer;
 v_retraits integer:=0; v_annules integer:=0; v_proof boolean:=false;
 v_snap record; v_succ record;
 v_none jsonb:=jsonb_build_object('ok',false,'venteCreated',false,'inventaireUpdated',false,
  'siblingsCancelled',0,'pendingRemoval',0,'retraitsArmes',0,'emailSent',false,'venteNotee',false);
BEGIN
 IF p_user IS NULL OR (auth.uid() IS NOT NULL AND auth.uid()<>p_user) THEN
  RAISE EXCEPTION 'Compte non autorisé' USING ERRCODE='42501'; END IF;
 IF p_job IS NOT NULL THEN
  SELECT * INTO j FROM cross_post_jobs WHERE id=p_job AND user_id=p_user;
  IF j.id IS NULL OR coalesce(j.action,'publish') NOT IN ('publish','republish') THEN
   RETURN v_none||jsonb_build_object('reason','Annonce introuvable pour cette vente.'); END IF;
  v_inv:=j.inventaire_id;
  v_cle:=CASE WHEN nullif(btrim(j.platform_listing_id),'') IS NOT NULL
    THEN 'annonce:'||j.platform||':'||btrim(j.platform_listing_id) ELSE 'job:'||j.id::text END;
  v_q:=1;
 ELSE
  IF nullif(btrim(p_cle),'') IS NULL OR length(p_cle)>150 OR v_inv IS NULL THEN
   RETURN v_none||jsonb_build_object('reason','La référence de cette confirmation de vente manque.'); END IF;
  v_cle:='manuel:'||p_cle;
 END IF;
 -- Tous les chemins prennent d'abord le verrou de la fiche, puis des jobs.
 -- Deux plateformes de la même fiche ne peuvent pas consommer en parallèle.
 PERFORM pg_advisory_xact_lock(hashtextextended(p_user::text||':'||coalesce(v_inv::text,v_cle),0));
 SELECT o.resultat INTO precedent FROM ventes_operations o WHERE o.user_id=p_user AND o.cle=v_cle;
 IF FOUND THEN RETURN precedent||jsonb_build_object('rejouee',true,'venteCreated',false,'inventaireUpdated',false); END IF;
 IF v_inv IS NOT NULL THEN
  SELECT * INTO i FROM inventaire WHERE id=v_inv AND user_id=p_user FOR UPDATE;
  IF i.id IS NULL OR i.fusionne_dans IS NOT NULL THEN
   RETURN v_none||jsonb_build_object('reason','La fiche de cet exemplaire doit être confirmée avant d’enregistrer la vente.'); END IF;
 END IF;
 IF p_job IS NOT NULL THEN
  SELECT * INTO j FROM cross_post_jobs WHERE id=p_job AND user_id=p_user FOR UPDATE;
  IF j.inventaire_id IS DISTINCT FROM v_inv THEN RAISE EXCEPTION 'La fiche a changé ; réessaie.'; END IF;
  IF nullif(j.platform_fields->>'vente_operation_cle','') IS NOT NULL THEN
   SELECT o.resultat INTO precedent FROM ventes_operations o
    WHERE o.user_id=p_user AND o.cle=j.platform_fields->>'vente_operation_cle';
   IF FOUND THEN RETURN precedent||jsonb_build_object('rejouee',true,'venteCreated',false,'inventaireUpdated',false); END IF;
  END IF;
  IF j.status='sold' THEN
   -- Ancienne vente sans reçu : ne jamais reconsommer ni inventer son lien.
   RETURN v_none||jsonb_build_object('reason','Cette ancienne vente doit être vérifiée dans tes ventes avant toute nouvelle confirmation. Aucun stock n’a été recompté.'); END IF;
  IF j.status<>'published' THEN RETURN v_none||jsonb_build_object('reason','Cette annonce n’est plus à confirmer comme vendue.'); END IF;
  -- (08/10, Louis) VINTED : une annonce que la synchro du dressing a revue EN
  -- LIGNE après son signal n'est pas vendue ; une annonce remplacée par une
  -- autre annonce EN LIGNE de la même fiche non plus (« Vendue ? » sur une
  -- copie disparue : 14 ventes déclarées le 06/10, 4 annonces toujours en ligne).
  IF j.platform='vinted' AND nullif(btrim(j.platform_listing_id),'') IS NOT NULL THEN
   SELECT s.status, s.captured_at INTO v_snap FROM vinted_listing_snapshots s
    WHERE s.user_id=p_user AND s.vinted_item_id=btrim(j.platform_listing_id) ORDER BY s.captured_at DESC LIMIT 1;
   IF v_snap.status='active' AND (v_snap.captured_at>=coalesce(_ts_ou_null(j.platform_fields->>'unavailable_since'),j.published_at,j.created_at)
      -- (08/10) ou relevé de la MÊME synchro du dressing que le signal (horodaté juste avant lui)
      OR EXISTS(SELECT 1 FROM vinted_sync_runs r WHERE r.user_id=p_user AND r.kind='dressing'
        AND r.started_at<=LEAST(v_snap.captured_at,_ts_ou_null(j.platform_fields->>'unavailable_since'))
        AND coalesce(r.finished_at,now())>=GREATEST(v_snap.captured_at,_ts_ou_null(j.platform_fields->>'unavailable_since')))) THEN
    RETURN v_none||jsonb_build_object('reason','Cette annonce est toujours en ligne sur Vinted (relevé du dressing du '
      ||to_char(v_snap.captured_at AT TIME ZONE 'Europe/Paris','DD/MM à HH24:MI')||') : aucune vente n’est enregistrée.');
   END IF;
   IF coalesce(j.platform_fields->>'sale_signal','')<>'sold' AND i.id IS NOT NULL
      AND nullif(btrim(i.vinted_item_id),'') IS NOT NULL AND btrim(i.vinted_item_id)<>btrim(j.platform_listing_id)
      AND coalesce(i.vinted_status,'')='active' AND i.disparu_le IS NULL
      AND EXISTS(SELECT 1 FROM vinted_listing_snapshots s WHERE s.user_id=p_user AND s.vinted_item_id=btrim(i.vinted_item_id)
                  AND s.status='active' AND s.captured_at>now()-interval '26 hours') THEN
    RETURN v_none||jsonb_build_object('reason','Cet article est en ligne sur Vinted sous une autre annonce ('||btrim(i.vinted_item_id)
      ||') : celle-ci a été remplacée, ce n’est pas une vente.');
   END IF;
  END IF;
  IF NOT retrait_job_prouve(j.id) OR (v_inv IS NOT NULL AND fiche_annonces_vivantes(v_inv,j.platform)>1) THEN
   RETURN v_none||jsonb_build_object('reason','Plusieurs exemplaires sont possibles. Confirme la fiche de cette annonce avant d’enregistrer sa vente.'); END IF;
  v_proof:=coalesce(j.platform_fields->>'sale_signal','')='sold';
  IF NOT v_proof AND j.platform='vinted' AND nullif(j.platform_listing_id,'') IS NOT NULL THEN
   SELECT s.status='sold' INTO v_proof FROM vinted_listing_snapshots s
    WHERE s.user_id=p_user AND s.vinted_item_id=j.platform_listing_id ORDER BY s.captured_at DESC LIMIT 1;
  END IF;
  -- (08/10 soir, Bebertdeals) VINTED, SANS PREUVE DE VENTE : une annonce que la
  -- personne a REMISE EN LIGNE (une autre fiche de la même boutique, même titre,
  -- annonce apparue après la dernière vue de celle-ci, vue en ligne ces 72 h) n'est
  -- pas vendue — « Plus en ligne — Vendue ? » posée sur l'ancienne annonce
  -- enregistrait la vente sur la mauvaise fiche et retirait ses copies pendant que
  -- l'article restait en vente sous la nouvelle. La vente, si elle a eu lieu, se
  -- déclare depuis la fiche en ligne. Une preuve « sold » n'est jamais retenue ici.
  -- Drapeau coin_config vente_garde_remise_en_ligne : 0 = coupée ; ligne absente = armée.
  IF NOT coalesce(v_proof,false) AND j.platform='vinted' AND nullif(btrim(j.platform_listing_id),'') IS NOT NULL
     AND COALESCE((SELECT c.value FROM coin_config c WHERE c.key='vente_garde_remise_en_ligne'),1)<>0 THEN
   SELECT n.id, n.vinted_item_id, s.le INTO v_succ
     FROM inventaire n
     CROSS JOIN LATERAL (SELECT max(x.captured_at) le FROM vinted_listing_snapshots x
                          WHERE x.user_id=p_user AND x.vinted_item_id=btrim(n.vinted_item_id) AND x.status='active') s
    WHERE n.user_id=p_user AND n.id IS DISTINCT FROM v_inv AND n.fusionne_dans IS NULL AND n.statut='stock'
      AND nullif(btrim(n.vinted_item_id),'') IS NOT NULL AND btrim(n.vinted_item_id)<>btrim(j.platform_listing_id)
      AND coalesce(n.vinted_status,'')='active' AND n.disparu_le IS NULL
      AND coalesce(n.vinted_account_id,'')=coalesce(i.vinted_account_id,n.vinted_account_id,'')
      AND length(titre_norm(n.titre))>=6 AND titre_norm(n.titre) IN (titre_norm(i.titre),titre_norm(j.title))
      AND n.first_seen_at>coalesce((SELECT max(x.captured_at) FROM vinted_listing_snapshots x
                                     WHERE x.user_id=p_user AND x.vinted_item_id=btrim(j.platform_listing_id) AND x.status='active'),
                                    j.published_at,j.created_at)
      AND s.le>now()-interval '72 hours'
    ORDER BY s.le DESC LIMIT 1;
   IF v_succ.id IS NOT NULL THEN
    RETURN v_none||jsonb_build_object('code','remise_en_ligne','successeur',v_succ.id::text,
      'reason','Cet article est de nouveau en ligne sur Vinted sous une autre annonce (n° '||btrim(v_succ.vinted_item_id)
      ||', vue le '||to_char(v_succ.le AT TIME ZONE 'Europe/Paris','DD/MM à HH24:MI')
      ||') : l’ancienne annonce a été remplacée, ce n’est pas une vente. Si l’article est vendu, enregistre la vente depuis sa fiche en ligne.');
   END IF;
  END IF;
  v_pf:=CASE WHEN coalesce(v_proof,false) THEN j.platform ELSE 'ailleurs' END;
  v_prix:=coalesce(p_prix,j.price); v_frais:=0;
 ELSE
  v_prix:=p_prix;
 END IF;
 -- (02/10 soir, point 8) La plateforme de la vente se compare par son CODE
 -- (« vinted »), jamais par son libellé (« Vinted ») : l'annonce de la
 -- plateforme vendue n'était jamais passée « vendue », et les ventes n'avaient
 -- pas de plateforme_code. Le libellé reste celui de l'écran.
 v_code:=coalesce(plateforme_normalisee(v_pf),'ailleurs');
 IF v_code='autre' THEN v_code:='ailleurs'; END IF;
 v_libelle:=CASE WHEN p_job IS NOT NULL OR v_pf IS NULL OR v_pf=v_code THEN
   CASE v_code WHEN 'vinted' THEN 'Vinted' WHEN 'ebay' THEN 'eBay' WHEN 'leboncoin' THEN 'Leboncoin'
     WHEN 'beebs' THEN 'Beebs' WHEN 'opla' THEN 'Opla' ELSE 'Ailleurs' END ELSE v_pf END;
 IF v_prix IS NULL OR v_prix<=0 OR v_prix::text IN ('NaN','Infinity','-Infinity') OR v_frais<0 OR v_frais::text IN ('NaN','Infinity','-Infinity')
    OR v_q<1 OR v_q>1000 THEN RETURN v_none||jsonb_build_object('reason','Vérifie le prix, les frais et la quantité vendue.'); END IF;
 IF v_inv IS NOT NULL THEN
  IF i.statut='vendu' OR coalesce(i.quantite,1)<v_q THEN
   RETURN v_none||jsonb_build_object('reason','Ce stock a déjà été vendu ou modifié. Actualise-le avant de confirmer.'); END IF;
  IF p_job IS NULL AND (p_quantite_attendue IS NULL OR coalesce(i.quantite,1) IS DISTINCT FROM p_quantite_attendue) THEN
   RETURN v_none||jsonb_build_object('reason','La quantité en stock a changé. Actualise-la avant de confirmer la vente.'); END IF;
  -- Une vente historique potentiellement identique n'est jamais recomptée.
  -- Les ventes des opérations précédentes sont distinguées par leur reçu.
  IF EXISTS(SELECT 1 FROM ventes v WHERE v.user_id=p_user AND v.inventaire_id=v_inv
    AND (p_job IS NULL OR v.created_at>=coalesce(j.published_at,j.created_at))
    AND NOT EXISTS(SELECT 1 FROM ventes_operations o WHERE o.user_id=p_user AND o.inventaire_id=v_inv
      AND o.resultat->'ventes_ids' @> to_jsonb(ARRAY[v.id])) LIMIT 1) THEN
   RETURN v_none||jsonb_build_object('reason','Une vente est déjà liée à cette fiche. Vérifie-la dans tes ventes pour éviter de la compter deux fois.'); END IF;
  v_pa:=CASE WHEN i.prix_achat_inconnu THEN NULL ELSE i.prix_achat END;
  v_benef:=CASE WHEN v_pa IS NOT NULL THEN v_prix-v_pa-coalesce(i.purchase_costs,0)-v_frais END;
  v_pct:=v_benef/v_prix*100; v_restant:=coalesce(i.quantite,1)-v_q;
 END IF;
 -- Le reçu et toutes les écritures suivantes disparaissent ensemble en cas d'erreur.
 INSERT INTO ventes_operations(user_id,cle,inventaire_id,job_id,resultat) VALUES(p_user,v_cle,v_inv,p_job,'{}');
 IF p_job IS NOT NULL THEN
  UPDATE cross_post_jobs SET status='sold',sold_at=now(),last_checked_at=now(),
   platform_fields=coalesce(platform_fields,'{}')||jsonb_build_object('vente_operation_cle',v_cle)
   WHERE id=j.id;
 END IF;
 FOR v_n IN 1..v_q LOOP
  INSERT INTO ventes(user_id,inventaire_id,titre,prix_achat,prix_vente,benefice,marque,type,description,
    emplacement,date,plateforme,plateforme_code,annonce_id,quantite,statut,selling_fees)
   VALUES(p_user,v_inv,coalesce(j.title,i.titre),v_pa,v_prix,v_benef,i.marque,i.type,i.description,
    i.emplacement,(now() AT TIME ZONE 'Europe/Paris')::date,v_libelle,v_code,
    CASE WHEN p_job IS NOT NULL THEN nullif(btrim(j.platform_listing_id),'') END,1,'vendu',v_frais) RETURNING id INTO v_vente;
  v_ids:=array_append(v_ids,v_vente);
 END LOOP;
 IF v_inv IS NOT NULL THEN
  IF v_restant>0 THEN
   UPDATE inventaire SET quantite=v_restant WHERE id=v_inv;
   LOOP
    v_historique:=(extract(epoch FROM clock_timestamp())*1000)::bigint+(random()*9999)::int;
    EXIT WHEN NOT EXISTS(SELECT 1 FROM inventaire WHERE id=v_historique);
   END LOOP;
   INSERT INTO inventaire(id,user_id,titre,prix_achat,prix_achat_inconnu,purchase_costs,prix_vente,margin,margin_pct,
    selling_fees,statut,quantite,marque,type,description,emplacement,plateforme,date)
   VALUES(v_historique,p_user,i.titre,v_pa,v_pa IS NULL,0,v_prix,v_benef,v_pct,v_frais,'vendu',v_q,
    i.marque,i.type,i.description,i.emplacement,v_libelle,to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"'));
  ELSE
   UPDATE inventaire SET quantite=CASE WHEN p_job IS NULL THEN v_q ELSE 0 END,
    statut='vendu',prix_vente=v_prix,margin=v_benef,margin_pct=v_pct,
    selling_fees=v_frais,plateforme=v_libelle,date=to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"') WHERE id=v_inv;
  END IF;
  FOR copie IN SELECT c.id,c.status,c.platform FROM cross_post_jobs c
    WHERE c.user_id=p_user AND c.inventaire_id=v_inv AND c.id IS DISTINCT FROM p_job
      AND c.action IN ('publish','republish') AND c.status IN ('pending','processing','needs_user','published')
      AND (p_job IS NULL OR c.platform IS DISTINCT FROM j.platform)
      -- Une vente partielle ne clôt que l'annonce explicitement vendue.
      -- Les autres annonces gardent leur stock et leur propre futur reçu.
      AND (v_restant=0 OR (p_job IS NULL AND c.platform=v_code AND c.status='published'))
      AND retrait_job_prouve(c.id) AND fiche_annonces_vivantes(v_inv,c.platform)<2
    ORDER BY c.id LIMIT 25 FOR UPDATE OF c
  LOOP
   UPDATE cross_post_jobs SET platform_fields=coalesce(platform_fields,'{}')||jsonb_build_object('vente_operation_cle',v_cle) WHERE id=copie.id;
   IF p_job IS NULL AND copie.platform=v_code AND copie.status='published' THEN
    -- La personne a nommé la plateforme de cette vente. La seule annonce
    -- prouvée de cet exemplaire y est soldée, jamais retirée.
    UPDATE cross_post_jobs SET status='sold',sold_at=now() WHERE id=copie.id;
   ELSIF copie.status='published' THEN
    IF armer_retrait_job(copie.id,'vente_copie_prouvee','0 seconds') IS NOT NULL THEN v_retraits:=v_retraits+1; END IF;
   ELSE
    UPDATE cross_post_jobs SET status='cancelled',error='Cet exemplaire a été vendu ; cette publication est arrêtée.' WHERE id=copie.id;
    v_annules:=v_annules+1;
   END IF;
  END LOOP;
 END IF;
 IF p_job IS NOT NULL THEN
  INSERT INTO usage_logs(user_id,feature,metadata) VALUES(p_user,'vente_a_annoncer',
   jsonb_build_object('job_id',j.id,'inventaire_id',v_inv::text,'plateforme',v_code,'plateforme_annonce',j.platform,
    'titre',coalesce(j.title,i.titre),'prix_vente',v_prix,'benefice',v_benef,'retraits_a_cliquer',0,
    'retrait_beebs_auto',v_retraits,'vendu_le',now()));
 END IF;
 v_resultat:=v_none||jsonb_build_object('ok',true,'venteCreated',true,'inventaireUpdated',v_inv IS NOT NULL,
  'siblingsCancelled',v_annules,'retraitsArmes',v_retraits,'venteNotee',p_job IS NOT NULL,
  'ventes_ids',to_jsonb(v_ids),'restant',v_restant,'rejouee',false);
 UPDATE ventes_operations SET resultat=v_resultat WHERE user_id=p_user AND cle=v_cle;
 RETURN v_resultat;
END;
$function$;

COMMIT;
