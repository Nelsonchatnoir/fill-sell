-- INVERSE de 20261015_questions_retraits_annules_0910.sql : retire les questions
-- posées par la réparation, SEULEMENT si la personne n'a pas encore répondu
-- (statut 'proposee'). Une réponse donnée (« Oui » : retrait armé ; « Non ») n'est
-- jamais défaite ici.
begin;
delete from public.inventaire_doublons q
 using public._backup_1510_questions_retraits_0910 b
 where q.id = b.doublon_id and q.statut = 'proposee';
select count(*) as questions_restantes_repondues
  from public.inventaire_doublons q join public._backup_1510_questions_retraits_0910 b on b.doublon_id = q.id;
commit;
