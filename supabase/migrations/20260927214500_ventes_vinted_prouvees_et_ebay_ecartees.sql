-- APPLIQUÉ le 27/09/2026 vers 20:45 (décisions de Nico, audit synchro) — trace
-- des deux écritures faites en SQL, rejouables sans effet (idempotentes).
--
-- 1. van-breugel.sandra : ses annonces eBay dont elle a supprimé la fiche en
--    gardant l'annonce (fiche_supprimee_le) sont ÉCARTÉES VOLONTAIREMENT
--    (ignoree_le + rapprochement 'ignore' motif ecartee_volontairement) : aucun
--    relevé ne les recrée, elles ne sont plus proposées au rattachement.
WITH u AS (SELECT id FROM profiles WHERE split_part(email, '@', 1) = 'van-breugel.sandra'),
maj AS (
  UPDATE annonces_plateforme a SET ignoree_le = now(), proposition = NULL, updated_at = now()
    FROM u WHERE a.user_id = u.id AND a.platform = 'ebay' AND a.fiche_supprimee_le IS NOT NULL
      AND a.inventaire_id IS NULL AND a.ignoree_le IS NULL
  RETURNING a.id, a.user_id)
INSERT INTO rapprochements (user_id, annonce_id, inventaire_id, decision, par, score, detail)
SELECT maj.user_id, maj.id, NULL, 'ignore', 'auto', 0,
       jsonb_build_object('motif', 'ecartee_volontairement',
                          'raison', 'fiche supprimée par la personne, annonce gardée en ligne — décision Nico 27/09 : ne pas réimporter')
  FROM maj;

-- 2. Ventes Vinted PROUVÉES restées « en stock » : 29 fiches (comptes vus sur
--    30 jours) dont l'annonce Vinted est vendue selon Vinted (vinted_status
--    'sold' ET dernier instantané 'sold'), quantité 1 → statut 'vendu'. Le
--    trigger inventaire_vendu_retire_ses_copies arme le retrait de leurs
--    copies encore en ligne (Louis : Beebs et Leboncoin ; nadegemarcelin78 :
--    4 retraits Opla existaient déjà, en attente de son geste). Les fiches
--    multi-stock (quantité > 1 : Louis ×2, quantité 9999) ne sont PAS touchées.
--    Aucune ligne « ventes » créée : le chiffre d'affaires de ces ventes n'est
--    pas saisi.
UPDATE inventaire i SET statut = 'vendu'
  FROM profiles p
 WHERE p.id = i.user_id AND i.vinted_status = 'sold' AND i.statut = 'stock' AND i.fusionne_dans IS NULL
   AND COALESCE(i.quantite, 1) <= 1 AND p.extension_last_seen_at > now() - interval '30 days'
   AND vinted_annonce_vendue(i.user_id, i.vinted_item_id);
