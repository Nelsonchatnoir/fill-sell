// ═══════════════════════════════════════════════════════════════════════════
// UNE LECTURE RATÉE NE VAUT JAMAIS « PLUS EN LIGNE » (15/10, point 14 — DeadRoz)
// ═══════════════════════════════════════════════════════════════════════════
// DeadRoz (Business) : 60 republications Vinted annulées le 15/10 entre 13:52
// et 16:05 — « Cette annonce n'est plus en ligne sur Vinted… » — sur UNE seule
// lecture : l'endpoint d'édition du propriétaire (/api/v2/item_upload/items/{id})
// répondait 404. Aucune seconde lecture, aucune preuve indépendante ; les 60
// fiches ont été datées « disparues » par l'extension. Ce 404 n'est PAS une
// preuve : trois annonces de trois comptes (la.mode.licyca, seghirdeborah711,
// 2hyk6vg842) ont été relevées EN LIGNE après un tel verdict.
//
// RÈGLE (toutes plateformes ; zéro régression sur une vraie disparition) :
//  · un verdict « plus en ligne » posé par UNE lecture, avant tout retrait, met
//    la republication EN PAUSE (needs_user 'introuvable_a_confirmer'), rien de
//    retiré, la fiche jamais datée « disparue » par cette seule lecture ;
//  · elle REPART toute seule quand un relevé fait APRÈS la lecture revoit
//    l'annonce en ligne (trois fois au plus ; trois par compte et par passage) ;
//  · elle se CLÔT, avec le message d'avant, quand un relevé COMPLET fait après
//    la lecture ne la contient plus, ou la dit vendue / fermée, ou que la fiche
//    est vendue ;
//  · sinon elle attend (le prochain « Synchroniser », ou une veille).
// Pur (Node + Deno) : scripts/introuvable-a-confirmer-selftest.mjs.

export const SOURCE_INTROUVABLE = 'introuvable_a_confirmer';
export const SOURCE_INTROUVABLE_PERSISTANT = 'introuvable_persistant';
export const MAX_REPRISES_INTROUVABLE = 3;
export const REPRISES_PAR_COMPTE_ET_PASSAGE = 3;

const NOMS = { vinted: 'Vinted', leboncoin: 'Leboncoin', beebs: 'Beebs', depop: 'Depop', opla: 'Opla', ebay: 'eBay' };
const nomDe = (p) => NOMS[p] ?? String(p ?? '');

export function messagePause(platform) {
  const nom = nomDe(platform);
  return `Republication en pause, rien n'a été retiré : ${nom} n'a pas rendu cette annonce à la dernière lecture. ` +
    `FillSell attend le prochain relevé de ta boutique ${nom} pour savoir si elle est encore en ligne ; si elle l'est, ` +
    'la republication repartira toute seule. Pour aller plus vite : « Synchroniser ».';
}

// Le message d'AVANT, inchangé : il ne part plus que sur preuve.
export function messageDisparueConfirmee(platform) {
  if (platform === 'vinted') {
    return "Cette annonce n'est plus en ligne sur Vinted (vendue, retirée ou supprimée depuis sa dernière lecture). " +
      'FillSell n\'a rien retiré. Si tu l\'as vendue, marque-la vendue ; sinon remets-la en ligne sur Vinted, ' +
      'puis synchronise ton dressing.';
  }
  const nom = nomDe(platform);
  return `Cette annonce n'est plus en ligne sur ${nom} (vendue, retirée ou supprimée depuis sa dernière lecture). ` +
    "FillSell n'a rien retiré. Si tu l'as vendue, marque-la vendue ; sinon remets-la en ligne, puis synchronise.";
}

export function messagePersistant(platform) {
  const nom = nomDe(platform);
  return `${nom} refuse de rendre cette annonce à la lecture alors qu'un relevé la voit en ligne : FillSell ne la ` +
    'republie pas, pour ne jamais rien retirer sur un doute. Ton annonce est intacte ; republie-la à la main depuis ' +
    `${nom} si tu veux la remonter.`;
}

// La marque posée sur le job en pause. `lecture` : ce qui a été lu (ex.
// 'item_upload_404', 'etat_unavailable').
/**
 * @param {any} pfPrecedent
 * @param {{ platform?: string | null, lecture?: string | null, at?: string }} [opts]
 */
