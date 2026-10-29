-- INVERSE de 20261030100000_prendre_job_atomique — une fonction NEUVE, appelée par personne aujourd'hui (le Cloud ne
-- tourne pas) : la retirer suffit. Les trois RPC existantes n'ont pas été touchées.
--   npx supabase db query --linked -f supabase/rollbacks/20261030100000_prendre_job_atomique_INVERSE.sql
drop function if exists public.prendre_job(uuid, text, uuid, text);
