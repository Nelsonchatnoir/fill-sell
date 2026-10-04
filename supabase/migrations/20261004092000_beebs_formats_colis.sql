SET lock_timeout = '8s';
-- ═══════════════════════════════════════════════════════════════════════════
-- BEEBS — LES FORMATS DE COLIS, APPRIS DU FORMULAIRE (04/10, Louis — point 2)
-- ═══════════════════════════════════════════════════════════════════════════
-- La page d'une annonce Beebs ne dit son format de colis que par un
-- identifiant (`weight_id`, relevé le 04/10 sur l'annonce 34097762 :
-- « 5i5zYtqOJt3Ji8EEtKhvP0 ») ; le libellé (« Poids jusqu'à 500g max ») n'y
-- figure pas. Le formulaire de dépôt, lui, porte la correspondance : chaque
-- option de « Format du colis » est un objet { sys: { id }, title, weight }
-- (beebs.js, relevé fiber des champs). L'extension (0.6.95) la note ici à
-- chaque formulaire qu'elle remplit ; le serveur s'en sert pour traduire le
-- format lu sur une annonce en poids de fiche, et pour la republication.
--
-- ⛔ PREMIÈRE ÉCRITURE GAGNANTE : une correspondance déjà connue n'est jamais
--    réécrite par un autre libellé (le désaccord est tracé en avertissement).
-- ⛔ Seuls les paliers réels de Beebs sont acceptés (200 g, 500 g, 1, 2, 5,
--    10, 15 kg — relevés en base, beebs.js) : un libellé hors liste est
--    refusé, rien n'est inventé.
-- Idempotente.

CREATE TABLE IF NOT EXISTS public.beebs_formats_colis (
  id            text PRIMARY KEY CHECK (id ~ '^[A-Za-z0-9]{8,40}$'),
  titre         text NOT NULL,
  poids_g       integer NOT NULL CHECK (poids_g IN (200, 500, 1000, 2000, 5000, 10000, 15000)),
  vu_le         timestamptz NOT NULL DEFAULT now(),
  vu_par        uuid,
  confirmations integer NOT NULL DEFAULT 1
);

ALTER TABLE public.beebs_formats_colis ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "formats beebs lisibles" ON public.beebs_formats_colis;
CREATE POLICY "formats beebs lisibles" ON public.beebs_formats_colis
  FOR SELECT TO authenticated USING (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.beebs_formats_colis TO authenticated;
GRANT ALL ON public.beebs_formats_colis TO service_role;

COMMENT ON TABLE public.beebs_formats_colis IS
  'Beebs : identifiant de format de colis (weight_id) → libellé et poids, appris du formulaire de dépôt par l''extension. 04/10/2026.';

-- « Poids jusqu'à 500g max » → 500 ; « Poids jusqu'à 1 kg max » → 1000.
CREATE OR REPLACE FUNCTION public.poids_g_de_texte(p text)
 RETURNS integer
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
DECLARE
  m text[];
  v numeric;
BEGIN
  m := regexp_match(lower(COALESCE(p, '')), '([0-9]+(?:[.,][0-9]+)?)\s*(kg|g)\M');
  IF m IS NULL THEN RETURN NULL; END IF;
  v := replace(m[1], ',', '.')::numeric;
  IF m[2] = 'kg' THEN v := v * 1000; END IF;
  IF v < 1 OR v > 200000 THEN RETURN NULL; END IF;
  RETURN round(v)::integer;
END;
$function$;

CREATE OR REPLACE FUNCTION public.noter_formats_colis_beebs(p_formats jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  f jsonb;
  v_id text;
  v_titre text;
  v_g integer;
  v_existant text;
  n integer := 0;
BEGIN
  IF auth.uid() IS NULL OR jsonb_typeof(p_formats) IS DISTINCT FROM 'array' THEN RETURN 0; END IF;
  FOR f IN SELECT value FROM jsonb_array_elements(p_formats) LIMIT 20 LOOP
    v_id := btrim(f ->> 'id');
    v_titre := btrim(regexp_replace(COALESCE(f ->> 'titre', ''), '\s+', ' ', 'g'));
    IF v_id IS NULL OR v_id !~ '^[A-Za-z0-9]{8,40}$' OR v_titre !~* '^poids jusqu' THEN CONTINUE; END IF;
    v_g := public.poids_g_de_texte(v_titre);
    IF v_g IS NULL OR v_g NOT IN (200, 500, 1000, 2000, 5000, 10000, 15000) THEN CONTINUE; END IF;
    SELECT titre INTO v_existant FROM beebs_formats_colis WHERE id = v_id;
    IF v_existant IS NULL THEN
      INSERT INTO beebs_formats_colis (id, titre, poids_g, vu_par) VALUES (v_id, v_titre, v_g, auth.uid())
      ON CONFLICT (id) DO NOTHING;
      n := n + 1;
    ELSIF lower(v_existant) = lower(v_titre) THEN
      UPDATE beebs_formats_colis SET confirmations = confirmations + 1, vu_le = now() WHERE id = v_id;
    ELSE
      RAISE WARNING 'noter_formats_colis_beebs : % déjà connu comme « % », « % » ignoré', v_id, v_existant, v_titre;
    END IF;
  END LOOP;
  RETURN n;
END;
$function$;
REVOKE ALL ON FUNCTION public.noter_formats_colis_beebs(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.noter_formats_colis_beebs(jsonb) TO authenticated;
