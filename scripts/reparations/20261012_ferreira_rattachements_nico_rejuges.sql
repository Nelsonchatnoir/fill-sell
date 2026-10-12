-- ═══════════════════════════════════════════════════════════════════════════
-- FERREIRASAB (18e461c1) : LES RATTACHEMENTS FAITS À LA MAIN PAR NICO LE 12/10
-- MATIN SONT DÉFAITS POUR ÊTRE REJUGÉS PAR LE MOTEUR RÉPARÉ (v20)
-- ═══════════════════════════════════════════════════════════════════════════
-- Le 12/10 au matin, le moteur mourait à chaque passe sur ce compte (CPU). Nico a
-- rattaché à la main, en se faisant passer pour la personne
-- (rapprochement_decider, request.jwt.claims), donc enregistrés « utilisateur » :
--   · _cand_1210_ferreira   : 463 sur titre ET prix (148 détachés ensuite, _detache_1210_ferreira) ;
--   · _photo_cand_1210      : 60 sur photo principale ;
--   · _jumeaux_1210         : 100 (47 libres, 53 qu'ELLE avait ignorées).
-- Décision de Nico : ce ne sont PAS ses décisions → automatiques, rejugées. Ses
-- propres décisions (≈ 190 « ignorer », 22 rattachements, 1 import, 11:00 → 11:14)
-- restent définitives, SAUF les 53 ignorées rattachées par Nico : le moteur les
-- juge ; celles qu'il ne confirme pas (simulation du 12/10 : 2) reprennent son
-- « ignorer ».
-- Ce script, en UNE transaction :
--   1. sauvegarde (annonces, jobs de suivi, lignes rapprochements) ;
--   2. défait les 475 rattachements encore en place : annonce libre, comme dans
--      _backup_1210_ferreira_annonces (09:10:38, avant Nico) — les 2 « ignorées »
--      non confirmées reprennent leur ignoree_le d'origine ;
--   3. clôt leurs 475 jobs de suivi comme un « detache » (cancelled, pas une
--      vente, pending_removal éteint) ;
--   4. requalifie les 771 lignes rapprochements de Nico (attache 623, detache 148)
--      en « auto » (par_reel = nico_1210 dans detail) et trace le rejugement
--      (une ligne « detache » auto par annonce défaite).
-- Rien n'est retiré, vendu ni notifié ; aucune fiche n'est touchée.
-- Inverse : 20261012_ferreira_rattachements_nico_rejuges_INVERSE.sql.
-- ⚠️ Les deux « ignorées » non confirmées viennent de la simulation du 12/10 (moteur
-- exact, rattachements de Nico défaits) ; le script refuse de tourner si l'état
-- n'est plus celui de la simulation.

BEGIN;

-- 0. Les ensembles de Nico
CREATE TEMP TABLE _nico_1210 ON COMMIT DROP AS
  SELECT annonce_id, inventaire_id, 'cand'::text src FROM _cand_1210_ferreira
   WHERE (resultat ->> 'ok')::boolean AND annonce_id NOT IN (SELECT annonce_id FROM _detache_1210_ferreira WHERE (resultat ->> 'ok')::boolean)
  UNION ALL SELECT annonce_id, inventaire_id, 'photo' FROM _photo_cand_1210 WHERE (resultat ->> 'ok')::boolean
  UNION ALL SELECT annonce_id, fiche, CASE WHEN ignoree THEN 'jumeau_ignoree' ELSE 'jumeau_libre' END FROM _jumeaux_1210 WHERE (resultat ->> 'ok')::boolean;

-- les 2 « ignorées » que le moteur ne confirme pas (simulation du 12/10) : son « ignorer » revient
CREATE TEMP TABLE _nico_1210_non_confirmees (annonce_id uuid PRIMARY KEY) ON COMMIT DROP;
INSERT INTO _nico_1210_non_confirmees VALUES ('3b9fb252-f8b6-4672-bcb1-68188e3c251f'), ('adc11a66-b674-4506-83e7-54515532de74');

DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM _nico_1210 x JOIN annonces_plateforme a ON a.id = x.annonce_id
   WHERE a.user_id = '18e461c1-7107-4f40-b07f-6de8fb5c2948' AND a.inventaire_id = x.inventaire_id AND a.disparu_le IS NULL;
  IF n <> 475 THEN RAISE EXCEPTION 'état changé : % rattachements de Nico encore en place (475 attendus)', n; END IF;
  SELECT count(*) INTO n FROM _nico_1210_non_confirmees c JOIN _nico_1210 x USING (annonce_id) WHERE x.src = 'jumeau_ignoree';
  IF n <> 2 THEN RAISE EXCEPTION 'les non confirmées ne sont pas des « ignorées » de Nico (%)', n; END IF;
END $$;

-- 1. Sauvegardes
CREATE TABLE IF NOT EXISTS _backup_1210_ferreira_rejuge_annonces AS SELECT now() sauve_le, a.* FROM annonces_plateforme a WHERE false;
INSERT INTO _backup_1210_ferreira_rejuge_annonces SELECT now(), a.* FROM annonces_plateforme a WHERE a.id IN (SELECT annonce_id FROM _nico_1210);
CREATE TABLE IF NOT EXISTS _backup_1210_ferreira_rejuge_jobs AS SELECT now() sauve_le, j.* FROM cross_post_jobs j WHERE false;
INSERT INTO _backup_1210_ferreira_rejuge_jobs SELECT now(), j.* FROM cross_post_jobs j
 WHERE j.id IN (SELECT a.job_id FROM annonces_plateforme a WHERE a.id IN (SELECT annonce_id FROM _nico_1210) AND a.job_id IS NOT NULL);
CREATE TABLE IF NOT EXISTS _backup_1210_ferreira_rejuge_rapprochements AS SELECT now() sauve_le, r.* FROM rapprochements r WHERE false;
INSERT INTO _backup_1210_ferreira_rejuge_rapprochements SELECT now(), r.* FROM rapprochements r
 WHERE r.user_id = '18e461c1-7107-4f40-b07f-6de8fb5c2948' AND r.par = 'utilisateur' AND r.decision IN ('attache', 'detache')
   AND r.created_at BETWEEN '2026-10-12 09:10:50+00' AND '2026-10-12 09:27:30+00'
   AND r.annonce_id IN (SELECT annonce_id FROM _cand_1210_ferreira UNION SELECT annonce_id FROM _photo_cand_1210 UNION SELECT annonce_id FROM _jumeaux_1210);

DO $$
BEGIN
  IF (SELECT count(*) FROM _backup_1210_ferreira_rejuge_rapprochements) <> 771 THEN
    RAISE EXCEPTION 'lignes rapprochements de Nico : % (771 attendues : 623 attache, 148 detache)', (SELECT count(*) FROM _backup_1210_ferreira_rejuge_rapprochements);
  END IF;
  IF (SELECT count(*) FROM _backup_1210_ferreira_rejuge_jobs) <> 475 THEN
    RAISE EXCEPTION 'jobs de suivi : % (475 attendus)', (SELECT count(*) FROM _backup_1210_ferreira_rejuge_jobs);
  END IF;
END $$;

-- 2. Les jobs de suivi créés par les rattachements de Nico : clos comme un « detache »
UPDATE cross_post_jobs j
   SET status = 'cancelled',
       error = 'Rattachement fait à la main le 12/10 (support), défait pour être rejugé par le moteur — pas une vente',
       platform_fields = COALESCE(j.platform_fields, '{}'::jsonb) || jsonb_build_object('detache_le', now(), 'rejuge_1210', true, 'pending_removal', false)
 WHERE j.id IN (SELECT a.job_id FROM annonces_plateforme a WHERE a.id IN (SELECT annonce_id FROM _nico_1210) AND a.job_id IS NOT NULL)
   AND j.user_id = '18e461c1-7107-4f40-b07f-6de8fb5c2948'
   AND j.platform_fields ->> 'source' = 'releve' AND j.platform_fields -> 'rattachement' ->> 'par' = 'utilisateur';

-- 3. Les annonces : libres, comme avant Nico (les 2 non confirmées : ignorées, comme avant Nico)
UPDATE annonces_plateforme a
   SET inventaire_id = NULL, job_id = NULL, source_rapprochement = b.source_rapprochement, proposition = b.proposition,
       ignoree_le = CASE WHEN a.id IN (SELECT annonce_id FROM _nico_1210_non_confirmees) THEN b.ignoree_le ELSE NULL END,
       updated_at = now()
  FROM _backup_1210_ferreira_annonces b
 WHERE b.id = a.id AND a.id IN (SELECT annonce_id FROM _nico_1210)
   AND a.user_id = '18e461c1-7107-4f40-b07f-6de8fb5c2948';

-- 4. L'historique : les décisions de Nico ne sont pas celles de la personne
UPDATE rapprochements r
   SET par = 'auto', detail = COALESCE(r.detail, '{}'::jsonb) || jsonb_build_object('par_reel', 'nico_1210', 'requalifie_le', now(), 'motif_requalif', 'decision_manuelle_support_rejugee')
 WHERE r.id IN (SELECT id FROM _backup_1210_ferreira_rejuge_rapprochements);
INSERT INTO rapprochements (user_id, annonce_id, inventaire_id, decision, par, score, detail)
SELECT '18e461c1-7107-4f40-b07f-6de8fb5c2948', x.annonce_id, x.inventaire_id, 'detache', 'auto', 0,
       jsonb_build_object('motif', 'rejuge_1210', 'par_reel', 'support', 'regle', 'rapprochement_v3')
  FROM _nico_1210 x;

DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM annonces_plateforme a WHERE a.id IN (SELECT annonce_id FROM _nico_1210) AND a.inventaire_id IS NOT NULL;
  IF n <> 0 THEN RAISE EXCEPTION '% annonces encore rattachées', n; END IF;
  SELECT count(*) INTO n FROM annonces_plateforme a WHERE a.id IN (SELECT annonce_id FROM _nico_1210_non_confirmees) AND a.ignoree_le IS NULL;
  IF n <> 0 THEN RAISE EXCEPTION '% non confirmées sans leur « ignorer »', n; END IF;
END $$;

COMMIT;
