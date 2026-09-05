-- ════════════════════════════════════════════════════════════════════════════
-- eBay par API — MESURE du lot 1 (05/09/2026)
-- « Sur les comptes ayant tenté eBay sans jamais rien publier : combien sont
--   bloqués par un ÉTAT eBay (compte vendeur incomplet, politiques absentes),
--   combien par autre chose ? »
--
-- Deux sources, à lire ensemble :
--   A. (dès maintenant) les jobs eBay du formulaire — classement par la
--      signature d'échec relevée par l'extension. Ne PROUVE pas l'état du
--      compte : le mur signin du flux de vente (pageType=2379018) est la
--      signature d'une inscription vendeur incomplète OU d'un step-up de
--      sécurité — indiscernable sans l'Account API.
--   B. (dès que des comptes se relient) ebay_accounts.seller_state, relevé
--      par l'Account API à chaque ouverture de la section eBay des Paramètres.
--      C'est LA mesure : inscription_vendeur / politiques_activees / politiques.
-- Convention CLAUDE.md : Europe/Paris, CTE excluded.
-- ════════════════════════════════════════════════════════════════════════════

-- ── A. Classement des comptes « jamais publié » par signature d'échec ───────
WITH excluded AS (SELECT unnest(ARRAY['hoosslocal@gmail.com']) AS email),
ebay AS (
  SELECT j.* FROM cross_post_jobs j
  JOIN auth.users u ON u.id = j.user_id
  WHERE j.platform = 'ebay'
    AND lower(u.email) NOT IN (SELECT email FROM excluded)
    AND u.email NOT LIKE '%@fillsell.app' AND u.email NOT LIKE '%+%test%'
),
jamais AS (
  SELECT user_id FROM ebay GROUP BY user_id
  HAVING count(*) FILTER (WHERE status IN ('published','sold','deleted') OR published_at IS NOT NULL OR platform_listing_id IS NOT NULL) = 0
),
flags AS (
  SELECT e.user_id,
    count(*) AS jobs,
    bool_or(e.error ILIKE '%/fpa/upgrade%' OR e.error ILIKE '%mise à niveau%' OR e.platform_fields->'last_diagnostic'->>'quoi' = 'prevol_upgrade_vendeur') AS upgrade_vendeur,
    bool_or(e.error ILIKE 'REAUTH VENTE%' OR e.platform_fields->'last_diagnostic'->>'quoi' IN ('prevol_stepup_vente')
            OR (e.platform_fields->'last_diagnostic'->>'quoi' IN ('garde_session_ebay','mur_signin')
                AND e.platform_fields->'last_diagnostic'->>'url' ILIKE '%pageType=2379018%')) AS mur_vente,
    bool_or(e.platform_fields->'last_diagnostic'->>'quoi' = 'garde_session_ebay' AND (e.platform_fields->'last_diagnostic'->>'sonde') = 'false') AS pas_connecte,
    bool_or(e.platform_fields->'last_diagnostic'->>'quoi' IN ('garde_session_ebay','mur_signin') AND coalesce(e.platform_fields->'last_diagnostic'->>'url','') NOT ILIKE '%pageType=2379018%' AND coalesce(e.platform_fields->'last_diagnostic'->>'sonde','') <> 'false') AS garde_autre,
    bool_or(e.error ILIKE 'Le clic « Mettre en vente » n''a produit AUCUNE%' OR e.platform_fields ? 'ebay_api_publish') AS clic_sans_requete,
    bool_or(e.error ILIKE 'Demande expirée%' OR e.error ILIKE 'Traitement interrompu : l''ordinateur%') AS extension_absente,
    bool_or(e.error ILIKE 'STOP %' OR e.error ILIKE 'Relance groupée%') AS stop_relance,
    bool_or(e.error ILIKE '%back/forward cache%' OR e.error ILIKE 'Publication interrompue%') AS bfcache,
    bool_or(e.status = 'cancelled') AS annule,
    bool_or(e.status = 'pending') AS en_attente
  FROM ebay e JOIN jamais x ON x.user_id = e.user_id
  GROUP BY e.user_id
)
SELECT
  CASE
    WHEN upgrade_vendeur THEN 'A. ETAT EBAY certain : /fpa/upgrade (mise a niveau / verification vendeur)'
    WHEN mur_vente THEN 'B. ETAT EBAY probable : mur signin du flux de VENTE (pageType=2379018, session de navigation vivante)'
    WHEN pas_connecte THEN 'C. autre : pas connecte a eBay dans Chrome (sonde false)'
    WHEN garde_autre THEN 'C2. autre : garde session, signature differente'
    WHEN clic_sans_requete THEN 'D. autre : clic sans requete / refus publish (formulaire)'
    WHEN bfcache THEN 'E. autre : onglet suspendu (bfcache)'
    WHEN extension_absente THEN 'F. autre : extension absente / demande expiree'
    WHEN stop_relance THEN 'G. autre : STOP relance manuelle, motif initial perdu'
    WHEN annule THEN 'H. autre : annule (article supprime)'
    WHEN en_attente THEN 'I. en attente, sans erreur'
    ELSE 'Z. indetermine'
  END AS classe,
  count(*) AS comptes, sum(jobs) AS jobs
FROM flags GROUP BY 1 ORDER BY 1;

-- ── B. La mesure vraie, dès que des comptes sont reliés (ebay_accounts) ─────
-- SELECT
--   count(*) AS comptes_relies,
--   count(*) FILTER (WHERE (seller_state->>'bloque_par_etat_ebay')::boolean) AS bloques_par_etat_ebay,
--   count(*) FILTER (WHERE (seller_state->>'inscription_vendeur')::boolean IS FALSE) AS inscription_incomplete,
--   count(*) FILTER (WHERE (seller_state->>'politiques_activees')::boolean IS FALSE) AS politiques_inactives,
--   count(*) FILTER (WHERE (seller_state->'politiques'->>'livraison')::int = 0
--                       OR (seller_state->'politiques'->>'paiement')::int = 0
--                       OR (seller_state->'politiques'->>'retours')::int = 0) AS politique_manquante,
--   count(*) FILTER (WHERE revoked_at IS NOT NULL) AS a_reconnecter
-- FROM ebay_accounts
-- WHERE seller_state IS NOT NULL;
--
-- Croisement avec les « jamais publié » du formulaire :
-- SELECT a.user_id, a.seller_state->>'inscription_vendeur' AS inscription,
--        a.seller_state->>'politiques_activees' AS politiques,
--        a.seller_state->'politiques' AS nb_politiques
-- FROM ebay_accounts a
-- JOIN (SELECT user_id FROM cross_post_jobs WHERE platform='ebay' GROUP BY user_id
--       HAVING count(*) FILTER (WHERE status IN ('published','sold','deleted')) = 0) j USING (user_id);
