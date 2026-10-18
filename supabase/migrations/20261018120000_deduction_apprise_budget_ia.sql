-- ═══════════════════════════════════════════════════════════════════════════
-- 18/10 — LOT 2 « ZÉRO ORANGE PAR LA DÉDUCTION » : CORRESPONDANCES APPRISES,
--         MODE FANTÔME, BASCULE AUTOMATIQUE ; COMPTEUR DE LA DÉPENSE IA
-- ═══════════════════════════════════════════════════════════════════════════
-- 1. LE COMPTEUR DE LA DÉPENSE IA (ia_depense_jour) — sert le plafond codé en
--    dur des fonctions edge (_shared/budget-ia.ts). Chaque ligne usage_logs qui
--    porte un coût (metadata.cost_usd, posé par loggerAppelIA et les fonctions
--    IA) l'ajoute au jour de Paris et au fournisseur (OpenAI : photo_retouche,
--    voix ; Anthropic : le reste) ; rapprochement_ia_verdicts.cout_usd aussi.
--    Le déclencheur n'arrête JAMAIS l'écriture d'un journal (toute erreur est
--    avalée). Rattrapage du 01/10 au moment de la migration (même règle).
--    Lecture : ia_depense_etat() (service_role) — une ligne par jour, minuscule.
-- 2. LES CORRESPONDANCES APPRISES (deduction_apprise) : (plateforme, catégorie
--    feuille, champ, source, valeur de la source) → valeur, apprises sur les
--    annonces RÉELLEMENT acceptées en ligne (jobs publiés/vendus, annonces
--    Leboncoin relevées : la valeur choisie par le vendeur lui-même), jamais
--    sur un refus. Sources : « vinted » = catalogue Vinted de la fiche (même
--    article sur Vinted) ; « categorie » = la catégorie seule (champ constant
--    du rayon). RÈGLE STRICTE, mesurée sur le banc du 18/10 (100 % de justes
--    sur chaque champ servi) : unanime (une seule valeur) sur ≥ 4 articles de
--    ≥ 2 comptes (vinted), ≥ 8 articles de ≥ 3 comptes (categorie). Jamais
--    l'état, la marque, la couleur, la taille, la matière, le poids, le colis,
--    le prix, les dimensions, un identifiant (la fiche et le texte du vendeur
--    font foi pour eux). Reconstruite chaque nuit (bornée, 60 s) : chaque
--    correction d'un utilisateur et chaque annonce acceptée l'enrichissent,
--    une valeur refusée n'y entre jamais.
-- 3. LA BASCULE (deduction_bascule) — par (plateforme, champ) : « fantome »
--    (l'app note ce qu'elle aurait posé, sans rien toucher), « actif » (posé
--    avant l'IA et avant la question), « coupe » (retour arrière automatique),
--    « eteint ». Seuls les champs qui ont passé le BANC du 18/10 sans une
--    seule erreur naissent « fantome ». deduction_bascule_evaluer() (cron 6 h)
--    les fait passer « actif » quand le fantôme est parfait sur le vrai trafic
--    (≥ 48 h, ≥ 15 cas relus, 100 % égaux à la valeur acceptée en ligne), et
--    « coupe » quand ce qui a été posé se trompe (< 97 % sur ≥ 10 cas en 72 h)
--    ou quand les refus de la plateforme remontent (+15 points sur ≥ 10 cas).
--    Les critères sont ÉCRITS ICI, dans le code ; rien d'autre ne bascule.
-- 4. deduction_apprise_pour(...) : la lecture de l'app (session), ne rend que
--    les champs « fantome » ou « actif ».
-- Inverse : supabase/rollbacks/20261018120000_deduction_apprise_budget_ia.sql.
-- Application :
--   npx supabase db query --linked -f supabase/migrations/20261018120000_deduction_apprise_budget_ia.sql
--   npx supabase migration repair --linked --status applied 20261018120000

BEGIN;
SET LOCAL statement_timeout = '120s';
SET LOCAL lock_timeout = '5s';

-- ── 1. Compteur de la dépense IA ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ia_depense_jour (
  jour date NOT NULL,
  fournisseur text NOT NULL CHECK (fournisseur IN ('anthropic', 'openai')),
  cout_usd numeric NOT NULL DEFAULT 0,
  appels integer NOT NULL DEFAULT 0,
  maj_le timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (jour, fournisseur)
);
ALTER TABLE public.ia_depense_jour ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ia_depense_jour FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.ia_depense_jour TO service_role;

CREATE OR REPLACE FUNCTION public.ia_fournisseur_de(p_feature text)
 RETURNS text LANGUAGE sql IMMUTABLE SET search_path TO 'public'
AS $function$
  SELECT CASE WHEN p_feature IN ('photo_retouche', 'voice', 'voice_transcribe', 'whisper') THEN 'openai' ELSE 'anthropic' END;
$function$;

CREATE OR REPLACE FUNCTION public.ia_depense_noter()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_cout numeric;
  v_f text;
  v_jour date;
BEGIN
  BEGIN
    IF TG_TABLE_NAME = 'usage_logs' THEN
      v_cout := nullif(NEW.metadata ->> 'cost_usd', '')::numeric;
      v_f := public.ia_fournisseur_de(NEW.feature);
      v_jour := (coalesce(NEW.created_at, now()) AT TIME ZONE 'Europe/Paris')::date;
    ELSE
      v_cout := NEW.cout_usd;
      v_f := 'anthropic';
      v_jour := (coalesce(NEW.cree_le, now()) AT TIME ZONE 'Europe/Paris')::date;
    END IF;
    IF v_cout IS NULL OR v_cout <= 0 OR v_cout > 50 THEN RETURN NEW; END IF;
    INSERT INTO ia_depense_jour AS d (jour, fournisseur, cout_usd, appels, maj_le)
    VALUES (v_jour, v_f, v_cout, 1, now())
    ON CONFLICT (jour, fournisseur) DO UPDATE SET cout_usd = d.cout_usd + EXCLUDED.cout_usd, appels = d.appels + 1, maj_le = now();
  EXCEPTION WHEN OTHERS THEN
    -- Un compteur ne casse jamais l'écriture d'un journal.
    NULL;
  END;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.ia_depense_noter() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS usage_logs_ia_depense ON public.usage_logs;
CREATE TRIGGER usage_logs_ia_depense AFTER INSERT ON public.usage_logs
  FOR EACH ROW WHEN (NEW.metadata ? 'cost_usd') EXECUTE FUNCTION public.ia_depense_noter();
DROP TRIGGER IF EXISTS rapprochement_ia_verdicts_ia_depense ON public.rapprochement_ia_verdicts;
CREATE TRIGGER rapprochement_ia_verdicts_ia_depense AFTER INSERT ON public.rapprochement_ia_verdicts
  FOR EACH ROW WHEN (NEW.cout_usd IS NOT NULL) EXECUTE FUNCTION public.ia_depense_noter();

-- Rattrapage depuis le 01/10 (même règle que le déclencheur).
INSERT INTO public.ia_depense_jour (jour, fournisseur, cout_usd, appels)
SELECT jour, fournisseur, sum(cout), count(*) FROM (
  SELECT (u.created_at AT TIME ZONE 'Europe/Paris')::date jour, public.ia_fournisseur_de(u.feature) fournisseur,
         nullif(u.metadata ->> 'cost_usd', '')::numeric cout
    FROM public.usage_logs u
   WHERE u.metadata ? 'cost_usd' AND u.created_at >= timestamp '2026-10-01 00:00' AT TIME ZONE 'Europe/Paris'
  UNION ALL
  SELECT (r.cree_le AT TIME ZONE 'Europe/Paris')::date, 'anthropic', r.cout_usd
    FROM public.rapprochement_ia_verdicts r
   WHERE r.cout_usd IS NOT NULL AND r.cree_le >= timestamp '2026-10-01 00:00' AT TIME ZONE 'Europe/Paris'
) x WHERE cout > 0 AND cout <= 50
GROUP BY 1, 2
ON CONFLICT (jour, fournisseur) DO UPDATE SET cout_usd = EXCLUDED.cout_usd, appels = EXCLUDED.appels, maj_le = now();

CREATE OR REPLACE FUNCTION public.ia_depense_etat()
 RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  WITH j AS (SELECT (now() AT TIME ZONE 'Europe/Paris')::date jour)
  SELECT jsonb_build_object(
    'jour', (SELECT jour FROM j),
    'anthropic_jour', coalesce((SELECT round(sum(cout_usd), 4) FROM ia_depense_jour d, j WHERE d.jour = j.jour AND fournisseur = 'anthropic'), 0),
    'openai_jour', coalesce((SELECT round(sum(cout_usd), 4) FROM ia_depense_jour d, j WHERE d.jour = j.jour AND fournisseur = 'openai'), 0),
    'anthropic_mois', coalesce((SELECT round(sum(cout_usd), 4) FROM ia_depense_jour d, j WHERE date_trunc('month', d.jour) = date_trunc('month', j.jour) AND fournisseur = 'anthropic'), 0),
    'openai_mois', coalesce((SELECT round(sum(cout_usd), 4) FROM ia_depense_jour d, j WHERE date_trunc('month', d.jour) = date_trunc('month', j.jour) AND fournisseur = 'openai'), 0));
$function$;
REVOKE ALL ON FUNCTION public.ia_depense_etat() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ia_depense_etat() TO service_role;

-- ── 2. Correspondances apprises ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.deduction_apprise (
  platform text NOT NULL CHECK (platform IN ('leboncoin', 'beebs', 'ebay')),
  categorie text NOT NULL,            -- feuille (Leboncoin, Beebs : dernier libellé du chemin ; eBay : numéro)
  champ text NOT NULL,                -- clé du champ (lbcAspects, ebayAspects, champ Beebs)
  source text NOT NULL CHECK (source IN ('vinted', 'categorie')),
  source_valeur text NOT NULL,        -- catalogue Vinted ('vinted'), '*' ('categorie')
  valeur text NOT NULL,
  n integer NOT NULL,                 -- articles distincts
  comptes integer NOT NULL,
  maj_le timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (platform, categorie, champ, source, source_valeur)
);
ALTER TABLE public.deduction_apprise ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.deduction_apprise FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.deduction_apprise TO service_role;

-- Les champs que l'apprentissage ne touche JAMAIS (la fiche et le texte du vendeur font foi).
CREATE OR REPLACE FUNCTION public.deduction_champ_interdit(p_champ text)
 RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path TO 'public'
AS $function$
  SELECT coalesce(p_champ, '') ~* ('^(condition|etat|état|brand|marque|color|colour|couleur|size|taille|pointure|shoe_size|'
    || 'material|mati[eè]re|price|prix|weight|poids|estimated_parcel|parcel|format_colis|colis|shipping|livraison|'
    || 'longueur|largeur|hauteur|profondeur|dimension|ean|isbn|upc|mpn|mod[eè]le|model|num[eé]ro|reference|référence|'
    || 'rating|is_|quantit|garantie|ann[ée]e|year|capacit|contenance|volume|puissance|tour|stockage|memoire|mémoire)')
    OR coalesce(p_champ, '') ~* '(_brand|_color|_colour|_size|_material|_weight|_condition|brand_|color_|size_)';
$function$;

CREATE OR REPLACE FUNCTION public.deduction_apprise_reconstruire()
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_n integer;
  v_t0 timestamptz := clock_timestamp();
BEGIN
  SET LOCAL statement_timeout = '60s';
  CREATE TEMP TABLE _obs (user_id uuid, inventaire_id bigint, platform text, categorie text, champ text, valeur text, v text) ON COMMIT DROP;
  -- Le catalogue Vinted de la fiche : colonne, sinon instantané de la dernière republication Vinted.
  CREATE TEMP TABLE _vc ON COMMIT DROP AS
    SELECT DISTINCT ON (inventaire_id) inventaire_id, v FROM (
      SELECT i.id inventaire_id, i.vinted_catalog_id::text v FROM inventaire i WHERE i.vinted_catalog_id IS NOT NULL
      UNION ALL
      SELECT * FROM (SELECT DISTINCT ON (j.inventaire_id) j.inventaire_id, j.platform_fields -> 'republish_snapshot' ->> 'catalog_id' v
                       FROM cross_post_jobs j
                      WHERE j.platform = 'vinted' AND j.action = 'republish' AND j.inventaire_id IS NOT NULL
                        AND j.platform_fields -> 'republish_snapshot' ? 'catalog_id'
                      ORDER BY j.inventaire_id, j.created_at DESC) x
    ) y WHERE v ~ '^\d+$' ORDER BY inventaire_id;
  -- Annonces ACCEPTÉES en ligne (publiées ou vendues), une par article et plateforme (la plus récente).
  CREATE TEMP TABLE _acc ON COMMIT DROP AS
    SELECT DISTINCT ON (j.inventaire_id, j.platform) j.user_id, j.inventaire_id, j.platform, j.platform_fields pf
      FROM cross_post_jobs j
     WHERE j.status IN ('published', 'sold') AND j.action IN ('publish', 'republish')
       AND coalesce(j.handler_build, '') NOT LIKE 'releve%' AND j.platform IN ('leboncoin', 'beebs', 'ebay')
       AND j.inventaire_id IS NOT NULL
     ORDER BY j.inventaire_id, j.platform, j.created_at DESC;
  INSERT INTO _obs
    SELECT a.user_id, a.inventaire_id, 'leboncoin', a.pf -> 'lbcCategoryPath' ->> (jsonb_array_length(a.pf -> 'lbcCategoryPath') - 1),
           kv.key, btrim(kv.value #>> '{}'), NULL
      FROM _acc a CROSS JOIN LATERAL jsonb_each(CASE WHEN jsonb_typeof(a.pf -> 'lbcAspects') = 'object' THEN a.pf -> 'lbcAspects' ELSE '{}'::jsonb END) kv
     WHERE a.platform = 'leboncoin' AND jsonb_typeof(a.pf -> 'lbcCategoryPath') = 'array' AND jsonb_typeof(kv.value) IN ('string', 'number');
  INSERT INTO _obs
    SELECT a.user_id, a.inventaire_id, 'ebay', a.pf ->> 'ebayCategoryId', kv.key, btrim(kv.value #>> '{}'), NULL
      FROM _acc a CROSS JOIN LATERAL jsonb_each(CASE WHEN jsonb_typeof(a.pf -> 'ebayAspects') = 'object' THEN a.pf -> 'ebayAspects' ELSE '{}'::jsonb END) kv
     WHERE a.platform = 'ebay' AND coalesce(a.pf ->> 'ebayCategoryId', '') <> '' AND jsonb_typeof(kv.value) IN ('string', 'number');
  INSERT INTO _obs
    SELECT a.user_id, a.inventaire_id, 'beebs', btrim(regexp_replace(a.pf ->> 'beebsCategoryPath', '^.*>', '')), c.k, btrim(a.pf ->> c.k), NULL
      FROM _acc a CROSS JOIN (VALUES ('genre'), ('age')) c(k)
     WHERE a.platform = 'beebs' AND coalesce(a.pf ->> 'beebsCategoryPath', '') <> '' AND jsonb_typeof(a.pf -> c.k) IN ('string', 'number');
  -- Annonces Leboncoin RELEVÉES (la valeur choisie par le vendeur sur Leboncoin) : libellés de la page.
  INSERT INTO _obs
    SELECT a.user_id, a.inventaire_id, 'leboncoin', btrim(a.capture ->> 'categorie'), e ->> 'key', btrim(e ->> 'value_label'), NULL
      FROM annonces_plateforme a CROSS JOIN LATERAL jsonb_array_elements(a.capture -> 'attributs_bruts') e
     WHERE a.platform = 'leboncoin' AND a.inventaire_id IS NOT NULL AND a.disparu_le IS NULL
       AND jsonb_typeof(a.capture -> 'attributs_bruts') = 'array' AND e ->> 'key_label' IS NOT NULL
       AND coalesce(a.capture ->> 'categorie', '') <> '';
  DELETE FROM _obs WHERE coalesce(valeur, '') = '' OR coalesce(categorie, '') = '' OR public.deduction_champ_interdit(champ)
     OR char_length(valeur) > 120 OR char_length(categorie) > 200 OR char_length(champ) > 80;
  UPDATE _obs o SET v = vc.v FROM _vc vc WHERE vc.inventaire_id = o.inventaire_id;

  DELETE FROM deduction_apprise;
  INSERT INTO deduction_apprise (platform, categorie, champ, source, source_valeur, valeur, n, comptes, maj_le)
    SELECT platform, categorie, champ, 'vinted', v, min(valeur), count(DISTINCT inventaire_id), count(DISTINCT user_id), now()
      FROM _obs WHERE v IS NOT NULL GROUP BY platform, categorie, champ, v
    HAVING count(DISTINCT lower(valeur)) = 1 AND count(DISTINCT inventaire_id) >= 4 AND count(DISTINCT user_id) >= 2;
  INSERT INTO deduction_apprise (platform, categorie, champ, source, source_valeur, valeur, n, comptes, maj_le)
    SELECT platform, categorie, champ, 'categorie', '*', min(valeur), count(DISTINCT inventaire_id), count(DISTINCT user_id), now()
      FROM _obs GROUP BY platform, categorie, champ
    HAVING count(DISTINCT lower(valeur)) = 1 AND count(DISTINCT inventaire_id) >= 8 AND count(DISTINCT user_id) >= 3;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN jsonb_build_object('lignes', (SELECT count(*) FROM deduction_apprise), 'categorie_seule', v_n,
                            'observations', (SELECT count(*) FROM _obs),
                            'duree_ms', round(extract(epoch FROM clock_timestamp() - v_t0) * 1000));
END;
$function$;
REVOKE ALL ON FUNCTION public.deduction_apprise_reconstruire() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.deduction_apprise_reconstruire() TO service_role;

-- ── 3. La bascule par (plateforme, champ) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS public.deduction_bascule (
  platform text NOT NULL,
  champ text NOT NULL,
  etat text NOT NULL DEFAULT 'eteint' CHECK (etat IN ('eteint', 'fantome', 'actif', 'coupe')),
  banc jsonb,                      -- le banc du 18/10 (figé) : n testés, couverts, justes, faux
  mesure jsonb,                    -- dernière mesure du fantôme / de ce qui est posé
  depuis timestamptz NOT NULL DEFAULT now(),
  motif text,
  PRIMARY KEY (platform, champ)
);
ALTER TABLE public.deduction_bascule ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.deduction_bascule FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.deduction_bascule TO service_role;

-- Les champs qui ont passé le BANC du 18/10 sans une seule erreur (appris avant le 06/10, testés sur les annonces
-- acceptées après : scripts/banc-deduction-apprise.mjs, docs/enquetes/zero-orange-1810/banc-deduction.json).
INSERT INTO public.deduction_bascule (platform, champ, etat, banc, motif) VALUES
  ('leboncoin', 'clothing_type', 'fantome', '{"test":27,"couverts":11,"justes":11,"faux":0}', 'banc 18/10 : 11/11'),
  ('leboncoin', 'clothing_category', 'fantome', '{"test":27,"couverts":10,"justes":10,"faux":0}', 'banc 18/10 : 10/10'),
  ('leboncoin', 'leisure_book_language', 'fantome', '{"test":10,"couverts":10,"justes":10,"faux":0}', 'banc 18/10 : 10/10'),
  ('leboncoin', 'leisure_collection_product', 'fantome', '{"test":21,"couverts":8,"justes":8,"faux":0}', 'banc 18/10 : 8/8'),
  ('leboncoin', 'toy_type', 'fantome', '{"test":37,"couverts":3,"justes":3,"faux":0}', 'banc 18/10 : 3/3'),
  ('beebs', 'genre', 'fantome', '{"test":188,"couverts":29,"justes":29,"faux":0}', 'banc 18/10 : 29/29'),
  ('ebay', 'Département', 'fantome', '{"test":64,"couverts":2,"justes":2,"faux":0}', 'banc 18/10 : 2/2'),
  ('ebay', 'Type', 'fantome', '{"test":109,"couverts":2,"justes":2,"faux":0}', 'banc 18/10 : 2/2')
ON CONFLICT (platform, champ) DO NOTHING;

-- ── 4. La lecture de l'app ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.deduction_apprise_pour(p_platform text, p_categorie text, p_vinted_catalog text DEFAULT NULL, p_champs text[] DEFAULT NULL)
 RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  WITH b AS (SELECT champ, etat FROM deduction_bascule WHERE platform = p_platform AND etat IN ('fantome', 'actif')
              AND (p_champs IS NULL OR champ = ANY (p_champs)))
  SELECT coalesce(jsonb_object_agg(x.champ, jsonb_build_object('valeur', x.valeur, 'n', x.n, 'comptes', x.comptes, 'source', x.source, 'etat', x.etat)), '{}'::jsonb)
    FROM (
      SELECT DISTINCT ON (d.champ) d.champ, d.valeur, d.n, d.comptes, d.source, b.etat
        FROM deduction_apprise d JOIN b ON b.champ = d.champ
       WHERE auth.uid() IS NOT NULL AND d.platform = p_platform AND d.categorie = btrim(coalesce(p_categorie, ''))
         AND ((d.source = 'vinted' AND d.source_valeur = btrim(coalesce(p_vinted_catalog, ''))) OR d.source = 'categorie')
       ORDER BY d.champ, (d.source = 'vinted') DESC
    ) x;
$function$;
REVOKE ALL ON FUNCTION public.deduction_apprise_pour(text, text, text, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.deduction_apprise_pour(text, text, text, text[]) TO authenticated, service_role;

-- ── 5. L'évaluation et la bascule automatiques (critères CODÉS) ─────────────
CREATE OR REPLACE FUNCTION public.deduction_bascule_evaluer()
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  r record;
  v_out jsonb := '[]'::jsonb;
  v_mesure jsonb;
  v_etat text;
  v_motif text;
BEGIN
  SET LOCAL statement_timeout = '30s';
  FOR r IN
    WITH ev AS (
      SELECT u.feature, u.created_at, u.metadata ->> 'platform' platform, u.metadata ->> 'champ' champ,
             lower(btrim(u.metadata ->> 'valeur')) valeur, (u.metadata ->> 'inventaire_id')::bigint inventaire_id
        FROM usage_logs u
       WHERE u.feature IN ('deduction_fantome', 'deduction_apprise_posee') AND u.created_at > now() - interval '14 days'
         AND (u.metadata ->> 'inventaire_id') ~ '^\d+$'
    ), fin AS (
      SELECT ev.*, j.status job_statut,
             lower(btrim(CASE ev.platform
               WHEN 'leboncoin' THEN j.platform_fields -> 'lbcAspects' ->> ev.champ
               WHEN 'ebay' THEN j.platform_fields -> 'ebayAspects' ->> ev.champ
               ELSE j.platform_fields ->> ev.champ END)) finale
        FROM ev
        LEFT JOIN LATERAL (
          SELECT j.status, j.platform_fields FROM cross_post_jobs j
           WHERE j.inventaire_id = ev.inventaire_id AND j.platform = ev.platform AND j.action IN ('publish', 'republish')
             AND j.created_at > ev.created_at - interval '2 hours'
           ORDER BY j.created_at DESC LIMIT 1) j ON true
    )
    SELECT b.platform, b.champ, b.etat, b.depuis,
           min(f.created_at) FILTER (WHERE f.feature = 'deduction_fantome') premier_fantome,
           count(*) FILTER (WHERE f.feature = 'deduction_fantome' AND f.job_statut IN ('published', 'sold') AND f.finale IS NOT NULL) f_n,
           count(*) FILTER (WHERE f.feature = 'deduction_fantome' AND f.job_statut IN ('published', 'sold') AND f.finale = f.valeur) f_justes,
           count(*) FILTER (WHERE f.feature = 'deduction_apprise_posee' AND f.created_at > now() - interval '72 hours' AND f.job_statut IN ('published', 'sold') AND f.finale IS NOT NULL) p_n,
           count(*) FILTER (WHERE f.feature = 'deduction_apprise_posee' AND f.created_at > now() - interval '72 hours' AND f.job_statut IN ('published', 'sold') AND f.finale = f.valeur) p_justes,
           count(*) FILTER (WHERE f.feature = 'deduction_apprise_posee' AND f.created_at > now() - interval '72 hours' AND f.job_statut IS NOT NULL) p_jobs,
           count(*) FILTER (WHERE f.feature = 'deduction_apprise_posee' AND f.created_at > now() - interval '72 hours' AND f.job_statut IN ('needs_user', 'failed')) p_refus
      FROM deduction_bascule b
      LEFT JOIN fin f ON f.platform = b.platform AND f.champ = b.champ
     WHERE b.etat IN ('fantome', 'actif')
     GROUP BY b.platform, b.champ, b.etat, b.depuis
  LOOP
    v_etat := r.etat; v_motif := NULL;
    v_mesure := jsonb_build_object('le', now(), 'fantome', jsonb_build_object('n', r.f_n, 'justes', r.f_justes, 'premier', r.premier_fantome),
                                   'pose_72h', jsonb_build_object('n', r.p_n, 'justes', r.p_justes, 'jobs', r.p_jobs, 'refus', r.p_refus));
    IF r.etat = 'fantome' THEN
      -- ALLUMAGE : ≥ 48 h de fantôme, ≥ 15 cas relus sur des annonces acceptées, 100 % égaux.
      IF r.premier_fantome IS NOT NULL AND r.premier_fantome < now() - interval '48 hours' AND r.f_n >= 15 AND r.f_justes = r.f_n THEN
        v_etat := 'actif'; v_motif := format('fantôme parfait : %s/%s justes depuis %s', r.f_justes, r.f_n, r.premier_fantome);
      END IF;
    ELSE
      -- RETOUR ARRIÈRE : ce qui est posé se trompe (< 97 % sur ≥ 10 cas en 72 h) ou les refus remontent.
      IF r.p_n >= 10 AND r.p_justes::numeric / r.p_n < 0.97 THEN
        v_etat := 'coupe'; v_motif := format('posé : %s/%s justes en 72 h (< 97 %%)', r.p_justes, r.p_n);
      ELSIF r.p_jobs >= 10 AND r.p_refus::numeric / r.p_jobs > (
              SELECT coalesce(count(*) FILTER (WHERE j.status IN ('needs_user', 'failed'))::numeric / nullif(count(*), 0), 0) + 0.15
                FROM cross_post_jobs j WHERE j.platform = r.platform AND j.action = 'publish'
                 AND j.created_at > now() - interval '7 days' AND j.created_at < now() - interval '72 hours') THEN
        v_etat := 'coupe'; v_motif := format('refus de la plateforme : %s/%s en 72 h (+15 points sur la semaine d''avant)', r.p_refus, r.p_jobs);
      END IF;
    END IF;
    IF v_etat IS DISTINCT FROM r.etat THEN
      UPDATE deduction_bascule SET etat = v_etat, depuis = now(), motif = v_motif, mesure = v_mesure
       WHERE platform = r.platform AND champ = r.champ;
      v_out := v_out || jsonb_build_object('platform', r.platform, 'champ', r.champ, 'de', r.etat, 'a', v_etat, 'motif', v_motif);
    ELSE
      UPDATE deduction_bascule SET mesure = v_mesure
       WHERE platform = r.platform AND champ = r.champ
         AND (mesure - 'le') IS DISTINCT FROM (v_mesure - 'le');
    END IF;
  END LOOP;
  IF jsonb_array_length(v_out) > 0 THEN
    INSERT INTO usage_logs (user_id, feature, metadata) VALUES (NULL, 'deduction_bascule', jsonb_build_object('changements', v_out));
  END IF;
  RETURN jsonb_build_object('changements', v_out);
END;
$function$;
REVOKE ALL ON FUNCTION public.deduction_bascule_evaluer() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.deduction_bascule_evaluer() TO service_role;

-- ── 6. Les tâches de nuit (UTC) ─────────────────────────────────────────────
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname IN ('deduction-apprise-nuit', 'deduction-bascule-6h');
SELECT cron.schedule('deduction-apprise-nuit', '35 2 * * *', $$ SET statement_timeout = '70s'; SELECT public.deduction_apprise_reconstruire(); $$);
SELECT cron.schedule('deduction-bascule-6h', '17 */6 * * *', $$ SET statement_timeout = '40s'; SELECT public.deduction_bascule_evaluer(); $$);

-- Première construction, tout de suite.
SELECT public.deduction_apprise_reconstruire();

COMMIT;
