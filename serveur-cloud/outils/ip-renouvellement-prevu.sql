-- (07/11 soir, ordre 3 de Nico) L'EXPORT EN LECTURE SEULE du pool d'IP pour outils/ip-renouvellement-prevu.mjs :
--   npx supabase db query --linked --read-only -f serveur-cloud/outils/ip-renouvellement-prevu.sql > pool.json
-- Aucun secret (secret_nom et la preuve de purge retirés ; l'URL du proxy vit au vault, jamais lue ici). Marche avant ET
-- après la migration 20261107190000 (to_jsonb : la colonne « sante » vient si elle existe).
SELECT jsonb_build_object(
  'lu_le', now(),
  'ips', (SELECT COALESCE(jsonb_agg(to_jsonb(i) - 'secret_nom' - 'purge_preuve' ORDER BY i.id), '[]'::jsonb) FROM public.cloud_ips i),
  'coin', (SELECT COALESCE(jsonb_object_agg(key, value), '{}'::jsonb) FROM public.coin_config WHERE key LIKE 'cloud_ip_%'),
  'en_attente', (SELECT count(*) FROM public.cloud_attente),
  'commandes_en_cours', (SELECT COALESCE(sum(quantite), 0) FROM public.cloud_ip_commandes WHERE nature = 'achat' AND statut IN ('demandee', 'en_cours'))
) AS r;
