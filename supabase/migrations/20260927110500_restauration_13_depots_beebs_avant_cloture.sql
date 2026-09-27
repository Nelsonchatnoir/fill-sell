-- ═══════════════════════════════════════════════════════════════════════════
-- ANNULATION DE LA CLÔTURE beebs-lien v2 DU 27/09 12:00 — 13 DÉPÔTS BEEBS
-- APPLIQUÉE le 27/09 à 12:50 (décision de Nico, point B) après rejeu annulé :
-- 13/13 remis (4 failed, 9 published), dc5863cd et ff51cea9 égaux à l'origine.
-- ═══════════════════════════════════════════════════════════════════════════
-- Décision de Nico (27/09, point B) : remettre les 13 dépôts Beebs clos par
-- beebs_index_constat (ornellaracano 10, thomas.vinted590002 1, gabyaviat10700
-- 1, voirememe 1) EXACTEMENT dans l'état d'avant 12:00. C'est l'annulation de
-- notre propre écriture, pas une décision sur un job : on défait ce que la
-- fonction a fait, et rien d'autre.
--
-- CE QUE LA CLÔTURE AVAIT ÉCRIT (20260927103000) :
--   status 'cancelled', error « Beebs n'a pas mis cette annonce en ligne … tu
--   peux la republier », platform_fields - 'listing_url_abandon'
--   || {beebs_index, verdict_moderation}. Aucun autre champ, aucune autre table
--   (vérifié : 0 ligne coin_ledger, réservation déjà réglée le 10/08, aucun
--   nouveau job sur ces articles, aucune relance).
-- CE QUE CETTE MIGRATION REMET :
--   status et error d'origine ; platform_fields = actuel - beebs_index -
--   verdict_moderation, + listing_url_abandon d'origine là où il existait.
--   Prouvé sur dc5863cd et ff51cea9, relus en entier à 10:50 : égalité jsonb
--   stricte avec l'objet d'origine (rejeu).
-- ⚠️ SEULE VALEUR IRRÉCUPÉRABLE : pour 6 dépôts d'ornellaracano publiés le
--   20/09 (ef9ecf74, c5debbca, c78ec904, e5f68f81, 615bd96a, bcc3b32a), le
--   marqueur listing_url_abandon posé par le balayage des 18-20/09 portait une
--   clé « repere » (date du dépôt jugé alors) qu'aucune lecture ni sauvegarde
--   n'a gardée. Le marqueur est remis avec son « at » exact (relu à 10:55) et
--   son « refund » (déterministe : jobs sans réservation), sans « repere » —
--   rien ne l'invente. Aucun code ne lit cette clé (seule la PRÉSENCE du
--   marqueur est lue : StockTab, get-pending-jobs, beebs-lien).
-- Triggers : désactivés le temps de l'écriture (session_replication_role =
--   replica) — la clôture n'avait déclenché aucun effet (vérifié), la
--   restauration n'en déclenche aucun non plus. Aucun redépôt, aucun message
--   « republier », aucun autre job touché : garde sur l'état clos exact.

BEGIN;
SET LOCAL session_replication_role = replica;

