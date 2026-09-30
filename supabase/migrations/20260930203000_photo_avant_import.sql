-- ═══════════════════════════════════════════════════════════════════════════
-- LA PHOTO AVANT L'IMPORT, ET UN PASSAGE LÉGER (30/09 soir, Claude, GO Nico)
-- ═══════════════════════════════════════════════════════════════════════════
-- Ce que le 30/09 a montré (fusion-photo-1min, 13:50 → 19:12) :
--   1. Aucune fusion par la photo sur Opla : les photos Opla (CloudFront,
--      .webp) et une partie des photos Beebs n'avaient JAMAIS d'empreinte —
--      « Unsupported image type » (1 569 + 119 échecs) — et le passage
--      excluait CloudFront. Une fiche importée d'Opla était invisible pour la
--      fusion. Corrigé à la source : empreintes-urls v2 lit le WebP
--      (_shared/empreinte-telechargement.ts, @jsquash/webp 1.4.0).
--   2. La synchro Opla « ne reconnaît pas » : leopaul.hug et melissatissier13
--      n'ont AUCUN dépôt Opla fait par FillSell (62 et 9 annonces, toutes
--      publiées hors FillSell) — « par identifiant 0 » était exact. La seule
--      preuve est la photo, et elle doit jouer AVANT l'import, pas après.
--   3. Le passage gonflait (6–25 s, « job startup timeout ») : à chaque
--      passage, TOUT le stock du compte était relu (couvertures, puis paires
--      « touchées » = toute fiche dont une annonce avait été revue par le
--      relevé, c.-à-d. presque tout), des URL jamais résolues relançaient le
--      même travail minute après minute (carhoa 14 passages, rémi 16), et la
--      première fusion d'une connexion coûte 1 à 5 s de mise en route — le
--      tout sur une base déjà chargée (get-pending-jobs à 1–1,6 s de moyenne).
--
-- Ce fichier :
--   A. rapprochement_photo_attente : une annonce non reconnue par identifiant
--      et qui serait importée attend l'empreinte de sa photo (30 min au plus).
--   B. rapprochement_photo_decisions : LA règle, en lecture seule —
--      même photo (dHash ≤ 5 ET pHash ≤ 8) qu'UNE seule fiche en stock,
--      sur une AUTRE plateforme (la fiche n'a ni annonce vivante ni dépôt
--      publié sur celle de l'annonce), aucune autre annonce de la même
--      plateforme avec la même photo (deux annonces = deux exemplaires),
--      titres non exclusifs (couleur : kits de Louis, même photo).
--   C. rapprocher_traiter_annonce (depuis pg_get_functiondef) : la garde A.
--   D. retrait_job_prouve : un rattachement par photo identique est prouvé
--      (décision Nico : « la photo est une preuve »).
--   E. fusion_photo_candidates : « nouvelle » = CRÉÉE pendant la synchro,
--      plus « annonce revue » (c'était tout le stock).
--   F. fusion_photo_tick : un compte, borné — d'abord les annonces en
--      attente (rattacher ou relâcher), sinon les fiches neuves d'une synchro
--      (UNE fusion au plus). Le cron pose un statement_timeout dur.
-- Retour arrière : supabase/rollbacks/20260930203000_photo_avant_import.sql
-- ═══════════════════════════════════════════════════════════════════════════
SET lock_timeout = '3s';

-- ── A ──────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.rapprochement_photo_attente (
  annonce_id      uuid PRIMARY KEY REFERENCES public.annonces_plateforme(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL,
  platform        text NOT NULL,
  run_id          uuid,
  photo_url       text NOT NULL,
  cree_le         timestamptz NOT NULL DEFAULT now(),
  passages        integer NOT NULL DEFAULT 0,
  dernier_passage timestamptz,
  etat            text NOT NULL DEFAULT 'attente' CHECK (etat IN ('attente', 'rattachee', 'relachee')),
  tranche_le      timestamptz,
  bilan           jsonb
);
CREATE INDEX IF NOT EXISTS rapprochement_photo_attente_user_idx
  ON public.rapprochement_photo_attente (user_id, cree_le) WHERE etat = 'attente';
ALTER TABLE public.rapprochement_photo_attente ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rapprochement_photo_attente TO authenticated;

-- ── B ──────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rapprochement_photo_decisions(p_user uuid, p_annonces uuid[])
RETURNS TABLE (annonce_id uuid, inventaire_id bigint, motif text, n_fiches integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $f$
  WITH an AS (
    SELECT a.id, a.platform, a.titre, a.job_id, e.dhash::bit(64) d, e.phash::bit(64) p
      FROM annonces_plateforme a
      LEFT JOIN photo_empreintes e ON e.url = a.photo_url
     WHERE a.user_id = p_user AND a.id = ANY (p_annonces)),
  fe AS (
    SELECT f.id, f.titre, e.dhash::bit(64) d, e.phash::bit(64) p
      FROM (SELECT i.id, i.titre, (fiche_photos_urls(i.photos, 1))[1] url
              FROM inventaire i
             WHERE i.user_id = p_user AND i.statut = 'stock' AND i.fusionne_dans IS NULL) f
      JOIN photo_empreintes e ON e.url = f.url),
  m AS (
    SELECT an.id aid, fe.id fid, fe.titre ftitre
      FROM an JOIN fe ON an.d IS NOT NULL
       AND bit_count(an.d # fe.d) <= 5 AND bit_count(an.p # fe.p) <= 8),
  n AS (SELECT m.aid, count(*)::int nb, min(m.fid) fid, min(m.ftitre) ftitre FROM m GROUP BY m.aid)
  SELECT an.id,
         CASE WHEN x.motif = 'photo_identique' THEN n.fid END,
         x.motif, COALESCE(n.nb, 0)
    FROM an
    LEFT JOIN n ON n.aid = an.id
    CROSS JOIN LATERAL (SELECT CASE
      WHEN an.d IS NULL THEN 'sans_empreinte'
      WHEN n.nb IS NULL THEN 'aucune_photo_identique'
      WHEN n.nb > 1 THEN 'plusieurs_fiches_meme_photo'
      WHEN EXISTS (SELECT 1 FROM annonces_plateforme x
                    WHERE x.inventaire_id = n.fid AND x.platform = an.platform AND x.disparu_le IS NULL AND x.id <> an.id)
        OR EXISTS (SELECT 1 FROM cross_post_jobs j
                    WHERE j.inventaire_id = n.fid AND j.platform = an.platform AND j.status = 'published'
                      AND j.action IN ('publish', 'republish') AND j.id IS DISTINCT FROM an.job_id)
        THEN 'meme_plateforme'
      WHEN EXISTS (SELECT 1 FROM annonces_plateforme y JOIN photo_empreintes ey ON ey.url = y.photo_url
                    WHERE y.user_id = p_user AND y.platform = an.platform AND y.id <> an.id AND y.disparu_le IS NULL
                      AND bit_count(ey.dhash::bit(64) # an.d) <= 5 AND bit_count(ey.phash::bit(64) # an.p) <= 8)
        THEN 'deux_annonces_meme_plateforme'
      WHEN titres_variantes_exclusives(an.titre, n.ftitre) THEN 'variantes_exclusives'
      ELSE 'photo_identique' END motif) x;
$f$;
REVOKE ALL ON FUNCTION public.rapprochement_photo_decisions(uuid, uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rapprochement_photo_decisions(uuid, uuid[]) TO service_role;

-- Dette Beebs (même condition que rapprocher_releve, 29/09 soir) : un dépôt
-- Beebs de l'incident sans lien ni identifiant → ni import ni question.
CREATE OR REPLACE FUNCTION public.releve_dette_beebs(p_user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $f$
  SELECT EXISTS (
    SELECT 1 FROM cross_post_jobs j
     WHERE j.user_id = p_user AND j.platform = 'beebs' AND j.action IN ('publish', 'republish')
       AND j.status = 'published' AND j.platform_listing_id IS NULL AND j.listing_url IS NULL
       AND (COALESCE(j.platform_fields, '{}'::jsonb) ? 'lien_en_attente'
            OR COALESCE(j.platform_fields, '{}'::jsonb) ? 'retour_arriere_attente_identifiant_beebs')
       AND COALESCE(j.published_at, j.created_at) >= '2026-09-29 20:22:00+02'::timestamptz);
$f$;
REVOKE ALL ON FUNCTION public.releve_dette_beebs(uuid) FROM PUBLIC, anon, authenticated;

-- ── C ──────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rapprocher_traiter_annonce(p_annonce_id uuid, p_vus text[], p_import_ouvert boolean, p_rattrapage boolean DEFAULT false, p_second_releve_requis boolean DEFAULT true)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  a annonces_plateforme%ROWTYPE;
  v_user uuid; v_pf text; v_run uuid; v_trace jsonb;
  v_cl jsonb; v_bande text; v_job uuid; v_inv bigint; v_imp jsonb;
  v_att rapprochement_photo_attente%ROWTYPE;
BEGIN
  -- Verrou de ligne : le relevé de l'extension et un rattrapage ne peuvent
  -- pas traiter la même annonce en même temps ; le second la trouve traitée.
  SELECT * INTO a FROM annonces_plateforme WHERE id = p_annonce_id FOR UPDATE;
  IF a.id IS NULL THEN RETURN 'introuvable'; END IF;
  IF a.inventaire_id IS NOT NULL OR a.ignoree_le IS NOT NULL THEN RETURN 'deja_traitee'; END IF;
  -- ⛔ HORS « MES ANNONCES » (2026-09-25 nuit) : lue par un relevé dont la
  --    page n'était pas la liste du compte — ni import, ni rattachement.
  IF releve_run_hors_liste(a.run_id) THEN RETURN 'hors_liste'; END IF;
  v_user := a.user_id; v_pf := a.platform; v_run := a.run_id;
  v_trace := jsonb_build_object('run_id', v_run)
             || CASE WHEN p_rattrapage THEN jsonb_build_object('rattrapage', true) ELSE '{}'::jsonb END;

  -- ── UNE NOTIFICATION N'EST PAS UNE ANNONCE (2026-09-19) — mot pour mot ──
  IF annonce_lien_notification(a.url) THEN
    UPDATE annonces_plateforme SET ignoree_le = now(), proposition = NULL, updated_at = now() WHERE id = a.id;
    INSERT INTO rapprochements (user_id, annonce_id, inventaire_id, decision, par, score, detail)
    VALUES (v_user, a.id, NULL, 'ignore', 'auto', 0,
            v_trace || jsonb_build_object('motif', 'notification_plateforme', 'platform', v_pf, 'titre', a.titre,
                                          'ni_nt', substring(a.url from 'ni_nt(?:%3A|%3a|:|=)([A-Za-z0-9_]+)')));
    RETURN 'notification';
  END IF;

  v_cl := rapprocher_classer(v_user, v_pf, a.listing_id, a.url, a.titre, a.prix, p_vus);
  v_bande := v_cl ->> 'bande';
  v_job := NULLIF(v_cl ->> 'job_id', '')::uuid;
  v_inv := NULLIF(v_cl ->> 'inventaire_id', '')::bigint;

  -- ── JOB : l'identifiant est un dépôt FillSell ───────────────────────────
  IF v_bande = 'job' THEN
    UPDATE annonces_plateforme SET inventaire_id = v_inv, job_id = v_job, source_rapprochement = 'job', proposition = NULL, updated_at = now() WHERE id = a.id;
    INSERT INTO rapprochements (user_id, annonce_id, inventaire_id, decision, par, score, detail)
    VALUES (v_user, a.id, v_inv, 'attache', 'job', 1, v_trace || jsonb_build_object('job_id', v_job));
    IF a.statut_plateforme = 'en_ligne' THEN
      UPDATE cross_post_jobs
         SET platform_fields = (platform_fields - ARRAY['unavailable_since', 'unavailable_pending_since', 'sale_signal', 'detected_price', 'alerte_masquee_pour', 'alerte_masquee_le'])
                               || jsonb_build_object('revue_en_ligne_par_releve', jsonb_build_object('run_id', v_run, 'at', now()))
       WHERE id = v_job AND (platform_fields ? 'unavailable_since' OR platform_fields ? 'unavailable_pending_since');
    END IF;
    RETURN 'job';
  END IF;

  -- ── JOB CLOS (2026-09-25) : l'identifiant est un dépôt FillSell annulé/vendu ──
  -- On RATTACHE à la fiche d'origine, jamais d'import. Le dépôt clos garde son
  -- histoire ; un job de suivi porte l'annonce vivante. Le STATUT de la fiche
  -- n'est jamais basculé ici (une vente en main propre a la même trace qu'un
  -- faux « vendu » : c'est la personne qui tranche) :
  --   · fiche 'vendu' → le job de suivi part 'cancelled' + pending_removal :
  --     le bandeau EXISTANT « Vendu — encore en ligne sur X, retirer ? » ;
  --   · fiche en stock → job de suivi 'published', comme un rattachement normal.
  IF v_bande = 'job_clos' THEN
    v_job := rapprocher_job_de_suivi(v_user, v_pf, v_inv, a.titre, a.prix, a.url, a.listing_id, 'auto',
               v_trace || jsonb_build_object('annonce_id', a.id, 'motif', 'identifiant_depot_clos',
                                             'depot_clos', v_cl ->> 'job_id', 'statut_fiche', v_cl ->> 'statut_fiche'));
    IF (v_cl ->> 'statut_fiche') = 'vendu' THEN
      UPDATE cross_post_jobs
         SET status = 'cancelled',
             platform_fields = platform_fields || jsonb_build_object('pending_removal', true,
                               'vendu_encore_en_ligne', jsonb_build_object('run_id', v_run, 'at', now()))
       WHERE id = v_job;
    END IF;
    UPDATE annonces_plateforme SET inventaire_id = v_inv, job_id = v_job, source_rapprochement = 'job', proposition = NULL, updated_at = now() WHERE id = a.id;
    INSERT INTO rapprochements (user_id, annonce_id, inventaire_id, decision, par, score, detail)
    VALUES (v_user, a.id, v_inv, 'attache', 'job', 1,
            v_trace || jsonb_build_object('job_id', v_job, 'motif', 'identifiant_depot_clos',
                                          'depot_clos', v_cl ->> 'job_id', 'statut_fiche', v_cl ->> 'statut_fiche'));
    RETURN 'job';
  END IF;

  -- ── LA PHOTO AVANT L'IMPORT (2026-09-30) ─────────────────────────────────
  -- L'identifiant n'a rien trouvé (annonce publiée hors FillSell : les 62
  -- annonces Opla de leopaul.hug, copies de son Vinted). Avant de créer une
  -- fiche, on attend l'empreinte de la photo : si c'est la même photo qu'UNE
  -- seule fiche en stock, sur une AUTRE plateforme, l'annonce y est rattachée
  -- (fusion_photo_tick → rapprochement_photo_decisions). Sinon elle revient
  -- ici, relâchée, et suit le chemin d'avant (import, une question au plus).
  -- Au-delà de 30 min d'attente (passage arrêté), on ne retient plus rien.
  IF p_import_ouvert AND a.statut_plateforme = 'en_ligne' AND a.fiche_supprimee_le IS NULL
     AND NULLIF(btrim(COALESCE(a.photo_url, '')), '') IS NOT NULL THEN
    SELECT * INTO v_att FROM rapprochement_photo_attente WHERE annonce_id = a.id;
    IF v_att.annonce_id IS NULL THEN
      INSERT INTO rapprochement_photo_attente (annonce_id, user_id, platform, run_id, photo_url)
      VALUES (a.id, v_user, v_pf, v_run, a.photo_url) ON CONFLICT (annonce_id) DO NOTHING;
      RETURN 'attente_photo';
    ELSIF v_att.etat = 'attente' AND v_att.cree_le > now() - interval '30 minutes' THEN
      RETURN 'attente_photo';
    END IF;
  END IF;

  IF v_bande = 'certain' THEN v_bande := 'propose'; END IF;

  -- ── PROPOSE : rien sur les jobs, la proposition vit sur l'annonce ───────
  IF v_bande = 'propose' THEN
    -- (2026-09-27, audit synchro) Une annonce EN LIGNE n'attend plus une
    -- réponse HORS du stock : elle est importée plus bas, et la proposition
    -- devient une QUESTION posée sur la fiche importée (« Est-ce le même
    -- article ? »). Le rattrapage ne s'arrête sur « inchangée » que si
    -- l'import est impossible (interrupteur fermé, annonce pas en ligne,
    -- fiche supprimée exprès par la personne).
    IF p_rattrapage AND a.proposition IS NOT NULL
       AND NOT (p_import_ouvert AND a.statut_plateforme = 'en_ligne' AND a.fiche_supprimee_le IS NULL)
       AND (a.proposition ->> 'inventaire_id') IS NOT DISTINCT FROM v_inv::text
       AND (a.proposition ->> 'motif') IS NOT DISTINCT FROM (v_cl ->> 'motif') THEN
      RETURN 'propose_inchangee';
    END IF;
    UPDATE annonces_plateforme
       SET proposition = jsonb_build_object('inventaire_id', v_inv, 'job_id', v_job, 'motif', v_cl ->> 'motif', 'score', v_cl -> 'score',
                                            'candidats', COALESCE(v_cl -> 'candidats', '[]'::jsonb),
                                            'candidats_total', v_cl -> 'candidats_total',
                                            'signaux', v_cl -> 'signaux',
                                            'choix_arbitraire', v_cl -> 'choix_arbitraire',
                                            'run_id', v_run, 'at', now()),
           updated_at = now()
     WHERE id = a.id;
    INSERT INTO rapprochements (user_id, annonce_id, inventaire_id, decision, par, score, detail)
    VALUES (v_user, a.id, v_inv, 'propose', 'auto', (v_cl ->> 'score')::numeric, v_trace || jsonb_build_object('job_id', v_job, 'motif', v_cl ->> 'motif'));
    -- (2026-09-27) TOUTE annonce en ligne entre dans le stock : la ressemblance
    -- (titre, prix) ne rattache pas, elle se DEMANDE. rapprocher_importer lit la
    -- proposition posée ci-dessus et en fait la question de la fiche importée.
    IF p_import_ouvert AND a.statut_plateforme = 'en_ligne' AND a.fiche_supprimee_le IS NULL THEN
      v_imp := rapprocher_importer(v_user, a.id, 'auto');
      IF COALESCE((v_imp ->> 'ok')::boolean, false) THEN
      RETURN CASE WHEN v_imp ? 'question' THEN 'import_propose' ELSE 'import' END;
    END IF;
    END IF;
    RETURN 'propose';
  END IF;

  -- ── AUCUN CANDIDAT ──────────────────────────────────────────────────────
  IF NOT p_rattrapage THEN
    INSERT INTO rapprochements (user_id, annonce_id, inventaire_id, decision, par, score, detail)
    VALUES (v_user, a.id, NULL, 'aucune', 'auto', 0,
            v_trace || jsonb_build_object('motif', COALESCE(v_cl ->> 'motif', 'aucun_candidat'), 'platform', v_pf, 'titre', a.titre, 'prix', a.prix));
  END IF;
  -- IMPORT AUTOMATIQUE (point F, 18/09) — les trois conditions, ici.
  IF p_import_ouvert AND a.statut_plateforme = 'en_ligne'
     AND (NOT p_second_releve_requis
          OR EXISTS (SELECT 1 FROM rapprochements r
                      WHERE r.annonce_id = a.id AND r.decision = 'aucune'
                        AND COALESCE(r.detail ->> 'run_id', '') <> COALESCE(v_run::text, '')))
     -- ⛔ 2026-09-24 — QUATRIÈME CONDITION, PRÉCISE : jamais ressusciter une
     --    fiche que le vendeur a SUPPRIMÉE en gardant l'annonce en ligne
     --    (inventaire_supprimer_sans_retrait pose fiche_supprimee_le). C'est CE
     --    marqueur qui coupe la boucle de Louis — pas « déjà importée une fois »
     --    (23/09), qui bloquait aussi une annonce dont la fiche avait disparu
     --    par un autre chemin. Règle : tout ce qui est en ligne et absent du
     --    stock devient un article. Un rattachement ou un import MANUEL efface
     --    le marqueur (rapprochement_decider, rapprocher_importer).
     AND a.fiche_supprimee_le IS NULL
  THEN
    v_imp := rapprocher_importer(v_user, a.id, 'auto');
    IF COALESCE((v_imp ->> 'ok')::boolean, false) THEN
      RETURN CASE WHEN v_imp ? 'question' THEN 'import_propose' ELSE 'import' END;
    END IF;
    IF v_imp ->> 'reason' = 'jumeau_probable' THEN RETURN 'import_refuse'; END IF;
  END IF;
  RETURN 'aucune';
END;
$function$;

-- ── D ──────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.retrait_job_prouve(p_job uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT COALESCE((
    SELECT NOT EXISTS (
             SELECT 1 FROM inventaire_fusions f
              WHERE f.defait_le IS NULL AND COALESCE(f.par, '') NOT LIKE 'utilisateur%'
                AND jsonb_typeof(f.deplacements -> 'cross_post_jobs') = 'array'
                AND (f.deplacements -> 'cross_post_jobs') ? j.id::text)
       AND (COALESCE(j.platform_fields #>> '{rattachement,par}', '') IN ('', 'utilisateur')
            OR COALESCE(j.platform_fields #>> '{rattachement,motif}', '') IN ('identifiant_depot_clos', 'photo_identique')
            OR COALESCE(j.platform_fields #>> '{rattachement,import}', '') = 'true')
       AND (COALESCE(j.platform_fields ->> 'source', '') <> 'releve'
            OR COALESCE(j.platform_fields #>> '{rattachement,par}', '') = 'utilisateur'
            OR COALESCE(j.platform_fields #>> '{rattachement,motif}', '') IN ('identifiant_depot_clos', 'photo_identique')
            OR COALESCE(j.platform_fields #>> '{rattachement,import}', '') = 'true')
      FROM cross_post_jobs j WHERE j.id = p_job), false);
$function$;

-- ── E ──────────────────────────────────────────────────────────────────────
-- « Touchée » = fiche CRÉÉE depuis le début de la synchro. L'ancienne
-- définition comptait aussi toute fiche dont une annonce avait été revue
-- (updated_at), c'est-à-dire presque tout le stock après chaque relevé.
CREATE OR REPLACE FUNCTION public.fusion_photo_candidates(p_user uuid, p_depuis timestamptz)
RETURNS TABLE (ida bigint, idb bigint, meme_pf boolean, sans_pf boolean, isolee boolean,
               a_x boolean, b_x boolean, x_ok boolean, eval jsonb, job_en_cours boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $f$
  WITH f AS (
    SELECT i.id, (p_depuis IS NULL OR i.created_at >= p_depuis) touchee,
           (fiche_photos_urls(i.photos, 1))[1] url
      FROM inventaire i WHERE i.user_id = p_user AND i.statut = 'stock' AND i.fusionne_dans IS NULL),
  fe AS (
    SELECT f.id, f.touchee, e.dhash::bit(64) d, e.phash::bit(64) p,
           ARRAY(SELECT DISTINCT x FROM (
             SELECT CASE WHEN i.vinted_item_id IS NOT NULL OR i.origine = 'vinted_sync' THEN 'vinted' END x FROM inventaire i WHERE i.id = f.id
             UNION ALL SELECT CASE WHEN i.origine LIKE 'releve\_%' THEN substr(i.origine, 8) END FROM inventaire i WHERE i.id = f.id
             UNION ALL SELECT a.platform FROM annonces_plateforme a WHERE a.inventaire_id = f.id
             UNION ALL SELECT j.platform FROM cross_post_jobs j WHERE j.inventaire_id = f.id AND j.status = 'published' AND j.action IN ('publish', 'republish')
           ) z WHERE x IS NOT NULL) pf
      FROM f JOIN photo_empreintes e ON e.url = f.url),
  paires AS (
    SELECT a.id ida, b.id idb, a.d da, a.p pa, b.d db, b.p pb, (a.pf && b.pf) meme_pf,
           cardinality(a.pf) = 0 OR cardinality(b.pf) = 0 sans_pf
      FROM fe a JOIN fe b ON a.id < b.id
     WHERE bit_count(a.d # b.d) <= 5 AND bit_count(a.p # b.p) <= 8
       AND (a.touchee OR b.touchee)),
  deg AS (
    SELECT g.id, count(*) n FROM fe g JOIN fe h ON h.id <> g.id
     WHERE g.id IN (SELECT ida FROM paires UNION SELECT idb FROM paires)
       AND bit_count(g.d # h.d) <= 5 AND bit_count(g.p # h.p) <= 8
     GROUP BY g.id),
  cl AS (
    SELECT p.*, (SELECT n FROM deg WHERE deg.id = p.ida) = 1 AND (SELECT n FROM deg WHERE deg.id = p.idb) = 1 isolee FROM paires p),
  xa AS (
    SELECT cl.ida, cl.idb, e.dhash::bit(64) d, e.phash::bit(64) p FROM cl
      CROSS JOIN LATERAL unnest(fiche_photos_toutes(cl.ida)) x(url) JOIN photo_empreintes e ON e.url = x.url
     WHERE cl.isolee AND NOT cl.meme_pf AND NOT cl.sans_pf
       AND NOT (bit_count(e.dhash::bit(64) # cl.da) <= 5 AND bit_count(e.phash::bit(64) # cl.pa) <= 8)),
  xb AS (
    SELECT cl.ida, cl.idb, e.dhash::bit(64) d, e.phash::bit(64) p FROM cl
      CROSS JOIN LATERAL unnest(fiche_photos_toutes(cl.idb)) x(url) JOIN photo_empreintes e ON e.url = x.url
     WHERE cl.isolee AND NOT cl.meme_pf AND NOT cl.sans_pf
       AND NOT (bit_count(e.dhash::bit(64) # cl.db) <= 5 AND bit_count(e.phash::bit(64) # cl.pb) <= 8))
  SELECT cl.ida, cl.idb, cl.meme_pf, cl.sans_pf, cl.isolee,
         EXISTS (SELECT 1 FROM xa WHERE xa.ida = cl.ida AND xa.idb = cl.idb),
         EXISTS (SELECT 1 FROM xb WHERE xb.ida = cl.ida AND xb.idb = cl.idb),
         EXISTS (SELECT 1 FROM xa JOIN xb ON xa.ida = xb.ida AND xa.idb = xb.idb
                  WHERE xa.ida = cl.ida AND xa.idb = cl.idb AND bit_count(xa.d # xb.d) <= 5 AND bit_count(xa.p # xb.p) <= 8),
         CASE WHEN cl.isolee AND NOT cl.meme_pf AND NOT cl.sans_pf THEN inventaire_doublon_evaluer(cl.ida, cl.idb) END,
         EXISTS (SELECT 1 FROM cross_post_jobs jj WHERE jj.inventaire_id IN (cl.ida, cl.idb) AND jj.status IN ('pending', 'processing', 'needs_user'))
    FROM cl;
$f$;

-- ── F ──────────────────────────────────────────────────────────────────────
-- Un passage = UN compte, borné à ~2,5 s de travail (le cron ajoute un
-- statement_timeout dur de 8 s : au-delà, tout le passage est annulé, rien
-- n'est à moitié écrit).
--   1. Annonces en attente de photo (au plus 40 d'un compte) :
--        empreintes manquantes (photos des annonces d'abord, puis couvertures
--        du stock) → au plus 6 appels × 4 URL, puis on revient au passage
--        suivant ; au-delà de 8 passages, on tranche avec ce qu'on a ;
--        sinon on tranche : photo_identique → rattachée (job de suivi, motif
--        'photo_identique') ; tout autre motif → relâchée, puis le chemin
--        d'avant (rapprocher_traiter_annonce : import, une question au plus).
--   2. Sinon, les fiches créées par une synchro terminée (file
--      fusion_photo_file) : couvertures manquantes, puis UNE fusion au plus.
CREATE OR REPLACE FUNCTION public.fusion_photo_tick()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $f$
DECLARE
  f fusion_photo_file%ROWTYPE; v_urls text[]; n_appels integer := 0; r jsonb; n_lot integer;
  c_url constant text := 'https://tojihnuawsoohlolangc.supabase.co/functions/v1/empreintes-urls';
  -- ⚠️ secret de cron en clair : même clé que les autres crons (chantier rotation, CLAUDE.md)
  c_headers constant jsonb := '{"Content-Type":"application/json","x-cron-secret":"fs-cron-2026-tunnel"}'::jsonb;
  t0 timestamptz := clock_timestamp();
  v_user uuid; v_ids uuid[]; v_pass integer; d record; a annonces_plateforme%ROWTYPE; v_job uuid;
  v_vus text[]; v_res text; v_import boolean; v_dette boolean;
  n_rat integer := 0; n_rel integer := 0; n_err integer := 0; n_reste integer := 0; v_motifs jsonb := '{}'::jsonb;
BEGIN
  -- Les demandes déposées par les synchros entrent dans la file.
  WITH dm AS (DELETE FROM fusion_photo_demandes RETURNING user_id, depuis, cree_le)
  INSERT INTO fusion_photo_file AS fp (user_id, depuis, demande_le, etat, passages)
  SELECT dm.user_id, min(dm.depuis), max(dm.cree_le), 'a_faire', 0 FROM dm
   WHERE EXISTS (SELECT 1 FROM auth.users u WHERE u.id = dm.user_id)
   GROUP BY dm.user_id
  ON CONFLICT (user_id) DO UPDATE
     SET depuis = CASE WHEN fp.etat = 'a_faire' THEN LEAST(fp.depuis, EXCLUDED.depuis) ELSE EXCLUDED.depuis END,
         demande_le = EXCLUDED.demande_le,
         passages = CASE WHEN fp.etat = 'a_faire' THEN fp.passages ELSE 0 END,
         etat = 'a_faire';

  -- ── 1. Annonces en attente de photo ──────────────────────────────────────
  SELECT w.user_id INTO v_user FROM rapprochement_photo_attente w
   WHERE w.etat = 'attente' AND (w.dernier_passage IS NULL OR w.dernier_passage < now() - interval '40 seconds')
   ORDER BY w.dernier_passage NULLS FIRST, w.cree_le LIMIT 1;
  IF v_user IS NOT NULL THEN
    SELECT array_agg(z.annonce_id), max(z.passages) INTO v_ids, v_pass FROM (
      SELECT w.annonce_id, w.passages FROM rapprochement_photo_attente w
       WHERE w.user_id = v_user AND w.etat = 'attente' ORDER BY w.cree_le LIMIT 40) z;
    UPDATE rapprochement_photo_attente SET passages = passages + 1, dernier_passage = now() WHERE annonce_id = ANY (v_ids);

    SELECT array_agg(z.u) INTO v_urls FROM (
      SELECT y.u FROM (
        SELECT w.photo_url u, 0 prio FROM rapprochement_photo_attente w WHERE w.annonce_id = ANY (v_ids)
        UNION ALL
        SELECT (fiche_photos_urls(i.photos, 1))[1], 1 FROM inventaire i
         WHERE i.user_id = v_user AND i.statut = 'stock' AND i.fusionne_dans IS NULL) y
       WHERE y.u IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM photo_empreintes e WHERE e.url = y.u)
         AND NOT EXISTS (SELECT 1 FROM photo_empreintes_echecs e WHERE e.url = y.u)
       GROUP BY y.u ORDER BY min(y.prio) LIMIT 24) z;
    IF v_urls IS NOT NULL AND COALESCE(v_pass, 0) < 8 THEN
      FOR n_lot IN 0 .. LEAST(5, (array_length(v_urls, 1) - 1) / 4) LOOP
        PERFORM net.http_post(url := c_url, body := jsonb_build_object('urls', to_jsonb(v_urls[n_lot * 4 + 1 : n_lot * 4 + 4])),
                              headers := c_headers, timeout_milliseconds := 60000);
        n_appels := n_appels + 1;
      END LOOP;
      RETURN jsonb_build_object('issue', 'empreintes_attente', 'user', v_user, 'annonces', array_length(v_ids, 1),
                                'photos_manquantes', array_length(v_urls, 1), 'appels', n_appels,
                                'ms', round(extract(epoch FROM clock_timestamp() - t0) * 1000));
    END IF;

    v_import := COALESCE((SELECT value FROM coin_config WHERE key = 'import_auto_ouvert'), 0) = 1;
    v_dette := releve_dette_beebs(v_user);
    FOR d IN SELECT * FROM rapprochement_photo_decisions(v_user, v_ids) LOOP
      IF clock_timestamp() - t0 > interval '2500 milliseconds' THEN n_reste := n_reste + 1; CONTINUE; END IF;
      v_motifs := v_motifs || jsonb_build_object(d.motif, COALESCE((v_motifs ->> d.motif)::int, 0) + 1);
      BEGIN
        SELECT * INTO a FROM annonces_plateforme WHERE id = d.annonce_id FOR UPDATE;
        IF d.inventaire_id IS NOT NULL AND a.inventaire_id IS NULL AND a.ignoree_le IS NULL THEN
          v_job := rapprocher_job_de_suivi(v_user, a.platform, d.inventaire_id, a.titre, a.prix, a.url, a.listing_id, 'auto',
                     jsonb_build_object('annonce_id', a.id, 'motif', 'photo_identique', 'run_id', a.run_id));
          UPDATE annonces_plateforme SET inventaire_id = d.inventaire_id, job_id = v_job, source_rapprochement = 'automatique',
                                         proposition = NULL, updated_at = now()
           WHERE id = a.id;
          INSERT INTO rapprochements (user_id, annonce_id, inventaire_id, decision, par, score, detail)
          VALUES (v_user, a.id, d.inventaire_id, 'attache', 'auto', 1,
                  jsonb_build_object('run_id', a.run_id, 'job_id', v_job, 'motif', 'photo_identique'));
          UPDATE rapprochement_photo_attente SET etat = 'rattachee', tranche_le = now(),
                 bilan = jsonb_build_object('motif', d.motif, 'inventaire_id', d.inventaire_id, 'job_id', v_job)
           WHERE annonce_id = a.id;
          n_rat := n_rat + 1;
        ELSE
          UPDATE rapprochement_photo_attente SET etat = 'relachee', tranche_le = now(),
                 bilan = jsonb_build_object('motif', d.motif, 'fiches_meme_photo', d.n_fiches)
           WHERE annonce_id = d.annonce_id;
          IF a.id IS NOT NULL AND a.inventaire_id IS NULL AND a.ignoree_le IS NULL THEN
            SELECT COALESCE(array_agg(x.listing_id), ARRAY[]::text[]) INTO v_vus FROM annonces_plateforme x WHERE x.run_id = a.run_id;
            v_res := rapprocher_traiter_annonce(a.id, v_vus, v_import AND NOT (a.platform = 'beebs' AND v_dette), false, false);
            -- Retenue silencieuse Beebs (29/09 soir), comme rapprocher_releve.
            IF a.platform = 'beebs' AND v_dette AND v_res IN ('propose', 'propose_inchangee', 'aucune') THEN
              UPDATE annonces_plateforme SET ignoree_le = now(), updated_at = now()
               WHERE id = a.id AND inventaire_id IS NULL AND ignoree_le IS NULL;
              IF FOUND THEN
                INSERT INTO rapprochements (user_id, annonce_id, inventaire_id, decision, par, score, detail)
                VALUES (v_user, a.id, NULL, 'ignore', 'auto', 0,
                        jsonb_build_object('run_id', a.run_id, 'motif', 'retenue_silencieuse_beebs', 'resultat', v_res,
                                           'regle', 'dépôt Beebs sans identifiant : ni import ni question avant preuve exacte'));
              END IF;
            END IF;
          END IF;
          n_rel := n_rel + 1;
        END IF;
      EXCEPTION WHEN OTHERS THEN
        n_err := n_err + 1;
        UPDATE rapprochement_photo_attente SET etat = 'relachee', tranche_le = now(),
               bilan = jsonb_build_object('motif', d.motif, 'erreur', left(SQLERRM, 200))
         WHERE annonce_id = d.annonce_id;
      END;
    END LOOP;
    RETURN jsonb_build_object('issue', 'attente_tranchee', 'user', v_user, 'rattachees', n_rat, 'relachees', n_rel,
                              'erreurs', n_err, 'reste', n_reste, 'motifs', v_motifs,
                              'ms', round(extract(epoch FROM clock_timestamp() - t0) * 1000));
  END IF;

  -- ── 2. Fiches créées par une synchro ────────────────────────────────────
  SELECT * INTO f FROM fusion_photo_file fp
   WHERE fp.etat = 'a_faire'
     AND NOT fusion_photo_synchro_en_cours(fp.user_id)
     AND (fp.dernier_passage IS NULL OR fp.dernier_passage < now() - interval '45 seconds')
   ORDER BY fp.dernier_passage NULLS FIRST, fp.demande_le
   LIMIT 1;
  IF f.user_id IS NULL THEN RETURN jsonb_build_object('issue', 'rien'); END IF;

  UPDATE fusion_photo_file SET passages = passages + 1, dernier_passage = now() WHERE user_id = f.user_id;
  IF f.passages >= 20 THEN
    UPDATE fusion_photo_file SET etat = 'abandonne', bilan = COALESCE(bilan, '{}'::jsonb) || jsonb_build_object('abandonne_le', now()) WHERE user_id = f.user_id;
    RETURN jsonb_build_object('issue', 'abandonne', 'user', f.user_id);
  END IF;
  -- Rien de neuf depuis la synchro : c'est fini, sans rien relire d'autre.
  IF NOT EXISTS (SELECT 1 FROM inventaire i WHERE i.user_id = f.user_id AND i.statut = 'stock'
                    AND i.fusionne_dans IS NULL AND i.created_at >= f.depuis) THEN
    UPDATE fusion_photo_file SET etat = 'termine', bilan = COALESCE(bilan, '{}'::jsonb) || jsonb_build_object('rien_de_neuf', now())
     WHERE user_id = f.user_id;
    RETURN jsonb_build_object('issue', 'rien_de_neuf', 'user', f.user_id);
  END IF;
  -- Couvertures manquantes : les fiches neuves d'abord, puis le reste du stock.
  SELECT array_agg(z.u) INTO v_urls FROM (
    SELECT y.u FROM (
      SELECT (fiche_photos_urls(i.photos, 1))[1] u, (i.created_at < f.depuis)::int prio FROM inventaire i
       WHERE i.user_id = f.user_id AND i.statut = 'stock' AND i.fusionne_dans IS NULL) y
     WHERE y.u IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM photo_empreintes e WHERE e.url = y.u)
       AND NOT EXISTS (SELECT 1 FROM photo_empreintes_echecs e WHERE e.url = y.u)
     GROUP BY y.u ORDER BY min(y.prio) LIMIT 24) z;
  IF v_urls IS NOT NULL AND f.passages < 8 THEN
    FOR n_lot IN 0 .. LEAST(5, (array_length(v_urls, 1) - 1) / 4) LOOP
      PERFORM net.http_post(url := c_url, body := jsonb_build_object('urls', to_jsonb(v_urls[n_lot * 4 + 1 : n_lot * 4 + 4])),
                            headers := c_headers, timeout_milliseconds := 60000);
      n_appels := n_appels + 1;
    END LOOP;
    UPDATE fusion_photo_file SET bilan = COALESCE(bilan, '{}'::jsonb) || jsonb_build_object('photos_manquantes', array_length(v_urls, 1))
     WHERE user_id = f.user_id;
    RETURN jsonb_build_object('issue', 'empreintes', 'user', f.user_id, 'photos_manquantes', array_length(v_urls, 1), 'appels', n_appels);
  END IF;

  r := fusion_photo_compte(f.user_id, f.depuis, 1, 'utilisateur:photo_auto', 800);
  UPDATE fusion_photo_file
     SET fusions = fusions + COALESCE((r ->> 'fusions')::int, 0),
         bilan = COALESCE(bilan, '{}'::jsonb) || jsonb_build_object('dernier', r),
         etat = CASE WHEN COALESCE((r ->> 'ok')::boolean, false) AND COALESCE((r ->> 'restantes')::int, 0) = 0 THEN 'termine' ELSE etat END
   WHERE user_id = f.user_id;
  RETURN jsonb_build_object('issue', 'fusions', 'user', f.user_id, 'resultat', r,
                            'ms', round(extract(epoch FROM clock_timestamp() - t0) * 1000));
END $f$;
REVOKE ALL ON FUNCTION public.fusion_photo_tick() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fusion_photo_tick() TO service_role;

-- Les photos WebP refusées avant empreintes-urls v2 sont de nouveau lisibles :
-- elles quittent la liste des échecs (cache seulement, aucune fiche touchée).
DELETE FROM public.photo_empreintes_echecs WHERE motif = 'Unsupported image type';

-- Le cron n'est PAS reposé ici : fichier séparé, après rejeu et mesure.
