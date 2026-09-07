-- ═══════════════════════════════════════════════════════════════════════════
-- LES COMPTEURS DISENT ENFIN CE QU'ILS COMPTENT (point B, Nico 07/09 au soir)
-- ═══════════════════════════════════════════════════════════════════════════
-- `v_categorie_par_jour` ne montrait que les PREMIÈRES publications, parce que
-- `categorie_source` n'est posé que sur elles. C'est juste — une republication
-- rejoue la catégorie de sa capture, et rien ne doit la recalculer — mais on
-- pouvait lire ce tableau dans un mois en croyant qu'il décrivait toute
-- l'activité. Sur Vinted, il montrait ~40 lignes là où la journée en compte
-- 780 : un facteur 20.
--
-- ⚠️ CHOIX ASSUMÉ : la voie « capture » est DÉDUITE DANS LA VUE
-- (action='republish'), elle n'est PAS écrite sur les jobs. Deux raisons, la
-- seconde étant décisive :
--   1. écrire un champ sur les jobs de republication toucherait le mécanisme
--      que la consigne interdit de toucher — or ici on ne veut QUE mesurer ;
--   2. une écriture ne couvrirait que les jobs FUTURS. Déduire dans la vue
--      couvre TOUT l'historique : le tableau est juste dès aujourd'hui, pas
--      dans un mois.
-- Rien ne recalcule la catégorie d'une republication, ici ni ailleurs.
--
-- TROIS FAMILLES, et leur somme = l'activité réelle du jour :
--   · calculees        — première publication dont la catégorie a été CALCULÉE
--                        (elle porte categorie_source) ; le détail par voie
--                        suit dans les colonnes suivantes ;
--   · reprises_capture — republication : catégorie REPRISE de la capture ;
--   · non_tracees      — première publication SANS categorie_source. Deux
--                        populations : les jobs créés AVANT le 07/09 (le champ
--                        n'existait pas) et les chemins qui ne calculent aucune
--                        catégorie — au premier rang desquels la SYNC DU
--                        DRESSING, qui enregistre des annonces déjà en ligne.
--                        Les compter à part est ce qui empêche de prendre un
--                        trou de mesure pour un zéro.
--
-- Le jour est toujours un jour de PARIS : un « jour » qui commence à 2 h du
-- matin ne veut rien dire pour un vendeur français.
--
-- (DROP puis CREATE : Postgres refuse de renommer une colonne de vue par
-- CREATE OR REPLACE, et `resolues` devient `jobs`.)
-- ═══════════════════════════════════════════════════════════════════════════
DROP VIEW IF EXISTS public.v_categorie_par_jour;

CREATE VIEW public.v_categorie_par_jour AS
WITH jobs AS (
  SELECT
    (created_at AT TIME ZONE 'Europe/Paris')::date AS jour,
    platform AS plateforme,
    CASE
      WHEN action = 'republish' THEN 'capture'
      WHEN platform_fields->>'categorie_source' IS NULL THEN 'non_tracee'
      ELSE platform_fields->>'categorie_source'
    END AS voie,
    count(*) AS n
  FROM public.cross_post_jobs
  WHERE action IN ('publish', 'republish')
  GROUP BY 1, 2, 3
),
voies AS (
  SELECT jour, plateforme,
    sum(n)                                                        AS jobs,
    sum(n) FILTER (WHERE voie = 'capture')                        AS reprises_capture,
    sum(n) FILTER (WHERE voie = 'non_tracee')                     AS non_tracees,
    sum(n) FILTER (WHERE voie NOT IN ('capture', 'non_tracee'))   AS calculees,
    sum(n) FILTER (WHERE voie = 'famille_livres')                 AS famille_lens,
    sum(n) FILTER (WHERE voie = 'mot_cle')                        AS mot_objet_titre,
    sum(n) FILTER (WHERE voie = 'mot_objet_ia')                   AS mot_ia_regles,
    sum(n) FILTER (WHERE voie = 'mot_objet_arbre')                AS mot_ia_arbre_exact,
    sum(n) FILTER (WHERE voie = 'ia_parmi_candidats')             AS arbitrage_ia,
    sum(n) FILTER (WHERE voie IN ('catalog_vinted','signaux_fiche')) AS garde_fou,
    sum(n) FILTER (WHERE voie IN ('ia','detection','pointure','defaut')) AS emoji_repli
  FROM jobs GROUP BY 1, 2
),
journal AS (
  SELECT
    (created_at AT TIME ZONE 'Europe/Paris')::date AS jour,
    plateforme,
    count(*) FILTER (WHERE etape = 'arbitrage')                        AS arbitrages,
    count(*) FILTER (WHERE etape = 'arbitrage' AND issue = 'choisi')   AS arbitrages_choisi,
    count(*) FILTER (WHERE etape = 'arbitrage' AND issue = 'aucune')   AS arbitrages_aucune,
    count(*) FILTER (WHERE etape = 'arbitrage' AND issue = 'hors_liste') AS arbitrages_hors_liste,
    count(*) FILTER (WHERE etape = 'arbitrage' AND motif LIKE 'liste_fermee:%') AS arbitrages_listes_fermees,
    count(*) FILTER (WHERE etape = 'repli')                            AS replis,
    count(*) FILTER (WHERE etape = 'repli' AND motif = 'suggestion_unique') AS repli_suggestion_unique,
    count(*) FILTER (WHERE etape = 'repli' AND motif = 'pas_de_session')    AS repli_pas_de_session,
    count(*) FILTER (WHERE etape = 'repli' AND motif = 'timeout')           AS repli_timeout,
    count(*) FILTER (WHERE etape = 'repli' AND motif IN ('erreur','ia_indisponible')) AS repli_erreur,
    count(*) FILTER (WHERE etape = 'repli' AND motif = 'aucune')            AS repli_apres_aucune
  FROM public.categorie_journal GROUP BY 1, 2
)
SELECT
  coalesce(v.jour, j.jour)             AS jour,
  coalesce(v.plateforme, j.plateforme) AS plateforme,
  coalesce(v.jobs, 0)                  AS jobs,
  coalesce(v.calculees, 0)             AS calculees,
  coalesce(v.reprises_capture, 0)      AS reprises_capture,
  coalesce(v.non_tracees, 0)           AS non_tracees,
  coalesce(v.famille_lens, 0)          AS famille_lens,
  coalesce(v.mot_objet_titre, 0)       AS mot_objet_titre,
  coalesce(v.mot_ia_regles, 0)         AS mot_ia_regles,
  coalesce(v.mot_ia_arbre_exact, 0)    AS mot_ia_arbre_exact,
  coalesce(v.arbitrage_ia, 0)          AS arbitrage_ia,
  coalesce(v.garde_fou, 0)             AS garde_fou,
  coalesce(v.emoji_repli, 0)           AS emoji_repli,
  coalesce(j.arbitrages, 0)            AS arbitrages,
  coalesce(j.arbitrages_choisi, 0)     AS arbitrages_choisi,
  coalesce(j.arbitrages_aucune, 0)     AS arbitrages_aucune,
  coalesce(j.arbitrages_hors_liste, 0) AS arbitrages_hors_liste,
  coalesce(j.arbitrages_listes_fermees, 0) AS arbitrages_listes_fermees,
  coalesce(j.replis, 0)                AS replis,
  coalesce(j.repli_suggestion_unique, 0) AS repli_suggestion_unique,
  coalesce(j.repli_pas_de_session, 0)  AS repli_pas_de_session,
  coalesce(j.repli_timeout, 0)         AS repli_timeout,
  coalesce(j.repli_erreur, 0)          AS repli_erreur,
  coalesce(j.repli_apres_aucune, 0)    AS repli_apres_aucune
FROM voies v
FULL OUTER JOIN journal j ON j.jour = v.jour AND j.plateforme = v.plateforme;

GRANT SELECT ON public.v_categorie_par_jour TO authenticated;
