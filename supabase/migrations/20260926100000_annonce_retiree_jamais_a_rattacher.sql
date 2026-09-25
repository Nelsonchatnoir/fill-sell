-- ═══════════════════════════════════════════════════════════════════════════
-- UNE ANNONCE RETIRÉE NE SE RATTACHE PLUS, UN RATTACHEMENT NE DÉCROCHE PLUS
-- UNE ANNONCE VIVANTE (2026-09-26)
-- ═══════════════════════════════════════════════════════════════════════════
-- LE FAIT (labouquinerie85, 25/09) :
--   22:43 et 23:15 — elle supprime deux fiches ; FillSell retire leurs 4
--   annonces (Leboncoin 3262035696 + 3262035014, Opla art_ce91 + art_1b7d),
--   retraits VÉRIFIÉS (Opla : DELETE 204 puis GET 404).
--   23:28 — les 4 annonces sont pourtant dans « Annonces à rattacher », comme
--   vivantes. Elle en rattache deux à d'AUTRES livres. Chaque rattachement
--   RECÂBLE le job Opla de la fiche : il quitte l'annonce vivante de la fiche
--   (art_a609, art_6960) pour l'annonce morte. Résultat : « vendue ? » sur un
--   livre toujours en ligne, et une annonce vivante que plus rien ne suit.
--   (Les deux jobs ont été réparés à la main le 26/09 sur GO de Nico.)
--
-- LES DEUX CAUSES, LUES EN PROD (pg_get_functiondef, pas supposées) :
--   1. Un retrait abouti (job delete → 'deleted') n'écrit RIEN sur la ligne
--      annonces_plateforme : elle reste disparu_le NULL, et la fiche supprimée
--      lui a mis inventaire_id à NULL (FK SET NULL). Elle remplit donc les
--      trois filtres de « à rattacher » (inventaire_id, ignoree_le, disparu_le
--      NULL) jusqu'au prochain relevé COMPLET de la plateforme — pour
--      Leboncoin, il n'est jamais venu. Parc : 117 retraits aboutis, 15 lignes
--      jamais marquées (balayage du 26/09).
--   2. rapprochement_decider('attache') prend le dernier job 'published' de la
--      fiche sur la plateforme et le RECÂBLE (rapprocher_recabler_job) vers la
--      nouvelle annonce, sans regarder si l'annonce que ce job suivait est
--      encore en ligne. Parc : 30 jobs recâblés à la main, 26 dont l'annonce
--      d'origine est toujours vivante et n'est plus suivie par aucun job.
--      (Le moteur automatique, lui, avait déjà cette garde : premier tour et
--      faisceau excluent un job dont l'annonce est vivante ; rapprocher_
--      confirmer_photo aussi. Seul le geste manuel ne l'avait pas.)
--
-- CE QUE FAIT CETTE MIGRATION :
--   0. annonces_plateforme.retiree_le / retrait_job_id : la trace du retrait.
--   1. listing_designe() : « ce job vise-t-il cette annonce ? », la règle du
--      moteur (rapprocher_classer) écrite une fois. ⛔ Un identifiant vide ou
--      trop court ne désigne RIEN (position('' in x) vaut 1, cf. 20/09).
--   2. Trigger : un retrait qui passe 'deleted' date la ligne (disparu_le si
--      elle ne l'était pas, retiree_le, retrait_job_id) et efface sa
--      proposition. disparu_le reste le verdict « plus en ligne » : un relevé
--      qui revoit l'annonce le remet à NULL comme toujours — le relevé garde
--      le dernier mot. AUCUN signal de vente n'est tiré d'ici.
--   3. Rattrapage : la même écriture sur les retraits déjà aboutis, SEULEMENT
--      quand l'annonce n'a pas été revue depuis la demande de retrait
--      (vu_le <= created_at du job delete).
--   4. rapprochement_decider — deux gardes, rien d'autre ne bouge :
--      a. 'attache'/'import' refusés sur une annonce plus en ligne
--         (disparu_le) ou dont le retrait est demandé/en cours/abouti depuis
--         qu'on l'a vue. Un « message » en clair accompagne le refus : l'app
--         l'affiche tel quel (EcranRattachement : r.message ?? r.reason).
--      b. 'attache' ne recâble JAMAIS un job qui suit une annonce encore
--         vivante (même fiche, autre annonce) : l'annonce rattachée reçoit son
--         propre job de suivi (rapprocher_job_de_suivi, le chemin existant).
--
-- Vinted n'est pas concernée : annonces_plateforme ne la porte pas (CHECK
-- platform), le trigger est borné aux quatre plateformes relevées.
-- ÉCRITE le 26/09/2026, NON APPLIQUÉE — en attente de la validation de Nico.

-- ── 0. La trace du retrait ──────────────────────────────────────────────────
ALTER TABLE public.annonces_plateforme ADD COLUMN IF NOT EXISTS retiree_le timestamptz;
ALTER TABLE public.annonces_plateforme ADD COLUMN IF NOT EXISTS retrait_job_id uuid;
COMMENT ON COLUMN public.annonces_plateforme.retiree_le IS
  'Date du retrait ABOUTI par FillSell (job delete passé ''deleted''). Posé avec disparu_le : une annonce retirée ne doit plus jamais apparaître dans « Annonces à rattacher ». 2026-09-26.';
COMMENT ON COLUMN public.annonces_plateforme.retrait_job_id IS
  'Le job delete qui a retiré cette annonce. 2026-09-26.';

-- ── 1. « Ce job vise-t-il cette annonce ? » ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.listing_designe(p_listing text, p_url text, p_pid text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $fn$
  -- La règle de rapprocher_classer, une seule fois. ⛔ Un identifiant de moins
  -- de 4 caractères ne désigne rien : position('' in x) vaut 1 (20/09).
  SELECT length(btrim(COALESCE(p_listing, ''))) >= 4
     AND (btrim(p_listing) = btrim(COALESCE(p_pid, ''))
          OR (btrim(p_listing) ~ '^\d+$'
              AND COALESCE(p_url, '') ~ ('(^|[^0-9])' || btrim(p_listing) || '([^0-9]|$)'))
          OR (btrim(p_listing) !~ '^\d+$'
              AND position(btrim(p_listing) IN COALESCE(p_url, '')) > 0));
$fn$;
COMMENT ON FUNCTION public.listing_designe(text, text, text) IS
  'Vrai si un job (listing_url, platform_listing_id) vise l''annonce p_listing. Identifiant vide ou < 4 caractères : faux. 2026-09-26.';

-- ── 2. Un retrait abouti ferme l'annonce relevée ────────────────────────────
CREATE OR REPLACE FUNCTION public.cross_post_jobs_retrait_ferme_annonce()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
BEGIN
  -- ⛔ JAMAIS BLOQUANT : le retrait est fait, on ne le fait pas échouer pour
  --    une trace. Un raté se voit en WARNING, et le prochain relevé complet
  --    datera l'annonce de toute façon.
  BEGIN
    UPDATE annonces_plateforme a
       SET disparu_le = COALESCE(a.disparu_le, now()),
           retiree_le = now(),
           retrait_job_id = NEW.id,
           proposition = CASE WHEN a.disparu_le IS NULL THEN NULL ELSE a.proposition END,
           updated_at = now()
     WHERE a.user_id = NEW.user_id
       AND a.platform = NEW.platform
       AND a.retiree_le IS NULL
       AND listing_designe(a.listing_id, NEW.listing_url, NEW.platform_listing_id);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'cross_post_jobs_retrait_ferme_annonce (job %) : % — retrait non tracé', NEW.id, SQLERRM;
  END;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS cross_post_jobs_retrait_ferme_annonce ON public.cross_post_jobs;
CREATE TRIGGER cross_post_jobs_retrait_ferme_annonce
  AFTER UPDATE OF status ON public.cross_post_jobs
  FOR EACH ROW
  WHEN (NEW.action = 'delete' AND NEW.status = 'deleted' AND OLD.status IS DISTINCT FROM 'deleted'
        AND NEW.platform IN ('leboncoin', 'beebs', 'ebay', 'opla'))
  EXECUTE FUNCTION public.cross_post_jobs_retrait_ferme_annonce();

DROP TRIGGER IF EXISTS cross_post_jobs_retrait_ferme_annonce_ins ON public.cross_post_jobs;
CREATE TRIGGER cross_post_jobs_retrait_ferme_annonce_ins
  AFTER INSERT ON public.cross_post_jobs
  FOR EACH ROW
  WHEN (NEW.action = 'delete' AND NEW.status = 'deleted'
        AND NEW.platform IN ('leboncoin', 'beebs', 'ebay', 'opla'))
  EXECUTE FUNCTION public.cross_post_jobs_retrait_ferme_annonce();

-- ── 3. Rattrapage des retraits déjà aboutis ─────────────────────────────────
-- Seulement si l'annonce n'a pas été REVUE depuis la demande de retrait : une
-- annonce revue après, c'est le relevé qui a raison.
WITH r AS (
  SELECT DISTINCT ON (a.id) a.id, d.id AS job_id, d.created_at AS retrait_le
    FROM public.annonces_plateforme a
    JOIN public.cross_post_jobs d
      ON d.user_id = a.user_id AND d.platform = a.platform
     AND d.action = 'delete' AND d.status = 'deleted'
     AND public.listing_designe(a.listing_id, d.listing_url, d.platform_listing_id)
   WHERE a.retiree_le IS NULL
     AND d.created_at >= COALESCE(a.vu_le, a.created_at)
   ORDER BY a.id, d.created_at DESC
)
UPDATE public.annonces_plateforme a
   SET retiree_le = r.retrait_le,
       retrait_job_id = r.job_id,
       disparu_le = COALESCE(a.disparu_le, r.retrait_le),
       proposition = CASE WHEN a.disparu_le IS NULL THEN NULL ELSE a.proposition END,
       updated_at = now()
  FROM r
 WHERE a.id = r.id;

-- ── 4. rapprochement_decider : les deux gardes ──────────────────────────────
DO $do$
DECLARE
  v_def text; v_new text;
  a1 text := $a$  IF p_decision = 'attache' THEN
    v_inv := COALESCE(p_inventaire_id, NULLIF(a.proposition ->> 'inventaire_id', '')::bigint);$a$;
  r1 text := $a$  -- ⛔ 2026-09-26 (labouquinerie85) : UNE ANNONCE QUI N'EST PLUS EN LIGNE NE SE
  --    RATTACHE PAS. Plus en ligne (disparu_le), ou retrait demandé / en cours
  --    / abouti depuis la dernière fois qu'un relevé l'a vue. Le 25/09, quatre
  --    annonces retirées par FillSell ont été proposées « à rattacher » comme
  --    vivantes ; deux ont été rattachées à d'autres livres.
  IF p_decision IN ('attache', 'import') THEN
    IF a.disparu_le IS NOT NULL THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'annonce_plus_en_ligne',
        'message', 'Cette annonce n''est plus en ligne : il n''y a plus rien à rattacher.');
    END IF;
    IF EXISTS (SELECT 1 FROM cross_post_jobs d
                WHERE d.user_id = v_user AND d.platform = a.platform AND d.action = 'delete'
                  AND d.status IN ('pending', 'processing', 'needs_user', 'deleted')
                  AND d.created_at >= COALESCE(a.vu_le, a.created_at)
                  AND listing_designe(a.listing_id, d.listing_url, d.platform_listing_id)) THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'annonce_retiree',
        'message', 'FillSell a retiré cette annonce (ou est en train de le faire) : il n''y a plus rien à rattacher.');
    END IF;
  END IF;

  IF p_decision = 'attache' THEN
    v_inv := COALESCE(p_inventaire_id, NULLIF(a.proposition ->> 'inventaire_id', '')::bigint);$a$;
  a2 text := $a$    IF v_job IS NOT NULL THEN
      PERFORM rapprocher_recabler_job(v_job, a.url, a.listing_id, 'utilisateur', jsonb_build_object('annonce_id', a.id));$a$;
  r2 text := $a$    -- ⛔ 2026-09-26 (labouquinerie85) : ON NE DÉCROCHE JAMAIS UNE ANNONCE VIVANTE.
    --    Le job de la fiche ne se recâble que si l'annonce qu'il suit n'est
    --    plus en ligne (le cas « annonce remplacée »). Sinon la fiche porte deux
    --    annonces sur la plateforme : l'annonce rattachée reçoit SON job de
    --    suivi, l'autre garde le sien. Le 25/09, deux jobs Opla ont quitté leur
    --    annonce vivante pour une annonce retirée ; parc : 26 sur 30.
    IF v_job IS NOT NULL AND EXISTS (
         SELECT 1 FROM annonces_plateforme x, cross_post_jobs jx
          WHERE jx.id = v_job AND x.user_id = v_user AND x.platform = a.platform
            AND x.id <> a.id AND x.disparu_le IS NULL
            AND (x.job_id = v_job OR listing_designe(x.listing_id, jx.listing_url, jx.platform_listing_id))) THEN
      v_job := NULL;
    END IF;
    IF v_job IS NOT NULL THEN
      PERFORM rapprocher_recabler_job(v_job, a.url, a.listing_id, 'utilisateur', jsonb_build_object('annonce_id', a.id));$a$;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'rapprochement_decider';
  IF v_def IS NULL THEN RAISE EXCEPTION 'rapprochement_decider introuvable'; END IF;
  IF position('ON NE DÉCROCHE JAMAIS UNE ANNONCE VIVANTE' IN v_def) > 0 THEN
    RAISE NOTICE 'rapprochement_decider : déjà migrée'; RETURN;
  END IF;
  IF (length(v_def) - length(replace(v_def, a1, ''))) / length(a1) <> 1 THEN
    RAISE EXCEPTION 'rapprochement_decider : ancre 1 (début du bloc attache) absente ou multiple — corps prod différent de celui relu le 26/09';
  END IF;
  IF (length(v_def) - length(replace(v_def, a2, ''))) / length(a2) <> 1 THEN
    RAISE EXCEPTION 'rapprochement_decider : ancre 2 (recâblage) absente ou multiple — corps prod différent de celui relu le 26/09';
  END IF;
  v_new := replace(replace(v_def, a1, r1), a2, r2);
  EXECUTE v_new;
