-- ═══════════════════════════════════════════════════════════════════════════
-- RESTAURATION DES RÉGLAGES ÉCRASÉS (profiles.platform_settings) — 02/10/2026
-- ═══════════════════════════════════════════════════════════════════════════
-- Inverse : 20261002_platform_settings_restauration_INVERSE.sql
-- Prérequis : migration 20261002153000 (platform_settings_fusionner + garde).
--
-- Règles (consigne de Nico, 02/10) :
--   · uniquement depuis une source PROUVÉE pour CE compte, jamais une adresse
--     inventée ni prise à un autre compte ;
--   · FUSION avec les clés actuelles : une clé présente aujourd'hui n'est
--     jamais touchée (la personne a pu la reposer elle-même) ;
--   · sauvegarde complète de la ligne AVANT d'écrire.
--
-- Mesure (tous comptes) : 4 comptes, 4 clés prouvées perdues.
--   ornellaracano   leboncoin            sauvegarde du 13/09 (sauvegarde_ps_ornella_1309)
--                                        = adresse unique de ses 345 jobs LBC/Beebs,
--                                          dont 90 servis « reglages », jusqu'au 02/10
--   meminiandmove   leboncoin            adresse unique de ses 102 jobs LBC/Beebs
--                                        (13 → 21/09), découpée rue / CP / ville
--   angelofthedeath91  plateformes_vendeur  son propre choix à l'entrée (usage_logs
--   doriane-henri      plateformes_vendeur  'onboarding_choice', le plus récent)
-- NON restauré (pas de source sûre) — listé dans le rapport :
--   ornellaracano vinted.republish_auto : seule source = sauvegarde du 13/09
--     (actif = true) ; aucune republication auto depuis le 20/09 → la remettre
--     relancerait une automatisation que rien ne prouve voulue aujourd'hui.

BEGIN;

CREATE TABLE IF NOT EXISTS public._backup_0210_platform_settings_restauration (
  user_id                 uuid PRIMARY KEY,
  email                   text,
  platform_settings_avant jsonb NOT NULL,
  cles_restaurees         text[] NOT NULL DEFAULT '{}',
  valeurs_restaurees      jsonb  NOT NULL DEFAULT '{}'::jsonb,
  source                  text,
  sauvegarde_le           timestamptz NOT NULL DEFAULT now()
);
-- Des adresses : jamais lisibles par l'app.
ALTER TABLE public._backup_0210_platform_settings_restauration ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_0210_platform_settings_restauration FROM anon, authenticated;

INSERT INTO public._backup_0210_platform_settings_restauration (user_id, email, platform_settings_avant)
SELECT p.id, u.email, p.platform_settings
FROM profiles p JOIN auth.users u ON u.id = p.id
WHERE p.id IN ('f8aa02a5-23cb-4325-bba8-127f61a75741',   -- ornellaracano
               '63ad8597-4fee-4277-9a69-14ad44af1896',   -- meminiandmove
               'e25ff459-e49b-42a9-a17b-2d20e6bc5e29',   -- angelofthedeath91
               'af37fa49-c116-49d8-92fb-473d06405401')   -- doriane-henri
ON CONFLICT (user_id) DO NOTHING;

DO $r$
DECLARE
  v_u     uuid;
  v_adr   text;
  v_n     int;
  v_obj   jsonb;
  v_m     text[];
  v_pfs   jsonb;
