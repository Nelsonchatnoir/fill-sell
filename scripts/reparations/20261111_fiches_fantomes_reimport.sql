-- (11/11/2026, L1 — décision 3 de Nico : « Les 7 fiches fantômes : OUI, suppression par script avec sauvegarde (montre-le
-- avant de lancer). ») LES 7 FICHES FANTÔMES RÉIMPORTÉES PAR LE MOTEUR DE RAPPROCHEMENT
-- Rapport : docs/enquetes/retrait-comptes-relies-1111/RAPPORT.md (§ « fiches fantômes »).
-- Ce qui s'est passé : la personne supprime une fiche EN RETIRANT ses annonces ; pendant la fenêtre « fiche supprimée →
-- retrait fait » (1 à 12 min), un relevé suivi d'une passe du moteur (rapprochement_v3_fiche_de) trouve les annonces
-- encore en ligne, sans fiche, et en refait une fiche NEUVE (origine releve_*). Les retraits ont abouti depuis : toutes
-- leurs annonces sont relevées retirées, tous leurs dépôts sont clos — mais les fiches restent au stock, sans annonce,
-- comptent dans « pas encore partout », et un lot peut les republier. Les 7 (lues le 11/11 vers 14:15) :
--   compte 447d920c-976a-4d8f-aff4-a2998050358c : 1794389289141, 1794389289234 (nées le 11/11 10:28:09),
--     1794391571153, 1794391571230 (11:06:11), 1794393469413 (11:37:49), 1794263945937 (09/11 23:39:05) ;
--   compte faf5021a-479a-4bb3-b3ec-c296770739b7 : 1794260149701 (09/11 22:35:49).
-- ⛔ Le moteur de rapprochement N'EST PAS touché ici (sa garde « annonce en cours de retrait » se livre à part, après L1).
-- La suppression est celle de l'app (DELETE de la fiche), SANS contourner les déclencheurs : le filet du serveur
-- (inventaire_arme_retraits_avant_suppression) et la règle du 11/11 (inventaire_arme_retraits_fiche_liee) tirent — le
-- script PROUVE d'abord qu'il n'y a rien à retirer (aucun dépôt vivant, aucune annonce vivante, aucun lien de fiches),
-- puis vérifie après coup qu'AUCUN retrait n'est né ; sinon il s'arrête et n'écrit rien.
-- Les annonces relevées (toutes retirées) restent, sans fiche (clé étrangère SET NULL), comme après toute suppression :
-- le moteur ne réimporte jamais une annonce disparue ou retirée (rapprochement_v3_fiche_de). Aucune annonce en ligne
-- n'est touchée ; aucune plateforme n'est appelée ; aucun mail.
-- Sauvegarde COMPLÈTE : public._backup_1111_fiches_fantomes (les fiches et toutes les lignes qui leur sont rattachées).
-- Lecture avant / après (rien n'écrit) : 20261111_fiches_fantomes_reimport_PREUVE.sql.
-- Inverse : 20261111_fiches_fantomes_reimport_INVERSE.sql.
-- ⚠ Une seule transaction : une garde qui échoue n'écrit RIEN.

BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE TEMP TABLE _fantomes_1111 (id bigint PRIMARY KEY, user_id uuid NOT NULL) ON COMMIT DROP;
INSERT INTO _fantomes_1111 (id, user_id) VALUES
  (1794389289141, '447d920c-976a-4d8f-aff4-a2998050358c'), (1794389289234, '447d920c-976a-4d8f-aff4-a2998050358c'),
  (1794391571153, '447d920c-976a-4d8f-aff4-a2998050358c'), (1794391571230, '447d920c-976a-4d8f-aff4-a2998050358c'),
  (1794393469413, '447d920c-976a-4d8f-aff4-a2998050358c'), (1794263945937, '447d920c-976a-4d8f-aff4-a2998050358c'),
  (1794260149701, 'faf5021a-479a-4bb3-b3ec-c296770739b7');

DO $garde$
DECLARE v_n integer;
BEGIN
  IF to_regclass('public._backup_1111_fiches_fantomes') IS NOT NULL THEN
    RAISE EXCEPTION 'script déjà passé (sauvegarde présente) : rien n''est écrit';
  END IF;
  -- CONTRÔLE STRICT : exactement 7 fiches, chacune sur le compte attendu, telles que lues le 11/11 (née d'un relevé,
  -- au stock, une pièce, ni fondue ni disparue, née entre le 09/11 et le 11/11 midi, heure de Paris).
  SELECT count(*) INTO v_n FROM public.inventaire i JOIN _fantomes_1111 f ON f.id = i.id AND f.user_id = i.user_id
   WHERE i.origine LIKE 'releve\_%' AND i.statut = 'stock' AND COALESCE(i.quantite, 1) = 1
     AND i.fusionne_dans IS NULL AND i.disparu_le IS NULL
     AND i.created_at >= '2026-11-09 00:00:00 Europe/Paris' AND i.created_at < '2026-11-11 12:00:00 Europe/Paris';
  IF v_n <> 7 THEN RAISE EXCEPTION 'fiches fantômes : % sur 7 dans l''état attendu — rien n''est écrit', v_n; END IF;
  SELECT count(*) INTO v_n FROM _fantomes_1111 f WHERE f.user_id = '447d920c-976a-4d8f-aff4-a2998050358c';
  IF v_n <> 6 THEN RAISE EXCEPTION 'liste fautive (% fiches du compte 447d920c au lieu de 6)', v_n; END IF;
  -- Rien à retirer : aucun dépôt ni aucune tâche vivante (publication, republication, retrait) sur ces fiches.
  IF EXISTS (SELECT 1 FROM public.cross_post_jobs j JOIN _fantomes_1111 f ON f.id = j.inventaire_id
              WHERE j.status IN ('pending', 'processing', 'needs_user', 'published', 'sold')) THEN
    RAISE EXCEPTION 'une fiche fantôme porte encore un dépôt ou une tâche vivante : rien n''est écrit';
  END IF;
  -- Aucune annonce vivante au relevé (toutes retirées, disparues ou écartées).
  IF EXISTS (SELECT 1 FROM public.annonces_plateforme a JOIN _fantomes_1111 f ON f.id = a.inventaire_id
              WHERE a.disparu_le IS NULL AND a.retiree_le IS NULL AND a.ignoree_le IS NULL) THEN
    RAISE EXCEPTION 'une fiche fantôme porte encore une annonce vivante : rien n''est écrit';
  END IF;
  -- Ni vente, ni lien entre comptes, ni fiche fondue dedans, ni remise en vente.
  IF EXISTS (SELECT 1 FROM public.ventes v JOIN _fantomes_1111 f ON f.id = v.inventaire_id) THEN
    RAISE EXCEPTION 'une vente pointe une fiche fantôme : rien n''est écrit'; END IF;
  IF EXISTS (SELECT 1 FROM public.fiches_liees_comptes l JOIN _fantomes_1111 f ON f.id IN (l.fiche_a, l.fiche_b)) THEN
    RAISE EXCEPTION 'une fiche fantôme est liée à un autre compte : rien n''est écrit'; END IF;
  IF EXISTS (SELECT 1 FROM public.inventaire x JOIN _fantomes_1111 f ON f.id = x.fusionne_dans) THEN
    RAISE EXCEPTION 'une fiche est fondue dans une fiche fantôme : rien n''est écrit'; END IF;
  IF EXISTS (SELECT 1 FROM public.remises_en_vente r JOIN _fantomes_1111 f ON f.id = r.inventaire_id) THEN
    RAISE EXCEPTION 'une remise en vente vise une fiche fantôme : rien n''est écrit'; END IF;
END
$garde$;

-- 1. LA SAUVEGARDE COMPLÈTE, AVANT TOUTE ÉCRITURE : les fiches, et toutes les lignes qui les désignent (clés étrangères
--    de prod vers inventaire, relues le 11/11 : annonces_plateforme, cross_post_jobs, fiches_annonce (CASCADE),
--    inventaire.fusionne_dans, messagerie_conversations, plateforme_commandes, rapprochements, ventes,
--    vinted_listing_snapshots, vinted_republish_captures). Née protégée (RLS, aucun droit client).
CREATE TABLE public._backup_1111_fiches_fantomes AS
SELECT now() AS le, 'inventaire'::text AS t, i.id::text AS cle, to_jsonb(i.*) AS ligne
  FROM public.inventaire i JOIN _fantomes_1111 f ON f.id = i.id AND f.user_id = i.user_id
UNION ALL SELECT now(), 'cross_post_jobs', x.id::text, to_jsonb(x.*) FROM public.cross_post_jobs x JOIN _fantomes_1111 f ON f.id = x.inventaire_id
UNION ALL SELECT now(), 'annonces_plateforme', x.id::text, to_jsonb(x.*) FROM public.annonces_plateforme x JOIN _fantomes_1111 f ON f.id = x.inventaire_id
UNION ALL SELECT now(), 'rapprochements', x.id::text, to_jsonb(x.*) FROM public.rapprochements x JOIN _fantomes_1111 f ON f.id = x.inventaire_id
UNION ALL SELECT now(), 'fiches_annonce', x.inventaire_id::text, to_jsonb(x.*) FROM public.fiches_annonce x JOIN _fantomes_1111 f ON f.id = x.inventaire_id
UNION ALL SELECT now(), 'messagerie_conversations', x.id::text, to_jsonb(x.*) FROM public.messagerie_conversations x JOIN _fantomes_1111 f ON f.id = x.inventaire_id
UNION ALL SELECT now(), 'plateforme_commandes', x.id::text, to_jsonb(x.*) FROM public.plateforme_commandes x JOIN _fantomes_1111 f ON f.id = x.inventaire_id
UNION ALL SELECT now(), 'vinted_listing_snapshots', x.id::text, to_jsonb(x.*) FROM public.vinted_listing_snapshots x JOIN _fantomes_1111 f ON f.id = x.inventaire_id
UNION ALL SELECT now(), 'vinted_republish_captures', x.id::text, to_jsonb(x.*) FROM public.vinted_republish_captures x JOIN _fantomes_1111 f ON f.id = x.inventaire_id;
ALTER TABLE public._backup_1111_fiches_fantomes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public._backup_1111_fiches_fantomes FROM PUBLIC, anon, authenticated;

DO $controle$
DECLARE v_n integer;
BEGIN
  SELECT count(*) INTO v_n FROM public._backup_1111_fiches_fantomes WHERE t = 'inventaire';
  IF v_n <> 7 THEN RAISE EXCEPTION 'sauvegarde : % fiches sur 7 — rien n''est écrit', v_n; END IF;
  -- (relecture M3) Le compte AVANT : chaque ligne qui désigne une fiche fantôme est dans la sauvegarde.
  IF (SELECT count(*) FROM public.cross_post_jobs x JOIN _fantomes_1111 f ON f.id = x.inventaire_id)
       <> (SELECT count(*) FROM public._backup_1111_fiches_fantomes WHERE t = 'cross_post_jobs')
     OR (SELECT count(*) FROM public.annonces_plateforme x JOIN _fantomes_1111 f ON f.id = x.inventaire_id)
       <> (SELECT count(*) FROM public._backup_1111_fiches_fantomes WHERE t = 'annonces_plateforme')
     OR (SELECT count(*) FROM public.rapprochements x JOIN _fantomes_1111 f ON f.id = x.inventaire_id)
       <> (SELECT count(*) FROM public._backup_1111_fiches_fantomes WHERE t = 'rapprochements') THEN
    RAISE EXCEPTION 'sauvegarde : dépôts, annonces ou rapprochements incomplets — rien n''est écrit';
  END IF;
END
$controle$;
-- Le compte AVANT, lisible (dépôts, annonces relevées, rapprochements qui désignent les 7 fiches).
SELECT 'avant' AS quand, t, count(*) AS lignes FROM public._backup_1111_fiches_fantomes
 WHERE t IN ('cross_post_jobs', 'annonces_plateforme', 'rapprochements') GROUP BY t ORDER BY t;

-- 2. LA SUPPRESSION, comme l'app (DELETE de la fiche), déclencheurs compris.
DELETE FROM public.inventaire i USING _fantomes_1111 f WHERE i.id = f.id AND i.user_id = f.user_id;

-- 3. LE CONTRÔLE : 7 fiches parties, AUCUN retrait ni aucune tâche née, aucune annonce relevée modifiée hors la clé
--    étrangère (inventaire_id → NULL), les dépôts toujours clos.
DO $apres$
DECLARE v_n integer;
BEGIN
  SELECT count(*) INTO v_n FROM public.inventaire i JOIN _fantomes_1111 f ON f.id = i.id;
  IF v_n <> 0 THEN RAISE EXCEPTION 'suppression incomplète (% fiches restent) — rien n''est écrit', v_n; END IF;
  SELECT count(*) INTO v_n FROM public.cross_post_jobs j
   WHERE j.user_id IN ('447d920c-976a-4d8f-aff4-a2998050358c', 'faf5021a-479a-4bb3-b3ec-c296770739b7') AND j.created_at = now();
  IF v_n <> 0 THEN RAISE EXCEPTION 'la suppression a fait naître % tâche(s) (retrait ?) — rien n''est écrit', v_n; END IF;
  SELECT count(*) INTO v_n FROM public.usage_logs u
   WHERE u.user_id IN ('447d920c-976a-4d8f-aff4-a2998050358c', 'faf5021a-479a-4bb3-b3ec-c296770739b7') AND u.created_at = now()
     AND u.feature IN ('retrait_annonces', 'retrait_partout_compte_relie', 'retrait_refuse_compte_relie');
  IF v_n <> 0 THEN RAISE EXCEPTION 'un retrait a été journalisé par la suppression (% lignes) — rien n''est écrit', v_n; END IF;
  SELECT count(*) INTO v_n FROM public.annonces_plateforme a JOIN public._backup_1111_fiches_fantomes b
    ON b.t = 'annonces_plateforme' AND a.id = b.cle::uuid
   WHERE a.inventaire_id IS NULL
     AND a.disparu_le IS NOT DISTINCT FROM (b.ligne ->> 'disparu_le')::timestamptz
     AND a.retiree_le IS NOT DISTINCT FROM (b.ligne ->> 'retiree_le')::timestamptz
     AND a.statut_plateforme IS NOT DISTINCT FROM b.ligne ->> 'statut_plateforme';
  IF v_n <> (SELECT count(*) FROM public._backup_1111_fiches_fantomes WHERE t = 'annonces_plateforme') THEN
    RAISE EXCEPTION 'une annonce relevée a changé au-delà de sa clé de fiche — rien n''est écrit';
  END IF;
  SELECT count(*) INTO v_n FROM public.cross_post_jobs j JOIN public._backup_1111_fiches_fantomes b
    ON b.t = 'cross_post_jobs' AND j.id = b.cle::uuid
   WHERE j.status IS DISTINCT FROM b.ligne ->> 'status';
  IF v_n <> 0 THEN RAISE EXCEPTION 'un dépôt clos a changé de statut (%) — rien n''est écrit', v_n; END IF;
  -- (relecture M3) Le compte APRÈS : les MÊMES dépôts, annonces relevées et rapprochements existent toujours (aucune
  -- cascade ne les a supprimés), tous sans fiche ; plus aucune ligne ne désigne une fiche fantôme.
  IF (SELECT count(*) FROM public.cross_post_jobs x JOIN public._backup_1111_fiches_fantomes b ON b.t = 'cross_post_jobs' AND x.id::text = b.cle WHERE x.inventaire_id IS NULL)
       <> (SELECT count(*) FROM public._backup_1111_fiches_fantomes WHERE t = 'cross_post_jobs') THEN
    RAISE EXCEPTION 'dépôts : le compte après la suppression ne rend pas celui d''avant — rien n''est écrit';
  END IF;
  IF (SELECT count(*) FROM public.annonces_plateforme x JOIN public._backup_1111_fiches_fantomes b ON b.t = 'annonces_plateforme' AND x.id::text = b.cle WHERE x.inventaire_id IS NULL)
       <> (SELECT count(*) FROM public._backup_1111_fiches_fantomes WHERE t = 'annonces_plateforme') THEN
    RAISE EXCEPTION 'annonces relevées : le compte après la suppression ne rend pas celui d''avant — rien n''est écrit';
  END IF;
  IF (SELECT count(*) FROM public.rapprochements x JOIN public._backup_1111_fiches_fantomes b ON b.t = 'rapprochements' AND x.id::text = b.cle WHERE x.inventaire_id IS NULL)
       <> (SELECT count(*) FROM public._backup_1111_fiches_fantomes WHERE t = 'rapprochements') THEN
    RAISE EXCEPTION 'rapprochements : le compte après la suppression ne rend pas celui d''avant — rien n''est écrit';
  END IF;
  IF EXISTS (SELECT 1 FROM public.cross_post_jobs x JOIN _fantomes_1111 f ON f.id = x.inventaire_id)
     OR EXISTS (SELECT 1 FROM public.annonces_plateforme x JOIN _fantomes_1111 f ON f.id = x.inventaire_id)
     OR EXISTS (SELECT 1 FROM public.rapprochements x JOIN _fantomes_1111 f ON f.id = x.inventaire_id) THEN
    RAISE EXCEPTION 'une ligne désigne encore une fiche fantôme — rien n''est écrit';
  END IF;
END
$apres$;
-- Le compte APRÈS, lisible : les mêmes lignes, sans fiche.
SELECT 'apres' AS quand, b.t, count(*) AS lignes,
       count(*) FILTER (WHERE CASE b.t
         WHEN 'cross_post_jobs' THEN EXISTS (SELECT 1 FROM public.cross_post_jobs x WHERE x.id::text = b.cle AND x.inventaire_id IS NULL)
         WHEN 'annonces_plateforme' THEN EXISTS (SELECT 1 FROM public.annonces_plateforme x WHERE x.id::text = b.cle AND x.inventaire_id IS NULL)
         ELSE EXISTS (SELECT 1 FROM public.rapprochements x WHERE x.id::text = b.cle AND x.inventaire_id IS NULL) END) AS toujours_la_sans_fiche
  FROM public._backup_1111_fiches_fantomes b
 WHERE b.t IN ('cross_post_jobs', 'annonces_plateforme', 'rapprochements') GROUP BY b.t ORDER BY b.t;

-- 4. Le journal, une ligne par compte (comme une suppression d'article : src/utils/journalRetraits.js, chemin
--    intervention_support — supprimé par nous, sur décision nommée ; aucune annonce retirée).
INSERT INTO public.usage_logs (user_id, feature, metadata)
SELECT (b.ligne ->> 'user_id')::uuid AS user_id, 'suppression_article', jsonb_build_object(
         'chemin', 'intervention_support', 'n_articles', count(*), 'n_annonces', 0,
         'articles', jsonb_agg(b.cle ORDER BY b.cle), 'motif', 'fiche_fantome_reimport',
         'ordre', 'Nico 11/11/2026 (L1, décision 3)')
  FROM public._backup_1111_fiches_fantomes b WHERE b.t = 'inventaire'
 GROUP BY b.ligne ->> 'user_id';

SELECT t, count(*) AS lignes_sauvegardees FROM public._backup_1111_fiches_fantomes GROUP BY t ORDER BY t;

COMMIT;