export function marqueIntrouvable(pfPrecedent, { platform = null, lecture = null, at = new Date().toISOString() } = {}) {
  const prec = pfPrecedent && typeof pfPrecedent.introuvable_a_confirmer === 'object' ? pfPrecedent.introuvable_a_confirmer : null;
  return {
    introuvable_a_confirmer: {
      depuis: at,
      premiere: prec?.premiere ?? prec?.depuis ?? at,
      n: (Number(prec?.n) || 0) + 1,
      reprises: Number(prec?.reprises) || 0,
      plateforme: platform ?? null,
      lecture: lecture ?? null,
    },
  };
}

const t = (v) => { const x = Date.parse(String(v ?? '')); return Number.isFinite(x) ? x : NaN; };

// La décision, pure.
//  job     : { platform, platform_fields }
//  fiche   : { statut, last_synced_at, vinted_status, vinted_account_id } (Vinted : obligatoire)
//  annonce : { vu_le, statut_plateforme, disparu_le } (autres plateformes ; null si inconnue)
//  runs    : relevés de CETTE plateforme du compte, statut 'done', [{ started_at, finished_at, vinted_user_id }]
// Rend { decision: 'reprendre' | 'confirmer' | 'attendre' | 'persistant', raison }.
/**
 * @param {{ job: any, fiche?: any, annonce?: any, runs?: any[] }} arg
 */
export function decisionIntrouvable({ job, fiche = null, annonce = null, runs = [] }) {
  const pf = job?.platform_fields ?? {};
  const marque = pf.introuvable_a_confirmer ?? null;
  const depuis = t(marque?.depuis);
  if (!Number.isFinite(depuis)) return { decision: 'attendre', raison: 'marque illisible' };
  if (fiche?.statut === 'vendu') return { decision: 'confirmer', raison: 'fiche vendue' };
  const platform = String(job?.platform ?? '');
  const runsApres = (runs ?? []).filter((r) => t(r?.started_at) > depuis && Number.isFinite(t(r?.finished_at)));
  if (platform === 'vinted') {
    const vu = t(fiche?.last_synced_at);
    const st = String(fiche?.vinted_status ?? '');
    if (Number.isFinite(vu) && vu > depuis) {
      if (st === 'active') {
        if ((Number(marque?.reprises) || 0) >= MAX_REPRISES_INTROUVABLE) return { decision: 'persistant', raison: 'relevée en ligne, mais lecture refusée après 3 reprises' };
        return { decision: 'reprendre', raison: 'relevée en ligne après la lecture' };
      }
      if (['sold', 'closed', 'hidden', 'draft'].includes(st)) return { decision: 'confirmer', raison: `relevée « ${st} » après la lecture` };
      return { decision: 'attendre', raison: `relevée « ${st || 'inconnu'} »` };
    }
    const boutique = String(fiche?.vinted_account_id ?? '');
    const complet = runsApres.find((r) => !boutique || r?.vinted_user_id == null || String(r.vinted_user_id) === boutique);
    if (complet && (!Number.isFinite(vu) || vu < t(complet.started_at))) return { decision: 'confirmer', raison: 'absente d\'un relevé complet fait après la lecture' };
    return { decision: 'attendre', raison: 'aucun relevé après la lecture' };
  }
  // Leboncoin, Beebs, Depop, Opla…
  const vuA = t(annonce?.vu_le);
  const stA = String(annonce?.statut_plateforme ?? '');
  if (Number.isFinite(t(annonce?.disparu_le)) && t(annonce.disparu_le) > depuis) return { decision: 'confirmer', raison: 'relevé : disparue après la lecture' };
  if (Number.isFinite(vuA) && vuA > depuis) {
    if (stA === 'en_ligne') {
      if ((Number(marque?.reprises) || 0) >= MAX_REPRISES_INTROUVABLE) return { decision: 'persistant', raison: 'relevée en ligne, mais lecture refusée après 3 reprises' };
      return { decision: 'reprendre', raison: 'relevée en ligne après la lecture' };
    }
    if (['vendue', 'desactivee'].includes(stA)) return { decision: 'confirmer', raison: `relevée « ${stA} » après la lecture` };
    return { decision: 'attendre', raison: `relevée « ${stA || 'inconnu'} »` };
  }
  const complet = runsApres[0];
  if (complet && annonce && (!Number.isFinite(vuA) || vuA < t(complet.started_at))) return { decision: 'confirmer', raison: 'absente d\'un relevé complet fait après la lecture' };
  return { decision: 'attendre', raison: 'aucun relevé après la lecture' };
}
