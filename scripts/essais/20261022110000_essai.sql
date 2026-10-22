-- Essai à blanc de 20261022110000_leboncoin_achat_en_cours_vente (22/10) : ROLLBACK, rien n'est gardé.
-- Généré par : node scripts/essais/20261022110000_essai_generer.mjs  →  scripts/essais/20261022110000_essai.sql
-- npx supabase db query --linked -f scripts/essais/20261022110000_essai.sql
-- A : structure et droits. B : parcours complet sur une vraie fiche de Sébastien (en stock, copie Leboncoin + copie
-- Vinted) : relevé « pending » → preuve → vente enregistrée par le cron des ventes prouvées → retrait Vinted armé,
-- annonce Leboncoin jamais retirée ; puis achat annulé → vente retirée, fiche au stock, retrait arrêté, job rouvert.
-- C : les gardes (déjà déclarée, plusieurs exemplaires, relecture sans changement, « sold » → rien, valeur inconnue).
-- D : rejeu sur le parc (30 jours) — chaque annonce lue « pending » / « sold » repassée en fantôme : ce que la règle
-- aurait fait, et AUCUNE écriture sur un job ; coût mesuré d'un relevé de 381 annonces.
begin;
set local statement_timeout = '170s';
create temp table _r (essai text, ok boolean, detail text);
grant all on _r to public;


ALTER TABLE public.annonces_plateforme
  ADD COLUMN IF NOT EXISTS transaction_plateforme text,
  ADD COLUMN IF NOT EXISTS transaction_lue_le timestamptz;
COMMENT ON COLUMN public.annonces_plateforme.transaction_plateforme IS
  '(22/10) Leboncoin : transaction_status lu par le relevé (pending = achat en cours, sold = vendu, aucune). Écrit par l''extension ≥ 0.6.129.';
-- Mêmes droits que les autres colonnes écrites par le relevé (authenticated seulement, jamais anon).
GRANT SELECT (transaction_plateforme, transaction_lue_le), INSERT (transaction_plateforme, transaction_lue_le),
      UPDATE (transaction_plateforme, transaction_lue_le) ON public.annonces_plateforme TO authenticated;

INSERT INTO public.coin_config (key, value) VALUES ('ventes_leboncoin_transaction', 1) ON CONFLICT (key) DO NOTHING;

-- La transaction lue d'une annonce : la colonne d'abord, sinon la capture ; NULL = rien de lu.
CREATE OR REPLACE FUNCTION public.leboncoin_transaction_lue(p_colonne text, p_capture jsonb)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT CASE
    WHEN nullif(btrim(p_colonne), '') IS NOT NULL THEN left(lower(btrim(p_colonne)), 40)
    WHEN jsonb_typeof(p_capture -> 'attributs_bruts') = 'array' THEN coalesce(
      (SELECT left(lower(btrim(e ->> 'value')), 40) FROM jsonb_array_elements(p_capture -> 'attributs_bruts') e
        WHERE e ->> 'key' = 'transaction_status' AND nullif(btrim(e ->> 'value'), '') IS NOT NULL LIMIT 1),
      'aucune')
    ELSE NULL END;
$function$;

-- L'achat annulé : la vente née de la preuve Leboncoin est retirée, la fiche revient, les copies reviennent.
CREATE OR REPLACE FUNCTION public.vente_transaction_annulee_leboncoin(p_vente bigint, p_motif text DEFAULT 'transaction_annulee')
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v ventes%ROWTYPE; i inventaire%ROWTYPE; j cross_post_jobs%ROWTYPE;
  v_rendue text := NULL; v_recus jsonb := NULL; v_q integer;
  v_copie record; v_copies integer := 0; v_arretes integer := 0; v_en_cours integer := 0;
