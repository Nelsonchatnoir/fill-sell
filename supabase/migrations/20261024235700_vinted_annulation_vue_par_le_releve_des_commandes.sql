-- ═══════════════════════════════════════════════════════════════════════════
-- 20261024235700_vinted_annulation_vue_par_le_releve_des_commandes
-- (24/10 nuit, décision 1 de Nico — preuve en réel sur la vente du short) LE TROU : Nico annule la vente du short à
-- ~21:45 ; le relevé des commandes (toutes les 10 min) VOIT l'annulation à 21:51:17 (plateforme_commandes.etat =
-- « annulee », statut Vinted 520) — mais la vente restait « vendu » et la fiche aussi : seule la lecture QUOTIDIENNE des
-- ventes (enregistrer_ventes_relevees, toutes les 20 h) appelait vente_commande_annulee_vinted. La carte « Vente
-- annulée — Remettre en vente ? » serait apparue le lendemain.
-- LA RÈGLE (tous les comptes dont les commandes Vinted sont relevées) : dès que le relevé des commandes voit une
-- commande Vinted ANNULÉE, la vente qu'elle portait est retirée tout de suite — vente_commande_annulee_vinted, la même
-- fonction que le relevé des ventes (fiche au stock, retraits en attente arrêtés, remise en vente PROPOSÉE, jamais
-- automatique ; une vente saisie à la main est seulement signalée). La vente se reconnaît comme dans
-- enregistrer_ventes_relevees : son numéro de commande, ou les lignes d'une commande éclatée — JAMAIS le titre.
-- Idempotent : une vente retirée n'est plus retrouvée (le relevé quotidien ne refait rien). Erreur → tracée
-- (usage_logs « vente_annulee_vue_par_commandes_erreur »), jamais bloquante pour le relevé.
-- RATTRAPAGE BORNÉ : les commandes déjà vues annulées depuis 48 h dont la vente est encore enregistrée — mesuré le 24/10
-- à 21:55 sur tout le parc : UNE seule, le short de Nico (commande 23532974658, vente 274921).
-- Aucun mail (vente_commande_annulee_vinted n'en envoie pas), aucune autre vente touchée.
-- Application (feu vert NOMMÉ de Nico seulement) :
--   npx supabase db query --linked -f supabase/migrations/20261024235700_vinted_annulation_vue_par_le_releve_des_commandes.sql
--   npx supabase migration repair --linked --status applied 20261024235700
-- Essai à blanc (ROLLBACK) : scripts/essais/20261024235700_essai.sql
-- Inverse : supabase/rollbacks/20261024235700_vinted_annulation_vue_par_le_releve_des_commandes_INVERSE.sql
-- ═══════════════════════════════════════════════════════════════════════════
-- ═══ CORPS DE LA MIGRATION
BEGIN;

CREATE OR REPLACE FUNCTION public.vente_vinted_annulee_par_commande(p_user uuid, p_commande text, p_commande_le timestamptz, p_rattrapage boolean DEFAULT false)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_vente bigint;
  v_r jsonb;
  v_n integer := 0;
BEGIN
  IF p_user IS NULL OR nullif(btrim(coalesce(p_commande, '')), '') IS NULL THEN RETURN 0; END IF;
  FOR v_vente IN
    SELECT v.id FROM ventes v
     WHERE v.user_id = p_user AND v.plateforme_code = 'vinted'
       AND (v.commande_ref = p_commande
            OR v.id IN (SELECT ca.vente_id FROM vinted_commandes_articles ca
                         WHERE ca.user_id = p_user AND ca.commande_ref = p_commande AND ca.vente_id IS NOT NULL))
     ORDER BY v.id
  LOOP
    BEGIN
      v_r := public.vente_commande_annulee_vinted(v_vente, 'annulee', p_commande, p_commande_le);
      INSERT INTO usage_logs (user_id, feature, metadata) VALUES (p_user, 'vente_annulee_vue_par_commandes',
        jsonb_build_object('vente', v_vente, 'commande', p_commande, 'rattrapage', p_rattrapage, 'resultat', v_r));
      v_n := v_n + 1;
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO usage_logs (user_id, feature, metadata) VALUES (p_user, 'vente_annulee_vue_par_commandes_erreur',
        jsonb_build_object('vente', v_vente, 'commande', p_commande, 'rattrapage', p_rattrapage, 'erreur', left(SQLERRM, 300)));
    END;
  END LOOP;
  RETURN v_n;
END;
$function$;
REVOKE ALL ON FUNCTION public.vente_vinted_annulee_par_commande(uuid, text, timestamptz, boolean) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.plateforme_commandes_vente_annulee_vinted()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NEW.platform IS DISTINCT FROM 'vinted' OR NEW.etat IS DISTINCT FROM 'annulee' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.etat IS NOT DISTINCT FROM 'annulee' THEN RETURN NEW; END IF;
  PERFORM public.vente_vinted_annulee_par_commande(NEW.user_id, NEW.commande_ref, NEW.vendue_le, false);
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS plateforme_commandes_vente_annulee_vinted ON public.plateforme_commandes;
CREATE TRIGGER plateforme_commandes_vente_annulee_vinted
  AFTER INSERT OR UPDATE OF etat ON public.plateforme_commandes
  FOR EACH ROW WHEN (NEW.etat = 'annulee' AND NEW.platform = 'vinted')
  EXECUTE FUNCTION public.plateforme_commandes_vente_annulee_vinted();

-- Rattrapage borné (48 h) : la règle appliquée aux commandes déjà vues annulées dont la vente est encore enregistrée.
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT pc.user_id, pc.commande_ref, pc.vendue_le FROM plateforme_commandes pc
            WHERE pc.platform = 'vinted' AND pc.etat = 'annulee' AND pc.maj_le > now() - interval '48 hours'
              AND EXISTS (SELECT 1 FROM ventes v WHERE v.user_id = pc.user_id AND v.plateforme_code = 'vinted'
                            AND (v.commande_ref = pc.commande_ref
                                 OR v.id IN (SELECT ca.vente_id FROM vinted_commandes_articles ca
                                              WHERE ca.user_id = pc.user_id AND ca.commande_ref = pc.commande_ref AND ca.vente_id IS NOT NULL)))
  LOOP
    PERFORM public.vente_vinted_annulee_par_commande(r.user_id, r.commande_ref, r.vendue_le, true);
  END LOOP;
END $$;

COMMIT;
