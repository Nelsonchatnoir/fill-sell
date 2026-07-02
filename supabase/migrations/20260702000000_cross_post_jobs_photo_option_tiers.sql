-- photo_option: add 'ia_advanced' and 'ia_light' (nouveaux niveaux de retouche,
-- remplacent ia_multi/ia_simple côté front). On garde les anciennes valeurs dans
-- la contrainte pour ne pas invalider les lignes déjà en base.
ALTER TABLE public.cross_post_jobs
  DROP CONSTRAINT IF EXISTS cross_post_jobs_photo_option_check;
ALTER TABLE public.cross_post_jobs
  ADD CONSTRAINT cross_post_jobs_photo_option_check
    CHECK (photo_option IN ('standard', 'ia', 'ia_multi', 'ia_simple', 'ia_advanced', 'ia_light', 'original'));
