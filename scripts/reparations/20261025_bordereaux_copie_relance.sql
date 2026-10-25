-- ═══════════════════════════════════════════════════════════════════════════
-- RÉPARATION 25/10 soir — les bordereaux Vinted des comptes Pro/Business hors bêta, refusés par le stockage
-- (« copie_http_400 ») tant que la politique bordereaux_insert exigeait la bêta messagerie.
-- La règle est corrigée pour tous (migration 20261025181000, appliquée le 25/10 à 18:02:02 ; essai sous les claims
-- de 9 comptes réels : les 7 Pro/Business acceptés, Free et Premium refusés). Ici, le cas : ce que le clic
-- « Bordereau » aurait déposé (bordereau_demander : une demande « recuperer », statut « demandee ») pour chaque
-- commande dont la DERNIÈRE demande a échoué sur la copie, relue au moment du geste :
--   · commande Vinted encore « a_expedier », bordereau « pret » chez Vinted ;
--   · aucune copie vivante, aucune demande « demandee » / « en_cours » ;
--   · compte toujours ouvert aux bordereaux (bordereaux_ouverts_pour : Pro/Business).
-- Relu à 18:05 : 31 commandes, 7 comptes (antikcollections 2, jocabroc8 4, mele.marta 1, recrutementgroupezk704 18,
-- sebastien64310 1, seghirdeborah711 4, voirememe 1). Le poste de chaque compte les prend UNE par passage (≈ 2 min),
-- comme un clic : lecture du fichier chez Vinted (rien de commandé, rien de payé), copie dans le dossier du compte.
-- Le plafond de 20 demandes par jour (bordereau_demander, bordereau_auto_pour_commande) compte ces demandes jusqu'à
-- minuit : seul recrutementgroupezk704 (19 demandes avant la relance) l'atteint — ses 18 bordereaux sont tous relancés
-- ici ; une vente neuve de ce soir aurait le sien au premier clic de demain.
-- Rien n'est publié, retiré ni envoyé ; aucun mail, aucune notification (aucun déclencheur sur bordereaux_demandes).
-- Sauvegarde : _backup_2510_bordereaux_relance (les identifiants posés). Inverse : 20261025_bordereaux_copie_relance_INVERSE.sql
-- (retire les demandes posées par ce script qu'aucun poste n'a encore prises).
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE TABLE IF NOT EXISTS public._backup_2510_bordereaux_relance (
  sauvegarde_le timestamptz NOT NULL DEFAULT now(),
  demande_id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  commande_id uuid NOT NULL,
  demande_echouee uuid NOT NULL,
  motif_echec text
);
ALTER TABLE public._backup_2510_bordereaux_relance ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public._backup_2510_bordereaux_relance FROM PUBLIC, anon, authenticated;

DO $$
DECLARE r record; v_id uuid; n integer := 0;
BEGIN
  FOR r IN
    WITH dern AS (
      SELECT DISTINCT ON (d.commande_id) d.id, d.user_id, d.commande_id, d.statut, d.motif, d.copie_id
        FROM public.bordereaux_demandes d
       WHERE d.commande_id IN (SELECT x.commande_id FROM public.bordereaux_demandes x
                                WHERE x.motif LIKE 'copie_http_%' AND x.cree_le > now() - interval '72 hours')
       ORDER BY d.commande_id, d.cree_le DESC
    )
    SELECT dern.* FROM dern
      JOIN public.plateforme_commandes pc ON pc.id = dern.commande_id AND pc.user_id = dern.user_id
     WHERE dern.motif LIKE 'copie_http_%' AND dern.copie_id IS NULL
       AND dern.statut IN ('echec', 'generee')
       AND pc.platform = 'vinted' AND pc.etat = 'a_expedier' AND pc.bordereau = 'pret'
       AND public.bordereaux_ouverts_pour(dern.user_id, 'vinted')
       AND NOT EXISTS (SELECT 1 FROM public.bordereaux_copies b WHERE b.commande_id = dern.commande_id
                        AND b.user_id = dern.user_id AND b.efface_le IS NULL AND b.expire_le > now())
       AND NOT EXISTS (SELECT 1 FROM public.bordereaux_demandes y WHERE y.commande_id = dern.commande_id
                        AND y.statut IN ('demandee', 'en_cours'))
     ORDER BY dern.user_id, dern.commande_id
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
  IF n <> 31 THEN RAISE EXCEPTION 'attendu 31 demandes (relu à 18:05), posées % — rien n''est fait', n; END IF;
  RAISE NOTICE 'demandes posées : %', n;
END $$;

SELECT split_part(p.email, '@', 1) AS compte, count(*) AS demandes_posees
  FROM public._backup_2510_bordereaux_relance b JOIN public.profiles p ON p.id = b.user_id
 GROUP BY 1 ORDER BY 1;
COMMIT;
