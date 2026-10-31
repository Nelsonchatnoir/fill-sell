-- LOT F (31/10) — non-régression, compte de Nico : vente puis retrait des copies.
-- La fiche de test T-shirt (1793438600000, Vinted + Depop à 999 €) est déclarée vendue SUR VINTED par le geste de l'app
-- (« Marquer vendu » : enregistrer_vente_atomique, comme src/utils/venteAtomique.js), sous ses claims. Attendu : un
-- retrait armé pour la copie Depop, que l'extension exécute seule. La fonction n'envoie aucun mail.
begin;
select set_config('request.jwt.claims', '{"sub":"f44b5917-bccc-4431-ba41-f40571a2ed18","role":"authenticated"}', true);
set local role authenticated;
select public.enregistrer_vente_atomique('f44b5917-bccc-4431-ba41-f40571a2ed18', 'lot-f-3110-test-tshirt', 1793438600000, null,
  999, 0, 1, 1, 'vinted') as vente;
reset role;
select left(id::text, 8) job, platform, action, status, platform_listing_id, left(coalesce(error, ''), 80) err
  from cross_post_jobs where user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18' and inventaire_id = 1793438600000 order by created_at;
select statut from inventaire where id = 1793438600000;
commit;
