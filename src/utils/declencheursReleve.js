// ═══════════════════════════════════════════════════════════════════════════
// QUI A LANCÉ UN RELEVÉ ? (05/10, règle de Nico)
// ═══════════════════════════════════════════════════════════════════════════
// Un relevé d'import ne démarre QUE sur « Synchroniser ». Les seuls relevés
// automatiques qui restent servent à voir les ventes et les retraits — la
// veille quotidienne de l'extension, le veilleur d'une annonce qui paraît
// hors ligne, la vérification d'un retrait ou d'un redépôt, et le relevé eBay
// par l'API. Ils n'importent rien, et l'écran de synchronisation ne les montre
// pas : ni « en cours », ni « échec ». La personne ne voit que SES
// synchronisations.
// Miroir de `releve_est_veille()` (base) et de DECLENCHEURS_GESTE_RE
// (chrome-extension/background.js).
export const DECLENCHEURS_VEILLE = [
  'cron',
  'veilleur',
  'serveur:retrait_introuvable',
  'serveur:retrait_sans_numero',
  'serveur:verif_redepot',
  'serveur:quotidien_api',
];

export function estReleveDeVeille(declencheur) {
  return DECLENCHEURS_VEILLE.includes(String(declencheur ?? ''));
}

// Filtre PostgREST `.or(...)` : les relevés qui ne sont PAS de la veille
// (déclencheur absent compris — les plus anciens n'en portent pas).
export const FILTRE_SANS_VEILLE =
  `declencheur.is.null,declencheur.not.in.(${DECLENCHEURS_VEILLE.map((d) => `"${d}"`).join(',')})`;
