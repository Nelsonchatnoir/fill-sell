-- LOT F (31/10) — essai « pause puis reprise » : la file de Nico mise en PAUSE (bouton « Mettre en pause » de l'app :
-- file_pause_basculer(true), sous ses claims) au milieu des 4 republications de test. Attendu : rien de non commencé ne
-- part, une republication dont l'annonce est déjà retirée va au bout. Reprise : …_REPRISE.sql.
begin;
select set_config('request.jwt.claims', '{"sub":"f44b5917-bccc-4431-ba41-f40571a2ed18","role":"authenticated"}', true);
set local role authenticated;
select public.file_pause_basculer(true) as file_pause;
reset role;
select platform_settings -> 'file_pause' as file_pause from profiles where id = 'f44b5917-bccc-4431-ba41-f40571a2ed18';
commit;
