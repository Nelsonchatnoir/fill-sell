-- (11/11/2026, L1) LES DEUX ANNONCES LEBONCOIN RESTÉES EN LIGNE CHEZ LE COMPTE RELIÉ APRÈS UN RETRAIT « PARTOUT »
-- Rapport : docs/enquetes/retrait-comptes-relies-1111/RAPPORT.md. Règle : docs/regles/ventes-et-retraits.md (11/11).
-- Le compte 447d920c-976a-4d8f-aff4-a2998050358c a supprimé deux fiches « en retirant leurs annonces » le 11/11 (11:03:34
-- et 11:37:34) ; le compte relié faf5021a-479a-4bb3-b3ec-c296770739b7 (même personne, comptes_lies, MÊME boutique
-- Leboncoin : boutique_partagee_compte_relie) suit, sur les fiches jumelles, une copie Leboncoin de chacune, restée en ligne.
-- Les annonces sont désignées par leurs DÉPÔTS et leurs ANNONCES RELEVÉES (identifiants techniques) ; leurs numéros sont lus
-- dans ces lignes, jamais écrits ici.
--   · dépôt 21a23488 (annonce relevée bffc6551) sur la jumelle 1792340705460686 (lien 186), rattachée PAR LA PERSONNE
--     (certaine) : retirée PAR LA RÈGLE elle-même, armer_retraits_fiche_liee (migration 20261111140000) — la règle jouée en
--     prod sur le cas réel, après coup (le lien de fiches n'a pas de clé étrangère : il survit à la suppression) ;
--   · dépôt ad4e2895 (annonce relevée 0607c980) sur la jumelle 1792340705460616 (lien 116), rattachée automatiquement par
--     le TITRE SEUL (titre_exact) : la règle ne la retire JAMAIS d'office (elle pose la question au compte relié).
--     HORS DE LA RÈGLE, ORDRE NOMMÉ de Nico du 11/11/2026 : « ORDRE NOMMÉ de la retirer, par le geste ordinaire de l'app,
--     avec ton script (sauvegarde + inverse) ». Le geste : le retrait d'UNE plateforme par son logo du Stock
--     (src/tabs/StockTab.jsx, armRemoveJob : le même insert), sous les droits du compte relié (rôle authenticated, sa
--     session, RLS de cross_post_jobs) — jamais un UPDATE sur une annonce. Armé AVANT la règle : la règle ne pose donc
--     pas de question sur cette annonce (un retrait l'attend déjà).
-- (Relecture finale) La fiche supprimée 1789889101726001 ne portait aucun dépôt Leboncoin (lu en prod le 11/11 : ses
-- retraits étaient Beebs, Depop, Vinted) : pas de « deux exemplaires » (deux_annonces_paire), la règle arme le dépôt
-- 21a23488 ; rejouée après la suppression, elle ne verrait de toute façon plus les dépôts de la fiche (clé SET NULL).
-- La règle, pour les DEUX fiches supprimées, pose aussi la marque des deux jumelles (jumelles_retirees_partout) et les
-- deux bilans (usage_logs retrait_partout_compte_relie). Les fiches jumelles restent au stock (décision 2). Aucune
-- annonce, aucune fiche n'est écrite à la main : les retraits sont des tâches ordinaires, exécutées par l'extension du poste
-- qui suit ces annonces (cadence Leboncoin : retraits d'abord, 10 à 20 min).
-- ⛔ GARDE « 0 tâche en file » (relecture M2) : le 11/11 (14:10 puis 15:45), aucune publication, republication, tâche
-- échouée ni remise en vente sur les deux jumelles. S'il y en a une au moment du script, il s'arrête et n'écrit rien (la
-- relire avant : la règle l'annulerait).
-- Prérequis : la migration 20261111140000 APPLIQUÉE (sinon ce script s'arrête). Lecture avant / après (rien n'écrit) :
-- 20261111_retrait_leboncoin_comptes_relies_PREUVE.sql. Sauvegarde : public._backup_1111_retrait_lbc_relies.
-- Inverse : 20261111_retrait_leboncoin_comptes_relies_INVERSE.sql (tant que les retraits n'ont pas été exécutés ; une fois
-- faits, c'est irréversible : remettre en ligne = republier, geste de la personne).
-- Aucun mail, aucune notification : rien dans ce circuit n'en envoie.
-- ⚠ Une seule transaction : une garde qui échoue n'écrit RIEN.

BEGIN;
SET LOCAL lock_timeout = '5s';

DO $garde$
DECLARE v_n integer;
BEGIN
  IF to_regprocedure('public.armer_retraits_fiche_liee(uuid,bigint,text)') IS NULL
     OR to_regprocedure('public.annonce_en_retrait_compte_relie(uuid)') IS NULL
     OR to_regclass('public.jumelles_retirees_partout') IS NULL THEN
    RAISE EXCEPTION 'migration 20261111140000 (version relue) absente : l''appliquer d''abord — rien n''est écrit';
  END IF;
  IF to_regclass('public._backup_1111_retrait_lbc_relies') IS NOT NULL THEN
    RAISE EXCEPTION 'script déjà passé (sauvegarde présente) : rien n''est écrit';
  END IF;
  IF NOT public.comptes_sont_lies('447d920c-976a-4d8f-aff4-a2998050358c', 'faf5021a-479a-4bb3-b3ec-c296770739b7') THEN
    RAISE EXCEPTION 'les deux comptes ne sont plus reliés (comptes_lies) : rien n''est écrit';
  END IF;
  IF NOT public.boutique_partagee_compte_relie('447d920c-976a-4d8f-aff4-a2998050358c', 'faf5021a-479a-4bb3-b3ec-c296770739b7', 'leboncoin') THEN
    RAISE EXCEPTION 'la boutique Leboncoin n''est plus partagée entre les deux comptes (portée de la règle) : rien n''est écrit';
  END IF;
  -- Les deux liens de fiches, intacts (fiche supprimée du compte qui a agi → fiche jumelle du compte relié).
  SELECT count(*) INTO v_n FROM public.fiches_liees_comptes f
   WHERE (f.id, f.fiche_a, f.user_a, f.fiche_b, f.user_b) IN (
           (116, 1789889098557002, '447d920c-976a-4d8f-aff4-a2998050358c'::uuid, 1792340705460616, 'faf5021a-479a-4bb3-b3ec-c296770739b7'::uuid),
           (186, 1789889101726001, '447d920c-976a-4d8f-aff4-a2998050358c'::uuid, 1792340705460686, 'faf5021a-479a-4bb3-b3ec-c296770739b7'::uuid));
  IF v_n <> 2 THEN RAISE EXCEPTION 'liens de fiches 116 / 186 changés (% sur 2) : rien n''est écrit', v_n; END IF;
  -- Les deux fiches du compte qui a agi sont bien supprimées (l'état lu le 11/11).
  IF EXISTS (SELECT 1 FROM public.inventaire WHERE id IN (1789889098557002, 1789889101726001)) THEN
    RAISE EXCEPTION 'une fiche supprimée du compte qui a agi existe à nouveau : rien n''est écrit';
  END IF;
  -- Les deux jumelles : au stock, ni fondues ni vendues, sans marque.
  SELECT count(*) INTO v_n FROM public.inventaire i
   WHERE i.id IN (1792340705460616, 1792340705460686) AND i.user_id = 'faf5021a-479a-4bb3-b3ec-c296770739b7'
     AND i.fusionne_dans IS NULL AND i.statut = 'stock' AND COALESCE(i.quantite, 1) > 0;
  IF v_n <> 2 THEN RAISE EXCEPTION 'fiches jumelles changées (% sur 2 au stock) : rien n''est écrit', v_n; END IF;
  IF EXISTS (SELECT 1 FROM public.jumelles_retirees_partout m WHERE m.inventaire_id IN (1792340705460616, 1792340705460686)) THEN
    RAISE EXCEPTION 'une jumelle porte déjà sa marque (la règle est déjà passée) : rien n''est écrit';
  END IF;
  -- Les deux dépôts : encore « published », sur leur fiche, chacun avec un numéro qui est celui de SON annonce relevée.
  SELECT count(*) INTO v_n FROM public.cross_post_jobs j
    JOIN public.annonces_plateforme a ON a.job_id = j.id AND a.user_id = j.user_id AND a.platform = j.platform
   WHERE j.user_id = 'faf5021a-479a-4bb3-b3ec-c296770739b7' AND j.platform = 'leboncoin' AND j.status = 'published'
     AND COALESCE(j.action, 'publish') IN ('publish', 'republish')
     AND length(btrim(COALESCE(j.platform_listing_id, ''))) >= 6 AND a.listing_id = btrim(j.platform_listing_id)
     AND (j.id, j.inventaire_id, a.id) IN (
           ('ad4e2895-c5e3-40e9-8bf0-5f1b10199479'::uuid, 1792340705460616, '0607c980-29ee-40f9-93df-e79c10650c6a'::uuid),
           ('21a23488-a389-49a2-b228-5fc416d82c93'::uuid, 1792340705460686, 'bffc6551-e8f7-4769-a6e9-f4618b1fdfad'::uuid));
  IF v_n <> 2 THEN RAISE EXCEPTION 'dépôts Leboncoin changés (% sur 2 « published » avec leur annonce) : rien n''est écrit', v_n; END IF;
  -- Les deux annonces : vivantes au relevé, aucun achat en cours ni vente.
  SELECT count(*) INTO v_n FROM public.annonces_plateforme a
   WHERE a.id IN ('0607c980-29ee-40f9-93df-e79c10650c6a', 'bffc6551-e8f7-4769-a6e9-f4618b1fdfad')
     AND a.user_id = 'faf5021a-479a-4bb3-b3ec-c296770739b7' AND a.platform = 'leboncoin'
     AND a.statut_plateforme = 'en_ligne' AND a.disparu_le IS NULL AND a.retiree_le IS NULL AND a.ignoree_le IS NULL
     AND COALESCE(public.leboncoin_transaction_lue(a.transaction_plateforme, a.capture), '') NOT IN ('pending', 'sold');
  IF v_n <> 2 THEN RAISE EXCEPTION 'annonces plus vivantes ou sous transaction (% sur 2) : rien n''est écrit', v_n; END IF;
  -- Aucun retrait déjà ouvert ou fait sur ces deux annonces (sur aucun des deux comptes).
  IF EXISTS (SELECT 1 FROM public.cross_post_jobs d, public.cross_post_jobs j
              WHERE j.id IN ('ad4e2895-c5e3-40e9-8bf0-5f1b10199479', '21a23488-a389-49a2-b228-5fc416d82c93')
                AND d.user_id IN ('faf5021a-479a-4bb3-b3ec-c296770739b7', '447d920c-976a-4d8f-aff4-a2998050358c')
                AND d.platform = 'leboncoin' AND d.action = 'delete'
                AND d.status IN ('pending', 'processing', 'needs_user', 'deleted')
                AND public.listing_designe(btrim(j.platform_listing_id), d.listing_url, d.platform_listing_id)) THEN
    RAISE EXCEPTION 'un retrait existe déjà sur l''une des deux annonces : rien n''est écrit';
  END IF;
  -- ⛔ (relecture M2) 0 tâche en file sur les deux jumelles : l'état relu le 11/11.
  SELECT count(*) INTO v_n FROM public.cross_post_jobs j
   WHERE j.user_id = 'faf5021a-479a-4bb3-b3ec-c296770739b7' AND j.inventaire_id IN (1792340705460616, 1792340705460686)
     AND COALESCE(j.action, 'publish') IN ('publish', 'republish') AND j.status IN ('pending', 'processing', 'needs_user', 'failed');
  v_n := v_n + (SELECT count(*) FROM public.remises_en_vente r
                 WHERE r.user_id = 'faf5021a-479a-4bb3-b3ec-c296770739b7' AND r.inventaire_id IN (1792340705460616, 1792340705460686)
                   AND r.statut IN ('a_faire', 'proposee'));
  IF v_n <> 0 THEN
    RAISE EXCEPTION '% tâche(s) ou remise(s) en file sur les jumelles (0 le 11/11) : à relire avant, rien n''est écrit', v_n;
  END IF;
END
$garde$;

-- 1. LA SAUVEGARDE, AVANT TOUTE ÉCRITURE : les deux jumelles, TOUTES leurs tâches, leurs remises en vente, leurs
--    questions, les deux annonces, les deux liens. Née protégée (RLS, aucun droit client).
CREATE TABLE public._backup_1111_retrait_lbc_relies AS
SELECT now() AS le, 'inventaire'::text AS t, i.id::text AS cle, to_jsonb(i.*) AS ligne
  FROM public.inventaire i WHERE i.id IN (1792340705460616, 1792340705460686)
UNION ALL
SELECT now(), 'cross_post_jobs', j.id::text, to_jsonb(j.*)
  FROM public.cross_post_jobs j
 WHERE j.user_id = 'faf5021a-479a-4bb3-b3ec-c296770739b7' AND j.inventaire_id IN (1792340705460616, 1792340705460686)
UNION ALL
SELECT now(), 'remises_en_vente', r.id::text, to_jsonb(r.*)
  FROM public.remises_en_vente r
 WHERE r.user_id = 'faf5021a-479a-4bb3-b3ec-c296770739b7' AND r.inventaire_id IN (1792340705460616, 1792340705460686)
UNION ALL
SELECT now(), 'inventaire_doublons', q.id::text, to_jsonb(q.*)
  FROM public.inventaire_doublons q
 WHERE q.user_id = 'faf5021a-479a-4bb3-b3ec-c296770739b7' AND (q.garde IN (1792340705460616, 1792340705460686) OR q.absorbe IN (1792340705460616, 1792340705460686))
UNION ALL
SELECT now(), 'annonces_plateforme', a.id::text, to_jsonb(a.*)
  FROM public.annonces_plateforme a
 WHERE a.id IN ('0607c980-29ee-40f9-93df-e79c10650c6a', 'bffc6551-e8f7-4769-a6e9-f4618b1fdfad')
UNION ALL
SELECT now(), 'fiches_liees_comptes', f.id::text, to_jsonb(f.*)
  FROM public.fiches_liees_comptes f WHERE f.id IN (116, 186);
ALTER TABLE public._backup_1111_retrait_lbc_relies ADD COLUMN resultat jsonb;
ALTER TABLE public._backup_1111_retrait_lbc_relies ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public._backup_1111_retrait_lbc_relies FROM PUBLIC, anon, authenticated;

DO $controle$
DECLARE v_n integer;
BEGIN
  SELECT count(*) INTO v_n FROM public._backup_1111_retrait_lbc_relies WHERE t IN ('inventaire', 'annonces_plateforme', 'fiches_liees_comptes');
  IF v_n <> 6 THEN RAISE EXCEPTION 'sauvegarde incomplète (% lignes sur 6 : 2 fiches, 2 annonces, 2 liens) : rien n''est écrit', v_n; END IF;
  SELECT count(*) INTO v_n FROM public._backup_1111_retrait_lbc_relies
   WHERE t = 'cross_post_jobs' AND cle IN ('ad4e2895-c5e3-40e9-8bf0-5f1b10199479', '21a23488-a389-49a2-b228-5fc416d82c93');
  IF v_n <> 2 THEN RAISE EXCEPTION 'sauvegarde incomplète (% dépôts sur 2) : rien n''est écrit', v_n; END IF;
END
$controle$;

-- 2. Dépôt ad4e2895 (rattaché par le titre seul) — ORDRE NOMMÉ de Nico du 11/11/2026, hors de la règle : le geste du logo
--    du Stock, sous les droits du compte relié. RLS, numéro rempli depuis le lien, gardes doublon / annonce remplacée /
--    annonce déclarée retirée : tout joue comme dans l'app.
SELECT set_config('request.jwt.claims', json_build_object('sub', 'faf5021a-479a-4bb3-b3ec-c296770739b7', 'role', 'authenticated')::text, true);
SELECT set_config('request.jwt.claim.sub', 'faf5021a-479a-4bb3-b3ec-c296770739b7', true);
SET LOCAL ROLE authenticated;
INSERT INTO public.cross_post_jobs (user_id, inventaire_id, platform, action, status, photo_option, title, listing_url, platform_fields)
SELECT j.user_id, j.inventaire_id, j.platform, 'delete', 'pending', 'original', j.title, j.listing_url,
       CASE WHEN j.listing_url IS NOT NULL THEN '{}'::jsonb ELSE '{"removal_url_missing": true}'::jsonb END
  FROM public.cross_post_jobs j
 WHERE j.id = 'ad4e2895-c5e3-40e9-8bf0-5f1b10199479' AND j.user_id = auth.uid()
   AND j.status = 'published' AND j.platform = 'leboncoin';
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true), set_config('request.jwt.claim.sub', '', true);
-- Le journal du geste (src/utils/journalRetraits.js : « intervention_support : retrait armé à la main par nous, sur GO nommé »).
INSERT INTO public.usage_logs (user_id, feature, metadata)
SELECT 'faf5021a-479a-4bb3-b3ec-c296770739b7', 'retrait_annonces', jsonb_build_object(
         'chemin', 'intervention_support', 'plateformes', jsonb_build_array('leboncoin'), 'n_annonces', count(*),
         'n_articles', 1, 'article_id', '1792340705460616', 'depot', 'ad4e2895-c5e3-40e9-8bf0-5f1b10199479',
         'ordre', 'Nico 11/11/2026 (L1) : ordre nommé, rattachement par le titre seul, hors règle')
  FROM public.cross_post_jobs d
 WHERE d.user_id = 'faf5021a-479a-4bb3-b3ec-c296770739b7' AND d.action = 'delete' AND d.platform = 'leboncoin'
   AND d.inventaire_id = 1792340705460616 AND d.created_at = now() AND d.status = 'pending'
HAVING count(*) > 0;

-- 3. LA RÈGLE, pour les deux fiches supprimées : 1789889101726001 → retrait du dépôt 21a23488 (copie certaine) ;
--    1789889098557002 → aucun retrait par elle (titre seul : refus tracé ; pas de question, le retrait de l'étape 2
--    l'attend déjà). Pour les deux : la marque de la jumelle et le bilan.
UPDATE public._backup_1111_retrait_lbc_relies
   SET resultat = jsonb_build_object(
         '1789889098557002', public.armer_retraits_fiche_liee('447d920c-976a-4d8f-aff4-a2998050358c'::uuid, 1789889098557002),
         '1789889101726001', public.armer_retraits_fiche_liee('447d920c-976a-4d8f-aff4-a2998050358c'::uuid, 1789889101726001))
 WHERE t = 'fiches_liees_comptes' AND cle = '116';

-- 4. LE CONTRÔLE : exactement deux retraits nés, chacun sur SA fiche jumelle et SON annonce, au nom du compte relié ;
--    aucune question, aucune tâche annulée ; les deux marques ; et rien d'autre.
DO $apres$
DECLARE v_n integer; r jsonb;
BEGIN
  SELECT resultat INTO r FROM public._backup_1111_retrait_lbc_relies WHERE t = 'fiches_liees_comptes' AND cle = '116';
  IF COALESCE((r #>> '{1789889101726001,armes}')::integer, -1) <> 1 OR jsonb_array_length(COALESCE(r #> '{1789889101726001,erreurs}', '[]'::jsonb)) <> 0 THEN
    RAISE EXCEPTION 'la règle n''a pas armé le retrait du dépôt 21a23488 (%) : rien n''est écrit', r -> '1789889101726001';
  END IF;
  IF COALESCE((r #>> '{1789889098557002,armes}')::integer, -1) <> 0 OR COALESCE((r #>> '{1789889098557002,questions}')::integer, -1) <> 0
     OR jsonb_array_length(COALESCE(r #> '{1789889098557002,erreurs}', '[]'::jsonb)) <> 0 THEN
    RAISE EXCEPTION 'la règle a armé un retrait ou posé une question sur la copie rattachée par le titre seul (%) : rien n''est écrit', r -> '1789889098557002';
  END IF;
  SELECT count(*) INTO v_n FROM public.cross_post_jobs d, public.cross_post_jobs j
   WHERE d.user_id = 'faf5021a-479a-4bb3-b3ec-c296770739b7' AND d.platform = 'leboncoin' AND d.action = 'delete'
     AND d.status = 'pending' AND d.created_at = now() AND d.inventaire_id = j.inventaire_id
     AND j.id IN ('ad4e2895-c5e3-40e9-8bf0-5f1b10199479', '21a23488-a389-49a2-b228-5fc416d82c93')
     AND public.listing_designe(btrim(j.platform_listing_id), d.listing_url, d.platform_listing_id);
  IF v_n <> 2 THEN RAISE EXCEPTION 'retraits attendus : 2 (un par annonce, sur sa jumelle), trouvés : % — rien n''est écrit', v_n; END IF;
  SELECT count(*) INTO v_n FROM public.cross_post_jobs d
   WHERE d.user_id IN ('faf5021a-479a-4bb3-b3ec-c296770739b7', '447d920c-976a-4d8f-aff4-a2998050358c')
     AND d.action = 'delete' AND d.created_at = now();
  IF v_n <> 2 THEN RAISE EXCEPTION 'ce script ne doit créer que 2 retraits, il en a créé % — rien n''est écrit', v_n; END IF;
  SELECT count(*) INTO v_n FROM public.inventaire_doublons q
   WHERE q.user_id = 'faf5021a-479a-4bb3-b3ec-c296770739b7' AND q.created_at = now();
  IF v_n <> 0 THEN RAISE EXCEPTION 'une question a été posée (%) — rien n''est écrit', v_n; END IF;
  SELECT count(*) INTO v_n FROM public.cross_post_jobs j
   WHERE j.user_id = 'faf5021a-479a-4bb3-b3ec-c296770739b7' AND j.inventaire_id IN (1792340705460616, 1792340705460686)
     AND COALESCE(j.action, 'publish') IN ('publish', 'republish') AND j.status = 'cancelled'
     AND COALESCE(j.platform_fields, '{}'::jsonb) ? 'retrait_partout_compte_relie';
  IF v_n <> 0 THEN RAISE EXCEPTION 'une tâche a été annulée (%) alors que la garde en voyait 0 — rien n''est écrit', v_n; END IF;
  SELECT count(*) INTO v_n FROM public.jumelles_retirees_partout m
   WHERE m.user_id = 'faf5021a-479a-4bb3-b3ec-c296770739b7' AND m.inventaire_id IN (1792340705460616, 1792340705460686)
     AND m.de_compte = '447d920c-976a-4d8f-aff4-a2998050358c' AND m.le = now();
  IF v_n <> 2 THEN RAISE EXCEPTION 'marques des jumelles : % sur 2 — rien n''est écrit', v_n; END IF;
  SELECT count(*) INTO v_n FROM public.inventaire i
   WHERE i.id IN (1792340705460616, 1792340705460686) AND i.statut = 'stock' AND i.fusionne_dans IS NULL;
  IF v_n <> 2 THEN RAISE EXCEPTION 'une fiche jumelle a changé (% sur 2 au stock) — rien n''est écrit', v_n; END IF;
END
$apres$;

-- 5. Ce qui est parti (à relire avant le COMMIT ; la PREUVE suit l'exécution).
SELECT d.id AS retrait, d.inventaire_id, d.status,
       d.platform_fields #>> '{arme_par,chemin}' AS chemin, d.platform_fields #>> '{arme_par,pose_par}' AS pose_par
  FROM public.cross_post_jobs d
 WHERE d.user_id = 'faf5021a-479a-4bb3-b3ec-c296770739b7' AND d.action = 'delete' AND d.created_at = now()
 ORDER BY d.inventaire_id;
SELECT resultat FROM public._backup_1111_retrait_lbc_relies WHERE t = 'fiches_liees_comptes' AND cle = '116';

COMMIT;
