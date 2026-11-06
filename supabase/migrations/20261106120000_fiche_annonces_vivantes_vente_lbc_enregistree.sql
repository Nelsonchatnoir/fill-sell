-- ═══════════════════════════════════════════════════════════════════════════
-- fiche_annonces_vivantes(bigint, text) — VERSION ÉTROITE DU POINT 1 c (06/11, ordre de Nico, point 5)
-- ⚠ PRÉPARÉE, NON APPLIQUÉE : application = feu vert NOMMÉ de Nico. Remplace la version large 20261105210000 (arrêtée
-- le 05/11 : 4 des 5 appelants changeaient de comportement), qui ne doit JAMAIS être appliquée avec celle-ci.
-- ═══════════════════════════════════════════════════════════════════════════
-- Le défaut (suite de 20261105170000) : la vente SUIVANTE d'une fiche en série est refusée par enregistrer_vente_atomique
-- (« Plusieurs exemplaires sont possibles », réessai toutes les 6 h) tant que Leboncoin garde listée « Achat en cours » /
-- « Vendu » l'annonce dont la vente est DÉJÀ enregistrée : avec l'annonce remise en vente, la fiche compte 2 annonces
-- Leboncoin vivantes.
-- UNE ligne ajoutée, plus étroite que 20261105210000 : n'est plus comptée qu'une annonce Leboncoin sous transaction
-- (leboncoin_transaction_lue : pending / sold) DONT LA VENTE EST DÉJÀ ENREGISTRÉE — le reçu ventes_operations
-- « annonce:leboncoin:<n°> » du même compte (posé par enregistrer_vente_atomique, effacé quand la vente est annulée :
-- l'annonce recompte alors). Une transaction pas encore enregistrée compte toujours : la première vente, les questions,
-- les retraits et les deux pièces uniques du 05/11 (jocabroc8 1790174155261, manon.simon14 1791656197832) ne bougent pas.
-- Preuve sur les cas réels (prod relue en lecture seule le 06/11 vers 10:30, scripts/essais/20261106120000_cas_reels.sql) :
--   · 152 fiches (36 comptes : 145 vendues, 7 en série au stock) voient leur compte changer, toutes de 1 à 0 ; les appelants ne lisent ce compte qu'au seuil 2
--     (>= 2, > 1, < 2 : armer_retrait_job_pour, armer_retraits_copies, enregistrer_vente_atomique ×2,
--     enregistrer_ventes_prouvees, poser_questions_copies_non_prouvees ×2, ventes_a_decider) → AUCUNE décision ne change
--     aujourd'hui (0 fiche ne franchit le seuil) ; la version large en changeait 238 dont 2 au seuil — les deux pièces uniques ;
--   · l'effet voulu, sur les 7 fiches en série de Louis vendues le 06/11 à 07:15 : dès que le relevé voit l'annonce
--     remise en vente (publiée 07:20), la prod compte 2 et refuse la vente suivante ; cette version compte 1.
-- La surcharge fiche_annonces_vivantes(bigint) (inventaire_doublon_evaluer) n'est PAS touchée. Droits inchangés.
-- Définition de départ : pg_get_functiondef de la PROD du 06/11 (scripts/essais/fixtures/prod-0611-1c-etroite).
-- Banc : scripts/essais/20261106120000_banc.mjs. Inverse : supabase/rollbacks/20261106120000_fiche_annonces_vivantes_vente_lbc_enregistree_INVERSE.sql.
BEGIN;

CREATE OR REPLACE FUNCTION public.fiche_annonces_vivantes(p_inventaire bigint, p_platform text)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT count(DISTINCT ap.listing_id)::int FROM annonces_plateforme ap
   WHERE ap.inventaire_id = p_inventaire AND ap.platform = p_platform
     AND ap.disparu_le IS NULL AND ap.retiree_le IS NULL AND ap.ignoree_le IS NULL
     AND NOT (ap.platform = 'leboncoin'
              AND COALESCE(public.leboncoin_transaction_lue(ap.transaction_plateforme, ap.capture), '') IN ('pending', 'sold')
              AND EXISTS (SELECT 1 FROM public.ventes_operations o
                           WHERE o.user_id = ap.user_id AND o.cle = 'annonce:leboncoin:' || btrim(ap.listing_id)))
     AND ap.statut_plateforme IN ('en_ligne', 'en_verification');
$function$
;

COMMIT;
