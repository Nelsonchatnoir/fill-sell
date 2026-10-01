-- Retour arrière de 20261001133000 : l'index « un seul lien par personne ».
-- ⚠️ Échoue si des personnes ont reçu plusieurs liens depuis la mise en service :
-- le recréer exige alors de décider quoi faire de ces lignes (jamais les effacer).
SET lock_timeout = '3s';
CREATE UNIQUE INDEX IF NOT EXISTS email_logs_extension_link_unique
  ON public.email_logs (user_id)
  WHERE email_type = 'extension_link' AND sent_at >= '2026-09-25 20:30:00+00';
