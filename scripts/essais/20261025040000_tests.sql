-- Essai à blanc de 20261025040000 (notification « Vente annulée ») — joué APRÈS le corps de la migration, puis ROLLBACK.
-- Fiches, dépôts, propositions et UN appareil FICTIFS du compte de Nico (créés et effacés dans la transaction) ; aucun
-- appel réseau (le cron n'est pas déclenché, push-ventes n'est pas appelé) ; aucun mail possible (aucune fonction ici
-- n'écrit email_logs — E14 le relit).
create temp table _r (essai text, ok boolean, detail text) on commit drop;
create temp table _avant on commit drop as
  select (select count(*) from email_logs) as mails, (select count(*) from push_ventes) as notes_ventes,
         (select count(*) from remises_en_vente where statut = 'proposee') as proposees;

-- Armement une heure avant (la migration l'a posé à « maintenant ») ; tout se lit dans CETTE transaction.
update coin_config set value = extract(epoch from now() - interval '1 hour')::integer where key = 'push_annulations_depuis';

-- Marques comme les pose vente_commande_annulee_vinted (dépôt Vinted : 'plateforme' ; copies : sans) et
-- vente_transaction_annulee_leboncoin ('source').
create function pg_temp.marque(p_vente bigint, p_commande text, p_le timestamptz, p_pf text default null, p_source text default null)
returns jsonb language sql as $$
  select jsonb_build_object('vente_annulee_remise',
    jsonb_strip_nulls(jsonb_build_object('vente', p_vente, 'commande', p_commande, 'statut', 'annulee', 'le', p_le,
                                         'plateforme', p_pf, 'source', p_source)))
$$;
-- Fiches FICTIVES (stock, un exemplaire).
insert into inventaire (id, user_id, titre, description, prix_vente, photos, statut, quantite)
select 999000000000000 + n, 'f44b5917-bccc-4431-ba41-f40571a2ed18', 'essai annulation ' || n, 'essai', 999, '[]'::jsonb, 'stock', 1
  from unnest(array[881, 882, 883, 884, 885, 886, 887, 888, 889, 890]) n;
-- Dépôts vendus FICTIFS (fermés) portant la marque, et leurs propositions.
insert into cross_post_jobs (id, user_id, inventaire_id, platform, action, status, title, price, photos, platform_fields)
values
  -- A : annulation Vinted d'il y a 7 min — dépôt Vinted + copie Beebs → UNE note
  ('00000000-0000-4000-8000-000000000881', 'f44b5917-bccc-4431-ba41-f40571a2ed18', 999000000000881, 'vinted', 'publish', 'cancelled', 'A', 999, '[]', pg_temp.marque(999881, 'ESSAI-881', now() - interval '7 minutes', 'vinted')),
  ('00000000-0000-4000-8000-000000000981', 'f44b5917-bccc-4431-ba41-f40571a2ed18', 999000000000881, 'beebs', 'publish', 'cancelled', 'A', 999, '[]', pg_temp.marque(999881, 'ESSAI-881', now() - interval '7 minutes')),
  -- B : il y a 2 min (calme de 6 min pas écoulé)
  ('00000000-0000-4000-8000-000000000882', 'f44b5917-bccc-4431-ba41-f40571a2ed18', 999000000000882, 'vinted', 'publish', 'cancelled', 'B', 999, '[]', pg_temp.marque(999882, 'ESSAI-882', now() - interval '2 minutes', 'vinted')),
  -- C : AVANT l'armement (il y a 2 h)
  ('00000000-0000-4000-8000-000000000883', 'f44b5917-bccc-4431-ba41-f40571a2ed18', 999000000000883, 'vinted', 'publish', 'cancelled', 'C', 999, '[]', pg_temp.marque(999883, 'ESSAI-883', now() - interval '2 hours', 'vinted')),
  -- D : déjà acceptée (a_faire)
  ('00000000-0000-4000-8000-000000000884', 'f44b5917-bccc-4431-ba41-f40571a2ed18', 999000000000884, 'vinted', 'publish', 'cancelled', 'D', 999, '[]', pg_temp.marque(999884, 'ESSAI-884', now() - interval '7 minutes', 'vinted')),
  -- E : achat Leboncoin annulé (copie Vinted proposée, marque « source »)
  ('00000000-0000-4000-8000-000000000885', 'f44b5917-bccc-4431-ba41-f40571a2ed18', 999000000000885, 'vinted', 'publish', 'cancelled', 'E', 999, '[]', pg_temp.marque(999885, null, now() - interval '7 minutes', null, 'transaction_leboncoin')),
  -- F : commande en LOT (2 articles, 2 ventes, une commande) → UNE note, 2 articles
  ('00000000-0000-4000-8000-000000000886', 'f44b5917-bccc-4431-ba41-f40571a2ed18', 999000000000886, 'vinted', 'publish', 'cancelled', 'F1', 999, '[]', pg_temp.marque(999886, 'ESSAI-886', now() - interval '7 minutes', 'vinted')),
  ('00000000-0000-4000-8000-000000000887', 'f44b5917-bccc-4431-ba41-f40571a2ed18', 999000000000887, 'vinted', 'publish', 'cancelled', 'F2', 999, '[]', pg_temp.marque(999887, 'ESSAI-886', now() - interval '7 minutes', 'vinted')),
  -- G : proposition close « déjà en vente » ENTRE la naissance de la note et l'envoi
  ('00000000-0000-4000-8000-000000000888', 'f44b5917-bccc-4431-ba41-f40571a2ed18', 999000000000888, 'vinted', 'publish', 'cancelled', 'G', 999, '[]', pg_temp.marque(999888, 'ESSAI-888', now() - interval '7 minutes', 'vinted')),
  -- H : marque illisible (« le » n'est pas une date) → jamais une note, jamais une erreur
  ('00000000-0000-4000-8000-000000000889', 'f44b5917-bccc-4431-ba41-f40571a2ed18', 999000000000889, 'vinted', 'publish', 'cancelled', 'H', 999, '[]', jsonb_build_object('vente_annulee_remise', jsonb_build_object('vente', 999889, 'le', 'pas une date')));
insert into remises_en_vente (user_id, inventaire_id, platform, job_vendu, statut, prochain_essai)
select 'f44b5917-bccc-4431-ba41-f40571a2ed18', j.inventaire_id, j.platform, j.id,
       case when j.id = '00000000-0000-4000-8000-000000000884' then 'a_faire' else 'proposee' end, now()
  from cross_post_jobs j where j.id::text like '00000000-0000-4000-8000-000000000%' and j.inventaire_id between 999000000000881 and 999000000000889;

-- ── Sans téléphone : rien ne part, la note le dit (« sans_appareil »)
delete from appareils_push where user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18';   -- (0 ligne en prod le 25/10)
insert into _r select 'E01 le cron se réveille (une annulation neuve attend)', public.push_annulations_en_attente(), null;
insert into _r select 'E02 aperçu (simulation) : A, E, F, G — ni B (calme), ni C (avant l''armement), ni D (acceptée), ni H (illisible)',
  string_agg(c ->> 'cle', ',' order by c ->> 'cle') = 'commande:vinted:ESSAI-881,commande:vinted:ESSAI-886,commande:vinted:ESSAI-888,vente:999885',
  string_agg(c ->> 'cle', ',' order by c ->> 'cle')
  from jsonb_array_elements(public.push_annulations_apercu('f44b5917-bccc-4431-ba41-f40571a2ed18') -> 'candidates') c;
insert into _r select 'E03 l''aperçu n''écrit rien', count(*) = 0, count(*)::text from push_annulations;
-- G : sa note naît (passage où le compte n'a pas de téléphone), puis la proposition se ferme avant un autre essai.
create temp table _p1 on commit drop as select public.push_annulations_a_envoyer(20) as r;
insert into _r select 'E04 sans appareil : aucune note servie à push-ventes', jsonb_array_length(r -> 'notes') = 0, r::text from _p1;
insert into _r select 'E05 une note par annulation, toutes « sans_appareil »',
  count(*) = 4 and bool_and(statut = 'sans_appareil'), string_agg(cle || '=' || statut, ' ; ' order by cle) from push_annulations;
insert into _r select 'E06 la commande en lot : UNE note (le premier article)',
  count(*) = 1 and min(inventaire_id) = 999000000000886, string_agg(cle || ' inv ' || inventaire_id, ' ; ')
  from push_annulations where cle = 'commande:vinted:ESSAI-886';
insert into _r select 'E07 achat Leboncoin annulé : clé de la vente, plateforme leboncoin',
  count(*) = 1 and bool_and(plateforme = 'leboncoin'), string_agg(cle || ' ' || plateforme, ' ; ')
  from push_annulations where cle = 'vente:999885';
insert into _r select 'E08 le cron se rendort (plus rien à faire)', not public.push_annulations_en_attente(), null;

-- ── Avec un téléphone (FICTIF) : seules les annulations NEUVES partent ; les notes déjà nées ne repartent jamais.
insert into appareils_push (user_id, plateforme, jeton) values ('f44b5917-bccc-4431-ba41-f40571a2ed18', 'android', 'essai-annulation-' || repeat('x', 40));
create temp table _p2 on commit drop as select public.push_annulations_a_envoyer(20) as r;
insert into _r select 'E09 une annulation déjà notée ne repart JAMAIS (même avec un téléphone arrivé depuis)',
  jsonb_array_length(r -> 'notes') = 0, r::text from _p2;
-- Une annulation NEUVE (I : il y a 6 min 30 s) sur la fiche 890, et la note G remise « à envoyer » à la main pour la relecture.
insert into cross_post_jobs (id, user_id, inventaire_id, platform, action, status, title, price, photos, platform_fields)
values ('00000000-0000-4000-8000-000000000890', 'f44b5917-bccc-4431-ba41-f40571a2ed18', 999000000000890, 'vinted', 'publish', 'cancelled', 'I', 999, '[]', pg_temp.marque(999890, 'ESSAI-890', now() - interval '390 seconds', 'vinted'));
insert into remises_en_vente (user_id, inventaire_id, platform, job_vendu, statut, prochain_essai)
values ('f44b5917-bccc-4431-ba41-f40571a2ed18', 999000000000890, 'vinted', '00000000-0000-4000-8000-000000000890', 'proposee', now());
update push_annulations set statut = 'a_envoyer' where cle = 'commande:vinted:ESSAI-888';
update remises_en_vente set statut = 'abandonnee', motif = 'deja_en_vente', traite_le = now() where job_vendu = '00000000-0000-4000-8000-000000000888';
create temp table _p3 on commit drop as select public.push_annulations_a_envoyer(20) as r;
insert into _r select 'E10 l''annulation neuve part : texte servi (titre de la fiche, plateforme, langue, 1 appareil)',
  jsonb_array_length(r -> 'notes') = 1
  and (r -> 'notes' -> 0 ->> 'titre') = 'essai annulation 890' and (r -> 'notes' -> 0 ->> 'plateforme') = 'vinted'
  and (r -> 'notes' -> 0 ->> 'lang') = 'fr' and jsonb_array_length(r -> 'notes' -> 0 -> 'appareils') = 1
  and (r -> 'notes' -> 0 ->> 'inventaire_id') = '999000000000890' and (r -> 'notes' -> 0 ->> 'nb_articles') = '1',
  ((r -> 'notes' -> 0) - 'appareils') #>> '{}' from _p3;
insert into _r select 'E11 proposition close avant l''envoi → « ignoree / plus_proposee », rien ne part',
  bool_and(statut = 'ignoree' and motif = 'plus_proposee'), string_agg(statut || '/' || coalesce(motif, '∅'), ' ; ')
  from push_annulations where cle = 'commande:vinted:ESSAI-888';
insert into _r select 'E12 en_envoi, un essai compté', bool_and(statut = 'en_envoi' and essais = 1), string_agg(statut || ' ' || essais, ' ; ')
  from push_annulations where cle = 'commande:vinted:ESSAI-890';

-- ── Le verdict : à réessayer (3 fois au plus), puis envoyée ; un jeton refusé est oublié.
select public.push_annulations_resultat(jsonb_build_object('notes', jsonb_build_array(jsonb_build_object(
  'id', (select id from push_annulations where cle = 'commande:vinted:ESSAI-890'), 'statut', 'a_reessayer', 'motif', 'transitoire: HTTP 503', 'resultat', '[]'::jsonb))));
insert into _r select 'E13 à réessayer → « a_envoyer » (essai 1 sur 3)', bool_and(statut = 'a_envoyer'), string_agg(statut || ' ' || essais, ' ; ')
  from push_annulations where cle = 'commande:vinted:ESSAI-890';
create temp table _p4 on commit drop as select public.push_annulations_a_envoyer(20) as r;
select public.push_annulations_resultat(jsonb_build_object(
  'notes', jsonb_build_array(jsonb_build_object('id', (select id from push_annulations where cle = 'commande:vinted:ESSAI-890'), 'statut', 'envoyee', 'resultat', '[]'::jsonb)),
  'invalides', jsonb_build_array('essai-annulation-' || repeat('x', 40))));
insert into _r select 'E14 envoyée (2e essai), et le jeton refusé est oublié',
  (select bool_and(statut = 'envoyee' and essais = 2) from push_annulations where cle = 'commande:vinted:ESSAI-890')
  and not exists (select 1 from appareils_push where user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18'),
  (select string_agg(statut || ' ' || essais, ' ; ') from push_annulations where cle = 'commande:vinted:ESSAI-890');
insert into _r select 'E15 la reprise a servi la même note (jamais une seconde note)', jsonb_array_length(r -> 'notes') = 1
  and (select count(*) from push_annulations where cle = 'commande:vinted:ESSAI-890') = 1, null from _p4;

-- ── Trop tard, interrupteur coupé.
update push_annulations set statut = 'a_envoyer', annulee_le = now() - interval '25 hours' where cle = 'vente:999885';
select public.push_annulations_a_envoyer(20);
insert into _r select 'E16 une note de plus de 24 h ne part plus (« ignoree / trop_tard »)',
  bool_and(statut = 'ignoree' and motif = 'trop_tard'), string_agg(statut || '/' || coalesce(motif, '∅'), ' ; ')
  from push_annulations where cle = 'vente:999885';
update coin_config set value = 0 where key = 'push_annulations_depuis';
insert into cross_post_jobs (id, user_id, inventaire_id, platform, action, status, title, price, photos, platform_fields)
values ('00000000-0000-4000-8000-000000000990', 'f44b5917-bccc-4431-ba41-f40571a2ed18', 999000000000890, 'beebs', 'publish', 'cancelled', 'J', 999, '[]', pg_temp.marque(999990, 'ESSAI-990', now() - interval '7 minutes'));
insert into remises_en_vente (user_id, inventaire_id, platform, job_vendu, statut, prochain_essai)
values ('f44b5917-bccc-4431-ba41-f40571a2ed18', 999000000000890, 'beebs', '00000000-0000-4000-8000-000000000990', 'proposee', now());
insert into _r select 'E17 interrupteur à 0 : rien ne naît, le cron dort',
  (public.push_annulations_a_envoyer(20) ->> 'arme') = 'false' and not public.push_annulations_en_attente()
  and not exists (select 1 from push_annulations where cle = 'commande:vinted:ESSAI-990'), null;

-- ── Rien d'autre n'est touché.
insert into _r select 'E18 0 mail, 0 note de vente, propositions jamais modifiées par la notification',
  (select count(*) from email_logs) = a.mails and (select count(*) from push_ventes) = a.notes_ventes
  and (select count(*) from remises_en_vente where statut = 'proposee' and inventaire_id not between 999000000000000 and 999000000000999) = a.proposees,
  format('mails %s→%s, notes %s→%s', a.mails, (select count(*) from email_logs), a.notes_ventes, (select count(*) from push_ventes)) from _avant a;
insert into _r select 'E19 les annulations réelles d''avant l''armement ne sont jamais notées', count(*) = 0, count(*)::text
  from push_annulations where inventaire_id not between 999000000000000 and 999000000000999;
select essai, ok, left(detail, 300) detail from _r order by essai;
