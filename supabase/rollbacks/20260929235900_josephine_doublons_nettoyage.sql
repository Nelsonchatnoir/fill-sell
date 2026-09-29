-- Inverse PARTIEL de 20260929235900 (josephinecerni, nettoyage des doublons).
-- ⚠️ Ne pas lancer sans décision : il remet les 21 dépôts « sans numéro » et
-- détache les 21 annonces, ce qui rouvre exactement l'incident.
-- Les 21 fiches en double et leurs jobs « releve-annonces » ne reviennent pas
-- à l'identique (non copiés avant suppression) : le relevé suivant, import
-- ouvert, les réimporterait depuis la capture de l'annonce.
SET statement_timeout = '10s';
SET lock_timeout = '1s';
DO $inverse$
BEGIN
  PERFORM set_config('fillsell.lien_decide_par_utilisateur', 'on', true);
  UPDATE annonces_plateforme a
     SET inventaire_id = NULL, job_id = NULL, source_rapprochement = NULL, updated_at = now()
    FROM cross_post_jobs d
   WHERE d.platform_fields ? 'lien_par_decision_incident_2909'
     AND a.id = (d.platform_fields -> 'lien_par_decision_incident_2909' ->> 'annonce_id')::uuid;
  UPDATE cross_post_jobs d
     SET listing_url = NULL, platform_listing_id = NULL,
         platform_fields = (d.platform_fields - 'lien_par_decision_incident_2909')
           || jsonb_build_object('lien_en_attente', jsonb_build_object(
                'depuis', now(), 'plateforme', 'beebs',
                'motif', 'retour arrière du nettoyage du 29/09 — annonce non retirable en l''état'))
   WHERE d.platform_fields ? 'lien_par_decision_incident_2909';
END
$inverse$;
