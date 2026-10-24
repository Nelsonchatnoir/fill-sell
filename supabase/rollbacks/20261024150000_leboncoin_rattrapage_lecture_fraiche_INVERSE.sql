-- INVERSE de 20261024150000 : les trois corps tels qu'ils étaient EN PROD le 24/10 avant la migration.
BEGIN;
SET LOCAL statement_timeout = '60s';

CREATE OR REPLACE FUNCTION public.annonces_plateforme_transaction_leboncoin()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_new text; v_old text;
BEGIN
  BEGIN
    v_new := public.leboncoin_transaction_lue(NEW.transaction_plateforme, NEW.capture);
    IF v_new IS NULL THEN RETURN NULL; END IF;
    IF TG_OP = 'UPDATE' THEN
      v_old := public.leboncoin_transaction_lue(OLD.transaction_plateforme, OLD.capture);
      IF v_new IS NOT DISTINCT FROM v_old THEN RETURN NULL; END IF;
    END IF;
    -- Une annonce lue pour la première fois sans transaction n'a rien à dire.
    IF v_old IS NULL AND v_new = 'aucune' THEN RETURN NULL; END IF;
    PERFORM public.leboncoin_transaction_noter(NEW.id, v_new, v_old);
  EXCEPTION WHEN OTHERS THEN
    -- Jamais un relevé perdu à cause de la règle : la panne est dite, l'écriture passe.
    RAISE WARNING 'annonces_plateforme_transaction_leboncoin (annonce %) : %', NEW.id, SQLERRM;
  END;
  RETURN NULL;
END;
$function$;

