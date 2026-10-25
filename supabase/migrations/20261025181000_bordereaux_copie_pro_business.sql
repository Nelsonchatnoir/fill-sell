-- PROPOSITION (NON APPLIQUÉE, hors dépôt) — 25/10 après-midi : la COPIE du bordereau Vinted dans FillSell pour TOUS les
-- comptes Pro et Business, comme décidé le 24/10 nuit (migration 20261024235500_bordereaux_vinted_tous_les_comptes).
-- Ce qui manque : cette migration a ouvert les fonctions (bordereaux_ouverts_pour, coin_config.bordereaux_vinted_tous = 1)
-- mais PAS la règle d'écriture du stockage : la politique storage.objects « bordereaux_insert » exige encore
-- messagerie_beta(auth.uid()). Mesuré le 25/10 à 14:20 (bordereaux_demandes, 30 h) : 26 demandes en échec
-- « copie_http_400 » sur 5 comptes Pro/Business, AUCUN en bêta (dont les 2 commandes de Thierry, antikcollections,
-- lot de 11 monnaies payé le 24/10) ; les 2 copies réussies sont celles de 2 comptes bêta. Le PDF est bien lu chez Vinted
-- (93 462 octets pour le lot de Thierry à 09:58:48), c'est son dépôt dans le stockage qui est refusé.
-- Le changement : la même politique, avec « bêta OU bordereaux ouverts à ce compte pour Vinted ». Rien d'autre.
-- Après application : les demandes en échec se relancent par le geste habituel (« Bordereau » dans « À expédier »).
-- Application (feu vert NOMMÉ de Nico) : npx supabase db query --linked -f <ce fichier>, puis migration repair.
-- Inverse : la politique d'avant (messagerie_beta seul), ci-dessous en commentaire.
BEGIN;
SET LOCAL lock_timeout = '5s';
DROP POLICY IF EXISTS bordereaux_insert ON storage.objects;
CREATE POLICY bordereaux_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'bordereaux'
    AND (storage.foldername(name))[1] = (auth.uid())::text
    AND (public.messagerie_beta(auth.uid()) OR public.bordereaux_ouverts_pour(auth.uid(), 'vinted'))
  );
COMMIT;
-- INVERSE :
-- BEGIN; DROP POLICY IF EXISTS bordereaux_insert ON storage.objects;
-- CREATE POLICY bordereaux_insert ON storage.objects FOR INSERT TO authenticated
--   WITH CHECK (bucket_id = 'bordereaux' AND (storage.foldername(name))[1] = (auth.uid())::text AND messagerie_beta(auth.uid()));
-- COMMIT;
