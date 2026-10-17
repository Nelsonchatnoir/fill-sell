-- INVERSE de scripts/reparations/20261018_note_2348_louis_12_euros.sql : vente 181210
-- et note 2348 remises colonne pour colonne depuis _backup_1810_note_2348. Aucun mail.
-- Application : npx supabase db query --linked -f scripts/reparations/20261018_note_2348_louis_12_euros_INVERSE.sql
BEGIN;
SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '5s';
SET LOCAL fillsell.push_relance = '1';
DO $garde$ BEGIN
  IF to_regclass('public._backup_1810_note_2348') IS NULL THEN RAISE EXCEPTION 'sauvegarde absente : rien n''est fait'; END IF;
END $garde$;
UPDATE public.ventes v SET prix_vente = r.prix_vente, benefice = r.benefice
  FROM (SELECT (jsonb_populate_record(NULL::public.ventes, ligne)).* FROM public._backup_1810_note_2348 WHERE quoi = 'ventes') r WHERE v.id = r.id;
UPDATE public.push_ventes p SET prix = r.prix
  FROM (SELECT (jsonb_populate_record(NULL::public.push_ventes, ligne)).* FROM public._backup_1810_note_2348 WHERE quoi = 'push_ventes') r WHERE p.id = r.id;
SELECT 'vente' AS quoi, id, prix_vente::text AS montant FROM public.ventes WHERE id = 181210
UNION ALL SELECT 'note', id, prix::text FROM public.push_ventes WHERE id = 2348;
COMMIT;
