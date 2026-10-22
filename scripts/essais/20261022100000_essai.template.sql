-- Essai à blanc de 20261022100000_opla_plus_rien (22/10) : ROLLBACK, rien n'est gardé.
-- Généré par : node scripts/essais/20261022100000_essai_generer.mjs  →  scripts/essais/20261022100000_essai.sql
-- npx supabase db query --linked -f scripts/essais/20261022100000_essai.sql
-- A : structure et droits. B : XEWER (données réelles) — vente, geste « retirer », suppression de fiche.
-- C : moteur de rapprochement (annonces Opla orphelines). D : rejeu symétrique ANCIENNE / NOUVELLE fonction sur les
-- retraits armés des 7 derniers jours et sur des suppressions de fiches à copies mixtes.
begin;
set local statement_timeout = '170s';
create temp table _r (essai text, ok boolean, detail text);
grant all on _r to public;

-- Les définitions d'AVANT (prod du 22/10), sous un autre nom, pour le rejeu symétrique.
-- @@AVANT@@

-- La migration (corps exact, sans BEGIN / COMMIT).
-- @@CORPS_MIGRATION@@

-- ═══ A. Structure et droits ═════════════════════════════════════════════════
insert into _r select 'A1 dix fonctions reprises portent la règle du 22/10', count(*) = 10, count(*) || ' / 10'
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.prosrc like '%(22/10%'
   and p.proname in ('armer_retrait_job_pour', 'inventaire_arme_retraits_avant_suppression', 'garde_opla_sortie_jobs',
                     'rapprochement_v3_lire', 'rapprochement_fin_run', 'annonces_en_rangement', 'rapprochement_v3_fiche_de',
                     'rapprochement_attacher', 'rapprocher_importer', 'rapprochement_decider');
insert into _r select 'A2 opla_copie_a_retirer_noter fermée à anon et authenticated',
  not has_function_privilege('anon', 'public.opla_copie_a_retirer_noter(uuid, text)', 'execute')
  and not has_function_privilege('authenticated', 'public.opla_copie_a_retirer_noter(uuid, text)', 'execute'), '';
insert into _r select 'A3 sortie d''Opla passée (interrupteur lu)', public.opla_sortie_passee(), '';

-- ═══ B. XEWER, données réelles ══════════════════════════════════════════════
create temp table _x as select 'de63ca45-63d9-4a3c-b65a-d1345acd8b2e'::uuid u;
create temp table _avant_jobs as select id from cross_post_jobs where user_id = (select u from _x);

-- B1 Une VENTE : chaque copie Opla publiée d'une fiche vendue passe par armer_retrait_job → aucun retrait.
do $$
declare c record; r uuid; n_null int := 0; n int := 0;
begin
  for c in select j.id from cross_post_jobs j join inventaire i on i.id = j.inventaire_id
            where j.user_id = (select u from _x) and j.platform = 'opla' and j.status = 'published'
              and j.action in ('publish', 'republish') and i.statut = 'vendu' loop
    n := n + 1;
    r := public.armer_retrait_job(c.id, 'vente_article_serveur');
    if r is null then n_null := n_null + 1; end if;
  end loop;
  insert into _r values ('B1 vente : armer_retrait_job sur les copies Opla de fiches vendues → NULL', n > 0 and n_null = n, n_null || ' / ' || n);
end $$;
insert into _r select 'B2 vente : AUCUN job Opla né', count(*) = 0, count(*) || ' job(s)'
  from cross_post_jobs j where j.user_id = (select u from _x) and j.platform = 'opla' and j.id not in (select id from _avant_jobs);
-- B3 L'information posée une fois (copie dont la vente est prouvée, jamais déjà « C'est fait »).
insert into _r select 'B3 vente : information posée sur la copie (opla_a_retirer), chemin vente_article_serveur',
  count(*) > 0, count(*) || ' copie(s) marquée(s)'
  from cross_post_jobs j where j.user_id = (select u from _x) and j.platform = 'opla'
   and j.platform_fields #>> '{opla_a_retirer,chemin}' = 'vente_article_serveur';
-- B4 Deuxième passage : aucune réécriture (même date posée).
create temp table _b4 as select id, platform_fields -> 'opla_a_retirer' m from cross_post_jobs
 where user_id = (select u from _x) and platform = 'opla' and platform_fields ? 'opla_a_retirer';
