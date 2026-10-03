-- ═══════════════════════════════════════════════════════════════════════════
-- UNE TÂCHE SERVIE SANS JAMAIS DÉMARRER SE COMPTE (03/10, point F)
-- ═══════════════════════════════════════════════════════════════════════════
-- doriane-henri (Pro, extension 0.6.89) : la guitare Paw Patrol (publication,
-- en file depuis le 28/09) et la coque A05 (republication, depuis le 27/09)
-- lui étaient servies à CHAQUE passage — et jamais commencées : aucune
-- écriture, la réservation se reprenait toute seule (même poste, non
-- commencée). Les deux attendaient une lecture de son dressing Vinted que
-- l'onglet ne rendait plus : 3 à 4 min d'attente par tâche, un cycle de
-- 8 min au lieu de 2, et rien d'autre ne passait. Rien ne le voyait.
--
-- Ici : le nombre de fois qu'une tâche est servie au MÊME poste sans être
-- commencée (servi_n) et le premier de ces services (premier_service). Une
-- tâche commencée puis rendue repart à zéro (sa réservation est supprimée par
-- ecrire_statut_job_extension / liberer_reservation_job_termine, inchangées).
-- get-pending-jobs lit le compteur et met de côté ce qui ne démarre jamais
-- (_shared/tache-sans-demarrage.js) — la file passe, la personne le lit.
--
-- reserver_jobs_extension : repartie de la définition EN PROD (relue le 03/10
-- à 17:45 par pg_get_functiondef) ; seuls le compteur et sa date sont ajoutés.
-- Idempotente (IF NOT EXISTS, CREATE OR REPLACE).

ALTER TABLE public.jobs_reservations_extension
  ADD COLUMN IF NOT EXISTS servi_n integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS premier_service timestamptz NOT NULL DEFAULT now();

CREATE OR REPLACE FUNCTION public.reserver_jobs_extension(p_user uuid, p_poste text, p_jobs uuid[])
 RETURNS uuid[]
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
 SET statement_timeout TO '2s'
 SET lock_timeout TO '500ms'
AS $function$
DECLARE v_id uuid; j cross_post_jobs%ROWTYPE; r jobs_reservations_extension%ROWTYPE;
 resultat uuid[]:='{}';
BEGIN
 IF p_user IS NULL OR nullif(p_poste,'') IS NULL OR length(p_poste)>180 THEN RETURN resultat; END IF;
 FOR v_id IN SELECT id FROM unnest(p_jobs) WITH ORDINALITY x(id,n) ORDER BY n LIMIT 100 LOOP
  SELECT * INTO j FROM cross_post_jobs WHERE id=v_id AND user_id=p_user
   AND voie='extension' AND status='pending' FOR UPDATE SKIP LOCKED;
  IF NOT FOUND THEN CONTINUE; END IF;
  SELECT * INTO r FROM jobs_reservations_extension WHERE job_id=v_id FOR UPDATE;
  -- Un processing revenu pending a été rendu par le veilleur ou l'utilisateur.
  -- Une file distribuée mais pas commencée expire ; l'ancien poste devra alors
  -- repasser le contrôle avant tout geste, et sera refusé si un autre l'a prise.
  IF FOUND AND NOT r.commence AND r.expire_le>now() THEN
   -- Le même poste peut relire une file ignorée par une publication ciblée.
   -- Les autres postes attendent ; aucun renouvellement de génération ici.
   IF r.poste=p_poste THEN
    -- (03/10) Servie de nouveau sans avoir été commencée : comptée.
    UPDATE jobs_reservations_extension SET servi_n=servi_n+1 WHERE job_id=v_id;
    resultat:=array_append(resultat,v_id);
   END IF;
   CONTINUE;
  END IF;
  INSERT INTO jobs_reservations_extension(job_id,user_id,poste,servi_n,premier_service)
   VALUES(v_id,p_user,p_poste,1,now()) ON CONFLICT(job_id) DO UPDATE SET
   poste=EXCLUDED.poste,reservation=gen_random_uuid(),expire_le=now()+interval '10 minutes',commence=false,
   -- (03/10) Même poste, jamais commencée : le compte continue ; sinon il repart.
   servi_n=CASE WHEN jobs_reservations_extension.poste=EXCLUDED.poste AND NOT jobs_reservations_extension.commence
     THEN jobs_reservations_extension.servi_n+1 ELSE 1 END,
   premier_service=CASE WHEN jobs_reservations_extension.poste=EXCLUDED.poste AND NOT jobs_reservations_extension.commence
     THEN jobs_reservations_extension.premier_service ELSE now() END;
  resultat:=array_append(resultat,v_id);
 END LOOP;
 RETURN resultat;
END;
$function$;
