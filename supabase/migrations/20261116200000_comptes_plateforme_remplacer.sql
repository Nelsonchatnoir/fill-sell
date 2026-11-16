-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 20261116200000 — « REMPLACER MON COMPTE DE PLATEFORME » (Leboncoin d'abord)
-- (16/11/2026, point 4 de Nico — ayadi007 ; PRÉPARÉE, NON APPLIQUÉE : feu vert de Nico, décisions D1 à D10 de
--  docs/enquetes/lot-1611-2-midi/annexe-p4.md)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- LE FAIT : depuis le 08/11 (extension 0.6.182) FillSell CONNAÎT le compte Leboncoin de chaque relevé et de chaque annonce
-- (compte_plateforme) mais n'en RETIENT aucun. ayadi007 (cfdfda6f) : l'ancien compte bf460991 garde 108 annonces « en
-- ligne » chez nous (non revues depuis le 15/11 19:32 ; 95 sur une fiche, dont 4 fiches vendues) ; elles occupent la
-- place Leboncoin de leurs fiches (publication refusée « déjà en ligne ») ; rien ne permet de dire « j'ai changé de
-- compte » ; 6 comptes FillSell ont vu deux comptes Leboncoin, 123 un seul (lecture du 16/11 vers 14 h).
-- LA RÈGLE (tous les comptes) :
--   1. FillSell suit UN compte Leboncoin par compte FillSell (public.comptes_plateforme_suivi, état 'suivi' | 'quitte').
--      Amorce : un compte FillSell dont tous les relevés complets lisent UN seul compte → ce compte est suivi (123) ;
--      plusieurs (6) → rien : la question. Ensuite, le premier compte lu par un relevé probant est suivi d'office
--      (constater_absences_releve) s'il n'y a ni compte suivi ni annonce vivante d'un autre compte.
--   2. Une annonce d'un compte non suivi (autre compte, compte quitté, ou n'importe quel compte connu tant que la
--      question est ouverte) n'est jamais importée ni rattachée (annonce_non_prouvee_vivante → moteur et
--      rapprocher_importer : aucun déploiement de fonction edge). Compte inconnu : la règle d'avant.
--   3. La question, lue par l'app : compte_plateforme_a_confirmer() (lecture seule, le compte de la session).
--   3 bis. (point 7 de Nico, 16/11 après-midi) Une annonce d'un compte QUITTÉ n'ouvre plus jamais « Vendue ? » : la porte
--      cross_post_jobs_alerte_tenue (déclencheur zz_alerte_tenue, celui qui reçoit l'écriture de la veille de
--      l'extension : PATCH sale_signal 'unavailable') clôt la tâche « ancien compte quitté, ce n'est pas une vente ».
--   4. Le geste : remplacer_compte_plateforme(p_platform, p_compte, p_simuler DEFAULT true) — le compte doit être celui du
--      DERNIER relevé complet ; simulation d'abord (rien écrit, le bilan rendu). Il clôt les annonces vivantes des
--      anciens comptes (disparu_le + compte_quitte_le ; JAMAIS retiree_le, jamais une fiche, jamais une vente), les
--      tâches publiées qui les désignent (« ancien compte quitté, ce n'est pas une vente » — leur question « Vendue ? »
--      ouverte est close avec elles, jamais une vente ni un retrait des copies), les republications pas encore
--      engagées sur elles, les retraits en attente sur elles (listés : « retire-la toi-même ») ; garde l'état d'avant
--      (comptes_plateforme_remplacements) ; puis l'ancien compte est 'quitte', le nouveau 'suivi'.
--      Jamais touchés : une tâche vendue ou porteuse d'un signal de vente ; une republication engagée (retrait fait ou en
--      cours), l'annonce qu'elle vise et les tâches de sa fiche (décision 7a, 31/10) ; un retrait lié à une fusion
--      « déjà vendu » (sa clôture défusionnerait des fiches : deja_vendu_retrait_echoue_defait) ; une annonce au compte
--      inconnu ; une fiche.
-- Les corps de prod (relus le 16/11 vers 14 h, garde md5 ci-dessous) ne perdent aucune ligne : les ajouts sont entre
-- marqueurs ⟦16/11 compte suivi⟧. Banc (Postgres jetable, schéma et fonctions de prod) : .tmp-terminal/p7m/banc.mjs.
-- Inverse : supabase/rollbacks/20261116200000_comptes_plateforme_remplacer_INVERSE.sql (corps de prod à l'octet, état des
-- annonces et des tâches restauré depuis la trace, tables et colonne retirées).
-- Appliquer (feu vert) : npx supabase db query --linked -f supabase/migrations/20261116200000_comptes_plateforme_remplacer.sql
--                        npx supabase migration repair --linked --status applied 20261116200000
-- Fins de ligne : les md5 « après » se comparent SANS retour chariot (md5(replace(def, chr(13), ''))) — le fichier peut
-- être extrait en CRLF par git (core.autocrlf) sans rien changer. Le corps de prod d'annonce_non_prouvee_vivante porte
-- lui-même des CRLF (appliqué ainsi le 14/11) : md5 brut 4ed8966c…, md5 sans CR 26953159… (celui de l'annexe).
BEGIN;
SET LOCAL statement_timeout = '120s';
SET LOCAL lock_timeout = '5s';

-- Les corps EN PROD relus le 16/11 (md5 de pg_get_functiondef) ; le second md5 est celui de CETTE migration (rejouée).
DO $verif$
DECLARE r record;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('public.annonce_non_prouvee_vivante(uuid,boolean)', '4ed8966c42915e390e9c282fbab7a258', 'bf79cd09cd13f5c024aff81e369c9c59'),
    ('public.constater_absences_releve(uuid)', '5fde069f0af7824eeb5936a06637d288', '16abc7aaede5d89486066737f5f1fff3'),
    ('public.veille_recentes_ouvrir(text,text[],text,text)', 'eaa5af6b6c82d7103dfd9b40d4a20d60', 'e9202262ae9b158177efd65b1c8f96c8'),
    ('public.cross_post_jobs_alerte_tenue()', '140a08f1b40d9278d1dc03f6df20a70e', '94f419b666e098b8e5dd25655d65efe6')) AS t(f, m, m_apres)
  LOOP
    IF md5(pg_get_functiondef(r.f::regprocedure)) <> r.m
       AND md5(replace(pg_get_functiondef(r.f::regprocedure), chr(13), '')) <> r.m_apres THEN
      RAISE EXCEPTION '% a changé en prod depuis sa lecture du 16/11 (md5 attendu %) : relire, reconstruire, jamais forcer', r.f, r.m;
    END IF;
  END LOOP;
END $verif$;

