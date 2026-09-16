-- ── Marqueur du build applicatif RÉELLEMENT exécuté, par compte (2026-09-16) ──
--
-- POURQUOI. Rien, côté serveur, ne disait quel bundle une personne exécute.
-- « zéro usage_logs » et « bundle trop vieux pour contenir l'écran
-- d'onboarding » produisaient exactement la même trace en base : onboarded_at
-- NULL, aucun événement. Le 16/09, distinguer les deux a demandé de lire la
-- FORME des SELECT dans les logs de la passerelle (présence de `onboarded_at`,
-- de `is_business`, du tiebreaker `id.desc`…) — une méthode qui marche mais
-- dont la rétention est de 24 h. Passé ce délai, la question n'a plus de
-- réponse. Cette colonne la rend permanente et lisible en SQL.
--
-- DEUX COLONNES, ET C'EST VOULU :
--   · app_build          = le build de la DERNIÈRE session. Réécrit à chaque
--                          chargement. Répond à « quelle part du parc tourne
--                          sur un vieux bundle, maintenant ».
--   · app_build_premier  = le build de la PREMIÈRE session, jamais réécrit.
--                          C'est LUI qui compte pour l'onboarding : sur natif,
--                          la première session tourne forcément sur le bundle
--                          EMBARQUÉ DANS LE BINAIRE du store (Capgo est en
--                          autoUpdate 'atBackground' : l'OTA ne s'applique
--                          qu'au passage suivant en arrière-plan). Or
--                          l'onboarding vit dans cette première session.
--
-- ⚠️ POURQUOI UNE RPC ET PAS UN UPDATE CLIENT. Le rôle `authenticated` n'a
-- AUCUN privilège UPDATE au niveau table sur public.profiles : il a une liste
-- blanche de 13 colonnes (currency, lang, onboarded_at, username…). Un simple
-- `ALTER TABLE ADD COLUMN` laisserait donc la nouvelle colonne NON écrivable,
-- et le client échouerait en silence. Deux issues possibles :
--   1. GRANT UPDATE (app_build) — additif, correct, mais il faudrait y penser
--      à chaque nouvelle colonne ;
--   2. une fonction SECURITY DEFINER, comme set_profile_username.
-- On prend la 2 : elle ne touche à aucun grant existant. ⛔ Ne JAMAIS
-- « simplifier » en `GRANT UPDATE ON public.profiles TO authenticated` : ça
-- ouvrirait les 60+ colonnes de la table, dont is_premium, is_pro et les
-- compteurs de quota, à l'écriture par n'importe quel client.
--
-- Idempotente : rejouable sans effet de bord.

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS app_build         text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS app_build_premier text;

COMMENT ON COLUMN public.profiles.app_build IS
  'BUILD_ID du bundle applicatif de la dernière session (posé par set_app_build).';
COMMENT ON COLUMN public.profiles.app_build_premier IS
  'BUILD_ID de la PREMIÈRE session observée. Jamais réécrit : sur natif c''est le bundle embarqué dans le binaire du store, celui qui décide si l''onboarding existe.';

CREATE OR REPLACE FUNCTION public.set_app_build(p_build text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Garde-fou : un id de build fait une centaine de caractères au plus
  -- (horodatage ISO + hash court). Au-delà, on ignore plutôt que d'écrire
  -- n'importe quoi — la télémétrie ne doit jamais devenir un vecteur.
  IF p_build IS NULL OR length(p_build) > 120 THEN
    RETURN;
  END IF;
  UPDATE public.profiles
     SET app_build         = p_build,
         app_build_premier = COALESCE(app_build_premier, p_build)
   WHERE id = auth.uid();
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_app_build(text) TO authenticated;
