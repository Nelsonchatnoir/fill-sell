-- GO Nico : sécuriser les deux vues signalées. Idempotent, aucune donnée modifiée.
SET statement_timeout='3s';
SET lock_timeout='1s';
ALTER VIEW public.v_categorie_par_jour SET (security_invoker=true);
ALTER VIEW public.v_categorie_arbitrage_extension SET (security_invoker=true);
