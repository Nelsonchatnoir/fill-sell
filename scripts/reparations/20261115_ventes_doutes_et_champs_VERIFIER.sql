-- LECTURE SEULE (15/11/2026) : contrôle de 20261115_ventes_doutes_remises.sql et 20261115_ventes_champs_rendus.sql.
--   npx supabase db query --linked --read-only -f scripts/reparations/20261115_ventes_doutes_et_champs_VERIFIER.sql
SELECT 'doutes' AS quoi, left(b.user_id::text, 8) AS compte, b.decision AS detail, count(*) AS n,
       count(v.id) AS en_base
  FROM public._backup_1511b_ventes_doutes b LEFT JOIN public.ventes v ON v.id = b.vente_id
 GROUP BY 2, 3
UNION ALL
SELECT 'champs', left(b.user_id::text, 8), 'prix_achat / marge / frais / marque / fiche',
       count(*) FILTER (WHERE v.prix_achat IS NOT DISTINCT FROM coalesce(b.prix_achat_avant, b.prix_achat_lu)
                          AND v.selling_fees IS NOT DISTINCT FROM coalesce(b.selling_fees_avant, b.selling_fees_lu)
                          AND v.marque IS NOT DISTINCT FROM coalesce(b.marque_avant, b.marque_lu)),
       count(*) FILTER (WHERE b.lien = 'reliee' AND v.inventaire_id = b.fiche_id)
  FROM public._backup_1511c_ventes_champs_rendus b JOIN public.ventes v ON v.id = b.id
 GROUP BY 2
UNION ALL
SELECT 'declencheurs ventes desactives', NULL, NULL,
       (SELECT count(*) FROM pg_trigger WHERE tgrelid = 'public.ventes'::regclass AND NOT tgisinternal AND tgenabled <> 'O'), NULL
UNION ALL
SELECT 'commandes en double (comptes rendus)', NULL, NULL,
       (SELECT count(*) FROM (SELECT user_id, plateforme_code, commande_ref FROM public.ventes
                               WHERE commande_ref IS NOT NULL AND user_id IN (SELECT user_id FROM public._backup_1511b_ventes_doutes)
                               GROUP BY 1, 2, 3 HAVING count(*) > 1) x), NULL
ORDER BY 1, 2, 3;
