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
    // (29/10, lot C 6) Le trousseau : les clés d'avant une rotation, « version:base64,version:base64 » — lecture seule.
    clesCoffreAnciennes: Object.fromEntries(String(env.COFFRE_CLES_ANCIENNES ?? '').split(',').map((s) => s.trim()).filter(Boolean)
      .map((s) => { const i = s.indexOf(':'); return [Number(s.slice(0, i)), s.slice(i + 1)]; })
      .filter(([v, k]) => Number.isInteger(v) && v > 0 && Buffer.from(k, 'base64').length === 32)),
    // ── Les tickets de la page de connexion autonome (test sans l'app) ───────
    cleTickets: exiger('TICKETS_CLE'),
    // ── Ce serveur ──────────────────────────────────────────────────────────
    serveurNom: env.SERVEUR_NOM?.trim() || 'cloud-1',
    domaine: env.DOMAINE?.trim() || 'localhost',
    port: lireEntier(env.PORT, 8080),
    // Image steel-browser DÉRIVÉE (Xvfb + français), ÉPINGLÉE par empreinte.
    imageNavigateur: exiger('IMAGE_NAVIGATEUR'),
    // (30/10, lot D — Beebs) Le navigateur Google Chrome OFFICIEL (serveur-cloud/navigateur-chrome), épinglé lui
    // aussi ; s'il est posé, c'est LUI qui sert les comptes (NAVIGATEUR_MOTEUR=steel pour revenir en arrière).
    imageChrome: env.IMAGE_CHROME?.trim() || '',
    moteurNavigateur: (env.NAVIGATEUR_MOTEUR?.trim() || (env.IMAGE_CHROME?.trim() ? 'chrome' : 'steel')),
    dossierExtensionCrx: env.DOSSIER_EXTENSION_CRX?.trim() || '/srv/fillsell-cloud/extension-crx',
    reseauDocker: env.RESEAU_DOCKER?.trim() || 'fillsell-cloud',
    dossierProfils: env.DOSSIER_PROFILS?.trim() || '/srv/fillsell-cloud/profils',
    // (01/11) L'état du serveur : la preuve du pare-feu (pare-feu.json), les mesures et l'arrêt de l'essai de 48 h.
    dossierEtat: env.DOSSIER_ETAT?.trim() || '/srv/fillsell-cloud/etat',
    // (01/11) L'essai de 48 h sur le vrai produit (endurance.js) : mesures et arrêt au premier blocage. 1 = actif.
    endurance: lireBool(env.ENDURANCE, false),
    // (02/11, règle de Nico : « fige l'empreinte ») L'empreinte du navigateur qu'un déploiement a le droit d'installer à la
    // place de celle notée dans le profil (navigateur.js, verdictEmpreinte) ; vide = aucun changement permis.
    empreinteAutorisee: env.EMPREINTE_AUTORISEE?.trim() || '',
    dossierExtension: env.DOSSIER_EXTENSION?.trim() || '/srv/fillsell-cloud/extension',
    socketDocker: env.SOCKET_DOCKER?.trim() || '/var/run/docker.sock',
    // Capacité MESURÉE du serveur (navigateurs simultanés). Défaut prudent.
    navigateursMax: lireEntier(env.NAVIGATEURS_MAX, 8),
    // (30/10) Poste à vraie puce graphique (deploiement/gpu/) : Chrome sur l'écran du bureau, par la puce de l'hôte ;
    // GPU_GROUPES = les gid video et render de l'hôte (getent group video render).
    navigateurGpu: lireBool(env.NAVIGATEUR_GPU, false),
    gpuGroupes: String(env.GPU_GROUPES ?? '').split(',').map((s) => s.trim()).filter((s) => /^\d+$/.test(s)),
    // (04/11 soir, essai GPU) Les nœuds de la puce Intel sur CET hôte (une carte mère à BMC ASPEED donne card0 à l'ASPEED
    // et card1 à la puce Intel) : « card1,renderD128 » ; vide = card0,renderD128 (le poste du 30/10).
    gpuPeripheriques: String(env.GPU_PERIPHERIQUES ?? '').split(',').map((s) => s.trim()).filter((s) => /^(card|renderD)\d+$/.test(s)),
    memoireNavigateur: env.MEMOIRE_NAVIGATEUR?.trim() || '1400m',
    // (03/11, point 1) Les régies publicitaires échouent comme chez un bloqueur de pub (navigateur.js, DOMAINES_PUBLICITE).
    bloquerPublicite: lireBool(env.BLOQUER_PUBLICITE, true),
    // (03/11, point 1) LE FILET : un navigateur AU REPOS (aucun job en cours, aucun « Me connecter ») au-dessus de ce seuil
    // (Mo) est redémarré proprement (coffre et session sauvegardés, rouvert au tour suivant). Vide = 80 % du plafond du
    // conteneur ; 0 = coupé.
    memoireRedemarrageMo: env.MEMOIRE_REDEMARRAGE_MO == null || String(env.MEMOIRE_REDEMARRAGE_MO).trim() === ''
      ? null : lireEntier(env.MEMOIRE_REDEMARRAGE_MO, null),
    // ── Garde CPU de la base (règle du 04/10) : au-dessus, aucun démarrage
    //    nouveau sauf une connexion demandée par quelqu'un ───────────────────
    cpuPauseAuDessus: lireEntier(env.CPU_PAUSE_AU_DESSUS, 50),
    // ── Rythme ──────────────────────────────────────────────────────────────
    tickPlanificateurS: lireEntier(env.TICK_PLANIFICATEUR_S, 60),
    tickEntretienMin: lireEntier(env.TICK_ENTRETIEN_MIN, 60),
    // (05/11 soir, point 12) La vidange à l'arrêt (vidange.js) : au plus DRAIN_MAX_S secondes pour laisser finir les tâches
    // en cours ; le délai d'arrêt du conteneur (stop_grace_period, docker-compose.yml) est réglé au-dessus.
    drainMaxS: lireEntier(env.DRAIN_MAX_S, 600),
    // (04/11 soir, essai GPU) 0 = ce serveur ne tient PAS le pool (purges, contrôles, visites, échéances, achats,
    // alertes) : seul le pare-feu de ses navigateurs suit le pool (entretien.js). Un seul serveur tient le pool.
    entretienPool: lireBool(env.ENTRETIEN_POOL, true),
    // (04/11 soir, essai GPU) L'enregistrement de FOND (enregistrementFond.js) : chaque requête des onglets de travail et
    // du service worker de l'extension vers une plateforme ou DataDome, dans etat/essais/fond-…jsonl. 1 = actif.
    enregistrementFond: lireBool(env.ENREGISTREMENT_FOND, false),
    // Le service worker de l'extension aussi : 1 = oui. ⚠ Une session DevTools attachée l'empêche de s'endormir.
    enregistrementFondSw: lireBool(env.ENREGISTREMENT_FOND_SW, false),
    // (04/11 soir, essai GPU) L'enregistrement des « Me connecter » / « Résoudre » de TOUTES les plateformes (sans lui :
    // Beebs seulement), sans changer leur affichage. 1 = actif.
    enregistrementConnexions: lireBool(env.ENREGISTREMENT_CONNEXIONS, false),
    sessionMinimaleMin: lireEntier(env.SESSION_MINIMALE_MIN, 8),
    // Le délai entre deux sessions se lit dans la BASE (coin_config
    // cloud_delai_sessions_min) : non tranché au 05/10, jamais figé ici.
    // ── Achats IPRoyal : ⛔ coupés tant que Nico n'a pas dit GO ──────────────
    iproyalJeton: env.IPROYAL_API_TOKEN?.trim() || '',
    iproyalAchatsAutorises: lireBool(env.IPROYAL_ACHATS_AUTORISES, false),
    // (30/10, lot D) Le fournisseur d'IP (fournisseurIp.js) : rotation résidentielle si ses identifiants existent
    // (sinon, rotation sur les IP françaises du pool), tranche de rotation, seuil d'alerte du solde (dollars).
    iproyalResiUtilisateur: env.IPROYAL_RESI_UTILISATEUR?.trim() || '',
    iproyalResiMotDePasse: env.IPROYAL_RESI_MOT_DE_PASSE?.trim() || '',
    rotationHeures: lireEntier(env.ROTATION_HEURES, 24),
    // (30/10, lot D) Le trafic de Beebs SEUL par le résidentiel (relais du navigateur Chrome) : 1 = oui.
    beebsResidentiel: lireBool(env.BEEBS_RESIDENTIEL, false),
    iproyalSoldeAlerte: lireEntier(env.IPROYAL_SOLDE_ALERTE, 5),
    // ── Alertes par mail à support@ (jamais à un utilisateur) ───────────────
    alertesMail: lireBool(env.ALERTES_MAIL, false),
    alertesDestinataire: env.ALERTES_DESTINATAIRE?.trim() || 'support@fillsell.app',
    // ── Comptes servis : vide = tous les comptes Cloud actifs ; sinon, la
    //    liste fermée (test sur le compte de Nico seulement) ─────────────────
    comptesAutorises: String(env.COMPTES_AUTORISES ?? '').split(',').map((s) => s.trim()).filter(Boolean),
    // ── (03/11, points 1 et 5 de Nico) LA FLOTTE (flotte.js) ────────────────
    // NAVIGATEURS_MAX vide = capacité AUTOMATIQUE : ⌊(mémoire de l'hôte − socle) / MEMOIRE_NAVIGATEUR⌋ (index.js).
    navigateursMaxRegle: env.NAVIGATEURS_MAX == null || String(env.NAVIGATEURS_MAX).trim() === '' ? null : lireEntier(env.NAVIGATEURS_MAX, null),
    socleMo: lireEntier(env.SOCLE_MO, 700),
    serveurIpv4: env.SERVEUR_IPV4?.trim() || '',
    // ⛔ Création automatique d'un serveur Hetzner : COUPÉE tant que Nico n'a pas dit GO (et coin_config
    //    cloud_serveurs_auto = 1 en plus) ; sinon le plan est seulement journalisé, « à blanc ».
    hetznerJeton: env.HCLOUD_TOKEN?.trim() || '',
    hetznerCreationAutorisee: lireBool(env.HETZNER_CREATION_AUTORISEE, false),
    cloudflareJeton: env.CLOUDFLARE_API_TOKEN?.trim() || '',
    dossierDeploiement: env.DOSSIER_DEPLOIEMENT?.trim() || '/srv/fillsell-cloud/deploiement',
    dossierPaquets: env.DOSSIER_PAQUETS?.trim() || '/srv/fillsell-cloud/paquets',
    fichierEnv: env.FICHIER_ENV?.trim() || '/srv/fillsell-cloud/.env',
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
  if (c.moteurNavigateur === 'chrome' && !/^fillsell-chrome:[0-9a-f]{12,}$/.test(c.imageChrome)) {
    throw new Error('IMAGE_CHROME doit être épinglée (fillsell-chrome:<empreinte>) quand le moteur est « chrome »');
  }
  if (!/@sha256:[0-9a-f]{64}$/.test(c.imageNavigateur) && !/^fillsell-navigateur:[0-9a-f]{12,}$/.test(c.imageNavigateur)) {
    throw new Error('IMAGE_NAVIGATEUR doit être épinglée (empreinte sha256 ou étiquette fillsell-navigateur:<empreinte>)');
  }
  return Object.freeze(c);
}
