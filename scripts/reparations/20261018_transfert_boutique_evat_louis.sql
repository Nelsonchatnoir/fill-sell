-- 18/10 — Transfert de la boutique Vinted PERSO @evat (371531) de louis@ttfamily.fr vers louis-seller@ttfamily.fr.
-- Préalable : migration 20261018200000 appliquée. Inverse : 20261018_transfert_boutique_evat_louis_INVERSE.sql.
-- Essai à blanc : scripts/essais/20261018_transfert_louis_essai.sql. Corps (identique) : …_CORPS.sql.
begin;
-- ═══════════════════════════════════════════════════════════════════════════
-- CORPS du transfert de la boutique Vinted PERSO @evat (371531) de Louis :
-- louis@ttfamily.fr (C1, faf5021a) → louis-seller@ttfamily.fr (C2, 447d920c). 18/10.
-- Inclus par 20261018_transfert_boutique_evat_louis.sql (BEGIN … COMMIT) et par
-- scripts/essais/20261018_transfert_louis_essai.sql (… ROLLBACK). Ne pas lancer seul.
-- Décisions de Nico (18/10) : @evat = PERSO → C2 ; @neyenonie (Vinted PRO), Beebs PRO, Leboncoin,
-- eBay @plt-crea restent à C1 ; une fiche @evat qui a aussi une copie Leboncoin/Beebs/Opla est COUPÉE
-- EN DEUX (Vinted → C2, la copie reste à C1 sur une fiche jumelle) et les deux comptes sont RELIÉS
-- (migration 20261018200000) ; bêta messages ouverte sur C2. Le Leboncoin relevé par erreur sur C2
-- (322 annonces, ≈ 55 ventes) part de C2 sans AUCUN job ; les ventes @evat en double gardent la copie de C2.
-- Rien n'est touché chez Vinted, Leboncoin ni Beebs (fillsell.sans_retrait = 1 ; contrôle : 0 job créé).
-- ═══════════════════════════════════════════════════════════════════════════
set local fillsell.sans_retrait = '1';
create temp table _c as select 'faf5021a-479a-4bb3-b3ec-c296770739b7'::uuid as c1,
                               '447d920c-976a-4d8f-aff4-a2998050358c'::uuid as c2,
                               clock_timestamp() as debut;

-- ── 0. Préalables ──────────────────────────────────────────────────────────
do $p$
begin
  if to_regclass('public.boutiques_plateforme') is null or to_regclass('public.fiches_liees_comptes') is null
     or to_regprocedure('public.vente_prouvee_fiche_liee(bigint,text)') is null then
    raise exception 'préalable : la migration 20261018200000 n''est pas appliquée';
  end if;
  if exists (select 1 from vinted_sync_runs r, _c where r.user_id in (_c.c1, _c.c2) and r.status = 'running') then
    raise exception 'préalable : un relevé tourne en ce moment sur un des deux comptes — relancer plus tard';
  end if;
end $p$;

create temp table _e as
  select i.id, i.vinted_item_id from inventaire i, _c where i.user_id = _c.c1 and i.vinted_account_id = '371531';
create temp table _d as
  select d.id, e.id as e_id from inventaire d join _e e on e.vinted_item_id = d.vinted_item_id, _c where d.user_id = _c.c2;
create temp table _l as
  select i.id from inventaire i, _c where i.user_id = _c.c2 and i.origine like 'releve\_leboncoin%' and i.id not in (select id from _d);

do $p2$
begin
  if exists (select 1 from cross_post_jobs j
              where (j.inventaire_id in (select id from _e) or j.inventaire_id in (select id from _d) or j.inventaire_id in (select id from _l))
                and j.status in ('pending', 'processing', 'needs_user')) then
    raise exception 'préalable : un job vivant porte une des fiches à transférer — relancer plus tard';
  end if;
end $p2$;

