-- LOT F, finition (31/10) — preuve de la garde du numéro, étape 2 : le geste « Synchroniser » Leboncoin de l'app
-- (demander_sync_plateforme, sous les claims de Nico), lancé plus de 10 min après le dépôt de 3299028197 (11:48:20) :
-- le relevé, complet, ne voit plus l'annonce retirée à 11:56. Ensuite : reprise de la file (…_lot_h_file_REPRISE).
begin;
select set_config('request.jwt.claims', '{"sub":"f44b5917-bccc-4431-ba41-f40571a2ed18","role":"authenticated"}', true);
set local role authenticated;
select public.demander_sync_plateforme('leboncoin') as releve_leboncoin;
reset role;
commit;
