-- 18/10 ~19:05 Paris — Régis : la vérification par relevé automatique ne voit pas la copie (un relevé automatique
-- n'importe aucun article neuf → le rattachement à l'import n'a rien reçu) et le serveur a resservi la remise en ligne du
-- Larousse (ed7729dc) à 18:58. On RETIENT ce job et les deux autres du lot 1 avant tout nouvel essai, le temps de corriger
-- la preuve. Sauvegarde : _backup_1810_regis_larousse. Inverse : 20261018_regis_larousse_arret_INVERSE.sql.
begin;
create table if not exists public._backup_1810_regis_larousse as
  select id, status, platform_fields, now() as sauve_le from public.cross_post_jobs
   where user_id = '309d0787-9000-46cc-9c6a-51f7475d7d41' and (platform_fields ->> 'lot_liberation_1810') = '1';
update public.cross_post_jobs
   set platform_fields = platform_fields || jsonb_build_object('retenu_par_claude_1810', true, 'next_action_after', '2026-10-25T00:00:00Z',
         'recreation_arretee_1810', jsonb_build_object('at', now(), 'motif', 'vérification par relevé automatique aveugle aux copies — arrêt avant correctif'))
 where user_id = '309d0787-9000-46cc-9c6a-51f7475d7d41' and (platform_fields ->> 'lot_liberation_1810') = '1'
   and status in ('pending', 'needs_user');
commit;
