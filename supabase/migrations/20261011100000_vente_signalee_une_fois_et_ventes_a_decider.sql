-- ═══════════════════════════════════════════════════════════════════════════
-- UNE ANNONCE VENDUE NE SE SIGNALE QU'UNE FOIS — et la décision « remettre en
-- vente ou non » se prend dans l'app, sans notification (11/10, cas Louis)
-- ═══════════════════════════════════════════════════════════════════════════
-- Louis (Business, fiches fabriquées à ~9 997 exemplaires) recevait des mails
-- « Vendu sur Vinted » pour des ventes déjà traitées, et ne voyait rien dans
-- l'app pour les ventes jamais traitées.
--
-- CAUSE DES REMAILS (lue en prod le 11/10) : la décision « même vente déjà
-- annoncée » de push_ventes_a_envoyer ne regardait que les notes des 3
-- DERNIERS JOURS (o.cree_le > now() - 3 days) et jamais le reçu de la vente
-- (ventes_operations). Une fiche à quantité garde son vinted_item_id sur une
-- ancienne annonce ; quand le relevé du dressing la voit passer « sold »,
-- inventaire_push_vinted_vendu note une vente neuve. Déclarée le 06/10 17:02
-- (reçus annonce:vinted:10248443064, 10251765273, 10254091481), revue
-- « vendue » les 09, 10 et 11/10 : 3 j 3 h, 4 j, 4 j 16 h plus tard → hors
-- fenêtre → remailée. push_vinted_vendue_avant ne l'arrêtait pas (première
-- photo « sold » du dressing le jour même : l'annonce était restée « active »
-- chez Vinted jusqu'à la veille), ni la garde « vente_ancienne » de
-- push-ventes (fiche vue en ligne la veille = preuve récente).
-- Les 3 ventes « jamais traitées » (10276053804, 10276047846, 10269303712) :
-- mail du 08/10 00:03 sur un signal de la veille (annonces encore EN LIGNE
-- les 08, 09 et 10/10 au dressing ; démenties le 08/10 20:12, notes
-- 'ignoree' signal_dementi), vraie vente vue le 11/10 → nouveau mail, 3 j 8 h
-- après le premier : hors fenêtre. Aucune vente enregistrée : la note
-- 'vinted' part sans attendre de vente (seules les notes de job attendent,
-- règle du 09/10), et rien dans l'app ne montrait une vente sans job signalé.
--
-- RÈGLE (Nico, 11/10) :
--   1. Une annonce vendue ne se signale qu'une fois. Avant de créer une note
--      (push_noter) ET avant tout mail (push_ventes_a_envoyer) :
--      push_vente_deja_signalee — reçu ventes_operations de l'annonce posé
--      AVANT le signal, ou même annonce / même commande déjà annoncée (push ou
--      mail) ou déclarée, SANS LIMITE DE TEMPS → statut 'doublon' (motif
--      vente_deja_enregistree / vente_deja_annoncee), ni push ni mail.
--      eBay : la COMMANDE seule, jamais l'annonce (une annonce eBay en
--      quantité se vend plusieurs fois, ventes_ebay_exemplaires). Leboncoin :
--      deux commandes lues différentes sur une même annonce = deux ventes.
--      Le rapprochement par job ou par fiche (pièce unique) garde sa fenêtre
--      de 3 jours. Les autres règles (ignoree, trop_tard, signal_dementi,
--      vente_non_enregistree, rattrapage de masse, vente_ancienne) : inchangées.
--   2. ventes_a_decider() : les ventes DÉTECTÉES (annoncées par push ou mail)
--      dont la vente n'est pas enregistrée, avec ou sans téléphone — la liste
--      « Ventes à confirmer » de l'app (bandeaux du Stock), où mène le mail.
--      Jamais une vente traitée (reçu, déclarée, job vendu, fiche vendue),
--      jamais une annonce que la plateforme montre de nouveau en ligne, jamais
--      ce que le bandeau « Vendue ? » d'un job porte déjà.
--   3. Le choix passe par le MÊME chemin que la déclaration (check-listing-
--      status → enregistrer_vente_declaree → enregistrer_vente_atomique :
--      ventes_operations, quantité, remises_en_vente). « Ne pas remettre en
--      vente » : p_remettre_en_vente = false → la ligne remises_en_vente naît
--      'abandonnee', motif choix_personne. Aucun second circuit.
--
-- Définitions de départ : EN PROD le 11/10 (pg_get_functiondef).
-- Inverse : scripts/reparations/20261011_inverse_vente_signalee_une_fois.sql
-- Preuve : node scripts/preuves/preuve-vente-signalee-une-fois.mjs (transaction annulée).

