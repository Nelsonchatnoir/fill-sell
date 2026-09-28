-- À exécuter seulement avec le corps de la RPC copié en pg_temp et ROLLBACK.
-- Les tables temporaires n'ont aucun trigger de production ni appel réseau.
CREATE TEMP TABLE inventaire (LIKE public.inventaire INCLUDING DEFAULTS);
CREATE TEMP TABLE cross_post_jobs (LIKE public.cross_post_jobs INCLUDING DEFAULTS);
CREATE TEMP TABLE ventes (LIKE public.ventes INCLUDING DEFAULTS);
CREATE TEMP SEQUENCE ventes_test_id;
ALTER TABLE pg_temp.ventes ALTER COLUMN id DROP IDENTITY IF EXISTS;
ALTER TABLE pg_temp.ventes ALTER COLUMN id SET DEFAULT nextval('pg_temp.ventes_test_id');
CREATE TEMP TABLE ventes_operations(user_id uuid,cle text,inventaire_id bigint,job_id uuid,resultat jsonb,cree_le timestamptz DEFAULT now(),PRIMARY KEY(user_id,cle));
CREATE TEMP TABLE usage_logs(user_id uuid,feature text,metadata jsonb);
CREATE TEMP TABLE vinted_listing_snapshots(user_id uuid,vinted_item_id text,status text,captured_at timestamptz);
CREATE TEMP TABLE retraits_test(job_id uuid PRIMARY KEY);
CREATE FUNCTION pg_temp.retrait_job_prouve(p_job uuid) RETURNS boolean LANGUAGE sql AS $$
 SELECT coalesce((SELECT platform_fields->>'preuve'='oui' FROM pg_temp.cross_post_jobs WHERE id=p_job),false)
$$;
CREATE FUNCTION pg_temp.fiche_annonces_vivantes(p_inv bigint,p_pf text) RETURNS integer LANGUAGE sql AS $$
 SELECT count(DISTINCT platform_listing_id)::integer FROM pg_temp.cross_post_jobs WHERE inventaire_id=p_inv AND platform=p_pf AND status='published'
$$;
CREATE FUNCTION pg_temp.armer_retrait_job(p_job uuid,p_chemin text,p_delai interval) RETURNS uuid LANGUAGE plpgsql AS $$
BEGIN INSERT INTO pg_temp.retraits_test VALUES(p_job) ON CONFLICT DO NOTHING; RETURN p_job; END $$;

-- CORPS_RPC_TEMPORAIRE

DO $tests$
DECLARE u uuid:='00000000-0000-4000-8000-000000000001'; r jsonb;
 j1 uuid:='00000000-0000-4000-8000-000000000011';
 j2 uuid:='00000000-0000-4000-8000-000000000012';
 j3 uuid:='00000000-0000-4000-8000-000000000013';
