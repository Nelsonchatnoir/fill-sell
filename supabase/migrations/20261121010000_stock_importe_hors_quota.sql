-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- (21/11/2026, URGENT — règle de Nico) LE STOCK EXISTANT NE COMPTE JAMAIS DANS LE QUOTA D'ANNONCES
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- La règle : un article qui a une annonce d'origine (import vinted_sync, relevé releve_*), dont on reprend le texte, les
-- photos et les champs, ne coûte JAMAIS d'annonce quand on le prépare pour une autre plateforme — même quand sa
-- description d'origine est vide ou pas encore lue. Seules les vraies créations comptent : scan Lens, fiche neuve sans
-- annonce d'origine (origine nulle), corps item_data. Rien d'autre ne change : ni plafond, ni grille, ni coût, ni la
-- passe légère du 10/11, ni la dédup « régénération sous 24 h » (un article importé ne l'ouvre pas : il ne compte pas).
--
-- Constat (lu en base le 21/11 00:09) : 0c97dc8b (essai Pro + Cloud, cycle du 20/11 14:04) prépare en lot 297
-- articles de son stock (233 imports Vinted, 58 Leboncoin). La garde de lecture du lot (40 s, 19/11) envoie au moteur
-- 128 articles Vinted SANS leur description : texte_vendeur_titre = true mais texte_vendeur_description = false,
-- texte_vendeur_origine = 'vinted_sync'. La règle du 10/11 n'exempte que titre ET description du vendeur : les 128
-- lignes comptent, « Tu as utilisé tes 120 annonces de ce mois-ci » à 00:03.
--
-- La ligne generate_listing porte déjà l'origine de l'article (texte_vendeur_origine, generate-listing, depuis le 21/09)
-- et son inventaire_id (absent sur un corps item_data) : texte_vendeur_origine = 'vinted_sync' ou ~ '^releve_[a-z]+$'
-- ET inventaire_id présent → hors du décompte. Toutes les entrées (app, web, extension, Cloud) passent par
-- generate-listing, qui ne présente plus ces articles au guichet (stockImporte, même déploiement).
--
-- UNE fonction, même signature (CREATE OR REPLACE : propriétaire postgres et droits postgres + service_role inchangés),
-- réécrite depuis pg_get_functiondef de PROD (scripts/quotas/fixtures/prod-2111-stock-importe.sql, md5 6e2f60f0…) :
-- quota_annonces_consommees — lue par quotas_etat (en-tête, Réglages, jauges), spend_coins_for_generate,
-- spend_coins_for_lens, garde_fou_jour('annonces'). Le compteur est CALCULÉ : tous les comptes retrouvent leur décompte
-- juste par cette seule réécriture, sans aucune écriture sur leurs lignes.
-- Preuve sur un Postgres jetable : PREUVE_PG=embarque node scripts/quotas/preuve-stock-importe.mjs. Inverse :
-- supabase/rollbacks/20261121010000_stock_importe_hors_quota_INVERSE.sql.

CREATE OR REPLACE FUNCTION public.quota_annonces_consommees(p_user_id uuid, p_cycle timestamp with time zone)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH borne AS (
    SELECT GREATEST(
      p_cycle,
      to_timestamp(COALESCE((SELECT value FROM coin_config WHERE key = 'quotas_annonces_depuis'), 0))
    ) AS t
  )
  SELECT (
    -- Annonces générées (portes A et B) — dédup régénération 24 h inchangée.
    -- (10/11/2026, règle de Nico) Une passe légère — titre ET description du vendeur — ne compte jamais, et
    -- n'ouvre pas la dédup : une vraie rédaction qui la suit compte.
    -- (21/11/2026, règle de Nico) Le stock existant (article importé) non plus, et il n'ouvre pas la dédup non plus.
    (SELECT count(*) FROM usage_logs u, borne
      WHERE u.user_id = p_user_id AND u.feature = 'generate_listing'
        AND u.created_at >= borne.t
        AND NOT (COALESCE(u.metadata->>'texte_vendeur_titre', '') = 'true'
                 AND COALESCE(u.metadata->>'texte_vendeur_description', '') = 'true')
        -- (21/11/2026, règle de Nico) Le STOCK EXISTANT ne compte jamais : un article importé (annonce d'origine
        -- vinted_sync, releve_*), fiche du stock (inventaire_id), même quand sa description d'origine est vide ou non lue.
        AND NOT (u.metadata ? 'inventaire_id'
                 AND (COALESCE(u.metadata->>'texte_vendeur_origine', '') = 'vinted_sync'
                      OR COALESCE(u.metadata->>'texte_vendeur_origine', '') ~ '^releve_[a-z]+$'))
        AND NOT (
          u.metadata ? 'inventaire_id' AND EXISTS (
            SELECT 1 FROM usage_logs prev
            WHERE prev.user_id = u.user_id AND prev.feature = 'generate_listing'
              AND prev.metadata->>'inventaire_id' = u.metadata->>'inventaire_id'
              AND prev.created_at <  u.created_at
              AND prev.created_at >= u.created_at - interval '24 hours'
              AND NOT (COALESCE(prev.metadata->>'texte_vendeur_titre', '') = 'true'
                       AND COALESCE(prev.metadata->>'texte_vendeur_description', '') = 'true')
              AND NOT (prev.metadata ? 'inventaire_id'
                       AND (COALESCE(prev.metadata->>'texte_vendeur_origine', '') = 'vinted_sync'
                            OR COALESCE(prev.metadata->>'texte_vendeur_origine', '') ~ '^releve_[a-z]+$'))
          )
        ))
    -- + scans NON unifiés depuis la borne : 1 unité chacun. Les scans unifiés
    -- (unifie:true) sont portés par leur ligne generate_listing.
    + (SELECT count(*) FROM usage_logs l, borne
        WHERE l.user_id = p_user_id AND l.feature = 'lens'
          AND l.created_at >= borne.t
          AND NOT (l.metadata ? 'unifie'))
  )::int;
$function$;
