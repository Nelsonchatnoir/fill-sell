-- ══════════════════════════════════════════════════════════════════════════════
-- CAPTURE DE LA PROD (audit dépôt ↔ prod du 26/09/2026)
-- Migration 20260915122759 « opla_plateformes_visibles_beneficiaires » : APPLIQUÉE en prod, mais aucun fichier
-- ne la portait dans le dépôt. Ce fichier reprend MOT POUR MOT les instructions
-- enregistrées dans supabase_migrations.schema_migrations.statements — il ne
-- change rien en prod (même version déjà inscrite dans l'historique distant).
-- ⛔ Ne pas réappliquer à la main.
-- ══════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  destinataires text[] := ARRAY['nicolas.svobodny@gmail.com', 'ornellaracano@icloud.com'];
  touchees      int;
BEGIN
  UPDATE public.profiles p
     SET plateformes_visibles = array_append(p.plateformes_visibles, 'opla')
    FROM auth.users u
   WHERE u.id = p.id
     AND lower(u.email) = ANY (SELECT lower(unnest(destinataires)))
     AND NOT ('opla' = ANY (p.plateformes_visibles));
  GET DIAGNOSTICS touchees = ROW_COUNT;
  RAISE NOTICE 'plateformes_visibles += opla : % ligne(s) modifiee(s)', touchees;

  PERFORM 1 FROM unnest(destinataires) d
   WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE lower(u.email) = lower(d));
  IF FOUND THEN
    RAISE WARNING 'Au moins un email de la liste ne correspond a aucun compte — verifier avant de conclure que le drapeau est pose.';
  END IF;
END $$;
