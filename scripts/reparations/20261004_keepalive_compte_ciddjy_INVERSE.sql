-- Inverse de 20261004_keepalive_compte_ciddjy.sql : beta_flags remis tels que sauvegardés.
UPDATE public.profiles p SET beta_flags = s.beta_flags
  FROM public.sauvegarde_keepalive_20261004 s
 WHERE p.id = s.id AND p.id = 'eacbe32c-1929-41a8-927d-7f3cff621f5a';
SELECT id, beta_flags FROM public.profiles WHERE id = 'eacbe32c-1929-41a8-927d-7f3cff621f5a';
