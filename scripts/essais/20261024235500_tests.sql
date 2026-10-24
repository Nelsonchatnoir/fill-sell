-- Essai à blanc de 20261024235500 (bordereaux Vinted : paliers Pro et Business seulement, jamais Free ni Premium) — les
-- contrôles, joués APRÈS le corps de la migration, dans la même transaction, puis ROLLBACK (assemblé par
-- scripts/essais/20261024235500_essai.sql).
-- Comptes : Nico (f44b5917…, Pro, bêta — sa bêta est retirée DANS la transaction pour jouer « Pro hors bêta », puis
-- rendue) ; Ornella (f8aa02a5…, Business, bêta — passée Free DANS la transaction pour jouer « bêta Free ») ;
-- sos.cuisine (90ace0e4…, Premium, hors bêta). Commandes « ESSAI-NB-* » créées dans la transaction : rien ne reste, aucun
-- mail, aucune notification (tout est annulé au ROLLBACK).
create temp table _r (essai text, ok boolean, detail text) on commit drop;
-- A. L'aide, sans session.
insert into _r select 'A1 Premium hors bêta (sos.cuisine) : Vinted FERMÉ', not public.bordereaux_ouverts_pour('90ace0e4-3dbd-4e4f-b23e-02cd27dbd1b3', 'vinted'), null;
insert into _r select 'A2 Pro bêta (Nico) : Vinted ouvert, Beebs fermé',
  public.bordereaux_ouverts_pour('f44b5917-bccc-4431-ba41-f40571a2ed18', 'vinted')
  and not public.bordereaux_ouverts_pour('f44b5917-bccc-4431-ba41-f40571a2ed18', 'beebs'), null;
update profiles set beta_flags = beta_flags - 'messages_bordereaux' where id = 'f44b5917-bccc-4431-ba41-f40571a2ed18';
insert into _r select 'A3 Pro HORS bêta : Vinted ouvert, Leboncoin fermé',
  public.bordereaux_ouverts_pour('f44b5917-bccc-4431-ba41-f40571a2ed18', 'vinted')
  and not public.bordereaux_ouverts_pour('f44b5917-bccc-4431-ba41-f40571a2ed18', 'leboncoin'), null;
update coin_config set value = 0 where key = 'bordereaux_vinted_tous';
insert into _r select 'A4 interrupteur à 0 : Pro hors bêta fermé, Business bêta ouvert',
  not public.bordereaux_ouverts_pour('f44b5917-bccc-4431-ba41-f40571a2ed18', 'vinted')
  and public.bordereaux_ouverts_pour('f8aa02a5-23cb-4325-bba8-127f61a75741', 'vinted'), null;
update coin_config set value = 1 where key = 'bordereaux_vinted_tous';

-- B. Session du compte Pro HORS bêta (Nico, bêta retirée dans la transaction).
select set_config('request.jwt.claim.sub', 'f44b5917-bccc-4431-ba41-f40571a2ed18', true),
       set_config('request.jwt.claims', '{"sub":"f44b5917-bccc-4431-ba41-f40571a2ed18","role":"authenticated"}', true);
insert into _r select 'B1 relevé Vinted : autorisé, commandes seules',
  (r ->> 'commandes_seules') = 'true' and ((r ->> 'autorise') = 'true' or r ->> 'motif' not in ('beta')), r::text
  from (select public.messagerie_releve_autorise('vinted') r) x;
insert into _r select 'B2 relevé Leboncoin : refusé (bêta)', (r ->> 'autorise') = 'false' and r ->> 'motif' = 'beta', r::text
  from (select public.messagerie_releve_autorise('leboncoin') r) x;
insert into _r select 'B3 une commande Vinted s''enregistre', (r ->> 'refuse') is null, r::text
  from (select public.commandes_enregistrer('vinted', '[{"ref":"ESSAI-NB-1","etat":"a_expedier","bordereau":"pret"}]'::jsonb) r) x;
insert into _r select 'B4 une commande Leboncoin est refusée', r ->> 'refuse' = 'beta', r::text
  from (select public.commandes_enregistrer('leboncoin', '[{"ref":"ESSAI-NB-L","etat":"a_expedier","bordereau":"pret"}]'::jsonb) r) x;
insert into _r select 'B5 automatique : la commande Vinted neuve reçoit UNE demande « récupérer »',
  count(*) = 1 and bool_and(d.action = 'recuperer' and d.choix ->> 'auto' = 'true'), string_agg(d.action || ' ' || d.statut, ' ; ')
  from bordereaux_demandes d join plateforme_commandes c on c.id = d.commande_id
 where c.user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18' and c.commande_ref = 'ESSAI-NB-1';
