-- INVERSE de 20261009110000_depop_declencheurs_retrait_releve.sql : les sept
-- déclencheurs exactement tels qu'ils étaient en prod le 09/10 (pg_get_triggerdef).
BEGIN;
SET LOCAL statement_timeout = '60s';
SET LOCAL lock_timeout = '5s';

DROP TRIGGER IF EXISTS cross_post_jobs_retrait_ferme_annonce ON public.cross_post_jobs;
CREATE TRIGGER cross_post_jobs_retrait_ferme_annonce AFTER UPDATE OF status ON public.cross_post_jobs FOR EACH ROW WHEN (((new.action = 'delete'::text) AND (new.status = 'deleted'::text) AND (old.status IS DISTINCT FROM 'deleted'::text) AND (new.platform = ANY (ARRAY['leboncoin'::text, 'beebs'::text, 'ebay'::text, 'opla'::text])))) EXECUTE FUNCTION cross_post_jobs_retrait_ferme_annonce();

DROP TRIGGER IF EXISTS cross_post_jobs_retrait_ferme_annonce_ins ON public.cross_post_jobs;
CREATE TRIGGER cross_post_jobs_retrait_ferme_annonce_ins AFTER INSERT ON public.cross_post_jobs FOR EACH ROW WHEN (((new.action = 'delete'::text) AND (new.status = 'deleted'::text) AND (new.platform = ANY (ARRAY['leboncoin'::text, 'beebs'::text, 'ebay'::text, 'opla'::text])))) EXECUTE FUNCTION cross_post_jobs_retrait_ferme_annonce();

DROP TRIGGER IF EXISTS cross_post_jobs_retrait_annonce_remplacee ON public.cross_post_jobs;
CREATE TRIGGER cross_post_jobs_retrait_annonce_remplacee BEFORE INSERT OR UPDATE OF status ON public.cross_post_jobs FOR EACH ROW WHEN (((new.action = 'delete'::text) AND (new.status = 'pending'::text) AND (new.platform = ANY (ARRAY['vinted'::text, 'leboncoin'::text, 'beebs'::text, 'opla'::text])))) EXECUTE FUNCTION retrait_redirige_annonce_remplacee();

DROP TRIGGER IF EXISTS cross_post_jobs_retrait_rejuge ON public.cross_post_jobs;
CREATE TRIGGER cross_post_jobs_retrait_rejuge AFTER UPDATE OF status, listing_url, platform_listing_id ON public.cross_post_jobs FOR EACH ROW WHEN (((new.status = 'published'::text) AND (COALESCE(new.action, 'publish'::text) = ANY (ARRAY['publish'::text, 'republish'::text])) AND (new.inventaire_id IS NOT NULL) AND (new.platform = ANY (ARRAY['vinted'::text, 'leboncoin'::text, 'beebs'::text, 'opla'::text])) AND ((old.status IS DISTINCT FROM new.status) OR (old.listing_url IS DISTINCT FROM new.listing_url) OR (old.platform_listing_id IS DISTINCT FROM new.platform_listing_id)))) EXECUTE FUNCTION retrait_rejuge_apres_republication();

DROP TRIGGER IF EXISTS releve_clos_tranche_publications ON public.vinted_sync_runs;
CREATE TRIGGER releve_clos_tranche_publications AFTER UPDATE OF status ON public.vinted_sync_runs FOR EACH ROW WHEN (((new.status = 'done'::text) AND (old.status IS DISTINCT FROM 'done'::text) AND (new.kind = 'annonces'::text) AND (new.platform = ANY (ARRAY['leboncoin'::text, 'beebs'::text, 'ebay'::text, 'opla'::text])))) EXECUTE FUNCTION releve_clos_tranche_publications();

DROP TRIGGER IF EXISTS vinted_sync_runs_leve_alertes_disparues ON public.vinted_sync_runs;
CREATE TRIGGER vinted_sync_runs_leve_alertes_disparues AFTER UPDATE OF status ON public.vinted_sync_runs FOR EACH ROW WHEN (((new.status = 'done'::text) AND (old.status IS DISTINCT FROM 'done'::text) AND (new.kind = 'annonces'::text) AND (new.platform = ANY (ARRAY['leboncoin'::text, 'ebay'::text, 'beebs'::text, 'opla'::text])))) EXECUTE FUNCTION releve_clos_leve_alertes_disparues();

DROP TRIGGER IF EXISTS releve_reussi_relance_connexion ON public.vinted_sync_runs;
CREATE TRIGGER releve_reussi_relance_connexion AFTER UPDATE OF status ON public.vinted_sync_runs FOR EACH ROW WHEN (((new.status = 'done'::text) AND (old.status IS DISTINCT FROM 'done'::text) AND (new.kind = ANY (ARRAY['annonces'::text, 'dressing'::text])) AND (new.platform = ANY (ARRAY['vinted'::text, 'leboncoin'::text, 'beebs'::text, 'opla'::text])))) EXECUTE FUNCTION releve_reussi_relance_connexion();

COMMIT;
