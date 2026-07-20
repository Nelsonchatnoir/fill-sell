// Config partagée — chargée via importScripts() dans background.js
// et via <script src> dans popup.html.
const FILLSELL_CONFIG = {
  SUPABASE_URL: "https://tojihnuawsoohlolangc.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_0GoTciuApxM64_zrq3h43Q_c2Z6Obyr",
  AUTH_URL: "https://fillsell.app/auth",
  // 30 → 2 min (2026-07-19, décision Nico, launch) : réactivité des publications
  // et retraits armés depuis l'app. Sans risque de chevauchement : tous les flux
  // de jobs (poll, PUBLISH_NOW) passent par withJobFlowLock (background.js) qui
  // les SÉRIALISE — un poll qui déborde sur le suivant met le suivant en file,
  // jamais en concurrence. Sans surcoût plateforme : la détection de vente reste
  // throttlée PAR ANNONCE (SALE_CHECK_MIN_INTERVAL_MS = 2 h), indépendamment de
  // la cadence du poll — seuls des appels Supabase s'ajoutent.
  POLL_INTERVAL_MINUTES: 2,
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
    // Session RELAYÉE par le pont fillsell-auth.js — c'est une COPIE du token
    // de l'app web, donc la MÊME famille de refresh token qu'elle. Ne sert
    // plus qu'au bootstrap (cf. SESSION_OWN) : dès que l'extension a sa propre
    // session, celle-ci n'est plus jamais utilisée pour appeler quoi que ce
    // soit — la faire tourner en parallèle de l'app est précisément ce qui
    // déclenchait la révocation de famille (2026-07-20, 11:57:49).
    SESSION: "fillsell_session",
    // Session PROPRE à l'extension (2026-07-20), obtenue une fois via l'edge
    // function extension-session. Famille de refresh token INDÉPENDANTE de
    // celle de l'app : les deux peuvent tourner chacune de leur côté sans
    // jamais se marcher dessus. C'est la seule session utilisée en régime
    // normal.
    SESSION_OWN: "fillsell_session_own",
    // Horodatage du dernier bootstrap ÉCHOUÉ — évite de re-tenter à chaque
    // poll (toutes les 2 min) quand le token relayé est mort de toute façon.
    BOOTSTRAP_LAST_FAIL: "fillsell_bootstrap_last_fail",
    LAST_POLL: "fillsell_last_poll",
    // Jobs terminés récemment par le poll de fond (Sujet 5, 2026-07-11) :
    // { [jobId]: { platform, status, title, inventaire_id, annonceKey, ts } },
    // purgé à 30 min — lu par le popup pour afficher "Publié" après coup.
    RECENT_RESULTS: "fillsell_recent_results",
  },
};
