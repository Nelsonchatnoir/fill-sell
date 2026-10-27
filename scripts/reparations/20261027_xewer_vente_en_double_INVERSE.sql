-- Inverse de 20261027_xewer_vente_en_double.sql : la vente 315890 revient telle quelle (même id, sans rejouer ses
-- déclencheurs : ni push, ni garde, ni retrait), l'annonce, la fiche et le job de suivi reprennent leur ligne sauvegardée ;
-- le journal de fusion et le rattachement de la réparation sont retirés.
BEGIN;
SET LOCAL statement_timeout = '60s';
SET LOCAL session_replication_role = replica;
INSERT INTO public.ventes
SELECT (jsonb_populate_record(NULL::public.ventes, to_jsonb(b) - 'sauvegarde_le')).*
  FROM public._backup_2710_xewer_vente b WHERE NOT EXISTS (SELECT 1 FROM public.ventes v WHERE v.id = b.id);
SET LOCAL session_replication_role = origin;
UPDATE public.annonces_plateforme a SET inventaire_id = (b.ligne ->> 'inventaire_id')::bigint, job_id = (b.ligne ->> 'job_id')::uuid,
       source_rapprochement = b.ligne ->> 'source_rapprochement', updated_at = now()
  FROM public._backup_2710_xewer_lignes b WHERE b.quoi = 'annonce' AND a.id::text = b.id;
UPDATE public.cross_post_jobs c SET platform_fields = b.ligne -> 'platform_fields'
  FROM public._backup_2710_xewer_lignes b WHERE b.quoi = 'job' AND c.id::text = b.id;
UPDATE public.inventaire i SET fusionne_dans = NULL, fusionne_le = NULL
  FROM public._backup_2710_xewer_lignes b WHERE b.quoi = 'fiche' AND i.id::text = b.id;
DELETE FROM public.inventaire_fusions WHERE absorbe = 1792999747010 AND par LIKE 'regle:identifiant_avant_fiche (vente en double%';
DELETE FROM public.rapprochements WHERE annonce_id = '881172df-2306-4a92-b959-631516deb340' AND decision = 'attache' AND par = 'job'
   AND detail ->> 'voie' = 'reparation';
COMMIT;
