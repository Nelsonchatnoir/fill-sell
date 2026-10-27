-- Inverse de 20261027_doublons_identifiant.sql : chaque fiche résorbée, son annonce et ses jobs reprennent exactement
-- leur ligne sauvegardée ; le journal de la fusion et le rattachement écrits par la réparation sont retirés. Les lignes
-- « à signaler » n'ont pas été touchées.
BEGIN;
SET LOCAL statement_timeout = '60s';
DO $$
DECLARE m integer;
BEGIN
  UPDATE public.annonces_plateforme a SET inventaire_id = b.inventaire_id, job_id = b.job_id,
         source_rapprochement = b.source_rapprochement, proposition = b.proposition, updated_at = now()
    FROM public._backup_2710_doublons_annonces b, public._resultat_2710_doublons r
   WHERE a.id = b.id AND r.annonce_id = b.id AND (r.resultat ->> 'ok')::boolean;
  GET DIAGNOSTICS m = ROW_COUNT; RAISE NOTICE 'inverse : % annonce(s) rendues', m;
  UPDATE public.cross_post_jobs c SET status = b.status, error = b.error, platform_fields = b.platform_fields
    FROM public._backup_2710_doublons_jobs b
   WHERE c.id = b.id AND c.platform_fields ? 'doublon_identifiant';
  GET DIAGNOSTICS m = ROW_COUNT; RAISE NOTICE 'inverse : % job(s) rendus', m;
  UPDATE public.inventaire i SET fusionne_dans = b.fusionne_dans, fusionne_le = b.fusionne_le
    FROM public._backup_2710_doublons_fiches b, public._resultat_2710_doublons r
   WHERE i.id = b.id AND (r.resultat ->> 'absorbee')::bigint = b.id AND (r.resultat ->> 'ok')::boolean;
  GET DIAGNOSTICS m = ROW_COUNT; RAISE NOTICE 'inverse : % fiche(s) rendues', m;
  DELETE FROM public.inventaire_fusions f USING public._resultat_2710_doublons r
   WHERE f.par = 'regle:identifiant_avant_fiche' AND f.absorbe = (r.resultat ->> 'absorbee')::bigint AND (r.resultat ->> 'ok')::boolean;
  DELETE FROM public.rapprochements x USING public._resultat_2710_doublons r
   WHERE x.annonce_id = r.annonce_id AND x.decision = 'attache' AND x.par = 'job' AND x.detail ->> 'voie' = 'reparation'
     AND (r.resultat ->> 'ok')::boolean;
END $$;
COMMIT;
