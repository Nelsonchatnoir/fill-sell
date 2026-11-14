-- ═══════════════════════════════════════════════════════════════════════════
-- FillSell Cloud — LA QUARANTAINE DES IP : on ne jette JAMAIS une IP payée (14/11/2026, règle de Nico)
-- PRÉPARÉE, NON APPLIQUÉE : feu vert NOMMÉ de Nico requis. Essai jetable : PREUVE_PG=embarque node scripts/essais/20261114090000_banc.mjs
--
-- Règle de Nico : « On ne jette JAMAIS une IP payée. Un contrôle sans réponse se retente (attente puis nouveaux essais) ;
-- une IP douteuse va en quarantaine et se recontrôle, jamais au rebut automatique ; si une IP reste vraiment
-- inutilisable, on le signale à Nico avec la preuve. »
-- Constat (13/11) : l'IP 77 (188.126.2.31, commande 88422209, payée jusqu'au 13/12) livrée 13:18:11, mise au REBUT à
-- 13:22:57 par cloud_ip_controle_entree → cloud_ip_signaler('controle_entree') sur UN contrôle sans réponse (ip_sortie et
-- pays vides) ; une autre IP achetée à 13:23:00 pour la remplacer. Relue le 13/11 à 22:09 par son proxy : sortie
-- 188.126.2.31, FR (3 lectures sur 3). Même cas le 04/11 (IP 42, 18 s après la livraison, rejouée à la main).
--
-- 1. cloud_ips : l'état « quarantaine » (CHECK des états) et la colonne quarantaine (jsonb, NULL hors quarantaine) :
--    { version, origine, depuis, essais, premier_echec_le, dernier, preuves[], prochain_le, signalee_le } — calculée par
--    l'orchestrateur (cloud-pool.js, quarantaineSuivante), lisible (objet, prochain_le), 16 Ko au plus.
--    Une IP en quarantaine : jamais attribuable (cloud_ip_attribuable ne connaît que « disponible » et « repos »), jamais
--    comptée par la garde du nombre (qui ne compte que achetee / disponible / attribuées), son proxy reste lisible
--    (cloud_proxy_identifiants exclut seulement rebut / expiree) et sa sortie reste au pare-feu (pareFeu.js) : elle se
--    recontrôle ; elle expire à son terme (cloud_pool_entretien) si elle ne revient pas.
-- 2. cloud_ip_evenements : deux natures de plus, « quarantaine » (contrôle raté, entrée ou recontrôle) et
--    « sortie_quarantaine » (contrôle passé : retour au pool).
-- 3. cloud_ip_controle_entree : un contrôle qui manque → QUARANTAINE (premier recontrôle 15 min plus tard), JAMAIS
--    cloud_ip_signaler ni le rebut. Signature, retour (ok / raison / manques) et droits INCHANGÉS ; raison « quarantaine »
--    au lieu de « rebut ».
-- 4. cloud_ip_quarantaine_noter(p_ip, p_controle, p_quarantaine) — service_role seul : IP « achetee » ou « quarantaine »,
--    sans titulaire, non expirée. La base juge le contrôle ELLE-MÊME (cloud_controle_manques) : bon → « disponible »
--    (quarantaine effacée, journal sortie_quarantaine) ; mauvais → « quarantaine » (p_quarantaine si lisible, sinon
--    cloud_ip_quarantaine_defaut ; signalee_le jamais effacé ; prochain_le borné entre +5 min et +48 h : ni boucle, ni oubli).
--    JAMAIS le rebut. cloud_ip_signaler (le rebut) reste le geste MANUEL de Nico, inchangé.
-- 5. cloud_ip_quarantaine_defaut(p_avant, p_controle, p_manques) — la quarantaine suivante calculée en base (même
--    espacement que l'orchestrateur : 15 min, 1 h, 4 h, puis 12 h ; 24 h une fois signalée).
-- Sauvegarde : _backup_1411_cloud_ip_quarantaine (corps de cloud_ip_controle_entree et contraintes, lus à l'application) ;
-- corps de la prod relus le 13/11 : scripts/essais/fixtures/prod-1311-ip-quarantaine/ (md5 dans CONTRAINTES.txt).
-- Réécrite DEPUIS pg_get_functiondef de la prod : cloud_ip_controle_entree (md5 ce8f38b4…). Aucune donnée modifiée (la
-- remise en quarantaine des IP déjà au rebut est un script à part : scripts/reparations/20261114_cloud_ip_rebuts_entree_en_quarantaine.sql).
-- Coût : une colonne nullable (aucune réécriture, 14 lignes), deux CHECK revalidés sur ~350 lignes.
-- Inverse : supabase/rollbacks/20261114090000_cloud_ip_quarantaine_INVERSE.sql. Idempotente. db push INTERDIT.
-- Ordre : cette migration AVANT l'orchestrateur qui l'utilise (sans elle, l'orchestrateur n'écrit rien d'un contrôle
-- douteux : l'IP reste « achetee » et se recontrôle — jamais le rebut).
-- ═══════════════════════════════════════════════════════════════════════════
SET lock_timeout = '5s';

-- ═══ 0. Sauvegarde (une fois : la première application) ═══════════════════
CREATE TABLE IF NOT EXISTS public._backup_1411_cloud_ip_quarantaine AS
  SELECT now() AS le, 'fonction'::text AS nature, p.proname::text AS nom, pg_get_functiondef(p.oid) AS definition
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'cloud_ip_controle_entree'
  UNION ALL
  SELECT now(), 'contrainte', c.conname::text, pg_get_constraintdef(c.oid)
    FROM pg_constraint c
   WHERE c.conrelid IN ('public.cloud_ips'::regclass, 'public.cloud_ip_evenements'::regclass)
     AND c.conname IN ('cloud_ips_etat_check', 'cloud_ip_evenements_nature_check');
ALTER TABLE public._backup_1411_cloud_ip_quarantaine ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_1411_cloud_ip_quarantaine FROM PUBLIC, anon, authenticated;

-- ═══ 1. L'état « quarantaine » et sa colonne ═══════════════════════════════
ALTER TABLE public.cloud_ips ADD COLUMN IF NOT EXISTS quarantaine jsonb;
ALTER TABLE public.cloud_ips DROP CONSTRAINT IF EXISTS cloud_ips_etat_check;
ALTER TABLE public.cloud_ips ADD CONSTRAINT cloud_ips_etat_check
  CHECK (etat IN ('achetee', 'disponible', 'attribuee_essai', 'attribuee_client', 'repos', 'quarantaine', 'rebut', 'expiree'));
ALTER TABLE public.cloud_ips DROP CONSTRAINT IF EXISTS cloud_ips_quarantaine_lisible;
ALTER TABLE public.cloud_ips ADD CONSTRAINT cloud_ips_quarantaine_lisible
  CHECK (quarantaine IS NULL OR (jsonb_typeof(quarantaine) = 'object' AND COALESCE(jsonb_typeof(quarantaine -> 'prochain_le'), '') = 'string'
         AND octet_length(quarantaine::text) <= 16384));
ALTER TABLE public.cloud_ips DROP CONSTRAINT IF EXISTS cloud_ips_quarantaine;
ALTER TABLE public.cloud_ips ADD CONSTRAINT cloud_ips_quarantaine CHECK (etat <> 'quarantaine' OR quarantaine IS NOT NULL);

-- ═══ 2. Le journal : deux natures de plus ══════════════════════════════════
ALTER TABLE public.cloud_ip_evenements DROP CONSTRAINT IF EXISTS cloud_ip_evenements_nature_check;
ALTER TABLE public.cloud_ip_evenements ADD CONSTRAINT cloud_ip_evenements_nature_check
  CHECK (nature IN ('achat', 'controle_entree', 'reservation', 'attribution', 'retour_meme_compte', 'conversion', 'liberation',
    'purge', 'sortie_repos', 'signalement', 'rebut', 'renouvellement', 'identifiants_changes', 'expiration', 'incident', 'refus',
    'refus_leve', 'refus_prouve', 'visite_controle', 'depense', 'quarantaine', 'sortie_quarantaine'));

-- ═══ 5. La quarantaine suivante, calculée en base (miroir de cloud-pool.js, quarantaineSuivante) ═══
CREATE OR REPLACE FUNCTION public.cloud_ip_quarantaine_defaut(p_avant jsonb, p_controle jsonb, p_manques text[])
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $f$
DECLARE
  a jsonb := CASE WHEN jsonb_typeof(p_avant) = 'object' THEN p_avant ELSE NULL END;
  c jsonb := CASE WHEN jsonb_typeof(p_controle) = 'object' THEN p_controle ELSE '{}'::jsonb END;
  v_essais integer := COALESCE(CASE WHEN (a ->> 'essais') ~ '^[0-9]{1,4}$' THEN (a ->> 'essais')::integer END, 0) + 1;
  v_signalee jsonb := CASE WHEN jsonb_typeof(a -> 'signalee_le') = 'string' THEN a -> 'signalee_le' ELSE 'null'::jsonb END;
  v_le jsonb := to_jsonb(COALESCE(public.cloud_ts(c ->> 'fait_le'), now()));
  v_preuve jsonb;
  v_preuves jsonb;
BEGIN
  v_preuve := jsonb_build_object('le', v_le, 'manques', to_jsonb(COALESCE(p_manques, '{}'::text[])),
    'ip_sortie', COALESCE(c -> 'ip_sortie', 'null'::jsonb), 'pays', COALESCE(c -> 'pays', 'null'::jsonb),
    'listes_noires', CASE WHEN jsonb_typeof(c -> 'listes_noires') = 'array' THEN c -> 'listes_noires' ELSE 'null'::jsonb END);
  SELECT COALESCE(jsonb_agg(x.e ORDER BY x.o), '[]'::jsonb) INTO v_preuves
    FROM (SELECT t.e, t.o FROM jsonb_array_elements(
            COALESCE(CASE WHEN jsonb_typeof(a -> 'preuves') = 'array' THEN a -> 'preuves' END, '[]'::jsonb) || jsonb_build_array(v_preuve))
            WITH ORDINALITY AS t(e, o)
           ORDER BY t.o DESC LIMIT 8) x;
  RETURN jsonb_build_object('version', 1,
    'origine', COALESCE(a ->> 'origine', 'controle_entree'),
    'depuis', COALESCE(a -> 'depuis', v_le),
    'essais', v_essais,
    'premier_echec_le', COALESCE(a -> 'premier_echec_le', v_le),
    'dernier', v_preuve,
    'preuves', v_preuves,
    'prochain_le', to_jsonb(now() + CASE WHEN v_signalee <> 'null'::jsonb THEN interval '24 hours'
                                         WHEN v_essais = 1 THEN interval '15 minutes'
                                         WHEN v_essais = 2 THEN interval '1 hour'
                                         WHEN v_essais = 3 THEN interval '4 hours'
                                         ELSE interval '12 hours' END),
    'signalee_le', v_signalee);
END;
$f$;

-- ═══ 3. Le contrôle d'entrée : la quarantaine, JAMAIS le rebut ══════════════
CREATE OR REPLACE FUNCTION public.cloud_ip_controle_entree(p_ip bigint, p_controle jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $f$
DECLARE
  v public.cloud_ips%ROWTYPE;
  v_manques text[];
  v_q jsonb;
BEGIN
  SELECT * INTO v FROM public.cloud_ips WHERE id = p_ip FOR UPDATE;
  IF NOT FOUND OR v.etat <> 'achetee' THEN RETURN jsonb_build_object('ok', false, 'raison', 'pas_achetee'); END IF;
  v_manques := public.cloud_controle_manques(p_controle, v.ip);
  PERFORM public.cloud_journal(p_ip, 'controle_entree', NULL, jsonb_build_object('controle', p_controle, 'manques', to_jsonb(v_manques)));
  IF cardinality(v_manques) > 0 THEN
    -- (14/11, règle de Nico) Jamais le rebut : la quarantaine, recontrôlée 15 min plus tard.
    v_q := public.cloud_ip_quarantaine_defaut(NULL, p_controle, v_manques);
    UPDATE public.cloud_ips SET etat = 'quarantaine', quarantaine = v_q, maj_le = now() WHERE id = p_ip;
    PERFORM public.cloud_journal(p_ip, 'quarantaine', NULL, jsonb_build_object('origine', 'controle_entree', 'etat_avant', v.etat,
      'manques', to_jsonb(v_manques), 'essais', v_q -> 'essais', 'prochain_le', v_q -> 'prochain_le'));
    RETURN jsonb_build_object('ok', false, 'raison', 'quarantaine', 'quarantaine', true, 'manques', to_jsonb(v_manques));
  END IF;
  UPDATE public.cloud_ips SET etat = 'disponible', maj_le = now() WHERE id = p_ip;
  RETURN jsonb_build_object('ok', true);
END;
$f$;

-- ═══ 4. Le recontrôle : retour au pool ou quarantaine — JAMAIS le rebut ═════
CREATE OR REPLACE FUNCTION public.cloud_ip_quarantaine_noter(p_ip bigint, p_controle jsonb, p_quarantaine jsonb DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $f$
DECLARE
  v public.cloud_ips%ROWTYPE;
  v_manques text[];
  v_q jsonb;
  v_prochain timestamptz;
BEGIN
  SELECT * INTO v FROM public.cloud_ips WHERE id = p_ip FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'raison', 'ip_inconnue'); END IF;
  IF v.etat NOT IN ('achetee', 'quarantaine') OR v.user_id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'raison', 'etat', 'etat', v.etat);
  END IF;
  IF v.expire_le <= now() THEN RETURN jsonb_build_object('ok', false, 'raison', 'expiree'); END IF;
  v_manques := public.cloud_controle_manques(p_controle, v.ip);
  IF v.etat = 'achetee' THEN
    PERFORM public.cloud_journal(p_ip, 'controle_entree', NULL, jsonb_build_object('controle', p_controle, 'manques', to_jsonb(v_manques)));
  END IF;
  IF cardinality(v_manques) = 0 THEN
    UPDATE public.cloud_ips SET etat = 'disponible', quarantaine = NULL, maj_le = now() WHERE id = p_ip;
    IF v.etat = 'quarantaine' THEN
      PERFORM public.cloud_journal(p_ip, 'sortie_quarantaine', NULL, jsonb_build_object('controle', p_controle,
        'essais', v.quarantaine -> 'essais', 'depuis', v.quarantaine -> 'depuis', 'signalee_le', v.quarantaine -> 'signalee_le'));
    END IF;
    RETURN jsonb_build_object('ok', true, 'sortie', v.etat = 'quarantaine', 'etat_avant', v.etat);
  END IF;
  -- La quarantaine de l'orchestrateur si elle est lisible ; sinon celle de la base.
  IF jsonb_typeof(p_quarantaine) = 'object' AND public.cloud_ts(p_quarantaine ->> 'prochain_le') IS NOT NULL
     AND (p_quarantaine ->> 'essais') ~ '^[0-9]{1,4}$' AND (p_quarantaine ->> 'essais')::integer >= 1
     AND octet_length(p_quarantaine::text) <= 16000 THEN
    v_q := p_quarantaine;
  ELSE
    v_q := public.cloud_ip_quarantaine_defaut(v.quarantaine, p_controle, v_manques);
  END IF;
  -- Un signalement à Nico ne s'efface jamais tant que l'IP est en quarantaine.
  IF jsonb_typeof(v.quarantaine -> 'signalee_le') = 'string' AND jsonb_typeof(v_q -> 'signalee_le') IS DISTINCT FROM 'string' THEN
    v_q := v_q || jsonb_build_object('signalee_le', v.quarantaine -> 'signalee_le');
  END IF;
  -- Le prochain recontrôle : jamais avant 5 min (aucune boucle), jamais après 48 h (aucun oubli).
  v_prochain := LEAST(GREATEST(public.cloud_ts(v_q ->> 'prochain_le'), now() + interval '5 minutes'), now() + interval '48 hours');
  v_q := v_q || jsonb_build_object('prochain_le', to_jsonb(v_prochain));
  UPDATE public.cloud_ips SET etat = 'quarantaine', quarantaine = v_q, maj_le = now() WHERE id = p_ip;
  PERFORM public.cloud_journal(p_ip, 'quarantaine', NULL, jsonb_build_object('controle', p_controle, 'etat_avant', v.etat,
    'manques', to_jsonb(v_manques), 'essais', v_q -> 'essais', 'prochain_le', v_q -> 'prochain_le', 'signalee_le', v_q -> 'signalee_le'));
  RETURN jsonb_build_object('ok', false, 'quarantaine', true, 'manques', to_jsonb(v_manques), 'essais', v_q -> 'essais',
    'prochain_le', v_q -> 'prochain_le', 'signalee_le', v_q -> 'signalee_le');
END;
$f$;

REVOKE ALL ON FUNCTION public.cloud_ip_quarantaine_defaut(jsonb, jsonb, text[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cloud_ip_quarantaine_noter(bigint, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cloud_ip_quarantaine_defaut(jsonb, jsonb, text[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.cloud_ip_quarantaine_noter(bigint, jsonb, jsonb) TO service_role;
