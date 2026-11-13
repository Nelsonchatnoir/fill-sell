-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- PREUVE (lecture seule) de 20261113_98b72757_ville_publication_cedex.sql — avant ET après, sans rien écrire
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- Lu le 13/11 (AVANT) : ville_publication {"ville": "Cholet", "code_postal": "49308"} · adresse_cp 49300 · adresse_ville
-- Cholet · annonces_lbc_cholet_49300 26 · annonces_lbc_autres 0 · publications_ouvertes_49308 12 (11 pending + 1
-- processing remis en pending par handler-watch à 06:48) · publications_ouvertes_49300 0 · sauvegarde absente.
-- La règle (node, module livré) : vraiCodePostalDeLaCommune({ site: "leboncoin", ville: "Cholet", code_postal: "49308",
-- adresses: [{ ville: "Cholet", code_postal: "49300" }] }) → { verdict: "repli", code_postal: "49300", source: "adresse" }.
-- ATTENDU APRÈS la réparation : ville_publication {"ville": "Cholet", "code_postal": "49300"} · sauvegarde présente
-- (1 ligne, avant 49308). Les publications ouvertes gardent leur copie 49308 : get-pending-jobs les sert en 49300
-- (règle N6b) ; après le déploiement, chaque tâche servie porte platform_fields.lbc_commune_meme_cp
-- { motif: "cp_non_commune_repli", code_postal_servi: "49300", source_code_postal: "adresse" }.
-- À jouer : npx supabase db query --linked --read-only -f scripts/reparations/20261113_98b72757_ville_publication_cedex_PREUVE.sql
SELECT
  p.platform_settings -> 'leboncoin' -> 'ville_publication' AS ville_publication,
  p.platform_settings -> 'leboncoin' ->> 'code_postal' AS adresse_cp,
  p.platform_settings -> 'leboncoin' ->> 'ville' AS adresse_ville,
  (SELECT count(*) FROM public.annonces_plateforme a
    WHERE a.user_id = p.id AND a.platform = 'leboncoin'
      AND a.capture -> 'localisation' ->> 'code_postal' = '49300' AND a.capture -> 'localisation' ->> 'ville' = 'Cholet') AS annonces_lbc_cholet_49300,
  (SELECT count(*) FROM public.annonces_plateforme a
    WHERE a.user_id = p.id AND a.platform = 'leboncoin'
      AND coalesce(a.capture -> 'localisation' ->> 'code_postal', '') <> '49300') AS annonces_lbc_autres,
  (SELECT count(*) FROM public.cross_post_jobs j
    WHERE j.user_id = p.id AND j.platform = 'leboncoin' AND j.status IN ('pending', 'processing', 'needs_user')
      AND j.platform_fields -> 'ville_publication_lbc' ->> 'code_postal' = '49308') AS publications_ouvertes_49308,
  (SELECT count(*) FROM public.cross_post_jobs j
    WHERE j.user_id = p.id AND j.platform = 'leboncoin' AND j.status IN ('pending', 'processing', 'needs_user')
      AND j.platform_fields -> 'lbc_commune_meme_cp' ->> 'code_postal_servi' = '49300') AS publications_servies_49300,
  to_regclass('public._backup_1311_98b72757_ville_publication') IS NOT NULL AS sauvegarde_presente
FROM public.profiles p
WHERE p.id = '98b72757-6cd6-4aaf-88f2-39533c71cbae';
