// ═══════════════════════════════════════════════════════════════════════════
// LES RELEVÉS VIDES D'AFFILÉE — CE QUE L'APP EN MONTRE (2026-09-24)
// ═══════════════════════════════════════════════════════════════════════════
// La règle vit au SERVEUR, et nulle part ailleurs : releve_vide_etat
// (migration 20260924234000). Deux relevés terminés d'affilée sans AUCUNE
// annonce, sur un compte qui en avait sur la plateforme → le veilleur ne
// relance plus, et rien n'est conclu sur les annonces. L'app reçoit ces
// plateformes par la RPC releves_vides_signales et le DIT. Ce fichier ne
// décide rien : il range ce que le serveur a tranché.
//
// Pur, sans import : le selftest l'exécute tel quel
// (scripts/releve-vide-repete-selftest.mjs).

const ACTIF = new Set(['queued', 'running']);

/** La réponse de releves_vides_signales → { platform: état }. Tout ce qui
 *  n'a pas la forme attendue est ignoré : rien ne s'affiche, rien ne casse. */
export function indexerRelevesVides(liste) {
  const par = {};
  if (!Array.isArray(liste)) return par;
  for (const e of liste) {
    if (e && typeof e === 'object' && typeof e.platform === 'string' && e.arret === true) par[e.platform] = e;
  }
  return par;
}

// ── LE RELEVÉ VIDE EST LE DERNIER MOT DE SA PLATEFORME ──────────────────────
// `lireDerniersRunsReleve` trie sur queued_at, et les relevés que l'extension
// crée elle-même (veilleur, quotidien) n'en ont pas : ils passent APRÈS ceux
// demandés depuis l'app. Chez pironneau.vincent (24/09), la tuile Leboncoin
// montrait « 528 » (relevé du 23/09) par-dessus 50 relevés vides du soir.
// Pour une plateforme signalée par le serveur, la ligne du relevé vide le plus
// récent — une vraie ligne de vinted_sync_runs, rendue par releve_vide_etat —
// remplace la ligne affichée si elle est plus récente et que rien ne tourne.
// ⛔ Les plateformes non signalées, et donc tous les autres comptes : la même
//    table `runs`, à l'identique.
export function avecDernierReleveVide(runs, vides) {
  const base = runs && typeof runs === 'object' ? runs : {};
  if (!vides || typeof vides !== 'object' || !Object.keys(vides).length) return base;
  const out = { ...base };
  for (const [p, etat] of Object.entries(vides)) {
    const vide = etat?.dernier_vide_run;
    if (!vide || typeof vide !== 'object') continue;
    const actuel = out[p] ?? null;
    if (actuel && ACTIF.has(actuel.status)) continue;          // un relevé tourne : il a la parole
    const tVide = Date.parse(vide.finished_at ?? '');
    if (!Number.isFinite(tVide)) continue;
    const tActuel = Date.parse(actuel?.finished_at ?? '');
    if (Number.isFinite(tActuel) && tActuel >= tVide) continue; // l'affiché est déjà le plus récent
    out[p] = vide;
  }
  return out;
}
