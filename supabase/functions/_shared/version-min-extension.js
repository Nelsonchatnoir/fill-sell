// Dernier minimum déjà publié. Ne le relever qu'après acceptation CWS.
// Une seule valeur pour le serveur et le bandeau de l'app.
export const EXTENSION_MIN_BUILD = '2026-09-24T14:34:46Z';

export function posteExtensionCompatible(build) {
  const iso = String(build ?? '').match(/\b20\d{2}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z/)?.[0];
  return !!iso && Date.parse(iso) >= Date.parse(EXTENSION_MIN_BUILD);
}
