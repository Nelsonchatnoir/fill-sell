-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 20261113193000_bordereau_marquer_non_imprime — « MARQUER NON IMPRIMÉ » SUR UN BORDEREAU, RÉVERSIBLE ET TRACÉ
-- (13/11, lot NU — décision de Nico, question I3 de l'étape 5 : « oui, ajoute « Marquer non imprimé » »). NON APPLIQUÉE :
-- feu vert de Nico requis, et APRÈS 20261113153000_bordereau_imprime_le (la garde ci-dessous refuse l'ordre inverse).
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- CONSTAT : « Imprimé le JJ/MM » (bordereaux_copies.imprime_le, migration 20261113153000) est posé quand le geste
-- d'impression, de partage ou de téléchargement RÉUSSIT — l'app ne voit pas l'imprimante. Un PDF partagé sans être imprimé
-- disait « Imprimé le » et sortait de « Tout imprimer », sans retour possible (cas : 447d920c, relié de faf5021a).
--   1. bordereaux_copies.non_imprime_le timestamptz NULL — l'heure du DERNIER geste « Marquer non imprimé » ;
--      bordereaux_copies.imprime_avant timestamptz NULL — la date d'impression que ce geste a retirée. La trace du geste
--      vit sur la ligne, comme celle du marquage (imprime_le). Aucune ligne existante n'est réécrite (colonnes nulles).
--   2. bordereau_marquer_non_imprime(p_copies uuid[], p_retablir boolean DEFAULT false) — NOUVELLE, plpgsql, SECURITY
--      DEFINER (la RLS de bordereaux_copies n'a AUCUNE politique d'écriture, règle du 16/10) ; mêmes gardes que
--      bordereau_marquer_imprime :
--      · session requise (auth.uid()) ; propriétaire SEUL ; copie effacée ignorée ; 60 copies au plus ;
--      · retirer (p_retablir = false) : seulement une copie MARQUÉE (imprime_le non nul) — imprime_avant = imprime_le,
--        non_imprime_le = now(), imprime_le = NULL ; une copie déjà « pas encore imprimée » n'est pas réécrite ;
--      · « Annuler » (p_retablir = true) : seulement une copie dont la date a été retirée et que rien n'a remarquée depuis
--        (imprime_le nul, imprime_avant non nul) — imprime_le = imprime_avant (à l'identique : la date vient du serveur,
--        jamais de l'écran), imprime_avant et non_imprime_le remis à nul ;
--      · rend { changees, retablir, copies: [{id, imprime_le, imprime_avant, non_imprime_le}] } — les copies du compte
--        demandées.
--      Droits : authenticated (et service_role) ; jamais anon ni PUBLIC.
-- ⛔ bordereau_marquer_imprime, RLS, politiques et droits de la table : INCHANGÉS. Aucun usage_logs (comme le marquage,
--    données personnelles minimum, règle du 16/10). Une copie remarquée après un retrait garde sa trace (non_imprime_le,
--    imprime_avant) : « retirée le X, remarquée le Y » se lit sur la ligne.
-- L'app (src/messagerie/SectionAExpedier.jsx) montre le geste SEULEMENT si non_imprime_le est lisible : elle part avant
-- cette migration sans bouton qui échoue.
-- Coût : une mise à jour par PK (60 au plus) par geste ; aucun déclencheur, aucun index.
-- Banc : node scripts/essais/20261113193000_banc.mjs (Postgres jetable : ordre refusé / migration / inverse / rejouée).
-- Inverse : supabase/rollbacks/20261113193000_bordereau_marquer_non_imprime_INVERSE.sql.
-- À jouer (feu vert de Nico) : npx supabase db query --linked -f supabase/migrations/20261113193000_bordereau_marquer_non_imprime.sql
--   puis npx supabase migration repair --linked --status applied 20261113193000  (version à relire contre « migration list »).
BEGIN;
SET LOCAL lock_timeout = '5s';

DO $garde$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'bordereaux_copies' AND column_name = 'imprime_le') THEN
    RAISE EXCEPTION 'appliquer d''abord 20261113153000_bordereau_imprime_le (colonne imprime_le absente) : rien n''est écrit';
  END IF;
END
$garde$;

ALTER TABLE public.bordereaux_copies ADD COLUMN IF NOT EXISTS non_imprime_le timestamptz NULL;
ALTER TABLE public.bordereaux_copies ADD COLUMN IF NOT EXISTS imprime_avant timestamptz NULL;
COMMENT ON COLUMN public.bordereaux_copies.non_imprime_le IS
  '13/11 (lot NU) : heure du dernier geste « Marquer non imprimé » sur cette copie — posée par bordereau_marquer_non_imprime ; nulle = jamais retirée (ou retrait annulé).';
COMMENT ON COLUMN public.bordereaux_copies.imprime_avant IS
  '13/11 (lot NU) : la date d''impression retirée par « Marquer non imprimé », rendue à l''identique par « Annuler » (p_retablir).';

CREATE OR REPLACE FUNCTION public.bordereau_marquer_non_imprime(p_copies uuid[], p_retablir boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_ids uuid[];
  v_n integer := 0;
  v_copies jsonb;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'session requise'; END IF;
  SELECT coalesce(array_agg(DISTINCT x), ARRAY[]::uuid[]) INTO v_ids FROM unnest(coalesce(p_copies, ARRAY[]::uuid[])) x WHERE x IS NOT NULL;
  IF cardinality(v_ids) = 0 THEN RETURN jsonb_build_object('changees', 0, 'retablir', coalesce(p_retablir, false), 'copies', '[]'::jsonb); END IF;
  IF cardinality(v_ids) > 60 THEN RAISE EXCEPTION 'trop de copies (60 au plus)'; END IF;

  IF coalesce(p_retablir, false) THEN
    -- « Annuler » : la date retirée revient à l'identique, seulement si rien ne l'a remplacée depuis.
    UPDATE bordereaux_copies b
       SET imprime_le = b.imprime_avant, imprime_avant = NULL, non_imprime_le = NULL
     WHERE b.id = ANY (v_ids) AND b.user_id = v_user AND b.efface_le IS NULL AND b.imprime_le IS NULL AND b.imprime_avant IS NOT NULL;
  ELSE
    -- Retirer : seulement une copie marquée (aucune ligne inchangée réécrite) ; la date part dans imprime_avant.
    UPDATE bordereaux_copies b
       SET imprime_avant = b.imprime_le, non_imprime_le = now(), imprime_le = NULL
     WHERE b.id = ANY (v_ids) AND b.user_id = v_user AND b.efface_le IS NULL AND b.imprime_le IS NOT NULL;
  END IF;
  GET DIAGNOSTICS v_n = ROW_COUNT;

  SELECT coalesce(jsonb_agg(jsonb_build_object('id', b.id, 'imprime_le', b.imprime_le, 'imprime_avant', b.imprime_avant,
           'non_imprime_le', b.non_imprime_le) ORDER BY b.id), '[]'::jsonb) INTO v_copies
    FROM bordereaux_copies b
   WHERE b.id = ANY (v_ids) AND b.user_id = v_user AND b.efface_le IS NULL;
  RETURN jsonb_build_object('changees', v_n, 'retablir', coalesce(p_retablir, false), 'copies', v_copies);
END;
$function$;

COMMENT ON FUNCTION public.bordereau_marquer_non_imprime(uuid[], boolean) IS
  '13/11 (lot NU) : « Marquer non imprimé » (la date part dans imprime_avant, l''heure du geste dans non_imprime_le) et son « Annuler » (p_retablir : la date revient à l''identique) — propriétaire seul, 60 au plus, aucune ligne inchangée réécrite.';
REVOKE ALL ON FUNCTION public.bordereau_marquer_non_imprime(uuid[], boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bordereau_marquer_non_imprime(uuid[], boolean) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
