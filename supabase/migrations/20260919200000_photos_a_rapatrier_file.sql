-- ═══════════════════════════════════════════════════════════════════════════
-- Photos des articles importés : une FILE, posée à l'import (19/09/2026)
--
-- Ce qui précède. Le 19/09, le rapatriement des photos d'un article importé
-- était un BALAYAGE : handler-watch relisait à chaque cycle tous les articles
-- d'origine `releve_*` et regardait, un par un, si leurs photos étaient encore
-- chez la plateforme. Deux défauts, tous deux nommés avant d'être corrigés :
--   · une FENÊTRE DE 3 MINUTES entre l'import et la réparation — publier
--     pendant cette fenêtre partait avec des URL que la page de dépôt ne sait
--     pas lire (cdn.beebs.app ne sert aucun en-tête CORS) ;
--   · un PLAFOND DE 500 lignes sans ORDER BY côté balayage : au-delà de 500
--     articles importés dans le parc, les lignes 501+ n'auraient jamais été
--     vues, sans la moindre erreur nulle part — une famine silencieuse.
--
-- Ce que fait cette migration. L'import POSE LUI-MÊME le drapeau. Le balayage
-- n'a donc plus rien à chercher : il lit une file.
--
-- ⛔ AUCUNE FICHE EXISTANTE N'EST RÉÉCRITE (consigne Nico) : pas de backfill,
--    la colonne naît à `false` partout. Les articles déjà importés finissent
--    par le chemin actuel, qui reste en place et devient le filet.
--
-- ⛔ LE DRAPEAU NE DIT PAS « cette photo est étrangère », il dit « cette fiche
--    n'a pas encore été EXAMINÉE ». C'est volontaire : la liste des hôtes de
--    plateformes vit dans _shared/photos-rapatriement.ts et NULLE PART
--    AILLEURS. La recopier ici en SQL, c'est reproduire exactement la
--    divergence qu'on vient de payer (le filet connaissait Vinted, le rehost
--    aussi, et personne ne connaissait Beebs). Le serveur pose une question,
--    le TypeScript seul y répond.
--
-- Coût : un booléen sur inventaire (ADD COLUMN avec DEFAULT = métadonnée
-- seule depuis PG 11, pas de réécriture des 65 000 lignes) et un index
-- PARTIEL qui ne contient que les fiches en attente — donc vide au repos.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.inventaire
  ADD COLUMN IF NOT EXISTS photos_a_rapatrier boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.inventaire.photos_a_rapatrier IS
  'File de rapatriement des photos (19/09/2026) : posé à TRUE par rapprocher_importer, '
  'remis à FALSE par handler-watch après examen. Ne signifie pas « photo étrangère » mais '
  '« fiche pas encore examinée » — la liste des hôtes vit dans _shared/photos-rapatriement.ts.';

-- Index PARTIEL : il ne porte que les fiches en attente. Au repos il est vide,
-- et la file se lit sans jamais parcourir inventaire.
CREATE INDEX IF NOT EXISTS inventaire_photos_a_rapatrier_idx
  ON public.inventaire (id)
  WHERE photos_a_rapatrier;

-- ── rapprocher_importer : le SEUL point d'écriture d'un article importé ─────
-- Vérifié en prod le 19/09 : deux fonctions seulement contiennent un
-- « INSERT INTO inventaire » — celle-ci et inventaire_fusionner (la fusion,
-- qui ne crée pas d'import). rapprochement_decider appelle ce geste et n'a
-- plus d'insert à elle. Poser le drapeau ICI le pose donc pour les DEUX
-- appelants, manuel et automatique.
--
-- Repris à l'identique de 20260918106000_import_auto_sans_candidat.sql, avec
-- pour seule différence la colonne photos_a_rapatrier dans l'INSERT.
CREATE OR REPLACE FUNCTION public.rapprocher_importer(p_user uuid, p_annonce_id uuid, p_par text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  a annonces_plateforme%ROWTYPE;
  v_cap jsonb; v_photos jsonb; v_attr jsonb; v_cle text;
  v_new_inv bigint; v_job uuid; v_titre text; v_prix numeric;
BEGIN
  SELECT * INTO a FROM annonces_plateforme WHERE id = p_annonce_id AND user_id = p_user FOR UPDATE;
  IF a.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'annonce_introuvable'); END IF;
  IF a.inventaire_id IS NOT NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'deja_rattachee'); END IF;
  v_titre := COALESCE(NULLIF(trim(a.titre), ''), 'Annonce ' || a.platform);
  v_prix := a.prix;
  -- inventaire.id n'a pas de DEFAULT (convention du front : horodatage ms).
  v_new_inv := (extract(epoch FROM clock_timestamp()) * 1000)::bigint;
  WHILE EXISTS (SELECT 1 FROM inventaire WHERE id = v_new_inv) LOOP v_new_inv := v_new_inv + 1; END LOOP;
  v_cap := a.capture;
  v_photos := CASE
    WHEN jsonb_typeof(v_cap -> 'photos') = 'array' AND jsonb_array_length(v_cap -> 'photos') > 0 THEN v_cap -> 'photos'
    WHEN a.photo_url IS NOT NULL THEN jsonb_build_array(a.photo_url)
    ELSE NULL END;
  v_attr := '{}'::jsonb;
  FOR v_cle IN SELECT unnest(ARRAY['taille', 'etat', 'couleur', 'matiere', 'marque']) LOOP
    IF NULLIF(trim(v_cap ->> v_cle), '') IS NOT NULL THEN
      v_attr := v_attr || jsonb_build_object(v_cle, jsonb_build_object('v', trim(v_cap ->> v_cle), 'source', 'releve_' || a.platform, 'at', now()));
    END IF;
  END LOOP;
  INSERT INTO inventaire (id, user_id, titre, prix_vente, statut, plateforme, origine, quantite, photos, attributs,
                          description, marque, first_seen_at, last_synced_at, photos_a_rapatrier)
  VALUES (v_new_inv, p_user, v_titre, v_prix, 'stock', a.platform, 'releve_' || a.platform, 1,
          v_photos, v_attr,
          NULLIF(trim(v_cap ->> 'description'), ''), NULLIF(trim(v_cap ->> 'marque'), ''), now(), now(),
          -- La fiche entre dans la file dès qu'elle a une photo, quelle qu'en
          -- soit l'adresse : c'est handler-watch qui sait ce qui est à nous.
          v_photos IS NOT NULL);
  v_job := rapprocher_job_de_suivi(p_user, a.platform, v_new_inv, v_titre, v_prix, a.url, a.listing_id, p_par,
                                   jsonb_build_object('annonce_id', a.id, 'import', true));
  UPDATE annonces_plateforme
     SET inventaire_id = v_new_inv, job_id = v_job,
         source_rapprochement = CASE WHEN p_par = 'utilisateur' THEN 'manuel' ELSE 'automatique' END,
         proposition = NULL, ignoree_le = NULL, updated_at = now()
   WHERE id = a.id;
  INSERT INTO rapprochements (user_id, annonce_id, inventaire_id, decision, par, score, detail)
  VALUES (p_user, a.id, v_new_inv, 'import', p_par, 1, jsonb_build_object('job_id', v_job));
  RETURN jsonb_build_object('ok', true, 'decision', 'import', 'inventaire_id', v_new_inv, 'job_id', v_job);
END;
$$;
REVOKE ALL ON FUNCTION public.rapprocher_importer(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rapprocher_importer(uuid, uuid, text) TO service_role;
