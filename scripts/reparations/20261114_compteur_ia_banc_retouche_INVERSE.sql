-- 20261114_compteur_ia_banc_retouche_INVERSE.sql — inverse de 20261114_compteur_ia_banc_retouche.sql.
-- Remet la somme du banc (lue dans la sauvegarde des 134 lignes) sur la ligne anthropic du 14/11 et la retire de la ligne
-- openai — par DIFFÉRENCE, pour ne pas effacer la dépense écrite depuis — puis rend aux 134 lignes leur metadata
-- d'origine (clé cost_usd). Les sauvegardes sont gardées (renommées) pour la traçabilité.
BEGIN;
DO $$
DECLARE
  v_cout numeric;
  v_n int;
BEGIN
  SELECT sum((metadata ->> 'cost_usd')::numeric), count(*) INTO v_cout, v_n FROM public._backup_1411_banc_retouche_meta;
  IF v_n <> 134 OR v_cout IS NULL THEN RAISE EXCEPTION 'sauvegarde absente ou incomplète (% lignes) : rien fait', v_n; END IF;
  UPDATE public.ia_depense_jour SET cout_usd = cout_usd + v_cout, appels = appels + v_n, maj_le = now()
   WHERE jour = '2026-11-14' AND fournisseur = 'anthropic';
  UPDATE public.ia_depense_jour SET cout_usd = cout_usd - v_cout, appels = appels - v_n, maj_le = now()
   WHERE jour = '2026-11-14' AND fournisseur = 'openai' AND cout_usd >= v_cout;
  IF NOT FOUND THEN RAISE EXCEPTION 'ligne openai du 14/11 trop petite : rien fait'; END IF;
  UPDATE public.usage_logs u SET metadata = b.metadata FROM public._backup_1411_banc_retouche_meta b WHERE u.id = b.id;
END $$;
ALTER TABLE public._backup_1411_compteur_ia RENAME TO _backup_1411_compteur_ia_inverse_joue;
ALTER TABLE public._backup_1411_banc_retouche_meta RENAME TO _backup_1411_banc_retouche_meta_inverse_joue;
COMMIT;
