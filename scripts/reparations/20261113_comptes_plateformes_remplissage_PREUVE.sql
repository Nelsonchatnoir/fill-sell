-- PREUVE (LECTURE SEULE) de 20261113_comptes_plateformes_remplissage.sql (13/11/2026, étape 4 L1) — à jouer APRÈS la
-- migration 20261113210000 et le script : npx supabase db query --linked --read-only -f <ce fichier>
-- Attendu : 1. eBay ≈ 226 lignes (EBAY_FR 195, EBAY_US 16, EBAY_GB 6, EBAY_IT 3, EBAY_DE 2, EBAY_BE 2, EBAY_AT 1, EBAY_CA 1),
-- Vinted ≈ 231 (VINTED_FR 225, VINTED_BE 3, VINTED_IT 2, VINTED_PT 1) — plus ce que les fonctions auront noté depuis ;
-- 2. AUCUN compte étranger sur EBAY_FR ; 3. aucun écart entre la source et la table (0 ligne) ; 4. les cas réels.

-- 1. Les lignes, par plateforme, site et source.
SELECT 'lignes' AS quoi, c.plateforme, c.site, c.source, count(*) AS n, count(*) FILTER (WHERE b.compte IS NOT NULL) AS du_script
  FROM public.comptes_plateformes c
  LEFT JOIN public._backup_1311_comptes_plateformes b ON b.user_id = c.user_id AND b.plateforme = c.plateforme AND b.compte = c.compte
 GROUP BY 2, 3, 4
 ORDER BY 2, 5 DESC;

-- 2. Jamais EBAY_FR pour un compte étranger (la table le refuse ; contrôle croisé avec ebay_accounts).
SELECT 'ebay_fr_etranger' AS quoi, count(*) AS n
  FROM public.comptes_plateformes c
  JOIN public.ebay_accounts e ON e.user_id = c.user_id AND btrim(e.ebay_eias_token) = c.compte
 WHERE c.plateforme = 'ebay' AND c.site = 'EBAY_FR' AND e.ebay_site IS DISTINCT FROM 'France';

-- 3. Écarts : un compte eBay au site lu sans ligne, ou une ligne qui ne dit plus le site d'ebay_accounts.
SELECT 'ecart_ebay' AS quoi, left(e.user_id::text, 8) AS compte8, e.ebay_site, c.site, c.brut ->> 'site' AS brut_site
  FROM public.ebay_accounts e
  LEFT JOIN public.comptes_plateformes c ON c.user_id = e.user_id AND c.plateforme = 'ebay' AND c.compte = btrim(e.ebay_eias_token)
 WHERE e.ebay_site IS NOT NULL AND nullif(btrim(e.ebay_eias_token), '') IS NOT NULL
   AND (c.user_id IS NULL OR (c.brut ->> 'site') IS DISTINCT FROM e.ebay_site)
 LIMIT 20;
SELECT 'ecart_vinted' AS quoi, left(p.id::text, 8) AS compte8, p.extension_sessions -> 'vinted_identite' ->> 'pays' AS pays_sonde, c.site
  FROM public.profiles p
  LEFT JOIN public.comptes_plateformes c ON c.user_id = p.id AND c.plateforme = 'vinted'
       AND c.compte = btrim(p.extension_sessions -> 'vinted_identite' ->> 'user_id')
 WHERE (p.extension_sessions -> 'vinted_identite' ->> 'pays') ~ '^[A-Z]{2}$'
   AND nullif(btrim(COALESCE(p.extension_sessions -> 'vinted_identite' ->> 'user_id', '')), '') IS NOT NULL
   AND (c.user_id IS NULL OR c.pays IS DISTINCT FROM p.extension_sessions -> 'vinted_identite' ->> 'pays')
 LIMIT 20;

-- 4. Les cas réels (id8) : eBay c7c382b7 UK, 9ea76b27 US, 9324a9b7 Belgique, 04699046 France ; Vinted ac19c8c9 et
--    c5df477d (Italie), 2c89e573 (Belgique), 9f64d78e (Portugal).
SELECT 'cas' AS quoi, left(c.user_id::text, 8) AS compte8, c.plateforme, c.site, c.pays, c.langue, c.devise, c.domaine, c.brut,
       (c.lu_le AT TIME ZONE 'Europe/Paris') AS lu_le_paris, c.pilote
  FROM public.comptes_plateformes c
 WHERE left(c.user_id::text, 8) IN ('c7c382b7', '9ea76b27', '9324a9b7', '04699046', 'ac19c8c9', 'c5df477d', '2c89e573', '9f64d78e')
 ORDER BY 2, 3;
