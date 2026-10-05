// La configuration de l'orchestrateur — lue UNE fois, à partir de l'environnement
// (fichier /srv/fillsell-cloud/.env sur le serveur, jamais dans le dépôt).
// Aucune valeur secrète n'a de défaut : sans elle, l'orchestrateur refuse de démarrer.

const lireEntier = (v, defaut) => {
  const n = Number.parseInt(String(v ?? ''), 10);
  return Number.isFinite(n) ? n : defaut;
};
const lireBool = (v, defaut) => (v == null || v === '' ? defaut : /^(1|true|oui|yes)$/i.test(String(v)));

export function lireConfig(env = process.env) {
  const manque = [];
  const exiger = (cle) => {
    const v = env[cle];
    if (v == null || String(v).trim() === '') manque.push(cle);
    return v == null ? '' : String(v).trim();
  };
  const c = {
    // ── Supabase ────────────────────────────────────────────────────────────
    supabaseUrl: exiger('SUPABASE_URL'),
    cleService: exiger('SUPABASE_SERVICE_ROLE_KEY'),
    cleAnon: exiger('SUPABASE_ANON_KEY'),
    // ── Le coffre : AES-256-GCM, clé de 32 octets en base64. ⛔ Ne vit QUE sur
    //    les serveurs : la base ne voit que du chiffré.
    cleCoffre: exiger('COFFRE_CLE'),
    cleCoffreVersion: lireEntier(env.COFFRE_CLE_VERSION, 1),
    // ── Les tickets de la page de connexion autonome (test sans l'app) ───────
    cleTickets: exiger('TICKETS_CLE'),
    // ── Ce serveur ──────────────────────────────────────────────────────────
    serveurNom: env.SERVEUR_NOM?.trim() || 'cloud-1',
    domaine: env.DOMAINE?.trim() || 'localhost',
    port: lireEntier(env.PORT, 8080),
    // Image steel-browser DÉRIVÉE (Xvfb + français), ÉPINGLÉE par empreinte.
    imageNavigateur: exiger('IMAGE_NAVIGATEUR'),
    reseauDocker: env.RESEAU_DOCKER?.trim() || 'fillsell-cloud',
    dossierProfils: env.DOSSIER_PROFILS?.trim() || '/srv/fillsell-cloud/profils',
    dossierExtension: env.DOSSIER_EXTENSION?.trim() || '/srv/fillsell-cloud/extension',
    socketDocker: env.SOCKET_DOCKER?.trim() || '/var/run/docker.sock',
    // Capacité MESURÉE du serveur (navigateurs simultanés). Défaut prudent.
    navigateursMax: lireEntier(env.NAVIGATEURS_MAX, 8),
    memoireNavigateur: env.MEMOIRE_NAVIGATEUR?.trim() || '1400m',
    // ── Garde CPU de la base (règle du 04/10) : au-dessus, aucun démarrage
    //    nouveau sauf une connexion demandée par quelqu'un ───────────────────
    cpuPauseAuDessus: lireEntier(env.CPU_PAUSE_AU_DESSUS, 50),
    // ── Rythme ──────────────────────────────────────────────────────────────
    tickPlanificateurS: lireEntier(env.TICK_PLANIFICATEUR_S, 60),
    tickEntretienMin: lireEntier(env.TICK_ENTRETIEN_MIN, 60),
    sessionMinimaleMin: lireEntier(env.SESSION_MINIMALE_MIN, 8),
    // Le délai entre deux sessions se lit dans la BASE (coin_config
    // cloud_delai_sessions_min) : non tranché au 05/10, jamais figé ici.
    // ── Achats IPRoyal : ⛔ coupés tant que Nico n'a pas dit GO ──────────────
    iproyalJeton: env.IPROYAL_API_TOKEN?.trim() || '',
    iproyalAchatsAutorises: lireBool(env.IPROYAL_ACHATS_AUTORISES, false),
    // ── Alertes par mail à support@ (jamais à un utilisateur) ───────────────
    alertesMail: lireBool(env.ALERTES_MAIL, false),
    alertesDestinataire: env.ALERTES_DESTINATAIRE?.trim() || 'support@fillsell.app',
    // ── Comptes servis : vide = tous les comptes Cloud actifs ; sinon, la
    //    liste fermée (test sur le compte de Nico seulement) ─────────────────
    comptesAutorises: String(env.COMPTES_AUTORISES ?? '').split(',').map((s) => s.trim()).filter(Boolean),
    // Origines autorisées pour l'écran « Me connecter » (app, web, page autonome)
    origines: String(env.ORIGINES ?? 'https://fillsell.app,capacitor://localhost,https://localhost,http://localhost:5173')
      .split(',').map((s) => s.trim()).filter(Boolean),
  };
  if (manque.length) {
    const e = new Error(`configuration incomplète : ${manque.join(', ')}`);
    e.manque = manque;
    throw e;
  }
  const brute = Buffer.from(c.cleCoffre, 'base64');
  if (brute.length !== 32) throw new Error('COFFRE_CLE doit faire 32 octets (base64)');
  if (Buffer.from(c.cleTickets, 'base64').length < 32) throw new Error('TICKETS_CLE doit faire au moins 32 octets (base64)');
  if (!/@sha256:[0-9a-f]{64}$/.test(c.imageNavigateur) && !/^fillsell-navigateur:[0-9a-f]{12,}$/.test(c.imageNavigateur)) {
    throw new Error('IMAGE_NAVIGATEUR doit être épinglée (empreinte sha256 ou étiquette fillsell-navigateur:<empreinte>)');
  }
  return Object.freeze(c);
}
