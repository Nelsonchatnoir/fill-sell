-- 20261107193300 — Une remise en vente ne reprend AUCUNE trace du cycle de l'annonce vendue (07/11 soir, rouges famille 3/4)
--
-- Constat vérifié en lecture le 07/11 : la publication créée par remises_en_vente_tick copie les platform_fields du job
-- VENDU par remise_en_vente_champs(), qui ne filtre ni depot_parti_*, ni deleted_at*, ni recreat*, ni new_vinted_item_id /
-- old_vinted_item_id, ni canal_coupe*, ni reconciliation, ni suppression_verdict : ce sont les traces du RETRAIT et de la
-- RECRÉATION de l'annonce d'avant (la republication vendue). Cas : 7e7f0769 (d71db658), créé le 05/11 à 10:25, porte
-- depot_parti_vers_profil du 02/11 07:57, deleted_at du 02/11, new_vinted_item_id 10631712126 (l'annonce VENDUE),
-- reconciliation « recréation confirmée par son numéro » — tout hérité du job vendu f5cc2af6. Lecteurs de ces traces :
-- l'extension (retraitEngageJob : « deleted_at » = retrait engagé, la tâche « va au bout »), get-pending-jobs (un dépôt
-- portant deleted_at est écarté de certains juges ; new_vinted_item_id = « l'annonce qu'elle a créée »),
-- _shared/accident-avant-retrait.js (MARQUES_RETRAIT_OU_DEPOT). Parc (07/11, job_vendu des remises) : 727 jobs vendus
-- portent deleted_at, 661 new_vinted_item_id, 296 depot_parti_vers_profil ; 19 des 42 remises « proposées » les
-- copieraient à l'acceptation.
--
-- LA RÈGLE (tous comptes) : la copie d'une remise en vente passe AUSSI par public.republication_sans_traces() — la règle
-- par préfixes qui nettoie déjà une republication (04/11 : retrait, suppression_, deleted_, recreat, old_, retenue_,
-- orphan_, delete_, deja_absente, beebs_404_, error_technique, republished_, new_listing) — et retire en plus
-- depot_parti*, canal_coupe*, reconciliation, new_vinted_item_id. Rien d'autre ne change : remises_en_vente_tick n'est
-- pas touchée (son seul appel de remise_en_vente_champs reste tel quel), chaque ligne de la définition de prod est gardée
-- (seul le « ; » final descend de deux lignes), aucune donnée n'est réécrite (les publications déjà créées gardent leurs
-- clés : 8 remises Leboncoin « pending » en portent, réparation par script seulement sur décision).
-- Définition réécrite depuis pg_get_functiondef EN PRODUCTION (07/11 soir, md5 ed9916db204d2d867d7c9aa13fad6c0f) ;
-- inverse : supabase/rollbacks/20261107193300_remise_en_vente_sans_traces_heritees_INVERSE.sql ;
-- preuve (Postgres jetable) : PREUVE_PG=embarque node scripts/preuve-remise-en-vente-sans-traces.mjs
-- Ni BEGIN ni COMMIT ici : l'application est une, explicite, après le feu vert.

-- ── Garde : la prod est celle lue le 07/11 soir (ou cette migration est déjà passée) ──
DO $garde$
DECLARE v_d text; v_n integer;
BEGIN
  SELECT replace(pg_get_functiondef('public.remise_en_vente_champs(jsonb)'::regprocedure), chr(13), '') INTO v_d;
  IF md5(v_d) <> 'ed9916db204d2d867d7c9aa13fad6c0f' AND position('republication_sans_traces' IN v_d) = 0 THEN
    RAISE EXCEPTION 'remise_en_vente_champs a changé en prod depuis le 07/11 soir : repartir de pg_get_functiondef';
  END IF;
  SELECT replace(pg_get_functiondef('public.republication_sans_traces(jsonb)'::regprocedure), chr(13), '') INTO v_d;
  IF md5(v_d) <> '7b19179a18e09dd4e616fa7271e79f22' THEN
    RAISE EXCEPTION 'republication_sans_traces a changé en prod depuis le 07/11 soir : relire ses préfixes avant de s''y appuyer';
  END IF;
  -- un seul appelant (remises_en_vente_tick) : la règle ne touche aucune autre copie
  SELECT count(*) INTO v_n FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public'
   WHERE p.prokind = 'f' AND p.proname <> 'remise_en_vente_champs' AND p.prosrc ~ 'remise_en_vente_champs\(';
  IF v_n <> 1 OR NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'remises_en_vente_tick' AND prosrc ~ 'remise_en_vente_champs\(j\.platform_fields\)') THEN
    RAISE EXCEPTION 'remise_en_vente_champs a % appelant(s) : la règle n''a été prouvée que pour remises_en_vente_tick', v_n;
  END IF;
END
$garde$;

-- ── remise_en_vente_champs : définition de PROD du 07/11, chaque ligne gardée, deux conditions ajoutées ──
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
     || 'new_listing|vinted_item_id|item_id|marque_traduite|colis_au_service|livraison_au_service)')
     -- ⛔ (07/11 soir, 7e7f0769) AUCUNE TRACE DU CYCLE DE L'ANNONCE VENDUE : ni retrait, ni recréation, ni « dépôt parti
     -- vers le profil », ni canal coupé, ni réconciliation, ni numéro créé — la règle de la republication
     -- (republication_sans_traces, 04/11) plus quatre familles qu'elle ne nomme pas. Le contenu (titre, prix, photos,
     -- champs de la plateforme) passe comme avant.
     AND public.republication_sans_traces(jsonb_build_object(e.key, e.value)) ? e.key
     AND e.key !~ '^(depot_parti|canal_coupe|reconciliation$|new_vinted_item_id$)';
$function$;
