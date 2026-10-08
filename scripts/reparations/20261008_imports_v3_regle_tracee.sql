-- ════════════════════════════════════════════════════════════════════════════
-- LES IMPORTS DU MOTEUR v3 PORTENT LEUR RÈGLE (08/10/2026, complément de Nico)
-- ════════════════════════════════════════════════════════════════════════════
-- Constat de Nico : les 4 fiches Leboncoin de romain.knc (08/10 10:32 Paris) et
-- les imports de la nuit (ocbijoux62…) ont un détail {"voie":"rapprochement",
-- "job_id":…} SANS « regle : rapprochement_v3 ». Établi : ce sont bien des
-- décisions du moteur v3 (journaux de la fonction `rapprochement` : passe du
-- compte 7e436336 à 08:32:16 UTC, 17 nœuds, plan « creer 4 ») ; depuis la nuit,
-- rapprocher_importer n'est appelé que par rapprochement_v3_fiche_de (voie
-- « rapprochement ») ou par la personne (voie « utilisateur ») — le moteur v2
-- (rapprochement_avancer) n'appelle plus rien depuis 20261008100000. Il
-- écrivait simplement son propre détail. On pose la règle sur ces lignes (et
-- 20261008130000 la pose désormais à l'écriture) : la réparation du parc ne les
-- prend plus pour des imports d'un ancien moteur.
-- Lignes visées : décision « import », par « auto », voie « rapprochement »,
-- créées depuis le 07/10 23:30 UTC (début de la réparation v3 du parc), sans
-- règle. Sauvegarde : _backup_0810_regle_v3 (RLS, fermée).
-- Inverse : 20261008_imports_v3_regle_tracee_INVERSE.sql
BEGIN;
CREATE TABLE IF NOT EXISTS public._backup_0810_regle_v3 AS
  SELECT r.id, r.user_id, r.detail, now() AS sauvegarde_le FROM public.rapprochements r WHERE false;
ALTER TABLE public._backup_0810_regle_v3 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_0810_regle_v3 FROM PUBLIC, anon, authenticated;

INSERT INTO public._backup_0810_regle_v3 (id, user_id, detail, sauvegarde_le)
SELECT r.id, r.user_id, r.detail, now() FROM public.rapprochements r
 WHERE r.decision = 'import' AND r.par = 'auto' AND r.detail ->> 'voie' = 'rapprochement'
   AND r.created_at >= timestamptz '2026-10-07 23:30:00+00' AND NOT (r.detail ? 'regle')
   AND NOT EXISTS (SELECT 1 FROM public._backup_0810_regle_v3 b WHERE b.id = r.id);

UPDATE public.rapprochements r
   SET detail = r.detail || jsonb_build_object('regle', 'rapprochement_v3', 'regle_posee', '20261008_tracabilite')
  FROM public._backup_0810_regle_v3 b
 WHERE b.id = r.id AND NOT (r.detail ? 'regle');

SELECT (SELECT count(*) FROM public._backup_0810_regle_v3) sauvegardees,
       (SELECT count(*) FROM public.rapprochements WHERE detail ->> 'regle_posee' = '20261008_tracabilite') tracees,
       (SELECT count(DISTINCT user_id) FROM public._backup_0810_regle_v3) comptes;
COMMIT;
