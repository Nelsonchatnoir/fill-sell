-- ═══════════════════════════════════════════════════════════════════════════
-- SAUVEGARDE 22/10 au soir — les copies en file AVANT que get-pending-jobs impose le contenu du vendeur (point 8)
-- ═══════════════════════════════════════════════════════════════════════════
-- La règle du point 8 (_shared/contenu-fiche.js, contenuAImposer) corrige AU DÉPART une copie rédigée avant que le
-- texte, l'état ou les photos du vendeur soient lus. Elle écrit dans cross_post_jobs (description, platform_fields.
-- etat, photos, marqueur platform_fields.contenu_du_vendeur). Avant son déploiement, toutes les copies en file
-- qu'elle peut toucher (publications et republications pending, hors republication Vinted) sont sauvegardées ici.
-- Rejeu du 22/10 20:5x sur ces 129 copies : 0 retenue, 4 corrigées (3 descriptions Beebs, 1 jeu de photos LBC).
-- Inverse d'une correction : remettre description / photos / platform_fields de _backup_2210_soir_contenu sur le job
-- (UPDATE … FROM _backup_2210_soir_contenu b WHERE j.id = b.job AND j.platform_fields ? 'contenu_du_vendeur').
BEGIN;
CREATE TABLE IF NOT EXISTS public._backup_2210_soir_contenu (
  le timestamptz DEFAULT now(), job uuid PRIMARY KEY, user_id uuid, inventaire_id bigint, platform text, action text,
  description text, photos jsonb, platform_fields jsonb);
ALTER TABLE public._backup_2210_soir_contenu ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_2210_soir_contenu FROM anon, authenticated;
INSERT INTO public._backup_2210_soir_contenu (job, user_id, inventaire_id, platform, action, description, photos, platform_fields)
SELECT j.id, j.user_id, j.inventaire_id, j.platform, j.action, j.description, to_jsonb(j.photos), j.platform_fields
  FROM public.cross_post_jobs j
 WHERE j.status = 'pending' AND j.action IN ('publish', 'republish') AND j.inventaire_id IS NOT NULL
   AND NOT (j.action = 'republish' AND j.platform = 'vinted')
ON CONFLICT (job) DO NOTHING;
COMMIT;
SELECT count(*) AS sauvegardees FROM public._backup_2210_soir_contenu;
