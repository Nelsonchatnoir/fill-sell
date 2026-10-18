// ═══════════════════════════════════════════════════════════════════════════
// LES REPÈRES D'UNE RECRÉATION VINTED : HEURE VINTED DU RETRAIT, NOS ENVOIS (18/10)
// ═══════════════════════════════════════════════════════════════════════════
// Régis (juchsregis, 18/10) : le short Levi's a été retiré à 13:11:38 (en-tête
// Date de la réponse de Vinted au /delete), mais la base a daté le retrait de
// 13:18:45 — l'heure du serveur à la première écriture qui portait encore
// deleted_at, après qu'une écriture de l'extension eut effacé les repères. La
// 1re copie (13:11:49) paraissait ANTÉRIEURE au retrait : jamais reconnue,
// recréée, six fois. Et seule la DERNIÈRE tentative était gardée
// (recreation_tentee) : impossible de dire après coup quelles annonces étaient
// nées de nos envois.
// Deux règles, pures (Deno + Node) :
//   · l'heure du retrait est d'abord celle de Vinted (suppression_verdict.
//     date_serveur), quand elle est lisible et plausible (pas dans le futur,
//     moins de 7 jours) ;
//   · chaque envoi (retrait de la une-passe, chaque tentative de recréation)
//     est GARDÉ dans recreation_envois — au plus 30, le plus récent en dernier.
// Consommé par update-job-status (écritures) et lu par la base
// (recreation_vinted_envois, migration 20261018170000) et get-pending-jobs.

const SEPT_JOURS_MS = 7 * 24 * 3600_000;
export const ENVOIS_MAX = 30;

const objet = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : null);

/** Heure Vinted du retrait (ms), ou null. */
export function heureVintedDuRetrait(pf, maintenant = Date.now()) {
  const verdict = objet(objet(pf)?.suppression_verdict);
  const t = Date.parse(String(verdict?.date_serveur ?? ""));
  if (!Number.isFinite(t)) return null;
  if (t > maintenant + 2_000 || maintenant - t > SEPT_JOURS_MS) return null;
  return t;
}

function lireEnvois(pf) {
  const p = objet(pf) ?? {};
  const out = [];
  if (Array.isArray(p.recreation_envois)) {
    for (const e of p.recreation_envois) {
      const brut = typeof e === "string" ? e : objet(e)?.at;
      const t = Date.parse(String(brut ?? ""));
      if (Number.isFinite(t)) out.push(t);
    }
  }
  const tentee = Date.parse(String(objet(p.recreation_tentee)?.at ?? ""));
  if (Number.isFinite(tentee)) out.push(tentee);
  return out;
}

/**
 * Les envois connus des deux côtés (en base, dans l'écriture), plus l'heure du
 * retrait : dédoublonnés à la seconde, triés, au plus ENVOIS_MAX (les plus récents).
 * @returns {string[]} ISO
 */
export function fusionnerEnvois(pfEnBase, pfEcrit, maintenant = Date.now()) {
  const tous = [...lireEnvois(pfEnBase), ...lireEnvois(pfEcrit)];
  const retrait = heureVintedDuRetrait(pfEcrit, maintenant) ?? heureVintedDuRetrait(pfEnBase, maintenant);
  if (retrait != null) tous.push(retrait);
  const parSeconde = new Map();
  for (const t of tous) {
    if (t > maintenant + 2_000) continue;
    parSeconde.set(Math.floor(t / 1000), t);
  }
  return [...parSeconde.values()].sort((a, b) => a - b).slice(-ENVOIS_MAX).map((t) => new Date(t).toISOString());
}

/** Même contenu ? (évite une réécriture pour rien) */
export function memesEnvois(a, b) {
  const x = Array.isArray(a) ? a.map(String) : [];
  const y = Array.isArray(b) ? b.map(String) : [];
  return x.length === y.length && x.every((v, i) => v === y[i]);
}
