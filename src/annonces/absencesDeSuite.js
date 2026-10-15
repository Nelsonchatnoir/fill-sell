// ── « PAS CONNECTÉ » DEUX FOIS DE SUITE : « SYNCHRONISER » NE RELANCE PLUS ─────
// (15/10, P17 — cas Marie Vincent) Leboncoin « pas connecté » sept fois de suite
// en 26 min (18:00 → 18:26) : la carte disait « Une fois connecté, appuie sur
// « Synchroniser » », chaque appui relançait Leboncoin, qui retombait sur la page
// de connexion — personne ne comptait les échecs. Ses deux postes (deux Chrome)
// n'avaient pas la même session : celui qui prenait la demande décidait.
// Règle : après ABSENCES_AVANT_PAUSE relevés finis de suite sur « pas connecté »,
// « Synchroniser » (tout) ne relance plus cette plateforme tant que sa connexion
// n'est pas revue (sonde de l'extension) ; sa propre carte garde « Synchroniser
// <plateforme> » et dit pourquoi. Un relevé qui aboutit remet le compte à zéro.
// Module PUR (aucun import) : le classement « pas connecté » est passé en
// argument (absenceDePlateforme, annonces/etatReleve.js).

export const ABSENCES_AVANT_PAUSE = 2;

/**
 * Combien des derniers relevés FINIS (les plus récents d'abord) sont des
 * « pas connecté », d'affilée. Un relevé en file ou en cours ne compte pas et
 * ne casse pas la série ; le premier relevé fini qui n'est pas une absence l'arrête.
 */
export function absencesDeSuite(runsRecentsDabord = [], estAbsence = () => false) {
  let n = 0;
  for (const r of runsRecentsDabord) {
    if (!r) continue;
    if (r.status === 'queued' || r.status === 'running') continue;
    if (estAbsence(r)) n++;
    else break;
  }
  return n;
}

/** « Synchroniser » relance-t-il cette plateforme ? */
export function relancerAvecTout({ absences = 0, sessionOk = false } = {}) {
  return sessionOk === true || !(absences >= ABSENCES_AVANT_PAUSE);
}
