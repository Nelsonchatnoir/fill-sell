-- ═════════════════════════════════════════════════════════════════════════════
-- SYNCHRONISATION MULTIPLATEFORME — lot 0c : le modèle
-- 2026-09-17, conception docs/SYNC_MULTIPLATEFORME_CONCEPTION.md (le document
-- du 27/08 n'a pas été retrouvé ; celui-ci repart des arbitrages Q1-Q7 et du
-- lot 0b livré : sync_gardes_declenchees).
-- ═════════════════════════════════════════════════════════════════════════════
-- CE QUE ÇA POSE, et rien d'autre (aucun lecteur, aucun écrivain avant le
-- lot 1 extension et le lot 2 app — la migration est INERTE une fois posée) :
--   · annonces_plateforme : une ligne par annonce RELEVÉE sur « Mes annonces »
--     d'une plateforme (leboncoin, beebs, ebay, opla) — titre, prix, URL,
--     statut, vue/disparue, rapprochée ou non d'un article ;
--   · rapprochements : le journal des décisions annonce ↔ article (par le job
--     FillSell qui l'a déposée, par l'utilisateur, jamais automatique par
--     titre) ;
--   · vinted_sync_runs.platform (défaut 'vinted') + index unique actif par
--     (user, kind, platform) : un run par plateforme, même chien de garde,
--     même carte ;
--   · demander_sync_plateforme(p_platform) : même contrat que
--     demander_sync_dressing (queued, TTL 6 h, un actif par plateforme,
--     réservé aux comptes dont profiles.beta_flags.inventaire_multi_pf = true
--     — drapeau d'exposition arbitré le 27/08, colonne NON modifiable par le
--     client : lecture seule table-level, aucune policy UPDATE dessus).
-- Idempotente. Retour arrière : DROP des deux tables et de la fonction,
-- suppression de la colonne et de l'index (rien ne les lit avant le lot 1).
-- ═════════════════════════════════════════════════════════════════════════════

-- ── Drapeau d'exposition (27/08) : beta_flags, jsonb, lu par l'app, posé par SQL.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS beta_flags jsonb NOT NULL DEFAULT '{}'::jsonb;

-- ── Un run par plateforme ────────────────────────────────────────────────────
ALTER TABLE public.vinted_sync_runs ADD COLUMN IF NOT EXISTS platform text NOT NULL DEFAULT 'vinted';
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vinted_sync_runs_platform_chk') THEN
    ALTER TABLE public.vinted_sync_runs ADD CONSTRAINT vinted_sync_runs_platform_chk
      CHECK (platform IN ('vinted', 'leboncoin', 'beebs', 'ebay', 'opla'));
  END IF;
END $$;
-- L'index « un seul actif » devient par plateforme : l'ancien (user_id, kind)
-- refuserait un run Leboncoin pendant un run Vinted.
DROP INDEX IF EXISTS public.vinted_sync_runs_un_seul_actif;
CREATE UNIQUE INDEX IF NOT EXISTS vinted_sync_runs_un_seul_actif
  ON public.vinted_sync_runs (user_id, kind, platform)
  WHERE (status = ANY (ARRAY['queued'::text, 'running'::text]));

-- ── Les annonces relevées ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.annonces_plateforme (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform              text NOT NULL CHECK (platform IN ('leboncoin', 'beebs', 'ebay', 'opla')),
  listing_id            text NOT NULL,
  url                   text,
  titre                 text,
  prix                  numeric,
  statut_plateforme     text NOT NULL DEFAULT 'inconnu'
                        CHECK (statut_plateforme IN ('en_ligne', 'en_verification', 'desactivee', 'vendue', 'inconnu')),
  inventaire_id         bigint REFERENCES public.inventaire(id) ON DELETE SET NULL,
  job_id                uuid REFERENCES public.cross_post_jobs(id) ON DELETE SET NULL,
  source_rapprochement  text CHECK (source_rapprochement IN ('job', 'manuel', 'automatique')),
  run_id                uuid REFERENCES public.vinted_sync_runs(id) ON DELETE SET NULL,
  vu_le                 timestamptz NOT NULL DEFAULT now(),
  disparu_le            timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT annonces_plateforme_unique UNIQUE (user_id, platform, listing_id)
);
CREATE INDEX IF NOT EXISTS annonces_plateforme_user_pf_idx ON public.annonces_plateforme (user_id, platform, vu_le DESC);
CREATE INDEX IF NOT EXISTS annonces_plateforme_inventaire_idx ON public.annonces_plateforme (inventaire_id) WHERE inventaire_id IS NOT NULL;
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
  decision       text NOT NULL CHECK (decision IN ('attache', 'ignore', 'import', 'detache')),
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

-- ── La commande : demander un relevé sur une plateforme ─────────────────────
-- Même contrat que demander_sync_dressing : 'queued' pris par l'extension au
-- poll suivant, TTL 6 h (purge existante par kind — la colonne platform ne
-- change rien à la purge), un actif par plateforme (index ci-dessus).
CREATE OR REPLACE FUNCTION public.demander_sync_plateforme(p_platform text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_pf   text := lower(COALESCE(NULLIF(trim(p_platform), ''), ''));
  v_flags jsonb;
  v_ext  timestamptz;
  v_actif record;
  v_id   uuid;
BEGIN
  IF v_user IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'unauthorized'); END IF;
  IF v_pf NOT IN ('leboncoin', 'beebs', 'ebay', 'opla') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_platform');
  END IF;
  SELECT beta_flags, extension_last_seen_at INTO v_flags, v_ext FROM profiles WHERE id = v_user;
  -- Drapeau d'exposition (27/08) : fermé par défaut, posé par SQL, illisible
  -- ou absent = fermé.
  IF COALESCE((v_flags ->> 'inventaire_multi_pf')::boolean, false) IS NOT TRUE THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'non_expose');
  END IF;
  IF v_ext IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'extension_required');
  END IF;
  SELECT id, status, queued_at INTO v_actif FROM vinted_sync_runs
  WHERE user_id = v_user AND kind = 'annonces' AND platform = v_pf AND status IN ('queued', 'running')
  ORDER BY COALESCE(queued_at, started_at) DESC LIMIT 1;
  IF v_actif.id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'reason', CASE WHEN v_actif.status = 'running' THEN 'sync_en_cours' ELSE 'deja_en_attente' END, 'run_id', v_actif.id);
  END IF;
  INSERT INTO vinted_sync_runs (user_id, kind, platform, status, declencheur, queued_at)
  VALUES (v_user, 'annonces', v_pf, 'queued', 'app', now())
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('ok', true, 'reason', 'queued', 'run_id', v_id);
END;
$$;
REVOKE ALL ON FUNCTION public.demander_sync_plateforme(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.demander_sync_plateforme(text) TO authenticated, service_role;

-- Contrôle :
--   SELECT indexdef FROM pg_indexes WHERE indexname = 'vinted_sync_runs_un_seul_actif';
--   → (user_id, kind, platform) WHERE status IN ('queued','running')
--   SELECT public.demander_sync_plateforme('leboncoin');  -- compte sans drapeau
--   → {"ok": false, "reason": "non_expose"}