insert into plateforme_commandes (user_id, platform, commande_ref, etat, bordereau, titre)
values ('f44b5917-bccc-4431-ba41-f40571a2ed18', 'leboncoin', 'ESSAI-NB-L2', 'a_expedier', 'pret', 'essai lbc');
insert into _r select 'B6 récupérer sur Leboncoin : « bientot »', r ->> 'refuse' = 'bientot', r::text
  from (select public.bordereau_demander(c.id) r from plateforme_commandes c where c.commande_ref = 'ESSAI-NB-L2') x;
update plateforme_commandes set etat = 'a_confirmer', bordereau = 'a_generer' where commande_ref = 'ESSAI-NB-L2';
insert into _r select 'B7 générer sur Leboncoin : « bientot »', r ->> 'refuse' = 'bientot', r::text
  from (select public.bordereau_generer(c.id, '{}'::jsonb, 'Je confirme la disponibilité de l''article') r
          from plateforme_commandes c where c.commande_ref = 'ESSAI-NB-L2') x;
insert into plateforme_commandes (user_id, platform, commande_ref, etat, bordereau, titre, cree_le)
values ('f44b5917-bccc-4431-ba41-f40571a2ed18', 'vinted', 'ESSAI-NB-2', 'a_expedier', 'a_obtenir', 'essai vinted', now() - interval '3 days');
insert into _r select 'B8 générer sur Vinted (bouton, Pro hors bêta) : demande déposée', r ->> 'statut' = 'demandee' and r ? 'id', r::text
  from (select public.bordereau_generer(c.id, '{"type_etiquette":1}'::jsonb, 'Je commande l''étiquette Vinted de cette vente') r
          from plateforme_commandes c where c.commande_ref = 'ESSAI-NB-2') x;
insert into bordereaux_demandes (user_id, commande_id, platform, cree_le)
select c.user_id, c.id, 'leboncoin', now() - interval '1 hour' from plateforme_commandes c where c.commande_ref = 'ESSAI-NB-L2';
insert into _r select 'B9 le poste prend une demande VINTED, jamais la Leboncoin', (r -> 'demande' ->> 'platform') = 'vinted', left(r::text, 200)
  from (select public.bordereau_demande_a_traiter(null, array['generer','vinted_types_texte','relance_vinted']) r) x;
insert into _r select 'B10 copie d''une commande Vinted notée ; Leboncoin refusée',
  (select (public.bordereau_copie_noter(c.id, 'f44b5917-bccc-4431-ba41-f40571a2ed18/vinted-essai.pdf', 10) ->> 'id') is not null
     from plateforme_commandes c where c.commande_ref = 'ESSAI-NB-1')
  and (select public.bordereau_copie_noter(c.id, 'f44b5917-bccc-4431-ba41-f40571a2ed18/lbc-essai.pdf', 10) ->> 'refuse' = 'beta'
         from plateforme_commandes c where c.commande_ref = 'ESSAI-NB-L2'), null;
update profiles set extension_version = '0.6.131' where id = 'f44b5917-bccc-4431-ba41-f40571a2ed18';
insert into _r select 'B11 compteurs, extension 0.6.131 : pas d''écran (rien ne le remplirait)',
  (r ->> 'beta') = 'false' and (r ->> 'bordereaux_vinted') = 'false', r::text from (select public.messagerie_compteurs() r) x;
update profiles set extension_version = '0.6.140' where id = 'f44b5917-bccc-4431-ba41-f40571a2ed18';
insert into _r select 'B12 compteurs, extension 0.6.140 : « À expédier » et génération ouverts, messagerie fermée',
  (r ->> 'beta') = 'false' and (r ->> 'bordereaux_vinted') = 'true' and (r ->> 'generation') = 'true' and r ->> 'envoi_mode' is null
  and (r ->> 'a_expedier')::int >= 2, r::text from (select public.messagerie_compteurs() r) x;

-- P. Session du compte PREMIUM hors bêta (sos.cuisine) : rien, même avec l'extension 0.6.140.
select set_config('request.jwt.claim.sub', '90ace0e4-3dbd-4e4f-b23e-02cd27dbd1b3', true),
       set_config('request.jwt.claims', '{"sub":"90ace0e4-3dbd-4e4f-b23e-02cd27dbd1b3","role":"authenticated"}', true);
update profiles set extension_version = '0.6.140' where id = '90ace0e4-3dbd-4e4f-b23e-02cd27dbd1b3';
insert into _r select 'P1 Premium : aucun relevé des commandes', (r ->> 'autorise') = 'false' and r ->> 'motif' = 'beta', r::text
  from (select public.messagerie_releve_autorise('vinted') r) x;
insert into _r select 'P2 Premium : aucune commande enregistrée', r ->> 'refuse' = 'beta', r::text
  from (select public.commandes_enregistrer('vinted', '[{"ref":"ESSAI-P-1","etat":"a_expedier","bordereau":"pret"}]'::jsonb) r) x;
