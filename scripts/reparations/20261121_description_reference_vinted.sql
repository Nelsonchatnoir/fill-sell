-- (21/11/2026, ordre de Nico, point 3) Les fiches dont la « description » n'est qu'une RÉFÉRENCE du flux Next.js de la
-- page Vinted (« $17b », « $17d »… — lireFluxNextVinted ≤ 0.6.195 ne la résolvait pas) : 8 fiches, comptes 52f5dc70 (5),
-- 35ab6f0f (2), d87570eb (1), lues le 01/11, le 19/11 et le 20/11. Ce n'est pas le texte du vendeur : la fiche redevient
-- SANS description et sa lecture d'origine est redemandée, pour qu'une vraie lecture (extension 0.6.196) pose le texte
-- du vendeur. Tant qu'elle n'est pas faite, get-pending-jobs retient leurs publications en file (lectureOrigineEnAttente)
-- puis leur impose le texte lu (contenuAImposer) ; generate-listing ne rédige pas à sa place (texte_origine_non_lu).
-- Rien d'autre n'est touché : ni titre, ni photos, ni jobs, ni annonces.
-- Sauvegardes : _backup_2111_description_reference (fiches), _backup_2111_lecture_reference (demandes).
-- Inverse : 20261121_description_reference_vinted_INVERSE.sql. Gardes : 8 fiches exactement, sinon rien n'est écrit.
BEGIN;
DO $garde$ BEGIN
  IF to_regclass('public._backup_2111_description_reference') IS NOT NULL THEN RAISE EXCEPTION 'script déjà passé : rien n''est écrit'; END IF;
END $garde$;
CREATE TABLE public._backup_2111_description_reference AS
SELECT now() AS le, i.id, i.user_id, i.description, i.attributs -> 'description_source' AS description_source
  FROM public.inventaire i
 WHERE i.description ~ '^\s*\$[0-9a-zA-Z]{1,8}\s*$' AND i.origine = 'vinted_sync';
CREATE TABLE public._backup_2111_lecture_reference AS
SELECT now() AS le, d.* FROM public.lectures_origine_demandees d
 WHERE (d.user_id, d.inventaire_id) IN (SELECT user_id, id FROM public._backup_2111_description_reference);
ALTER TABLE public._backup_2111_description_reference ENABLE ROW LEVEL SECURITY;
ALTER TABLE public._backup_2111_lecture_reference ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_2111_description_reference FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public._backup_2111_lecture_reference FROM PUBLIC, anon, authenticated;
DO $ecrit$ DECLARE n int; BEGIN
  IF (SELECT count(*) FROM public._backup_2111_description_reference) <> 8 THEN
    RAISE EXCEPTION 'attendu 8 fiches, lu % : rien n''est écrit', (SELECT count(*) FROM public._backup_2111_description_reference);
  END IF;
  PERFORM set_config('fillsell.source_changement', 'reparation:2111_description_reference', true);
  UPDATE public.inventaire i SET description = NULL, attributs = i.attributs - 'description_source'
    FROM public._backup_2111_description_reference b
   WHERE i.id = b.id AND i.user_id = b.user_id AND i.description = b.description;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 8 THEN RAISE EXCEPTION 'attendu 8 fiches, % touchées : rien n''est écrit', n; END IF;
  -- La lecture d'origine : redemandée, fraîche (le lecteur la prend à l'alarme, sans verrou).
  UPDATE public.lectures_origine_demandees d SET faite_le = NULL, prise_le = NULL, essai_le = NULL, motif = NULL,
         echecs = 0, dernier_echec = NULL, demandee_le = now()
    FROM public._backup_2111_description_reference b WHERE d.user_id = b.user_id AND d.inventaire_id = b.id;
  INSERT INTO public.lectures_origine_demandees (user_id, inventaire_id, plateforme, demandee_le)
  SELECT b.user_id, b.id, 'vinted', now() FROM public._backup_2111_description_reference b
  ON CONFLICT (user_id, inventaire_id) DO NOTHING;
  PERFORM set_config('fillsell.source_changement', '', true);
END $ecrit$;
SELECT left(b.user_id::text, 8) AS compte, b.id, b.description AS avant, i.description AS apres,
       d.faite_le IS NULL AS lecture_redemandee
  FROM public._backup_2111_description_reference b
  JOIN public.inventaire i ON i.id = b.id
  LEFT JOIN public.lectures_origine_demandees d ON d.user_id = b.user_id AND d.inventaire_id = b.id
 ORDER BY 1, 2;
COMMIT;
