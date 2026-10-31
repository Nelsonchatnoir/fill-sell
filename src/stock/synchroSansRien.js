// (31/10, lot I — Rosa Metra) Stock vide après une synchro à zéro : la carte de synchro propose AUSSI « Crée ta
// première annonce » (photo → Lens). Pur (Vite + Node) : scripts/lot-i-3110-selftest.mjs.
/** La synchro est finie, n'a rien trouvé, et le stock est vide. */
export function synchroSansRien({ enCours, quand, total, nbArticles }) {
  return !enCours && quand != null && (Number(total) || 0) === 0 && (Number(nbArticles) || 0) === 0;
}