BEGIN;

-- ── 1. L'identité d'une vente déjà signalée ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.push_vente_deja_signalee(
  p_user uuid, p_pf text, p_cles text[], p_avant timestamptz DEFAULT now(),
  p_note bigint DEFAULT NULL::bigint, p_anterieures boolean DEFAULT false)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_pf    text := nullif(btrim(coalesce(p_pf, '')), '');
  v_ann   text[];   -- les annonces qui identifient CETTE vente
  v_cmd   text[];   -- les commandes lues
  v_unite boolean;  -- plateforme où une annonce = un exemplaire
begin
  if p_user is null or p_cles is null then return null; end if;
  v_cmd := array(select k from unnest(p_cles) k where k like 'commande:%');
  -- eBay : jamais l'annonce seule (une annonce en quantité se vend plusieurs fois).
  v_ann := array(select k from unnest(p_cles) k
                  where k like 'annonce:%' and k not like 'annonce:ebay:%' and k not like 'annonce:ailleurs:%');
  v_unite := coalesce(v_pf in ('vinted', 'beebs', 'opla', 'depop'), false);

  -- (a) Le reçu de la vente de cette annonce existe, posé AVANT ce signal (une
  --     note de job qui attend SA vente la voit arriver après elle : elle part).
  --     Leboncoin avec une commande lue : la commande seule fait foi.
  if cardinality(v_ann) > 0 and (v_unite or cardinality(v_cmd) = 0)
     and exists (select 1 from public.ventes_operations o
                  where o.user_id = p_user and o.cle = any (v_ann) and o.cree_le < p_avant) then
    return 'vente_deja_enregistree';
  end if;
  -- (b) La même commande a déjà été annoncée ou déclarée (eBay compris).
  if cardinality(v_cmd) > 0 and exists (
       select 1 from public.push_ventes o
        where o.user_id = p_user and o.id is distinct from p_note
          and (not p_anterieures or o.id < p_note)
          and (o.part_le is not null or o.statut in ('envoyee', 'en_envoi', 'declaree'))
          and o.cles && v_cmd) then
    return 'vente_deja_annoncee';
  end if;
  -- (c) La même annonce a déjà été annoncée ou déclarée. Hors plateforme à
  --     l'unité, deux commandes lues DIFFÉRENTES sont deux ventes.
  if cardinality(v_ann) > 0 and exists (
       select 1 from public.push_ventes o
        where o.user_id = p_user and o.id is distinct from p_note
          and (not p_anterieures or o.id < p_note)
          and (o.part_le is not null or o.statut in ('envoyee', 'en_envoi', 'declaree'))
          and o.cles && v_ann
          and (v_unite or cardinality(v_cmd) = 0
               or not exists (select 1 from unnest(o.cles) ok where ok like 'commande:%')
               or o.cles && v_cmd)) then
    return 'vente_deja_annoncee';
  end if;
  return null;
