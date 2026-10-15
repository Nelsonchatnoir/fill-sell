-- ═══════════════════════════════════════════════════════════════════════════
-- 15/10 soir — CLÔTURE DU ROUGE, point 1 (Ciddjy, « Jogging 18 mois » 7b37d91b)
-- ═══════════════════════════════════════════════════════════════════════════
-- Fait prouvé : le dernier essai (19:50 → 19:54) n'a envoyé AUCUNE requête à
-- Beebs (sonde réseau : « AUCUNE capture ») ; le compte Beebs ne porte aucune
-- annonce « Jogging » (index public, 77 annonces, exhaustif). Un nouvel essai
-- n'est donc pas un dépôt à l'aveugle (_shared/depot-sans-numero.js). Le job
-- était passé « relancer » après des interruptions du poste (veille), pas
-- après des refus de Beebs. Remis en file une fois ; l'autre exemplaire
-- (cee154c7) reste retenu par get-pending-jobs v252 jusqu'à un relevé du
-- compte (son dernier essai a pu cliquer).
-- Sauvegarde : _backup_1510_cloture_rouge_jobs (même table que le script 1) ;
-- inverse : 20261015_cloture_rouge_soir_INVERSE.sql.

begin;

create table if not exists public._backup_1510_cloture_rouge_jobs as
  select id, status, error, platform_fields, now() as sauve_le from public.cross_post_jobs where false;

insert into public._backup_1510_cloture_rouge_jobs (id, status, error, platform_fields, sauve_le)
select id, status, error, platform_fields, now() from public.cross_post_jobs
 where id = '7b37d91b-8919-414d-ba0c-65f1d1c74fae' and status = 'needs_user'
   and platform_fields->>'last_diagnostic' like '%AUCUNE capture%';

update public.cross_post_jobs j
   set status = 'pending',
       error = null,
       platform_fields = (j.platform_fields - 'needs_user_source' - 'pas_de_rouge' - 'error_technique' - 'needs_user_tick_le'
                          - 'needs_user_actif_ms' - 'needs_user_vu_le' - 'needs_user_vu_erreur' - 'processing_since')
         || jsonb_build_object(
              'remise_en_file_reparation', jsonb_build_object('le', now(), 'par', 'cloture_rouge_1510',
                 'motif', 'dernier essai sans aucune requête envoyée à Beebs ; aucune annonce Jogging en ligne'),
              'erreurs_archivees', coalesce(j.platform_fields->'erreurs_archivees', '[]'::jsonb)
                 || jsonb_build_array(jsonb_build_object('le', now(), 'statut', 'needs_user', 'erreur', j.error,
                      'par', 'reparation cloture_rouge_1510 (remise en file)')))
 where j.id = '7b37d91b-8919-414d-ba0c-65f1d1c74fae' and j.status = 'needs_user'
   and j.platform_fields->>'last_diagnostic' like '%AUCUNE capture%';

commit;
