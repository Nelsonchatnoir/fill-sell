-- 01/11 — DÉCISION DE NICO : DÉLÉGATION LEBONCOIN louis-seller@ttfamily.fr → louis@ttfamily.fr (« Amiral »), CETTE PAIRE SEULE
-- (règle : supabase/functions/_shared/delegation-leboncoin.js ; get-pending-jobs, extension-session, extension ≥ 0.6.164).
-- Ce script, en une transaction (garde sur les adresses ET les identifiants ; sauvegardes ; inverse : …_INVERSE.sql) :
--   1. sauvegarde les beta_flags des deux comptes, la tâche 9aa5edb9 et la liste des annonces Leboncoin vivantes de
--      chaque compte (preuve « aucune annonce ne change de compte » : selftest:delegation-leboncoin-releves -- --prod) ;
--   2. RETIRE l'exception « Leboncoin autorisé sur machine virtuelle » de louis-seller (la machine virtuelle ne touche
--      plus jamais Leboncoin) ;
--   3. pose la délégation DES DEUX CÔTÉS : louis-seller.beta_flags.delegation_leboncoin = { executant: Amiral, nom } et
--      Amiral.beta_flags.execute_leboncoin_pour = [louis-seller] ;
--   4. LA tâche de l'essai réel, et elle seule — 9aa5edb9 (retrait Leboncoin « Maison Gabby », annonce 3291865529,
--      vendue sur Vinted le 01/11) : de « Connexion Leboncoin requise » (needs_user) à pending, pour partir par le
--      compte de travail d'Amiral. L'ancien message et les marques d'attente de session sont archivés, rien d'autre.
-- Aucune autre tâche, aucun platform_settings, aucune pause (blocage_acces) n'est touché.
BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = '447d920c-976a-4d8f-aff4-a2998050358c' AND email = 'louis-seller@ttfamily.fr')
     OR NOT EXISTS (SELECT 1 FROM auth.users WHERE id = 'faf5021a-479a-4bb3-b3ec-c296770739b7' AND email = 'louis@ttfamily.fr') THEN
    RAISE EXCEPTION 'comptes inattendus : rien n''est écrit';
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS public._backup_0111_delegation_lbc_flags (
  user_id uuid PRIMARY KEY, beta_flags jsonb, le timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public._backup_0111_delegation_lbc_job (
  id uuid PRIMARY KEY, status text, error text, platform_fields jsonb, le timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public._backup_0111_delegation_lbc_annonces (
  user_id uuid NOT NULL, listing_id text NOT NULL, inventaire_id bigint, le timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, listing_id)
);
ALTER TABLE public._backup_0111_delegation_lbc_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public._backup_0111_delegation_lbc_job ENABLE ROW LEVEL SECURITY;
ALTER TABLE public._backup_0111_delegation_lbc_annonces ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public._backup_0111_delegation_lbc_flags FROM anon, authenticated;
REVOKE ALL ON TABLE public._backup_0111_delegation_lbc_job FROM anon, authenticated;
REVOKE ALL ON TABLE public._backup_0111_delegation_lbc_annonces FROM anon, authenticated;

INSERT INTO public._backup_0111_delegation_lbc_flags (user_id, beta_flags)
SELECT p.id, p.beta_flags FROM public.profiles p
 WHERE p.id IN ('447d920c-976a-4d8f-aff4-a2998050358c', 'faf5021a-479a-4bb3-b3ec-c296770739b7')
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO public._backup_0111_delegation_lbc_job (id, status, error, platform_fields)
SELECT j.id, j.status, j.error, j.platform_fields FROM public.cross_post_jobs j
 WHERE j.id = '9aa5edb9-eacf-4735-82d8-15e28625269a'
ON CONFLICT (id) DO NOTHING;

INSERT INTO public._backup_0111_delegation_lbc_annonces (user_id, listing_id, inventaire_id)
SELECT a.user_id, a.listing_id, a.inventaire_id FROM public.annonces_plateforme a
 WHERE a.platform = 'leboncoin' AND a.disparu_le IS NULL
   AND a.user_id IN ('447d920c-976a-4d8f-aff4-a2998050358c', 'faf5021a-479a-4bb3-b3ec-c296770739b7')
ON CONFLICT (user_id, listing_id) DO NOTHING;

-- 2 + 3a. louis-seller : l'exception machine virtuelle part, la délégation arrive.
UPDATE public.profiles p
   SET beta_flags = (coalesce(p.beta_flags, '{}'::jsonb) - 'lbc_machine_virtuelle_autorisee')
       || jsonb_build_object('delegation_leboncoin', jsonb_build_object(
            'executant', 'faf5021a-479a-4bb3-b3ec-c296770739b7', 'nom', 'Amiral',
            'depuis', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), 'decide_par', 'Nico (01/11)'))
 WHERE p.id = '447d920c-976a-4d8f-aff4-a2998050358c';

