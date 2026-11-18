// ═══════════════════════════════════════════════════════════════════════════
// LA CATÉGORIE D'UN MAIL DÉCIDE SI LA DÉSINSCRIPTION L'ARRÊTE (18/11/2026)
// ═══════════════════════════════════════════════════════════════════════════
// Ordre de Nico (18/11, point 3B) : une personne désinscrite ne reçoit plus de mail de vente. Cas : 4e0a80fe
// (4e0a80fe), désinscrite le 17/11 07:37:19 — push-ventes envoyait le mail de vente en « support », et la porte
// (desinscription.ts) ne consultait la désinscription que pour « marketing » : son prochain mail de vente serait parti.
//   'marketing'    — relances, campagnes, annonces produit. Filtré par la désinscription.
//   'notification' — mail que la personne n'a PAS demandé, né de son activité (mail de vente). Filtré par la
//                    désinscription comme le marketing, avec l'en-tête List-Unsubscribe ; hors du plafond de 2 / 24 h
//                    (ce plafond vit dans envoi-ponctuel, _shared/plafond-mails.js : inchangé).
//   'support'      — réponse à SA demande, sécurité, compte, facturation. JAMAIS filtré.
// Liste FERMÉE : une catégorie absente ou inconnue est filtrée (le défaut de la porte reste « marketing » : on préfère
// un mail retenu, visible, à un mail parti chez quelqu'un qui a demandé à ne plus en recevoir).
// Module pur (Deno et Node) : verrou `npm run selftest:mail-vente-desinscrit`.

export const CATEGORIES = Object.freeze(['marketing', 'notification', 'support']);

const valide = (c) => (CATEGORIES.includes(c) ? c : 'marketing');

/**
 * La désinscription arrête-t-elle ce mail ? (et lui pose-t-elle l'en-tête List-Unsubscribe ?)
 * @param {string | null | undefined} categorie
 * @returns {boolean}
 */
export function bloqueeParDesinscription(categorie) {
  return valide(categorie) !== 'support';
}

/**
 * Verdict d'un mail de vente rendu par envoyerEmail(), pour push_ventes_resultat.
 * Un refus « desinscrit » est DÉFINITIF : « echec », motif « desinscrit » — jamais trois réessais.
 * @param {{ envoye?: boolean, motif?: string } | null | undefined} r
 * @returns {{ statut: 'envoye' | 'deja_envoye' | 'a_reessayer' | 'echec', motif?: string }}
 */
export function verdictMailVente(r) {
  if (r?.envoye) return { statut: 'envoye' };
  if (r?.motif === 'deja_envoye') return { statut: 'deja_envoye' };
  if (r?.motif === 'desinscrit') return { statut: 'echec', motif: 'desinscrit' };
  // Resend refusé, clé absente, réservation illisible, vérification impossible : on réessaie (3 fois au plus, base).
  return { statut: 'a_reessayer', motif: String(r?.motif ?? 'inconnu').slice(0, 120) };
}
