-- INVERSE de 20261105180000_mail_a_chaque_vente : push_trg_job et push_trg_ventes remises à leur définition de prod du
-- 05/11 (pg_get_functiondef), mot pour mot. md5 sans CR : push_trg_job 13b1cb3aff9ef824e02cdea9716ad989 ; push_trg_ventes c239ab8d93e194ff3a0bbe8bd798146e.
-- La migration n'écrit aucune ligne. Les notes (push_ventes) nées DEPUIS par les règles neuves et les mails partis ne se
-- défont pas ici.
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
      if v_pf is null or not public.push_plateforme_suivie(new.user_id, v_pf) then return new; end if;
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
