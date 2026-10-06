-- ════════════════════════════════════════════════════════════════════════════
-- NOTIFICATIONS DE VENTES — la rafale compte des VENTES, pas des notes (06/10)
-- ════════════════════════════════════════════════════════════════════════════
-- Défaut de 20261006140000, trouvé par la preuve (scripts/push/preuve-push-
-- ventes.mjs, cas B9) avant tout appareil enregistré : la garde « rattrapage
-- de masse » comptait les NOTES. Une seule vente vue par trois chemins
-- (sale_signal de la veille, relevé Vinted « sold », commande relevée) en
-- faisait trois ; trois vraies ventes en 5 minutes passaient pour un
-- rattrapage et AUCUNE notification ne partait.
-- Désormais une note ne compte que si aucune note plus ancienne de la fenêtre
-- ne partage une de ses clés. Les notes d'essai (npm run push:essai) ne
-- comptent pas. Seul ce bloc change ; le reste est la définition EN PROD
-- (pg_get_functiondef, empreinte md5 47e0ee8855e3068d17eefbc959e55927).

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
  v_rafale   integer;
  v_out      jsonb := '[]'::jsonb;
  v_n        integer := 0;
  v_attente  numeric;
begin
  -- Un envoi interrompu (fonction tuée) repart, trois essais au plus.
  update public.push_ventes
     set statut = case when essais >= 3 then 'echec' else 'a_envoyer' end,
         motif  = case when essais >= 3 then 'envoi_interrompu' else motif end
   where statut = 'en_envoi' and traite_le < now() - interval '3 minutes';
  -- Une note qui n'est pas partie en 2 h n'apprend plus rien à personne.
  update public.push_ventes set statut = 'ignoree', motif = 'trop_tard', traite_le = now()
   where statut = 'a_envoyer' and cree_le < now() - interval '2 hours';
  -- Le journal ne garde que 30 jours (borné : 500 lignes par passage).
  delete from public.push_ventes where id in (
    select id from public.push_ventes where cree_le < now() - interval '30 days' limit 500);

  for v_user in
    select p.user_id from public.push_ventes p
     where p.statut = 'a_envoyer' and p.cree_le < now() - interval '15 seconds'
     group by p.user_id order by min(p.cree_le) limit 20
  loop
    select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'plateforme', a.plateforme,
                                                 'jeton', a.jeton, 'apns_env', a.apns_env)), '[]'::jsonb)
      into v_app from public.appareils_push a where a.user_id = v_user;
    if jsonb_array_length(v_app) = 0 then
      update public.push_ventes set statut = 'sans_appareil', traite_le = now()
       where user_id = v_user and statut = 'a_envoyer';
      continue;
    end if;

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
       where user_id = v_user and statut = 'a_envoyer';
      continue;
    end if;

    for r in
      select * from public.push_ventes
       where user_id = v_user and statut = 'a_envoyer' and cree_le < now() - interval '15 seconds'
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
      -- Même vente déjà notifiée, en cours d'envoi, ou déclarée par la personne.
      if exists (select 1 from public.push_ventes o
                  where o.user_id = v_user and o.id <> r.id
                    and o.statut in ('envoyee', 'en_envoi', 'declaree')
                    and o.cree_le > now() - interval '3 days'
                    and o.cles && v_cles) then
        update public.push_ventes set statut = 'doublon', cles = v_cles, traite_le = now() where id = r.id;
        continue;
      end if;
      update public.push_ventes
         set statut = 'en_envoi', cles = v_cles, traite_le = now(), essais = essais + 1
       where id = r.id;
      v_out := v_out || jsonb_build_object(
        'id', r.id, 'user_id', v_user, 'plateforme', r.plateforme, 'titre', r.titre,
        'prix', r.prix, 'devise', r.devise, 'inventaire_id', r.inventaire_id,
        'vente_id', r.vente_id, 'appareils', v_app);
      v_n := v_n + 1;
      exit when v_n >= p_limite;
    end loop;
    exit when v_n >= p_limite;
  end loop;

  select extract(epoch from (min(cree_le) + interval '16 seconds' - now()))
    into v_attente from public.push_ventes where statut = 'a_envoyer';
  return jsonb_build_object('notes', v_out, 'attente_s', greatest(coalesce(v_attente, -1), -1));
end;
$function$;

revoke all on function public.push_ventes_a_envoyer(integer) from public, anon, authenticated;
grant execute on function public.push_ventes_a_envoyer(integer) to service_role;
