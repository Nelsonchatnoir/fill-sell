-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- RÉPARATION CONDITIONNELLE 13/11 (lot du 13/11, N6b) — compte 98b72757 : ses publications « Cholet 49308 » BLOQUÉES
-- par la règle 3d d'avant (needs_user, lbc_commune_code_postal) reviennent en file
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- NON EXÉCUTÉE : feu vert de Nico requis, et SEULEMENT APRÈS le déploiement de get-pending-jobs portant la règle N6b
-- (`npx supabase functions list` : version postérieure à v369) — sinon la règle d'avant les rebloquerait au poll suivant.
-- UTILE SEULEMENT SI le poste du compte a pollé entre-temps : le 13/11 vers 06:50, les 12 publications étaient encore
-- « pending » (11) / « processing » remise en « pending » par handler-watch à 06:48 (1), et get-pending-jobs v369 (règle
-- 3d : code d'aucune commune → needs_user) ne les avait encore jamais servies (aucune ligne de journal pour ce compte
-- depuis l'étape 3). Toujours « pending » au déploiement → la règle N6b les sert d'elle-même (Cholet 49300) : ce script
-- ne trouve rien et n'écrit rien.
-- Ce qu'il fait : les publications Leboncoin de 98b72757 créées le 12/11 entre 21:54 et 23:04 (Paris), en needs_user
-- avec needs_user_source = lbc_commune_code_postal et une ville de l'annonce en 49308 → pending, erreur archivée
-- (erreurs_archivees), compteurs d'essais remis à zéro par public.republication_remise_en_file (même règle que
-- _shared/remise-en-file.js). La copie 49308 reste sur la tâche : c'est get-pending-jobs qui sert 49300 (trace
-- lbc_commune_meme_cp). ⛔ Aucune annonce, aucun réglage, aucune fiche touchée ; jamais une tâche d'un autre statut.
-- Sauvegarde : public._backup_1311_98b72757_remise_en_file (RLS, aucun accès client).
-- Inverse : 20261113_98b72757_remise_en_file_cedex_INVERSE.sql. Lecture : 20261113_98b72757_remise_en_file_cedex_PREUVE.sql.
-- Essai : remplacer COMMIT par ROLLBACK. À jouer : npx supabase db query --linked -f scripts/reparations/20261113_98b72757_remise_en_file_cedex.sql
BEGIN;
SET LOCAL lock_timeout = '5s';

DO $garde$
BEGIN
  IF to_regclass('public._backup_1311_98b72757_remise_en_file') IS NOT NULL THEN
    RAISE EXCEPTION 'script déjà passé (sauvegarde présente) : rien n''est écrit';
  END IF;
  IF to_regproc('public.republication_remise_en_file') IS NULL THEN
    RAISE EXCEPTION 'public.republication_remise_en_file absente : rien n''est écrit';
  END IF;
END
$garde$;

CREATE TABLE public._backup_1311_98b72757_remise_en_file AS
  SELECT j.id, j.user_id, j.status, j.error, j.platform_fields, now() AS sauvegarde_le
    FROM public.cross_post_jobs j
   WHERE j.user_id = '98b72757-6cd6-4aaf-88f2-39533c71cbae'
     AND j.platform = 'leboncoin' AND j.action = 'publish' AND j.status = 'needs_user'
     AND j.created_at >= '2026-11-12 21:54:00+01' AND j.created_at < '2026-11-12 23:04:00+01'
     AND j.platform_fields ->> 'needs_user_source' = 'lbc_commune_code_postal'
     AND j.platform_fields -> 'ville_publication_lbc' ->> 'code_postal' = '49308';
ALTER TABLE public._backup_1311_98b72757_remise_en_file ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public._backup_1311_98b72757_remise_en_file FROM PUBLIC, anon, authenticated;

UPDATE public.cross_post_jobs j
   SET status = 'pending',
       error = NULL,
       platform_fields = public.republication_remise_en_file(
         (j.platform_fields - 'needs_user_source')
           || jsonb_build_object('erreurs_archivees',
                CASE WHEN jsonb_typeof(j.platform_fields -> 'erreurs_archivees') = 'array' THEN j.platform_fields -> 'erreurs_archivees' ELSE '[]'::jsonb END
                || CASE WHEN coalesce(j.error, '') = '' THEN '[]'::jsonb ELSE jsonb_build_array(jsonb_build_object(
                     'le', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), 'statut', 'needs_user',
                     'erreur', left(j.error, 2000), 'par', 'réparation 20261113 N6b (code CEDEX → commune)')) END),
         'réparation 20261113 N6b', 'ville de l''annonce 49308 : repli sur Cholet 49300 (get-pending-jobs)')
  FROM public._backup_1311_98b72757_remise_en_file b
 WHERE j.id = b.id AND j.status = 'needs_user';

SELECT (SELECT count(*) FROM public._backup_1311_98b72757_remise_en_file) AS bloquees_trouvees,
       (SELECT count(*) FROM public.cross_post_jobs j JOIN public._backup_1311_98b72757_remise_en_file b ON b.id = j.id
         WHERE j.status = 'pending' AND j.platform_fields ? 'remise_en_file') AS remises_en_file;
COMMIT;
