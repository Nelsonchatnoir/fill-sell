-- ═══════════════════════════════════════════════════════════════════════════
-- LE DÉPÔT SUIT LA PROD — 4 écarts soldés sur 5 (2026-09-19)
-- ═══════════════════════════════════════════════════════════════════════════
-- Le rejeu complet du 19/09 a montré six objets où la base reconstruite et la
-- prod ne disent pas la même chose. Quatre sont soldés ici. La prod est la
-- référence : CHACUN de ces gestes est un no-op sur elle — vérifié objet par
-- objet — et ne corrige que ce que le dépôt reconstruirait en trop ou en
-- travers sur une base vierge.
--
-- ⛔ AUCUNE migration passée n'est réécrite. Les fichiers d'origine restent
-- tels quels ; on corrige APRÈS, comme on l'a toujours fait ici.
--
-- ⚠️ DEUX ÉCARTS NE SONT PAS TRAITÉS ICI, ET C'EST DÉLIBÉRÉ :
--   · set_app_build(text) — voir le bandeau en fin de fichier, la prémisse
--     « supprimée à la main en prod » est FAUSSE et un DROP graverait un bug ;
--   · republish_livres_sans_marque_strip() — arbitrage en cours.

-- ── 1/4 · increment_voice_count(uuid, text) ─────────────────────────────────
-- Créée par 20260514100000, migration BIEN APPLIQUÉE en prod (vérifié dans
-- schema_migrations) — et la fonction n'y est plus : elle a donc été supprimée
-- à la main après coup. Aucun appelant ne subsiste, ni dans src/, ni dans
-- supabase/functions/. Le dépôt suit.
-- No-op sur la prod : la fonction y est déjà absente.
DROP FUNCTION IF EXISTS public.increment_voice_count(uuid, text);

-- ── 2/4 · Le trigger en trop sur ebay_accounts ──────────────────────────────
-- 20260905213647 a été appliquée en prod, et la prod porte
-- `trg_ebay_accounts_updated_at`. Le FICHIER du dépôt, lui, a été réécrit
-- APRÈS son application : il crée aujourd'hui un trigger nommé
-- `ebay_accounts_touch_updated_at` — le nom de la FONCTION, pas celui du
-- trigger d'origine. Sur une base vierge, le dépôt en posait donc DEUX là où
-- la prod n'en a qu'un (le second venant du rapatriement 20260905213648).
-- On retire celui qui n'a jamais existé en prod.
-- No-op sur la prod : ce trigger-là n'y a jamais été créé.
DROP TRIGGER IF EXISTS ebay_accounts_touch_updated_at ON public.ebay_accounts;

-- ── 3/4 · ebay_accounts.scopes ──────────────────────────────────────────────
-- Même cause : le fichier réécrit après application déclare
-- `scopes text[] NOT NULL DEFAULT '{}'`, la prod porte `text[]` nullable sans
-- défaut (relevé sur information_schema : is_nullable=YES, column_default
-- NULL). Sur une base vierge, le dépôt fabriquait une colonne PLUS STRICTE que
-- la prod — et un NOT NULL ferait échouer une reconnexion eBay qui ne renvoie
-- pas de scopes.
-- No-op sur la prod : elle est déjà nullable et déjà sans défaut.
ALTER TABLE public.ebay_accounts ALTER COLUMN scopes DROP NOT NULL;
ALTER TABLE public.ebay_accounts ALTER COLUMN scopes DROP DEFAULT;

-- ── 4/4 · founder_config : read_all → read_public ───────────────────────────
-- 20260514000000 crée la policy `founder_config_read_all`. La prod porte
-- `founder_config_read_public` (SELECT, rôles anon + authenticated,
-- USING true) : elle a été renommée à la main, le dépôt ne l'a jamais su.
-- No-op sur la prod : `_read_all` n'y existe pas (le DROP ne trouve rien) et
-- `_read_public` y est déjà (la création est sautée).
DROP POLICY IF EXISTS founder_config_read_all ON public.founder_config;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname='public' AND tablename='founder_config'
       AND policyname='founder_config_read_public'
  ) THEN
    CREATE POLICY founder_config_read_public ON public.founder_config
      FOR SELECT TO anon, authenticated USING (true);
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- ⛔ CE QUI N'EST **PAS** FAIT ICI : set_app_build(text)
-- ═══════════════════════════════════════════════════════════════════════════
-- La consigne était « créée par le dépôt, supprimée à la main en prod → DROP,
-- le dépôt suit la prod ». La première moitié est fausse, et ça change tout :
--   · 20260916190000_profiles_app_build.sql n'a JAMAIS été appliquée en prod
--     (absente de supabase_migrations.schema_migrations) ;
--   · ni la fonction `set_app_build`, ni la colonne `profiles.app_build`
--     n'existent en prod ;
--   · et pourtant **src/App.jsx:3271 appelle cette RPC à chaque démarrage** :
--         supabase.rpc('set_app_build', { p_build: APP_BUILD_ID })
--           .then(()=>{}).catch(()=>{});
--     Le `.catch(()=>{})` avale le refus : l'appel échoue en silence depuis le
--     16/09, et l'empreinte de build de l'app n'est enregistrée nulle part.
-- Ce n'est donc pas un écart de propreté, c'est une migration oubliée et une
-- fonctionnalité morte. Un DROP dans le dépôt la graverait définitivement.
-- Deux sorties possibles, l'arbitrage appartient à Nico :
--   (a) appliquer 20260916190000 en prod — la fonctionnalité revit, mais ça
--       TOUCHE LA PROD, ce que ce lot s'interdit ;
--   (b) assumer l'abandon : DROP de la fonction ET retrait de l'appel dans
--       App.jsx, sinon on laisse un appel mort dans le client.
-- Tant que ce n'est pas tranché, on ne touche à rien.
