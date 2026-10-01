-- ═══════════════════════════════════════════════════════════════════════════
-- eBay : LE RETRAIT D'UNE ANNONCE IMPORTÉE PART PAR L'EXTENSION (01/10, GO Nico)
-- ═══════════════════════════════════════════════════════════════════════════
-- Partie de la définition EN PROD (pg_get_functiondef du 01/10 06:40,
-- identique à 20260927091642). Seule la branche « delete » change.
--
-- LE DÉFAUT. Sur un compte relié par l'API, l'import d'une annonce par le
-- relevé crée un job « publish » (handler_build = 'releve-annonces') qui prend
-- la voie 'api' (le trigger traite tout publish de compte relié). Le retrait
-- suit « la voie de la dernière mise en ligne » → 'api'. Or l'API Inventory ne
-- peut finir qu'une annonce qu'ELLE a créée :
--   · depuis le 29/09 (8a0b3e8) le worker refuse, sans rien toucher :
--     ornellaracano 307204072564, article vendu, retrait du 30/09 14:58 en
--     échec, annonce TOUJOURS EN LIGNE (vérifié le 01/10) ;
--   · avant le 29/09 il CLÔTURAIT « rien à retirer (aucune offre pour ce
--     SKU) » : nicolas.menar 377453677328 et xxewwer 377462623400, articles
--     vendus, annonces TOUJOURS EN LIGNE le 01/10 (non corrigé ici : aucun job
--     relancé à la main).
--
-- LA RÈGLE. Un retrait eBay part en voie 'extension' (Hub vendeur filtré par
-- l'identifiant exact) quand, ensemble :
--   · il a été armé par armer_retrait_job (vente enregistrée, ou geste
--     « Déjà vendu ? » sur cette annonce) — un retrait sans vente (filet de
--     suppression de fiche) garde la voie d'avant ;
--   · il porte l'identifiant exact de l'annonce ;
--   · cette annonce est portée par un job d'IMPORT du même compte, et par
--     AUCUNE publication faite par notre API.
-- Tout le reste est inchangé, octet pour octet.
--
-- CE QUE LA VOIE EXTENSION GARANTIT (relu dans le code, tous les builds) :
--   · le Hub vendeur ne montre que les annonces du compte eBay de Chrome : une
--     annonce trouvée par son numéro prouve le compte ; un autre compte ne
--     peut pas la finir (« introuvable ») ;
--   · une annonce introuvable est relue sur sa page publique : plus en ligne →
--     job clos « deleted » sans aucun geste, preuve de lecture écrite ;
--   · le repli PAR LE TITRE du content script est neutralisé par
--     get-pending-jobs (titre retiré du job servi) : jamais utilisé en 63
--     retraits eBay réussis, mais dangereux pour un vendeur à deux comptes.
--
-- ESSAI À BLANC (lecture seule, tout l'historique eBay, 01/10 06:30) :
--   · ornellaracano 307204072564 : api → EXTENSION (armé par la vente) ;
--   · laforge.vinted 198641288930 : reste api (pas de vente : filet de
--     suppression de fiche) — annonce terminée le 24/09, rien à faire ;
--   · xxewwer 377460399728 : reste api (pas de vente) — l'annonce est de
--     nouveau rattachée à une fiche EN STOCK : la retirer aurait été une faute ;
--   · 4 retraits historiques changeraient de voie (nicolas.menar, xxewwer ×3),
--     tous des imports armés par une vente ; 0 publication API concernée ;
--     0 changement pour tout retrait d'annonce publiée par l'API.
-- ═══════════════════════════════════════════════════════════════════════════

SET lock_timeout = '3s';

CREATE OR REPLACE FUNCTION public.cross_post_jobs_voie_ebay()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_flag boolean;
  v_ok boolean;
  v_prev text;
  v_ident text;
BEGIN
  IF NEW.platform IS DISTINCT FROM 'ebay' THEN RETURN NEW; END IF;
  -- Un choix explicite ('api' posé par l'appelant) est respecté tel quel.
  IF NEW.voie IS DISTINCT FROM 'extension' THEN RETURN NEW; END IF;

  IF NEW.action = 'publish' THEN
    SELECT p.ebay_voie_api INTO v_flag FROM profiles p WHERE p.id = NEW.user_id;
    IF NOT COALESCE(v_flag, false) THEN RETURN NEW; END IF;
    -- (2026-09-27) Relié = API, PRÊT OU NON. La préparation du compte
    -- (politiques retenues, statut vendeur) est contrôlée par ebay-api-worker à
    -- la prise du job : pas prêt → needs_user « ebay_compte_a_finir », ré-armé
    -- tout seul quand le compte le devient. Avant : pas prêt → 'extension' en
    -- silence, et le mur de connexion eBay que l'API évite (philippaa, pironneau).
    SELECT (a.revoked_at IS NULL)
      INTO v_ok
      FROM ebay_accounts a WHERE a.user_id = NEW.user_id;
    IF COALESCE(v_ok, false) THEN NEW.voie := 'api'; END IF;

  ELSIF NEW.action IN ('delete', 'republish') AND NEW.inventaire_id IS NOT NULL THEN
    SELECT j.voie INTO v_prev
      FROM cross_post_jobs j
     WHERE j.user_id = NEW.user_id
       AND j.platform = 'ebay'
       AND j.inventaire_id = NEW.inventaire_id
       AND j.action IN ('publish', 'republish')
       AND j.status IN ('published', 'sold', 'cancelled', 'deleted')
     -- 2026-09-06 : dernière MISE EN LIGNE, pas dernière création (un publish
     -- relancé après un retrait est créé avant le delete de l'annonce
     -- précédente).
     ORDER BY COALESCE(j.published_at, j.created_at) DESC
     LIMIT 1;
    -- (2026-10-01, GO Nico) Retrait armé par une vente d'une annonce IMPORTÉE :
    -- notre API ne l'a pas créée et ne peut pas la finir → voie extension
    -- (Hub vendeur, identifiant exact). Cf. en-tête de la migration
    -- 20261001064500.
    IF v_prev = 'api' AND NEW.action = 'delete'
       AND (NEW.platform_fields -> 'arme_par' ->> 'pose_par') = 'armer_retrait_job (serveur)' THEN
      v_ident := COALESCE(NULLIF(btrim(COALESCE(NEW.platform_listing_id, '')), ''),
                          substring(COALESCE(NEW.listing_url, '') from '/itm/(?:[^/]*/)?(\d{9,})'));
      IF v_ident IS NOT NULL
         AND EXISTS (SELECT 1 FROM cross_post_jobs p
                      WHERE p.user_id = NEW.user_id AND p.platform = 'ebay'
                        AND p.action IN ('publish', 'republish')
                        AND p.platform_listing_id = v_ident
                        AND p.handler_build = 'releve-annonces')
         AND NOT EXISTS (SELECT 1 FROM cross_post_jobs p
                          WHERE p.user_id = NEW.user_id AND p.platform = 'ebay'
                            AND p.action IN ('publish', 'republish')
                            AND p.platform_listing_id = v_ident
                            AND p.voie = 'api'
                            AND p.handler_build ILIKE 'ebay-api-worker%') THEN
        v_prev := 'extension';
      END IF;
    END IF;
    IF v_prev = 'api' THEN NEW.voie := 'api'; END IF;
  END IF;
  RETURN NEW;
END;
$function$
;
