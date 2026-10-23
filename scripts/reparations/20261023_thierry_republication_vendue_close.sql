-- RÉPARATION 23/10 12:2x — la republication de réparation d'une annonce VENDUE entre-temps se clôt sans message.
-- 10494422743 (« Monnaie Romaine, Philippe 1er L'arabe, Sesterce ») a été vendue sur Vinted à 12:19 (vente relevée,
-- fiche « vendu », retrait eBay armé par le circuit normal). Sa republication (créée à 12:17:56, hors quota) s'est
-- arrêtée d'elle-même avant tout retrait (« signalé vendu sur Vinted ») — rien n'a été touché sur Vinted. Elle n'a plus
-- d'objet : close, sans message d'erreur chez la personne (décision de Nico : « aucun message ni alerte chez lui »).
-- Sauvegarde : la ligne avant dans _backup_2310_thierry_republications (colonne resultat) + ici (avant_cloture).
begin;
alter table public._backup_2310_thierry_republications add column if not exists avant_cloture jsonb;
update public._backup_2310_thierry_republications b set avant_cloture = to_jsonb(j.*) - 'description'
  from cross_post_jobs j where j.id = 'f1572407-7784-4327-a3e2-4075f2a0e76e' and (b.resultat ->> 'job_id')::uuid = j.id;
update cross_post_jobs set status = 'cancelled', error = null,
       platform_fields = coalesce(platform_fields, '{}'::jsonb) - 'needs_user_source' - 'champs_a_completer'
         || jsonb_build_object('close_par', jsonb_build_object('le', now(), 'motif', 'annonce vendue avant la republication de réparation (23/10) : rien à faire'))
 where id = 'f1572407-7784-4327-a3e2-4075f2a0e76e' and status = 'needs_user' and action = 'republish';
select id, status, error, platform_fields -> 'close_par' close_par from cross_post_jobs where id = 'f1572407-7784-4327-a3e2-4075f2a0e76e';
commit;
