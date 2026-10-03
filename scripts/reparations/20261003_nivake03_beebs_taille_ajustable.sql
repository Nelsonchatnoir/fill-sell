-- ═══════════════════════════════════════════════════════════════════════════
-- NIVAKE03 — CEINTURE BEEBS REMISE EN LIGNE AVEC LA TAILLE QU'ELLE AFFICHAIT
-- (03/10 nuit, ~23:20)
-- ═══════════════════════════════════════════════════════════════════════════
-- Job 8d487ebb (republication Beebs, « ceinture powerlifting manga »).
-- L'annonce 34074935 affichait « Ajustable » (relevé du 02/10, capture.taille ;
-- valeur choisie au dépôt dans la grille Beebs « 70 mm … 125 mm, Ajustable »).
-- La copie de dépôt disait « L » : pré-vol « ok » sur une 0.6.82 (qui devinait
-- encore), retrait le 02/10 01:19, puis la recréation (0.6.85, qui ne devine
-- plus) a demandé « Taille » — annonce HORS LIGNE depuis le 02/10.
-- Règle du 03/10 (Nico) : un champ visible sur l'annonce n'est jamais demandé ;
-- une republication remet l'annonce telle qu'elle était → « Ajustable ».
-- (Corrigé pour la suite : get-pending-jobs v205 + extension 0.6.94.)
-- L'étape « deleted » est exemptée des retenues : la recréation repart seule.
-- Sauvegarde : _backup_0310_nivake03. Inverse : _INVERSE.sql.
begin;
create table if not exists public._backup_0310_nivake03 (id text primary key, ligne jsonb, le timestamptz default now());
insert into public._backup_0310_nivake03 (id, ligne)
select j.id::text, to_jsonb(j) from public.cross_post_jobs j
where j.id = '8d487ebb-3b50-43cc-afba-435fc7c37f9a' and j.status = 'needs_user'
on conflict (id) do nothing;

update public.cross_post_jobs j
set status = 'pending', error = null,
    platform_fields = (j.platform_fields - 'needsUserField' - 'needsUserFields'
        - 'needs_user_tick_le' - 'needs_user_actif_ms' - 'needs_user_vu_le' - 'needs_user_vu_erreur')
      || jsonb_build_object(
        'taille', 'Ajustable',
        'needsUserAttempts', 0,
        'needsUserResolved', coalesce(j.platform_fields->'needsUserResolved', '{}'::jsonb) || jsonb_build_object('taille', 'Ajustable'),
        'taille_reprise_de_l_annonce', jsonb_build_object(
          'avant', j.platform_fields->>'taille', 'apres', 'Ajustable',
          'source', 'annonce Beebs 34074935 (relevé du 02/10 : capture.taille)', 'le', now(),
          'pose_par', 'scripts/reparations/20261003_nivake03_beebs_taille_ajustable.sql'),
        'erreurs_archivees', coalesce(j.platform_fields->'erreurs_archivees', '[]'::jsonb)
          || jsonb_build_array(jsonb_build_object('le', now(), 'statut', j.status, 'erreur', left(j.error, 500),
               'motif', 'taille reprise de l''annonce (réparation 03/10)')))
where j.id = '8d487ebb-3b50-43cc-afba-435fc7c37f9a' and j.status = 'needs_user'
  and j.platform_fields->>'republish_step' = 'deleted'
  and exists (select 1 from public.annonces_plateforme a where a.platform = 'beebs' and a.listing_id = '34074935'
              and a.capture->>'taille' = 'Ajustable');

select left(id::text, 8) id, status, platform_fields->>'republish_step' step, platform_fields->>'taille' taille
from public.cross_post_jobs where id = '8d487ebb-3b50-43cc-afba-435fc7c37f9a';
commit;
