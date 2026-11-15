-- 20261115_ventes_reinitialisation_restaurees_VERIFIER.sql — SELECT SEULEMENT.
--   npx supabase db query --linked --read-only -f scripts/reparations/20261115_ventes_reinitialisation_restaurees_VERIFIER.sql
select left(b.user_id::text, 8) as compte,
       (select email from auth.users a where a.id = b.user_id) as mail,
       count(*) filter (where b.decision = 'restauree') as remises,
       count(*) filter (where b.decision = 'restauree' and v.id is not null) as presentes,
       count(*) filter (where b.decision = 'doute_titre') as doutes_titre,
       (select count(*) from public.ventes x where x.user_id = b.user_id) as ventes_au_total,
       (select count(*) from public.ventes x where x.user_id = b.user_id and x.commande_ref is not null
          group by x.plateforme_code, x.commande_ref having count(*) > 1 limit 1) as doublon_commande,
       (select count(*) from public.push_ventes p where p.user_id = b.user_id and p.vente_id in
          (select vente_id from public._backup_1511_ventes_reinitialisation y where y.user_id = b.user_id)) as push_des_remises,
       (select count(*) from public.ventes_supprimees s where s.user_id = b.user_id and s.motif like 'restauree 15/11%') as tombes_marquees,
       count(*) filter (where b.decision = 'restauree' and v.id is not null and (v.prix_achat is not null or v.inventaire_id is not null)
                          and left(b.user_id::text, 8) <> '9148e867') as modifiees_depuis
  from public._backup_1511_ventes_reinitialisation b
  left join public.ventes v on v.id = b.vente_id and v.user_id = b.user_id
 group by b.user_id order by 1;
