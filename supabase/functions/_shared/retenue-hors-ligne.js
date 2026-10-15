// ═══════════════════════════════════════════════════════════════════════════
// UNE ANNONCE HORS LIGNE À LA FOIS — ET UN MESSAGE QUI DIT VRAI (15/10)
// ═══════════════════════════════════════════════════════════════════════════
// Cas RoCotCot (15/10) : 54 republications lancées à la main à 11:36. Pendant
// les 2 à 5 min d'attente entre la suppression et la recréation d'une annonce
// Beebs, l'extension commençait le retrait d'une annonce LEBONCOIN : deux
// annonces hors ligne en même temps (le message promet « jamais deux »), et la
// recréation Beebs attendait derrière (médiane hors ligne 5,0 → 8,3 min dans
// 20 % des cas). Et le motif « En attente : X … n'est pas encore revenue en
// ligne » restait affiché après le retour de X (~111 min de message faux).
//
// RÈGLES (get-pending-jobs ; cadence des gestes INCHANGÉE, recréation et
// anti-doublon inchangés) :
//  1. Leboncoin, Beebs et Depop forment UN groupe : tant qu'une republication
//     du compte y est à l'étape 'deleted' (annonce retirée, pas recréée), aucun
//     NOUVEAU retrait de republication n'est servi sur ces trois plateformes.
//     Vinted reste par plateforme (suppression et recréation dans le même
//     passage, ~20 s hors ligne). Les publications, les retraits de vente et
//     les republications Vinted restent servis.
//  2. Une retenue dont le frère n'est plus hors ligne se LÈVE au passage
//     suivant : marque et attente de 30 min (posée par l'extension) effacées,
//     message « En file ».

export const GROUPE_RETRAIT_REDEPOT = ['leboncoin', 'beebs', 'depop'];

export const MESSAGE_EN_FILE =
  'En file : ta republication passera à son tour, une à la fois. Ton annonce est toujours en ligne.';

// Les plateformes dont les republications 'captured' sont retenues par une
// annonce hors ligne sur `platform`.
export function plateformesRetenuesPar(platform) {
  const p = String(platform || '');
  return GROUPE_RETRAIT_REDEPOT.includes(p) ? [...GROUPE_RETRAIT_REDEPOT] : [p];
}

// Le frère hors ligne qui retient `job` (ou null). Même plateforme d'abord.
export function frereHorsLigne(job, horsLigne) {
  const liste = Array.isArray(horsLigne) ? horsLigne : [];
  const id = String(job?.id ?? '');
  const pf = String(job?.platform ?? '');
  const autres = liste.filter((h) => String(h?.id ?? '') !== id);
  const meme = autres.find((h) => String(h?.platform ?? '') === pf);
  if (meme) return meme;
  if (!GROUPE_RETRAIT_REDEPOT.includes(pf)) return null;
  return autres.find((h) => GROUPE_RETRAIT_REDEPOT.includes(String(h?.platform ?? ''))) ?? null;
}

// Une retenue à lever ? `idsHorsLigne` : ids des republications du compte
// encore à l'étape 'deleted' (pending/processing). Rend null (rien à faire) ou
// { retirer: [clés à effacer], champs: {} }.
// L'attente de 30 min posée par l'extension avec la retenue
// (retenirDerriereAnnonceHorsLigne, background.js) n'est effacée que si elle
// tombe dans les 31 prochaines minutes : une attente plus longue (reprise
// espacée 1 h / 3 h / 6 h, session) n'est jamais touchée.
export function retenueLevee(pf, idsHorsLigne, maintenant = Date.now()) {
  const r = pf?.retenue_hors_ligne;
  if (!r || typeof r !== 'object') return null;
  const frere = String(r.job ?? '');
  if (frere && idsHorsLigne instanceof Set && idsHorsLigne.has(frere)) return null; // toujours hors ligne : la retenue est vraie
  // Une retenue n'existe qu'AVANT tout retrait : jamais sur une republication
  // déjà engagée (sa suppression est partie).
  if (String(pf?.republish_step ?? '') !== 'captured' || pf?.deleted_at || pf?.deleted_at_serveur) return null;
  const retirer = ['retenue_hors_ligne'];
  const t = Date.parse(String(pf?.next_action_after ?? ''));
  if (Number.isFinite(t) && t > maintenant && t <= maintenant + 31 * 60_000) retirer.push('next_action_after');
  return { retirer, champs: { retenue_levee_le: new Date(maintenant).toISOString() } };
}
