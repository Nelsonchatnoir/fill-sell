-- ═══════════════════════════════════════════════════════════════════════════
-- RÉPARATION 25/10 soir (suite de 20261025_bordereaux_copie_relance.sql) — UN second essai pour les 4 bordereaux dont la
-- relance de 18:06 est tombée sur un onglet Vinted qui ne répondait pas (« onglet_fige », 45 s sans réponse :
-- antikcollections 18:06:56 et 18:11:05, seghirdeborah711 18:11:22 et 18:13:22). Relu à 19:20 : le poste de
-- seghirdeborah711 est vivant (19:18), celui d'antikcollections muet depuis 18:47 (sa demande l'attend, 24 h au plus) ;
-- la règle de stockage n'y est pour rien. Même geste que le clic « Bordereau » (une demande « recuperer »), mêmes
-- conditions relues au moment du geste : commande « a_expedier » / « pret », aucune copie vivante, aucune demande en cours.
-- Une seule fois : un nouvel échec reste affiché dans « À expédier » avec son motif (le bouton reste).
-- Sauvegarde : la même table _backup_2510_bordereaux_relance ; inverse : 20261025_bordereaux_copie_relance_INVERSE.sql
-- (retire toute demande de la relance qu'aucun poste n'a prise). 0 mail, 0 notification.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
DO $$
DECLARE r record; v_id uuid; n integer := 0;
BEGIN
  FOR r IN
    SELECT d.id, d.user_id, d.commande_id, d.motif
      FROM public._backup_2510_bordereaux_relance b
      JOIN public.bordereaux_demandes d ON d.id = b.demande_id
      JOIN public.plateforme_commandes pc ON pc.id = d.commande_id AND pc.user_id = d.user_id
     WHERE d.statut = 'echec' AND d.motif = 'onglet_fige'
       AND pc.platform = 'vinted' AND pc.etat = 'a_expedier' AND pc.bordereau = 'pret'
       AND public.bordereaux_ouverts_pour(d.user_id, 'vinted')
       AND NOT EXISTS (SELECT 1 FROM public.bordereaux_copies c WHERE c.commande_id = d.commande_id
                        AND c.user_id = d.user_id AND c.efface_le IS NULL AND c.expire_le > now())
       AND NOT EXISTS (SELECT 1 FROM public.bordereaux_demandes y WHERE y.commande_id = d.commande_id
                        AND y.statut IN ('demandee', 'en_cours'))
       -- jamais une troisième fois : la commande n'a pas déjà une seconde relance
       AND (SELECT count(*) FROM public._backup_2510_bordereaux_relance x WHERE x.commande_id = d.commande_id) = 1
  LOOP
    INSERT INTO public.bordereaux_demandes (user_id, commande_id, platform)
    VALUES (r.user_id, r.commande_id, 'vinted')
    ON CONFLICT (commande_id) WHERE statut IN ('demandee', 'en_cours') DO NOTHING
    RETURNING id INTO v_id;
    IF v_id IS NOT NULL THEN
      INSERT INTO public._backup_2510_bordereaux_relance (demande_id, user_id, commande_id, demande_echouee, motif_echec)
      VALUES (v_id, r.user_id, r.commande_id, r.id, r.motif);
      n := n + 1;
    END IF;
  END LOOP;
  IF n <> 4 THEN RAISE EXCEPTION 'attendu 4 demandes (relu à 19:20), posées % — rien n''est fait', n; END IF;
  RAISE NOTICE 'demandes posées : %', n;
END $$;
SELECT split_part(p.email, '@', 1) AS compte, count(*) AS demandes_en_file
  FROM public._backup_2510_bordereaux_relance b JOIN public.bordereaux_demandes d ON d.id = b.demande_id
  JOIN public.profiles p ON p.id = b.user_id
 WHERE d.statut = 'demandee' GROUP BY 1 ORDER BY 1;
COMMIT;