-- 3b. Amiral : accepte d'exécuter Leboncoin pour louis-seller.
UPDATE public.profiles p
   SET beta_flags = coalesce(p.beta_flags, '{}'::jsonb)
       || jsonb_build_object('execute_leboncoin_pour', jsonb_build_array('447d920c-976a-4d8f-aff4-a2998050358c'))
 WHERE p.id = 'faf5021a-479a-4bb3-b3ec-c296770739b7';

-- 4. La tâche de l'essai réel : 9aa5edb9 seulement, et seulement si elle est encore ce qu'elle était (needs_user, retrait
--    Leboncoin de louis-seller, annonce 3291865529).
UPDATE public.cross_post_jobs j
   SET status = 'pending',
       error = 'Leboncoin passe par ton compte Amiral : cette tâche partira dès que l''extension FillSell (à jour) sera ouverte sur le compte Amiral, sur ton ordinateur. Rien n''a été touché.',
       platform_fields = (coalesce(j.platform_fields, '{}'::jsonb)
         - 'needs_user_source' - 'needs_user_tick_le' - 'needs_user_actif_ms' - 'needs_user_vu_le' - 'needs_user_vu_erreur'
         - 'needsUserAttempts' - 'attente_session' - 'refus_passager' - 'mur_geste' - 'next_action_after' - 'processing_since')
         || jsonb_build_object('erreurs_archivees',
              coalesce(j.platform_fields -> 'erreurs_archivees', '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
                'le', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
                'par', 'réparation 01/11 (délégation Leboncoin : le retrait part par le compte Amiral)',
                'erreur', j.error, 'statut', j.status)))
 WHERE j.id = '9aa5edb9-eacf-4735-82d8-15e28625269a'
   AND j.user_id = '447d920c-976a-4d8f-aff4-a2998050358c'
   AND j.platform = 'leboncoin' AND j.action = 'delete' AND j.status = 'needs_user'
   AND j.platform_listing_id = '3291865529';

DO $$
BEGIN
  IF (SELECT count(*) FROM public.profiles WHERE beta_flags ? 'delegation_leboncoin') <> 1
     OR (SELECT count(*) FROM public.profiles WHERE beta_flags ? 'execute_leboncoin_pour') <> 1
     OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = '447d920c-976a-4d8f-aff4-a2998050358c'
                     AND beta_flags -> 'delegation_leboncoin' ->> 'executant' = 'faf5021a-479a-4bb3-b3ec-c296770739b7')
     OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = 'faf5021a-479a-4bb3-b3ec-c296770739b7'
                     AND beta_flags -> 'execute_leboncoin_pour' = '["447d920c-976a-4d8f-aff4-a2998050358c"]'::jsonb)
     OR EXISTS (SELECT 1 FROM public.profiles WHERE beta_flags ? 'lbc_machine_virtuelle_autorisee') THEN
    RAISE EXCEPTION 'la délégation doit tenir sur la paire louis-seller → Amiral et sur elle seule, sans exception machine virtuelle : rien n''est écrit';
  END IF;
END
$$;

SELECT u.email, p.beta_flags FROM public.profiles p JOIN auth.users u ON u.id = p.id
 WHERE p.id IN ('447d920c-976a-4d8f-aff4-a2998050358c', 'faf5021a-479a-4bb3-b3ec-c296770739b7');
SELECT id, status, left(error, 120) AS error FROM public.cross_post_jobs WHERE id = '9aa5edb9-eacf-4735-82d8-15e28625269a';
SELECT user_id, count(*) AS annonces_vivantes_sauvegardees FROM public._backup_0111_delegation_lbc_annonces GROUP BY user_id;

COMMIT;
