-- Essai à blanc de 20261022110000_leboncoin_achat_en_cours_vente (22/10) : ROLLBACK, rien n'est gardé.
-- Généré par : node scripts/essais/20261022110000_essai_generer.mjs  →  scripts/essais/20261022110000_essai.sql
-- npx supabase db query --linked -f scripts/essais/20261022110000_essai.sql
-- A : structure et droits. B : parcours complet sur une vraie fiche de Sébastien (en stock, copie Leboncoin + copie
-- Vinted) : relevé « pending » → preuve → vente enregistrée par le cron des ventes prouvées → retrait Vinted armé,
-- annonce Leboncoin jamais retirée ; puis achat annulé → vente retirée, fiche au stock, retrait arrêté, job rouvert.
-- C : les gardes (déjà déclarée, plusieurs exemplaires, relecture sans changement, « sold » → rien, valeur inconnue).
-- D : rejeu sur le parc (30 jours) — chaque annonce lue « pending » / « sold » repassée en fantôme : ce que la règle
-- aurait fait, et AUCUNE écriture sur un job ; coût mesuré d'un relevé de 381 annonces.
begin;
set local statement_timeout = '170s';
create temp table _r (essai text, ok boolean, detail text);
grant all on _r to public;

-- @@CORPS_MIGRATION@@

-- ═══ A. Structure et droits ═════════════════════════════════════════════════
insert into _r select 'A1 colonnes transaction_plateforme / transaction_lue_le', count(*) = 2, count(*) || ' / 2'
  from information_schema.columns where table_schema = 'public' and table_name = 'annonces_plateforme'
   and column_name in ('transaction_plateforme', 'transaction_lue_le');
-- (Le droit de table d'anon sur annonces_plateforme est antérieur : la RLS ne lui donne AUCUNE ligne — seule la
-- politique annonces_plateforme_propres, pour authenticated, sur user_id = auth.uid().)
insert into _r select 'A2 authenticated lit et écrit les colonnes ; RLS active, anon sans politique (aucune ligne)',
  has_column_privilege('authenticated', 'public.annonces_plateforme', 'transaction_plateforme', 'UPDATE')
  and has_column_privilege('authenticated', 'public.annonces_plateforme', 'transaction_plateforme', 'SELECT')
  and (select relrowsecurity from pg_class where oid = 'public.annonces_plateforme'::regclass)
  and not exists (select 1 from pg_policy p where p.polrelid = 'public.annonces_plateforme'::regclass
                   and (p.polroles @> array['anon'::regrole::oid] or p.polroles @> array[0::oid])), '';
insert into _r select 'A3 fonctions fermées à anon / authenticated',
  not has_function_privilege('authenticated', 'public.leboncoin_transaction_noter(uuid, text, text)', 'execute')
  and not has_function_privilege('anon', 'public.leboncoin_transaction_noter(uuid, text, text)', 'execute')
  and not has_function_privilege('authenticated', 'public.vente_transaction_annulee_leboncoin(bigint, text)', 'execute'), '';
insert into _r select 'A4 lecture : colonne > capture ; capture sans attribut = aucune ; rien de lu = NULL',
  leboncoin_transaction_lue('pending', null) = 'pending'
  and leboncoin_transaction_lue(null, '{"attributs_bruts":[{"key":"transaction_status","value":"pending"}]}') = 'pending'
  and leboncoin_transaction_lue(null, '{"attributs_bruts":[{"key":"condition","value":"bon"}]}') = 'aucune'
  and leboncoin_transaction_lue(null, '{"photos":[]}') is null and leboncoin_transaction_lue(null, null) is null
  and leboncoin_transaction_lue(' SOLD ', '{"attributs_bruts":[]}') = 'sold', '';
insert into _r select 'A5 interrupteur posé à 1 (règle active)', (select value from coin_config where key = 'ventes_leboncoin_transaction') = 1, '';

