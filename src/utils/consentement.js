// ============================================================================
// CONSENTEMENT AUX TRACEURS PUBLICITAIRES — 13/09/2026
//
// ⚠️ CONSTAT À L'OUVERTURE DU CHANTIER : le site n'avait AUCUN mécanisme de
// consentement. Aucun bandeau, aucune trace de CMP. C'était cohérent tant que
// le site ne portait que Google Tag Manager en mesure d'audience — et
// /legal l'affirme encore noir sur blanc : « Aucune donnée n'est utilisée à
// des fins publicitaires ». La fonction tiktok-event avait d'ailleurs été
// supprimée le 07/09 pour cette raison (config.toml).
//
// Le pixel Meta change cette nature : c'est un traceur PUBLICITAIRE, déposé
// pour le compte d'un tiers, qui exige en France un consentement PRÉALABLE et
// EXPLICITE (article 82 loi Informatique et Libertés). Il ne peut donc pas
// être chargé au fil de l'eau comme GTM l'est aujourd'hui.
//
// D'où ce module : un état de consentement à trois valeurs, par défaut
// ABSENT — et tant qu'il est absent, aucun traceur publicitaire ne se charge.
// Le refus est aussi accessible que l'acceptation, et révocable.
//
// Ce module ne couvre QUE la publicité. La mesure interne de la source
// d'acquisition (src/utils/acquisition.js) est first-party, ne part chez
// aucun tiers, et n'en dépend pas.
// ============================================================================

const CLE = 'fs_consent_pub';

export const ACCEPTE = 'accepte';
export const REFUSE = 'refuse';

/** 'accepte' | 'refuse' | null (pas encore répondu). Ne lève jamais. */
export function etatConsentement() {
  try {
    const v = localStorage.getItem(CLE);
    return v === ACCEPTE || v === REFUSE ? v : null;
  } catch {
    // Stockage indisponible : on ne peut pas prouver un consentement,
    // donc il n'y en a pas.
    return null;
  }
}

/** TRUE uniquement sur un consentement explicite. Le doute vaut refus. */
export function aConsentiPub() {
  return etatConsentement() === ACCEPTE;
}

/** Enregistre la réponse et prévient les écouteurs (le pixel, le bandeau). */
export function poserConsentement(valeur) {
  const v = valeur === ACCEPTE ? ACCEPTE : REFUSE;
  try {
    localStorage.setItem(CLE, v);
  } catch { /* rien à faire : sans stockage, la question sera reposée */ }
  try {
    window.dispatchEvent(new CustomEvent('fs-consent', { detail: v }));
  } catch { /* ignoré */ }
  return v;
}