CREATE OR REPLACE FUNCTION public.leboncoin_transaction_noter(p_annonce uuid, p_tx text, p_tx_avant text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  a annonces_plateforme%ROWTYPE; j cross_post_jobs%ROWTYPE; i inventaire%ROWTYPE;
  v_ecrit boolean; v_jobs uuid[]; v_issue text; v_detail jsonb := '{}'::jsonb; v_vente bigint; v_r jsonb;
BEGIN
  SELECT * INTO a FROM annonces_plateforme WHERE id = p_annonce;
  IF a.id IS NULL OR a.platform IS DISTINCT FROM 'leboncoin' OR nullif(btrim(a.listing_id), '') IS NULL THEN RETURN NULL; END IF;
  -- Fail-closed : interrupteur absent ou illisible = fantôme.
  v_ecrit := coalesce((SELECT c.value FROM coin_config c WHERE c.key = 'ventes_leboncoin_transaction'), 0) = 1;

  IF p_tx IN ('pending', 'sold') THEN
    -- LE job Leboncoin de CE compte qui porte CE numéro, exactement — jamais un titre.
    SELECT array_agg(c.id) INTO v_jobs FROM cross_post_jobs c
     WHERE c.user_id = a.user_id AND c.platform = 'leboncoin' AND c.status = 'published'
       AND coalesce(c.action, 'publish') IN ('publish', 'republish') AND btrim(coalesce(c.platform_listing_id, '')) = btrim(a.listing_id);
    IF coalesce(array_length(v_jobs, 1), 0) = 0 THEN
      v_issue := CASE WHEN EXISTS (SELECT 1 FROM cross_post_jobs c WHERE c.user_id = a.user_id AND c.platform = 'leboncoin'
                                     AND c.status = 'sold' AND btrim(coalesce(c.platform_listing_id, '')) = btrim(a.listing_id))
                      THEN 'deja_vendue' ELSE 'sans_job' END;
    ELSIF array_length(v_jobs, 1) > 1 THEN
      v_issue := 'doute_deux_jobs';
    ELSE
      SELECT * INTO j FROM cross_post_jobs WHERE id = v_jobs[1];
      SELECT * INTO i FROM inventaire WHERE id = j.inventaire_id AND user_id = j.user_id;
      IF i.id IS NULL OR i.fusionne_dans IS NOT NULL THEN v_issue := 'sans_fiche';
      ELSIF i.statut IS DISTINCT FROM 'stock' THEN v_issue := 'fiche_deja_vendue';         -- déjà déclarée : jamais deux ventes
      ELSIF coalesce(i.quantite, 1) > 1 THEN v_issue := 'plusieurs_exemplaires';           -- pro multi-unités : à la personne
      ELSIF coalesce(j.platform_fields ->> 'sale_signal', '') = 'sold'
            AND j.platform_fields #>> '{sale_evidence,listing_id}' = btrim(a.listing_id) THEN v_issue := 'deja_prouvee';
      ELSE
        v_issue := CASE WHEN v_ecrit THEN 'prouvee' ELSE 'aurait_prouve' END;
        IF v_ecrit THEN
          -- Pas d'unavailable_since : la page publique d'un achat en cours reste « active » et la veille de
          -- l'extension lèverait un drapeau « plus en ligne » — la preuve, elle, ne se lève que par la règle.
          UPDATE cross_post_jobs c
             SET platform_fields = coalesce(c.platform_fields, '{}'::jsonb)
               || CASE WHEN a.prix > 0 THEN jsonb_build_object('detected_price', a.prix) ELSE '{}'::jsonb END
               || jsonb_build_object('sale_signal', 'sold',
                    'sale_evidence', jsonb_build_object('platform', 'leboncoin', 'listing_id', btrim(a.listing_id), 'state', 'sold',
                      'exact', true, 'source', 'transaction_leboncoin', 'statut', p_tx,
                      'libelle', CASE p_tx WHEN 'pending' THEN 'Achat en cours' ELSE 'Vendu' END,
                      'lu_le', now(), 'par', 'releve_leboncoin', 'annonce', a.id))
           WHERE c.id = j.id AND c.status = 'published';
        END IF;
      END IF;
      v_detail := jsonb_build_object('job', j.id, 'inventaire_id', j.inventaire_id::text);
    END IF;

  ELSIF p_tx = 'aucune' AND p_tx_avant = 'pending' AND a.statut_plateforme = 'en_ligne' AND a.disparu_le IS NULL THEN
    -- L'achat en cours a disparu, l'annonce est de nouveau en ligne : achat annulé.
    SELECT * INTO j FROM cross_post_jobs c
     WHERE c.user_id = a.user_id AND c.platform = 'leboncoin' AND btrim(coalesce(c.platform_listing_id, '')) = btrim(a.listing_id)
       AND c.platform_fields #>> '{sale_evidence,source}' = 'transaction_leboncoin' AND c.status IN ('published', 'sold')
     ORDER BY (c.status = 'sold') DESC, c.created_at DESC LIMIT 1;
    IF j.id IS NULL THEN
      v_issue := 'annulation_sans_preuve';
    ELSIF NOT v_ecrit THEN
      v_issue := 'aurait_annule';
    ELSIF j.status = 'published' THEN
      PERFORM signal_vente_lever(j.id, 'transaction_leboncoin_annulee', jsonb_build_object('annonce', a.id, 'lu_le', now()));
      v_issue := 'preuve_levee';
    ELSE
      SELECT v.id INTO v_vente FROM ventes v WHERE v.user_id = a.user_id AND v.plateforme_code = 'leboncoin'
         AND v.annonce_id = btrim(a.listing_id) ORDER BY v.created_at DESC LIMIT 1;
      IF v_vente IS NULL THEN v_issue := 'annulation_vente_introuvable';
      ELSE
        v_r := vente_transaction_annulee_leboncoin(v_vente, 'transaction_annulee');
        v_issue := 'annulation_' || coalesce(v_r ->> 'action', 'inconnue');
        v_detail := v_detail || jsonb_build_object('vente', v_vente::text, 'resultat', v_r);
      END IF;
    END IF;
    v_detail := v_detail || CASE WHEN j.id IS NOT NULL THEN jsonb_build_object('job', j.id) ELSE '{}'::jsonb END;
  ELSIF p_tx NOT IN ('pending', 'sold', 'aucune') THEN
    v_issue := 'valeur_inconnue';
  ELSE
    v_issue := 'sans_effet';                                   -- ex. « sold » → sans transaction : on ne conclut rien
  END IF;

  INSERT INTO usage_logs (user_id, feature, metadata) VALUES (a.user_id, 'vente_leboncoin_transaction',
    jsonb_build_object('annonce', a.id, 'listing_id', a.listing_id, 'titre', left(coalesce(a.titre, ''), 120),
      'transaction', p_tx, 'avant', p_tx_avant, 'issue', v_issue, 'mode', CASE WHEN v_ecrit THEN 'ecrit' ELSE 'fantome' END,
      'run_id', a.run_id) || v_detail);
  RETURN jsonb_build_object('issue', v_issue) || v_detail;
END;
$function$;

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
$function$;

COMMIT;
