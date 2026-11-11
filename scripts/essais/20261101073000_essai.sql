-- Essai à blanc de 20261101073000_question_article_inconnu_vente_recente : ROLLBACK. Généré par 20261101073000_generer.sh.
begin;
set local statement_timeout = '120s';
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 20261101073000 — UNE VENTE ANCIENNE D'UN ARTICLE INCONNU N'EST JAMAIS UNE QUESTION « RETIRE-LE AILLEURS » (01/11)
-- Le cas (nuit du 31/10 au 01/11) : la composition de 34 commandes « Lot N articles » déjà en historique a été lue par
-- le relevé (the_closet72 00:45-00:47, 27 lots → 106 articles vendus du 29/08 au 11/11/2025 ; PILOU 02:49-02:51, 7 lots
-- → 17 articles du 30/12/2025 au 16/01/2026). vente_vinted_lot_eclater a écrit une vente par article (règle du 17/10)
-- et, pour chaque article que FillSell ne suit pas, la question usage_logs « vente_vinted_article_inconnu » (« s'il
-- est en vente ailleurs hors FillSell, retire-le là-bas ») — sur des ventes vieilles d'un an. Aucun mail, aucun push.
-- La règle : la question n'est posée que pour une vente RÉCENTE, qui peut encore laisser une copie en ligne ailleurs :
-- date de vente connue et de moins de 48 h quand la commande est lue (question_article_inconnu_due ; même fenêtre que
-- la garde « vente récente prouvée » des mails : une commande lue qui porte sa date < 48 h). Plus ancienne (donc bien
-- avant le relevé qui la lit, et a fortiori avant l'inscription) ou d'âge inconnu : la vente entre dans l'historique
-- comme une vente normale (même vente, même composition, même décision « article_inconnu »), sans question. Rien
-- d'autre ne change : jamais un retrait, le mail par commande < 24 h inchangé.
-- Fonction réécrite depuis pg_get_functiondef relu en production le 01/11 (md5 00383597…) ; seul le bloc (D6) change.
-- Aucune donnée réécrite (les 123 questions de la nuit : scripts/reparations/20261101_questions_article_inconnu_anciennes.sql).
-- Inverse : supabase/rollbacks/20261101073000_question_article_inconnu_vente_recente_INVERSE.sql
-- Essai à blanc : scripts/essais/20261101073000_generer.sh → 20261101073000_essai.sql (ROLLBACK).
-- Application (autorisation de Nico du 01/11 : « Push, déploiements et OTA en production autorisés ») :
--   npx supabase db query --linked -f <ce fichier>
--   puis npx supabase migration repair --linked --status applied 20261101073000
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════

do $garde$
begin
  if md5(pg_get_functiondef('public.vente_vinted_lot_eclater(uuid,text,text)'::regprocedure))
     is distinct from '003835978f4e9578e222bc87f5913560' then
    raise exception 'définition de vente_vinted_lot_eclater changée en prod depuis le 01/11 : migration arrêtée, rien n''est écrit';
  end if;
end
$garde$;

-- Une vente RÉCENTE : sa date est connue et a moins de 48 h à l'instant où elle est lue (p_lu_le, maintenant par
-- défaut). Une vente plus ancienne, ou sans date, ne fait jamais poser « retire-le ailleurs ».
create or replace function public.question_article_inconnu_due(p_vendu_le timestamptz, p_lu_le timestamptz default now())
 returns boolean
 language sql
 stable
 set search_path to 'public', 'pg_temp'
as $function$
  select p_vendu_le is not null and p_vendu_le >= coalesce(p_lu_le, now()) - interval '48 hours'