CREATE TEMP TABLE _restau_beebs (id uuid PRIMARY KEY, statut text NOT NULL, erreur text, abandon jsonb, source text) ON COMMIT DROP;
INSERT INTO _restau_beebs VALUES
    ('dc5863cd-fb3d-4aca-bd7e-1de68a64f5d2'::uuid, 'failed', 'Publication non confirmée : ton annonce n''a pas pu être retrouvée en ligne sur Beebs — on n''a jamais réussi à récupérer son lien, donc on ne peut ni suivre sa vente ni la retirer pour toi. Cette publication ne compte pas dans tes limites. ⚠️ AVANT DE REPUBLIER, va vérifier tes annonces sur Beebs : si elle y est déjà, republier en créerait une deuxième.', '{"at":"2026-09-27T03:30:00.562722+00:00","refund":{"raison":"sans_reservation","rembourse":0},"repere":"2026-09-19T20:41:12.846+00:00"}'::jsonb, 'relu le 27/09 10:50 (objet complet)'),
    ('ff51cea9-b41d-47b6-8099-679feb7589d6'::uuid, 'failed', 'Publication non confirmée : ton annonce n''a pas pu être retrouvée en ligne sur Beebs — on n''a jamais réussi à récupérer son lien, donc on ne peut ni suivre sa vente ni la retirer pour toi. Cette publication ne compte pas dans tes limites. ⚠️ AVANT DE REPUBLIER, va vérifier tes annonces sur Beebs : si elle y est déjà, republier en créerait une deuxième.', '{"at":"2026-09-27T03:30:00.562722+00:00","refund":{"raison":"sans_reservation","rembourse":0},"repere":"2026-09-19T22:41:11.605+00:00"}'::jsonb, 'relu le 27/09 10:50 (objet complet)'),
    ('f9af3430-78e1-4a67-aa44-737c604cadde'::uuid, 'failed', 'Publication non confirmée : ton annonce n''a pas pu être retrouvée en ligne sur Beebs — on n''a jamais réussi à récupérer son lien, donc on ne peut ni suivre sa vente ni la retirer pour toi. Cette publication ne compte pas dans tes limites. ⚠️ AVANT DE REPUBLIER, va vérifier tes annonces sur Beebs : si elle y est déjà, republier en créerait une deuxième.', '{"at":"2026-09-24T03:30:00.503907+00:00","refund":{"raison":"sans_reservation","rembourse":0},"repere":"2026-09-16T18:39:03.921+00:00"}'::jsonb, 'at relu 27/09 11:00 ; repere = published_at ; sans réservation'),
    ('33ba3648-47ab-4439-9d77-14a76ceae41a'::uuid, 'failed', 'Publication non confirmée : ton annonce n''a pas pu être retrouvée en ligne sur Beebs — on n''a jamais réussi à récupérer son lien, donc on ne peut ni suivre sa vente ni la retirer pour toi. Cette publication ne compte pas dans tes limites. ⚠️ AVANT DE REPUBLIER, va vérifier tes annonces sur Beebs : si elle y est déjà, republier en créerait une deuxième.', '{"at":"2026-09-25T03:30:00.331956+00:00","refund":{"raison":"sans_reservation","rembourse":0},"repere":"2026-09-17T10:29:54.636+00:00"}'::jsonb, 'at relu 27/09 11:00 ; repere = published_at ; sans réservation'),
    ('033f67d4-5107-4854-aacf-de920659ab14'::uuid, 'published', NULL, (select b.platform_fields->'listing_url_abandon' from public.sauvegarde_ornella_20260910 b where b.id = '033f67d4-5107-4854-aacf-de920659ab14'::uuid and b.platform_fields->'listing_url_abandon'->>'at' = '2026-09-09T13:08:20.982785+00:00'), 'sauvegarde du 10/09, at vérifié'),
    ('8f5b62db-91f7-453b-a012-c1e9f68326a4'::uuid, 'published', NULL, (select b.platform_fields->'listing_url_abandon' from public.sauvegarde_ornella_20260910 b where b.id = '8f5b62db-91f7-453b-a012-c1e9f68326a4'::uuid and b.platform_fields->'listing_url_abandon'->>'at' = '2026-09-09T13:08:20.982785+00:00'), 'sauvegarde du 10/09, at vérifié'),
    ('ef9ecf74-5e70-4baf-a7b4-ecd4afb4cbf1'::uuid, 'published', NULL, '{"at":"2026-09-18T03:30:00.353418+00:00","refund":{"raison":"sans_reservation","rembourse":0}}'::jsonb, 'at relu 27/09 10:55 ; repere introuvable'),
    ('c5debbca-9b85-4df5-bdb6-71697f02f032'::uuid, 'published', NULL, '{"at":"2026-09-19T03:30:00.312998+00:00","refund":{"raison":"sans_reservation","rembourse":0}}'::jsonb, 'at relu 27/09 10:55 ; repere introuvable'),
    ('c78ec904-5023-4bc5-8187-43b1dbd64fc0'::uuid, 'published', NULL, '{"at":"2026-09-19T03:30:00.312998+00:00","refund":{"raison":"sans_reservation","rembourse":0}}'::jsonb, 'at relu 27/09 10:55 ; repere introuvable'),
    ('e5f68f81-cec7-4a78-8029-e1a2f8844aec'::uuid, 'published', NULL, '{"at":"2026-09-19T03:30:00.312998+00:00","refund":{"raison":"sans_reservation","rembourse":0}}'::jsonb, 'at relu 27/09 10:55 ; repere introuvable'),
    ('615bd96a-f98a-4fc3-9f4b-fbb7b0918d04'::uuid, 'published', NULL, '{"at":"2026-09-20T03:30:00.307521+00:00","refund":{"raison":"sans_reservation","rembourse":0}}'::jsonb, 'at relu 27/09 10:55 ; repere introuvable'),
    ('bcc3b32a-d90c-48f1-a094-2725874c27ff'::uuid, 'published', NULL, '{"at":"2026-09-20T03:30:00.307521+00:00","refund":{"raison":"sans_reservation","rembourse":0}}'::jsonb, 'at relu 27/09 10:55 ; repere introuvable'),
    ('586a9752-10c7-47b0-af9f-e7cf8cdac07d'::uuid, 'published', NULL, NULL::jsonb, 'relu le 27/09 10:58 (p11/sanslien.json), aucun marqueur');

DO $$
DECLARE v_n int; v_sans int;
BEGIN
  SELECT count(*) INTO v_n FROM _restau_beebs;
  IF v_n <> 13 THEN RAISE EXCEPTION 'attendu 13 lignes, trouvé %', v_n; END IF;
  SELECT count(*) INTO v_sans FROM _restau_beebs WHERE abandon IS NULL AND id <> '586a9752-10c7-47b0-af9f-e7cf8cdac07d';
  IF v_sans > 0 THEN RAISE EXCEPTION 'marqueur d''origine introuvable pour % job(s)', v_sans; END IF;
  SELECT count(*) INTO v_n
    FROM cross_post_jobs c JOIN _restau_beebs r ON r.id = c.id
   WHERE c.platform = 'beebs' AND c.status = 'cancelled' AND c.listing_url IS NULL
     AND c.platform_fields->'verdict_moderation'->>'preuve' = 'absente_de_l_index_beebs'
     AND NOT (c.platform_fields ? 'listing_url_abandon');
  IF v_n <> 13 THEN RAISE EXCEPTION 'les 13 jobs ne sont plus dans l''état clos exact (% sur 13) : rien n''est écrit', v_n; END IF;
END $$;

UPDATE cross_post_jobs c SET
  status = r.statut,
  error = r.erreur,
  platform_fields = (c.platform_fields - 'beebs_index' - 'verdict_moderation')
    || CASE WHEN r.abandon IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('listing_url_abandon', r.abandon) END
  FROM _restau_beebs r
 WHERE c.id = r.id AND c.platform = 'beebs' AND c.status = 'cancelled' AND c.listing_url IS NULL
   AND c.platform_fields->'verdict_moderation'->>'preuve' = 'absente_de_l_index_beebs';

COMMIT;
