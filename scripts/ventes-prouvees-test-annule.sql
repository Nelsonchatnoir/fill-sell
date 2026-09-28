BEGIN;SET LOCAL statement_timeout='4s';
CREATE TEMP TABLE cross_post_jobs (LIKE public.cross_post_jobs INCLUDING DEFAULTS);
CREATE TEMP TABLE inventaire (LIKE public.inventaire INCLUDING DEFAULTS);
CREATE TEMP TABLE vinted_listing_snapshots (LIKE public.vinted_listing_snapshots INCLUDING DEFAULTS);
CREATE TEMP TABLE vinted_sync_runs (LIKE public.vinted_sync_runs INCLUDING DEFAULTS);
CREATE TEMP TABLE appels(job uuid);
INSERT INTO pg_temp.cross_post_jobs SELECT * FROM public.cross_post_jobs WHERE id IN('3765c939-53f1-494f-b8f1-d0ac9046111a','742627be-88c3-48b4-a01e-9837d4bcd891','1575a5eb-eda1-4302-ad20-5f2ba95c5907') LIMIT 3;
INSERT INTO pg_temp.inventaire SELECT * FROM public.inventaire WHERE user_id='e25ff459-e49b-42a9-a17b-2d20e6bc5e29' AND id IN(1790513507862004,1790513506779007,1790513541180003) LIMIT 3;
INSERT INTO pg_temp.vinted_listing_snapshots SELECT * FROM public.vinted_listing_snapshots WHERE user_id='e25ff459-e49b-42a9-a17b-2d20e6bc5e29' AND vinted_item_id IN('10164957815','10073758066','10098135391') AND captured_at>'2026-09-28T13:00:00Z' LIMIT 3;
UPDATE pg_temp.cross_post_jobs SET status='published';
UPDATE pg_temp.inventaire SET statut='stock',quantite=1;
CREATE FUNCTION pg_temp.retrait_job_prouve(uuid) RETURNS boolean LANGUAGE sql AS 'SELECT true';
CREATE FUNCTION pg_temp.fiche_annonces_vivantes(bigint,text) RETURNS integer LANGUAGE sql AS 'SELECT 1';
CREATE FUNCTION pg_temp.enregistrer_vente_atomique(p_user uuid,p_cle text,p_job uuid,p_prix numeric) RETURNS jsonb LANGUAGE plpgsql AS $t$ BEGIN INSERT INTO pg_temp.appels VALUES(p_job);UPDATE pg_temp.cross_post_jobs SET status='sold' WHERE id=p_job; RETURN '{"ok":true}'::jsonb;END;$t$;
CREATE OR REPLACE FUNCTION pg_temp.enregistrer_ventes_prouvees(p_user uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO pg_temp, public SET statement_timeout TO '4s'
AS $fonction$
DECLARE j record; r jsonb; n integer:=0;
BEGIN
 IF p_user IS NULL OR (auth.uid() IS NOT NULL AND auth.uid()<>p_user) THEN
  RAISE EXCEPTION 'Compte non autorisé' USING ERRCODE='42501';
 END IF;
 -- Un ancien relevé peut encore écrire son inventaire : attendre sa clôture.
 IF EXISTS(SELECT 1 FROM vinted_sync_runs WHERE user_id=p_user AND status='running' LIMIT 1) THEN
  RETURN jsonb_build_object('enregistrees',0,'releve_en_cours',true);
 END IF;
 FOR j IN
  SELECT c.id,coalesce(
    CASE WHEN c.platform_fields->>'detected_price' ~ '^[0-9]+([.][0-9]+)?$'
      THEN (c.platform_fields->>'detected_price')::numeric END,c.price) prix
  FROM cross_post_jobs c JOIN inventaire i ON i.id=c.inventaire_id AND i.user_id=c.user_id
  WHERE c.user_id=p_user AND c.status='published' AND c.action IN('publish','republish')
    AND c.platform_fields->>'sale_signal'='sold'
    AND i.statut='stock' AND coalesce(i.quantite,1)>0 AND i.fusionne_dans IS NULL
    AND nullif(c.platform_listing_id,'') IS NOT NULL
    AND (
      (c.platform='vinted' AND (
        SELECT s.status='sold' AND s.captured_at>=coalesce(c.published_at,c.created_at)
        FROM vinted_listing_snapshots s
        WHERE s.user_id=p_user AND s.vinted_item_id=c.platform_listing_id
        ORDER BY s.captured_at DESC LIMIT 1
      ))
      OR (c.platform_fields#>>'{sale_evidence,listing_id}'=c.platform_listing_id
        AND c.platform_fields#>>'{sale_evidence,platform}'=c.platform
        AND c.platform_fields#>>'{sale_evidence,state}'='sold'
        AND c.platform_fields#>>'{sale_evidence,exact}'='true')
    )
    AND pg_temp.retrait_job_prouve(c.id) AND pg_temp.fiche_annonces_vivantes(c.inventaire_id,c.platform)<2
  ORDER BY c.last_checked_at NULLS FIRST,c.id LIMIT 5
 LOOP
  BEGIN
   r:=pg_temp.enregistrer_vente_atomique(p_user,null,p_job:=j.id,p_prix:=j.prix);
   IF r->>'ok'='true' THEN n:=n+1; END IF;
  EXCEPTION WHEN OTHERS THEN
   RAISE WARNING 'Vente automatique annulée, job % : %',j.id,SQLERRM;
  END;
 END LOOP;
 RETURN jsonb_build_object('enregistrees',n);
END;
$fonction$;
DO $test$
DECLARE r jsonb;
BEGIN
 -- Une preuve portant un autre identifiant n'enregistre rien pour ce job.
 UPDATE pg_temp.vinted_listing_snapshots SET vinted_item_id='autre' WHERE vinted_item_id='10164957815';
 r:=pg_temp.enregistrer_ventes_prouvees('e25ff459-e49b-42a9-a17b-2d20e6bc5e29');
 IF r->>'enregistrees'<>'2' THEN RAISE EXCEPTION 'Deux preuves exactes attendues : %',r;END IF;
 r:=pg_temp.enregistrer_ventes_prouvees('e25ff459-e49b-42a9-a17b-2d20e6bc5e29');
 IF r->>'enregistrees'<>'0' THEN RAISE EXCEPTION 'Rejeu en double : %',r;END IF;
END;$test$;
SELECT count(*)=2 AS preuves_exactes_et_rejeu_sans_double FROM pg_temp.appels;ROLLBACK;
