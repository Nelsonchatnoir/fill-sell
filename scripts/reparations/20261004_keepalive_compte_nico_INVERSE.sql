-- Inverse de 20261004_keepalive_compte_nico.sql : beta_flags remis tels que sauvegardés.
UPDATE public.profiles p SET beta_flags = s.beta_flags
  FROM public.sauvegarde_keepalive_20261004 s
 WHERE p.id = s.id AND p.id = 'f44b5917-bccc-4431-ba41-f40571a2ed18';
SELECT id, beta_flags FROM public.profiles WHERE id = 'f44b5917-bccc-4431-ba41-f40571a2ed18';
