-- ═══════════════════════════════════════════════════════════════════════════
-- LOUIS — INSERTS VERT ET ROSE (2ᵉ ÉDITION) REMIS À 10 € (03/10, ~22:45)
-- ═══════════════════════════════════════════════════════════════════════════
-- Republiés à 19:00/19:18 au prix de la tâche SOURCE du 19/09 (12 €) au lieu
-- du prix où ils étaient en ligne (10 €, fiche à 10 €) — défaut corrigé par
-- get-pending-jobs v202. Nico : « remets-les à 10 € ».
-- L'extension ne sait pas modifier un prix sur Beebs (actions : publier,
-- retirer, republier) : la méthode est une REPUBLICATION à 10 €, copiée de la
-- dernière tâche publiée (même titre, photos, rayon, âge, état, marque),
-- exactement comme spend_coins_and_republish (branche multiplateforme), sans
-- débit (price_republish = 0). prix_republication = 10 : le prix est choisi,
-- la reprise du relevé (12 €) ne s'applique pas.
-- Avant tout retrait, l'extension relit l'annonce (checkListingState) :
-- vendue ou hors ligne → rien n'est retiré.
-- Vérifié avant : fiches en stock, aucune vente, aucune tâche en cours.
-- ⚠️ Exception à la cadence 24 h (republiées il y a ~2 h) : décision de Nico.
-- Inverse : _INVERSE.sql (annule les deux tâches tant qu'elles n'ont rien retiré).
begin;
do $$
declare
  v_src record;
  v_photos jsonb;
  v_pf jsonb;
begin
  for v_src in
    select j.* from public.cross_post_jobs j
    where j.id in ('e97e9f8a-f658-4b4d-8fdd-0d8334e2b6e6', 'ce621046-5600-4695-b6e5-36f923a956ae')
      and j.status = 'published' and j.user_id = 'faf5021a-479a-4bb3-b3ec-c296770739b7'
      and exists (select 1 from public.inventaire i where i.id = j.inventaire_id and i.statut = 'stock')
      and not exists (select 1 from public.ventes v where v.inventaire_id = j.inventaire_id)
      and not exists (select 1 from public.cross_post_jobs k where k.inventaire_id = j.inventaire_id
                      and k.platform = 'beebs' and k.status in ('pending', 'processing', 'needs_user'))
  loop
    v_photos := v_src.photos;
    v_pf := coalesce(v_src.platform_fields, '{}'::jsonb)
      - array['needsUserField', 'needsUserFields', 'needsUserResolved', 'needsUserAttempts', 'needsUserBoucle',
              'boucle_needs_user', 'needs_user_tick_le', 'needs_user_source', 'processing_since', 'next_action_after',
              'stale_recoveries', 'attente_session', 'blocage_antirobot', 'porte_pro_lbc', 'erreurs_archivees',
              'work_window_state', 'last_diagnostic', 'lbc_depot', 'lbc_depot_non_finalise', 'depot_non_confirme_requalifie',
              'verifier_doublon_avant_publication', 'unavailable_since', 'unavailable_pending_since', 'sale_signal',
              'detected_price', 'removed_by_user', 'republished_pending', 'delete_trace', 'delete_confirmed_by',
              'delete_dry_run_trace', 'listing_url_abandon', 'retrait_attend_lien', 'removal_url_missing',
              'republish_step', 'republish_source', 'republish_snapshot', 'republish_platform', 'republish_source_job_id',
              'republish_recreation', 'recreated_at', 'deleted_at', 'deleted_at_client', 'deleted_at_serveur',
              'horloge_client_ecart_s', 'suppression_verdict', 'old_listing_url', 'old_platform_listing_id',
              'recreation_retries', 'pepites_debitees', 'pepite_remboursee', 'prix_republication', 'orphan_alerted_at',
              'deleted_hang_count', 'introuvable_indetermine', 'attente_boutique', 'republish_creneau_id',
              'republish_sweep_at', 'republish_moteur', 'republish_planifie', 'republish_prevol', 'republish_etat_reel',
              'needs_user_actif_ms', 'needs_user_sans_motif', 'needs_user_vu_erreur', 'needs_user_vu_le',
              'new_listing_url', 'republish_retrait', 'republish_prevol_formulaire', 'relance_serveur', 'warnings',
              'champs_repris_de_l_annonce', 'prix_repris_de_l_annonce'];
    insert into public.cross_post_jobs (user_id, inventaire_id, platform, action, status, photo_option,
                                        title, description, price, photos, listing_url, platform_listing_id, platform_fields)
    values (
      v_src.user_id, v_src.inventaire_id, 'beebs', 'republish', 'pending', coalesce(v_src.photo_option, 'original'),
      v_src.title, v_src.description, 10, v_photos, v_src.listing_url, v_src.platform_listing_id,
      v_pf || jsonb_build_object(
        'republish_step', 'a_capturer',
        'republish_source', 'manuel',
        'republish_platform', 'beebs',
        'republish_source_job_id', v_src.id,
        'pepites_debitees', 0,
        'prix_republication', 10,
        'correction_prix', jsonb_build_object(
          'par', 'Nico (03/10 nuit)', 'avant', v_src.price, 'apres', 10,
          'motif', 'republication du 03/10 partie au prix de la tâche source (12 €) au lieu du prix en ligne (10 €)',
          'pose_par', 'scripts/reparations/20261003_louis_beebs_prix_10_vert_rose.sql'),
        'republish_snapshot', jsonb_build_object(
          'version', 2, 'plateforme', 'beebs', 'source_job_id', v_src.id,
          'titre', v_src.title, 'prix', 10, 'listing_url', v_src.listing_url,
          'platform_listing_id', v_src.platform_listing_id,
          'photos', case when jsonb_typeof(v_photos) = 'array' then jsonb_array_length(v_photos) else 0 end,
          'captured_at', now())));
  end loop;
end $$;
select left(id::text, 8) id, inventaire_id, platform_listing_id, price, status, platform_fields->>'republish_step' step
from public.cross_post_jobs
where platform_fields->'correction_prix'->>'pose_par' = 'scripts/reparations/20261003_louis_beebs_prix_10_vert_rose.sql';
commit;
