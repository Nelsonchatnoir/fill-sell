-- 20261115_scan_ebay_rendu_refus_avant_appel_INVERSE.sql — inverse de 20261115_scan_ebay_rendu_refus_avant_appel.sql.
-- Remet sur chaque fiche la valeur de attributs->'lens_scan' lue dans public._backup_1511_lens_scan_rendu — SEULEMENT là
-- où le marqueur est ENCORE celui posé par la réparation (statut « rendu », reparation « 20261115 ») : une fiche rescannée
-- depuis (marqueur neuf « ok », « echec », « en_cours » ou un « rendu » écrit par le worker) garde son scan, il est réel ;
-- elle est comptée à part. Seule la clé lens_scan est réécrite (le déclencheur de fusion garde les autres attributs).
-- La sauvegarde est gardée (renommée) pour la traçabilité.
-- À jouer : npx supabase db query --linked -f scripts/reparations/20261115_scan_ebay_rendu_refus_avant_appel_INVERSE.sql
BEGIN;
SET LOCAL lock_timeout = '5s';
DO $inverse$
DECLARE
  v_sauve integer;
  v_n integer;
  v_rescannees integer;
BEGIN
  IF to_regclass('public._backup_1511_lens_scan_rendu') IS NULL THEN
    RAISE EXCEPTION 'sauvegarde absente (script jamais passé, ou inverse déjà joué) : rien n''est écrit';
  END IF;
  SELECT count(*) INTO v_sauve FROM public._backup_1511_lens_scan_rendu;
  IF v_sauve <> 10 THEN RAISE EXCEPTION 'sauvegarde incomplète (% lignes sur 10) : rien n''est écrit', v_sauve; END IF;
  SELECT count(*) INTO v_rescannees FROM public.inventaire i JOIN public._backup_1511_lens_scan_rendu b ON b.id = i.id AND b.user_id = i.user_id
   WHERE coalesce(i.attributs -> 'lens_scan' -> 'v' ->> 'reparation', '') <> '20261115';
  UPDATE public.inventaire i SET attributs = jsonb_build_object('lens_scan', b.lens_scan_avant)
    FROM public._backup_1511_lens_scan_rendu b
   WHERE i.id = b.id AND i.user_id = b.user_id
     AND i.attributs -> 'lens_scan' -> 'v' ->> 'statut' = 'rendu'
     AND i.attributs -> 'lens_scan' -> 'v' ->> 'reparation' = '20261115';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RAISE NOTICE 'lens_scan remis sur % fiches ; % rescannées depuis, laissées telles quelles (sur % sauvegardées)', v_n, v_rescannees, v_sauve;
END $inverse$;
ALTER TABLE public._backup_1511_lens_scan_rendu RENAME TO _backup_1511_lens_scan_rendu_inverse_joue;
COMMIT;
