-- ════════════════════════════════════════════════════════════════════════════
-- FICHE CRÉÉE À LA MAIN FACE À UNE FICHE VINTED (08/10/2026 soir, décision de Nico)
-- ════════════════════════════════════════════════════════════════════════════
-- « Même règle que pour les imports » :
--   · photo ET titre concordants, sans concurrent → fusion automatique ;
--   · un doute (photo proche seulement, titre ou taille contradictoires,
--     plusieurs candidats) → « à vérifier », hors du stock ;
--   · jamais la photo seule, jamais le titre seul ;
--   · les décisions de la personne restent définitives.
-- Fiche à la main = article créé dans l'app (origine vide, aucune annonce
-- Vinted connue) ; fiche Vinted = article qui porte une annonce Vinted (dressing
-- de l'extension ou dépôt FillSell). Le moteur v3 (_shared/rapprochement/
-- fiches-main.js, sous-graphe des seules fiches : les décisions des annonces ne
-- bougent pas) tranche ; la base garde ses gardes :
--   0. PRÉALABLE (défaut trouvé par la preuve en transaction annulée) : la garde
--      de boutique inventaire_ecarte_import_sync refusait toute fusion qui fait
--      passer l'identité Vinted à la fiche gardée (inventaire_fusionner_pour
--      vide d'abord vinted_account_id de la fiche fondue → « boutique non
--      confirmée ») : 0 fusion de ce genre depuis le 28/09, à la main comme par
--      le moteur. Une fiche qui LÂCHE son annonce Vinted (vinted_item_id vidé)
--      passe désormais ; tout import reste gardé comme avant ;
--   1. rapprochement_v3_fiches_fusionnables : la fiche de la personne est GARDÉE
--      (titre, prix, prix d'achat, photos), la fiche Vinted s'y fond
--      (inventaire_fusionner_pour : ce qui manque est repris, l'identité Vinted
--      suit l'objet, journalisé, réversible) seulement si les deux sont en
--      stock, d'un exemplaire, sans publication en vol, la fiche Vinted non
--      touchée par la personne, jamais deux annonces d'une même plateforme ;
--      sinon la question. Une paire que la personne a tranchée (réponse, fusion
--      défaite) : plus rien, jamais ;
--   2. rapprochement_v3_appliquer : « fusionner_fiche » et « fiche_a_verifier » ;
--      un doute pose « Est-ce le même article ? » (gardée = la fiche de la
--      personne) et sort la fiche Vinted du stock (rapprochement_v3_marquer,
--      seulement si personne ne l'a touchée) — jamais la fiche de la personne ;
--   3. rapprochement_v3_lire : les fiches à la main nées depuis la dernière
--      passe (fiches_main_a_juger, 200 par passe) ; les fiches du dressing
--      nouvelles sont jugées aussi dans un compte qui a des fiches à la main ;
--   4. rapprochement_fin_run : la fin d'un relevé réveille la passe quand il y a
--      de ces fiches à juger.
-- Point de départ de la passe normale : 08/10 00:00 UTC. Le stock d'avant :
-- rattrapage par scripts/reparations/20261008_fiches_main_vinted.mjs, sur
-- décision de Nico, seulement si le rejeu à blanc montre zéro fusion à tort.
-- Inverse : supabase/rollbacks/20261008150000_fiche_a_la_main_face_a_vinted_INVERSE.sql
BEGIN;

-- 0. La garde de boutique laisse une fiche lâcher son annonce Vinted (fusion).
CREATE OR REPLACE FUNCTION public.inventaire_ecarte_import_sync()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_motif text;
begin
  -- Ne concerne QUE les lignes ecrites par la sync dressing.
  -- La saisie manuelle (origine NULL) n'est JAMAIS touchee : 1 074 articles
  -- manuels sans photo chez 239 comptes, c'est du stock legitime.
  if coalesce(new.origine,'') <> 'vinted_sync' then
    return new;
  end if;

  -- (08/10 soir) Une fiche du dressing qui LÂCHE son annonce Vinted n'importe
  -- rien : c'est la fusion qui fait passer l'identité Vinted à la fiche gardée
  -- (inventaire_fusionner_pour vide d'abord vinted_item_id ET vinted_account_id
  -- de la fiche fondue). Cette garde y voyait une boutique non confirmée et
  -- refusait la fusion : plus AUCUNE fusion déplaçant l'identité Vinted n'a
  -- abouti depuis le 28/09 (208 le 25/09, 0 depuis), à la main comme par le
  -- moteur. Seule cette écriture-là passe ; tout le reste est inchangé.
  if TG_OP = 'UPDATE' and new.vinted_item_id is null then
    return new;
  end if;

  -- Le contrôle précède aussi l'upsert : une ligne historique étrangère
  -- n'autorise pas un nouveau relevé. Lecture du profil par sa clé primaire.
  if not boutique_vinted_confirmee(new.user_id,new.vinted_account_id) then
    raise exception '[boutique_a_confirmer] Cette boutique Vinted n’est pas confirmée sur ton compte FillSell. Confirme-la dans « Actualiser mon dressing » si elle t’appartient. Aucun article n’a été importé.';
  end if;
  if TG_OP='UPDATE' then return new; end if;

  -- INSERT PUR UNIQUEMENT (28/08, resserrage).
  -- En PostgreSQL un BEFORE INSERT tire AVANT la resolution du ON CONFLICT :
  -- un RETURN NULL annulerait aussi le DO UPDATE de l'upsert de la sync, et
  -- figerait la ligne existante (vues, favoris, prix, statut) pour toujours.
  -- Si l'article existe deja, on laisse passer : la derive draft/hidden se
  -- traite a l'affichage, pas en gelant la donnee.
  if exists (
    select 1 from inventaire i
    where i.user_id = new.user_id
      and i.vinted_item_id is not distinct from new.vinted_item_id
  ) then
    return new;
  end if;

  -- (05/10, règle de Nico) Un relevé AUTOMATIQUE du dressing (veille, retrait)
  -- n'importe rien : l'article neuf attend le prochain « Synchroniser ».
  if exists (
    select 1 from vinted_sync_runs r
    where r.user_id = new.user_id and r.kind = 'dressing' and r.status = 'running'
      and not releve_est_geste(r.declencheur)
  ) then
    raise log 'inventaire_ecarte_import_sync : article % non importé (relevé automatique en cours, user %)', new.vinted_item_id, new.user_id;
    return null;
  end if;

  if new.vinted_status = 'draft' then
    v_motif := 'brouillon';
  elsif new.photos is null
     or jsonb_typeof(new.photos) <> 'array'
     or jsonb_array_length(new.photos) = 0 then
    v_motif := 'sans_photo';
  else
    return new;
  end if;

  insert into sync_import_ecartes (user_id, vinted_item_id, vinted_status, titre, motif)
  values (new.user_id, new.vinted_item_id, new.vinted_status, left(coalesce(new.titre,''),120), v_motif);

  return null;
end;
$function$;

ALTER TABLE public.rapprochement_comptes ADD COLUMN IF NOT EXISTS fiches_main_juge_le timestamptz;
COMMENT ON COLUMN public.rapprochement_comptes.fiches_main_juge_le IS
  'Fiches créées à la main jugées par la passe v3 contre les fiches Vinted jusqu''à cette date de création (08/10 soir).';

CREATE OR REPLACE FUNCTION public.rapprochement_v3_fiches_main_depuis(p_user uuid)
 RETURNS timestamptz
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT COALESCE((SELECT c.fiches_main_juge_le FROM rapprochement_comptes c WHERE c.user_id = p_user),
                  timestamptz '2026-10-08 00:00:00+00');
$function$;
REVOKE ALL ON FUNCTION public.rapprochement_v3_fiches_main_depuis(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rapprochement_v3_fiches_main_depuis(uuid) TO service_role;

-- NULL = la fiche Vinted peut se fondre dans la fiche de la personne ; sinon la
-- raison (les quatre premières : rien ; les autres : la question).
CREATE OR REPLACE FUNCTION public.rapprochement_v3_fiches_fusionnables(p_user uuid, p_main bigint, p_vinted bigint)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE h inventaire%ROWTYPE; v inventaire%ROWTYPE;
BEGIN
  SELECT * INTO h FROM inventaire WHERE id = p_main AND user_id = p_user;
  SELECT * INTO v FROM inventaire WHERE id = p_vinted AND user_id = p_user;
  IF h.id IS NULL OR v.id IS NULL OR h.id = v.id OR h.fusionne_dans IS NOT NULL OR v.fusionne_dans IS NOT NULL THEN
    RETURN 'introuvable';
  END IF;
  -- une décision de la personne sur la paire est définitive (réponse, fusion défaite)
  IF EXISTS (SELECT 1 FROM inventaire_doublons q WHERE q.user_id = p_user AND q.decide_par = 'utilisateur'
               AND least(q.garde, q.absorbe) = least(h.id, v.id) AND greatest(q.garde, q.absorbe) = greatest(h.id, v.id))
     OR EXISTS (SELECT 1 FROM inventaire_fusions f WHERE f.user_id = p_user AND f.defait_le IS NOT NULL
                  AND least(f.garde, f.absorbe) = least(h.id, v.id) AND greatest(f.garde, f.absorbe) = greatest(h.id, v.id)) THEN
    RETURN 'paire_tranchee';
  END IF;
  -- la fiche de la personne : créée à la main, sans annonce Vinted
  IF h.vinted_item_id IS NOT NULL OR COALESCE(h.origine, '') = 'vinted_sync' OR COALESCE(h.origine, '') LIKE 'releve\_%' THEN
    RETURN 'main_pas_a_la_main';
  END IF;
  -- la fiche Vinted : une annonce Vinted
  IF v.vinted_item_id IS NULL AND COALESCE(v.origine, '') <> 'vinted_sync' THEN RETURN 'vinted_sans_annonce'; END IF;
  -- un article vendu ou retiré n'est ni fondu ni questionné
  IF h.statut IS DISTINCT FROM 'stock' THEN RETURN 'main_pas_en_stock'; END IF;
  IF v.statut IS DISTINCT FROM 'stock' THEN RETURN 'vinted_pas_en_stock'; END IF;
  IF v.disparu_le IS NOT NULL THEN RETURN 'vinted_disparue'; END IF;
  -- ce qui demande la personne : la question, jamais la fusion
  IF COALESCE(h.quantite, 1) > 1 OR COALESCE(v.quantite, 1) > 1 THEN RETURN 'quantite'; END IF;
  IF EXISTS (SELECT 1 FROM cross_post_jobs j WHERE j.user_id = p_user AND j.inventaire_id IN (h.id, v.id)
               AND j.status IN ('pending', 'processing', 'needs_user')) THEN
    RETURN 'job_en_vol';
  END IF;
  IF v.prix_achat IS NOT NULL OR COALESCE(v.prix_achat_inconnu, false)
     OR v.prix_vente_change_par = 'app' OR v.poids_change_par = 'app'
     OR EXISTS (SELECT 1 FROM ventes x WHERE x.inventaire_id = v.id)
     OR EXISTS (SELECT 1 FROM fiches_annonce fa WHERE fa.inventaire_id = v.id)
     OR EXISTS (SELECT 1 FROM push_ventes pv WHERE pv.inventaire_id = v.id)
     OR EXISTS (SELECT 1 FROM remises_en_vente rv WHERE rv.inventaire_id = v.id)
     OR EXISTS (SELECT 1 FROM jsonb_each(CASE WHEN jsonb_typeof(v.attributs) = 'object' THEN v.attributs ELSE '{}'::jsonb END) e
                 WHERE jsonb_typeof(e.value) = 'object' AND e.value ->> 'source' = 'manuel') THEN
    RETURN 'vinted_touchee';
  END IF;
  -- jamais deux annonces vivantes d'une même plateforme sur un article
  IF EXISTS (SELECT 1 FROM annonces_plateforme x JOIN annonces_plateforme y ON y.platform = x.platform
              WHERE x.inventaire_id = h.id AND y.inventaire_id = v.id AND x.disparu_le IS NULL AND y.disparu_le IS NULL) THEN
    RETURN 'deux_exemplaires';
  END IF;
  RETURN NULL;
END;
$function$;
REVOKE ALL ON FUNCTION public.rapprochement_v3_fiches_fusionnables(uuid, bigint, bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rapprochement_v3_fiches_fusionnables(uuid, bigint, bigint) TO service_role;

CREATE OR REPLACE FUNCTION public.rapprochement_v3_lire(p_user uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
 SET statement_timeout TO '90s'
AS $function$
DECLARE v_fiches jsonb; v_annonces jsonb; v_fusions jsonb; v_doublons jsonb;
        v_depuis timestamptz := rapprochement_v3_vinted_depuis(p_user); v_vinted jsonb; v_vinted_max timestamptz; v_vinted_reste boolean;
        v_main_depuis timestamptz := rapprochement_v3_fiches_main_depuis(p_user); v_main jsonb := '[]'::jsonb; v_main_max timestamptz; v_main_reste boolean := false;
BEGIN
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', i.id::text, 'titre', i.titre, 'prix', i.prix_vente, 'statut', i.statut, 'origine', i.origine,
      'marque', COALESCE(NULLIF(trim(i.marque), ''), CASE WHEN jsonb_typeof(i.attributs -> 'marque') = 'object' THEN i.attributs -> 'marque' ->> 'v' ELSE i.attributs ->> 'marque' END),
      'taille', CASE WHEN jsonb_typeof(i.attributs -> 'taille') = 'object' THEN i.attributs -> 'taille' ->> 'v' ELSE i.attributs ->> 'taille' END,
      'photos', COALESCE((SELECT jsonb_agg(z.u ORDER BY z.o) FROM (
                  SELECT CASE WHEN jsonb_typeof(e) = 'string' THEN e #>> '{}' WHEN jsonb_typeof(e) = 'object' THEN COALESCE(e ->> 'url', e ->> 'original') END u, o
                    FROM jsonb_array_elements(CASE WHEN jsonb_typeof(i.photos) = 'array' THEN i.photos ELSE '[]'::jsonb END) WITH ORDINALITY x(e, o)
                   LIMIT 6) z WHERE z.u ~ '^https://'), '[]'::jsonb),
      'a_verifier', i.a_verifier IS NOT NULL,
      'a_verifier_auto', i.a_verifier IS NOT NULL AND COALESCE(i.a_verifier ->> 'source', '') IN ('moteur', 'rattrapage_0710', 'rapprochement_v3'),
      'created_at', i.created_at, 'quantite', COALESCE(i.quantite, 1), 'vinted_item_id', i.vinted_item_id
    )), '[]'::jsonb)
    INTO v_fiches
    FROM inventaire i
   WHERE i.user_id = p_user AND i.fusionne_dans IS NULL AND i.statut IN ('stock', 'vendu');

  WITH runs AS (
    SELECT r.id, releve_run_hors_liste(r.id) hors_liste, releve_est_geste(r.declencheur) geste,
           (r.platform = 'ebay' AND releve_ebay_run_bloque(r.id)) ebay_bloque
      FROM vinted_sync_runs r
     WHERE r.id IN (SELECT DISTINCT a.run_id FROM annonces_plateforme a WHERE a.user_id = p_user AND a.disparu_le IS NULL AND a.run_id IS NOT NULL)
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', a.id, 'platform', a.platform, 'listing_id', a.listing_id, 'url', a.url, 'titre', a.titre, 'prix', a.prix,
      'photo_url', a.photo_url,
      'photos', (
        -- les photos de la fiche rapatriée (notre stockage) quand il y en a, sinon la
        -- capture (Leboncoin : la grande image, jamais la vignette), sinon la couverture
        SELECT COALESCE(
          (SELECT jsonb_agg(z.u ORDER BY z.o) FROM (
             SELECT CASE WHEN jsonb_typeof(e) = 'string' THEN e #>> '{}' WHEN jsonb_typeof(e) = 'object' THEN COALESCE(e ->> 'url', e ->> 'original') END u, o
               FROM inventaire i2, jsonb_array_elements(CASE WHEN jsonb_typeof(i2.photos) = 'array' THEN i2.photos ELSE '[]'::jsonb END) WITH ORDINALITY x(e, o)
              WHERE i2.id = a.inventaire_id AND i2.origine = 'releve_' || a.platform
                AND (i2.photos -> 0) #>> '{}' LIKE '%/storage/v1/object/public/listing-photos/%'
              LIMIT 6) z WHERE z.u ~ '^https://'),
          (SELECT jsonb_agg(regexp_replace(z.u, 'rule=ad-(thumb|small|medium)', 'rule=ad-large') ORDER BY z.o) FROM (
             SELECT e #>> '{}' u, o FROM jsonb_array_elements(CASE WHEN jsonb_typeof(a.capture -> 'photos') = 'array' THEN a.capture -> 'photos' ELSE '[]'::jsonb END) WITH ORDINALITY x(e, o)
              WHERE jsonb_typeof(e) = 'string' LIMIT 6) z WHERE z.u ~ '^https://'),
          CASE WHEN a.photo_url ~ '^https://' THEN jsonb_build_array(regexp_replace(a.photo_url, 'rule=ad-(thumb|small|medium)', 'rule=ad-large')) ELSE '[]'::jsonb END)),
      'taille', a.capture ->> 'taille', 'marque', a.capture ->> 'marque',
      'inventaire_id', a.inventaire_id::text,
      'ignoree', a.ignoree_le IS NOT NULL,
      'ignoree_par_utilisateur', a.ignoree_le IS NOT NULL AND EXISTS (SELECT 1 FROM rapprochements r WHERE r.annonce_id = a.id AND r.decision = 'ignore' AND r.par = 'utilisateur'),
      'proposition_motif', a.proposition ->> 'motif',
      'source', a.source_rapprochement, 'run_id', a.run_id,
      'en_ligne', a.statut_plateforme = 'en_ligne' AND a.fiche_supprimee_le IS NULL,
      'hors_liste', COALESCE(ru.hors_liste, false), 'ebay_bloque', COALESCE(ru.ebay_bloque, false), 'geste', COALESCE(ru.geste, false),
      'derniere_par', d.par, 'derniere_decision', d.decision, 'derniere_motif', d.motif
    )), '[]'::jsonb)
    INTO v_annonces
    FROM annonces_plateforme a
    LEFT JOIN runs ru ON ru.id = a.run_id
    LEFT JOIN LATERAL (SELECT r.par, r.decision, r.detail ->> 'motif' motif FROM rapprochements r
                        WHERE r.annonce_id = a.id AND r.decision IN ('attache', 'import', 'ignore')
                        ORDER BY r.created_at DESC LIMIT 1) d ON true
   WHERE a.user_id = p_user AND a.disparu_le IS NULL AND a.platform IN ('leboncoin', 'beebs', 'ebay', 'opla')
     AND NOT (a.url IS NOT NULL AND annonce_lien_notification(a.url));

  SELECT COALESCE(jsonb_agg(jsonb_build_object('garde', f.garde::text, 'absorbe', f.absorbe::text, 'par', f.par, 'defaite', f.defait_le IS NOT NULL)), '[]'::jsonb)
    INTO v_fusions FROM inventaire_fusions f WHERE f.user_id = p_user;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', d.id, 'garde', d.garde::text, 'absorbe', d.absorbe::text, 'statut', d.statut, 'motif', d.motif,
                                                 'decide_par', d.decide_par, 'source', d.source,
                                                 'auto', d.decide_par IS NULL AND COALESCE(d.source, '') = 'releve' AND d.motif IS DISTINCT FROM 'copie_non_prouvee')), '[]'::jsonb)
    INTO v_doublons FROM inventaire_doublons d WHERE d.user_id = p_user AND d.statut IN ('proposee', 'refusee', 'fusionnee');

  -- (08/10, complément) les fiches du dressing Vinted nées depuis la dernière
  -- passe : jugées contre les imports déjà au stock (rien à juger sans import).
  -- 200 par passe au plus (une fonction edge n'a que 2 s de CPU) : la date de la
  -- 200e, et toutes celles de la même date (un lot du dressing partage la sienne) ;
  -- la suite part à la passe d'après (vinted_reste).
  SELECT max(x.created_at) INTO v_vinted_max FROM (
    SELECT i.created_at FROM inventaire i
     WHERE i.user_id = p_user AND i.origine = 'vinted_sync' AND i.created_at > v_depuis
     ORDER BY i.created_at LIMIT 200) x;
  v_vinted_reste := v_vinted_max IS NOT NULL AND EXISTS (
    SELECT 1 FROM inventaire i WHERE i.user_id = p_user AND i.origine = 'vinted_sync' AND i.created_at > v_vinted_max);
  SELECT COALESCE(jsonb_agg(i.id::text ORDER BY i.created_at), '[]'::jsonb) INTO v_vinted FROM inventaire i
   WHERE i.user_id = p_user AND i.origine = 'vinted_sync' AND i.created_at > v_depuis AND i.created_at <= v_vinted_max
     AND i.fusionne_dans IS NULL AND i.statut IN ('stock', 'vendu')
     AND (EXISTS (SELECT 1 FROM inventaire r WHERE r.user_id = p_user AND r.origine LIKE 'releve\_%'
                   AND r.fusionne_dans IS NULL AND r.statut IN ('stock', 'vendu'))
          -- (08/10 soir) … ou contre les fiches créées à la main (règle de Nico)
          OR EXISTS (SELECT 1 FROM inventaire i WHERE i.user_id = p_user AND i.fusionne_dans IS NULL AND i.statut = 'stock'
                       AND i.vinted_item_id IS NULL AND COALESCE(i.origine, '') <> 'vinted_sync' AND COALESCE(i.origine, '') NOT LIKE 'releve\_%'));

  -- (08/10 soir) les fiches créées à la main nées depuis la dernière passe :
  -- jugées contre les fiches Vinted (rien à juger sans fiche Vinted). 200 par
  -- passe, la suite à la passe d'après (fiches_main_reste).
  IF EXISTS (SELECT 1 FROM inventaire v WHERE v.user_id = p_user AND v.fusionne_dans IS NULL AND v.statut = 'stock'
               AND (v.vinted_item_id IS NOT NULL OR v.origine = 'vinted_sync')) THEN
    SELECT max(x.created_at) INTO v_main_max FROM (
      SELECT i.created_at FROM inventaire i
       WHERE i.user_id = p_user AND i.vinted_item_id IS NULL AND COALESCE(i.origine, '') <> 'vinted_sync' AND COALESCE(i.origine, '') NOT LIKE 'releve\_%' AND i.created_at > v_main_depuis
       ORDER BY i.created_at LIMIT 200) x;
    v_main_reste := v_main_max IS NOT NULL AND EXISTS (
      SELECT 1 FROM inventaire i WHERE i.user_id = p_user AND i.vinted_item_id IS NULL AND COALESCE(i.origine, '') <> 'vinted_sync' AND COALESCE(i.origine, '') NOT LIKE 'releve\_%' AND i.created_at > v_main_max);
    SELECT COALESCE(jsonb_agg(i.id::text ORDER BY i.created_at), '[]'::jsonb) INTO v_main FROM inventaire i
     WHERE i.user_id = p_user AND i.vinted_item_id IS NULL AND COALESCE(i.origine, '') <> 'vinted_sync' AND COALESCE(i.origine, '') NOT LIKE 'releve\_%' AND i.created_at > v_main_depuis AND i.created_at <= v_main_max
       AND i.fusionne_dans IS NULL AND i.statut = 'stock';
  END IF;

  RETURN jsonb_build_object(
    'fiches_main_actif', true, 'fiches_main_a_juger', v_main, 'fiches_main_juge_jusqu_a', v_main_max,
    'fiches_main_depuis', v_main_depuis, 'fiches_main_reste', COALESCE(v_main_reste, false),
    'vinted_a_juger', v_vinted, 'vinted_juge_jusqu_a', v_vinted_max, 'vinted_depuis', v_depuis, 'vinted_reste', COALESCE(v_vinted_reste, false),
    'user_id', p_user, 'fiches', v_fiches, 'annonces', v_annonces, 'fusions', v_fusions, 'doublons', v_doublons,
    'dette_beebs', releve_dette_beebs(p_user),
    'import_ouvert', COALESCE((SELECT value FROM coin_config WHERE key = 'import_auto_ouvert'), 0) = 1,
    'geste_recent', EXISTS (SELECT 1 FROM vinted_sync_runs s WHERE s.user_id = p_user AND s.kind IN ('annonces', 'dressing')
                             AND releve_est_geste(s.declencheur) AND COALESCE(s.queued_at, s.started_at) > now() - interval '2 hours'),
    'lu_le', now());
END;
$function$;

CREATE OR REPLACE FUNCTION public.rapprochement_v3_appliquer(p_user uuid, p_decisions jsonb, p_mode text DEFAULT 'normal'::text, p_geste boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
 SET statement_timeout TO '120s'
AS $function$
DECLARE
  d jsonb; v_type text; a annonces_plateforme%ROWTYPE; f inventaire%ROWTYPE; g inventaire%ROWTYPE;
  v_fiche bigint; v_cand bigint; v_fa bigint; v_fb bigint; v_job uuid; v_r jsonb; v_posee boolean; v_motif text;
  v_ids uuid[]; v_id uuid; v_premiere uuid; v_n integer; v_ok boolean;
  n_faits jsonb := '{}'::jsonb; n_sautes jsonb := '{}'::jsonb; v_erreurs jsonb := '[]'::jsonb; v_journal jsonb := '[]'::jsonb;
  t0 timestamptz := clock_timestamp();
  v_par text := 'utilisateur:photo_rapprochement_v3';
BEGIN
  IF p_user IS NULL OR jsonb_typeof(p_decisions) <> 'array' THEN RETURN jsonb_build_object('ok', false, 'reason', 'parametres'); END IF;
  IF NOT pg_try_advisory_xact_lock(hashtext('rapprochement:' || p_user::text)) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'occupe');
  END IF;
  PERFORM set_config('fillsell.rapprochement_moteur', 'on', true);

  FOR d IN SELECT * FROM jsonb_array_elements(p_decisions) LOOP
    v_type := d ->> 'type';
    BEGIN
      -- ── ATTACHER : une annonce sans article rejoint l'article du groupe ──
      IF v_type = 'attacher' THEN
        SELECT * INTO a FROM annonces_plateforme WHERE id = (d ->> 'annonce')::uuid AND user_id = p_user FOR UPDATE;
        v_fiche := (d ->> 'fiche')::bigint;
        SELECT * INTO f FROM inventaire WHERE id = v_fiche AND user_id = p_user AND fusionne_dans IS NULL;
        IF a.id IS NULL OR f.id IS NULL THEN n_sautes := n_sautes || jsonb_build_object('attacher_introuvable', COALESCE((n_sautes ->> 'attacher_introuvable')::int, 0) + 1); CONTINUE; END IF;
        IF a.inventaire_id IS NOT NULL OR a.ignoree_le IS NOT NULL OR a.disparu_le IS NOT NULL THEN
          n_sautes := n_sautes || jsonb_build_object('attacher_deja_decidee', COALESCE((n_sautes ->> 'attacher_deja_decidee')::int, 0) + 1); CONTINUE;
        END IF;
        IF EXISTS (SELECT 1 FROM annonces_plateforme x WHERE x.inventaire_id = v_fiche AND x.platform = a.platform AND x.disparu_le IS NULL AND x.id <> a.id) THEN
          n_sautes := n_sautes || jsonb_build_object('attacher_deux_exemplaires', COALESCE((n_sautes ->> 'attacher_deux_exemplaires')::int, 0) + 1); CONTINUE;
        END IF;
        v_job := rapprochement_attacher(a.id, v_fiche, 'photo_identique', COALESCE(d -> 'preuve', '{}'::jsonb) || jsonb_build_object('regle', 'rapprochement_v3', 'mode', p_mode));
        IF v_job IS NULL THEN n_sautes := n_sautes || jsonb_build_object('attacher_refuse', COALESCE((n_sautes ->> 'attacher_refuse')::int, 0) + 1); CONTINUE; END IF;
        -- (07/10) Article VENDU : le suivi part « vendu, encore en ligne ».
        IF f.statut = 'vendu' THEN
          UPDATE cross_post_jobs
             SET status = 'cancelled',
                 platform_fields = COALESCE(platform_fields, '{}'::jsonb) || jsonb_build_object('pending_removal', true,
                                   'vendu_encore_en_ligne', jsonb_build_object('annonce_id', a.id, 'par', 'rapprochement_v3', 'at', now()))
           WHERE id = v_job AND user_id = p_user AND platform_fields ->> 'source' = 'releve';
        END IF;
        n_faits := n_faits || jsonb_build_object('attacher', COALESCE((n_faits ->> 'attacher')::int, 0) + 1);

      -- ── FUSIONNER (réparation) : l'article importé, intact, rejoint la base ──
      ELSIF v_type = 'fusionner' THEN
        -- (08/10, complément) hors réparation : seulement vers une fiche du dressing
        -- Vinted pas encore jugée (née depuis la dernière passe) ; les gardes
        -- ci-dessous valent pareil (article importé intact, sinon la question).
        IF p_mode <> 'reparation' AND NOT (
             d ->> 'portee' = 'vinted_nouvelle'
             AND EXISTS (SELECT 1 FROM inventaire v WHERE v.id = NULLIF(d ->> 'garde', '')::bigint AND v.user_id = p_user
                           AND v.origine = 'vinted_sync' AND v.created_at > rapprochement_v3_vinted_depuis(p_user))) THEN
          n_sautes := n_sautes || jsonb_build_object('fusionner_hors_reparation', COALESCE((n_sautes ->> 'fusionner_hors_reparation')::int, 0) + 1); CONTINUE;
        END IF;
        SELECT * INTO f FROM inventaire WHERE id = (d ->> 'absorbe')::bigint AND user_id = p_user FOR UPDATE;
        SELECT * INTO g FROM inventaire WHERE id = (d ->> 'garde')::bigint AND user_id = p_user FOR UPDATE;
        IF f.id IS NULL OR g.id IS NULL OR f.fusionne_dans IS NOT NULL OR g.fusionne_dans IS NOT NULL OR f.id = g.id THEN
          n_sautes := n_sautes || jsonb_build_object('fusionner_introuvable', COALESCE((n_sautes ->> 'fusionner_introuvable')::int, 0) + 1); CONTINUE;
        END IF;
        IF NOT (f.origine LIKE 'releve\_%') OR NOT rapprochement_v3_fiche_intacte(f.id) OR g.statut = 'vendu' THEN
          -- Un article que la personne a touché : la question, pas la fusion.
          v_posee := releve_poser_question(p_user, g.id, f.id, 'photo_identique',
                       COALESCE(d -> 'preuve', '{}'::jsonb) || jsonb_build_object('avant_stock', false, 'regle', 'rapprochement_v3', 'article_modifie', true));
          n_sautes := n_sautes || jsonb_build_object('fusionner_article_modifie', COALESCE((n_sautes ->> 'fusionner_article_modifie')::int, 0) + 1,
                                                       'fusionner_question_posee', COALESCE((n_sautes ->> 'fusionner_question_posee')::int, 0) + CASE WHEN v_posee THEN 1 ELSE 0 END);
          CONTINUE;
        END IF;
        -- jamais deux annonces vivantes de la même plateforme sur un article
        IF EXISTS (SELECT 1 FROM annonces_plateforme x JOIN annonces_plateforme y ON y.platform = x.platform
                    WHERE x.inventaire_id = f.id AND y.inventaire_id = g.id AND x.disparu_le IS NULL AND y.disparu_le IS NULL) THEN
          n_sautes := n_sautes || jsonb_build_object('fusionner_deux_exemplaires', COALESCE((n_sautes ->> 'fusionner_deux_exemplaires')::int, 0) + 1); CONTINUE;
        END IF;
        v_r := inventaire_fusionner_pour(p_user, g.id, f.id, v_par);
        IF NOT COALESCE((v_r ->> 'ok')::boolean, false) THEN
          n_sautes := n_sautes || jsonb_build_object('fusionner_refuse', COALESCE((n_sautes ->> 'fusionner_refuse')::int, 0) + 1); CONTINUE;
        END IF;
        UPDATE inventaire_doublons SET statut = 'fusionnee', decide_le = now(), decide_par = 'rapprochement_v3', fusion_id = (v_r ->> 'fusion_id')::uuid
         WHERE user_id = p_user AND statut = 'proposee' AND least(garde, absorbe) = least(g.id, f.id) AND greatest(garde, absorbe) = greatest(g.id, f.id);
        UPDATE inventaire_doublons SET statut = 'caduque', decide_le = now(), decide_par = 'rapprochement_v3'
         WHERE user_id = p_user AND statut = 'proposee' AND (garde = f.id OR absorbe = f.id) AND motif IS DISTINCT FROM 'copie_non_prouvee';
        INSERT INTO rapprochements (user_id, annonce_id, inventaire_id, decision, par, score, detail)
        VALUES (p_user, NULLIF(d ->> 'annonce', '')::uuid, g.id, 'attache', 'auto', 1,
                COALESCE(d -> 'preuve', '{}'::jsonb) || jsonb_build_object('motif', 'photo_identique', 'regle', 'rapprochement_v3', 'fusion', v_r ->> 'fusion_id', 'absorbe', f.id, 'mode', p_mode)
                || CASE WHEN d ? 'portee' THEN jsonb_build_object('portee', d ->> 'portee') ELSE '{}'::jsonb END);
        n_faits := n_faits || jsonb_build_object('fusionner', COALESCE((n_faits ->> 'fusionner')::int, 0) + 1);

      -- ── GROUPE sans base : un article pour la première, les autres s'y rattachent ──
      ELSIF v_type = 'groupe' THEN
        SELECT COALESCE(array_agg((x)::uuid), ARRAY[]::uuid[]) INTO v_ids FROM jsonb_array_elements_text(d -> 'annonces') x;
        v_fiche := NULL;
        -- un article déjà là (import d'avant) sert de pivot
        SELECT a2.inventaire_id INTO v_fiche FROM annonces_plateforme a2 JOIN inventaire i2 ON i2.id = a2.inventaire_id
         WHERE a2.id = ANY (v_ids) AND a2.user_id = p_user AND i2.fusionne_dans IS NULL ORDER BY i2.created_at LIMIT 1;
        IF v_fiche IS NULL THEN
          FOREACH v_id IN ARRAY v_ids LOOP
            v_fiche := rapprochement_v3_fiche_de(p_user, v_id, p_geste);
            EXIT WHEN v_fiche IS NOT NULL;
          END LOOP;
        END IF;
        IF v_fiche IS NULL THEN n_sautes := n_sautes || jsonb_build_object('groupe_sans_article', COALESCE((n_sautes ->> 'groupe_sans_article')::int, 0) + 1); CONTINUE; END IF;
        n_faits := n_faits || jsonb_build_object('groupe', COALESCE((n_faits ->> 'groupe')::int, 0) + 1);
        FOREACH v_id IN ARRAY v_ids LOOP
          SELECT * INTO a FROM annonces_plateforme WHERE id = v_id AND user_id = p_user;
          IF a.id IS NULL OR a.inventaire_id = v_fiche THEN CONTINUE; END IF;
          IF a.inventaire_id IS NULL THEN
            IF a.ignoree_le IS NULL AND a.disparu_le IS NULL
               AND NOT EXISTS (SELECT 1 FROM annonces_plateforme x WHERE x.inventaire_id = v_fiche AND x.platform = a.platform AND x.disparu_le IS NULL) THEN
              v_job := rapprochement_attacher(a.id, v_fiche, 'photo_identique', COALESCE(d -> 'preuve', '{}'::jsonb) || jsonb_build_object('regle', 'rapprochement_v3', 'groupe_creation', true, 'mode', p_mode));
              IF v_job IS NOT NULL THEN n_faits := n_faits || jsonb_build_object('attacher', COALESCE((n_faits ->> 'attacher')::int, 0) + 1); END IF;
            END IF;
          ELSIF p_mode = 'reparation' THEN
            SELECT * INTO f FROM inventaire WHERE id = a.inventaire_id AND user_id = p_user AND fusionne_dans IS NULL;
            IF f.id IS NOT NULL AND f.origine LIKE 'releve\_%' AND rapprochement_v3_fiche_intacte(f.id)
               AND NOT EXISTS (SELECT 1 FROM annonces_plateforme x JOIN annonces_plateforme y ON y.platform = x.platform
                                WHERE x.inventaire_id = f.id AND y.inventaire_id = v_fiche AND x.disparu_le IS NULL AND y.disparu_le IS NULL) THEN
              v_r := inventaire_fusionner_pour(p_user, v_fiche, f.id, v_par);
              IF COALESCE((v_r ->> 'ok')::boolean, false) THEN
                UPDATE inventaire_doublons SET statut = 'caduque', decide_le = now(), decide_par = 'rapprochement_v3'
                 WHERE user_id = p_user AND statut = 'proposee' AND (garde = f.id OR absorbe = f.id) AND motif IS DISTINCT FROM 'copie_non_prouvee';
                n_faits := n_faits || jsonb_build_object('fusionner', COALESCE((n_faits ->> 'fusionner')::int, 0) + 1);
              END IF;
            END IF;
          END IF;
        END LOOP;

      -- ── À VÉRIFIER : un VRAI article, hors du stock, avec sa question ──────
      ELSIF v_type = 'a_verifier' THEN
        SELECT COALESCE(array_agg((x)::uuid), ARRAY[]::uuid[]) INTO v_ids FROM jsonb_array_elements_text(d -> 'annonces') x;
        v_fiche := NULL; v_premiere := NULL;
        SELECT a2.inventaire_id INTO v_fiche FROM annonces_plateforme a2 JOIN inventaire i2 ON i2.id = a2.inventaire_id
         WHERE a2.id = ANY (v_ids) AND a2.user_id = p_user AND i2.fusionne_dans IS NULL ORDER BY i2.created_at LIMIT 1;
        IF v_fiche IS NULL THEN
          FOREACH v_id IN ARRAY v_ids LOOP
            v_fiche := rapprochement_v3_fiche_de(p_user, v_id, p_geste);
            IF v_fiche IS NOT NULL THEN v_premiere := v_id; EXIT; END IF;
          END LOOP;
        END IF;
        IF v_fiche IS NULL THEN n_sautes := n_sautes || jsonb_build_object('a_verifier_sans_article', COALESCE((n_sautes ->> 'a_verifier_sans_article')::int, 0) + 1); CONTINUE; END IF;
        -- les autres annonces du groupe rejoignent l'article
        FOREACH v_id IN ARRAY v_ids LOOP
          SELECT * INTO a FROM annonces_plateforme WHERE id = v_id AND user_id = p_user;
          IF a.id IS NULL OR a.inventaire_id IS NOT NULL OR a.ignoree_le IS NOT NULL OR a.disparu_le IS NOT NULL THEN CONTINUE; END IF;
          IF NOT EXISTS (SELECT 1 FROM annonces_plateforme x WHERE x.inventaire_id = v_fiche AND x.platform = a.platform AND x.disparu_le IS NULL) THEN
            PERFORM rapprochement_attacher(a.id, v_fiche, 'photo_identique', jsonb_build_object('regle', 'rapprochement_v3', 'groupe_creation', true, 'mode', p_mode));
          END IF;
        END LOOP;
        -- le candidat : un article, ou l'article d'une annonce (créé au besoin)
        v_cand := NULLIF(d #>> '{candidat,fiche}', '')::bigint;
        IF v_cand IS NULL AND NULLIF(d #>> '{candidat,annonce}', '') IS NOT NULL THEN
          v_cand := rapprochement_v3_fiche_de(p_user, (d #>> '{candidat,annonce}')::uuid, p_geste);
        END IF;
        -- la chaîne des fusions : toujours l'article vivant
        WHILE v_cand IS NOT NULL AND (SELECT fusionne_dans FROM inventaire WHERE id = v_cand) IS NOT NULL LOOP
          v_cand := (SELECT fusionne_dans FROM inventaire WHERE id = v_cand);
        END LOOP;
        SELECT * INTO a FROM annonces_plateforme WHERE id = COALESCE(v_premiere, v_ids[1]) AND user_id = p_user;
        v_motif := COALESCE(NULLIF(d ->> 'motif', ''), 'rapprochement');
        v_posee := false;
        IF v_cand IS NOT NULL AND v_cand <> v_fiche THEN
          v_posee := releve_poser_question(p_user, v_cand, v_fiche, v_motif,
                       COALESCE(d -> 'preuves', '{}'::jsonb) || jsonb_build_object('avant_stock', true, 'regle', 'rapprochement_v3', 'annonce_id', a.id,
                                                                                   'platform', a.platform, 'listing_id', a.listing_id, 'url', a.url, 'prix', a.prix, 'titre_annonce', a.titre));
          -- déjà posée (par le moteur du 07/10, le rattrapage) : elle vaut
          IF NOT v_posee AND EXISTS (SELECT 1 FROM inventaire_doublons q WHERE q.user_id = p_user AND q.statut = 'proposee'
                                       AND least(q.garde, q.absorbe) = least(v_cand, v_fiche) AND greatest(q.garde, q.absorbe) = greatest(v_cand, v_fiche)) THEN
            v_posee := true;
          END IF;
        END IF;
        IF v_posee THEN
          PERFORM rapprochement_v3_marquer(p_user, v_fiche, v_motif, v_cand, a.id, a.platform);
          n_faits := n_faits || jsonb_build_object('a_verifier', COALESCE((n_faits ->> 'a_verifier')::int, 0) + 1);
        ELSE
          -- paire déjà tranchée (« non ») ou candidat impossible : un autre article, au stock
          n_faits := n_faits || jsonb_build_object('creer', COALESCE((n_faits ->> 'creer')::int, 0) + 1);
          n_sautes := n_sautes || jsonb_build_object('a_verifier_paire_tranchee', COALESCE((n_sautes ->> 'a_verifier_paire_tranchee')::int, 0) + 1);
        END IF;

      -- ── ANNONCE EN DOUBLE ? (même plateforme, même photo, même titre) ─────
      ELSIF v_type = 'annonce_en_double' THEN
        v_fa := NULLIF(d #>> '{a,fiche}', '')::bigint;
        IF v_fa IS NULL AND NULLIF(d #>> '{a,annonce}', '') IS NOT NULL THEN v_fa := rapprochement_v3_fiche_de(p_user, (d #>> '{a,annonce}')::uuid, p_geste); END IF;
        v_fb := NULLIF(d #>> '{b,fiche}', '')::bigint;
        IF v_fb IS NULL AND NULLIF(d #>> '{b,annonce}', '') IS NOT NULL THEN v_fb := rapprochement_v3_fiche_de(p_user, (d #>> '{b,annonce}')::uuid, p_geste); END IF;
        IF v_fa IS NULL OR v_fb IS NULL OR v_fa = v_fb THEN n_sautes := n_sautes || jsonb_build_object('double_sans_article', COALESCE((n_sautes ->> 'double_sans_article')::int, 0) + 1); CONTINUE; END IF;
        -- garde = le plus ancien ; jamais un article vendu
        SELECT * INTO f FROM inventaire WHERE id = v_fa; SELECT * INTO g FROM inventaire WHERE id = v_fb;
        IF f.statut = 'vendu' OR g.statut = 'vendu' THEN n_sautes := n_sautes || jsonb_build_object('double_vendu', COALESCE((n_sautes ->> 'double_vendu')::int, 0) + 1); CONTINUE; END IF;
        IF g.created_at < f.created_at THEN v_fa := g.id; v_fb := f.id; END IF;
        v_posee := releve_poser_question(p_user, v_fa, v_fb, 'annonce_en_double',
                     COALESCE(d -> 'preuves', '{}'::jsonb) || jsonb_build_object('avant_stock', true, 'regle', 'rapprochement_v3', 'platform', d ->> 'platform'));
        IF v_posee THEN
          PERFORM rapprochement_v3_marquer(p_user, v_fa, 'annonce_en_double', v_fb, NULLIF(d #>> '{a,annonce}', '')::uuid, d ->> 'platform');
          PERFORM rapprochement_v3_marquer(p_user, v_fb, 'annonce_en_double', v_fa, NULLIF(d #>> '{b,annonce}', '')::uuid, d ->> 'platform');
          n_faits := n_faits || jsonb_build_object('annonce_en_double', COALESCE((n_faits ->> 'annonce_en_double')::int, 0) + 1);
        ELSE
          n_sautes := n_sautes || jsonb_build_object('double_paire_tranchee', COALESCE((n_sautes ->> 'double_paire_tranchee')::int, 0) + 1);
        END IF;

      -- ── CRÉER : aucun candidat, l'article entre au stock ─────────────────
      ELSIF v_type = 'creer' THEN
        v_fiche := rapprochement_v3_fiche_de(p_user, (d ->> 'annonce')::uuid, p_geste);
        IF v_fiche IS NULL THEN n_sautes := n_sautes || jsonb_build_object('creer_refuse', COALESCE((n_sautes ->> 'creer_refuse')::int, 0) + 1);
        ELSE n_faits := n_faits || jsonb_build_object('creer', COALESCE((n_faits ->> 'creer')::int, 0) + 1); END IF;

      -- ── ENTRER AU STOCK (réparation) : un marqueur automatique sans raison ─
      ELSIF v_type = 'entrer_stock' THEN
        IF p_mode <> 'reparation' THEN CONTINUE; END IF;
        UPDATE inventaire SET a_verifier = NULL
         WHERE id = (d ->> 'fiche')::bigint AND user_id = p_user AND a_verifier IS NOT NULL
           AND COALESCE(a_verifier ->> 'source', '') IN ('moteur', 'rattrapage_0710', 'rapprochement_v3');
        IF FOUND THEN
          UPDATE inventaire_doublons SET statut = 'caduque', decide_le = now(), decide_par = 'rapprochement_v3'
           WHERE user_id = p_user AND statut = 'proposee' AND decide_par IS NULL AND COALESCE(source, '') = 'releve'
             AND (garde = (d ->> 'fiche')::bigint OR absorbe = (d ->> 'fiche')::bigint) AND motif IS DISTINCT FROM 'copie_non_prouvee';
          n_faits := n_faits || jsonb_build_object('entrer_stock', COALESCE((n_faits ->> 'entrer_stock')::int, 0) + 1);
        END IF;

      -- ── QUESTION CADUQUE (réparation) : une question automatique que v3 ne confirme pas ─
      ELSIF v_type = 'question_caduque' THEN
        IF p_mode <> 'reparation' THEN CONTINUE; END IF;
        UPDATE inventaire_doublons SET statut = 'caduque', decide_le = now(), decide_par = 'rapprochement_v3'
         WHERE id = (d ->> 'id')::uuid AND user_id = p_user AND statut = 'proposee' AND decide_par IS NULL
           AND COALESCE(source, '') = 'releve' AND motif IS DISTINCT FROM 'copie_non_prouvee';
        IF FOUND THEN n_faits := n_faits || jsonb_build_object('question_caduque', COALESCE((n_faits ->> 'question_caduque')::int, 0) + 1); END IF;

      -- ── IGNORER : un relevé non probant (hors liste, eBay hors compte) ──
      ELSIF v_type = 'ignorer' THEN
        UPDATE annonces_plateforme SET ignoree_le = now(), updated_at = now()
         WHERE id = (d ->> 'annonce')::uuid AND user_id = p_user AND inventaire_id IS NULL AND ignoree_le IS NULL;
        IF FOUND THEN
          INSERT INTO rapprochements (user_id, annonce_id, decision, par, score, detail)
          VALUES (p_user, (d ->> 'annonce')::uuid, 'ignore', 'auto', 0, jsonb_build_object('motif', COALESCE(d ->> 'motif', 'releve_non_probant'), 'regle', 'rapprochement_v3'));
          n_faits := n_faits || jsonb_build_object('ignorer', COALESCE((n_faits ->> 'ignorer')::int, 0) + 1);
        END IF;
      -- ── (08/10 soir) FICHE CRÉÉE À LA MAIN FACE À UNE FICHE VINTED ────────
      -- garde = la fiche de la personne, absorbe = la fiche Vinted. « fusionner_fiche » :
      -- photo ET titre, aucun concurrent (le moteur) ; la base fond la fiche
      -- Vinted dans celle de la personne si rien ne s'y oppose
      -- (rapprochement_v3_fiches_fusionnables), sinon la question. « fiche_a_verifier » :
      -- un doute, toujours la question. La fiche Vinted sort du stock le temps
      -- de la réponse (rapprochement_v3_marquer : seulement si personne ne l'a
      -- touchée) ; la fiche de la personne, jamais.
      ELSIF v_type IN ('fusionner_fiche', 'fiche_a_verifier') THEN
        v_fa := NULLIF(d ->> 'garde', '')::bigint;
        v_fb := NULLIF(d ->> 'absorbe', '')::bigint;
        v_motif := rapprochement_v3_fiches_fusionnables(p_user, v_fa, v_fb);
        -- rien : la paire n'existe plus, la personne l'a tranchée, ou ce n'est pas
        -- une fiche à la main face à une fiche Vinted ; un article vendu ou retiré
        IF v_motif IN ('introuvable', 'paire_tranchee', 'main_pas_a_la_main', 'vinted_sans_annonce',
                       'main_pas_en_stock', 'vinted_pas_en_stock', 'vinted_disparue') THEN
          n_sautes := n_sautes || jsonb_build_object(v_type || '_' || v_motif, COALESCE((n_sautes ->> (v_type || '_' || v_motif))::int, 0) + 1);
          CONTINUE;
        END IF;
        IF v_type = 'fusionner_fiche' AND v_motif IS NULL THEN
          v_r := inventaire_fusionner_pour(p_user, v_fa, v_fb, 'utilisateur:photo_rapprochement_v3_main');
          IF COALESCE((v_r ->> 'ok')::boolean, false) THEN
            UPDATE inventaire_doublons SET statut = 'fusionnee', decide_le = now(), decide_par = 'rapprochement_v3', fusion_id = (v_r ->> 'fusion_id')::uuid
             WHERE user_id = p_user AND statut = 'proposee' AND least(garde, absorbe) = least(v_fa, v_fb) AND greatest(garde, absorbe) = greatest(v_fa, v_fb);
            UPDATE inventaire_doublons SET statut = 'caduque', decide_le = now(), decide_par = 'rapprochement_v3'
             WHERE user_id = p_user AND statut = 'proposee' AND (garde = v_fb OR absorbe = v_fb) AND motif IS DISTINCT FROM 'copie_non_prouvee';
            -- (le journal : inventaire_fusions, par = 'utilisateur:photo_rapprochement_v3_main',
            -- propre à cette règle — rapprochements exige une annonce, il n'y en a pas)
            n_faits := n_faits || jsonb_build_object('fusionner_fiche', COALESCE((n_faits ->> 'fusionner_fiche')::int, 0) + 1);
            CONTINUE;
          END IF;
          v_motif := 'fusion_refusee:' || COALESCE(v_r ->> 'reason', '?');
        END IF;
        v_posee := releve_poser_question(p_user, v_fa, v_fb, COALESCE(NULLIF(d ->> 'motif', ''), 'photo_identique'),
                     COALESCE(d -> 'preuves', d -> 'preuve', '{}'::jsonb)
                     || jsonb_build_object('avant_stock', true, 'regle', 'rapprochement_v3', 'portee', 'fiche_main')
                     || CASE WHEN v_motif IS NOT NULL THEN jsonb_build_object('refus_fusion', v_motif) ELSE '{}'::jsonb END);
        IF NOT v_posee AND EXISTS (SELECT 1 FROM inventaire_doublons q WHERE q.user_id = p_user AND q.statut = 'proposee'
                                     AND least(q.garde, q.absorbe) = least(v_fa, v_fb) AND greatest(q.garde, q.absorbe) = greatest(v_fa, v_fb)) THEN
          v_posee := true;
        END IF;
        IF v_posee THEN
          PERFORM rapprochement_v3_marquer(p_user, v_fb, COALESCE(NULLIF(d ->> 'motif', ''), 'photo_identique'), v_fa, NULL::uuid, 'vinted');
          n_faits := n_faits || jsonb_build_object('fiche_a_verifier', COALESCE((n_faits ->> 'fiche_a_verifier')::int, 0) + 1);
          IF v_motif IS NOT NULL AND v_type = 'fusionner_fiche' THEN
            n_sautes := n_sautes || jsonb_build_object('fusionner_fiche_question:' || v_motif, COALESCE((n_sautes ->> ('fusionner_fiche_question:' || v_motif))::int, 0) + 1);
          END IF;
        ELSE
          n_sautes := n_sautes || jsonb_build_object(v_type || '_paire_tranchee', COALESCE((n_sautes ->> (v_type || '_paire_tranchee'))::int, 0) + 1);
        END IF;

      ELSE
        n_sautes := n_sautes || jsonb_build_object('type_inconnu', COALESCE((n_sautes ->> 'type_inconnu')::int, 0) + 1);
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_erreurs := v_erreurs || jsonb_build_array(jsonb_build_object('type', v_type, 'decision', d - 'preuves' - 'preuve', 'erreur', left(SQLERRM, 300)));
    END;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'faits', n_faits, 'sautes', n_sautes, 'erreurs', v_erreurs,
                            'ms', round(extract(epoch FROM clock_timestamp() - t0) * 1000));
END;
$function$;

CREATE OR REPLACE FUNCTION public.rapprochement_fin_run()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  BEGIN
    IF EXISTS (SELECT 1 FROM rapprochement_comptes c WHERE c.user_id = NEW.user_id AND c.etat <> 'termine')
       OR EXISTS (SELECT 1 FROM annonces_plateforme a
                   WHERE a.user_id = NEW.user_id AND a.inventaire_id IS NULL AND a.ignoree_le IS NULL AND a.disparu_le IS NULL
                     AND a.platform IN ('leboncoin', 'beebs', 'ebay', 'opla'))
       -- (08/10, complément) des fiches du dressing Vinted nées depuis la
       -- dernière passe, dans un compte qui a des imports d'autres plateformes
       OR (EXISTS (SELECT 1 FROM inventaire v WHERE v.user_id = NEW.user_id AND v.origine = 'vinted_sync' AND v.fusionne_dans IS NULL
                     AND v.created_at > rapprochement_v3_vinted_depuis(NEW.user_id))
           AND (EXISTS (SELECT 1 FROM inventaire r WHERE r.user_id = NEW.user_id AND r.origine LIKE 'releve\_%'
                          AND r.fusionne_dans IS NULL AND r.statut IN ('stock', 'vendu'))
                OR EXISTS (SELECT 1 FROM inventaire i WHERE i.user_id = NEW.user_id AND i.fusionne_dans IS NULL AND i.statut = 'stock'
                             AND i.vinted_item_id IS NULL AND COALESCE(i.origine, '') <> 'vinted_sync' AND COALESCE(i.origine, '') NOT LIKE 'releve\_%')))
       -- (08/10 soir) des fiches créées à la main nées depuis la dernière passe,
       -- dans un compte qui a des fiches Vinted
       OR (EXISTS (SELECT 1 FROM inventaire i WHERE i.user_id = NEW.user_id AND i.fusionne_dans IS NULL AND i.statut = 'stock'
                     AND i.vinted_item_id IS NULL AND COALESCE(i.origine, '') <> 'vinted_sync' AND COALESCE(i.origine, '') NOT LIKE 'releve\_%' AND i.created_at > rapprochement_v3_fiches_main_depuis(NEW.user_id))
           AND EXISTS (SELECT 1 FROM inventaire v WHERE v.user_id = NEW.user_id AND v.fusionne_dans IS NULL AND v.statut = 'stock'
                         AND (v.vinted_item_id IS NOT NULL OR v.origine = 'vinted_sync'))) THEN
      PERFORM rapprochement_demander(NEW.user_id, 'fin_run:' || COALESCE(NEW.platform, NEW.kind));
      PERFORM rapprochement_relancer(NEW.user_id);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'rapprochement_fin_run (%) : %', NEW.id, SQLERRM;
  END;
  RETURN NULL;
END;
$function$;

COMMIT;
