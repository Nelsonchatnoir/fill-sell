-- 04/10 nuit — retirer le choix de transporteurs Leboncoin posé par le RETEST
-- du lot (Claude, compte de Nico) : « Mondial Relay + Colissimo » avait été
-- coché pour l'annonce de test et retenu dans ses réglages ; il se serait
-- appliqué à ses vraies publications. Retour à « ceux que Leboncoin propose ».
-- Sauvegarde : la valeur retirée est dans le fichier _INVERSE.
SELECT public.platform_settings_fusionner(ARRAY['leboncoin'], NULL, ARRAY['transporteurs'], 'f44b5917-bccc-4431-ba41-f40571a2ed18'::uuid) -> 'leboncoin' -> 'transporteurs' AS apres;
