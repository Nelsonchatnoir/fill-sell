-- (06/11, lot « Prêt à soumettre », parcours connecté en anglais) LE COMPTE DE RELECTURE APPLE AFFICHAIT DES DINARS SERBES
-- test@fillsell.app (d6a9e726-b6f1-4b7f-a927-2487668d6d96) : profiles.currency = 'RSD' (le SEUL compte en RSD, relu le
-- 06/11 vers 12:55) — le relecteur Apple aurait vu « 7.833 RSD », « 40 RSD »… sur tous les écrans (captures du parcours
-- connecté, build/captures-anglais-connecte/). Le compte de relecture Google (googlereview@fillsell.app) est en EUR.
-- Ce que fait le script (rien d'autre) :
--   1. sauvegarde : public._backup_0611_relecture_apple_devise (la devise d'avant) ;
--   2. profiles.currency = 'EUR' pour CE compte seulement (aucun montant n'est converti : les montants sont des nombres,
--      la devise n'est que l'affichage).
-- Garde : rien n'est écrit si le compte n'est plus en RSD, ou si la sauvegarde existe déjà.
-- Inverse : scripts/reparations/20261106_compte_relecture_apple_euro_INVERSE.sql.
-- Lancement : npx supabase db query --linked -f scripts/reparations/20261106_compte_relecture_apple_euro.sql
BEGIN;

DO $$
DECLARE v_u uuid := 'd6a9e726-b6f1-4b7f-a927-2487668d6d96';
BEGIN
  IF to_regclass('public._backup_0611_relecture_apple_devise') IS NOT NULL THEN
    RAISE EXCEPTION 'la sauvegarde _backup_0611_relecture_apple_devise existe déjà : script déjà passé, rien n''est écrit';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = v_u AND lower(email) = 'test@fillsell.app') THEN
    RAISE EXCEPTION 'compte de relecture Apple introuvable : rien n''est écrit';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_u AND currency = 'RSD') THEN
    RAISE EXCEPTION 'le profil n''est plus en RSD (état relu le 06/11) : rien n''est écrit';
  END IF;
END $$;

CREATE TABLE public._backup_0611_relecture_apple_devise AS
  SELECT p.id, p.currency AS avant, now() AS le FROM public.profiles p WHERE p.id = 'd6a9e726-b6f1-4b7f-a927-2487668d6d96';
ALTER TABLE public._backup_0611_relecture_apple_devise ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public._backup_0611_relecture_apple_devise FROM PUBLIC, anon, authenticated;

UPDATE public.profiles SET currency = 'EUR'
 WHERE id = 'd6a9e726-b6f1-4b7f-a927-2487668d6d96' AND currency = 'RSD';

SELECT p.id, p.currency, b.avant FROM public.profiles p JOIN public._backup_0611_relecture_apple_devise b ON b.id = p.id;

COMMIT;