-- ═══ B. Parcours complet, vraie fiche de Sébastien ══════════════════════════
create temp table _b as
select i.user_id u, i.id inv, j.id job_lbc, btrim(j.platform_listing_id) lid, a.id annonce, v.id job_vinted
  from inventaire i
  join cross_post_jobs j on j.inventaire_id = i.id and j.platform = 'leboncoin' and j.status = 'published'
   and j.action in ('publish', 'republish') and nullif(btrim(j.platform_listing_id), '') is not null
  join annonces_plateforme a on a.user_id = i.user_id and a.platform = 'leboncoin' and a.listing_id = btrim(j.platform_listing_id)
   and a.statut_plateforme = 'en_ligne' and a.disparu_le is null
  join cross_post_jobs v on v.inventaire_id = i.id and v.platform = 'vinted' and v.status = 'published' and v.action in ('publish', 'republish')
 where i.statut = 'stock' and coalesce(i.quantite, 1) = 1 and i.fusionne_dans is null and i.user_id = '48dd94f7-3105-49a7-af54-24d9c479a980'
   and coalesce(j.platform_fields ->> 'sale_signal', '') = '' and retrait_job_prouve(j.id) and retrait_job_prouve(v.id)
   and fiche_annonces_vivantes(i.id, 'leboncoin') < 2 and fiche_annonces_vivantes(i.id, 'vinted') < 2
   and leboncoin_transaction_lue(a.transaction_plateforme, a.capture) is distinct from 'pending'
 limit 1;
insert into _r select 'B0 fiche réelle trouvée (Sébastien, en stock, Leboncoin + Vinted)', count(*) = 1, coalesce(max(inv::text), '-') from _b;
-- B1 Le relevé lit « pending » (extension ≥ 0.6.129 : la colonne).
update annonces_plateforme set transaction_plateforme = 'pending', transaction_lue_le = now() where id = (select annonce from _b);
insert into _r select 'B1 relevé « pending » → preuve exacte sur LE job Leboncoin',
  j.platform_fields ->> 'sale_signal' = 'sold' and j.platform_fields #>> '{sale_evidence,source}' = 'transaction_leboncoin'
  and j.platform_fields #>> '{sale_evidence,exact}' = 'true' and j.platform_fields #>> '{sale_evidence,listing_id}' = b.lid
  and not (j.platform_fields ? 'unavailable_since'),
  coalesce(j.platform_fields ->> 'sale_evidence', '-') from _b b join cross_post_jobs j on j.id = b.job_lbc;
insert into _r select 'B2 la règle laisse sa trace (usage_logs vente_leboncoin_transaction, issue prouvee)',
  count(*) = 1, string_agg(metadata ->> 'issue', ',') from usage_logs where feature = 'vente_leboncoin_transaction'
   and created_at = now() and metadata ->> 'annonce' = (select annonce::text from _b);
-- B3 Le cron des ventes prouvées voit la preuve et enregistre la vente (même fonction que ventes_prouvees_tick).
insert into _r select 'B3 ventes_prouvees_a_enregistrer voit la preuve', count(*) = 1, coalesce(max(preuve), '-')
  from ventes_prouvees_a_enregistrer('-infinity'::timestamptz, 5, (select u from _b), (select job_lbc from _b), true);
create temp table _b4 as select public.enregistrer_vente_prouvee((select job_lbc from _b)) r;
insert into _r select 'B4 vente enregistrée « Leboncoin »', (r ->> 'ok')::boolean and (r ->> 'issue') = 'enregistree', left(r::text, 200) from _b4;
insert into _r select 'B5 la vente porte la plateforme leboncoin et le numéro de l''annonce',
  count(*) = 1, string_agg(v.plateforme_code || ' ' || coalesce(v.annonce_id, '-'), ',')
  from ventes v where v.user_id = (select u from _b) and v.inventaire_id = (select inv from _b) and v.created_at = now();
insert into _r select 'B6 fiche vendue, job Leboncoin « sold », AUCUN retrait Leboncoin',
  (select statut from inventaire where id = b.inv) = 'vendu' and (select status from cross_post_jobs where id = b.job_lbc) = 'sold'
  and not exists (select 1 from cross_post_jobs d where d.inventaire_id = b.inv and d.action = 'delete' and d.platform = 'leboncoin'), '' from _b b;
