// Dernier minimum déjà publié. Ne le relever qu'après acceptation CWS.
// Une seule valeur pour le serveur et le bandeau de l'app.
// (02/10) 0.6.81 (73c4929), servie par le CWS depuis le 30/09 au soir : relevé
// pour sortir le parc resté en 0.6.80 / 0.6.79 / 0.6.66 (parc relu en base le
// 01/10 à 23:30 : 26 postes en 0.6.81 et 21 en 0.6.82 vus dans les 24 h —
// aucun n'est arrêté). Pas la 0.6.82 : les 26 postes en 0.6.81 n'ont pas
// `requestUpdateCheck` et resteraient sans file jusqu'à ce que Chrome y pense.
// Ancienne valeur : 2026-09-27T20:16:30Z (0.6.75).
export const EXTENSION_MIN_BUILD = '2026-09-30T20:16:41Z';

export function posteExtensionCompatible(build) {
  const iso = String(build ?? '').match(/\b20\d{2}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z/)?.[0];
  return !!iso && Date.parse(iso) >= Date.parse(EXTENSION_MIN_BUILD);
}