-- ── 1. Sauvegardes : toutes les lignes des deux comptes, table par table ───
create table if not exists public._backup_1810_louis_inventaire as select i.* from inventaire i, _c where i.user_id in (_c.c1, _c.c2);
create table if not exists public._backup_1810_louis_jobs as select j.* from cross_post_jobs j, _c where j.user_id in (_c.c1, _c.c2);
create table if not exists public._backup_1810_louis_annonces as select a.* from annonces_plateforme a, _c where a.user_id in (_c.c1, _c.c2);
create table if not exists public._backup_1810_louis_rapprochements as select r.* from rapprochements r, _c where r.user_id in (_c.c1, _c.c2);
create table if not exists public._backup_1810_louis_ventes as select v.* from ventes v, _c where v.user_id in (_c.c1, _c.c2);
create table if not exists public._backup_1810_louis_push_ventes as select p.* from push_ventes p, _c where p.user_id in (_c.c1, _c.c2);
create table if not exists public._backup_1810_louis_vca as select x.* from vinted_commandes_articles x, _c where x.user_id in (_c.c1, _c.c2);
create table if not exists public._backup_1810_louis_snapshots as select x.* from vinted_listing_snapshots x, _c where x.user_id in (_c.c1, _c.c2);
create table if not exists public._backup_1810_louis_captures as select x.* from vinted_republish_captures x, _c where x.user_id in (_c.c1, _c.c2);
create table if not exists public._backup_1810_louis_journal as select x.* from inventaire_journal x, _c where x.user_id in (_c.c1, _c.c2);
create table if not exists public._backup_1810_louis_fiches_annonce as select x.* from fiches_annonce x, _c where x.user_id in (_c.c1, _c.c2);
create table if not exists public._backup_1810_louis_remises as select x.* from remises_en_vente x, _c where x.user_id in (_c.c1, _c.c2);
create table if not exists public._backup_1810_louis_ventes_operations as select x.* from ventes_operations x, _c where x.user_id in (_c.c1, _c.c2);
create table if not exists public._backup_1810_louis_conversations as select x.* from messagerie_conversations x, _c where x.user_id in (_c.c1, _c.c2);
create table if not exists public._backup_1810_louis_commandes as select x.* from plateforme_commandes x, _c where x.user_id in (_c.c1, _c.c2);
create table if not exists public._backup_1810_louis_bordereaux as select x.* from bordereaux_demandes x, _c where x.user_id in (_c.c1, _c.c2);
create table if not exists public._backup_1810_louis_doublons as select x.* from inventaire_doublons x, _c where x.user_id in (_c.c1, _c.c2);
create table if not exists public._backup_1810_louis_doublons_verifies as select x.* from inventaire_doublons_verifies x, _c where x.user_id in (_c.c1, _c.c2);
create table if not exists public._backup_1810_louis_sync_runs as select x.* from vinted_sync_runs x, _c where x.user_id in (_c.c1, _c.c2);
create table if not exists public._backup_1810_louis_profiles as select p.id, p.vinted_sync_pin, p.beta_flags from profiles p, _c where p.id in (_c.c1, _c.c2);

