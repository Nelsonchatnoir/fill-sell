// Config partagée — chargée via importScripts() dans background.js
// et via <script src> dans popup.html.
const FILLSELL_CONFIG = {
  SUPABASE_URL: "https://tojihnuawsoohlolangc.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_0GoTciuApxM64_zrq3h43Q_c2Z6Obyr",
  AUTH_URL: "https://fillsell.app/auth",
  POLL_INTERVAL_MINUTES: 30,
  // Pause entre deux jobs traités dans une même session de poll — évite
  // d'enchaîner les onglets de dépôt trop vite (Vinted a planté avec une
  // erreur générique quand plusieurs jobs s'enchaînaient sans délai).
  // Plancher fixe (sert aussi de garde-fou au throttle de retryInTempTab) +
  // jitter aléatoire tiré à chaque job : un intervalle TOUJOURS identique
  // entre deux ouvertures d'onglet est un marqueur d'automatisation à lui
  // seul (blocage LBC "vitesse surhumaine" du 2026-07-09).
  JOB_DELAY_MS: 8000,
  JOB_DELAY_JITTER_MS: 12000,
  STORAGE_KEYS: {
    SESSION: "fillsell_session",
    LAST_POLL: "fillsell_last_poll",
  },
};
