-- ═══════════════════════════════════════════════════════════════════════════
-- JOURNAL DE RÉSOLUTION DE CATÉGORIE (point 2, Nico 07/09 soir)
-- ═══════════════════════════════════════════════════════════════════════════
-- « Je veux savoir ce qui se passe vraiment, pas ce qu'on croit. »
--
-- Ce que la base savait déjà dire : la VOIE finale, par
-- `cross_post_jobs.platform_fields->>'categorie_source'` — elle est posée sur
-- les quatre plateformes depuis le 07/09.
-- Ce qu'elle ne savait PAS dire, et qui est le point noir :
--   · combien d'arbitrages rendent « aucune » ;
--   · combien de REPLIS sur la première suggestion, et POURQUOI.
-- Le repli est le point noir parce que la n°1 d'eBay est fausse 4 fois sur 8
-- (mesuré) : chaque repli est une catégorie probablement fausse.
--
-- Ce journal est de l'INSTRUMENTATION PURE. Rien ne le lit pour décider :
-- aucune ligne de code ne change de comportement selon son contenu.
--
-- Écrit par : resolve-categorie (issue de chaque arbitrage) et ebay-api-worker
-- (replis). Les replis de l'extension passent, eux, par le canal EXISTANT
-- `platform_fields.warnings` en forme structurée {code:'categorie_arbitrage'}
-- — aucune plomberie ajoutée côté extension.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.categorie_journal (
  id           bigserial PRIMARY KEY,
  created_at   timestamptz NOT NULL DEFAULT now(),
  user_id      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  plateforme   text NOT NULL,
  -- 'arbitrage' : l'IA a été consultée. 'repli' : elle ne l'a pas été, ou n'a
  -- rien rendu d'utilisable, et l'appelant est retombé sur son comportement
  -- antérieur (la première suggestion).
  etape        text NOT NULL CHECK (etape IN ('arbitrage','repli')),
  -- arbitrage : 'choisi' | 'aucune' | 'hors_liste'
  -- repli     : 'premiere_suggestion' | 'mapping_conserve'
  issue        text NOT NULL,
  -- Pour un repli, POURQUOI : 'suggestion_unique' | 'pas_de_session' |
  -- 'timeout' | 'erreur' | 'ia_indisponible' | 'aucune'.
  motif        text,
  n_candidats  integer,
  choisi_id    text,
  choisi_chemin text,
  titre        text,
  job_id       uuid
);

-- Les deux lectures qu'on fera tous les jours : « par jour, par plateforme ».
CREATE INDEX IF NOT EXISTS categorie_journal_jour_idx
  ON public.categorie_journal (created_at DESC, plateforme);
CREATE INDEX IF NOT EXISTS categorie_journal_etape_idx
  ON public.categorie_journal (etape, issue, created_at DESC);

-- ⚠️ ÉCART ASSUMÉ à la règle « GRANT SELECT, INSERT, UPDATE, DELETE … TO
-- authenticated » de CLAUDE.md : cette table n'est JAMAIS touchée par l'app.
-- Elle n'est écrite que par des fonctions en service_role (qui contournent
-- RLS) et lue en SQL d'exploitation. Donner l'écriture à `authenticated`
-- ouvrirait une table de mesure à la falsification sans aucun bénéfice.
-- On accorde donc la LECTURE seule, bornée par RLS aux lignes de l'appelant.
ALTER TABLE public.categorie_journal ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.categorie_journal TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.categorie_journal_id_seq TO authenticated;

DROP POLICY IF EXISTS categorie_journal_lecture_propre ON public.categorie_journal;
CREATE POLICY categorie_journal_lecture_propre ON public.categorie_journal
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- ── LA VUE QU'ON INTERROGE ─────────────────────────────────────────────────
-- Une ligne par (jour de Paris, plateforme). Les VOIES viennent des jobs — la
-- source de vérité de ce qui est réellement parti ; les arbitrages et les
-- replis viennent du journal.
-- ⚠️ AT TIME ZONE 'Europe/Paris' (règle du dépôt) : un « jour » qui commence à
-- 2 h du matin ne veut rien dire pour un vendeur français.
CREATE OR REPLACE VIEW public.v_categorie_par_jour AS
WITH jobs AS (
  SELECT
    (created_at AT TIME ZONE 'Europe/Paris')::date AS jour,
    platform AS plateforme,
    platform_fields->>'categorie_source' AS voie,
    count(*) AS n
  FROM public.cross_post_jobs
  WHERE action = 'publish'
    AND platform_fields->>'categorie_source' IS NOT NULL
  GROUP BY 1, 2, 3
),
voies AS (
  SELECT jour, plateforme,
    sum(n)                                                        AS resolues,
    sum(n) FILTER (WHERE voie = 'famille_livres')                 AS famille_lens,
    sum(n) FILTER (WHERE voie IN ('mot_cle'))                     AS mot_objet_titre,
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
  coalesce(v.resolues, 0)              AS resolues,
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
  coalesce(j.replis, 0)                AS replis,
  coalesce(j.repli_suggestion_unique, 0) AS repli_suggestion_unique,
  coalesce(j.repli_pas_de_session, 0)  AS repli_pas_de_session,
  coalesce(j.repli_timeout, 0)         AS repli_timeout,
  coalesce(j.repli_erreur, 0)          AS repli_erreur,
  coalesce(j.repli_apres_aucune, 0)    AS repli_apres_aucune
FROM voies v
FULL OUTER JOIN journal j ON j.jour = v.jour AND j.plateforme = v.plateforme;

GRANT SELECT ON public.v_categorie_par_jour TO authenticated;
