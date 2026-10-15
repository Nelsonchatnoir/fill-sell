// ── APRÈS QUOI ? LE DERNIER GESTE MARQUANT DU PARCOURS (15/10, P17) ─────────
// Mesuré le 15/10 : 119 nouveaux inscrits sur 242 ouvrent l'offre Premium
// (médiane : 3,5 min après l'inscription), aucun n'achète — et l'app ne disait
// ni OÙ ni APRÈS QUOI l'offre s'ouvrait, ni comment elle se fermait. Ce module
// garde EN MÉMOIRE (aucune lecture ni écriture en base) le dernier geste
// marquant : la modale des offres le joint à ses événements d'ouverture et de
// fermeture (usage_logs offers_modal_open / offers_modal_abandon).
// Gestes notés : synchro_finie, mur_lot, plafond_repub, lot_ouvert,
// publication_envoyee — une liste FERMÉE, jamais un texte libre.

const GESTES = new Set(['synchro_finie', 'mur_lot', 'plafond_repub', 'lot_ouvert', 'publication_envoyee']);
let dernier = null;

export function noterGeste(geste, maintenant = Date.now()) {
  if (!GESTES.has(geste)) return;
  dernier = { geste, le: maintenant };
}

/** { apres, apres_s } : le dernier geste noté et il y a combien de secondes (« aucun » sinon). */
export function lireDernierGeste(maintenant = Date.now()) {
  if (!dernier) return { apres: 'aucun', apres_s: null };
  return { apres: dernier.geste, apres_s: Math.max(0, Math.round((maintenant - dernier.le) / 1000)) };
}

/** Le canal de l'app : ios | android | web_mobile | web_ordinateur. */
export function canalDeLApp({ natif = false, plateforme = null, largeur = null } = {}) {
  if (natif) return plateforme === 'ios' ? 'ios' : 'android';
  const l = Number.isFinite(largeur) ? largeur : (typeof window !== 'undefined' ? window.innerWidth : 1280);
  return l < 768 ? 'web_mobile' : 'web_ordinateur';
}

/** Pour les tests seulement. */
export function _oublierGeste() { dernier = null; }
