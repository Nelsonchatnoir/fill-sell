-- (06/11, point 5) PREUVE SUR LES CAS RÉELS de 20261106120000 (version étroite du 1 c) — LECTURE SEULE :
--   npx supabase db query --linked --read-only -f scripts/essais/20261106120000_cas_reels.sql -o json
-- Pour chaque fiche : le compte de prod, celui de la version large (20261105210000, arrêtée) et celui de la version étroite.
WITH base AS (
  SELECT ap.inventaire_id, ap.user_id, ap.listing_id,
         COALESCE(public.leboncoin_transaction_lue(ap.transaction_plateforme, ap.capture), '') IN ('pending','sold') AS sous_tx,
         EXISTS (SELECT 1 FROM ventes_operations o WHERE o.user_id = ap.user_id AND o.cle = 'annonce:leboncoin:' || btrim(ap.listing_id)) AS recu
  FROM annonces_plateforme ap
  WHERE ap.platform = 'leboncoin' AND ap.inventaire_id IS NOT NULL
    AND ap.disparu_le IS NULL AND ap.retiree_le IS NULL AND ap.ignoree_le IS NULL
    AND ap.statut_plateforme IN ('en_ligne', 'en_verification')
), par_fiche AS (
  SELECT inventaire_id, min(user_id::text) u,
         count(DISTINCT listing_id) prod,
         count(DISTINCT listing_id) FILTER (WHERE NOT sous_tx) large,
         count(DISTINCT listing_id) FILTER (WHERE NOT (sous_tx AND recu)) etroite,
         count(*) FILTER (WHERE sous_tx) n_tx, count(*) FILTER (WHERE sous_tx AND recu) n_tx_recu
  FROM base GROUP BY inventaire_id
)
SELECT f.inventaire_id, p.email, i.quantite, i.statut, f.prod, f.large, f.etroite, f.n_tx, f.n_tx_recu
FROM par_fiche f JOIN inventaire i ON i.id = f.inventaire_id JOIN profiles p ON p.id = f.u::uuid
WHERE f.prod <> f.large OR f.prod <> f.etroite
ORDER BY (f.prod <> f.etroite) DESC, p.email;
