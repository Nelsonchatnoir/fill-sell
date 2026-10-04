-- ═══════════════════════════════════════════════════════════════════════════
-- UN RETRAIT PORTE L'IDENTIFIANT EXACT DE SON ANNONCE (04/10, point 1)
-- ═══════════════════════════════════════════════════════════════════════════
-- van-breugel.sandra, retrait Vinted 333e23d4 « 18 livres T'choupi » : le job
-- delete n'avait PAS de platform_listing_id. Créé par l'app (« Retirer de
-- Vinted », StockTab armRemoveJob ; et la suppression d'une fiche, App.jsx),
-- deux chemins qui ne recopient que le LIEN de l'annonce publiée — alors que
-- le lien porte l'identifiant exact (/items/9733506257-…). L'extension sait
-- s'en servir (elle navigue sur le lien et relit l'identifiant de la page),
-- mais les gardes du serveur qui raisonnent sur l'identifiant (retrait
-- introuvable sur deux relevés, annonce remplacée, double vente) n'avaient
-- rien à comparer.
-- RÈGLE : un retrait sans identifiant mais avec le lien de son annonce reçoit
-- l'identifiant que ce lien porte — l'identifiant EXACT du lien, jamais un
-- titre, jamais une devinette (un lien sans identifiant lisible reste tel
-- quel). À l'insertion (toutes versions de l'app), et une fois pour les
-- retraits encore ouverts.
-- Idempotente.

CREATE OR REPLACE FUNCTION public.identifiant_annonce_depuis_lien(p_platform text, p_url text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT CASE p_platform
    WHEN 'vinted'    THEN substring(p_url from '/items/([0-9]+)')
    WHEN 'beebs'     THEN substring(p_url from '/p/([0-9]+)(?:[-/?#]|$)')
    WHEN 'ebay'      THEN substring(p_url from '/itm/(?:[^/?#]*/)?([0-9]{9,})')
    WHEN 'leboncoin' THEN substring(p_url from '/([0-9]{6,})(?:\.htm)?(?:[/?#]|$)')
    WHEN 'opla'      THEN substring(p_url from '(art_[A-Za-z0-9_-]+)')
  END;
$function$;

CREATE OR REPLACE FUNCTION public.retrait_identifiant_depuis_lien()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NEW.action = 'delete' AND NULLIF(btrim(NEW.platform_listing_id), '') IS NULL AND NULLIF(btrim(NEW.listing_url), '') IS NOT NULL THEN
    NEW.platform_listing_id := public.identifiant_annonce_depuis_lien(NEW.platform, NEW.listing_url);
  END IF;
  RETURN NEW;
END;
$function$;

-- Nom en « a_ » : les déclencheurs BEFORE partent dans l'ordre alphabétique ;
-- celui-ci passe avant les gardes de retrait qui lisent l'identifiant.
DROP TRIGGER IF EXISTS cross_post_jobs_a_retrait_identifiant ON public.cross_post_jobs;
CREATE TRIGGER cross_post_jobs_a_retrait_identifiant
  BEFORE INSERT ON public.cross_post_jobs
  FOR EACH ROW WHEN (NEW.action = 'delete')
  EXECUTE FUNCTION public.retrait_identifiant_depuis_lien();

-- Les retraits encore ouverts (la règle, appliquée une fois).
UPDATE public.cross_post_jobs j
   SET platform_listing_id = public.identifiant_annonce_depuis_lien(j.platform, j.listing_url)
 WHERE j.action = 'delete'
   AND j.status IN ('pending', 'processing', 'needs_user')
   AND NULLIF(btrim(j.platform_listing_id), '') IS NULL
   AND NULLIF(btrim(j.listing_url), '') IS NOT NULL
   AND public.identifiant_annonce_depuis_lien(j.platform, j.listing_url) IS NOT NULL;
