-- ═══════════════════════════════════════════════════════════════════════════
-- FERREIRASAB (18e461c1) : DEUX « ANNONCE EN DOUBLE ? » QUE LE MOTEUR NE POUVAIT PAS VOIR
-- ═══════════════════════════════════════════════════════════════════════════
-- Sur 136 paires d'annonces Leboncoin jumelles (même titre, même prix, même photo
-- de couverture, deux identifiants, deux dates de publication), le moteur a posé
-- 134 fois la question « Annonce en double ? ». Les 2 autres : l'une des deux
-- annonces n'a QUE sa couverture (rien de capturé) et cette couverture est dans
-- photo_empreintes_echecs (empreinte impossible) — sans photo lisible, le moteur
-- ne peut pas dire « même photo », et jamais le titre seul. L'une des jumelles a
-- donc été rattachée à sa fiche Vinted (photo ET titre, sur ses autres photos),
-- l'autre est entrée au stock comme un article à part, sans question :
--   · « Pyjama Bébé garçon - neuf - 3 pommes - Taille 0 mois » (8 €) :
--     b6025dc9 (3272452432, fiche Vinted 1791795039539019) / 8ee55580 (3267668388, fiche 1791804499689) ;
--   · « Robe chic bimatière Velours & fleurs – orchestra - taille 6 » (7 €) :
--     e2483048 (3276092185, fiche Vinted 1791795039539020) / 397662b1 (3267668626, fiche 1791804499687).
-- La couverture des deux jumelles est la MÊME image (même URL img.leboncoin.fr) :
-- c'est la preuve « même photo », lue sur l'URL au lieu de l'empreinte.
-- Ce script pose la question par la porte du moteur (rapprochement_v3_appliquer,
-- décision « annonce_en_double » : la base garde ses gardes — jamais une fusion,
-- jamais un article vendu, une paire tranchée n'est jamais reposée). La personne
-- tranche. Rien n'est retiré, vendu, fondu ni notifié.
-- Inverse :
--   DELETE FROM inventaire_doublons WHERE user_id = '18e461c1-7107-4f40-b07f-6de8fb5c2948'
--      AND statut = 'proposee' AND preuves ->> 'origine_question' = 'support_1210_photo_illisible';
--   UPDATE inventaire i SET a_verifier = b.a_verifier FROM _backup_1210_ferreira_doubles_lbc b WHERE b.id = i.id;

BEGIN;
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM annonces_plateforme
   WHERE user_id = '18e461c1-7107-4f40-b07f-6de8fb5c2948' AND disparu_le IS NULL AND (
         (id = 'b6025dc9-c874-41ff-a662-51b0fa5cc756' AND inventaire_id = 1791795039539019)
      OR (id = '8ee55580-31cf-4d0b-8709-81a5dabd2d29' AND inventaire_id = 1791804499689)
      OR (id = 'e2483048-9462-4fb1-8624-644cb606d402' AND inventaire_id = 1791795039539020)
      OR (id = '397662b1-9506-4f6c-a093-c188b950b613' AND inventaire_id = 1791804499687));
  IF n <> 4 THEN RAISE EXCEPTION 'état changé : % annonces sur 4 à leur place', n; END IF;
  IF EXISTS (SELECT 1 FROM inventaire_doublons q WHERE q.user_id = '18e461c1-7107-4f40-b07f-6de8fb5c2948'
               AND (least(q.garde, q.absorbe), greatest(q.garde, q.absorbe)) IN ((1791804499689, 1791795039539019), (1791804499687, 1791795039539020))) THEN
    RAISE EXCEPTION 'une question existe déjà pour l''une des deux paires';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS _backup_1210_ferreira_doubles_lbc AS
  SELECT now() sauve_le, i.id, i.a_verifier FROM inventaire i
   WHERE i.id IN (1791795039539019, 1791804499689, 1791795039539020, 1791804499687);
ALTER TABLE _backup_1210_ferreira_doubles_lbc ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON _backup_1210_ferreira_doubles_lbc FROM anon, authenticated;

DO $$
DECLARE r jsonb;
BEGIN
  r := rapprochement_v3_appliquer('18e461c1-7107-4f40-b07f-6de8fb5c2948', jsonb_build_array(
    jsonb_build_object('type', 'annonce_en_double', 'platform', 'leboncoin',
      'a', jsonb_build_object('annonce', 'b6025dc9-c874-41ff-a662-51b0fa5cc756'), 'b', jsonb_build_object('annonce', '8ee55580-31cf-4d0b-8709-81a5dabd2d29'),
      'preuves', jsonb_build_object('motif', 'annonce_en_double', 'photo', 'meme_url_couverture', 'titre', 1, 'prix_identique', true,
                                    'photo_illisible_pour_le_moteur', true, 'origine_question', 'support_1210_photo_illisible')),
    jsonb_build_object('type', 'annonce_en_double', 'platform', 'leboncoin',
      'a', jsonb_build_object('annonce', 'e2483048-9462-4fb1-8624-644cb606d402'), 'b', jsonb_build_object('annonce', '397662b1-9506-4f6c-a093-c188b950b613'),
      'preuves', jsonb_build_object('motif', 'annonce_en_double', 'photo', 'meme_url_couverture', 'titre', 1, 'prix_identique', true,
                                    'photo_illisible_pour_le_moteur', true, 'origine_question', 'support_1210_photo_illisible'))),
    'normal', false);
  IF COALESCE((r -> 'faits' ->> 'annonce_en_double')::int, 0) <> 2 THEN
    RAISE EXCEPTION 'questions non posées : %', r;
  END IF;
  RAISE NOTICE 'appliquer : %', r;
END $$;
COMMIT;
