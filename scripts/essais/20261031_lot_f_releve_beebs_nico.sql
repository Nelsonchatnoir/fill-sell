-- LOT F, finition (31/10) — compte de Nico : le geste « Synchroniser » Beebs de l'app (demander_sync_plateforme, sous ses
-- claims), pour savoir si l'annonce de test Beebs 34270410 (déposée à 11:46) est sortie de la vérification de Beebs —
-- condition pour prouver le parcours complet de republication Beebs. Aucun mail.
begin;
select set_config('request.jwt.claims', '{"sub":"f44b5917-bccc-4431-ba41-f40571a2ed18","role":"authenticated"}', true);
set local role authenticated;
select public.demander_sync_plateforme('beebs') as releve_beebs;
reset role;
commit;
