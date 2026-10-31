-- ═══════════════════════════════════════════════════════════════════════════
-- LOT F (31/10) — tiblancdeshaut (Johan) : les 12 articles importés en double par les relevés Leboncoin du 30/10
-- ═══════════════════════════════════════════════════════════════════════════
-- Ordre de Nico (brief du lot F, point 4b) : fusionner ces 12 « par le chemin normal de l'app, pas par un patch SQL »,
-- jamais sur le titre seul. Ce script répond « Oui, c'est le même article » aux 13 questions DÉJÀ posées par le moteur
-- (inventaire_doublons « proposee ») — la fonction même du bouton de l'app (inventaire_doublon_decider, au nom du
-- compte), qui fusionne (inventaire_fusionner_pour, journalisé, réversible par inventaire_defusionner) et clôt la
-- question. Aucune plateforme touchée, aucun job relancé, aucun mail.
-- PREUVE exigée pour CHAQUE paire, vérifiée avant toute écriture (sinon rien n'est écrit) : une annonce Leboncoin de
-- la fiche absorbée et une annonce Leboncoin de la fiche gardée (ou de la chaîne) avec le même titre, la même
-- description, TOUTES les photos de l'ancienne présentes à l'identique dans la nouvelle (même fichier Leboncoin :
-- même empreinte dans l'adresse de l'image) et jamais vues par le même relevé (l'une a remplacé l'autre).
-- Sauvegardes : _backup_3110_johan_doublons_{inventaire,annonces,jobs,questions}. Inverse : …_INVERSE.sql.
-- ESSAI À BLANC : le corps exact du script de réparation, terminé par ROLLBACK (rien n est écrit).
BEGIN;

CREATE TEMP TABLE _paires (ordre int, question uuid, garde bigint, absorbe bigint, garde_preuve bigint) ON COMMIT DROP;
INSERT INTO _paires VALUES
  (1,  '242520d7-9e81-4627-90cd-dbae07047262', 1792573098083,    1793371573790, 1792573098083),    -- Déco Buffet Mariage
  (2,  '969ecdd7-e8fb-4e7b-9fbb-7a1736e67405', 1792589405542,    1793371573567, 1792589405542),    -- Manteau Trafaluc
  (3,  '0a46e3fb-a539-4a59-95df-5ab304523cf0', 1792596015777,    1793371573602, 1792596015777),    -- Pantalon chino Tommy Hilfiger
  (4,  'cb02ec45-e7e6-4233-8798-785b4192263c', 1792586859815,    1793371573389, 1792586859815),    -- Pantalon de ski Quicksilver
  (5,  '35540f84-60b2-42eb-96a4-d56590f36111', 1792573098066,    1793371573760, 1792573098066),    -- Petit Sac Cabas Zadig & Voltaire
  (6,  'e5215a0c-6b1c-4fe7-a74b-0a0bcf1ad686', 1792572621420000, 1793371573411, 1792572621420000), -- Pull Col V Lacoste Violet
  (7,  '80a62950-daa2-4060-80db-9d52b1c0b5b6', 1792677766094,    1793371573474, 1792677766094),    -- Pull Authentic Line
  (8,  'fbb0025c-fe2b-41fd-826a-b5b62dacf7de', 1792586354104,    1793371573308, 1792586354104),    -- Sac Michael Kors orange
  (9,  '97c4ad75-7bef-4ee2-a9ba-b1263c7d5d9a', 1792602776180,    1793371573776, 1792602776180),    -- Sweatshirt McDonald's
  (10, '006c3c03-b0dd-4b8b-860d-692854159d2b', 1793354281854,    1793371573655, 1793354281854),    -- Sweatshirt Pull & Bear (30/10 15:46 → 10:58)
  (11, '252cfae3-f975-4be7-bc98-3bd0bccd0f91', 1792681809620,    1793354281854, 1792681809620),    -- Sweatshirt Pull & Bear (10:58 → fiche d'origine)
  (12, '3c0abf71-fdaf-4e6f-b281-2297494b80a2', 1792584997615,    1793371573547, 1792584997615),    -- T-shirt Adidas jaune
  (13, '56752535-318c-41c6-9922-97c936fccf06', 1792586001422,    1793354281870, 1792586001422);    -- Veste Lacoste noire coupe-vent

-- ── 1. Les preuves, toutes, avant la moindre écriture ──────────────────────
DO $$
DECLARE p record; n int := 0;
BEGIN
  FOR p IN SELECT * FROM _paires ORDER BY ordre LOOP
    IF NOT EXISTS (SELECT 1 FROM inventaire_doublons q WHERE q.id = p.question AND q.user_id = '7b9d8a71-6464-457f-abdc-9baee2a8543f'
                     AND q.statut = 'proposee' AND q.garde = p.garde AND q.absorbe = p.absorbe) THEN
      RAISE EXCEPTION 'question % : introuvable ou déjà tranchée', p.question;
    END IF;
    IF EXISTS (SELECT 1 FROM inventaire i WHERE i.id IN (p.garde, p.absorbe) AND (i.statut <> 'stock' OR i.fusionne_dans IS NOT NULL)) THEN
      RAISE EXCEPTION 'paire % : une fiche n''est plus en stock ou déjà fondue', p.ordre;
    END IF;
    IF EXISTS (SELECT 1 FROM ventes v WHERE v.inventaire_id = p.absorbe) THEN
      RAISE EXCEPTION 'paire % : la fiche absorbée porte une vente', p.ordre;
    END IF;
    IF NOT EXISTS (
      WITH h AS (
        SELECT a.id, a.inventaire_id, a.run_id, lower(a.titre) t, md5(coalesce(a.capture ->> 'description', '')) d,
               coalesce(length(a.capture ->> 'description'), 0) dl,
               array(SELECT DISTINCT substring(x FROM 'images/[0-9a-z]{2}/[0-9a-z]{2}/[0-9a-z]{2}/([0-9a-z]{40})')
                       FROM jsonb_array_elements_text(coalesce(a.capture -> 'photos', '[]'::jsonb)) x WHERE x ~ 'images/') hs
          FROM annonces_plateforme a
         WHERE a.user_id = '7b9d8a71-6464-457f-abdc-9baee2a8543f' AND a.platform = 'leboncoin')
      SELECT 1 FROM h s JOIN h t ON t.inventaire_id = p.garde_preuve
       WHERE s.inventaire_id = p.absorbe AND s.t = t.t AND s.d = t.d AND t.dl >= 20
         AND cardinality(t.hs) >= 1 AND s.hs @> t.hs AND s.run_id IS DISTINCT FROM t.run_id) THEN
      RAISE EXCEPTION 'paire % : preuve absente (photos identiques + titre + description, jamais en ligne ensemble)', p.ordre;
    END IF;
    n := n + 1;
  END LOOP;
  RAISE NOTICE 'preuves vérifiées : % paires', n;
END $$;

-- ── 2. Sauvegardes ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS _backup_3110_johan_doublons_inventaire AS SELECT now() sauve_le, i.* FROM inventaire i WHERE false;
INSERT INTO _backup_3110_johan_doublons_inventaire SELECT now(), i.* FROM inventaire i WHERE i.id IN (SELECT garde FROM _paires UNION SELECT absorbe FROM _paires);
CREATE TABLE IF NOT EXISTS _backup_3110_johan_doublons_annonces AS SELECT now() sauve_le, a.* FROM annonces_plateforme a WHERE false;
INSERT INTO _backup_3110_johan_doublons_annonces SELECT now(), a.* FROM annonces_plateforme a WHERE a.inventaire_id IN (SELECT absorbe FROM _paires);
CREATE TABLE IF NOT EXISTS _backup_3110_johan_doublons_jobs AS SELECT now() sauve_le, j.* FROM cross_post_jobs j WHERE false;
INSERT INTO _backup_3110_johan_doublons_jobs SELECT now(), j.* FROM cross_post_jobs j WHERE j.inventaire_id IN (SELECT absorbe FROM _paires);
CREATE TABLE IF NOT EXISTS _backup_3110_johan_doublons_questions AS SELECT now() sauve_le, q.* FROM inventaire_doublons q WHERE false;
INSERT INTO _backup_3110_johan_doublons_questions SELECT now(), q.* FROM inventaire_doublons q WHERE q.id IN (SELECT question FROM _paires);

-- ── 3. « Oui, c'est le même article » — la fonction du bouton de l'app, au nom du compte ─────────
CREATE TEMP TABLE _resultats (ordre int, question uuid, resultat jsonb) ON COMMIT DROP;
GRANT INSERT, SELECT ON _resultats TO authenticated;
GRANT SELECT ON _paires TO authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"7b9d8a71-6464-457f-abdc-9baee2a8543f","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
INSERT INTO _resultats SELECT p.ordre, p.question, public.inventaire_doublon_decider(p.question, 'oui') FROM _paires p WHERE p.ordre = 1;
INSERT INTO _resultats SELECT p.ordre, p.question, public.inventaire_doublon_decider(p.question, 'oui') FROM _paires p WHERE p.ordre = 2;
INSERT INTO _resultats SELECT p.ordre, p.question, public.inventaire_doublon_decider(p.question, 'oui') FROM _paires p WHERE p.ordre = 3;
INSERT INTO _resultats SELECT p.ordre, p.question, public.inventaire_doublon_decider(p.question, 'oui') FROM _paires p WHERE p.ordre = 4;
INSERT INTO _resultats SELECT p.ordre, p.question, public.inventaire_doublon_decider(p.question, 'oui') FROM _paires p WHERE p.ordre = 5;
INSERT INTO _resultats SELECT p.ordre, p.question, public.inventaire_doublon_decider(p.question, 'oui') FROM _paires p WHERE p.ordre = 6;
INSERT INTO _resultats SELECT p.ordre, p.question, public.inventaire_doublon_decider(p.question, 'oui') FROM _paires p WHERE p.ordre = 7;
INSERT INTO _resultats SELECT p.ordre, p.question, public.inventaire_doublon_decider(p.question, 'oui') FROM _paires p WHERE p.ordre = 8;
INSERT INTO _resultats SELECT p.ordre, p.question, public.inventaire_doublon_decider(p.question, 'oui') FROM _paires p WHERE p.ordre = 9;
INSERT INTO _resultats SELECT p.ordre, p.question, public.inventaire_doublon_decider(p.question, 'oui') FROM _paires p WHERE p.ordre = 10;
INSERT INTO _resultats SELECT p.ordre, p.question, public.inventaire_doublon_decider(p.question, 'oui') FROM _paires p WHERE p.ordre = 11;
INSERT INTO _resultats SELECT p.ordre, p.question, public.inventaire_doublon_decider(p.question, 'oui') FROM _paires p WHERE p.ordre = 12;
INSERT INTO _resultats SELECT p.ordre, p.question, public.inventaire_doublon_decider(p.question, 'oui') FROM _paires p WHERE p.ordre = 13;
RESET ROLE;

-- ── 4. Tout ou rien ; la trace ───────────────────────────────────────────────
DO $$
DECLARE nok int;
BEGIN
  SELECT count(*) INTO nok FROM _resultats WHERE NOT coalesce((resultat ->> 'ok')::boolean, false);
  IF nok > 0 OR (SELECT count(*) FROM _resultats) <> 13 THEN
    RAISE EXCEPTION 'fusions refusées : % — %', nok, (SELECT jsonb_agg(jsonb_build_object('ordre', ordre, 'r', resultat)) FROM _resultats WHERE NOT coalesce((resultat ->> 'ok')::boolean, false));
  END IF;
END $$;
INSERT INTO usage_logs (user_id, feature, metadata)
SELECT '7b9d8a71-6464-457f-abdc-9baee2a8543f', 'reparation_lot_f_doublons_lbc',
       jsonb_build_object('par', 'claude (ordre de Nico, lot F, 31/10)', 'chemin', 'inventaire_doublon_decider oui (bouton de l''app)',
                          'preuve', 'photos Leboncoin identiques + titre + description, jamais en ligne ensemble',
                          'fusions', (SELECT jsonb_agg(jsonb_build_object('ordre', r.ordre, 'question', r.question, 'fusion_id', r.resultat ->> 'fusion_id') ORDER BY r.ordre) FROM _resultats r));
SELECT ordre, question, resultat ->> 'ok' ok, resultat ->> 'fusion_id' fusion_id FROM _resultats ORDER BY ordre;
ROLLBACK;
