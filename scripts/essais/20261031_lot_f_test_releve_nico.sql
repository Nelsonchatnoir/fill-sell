-- LOT F (31/10) — non-régression, compte de Nico : relevé + rattachement. Le geste « Synchroniser » de l'app pour
-- Leboncoin et Depop (demander_sync_plateforme, sous ses claims) après les republications de test : attendu, les
-- nouvelles annonces relevées se rattachent PAR LEUR IDENTIFIANT à leur fiche de test (jamais une fiche neuve).
begin;
select set_config('request.jwt.claims', '{"sub":"f44b5917-bccc-4431-ba41-f40571a2ed18","role":"authenticated"}', true);
set local role authenticated;
select public.demander_sync_plateforme('leboncoin') as releve_leboncoin, public.demander_sync_plateforme('depop') as releve_depop;
reset role;
commit;
