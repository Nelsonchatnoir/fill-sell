-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 20261113153000_bordereau_imprime_le — LE BORDEREAU DATÉ ET LE REPÈRE « DÉJÀ IMPRIMÉ »
-- (13/11, étape 5 du lot « zéro problème », demande de Nico pour le compte faf5021a : « MIGRATION imprime_le ; « Bordereau du JJ/MM ·
-- Imprimé le JJ/MM » ; « Tout imprimer » = les non imprimés, avec « Tout réimprimer » à côté »). NON APPLIQUÉE : feu vert
-- de Nico requis.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- CONSTAT (lecture seule, 12-13/11) : bordereaux_copies (id, user_id, commande_id, chemin, taille_octets, cree_le,
-- expire_le, efface_le) ne garde AUCUNE trace d'impression ; usage_logs des comptes faf5021a et de son relié 447d920c (
-- 14 j, features bordereau/imprim/etiquette/label/expedi/partage) : 0 ligne. Entre l'impression et le dépôt du colis,
-- rien ne distingue un bordereau imprimé d'un autre (447d920c : 7 copies en 10 jours, la dernière 0c962910 le 10/11).
--   1. bordereaux_copies.imprime_le timestamptz NULL — le PREMIER geste d'impression réussi (aperçu ou « Tout imprimer » :
--      partager / imprimer / télécharger). Nulle = pas encore imprimée. Le repère suit la COPIE : une copie régénérée
--      repart « pas encore imprimée ». Aucune ligne existante n'est réécrite (colonne nulle partout).
--   2. bordereau_marquer_imprime(p_copies uuid[]) — NOUVELLE, plpgsql, SECURITY DEFINER (la RLS de bordereaux_copies
--      n'a AUCUNE politique d'écriture, règle du 16/10 : tout passe par les fonctions) :
--      · session requise (auth.uid()) ; propriétaire SEUL (user_id = auth.uid()) : la copie d'un autre compte n'est ni
--        touchée ni nommée dans la réponse ; copie effacée (efface_le) ignorée ;
--      · idempotente : imprime_le = coalesce(imprime_le, now()) — le premier horodatage est gardé, un second appel ne
--        réécrit RIEN (WHERE imprime_le IS NULL : aucune ligne inchangée réécrite) ;
--      · bornée : 60 copies au plus par appel (la page « À expédier » en lit 60) ;
--      · rend { marquees, copies: [{id, imprime_le}] } — les copies du compte demandées, marquées ou déjà marquées.
--      Droits : authenticated (et service_role) ; jamais anon ni PUBLIC.
-- ⛔ RLS, politiques et droits de la table : INCHANGÉS (lecture de SES lignes ; la nouvelle colonne est lue par la même
--    politique). Aucune autre fonction touchée. Aucun usage_logs (données personnelles minimum, règle du 16/10).
-- L'app (src/messagerie/SectionAExpedier.jsx) lit imprime_le À PART et tolère son absence : elle peut partir AVANT cette
-- migration (repère inconnu = la date seule, « Tout imprimer » comme avant ; l'appel de la RPC absente est sans effet).
-- Coût : une mise à jour par PK (60 au plus) par geste d'impression ; aucun déclencheur, aucun index.
-- Banc : node scripts/essais/20261113153000_banc.mjs (Postgres jetable : avant / migration / inverse / rejouée).
-- Inverse : supabase/rollbacks/20261113153000_bordereau_imprime_le_INVERSE.sql (la colonne et la RPC retirées).
-- À jouer (feu vert de Nico) : npx supabase db query --linked -f supabase/migrations/20261113153000_bordereau_imprime_le.sql
--   puis npx supabase migration repair --linked --status applied 20261113153000  (version à relire contre « migration list »).
BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE public.bordereaux_copies ADD COLUMN IF NOT EXISTS imprime_le timestamptz NULL;
COMMENT ON COLUMN public.bordereaux_copies.imprime_le IS
  '13/11 (étape 5) : premier geste d''impression réussi de cette copie (aperçu ou « Tout imprimer » : partager, imprimer, télécharger) — posé par bordereau_marquer_imprime ; nulle = pas encore imprimée.';

CREATE OR REPLACE FUNCTION public.bordereau_marquer_imprime(p_copies uuid[])
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
  IF cardinality(v_ids) = 0 THEN RETURN jsonb_build_object('marquees', 0, 'copies', '[]'::jsonb); END IF;
  IF cardinality(v_ids) > 60 THEN RAISE EXCEPTION 'trop de copies (60 au plus)'; END IF;

  -- Idempotente : seule une copie DU COMPTE, non effacée et pas encore marquée est écrite ; le premier horodatage reste.
  UPDATE bordereaux_copies b
     SET imprime_le = coalesce(b.imprime_le, now())
   WHERE b.id = ANY (v_ids) AND b.user_id = v_user AND b.efface_le IS NULL AND b.imprime_le IS NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT;

  SELECT coalesce(jsonb_agg(jsonb_build_object('id', b.id, 'imprime_le', b.imprime_le) ORDER BY b.id), '[]'::jsonb) INTO v_copies
    FROM bordereaux_copies b
   WHERE b.id = ANY (v_ids) AND b.user_id = v_user AND b.efface_le IS NULL;
  RETURN jsonb_build_object('marquees', v_n, 'copies', v_copies);
END;
$function$;

COMMENT ON FUNCTION public.bordereau_marquer_imprime(uuid[]) IS
  '13/11 (étape 5) : marque « imprimées » les copies de bordereau du compte appelant (premier horodatage gardé, idempotente, 60 au plus) — appelée par l''app quand l''aperçu ou « Tout imprimer » réussit.';
REVOKE ALL ON FUNCTION public.bordereau_marquer_imprime(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bordereau_marquer_imprime(uuid[]) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
