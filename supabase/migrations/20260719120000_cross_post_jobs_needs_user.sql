-- Statut 'needs_user' (2026-07-19, socle « à trancher par l'utilisateur ») :
-- un champ OBLIGATOIRE précis bloque la publication (valeur ambiguë, liste
-- fermée sans correspondance, requis jamais rencontré) et seul l'utilisateur
-- peut trancher. Contrat :
--   · posé par l'extension via update-job-status quand le handler identifie
--     LE champ bloquant — détail structuré dans platform_fields.needsUserField
--     { platform, field_key, field_label, allowed_values?, target? } ;
--   · JAMAIS repris par le poll : get-pending-jobs ne distribue que 'pending'
--     (et 'processing' pour le popup) — aucune re-tentative aveugle ;
--   · l'app (mini-éditeur du Stock) écrit la valeur choisie dans
--     platform_fields puis repasse le job en 'pending' elle-même (RLS
--     "Users manage own cross_post_jobs", FOR ALL).
-- Les erreurs transitoires (page changée, onglet mort, timeout) restent sur
-- le chemin existant : ré-armement borné puis 'failed'.
ALTER TABLE public.cross_post_jobs
  DROP CONSTRAINT cross_post_jobs_status_check;

ALTER TABLE public.cross_post_jobs
  ADD CONSTRAINT cross_post_jobs_status_check
  CHECK (status = ANY (ARRAY[
    'pending'::text, 'processing'::text, 'published'::text, 'failed'::text,
    'sold'::text, 'cancelled'::text, 'dry_run_completed'::text, 'deleted'::text,
    'needs_user'::text
  ]));
