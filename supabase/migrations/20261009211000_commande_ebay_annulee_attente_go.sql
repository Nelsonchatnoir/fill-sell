-- ═══════════════════════════════════════════════════════════════════════════
-- COMMANDES eBAY ANNULÉES : LE STOCK D'AVANT LA RÈGLE ATTEND LE GO DE NICO (09/10 soir)
-- ═══════════════════════════════════════════════════════════════════════════
-- 20261009210000 retire, au relevé suivant, la vente née du relevé dont la commande
-- est remboursée/annulée. Ordre de Nico : « combien de ventes eBay déjà écrites portent
-- une commande remboursée/annulée ? le chiffre et la liste AVANT de les retirer, j'attends
-- mon GO ». Cette migration met la règle EN PAUSE (coin_config, journalisé) le temps de
-- lister le parc, puis la liste est posée dans ventes_annulees_attente_go et la pause
-- levée : la règle vaut pour tout ce qui arrive ensuite, la liste attend le GO.
-- Inverse : scripts/reparations/20261009_inverse_commande_ebay_annulee_attente_go.sql
CREATE TABLE IF NOT EXISTS public.ventes_annulees_attente_go (
  vente_id     bigint PRIMARY KEY,
  user_id      uuid NOT NULL,
  commande_ref text,
  statut       text,
  liste_le     timestamptz NOT NULL DEFAULT now(),
  decision     text CHECK (decision IN ('retirer', 'garder')),
  decide_le    timestamptz
);
ALTER TABLE public.ventes_annulees_attente_go ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ventes_annulees_attente_go TO authenticated;
DROP POLICY IF EXISTS ventes_annulees_attente_go_lecture ON public.ventes_annulees_attente_go;
CREATE POLICY ventes_annulees_attente_go_lecture ON public.ventes_annulees_attente_go
  FOR SELECT TO authenticated USING (user_id = auth.uid());
INSERT INTO public.coin_config (key, value, updated_at) VALUES ('ventes_annulees_retrait_pause', 1, now())
  ON CONFLICT (key) DO UPDATE SET value = 1, updated_at = now();

