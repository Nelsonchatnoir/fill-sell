-- 20261114_compteur_ia_banc_retouche.sql — (14/11/2026 soir, lot de Nico, point 2) LE COMPTEUR IA DU 14/11 RENDU JUSTE
-- Le banc de la retouche photo (fonction retouche-banc, 134 appels OpenAI, 3,2549 $, 21:41 → 22:03) journalisait son coût
-- sous `metadata.cost_usd` avec la feature « photo_retouche_banc ». ia_fournisseur_de() range toute feature inconnue
-- chez « anthropic » : le déclencheur usage_logs_ia_depense a ajouté ces 3,2549 $ au compteur ANTHROPIC du 14/11
-- (10,49 → 13,74 $) au lieu d'OpenAI. Aucun effet sur un utilisateur (le filet de 50 $/jour est en place depuis 22:32 ;
-- avant, le seuil « essentiel » de 14 $ n'a pas été franchi), mais le chiffre du jour est faux.
-- Ce script : (1) déplace exactement cette somme et ces 134 appels de la ligne anthropic du 14/11 vers la ligne openai ;
-- (2) renomme la clé des 134 lignes du banc `cost_usd` → `cout_openai_usd` (la fonction du banc écrit désormais cette
-- clé : aucune reconstruction future du compteur ne les recompterait chez Anthropic). Rien d'autre : aucune ligne
-- d'utilisateur, aucun quota.
-- Sauvegardes : public._backup_1411_compteur_ia (les deux lignes du compteur telles quelles),
-- public._backup_1411_banc_retouche_meta (id + metadata des 134 lignes). Inverse : …_INVERSE.sql.
-- Gardes : exactement 134 lignes et 3,2549 $ (± 0,001) ; jamais deux fois ; la ligne anthropic doit couvrir la somme.
BEGIN;
CREATE TABLE IF NOT EXISTS public._backup_1411_compteur_ia AS
  SELECT now() AS sauve_le, d.* FROM public.ia_depense_jour d WHERE false;
ALTER TABLE public._backup_1411_compteur_ia ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_1411_compteur_ia FROM PUBLIC, anon, authenticated;
CREATE TABLE IF NOT EXISTS public._backup_1411_banc_retouche_meta (sauve_le timestamptz, id uuid, metadata jsonb);
ALTER TABLE public._backup_1411_banc_retouche_meta ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_1411_banc_retouche_meta FROM PUBLIC, anon, authenticated;
DO $$
DECLARE
  v_cout numeric;
  v_n int;
BEGIN
  IF EXISTS (SELECT 1 FROM public._backup_1411_compteur_ia) OR EXISTS (SELECT 1 FROM public._backup_1411_banc_retouche_meta) THEN
    RAISE EXCEPTION 'déjà fait (sauvegardes présentes) : rien fait';
  END IF;
  SELECT sum((metadata ->> 'cost_usd')::numeric), count(*) INTO v_cout, v_n
    FROM public.usage_logs
   WHERE feature = 'photo_retouche_banc' AND metadata ? 'cost_usd'
     AND (created_at AT TIME ZONE 'Europe/Paris')::date = '2026-11-14';
  IF v_n <> 134 OR v_cout IS NULL OR abs(v_cout - 3.2549) > 0.001 THEN
    RAISE EXCEPTION 'banc différent de l''audit (% lignes, % $) : rien fait', v_n, v_cout;
  END IF;
  INSERT INTO public._backup_1411_compteur_ia SELECT now(), d.* FROM public.ia_depense_jour d WHERE d.jour = '2026-11-14';
  INSERT INTO public._backup_1411_banc_retouche_meta
    SELECT now(), u.id, u.metadata FROM public.usage_logs u
     WHERE u.feature = 'photo_retouche_banc' AND u.metadata ? 'cost_usd' AND (u.created_at AT TIME ZONE 'Europe/Paris')::date = '2026-11-14';
  UPDATE public.ia_depense_jour SET cout_usd = cout_usd - v_cout, appels = appels - v_n, maj_le = now()
   WHERE jour = '2026-11-14' AND fournisseur = 'anthropic' AND cout_usd >= v_cout AND appels >= v_n;
  IF NOT FOUND THEN RAISE EXCEPTION 'ligne anthropic du 14/11 absente ou trop petite : rien fait'; END IF;
  INSERT INTO public.ia_depense_jour AS d (jour, fournisseur, cout_usd, appels, maj_le)
  VALUES ('2026-11-14', 'openai', v_cout, v_n, now())
  ON CONFLICT (jour, fournisseur) DO UPDATE SET cout_usd = d.cout_usd + EXCLUDED.cout_usd, appels = d.appels + EXCLUDED.appels, maj_le = now();
  UPDATE public.usage_logs u SET metadata = (u.metadata - 'cost_usd') || jsonb_build_object('cout_openai_usd', u.metadata -> 'cost_usd')
   WHERE u.id IN (SELECT b.id FROM public._backup_1411_banc_retouche_meta b);
  RAISE NOTICE 'compteur du 14/11 : % $ et % appels déplacés d''anthropic vers openai', v_cout, v_n;
END $$;
COMMIT;
-- Relecture : select fournisseur, cout_usd, appels from ia_depense_jour where jour = '2026-11-14';
