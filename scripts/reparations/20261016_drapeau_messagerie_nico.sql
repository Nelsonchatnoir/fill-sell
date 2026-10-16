-- ═══════════════════════════════════════════════════════════════════════════
-- 16/10/2026 — BÊTA « MESSAGES + BORDEREAUX » : LE DRAPEAU SUR LE SEUL COMPTE DE NICO
-- ═══════════════════════════════════════════════════════════════════════════
-- À passer APRÈS la migration 20261016170000 (feu vert nommé de Nico).
-- Compte : nicolas.svobodny@gmail.com (f44b5917-bccc-4431-ba41-f40571a2ed18), relu
-- le 16/10 : beta_flags = {"depop":true,"keepalive":true,"nouveau_stepper":true}.
-- Effet : profiles.beta_flags.messages_bordereaux = true → l'extension relève ses
-- messages et commandes (lecture), l'app lui montre « Messages · À expédier ».
-- Aucune autre ligne touchée. Sauvegarde AVANT, inverse en bas.

BEGIN;

CREATE TABLE IF NOT EXISTS public._backup_1610_beta_flags_nico AS
  SELECT id, beta_flags, now() AS sauve_le
    FROM public.profiles WHERE id = 'f44b5917-bccc-4431-ba41-f40571a2ed18';
ALTER TABLE public._backup_1610_beta_flags_nico ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_1610_beta_flags_nico FROM anon, authenticated;

UPDATE public.profiles
   SET beta_flags = coalesce(beta_flags, '{}'::jsonb) || '{"messages_bordereaux": true}'::jsonb
 WHERE id = 'f44b5917-bccc-4431-ba41-f40571a2ed18'
   AND NOT coalesce((beta_flags -> 'messages_bordereaux') = 'true'::jsonb, false);

SELECT id, beta_flags FROM public.profiles WHERE id = 'f44b5917-bccc-4431-ba41-f40571a2ed18';

COMMIT;

-- ── INVERSE (le drapeau seul ; les données de la bêta restent, purgées à 30 jours) ──
-- UPDATE public.profiles SET beta_flags = beta_flags - 'messages_bordereaux'
--  WHERE id = 'f44b5917-bccc-4431-ba41-f40571a2ed18';
