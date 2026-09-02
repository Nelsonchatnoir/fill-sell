-- ═══════════════════════════════════════════════════════════════════════════
-- profiles.extension_session_rejetee_at (02/09 soir — incident bootstrap)
--
-- Le 401 « Token invalide ou expiré » d'extension-session signifie :
-- l'extension TOURNE mais son jeton relayé pointe une session détruite
-- (signOut global, révocation). Jusqu'ici ce signal mourait dans une console
-- que personne n'ouvre, et l'app affichait « ton ordinateur est éteint » —
-- diagnostic faux, utilisateur perdu.
--
-- extension-session stampe cette colonne sur ce 401 précis (sub du JWT — sûr,
-- la gateway verify_jwt a validé la signature avant d'entrer) et la remet à
-- NULL sur un bootstrap réussi. L'app (fraicheurExtension, OTA 2.6.2) affiche
-- alors « ta session a expiré, reconnecte-toi » avec le geste qui répare, au
-- lieu du bandeau « ordinateur éteint ».
--
-- Écriture : service role UNIQUEMENT (la fonction). Lecture : le propriétaire
-- via la policy SELECT existante de profiles — aucun GRANT nouveau requis.
-- ⚠️ À appliquer explicitement. Idempotente.
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS extension_session_rejetee_at timestamptz;

COMMENT ON COLUMN public.profiles.extension_session_rejetee_at IS
  'Dernier refus 401 du bootstrap extension-session (jeton relayé mort). Stampé par la fonction, remis à NULL au bootstrap réussi. Lu par l''app pour distinguer « session expirée » d''« ordinateur éteint ».';
