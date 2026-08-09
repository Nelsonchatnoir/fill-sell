-- ═══════════════════════════════════════════════════════════════════════════
-- profiles.onboarded_at — l'onboarding est un fait de COMPTE, pas d'appareil
-- ═══════════════════════════════════════════════════════════════════════════
-- 2026-08-09, lot 2b.
--
-- POURQUOI : l'écran de choix « Tu vends déjà sur Vinted ? » (lot 2) était
-- branché sur la confirmation de la modale devise, elle-même gatée sur
-- « profiles.currency est vide ». Or currency porte un DÉFAUT EN BASE
-- ('EUR'::character varying) : la colonne n'est JAMAIS vide à la création d'un
-- compte. Constat prod du 09/08 : les derniers inscrits sont tous en
-- currency='EUR', et un compte créé à 13:23:48 (Paris) n'a vu ni la modale ni
-- l'écran. Le rail était donc INERTE pour 100 % des nouveaux comptes.
-- Le défaut 'EUR' n'est PAS touché ici : d'autres chemins en dépendent.
--
-- POURQUOI UNE COLONNE DÉDIÉE, et non une clé dans platform_settings :
--   · platform_settings porte les réglages PAR PLATEFORME (leboncoin.rue,
--     vinted.republish_auto) — y loger l'onboarding serait un squat sémantique
--     que le prochain lecteur devrait décoder ;
--   · une écriture jsonb côté client est un read-modify-write : deux onglets
--     concurrents s'écrasent. Un scalaire, non ;
--   · un timestamptz répond « quand », ce qu'un booléen perd — c'est lui qui
--     rend la requête de contrôle (et toute mesure de funnel) possible.
--
-- POURQUOI LE GRANT EST INDISPENSABLE : l'UPDATE d'`authenticated` sur
-- profiles est COLONNE-SCOPÉ (11 colonnes au 09/08 : currency,
-- extension_sessions, lang, lens_count_*, platform_settings, push_token,
-- stats_analysis_cache, username, voice_count_*). Sans GRANT explicite, le
-- client échouerait à écrire onboarded_at — et l'écran reviendrait à CHAQUE
-- ouverture, pour tout le monde. Le SELECT est déjà table-entière, on le pose
-- quand même explicitement : une colonne qu'on ne peut pas relire est un rail
-- mort, et le coût d'un grant redondant est nul.
-- La policy RLS « update own profile » (auth.uid() = id, USING + WITH CHECK)
-- borne déjà l'écriture à sa propre ligne : rien à ajouter de ce côté.
--
-- RÉTROACTIVITÉ : les comptes existants sont marqués comme déjà onboardés —
-- infliger l'écran de choix à des comptes en cours d'usage serait une
-- régression. On écrit now() et NON created_at : la valeur doit se lire comme
-- ce qu'elle est, un marquage de migration, et non fabriquer dans les analyses
-- futures un faux « onboardé instantanément à l'inscription ».
--
-- IDEMPOTENCE : le backfill est BORNÉ par l'instant d'application. Sans cette
-- borne, un rejeu de la migration marquerait comme onboardés des inscrits
-- POSTÉRIEURS qui n'ont jamais vu l'écran — exactement le bug qu'on corrige.
-- Rejouer ce fichier est donc sans effet sur les comptes futurs.

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS onboarded_at timestamptz;

COMMENT ON COLUMN public.profiles.onboarded_at IS
  'Onboarding post-inscription terminé (écran « Tu vends déjà sur Vinted ? », lot 2). NULL = reste à faire. Source de vérité PAR COMPTE : le localStorage ne sert que de cache d''affichage anti-clignotement.';

GRANT SELECT (onboarded_at), UPDATE (onboarded_at) ON public.profiles TO authenticated;

UPDATE public.profiles
SET onboarded_at = now()
WHERE onboarded_at IS NULL
  AND created_at < '2026-08-09T11:35:00Z'::timestamptz;
