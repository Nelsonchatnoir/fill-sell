-- (14/11, règle de Nico : « IP attribuées + 2 de marge, pas plus ») LA MARGE DU POOL À 2. Lu en prod le 13/11 au soir :
-- coin_config cloud_ip_marge = 3 — le plan (cloud-pool.js, planDuJour : stock visé = marge + attente) gardait 3 IP libres
-- d'avance, donc achetait et renouvelait jusqu'à attribuées + 3. Une seule valeur change ; rien d'autre (la garde du nombre
-- en base, cloud_ip_garde_nombre, lit la même clé : borne = comptes + 2 + attente).
-- À jouer sur feu vert de Nico. Sauvegarde : _backup_1411_cloud_ip_marge ; inverse : 20261114_cloud_ip_marge_2_INVERSE.sql.
-- Lancer : npx supabase db query --linked --yes -f scripts/reparations/20261114_cloud_ip_marge_2.sql
BEGIN;
CREATE TABLE public._backup_1411_cloud_ip_marge AS SELECT now() AS le, key, value FROM public.coin_config WHERE key = 'cloud_ip_marge';
ALTER TABLE public._backup_1411_cloud_ip_marge ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_1411_cloud_ip_marge FROM PUBLIC, anon, authenticated;
INSERT INTO public.coin_config (key, value) VALUES ('cloud_ip_marge', 2)
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value WHERE public.coin_config.value IS DISTINCT FROM EXCLUDED.value;
SELECT key, value FROM public.coin_config WHERE key = 'cloud_ip_marge';
COMMIT;