do $$ declare c record; begin
  for c in select id from _b4 loop perform public.armer_retrait_job(c.id, 'vente_article_serveur'); perform public.opla_copie_a_retirer_noter(c.id, 'autre'); end loop;
end $$;
insert into _r select 'B4 deuxième passage : aucune réécriture (information unique)',
  bool_and(j.platform_fields -> 'opla_a_retirer' = b.m), count(*) || ' copie(s) relue(s)'
  from _b4 b join cross_post_jobs j on j.id = b.id;
-- B5 « C'est fait » déjà dit sur un ancien retrait clos de la même annonce : jamais d'information de plus.
insert into _r select 'B5 « C''est fait » d''avant respecté : aucune copie marquée dont un retrait porte opla_retire_par_la_personne',
  count(*) = 0, count(*) || ' copie(s) en trop'
  from cross_post_jobs j where j.user_id = (select u from _x) and j.platform = 'opla' and j.platform_fields ? 'opla_a_retirer'
   and exists (select 1 from cross_post_jobs d where d.user_id = j.user_id and d.platform = 'opla' and d.action = 'delete'
                and d.platform_fields ? 'opla_retire_par_la_personne'
                and ((j.inventaire_id is not null and d.inventaire_id = j.inventaire_id)
                     or listing_designe(coalesce(nullif(btrim(j.platform_listing_id), ''), j.listing_url), d.listing_url, d.platform_listing_id)));
-- B6 Le geste « retirer » d'une ancienne app : l'insertion d'un retrait Opla n'écrit rien.
do $$ declare c record; v uuid; begin
  select j.* into c from cross_post_jobs j where j.user_id = (select u from _x) and j.platform = 'opla' and j.status = 'published'
     and j.inventaire_id is not null and not (j.platform_fields ? 'opla_a_retirer') limit 1;
  insert into cross_post_jobs (user_id, inventaire_id, platform, action, status, photo_option, title, listing_url, platform_listing_id)
  values (c.user_id, c.inventaire_id, 'opla', 'delete', 'pending', 'original', c.title, c.listing_url, c.platform_listing_id)
  returning id into v;
  insert into _r select 'B6 ancienne app : un retrait Opla inséré n''est pas écrit', v is null and not exists (select 1 from cross_post_jobs where id = v), coalesce(v::text, 'aucune ligne');
  insert into _r select 'B7 ancienne app : l''information est posée sur la copie (retrait_demande)',
    (select platform_fields #>> '{opla_a_retirer,chemin}' from cross_post_jobs where id = c.id) = 'retrait_demande', c.id::text;
end $$;
-- B8 Une relance d'un job Opla existant reste close (comportement d'avant).
do $$ declare c uuid; s text; begin
  select id into c from cross_post_jobs where user_id = (select u from _x) and platform = 'opla' and status = 'cancelled' and action = 'delete' limit 1;
  update cross_post_jobs set status = 'pending' where id = c;
  select status into s from cross_post_jobs where id = c;
  insert into _r values ('B8 relance d''un job Opla : close comme avant', s = 'cancelled', s);
end $$;
-- B9 Suppression d'une fiche de XEWER portant une copie Opla : aucun retrait Opla, information sur la copie.
do $$ declare f bigint; c uuid; n int; ch text; begin
  select j.inventaire_id, j.id into f, c from cross_post_jobs j join inventaire i on i.id = j.inventaire_id
   where j.user_id = (select u from _x) and j.platform = 'opla' and j.status = 'published' and i.statut = 'stock'
     and not (j.platform_fields ? 'opla_a_retirer')
     and not exists (select 1 from cross_post_jobs d where d.user_id = j.user_id and d.platform = 'opla' and d.action = 'delete'
                      and d.platform_fields ? 'opla_retire_par_la_personne'
                      and (d.inventaire_id = j.inventaire_id or listing_designe(coalesce(nullif(btrim(j.platform_listing_id), ''), j.listing_url), d.listing_url, d.platform_listing_id)))
   order by i.created_at desc limit 1;
  begin
    delete from inventaire where id = f;
  exception when others then
    insert into _r values ('B9 suppression d''une fiche', false, 'erreur : ' || sqlerrm); return;
  end;
  select count(*) into n from cross_post_jobs where user_id = (select u from _x) and platform = 'opla' and action = 'delete' and id not in (select id from _avant_jobs);
  select platform_fields #>> '{opla_a_retirer,chemin}' into ch from cross_post_jobs where id = c;
  insert into _r values ('B9 suppression d''une fiche : aucun retrait Opla, information sur la copie', n = 0 and ch = 'suppression_article', 'fiche ' || f || ', retraits ' || n || ', chemin ' || coalesce(ch, '-'));
