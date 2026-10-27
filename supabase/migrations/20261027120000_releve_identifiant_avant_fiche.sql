-- ═══════════════════════════════════════════════════════════════════════════
-- 20261027120000_releve_identifiant_avant_fiche   (EN ATTENTE du feu vert NOMMÉ de Nico)
-- (27/10, rapport docs/enquetes/doublons-identifiant-2710/RAPPORT.md)
-- LE RELEVÉ NE CRÉE JAMAIS UNE FICHE POUR UNE ANNONCE QU'UN DÉPÔT FILLSELL DU COMPTE PORTE DÉJÀ.
-- Cas : Nico/Depop (nvlsonchatnoir-roman-en-tres-bon-etat-30fa, dépôt publié 6eef55a8 → fiche neuve 1793089261133 à
-- l'« Importer » de la personne, 20 s après le relevé) ; XEWER/Leboncoin (3295236977, dépôt VENDU 3b92d5ca → fiche neuve
-- 1792999747010 par le moteur, vente comptée deux fois) ; Johan/Beebs (34209247, dépôt VENDU a385636d → rattachée par la
-- photo à une autre fiche, 1792909660810).
-- Cause : depuis le moteur v3 (6d6e012, 07/10) le relevé ne passe plus par rapprocher_traiter_annonce, qui rattachait
-- par l'identifiant d'un dépôt publié OU clos (25/09) ; le correctif du 09/10 (70a1bfe, rattacherParIdentifiant) ne lit
-- que les dépôts PUBLIÉS, et seulement avant la passe du moteur. Les deux portes d'écriture n'ont jamais lu
-- l'identifiant : rapprocher_importer (seule porte d'une fiche « releve_* » : moteur, personne, rattrapages) et
-- rapprochement_attacher (rattachement par la photo).
--  · annonce_rattacher_par_identifiant (neuve) : la règle, à l'entrée des deux portes.
--  · fiche_releve_doublon_resorber (neuve) : la même règle après coup, pour une fiche née d'un relevé ET intacte ;
--    sinon la raison rendue, à signaler. Jamais rien sur une plateforme, aucun quota, aucun mail.
--  · rapprocher_importer, rapprochement_attacher : la règle d'abord ; le reste inchangé.
-- Corps de base relus en prod (pg_get_functiondef) le 27/10 : rapprocher_importer md5 7ee42d633089f6fa130363e0b8d94311,
-- rapprochement_attacher md5 4240ed2bc1680e7f7cd2f9b37db524e1. Droits {postgres, service_role} reposés tels quels.
-- Application : npx supabase db query --linked -f supabase/migrations/20261027120000_releve_identifiant_avant_fiche.sql
--               npx supabase migration repair --linked --status applied 20261027120000
-- Puis : scripts/reparations/20261027_doublons_identifiant.sql (sauvegarde, inverse).
-- Essai à blanc (ROLLBACK) : scripts/essais/20261027120000_essai.sql (bash scripts/essais/20261027120000_generer.sh)
-- Inverse : supabase/rollbacks/20261027120000_releve_identifiant_avant_fiche_INVERSE.sql
-- ═══════════════════════════════════════════════════════════════════════════
BEGIN;
SET LOCAL lock_timeout = '5s';

