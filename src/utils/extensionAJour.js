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
import { posteExtensionCompatible } from "../../supabase/functions/_shared/version-min-extension.js";

const TRENTE_JOURS_MS = 30 * 24 * 3600_000;

/** true = le poste connu est trop ancien : sa file attend la mise à jour. */
export function extensionAMettreAJour({ build = null, lastSeenAt = null, maintenant = Date.now() } = {}) {
  if (!build) return false;
  const vu = Date.parse(String(lastSeenAt ?? ""));
  if (!Number.isFinite(vu) || maintenant - vu > TRENTE_JOURS_MS) return false;
  return !posteExtensionCompatible(build);
}

/** Le geste, en une phrase (fr/en) — le même partout. */
export function phraseMiseAJourExtension(lang = "fr") {
  return lang === "en"
    ? "Waiting for the extension update: quit Chrome completely, then reopen it"
    : "En attente de la mise à jour de l'extension : ferme Chrome complètement puis rouvre-le";
}