insert into _r select 'B7 retrait Vinted armé tout de suite (vente_article_serveur)', count(*) = 1,
  string_agg(d.status || ' ' || coalesce(d.platform_fields #>> '{arme_par,chemin}', '-'), ',')
  from cross_post_jobs d where d.inventaire_id = (select inv from _b) and d.action = 'delete' and d.platform = 'vinted' and d.created_at = now();
-- B8 Jamais deux ventes : la règle rejouée, la vente rejouée, le cron rejoué.
do $$ declare r jsonb; n int; begin
  update annonces_plateforme set transaction_plateforme = 'sold', transaction_lue_le = now() where id = (select annonce from _b);
  r := public.enregistrer_vente_prouvee((select job_lbc from _b));
  select count(*) into n from ventes v where v.user_id = (select u from _b) and v.inventaire_id = (select inv from _b);
  insert into _r values ('B8 « pending » → « sold », vente rejouée : toujours UNE vente', n = 1 and coalesce(r ->> 'issue', '') <> 'enregistree', n || ' vente(s), ' || coalesce(r ->> 'issue', '-'));
  update annonces_plateforme set transaction_plateforme = 'pending', transaction_lue_le = now() where id = (select annonce from _b);
end $$;
-- B9 L'achat est annulé : l'annonce relue EN LIGNE sans transaction après « pending ».
update annonces_plateforme set transaction_plateforme = 'aucune', transaction_lue_le = now() where id = (select annonce from _b);
insert into _r select 'B9 achat annulé : vente retirée, fiche au stock', not exists (select 1 from ventes v where v.inventaire_id = b.inv)
  and (select statut from inventaire where id = b.inv) = 'stock', '' from _b b;
insert into _r select 'B10 achat annulé : le retrait Vinted encore en file est arrêté (annonce restée en ligne)', bool_and(d.status = 'cancelled'),
  string_agg(d.status, ',') from cross_post_jobs d where d.inventaire_id = (select inv from _b) and d.action = 'delete' and d.platform = 'vinted' and d.created_at = now();
insert into _r select 'B11 achat annulé : job Leboncoin rouvert (published), preuve et reçu levés',
  j.status = 'published' and not (j.platform_fields ? 'sale_signal') and j.platform_fields ? 'vente_annulee'
  and not exists (select 1 from ventes_operations o where o.user_id = b.u and o.cle = 'annonce:leboncoin:' || b.lid), j.status
  from _b b join cross_post_jobs j on j.id = b.job_lbc;
insert into _r select 'B12 achat annulé : trace (ventes_supprimees + vente_retiree)', count(*) = 1, count(*) || ''
  from ventes_supprimees s where s.user_id = (select u from _b) and s.annonce_id = (select lid from _b) and s.supprimee_le = now();
-- B13 Un nouvel achat de la même annonce s'enregistre de nouveau (le reçu est tombé avec la vente).
update annonces_plateforme set transaction_plateforme = 'pending', transaction_lue_le = now() where id = (select annonce from _b);
create temp table _b13 as select public.enregistrer_vente_prouvee((select job_lbc from _b)) r;
insert into _r select 'B13 nouvel achat de la même annonce : vente de nouveau enregistrée', (r ->> 'issue') = 'enregistree', left(r::text, 120) from _b13;

-- ═══ C. Les gardes ══════════════════════════════════════════════════════════
-- C1 Vente DÉJÀ déclarée par la personne (fiche vendue) : rien. C2 l'annulation ne retire JAMAIS une saisie.
do $$ declare c record; n_av int; n_ap int; r jsonb; v bigint; begin
  select i.id inv, j.id job, btrim(j.platform_listing_id) lid, a.id annonce, i.user_id u into c
    from inventaire i
    join cross_post_jobs j on j.inventaire_id = i.id and j.platform = 'leboncoin' and j.status = 'published' and j.action in ('publish', 'republish')
    join annonces_plateforme a on a.user_id = i.user_id and a.platform = 'leboncoin' and a.listing_id = btrim(j.platform_listing_id) and a.statut_plateforme = 'en_ligne'
   where i.statut = 'stock' and coalesce(i.quantite, 1) = 1 and i.user_id = '48dd94f7-3105-49a7-af54-24d9c479a980'
     and i.id <> (select inv from _b) and coalesce(j.platform_fields ->> 'sale_signal', '') = ''
     and leboncoin_transaction_lue(a.transaction_plateforme, a.capture) is distinct from 'pending' limit 1;
  -- La personne déclare la vente (même chemin que l'app : enregistrer_vente_atomique sur la fiche, clé « manuel: »).
  perform set_config('request.jwt.claims', json_build_object('sub', c.u::text, 'role', 'authenticated')::text, true);
  r := public.enregistrer_vente_atomique(c.u, 'essai-2210', c.inv, null, 7, 0, 1, 1, 'Leboncoin');
  perform set_config('request.jwt.claims', '', true);
  select count(*) into n_av from ventes where inventaire_id = c.inv;
  update annonces_plateforme set transaction_plateforme = 'pending', transaction_lue_le = now() where id = c.annonce;
  select count(*) into n_ap from ventes where inventaire_id = c.inv;
  insert into _r values ('C1 déjà déclarée à la main : aucune preuve posée, jamais deux ventes',
    n_av = 1 and n_ap = 1 and not exists (select 1 from cross_post_jobs where id = c.job and platform_fields ->> 'sale_signal' = 'sold'),
    'ventes ' || n_av || '→' || n_ap || ' ; issue ' || coalesce((select metadata ->> 'issue' from usage_logs where feature = 'vente_leboncoin_transaction' and metadata ->> 'annonce' = c.annonce::text and created_at = now() order by id desc limit 1), '-'));
  update annonces_plateforme set transaction_plateforme = 'aucune', transaction_lue_le = now() where id = c.annonce;
  select count(*) into n_ap from ventes where inventaire_id = c.inv;
  insert into _r values ('C2 achat annulé sur une vente SAISIE : la vente reste', n_ap = 1, n_ap || ' vente(s)');
end $$;
-- C3 Relecture sans changement : aucune trace de plus (seule une transition agit).
do $$ declare n0 int; n1 int; begin
  select count(*) into n0 from usage_logs where feature = 'vente_leboncoin_transaction' and created_at = now();
  update annonces_plateforme set transaction_plateforme = transaction_plateforme, vu_le = now()
   where user_id = '48dd94f7-3105-49a7-af54-24d9c479a980' and platform = 'leboncoin';
  update annonces_plateforme set capture = capture where user_id = '48dd94f7-3105-49a7-af54-24d9c479a980' and platform = 'leboncoin' and capture is not null;
  select count(*) into n1 from usage_logs where feature = 'vente_leboncoin_transaction' and created_at = now();
  insert into _r values ('C3 relevé qui relit la même transaction : rien', n0 = n1, n0 || ' → ' || n1);
end $$;
-- C4 « sold » → sans transaction : rien n'est conclu ; C5 valeur inconnue : aucune vente.
do $$ declare r jsonb; a uuid; begin
  select id into a from annonces_plateforme where user_id = '48dd94f7-3105-49a7-af54-24d9c479a980' and platform = 'leboncoin' and statut_plateforme = 'en_ligne'
     and id <> (select annonce from _b) limit 1;
  r := public.leboncoin_transaction_noter(a, 'aucune', 'sold');
  insert into _r values ('C4 « sold » → sans transaction : sans effet', r ->> 'issue' = 'sans_effet', r::text);
  r := public.leboncoin_transaction_noter(a, 'reserved', 'aucune');
  insert into _r values ('C5 valeur inconnue : aucune vente, une trace', r ->> 'issue' = 'valeur_inconnue', r::text);
end $$;
-- C6 Plusieurs exemplaires (pro) : rien ; C7 Vinted, eBay, Beebs, Depop : le déclencheur ne les voit jamais.
do $$ declare c record; r jsonb; begin
  select a.id annonce, i.id inv into c from annonces_plateforme a
    join cross_post_jobs j on j.user_id = a.user_id and j.platform = 'leboncoin' and j.status = 'published' and btrim(j.platform_listing_id) = a.listing_id
    join inventaire i on i.id = j.inventaire_id and i.statut = 'stock'
   where a.platform = 'leboncoin' and a.statut_plateforme = 'en_ligne' and coalesce(i.quantite, 1) > 1 limit 1;
  if c.annonce is not null then
    r := public.leboncoin_transaction_noter(c.annonce, 'pending', 'aucune');
    insert into _r values ('C6 plusieurs exemplaires : aucune preuve', r ->> 'issue' = 'plusieurs_exemplaires', r::text);
  else
    insert into _r values ('C6 plusieurs exemplaires : aucune preuve', true, 'aucun cas au parc (contrôle sans objet)');
  end if;
end $$;
insert into _r select 'C7 le déclencheur ne vise que Leboncoin', pg_get_triggerdef(t.oid) like '%WHEN ((new.platform = ''leboncoin''::text))%', ''
  from pg_trigger t where t.tgname = 'annonces_plateforme_transaction_leboncoin';

-- C8 La note de vente : « Achat en cours » suit la règle commune (note née), « Vendu » (transaction terminée) n'en
-- crée aucune — jamais un mail pour une vente d'avant la lecture.
do $$ declare c record; n_p int; n_s int; begin
  for c in select i.id inv, j.id job, a.id annonce, row_number() over () k
             from inventaire i
             join cross_post_jobs j on j.inventaire_id = i.id and j.platform = 'leboncoin' and j.status = 'published' and j.action in ('publish', 'republish')
             join annonces_plateforme a on a.user_id = i.user_id and a.platform = 'leboncoin' and a.listing_id = btrim(j.platform_listing_id) and a.statut_plateforme = 'en_ligne'
            where i.statut = 'stock' and coalesce(i.quantite, 1) = 1 and i.user_id = '48dd94f7-3105-49a7-af54-24d9c479a980'
              and i.id <> (select inv from _b) and coalesce(j.platform_fields ->> 'sale_signal', '') = ''
              and retrait_job_prouve(j.id) and fiche_annonces_vivantes(i.id, 'leboncoin') < 2
              and leboncoin_transaction_lue(a.transaction_plateforme, a.capture) is distinct from 'pending'
            limit 2 loop
    update cross_post_jobs set last_checked_at = now() - interval '1 hour' where id = c.job;   -- veille récente
    perform public.leboncoin_transaction_noter(c.annonce, case when c.k = 1 then 'pending' else 'sold' end, 'aucune');
    if c.k = 1 then select count(*) into n_p from push_ventes where job_id = c.job;
    else select count(*) into n_s from push_ventes where job_id = c.job; end if;
  end loop;
  insert into _r values ('C8 note de vente : « Achat en cours » oui, « Vendu » (terminée) non', n_p = 1 and n_s = 0, 'pending ' || n_p || ' note(s), sold ' || n_s);
end $$;

-- ═══ D. Rejeu sur le parc (30 jours), en FANTÔME : ce que la règle aurait fait, aucune écriture ═══════════════
update coin_config set value = 0 where key = 'ventes_leboncoin_transaction';
create temp table _d_avant as select id, platform_fields from cross_post_jobs where platform = 'leboncoin' and status = 'published';
create temp table _d (annonce uuid, tx text, issue text);
do $$ declare a record; r jsonb; begin
  for a in select x.id, leboncoin_transaction_lue(x.transaction_plateforme, x.capture) tx from annonces_plateforme x
            where x.platform = 'leboncoin' and coalesce(x.capture_le, x.vu_le) > now() - interval '30 days'
              and leboncoin_transaction_lue(x.transaction_plateforme, x.capture) in ('pending', 'sold') loop
    r := public.leboncoin_transaction_noter(a.id, a.tx, 'aucune');
    insert into _d values (a.id, a.tx, r ->> 'issue');
  end loop;
end $$;
insert into _r select 'D1 parc 30 j : annonces lues « pending » / « sold » rejouées', count(*) > 0,
  count(*) || ' : ' || coalesce((select string_agg(tx || ' ' || issue || ' ' || n, ' | ' order by tx, n desc) from (select tx, issue, count(*) n from _d group by 1, 2) z), '')
  from _d;
insert into _r select 'D2 fantôme : AUCUN job Leboncoin modifié', count(*) = 0, count(*) || ' écart(s)'
  from cross_post_jobs j join _d_avant d on d.id = j.id where j.platform_fields is distinct from d.platform_fields;
-- D3 Coût : un relevé de 381 annonces (Sébastien) qui réécrit la transaction et la capture, inchangées.
do $$ declare t0 timestamptz := clock_timestamp(); n int; begin
  update annonces_plateforme set transaction_plateforme = coalesce(transaction_plateforme, 'aucune'), vu_le = now()
   where user_id = '48dd94f7-3105-49a7-af54-24d9c479a980' and platform = 'leboncoin';
  get diagnostics n = row_count;
  insert into _r values ('D3 coût : relevé complet réécrit (381 annonces) sous 1 s', clock_timestamp() - t0 < interval '1 second',
    n || ' annonces en ' || round(extract(epoch from clock_timestamp() - t0) * 1000) || ' ms');
end $$;

select essai, ok, left(detail, 500) detail from _r order by essai;
rollback;
