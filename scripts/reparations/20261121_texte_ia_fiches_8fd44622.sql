-- (21/11/2026, ordre de Nico, point 3) Les 4 fiches du compte 8fd44622 dont la « description » est la copie Leboncoin
-- RÉDIGÉE PAR L'IA (lot du 19/11 17:19 → 17:32 : la lecture d'origine avait échoué 3 fois, « illisible », puis la garde
-- du lot a fait rédiger sans le texte du vendeur ; ce texte s'est retrouvé sur la fiche, sans marqueur ni journal).
-- La fiche redevient SANS description, son marqueur dit « à relire » (sans date — la fusion des attributs ne retire
-- jamais une clé : on la remplace), et la lecture d'origine est redemandée, pour que le vrai texte Vinted soit lu.
-- Rien d'autre : ni titre, ni photos, ni annonces en ligne (eBay, Leboncoin) — elles se corrigent APRÈS la lecture.
-- Sauvegardes : _backup_2111_texte_ia_8fd44622 (fiches), _backup_2111_lecture_8fd44622 (demandes).
-- Inverse : 20261121_texte_ia_fiches_8fd44622_INVERSE.sql. Garde : 4 fiches exactement, sinon rien n'est écrit.
BEGIN;
DO $garde$ BEGIN
  IF to_regclass('public._backup_2111_texte_ia_8fd44622') IS NOT NULL THEN RAISE EXCEPTION 'script déjà passé : rien n''est écrit'; END IF;
END $garde$;
CREATE TABLE public._backup_2111_texte_ia_8fd44622 AS
SELECT now() AS le, i.id, i.user_id, i.description, i.attributs -> 'description_source' AS description_source
  FROM public.inventaire i
 WHERE i.user_id = '8fd44622-c0cb-4cd8-b2a0-a3ef33bc42cb' AND i.origine = 'vinted_sync'
   AND i.id IN (1794774017008008, 1794774017008007, 1794774017007006, 1794774016492014)
   AND NULLIF(btrim(i.description), '') IS NOT NULL;
CREATE TABLE public._backup_2111_lecture_8fd44622 AS
SELECT now() AS le, d.* FROM public.lectures_origine_demandees d
 WHERE (d.user_id, d.inventaire_id) IN (SELECT user_id, id FROM public._backup_2111_texte_ia_8fd44622);
ALTER TABLE public._backup_2111_texte_ia_8fd44622 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public._backup_2111_lecture_8fd44622 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_2111_texte_ia_8fd44622 FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public._backup_2111_lecture_8fd44622 FROM PUBLIC, anon, authenticated;
DO $ecrit$ DECLARE n int; BEGIN
  IF (SELECT count(*) FROM public._backup_2111_texte_ia_8fd44622) <> 4 THEN
    RAISE EXCEPTION 'attendu 4 fiches, lu % : rien n''est écrit', (SELECT count(*) FROM public._backup_2111_texte_ia_8fd44622);
  END IF;
  PERFORM set_config('fillsell.source_changement', 'reparation:2111_texte_ia_8fd44622', true);
  UPDATE public.inventaire i SET description = NULL,
         attributs = jsonb_build_object('description_source', jsonb_build_object(
           'v', 'vinted', 'source', 'vinted_detail', 'at', NULL, 'via', 'reference_a_relire', 'motif', 'texte_ia_2111'))
    FROM public._backup_2111_texte_ia_8fd44622 b
   WHERE i.id = b.id AND i.user_id = b.user_id AND i.description = b.description;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 4 THEN RAISE EXCEPTION 'attendu 4 fiches, % touchées : rien n''est écrit', n; END IF;
  UPDATE public.lectures_origine_demandees d SET faite_le = NULL, prise_le = NULL, essai_le = NULL, motif = NULL,
         echecs = 0, dernier_echec = NULL, demandee_le = now()
    FROM public._backup_2111_texte_ia_8fd44622 b WHERE d.user_id = b.user_id AND d.inventaire_id = b.id;
  INSERT INTO public.lectures_origine_demandees (user_id, inventaire_id, plateforme, demandee_le)
  SELECT b.user_id, b.id, 'vinted', now() FROM public._backup_2111_texte_ia_8fd44622 b
  ON CONFLICT (user_id, inventaire_id) DO NOTHING;
  PERFORM set_config('fillsell.source_changement', '', true);
END $ecrit$;
SELECT f.id, f.description IS NULL AS sans_description, f.description_lue_le, f.origine_lue_le
  FROM public.fiches_contenu_vendeur('8fd44622-c0cb-4cd8-b2a0-a3ef33bc42cb',
         ARRAY[1794774017008008, 1794774017008007, 1794774017007006, 1794774016492014]::bigint[]) f ORDER BY 1;
COMMIT;
