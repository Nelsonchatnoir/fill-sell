-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION (26/10, Julian Boissel — règle de Nico) — feu vert de Nico le 26/10 à 16:53 (« Feu vert »)
-- ═══════════════════════════════════════════════════════════════════════════
-- « Le relevé serveur passe par le même rapprochement et le même import que la synchro de l'app : une annonce en
-- ligne sans fiche devient une fiche. »
-- CAUSE : le relevé quotidien d'un compte eBay relié par l'API (ebay-releve-api, run « serveur:quotidien_api ») passe
-- bien par le moteur v3 (rapprocher_releve → rapprochement_demander/relancer → rapprochement_v3_appliquer) qui décide
-- « créer » pour chaque annonce sans fiche — mais rapprochement_v3_fiche_de refuse toute création hors geste
-- (releve_est_geste : bouton|bouton_distant|app) : règle du 05/10 (Marine, la veille n'importe rien). Julian : 14
-- annonces lues à 09:30, plan {creer: 14}, sautes {creer_refuse: 14}, 0 fiche. Parc : 23 comptes eBay, 442 annonces.
-- LE CHANGEMENT (un seul, dans rapprochement_v3_fiche_de) : un relevé SERVEUR d'un compte eBay relié (lu par SON
-- jeton, « serveur:quotidien_api » et « serveur:lecture_origine », le même lecteur) vaut un geste pour ses annonces
-- eBay. Rien d'autre ne bouge : releve_est_geste reste la même (elle sert aussi geste_recent, la garde d'insertion, le
-- disjoncteur, l'affichage) ; les relevés de veille de l'extension (Vinted, Leboncoin, Beebs) n'importent toujours rien.
-- Toutes les autres gardes restent (import_auto_ouvert, ebay_run_bloque, hors liste, ignorée, disparue, fiche
-- supprimée, Opla). Le moteur v3 décide comme avant (jamais sur un titre seul, une annonce = une fiche).
-- Corps : pg_get_functiondef de la PROD (26/10 16:40), garde md5 56a0ffed1c5414290052a3efae3c9e15 — si la migration
-- B (PROPOSITION_20261026150000) est appliquée AVANT, la garde refuse : appliquer alors la version B, qui porte
-- désormais la même exception.
-- Inverse : supabase/rollbacks/20261026171000_releve_ebay_api_importe_INVERSE.sql (le corps d'avant, à l'octet).
-- Application (feu vert) : npx supabase db query --linked -f <ce fichier renommé .sql>
--   puis npx supabase migration repair --linked --status applied 20261026171000
-- Rattrapage ensuite (script scripts/reparations/20261026_import_ebay_api.sql, sauvegarde + inverse) : relancer le
-- rapprochement des comptes concernés (rapprochement_demander(u,'reparation:ebay_api') + rapprochement_relancer(u)).
BEGIN;
SET LOCAL statement_timeout = '60s';
SET LOCAL lock_timeout = '5s';
DO $$
BEGIN
  IF md5(pg_get_functiondef('public.rapprochement_v3_fiche_de'::regproc)) <> '56a0ffed1c5414290052a3efae3c9e15' THEN
    RAISE EXCEPTION 'rapprochement_v3_fiche_de a changé en prod depuis la lecture du 26/10 : rien n''est appliqué';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.rapprochement_v3_fiche_de(p_user uuid, p_annonce uuid, p_geste boolean)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE a annonces_plateforme%ROWTYPE; v_run vinted_sync_runs%ROWTYPE; v_imp jsonb;
BEGIN
  SELECT * INTO a FROM annonces_plateforme WHERE id = p_annonce AND user_id = p_user;
  IF a.id IS NULL THEN RETURN NULL; END IF;
  IF a.inventaire_id IS NOT NULL THEN RETURN a.inventaire_id; END IF;
  IF a.platform = 'opla' AND opla_sortie_passee() THEN RETURN NULL; END IF;   -- (22/10) Opla quittée : jamais une fiche neuve
  IF a.ignoree_le IS NOT NULL OR a.disparu_le IS NOT NULL OR a.fiche_supprimee_le IS NOT NULL THEN RETURN NULL; END IF;
  IF a.statut_plateforme IS DISTINCT FROM 'en_ligne' THEN RETURN NULL; END IF;
  IF releve_run_hors_liste(a.run_id) THEN RETURN NULL; END IF;
  IF a.platform = 'ebay' AND a.run_id IS NOT NULL AND releve_ebay_run_bloque(a.run_id) THEN RETURN NULL; END IF;
  IF a.platform = 'beebs' AND releve_dette_beebs(p_user) THEN RETURN NULL; END IF;
  IF COALESCE((SELECT value FROM coin_config WHERE key = 'import_auto_ouvert'), 0) <> 1 THEN RETURN NULL; END IF;
  IF NOT p_geste THEN
    SELECT * INTO v_run FROM vinted_sync_runs WHERE id = a.run_id;
    -- (26/10, Julian Boissel — Nico) Le relevé serveur d'un compte eBay relié, lu par SON jeton, importe comme
    -- « Synchroniser » : une annonce eBay en ligne sans fiche devient une fiche. Les veilles de l'extension, non.
    IF NOT (releve_est_geste(v_run.declencheur)
            OR (a.platform = 'ebay' AND v_run.declencheur IN ('serveur:quotidien_api', 'serveur:lecture_origine'))) THEN
      RETURN NULL;
    END IF;
  END IF;
  v_imp := rapprocher_importer(p_user, a.id, 'rapprochement');
  IF COALESCE((v_imp ->> 'ok')::boolean, false) THEN RETURN (v_imp ->> 'inventaire_id')::bigint; END IF;
  RETURN NULL;
END;
$function$;
COMMIT;
