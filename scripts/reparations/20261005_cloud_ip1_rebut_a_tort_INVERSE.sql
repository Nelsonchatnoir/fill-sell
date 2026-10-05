-- Inverse de 20261005_cloud_ip1_rebut_a_tort.sql : l'IP id 1 retourne au rebut,
-- exactement comme le contrôle d'entrée l'avait laissée (16:07:58 Paris).
-- Seulement si elle n'a encore servi personne (sinon : cloud_ip_signaler, qui
-- donne une autre IP au titulaire).
BEGIN;
UPDATE public.cloud_ips
   SET etat = 'rebut', rebut_critere = 'controle_entree',
       rebut_le = '2026-10-05T14:07:58.909305+00', liberee_le = '2026-10-05T14:07:58.909305+00', maj_le = now()
 WHERE id = 1 AND user_id IS NULL AND reserve_pour IS NULL;
SELECT public.cloud_journal(1, 'rebut', NULL, jsonb_build_object('critere', 'controle_entree', 'reparation', 'inverse de 20261005_cloud_ip1_rebut_a_tort.sql'));
COMMIT;
