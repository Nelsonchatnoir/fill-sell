-- ═════════════════════════════════════════════════════════════════════════════
-- REPUBLICATION PLANIFIÉE MULTIPLATEFORME — 5/5 : nos propres republications
-- se rattachent À LA SECONDE, sans attendre un relevé
-- 2026-09-18.
-- ═════════════════════════════════════════════════════════════════════════════
-- LE CAS DE JOSÉPHINE, mesuré en prod le 18/09 au soir. Sur Leboncoin, une
-- annonce remontée CHANGE D'IDENTIFIANT. Notre moteur de rapprochement sait
-- déjà le traiter, et bien : `rapprocher_classer`, bande A, rattache SANS
-- QUESTION tout identifiant qui appartient à un job FillSell
-- `action IN ('publish','republish') AND status='published'` — par
-- l'identifiant, jamais par le titre : pas d'homonyme, pas d'import
-- automatique en double. VÉRIFIÉ sur pièces : republication LBC du 17/09 à
-- 22:33 (article 1785444834689) → ancienne 3242179311 marquée disparue le
-- 18/09 à 09:16, nouvelle 3271694340 rattachée `source_rapprochement='job'`
-- à 09:15. Idem Beebs (33700062 → 33991308).
--
-- ⚠️ LE TROU : ça n'arrive QU'AU PROCHAIN RELEVÉ. Ornella a republié sur
-- Leboncoin à 16:18 le 18/09 ; à 21h, annonces_plateforme portait encore
-- l'ANCIEN identifiant (3264918502) marqué « en ligne ». Cinq heures pendant
-- lesquelles l'app pointait un lien mort. En automatique et en volume, cette
-- fenêtre serait permanente — et c'est exactement ce que le module va produire
-- à la chaîne. On ne l'ouvre pas sans l'avoir fermée.
--
-- CE QUE FAIT CE TRIGGER, et rien d'autre : quand un job `republish` de NOTRE
-- fait passe à `published` sur une plateforme à identifiant (leboncoin, beebs,
-- opla), il
--   · marque l'ANCIENNE annonce disparue (celle que le job a lui-même retirée,
--     retrouvée par old_platform_listing_id ou old_listing_url) ;
--   · pose la NOUVELLE, rattachée à l'article, source 'job', vue maintenant.
-- Il ne devine rien : les deux identifiants viennent du job, pas d'une
-- ressemblance. Vinted n'y entre pas (annonces_plateforme ne la porte pas :
-- son CHECK n'accepte que leboncoin/beebs/ebay/opla).
--
-- ⛔ IL NE PEUT PAS FAIRE ÉCHOUER UNE MISE À JOUR DE JOB. Tout est dans un
--    bloc EXCEPTION : une anomalie de rattachement se journalise, elle ne perd
--    pas la publication.
--
-- Idempotente. Retour arrière :
--   DROP TRIGGER cross_post_jobs_rattacher_republication ON public.cross_post_jobs;
-- ═════════════════════════════════════════════════════════════════════════════

-- L'identifiant d'annonce dans une URL, par plateforme — même lecture que
-- l'extension (background.js, idAnnonceDepuisUrl). NULL = illisible : on ne
-- devine pas.
CREATE OR REPLACE FUNCTION public.annonce_id_depuis_url(p_platform text, p_url text)
RETURNS text
LANGUAGE sql IMMUTABLE
AS $$
  SELECT CASE lower(COALESCE(p_platform, ''))
    WHEN 'leboncoin' THEN substring(COALESCE(p_url, '') from '/(\d{6,})(?:[/?#]|$)')
    WHEN 'beebs'     THEN substring(COALESCE(p_url, '') from '/p/(\d+)(?:[-/?#]|$)')
    WHEN 'opla'      THEN substring(COALESCE(p_url, '') from '(art_[A-Za-z0-9_-]+)')
    WHEN 'ebay'      THEN substring(COALESCE(p_url, '') from '/itm/(?:[^/?#]*/)?(\d{9,})')
    ELSE NULL END
$$;

