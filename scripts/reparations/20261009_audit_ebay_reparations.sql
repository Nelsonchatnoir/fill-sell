-- ═══════════════════════════════════════════════════════════════════════════
-- AUDIT eBAY DES « VENTES À 0 VENDU » — RÉPARATIONS (09/10, GO de Nico, une par une)
-- ═══════════════════════════════════════════════════════════════════════════
-- Audit en lecture seule du 09/10 (8 ventes) ; GO de Nico sur six réparations :
--   1 et 2 (XEWER) : la vente eBay déclarée et la commande Leboncoin relevée sont
--          la MÊME cession → UNE seule vente : celle de la personne (sa saisie
--          prime : prix, prix d'achat, date, bénéfice), qui devient la vente
--          Leboncoin (plateforme, commande, date réelle) ; la ligne du relevé est
--          fusionnée dedans (trace usage_logs 'vente_fusionnee'), comme le fait
--          enregistrer_ventes_relevees depuis le 02/10.
--   3 (XEWER) : la vente 78319 (doublon de 70816, posée par un vieux job eBay
--          sans fiche) est supprimée et notée dans ventes_supprimees.
--   4 (XEWER) : la question « Déjà vendu ? » est posée sur la copie Leboncoin
--          3260299583 (Red Dead PS3) — « Oui » arme le retrait
--          (inventaire_doublon_decider → armer_retrait_job_pour, gardes comprises).
--   5 (XEWER) : la vente 96766 (doublon de la vente Vinted 96767 du même Xbox,
--          même photo) est supprimée et notée ; son prix d'achat (1 €) est DÉJÀ
--          sur 96767 (relu) ; les deux fiches sont fusionnées dans la fiche Vinted
--          (inventaire_fusionner_pour, décision de Nico sur photo) ; le job eBay
--          8288182d, terminé SANS vente chez eBay, n'est plus « vendu ».
--   8 (labouquinerie85) : lecture eBay du 09/10 (Browse) : enchère 158310494197
--          finie le 26/09 19:34 UTC, 0 vendu, 1 restant ; et AUCUNE commande chez
--          eBay pour ce compte sur 720 jours → SANS ACHETEUR. La vente 42187 est
--          annulée (supprimée, notée), la fiche revient en stock (quantité 1), le
--          job eBay n'est plus « vendu ». La republication des copies retirées le
--          25/09 (Vinted, Leboncoin, Opla) reste le geste de la personne.
-- Aucun mail, aucune notification : aucune ligne ne naît dans ventes ni dans
-- push_ventes (suppressions et mises à jour seulement ; le déclencheur de trace
-- de suppression ne vise que les sessions de l'app).
-- Sauvegarde : _backup_0910_audit_ebay (RLS activée, fermée à anon/authenticated).
-- Inverse : scripts/reparations/20261009_audit_ebay_reparations_INVERSE.sql
-- Lancer : npx supabase db query --linked -f scripts/reparations/20261009_audit_ebay_reparations.sql

BEGIN;
SET LOCAL lock_timeout = '5s';

-- ── 0. L'état attendu, sinon rien ──────────────────────────────────────────
DO $g$
BEGIN
  IF (SELECT count(*) FROM ventes WHERE id IN (10170, 30584, 35768, 76641, 78319, 96766, 96767, 42187)) <> 8 THEN
    RAISE EXCEPTION 'état inattendu : ventes';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM ventes WHERE id = 30584 AND commande_ref = '362404522' AND plateforme_code = 'leboncoin')
     OR NOT EXISTS (SELECT 1 FROM ventes WHERE id = 76641 AND commande_ref = '363140009' AND plateforme_code = 'leboncoin')
     OR NOT EXISTS (SELECT 1 FROM ventes WHERE id = 10170 AND commande_ref IS NULL AND inventaire_id = 1789717152898001)
     OR NOT EXISTS (SELECT 1 FROM ventes WHERE id = 35768 AND commande_ref IS NULL AND inventaire_id = 1789717140683002) THEN
    RAISE EXCEPTION 'état inattendu : ventes 1/2';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM ventes WHERE id = 96767 AND prix_achat = 1) THEN
    RAISE EXCEPTION 'état inattendu : prix d''achat de 96767';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM cross_post_jobs WHERE id = '83eb1cde-d5a8-4af9-a9b5-a4aebfc34a69' AND status = 'published')
     OR NOT EXISTS (SELECT 1 FROM annonces_plateforme WHERE id = '012b9226-f0e0-45d3-bab4-5b98d3278ef2'
                     AND job_id = '83eb1cde-d5a8-4af9-a9b5-a4aebfc34a69' AND disparu_le IS NULL AND retiree_le IS NULL) THEN
    RAISE EXCEPTION 'état inattendu : copie Leboncoin 3260299583';
  END IF;
  IF (SELECT count(*) FROM inventaire WHERE id IN (1791388026133002, 1791388213169) AND fusionne_dans IS NULL) <> 2 THEN
    RAISE EXCEPTION 'état inattendu : fiches Xbox';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM inventaire WHERE id = 1790234435323002 AND statut = 'vendu')
     OR NOT EXISTS (SELECT 1 FROM cross_post_jobs WHERE id = 'e7da7b7b-d70d-4402-bf6e-5cf57691b50b' AND status = 'sold')
     OR NOT EXISTS (SELECT 1 FROM cross_post_jobs WHERE id = '8288182d-f477-43d8-aa52-c4bde8bf6e2f' AND status = 'sold') THEN
    RAISE EXCEPTION 'état inattendu : fiche / jobs eBay';
  END IF;
