-- ═══════════════════════════════════════════════════════════════════════════
-- misscat801 — BOTTINES LPB (Beebs) HORS LIGNE : LA POINTURE DE SA FICHE (01/10)
-- ═══════════════════════════════════════════════════════════════════════════
-- GO de Nico, 01/10 matin. Republication Beebs 2586c549 (29/09 12:14) :
-- l'ancienne annonce a été RETIRÉE, puis la recréation s'est arrêtée sur
-- « Pointure » (la copie Beebs ne la portait pas) — needs_user depuis.
-- La pointure est CONNUE : fiche 1787988010354005, attributs.taille = « 40 »
-- (source capture), titre « Bottines LPB beige suédine – Taille 40 neuve » ;
-- « 40 » figure TEL QUEL dans la liste Beebs des pointures relevée sur la
-- question (34 … 46). Aucune valeur inventée ni rapprochée.
-- Geste = EXACTEMENT celui du bouton « Valider et relancer » de l'app
-- (StockTab, valider()) : cible de la question { key: 'taille', root: null },
-- needsUserResolved.taille, needsUserAttempts 0, erreur archivée, statut
-- pending. La recréation repartira quand l'extension de misscat801 se
-- réveillera (vue pour la dernière fois le 30/09 19:10, 0.6.79).
-- INVERSE : en bas du fichier (commenté).
-- ═══════════════════════════════════════════════════════════════════════════
SET statement_timeout = '10s';
SET lock_timeout = '2s';

CREATE TABLE IF NOT EXISTS public._backup_republications_0110 (
  job_id uuid PRIMARY KEY, ligne jsonb NOT NULL, sauvegarde_le timestamptz NOT NULL DEFAULT now());
ALTER TABLE public._backup_republications_0110 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_republications_0110 FROM public, anon, authenticated;

INSERT INTO public._backup_republications_0110 (job_id, ligne)
SELECT j.id, to_jsonb(j) FROM public.cross_post_jobs j WHERE j.id = '2586c549-53f1-463d-82d2-f96596773da6'
ON CONFLICT (job_id) DO NOTHING;

UPDATE public.cross_post_jobs j
   SET status = 'pending',
       error = NULL,
       platform_fields = (j.platform_fields - 'needsUserField' - 'needsUserFields'
                          - 'needs_user_tick_le' - 'needs_user_actif_ms' - 'needs_user_vu_le' - 'needs_user_vu_erreur')
         || jsonb_build_object(
              'taille', '40',
              'needsUserAttempts', 0,
              'needsUserResolved', coalesce(j.platform_fields -> 'needsUserResolved', '{}'::jsonb) || jsonb_build_object('taille', '40'),
              'erreurs_archivees', coalesce(j.platform_fields -> 'erreurs_archivees', '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
                'le', now(), 'par', 'relance (pointure de la fiche, GO Nico 01/10)', 'erreur', j.error, 'statut', j.status)),
              'pointure_de_la_fiche', jsonb_build_object('le', now(), 'valeur', '40', 'source', 'inventaire.attributs.taille (capture) + titre',
                'pose_par', 'scripts/reparations/20261001_misscat801_bottines_pointure.sql'))
 WHERE j.id = '2586c549-53f1-463d-82d2-f96596773da6'
   AND j.status = 'needs_user'
   AND j.platform_fields -> 'needsUserField' ->> 'field_key' = 'Pointure'
   AND (SELECT i.attributs -> 'taille' ->> 'v' FROM public.inventaire i WHERE i.id = j.inventaire_id) = '40';

SELECT id, status, platform_fields ->> 'taille' AS taille FROM public.cross_post_jobs WHERE id = '2586c549-53f1-463d-82d2-f96596773da6';

-- ── INVERSE (à lancer seulement sur décision) ──────────────────────────────
-- UPDATE public.cross_post_jobs j SET status = b.ligne ->> 'status', error = b.ligne ->> 'error',
--        platform_fields = b.ligne -> 'platform_fields'
--   FROM public._backup_republications_0110 b
--  WHERE j.id = b.job_id AND j.id = '2586c549-53f1-463d-82d2-f96596773da6' AND j.status = 'pending';