-- ── 2. Compte 2 : le Leboncoin du compte 1, relevé par erreur, part (C1 le garde ; aucun job) ──
create temp table _v_lbc_c2 as select v.id from ventes v, _c where v.user_id = _c.c2 and v.plateforme_code = 'leboncoin';
delete from push_ventes p using _c where p.user_id = _c.c2 and (p.vente_id in (select id from _v_lbc_c2) or p.inventaire_id in (select id from _l));
delete from ventes_operations o using _c where o.user_id = _c.c2 and o.inventaire_id in (select id from _l);
delete from ventes where id in (select id from _v_lbc_c2);
update ventes v set inventaire_id = null from _c where v.user_id = _c.c2 and v.inventaire_id in (select id from _l);
delete from annonces_plateforme a using _c where a.user_id = _c.c2 and a.platform = 'leboncoin';
delete from rapprochements r using _c where r.user_id = _c.c2 and r.inventaire_id in (select id from _l);
delete from cross_post_jobs j using _c where j.user_id = _c.c2 and j.platform = 'leboncoin';
delete from messagerie_conversations x using _c where x.user_id = _c.c2 and x.platform = 'leboncoin';
delete from plateforme_commandes x using _c where x.user_id = _c.c2 and x.platform = 'leboncoin';
delete from inventaire_journal x using _c where x.user_id = _c.c2 and x.inventaire_id in (select id from _l);
delete from fiches_annonce x using _c where x.user_id = _c.c2 and x.inventaire_id in (select id from _l);
delete from inventaire_doublons x using _c where x.user_id = _c.c2 and (x.garde in (select id from _l) or x.absorbe in (select id from _l));
delete from inventaire_doublons_verifies x where x.inventaire_id in (select id from _l);
delete from remises_en_vente x where x.inventaire_id in (select id from _l);
delete from vinted_listing_snapshots x where x.inventaire_id in (select id from _l);
update inventaire set fusionne_dans = null where fusionne_dans in (select id from _l);
delete from inventaire where id in (select id from _l);

