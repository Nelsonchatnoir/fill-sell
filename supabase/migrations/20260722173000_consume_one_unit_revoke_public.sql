-- Durcissement de consume_one_unit (2026-07-22, même jour que sa création).
--
-- Postgres accorde EXECUTE à PUBLIC par défaut sur toute fonction créée. Le
-- GRANT explicite à authenticated + service_role de la migration précédente ne
-- ferme donc PAS l'accès hérité : `anon` apparaissait bien dans les privilèges
-- effectifs (relevé via aclexplode juste après application).
--
-- consume_one_unit est SECURITY DEFINER et ÉCRIT dans inventaire (décrément +
-- insertion d'une ligne d'historique). La laisser appelable sans
-- authentification, c'est permettre à qui connaîtrait un couple
-- (inventaire_id, user_id) de consommer une unité de stock d'autrui. Le filtre
-- `user_id = p_user_id` limite les dégâts mais n'est pas une authentification :
-- c'est une comparaison de paramètres, pas une preuve d'identité.
--
-- REVOKE d'abord (PUBLIC puis anon explicitement), GRANT ensuite pour que
-- l'état final soit lisible en une seule migration.
revoke execute on function public.consume_one_unit(bigint, uuid, numeric, numeric, numeric, numeric, text) from public;
revoke execute on function public.consume_one_unit(bigint, uuid, numeric, numeric, numeric, numeric, text) from anon;
grant  execute on function public.consume_one_unit(bigint, uuid, numeric, numeric, numeric, numeric, text) to authenticated, service_role;
