-- ═══════════════════════════════════════════════════════════════════════════
-- M1 — LE SITE DE CHAQUE COMPTE DE PLATEFORME, LU UNE FOIS, SERVI PARTOUT (13/11/2026, étape 4 « comptes hors France », L1)
-- ═══════════════════════════════════════════════════════════════════════════
-- Règle de Nico (International) : « identifiants plutôt que libellés ; pays, langue et monnaie de chaque compte de
-- plateforme lus une fois ». public.comptes_plateformes : une ligne par compte de plateforme d'un compte FillSell, son site
-- PAR IDENTIFIANTS (EBAY_GB, VINTED_IT, DEPOP_GB, LEBONCOIN_FR, BEEBS_FR), pays ISO 3166, langue BCP 47, devise ISO 4217,
-- domaine, d'où vient la lecture (source), ce que la plateforme a dit tel quel (brut), quand (lu_le) et le drapeau
-- pilote (posé par Nico, L6 — jamais par une fonction).
--   · Écrivent (service_role, par la porte unique _shared/comptes-plateformes.js) : ebay-oauth-callback et
--     siteDuCompteEbay (GetUser <Site>), get-pending-jobs (sondes Vinted et Depop de l'extension). Lisent : ebay-account
--     (etat.site_compte servi à l'app), puis le worker et l'extension (L2-L4).
--   · Inconnu = PAS DE LIGNE (jamais une valeur devinée) ; jamais une ligne inchangée réécrite (la porte ne réécrit rien
--     d'identique ; ici, suppress_redundant_updates_trigger : un UPDATE identique n'écrit aucune version).
--   · ⛔ JAMAIS EBAY_FR pour un compte d'un autre pays (règle du 25/09, D10) : la base le refuse (CHECK).
--   · Clé (user_id, plateforme, compte) : compte = l'identifiant IMMUABLE sur la plateforme (eBay : EIASToken ; Vinted,
--     Depop : le numéro du compte), jamais le pseudo.
-- Droits : RLS ; lecture par le propriétaire (authenticated, auth.uid()) ; écriture par le serveur seulement
-- (service_role) ; rien pour anon. Suppression du compte FillSell : ON DELETE CASCADE (comme ebay_accounts).
-- Le code des fonctions marche AVANT cette migration (table absente → rien, sans erreur) et APRÈS, sans redéploiement.
-- Remplissage initial (PRÉPARÉ, à part) : scripts/reparations/20261113_comptes_plateformes_remplissage.sql.
-- Banc (Postgres jetable) : node scripts/essais/20261113210000_banc.mjs. Inverse :
-- supabase/rollbacks/20261113210000_comptes_plateformes_INVERSE.sql.
CREATE TABLE IF NOT EXISTS public.comptes_plateformes (
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  plateforme text NOT NULL CHECK (plateforme IN ('ebay', 'vinted', 'depop', 'leboncoin', 'beebs')),
  compte text NOT NULL CHECK (compte = btrim(compte) AND length(compte) BETWEEN 1 AND 200),
  site text NOT NULL CHECK (site ~ '^(EBAY|VINTED|DEPOP|LEBONCOIN|BEEBS)_[A-Z]{2}$'),
  pays text NOT NULL CHECK (pays ~ '^[A-Z]{2}$'),
  langue text CHECK (langue ~ '^[a-z]{2,3}(-[A-Z]{2})?$'),
  devise text CHECK (devise ~ '^[A-Z]{3}$'),
  domaine text CHECK (domaine ~ '^[a-z0-9][a-z0-9.-]*[a-z]$'),
  source text NOT NULL CHECK (source IN ('ebay_getuser', 'vinted_sonde', 'depop_sonde')),
  brut jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(brut) = 'object'),
  lu_le timestamptz NOT NULL DEFAULT now(),
  pilote boolean NOT NULL DEFAULT false,
  PRIMARY KEY (user_id, plateforme, compte),
  CONSTRAINT comptes_plateformes_site_de_la_plateforme CHECK (split_part(site, '_', 1) = upper(plateforme)),
  -- Vinted, Depop, Leboncoin, Beebs : le site EST le pays du compte (VINTED_IT ↔ IT). eBay : un pays sans marketplace
  -- Inventory publie sur EBAY_US (pays du compte gardé).
  CONSTRAINT comptes_plateformes_site_du_pays CHECK (plateforme = 'ebay' OR site = upper(plateforme) || '_' || pays),
  CONSTRAINT comptes_plateformes_jamais_ebay_fr_etranger CHECK (site <> 'EBAY_FR' OR pays = 'FR')
);
COMMENT ON TABLE public.comptes_plateformes IS
  'Le site de chaque compte de plateforme (étape 4 L1, 13/11/2026) : lu une fois (GetUser eBay, sondes Vinted/Depop), servi partout. Écrit par le serveur seulement (_shared/comptes-plateformes.js), jamais une ligne inchangée réécrite ; inconnu = pas de ligne.';
COMMENT ON COLUMN public.comptes_plateformes.compte IS 'Identifiant IMMUABLE du compte sur la plateforme (eBay : EIASToken ; Vinted, Depop : numéro), jamais le pseudo.';
COMMENT ON COLUMN public.comptes_plateformes.site IS 'Site par identifiant : EBAY_GB, VINTED_IT, DEPOP_GB, LEBONCOIN_FR, BEEBS_FR (jamais EBAY_FR pour un compte étranger).';
COMMENT ON COLUMN public.comptes_plateformes.brut IS 'Ce que la plateforme a dit, tel quel (eBay : {"site":"UK"} ; Vinted : {"pays","locale"} ; Depop : {"pays"}).';
COMMENT ON COLUMN public.comptes_plateformes.lu_le IS 'Lecture qui a établi ces valeurs (première lecture, ou dernier changement) — jamais réécrite à l''identique.';
COMMENT ON COLUMN public.comptes_plateformes.pilote IS 'Compte pilote de son site (étape 4 L6), posé par Nico — jamais par une fonction.';

ALTER TABLE public.comptes_plateformes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "comptes_plateformes lisibles par leur proprietaire" ON public.comptes_plateformes;
CREATE POLICY "comptes_plateformes lisibles par leur proprietaire" ON public.comptes_plateformes
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
-- droits : lecture par le propriétaire (l'app, sous sa session) ; écriture par le serveur seulement (service_role).
REVOKE ALL ON public.comptes_plateformes FROM anon, authenticated;
GRANT SELECT ON public.comptes_plateformes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.comptes_plateformes TO service_role;

-- Un UPDATE qui ne change rien n'écrit aucune nouvelle version de la ligne (xmin inchangé) — fonction native de Postgres.
DROP TRIGGER IF EXISTS comptes_plateformes_sans_reecriture ON public.comptes_plateformes;
CREATE TRIGGER comptes_plateformes_sans_reecriture BEFORE UPDATE ON public.comptes_plateformes
  FOR EACH ROW EXECUTE FUNCTION suppress_redundant_updates_trigger();