-- ── 3. Compte 2 : ses fiches « nues » (D) cèdent la place aux fiches riches (E) ──
-- Ce qui n'existe que sur D (relevé des ventes d'aujourd'hui) passe sur la jumelle E ;
-- les doublons du jour (jobs d'import, instantanés, journal) partent : E a l'historique.
update ventes v set inventaire_id = d.e_id from _d d where v.inventaire_id = d.id;
update push_ventes p set inventaire_id = d.e_id from _d d where p.inventaire_id = d.id;
update vinted_commandes_articles x set inventaire_id = d.e_id from _d d where x.inventaire_id = d.id;
update remises_en_vente x set inventaire_id = d.e_id from _d d where x.inventaire_id = d.id;
update ventes_operations x set inventaire_id = d.e_id from _d d where x.inventaire_id = d.id;
update messagerie_conversations x set inventaire_id = d.e_id from _d d where x.inventaire_id = d.id;
update plateforme_commandes x set inventaire_id = d.e_id from _d d where x.inventaire_id = d.id;
update vinted_republish_captures x set inventaire_id = d.e_id from _d d where x.inventaire_id = d.id;
update fiches_annonce x set inventaire_id = d.e_id from _d d
 where x.inventaire_id = d.id and not exists (select 1 from fiches_annonce f where f.inventaire_id = d.e_id);
delete from fiches_annonce x where x.inventaire_id in (select id from _d);
delete from cross_post_jobs j where j.inventaire_id in (select id from _d);
delete from vinted_listing_snapshots x using _c where x.user_id = _c.c2
  and (x.inventaire_id in (select id from _d) or x.vinted_item_id in (select vinted_item_id from _e));
delete from inventaire_journal x where x.inventaire_id in (select id from _d);
delete from rapprochements x where x.inventaire_id in (select id from _d);
delete from inventaire_doublons x using _c where x.user_id = _c.c2 and (x.garde in (select id from _d) or x.absorbe in (select id from _d));
delete from inventaire_doublons_verifies x where x.inventaire_id in (select id from _d);
update inventaire set fusionne_dans = null where fusionne_dans in (select id from _d);
delete from inventaire where id in (select id from _d);

-- ── 4. Fiches coupées en deux : la copie Leboncoin/Beebs/Opla reste à C1, sur une jumelle ──
create temp table _split as
  select e.id as e_id,
         ((extract(epoch from clock_timestamp()) * 1000)::bigint * 1000 + 500 + row_number() over (order by e.id))::bigint as t_id
    from _e e
   where exists (select 1 from cross_post_jobs j where j.inventaire_id = e.id and j.platform <> 'vinted')
      or exists (select 1 from annonces_plateforme a where a.inventaire_id = e.id);
do $p3$ begin
  if exists (select 1 from inventaire i join _split s on s.t_id = i.id) then raise exception 'identifiant de jumelle déjà pris'; end if;
end $p3$;
insert into inventaire
select (jsonb_populate_record(null::inventaire, to_jsonb(i) || jsonb_build_object(
          'id', s.t_id, 'origine', 'transfert_boutique_1810',
          'vinted_item_id', null, 'vinted_account_id', null, 'vinted_status', null, 'vinted_view_count', null,
          'vinted_favourite_count', null, 'vinted_catalog_id', null, 'listed_at_guess', null,
          'fusionne_dans', null, 'fusionne_le', null))).*
  from inventaire i join _split s on s.e_id = i.id;
update cross_post_jobs j set inventaire_id = s.t_id from _split s, _c where j.inventaire_id = s.e_id and j.user_id = _c.c1 and j.platform <> 'vinted';
update annonces_plateforme a set inventaire_id = s.t_id from _split s, _c where a.inventaire_id = s.e_id and a.user_id = _c.c1;
update rapprochements r set inventaire_id = s.t_id from _split s, _c
 where r.inventaire_id = s.e_id and r.user_id = _c.c1 and r.annonce_id in (select a.id from annonces_plateforme a where a.inventaire_id = s.t_id);
update remises_en_vente x set inventaire_id = s.t_id from _split s, _c where x.inventaire_id = s.e_id and x.user_id = _c.c1 and coalesce(x.platform, '') <> 'vinted';
update ventes v set inventaire_id = s.t_id from _split s, _c where v.inventaire_id = s.e_id and v.user_id = _c.c1 and coalesce(v.plateforme_code, '') <> 'vinted';
update push_ventes p set inventaire_id = s.t_id from _split s, _c where p.inventaire_id = s.e_id and p.user_id = _c.c1 and coalesce(p.plateforme, '') <> 'vinted';
update plateforme_commandes x set inventaire_id = s.t_id from _split s, _c where x.inventaire_id = s.e_id and x.user_id = _c.c1 and coalesce(x.platform, '') <> 'vinted';
update messagerie_conversations x set inventaire_id = s.t_id from _split s, _c where x.inventaire_id = s.e_id and x.user_id = _c.c1 and coalesce(x.platform, '') <> 'vinted';
update ventes_operations x set inventaire_id = s.t_id from _split s, _c
 where x.inventaire_id = s.e_id and x.user_id = _c.c1 and x.job_id in (select j.id from cross_post_jobs j where j.inventaire_id = s.t_id);
insert into comptes_lies (user_a, user_b, motif)
select least(_c.c1, _c.c2), greatest(_c.c1, _c.c2), 'Louis : louis@ttfamily.fr et louis-seller@ttfamily.fr, même personne (décision de Nico, 18/10)' from _c
on conflict (user_a, user_b) do nothing;
insert into fiches_liees_comptes (fiche_a, user_a, fiche_b, user_b, source)
select s.e_id, _c.c2, s.t_id, _c.c1, 'transfert_boutique_evat_1810' from _split s, _c;

-- ── 5. L'historique @evat du compte 1 déjà présent au compte 2 : on garde la copie de C2 ──
create temp table _v_dup_c1 as
  select v.id from ventes v, _c
   where v.user_id = _c.c1 and v.plateforme_code = 'vinted'
     and exists (select 1 from ventes w where w.user_id = _c.c2 and w.plateforme_code = 'vinted'
                  and split_part(w.commande_ref, ':', 1) = split_part(v.commande_ref, ':', 1));
delete from push_ventes p using _c where p.user_id = _c.c1 and p.vente_id in (select id from _v_dup_c1);
delete from ventes_operations o using _c where o.user_id = _c.c1 and o.inventaire_id in (select id from _e)
  and exists (select 1 from ventes_operations q where q.user_id = _c.c2 and q.cle = o.cle);
delete from ventes where id in (select id from _v_dup_c1);
delete from vinted_commandes_articles x using _c where x.user_id = _c.c1
  and exists (select 1 from vinted_commandes_articles y where y.user_id = _c.c2 and y.commande_ref = x.commande_ref);
delete from messagerie_conversations x using _c where x.user_id = _c.c1 and x.platform = 'vinted'
  and exists (select 1 from messagerie_conversations y where y.user_id = _c.c2 and y.platform = 'vinted' and y.conversation_ref = x.conversation_ref);
delete from plateforme_commandes x using _c where x.user_id = _c.c1 and x.platform = 'vinted'
  and exists (select 1 from plateforme_commandes y where y.user_id = _c.c2 and y.platform = 'vinted' and y.commande_ref = x.commande_ref);

-- ── 6. Le compte 2 reçoit les fiches @evat et tout ce qui les accompagne ───────
create temp table _cmd_evat as
  select x.id from plateforme_commandes x, _c
   where x.user_id = _c.c1 and x.platform = 'vinted'
     and (x.inventaire_id in (select id from _e)
          or exists (select 1 from ventes w where w.user_id = _c.c2 and w.plateforme_code = 'vinted'
                      and split_part(w.commande_ref, ':', 1) = split_part(x.commande_ref, ':', 1))
          or exists (select 1 from vinted_commandes_articles y where y.user_id = _c.c2 and y.commande_ref = x.commande_ref));
create temp table _conv_evat as
  select x.id from messagerie_conversations x, _c
   where x.user_id = _c.c1 and x.platform = 'vinted'
     and (x.inventaire_id in (select id from _e)
          or (x.commande_ref is not null and exists (select 1 from ventes w where w.user_id = _c.c2 and w.plateforme_code = 'vinted'
                      and split_part(w.commande_ref, ':', 1) = split_part(x.commande_ref, ':', 1))));
update cross_post_jobs x set user_id = _c.c2 from _c where x.user_id = _c.c1 and x.inventaire_id in (select id from _e);
update vinted_listing_snapshots x set user_id = _c.c2 from _c where x.user_id = _c.c1 and x.inventaire_id in (select id from _e);
update vinted_republish_captures x set user_id = _c.c2 from _c where x.user_id = _c.c1 and x.inventaire_id in (select id from _e);
update inventaire_journal x set user_id = _c.c2 from _c where x.user_id = _c.c1 and x.inventaire_id in (select id from _e);
update fiches_annonce x set user_id = _c.c2 from _c where x.user_id = _c.c1 and x.inventaire_id in (select id from _e);
update remises_en_vente x set user_id = _c.c2 from _c where x.user_id = _c.c1 and x.inventaire_id in (select id from _e);
update ventes x set user_id = _c.c2 from _c where x.user_id = _c.c1 and x.inventaire_id in (select id from _e);
update push_ventes x set user_id = _c.c2 from _c where x.user_id = _c.c1 and x.inventaire_id in (select id from _e);
update ventes_operations x set user_id = _c.c2 from _c where x.user_id = _c.c1 and x.inventaire_id in (select id from _e);
update vinted_commandes_articles x set user_id = _c.c2 from _c where x.user_id = _c.c1 and x.inventaire_id in (select id from _e);
update rapprochements x set user_id = _c.c2 from _c where x.user_id = _c.c1 and x.inventaire_id in (select id from _e);
update inventaire_doublons_verifies x set user_id = _c.c2 from _c where x.user_id = _c.c1 and x.inventaire_id in (select id from _e);
update inventaire_doublons x set user_id = _c.c2 from _c where x.user_id = _c.c1 and x.garde in (select id from _e) and x.absorbe in (select id from _e);
update plateforme_commandes x set user_id = _c.c2 from _c where x.id in (select id from _cmd_evat);
update bordereaux_demandes b set user_id = _c.c2 from _c where b.user_id = _c.c1 and b.commande_id in (select id from _cmd_evat);
update messagerie_conversations x set user_id = _c.c2 from _c where x.id in (select id from _conv_evat);
update vinted_sync_runs x set user_id = _c.c2 from _c where x.user_id = _c.c1 and x.vinted_user_id = '371531' and x.status not in ('queued', 'running');
update inventaire x set user_id = _c.c2 from _c where x.id in (select id from _e);

-- ── 7. La boutique appartient au compte 2 ; bêta messages ouverte sur C2 ─────
update profiles p
   set vinted_sync_pin = jsonb_set(p.vinted_sync_pin, '{boutiques}',
         coalesce((select jsonb_agg(b) from jsonb_array_elements(p.vinted_sync_pin -> 'boutiques') b where b ->> 'user_id' <> '371531'), '[]'::jsonb))
  from _c where p.id = _c.c1;
insert into boutiques_plateforme (platform, compte_ref, user_id, source)
select 'vinted', '371531', _c.c2, 'transfert_louis_1810' from _c
on conflict (platform, compte_ref) do update set user_id = excluded.user_id, source = excluded.source, depuis = now();
insert into boutiques_plateforme (platform, compte_ref, user_id, source)
select 'vinted', '247512093', _c.c1, 'transfert_louis_1810' from _c
on conflict (platform, compte_ref) do update set user_id = excluded.user_id, source = excluded.source, depuis = now();
update profiles p set beta_flags = coalesce(p.beta_flags, '{}'::jsonb) || '{"messages_bordereaux": true}'::jsonb from _c where p.id = _c.c2;

-- ── 8. Contrôles (une seule erreur annule tout) ──────────────────────────────
create temp table _verif as
select 'C1 : plus aucune fiche @evat' as controle, (select count(*) from inventaire i, _c where i.user_id = _c.c1 and i.vinted_account_id = '371531') = 0 as ok
union all select 'C2 : fiches @evat = E + celles de C2 seules', (select count(*) from inventaire i, _c where i.user_id = _c.c2 and i.vinted_account_id = '371531')
  = (select count(*) from _e) + (select count(*) from _backup_1810_louis_inventaire b, _c where b.user_id = _c.c2 and b.vinted_account_id = '371531')
    - (select count(*) from _d)
union all select 'C2 : aucun numéro Vinted en double', not exists (select 1 from inventaire i, _c where i.user_id = _c.c2 and i.vinted_item_id is not null group by i.vinted_item_id having count(*) > 1)
union all select 'C2 : plus aucune annonce, fiche ni vente Leboncoin', not exists (select 1 from annonces_plateforme a, _c where a.user_id = _c.c2 and a.platform = 'leboncoin')
  and not exists (select 1 from ventes v, _c where v.user_id = _c.c2 and v.plateforme_code = 'leboncoin')
  and not exists (select 1 from inventaire i, _c where i.user_id = _c.c2 and i.origine like 'releve\_leboncoin%'
                    and i.id not in (select id from _e))  -- une fiche @evat née d'un relevé LBC garde son origine ; sa copie LBC est sur la jumelle C1
union all select 'jobs : user_id = celui de la fiche', not exists (select 1 from cross_post_jobs j join inventaire i on i.id = j.inventaire_id, _c where j.user_id in (_c.c1, _c.c2) and j.user_id <> i.user_id)
union all select 'ventes : user_id = celui de la fiche', not exists (select 1 from ventes v join inventaire i on i.id = v.inventaire_id, _c where v.user_id in (_c.c1, _c.c2) and v.user_id <> i.user_id)
union all select 'annonces : user_id = celui de la fiche', not exists (select 1 from annonces_plateforme a join inventaire i on i.id = a.inventaire_id, _c where a.user_id in (_c.c1, _c.c2) and a.user_id <> i.user_id)
union all select 'instantanés : user_id = celui de la fiche', not exists (select 1 from vinted_listing_snapshots x join inventaire i on i.id = x.inventaire_id, _c where x.user_id in (_c.c1, _c.c2) and x.user_id <> i.user_id)
union all select 'captures : user_id = celui de la fiche', not exists (select 1 from vinted_republish_captures x join inventaire i on i.id = x.inventaire_id, _c where x.user_id in (_c.c1, _c.c2) and x.user_id <> i.user_id)
union all select 'aucune vente Vinted en double entre les deux comptes', not exists (
    select 1 from ventes v join ventes w on w.plateforme_code = v.plateforme_code and split_part(w.commande_ref, ':', 1) = split_part(v.commande_ref, ':', 1), _c
     where v.user_id = _c.c1 and w.user_id = _c.c2 and v.plateforme_code = 'vinted')
union all select 'aucune annonce suivie par les deux comptes', not exists (
    select 1 from annonces_plateforme a join annonces_plateforme b on b.platform = a.platform and b.listing_id = a.listing_id, _c
     where a.user_id = _c.c1 and b.user_id = _c.c2)
union all select 'aucun job créé par le transfert', not exists (select 1 from cross_post_jobs j, _c where j.user_id in (_c.c1, _c.c2) and j.created_at >= now())  -- now() = début de la transaction
union all select 'aucune notification de vente créée', not exists (select 1 from push_ventes p, _c where p.user_id in (_c.c1, _c.c2) and p.cree_le >= now())
union all select 'C1 : annonces Leboncoin inchangées (nombre)', (select count(*) from annonces_plateforme a, _c where a.user_id = _c.c1 and a.platform = 'leboncoin')
  = (select count(*) from _backup_1810_louis_annonces b, _c where b.user_id = _c.c1 and b.platform = 'leboncoin')
union all select 'jumelles = fiches coupées = liens', (select count(*) from inventaire where origine = 'transfert_boutique_1810') = (select count(*) from _split)
  and (select count(*) from fiches_liees_comptes where source = 'transfert_boutique_evat_1810') = (select count(*) from _split)
union all select 'comptes reliés', public.comptes_sont_lies((select c1 from _c), (select c2 from _c))
union all select 'registre : 371531 → C2, 247512093 → C1', public.boutique_proprietaire('vinted', '371531') = (select c2 from _c)
  and public.boutique_proprietaire('vinted', '247512093') = (select c1 from _c)
union all select 'pin C1 sans @evat', not exists (select 1 from profiles p, _c, jsonb_array_elements(p.vinted_sync_pin -> 'boutiques') b where p.id = _c.c1 and b ->> 'user_id' = '371531')
union all select 'bêta messages ouverte sur C2', (select (beta_flags ->> 'messages_bordereaux')::boolean from profiles p, _c where p.id = _c.c2);

do $v$ begin
  if exists (select 1 from _verif where not ok or ok is null) then
    raise exception 'transfert annulé, contrôle(s) en échec : %', (select string_agg(controle, ' ; ') from _verif where not ok or ok is null);
  end if;
end $v$;

-- Le bilan chiffré (lu par l'essai et par l'exécution réelle).
create temp table _bilan as
select 'fiches @evat passées à C2 (E)' as quoi, (select count(*) from _e)::text as n
union all select 'fiches nues de C2 remplacées (D)', (select count(*) from _d)::text
union all select 'fiches Leboncoin retirées de C2 (L)', (select count(*) from _l)::text
union all select 'ventes Leboncoin retirées de C2', (select count(*) from _v_lbc_c2)::text
union all select 'ventes @evat en double retirées de C1 (copie de C2 gardée)', (select count(*) from _v_dup_c1)::text
union all select 'fiches coupées en deux (jumelle C1 reliée)', (select count(*) from _split)::text
union all select 'commandes @evat passées à C2', (select count(*) from _cmd_evat)::text
union all select 'conversations @evat passées à C2', (select count(*) from _conv_evat)::text
union all select 'C2 : fiches au total', (select count(*) from inventaire i, _c where i.user_id = _c.c2)::text
union all select 'C2 : ventes au total', (select count(*) from ventes v, _c where v.user_id = _c.c2)::text
union all select 'C1 : ventes au total', (select count(*) from ventes v, _c where v.user_id = _c.c1)::text;


select quoi, n from _bilan union all select 'CONTRÔLE ' || controle, ok::text from _verif;
commit;
