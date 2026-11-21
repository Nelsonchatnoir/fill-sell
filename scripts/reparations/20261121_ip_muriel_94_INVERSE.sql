-- INVERSE de 20261121_ip_muriel_94.sql : les IP 76 et 94 reprennent leur ligne d'avant (sauvegarde _backup_2111_ip_muriel_94) —
-- 76 de nouveau attribuée à 0c97dc8b, 94 disponible. Gardes : 94 encore à 0c97dc8b, 76 encore libre. Le journal des IP garde la
-- trace des deux gestes (jamais effacé).
BEGIN;
SET LOCAL lock_timeout = '5s';
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.cloud_ips WHERE id = 94 AND user_id = '0c97dc8b-b839-4c1f-8b14-1d30d7cfdc9b') THEN RAISE EXCEPTION 'IP 94 : plus au compte (relire)'; END IF;
  IF EXISTS (SELECT 1 FROM public.cloud_ips WHERE id = 76 AND user_id IS NOT NULL) THEN RAISE EXCEPTION 'IP 76 : reprise par un compte (relire)'; END IF;
END $$;
UPDATE public.cloud_ips c
   SET etat = b.ligne ->> 'etat', user_id = (b.ligne ->> 'user_id')::uuid, dernier_user_id = (b.ligne ->> 'dernier_user_id')::uuid,
       derniere_origine = b.ligne ->> 'derniere_origine', attributions = (b.ligne ->> 'attributions')::int,
       attribuee_le = (b.ligne ->> 'attribuee_le')::timestamptz, liberee_le = (b.ligne ->> 'liberee_le')::timestamptz,
       repos_fin = (b.ligne ->> 'repos_fin')::timestamptz, reserve_pour = (b.ligne ->> 'reserve_pour')::uuid,
       reserve_jusqu_au = (b.ligne ->> 'reserve_jusqu_au')::timestamptz, sante = b.ligne -> 'sante', refus = b.ligne -> 'refus', maj_le = now()
  FROM public._backup_2111_ip_muriel_94 b WHERE c.id = b.id;
SELECT id, etat, left(user_id::text, 8) AS compte FROM public.cloud_ips WHERE id IN (76, 94) ORDER BY id;
COMMIT;
