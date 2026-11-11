-- 01/11 — DÉCISION DE NICO : EXCEPTION « LEBONCOIN AUTORISÉ SUR MACHINE VIRTUELLE » POUR compte 447d920c SEUL
-- Louis pilote Leboncoin depuis une machine virtuelle de son NAS (poste 44e23093…, « Microsoft Basic Render Driver ») et
-- en assume le risque. La règle lue par get-pending-jobs (≥ v316, _shared/poste-virtuel.js) : profiles.beta_flags
-- .lbc_machine_virtuelle_autorisee = true (booléen strict). Ce script pose la clé sur CE compte (jamais un autre :
-- garde sur l'adresse et l'identifiant), garde la valeur d'avant, et ne touche rien d'autre (ni platform_settings, ni
-- la pause sur refus, ni aucune tâche). Inverse : …_INVERSE.sql.
BEGIN;

CREATE TABLE IF NOT EXISTS public._backup_0111_louis_seller_beta_flags (
  user_id uuid PRIMARY KEY, beta_flags jsonb, le timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public._backup_0111_louis_seller_beta_flags ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public._backup_0111_louis_seller_beta_flags FROM anon, authenticated;

INSERT INTO public._backup_0111_louis_seller_beta_flags (user_id, beta_flags)
SELECT p.id, p.beta_flags FROM public.profiles p JOIN auth.users u ON u.id = p.id
 WHERE p.id = '447d920c-976a-4d8f-aff4-a2998050358c' AND u.email = 'louis-seller@ttfamily.fr'
ON CONFLICT (user_id) DO NOTHING;

UPDATE public.profiles p
   SET beta_flags = coalesce(p.beta_flags, '{}'::jsonb) || '{"lbc_machine_virtuelle_autorisee": true}'::jsonb
  FROM auth.users u
 WHERE u.id = p.id AND p.id = '447d920c-976a-4d8f-aff4-a2998050358c' AND u.email = 'louis-seller@ttfamily.fr'
   AND (p.beta_flags -> 'lbc_machine_virtuelle_autorisee') IS DISTINCT FROM 'true'::jsonb;

DO $$
BEGIN
  IF (SELECT count(*) FROM public.profiles WHERE beta_flags -> 'lbc_machine_virtuelle_autorisee' = 'true'::jsonb) <> 1
     OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = '447d920c-976a-4d8f-aff4-a2998050358c'
                     AND beta_flags -> 'lbc_machine_virtuelle_autorisee' = 'true'::jsonb) THEN
    RAISE EXCEPTION 'l''exception doit être posée sur le compte 447d920c et sur lui seul : rien n''est écrit';
  END IF;
END
$$;

SELECT u.email, p.beta_flags FROM public.profiles p JOIN auth.users u ON u.id = p.id
 WHERE p.beta_flags ? 'lbc_machine_virtuelle_autorisee';

COMMIT;
