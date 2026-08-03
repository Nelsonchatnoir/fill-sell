-- Journal des échecs d'écriture email_logs — lu par l'ops-digest de 8h50.
--
-- Suivi du 03/08 (email-tunnel v40) : logEmail trace ses échecs en
-- console.error + dans la réponse HTTP, mais AUCUN de ces canaux n'a de
-- lecteur — la réponse part vers pg_net qui la jette, les logs ne sont
-- consultés qu'a posteriori. Un type one-shot oublié dans l'index
-- email_logs_one_shot_unique produirait une violation 23505 parfaitement
-- détectée et totalement invisible : le scénario même du welcome.
--
-- Ce journal est le canal qui remonte jusqu'à un humain : email-tunnel y
-- écrit chaque échec d'insert email_logs (avec le SQLSTATE : 23505 = un
-- doublon d'envoi vient d'être tenté, à distinguer d'un échec quelconque),
-- et l'ops-digest du lendemain matin l'interroge sur 24 h.
--
-- Table service-role uniquement : RLS activée SANS policy — le GRANT
-- authenticated (règle CLAUDE.md pour toute table du schéma public) reste
-- inerte, seuls email-tunnel et ops-digest (service_role) la touchent.

CREATE TABLE IF NOT EXISTS public.email_log_echecs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  email_type text NOT NULL,
  code text,                -- SQLSTATE PostgREST ('23505' = doublon d'envoi tenté)
  erreur text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.email_log_echecs ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_log_echecs TO authenticated;

-- Le digest ne lit que les dernières 24 h.
CREATE INDEX IF NOT EXISTS email_log_echecs_created_at
  ON public.email_log_echecs (created_at);
