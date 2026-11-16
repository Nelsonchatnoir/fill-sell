// ═══════════════════════════════════════════════════════════════════════════
// LA TRACE DE L'ISSUE D'UN ACHAT DE FORMULE AVEC CLOUD (16/11/2026, point 1c du lot de Nico) — pur
// ═══════════════════════════════════════════════════════════════════════════
// Avant : usage_logs « formule_cloud_issue » ne gardait que { origine, formule, etat, raison } — et la raison était null
// pour presque toutes les issues (rachidafarhi54, 16/11 : 5 « annule », raison=null, aucune trace de la feuille d'Apple).
// La règle : une issue qui n'aboutit pas (annule, erreur, refuse, attente) a TOUJOURS une raison ; l'étape, le code et le
// message de la boutique, la durée de la feuille, le produit et la semaine gratuite lue par l'app la suivent. Le texte
// montré au client (`message`) n'entre jamais dans la trace. Verrou : scripts/achat-formule-issue-vraie-selftest.mjs.

const ETATS_SANS_ISSUE = new Set(['annule', 'erreur', 'refuse', 'attente']);
const CHAMPS = ['raison', 'etape', 'code', 'message_boutique', 'duree_feuille_ms', 'produit', 'semaine_boutique', 'essai_refus', 'attente'];

/** La ligne usage_logs d'une issue d'achat de formule. `r` : ce que rend achatFormuleCloud.acheter. */
export function issueFormuleJournal(r, { origine = null, formule = null } = {}) {
  const etat = typeof r?.etat === 'string' ? r.etat : null;
  const ligne = { origine, formule, etat };
  for (const c of CHAMPS) {
    const v = r?.[c];
    if (v === undefined || v === null || v === '') continue;
    ligne[c] = typeof v === 'string' ? v.slice(0, 200) : v;
  }
  if (!('raison' in ligne)) ligne.raison = etat == null ? 'issue_absente' : ETATS_SANS_ISSUE.has(etat) ? `sans_raison_${etat}` : null;
  return ligne;
}
