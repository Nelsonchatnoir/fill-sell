-- ═══════════════════════════════════════════════════════════════════════════
-- VENTE NON PROUVÉE : ON DÉFAIT LE « VENDU », ON NE RETIRE RIEN (27/09 soir)
-- ═══════════════════════════════════════════════════════════════════════════
-- Revue une par une des 36 annonces encore en ligne sur une fiche « vendue »
-- (27/09 ~23:00). Preuves acceptées : statut Vinted « sold », signal de vente
-- d'une plateforme (sale_signal), vente relevée (commande), ou vente saisie par
-- la personne SANS contradiction. 35 sont prouvées. Une ne l'est pas :
--
-- misscat801, « Robe fleurie noire – Taille 48 Word fashion » (fiche
-- 1787988010670005) : vente saisie à la main le 22/09 08:23 avec la plateforme
-- « vinted », mais l'annonce Vinted 9725365173 était TOUJOURS EN LIGNE au
-- relevé du 23/09 09:24 (vinted_status 'active'), aucun signal de vente,
-- aucune commande. Le retrait Beebs (34007470) avait été armé ce soir par le
-- rattrapage des relevés (« releve_fiche_vendue »), sur la seule foi du
-- statut de la fiche. Consigne de Nico : bloquer ce retrait tant que la vente
-- n'est pas prouvée.
--
-- Ce que fait cette migration : la fiche repasse « en stock » (le trigger
-- inventaire_vente_annulee_retraits annule les retraits en attente) et le
-- retrait Beebs est annulé explicitement, avec sa raison. La vente saisie
-- (ventes 22379, non reliée à la fiche) n'est PAS touchée : c'est sa saisie.
-- Si Vinted marque l'annonce vendue, la synchro du dressing repassera la fiche
-- en « vendu » et les retraits seront armés — avec une preuve, cette fois.
-- Rien n'est retiré ni supprimé.

UPDATE inventaire SET statut = 'stock'
 WHERE id = 1787988010670005 AND statut = 'vendu' AND vinted_status = 'active';

UPDATE cross_post_jobs j SET
  status = 'cancelled',
  error = 'Retrait bloqué : la vente n''est pas prouvée — l''annonce Vinted de cet article est toujours en ligne. '
       || 'Rien n''a été retiré. Si l''article est bien vendu, marque la vente sur Vinted : le retrait des autres annonces se fera alors tout seul.',
  platform_fields = COALESCE(j.platform_fields, '{}'::jsonb) || jsonb_build_object(
    'retrait_bloque', jsonb_build_object('le', now(), 'motif', 'vente_non_prouvee_vinted_en_ligne',
                                         'par', 'migration 20260927233000 (consigne Nico)'))
 WHERE j.inventaire_id = 1787988010670005 AND j.action = 'delete'
   AND j.status IN ('pending', 'needs_user');
