-- ═══════════════════════════════════════════════════════════════════════════
-- LE MAIL « VENDU » APRÈS LA VENTE, JAMAIS AVANT NI SANS (09/10, Bebertdeals)
-- ═══════════════════════════════════════════════════════════════════════════
-- ⛔ NON APPLIQUÉE — décision de Nico (le rejeu sur 30 jours fait perdre son mail
-- à UNE vraie vente non prouvée : RoCotCot, Leboncoin, note 808, 08/10). Sa
-- partie 1 (la lecture de page = preuve) est APPLIQUÉE à part, le 09/10, par
-- 20261009130000_vinted_preuve_page.sql ; la rejouer ici est sans effet.
-- Application (règle du 01/10) :
--   npx supabase db query --linked -f supabase/migrations/20261009160000_mail_apres_la_vente.sql
--   npx supabase migration repair --linked --status applied 20261009160000
-- Inverse prêt : scripts/reparations/20261009_inverse_mail_apres_la_vente.sql
-- Preuve avant application (transaction annulée, aucun mail) :
--   node scripts/push/preuve-mail-apres-vente.mjs --avec-migration=20261009160000
--
-- CE QUI S'EST PASSÉ. 09/10 11:43, le veilleur de l'extension de Bebertdeals
-- lit « vendue » sur la PAGE de deux annonces Vinted (10282272590, 10293985723 :
-- is_closed + item_closing_action « sold », lues par leur numéro exact ; la page
-- publique, ouverte sans session, affiche bien « Vendu »). Il pose sale_signal
-- « sold » sur leurs jobs → push_trg_job crée les notes 900 / 901 → 11:46 deux
-- mails « vendu ». Mais AUCUNE vente n'est enregistrée : ventes_prouvees_tick
-- ne reconnaît pour Vinted que le relevé du DRESSING « sold » (dernier relevé :
-- 08/10 19:44, « active ») ou une preuve `sale_evidence` exacte — que le
-- veilleur de page n'écrit pas pour Vinted (il l'écrit pour Depop). Le mail
-- (signal) et la vente (preuve) ne suivaient pas la même règle : mail parti,
-- article toujours en stock, copies toujours en ligne ailleurs.
--
-- MESURÉ sur l'ère des mails (06/10 15:00 → 09/10 12:00), 72 mails « vendu »
-- de jobs Vinted : 58 sur un signal du veilleur de PAGE — 0 démenti (aucun
-- relevé « active » après, aucun signal retiré), 44 confirmés plus tard par un
-- relevé du dressing « sold », les 11 encore sans vente TOUS « Vendu » sur leur
-- page publique (vérifié sans session le 09/10) ; 14 sur un signal de la
-- SYNCHRO du dressing — dont 4 faux (Louis, annonces EN LIGNE aujourd'hui,
-- signal retiré par la synchro suivante, mail parti quand même).
--
-- LA RÈGLE, UNE SEULE, TOUTES PLATEFORMES :
--  1. PREUVE (Vinted) — la lecture de la PAGE de l'annonce par le veilleur, sur
--     son numéro exact, est une preuve exacte, comme pour Depop et eBay : le
--     déclencheur ci-dessous la pose en `sale_evidence` au moment même où le
--     veilleur écrit son signal (règle de Nico du 28/09 : une vente vue sur
--     l'identifiant exact s'enregistre seule, puis retire ses copies prouvées).
--     Signature du veilleur, sans ambiguïté : il écrit last_checked_at ET
--     unavailable_since dans la MÊME écriture, au même instant (la synchro du
--     dressing ne touche jamais last_checked_at), et la page lue est celle de
--     listing_url, dont le numéro = platform_listing_id.
--     → ventes_prouvees_tick (cron 52) l'enregistre dans les 2 minutes : vente,
--       article vendu, retraits des copies prouvées (enregistrer_vente_atomique,
--       ses gardes inchangées).
--  2. MAIL APRÈS LA VENTE — une note d'origine « job » (signal posé sur un job)
--     n'annonce RIEN tant que la vente n'est pas ENREGISTRÉE
--     (push_vente_enregistree) ; elle attend 24 h au plus, puis se clôt sans
--     rien envoyer (motif « vente_non_enregistree »). Un signal non prouvé
--     (indisponible, masqué, lecture ambiguë, synchro collée au mauvais job)
--     reste la question de l'app (bandeau « Vendue ? ») : aucun mail, aucun
--     stock touché, aucun retrait. Si la personne confirme, sa note
--     « declaree » rend la note du signal doublon (règle du 06/10 inchangée).
-- Les notes nées d'une vente déjà enregistrée (commande relevée « commande »,
-- statut « sold » posé par enregistrer_vente_atomique) passent comme avant.
--
-- ⛔ Hors de cette règle, dit et non corrigé ici (décision de Nico) : les notes
-- « annonce » (relevé « vendue » sur une annonce sans job : 2 mails en 30 j,
-- aucune vente derrière) et « vinted » (fiche passée « sold » par la synchro :
-- 10 mails, ventes toutes enregistrées) — aucune voie n'enregistre encore leur
-- vente seule ; les retenir ferait perdre leur mail à des ventes réelles.
-- ⛔ Leboncoin / Beebs / Opla : leur lecture « vendue » reste un SIGNAL (aucune
-- preuve posée ici) : la note attend une vente enregistrée — 1 mail en 30 j
-- (Leboncoin, vente confirmée 15 h plus tard par la personne) ne serait pas parti.
--
-- MESURE (règle « tâche automatique mesurée, bornée ») : aucune tâche nouvelle.
-- Le déclencheur ne s'exécute que sur la transition sale_signal → « sold » d'un
-- job Vinted publié (≈ 20 par jour au parc) ; push_vente_enregistree ne lit
-- que des lignes par clé primaire / (user_id, cle) / (user_id, annonce_id).