BEGIN
  SELECT * INTO v FROM ventes WHERE id = p_vente;
  IF NOT FOUND THEN RETURN jsonb_build_object('action', 'introuvable'); END IF;
  IF v.plateforme_code IS DISTINCT FROM 'leboncoin' OR v.annonce_id IS NULL THEN RETURN jsonb_build_object('action', 'hors_sujet'); END IF;
  -- Mêmes interrupteur et liste d'attente que les commandes annulées (09/10, 17/10).
  IF coalesce((SELECT value FROM coin_config WHERE key = 'ventes_annulees_retrait_pause'), 0) = 1 THEN
    RETURN jsonb_build_object('action', 'en_pause');
  END IF;
  IF EXISTS (SELECT 1 FROM ventes_annulees_attente_go g WHERE g.vente_id = v.id AND g.decision IS NULL) THEN
    RETURN jsonb_build_object('action', 'en_attente_go');
  END IF;
  -- La preuve : l'annonce FillSell close « vendue » sur CE numéro PAR la transaction Leboncoin.
  SELECT * INTO j FROM cross_post_jobs c
   WHERE c.user_id = v.user_id AND c.platform = 'leboncoin' AND c.status = 'sold'
     AND c.action IN ('publish', 'republish') AND btrim(coalesce(c.platform_listing_id, '')) = v.annonce_id
     AND c.platform_fields #>> '{sale_evidence,source}' = 'transaction_leboncoin'
   ORDER BY c.sold_at DESC NULLS LAST LIMIT 1;
  -- Une vente SAISIE (ou née d'un autre chemin) n'est jamais retirée : signalée une fois.
  IF j.id IS NULL OR NOT EXISTS (SELECT 1 FROM ventes_operations o WHERE o.user_id = v.user_id
                                   AND o.cle = 'annonce:leboncoin:' || v.annonce_id AND o.resultat -> 'ventes_ids' @> to_jsonb(ARRAY[v.id])) THEN
    IF NOT EXISTS (SELECT 1 FROM usage_logs u WHERE u.user_id = v.user_id AND u.feature = 'vente_leboncoin_transaction'
                    AND u.metadata ->> 'vente' = v.id::text AND u.metadata ->> 'issue' = 'annulation_vente_saisie_signalee') THEN
      INSERT INTO usage_logs (user_id, feature, metadata) VALUES (v.user_id, 'vente_leboncoin_transaction',
        jsonb_build_object('vente', v.id::text, 'annonce', v.annonce_id, 'titre', v.titre, 'prix_vente', v.prix_vente,
          'issue', 'annulation_vente_saisie_signalee'));
    END IF;
    RETURN jsonb_build_object('action', 'signalee');
  END IF;
  IF v.inventaire_id IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(v.user_id::text || ':' || v.inventaire_id::text, 0));
  END IF;
  INSERT INTO ventes_supprimees (user_id, plateforme_code, commande_ref, annonce_id, titre, prix_vente, vendu_le, vente_id, supprimee_le, source, motif)
  VALUES (v.user_id, 'leboncoin', v.commande_ref, v.annonce_id, v.titre, v.prix_vente, v.vendu_le, v.id, now(),
          'releve_leboncoin', left(coalesce(p_motif, 'transaction_annulee'), 60));
  SELECT jsonb_agg(to_jsonb(o)) INTO v_recus FROM ventes_operations o
   WHERE o.user_id = v.user_id AND o.cle = 'annonce:leboncoin:' || v.annonce_id;
  INSERT INTO usage_logs (user_id, feature, metadata) VALUES (v.user_id, 'vente_retiree',
    jsonb_build_object('vente', to_jsonb(v), 'source', 'releve_leboncoin', 'motif', coalesce(p_motif, 'transaction_annulee'), 'recus', v_recus));
  DELETE FROM ventes WHERE id = v.id;
  DELETE FROM ventes_operations o WHERE o.user_id = v.user_id AND o.cle = 'annonce:leboncoin:' || v.annonce_id;

  v_q := greatest(coalesce(v.quantite, 1), 1);
  IF v.inventaire_id IS NOT NULL THEN
    SELECT * INTO i FROM inventaire WHERE id = v.inventaire_id AND user_id = v.user_id FOR UPDATE;
    IF i.id IS NOT NULL AND i.fusionne_dans IS NULL AND i.statut = 'vendu'
       AND NOT EXISTS (SELECT 1 FROM ventes x WHERE x.user_id = v.user_id AND x.inventaire_id = i.id) THEN
      UPDATE remises_en_vente SET statut = 'abandonnee', motif = 'transaction_annulee', traite_le = now()
       WHERE user_id = v.user_id AND inventaire_id = i.id AND statut = 'a_faire';
      UPDATE inventaire SET statut = 'stock', quantite = v_q WHERE id = i.id AND statut = 'vendu';
      v_rendue := 'fiche';
      -- Les retraits armés par CETTE vente (même instant, ± 2 min) :
      --   · encore en file (pending / needs_user) → arrêtés : l'annonce est restée en ligne, rien à remettre ;
      --   · déjà faits (deleted), dépôt clos → remise en vente par la file remises_en_vente (ses gardes) ;
      --   · en cours chez l'extension (processing) → comptés, la remise suivra au prochain achat annulé lu.
      FOR v_copie IN
        SELECT d.id AS retrait, d.status, d.platform, p.id AS depot, p.status AS depot_statut
          FROM cross_post_jobs d
          LEFT JOIN cross_post_jobs p ON p.id = nullif(d.platform_fields #>> '{arme_par,depot}', '')::uuid
         WHERE d.user_id = v.user_id AND d.inventaire_id = i.id AND d.action = 'delete'
           AND d.platform <> 'leboncoin'
           AND d.platform_fields #>> '{arme_par,chemin}' IN ('vente_article_serveur', 'vente_copie_prouvee')
           AND abs(extract(epoch FROM (nullif(d.platform_fields #>> '{arme_par,le}', '')::timestamptz - v.created_at))) <= 120
         ORDER BY d.platform
      LOOP
        IF v_copie.status IN ('pending', 'needs_user') THEN
          UPDATE cross_post_jobs SET status = 'cancelled',
                 error = 'Achat Leboncoin annulé : l''article est revenu dans ton stock, cette annonce reste en ligne.',
                 platform_fields = coalesce(platform_fields, '{}'::jsonb)
                   || jsonb_build_object('vente_annulee', jsonb_build_object('le', now(), 'vente', v.id, 'source', 'transaction_leboncoin'))
           WHERE id = v_copie.retrait AND status IN ('pending', 'needs_user');
          IF FOUND THEN v_arretes := v_arretes + 1; END IF;
        ELSIF v_copie.status = 'deleted' AND v_copie.depot IS NOT NULL AND v_copie.depot_statut = 'cancelled' THEN
          UPDATE cross_post_jobs SET platform_fields = coalesce(platform_fields, '{}'::jsonb)
                 || jsonb_build_object('vente_annulee_remise', jsonb_build_object('vente', v.id, 'source', 'transaction_leboncoin', 'le', now()))
           WHERE id = v_copie.depot;
          INSERT INTO remises_en_vente (user_id, inventaire_id, platform, job_vendu, prochain_essai)
          VALUES (v.user_id, i.id, v_copie.platform, v_copie.depot, now() + interval '2 minutes')
          ON CONFLICT (job_vendu) DO UPDATE
            SET statut = 'a_faire', motif = NULL, prochain_essai = now() + interval '2 minutes', traite_le = NULL
            WHERE remises_en_vente.statut <> 'faite';
          v_copies := v_copies + 1;
        ELSIF v_copie.status = 'processing' THEN
          v_en_cours := v_en_cours + 1;
        END IF;
      END LOOP;
      INSERT INTO inventaire_journal (user_id, inventaire_id, champ, avant, apres, source, motif, detail) VALUES
        (v.user_id, i.id, 'statut', i.statut, 'stock', 'releve_leboncoin', 'transaction_annulee',
         jsonb_build_object('vente', v.id, 'annonce', v.annonce_id, 'retraits_arretes', v_arretes, 'copies_remises', v_copies,
                            'retraits_en_cours', v_en_cours));
    END IF;
  END IF;
  -- L'annonce Leboncoin a été relue EN LIGNE sans transaction : son job redevient « publié ».
  UPDATE cross_post_jobs SET status = 'published', sold_at = NULL,
         platform_fields = (coalesce(platform_fields, '{}'::jsonb)
           - ARRAY['sale_signal', 'unavailable_since', 'unavailable_pending_since', 'detected_price', 'vente_operation_cle'])
           || jsonb_build_object('vente_annulee', jsonb_build_object('le', now(), 'vente', v.id, 'annonce', 'en_ligne',
                                 'source', 'transaction_leboncoin', 'preuve', platform_fields -> 'sale_evidence'))
   WHERE id = j.id AND status = 'sold';
  RETURN jsonb_build_object('action', 'retiree', 'fiche', v_rendue, 'job', j.id, 'retraits_arretes', v_arretes,
                            'copies_remises', v_copies, 'retraits_en_cours', v_en_cours);
END;
$function$;
REVOKE ALL ON FUNCTION public.vente_transaction_annulee_leboncoin(bigint, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.vente_transaction_annulee_leboncoin(bigint, text) TO service_role;

-- La règle, pour UNE annonce dont la transaction lue vient de changer.
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
REVOKE ALL ON FUNCTION public.leboncoin_transaction_noter(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.leboncoin_transaction_noter(uuid, text, text) TO service_role;

-- La note de vente (mail, notification) : une transaction TERMINÉE (« Vendu ») lue par le relevé date d'avant la
-- lecture — jamais une vente du moment, aucune note ; « Achat en cours » suit la règle commune du 06/10.
-- push_trg_job repris de pg_get_functiondef (prod, 22/10) + une insertion ancrée.
-- push_trg_job : prod aee346d713b7032b28a3113ed68ee026 → 8245ab39c6bd0ceab6c78b6c21a33cca
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

-- Le déclencheur : chaque écriture d'une annonce Leboncoin (relevé, capture) ; seule une TRANSITION agit.
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
REVOKE ALL ON FUNCTION public.annonces_plateforme_transaction_leboncoin() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS annonces_plateforme_transaction_leboncoin ON public.annonces_plateforme;
CREATE TRIGGER annonces_plateforme_transaction_leboncoin
  AFTER INSERT OR UPDATE OF transaction_plateforme, capture ON public.annonces_plateforme
  FOR EACH ROW WHEN (NEW.platform = 'leboncoin')
  EXECUTE FUNCTION public.annonces_plateforme_transaction_leboncoin();



-- ═══ A. Structure et droits ═════════════════════════════════════════════════
insert into _r select 'A1 colonnes transaction_plateforme / transaction_lue_le', count(*) = 2, count(*) || ' / 2'
  from information_schema.columns where table_schema = 'public' and table_name = 'annonces_plateforme'
   and column_name in ('transaction_plateforme', 'transaction_lue_le');
-- (Le droit de table d'anon sur annonces_plateforme est antérieur : la RLS ne lui donne AUCUNE ligne — seule la
-- politique annonces_plateforme_propres, pour authenticated, sur user_id = auth.uid().)
insert into _r select 'A2 authenticated lit et écrit les colonnes ; RLS active, anon sans politique (aucune ligne)',
  has_column_privilege('authenticated', 'public.annonces_plateforme', 'transaction_plateforme', 'UPDATE')
  and has_column_privilege('authenticated', 'public.annonces_plateforme', 'transaction_plateforme', 'SELECT')
  and (select relrowsecurity from pg_class where oid = 'public.annonces_plateforme'::regclass)
  and not exists (select 1 from pg_policy p where p.polrelid = 'public.annonces_plateforme'::regclass
                   and (p.polroles @> array['anon'::regrole::oid] or p.polroles @> array[0::oid])), '';
insert into _r select 'A3 fonctions fermées à anon / authenticated',
  not has_function_privilege('authenticated', 'public.leboncoin_transaction_noter(uuid, text, text)', 'execute')
  and not has_function_privilege('anon', 'public.leboncoin_transaction_noter(uuid, text, text)', 'execute')
  and not has_function_privilege('authenticated', 'public.vente_transaction_annulee_leboncoin(bigint, text)', 'execute'), '';
insert into _r select 'A4 lecture : colonne > capture ; capture sans attribut = aucune ; rien de lu = NULL',
  leboncoin_transaction_lue('pending', null) = 'pending'
  and leboncoin_transaction_lue(null, '{"attributs_bruts":[{"key":"transaction_status","value":"pending"}]}') = 'pending'
  and leboncoin_transaction_lue(null, '{"attributs_bruts":[{"key":"condition","value":"bon"}]}') = 'aucune'
  and leboncoin_transaction_lue(null, '{"photos":[]}') is null and leboncoin_transaction_lue(null, null) is null
  and leboncoin_transaction_lue(' SOLD ', '{"attributs_bruts":[]}') = 'sold', '';
insert into _r select 'A5 interrupteur posé à 1 (règle active)', (select value from coin_config where key = 'ventes_leboncoin_transaction') = 1, '';

-- ═══ B. Parcours complet, vraie fiche de Sébastien ══════════════════════════
create temp table _b as
select i.user_id u, i.id inv, j.id job_lbc, btrim(j.platform_listing_id) lid, a.id annonce, v.id job_vinted
  from inventaire i
  join cross_post_jobs j on j.inventaire_id = i.id and j.platform = 'leboncoin' and j.status = 'published'
   and j.action in ('publish', 'republish') and nullif(btrim(j.platform_listing_id), '') is not null
  join annonces_plateforme a on a.user_id = i.user_id and a.platform = 'leboncoin' and a.listing_id = btrim(j.platform_listing_id)
   and a.statut_plateforme = 'en_ligne' and a.disparu_le is null
  join cross_post_jobs v on v.inventaire_id = i.id and v.platform = 'vinted' and v.status = 'published' and v.action in ('publish', 'republish')
 where i.statut = 'stock' and coalesce(i.quantite, 1) = 1 and i.fusionne_dans is null and i.user_id = '48dd94f7-3105-49a7-af54-24d9c479a980'
   and coalesce(j.platform_fields ->> 'sale_signal', '') = '' and retrait_job_prouve(j.id) and retrait_job_prouve(v.id)
   and fiche_annonces_vivantes(i.id, 'leboncoin') < 2 and fiche_annonces_vivantes(i.id, 'vinted') < 2
   and leboncoin_transaction_lue(a.transaction_plateforme, a.capture) is distinct from 'pending'
 limit 1;
insert into _r select 'B0 fiche réelle trouvée (Sébastien, en stock, Leboncoin + Vinted)', count(*) = 1, coalesce(max(inv::text), '-') from _b;
-- B1 Le relevé lit « pending » (extension ≥ 0.6.129 : la colonne).
update annonces_plateforme set transaction_plateforme = 'pending', transaction_lue_le = now() where id = (select annonce from _b);
insert into _r select 'B1 relevé « pending » → preuve exacte sur LE job Leboncoin',
  j.platform_fields ->> 'sale_signal' = 'sold' and j.platform_fields #>> '{sale_evidence,source}' = 'transaction_leboncoin'
  and j.platform_fields #>> '{sale_evidence,exact}' = 'true' and j.platform_fields #>> '{sale_evidence,listing_id}' = b.lid
  and not (j.platform_fields ? 'unavailable_since'),
  coalesce(j.platform_fields ->> 'sale_evidence', '-') from _b b join cross_post_jobs j on j.id = b.job_lbc;
insert into _r select 'B2 la règle laisse sa trace (usage_logs vente_leboncoin_transaction, issue prouvee)',
  count(*) = 1, string_agg(metadata ->> 'issue', ',') from usage_logs where feature = 'vente_leboncoin_transaction'
   and created_at = now() and metadata ->> 'annonce' = (select annonce::text from _b);
-- B3 Le cron des ventes prouvées voit la preuve et enregistre la vente (même fonction que ventes_prouvees_tick).
insert into _r select 'B3 ventes_prouvees_a_enregistrer voit la preuve', count(*) = 1, coalesce(max(preuve), '-')
  from ventes_prouvees_a_enregistrer('-infinity'::timestamptz, 5, (select u from _b), (select job_lbc from _b), true);
create temp table _b4 as select public.enregistrer_vente_prouvee((select job_lbc from _b)) r;
insert into _r select 'B4 vente enregistrée « Leboncoin »', (r ->> 'ok')::boolean and (r ->> 'issue') = 'enregistree', left(r::text, 200) from _b4;
insert into _r select 'B5 la vente porte la plateforme leboncoin et le numéro de l''annonce',
  count(*) = 1, string_agg(v.plateforme_code || ' ' || coalesce(v.annonce_id, '-'), ',')
  from ventes v where v.user_id = (select u from _b) and v.inventaire_id = (select inv from _b) and v.created_at = now();
insert into _r select 'B6 fiche vendue, job Leboncoin « sold », AUCUN retrait Leboncoin',
  (select statut from inventaire where id = b.inv) = 'vendu' and (select status from cross_post_jobs where id = b.job_lbc) = 'sold'
  and not exists (select 1 from cross_post_jobs d where d.inventaire_id = b.inv and d.action = 'delete' and d.platform = 'leboncoin'), '' from _b b;
insert into _r select 'B7 retrait Vinted armé tout de suite (vente_article_serveur)', count(*) = 1,
  string_agg(d.status || ' ' || coalesce(d.platform_fields #>> '{arme_par,chemin}', '-'), ',')
  from cross_post_jobs d where d.inventaire_id = (select inv from _b) and d.action = 'delete' and d.platform = 'vinted' and d.created_at = now();
-- B8 Jamais deux ventes : la règle rejouée, la vente rejouée, le cron rejoué.
do $$ declare r jsonb; n int; begin
  update annonces_plateforme set transaction_plateforme = 'sold', transaction_lue_le = now() where id = (select annonce from _b);
  r := public.enregistrer_vente_prouvee((select job_lbc from _b));
  select count(*) into n from ventes v where v.user_id = (select u from _b) and v.inventaire_id = (select inv from _b);
  insert into _r values ('B8 « pending » → « sold », vente rejouée : toujours UNE vente', n = 1 and coalesce(r ->> 'issue', '') <> 'enregistree', n || ' vente(s), ' || coalesce(r ->> 'issue', '-'));
  update annonces_plateforme set transaction_plateforme = 'pending', transaction_lue_le = now() where id = (select annonce from _b);
end $$;
-- B9 L'achat est annulé : l'annonce relue EN LIGNE sans transaction après « pending ».
update annonces_plateforme set transaction_plateforme = 'aucune', transaction_lue_le = now() where id = (select annonce from _b);
insert into _r select 'B9 achat annulé : vente retirée, fiche au stock', not exists (select 1 from ventes v where v.inventaire_id = b.inv)
  and (select statut from inventaire where id = b.inv) = 'stock', '' from _b b;
insert into _r select 'B10 achat annulé : le retrait Vinted encore en file est arrêté (annonce restée en ligne)', bool_and(d.status = 'cancelled'),
  string_agg(d.status, ',') from cross_post_jobs d where d.inventaire_id = (select inv from _b) and d.action = 'delete' and d.platform = 'vinted' and d.created_at = now();
insert into _r select 'B11 achat annulé : job Leboncoin rouvert (published), preuve et reçu levés',
  j.status = 'published' and not (j.platform_fields ? 'sale_signal') and j.platform_fields ? 'vente_annulee'
  and not exists (select 1 from ventes_operations o where o.user_id = b.u and o.cle = 'annonce:leboncoin:' || b.lid), j.status
  from _b b join cross_post_jobs j on j.id = b.job_lbc;
insert into _r select 'B12 achat annulé : trace (ventes_supprimees + vente_retiree)', count(*) = 1, count(*) || ''
  from ventes_supprimees s where s.user_id = (select u from _b) and s.annonce_id = (select lid from _b) and s.supprimee_le = now();
-- B13 Un nouvel achat de la même annonce s'enregistre de nouveau (le reçu est tombé avec la vente).
update annonces_plateforme set transaction_plateforme = 'pending', transaction_lue_le = now() where id = (select annonce from _b);
create temp table _b13 as select public.enregistrer_vente_prouvee((select job_lbc from _b)) r;
insert into _r select 'B13 nouvel achat de la même annonce : vente de nouveau enregistrée', (r ->> 'issue') = 'enregistree', left(r::text, 120) from _b13;

-- ═══ C. Les gardes ══════════════════════════════════════════════════════════
-- C1 Vente DÉJÀ déclarée par la personne (fiche vendue) : rien. C2 l'annulation ne retire JAMAIS une saisie.
do $$ declare c record; n_av int; n_ap int; r jsonb; v bigint; begin
  select i.id inv, j.id job, btrim(j.platform_listing_id) lid, a.id annonce, i.user_id u into c
    from inventaire i
    join cross_post_jobs j on j.inventaire_id = i.id and j.platform = 'leboncoin' and j.status = 'published' and j.action in ('publish', 'republish')
    join annonces_plateforme a on a.user_id = i.user_id and a.platform = 'leboncoin' and a.listing_id = btrim(j.platform_listing_id) and a.statut_plateforme = 'en_ligne'
   where i.statut = 'stock' and coalesce(i.quantite, 1) = 1 and i.user_id = '48dd94f7-3105-49a7-af54-24d9c479a980'
     and i.id <> (select inv from _b) and coalesce(j.platform_fields ->> 'sale_signal', '') = ''
     and leboncoin_transaction_lue(a.transaction_plateforme, a.capture) is distinct from 'pending' limit 1;
  -- La personne déclare la vente (même chemin que l'app : enregistrer_vente_atomique sur la fiche, clé « manuel: »).
  perform set_config('request.jwt.claims', json_build_object('sub', c.u::text, 'role', 'authenticated')::text, true);
  r := public.enregistrer_vente_atomique(c.u, 'essai-2210', c.inv, null, 7, 0, 1, 1, 'Leboncoin');
  perform set_config('request.jwt.claims', '', true);
  select count(*) into n_av from ventes where inventaire_id = c.inv;
  update annonces_plateforme set transaction_plateforme = 'pending', transaction_lue_le = now() where id = c.annonce;
  select count(*) into n_ap from ventes where inventaire_id = c.inv;
  insert into _r values ('C1 déjà déclarée à la main : aucune preuve posée, jamais deux ventes',
    n_av = 1 and n_ap = 1 and not exists (select 1 from cross_post_jobs where id = c.job and platform_fields ->> 'sale_signal' = 'sold'),
    'ventes ' || n_av || '→' || n_ap || ' ; issue ' || coalesce((select metadata ->> 'issue' from usage_logs where feature = 'vente_leboncoin_transaction' and metadata ->> 'annonce' = c.annonce::text and created_at = now() order by id desc limit 1), '-'));
  update annonces_plateforme set transaction_plateforme = 'aucune', transaction_lue_le = now() where id = c.annonce;
  select count(*) into n_ap from ventes where inventaire_id = c.inv;
  insert into _r values ('C2 achat annulé sur une vente SAISIE : la vente reste', n_ap = 1, n_ap || ' vente(s)');
end $$;
-- C3 Relecture sans changement : aucune trace de plus (seule une transition agit).
do $$ declare n0 int; n1 int; begin
  select count(*) into n0 from usage_logs where feature = 'vente_leboncoin_transaction' and created_at = now();
  update annonces_plateforme set transaction_plateforme = transaction_plateforme, vu_le = now()
   where user_id = '48dd94f7-3105-49a7-af54-24d9c479a980' and platform = 'leboncoin';
  update annonces_plateforme set capture = capture where user_id = '48dd94f7-3105-49a7-af54-24d9c479a980' and platform = 'leboncoin' and capture is not null;
  select count(*) into n1 from usage_logs where feature = 'vente_leboncoin_transaction' and created_at = now();
  insert into _r values ('C3 relevé qui relit la même transaction : rien', n0 = n1, n0 || ' → ' || n1);
end $$;
-- C4 « sold » → sans transaction : rien n'est conclu ; C5 valeur inconnue : aucune vente.
do $$ declare r jsonb; a uuid; begin
  select id into a from annonces_plateforme where user_id = '48dd94f7-3105-49a7-af54-24d9c479a980' and platform = 'leboncoin' and statut_plateforme = 'en_ligne'
     and id <> (select annonce from _b) limit 1;
  r := public.leboncoin_transaction_noter(a, 'aucune', 'sold');
  insert into _r values ('C4 « sold » → sans transaction : sans effet', r ->> 'issue' = 'sans_effet', r::text);
  r := public.leboncoin_transaction_noter(a, 'reserved', 'aucune');
  insert into _r values ('C5 valeur inconnue : aucune vente, une trace', r ->> 'issue' = 'valeur_inconnue', r::text);
end $$;
-- C6 Plusieurs exemplaires (pro) : rien ; C7 Vinted, eBay, Beebs, Depop : le déclencheur ne les voit jamais.
do $$ declare c record; r jsonb; begin
  select a.id annonce, i.id inv into c from annonces_plateforme a
    join cross_post_jobs j on j.user_id = a.user_id and j.platform = 'leboncoin' and j.status = 'published' and btrim(j.platform_listing_id) = a.listing_id
    join inventaire i on i.id = j.inventaire_id and i.statut = 'stock'
   where a.platform = 'leboncoin' and a.statut_plateforme = 'en_ligne' and coalesce(i.quantite, 1) > 1 limit 1;
  if c.annonce is not null then
    r := public.leboncoin_transaction_noter(c.annonce, 'pending', 'aucune');
    insert into _r values ('C6 plusieurs exemplaires : aucune preuve', r ->> 'issue' = 'plusieurs_exemplaires', r::text);
  else
    insert into _r values ('C6 plusieurs exemplaires : aucune preuve', true, 'aucun cas au parc (contrôle sans objet)');
  end if;
end $$;
insert into _r select 'C7 le déclencheur ne vise que Leboncoin', pg_get_triggerdef(t.oid) like '%WHEN ((new.platform = ''leboncoin''::text))%', ''
  from pg_trigger t where t.tgname = 'annonces_plateforme_transaction_leboncoin';

-- C8 La note de vente : « Achat en cours » suit la règle commune (note née), « Vendu » (transaction terminée) n'en
-- crée aucune — jamais un mail pour une vente d'avant la lecture.
do $$ declare c record; n_p int; n_s int; begin
  for c in select i.id inv, j.id job, a.id annonce, row_number() over () k
             from inventaire i
             join cross_post_jobs j on j.inventaire_id = i.id and j.platform = 'leboncoin' and j.status = 'published' and j.action in ('publish', 'republish')
             join annonces_plateforme a on a.user_id = i.user_id and a.platform = 'leboncoin' and a.listing_id = btrim(j.platform_listing_id) and a.statut_plateforme = 'en_ligne'
            where i.statut = 'stock' and coalesce(i.quantite, 1) = 1 and i.user_id = '48dd94f7-3105-49a7-af54-24d9c479a980'
              and i.id <> (select inv from _b) and coalesce(j.platform_fields ->> 'sale_signal', '') = ''
              and retrait_job_prouve(j.id) and fiche_annonces_vivantes(i.id, 'leboncoin') < 2
              and leboncoin_transaction_lue(a.transaction_plateforme, a.capture) is distinct from 'pending'
            limit 2 loop
    update cross_post_jobs set last_checked_at = now() - interval '1 hour' where id = c.job;   -- veille récente
    perform public.leboncoin_transaction_noter(c.annonce, case when c.k = 1 then 'pending' else 'sold' end, 'aucune');
    if c.k = 1 then select count(*) into n_p from push_ventes where job_id = c.job;
    else select count(*) into n_s from push_ventes where job_id = c.job; end if;
  end loop;
  insert into _r values ('C8 note de vente : « Achat en cours » oui, « Vendu » (terminée) non', n_p = 1 and n_s = 0, 'pending ' || n_p || ' note(s), sold ' || n_s);
end $$;

-- ═══ D. Rejeu sur le parc (30 jours), en FANTÔME : ce que la règle aurait fait, aucune écriture ═══════════════
update coin_config set value = 0 where key = 'ventes_leboncoin_transaction';
create temp table _d_avant as select id, platform_fields from cross_post_jobs where platform = 'leboncoin' and status = 'published';
create temp table _d (annonce uuid, tx text, issue text);
do $$ declare a record; r jsonb; begin
  for a in select x.id, leboncoin_transaction_lue(x.transaction_plateforme, x.capture) tx from annonces_plateforme x
            where x.platform = 'leboncoin' and coalesce(x.capture_le, x.vu_le) > now() - interval '30 days'
              and leboncoin_transaction_lue(x.transaction_plateforme, x.capture) in ('pending', 'sold') loop
    r := public.leboncoin_transaction_noter(a.id, a.tx, 'aucune');
    insert into _d values (a.id, a.tx, r ->> 'issue');
  end loop;
end $$;
insert into _r select 'D1 parc 30 j : annonces lues « pending » / « sold » rejouées', count(*) > 0,
  count(*) || ' : ' || coalesce((select string_agg(tx || ' ' || issue || ' ' || n, ' | ' order by tx, n desc) from (select tx, issue, count(*) n from _d group by 1, 2) z), '')
  from _d;
insert into _r select 'D2 fantôme : AUCUN job Leboncoin modifié', count(*) = 0, count(*) || ' écart(s)'
  from cross_post_jobs j join _d_avant d on d.id = j.id where j.platform_fields is distinct from d.platform_fields;
-- D3 Coût : un relevé de 381 annonces (Sébastien) qui réécrit la transaction et la capture, inchangées.
do $$ declare t0 timestamptz := clock_timestamp(); n int; begin
  update annonces_plateforme set transaction_plateforme = coalesce(transaction_plateforme, 'aucune'), vu_le = now()
   where user_id = '48dd94f7-3105-49a7-af54-24d9c479a980' and platform = 'leboncoin';
  get diagnostics n = row_count;
  insert into _r values ('D3 coût : relevé complet réécrit (381 annonces) sous 1 s', clock_timestamp() - t0 < interval '1 second',
    n || ' annonces en ' || round(extract(epoch from clock_timestamp() - t0) * 1000) || ' ms');
end $$;

select essai, ok, left(detail, 500) detail from _r order by essai;
rollback;
