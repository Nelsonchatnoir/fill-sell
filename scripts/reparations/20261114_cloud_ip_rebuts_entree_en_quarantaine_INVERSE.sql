-- INVERSE de 20261114_cloud_ip_rebuts_entree_en_quarantaine.sql : les IP de la sauvegarde ENCORE en quarantaine (jamais
-- attribuées depuis) reprennent leur ligne d'avant (rebut, critère, date). Une IP déjà revenue au pool (disponible) ou
-- attribuée n'est PAS touchée (elle a passé son contrôle : la remettre au rebut serait jeter une IP saine) — elle est dite.
BEGIN;
SELECT (b.ligne ->> 'id')::bigint AS id, i.etat AS etat_actuel,
       CASE WHEN i.etat = 'quarantaine' AND i.user_id IS NULL THEN 'remise au rebut' ELSE 'NON touchée (a quitté la quarantaine)' END AS issue
  FROM public._backup_1411_cloud_ip_rebuts_entree b JOIN public.cloud_ips i ON i.id = (b.ligne ->> 'id')::bigint;
UPDATE public.cloud_ips i
   SET etat = 'rebut', rebut_critere = b.ligne ->> 'rebut_critere', rebut_le = (b.ligne ->> 'rebut_le')::timestamptz,
       quarantaine = NULL, maj_le = now()
  FROM public._backup_1411_cloud_ip_rebuts_entree b
 WHERE i.id = (b.ligne ->> 'id')::bigint AND i.etat = 'quarantaine' AND i.user_id IS NULL;
COMMIT;
