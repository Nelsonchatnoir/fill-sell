// ═══════════════════════════════════════════════════════════════════════════
// UNE AUTH INDISPONIBLE N'EST PAS UN JETON INVALIDE (04/11, sebastien64310)
// ═══════════════════════════════════════════════════════════════════════════
// Ce qui s'est passé : le 04/11 à 19:21:46 (Paris), l'Auth de Supabase a redémarré (« fatal … the database system is
// not accepting connections », puis « GoTrue API started » à 19:21:50). Pendant ~6 s, /auth/v1/user a rendu 521/503.
// Nos gardes faisaient de TOUT échec de auth.getUser() un 401 « Token invalide ou expiré » : get-pending-jobs (6 fois),
// update-job-status (2), extension-session (1) en cinq secondes, pour des jetons valides.
//   · L'extension de sebastien64310 écrivait à ce moment le résultat d'un redépôt Leboncoin (annonce 3302392379 DÉJÀ en
//     ligne) : le 401 est devenu « Ton annonce a été retirée de Leboncoin et n'a pas pu être redéposée automatiquement :
//     Token invalide ou expiré », rattachée seulement 5 min plus tard par le relevé.
//   · Un 401 du poll fait invalider la session de l'extension (invalidateRejectedSession) ; le rafraîchissement ratant
//     aussi pendant la coupure, la session était PURGÉE — la personne devait se reconnecter. Un 401 d'extension-session
//     marquait la session « rejetée » (1 compte le 04/11 à 19:21:51, aucun dans l'heure d'avant).
// LA RÈGLE : un jeton n'est refusé que si l'Auth l'a DIT (réponse 4xx : jeton invalide, expiré, session absente). Une
// Auth qui ne répond pas (réseau, 5xx, page d'erreur illisible — 520/521 de la passerelle) rend un 503
// « auth_indisponible » : rien n'a été lu ni écrit, la même requête se rejoue quelques secondes plus tard. Les
// extensions déjà installées traitent un 503 comme une panne passagère (cycle sauté, aucune session touchée).
// auth-js (supabase-js 2.117) : 502/503/504 et réseau → AuthRetryableFetchError (status 5xx ou 0) ; corps non JSON
// (520/521) → AuthUnknownError (sans status) ; refus de l'Auth → AuthApiError / AuthSessionMissingError (status 4xx).
// Pur, sans import réseau (Deno + Node). Preuve : scripts/auth-indisponible-selftest.mjs.

export const ERREUR_JETON = "Token invalide ou expiré";
export const CODE_AUTH_INDISPONIBLE = "auth_indisponible";
export const ERREUR_AUTH_INDISPONIBLE =
  "Connexion à FillSell momentanément indisponible : nouvel essai automatique, rien à faire.";

/** L'Auth a-t-elle RÉPONDU que ce jeton est refusé ? Pas d'erreur mais pas d'utilisateur : refus. */
export function jetonRefuse(authErr) {
  if (!authErr) return true;
  const s = Number(authErr?.status);
  return Number.isFinite(s) && s >= 400 && s < 500;
}

/** La réponse d'une garde d'authentification ratée : { status, body } — 401 si refusé, 503 si l'Auth n'a pas pu dire. */
export function refusAuthentification(authErr) {
  return jetonRefuse(authErr)
    ? { status: 401, body: { error: ERREUR_JETON } }
    : { status: 503, body: { error: ERREUR_AUTH_INDISPONIBLE, code: CODE_AUTH_INDISPONIBLE } };
}