BEGIN
  -- ── 1. ornellaracano : leboncoin depuis sa sauvegarde, prouvée par ses jobs ──
  v_u := 'f8aa02a5-23cb-4325-bba8-127f61a75741';
  IF NOT (SELECT platform_settings ? 'leboncoin' FROM profiles WHERE id = v_u) THEN
    SELECT platform_settings -> 'leboncoin' INTO v_obj FROM sauvegarde_ps_ornella_1309 LIMIT 1;
    SELECT count(DISTINCT platform_fields ->> 'adresse'), min(platform_fields ->> 'adresse') INTO v_n, v_adr
    FROM cross_post_jobs
    WHERE user_id = v_u AND platform IN ('leboncoin', 'beebs') AND COALESCE(platform_fields ->> 'adresse', '') <> '';
    IF v_obj IS NULL OR v_n <> 1 OR v_adr IS DISTINCT FROM (v_obj ->> 'adresse') THEN
      RAISE EXCEPTION 'ornella : preuve absente (sauvegarde %, % adresse(s) dans les jobs)', v_obj IS NOT NULL, v_n;
    END IF;
    PERFORM platform_settings_fusionner(ARRAY['leboncoin'], v_obj, '{}', v_u);
    UPDATE _backup_0210_platform_settings_restauration
       SET cles_restaurees = cles_restaurees || 'leboncoin'::text, valeurs_restaurees = valeurs_restaurees || jsonb_build_object('leboncoin', v_obj),
           source = 'sauvegarde_ps_ornella_1309 = adresse unique de ses jobs LBC/Beebs'
     WHERE user_id = v_u;
  END IF;

  -- ── 2. meminiandmove : leboncoin depuis l'adresse unique de ses propres jobs ──
  v_u := '63ad8597-4fee-4277-9a69-14ad44af1896';
  IF NOT (SELECT platform_settings ? 'leboncoin' FROM profiles WHERE id = v_u) THEN
    SELECT count(DISTINCT platform_fields ->> 'adresse'), min(platform_fields ->> 'adresse') INTO v_n, v_adr
    FROM cross_post_jobs
    WHERE user_id = v_u AND platform IN ('leboncoin', 'beebs') AND COALESCE(platform_fields ->> 'adresse', '') <> '';
    v_m := regexp_match(btrim(v_adr), '^(.*\S)\s+(\d{5})\s+(\S.*)$');
    IF v_n <> 1 OR v_m IS NULL THEN
      RAISE EXCEPTION 'meminiandmove : preuve absente (% adresse(s), découpage %)', v_n, v_m IS NOT NULL;
    END IF;
    v_obj := jsonb_build_object('rue', v_m[1], 'code_postal', v_m[2], 'ville', v_m[3], 'adresse', btrim(v_adr));
    PERFORM platform_settings_fusionner(ARRAY['leboncoin'], v_obj, '{}', v_u);
    UPDATE _backup_0210_platform_settings_restauration
       SET cles_restaurees = cles_restaurees || 'leboncoin'::text, valeurs_restaurees = valeurs_restaurees || jsonb_build_object('leboncoin', v_obj),
           source = 'adresse unique de ses jobs LBC/Beebs (13 → 21/09)'
     WHERE user_id = v_u;
  END IF;

  -- ── 3 et 4. plateformes_vendeur depuis le propre choix de la personne ──────
  FOREACH v_u IN ARRAY ARRAY['e25ff459-e49b-42a9-a17b-2d20e6bc5e29', 'af37fa49-c116-49d8-92fb-473d06405401']::uuid[] LOOP
    IF NOT (SELECT platform_settings ? 'plateformes_vendeur' FROM profiles WHERE id = v_u) THEN
      SELECT metadata -> 'plateformes' INTO v_pfs
      FROM usage_logs
      WHERE user_id = v_u AND feature = 'onboarding_choice'
        AND jsonb_typeof(metadata -> 'plateformes') = 'array' AND jsonb_array_length(metadata -> 'plateformes') > 0
      ORDER BY created_at DESC LIMIT 1;
      IF v_pfs IS NULL THEN
        RAISE EXCEPTION 'plateformes_vendeur % : choix introuvable', v_u;
      END IF;
      PERFORM platform_settings_fusionner(ARRAY['plateformes_vendeur'], v_pfs, '{}', v_u);
      UPDATE _backup_0210_platform_settings_restauration
         SET cles_restaurees = cles_restaurees || 'plateformes_vendeur'::text,
             valeurs_restaurees = valeurs_restaurees || jsonb_build_object('plateformes_vendeur', v_pfs),
             source = 'usage_logs onboarding_choice (son propre choix)'
       WHERE user_id = v_u;
    END IF;
  END LOOP;
END
$r$;

-- Relecture de l'effet (à lire avant de fermer la session).
SELECT b.email, b.cles_restaurees,
       (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(b.platform_settings_avant) k) AS cles_avant,
       (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(p.platform_settings) k)       AS cles_apres,
       NOT EXISTS (SELECT 1 FROM jsonb_object_keys(b.platform_settings_avant) k WHERE NOT (p.platform_settings ? k)) AS rien_perdu
FROM _backup_0210_platform_settings_restauration b JOIN profiles p ON p.id = b.user_id
ORDER BY b.email;

COMMIT;