-- ── 1. La lecture de page du veilleur Vinted = preuve exacte ───────────────
CREATE OR REPLACE FUNCTION public.vinted_preuve_page_veilleur()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_id  text := nullif(btrim(coalesce(new.platform_listing_id, '')), '');
  v_sig timestamptz := public._ts_ou_null(new.platform_fields ->> 'unavailable_since');
begin
  if v_id is null or v_sig is null or new.last_checked_at is null then return new; end if;
  -- Le veilleur écrit sa lecture (last_checked_at) et son signal dans la MÊME
  -- écriture ; la synchro du dressing ne touche jamais last_checked_at.
  if new.last_checked_at is not distinct from old.last_checked_at then return new; end if;
  if abs(extract(epoch from (new.last_checked_at - v_sig))) > 2 then return new; end if;
  -- La page lue est celle de listing_url : son numéro doit être CELUI du job.
  if coalesce(substring(new.listing_url from '/items/([0-9]+)'), '') <> v_id then return new; end if;
  new.platform_fields := new.platform_fields || jsonb_build_object('sale_evidence', jsonb_build_object(
    'platform', 'vinted', 'listing_id', v_id, 'state', 'sold', 'exact', true,
    'source', 'page_annonce_veilleur', 'lu_le', new.platform_fields ->> 'unavailable_since',
    'pose_par', 'vinted_preuve_page_veilleur'));
  return new;
end;
$function$;

-- <declencheur>
DROP TRIGGER IF EXISTS cross_post_jobs_vinted_preuve_page ON public.cross_post_jobs;
CREATE TRIGGER cross_post_jobs_vinted_preuve_page
  BEFORE UPDATE OF platform_fields ON public.cross_post_jobs
  FOR EACH ROW
  WHEN (new.platform = 'vinted' AND new.action IN ('publish', 'republish') AND new.status = 'published'
        AND (new.platform_fields ->> 'sale_signal') = 'sold'
        AND (old.platform_fields ->> 'sale_signal') IS DISTINCT FROM 'sold'
        AND NOT (new.platform_fields ? 'sale_evidence'))
  EXECUTE FUNCTION public.vinted_preuve_page_veilleur();
-- </declencheur>

-- ── 2. Une vente de job est-elle ENREGISTRÉE ? ─────────────────────────────
CREATE OR REPLACE FUNCTION public.push_vente_enregistree(p_job uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select exists (
    select 1 from public.cross_post_jobs jj
     where jj.id = p_job and jj.status = 'sold'
       and (exists (select 1 from public.ventes_operations o
                     where o.user_id = jj.user_id
                       and o.cle in (jj.platform_fields ->> 'vente_operation_cle',
                                     'annonce:' || jj.platform || ':' || btrim(coalesce(jj.platform_listing_id, ''))))
            or exists (select 1 from public.ventes v
                        where v.user_id = jj.user_id
                          and v.annonce_id = nullif(btrim(coalesce(jj.platform_listing_id, '')), ''))));
$function$;
REVOKE ALL ON FUNCTION public.push_vente_enregistree(uuid) FROM PUBLIC, anon, authenticated;

-- ── 3. La décision des notes : définition EN PROD du 09/10 (pg_get_functiondef)
--       + la note de job attend sa vente (trois blocs « (09/10) »). ──────────
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
        'mail', r.mail_statut = 'a_envoyer', 'email', v_prof.email, 'lang', v_prof.lang);
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
      -- Même vente déjà annoncée (push ou mail), ou déclarée par la personne.
      if exists (select 1 from public.push_ventes o
                  where o.user_id = v_user and o.id <> r.id
                    and (o.part_le is not null or o.statut in ('envoyee', 'en_envoi', 'declaree'))
                    and o.cree_le > now() - interval '3 days'
                    and o.cles && v_cles) then
        update public.push_ventes set statut = 'doublon', cles = v_cles, traite_le = now() where id = r.id;
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
        'email', v_prof.email, 'lang', v_prof.lang);
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