END $g$;

-- ── Sauvegarde ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public._backup_0910_audit_ebay (
  k text NOT NULL, cle text NOT NULL, ligne jsonb, sauve_le timestamptz NOT NULL DEFAULT now());
ALTER TABLE public._backup_0910_audit_ebay ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_0910_audit_ebay FROM anon, authenticated;
INSERT INTO _backup_0910_audit_ebay (k, cle, ligne)
SELECT 'vente', v.id::text, to_jsonb(v) FROM ventes v WHERE v.id IN (10170, 30584, 35768, 76641, 78319, 96766, 96767, 42187);
INSERT INTO _backup_0910_audit_ebay (k, cle, ligne)
SELECT 'inventaire', i.id::text, to_jsonb(i) FROM inventaire i WHERE i.id IN (1791388026133002, 1791388213169, 1790234435323002);
INSERT INTO _backup_0910_audit_ebay (k, cle, ligne)
SELECT 'job', j.id::text, to_jsonb(j) FROM cross_post_jobs j
 WHERE j.id IN ('e7da7b7b-d70d-4402-bf6e-5cf57691b50b', '8288182d-f477-43d8-aa52-c4bde8bf6e2f');

-- ── 1 et 2. Une seule vente, la Leboncoin ; la saisie de la personne prime ───
DO $r12$
DECLARE
  p record; r record;
BEGIN
  FOR p IN SELECT * FROM (VALUES (10170::bigint, 30584::bigint), (35768, 76641)) x(garde, releve) LOOP
    SELECT * INTO r FROM ventes WHERE id = p.releve;
    INSERT INTO usage_logs (user_id, feature, metadata)
    VALUES (r.user_id, 'vente_fusionnee', jsonb_build_object(
      'gardee', p.garde, 'fusionnee', to_jsonb(r), 'motif', 'audit_ebay_0910_meme_cession_leboncoin',
      'plateforme', 'leboncoin', 'commande', r.commande_ref, 'par', 'reparation 20261009_audit_ebay (GO Nico)'));
    DELETE FROM ventes WHERE id = p.releve;
    UPDATE ventes v SET
      plateforme         = 'leboncoin',
      plateforme_code    = 'leboncoin',
      plateforme_origine = coalesce(v.plateforme_origine, v.plateforme),
      commande_ref       = r.commande_ref,
      vendu_le           = coalesce(v.vendu_le, r.vendu_le),
      devise             = coalesce(v.devise, r.devise),
      frais_plateforme   = coalesce(v.frais_plateforme, r.frais_plateforme),
      selling_fees       = coalesce(v.selling_fees, r.selling_fees),
      annonce_id         = coalesce(v.annonce_id, r.annonce_id),
      releve_le          = r.releve_le
    WHERE v.id = p.garde;
  END LOOP;
END $r12$;

-- ── 3 et 5. Les doublons supprimés, notés (ils ne reviennent pas) ──────────
INSERT INTO ventes_supprimees (user_id, plateforme_code, commande_ref, annonce_id, titre, prix_vente, vendu_le, vente_id, supprimee_le)
SELECT v.user_id, coalesce(v.plateforme_code, lower(v.plateforme)), v.commande_ref, v.annonce_id, v.titre, v.prix_vente, v.vendu_le, v.id, now()
  FROM ventes v WHERE v.id IN (78319, 96766, 42187);
