-- ═══════════════════════════════════════════════════════════════════════════
-- 20261024235000_bordereau_automatique_des_la_vente
-- (24/10 soir, décision 1 de Nico, après la preuve sur le short) « Dès qu'une vente est détectée, l'extension demande
-- le bordereau, le récupère et l'enregistre. Quand le vendeur ouvre la commande, le PDF s'affiche instantanément. »
-- LA RÈGLE (comptes de la bêta des bordereaux, interrupteur coin_config.bordereaux_auto) :
--   · (24/10 soir, décision 2 de Nico) VINTED SEULEMENT pour l'instant : une commande Vinted NEUVE (vue après
--     l'ouverture : coin_config.bordereaux_auto_depuis — jamais l'arriéré), étiquette payée par l'acheteur, reçoit
--     UNE demande automatique : « générer » (étiquette à commander) ou « récupérer » (étiquette déjà prête).
--     Leboncoin, Beebs, Depop, eBay : jamais (« Bientôt disponible » dans l'app) ; jamais une étiquette payante.
--   · le format est le réglage du compte (platform_settings.bordereaux.format : « pdf » par défaut, ou « code ») ;
--   · l'extension relit la commande sur la plateforme juste avant le geste (decisionGeneration) : annulée ou déjà
--     traitée, rien n'est fait — inchangé ;
--   · une seule fois par commande : jamais après une demande du vendeur ni après un échec (le bouton manuel reste,
--     avec le motif réel) ; jamais quand une copie vivante existe ; 20 demandes par jour au plus (comme à la main) ;
--   · garde de double vente : deux commandes en cours pour la même fiche → rien d'automatique, demande close
--     « deux_commandes_meme_fiche » (le vendeur choisit, le bouton reste) ;
--   · ordinateur éteint : la commande n'est relevée qu'à son retour, la demande part alors (24 h, comme à la main) ;
--   · vente ANNULÉE ensuite (commande « annulee ») : la copie gardée est close tout de suite (expire_le = now(),
--     l'app ne la montre plus ; bordereaux-purge efface le fichier dans l'heure).
-- Déclencheur sur plateforme_commandes (AFTER INSERT OR UPDATE OF etat, bordereau, inventaire_id) : indépendant du
-- corps de commandes_enregistrer (aucune réécriture de fonction existante).
-- Application (feu vert NOMMÉ de Nico seulement) :
--   npx supabase db query --linked -f supabase/migrations/20261024235000_bordereau_automatique_des_la_vente.sql
--   npx supabase migration repair --linked --status applied 20261024235000
-- Essai à blanc (ROLLBACK) : scripts/essais/20261024235000_essai.sql — Inverse : supabase/rollbacks/20261024235000_…_INVERSE.sql
-- ═══════════════════════════════════════════════════════════════════════════
-- ═══ CORPS DE LA MIGRATION
BEGIN;

INSERT INTO public.coin_config (key, value) VALUES ('bordereaux_auto', 1)
  ON CONFLICT (key) DO NOTHING;
INSERT INTO public.coin_config (key, value) VALUES ('bordereaux_auto_depuis', floor(extract(epoch FROM now()))::integer)
  ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.bordereau_auto_pour_commande(p_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  c record;
  v_depuis timestamptz;
  v_action text;
  v_format text;
  v_choix jsonb;
  v_jour int;
BEGIN
  SELECT * INTO c FROM plateforme_commandes WHERE id = p_id;
  IF c.id IS NULL THEN RETURN 'introuvable'; END IF;
  IF coalesce((SELECT k.value FROM coin_config k WHERE k.key = 'bordereaux_auto'), 0) <> 1 THEN RETURN 'ferme'; END IF;
  IF coalesce((SELECT k.value FROM coin_config k WHERE k.key = 'bordereaux_ouverts'), 0) <> 1 THEN RETURN 'ferme'; END IF;
  v_depuis := to_timestamp(coalesce((SELECT k.value FROM coin_config k WHERE k.key = 'bordereaux_auto_depuis'), 0));
  -- Seulement les ventes vues APRÈS l'ouverture, et récentes : jamais l'arriéré d'un compte.
  IF c.cree_le < v_depuis OR c.cree_le < now() - interval '7 days' THEN RETURN 'avant_ouverture'; END IF;
  -- (24/10 soir, décision 2 de Nico) Vinted seulement : étiquette payée par l'acheteur. Leboncoin, Beebs : bientôt ;
  -- jamais eBay (étiquette payante), ni Depop (pas de bordereau en France).
  IF c.platform <> 'vinted' THEN RETURN 'plateforme'; END IF;
  IF NOT public.messagerie_beta(c.user_id) THEN RETURN 'hors_beta'; END IF;

  IF c.etat = 'a_expedier' AND c.bordereau = 'a_obtenir' THEN
    v_action := 'generer';
  ELSIF c.etat = 'a_expedier' AND c.bordereau = 'pret' THEN
    v_action := 'recuperer';
  ELSE
    RETURN 'rien_a_faire';
  END IF;
  IF v_action = 'generer'
     AND coalesce((SELECT k.value FROM coin_config k WHERE k.key = 'bordereaux_generation_ouverte'), 0) <> 1 THEN
    RETURN 'generation_fermee';
  END IF;
  -- Vinted ne laisse pas FillSell le faire (enlèvement à domicile daté, téléphone exigé) : le bouton manuel le dit.
  IF v_action = 'generer' AND c.platform = 'vinted' AND (c.options_bordereau ->> 'generable') = 'false' THEN
    RETURN 'non_generable';
  END IF;

  -- Une seule fois par commande : jamais après une demande (du vendeur ou automatique), ni avec une copie vivante.
  IF EXISTS (SELECT 1 FROM bordereaux_demandes d WHERE d.commande_id = c.id) THEN RETURN 'deja_demandee'; END IF;
  IF EXISTS (SELECT 1 FROM bordereaux_copies b WHERE b.commande_id = c.id AND b.efface_le IS NULL AND b.expire_le > now()) THEN
    RETURN 'copie_presente';
  END IF;
  SELECT count(*) INTO v_jour FROM bordereaux_demandes d
   WHERE d.user_id = c.user_id
     AND (d.cree_le AT TIME ZONE 'Europe/Paris')::date = (now() AT TIME ZONE 'Europe/Paris')::date;
  IF v_jour >= 20 THEN RETURN 'plafond_jour'; END IF;

  v_format := CASE WHEN (SELECT p.platform_settings #>> '{bordereaux,format}' FROM profiles p WHERE p.id = c.user_id) = 'code'
                   THEN 'code' ELSE 'pdf' END;
  v_choix := jsonb_build_object('auto', true, 'format', v_format)
    || CASE WHEN v_action = 'generer' AND c.platform = 'vinted'
            THEN jsonb_build_object('type_etiquette', CASE WHEN v_format = 'code' THEN 3 ELSE 1 END) ELSE '{}'::jsonb END;

  -- Garde de double vente : deux commandes en cours pour la même fiche → rien d'automatique, le vendeur choisit.
  IF v_action = 'generer' AND c.inventaire_id IS NOT NULL AND EXISTS (
       SELECT 1 FROM plateforme_commandes o
        WHERE o.user_id = c.user_id AND o.inventaire_id = c.inventaire_id AND o.id <> c.id
          AND o.etat IN ('a_confirmer', 'a_expedier')) THEN
    INSERT INTO bordereaux_demandes (user_id, commande_id, platform, action, statut, motif, choix, fini_le)
    VALUES (c.user_id, c.id, c.platform, 'generer', 'echec', 'deux_commandes_meme_fiche', v_choix, now());
    RETURN 'deux_commandes_meme_fiche';
  END IF;

  BEGIN
    IF v_action = 'generer' THEN
      INSERT INTO bordereaux_demandes (user_id, commande_id, platform, action, choix, engagement, confirme_le)
      VALUES (c.user_id, c.id, c.platform, 'generer', v_choix,
              'Bordereau automatique dès la vente (décision de Nico du 24/10/2026 ; format du compte : ' || v_format || ')',
              now());
    ELSE
      INSERT INTO bordereaux_demandes (user_id, commande_id, platform, choix)
      VALUES (c.user_id, c.id, c.platform, v_choix);
    END IF;
  EXCEPTION WHEN unique_violation THEN
    RETURN 'deja_demandee';
  END;
  RETURN 'demandee';
END;
$function$;

REVOKE ALL ON FUNCTION public.bordereau_auto_pour_commande(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.plateforme_commandes_bordereau_auto()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Vente annulée : la copie gardée est close tout de suite (l'app ne la montre plus ; la purge efface le fichier).
  IF NEW.etat = 'annulee' AND (TG_OP = 'INSERT' OR OLD.etat IS DISTINCT FROM 'annulee') THEN
    UPDATE bordereaux_copies SET expire_le = now()
     WHERE commande_id = NEW.id AND efface_le IS NULL AND expire_le > now();
    RETURN NULL;
  END IF;
  -- Jamais une écriture de commande refusée pour un bordereau : une erreur ici est tracée, jamais levée.
  BEGIN
    PERFORM public.bordereau_auto_pour_commande(NEW.id);
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO usage_logs (user_id, feature, metadata)
    VALUES (NEW.user_id, 'bordereau_auto_erreur', jsonb_build_object('commande', NEW.id, 'erreur', left(SQLERRM, 200)));
  END;
  RETURN NULL;
END;
$function$;

REVOKE ALL ON FUNCTION public.plateforme_commandes_bordereau_auto() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS plateforme_commandes_bordereau_auto ON public.plateforme_commandes;
CREATE TRIGGER plateforme_commandes_bordereau_auto
  AFTER INSERT OR UPDATE OF etat, bordereau, inventaire_id ON public.plateforme_commandes
  FOR EACH ROW EXECUTE FUNCTION public.plateforme_commandes_bordereau_auto();

COMMIT;
-- ═══ FIN DU CORPS DE LA MIGRATION ═══════════════════════════════════════════
