-- Essai à blanc de 20261018230000 (18/10 soir) : ROLLBACK. npx supabase db query --linked -f scripts/essais/20261018230000_essai.sql
begin;
create temp table _r (essai text, ok boolean);

create or replace function public.vinted_boutique_du_poste(p_user uuid)
returns text language plpgsql stable security definer set search_path to 'public' as $f$
-- La boutique Vinted ouverte sur le poste qui fait CET appel (claim session_id du JWT), si elle est connue et
-- fraîche (30 min, comme identiteVintedDuPoste) ; plusieurs extensions sur la même session et deux boutiques
-- différentes : inconnue. Hors appel d'une extension : null.
declare v_sid text; v_ids text[];
begin
  if p_user is null then return null; end if;
  begin
    v_sid := nullif(btrim(coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'session_id', '')), '');
  exception when others then return null;
  end;
  if v_sid is null then return null; end if;
  select array_agg(distinct btrim(e.value ->> 'vinted_user_id')) into v_ids
    from profiles p, jsonb_each(case when jsonb_typeof(p.extension_postes) = 'object' then p.extension_postes else '{}'::jsonb end) e
   where p.id = p_user and (e.key = v_sid or e.key like v_sid || '/%')
     and jsonb_typeof(e.value) = 'object'
     and btrim(coalesce(e.value ->> 'vinted_user_id', '')) ~ '^[0-9]{2,15}$'
     and (e.value ->> 'vinted_le') ~ '^\d{4}-\d{2}-\d{2}T'
     and (e.value ->> 'vinted_le')::timestamptz between now() - interval '30 minutes' and now() + interval '1 minute';
  if coalesce(array_length(v_ids, 1), 0) <> 1 then return null; end if;
  return v_ids[1];
end $f$;
revoke all on function public.vinted_boutique_du_poste(uuid) from anon;

