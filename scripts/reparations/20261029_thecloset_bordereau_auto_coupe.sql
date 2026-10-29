-- (29/10, lot A point 6 c — demande de Nico) thecloset72000 (Pro, 8ac5bbda) ne veut plus que FillSell génère ses
-- bordereaux : sur Vinted Go, c'est en générant lui-même le bordereau qu'il voit le nom de l'acheteur (qu'il recopie
-- dans son suivi). Réglage « Bordereau automatique » = désactivé, par le seul chemin permis
-- (rpc platform_settings_fusionner, chemin ['bordereaux'], le format « code » est gardé). Effet : migration
-- 20261029151000_bordereau_auto_par_compte (bordereau_auto_actif). Aucun bordereau déjà récupéré effacé, aucune donnée
-- d'acheteur. Sauvegarde + inverse. Aucun mail.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

CREATE TABLE IF NOT EXISTS public._backup_2910_thecloset_bordereaux (
  user_id uuid PRIMARY KEY, bordereaux jsonb, le timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public._backup_2910_thecloset_bordereaux ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public._backup_2910_thecloset_bordereaux FROM anon, authenticated;

INSERT INTO public._backup_2910_thecloset_bordereaux (user_id, bordereaux)
SELECT id, platform_settings->'bordereaux' FROM public.profiles WHERE id = '8ac5bbda-0947-4612-82fd-effdaa3ca84a'
ON CONFLICT (user_id) DO NOTHING;

SELECT public.platform_settings_fusionner(ARRAY['bordereaux'], '{"auto": false}'::jsonb, '{}'::text[],
  '8ac5bbda-0947-4612-82fd-effdaa3ca84a'::uuid);

SELECT platform_settings->'bordereaux' AS bordereaux_apres FROM public.profiles WHERE id = '8ac5bbda-0947-4612-82fd-effdaa3ca84a';
COMMIT;
