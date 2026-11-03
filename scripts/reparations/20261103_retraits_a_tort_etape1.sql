-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- ⛔ PRÉPARÉ le 03/11 soir — NON JOUÉ. Feu vert nommé de Nico requis (rapport docs/enquetes/retraits-a-tort-0311/RAPPORT.md).
-- ÉTAPE 1 de la remise en état — AUCUNE action chez Vinted, Leboncoin ou Beebs, aucun mail, aucun quota. Elle rend aux
-- fiches leur état d'avant l'erreur ; l'étape 2 (remettre en ligne les 11 annonces retirées) attend la décision de Nico
-- sur son mécanisme (rapport § « Ce qui reste »).
--
-- A. POINT 1 — 7 fusions « Déjà vendu ? → oui » défaites (inventaire_defusionner_pour, la fonction de « défaire » de
--    l'app) : chaque annonce retirée à tort revient sur SA fiche, au stock, la fiche vendue garde sa vente.
--      JEAN-LUC LASSARAT (9256e3ae) : a58f5a66 perceuse TITAN (LBC 3224766875), d4808731 boîte à pharmacie (LBC 3233436490),
--        8efe10f8 chiffons Blumtal (LBC 3224902464), 06981200 boîte à pâtes (LBC 3243205231), 17c7575a éponge (LBC 3294205838).
--      Dylan Fontaine (379aa8a7) : ee018453 Arcanin (Beebs 34285076), a1958b1b Roublenard (Beebs 34284932).
--    NON défaites (retraits JUSTES, vente prouvée après la mise en ligne, même objet) : Dracaufeu V (Dylan, 39fe7a9d,
--    même photo, vendu sur Vinted le 03/11) et Polly Pocket (louis-seller, vendu sur Leboncoin le 24/10).
-- B. POINT 2 — 5 ventes Leboncoin du 03/11 18:15-18:17 comptées une SECONDE fois (la vraie est dans l'historique, lue
--    sur la page des transactions) : retirées (ventes_supprimees, motif vente_comptee_deux_fois), fiche au stock, job
--    Leboncoin « publié » (l'annonce est toujours en ligne), drapeau marqué vendu_avant_suivi.
--      427655 balance Terraillon (vraie vente 14/10, 367334041) · 427656 boîte à café (02/08, 351643300) ·
--      427657 serviette LEUS (12/05, 335972680) · 427823 boîte à café marron (02/08, 351643092) ·
--      427824 scie sabre ERBAUER (04/08, 352000650).
-- Sauvegardes : public._backup_0311_retraits_a_tort_* ; inverse : …_etape1_INVERSE.sql.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
SET LOCAL fillsell.sans_retrait = '1';          -- aucun retrait ne naît de cette réparation

CREATE TEMPORARY TABLE _fusions (fusion uuid PRIMARY KEY, user_id uuid NOT NULL, depot uuid NOT NULL, numero text NOT NULL) ON COMMIT DROP;
INSERT INTO _fusions VALUES
  ('a58f5a66-4431-4b3f-b2b3-9c498b99e233', '9256e3ae-48e4-4a3a-be66-65fd2e28b418', '58277ad6-1501-4dbe-b521-07f334cdb47e', '3224766875'),
  ('d4808731-e062-440e-9e11-b005403b0829', '9256e3ae-48e4-4a3a-be66-65fd2e28b418', 'e8051b29-2fa7-4566-8f62-c0643c182354', '3233436490'),
  ('8efe10f8-a088-4edc-8940-aab34b994c67', '9256e3ae-48e4-4a3a-be66-65fd2e28b418', '048da100-4597-4f0a-b4ed-d5bcecdc588c', '3224902464'),
  ('06981200-2fc9-4781-b678-d9b157f3543d', '9256e3ae-48e4-4a3a-be66-65fd2e28b418', 'a70a7d4c-9100-4996-b063-04e21d090ffa', '3243205231'),
  ('17c7575a-aa3e-40ce-9b74-14f305b27bf3', '9256e3ae-48e4-4a3a-be66-65fd2e28b418', 'd503d681-5d6d-4895-baa2-54035d286655', '3294205838'),
  ('ee018453-c580-42fe-80be-f8faed99986d', '379aa8a7-0c37-4134-b1fd-de5e0fb7c1e4', '324a6bbf-5492-4c0d-80bc-d697a7e49d99', '34285076'),
  ('a1958b1b-6b4a-47bb-8506-803420649343', '379aa8a7-0c37-4134-b1fd-de5e0fb7c1e4', 'e4b6e618-f66a-40be-b219-c299eb124003', '34284932');

CREATE TEMPORARY TABLE _ventes (vente bigint PRIMARY KEY, numero text NOT NULL, vraie_commande text NOT NULL) ON COMMIT DROP;
INSERT INTO _ventes VALUES (427655, '3229358938', '367334041'), (427656, '3243204568', '351643300'), (427657, '3196752135', '335972680'),
                           (427823, '3243204300', '351643092'), (427824, '3224866836', '352000650');

-- ── Sauvegardes ─────────────────────────────────────────────────────────────────────────────────────────────────
CREATE TABLE public._backup_0311_retraits_a_tort_fusions AS SELECT now() AS sauvegarde_le, f.* FROM public.inventaire_fusions f WHERE f.id IN (SELECT fusion FROM _fusions);
CREATE TABLE public._backup_0311_retraits_a_tort_inventaire AS SELECT now() AS sauvegarde_le, i.* FROM public.inventaire i
  WHERE i.id IN (SELECT garde FROM public.inventaire_fusions WHERE id IN (SELECT fusion FROM _fusions)
                 UNION SELECT absorbe FROM public.inventaire_fusions WHERE id IN (SELECT fusion FROM _fusions)
                 UNION SELECT inventaire_id FROM public.ventes WHERE id IN (SELECT vente FROM _ventes));
CREATE TABLE public._backup_0311_retraits_a_tort_jobs AS SELECT now() AS sauvegarde_le, c.* FROM public.cross_post_jobs c
  WHERE c.id IN (SELECT depot FROM _fusions)
     OR (c.user_id = '9256e3ae-48e4-4a3a-be66-65fd2e28b418' AND c.platform = 'leboncoin' AND c.status = 'sold'
         AND btrim(c.platform_listing_id) IN (SELECT numero FROM _ventes));
CREATE TABLE public._backup_0311_retraits_a_tort_annonces AS SELECT now() AS sauvegarde_le, a.* FROM public.annonces_plateforme a
  WHERE a.id IN (SELECT (x)::uuid FROM public.inventaire_fusions f, jsonb_array_elements_text(COALESCE(f.deplacements -> 'annonces_plateforme', '[]'::jsonb)) x
                  WHERE f.id IN (SELECT fusion FROM _fusions));
CREATE TABLE public._backup_0311_retraits_a_tort_doublons AS SELECT now() AS sauvegarde_le, d.* FROM public.inventaire_doublons d
  WHERE d.fusion_id IN (SELECT fusion FROM _fusions);
CREATE TABLE public._backup_0311_retraits_a_tort_ventes AS SELECT now() AS sauvegarde_le, v.* FROM public.ventes v WHERE v.id IN (SELECT vente FROM _ventes);
CREATE TABLE public._backup_0311_retraits_a_tort_operations AS SELECT now() AS sauvegarde_le, o.* FROM public.ventes_operations o
  WHERE o.user_id = '9256e3ae-48e4-4a3a-be66-65fd2e28b418' AND o.cle IN (SELECT 'annonce:leboncoin:' || numero FROM _ventes);
ALTER TABLE public._backup_0311_retraits_a_tort_fusions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public._backup_0311_retraits_a_tort_inventaire ENABLE ROW LEVEL SECURITY;
ALTER TABLE public._backup_0311_retraits_a_tort_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public._backup_0311_retraits_a_tort_annonces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public._backup_0311_retraits_a_tort_doublons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public._backup_0311_retraits_a_tort_ventes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public._backup_0311_retraits_a_tort_operations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public._backup_0311_retraits_a_tort_fusions, public._backup_0311_retraits_a_tort_inventaire,
  public._backup_0311_retraits_a_tort_jobs, public._backup_0311_retraits_a_tort_annonces, public._backup_0311_retraits_a_tort_doublons,
  public._backup_0311_retraits_a_tort_ventes, public._backup_0311_retraits_a_tort_operations FROM PUBLIC, anon, authenticated;

-- ── Gardes : relues juste avant, rien ne part si l'état a bougé ─────────────────────────────────────────────────────
DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM public._backup_0311_retraits_a_tort_fusions f JOIN _fusions k ON k.fusion = f.id AND k.user_id = f.user_id
   WHERE f.defait_le IS NULL AND f.par = 'utilisateur (doublon proposé)' AND (f.deplacements -> 'cross_post_jobs') ? k.depot::text;
  IF n <> 7 THEN RAISE EXCEPTION '7 fusions vivantes du 03/11 attendues, % trouvée(s)', n; END IF;
  SELECT count(*) INTO n FROM public.cross_post_jobs d JOIN _fusions k ON d.platform_fields #>> '{arme_par,depot}' = k.depot::text
   WHERE d.action = 'delete' AND d.status = 'deleted' AND d.platform_fields #>> '{arme_par,chemin}' = 'publie_apres_vente_serveur';
  IF n <> 7 THEN RAISE EXCEPTION '7 retraits faits (publie_apres_vente_serveur) attendus, % trouvé(s)', n; END IF;
  SELECT count(*) INTO n FROM public._backup_0311_retraits_a_tort_ventes v JOIN _ventes k ON k.vente = v.id
   WHERE v.user_id = '9256e3ae-48e4-4a3a-be66-65fd2e28b418' AND v.plateforme_code = 'leboncoin' AND v.annonce_id = k.numero
     AND v.commande_ref IS NULL AND v.created_at BETWEEN '2026-11-03 17:15+00' AND '2026-11-03 17:18+00'
     AND EXISTS (SELECT 1 FROM public.ventes r WHERE r.user_id = v.user_id AND r.plateforme_code = 'leboncoin' AND r.commande_ref = k.vraie_commande);
  IF n <> 5 THEN RAISE EXCEPTION '5 ventes comptées deux fois attendues (vraie vente présente), % trouvée(s)', n; END IF;
  SELECT count(*) INTO n FROM public._backup_0311_retraits_a_tort_jobs WHERE status = 'sold';
  IF n <> 5 THEN RAISE EXCEPTION '5 jobs Leboncoin « vendus » attendus, % trouvé(s)', n; END IF;
END $$;

-- ── A. Les 7 fusions défaites ───────────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE k record; r jsonb;
BEGIN
  FOR k IN SELECT * FROM _fusions LOOP
    r := public.inventaire_defusionner_pour(k.user_id, k.fusion, 'réparation 03/11 (retrait à tort)');
    IF NOT COALESCE((r ->> 'ok')::boolean, false) THEN RAISE EXCEPTION 'fusion % : %', k.fusion, r; END IF;
    UPDATE public.cross_post_jobs SET platform_fields = COALESCE(platform_fields, '{}'::jsonb) || jsonb_build_object(
             'retrait_a_tort_0311', jsonb_build_object('le', now(), 'numero', k.numero, 'fusion_defaite', k.fusion,
               'motif', 'rattachement « Déjà vendu ? » sur une ressemblance — jamais une vente de cette annonce'))
     WHERE id = k.depot;
  END LOOP;
END $$;

-- ── B. Les 5 ventes comptées deux fois ──────────────────────────────────────────────────────────────────────────
INSERT INTO public.ventes_supprimees (user_id, plateforme_code, commande_ref, annonce_id, titre, prix_vente, vendu_le, vente_id, supprimee_le, source, motif)
SELECT v.user_id, 'leboncoin', NULL, v.annonce_id, v.titre, v.prix_vente, v.vendu_le, v.id, now(), 'reparation_0311', 'vente_comptee_deux_fois'
  FROM public._backup_0311_retraits_a_tort_ventes v;
DELETE FROM public.ventes WHERE id IN (SELECT vente FROM _ventes) AND commande_ref IS NULL;
DELETE FROM public.ventes_operations o WHERE o.user_id = '9256e3ae-48e4-4a3a-be66-65fd2e28b418' AND o.cle IN (SELECT 'annonce:leboncoin:' || numero FROM _ventes);
UPDATE public.inventaire i SET statut = 'stock', quantite = GREATEST(COALESCE(v.quantite, 1), 1)
  FROM public._backup_0311_retraits_a_tort_ventes v
 WHERE i.id = v.inventaire_id AND i.user_id = v.user_id AND i.statut = 'vendu' AND i.fusionne_dans IS NULL
   AND NOT EXISTS (SELECT 1 FROM public.ventes x WHERE x.user_id = i.user_id AND x.inventaire_id = i.id);
UPDATE public.cross_post_jobs c SET status = 'published', sold_at = NULL,
       platform_fields = (COALESCE(c.platform_fields, '{}'::jsonb)
         - ARRAY['sale_signal', 'unavailable_since', 'unavailable_pending_since', 'detected_price', 'vente_operation_cle'])
         || jsonb_build_object('vendu_avant_suivi', jsonb_build_object('le', now(), 'listing_id', btrim(c.platform_listing_id),
              'motif', 'leboncoin_vendu_des_la_premiere_lecture', 'par', 'réparation 03/11 (vente comptée deux fois)'))
 WHERE c.id IN (SELECT id FROM public._backup_0311_retraits_a_tort_jobs WHERE status = 'sold') AND c.status = 'sold';

-- Contrôle avant COMMIT.
SELECT (SELECT count(*) FROM public.inventaire_fusions WHERE id IN (SELECT fusion FROM _fusions) AND defait_le IS NOT NULL) AS fusions_defaites,
       (SELECT count(*) FROM public.ventes WHERE id IN (SELECT vente FROM _ventes)) AS ventes_restantes,
       (SELECT count(*) FROM public.cross_post_jobs WHERE id IN (SELECT id FROM public._backup_0311_retraits_a_tort_jobs WHERE status = 'sold') AND status = 'published') AS jobs_lbc_rendus;
COMMIT;
