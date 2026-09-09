-- ═══════════════════════════════════════════════════════════════════════════
-- platform_health : le texte que LIT l'utilisateur devient une colonne à part
-- 2026-09-09 — GO Nico (mécanisme de maintenance générique, par plateforme).
-- ═══════════════════════════════════════════════════════════════════════════
-- Jusqu'ici `reason` servait à la fois de diagnostic interne (signatures
-- auto S1/S3 de handler-watch) et de texte affiché dans l'app (bandeaux Stock
-- et étape Publier, depuis la 2.4.65 du 27/08). Deux usages, une colonne :
-- on sépare. `reason` redevient INTERNE. `message_fr` / `message_en` sont ce
-- que l'utilisateur lit — paramétrables ligne par ligne, sans redéploiement.
--
-- FAIL-SAFE (non négociable) : colonne vide = texte de repli générique dans
-- l'app ; ligne absente ou table illisible = aucune pause. Rien ici ne peut
-- bloquer une plateforme par accident : on n'ajoute que des colonnes NULL.
-- Idempotente.
ALTER TABLE public.platform_health
  ADD COLUMN IF NOT EXISTS message_fr text,
  ADD COLUMN IF NOT EXISTS message_en text;

COMMENT ON COLUMN public.platform_health.reason IS
  'INTERNE : diagnostic de la pause (signature auto S1/S3, note manuelle). Jamais affiché à l''utilisateur depuis le 09/09 — voir message_fr / message_en.';
COMMENT ON COLUMN public.platform_health.message_fr IS
  'Texte affiché à l''utilisateur (FR) quand paused=true. NULL = repli générique de l''app.';
COMMENT ON COLUMN public.platform_health.message_en IS
  'Texte affiché à l''utilisateur (EN) quand paused=true. NULL = repli sur message_fr, puis générique.';

-- Pilotage (deux UPDATE, éditeur SQL) :
--   allumer : UPDATE platform_health SET paused=true, message_fr='…', message_en='…',
--             paused_since=now(), updated_at=now() WHERE platform='beebs';
--   éteindre : UPDATE platform_health SET paused=false, paused_since=NULL,
--             updated_at=now() WHERE platform='beebs';