CREATE OR REPLACE FUNCTION public.cross_post_jobs_rattacher_republication()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_pf      text := lower(COALESCE(NEW.platform, ''));
  v_neuf    text;
  v_ancien  text;
  v_titre   text;
BEGIN
  IF NEW.action <> 'republish' OR NEW.status <> 'published' THEN RETURN NEW; END IF;
  IF v_pf NOT IN ('leboncoin', 'beebs', 'opla') THEN RETURN NEW; END IF;

  BEGIN
    v_neuf := COALESCE(NULLIF(trim(NEW.platform_listing_id), ''),
                       annonce_id_depuis_url(v_pf, NEW.listing_url));
    IF v_neuf IS NULL THEN RETURN NEW; END IF;

    -- L'ancienne : celle que CE job a retirée. Opla ne supprime rien (PATCH en
    -- place) — l'ancien et le nouveau y sont le même identifiant, et la
    -- comparaison ci-dessous l'écarte d'elle-même.
    v_ancien := COALESCE(
      NULLIF(trim(NEW.platform_fields ->> 'old_platform_listing_id'), ''),
      annonce_id_depuis_url(v_pf, NEW.platform_fields ->> 'old_listing_url'));

    IF v_ancien IS NOT NULL AND v_ancien <> v_neuf THEN
      UPDATE annonces_plateforme
         SET disparu_le = COALESCE(disparu_le, now()), updated_at = now()
       WHERE user_id = NEW.user_id AND platform = v_pf AND listing_id = v_ancien;
    END IF;

    SELECT i.titre INTO v_titre FROM inventaire i WHERE i.id = NEW.inventaire_id;

    INSERT INTO annonces_plateforme
      (user_id, platform, listing_id, url, titre, prix, statut_plateforme,
       inventaire_id, job_id, source_rapprochement, proposition, vu_le, disparu_le)
    VALUES
      (NEW.user_id, v_pf, v_neuf, NEW.listing_url, COALESCE(NEW.title, v_titre), NEW.price,
       'en_ligne', NEW.inventaire_id, NEW.id, 'job', NULL, now(), NULL)
    ON CONFLICT (user_id, platform, listing_id) DO UPDATE SET
      url                  = COALESCE(EXCLUDED.url, annonces_plateforme.url),
      titre                = COALESCE(EXCLUDED.titre, annonces_plateforme.titre),
      prix                 = COALESCE(EXCLUDED.prix, annonces_plateforme.prix),
      statut_plateforme    = 'en_ligne',
      inventaire_id        = EXCLUDED.inventaire_id,
      job_id               = EXCLUDED.job_id,
      source_rapprochement = 'job',
      proposition          = NULL,
      vu_le                = now(),
      disparu_le           = NULL,
      updated_at           = now();
  EXCEPTION WHEN OTHERS THEN
    -- Une anomalie de rattachement ne perd jamais une publication.
    RAISE WARNING 'rattachement republication job % (%): %', NEW.id, v_pf, SQLERRM;
  END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS cross_post_jobs_rattacher_republication ON public.cross_post_jobs;
CREATE TRIGGER cross_post_jobs_rattacher_republication
  AFTER UPDATE OF status ON public.cross_post_jobs
  FOR EACH ROW
  WHEN (NEW.status = 'published' AND OLD.status IS DISTINCT FROM 'published'
        AND NEW.action = 'republish'
        AND NEW.platform IN ('leboncoin', 'beebs', 'opla'))
  EXECUTE FUNCTION public.cross_post_jobs_rattacher_republication();

REVOKE ALL ON FUNCTION public.annonce_id_depuis_url(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.annonce_id_depuis_url(text, text) TO authenticated, service_role;

-- Contrôle (après la prochaine republication Leboncoin) :
--   SELECT listing_id, statut_plateforme, source_rapprochement, disparu_le
--   FROM annonces_plateforme
--   WHERE inventaire_id = <id> AND platform = 'leboncoin' ORDER BY created_at;
--   → l'ancienne disparue, la neuve en ligne, les deux rattachées à l'article