$function$;
revoke all on function public.question_article_inconnu_due(timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.question_article_inconnu_due(timestamptz, timestamptz) to service_role;

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
            -- (D6) inconnu de FillSell : vente sans fiche, JAMAIS un retrait ; la question « retire-le ailleurs »
            -- seulement pour une vente RÉCENTE (01/11, question_article_inconnu_due) : une vente ancienne lue dans
            -- l'historique entre dans l'historique comme une vente normale, sans question.
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
            IF public.question_article_inconnu_due(v_le) AND NOT EXISTS (SELECT 1 FROM usage_logs u
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

-- Tests de 20261101073000 (question « retire-le ailleurs » : vente récente seulement), rejoués DANS la transaction de
-- l'essai puis ROLLBACK. Deux commandes fictives (numéros 9999990110x, articles 9999990111x) sur le compte de Nico
-- (f44b5917…) : un lot vendu le 01/09/2025, lu maintenant ; un lot vendu il y a 2 h. Puis la réparation des 123
-- questions de la nuit et son inverse, rejoués eux aussi.
create temp table _r (essai text, ok boolean, detail text) on commit drop;

do $t$
declare r jsonb; n int; q int; d text;
begin
  insert into _r values
    ('T1 vendue il y a 1 h : question', public.question_article_inconnu_due(now() - interval '1 hour'), null),
    ('T1 vendue il y a 47 h : question', public.question_article_inconnu_due(now() - interval '47 hours'), null),
    ('T1 vendue il y a 49 h : aucune', not public.question_article_inconnu_due(now() - interval '49 hours'), null),
    ('T1 date inconnue : aucune', not public.question_article_inconnu_due(null), null),
    ('T1 boutique-8ac5bbda (04/09/2025 lue le 01/11) : aucune',
       not public.question_article_inconnu_due('2025-09-04 16:09:20+00', '2026-10-31 23:45:29+00'), null),
    ('T1 boutique-essai-4 (31/10 07:36 lue le 01/11 00:28) : question',
       public.question_article_inconnu_due('2026-10-31 06:36:32+00', '2026-10-31 23:28:40+00'), null),
    ('T2 eclater appelle la règle, une seule fois',
       (select (length(prosrc) - length(replace(prosrc, 'question_article_inconnu_due(v_le)', '')))
               / length('question_article_inconnu_due(v_le)') = 1
          from pg_proc where oid = 'public.vente_vinted_lot_eclater(uuid,text,text)'::regprocedure), null);

  -- T3. Lot ancien, deux articles inconnus de FillSell : deux ventes normales, aucune question, aucune note.
  insert into vinted_commandes_articles (user_id, commande_ref, item_id, position, nb_articles, statut, paye, total, devise, commande_le, source)
  values ('f44b5917-bccc-4431-ba41-f40571a2ed18', '99999901101', '99999901111', 1, 2, 'completed', true, 10, 'EUR', '2025-09-01 10:00:00+00', 'releve'),
         ('f44b5917-bccc-4431-ba41-f40571a2ed18', '99999901101', '99999901112', 2, 2, 'completed', true, 10, 'EUR', '2025-09-01 10:00:00+00', 'releve');
  r := public.vente_vinted_lot_eclater('f44b5917-bccc-4431-ba41-f40571a2ed18', '99999901101', 'releve');
  select count(*) into n from ventes where user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18'
     and split_part(commande_ref, ':', 1) = '99999901101'
     and inventaire_id is null and statut = 'vendu' and date = '2025-09-01' and source = 'releve';
  select count(*) into q from usage_logs where user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18'
     and feature = 'vente_vinted_article_inconnu' and metadata ->> 'commande' = '99999901101';
  select string_agg(decision, ',' order by item_id) into d from vinted_commandes_articles
   where user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18' and commande_ref = '99999901101';
  insert into _r values ('T3 lot ancien : 2 ventes au 01/09/2025, 0 question, décisions article_inconnu, aucune note',
    r ->> 'issue' = 'eclatee' and n = 2 and q = 0 and d = 'article_inconnu,article_inconnu' and r ->> 'note' is null,
    format('issue=%s ventes=%s questions=%s decisions=%s', r ->> 'issue', n, q, d));

  -- T4. Lot récent (il y a 2 h), mêmes conditions : la question est posée pour chaque article, comme avant.
  insert into vinted_commandes_articles (user_id, commande_ref, item_id, position, nb_articles, statut, paye, total, devise, commande_le, source)
  values ('f44b5917-bccc-4431-ba41-f40571a2ed18', '99999901102', '99999901113', 1, 2, 'completed', true, 10, 'EUR', now() - interval '2 hours', 'releve'),
         ('f44b5917-bccc-4431-ba41-f40571a2ed18', '99999901102', '99999901114', 2, 2, 'completed', true, 10, 'EUR', now() - interval '2 hours', 'releve');
  r := public.vente_vinted_lot_eclater('f44b5917-bccc-4431-ba41-f40571a2ed18', '99999901102', 'releve');
  select count(*) into n from ventes where user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18'
     and split_part(commande_ref, ':', 1) = '99999901102' and inventaire_id is null and statut = 'vendu';
  select count(*) into q from usage_logs where user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18'
     and feature = 'vente_vinted_article_inconnu' and metadata ->> 'commande' = '99999901102' and metadata ? 'question';
  insert into _r values ('T4 lot récent : 2 ventes, 2 questions (inchangé)', r ->> 'issue' = 'eclatee' and n = 2 and q = 2,
    format('issue=%s ventes=%s questions=%s', r ->> 'issue', n, q));
end
$t$;

-- T5. Avant la réparation des questions de la nuit : le périmètre et l'empreinte des ventes des trois comptes.
do $av$
begin
  insert into _r select 'T5 avant : 125 questions de la nuit', count(*) = 125, count(*)::text
    from usage_logs where feature = 'vente_vinted_article_inconnu'
     and user_id in ('8ac5bbda-0947-4612-82fd-effdaa3ca84a', 'cae7a20d-56c8-46a6-868c-ae1f885faa70', '8a2eba68-7a2d-4fc1-aab0-aba23189c33b')
     and created_at >= '2026-11-01 00:00:00 Europe/Paris'::timestamptz and created_at < '2026-11-01 03:00:00 Europe/Paris'::timestamptz;
  create temp table _ventes_avant on commit drop as select md5(string_agg(row(v.*)::text, '|' order by v.id)) h, count(*) n
    from ventes v where v.user_id in ('8ac5bbda-0947-4612-82fd-effdaa3ca84a', 'cae7a20d-56c8-46a6-868c-ae1f885faa70', '8a2eba68-7a2d-4fc1-aab0-aba23189c33b');
end
$av$;
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 01/11 — LES QUESTIONS « RETIRE-LE AILLEURS » POSÉES CETTE NUIT SUR DES VENTES ANCIENNES : NEUTRALISÉES
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- Autorisation de Nico (01/11, point 4) : neutraliser la question sur les ventes de cette nuit (the_closet72, PILOU,
-- nadegemarcelin78), avec sauvegarde et inverse ; aucune vente supprimée, aucun mail.
-- Périmètre = la RÈGLE de 20261101073000 appliquée à l'instant où chaque question a été posée (même expression que
-- question_article_inconnu_due(vente.vendu_le, question.created_at), écrite ici pour que la réparation ne dépende pas
-- de la migration : date de vente connue et de moins de 48 h quand la commande a été lue) : sur les 125 questions
-- écrites entre 00:28 et
-- 02:52 (heure de Paris) le 01/11 pour ces trois comptes, les 123 qui portent sur une vente ancienne (the_closet72 106,
-- vendues du 29/08 au 11/11/2025 ; PILOU 17, du 30/12/2025 au 16/01/2026). Les 2 de nadegemarcelin78 portent sur des
-- ventes du 31/10 (07:36 et 14:06), lues moins de 24 h après : la règle les garde (une copie peut encore être en ligne
-- ailleurs) — elles ne sont pas touchées.
-- Neutraliser = la ligne usage_logs change de feature (« vente_vinted_article_inconnu_ancienne ») et perd son texte de
-- question ; elle garde commande, annonce, vente et prix, plus la trace de ce script. Les ventes, leurs compositions
-- (vinted_commandes_articles) et ventes_operations ne sont pas touchées.
-- Sauvegarde : _backup_0111_questions_article_inconnu (lignes entières). Inverse : …_INVERSE.sql.
-- Lancement : npx supabase db query --linked -f scripts/reparations/20261101_questions_article_inconnu_anciennes.sql

DO $$
BEGIN
  IF to_regclass('public._backup_0111_questions_article_inconnu') IS NOT NULL THEN
    RAISE EXCEPTION 'déjà passé (_backup_0111_questions_article_inconnu existe) : rien n''est écrit';
  END IF;
END
$$;

CREATE TEMP TABLE _q ON COMMIT DROP AS
SELECT u.id, u.user_id, (u.metadata ->> 'vente')::bigint AS vente_id, v.vendu_le, u.created_at,
       (v.vendu_le IS NOT NULL AND v.vendu_le >= u.created_at - interval '48 hours') AS due
  FROM usage_logs u LEFT JOIN ventes v ON v.id = (u.metadata ->> 'vente')::bigint AND v.user_id = u.user_id
 WHERE u.feature = 'vente_vinted_article_inconnu'
   AND u.user_id IN ('8ac5bbda-0947-4612-82fd-effdaa3ca84a',   -- the_closet72
                     'cae7a20d-56c8-46a6-868c-ae1f885faa70',   -- PILOU
                     '8a2eba68-7a2d-4fc1-aab0-aba23189c33b')   -- nadegemarcelin78
   AND u.created_at >= '2026-11-01 00:00:00 Europe/Paris'::timestamptz
   AND u.created_at <  '2026-11-01 03:00:00 Europe/Paris'::timestamptz;

DO $$
DECLARE n_tot int; n_anc int; n_due int; n_sans int;
BEGIN
  SELECT count(*), count(*) FILTER (WHERE NOT due), count(*) FILTER (WHERE due), count(*) FILTER (WHERE vendu_le IS NULL)
    INTO n_tot, n_anc, n_due, n_sans FROM _q;
  IF n_tot <> 125 OR n_anc <> 123 OR n_due <> 2 OR n_sans <> 0 THEN
    RAISE EXCEPTION 'périmètre inattendu : % questions, % anciennes, % récentes, % sans vente datée (attendu 125/123/2/0) : rien n''est écrit',
      n_tot, n_anc, n_due, n_sans;
  END IF;
  IF EXISTS (SELECT 1 FROM _q WHERE NOT due AND user_id = '8a2eba68-7a2d-4fc1-aab0-aba23189c33b') THEN
    RAISE EXCEPTION 'une question du compte 8a2eba68 serait neutralisée : rien n''est écrit';
  END IF;
END
$$;

CREATE TABLE public._backup_0111_questions_article_inconnu AS
SELECT u.* FROM usage_logs u WHERE u.id IN (SELECT id FROM _q WHERE NOT due);
REVOKE ALL ON public._backup_0111_questions_article_inconnu FROM anon, authenticated;
ALTER TABLE public._backup_0111_questions_article_inconnu ENABLE ROW LEVEL SECURITY;

UPDATE usage_logs u
   SET feature = 'vente_vinted_article_inconnu_ancienne',
       metadata = (u.metadata - 'question') || jsonb_build_object('neutralisee', jsonb_build_object(
         'le', now(), 'motif', 'vente ancienne (plus de 48 h quand la commande a été lue) : aucune question',
         'par', 'scripts/reparations/20261101_questions_article_inconnu_anciennes.sql'))
 WHERE u.id IN (SELECT id FROM _q WHERE NOT due) AND u.feature = 'vente_vinted_article_inconnu';

DO $$
DECLARE n int; v int;
BEGIN
  SELECT count(*) INTO n FROM usage_logs WHERE feature = 'vente_vinted_article_inconnu_ancienne'
     AND id IN (SELECT id FROM public._backup_0111_questions_article_inconnu);
  SELECT count(*) INTO v FROM ventes WHERE id IN (SELECT vente_id FROM _q);
  IF n <> 123 OR v <> 125 THEN RAISE EXCEPTION 'contrôle après : % neutralisées, % ventes (attendu 123 / 125)', n, v; END IF;
  RAISE NOTICE 'OK : 123 questions neutralisées, 2 gardées (ventes récentes), 125 ventes intactes';
END
$$;

SELECT u.user_id, u.feature, count(*) FROM usage_logs u
 WHERE u.id IN (SELECT id FROM _q) GROUP BY 1, 2 ORDER BY 1, 2;

-- §réparation
do $apres$
begin
  insert into _r select 'T5 réparation : 123 neutralisées (boutique-8ac5bbda 106, COMPTE-CAE7A20D 17)',
    count(*) = 123 and count(*) filter (where user_id = '8ac5bbda-0947-4612-82fd-effdaa3ca84a') = 106
      and count(*) filter (where user_id = 'cae7a20d-56c8-46a6-868c-ae1f885faa70') = 17
      and bool_and(not metadata ? 'question') and bool_and(metadata ? 'neutralisee'),
    count(*)::text from usage_logs where feature = 'vente_vinted_article_inconnu_ancienne';
  insert into _r select 'T5 réparation : les 2 de boutique-essai-4 gardées', count(*) = 2, count(*)::text
    from usage_logs where feature = 'vente_vinted_article_inconnu' and user_id = '8a2eba68-7a2d-4fc1-aab0-aba23189c33b'
     and created_at >= '2026-11-01 00:00:00 Europe/Paris'::timestamptz;
  insert into _r select 'T5 réparation : ventes des trois comptes identiques à l''octet',
    (select h from _ventes_avant) = md5(string_agg(row(v.*)::text, '|' order by v.id)), count(*)::text
    from ventes v where v.user_id in ('8ac5bbda-0947-4612-82fd-effdaa3ca84a', 'cae7a20d-56c8-46a6-868c-ae1f885faa70', '8a2eba68-7a2d-4fc1-aab0-aba23189c33b');
end
$apres$;
-- §fin réparation
-- INVERSE de scripts/reparations/20261101_questions_article_inconnu_anciennes.sql : les 123 lignes usage_logs reprennent
-- leur feature et leur metadata d'avant (copie entière dans _backup_0111_questions_article_inconnu), puis la sauvegarde
-- est retirée. Aucune autre table touchée.
-- Lancement : npx supabase db query --linked -f scripts/reparations/20261101_questions_article_inconnu_anciennes_INVERSE.sql

DO $$
BEGIN
  IF to_regclass('public._backup_0111_questions_article_inconnu') IS NULL THEN
    RAISE EXCEPTION 'sauvegarde _backup_0111_questions_article_inconnu absente : rien n''est écrit';
  END IF;
  IF (SELECT count(*) FROM public._backup_0111_questions_article_inconnu) <> 123 THEN
    RAISE EXCEPTION 'sauvegarde incomplète : rien n''est écrit';
  END IF;
END
$$;

UPDATE usage_logs u SET feature = b.feature, metadata = b.metadata
  FROM public._backup_0111_questions_article_inconnu b
 WHERE u.id = b.id AND u.feature = 'vente_vinted_article_inconnu_ancienne';

DO $$
BEGIN
  IF (SELECT count(*) FROM usage_logs u JOIN public._backup_0111_questions_article_inconnu b
        ON b.id = u.id AND b.feature = u.feature AND b.metadata = u.metadata) <> 123 THEN
    RAISE EXCEPTION 'inverse incomplet : rien n''est écrit';
  END IF;
END
$$;

DROP TABLE public._backup_0111_questions_article_inconnu;

-- §inverse réparation
do $rinv$
begin
  insert into _r select 'T6 inverse de la réparation : 125 questions revenues, sauvegarde retirée',
    count(*) = 125 and to_regclass('public._backup_0111_questions_article_inconnu') is null, count(*)::text
    from usage_logs where feature = 'vente_vinted_article_inconnu'
     and user_id in ('8ac5bbda-0947-4612-82fd-effdaa3ca84a', 'cae7a20d-56c8-46a6-868c-ae1f885faa70', '8a2eba68-7a2d-4fc1-aab0-aba23189c33b')
     and created_at >= '2026-11-01 00:00:00 Europe/Paris'::timestamptz and created_at < '2026-11-01 03:00:00 Europe/Paris'::timestamptz;
end
$rinv$;
-- §fin inverse réparation
-- INVERSE de 20261101073000 : vente_vinted_lot_eclater telle que relue en production le 01/11 avant la migration
-- (pg_get_functiondef, md5 003835978f4e9578e222bc87f5913560), puis la fonction neuve retirée. Aucune donnée à remettre.

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

drop function if exists public.question_article_inconnu_due(timestamptz, timestamptz);

-- §inverse migration
do $inverse$
begin
  insert into _r values ('I1 inverse rejoué : vente_vinted_lot_eclater revenue à la prod (md5 00383597…), règle retirée',
    md5(pg_get_functiondef('public.vente_vinted_lot_eclater(uuid,text,text)'::regprocedure)) = '003835978f4e9578e222bc87f5913560'
      and to_regprocedure('public.question_article_inconnu_due(timestamptz,timestamptz)') is null, null);
end
$inverse$;
select essai, ok, detail from (
  select essai, ok, detail from _r
  union all select 'Σ verts', bool_and(ok), (count(*) filter (where ok))::text || '/' || count(*)::text from _r) s
 order by essai;
rollback;
