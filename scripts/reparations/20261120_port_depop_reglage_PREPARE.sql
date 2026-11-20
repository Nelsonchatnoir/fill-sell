-- PRÉPARÉ, JAMAIS LANCÉ SANS L'ACCORD DE NICO (20/11/2026, urgence port Depop d'un compte Business — solution A).
-- Les annonces Depop EN LIGNE d'un compte dont le port (relu sur Depop au 20/11 : 4,15 €) n'est pas celui de ses Réglages
-- (platform_settings.depop.frais_port_defaut, 5,99 €). Ce script ne modifie AUCUNE annonce : il SAUVEGARDE l'état d'avant
-- (une ligne par annonce : identifiant Depop, lien, port lu, port visé) dans une table dédiée — la base du retour arrière.
-- La modification elle-même (une tâche « modifier le port » par annonce, servie par l'extension au rythme de la plateforme)
-- attend : 1) le relevé du contrat d'écriture Depop (« edit-listing ») sur le compte de Nico, annonce de test à 999 € puis
-- retirée ; 2) l'ouverture de la modification en place (aujourd'hui fermée, couleur seulement) au port ; 3) une version
-- d'extension (le compte n'est pas sur le Cloud). Inverse : la même tâche avec port_avant (sauvegardé ici).
-- Usage (lecture puis sauvegarde, dans une transaction) : remplacer :email par l'adresse du compte.
BEGIN;
SET LOCAL lock_timeout = '5s';
CREATE TABLE IF NOT EXISTS public._backup_2011_port_depop (
  user_id uuid NOT NULL, listing_id text NOT NULL, url text, port_avant numeric, port_vise numeric,
  sauvegarde_le timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (user_id, listing_id));
ALTER TABLE public._backup_2011_port_depop ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_2011_port_depop FROM PUBLIC, anon, authenticated;
WITH u AS (SELECT id FROM auth.users WHERE email = :'email'),
reglage AS (SELECT (p.platform_settings -> 'depop' ->> 'frais_port_defaut')::numeric AS vise FROM public.profiles p WHERE p.id = (SELECT id FROM u)),
dernier AS (
  SELECT DISTINCT ON (c.platform_listing_id) c.platform_listing_id AS listing_id, c.listing_url AS url,
         NULLIF(c.platform_fields ->> 'depopPort', '')::numeric AS port_job
    FROM public.cross_post_jobs c
   WHERE c.user_id = (SELECT id FROM u) AND c.platform = 'depop' AND c.status = 'published'
   ORDER BY c.platform_listing_id, c.created_at DESC),
en_ligne AS (
  SELECT a.listing_id FROM public.annonces_plateforme a
   WHERE a.user_id = (SELECT id FROM u) AND a.platform = 'depop' AND a.disparu_le IS NULL AND a.retiree_le IS NULL)
INSERT INTO public._backup_2011_port_depop (user_id, listing_id, url, port_avant, port_vise)
SELECT (SELECT id FROM u), d.listing_id, d.url, COALESCE(d.port_job, 4.15), (SELECT vise FROM reglage)
  FROM dernier d
 WHERE d.listing_id IN (SELECT listing_id FROM en_ligne)          -- seulement les annonces vues en ligne au dernier relevé
   AND COALESCE(d.port_job, 4.15) IS DISTINCT FROM (SELECT vise FROM reglage)
ON CONFLICT (user_id, listing_id) DO NOTHING;
SELECT count(*) AS sauvegardees, min(port_avant) AS port_avant_min, max(port_avant) AS port_avant_max, max(port_vise) AS port_vise
  FROM public._backup_2011_port_depop WHERE user_id = (SELECT id FROM auth.users WHERE email = :'email');
COMMIT;
