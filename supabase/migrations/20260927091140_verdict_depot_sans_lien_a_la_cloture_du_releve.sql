-- ═══════════════════════════════════════════════════════════════════════════
-- LE VERDICT « DÉPÔT JAMAIS MIS EN LIGNE » SE REND À LA CLÔTURE DU RELEVÉ (27/09)
-- APPLIQUÉE le 27/09 à 11:12 (GO Nico, CLI db query -f), après rejeu en
-- transaction annulée : relevé incomplet → rien ; relevés complets → exactement
-- 3 jobs Leboncoin tranchés (8147f963, c9a75a0a, 571696d3), aucun autre statut
-- touché ; seconde clôture → aucun second remboursement ; droits : postgres,
-- service_role. Les 3 jobs seront tranchés par les PROCHAINS relevés, pas à la main.
-- ═══════════════════════════════════════════════════════════════════════════
-- trancher_publications_sans_lien (20260923213000) exige un relevé CLOS :
-- status = 'done', items_vus rempli (ou « [vide] »). Or l'extension appelle
-- rapprocher_releve — qui l'appelait — AVANT le PATCH final du run, celui qui
-- pose status = 'done', items_vus et l'erreur. Au moment de l'appel, le run
-- est encore 'running' : réponse « releve_non_probant », à chaque fois. Aucun
-- verdict automatique depuis le 23/09 (les 5 du 23/09 ont été posés à la main).
-- Constaté sur Louis (job 8147f963, annonce Leboncoin 3275973140 « désactivée »,
-- absente des relevés complets du 25/09 18:35 et du 26/09 14:45) : rejoué en
-- transaction annulée, 3 jobs Leboncoin du parc auraient été tranchés.
--
-- Correctif, UN SEUL : un trigger AFTER UPDATE OF status sur vinted_sync_runs
-- appelle trancher_publications_sans_lien au passage à 'done', avec les MÊMES
-- gardes de complétude que rapprocher_releve (v_complet) :
--   · pas « [incomplet] », pas hors-liste (releve_hors_liste), eBay complet
--     (releve_ebay_run_incomplet), pas un relevé vide d'un compte qui avait des
--     annonces (releve_compte_avait_annonces) ;
--   · trancher_publications_sans_lien garde les siennes : status 'done',
--     items_vus > 0 ou « [vide] », relevé commencé ≥ 2 h après le dépôt,
--     identifiant certain, absent de TOUT relevé ; une annonce présente sous
--     un autre statut n'est pas tranchée.
-- Seuls les jobs publish 'published' sans lien sont concernés ; les autres
-- statuts ne bougent pas. Remboursement : refund_publish_unconfirmed, une
-- seule fois par job (ref unique dans coin_ledger) — et un job tranché passe
-- 'failed', il n'est plus jamais re-sélectionné.
-- Jamais bloquant pour le relevé : toute erreur est avalée (WARNING).
-- rapprocher_releve n'est pas modifié (son appel reste sans effet avant 'done').

CREATE OR REPLACE FUNCTION public.releve_clos_tranche_publications()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_vus      integer;
  v_verdicts jsonb;
BEGIN
  IF COALESCE(NEW.erreur, '') LIKE '[incomplet]%' THEN RETURN NULL; END IF;
  IF releve_hors_liste(NEW.erreur) THEN RETURN NULL; END IF;
  IF NEW.platform = 'ebay' AND releve_ebay_run_incomplet(NEW.id) THEN RETURN NULL; END IF;
  SELECT count(*) INTO v_vus FROM annonces_plateforme WHERE run_id = NEW.id;
  IF v_vus = 0 AND releve_compte_avait_annonces(NEW.user_id, NEW.platform) THEN RETURN NULL; END IF;
  BEGIN
    v_verdicts := trancher_publications_sans_lien(NEW.user_id, NEW.platform, NEW.id);
    IF COALESCE((v_verdicts->>'refusees')::int, 0) + COALESCE((v_verdicts->>'en_ligne')::int, 0) > 0 THEN
      RAISE LOG 'releve_clos_tranche_publications : run % (%) → %', NEW.id, NEW.platform, v_verdicts;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'releve_clos_tranche_publications : run % : %', NEW.id, SQLERRM;
  END;
  RETURN NULL;
END
$function$;

REVOKE ALL ON FUNCTION public.releve_clos_tranche_publications() FROM public, anon, authenticated;

DROP TRIGGER IF EXISTS releve_clos_tranche_publications ON public.vinted_sync_runs;
CREATE TRIGGER releve_clos_tranche_publications
  AFTER UPDATE OF status ON public.vinted_sync_runs
  FOR EACH ROW
  WHEN (NEW.status = 'done' AND OLD.status IS DISTINCT FROM 'done'
        AND NEW.kind = 'annonces' AND NEW.platform IN ('leboncoin', 'beebs', 'ebay', 'opla'))
  EXECUTE FUNCTION public.releve_clos_tranche_publications();