create or replace function public.profiles_identite_vinted_du_poste()
returns trigger language plpgsql security definer set search_path to 'public' as $f$
-- La sonde d'un poste (extension_sessions, écrite par l'extension avec SON jeton) qui vient de lire Vinted
-- (« sondees » contient vinted) date la boutique de CE poste dans extension_postes[session]. Une écriture qui
-- ne sonde pas Vinted (elle recopie l'identité d'avant, peut-être celle d'un autre poste) ne compte jamais.
-- Les postes à instance (« session/instance », ≥ 0.6.126) disent leur boutique au poll : non touchés.
declare v_sid text; v_id text; v_at timestamptz;
begin
  if jsonb_typeof(new.extension_sessions) is distinct from 'object' or jsonb_typeof(new.extension_postes) is distinct from 'object' then
    return new;
  end if;
  if jsonb_typeof(new.extension_sessions -> 'sondees') is distinct from 'array'
     or not ((new.extension_sessions -> 'sondees') ? 'vinted') then
    return new;
  end if;
  v_id := nullif(btrim(coalesce(new.extension_sessions #>> '{vinted_identite,user_id}', '')), '');
  if v_id is null or v_id !~ '^[0-9]{2,15}$' then return new; end if;
  begin
    v_at := coalesce(nullif(new.extension_sessions #>> '{checked_at_par_plateforme,vinted}', ''),
                     new.extension_sessions ->> 'checked_at')::timestamptz;
    v_sid := nullif(btrim(coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'session_id', '')), '');
  exception when others then return new;
  end;
  if v_sid is null or v_at is null or v_at > now() + interval '1 minute' or v_at < now() - interval '15 minutes' then return new; end if;
  if jsonb_typeof(new.extension_postes -> v_sid) is distinct from 'object' then return new; end if;
  -- Une identité plus fraîche (poll, garde, dépôt) ne recule jamais.
  if (new.extension_postes -> v_sid ->> 'vinted_le') ~ '^\d{4}-\d{2}-\d{2}T'
     and (new.extension_postes -> v_sid ->> 'vinted_le')::timestamptz >= v_at then
    return new;
  end if;
  new.extension_postes := jsonb_set(new.extension_postes, array[v_sid],
    (new.extension_postes -> v_sid) || jsonb_build_object('vinted_user_id', v_id,
      'vinted_le', to_char(v_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), 'vinted_source', 'sonde'));
  return new;
exception when others then
  return new;
end $f$;
revoke all on function public.profiles_identite_vinted_du_poste() from anon, authenticated;
drop trigger if exists profiles_identite_vinted_du_poste on public.profiles;
create trigger profiles_identite_vinted_du_poste before update of extension_sessions on public.profiles
  for each row when (new.extension_sessions is distinct from old.extension_sessions)
  execute function public.profiles_identite_vinted_du_poste();

CREATE OR REPLACE FUNCTION public.vente_vinted_lot_eclater(p_user uuid, p_ref text, p_source text DEFAULT 'releve'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_n         integer;
  v_total     numeric;
  v_devise    text;
  v_le        timestamptz;
  v_statut    text;
  v_hdr       ventes%ROWTYPE;
  c           record;
  p           record;
  i           inventaire%ROWTYPE;
  v_parts     jsonb := '{}'::jsonb;
  v_ref_art   text;
  v_part      numeric;
  v_inv       bigint;
  v_n_inv     integer;
  v_job       uuid;
  v_n_job     integer;
  v_vente     bigint;
  v_n_v       integer;
  v_r         jsonb;
  v_rets      jsonb;
  v_dec       text;
  v_pa        numeric;
  v_benef     numeric;
  v_pct       numeric;
  v_prix_job  numeric;
  v_prix_av   numeric;
  v_titre     text;
  v_cles_a    text[];
  v_cles      text[] := ARRAY[]::text[];
  v_articles  jsonb := '[]'::jsonb;
  v_nouvelles integer := 0;
  v_connus    integer := 0;
  v_premiere  bigint;
  v_note      bigint;
  v_motif     text;
  v_xact      bigint := pg_current_xact_id()::text::bigint;
  v_decl      text := current_setting('fillsell.vente_declaree', true);
  v_lie       uuid;
  v_r_lie     jsonb;
  v_jwt       text;
  v_sub       text;
BEGIN
  IF p_user IS NULL OR coalesce(p_ref, '') !~ '^[0-9]{1,24}$' THEN
    RETURN jsonb_build_object('ok', false, 'issue', 'parametres');
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user::text || ':commande-vinted:' || p_ref, 0));
  SELECT count(*), max(x.total), max(x.devise), max(x.commande_le), max(x.statut)
    INTO v_n, v_total, v_devise, v_le, v_statut
    FROM vinted_commandes_articles x WHERE x.user_id = p_user AND x.commande_ref = p_ref;
  IF v_n = 0 THEN RETURN jsonb_build_object('ok', false, 'issue', 'sans_composition'); END IF;
  IF vinted_commande_annulee(v_statut) THEN RETURN jsonb_build_object('ok', false, 'issue', 'commande_annulee'); END IF;
  IF EXISTS (SELECT 1 FROM vinted_commandes_articles x
              WHERE x.user_id = p_user AND x.commande_ref = p_ref AND x.eclatee_le IS NOT NULL) THEN
    RETURN jsonb_build_object('ok', true, 'issue', 'deja_eclatee');
  END IF;
  -- La personne a supprimé la vente de cette commande : elle ne revient jamais (04/10).
  IF EXISTS (SELECT 1 FROM ventes_supprimees s
              WHERE s.user_id = p_user AND s.plateforme_code = 'vinted' AND s.commande_ref = p_ref) THEN
    UPDATE vinted_commandes_articles SET decision = 'supprimee_par_la_personne', decide_le = now(), maj_le = now()
     WHERE user_id = p_user AND commande_ref = p_ref AND decision IS DISTINCT FROM 'supprimee_par_la_personne';
    RETURN jsonb_build_object('ok', false, 'issue', 'supprimee_par_la_personne');
  END IF;
  -- Un relevé en cours peut écrire l'inventaire : la vente attend sa fin (comme enregistrer_vente_prouvee).
  IF EXISTS (SELECT 1 FROM vinted_sync_runs r WHERE r.user_id = p_user AND r.status = 'running') THEN
    RETURN jsonb_build_object('ok', false, 'issue', 'releve_en_cours');
  END IF;
  -- (18/10 soir, Louis — UNE VENTE, UN COMPTE, entre comptes RELIÉS) Vu en réel : 2 commandes de @evat
  -- (12 articles) enregistrées sur ses DEUX comptes — la veille de louis@ (sa VM, ouverte sur @evat) à 18:39
  -- et 19:03, celle de louis-seller à 19:08. Désormais :
  --   · une commande déjà enregistrée sur le compte relié ne l'est jamais une 2e fois (un seul mail) ;
  --   · une commande dont AUCUN article n'est connu ici (ni fiche, ni dépôt, ni vente) mais dont un article
  --     est connu du compte relié (sa fiche, son dépôt) est la sienne : elle s'enregistre CHEZ LUI, par son
  --     circuit (sa vente, son mail, ses retraits) ; ici, rien.
  IF EXISTS (SELECT 1 FROM comptes_lies cl WHERE cl.user_a = p_user OR cl.user_b = p_user) THEN
    IF EXISTS (SELECT 1 FROM ventes w
                WHERE w.plateforme_code = 'vinted' AND w.user_id <> p_user
                  AND split_part(w.commande_ref, ':', 1) = p_ref
                  AND public.comptes_sont_lies(p_user, w.user_id)) THEN
      UPDATE vinted_commandes_articles x SET decision = 'compte_relie', motif = 'commande enregistrée sur le compte relié',
             decide_le = now(), maj_le = now()
       WHERE x.user_id = p_user AND x.commande_ref = p_ref AND x.vente_id IS NULL AND x.decision IS DISTINCT FROM 'compte_relie';
      RETURN jsonb_build_object('ok', true, 'issue', 'compte_relie');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM vinted_commandes_articles x
                    WHERE x.user_id = p_user AND x.commande_ref = p_ref
                      AND (EXISTS (SELECT 1 FROM inventaire f WHERE f.user_id = p_user AND f.vinted_item_id = x.item_id)
                           OR public.annonce_publiee_par_compte(p_user, 'vinted', x.item_id)
                           OR EXISTS (SELECT 1 FROM ventes v WHERE v.user_id = p_user AND v.plateforme_code = 'vinted'
                                         AND v.annonce_id = x.item_id))) THEN
      SELECT o.autre INTO v_lie
        FROM (SELECT CASE WHEN cl.user_a = p_user THEN cl.user_b ELSE cl.user_a END AS autre
                FROM comptes_lies cl WHERE cl.user_a = p_user OR cl.user_b = p_user) o
       WHERE EXISTS (SELECT 1 FROM vinted_commandes_articles x
                      WHERE x.user_id = p_user AND x.commande_ref = p_ref
                        AND (EXISTS (SELECT 1 FROM inventaire f WHERE f.user_id = o.autre AND f.vinted_item_id = x.item_id
                                        AND f.fusionne_dans IS NULL)
                             OR public.annonce_publiee_par_compte(o.autre, 'vinted', x.item_id)))
       ORDER BY o.autre LIMIT 1;
      IF v_lie IS NOT NULL THEN
        PERFORM public.vinted_lot_composer(v_lie, p_ref,
          (SELECT jsonb_agg(x.item_id ORDER BY x.position, x.item_id) FROM vinted_commandes_articles x
            WHERE x.user_id = p_user AND x.commande_ref = p_ref),
          v_statut, (SELECT bool_or(x.paye) FROM vinted_commandes_articles x WHERE x.user_id = p_user AND x.commande_ref = p_ref),
          v_total, v_devise, v_le,
          (SELECT jsonb_agg(jsonb_build_object('item_id', x.item_id, 'prix', x.prix_vinted, 'titre', x.titre_vinted))
             FROM vinted_commandes_articles x WHERE x.user_id = p_user AND x.commande_ref = p_ref),
          p_source);
        -- Le compte relié enregistre pour LUI-MÊME (même personne, comptes_lies) : son circuit vérifie auth.uid().
        v_jwt := current_setting('request.jwt.claims', true);
        v_sub := current_setting('request.jwt.claim.sub', true);
        PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_lie::text, 'role', 'authenticated')::text, true);
        PERFORM set_config('request.jwt.claim.sub', v_lie::text, true);
        BEGIN
          v_r_lie := public.vente_vinted_lot_eclater(v_lie, p_ref, p_source);
        EXCEPTION WHEN OTHERS THEN
          v_r_lie := jsonb_build_object('ok', false, 'issue', 'erreur_compte_relie', 'raison', left(SQLERRM, 200));
        END;
        PERFORM set_config('request.jwt.claims', coalesce(v_jwt, ''), true);
        PERFORM set_config('request.jwt.claim.sub', coalesce(v_sub, ''), true);
        -- Enregistrée (ou déjà là) chez lui : close ici. Sinon (relevé en cours chez lui…) : rien ici non plus,
        -- le prochain passage réessaie.
        IF v_r_lie ->> 'issue' IN ('eclatee', 'deja_eclatee', 'deja_relevee', 'compte_relie') THEN
          UPDATE vinted_commandes_articles x SET decision = 'compte_relie', motif = 'commande du compte relié : enregistrée chez lui',
                 decide_le = now(), maj_le = now()
           WHERE x.user_id = p_user AND x.commande_ref = p_ref AND x.vente_id IS NULL AND x.decision IS DISTINCT FROM 'compte_relie';
        END IF;
        RETURN jsonb_build_object('ok', true, 'issue', 'compte_relie', 'chez_le_compte_relie', v_r_lie);
      END IF;
    END IF;
  END IF;
  SELECT * INTO v_hdr FROM ventes v WHERE v.user_id = p_user AND v.plateforme_code = 'vinted' AND v.commande_ref = p_ref;
  -- Une commande à UN article déjà relevée reste l'affaire du relevé (une commande, une vente).
  IF v_n = 1 AND v_hdr.id IS NOT NULL THEN RETURN jsonb_build_object('ok', false, 'issue', 'deja_relevee'); END IF;
  FOR p IN SELECT * FROM vinted_lot_parts(p_user, p_ref) LOOP
    v_parts := v_parts || jsonb_build_object(p.item_id, p.prix);
  END LOOP;

  BEGIN
    -- Les notes nées pendant l'éclatement sont « déclarées » (ni push ni mail) :
    -- la commande a SA note, plus bas.
    PERFORM set_config('fillsell.vente_declaree', '1', true);
    FOR c IN SELECT * FROM vinted_commandes_articles x
              WHERE x.user_id = p_user AND x.commande_ref = p_ref ORDER BY x.position, x.item_id LOOP
      v_ref_art := CASE WHEN v_n > 1 THEN p_ref || ':' || c.item_id ELSE p_ref END;
      v_part := nullif(v_parts ->> c.item_id, '')::numeric;
      v_dec := NULL; v_vente := NULL; v_inv := NULL; v_job := NULL; v_titre := NULL;
      v_cles_a := ARRAY['annonce:vinted:' || c.item_id];
      IF EXISTS (SELECT 1 FROM ventes_supprimees s
                  WHERE s.user_id = p_user AND s.plateforme_code = 'vinted'
                    AND (s.commande_ref = v_ref_art OR (s.commande_ref IS NULL AND s.annonce_id = c.item_id))) THEN
        v_dec := 'supprimee_par_la_personne';
      ELSE
        IF EXISTS (SELECT 1 FROM ventes v
                    WHERE v.user_id = p_user AND v.plateforme_code = 'vinted' AND v.annonce_id = c.item_id
                      AND v.commande_ref IS NOT NULL AND v.commande_ref <> v_ref_art AND v.commande_ref <> p_ref) THEN
          RAISE EXCEPTION 'doute:article_d_une_autre_commande:%', c.item_id;
        END IF;
        SELECT count(*), min(v.id) INTO v_n_v, v_vente FROM ventes v
         WHERE v.user_id = p_user AND v.plateforme_code = 'vinted' AND v.annonce_id = c.item_id
           AND (v.commande_ref IS NULL OR v.commande_ref = v_ref_art);
        IF v_n_v > 1 THEN RAISE EXCEPTION 'doute:ventes_multiples:%', c.item_id; END IF;
        IF v_vente IS NOT NULL THEN
          -- (D1) adoptée : la commande se pose dessus ; son prix suit la règle (saisie gardée).
          SELECT v.prix_vente, v.inventaire_id, v.titre INTO v_prix_av, v_inv, v_titre FROM ventes v WHERE v.id = v_vente;
          IF v_part IS NOT NULL AND v_part IS DISTINCT FROM v_prix_av AND EXISTS (
               SELECT 1 FROM ventes_operations o
                WHERE o.user_id = p_user AND o.cle = 'annonce:vinted:' || c.item_id
                  AND o.resultat -> 'ventes_ids' @> to_jsonb(ARRAY[v_vente])) THEN
            UPDATE ventes v SET prix_vente = v_part,
                   benefice = CASE WHEN v.prix_achat IS NOT NULL
                                   THEN v_part - v.prix_achat
                                        - coalesce((SELECT x.purchase_costs FROM inventaire x WHERE x.id = v.inventaire_id), 0)
                                        - coalesce(v.frais_plateforme, v.selling_fees, 0) END
             WHERE v.id = v_vente;
            UPDATE inventaire x SET prix_vente = v_part,
                   margin = CASE WHEN x.prix_achat IS NOT NULL AND NOT x.prix_achat_inconnu
                                 THEN v_part - x.prix_achat - coalesce(x.purchase_costs, 0) END,
                   margin_pct = CASE WHEN x.prix_achat IS NOT NULL AND NOT x.prix_achat_inconnu AND v_part > 0
                                     THEN (v_part - x.prix_achat - coalesce(x.purchase_costs, 0)) / v_part * 100 END
             WHERE x.id = v_inv AND x.user_id = p_user AND x.statut = 'vendu' AND x.prix_vente IS NOT DISTINCT FROM v_prix_av;
          END IF;
          UPDATE ventes v SET commande_ref = v_ref_art, vendu_le = coalesce(v.vendu_le, v_le), releve_le = now()
           WHERE v.id = v_vente;
          v_dec := 'adoptee';
        ELSE
          -- La fiche, par le NUMÉRO exact (jamais le titre).
          SELECT * INTO i FROM inventaire x
           WHERE x.user_id = p_user AND x.vinted_item_id = c.item_id AND x.fusionne_dans IS NULL;
          IF i.id IS NULL THEN
            SELECT count(DISTINCT jj.inventaire_id), min(jj.inventaire_id) INTO v_n_inv, v_inv FROM cross_post_jobs jj
             WHERE jj.user_id = p_user AND jj.platform = 'vinted' AND jj.action IN ('publish', 'republish')
               AND btrim(coalesce(jj.platform_listing_id, '')) = c.item_id AND jj.inventaire_id IS NOT NULL
               AND public.retrait_job_prouve(jj.id);
            IF v_n_inv > 1 THEN RAISE EXCEPTION 'doute:plusieurs_fiches:%', c.item_id; END IF;
            IF v_inv IS NOT NULL THEN
              SELECT * INTO i FROM inventaire x WHERE x.id = v_inv AND x.user_id = p_user;
              IF i.id IS NULL OR i.fusionne_dans IS NOT NULL THEN RAISE EXCEPTION 'doute:fiche_fusionnee:%', c.item_id; END IF;
            END IF;
          END IF;
          v_inv := i.id;
          IF v_inv IS NOT NULL THEN
            SELECT count(*), (array_agg(jj.id ORDER BY jj.created_at DESC))[1] INTO v_n_job, v_job FROM cross_post_jobs jj
             WHERE jj.user_id = p_user AND jj.inventaire_id = v_inv AND jj.platform = 'vinted' AND jj.status = 'published'
               AND jj.action IN ('publish', 'republish') AND btrim(coalesce(jj.platform_listing_id, '')) = c.item_id;
            IF v_n_job > 1 THEN RAISE EXCEPTION 'doute:plusieurs_annonces:%', c.item_id; END IF;
            v_titre := i.titre;
            v_cles_a := v_cles_a || ('fiche:' || v_inv::text);
          END IF;
          IF v_inv IS NOT NULL AND v_job IS NOT NULL THEN
            -- (D2) la commande est la preuve de CETTE annonce ; le circuit normal écrit la vente.
            IF i.statut IS DISTINCT FROM 'stock' THEN RAISE EXCEPTION 'doute:fiche_deja_vendue:%', c.item_id; END IF;
            UPDATE cross_post_jobs SET platform_fields = coalesce(platform_fields, '{}'::jsonb)
                   || jsonb_build_object(
                        'sale_signal', 'sold',
                        'unavailable_since', CASE
                           WHEN _ts_ou_null(platform_fields ->> 'unavailable_since') IS NOT NULL
                                AND _ts_ou_null(platform_fields ->> 'unavailable_since') <= coalesce(v_le, now())
                           THEN platform_fields ->> 'unavailable_since'
                           ELSE to_char(coalesce(v_le, now()) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') END,
                        'sale_evidence', jsonb_build_object('source', 'commande_vinted', 'commande', p_ref,
                           'listing_id', c.item_id, 'platform', 'vinted', 'state', 'sold', 'exact', true,
                           'lu_le', now(), 'pose_par', 'vente_vinted_lot_eclater:' || coalesce(p_source, '')))
                   || CASE WHEN v_part IS NOT NULL THEN jsonb_build_object('detected_price', v_part) ELSE '{}'::jsonb END
             WHERE id = v_job AND status = 'published';
            SELECT coalesce(CASE WHEN j.platform_fields ->> 'detected_price' ~ '^[0-9]+([.][0-9]+)?$'
                                 THEN (j.platform_fields ->> 'detected_price')::numeric END,
                            j.price,
                            CASE WHEN j.platform_fields ->> 'prix_recreation' ~ '^[0-9]+([.][0-9]+)?$'
                                 THEN (j.platform_fields ->> 'prix_recreation')::numeric END,
                            CASE WHEN j.platform_fields #>> '{republish_snapshot,prix}' ~ '^[0-9]+([.][0-9]+)?$'
                                 THEN (j.platform_fields #>> '{republish_snapshot,prix}')::numeric END)
              INTO v_prix_job FROM cross_post_jobs j WHERE j.id = v_job;
            v_r := enregistrer_vente_atomique(p_user, NULL, p_job := v_job, p_prix := coalesce(v_part, v_prix_job));
            IF coalesce(v_r ->> 'ok', 'false') <> 'true' THEN
              RAISE EXCEPTION 'doute:refus:%:%', c.item_id, left(coalesce(v_r ->> 'code', '') || ' ' || coalesce(v_r ->> 'reason', ''), 160);
            END IF;
            v_vente := nullif(v_r -> 'ventes_ids' ->> 0, '')::bigint;
            IF v_vente IS NULL THEN RAISE EXCEPTION 'doute:vente_absente:%', c.item_id; END IF;
            UPDATE ventes v SET commande_ref = v_ref_art, vendu_le = coalesce(v.vendu_le, v_le), releve_le = now()
             WHERE v.id = v_vente;
            v_cles_a := v_cles_a || ('job:' || v_job::text);
            v_dec := CASE WHEN coalesce(v_r ->> 'rejouee', 'false') = 'true' THEN 'adoptee' ELSE 'vente_par_annonce' END;
          ELSIF v_inv IS NOT NULL AND i.statut = 'vendu' THEN
            -- (D3) fiche déjà « vendu » sans aucune vente : la vente s'y rattache.
            IF EXISTS (SELECT 1 FROM ventes v WHERE v.user_id = p_user AND v.inventaire_id = v_inv) THEN
              RAISE EXCEPTION 'doute:fiche_deja_vendue_ailleurs:%', c.item_id;
            END IF;
            v_pa := CASE WHEN i.prix_achat_inconnu THEN NULL ELSE i.prix_achat END;
            v_benef := CASE WHEN v_pa IS NOT NULL AND v_part IS NOT NULL THEN v_part - v_pa - coalesce(i.purchase_costs, 0) END;
            INSERT INTO ventes (user_id, inventaire_id, titre, prix_achat, prix_vente, benefice, marque, type, description,
                                emplacement, date, vendu_le, plateforme, plateforme_code, commande_ref, annonce_id, source,
                                releve_le, devise, quantite, statut, selling_fees)
            VALUES (p_user, v_inv, i.titre, v_pa, v_part, v_benef, i.marque, i.type, i.description, i.emplacement,
                    (coalesce(v_le, now()) AT TIME ZONE 'Europe/Paris')::date, v_le, 'Vinted', 'vinted', v_ref_art, c.item_id,
                    'releve', now(), v_devise, 1, 'vendu', 0)
            RETURNING id INTO v_vente;
            INSERT INTO ventes_operations (user_id, cle, inventaire_id, job_id, resultat)
            VALUES (p_user, 'annonce:vinted:' || c.item_id, v_inv, NULL, jsonb_build_object('ok', true, 'venteCreated', true,
                    'ventes_ids', jsonb_build_array(v_vente), 'par', 'vente_vinted_lot_eclater', 'commande', p_ref))
            ON CONFLICT (user_id, cle) DO NOTHING;
            IF NOT FOUND THEN RAISE EXCEPTION 'doute:recu_existant:%', c.item_id; END IF;
            v_rets := armer_retraits_copies(v_inv, 'vente_commande_vinted', NULL, 'vinted', interval '10 minutes');
            v_dec := 'vente_fiche_deja_vendue';
          ELSIF v_inv IS NOT NULL AND i.statut = 'stock' THEN
            -- (D4) fiche importée, sans annonce FillSell vivante sur ce numéro.
            IF coalesce(i.quantite, 1) > 1 THEN RAISE EXCEPTION 'doute:plusieurs_exemplaires_sans_annonce:%', c.item_id; END IF;
            v_pa := CASE WHEN i.prix_achat_inconnu THEN NULL ELSE i.prix_achat END;
            v_benef := CASE WHEN v_pa IS NOT NULL AND v_part IS NOT NULL THEN v_part - v_pa - coalesce(i.purchase_costs, 0) END;
            v_pct := CASE WHEN v_benef IS NOT NULL AND v_part > 0 THEN v_benef / v_part * 100 END;
            INSERT INTO ventes (user_id, inventaire_id, titre, prix_achat, prix_vente, benefice, marque, type, description,
                                emplacement, date, vendu_le, plateforme, plateforme_code, commande_ref, annonce_id, source,
                                releve_le, devise, quantite, statut, selling_fees)
            VALUES (p_user, v_inv, i.titre, v_pa, v_part, v_benef, i.marque, i.type, i.description, i.emplacement,
                    (coalesce(v_le, now()) AT TIME ZONE 'Europe/Paris')::date, v_le, 'Vinted', 'vinted', v_ref_art, c.item_id,
                    'releve', now(), v_devise, 1, 'vendu', 0)
            RETURNING id INTO v_vente;
            INSERT INTO ventes_operations (user_id, cle, inventaire_id, job_id, resultat)
            VALUES (p_user, 'annonce:vinted:' || c.item_id, v_inv, NULL, jsonb_build_object('ok', true, 'venteCreated', true,
                    'ventes_ids', jsonb_build_array(v_vente), 'par', 'vente_vinted_lot_eclater', 'commande', p_ref))
            ON CONFLICT (user_id, cle) DO NOTHING;
            IF NOT FOUND THEN RAISE EXCEPTION 'doute:recu_existant:%', c.item_id; END IF;
            UPDATE inventaire x SET statut = 'vendu', quantite = 0, prix_vente = coalesce(v_part, x.prix_vente),
                   margin = CASE WHEN v_part IS NOT NULL THEN v_benef ELSE x.margin END,
                   margin_pct = CASE WHEN v_part IS NOT NULL THEN v_pct ELSE x.margin_pct END,
                   plateforme = 'Vinted', date = to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
             WHERE x.id = v_inv AND x.user_id = p_user AND x.statut = 'stock';
            IF NOT FOUND THEN RAISE EXCEPTION 'doute:fiche_changee:%', c.item_id; END IF;
            v_dec := 'vente_fiche_importee';
          ELSIF v_inv IS NOT NULL THEN
            RAISE EXCEPTION 'doute:statut_fiche:%:%', c.item_id, coalesce(i.statut, '?');
          ELSE
            -- (D6) inconnu de FillSell : vente sans fiche, la question, JAMAIS un retrait.
            v_titre := coalesce(c.titre_vinted, 'Article Vinted ' || c.item_id || ' (pas suivi par FillSell)');
            INSERT INTO ventes (user_id, inventaire_id, titre, prix_vente, date, vendu_le, plateforme, plateforme_code,
                                commande_ref, annonce_id, source, releve_le, devise, quantite, statut, selling_fees)
            VALUES (p_user, NULL, v_titre, v_part, (coalesce(v_le, now()) AT TIME ZONE 'Europe/Paris')::date, v_le,
                    'Vinted', 'vinted', v_ref_art, c.item_id, 'releve', now(), v_devise, 1, 'vendu', 0)
            RETURNING id INTO v_vente;
            INSERT INTO ventes_operations (user_id, cle, inventaire_id, job_id, resultat)
            VALUES (p_user, 'annonce:vinted:' || c.item_id, NULL, NULL, jsonb_build_object('ok', true, 'venteCreated', true,
                    'ventes_ids', jsonb_build_array(v_vente), 'par', 'vente_vinted_lot_eclater', 'commande', p_ref))
            ON CONFLICT (user_id, cle) DO NOTHING;
            IF NOT EXISTS (SELECT 1 FROM usage_logs u
                            WHERE u.user_id = p_user AND u.feature = 'vente_vinted_article_inconnu'
                              AND u.metadata ->> 'commande' = p_ref AND u.metadata ->> 'annonce' = c.item_id) THEN
              INSERT INTO usage_logs (user_id, feature, metadata) VALUES (p_user, 'vente_vinted_article_inconnu',
                jsonb_build_object('commande', p_ref, 'annonce', c.item_id, 'vente', v_vente, 'prix', v_part,
                  'question', 'Article vendu sur Vinted que FillSell ne suit pas : s''il est en vente ailleurs hors FillSell, retire-le là-bas.',
                  'par', 'vente_vinted_lot_eclater', 'source', p_source));
            END IF;
            v_dec := 'article_inconnu';
          END IF;
          v_nouvelles := v_nouvelles + 1;
        END IF;
      END IF;
      IF v_inv IS NOT NULL THEN v_connus := v_connus + 1; END IF;
      UPDATE vinted_commandes_articles x
         SET inventaire_id = v_inv, vente_id = v_vente, prix_part = v_part, decision = v_dec, motif = NULL,
             decide_le = now(), maj_le = now()
       WHERE x.user_id = p_user AND x.commande_ref = p_ref AND x.item_id = c.item_id;
      IF v_vente IS NOT NULL THEN
        v_premiere := coalesce(v_premiere, v_vente);
        v_cles_a := v_cles_a || ('commande:vinted:' || v_ref_art);
        v_cles := v_cles || v_cles_a;
        v_articles := v_articles || jsonb_build_array(jsonb_build_object(
          'item_id', c.item_id, 'vente_id', v_vente, 'inventaire_id', v_inv, 'decision', v_dec,
          'titre', coalesce(v_titre, (SELECT v.titre FROM ventes v WHERE v.id = v_vente)),
          'prix', (SELECT v.prix_vente FROM ventes v WHERE v.id = v_vente), 'cles', to_jsonb(v_cles_a)));
      END IF;
    END LOOP;
    -- La ligne d'attente « Lot N articles » du relevé : remplacée par ses articles, trace complète.
    IF v_hdr.id IS NOT NULL AND v_n > 1 THEN
      INSERT INTO usage_logs (user_id, feature, metadata) VALUES (p_user, 'vente_lot_eclatee', jsonb_build_object(
        'commande', p_ref, 'avant', to_jsonb(v_hdr), 'articles', v_articles, 'par', 'vente_vinted_lot_eclater', 'source', p_source));
      DELETE FROM ventes WHERE id = v_hdr.id AND user_id = p_user;
    END IF;
    UPDATE vinted_commandes_articles x SET eclatee_le = now(), maj_le = now()
     WHERE x.user_id = p_user AND x.commande_ref = p_ref;
    PERFORM set_config('fillsell.vente_declaree', coalesce(v_decl, ''), true);
  EXCEPTION WHEN OTHERS THEN
    PERFORM set_config('fillsell.vente_declaree', coalesce(v_decl, ''), true);
    v_motif := left(SQLERRM, 300);
    UPDATE vinted_commandes_articles x SET decision = 'en_doute', motif = v_motif, decide_le = now(), maj_le = now()
     WHERE x.user_id = p_user AND x.commande_ref = p_ref
       AND (x.decision IS DISTINCT FROM 'en_doute' OR x.motif IS DISTINCT FROM v_motif);
    IF NOT EXISTS (SELECT 1 FROM usage_logs u
                    WHERE u.user_id = p_user AND u.feature = 'vente_vinted_lot_doute'
                      AND u.metadata ->> 'commande' = p_ref AND u.metadata ->> 'motif' = v_motif) THEN
      INSERT INTO usage_logs (user_id, feature, metadata) VALUES (p_user, 'vente_vinted_lot_doute',
        jsonb_build_object('commande', p_ref, 'motif', v_motif, 'source', p_source, 'par', 'vente_vinted_lot_eclater'));
    END IF;
    RETURN jsonb_build_object('ok', false, 'issue', 'en_doute', 'raison', v_motif);
  END;

  -- Aucune note d'article ne part seule : la commande a SA note (ou aucune).
  IF cardinality(v_cles) > 0 THEN
    UPDATE push_ventes SET statut = 'doublon', motif = 'dans_la_commande', traite_le = now()
     WHERE user_id = p_user AND lot = v_xact AND articles IS NULL AND statut IN ('a_envoyer', 'declaree')
       AND cles && v_cles;
  END IF;
  -- UN mail par commande de moins de 24 h, qui liste TOUS ses articles.
  IF v_nouvelles > 0 AND v_connus > 0 AND v_le IS NOT NULL AND v_le >= now() - interval '24 hours'
     AND coalesce(p_source, '') <> 'reparation' THEN
    v_note := push_noter_commande_vinted(p_user, p_ref, v_premiere, v_articles, v_total, v_devise, v_le);
  END IF;
  RETURN jsonb_build_object('ok', true, 'issue', 'eclatee', 'articles', v_articles, 'note', v_note,
                            'en_tete_retire', v_hdr.id, 'nouvelles', v_nouvelles);
END;
$function$;

CREATE OR REPLACE FUNCTION public.commandes_vinted_noter(p_rows jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
 SET statement_timeout TO '20s'
AS $function$
DECLARE
  v_user   uuid := auth.uid();
  v_row    jsonb;
  v_ref    text;
  v_statut text;
  v_paye   boolean;
  v_le     timestamptz;
  v_prix   numeric;
  v_n      integer;
  v_r      jsonb;
  v_job    uuid;
  c_recues integer := 0; c_composees integer := 0; c_annulees integer := 0; c_levees integer := 0;
  c_non_payees integer := 0; c_anciennes integer := 0; c_deja integer := 0; c_eclatees integer := 0; c_doute integer := 0;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'utilisateur inconnu'; END IF;
  IF jsonb_typeof(p_rows) IS DISTINCT FROM 'array' THEN RETURN jsonb_build_object('recues', 0); END IF;
  -- (18/10 soir, Louis — une boutique = un compte) Les commandes lues par un poste ouvert (identité fraîche de
  -- CE poste) sur une boutique Vinted d'un AUTRE compte FillSell ne s'enregistrent pas ici : ni vente, ni mail.
  -- Le compte de cette boutique les lit lui-même. Identité du poste inconnue : comme avant.
  IF public.boutique_vinted_autre_compte(v_user, public.vinted_boutique_du_poste(v_user)) THEN
    RETURN jsonb_build_object('recues', jsonb_array_length(p_rows), 'composees', 0, 'refusees', jsonb_array_length(p_rows),
                              'motif', 'boutique_autre_compte');
  END IF;
  FOR v_row IN SELECT value FROM jsonb_array_elements(p_rows) LIMIT 10 LOOP
    c_recues := c_recues + 1;
    v_ref := nullif(btrim(coalesce(v_row ->> 'ref', '')), '');
    IF v_ref IS NULL OR v_ref !~ '^[0-9]{1,24}$' THEN CONTINUE; END IF;
    v_statut := nullif(btrim(coalesce(v_row ->> 'statut', '')), '');
    v_paye := CASE WHEN lower(coalesce(v_row ->> 'paye', '')) IN ('true', 't', '1') THEN true
                   WHEN lower(coalesce(v_row ->> 'paye', '')) IN ('false', 'f', '0') THEN false END;
    v_le := _ts_ou_null(v_row ->> 'date');
    v_prix := CASE WHEN (v_row ->> 'prix') ~ '^[0-9]+([.][0-9]+)?$' THEN (v_row ->> 'prix')::numeric END;
    v_n := vinted_lot_composer(v_user, v_ref, v_row -> 'item_ids', v_statut, v_paye, v_prix,
                               v_row ->> 'devise', v_le, v_row -> 'articles', 'veille');
    IF v_n = 0 THEN CONTINUE; END IF;
    c_composees := c_composees + 1;
    IF vinted_commande_annulee(v_statut) THEN
      c_annulees := c_annulees + 1;
      FOR v_job IN SELECT j.id FROM cross_post_jobs j
                    WHERE j.user_id = v_user AND j.platform = 'vinted' AND j.status = 'published'
                      AND j.platform_fields #>> '{sale_evidence,source}' = 'commande_vinted'
                      AND j.platform_fields #>> '{sale_evidence,commande}' = v_ref LOOP
        IF signal_vente_lever(v_job, 'commande_vinted_annulee', jsonb_build_object('commande', v_ref, 'statut', v_statut)) THEN
          c_levees := c_levees + 1;
        END IF;
      END LOOP;
      UPDATE vinted_commandes_articles x SET decision = 'commande_annulee', decide_le = now(), maj_le = now()
       WHERE x.user_id = v_user AND x.commande_ref = v_ref AND x.vente_id IS NULL
         AND x.decision IS DISTINCT FROM 'commande_annulee';
      CONTINUE;
    END IF;
    IF NOT coalesce(v_paye, false) THEN c_non_payees := c_non_payees + 1; CONTINUE; END IF;
    IF v_le IS NULL OR v_le < now() - interval '48 hours' THEN c_anciennes := c_anciennes + 1; CONTINUE; END IF;
    v_r := vente_vinted_lot_eclater(v_user, v_ref, 'veille');
    IF v_r ->> 'issue' = 'eclatee' THEN c_eclatees := c_eclatees + 1;
    ELSIF v_r ->> 'issue' IN ('deja_eclatee', 'deja_relevee') THEN c_deja := c_deja + 1;
    ELSIF v_r ->> 'issue' = 'en_doute' THEN c_doute := c_doute + 1;
    END IF;
  END LOOP;
  RETURN jsonb_build_object('recues', c_recues, 'composees', c_composees, 'annulees', c_annulees,
    'preuves_levees', c_levees, 'non_payees', c_non_payees, 'anciennes', c_anciennes, 'deja', c_deja,
    'eclatees', c_eclatees, 'en_doute', c_doute);
END;
$function$;

CREATE OR REPLACE FUNCTION public.enregistrer_ventes_relevees(p_platform text, p_rows jsonb, p_user uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user   uuid;
  v_row    jsonb;
  v_ref    text; v_titre text; v_prix numeric; v_devise text; v_vendu timestamptz;
  v_statut text; v_classe text; v_listing text; v_url text;
  v_frais  numeric; v_lot boolean;
  v_inv    bigint; v_bande text; v_verdict jsonb;
  v_adopte bigint; v_nb_adoptables int;
  v_insere boolean; v_cle text;
  v_pa numeric; v_pai boolean; v_pc numeric; v_benef numeric; v_pct numeric;
  v_st text; v_pv numeric;
  v_meme boolean; v_rel_id bigint; v_rel_inv bigint; v_manu bigint;
  c_recues int := 0; c_sans_ref int := 0; c_annulees int := 0; c_en_cours int := 0;
  c_creees int := 0; c_adoptees int := 0; c_deja int := 0;
  c_rattachees int := 0; c_lots int := 0; c_inv_completes int := 0;
  c_fusionnees int := 0;
  c_supprimees int := 0;
  c_autre_compte int := 0;  -- (18/10, Louis) ventes du compte relié propriétaire
  v_rel record; v_q_fiche int; v_autres_cmd boolean;
  v_nb_ventes_fiche int; v_autre_pf boolean;
  v_vente_id bigint; v_ex jsonb; c_ex_vendues int := 0; c_ex_stock int := 0; c_ex_relire int := 0;
  c_annulees_retirees int := 0; c_annulees_signalees int := 0;
  v_inconnus jsonb := '{}'::jsonb;
  -- (17/10, lots Vinted — point 11)
  v_ex_lot jsonb; c_compositions int := 0; c_lots_eclates int := 0; c_lots_a_reparer int := 0; c_lots_en_doute int := 0;
BEGIN
  IF p_platform IS NULL OR p_platform NOT IN ('vinted','leboncoin','ebay','opla','depop') THEN
    RAISE EXCEPTION 'plateforme non relevable: %', coalesce(p_platform,'(null)');
  END IF;
  IF auth.uid() IS NOT NULL AND p_user IS NOT NULL AND p_user <> auth.uid() THEN
    RAISE EXCEPTION 'utilisateur non autorisé';
  END IF;
  v_user := coalesce(auth.uid(), p_user);
  IF v_user IS NULL THEN RAISE EXCEPTION 'utilisateur inconnu'; END IF;

  -- (18/10, Louis — une boutique = un compte) Les ventes Vinted lues par une session ouverte sur
  -- une boutique qui appartient à UN AUTRE compte FillSell ne s'enregistrent pas ici : ni vente,
  -- ni mail (louis@ttfamily.fr relevait la boutique de louis-seller : vente:2682 ET vente:2701).
  -- Identité inconnue ou trop vieille : comportement d'avant.
  IF p_platform = 'vinted'
     AND public.boutique_vinted_autre_compte(v_user, coalesce(public.vinted_boutique_du_poste(v_user),  -- (18/10 soir) CE poste d'abord
                                                     public.republish_boutique_connectee(v_user) ->> 'user_id')) THEN
    RETURN jsonb_build_object('plateforme', p_platform, 'recues', jsonb_array_length(coalesce(p_rows, '[]'::jsonb)),
      'creees', 0, 'refusees', jsonb_array_length(coalesce(p_rows, '[]'::jsonb)), 'motif', 'boutique_autre_compte');
  END IF;

  FOR v_row IN SELECT value FROM jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) LOOP
    c_recues := c_recues + 1;
    v_ref     := nullif(btrim(coalesce(v_row ->> 'ref', '')), '');
    v_statut  := coalesce(v_row ->> 'statut', '');
    v_titre   := nullif(btrim(coalesce(v_row ->> 'titre', '')), '');
    v_prix    := nullif(v_row ->> 'prix', '')::numeric;
    v_devise  := nullif(btrim(coalesce(v_row ->> 'devise', '')), '');
    v_vendu   := nullif(v_row ->> 'vendu_le', '')::timestamptz;
    v_listing := nullif(btrim(coalesce(v_row ->> 'listing_id', '')), '');
    v_url     := nullif(btrim(coalesce(v_row ->> 'url', '')), '');
    v_frais   := nullif(v_row ->> 'frais', '')::numeric;
    v_lot     := coalesce((v_row ->> 'lot')::boolean, false);

    IF v_ref IS NULL THEN c_sans_ref := c_sans_ref + 1; CONTINUE; END IF;

    -- (18/10, Louis) UNE VENTE N'APPARTIENT QU'AU COMPTE PROPRIÉTAIRE : entre deux comptes RELIÉS (même
    -- personne), une commande déjà enregistrée sur l'autre compte ne l'est jamais une 2e fois (un seul mail),
    -- et une vente Leboncoin/Depop/eBay dont l'annonce n'est suivie QUE par le compte relié lui appartient.
    IF EXISTS (SELECT 1 FROM comptes_lies cl WHERE cl.user_a = v_user OR cl.user_b = v_user) THEN
      IF EXISTS (SELECT 1 FROM ventes w
                  WHERE w.plateforme_code = p_platform AND w.user_id <> v_user
                    AND split_part(w.commande_ref, ':', 1) = split_part(v_ref, ':', 1)
                    AND public.comptes_sont_lies(v_user, w.user_id)) THEN
        c_autre_compte := c_autre_compte + 1;
        CONTINUE;
      END IF;
      IF p_platform <> 'vinted' AND v_listing IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM annonces_plateforme a WHERE a.user_id = v_user AND a.platform = p_platform AND a.listing_id = v_listing)
         AND NOT public.annonce_publiee_par_compte(v_user, p_platform, v_listing)  -- (18/10 soir) la sienne : jamais écartée
         AND (EXISTS (SELECT 1 FROM annonces_plateforme a WHERE a.user_id <> v_user AND a.platform = p_platform AND a.listing_id = v_listing
                       AND public.comptes_sont_lies(v_user, a.user_id))
              OR public.annonce_publiee_par_compte_lie(v_user, p_platform, v_listing)) THEN  -- publiée par le compte relié
        c_autre_compte := c_autre_compte + 1;
        CONTINUE;
      END IF;
      -- (18/10 soir) Vinted : un article inconnu ici et connu du compte relié (sa fiche, son dépôt) est le sien —
      -- sa vente passe par la veille, qui l'enregistre chez lui (vente_vinted_lot_eclater) ; jamais ici.
      IF p_platform = 'vinted' AND v_listing IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM inventaire f WHERE f.user_id = v_user AND f.vinted_item_id = v_listing)
         AND NOT public.annonce_publiee_par_compte(v_user, 'vinted', v_listing)
         AND (public.annonce_publiee_par_compte_lie(v_user, 'vinted', v_listing)
              OR EXISTS (SELECT 1 FROM inventaire f WHERE f.user_id <> v_user AND f.vinted_item_id = v_listing
                            AND f.fusionne_dans IS NULL AND public.comptes_sont_lies(v_user, f.user_id))) THEN
        c_autre_compte := c_autre_compte + 1;
        CONTINUE;
      END IF;
    END IF;

    -- (17/10, lots Vinted — point 11, Louis) LA COMPOSITION D'UNE COMMANDE VINTED : les
    -- numéros EXACTS de transaction.order.item_ids (le détail, lu par la session du
    -- vendeur), gardés quel que soit le statut — jamais le titre « Lot N articles ».
    IF p_platform = 'vinted' AND jsonb_typeof(v_row -> 'item_ids') = 'array'
       AND jsonb_array_length(v_row -> 'item_ids') >= 1 THEN
      IF public.vinted_lot_composer(v_user, v_ref, v_row -> 'item_ids', v_statut, NULL, v_prix, v_devise, v_vendu,
                                    v_row -> 'articles', 'releve') > 0 THEN
        c_compositions := c_compositions + 1;
      END IF;
    END IF;

    -- (04/10) UNE VENTE SUPPRIMÉE PAR LA PERSONNE NE REVIENT JAMAIS : même
    -- commande sur la même plateforme, ou — pour une vente supprimée qui
    -- n'avait pas de commande — même annonce.
    IF EXISTS (SELECT 1 FROM ventes_supprimees s
                WHERE s.user_id = v_user AND s.plateforme_code = p_platform
                  AND (s.commande_ref = v_ref
                       OR (s.commande_ref IS NULL AND v_listing IS NOT NULL AND s.annonce_id = v_listing))) THEN
      c_supprimees := c_supprimees + 1;
      CONTINUE;
    END IF;

    v_classe := ventes_statut_classe(p_platform, v_statut);
    IF v_classe = 'annulee' THEN
      c_annulees := c_annulees + 1;
      -- (09/10 soir, règle de Nico) UNE COMMANDE eBAY REMBOURSÉE OU ANNULÉE APRÈS COUP :
      -- la vente née du relevé est retirée, une vente saisie seulement signalée
      -- (vente_commande_annulee) — jamais une remise en ligne, 0 mail.
      IF p_platform = 'ebay' THEN
        SELECT v.id INTO v_vente_id FROM ventes v
         WHERE v.user_id = v_user AND v.plateforme_code = 'ebay' AND v.commande_ref = v_ref LIMIT 1;
        IF v_vente_id IS NOT NULL THEN
          BEGIN
            v_ex := vente_commande_annulee(v_vente_id, v_statut);
            IF v_ex ->> 'action' = 'retiree' THEN c_annulees_retirees := c_annulees_retirees + 1;
            ELSIF v_ex ->> 'action' = 'signalee' THEN c_annulees_signalees := c_annulees_signalees + 1;
            END IF;
          EXCEPTION WHEN OTHERS THEN
            RAISE WARNING 'vente_commande_annulee (vente %) : % — relevé poursuivi', v_vente_id, sqlerrm;
          END;
        END IF;
      END IF;
      -- (15/10, P1 — Louis) UNE COMMANDE VINTED ANNULÉE : la vente née d'une preuve
      -- est retirée, la fiche revient au stock (vente_commande_annulee_vinted).
      -- La commande se reconnaît par son numéro, ou par les numéros d'annonce
      -- qu'elle porte (lot : item_ids, extension 0.6.111) — jamais par le titre.
      IF p_platform = 'vinted' THEN
        FOR v_vente_id IN
          SELECT v.id FROM ventes v
           WHERE v.user_id = v_user AND v.plateforme_code = 'vinted'
             AND (v.commande_ref = v_ref
                  -- (17/10) les lignes d'une commande éclatée (une vente par article)
                  OR v.id IN (SELECT ca.vente_id FROM vinted_commandes_articles ca
                               WHERE ca.user_id = v_user AND ca.commande_ref = v_ref AND ca.vente_id IS NOT NULL)
                  OR (v.commande_ref IS NULL AND v.annonce_id IS NOT NULL
                      AND v.annonce_id = ANY (ARRAY(SELECT btrim(x) FROM jsonb_array_elements_text(
                            CASE WHEN v_lot THEN CASE WHEN jsonb_typeof(v_row -> 'item_ids') = 'array' THEN v_row -> 'item_ids' ELSE '[]'::jsonb END
                                 ELSE jsonb_build_array(v_listing) END) x WHERE x IS NOT NULL AND btrim(x) <> ''))
                      AND (v_vendu IS NULL OR v.created_at >= v_vendu - interval '3 days')))
           ORDER BY v.id
        LOOP
          BEGIN
            v_ex := vente_commande_annulee_vinted(v_vente_id, v_statut, v_ref, v_vendu);
            IF v_ex ->> 'action' = 'retiree' THEN c_annulees_retirees := c_annulees_retirees + 1;
            ELSIF v_ex ->> 'action' = 'signalee' THEN c_annulees_signalees := c_annulees_signalees + 1;
            END IF;
          EXCEPTION WHEN OTHERS THEN
            RAISE WARNING 'vente_commande_annulee_vinted (vente %) : % — relevé poursuivi', v_vente_id, sqlerrm;
          END;
        END LOOP;
      END IF;
      CONTINUE;
    END IF;
    -- (17/10, R1 — point 12) Une commande Vinted ni vendue ni annulée laisse sa trace sur
    -- les ventes SANS commande qu'elle désigne par numéro (usage_logs
    -- 'vente_vinted_commande_lue', une fois) : rien d'autre n'est décidé.
    IF p_platform = 'vinted' AND v_classe NOT IN ('vente', 'annulee') THEN
      PERFORM public.vinted_commande_lue_tracer(v_user, v_ref, v_statut, v_row, v_listing);
    END IF;
    IF v_classe = 'en_cours' THEN c_en_cours := c_en_cours + 1; CONTINUE; END IF;
    IF v_classe <> 'vente' THEN
      v_cle := left(coalesce(nullif(v_statut,''), '(vide)'), 40);
      v_inconnus := jsonb_set(v_inconnus, ARRAY[v_cle],
                              to_jsonb(coalesce((v_inconnus ->> v_cle)::int, 0) + 1));
      CONTINUE;
    END IF;

    -- (17/10, lots Vinted) Une commande déjà ÉCLATÉE (une vente par article) : la liste
    -- ne recrée jamais sa ligne d'attente.
    IF p_platform = 'vinted' AND EXISTS (SELECT 1 FROM vinted_commandes_articles ca
                                          WHERE ca.user_id = v_user AND ca.commande_ref = v_ref AND ca.eclatee_le IS NOT NULL) THEN
      c_deja := c_deja + 1;
      CONTINUE;
    END IF;
    -- (17/10) Une commande à UN article dont le détail est connu : son numéro EXACT quand la
    -- ligne n'en porte pas (la liste, ou un détail sans item_id).
    IF p_platform = 'vinted' AND v_listing IS NULL AND NOT v_lot THEN
      SELECT min(ca.item_id) INTO v_listing FROM vinted_commandes_articles ca
       WHERE ca.user_id = v_user AND ca.commande_ref = v_ref HAVING count(*) = 1;
    END IF;

    v_inv := NULL; v_bande := NULL;
    IF v_lot THEN
      c_lots := c_lots + 1;
      v_bande := 'lot';
    ELSE
      IF v_listing IS NOT NULL THEN
        IF p_platform = 'vinted' THEN
          SELECT i.id INTO v_inv FROM inventaire i
           WHERE i.user_id = v_user AND i.vinted_item_id = v_listing AND i.fusionne_dans IS NULL
           ORDER BY i.id DESC LIMIT 1;
        END IF;
        IF v_inv IS NULL THEN
          SELECT ap.inventaire_id INTO v_inv FROM annonces_plateforme ap
           WHERE ap.user_id = v_user AND ap.platform = p_platform
             AND ap.listing_id = v_listing AND ap.inventaire_id IS NOT NULL
             AND public.retrait_job_prouve(ap.job_id)
           ORDER BY ap.updated_at DESC NULLS LAST LIMIT 1;
        END IF;
        IF v_inv IS NULL THEN
          SELECT j.inventaire_id INTO v_inv FROM cross_post_jobs j
           WHERE j.user_id = v_user AND j.platform = p_platform AND j.inventaire_id IS NOT NULL
             AND j.action IN ('publish', 'republish') AND public.retrait_job_prouve(j.id)
             AND listing_designe(v_listing,j.listing_url,j.platform_listing_id)
           ORDER BY coalesce(j.published_at, j.created_at) DESC LIMIT 1;
        END IF;
        IF v_inv IS NOT NULL THEN v_bande := 'identifiant'; END IF;
      END IF;

      IF v_inv IS NULL AND v_titre IS NOT NULL
         AND NOT coalesce((v_row ->> 'id_attendu')::boolean, false) THEN
        -- (09/10, Jocabroc) IDENTIFIANT SEULEMENT, TITRE VIDE. Seules les bandes
        -- « job » et « job_clos » sont retenues ci-dessous, et rapprocher_classer
        -- ne les rend que par l'identifiant, AVANT de lire le titre. Le titre
        -- n'ajoutait qu'une comparaison à toute la boutique dont le verdict était
        -- JETÉ : sur un gros compte, 8 s dépassées, l'appel entier annulé, aucune
        -- commande jamais écrite. Avec un titre vide la fonction s'arrête juste
        -- après ses deux recherches par identifiant : même résultat, sans le coût.
        v_verdict := rapprocher_classer(v_user, p_platform, coalesce(v_listing,''),
                                        coalesce(v_url,''), '', v_prix, ARRAY[]::text[]);
        v_bande := v_verdict ->> 'bande';
        IF v_bande IN ('job','job_clos') THEN
          v_inv := nullif(v_verdict ->> 'inventaire_id','')::bigint;
        ELSE
          v_inv := NULL;
        END IF;
      END IF;
    END IF;
    IF v_inv IS NOT NULL THEN
      -- Même verrou que la confirmation manuelle : le relevé ne peut pas
      -- insérer une deuxième vente pendant la confirmation de la première.
      PERFORM pg_advisory_xact_lock(hashtextextended(v_user::text||':'||v_inv::text,0));
      PERFORM 1 FROM inventaire WHERE id=v_inv AND user_id=v_user FOR UPDATE;
      c_rattachees := c_rattachees + 1;
    END IF;

    v_pa := NULL; v_pai := NULL; v_pc := 0; v_benef := NULL; v_pct := NULL;
    IF v_inv IS NOT NULL THEN
      SELECT i.prix_achat, i.prix_achat_inconnu, coalesce(i.purchase_costs,0)
        INTO v_pa, v_pai, v_pc FROM inventaire i WHERE i.id = v_inv;
      IF coalesce(v_pai,false) THEN v_pa := NULL; END IF;
      IF v_pa IS NOT NULL AND v_prix IS NOT NULL THEN
        v_benef := v_prix - v_pa - v_pc - coalesce(v_frais,0);
        IF v_prix > 0 THEN v_pct := (v_benef / v_prix) * 100; END IF;
      END IF;
    END IF;

    v_adopte := NULL; v_autre_pf := false; v_vente_id := NULL;
    IF v_inv IS NOT NULL AND v_listing IS NOT NULL AND NOT v_lot THEN
      -- Un reçu lie cette vente à CET identifiant d'annonce, y compris une
      -- copie dont la confirmation est arrivée par une autre plateforme.
      SELECT v.id INTO v_adopte FROM ventes_operations o
      JOIN ventes v ON v.id=(o.resultat#>>'{ventes_ids,0}')::bigint AND v.user_id=v_user
      WHERE o.user_id=v_user AND o.inventaire_id=v_inv
        AND jsonb_array_length(o.resultat->'ventes_ids')=1
        AND (v.commande_ref IS NULL OR v.commande_ref=v_ref)
        AND (o.cle='annonce:'||p_platform||':'||v_listing OR EXISTS(
          SELECT 1 FROM cross_post_jobs j WHERE j.user_id=v_user AND j.inventaire_id=v_inv
            AND j.platform=p_platform AND listing_designe(v_listing,j.listing_url,j.platform_listing_id)
            AND j.platform_fields->>'vente_operation_cle'=o.cle))
      ORDER BY o.cree_le DESC LIMIT 1;
    END IF;
    -- (02/10 soir, point 9) La ligne que le relevé a DÉJÀ posée pour cette
    -- commande (premier temps Vinted : liste sans numéro d'annonce).
    v_rel := NULL;
    SELECT v.* INTO v_rel FROM ventes v
     WHERE v.user_id = v_user AND v.plateforme_code = p_platform AND v.commande_ref = v_ref;
    -- LA VENTE SAISIE DE LA MÊME CESSION (02/10 soir, point 9 — règle de Nico :
    -- « le relevé ne crée jamais une deuxième vente pour un article qui a déjà
    -- une vente enregistrée pour cette même cession ; il complète l'existante »).
    -- Preuve : la fiche, désignée par le NUMÉRO d'annonce (v_inv ci-dessus),
    -- porte UNE seule vente sans commande, de cette plateforme ou sans
    -- plateforme ; aucune autre commande n'y est déjà relevée ; et la fiche est
    -- à pièce unique (quantité ≤ 1, jamais une revente en plusieurs exemplaires).
    -- Jamais le titre. Sans preuve, deux lignes restent (la vente reste
    -- « à compléter », visible).
    IF v_adopte IS NULL AND v_inv IS NOT NULL AND NOT v_lot THEN
      SELECT coalesce(i.quantite, 1) INTO v_q_fiche FROM inventaire i WHERE i.id = v_inv;
      SELECT EXISTS (SELECT 1 FROM ventes v WHERE v.user_id = v_user AND v.inventaire_id = v_inv
                       AND v.commande_ref IS NOT NULL AND v.commande_ref <> v_ref) INTO v_autres_cmd;
      SELECT count(*) INTO v_nb_adoptables FROM ventes v
       WHERE v.user_id = v_user AND v.inventaire_id = v_inv AND v.commande_ref IS NULL
         AND v.id IS DISTINCT FROM v_rel.id
         AND coalesce(plateforme_normalisee(coalesce(v.plateforme_code, v.plateforme)), p_platform) = p_platform;
      IF v_nb_adoptables = 1 AND NOT v_autres_cmd AND coalesce(v_q_fiche, 1) <= 1 THEN
        SELECT v.id INTO v_adopte FROM ventes v
         WHERE v.user_id = v_user AND v.inventaire_id = v_inv AND v.commande_ref IS NULL
           AND v.id IS DISTINCT FROM v_rel.id
           AND coalesce(plateforme_normalisee(coalesce(v.plateforme_code, v.plateforme)), p_platform) = p_platform
         LIMIT 1;
      END IF;
      -- (09/10, audit eBay — XEWER, GO de Nico) LA MÊME CESSION, DÉCLARÉE SUR UNE AUTRE
      -- PLATEFORME : la commande désigne la fiche par le NUMÉRO de son annonce (v_inv),
      -- la fiche est ÉPUISÉE (quantité 0 : jamais une revente en plusieurs exemplaires,
      -- une vente partielle laisse une quantité) et porte UNE SEULE vente, sans
      -- commande, d'une autre plateforme → la commande s'y fond (sa plateforme, sa date
      -- réelle) ; la saisie de la personne prime pour le reste.
      IF v_adopte IS NULL AND coalesce(v_q_fiche, 1) <= 0 AND NOT v_autres_cmd AND v_rel.id IS NULL THEN
        SELECT count(*) INTO v_nb_ventes_fiche FROM ventes v WHERE v.user_id = v_user AND v.inventaire_id = v_inv;
        IF v_nb_ventes_fiche = 1 THEN
          SELECT v.id INTO v_adopte FROM ventes v
           WHERE v.user_id = v_user AND v.inventaire_id = v_inv AND v.commande_ref IS NULL
             AND coalesce(plateforme_normalisee(coalesce(v.plateforme_code, v.plateforme)), '') <> p_platform;
          IF v_adopte IS NOT NULL THEN
            v_autre_pf := true;
            INSERT INTO usage_logs (user_id, feature, metadata)
            VALUES (v_user, 'vente_fusionnee', jsonb_build_object(
              'gardee', v_adopte, 'motif', 'meme_cession_autre_plateforme', 'plateforme', p_platform,
              'commande', v_ref, 'annonce', v_listing, 'inventaire_id', v_inv,
              'avant', (SELECT to_jsonb(v) FROM ventes v WHERE v.id = v_adopte), 'par', 'enregistrer_ventes_relevees'));
          END IF;
        END IF;
      END IF;
    END IF;

    IF v_adopte IS NOT NULL THEN
      -- (02/10 soir, point 9) CE QUE LA PERSONNE A SAISI PRIME : prix de vente,
      -- prix d'achat, date et bénéfice saisis ne bougent pas ; le relevé ne
      -- remplit que ce qui est vide (date réelle vendu_le, plateforme, commande,
      -- numéro d'annonce, frais). La ligne que le relevé avait posée pour cette
      -- commande est FUSIONNÉE dans la vente gardée (trace complète dans
      -- usage_logs 'vente_fusionnee'), puis supprimée — AVANT de poser la
      -- commande sur la vente gardée : plus jamais la collision 23505 qui
      -- faisait échouer tout le relevé.
      IF v_rel.id IS NOT NULL AND v_rel.id <> v_adopte THEN
        INSERT INTO usage_logs (user_id, feature, metadata)
        VALUES (v_user, 'vente_fusionnee', jsonb_build_object(
          'gardee', v_adopte, 'fusionnee', to_jsonb(v_rel), 'motif', 'releve_dans_vente_saisie',
          'plateforme', p_platform, 'commande', v_ref, 'annonce', v_listing, 'inventaire_id', v_inv,
          'par', 'enregistrer_ventes_relevees'));
        DELETE FROM ventes WHERE id = v_rel.id AND user_id = v_user;
        c_fusionnees := c_fusionnees + 1;
      END IF;
      UPDATE ventes v SET
        commande_ref       = v_ref,
        plateforme_code    = p_platform,
        plateforme_origine = coalesce(v.plateforme_origine, v.plateforme),
        plateforme         = CASE WHEN v_autre_pf THEN p_platform ELSE coalesce(v.plateforme, p_platform) END,
        vendu_le           = coalesce(v.vendu_le, v_vendu, v_rel.vendu_le),
        date               = coalesce(v.date, (v_vendu AT TIME ZONE 'Europe/Paris')::date, v_rel.date),
        prix_vente         = coalesce(v.prix_vente, v_prix, v_rel.prix_vente),
        prix_achat         = coalesce(v.prix_achat, v_pa),
        benefice           = coalesce(v.benefice,
                               CASE WHEN coalesce(v.prix_vente, v_prix) IS NOT NULL AND coalesce(v.prix_achat, v_pa) IS NOT NULL
                                    THEN coalesce(v.prix_vente, v_prix) - coalesce(v.prix_achat, v_pa) - v_pc
                                         - coalesce(v.frais_plateforme, v_frais, 0) END),
        devise             = coalesce(v.devise, v_devise, v_rel.devise),
        frais_plateforme   = coalesce(v.frais_plateforme, v_frais, v_rel.frais_plateforme),
        titre              = coalesce(nullif(btrim(v.titre),''), v_titre),
        inventaire_id      = coalesce(v.inventaire_id, v_inv),
        annonce_id         = coalesce(v.annonce_id, v_listing),
        releve_le          = now()
      WHERE v.id = v_adopte;
      c_adoptees := c_adoptees + 1;
      v_vente_id := v_adopte;
    ELSE
      INSERT INTO ventes (
        user_id, titre, prix_vente, prix_achat, benefice, date, vendu_le,
        plateforme, plateforme_code, plateforme_origine, commande_ref,
        source, releve_le, devise, frais_plateforme, selling_fees,
        inventaire_id, quantite, statut, annonce_id
      ) VALUES (
        v_user, v_titre, v_prix, v_pa, v_benef,
        (v_vendu AT TIME ZONE 'Europe/Paris')::date, v_vendu,
        p_platform, p_platform, NULL, v_ref,
        'releve', now(), v_devise, v_frais, coalesce(v_frais, 0),
        v_inv, 1, 'vendu', CASE WHEN v_lot THEN NULL ELSE v_listing END
      )
      ON CONFLICT (user_id, plateforme_code, commande_ref)
        WHERE commande_ref IS NOT NULL AND plateforme_code IS NOT NULL
      DO UPDATE SET
        vendu_le         = coalesce(ventes.vendu_le, EXCLUDED.vendu_le),
        date             = coalesce(ventes.date, EXCLUDED.date),
        prix_vente       = coalesce(ventes.prix_vente, EXCLUDED.prix_vente),
        devise           = coalesce(ventes.devise, EXCLUDED.devise),
        frais_plateforme = coalesce(ventes.frais_plateforme, EXCLUDED.frais_plateforme),
        titre            = coalesce(nullif(btrim(ventes.titre),''), EXCLUDED.titre),
        inventaire_id    = coalesce(ventes.inventaire_id, EXCLUDED.inventaire_id),
        -- (02/10 soir) la fiche arrive au second temps : son prix d'achat et
        -- le bénéfice viennent avec (jamais un écrasement d'une valeur posée).
        prix_achat       = coalesce(ventes.prix_achat, EXCLUDED.prix_achat),
        benefice         = coalesce(ventes.benefice, EXCLUDED.benefice),
        annonce_id       = coalesce(ventes.annonce_id, EXCLUDED.annonce_id),
        releve_le        = now()
      RETURNING (xmax = 0), id INTO v_insere, v_vente_id;
      IF v_insere THEN c_creees := c_creees + 1; ELSE c_deja := c_deja + 1; END IF;

      -- (02/10 soir, point 9) L'ancien « passage détail » SUPPRIMAIT la vente
      -- saisie par la personne et gardait les valeurs du relevé : retiré. La
      -- même cession est désormais fusionnée DANS la vente saisie (plus haut).
    END IF;

    -- (17/10, lots Vinted — point 11) UNE COMMANDE VINTED À PLUSIEURS ARTICLES = UNE VENTE PAR
    -- ARTICLE (vente_vinted_lot_noter → vente_vinted_lot_eclater) : chaque article de la
    -- composition lue est vendu par le circuit normal, la ligne d'attente disparaît ; une
    -- ligne née avant la règle attend le script de réparation ; un doute ne change rien.
    IF p_platform = 'vinted' AND EXISTS (SELECT 1 FROM vinted_commandes_articles ca
                                          WHERE ca.user_id = v_user AND ca.commande_ref = v_ref HAVING count(*) >= 2) THEN
      v_ex_lot := public.vente_vinted_lot_noter(v_user, v_ref, v_statut, 'releve');
      IF v_ex_lot ->> 'issue' = 'eclatee' THEN c_lots_eclates := c_lots_eclates + 1;
      ELSIF v_ex_lot ->> 'issue' = 'a_reparer' THEN c_lots_a_reparer := c_lots_a_reparer + 1;
      ELSIF v_ex_lot ->> 'issue' = 'en_doute' THEN c_lots_en_doute := c_lots_en_doute + 1;
      END IF;
    END IF;

    -- (09/10 soir, règle de Nico) UNE COMMANDE eBAY = LA VENTE D'UN EXEMPLAIRE,
    -- PAS DE LA FICHE : la quantité eBay lue APRÈS la commande décide
    -- (ebay_commande_appliquer) — épuisée/terminée : fiche vendue + retrait des
    -- copies prouvées ; disponible : fiche en stock à la quantité eBay, aucun
    -- retrait ; inconnue : rien d'irréversible, relue au passage suivant.
    IF p_platform = 'ebay' AND v_inv IS NOT NULL AND NOT v_lot AND v_vente_id IS NOT NULL THEN
      BEGIN
        v_ex := ebay_commande_appliquer(v_vente_id);
        IF v_ex ->> 'decision' = 'vendue' THEN c_ex_vendues := c_ex_vendues + 1;
        ELSIF v_ex ->> 'decision' = 'en_stock' THEN c_ex_stock := c_ex_stock + 1;
        ELSIF v_ex ->> 'decision' = 'a_relire' THEN c_ex_relire := c_ex_relire + 1;
        END IF;
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'ebay_commande_appliquer (vente %) : % — relevé poursuivi', v_vente_id, sqlerrm;
      END;
    END IF;

    IF v_inv IS NOT NULL AND v_prix IS NOT NULL THEN
      SELECT i.statut, i.prix_vente INTO v_st, v_pv FROM inventaire i WHERE i.id = v_inv;
      IF v_st = 'vendu' AND v_pv IS NULL THEN
        UPDATE inventaire i SET prix_vente = v_prix,
               margin = coalesce(i.margin, v_benef), margin_pct = coalesce(i.margin_pct, v_pct)
         WHERE i.id = v_inv AND i.statut = 'vendu' AND i.prix_vente IS NULL;
        c_inv_completes := c_inv_completes + 1;
      END IF;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'plateforme', p_platform, 'recues', c_recues, 'creees', c_creees,
    'adoptees', c_adoptees, 'deja_connues', c_deja, 'rattachees', c_rattachees,
    'lots', c_lots, 'annulees', c_annulees, 'en_cours', c_en_cours,
    'sans_ref', c_sans_ref, 'statuts_inconnus', v_inconnus,
    'articles_completes', c_inv_completes, 'saisies_fusionnees', c_fusionnees,
    'supprimees_par_la_personne', c_supprimees,
    'exemplaires_vendus', c_ex_vendues, 'exemplaires_en_stock', c_ex_stock, 'exemplaires_a_relire', c_ex_relire,
    'annulees_retirees', c_annulees_retirees, 'annulees_signalees', c_annulees_signalees,
    'compositions', c_compositions, 'lots_eclates', c_lots_eclates, 'lots_a_reparer', c_lots_a_reparer,
    'lots_en_doute', c_lots_en_doute, 'autre_compte_relie', c_autre_compte);
END;
$function$;

CREATE OR REPLACE FUNCTION public.inventaire_ecarte_import_sync()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_motif text;
begin
  -- Ne concerne QUE les lignes ecrites par la sync dressing.
  -- La saisie manuelle (origine NULL) n'est JAMAIS touchee : 1 074 articles
  -- manuels sans photo chez 239 comptes, c'est du stock legitime.
  if coalesce(new.origine,'') <> 'vinted_sync' then
    return new;
  end if;

  -- (08/10 soir) Une fiche du dressing qui LÂCHE son annonce Vinted n'importe
  -- rien : c'est la fusion qui fait passer l'identité Vinted à la fiche gardée
  -- (inventaire_fusionner_pour vide d'abord vinted_item_id ET vinted_account_id
  -- de la fiche fondue). Cette garde y voyait une boutique non confirmée et
  -- refusait la fusion : plus AUCUNE fusion déplaçant l'identité Vinted n'a
  -- abouti depuis le 28/09 (208 le 25/09, 0 depuis), à la main comme par le
  -- moteur. Seule cette écriture-là passe ; tout le reste est inchangé.
  if TG_OP = 'UPDATE' and new.vinted_item_id is null then
    return new;
  end if;

  -- Le contrôle précède aussi l'upsert : une ligne historique étrangère
  -- n'autorise pas un nouveau relevé. Lecture du profil par sa clé primaire.
  -- (18/10, Louis) Une boutique n'appartient qu'à UN compte FillSell : déjà suivie ailleurs,
  -- rien n'est importé ici. L'ancien marqueur reste en tête pour que les extensions d'avant
  -- s'arrêtent sans réessayer ; [boutique_autre_compte] dit la vraie raison à l'app.
  if public.boutique_vinted_autre_compte(new.user_id, new.vinted_account_id) then
    raise exception '[boutique_a_confirmer][boutique_autre_compte] Cette boutique Vinted est déjà suivie par un autre compte FillSell. Rien n’a été importé et rien n’a changé sur Vinted : une boutique se suit sur un seul compte.';
  end if;
  if not boutique_vinted_confirmee(new.user_id,new.vinted_account_id) then
    raise exception '[boutique_a_confirmer] Cette boutique Vinted n’est pas confirmée sur ton compte FillSell. Confirme-la dans « Actualiser mon dressing » si elle t’appartient. Aucun article n’a été importé.';
  end if;
  if TG_OP='UPDATE' then return new; end if;

  -- INSERT PUR UNIQUEMENT (28/08, resserrage).
  -- En PostgreSQL un BEFORE INSERT tire AVANT la resolution du ON CONFLICT :
  -- un RETURN NULL annulerait aussi le DO UPDATE de l'upsert de la sync, et
  -- figerait la ligne existante (vues, favoris, prix, statut) pour toujours.
  -- Si l'article existe deja, on laisse passer : la derive draft/hidden se
  -- traite a l'affichage, pas en gelant la donnee.
  if exists (
    select 1 from inventaire i
    where i.user_id = new.user_id
      and i.vinted_item_id is not distinct from new.vinted_item_id
  ) then
    return new;
  end if;

  -- (18/10 soir, Louis) Entre comptes RELIÉS, un article Vinted publié par l'AUTRE compte (son dépôt FillSell,
  -- repéré par son numéro) lui appartient : le relevé de celui-ci ne l'importe pas — jamais deux fiches, jamais
  -- deux ventes (même règle que Leboncoin, 20261018220000).
  if public.annonce_publiee_par_compte_lie(new.user_id, 'vinted', new.vinted_item_id)
     and not public.annonce_publiee_par_compte(new.user_id, 'vinted', new.vinted_item_id) then
    insert into sync_import_ecartes (user_id, vinted_item_id, vinted_status, titre, motif)
    values (new.user_id, new.vinted_item_id, new.vinted_status, left(coalesce(new.titre,''),120), 'compte_relie:vinted');
    return null;
  end if;

  -- (05/10, règle de Nico) Un relevé AUTOMATIQUE du dressing (veille, retrait)
  -- n'importe rien : l'article neuf attend le prochain « Synchroniser ».
  if exists (
    select 1 from vinted_sync_runs r
    where r.user_id = new.user_id and r.kind = 'dressing' and r.status = 'running'
      and not releve_est_geste(r.declencheur)
  ) then
    raise log 'inventaire_ecarte_import_sync : article % non importé (relevé automatique en cours, user %)', new.vinted_item_id, new.user_id;
    return null;
  end if;

  if new.vinted_status = 'draft' then
    v_motif := 'brouillon';
  elsif new.photos is null
     or jsonb_typeof(new.photos) <> 'array'
     or jsonb_array_length(new.photos) = 0 then
    v_motif := 'sans_photo';
  else
    return new;
  end if;

  insert into sync_import_ecartes (user_id, vinted_item_id, vinted_status, titre, motif)
  values (new.user_id, new.vinted_item_id, new.vinted_status, left(coalesce(new.titre,''),120), v_motif);

  return null;
end;
$function$;

-- ═══ TESTS (Louis, comptes réels, tout est annulé par le ROLLBACK final) ═══
-- U = louis@ (faf5021a) : PC 53269f05 (@neyenonie), VM 8632c049 (@evat) ; V = louis-seller (447d920c).
create temp table _p as select extension_postes from profiles where id = 'faf5021a-479a-4bb3-b3ec-c296770739b7';
-- T1 : la sonde de la VM (elle lit Vinted) date SA boutique.
select set_config('request.jwt.claims', '{"sub":"faf5021a-479a-4bb3-b3ec-c296770739b7","role":"authenticated","session_id":"8632c049-2290-4c56-a929-7899f4ea399d"}', true);
update profiles set extension_sessions = coalesce(extension_sessions, '{}'::jsonb) || jsonb_build_object('sondees', jsonb_build_array('vinted'),
  'vinted_identite', jsonb_build_object('user_id', '371531', 'login', 'evat'), 'checked_at', to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
  'checked_at_par_plateforme', jsonb_build_object('vinted', to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')))
 where id = 'faf5021a-479a-4bb3-b3ec-c296770739b7';
insert into _r select 'T1 sonde de la VM : sa boutique datée (371531, sonde)',
  extension_postes -> '8632c049-2290-4c56-a929-7899f4ea399d' ->> 'vinted_user_id' = '371531'
  and extension_postes -> '8632c049-2290-4c56-a929-7899f4ea399d' ->> 'vinted_source' = 'sonde'
  from profiles where id = 'faf5021a-479a-4bb3-b3ec-c296770739b7';
insert into _r select 'T1 la boutique du PC n''a pas bougé',
  (p.extension_postes -> '53269f05-62ce-4750-9b0b-4ee69909e884') is not distinct from (b.extension_postes -> '53269f05-62ce-4750-9b0b-4ee69909e884')
  from profiles p, _p b where p.id = 'faf5021a-479a-4bb3-b3ec-c296770739b7';
-- T1b : une écriture de la VM qui NE sonde PAS Vinted (identité recopiée, ici celle du PC) ne compte pas.
update profiles set extension_sessions = extension_sessions || jsonb_build_object('sondees', jsonb_build_array('beebs'),
  'vinted_identite', jsonb_build_object('user_id', '247512093', 'login', 'neyenonie'), 'checked_at', to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
 where id = 'faf5021a-479a-4bb3-b3ec-c296770739b7';
insert into _r select 'T1b écriture sans sonde Vinted : la VM reste sur 371531',
  extension_postes -> '8632c049-2290-4c56-a929-7899f4ea399d' ->> 'vinted_user_id' = '371531' from profiles where id = 'faf5021a-479a-4bb3-b3ec-c296770739b7';
-- T2 : la sonde du PC date la sienne ; chaque poste lit SA boutique.
select set_config('request.jwt.claims', '{"sub":"faf5021a-479a-4bb3-b3ec-c296770739b7","role":"authenticated","session_id":"53269f05-62ce-4750-9b0b-4ee69909e884"}', true);
update profiles set extension_sessions = extension_sessions || jsonb_build_object('sondees', jsonb_build_array('vinted', 'leboncoin'),
  'vinted_identite', jsonb_build_object('user_id', '247512093', 'login', 'neyenonie'), 'checked_at', to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
  'checked_at_par_plateforme', jsonb_build_object('vinted', to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')))
 where id = 'faf5021a-479a-4bb3-b3ec-c296770739b7';
insert into _r select 'T2 vinted_boutique_du_poste (PC) = 247512093', public.vinted_boutique_du_poste('faf5021a-479a-4bb3-b3ec-c296770739b7') = '247512093';
select set_config('request.jwt.claims', '{"sub":"faf5021a-479a-4bb3-b3ec-c296770739b7","role":"authenticated","session_id":"8632c049-2290-4c56-a929-7899f4ea399d"}', true);
insert into _r select 'T2 vinted_boutique_du_poste (VM) = 371531', public.vinted_boutique_du_poste('faf5021a-479a-4bb3-b3ec-c296770739b7') = '371531';
select set_config('request.jwt.claims', '', true);
insert into _r select 'T2 hors extension : inconnue', public.vinted_boutique_du_poste('faf5021a-479a-4bb3-b3ec-c296770739b7') is null;
-- T3 : la veille de la VM (ouverte sur @evat, boutique de louis-seller) n'enregistre rien chez louis@.
select set_config('request.jwt.claims', '{"sub":"faf5021a-479a-4bb3-b3ec-c296770739b7","role":"authenticated","session_id":"8632c049-2290-4c56-a929-7899f4ea399d"}', true);
insert into _r select 'T3 veille de la VM : refusée (boutique_autre_compte)', r ->> 'motif' = 'boutique_autre_compte'
  from (select public.commandes_vinted_noter(jsonb_build_array(jsonb_build_object('ref', '99018230003', 'item_ids', jsonb_build_array('99018230031'),
        'paye', true, 'prix', 5, 'devise', 'EUR', 'statut', 'needs_action', 'date', now()))) r) x;
insert into _r select 'T3 aucune ligne de commande chez louis@', not exists (select 1 from vinted_commandes_articles where commande_ref = '99018230003');
insert into _r select 'T3 relevé de la VM : refusé aussi', r ->> 'motif' = 'boutique_autre_compte'
  from (select public.enregistrer_ventes_relevees('vinted', '[{"ref":"99018230009","statut":"completed","titre":"essai","prix":"5","listing_id":"99018230091"}]'::jsonb) r) x;
-- T4 : la veille du PC (sa boutique) enregistre comme avant un article inconnu.
select set_config('request.jwt.claims', '{"sub":"faf5021a-479a-4bb3-b3ec-c296770739b7","role":"authenticated","session_id":"53269f05-62ce-4750-9b0b-4ee69909e884"}', true);
insert into _r select 'T4 veille du PC : éclatée comme avant', (r ->> 'eclatees')::int = 1
  from (select public.commandes_vinted_noter(jsonb_build_array(jsonb_build_object('ref', '99018230004', 'item_ids', jsonb_build_array('99018230041'),
        'paye', true, 'prix', 5, 'devise', 'EUR', 'statut', 'needs_action', 'date', now()))) r) x;
insert into _r select 'T4 une vente chez louis@', (select count(*) from ventes where commande_ref = '99018230004' and user_id = 'faf5021a-479a-4bb3-b3ec-c296770739b7') = 1;
-- T5 : une commande déjà enregistrée chez louis-seller ne l'est jamais une 2e fois chez louis@.
insert into ventes (user_id, titre, plateforme, plateforme_code, commande_ref, annonce_id, source, statut, date, quantite, selling_fees)
values ('447d920c-976a-4d8f-aff4-a2998050358c', 'essai 230000', 'Vinted', 'vinted', '99018230005', '99018230051', 'releve', 'vendu', current_date, 1, 0);
insert into _r select 'T5 veille du PC : commande du compte relié écartée', (r ->> 'eclatees')::int = 0
  from (select public.commandes_vinted_noter(jsonb_build_array(jsonb_build_object('ref', '99018230005', 'item_ids', jsonb_build_array('99018230051'),
        'paye', true, 'prix', 5, 'devise', 'EUR', 'statut', 'needs_action', 'date', now()))) r) x;
insert into _r select 'T5 aucune vente chez louis@ (une seule en tout)', (select count(*) from ventes where commande_ref like '99018230005%') = 1;
insert into _r select 'T5 décision compte_relie', exists (select 1 from vinted_commandes_articles where user_id = 'faf5021a-479a-4bb3-b3ec-c296770739b7' and commande_ref = '99018230005' and decision = 'compte_relie');
-- T6 : l'article d'une fiche de louis-seller, vendu et lu par louis@ : enregistré CHEZ louis-seller.
create temp table _f6 as select id, vinted_item_id from inventaire
 where user_id = '447d920c-976a-4d8f-aff4-a2998050358c' and statut = 'stock' and vinted_item_id ~ '^[0-9]+$' and fusionne_dans is null
   and coalesce(quantite, 1) = 1
   and not exists (select 1 from inventaire x where x.user_id = 'faf5021a-479a-4bb3-b3ec-c296770739b7' and x.vinted_item_id = inventaire.vinted_item_id)
 order by id limit 1;
insert into _r select 'T6 veille du PC : renvoyée au compte relié', r::text like '%compte_relie%' or (r ->> 'eclatees')::int = 0
  from (select public.commandes_vinted_noter(jsonb_build_array(jsonb_build_object('ref', '99018230006', 'item_ids', jsonb_build_array((select vinted_item_id from _f6)),
        'paye', true, 'prix', 7, 'devise', 'EUR', 'statut', 'needs_action', 'date', now()))) r) x;
insert into _r select 'T6 vente chez louis-seller, sur SA fiche', exists (select 1 from ventes where commande_ref = '99018230006' and user_id = '447d920c-976a-4d8f-aff4-a2998050358c' and inventaire_id = (select id from _f6));
insert into _r select 'T6 le jeton de louis@ est rendu après le renvoi', auth.uid() = 'faf5021a-479a-4bb3-b3ec-c296770739b7'::uuid;
insert into _r select 'T6 aucune vente chez louis@', not exists (select 1 from ventes where commande_ref like '99018230006%' and user_id = 'faf5021a-479a-4bb3-b3ec-c296770739b7');
-- T7 : l'article publié par louis@ sur @evat (job 56e8788c) n'est jamais importé chez louis-seller.
select set_config('request.jwt.claims', '', true);
insert into inventaire (user_id, titre, origine, vinted_item_id, vinted_account_id, vinted_status, photos, statut)
values ('447d920c-976a-4d8f-aff4-a2998050358c', 'essai 230000', 'vinted_sync', '10432288057', '371531', 'active', '["https://x/y.jpg"]'::jsonb, 'stock');
insert into _r select 'T7 relevé de louis-seller : l''article de louis@ non importé', not exists (select 1 from inventaire where user_id = '447d920c-976a-4d8f-aff4-a2998050358c' and vinted_item_id = '10432288057');
insert into _r select 'T7 tracé compte_relie:vinted', exists (select 1 from sync_import_ecartes where user_id = '447d920c-976a-4d8f-aff4-a2998050358c' and vinted_item_id = '10432288057' and motif = 'compte_relie:vinted');
-- T8 : sa vente relevée par louis-seller : laissée à louis@ (pas de vente « pas suivie » chez louis-seller).
insert into _r select 'T8 relevé de louis-seller : vente de l''article de louis@ écartée', (r ->> 'autre_compte_relie')::int = 1
  from (select public.enregistrer_ventes_relevees('vinted', '[{"ref":"99018230008","statut":"completed","titre":"essai","prix":"10","listing_id":"10432288057"}]'::jsonb,
        '447d920c-976a-4d8f-aff4-a2998050358c') r) x;
insert into _r select 'T8 aucune vente chez louis-seller', not exists (select 1 from ventes where commande_ref like '99018230008%');
-- T9 : un compte sans poste connu : rien ne change (Régis, veille d'un article inconnu).
select set_config('request.jwt.claims', '{"sub":"309d0787-9000-46cc-9c6a-51f7475d7d41","role":"authenticated","session_id":"00000000-0000-0000-0000-000000000000"}', true);
insert into _r select 'T9 compte non relié, poste inconnu : comme avant', public.vinted_boutique_du_poste('309d0787-9000-46cc-9c6a-51f7475d7d41') is null;
select set_config('request.jwt.claims', '', true);
select essai, ok from _r order by essai;
rollback;
