-- (05/11 soir, point 3 e, décision 1 de Nico : « les "manuel" venus de fusions automatiques : réétiqueter "auto:" par
-- SCRIPT, sauvegarde + inverse ») RÉÉTIQUETAGE DES TRACES DE « GESTE » LAISSÉES PAR LES CHEMINS AUTOMATIQUES.
-- ⛔ À LANCER APRÈS la migration 20261105190000_rattachement_regles (garde ci-dessous) : avant elle, chaque fusion du
--    moteur v3 signe encore « utilisateur:… » et repose « manuel » — le script courrait derrière.
-- Constat : jusqu'à la migration, TOUTE fusion passée par inventaire_fusionner_pour posait annonces_plateforme.
-- source_rapprochement = 'manuel' sur les annonces déplacées, et le moteur v3 (rapprochement_v3_appliquer) signait ses
-- fusions AUTOMATIQUES « utilisateur:photo_rapprochement_v3[_main|_remise] ». « manuel » est lu comme la décision de la
-- personne (moteur : _shared/rapprochement/moteur.js forcesDe « oui_utilisateur », autoDecidee ; beebs-lien : preuve
-- d'un dépôt Beebs sans numéro). Relu en prod le 05/11 (lecture seule) : 1 687 annonces « manuel » déplacées par au
-- moins une fusion qui n'est pas un geste de la personne.
-- RÈGLE (jamais un compte nommé), deux étiquettes, exactement celles que la migration pose désormais :
--   1. inventaire_fusions.par : 'utilisateur:photo_rapprochement_v3'        → 'auto:photo_rapprochement_v3 (photo_identique)'
--                               'utilisateur:photo_rapprochement_v3_main'   → 'auto:photo_rapprochement_v3_main (photo_identique)'
--                               'utilisateur:photo_rapprochement_v3_remise' → 'auto:photo_rapprochement_v3_remise (photo_identique)'
--      (seul rapprochement_v3_appliquer écrit ces trois marques : toutes automatiques). retrait_job_prouve
--      (« …photo_identique) ») et rattachement_confirme (« utilisateur:photo_… » ET « …(photo_identique) ») les tiennent
--      pour preuve avant comme après : aucun retrait, aucune vente, aucune question ne change de chemin.
--   2. annonces_plateforme.source_rapprochement 'manuel' → la source d'AVANT la fusion automatique (ce que la migration
--      fait désormais : « une fusion automatique laisse la source d'avant » ; la colonne n'admet que job / manuel /
--      automatique) : 'job' si l'annonce était liée par identifiant (dernier rapprochement attache/import avant la 1re
--      fusion fait par 'job', ou dépôt FillSell sans rattachement), sinon 'automatique'. SEULEMENT si :
--        · l'annonce figure dans deplacements.annonces_plateforme d'au moins une fusion, et TOUTES ces fusions sont
--          automatiques et actives : les trois marques v3, 'utilisateur:photo_rattrapage_0710', 'utilisateur:photo_auto',
--          'ia (doublon proposé)', 'recensement 25/09 : …', 'auto (doublon certain : …)' ;
--        · JAMAIS si une fusion de la personne l'a déplacée ('utilisateur', 'utilisateur (doublon proposé)' = son « Oui »),
--          ni une décision de Nico ('utilisateur:photo_go_nico_…'), ni le support ('support (…)'), ni une fusion défaite ;
--        · elle est encore sur la fiche gardée par la DERNIÈRE de ces fusions (rien ne l'a déplacée depuis) ;
--        · aucune décision de la personne sur cette annonce (rapprochements.par 'utilisateur…', quelle que soit la
--          décision) ; son dépôt ne porte pas « Oui, la retirer » (rattachement.par = 'utilisateur').
--      Relu le 05/11 soir : 1 619 annonces sur 65 comptes (1 617 → automatique, 2 → job) ; écartées 68 : 29 aussi
--      déplacées par une fusion de la personne, 16 par une décision de Nico, 7 par le support, 14 déplacées depuis,
--      2 avec une décision de la personne. Fusions : 2 394 sur 81 comptes.
-- Effet, migration appliquée : retraits de copie et questions « Déjà vendu ? » INCHANGÉS (0 copie ne change de chemin :
-- les deux marques sont des preuves « photo identique ») ; le moteur ne tient plus ces 1 619 annonces pour une décision
-- de la personne (1 259 vivantes : en passe normale, seules les 70 rangées sur une fiche d'import peuvent être rejugées,
-- et seulement si une nouvelle fiche Vinted les touche) ; beebs-lien : aucune annonce touchée.
-- Écritures SANS déclencheurs (session_replication_role = replica, SET LOCAL) : annonce_vers_fiche joue sur TOUTE mise
-- à jour d'une annonce rattachée et peut faire suivre le prix de la plateforme à la fiche — un réétiquetage ne doit
-- rien toucher d'autre. updated_at n'est pas touché (aucune relecture déclenchée). Aucune ligne inchangée réécrite :
-- comparer-et-écrire sur la valeur d'avant (et la fiche, pour les annonces). Lots de 250.
-- Les anciens INVERSE du 08/10 (20261008_*_INVERSE.sql) cherchent les fusions par l'ANCIENNE marque : après ce script,
-- y lire la nouvelle (la colonne « apres » de la sauvegarde).
-- Sauvegarde : public._backup_0511_reetiquetage_manuel_auto. Inverse : 20261105_regle_reetiquetage_manuel_auto_INVERSE.sql.
-- Lancement (feu vert de Nico) : npx supabase db query --linked -f scripts/reparations/20261105_regle_reetiquetage_manuel_auto.sql
BEGIN;
SET LOCAL statement_timeout = '120s';
SET LOCAL lock_timeout = '5s';

DO $garde$
BEGIN
  IF to_regprocedure('public.rattachement_confirme(uuid)') IS NULL THEN
    RAISE EXCEPTION 'migration 20261105190000 non appliquée : rien n''est écrit (le moteur signerait encore « utilisateur:… » et poserait « manuel »)';
  END IF;
  IF to_regclass('public._backup_0511_reetiquetage_manuel_auto') IS NOT NULL THEN
    RAISE EXCEPTION 'la sauvegarde _backup_0511_reetiquetage_manuel_auto existe déjà : script déjà passé, rien n''est écrit';
  END IF;
END $garde$;

CREATE TABLE public._backup_0511_reetiquetage_manuel_auto AS
WITH v3 (avant, apres) AS (VALUES
  ('utilisateur:photo_rapprochement_v3',        'auto:photo_rapprochement_v3 (photo_identique)'),
  ('utilisateur:photo_rapprochement_v3_main',   'auto:photo_rapprochement_v3_main (photo_identique)'),
  ('utilisateur:photo_rapprochement_v3_remise', 'auto:photo_rapprochement_v3_remise (photo_identique)')),
mv AS MATERIALIZED (
  -- chaque fusion qui a déplacé chaque annonce (le journal : deplacements.annonces_plateforme)
  SELECT (x)::uuid AS annonce, f.user_id, f.id AS fusion, f.par, f.garde, f.created_at, f.defait_le,
         (f.par IN ('utilisateur:photo_rapprochement_v3', 'utilisateur:photo_rapprochement_v3_main',
                    'utilisateur:photo_rapprochement_v3_remise', 'utilisateur:photo_rattrapage_0710',
                    'utilisateur:photo_auto', 'ia (doublon proposé)')
          OR f.par LIKE 'recensement 25/09 : %' OR f.par LIKE 'auto (doublon certain : %') AS automatique
    FROM public.inventaire_fusions f, jsonb_array_elements_text(f.deplacements -> 'annonces_plateforme') x
   WHERE jsonb_typeof(f.deplacements -> 'annonces_plateforme') = 'array'),
cand AS (
  SELECT a.id, a.user_id, a.platform, a.listing_id, a.inventaire_id, a.job_id,
         (array_agg(mv.garde ORDER BY mv.created_at DESC))[1] AS derniere_garde,
         min(mv.created_at) AS premiere_fusion,
         array_agg(DISTINCT mv.par ORDER BY mv.par) AS marques,
         array_agg(mv.fusion ORDER BY mv.created_at) AS fusions
    FROM public.annonces_plateforme a
    JOIN mv ON mv.annonce = a.id AND mv.user_id = a.user_id
   WHERE a.source_rapprochement = 'manuel'
   GROUP BY a.id
  HAVING bool_and(mv.automatique) AND bool_and(mv.defait_le IS NULL)),
sel AS (
  SELECT c.*,
         j.id AS job_existe, COALESCE(j.platform_fields ->> 'source', '') AS job_source, (j.platform_fields -> 'rattachement') AS job_rattachement,
         (SELECT r.par FROM public.rapprochements r
           WHERE r.annonce_id = c.id AND r.decision IN ('attache', 'import') AND r.created_at < c.premiere_fusion
           ORDER BY r.created_at DESC LIMIT 1) AS rattachement_avant
    FROM cand c LEFT JOIN public.cross_post_jobs j ON j.id = c.job_id
   WHERE c.inventaire_id IS NOT DISTINCT FROM c.derniere_garde
     AND NOT EXISTS (SELECT 1 FROM public.rapprochements r WHERE r.annonce_id = c.id AND r.par LIKE 'utilisateur%')
     AND COALESCE(j.platform_fields #>> '{rattachement,par}', '') <> 'utilisateur'),
lignes AS (
  SELECT 'annonces_plateforme'::text AS t, s.id::text AS cle, s.user_id, s.inventaire_id,
         'manuel'::text AS avant,
         CASE WHEN s.rattachement_avant = 'job'
                OR (s.job_existe IS NOT NULL AND s.job_source <> 'releve' AND s.job_rattachement IS NULL) THEN 'job'
              ELSE 'automatique' END AS apres,
         jsonb_build_object('plateforme', s.platform, 'annonce', s.listing_id, 'marques', to_jsonb(s.marques),
                            'fusions', to_jsonb(s.fusions), 'rattachement_avant', s.rattachement_avant) AS preuve
    FROM sel s
  UNION ALL
  SELECT 'inventaire_fusions', f.id::text, f.user_id, f.garde, f.par, v3.apres,
         jsonb_build_object('garde', f.garde, 'absorbe', f.absorbe, 'le', f.created_at, 'defait_le', f.defait_le)
    FROM public.inventaire_fusions f JOIN v3 ON v3.avant = f.par)
SELECT now() AS le, l.*, ((row_number() OVER (PARTITION BY l.t ORDER BY l.cle)) - 1) / 250 AS lot
  FROM lignes l;
ALTER TABLE public._backup_0511_reetiquetage_manuel_auto ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_0511_reetiquetage_manuel_auto FROM PUBLIC, anon, authenticated;

SET LOCAL session_replication_role = replica;   -- annonce_vers_fiche ne joue pas (voir l'en-tête)
DO $ecrire$
DECLARE
  v_lot integer; v_n integer; n_annonces integer := 0; n_fusions integer := 0;
  v_prevues_a integer; v_prevues_f integer;
BEGIN
  IF current_setting('session_replication_role') <> 'replica' THEN
    RAISE EXCEPTION 'session_replication_role n''est pas « replica » : rien n''est écrit';
  END IF;
  SELECT count(*) FILTER (WHERE t = 'annonces_plateforme'), count(*) FILTER (WHERE t = 'inventaire_fusions')
    INTO v_prevues_a, v_prevues_f FROM public._backup_0511_reetiquetage_manuel_auto;
  -- relu le 05/11 soir : 1 619 annonces, 2 394 fusions ; au-delà, quelque chose a changé : relire avant d'écrire
  IF v_prevues_a > 1800 OR v_prevues_f > 2600 THEN
    RAISE EXCEPTION 'plus que prévu (% annonces, % fusions) : rien n''est écrit, à relire', v_prevues_a, v_prevues_f;
  END IF;

  FOR v_lot IN SELECT DISTINCT lot FROM public._backup_0511_reetiquetage_manuel_auto WHERE t = 'annonces_plateforme' ORDER BY 1 LOOP
    UPDATE public.annonces_plateforme a SET source_rapprochement = b.apres
      FROM public._backup_0511_reetiquetage_manuel_auto b
     WHERE b.t = 'annonces_plateforme' AND b.lot = v_lot
       AND a.id = b.cle::uuid AND a.user_id = b.user_id
       AND a.source_rapprochement = b.avant AND a.inventaire_id IS NOT DISTINCT FROM b.inventaire_id
       AND b.apres IS DISTINCT FROM b.avant;
    GET DIAGNOSTICS v_n = ROW_COUNT; n_annonces := n_annonces + v_n;
  END LOOP;

  FOR v_lot IN SELECT DISTINCT lot FROM public._backup_0511_reetiquetage_manuel_auto WHERE t = 'inventaire_fusions' ORDER BY 1 LOOP
    UPDATE public.inventaire_fusions f SET par = b.apres
      FROM public._backup_0511_reetiquetage_manuel_auto b
     WHERE b.t = 'inventaire_fusions' AND b.lot = v_lot
       AND f.id = b.cle::uuid AND f.user_id = b.user_id AND f.par = b.avant
       AND b.apres IS DISTINCT FROM b.avant;
    GET DIAGNOSTICS v_n = ROW_COUNT; n_fusions := n_fusions + v_n;
  END LOOP;
  RAISE NOTICE 'réétiquetées : % annonces sur % prévues, % fusions sur % prévues', n_annonces, v_prevues_a, n_fusions, v_prevues_f;
END $ecrire$;
SET LOCAL session_replication_role = origin;

-- Comptes d'avant (la sauvegarde) et d'après (la base), en une seule sortie.
SELECT b.t AS table_, b.avant, b.apres, count(*) AS avant_a_reetiqueter, count(DISTINCT b.user_id) AS comptes,
       count(*) FILTER (WHERE COALESCE(a.source_rapprochement, f.par) = b.apres) AS apres_reetiquetees,
       count(*) FILTER (WHERE COALESCE(a.source_rapprochement, f.par) = b.avant) AS apres_inchangees_valeur_d_avant,
       count(*) FILTER (WHERE COALESCE(a.source_rapprochement, f.par) IS DISTINCT FROM b.avant
                          AND COALESCE(a.source_rapprochement, f.par) IS DISTINCT FROM b.apres) AS apres_autre_valeur
  FROM public._backup_0511_reetiquetage_manuel_auto b
  LEFT JOIN public.annonces_plateforme a ON b.t = 'annonces_plateforme' AND a.id = b.cle::uuid
  LEFT JOIN public.inventaire_fusions f ON b.t = 'inventaire_fusions' AND f.id = b.cle::uuid
 GROUP BY 1, 2, 3
UNION ALL
SELECT 'parc : annonces « manuel »', NULL, NULL,
       (SELECT count(*) FROM public._backup_0511_reetiquetage_manuel_auto WHERE t = 'annonces_plateforme')
         + (SELECT count(*) FROM public.annonces_plateforme WHERE source_rapprochement = 'manuel'), NULL,
       (SELECT count(*) FROM public.annonces_plateforme WHERE source_rapprochement = 'manuel'), NULL, NULL
UNION ALL
SELECT 'parc : fusions « utilisateur:photo_rapprochement_v3… »', NULL, NULL,
       (SELECT count(*) FROM public._backup_0511_reetiquetage_manuel_auto WHERE t = 'inventaire_fusions')
         + (SELECT count(*) FROM public.inventaire_fusions WHERE par LIKE 'utilisateur:photo\_rapprochement\_v3%'), NULL,
       (SELECT count(*) FROM public.inventaire_fusions WHERE par LIKE 'utilisateur:photo\_rapprochement\_v3%'), NULL, NULL
 ORDER BY 1, 2, 3;
COMMIT;
