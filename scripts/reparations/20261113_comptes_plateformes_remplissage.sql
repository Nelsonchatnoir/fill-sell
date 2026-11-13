-- (13/11/2026, étape 4 « comptes hors France », L1) REMPLISSAGE INITIAL DE public.comptes_plateformes — PRÉPARÉ, JAMAIS
-- EXÉCUTÉ sans le feu vert de Nico (après la migration 20261113210000, M1).
-- Ce que le serveur SAIT DÉJÀ du site de chaque compte de plateforme, recopié une fois dans la table (les fonctions ne
-- l'écrivent qu'à la PROCHAINE lecture : liaison eBay, GetUser paresseux, sondes de l'extension) :
--   · eBay : ebay_accounts.ebay_site (Trading GetUser <Site>, lu pour TOUS les comptes depuis le 13/11 ~10:00) — compte =
--     ebay_eias_token (identifiant immuable), lu_le = ebay_site_lu_le (la lecture GetUser), liaisons révoquées comprises
--     (le site est celui du compte eBay, D10 le lit « même révoqué ») ;
--   · Vinted : profiles.extension_sessions.vinted_identite (sonde : numéro du compte, pays, locale) — la boutique que la
--     sonde a lue en dernier ; sans pays → aucune ligne ; lu_le = l'heure du script (la sonde ne date pas l'identité) ;
--   · Depop : aucune identité remontée aujourd'hui (extension 0.6.187) → rien.
-- La règle est celle de _shared/sites-plateformes.js ; ses deux tables sont recopiées ci-dessous À L'IDENTIQUE (verrou
-- selftest:sites-plateformes) et le banc (scripts/essais/20261113210000_banc.mjs) compare chaque ligne écrite ici à celle
-- que le module écrirait. JAMAIS EBAY_FR pour un compte étranger (la table le refuse aussi). Inconnu = aucune ligne.
-- Attendu (prod lue le 13/11, lecture seule) : eBay 226 lignes (215 liaisons actives : France 189, US 12, UK 6, Italie 3,
-- Allemagne 2, Belgique 2, Autriche 1 ; 11 révoquées : France 6, US 4, Canada 1 ; 4 sites jamais lus → rien) ; Vinted
-- 231 lignes (FR 225, BE 3, IT 2, PT 1 ; 56 sondes sans pays → rien).
-- ON CONFLICT DO NOTHING : une ligne déjà écrite par une fonction n'est jamais réécrite. Sauvegarde :
-- public._backup_1311_comptes_plateformes (chaque ligne insérée, telle quelle). Inverse :
-- 20261113_comptes_plateformes_remplissage_INVERSE.sql. Preuve (lecture seule) : 20261113_comptes_plateformes_remplissage_PREUVE.sql.
-- Aucune annonce, aucune fiche, aucune tâche touchée ; aucun appel à eBay ni aux plateformes ; aucun mail.
-- ⚠ Une seule transaction : une garde qui échoue n'écrit RIEN.
BEGIN;
SET LOCAL lock_timeout = '5s';

DO $garde$
BEGIN
  IF to_regclass('public.comptes_plateformes') IS NULL THEN
    RAISE EXCEPTION 'migration 20261113210000 (M1, comptes_plateformes) absente : l''appliquer d''abord — rien n''est écrit';
  END IF;
  IF to_regclass('public._backup_1311_comptes_plateformes') IS NOT NULL THEN
    RAISE EXCEPTION 'script déjà passé (sauvegarde présente) : rien n''est écrit';
  END IF;
END
$garde$;

