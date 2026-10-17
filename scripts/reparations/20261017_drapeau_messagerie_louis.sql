-- ═══════════════════════════════════════════════════════════════════════════
-- 17/10/2026 — BÊTA « MESSAGES + À EXPÉDIER » : LE DRAPEAU SUR LE COMPTE DE LOUIS
-- ═══════════════════════════════════════════════════════════════════════════
-- Demande de Nico (17/10 après-midi) : « ouvrir à Louis aussi la bêta expédition +
-- message ». Compte : louis@ttfamily.fr = « Amiral » (faf5021a-479a-4bb3-b3ec-c296770739b7),
-- Business, deux boutiques Vinted, eBay relié (plafond de vente eBay à 0 le 17/10),
-- extension 0.6.114 du Chrome Web Store.
-- Effet : profiles.beta_flags.messages_bordereaux = true → l'app lui montre « Messages ·
-- À expédier » ; eBay est relevé par le serveur (compte eBay relié) ; Vinted, Leboncoin,
-- Beebs, Depop le seront par son extension dès la version du store qui porte la bêta
-- (0.6.122 / 0.6.123). Ses réponses partent sur son appui seulement, une fois ; un
-- bordereau ne se génère qu'après son écran de confirmation.
-- Aucune autre ligne touchée. Sauvegarde AVANT, inverse en bas. Aucun mail.

BEGIN;

CREATE TABLE IF NOT EXISTS public._backup_1710_beta_flags_louis AS
  SELECT id, beta_flags, now() AS sauve_le
    FROM public.profiles WHERE id = 'faf5021a-479a-4bb3-b3ec-c296770739b7';
ALTER TABLE public._backup_1710_beta_flags_louis ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_1710_beta_flags_louis FROM anon, authenticated;

UPDATE public.profiles
   SET beta_flags = coalesce(beta_flags, '{}'::jsonb) || '{"messages_bordereaux": true}'::jsonb
 WHERE id = 'faf5021a-479a-4bb3-b3ec-c296770739b7'
   AND NOT coalesce((beta_flags -> 'messages_bordereaux') = 'true'::jsonb, false);

-- Contrôle : exactement trois comptes bêta, Nico, Ornella et Louis.
DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM public.profiles WHERE (beta_flags -> 'messages_bordereaux') = 'true'::jsonb;
  IF n <> 3 OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = 'faf5021a-479a-4bb3-b3ec-c296770739b7'
                             AND (beta_flags -> 'messages_bordereaux') = 'true'::jsonb) THEN
    RAISE EXCEPTION 'bêta : % compte(s) porteur(s) au lieu de 3 (Nico, Ornella, Louis) — rien n''est fait', n;
  END IF;
END $$;

SELECT left(id::text, 8) AS compte, beta_flags, public.messagerie_beta(id) AS beta_active
  FROM public.profiles WHERE (beta_flags -> 'messages_bordereaux') = 'true'::jsonb ORDER BY 1;

COMMIT;

-- ── INVERSE (le drapeau seul ; les données de la bêta restent, purgées à 30 jours) ──
-- UPDATE public.profiles SET beta_flags = beta_flags - 'messages_bordereaux'
--  WHERE id = 'faf5021a-479a-4bb3-b3ec-c296770739b7';
