-- ═══════════════════════════════════════════════════════════════════════════
-- UNE PUBLICATION RETENUE NE DÉMARRE PAS, MÊME DÉJÀ SERVIE (23/10, point 1 — Thierry, urgence)
-- ═══════════════════════════════════════════════════════════════════════════
-- CE QUI S'EST PASSÉ : à 11:23, l'extension de Thierry (0.6.128) reçoit d'un seul poll ses 117 publications Vinted et
-- les dépose une par une, une par minute, SANS relire la file entre deux (la relecture entre deux tâches n'existe que
-- depuis la 0.6.130). La retenue « lecture de l'annonce d'origine » posée par get-pending-jobs (v272, 11:43) ne
-- l'atteint donc qu'au poll suivant : 1 h 30 de dépôts à une seule photo de 140 px.
--
-- LA RÈGLE : une publication RETENUE (platform_fields.attente_lecture_origine, posée par get-pending-jobs ou par un
-- script de réparation) ne démarre pas — la prise en charge (« processing ») est refusée au poste qui la tient en
-- mémoire — et rien de ce poste ne l'écrit (ni « failed », ni « needs_user », ni un ré-armement « pending ») : elle
-- reste en file, telle quelle, sans message d'erreur, et repart seule quand get-pending-jobs lève la retenue (fiche
-- complète). ⛔ Un résultat RÉEL n'est jamais refusé (« published », « dry_run_completed », « deleted ») : une
-- annonce créée doit toujours être rattachée. ⛔ Seul un job encore « pending » est concerné : un job déjà en cours
-- (« processing ») va au bout.
-- Fonction RÉÉCRITE depuis pg_get_functiondef relu en prod le 23/10 vers 11:50.
-- Inverse : supabase/rollbacks/20261023110000_retenue_lecture_origine_au_demarrage_INVERSE.sql
BEGIN;

CREATE OR REPLACE FUNCTION public.controler_job_extension(p_user uuid, p_poste text, p_job uuid, p_statut text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
 SET statement_timeout TO '2s'
 SET lock_timeout TO '500ms'
AS $function$
DECLARE j cross_post_jobs%ROWTYPE; r jobs_reservations_extension%ROWTYPE;
BEGIN
 IF p_user IS NULL OR nullif(p_poste,'') IS NULL OR length(p_poste)>180 THEN
  RETURN jsonb_build_object('ok',false,'reason','Session de ce poste indisponible. Reconnecte FillSell.'); END IF;
 SELECT * INTO j FROM cross_post_jobs WHERE id=p_job AND user_id=p_user FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','Job introuvable.'); END IF;
 -- (03/10) Arrêté à la demande de la personne : plus aucune écriture, quel que
 -- soit le statut demandé (le 'failed' tardif d'une ancienne boucle compris).
 IF j.status = 'cancelled' AND COALESCE(j.platform_fields, '{}'::jsonb) ? 'arret_utilisateur' THEN
  RETURN jsonb_build_object('ok',false,'reason','Arrêtée à ta demande : rien à faire.'); END IF;
 -- (23/10) Retenue au départ (lecture de l'annonce d'origine) : ne démarre pas, et une ancienne boucle qui la tient
 -- en mémoire n'y écrit rien — elle reste en file, sans erreur, et repart seule quand la retenue est levée.
 IF j.status = 'pending' AND COALESCE(j.platform_fields, '{}'::jsonb) ? 'attente_lecture_origine'
    AND p_statut IN ('processing', 'failed', 'needs_user', 'pending') THEN
  RETURN jsonb_build_object('ok',false,'reason','En cours de lecture de ton annonce d''origine : elle partira toute seule avec toutes ses photos. Rien à faire.'); END IF;
 IF j.status NOT IN ('pending','processing') THEN
  IF p_statut='processing' THEN RETURN jsonb_build_object('ok',false,'reason','Ce job n’est plus à exécuter. Actualise la file.'); END IF;
  RETURN jsonb_build_object('ok',true,'reservation',null,'statut',j.status);
 END IF;
 SELECT * INTO r FROM jobs_reservations_extension WHERE job_id=p_job FOR UPDATE;
 IF FOUND AND r.poste<>p_poste THEN
  RETURN jsonb_build_object('ok',false,'reason','Ce job est réservé à un autre poste. Rien à exécuter ici.'); END IF;
 IF r.job_id IS NULL THEN
  -- File chargée avant le déploiement : le premier processing obtient le verrou,
  -- sans exiger un nouveau champ des anciennes extensions.
  INSERT INTO jobs_reservations_extension(job_id,user_id,poste) VALUES(p_job,p_user,p_poste)
   RETURNING * INTO r;
 END IF;
 RETURN jsonb_build_object('ok',true,'reservation',r.reservation,'statut',j.status);
END;
$function$;

COMMIT;