end;
$function$;
REVOKE ALL ON FUNCTION public.push_vente_deja_signalee(uuid, text, text[], timestamptz, bigint, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.push_vente_deja_signalee(uuid, text, text[], timestamptz, bigint, boolean) TO service_role;

-- ── 2. La note naît « doublon » quand la vente est déjà signalée ───────────
CREATE OR REPLACE FUNCTION public.push_noter(p_user uuid, p_origine text, p_pf text, p_vente bigint DEFAULT NULL::bigint, p_inv bigint DEFAULT NULL::bigint, p_job uuid DEFAULT NULL::uuid, p_commande text DEFAULT NULL::text, p_annonce text DEFAULT NULL::text, p_titre text DEFAULT NULL::text, p_prix numeric DEFAULT NULL::numeric, p_devise text DEFAULT NULL::text, p_vendu_le timestamp with time zone DEFAULT NULL::timestamp with time zone, p_declaree boolean DEFAULT false)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_cles text[] := '{}';
  v_q    integer;
  v_pf   text := nullif(btrim(coalesce(p_pf, '')), '');
  v_preuve text := nullif(btrim(coalesce(current_setting('fillsell.push_preuve', true), '')), '');
  v_motif  text;
begin
  -- (06/10 soir) La preuve posée par le déclencheur ne vaut que pour CET appel.
  if v_preuve is not null then perform set_config('fillsell.push_preuve', '', true); end if;
  -- Point d'essai : la preuve « un échec d'envoi ne bloque pas la vente ».
  if coalesce(current_setting('fillsell.push_essai_panne', true), '') = '1' then
    raise exception 'panne simulée (essai)';
  end if;
  if p_user is null then return; end if;
  -- (06/10) Plus de sortie « sans téléphone » : la note porte aussi le mail.

  if p_commande is not null and v_pf is not null then
    v_cles := v_cles || ('commande:' || v_pf || ':' || p_commande);
  end if;
  if p_annonce is not null and v_pf is not null then
    v_cles := v_cles || ('annonce:' || v_pf || ':' || p_annonce);
  end if;
  if p_job is not null then
    v_cles := v_cles || ('job:' || p_job::text);
  end if;
  -- La fiche n'identifie la vente que pour un article à pièce unique : deux
  -- ventes d'une fiche en plusieurs exemplaires sont deux ventes.
  if p_inv is not null then
    select coalesce(i.quantite, 1) into v_q from public.inventaire i where i.id = p_inv;
    if coalesce(v_q, 1) <= 1 or p_declaree then
      v_cles := v_cles || ('fiche:' || p_inv::text);
    end if;
  end if;

  -- (11/10, Louis) Une annonce vendue ne se signale qu'une fois : vente déjà
  -- enregistrée, ou même annonce / même commande déjà annoncée → la note naît
  -- « doublon » (ni push, ni mail, ni ligne « à confirmer »).
  if not p_declaree then
    v_motif := public.push_vente_deja_signalee(p_user, v_pf, v_cles, now(), null, false);
  end if;

  insert into public.push_ventes (
    user_id, origine, plateforme, vente_id, inventaire_id, job_id, commande_ref, annonce_id,
    titre, prix, devise, vendu_le, cles, statut, motif, traite_le, lot, preuve_recente
  ) values (
    p_user, case when p_declaree then 'declaree' else p_origine end, v_pf, p_vente, p_inv, p_job,
    p_commande, p_annonce, left(p_titre, 200), p_prix, p_devise, p_vendu_le, v_cles,
    case when p_declaree then 'declaree' when v_motif is not null then 'doublon' else 'a_envoyer' end,
    v_motif, case when v_motif is not null then now() end,
    pg_current_xact_id()::text::bigint,
    case when p_declaree then null else left(v_preuve, 120) end
  );

  -- Un seul appel par transaction ; pg_net ne part qu'après la validation.
  if not p_declaree and v_motif is null and coalesce(current_setting('fillsell.push_relance', true), '') <> '1' then
    perform set_config('fillsell.push_relance', '1', true);
    perform net.http_post(
      url     := 'https://tojihnuawsoohlolangc.supabase.co/functions/v1/push-ventes',
      headers := ('{"Content-Type":"application/json"}'::jsonb || jsonb_build_object('x-cron-secret', public.cron_secret())),
      body    := '{"trigger":"push_noter"}'::jsonb,
      timeout_milliseconds := 60000
    );
  end if;
end;
$function$;

-- ── 3. La décision avant tout envoi (push ET mail) ──────────────────────────
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
        'vente_id', r.vente_id,
        'appareils', case when r.statut = 'a_envoyer' then v_app else '[]'::jsonb end,
        'push', r.statut = 'a_envoyer' and jsonb_array_length(v_app) > 0,
        'mail', r.mail_statut = 'a_envoyer', 'email', v_prof.email, 'lang', v_prof.lang,
        -- (11/10) Vente détectée, pas encore enregistrée : le mail mène à la liste « à confirmer ».
        'a_decider', r.vente_id is null and not (r.origine = 'job' and r.job_id is not null
                                                  and public.push_vente_enregistree(r.job_id)));
      v_n := v_n + 1;
      exit when v_n >= p_limite;
    end loop;
    exit when v_n >= p_limite;

    -- Rattrapage de masse : 8 VENTES DISTINCTES (ou plus) en 5 minutes. Une
    -- même vente vue par plusieurs chemins (signal de la veille, relevé,
    -- commande) partage au moins une clé : elle ne compte qu'UNE fois.
    select count(*) into v_rafale from public.push_ventes p
     where p.user_id = v_user and p.origine not in ('declaree', 'essai')
       and p.statut not in ('declaree', 'doublon') and p.cree_le > now() - interval '5 minutes'
       and not exists (
         select 1 from public.push_ventes o
          where o.user_id = v_user and o.id < p.id
            and o.origine not in ('declaree', 'essai') and o.statut not in ('declaree', 'doublon')
            and o.cree_le > now() - interval '5 minutes'
            and o.cles && p.cles);
    if v_rafale >= 8 then
      update public.push_ventes set statut = 'ignoree', motif = 'rattrapage_de_masse', traite_le = now()
       where user_id = v_user and statut = 'a_envoyer' and part_le is null;
      continue;
    end if;

    for r in
      select * from public.push_ventes
       where user_id = v_user and statut = 'a_envoyer' and part_le is null
         and cree_le < now() - interval '15 seconds'
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
      -- Décidée : elle part. Le push seulement s'il y a un téléphone ; le mail toujours.
      update public.push_ventes
         set part_le = now(), cles = v_cles, traite_le = now(),
             statut = case when jsonb_array_length(v_app) > 0 then 'en_envoi' else 'sans_appareil' end,
             essais = essais + case when jsonb_array_length(v_app) > 0 then 1 else 0 end,
             mail_statut = case when nullif(btrim(coalesce(v_prof.email, '')), '') is null then 'sans_adresse' else 'en_envoi' end,
             mail_traite_le = now(),
             mail_essais = mail_essais + case when nullif(btrim(coalesce(v_prof.email, '')), '') is null then 0 else 1 end
       where id = r.id;
      v_out := v_out || jsonb_build_object(
        'id', r.id, 'user_id', v_user, 'plateforme', r.plateforme, 'titre', r.titre,
        'prix', r.prix, 'devise', r.devise, 'inventaire_id', r.inventaire_id,
        'vente_id', r.vente_id, 'appareils', v_app, 'push', jsonb_array_length(v_app) > 0,
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
$function$;

-- ── 4. « Ne pas remettre en vente » : la remise naît close ─────────────────
CREATE OR REPLACE FUNCTION public.cross_post_jobs_vendu_remise_en_vente()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  BEGIN
    -- (11/10) « Ne pas remettre en vente » (liste des ventes à confirmer) :
    -- la ligne naît close, motif choix_personne — la file ne la reprend jamais.
    IF COALESCE(current_setting('fillsell.remise_en_vente_refusee', true), '') = '1' THEN
      INSERT INTO remises_en_vente (user_id, inventaire_id, platform, job_vendu, statut, motif, traite_le)
      VALUES (NEW.user_id, NEW.inventaire_id, NEW.platform, NEW.id, 'abandonnee', 'choix_personne', now())
      ON CONFLICT (job_vendu) DO NOTHING;
    ELSE
      INSERT INTO remises_en_vente (user_id, inventaire_id, platform, job_vendu, prochain_essai)
      VALUES (NEW.user_id, NEW.inventaire_id, NEW.platform, NEW.id, now() + interval '2 minutes')
      ON CONFLICT (job_vendu) DO NOTHING;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'remise en vente non notée (job %) : % — vente poursuivie', NEW.id, SQLERRM;
  END;
  RETURN NEW;
END;
$function$;

-- ── 5. La liste « Ventes à confirmer » de l'app ─────────────────────────────
-- Une ligne par annonce : vente détectée et ANNONCÉE (push ou mail), vente non
-- enregistrée, job de l'annonce encore 'published' sans bandeau « Vendue ? »,
-- fiche en stock, annonce toujours vendue au dernier relevé de la plateforme,
-- et les mêmes conditions que l'enregistrement (enregistrer_vente_atomique :
-- annonce non remplacée, exemplaire prouvé). Lecture seule, bornée (100).
CREATE OR REPLACE FUNCTION public.ventes_a_decider()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
 SET statement_timeout TO '5s'
