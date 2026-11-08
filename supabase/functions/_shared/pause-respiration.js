// ═══════════════════════════════════════════════════════════════════════════
// LA PAUSE DE RESPIRATION DES REPUBLICATIONS — PAR PLATEFORME (08/11, point 1 de Nico)
// ═══════════════════════════════════════════════════════════════════════════
// Règle inchangée depuis le 04/09 (coin_config republish_pause_apres = 50, republish_pause_duree_min = 120) :
// après N republications réussies « d'affilée » (chaque écart plus court que la pause elle-même), la file souffle
// pendant la durée de la pause, comptée depuis la dernière. Aucun état stocké : la séquence se lit sur les
// horodatages des republications réussies. Un trou ≥ à la durée (ordinateur éteint) clôt la séquence.
//
// Ce qui change le 08/11 (décision de Nico : « chaque plateforme a sa propre file et sa propre cadence ») : la
// séquence est comptée PLATEFORME PAR PLATEFORME. Avant, 50 republications toutes plateformes confondues
// (Vinted + Leboncoin + Beebs) arrêtaient les TROIS pendant 2 h : un volume Leboncoin faisait attendre Vinted.
// Désormais 50 Vinted d'affilée mettent Vinted seul en pause ; Leboncoin et Beebs continuent. Pour UNE plateforme,
// la règle est exactement celle d'avant (mêmes 50, mêmes 2 h, même lecture).
//
// Pur (aucun accès réseau) : get-pending-jobs le nourrit, le selftest `republication-plateformes-paralleles` le rejoue.

/**
 * Séquence en cours et fin de pause, sur des horodatages (ms) triés du plus RÉCENT au plus ancien.
 * @param {number[]} horodatagesDesc
 * @param {{ pauseApres?: number, pauseDureeMs?: number, maintenant?: number }} [cfg]
 * @returns {{ sequence: number, finPause: number|null }}
 */
export function sequenceEtFinPause(horodatagesDesc, cfg = {}) {
  const { pauseApres = 0, pauseDureeMs = 0, maintenant = Date.now() } = cfg;
  const h = (horodatagesDesc ?? []).filter((t) => Number.isFinite(t)).sort((a, b) => b - a);
  if (!(Number.isFinite(pauseApres) && pauseApres > 0) || !(Number.isFinite(pauseDureeMs) && pauseDureeMs > 0) || !h.length) {
    return { sequence: 0, finPause: null };
  }
  let sequence = 1;
  for (let i = 1; i < h.length; i++) {
    if (h[i - 1] - h[i] >= pauseDureeMs) break;
    sequence++;
  }
  const finPause = sequence >= pauseApres && maintenant - h[0] < pauseDureeMs ? h[0] + pauseDureeMs : null;
  return { sequence, finPause };
}

/**
 * L'état de la pause pour chaque plateforme présente dans `lignes` ({ platform, published_at }).
 * @param {Array<{ platform?: string|null, published_at?: string|null }>} lignes
 * @param {{ pauseApres?: number, pauseDureeMs?: number, maintenant?: number }} [cfg]
 * @returns {Record<string, { sequence: number, retenue: boolean, reprise: string|null }>}
 */
export function pauseParPlateforme(lignes, cfg = {}) {
  const { pauseApres = 0, pauseDureeMs = 0, maintenant = Date.now() } = cfg;
  const parPf = new Map();
  for (const l of lignes ?? []) {
    const pf = String(l?.platform ?? "").trim();
    const t = Date.parse(String(l?.published_at ?? ""));
    if (!pf || !Number.isFinite(t)) continue;
    if (!parPf.has(pf)) parPf.set(pf, []);
    parPf.get(pf).push(t);
  }
  const out = {};
  for (const [pf, h] of parPf) {
    const { sequence, finPause } = sequenceEtFinPause(h, { pauseApres, pauseDureeMs, maintenant });
    out[pf] = { sequence, retenue: finPause !== null, reprise: finPause !== null ? new Date(finPause).toISOString() : null };
  }
  return out;
}

/**
 * La forme d'ensemble gardée pour les applis installées (une seule `retenue`) : vraie seulement quand TOUTES les
 * plateformes qui ont une republication en file sont en pause — jamais une plateforme qui avance dite « en pause ».
 * `reprise` = la plus proche des reprises. `plateformesEnFile` : celles qui ont une republication qui attend.
 */
export function pauseDEnsemble(parPlateforme, plateformesEnFile) {
  const liste = [...new Set((plateformesEnFile ?? []).map((p) => String(p ?? "")).filter(Boolean))];
  const etats = liste.map((p) => parPlateforme?.[p] ?? { sequence: 0, retenue: false, reprise: null });
  const toutes = etats.length > 0 && etats.every((e) => e.retenue);
  const reprises = etats.filter((e) => e.retenue && e.reprise).map((e) => Date.parse(e.reprise)).filter(Number.isFinite);
  return {
    retenue: toutes,
    reprise: toutes && reprises.length ? new Date(Math.min(...reprises)).toISOString() : null,
    sequence: Math.max(0, ...Object.values(parPlateforme ?? {}).map((e) => Number(e?.sequence) || 0)),
  };
}
