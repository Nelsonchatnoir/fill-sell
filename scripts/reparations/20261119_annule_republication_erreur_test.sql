-- (19/11/2026 soir) ERREUR DE MON ESSAI (Opus-2) : le script d'essai a ouvert la feuille « Remonter » d'une AUTRE fiche de
-- test de Nico (1793387931852, « TEST FillSell 30/10 — T-shirt femme Picture blanc taille S ») au lieu de la fiche A
-- (1793009407689000). La tâche de republication Vinted b213fbde, encore « pending », est annulée comme le fait le bouton
-- « Annuler » de l'app (rien n'a été retiré ni publié). Sauvegarde : _backup_1911_annule_b213fbde. Inverse : remettre
-- status/error depuis la sauvegarde (aucun intérêt : c'était une erreur).
BEGIN;
CREATE TABLE public._backup_1911_annule_b213fbde AS
  SELECT now() AS le, id, status, error, platform_fields FROM public.cross_post_jobs WHERE id = 'b213fbde-9265-44ed-ad1f-093c521658fe';
ALTER TABLE public._backup_1911_annule_b213fbde ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_1911_annule_b213fbde FROM PUBLIC, anon, authenticated;
UPDATE public.cross_post_jobs SET status = 'cancelled', error = 'Annulée à ta demande — rien n''a été publié.'
 WHERE id = 'b213fbde-9265-44ed-ad1f-093c521658fe' AND status = 'pending'
   AND user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18' AND inventaire_id = 1793387931852;
SELECT id, status, platform_fields->>'republish_step' etape FROM public.cross_post_jobs WHERE id = 'b213fbde-9265-44ed-ad1f-093c521658fe';
COMMIT;
