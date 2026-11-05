-- ═══════════════════════════════════════════════════════════════════════════
-- DÉCISIONS DE NICO (05/11 soir) : c) UNE RAFALE = UN MAIL RÉCAPITULATIF (un seul) ; d) UNE TRACE QUAND UNE
-- NOTIFICATION EST ÉCARTÉE PAR UNE PARADE DOUBLON ; e) AUCUN RATTRAPAGE DES VENTES PASSÉES
-- ═══════════════════════════════════════════════════════════════════════════
-- PRÉPARÉE, NON APPLIQUÉE : feu vert NOMMÉ de Nico requis. Preuve : PREUVE_PG=embarque node scripts/preuve-rafale-recapitulatif.mjs
-- (Postgres jetable, schéma public de prod relu en lecture seule) ; selftest statique : node scripts/rafale-recapitulatif-selftest.mjs.
-- ⛔ ORDRE : déployer D'ABORD la fonction edge push-ventes (elle sait envoyer un récapitulatif ; sans récapitulatif en
--   base elle fait exactement ce qu'elle faisait), PUIS appliquer cette migration. Dans l'autre ordre, l'ancienne
--   push-ventes enverrait le récapitulatif comme une vente seule (un mail « N articles vendus » mal libellé).
-- Changements (rien d'autre) :
--  c) push_ventes_a_envoyer — la rafale (8 ventes distinctes ou plus d'un compte en 5 min, compte INCHANGÉ hormis la
--     note récapitulative elle-même, jamais comptée) n'ignore plus tout : elle ouvre UNE note récapitulative
--     (push_ventes, origine 'rafale'). Les notes du compte la rejoignent (statut 'ignoree', motif 'rafale:<id>' : aucun
--     envoi à l'unité) jusqu'à son départ : plus aucune vente qui attend une porte et 15 s de calme, au plus tard 6 min.
--     Chaque vente prête (mêmes portes et même ordre que la décision unitaire : push_ventes_rafale_porte, nouvelle,
--     lecture seule) est décidée (part_le, clés relues, prix annoncé ; motif 'recapitulatif:<id>') et listée dans
--     push_ventes.articles de la note récapitulative ; celle-ci est servie UNE fois à push-ventes ('recap': true) :
--     un mail (réservation « vente:<id> », index email_logs_vente_unique) et un push. Le récapitulatif parti, la même
--     rafale (moins de 5 min) n'envoie plus rien (« rattrapage_de_masse », comme avant). Relances : 'recap' transmis.
--  d) push_trg_ventes (C) et push_trg_job (C') — une ligne usage_logs « vente_notification_ecartee » (raison
--     parade_ebay_releve / parade_ebay_job, identifiants de la vente) juste avant le return new de la parade ; rien
--     d'autre ne change, aucune écriture sur le chemin normal.
--  e) Aucune donnée écrite par la migration. Une note déjà close (« rattrapage_de_masse » d'avant, statut 'ignoree')
--     n'est jamais reprise : seules les notes « a_envoyer » rejoignent une rafale. En prod le 05/11 : 171 notes
--     « rattrapage_de_masse » sur 30 jours (6 comptes) ; assopmfrance (ca9afe24) n'en a AUCUNE — ses 9 ventes de 14:59
--     n'ont jamais eu de note (défaut A, avant 20261105180000) et n'en auront pas.
--  Inchangés : push_noter, push_vente_deja_signalee, push_ventes_resultat, la décision unitaire (une ligne ajoutée à sa
--  sélection : jamais la note récapitulative), tables, index, contraintes, crons.
-- Définitions de départ lues EN PROD le 05/11 (pg_get_functiondef), md5 sans CR :
--   push_trg_job()                   44419b65a0d5e3031da349106a80da00
--   push_trg_ventes()                52dc9401d6133fcf2fd406c602d0ae5f
--   push_ventes_a_envoyer(integer)   dd07d5c6c40f260220ba05f2380cabe6
--   push_ventes_rafale_porte(bigint) absente
-- Arrivée (md5 sans CR) : push_trg_job f2928ca29ce2f793726b9494a873b2eb ; push_trg_ventes eb3c16595a335ac43ab40e0852bf97e2 ;
--   push_ventes_a_envoyer 6d8d2af393adbe52e8474d7281260e24 ; push_ventes_rafale_porte bcafe2b01214ea460bb2f92357b35892.
-- Appliquer (après le déploiement de push-ventes et le feu vert) :
--   npx supabase db query --linked -f supabase/migrations/20261105220000_rafale_recapitulatif_et_trace.sql
--   npx supabase migration repair --linked --status applied 20261105220000
-- Inverse : supabase/rollbacks/20261105220000_rafale_recapitulatif_et_trace_INVERSE.sql (prod mot pour mot).
BEGIN;

CREATE OR REPLACE FUNCTION public.push_trg_job()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_pf text;
  v_declaree boolean;
  v_dispa timestamptz;
  v_annonce text;
  v_debut_hier timestamptz;
  v_vu timestamptz;
  v_preuve text;
  v_prix numeric;
  v_lu timestamptz;
  v_fin timestamptz;
begin
  begin
    v_pf := public.plateforme_normalisee(new.platform);
    v_annonce := nullif(btrim(coalesce(new.platform_listing_id, '')), '');
    v_declaree := public.push_declaration_en_cours(new.user_id, new.inventaire_id);
    if not v_declaree then
      -- (22/10, Leboncoin) Une transaction TERMINÉE (« Vendu ») lue par le relevé : la vente date d'avant la
      -- lecture, jamais une vente du moment — aucune note (ni mail ni notification). « Achat en cours » : inchangé.
      if new.platform_fields #>> '{sale_evidence,source}' = 'transaction_leboncoin'
         and new.platform_fields #>> '{sale_evidence,statut}' = 'sold' then
        return new;
      end if;
      -- (24/10, décision 7 de Nico) Un RATTRAPAGE par lecture fraîche (le même état déjà lu avant, vente pas encore
      -- enregistrée) : aucune note — ni mail ni notification — pour une vente de plus de 24 h. La première lecture de
      -- cet état a plus de 24 h, ou elle est inconnue : la vente n'est pas du moment.
      if new.platform_fields #>> '{sale_evidence,source}' = 'transaction_leboncoin'
         and new.platform_fields #> '{sale_evidence,rattrapage}' is not null
         and coalesce(public._ts_ou_null(new.platform_fields #>> '{sale_evidence,rattrapage,premiere_lecture}'), '-infinity'::timestamptz)
             < now() - interval '24 hours' then
        return new;
      end if;
      v_dispa := least(public._ts_ou_null(new.platform_fields ->> 'unavailable_since'),
                       public._ts_ou_null(new.platform_fields ->> 'unavailable_pending_since'));
      if v_pf is distinct from 'vinted' then
        -- (05/11, parade doublon eBay, l'autre sens) Le job eBay passe « vendu » par une commande que le relevé des
        -- ventes a DÉJÀ notée (push_trg_ventes) : ebay_commande_appliquer pose vente_commande_ebay dans la même
        -- écriture ; la preuve « order_confirmation » porte le numéro de commande, sur CETTE annonce ; une preuve sans
        -- numéro de commande (annonce close lue par l'API Browse) désigne la vente relevée de CETTE annonce datée de sa
        -- fin (± 10 min) — sans date de fin, la vente relevée de cette annonce dans les 3 jours. Une vente = une note :
        -- entre ces deux chemins eBay n'a aucune clé commune (jamais l'annonce seule, push_vente_deja_signalee). Vu en
        -- prod : notes 1828/1829, 2577/2776, 4345/4370 (octobre, deux mails pour une vente).
        if v_pf = 'ebay' and exists (
             select 1 from public.push_ventes o
              where o.user_id = new.user_id and o.job_id is null
                and (o.part_le is not null or o.statut in ('a_envoyer', 'en_envoi', 'envoyee', 'declaree'))
                and (o.cles && array['commande:ebay:' || nullif(btrim(coalesce(new.platform_fields #>> '{vente_commande_ebay,commande}', '')), '')]
                     or (v_annonce is not null and o.cles && array['annonce:ebay:' || v_annonce]
                         and (split_part(coalesce(o.commande_ref, ''), ':', 1)
                                = nullif(btrim(coalesce(new.platform_fields #>> '{sale_evidence,order_id}', '')), '')
                              or (nullif(btrim(coalesce(new.platform_fields #>> '{sale_evidence,order_id}', '')), '') is null
                                  and nullif(btrim(coalesce(new.platform_fields #>> '{vente_commande_ebay,commande}', '')), '') is null
                                  and o.cree_le > now() - interval '3 days' and o.vendu_le is not null
                                  and (case when public._ts_ou_null(new.platform_fields #>> '{sale_evidence,fin}') is not null
                                            then abs(extract(epoch from (o.vendu_le - public._ts_ou_null(new.platform_fields #>> '{sale_evidence,fin}')))) <= 600
                                            else o.vendu_le <= now() + interval '5 minutes' end)))))) then
          -- (05/11 soir, décision d de Nico) La notification écartée laisse UNE trace (usage_logs), jamais sur le
          -- chemin normal : la raison et les identifiants de la vente que ce job aurait notée une seconde fois.
          insert into public.usage_logs (user_id, feature, metadata)
          values (new.user_id, 'vente_notification_ecartee', jsonb_build_object(
            'raison', 'parade_ebay_job', 'plateforme', v_pf, 'job_id', new.id, 'statut', new.status,
            'annonce_id', v_annonce, 'commande', new.platform_fields #>> '{vente_commande_ebay,commande}',
            'order_id', new.platform_fields #>> '{sale_evidence,order_id}', 'inventaire_id', new.inventaire_id));
          return new;
        end if;
        -- Inchangé (définition EN PROD du 06/10 après-midi).
        if v_dispa is not null then
          if v_dispa < now() - interval '24 hours' then return new; end if;
        elsif not (coalesce(new.voie, '') = 'api' and new.status = 'sold') then
          if old.last_checked_at is null or old.last_checked_at < now() - interval '24 hours' then
            -- (05/11, règle de Nico : un mail à CHAQUE vente) La veille n'a pas relu ce dépôt depuis 24 h (dépôt
            -- importé jamais relu : assopmfrance 05/11, Louis 01/11). La vente reste « du moment » si une AUTRE preuve
            -- le dit : la preuve EXACTE de CETTE annonce lue il y a moins de 24 h (sale_evidence exact : transaction
            -- Leboncoin « Achat en cours », commande, page vendue — une annonce close il y a plus de 24 h n'en est pas
            -- une), une publication de moins de 48 h, ou le relevé qui l'a vue en ligne hier ou aujourd'hui. Aucune
            -- preuve : rien, comme avant.
            v_lu := coalesce(public._ts_ou_null(new.platform_fields #>> '{sale_evidence,observed_at}'),
                             public._ts_ou_null(new.platform_fields #>> '{sale_evidence,lu_le}'));
            v_fin := public._ts_ou_null(new.platform_fields #>> '{sale_evidence,fin}');
            if new.platform_fields #>> '{sale_evidence,exact}' = 'true'
               and new.platform_fields #>> '{sale_evidence,state}' = 'sold'
               and new.platform_fields #>> '{sale_evidence,platform}' = new.platform
               and btrim(coalesce(new.platform_fields #>> '{sale_evidence,listing_id}', '')) = v_annonce
               and v_lu >= now() - interval '24 hours' and v_lu <= now() + interval '5 minutes'
               and (v_fin is null or v_fin >= now() - interval '24 hours') then
              v_preuve := 'exacte:' || coalesce(new.platform_fields #>> '{sale_evidence,source}', 'page_annonce')
                          || ':' || to_char(v_lu at time zone 'Europe/Paris', 'YYYY-MM-DD"T"HH24:MI');
            elsif new.published_at > now() - interval '48 hours' then
              v_preuve := 'publiee:' || to_char(new.published_at at time zone 'Europe/Paris', 'YYYY-MM-DD"T"HH24:MI');
            else
              v_preuve := public.push_preuve_en_ligne(new.user_id, v_pf, v_annonce, null);
            end if;
            if v_preuve is null then
              return new;  -- aucune preuve : rien (comme avant)
            end if;
            perform set_config('fillsell.push_preuve', v_preuve, true);
          end if;
        end if;
      else
        -- Vinted : une disparition constatée il y a plus de 24 h n'est pas une vente du moment.
        if v_dispa is not null and v_dispa < now() - interval '24 hours' then return new; end if;
        -- Jamais une annonce déjà vue vendue un jour précédent.
        if public.push_vinted_vendue_avant(new.user_id, v_annonce) then return new; end if;
        v_debut_hier := ((now() at time zone 'Europe/Paris')::date - 1)::timestamp at time zone 'Europe/Paris';
        -- La veille l'a lue EN LIGNE hier ou aujourd'hui (la lecture qui voit la
        -- vente ne compte pas : c'est l'état d'AVANT qui prouve).
        v_vu := greatest(old.vu_en_ligne_le,
                         case when old.status = 'published'
                               and (old.platform_fields ->> 'sale_signal') is null
                               and (old.platform_fields ->> 'unavailable_since') is null
                               and (old.platform_fields ->> 'unavailable_pending_since') is null
                               and coalesce(old.platform_fields ->> 'check_unknown_count', '0') = '0'
                               and coalesce(old.platform_fields ->> 'check_unresolved', 'false') <> 'true'
                              then old.last_checked_at end);
        if v_vu >= v_debut_hier and v_vu <= now() + interval '5 minutes' then
          v_preuve := 'veille:' || to_char(v_vu at time zone 'Europe/Paris', 'YYYY-MM-DD"T"HH24:MI');
        elsif new.published_at > now() - interval '48 hours' then
          v_preuve := 'publiee:' || to_char(new.published_at at time zone 'Europe/Paris', 'YYYY-MM-DD"T"HH24:MI');
        else
          v_preuve := public.push_preuve_en_ligne(new.user_id, v_pf, v_annonce, null);
        end if;
        if v_preuve is null then return new; end if;  -- aucune preuve récente : rien
        perform set_config('fillsell.push_preuve', v_preuve, true);
      end if;
    end if;
    -- (16/10, C1) Le prix ANNONCÉ : une REPUBLICATION n'a pas de `price`
    -- (prix dans prix_recreation / republish_snapshot) ; la note naissait
    -- sans prix et le mail écrivait « vendu 0 € ». prix_vente_du_job : vente
    -- enregistrée > prix lu à la vente > prix du job > dernier prix publié >
    -- fiche ; aucun → NULL (inconnu, jamais 0). Une panne de ce calcul ne
    -- coûte jamais la note : repli sur new.price, comme avant.
    begin
      v_prix := coalesce(public.prix_vente_du_job(new.user_id, new.platform, new.platform_listing_id,
                                                  new.price, new.platform_fields, new.inventaire_id),
                         new.price);
    exception when others then
      v_prix := new.price;
    end;
    perform public.push_noter(new.user_id, 'job', v_pf, null, new.inventaire_id, new.id,
      null, v_annonce, new.title, v_prix, null, null,
      v_declaree);
  exception when others then
    perform set_config('fillsell.push_preuve', '', true);
    raise warning 'push_trg_job (job %) : % — vente poursuivie', new.id, sqlerrm;
  end;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.push_trg_ventes()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_pf text;
begin
  begin
    v_pf := public.plateforme_normalisee(coalesce(nullif(btrim(new.plateforme_code), ''), new.plateforme));
    if tg_argv[0] = 'releve' then
      if new.vendu_le is not null and new.vendu_le < now() - interval '24 hours' then return new; end if;
      if new.vendu_le is not null and new.vendu_le > now() + interval '1 hour' then return new; end if;
      -- (05/11, règle de Nico : un mail à CHAQUE vente) Une date de vente LUE sur la plateforme, de moins de 24 h (bornes
      -- ci-dessus), est sa propre preuve : plus besoin d'un relevé d'annonces terminé dans les 24 h (ebay-ventes-sync
      -- n'en écrit aucun : 21 ventes eBay et 42 Vinted relevées sans mail en 30 jours). Sans date : « plateforme
      -- suivie », comme avant. Avant :
      --   if v_pf is null or not public.push_plateforme_suivie(new.user_id, v_pf) then return new; end if;
      if v_pf is null or (new.vendu_le is null and not public.push_plateforme_suivie(new.user_id, v_pf)) then return new; end if;
      -- (05/11, parade doublon eBay) La même vente déjà notée par un autre chemin ne se note pas une seconde fois :
      -- (1) la même COMMANDE (clé commande:ebay:<ref>) ; (2) le même JOB — sa preuve (order_id), sa commande
      -- (vente_commande_ebay) ou son reçu (ventes_operations : une vente de cette commande, ou sans commande quand le
      -- job n'en porte aucune, enregistrée après cette vente) désigne CETTE commande sur CETTE annonce ; (3) la même
      -- FICHE à pièce unique (clé fiche:). Une note compte si elle est partie, déclarée, ou en attente d'une décision
      -- qui viendra (job déjà « vendu »). Deux commandes différentes d'une même annonce restent deux ventes.
      if v_pf = 'ebay' and exists (
           select 1 from public.push_ventes o
            where o.user_id = new.user_id
              and o.vente_id is distinct from new.id
              and (o.part_le is not null or o.statut in ('en_envoi', 'envoyee', 'declaree')
                   or (o.statut = 'a_envoyer' and (o.job_id is null or exists (
                         select 1 from public.cross_post_jobs js where js.id = o.job_id and js.status = 'sold'))))
              and (o.cles && array['commande:ebay:' || nullif(btrim(coalesce(new.commande_ref, '')), '')]
                   or (o.job_id is not null and o.cree_le > now() - interval '3 days' and exists (
                         select 1 from public.cross_post_jobs j
                          where j.id = o.job_id and j.user_id = new.user_id and j.platform = 'ebay'
                            and nullif(btrim(coalesce(j.platform_listing_id, '')), '') = nullif(btrim(coalesce(new.annonce_id, '')), '')
                            and (j.platform_fields #>> '{vente_commande_ebay,commande}' = new.commande_ref
                                 or j.platform_fields #>> '{sale_evidence,order_id}' = split_part(new.commande_ref, ':', 1)
                                 or exists (
                                      select 1 from public.ventes_operations r
                                        join public.ventes w on w.user_id = r.user_id
                                         and w.id::text in (select jsonb_array_elements_text(case when jsonb_typeof(r.resultat -> 'ventes_ids') = 'array'
                                                                                                  then r.resultat -> 'ventes_ids' else '[]'::jsonb end))
                                       where r.user_id = new.user_id
                                         and (r.job_id = j.id or r.cle = j.platform_fields ->> 'vente_operation_cle')
                                         and w.id <> new.id
                                         and (w.commande_ref = new.commande_ref
                                              or (w.commande_ref is null
                                                  and coalesce(j.platform_fields #>> '{vente_commande_ebay,commande}',
                                                               j.platform_fields #>> '{sale_evidence,order_id}') is null
                                                  and w.created_at >= coalesce(new.vendu_le, new.created_at) - interval '10 minutes'))))))
                   or (new.inventaire_id is not null and o.cree_le > now() - interval '3 days'
                       and o.cles && array['fiche:' || new.inventaire_id::text]
                       and exists (select 1 from public.inventaire i where i.id = new.inventaire_id and coalesce(i.quantite, 1) <= 1)))) then
        -- (05/11 soir, décision d de Nico) La notification écartée laisse UNE trace (usage_logs), jamais sur le
        -- chemin normal : la raison et les identifiants de la vente relevée qui n'est pas notée une seconde fois.
        insert into public.usage_logs (user_id, feature, metadata)
        values (new.user_id, 'vente_notification_ecartee', jsonb_build_object(
          'raison', 'parade_ebay_releve', 'plateforme', v_pf, 'vente_id', new.id, 'commande_ref', new.commande_ref,
          'annonce_id', new.annonce_id, 'inventaire_id', new.inventaire_id, 'vendu_le', new.vendu_le));
        return new;
      end if;
      perform public.push_noter(new.user_id, 'commande', v_pf, new.id, new.inventaire_id, null,
        new.commande_ref, new.annonce_id, new.titre, new.prix_vente, new.devise, new.vendu_le, false);
    elsif tg_argv[0] = 'personne' or public.push_declaration_en_cours(new.user_id, new.inventaire_id) then
      perform public.push_noter(new.user_id, 'declaree', v_pf, new.id, new.inventaire_id, null,
        new.commande_ref, new.annonce_id, new.titre, new.prix_vente, new.devise, new.vendu_le, true);
    end if;
  exception when others then
    raise warning 'push_trg_ventes (vente %) : % — vente enregistrée quand même', new.id, sqlerrm;
  end;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.push_ventes_rafale_porte(p_note bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
-- (05/11 soir, décision c de Nico) Une note d'une RAFALE passe les MÊMES portes que la décision unitaire de
-- push_ventes_a_envoyer, dans le même ordre, sans rien écrire : etat 'attend' (commande sans annonce ni fiche de
-- moins de 3 min, signal Vinted de moins de 2 min, vente du job pas encore enregistrée — règle du 09/10), 'dementi'
-- (signal retiré), 'doublon' (motif : vente déjà signalée, même job ou fiche annoncés en 3 jours) ou 'prete' ;
-- cles : les clés relues (annonce et fiche de la vente). Toute porte changée dans la décision unitaire se change ICI.
declare
  r       record;
  v_v     record;
  v_q     integer;
  v_cles  text[];
  v_motif text;
begin
  select * into r from public.push_ventes where id = p_note;
  if not found then return null; end if;
  v_cles := r.cles;
  -- Le relevé Vinted pose la commande d'abord, l'annonce ensuite : on relit.
  if r.vente_id is not null then
    select v.annonce_id, v.inventaire_id into v_v from public.ventes v where v.id = r.vente_id;
    if found then
      if v_v.annonce_id is not null and r.plateforme is not null then
        v_cles := v_cles || ('annonce:' || r.plateforme || ':' || v_v.annonce_id);
      end if;
      if v_v.inventaire_id is not null then
        select coalesce(i.quantite, 1) into v_q from public.inventaire i where i.id = v_v.inventaire_id;
        if coalesce(v_q, 1) <= 1 then v_cles := v_cles || ('fiche:' || v_v.inventaire_id::text); end if;
      end if;
    end if;
  end if;
  -- Une commande sans annonce ni fiche attend son second temps (3 min au plus).
  if not exists (select 1 from unnest(v_cles) k where k like 'annonce:%' or k like 'fiche:%' or k like 'job:%')
     and r.cree_le > now() - interval '3 minutes' then
    return jsonb_build_object('etat', 'attend', 'motif', 'commande_sans_annonce', 'cles', to_jsonb(v_cles));
  end if;
  v_cles := array(select distinct k from unnest(v_cles) k);
  -- (08/10) Un signal Vinted de job attend 2 minutes (la synchro du dressing peut le démentir).
  if r.origine = 'job' and r.plateforme = 'vinted' and r.cree_le > now() - interval '2 minutes' then
    return jsonb_build_object('etat', 'attend', 'motif', 'signal_vinted', 'cles', to_jsonb(v_cles));
  end if;
  if r.origine = 'job' and r.job_id is not null and not exists (
       select 1 from public.cross_post_jobs jj where jj.id = r.job_id
          and (jj.status = 'sold' or jj.platform_fields ->> 'sale_signal' = 'sold')) then
    return jsonb_build_object('etat', 'dementi', 'motif', 'signal_dementi', 'cles', to_jsonb(v_cles));
  end if;
  -- (11/10) Une annonce vendue ne se signale qu'une fois ; même job ou même fiche (pièce unique) en 3 jours.
  v_motif := public.push_vente_deja_signalee(r.user_id, r.plateforme, v_cles, r.cree_le, r.id, false);
  if v_motif is null and exists (select 1 from public.push_ventes o
              where o.user_id = r.user_id and o.id <> r.id
                and (o.part_le is not null or o.statut in ('envoyee', 'en_envoi', 'declaree'))
                and o.cree_le > now() - interval '3 days'
                and o.cles && array(select k from unnest(v_cles) k where k like 'job:%' or k like 'fiche:%')) then
    v_motif := 'meme_job_ou_fiche';
  end if;
  if v_motif is not null then
    return jsonb_build_object('etat', 'doublon', 'motif', v_motif, 'cles', to_jsonb(v_cles));
  end if;
  -- (09/10) Le mail après la vente, jamais avant ni sans : une note de job attend sa vente enregistrée.
  if r.origine = 'job' and r.job_id is not null and not public.push_vente_enregistree(r.job_id) then
    return jsonb_build_object('etat', 'attend', 'motif', 'vente_non_enregistree', 'cles', to_jsonb(v_cles));
  end if;
  return jsonb_build_object('etat', 'prete', 'motif', null, 'cles', to_jsonb(v_cles));
end;
$function$
;

REVOKE ALL ON FUNCTION public.push_ventes_rafale_porte(bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.push_ventes_rafale_porte(bigint) TO service_role;

CREATE OR REPLACE FUNCTION public.push_ventes_a_envoyer(p_limite integer DEFAULT 50)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
 SET statement_timeout TO '10s'
 SET lock_timeout TO '2s'
AS $function$
declare
  v_user     uuid;
  r          record;
  v_v        record;
  v_q        integer;
  v_cles     text[];
  v_app      jsonb;
  v_prof     record;
  v_rafale   integer;
  v_out      jsonb := '[]'::jsonb;
  v_n        integer := 0;
  v_attente  numeric;
  v_motif    text;
  v_prix     numeric;
  v_j        record;
  v_rec      record;
  v_ouverte  boolean;
  v_attend   boolean;
  v_porte    jsonb;
  v_lignes   jsonb;
  v_nb       integer;
begin
  -- Un envoi interrompu (fonction tuée) repart, trois essais au plus — par canal.
  -- Une note déjà décidée (part_le) ne repasse jamais par la décision : elle
  -- repart par la boucle des relances, plus bas, canal par canal.
  update public.push_ventes
     set statut = case when essais >= 3 then 'echec' else 'a_envoyer' end,
         motif  = case when essais >= 3 then 'envoi_interrompu' else motif end
   where statut = 'en_envoi' and traite_le < now() - interval '3 minutes';
  update public.push_ventes
     set mail_statut = case when mail_essais >= 3 then 'echec' else 'a_envoyer' end,
         mail_motif  = case when mail_essais >= 3 then 'envoi_interrompu' else mail_motif end
   where mail_statut = 'en_envoi' and mail_traite_le < now() - interval '3 minutes';
  -- (09/10, Bebertdeals) Une note de JOB attend que sa vente soit ENREGISTRÉE
  -- (push_vente_enregistree, plus bas) : 24 h au plus, puis elle se clôt SANS
  -- mail ni push.
  update public.push_ventes set statut = 'ignoree', motif = 'vente_non_enregistree', traite_le = now()
   where statut = 'a_envoyer' and part_le is null and origine = 'job' and cree_le < now() - interval '24 hours';
  -- Une note jamais décidée en 2 h n'apprend plus rien à personne (hors notes
  -- de job : elles attendent leur vente, ci-dessus).
  update public.push_ventes set statut = 'ignoree', motif = 'trop_tard', traite_le = now()
   where statut = 'a_envoyer' and part_le is null and cree_le < now() - interval '2 hours'
     and origine is distinct from 'job';
  -- Le journal ne garde que 30 jours (borné : 500 lignes par passage).
  delete from public.push_ventes where id in (
    select id from public.push_ventes where cree_le < now() - interval '30 days' limit 500);

  for v_user in
    select x.user_id from (
      select p.user_id, min(p.cree_le) as d from public.push_ventes p
       where p.statut = 'a_envoyer' and p.part_le is null and p.cree_le < now() - interval '15 seconds'
         -- (09/10) une note de job qui attend sa vente ne prend pas la place
         -- des autres comptes : elle revient dès que la vente est enregistrée.
         and (p.origine is distinct from 'job' or p.job_id is null
              or p.cree_le > now() - interval '5 minutes' or public.push_vente_enregistree(p.job_id))
       group by p.user_id
      union all
      select p.user_id, min(coalesce(p.mail_traite_le, p.traite_le, p.cree_le)) from public.push_ventes p
       where p.part_le is not null and (p.statut = 'a_envoyer' or p.mail_statut = 'a_envoyer')
       group by p.user_id
    ) x group by x.user_id order by min(x.d) limit 20
  loop
    -- Un seul appel décide pour un compte ; l'autre passe (il reviendra).
    if not pg_try_advisory_xact_lock(hashtextextended('push_ventes:' || v_user::text, 0)) then
      continue;
    end if;
    select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'plateforme', a.plateforme,
                                                 'jeton', a.jeton, 'apns_env', a.apns_env)), '[]'::jsonb)
      into v_app from public.appareils_push a where a.user_id = v_user;
    select p.email, coalesce(p.lang, 'fr') as lang into v_prof from public.profiles p where p.id = v_user;

    -- Relances d'une vente déjà décidée « part » : chaque canal en attente
    -- repart seul ; la décision n'est jamais refaite.
    for r in
      select * from public.push_ventes
       where user_id = v_user and part_le is not null
         and (statut = 'a_envoyer' or mail_statut = 'a_envoyer')
       order by id
       for update skip locked
    loop
      update public.push_ventes set
        statut = case when statut = 'a_envoyer'
                      then case when jsonb_array_length(v_app) > 0 then 'en_envoi' else 'sans_appareil' end
                      else statut end,
        essais = essais + case when statut = 'a_envoyer' and jsonb_array_length(v_app) > 0 then 1 else 0 end,
        traite_le = case when statut = 'a_envoyer' then now() else traite_le end,
        mail_statut = case when mail_statut = 'a_envoyer' then 'en_envoi' else mail_statut end,
        mail_essais = mail_essais + case when mail_statut = 'a_envoyer' then 1 else 0 end,
        mail_traite_le = case when mail_statut = 'a_envoyer' then now() else mail_traite_le end
       where id = r.id;
      v_out := v_out || jsonb_build_object(
        'id', r.id, 'user_id', v_user, 'plateforme', r.plateforme, 'titre', r.titre,
        'prix', r.prix, 'devise', r.devise, 'inventaire_id', r.inventaire_id,
        -- (17/10, point 11) la note d'une commande Vinted porte SES articles : UN mail les liste tous.
        'vente_id', r.vente_id, 'articles', r.articles,
        'appareils', case when r.statut = 'a_envoyer' then v_app else '[]'::jsonb end,
        'push', r.statut = 'a_envoyer' and jsonb_array_length(v_app) > 0,
        'mail', r.mail_statut = 'a_envoyer', 'email', v_prof.email, 'lang', v_prof.lang,
        -- (11/10) Vente détectée, pas encore enregistrée : le mail mène à la liste « à confirmer ».
        -- (05/11 soir) Le récapitulatif d'une rafale (origine 'rafale') : chaque ligne porte le sien (articles).
        'a_decider', r.origine is distinct from 'rafale' and r.vente_id is null and not (r.origine = 'job' and r.job_id is not null
                                                  and public.push_vente_enregistree(r.job_id)),
        'recap', r.origine = 'rafale');
      v_n := v_n + 1;
      exit when v_n >= p_limite;
    end loop;
    exit when v_n >= p_limite;

    -- Rattrapage de masse : 8 VENTES DISTINCTES (ou plus) en 5 minutes. Une
    -- même vente vue par plusieurs chemins (signal de la veille, relevé,
    -- commande) partage au moins une clé : elle ne compte qu'UNE fois.
    -- (05/11 soir) La note récapitulative d'une rafale (origine 'rafale') n'est pas une vente : jamais comptée.
    select count(*) into v_rafale from public.push_ventes p
     where p.user_id = v_user and p.origine not in ('declaree', 'essai', 'rafale')
       and p.statut not in ('declaree', 'doublon') and p.cree_le > now() - interval '5 minutes'
       and not exists (
         select 1 from public.push_ventes o
          where o.user_id = v_user and o.id < p.id
            and o.origine not in ('declaree', 'essai', 'rafale') and o.statut not in ('declaree', 'doublon')
            and o.cree_le > now() - interval '5 minutes'
            and o.cles && p.cles);
    -- ═══ (05/11 soir, décision c de Nico) UNE RAFALE = UN MAIL RÉCAPITULATIF, UN SEUL ═══
    -- Avant : la rafale ignorait toutes les notes du compte (« rattrapage_de_masse »), AUCUN mail.
    -- Désormais elle ouvre UNE note récapitulative (origine 'rafale'). Tant qu'elle n'est pas partie, toute note du
    -- compte la rejoint (statut 'ignoree', motif 'rafale:<id>') : jamais un mail ni un push à l'unité. Elle part
    -- quand aucune de ses ventes n'attend plus une porte (push_ventes_rafale_porte : les MÊMES portes que la
    -- décision unitaire, plus bas, dans le même ordre) et que la dernière arrivée a 15 s — au plus tard 6 min après
    -- son ouverture (ce qui attend encore : « rattrapage_de_masse », comme avant). Chaque vente prête est DÉCIDÉE
    -- comme une vente seule (part_le, clés relues, prix annoncé ; motif 'recapitulatif:<id>') : les doublons
    -- d'après la reconnaissent. Une note = une réservation « vente:<id> » (email_logs_vente_unique) : UN mail, UN
    -- push. Le récapitulatif parti, la même rafale qui continue (moins de 5 min) n'envoie plus rien (règle
    -- d'avant). Jamais rétroactif : une note déjà close (« rattrapage_de_masse » d'avant) n'est jamais reprise.
    select * into v_rec from public.push_ventes
     where user_id = v_user and origine = 'rafale' and statut = 'a_envoyer' and part_le is null
     order by id limit 1;
    v_ouverte := found;
    if v_ouverte or v_rafale >= 8 then
      if not v_ouverte then
        if exists (select 1 from public.push_ventes x
                    where x.user_id = v_user and x.origine = 'rafale' and x.part_le > now() - interval '5 minutes') then
          update public.push_ventes set statut = 'ignoree', motif = 'rattrapage_de_masse', traite_le = now()
           where user_id = v_user and statut = 'a_envoyer' and part_le is null;
          continue;
        end if;
        insert into public.push_ventes (user_id, origine, titre, statut, lot)
        values (v_user, 'rafale', 'Rafale de ventes', 'a_envoyer', pg_current_xact_id()::text::bigint)
        returning * into v_rec;
      end if;
      update public.push_ventes set statut = 'ignoree', motif = 'rafale:' || v_rec.id, traite_le = now()
       where user_id = v_user and statut = 'a_envoyer' and part_le is null and origine is distinct from 'rafale';
      -- Part-elle à ce passage ? 15 s de calme et plus aucune vente qui attend une porte — ou 6 min passées.
      v_attend := false;
      if v_rec.cree_le > now() - interval '6 minutes' then
        if v_rec.cree_le > now() - interval '15 seconds' or exists (
             select 1 from public.push_ventes m
              where m.user_id = v_user and m.motif = 'rafale:' || v_rec.id and m.cree_le > now() - interval '15 seconds') then
          v_attend := true;
        else
          for r in select m.id from public.push_ventes m
                    where m.user_id = v_user and m.motif = 'rafale:' || v_rec.id and m.statut = 'ignoree' and m.part_le is null
                    order by m.id
          loop
            if public.push_ventes_rafale_porte(r.id) ->> 'etat' = 'attend' then v_attend := true; exit; end if;
          end loop;
        end if;
      end if;
      if v_attend then continue; end if;
      v_lignes := '[]'::jsonb;
      for r in select * from public.push_ventes m
                where m.user_id = v_user and m.motif = 'rafale:' || v_rec.id and m.statut = 'ignoree' and m.part_le is null
                order by m.id
                for update skip locked
      loop
        v_porte := public.push_ventes_rafale_porte(r.id);
        v_cles := array(select jsonb_array_elements_text(coalesce(v_porte -> 'cles', '[]'::jsonb)));
        if v_porte ->> 'etat' = 'attend' then
          update public.push_ventes set motif = 'rattrapage_de_masse', traite_le = now() where id = r.id;
          continue;
        elsif v_porte ->> 'etat' = 'dementi' then
          update public.push_ventes set motif = 'signal_dementi', traite_le = now() where id = r.id;
          continue;
        elsif v_porte ->> 'etat' = 'doublon' then
          update public.push_ventes set statut = 'doublon', motif = v_porte ->> 'motif', cles = v_cles, traite_le = now()
           where id = r.id;
          continue;
        end if;
        -- Prête : le prix ANNONCÉ, la même règle que la décision unitaire (16/10, C1).
        v_prix := r.prix;
        if r.origine = 'job' and r.job_id is not null then
          begin
            select jj.user_id, jj.platform, jj.platform_listing_id, jj.price, jj.platform_fields, jj.inventaire_id
              into v_j from public.cross_post_jobs jj where jj.id = r.job_id;
            if found then
              v_prix := coalesce(public.prix_vente_enregistree(v_j.user_id, v_j.platform, v_j.platform_listing_id, v_j.platform_fields),
                                 r.prix,
                                 public.prix_vente_du_job(v_j.user_id, v_j.platform, v_j.platform_listing_id,
                                                          v_j.price, v_j.platform_fields, v_j.inventaire_id));
            end if;
          exception when others then
            v_prix := r.prix;
          end;
        end if;
        update public.push_ventes
           set part_le = now(), cles = v_cles, prix = v_prix, motif = 'recapitulatif:' || v_rec.id, traite_le = now()
         where id = r.id;
        v_lignes := v_lignes || jsonb_build_object(
          'note', r.id, 'titre', r.titre, 'prix', v_prix, 'devise', r.devise, 'plateforme', r.plateforme,
          'inventaire_id', r.inventaire_id, 'vente_id', r.vente_id, 'articles', r.articles,
          'a_decider', r.vente_id is null and not (r.origine = 'job' and r.job_id is not null
                                                    and public.push_vente_enregistree(r.job_id)));
      end loop;
      if jsonb_array_length(v_lignes) = 0 then
        update public.push_ventes set statut = 'ignoree', motif = 'rafale_sans_vente', traite_le = now() where id = v_rec.id;
        continue;
      end if;
      -- Une vente par article (règle du 17/10) : une commande Vinted compte ses articles.
      select coalesce(sum(case when jsonb_typeof(l -> 'articles') = 'array' and jsonb_array_length(l -> 'articles') > 0
                               then jsonb_array_length(l -> 'articles') else 1 end), 0)::integer
        into v_nb from jsonb_array_elements(v_lignes) l;
      update public.push_ventes
         set part_le = now(), traite_le = now(), articles = v_lignes, titre = v_nb || case when v_nb > 1 then ' ventes d''un coup' else ' vente' end,
             statut = case when jsonb_array_length(v_app) > 0 then 'en_envoi' else 'sans_appareil' end,
             essais = essais + case when jsonb_array_length(v_app) > 0 then 1 else 0 end,
             mail_statut = case when nullif(btrim(coalesce(v_prof.email, '')), '') is null then 'sans_adresse' else 'en_envoi' end,
             mail_traite_le = now(),
             mail_essais = mail_essais + case when nullif(btrim(coalesce(v_prof.email, '')), '') is null then 0 else 1 end
       where id = v_rec.id;
      v_out := v_out || jsonb_build_object(
        'id', v_rec.id, 'user_id', v_user, 'plateforme', null, 'titre', v_nb || case when v_nb > 1 then ' ventes d''un coup' else ' vente' end,
        'prix', null, 'devise', null, 'inventaire_id', null, 'vente_id', null, 'articles', v_lignes,
        'appareils', v_app, 'push', jsonb_array_length(v_app) > 0,
        'mail', nullif(btrim(coalesce(v_prof.email, '')), '') is not null,
        'email', v_prof.email, 'lang', v_prof.lang, 'a_decider', false, 'recap', true, 'nb_ventes', v_nb);
      v_n := v_n + 1;
      exit when v_n >= p_limite;
      continue;
    end if;

    for r in
      select * from public.push_ventes
       where user_id = v_user and statut = 'a_envoyer' and part_le is null
         and cree_le < now() - interval '15 seconds' and origine is distinct from 'rafale'
       order by id
       for update skip locked
    loop
      v_cles := r.cles;
      -- Le relevé Vinted pose la commande d'abord, l'annonce ensuite : on relit.
      if r.vente_id is not null then
        select v.annonce_id, v.inventaire_id into v_v from public.ventes v where v.id = r.vente_id;
        if found then
          if v_v.annonce_id is not null and r.plateforme is not null then
            v_cles := v_cles || ('annonce:' || r.plateforme || ':' || v_v.annonce_id);
          end if;
          if v_v.inventaire_id is not null then
            select coalesce(i.quantite, 1) into v_q from public.inventaire i where i.id = v_v.inventaire_id;
            if coalesce(v_q, 1) <= 1 then v_cles := v_cles || ('fiche:' || v_v.inventaire_id::text); end if;
          end if;
        end if;
      end if;
      -- Une commande sans annonce ni fiche attend son second temps (3 min au plus).
      if not exists (select 1 from unnest(v_cles) k where k like 'annonce:%' or k like 'fiche:%' or k like 'job:%')
         and r.cree_le > now() - interval '3 minutes' then
        continue;
      end if;
      v_cles := array(select distinct k from unnest(v_cles) k);
      -- (08/10, Louis) Le signal de vente d'un JOB doit tenir au moment de
      -- décider : la synchro du dressing dément en quelques secondes une vente
      -- collée au mauvais job (vinted_dressing_dement_signaux). Vinted attend
      -- donc 2 minutes ; un signal retiré n'annonce rien (ni push, ni mail).
      if r.origine = 'job' and r.plateforme = 'vinted' and r.cree_le > now() - interval '2 minutes' then
        continue;
      end if;
      if r.origine = 'job' and r.job_id is not null and not exists (
           select 1 from public.cross_post_jobs jj where jj.id = r.job_id
              and (jj.status = 'sold' or jj.platform_fields ->> 'sale_signal' = 'sold')) then
        update public.push_ventes set statut = 'ignoree', motif = 'signal_dementi', traite_le = now() where id = r.id;
        continue;
      end if;
      -- (11/10, Louis) UNE ANNONCE VENDUE NE SE SIGNALE QU'UNE FOIS. Jusqu'ici,
      -- « même vente déjà annoncée » ne regardait que les notes des 3 DERNIERS
      -- JOURS et jamais le reçu de la vente (ventes_operations) : une fiche à
      -- quantité qui revoit une ancienne annonce Vinted « vendue » au relevé
      -- remailait une vente traitée 3 à 5 jours plus tôt. Désormais, sans limite
      -- de temps (push_vente_deja_signalee) : vente déjà enregistrée AVANT ce
      -- signal, ou même annonce / même commande déjà annoncée ou déclarée →
      -- doublon. eBay : la commande seule, jamais l'annonce (une annonce eBay en
      -- quantité se vend plusieurs fois).
      v_motif := public.push_vente_deja_signalee(v_user, r.plateforme, v_cles, r.cree_le, r.id, false);
      -- Même vente vue par son job ou par sa fiche (pièce unique) : fenêtre de
      -- 3 jours, inchangée (une fiche peut revenir en stock après une annulation).
      if v_motif is null and exists (select 1 from public.push_ventes o
                  where o.user_id = v_user and o.id <> r.id
                    and (o.part_le is not null or o.statut in ('envoyee', 'en_envoi', 'declaree'))
                    and o.cree_le > now() - interval '3 days'
                    and o.cles && array(select k from unnest(v_cles) k where k like 'job:%' or k like 'fiche:%')) then
        v_motif := 'meme_job_ou_fiche';
      end if;
      if v_motif is not null then
        update public.push_ventes set statut = 'doublon', motif = v_motif, cles = v_cles, traite_le = now() where id = r.id;
        continue;
      end if;
      -- (09/10, Bebertdeals) LE MAIL APRÈS LA VENTE, JAMAIS AVANT NI SANS. Un
      -- signal « vendue » posé sur un job (veilleur, synchro du dressing, API)
      -- n'annonce rien tant que la vente n'est pas ENREGISTRÉE. Une preuve
      -- exacte s'enregistre seule en quelques minutes (ventes_prouvees_tick,
      -- veilleur eBay) : la note part alors, après la vente et ses retraits. Un
      -- signal sans preuve reste une question (bandeau « Vendue ? ») : la note
      -- attend 24 h puis se clôt sans rien envoyer (en tête) ; si la personne
      -- confirme elle-même, sa note « declaree » rend celle-ci doublon (ci-dessus).
      if r.origine = 'job' and r.job_id is not null and not public.push_vente_enregistree(r.job_id) then
        continue;
      end if;
      -- (16/10, C1) Le prix ANNONCÉ d'une note de JOB : celui de la vente
      -- ENREGISTRÉE (son reçu : le prix confirmé par la personne, ou la
      -- transaction relevée), à défaut celui de la note, à défaut
      -- prix_vente_du_job. Inconnu = NULL : le mail n'écrit alors aucun
      -- montant (push-ventes). Une panne de ce calcul garde le prix de la note.
      v_prix := r.prix;
      if r.origine = 'job' and r.job_id is not null then
        begin
          select jj.user_id, jj.platform, jj.platform_listing_id, jj.price, jj.platform_fields, jj.inventaire_id
            into v_j from public.cross_post_jobs jj where jj.id = r.job_id;
          if found then
            v_prix := coalesce(public.prix_vente_enregistree(v_j.user_id, v_j.platform, v_j.platform_listing_id, v_j.platform_fields),
                               r.prix,
                               public.prix_vente_du_job(v_j.user_id, v_j.platform, v_j.platform_listing_id,
                                                        v_j.price, v_j.platform_fields, v_j.inventaire_id));
          end if;
        exception when others then
          v_prix := r.prix;
        end;
      end if;
      -- Décidée : elle part. Le push seulement s'il y a un téléphone ; le mail toujours.
      update public.push_ventes
         set part_le = now(), cles = v_cles, traite_le = now(), prix = v_prix,
             statut = case when jsonb_array_length(v_app) > 0 then 'en_envoi' else 'sans_appareil' end,
             essais = essais + case when jsonb_array_length(v_app) > 0 then 1 else 0 end,
             mail_statut = case when nullif(btrim(coalesce(v_prof.email, '')), '') is null then 'sans_adresse' else 'en_envoi' end,
             mail_traite_le = now(),
             mail_essais = mail_essais + case when nullif(btrim(coalesce(v_prof.email, '')), '') is null then 0 else 1 end
       where id = r.id;
      v_out := v_out || jsonb_build_object(
        'id', r.id, 'user_id', v_user, 'plateforme', r.plateforme, 'titre', r.titre,
        'prix', v_prix, 'devise', r.devise, 'inventaire_id', r.inventaire_id,
        -- (17/10, point 11) la note d'une commande Vinted porte SES articles : UN mail les liste tous.
        'vente_id', r.vente_id, 'articles', r.articles, 'appareils', v_app, 'push', jsonb_array_length(v_app) > 0,
        'mail', nullif(btrim(coalesce(v_prof.email, '')), '') is not null,
        'email', v_prof.email, 'lang', v_prof.lang,
        'a_decider', r.vente_id is null and not (r.origine = 'job' and r.job_id is not null
                                                  and public.push_vente_enregistree(r.job_id)));
      v_n := v_n + 1;
      exit when v_n >= p_limite;
    end loop;
    exit when v_n >= p_limite;
  end loop;

  select extract(epoch from (min(cree_le) + interval '16 seconds' - now()))
    into v_attente from public.push_ventes where statut = 'a_envoyer' and part_le is null;
  return jsonb_build_object('notes', v_out, 'attente_s', greatest(coalesce(v_attente, -1), -1));
end;
$function$
;

COMMIT;
