-- INVERSE de 20261103_retraits_a_tort_etape1.sql : chaque ligne touchée reprend son état sauvegardé (fusions, fiches,
-- jobs, annonces, questions, ventes et reçus). Aucun retrait ne naît (fillsell.sans_retrait). Rien chez les plateformes.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL fillsell.sans_retrait = '1';
UPDATE public.inventaire_fusions f SET defait_le = b.defait_le FROM public._backup_0311_retraits_a_tort_fusions b WHERE f.id = b.id;
UPDATE public.inventaire i SET statut = b.statut, quantite = b.quantite, fusionne_dans = b.fusionne_dans, fusionne_le = b.fusionne_le,
       a_verifier = b.a_verifier FROM public._backup_0311_retraits_a_tort_inventaire b WHERE i.id = b.id;
UPDATE public.cross_post_jobs c SET status = b.status, inventaire_id = b.inventaire_id, sold_at = b.sold_at, platform_fields = b.platform_fields
  FROM public._backup_0311_retraits_a_tort_jobs b WHERE c.id = b.id;
UPDATE public.annonces_plateforme a SET inventaire_id = b.inventaire_id FROM public._backup_0311_retraits_a_tort_annonces b WHERE a.id = b.id;
UPDATE public.inventaire_doublons d SET statut = b.statut, decide_le = b.decide_le, decide_par = b.decide_par
  FROM public._backup_0311_retraits_a_tort_doublons b WHERE d.id = b.id;
-- ⚠️ Remettre une vente rejoue les déclencheurs ventes_push_* : relire push_trg / email avant (aucune note pour une
--    vente de plus de 24 h ; ces ventes datent du 03/11 18:15).
INSERT INTO public.ventes (id, created_at, titre, prix_achat, prix_vente, benefice, date, user_id, marque, type, description, emplacement,
  plateforme, quantite, inventaire_id, statut, selling_fees, plateforme_code, plateforme_origine, vendu_le, commande_ref, source, releve_le,
  devise, frais_plateforme, annonce_id)
SELECT v.id, v.created_at, v.titre, v.prix_achat, v.prix_vente, v.benefice, v.date, v.user_id, v.marque, v.type, v.description, v.emplacement,
  v.plateforme, v.quantite, v.inventaire_id, v.statut, v.selling_fees, v.plateforme_code, v.plateforme_origine, v.vendu_le, v.commande_ref,
  v.source, v.releve_le, v.devise, v.frais_plateforme, v.annonce_id
  FROM public._backup_0311_retraits_a_tort_ventes v WHERE NOT EXISTS (SELECT 1 FROM public.ventes w WHERE w.id = v.id);
INSERT INTO public.ventes_operations (user_id, cle, inventaire_id, job_id, resultat, cree_le)
SELECT o.user_id, o.cle, o.inventaire_id, o.job_id, o.resultat, o.cree_le FROM public._backup_0311_retraits_a_tort_operations o
 WHERE NOT EXISTS (SELECT 1 FROM public.ventes_operations w WHERE w.user_id = o.user_id AND w.cle = o.cle);
DELETE FROM public.ventes_supprimees WHERE source = 'reparation_0311' AND motif = 'vente_comptee_deux_fois'
   AND vente_id IN (SELECT id FROM public._backup_0311_retraits_a_tort_ventes);
COMMIT;