CREATE OR REPLACE FUNCTION public.vente_commande_annulee(p_vente bigint, p_statut text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v ventes%ROWTYPE; i inventaire%ROWTYPE; v_dec text; v_rendue boolean := false; v_jobs uuid[] := '{}';
BEGIN
  SELECT * INTO v FROM ventes WHERE id = p_vente;
  IF NOT FOUND THEN RETURN jsonb_build_object('action', 'introuvable'); END IF;
  -- (09/10 soir, Nico) LE STOCK D'AVANT LA RÈGLE ATTEND SON GO : les ventes déjà
  -- écrites dont la commande était remboursée/annulée au moment de la mise en
  -- service sont listées (ventes_annulees_attente_go) et ne sont retirées que sur
  -- décision ; pendant l'établissement de la liste, la règle est en pause.
  IF coalesce((SELECT value FROM coin_config WHERE key = 'ventes_annulees_retrait_pause'), 0) = 1 THEN
    RETURN jsonb_build_object('action', 'en_pause');
  END IF;
  IF EXISTS (SELECT 1 FROM ventes_annulees_attente_go g WHERE g.vente_id = v.id AND g.decision IS NULL) THEN
    RETURN jsonb_build_object('action', 'en_attente_go');
  END IF;
  IF coalesce(v.source, '') <> 'releve' THEN
    IF NOT EXISTS (SELECT 1 FROM usage_logs u WHERE u.user_id = v.user_id AND u.feature = 'vente_saisie_commande_annulee'
                    AND u.metadata ->> 'vente' = v.id::text) THEN
      INSERT INTO usage_logs (user_id, feature, metadata) VALUES (v.user_id, 'vente_saisie_commande_annulee',
        jsonb_build_object('vente', v.id::text, 'commande', v.commande_ref, 'statut', p_statut, 'plateforme', v.plateforme_code,
                           'titre', v.titre, 'prix_vente', v.prix_vente, 'motif', 'vente_saisie_jamais_retiree'));
    END IF;
    RETURN jsonb_build_object('action', 'signalee');
  END IF;
  IF v.inventaire_id IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(v.user_id::text || ':' || v.inventaire_id::text, 0));
  END IF;
  SELECT decision INTO v_dec FROM ventes_ebay_exemplaires WHERE vente_id = v.id;
  INSERT INTO ventes_supprimees (user_id, plateforme_code, commande_ref, annonce_id, titre, prix_vente, vendu_le, vente_id, supprimee_le, source, motif)
  VALUES (v.user_id, v.plateforme_code, v.commande_ref, v.annonce_id, v.titre, v.prix_vente, v.vendu_le, v.id, now(),
          'releve_' || coalesce(v.plateforme_code, ''), 'commande_' || lower(coalesce(p_statut, 'annulee')));
  INSERT INTO usage_logs (user_id, feature, metadata) VALUES (v.user_id, 'vente_retiree',
    jsonb_build_object('vente', to_jsonb(v), 'statut', p_statut, 'source', 'releve_' || coalesce(v.plateforme_code, ''),
                       'motif', 'commande_' || lower(coalesce(p_statut, 'annulee'))));
  DELETE FROM ventes WHERE id = v.id;

  IF v_dec = 'vendue' AND v.inventaire_id IS NOT NULL THEN
    SELECT * INTO i FROM inventaire WHERE id = v.inventaire_id AND user_id = v.user_id FOR UPDATE;
    IF i.id IS NOT NULL AND i.fusionne_dans IS NULL AND i.statut = 'vendu'
       AND NOT EXISTS (SELECT 1 FROM ventes x WHERE x.user_id = v.user_id AND x.inventaire_id = i.id) THEN
      UPDATE remises_en_vente SET statut = 'abandonnee', motif = 'commande_annulee', traite_le = now()
       WHERE user_id = v.user_id AND inventaire_id = i.id AND statut = 'a_faire';
      -- La fiche d'abord : son déclencheur (inventaire_vente_annulee_retraits) annule les
      -- retraits encore en attente depuis la date de la vente, lue sur le job « vendu ».
      UPDATE inventaire SET statut = 'stock', quantite = 1 WHERE id = i.id AND statut = 'vendu';
      WITH m AS (
        UPDATE cross_post_jobs c SET status = 'cancelled',
               error = 'Commande eBay ' || CASE WHEN lower(coalesce(p_statut, '')) = 'cancelled' THEN 'annulée' ELSE 'remboursée' END
                       || ' : l''annonce eBay reste terminée, rien n''est remis en ligne.'
         WHERE c.user_id = v.user_id AND c.inventaire_id = i.id AND c.platform = 'ebay' AND c.status = 'sold'
           AND c.platform_fields #>> '{vente_commande_ebay,vente}' = v.id::text
        RETURNING c.id)
      SELECT coalesce(array_agg(id), '{}') INTO v_jobs FROM m;
      INSERT INTO inventaire_journal (user_id, inventaire_id, champ, avant, apres, source, motif, detail) VALUES
        (v.user_id, i.id, 'statut', i.statut, 'stock', 'releve_ebay', 'commande_annulee',
         jsonb_build_object('vente', v.id, 'commande', v.commande_ref, 'statut_ebay', p_statut, 'jobs', to_jsonb(v_jobs))),
        (v.user_id, i.id, 'quantite', i.quantite::text, '1', 'releve_ebay', 'commande_annulee',
         jsonb_build_object('vente', v.id, 'commande', v.commande_ref, 'statut_ebay', p_statut));
      v_rendue := true;
    END IF;
  END IF;
  UPDATE ventes_ebay_exemplaires SET decision = 'sans_objet', motif = 'commande_annulee', decide_le = now() WHERE vente_id = v.id;
  RETURN jsonb_build_object('action', 'retiree', 'fiche_rendue_au_stock', v_rendue, 'jobs', to_jsonb(v_jobs));
END;
$function$;
REVOKE ALL ON FUNCTION public.vente_commande_annulee(bigint, text) FROM PUBLIC, anon, authenticated;
