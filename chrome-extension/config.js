// Config partagée — chargée via importScripts() dans background.js
// et via <script src> dans popup.html.
const FILLSELL_CONFIG = {
  SUPABASE_URL: "https://tojihnuawsoohlolangc.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_0GoTciuApxM64_zrq3h43Q_c2Z6Obyr",
  AUTH_URL: "https://fillsell.app/auth",
  POLL_INTERVAL_MINUTES: 30,
  STORAGE_KEYS: {
    SESSION: "fillsell_session",
    LAST_POLL: "fillsell_last_poll",
  },
};
