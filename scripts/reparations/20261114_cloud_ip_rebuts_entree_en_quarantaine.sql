-- (14/11, règle de Nico : « On ne jette JAMAIS une IP payée ») LES IP MISES AU REBUT PAR LE CONTRÔLE D'ENTRÉE, ENCORE
-- PAYÉES ET JAMAIS SERVIES, PASSENT EN QUARANTAINE — la règle, pour toutes : etat 'rebut', rebut_critere
-- 'controle_entree', échéance à plus d'une heure, jamais attribuées (attributions 0, aucun titulaire ni dernier titulaire),
-- aucun refus de plateforme. Le 13/11 au soir, une seule : l'IP 77 (188.126.2.31, commande 88422209, payée jusqu'au 13/12
-- 13:17:51 heure de Paris), au rebut depuis 13:22:57 sur un contrôle sans réponse ; relue à 22:09 par son proxy : sortie
-- 188.126.2.31, FR, 3 lectures sur 3, listes noires : aucune.
-- Le recontrôle est DÛ tout de suite (prochain_le = maintenant) : l'orchestrateur la recontrôle au tour suivant (5 min au
-- plus avec le réapprovisionnement rapide, sinon l'heure) et elle rejoint le pool si le contrôle passe — par le circuit
-- normal (cloud_ip_quarantaine_noter), jamais à la main.
-- PRÉREQUIS : migration 20261114090000_cloud_ip_quarantaine APPLIQUÉE, orchestrateur qui la connaît DÉPLOYÉ.
-- Sauvegarde : _backup_1411_cloud_ip_rebuts_entree ; inverse : 20261114_cloud_ip_rebuts_entree_en_quarantaine_INVERSE.sql.
-- Lancer : npx supabase db query --linked --yes -f scripts/reparations/20261114_cloud_ip_rebuts_entree_en_quarantaine.sql
BEGIN;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'cloud_ips' AND column_name = 'quarantaine')
     OR to_regprocedure('public.cloud_ip_quarantaine_noter(bigint, jsonb, jsonb)') IS NULL THEN
    RAISE EXCEPTION 'migration 20261114090000_cloud_ip_quarantaine absente : rien n''est fait';
  END IF;
END $$;

CREATE TABLE public._backup_1411_cloud_ip_rebuts_entree AS
  SELECT now() AS le, to_jsonb(i.*) AS ligne FROM public.cloud_ips i
   WHERE i.etat = 'rebut' AND i.rebut_critere = 'controle_entree' AND i.expire_le > now() + interval '1 hour'
     AND i.user_id IS NULL AND i.dernier_user_id IS NULL AND i.attributions = 0 AND i.refus = '{}'::jsonb;
ALTER TABLE public._backup_1411_cloud_ip_rebuts_entree ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_1411_cloud_ip_rebuts_entree FROM PUBLIC, anon, authenticated;

-- La preuve du rebut : le dernier contrôle d'entrée raté de chaque IP, lu dans son journal (manques, sortie, pays).
WITH cibles AS (
  SELECT (b.ligne ->> 'id')::bigint AS id, b.ligne,
         jsonb_build_object('le', b.ligne -> 'rebut_le', 'manques', COALESCE(e.details -> 'manques', '[]'::jsonb),
           'ip_sortie', COALESCE(e.details -> 'controle' -> 'ip_sortie', 'null'::jsonb), 'pays', COALESCE(e.details -> 'controle' -> 'pays', 'null'::jsonb),
           'listes_noires', COALESCE(e.details -> 'controle' -> 'listes_noires', 'null'::jsonb)) AS preuve
    FROM public._backup_1411_cloud_ip_rebuts_entree b
    LEFT JOIN LATERAL (SELECT x.details FROM public.cloud_ip_evenements x
                        WHERE x.ip_id = (b.ligne ->> 'id')::bigint AND x.nature = 'controle_entree'
                        ORDER BY x.le DESC, x.id DESC LIMIT 1) e ON true
), maj AS (
  UPDATE public.cloud_ips i
     SET etat = 'quarantaine', rebut_critere = NULL, rebut_le = NULL, maj_le = now(),
         quarantaine = jsonb_build_object('version', 1, 'origine', 'controle_entree',
           'depuis', c.ligne -> 'rebut_le', 'essais', 1, 'premier_echec_le', c.ligne -> 'rebut_le',
           'dernier', c.preuve, 'preuves', jsonb_build_array(c.preuve),
           'prochain_le', to_jsonb(now()), 'signalee_le', NULL,
           'reprise', jsonb_build_object('le', to_jsonb(now()), 'raison', 'règle du 14/11 : jamais le rebut automatique d''une IP payée',
             'rebut_le', c.ligne -> 'rebut_le', 'rebut_critere', c.ligne -> 'rebut_critere'))
    FROM cibles c
   WHERE i.id = c.id AND i.etat = 'rebut'
  RETURNING i.id, i.rebut_le
)
SELECT public.cloud_journal(m.id, 'quarantaine', NULL, jsonb_build_object('origine', 'controle_entree', 'etat_avant', 'rebut',
  'reprise', 'règle du 14/11 : un rebut au contrôle d''entrée devient une quarantaine, recontrôlée tout de suite'))
  FROM maj m;

SELECT id, host(ip) AS ip, etat, quarantaine ->> 'prochain_le' AS prochain_le,
       to_char(expire_le AT TIME ZONE 'Europe/Paris', 'DD/MM/YYYY HH24:MI') AS payee_jusqu_au_paris
  FROM public.cloud_ips WHERE id IN (SELECT (ligne ->> 'id')::bigint FROM public._backup_1411_cloud_ip_rebuts_entree);
COMMIT;
