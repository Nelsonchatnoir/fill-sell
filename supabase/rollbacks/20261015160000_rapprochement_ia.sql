-- Inverse de 20261015160000_rapprochement_ia.sql. Les décisions déjà prises par
-- l'IA restent (decide_par = 'ia', traçables) ; pour les défaire : les fusions
-- par inventaire_fusion_defaire (fusion_id), les refus en repassant la ligne à
-- 'proposee'. La table des verdicts est gardée (journal), seule la fonction part.
drop function if exists public.inventaire_doublon_decider_ia(uuid, text, text);
