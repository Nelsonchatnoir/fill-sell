-- INVERSE de 20261105_regle_reetiquetage_manuel_auto.sql : remet chaque étiquette d'avant, lue dans la sauvegarde
-- public._backup_0511_reetiquetage_manuel_auto — annonces_plateforme.source_rapprochement = 'manuel', inventaire_fusions.par
-- = 'utilisateur:photo_rapprochement_v3[_main|_remise]'.
-- Comparer-et-écrire : une ligne n'est remise que si elle porte ENCORE la valeur posée par le script (et, pour une
-- annonce, la même fiche) — une annonce que le moteur ou la personne a rangée depuis garde sa nouvelle décision ; elle
-- est comptée à part (« laissees »). Mêmes précautions que le script : sans déclencheurs (SET LOCAL), lots de 250,
-- updated_at non touché. La sauvegarde est GARDÉE (DROP à la main, sur ordre).
-- ⛔ Si la migration 20261105190000 est défaite AVANT cet inverse, rien ne change pour les retraits (retrait_job_prouve
-- reconnaît les deux marques) ; seules les étiquettes reviennent.
BEGIN;
SET LOCAL statement_timeout = '120s';
SET LOCAL lock_timeout = '5s';
SET LOCAL session_replication_role = replica;
DO $inverse$
DECLARE v_lot integer; v_n integer; n_annonces integer := 0; n_fusions integer := 0;
BEGIN
  IF to_regclass('public._backup_0511_reetiquetage_manuel_auto') IS NULL THEN
    RAISE EXCEPTION 'sauvegarde _backup_0511_reetiquetage_manuel_auto absente : rien n''est écrit';
  END IF;
  IF current_setting('session_replication_role') <> 'replica' THEN
    RAISE EXCEPTION 'session_replication_role n''est pas « replica » : rien n''est écrit';
  END IF;
  FOR v_lot IN SELECT DISTINCT lot FROM public._backup_0511_reetiquetage_manuel_auto WHERE t = 'annonces_plateforme' ORDER BY 1 LOOP
    UPDATE public.annonces_plateforme a SET source_rapprochement = b.avant
      FROM public._backup_0511_reetiquetage_manuel_auto b
     WHERE b.t = 'annonces_plateforme' AND b.lot = v_lot
       AND a.id = b.cle::uuid AND a.user_id = b.user_id
       AND a.source_rapprochement = b.apres AND a.inventaire_id IS NOT DISTINCT FROM b.inventaire_id
       AND b.apres IS DISTINCT FROM b.avant;
    GET DIAGNOSTICS v_n = ROW_COUNT; n_annonces := n_annonces + v_n;
  END LOOP;
  FOR v_lot IN SELECT DISTINCT lot FROM public._backup_0511_reetiquetage_manuel_auto WHERE t = 'inventaire_fusions' ORDER BY 1 LOOP
    UPDATE public.inventaire_fusions f SET par = b.avant
      FROM public._backup_0511_reetiquetage_manuel_auto b
     WHERE b.t = 'inventaire_fusions' AND b.lot = v_lot
       AND f.id = b.cle::uuid AND f.user_id = b.user_id AND f.par = b.apres
       AND b.apres IS DISTINCT FROM b.avant;
    GET DIAGNOSTICS v_n = ROW_COUNT; n_fusions := n_fusions + v_n;
  END LOOP;
  RAISE NOTICE 'remises : % annonces, % fusions', n_annonces, n_fusions;
END $inverse$;
SET LOCAL session_replication_role = origin;

SELECT b.t AS table_, b.avant, b.apres, count(*) AS sauvegardees,
       count(*) FILTER (WHERE COALESCE(a.source_rapprochement, f.par) = b.avant) AS remises_valeur_d_avant,
       count(*) FILTER (WHERE COALESCE(a.source_rapprochement, f.par) IS DISTINCT FROM b.avant) AS laissees
  FROM public._backup_0511_reetiquetage_manuel_auto b
  LEFT JOIN public.annonces_plateforme a ON b.t = 'annonces_plateforme' AND a.id = b.cle::uuid
  LEFT JOIN public.inventaire_fusions f ON b.t = 'inventaire_fusions' AND f.id = b.cle::uuid
 GROUP BY 1, 2, 3 ORDER BY 1, 2, 3;
COMMIT;
