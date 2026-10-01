-- ═══════════════════════════════════════════════════════════════════════════
-- 5 VENTES eBAY NON VUES — ENREGISTRÉES PAR LA VOIE NORMALE (01/10, GO Nico)
-- ═══════════════════════════════════════════════════════════════════════════
-- Relevé Browse des 1 577 annonces eBay suivies (01/10 matin) : 6 annonces à
-- « 0 disponible / 1 vendu » dont la fiche était encore en stock. Ces annonces
-- SONT terminées chez eBay (date de fin présente) : la règle de la veille les
-- aurait vues, mais la veille ne passait jamais sur elles (lecture bornée à
-- 500 lignes sans ordre), et quand elle les voyait (2 sur 6) elle ne posait
-- qu'un drapeau — un bandeau « Vendue » que personne n'a confirmé.
-- jocabroc8 : 3 articles encore en ligne sur Leboncoin / Vinted.
--
-- Relu chez eBay pour CHACUNE juste avant d'écrire (Browse, jeton applicatif,
-- 01/10 11:42 Paris) : OUT_OF_STOCK, 0 disponible, 1 vendu, fin présente.
-- lesforcesdelaudela 407226713076 : PAS ici — sa vente est déjà enregistrée
-- (ventes 52666, relevé des ventes eBay du 27/09) ; jamais de seconde vente.
--
-- La voie normale d'une vente détectée : la détection pose sur le job eBay
-- ce que la veille pose (sale_signal, detected_price, vente_ebay) plus la
-- preuve exacte (sale_evidence), puis enregistrer_vente_atomique(p_job) — la
-- fonction qu'appellent orchestrateSale (bouton « Vendue » de l'app) et
-- l'enregistrement automatique des ventes sûres. Elle refuse d'elle-même un
-- article déjà vendu ou une vente déjà liée, et arme les retraits des copies
-- PROUVÉES des autres plateformes ; l'extension les exécute. Aucun retrait
-- n'est écrit ici. Rejeu annulé : 5 ventes ok ; 4 retraits armés par la règle serveur
-- (vente_article_serveur) — jocabroc8 Leboncoin ×2 et Vinted ×2, tous avec numéro et
-- lien exacts ; grisette11 : aucune copie ailleurs.
-- Inverse : 20261001_ventes_ebay_non_vues_INVERSE.sql
-- ═══════════════════════════════════════════════════════════════════════════
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '30s';

CREATE TABLE IF NOT EXISTS public._backup_0110_ventes_ebay (
  job_id uuid PRIMARY KEY, job jsonb NOT NULL, fiche jsonb NOT NULL, resultat jsonb, le timestamptz NOT NULL DEFAULT now());
ALTER TABLE public._backup_0110_ventes_ebay ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_0110_ventes_ebay FROM PUBLIC, anon, authenticated;

CREATE TEMP TABLE _ventes (ordre int, job_id uuid, lid text, prix numeric, vendus int, fin text) ON COMMIT DROP;
INSERT INTO _ventes VALUES
  (1, 'a9c645a3-ad5e-44c4-876b-eadc431b6976', '407251539538', 20.00, 1, '2026-09-29T07:56:10.000Z'),  -- jocabroc8
  (2, '9201fbb4-7570-43e4-a7e7-cd4a25a3442e', '407254679488', 15.00, 1, '2026-09-30T14:26:29.000Z'),  -- jocabroc8
  (3, '982ac655-a4b0-44ef-a10d-d4cd586cb369', '407176376356', 40.00, 1, '2026-09-30T13:47:48.000Z'),  -- jocabroc8
  (4, '08bc4047-c5e0-4bdf-9bc7-ff9a7f65a088', '336794472727', 47.50, 1, '2026-09-27T18:27:14.000Z'),  -- grisette11
  (5, 'd2ca2c1b-a22c-47c1-802e-4d2f500a34a7', '336794488577', 31.90, 1, '2026-09-25T15:44:15.000Z'); -- grisette11

DO $v$
DECLARE r record; j cross_post_jobs%ROWTYPE; i inventaire%ROWTYPE; v_res jsonb;
BEGIN
  FOR r IN SELECT * FROM _ventes ORDER BY ordre LOOP
    SELECT * INTO j FROM cross_post_jobs WHERE id = r.job_id;
    SELECT * INTO i FROM inventaire WHERE id = j.inventaire_id;
    -- Gardes : l'annonce est bien celle-là, toujours suivie, et l'article
    -- n'est marqué vendu nulle part.
    IF j.id IS NULL OR j.platform <> 'ebay' OR j.status <> 'published' OR j.platform_listing_id IS DISTINCT FROM r.lid
       OR i.id IS NULL OR i.statut <> 'stock' OR i.fusionne_dans IS NOT NULL
       OR EXISTS (SELECT 1 FROM ventes v WHERE v.inventaire_id = i.id)
       OR EXISTS (SELECT 1 FROM ventes_operations o WHERE o.inventaire_id = i.id OR o.cle = 'annonce:ebay:' || r.lid)
       OR EXISTS (SELECT 1 FROM cross_post_jobs x WHERE x.inventaire_id = i.id AND x.status = 'sold') THEN
      RAISE NOTICE 'vente % (%) NON écrite : état inattendu ou déjà vendue', r.ordre, r.lid;
      CONTINUE;
    END IF;
    INSERT INTO public._backup_0110_ventes_ebay (job_id, job, fiche) VALUES (j.id, to_jsonb(j), to_jsonb(i))
      ON CONFLICT (job_id) DO NOTHING;
    UPDATE cross_post_jobs SET platform_fields = COALESCE(platform_fields, '{}'::jsonb)
      || jsonb_build_object(
           'sale_signal', 'sold',
           'unavailable_since', COALESCE(platform_fields ->> 'unavailable_since', now()::text),
           'detected_price', r.prix,
           'vente_ebay', jsonb_build_object('fin', r.fin, 'vendus', r.vendus, 'prix', r.prix, 'vu_le', '2026-10-01T09:42:20Z'),
           'sale_evidence', jsonb_build_object('platform', 'ebay', 'listing_id', r.lid, 'state', 'sold', 'exact', true,
                              'source', 'browse_api', 'vendus', r.vendus, 'disponible', 0, 'fin', r.fin,
                              'lu_le', '2026-10-01T09:42:20Z', 'par', 'reparation 20261001 point 1'))
     WHERE id = j.id;
    v_res := public.enregistrer_vente_atomique(j.user_id, NULL, p_job := j.id, p_prix := r.prix);
    UPDATE public._backup_0110_ventes_ebay SET resultat = v_res WHERE job_id = j.id;
    RAISE NOTICE 'vente % (%) : %', r.ordre, r.lid, v_res;
  END LOOP;
END $v$;

SELECT b.job_id, b.job ->> 'platform_listing_id' AS annonce, b.resultat ->> 'ok' AS ok,
       b.resultat ->> 'retraitsArmes' AS retraits_armes, b.resultat ->> 'siblingsCancelled' AS publications_arretees,
       b.resultat ->> 'reason' AS raison
  FROM public._backup_0110_ventes_ebay b ORDER BY b.le;
COMMIT;
