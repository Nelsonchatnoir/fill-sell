-- (05/11, point 12 — ordre de Nico : « Répare ce cas par script (sauvegarde + inverse) ») UNE VENTE LEBONCOIN VA AU COMPTE
-- QUI POSSÈDE L'ANNONCE.
-- Cause (règle corrigée à part, extension 0.6.174) : le lecteur des transactions Leboncoin n'envoyait AUCUN numéro
-- d'annonce ; entre deux comptes FillSell reliés qui partagent le même compte Leboncoin (délégation), la vente s'écrivait
-- chez le compte qui relevait le premier (enregistrer_ventes_relevees : la règle « l'annonce suivie par le compte relié
-- lui appartient » exige un numéro). Le 05/11 09:53, le cycle délégué de louis-seller a écrit la vente « Rangement Noir et
-- Gris » (transaction 370563621), dont l'annonce 3297299585 est celle d'Amiral.
-- RÈGLE de ce script (jamais un compte nommé) : une vente Leboncoin relevée (source 'releve', numéro de transaction), sans
-- fiche ni annonce, sur un compte relié, dont le titre ET le prix sont exactement ceux d'UNE annonce Leboncoin publiée avant
-- la vente par le compte RELIÉ — annonce que Leboncoin a marquée vendue (relevé : transaction_plateforme 'sold') —, alors
-- que le compte qui l'a écrite n'a aucune annonce Leboncoin de ce titre, et que le compte relié n'a pas déjà cette
-- transaction : elle passe au compte relié. Rien d'autre ne change (ni fiche, ni annonce, ni montant ; annonce_id reste vide,
-- le lecteur 0.6.174 le lira). Aucun déclencheur de `ventes` ne joue sur une mise à jour (AFTER INSERT / DELETE seulement) :
-- ni mail, ni push, ni retrait. Simulé sur la prod le 05/11 : 1 vente (458084) sur tout le parc.
-- Sauvegarde : public._backup_0511_vente_lbc_compte_proprietaire. Inverse : 20261105_regle_vente_lbc_compte_proprietaire_INVERSE.sql.
BEGIN;
CREATE TABLE public._backup_0511_vente_lbc_compte_proprietaire AS
WITH ventes_lbc AS (
  SELECT v.id, v.user_id, v.titre, v.prix_vente, v.vendu_le, v.commande_ref
    FROM public.ventes v
   WHERE v.plateforme_code = 'leboncoin' AND v.source = 'releve' AND v.commande_ref IS NOT NULL
     AND v.inventaire_id IS NULL AND v.annonce_id IS NULL
     AND EXISTS (SELECT 1 FROM public.comptes_lies cl WHERE cl.user_a = v.user_id OR cl.user_b = v.user_id)
), cand AS (
  SELECT DISTINCT v.id, v.user_id AS de, j.user_id AS vers, btrim(j.platform_listing_id) AS annonce
    FROM ventes_lbc v
    JOIN public.cross_post_jobs j ON j.platform = 'leboncoin' AND j.action IN ('publish', 'republish') AND j.user_id <> v.user_id
         AND public.comptes_sont_lies(v.user_id, j.user_id)
         AND btrim(j.title) = btrim(v.titre) AND j.price = v.prix_vente
         AND NULLIF(btrim(j.platform_listing_id), '') IS NOT NULL
         AND coalesce(j.published_at, j.created_at) <= v.vendu_le
    JOIN public.annonces_plateforme a ON a.user_id = j.user_id AND a.platform = 'leboncoin' AND a.listing_id = btrim(j.platform_listing_id)
         AND a.transaction_plateforme = 'sold'
   WHERE NOT EXISTS (SELECT 1 FROM public.cross_post_jobs k WHERE k.user_id = v.user_id AND k.platform = 'leboncoin' AND btrim(k.title) = btrim(v.titre))
     AND NOT EXISTS (SELECT 1 FROM public.ventes w WHERE w.user_id = j.user_id AND w.plateforme_code = 'leboncoin' AND w.commande_ref = v.commande_ref)
)
SELECT now() AS le, c.id AS vente_id, c.de AS user_id_avant, c.vers AS user_id_apres, c.annonce
  FROM cand c
 WHERE (SELECT count(DISTINCT c2.annonce) FROM cand c2 WHERE c2.id = c.id) = 1;   -- une seule annonce possible, sinon rien
ALTER TABLE public._backup_0511_vente_lbc_compte_proprietaire ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_0511_vente_lbc_compte_proprietaire FROM PUBLIC, anon, authenticated;
DO $$
DECLARE v_n int;
BEGIN
  IF (SELECT count(*) FROM public._backup_0511_vente_lbc_compte_proprietaire) > 3 THEN
    RAISE EXCEPTION 'plus de 3 ventes : rien n''est écrit, à relire';
  END IF;
  UPDATE public.ventes v SET user_id = b.user_id_apres
    FROM public._backup_0511_vente_lbc_compte_proprietaire b
   WHERE v.id = b.vente_id AND v.user_id = b.user_id_avant;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RAISE NOTICE 'ventes rendues à leur compte : %', v_n;
END $$;
SELECT b.vente_id, left(b.user_id_avant::text, 8) AS avant, left(v.user_id::text, 8) AS apres, b.annonce
  FROM public._backup_0511_vente_lbc_compte_proprietaire b JOIN public.ventes v ON v.id = b.vente_id;
COMMIT;
