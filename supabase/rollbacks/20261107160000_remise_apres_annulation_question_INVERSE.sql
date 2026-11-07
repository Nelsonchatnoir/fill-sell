-- INVERSE de 20261107160000_remise_apres_annulation_question : retour à l'état d'après 20261107150000.
-- rapprochement_v3_remise_possible (md5 aee9bcf5f16349c99b5349b60cddffcd) et inventaire_fusionner_pour (md5 92db4aba57e4960365206c4758ffb12b) :
-- définitions de PROD lues le 07/11 (pg_get_functiondef, sans retour chariot), mot pour mot ; remises_en_vente_tick
-- (md5 f457e0714933c5b52d57d4dae3ce3d57) : la définition que pose 20261107150000, mot pour mot ; puis les quatre fonctions nouvelles
-- retirées (relu par scripts/preuve-remise-apres-annulation-question.mjs).
-- Données : les questions « remise_en_ligne_vente_annulee » encore OUVERTES (jamais répondues) sont retirées — elles
-- n'existaient pas avant la règle. Une réponse de la personne (« Oui » : la fusion, réversible par inventaire_defusionner ;
-- « Non ») reste : c'est sa décision.

CREATE OR REPLACE FUNCTION public.remises_en_vente_tick(p_limite integer DEFAULT 20, p_user uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
 SET statement_timeout TO '20s'
AS $function$
DECLARE
  v_cpu numeric;
  r record; j cross_post_jobs%ROWTYPE; i inventaire%ROWTYPE;
  v_op jsonb; v_place jsonb; v_motif text; v_report timestamptz; v_nouveau uuid;
  v_vu timestamptz; v_api boolean; v_sortie bigint; v_prix integer;
  v_faites integer := 0; v_abandons integer := 0; v_reports integer := 0;
  v_annul boolean; v_restant integer;   -- (18/10) copie retirée à cause d'une vente annulée
  v_trans text; v_conv text; v_rep jsonb;   -- (25/10) « Republier » de Vinted : commande, conversation
  v_f record; v_jum jsonb; v_hors_stock integer := 0; v_jumelles integer := 0;   -- (07/11) ventes annulées : fermetures
BEGIN
  SELECT pct INTO v_cpu FROM veille_cpu WHERE pct IS NOT NULL ORDER BY le DESC LIMIT 1;
  IF v_cpu IS NOT NULL AND v_cpu > 50 THEN
    RETURN jsonb_build_object('issue', 'saute_cpu', 'cpu', v_cpu);
  END IF;
  SELECT value INTO v_sortie FROM coin_config WHERE key = 'opla_sortie_le';
  SELECT value INTO v_prix FROM coin_config WHERE key = 'price_per_platform';

  -- (07/11, Ornella) AVANT l'appui : une remise proposée après une vente annulée dont la FICHE n'est plus en stock (vendue,
  -- quantité 0, fondue dans une autre fiche, ou effacée) se ferme « plus_en_stock » — rien à remettre en vente, la carte
  -- ne la montre plus (ventes_annulees_a_remettre). Lignes « proposée » seules (index remises_en_vente_proposees).
  UPDATE remises_en_vente rv SET statut = 'abandonnee', motif = 'plus_en_stock', traite_le = now()
    FROM cross_post_jobs jv
   WHERE rv.statut = 'proposee' AND (p_user IS NULL OR rv.user_id = p_user)
     AND jv.id = rv.job_vendu AND COALESCE(jv.platform_fields, '{}'::jsonb) ? 'vente_annulee_remise'
     AND NOT EXISTS (SELECT 1 FROM inventaire ix
                      WHERE ix.id = rv.inventaire_id AND ix.user_id = rv.user_id AND ix.fusionne_dans IS NULL
                        AND ix.statut = 'stock' AND COALESCE(ix.quantite, 1) > 0);
  GET DIAGNOSTICS v_hors_stock = ROW_COUNT;

  -- (24/10 nuit, Nico) AVANT l'appui : un article remis en ligne DIRECTEMENT sur la plateforme — par le vendeur ou par la
  -- plateforme elle-même — n'est plus « à remettre en vente » sur cette plateforme : sa proposition se ferme « déjà en
  -- vente » et la carte le dit (jamais de doublon). Même lecture que la garde « déjà en vente » plus bas : le relevé de
  -- l'annonce vendue revue ACTIVE après l'annulation, ou une autre annonce en ligne de CETTE fiche — jamais le titre.
  UPDATE remises_en_vente rv SET statut = 'abandonnee', motif = 'deja_en_vente', traite_le = now()
    FROM cross_post_jobs jv, inventaire iv
   WHERE rv.statut = 'proposee' AND (p_user IS NULL OR rv.user_id = p_user)
     AND jv.id = rv.job_vendu AND COALESCE(jv.platform_fields, '{}'::jsonb) ? 'vente_annulee_remise'
     AND iv.id = rv.inventaire_id AND iv.user_id = rv.user_id
     AND (
       (rv.platform = 'vinted' AND NULLIF(btrim(jv.platform_listing_id), '') IS NOT NULL AND coalesce((
          SELECT sv.status = 'active' FROM vinted_listing_snapshots sv
           WHERE sv.user_id = rv.user_id AND sv.vinted_item_id = btrim(jv.platform_listing_id)
             AND sv.captured_at > COALESCE(NULLIF(jv.platform_fields #>> '{vente_annulee_remise,le}', '')::timestamptz, rv.cree_le)
           ORDER BY sv.captured_at DESC LIMIT 1), false))
       OR EXISTS (
          SELECT 1 FROM annonces_plateforme av
           WHERE av.user_id = rv.user_id AND av.inventaire_id = rv.inventaire_id AND av.platform = rv.platform
             AND av.statut_plateforme IN ('en_ligne', 'en_verification')
             AND av.disparu_le IS NULL AND av.retiree_le IS NULL AND av.ignoree_le IS NULL
             AND COALESCE(av.vu_le, av.created_at) > COALESCE(NULLIF(jv.platform_fields #>> '{vente_annulee_remise,le}', '')::timestamptz, rv.cree_le))
       OR (rv.platform = 'vinted' AND iv.vinted_item_id IS NOT NULL
           AND iv.vinted_item_id IS DISTINCT FROM NULLIF(btrim(jv.platform_listing_id), '')
           AND iv.disparu_le IS NULL AND COALESCE(iv.vinted_status, 'active') NOT IN ('sold', 'closed')));

  -- (07/11, Ornella) AVANT l'appui : l'article remis en ligne, ou VENDU, sous une AUTRE fiche du même compte (la synchro
  -- du dressing a fait une fiche neuve pour son nouveau numéro Vinted ; Vinted garde « sold » sur l'annonce d'une commande
  -- annulée, la règle « remise en ligne » ne les relie pas). La PREUVE, jamais le titre : fiche_jumelle_prouvee() (mêmes
  -- photos, même boutique, apparue après la vente, l'ancienne jamais revue en ligne depuis, une seule jumelle, un seul
  -- exemplaire de chaque côté). Jumelle vendue → « vendu_sous_autre_fiche » ; en stock et en ligne →
  -- « deja_en_vente_autre_fiche ». TOUTES les plateformes de la remise se ferment (remise_annulee_jumelle_fermer) :
  -- jamais une nouvelle annonce eBay / Leboncoin pour un article déjà vendu. Borné : 50 fiches au plus par passage,
  -- tirées au sort (chacune finit par passer) ; une erreur sur une fiche ne retient ni les autres ni la boucle.
  FOR v_f IN
    SELECT rv.user_id, rv.inventaire_id
      FROM remises_en_vente rv JOIN cross_post_jobs jv ON jv.id = rv.job_vendu
     WHERE rv.statut = 'proposee' AND (p_user IS NULL OR rv.user_id = p_user)
       AND COALESCE(jv.platform_fields, '{}'::jsonb) ? 'vente_annulee_remise'
     GROUP BY rv.user_id, rv.inventaire_id
     ORDER BY random()
     LIMIT 50
  LOOP
    BEGIN
      IF public.remise_annulee_jumelle_fermer(v_f.user_id, v_f.inventaire_id) IS NOT NULL THEN
        v_jumelles := v_jumelles + 1;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'remises_en_vente_tick : jumelle (%, %) : %', v_f.user_id, v_f.inventaire_id, SQLERRM;
    END;
  END LOOP;

  FOR r IN
    SELECT * FROM remises_en_vente
     WHERE statut = 'a_faire' AND prochain_essai <= now()
       AND (p_user IS NULL OR user_id = p_user)
     ORDER BY prochain_essai
     LIMIT GREATEST(1, LEAST(p_limite, 50))
     FOR UPDATE SKIP LOCKED
  LOOP
    -- (07/11) une ligne fermée depuis la lecture (toutes les plateformes d'une remise se ferment ensemble) : rien à refaire.
    IF NOT EXISTS (SELECT 1 FROM remises_en_vente x WHERE x.id = r.id AND x.statut = 'a_faire') THEN CONTINUE; END IF;
    v_motif := NULL; v_report := NULL; v_nouveau := NULL;
    SELECT * INTO j FROM cross_post_jobs WHERE id = r.job_vendu;
    SELECT * INTO i FROM inventaire WHERE id = r.inventaire_id AND user_id = r.user_id;
    v_op := NULL;
    IF j.id IS NOT NULL AND NULLIF(j.platform_fields->>'vente_operation_cle', '') IS NOT NULL THEN
      SELECT o.resultat INTO v_op FROM ventes_operations o
       WHERE o.user_id = r.user_id AND o.cle = j.platform_fields->>'vente_operation_cle';
    END IF;
    -- (18/10) Le dépôt `cancelled` d'une copie retirée à cause d'une vente Vinted
    -- annulée (vente_commande_annulee_vinted) : pas de reçu, le restant est la
    -- quantité de la fiche ; toutes les autres gardes s'appliquent.
    v_annul := (j.id IS NOT NULL AND j.status = 'cancelled' AND (COALESCE(j.platform_fields, '{}'::jsonb) ? 'vente_annulee_remise'));
    v_restant := CASE WHEN v_annul THEN COALESCE(i.quantite, 1) ELSE NULLIF(v_op->>'restant', '')::integer END;

    IF j.id IS NULL OR (j.status <> 'sold' AND NOT v_annul) THEN
      v_motif := 'annonce_plus_vendue';            -- vente annulée, job revenu
    ELSIF NOT v_annul AND (v_op IS NULL OR (v_op->>'ok') IS DISTINCT FROM 'true') THEN
      v_motif := 'vente_non_enregistree';          -- signal sans reçu : on ne sait pas
    ELSIF NOT v_annul AND COALESCE(NULLIF(v_op->>'restant', '')::integer, 0) <= 0 THEN
      v_motif := 'plus_de_stock';                  -- dernière unité : rien à remettre
    ELSIF i.id IS NULL OR i.fusionne_dans IS NOT NULL THEN
      v_motif := 'fiche_absente';
    ELSIF i.statut = 'vendu' OR COALESCE(i.quantite, 1) <= 0 THEN
      v_motif := 'plus_de_stock';
    -- (24/10 soir, décision de Nico) Après une vente ANNULÉE, jamais de doublon : le vendeur a pu remettre l'article en
    -- ligne lui-même. La remise attend un relevé COMPLET de la plateforme fait après l'annulation et au plus tôt
    -- 15 min avant l'appui (demandé par l'appui) ; ce relevé rattache l'annonce remise en ligne, et « déjà en vente »
    -- l'écarte plus bas. Un compte sans aucun relevé de cette plateforme garde les gardes d'avant. 3 jours au plus.
    ELSIF v_annul AND public.releve_apres_annulation(r.user_id, r.platform,
            GREATEST(COALESCE(NULLIF(j.platform_fields #>> '{vente_annulee_remise,le}', '')::timestamptz, r.cree_le),
                     COALESCE(r.accepte_le, r.cree_le) - interval '15 minutes')) = 'attendu' THEN
      v_motif := 'releve_attendu';
      v_report := CASE WHEN COALESCE(r.accepte_le, r.cree_le) < now() - interval '3 days' THEN NULL
                       ELSE now() + interval '20 minutes' END;
    ELSIF r.platform NOT IN ('vinted', 'beebs', 'opla', 'leboncoin', 'ebay', 'depop') THEN
      v_motif := 'plateforme_non_geree';
    ELSIF r.platform IN ('leboncoin', 'ebay')
      AND (COALESCE(j.platform_fields->>'source', '') = 'releve'
           OR COALESCE(j.platform_fields #>> '{rattachement,import}', '') = 'true')
      -- (05/11, règle de Nico) Leboncoin : « importée » se juge sur l'annonce VENDUE elle-même. Une REPUBLICATION est un
      -- dépôt FillSell (une pièce) qui hérite source / rattachement de l'annonce d'origine (3298491503, job 6696ce1f) :
      -- jamais « importée à quantité ». eBay : inchangé.
      AND NOT (r.platform = 'leboncoin' AND COALESCE(j.action, 'publish') = 'republish')
      -- (06/10 soir) eBay : une annonce importée n'est « vendue » que si eBay
      -- la dit ÉPUISÉE (ebay-api-worker, sale_evidence.exact) — elle n'est plus
      -- en ligne ; la fiche qui garde du stock doit être remise en vente.
      AND NOT (r.platform = 'ebay' AND (
            COALESCE(j.platform_fields #>> '{sale_evidence,exact}', '') = 'true'
         OR (COALESCE(j.platform_fields #>> '{quantite_ebay,exacte}', '') = 'true'
             AND COALESCE(NULLIF(j.platform_fields #>> '{quantite_ebay,disponible}', '')::numeric, 1) <= 0))) THEN
      v_motif := 'annonce_importee_a_quantite';    -- peut rester en ligne avec son stock
    ELSIF r.platform = 'opla' AND COALESCE(v_sortie, 0) > 0 AND now() >= to_timestamp(v_sortie) THEN
      v_motif := 'opla_sortie';
    ELSIF COALESCE(v_prix, 0) > 0 THEN
      v_motif := 'publication_payante';            -- jamais de débit sans le geste de la personne
    -- (08/10, Louis) L'annonce « vendue » est encore EN LIGNE après la vente
    -- (dressing Vinted, relevé des autres plateformes) : une remise ferait un
    -- doublon. On revient dans 6 h (la vente annulée ou l'annonce partie, elle
    -- repart d'elle-même).
    ELSIF (r.platform = 'vinted' AND NULLIF(btrim(j.platform_listing_id), '') IS NOT NULL AND (
             SELECT s.status = 'active' AND s.captured_at > COALESCE(j.sold_at, now())
               FROM vinted_listing_snapshots s
              WHERE s.user_id = r.user_id AND s.vinted_item_id = btrim(j.platform_listing_id)
              ORDER BY s.captured_at DESC LIMIT 1))
       OR (r.platform <> 'vinted' AND NULLIF(btrim(j.platform_listing_id), '') IS NOT NULL AND EXISTS (
             SELECT 1 FROM annonces_plateforme a
              WHERE a.user_id = r.user_id AND a.platform = r.platform AND a.listing_id = btrim(j.platform_listing_id)
                AND a.statut_plateforme = 'en_ligne' AND a.disparu_le IS NULL AND a.vu_le > COALESCE(j.sold_at, now())
                -- (05/11, règle de Nico) Leboncoin garde l'annonce « active » pendant la transaction (« Achat en cours »)
                -- et une fois vendue (« Vendu ») : sous transaction, elle n'est pas « encore en vente » — la remise part.
                AND NOT (a.platform = 'leboncoin'
                         AND COALESCE(public.leboncoin_transaction_lue(a.transaction_plateforme, a.capture), '') IN ('pending', 'sold')))) THEN
      v_motif := 'annonce_vendue_encore_en_ligne'; v_report := now() + interval '6 hours';
    ELSIF EXISTS (
        SELECT 1 FROM cross_post_jobs c
         WHERE c.user_id = r.user_id AND c.inventaire_id = r.inventaire_id AND c.platform = r.platform
           AND c.id <> j.id AND COALESCE(c.action, 'publish') IN ('publish', 'republish')
           AND (c.status IN ('pending', 'processing', 'needs_user')
                OR (c.status = 'published' AND NOT EXISTS (
                      SELECT 1 FROM cross_post_jobs d
                       WHERE d.user_id = c.user_id AND d.inventaire_id = c.inventaire_id
                         AND d.platform = c.platform AND d.action = 'delete' AND d.status = 'deleted'
                         AND CASE WHEN annonce_id_de_job(d.platform_listing_id, d.listing_url) IS NOT NULL
                                   AND annonce_id_de_job(c.platform_listing_id, c.listing_url) IS NOT NULL
                                  THEN annonce_id_de_job(d.platform_listing_id, d.listing_url)
                                     = annonce_id_de_job(c.platform_listing_id, c.listing_url)
                                  ELSE d.created_at > COALESCE(c.published_at, c.created_at) END))))
      OR EXISTS (
        SELECT 1 FROM annonces_plateforme a
         WHERE a.user_id = r.user_id AND a.inventaire_id = r.inventaire_id AND a.platform = r.platform
           AND a.statut_plateforme IN ('en_ligne', 'en_verification')
           AND a.disparu_le IS NULL AND a.retiree_le IS NULL AND a.ignoree_le IS NULL
           AND a.listing_id IS DISTINCT FROM NULLIF(btrim(j.platform_listing_id), '')
           -- (05/11, règle de Nico) Même règle : une AUTRE annonce Leboncoin de la fiche sous transaction (« Achat en
           -- cours » / « Vendu » — la vente d'avant, que Leboncoin garde listée des jours) n'est pas « déjà en vente ».
           AND NOT (a.platform = 'leboncoin'
                    AND COALESCE(public.leboncoin_transaction_lue(a.transaction_plateforme, a.capture), '') IN ('pending', 'sold'))
           AND COALESCE(a.vu_le, a.created_at) > COALESCE(j.sold_at, now()))
      OR (r.platform = 'vinted' AND i.vinted_item_id IS NOT NULL
          AND i.vinted_item_id IS DISTINCT FROM NULLIF(btrim(j.platform_listing_id), '')
          AND i.disparu_le IS NULL AND COALESCE(i.vinted_status, 'active') NOT IN ('sold', 'closed')) THEN
      v_motif := 'deja_en_vente';
    -- (09/10 soir, Louis) Plus de branche « jumeau_en_ligne » : l'annonce
    -- d'une AUTRE fiche ne retient jamais la remise en vente de celle-ci
    -- (migration 20261009233000). « deja_en_vente » (CETTE fiche) reste.
    END IF;

    IF v_motif IS NULL AND EXISTS (SELECT 1 FROM platform_health h WHERE h.platform = r.platform AND h.paused) THEN
      v_motif := 'plateforme_en_pause'; v_report := now() + interval '1 hour';
    END IF;
    IF v_motif IS NULL THEN
      SELECT p.extension_last_seen_at, COALESCE(p.ebay_voie_api, false) INTO v_vu, v_api
        FROM profiles p WHERE p.id = r.user_id;
      IF NOT (v_vu > now() - interval '7 days' OR (r.platform = 'ebay' AND v_api)) THEN
        v_motif := 'poste_absent'; v_report := now() + interval '6 hours';
      END IF;
    END IF;
    -- (24/10 soir) Une remise après une vente ANNULÉE est hors quota : c'est l'état d'avant la vente, pas une publication voulue.
    IF v_motif IS NULL AND NOT v_annul THEN
      v_place := remise_en_vente_place(r.user_id);
      IF (v_place->>'place') IS DISTINCT FROM 'true' THEN
        v_motif := v_place->>'motif';
        v_report := NULLIF(v_place->>'reprise', '')::timestamptz;
        IF v_report IS NULL THEN v_report := 'infinity'; END IF;  -- quota à vie : n'est plus tenté
      END IF;
    END IF;

    -- (25/10 nuit, décision de Nico du 24/10 23:21) Vinted, vente ANNULÉE : la remise passe par le bouton « Republier »
    -- de Vinted (même annonce, mêmes photos, nouveau numéro) — l'extension ≥ 0.6.142 l'actionne (get-pending-jobs ne
    -- sert ce job qu'à un poste qui déclare « vinted_republier_v1 »). Sans numéro de commande ou d'annonce : rien
    -- n'est créé, jamais une nouvelle annonce en plus du bouton de Vinted.
    v_rep := '{}'::jsonb;
    IF v_motif IS NULL AND r.platform = 'vinted' AND v_annul THEN
      v_trans := NULLIF(btrim(COALESCE(j.platform_fields #>> '{vente_annulee_remise,commande}', '')), '');
      IF v_trans IS NULL OR v_trans !~ '^[0-9]+$' OR NULLIF(btrim(j.platform_listing_id), '') IS NULL THEN
        v_motif := 'republier_commande_inconnue';
      ELSE
        SELECT NULLIF(btrim(pc.conversation_ref), '') INTO v_conv FROM plateforme_commandes pc
         WHERE pc.user_id = r.user_id AND pc.platform = 'vinted' AND pc.commande_ref = v_trans
         ORDER BY pc.maj_le DESC NULLS LAST LIMIT 1;
        v_rep := jsonb_build_object('remise_par_republier', jsonb_build_object(
          'transaction_id', v_trans, 'conversation_id', v_conv, 'item_id', btrim(j.platform_listing_id),
          'vente', j.platform_fields #>> '{vente_annulee_remise,vente}', 'annulee_le', j.platform_fields #>> '{vente_annulee_remise,le}',
          'job_vendu', j.id, 'cree_le', now()));
      END IF;
    END IF;

    -- (07/11, Ornella) La MÊME garde juste avant de créer la publication d'une remise après vente annulée : l'article
    -- remis en ligne ou vendu sous une autre fiche (preuve : fiche_jumelle_prouvee) → rien n'est créé, toutes les
    -- plateformes de la remise se ferment. Une vérification impossible (erreur) ne crée rien : on revient dans 1 h.
    IF v_motif IS NULL AND v_annul THEN
      BEGIN
        v_jum := public.remise_annulee_jumelle_fermer(r.user_id, r.inventaire_id);
      EXCEPTION WHEN OTHERS THEN
        v_jum := NULL; v_motif := 'jumelle_non_verifiee'; v_report := now() + interval '1 hour';
      END;
      IF v_jum IS NOT NULL THEN
        v_abandons := v_abandons + 1; v_jumelles := v_jumelles + 1;
        CONTINUE;   -- la ligne est déjà fermée (avec ses sœurs) par remise_annulee_jumelle_fermer
      END IF;
    END IF;

    IF v_motif IS NULL THEN
      BEGIN
        INSERT INTO cross_post_jobs (user_id, inventaire_id, platform, status, action, photo_option,
                                     title, description, price, photos, platform_fields)
        VALUES (r.user_id, r.inventaire_id, r.platform, 'pending', 'publish', COALESCE(j.photo_option, 'original'),
                -- (24/10 nuit, le short de Nico) Le contenu de la FICHE quand le job source n'en a pas (annonce importée du
                -- dressing, ancienne republication) : jamais une publication sans titre, sans prix ou sans photo.
                coalesce(nullif(btrim(j.title), ''), i.titre), coalesce(nullif(btrim(j.description), ''), i.description),
                coalesce(j.price, i.prix_vente),
                -- (06/11, the_closet72) Les photos du job vendu, dans l'ORDRE DE LA FICHE (public.photos_ordre_article).
                CASE WHEN jsonb_typeof(j.photos) = 'array' AND jsonb_array_length(j.photos) > 0
                          THEN public.photos_ordre_article(j.photos, i.photos, j.platform_fields)
                     WHEN jsonb_typeof(i.photos) = 'array' THEN i.photos ELSE j.photos END,
                remise_en_vente_champs(j.platform_fields) || jsonb_build_object('remise_en_vente',
                  jsonb_build_object('apres_vente_job', j.id, 'annonce_vendue', NULLIF(btrim(j.platform_listing_id), ''),
                                     'vente', j.platform_fields->>'vente_operation_cle',
                                     'restant', v_restant, 'apres_annulation', v_annul, 'le', now()))
                || CASE WHEN v_annul THEN jsonb_build_object('hors_quota', true) ELSE '{}'::jsonb END
                || v_rep)
        RETURNING id INTO v_nouveau;
      EXCEPTION
        WHEN unique_violation THEN v_motif := 'deja_en_vente';
        WHEN OTHERS THEN v_motif := 'refus_creation: ' || left(SQLERRM, 160);
      END;
    END IF;

    IF v_nouveau IS NOT NULL THEN
      UPDATE remises_en_vente SET statut = 'faite', motif = NULL, job_cree = v_nouveau,
             essais = essais + 1, traite_le = now() WHERE id = r.id;
      INSERT INTO usage_logs (user_id, feature, metadata)
      VALUES (r.user_id, 'remise_en_vente', jsonb_build_object('plateforme', r.platform,
        'inventaire_id', r.inventaire_id::text, 'job_vendu', j.id, 'job_cree', v_nouveau,
        'restant', v_restant, 'apres_annulation', v_annul, 'par_republier', v_rep ? 'remise_par_republier'));
      v_faites := v_faites + 1;
    ELSIF v_report IS NOT NULL AND v_report <> 'infinity' THEN
      UPDATE remises_en_vente SET motif = v_motif, essais = essais + 1, prochain_essai = v_report,
             traite_le = now() WHERE id = r.id;
      v_reports := v_reports + 1;
    ELSE
      UPDATE remises_en_vente SET statut = 'abandonnee', motif = v_motif, essais = essais + 1,
             traite_le = now() WHERE id = r.id;
      v_abandons := v_abandons + 1;
    END IF;
  END LOOP;
  RETURN jsonb_build_object('issue', 'tour', 'faites', v_faites, 'reportees', v_reports,
                            'abandonnees', v_abandons, 'cpu', v_cpu,
                            'hors_stock', v_hors_stock, 'jumelles', v_jumelles);
END;
$function$;

CREATE OR REPLACE FUNCTION public.rapprochement_v3_remise_possible(p_user uuid, p_ancienne bigint, p_nouvelle bigint)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE m inventaire%ROWTYPE; n inventaire%ROWTYPE;
BEGIN
  SELECT * INTO m FROM inventaire WHERE id = p_ancienne AND user_id = p_user;
  SELECT * INTO n FROM inventaire WHERE id = p_nouvelle AND user_id = p_user;
  IF m.id IS NULL OR n.id IS NULL OR m.id = n.id OR m.fusionne_dans IS NOT NULL OR n.fusionne_dans IS NOT NULL THEN
    RETURN 'introuvable';
  END IF;
  -- une décision de la personne sur la paire est définitive (réponse, fusion défaite)
  IF EXISTS (SELECT 1 FROM inventaire_doublons q WHERE q.user_id = p_user AND q.decide_par = 'utilisateur'
               AND least(q.garde, q.absorbe) = least(m.id, n.id) AND greatest(q.garde, q.absorbe) = greatest(m.id, n.id))
     OR EXISTS (SELECT 1 FROM inventaire_fusions f WHERE f.user_id = p_user AND f.defait_le IS NOT NULL
                  AND least(f.garde, f.absorbe) = least(m.id, n.id) AND greatest(f.garde, f.absorbe) = greatest(m.id, n.id)) THEN
    RETURN 'paire_tranchee';
  END IF;
  IF NULLIF(btrim(COALESCE(m.vinted_item_id, '')), '') IS NULL OR NULLIF(btrim(COALESCE(n.vinted_item_id, '')), '') IS NULL
     OR btrim(m.vinted_item_id) = btrim(n.vinted_item_id) THEN
    RETURN 'pas_vinted';
  END IF;
  IF COALESCE(m.vinted_account_id, '') <> COALESCE(n.vinted_account_id, '') THEN RETURN 'boutiques_differentes'; END IF;
  -- (24/10) LA BOUTIQUE DOIT ÊTRE CELLE DU COMPTE : inscrite à un AUTRE compte FillSell (registre du 18/10, « une
  -- boutique = un compte »), ce n'est pas la sienne — ni fusion, ni question. Même test que la garde de la base
  -- (inventaire_ecarte_import_sync), qui refuserait de toute façon la fusion.
  IF public.boutique_vinted_autre_compte(p_user, m.vinted_account_id) THEN RETURN 'boutiques_differentes'; END IF;
  IF m.statut IS DISTINCT FROM 'stock' OR COALESCE(m.vinted_status, '') = 'sold'
     OR n.statut IS DISTINCT FROM 'stock' AND (n.statut = 'vendu' OR COALESCE(n.vinted_status, '') = 'sold') THEN
    RETURN 'ancienne_vendue';
  END IF;
  -- (24/10, feu vert de Nico) AUCUNE VENTE EN COURS TOUCHÉE : une commande, une preuve de vente qui attend son
  -- enregistrement, un achat en cours Leboncoin, sur l'une ou l'autre fiche — rien n'est fait (ni fusion, ni question).
  IF EXISTS (SELECT 1 FROM plateforme_commandes pc WHERE pc.inventaire_id IN (m.id, n.id))
     OR EXISTS (SELECT 1 FROM cross_post_jobs j WHERE j.user_id = p_user AND j.inventaire_id IN (m.id, n.id)
                  AND j.status = 'published' AND j.platform_fields ->> 'sale_signal' = 'sold')
     OR EXISTS (SELECT 1 FROM annonces_plateforme a WHERE a.inventaire_id IN (m.id, n.id) AND a.platform = 'leboncoin'
                  AND public.leboncoin_transaction_lue(a.transaction_plateforme, a.capture) IN ('pending', 'sold')) THEN
    RETURN 'vente_en_cours';
  END IF;
  IF n.statut IS DISTINCT FROM 'stock' OR COALESCE(n.vinted_status, '') <> 'active' OR n.disparu_le IS NOT NULL THEN
    RETURN 'nouvelle_pas_en_ligne';
  END IF;
  -- jamais en ligne ensemble, l'ancienne a quitté le dressing sans y être vue vendue
  IF NOT vinted_remise_en_ligne(m.id, n.id) THEN RETURN 'pas_une_remise_en_ligne'; END IF;
  -- ce qui demande la personne : la question, jamais la fusion
  IF COALESCE(m.quantite, 1) > 1 OR COALESCE(n.quantite, 1) > 1 THEN RETURN 'quantite'; END IF;
  IF EXISTS (SELECT 1 FROM cross_post_jobs j WHERE j.user_id = p_user AND j.inventaire_id IN (m.id, n.id)
               AND j.status IN ('pending', 'processing', 'needs_user')) THEN
    RETURN 'job_en_vol';
  END IF;
  IF n.prix_achat IS NOT NULL OR COALESCE(n.prix_achat_inconnu, false)
     OR n.prix_vente_change_par = 'app' OR n.poids_change_par = 'app'
     OR EXISTS (SELECT 1 FROM ventes x WHERE x.inventaire_id = n.id)
     OR EXISTS (SELECT 1 FROM fiches_annonce fa WHERE fa.inventaire_id = n.id)
     OR EXISTS (SELECT 1 FROM push_ventes pv WHERE pv.inventaire_id = n.id)
     OR EXISTS (SELECT 1 FROM remises_en_vente rv WHERE rv.inventaire_id = n.id)
     OR EXISTS (SELECT 1 FROM jsonb_each(CASE WHEN jsonb_typeof(n.attributs) = 'object' THEN n.attributs ELSE '{}'::jsonb END) e
                 WHERE jsonb_typeof(e.value) = 'object' AND e.value ->> 'source' = 'manuel') THEN
    RETURN 'nouvelle_touchee';
  END IF;
  -- jamais deux annonces vivantes d'une même autre plateforme sur un article
  IF EXISTS (SELECT 1 FROM annonces_plateforme x JOIN annonces_plateforme y ON y.platform = x.platform
              WHERE x.inventaire_id = m.id AND y.inventaire_id = n.id AND x.disparu_le IS NULL AND y.disparu_le IS NULL)
     OR EXISTS (SELECT 1 FROM cross_post_jobs x JOIN cross_post_jobs y ON y.platform = x.platform
                 WHERE x.inventaire_id = m.id AND y.inventaire_id = n.id AND x.platform <> 'vinted'
                   AND x.status = 'published' AND y.status = 'published'
                   AND x.action IN ('publish', 'republish') AND y.action IN ('publish', 'republish')) THEN
    RETURN 'deux_exemplaires';
  END IF;
  RETURN NULL;
END;
$function$;

CREATE OR REPLACE FUNCTION public.inventaire_fusionner_pour(p_user uuid, p_garde bigint, p_absorbe bigint, p_par text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := p_user; -- MODIF 2026-09-25 : l'appelant dit pour qui (inventaire_fusionner passe auth.uid())
  g inventaire%ROWTYPE;
  a inventaire%ROWTYPE;
  v_dep jsonb := '{}'::jsonb;
  v_champs jsonb := '{}'::jsonb;
  v_ids jsonb;
  v_attr jsonb;
  v_cle text;
  v_id uuid;
  -- (05/11, Nico) « manuel » seulement sur un VRAI geste de la personne : sa fusion à la main (inventaire_fusionner,
  -- 'utilisateur') ou son « Oui » à une question (inventaire_doublon_decider, 'utilisateur (doublon proposé)').
  -- Les anciennes étiquettes « utilisateur:photo_… » sont des chemins AUTOMATIQUES (moteur, lots) : jamais un geste.
  v_geste boolean := COALESCE(p_par, '') = 'utilisateur' OR COALESCE(p_par, '') LIKE 'utilisateur (%';
  v_conflits jsonb;
BEGIN
  -- Point A : une ressemblance ne permet jamais une fusion automatique.
  -- (15/10, décision 3 de Nico) Exception : le verdict de l'IA sur un DOUTE du
  -- moteur (inventaire_doublon_decider_ia, p_par 'ia (…)'), rendu avec ses
  -- garde-fous : photos comparées (jamais le titre seul), jamais deux annonces
  -- d'une même plateforme, jamais une fiche vendue, jamais chez un compte qui a
  -- répondu « Non, deux exemplaires ». Toute autre voie reste refusée.
  -- (05/11, Nico) Le moteur v3 signe désormais ses fusions automatiques « auto:photo_rapprochement_v3… (photo_identique) »
  -- (avant : « utilisateur:photo_rapprochement_v3… », une étiquette de geste sur un chemin automatique) ; seules
  -- ces trois marques automatiques entrent ici, en plus des voies d'avant.
  IF COALESCE(p_par, '') NOT LIKE 'utilisateur%' AND COALESCE(p_par, '') NOT LIKE 'ia (%'
     AND COALESCE(p_par, '') NOT IN ('auto:photo_rapprochement_v3 (photo_identique)',
                                     'auto:photo_rapprochement_v3_main (photo_identique)',
                                     'auto:photo_rapprochement_v3_remise (photo_identique)') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'confirmation_utilisateur_requise');
  END IF;
  IF v_user IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'unauthorized'); END IF;
  IF p_garde IS NULL OR p_absorbe IS NULL OR p_garde = p_absorbe THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'articles_identiques');
  END IF;
  SELECT * INTO g FROM inventaire WHERE id = p_garde AND user_id = v_user FOR UPDATE;
  SELECT * INTO a FROM inventaire WHERE id = p_absorbe AND user_id = v_user FOR UPDATE;
  IF g.id IS NULL OR a.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'article_introuvable'); END IF;
  IF g.fusionne_dans IS NOT NULL OR a.fusionne_dans IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'deja_fusionne');
  END IF;

  -- ⛔ (05/11, Nico — assopmfrance : un « Oui » à une photo PROCHE a donné à l'écusson UJ2 une 2e annonce Leboncoin,
  -- l'Albator) UNE FICHE UNITAIRE NE PORTE JAMAIS DEUX ANNONCES DE LA MÊME PLATEFORME : deux annonces d'une plateforme
  -- sont deux exemplaires. La gardée (quantité ≤ 1) porte une annonce vivante d'une plateforme où l'absorbée en porte
  -- une AUTRE → rien n'est regroupé, motif nommé ; la question qui a demandé la fusion reste ouverte (l'appelant le dit).
  -- Vivante : annonce relevée ni disparue, ni retirée, ni ignorée ; dépôt « published » qu'aucune annonce relevée ne
  -- représente (hors Vinted) ; Vinted : l'identité en ligne de la fiche (vinted_item_id, disparu_le vide) — l'échange
  -- d'une remise en ligne (vinted_remise_en_ligne / vinted_retraits_successifs) n'est pas un doublon. Seule exception,
  -- inchangée : la republication PROUVÉE (P16, 15/10 : rapprochement_republication_prouvee — même titre, prix,
  -- description, ni lot ni quantité ; la même annonce publiée deux fois, voulue par Nico ; gardée le 05/11 soir, b).
  -- (05/11 soir, décision c) Vaut aussi pour « Annonce en double ? » → « Oui » (inventaire_doublon_decider) : refusé
  -- sur une fiche unitaire, sauf republication prouvée. Le message est lu tel quel par l'écran Doublons.
  IF COALESCE(g.quantite, 1) <= 1 THEN
    WITH l AS (
      SELECT CASE WHEN ap.inventaire_id = p_garde THEN 'g' ELSE 'a' END AS cote, ap.platform, btrim(ap.listing_id) AS lid, ap.id AS annonce
        FROM annonces_plateforme ap
       WHERE ap.inventaire_id IN (p_garde, p_absorbe) AND ap.user_id = v_user
         AND ap.disparu_le IS NULL AND ap.retiree_le IS NULL AND ap.ignoree_le IS NULL
      UNION ALL
      SELECT CASE WHEN j.inventaire_id = p_garde THEN 'g' ELSE 'a' END, j.platform,
             COALESCE(NULLIF(btrim(j.platform_listing_id), ''), 'job:' || j.id::text), NULL::uuid
        FROM cross_post_jobs j
       WHERE j.inventaire_id IN (p_garde, p_absorbe) AND j.user_id = v_user AND j.platform <> 'vinted'
         AND j.status = 'published' AND COALESCE(j.action, 'publish') IN ('publish', 'republish')
         AND NOT EXISTS (SELECT 1 FROM annonces_plateforme x WHERE x.job_id = j.id)
      UNION ALL
      SELECT 'g', 'vinted', btrim(g.vinted_item_id), NULL::uuid
       WHERE NULLIF(btrim(COALESCE(g.vinted_item_id, '')), '') IS NOT NULL AND g.disparu_le IS NULL
      UNION ALL
      SELECT 'a', 'vinted', btrim(a.vinted_item_id), NULL::uuid
       WHERE NULLIF(btrim(COALESCE(a.vinted_item_id, '')), '') IS NOT NULL AND a.disparu_le IS NULL)
    SELECT jsonb_agg(DISTINCT x.platform) INTO v_conflits
      FROM l x JOIN l y ON y.platform = x.platform AND y.cote = 'g'
     WHERE x.cote = 'a' AND x.lid IS DISTINCT FROM y.lid
       AND NOT (x.annonce IS NOT NULL AND y.annonce IS NOT NULL
                AND COALESCE(rapprochement_republication_prouvee(x.annonce, y.annonce), false))
       AND NOT (x.platform = 'vinted' AND (COALESCE(vinted_remise_en_ligne(g.id, a.id), false)
                                           OR COALESCE(vinted_retraits_successifs(g.id, a.id), false)));
    IF v_conflits IS NOT NULL THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'deux_annonces_meme_plateforme', 'plateformes', v_conflits,
        'message', 'Cette fiche a déjà une annonce '
                   || (SELECT string_agg(CASE p WHEN 'leboncoin' THEN 'Leboncoin' WHEN 'ebay' THEN 'eBay' WHEN 'beebs' THEN 'Beebs'
                                                WHEN 'depop' THEN 'Depop' WHEN 'vinted' THEN 'Vinted' WHEN 'opla' THEN 'Opla' ELSE p END, ' et une annonce ')
                         FROM jsonb_array_elements_text(v_conflits) p)
                   || ' en ligne, et l''autre fiche en '
                   || CASE WHEN jsonb_array_length(v_conflits) > 1 THEN 'a d''autres' ELSE 'a une autre' END
                   || ' : deux annonces d''une même plateforme, ce sont deux exemplaires. Rien n''a été regroupé.');
    END IF;
  END IF;

  SELECT jsonb_agg(id) INTO v_ids FROM ventes WHERE inventaire_id = p_absorbe AND user_id = v_user;
  IF v_ids IS NOT NULL THEN
    UPDATE ventes SET inventaire_id = p_garde WHERE inventaire_id = p_absorbe AND user_id = v_user;
    v_dep := v_dep || jsonb_build_object('ventes', v_ids);
  END IF;

  SELECT jsonb_agg(id) INTO v_ids FROM cross_post_jobs WHERE inventaire_id = p_absorbe AND user_id = v_user;
  IF v_ids IS NOT NULL THEN
    UPDATE cross_post_jobs SET inventaire_id = p_garde WHERE inventaire_id = p_absorbe AND user_id = v_user;
    v_dep := v_dep || jsonb_build_object('cross_post_jobs', v_ids);
  END IF;

  SELECT jsonb_agg(id) INTO v_ids FROM annonces_plateforme WHERE inventaire_id = p_absorbe AND user_id = v_user;
  IF v_ids IS NOT NULL THEN
    -- (05/11, Nico) « manuel » seulement sur le geste de la personne ; une fusion automatique laisse la source d'avant.
    UPDATE annonces_plateforme SET inventaire_id = p_garde,
           source_rapprochement = CASE WHEN v_geste THEN 'manuel' ELSE source_rapprochement END,
           proposition = NULL, updated_at = now()
     WHERE inventaire_id = p_absorbe AND user_id = v_user;
    v_dep := v_dep || jsonb_build_object('annonces_plateforme', v_ids);
  END IF;

  SELECT jsonb_agg(id) INTO v_ids FROM vinted_listing_snapshots WHERE inventaire_id = p_absorbe;
  IF v_ids IS NOT NULL THEN
    UPDATE vinted_listing_snapshots SET inventaire_id = p_garde WHERE inventaire_id = p_absorbe;
    v_dep := v_dep || jsonb_build_object('vinted_listing_snapshots', v_ids);
  END IF;
  SELECT jsonb_agg(id) INTO v_ids FROM vinted_republish_captures WHERE inventaire_id = p_absorbe;
  IF v_ids IS NOT NULL THEN
    UPDATE vinted_republish_captures SET inventaire_id = p_garde WHERE inventaire_id = p_absorbe;
    v_dep := v_dep || jsonb_build_object('vinted_republish_captures', v_ids);
  END IF;
  IF EXISTS (SELECT 1 FROM fiches_annonce WHERE inventaire_id = p_absorbe AND user_id = v_user)
     AND NOT EXISTS (SELECT 1 FROM fiches_annonce WHERE inventaire_id = p_garde AND user_id = v_user) THEN
    UPDATE fiches_annonce SET inventaire_id = p_garde WHERE inventaire_id = p_absorbe AND user_id = v_user;
    v_dep := v_dep || jsonb_build_object('fiches_annonce', jsonb_build_array(p_absorbe));
  END IF;
  -- (07/10) Les notifications de vente et les remises en vente suivent l'article.
  SELECT jsonb_agg(id) INTO v_ids FROM push_ventes WHERE inventaire_id = p_absorbe AND user_id = v_user;
  IF v_ids IS NOT NULL THEN
    UPDATE push_ventes SET inventaire_id = p_garde WHERE inventaire_id = p_absorbe AND user_id = v_user;
    v_dep := v_dep || jsonb_build_object('push_ventes', v_ids);
  END IF;
  SELECT jsonb_agg(id) INTO v_ids FROM remises_en_vente WHERE inventaire_id = p_absorbe AND user_id = v_user;
  IF v_ids IS NOT NULL THEN
    UPDATE remises_en_vente SET inventaire_id = p_garde WHERE inventaire_id = p_absorbe AND user_id = v_user;
    v_dep := v_dep || jsonb_build_object('remises_en_vente', v_ids);
  END IF;
  SELECT jsonb_agg(id) INTO v_ids FROM rapprochements WHERE inventaire_id = p_absorbe AND user_id = v_user;
  IF v_ids IS NOT NULL THEN
    UPDATE rapprochements SET inventaire_id = p_garde WHERE inventaire_id = p_absorbe AND user_id = v_user;
    v_dep := v_dep || jsonb_build_object('rapprochements', v_ids);
  END IF;

  IF g.prix_achat IS NULL AND COALESCE(g.prix_achat_inconnu, false) = false
     AND (a.prix_achat IS NOT NULL OR COALESCE(a.prix_achat_inconnu, false) = true) THEN
    UPDATE inventaire SET prix_achat = a.prix_achat, prix_achat_inconnu = a.prix_achat_inconnu WHERE id = p_garde;
    v_champs := v_champs || jsonb_build_object(
      'prix_achat', jsonb_build_object('avant', NULL, 'apres', a.prix_achat),
      'prix_achat_inconnu', jsonb_build_object('avant', g.prix_achat_inconnu, 'apres', a.prix_achat_inconnu));
  END IF;

  IF NULLIF(trim(COALESCE(g.description, '')), '') IS NULL AND NULLIF(trim(COALESCE(a.description, '')), '') IS NOT NULL THEN
    UPDATE inventaire SET description = a.description WHERE id = p_garde;
    v_champs := v_champs || jsonb_build_object('description', jsonb_build_object('avant', g.description, 'apres', a.description));
  END IF;
  IF NULLIF(trim(COALESCE(g.marque, '')), '') IS NULL AND NULLIF(trim(COALESCE(a.marque, '')), '') IS NOT NULL THEN
    UPDATE inventaire SET marque = a.marque WHERE id = p_garde;
    v_champs := v_champs || jsonb_build_object('marque', jsonb_build_object('avant', g.marque, 'apres', a.marque));
  END IF;
  IF (g.photos IS NULL OR jsonb_typeof(g.photos) <> 'array' OR jsonb_array_length(g.photos) = 0)
     AND jsonb_typeof(a.photos) = 'array' AND jsonb_array_length(a.photos) > 0 THEN
    UPDATE inventaire SET photos = a.photos WHERE id = p_garde;
    v_champs := v_champs || jsonb_build_object('photos', jsonb_build_object('avant', g.photos, 'apres', a.photos));
  END IF;
  IF jsonb_typeof(a.attributs) = 'object' THEN
    v_attr := COALESCE(g.attributs, '{}'::jsonb);
    FOR v_cle IN SELECT k FROM jsonb_object_keys(a.attributs) k LOOP
      IF NOT (v_attr ? v_cle) THEN v_attr := v_attr || jsonb_build_object(v_cle, a.attributs -> v_cle); END IF;
    END LOOP;
    IF v_attr <> COALESCE(g.attributs, '{}'::jsonb) THEN
      UPDATE inventaire SET attributs = v_attr WHERE id = p_garde;
      v_champs := v_champs || jsonb_build_object('attributs', jsonb_build_object('avant', g.attributs, 'apres', v_attr));
    END IF;
  END IF;

  -- ── AJOUT 2026-09-25 : L'IDENTITÉ VINTED SUIT L'OBJET ─────────────────────
  -- L'absorbé porte l'annonce Vinted VIVANTE et le gardé n'en a pas : elle
  -- passe au gardé. Sans ça, la fiche gardée se croit hors de Vinted et rouvre
  -- une publication Vinted (le doublon qu'on vient d'éviter — Romain, 21/09).
  -- Journalisée dans champs_repris : inventaire_defusionner la rend.
  -- (Index unique (user_id, vinted_item_id) : l'absorbé la lâche d'abord.)
  IF g.vinted_item_id IS NULL AND a.vinted_item_id IS NOT NULL AND a.disparu_le IS NULL THEN
    UPDATE inventaire SET vinted_item_id = NULL, vinted_status = NULL, vinted_account_id = NULL WHERE id = p_absorbe;
    UPDATE inventaire
       SET vinted_item_id = a.vinted_item_id, vinted_status = a.vinted_status, vinted_account_id = a.vinted_account_id,
           vinted_catalog_id = COALESCE(g.vinted_catalog_id, a.vinted_catalog_id),
           vinted_view_count = a.vinted_view_count, vinted_favourite_count = a.vinted_favourite_count,
           listed_at_guess = COALESCE(g.listed_at_guess, a.listed_at_guess)
     WHERE id = p_garde;
    v_champs := v_champs || jsonb_build_object('vinted_identite', jsonb_build_object(
      'avant', jsonb_build_object('vinted_item_id', g.vinted_item_id, 'vinted_status', g.vinted_status,
                                  'vinted_account_id', g.vinted_account_id, 'vinted_catalog_id', g.vinted_catalog_id,
                                  'vinted_view_count', g.vinted_view_count, 'vinted_favourite_count', g.vinted_favourite_count,
                                  'listed_at_guess', g.listed_at_guess),
      'apres', jsonb_build_object('vinted_item_id', a.vinted_item_id, 'vinted_status', a.vinted_status,
                                  'vinted_account_id', a.vinted_account_id, 'vinted_catalog_id', a.vinted_catalog_id,
                                  'vinted_view_count', a.vinted_view_count, 'vinted_favourite_count', a.vinted_favourite_count,
                                  'listed_at_guess', a.listed_at_guess)));
  -- ── AJOUT 2026-09-25 après-midi : LA REMISE EN LIGNE — ÉCHANGE ─────────
  -- Le gardé porte l'annonce RETIRÉE, l'absorbé la VIVANTE qui l'a remplacée :
  -- le gardé prend la vivante (il redevient en ligne), l'absorbé GARDE la
  -- retirée — jamais effacée : la synchro retrouve les fiches par
  -- vinted_item_id, une retirée sans fiche serait réimportée. Ordre imposé par
  -- l'index unique (user_id, vinted_item_id) : libérer, poser, reposer.
  -- (migration 20260925163000) et deux annonces RETIRÉES successives : le gardé
  -- prend la plus récente, pour que le maillon suivant d'une chaîne se compare à elle.
  ELSIF g.vinted_item_id IS NOT NULL AND a.vinted_item_id IS NOT NULL
        AND (vinted_remise_en_ligne(g.id, a.id) OR vinted_retraits_successifs(g.id, a.id)) THEN
    UPDATE inventaire SET vinted_item_id = NULL, vinted_status = NULL, vinted_account_id = NULL WHERE id = p_absorbe;
    UPDATE inventaire
       SET vinted_item_id = a.vinted_item_id, vinted_status = a.vinted_status, vinted_account_id = a.vinted_account_id,
           vinted_catalog_id = COALESCE(a.vinted_catalog_id, g.vinted_catalog_id),
           vinted_view_count = a.vinted_view_count, vinted_favourite_count = a.vinted_favourite_count,
           listed_at_guess = COALESCE(g.listed_at_guess, a.listed_at_guess),
           disparu_le = a.disparu_le, last_synced_at = COALESCE(a.last_synced_at, g.last_synced_at)
     WHERE id = p_garde;
    UPDATE inventaire
       SET vinted_item_id = g.vinted_item_id, vinted_status = g.vinted_status, vinted_account_id = g.vinted_account_id,
           disparu_le = g.disparu_le
     WHERE id = p_absorbe;
    v_champs := v_champs || jsonb_build_object('vinted_identite', jsonb_build_object(
      'echange', true,
      'avant', jsonb_build_object('vinted_item_id', g.vinted_item_id, 'vinted_status', g.vinted_status,
                                  'vinted_account_id', g.vinted_account_id, 'vinted_catalog_id', g.vinted_catalog_id,
                                  'vinted_view_count', g.vinted_view_count, 'vinted_favourite_count', g.vinted_favourite_count,
                                  'listed_at_guess', g.listed_at_guess, 'disparu_le', g.disparu_le, 'last_synced_at', g.last_synced_at),
      'apres', jsonb_build_object('vinted_item_id', a.vinted_item_id, 'vinted_status', a.vinted_status,
                                  'vinted_account_id', a.vinted_account_id, 'vinted_catalog_id', a.vinted_catalog_id,
                                  'vinted_view_count', a.vinted_view_count, 'vinted_favourite_count', a.vinted_favourite_count,
                                  'listed_at_guess', a.listed_at_guess, 'disparu_le', a.disparu_le, 'last_synced_at', a.last_synced_at)));
  END IF;

  UPDATE inventaire SET fusionne_dans = p_garde, fusionne_le = now() WHERE id = p_absorbe;

  INSERT INTO inventaire_fusions (user_id, garde, absorbe, deplacements, champs_repris, par)
  VALUES (v_user, p_garde, p_absorbe, v_dep, v_champs, COALESCE(NULLIF(p_par, ''), 'utilisateur')) -- MODIF 2026-09-25
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('ok', true, 'fusion_id', v_id, 'garde', p_garde, 'absorbe', p_absorbe,
                            'deplacements', v_dep, 'champs_repris', v_champs);
END;
$function$;

DELETE FROM public.inventaire_doublons
 WHERE motif = 'remise_en_ligne_vente_annulee' AND statut = 'proposee' AND decide_par IS NULL;

DROP FUNCTION IF EXISTS public.remise_annulee_questions(uuid, integer);
DROP FUNCTION IF EXISTS public.remise_annulee_question_poser(uuid, bigint);
DROP FUNCTION IF EXISTS public.vinted_remise_apres_annulation(bigint, bigint);
DROP FUNCTION IF EXISTS public.vente_annulee_prouvee(uuid, bigint);
