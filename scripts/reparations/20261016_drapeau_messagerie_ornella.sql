-- ═══════════════════════════════════════════════════════════════════════════
-- 16/10/2026 (nuit) — BÊTA « MESSAGES + À EXPÉDIER » : LE DRAPEAU SUR LE COMPTE D'ORNELLA
-- ═══════════════════════════════════════════════════════════════════════════
-- Ordre de Nico (16/10 au soir) : drapeau allumé sur DEUX comptes, Nico et le compte
-- FillSell principal d'Ornella ; personne d'autre.
-- Compte identifié le 16/10 à 22:50 (lecture) : ornellaracano@icloud.com
-- (f8aa02a5-23cb-4325-bba8-127f61a75741) — créé le 03/04/2026, 899 fiches, 986 jobs sur
-- 30 jours (Beebs, eBay, Leboncoin, Opla, Vinted), extension 0.6.114 du Chrome Web Store.
-- Les deux autres comptes dont l'adresse contient « ornella » (ornellamonticelli27@…,
-- ornella.denef@…) sont d'autres personnes : 0 fiche, 0 job, jamais revenues.
-- Effet : profiles.beta_flags.messages_bordereaux = true → l'app lui montre « Messages ·
-- À expédier » ; eBay est relevé par le serveur (compte eBay relié) ; Vinted, Leboncoin,
-- Beebs, Depop le seront par son extension dès la version du store qui porte la bêta.
-- Aucune autre ligne touchée. Sauvegarde AVANT, inverse en bas.

BEGIN;

CREATE TABLE IF NOT EXISTS public._backup_1610_beta_flags_ornella AS
  SELECT id, beta_flags, now() AS sauve_le
    FROM public.profiles WHERE id = 'f8aa02a5-23cb-4325-bba8-127f61a75741';
ALTER TABLE public._backup_1610_beta_flags_ornella ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_1610_beta_flags_ornella FROM anon, authenticated;

UPDATE public.profiles
   SET beta_flags = coalesce(beta_flags, '{}'::jsonb) || '{"messages_bordereaux": true}'::jsonb
 WHERE id = 'f8aa02a5-23cb-4325-bba8-127f61a75741'
   AND NOT coalesce((beta_flags -> 'messages_bordereaux') = 'true'::jsonb, false);

-- Contrôle : exactement deux comptes bêta, Nico et Ornella.
SELECT id, beta_flags,
       (SELECT count(*) FROM public.profiles p WHERE (p.beta_flags -> 'messages_bordereaux') = 'true'::jsonb) AS comptes_beta
  FROM public.profiles WHERE (beta_flags -> 'messages_bordereaux') = 'true'::jsonb;

COMMIT;

-- ── INVERSE (le drapeau seul ; les données de la bêta restent, purgées à 30 jours) ──
-- UPDATE public.profiles SET beta_flags = beta_flags - 'messages_bordereaux'
--  WHERE id = 'f8aa02a5-23cb-4325-bba8-127f61a75741';
