-- Essai à blanc de 20261024235700 (l'annulation vue par le relevé des commandes) — joué APRÈS le corps de la migration
-- (rattrapage compris), dans la même transaction, puis ROLLBACK. Vente réelle : le short de Nico (commande 23532974658,
-- vente 274921, fiche 1785871917724004), annulée par Nico le 24/10 vers 21:45. Rien ne reste.
create temp table _r (essai text, ok boolean, detail text) on commit drop;
insert into _r select 'R1 rattrapage : la vente du short est retirée', not exists (select 1 from ventes where id = 274921), null;
insert into _r select 'R2 la fiche revient au stock', (select statut from inventaire where id = 1785871917724004) <> 'vendu',
  (select statut from inventaire where id = 1785871917724004);
insert into _r select 'R3 la remise en vente est PROPOSÉE (rien d''automatique)', count(*) >= 1 and bool_and(statut = 'proposee'),
  string_agg(platform || ':' || statut, ', ')
  from remises_en_vente where inventaire_id = 1785871917724004 and cree_le > now() - interval '1 minute';
insert into _r select 'R4 la carte « Vente annulée » a sa ligne (ventes_annulees_a_remettre, compte de Nico)', count(*) = 1, string_agg(etat || ' ' || array_to_string(plateformes, ','), ' ; ')
  from (select set_config('request.jwt.claim.sub', 'f44b5917-bccc-4431-ba41-f40571a2ed18', true),
               set_config('request.jwt.claims', '{"sub":"f44b5917-bccc-4431-ba41-f40571a2ed18","role":"authenticated"}', true)) s,
       lateral (select * from public.ventes_annulees_a_remettre() where inventaire_id = 1785871917724004) c;
insert into _r select 'R5 trace : une ligne « vente_annulee_vue_par_commandes » (rattrapage)', count(*) = 1, string_agg(metadata ->> 'resultat', ' ; ')
  from usage_logs where feature = 'vente_annulee_vue_par_commandes' and created_at = now();
insert into _r select 'R6 aucune erreur tracée', count(*) = 0, count(*)::text
  from usage_logs where feature = 'vente_annulee_vue_par_commandes_erreur' and created_at = now();
-- Le déclencheur : une commande Vinted FICTIVE du compte de Nico passe « annulee » → sa vente fictive est retirée ; une
-- seconde mise à jour « annulee » ne refait rien ; une autre plateforme n'est pas touchée.
insert into ventes (user_id, titre, prix_vente, plateforme_code, commande_ref, statut, quantite, source)
values ('f44b5917-bccc-4431-ba41-f40571a2ed18', 'essai annulation', 1, 'vinted', 'ESSAI-ANN-1', 'vendu', 1, 'releve');
insert into plateforme_commandes (user_id, platform, commande_ref, etat, bordereau, titre)
values ('f44b5917-bccc-4431-ba41-f40571a2ed18', 'vinted', 'ESSAI-ANN-1', 'a_expedier', 'pret', 'essai annulation');
update plateforme_commandes set etat = 'annulee' where commande_ref = 'ESSAI-ANN-1';
insert into _r select 'T1 commande vue annulée → vente retirée tout de suite', not exists (select 1 from ventes where commande_ref = 'ESSAI-ANN-1'), null;
update plateforme_commandes set etat = 'annulee', maj_le = now() where commande_ref = 'ESSAI-ANN-1';
insert into _r select 'T2 idempotent : une seule trace pour la commande', count(*) = 1, count(*)::text
  from usage_logs where feature = 'vente_annulee_vue_par_commandes' and metadata ->> 'commande' = 'ESSAI-ANN-1' and created_at = now();
insert into ventes (user_id, titre, prix_vente, plateforme_code, commande_ref, statut, quantite, source)
values ('f44b5917-bccc-4431-ba41-f40571a2ed18', 'essai lbc', 1, 'leboncoin', 'ESSAI-ANN-2', 'vendu', 1, 'releve');
insert into plateforme_commandes (user_id, platform, commande_ref, etat, bordereau, titre)
values ('f44b5917-bccc-4431-ba41-f40571a2ed18', 'leboncoin', 'ESSAI-ANN-2', 'annulee', 'sans_objet', 'essai lbc');
insert into _r select 'T3 Leboncoin : rien (règle Vinted seulement)', exists (select 1 from ventes where commande_ref = 'ESSAI-ANN-2'), null;
insert into _r select 'T4 aucun mail en file', count(*) = 0, count(*)::text from email_logs where sent_at = now();
select essai, ok, left(detail, 300) detail from _r order by essai;
