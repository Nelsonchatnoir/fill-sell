-- ═════════════════════════════════════════════════════════════════════════════
-- SYNCHRONISATION MULTIPLATEFORME — lot 0c : le modèle ET le moteur de
-- rattachement (2026-09-17 soir, GO Nico « lots 1 et 2 en entier »).
-- Conception : docs/SYNC_MULTIPLATEFORME_CONCEPTION.md (le document du 27/08
-- n'a pas été retrouvé ; celui-ci repart des arbitrages Q1-Q7 et du lot 0b).
-- ═════════════════════════════════════════════════════════════════════════════
-- CE QUE ÇA POSE :
--   · annonces_plateforme : une ligne par annonce RELEVÉE sur « Mes annonces »
--     d'une plateforme (leboncoin, beebs, ebay, opla) — titre, prix, URL,
--     statut, vue/disparue, rattachée ou non, PROPOSITION de rattachement ;
--   · rapprochements : le journal des décisions (par le job FillSell, par le
--     moteur, par l'utilisateur) — chaque fusion reste défaisable ('detache') ;
--   · vinted_sync_runs.platform (défaut 'vinted') + index unique actif par
--     (user, kind, platform) : un run par plateforme, même chien de garde ;
--   · UN interrupteur serveur, FERMÉ : coin_config.sync_multi_ouverte (0) +
--     borne de build sync_multi_extension_min (642 = 0.6.42) — la RPC de
--     demande, l'extension et TOUS les textes de l'app s'y tiennent. Ouvrir :
--       update coin_config set value = 1 where key = 'sync_multi_ouverte';
--     (profiles.beta_flags.inventaire_multi_pf = true ouvre UN compte, pour
--     tester — colonne lisible par le client, jamais modifiable par lui) ;
--   · demander_sync_plateforme(p_platform) : même contrat que
--     demander_sync_dressing (queued, TTL 6 h, un actif par plateforme,
--     cadence 15 min) ;
--   · LE MOTEUR, un seul (docs § 3 du chantier) : rapprocher_classer() décide
--     de la BANDE d'une annonce relevée — 'job' (identifiant = un dépôt
--     FillSell : certain), 'certain' (un seul candidat, titre exact, prix égal,
--     aucun homonyme), 'propose' (candidat(s) mais un doute : prix différent,
--     homonymes, plusieurs), 'aucune'. rapprocher_releve(run) l'applique :
--       certain → rattachement automatique, l'utilisateur ne voit rien — un
--         job « plus en ligne » remplacé (autre extension, LBC a recréé
--         l'annonce sous un autre identifiant) est RECÂBLÉ sur la nouvelle
--         annonce et ses drapeaux « vendue ? » levés ; un article sans dépôt
--         sur cette plateforme reçoit un job de suivi 'published' (le veilleur
--         le surveille) ;
--       propose → proposition écrite sur l'annonce, c'est SON bouton ;
--       aucune → rien.
--     ⛔ GARDE-FOU : un rattachement de la bande 'propose' ne déclenche JAMAIS
--     de retrait ni de signal de vente — il n'écrit rien sur les jobs tant que
--     l'utilisateur n'a pas tranché. Une décision humaine écrase toute passe
--     automatique (rapprochement_decider), et reste réversible ('detache').
--     rapprocher_simuler(user, plateforme, annonces json) rejoue le moteur
--     SANS ÉCRIRE (service_role) : c'est le banc d'essai.
--   · rapprochement_decider(annonce, décision, article) : attache / ignore /
--     refus_proposition / import / detache — un relevé n'est NI une publication
--     NI une republication : aucun compteur, aucun quota touché.
-- Idempotente. Retour arrière : DROP des tables/fonctions, suppression de la
-- colonne et de l'index (rien ne les lit avant les paquets qui suivent).
-- ═════════════════════════════════════════════════════════════════════════════

-- ── Interrupteur + borne (fermé) ──────────────────────────────────────────────
INSERT INTO public.coin_config (key, value) VALUES ('sync_multi_ouverte', 0) ON CONFLICT (key) DO NOTHING;
INSERT INTO public.coin_config (key, value) VALUES ('sync_multi_extension_min', 642) ON CONFLICT (key) DO NOTHING;

-- ── Drapeau d'exposition par compte (27/08) ───────────────────────────────────
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS beta_flags jsonb NOT NULL DEFAULT '{}'::jsonb;

-- ── Un run par plateforme ─────────────────────────────────────────────────────
ALTER TABLE public.vinted_sync_runs ADD COLUMN IF NOT EXISTS platform text NOT NULL DEFAULT 'vinted';
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vinted_sync_runs_platform_chk') THEN
    ALTER TABLE public.vinted_sync_runs ADD CONSTRAINT vinted_sync_runs_platform_chk
      CHECK (platform IN ('vinted', 'leboncoin', 'beebs', 'ebay', 'opla'));
  END IF;
END $$;
DROP INDEX IF EXISTS public.vinted_sync_runs_un_seul_actif;
CREATE UNIQUE INDEX IF NOT EXISTS vinted_sync_runs_un_seul_actif
  ON public.vinted_sync_runs (user_id, kind, platform)
  WHERE (status = ANY (ARRAY['queued'::text, 'running'::text]));

-- La purge des demandes périmées couvre les relevés (kind 'annonces') aussi.
CREATE OR REPLACE FUNCTION public.purger_sync_queue_perimee(p_user_id uuid)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
declare
  v_n integer;
begin
  update vinted_sync_runs
     set status      = 'expired',
         finished_at = now(),
         erreur      = 'demande expirée (6 h sans extension disponible)',
         updated_at  = now()
   where user_id = p_user_id
     and kind    in ('dressing', 'annonces')
     and status  = 'queued'
     and coalesce(queued_at, started_at) < now() - interval '6 hours';
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

-- ── Les annonces relevées ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.annonces_plateforme (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform              text NOT NULL CHECK (platform IN ('leboncoin', 'beebs', 'ebay', 'opla')),
  listing_id            text NOT NULL,
  url                   text,
  titre                 text,
  prix                  numeric,
  photo_url             text,
  statut_plateforme     text NOT NULL DEFAULT 'inconnu'
                        CHECK (statut_plateforme IN ('en_ligne', 'en_verification', 'desactivee', 'vendue', 'inconnu')),
  inventaire_id         bigint REFERENCES public.inventaire(id) ON DELETE SET NULL,
  job_id                uuid REFERENCES public.cross_post_jobs(id) ON DELETE SET NULL,
  source_rapprochement  text CHECK (source_rapprochement IN ('job', 'manuel', 'automatique')),
  proposition           jsonb,
  ignoree_le            timestamptz,
  run_id                uuid REFERENCES public.vinted_sync_runs(id) ON DELETE SET NULL,
  vu_le                 timestamptz NOT NULL DEFAULT now(),
  disparu_le            timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT annonces_plateforme_unique UNIQUE (user_id, platform, listing_id)
);
CREATE INDEX IF NOT EXISTS annonces_plateforme_user_pf_idx ON public.annonces_plateforme (user_id, platform, vu_le DESC);
CREATE INDEX IF NOT EXISTS annonces_plateforme_inventaire_idx ON public.annonces_plateforme (inventaire_id) WHERE inventaire_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS annonces_plateforme_a_rattacher_idx ON public.annonces_plateforme (user_id, platform)
  WHERE inventaire_id IS NULL AND ignoree_le IS NULL AND disparu_le IS NULL;
ALTER TABLE public.annonces_plateforme ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.annonces_plateforme TO authenticated;
DROP POLICY IF EXISTS annonces_plateforme_propres ON public.annonces_plateforme;
CREATE POLICY annonces_plateforme_propres ON public.annonces_plateforme
  FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ── Le journal des rapprochements ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.rapprochements (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  annonce_id     uuid NOT NULL REFERENCES public.annonces_plateforme(id) ON DELETE CASCADE,
  inventaire_id  bigint REFERENCES public.inventaire(id) ON DELETE SET NULL,
  decision       text NOT NULL CHECK (decision IN ('attache', 'propose', 'refus_proposition', 'ignore', 'import', 'detache')),
  par            text NOT NULL CHECK (par IN ('utilisateur', 'job', 'auto')),
  score          numeric,
  detail         jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rapprochements_annonce_idx ON public.rapprochements (annonce_id, created_at DESC);
ALTER TABLE public.rapprochements ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rapprochements TO authenticated;
DROP POLICY IF EXISTS rapprochements_propres ON public.rapprochements;
CREATE POLICY rapprochements_propres ON public.rapprochements
  FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ── Normalisation de titre : lettres/chiffres, sans accents, espaces uniques ─
CREATE OR REPLACE FUNCTION public.titre_norm(t text)
RETURNS text LANGUAGE sql IMMUTABLE
AS $$
  SELECT trim(regexp_replace(
    lower(translate(coalesce(t, ''),
      'àâäáãåéèêëíìîïóòôöõúùûüçñýÿœæÀÂÄÁÃÅÉÈÊËÍÌÎÏÓÒÔÖÕÚÙÛÜÇÑÝŒÆ',
      'aaaaaaeeeeiiiiooooouuuucnyyoaAAAAAAEEEEIIIIOOOOOUUUUCNYOA')),
    '[^a-z0-9]+', ' ', 'g'));
$$;

-- ── L'ouverture pour CE compte : interrupteur global OU drapeau du profil ────
CREATE OR REPLACE FUNCTION public.sync_multi_ouverte_pour(p_user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE((SELECT value = 1 FROM coin_config WHERE key = 'sync_multi_ouverte'), false)
      OR COALESCE((SELECT (beta_flags ->> 'inventaire_multi_pf')::boolean FROM profiles WHERE id = p_user), false);
$$;

-- ── La commande : demander un relevé sur une plateforme ─────────────────────
CREATE OR REPLACE FUNCTION public.demander_sync_plateforme(p_platform text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_pf   text := lower(COALESCE(NULLIF(trim(p_platform), ''), ''));
  v_ext  timestamptz;
  v_ver  text;
  v_min  integer;
  v_code integer;
  v_actif record;
  v_fini timestamptz;
  v_id   uuid;
BEGIN
  IF v_user IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'unauthorized'); END IF;
  IF v_pf NOT IN ('leboncoin', 'beebs', 'ebay', 'opla') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_platform');
  END IF;
  IF NOT sync_multi_ouverte_pour(v_user) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'non_expose');
  END IF;
  SELECT extension_last_seen_at, extension_version INTO v_ext, v_ver FROM profiles WHERE id = v_user;
  IF v_ext IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'extension_jamais_vue');
  END IF;
  SELECT value INTO v_min FROM coin_config WHERE key = 'sync_multi_extension_min';
  v_min := COALESCE(v_min, 642);
  v_code := CASE WHEN v_ver ~ '^\d+\.\d+\.\d+' THEN
      (split_part(v_ver, '.', 1))::integer * 10000 + (split_part(v_ver, '.', 2))::integer * 100
      + (regexp_replace(split_part(v_ver, '.', 3), '\D.*$', ''))::integer ELSE 0 END;
  IF v_min > 0 AND v_code < v_min THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'extension_trop_ancienne', 'version', v_ver, 'minimum', v_min);
  END IF;
  PERFORM purger_sync_queue_perimee(v_user);
  SELECT id, status INTO v_actif FROM vinted_sync_runs
  WHERE user_id = v_user AND kind = 'annonces' AND platform = v_pf AND status IN ('queued', 'running')
  ORDER BY COALESCE(queued_at, started_at) DESC LIMIT 1;
  IF v_actif.id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'reason', CASE WHEN v_actif.status = 'running' THEN 'sync_en_cours' ELSE 'deja_en_attente' END, 'run_id', v_actif.id);
  END IF;
  SELECT max(finished_at) INTO v_fini FROM vinted_sync_runs
  WHERE user_id = v_user AND kind = 'annonces' AND platform = v_pf AND status = 'done';
  IF v_fini IS NOT NULL AND v_fini > now() - interval '15 minutes' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'cadence', 'dernier', v_fini);
  END IF;
  INSERT INTO vinted_sync_runs (user_id, kind, platform, status, declencheur, queued_at)
  VALUES (v_user, 'annonces', v_pf, 'queued', 'app', now())
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('ok', true, 'reason', 'queued', 'run_id', v_id);
END;
$$;
REVOKE ALL ON FUNCTION public.demander_sync_plateforme(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.demander_sync_plateforme(text) TO authenticated, service_role;

-- ── LE MOTEUR — classer UNE annonce relevée ─────────────────────────────────
-- Rend { bande, inventaire_id, job_id, motif, score, candidats }.
--   bande = 'job' | 'certain' | 'propose' | 'aucune'.
-- p_vus = les identifiants relevés dans CE passage (la liste entière) : un
-- dépôt FillSell dont l'identifiant n'y figure plus est un candidat
-- « remplacé » (cas b du chantier : une autre extension a recréé l'annonce).
CREATE OR REPLACE FUNCTION public.rapprocher_classer(
  p_user uuid, p_platform text, p_listing_id text, p_url text, p_titre text, p_prix numeric, p_vus text[]
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_t      text := titre_norm(p_titre);
  v_job    record;
  v_cands  jsonb := '[]'::jsonb;
  v_c      record;
  v_n      integer := 0;
  v_best   jsonb := NULL;
  v_prix_ok boolean;
  v_homonymes integer;
  v_motif  text;
BEGIN
  -- A. L'identifiant est celui d'un dépôt FillSell : certain, sans question.
  SELECT j.id, j.inventaire_id INTO v_job FROM cross_post_jobs j
  WHERE j.user_id = p_user AND j.platform = p_platform
    AND j.action IN ('publish', 'republish') AND j.status = 'published'
    AND (j.platform_listing_id = p_listing_id
         OR (p_listing_id ~ '^\d+$' AND COALESCE(j.listing_url, '') ~ ('(^|[^0-9])' || p_listing_id || '([^0-9]|$)'))
         OR (p_listing_id !~ '^\d+$' AND position(p_listing_id in COALESCE(j.listing_url, '')) > 0))
  ORDER BY COALESCE(j.published_at, j.created_at) DESC LIMIT 1;
  IF v_job.id IS NOT NULL THEN
    RETURN jsonb_build_object('bande', 'job', 'inventaire_id', v_job.inventaire_id, 'job_id', v_job.id, 'score', 1, 'motif', 'identifiant');
  END IF;
  IF v_t = '' THEN RETURN jsonb_build_object('bande', 'aucune', 'motif', 'sans_titre'); END IF;

  -- B1. Dépôts FillSell au même titre dont l'annonce n'est PLUS dans le relevé
  --     (remplacée) — les plus probables d'abord : ceux que le veilleur a déjà
  --     marqués « plus en ligne ».
  FOR v_c IN
    SELECT j.id AS job_id, j.inventaire_id, j.price AS prix, j.title AS titre,
           (j.platform_fields ? 'unavailable_since') AS deja_disparu
    FROM cross_post_jobs j
    WHERE j.user_id = p_user AND j.platform = p_platform
      AND j.action IN ('publish', 'republish') AND j.status = 'published'
      AND titre_norm(j.title) = v_t
      AND NOT (COALESCE(j.platform_listing_id, '') = ANY (p_vus))
      AND NOT EXISTS (SELECT 1 FROM unnest(p_vus) v WHERE v <> '' AND (
            (v ~ '^\d+$' AND COALESCE(j.listing_url, '') ~ ('(^|[^0-9])' || v || '([^0-9]|$)'))
            OR (v !~ '^\d+$' AND position(v in COALESCE(j.listing_url, '')) > 0)))
      AND NOT EXISTS (SELECT 1 FROM annonces_plateforme ap WHERE ap.job_id = j.id AND ap.disparu_le IS NULL)
    ORDER BY (j.platform_fields ? 'unavailable_since') DESC, COALESCE(j.published_at, j.created_at) DESC
  LOOP
    v_n := v_n + 1;
    v_cands := v_cands || jsonb_build_object('type', 'job', 'job_id', v_c.job_id, 'inventaire_id', v_c.inventaire_id,
                                             'prix', v_c.prix, 'titre', v_c.titre, 'deja_disparu', v_c.deja_disparu);
  END LOOP;
  -- B2. Articles du stock au même titre, SANS dépôt sur cette plateforme
  --     (même article présent ailleurs, déposé à la main ici).
  FOR v_c IN
    SELECT i.id AS inventaire_id, i.prix_vente AS prix, i.titre
    FROM inventaire i
    WHERE i.user_id = p_user AND i.statut = 'stock' AND i.disparu_le IS NULL
      AND titre_norm(i.titre) = v_t
      AND NOT EXISTS (SELECT 1 FROM cross_post_jobs j WHERE j.inventaire_id = i.id AND j.platform = p_platform
                        AND j.action IN ('publish', 'republish') AND j.status = 'published')
      AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_cands) c WHERE (c ->> 'inventaire_id')::bigint = i.id)
    ORDER BY i.created_at DESC
  LOOP
    v_n := v_n + 1;
    v_cands := v_cands || jsonb_build_object('type', 'inventaire', 'job_id', NULL, 'inventaire_id', v_c.inventaire_id,
                                             'prix', v_c.prix, 'titre', v_c.titre);
  END LOOP;
  IF v_n = 0 THEN RETURN jsonb_build_object('bande', 'aucune', 'motif', 'aucun_candidat'); END IF;

  v_best := v_cands -> 0;
  v_prix_ok := p_prix IS NULL OR (v_best ->> 'prix') IS NULL OR abs(p_prix - (v_best ->> 'prix')::numeric) < 0.01;
  SELECT count(*) INTO v_homonymes FROM inventaire i
  WHERE i.user_id = p_user AND i.statut = 'stock' AND titre_norm(i.titre) = v_t;
  v_motif := CASE
    WHEN v_n > 1 THEN 'plusieurs_candidats'
    WHEN v_homonymes > 1 THEN 'homonymes'
    WHEN NOT v_prix_ok THEN 'prix_different'
    ELSE 'titre_exact' END;
  IF v_n = 1 AND v_prix_ok AND v_homonymes <= 1 THEN
    RETURN jsonb_build_object('bande', 'certain', 'inventaire_id', (v_best ->> 'inventaire_id')::bigint,
                              'job_id', NULLIF(v_best ->> 'job_id', '')::uuid, 'score', 0.95, 'motif', v_motif, 'candidats', v_cands);
  END IF;
  RETURN jsonb_build_object('bande', 'propose', 'inventaire_id', (v_best ->> 'inventaire_id')::bigint,
                            'job_id', NULLIF(v_best ->> 'job_id', '')::uuid,
                            'score', CASE WHEN v_prix_ok THEN 0.7 ELSE 0.5 END, 'motif', v_motif, 'candidats', v_cands);
END;
$$;
REVOKE ALL ON FUNCTION public.rapprocher_classer(uuid, text, text, text, text, numeric, text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rapprocher_classer(uuid, text, text, text, text, numeric, text[]) TO service_role;

-- ── Recâbler un job sur une nouvelle annonce (remplacement) ──────────────────
-- Les drapeaux « plus en ligne / vendue ? » sont LEVÉS et archivés : l'annonce
-- existe, sous un autre identifiant. Le job reste 'published' et surveillé.
CREATE OR REPLACE FUNCTION public.rapprocher_recabler_job(p_job uuid, p_url text, p_listing_id text, p_par text, p_detail jsonb)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_pf jsonb; v_ancienne text; v_ancien_id text;
BEGIN
  SELECT platform_fields, listing_url, platform_listing_id INTO v_pf, v_ancienne, v_ancien_id FROM cross_post_jobs WHERE id = p_job;
  v_pf := COALESCE(v_pf, '{}'::jsonb);
  v_pf := (v_pf - ARRAY['unavailable_since', 'unavailable_pending_since', 'sale_signal', 'detected_price', 'alerte_masquee_pour', 'alerte_masquee_le'])
          || jsonb_build_object(
               'rattachement', jsonb_build_object('par', p_par, 'at', now(), 'ancienne_url', v_ancienne, 'ancien_listing_id', v_ancien_id) || COALESCE(p_detail, '{}'::jsonb),
               'listing_url_precedente', v_ancienne);
  UPDATE cross_post_jobs
     SET listing_url = p_url, platform_listing_id = p_listing_id, platform_fields = v_pf, last_checked_at = NULL
   WHERE id = p_job;
END;
$$;
REVOKE ALL ON FUNCTION public.rapprocher_recabler_job(uuid, text, text, text, jsonb) FROM PUBLIC, anon, authenticated;

-- ── Un job de SUIVI pour une annonce rattachée à un article sans dépôt ───────
-- 'published' dès l'insert (l'annonce existe, on ne publie rien) : le veilleur
-- la surveille, la carte montre le logo. platform_fields.source = 'releve'.
CREATE OR REPLACE FUNCTION public.rapprocher_job_de_suivi(p_user uuid, p_platform text, p_inventaire bigint, p_titre text, p_prix numeric, p_url text, p_listing_id text, p_par text, p_detail jsonb)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_id uuid;
BEGIN
  INSERT INTO cross_post_jobs (user_id, inventaire_id, platform, action, status, photo_option, title, price, listing_url, platform_listing_id, published_at, handler_build, platform_fields)
  VALUES (p_user, p_inventaire, p_platform, 'publish', 'published', 'original', p_titre, p_prix, p_url, p_listing_id, now(), 'releve-annonces',
          jsonb_build_object('source', 'releve', 'rattachement', jsonb_build_object('par', p_par, 'at', now()) || COALESCE(p_detail, '{}'::jsonb)))
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.rapprocher_job_de_suivi(uuid, text, bigint, text, numeric, text, text, text, jsonb) FROM PUBLIC, anon, authenticated;

-- ── Appliquer le moteur à UN relevé (run) ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rapprocher_releve(p_run_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_run vinted_sync_runs%ROWTYPE;
  v_user uuid; v_pf text;
  v_vus text[];
  a record; v_cl jsonb; v_bande text;
  v_job uuid; v_inv bigint;
  n_job integer := 0; n_auto integer := 0; n_prop integer := 0; n_disp integer := 0; n_aucune integer := 0;
  v_complet boolean;
BEGIN
  SELECT * INTO v_run FROM vinted_sync_runs WHERE id = p_run_id;
  IF v_run.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'run_introuvable'); END IF;
  IF auth.uid() IS NOT NULL AND auth.uid() <> v_run.user_id THEN RETURN jsonb_build_object('ok', false, 'reason', 'unauthorized'); END IF;
  v_user := v_run.user_id; v_pf := v_run.platform;
  IF v_pf NOT IN ('leboncoin', 'beebs', 'ebay', 'opla') THEN RETURN jsonb_build_object('ok', false, 'reason', 'plateforme'); END IF;
  SELECT COALESCE(array_agg(listing_id), ARRAY[]::text[]) INTO v_vus FROM annonces_plateforme WHERE run_id = p_run_id;
  v_complet := COALESCE(v_run.erreur, '') NOT LIKE '[incomplet]%';

  FOR a IN
    SELECT * FROM annonces_plateforme
    WHERE run_id = p_run_id AND user_id = v_user AND platform = v_pf
      AND inventaire_id IS NULL AND ignoree_le IS NULL
    ORDER BY vu_le
  LOOP
    v_cl := rapprocher_classer(v_user, v_pf, a.listing_id, a.url, a.titre, a.prix, v_vus);
    v_bande := v_cl ->> 'bande';
    v_job := NULLIF(v_cl ->> 'job_id', '')::uuid;
    v_inv := NULLIF(v_cl ->> 'inventaire_id', '')::bigint;
    IF v_bande = 'job' THEN
      UPDATE annonces_plateforme SET inventaire_id = v_inv, job_id = v_job, source_rapprochement = 'job', proposition = NULL, updated_at = now() WHERE id = a.id;
      INSERT INTO rapprochements (user_id, annonce_id, inventaire_id, decision, par, score, detail)
      VALUES (v_user, a.id, v_inv, 'attache', 'job', 1, jsonb_build_object('job_id', v_job, 'run_id', p_run_id));
      -- Vue en ligne dans « Mes annonces » : un drapeau « plus en ligne » posé
      -- entre-temps par le veilleur était une fausse alerte — levé, archivé.
      IF a.statut_plateforme = 'en_ligne' THEN
        UPDATE cross_post_jobs
           SET platform_fields = (platform_fields - ARRAY['unavailable_since', 'unavailable_pending_since', 'sale_signal', 'detected_price', 'alerte_masquee_pour', 'alerte_masquee_le'])
                                 || jsonb_build_object('revue_en_ligne_par_releve', jsonb_build_object('run_id', p_run_id, 'at', now()))
         WHERE id = v_job AND (platform_fields ? 'unavailable_since' OR platform_fields ? 'unavailable_pending_since');
      END IF;
      n_job := n_job + 1;
    ELSIF v_bande = 'certain' THEN
      IF v_job IS NOT NULL THEN
        PERFORM rapprocher_recabler_job(v_job, a.url, a.listing_id, 'auto', jsonb_build_object('run_id', p_run_id, 'annonce_id', a.id, 'motif', v_cl ->> 'motif', 'score', v_cl -> 'score'));
      ELSE
        v_job := rapprocher_job_de_suivi(v_user, v_pf, v_inv, a.titre, a.prix, a.url, a.listing_id, 'auto',
                                         jsonb_build_object('run_id', p_run_id, 'annonce_id', a.id, 'motif', v_cl ->> 'motif', 'score', v_cl -> 'score'));
      END IF;
      UPDATE annonces_plateforme SET inventaire_id = v_inv, job_id = v_job, source_rapprochement = 'automatique', proposition = NULL, updated_at = now() WHERE id = a.id;
      INSERT INTO rapprochements (user_id, annonce_id, inventaire_id, decision, par, score, detail)
      VALUES (v_user, a.id, v_inv, 'attache', 'auto', (v_cl ->> 'score')::numeric, jsonb_build_object('job_id', v_job, 'run_id', p_run_id, 'motif', v_cl ->> 'motif'));
      n_auto := n_auto + 1;
    ELSIF v_bande = 'propose' THEN
      -- Rien sur les jobs : la proposition vit sur l'annonce, c'est SON bouton.
      UPDATE annonces_plateforme
         SET proposition = jsonb_build_object('inventaire_id', v_inv, 'job_id', v_job, 'motif', v_cl ->> 'motif', 'score', v_cl -> 'score',
                                              'candidats', COALESCE(v_cl -> 'candidats', '[]'::jsonb), 'run_id', p_run_id, 'at', now()),
             updated_at = now()
       WHERE id = a.id;
      INSERT INTO rapprochements (user_id, annonce_id, inventaire_id, decision, par, score, detail)
      VALUES (v_user, a.id, v_inv, 'propose', 'auto', (v_cl ->> 'score')::numeric, jsonb_build_object('job_id', v_job, 'run_id', p_run_id, 'motif', v_cl ->> 'motif'));
      n_prop := n_prop + 1;
    ELSE
      n_aucune := n_aucune + 1;
    END IF;
  END LOOP;

  -- Disparitions : les annonces de cette plateforme non revues par un relevé
  -- COMPLET. Aucun signal de vente ici — c'est le veilleur qui tranche sur les
  -- jobs, avec ses propres règles ; on date seulement l'annonce.
  IF v_complet THEN
    UPDATE annonces_plateforme SET disparu_le = now(), updated_at = now()
     WHERE user_id = v_user AND platform = v_pf AND disparu_le IS NULL
       AND run_id IS DISTINCT FROM p_run_id AND vu_le < COALESCE(v_run.started_at, now());
    GET DIAGNOSTICS n_disp = ROW_COUNT;
  END IF;

  RETURN jsonb_build_object('ok', true, 'run_id', p_run_id, 'platform', v_pf, 'relevees', COALESCE(array_length(v_vus, 1), 0),
                            'par_job', n_job, 'auto', n_auto, 'proposees', n_prop, 'sans_candidat', n_aucune,
                            'disparues', n_disp, 'complet', v_complet);
END;
$$;
REVOKE ALL ON FUNCTION public.rapprocher_releve(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rapprocher_releve(uuid) TO authenticated, service_role;

-- ── Le banc d'essai : rejouer le moteur SANS écrire ──────────────────────────
-- p_annonces = [{listing_id, url, titre, prix}] : ce qu'un relevé rendrait.
CREATE OR REPLACE FUNCTION public.rapprocher_simuler(p_user uuid, p_platform text, p_annonces jsonb)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_vus text[]; e jsonb; v_out jsonb := '[]'::jsonb; v_cl jsonb;
BEGIN
  SELECT COALESCE(array_agg(x ->> 'listing_id'), ARRAY[]::text[]) INTO v_vus FROM jsonb_array_elements(COALESCE(p_annonces, '[]'::jsonb)) x;
  FOR e IN SELECT * FROM jsonb_array_elements(COALESCE(p_annonces, '[]'::jsonb)) LOOP
    v_cl := rapprocher_classer(p_user, p_platform, e ->> 'listing_id', e ->> 'url', e ->> 'titre', NULLIF(e ->> 'prix', '')::numeric, v_vus);
    v_out := v_out || (jsonb_build_object('listing_id', e ->> 'listing_id', 'titre', e ->> 'titre') || (v_cl - 'candidats'));
  END LOOP;
  RETURN v_out;
END;
$$;
REVOKE ALL ON FUNCTION public.rapprocher_simuler(uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rapprocher_simuler(uuid, text, jsonb) TO service_role;

-- ── La décision de l'utilisateur ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rapprochement_decider(p_annonce_id uuid, p_decision text, p_inventaire_id bigint DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  a annonces_plateforme%ROWTYPE;
  v_inv bigint; v_job uuid; v_job_pf jsonb; v_new_inv bigint; v_titre text; v_prix numeric;
BEGIN
  IF v_user IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'unauthorized'); END IF;
  SELECT * INTO a FROM annonces_plateforme WHERE id = p_annonce_id AND user_id = v_user;
  IF a.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'annonce_introuvable'); END IF;

  IF p_decision = 'attache' THEN
    v_inv := COALESCE(p_inventaire_id, NULLIF(a.proposition ->> 'inventaire_id', '')::bigint);
    IF v_inv IS NULL OR NOT EXISTS (SELECT 1 FROM inventaire i WHERE i.id = v_inv AND i.user_id = v_user) THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'article_introuvable');
    END IF;
    -- Le dépôt FillSell de cet article sur cette plateforme, s'il existe : la
    -- proposition d'abord, sinon le plus récent en ligne.
    v_job := NULLIF(a.proposition ->> 'job_id', '')::uuid;
    IF v_job IS NOT NULL AND NOT EXISTS (SELECT 1 FROM cross_post_jobs j WHERE j.id = v_job AND j.user_id = v_user AND j.inventaire_id = v_inv AND j.platform = a.platform AND j.status = 'published') THEN
      v_job := NULL;
    END IF;
    IF v_job IS NULL THEN
      SELECT j.id INTO v_job FROM cross_post_jobs j
      WHERE j.user_id = v_user AND j.inventaire_id = v_inv AND j.platform = a.platform
        AND j.action IN ('publish', 'republish') AND j.status = 'published'
      ORDER BY COALESCE(j.published_at, j.created_at) DESC LIMIT 1;
    END IF;
    IF v_job IS NOT NULL THEN
      PERFORM rapprocher_recabler_job(v_job, a.url, a.listing_id, 'utilisateur', jsonb_build_object('annonce_id', a.id));
    ELSE
      v_job := rapprocher_job_de_suivi(v_user, a.platform, v_inv, a.titre, a.prix, a.url, a.listing_id, 'utilisateur', jsonb_build_object('annonce_id', a.id));
    END IF;
    UPDATE annonces_plateforme SET inventaire_id = v_inv, job_id = v_job, source_rapprochement = 'manuel', proposition = NULL, ignoree_le = NULL, updated_at = now() WHERE id = a.id;
    INSERT INTO rapprochements (user_id, annonce_id, inventaire_id, decision, par, score, detail)
    VALUES (v_user, a.id, v_inv, 'attache', 'utilisateur', 1, jsonb_build_object('job_id', v_job));
    RETURN jsonb_build_object('ok', true, 'decision', 'attache', 'inventaire_id', v_inv, 'job_id', v_job);

  ELSIF p_decision = 'refus_proposition' THEN
    UPDATE annonces_plateforme SET proposition = NULL, updated_at = now() WHERE id = a.id;
    INSERT INTO rapprochements (user_id, annonce_id, inventaire_id, decision, par, detail)
    VALUES (v_user, a.id, NULLIF(a.proposition ->> 'inventaire_id', '')::bigint, 'refus_proposition', 'utilisateur', COALESCE(a.proposition, '{}'::jsonb));
    RETURN jsonb_build_object('ok', true, 'decision', 'refus_proposition');

  ELSIF p_decision = 'ignore' THEN
    UPDATE annonces_plateforme SET ignoree_le = now(), proposition = NULL, updated_at = now() WHERE id = a.id;
    INSERT INTO rapprochements (user_id, annonce_id, decision, par) VALUES (v_user, a.id, 'ignore', 'utilisateur');
    RETURN jsonb_build_object('ok', true, 'decision', 'ignore');

  ELSIF p_decision = 'import' THEN
    IF a.inventaire_id IS NOT NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'deja_rattachee'); END IF;
    v_titre := COALESCE(NULLIF(trim(a.titre), ''), 'Annonce ' || a.platform);
    v_prix := a.prix;
    -- inventaire.id n'a pas de DEFAULT (convention du front : horodatage ms).
    v_new_inv := (extract(epoch FROM clock_timestamp()) * 1000)::bigint;
    WHILE EXISTS (SELECT 1 FROM inventaire WHERE id = v_new_inv) LOOP v_new_inv := v_new_inv + 1; END LOOP;
    -- Un relevé n'est ni une publication ni une republication : aucun
    -- compteur, aucun quota, aucune unité — origine 'releve_<plateforme>'.
    INSERT INTO inventaire (id, user_id, titre, prix_vente, statut, plateforme, origine, quantite, photos, attributs, first_seen_at, last_synced_at)
    VALUES (v_new_inv, v_user, v_titre, v_prix, 'stock', a.platform, 'releve_' || a.platform, 1,
            CASE WHEN a.photo_url IS NOT NULL THEN jsonb_build_array(a.photo_url) ELSE NULL END, '{}'::jsonb, now(), now());
    v_job := rapprocher_job_de_suivi(v_user, a.platform, v_new_inv, v_titre, v_prix, a.url, a.listing_id, 'utilisateur', jsonb_build_object('annonce_id', a.id, 'import', true));
    UPDATE annonces_plateforme SET inventaire_id = v_new_inv, job_id = v_job, source_rapprochement = 'manuel', proposition = NULL, ignoree_le = NULL, updated_at = now() WHERE id = a.id;
    INSERT INTO rapprochements (user_id, annonce_id, inventaire_id, decision, par, score, detail)
    VALUES (v_user, a.id, v_new_inv, 'import', 'utilisateur', 1, jsonb_build_object('job_id', v_job));
    RETURN jsonb_build_object('ok', true, 'decision', 'import', 'inventaire_id', v_new_inv, 'job_id', v_job);

  ELSIF p_decision = 'detache' THEN
    IF a.job_id IS NOT NULL THEN
      SELECT platform_fields INTO v_job_pf FROM cross_post_jobs WHERE id = a.job_id AND user_id = v_user;
      IF v_job_pf ->> 'source' = 'releve' THEN
        -- Job de suivi né du rattachement : il n'a plus de raison d'être.
        UPDATE cross_post_jobs SET status = 'cancelled',
               platform_fields = COALESCE(platform_fields, '{}'::jsonb) || jsonb_build_object('detache_le', now()),
               error = 'Rattachement défait par l''utilisateur — pas une vente'
         WHERE id = a.job_id AND user_id = v_user;
      ELSIF v_job_pf ? 'listing_url_precedente' THEN
        -- Job recâblé : on rend l'ancienne URL (le veilleur reprendra sa lecture).
        UPDATE cross_post_jobs SET listing_url = v_job_pf ->> 'listing_url_precedente',
               platform_listing_id = v_job_pf -> 'rattachement' ->> 'ancien_listing_id',
               platform_fields = (platform_fields - ARRAY['rattachement', 'listing_url_precedente']) || jsonb_build_object('detache_le', now()),
               last_checked_at = NULL
         WHERE id = a.job_id AND user_id = v_user;
      END IF;
    END IF;
    UPDATE annonces_plateforme SET inventaire_id = NULL, job_id = NULL, source_rapprochement = NULL, proposition = NULL, updated_at = now() WHERE id = a.id;
    INSERT INTO rapprochements (user_id, annonce_id, inventaire_id, decision, par, detail)
    VALUES (v_user, a.id, a.inventaire_id, 'detache', 'utilisateur', jsonb_build_object('job_id', a.job_id));
    RETURN jsonb_build_object('ok', true, 'decision', 'detache');
  END IF;
  RETURN jsonb_build_object('ok', false, 'reason', 'decision_inconnue');
END;
$$;
REVOKE ALL ON FUNCTION public.rapprochement_decider(uuid, text, bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rapprochement_decider(uuid, text, bigint) TO authenticated, service_role;

-- Contrôle :
--   SELECT key, value FROM coin_config WHERE key LIKE 'sync_multi%';  → 0 / 642
--   SELECT public.demander_sync_plateforme('leboncoin');  -- compte non exposé
--   → {"ok": false, "reason": "non_expose"}
--   SELECT public.rapprocher_simuler('<user>', 'leboncoin', '[{"listing_id":"999","titre":"…","prix":12}]');