end $$;

-- ═══ C. Moteur de rapprochement : annonces Opla orphelines ══════════════════
create temp table _orph as select a.* from annonces_plateforme a
 where a.user_id = (select u from _x) and a.platform = 'opla' and a.inventaire_id is null and a.disparu_le is null and a.ignoree_le is null;
insert into _r select 'C0 XEWER : annonces Opla orphelines présentes (données de l''essai)', count(*) > 0, count(*) || ' orpheline(s)' from _orph;
do $$ declare a record; r jsonb; n_ok int := 0; n int := 0; f bigint; j uuid; n_f int := 0; n_j int := 0; begin
  for a in select * from _orph loop
    n := n + 1;
    r := public.rapprocher_importer(a.user_id, a.id, 'rapprochement');
    if r ->> 'reason' = 'opla_sortie' and coalesce((r ->> 'ok')::boolean, false) = false then n_ok := n_ok + 1; end if;
    f := public.rapprochement_v3_fiche_de(a.user_id, a.id, true); if f is null then n_f := n_f + 1; end if;
    j := public.rapprochement_attacher(a.id, (select id from inventaire where user_id = a.user_id and statut = 'stock' limit 1), 'essai'); if j is null then n_j := n_j + 1; end if;
  end loop;
  insert into _r values ('C1 rapprocher_importer refuse (opla_sortie)', n > 0 and n_ok = n, n_ok || ' / ' || n);
  insert into _r values ('C2 rapprochement_v3_fiche_de : jamais une fiche neuve', n_f = n, n_f || ' / ' || n);
  insert into _r values ('C3 rapprochement_attacher : jamais un job Opla neuf', n_j = n, n_j || ' / ' || n);
end $$;
insert into _r select 'C4 aucune fiche ni job Opla créés par le moteur', count(*) = 0, count(*) || ''
  from cross_post_jobs j where j.user_id = (select u from _x) and j.platform = 'opla' and j.id not in (select id from _avant_jobs);
do $$ declare r jsonb; a uuid; n int; begin
  perform set_config('request.jwt.claims', json_build_object('sub', (select u from _x)::text, 'role', 'authenticated')::text, true);
  select id into a from _orph limit 1;
  r := public.rapprochement_decider(a, 'import');
  insert into _r values ('C5 rapprochement_decider (la personne) : import refusé', r ->> 'reason' = 'opla_sortie', r::text);
  r := public.rapprochement_decider(a, 'attache', (select id from inventaire where user_id = (select u from _x) and statut = 'stock' limit 1));
  insert into _r values ('C6 rapprochement_decider (la personne) : rattachement refusé', r ->> 'reason' = 'opla_sortie', left(r::text, 120));
  select count(*) into n from public.annonces_en_rangement() x where x.platform = 'opla';
  insert into _r values ('C7 annonces_en_rangement : plus aucune annonce Opla', n = 0, n || '');
  perform set_config('request.jwt.claims', '', true);
end $$;
-- C8 Rejeu symétrique de la lecture du moteur : la seule différence = les annonces Opla orphelines.
do $$ declare u uuid; av jsonb; ap jsonb; n_av int; n_ap int; n_o int; n_comptes int := 0; n_bons int := 0; det text := ''; begin
  for u in select distinct a.user_id from annonces_plateforme a where a.platform = 'opla' and a.inventaire_id is null and a.disparu_le is null limit 6 loop
    av := public._avant_rapprochement_v3_lire(u) -> 'annonces'; ap := public.rapprochement_v3_lire(u) -> 'annonces';
    n_av := jsonb_array_length(coalesce(av, '[]')); n_ap := jsonb_array_length(coalesce(ap, '[]'));
    select count(*) into n_o from annonces_plateforme a where a.user_id = u and a.platform = 'opla' and a.inventaire_id is null and a.disparu_le is null
       and not (a.url is not null and annonce_lien_notification(a.url));
    n_comptes := n_comptes + 1;
    -- Toute annonce de la nouvelle lecture est dans l'ancienne, à l'identique ; l'écart = les orphelines Opla.
    if n_av - n_ap = n_o and not exists (select 1 from jsonb_array_elements(ap) e where not (av @> jsonb_build_array(e))) then n_bons := n_bons + 1;
    else det := det || u::text || ' ' || n_av || '→' || n_ap || ' (orphelines ' || n_o || ') ; '; end if;
  end loop;
  insert into _r values ('C8 rejeu de rapprochement_v3_lire : seules les orphelines Opla disparaissent', n_comptes > 0 and n_bons = n_comptes, n_bons || ' / ' || n_comptes || ' compte(s) ' || det);
