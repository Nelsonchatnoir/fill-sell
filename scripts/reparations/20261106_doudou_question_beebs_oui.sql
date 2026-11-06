-- (06/11, Nico, point 1 du lot — feu vert sur 20261106100000, « prouve-la sur un vrai cas ») La question « Déjà vendu ? »
-- 60621113 (copie Beebs 34032772 du Doudou de nicolas.menar, fiche 1790106697754007 vendue sur Vinted le 06/10) est
-- restée OUVERTE chez la personne : le 05/11 au soir le « Oui » donné hors de sa session n'armait rien — c'est le défaut.
-- Le retrait a été armé à la main (armer_retrait_annonce_pour) et fait le 05/11 à 22:25. Le « Oui » de l'équipe, sur ordre
-- de Nico du 05/11, passe maintenant par l'entrée inventaire_doublon_decider_pour (même corps, mêmes gardes que l'app) :
-- la copie étant déjà retirée, la règle ferme la question « sans objet » (aucun second retrait). Auteur écrit sur la question.
-- Inverse : 20261106_doudou_question_beebs_oui_INVERSE.sql.
BEGIN;
CREATE TABLE IF NOT EXISTS public._backup_0611_doudou_question AS
SELECT now() AS le, d.* FROM public.inventaire_doublons d WHERE d.id = '60621113-83d7-4258-8236-fc758effe593';
ALTER TABLE public._backup_0611_doudou_question ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_0611_doudou_question FROM PUBLIC, anon, authenticated;
SELECT public.inventaire_doublon_decider_pour('60621113-83d7-4258-8236-fc758effe593'::uuid, 'oui',
  '285e5620-fc56-43f9-8503-52c268dd8b08'::uuid, 'nico : ordre du 05/11 (Doudou vendu sur Vinted, copie Beebs 34032772 à retirer)') AS reponse;
SELECT id, statut, decide_par, preuves->'repondu_par' AS repondu_par FROM public.inventaire_doublons WHERE id = '60621113-83d7-4258-8236-fc758effe593';
COMMIT;
