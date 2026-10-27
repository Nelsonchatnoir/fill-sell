-- Essai à blanc de 20261027120000_releve_identifiant_avant_fiche + réparation 20261027 : ROLLBACK. Généré par 20261027120000_generer.sh.
begin;
set local statement_timeout = '120s';
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
-- (27/10) Réparation : les fiches nées d'un relevé pour une annonce qu'un dépôt FillSell du compte portait déjà
-- (rapport docs/enquetes/doublons-identifiant-2710/RAPPORT.md). Rien n'est réparé « à la main » : la RÈGLE
-- (fiche_releve_doublon_resorber, migration 20261027120000) passe sur chaque annonce du parc dont l'identifiant est
-- porté par un dépôt FillSell (publié, vendu ou annulé, hors jobs de suivi d'un relevé) d'une AUTRE fiche vivante.
-- Relu le 27/10 sur tout le parc : 4 annonces —
--   · Nico, Depop nvlsonchatnoir-roman-en-tres-bon-etat-30fa : fiche 1793089261133 née du relevé, intacte → résorbée
--     (l'annonce rejoint 1793009407689006 et son dépôt 6eef55a8 ; le job de suivi dc8dca7a est clos) ;
--   · XEWER, Leboncoin 3295236977 : fiche 1792999747010 VENDUE avec une vente (315890) → à signaler, rien écrit ;
--   · Johan, Beebs 34209247 : fiche 1792909660810 créée par Johan (4 dépôts) → à signaler, rien écrit ;
--   · afeef3c7, Leboncoin 3265366309 : rattachée par la PERSONNE le 18/09 à une fiche Vinted (dépôt annulé ailleurs) → à signaler, rien écrit.
-- Gardes : la migration appliquée ; sauvegarde protégée avant ; la règle refuse toute fiche qui n'est pas née d'un relevé
-- ou pas intacte (vente, autre annonce, job hors relevé ou en cours, saisie de la personne). Aucun geste sur une
-- plateforme, aucune vente touchée, aucun quota, aucun mail.
-- Inverse : scripts/reparations/20261027_doublons_identifiant_INVERSE.sql (depuis la sauvegarde).
SET LOCAL statement_timeout = '60s';
SET LOCAL lock_timeout = '5s';

CREATE TABLE public._backup_2710_doublons_paires AS
  SELECT DISTINCT ON (a.id) now() AS sauvegarde_le, a.id AS annonce_id, a.user_id, a.platform, a.listing_id,
         a.inventaire_id AS fiche_annonce, a.job_id AS job_annonce, a.source_rapprochement, j.id AS depot, j.inventaire_id AS fiche_depot
    FROM public.annonces_plateforme a
    JOIN public.cross_post_jobs j ON j.user_id = a.user_id AND j.platform = a.platform AND j.action IN ('publish', 'republish')
         AND btrim(j.platform_listing_id) = a.listing_id AND j.inventaire_id IS NOT NULL AND j.inventaire_id <> a.inventaire_id
         AND NOT (COALESCE(j.platform_fields, '{}'::jsonb) ? 'detache_le')
         AND COALESCE(j.platform_fields ->> 'source', '') <> 'releve'
    JOIN public.inventaire fa ON fa.id = a.inventaire_id AND fa.fusionne_dans IS NULL
    JOIN public.inventaire fj ON fj.id = j.inventaire_id AND fj.fusionne_dans IS NULL
   WHERE a.inventaire_id IS NOT NULL AND a.platform <> 'vinted'
   ORDER BY a.id, (j.status = 'published') DESC, j.created_at DESC;
CREATE TABLE public._backup_2710_doublons_fiches AS
  SELECT now() AS sauvegarde_le, i.* FROM public.inventaire i
   WHERE i.id IN (SELECT fiche_annonce FROM public._backup_2710_doublons_paires);
CREATE TABLE public._backup_2710_doublons_jobs AS
  SELECT now() AS sauvegarde_le, c.* FROM public.cross_post_jobs c
   WHERE c.inventaire_id IN (SELECT fiche_annonce FROM public._backup_2710_doublons_paires);
CREATE TABLE public._backup_2710_doublons_annonces AS
  SELECT now() AS sauvegarde_le, a.* FROM public.annonces_plateforme a
   WHERE a.id IN (SELECT annonce_id FROM public._backup_2710_doublons_paires);
ALTER TABLE public._backup_2710_doublons_paires ENABLE ROW LEVEL SECURITY;
ALTER TABLE public._backup_2710_doublons_fiches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public._backup_2710_doublons_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public._backup_2710_doublons_annonces ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_2710_doublons_paires, public._backup_2710_doublons_fiches, public._backup_2710_doublons_jobs,
              public._backup_2710_doublons_annonces FROM PUBLIC, anon, authenticated;
CREATE TABLE public._resultat_2710_doublons (annonce_id uuid, resultat jsonb, le timestamptz DEFAULT now());
ALTER TABLE public._resultat_2710_doublons ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._resultat_2710_doublons FROM PUBLIC, anon, authenticated;

DO $$
DECLARE r record; v jsonb; m integer; n_ok integer := 0; n_sig integer := 0;
BEGIN
  IF to_regprocedure('public.fiche_releve_doublon_resorber(uuid)') IS NULL THEN
    RAISE EXCEPTION 'migration 20261027120000 non appliquée : la règle fiche_releve_doublon_resorber est absente';
  END IF;
  SELECT count(*) INTO m FROM public._backup_2710_doublons_paires;
  IF m < 1 OR m > 20 OR NOT EXISTS (SELECT 1 FROM public._backup_2710_doublons_paires WHERE annonce_id = 'cae643f0-a8cc-4236-a4c0-b0f946baa7d9') THEN
    RAISE EXCEPTION 'paires : 1 à 20 attendues avec l''annonce Depop de Nico, % lues', m;
  END IF;
  FOR r IN SELECT annonce_id FROM public._backup_2710_doublons_paires ORDER BY annonce_id LOOP
    v := public.fiche_releve_doublon_resorber(r.annonce_id);
    INSERT INTO public._resultat_2710_doublons (annonce_id, resultat) VALUES (r.annonce_id, v);
    IF (v ->> 'ok')::boolean THEN n_ok := n_ok + 1; ELSE n_sig := n_sig + 1; END IF;
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM public.annonces_plateforme WHERE id = 'cae643f0-a8cc-4236-a4c0-b0f946baa7d9'
                    AND inventaire_id = 1793009407689006 AND job_id = '6eef55a8-adb9-46e8-870b-4ab0e45b34af')
     OR NOT EXISTS (SELECT 1 FROM public.inventaire WHERE id = 1793089261133 AND fusionne_dans = 1793009407689006) THEN
    RAISE EXCEPTION 'la fiche Depop de Nico (1793089261133) n''a pas été résorbée par la règle';
  END IF;
  RAISE NOTICE 'réparation 27/10 : % fiche(s) résorbée(s) par la règle, % à signaler', n_ok, n_sig;
END $$;
-- Tests de 20261027120000_releve_identifiant_avant_fiche + réparation 20261027 (assemblés par 20261027120000_generer.sh,
-- ROLLBACK). Sur les vraies lignes du 27/10 ; les annonces d'essai portent des numéros 39999999xx inexistants.
create temp table _r (essai text, ok boolean, detail text);
grant all on _r to public;
do $$
declare
  v_nico uuid := 'f44b5917-bccc-4431-ba41-f40571a2ed18';
  v_nico_ann uuid := 'cae643f0-a8cc-4236-a4c0-b0f946baa7d9';
  v_nico_fiche bigint := 1793009407689006; v_nico_dbl bigint := 1793089261133;
  v_nico_depot uuid := '6eef55a8-adb9-46e8-870b-4ab0e45b34af'; v_nico_suivi uuid := 'dc8dca7a-f7a9-4990-9f60-aa145fdcd82f';
  v_xewer uuid := 'de63ca45-63d9-4a3c-b65a-d1345acd8b2e';
  v_xe_ann uuid := '881172df-2306-4a92-b959-631516deb340'; v_xe_fiche bigint := 1792945124235; v_xe_dbl bigint := 1792999747010;
  v_xe_depot uuid := '3b92d5ca-a96a-4d53-929a-727cb3226080';
  v_johan uuid := '7b9d8a71-6464-457f-abdc-9baee2a8543f';
  v_jo_ann uuid := '15bfc328-23b0-46c5-b7cc-4aa14733462e'; v_jo_fiche bigint := 1792585627450; v_jo_autre bigint := 1792909660810;
  v_jo_depot uuid := 'a385636d-f7a8-4423-bd67-89bd36c82a33';
  j record; r jsonb; n integer; n2 integer; v_id uuid; v_job record; v_inv_avant integer; v_jobs_avant integer;
begin
  -- C. Corps et droits.
  insert into _r values ('C1 droits : la règle et la résorption {postgres, service_role} ; les deux portes inchangées',
    (select proacl::text from pg_proc where oid = 'public.annonce_rattacher_par_identifiant(uuid,text)'::regprocedure) = '{postgres=X/postgres,service_role=X/postgres}'
    and (select proacl::text from pg_proc where oid = 'public.fiche_releve_doublon_resorber(uuid)'::regprocedure) = '{postgres=X/postgres,service_role=X/postgres}'
    and (select proacl::text from pg_proc where oid = 'public.rapprocher_importer(uuid,uuid,text)'::regprocedure) = '{postgres=X/postgres,service_role=X/postgres}'
    and (select proacl::text from pg_proc where oid = 'public.rapprochement_attacher(uuid,bigint,text,jsonb)'::regprocedure) = '{postgres=X/postgres,service_role=X/postgres}', null);

  -- R. La réparation (jouée au-dessus) : Nico résorbé, XEWER et Johan signalés, rien touché chez eux.
  select inventaire_id, job_id, source_rapprochement into j from public.annonces_plateforme where id = v_nico_ann;
  insert into _r values ('R1 Nico : l''annonce Depop rejoint la fiche d''origine et SON dépôt',
    j.inventaire_id = v_nico_fiche and j.job_id = v_nico_depot and j.source_rapprochement = 'job', j::text);
  insert into _r values ('R2 Nico : la fiche en double est absorbée (quitte le stock), journal inventaire_fusions',
    (select fusionne_dans from public.inventaire where id = v_nico_dbl) = v_nico_fiche
    and exists (select 1 from public.inventaire_fusions where absorbe = v_nico_dbl and garde = v_nico_fiche and par = 'regle:identifiant_avant_fiche'), null);
  insert into _r values ('R3 Nico : le job de suivi en double est clos, le dépôt intact (publié, même lien)',
    (select status from public.cross_post_jobs where id = v_nico_suivi) = 'cancelled'
    and (select platform_fields ? 'doublon_identifiant' from public.cross_post_jobs where id = v_nico_suivi)
    and (select status || '|' || listing_url from public.cross_post_jobs where id = v_nico_depot) = 'published|https://www.depop.com/products/nvlsonchatnoir-roman-en-tres-bon-etat-30fa/', null);
  insert into _r values ('R4 XEWER : à signaler (fiche vendue, une vente), rien écrit',
    (select resultat ->> 'motif' from public._resultat_2710_doublons where annonce_id = v_xe_ann) = 'fiche_pas_intacte'
    and (select (resultat ->> 'ventes')::int from public._resultat_2710_doublons where annonce_id = v_xe_ann) = 1
    and (select inventaire_id from public.annonces_plateforme where id = v_xe_ann) = v_xe_dbl
    and (select fusionne_dans from public.inventaire where id = v_xe_dbl) is null,
    (select resultat::text from public._resultat_2710_doublons where annonce_id = v_xe_ann));
  insert into _r values ('R5 Johan : à signaler (fiche créée par la personne), rien écrit',
    (select resultat ->> 'motif' from public._resultat_2710_doublons where annonce_id = v_jo_ann) = 'fiche_pas_nee_du_releve'
    and (select inventaire_id from public.annonces_plateforme where id = v_jo_ann) = v_jo_autre, null);
  select count(*), count(*) filter (where (resultat ->> 'ok')::boolean) into n, n2 from public._resultat_2710_doublons;
  insert into _r values ('R6 parc : 4 paires, 1 résorbée, 3 à signaler', n = 4 and n2 = 1, n || ' / ' || n2);

  select count(*) into v_inv_avant from public.inventaire where user_id in (v_nico, v_xewer, v_johan);
  select count(*) into v_jobs_avant from public.cross_post_jobs where user_id in (v_nico, v_xewer, v_johan);

  -- I1. Le geste de Nico rejoué : « Importer » sur l'annonce de son propre dépôt → la fiche d'origine, jamais une neuve.
  update public.annonces_plateforme set inventaire_id = null, job_id = null, source_rapprochement = null where id = v_nico_ann;
  r := public.rapprocher_importer(v_nico, v_nico_ann, 'utilisateur');
  insert into _r values ('I1 personne, dépôt PUBLIÉ : rattachée à 1793009407689006 et à son dépôt, aucune fiche neuve',
    (r ->> 'decision') = 'attache' and (r ->> 'inventaire_id')::bigint = v_nico_fiche and (r ->> 'job_id')::uuid = v_nico_depot
    and (select inventaire_id from public.annonces_plateforme where id = v_nico_ann) = v_nico_fiche, r::text);

  -- I2. XEWER rejoué : le moteur importe l'annonce d'un dépôt VENDU → la fiche vendue, son dépôt ; rien retiré.
  update public.annonces_plateforme set inventaire_id = null, job_id = null, source_rapprochement = null where id = v_xe_ann;
  r := public.rapprocher_importer(v_xewer, v_xe_ann, 'rapprochement');
  insert into _r values ('I2 moteur, dépôt VENDU : rattachée à la fiche vendue et à son dépôt, aucun job neuf',
    (r ->> 'decision') = 'attache' and (r ->> 'inventaire_id')::bigint = v_xe_fiche and (r ->> 'job_id')::uuid = v_xe_depot
    and (select status from public.cross_post_jobs where id = v_xe_depot) = 'sold', r::text);

  -- I3. Johan rejoué : le moteur rattache par la photo à une AUTRE fiche → l'identifiant l'emporte.
  update public.annonces_plateforme set inventaire_id = null, job_id = null, source_rapprochement = null where id = v_jo_ann;
  v_id := public.rapprochement_attacher(v_jo_ann, v_jo_autre, 'photo_identique', '{}'::jsonb);
  insert into _r values ('I3 photo vers une autre fiche : refusée (NULL), l''annonce rejoint la fiche de son dépôt',
    v_id is null and (select inventaire_id from public.annonces_plateforme where id = v_jo_ann) = v_jo_fiche
    and (select job_id from public.annonces_plateforme where id = v_jo_ann) = v_jo_depot, coalesce(v_id::text, 'null'));

  -- I4. Le moteur vers la MÊME fiche que le dépôt : il reçoit le job du dépôt, pas un job de suivi.
  update public.annonces_plateforme set inventaire_id = null, job_id = null, source_rapprochement = null where id = v_nico_ann;
  v_id := public.rapprochement_attacher(v_nico_ann, v_nico_fiche, 'photo_identique', '{}'::jsonb);
  insert into _r values ('I4 photo vers la fiche du dépôt : le job du dépôt', v_id = v_nico_depot, coalesce(v_id::text, 'null'));

  insert into _r values ('I5 aucune fiche ni aucun job créés par I1-I4',
    (select count(*) from public.inventaire where user_id in (v_nico, v_xewer, v_johan)) = v_inv_avant
    and (select count(*) from public.cross_post_jobs where user_id in (v_nico, v_xewer, v_johan)) = v_jobs_avant, null);

  -- I6. Sans dépôt qui la porte : l'import d'avant, inchangé (fiche neuve).
  insert into public.annonces_plateforme (user_id, platform, listing_id, url, titre, statut_plateforme, vu_le)
  values (v_nico, 'depop', 'essai-2710-sans-depot-3999999995', 'https://www.depop.com/products/essai-2710-sans-depot-3999999995/', 'Essai 27/10', 'en_ligne', now())
  returning id into v_id;
  r := public.rapprocher_importer(v_nico, v_id, 'utilisateur');
  insert into _r values ('I6 sans dépôt : fiche neuve comme avant (aucune régression)',
    (r ->> 'decision') = 'import' and exists (select 1 from public.inventaire where id = (r ->> 'inventaire_id')::bigint and origine = 'releve_depop'), r::text);

  -- I7. Dépôt ANNULÉ sur une fiche EN STOCK : un job de suivi (règle du 25/09).
  select c.id, c.user_id, c.platform, c.platform_listing_id, c.inventaire_id into v_job
    from public.cross_post_jobs c join public.inventaire i on i.id = c.inventaire_id and i.statut = 'stock' and i.fusionne_dans is null
   where c.platform = 'leboncoin' and c.action = 'publish' and c.status = 'cancelled' and c.platform_listing_id ~ '^[0-9]{9,}$'
     and not (coalesce(c.platform_fields, '{}'::jsonb) ? 'detache_le') and coalesce(c.platform_fields ->> 'source', '') <> 'releve'
     and not exists (select 1 from public.annonces_plateforme a where a.user_id = c.user_id and a.platform = 'leboncoin' and a.listing_id = c.platform_listing_id)
     and not exists (select 1 from public.cross_post_jobs p where p.user_id = c.user_id and p.platform = 'leboncoin' and p.status = 'published'
                      and btrim(p.platform_listing_id) = c.platform_listing_id)
   order by c.created_at desc limit 1;
  insert into public.annonces_plateforme (user_id, platform, listing_id, url, titre, statut_plateforme, vu_le)
  values (v_job.user_id, 'leboncoin', v_job.platform_listing_id, 'https://www.leboncoin.fr/ad/essai/' || v_job.platform_listing_id, 'Essai 27/10', 'en_ligne', now())
  returning id into v_id;
  r := public.rapprocher_importer(v_job.user_id, v_id, 'rapprochement');
  insert into _r values ('I7 dépôt annulé, fiche en stock : rattachée avec un job de suivi publié',
    (r ->> 'decision') = 'attache' and (r ->> 'inventaire_id')::bigint = v_job.inventaire_id and (r ->> 'job_id')::uuid <> v_job.id
    and (select status || '|' || (platform_fields ->> 'source') from public.cross_post_jobs where id = (r ->> 'job_id')::uuid) = 'published|releve', r::text);

  -- I8. Une annonce que la PERSONNE a détachée de la fiche du dépôt n'y revient pas par la règle.
  update public.annonces_plateforme set inventaire_id = null, job_id = null, source_rapprochement = null where id = v_nico_ann;
  insert into public.rapprochements (user_id, annonce_id, inventaire_id, decision, par, detail)
  values (v_nico, v_nico_ann, v_nico_fiche, 'detache', 'utilisateur', '{"essai": "2710"}'::jsonb);
  r := public.annonce_rattacher_par_identifiant(v_nico_ann, 'essai');
  insert into _r values ('I8 détachée par la personne : la règle s''abstient', r is null, coalesce(r::text, 'null'));
end $$;
-- P. Coût : la règle sur le plus gros compte (en jobs), sans correspondance, 20 fois.
do $$
declare v_user uuid; v_n bigint; v_id uuid; t0 timestamptz; v_ms numeric; r jsonb;
begin
  select user_id, count(*) into v_user, v_n from public.cross_post_jobs group by 1 order by 2 desc limit 1;
  insert into public.annonces_plateforme (user_id, platform, listing_id, url, titre, statut_plateforme, vu_le)
  values (v_user, 'leboncoin', '3999999996', 'https://www.leboncoin.fr/ad/essai/3999999996', 'Essai 27/10', 'en_ligne', now())
  returning id into v_id;
  t0 := clock_timestamp();
  for i in 1..20 loop r := public.annonce_rattacher_par_identifiant(v_id, 'essai'); end loop;
  v_ms := extract(epoch from clock_timestamp() - t0) * 1000 / 20;
  insert into _r values ('P1 la règle sur le plus gros compte < 20 ms par annonce', r is null and v_ms < 20, v_n || ' jobs, ' || round(v_ms, 2) || ' ms par appel');
end $$;
do $$
begin
  insert into _r values ('M1 aucun retrait armé, aucun dépôt, aucune vente écrite',
    (select count(*) from public.cross_post_jobs where created_at >= now() and action in ('delete', 'republish')) = 0
    and (select count(*) from public.cross_post_jobs where created_at >= now() and coalesce(platform_fields ->> 'source', '') <> 'releve') = 0
    and (select count(*) from public.ventes where created_at >= now()) = 0, null);
  insert into _r values ('M2 aucun mail', (select count(*) from public.email_logs where sent_at >= now()) = 0, null);
end $$;
select essai, ok, detail from _r order by essai;
select count(*) filter (where ok) || '/' || count(*) as verts from _r;
rollback;
