-- Essai à blanc de 20261024235500 (bordereaux Vinted à tous les comptes) — les contrôles, joués APRÈS le corps de la
-- migration, dans la même transaction, puis ROLLBACK (assemblé par scripts/essais/20261024235500_essai.sql).
-- Compte hors bêta : sos.cuisine (90ace0e4…, extension 0.6.131) ; compte bêta : Nico (f44b5917…). Commandes « ESSAI-NB-* »
-- créées dans la transaction : rien ne reste, aucun mail, aucune notification (tout est annulé au ROLLBACK).
create temp table _r (essai text, ok boolean, detail text) on commit drop;
-- A. L'aide, sans session.
insert into _r select 'A1 hors bêta : Vinted ouvert, Leboncoin fermé',
  public.bordereaux_ouverts_pour('90ace0e4-3dbd-4e4f-b23e-02cd27dbd1b3', 'vinted')
  and not public.bordereaux_ouverts_pour('90ace0e4-3dbd-4e4f-b23e-02cd27dbd1b3', 'leboncoin'), null;
insert into _r select 'A2 bêta : Vinted ouvert, Beebs fermé',
  public.bordereaux_ouverts_pour('f44b5917-bccc-4431-ba41-f40571a2ed18', 'vinted')
  and not public.bordereaux_ouverts_pour('f44b5917-bccc-4431-ba41-f40571a2ed18', 'beebs'), null;
update coin_config set value = 0 where key = 'bordereaux_vinted_tous';
insert into _r select 'A3 interrupteur à 0 : hors bêta fermé, bêta ouverte',
  not public.bordereaux_ouverts_pour('90ace0e4-3dbd-4e4f-b23e-02cd27dbd1b3', 'vinted')
  and public.bordereaux_ouverts_pour('f44b5917-bccc-4431-ba41-f40571a2ed18', 'vinted'), null;
update coin_config set value = 1 where key = 'bordereaux_vinted_tous';

-- B. Session du compte hors bêta.
select set_config('request.jwt.claim.sub', '90ace0e4-3dbd-4e4f-b23e-02cd27dbd1b3', true),
       set_config('request.jwt.claims', '{"sub":"90ace0e4-3dbd-4e4f-b23e-02cd27dbd1b3","role":"authenticated"}', true);
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
 where c.user_id = '90ace0e4-3dbd-4e4f-b23e-02cd27dbd1b3' and c.commande_ref = 'ESSAI-NB-1';
-- Une commande Leboncoin posée à la main (aucun relevé hors bêta ne la créerait) : rien ne part, « bientot ».
insert into plateforme_commandes (user_id, platform, commande_ref, etat, bordereau, titre)
values ('90ace0e4-3dbd-4e4f-b23e-02cd27dbd1b3', 'leboncoin', 'ESSAI-NB-L2', 'a_expedier', 'pret', 'essai lbc');
insert into _r select 'B6 récupérer sur Leboncoin : « bientot »', r ->> 'refuse' = 'bientot', r::text
  from (select public.bordereau_demander(c.id) r from plateforme_commandes c where c.commande_ref = 'ESSAI-NB-L2') x;
update plateforme_commandes set etat = 'a_confirmer', bordereau = 'a_generer' where commande_ref = 'ESSAI-NB-L2';
insert into _r select 'B7 générer sur Leboncoin : « bientot »', r ->> 'refuse' = 'bientot', r::text
  from (select public.bordereau_generer(c.id, '{}'::jsonb, 'Je confirme la disponibilité de l''article') r
          from plateforme_commandes c where c.commande_ref = 'ESSAI-NB-L2') x;