insert into _r select 'P3 Premium : compteurs sans « À expédier » ni génération (aucune mention)',
  (r ->> 'bordereaux_vinted') = 'false' and r ->> 'generation' is null, r::text from (select public.messagerie_compteurs() r) x;
insert into _r select 'P4 Premium : aucune demande servie', r -> 'demande' is null or r ->> 'demande' is null, left(r::text, 200)
  from (select public.bordereau_demande_a_traiter(null, array['generer','vinted_types_texte']) r) x;

-- D. Un compte BÊTA passé Free (Ornella, dans la transaction) : plus aucun bordereau, ni manuel ni automatique.
select set_config('request.jwt.claim.sub', 'f8aa02a5-23cb-4325-bba8-127f61a75741', true),
       set_config('request.jwt.claims', '{"sub":"f8aa02a5-23cb-4325-bba8-127f61a75741","role":"authenticated"}', true);
insert into _r select 'D0 Business bêta : ouvert', public.bordereaux_ouverts_pour(null, 'vinted'), null;
update profiles set is_business = false, is_pro = false, is_premium = false, is_comped = false where id = 'f8aa02a5-23cb-4325-bba8-127f61a75741';
insert into _r select 'D1 bêta passée Free : Vinted FERMÉ', not public.bordereaux_ouverts_pour(null, 'vinted') and public.palier_de('f8aa02a5-23cb-4325-bba8-127f61a75741') = 'free', null;
insert into plateforme_commandes (user_id, platform, commande_ref, etat, bordereau, titre)
values ('f8aa02a5-23cb-4325-bba8-127f61a75741', 'vinted', 'ESSAI-D-1', 'a_expedier', 'a_obtenir', 'essai free');
insert into _r select 'D2 bêta Free : aucune demande automatique', count(*) = 0, count(*)::text
  from bordereaux_demandes d join plateforme_commandes c on c.id = d.commande_id where c.commande_ref = 'ESSAI-D-1';
insert into _r select 'D3 bêta Free : le bouton « générer » est refusé (« palier »)', r ->> 'refuse' = 'palier', r::text
  from (select public.bordereau_generer(c.id, '{"type_etiquette":1}'::jsonb, 'Je commande l''étiquette Vinted de cette vente') r
          from plateforme_commandes c where c.commande_ref = 'ESSAI-D-1') x;
insert into _r select 'D4 bêta Free : compteurs « bordereaux_vinted » faux, messagerie (bêta) gardée',
  (r ->> 'beta') = 'true' and (r ->> 'bordereaux_vinted') = 'false' and r ->> 'generation' is null, left(r::text, 200)
  from (select public.messagerie_compteurs() r) x;
insert into _r select 'D5 auto : motif « palier »', public.bordereau_auto_pour_commande(c.id) = 'palier', public.bordereau_auto_pour_commande(c.id)
  from plateforme_commandes c where c.commande_ref = 'ESSAI-D-1';

-- C. Session du compte bêta Pro (Nico, bêta rendue) : relevé complet, compteurs.
update profiles set beta_flags = coalesce(beta_flags, '{}'::jsonb) || '{"messages_bordereaux": true}'::jsonb where id = 'f44b5917-bccc-4431-ba41-f40571a2ed18';
select set_config('request.jwt.claim.sub', 'f44b5917-bccc-4431-ba41-f40571a2ed18', true),
       set_config('request.jwt.claims', '{"sub":"f44b5917-bccc-4431-ba41-f40571a2ed18","role":"authenticated"}', true);
insert into _r select 'C1 bêta Pro : relevé Vinted complet (pas « commandes seules »)',
  (r ->> 'commandes_seules') = 'false' and ((r ->> 'autorise') = 'true' or r ->> 'motif' <> 'beta'), r::text
  from (select public.messagerie_releve_autorise('vinted') r) x;
insert into _r select 'C2 bêta Pro : relevé Beebs toujours permis (messages)', (r ->> 'autorise') = 'true' or r ->> 'motif' <> 'beta', r::text
  from (select public.messagerie_releve_autorise('beebs') r) x;
insert into _r select 'C3 bêta Pro : compteurs « beta » et « bordereaux_vinted »', (r ->> 'beta') = 'true' and (r ->> 'bordereaux_vinted') = 'true', left(r::text, 200)
  from (select public.messagerie_compteurs() r) x;
insert into _r select 'C4 aucune erreur d''automatique tracée', count(*) = 0, count(*)::text
  from usage_logs where feature = 'bordereau_auto_erreur' and created_at = now();
insert into _r select 'C5 aucun bordereau déjà généré n''est touché (copies réelles intactes)', count(*) = 0, count(*)::text
  from bordereaux_copies b where b.efface_le is not null and b.efface_le = now();
select essai, ok, left(detail, 300) detail from _r order by essai;