-- ── 1. LA RÈGLE : annonce_rattacher_par_identifiant ────────────────────────────────────────────────────────────
-- Une annonce relevée, sans article, dont l'identifiant est celui d'un dépôt FillSell de CE compte sur CETTE
-- plateforme (un job publish/republish publié, vendu ou annulé, non détaché, qui la désigne — numéro ou lien,
-- listing_designe ; le DÉPÔT FillSell passe avant un job de suivi né d'un relevé, puis le publié, puis le plus récent)
-- rejoint la fiche de ce dépôt (absorbée → celle qui l'a gardée) :
--   · dépôt publié : l'annonce prend CE job (aucun job neuf) ;
--   · dépôt vendu ou annulé, fiche en stock : un job de suivi (règle du 25/09, rapprocher_traiter_annonce) ;
--   · dépôt vendu ou annulé, fiche vendue : l'annonce prend le dépôt clos, aucun job neuf — rien n'est retiré,
--     redéposé ni marqué vendu (pas de « vendu, encore en ligne » armé ici).
-- Jamais un titre ni une photo : l'identifiant seul. Une annonce que la PERSONNE a détachée de cette fiche n'y
-- revient jamais par cette règle. Vinted exclu (son identité est vinted_item_id). Rend NULL sans correspondance.
CREATE OR REPLACE FUNCTION public.annonce_rattacher_par_identifiant(p_annonce uuid, p_par text DEFAULT 'releve')
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  a annonces_plateforme%ROWTYPE;
  f inventaire%ROWTYPE;
  dep record; v_bande text; v_depot uuid; v_job uuid; v_inv bigint; n integer := 0;
BEGIN
  SELECT * INTO a FROM annonces_plateforme WHERE id = p_annonce FOR UPDATE;
  IF a.id IS NULL OR a.inventaire_id IS NOT NULL OR a.ignoree_le IS NOT NULL OR a.platform = 'vinted' THEN RETURN NULL; END IF;
  IF length(btrim(COALESCE(a.listing_id, ''))) < 4 THEN RETURN NULL; END IF;
  SELECT j.id, j.inventaire_id, j.status INTO dep FROM cross_post_jobs j
   WHERE j.user_id = a.user_id AND j.platform = a.platform AND j.action IN ('publish', 'republish')
     AND j.status IN ('published', 'sold', 'cancelled') AND j.inventaire_id IS NOT NULL
     AND NOT (COALESCE(j.platform_fields, '{}'::jsonb) ? 'detache_le')
     AND (btrim(j.platform_listing_id) = btrim(a.listing_id) OR position(btrim(a.listing_id) IN COALESCE(j.listing_url, '')) > 0)
     AND listing_designe(a.listing_id, j.listing_url, j.platform_listing_id)
   ORDER BY (COALESCE(j.platform_fields ->> 'source', '') <> 'releve') DESC, (j.status = 'published') DESC,
            COALESCE(j.published_at, j.created_at) DESC
   LIMIT 1;
  IF dep.id IS NULL THEN RETURN NULL; END IF;
  v_depot := dep.id; v_inv := dep.inventaire_id;
  v_bande := CASE WHEN dep.status = 'published' THEN 'job' ELSE 'job_clos' END;
  SELECT * INTO f FROM inventaire WHERE id = v_inv AND user_id = a.user_id;
  WHILE f.id IS NOT NULL AND f.fusionne_dans IS NOT NULL AND n < 5 LOOP
    SELECT * INTO f FROM inventaire WHERE id = f.fusionne_dans AND user_id = a.user_id;
    n := n + 1;
  END LOOP;
  IF f.id IS NULL OR f.fusionne_dans IS NOT NULL OR f.statut NOT IN ('stock', 'vendu') THEN RETURN NULL; END IF;
  IF EXISTS (SELECT 1 FROM rapprochements r WHERE r.annonce_id = a.id AND r.decision = 'detache' AND r.par = 'utilisateur'
                AND r.inventaire_id = f.id) THEN
    RETURN NULL;
  END IF;
  v_job := v_depot;
  IF v_bande = 'job_clos' AND f.statut = 'stock' THEN
    v_job := rapprocher_job_de_suivi(a.user_id, a.platform, f.id, a.titre, a.prix, a.url, a.listing_id, 'auto',
               jsonb_build_object('annonce_id', a.id, 'motif', 'identifiant_depot_clos', 'depot_clos', v_depot, 'run_id', a.run_id));
  END IF;
  UPDATE annonces_plateforme SET inventaire_id = f.id, job_id = v_job, source_rapprochement = 'job', proposition = NULL, updated_at = now()
   WHERE id = a.id AND inventaire_id IS NULL;
  INSERT INTO rapprochements (user_id, annonce_id, inventaire_id, decision, par, score, detail)
  VALUES (a.user_id, a.id, f.id, 'attache', 'job', 1,
          jsonb_build_object('run_id', a.run_id, 'job_id', v_job, 'depot', v_depot, 'voie', p_par, 'statut_fiche', f.statut,
                             'motif', CASE WHEN v_bande = 'job' THEN 'identifiant_avant_fiche' ELSE 'identifiant_depot_clos_avant_fiche' END));
  RETURN jsonb_build_object('ok', true, 'decision', 'attache', 'par_identifiant', true, 'inventaire_id', f.id, 'job_id', v_job,
                            'depot', v_depot, 'bande', v_bande);
END;
$function$;
REVOKE ALL ON FUNCTION public.annonce_rattacher_par_identifiant(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.annonce_rattacher_par_identifiant(uuid, text) TO service_role;

-- ── 1 bis. LA MÊME RÈGLE APRÈS COUP : fiche_releve_doublon_resorber ───────────────────────────────────────────
-- Une annonce DÉJÀ posée sur une fiche née d'un relevé (origine releve_*) alors qu'un dépôt FillSell du compte (job
-- publish/republish publié, vendu ou annulé, jamais un job de suivi d'un relevé) la désigne sur une AUTRE fiche :
-- le job de suivi de la fiche née du relevé est clos (détaché), l'annonce rejoint la fiche du dépôt PAR LA RÈGLE
-- ci-dessus, et la fiche née du relevé est absorbée (fusionne_dans → la fiche du dépôt, journal inventaire_fusions) :
-- elle quitte le stock, rien n'est touché sur aucune plateforme. Seulement une fiche INTACTE — en stock, une pièce,
-- aucune vente, aucune autre annonce vivante, aucun job hors relevé ni en cours, aucun prix d'achat, rien saisi par la
-- personne (les gardes de rapprochement_v3_fiche_intacte ; un prix posé À LA NAISSANCE par l'import de la personne
-- n'est pas une saisie) ; sinon rien n'est écrit et la raison est rendue — à signaler.
CREATE OR REPLACE FUNCTION public.fiche_releve_doublon_resorber(p_annonce uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  a annonces_plateforme%ROWTYPE;
  d inventaire%ROWTYPE;
  dep record; v_r jsonb; v_jobs jsonb; v_intacte boolean;
BEGIN
  SELECT * INTO a FROM annonces_plateforme WHERE id = p_annonce FOR UPDATE;
  IF a.id IS NULL OR a.inventaire_id IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'annonce_sans_fiche'); END IF;
  SELECT * INTO d FROM inventaire WHERE id = a.inventaire_id FOR UPDATE;
  SELECT j.id, j.inventaire_id, j.status INTO dep FROM cross_post_jobs j
    JOIN inventaire fj ON fj.id = j.inventaire_id AND fj.user_id = a.user_id
   WHERE j.user_id = a.user_id AND j.platform = a.platform AND j.action IN ('publish', 'republish')
     AND j.status IN ('published', 'sold', 'cancelled') AND j.inventaire_id <> d.id
     AND NOT (COALESCE(j.platform_fields, '{}'::jsonb) ? 'detache_le')
     AND COALESCE(j.platform_fields ->> 'source', '') <> 'releve'
     AND listing_designe(a.listing_id, j.listing_url, j.platform_listing_id)
   ORDER BY (j.status = 'published') DESC, COALESCE(j.published_at, j.created_at) DESC LIMIT 1;
  IF dep.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'aucun_depot_ailleurs'); END IF;
  IF d.origine IS NULL OR d.origine NOT LIKE 'releve\_%' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'a_signaler', 'motif', 'fiche_pas_nee_du_releve', 'fiche', d.id,
                              'depot', dep.id, 'depot_statut', dep.status, 'fiche_depot', dep.inventaire_id,
                              'source_annonce', a.source_rapprochement);
  END IF;
  v_intacte := d.statut = 'stock' AND d.fusionne_dans IS NULL AND COALESCE(d.quantite, 1) <= 1
    AND d.prix_achat IS NULL AND NOT COALESCE(d.prix_achat_inconnu, false)
    AND (d.prix_vente_change_par IS DISTINCT FROM 'app' OR d.prix_vente_change_le = d.created_at)
    AND (d.poids_change_par IS DISTINCT FROM 'app' OR d.poids_change_le = d.created_at)
    AND NOT EXISTS (SELECT 1 FROM ventes v WHERE v.inventaire_id = d.id)
    AND NOT EXISTS (SELECT 1 FROM cross_post_jobs j WHERE j.inventaire_id = d.id
                      AND (COALESCE(j.platform_fields ->> 'source', '') <> 'releve' OR j.status IN ('pending', 'processing', 'needs_user')))
    AND NOT EXISTS (SELECT 1 FROM fiches_annonce fa WHERE fa.inventaire_id = d.id)
    AND NOT EXISTS (SELECT 1 FROM push_ventes pv WHERE pv.inventaire_id = d.id)
    AND NOT EXISTS (SELECT 1 FROM remises_en_vente rv WHERE rv.inventaire_id = d.id)
    AND NOT EXISTS (SELECT 1 FROM jsonb_each(CASE WHEN jsonb_typeof(d.attributs) = 'object' THEN d.attributs ELSE '{}'::jsonb END) e
                     WHERE jsonb_typeof(e.value) = 'object' AND e.value ->> 'source' = 'manuel')
    AND NOT EXISTS (SELECT 1 FROM annonces_plateforme x WHERE x.inventaire_id = d.id AND x.id <> a.id AND x.disparu_le IS NULL);
  IF NOT v_intacte THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'a_signaler', 'motif', 'fiche_pas_intacte', 'fiche', d.id, 'statut', d.statut,
      'ventes', (SELECT count(*) FROM ventes v WHERE v.inventaire_id = d.id),
      'autres_annonces', (SELECT count(*) FROM annonces_plateforme x WHERE x.inventaire_id = d.id AND x.id <> a.id AND x.disparu_le IS NULL),
      'jobs_hors_releve', (SELECT count(*) FROM cross_post_jobs j WHERE j.inventaire_id = d.id AND COALESCE(j.platform_fields ->> 'source', '') <> 'releve'),
      'depot', dep.id, 'depot_statut', dep.status, 'fiche_depot', dep.inventaire_id);
  END IF;
  -- Le job de suivi de la fiche née du relevé : clos et détaché, sans geste sur la plateforme.
  SELECT jsonb_agg(j.id) INTO v_jobs FROM cross_post_jobs j
   WHERE j.inventaire_id = d.id AND j.platform = a.platform AND j.platform_fields ->> 'source' = 'releve'
     AND (j.id = a.job_id OR listing_designe(a.listing_id, j.listing_url, j.platform_listing_id));
  UPDATE cross_post_jobs SET status = 'cancelled',
         error = 'Doublon d''un dépôt FillSell (même annonce ' || a.listing_id || ') : l''annonce est suivie par la fiche de ce dépôt.',
         platform_fields = COALESCE(platform_fields, '{}'::jsonb) || jsonb_build_object('detache_le', now(), 'doublon_identifiant',
           jsonb_build_object('le', now(), 'annonce_id', a.id, 'depot', dep.id, 'fiche_depot', dep.inventaire_id))
   WHERE id IN (SELECT (x #>> '{}')::uuid FROM jsonb_array_elements(COALESCE(v_jobs, '[]'::jsonb)) x);
  UPDATE annonces_plateforme SET inventaire_id = NULL, job_id = NULL, source_rapprochement = NULL, updated_at = now() WHERE id = a.id;
  v_r := annonce_rattacher_par_identifiant(a.id, 'reparation');
  IF v_r IS NULL OR (v_r ->> 'inventaire_id')::bigint = d.id THEN
    RAISE EXCEPTION 'fiche_releve_doublon_resorber : l''annonce % n''a pas rejoint la fiche de son dépôt (%)', a.id, v_r;
  END IF;
  UPDATE inventaire SET fusionne_dans = (v_r ->> 'inventaire_id')::bigint, fusionne_le = now() WHERE id = d.id AND fusionne_dans IS NULL;
  INSERT INTO inventaire_fusions (user_id, garde, absorbe, deplacements, champs_repris, par)
  VALUES (a.user_id, (v_r ->> 'inventaire_id')::bigint, d.id,
          jsonb_build_object('annonces_plateforme', jsonb_build_array(a.id), 'jobs_clos', COALESCE(v_jobs, '[]'::jsonb)), '{}'::jsonb,
          'regle:identifiant_avant_fiche');
  RETURN jsonb_build_object('ok', true, 'absorbee', d.id, 'garde', (v_r ->> 'inventaire_id')::bigint, 'job_id', v_r ->> 'job_id',
                            'depot', dep.id, 'jobs_clos', COALESCE(v_jobs, '[]'::jsonb));
END;
$function$;
REVOKE ALL ON FUNCTION public.fiche_releve_doublon_resorber(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fiche_releve_doublon_resorber(uuid) TO service_role;

-- ── 2. rapprocher_importer : la seule porte d'une fiche « releve_* » lit l'identifiant d'abord ──────────────────
CREATE OR REPLACE FUNCTION public.rapprocher_importer(p_user uuid, p_annonce_id uuid, p_par text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  a annonces_plateforme%ROWTYPE;
  v_cap jsonb; v_photos jsonb; v_attr jsonb; v_cle text;
  v_new_inv bigint; v_job uuid; v_titre text; v_prix numeric;
  v_tn text; v_jumeau bigint; v_jumeau_titre text;
  v_homo bigint; v_homo_titre text; v_homo_statut text; v_homo_n integer;
  v_q_inv bigint; v_q_motif text; v_q_preuves jsonb; v_q_posee boolean := false;
  v_sans_question boolean := p_par IN ('utilisateur', 'rapprochement');
  v_ident jsonb;
BEGIN
  SELECT * INTO a FROM annonces_plateforme WHERE id = p_annonce_id AND user_id = p_user FOR UPDATE;
  IF a.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'annonce_introuvable'); END IF;
  IF a.inventaire_id IS NOT NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'deja_rattachee'); END IF;
  -- (22/10, XEWER) Opla quittée : une annonce Opla ne devient jamais une fiche de stock (2 fiches revenues le
  -- 21/10 à 21:28, dont un article vendu la veille).
  IF a.platform = 'opla' AND opla_sortie_passee() THEN RETURN jsonb_build_object('ok', false, 'reason', 'opla_sortie'); END IF;
  IF releve_run_hors_liste(a.run_id) THEN RETURN jsonb_build_object('ok', false, 'reason', 'hors_liste'); END IF;
  -- (27/10, Nico/Depop, XEWER/Leboncoin) L'IDENTIFIANT D'ABORD : une annonce qu'un dépôt FillSell de CE compte, sur
  -- CETTE plateforme, désigne déjà (publié, vendu ou annulé) rejoint la fiche de ce dépôt — jamais une fiche neuve,
  -- quelle que soit la voie (le moteur, la personne, un rattrapage). Rendu tel quel : { ok, decision 'attache',
  -- inventaire_id, job_id } ; rapprochement_v3_fiche_de et la personne lisent l'article qu'il nomme.
  v_ident := annonce_rattacher_par_identifiant(a.id, p_par);
  IF v_ident IS NOT NULL THEN RETURN v_ident; END IF;
  v_titre := COALESCE(NULLIF(trim(a.titre), ''), 'Annonce ' || a.platform);
  v_prix := a.prix;
  v_tn := titre_norm(NULLIF(trim(a.titre), ''));

  -- La garde des homonymes et du jumeau (20/09, 26/09, 27/09) : seulement hors
  -- des deux voies qui ont DÉJÀ tranché (la personne, le moteur du compte).
  IF NOT v_sans_question AND COALESCE(v_tn, '') <> ''
     AND COALESCE(array_length(titre_jetons(a.titre), 1), 0) > 0 THEN
    SELECT i.id, i.titre, i.statut, count(*) OVER ()
      INTO v_homo, v_homo_titre, v_homo_statut, v_homo_n
      FROM inventaire i
     WHERE i.user_id = p_user AND i.fusionne_dans IS NULL AND i.statut IN ('stock', 'vendu')
       AND (titre_norm(i.titre) = v_tn OR titre_jetons(i.titre) = titre_jetons(a.titre))
     ORDER BY (i.statut = 'stock') DESC, (titre_norm(i.titre) = v_tn) DESC, i.created_at ASC
     LIMIT 1;
    IF v_homo IS NOT NULL THEN
      v_q_inv := v_homo;
      v_q_motif := CASE WHEN v_homo_statut = 'vendu' THEN 'homonyme_vendu' ELSE 'homonyme_en_stock' END;
      v_q_preuves := jsonb_build_object('titre_annonce', v_titre, 'titre_article', v_homo_titre,
                                        'statut_fiche', v_homo_statut, 'homonymes', v_homo_n,
                                        'signaux', jsonb_build_object('exact', titre_norm(v_homo_titre) = v_tn));
    END IF;
  END IF;
  IF v_q_inv IS NULL AND NOT v_sans_question AND a.proposition IS NOT NULL
     AND NULLIF(a.proposition ->> 'inventaire_id', '') IS NOT NULL THEN
    v_q_inv := (a.proposition ->> 'inventaire_id')::bigint;
    v_q_motif := COALESCE(NULLIF(a.proposition ->> 'motif', ''), 'proposition');
    v_q_preuves := jsonb_build_object('titre_annonce', v_titre, 'proposition', a.proposition,
                                      'signaux', jsonb_build_object(
                                        'ov', a.proposition -> 'signaux' -> 'recouvrement',
                                        'prix', CASE WHEN a.proposition -> 'signaux' ->> 'prix' = 'exact' THEN 'egal' END));
  END IF;
  IF v_q_inv IS NULL AND NOT v_sans_question AND length(COALESCE(v_tn, '')) > 12 THEN
    SELECT i.id, i.titre INTO v_jumeau, v_jumeau_titre
      FROM inventaire i
     WHERE i.user_id = p_user
       AND i.statut = 'stock'
       AND i.disparu_le IS NULL
       AND i.fusionne_dans IS NULL
       AND length(titre_norm(i.titre)) > 12
       AND NOT titres_variantes_incompatibles(a.titre, i.titre)
       AND (' ' || v_tn || ' ' LIKE '% ' || titre_norm(i.titre) || ' %'
            OR ' ' || titre_norm(i.titre) || ' ' LIKE '% ' || v_tn || ' %')
     ORDER BY (titre_norm(i.titre) = v_tn) DESC, i.created_at ASC
     LIMIT 1;
    IF v_jumeau IS NOT NULL THEN
      v_q_inv := v_jumeau; v_q_motif := 'titre_inclus';
      v_q_preuves := jsonb_build_object('titre_annonce', v_titre, 'titre_article', v_jumeau_titre,
                                        'signaux', jsonb_build_object('ov', 0.8));
    END IF;
  END IF;

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
  -- (08/10, complément) la seule porte d'une fiche « releve_* » : la garde de la
  -- base (inventaire_releve_par_decision) refuse toute autre écriture.
  PERFORM set_config('fillsell.import_releve', 'on', true);
  INSERT INTO inventaire (id, user_id, titre, prix_vente, statut, plateforme, origine, quantite, photos, attributs,
                          description, marque, first_seen_at, last_synced_at, photos_a_rapatrier)
  VALUES (v_new_inv, p_user, v_titre, v_prix, 'stock', a.platform, 'releve_' || a.platform, 1,
          v_photos, v_attr,
          NULLIF(trim(v_cap ->> 'description'), ''), NULLIF(trim(v_cap ->> 'marque'), ''), now(), now(),
          v_photos IS NOT NULL);
  PERFORM set_config('fillsell.import_releve', '', true);
  v_job := rapprocher_job_de_suivi(p_user, a.platform, v_new_inv, v_titre, v_prix, a.url, a.listing_id, p_par,
                                   jsonb_build_object('annonce_id', a.id, 'import', true));
  UPDATE annonces_plateforme
     SET inventaire_id = v_new_inv, job_id = v_job,
         source_rapprochement = CASE WHEN p_par = 'utilisateur' THEN 'manuel' ELSE 'automatique' END,
         proposition = NULL, ignoree_le = NULL, fiche_supprimee_le = NULL, updated_at = now()
   WHERE id = a.id;
  IF v_q_inv IS NOT NULL THEN
    v_q_posee := releve_poser_question(p_user, v_q_inv, v_new_inv, v_q_motif,
                   COALESCE(v_q_preuves, '{}'::jsonb) || jsonb_build_object('annonce_id', a.id, 'platform', a.platform,
                                                                         'listing_id', a.listing_id, 'url', a.url, 'prix', a.prix));
  END IF;
  INSERT INTO rapprochements (user_id, annonce_id, inventaire_id, decision, par, score, detail)
  VALUES (p_user, a.id, v_new_inv, 'import', CASE WHEN p_par = 'rapprochement' THEN 'auto' ELSE p_par END, 1, jsonb_build_object('job_id', v_job, 'voie', p_par)
          || CASE WHEN p_par = 'rapprochement' THEN jsonb_build_object('regle', 'rapprochement_v3') ELSE '{}'::jsonb END
          || CASE WHEN v_q_inv IS NOT NULL
                  THEN jsonb_build_object('question', jsonb_build_object('inventaire_id', v_q_inv, 'motif', v_q_motif, 'posee', v_q_posee))
                  ELSE '{}'::jsonb END);
  RETURN jsonb_build_object('ok', true, 'decision', 'import', 'inventaire_id', v_new_inv, 'job_id', v_job)
         || CASE WHEN v_q_inv IS NOT NULL
                 THEN jsonb_build_object('question', jsonb_build_object('inventaire_id', v_q_inv, 'motif', v_q_motif, 'posee', v_q_posee))
                 ELSE '{}'::jsonb END;
END;
$function$;
REVOKE ALL ON FUNCTION public.rapprocher_importer(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rapprocher_importer(uuid, uuid, text) TO service_role;

-- ── 3. rapprochement_attacher : le rattachement automatique (photo) lit l'identifiant d'abord ─────────────────
CREATE OR REPLACE FUNCTION public.rapprochement_attacher(p_annonce uuid, p_inv bigint, p_motif text, p_detail jsonb DEFAULT '{}'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE a annonces_plateforme%ROWTYPE; v_job uuid; v_ident jsonb;
BEGIN
  SELECT * INTO a FROM annonces_plateforme WHERE id = p_annonce FOR UPDATE;
  IF a.id IS NULL OR a.inventaire_id IS NOT NULL OR a.ignoree_le IS NOT NULL THEN RETURN NULL; END IF;
  IF a.platform = 'opla' AND opla_sortie_passee() THEN RETURN NULL; END IF;   -- (22/10) Opla quittée : jamais un job Opla neuf
  -- (27/10, Johan/Beebs) L'IDENTIFIANT FAIT FOI, AVANT LA PHOTO : une annonce qu'un dépôt FillSell du compte désigne
  -- rejoint la fiche de ce dépôt. Même fiche que le moteur → son job ; une AUTRE fiche → rien n'est rattaché ici
  -- (NULL : le moteur compte un refus), l'annonce est déjà chez la fiche de son dépôt.
  v_ident := annonce_rattacher_par_identifiant(a.id, 'moteur');
  IF v_ident IS NOT NULL THEN
    RETURN CASE WHEN (v_ident ->> 'inventaire_id')::bigint = p_inv THEN NULLIF(v_ident ->> 'job_id', '')::uuid END;
  END IF;
  v_job := rapprocher_job_de_suivi(a.user_id, a.platform, p_inv, a.titre, a.prix, a.url, a.listing_id, 'auto',
             jsonb_build_object('annonce_id', a.id, 'motif', p_motif, 'run_id', a.run_id) || COALESCE(p_detail, '{}'::jsonb));
  UPDATE annonces_plateforme SET inventaire_id = p_inv, job_id = v_job, source_rapprochement = 'automatique',
                                 proposition = NULL, updated_at = now()
   WHERE id = a.id;
  INSERT INTO rapprochements (user_id, annonce_id, inventaire_id, decision, par, score, detail)
  VALUES (a.user_id, a.id, p_inv, 'attache', 'auto', 1,
          jsonb_build_object('run_id', a.run_id, 'job_id', v_job, 'motif', p_motif, 'regle', 'rattachement_avant_stock') || COALESCE(p_detail, '{}'::jsonb));
  RETURN v_job;
END;
$function$;
REVOKE ALL ON FUNCTION public.rapprochement_attacher(uuid, bigint, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rapprochement_attacher(uuid, bigint, text, jsonb) TO service_role;
COMMIT;
