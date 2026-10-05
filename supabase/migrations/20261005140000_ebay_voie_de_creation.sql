-- ═══════════════════════════════════════════════════════════════════════════
-- eBay : LA VOIE D'UNE ANNONCE = LA FAÇON DONT ELLE A ÉTÉ CRÉÉE (05/10, Nico)
-- ═══════════════════════════════════════════════════════════════════════════
-- Partie de la définition EN PROD de cross_post_jobs_voie_ebay
-- (pg_get_functiondef du 05/10 13:45, identique à 20261001064500) et de
-- cross_post_jobs_voie_stable (identique à sa dernière migration).
--
-- LE DÉFAUT. Sur un compte relié à l'API, le trigger mettait la voie 'api' à
-- TOUT job « publish » inséré — y compris l'IMPORT d'une annonce par un relevé
-- (handler_build 'releve-annonces', statut 'published' dès l'insertion), donc
-- une annonce que la personne a créée elle-même sur eBay, que notre API n'a
-- jamais publiée et ne peut pas finir. Un retrait suivait « la voie de la
-- dernière mise en ligne » de la fiche → 'api' → ebay-api-worker s'arrête
-- (« aucune publication API cohérente… ») et personne ne retire. Le correctif
-- du 01/10 ne couvrait que le retrait armé par une VENTE ; la suppression
-- d'une fiche (xxewwer, Batman 377494897809, 05/10 12:02), le geste « Retirer »
-- et la republication restaient faux. Mesuré le 05/10 : 775 jobs d'import en
-- 'api' sur 44 comptes (773 annonces), dont 8 annonces réellement créées par
-- notre API (relues par un relevé : elles gardent 'api').
--
-- LA RÈGLE. Une annonce eBay est « créée par notre API » quand un job
-- publish/republish du même compte, voie 'api', handler ebay-api-worker, porte
-- son identifiant exact (colonne ou platform_fields.ebay_api.listing_id) —
-- ebay_annonce_creee_par_api(). Alors :
--   · publication À FAIRE (pending / needs_user) : inchangé (compte relié et
--     non révoqué → 'api') ;
--   · IMPORT (relevé, rattachement, ou job inséré déjà 'published'/'sold'/…,
--     hors jobs écrits par ebay-api-worker) :
--     'api' SEULEMENT si l'annonce a été créée par notre API, sinon
--     'extension' — même si l'appelant a écrit 'api' ;
--   · RETRAIT et REPUBLICATION : 'api' si et seulement si l'annonce visée
--     (identifiant exact) a été créée par notre API ; sans identifiant, la
--     dernière mise en ligne de la fiche décide, et elle ne vaut 'api' que si
--     c'est une publication de notre API. Tout le reste → 'extension'
--     (Hub vendeur filtré par l'identifiant exact, prouvé depuis le 01/10).
--     Une annonce publiée par l'API ne part donc jamais vers l'extension, même
--     si la fiche a disparu (inventaire_id NULL) ;
--   · voie_stable : la seule bascule api → extension admise est celle d'un
--     script de réparation qui pose `SET LOCAL fillsell.voie_reetiquetage =
--     'on'` (jamais accessible par PostgREST).
--
-- POURQUOI L'EXTENSION ET PAS L'API TRADING (EndItem). L'API Inventory ne
-- finit que ce qu'elle a créé. EndItem (Trading) finirait n'importe quelle
-- annonce du vendeur, mais ce serait un appel neuf, jamais éprouvé chez nous,
-- sur une annonce réelle de client : la règle « un morceau ne sort qu'avec sa
-- preuve réelle » l'exclut aujourd'hui. La voie extension retire par
-- l'identifiant exact (63 retraits eBay réussis, annonce introuvable relue sur
-- sa page publique avant toute conclusion) et ne peut jamais toucher l'annonce
-- d'un autre compte eBay.
--
-- Aucun job n'est relu ni réécrit ici : le réétiquetage des imports existants
-- est un script de réparation à part (scripts/reparations/20261005_ebay_
-- imports_voie_extension.sql, sauvegarde et inverse).
-- Inverse : réappliquer les définitions de 20261001064500 (voie_ebay) et de
-- cross_post_jobs_voie_stable ci-dessous sans la ligne du GUC ;
-- DROP FUNCTION public.ebay_annonce_creee_par_api(uuid, text).
-- ═══════════════════════════════════════════════════════════════════════════

SET lock_timeout = '3s';

CREATE OR REPLACE FUNCTION public.ebay_annonce_creee_par_api(p_user uuid, p_ident text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT p_ident ~ '^\d{9,}$' AND EXISTS (
    SELECT 1 FROM cross_post_jobs p
     WHERE p.user_id = p_user AND p.platform = 'ebay'
       AND p.action IN ('publish', 'republish') AND p.voie = 'api'
       AND COALESCE(p.handler_build, '') ILIKE 'ebay-api-worker%'
       AND (btrim(COALESCE(p.platform_listing_id, '')) = p_ident
            OR (p.platform_fields #>> '{ebay_api,listing_id}') = p_ident))
$function$;
REVOKE ALL ON FUNCTION public.ebay_annonce_creee_par_api(uuid, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.cross_post_jobs_voie_ebay()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_flag boolean;
  v_ok boolean;
  v_ident text;
  v_import boolean;
  v_api boolean;
BEGIN
  IF NEW.platform IS DISTINCT FROM 'ebay' THEN RETURN NEW; END IF;

  -- Identifiant exact de l'annonce : la colonne si c'est un numéro eBay, sinon
  -- le lien /itm/<numéro>.
  v_ident := COALESCE(substring(btrim(COALESCE(NEW.platform_listing_id, '')) from '^(\d{9,})$'),
                      substring(COALESCE(NEW.listing_url, '') from '/itm/(?:[^/?#]*/)?(\d{9,})'));

  IF COALESCE(NEW.action, 'publish') = 'publish' THEN
    -- (05/10) Un IMPORT n'est jamais une publication de notre API : l'annonce
    -- existe déjà, la personne l'a créée (ou l'extension l'a déposée).
    -- Un job écrit par notre worker API n'est jamais un import.
    v_import := COALESCE(NEW.handler_build, '') NOT ILIKE 'ebay-api-worker%'
            AND (COALESCE(NEW.handler_build, '') ~* 'sync-dressing|releve-annonces'
                 OR COALESCE(NEW.platform_fields ->> 'source', '') = 'releve'
                 OR COALESCE(NEW.platform_fields #>> '{rattachement,import}', '') = 'true'
                 OR COALESCE(NEW.status, 'pending') NOT IN ('pending', 'needs_user'));
    IF v_import THEN
      NEW.voie := CASE WHEN ebay_annonce_creee_par_api(NEW.user_id, v_ident) THEN 'api' ELSE 'extension' END;
      RETURN NEW;
    END IF;
    -- Un choix explicite ('api' posé par l'appelant) est respecté tel quel
    -- pour une publication à faire.
    IF NEW.voie IS DISTINCT FROM 'extension' THEN RETURN NEW; END IF;
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

  ELSIF NEW.action IN ('delete', 'republish') THEN
    -- (05/10) La voie du retrait / de la republication = la façon dont
    -- l'annonce VISÉE a été créée, jamais la façon dont elle a été lue, ni la
    -- dernière voie de la fiche. Remplace l'héritage du 06/09 et l'exception
    -- du 01/10 (retrait armé par une vente), qui en devient un cas particulier.
    IF v_ident IS NOT NULL THEN
      v_api := ebay_annonce_creee_par_api(NEW.user_id, v_ident);
    ELSIF NEW.inventaire_id IS NOT NULL THEN
      -- Sans identifiant : la dernière MISE EN LIGNE de la fiche (2026-09-06 :
      -- pas la dernière création), et seulement si notre API l'a faite.
      SELECT (j.voie = 'api' AND COALESCE(j.handler_build, '') ILIKE 'ebay-api-worker%')
        INTO v_api
        FROM cross_post_jobs j
       WHERE j.user_id = NEW.user_id
         AND j.platform = 'ebay'
         AND j.inventaire_id = NEW.inventaire_id
         AND j.action IN ('publish', 'republish')
         AND j.status IN ('published', 'sold', 'cancelled', 'deleted')
       ORDER BY COALESCE(j.published_at, j.created_at) DESC
       LIMIT 1;
    END IF;
    NEW.voie := CASE WHEN COALESCE(v_api, false) THEN 'api' ELSE 'extension' END;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.cross_post_jobs_voie_stable()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NEW.voie IS NOT DISTINCT FROM OLD.voie THEN RETURN NEW; END IF;
  IF OLD.voie = 'extension' AND NEW.voie = 'api' AND OLD.status IN ('pending', 'needs_user') THEN
    RETURN NEW;
  END IF;
  -- (05/10) Réétiquetage par un script de réparation seulement (GUC posé par
  -- SET LOCAL, inaccessible par PostgREST).
  IF current_setting('fillsell.voie_reetiquetage', true) = 'on' THEN
    RETURN NEW;
  END IF;
  RAISE WARNING 'cross_post_jobs_voie_stable : job % — bascule % → % refusée (statut %)', OLD.id, OLD.voie, NEW.voie, OLD.status;
  NEW.voie := OLD.voie;
  RETURN NEW;
END
$function$;
