-- (21/11/2026 midi, point 1 de Nico — DÉCISION DE NICO, IP déjà payée) LE COMPTE 0c97dc8b (Muriel) PASSE SUR L'IP ORANGE 94.
-- Lu en prod le 21/11 ~13:00 : IP 76 (72.9.173.132, AS2914 NTT / org TELUS, classée hébergeur ; contrôle du 20/11 14:27 :
-- sortie FR) attribuee_essai à 0c97dc8b depuis le 20/11 16:11 — Beebs : 26 glissières pour 22 publications en 72 h (contre 7
-- pour 74 sur une IP Orange). IP 94 (81.22.142.8, AS5511 Orange S.A., FR, hébergeur non, proxy non) disponible, saine
-- (contrôle du 20/11 19:57), jamais attribuée.
-- CHEMIN : ⛔ JAMAIS cloud_ip_liberer (chemin d'un compte qui PART : incident du 04/11 12:25). Les deux lignes sont posées comme
-- cloud_ip_attribuer les pose, avec ses deux gardes (attribuable + contrôlée juste avant). L'orchestrateur voit l'IP changer et
-- rouvre le navigateur de Muriel sur la 94 hors de toute tâche (planificateur, « ip_remplacee ») : ses cookies restent dans le
-- profil (Vinted gardé), une glissière peut être demandée au premier passage — c'est normal.
-- L'IP 76 ne va PAS au stock général tel quel (règle du 03/11 : « le refus porte sur la plateforme qui refuse ») : son refus
-- Beebs est noté (non prouvé, cloud_ip_refus_noter) et Beebs y est fermé (sante.plateformes_fermees ; depuis ce lot, un refus
-- noté par un compte reste fermé d'un contrôle à l'autre, cloud-pool.js santeSuivante) : elle sert d'abord aux comptes sans
-- Beebs. Jamais au repos (la purge du repos vise le dernier compte).
-- Sauvegarde : _backup_2111_ip_muriel_94 ; inverse : 20261121_ip_muriel_94_INVERSE.sql.
-- Lancer : npx supabase db query --linked --yes -f scripts/reparations/20261121_ip_muriel_94.sql
BEGIN;
SET LOCAL lock_timeout = '5s';
CREATE TABLE public._backup_2111_ip_muriel_94 AS
  SELECT now() AS le, i.id, to_jsonb(i) AS ligne FROM public.cloud_ips i WHERE i.id IN (76, 94);
ALTER TABLE public._backup_2111_ip_muriel_94 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_2111_ip_muriel_94 FROM PUBLIC, anon, authenticated;
DO $$
DECLARE u constant uuid := '0c97dc8b-b839-4c1f-8b14-1d30d7cfdc9b';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.cloud_ips WHERE id = 76 AND user_id = u AND etat = 'attribuee_essai') THEN
    RAISE EXCEPTION 'IP 76 : plus attribuée à 0c97dc8b en essai (relire)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.cloud_ips i WHERE i.id = 94 AND i.etat = 'disponible' AND i.user_id IS NULL
                   AND public.cloud_ip_attribuable(i, u, 'essai') AND public.cloud_ip_controlee_avant_attribution(i)) THEN
    RAISE EXCEPTION 'IP 94 : pas attribuable maintenant (disponible, saine, contrôlée juste avant — relire)';
  END IF;
  IF EXISTS (SELECT 1 FROM public.cloud_ips WHERE user_id = u AND id <> 76) THEN RAISE EXCEPTION '0c97dc8b tient une autre IP (relire)'; END IF;
  -- 76 : quitte le compte, disponible, Beebs fermé (jamais au repos).
  UPDATE public.cloud_ips
     SET etat = 'disponible', user_id = NULL, dernier_user_id = u, liberee_le = now(), repos_fin = NULL,
         reserve_pour = NULL, reserve_jusqu_au = NULL,
         sante = jsonb_set(COALESCE(sante, '{}'::jsonb), '{plateformes_fermees}',
                   (SELECT COALESCE(jsonb_agg(DISTINCT x), '[]'::jsonb) FROM jsonb_array_elements_text(COALESCE(sante -> 'plateformes_fermees', '[]'::jsonb) || '["beebs"]'::jsonb) x)),
         maj_le = now()
   WHERE id = 76;
  PERFORM public.cloud_journal(76, 'liberation', u, jsonb_build_object('raison', 'changement_ip_2111', 'decision', 'Nico, 21/11 midi',
          'vers', 94, 'chemin', 'pas cloud_ip_liberer : le compte reste'));
  PERFORM public.cloud_ip_refus_noter(76, 'beebs', 'glissieres_repetees', jsonb_build_object('compte', '0c97dc8b',
          'mesure', '26 glissières pour 22 publications Beebs en 72 h (IP hébergeur)', 'le', '2026-11-21', 'regle', '03/11 : le refus porte sur la plateforme qui refuse'));
  -- 94 : au compte, comme cloud_ip_attribuer.
  UPDATE public.cloud_ips
     SET etat = 'attribuee_essai', user_id = u,
         attributions = attributions + CASE WHEN dernier_user_id IS DISTINCT FROM u THEN 1 ELSE 0 END,
         dernier_user_id = u, derniere_origine = 'essai', reserve_pour = NULL, reserve_jusqu_au = NULL,
         attribuee_le = now(), liberee_le = NULL, repos_fin = NULL, purge_preuve = NULL, purge_prouvee_le = NULL, maj_le = now()
   WHERE id = 94;
  PERFORM public.cloud_journal(94, 'attribution', u, jsonb_build_object('nature', 'essai', 'raison', 'changement_ip_2111',
          'decision', 'Nico, 21/11 midi', 'depuis', 76, 'controle_le', (SELECT sante ->> 'saine_le' FROM public.cloud_ips WHERE id = 94)));
END $$;
SELECT id, host(ip) AS ip, etat, left(user_id::text, 8) AS compte, left(dernier_user_id::text, 8) AS dernier, attributions,
       sante -> 'plateformes_fermees' AS fermees, refus ? 'beebs' AS refus_beebs
  FROM public.cloud_ips WHERE id IN (76, 94) ORDER BY id;
COMMIT;
