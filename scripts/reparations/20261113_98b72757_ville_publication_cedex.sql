-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- RÉPARATION 13/11 (lot du 13/11, N6b) — compte 98b72757 : la ville de ses annonces Leboncoin reprend le code postal
-- de SA commune (Cholet 49308 → Cholet 49300)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- NON EXÉCUTÉE : feu vert de Nico requis. FACULTATIVE pour les 12 publications bloquées : get-pending-jobs (règle N6b,
-- _shared/lbc-commune-meme-cp.js + _shared/ville-publication-code-postal.js) les sert déjà avec Cholet 49300 dès son
-- déploiement, sans toucher aux Réglages. Ce script ne fait que remettre le RÉGLAGE d'accord avec la commune — le
-- geste que la phrase de la tâche demande à la personne (« mets 49300 dans Réglages › Adresse de remise › « Ville de
-- tes annonces Leboncoin » ») — pour que l'écran cesse d'afficher « Cholet (49308) » et que les publications suivantes
-- ne portent plus 49308.
-- Ce qui s'est passé (lecture seule du 13/11, heure de Paris) : le 11/11 à 11:27:13, depuis l'app Android,
-- platform_settings_fusionner a reçu { ville_publication: { code_postal: <5 chiffres>, ville: « Cholet » } } (116 octets,
-- seul écrivain : src/reglages/VilleLeboncoinParDefaut.jsx) ; l'adresse de remise, enregistrée 9 s avant et 5 s après,
-- porte 49300 ; les 26 annonces Leboncoin du compte sont à « Cholet 49300 ». 49308 n'est le code d'aucune commune
-- (base officielle, codes-postaux-fr.js).
-- La valeur écrite est celle que la règle calcule (vraiCodePostalDeLaCommune : adresse du vendeur, même commune, même
-- département) — voir la PREUVE. Garde : rien n'est écrit si le réglage ou l'adresse ont changé depuis la lecture.
-- ⛔ Aucune annonce, aucune tâche, aucune fiche touchée. Écriture par la seule RPC autorisée (platform_settings_fusionner).
-- Sauvegarde : public._backup_1311_98b72757_ville_publication (RLS, aucun accès client).
-- Inverse : 20261113_98b72757_ville_publication_cedex_INVERSE.sql. Lecture : 20261113_98b72757_ville_publication_cedex_PREUVE.sql.
-- Essai : remplacer COMMIT par ROLLBACK. À jouer : npx supabase db query --linked -f scripts/reparations/20261113_98b72757_ville_publication_cedex.sql
BEGIN;
SET LOCAL lock_timeout = '5s';

DO $garde$
BEGIN
  IF to_regclass('public._backup_1311_98b72757_ville_publication') IS NOT NULL THEN
    RAISE EXCEPTION 'script déjà passé (sauvegarde présente) : rien n''est écrit';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
     WHERE id = '98b72757-6cd6-4aaf-88f2-39533c71cbae'
       AND platform_settings -> 'leboncoin' -> 'ville_publication' = '{"code_postal": "49308", "ville": "Cholet"}'::jsonb
       AND platform_settings -> 'leboncoin' ->> 'code_postal' = '49300'
       AND platform_settings -> 'leboncoin' ->> 'ville' = 'Cholet'
  ) THEN
    RAISE EXCEPTION 'le réglage ou l''adresse de 98b72757 ont changé depuis la lecture du 13/11 : rien n''est écrit';
  END IF;
END
$garde$;

CREATE TABLE public._backup_1311_98b72757_ville_publication AS
  SELECT id AS user_id,
         platform_settings -> 'leboncoin' -> 'ville_publication' AS ville_publication_avant,
         '{"code_postal": "49300", "ville": "Cholet"}'::jsonb AS ville_publication_apres,
         now() AS sauvegarde_le
    FROM public.profiles
   WHERE id = '98b72757-6cd6-4aaf-88f2-39533c71cbae';
ALTER TABLE public._backup_1311_98b72757_ville_publication ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public._backup_1311_98b72757_ville_publication FROM PUBLIC, anon, authenticated;

SELECT public.platform_settings_fusionner(
         array['leboncoin'],
         jsonb_build_object('ville_publication', b.ville_publication_apres),
         '{}'::text[],
         b.user_id
       ) -> 'leboncoin' -> 'ville_publication' AS ville_publication_ecrite
  FROM public._backup_1311_98b72757_ville_publication b;

DO $verif$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p JOIN public._backup_1311_98b72757_ville_publication b ON b.user_id = p.id
     WHERE p.platform_settings -> 'leboncoin' -> 'ville_publication' = b.ville_publication_apres
       AND p.platform_settings -> 'leboncoin' ->> 'adresse' IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'relecture fausse : rien n''est écrit';
  END IF;
END
$verif$;

SELECT b.user_id, b.ville_publication_avant, p.platform_settings -> 'leboncoin' -> 'ville_publication' AS ville_publication_apres
  FROM public._backup_1311_98b72757_ville_publication b JOIN public.profiles p ON p.id = b.user_id;
COMMIT;
