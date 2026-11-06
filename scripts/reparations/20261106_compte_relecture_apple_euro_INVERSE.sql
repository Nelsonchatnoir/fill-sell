-- INVERSE de scripts/reparations/20261106_compte_relecture_apple_euro.sql : le compte de relecture Apple reprend la devise
-- sauvegardée (RSD), puis la sauvegarde est supprimée. Rien n'est écrit si le compte n'est plus en EUR.
-- Lancement : npx supabase db query --linked -f scripts/reparations/20261106_compte_relecture_apple_euro_INVERSE.sql
BEGIN;

DO $$
BEGIN
  IF to_regclass('public._backup_0611_relecture_apple_devise') IS NULL THEN
    RAISE EXCEPTION 'aucune sauvegarde _backup_0611_relecture_apple_devise : rien à inverser';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = 'd6a9e726-b6f1-4b7f-a927-2487668d6d96' AND currency = 'EUR') THEN
    RAISE EXCEPTION 'le compte n''est plus en EUR : rien n''est écrit (relire avant)';
  END IF;
END $$;

UPDATE public.profiles p SET currency = b.avant
  FROM public._backup_0611_relecture_apple_devise b
 WHERE p.id = b.id AND p.currency = 'EUR';

DROP TABLE public._backup_0611_relecture_apple_devise;

SELECT id, currency FROM public.profiles WHERE id = 'd6a9e726-b6f1-4b7f-a927-2487668d6d96';

COMMIT;