DELETE FROM ventes WHERE id IN (78319, 96766, 42187);

-- ── 4. « Déjà vendu ? » sur la copie Leboncoin 3260299583 ──────────────────
INSERT INTO inventaire_doublons (user_id, garde, absorbe, niveau, statut, motif, preuves, source)
SELECT j.user_id, j.inventaire_id, j.inventaire_id, 'probable', 'proposee', 'copie_non_prouvee',
       jsonb_build_object('job', j.id, 'annonce_id', a.id, 'platform', j.platform,
         'url', coalesce(nullif(btrim(coalesce(a.url, '')), ''), nullif(btrim(coalesce(j.listing_url, '')), '')),
         'titre', coalesce(nullif(btrim(coalesce(a.titre, '')), ''), nullif(btrim(coalesce(j.title, '')), '')),
         'vendu_sur', 'ailleurs', 'rattachement', j.platform_fields -> 'rattachement'),
       'reparation_0910_audit_ebay'
  FROM cross_post_jobs j JOIN annonces_plateforme a ON a.id = '012b9226-f0e0-45d3-bab4-5b98d3278ef2'
 WHERE j.id = '83eb1cde-d5a8-4af9-a9b5-a4aebfc34a69';
DO $q$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM inventaire_doublons WHERE source = 'reparation_0910_audit_ebay'
                  AND preuves ->> 'job' = '83eb1cde-d5a8-4af9-a9b5-a4aebfc34a69' AND statut = 'proposee') THEN
    RAISE EXCEPTION 'question « Déjà vendu ? » non posée';
  END IF;
END $q$;

-- ── 5. Les deux fiches du Xbox, fusionnées dans la fiche Vinted ────────────
DO $f$
DECLARE v jsonb;
BEGIN
  v := inventaire_fusionner_pour('de63ca45-63d9-4a3c-b65a-d1345acd8b2e', 1791388026133002, 1791388213169,
                                 'utilisateur:photo_go_nico_0910');
  IF NOT coalesce((v ->> 'ok')::boolean, false) THEN RAISE EXCEPTION 'fusion refusée : %', v; END IF;
  INSERT INTO _backup_0910_audit_ebay (k, cle, ligne) VALUES ('fusion', v ->> 'fusion_id', v);
END $f$;

-- ── 5 et 8. Les jobs eBay terminés SANS vente ne sont plus « vendus » ──────
UPDATE cross_post_jobs SET
  status = 'cancelled',
  error = 'Annonce eBay terminée sans vente (lecture eBay du 09/10 : 0 vendu).',
  platform_fields = coalesce(platform_fields, '{}'::jsonb) || jsonb_build_object('fin_sans_vente', jsonb_build_object(
    'le', now(), 'par', 'reparation 20261009_audit_ebay (GO Nico)', 'ancien_statut', 'sold'))
 WHERE id IN ('e7da7b7b-d70d-4402-bf6e-5cf57691b50b', '8288182d-f477-43d8-aa52-c4bde8bf6e2f') AND status = 'sold';

-- ── 8. La fiche du coffret DVD revient en stock ────────────────────────────
UPDATE inventaire SET statut = 'stock', quantite = 1, margin = NULL, margin_pct = NULL, selling_fees = 0
 WHERE id = 1790234435323002 AND statut = 'vendu';

-- ── Relecture ──────────────────────────────────────────────────────────────
DO $v$
BEGIN
  IF (SELECT count(*) FROM ventes WHERE id IN (30584, 76641, 78319, 96766, 42187)) <> 0 THEN RAISE EXCEPTION 'relecture : suppressions'; END IF;
  IF (SELECT count(*) FROM ventes WHERE id IN (10170, 35768) AND plateforme_code = 'leboncoin' AND commande_ref IS NOT NULL) <> 2 THEN
    RAISE EXCEPTION 'relecture : ventes Leboncoin';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM inventaire WHERE id = 1791388213169 AND fusionne_dans = 1791388026133002) THEN RAISE EXCEPTION 'relecture : fusion'; END IF;
  IF NOT EXISTS (SELECT 1 FROM inventaire WHERE id = 1790234435323002 AND statut = 'stock' AND quantite = 1) THEN RAISE EXCEPTION 'relecture : stock'; END IF;
END $v$;

COMMIT;

SELECT k, cle FROM _backup_0910_audit_ebay ORDER BY k, cle;
