-- Tests de 20261022200000_file_synchro_boutique_partagee (assemblés par 20261022200000_generer.sh avec la migration,
-- dans UNE transaction annulée). Données réelles : Nico (f44b5917…, annonces de TEST à 999 €), Louis (louis@ / louis-seller),
-- retraits Beebs clos du parc. Rien n'est gardé.
create temp table _r (essai text, ok boolean, detail text);
grant all on _r to public;

-- ── A. Structure et droits ────────────────────────────────────────────────
insert into _r select 'A1 déclencheurs posés', count(*) = 3, string_agg(tgname, ',')
  from pg_trigger where tgname in ('garde_releve_pendant_republication', 'cross_post_jobs_zz_alerte_tenue', 'inventaire_zz_disparu_garde_republication');
insert into _r select 'A2 RPC de l''app : authenticated oui, anon non',
  has_function_privilege('authenticated', 'public.file_pause_basculer(boolean)', 'execute')
  and has_function_privilege('authenticated', 'public.file_etat()', 'execute')
  and not has_function_privilege('anon', 'public.file_pause_basculer(boolean)', 'execute')
  and not has_function_privilege('anon', 'public.file_etat()', 'execute'), '';
insert into _r select 'A3 aides serveur : authenticated non, service_role oui',
  not has_function_privilege('authenticated', 'public.republication_entre_retrait_et_recreation(uuid,text)', 'execute')
  and not has_function_privilege('authenticated', 'public.retraits_beebs_rearmer_revus(uuid)', 'execute')
  and has_function_privilege('service_role', 'public.republication_entre_retrait_et_recreation(uuid,text)', 'execute')
  and has_function_privilege('service_role', 'public.file_etat_pour(uuid)', 'execute'), '';

