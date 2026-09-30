-- ═══════════════════════════════════════════════════════════════════════════
-- RÈGLE LOUIS — « Déjà vendu ? » jamais posée pour deux exemplaires (GO Nico 30/09)
-- ═══════════════════════════════════════════════════════════════════════════
-- Deux annonces sur la même plateforme sont deux exemplaires (règle du 27/09).
-- La question « Déjà vendu ? » (motif homonyme_vendu) rapproche une annonce en
-- ligne d'une fiche VENDUE au titre semblable. Si la fiche vendue avait déjà sa
-- propre annonce sur la plateforme de l'annonce en ligne, ce sont deux
-- exemplaires : la question n'est pas posée (un « oui » ferait retirer un
-- exemplaire encore à vendre — cas Louis, Beebs, 27/09).
--
-- Plateformes de la fiche vendue : toutes ses annonces (même disparues),
-- son identité Vinted, son relevé d'origine, ses dépôts publiés.
-- Plateforme de l'annonce en ligne : celle de la question (preuves.platform,
-- posée par rapprocher_importer) ; à défaut, les annonces vivantes de la fiche.
--
-- Garde posée AVANT l'insertion (BEFORE INSERT, RETURN NULL = pas de question) :
-- les appelants font ON CONFLICT DO NOTHING / IF FOUND ; la nouvelle fiche du
-- relevé reste une fiche à part (c'est l'issue « deux exemplaires »).
-- Une erreur ici ne bloque jamais l'insertion (la question est alors posée).
--
-- Les questions déjà ouvertes dans ce cas (2 le 30/09 : labouquinerie85,
-- lesforcesdelaudela) sont fermées en silence : caduque,
-- decide_par = 'regle_louis_deux_exemplaires'.
--
-- INVERSE :
--   DROP TRIGGER IF EXISTS inventaire_doublons_jamais_deux_exemplaires ON public.inventaire_doublons;
--   UPDATE inventaire_doublons SET statut = 'proposee', decide_le = NULL, decide_par = NULL
--    WHERE decide_par = 'regle_louis_deux_exemplaires';
-- ═══════════════════════════════════════════════════════════════════════════

SET lock_timeout = '3s';

CREATE OR REPLACE FUNCTION public.inventaire_doublons_jamais_deux_exemplaires()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $f$
DECLARE
  v_vendue bigint; v_en_ligne bigint; v_pf_vendue text[]; v_pf_question text[];
BEGIN
  IF NEW.motif IS DISTINCT FROM 'homonyme_vendu' OR NEW.statut IS DISTINCT FROM 'proposee' THEN
    RETURN NEW;
  END IF;
  BEGIN
    SELECT CASE WHEN g.statut = 'vendu' THEN g.id WHEN a.statut = 'vendu' THEN a.id END,
           CASE WHEN g.statut = 'vendu' THEN a.id WHEN a.statut = 'vendu' THEN g.id END
      INTO v_vendue, v_en_ligne
      FROM inventaire g, inventaire a WHERE g.id = NEW.garde AND a.id = NEW.absorbe;
    IF v_vendue IS NULL THEN RETURN NEW; END IF;

    SELECT ARRAY(SELECT DISTINCT x FROM (
             SELECT CASE WHEN i.vinted_item_id IS NOT NULL OR i.origine = 'vinted_sync' THEN 'vinted' END x FROM inventaire i WHERE i.id = v_vendue
             UNION ALL SELECT CASE WHEN i.origine LIKE 'releve\_%' THEN substr(i.origine, 8) END FROM inventaire i WHERE i.id = v_vendue
             UNION ALL SELECT ap.platform FROM annonces_plateforme ap WHERE ap.inventaire_id = v_vendue
             UNION ALL SELECT j.platform FROM cross_post_jobs j WHERE j.inventaire_id = v_vendue AND j.status = 'published' AND j.action IN ('publish', 'republish')
           ) z WHERE x IS NOT NULL)
      INTO v_pf_vendue;

    IF NEW.preuves ? 'platform' AND NULLIF(NEW.preuves ->> 'platform', '') IS NOT NULL THEN
      v_pf_question := ARRAY[NEW.preuves ->> 'platform'];
    ELSE
      SELECT ARRAY(SELECT DISTINCT x FROM (
               SELECT CASE WHEN i.vinted_item_id IS NOT NULL AND i.disparu_le IS NULL THEN 'vinted' END x FROM inventaire i WHERE i.id = v_en_ligne
               UNION ALL SELECT ap.platform FROM annonces_plateforme ap WHERE ap.inventaire_id = v_en_ligne AND ap.disparu_le IS NULL
             ) z WHERE x IS NOT NULL)
        INTO v_pf_question;
    END IF;

    IF v_pf_vendue && v_pf_question THEN
      RETURN NULL;   -- deux exemplaires : pas de question
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'inventaire_doublons_jamais_deux_exemplaires (% / %): %', NEW.garde, NEW.absorbe, SQLERRM;
  END;
  RETURN NEW;
END $f$;

REVOKE ALL ON FUNCTION public.inventaire_doublons_jamais_deux_exemplaires() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS inventaire_doublons_jamais_deux_exemplaires ON public.inventaire_doublons;
CREATE TRIGGER inventaire_doublons_jamais_deux_exemplaires
  BEFORE INSERT ON public.inventaire_doublons
  FOR EACH ROW EXECUTE FUNCTION public.inventaire_doublons_jamais_deux_exemplaires();

-- Les questions déjà ouvertes dans ce cas se ferment en silence.
UPDATE inventaire_doublons d
   SET statut = 'caduque', decide_le = now(), decide_par = 'regle_louis_deux_exemplaires'
 WHERE d.statut = 'proposee' AND d.motif = 'homonyme_vendu'
   AND EXISTS (
     SELECT 1 FROM inventaire g
      WHERE g.id = d.garde AND g.statut = 'vendu'
        AND ARRAY(SELECT DISTINCT x FROM (
              SELECT CASE WHEN g.vinted_item_id IS NOT NULL OR g.origine = 'vinted_sync' THEN 'vinted' END x
              UNION ALL SELECT CASE WHEN g.origine LIKE 'releve\_%' THEN substr(g.origine, 8) END
              UNION ALL SELECT ap.platform FROM annonces_plateforme ap WHERE ap.inventaire_id = g.id
              UNION ALL SELECT j.platform FROM cross_post_jobs j WHERE j.inventaire_id = g.id AND j.status = 'published' AND j.action IN ('publish', 'republish')
            ) z WHERE x IS NOT NULL)
            && CASE WHEN NULLIF(d.preuves ->> 'platform', '') IS NOT NULL THEN ARRAY[d.preuves ->> 'platform']
                    ELSE ARRAY(SELECT DISTINCT ap.platform FROM annonces_plateforme ap WHERE ap.inventaire_id = d.absorbe AND ap.disparu_le IS NULL) END);