end $$;
-- C9 Sans annonce Opla, la lecture est identique (comptes sans Opla ; chaque liste triée : jsonb_agg n'a pas d'ordre).
create function public._essai_lecture_triee(x jsonb) returns jsonb language sql immutable as $f$
  select coalesce(jsonb_object_agg(k, case when jsonb_typeof(v) = 'array'
           then (select coalesce(jsonb_agg(e order by e::text), '[]'::jsonb) from jsonb_array_elements(v) e) else v end), '{}'::jsonb)
    from jsonb_each(x) t(k, v)
$f$;
do $$ declare u uuid; n int := 0; n_id int := 0; begin
  for u in select distinct a.user_id from annonces_plateforme a where a.platform in ('leboncoin', 'beebs') and a.inventaire_id is null and a.disparu_le is null
            and not exists (select 1 from annonces_plateforme o where o.user_id = a.user_id and o.platform = 'opla') limit 5 loop
    n := n + 1;
    if public._essai_lecture_triee(public._avant_rapprochement_v3_lire(u)) = public._essai_lecture_triee(public.rapprochement_v3_lire(u)) then n_id := n_id + 1; end if;
  end loop;
  insert into _r values ('C9 comptes sans Opla : lecture du moteur identique', n > 0 and n_id = n, n_id || ' / ' || n);
end $$;