AS $function$
declare
  v_user uuid := auth.uid();
  v_out  jsonb;
begin
  if v_user is null then return '[]'::jsonb; end if;
  select coalesce(jsonb_agg(x.ligne order by x.detectee_le desc), '[]'::jsonb) into v_out
  from (
    select a.detectee_le, jsonb_build_object(
      'cle', 'annonce:' || a.pf || ':' || a.annonce_id,
      'plateforme', a.pf, 'annonce_id', a.annonce_id,
      'job_id', j.id, 'inventaire_id', i.id,
      'titre', coalesce(nullif(btrim(i.titre), ''), j.title, a.titre),
      'prix', coalesce(case when j.platform_fields ->> 'detected_price' ~ '^[0-9]+([.][0-9]+)?$'
                            then (j.platform_fields ->> 'detected_price')::numeric end, j.price, a.prix),
      'quantite', coalesce(i.quantite, 1),
      'listing_url', j.listing_url,
      'detectee_le', a.detectee_le) as ligne
    from (
      select p.plateforme as pf, btrim(p.annonce_id) as annonce_id, min(p.part_le) as detectee_le,
             (array_agg(p.titre order by p.id desc))[1] as titre,
             (array_agg(p.prix order by p.id desc))[1] as prix
        from public.push_ventes p
       where p.user_id = v_user and p.part_le is not null
         and p.origine not in ('declaree', 'essai') and p.vente_id is null
         and nullif(btrim(coalesce(p.annonce_id, '')), '') is not null
         and p.plateforme in ('vinted', 'leboncoin', 'beebs', 'opla', 'depop')
       group by 1, 2
    ) a
    cross join lateral (
      select c.* from public.cross_post_jobs c
       where c.user_id = v_user and c.platform = a.pf and btrim(c.platform_listing_id) = a.annonce_id
         and coalesce(c.action, 'publish') in ('publish', 'republish')
       order by c.created_at desc limit 1) j
    join public.inventaire i on i.id = j.inventaire_id and i.user_id = v_user
   where j.status = 'published'
     -- Le bandeau « Vendue ? » du job la porte déjà : jamais deux questions.
     and j.platform_fields ->> 'sale_signal' is null
     and j.platform_fields ->> 'unavailable_since' is null
     -- Traitée : reçu de la vente, ou vente déclarée par la personne.
     and not exists (select 1 from public.ventes_operations o
                      where o.user_id = v_user
                        and o.cle in ('annonce:' || a.pf || ':' || a.annonce_id,
                                      coalesce(j.platform_fields ->> 'vente_operation_cle', '')))
     and not exists (select 1 from public.push_ventes d
                      where d.user_id = v_user and d.statut = 'declaree'
                        and d.cles @> array['annonce:' || a.pf || ':' || a.annonce_id])
     and i.fusionne_dans is null and i.statut <> 'vendu' and coalesce(i.quantite, 1) > 0
     -- Toujours vendue au dernier relevé de la plateforme.
     and (case when a.pf = 'vinted' then (
             select s.status = 'sold' from public.vinted_listing_snapshots s
              where s.user_id = v_user and s.vinted_item_id = a.annonce_id
              order by s.captured_at desc limit 1)
           else (
             select ap.statut_plateforme = 'vendue' from public.annonces_plateforme ap
              where ap.user_id = v_user and ap.platform = a.pf and ap.listing_id = a.annonce_id
              order by ap.vu_le desc nulls last limit 1) end) is true
     -- Vinted : remplacée par une autre annonce EN LIGNE de la même fiche → pas une vente.
     and not (a.pf = 'vinted' and nullif(btrim(i.vinted_item_id), '') is not null
              and btrim(i.vinted_item_id) <> a.annonce_id
              and coalesce(i.vinted_status, '') = 'active' and i.disparu_le is null
              and exists (select 1 from public.vinted_listing_snapshots s2
                           where s2.user_id = v_user and s2.vinted_item_id = btrim(i.vinted_item_id)
                             and s2.status = 'active' and s2.captured_at > now() - interval '26 hours'))
     and public.retrait_job_prouve(j.id) and public.fiche_annonces_vivantes(i.id, a.pf) < 2
   order by a.detectee_le desc
   limit 100
  ) x;
  return v_out;
