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
    // Compteur d'essais de la republication AUTO, par article (2026-08-31) :
    // { "<user_id>:<vinted_item_id>": { n, premier_le, dernier_le, motif,
    //   ecarte_jusqu_a } }. C'est ce qui permet à la file séquentielle de
    // SAUTER un article qui ne passe pas au lieu de rester bloquée dessus.
    // Purgé à 7 jours à chaque écriture. Écarter n'efface RIEN : ni l'annonce
    // Vinted, ni la ligne d'inventaire, ni les captures.
    REPUBLISH_AUTO_ESSAIS: "fillsell_republish_auto_essais",
    // Jobs terminés récemment par le poll de fond (Sujet 5, 2026-07-11) :
    // { [jobId]: { platform, status, title, inventaire_id, annonceKey, ts } },
    // purgé à 30 min — lu par le popup pour afficher "Publié" après coup.
    RECENT_RESULTS: "fillsell_recent_results",
    // ── Fin de la bascule silencieuse de compte FillSell (2026-09-03) ────────
    // Incident Nadège : la session relayée par fillsell.app était acceptée
    // sans comparer son utilisateur à celui de la session propre — quand la
    // propre mourait, l'extension DEVENAIT l'autre compte, en silence, et la
    // sync versait le dressing du navigateur dans son inventaire.
    // LAST_USER : { sub, email, vu_le } — l'utilisateur auquel cette
    // extension est rattachée (posé à chaque bootstrap réussi).
    LAST_USER: "fillsell_last_user",
    // PENDING_SWITCH : { session, sub, email, vu_le } — session relayée d'un
    // AUTRE utilisateur, mise en attente d'une décision EXPLICITE dans le
    // popup (« Basculer l'extension sur ce compte ? »). Jamais utilisée sans
    // clic.
    PENDING_SWITCH: "fillsell_pending_switch",
    // ── Épisode de maintien en éveil (2026-09-04) ───────────────────────────
    // { depuis: iso, maj: iso, demarrage_trace: bool } — présent UNIQUEMENT
    // pendant qu'un lot est en cours. PERSISTÉ parce que le service worker
    // MV3 redémarre en permanence : sans cet état hors mémoire, chaque
    // redémarrage rouvrirait un « épisode » neuf et écrirait une trace pour
    // rien. Lu par le popup pour afficher la ligne « ordinateur éveillé »,
    // écrit par le background seul. Effacé à toute relâche réelle.
    KEEP_AWAKE: "fillsell_keep_awake",
    // ── Sondes de session : dernier horodatage PAR PLATEFORME (2026-09-08) ─
    // { vinted: ms, leboncoin: ms, ebay: ms, beebs: ms }. Persisté parce que
    // le throttle de 10 min vivait en mémoire d'un service worker MV3 qui
    // meurt entre deux polls : la sonde partait à chaque poll (mesuré :
    // médiane 2 min, ≈ 2 880 fetch/jour). Écrit par le background seul.
    SESSION_PROBE_AT: "fillsell_session_probe_at",
    // ── Dernière publication RÉUSSIE par plateforme (2026-09-15) ────────────
    // { vinted: ms, leboncoin: ms, ebay: ms, beebs: ms }. Un dépôt abouti
    // PROUVE que la session marchait — c'est le signal le plus fort du
    // système, et il ne coûte aucune requête. Indispensable là où la sonde ne
    // peut rien prouver : Leboncoin rend 403 (DataDome) sur 92,6 % des relevés
    // du parc, et Beebs est une SPA qui sert 200 même déconnectée.
    // Écrit par le background à chaque job terminé 'published', lu par le
    // popup. Pas d'expiration ici : c'est le LECTEUR qui borne (72 h).
    DERNIERE_PUBLICATION_OK: "fillsell_derniere_publication_ok",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // ÉTAT DE SESSION D'UNE PLATEFORME — LA RÈGLE, UNE SEULE FOIS (2026-09-15)
  // ═══════════════════════════════════════════════════════════════════════════
  // Lue par le popup (popup.js) ET par le background. Son MIROIR côté app vit
  // dans src/utils/sessionsPlateformes.js : deux bundles sans module commun
  // (popup = <script> classique, app = ESM Vite), donc deux copies — toute
  // modification ici doit être reportée là-bas, et les deux fichiers se citent.
  //
  // TROIS ÉTATS, et pas un de plus :
  //   'ok'     connecté       — sonde `true` fraîche, OU publication réussie
  //                             récente (< 72 h)
  //   'ko'     pas connecté   — `false` UNIQUEMENT. Jamais un 401, jamais un
  //                             403, jamais un null (décision du 08/09 : le
  //                             401 Vinted est ambigu, le 403 Leboncoin est un
  //                             challenge DataDome — ni l'un ni l'autre ne
  //                             prouve une déconnexion).
  //   null     jamais vérifié — on le DIT, avec un bouton. Avant ce lot, cet
  //                             état était muet et sans issue : l'utilisateur
  //                             n'avait aucun geste à faire.
  //
  // ⚠️ LE PLUS RÉCENT TRANCHE entre la sonde et la publication. Une
  //    déconnexion observée il y a dix minutes prime sur un dépôt d'hier ; un
  //    dépôt d'il y a dix minutes prime sur une sonde muette d'hier. C'est la
  //    doctrine déjà écrite pour Beebs dans le popup, généralisée aux quatre.
  SESSIONS: {
    // Fraîcheur exigée d'une SONDE, par plateforme — six fois sa cadence.
    // Au-delà, la valeur n'est pas fausse : elle est DATÉE, et l'écran affiche
    // son âge au lieu d'une pastille.
    FRAICHEUR_MS: { vinted: 60 * 60 * 1000, leboncoin: 3 * 60 * 60 * 1000, ebay: 3 * 60 * 60 * 1000, beebs: 3 * 60 * 60 * 1000 },
    // Une publication prouve la session pendant 72 h. Borne ARBITRÉE : les
    // cookies de ces quatre places tiennent des semaines, mais « il a publié
    // il y a trois semaines » ne dit plus rien d'aujourd'hui. Trois jours, et
    // la date reste affichée à côté.
    PUBLICATION_PROUVE_MS: 72 * 60 * 60 * 1000,
  },
};
