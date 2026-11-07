-- ═══════════════════════════════════════════════════════════════════════════
-- FillSell Cloud — RÉFÉRENCE DE BOUTIQUE CLOSE (07/11/2026 soir, ordre de Nico)
-- PRÉPARÉE, NON APPLIQUÉE : feu vert NOMMÉ de Nico requis (essai jetable : scripts/essais/20261107200000_banc.mjs).
--
-- Ordre : « un renouvellement de test de Nicotest ne doit jamais lui rallumer le Cloud ni lui réattribuer une place ou
-- une IP. Prouve-le en base, sans toucher aux vrais clients ni aux essais d'Apple pour l'examen. » Complément de Nico :
-- « un vrai client qui arrête puis se réabonne plus tard, avec un NOUVEL achat et une NOUVELLE référence de boutique,
-- n'est JAMAIS bloqué : seule une référence close PRÉCISE ne rallume rien. »
--
-- RÈGLE GÉNÉRALE (outil du support, aucun compte codé ici) :
-- 1. public.cloud_refs_closes : une référence de boutique (Apple originalTransactionId, Google purchaseToken, Stripe
--    sub_…) que le support a CLOSE, cas par cas (jamais automatiquement) — abonnement bac à sable non annulable, double
--    abonnement à rembourser… RLS activée, AUCUNE politique, rien pour anon / authenticated : service_role seulement.
-- 2. Déclencheur BEFORE UPDATE profiles_zz_cloud_ref_close : si la référence que la mise à jour POSE (NEW.cloud_ref — et
--    seulement elle) est close ET que la mise à jour RALLUMERAIT le Cloud —
--      · is_cloud passe à vrai ;
--      · ou cloud_periode_fin change et repart dans le futur ;
--      · ou l'essai (cloud_essai_debut / cloud_essai_fin) change et sa fin est dans le futur ;
--      · ou cloud_essai_arrete est remis à faux —
--    alors les 8 colonnes de l'abonnement Cloud (is_cloud, cloud_canal, cloud_ref, cloud_periode_fin, cloud_essai_debut,
--    cloud_essai_fin, cloud_essai_arrete, cloud_arret_fin_periode) gardent leurs valeurs d'AVANT ; toutes les autres
--    colonnes de la même mise à jour passent normalement. JAMAIS d'exception (le webhook répond 200 à Apple / Google,
--    sinon la boutique rejoue) : une ligne au journal (stores_notifications_journal, type « CLOUD_REF_CLOSE », canal
--    apple / google — son CHECK n'admet pas stripe) + RAISE LOG (toujours, Stripe compris).
--    Une référence NOUVELLE (non close) passe toujours, même si l'ancienne référence du compte était close.
--    Un événement qui ÉTEINT (EXPIRED, REFUND, DID_FAIL_TO_RENEW, arrêt d'essai) passe toujours.
-- 3. ORDRE avec les déclencheurs de la prod (relus le 07/11 ~19:30, pg_get_triggerdef) :
--    · BEFORE UPDATE (ordre alphabétique) : profiles_acquisition_immuable_trg, profiles_identite_vinted_du_poste,
--      profiles_pin_une_boutique_un_compte, profiles_platform_settings_garde, puis profiles_zz_cloud_ref_close — le
--      DERNIER : il a le dernier mot sur les colonnes Cloud et ne contourne aucun des autres (aucun ne touche au Cloud) ;
--    · AFTER UPDATE profiles_cloud_pool (OF is_cloud, cloud_essai_debut, cloud_essai_fin, cloud_essai_arrete, WHEN OLD
--      IS DISTINCT FROM NEW) → cloud_compte_synchroniser → cloud_ip_attribuer : son WHEN lit la ligne FINALE ; un
--      rallumage neutralisé ne change aucune de ces colonnes → il ne se déclenche pas → aucune IP, aucune place.
--    · Les autres chemins qui attribuent une IP ou une place ne partent QUE de l'état du profil : cloud_pool_entretien
--      (comptes is_cloud ou essai en cours), cloud_comptes_a_servir (IP tenues), cloud_ip_signaler (compte qui tient
--      déjà une IP). cloud_essai_preparer_moi (réservation 30 min) n'est appelée que par l'app AVANT un NOUVEL achat —
--      ni par un renouvellement, ni par la restauration (validate-apple-receipt n'écrit que le profil) : elle n'est PAS
--      touchée (la bloquer bloquerait le réabonnement d'un client avec une nouvelle référence).
-- 4. Coût : la clause UPDATE OF + WHEN ne déclenche RIEN pour une mise à jour sans colonne Cloud, ni pour un compte
--    sans cloud_ref, ni quand les colonnes Cloud ne changent pas ; sinon une lecture par clé primaire.
-- Fonctions edge EN SERVICE inchangées (apple-iap-webhook v47, validate-apple-receipt, google-play-webhook,
-- validate-google-purchase, stripe-webhook) : la garde est EN BASE.
-- ═══════════════════════════════════════════════════════════════════════════
SET lock_timeout = '5s';

-- ═══ 1. Les références closes ══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.cloud_refs_closes (
  ref      text PRIMARY KEY CHECK (btrim(ref) <> ''),
  canal    text NOT NULL CHECK (canal IN ('apple', 'google', 'stripe')),
  user_id  uuid,
  raison   text NOT NULL CHECK (btrim(raison) <> ''),
  close_le timestamptz NOT NULL DEFAULT now(),
  par      text
);
COMMENT ON TABLE public.cloud_refs_closes IS
  'Références de boutique closes par le support (cas par cas, jamais automatique) : une mise à jour de profiles qui pose '
  'une de ces références ne rallume jamais le Cloud (déclencheur profiles_zz_cloud_ref_close, migration 20261107200000). '
  'Apple : fermer une référence bloque aussi un futur réabonnement du MÊME identifiant Apple sur ce compte.';
-- Droits : serveur seulement (cloud_refs_closes) — RLS sans politique, rien pour anon / authenticated.
ALTER TABLE public.cloud_refs_closes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.cloud_refs_closes FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.cloud_refs_closes TO service_role;

-- ═══ 2. La garde ═══════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.profiles_cloud_ref_close()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  c public.cloud_refs_closes%ROWTYPE;
  v_now timestamptz := now();
  v_demande jsonb;
BEGIN
  -- Seule la référence que la mise à jour POSE compte : une référence nouvelle passe toujours.
  SELECT * INTO c FROM public.cloud_refs_closes WHERE ref = NEW.cloud_ref;
  IF NOT FOUND THEN RETURN NEW; END IF;
  IF NOT (
       (NEW.is_cloud IS TRUE AND OLD.is_cloud IS DISTINCT FROM TRUE)
    OR (NEW.cloud_periode_fin > v_now AND NEW.cloud_periode_fin IS DISTINCT FROM OLD.cloud_periode_fin)
    OR (NEW.cloud_essai_fin > v_now
        AND (NEW.cloud_essai_debut, NEW.cloud_essai_fin) IS DISTINCT FROM (OLD.cloud_essai_debut, OLD.cloud_essai_fin))
    OR (OLD.cloud_essai_arrete IS TRUE AND NEW.cloud_essai_arrete IS NOT TRUE)
  ) THEN
    RETURN NEW;   -- rien ne se rallume (un « off », une annulation d'essai…) : la mise à jour passe telle quelle
  END IF;
  v_demande := jsonb_build_object('is_cloud', NEW.is_cloud, 'cloud_canal', NEW.cloud_canal, 'cloud_ref', NEW.cloud_ref,
    'cloud_periode_fin', NEW.cloud_periode_fin, 'cloud_essai_debut', NEW.cloud_essai_debut, 'cloud_essai_fin', NEW.cloud_essai_fin,
    'cloud_essai_arrete', NEW.cloud_essai_arrete, 'cloud_arret_fin_periode', NEW.cloud_arret_fin_periode);
  NEW.is_cloud                := OLD.is_cloud;
  NEW.cloud_canal             := OLD.cloud_canal;
  NEW.cloud_ref               := OLD.cloud_ref;
  NEW.cloud_periode_fin       := OLD.cloud_periode_fin;
  NEW.cloud_essai_debut       := OLD.cloud_essai_debut;
  NEW.cloud_essai_fin         := OLD.cloud_essai_fin;
  NEW.cloud_essai_arrete      := OLD.cloud_essai_arrete;
  NEW.cloud_arret_fin_periode := OLD.cloud_arret_fin_periode;
  RAISE LOG 'profiles_cloud_ref_close : compte % : référence close % (%) — rallumage du Cloud neutralisé, demandé : %',
    NEW.id, c.ref, c.canal, v_demande;
  IF c.canal IN ('apple', 'google') THEN
    BEGIN
      INSERT INTO public.stores_notifications_journal (canal, type, effet, connu, effet_applique, user_id,
                                                        transaction_originale, motif, detail)
      VALUES (c.canal, 'CLOUD_REF_CLOSE', 'cloud_ref_close', true, 'rallumage_neutralise', NEW.id, c.ref,
              'ref_close', jsonb_build_object('raison', c.raison, 'close_le', c.close_le, 'close_par', c.par,
                'user_de_la_close', c.user_id, 'demande', v_demande, 'role', current_user));
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'profiles_cloud_ref_close : journal non écrit (compte %, référence %) : %', NEW.id, c.ref, SQLERRM;
    END;
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.profiles_cloud_ref_close() FROM PUBLIC, anon, authenticated;

-- « zz » : le DERNIER des BEFORE UPDATE de profiles (ordre alphabétique des noms) — le dernier mot sur le Cloud.
DROP TRIGGER IF EXISTS profiles_zz_cloud_ref_close ON public.profiles;
CREATE TRIGGER profiles_zz_cloud_ref_close
  BEFORE UPDATE OF is_cloud, cloud_canal, cloud_ref, cloud_periode_fin, cloud_essai_debut, cloud_essai_fin,
                   cloud_essai_arrete, cloud_arret_fin_periode
  ON public.profiles
  FOR EACH ROW
  WHEN (NEW.cloud_ref IS NOT NULL
        AND (OLD.is_cloud, OLD.cloud_canal, OLD.cloud_ref, OLD.cloud_periode_fin, OLD.cloud_essai_debut,
             OLD.cloud_essai_fin, OLD.cloud_essai_arrete, OLD.cloud_arret_fin_periode)
            IS DISTINCT FROM
            (NEW.is_cloud, NEW.cloud_canal, NEW.cloud_ref, NEW.cloud_periode_fin, NEW.cloud_essai_debut,
             NEW.cloud_essai_fin, NEW.cloud_essai_arrete, NEW.cloud_arret_fin_periode))
  EXECUTE FUNCTION public.profiles_cloud_ref_close();
