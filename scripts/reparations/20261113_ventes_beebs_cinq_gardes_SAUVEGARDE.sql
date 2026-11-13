-- SAUVEGARDE avant la migration 20261113140000_ventes_beebs_cinq_gardes (13/11/2026, point 3b de Nico : ventes Beebs —
-- garde d'âge de la commande, annulation défaite, prix lu, comptes reliés).
-- La migration n'écrit AUCUNE ligne : elle réécrit une fonction (commandes_beebs_noter) et en crée deux
-- (beebs_commande_prix, vente_commande_annulee_beebs). Ce qui est sauvegardé : la définition de prod de
-- commandes_beebs_noter (en base seulement), son empreinte, ses droits et sa configuration, juste avant ; l'empreinte des
-- témoins jamais touchés qu'elle appelle ou qui la suivent (beebs_commande_classe, signal_vente_lever,
-- ventes_prouvees_a_enregistrer, ventes_prouvees_tick, enregistrer_vente_prouvee, push_trg_job, annonce_importee,
-- vente_transaction_annulee_leboncoin) ; l'absence des deux fonctions neuves ; la valeur de l'interrupteur (0, jamais touché).
-- ⛔ Garde : si commandes_beebs_noter a changé en prod depuis la lecture du 13/11/2026 vers 01:20 (md5 ci-dessous), RIEN
--    n'est écrit et la migration ne doit PAS être appliquée (elle est faite depuis cette définition-là).
-- À jouer : npx supabase db query --linked -f scripts/reparations/20261113_ventes_beebs_cinq_gardes_SAUVEGARDE.sql
-- Retour : supabase/rollbacks/20261113140000_ventes_beebs_cinq_gardes_INVERSE.sql (la définition de prod, mot pour mot) ;
-- la définition exacte reste aussi dans public._backup_1311_ventes_beebs_cinq_gardes.
DO $garde$
DECLARE v text;
BEGIN
  SELECT md5(replace(pg_get_functiondef('public.commandes_beebs_noter(jsonb,uuid,jsonb)'::regprocedure), chr(13), '')) INTO v;
  IF v IS DISTINCT FROM 'aa1ff957b15a5eff43f49a54d39e66b3' THEN
    RAISE EXCEPTION 'commandes_beebs_noter a changé en prod depuis le 13/11 01:20 (%) : rien n''est écrit, NE PAS appliquer la migration', v;
  END IF;
  IF to_regprocedure('public.vente_commande_annulee_beebs(bigint,text,text)') IS NOT NULL
     OR to_regprocedure('public.beebs_commande_prix(text[],numeric,jsonb,text)') IS NOT NULL THEN
    RAISE EXCEPTION 'une fonction neuve de 20261113140000 existe déjà en prod : rien n''est écrit, relire avant d''appliquer';
  END IF;
END $garde$;

CREATE TABLE public._backup_1311_ventes_beebs_cinq_gardes AS
SELECT now() AS le, p.proname AS nom, pg_get_function_identity_arguments(p.oid) AS args,
       pg_get_functiondef(p.oid) AS def, md5(replace(pg_get_functiondef(p.oid), chr(13), '')) AS md5, p.proacl::text AS droits,
       p.prosecdef AS security_definer, p.proconfig::text AS config,
       p.proname = 'commandes_beebs_noter' AS reecrite,
       (SELECT c.value FROM public.coin_config c WHERE c.key = 'ventes_beebs_commandes') AS interrupteur
  FROM pg_proc p
 WHERE p.pronamespace = 'public'::regnamespace
   AND p.proname IN ('commandes_beebs_noter', 'beebs_commande_classe', 'signal_vente_lever', 'ventes_prouvees_a_enregistrer',
                     'ventes_prouvees_tick', 'enregistrer_vente_prouvee', 'push_trg_job', 'annonce_importee',
                     'vente_transaction_annulee_leboncoin');
ALTER TABLE public._backup_1311_ventes_beebs_cinq_gardes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_1311_ventes_beebs_cinq_gardes FROM PUBLIC, anon, authenticated;

SELECT count(*) AS n, max(interrupteur) AS interrupteur,
       string_agg(nom || '=' || md5 || CASE WHEN reecrite THEN ' (réécrite)' ELSE ' (témoin)' END, ' ' ORDER BY nom) AS detail
  FROM public._backup_1311_ventes_beebs_cinq_gardes;
-- Attendu (13/11 01:20) : 9 lignes, interrupteur 0 — commandes_beebs_noter=aa1ff957b15a5eff43f49a54d39e66b3 (réécrite),
-- annonce_importee, beebs_commande_classe=9aecc25d…, enregistrer_vente_prouvee=731a9e22…, push_trg_job=f2928ca2…,
-- signal_vente_lever=f8f71178…, vente_transaction_annulee_leboncoin=1fc2fd38…, ventes_prouvees_a_enregistrer=fc81aa19…,
-- ventes_prouvees_tick=43fb8b1a… (témoins).
