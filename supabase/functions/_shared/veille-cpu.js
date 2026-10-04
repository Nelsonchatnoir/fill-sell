// ═══════════════════════════════════════════════════════════════════════════
// VEILLE CPU DE LA BASE — LES RÈGLES, PURES (04/10/2026)
// ═══════════════════════════════════════════════════════════════════════════
// Incident du 04/10 : CPU à 99 %, app et web bloqués sur le chargement pour
// tout le monde, découvert par les utilisateurs. Désormais : au-delà de 70 %
// pendant 10 minutes, Nico est prévenu par mail (support@fillsell.app, comme
// l'ops-digest), une fois par heure au plus, puis « rétabli » quand ça redescend.
// Testé : scripts/veille-cpu-selftest.mjs.

export const SEUIL_PCT = 70;
export const FENETRE_MIN = 10;
export const ECHANTILLONS_MIN = 4;      // cron toutes les 2 min → 5 par fenêtre
export const RAPPEL_MIN = 60;           // une alerte par heure au plus
export const RETABLI_PCT = 50;

/** Somme des compteurs node_cpu_seconds_total (tous cœurs) : { total, inactif } en secondes. */
export function lireCompteursCpu(texte) {
  let total = 0, inactif = 0, vus = 0;
  for (const l of String(texte ?? '').split('\n')) {
    const m = l.match(/^node_cpu_seconds_total\{[^}]*mode="(\w+)"[^}]*\}\s+([0-9.eE+-]+)/);
    if (!m) continue;
    const v = Number(m[2]);
    if (!Number.isFinite(v)) continue;
    vus++;
    total += v;
    if (m[1] === 'idle' || m[1] === 'iowait') inactif += v;
  }
  return vus ? { total, inactif } : null;
}

/** Le pourcentage occupé entre deux relevés ; null si incomparable (redémarrage, même relevé). */
export function pctEntre(avant, apres) {
  if (!avant || !apres) return null;
  const dt = Number(apres.total) - Number(avant.total);
  const di = Number(apres.inactif) - Number(avant.inactif);
  if (!(dt > 0) || di < 0 || di > dt) return null;
  return Math.round((1 - di / dt) * 1000) / 10;
}

/**
 * Faut-il prévenir ? `echantillons` : [{ le: ISO, pct }] (les plus récents),
 * `derniereAlerte` : ISO | null, `dernierRetabli` : ISO | null.
 * → { action: 'alerte' | 'retabli' | null, pctMin, pctMax, n }
 */
export function decider({ echantillons, derniereAlerte = null, dernierRetabli = null, maintenant = Date.now() }) {
  const depuis = maintenant - FENETRE_MIN * 60_000;
  const fen = (echantillons ?? []).filter((e) => Number.isFinite(e?.pct) && Date.parse(e.le) >= depuis);
  const n = fen.length;
  const pcts = fen.map((e) => e.pct);
  const pctMin = n ? Math.min(...pcts) : null;
  const pctMax = n ? Math.max(...pcts) : null;
  const alerteLe = derniereAlerte ? Date.parse(derniereAlerte) : null;
  const enAlerte = alerteLe != null && (!dernierRetabli || Date.parse(dernierRetabli) < alerteLe);
  if (n >= ECHANTILLONS_MIN && pctMin > SEUIL_PCT) {
    if (alerteLe == null || maintenant - alerteLe >= RAPPEL_MIN * 60_000) return { action: 'alerte', pctMin, pctMax, n };
    return { action: null, pctMin, pctMax, n };
  }
  if (enAlerte && n >= ECHANTILLONS_MIN && pctMax < RETABLI_PCT) return { action: 'retabli', pctMin, pctMax, n };
  return { action: null, pctMin, pctMax, n };
}
