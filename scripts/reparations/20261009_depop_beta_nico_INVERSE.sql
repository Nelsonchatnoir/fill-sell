-- Inverse de 20261009_depop_beta_nico.sql : beta_flags remis tels que sauvegardés.
UPDATE public.profiles p SET beta_flags = s.beta_flags
  FROM (SELECT DISTINCT ON (id) id, beta_flags FROM public._backup_0910_depop_beta ORDER BY id, sauvegarde_le) s
 WHERE p.id = s.id;
SELECT id, beta_flags ? 'depop' AS depop FROM public.profiles WHERE id = 'f44b5917-bccc-4431-ba41-f40571a2ed18';
