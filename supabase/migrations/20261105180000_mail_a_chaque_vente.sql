-- ═══════════════════════════════════════════════════════════════════════════
-- RÈGLE DE NICO (05/11) : UN MAIL (ET UN PUSH) À CHAQUE VENTE DÉTECTÉE, TOUT DE SUITE ; UNE VENTE = UN MAIL, JAMAIS DEUX
-- ═══════════════════════════════════════════════════════════════════════════
-- PRÉPARÉE, NON APPLIQUÉE : feu vert NOMMÉ de Nico requis. Preuve : PREUVE_PG=embarque node scripts/preuve-mail-a-chaque-vente.mjs
-- (Postgres jetable, schéma public de prod lu en lecture seule) ; selftest statique : npm run selftest:mail-a-chaque-vente.
-- Diagnostic (prod, lecture seule, 05/11) :
--  A. push_trg_job (déclencheur cross_post_jobs_push_vendu), branche hors Vinted : « old.last_checked_at NULL ou > 24 h →
--     return new » AVANT push_noter. Une vente Leboncoin prouvée (sale_evidence transaction_leboncoin « Achat en cours » =
--     vente payée, règle VOULUE, inchangée) sur un dépôt que la veille n'a pas relu depuis 24 h n'avait ni note ni mail :
--     61 jobs « Achat en cours » sans note en 30 jours (23 comptes) ; assopmfrance 05/11 (ventes 460662–460670, dépôts
--     jamais relus) ; Louis 01/11.
--  B. push_trg_ventes('releve') : « plateforme suivie » (un relevé d'annonces terminé < 24 h) exigée même quand la date
--     de vente est lue : 21 ventes eBay (ebay-ventes-sync n'écrit aucun vinted_sync_runs) et 42 Vinted sans mail.
--  C. Doublon eBay : relevé (clé commande:ebay:) et chemin du job (job: / fiche:) sans clé commune.
-- Changements (rien d'autre) :
--  push_trg_job — (A) quand la veille n'a pas relu le dépôt depuis 24 h, la note naît quand même si une preuve existe :
--     preuve EXACTE de CETTE annonce lue < 24 h (une annonce close — sale_evidence.fin — il y a plus de 24 h n'en est pas
--     une), publication < 48 h, ou relevé (push_preuve_en_ligne : vue en ligne hier ou aujourd'hui) ; la preuve est
--     gardée dans push_ventes.preuve_recente. Le return new ne part que si AUCUNE preuve n'existe. En amont, inchangées :
--     « déclarée », « Vendu » (transaction terminée), « rattrapage > 24 h », disparition > 24 h, voie API vendue, Vinted.
--     (C, l'autre sens) un job eBay qui passe « vendu » par une vente déjà notée par le relevé ne se note pas : même
--     commande (vente_commande_ebay, preuve order_id) ou, preuve sans numéro de commande, la vente relevée de CETTE
--     annonce datée de sa fin (± 10 min ; sans fin : dans les 3 jours) — 3 doubles mails en octobre (1828/1829,
--     2577/2776, 4345/4370), un risque que (B) étendrait à tous les comptes eBay.
--  push_trg_ventes — (B) branche releve : une date de vente lue < 24 h est sa propre preuve
--     (v_pf is null or (new.vendu_le is null and not push_plateforme_suivie(...))) ; (C) eBay : la même vente déjà
--     notée (même commande, même job par sa preuve / son reçu, même fiche à pièce unique) ne se note pas.
--  Inchangés : push_noter, push_ventes_a_envoyer (décision par compte sous verrou, doublons, rafale ≥ 8 ventes en
--  5 min = rattrapage de masse, 24 h d'attente d'une note de job), push-ventes (garde Vinted, un mail par note,
--  email_logs_vente_unique), toute autre fonction. Aucune donnée écrite par la migration.
-- Définitions de départ lues EN PROD le 05/11 (pg_get_functiondef), md5 sans CR :
--   push_trg_job()     13b1cb3aff9ef824e02cdea9716ad989
--   push_trg_ventes()  c239ab8d93e194ff3a0bbe8bd798146e
-- Appliquer (après le feu vert) :
--   npx supabase db query --linked -f supabase/migrations/20261105180000_mail_a_chaque_vente.sql
--   npx supabase migration repair --linked --status applied 20261105180000
-- Inverse : supabase/rollbacks/20261105180000_mail_a_chaque_vente_INVERSE.sql (prod mot pour mot).
-- ⚠ Rafale (règle du 06/10, NON touchée) : 8 ventes distinctes ou plus d'un compte en 5 minutes = « rattrapage de masse »,
--   aucun mail. Les 9 ventes d'assopmfrance (05/11 14:59, une seule lecture) y tombent AVEC cette migration : leur mail
--   demande une décision de Nico sur la rafale.
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

COMMIT;