BEGIN
 INSERT INTO pg_temp.inventaire(id,user_id,titre,statut,quantite,prix_achat) VALUES
  (1,u,'Lot','stock',3,NULL),(2,u,'ECHEC','stock',1,2),(3,u,'Historique','stock',1,2),(4,u,'Même plateforme','stock',2,0);
 r:=pg_temp.enregistrer_vente_atomique(u,'manuel-1',1,NULL,12,1,1,3,'opla');
 IF r->>'ok'<>'true' OR (SELECT quantite FROM pg_temp.inventaire WHERE id=1)<>2
  OR (SELECT count(*) FROM pg_temp.ventes)<>1 OR EXISTS(SELECT 1 FROM pg_temp.ventes WHERE benefice IS NOT NULL)
  THEN RAISE EXCEPTION 'vente partielle / achat inconnu'; END IF;
 r:=pg_temp.enregistrer_vente_atomique(u,'manuel-1',1,NULL,12,1,1,3,'opla');
 IF r->>'rejouee'<>'true' OR (SELECT count(*) FROM pg_temp.ventes)<>1 THEN RAISE EXCEPTION 'rejeu manuel'; END IF;
 r:=pg_temp.enregistrer_vente_atomique(u,'autre-appareil',1,NULL,12,1,1,3,'opla');
 IF r->>'ok'<>'false' OR (SELECT quantite FROM pg_temp.inventaire WHERE id=1)<>2 THEN RAISE EXCEPTION 'quantité périmée'; END IF;
 INSERT INTO pg_temp.cross_post_jobs(id,user_id,inventaire_id,platform,action,status,title,price,platform_listing_id,platform_fields) VALUES
 (j1,u,1,'vinted','publish','published','Lot',12,'123456789','{"preuve":"oui","sale_signal":"sold"}'),
 (j2,u,1,'opla','publish','published','Lot',12,'art_abc','{"preuve":"oui"}'),
 (j3,u,2,'vinted','publish','published','ECHEC',12,'222222222','{"preuve":"oui","sale_signal":"sold"}');
 r:=pg_temp.enregistrer_vente_atomique(u,NULL,NULL,j1,12);
 IF r->>'ok'<>'true' OR (SELECT quantite FROM pg_temp.inventaire WHERE id=1)<>1 THEN RAISE EXCEPTION 'vente job'; END IF;
 IF EXISTS(SELECT 1 FROM pg_temp.retraits_test) OR (SELECT status FROM pg_temp.cross_post_jobs WHERE id=j2)<>'published'
 OR (SELECT platform_fields ? 'vente_operation_cle' FROM pg_temp.cross_post_jobs WHERE id=j2)
 THEN RAISE EXCEPTION 'une vente partielle a retiré ou consommé une copie'; END IF;
 r:=pg_temp.enregistrer_vente_atomique(u,NULL,NULL,j1,12);
 IF r->>'rejouee'<>'true' OR (SELECT quantite FROM pg_temp.inventaire WHERE id=1)<>1 THEN RAISE EXCEPTION 'vente partielle rejouée'; END IF;
 r:=pg_temp.enregistrer_vente_atomique(u,NULL,NULL,j2,12);
 IF r->>'ok'<>'true' OR (SELECT quantite FROM pg_temp.inventaire WHERE id=1)<>0
 OR (SELECT count(*) FROM pg_temp.ventes WHERE inventaire_id=1)<>3 THEN RAISE EXCEPTION 'dernière unité non consommée'; END IF;
 IF EXISTS(SELECT 1 FROM pg_temp.retraits_test WHERE job_id=j1) OR EXISTS(SELECT 1 FROM pg_temp.retraits_test WHERE job_id=j2)
 THEN RAISE EXCEPTION 'plateforme de la vente retirée'; END IF;
 INSERT INTO pg_temp.cross_post_jobs(id,user_id,inventaire_id,platform,action,status,title,price,platform_listing_id,platform_fields)
 VALUES('00000000-0000-4000-8000-000000000014',u,2,'opla','publish','published','ECHEC',12,'art_fin','{"preuve":"oui"}');
 ALTER TABLE pg_temp.ventes ADD CONSTRAINT panne_vente CHECK(titre<>'ECHEC');
 BEGIN
  PERFORM pg_temp.enregistrer_vente_atomique(u,NULL,NULL,j3,12);
  RAISE EXCEPTION 'la panne aurait dû remonter';
 EXCEPTION WHEN check_violation THEN NULL;
 END;
 IF (SELECT status FROM pg_temp.cross_post_jobs WHERE id=j3)<>'published'
 OR (SELECT quantite FROM pg_temp.inventaire WHERE id=2)<>1
 OR EXISTS(SELECT 1 FROM pg_temp.ventes_operations WHERE job_id=j3)
 THEN RAISE EXCEPTION 'état partiel après panne'; END IF;
 ALTER TABLE pg_temp.ventes DROP CONSTRAINT panne_vente;
 r:=pg_temp.enregistrer_vente_atomique(u,NULL,NULL,j3,12);
 IF r->>'ok'<>'true' OR (SELECT quantite FROM pg_temp.inventaire WHERE id=2)<>0
 OR (SELECT count(*) FROM pg_temp.ventes WHERE inventaire_id=2)<>1 THEN RAISE EXCEPTION 'reprise après panne'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_temp.retraits_test WHERE job_id='00000000-0000-4000-8000-000000000014')
 THEN RAISE EXCEPTION 'dernière unité : copie prouvée non retirée'; END IF;
 r:=pg_temp.enregistrer_vente_atomique(u,NULL,NULL,j3,12);
 IF r->>'rejouee'<>'true' OR (SELECT count(*) FROM pg_temp.ventes WHERE inventaire_id=2)<>1 THEN RAISE EXCEPTION 'rejeu après panne'; END IF;
 INSERT INTO pg_temp.ventes(user_id,inventaire_id,titre,prix_vente) VALUES(u,3,'Historique',8);
 r:=pg_temp.enregistrer_vente_atomique(u,'historique',3,NULL,8,0,1,1,'vinted');
 IF r->>'ok'<>'false' OR (SELECT count(*) FROM pg_temp.ventes WHERE inventaire_id=3)<>1
 THEN RAISE EXCEPTION 'vente historique recomptée'; END IF;
 INSERT INTO pg_temp.cross_post_jobs(id,user_id,inventaire_id,platform,action,status,title,price,platform_listing_id,platform_fields)
 VALUES('00000000-0000-4000-8000-000000000019',u,3,'opla','publish','sold','Historique',12,'art_historique','{"preuve":"oui"}');
 r:=pg_temp.enregistrer_vente_atomique(u,NULL,NULL,'00000000-0000-4000-8000-000000000019',12);
 IF r->>'ok'<>'false' THEN RAISE EXCEPTION 'ancien sold sans reçu rejoué'; END IF;
 INSERT INTO pg_temp.cross_post_jobs(id,user_id,inventaire_id,platform,action,status,title,price,platform_listing_id,platform_fields) VALUES
 ('00000000-0000-4000-8000-000000000041',u,4,'vinted','publish','published','Même plateforme',10,'444444441','{"preuve":"oui"}'),
 ('00000000-0000-4000-8000-000000000042',u,4,'vinted','publish','published','Même plateforme',10,'444444442','{"preuve":"oui"}');
 r:=pg_temp.enregistrer_vente_atomique(u,NULL,NULL,'00000000-0000-4000-8000-000000000041',10);
 IF r->>'ok'<>'false' OR (SELECT quantite FROM pg_temp.inventaire WHERE id=4)<>2 THEN RAISE EXCEPTION 'deux exemplaires même plateforme'; END IF;
END;
$tests$;
SELECT 'vente, rejeu, stock périmé, copies, panne puis reprise, historique et exemplaires distincts : OK' AS resultat;
