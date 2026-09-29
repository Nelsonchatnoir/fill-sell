-- APPLIQUÉE le 29/09/2026 (GO conditionnel Nico : rejeu annulé Joséphine,
-- ocbijoux62 et dew passé avant application).
--
-- Incident du 29/09 : un dépôt Beebs confirmé sans identifiant est visible au
-- relevé comme une annonce neuve. Tant qu'aucune preuve ne relie cette annonce
-- au dépôt, l'import automatique créerait une seconde fiche. Le relevé doit la
-- laisser dans la file « Est-ce le même article ? » ; la réponse de la personne
-- vaut preuve et le rattachement exact peut alors poser l'identifiant.
--
-- Périmètre fail-closed : seulement Beebs, seulement les comptes qui portent
-- au moins un dépôt confirmé/published sans lien ni identifiant. Les autres
-- plateformes et les comptes Beebs sans dette d'identité restent inchangés.

BEGIN;
SET LOCAL statement_timeout = '5s';
SET LOCAL lock_timeout = '1s';

DO $migration$
DECLARE
  v_src text;
  v_ancien constant text := $ancien$    v_res := rapprocher_traiter_annonce(v_id, v_vus, v_import_ouvert, false, false);$ancien$;
  v_nouveau constant text := $nouveau$    -- depot_beebs_sans_identifiant_reste_proposition (29/09) : tant
    -- qu'un dépôt confirmé n'a ni lien ni identifiant, une annonce neuve du
    -- relevé peut être ce dépôt. Le titre ne tranche rien : proposition oui/non,
    -- jamais création automatique d'une seconde fiche.
    v_res := rapprocher_traiter_annonce(
      v_id,
      v_vus,
      v_import_ouvert AND NOT (
        v_pf = 'beebs'
        AND EXISTS (
          SELECT 1
          FROM cross_post_jobs j
          WHERE j.user_id = v_user
            AND j.platform = 'beebs'
            AND j.action IN ('publish', 'republish')
            AND j.status = 'published'
            AND j.platform_listing_id IS NULL
            AND j.listing_url IS NULL
            AND (
              COALESCE(j.platform_fields, '{}'::jsonb) ? 'lien_en_attente'
              OR COALESCE(j.platform_fields, '{}'::jsonb) ? 'retour_arriere_attente_identifiant_beebs'
            )
        )
      ),
      false,
      false
    );$nouveau$;
BEGIN
  SELECT pg_get_functiondef('public.rapprocher_releve(uuid)'::regprocedure)
    INTO v_src;

  IF position('depot_beebs_sans_identifiant_reste_proposition' IN v_src) > 0 THEN
    RETURN;
  END IF;
  IF position(v_ancien IN v_src) = 0 THEN
    RAISE EXCEPTION 'rapprocher_releve a dérivé : appel attendu introuvable';
  END IF;

  v_src := replace(v_src, v_ancien, v_nouveau);
  EXECUTE v_src;
END
$migration$;

REVOKE ALL ON FUNCTION public.rapprocher_releve(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rapprocher_releve(uuid) TO authenticated, service_role;
COMMIT;
