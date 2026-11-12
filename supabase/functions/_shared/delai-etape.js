// ═══════════════════════════════════════════════════════════════════════════
// LES ÉCHÉANCES D'UNE RÉDACTION (12/11/2026, point 8 de Nico) — une rédaction n'est JAMAIS coupée
// ═══════════════════════════════════════════════════════════════════════════
// generate-listing : une fonction edge est coupée à 150 s (504) ; le 12/11 à 15:25 et 15:28 (compte ebdf29f0), l'envoi
// Storage d'une photo attendait ~60 s son « Gateway Timeout », 3 essais par photo, photo après photo : 150 s passées
// avant la rédaction. Ici, les bornes et l'attente bornée — une photo pas prête à temps part TELLE QU'ELLE EST.
// Pur, sans import : generate-listing (Deno) et le verrou (Node).

export const LIMITE_EDGE_MS = 150_000;
/** Le re-hébergement des photos externes est fini 45 s après le début de la requête. */
export const FIN_PHOTOS_EXTERNES_MS = 45_000;
/** La retouche est finie 100 s après le début : il reste toujours ≥ 45 s pour la rédaction. */
export const FIN_RETOUCHE_MS = 100_000;
/**
 * La rédaction (textes par plateforme, icône) est finie 140 s après le début : un appel qui traîne encore est abandonné,
 * la plateforme prend son texte de repli (titre de la fiche, sa description) et la fiche est enregistrée — 10 s pour
 * l'écrire et répondre, jamais le 504.
 */
export const FIN_REDACTION_MS = 140_000;
/** Sous ce reste, la retouche n'est pas lancée du tout (photos d'origine). */
export const RETOUCHE_MINIMUM_MS = 25_000;
/** Un envoi Storage qui ne répond pas en 12 s est abandonné (son Gateway Timeout arrive à ~60 s). */
export const DELAI_ENVOI_STORAGE_MS = 12_000;

export const DELAI_DEPASSE = Symbol("delai_depasse");

/** Le temps qu'il reste avant une échéance (ms depuis le début de la requête), jamais négatif. */
export function resteAvant(debutMs, echeanceMs, maintenant = Date.now()) {
  return Math.max(0, echeanceMs - (maintenant - debutMs));
}

/** Le délai d'une attente : le plus petit de son plafond et du reste avant l'échéance. */
export function delaiBorne(plafondMs, debutMs, echeanceMs, maintenant = Date.now()) {
  return Math.max(0, Math.min(plafondMs, resteAvant(debutMs, echeanceMs, maintenant)));
}

/**
 * Attend `promesse` au plus `ms` : rend sa valeur, ou DELAI_DEPASSE. La promesse n'est pas annulée (un envoi Storage
 * peut finir plus tard sans effet : le chemin porte un horodatage, rien n'est écrasé) ; un rejet est rendu tel quel.
 */
export function attendreAuPlus(promesse, ms) {
  let minuteur;
  const delai = new Promise((resoudre) => { minuteur = setTimeout(() => resoudre(DELAI_DEPASSE), Math.max(0, ms)); });
  return Promise.race([Promise.resolve(promesse), delai]).finally(() => clearTimeout(minuteur));
}
