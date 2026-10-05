-- ═══════════════════════════════════════════════════════════════════════════
-- FILLSELL CLOUD — LE SOCLE : une IP française DÉDIÉE par compte, le coffre
-- chiffré des connexions, les postes, l'essai unique — 05/10/2026
-- ═══════════════════════════════════════════════════════════════════════════
-- ⛔ NON APPLIQUÉE. Branche feat/cloud. Appliquée seulement sur le GO de Nico
--    (« feu vert du test »), APRÈS 20261004233000_option_cloud_paiements.sql
--    (colonnes profiles + cloud_etat, dont ce fichier dépend) :
--      npx supabase db query --linked -f supabase/migrations/20261004233000_option_cloud_paiements.sql
--      npx supabase migration repair --linked --status applied 20261004233000
--      npx supabase db query --linked -f supabase/migrations/20261005120000_cloud_socle_ip_dediee.sql
--      npx supabase migration repair --linked --status applied 20261005120000
--    Jamais `db push`.
--
-- DÉCISIONS DE NICO (05/10) portées ici — remplacent la « rotation » du 04/10 :
--   · une IP française DÉDIÉE par compte, à lui seul, pendant l'essai puis
--     pendant l'abonnement. Plus de rotation, plus de baux, plus de contrainte
--     d'exclusion : l'exclusivité tient en UNE colonne (cloud_ips.user_id) et un
--     index unique — btree_gist n'est PAS installée (inutile) ;
--   · essai non transformé ou option arrêtée : l'IP retourne au pool après un
--     REPOS de `repos_jours` (7 proposés : la durée de vie mesurée des jetons
--     Vinted, 26/09) — profil détruit, coffre vidé, session FillSell révoquée,
--     identifiants du proxy changés, contrôle de sortie frais. Le même compte
--     qui revient pendant le repos reprend SA propre IP ;
--   · pool vide : alerte, et le nouvel essai ATTEND (cloud_attente) — il ne
--     démarre jamais sans place : la préparation réserve une IP avant le
--     paiement, et refuse « pool_vide » s'il n'y en a pas ;
--   · le délai entre deux sessions n'est PAS tranché : réglage
--     coin_config `cloud_delai_sessions_min` (absent = navigateur en continu).
--
-- QUI ÉCRIT QUOI :
--   · les PAIEMENTS (stripe-webhook, apple-iap-webhook, google-play-webhook,
--     validate-*) écrivent les colonnes profiles (is_cloud, cloud_essai_*…) —
--     ils ne connaissent pas le pool ;
--   · le déclencheur profiles_cloud_pool fait suivre le pool : compte actif
--     sans IP → une IP ; compte inactif (grâce écoulée) → repos. Il n'échoue
--     JAMAIS un paiement (erreur avalée en WARNING, l'entretien horaire rattrape) ;
--   · l'ORCHESTRATEUR (serveur Hetzner, clé de service) lit les comptes à
--     servir, l'URL du proxy (vault), écrit le coffre (chiffré chez lui, la base
--     ne voit jamais la clé), l'état des postes et les preuves de purge ;
--   · l'APP passe par trois fonctions « _moi » (auth.uid(), aucun paramètre
--     d'identité) : cloud_essai_preparer_moi, cloud_essai_moi, cloud_coffre_etat_moi.
--
-- Règles pures et testées (mêmes valeurs, même ordre) :
-- supabase/functions/_shared/cloud-pool.js — `npm run selftest:cloud-pool`
-- relit CE fichier et compare. Conception : docs/cloud/pool-ip.md.
--
-- ⛔ AVANT APPLICATION
--   · relire en prod qu'aucun objet cloud_* n'existe (au 05/10 : aucun) ;
--   · poser le sel des empreintes (64 caractères aléatoires, écrit nulle part
--     ailleurs ; sans lui cloud_hacher REFUSE et la préparation d'essai aussi) :
--       select vault.create_secret('<64 car.>', 'cloud_empreinte_sel', 'sel des empreintes Cloud (HMAC)');
--
-- ── INVERSE (rien d'autre ne dépend de ces objets) ──────────────────────────
--   DROP TRIGGER IF EXISTS profiles_cloud_pool ON public.profiles;
--   DROP FUNCTION IF EXISTS public.profiles_cloud_pool(), public.cloud_pool_entretien(), public.cloud_pool_etat(),
--     public.cloud_compte_synchroniser(uuid), public.cloud_comptes_a_servir(), public.cloud_poste_noter(uuid, text, jsonb),
--     public.cloud_coffre_ecrire(uuid, text, text, text, integer, boolean), public.cloud_coffre_lire(uuid),
--     public.cloud_coffre_vider(uuid), public.cloud_coffre_etat_moi(), public.cloud_session_revoquer(uuid, uuid),
--     public.cloud_essai_preparer_moi(text), public.cloud_essai_moi(), public.cloud_essai_permis(uuid),
--     public.cloud_essai_noter_carte(uuid, text), public.cloud_essai_noter_compte_plateforme(uuid, text, text),
--     public.cloud_empreintes_engager(uuid),
--     public.cloud_ip_ajouter(text, inet, integer, text, text, text, timestamptz), public.cloud_ip_controle_entree(bigint, jsonb),
--     public.cloud_ip_reserver(uuid), public.cloud_ip_attribuer(uuid, text), public.cloud_ip_liberer(uuid, text),
--     public.cloud_ip_signaler(bigint, text, jsonb), public.cloud_ip_noter_purge(bigint, jsonb),
--     public.cloud_ip_remettre_en_pool(bigint, jsonb), public.cloud_ip_renouvelee(bigint, timestamptz),
--     public.cloud_ip_identifiants_changes(bigint, text), public.cloud_ip_attribuable(public.cloud_ips, uuid, text),
--     public.cloud_proxy_identifiants(bigint), public.cloud_controle_manques(jsonb, inet, timestamptz),
--     public.cloud_purge_manques(jsonb, timestamptz), public.cloud_journal(bigint, text, uuid, jsonb),
--     public.cloud_hacher(text, text), public.cloud_sel(), public.cloud_param(text, integer),
--     public.cloud_ts(text), public.cloud_texte_non_vide(jsonb), public.cloud_zero(jsonb);
--   DROP TABLE IF EXISTS public.cloud_connexions, public.cloud_postes, public.cloud_coffre, public.cloud_attente,
--     public.cloud_pool_alertes, public.cloud_essai_empreintes, public.cloud_essai_demandes,
--     public.cloud_ip_evenements, public.cloud_ip_commandes, public.cloud_ips;
--   DELETE FROM public.coin_config WHERE key LIKE 'cloud\_%';
--   -- email_logs_one_shot_unique : on la REMET sans 'cloud_essai_veille' (même méthode que le § 9,
--   -- en retirant le type) — seulement après avoir vérifié qu'aucun mail de la veille n'est parti.
--   -- vault : supprimer à la main les secrets cloud_proxy_* (après avoir coupé les commandes
--   -- IPRoyal) et cloud_empreinte_sel (efface toute la mémoire anti-abus).
-- ═══════════════════════════════════════════════════════════════════════════


-- ═══ 0. Réglages (coin_config, clés « cloud_* » ; absente = le défaut) ═══════
-- Les défauts sont ceux de PARAMETRES (cloud-pool.js) ; le selftest compare.
CREATE OR REPLACE FUNCTION public.cloud_param(p_cle text, p_defaut integer)
RETURNS integer LANGUAGE sql STABLE SET search_path TO 'public', 'pg_temp' AS $f$
  SELECT COALESCE((SELECT value FROM public.coin_config WHERE key = 'cloud_' || p_cle), p_defaut);
$f$;

-- Petites lectures sûres d'un jsonb (jamais d'exception sur une preuve mal formée).
CREATE OR REPLACE FUNCTION public.cloud_ts(p text)
RETURNS timestamptz LANGUAGE plpgsql STABLE AS $f$
BEGIN
  RETURN p::timestamptz;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$f$;
CREATE OR REPLACE FUNCTION public.cloud_texte_non_vide(p jsonb)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $f$
  SELECT COALESCE(jsonb_typeof(p) = 'string' AND btrim(p #>> '{}') <> '', false);
$f$;
CREATE OR REPLACE FUNCTION public.cloud_zero(p jsonb)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $f$
  SELECT COALESCE(jsonb_typeof(p) = 'number' AND (p #>> '{}')::numeric = 0, false);
$f$;


-- ═══ 1. Les tables — SERVEUR SEUL ═════════════════════════════════════════════
-- Exception assumée à « toute table publique = GRANT … TO authenticated » : le
-- pool est de l'infrastructure, le coffre des données chiffrées, les empreintes
-- des données anti-abus. RLS activée SANS policy + REVOKE explicite ; l'app
-- passe par les fonctions « _moi » (SECURITY DEFINER, auth.uid()).

-- 1.1 Le pool. AUCUN secret : l'URL du proxy (identifiants) est dans le vault,
-- référencée par son NOM.
CREATE TABLE IF NOT EXISTS public.cloud_ips (
  id               bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  fournisseur      text NOT NULL DEFAULT 'iproyal',
  commande         text NOT NULL,            -- n° de commande fournisseur — pas un secret
  ip               inet NOT NULL,            -- IP de sortie
  port             integer NOT NULL CHECK (port BETWEEN 1 AND 65535),
  pays             text NOT NULL DEFAULT 'FR' CHECK (pays = 'FR'),
  ville            text,
  asn              text,
  secret_nom       text NOT NULL UNIQUE,     -- NOM du secret du vault ; jamais la valeur
  etat             text NOT NULL DEFAULT 'achetee'
                   CHECK (etat IN ('achetee','disponible','attribuee_essai','attribuee_client','repos','rebut','expiree')),
  user_id          uuid,                     -- titulaire ACTUEL (états attribués seulement)
  dernier_user_id  uuid,                     -- dernier titulaire (retour du même compte ; effacé à 12 mois)
  derniere_origine text CHECK (derniere_origine IN ('essai','client')),
  reserve_pour     uuid,                     -- réservée par la préparation d'un essai (avant le paiement)…
  reserve_jusqu_au timestamptz,              -- …jusqu'à cette heure
  attribuee_le     timestamptz,
  liberee_le       timestamptz,
  repos_fin        timestamptz,
  purge_preuve     jsonb,
  purge_prouvee_le timestamptz,
  expire_le        timestamptz NOT NULL,     -- échéance LUE chez le fournisseur, jamais calculée
  livree_le        timestamptz NOT NULL DEFAULT now(),
  attributions     integer NOT NULL DEFAULT 0, -- comptes DIFFÉRENTS servis (usure)
  rebut_critere    text,
  rebut_le         timestamptz,
  cree_le          timestamptz NOT NULL DEFAULT now(),
  maj_le           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cloud_ips_titulaire CHECK ((etat IN ('attribuee_essai','attribuee_client')) = (user_id IS NOT NULL)),
  CONSTRAINT cloud_ips_repos CHECK (etat <> 'repos' OR (liberee_le IS NOT NULL AND repos_fin IS NOT NULL)),
  CONSTRAINT cloud_ips_rebut CHECK (etat <> 'rebut' OR (rebut_critere IS NOT NULL AND rebut_le IS NOT NULL)),
  CONSTRAINT cloud_ips_reservation CHECK ((reserve_pour IS NULL) = (reserve_jusqu_au IS NULL))
);
-- ⛔ L'EXCLUSIVITÉ : une ligne = UN titulaire (une IP ne sert jamais deux comptes) ;
-- l'index unique : un compte n'a jamais deux IP. Rien de plus n'est nécessaire.
CREATE UNIQUE INDEX IF NOT EXISTS cloud_ips_un_titulaire ON public.cloud_ips (user_id) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS cloud_ips_une_reservation ON public.cloud_ips (reserve_pour) WHERE reserve_pour IS NOT NULL;
-- Une IP vivante n'existe qu'une fois (une IP expirée peut être relivrée un jour : nouvelle ligne).
CREATE UNIQUE INDEX IF NOT EXISTS cloud_ips_ip_vivante ON public.cloud_ips (ip) WHERE etat <> 'expiree';
CREATE INDEX IF NOT EXISTS cloud_ips_disponibles ON public.cloud_ips (expire_le, attributions) WHERE etat = 'disponible';
CREATE INDEX IF NOT EXISTS cloud_ips_au_repos ON public.cloud_ips (dernier_user_id) WHERE etat = 'repos';
ALTER TABLE public.cloud_ips ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cloud_ips FROM anon, authenticated;

-- 1.2 Les commandes passées au fournisseur (le délai de livraison se MESURE ici).
CREATE TABLE IF NOT EXISTS public.cloud_ip_commandes (
  id          bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  fournisseur text NOT NULL DEFAULT 'iproyal',
  commande    text,
  quantite    integer NOT NULL CHECK (quantite BETWEEN 1 AND 50),
  statut      text NOT NULL DEFAULT 'demandee' CHECK (statut IN ('demandee','en_cours','livree','echec','remboursee')),
  prix_usd    numeric(10,2),                 -- prix payé (lu, jamais déduit)
  go_par      text,                          -- qui a donné le GO de l'achat (aucun achat sans GO)
  demandee_le timestamptz NOT NULL DEFAULT now(),
  livree_le   timestamptz,
  details     jsonb NOT NULL DEFAULT '{}'::jsonb
);
ALTER TABLE public.cloud_ip_commandes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cloud_ip_commandes FROM anon, authenticated;

-- 1.3 Le journal de chaque IP (on n'y efface que le user_id, à 12 mois).
CREATE TABLE IF NOT EXISTS public.cloud_ip_evenements (
  id      bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  ip_id   bigint NOT NULL REFERENCES public.cloud_ips (id),
  le      timestamptz NOT NULL DEFAULT now(),
  nature  text NOT NULL CHECK (nature IN ('achat','controle_entree','reservation','attribution','retour_meme_compte',
            'conversion','liberation','purge','sortie_repos','signalement','rebut','renouvellement',
            'identifiants_changes','expiration','incident')),
  user_id uuid,
  details jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS cloud_ip_evenements_ip ON public.cloud_ip_evenements (ip_id, le DESC);
CREATE INDEX IF NOT EXISTS cloud_ip_evenements_le ON public.cloud_ip_evenements (le) WHERE user_id IS NOT NULL;
ALTER TABLE public.cloud_ip_evenements ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cloud_ip_evenements FROM anon, authenticated;

-- 1.4 La PRÉPARATION d'un essai (l'app, AVANT le paiement) : empreintes hachées
-- de l'appareil et des comptes de plateforme déjà connus du serveur, et le
-- verdict « essai permis » relu par le paiement (Stripe : avec ou sans essai ;
-- stores : semaine activée ou non). Engagées en empreintes au début réel de
-- l'essai (cloud_empreintes_engager), effacées au bout de 7 jours sinon.
CREATE TABLE IF NOT EXISTS public.cloud_essai_demandes (
  user_id      uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  appareil_h   text CHECK (appareil_h IS NULL OR appareil_h ~ '^[0-9a-f]{64}$'),
  comptes_h    jsonb NOT NULL DEFAULT '[]'::jsonb,  -- [{ plateforme, h }]
  essai_permis boolean NOT NULL,
  raison       text,                                -- pourquoi sans essai (appareil_deja_vu, compte_plateforme_deja_vu…)
  demande_le   timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.cloud_essai_demandes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cloud_essai_demandes FROM anon, authenticated;

-- 1.5 Les empreintes HACHÉES (HMAC-SHA256, sel du vault). Jamais la valeur brute.
--   'appareil'          : identifiant d'installation de l'app ;
--   'carte'             : Stripe card.fingerprint de la carte de l'essai ;
--   'compte_plateforme' : identifiant du compte Vinted / Leboncoin / Beebs (le
--                         nom de la plateforme entre dans le haché).
-- Gardées 12 mois après la fin de l'essai (réglage empreintes_conservation_mois).
-- user_id passe à NULL à la suppression du compte : l'empreinte reste (anti-abus).
CREATE TABLE IF NOT EXISTS public.cloud_essai_empreintes (
  id                 bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  user_id            uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  nature             text NOT NULL CHECK (nature IN ('appareil','carte','compte_plateforme')),
  plateforme         text CHECK ((nature = 'compte_plateforme') = (plateforme IS NOT NULL)),
  empreinte          text NOT NULL CHECK (empreinte ~ '^[0-9a-f]{64}$'),
  vu_le              timestamptz NOT NULL DEFAULT now(),
  conserver_jusqu_au timestamptz NOT NULL
);
-- LE garde-fou « un essai par appareil / par carte / par compte de plateforme ».
CREATE UNIQUE INDEX IF NOT EXISTS cloud_essai_empreintes_unique ON public.cloud_essai_empreintes (nature, empreinte);
CREATE INDEX IF NOT EXISTS cloud_essai_empreintes_user ON public.cloud_essai_empreintes (user_id);
ALTER TABLE public.cloud_essai_empreintes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cloud_essai_empreintes FROM anon, authenticated;

-- 1.6 Ceux qui ATTENDENT une place (pool vide à la préparation). Rien ne part
-- seul : la personne réessaie, l'alerte dit à Nico combien attendent.
CREATE TABLE IF NOT EXISTS public.cloud_attente (
  user_id    uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  demande_le timestamptz NOT NULL DEFAULT now(),
  derniere_le timestamptz NOT NULL DEFAULT now(),
  essais     integer NOT NULL DEFAULT 1
);
ALTER TABLE public.cloud_attente ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cloud_attente FROM anon, authenticated;

-- 1.7 Le journal des alertes (même rôle que veille_cpu_alertes : une alerte,
-- des rappels espacés, un « rétabli »).
CREATE TABLE IF NOT EXISTS public.cloud_pool_alertes (
  id      bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  le      timestamptz NOT NULL DEFAULT now(),
  nature  text NOT NULL CHECK (nature IN ('alerte', 'retabli', 'incident')),
  niveau  text CHECK (niveau IN ('vide', 'presque_vide', 'sans_place', 'serveur')),
  details jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS cloud_pool_alertes_le ON public.cloud_pool_alertes (le DESC);
ALTER TABLE public.cloud_pool_alertes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cloud_pool_alertes FROM anon, authenticated;

-- 1.8 LE COFFRE DES CONNEXIONS. Chiffré par l'ORCHESTRATEUR (AES-256-GCM) avec
-- une clé qui ne vit que sur ses serveurs : la base ne voit que du chiffré, et
-- une fuite de la base ne donne aucune connexion. Une ligne par plateforme, et
-- 'fillsell' = la session FillSell que le serveur a posée pour ce compte (aucun
-- mot de passe FillSell n'est jamais stocké). Effacé à la sortie du compte.
CREATE TABLE IF NOT EXISTS public.cloud_coffre (
  user_id     uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  plateforme  text NOT NULL CHECK (plateforme IN ('vinted','leboncoin','beebs','fillsell')),
  chiffre     text NOT NULL CHECK (length(chiffre) BETWEEN 16 AND 400000),  -- base64
  iv          text NOT NULL CHECK (iv ~ '^[A-Za-z0-9+/=]{16,32}$'),
  cle_version integer NOT NULL DEFAULT 1,
  connecte    boolean NOT NULL DEFAULT false,  -- d'après les cookies d'identité, au moment de l'écriture
  maj_le      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, plateforme)
);
ALTER TABLE public.cloud_coffre ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cloud_coffre FROM anon, authenticated;

-- 1.9 Les POSTES : le navigateur Cloud de chaque compte, vu par l'orchestrateur.
-- `session_fillsell_id` = auth.sessions.id de la session posée par le serveur
-- (révoquée à la purge) ; c'est aussi le « poste » de jobs_reservations_extension.
CREATE TABLE IF NOT EXISTS public.cloud_postes (
  user_id             uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  serveur             text,
  conteneur           text,
  etat                text NOT NULL DEFAULT 'eteint' CHECK (etat IN ('eteint','demarrage','actif','arret','erreur')),
  session_fillsell_id uuid,
  demarre_le          timestamptz,
  arrete_le           timestamptz,
  derniere_activite   timestamptz,
  prochain_reveil     timestamptz,
  derniere_erreur     text,
  details             jsonb NOT NULL DEFAULT '{}'::jsonb,
  maj_le              timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.cloud_postes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cloud_postes FROM anon, authenticated;

-- 1.10 Le journal des connexions faites depuis l'écran « Me connecter »
-- (l'orchestrateur l'écrit ; jamais de cookie ici).
CREATE TABLE IF NOT EXISTS public.cloud_connexions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  plateforme text NOT NULL CHECK (plateforme IN ('vinted','leboncoin','beebs')),
  statut     text NOT NULL CHECK (statut IN ('ouverte','connectee','abandonnee','refusee','erreur')),
  ouverte_le timestamptz NOT NULL DEFAULT now(),
  close_le   timestamptz,
  raison     text
);
CREATE INDEX IF NOT EXISTS cloud_connexions_user ON public.cloud_connexions (user_id, ouverte_le DESC);
ALTER TABLE public.cloud_connexions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cloud_connexions FROM anon, authenticated;


-- ═══ 2. Secrets, hachage, journal ═════════════════════════════════════════════
-- Le sel ne sort JAMAIS de la base (aucun GRANT, même pas service_role).
CREATE OR REPLACE FUNCTION public.cloud_sel()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $f$
  SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cloud_empreinte_sel' LIMIT 1;
$f$;

-- HMAC-SHA256(espace ':' valeur normalisée, sel). espace = 'appareil', 'carte' ou la plateforme.
CREATE OR REPLACE FUNCTION public.cloud_hacher(p_espace text, p_valeur text)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $f$
DECLARE
  v_sel text := public.cloud_sel();
  v_norm text := lower(btrim(COALESCE(p_valeur, '')));
BEGIN
  IF v_sel IS NULL OR length(v_sel) < 32 THEN
    RAISE EXCEPTION 'cloud_hacher : sel absent du vault (cloud_empreinte_sel) — on ne hache jamais sans sel';
  END IF;
  IF v_norm = '' OR COALESCE(btrim(p_espace), '') = '' THEN RETURN NULL; END IF;
  RETURN encode(extensions.hmac(lower(btrim(p_espace)) || ':' || v_norm, v_sel, 'sha256'), 'hex');
END;
$f$;

-- L'URL du proxy d'une IP (identifiants compris), pour l'orchestrateur seul.
CREATE OR REPLACE FUNCTION public.cloud_proxy_identifiants(p_ip bigint)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $f$
  SELECT s.decrypted_secret
    FROM public.cloud_ips i JOIN vault.decrypted_secrets s ON s.name = i.secret_nom
   WHERE i.id = p_ip AND i.etat NOT IN ('rebut', 'expiree');
$f$;

CREATE OR REPLACE FUNCTION public.cloud_journal(p_ip bigint, p_nature text, p_user uuid, p_details jsonb DEFAULT '{}'::jsonb)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $f$
  INSERT INTO public.cloud_ip_evenements (ip_id, nature, user_id, details)
  VALUES (p_ip, p_nature, p_user, COALESCE(p_details, '{}'::jsonb));
$f$;


-- ═══ 3. Les preuves — MÊMES CODES, MÊME ORDRE que cloud-pool.js ═══════════════
-- Preuve de purge (l'orchestrateur, après la libération) :
--   { version: 1, faite_le, profil: { ancien, nouveau, ancien_detruit: true, nouveau_cree_le },
--     cookies_restants: 0, stockages_restants: 0, coffre_restants: 0,
--     session_fillsell_revoquee: true, empreinte: { ancienne, nouvelle },
--     identifiants_proxy_renouveles: true }
CREATE OR REPLACE FUNCTION public.cloud_purge_manques(p_preuve jsonb, p_liberee_le timestamptz)
RETURNS text[] LANGUAGE plpgsql STABLE SET search_path TO 'public', 'pg_temp' AS $f$
DECLARE
  m text[] := '{}';
  q jsonb := CASE WHEN jsonb_typeof(p_preuve) = 'object' THEN p_preuve ELSE '{}'::jsonb END;
  v_faite timestamptz := public.cloud_ts(q ->> 'faite_le');
  v_cree timestamptz := public.cloud_ts(q #>> '{profil,nouveau_cree_le}');
BEGIN
  IF (q -> 'version') IS DISTINCT FROM '1'::jsonb THEN m := array_append(m, 'version'); END IF;
  IF v_faite IS NULL OR p_liberee_le IS NULL OR v_faite < p_liberee_le THEN m := array_append(m, 'faite_apres_liberation'); END IF;
  IF NOT (public.cloud_texte_non_vide(q #> '{profil,ancien}') AND public.cloud_texte_non_vide(q #> '{profil,nouveau}')
          AND (q #> '{profil,ancien}') <> (q #> '{profil,nouveau}')) THEN m := array_append(m, 'profil_recree'); END IF;
  IF (q #> '{profil,ancien_detruit}') IS DISTINCT FROM 'true'::jsonb THEN m := array_append(m, 'profil_ancien_detruit'); END IF;
  IF v_cree IS NULL OR p_liberee_le IS NULL OR v_cree < p_liberee_le THEN m := array_append(m, 'profil_neuf_apres_liberation'); END IF;
  IF NOT public.cloud_zero(q -> 'cookies_restants') THEN m := array_append(m, 'cookies_restants'); END IF;
  IF NOT public.cloud_zero(q -> 'stockages_restants') THEN m := array_append(m, 'stockages_restants'); END IF;
  IF NOT public.cloud_zero(q -> 'coffre_restants') THEN m := array_append(m, 'coffre_restants'); END IF;
  IF (q -> 'session_fillsell_revoquee') IS DISTINCT FROM 'true'::jsonb THEN m := array_append(m, 'session_fillsell_revoquee'); END IF;
  IF NOT (public.cloud_texte_non_vide(q #> '{empreinte,ancienne}') AND public.cloud_texte_non_vide(q #> '{empreinte,nouvelle}')
          AND (q #> '{empreinte,ancienne}') <> (q #> '{empreinte,nouvelle}')) THEN m := array_append(m, 'empreinte_nouvelle'); END IF;
  IF (q -> 'identifiants_proxy_renouveles') IS DISTINCT FROM 'true'::jsonb THEN m := array_append(m, 'identifiants_proxy_renouveles'); END IF;
  RETURN m;
END;
$f$;

-- Contrôle d'entrée / de sortie de repos, fait depuis un profil NEUF sans compte :
--   { fait_le, ip_sortie, pays: 'FR', listes_noires: [], plateformes: { vinted: 'ok', leboncoin: 'ok', ebay: 'ok' } }
CREATE OR REPLACE FUNCTION public.cloud_controle_manques(p_controle jsonb, p_ip inet, p_maintenant timestamptz DEFAULT now())
RETURNS text[] LANGUAGE plpgsql STABLE SET search_path TO 'public', 'pg_temp' AS $f$
DECLARE
  m text[] := '{}';
  c jsonb := CASE WHEN jsonb_typeof(p_controle) = 'object' THEN p_controle ELSE '{}'::jsonb END;
  v_fait timestamptz := public.cloud_ts(c ->> 'fait_le');
BEGIN
  IF v_fait IS NULL OR v_fait > p_maintenant + interval '5 minutes' OR v_fait < p_maintenant - interval '24 hours' THEN
    m := array_append(m, 'controle_frais');
  END IF;
  IF COALESCE(c ->> 'ip_sortie', '') <> host(p_ip) THEN m := array_append(m, 'ip_sortie'); END IF;
  IF (c -> 'pays') IS DISTINCT FROM '"FR"'::jsonb THEN m := array_append(m, 'pays'); END IF;
  -- (CASE entre parenthèses : le IF de plpgsql s'arrête au premier THEN hors parenthèses)
  IF (CASE WHEN jsonb_typeof(c -> 'listes_noires') = 'array' THEN jsonb_array_length(c -> 'listes_noires') > 0 ELSE true END) THEN
    m := array_append(m, 'listes_noires');
  END IF;
  IF (CASE WHEN jsonb_typeof(c -> 'plateformes') = 'object'
           THEN NOT EXISTS (SELECT 1 FROM jsonb_object_keys(c -> 'plateformes'))
             OR EXISTS (SELECT 1 FROM jsonb_each(c -> 'plateformes') e WHERE e.value = '"bloque"'::jsonb)
           ELSE true END) THEN
    m := array_append(m, 'plateformes');
  END IF;
  RETURN m;
END;
$f$;


-- ═══ 4. Le cycle de vie d'une IP — RPC atomiques (clé de service) ═════════════
--   achetee ─contrôle─▶ disponible ─(réservée 30 min)─▶ attribuee_essai ─paie─▶ attribuee_client
--      │ raté               ▲                                  │ inactif            │ arrêtée
--      ▼                    └── sortie (repos fini + purge ◀── repos ◀─────────────┘
--   rebut ◀── signalée (tout état vivant)   prouvée + contrôle frais)
--   expiree : échéance non renouvelée ; ⛔ jamais sous un titulaire.

-- 4.1 Livraison : l'IP entre (état achetee). L'URL du proxy va DIRECTEMENT au vault.
-- ⛔ Une IP déjà mise au rebut ne revient jamais, même relivrée : elle entre au rebut.
CREATE OR REPLACE FUNCTION public.cloud_ip_ajouter(p_commande text, p_ip inet, p_port integer, p_ville text,
                                                   p_asn text, p_proxy_url text, p_expire_le timestamptz)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $f$
DECLARE
  v_nom text := 'cloud_proxy_' || regexp_replace(p_commande, '[^0-9A-Za-z]', '', 'g') || '_' || replace(host(p_ip), '.', '_');
  v_rebut boolean := EXISTS (SELECT 1 FROM public.cloud_ips WHERE ip = p_ip AND rebut_le IS NOT NULL);
  v_usure integer := COALESCE((SELECT sum(attributions) FROM public.cloud_ips WHERE ip = p_ip), 0);
  v_id bigint;
BEGIN
  IF COALESCE(btrim(p_commande), '') = '' OR p_ip IS NULL THEN RAISE EXCEPTION 'cloud_ip_ajouter : commande ou IP absente'; END IF;
  IF p_expire_le IS NULL OR p_expire_le <= now() THEN RAISE EXCEPTION 'cloud_ip_ajouter : échéance absente ou passée'; END IF;
  IF COALESCE(p_proxy_url, '') = '' THEN RAISE EXCEPTION 'cloud_ip_ajouter : URL du proxy absente'; END IF;
  PERFORM vault.create_secret(p_proxy_url, v_nom, 'proxy FillSell Cloud ' || host(p_ip));
  INSERT INTO public.cloud_ips (commande, ip, port, ville, asn, secret_nom, expire_le, attributions,
                                etat, rebut_critere, rebut_le)
  VALUES (p_commande, p_ip, p_port, p_ville, p_asn, v_nom, p_expire_le, v_usure,
          CASE WHEN v_rebut THEN 'rebut' ELSE 'achetee' END,
          CASE WHEN v_rebut THEN 'deja_au_rebut' END,
          CASE WHEN v_rebut THEN now() END)
  RETURNING id INTO v_id;
  PERFORM public.cloud_journal(v_id, 'achat', NULL, jsonb_build_object('commande', p_commande, 'expire_le', p_expire_le,
          'deja_au_rebut', v_rebut, 'attributions_reprises', v_usure));
  RETURN v_id;
END;
$f$;

-- 4.2 Contrôle d'entrée (dans les 24 h et < 500 Mo : la fenêtre de remplacement IPRoyal).
CREATE OR REPLACE FUNCTION public.cloud_ip_controle_entree(p_ip bigint, p_controle jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $f$
DECLARE
  v public.cloud_ips%ROWTYPE;
  v_manques text[];
BEGIN
  SELECT * INTO v FROM public.cloud_ips WHERE id = p_ip FOR UPDATE;
  IF NOT FOUND OR v.etat <> 'achetee' THEN RETURN jsonb_build_object('ok', false, 'raison', 'pas_achetee'); END IF;
  v_manques := public.cloud_controle_manques(p_controle, v.ip);
  PERFORM public.cloud_journal(p_ip, 'controle_entree', NULL, jsonb_build_object('controle', p_controle, 'manques', to_jsonb(v_manques)));
  IF cardinality(v_manques) > 0 THEN
    PERFORM public.cloud_ip_signaler(p_ip, 'controle_entree', jsonb_build_object('manques', to_jsonb(v_manques)));
    RETURN jsonb_build_object('ok', false, 'raison', 'rebut', 'manques', to_jsonb(v_manques), 'demander_remplacement', true);
  END IF;
  UPDATE public.cloud_ips SET etat = 'disponible', maj_le = now() WHERE id = p_ip;
  RETURN jsonb_build_object('ok', true);
END;
$f$;

-- 4.3 ATTRIBUABLE ? Miroir de ipAttribuable (cloud-pool.js), même ordre :
--   · couvre l'essai entier : échéance ≥ maintenant + 7 j + grâce + marge (client : + N jours) ;
--   · au repos : seulement à SON dernier titulaire (aucun autre compte ne l'a vue) ;
--   · disponible : pas usée, et pas réservée pour un AUTRE compte.
CREATE OR REPLACE FUNCTION public.cloud_ip_attribuable(p public.cloud_ips, p_user uuid, p_nature text)
RETURNS boolean LANGUAGE sql STABLE SET search_path TO 'public', 'pg_temp' AS $f$
  SELECT p.expire_le >= CASE WHEN p_nature = 'essai'
                             THEN now() + make_interval(days => 7 + public.cloud_param('grace_jours', 2)
                                                              + public.cloud_param('marge_expiration_jours', 1))
                             ELSE now() + make_interval(days => public.cloud_param('renouvellement_avant_jours', 3)) END
     AND CASE
           WHEN p.etat = 'repos' THEN p_user IS NOT NULL AND p.dernier_user_id = p_user
           WHEN p.etat = 'disponible' THEN p.attributions < public.cloud_param('attributions_max', 6)
                AND (p.reserve_pour IS NULL OR p.reserve_pour = p_user OR p.reserve_jusqu_au < now())
           ELSE false END;
$f$;

-- 4.4 RÉSERVATION (préparation d'un essai, avant le paiement) : une IP mise de
-- côté `reservation_min` minutes pour ce compte. NULL = pool vide.
-- Ordre : sa propre IP au repos ; sa réservation en cours ; la disponible qui
-- expire le plus tôt tout en couvrant l'essai (FEFO), la moins usée à égalité.
CREATE OR REPLACE FUNCTION public.cloud_ip_reserver(p_user uuid)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $f$
DECLARE v_ip bigint;
BEGIN
  IF p_user IS NULL THEN RETURN NULL; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('cloud_ip:' || p_user::text, 0));
  SELECT id INTO v_ip FROM public.cloud_ips WHERE user_id = p_user;
  IF v_ip IS NOT NULL THEN RETURN v_ip; END IF;
  SELECT id INTO v_ip FROM public.cloud_ips i
   WHERE i.etat = 'repos' AND i.dernier_user_id = p_user AND public.cloud_ip_attribuable(i, p_user, 'essai')
   ORDER BY i.liberee_le DESC LIMIT 1 FOR UPDATE SKIP LOCKED;
  IF v_ip IS NOT NULL THEN RETURN v_ip; END IF;   -- la sienne : rien à réserver, personne d'autre ne la prend
  SELECT id INTO v_ip FROM public.cloud_ips i
   WHERE i.etat = 'disponible' AND public.cloud_ip_attribuable(i, p_user, 'essai')
   ORDER BY (i.reserve_pour = p_user) DESC NULLS LAST, i.expire_le, i.attributions, i.id
   LIMIT 1 FOR UPDATE SKIP LOCKED;
  IF v_ip IS NULL THEN RETURN NULL; END IF;
  UPDATE public.cloud_ips SET reserve_pour = NULL, reserve_jusqu_au = NULL WHERE reserve_pour = p_user AND id <> v_ip;
  UPDATE public.cloud_ips
     SET reserve_pour = p_user, reserve_jusqu_au = now() + make_interval(mins => public.cloud_param('reservation_min', 30)), maj_le = now()
   WHERE id = v_ip;
  PERFORM public.cloud_journal(v_ip, 'reservation', p_user, '{}'::jsonb);
  RETURN v_ip;
END;
$f$;

-- 4.5 ATTRIBUTION ATOMIQUE (le déclencheur, quand le compte devient actif).
-- Ordre : déjà titulaire → la même ; sa propre IP au repos ; SA réservation ;
-- la disponible qui expire le plus tôt tout en couvrant (FEFO), la moins usée.
-- Pool vide → NULL, jamais une erreur (l'alerte « sans_place » part à l'entretien).
CREATE OR REPLACE FUNCTION public.cloud_ip_attribuer(p_user uuid, p_nature text)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $f$
DECLARE
  v_ip bigint;
  v_retour boolean := false;
BEGIN
  IF p_user IS NULL OR p_nature NOT IN ('essai', 'client') THEN RAISE EXCEPTION 'cloud_ip_attribuer : appel invalide'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('cloud_ip:' || p_user::text, 0));
  SELECT id INTO v_ip FROM public.cloud_ips WHERE user_id = p_user;
  IF v_ip IS NOT NULL THEN RETURN v_ip; END IF;
  SELECT id INTO v_ip FROM public.cloud_ips i
   WHERE i.etat = 'repos' AND i.dernier_user_id = p_user AND public.cloud_ip_attribuable(i, p_user, p_nature)
   ORDER BY i.liberee_le DESC LIMIT 1 FOR UPDATE SKIP LOCKED;
  v_retour := v_ip IS NOT NULL;
  IF v_ip IS NULL THEN
    SELECT id INTO v_ip FROM public.cloud_ips i
     WHERE i.etat = 'disponible' AND public.cloud_ip_attribuable(i, p_user, p_nature)
     ORDER BY (i.reserve_pour = p_user) DESC NULLS LAST, i.expire_le, i.attributions, i.id
     LIMIT 1 FOR UPDATE SKIP LOCKED;
  END IF;
  IF v_ip IS NULL THEN RETURN NULL; END IF;
  UPDATE public.cloud_ips SET reserve_pour = NULL, reserve_jusqu_au = NULL WHERE reserve_pour = p_user AND id <> v_ip;
  UPDATE public.cloud_ips
     SET etat = 'attribuee_' || p_nature, user_id = p_user,
         attributions = attributions + CASE WHEN dernier_user_id IS DISTINCT FROM p_user THEN 1 ELSE 0 END,
         dernier_user_id = p_user, derniere_origine = p_nature,
         reserve_pour = NULL, reserve_jusqu_au = NULL,
         attribuee_le = now(), liberee_le = NULL, repos_fin = NULL,
         purge_preuve = NULL, purge_prouvee_le = NULL, maj_le = now()
   WHERE id = v_ip;
  PERFORM public.cloud_journal(v_ip, CASE WHEN v_retour THEN 'retour_meme_compte' ELSE 'attribution' END, p_user,
          jsonb_build_object('nature', p_nature));
  RETURN v_ip;
END;
$f$;

-- 4.6 LIBÉRATION : l'IP part au REPOS. L'orchestrateur purge AUSSITÔT (profil
-- détruit, coffre vidé, session FillSell révoquée, identifiants du proxy
-- changés) et dépose sa preuve (4.8). Le repos compte à partir d'ici.
CREATE OR REPLACE FUNCTION public.cloud_ip_liberer(p_user uuid, p_raison text)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $f$
DECLARE
  v_ip bigint; v_etat text;
BEGIN
  UPDATE public.cloud_ips SET reserve_pour = NULL, reserve_jusqu_au = NULL WHERE reserve_pour = p_user;
  SELECT id, etat INTO v_ip, v_etat FROM public.cloud_ips WHERE user_id = p_user FOR UPDATE;
  IF v_ip IS NULL THEN RETURN NULL; END IF;
  UPDATE public.cloud_ips
     SET etat = 'repos', user_id = NULL, liberee_le = now(),
         repos_fin = now() + make_interval(days => public.cloud_param('repos_jours', 7)),
         purge_preuve = NULL, purge_prouvee_le = NULL, maj_le = now()
   WHERE id = v_ip;
  PERFORM public.cloud_journal(v_ip, 'liberation', p_user, jsonb_build_object('raison', p_raison, 'etat_avant', v_etat));
  RETURN v_ip;
END;
$f$;

-- 4.7 SIGNALEMENT → REBUT, depuis n'importe quel état vivant. Jamais réattribuée,
-- jamais renouvelée. Le titulaire n'est jamais laissé sans IP : il en reçoit une
-- autre tout de suite (s'il en reste) ; il garde son coffre (ses connexions).
CREATE OR REPLACE FUNCTION public.cloud_ip_signaler(p_ip bigint, p_critere text, p_details jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $f$
DECLARE
  v public.cloud_ips%ROWTYPE;
  v_nouvelle bigint;
BEGIN
  IF p_critere NOT IN ('blocage_anti_robot','captcha_repete','compte_restreint','liste_noire',
                       'sortie_non_conforme','controle_entree','manuel') THEN
    RAISE EXCEPTION 'cloud_ip_signaler : critère inconnu %', p_critere;
  END IF;
  SELECT * INTO v FROM public.cloud_ips WHERE id = p_ip FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'raison', 'ip_inconnue'); END IF;
  PERFORM public.cloud_journal(p_ip, 'signalement', v.user_id, jsonb_build_object('critere', p_critere, 'details', p_details, 'etat_avant', v.etat));
  IF v.etat IN ('rebut', 'expiree') THEN RETURN jsonb_build_object('ok', true, 'deja', v.etat); END IF;
  UPDATE public.cloud_ips
     SET etat = 'rebut', user_id = NULL, reserve_pour = NULL, reserve_jusqu_au = NULL,
         rebut_critere = p_critere, rebut_le = now(), liberee_le = COALESCE(liberee_le, now()), maj_le = now()
   WHERE id = p_ip;
  PERFORM public.cloud_journal(p_ip, 'rebut', v.user_id, jsonb_build_object('critere', p_critere));
  IF v.user_id IS NOT NULL THEN
    v_nouvelle := public.cloud_ip_attribuer(v.user_id, CASE WHEN v.etat = 'attribuee_client' THEN 'client' ELSE 'essai' END);
  END IF;
  RETURN jsonb_build_object('ok', true, 'rebut', true, 'titulaire', v.user_id, 'nouvelle_ip', v_nouvelle);
END;
$f$;

-- 4.8 PREUVE DE PURGE (l'IP reste au repos ; la preuve est exigée pour en sortir).
CREATE OR REPLACE FUNCTION public.cloud_ip_noter_purge(p_ip bigint, p_preuve jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $f$
DECLARE
  v public.cloud_ips%ROWTYPE;
  v_manques text[];
BEGIN
  SELECT * INTO v FROM public.cloud_ips WHERE id = p_ip FOR UPDATE;
  IF NOT FOUND OR v.etat <> 'repos' THEN RETURN jsonb_build_object('ok', false, 'raison', 'pas_au_repos'); END IF;
  v_manques := public.cloud_purge_manques(p_preuve, v.liberee_le);
  PERFORM public.cloud_journal(p_ip, 'purge', NULL, jsonb_build_object('manques', to_jsonb(v_manques)));
  IF cardinality(v_manques) > 0 THEN RETURN jsonb_build_object('ok', false, 'manques', to_jsonb(v_manques)); END IF;
  UPDATE public.cloud_ips SET purge_preuve = p_preuve, purge_prouvee_le = now(), maj_le = now() WHERE id = p_ip;
  RETURN jsonb_build_object('ok', true);
END;
$f$;

-- 4.9 REPOS → DISPONIBLE : repos fini, purge prouvée APRÈS la libération,
-- contrôle de sortie frais et bon, IP pas en fin de vie. (Décision du 05/10 :
-- l'IP d'un ancien client payant retourne AUSSI au pool, après le même repos.)
-- Miroir de peutRemettreEnPool.
CREATE OR REPLACE FUNCTION public.cloud_ip_remettre_en_pool(p_ip bigint, p_controle jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $f$
DECLARE
  v public.cloud_ips%ROWTYPE;
  m text[] := '{}';
BEGIN
  SELECT * INTO v FROM public.cloud_ips WHERE id = p_ip FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'manques', '["ip_inconnue"]'::jsonb); END IF;
  IF v.etat IS DISTINCT FROM 'repos' THEN m := array_append(m, 'pas_au_repos'); END IF;
  IF v.repos_fin IS NULL OR now() < v.repos_fin THEN m := array_append(m, 'repos_en_cours'); END IF;
  IF v.purge_prouvee_le IS NULL OR v.liberee_le IS NULL OR v.purge_prouvee_le < v.liberee_le
     OR cardinality(public.cloud_purge_manques(v.purge_preuve, v.liberee_le)) > 0 THEN
    m := array_append(m, 'purge_non_prouvee');
  END IF;
  IF v.expire_le <= now() THEN m := array_append(m, 'expiree'); END IF;
  m := m || public.cloud_controle_manques(p_controle, v.ip);
  IF cardinality(m) > 0 THEN RETURN jsonb_build_object('ok', false, 'manques', to_jsonb(m)); END IF;
  UPDATE public.cloud_ips SET etat = 'disponible', maj_le = now() WHERE id = p_ip;
  PERFORM public.cloud_journal(p_ip, 'sortie_repos', NULL, jsonb_build_object('controle', p_controle));
  RETURN jsonb_build_object('ok', true);
END;
$f$;

-- 4.10 Renouvellement (échéance RELUE chez le fournisseur après le « extend ») et
-- changement des identifiants du proxy (à chaque purge).
CREATE OR REPLACE FUNCTION public.cloud_ip_renouvelee(p_ip bigint, p_expire_le timestamptz)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $f$
DECLARE v_avant timestamptz;
BEGIN
  SELECT expire_le INTO v_avant FROM public.cloud_ips WHERE id = p_ip AND etat NOT IN ('rebut', 'expiree') FOR UPDATE;
  IF v_avant IS NULL OR p_expire_le IS NULL OR p_expire_le <= v_avant THEN RETURN false; END IF;
  UPDATE public.cloud_ips SET expire_le = p_expire_le, maj_le = now() WHERE id = p_ip;
  PERFORM public.cloud_journal(p_ip, 'renouvellement', NULL, jsonb_build_object('avant', v_avant, 'apres', p_expire_le));
  RETURN true;
END;
$f$;
CREATE OR REPLACE FUNCTION public.cloud_ip_identifiants_changes(p_ip bigint, p_proxy_url text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $f$
DECLARE v_secret uuid;
BEGIN
  SELECT s.id INTO v_secret FROM public.cloud_ips i JOIN vault.secrets s ON s.name = i.secret_nom WHERE i.id = p_ip;
  IF v_secret IS NULL OR COALESCE(p_proxy_url, '') = '' THEN RETURN false; END IF;
  PERFORM vault.update_secret(v_secret, p_proxy_url);
  PERFORM public.cloud_journal(p_ip, 'identifiants_changes', NULL, '{}'::jsonb);
  RETURN true;
END;
$f$;


-- ═══ 5. Le compte suit son état : une IP quand il est actif, le repos sinon ═══

-- 5.1 Les empreintes de la préparation deviennent DÉFINITIVES au début réel de
-- l'essai (un abandon avant le paiement ne coûte jamais l'essai à personne).
CREATE OR REPLACE FUNCTION public.cloud_empreintes_engager(p_user uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $f$
DECLARE
  d public.cloud_essai_demandes%ROWTYPE;
  v_garde timestamptz;
  v_n integer := 0; v_k integer;
BEGIN
  SELECT * INTO d FROM public.cloud_essai_demandes WHERE user_id = p_user;
  IF NOT FOUND OR d.essai_permis IS NOT TRUE THEN RETURN 0; END IF;
  SELECT COALESCE(cloud_essai_fin, now() + interval '7 days')
           + make_interval(months => public.cloud_param('empreintes_conservation_mois', 12))
    INTO v_garde FROM public.profiles WHERE id = p_user;
  IF d.appareil_h IS NOT NULL THEN
    INSERT INTO public.cloud_essai_empreintes (user_id, nature, plateforme, empreinte, conserver_jusqu_au)
    VALUES (p_user, 'appareil', NULL, d.appareil_h, v_garde) ON CONFLICT (nature, empreinte) DO NOTHING;
    GET DIAGNOSTICS v_k = ROW_COUNT; v_n := v_n + v_k;
  END IF;
  INSERT INTO public.cloud_essai_empreintes (user_id, nature, plateforme, empreinte, conserver_jusqu_au)
  SELECT DISTINCT ON (x ->> 'h') p_user, 'compte_plateforme', x ->> 'plateforme', x ->> 'h', v_garde
    FROM jsonb_array_elements(CASE WHEN jsonb_typeof(d.comptes_h) = 'array' THEN d.comptes_h ELSE '[]'::jsonb END) x
   WHERE COALESCE(x ->> 'h', '') ~ '^[0-9a-f]{64}$' AND COALESCE(x ->> 'plateforme', '') <> ''
  ON CONFLICT (nature, empreinte) DO NOTHING;
  GET DIAGNOSTICS v_k = ROW_COUNT; v_n := v_n + v_k;
  DELETE FROM public.cloud_essai_demandes WHERE user_id = p_user;
  RETURN v_n;
END;
$f$;

-- 5.2 SYNCHRONISER un compte avec son état (cloud_etat — la même règle que
-- cloudDuProfil dans l'app). Appelée par le déclencheur et par l'entretien.
--   actif, sans IP          → une IP (essai ou client) ; essai qui démarre → empreintes engagées ;
--   payé sur une IP d'essai → l'IP devient celle du client ;
--   inactif                 → repos, SAUF un essai fini normalement pendant sa grâce
--                             (le temps que le premier paiement passe sans tout reconnecter).
CREATE OR REPLACE FUNCTION public.cloud_compte_synchroniser(p_user uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $f$
DECLARE
  v_e jsonb := public.cloud_etat(p_user);
  v_etat text := v_e ->> 'etat';
  v_actif boolean := COALESCE((v_e ->> 'actif')::boolean, false);
  v_ip public.cloud_ips%ROWTYPE;
  v_id bigint;
BEGIN
  SELECT * INTO v_ip FROM public.cloud_ips WHERE user_id = p_user;
  IF v_actif THEN
    IF v_ip.id IS NULL THEN
      v_id := public.cloud_ip_attribuer(p_user, CASE WHEN v_etat = 'paye' THEN 'client' ELSE 'essai' END);
      IF v_etat = 'essai' THEN PERFORM public.cloud_empreintes_engager(p_user); END IF;
      DELETE FROM public.cloud_attente WHERE user_id = p_user AND v_id IS NOT NULL;
      RETURN jsonb_build_object('etat', v_etat, 'action', CASE WHEN v_id IS NULL THEN 'sans_place' ELSE 'attribuee' END, 'ip', v_id);
    END IF;
    IF v_etat = 'paye' AND v_ip.etat = 'attribuee_essai' THEN
      UPDATE public.cloud_ips SET etat = 'attribuee_client', derniere_origine = 'client', maj_le = now() WHERE id = v_ip.id;
      PERFORM public.cloud_journal(v_ip.id, 'conversion', p_user, '{}'::jsonb);
      RETURN jsonb_build_object('etat', v_etat, 'action', 'convertie', 'ip', v_ip.id);
    END IF;
    RETURN jsonb_build_object('etat', v_etat, 'action', 'rien', 'ip', v_ip.id);
  END IF;
  IF v_ip.id IS NULL THEN RETURN jsonb_build_object('etat', v_etat, 'action', 'rien'); END IF;
  IF v_etat = 'essai_termine'
     AND COALESCE((v_e ->> 'essaiArrete')::boolean, false) IS NOT TRUE
     AND public.cloud_ts(v_e ->> 'essaiFin') + make_interval(days => public.cloud_param('grace_jours', 2)) > now() THEN
    RETURN jsonb_build_object('etat', v_etat, 'action', 'grace', 'ip', v_ip.id);
  END IF;
  v_id := public.cloud_ip_liberer(p_user, 'inactif:' || COALESCE(v_etat, '?'));
  RETURN jsonb_build_object('etat', v_etat, 'action', 'repos', 'ip', v_id);
END;
$f$;

-- 5.3 Le pont avec les paiements : ils n'écrivent que profiles ; ce déclencheur
-- fait suivre le pool. ⛔ Un paiement n'échoue JAMAIS à cause du pool : erreur
-- avalée en WARNING, l'entretien horaire rattrape.
CREATE OR REPLACE FUNCTION public.profiles_cloud_pool()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $f$
BEGIN
  BEGIN
    PERFORM public.cloud_compte_synchroniser(NEW.id);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'profiles_cloud_pool : compte % : %', NEW.id, SQLERRM;
  END;
  RETURN NULL;
END;
$f$;
DROP TRIGGER IF EXISTS profiles_cloud_pool ON public.profiles;
CREATE TRIGGER profiles_cloud_pool
  AFTER UPDATE OF is_cloud, cloud_essai_debut, cloud_essai_fin, cloud_essai_arrete ON public.profiles
  FOR EACH ROW WHEN (OLD.is_cloud IS DISTINCT FROM NEW.is_cloud
                  OR OLD.cloud_essai_debut IS DISTINCT FROM NEW.cloud_essai_debut
                  OR OLD.cloud_essai_fin IS DISTINCT FROM NEW.cloud_essai_fin
                  OR OLD.cloud_essai_arrete IS DISTINCT FROM NEW.cloud_essai_arrete)
  EXECUTE FUNCTION public.profiles_cloud_pool();


-- ═══ 6. L'essai unique — les quatre verrous ══════════════════════════════════
-- 6.1 PRÉPARER (l'app, AVANT d'ouvrir Stripe, l'App Store ou Google Play).
-- Miroir de verdictPreparation (cloud-pool.js), même ordre :
--   refus : compte_inconnu · deja_client · pool_vide (alerte + attente) ;
--   sinon ok, avec essai = false et sa raison si : essai_deja_pris · appareil_inconnu ·
--   appareil_deja_vu · compte_plateforme_deja_vu (les comptes Vinted déjà relevés
--   par l'extension de ce compte) — l'option reste possible, payée tout de suite.
-- Une place est RÉSERVÉE `reservation_min` minutes : jamais d'essai qui démarre sans IP.
CREATE OR REPLACE FUNCTION public.cloud_essai_preparer_moi(p_appareil text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $f$
DECLARE
  v_user uuid := auth.uid();
  v_trouve boolean; v_cloud boolean; v_debut timestamptz;
  v_h_app text; v_raison text; v_permis boolean := true; v_ip bigint;
  v_comptes jsonb := '[]'::jsonb; c record; v_h text;
BEGIN
  SELECT true, p.is_cloud, p.cloud_essai_debut INTO v_trouve, v_cloud, v_debut FROM public.profiles p WHERE p.id = v_user;
  IF v_trouve IS NOT TRUE THEN RETURN jsonb_build_object('ok', false, 'raison', 'compte_inconnu'); END IF;
  IF v_cloud IS TRUE THEN RETURN jsonb_build_object('ok', false, 'raison', 'deja_client'); END IF;
  -- La place d'abord : sans IP, rien ne démarre (ni essai, ni paiement).
  v_ip := public.cloud_ip_reserver(v_user);
  IF v_ip IS NULL THEN
    INSERT INTO public.cloud_attente AS a (user_id) VALUES (v_user)
    ON CONFLICT (user_id) DO UPDATE SET derniere_le = now(), essais = a.essais + 1;
    RETURN jsonb_build_object('ok', false, 'raison', 'pool_vide');
  END IF;
  DELETE FROM public.cloud_attente WHERE user_id = v_user;
  -- Les verrous de l'ESSAI (l'option, elle, reste possible).
  IF v_debut IS NOT NULL THEN
    v_permis := false; v_raison := 'essai_deja_pris';
  ELSIF COALESCE(btrim(p_appareil), '') = '' THEN
    v_permis := false; v_raison := 'appareil_inconnu';
  ELSE
    v_h_app := public.cloud_hacher('appareil', p_appareil);
    IF EXISTS (SELECT 1 FROM public.cloud_essai_empreintes WHERE nature = 'appareil' AND empreinte = v_h_app
                 AND user_id IS DISTINCT FROM v_user) THEN
      v_permis := false; v_raison := 'appareil_deja_vu';
    END IF;
  END IF;
  -- Les comptes Vinted que l'extension de CE compte a déjà relevés (au plus 10).
  FOR c IN SELECT DISTINCT r.vinted_user_id::text AS ident FROM public.vinted_sync_runs r
            WHERE r.user_id = v_user AND r.vinted_user_id IS NOT NULL LIMIT 10 LOOP
    v_h := public.cloud_hacher('vinted', c.ident);
    CONTINUE WHEN v_h IS NULL;
    v_comptes := v_comptes || jsonb_build_object('plateforme', 'vinted', 'h', v_h);
    IF v_permis AND EXISTS (SELECT 1 FROM public.cloud_essai_empreintes WHERE nature = 'compte_plateforme' AND empreinte = v_h
                              AND user_id IS DISTINCT FROM v_user) THEN
      v_permis := false; v_raison := 'compte_plateforme_deja_vu';
    END IF;
  END LOOP;
  INSERT INTO public.cloud_essai_demandes (user_id, appareil_h, comptes_h, essai_permis, raison)
  VALUES (v_user, v_h_app, v_comptes, v_permis, v_raison)
  ON CONFLICT (user_id) DO UPDATE SET appareil_h = EXCLUDED.appareil_h, comptes_h = EXCLUDED.comptes_h,
    essai_permis = EXCLUDED.essai_permis, raison = EXCLUDED.raison, demande_le = now();
  RETURN jsonb_build_object('ok', true, 'essai', v_permis, 'raison', v_raison,
    'place_jusqu_au', (SELECT reserve_jusqu_au FROM public.cloud_ips WHERE id = v_ip));
END;
$f$;

-- 6.2 L'essai est-il PERMIS pour ce compte ? Lu par les paiements (create-checkout-session :
-- Checkout avec ou sans essai ; webhooks des stores : semaine activée ou non).
-- Sans préparation fraîche (< 1 h) : non (l'app prépare TOUJOURS avant d'ouvrir le paiement).
CREATE OR REPLACE FUNCTION public.cloud_essai_permis(p_user uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $f$
  SELECT CASE
    WHEN p.id IS NULL THEN jsonb_build_object('permis', false, 'raison', 'compte_inconnu')
    WHEN p.cloud_essai_debut IS NOT NULL THEN jsonb_build_object('permis', false, 'raison', 'essai_deja_pris')
    WHEN d.user_id IS NULL OR d.demande_le < now() - interval '1 hour' THEN jsonb_build_object('permis', false, 'raison', 'non_prepare')
    ELSE jsonb_build_object('permis', d.essai_permis, 'raison', d.raison) END
    FROM (SELECT p_user AS id) x
    LEFT JOIN public.profiles p ON p.id = x.id
    LEFT JOIN public.cloud_essai_demandes d ON d.user_id = x.id;
$f$;

-- 6.3 LA CARTE (4e verrou) — stripe-webhook, au début d'un essai Stripe, avec
-- card.fingerprint. Déjà vue sur l'essai d'un AUTRE compte → { ok: false } :
-- l'appelant annule l'abonnement d'essai sur-le-champ (rien n'est facturé) et
-- l'essai est marqué arrêté (il compte comme pris).
CREATE OR REPLACE FUNCTION public.cloud_essai_noter_carte(p_user uuid, p_carte text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $f$
DECLARE
  v_h text := public.cloud_hacher('carte', p_carte);
  v_autre uuid; v_vu boolean; v_id bigint; v_garde timestamptz;
BEGIN
  IF v_h IS NULL THEN RETURN jsonb_build_object('ok', false, 'raison', 'carte_absente'); END IF;
  SELECT user_id INTO v_autre FROM public.cloud_essai_empreintes WHERE nature = 'carte' AND empreinte = v_h;
  v_vu := FOUND;
  IF v_vu THEN
    IF v_autre IS NOT DISTINCT FROM p_user THEN RETURN jsonb_build_object('ok', true, 'deja_note', true); END IF;
    RETURN jsonb_build_object('ok', false, 'raison', 'carte_deja_vue');
  END IF;
  SELECT COALESCE(cloud_essai_fin, now() + interval '7 days')
           + make_interval(months => public.cloud_param('empreintes_conservation_mois', 12))
    INTO v_garde FROM public.profiles WHERE id = p_user;
  INSERT INTO public.cloud_essai_empreintes (user_id, nature, plateforme, empreinte, conserver_jusqu_au)
  VALUES (p_user, 'carte', NULL, v_h, COALESCE(v_garde, now() + interval '12 months'))
  ON CONFLICT (nature, empreinte) DO NOTHING RETURNING id INTO v_id;
  IF v_id IS NULL THEN RETURN jsonb_build_object('ok', false, 'raison', 'carte_deja_vue'); END IF;
  RETURN jsonb_build_object('ok', true);
END;
$f$;

-- 6.4 Compte de plateforme vu par NOTRE navigateur (première connexion depuis
-- « Me connecter »). Déjà vu sur l'essai d'un AUTRE compte, pendant un essai →
-- l'essai s'arrête (effet immédiat, il compte comme pris), le compte sort ;
-- l'orchestrateur annule l'abonnement d'essai (cancel-subscription, option cloud).
-- Client payant : on note seulement.
CREATE OR REPLACE FUNCTION public.cloud_essai_noter_compte_plateforme(p_user uuid, p_plateforme text, p_identifiant text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $f$
DECLARE
  v_h text := public.cloud_hacher(p_plateforme, p_identifiant);
  v_e jsonb := public.cloud_etat(p_user);
  v_autre uuid; v_vu boolean; v_id bigint; v_garde timestamptz;
BEGIN
  IF v_h IS NULL THEN RETURN jsonb_build_object('ok', false, 'raison', 'identifiant_vide'); END IF;
  SELECT user_id INTO v_autre FROM public.cloud_essai_empreintes WHERE nature = 'compte_plateforme' AND empreinte = v_h;
  v_vu := FOUND;
  IF v_vu AND v_autre IS NOT DISTINCT FROM p_user THEN RETURN jsonb_build_object('ok', true, 'deja_note', true); END IF;
  IF COALESCE(v_e ->> 'etat', '') <> 'essai' THEN RETURN jsonb_build_object('ok', true, 'essai', false); END IF;
  IF v_vu THEN
    UPDATE public.profiles SET cloud_essai_arrete = true, cloud_essai_fin = GREATEST(cloud_essai_debut, now())
     WHERE id = p_user;   -- le déclencheur met l'IP au repos
    RETURN jsonb_build_object('ok', false, 'raison', 'compte_plateforme_deja_vu', 'plateforme', lower(btrim(p_plateforme)),
                              'annuler_abonnement_essai', true);
  END IF;
  SELECT COALESCE(cloud_essai_fin, now()) + make_interval(months => public.cloud_param('empreintes_conservation_mois', 12))
    INTO v_garde FROM public.profiles WHERE id = p_user;
  INSERT INTO public.cloud_essai_empreintes (user_id, nature, plateforme, empreinte, conserver_jusqu_au)
  VALUES (p_user, 'compte_plateforme', lower(btrim(p_plateforme)), v_h, v_garde)
  ON CONFLICT (nature, empreinte) DO NOTHING RETURNING id INTO v_id;
  RETURN jsonb_build_object('ok', v_id IS NOT NULL, 'raison', CASE WHEN v_id IS NULL THEN 'course_perdue' END);
END;
$f$;

-- 6.5 Où en est MA place (l'app) : en attente de place ? IP prête ? (jamais l'IP elle-même).
CREATE OR REPLACE FUNCTION public.cloud_essai_moi()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $f$
  SELECT jsonb_build_object(
    'place', EXISTS (SELECT 1 FROM public.cloud_ips WHERE user_id = auth.uid()),
    'en_attente', EXISTS (SELECT 1 FROM public.cloud_attente WHERE user_id = auth.uid()),
    'poste', (SELECT etat FROM public.cloud_postes WHERE user_id = auth.uid()));
$f$;


-- ═══ 7. L'orchestrateur — comptes à servir, postes, coffre ════════════════════

-- 7.1 Les comptes dont le navigateur doit pouvoir tourner : actifs ET titulaires
-- d'une IP. (cloud_etat est rejouée par compte : la liste est petite — au plus
-- la taille du pool.)
CREATE OR REPLACE FUNCTION public.cloud_comptes_a_servir()
RETURNS TABLE (user_id uuid, ip_id bigint, ip text, port integer, etat_cloud text, poste_etat text,
               session_fillsell_id uuid, plateformes_connectees text[], delai_sessions_min integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $f$
  WITH t AS (
    SELECT i.user_id AS u, i.id AS ip_id, host(i.ip) AS ip, i.port, public.cloud_etat(i.user_id) AS e
      FROM public.cloud_ips i WHERE i.etat IN ('attribuee_essai', 'attribuee_client'))
  SELECT t.u, t.ip_id, t.ip, t.port, t.e ->> 'etat', po.etat, po.session_fillsell_id,
         COALESCE((SELECT array_agg(c.plateforme ORDER BY c.plateforme) FROM public.cloud_coffre c
                    WHERE c.user_id = t.u AND c.connecte AND c.plateforme <> 'fillsell'), '{}'),
         NULLIF(public.cloud_param('delai_sessions_min', -1), -1)
    FROM t LEFT JOIN public.cloud_postes po ON po.user_id = t.u
   -- actif, ou essai fini pendant sa grâce (le navigateur peut finir ses jobs) ;
   -- un compte inactif hors grâce n'a déjà plus d'IP (cloud_compte_synchroniser).
   WHERE COALESCE((t.e ->> 'actif')::boolean, false) OR t.e ->> 'etat' = 'essai_termine';
$f$;

-- 7.2 L'orchestrateur note l'état d'un poste (une ligne par compte).
CREATE OR REPLACE FUNCTION public.cloud_poste_noter(p_user uuid, p_etat text, p_details jsonb DEFAULT '{}'::jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $f$
DECLARE d jsonb := COALESCE(p_details, '{}'::jsonb);
BEGIN
  INSERT INTO public.cloud_postes AS po (user_id, etat, serveur, conteneur, session_fillsell_id,
                                         demarre_le, arrete_le, derniere_activite, prochain_reveil, derniere_erreur, details, maj_le)
  VALUES (p_user, p_etat, d ->> 'serveur', d ->> 'conteneur', NULLIF(d ->> 'session_fillsell_id', '')::uuid,
          CASE WHEN p_etat = 'demarrage' THEN now() END, CASE WHEN p_etat = 'eteint' THEN now() END,
          now(), public.cloud_ts(d ->> 'prochain_reveil'), d ->> 'erreur', d - 'session_fillsell_id', now())
  ON CONFLICT (user_id) DO UPDATE SET
    etat = EXCLUDED.etat,
    serveur = COALESCE(EXCLUDED.serveur, po.serveur),
    conteneur = COALESCE(EXCLUDED.conteneur, po.conteneur),
    session_fillsell_id = CASE WHEN d ? 'session_fillsell_id' THEN NULLIF(d ->> 'session_fillsell_id', '')::uuid ELSE po.session_fillsell_id END,
    demarre_le = CASE WHEN p_etat = 'demarrage' THEN now() ELSE po.demarre_le END,
    arrete_le = CASE WHEN p_etat = 'eteint' THEN now() ELSE po.arrete_le END,
    derniere_activite = now(),
    prochain_reveil = COALESCE(public.cloud_ts(d ->> 'prochain_reveil'), po.prochain_reveil),
    derniere_erreur = CASE WHEN p_etat = 'erreur' THEN d ->> 'erreur' ELSE po.derniere_erreur END,
    details = po.details || (d - 'session_fillsell_id'),
    maj_le = now();
END;
$f$;

-- 7.3 Le coffre : écrire (chiffré par l'orchestrateur), lire, vider.
CREATE OR REPLACE FUNCTION public.cloud_coffre_ecrire(p_user uuid, p_plateforme text, p_chiffre text, p_iv text,
                                                      p_cle_version integer, p_connecte boolean)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $f$
  INSERT INTO public.cloud_coffre AS c (user_id, plateforme, chiffre, iv, cle_version, connecte, maj_le)
  VALUES (p_user, p_plateforme, p_chiffre, p_iv, COALESCE(p_cle_version, 1), COALESCE(p_connecte, false), now())
  ON CONFLICT (user_id, plateforme) DO UPDATE SET chiffre = EXCLUDED.chiffre, iv = EXCLUDED.iv,
    cle_version = EXCLUDED.cle_version, connecte = EXCLUDED.connecte, maj_le = now()
  -- une sauvegarde « déconnectée » n'écrase JAMAIS une connexion connue (profil vidé, 26/09)
  WHERE EXCLUDED.connecte OR NOT c.connecte OR p_plateforme = 'fillsell';
$f$;
CREATE OR REPLACE FUNCTION public.cloud_coffre_lire(p_user uuid)
RETURNS TABLE (plateforme text, chiffre text, iv text, cle_version integer, connecte boolean, maj_le timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $f$
  SELECT plateforme, chiffre, iv, cle_version, connecte, maj_le FROM public.cloud_coffre WHERE user_id = p_user;
$f$;
CREATE OR REPLACE FUNCTION public.cloud_coffre_vider(p_user uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $f$
DECLARE v_n integer;
BEGIN
  DELETE FROM public.cloud_coffre WHERE user_id = p_user;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$f$;

-- 7.4 bis La session FillSell posée par le serveur pour CE navigateur, et elle
-- seule, est révoquée (purge, ou session remplacée). Les autres sessions du
-- compte (téléphone, ordinateur) ne sont jamais touchées.
CREATE OR REPLACE FUNCTION public.cloud_session_revoquer(p_user uuid, p_session uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $f$
DECLARE v_n integer;
BEGIN
  IF p_user IS NULL OR p_session IS NULL THEN RETURN 0; END IF;
  DELETE FROM auth.sessions WHERE id = p_session AND user_id = p_user;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  UPDATE public.cloud_postes SET session_fillsell_id = NULL, maj_le = now()
   WHERE user_id = p_user AND session_fillsell_id = p_session;
  RETURN v_n;
END;
$f$;

-- 7.4 L'app : quelles plateformes sont connectées dans MON navigateur Cloud
-- (jamais un cookie, jamais un identifiant).
CREATE OR REPLACE FUNCTION public.cloud_coffre_etat_moi()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $f$
  SELECT COALESCE(jsonb_object_agg(plateforme, jsonb_build_object('connecte', connecte, 'maj_le', maj_le)), '{}'::jsonb)
    FROM public.cloud_coffre WHERE user_id = auth.uid() AND plateforme <> 'fillsell';
$f$;


-- ═══ 8. Entretien (chaque heure) et état (veille, ops-digest) ══════════════════
-- Ce qui ne demande PAS le réseau. L'orchestrateur l'appelle chaque heure (clé
-- de service), puis fait ce qui demande IPRoyal (renouveler, contrôler) avec les
-- règles de cloud-pool.js. Aucun achat sans GO de Nico (cloud_ip_commandes.go_par).
CREATE OR REPLACE FUNCTION public.cloud_pool_entretien()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $f$
DECLARE
  v_mois integer := public.cloud_param('empreintes_conservation_mois', 12);
  v_synchro integer := 0; v_expirees integer := 0; v_incidents integer := 0; v_empreintes integer;
  v_reservations integer; r record; v_s jsonb;
BEGIN
  -- a. réservations échues
  UPDATE public.cloud_ips SET reserve_pour = NULL, reserve_jusqu_au = NULL WHERE reserve_jusqu_au < now();
  GET DIAGNOSTICS v_reservations = ROW_COUNT;
  -- b. chaque compte qui tient une IP, ou qui devrait en tenir une, suit son état
  --    (grâce écoulée, option arrêtée, compte supprimé, déclencheur avalé, client sans place)
  FOR r IN SELECT user_id FROM public.cloud_ips WHERE user_id IS NOT NULL
           UNION SELECT p.id FROM public.profiles p
                  WHERE (p.is_cloud IS TRUE OR (p.cloud_essai_fin > now() AND p.cloud_essai_arrete IS NOT TRUE))
                    AND NOT EXISTS (SELECT 1 FROM public.cloud_ips i WHERE i.user_id = p.id) LOOP
    v_s := public.cloud_compte_synchroniser(r.user_id);
    IF v_s ->> 'action' <> 'rien' THEN v_synchro := v_synchro + 1; END IF;
  END LOOP;
  -- c. échéances passées. Libre : fin normale. Tenue : INCIDENT (le renouvellement a raté).
  FOR r IN SELECT id, user_id, etat, secret_nom FROM public.cloud_ips
            WHERE etat <> 'expiree' AND expire_le <= now() FOR UPDATE LOOP
    UPDATE public.cloud_ips SET etat = 'expiree', user_id = NULL, reserve_pour = NULL, reserve_jusqu_au = NULL, maj_le = now()
     WHERE id = r.id;
    DELETE FROM vault.secrets WHERE name = r.secret_nom;   -- plus d'identifiants pour une IP morte
    PERFORM public.cloud_journal(r.id, CASE WHEN r.user_id IS NULL THEN 'expiration' ELSE 'incident' END, r.user_id,
            jsonb_build_object('etat_avant', r.etat));
    v_expirees := v_expirees + 1;
    IF r.user_id IS NOT NULL THEN
      v_incidents := v_incidents + 1;
      PERFORM public.cloud_compte_synchroniser(r.user_id);   -- une autre IP, s'il en reste
    END IF;
  END LOOP;
  -- d. RGPD et ménage
  DELETE FROM public.cloud_essai_empreintes WHERE conserver_jusqu_au < now();
  GET DIAGNOSTICS v_empreintes = ROW_COUNT;
  UPDATE public.cloud_ip_evenements SET user_id = NULL WHERE user_id IS NOT NULL AND le < now() - make_interval(months => v_mois);
  UPDATE public.cloud_ips SET dernier_user_id = NULL
   WHERE dernier_user_id IS NOT NULL AND user_id IS NULL AND liberee_le < now() - make_interval(months => v_mois);
  DELETE FROM public.cloud_essai_demandes WHERE demande_le < now() - interval '7 days';
  DELETE FROM public.cloud_attente WHERE derniere_le < now() - interval '30 days';
  DELETE FROM public.cloud_connexions WHERE ouverte_le < now() - interval '90 days';
  RETURN jsonb_build_object('reservations_echues', v_reservations, 'synchronises', v_synchro, 'expirees', v_expirees,
                            'incidents', v_incidents, 'empreintes_purgees', v_empreintes);
END;
$f$;

CREATE OR REPLACE FUNCTION public.cloud_pool_etat()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $f$
  SELECT jsonb_build_object(
    'par_etat', COALESCE((SELECT jsonb_object_agg(etat, n) FROM (SELECT etat, count(*) n FROM public.cloud_ips GROUP BY etat) s), '{}'::jsonb),
    'attribuables_essai', (SELECT count(*) FROM public.cloud_ips i
                            WHERE i.etat = 'disponible' AND public.cloud_ip_attribuable(i, NULL, 'essai')),
    'reservees', (SELECT count(*) FROM public.cloud_ips WHERE reserve_pour IS NOT NULL AND reserve_jusqu_au > now()),
    'repos_prets_48h', (SELECT count(*) FROM public.cloud_ips WHERE etat = 'repos' AND repos_fin <= now() + interval '48 hours'),
    'purges_en_retard', (SELECT count(*) FROM public.cloud_ips WHERE etat = 'repos' AND purge_prouvee_le IS NULL
                           AND liberee_le < now() - interval '1 hour'),
    'en_attente', (SELECT count(*) FROM public.cloud_attente),
    'attente_max_h', (SELECT round(EXTRACT(EPOCH FROM now() - min(demande_le)) / 3600, 1) FROM public.cloud_attente),
    'comptes_sans_place', (SELECT count(*) FROM public.profiles p
                            WHERE (p.is_cloud IS TRUE OR (p.cloud_essai_fin > now() AND p.cloud_essai_debut <= now()
                                                          AND p.cloud_essai_arrete IS NOT TRUE))
                              AND NOT EXISTS (SELECT 1 FROM public.cloud_ips i WHERE i.user_id = p.id)),
    'postes', COALESCE((SELECT jsonb_object_agg(etat, n) FROM (SELECT etat, count(*) n FROM public.cloud_postes GROUP BY etat) s), '{}'::jsonb),
    'commandes_en_cours', (SELECT COALESCE(sum(quantite), 0) FROM public.cloud_ip_commandes WHERE statut IN ('demandee', 'en_cours')),
    'echeances_3j', (SELECT count(*) FROM public.cloud_ips
                      WHERE etat IN ('attribuee_essai', 'attribuee_client')
                        AND expire_le <= now() + make_interval(days => public.cloud_param('renouvellement_avant_jours', 3))),
    'rebuts_24h', (SELECT count(*) FROM public.cloud_ips WHERE rebut_le > now() - interval '24 hours'),
    'essais_7j', (SELECT count(*) FROM public.profiles WHERE cloud_essai_debut > now() - interval '7 days')
  );
$f$;


-- ═══ 9. Le mail de la veille : `cloud_essai_veille` entre dans l'index one-shot ═══
-- Le mail reste TEL QUEL derrière sa garde (décision du 05/10). UN par personne à
-- vie : sans l'index, la réservation de envoyerEmail ne protège de rien (bug du
-- welcome, 03/08). La liste est RELUE dans la définition vivante au moment
-- d'appliquer, le type y est ajouté, l'index reconstruit dans la même
-- transaction. Idempotent : déjà présent → rien.
DO $$
DECLARE v_def text; v_types text[];
BEGIN
  SELECT indexdef INTO v_def FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'email_logs_one_shot_unique';
  IF v_def IS NULL THEN RAISE EXCEPTION 'email_logs_one_shot_unique introuvable : relire la prod avant d''appliquer'; END IF;
  IF v_def ~ '\mcloud_essai_veille\M' THEN RETURN; END IF;
  SELECT array_agg(t.m[1] ORDER BY t.ord) INTO v_types
    FROM regexp_matches(v_def, '''([^'']+)''::text', 'g') WITH ORDINALITY AS t(m, ord);
  IF COALESCE(cardinality(v_types), 0) < 14 OR NOT ('welcome' = ANY (v_types)) THEN
    RAISE EXCEPTION 'liste des types illisible (% types) : on ne touche à rien', COALESCE(cardinality(v_types), 0);
  END IF;
  v_types := v_types || 'cloud_essai_veille'::text;
  DROP INDEX public.email_logs_one_shot_unique;
  EXECUTE format('CREATE UNIQUE INDEX email_logs_one_shot_unique ON public.email_logs USING btree (user_id, email_type) '
                 'WHERE (email_type IN (%s))', (SELECT string_agg(quote_literal(x), ', ') FROM unnest(v_types) x));
END $$;


-- ═══ 10. Les droits — clé de service partout, sauf les trois « _moi » ════════
REVOKE ALL ON FUNCTION
  public.cloud_param(text, integer), public.cloud_ts(text), public.cloud_texte_non_vide(jsonb), public.cloud_zero(jsonb),
  public.cloud_hacher(text, text), public.cloud_proxy_identifiants(bigint), public.cloud_journal(bigint, text, uuid, jsonb),
  public.cloud_purge_manques(jsonb, timestamptz), public.cloud_controle_manques(jsonb, inet, timestamptz),
  public.cloud_ip_ajouter(text, inet, integer, text, text, text, timestamptz), public.cloud_ip_controle_entree(bigint, jsonb),
  public.cloud_ip_attribuable(public.cloud_ips, uuid, text), public.cloud_ip_reserver(uuid), public.cloud_ip_attribuer(uuid, text),
  public.cloud_ip_liberer(uuid, text), public.cloud_ip_signaler(bigint, text, jsonb), public.cloud_ip_noter_purge(bigint, jsonb),
  public.cloud_ip_remettre_en_pool(bigint, jsonb), public.cloud_ip_renouvelee(bigint, timestamptz),
  public.cloud_ip_identifiants_changes(bigint, text), public.cloud_empreintes_engager(uuid),
  public.cloud_compte_synchroniser(uuid), public.profiles_cloud_pool(), public.cloud_essai_permis(uuid),
  public.cloud_essai_noter_carte(uuid, text), public.cloud_essai_noter_compte_plateforme(uuid, text, text),
  public.cloud_comptes_a_servir(), public.cloud_poste_noter(uuid, text, jsonb),
  public.cloud_coffre_ecrire(uuid, text, text, text, integer, boolean), public.cloud_coffre_lire(uuid), public.cloud_coffre_vider(uuid),
  public.cloud_session_revoquer(uuid, uuid), public.cloud_pool_entretien(), public.cloud_pool_etat()
FROM PUBLIC, anon, authenticated;
-- Le sel ne sort jamais, même pour la clé de service.
REVOKE ALL ON FUNCTION public.cloud_sel() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION
  public.cloud_proxy_identifiants(bigint),
  public.cloud_ip_ajouter(text, inet, integer, text, text, text, timestamptz), public.cloud_ip_controle_entree(bigint, jsonb),
  public.cloud_ip_reserver(uuid), public.cloud_ip_attribuer(uuid, text), public.cloud_ip_liberer(uuid, text),
  public.cloud_ip_signaler(bigint, text, jsonb), public.cloud_ip_noter_purge(bigint, jsonb),
  public.cloud_ip_remettre_en_pool(bigint, jsonb), public.cloud_ip_renouvelee(bigint, timestamptz),
  public.cloud_ip_identifiants_changes(bigint, text), public.cloud_compte_synchroniser(uuid),
  public.cloud_essai_permis(uuid), public.cloud_essai_noter_carte(uuid, text),
  public.cloud_essai_noter_compte_plateforme(uuid, text, text),
  public.cloud_comptes_a_servir(), public.cloud_poste_noter(uuid, text, jsonb),
  public.cloud_coffre_ecrire(uuid, text, text, text, integer, boolean), public.cloud_coffre_lire(uuid), public.cloud_coffre_vider(uuid),
  public.cloud_session_revoquer(uuid, uuid), public.cloud_pool_entretien(), public.cloud_pool_etat()
TO service_role;
REVOKE ALL ON FUNCTION public.cloud_essai_preparer_moi(text), public.cloud_essai_moi(), public.cloud_coffre_etat_moi() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cloud_essai_preparer_moi(text), public.cloud_essai_moi(), public.cloud_coffre_etat_moi() TO authenticated;


-- ═══ 11. Les tâches planifiées — AUCUN cron ici ════════════════════════════════
-- L'entretien horaire (cloud_pool_entretien, renouvellements, contrôles, alertes)
-- tourne dans l'ORCHESTRATEUR (serveur Hetzner), pas dans pg_cron : il a déjà la
-- clé de service, le jeton IPRoyal et le réseau. Coût en base : une fonction par
-- heure qui lit au plus quelques dizaines de lignes (cloud_ips, profiles par son
-- index partiel is_cloud). Le mail de la veille part dans l'appel HORAIRE
-- existant d'email-tunnel (job_relaunch), derrière sa garde.
--
-- ── RELECTURE après application (à coller) ─────────────────────────────────
-- SELECT count(*) FROM pg_proc WHERE proname LIKE 'cloud\_%';                 -- 40
-- SELECT tablename FROM pg_tables WHERE tablename LIKE 'cloud\_%' ORDER BY 1;  -- 10 tables
-- SELECT public.cloud_pool_etat();
-- SELECT indexdef ~ 'cloud_essai_veille' FROM pg_indexes WHERE indexname = 'email_logs_one_shot_unique';