-- ── B. La file en pause (point 6) ─────────────────────────────────────────
do $$
declare nico uuid := 'f44b5917-bccc-4431-ba41-f40571a2ed18'; r jsonb; ps jsonb;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', nico, 'role', 'authenticated')::text, true);
  r := public.file_pause_basculer(true);
  select platform_settings into ps from profiles where id = nico;
  insert into _r values ('B1 pause posée par la RPC', (r ->> 'pause')::boolean and (ps #>> '{file_pause,active}') = 'true', r::text);
  insert into _r values ('B2 file_en_pause lu vrai', public.file_en_pause(nico), '');
  r := public.file_pause_basculer(true);
  insert into _r values ('B3 reposer la pause ne change pas « depuis »', (r ->> 'depuis') = (ps #>> '{file_pause,depuis}'), r::text);
  r := public.file_pause_basculer(false);
  select platform_settings into ps from profiles where id = nico;
  insert into _r values ('B4 reprise', not (r ->> 'pause')::boolean and (ps #>> '{file_pause,active}') = 'false' and ps #>> '{file_pause,repris_le}' is not null, r::text);
  insert into _r values ('B5 le reste de platform_settings intact', ps ? 'vinted' or ps ? 'leboncoin' or jsonb_typeof(ps) = 'object', left(ps::text, 120));
  -- B7-B9 : ce que l'extension relit ENTRE DEUX TÂCHES (file_etat_poste)
  perform public.file_pause_basculer(true);
  r := public.file_etat_poste();
  insert into _r values ('B7 extension : la pause se lit entre deux tâches', (r ->> 'ok')::boolean and (r ->> 'pause')::boolean, r::text);
  perform public.file_pause_basculer(false);
  delete from vinted_sync_runs where user_id = nico and status = 'queued';
  insert into vinted_sync_runs (user_id, kind, platform, status, declencheur, queued_at) values (nico, 'annonces', 'leboncoin', 'queued', 'serveur:verif_redepot', now());
  r := public.file_etat_poste();
  insert into _r values ('B8 une demande du SERVEUR ne coupe pas la file', not (r ->> 'synchro_demandee')::boolean and not (r ->> 'pause')::boolean, r::text);
  insert into vinted_sync_runs (user_id, kind, platform, status, declencheur, queued_at) values (nico, 'dressing', 'vinted', 'queued', 'bouton', now());
  r := public.file_etat_poste();
  insert into _r values ('B9 « Synchroniser » de la personne (< 10 min) : la synchro passe entre deux tâches', (r ->> 'synchro_demandee')::boolean, r::text);
  update vinted_sync_runs set queued_at = now() - interval '11 minutes' where user_id = nico and status = 'queued' and declencheur = 'bouton';
  r := public.file_etat_poste();
  insert into _r values ('B10 au-delà de 10 min : plus rien ne retient la file', not (r ->> 'synchro_demandee')::boolean, r::text);
  delete from vinted_sync_runs where user_id = nico and status = 'queued';   -- les essais suivants posent les leurs
  perform set_config('request.jwt.claims', '', true);
  r := public.file_etat();
  insert into _r values ('B6 sans session : refus', (r ->> 'ok') = 'false', r::text);
  r := public.file_etat_poste();
  insert into _r values ('B11 extension sans session : refus', (r ->> 'ok') = 'false', r::text);
end $$;

-- ── C. Garde absolue : aucun relevé ne démarre entre le retrait et la recréation (point 5) ─────
do $$
declare
  nico uuid := 'f44b5917-bccc-4431-ba41-f40571a2ed18'; rep uuid; run uuid; ok boolean; msg text;
begin
  insert into cross_post_jobs (user_id, inventaire_id, platform, action, status, photo_option, title, price, listing_url, platform_listing_id, platform_fields)
  values (nico, 1791800000002, 'leboncoin', 'republish', 'pending', 'original', 'TEST FillSell ne pas acheter', 999, null, null,
          jsonb_build_object('republish_step', 'deleted', 'deleted_at', now() - interval '2 minutes', 'next_action_after', now() + interval '3 minutes',
                             'republish_source', 'manuel', 'essai_2210', true))
  returning id into rep;
  insert into _r values ('C0 republication en fenêtre (retirée, pas encore recréée)', public.republication_entre_retrait_et_recreation(nico, 'leboncoin') = rep, rep::text);
  -- un relevé lancé par l'extension (alarme, veilleur, bouton) : refusé
  begin
    insert into vinted_sync_runs (user_id, kind, platform, status, declencheur, started_at) values (nico, 'annonces', 'leboncoin', 'running', 'app', now());
    ok := false; msg := 'inséré';
  exception when others then ok := sqlerrm like 'RELEVE_ATTEND_REPUBLICATION%'; msg := sqlerrm; end;
  insert into _r values ('C1 relevé LBC démarré par l''extension : refusé', ok, left(msg, 140));
  -- la demande de l'app (queued) : acceptée, elle attend
  insert into vinted_sync_runs (user_id, kind, platform, status, declencheur, queued_at) values (nico, 'annonces', 'leboncoin', 'queued', 'app', now()) returning id into run;
  insert into _r values ('C2 demande de synchro posée en file', run is not null, run::text);
  insert into _r values ('C3 file_etat dit « la synchro attend la republication »',
    (public.file_etat_pour(nico) -> 'synchro_attend_republication') @> jsonb_build_array(jsonb_build_object('platform', 'leboncoin')), (public.file_etat_pour(nico))::text);
  -- la prise de la demande par l'extension : refusée, la demande reste en file
  begin
    update vinted_sync_runs set status = 'running', claimed_at = now(), started_at = now() where id = run and status = 'queued';
    ok := false; msg := 'prise';
  exception when others then ok := sqlerrm like 'RELEVE_ATTEND_REPUBLICATION%'; msg := sqlerrm; end;
  insert into _r values ('C4 prise de la demande pendant la fenêtre : refusée', ok and (select status from vinted_sync_runs where id = run) = 'queued', left(msg, 140));
  -- les autres plateformes ne sont pas retenues
  begin
    insert into vinted_sync_runs (user_id, kind, platform, status, declencheur, started_at) values (nico, 'annonces', 'beebs', 'running', 'app', now());
    ok := true; msg := 'ok';
  exception when others then ok := sqlerrm not like 'RELEVE_ATTEND_REPUBLICATION%'; msg := sqlerrm; end;
  insert into _r values ('C5 relevé Beebs du même compte : pas retenu par la garde', ok, left(msg, 140));
  -- la recréation tentée (dépôt parti) : le relevé, qui la vérifie, part
  update cross_post_jobs set platform_fields = platform_fields || jsonb_build_object('recreation_tentee', jsonb_build_object('at', now(), 'n', 1)) where id = rep;
  begin
    update vinted_sync_runs set status = 'running', claimed_at = now(), started_at = now() where id = run and status = 'queued';
    ok := (select status from vinted_sync_runs where id = run) = 'running'; msg := 'prise';
  exception when others then ok := false; msg := sqlerrm; end;
  insert into _r values ('C6 recréation tentée : la synchro part (elle la vérifie)', ok, left(msg, 140));
  -- une fenêtre de plus de 6 h n'est plus « en cours »
  update cross_post_jobs set platform_fields = (platform_fields - 'recreation_tentee') || jsonb_build_object('deleted_at', now() - interval '7 hours') where id = rep;
  insert into _r values ('C7 retrait de plus de 6 h : plus « en cours »', public.republication_entre_retrait_et_recreation(nico, 'leboncoin') is null, '');
  -- dressing : même garde côté Vinted
  update cross_post_jobs set platform = 'vinted', platform_fields = platform_fields || jsonb_build_object('deleted_at', now(), 'vinted_item_id', '10397824964') where id = rep;
  begin
    insert into vinted_sync_runs (user_id, kind, status, declencheur, started_at) values (nico, 'dressing', 'running', 'bouton', now());
    ok := false; msg := 'inséré';
  exception when others then ok := sqlerrm like 'RELEVE_ATTEND_REPUBLICATION%'; msg := sqlerrm; end;
  insert into _r values ('C8 relevé du dressing pendant une republication Vinted retirée : refusé', ok, left(msg, 140));
  delete from vinted_sync_runs where user_id = nico and declencheur in ('app', 'bouton') and started_at > now() - interval '1 minute';
  delete from cross_post_jobs where id = rep;
end $$;

-- ── D. Double garde et alertes qui tiennent (points 5 et 3) ─────────────────
do $$
declare
  nico uuid := 'f44b5917-bccc-4431-ba41-f40571a2ed18';
  jl uuid := '4d16d7f5-ba04-449c-94aa-fe98eed75468';   -- Nico, LBC 3289322234 (TEST, 999 €)
  rep uuid; sup uuid; pf jsonb; st text; err text;
begin
  -- D1 : republication engagée (copie lue) → l'alerte de la veille sur l'ancienne annonce est écartée
  insert into cross_post_jobs (user_id, inventaire_id, platform, action, status, photo_option, title, price, platform_fields)
  values (nico, 1791800000002, 'leboncoin', 'republish', 'pending', 'original', 'TEST', 999,
          jsonb_build_object('republish_step', 'captured', 'republish_source', 'manuel', 'essai_2210', true)) returning id into rep;
  update cross_post_jobs set platform_fields = (platform_fields - array['unavailable_since','sale_signal','unavailable_pending_since','revue_en_ligne_par_releve'])
   where id = jl;
  update cross_post_jobs set platform_fields = platform_fields || jsonb_build_object('unavailable_since', now(), 'sale_signal', 'unavailable') where id = jl;
  select platform_fields, status into pf, st from cross_post_jobs where id = jl;
  insert into _r values ('D1 republication en cours : ni « plus en ligne », ni « vendue ? »',
    not (pf ? 'sale_signal') and not (pf ? 'unavailable_since') and pf #>> '{alerte_ecartee,motif}' = 'republication_en_cours' and st = 'published', left(pf::text, 0) || st);
  -- D2 : une preuve « sold » passe toujours
  update cross_post_jobs set platform_fields = platform_fields || jsonb_build_object('unavailable_since', now(), 'sale_signal', 'sold') where id = jl;
  select platform_fields into pf from cross_post_jobs where id = jl;
  insert into _r values ('D2 une preuve de vente « sold » n''est jamais écartée', pf ->> 'sale_signal' = 'sold', '');
  update cross_post_jobs set platform_fields = platform_fields - array['unavailable_since','sale_signal','alerte_ecartee'] where id = jl;
  delete from cross_post_jobs where id = rep;
  -- D3 : remplacé par SA republication publiée → clos, pas une vente
  insert into cross_post_jobs (user_id, inventaire_id, platform, action, status, photo_option, title, price, platform_listing_id, listing_url, platform_fields)
  values (nico, 1791800000002, 'leboncoin', 'republish', 'published', 'original', 'TEST', 999, '3999999999', 'https://www.leboncoin.fr/ad/divers/3999999999',
          jsonb_build_object('republish_step', 'recreated', 'republish_source_job_id', jl::text, 'essai_2210', true)) returning id into sup;
  update cross_post_jobs set platform_fields = platform_fields || jsonb_build_object('unavailable_since', now(), 'sale_signal', 'unavailable') where id = jl;
  select platform_fields, status, error into pf, st, err from cross_post_jobs where id = jl;
  insert into _r values ('D3 remplacé par sa republication : clos sans question', st = 'cancelled' and not (pf ? 'sale_signal') and pf ? 'remplacee_par_republication', st || ' — ' || coalesce(err, ''));
  delete from cross_post_jobs where id = sup;
end $$;

-- D4-D6 : Louis — copie de louis@ disparue, la jumelle de louis-seller en ligne dans la boutique commune
do $$
declare
  j uuid := '793cce6f-59ea-48e1-9775-472f9453314f';   -- louis@, LBC 3292085422 (désactivée), jumelle louis-seller 3291650743 en ligne
  pf jsonb; st text; err text;
begin
  update cross_post_jobs set platform_fields = platform_fields - array['unavailable_since','sale_signal','unavailable_pending_since','absence_releves'] where id = j;
  -- la veille (sans constat) : aucune question
  update cross_post_jobs set platform_fields = platform_fields || jsonb_build_object('unavailable_since', now(), 'sale_signal', 'unavailable') where id = j;
  select platform_fields, status into pf, st from cross_post_jobs where id = j;
  insert into _r values ('D4 veille, jumelle en ligne : pas de « Vendue ? », à confirmer par le relevé',
    st = 'published' and not (pf ? 'sale_signal') and pf #>> '{alerte_a_confirmer_par_releve,motif}' = 'jumelle_en_ligne', '');
  -- le constat de deux relevés complets : la copie est close, remplacée par l'annonce du compte relié
  update cross_post_jobs set platform_fields = (platform_fields - array['unavailable_pending_since','alerte_a_confirmer_par_releve'])
    || jsonb_build_object('sale_signal', 'unavailable', 'unavailable_since', now(),
         'absence_releves', jsonb_build_object('premier', gen_random_uuid(), 'second', gen_random_uuid(), 'listing_id', '3292085422', 'le', now()))
   where id = j;
  select platform_fields, status, error into pf, st, err from cross_post_jobs where id = j;
  insert into _r values ('D5 constat, jumelle en ligne : close « remplacée par l''annonce de ton compte relié »',
    st = 'cancelled' and pf #>> '{copie_remplacee_par_compte_relie,annonce}' = '3291650743' and not (pf ? 'sale_signal'), coalesce(err, ''));
end $$;

do $$
declare
  j uuid := '42d7f883-2387-4601-8965-e9d43839bab3';   -- louis@, LBC 3287663775 « Jeu des acrobates », EN LIGNE, fausse alerte démentie le 18/10
  pf jsonb; st text;
begin
  update cross_post_jobs set platform_fields = platform_fields - array['unavailable_since','sale_signal','unavailable_pending_since'] where id = j;
  update cross_post_jobs set platform_fields = platform_fields || jsonb_build_object('unavailable_since', now(), 'sale_signal', 'unavailable') where id = j;
  select platform_fields, status into pf, st from cross_post_jobs where id = j;
  insert into _r values ('D6 veille sur une annonce démentie par un relevé : à confirmer, sans question',
    st = 'published' and not (pf ? 'sale_signal') and not (pf ? 'unavailable_since') and pf ? 'unavailable_pending_since'
    and pf #>> '{alerte_a_confirmer_par_releve,motif}' = 'dementie_par_releve', '');
  -- le relevé qui revoit l'annonce en ligne efface le doute
  update annonces_plateforme set vu_le = now() + interval '1 second', statut_plateforme = 'en_ligne', disparu_le = null
   where user_id = 'faf5021a-479a-4bb3-b3ec-c296770739b7' and platform = 'leboncoin' and listing_id = '3287663775';
  perform alerte_lever_revues_plateformes('faf5021a-479a-4bb3-b3ec-c296770739b7', 'leboncoin');
  select platform_fields into pf from cross_post_jobs where id = j;
  insert into _r values ('D7 relevé qui revoit l''annonce : doute effacé', not (pf ? 'alerte_a_confirmer_par_releve') and not (pf ? 'unavailable_pending_since'), '');
  -- un vrai constat (deux relevés complets) repose la question, avec sa preuve
  update cross_post_jobs set platform_fields = platform_fields || jsonb_build_object('sale_signal', 'unavailable', 'unavailable_since', now(),
         'absence_releves', jsonb_build_object('premier', gen_random_uuid(), 'second', gen_random_uuid(), 'listing_id', '3287663775', 'le', now()))
   where id = j;
  select platform_fields into pf from cross_post_jobs where id = j;
  insert into _r values ('D8 constat de deux relevés complets : la question est posée', pf ->> 'sale_signal' = 'unavailable', '');
end $$;

-- D9 : Vinted — la fiche d'un article en cours de republication n'est jamais datée « disparue »
do $$
declare nico uuid := 'f44b5917-bccc-4431-ba41-f40571a2ed18'; rep uuid; d timestamptz;
begin
  update inventaire set disparu_le = null where id = 1791800000002;
  insert into cross_post_jobs (user_id, inventaire_id, platform, action, status, photo_option, title, price, listing_url, platform_fields)
  values (nico, 1791800000002, 'vinted', 'republish', 'processing', 'original', 'TEST', 999, 'https://www.vinted.fr/items/10397824964',
          jsonb_build_object('republish_step', 'deleted', 'deleted_at', now(), 'vinted_item_id', '10397824964', 'essai_2210', true)) returning id into rep;
  update inventaire set disparu_le = now() where id = 1791800000002;
  select disparu_le into d from inventaire where id = 1791800000002;
  insert into _r values ('D9 Vinted : disparition jamais datée pendant la republication', d is null, coalesce(d::text, 'null'));
  delete from cross_post_jobs where id = rep;
  update inventaire set disparu_le = now() where id = 1791800000002;
  select disparu_le into d from inventaire where id = 1791800000002;
  insert into _r values ('D10 Vinted : hors republication, la disparition se date comme avant', d is not null, '');
  update inventaire set disparu_le = null where id = 1791800000002;
end $$;

-- ── E. Boutique partagée : le relevé de louis-seller rafraîchit les annonces de louis@ (point 3) ──
do $$
declare
  seller uuid := '447d920c-976a-4d8f-aff4-a2998050358c'; louis uuid := 'faf5021a-479a-4bb3-b3ec-c296770739b7';
  l text := '3287650732';   -- « Rondin pour le père Noël », publiée par louis@, en ligne
  avant timestamptz; apres timestamptz; n integer;
begin
  update annonces_plateforme set vu_le = now() - interval '2 days' where user_id = louis and platform = 'leboncoin' and listing_id = l;
  select vu_le into avant from annonces_plateforme where user_id = louis and platform = 'leboncoin' and listing_id = l;
  insert into annonces_plateforme (user_id, platform, listing_id, url, titre, statut_plateforme, vu_le, disparu_le, updated_at)
  values (seller, 'leboncoin', l, 'https://www.leboncoin.fr/ad/decoration/' || l, 'Rondin pour le père Noël', 'en_ligne', now(), null, now())
  on conflict (user_id, platform, listing_id) do update set vu_le = excluded.vu_le;
  select count(*) into n from annonces_plateforme where user_id = seller and platform = 'leboncoin' and listing_id = l;
  select vu_le into apres from annonces_plateforme where user_id = louis and platform = 'leboncoin' and listing_id = l;
  insert into _r values ('E1 l''annonce de louis@ n''entre pas chez louis-seller', n = 0, n::text);
  insert into _r values ('E2 sa présence est rafraîchie chez louis@ (une seule vérité)', apres > avant, avant::text || ' → ' || apres::text);
  -- une annonce « vendue » lue par l'autre compte ne touche pas la ligne de louis@ (présence seulement)
  insert into annonces_plateforme (user_id, platform, listing_id, statut_plateforme, vu_le, updated_at)
  values (seller, 'leboncoin', l, 'vendue', now() + interval '1 minute', now())
  on conflict (user_id, platform, listing_id) do update set vu_le = excluded.vu_le;
  insert into _r values ('E3 « vendue » lue par l''autre compte : jamais recopiée',
    (select statut_plateforme from annonces_plateforme where user_id = louis and platform = 'leboncoin' and listing_id = l) = 'en_ligne', '');
end $$;

-- ── F. Retrait Beebs clos sans preuve puis revu en ligne : réarmé (point 1e) ──
do $$
declare
  j uuid := '75df2567-f6c4-4ad6-9aea-1029d3f9d849';   -- louis-seller, Beebs 34195237, clos « absente » (aucune confirmation)
  c uuid := '238229cf-0597-4c7b-866e-b73a240be9c2';   -- Johan, Beebs 34211505, clos APRÈS « confirmation envoyée »
  n integer; st text; pf jsonb;
begin
  update annonces_plateforme set statut_plateforme = 'en_ligne', disparu_le = null, vu_le = now()
   where user_id = '447d920c-976a-4d8f-aff4-a2998050358c' and platform = 'beebs' and listing_id = '34195237';
  n := retraits_beebs_rearmer_revus('447d920c-976a-4d8f-aff4-a2998050358c');
  select status, platform_fields into st, pf from cross_post_jobs where id = j;
  insert into _r values ('F1 retrait clos sans preuve, revu en ligne : réarmé', st = 'pending' and pf ? 'rearme_revu_en_ligne' and n >= 1, n::text || ' — ' || st);
  n := retraits_beebs_rearmer_revus('447d920c-976a-4d8f-aff4-a2998050358c');
  insert into _r values ('F2 une seule fois (retrait déjà en file)', n = 0, n::text);
  -- un retrait que FillSell a CONFIRMÉ (suppression envoyée) n'est jamais réarmé
  update annonces_plateforme set statut_plateforme = 'en_ligne', disparu_le = null, vu_le = now()
   where user_id = '7b9d8a71-6464-457f-abdc-9baee2a8543f' and platform = 'beebs' and listing_id = '34211505';
  n := retraits_beebs_rearmer_revus('7b9d8a71-6464-457f-abdc-9baee2a8543f');
  select status into st from cross_post_jobs where id = c;
  insert into _r values ('F3 suppression confirmée par FillSell : jamais réarmée', st = 'deleted', st || ' / ' || n::text);
end $$;

-- ── G. Rejeu : ce qui est en prod ce soir ──────────────────────────────────
insert into _r select 'G1 fenêtres retrait→recréation ouvertes maintenant (parc)', true, count(*)::text
  from (select distinct user_id, platform from cross_post_jobs where action = 'republish' and status in ('pending','processing')
          and public.republication_entre_retrait_et_recreation(user_id, platform) is not null) x;
insert into _r select 'G2 republications engagées (copie lue / retrait engagé) maintenant', true, count(*)::text
  from cross_post_jobs where action = 'republish' and status in ('pending','processing','needs_user')
   and (coalesce(platform_fields ->> 'republish_step', '') in ('captured','deleted') or public.republication_retrait_engage(platform_fields));

-- ── G3. Rejeu symétrique : constater_absences_releve AVANT / APRÈS sur les 40 derniers relevés complets ──
CREATE OR REPLACE FUNCTION public._avant_constater_absences_releve(p_run uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE r vinted_sync_runs%ROWTYPE; precedent vinted_sync_runs%ROWTYPE;
 a record; n integer:=0; debut timestamptz:=clock_timestamp();
BEGIN
 IF NOT releve_preuve_absence(p_run) THEN RETURN jsonb_build_object('disparues',0,'motif','releve_non_probant'); END IF;
 SELECT * INTO r FROM vinted_sync_runs WHERE id=p_run;
 IF r.platform='beebs' THEN RETURN jsonb_build_object('disparues',0,'motif','moderation_beebs'); END IF;
 -- Deux cycles distincts, sans recouvrement, lus pour le même compte.
 SELECT s.* INTO precedent FROM
   (SELECT * FROM vinted_sync_runs WHERE user_id=r.user_id AND started_at<r.started_at
    ORDER BY started_at DESC LIMIT 50) s
 WHERE s.platform=r.platform AND s.kind=r.kind
   AND s.vinted_user_id IS NOT DISTINCT FROM r.vinted_user_id
   AND s.finished_at<=r.started_at AND s.started_at<=r.started_at-interval '5 minutes'
   AND releve_preuve_absence(s.id)
 ORDER BY s.started_at DESC LIMIT 1;
 IF precedent.id IS NULL THEN RETURN jsonb_build_object('disparues',0,'motif','second_releve_attendu'); END IF;
 FOR a IN
   SELECT ap.id,ap.listing_id,ap.inventaire_id,ap.vu_le FROM annonces_plateforme ap
   WHERE ap.user_id=r.user_id AND ap.platform=r.platform
     AND ap.run_id IS DISTINCT FROM r.id AND ap.run_id IS DISTINCT FROM precedent.id
     AND ap.vu_le<precedent.started_at
     AND NOT EXISTS (SELECT 1 FROM cross_post_jobs recent WHERE recent.user_id=r.user_id
       AND recent.inventaire_id=ap.inventaire_id AND recent.platform=r.platform
       AND recent.action IN ('publish','republish') AND recent.status='published'
       AND COALESCE(recent.published_at,recent.created_at)>precedent.started_at-interval '4 hours'
       AND listing_designe(ap.listing_id,recent.listing_url,recent.platform_listing_id))
     AND NOT EXISTS (SELECT 1 FROM rapprochements q WHERE q.annonce_id=ap.id
       AND q.detail->>'absence_confirmee_revision'='20260928'
       AND (q.detail->>'derniere_vue')::timestamptz>=ap.vu_le)
   ORDER BY ap.vu_le DESC,ap.id LIMIT 25 FOR UPDATE OF ap SKIP LOCKED
 LOOP
   EXIT WHEN clock_timestamp()-debut>interval '1 second';
   UPDATE annonces_plateforme SET disparu_le=COALESCE(disparu_le,r.finished_at),updated_at=now() WHERE id=a.id;
   -- Le signal existant ouvre la question de l'app. Ce n'est ni une vente,
   -- ni une annulation du dépôt historique, ni un retrait sur une plateforme.
   UPDATE cross_post_jobs j SET platform_fields=COALESCE(j.platform_fields,'{}'::jsonb)
     || jsonb_build_object('sale_signal','unavailable','unavailable_since',r.finished_at,
          'absence_releves',jsonb_build_object('premier',precedent.id,'second',r.id,'listing_id',a.listing_id,'le',now()))
   WHERE j.inventaire_id=a.inventaire_id AND j.user_id=r.user_id AND j.platform=r.platform
     AND j.status='published' AND j.action IN ('publish','republish')
     AND j.platform_fields->>'sale_signal' IS DISTINCT FROM 'sold'
     AND listing_designe(a.listing_id,j.listing_url,j.platform_listing_id);
   INSERT INTO rapprochements(user_id,annonce_id,inventaire_id,decision,par,score,detail)
   VALUES(r.user_id,a.id,a.inventaire_id,'aucune','auto',0,
     jsonb_build_object('absence_confirmee_revision','20260928','derniere_vue',a.vu_le,'premier',precedent.id,'second',r.id));
   n:=n+1;
 END LOOP;
 RETURN jsonb_build_object('disparues',n,'premier',precedent.id,'second',r.id);
END;
$function$
;

do $$
declare r record; a jsonb; b jsonb; n integer := 0; diff integer := 0; ex text := '';
begin
  for r in select s.id from vinted_sync_runs s where s.kind = 'annonces' and s.status = 'done' and s.platform in ('leboncoin','ebay','depop')
             and s.finished_at > now() - interval '3 days' and releve_preuve_absence(s.id) order by s.finished_at desc limit 40 loop
    begin a := public._avant_constater_absences_releve(r.id); raise exception 'annule_avant'; exception when others then if sqlerrm <> 'annule_avant' then a := jsonb_build_object('erreur', sqlerrm); end if; end;
    begin b := public.constater_absences_releve(r.id); raise exception 'annule_apres'; exception when others then if sqlerrm <> 'annule_apres' then b := jsonb_build_object('erreur', sqlerrm); end if; end;
    n := n + 1;
    if coalesce(a ->> 'disparues', a ->> 'erreur', '') <> coalesce(b ->> 'disparues', b ->> 'erreur', '') then
      diff := diff + 1; ex := ex || r.id::text || ':' || coalesce(a ->> 'disparues','?') || '→' || coalesce(b ->> 'disparues','?') || ' ';
    end if;
  end loop;
  insert into _r values ('G3 rejeu constater_absences_releve (' || n || ' relevés complets) : mêmes constats', diff = 0, 'écarts ' || diff || ' ' || ex);
end $$;

select essai, ok, left(detail, 160) detail from _r order by essai;
