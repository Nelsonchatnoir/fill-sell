-- LOT F, finition (31/10) — preuve de la garde du numéro, étape 5 : le geste « Fusionner » de l'app
-- (inventaire_fusionner, FusionArticleModal, sous les claims de Nico) : la fiche de test en double 1793438700002
-- (annonce Leboncoin 3299049683) rejoint 1793438700001, qui porte la republication retenue ff153150 (numéro
-- 3299028197, retiré). Comme chez Johan : la fiche a désormais UNE annonce Leboncoin plus récente en ligne.
-- Défaire : inventaire_defusionner(<fusion_id rendu>). Ensuite un relevé Leboncoin (…_2) puis le poll : attendu
-- « déjà remise en ligne », la republication se clôt, rien retiré ni recréé.
begin;
select set_config('request.jwt.claims', '{"sub":"f44b5917-bccc-4431-ba41-f40571a2ed18","role":"authenticated"}', true);
set local role authenticated;
select public.inventaire_fusionner(1793438700001, 1793438700002) as fusion;
reset role;
select left(id::text, 8) job, inventaire_id, action, status, platform_listing_id
  from cross_post_jobs where user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18' and inventaire_id = 1793438700001 and platform = 'leboncoin'
 order by created_at;
commit;
