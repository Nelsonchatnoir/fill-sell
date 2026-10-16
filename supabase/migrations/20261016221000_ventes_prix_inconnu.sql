-- ═══════════════════════════════════════════════════════════════════════════
-- VENTES À 0 € : LE PRIX D'UNE VENTE NÉE D'UN JOB (16/10/2026, point C1)
-- ═══════════════════════════════════════════════════════════════════════════
-- Constat (prod, 16/10 au soir, lecture seule) : 128 notes de vente
-- (push_ventes, née d'un job : origine « job » 91, « declaree » 37) SANS PRIX
-- depuis le 06/10, toutes Vinted, toutes des REPUBLICATIONS ; 84 sur les 7
-- derniers jours. push_trg_job passait new.price, NULL sur une republication
-- (le prix est dans platform_fields.prix_recreation / republish_snapshot.prix,
-- cf. 20261011170000) ; push-ventes écrivait alors « vendu 0 € »
-- (Number(null) || 0), et un bénéfice NÉGATIF quand le prix d'achat est connu :
-- 45 mails depuis le 06/10 (17 comptes), dont 26 sur 7 jours (14 comptes), dont
-- 9 avec un bénéfice négatif. Aucune notification push (0 appareil).
-- Les VENTES (table ventes) de ces notes ont toutes leur prix : seul le prix
-- ANNONCÉ manquait.
--
-- Ce que fait cette migration (réécrite DEPUIS pg_get_functiondef de la prod
-- du 16/10 au soir ; seuls les blocs « (16/10, C1) » changent) :
--   1. _prix_ou_null, prix_vente_enregistree, prix_vente_du_job : UNE règle
--      du prix d'une vente née d'un job (ordre plus bas) ;
--   2. push_trg_job : la note naît avec ce prix (inconnu → NULL, jamais 0) ;
--   3. push_ventes_a_envoyer : une note de JOB décidée (sa vente est
--      enregistrée, règle du 09/10) annonce le prix de la vente ENREGISTRÉE.
-- Le mail (push-ventes) n'écrit plus aucun montant ni bénéfice pour un prix
-- inconnu (fonction edge, déployée à part). Les notes déjà nées sans prix :
-- scripts/reparations/20261016_ventes_prix_zero.sql (aucun mail renvoyé).
-- Inverse : supabase/rollbacks/20261016221000_ventes_prix_inconnu.sql
-- ⛔ Appliquer : db query --linked -f <ce fichier> PUIS migration repair
--    --linked --status applied 20261016221000 (feu vert nommé de Nico).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. UN PRIX LISIBLE : > 0, sinon NULL ───────────────────────────────────
-- Miroir de prixLisible (src/utils/prixBandeauVente.js) : un 0 n'est pas un
-- prix de vente, c'est une absence ; « 14.0 », « 10,5 » se lisent ; le reste
-- (vide, texte, négatif) → NULL. Jamais deviné.
CREATE OR REPLACE FUNCTION public._prix_ou_null(p text)
 RETURNS numeric
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  -- CASE imbriqué : la conversion n'est tentée QUE sur un texte de chiffres
  -- (l'ordre d'un AND n'est pas garanti).
  SELECT CASE WHEN s.x ~ '^[0-9]+([.][0-9]+)?$' THEN CASE WHEN s.x::numeric > 0 THEN s.x::numeric END END
    FROM (SELECT replace(replace(regexp_replace(coalesce(p, ''), '[[:space:]]', '', 'g'), chr(160), ''), ',', '.') AS x) s;
$function$;

-- ── 2. LE PRIX DE LA VENTE ENREGISTRÉE POUR CE JOB (SON REÇU) ─────────────
-- Le reçu de la vente (ventes_operations, clé de l'opération du job ou de son
-- annonce — les clés de push_vente_enregistree) → ses ventes → prix > 0.
-- C'est le prix confirmé par la personne, ou celui de la transaction relevée.
-- ⛔ eBay : jamais (règle du 11/10 : eBay = la commande, jamais l'annonce —
--    une annonce eBay en quantité se vend plusieurs fois, son reçu par annonce
--    peut être celui d'une AUTRE commande) ; le prix du job y est toujours posé.
CREATE OR REPLACE FUNCTION public.prix_vente_enregistree(p_user uuid, p_platform text, p_listing text, p_pf jsonb)
 RETURNS numeric
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT v.prix_vente
    FROM public.ventes_operations o
    CROSS JOIN LATERAL jsonb_array_elements_text(
      CASE WHEN jsonb_typeof(o.resultat -> 'ventes_ids') = 'array' THEN o.resultat -> 'ventes_ids' ELSE '[]'::jsonb END) e(vid)
    JOIN public.ventes v
      ON v.id = CASE WHEN e.vid ~ '^[0-9]{1,18}$' THEN e.vid::bigint END AND v.user_id = o.user_id
   WHERE p_user IS NOT NULL
     AND p_platform IS DISTINCT FROM 'ebay'
     AND o.user_id = p_user
     AND o.cle IN (nullif(p_pf ->> 'vente_operation_cle', ''),
                   'annonce:' || p_platform || ':' || nullif(btrim(coalesce(p_listing, '')), ''))
     AND v.prix_vente > 0
   ORDER BY (o.cle = nullif(p_pf ->> 'vente_operation_cle', '')) DESC NULLS LAST, v.id
   LIMIT 1;
$function$;

-- ── 3. LE PRIX D'UNE VENTE NÉE D'UN JOB : UNE SEULE RÈGLE ─────────────────
-- (16/10, Nico) « Quand le job n'a pas de prix, le prendre sur la fiche du
-- stock, le dernier prix publié ou la transaction. Si aucun n'est connu, le
-- mail n'affiche AUCUN montant. » Ordre (chaque source : > 0, sinon la
-- suivante) :
--   1. la vente ENREGISTRÉE (reçu) : la transaction ou le prix confirmé ;
--   2. le prix lu sur la plateforme à la vente (detected_price) ;
--   3. le prix du job (price) ;
--   4. le dernier prix PUBLIÉ par une republication (prix_recreation, puis
--      republish_snapshot.prix) ;
--   5. le prix de vente de la FICHE du stock (il a pu changer après la mise en
--      ligne : il passe après ce qui a été publié) ;
--   aucun → NULL (inconnu). Même ordre que le bandeau (prixParDefautDuBandeau)
--   et que ventes_prouvees_a_enregistrer : le mail annonce le prix enregistré.
CREATE OR REPLACE FUNCTION public.prix_vente_du_job(p_user uuid, p_platform text, p_listing text,
                                                    p_price numeric, p_pf jsonb, p_inv bigint)
 RETURNS numeric
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT coalesce(
    public.prix_vente_enregistree(p_user, p_platform, p_listing, p_pf),
    public._prix_ou_null(p_pf ->> 'detected_price'),
    CASE WHEN p_price > 0 THEN p_price END,
    public._prix_ou_null(p_pf ->> 'prix_recreation'),
    public._prix_ou_null(p_pf #>> '{republish_snapshot,prix}'),
    (SELECT i.prix_vente FROM public.inventaire i
      WHERE i.id = p_inv AND i.user_id = p_user AND i.prix_vente > 0));
$function$;

REVOKE ALL ON FUNCTION public._prix_ou_null(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prix_vente_enregistree(uuid, text, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prix_vente_du_job(uuid, text, text, numeric, jsonb, bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._prix_ou_null(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.prix_vente_enregistree(uuid, text, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.prix_vente_du_job(uuid, text, text, numeric, jsonb, bigint) TO service_role;

-- ── 4. LE DÉCLENCHEUR : LA NOTE NAÎT AVEC SON PRIX (prod du 16/10 + bloc C1) ──
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
begin
  begin
    v_pf := public.plateforme_normalisee(new.platform);
    v_annonce := nullif(btrim(coalesce(new.platform_listing_id, '')), '');
    v_declaree := public.push_declaration_en_cours(new.user_id, new.inventaire_id);
    if not v_declaree then
      v_dispa := least(public._ts_ou_null(new.platform_fields ->> 'unavailable_since'),
                       public._ts_ou_null(new.platform_fields ->> 'unavailable_pending_since'));
      if v_pf is distinct from 'vinted' then
        -- Inchangé (définition EN PROD du 06/10 après-midi).
        if v_dispa is not null then
          if v_dispa < now() - interval '24 hours' then return new; end if;
        elsif not (coalesce(new.voie, '') = 'api' and new.status = 'sold') then
          if old.last_checked_at is null or old.last_checked_at < now() - interval '24 hours' then
            return new;
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

-- ── 5. LA DÉCISION : UNE NOTE DE JOB ANNONCE LA VENTE ENREGISTRÉE (prod du 16/10 + blocs C1) ──
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
$function$
;