end;
$function$;
REVOKE ALL ON FUNCTION public.ventes_a_decider() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ventes_a_decider() TO authenticated, service_role;

-- ── 6. La déclaration porte le choix « remettre en vente ou non » ──────────
-- Même fonction, un paramètre de plus (défaut : remettre, comme avant). Les
-- appels à 3 arguments (app d'avant, scripts de preuve) restent valides.
DROP FUNCTION IF EXISTS public.enregistrer_vente_declaree(uuid, uuid, numeric);
CREATE FUNCTION public.enregistrer_vente_declaree(p_user uuid, p_job uuid, p_prix numeric DEFAULT NULL::numeric,
                                                  p_remettre_en_vente boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  perform set_config('fillsell.vente_declaree', '1', true);
  -- (11/10) « Ne pas remettre en vente » : la remise de CETTE vente naît close
  -- (cross_post_jobs_vendu_remise_en_vente).
  perform set_config('fillsell.remise_en_vente_refusee',
                     case when p_remettre_en_vente is false then '1' else '' end, true);
  return public.enregistrer_vente_atomique(p_user := p_user, p_cle := null, p_job := p_job, p_prix := p_prix);
end;
$function$;
REVOKE ALL ON FUNCTION public.enregistrer_vente_declaree(uuid, uuid, numeric, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enregistrer_vente_declaree(uuid, uuid, numeric, boolean) TO service_role;

COMMIT;
