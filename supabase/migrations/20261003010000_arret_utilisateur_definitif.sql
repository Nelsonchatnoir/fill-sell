-- ═══════════════════════════════════════════════════════════════════════════
-- UN DÉPÔT ARRÊTÉ À LA DEMANDE DE LA PERSONNE NE REPART JAMAIS (03/10/2026)
-- ═══════════════════════════════════════════════════════════════════════════
-- ⛔ ÉCRITE LA NUIT DU 02 AU 03/10, NON APPLIQUÉE — attend le GO nommé de Nico.
--    Application (règle du 01/10) : `npx supabase db query --linked -f <ce
--    fichier>` PUIS `npx supabase migration repair --linked --status applied
--    20261003010000`, et relecture (md5 du corps contre ce fichier).
--
-- LE TROU (relu dans le code, chantier « publication en lot ») :
--   1. la personne arrête un dépôt en file (status 'cancelled' +
--      platform_fields.arret_utilisateur) ;
--   2. l'extension l'avait DÉJÀ chargé dans sa boucle (get-pending-jobs sert
--      toute la file, la boucle la traite job après job pendant de longues
--      minutes) : elle demande 'processing' → refusé ici (statut 'cancelled'),
--      l'exception tombe dans le catch de processJob → elle écrit 'failed' ;
--   3. pour un statut autre que 'processing', cette fonction répondait ok →
--      update-job-status écrivait, et pas-de-rouge (classerEchec) requalifiait
--      ce failed inconnu en REPRISE : 'pending' dans 15 minutes. Le dépôt que
--      la personne venait d'arrêter repartait — et partait.
--   Même trou pour l'arrêt des republications (StockTab, arreterRepublications).
--
-- LE REMÈDE : ici, la porte que TOUTE écriture de l'extension franchit avant de
-- toucher un job (update-job-status, point C). Un job annulé avec le marqueur
-- `arret_utilisateur` refuse désormais toute écriture de l'extension — rien
-- n'est réécrit, rien ne repart. Le reste de la fonction est INCHANGÉ (corps
-- relu en prod par pg_get_functiondef le 02/10 à 23:40, jamais repris d'un
-- fichier).
-- Parade côté app en attendant (src/publication/lot/arretLot.js) :
-- needsUserAttempts très haut sur la ligne arrêtée — pas de reprise, au pire
-- « à relancer », refermé au passage suivant.

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

-- ── INVERSE (prêt, à ne lancer que pour revenir en arrière) ─────────────────
-- Le corps de prod du 02/10 23:40, à l'identique : supprimer les trois lignes
-- « (03/10) Arrêté à la demande… » ci-dessus et rejouer le CREATE OR REPLACE.
