-- INVERSE de 20261024190000 : inventaire_defusionner_pour tel qu'il était EN PROD le 24/10 avant la migration
-- (md5 d311f449d31b8740c13ce5810fbea968). Droits inchangés (CREATE OR REPLACE les garde).
BEGIN;
SET LOCAL statement_timeout = '60s';
CREATE OR REPLACE FUNCTION public.inventaire_defusionner_pour(p_user uuid, p_fusion_id uuid, p_par text DEFAULT 'utilisateur'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := p_user; -- MODIF 2026-09-30 : l'appelant dit pour qui (inventaire_defusionner passe auth.uid())
  f inventaire_fusions%ROWTYPE;
  v_ids bigint[];
  v_uids uuid[];
  v_cle text;
BEGIN
  IF v_user IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'unauthorized'); END IF;
  SELECT * INTO f FROM inventaire_fusions WHERE id = p_fusion_id AND user_id = v_user FOR UPDATE;
  IF f.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'fusion_introuvable'); END IF;
  IF f.defait_le IS NOT NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'deja_defaite'); END IF;

  SELECT array_agg((x)::bigint) INTO v_ids FROM jsonb_array_elements_text(COALESCE(f.deplacements -> 'ventes', '[]'::jsonb)) x;
  IF v_ids IS NOT NULL THEN UPDATE ventes SET inventaire_id = f.absorbe WHERE id = ANY (v_ids) AND user_id = v_user; END IF;
  SELECT array_agg((x)::bigint) INTO v_ids FROM jsonb_array_elements_text(COALESCE(f.deplacements -> 'push_ventes', '[]'::jsonb)) x;
  IF v_ids IS NOT NULL THEN UPDATE push_ventes SET inventaire_id = f.absorbe WHERE id = ANY (v_ids) AND user_id = v_user; END IF;
  SELECT array_agg((x)::bigint) INTO v_ids FROM jsonb_array_elements_text(COALESCE(f.deplacements -> 'remises_en_vente', '[]'::jsonb)) x;
  IF v_ids IS NOT NULL THEN UPDATE remises_en_vente SET inventaire_id = f.absorbe WHERE id = ANY (v_ids) AND user_id = v_user; END IF;
  SELECT array_agg((x)::bigint) INTO v_ids FROM jsonb_array_elements_text(COALESCE(f.deplacements -> 'vinted_listing_snapshots', '[]'::jsonb)) x;
  IF v_ids IS NOT NULL THEN UPDATE vinted_listing_snapshots SET inventaire_id = f.absorbe WHERE id = ANY (v_ids); END IF;
  SELECT array_agg((x)::bigint) INTO v_ids FROM jsonb_array_elements_text(COALESCE(f.deplacements -> 'vinted_republish_captures', '[]'::jsonb)) x;
  IF v_ids IS NOT NULL THEN UPDATE vinted_republish_captures SET inventaire_id = f.absorbe WHERE id = ANY (v_ids); END IF;
  IF f.deplacements ? 'fiches_annonce' THEN
    UPDATE fiches_annonce SET inventaire_id = f.absorbe WHERE inventaire_id = f.garde AND user_id = v_user;
  END IF;
  SELECT array_agg((x)::uuid) INTO v_uids FROM jsonb_array_elements_text(COALESCE(f.deplacements -> 'cross_post_jobs', '[]'::jsonb)) x;
  IF v_uids IS NOT NULL THEN UPDATE cross_post_jobs SET inventaire_id = f.absorbe WHERE id = ANY (v_uids) AND user_id = v_user; END IF;
  SELECT array_agg((x)::uuid) INTO v_uids FROM jsonb_array_elements_text(COALESCE(f.deplacements -> 'annonces_plateforme', '[]'::jsonb)) x;
  IF v_uids IS NOT NULL THEN UPDATE annonces_plateforme SET inventaire_id = f.absorbe, updated_at = now() WHERE id = ANY (v_uids) AND user_id = v_user; END IF;
  SELECT array_agg((x)::uuid) INTO v_uids FROM jsonb_array_elements_text(COALESCE(f.deplacements -> 'rapprochements', '[]'::jsonb)) x;
  IF v_uids IS NOT NULL THEN UPDATE rapprochements SET inventaire_id = f.absorbe WHERE id = ANY (v_uids) AND user_id = v_user; END IF;

  FOR v_cle IN SELECT k FROM jsonb_object_keys(COALESCE(f.champs_repris, '{}'::jsonb)) k LOOP
    IF v_cle = 'prix_achat' THEN
      UPDATE inventaire SET prix_achat = NULLIF(f.champs_repris -> 'prix_achat' ->> 'avant', '')::numeric WHERE id = f.garde;
    ELSIF v_cle = 'prix_achat_inconnu' THEN
      UPDATE inventaire SET prix_achat_inconnu = NULLIF(f.champs_repris -> 'prix_achat_inconnu' ->> 'avant', '')::boolean WHERE id = f.garde;
    ELSIF v_cle = 'description' THEN
      UPDATE inventaire SET description = f.champs_repris -> 'description' ->> 'avant' WHERE id = f.garde;
    ELSIF v_cle = 'marque' THEN
      UPDATE inventaire SET marque = f.champs_repris -> 'marque' ->> 'avant' WHERE id = f.garde;
    ELSIF v_cle = 'photos' THEN
      UPDATE inventaire SET photos = CASE WHEN jsonb_typeof(f.champs_repris -> 'photos' -> 'avant') = 'null'
                                          THEN NULL ELSE f.champs_repris -> 'photos' -> 'avant' END WHERE id = f.garde;
    ELSIF v_cle = 'vinted_identite' AND COALESCE((f.champs_repris -> 'vinted_identite' ->> 'echange')::boolean, false) THEN
      -- AJOUT 2026-09-25 après-midi : ÉCHANGE (remise en ligne). L'absorbé
      -- porte l'annonce RETIRÉE du gardé : on la libère d'abord (index unique),
      -- puis chacun reprend la sienne, disparition et dernière synchro comprises.
      UPDATE inventaire SET vinted_item_id = NULL, vinted_status = NULL, vinted_account_id = NULL WHERE id = f.absorbe;
      UPDATE inventaire
         SET vinted_item_id = f.champs_repris -> 'vinted_identite' -> 'avant' ->> 'vinted_item_id',
             vinted_status = f.champs_repris -> 'vinted_identite' -> 'avant' ->> 'vinted_status',
             vinted_account_id = f.champs_repris -> 'vinted_identite' -> 'avant' ->> 'vinted_account_id',
             vinted_catalog_id = NULLIF(f.champs_repris -> 'vinted_identite' -> 'avant' ->> 'vinted_catalog_id', '')::integer,
             vinted_view_count = NULLIF(f.champs_repris -> 'vinted_identite' -> 'avant' ->> 'vinted_view_count', '')::integer,
             vinted_favourite_count = NULLIF(f.champs_repris -> 'vinted_identite' -> 'avant' ->> 'vinted_favourite_count', '')::integer,
             listed_at_guess = NULLIF(f.champs_repris -> 'vinted_identite' -> 'avant' ->> 'listed_at_guess', '')::timestamptz,
             disparu_le = NULLIF(f.champs_repris -> 'vinted_identite' -> 'avant' ->> 'disparu_le', '')::timestamptz,
             last_synced_at = NULLIF(f.champs_repris -> 'vinted_identite' -> 'avant' ->> 'last_synced_at', '')::timestamptz
       WHERE id = f.garde;
      UPDATE inventaire
         SET vinted_item_id = f.champs_repris -> 'vinted_identite' -> 'apres' ->> 'vinted_item_id',
             vinted_status = f.champs_repris -> 'vinted_identite' -> 'apres' ->> 'vinted_status',
             vinted_account_id = f.champs_repris -> 'vinted_identite' -> 'apres' ->> 'vinted_account_id',
             vinted_catalog_id = NULLIF(f.champs_repris -> 'vinted_identite' -> 'apres' ->> 'vinted_catalog_id', '')::integer,
             vinted_view_count = NULLIF(f.champs_repris -> 'vinted_identite' -> 'apres' ->> 'vinted_view_count', '')::integer,
             vinted_favourite_count = NULLIF(f.champs_repris -> 'vinted_identite' -> 'apres' ->> 'vinted_favourite_count', '')::integer,
             listed_at_guess = NULLIF(f.champs_repris -> 'vinted_identite' -> 'apres' ->> 'listed_at_guess', '')::timestamptz,
             disparu_le = NULLIF(f.champs_repris -> 'vinted_identite' -> 'apres' ->> 'disparu_le', '')::timestamptz,
             last_synced_at = NULLIF(f.champs_repris -> 'vinted_identite' -> 'apres' ->> 'last_synced_at', '')::timestamptz
       WHERE id = f.absorbe;
    ELSIF v_cle = 'vinted_identite' THEN
      -- AJOUT 2026-09-25 : l'identité Vinted rendue à l'absorbé (le gardé la
      -- lâche d'abord : index unique (user_id, vinted_item_id)).
      UPDATE inventaire
         SET vinted_item_id = f.champs_repris -> 'vinted_identite' -> 'avant' ->> 'vinted_item_id',
             vinted_status = f.champs_repris -> 'vinted_identite' -> 'avant' ->> 'vinted_status',
             vinted_account_id = f.champs_repris -> 'vinted_identite' -> 'avant' ->> 'vinted_account_id',
             vinted_catalog_id = NULLIF(f.champs_repris -> 'vinted_identite' -> 'avant' ->> 'vinted_catalog_id', '')::integer,
             vinted_view_count = NULLIF(f.champs_repris -> 'vinted_identite' -> 'avant' ->> 'vinted_view_count', '')::integer,
             vinted_favourite_count = NULLIF(f.champs_repris -> 'vinted_identite' -> 'avant' ->> 'vinted_favourite_count', '')::integer,
             listed_at_guess = NULLIF(f.champs_repris -> 'vinted_identite' -> 'avant' ->> 'listed_at_guess', '')::timestamptz
       WHERE id = f.garde;
      UPDATE inventaire
         SET vinted_item_id = f.champs_repris -> 'vinted_identite' -> 'apres' ->> 'vinted_item_id',
             vinted_status = f.champs_repris -> 'vinted_identite' -> 'apres' ->> 'vinted_status',
             vinted_account_id = f.champs_repris -> 'vinted_identite' -> 'apres' ->> 'vinted_account_id',
             vinted_catalog_id = NULLIF(f.champs_repris -> 'vinted_identite' -> 'apres' ->> 'vinted_catalog_id', '')::integer,
             vinted_view_count = NULLIF(f.champs_repris -> 'vinted_identite' -> 'apres' ->> 'vinted_view_count', '')::integer,
             vinted_favourite_count = NULLIF(f.champs_repris -> 'vinted_identite' -> 'apres' ->> 'vinted_favourite_count', '')::integer,
             listed_at_guess = NULLIF(f.champs_repris -> 'vinted_identite' -> 'apres' ->> 'listed_at_guess', '')::timestamptz
       WHERE id = f.absorbe;
    ELSIF v_cle = 'attributs' THEN
      UPDATE inventaire SET attributs = CASE WHEN jsonb_typeof(f.champs_repris -> 'attributs' -> 'avant') = 'null'
                                             THEN NULL ELSE f.champs_repris -> 'attributs' -> 'avant' END WHERE id = f.garde;
    END IF;
  END LOOP;

  UPDATE inventaire SET fusionne_dans = NULL, fusionne_le = NULL WHERE id = f.absorbe AND user_id = v_user;
  UPDATE inventaire_fusions SET defait_le = now() WHERE id = f.id;
  -- AJOUT 2026-09-25 : une fusion défaite n'est JAMAIS refaite ni reproposée.
  UPDATE inventaire_doublons SET statut = 'defaite', decide_le = now(), decide_par = COALESCE(NULLIF(p_par, ''), 'utilisateur') -- MODIF 2026-09-30
   WHERE user_id = v_user AND least(garde, absorbe) = least(f.garde, f.absorbe) AND greatest(garde, absorbe) = greatest(f.garde, f.absorbe);
  RETURN jsonb_build_object('ok', true, 'fusion_id', f.id, 'garde', f.garde, 'absorbe', f.absorbe);
END;
$function$;
COMMIT;
