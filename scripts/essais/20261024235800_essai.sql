-- Essai à blanc de 20261024235800 : ROLLBACK, rien ne reste.
begin;
set local statement_timeout = '120s';
-- ═══════════════════════════════════════════════════════════════════════════
-- 20261024235800_remise_en_vente_contenu_de_la_fiche
-- (24/10 nuit — preuve en réel sur le short de Nico) Deux trous du parcours « Vente annulée — Remettre en vente ? » :
--   1. après l'appui (22:18:36), la remise Vinted a créé un job SANS photo ni prix (6c02755d) : elle copiait le contenu du
--      job source — ici une ancienne republication du 26/09 (titre seul) — et la publication a échoué. RÈGLE : le job de
--      remise prend le contenu de la FICHE (titre, description, prix, photos) quand le job source n'en a pas ; un job
--      source complet garde le sien, comme avant ;
--   2. (Nico, 22:2x) « qu'on détecte s'il est remis en ligne via Vinted directement » : AVANT l'appui, un article remis en
--      ligne directement sur la plateforme (par le vendeur ou par la plateforme) voit sa proposition se fermer « déjà en
--      vente » — la carte dit « Déjà remis en ligne : ton annonce est rattachée, rien n'a été republié ».
-- Corps de remises_en_vente_tick réécrit depuis pg_get_functiondef EN PROD (24/10 22:30, après 20261024234000), deux
-- remplacements exacts (scratchpad generer-235800.cjs). Aucun mail, aucune notification.
-- Application (feu vert NOMMÉ de Nico) :
--   npx supabase db query --linked -f supabase/migrations/20261024235800_remise_en_vente_contenu_de_la_fiche.sql
--   npx supabase migration repair --linked --status applied 20261024235800
-- Essai à blanc : scripts/essais/20261024235800_essai.sql — Inverse : supabase/rollbacks/20261024235800_remise_en_vente_contenu_de_la_fiche_INVERSE.sql
-- ═══════════════════════════════════════════════════════════════════════════

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
BEGIN
  SELECT pct INTO v_cpu FROM veille_cpu WHERE pct IS NOT NULL ORDER BY le DESC LIMIT 1;
  IF v_cpu IS NOT NULL AND v_cpu > 50 THEN
    RETURN jsonb_build_object('issue', 'saute_cpu', 'cpu', v_cpu);
  END IF;
  SELECT value INTO v_sortie FROM coin_config WHERE key = 'opla_sortie_le';
  SELECT value INTO v_prix FROM coin_config WHERE key = 'price_per_platform';

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

  FOR r IN
    SELECT * FROM remises_en_vente
     WHERE statut = 'a_faire' AND prochain_essai <= now()
       AND (p_user IS NULL OR user_id = p_user)
     ORDER BY prochain_essai
     LIMIT GREATEST(1, LEAST(p_limite, 50))
     FOR UPDATE SKIP LOCKED
  LOOP
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
                AND a.statut_plateforme = 'en_ligne' AND a.disparu_le IS NULL AND a.vu_le > COALESCE(j.sold_at, now()))) THEN
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

    IF v_motif IS NULL THEN
      BEGIN
        INSERT INTO cross_post_jobs (user_id, inventaire_id, platform, status, action, photo_option,
                                     title, description, price, photos, platform_fields)
        VALUES (r.user_id, r.inventaire_id, r.platform, 'pending', 'publish', COALESCE(j.photo_option, 'original'),
                -- (24/10 nuit, le short de Nico) Le contenu de la FICHE quand le job source n'en a pas (annonce importée du
                -- dressing, ancienne republication) : jamais une publication sans titre, sans prix ou sans photo.
                coalesce(nullif(btrim(j.title), ''), i.titre), coalesce(nullif(btrim(j.description), ''), i.description),
                coalesce(j.price, i.prix_vente),
                CASE WHEN jsonb_typeof(j.photos) = 'array' AND jsonb_array_length(j.photos) > 0 THEN j.photos
                     WHEN jsonb_typeof(i.photos) = 'array' THEN i.photos ELSE j.photos END,
                remise_en_vente_champs(j.platform_fields) || jsonb_build_object('remise_en_vente',
                  jsonb_build_object('apres_vente_job', j.id, 'annonce_vendue', NULLIF(btrim(j.platform_listing_id), ''),
                                     'vente', j.platform_fields->>'vente_operation_cle',
                                     'restant', v_restant, 'apres_annulation', v_annul, 'le', now()))
                || CASE WHEN v_annul THEN jsonb_build_object('hors_quota', true) ELSE '{}'::jsonb END)
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
        'restant', v_restant, 'apres_annulation', v_annul));
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
                            'abandonnees', v_abandons, 'cpu', v_cpu);
END;
$function$;


-- Essai à blanc de 20261024235800 — joué APRÈS le corps de la migration, puis ROLLBACK. Une remise « à faire », sans
-- condition d'attente, dont le job source n'a ni prix ni photo : le job créé prend le contenu de la fiche.
create temp table _r (essai text, ok boolean, detail text) on commit drop;
-- Fiche et job source FICTIFS du compte de Nico (créés et effacés dans la transaction).
insert into inventaire (id, user_id, titre, description, prix_vente, photos, statut, quantite)
values (999000000000777, 'f44b5917-bccc-4431-ba41-f40571a2ed18', 'essai remise fiche', 'description de la fiche', 999,
        '[{"url":"https://exemple.invalid/a.jpg"},{"url":"https://exemple.invalid/b.jpg"}]'::jsonb, 'stock', 1);