-- ═══ D. Rejeu symétrique : retraits armés (7 jours) et suppressions de fiches à copies mixtes ══════════════
create temp table _rejeu (cas text, depot uuid, platform text, avant text, apres text);
-- D1 Les dépôts des retraits armés par armer_retrait_job ces 7 derniers jours (toutes plateformes) : le retrait est
-- effacé dans la transaction, puis l'ANCIENNE et la NOUVELLE fonction sont jouées chacune dans un sous-bloc annulé.
do $$ declare d record; r_av text; r_ap text; v_prep text; begin
  for d in select distinct on (nullif(x.platform_fields #>> '{arme_par,depot}', '')::uuid) x.id retrait,
                  nullif(x.platform_fields #>> '{arme_par,depot}', '')::uuid depot, x.platform, x.platform_fields #>> '{arme_par,chemin}' chemin
             from cross_post_jobs x
            where x.action = 'delete' and x.created_at > now() - interval '7 days'
              and x.platform_fields #>> '{arme_par,pose_par}' like 'armer_retrait_job%'
              and nullif(x.platform_fields #>> '{arme_par,depot}', '') is not null
            order by nullif(x.platform_fields #>> '{arme_par,depot}', '')::uuid, x.created_at desc
            limit 150 loop
    r_av := null; r_ap := null; v_prep := null;
    begin
      delete from cross_post_jobs where id = d.retrait;
      update cross_post_jobs set status = 'published' where id = d.depot and status <> 'published';
      begin
        r_av := coalesce(public._avant_armer_retrait_job_pour(d.depot, d.chemin, null, false)::text, 'null');
        r_av := case when r_av = 'null' then 'null' else 'retrait:' || (select status from cross_post_jobs where id = r_av::uuid) end;
        raise exception 'annule';
      exception when raise_exception then null; when others then r_av := 'erreur:' || sqlerrm; end;
      begin
        r_ap := coalesce(public.armer_retrait_job_pour(d.depot, d.chemin, null, false)::text, 'null');
        r_ap := case when r_ap = 'null' then 'null' else 'retrait:' || (select status from cross_post_jobs where id = r_ap::uuid) end;
        raise exception 'annule';
      exception when raise_exception then null; when others then r_ap := 'erreur:' || sqlerrm; end;
      raise exception 'annule_cas';
    exception when raise_exception then null;
      when others then v_prep := sqlerrm;
    end;
    -- Écrit APRÈS le sous-bloc annulé (sinon la ligne partirait avec lui).
    if v_prep is not null then insert into _rejeu values ('D1_prep', d.depot, d.platform, 'erreur_preparation', v_prep);
    else insert into _rejeu values ('D1', d.depot, d.platform, r_av, r_ap); end if;
  end loop;
end $$;
insert into _r select 'D1 retraits des 7 jours rejoués (toutes plateformes)', count(*) > 0, count(*) || ' dépôt(s) : '
  || coalesce(string_agg(distinct platform || ' ' || avant || '→' || apres, ' | '), '') from _rejeu where cas = 'D1';
insert into _r select 'D1b préparations en erreur', count(*) = 0, count(*) || ' ' || coalesce(string_agg(apres, ' ; '), '') from _rejeu where cas = 'D1_prep';
insert into _r select 'D2 hors Opla : ancienne et nouvelle fonction rendent la même chose', count(*) = 0,
  count(*) || ' écart(s) ' || coalesce(string_agg(depot::text || ' ' || avant || '→' || apres, ' ; '), '')
  from _rejeu where cas = 'D1' and platform <> 'opla' and avant is distinct from apres;
insert into _r select 'D3 Opla : aucun retrait né (la nouvelle fonction rend NULL ; l''ancienne, sous la nouvelle garde, n''écrit rien non plus)', bool_and(apres = 'null'),
  count(*) || ' dépôt(s) Opla : ' || coalesce(string_agg(distinct avant || '→' || apres, ' | '), '')
  from _rejeu where cas = 'D1' and platform = 'opla';
-- D4 Suppression de fiches EN STOCK à copies mixtes (Opla + autre plateforme) : ancien filet / nouveau filet.
create temp table _d4_avant as select id from cross_post_jobs where action = 'delete' and created_at = now();
do $$ declare f record; av text; ap text; begin
  for f in select i.id, i.user_id from inventaire i
            where i.statut = 'stock' and i.fusionne_dans is null
              and exists (select 1 from cross_post_jobs o where o.inventaire_id = i.id and o.platform = 'opla' and o.status = 'published')
              and exists (select 1 from cross_post_jobs o where o.inventaire_id = i.id and o.platform <> 'opla' and o.status = 'published'
                             and o.action in ('publish', 'republish') and nullif(btrim(o.listing_url), '') is not null)
            order by i.created_at desc limit 25 loop
    begin
      execute (select definition from _defs_avant where nom = 'inventaire_arme_retraits_avant_suppression');
      delete from inventaire where id = f.id;
      select string_agg(platform || ':' || status, ',' order by platform) into av from cross_post_jobs
       where user_id = f.user_id and action = 'delete' and created_at = now() and platform_fields ? 'filet_suppression_serveur'
         and id not in (select id from _d4_avant);
      raise exception 'annule';
    exception when raise_exception then null; when others then av := 'erreur:' || sqlerrm; end;
    begin
      delete from inventaire where id = f.id;
      select string_agg(platform || ':' || status, ',' order by platform) into ap from cross_post_jobs
       where user_id = f.user_id and action = 'delete' and created_at = now() and platform_fields ? 'filet_suppression_serveur'
         and id not in (select id from _d4_avant);
      raise exception 'annule';
    exception when raise_exception then null; when others then ap := 'erreur:' || sqlerrm; end;
    insert into _rejeu values ('D4', null, f.id::text, coalesce(av, '-'), coalesce(ap, '-'));
  end loop;
end $$;
insert into _r select 'D4 suppressions rejouées (fiches à copies Opla + autre)', count(*) > 0, count(*) || ' fiche(s) : '
  || coalesce(string_agg(distinct avant || '→' || apres, ' | '), '') from _rejeu where cas = 'D4';
insert into _r select 'D5 suppression : les retraits hors Opla sont identiques, seul le retrait Opla disparaît', count(*) = 0,
  count(*) || ' écart(s) ' || coalesce(string_agg(platform || ' ' || avant || '→' || apres, ' ; '), '')
  from _rejeu where cas = 'D4'
   and regexp_replace(regexp_replace(avant, '(^|,)opla:[a-z]+', '', 'g'), '^,', '') is distinct from apres
   and not (avant = 'opla:cancelled' and apres = '-');

select essai, ok, left(detail, 400) detail from _r order by essai;
rollback;
