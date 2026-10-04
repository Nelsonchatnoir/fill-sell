-- ═══════════════════════════════════════════════════════════════════════════
-- Relevés côté serveur : comptes ACTIFS seulement, un passage par COMPTE — 04/10
-- ═══════════════════════════════════════════════════════════════════════════
-- Incident du 04/10 (CPU 99 %, app bloquée) : les deux crons ajoutés le matin
-- (27 ebay-releve-api, 28 releve-completer) travaillaient pour TOUS les
-- comptes, actifs ou non, et releve-completer réécrivait `donnees_index_le` sur
-- CHAQUE annonce de chaque compte lu, même inchangée. Chaque écriture
-- déclenchait annonce_vers_fiche (suivi du prix : lecture de la fiche, parfois
-- de cross_post_jobs). Pire : `updated_at > donnees_index_le` rendait un compte
-- « à relire » après chaque relevé de l'extension (qui pose vu_le/updated_at),
-- donc en boucle.
--
--   1. comptes_actifs(p_jours) : extension vue OU session de l'app rafraîchie
--      dans les p_jours derniers jours — la seule définition d'« actif ».
--   2. releve_index_passages : le passage du relevé serveur, PAR COMPTE et par
--      plateforme. Une annonce inchangée n'est plus jamais réécrite.
--   3. releve_index_comptes_a_lire : comptes actifs seulement ; à relire si
--      jamais lu, lu il y a plus de 20 h, ou si une annonce est NÉE depuis
--      (created_at, jamais updated_at que tout relevé touche).
--   4. releve_ebay_details_a_lire : les annonces eBay à lire en détail (Browse),
--      comptes actifs seulement.
-- Inverse : en fin de fichier.

-- ── 1. Comptes actifs ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.comptes_actifs(p_jours integer DEFAULT 7)
 RETURNS TABLE(user_id uuid)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT p.id FROM profiles p
   WHERE p.extension_last_seen_at > now() - make_interval(days => p_jours)
  UNION
  SELECT s.user_id FROM auth.sessions s
   WHERE COALESCE(s.refreshed_at, s.updated_at, s.created_at) > now() - make_interval(days => p_jours);
$function$;
REVOKE ALL ON FUNCTION public.comptes_actifs(integer) FROM PUBLIC, anon, authenticated;

-- ── 2. Le passage du relevé serveur, par compte ────────────────────────────
CREATE TABLE IF NOT EXISTS public.releve_index_passages (
  user_id uuid NOT NULL,
  platform text NOT NULL,
  lu_le timestamptz NOT NULL DEFAULT now(),
  bilan jsonb,
  PRIMARY KEY (user_id, platform)
);
ALTER TABLE public.releve_index_passages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.releve_index_passages FROM anon, authenticated;
-- Lu et écrit par le service role seulement (releve-completer) : aucune policy.

-- ── 3. Les comptes à relire ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.releve_index_comptes_a_lire(p_platform text, p_limite integer)
 RETURNS TABLE(user_id uuid, listing_ids text[])
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH actifs AS (SELECT c.user_id FROM comptes_actifs(7) c),
  dus AS (
    SELECT b.user_id, max(r.lu_le) AS lu_le
      FROM annonces_plateforme b
      JOIN actifs ac ON ac.user_id = b.user_id
      LEFT JOIN releve_index_passages r ON r.user_id = b.user_id AND r.platform = p_platform
     WHERE b.platform = p_platform AND b.disparu_le IS NULL AND b.inventaire_id IS NOT NULL
     GROUP BY b.user_id
    HAVING max(r.lu_le) IS NULL
        OR max(r.lu_le) < now() - interval '20 hours'
        OR max(b.created_at) > max(r.lu_le)
     ORDER BY max(r.lu_le) NULLS FIRST
     LIMIT p_limite)
  SELECT a.user_id, array_agg(a.listing_id ORDER BY a.listing_id)
    FROM annonces_plateforme a
    JOIN dus d ON d.user_id = a.user_id
   WHERE a.platform = p_platform AND a.disparu_le IS NULL AND a.inventaire_id IS NOT NULL
   GROUP BY a.user_id;
$function$;
REVOKE ALL ON FUNCTION public.releve_index_comptes_a_lire(text, integer) FROM PUBLIC, anon, authenticated;

-- ── 4. Les annonces eBay à lire en détail (API Browse) ─────────────────────
CREATE OR REPLACE FUNCTION public.releve_ebay_details_a_lire(p_limite integer)
 RETURNS TABLE(id uuid, listing_id text, donnees_index jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT a.id, a.listing_id, a.donnees_index
    FROM annonces_plateforme a
    JOIN comptes_actifs(7) ac ON ac.user_id = a.user_id
   WHERE a.platform = 'ebay' AND a.disparu_le IS NULL AND a.inventaire_id IS NOT NULL
     AND (a.donnees_index_le IS NULL OR a.donnees_index_le < now() - interval '7 days')
   ORDER BY a.donnees_index_le NULLS FIRST, a.listing_id DESC
   LIMIT p_limite;
$function$;
REVOKE ALL ON FUNCTION public.releve_ebay_details_a_lire(integer) FROM PUBLIC, anon, authenticated;

-- INVERSE :
-- DROP FUNCTION IF EXISTS public.releve_ebay_details_a_lire(integer);
-- DROP TABLE IF EXISTS public.releve_index_passages;
-- DROP FUNCTION IF EXISTS public.comptes_actifs(integer);
-- puis la définition d'origine de releve_index_comptes_a_lire
-- (20261004094000_releve_ebay_par_api_et_completer.sql, § 5).
