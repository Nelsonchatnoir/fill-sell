-- Tests de 20261023150000_remplacee_par_compte_relie_boutiques_distinctes (assemblés par 20261023150000_generer.sh, ROLLBACK).
-- Les 16 questions Beebs de louis@ (closes le 23/10 à 18:28) sont recréées ici à l'identique, en copies, dans la
-- transaction annulée : la situation telle qu'elle était, avec la règle.
create temp table _r (essai text, ok boolean, detail text);
grant all on _r to public;
create temp table _syn (id uuid, attendue text, fiche bigint);
do $$
declare
  louis  uuid := 'faf5021a-479a-4bb3-b3ec-c296770739b7';
  seller uuid := '447d920c-976a-4d8f-aff4-a2998050358c';
  b record; v jsonb; v_id uuid; s0 record; n integer; n2 integer; n3 integer; t0 timestamptz; ms numeric;
  v_txt text; v_ok boolean; n_ret_avant integer; n_ret_apres integer; n_pv_avant integer; n_pv_apres integer;
  n_mail_avant integer; n_mail_apres integer;
begin
  -- 0. Les 16 questions, recopiées telles qu'avant leur clôture (dépôts publiés, question ouverte).
  for b in select k.job, k.annonce_remplacante, k.inventaire_id, k.pf_avant from public._backup_2310_soir_louis_questions k order by k.annonce loop
    insert into cross_post_jobs (user_id, inventaire_id, platform, status, photo_option, title, price, platform_listing_id,
                                 published_at, created_at, listing_url, last_checked_at, platform_fields, action, voie, vu_en_ligne_le)
    select j.user_id, j.inventaire_id, j.platform, 'published', j.photo_option, j.title, j.price, j.platform_listing_id,
           j.published_at, j.created_at, j.listing_url, j.last_checked_at, b.pf_avant, 'publish', j.voie, j.vu_en_ligne_le
      from cross_post_jobs j where j.id = b.job
    returning id into v_id;
    insert into _syn values (v_id, b.annonce_remplacante, b.inventaire_id);
  end loop;
  select count(*) into n from _syn;
  insert into _r values ('A0 16 questions recréées (copies)', n = 16, n::text);

  -- 1. La preuve tient pour chacune, et nomme l'annonce de louis-seller qui la remplace.
  select count(*) filter (where public.remplacee_par_compte_relie(s.id) ->> 'annonce' = s.attendue) into n from _syn s;
  insert into _r values ('P1 16/16 : remplacée par l''annonce de louis-seller attendue', n = 16, n || ' / 16');
  select * into s0 from _syn order by attendue limit 1;
  v := public.remplacee_par_compte_relie(s0.id);
  insert into _r values ('P1b preuve lisible (ancienne, relevé d''absence, apparue après)',
    v ? 'releve_absence' and (v ->> 'apparue_le')::timestamptz > (v ->> 'ancienne_vue_le')::timestamptz, left(v::text, 150));

  -- 2. Tous les autres cas : la question reste posée.
  -- N2 deux annonces en ligne en même temps (l'ancienne vue en ligne après l'apparition de la nouvelle)
  insert into cross_post_jobs (user_id, inventaire_id, platform, status, photo_option, title, platform_listing_id, published_at, created_at,
                               listing_url, platform_fields, action, voie, vu_en_ligne_le)
  select user_id, inventaire_id, platform, 'published', photo_option, title, platform_listing_id, published_at, created_at,
         listing_url, platform_fields, 'publish', voie, now() - interval '2 hours' from cross_post_jobs where id = s0.id returning id into v_id;
  insert into _r values ('N2 coexistence (vente possible sur l''ancienne boutique) : question gardée', public.remplacee_par_compte_relie(v_id) is null, '');
  -- N4 question plus récente que tout relevé complet de louis@ : absence non prouvée
  insert into cross_post_jobs (user_id, inventaire_id, platform, status, photo_option, title, platform_listing_id, published_at, created_at,
                               listing_url, platform_fields, action, voie, vu_en_ligne_le)
  select user_id, inventaire_id, platform, 'published', photo_option, title, platform_listing_id, published_at, created_at,
         listing_url, platform_fields || jsonb_build_object('unavailable_since', now()), 'publish', voie, vu_en_ligne_le
    from cross_post_jobs where id = s0.id returning id into v_id;
  insert into _r values ('N4 absence pas encore prouvée par un relevé complet : question gardée', public.remplacee_par_compte_relie(v_id) is null, '');
  -- N7 preuve de vente (sale_signal sold) / N7b sale_evidence
  insert into cross_post_jobs (user_id, inventaire_id, platform, status, photo_option, title, platform_listing_id, published_at, created_at,
                               listing_url, platform_fields, action, voie, vu_en_ligne_le)
  select user_id, inventaire_id, platform, 'published', photo_option, title, platform_listing_id, published_at, created_at,
         listing_url, platform_fields || '{"sale_signal": "sold"}'::jsonb, 'publish', voie, vu_en_ligne_le
    from cross_post_jobs where id = s0.id returning id into v_id;
  insert into _r values ('N7 preuve de vente : jamais tranchée par la règle', public.remplacee_par_compte_relie(v_id) is null, '');
  insert into cross_post_jobs (user_id, inventaire_id, platform, status, photo_option, title, platform_listing_id, published_at, created_at,
                               listing_url, platform_fields, action, voie, vu_en_ligne_le)
  select user_id, inventaire_id, platform, 'published', photo_option, title, platform_listing_id, published_at, created_at,
         listing_url, platform_fields || '{"sale_evidence": {"source": "essai"}}'::jsonb, 'publish', voie, vu_en_ligne_le
    from cross_post_jobs where id = s0.id returning id into v_id;
  insert into _r values ('N7b trace de vente sur le dépôt : question gardée', public.remplacee_par_compte_relie(v_id) is null, '');
  -- N13 l'ancienne annonce revue par un relevé APRÈS la question
  insert into cross_post_jobs (user_id, inventaire_id, platform, status, photo_option, title, platform_listing_id, published_at, created_at,
                               listing_url, platform_fields, action, voie, vu_en_ligne_le)
  select user_id, inventaire_id, platform, 'published', photo_option, title, platform_listing_id, published_at, created_at,
         listing_url, platform_fields || jsonb_build_object('unavailable_since', '2026-10-18T06:00:00+00:00'), 'publish', voie, null
    from cross_post_jobs where id = s0.id returning id into v_id;
  insert into _r values ('N13 ancienne annonce revue en ligne après la question : question gardée', public.remplacee_par_compte_relie(v_id) is null, '');

  -- Les cas qui touchent des données partagées : chacun dans un sous-bloc annulé (exception), résultat porté par variable.
  -- N1 l'annonce de louis-seller vue en ligne il y a plus de 48 h
  begin
    update annonces_plateforme set vu_le = now() - interval '49 hours' where user_id = seller and platform = 'beebs' and listing_id = s0.attendue;
    v_ok := public.remplacee_par_compte_relie(s0.id) is null;
    raise exception 'annuler';
  exception when others then if sqlerrm <> 'annuler' then v_ok := null; v_txt := sqlerrm; end if;
  end;
  insert into _r values ('N1 pas vue en ligne par un relevé récent (49 h) : question gardée', v_ok, coalesce(v_txt, ''));
  -- N6 l'annonce de louis-seller elle-même sous alerte
  v_txt := null;
  begin
    update cross_post_jobs set platform_fields = platform_fields || jsonb_build_object('unavailable_pending_since', now())
     where user_id = seller and platform = 'beebs' and status = 'published' and platform_listing_id = s0.attendue;
    v_ok := public.remplacee_par_compte_relie(s0.id) is null;
    raise exception 'annuler';
  exception when others then if sqlerrm <> 'annuler' then v_ok := null; v_txt := sqlerrm; end if;
  end;
  insert into _r values ('N6 annonce du compte relié elle-même sous alerte : question gardée', v_ok, coalesce(v_txt, ''));
  -- N6b l'article chez louis-seller vu par le relevé mais SANS dépôt FillSell publié (rattachement non structurel)
  v_txt := null;
  begin
    update cross_post_jobs set status = 'cancelled'
     where user_id = seller and platform = 'beebs' and status = 'published' and platform_listing_id = s0.attendue;
    v_ok := public.remplacee_par_compte_relie(s0.id) is null;
    raise exception 'annuler';
  exception when others then if sqlerrm <> 'annuler' then v_ok := null; v_txt := sqlerrm; end if;
  end;
  insert into _r values ('N6b annonce relevée sans dépôt FillSell : question gardée', v_ok, coalesce(v_txt, ''));
  -- N5 même article sans lien de fiche (titre identique, jamais suffisant)
  v_txt := null;
  begin
    delete from fiches_liees_comptes where fiche_a = s0.fiche or fiche_b = s0.fiche;
    v_ok := public.remplacee_par_compte_relie(s0.id) is null;
    raise exception 'annuler';
  exception when others then if sqlerrm <> 'annuler' then v_ok := null; v_txt := sqlerrm; end if;
  end;
  insert into _r values ('N5 sans fiche liée (le titre ne suffit jamais) : question gardée', v_ok, coalesce(v_txt, ''));
  -- N9 comptes non reliés
  v_txt := null;
  begin
    delete from comptes_lies where user_a = least(louis, seller) and user_b = greatest(louis, seller);
    v_ok := public.remplacee_par_compte_relie(s0.id) is null;
    raise exception 'annuler';
  exception when others then if sqlerrm <> 'annuler' then v_ok := null; v_txt := sqlerrm; end if;
  end;
  insert into _r values ('N9 comptes non reliés : question gardée', v_ok, coalesce(v_txt, ''));
  -- N11 boutique PARTAGÉE : la règle d'avant (branche 3) reste seule, celle-ci ne s'en mêle pas
  v_txt := null;
  begin
    insert into sync_import_ecartes (user_id, vinted_item_id, motif) values (louis, 'essai', 'compte_relie:beebs');
    v_ok := public.remplacee_par_compte_relie(s0.id) is null;
    raise exception 'annuler';
  exception when others then if sqlerrm <> 'annuler' then v_ok := null; v_txt := sqlerrm; end if;
  end;
  insert into _r values ('N11 boutique partagée : règle inchangée (pas celle-ci)', v_ok, coalesce(v_txt, ''));
  -- N8 plusieurs unités sur la fiche : deux annonces peuvent être deux exemplaires
  v_txt := null;
  begin
    update inventaire set quantite = 2 where id = s0.fiche;
    v_ok := public.remplacee_par_compte_relie(s0.id) is null;
    raise exception 'annuler';
  exception when others then if sqlerrm <> 'annuler' then v_ok := null; v_txt := sqlerrm; end if;
  end;
  insert into _r values ('N8 fiche à 2 unités : question gardée', v_ok, coalesce(v_txt, ''));
  -- N3 l'ancienne annonce relevée « vendue »
  v_txt := null;
  begin
    update annonces_plateforme set statut_plateforme = 'vendue'
     where user_id = louis and platform = 'beebs'
       and listing_id = (public.remplacee_par_compte_relie(s0.id) ->> 'ancienne');
    v_ok := public.remplacee_par_compte_relie(s0.id) is null;
    raise exception 'annuler';
  exception when others then if sqlerrm <> 'annuler' then v_ok := null; v_txt := sqlerrm; end if;
  end;
  insert into _r values ('N3 ancienne annonce relevée « vendue » : question gardée', v_ok, coalesce(v_txt, ''));

  -- N10 Vinted : jamais (sa propre règle) ; L1 Leboncoin de Louis (boutique partagée) : rien ne bouge
  select count(*) into n from cross_post_jobs j where j.user_id = louis and j.platform = 'vinted' and j.status = 'published'
     and j.platform_fields ? 'unavailable_since' and public.remplacee_par_compte_relie(j.id) is not null;
  insert into _r values ('N10 Vinted : aucune question tranchée par la règle', n = 0 and public.questions_remplacees_par_compte_relie(louis, 'vinted') = 0, n::text);
  select count(*), count(*) filter (where public.remplacee_par_compte_relie(j.id) is not null) into n, n2 from cross_post_jobs j
   where j.user_id in (louis, seller) and j.platform = 'leboncoin' and j.status = 'published' and j.platform_fields ? 'unavailable_since';
  insert into _r values ('L1 Leboncoin de Louis (boutique partagée) : questions intactes', n2 = 0, n || ' questions, ' || n2 || ' tranchées');

  -- N12 un compte sans compte relié : sortie immédiate
  t0 := clock_timestamp();
  select count(*) into n from (select public.questions_remplacees_par_compte_relie(p.id, 'leboncoin') x from profiles p
                                where p.id not in (louis, seller) order by p.id limit 50) z where z.x > 0;
  ms := round(extract(epoch from clock_timestamp() - t0) * 1000, 1);
  insert into _r values ('N12 50 comptes sans compte relié : 0 question, coût négligeable', n = 0, ms || ' ms pour 50 comptes');

  -- P4 le chemin réel : la fin d'un relevé Beebs de louis-seller ferme les 16 (sous-bloc annulé)
  v_txt := null; n3 := null;
  begin
    -- (done → running est refusé par garde_reprise_sans_geste : on passe par interrupted, puis done)
    update vinted_sync_runs set status = 'interrupted' where id = '320e1434-16d5-4ea5-aafb-46329252e376';
    update vinted_sync_runs set status = 'done' where id = '320e1434-16d5-4ea5-aafb-46329252e376';
    select count(*) into n3 from _syn s join cross_post_jobs j on j.id = s.id
     where j.status = 'cancelled' and j.platform_fields ? 'copie_remplacee_par_compte_relie';
    raise exception 'annuler';
  exception when others then if sqlerrm <> 'annuler' then v_txt := sqlerrm; end if;
  end;
  insert into _r values ('P4 fin d''un relevé de louis-seller (déclencheur) : les 16 closes', n3 = 16, coalesce(n3::text, '-') || coalesce(' — ' || v_txt, ''));

  -- P2 le geste direct : 16 closes, les cas douteux restent ouverts, aucun effet de bord
  select count(*) into n_ret_avant from cross_post_jobs where user_id in (louis, seller) and action = 'delete';
  select count(*) into n_pv_avant from push_ventes where user_id in (louis, seller);
  select count(*) into n_mail_avant from email_logs;
  t0 := clock_timestamp();
  n := public.questions_remplacees_par_compte_relie(seller, 'beebs');
  ms := round(extract(epoch from clock_timestamp() - t0) * 1000, 1);
  select count(*) into n2 from _syn s join cross_post_jobs j on j.id = s.id
   where j.status = 'cancelled' and j.platform_fields #>> '{copie_remplacee_par_compte_relie,annonce}' = s.attendue
     and not (j.platform_fields ? 'unavailable_since') and j.error like '%ton compte FillSell relié. Ce n''est pas une vente%';
  insert into _r values ('P2 16 closes par le geste, annonce remplaçante nommée', n = 16 and n2 = 16, n || ' closes, ' || n2 || ' conformes, ' || ms || ' ms');
  select count(*) into n from cross_post_jobs where user_id = louis and platform = 'beebs' and status = 'published' and platform_fields ? 'unavailable_since';
  insert into _r values ('P2b les 5 copies douteuses (N2, N4, N7, N7b, N13) restent posées', n = 5, n::text);
  select count(*) into n_ret_apres from cross_post_jobs where user_id in (louis, seller) and action = 'delete';
  select count(*) into n_pv_apres from push_ventes where user_id in (louis, seller);
  select count(*) into n_mail_apres from email_logs;
  insert into _r values ('P2c aucun retrait, aucune vente, aucun mail', n_ret_apres = n_ret_avant and n_pv_apres = n_pv_avant and n_mail_apres = n_mail_avant,
    (n_ret_apres - n_ret_avant) || ' retrait, ' || (n_pv_apres - n_pv_avant) || ' vente, ' || (n_mail_apres - n_mail_avant) || ' mail');
  select count(*) into n from cross_post_jobs c where c.user_id = seller and c.platform = 'beebs' and c.status = 'published'
     and c.platform_listing_id in (select attendue from _syn) and not (c.platform_fields ?| array['unavailable_since', 'sale_signal']);
  insert into _r values ('P2d les 10 annonces de louis-seller intactes', n = 10, n::text);
  insert into _r values ('P3 rejouée : rien de plus (aucune ligne réécrite)', public.questions_remplacees_par_compte_relie(seller, 'beebs') = 0, '');
end $$;
select essai, ok, left(coalesce(detail, ''), 160) detail from _r
union all
select 'ZZ BILAN', bool_and(coalesce(ok, false)), count(*) filter (where ok) || ' / ' || count(*) from _r
order by 1;
