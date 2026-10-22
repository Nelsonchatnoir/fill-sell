-- Tests de 20261022210000_contenu_du_vendeur (assemblés par 20261022210000_generer.sh, transaction annulée).
create temp table _r (essai text, ok boolean, detail text);
grant all on _r to public;
do $$
declare
  louis uuid := 'faf5021a-479a-4bb3-b3ec-c296770739b7';
  r jsonb; n integer; t timestamptz; rec record;
begin
  -- A. Le fournisseur de contenu : la fiche « Rouge » (texte lu le 20/10 22:20, après le dépôt LBC de 13:57)
  select * into rec from public.fiches_contenu_vendeur(louis, array[1792497207175]::bigint[]);
  insert into _r values ('A1 fiche Rouge : texte et état lus à 22:20 (après le dépôt de 13:57)',
    rec.description_lue_le > '2026-10-20 11:57:01+00' and rec.etat_lu_le > '2026-10-20 11:57:01+00' and jsonb_array_length(rec.annonces) >= 1,
    rec.description_lue_le::text || ' / ' || rec.etat_lu_le::text);
  -- B. La chaîne d'une republication LBC de louis@ remonte jusqu'au dépôt
  select j.contenu_le into t from public.jobs_contenu_origine(louis, array['f7678757-b817-4a83-acf0-c88779159d9d']::uuid[]) j;
  insert into _r values ('B1 republication : contenu daté du dépôt d''origine (bien avant la republication)', t is not null and t < '2026-10-22 16:00:00+00', coalesce(t::text, 'null'));
  -- C. La demande de lecture d'origine
  perform set_config('request.jwt.claims', json_build_object('sub', louis, 'role', 'authenticated')::text, true);
  delete from vinted_sync_runs where user_id = louis and kind = 'annonces' and platform = 'beebs' and status in ('queued','running');
  r := public.demander_lecture_origine(1792497207175);   -- releve_beebs
  insert into _r values ('C1 fiche Beebs : un relevé de veille (lecture d''origine) est posé', r ->> 'reason' = 'releve_demande', r::text);
  select count(*) into n from vinted_sync_runs where user_id = louis and platform = 'beebs' and declencheur = 'serveur:lecture_origine' and status = 'queued';
  insert into _r values ('C2 la garde « relevé sans geste » le laisse passer (veille)', n = 1, n::text);
  r := public.demander_lecture_origine(1792497207175);
  insert into _r values ('C3 redemander : pas de second relevé', r ->> 'reason' in ('releve_deja_en_file', 'releve_recent'), r::text);
  r := public.demander_lecture_origine((select id from inventaire where user_id = louis and origine = 'vinted_sync' limit 1));
  insert into _r values ('C4 fiche Vinted : la lecture est confiée à l''extension', r ->> 'reason' = 'lecture_par_l_extension', r::text);
  select count(*) into n from public.lectures_origine_en_attente();
  insert into _r values ('C5 la liste des lectures attendues la porte', n >= 2, n::text);
  r := public.demander_lecture_origine(1792681138897);   -- fiche d'un AUTRE compte (paugues)
  insert into _r values ('C6 fiche d''un autre compte : introuvable', r ->> 'reason' = 'introuvable', r::text);
  perform public.lecture_origine_faite(1792497207175);
  select count(*) into n from lectures_origine_demandees where user_id = louis and inventaire_id = 1792497207175 and faite_le is not null;
  insert into _r values ('C7 lecture faite : demande close', n = 1, n::text);
  select * into rec from public.fiches_contenu_vendeur(louis, array[1792497207175]::bigint[]);
  insert into _r values ('C8 la lecture faite se lit au départ (origine_lue_le : jamais une attente sans fin)', rec.origine_lue_le is not null, coalesce(rec.origine_lue_le::text, 'null'));
  -- Une fiche Vinted dont l'annonce a disparu du dressing ne se demande plus.

  update inventaire set disparu_le = now() where id = (select inventaire_id from lectures_origine_demandees where user_id = louis and plateforme = 'vinted' limit 1);
  select count(*) into n from public.lectures_origine_en_attente() l where l.plateforme = 'vinted';
  insert into _r values ('C9 annonce Vinted disparue : plus dans les lectures attendues', n = 0, n::text);
  perform set_config('request.jwt.claims', '', true);
end $$;
insert into _r select 'D1 releve_est_veille connaît serveur:lecture_origine', public.releve_est_veille('serveur:lecture_origine') and public.releve_est_veille('cron') and not public.releve_est_veille('app'), '';
insert into _r select 'D2 droits : fournisseur réservé au serveur', not has_function_privilege('authenticated', 'public.fiches_contenu_vendeur(uuid,bigint[])', 'execute')
  and has_function_privilege('authenticated', 'public.demander_lecture_origine(bigint)', 'execute')
  and not has_function_privilege('anon', 'public.demander_lecture_origine(bigint)', 'execute'), '';
select essai, ok, left(detail, 160) detail from _r order by essai;
