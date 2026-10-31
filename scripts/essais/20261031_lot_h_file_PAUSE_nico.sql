-- LOT F (finition) + LOT H (31/10) — compte de Nico : file remise EN PAUSE par le bouton de l'app
-- (file_pause_basculer, sous ses claims), pour les essais sur ses annonces de test. Aucun mail.
begin;
select set_config('request.jwt.claims', '{"sub":"f44b5917-bccc-4431-ba41-f40571a2ed18","role":"authenticated"}', true);
set local role authenticated;
select public.file_pause_basculer(true) as file_pause;
reset role;
select platform_settings -> 'file_pause' as file_pause from profiles where id = 'f44b5917-bccc-4431-ba41-f40571a2ed18';
commit;
