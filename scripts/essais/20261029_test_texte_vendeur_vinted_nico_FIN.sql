-- FIN du test du 29/10 soir (scripts/essais/20261029_test_texte_vendeur_vinted_nico.sql) : la file de Nico est remise en pause,
-- comme il l'avait laissée (bouton de l'app, 28/10 22:47), APRÈS les retraits (le retrait Vinted du test : deleted).
-- La fiche de test reste dans son stock (« TEST FillSell 999 ne pas acheter - Jazz man boutons »), comme
-- les fiches des tests précédents : la supprimer est un geste de l'app, à lui.
begin;
select set_config('request.jwt.claims', '{"sub":"f44b5917-bccc-4431-ba41-f40571a2ed18","role":"authenticated"}', true);
set local role authenticated;
select public.file_pause_basculer(true) as file_en_pause;
commit;
select platform_settings->'file_pause' as file_pause from public.profiles where id = 'f44b5917-bccc-4431-ba41-f40571a2ed18';