END
$do$;

-- ── 5. Contrôle final — BLOQUANT ────────────────────────────────────────────
DO $do$
DECLARE v_def text; n integer;
BEGIN
  -- la règle de désignation
  IF public.listing_designe('', 'https://www.leboncoin.fr/ad/livres/3262035696', NULL) THEN RAISE EXCEPTION 'contrôle : identifiant vide désigne'; END IF;
  IF public.listing_designe('abc', 'https://x/abc', NULL) THEN RAISE EXCEPTION 'contrôle : identifiant court désigne'; END IF;
  IF NOT public.listing_designe('3262035696', 'https://www.leboncoin.fr/ad/livres/3262035696', NULL) THEN RAISE EXCEPTION 'contrôle : LBC par URL'; END IF;
  IF public.listing_designe('326203569', 'https://www.leboncoin.fr/ad/livres/3262035696', NULL) THEN RAISE EXCEPTION 'contrôle : préfixe numérique désigne'; END IF;
  IF NOT public.listing_designe('art_ce91047f9955b194473c840eb6d435c6', 'https://www.opla.co/product/art_ce91047f9955b194473c840eb6d435c6', NULL) THEN RAISE EXCEPTION 'contrôle : Opla par URL'; END IF;
  IF NOT public.listing_designe('158338512101', NULL, '158338512101') THEN RAISE EXCEPTION 'contrôle : par identifiant'; END IF;
  -- les triggers
  SELECT count(*) INTO n FROM pg_trigger WHERE tgrelid = 'public.cross_post_jobs'::regclass
     AND tgname IN ('cross_post_jobs_retrait_ferme_annonce', 'cross_post_jobs_retrait_ferme_annonce_ins') AND NOT tgisinternal;
  IF n <> 2 THEN RAISE EXCEPTION 'contrôle : % trigger(s) de retrait au lieu de 2', n; END IF;
  -- le décideur porte les deux gardes, une fois chacune
  SELECT pg_get_functiondef('public.rapprochement_decider(uuid,text,bigint)'::regprocedure) INTO v_def;
  IF position('annonce_plus_en_ligne' IN v_def) = 0 OR position('annonce_retiree' IN v_def) = 0 THEN RAISE EXCEPTION 'contrôle : garde « annonce plus en ligne » absente'; END IF;
  IF position('ON NE DÉCROCHE JAMAIS UNE ANNONCE VIVANTE' IN v_def) = 0 THEN RAISE EXCEPTION 'contrôle : garde « décrochage » absente'; END IF;
  -- plus aucune annonce retirée (non revue depuis) dans « à rattacher »
  SELECT count(*) INTO n
    FROM public.annonces_plateforme a
   WHERE a.inventaire_id IS NULL AND a.ignoree_le IS NULL AND a.disparu_le IS NULL
     AND EXISTS (SELECT 1 FROM public.cross_post_jobs d
                  WHERE d.user_id = a.user_id AND d.platform = a.platform AND d.action = 'delete' AND d.status = 'deleted'
                    AND d.created_at >= COALESCE(a.vu_le, a.created_at)
                    AND public.listing_designe(a.listing_id, d.listing_url, d.platform_listing_id));
  IF n <> 0 THEN RAISE EXCEPTION 'contrôle : % annonce(s) retirée(s) encore « à rattacher »', n; END IF;
END
$do$;
