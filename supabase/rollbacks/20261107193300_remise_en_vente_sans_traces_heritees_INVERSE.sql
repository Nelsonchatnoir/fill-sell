-- INVERSE de 20261107193300_remise_en_vente_sans_traces_heritees : la définition de PROD du 07/11 soir, mot pour mot
-- (pg_get_functiondef, sans CR ; md5 ed9916db204d2d867d7c9aa13fad6c0f). Aucune donnée à rendre : la migration n'en écrit pas.
CREATE OR REPLACE FUNCTION public.remise_en_vente_champs(p_pf jsonb)
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT COALESCE(jsonb_object_agg(e.key, e.value), '{}'::jsonb)
    FROM jsonb_each(CASE WHEN jsonb_typeof(p_pf) = 'object' THEN p_pf ELSE '{}'::jsonb END) e
   WHERE e.key !~ ('^(source|rattachement|check_|work_window|processing_since|veille_|quantite_ebay|'
     || 'last_diagnostic|unavailable|sale_|sold_|warnings|listing_url|lbc_depot|livraison_lbc|detected_price|'
     || 'beebs_moderation|beebs_valeurs_posees|beebs_index|beebs_rouvert|revue_|absence_|fin_ebay|reporte_|'
     || 'lien_|lien$|erreurs_|alerte_|numero_|vente|candidat_|needsUserAttempts|needsUserBoucle|'
     || 'needsUserField|needs_user|ebay_api|ebay_draft|ebay_format|ebay_connexion|ebayCategorieAttente|'
     || 'ebay_rayon_aveugle|moderation_|avant_|error_|retour_|preuve_|sequence_|opla_acces|opla_cookies|'
     || 'opla_sortie|publish_|derniere_|relance|pending_removal|retrait_|identifiant_|unfilled_|'
     || 'server_required|pas_de_rouge|attente_|lot_publication|suspect_|verdict_|stale_|reprise|'
     || 'rattrapage_|horloge_|plateforme_reprise|next_action|fige_|tache_|vinted_account_proof|gel_|'
     || 'remise_en_vente|republish|superseded|statut_reel|boucle|mur_|refus_|repare|requalif|'
     || 'reparation|titre_corrige|sonde_|compte_vendeur|build_min|correctif|verifier_doublon|'
     || 'new_listing|vinted_item_id|item_id|marque_traduite|colis_au_service|livraison_au_service)');
$function$;
