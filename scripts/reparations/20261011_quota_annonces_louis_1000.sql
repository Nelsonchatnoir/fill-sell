-- ═══════════════════════════════════════════════════════════════════════════
-- EXCEPTION DE QUOTA POUR UN SEUL COMPTE : Louis (11/10/2026, décision de Nico)
-- ═══════════════════════════════════════════════════════════════════════════
-- 1 000 annonces par mois au lieu du quota Business (coin_config
-- quota_annonces_business = 300, inchangé). Ses autres quotas (scans, retouches,
-- voix, republication) ne bougent pas. Lu par quota_annonces_compte (migration
-- 20261011150000) dans quotas_etat, spend_coins_for_generate, spend_coins_for_lens.
-- Prérequis : migration 20261011150000 APPLIQUÉE.
--
-- Lancer : npx supabase db query --linked -f scripts/reparations/20261011_quota_annonces_louis_1000.sql
-- RETIRER (retour automatique au quota du palier), une ligne :
--   delete from public.quotas_par_compte where user_id = 'faf5021a-479a-4bb3-b3ec-c296770739b7';
insert into public.quotas_par_compte (user_id, quota_annonces, motif, pose_par)
values ('faf5021a-479a-4bb3-b3ec-c296770739b7', 1000,
        'Exception décidée par Nico le 11/10/2026 : 1 000 annonces par mois au lieu du quota du palier Business',
        'Nico (11/10/2026), posé par Claude')
on conflict (user_id) do update
  set quota_annonces = excluded.quota_annonces, motif = excluded.motif,
      pose_le = now(), pose_par = excluded.pose_par;

select user_id, quota_annonces, motif, pose_le from public.quotas_par_compte;
