-- ═══════════════════════════════════════════════════════════════════════════
-- fiche_annonces_vivantes(bigint, text) : UNE ANNONCE LEBONCOIN SOUS TRANSACTION N'EST PLUS « VIVANTE »
-- ═══════════════════════════════════════════════════════════════════════════
-- ⚠ PRÉPARÉE, NON APPLIQUÉE (05/11 soir) — STOP de Nico : 4 des 5 appelants changent de comportement, décision de Nico requise. Relecture des appelants : le comptage change AUSSI pour une PIÈCE UNIQUE qui
-- porte deux annonces Leboncoin dont l'une est sous transaction (2 fiches en prod le 05/11, aucune fiche en série) —
-- rapport du terminal « Problèmes ». Application = feu vert nommé de Nico.
-- Suite de 20261105170000 (appliquée le 05/11 à 20:26) : la vente SUIVANTE d'une fiche en série est refusée par
-- enregistrer_vente_atomique (« Plusieurs exemplaires sont possibles », réessai toutes les 6 h) tant que Leboncoin garde
-- listée « Vendu » l'annonce vendue d'avant (fiche_annonces_vivantes = 2). UNE ligne ajoutée : une annonce Leboncoin
-- sous transaction (« Achat en cours » / « Vendu », leboncoin_transaction_lue, la lecture de remises_en_vente_tick)
-- n'est plus comptée. Aucune autre ligne touchée.
-- Appelants de cette surcharge (prod, 05/11) : enregistrer_vente_atomique (2 usages), armer_retrait_job_pour,
-- armer_retraits_copies, enregistrer_ventes_prouvees, poser_questions_copies_non_prouvees, ventes_a_decider.
-- La surcharge fiche_annonces_vivantes(bigint) (RETURNS TABLE, seule lue par inventaire_doublon_evaluer) n'est PAS
-- touchée (md5 e8b77b4eb668bae9b85a755cf409823c).
-- Définition de départ lue EN PROD le 05/11 (pg_get_functiondef), md5 sans CR :
--   fiche_annonces_vivantes(bigint,text)  243f00f332d04056223f20e330c5da8f
-- md5 d'arrivée (pg_get_functiondef sur la base jetable, sans CR) : 90aa35917c373886c99917ec22dd84d6
-- Droits inchangés (CREATE OR REPLACE garde ceux de prod : service_role seul). Aucune table, aucune donnée, aucune
-- cadence touchée.
-- Inverse : supabase/rollbacks/20261105210000_fiche_annonces_vivantes_transaction_lbc_INVERSE.sql (prod mot pour mot).
-- Preuve sur un Postgres jetable : scripts/preuve-fiche-annonces-vivantes-transaction-lbc.mjs.
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
     AND NOT (ap.platform = 'leboncoin' AND COALESCE(public.leboncoin_transaction_lue(ap.transaction_plateforme, ap.capture), '') IN ('pending','sold'))
     AND ap.statut_plateforme IN ('en_ligne', 'en_verification');
$function$
;

COMMIT;
