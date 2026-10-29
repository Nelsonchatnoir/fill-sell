-- FIN du test du 29/10 soir (scripts/essais/20261029_test_bijoux_ebay_nico.sql) : la file de Nico est remise en pause,
-- comme il l'avait laissée (bouton de l'app, 28/10 22:47), APRÈS les retraits (761cdf2f eBay, 97f2f118 Vinted : deleted).
-- La fiche de test reste dans son stock (« TEST FillSell 999 ne pas acheter - boutons de manchette argentés »), comme
-- les fiches des tests précédents : la supprimer est un geste de l'app, à lui.
begin;
select set_config('request.jwt.claims', '{"sub":"f44b5917-bccc-4431-ba41-f40571a2ed18","role":"authenticated"}', true);
set local role authenticated;
select public.file_pause_basculer(true) as file_en_pause;
commit;
select platform_settings->'file_pause' as file_pause from public.profiles where id = 'f44b5917-bccc-4431-ba41-f40571a2ed18';