-- Une commande Vinted d'AVANT l'ouverture (aucune demande automatique) : le bouton manuel marche.
insert into plateforme_commandes (user_id, platform, commande_ref, etat, bordereau, titre, cree_le)
values ('90ace0e4-3dbd-4e4f-b23e-02cd27dbd1b3', 'vinted', 'ESSAI-NB-2', 'a_expedier', 'a_obtenir', 'essai vinted', now() - interval '3 days');
insert into _r select 'B8 générer sur Vinted (bouton, hors bêta) : demande déposée', r ->> 'statut' = 'demandee' and r ? 'id', r::text
  from (select public.bordereau_generer(c.id, '{"type_etiquette":1}'::jsonb, 'Je commande l''étiquette Vinted de cette vente') r
          from plateforme_commandes c where c.commande_ref = 'ESSAI-NB-2') x;
-- Une demande Leboncoin posée à la main AVANT les autres : jamais servie.
insert into bordereaux_demandes (user_id, commande_id, platform, cree_le)
select c.user_id, c.id, 'leboncoin', now() - interval '1 hour' from plateforme_commandes c where c.commande_ref = 'ESSAI-NB-L2';
insert into _r select 'B9 le poste prend une demande VINTED, jamais la Leboncoin', (r -> 'demande' ->> 'platform') = 'vinted', left(r::text, 200)
  from (select public.bordereau_demande_a_traiter(null, array['generer','vinted_types_texte','relance_vinted']) r) x;
insert into _r select 'B10 copie d''une commande Vinted notée ; Leboncoin refusée',
  (select (public.bordereau_copie_noter(c.id, '90ace0e4-3dbd-4e4f-b23e-02cd27dbd1b3/vinted-essai.pdf', 10) ->> 'id') is not null
     from plateforme_commandes c where c.commande_ref = 'ESSAI-NB-1')
  and (select public.bordereau_copie_noter(c.id, '90ace0e4-3dbd-4e4f-b23e-02cd27dbd1b3/lbc-essai.pdf', 10) ->> 'refuse' = 'beta'
         from plateforme_commandes c where c.commande_ref = 'ESSAI-NB-L2'), null;
insert into _r select 'B11 compteurs, extension 0.6.131 : pas d''écran (rien ne le remplirait)',
  (r ->> 'beta') = 'false' and (r ->> 'bordereaux_vinted') = 'false', r::text from (select public.messagerie_compteurs() r) x;
update profiles set extension_version = '0.6.140' where id = '90ace0e4-3dbd-4e4f-b23e-02cd27dbd1b3';
insert into _r select 'B12 compteurs, extension 0.6.140 : « À expédier » et génération ouverts, messagerie fermée',
  (r ->> 'beta') = 'false' and (r ->> 'bordereaux_vinted') = 'true' and (r ->> 'generation') = 'true' and r ->> 'envoi_mode' is null
  and (r ->> 'a_expedier')::int >= 2, r::text from (select public.messagerie_compteurs() r) x;

-- C. Session du compte bêta.
select set_config('request.jwt.claim.sub', 'f44b5917-bccc-4431-ba41-f40571a2ed18', true),
       set_config('request.jwt.claims', '{"sub":"f44b5917-bccc-4431-ba41-f40571a2ed18","role":"authenticated"}', true);
insert into _r select 'C1 bêta : relevé Vinted complet (pas « commandes seules »)',
  (r ->> 'commandes_seules') = 'false' and ((r ->> 'autorise') = 'true' or r ->> 'motif' <> 'beta'), r::text
  from (select public.messagerie_releve_autorise('vinted') r) x;
insert into _r select 'C2 bêta : relevé Beebs toujours permis (messages)', (r ->> 'autorise') = 'true' or r ->> 'motif' <> 'beta', r::text
  from (select public.messagerie_releve_autorise('beebs') r) x;
insert into _r select 'C3 bêta : compteurs « beta » et « bordereaux_vinted »', (r ->> 'beta') = 'true' and (r ->> 'bordereaux_vinted') = 'true', left(r::text, 200)
  from (select public.messagerie_compteurs() r) x;
insert into _r select 'C4 aucune erreur d''automatique tracée', count(*) = 0, count(*)::text
  from usage_logs where feature = 'bordereau_auto_erreur' and created_at = now();
select essai, ok, left(detail, 300) detail from _r order by essai;
