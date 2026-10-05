-- ═══════════════════════════════════════════════════════════════════════════
-- Rattrapage des photos eBay, CÔTÉ SERVEUR, par lots bornés — 04/10/2026 (GO Nico, 21:15)
-- ═══════════════════════════════════════════════════════════════════════════
-- Les lots lancés depuis le poste de Nico ont été coupés trois fois ce soir
-- (mémoire du poste). Même lot que scripts/reparations/20261004_photos_ebay_lot.sql,
-- tenu par un cron temporaire :
--   · 25 fiches toutes les 3 min, sauvegarde AVANT écriture dans la même
--     instruction (sauvegarde_photos_ebay_20261004) ;
--   · tour SAUTÉ si la dernière mesure de veille_cpu dépasse 50 % ;
--   · journal par tour (rattrapage_photos_ebay_journal) ;
--   · le cron se SUPPRIME lui-même quand il ne reste rien à compléter.
-- Garde « même source » : fiche_completer_photos_capture (fiche ≤ 1 photo, la
-- vignette de l'annonce ou sa copie rapatrie-fiche).
-- Inverse : SELECT cron.unschedule('rattrapage-photos-ebay-3min');
--           photos d'origine : scripts/reparations/20261004_photos_ebay_INVERSE.sql.
CREATE TABLE IF NOT EXISTS public.sauvegarde_photos_ebay_20261004 (
  inventaire_id bigint PRIMARY KEY, user_id uuid, photos jsonb, le timestamptz DEFAULT now());
ALTER TABLE public.sauvegarde_photos_ebay_20261004 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sauvegarde_photos_ebay_20261004 FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS public.rattrapage_photos_ebay_journal (
  id bigserial PRIMARY KEY, le timestamptz NOT NULL DEFAULT now(),
  issue text NOT NULL, lot integer, completees integer, cpu numeric);
ALTER TABLE public.rattrapage_photos_ebay_journal ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.rattrapage_photos_ebay_journal FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.rattrapage_photos_ebay_tick()
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_cpu numeric;
  v_lot integer := 0;
  v_ok integer := 0;
  r record;
BEGIN
  SELECT pct INTO v_cpu FROM veille_cpu WHERE pct IS NOT NULL ORDER BY le DESC LIMIT 1;
  IF v_cpu IS NOT NULL AND v_cpu > 50 THEN
    INSERT INTO rattrapage_photos_ebay_journal (issue, cpu) VALUES ('saute_cpu', v_cpu);
    RETURN jsonb_build_object('issue', 'saute_cpu', 'cpu', v_cpu);
  END IF;
  FOR r IN
    SELECT DISTINCT ON (i.id) i.id, i.user_id, i.photos, a.photo_url, a.donnees_index
      FROM inventaire i
      JOIN annonces_plateforme a ON a.inventaire_id = i.id AND a.disparu_le IS NULL AND a.platform = 'ebay'
     WHERE i.fusionne_dans IS NULL AND i.statut = 'stock' AND i.origine LIKE 'releve\_%'
       AND jsonb_array_length(CASE WHEN jsonb_typeof(i.photos) = 'array' THEN i.photos ELSE '[]' END) <= 1
       AND jsonb_typeof(a.donnees_index -> 'photos') = 'array' AND jsonb_array_length(a.donnees_index -> 'photos') > 1
       AND NOT EXISTS (SELECT 1 FROM sauvegarde_photos_ebay_20261004 s WHERE s.inventaire_id = i.id)
     ORDER BY i.id, a.vu_le DESC NULLS LAST
     LIMIT 25
  LOOP
    INSERT INTO sauvegarde_photos_ebay_20261004 (inventaire_id, user_id, photos)
    VALUES (r.id, r.user_id, r.photos) ON CONFLICT DO NOTHING;
    v_lot := v_lot + 1;
    IF fiche_completer_photos_capture(r.id, r.photo_url, r.donnees_index) THEN v_ok := v_ok + 1; END IF;
  END LOOP;
  IF v_lot = 0 THEN
    INSERT INTO rattrapage_photos_ebay_journal (issue, lot, completees, cpu) VALUES ('fini', 0, 0, v_cpu);
    PERFORM cron.unschedule('rattrapage-photos-ebay-3min');
    RETURN jsonb_build_object('issue', 'fini');
  END IF;
  INSERT INTO rattrapage_photos_ebay_journal (issue, lot, completees, cpu) VALUES ('lot', v_lot, v_ok, v_cpu);
  RETURN jsonb_build_object('issue', 'lot', 'lot', v_lot, 'completees', v_ok, 'cpu', v_cpu);
END;
$function$;
REVOKE ALL ON FUNCTION public.rattrapage_photos_ebay_tick() FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'rattrapage-photos-ebay-3min') THEN
    PERFORM cron.schedule('rattrapage-photos-ebay-3min', '*/3 * * * *', 'SELECT public.rattrapage_photos_ebay_tick()');
  END IF;
END $$;
