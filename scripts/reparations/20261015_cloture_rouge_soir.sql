-- ═══════════════════════════════════════════════════════════════════════════
-- 15/10 soir — CLÔTURE DU ROUGE, point 5 (geronimo) : un dépôt annulé à tort
-- par le balayage des dépôts muets est remis en file.
-- ═══════════════════════════════════════════════════════════════════════════
-- Règle corrigée (handler-watch v110, _shared/depot-muet.js) : l'attente d'un
-- dépôt se compte depuis sa DERNIÈRE REMISE EN FILE, plus depuis sa création.
-- Le balayage avait annulé à 20:03 la publication Beebs 14887481 (« Le Livre
-- des Louveteaux », créée le 03/10) remise en file à la main le 15/10 au soir.
-- Vérifié avant : aucune annonce Beebs de ce compte ne porte ce livre (relevé
-- vide, index public : aucune annonce « Louveteaux »), le job n'a jamais
-- envoyé de dépôt (sonde : aucune requête). Aucun doublon possible.
-- Seul job annulé par cette garde parmi les 30 remis en file ce soir (les 3
-- autres annulations du jour : Haekoz 10 j, patrick giry 13 et 14 j sans
-- relance — conformes à la règle).
-- Sauvegarde : _backup_1510_cloture_rouge_jobs ; inverse :
-- 20261015_cloture_rouge_soir_INVERSE.sql. Aucun mail, aucun retrait.

begin;

create table if not exists public._backup_1510_cloture_rouge_jobs as
  select id, status, error, platform_fields, now() as sauve_le from public.cross_post_jobs where false;

insert into public._backup_1510_cloture_rouge_jobs (id, status, error, platform_fields, sauve_le)
select id, status, error, platform_fields, now() from public.cross_post_jobs
 where id = '14887481-96b2-4f9b-a92f-de0ad6243747' and status = 'cancelled'
   and platform_fields ? 'pending_muet_clos_le';

update public.cross_post_jobs j
   set status = 'pending',
       error = null,
       platform_fields = (j.platform_fields - 'pending_muet_jours')
         || jsonb_build_object(
              'remis_en_file_le', now(),
              'remise_en_file_reparation', jsonb_build_object('le', now(), 'par', 'cloture_rouge_1510',
                 'motif', 'annulé à tort par le balayage des dépôts muets (âge compté depuis la création)'),
              'erreurs_archivees', coalesce(j.platform_fields->'erreurs_archivees', '[]'::jsonb)
                 || jsonb_build_array(jsonb_build_object('le', now(), 'statut', 'cancelled', 'erreur', j.error,
                      'par', 'reparation cloture_rouge_1510 (remise en file)')))
 where j.id = '14887481-96b2-4f9b-a92f-de0ad6243747' and j.status = 'cancelled'
   and j.platform_fields ? 'pending_muet_clos_le';

commit;
