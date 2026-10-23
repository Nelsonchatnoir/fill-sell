// ═══════════════════════════════════════════════════════════════════════════
// UNE RELANCE NE REPART JAMAIS AVEC L'ANNONCE MORTE DU DÉPÔT D'AVANT (24/10, point 6)
// ═══════════════════════════════════════════════════════════════════════════
// louis-seller, « T.shirt motif raiponce 8 ans » : déposé le 18/10 (Leboncoin 3290885485), refusé par la
// modération (absent de deux relevés complets : platform_fields.depot_jamais_en_ligne), relancé le 23/10 à 18:33.
// Le redépôt a rendu son numéro (adsubmit 201 → 3293872836) ; mais la relance gardait le numéro, le lien et le
// dépôt (lbc_depot) de l'annonce MORTE, et les déclencheurs du lien (cross_post_jobs_lien_jamais_croise,
// cross_post_jobs_lien_suit_identifiant) ont donné raison à l'identifiant « certain » du dépôt d'avant : le job est
// resté sur 3290885485, et le relevé a dû créer un second suivi (db986536) pour l'annonce vivante.
//
// LA RÈGLE : quand le dépôt précédent est PROUVÉ jamais mis en ligne (depot_jamais_en_ligne, posé par
// trancher_publications_sans_lien ou fail_publish_without_listing_url après deux relevés complets ou la sonde), la
// relance efface son numéro, son lien et ses traces de dépôt — archivés sous `relance_apres_depot_mort` — pour que
// le redépôt porte SON numéro. Sans cette preuve, rien ne change (une annonce peut être en vérification).
// ═══════════════════════════════════════════════════════════════════════════

/** Les traces du dépôt mort qui feraient croire qu'une annonce existe (ou qu'elle a disparu). */
export const TRACES_DEPOT_MORT = Object.freeze([
  'lbc_depot', 'depot_jamais_en_ligne', 'moderation_probe', 'lien_en_attente', 'refund_unconfirmed',
  'listing_url_recovery', 'listing_url_recovery_refus', 'listing_url_abandon', 'lien_refuse', 'lien_suit_identifiant',
  'sale_signal', 'unavailable_since', 'unavailable_pending_since', 'absence_releves', 'pas_encore_visible',
]);

/**
 * Ce que la relance d'un job doit écrire en plus quand son dépôt précédent est mort.
 * @param {{ platform_listing_id?: string|null, listing_url?: string|null }} job
 * @param {Record<string, unknown>} pf — platform_fields relus au clic
 * @param {string} [maintenant]
 * @returns {{ pf: Record<string, unknown>, colonnes: Record<string, null> }}
 */
export function relanceSansDepotMort(job, pf, maintenant = new Date().toISOString()) {
  const mort = pf?.depot_jamais_en_ligne;
  if (!mort || typeof mort !== 'object' || Array.isArray(mort)) return { pf, colonnes: {} };
  const out = { ...pf };
  const retirees = [];
  for (const k of TRACES_DEPOT_MORT) if (k in out) { retirees.push(k); delete out[k]; }
  out.relance_apres_depot_mort = {
    le: maintenant,
    identifiant: job?.platform_listing_id ?? null,
    lien: job?.listing_url ?? null,
    issue: mort.issue ?? null,
    constat: mort,
    traces_retirees: retirees,
  };
  return { pf: out, colonnes: { platform_listing_id: null, listing_url: null, published_at: null } };
}