CREATE TABLE public._backup_1311_comptes_plateformes (
  plateforme text NOT NULL, user_id uuid NOT NULL, compte text NOT NULL, ligne jsonb NOT NULL, le timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public._backup_1311_comptes_plateformes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public._backup_1311_comptes_plateformes FROM anon, authenticated;

-- 1. eBay : le site GetUser de chaque compte relié (ou révoqué), par la table de sites-plateformes.js.
WITH sites (site_getuser, site, pays, langue, devise, domaine) AS (VALUES
    ('France', 'EBAY_FR', 'FR', 'fr-FR', 'EUR', 'ebay.fr'),
    ('UK', 'EBAY_GB', 'GB', 'en-GB', 'GBP', 'ebay.co.uk'),
    ('US', 'EBAY_US', 'US', 'en-US', 'USD', 'ebay.com'),
    ('eBayMotors', 'EBAY_US', 'US', 'en-US', 'USD', 'ebay.com'),
    ('Germany', 'EBAY_DE', 'DE', 'de-DE', 'EUR', 'ebay.de'),
    ('Austria', 'EBAY_AT', 'AT', 'de-AT', 'EUR', 'ebay.at'),
    ('Switzerland', 'EBAY_CH', 'CH', 'de-CH', 'CHF', 'ebay.ch'),
    ('Italy', 'EBAY_IT', 'IT', 'it-IT', 'EUR', 'ebay.it'),
    ('Spain', 'EBAY_ES', 'ES', 'es-ES', 'EUR', 'ebay.es'),
    ('Belgium_French', 'EBAY_BE', 'BE', 'fr-BE', 'EUR', 'befr.ebay.be'),
    ('Belgium_Dutch', 'EBAY_BE', 'BE', 'nl-BE', 'EUR', 'benl.ebay.be'),
    ('Netherlands', 'EBAY_NL', 'NL', 'nl-NL', 'EUR', 'ebay.nl'),
    ('Ireland', 'EBAY_IE', 'IE', 'en-IE', 'EUR', 'ebay.ie'),
    ('Poland', 'EBAY_PL', 'PL', 'pl-PL', 'PLN', 'ebay.pl'),
    ('Canada', 'EBAY_CA', 'CA', 'en-CA', 'CAD', 'ebay.ca'),
    ('CanadaFrench', 'EBAY_CA', 'CA', 'fr-CA', 'CAD', 'cafr.ebay.ca'),
    ('Australia', 'EBAY_AU', 'AU', 'en-AU', 'AUD', 'ebay.com.au'),
    ('HongKong', 'EBAY_US', 'HK', 'en-US', 'USD', 'ebay.com'),
    ('Singapore', 'EBAY_US', 'SG', 'en-US', 'USD', 'ebay.com'),
    ('India', 'EBAY_US', 'IN', 'en-US', 'USD', 'ebay.com'),
    ('Malaysia', 'EBAY_US', 'MY', 'en-US', 'USD', 'ebay.com'),
    ('Philippines', 'EBAY_US', 'PH', 'en-US', 'USD', 'ebay.com')
), lus AS (
  SELECT e.user_id, 'ebay'::text AS plateforme, btrim(e.ebay_eias_token) AS compte, s.site, s.pays, s.langue, s.devise, s.domaine,
         'ebay_getuser'::text AS source, jsonb_build_object('site', e.ebay_site) AS brut, COALESCE(e.ebay_site_lu_le, now()) AS lu_le
    FROM public.ebay_accounts e
    JOIN sites s ON s.site_getuser = e.ebay_site
   WHERE nullif(btrim(e.ebay_eias_token), '') IS NOT NULL AND length(btrim(e.ebay_eias_token)) <= 200
), ins AS (
  INSERT INTO public.comptes_plateformes (user_id, plateforme, compte, site, pays, langue, devise, domaine, source, brut, lu_le)
  SELECT user_id, plateforme, compte, site, pays, langue, devise, domaine, source, brut, lu_le FROM lus
  ON CONFLICT (user_id, plateforme, compte) DO NOTHING
  RETURNING *
)
INSERT INTO public._backup_1311_comptes_plateformes (plateforme, user_id, compte, ligne)
SELECT i.plateforme, i.user_id, i.compte, to_jsonb(i) FROM ins i;

-- 2. Vinted : le compte que la sonde a lu (numéro, pays, locale), par la règle de sites-plateformes.js — devise et domaine
--    pour les 18 pays de la zone euro relevés (vinted-pays.ts) ; ailleurs : null (jamais devinés).
-- vinted_pays_euro: FR BE LU NL DE AT IT ES PT IE FI EE LV LT SK SI HR GR
WITH euro (pays, domaine) AS (VALUES
    ('FR', 'vinted.fr'), ('BE', 'vinted.be'), ('LU', 'vinted.lu'), ('NL', 'vinted.nl'), ('DE', 'vinted.de'), ('AT', 'vinted.at'),
    ('IT', 'vinted.it'), ('ES', 'vinted.es'), ('PT', 'vinted.pt'), ('IE', 'vinted.ie'), ('FI', 'vinted.fi'), ('EE', 'vinted.ee'),
    ('LV', 'vinted.lv'), ('LT', 'vinted.lt'), ('SK', 'vinted.sk'), ('SI', 'vinted.si'), ('HR', 'vinted.hr'), ('GR', 'vinted.gr')
), sondes AS (
  SELECT p.id AS user_id, p.extension_sessions -> 'vinted_identite' AS i
    FROM public.profiles p
   WHERE jsonb_typeof(p.extension_sessions -> 'vinted_identite') = 'object'
), lus AS (
  SELECT s.user_id, 'vinted'::text AS plateforme, btrim(s.i ->> 'user_id') AS compte,
         'VINTED_' || (s.i ->> 'pays') AS site, s.i ->> 'pays' AS pays,
         substring(lower(btrim(COALESCE(s.i ->> 'langue', ''))) FROM '^([a-z]{2,3})(?:[-_][a-z0-9]{2,8})*$') AS langue,
         CASE WHEN e.pays IS NOT NULL THEN 'EUR' END AS devise, e.domaine,
         'vinted_sonde'::text AS source,
         jsonb_build_object('pays', s.i ->> 'pays')
           || CASE WHEN nullif(btrim(COALESCE(s.i ->> 'langue', '')), '') IS NOT NULL
                   THEN jsonb_build_object('locale', btrim(s.i ->> 'langue')) ELSE '{}'::jsonb END AS brut,
         now() AS lu_le
    FROM sondes s
    LEFT JOIN euro e ON e.pays = s.i ->> 'pays'
   WHERE (s.i ->> 'pays') ~ '^[A-Z]{2}$'
     AND nullif(btrim(COALESCE(s.i ->> 'user_id', '')), '') IS NOT NULL AND length(btrim(s.i ->> 'user_id')) <= 200
), ins AS (
  INSERT INTO public.comptes_plateformes (user_id, plateforme, compte, site, pays, langue, devise, domaine, source, brut, lu_le)
  SELECT user_id, plateforme, compte, site, pays, langue, devise, domaine, source, brut, lu_le FROM lus
  ON CONFLICT (user_id, plateforme, compte) DO NOTHING
  RETURNING *
)
INSERT INTO public._backup_1311_comptes_plateformes (plateforme, user_id, compte, ligne)
SELECT i.plateforme, i.user_id, i.compte, to_jsonb(i) FROM ins i;

-- 3. Ce qui a été écrit (par plateforme et site).
SELECT b.plateforme, b.ligne ->> 'site' AS site, count(*) AS lignes
  FROM public._backup_1311_comptes_plateformes b
 GROUP BY 1, 2
 ORDER BY 1, 3 DESC, 2;

COMMIT;
