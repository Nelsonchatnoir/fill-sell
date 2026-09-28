SET statement_timeout='3s';
SET lock_timeout='1s';
ALTER VIEW public.v_categorie_par_jour RESET (security_invoker);
ALTER VIEW public.v_categorie_arbitrage_extension RESET (security_invoker);
