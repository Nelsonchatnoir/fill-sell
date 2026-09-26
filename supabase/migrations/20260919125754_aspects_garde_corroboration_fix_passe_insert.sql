-- ══════════════════════════════════════════════════════════════════════════════
-- CAPTURE DE LA PROD (audit dépôt ↔ prod du 26/09/2026)
-- Migration 20260919125754 « aspects_garde_corroboration_fix_passe_insert » : APPLIQUÉE en prod, mais aucun fichier
-- ne la portait dans le dépôt. Ce fichier reprend MOT POUR MOT les instructions
-- enregistrées dans supabase_migrations.schema_migrations.statements — il ne
-- change rien en prod (même version déjà inscrite dans l'historique distant).
-- ⛔ Ne pas réappliquer à la main.
-- ══════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.aspects_garde_corroboration()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_observer      text;
  v_categorie_nee timestamptz;
  v_deja          boolean;
  v_temoins       integer;
  v_releveurs     integer;
  v_champ_vu      timestamptz;
BEGIN
  v_observer := coalesce(auth.uid()::text, 'service');

  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.platform_category_aspect_observations
           (platform, category_key, field_key, observer, required, source)
    VALUES (NEW.platform, NEW.category_key, NEW.field_key, v_observer,
            NEW.required, NEW.source)
    ON CONFLICT (platform, category_key, field_key, observer) DO UPDATE
       SET required     = EXCLUDED.required,
           source       = EXCLUDED.source,
           last_seen_at = now(),
           seen_count   = platform_category_aspect_observations.seen_count + 1;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    v_deja := OLD.required;
  ELSE
    SELECT a.required INTO v_deja
      FROM public.platform_category_aspects a
     WHERE a.platform = NEW.platform
       AND a.category_key = NEW.category_key
       AND a.field_key = NEW.field_key;
  END IF;

  IF NEW.required IS NOT TRUE
     OR NEW.source <> 'dom'
     OR v_observer = 'service'
     OR v_deja IS TRUE THEN
    RETURN NEW;
  END IF;

  SELECT min(first_seen_at) INTO v_categorie_nee
    FROM public.platform_category_aspects
   WHERE platform = NEW.platform AND category_key = NEW.category_key;

  IF v_categorie_nee IS NULL OR v_categorie_nee > now() - interval '24 hours' THEN
    RETURN NEW;
  END IF;

  SELECT min(first_seen_at) INTO v_champ_vu
    FROM public.platform_category_aspect_observations
   WHERE platform = NEW.platform AND category_key = NEW.category_key
     AND field_key = NEW.field_key;

  SELECT count(DISTINCT observer) INTO v_temoins
    FROM public.platform_category_aspect_observations
   WHERE platform = NEW.platform AND category_key = NEW.category_key
     AND field_key = NEW.field_key AND required IS TRUE;

  SELECT count(DISTINCT observer) INTO v_releveurs
    FROM public.platform_category_aspect_observations
   WHERE platform = NEW.platform AND category_key = NEW.category_key
     AND last_seen_at >= coalesce(v_champ_vu, now());

  IF v_temoins >= 2 AND v_temoins * 2 >= greatest(v_releveurs, 1) THEN
    RETURN NEW;
  END IF;

  RAISE LOG 'aspects: quarantaine % / % / % — % temoin(s) requis sur % releveur(s), observe par %',
    NEW.platform, NEW.category_key, NEW.field_key, v_temoins, v_releveurs, v_observer;
  NEW.required := false;
  RETURN NEW;
END;
$$;

-- Réparation de la seule ligne rétrogradée à tort par la version précédente.
UPDATE public.platform_category_aspects
   SET required = true
 WHERE platform = 'leboncoin'
   AND category_key = 'Loisirs > Jeux & Jouets'
   AND field_key = 'toy_type'
   AND required = false;
