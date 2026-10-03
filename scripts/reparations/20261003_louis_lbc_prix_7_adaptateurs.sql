-- ═══════════════════════════════════════════════════════════════════════════
-- LOUIS — « 12 ADAPTATEURS LA LAITIÈRE » LEBONCOIN REMIS À 7 € (03/10, ~23:00)
-- ═══════════════════════════════════════════════════════════════════════════
-- Sur les 23 republications Leboncoin parties à un autre prix que celui de
-- l'annonce (18/09 → 03/10), c'est la seule qui soit NOTRE erreur sans doute
-- possible : republication AUTOMATIQUE du 02/10 19:00 au prix de la tâche
-- source du 19/09 (10 €), alors que Louis avait baissé l'article à 7 € dans
-- l'app (fiche 7 €) ET sur Leboncoin (relevé du 01/10 22:55 : 7 €).
-- Défaut corrigé par get-pending-jobs v202 (le prix relevé de l'annonce).
-- Vérifié avant : fiche en stock, aucune vente, aucune tâche Leboncoin en
-- cours ; page Leboncoin lue dans Chrome à 22:55 : en ligne, 10 €, « Acheter »
-- (une offre en cours ne se voit que depuis le compte de Louis).
-- Méthode : republication à 7 € (l'extension ne sait pas modifier un prix),
-- copiée de la tâche publiée 3ce017e3, comme spend_coins_and_republish, sans
-- débit. Avant tout retrait, l'extension relit l'annonce : vendue ou hors
-- ligne → rien n'est retiré.
-- Inverse : _INVERSE.sql (annule la tâche tant qu'elle n'a rien retiré).
begin;
do $$
declare
  v_src record;
  v_pf jsonb;
begin
  for v_src in
    select j.* from public.cross_post_jobs j
    where j.id = '3ce017e3-592b-4d74-bd07-c7e1fdbfa599'
      and j.status = 'published' and j.user_id = 'faf5021a-479a-4bb3-b3ec-c296770739b7'
      and exists (select 1 from public.inventaire i where i.id = j.inventaire_id and i.statut = 'stock' and i.prix_vente = 7)
      and not exists (select 1 from public.ventes v where v.inventaire_id = j.inventaire_id)
      and not exists (select 1 from public.cross_post_jobs k where k.inventaire_id = j.inventaire_id
                      and k.platform = 'leboncoin' and k.status in ('pending', 'processing', 'needs_user'))
  loop
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
      v_src.user_id, v_src.inventaire_id, 'leboncoin', 'republish', 'pending', coalesce(v_src.photo_option, 'original'),
      v_src.title, v_src.description, 7, v_src.photos, v_src.listing_url, v_src.platform_listing_id,
      v_pf || jsonb_build_object(
        'republish_step', 'a_capturer',
        'republish_source', 'manuel',
        'republish_platform', 'leboncoin',
        'republish_source_job_id', v_src.id,
        'pepites_debitees', 0,
        'prix_republication', 7,
        'correction_prix', jsonb_build_object(
          'par', 'Nico (03/10 nuit)', 'avant', v_src.price, 'apres', 7,
          'motif', 'republication auto du 02/10 partie au prix de la tâche source (10 €) au lieu du prix de la fiche et de l''annonce (7 €)',
          'pose_par', 'scripts/reparations/20261003_louis_lbc_prix_7_adaptateurs.sql'),
        'republish_snapshot', jsonb_build_object(
          'version', 2, 'plateforme', 'leboncoin', 'source_job_id', v_src.id,
          'titre', v_src.title, 'prix', 7, 'listing_url', v_src.listing_url,
          'platform_listing_id', v_src.platform_listing_id,
          'photos', case when jsonb_typeof(v_src.photos) = 'array' then jsonb_array_length(v_src.photos) else 0 end,
          'captured_at', now())));
  end loop;
end $$;
select left(id::text, 8) id, inventaire_id, platform_listing_id, price, status, platform_fields->>'republish_step' step,
       jsonb_array_length(coalesce(photos, '[]'::jsonb)) photos
from public.cross_post_jobs
where platform_fields->'correction_prix'->>'pose_par' = 'scripts/reparations/20261003_louis_lbc_prix_7_adaptateurs.sql';
commit;