-- ── 1. Le registre des comptes suivis ────────────────────────────────────────────────────────────────────────────────
-- (Nom : PAS « comptes_plateforme » — une lettre de « comptes_plateformes », la table du site de chaque compte du 13/11.)
CREATE TABLE IF NOT EXISTS public.comptes_plateforme_suivi (
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  platform text NOT NULL CHECK (platform IN ('leboncoin')),          -- élargi quand Beebs / Depop liront leur compte (D8)
  compte text NOT NULL CHECK (compte ~ '^[A-Za-z0-9-]{3,80}$'),
  etat text NOT NULL CHECK (etat IN ('suivi', 'quitte')),
  decide_le timestamptz NOT NULL DEFAULT now(),
  decide_par text NOT NULL CHECK (decide_par IN ('amorce_1611', 'premier_releve', 'utilisateur', 'script')),
  quitte_le timestamptz,
  remplace_par text,
  PRIMARY KEY (user_id, platform, compte),
  CONSTRAINT comptes_plateforme_suivi_quitte_date CHECK ((etat = 'quitte') = (quitte_le IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS comptes_plateforme_suivi_un_seul ON public.comptes_plateforme_suivi (user_id, platform)
  WHERE etat = 'suivi';
COMMENT ON TABLE public.comptes_plateforme_suivi IS
  'Le compte de plateforme que FillSell SUIT (un par plateforme ; 16/11/2026, point 4). Écrit par l''amorce, le premier relevé probant (constater_absences_releve) et remplacer_compte_plateforme seulement.';
ALTER TABLE public.comptes_plateforme_suivi ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "comptes_plateforme_suivi lisibles par leur proprietaire" ON public.comptes_plateforme_suivi;
CREATE POLICY "comptes_plateforme_suivi lisibles par leur proprietaire" ON public.comptes_plateforme_suivi
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
-- droits : lecture par le propriétaire (l'app, sous sa session) ; écriture par le serveur seulement (RPC SECURITY DEFINER).
REVOKE ALL ON public.comptes_plateforme_suivi FROM anon, authenticated;
GRANT SELECT ON public.comptes_plateforme_suivi TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.comptes_plateforme_suivi TO service_role;

-- La trace de chaque remplacement : le bilan, et l'état d'AVANT de chaque ligne touchée (l'inverse le relit).
CREATE TABLE IF NOT EXISTS public.comptes_plateforme_remplacements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  platform text NOT NULL,
  anciens text[] NOT NULL,
  nouveau text NOT NULL,
  le timestamptz NOT NULL DEFAULT now(),
  par text NOT NULL CHECK (par IN ('utilisateur', 'script')),
  bilan jsonb NOT NULL,
  avant jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS comptes_plateforme_remplacements_user ON public.comptes_plateforme_remplacements (user_id, le DESC);
ALTER TABLE public.comptes_plateforme_remplacements ENABLE ROW LEVEL SECURITY;
-- droits : serveur seulement (comptes_plateforme_remplacements)
REVOKE ALL ON public.comptes_plateforme_remplacements FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.comptes_plateforme_remplacements TO service_role;

-- La date où FillSell a cessé de suivre l'annonce parce que son compte a été remplacé (NULL partout à l'application).
ALTER TABLE public.annonces_plateforme ADD COLUMN IF NOT EXISTS compte_quitte_le timestamptz;
COMMENT ON COLUMN public.annonces_plateforme.compte_quitte_le IS
  'Close par remplacer_compte_plateforme (ancien compte, pas une vente, rien retiré) — 16/11/2026. disparu_le porte la même date.';

-- ── 2. L'amorce (une fois) : un seul compte vu sur tous les relevés complets → suivi ; plusieurs → rien (la question) ─
INSERT INTO public.comptes_plateforme_suivi (user_id, platform, compte, etat, decide_par)
SELECT s.user_id, 'leboncoin', min(s.compte_plateforme), 'suivi', 'amorce_1611'
  FROM public.vinted_sync_runs s
 WHERE s.platform = 'leboncoin' AND s.kind = 'annonces' AND s.status = 'done'
   AND NULLIF(btrim(s.compte_plateforme), '') IS NOT NULL
   AND EXISTS (SELECT 1 FROM auth.users u WHERE u.id = s.user_id)
 GROUP BY s.user_id
HAVING count(DISTINCT s.compte_plateforme) = 1
   AND min(s.compte_plateforme) ~ '^[A-Za-z0-9-]{3,80}$'
   AND NOT EXISTS (SELECT 1 FROM public.annonces_plateforme a
                    WHERE a.user_id = s.user_id AND a.platform = 'leboncoin' AND a.disparu_le IS NULL
                      AND NULLIF(btrim(a.compte_plateforme), '') IS NOT NULL AND a.compte_plateforme <> min(s.compte_plateforme))
ON CONFLICT DO NOTHING;

-- ── 3. Le juge et le dernier relevé (internes, fermés aux clients) ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.compte_plateforme_juger(p_user uuid, p_platform text, p_compte text)
 RETURNS text
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_compte text := NULLIF(btrim(p_compte), ''); v_suivi text;
BEGIN
  -- NULL : rien à redire (compte inconnu, ou le compte suivi). Sinon le motif, lu par annonce_non_prouvee_vivante.
  IF v_compte IS NULL OR p_user IS NULL OR p_platform IS DISTINCT FROM 'leboncoin' THEN RETURN NULL; END IF;
  SELECT c.compte INTO v_suivi FROM comptes_plateforme_suivi c
   WHERE c.user_id = p_user AND c.platform = p_platform AND c.etat = 'suivi';
  IF v_suivi = v_compte THEN RETURN NULL; END IF;
  IF EXISTS (SELECT 1 FROM comptes_plateforme_suivi c
              WHERE c.user_id = p_user AND c.platform = p_platform AND c.compte = v_compte AND c.etat = 'quitte') THEN
    RETURN 'compte_quitte';
  END IF;
  IF v_suivi IS NOT NULL THEN RETURN 'autre_compte'; END IF;
  -- Aucun compte suivi : la question est ouverte dès qu'une annonce vivante d'un AUTRE compte connu existe.
  IF EXISTS (SELECT 1 FROM annonces_plateforme x
              WHERE x.user_id = p_user AND x.platform = p_platform AND x.disparu_le IS NULL
                AND NULLIF(btrim(x.compte_plateforme), '') IS NOT NULL AND x.compte_plateforme <> v_compte) THEN
    RETURN 'compte_a_confirmer';
  END IF;
  RETURN NULL;
END;
$function$;

CREATE OR REPLACE FUNCTION public.compte_plateforme_dernier_releve(p_user uuid, p_platform text)
 RETURNS TABLE (run_id uuid, compte text, fini_le timestamptz, lues integer, probant boolean)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  -- Le DERNIER relevé « annonces » terminé (« done ») dont le compte est connu, et s'il est probant (il a tout lu).
  SELECT s.id, s.compte_plateforme, s.finished_at, s.items_vus, releve_preuve_absence(s.id)
    FROM vinted_sync_runs s
   WHERE s.user_id = p_user AND s.platform = p_platform AND s.kind = 'annonces' AND s.status = 'done'
     AND NULLIF(btrim(s.compte_plateforme), '') IS NOT NULL
   ORDER BY s.started_at DESC NULLS LAST
   LIMIT 1
$function$;

-- ── 4. Les quatre corps de prod, complétés ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.annonce_non_prouvee_vivante(p_annonce uuid, p_auto boolean DEFAULT true)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE a annonces_plateforme%ROWTYPE;
  v_compte text;  -- ⟦16/11 compte suivi⟧
BEGIN
  -- (14/11/2026, demande 2 de Nico — 13e274de, fantômes de l'index Beebs) Une annonce n'est « prouvée vivante » que si
  -- sa dernière vue vient d'un relevé qui a LU la liste de la personne, et que FillSell ne l'a pas retirée depuis.
  -- Pour toutes les voies (p_auto = false : le geste de la personne) :
  --   disparue · relevé hors de la liste (releve_run_hors_liste) · vue seulement dans l'index (releve_run_index_seul) ·
  --   retrait demandé, en cours ou abouti DEPUIS la dernière vue (la règle de rapprochement_decider, 26/09) ;
  -- et pour la voie automatique (p_auto = true : le moteur) :
  --   déjà retirée par FillSell (retiree_le : retrait abouti, ou « déjà hors ligne » prouvé) — un numéro retiré qui
  --   « revient » est un fantôme d'index ou un retrait raté, jamais un article neuf ; la personne en décide.
  SELECT * INTO a FROM annonces_plateforme WHERE id = p_annonce;
  IF a.id IS NULL THEN RETURN 'introuvable'; END IF;
  IF a.disparu_le IS NOT NULL THEN RETURN 'disparue'; END IF;
  -- ⟦16/11 compte suivi — point 4, ayadi007 (D1-D3 de Nico)⟧ Leboncoin : une annonce d'un compte que FillSell ne suit pas
  -- n'est ni importée ni rattachée — ni par le moteur, ni par le geste de la personne : un autre compte que le compte
  -- suivi ('autre_compte'), un compte quitté ('compte_quitte'), ou, tant que la question « quel compte suivre ? » est
  -- ouverte (aucun compte suivi, deux comptes connus vivants), n'importe quel compte connu ('compte_a_confirmer').
  -- Compte inconnu (annonce d'avant l'extension 0.6.182) : la règle d'avant. Juge : compte_plateforme_juger.
  IF a.platform = 'leboncoin' THEN
    v_compte := compte_plateforme_juger(a.user_id, a.platform, a.compte_plateforme);
    IF v_compte IS NOT NULL THEN RETURN v_compte; END IF;
  END IF;
  -- ⟦16/11 fin⟧
  IF releve_run_hors_liste(a.run_id) THEN RETURN 'hors_liste'; END IF;
  IF releve_run_index_seul(a.run_id) THEN RETURN 'vue_seulement_dans_l_index'; END IF;
  IF EXISTS (SELECT 1 FROM cross_post_jobs d
              WHERE d.user_id = a.user_id AND d.platform = a.platform AND d.action = 'delete'
                AND d.status IN ('pending', 'processing', 'needs_user', 'deleted')
                AND d.created_at >= COALESCE(a.vu_le, a.created_at)
                AND listing_designe(a.listing_id, d.listing_url, d.platform_listing_id)) THEN
    RETURN 'retrait_demande';
  END IF;
  IF p_auto AND a.retiree_le IS NOT NULL THEN RETURN 'retiree_par_fillsell'; END IF;
  RETURN NULL;
END;
$function$;

CREATE OR REPLACE FUNCTION public.constater_absences_releve(p_run uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE r vinted_sync_runs%ROWTYPE; precedent vinted_sync_runs%ROWTYPE;
 a record; n integer:=0; debut timestamptz:=clock_timestamp();
 v_cand integer:=0; v_derniere timestamptz;
 v_compte text; v_autres integer:=0;  -- (08/11 soir, point 3 de Nico) le compte de la plateforme relevé
BEGIN
 IF NOT releve_preuve_absence(p_run) THEN RETURN jsonb_build_object('disparues',0,'motif','releve_non_probant'); END IF;
 SELECT * INTO r FROM vinted_sync_runs WHERE id=p_run;
 IF r.platform='beebs' THEN RETURN jsonb_build_object('disparues',0,'motif','moderation_beebs'); END IF;
 -- (08/11 soir, point 3 de Nico — ayadi007) LE COMPTE RELEVÉ EST CONNU (vinted_sync_runs.compte_plateforme, écrit par
 -- l'extension ≥ 0.6.182 : Leboncoin = le compte du jeton de la page). Deux relevés de comptes DIFFÉRENTS ne forment
 -- jamais une paire ; une annonce d'un AUTRE compte connu n'est jamais datée disparue par ce relevé (jamais « Vendue ? ») :
 -- elle n'est pas absente, elle est ailleurs. Compte inconnu (ancien poste, relevé par la page) : la règle d'avant, à l'octet.
 v_compte := NULLIF(btrim(r.compte_plateforme), '');
 -- ⟦16/11 compte suivi — point 4, ayadi007⟧ LE PREMIER COMPTE LEBONCOIN LU PAR UN RELEVÉ PROBANT EST RETENU « SUIVI » —
 -- seulement s'il n'y a encore aucun compte suivi ET aucune annonce vivante d'un AUTRE compte connu (sinon : la question
 -- « quel compte suivre ? », compte_plateforme_a_confirmer). Une écriture au plus, jamais une ligne existante réécrite
 -- (ON CONFLICT DO NOTHING) ; une erreur ici ne casse jamais le relevé (avertissement seul).
 IF r.platform = 'leboncoin' AND v_compte ~ '^[A-Za-z0-9-]{3,80}$' THEN
   BEGIN
     IF NOT EXISTS (SELECT 1 FROM comptes_plateforme_suivi c WHERE c.user_id=r.user_id AND c.platform=r.platform AND c.etat='suivi')
        AND NOT EXISTS (SELECT 1 FROM annonces_plateforme ap WHERE ap.user_id=r.user_id AND ap.platform=r.platform
                          AND ap.disparu_le IS NULL AND NULLIF(btrim(ap.compte_plateforme), '') IS NOT NULL
                          AND ap.compte_plateforme <> v_compte) THEN
       INSERT INTO comptes_plateforme_suivi (user_id, platform, compte, etat, decide_par)
       VALUES (r.user_id, r.platform, v_compte, 'suivi', 'premier_releve') ON CONFLICT DO NOTHING;
     END IF;
   EXCEPTION WHEN OTHERS THEN
     RAISE WARNING 'constater_absences_releve (run %) : compte suivi non noté : %', r.id, SQLERRM;
   END;
 END IF;
 -- ⟦16/11 fin⟧
 -- Deux cycles distincts, sans recouvrement, lus pour le même compte.
 SELECT s.* INTO precedent FROM
   (SELECT * FROM vinted_sync_runs WHERE user_id=r.user_id AND started_at<r.started_at
    ORDER BY started_at DESC LIMIT 50) s
 WHERE s.platform=r.platform AND s.kind=r.kind
   AND s.vinted_user_id IS NOT DISTINCT FROM r.vinted_user_id
   AND (v_compte IS NULL OR NULLIF(btrim(s.compte_plateforme), '') IS NULL OR s.compte_plateforme = v_compte)
   AND s.finished_at<=r.started_at AND s.started_at<=r.started_at-interval '5 minutes'
   AND releve_preuve_absence(s.id)
 ORDER BY s.started_at DESC LIMIT 1;
 IF precedent.id IS NULL THEN RETURN jsonb_build_object('disparues',0,'motif','second_releve_attendu'); END IF;
 -- (08/11 soir) Les annonces d'un AUTRE compte connu, non datées : comptées, tracées une fois par relevé, jamais datées.
 IF v_compte IS NOT NULL THEN
   SELECT count(*) INTO v_autres FROM annonces_plateforme ap
    WHERE ap.user_id=r.user_id AND ap.platform=r.platform AND ap.disparu_le IS NULL
      AND NULLIF(btrim(ap.compte_plateforme), '') IS NOT NULL AND ap.compte_plateforme <> v_compte;
   IF v_autres > 0 AND NOT EXISTS (SELECT 1 FROM usage_logs u WHERE u.user_id=r.user_id AND u.feature='releve_autre_compte'
                                     AND u.metadata->>'run'=r.id::text) THEN
     INSERT INTO usage_logs(user_id,feature,metadata) VALUES (r.user_id,'releve_autre_compte',
       jsonb_build_object('run',r.id,'platform',r.platform,'compte',v_compte,'annonces_autre_compte',v_autres));
   END IF;
 END IF;
 -- (08/11, ayadi007) UN COMPTE QUI A CHANGÉ (ou s'est vidé d'un coup) NE FAIT PAS UNE QUESTION PAR ANNONCE : au moins 5
 -- annonces que ni ce relevé ni le précédent n'ont revues, et AUCUNE annonce vue par eux n'était connue avant la dernière
 -- vue de celles-là (aucune continuité : les deux relevés lisent un autre ensemble — autre compte connecté dans Chrome,
 -- compte bloqué dont les annonces sont désactivées, tout republié d'un coup) → rien n'est daté disparu, aucun « Vendue ? »
 -- (le « Oui » d'une personne pressée retirerait ses copies ailleurs) ; une trace par relevé (usage_logs
 -- releve_compte_change), lue par l'exploitation. Une annonce revue plus tard lève tout ; sous 5, la règle d'avant.
 SELECT count(*), max(ap.vu_le) INTO v_cand, v_derniere FROM annonces_plateforme ap
  WHERE ap.user_id=r.user_id AND ap.platform=r.platform AND ap.disparu_le IS NULL
    AND ap.run_id IS DISTINCT FROM r.id AND ap.run_id IS DISTINCT FROM precedent.id
    AND ap.vu_le<precedent.started_at
    AND (v_compte IS NULL OR NULLIF(btrim(ap.compte_plateforme), '') IS NULL OR ap.compte_plateforme = v_compte);
 IF v_cand>=5 AND NOT EXISTS (SELECT 1 FROM annonces_plateforme x
      WHERE x.user_id=r.user_id AND x.platform=r.platform AND x.run_id IN (r.id, precedent.id) AND x.created_at<v_derniere) THEN
   IF NOT EXISTS (SELECT 1 FROM usage_logs u WHERE u.user_id=r.user_id AND u.feature='releve_compte_change'
                    AND u.metadata->>'run'=r.id::text) THEN
     INSERT INTO usage_logs(user_id,feature,metadata) VALUES (r.user_id,'releve_compte_change',
       jsonb_build_object('run',r.id,'premier',precedent.id,'platform',r.platform,'annonces_non_revues',v_cand,'derniere_vue',v_derniere));
   END IF;
   RETURN jsonb_build_object('disparues',0,'motif','compte_change_ou_vide','annonces_non_revues',v_cand,
     'derniere_vue',v_derniere,'premier',precedent.id,'second',r.id);
 END IF;
 FOR a IN
   SELECT ap.id,ap.listing_id,ap.inventaire_id,ap.vu_le FROM annonces_plateforme ap
   WHERE ap.user_id=r.user_id AND ap.platform=r.platform
     AND ap.run_id IS DISTINCT FROM r.id AND ap.run_id IS DISTINCT FROM precedent.id
     AND ap.vu_le<precedent.started_at
     -- (08/11 soir) jamais une annonce d'un AUTRE compte connu que celui relevé
     AND (v_compte IS NULL OR NULLIF(btrim(ap.compte_plateforme), '') IS NULL OR ap.compte_plateforme = v_compte)
     AND NOT EXISTS (SELECT 1 FROM cross_post_jobs recent WHERE recent.user_id=r.user_id
       AND recent.inventaire_id=ap.inventaire_id AND recent.platform=r.platform
       AND recent.action IN ('publish','republish') AND recent.status='published'
       AND COALESCE(recent.published_at,recent.created_at)>precedent.started_at-interval '4 hours'
       AND listing_designe(ap.listing_id,recent.listing_url,recent.platform_listing_id))
     AND NOT EXISTS (SELECT 1 FROM rapprochements q WHERE q.annonce_id=ap.id
       AND q.detail->>'absence_confirmee_revision'='20260928'
       AND (q.detail->>'derniere_vue')::timestamptz>=ap.vu_le)
     -- (22/10 soir, point 5) Un article en cours de republication n'est jamais compté disparu.
     AND public.republication_engagee(r.user_id, ap.inventaire_id, r.platform) IS NULL
     -- (31/10, décision 7a de Nico) …ni une annonce VISÉE par une republication engagée, quelle que soit sa fiche.
     AND public.republication_engagee_numero(r.user_id, r.platform, ap.listing_id) IS NULL
     -- (31/10, lot I point 6) …ni pendant qu'une remise en ligne « recréée » n'a pas encore été revue en ligne (72 h au plus).
     AND public.republication_recreee_non_confirmee(r.user_id, r.platform, ap.inventaire_id, ap.listing_id, ap.job_id) IS NULL
   ORDER BY ap.vu_le DESC,ap.id LIMIT 25 FOR UPDATE OF ap SKIP LOCKED
 LOOP
   EXIT WHEN clock_timestamp()-debut>interval '1 second';
   UPDATE annonces_plateforme SET disparu_le=COALESCE(disparu_le,r.finished_at),updated_at=now() WHERE id=a.id;
   -- Le signal existant ouvre la question de l'app. Ce n'est ni une vente,
   -- ni une annulation du dépôt historique, ni un retrait sur une plateforme.
   UPDATE cross_post_jobs j SET platform_fields=COALESCE(j.platform_fields,'{}'::jsonb)
     || jsonb_build_object('sale_signal','unavailable','unavailable_since',r.finished_at,
          'absence_releves',jsonb_build_object('premier',precedent.id,'second',r.id,'listing_id',a.listing_id,'le',now()))
   WHERE j.inventaire_id=a.inventaire_id AND j.user_id=r.user_id AND j.platform=r.platform
     AND j.status='published' AND j.action IN ('publish','republish')
     AND j.platform_fields->>'sale_signal' IS DISTINCT FROM 'sold'
     AND listing_designe(a.listing_id,j.listing_url,j.platform_listing_id);
   INSERT INTO rapprochements(user_id,annonce_id,inventaire_id,decision,par,score,detail)
   VALUES(r.user_id,a.id,a.inventaire_id,'aucune','auto',0,
     jsonb_build_object('absence_confirmee_revision','20260928','derniere_vue',a.vu_le,'premier',precedent.id,'second',r.id));
   n:=n+1;
 END LOOP;
 RETURN jsonb_build_object('disparues',n,'premier',precedent.id,'second',r.id)
   || CASE WHEN v_autres > 0 THEN jsonb_build_object('annonces_autre_compte',v_autres,'compte',v_compte) ELSE '{}'::jsonb END;
END;
$function$;

CREATE OR REPLACE FUNCTION public.veille_recentes_ouvrir(p_platform text, p_ids text[], p_compte text DEFAULT NULL::text, p_build text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_palier text;
  v_lues int := 0;
  v_inconnus text[] := '{}'::text[];
  v_connus jsonb := '{}'::jsonb;
  v_run uuid;
BEGIN
  IF v_user IS NULL THEN RETURN jsonb_build_object('ok', false, 'motif', 'session'); END IF;
  IF COALESCE((SELECT value FROM coin_config WHERE key = 'veille_recentes_ouverte'), 0) <> 1 THEN
    RETURN jsonb_build_object('ok', false, 'motif', 'fermee');
  END IF;
  IF p_platform IS NULL OR p_platform NOT IN ('vinted', 'leboncoin') THEN RETURN jsonb_build_object('ok', false, 'motif', 'plateforme'); END IF;
  v_palier := palier_de(v_user);
  IF v_palier IS NULL OR v_palier NOT IN ('premium', 'pro', 'business') THEN RETURN jsonb_build_object('ok', false, 'motif', 'palier'); END IF;
  IF plateforme_ecartee_pour(v_user, p_platform) THEN RETURN jsonb_build_object('ok', false, 'motif', 'ecartee'); END IF;
  IF EXISTS (SELECT 1 FROM pause_releves pr WHERE pr.user_id = v_user AND pr.leve_le IS NULL AND p_platform = ANY (pr.platforms)) THEN
    RETURN jsonb_build_object('ok', false, 'motif', 'pause_releves');
  END IF;
  IF p_platform = 'vinted' AND compte_en_pause_antirobot(v_user) THEN RETURN jsonb_build_object('ok', false, 'motif', 'pause_antirobot'); END IF;
  -- Vinted : la boutique lue doit être une boutique CONFIRMÉE du compte (jamais adoptée ici, jamais une question).
  IF p_platform = 'vinted' AND NOT COALESCE(boutique_vinted_confirmee(v_user, p_compte), false) THEN
    RETURN jsonb_build_object('ok', false, 'motif', 'boutique');
  END IF;
  -- Leboncoin : le compte lu doit être nommé, et celui du dernier relevé complet quand il est connu (règle du 08/11 : deux
  -- comptes ne se mélangent jamais) — un autre compte ouvert dans Chrome n'est jamais importé d'office.
  IF p_platform = 'leboncoin' AND (p_compte IS NULL OR p_compte !~ '^[A-Za-z0-9-]{3,80}$') THEN
    RETURN jsonb_build_object('ok', false, 'motif', 'compte_inconnu');
  END IF;
  -- ⟦16/11 compte suivi — point 4, ayadi007⟧ Quand FillSell suit un compte Leboncoin (comptes_plateforme_suivi), le compte
  -- lu doit être CELUI-LÀ : un autre compte ouvert dans Chrome n'ouvre jamais la veille. Sans compte suivi : la règle
  -- d'avant (ci-dessous, à l'octet), qui reste aussi vraie avec un compte suivi.
  IF p_platform = 'leboncoin' AND EXISTS (SELECT 1 FROM comptes_plateforme_suivi c
                                           WHERE c.user_id = v_user AND c.platform = 'leboncoin' AND c.etat = 'suivi'
                                             AND c.compte IS DISTINCT FROM p_compte) THEN
    RETURN jsonb_build_object('ok', false, 'motif', 'compte_change');
  END IF;
  -- ⟦16/11 fin⟧
  IF p_platform = 'leboncoin' AND EXISTS (
       SELECT 1 FROM (SELECT s.compte_plateforme FROM vinted_sync_runs s
                       WHERE s.user_id = v_user AND s.kind = 'annonces' AND s.platform = 'leboncoin' AND s.status = 'done'
                         AND s.compte_plateforme IS NOT NULL
                       ORDER BY s.started_at DESC NULLS LAST LIMIT 1) d
        WHERE d.compte_plateforme IS DISTINCT FROM p_compte) THEN
    RETURN jsonb_build_object('ok', false, 'motif', 'compte_change');
  END IF;
  -- Un passage 'recentes' FIGÉ (service worker tué en route) ne retient jamais le suivant : clos, rien conclu.
  UPDATE vinted_sync_runs SET status = 'expired', finished_at = now(), updated_at = now(),
         erreur = '[veille_recentes] passage interrompu (aucune nouvelle de l''extension depuis 10 min) — rien conclu'
   WHERE user_id = v_user AND kind = 'recentes' AND platform = p_platform AND status IN ('queued', 'running')
     AND COALESCE(progres_le, updated_at, started_at) < now() - interval '10 minutes';
  -- Un relevé de la plateforme en cours ou en file : c'est lui qui lira (jamais deux lectures ensemble).
  IF EXISTS (SELECT 1 FROM vinted_sync_runs s
              WHERE s.user_id = v_user AND s.status IN ('queued', 'running')
                AND ((p_platform = 'vinted' AND s.kind = 'dressing') OR (s.kind IN ('annonces', 'recentes') AND s.platform = p_platform))) THEN
    RETURN jsonb_build_object('ok', false, 'motif', 'releve_en_cours');
  END IF;
  -- Une republication engagée (retrait fait, recréation à venir ou en vol) : sa copie ne s'importe jamais à sa place.
  IF republication_entre_retrait_et_recreation(v_user, p_platform) IS NOT NULL
     OR EXISTS (SELECT 1 FROM cross_post_jobs j
                 WHERE j.user_id = v_user AND j.platform = p_platform AND j.action = 'republish'
                   AND j.status IN ('pending', 'processing', 'needs_user')
                   AND j.platform_fields ->> 'republish_step' = 'deleted') THEN
    RETURN jsonb_build_object('ok', false, 'motif', 'republication');
  END IF;
  -- Une tâche de la plateforme en cours (dépôt dont le numéro n'est pas encore rendu) : on attend le passage suivant.
  IF EXISTS (SELECT 1 FROM cross_post_jobs j WHERE j.user_id = v_user AND j.platform = p_platform AND j.status = 'processing') THEN
    RETURN jsonb_build_object('ok', false, 'motif', 'tache_en_cours');
  END IF;

  -- Un seul tri (mesuré en prod le 13/11 sur le compte le plus chargé, 100 numéros Leboncoin : 70 ms, lecture seule).
  WITH t AS MATERIALIZED (SELECT * FROM veille_recentes_trier(v_user, p_platform, p_ids))
  SELECT (SELECT count(*)::int FROM t),
         COALESCE((SELECT array_agg(t.listing_id ORDER BY t.listing_id) FROM t WHERE t.connu IS NULL), '{}'::text[]),
         COALESCE((SELECT jsonb_object_agg(x.connu, x.n) FROM (SELECT t.connu, count(*) n FROM t WHERE t.connu IS NOT NULL GROUP BY 1) x), '{}'::jsonb)
    INTO v_lues, v_inconnus, v_connus;

  IF cardinality(v_inconnus) = 0 THEN
    RETURN jsonb_build_object('ok', true, 'lues', v_lues, 'inconnus', '[]'::jsonb, 'connus', v_connus);
  END IF;

  BEGIN
    INSERT INTO vinted_sync_runs (user_id, kind, platform, status, declencheur, extension_build, items_vus, total_entries,
                                  compte_plateforme, started_at, claimed_at, updated_at)
    VALUES (v_user, 'recentes', p_platform, 'running', 'veille:recentes', left(p_build, 120), v_lues, cardinality(v_inconnus),
            CASE WHEN p_platform = 'leboncoin' AND p_compte ~ '^[A-Za-z0-9-]{3,80}$' THEN p_compte END, now(), now(), now())
    RETURNING id INTO v_run;
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('ok', false, 'motif', 'releve_en_cours');
  END;
  IF v_run IS NULL THEN RETURN jsonb_build_object('ok', false, 'motif', 'garde'); END IF;   -- un déclencheur l'a écarté
  RETURN jsonb_build_object('ok', true, 'lues', v_lues, 'inconnus', to_jsonb(v_inconnus), 'connus', v_connus, 'run_id', v_run);
END;
$function$;

CREATE OR REPLACE FUNCTION public.cross_post_jobs_alerte_tenue()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_constat boolean;
  v_rep uuid;
  v_suiv record;
  v_jum record;
  v_retire text[] := array['unavailable_since', 'sale_signal', 'unavailable_pending_since', 'detected_price'];
  v_nom text;
  v_quitte record;  -- ⟦16/11 compte suivi⟧
begin
  if coalesce(current_setting('fillsell.restauration', true), '') = 'on' then return new; end if;
  if not (coalesce(new.platform_fields, '{}'::jsonb) ? 'unavailable_since')
     or coalesce(old.platform_fields, '{}'::jsonb) ? 'unavailable_since'
     or coalesce(new.platform_fields ->> 'sale_signal', 'unavailable') <> 'unavailable'
     or new.status is distinct from 'published'
     or coalesce(new.action, 'publish') not in ('publish', 'republish')
     or new.inventaire_id is null then
    return new;
  end if;
  v_nom := case new.platform when 'leboncoin' then 'Leboncoin' when 'beebs' then 'Beebs' when 'ebay' then 'eBay'
                             when 'depop' then 'Depop' when 'vinted' then 'Vinted' when 'opla' then 'Opla' else new.platform end;
  -- Le constat de deux relevés complets (constater_absences_releve) pose absence_releves dans la même écriture.
  v_constat := new.platform_fields ? 'absence_releves'
               and (new.platform_fields -> 'absence_releves') is distinct from (coalesce(old.platform_fields, '{}'::jsonb) -> 'absence_releves');

  -- (1) En cours de republication.
  -- (31/10, décision 7a de Nico) …par sa fiche, ou par le NUMÉRO de l'annonce (rattachée à une autre fiche).
  v_rep := coalesce(public.republication_engagee(new.user_id, new.inventaire_id, new.platform),
                    public.republication_engagee_numero(new.user_id, new.platform, public.annonce_id_de_job(new.platform_listing_id, new.listing_url)));
  if v_rep is not null and v_rep <> new.id then
    new.platform_fields := (new.platform_fields - v_retire - 'absence_releves')
      || jsonb_build_object('alerte_ecartee', jsonb_build_object('le', now(), 'motif', 'republication_en_cours',
           'republication', v_rep, 'constat', v_constat));
    return new;
  end if;

  -- (1 bis) (31/10, lot I point 6 — Johan, 29/10) Une remise en ligne « recréée » pas encore revue en ligne par un relevé
  -- (72 h au plus) : ni sa NOUVELLE annonce (ce job lui-même), ni une autre annonce de la fiche ne reçoit « Vendue ? ».
  v_rep := public.republication_recreee_non_confirmee(new.user_id, new.platform, new.inventaire_id,
             public.annonce_id_de_job(new.platform_listing_id, new.listing_url), new.id);
  if v_rep is not null then
    new.platform_fields := (new.platform_fields - v_retire - 'absence_releves')
      || jsonb_build_object('alerte_ecartee', jsonb_build_object('le', now(), 'motif', 'recreation_non_confirmee',
           'republication', v_rep, 'constat', v_constat));
    return new;
  end if;

  -- ⟦16/11 compte suivi — point 7 de Nico, ayadi007⟧ (0) L'annonce est sur un compte de la plateforme que la personne a
  -- QUITTÉ (« remplacer mon compte », comptes_plateforme_suivi) : sa page hors ligne ne dit rien d'une vente (compte
  -- bloqué ou abandonné, annonces désactivées). La question « Vendue ? » ne s'ouvre jamais : la tâche est close
  -- « ancien compte quitté, ce n'est pas une vente » — jamais une vente, jamais un retrait des copies. Après les gardes
  -- de republication (1) et (1 bis), qui gardent leur priorité (décision 7a du 31/10).
  select a.compte_plateforme, c.quitte_le into v_quitte
    from public.annonces_plateforme a
    join public.comptes_plateforme_suivi c
      on c.user_id = a.user_id and c.platform = a.platform and c.compte = a.compte_plateforme and c.etat = 'quitte'
   where a.user_id = new.user_id and a.platform = new.platform
     and a.listing_id = public.annonce_id_de_job(new.platform_listing_id, new.listing_url)
   limit 1;
  if v_quitte.compte_plateforme is not null then
    new.platform_fields := (new.platform_fields - v_retire - 'absence_releves')
      || jsonb_build_object('compte_quitte', jsonb_build_object('le', now(), 'ancien', v_quitte.compte_plateforme,
           'par', 'alerte_tenue', 'statut_avant', old.status, 'signal_ecarte', new.platform_fields ->> 'sale_signal'));
    new.status := 'cancelled';
    new.error := 'Ancien compte ' || v_nom || ' quitté'
      || coalesce(' le ' || to_char(v_quitte.quitte_le at time zone 'Europe/Paris', 'DD/MM'), '')
      || ', ce n''est pas une vente : FillSell ne suit plus cette annonce et n''a rien retiré.';
    return new;
  end if;
  -- ⟦16/11 fin⟧
  -- (1b) Remplacé par sa propre republication.
  select r.id, btrim(r.platform_listing_id) as annonce into v_suiv
    from public.cross_post_jobs r
   where r.user_id = new.user_id and r.inventaire_id = new.inventaire_id and r.platform = new.platform
     and r.action = 'republish' and r.status = 'published' and r.id <> new.id
     and r.platform_fields ->> 'republish_source_job_id' = new.id::text
     and nullif(btrim(coalesce(r.platform_listing_id, '')), '') is not null
     and btrim(r.platform_listing_id) is distinct from nullif(btrim(coalesce(new.platform_listing_id, '')), '')
   order by r.created_at desc limit 1;
  if v_suiv.id is not null then
    new.platform_fields := (new.platform_fields - v_retire - 'absence_releves')
      || jsonb_build_object('republished_pending', true,
           'remplacee_par_republication', jsonb_build_object('le', now(), 'job', v_suiv.id, 'annonce', v_suiv.annonce));
    new.status := 'cancelled';
    new.error := 'Annonce remplacée par sa republication (nouvelle annonce ' || v_suiv.annonce || ') — ce n''est pas une vente.';
    return new;
  end if;

  -- (3) Boutique partagée : la fiche jumelle du compte relié est en ligne sur cette plateforme.
  if new.platform <> 'vinted' then
    select o.listing_id, o.compte into v_jum
      from public.jumelle_occupe_plateformes(new.user_id, new.inventaire_id) o
     where o.platform = new.platform and o.statut in ('en_ligne', 'en_verification', 'published')
       and o.listing_id is distinct from nullif(btrim(coalesce(new.platform_listing_id, '')), '')
     limit 1;
    if v_jum.listing_id is not null then
      if v_constat then
        new.platform_fields := (new.platform_fields - v_retire)
          || jsonb_build_object('copie_remplacee_par_compte_relie', jsonb_build_object('le', now(),
               'annonce', v_jum.listing_id, 'compte', v_jum.compte));
        new.status := 'cancelled';
        new.error := 'Cette annonce ' || v_nom || ' n''est plus en ligne ; ton article reste en vente sur ' || v_nom
          || ' sous l''annonce ' || v_jum.listing_id || ' de ton compte FillSell relié (même boutique). Rien à refaire.';
      else
        new.platform_fields := (new.platform_fields - array['unavailable_since', 'sale_signal', 'detected_price'])
          || jsonb_build_object('unavailable_pending_since', new.platform_fields ->> 'unavailable_since',
               'alerte_a_confirmer_par_releve', jsonb_build_object('le', now(), 'motif', 'jumelle_en_ligne',
                 'annonce', v_jum.listing_id));
      end if;
      return new;
    end if;
  end if;

  -- (2) Alerte de la veille déjà démentie par un relevé sur cette annonce.
  if not v_constat and new.platform <> 'vinted'
     and coalesce(old.platform_fields, '{}'::jsonb) ? 'revue_en_ligne_par_releve' then
    new.platform_fields := (new.platform_fields - array['unavailable_since', 'sale_signal', 'detected_price'])
      || jsonb_build_object('unavailable_pending_since', new.platform_fields ->> 'unavailable_since',
           'alerte_a_confirmer_par_releve', jsonb_build_object('le', now(), 'motif', 'dementie_par_releve',
             'dementie_le', old.platform_fields #>> '{revue_en_ligne_par_releve,at}'));
    return new;
  end if;
  return new;
exception when others then
  raise warning 'cross_post_jobs_alerte_tenue : job % : % — écriture inchangée', new.id, sqlerrm;
  return new;
end $function$;

-- ── 5. Le geste : remplacer le compte suivi (simulation d'abord) ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.remplacer_compte_plateforme_pour(p_user uuid, p_platform text, p_compte text,
  p_simuler boolean DEFAULT true, p_par text DEFAULT 'utilisateur')
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_compte text := NULLIF(btrim(p_compte), '');
  v_now timestamptz := now();
  v_jour text := to_char(now() AT TIME ZONE 'Europe/Paris', 'DD/MM');
  d record;
  v_suivi text;
  v_anciens text[];
  v_annonces uuid[]; v_annonces_engagees uuid[];
  v_taches uuid[]; v_ventes uuid[]; v_reps uuid[]; v_reps_engagees uuid[]; v_retraits uuid[]; v_retraits_laisses uuid[];
  v_bilan jsonb; v_avant jsonb; v_id uuid;
  n_annonces int := 0; n_taches int := 0; n_reps int := 0; n_retraits int := 0;
  v_msg_tache text; v_msg_rep text; v_msg_retrait text;
BEGIN
  -- L'identité se vérifie ICI (règle du 20/10) : sous une session, seulement SON compte ; serveur et SQL libres.
  IF auth.role() IS NOT NULL AND auth.role() <> 'service_role' AND p_user IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'remplacer_compte_plateforme : ce compte n''est pas le tien' USING ERRCODE = '42501';
  END IF;
  IF p_user IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'motif', 'session', 'message', 'Reconnecte-toi à FillSell, puis réessaie.');
  END IF;
  IF p_platform IS DISTINCT FROM 'leboncoin' THEN
    RETURN jsonb_build_object('ok', false, 'motif', 'plateforme',
      'message', 'FillSell ne sait remplacer que ton compte Leboncoin pour l''instant.');
  END IF;
  IF v_compte IS NULL OR v_compte !~ '^[A-Za-z0-9-]{3,80}$' THEN
    RETURN jsonb_build_object('ok', false, 'motif', 'compte_invalide',
      'message', 'Ce compte Leboncoin n''est pas reconnu : lance « Synchroniser » depuis ton ordinateur, puis réessaie.');
  END IF;
  IF p_par IS NULL OR p_par NOT IN ('utilisateur', 'script') THEN
    RETURN jsonb_build_object('ok', false, 'motif', 'par');
  END IF;
  IF NOT p_simuler THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('remplacer_compte_plateforme:' || p_user::text || ':' || p_platform, 0));
  END IF;

  -- Le compte doit être celui du DERNIER relevé complet (jamais un texte saisi, jamais un relevé partiel).
  SELECT * INTO d FROM compte_plateforme_dernier_releve(p_user, p_platform);
  IF d.run_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'motif', 'aucun_releve',
      'message', 'Aucun relevé de tes annonces Leboncoin n''a encore lu de compte : lance « Synchroniser » depuis ton ordinateur, puis réessaie.');
  END IF;
  IF d.compte IS DISTINCT FROM v_compte THEN
    RETURN jsonb_build_object('ok', false, 'motif', 'pas_le_dernier_releve', 'compte_lu', d.compte, 'releve_le', d.fini_le,
      'message', 'Ce n''est pas le compte Leboncoin que ton ordinateur a lu en dernier : FillSell ne peut suivre que le compte connecté. Lance « Synchroniser », puis réessaie.');
  END IF;
  IF NOT COALESCE(d.probant, false) THEN
    RETURN jsonb_build_object('ok', false, 'motif', 'releve_incomplet', 'releve', d.run_id,
      'message', 'Le dernier relevé de tes annonces Leboncoin n''a pas tout lu : lance « Synchroniser », puis réessaie.');
  END IF;
  IF EXISTS (SELECT 1 FROM vinted_sync_runs s WHERE s.user_id = p_user AND s.platform = p_platform
               AND s.kind IN ('annonces', 'recentes') AND s.status IN ('queued', 'running')) THEN
    RETURN jsonb_build_object('ok', false, 'motif', 'releve_en_cours',
      'message', 'Un relevé de tes annonces Leboncoin est en cours : réessaie quand il sera fini.');
  END IF;
  IF EXISTS (SELECT 1 FROM cross_post_jobs j WHERE j.user_id = p_user AND j.platform = p_platform AND j.status = 'processing') THEN
    RETURN jsonb_build_object('ok', false, 'motif', 'tache_en_cours',
      'message', 'FillSell travaille en ce moment sur une tâche Leboncoin : réessaie quand elle sera finie.');
  END IF;

  SELECT c.compte INTO v_suivi FROM comptes_plateforme_suivi c
   WHERE c.user_id = p_user AND c.platform = p_platform AND c.etat = 'suivi';

  -- Une republication ENGAGÉE (retrait fait ou en cours : étape 'deleted' et au-delà, ou retrait engagé) va au bout :
  -- ni elle, ni l'annonce qu'elle vise, ni les tâches de sa fiche ne sont touchées (décision 7a de Nico, 31/10 : « tant
  -- qu'une republication est engagée, l'ancienne annonce n'est jamais datée disparue »). Une republication à l'étape
  -- 'a_capturer' ou 'captured' n'a rien retiré sur la plateforme : elle est close plus bas.
  SELECT COALESCE(array_agg(j.id), '{}') INTO v_reps_engagees
    FROM cross_post_jobs j
   WHERE j.user_id = p_user AND j.platform = p_platform AND j.action = 'republish' AND j.status IN ('pending', 'processing', 'needs_user')
     AND (COALESCE(j.platform_fields ->> 'republish_step', '') NOT IN ('', 'a_capturer', 'captured')
          OR republication_retrait_engage(j.platform_fields));
  -- Les annonces vivantes des AUTRES comptes connus (compte inconnu : jamais touchées ici).
  SELECT COALESCE(array_agg(a.id ORDER BY a.listing_id) FILTER (WHERE NOT x.engagee), '{}'),
         COALESCE(array_agg(a.id ORDER BY a.listing_id) FILTER (WHERE x.engagee), '{}')
    INTO v_annonces, v_annonces_engagees
    FROM annonces_plateforme a
    CROSS JOIN LATERAL (SELECT EXISTS (
            SELECT 1 FROM cross_post_jobs j WHERE j.id = ANY (v_reps_engagees)
               AND (j.inventaire_id = a.inventaire_id
                    OR a.listing_id IN (NULLIF(btrim(j.platform_listing_id), ''),
                                        NULLIF(btrim(j.platform_fields ->> 'old_platform_listing_id'), ''),
                                        NULLIF(btrim(j.platform_fields #>> '{republish_snapshot,platform_listing_id}'), ''),
                                        annonce_id_de_job(j.platform_listing_id, j.listing_url)))) AS engagee) x
   WHERE a.user_id = p_user AND a.platform = p_platform AND a.disparu_le IS NULL
     AND NULLIF(btrim(a.compte_plateforme), '') IS NOT NULL AND a.compte_plateforme <> v_compte;
  SELECT COALESCE(array_agg(DISTINCT x.c ORDER BY x.c), '{}') INTO v_anciens
    FROM (SELECT a.compte_plateforme AS c FROM annonces_plateforme a WHERE a.id = ANY (v_annonces || v_annonces_engagees)
          UNION SELECT v_suivi WHERE v_suivi IS NOT NULL AND v_suivi <> v_compte) x;

  IF v_suivi = v_compte AND cardinality(v_annonces) = 0 THEN
    RETURN jsonb_build_object('ok', true, 'deja', true, 'simulation', p_simuler, 'platform', p_platform, 'compte_suivi', v_compte,
      'message', 'FillSell suit déjà ce compte Leboncoin.');
  END IF;

  -- Les tâches qui désignent ces annonces.
  WITH anc AS (SELECT a.listing_id FROM annonces_plateforme a WHERE a.id = ANY (v_annonces)),
  tj AS (SELECT j.id, j.action, j.status, j.platform_fields AS pf,
               EXISTS (SELECT 1 FROM anc WHERE listing_designe(anc.listing_id, j.listing_url, j.platform_listing_id)) AS designe,
               EXISTS (SELECT 1 FROM anc WHERE anc.listing_id IN (
                         NULLIF(btrim(j.platform_listing_id), ''),
                         NULLIF(btrim(j.platform_fields ->> 'old_platform_listing_id'), ''),
                         NULLIF(btrim(j.platform_fields #>> '{republish_snapshot,platform_listing_id}'), ''),
                         annonce_id_de_job(j.platform_listing_id, j.listing_url))) AS vise
          FROM cross_post_jobs j
         WHERE j.user_id = p_user AND j.platform = p_platform AND j.status IN ('published', 'pending', 'needs_user', 'failed'))
  SELECT COALESCE(array_agg(j.id) FILTER (WHERE j.designe AND j.status = 'published' AND COALESCE(j.action, 'publish') IN ('publish', 'republish')
                                            AND (j.pf ->> 'sale_signal') IS DISTINCT FROM 'sold'), '{}'),
         COALESCE(array_agg(j.id) FILTER (WHERE j.designe AND j.status = 'published' AND COALESCE(j.action, 'publish') IN ('publish', 'republish')
                                            AND (j.pf ->> 'sale_signal') = 'sold'), '{}'),
         COALESCE(array_agg(j.id) FILTER (WHERE j.vise AND j.action = 'republish' AND j.status IN ('pending', 'needs_user')
                                            AND COALESCE(j.pf ->> 'republish_step', '') IN ('', 'a_capturer', 'captured')
                                            AND NOT republication_retrait_engage(j.pf)), '{}'),
         COALESCE(array_agg(j.id) FILTER (WHERE j.designe AND j.action = 'delete' AND j.status IN ('pending', 'needs_user', 'failed')
                                            AND NOT EXISTS (SELECT 1 FROM inventaire_doublons q
                                                             WHERE q.user_id = p_user AND q.statut = 'fusionnee' AND q.fusion_id IS NOT NULL
                                                               AND q.preuves ? 'retraits_oui' AND (q.preuves -> 'retraits_oui') ? j.id::text)), '{}'),
         COALESCE(array_agg(j.id) FILTER (WHERE j.designe AND j.action = 'delete' AND j.status IN ('pending', 'needs_user', 'failed')
                                            AND EXISTS (SELECT 1 FROM inventaire_doublons q
                                                         WHERE q.user_id = p_user AND q.statut = 'fusionnee' AND q.fusion_id IS NOT NULL
                                                           AND q.preuves ? 'retraits_oui' AND (q.preuves -> 'retraits_oui') ? j.id::text)), '{}')
    INTO v_taches, v_ventes, v_reps, v_retraits, v_retraits_laisses
    FROM tj j;

  v_bilan := jsonb_build_object(
    'platform', p_platform, 'nouveau', v_compte, 'compte_suivi_avant', v_suivi, 'anciens', to_jsonb(v_anciens),
    'releve', jsonb_build_object('run', d.run_id, 'le', d.fini_le, 'annonces_lues', d.lues),
    'annonces', cardinality(v_annonces),
    'annonces_sur_fiche', (SELECT count(*) FROM annonces_plateforme a WHERE a.id = ANY (v_annonces) AND a.inventaire_id IS NOT NULL),
    'fiches_au_stock', (SELECT count(DISTINCT a.inventaire_id) FROM annonces_plateforme a JOIN inventaire i ON i.id = a.inventaire_id
                         WHERE a.id = ANY (v_annonces) AND i.statut = 'stock' AND i.fusionne_dans IS NULL AND NOT article_vendu(i.id)),
    -- Celles dont la place Leboncoin se libère (plus aucune tâche publiée ni en file après la clôture).
    'fiches_liberees', (SELECT count(DISTINCT a.inventaire_id) FROM annonces_plateforme a JOIN inventaire i ON i.id = a.inventaire_id
                         WHERE a.id = ANY (v_annonces) AND i.statut = 'stock' AND i.fusionne_dans IS NULL AND NOT article_vendu(i.id)
                           AND NOT EXISTS (SELECT 1 FROM cross_post_jobs c
                                            WHERE c.user_id = p_user AND c.inventaire_id = a.inventaire_id AND c.platform = p_platform
                                              AND COALESCE(c.action, 'publish') <> 'delete'
                                              AND c.status IN ('published', 'pending', 'processing', 'needs_user')
                                              AND NOT (c.id = ANY (v_taches || v_reps)))),
    'objets_vendus_encore_en_ligne', COALESCE((SELECT jsonb_agg(jsonb_build_object('fiche', a.inventaire_id, 'titre', i.titre,
                                                  'numero', a.listing_id, 'lien', a.url, 'compte', a.compte_plateforme, 'vue_le', a.vu_le)
                                                  ORDER BY a.listing_id)
                                                FROM annonces_plateforme a JOIN inventaire i ON i.id = a.inventaire_id
                                               WHERE a.id = ANY (v_annonces) AND article_vendu(i.id)), '[]'::jsonb),
    'annonces_compte_inconnu_non_touchees', (SELECT count(*) FROM annonces_plateforme a
                                             WHERE a.user_id = p_user AND a.platform = p_platform AND a.disparu_le IS NULL
                                               AND NULLIF(btrim(a.compte_plateforme), '') IS NULL),
    'taches_publiees', cardinality(v_taches),
    -- Les questions « Vendue ? » ouvertes (deux lectures hors ligne) et les premières lectures, closes avec leur tâche.
    'questions_vendue', (SELECT count(*) FROM cross_post_jobs j WHERE j.id = ANY (v_taches) AND j.platform_fields ->> 'sale_signal' = 'unavailable'),
    'premieres_lectures_hors_ligne', (SELECT count(*) FROM cross_post_jobs j WHERE j.id = ANY (v_taches)
                                       AND j.platform_fields ? 'unavailable_pending_since' AND NOT (j.platform_fields ? 'unavailable_since')),
    'taches_vente_en_attente_laissees', COALESCE((SELECT jsonb_agg(jsonb_build_object('tache', j.id, 'fiche', j.inventaire_id, 'titre', i.titre,
                                                     'numero', annonce_id_de_job(j.platform_listing_id, j.listing_url)))
                                                   FROM cross_post_jobs j LEFT JOIN inventaire i ON i.id = j.inventaire_id
                                                  WHERE j.id = ANY (v_ventes)), '[]'::jsonb),
    'republications', cardinality(v_reps),
    'annonces_republication_engagee_laissees', COALESCE((SELECT jsonb_agg(jsonb_build_object('numero', a.listing_id, 'fiche', a.inventaire_id)
                                                           ORDER BY a.listing_id)
                                                         FROM annonces_plateforme a WHERE a.id = ANY (v_annonces_engagees)), '[]'::jsonb),
    'republications_engagees_laissees', COALESCE((SELECT jsonb_agg(jsonb_build_object('tache', j.id, 'fiche', j.inventaire_id,
                                                     'etape', j.platform_fields ->> 'republish_step'))
                                                   FROM cross_post_jobs j WHERE j.id = ANY (v_reps_engagees)
                                                    AND EXISTS (SELECT 1 FROM annonces_plateforme a WHERE a.id = ANY (v_annonces_engagees)
                                                                  AND (a.inventaire_id = j.inventaire_id
                                                                       OR a.listing_id IN (NULLIF(btrim(j.platform_listing_id), ''),
                                                                                           NULLIF(btrim(j.platform_fields ->> 'old_platform_listing_id'), ''))))), '[]'::jsonb),
    'retraits', COALESCE((SELECT jsonb_agg(jsonb_build_object('tache', j.id, 'fiche', j.inventaire_id, 'titre', i.titre, 'statut', j.status,
                             'numero', annonce_id_de_job(j.platform_listing_id, j.listing_url), 'lien', j.listing_url))
                           FROM cross_post_jobs j LEFT JOIN inventaire i ON i.id = j.inventaire_id WHERE j.id = ANY (v_retraits)), '[]'::jsonb),
    'retraits_laisses', COALESCE((SELECT jsonb_agg(jsonb_build_object('tache', j.id, 'fiche', j.inventaire_id, 'statut', j.status,
                                     'numero', annonce_id_de_job(j.platform_listing_id, j.listing_url), 'motif', 'fusion_deja_vendu'))
                                   FROM cross_post_jobs j WHERE j.id = ANY (v_retraits_laisses)), '[]'::jsonb));

  IF p_simuler THEN
    RETURN jsonb_build_object('ok', true, 'simulation', true) || v_bilan;
  END IF;

  -- ── L'écriture (une transaction ; l'état d'avant d'abord) ──
  v_avant := jsonb_build_object(
    'annonces', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', a.id, 'disparu_le', a.disparu_le,
                            'compte_quitte_le', a.compte_quitte_le, 'updated_at', a.updated_at))
                          FROM annonces_plateforme a WHERE a.id = ANY (v_annonces)), '[]'::jsonb),
    'taches', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', j.id, 'status', j.status, 'error', j.error,
                          'platform_fields', j.platform_fields, 'reservation_settled_at', j.reservation_settled_at))
                        FROM cross_post_jobs j WHERE j.id = ANY (v_taches || v_reps || v_retraits)), '[]'::jsonb),
    'registre', COALESCE((SELECT jsonb_agg(to_jsonb(c)) FROM comptes_plateforme_suivi c
                          WHERE c.user_id = p_user AND c.platform = p_platform), '[]'::jsonb));
  INSERT INTO comptes_plateforme_remplacements (user_id, platform, anciens, nouveau, le, par, bilan, avant)
  VALUES (p_user, p_platform, v_anciens, v_compte, v_now, p_par, v_bilan, v_avant)
  RETURNING id INTO v_id;

  v_msg_tache := 'Ancien compte Leboncoin quitté le ' || v_jour
              || ', ce n''est pas une vente : FillSell ne suit plus cette annonce et n''a rien retiré.';
  v_msg_rep := 'Republication arrêtée : l''annonce est sur ton ancien compte Leboncoin, que FillSell ne suit plus depuis le '
            || v_jour || '. Ce n''est pas une vente.';
  v_msg_retrait := 'FillSell ne peut plus retirer cette annonce : elle est sur ton ancien compte Leboncoin. '
                || 'Si ce compte est encore ouvert, retire-la toi-même.';

  -- a. Les annonces : closes, jamais « retirées » (retiree_le), jamais déliées de leur fiche.
  UPDATE annonces_plateforme a SET disparu_le = v_now, compte_quitte_le = v_now, updated_at = v_now
   WHERE a.id = ANY (v_annonces) AND a.disparu_le IS NULL AND a.compte_plateforme <> v_compte;
  GET DIAGNOSTICS n_annonces = ROW_COUNT;
  -- b. Les tâches publiées qui les désignent (jamais une tâche vendue ni porteuse d'un signal de vente). Leur question
  --    « Vendue ? » (sale_signal 'unavailable', ou première lecture hors ligne) est close avec elles : le signal part
  --    (gardé dans compte_quitte.signal_avant), jamais une vente, jamais un retrait des copies.
  UPDATE cross_post_jobs j SET status = 'cancelled', error = v_msg_tache,
         platform_fields = (COALESCE(j.platform_fields, '{}'::jsonb)
                              - ARRAY['unavailable_since', 'sale_signal', 'unavailable_pending_since', 'detected_price'])
           || jsonb_build_object('compte_quitte', jsonb_build_object(
           'remplacement', v_id, 'nouveau', v_compte, 'le', v_now, 'statut_avant', j.status, 'erreur_avant', j.error,
           'signal_avant', CASE WHEN j.platform_fields ?| ARRAY['unavailable_since', 'sale_signal', 'unavailable_pending_since']
                                THEN jsonb_build_object('sale_signal', j.platform_fields -> 'sale_signal',
                                       'unavailable_since', j.platform_fields -> 'unavailable_since',
                                       'unavailable_pending_since', j.platform_fields -> 'unavailable_pending_since') END))
   WHERE j.id = ANY (v_taches) AND j.status = 'published' AND (j.platform_fields ->> 'sale_signal') IS DISTINCT FROM 'sold';
  GET DIAGNOSTICS n_taches = ROW_COUNT;
  -- c. Les republications pas encore engagées sur elles (rien n'a été retiré sur la plateforme).
  UPDATE cross_post_jobs j SET status = 'cancelled', error = v_msg_rep,
         platform_fields = COALESCE(j.platform_fields, '{}'::jsonb) || jsonb_build_object('compte_quitte', jsonb_build_object(
           'remplacement', v_id, 'nouveau', v_compte, 'le', v_now, 'statut_avant', j.status, 'erreur_avant', j.error))
   WHERE j.id = ANY (v_reps) AND j.status IN ('pending', 'needs_user')
     AND COALESCE(j.platform_fields ->> 'republish_step', '') IN ('', 'a_capturer', 'captured')
     AND NOT republication_retrait_engage(j.platform_fields);
  GET DIAGNOSTICS n_reps = ROW_COUNT;
  -- d. Les retraits en attente sur elles : FillSell ne peut plus les faire (listés dans le bilan).
  UPDATE cross_post_jobs j SET status = 'cancelled', error = v_msg_retrait,
         platform_fields = COALESCE(j.platform_fields, '{}'::jsonb) || jsonb_build_object('compte_quitte', jsonb_build_object(
           'remplacement', v_id, 'nouveau', v_compte, 'le', v_now, 'statut_avant', j.status, 'erreur_avant', j.error))
   WHERE j.id = ANY (v_retraits) AND j.status IN ('pending', 'needs_user', 'failed');
  GET DIAGNOSTICS n_retraits = ROW_COUNT;

  -- e. Le registre : les anciens comptes quittés, le compte lu suivi.
  UPDATE comptes_plateforme_suivi c SET etat = 'quitte', quitte_le = v_now, remplace_par = v_compte, decide_le = v_now, decide_par = p_par
   WHERE c.user_id = p_user AND c.platform = p_platform AND c.etat = 'suivi' AND c.compte <> v_compte;
  INSERT INTO comptes_plateforme_suivi (user_id, platform, compte, etat, decide_le, decide_par, quitte_le, remplace_par)
  SELECT p_user, p_platform, x.c, 'quitte', v_now, p_par, v_now, v_compte FROM unnest(v_anciens) AS x(c)
   WHERE x.c <> v_compte AND x.c ~ '^[A-Za-z0-9-]{3,80}$'
  ON CONFLICT (user_id, platform, compte) DO UPDATE
     SET etat = 'quitte', quitte_le = v_now, remplace_par = v_compte, decide_le = v_now, decide_par = p_par
   WHERE comptes_plateforme_suivi.etat <> 'quitte';
  INSERT INTO comptes_plateforme_suivi (user_id, platform, compte, etat, decide_le, decide_par)
  VALUES (p_user, p_platform, v_compte, 'suivi', v_now, p_par)
  ON CONFLICT (user_id, platform, compte) DO UPDATE
     SET etat = 'suivi', decide_le = v_now, decide_par = p_par, quitte_le = NULL, remplace_par = NULL
   WHERE comptes_plateforme_suivi.etat <> 'suivi';

  v_bilan := v_bilan || jsonb_build_object('annonces_closes', n_annonces, 'taches_closes', n_taches,
    'republications_closes', n_reps, 'retraits_clos', n_retraits);
  UPDATE comptes_plateforme_remplacements SET bilan = v_bilan WHERE id = v_id;
  INSERT INTO usage_logs (user_id, feature, metadata)
  VALUES (p_user, 'compte_plateforme_remplace', jsonb_build_object('platform', p_platform, 'anciens', to_jsonb(v_anciens),
    'nouveau', v_compte, 'remplacement', v_id, 'par', p_par, 'annonces', n_annonces, 'taches', n_taches,
    'republications', n_reps, 'retraits', n_retraits));

  -- f. Le rangement des annonces du compte suivi encore sans fiche (le chemin de synchro_relancer_rangement).
  IF EXISTS (SELECT 1 FROM annonces_plateforme a WHERE a.user_id = p_user AND a.platform = p_platform AND a.compte_plateforme = v_compte
               AND a.inventaire_id IS NULL AND a.ignoree_le IS NULL AND a.disparu_le IS NULL) THEN
    BEGIN
      PERFORM rapprochement_demander(p_user, 'compte_plateforme_remplace');
      PERFORM rapprochement_relancer(p_user);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'remplacer_compte_plateforme (%) : rangement non relancé : %', p_user, SQLERRM;
    END;
  END IF;

  RETURN jsonb_build_object('ok', true, 'simulation', false, 'remplacement', v_id) || v_bilan;
END;
$function$;

CREATE OR REPLACE FUNCTION public.remplacer_compte_plateforme(p_platform text, p_compte text, p_simuler boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  -- L'app (session de la personne) : SON compte seulement.
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'motif', 'session', 'message', 'Reconnecte-toi à FillSell, puis réessaie.');
  END IF;
  RETURN remplacer_compte_plateforme_pour(auth.uid(), p_platform, p_compte, COALESCE(p_simuler, true), 'utilisateur');
END;
$function$;

-- ── 6. La question, lue par l'app (lecture seule) ────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.compte_plateforme_a_confirmer_pour(p_user uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE d record; v_suivi text;
BEGIN
  IF auth.role() IS NOT NULL AND auth.role() <> 'service_role' AND p_user IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'compte_plateforme_a_confirmer : ce compte n''est pas le tien' USING ERRCODE = '42501';
  END IF;
  IF p_user IS NULL THEN RETURN '[]'::jsonb; END IF;
  -- Leboncoin (la seule plateforme dont l'extension lit le compte). Une question quand le DERNIER relevé complet a lu un
  -- autre compte que le compte suivi, ou, sans compte suivi, quand une annonce vivante d'un autre compte connu existe.
  SELECT * INTO d FROM compte_plateforme_dernier_releve(p_user, 'leboncoin');
  IF d.run_id IS NULL OR NOT COALESCE(d.probant, false) THEN RETURN '[]'::jsonb; END IF;
  SELECT c.compte INTO v_suivi FROM comptes_plateforme_suivi c
   WHERE c.user_id = p_user AND c.platform = 'leboncoin' AND c.etat = 'suivi';
  IF v_suivi = d.compte THEN RETURN '[]'::jsonb; END IF;
  IF v_suivi IS NULL AND NOT EXISTS (SELECT 1 FROM annonces_plateforme a
                                      WHERE a.user_id = p_user AND a.platform = 'leboncoin' AND a.disparu_le IS NULL
                                        AND NULLIF(btrim(a.compte_plateforme), '') IS NOT NULL AND a.compte_plateforme <> d.compte) THEN
    RETURN '[]'::jsonb;
  END IF;
  RETURN jsonb_build_array(jsonb_build_object(
    'platform', 'leboncoin', 'cas', CASE WHEN v_suivi IS NULL THEN 'quel_compte' ELSE 'autre_compte' END,
    'compte_lu', d.compte, 'releve_le', d.fini_le, 'annonces_lues', d.lues, 'compte_suivi', v_suivi,
    'simulation', remplacer_compte_plateforme_pour(p_user, 'leboncoin', d.compte, true, 'utilisateur')));
END;
$function$;

CREATE OR REPLACE FUNCTION public.compte_plateforme_a_confirmer()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT CASE WHEN auth.uid() IS NULL THEN '[]'::jsonb ELSE compte_plateforme_a_confirmer_pour(auth.uid()) END
$function$;

-- ── 7. Les droits (explicites) ───────────────────────────────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.compte_plateforme_juger(uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.compte_plateforme_dernier_releve(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.remplacer_compte_plateforme_pour(uuid, text, text, boolean, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.compte_plateforme_a_confirmer_pour(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.remplacer_compte_plateforme(text, text, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.compte_plateforme_a_confirmer() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.compte_plateforme_juger(uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.compte_plateforme_dernier_releve(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.remplacer_compte_plateforme_pour(uuid, text, text, boolean, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.compte_plateforme_a_confirmer_pour(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.remplacer_compte_plateforme(text, text, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.compte_plateforme_a_confirmer() TO authenticated, service_role;

-- La garde « après » : les trois corps sont ceux de cette migration (comparés sans retour chariot).
DO $verif_apres$
DECLARE r record;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('public.annonce_non_prouvee_vivante(uuid,boolean)', 'bf79cd09cd13f5c024aff81e369c9c59'),
    ('public.constater_absences_releve(uuid)', '16abc7aaede5d89486066737f5f1fff3'),
    ('public.veille_recentes_ouvrir(text,text[],text,text)', 'e9202262ae9b158177efd65b1c8f96c8'),
    ('public.cross_post_jobs_alerte_tenue()', '94f419b666e098b8e5dd25655d65efe6')) AS t(f, m)
  LOOP
    IF md5(replace(pg_get_functiondef(r.f::regprocedure), chr(13), '')) <> r.m THEN
      RAISE EXCEPTION '% : corps écrit différent de celui du banc (md5 sans CR attendu %)', r.f, r.m;
    END IF;
  END LOOP;
END $verif_apres$;

COMMIT;
