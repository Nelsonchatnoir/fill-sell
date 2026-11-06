// ═══════════════════════════════════════════════════════════════════════════
// L'EXTENSION DU COMPTE EST-ELLE TROP ANCIENNE POUR RECEVOIR SA FILE ?
// (03/10, point 25 — geronimo0550)
// ═══════════════════════════════════════════════════════════════════════════
// Depuis le 02/10, get-pending-jobs ne sert RIEN à un poste plus ancien que
// EXTENSION_MIN_BUILD (0.6.81) — sauf une remise en ligne déjà commencée. Il
// répond « mets à jour ». geronimo0550, en 0.6.79, a publié 7 annonces le
// 02/10 au soir, Chrome allumé jusqu'à 01:49 : aucune n'est partie, et l'écran
// de suivi disait « Dans la file — Chrome la prend à son tour ». Elles sont
// parties dès son passage en 0.6.89.
//
// LA RÈGLE, la même que le bandeau de l'app (App.jsx, extensionOutdated) et
// que le serveur (posteExtensionCompatible) : un build connu, plus ancien que
// le minimum, vu dans les 30 derniers jours (au-delà, l'ordinateur est
// éteint — c'est un autre message).
// ⛔ (06/11, Nico : version minimum abandonnée) Le serveur ne retient PLUS RIEN pour le build du poste :
// extensionAMettreAJour rend toujours false (aucun « en pause : mise à jour ») ; le bandeau d'App informe seulement.
/** true = le poste connu est trop ancien : sa file attend la mise à jour.
 *  ⛔ (06/11, Nico : version minimum abandonnée) TOUJOURS false : le serveur sert sa file à tout poste, quel que soit
 *  son build — aucune tâche n'attend la mise à jour, aucun écran ne doit le dire. Le bandeau d'App (une mise à jour
 *  existe) reste : il informe, il ne dit jamais que la file attend. */
// eslint-disable-next-line no-unused-vars
export function extensionAMettreAJour({ build = null, lastSeenAt = null, maintenant = Date.now() } = {}) {
  return false;
}

/** Le geste, en une phrase (fr/en) — le même partout. */
export function phraseMiseAJourExtension(lang = "fr") {
  return lang === "en"
    ? "Waiting for the extension update: quit Chrome completely, then reopen it"
    : "En attente de la mise à jour de l'extension : ferme Chrome complètement puis rouvre-le";
}
