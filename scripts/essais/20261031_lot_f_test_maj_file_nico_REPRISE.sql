-- LOT F (31/10) — reprise de la file de Nico (bouton « Reprendre » de l'app : file_pause_basculer(false), sous ses
-- claims), après la mise à jour de l'extension : les 4 publications de test qui attendaient doivent partir seules.
-- Remise en pause à la fin des essais : …_FIN.sql.
begin;
select set_config('request.jwt.claims', '{"sub":"f44b5917-bccc-4431-ba41-f40571a2ed18","role":"authenticated"}', true);
set local role authenticated;
select public.file_pause_basculer(false) as file_reprise;
reset role;
select platform_settings -> 'file_pause' as file_pause from profiles where id = 'f44b5917-bccc-4431-ba41-f40571a2ed18';
commit;