insert into cross_post_jobs (id, user_id, inventaire_id, platform, action, status, title, price, photos, platform_fields)
values ('00000000-0000-4000-8000-000000000777', 'f44b5917-bccc-4431-ba41-f40571a2ed18', 999000000000777, 'beebs', 'publish', 'cancelled',
        'titre du job source', null, '[]'::jsonb, jsonb_build_object('vente_annulee_remise', jsonb_build_object('le', now() - interval '30 minutes')));
insert into remises_en_vente (user_id, inventaire_id, platform, job_vendu, statut, prochain_essai)
values ('f44b5917-bccc-4431-ba41-f40571a2ed18', 999000000000777, 'beebs', '00000000-0000-4000-8000-000000000777', 'a_faire', now() - interval '1 minute');
-- Un relevé Beebs « fait » maintenant (la remise attend un relevé après l'annulation) — gardes d'insertion contournées
-- dans la transaction seulement (rien ne reste).
set local session_replication_role = replica;
insert into vinted_sync_runs (user_id, kind, platform, status, declencheur, queued_at, started_at, finished_at, items_vus, total_entries)
values ('f44b5917-bccc-4431-ba41-f40571a2ed18', 'annonces', 'beebs', 'done', 'app', now(), now(), now(), 5, 5);
set local session_replication_role = origin;
select public.remises_en_vente_tick(50, 'f44b5917-bccc-4431-ba41-f40571a2ed18');
insert into _r select 'E1 un job est créé pour la remise', count(*) = 1, string_agg(j.status || ' ' || j.action, ' ; ')
  from cross_post_jobs j where j.inventaire_id = 999000000000777 and j.id <> '00000000-0000-4000-8000-000000000777';
insert into _r select 'E2 le titre du job source est gardé (il en avait un)', bool_and(j.title = 'titre du job source'), string_agg(j.title, ' ; ')
  from cross_post_jobs j where j.inventaire_id = 999000000000777 and j.id <> '00000000-0000-4000-8000-000000000777';
insert into _r select 'E3 prix et photos : ceux de la FICHE (le job source n''en avait pas)',
  bool_and(j.price = 999 and jsonb_array_length(j.photos) = 2 and j.description = 'description de la fiche'), string_agg(coalesce(j.price::text, '∅') || ' / ' || jsonb_array_length(coalesce(j.photos, '[]'::jsonb)), ' ; ')
  from cross_post_jobs j where j.inventaire_id = 999000000000777 and j.id <> '00000000-0000-4000-8000-000000000777';
-- AVANT l'appui : l'annonce Vinted vendue revue ACTIVE après l'annulation (remise en ligne directement sur Vinted) →
-- la proposition se ferme « déjà en vente », rien n'est republié.
insert into cross_post_jobs (id, user_id, inventaire_id, platform, action, status, title, price, photos, platform_listing_id, platform_fields)
values ('00000000-0000-4000-8000-000000000778', 'f44b5917-bccc-4431-ba41-f40571a2ed18', 999000000000777, 'vinted', 'publish', 'cancelled',
        'essai vinted', 10, '[]'::jsonb, '999000777', jsonb_build_object('vente_annulee_remise', jsonb_build_object('le', now() - interval '30 minutes')));
insert into remises_en_vente (user_id, inventaire_id, platform, job_vendu, statut, prochain_essai)
values ('f44b5917-bccc-4431-ba41-f40571a2ed18', 999000000000777, 'vinted', '00000000-0000-4000-8000-000000000778', 'proposee', now());
insert into vinted_listing_snapshots (user_id, vinted_item_id, status, captured_at, captured_on)
values ('f44b5917-bccc-4431-ba41-f40571a2ed18', '999000777', 'active', now() - interval '5 minutes', current_date);
select public.remises_en_vente_tick(50, 'f44b5917-bccc-4431-ba41-f40571a2ed18');
insert into _r select 'E4 remis en ligne directement sur Vinted (avant l''appui) → « déjà en vente », rien republié',
  bool_and(r.statut = 'abandonnee' and r.motif = 'deja_en_vente')
  and not exists (select 1 from cross_post_jobs c where c.inventaire_id = 999000000000777 and c.platform = 'vinted' and c.status = 'pending'),
  string_agg(r.statut || ':' || coalesce(r.motif, '∅'), ' ; ')
  from remises_en_vente r where r.job_vendu = '00000000-0000-4000-8000-000000000778';
insert into _r select 'E5 une proposition dont l''annonce n''est PAS revue en ligne reste proposée (le short n''est pas touché)',
  count(*) = 0, count(*)::text from remises_en_vente r where r.inventaire_id = 1785871917724004 and r.statut = 'abandonnee' and r.traite_le = now();
select essai, ok, left(detail, 300) detail from _r order by essai;

rollback;
