-- INVERSE de 20261026_copies_valeurs_fausses.sql : remet les 5 copies (platform_fields) et les 3 fiches (attributs)
-- telles qu'elles étaient, depuis _backup_2610_copies_valeurs_fausses — SEULEMENT si la ligne porte encore la valeur
-- écrite par le script (aucune republication ni réponse ne l'a changée depuis). Sinon RAISE : rien n'est fait.
BEGIN;
SET LOCAL statement_timeout = '60s';
DO $$
DECLARE n integer;
BEGIN
  UPDATE public.cross_post_jobs j SET platform_fields = b.avant
    FROM public._backup_2610_copies_valeurs_fausses b
   WHERE b.quoi = 'job' AND j.id::text = b.id
     AND j.platform_fields->'correction_tracee'->>'par' LIKE 'scripts/reparations/20261026_copies_valeurs_fausses.sql%'
     AND j.platform_fields->>(j.platform_fields->'correction_tracee'->>'cle') = j.platform_fields->'correction_tracee'->>'apres';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 5 THEN RAISE EXCEPTION 'copies : 5 attendues encore telles que le script les a laissées, % — rien n''est fait', n; END IF;
  UPDATE public.inventaire i SET attributs = b.avant
    FROM public._backup_2610_copies_valeurs_fausses b
   WHERE b.quoi = 'fiche' AND i.id::text = b.id
     AND i.attributs->'age'->>'par' = 'scripts/reparations/20261026_copies_valeurs_fausses.sql';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 3 THEN RAISE EXCEPTION 'fiches : 3 attendues encore telles que le script les a laissées, % — rien n''est fait', n; END IF;
END $$;
SELECT b.quoi, b.id FROM public._backup_2610_copies_valeurs_fausses b ORDER BY 1, 2;
COMMIT;
