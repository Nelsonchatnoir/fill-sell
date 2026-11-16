// ═══════════════════════════════════════════════════════════════════════════
// L'OTA S'APPLIQUE DÈS L'OUVERTURE SUIVANTE (16/11/2026 soir, ordre 1 de Nico) — pur, dépendances injectées
// ═══════════════════════════════════════════════════════════════════════════
// Constat (16/11, iPhone de Nico, compte 08918381) : l'OTA 2.9.207 envoyée après a9b7b5d (19:34) n'a tourné qu'après un
// passage en arrière-plan de plus : 19:43:54 ouverture sur l'ancienne version (formule_cloud_issue de 19:44:46 sans
// `quitte_app`), 19:46:47 la nouvelle, essai prouvé à 19:47:43.
// Lecture du code natif du plugin 8.51.2 (celui des binaires en vente : iPhone 2.9.164, Android 2.9.205 vc39) :
//   · la recherche d'une OTA ne part qu'au retour au premier plan (appMovedToForeground → backgroundDownload ; aucune
//     recherche périodique, periodCheckDelay = 0) ;
//   · après le tout premier lancement d'un binaire, 'atInstall' se comporte en 'atBackground' : le bundle téléchargé est
//     mis en file (setNextBundle + événement « updateAvailable ») et n'est POSÉ qu'au passage en arrière-plan suivant
//     (installNext) — d'où « ouvrir, fermer, rouvrir » pour voir une OTA publiée pendant que l'app tournait.
// La règle :
//   · une FENÊTRE DE LANCEMENT s'ouvre au démarrage à froid et à chaque retour au premier plan (iPhone : `resume`,
//     Android : appStateChange actif — jamais la feuille d'Apple ni Face ID) ; elle dure FENETRE_MS et se ferme au
//     passage en arrière-plan ;
//   · un bundle PRÊT (updateAvailable, appReady d'un bundle retenu, getNextBundle) plus récent que celui qui tourne,
//     arrivé dans la fenêtre alors que la personne ne fait RIEN → le splash, puis CapacitorUpdater.set({ id }) : la page
//     repart sur l'OTA derrière le splash, à cette ouverture-ci ;
//   · sinon (un geste depuis l'ouverture, une saisie, une fenêtre ouverte, un achat, une veille d'achat, le parcours
//     d'entrée, une publication, un envoi…) → rien : le plugin le pose au prochain passage en arrière-plan, comme avant ;
//   · jamais deux rechargements (un par page, garde de boucle par bundle) ; tout échec du plugin → le splash retombe,
//     rien ne jette ;
//   · le premier lancement d'un binaire reste au plugin ('atInstall', splashDemarrage.js, plafond 10 s) : rien n'est
//     décidé avant que App.jsx ait signalé l'issue du splash. Plafond passé : iPhone → le bundle que le délai
//     (setMultiDelay) a retenu est mis en file (next + cancelDelay) au lieu d'attendre DEUX passages en arrière-plan ;
//     Android → le plugin recharge lui-même à la fin du téléchargement (directUpdateFinish ignore les délais) : un
//     rideau (splash) au mieux, jamais un 2e rechargement.
// Verrou : scripts/ota-ouverture-suivante-selftest.mjs (npm run selftest:ota-ouverture-suivante).

/** Durée de la fenêtre de lancement, depuis le démarrage à froid ou le retour au premier plan. */
export const FENETRE_MS = 15000;
/** Un instant avant le rideau : le plugin cache lui-même le splash à la fin de sa vérification (autoSplashscreen). */
export const DELAI_RIDEAU_MS = 400;
/** Si la page n'est pas repartie à ce délai, le splash retombe (jamais d'écran bloqué). */
export const SECOURS_RIDEAU_MS = 8000;
/** Un même bundle rechargé il y a moins que ça, et pas arrivé : on n'insiste pas (garde de boucle). */
export const GARDE_BOUCLE_MS = 120000;
export const CLE_RECHARGE_OUVERTURE = 'fs_maj_ouverture';

const STATUTS_INUTILISABLES = new Set(['error', 'deleted', 'deleting', 'downloading']);
const IDS_INUTILISABLES = new Set(['builtin', 'unknown']);
const GESTES = ['pointerdown', 'touchstart', 'keydown', 'input'];

/** 1 si a > b, -1 si a < b, 0 si égales, null si l'une n'est pas un numéro « 2.9.208 » (pur). */
export function comparerVersions(a, b) {
  const lireV = (v) => (typeof v === 'string' && /^\d+(\.\d+)*$/.test(v) ? v.split('.').map(Number) : null);
  const x = lireV(a), y = lireV(b);
  if (!x || !y) return null;
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0);
    if (d !== 0) return d > 0 ? 1 : -1;
  }
  return 0;
}

/** Un champ où l'on tape (pur). */
export function estEditable(el) {
  if (!el) return false;
  const tag = String(el.tagName ?? '').toUpperCase();
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable === true;
}

function dialogueVisible(doc) {
  try {
    const els = doc?.querySelectorAll?.('[role="dialog"],[aria-modal="true"],dialog[open]') ?? [];
    for (const el of els) {
      try { if (typeof el?.getClientRects !== 'function' || el.getClientRects().length > 0) return true; } catch { return true; }
    }
  } catch { /* document illisible : rien de plus à dire */ }
  return false;
}

/**
 * Ce que fait la personne, en raisons lisibles (pur). Mêmes critères que le rechargement du web (App.jsx, « Bundle
 * périmé ») : stepper ouvert (fs_stepper_host), saisie, fenêtre ouverte — plus ce qu'App déclare et un geste depuis
 * l'ouverture.
 */
export function raisonsOccupation({ interaction = false, declarees = {}, doc = null, session = null } = {}) {
  const r = [];
  if (interaction) r.push('interaction');
  for (const [nom, actif] of Object.entries(declarees ?? {})) if (actif) r.push(nom);
  if (estEditable(doc?.activeElement)) r.push('saisie');
  if (dialogueVisible(doc)) r.push('fenetre_ouverte');
  try { if (session?.getItem?.('fs_stepper_host')) r.push('publication'); } catch { /* stockage indisponible */ }
  return [...new Set(r)];
}

/**
 * LA décision, pour un bundle prêt (pur).
 * phase : 'attente_demarrage' (le splash n'a pas parlé) | 'actif' | 'natif_en_charge' (Android, plafond passé) | 'inactif'.
 * Rend { action: 'appliquer' | 'reporter' | 'rideau' | 'attendre' | 'ignorer', raison }.
 */
export function deciderMiseAJour({ natif = false, phase = 'inactif', bundle = null, courant = null, fenetreOuverte = false,
  occupations = [], rechargeLance = false, echecSet = false, rechargeRecente = false } = {}) {
  if (!natif || phase === 'inactif') return { action: 'ignorer', raison: 'web' };
  const id = bundle?.id;
  if (!id || IDS_INUTILISABLES.has(id)) return { action: 'ignorer', raison: 'pas_de_bundle' };
  if (STATUTS_INUTILISABLES.has(bundle.status)) return { action: 'ignorer', raison: 'bundle_inutilisable' };
  if (courant?.id && id === courant.id) return { action: 'ignorer', raison: 'deja_courant' };
  if (comparerVersions(bundle.version, courant?.version) !== 1) return { action: 'ignorer', raison: 'pas_plus_recent' };
  if (phase === 'attente_demarrage') return { action: 'attendre', raison: 'demarrage' };
  if (rechargeLance) return { action: 'ignorer', raison: 'recharge_deja_lance' };
  if (phase === 'natif_en_charge') {
    return fenetreOuverte && occupations.length === 0 ? { action: 'rideau', raison: 'natif_en_charge' } : { action: 'ignorer', raison: 'natif_en_charge' };
  }
  if (echecSet) return { action: 'reporter', raison: 'echec_precedent' };
  if (rechargeRecente) return { action: 'reporter', raison: 'recharge_recente' };
  if (!fenetreOuverte) return { action: 'reporter', raison: 'hors_fenetre' };
  if (occupations.length) return { action: 'reporter', raison: `occupe:${occupations.join('+')}` };
  return { action: 'appliquer', raison: 'fenetre_de_lancement' };
}

export function creerMiseAJourOuverture({
  natif = false, plateforme = 'web', CapacitorUpdater = null, SplashScreen = null, ecouterApp = null,
  documentCible = null, stockage = null, stockageSession = null,
  horloge = () => Date.now(), attendre = (ms) => new Promise((r) => setTimeout(r, ms)),
  minuterie = (f, ms) => setTimeout(f, ms), annulerMinuterie = (t) => clearTimeout(t),
  fenetreMs = FENETRE_MS, delaiRideauMs = DELAI_RIDEAU_MS, secoursMs = SECOURS_RIDEAU_MS,
} = {}) {
  const e = {
    phase: natif ? 'attente_demarrage' : 'inactif',
    fenetre: null, delaiPose: false, rechargeLance: false, echecSet: false,
    enFile: [], reportes: new Set(), compteurs: {}, lecteur: null,
    journal: null, fileJournal: [], decisions: [], arrivee: null,
  };

  const noter = (action, raison, bundle = null, extra = {}) => {
    const ligne = { action, raison, version: bundle?.version ?? null, plateforme, ...extra };
    if (e.journal) { try { Promise.resolve(e.journal('maj_ouverture', ligne)).catch(() => {}); } catch { /* journal indisponible */ } }
    else if (e.fileJournal.length < 10) e.fileJournal.push(ligne);
  };
  const lireMarque = () => { try { const m = JSON.parse(stockage?.getItem?.(CLE_RECHARGE_OUVERTURE) ?? 'null'); return m && typeof m.id === 'string' && Number.isFinite(m.t) ? m : null; } catch { return null; } };
  const ecrireMarque = (m) => { try { stockage?.setItem?.(CLE_RECHARGE_OUVERTURE, JSON.stringify(m)); } catch { /* sans mémoire : la garde de page suffit */ } };
  const cacherSplash = () => { try { Promise.resolve(SplashScreen?.hide?.({ fadeOutDuration: 350 })).catch(() => {}); } catch { /* rien */ } };

  const ouvrirFenetre = (raison) => { e.fenetre = { depuis: horloge(), interaction: false, raison }; e.reportes.clear(); };
  const fenetreOuverte = () => !!e.fenetre && horloge() - e.fenetre.depuis <= fenetreMs;
  const occupations = () => {
    let declarees = {};
    try { declarees = { ...(e.lecteur?.() ?? {}) }; } catch { declarees = { lecture_impossible: true }; }
    for (const [nom, n] of Object.entries(e.compteurs)) if (n > 0) declarees[nom] = true;
    return raisonsOccupation({ interaction: e.fenetre?.interaction === true, declarees, doc: documentCible, session: stockageSession });
  };
  const rechargeRecente = (id) => { const m = lireMarque(); return !!m && m.id === id && horloge() - m.t < GARDE_BOUCLE_MS; };

  async function reporter(bundle, raison) {
    // Plafond du premier lancement sur iPhone : le délai posé par splashDemarrage a RETENU le bundle (téléchargé, pas en
    // file) ; le délai « background » ne tombe qu'au retour au premier plan → deux passages en arrière-plan. Le
    // téléchargement est fini : on met le bundle en file et on lève le délai → posé au premier passage.
    if (e.delaiPose && plateforme === 'ios') {
      e.delaiPose = false;
      try { await CapacitorUpdater.next({ id: bundle.id }); } catch { /* le plugin le remettra en file au retour */ }
      try { await CapacitorUpdater.cancelDelay(); } catch { /* rien */ }
    }
    if (!e.reportes.has(bundle.id)) { e.reportes.add(bundle.id); noter('reportee', raison, bundle); }
    return 'reporte';
  }

  async function appliquer(bundle, courant) {
    e.rechargeLance = true;
    const abandon = async (raison) => { e.rechargeLance = false; return reporter(bundle, raison); };
    await attendre(delaiRideauMs);
    if (!fenetreOuverte() || occupations().length) return abandon('occupe_au_dernier_moment');
    try { await SplashScreen.show({ autoHide: false, fadeInDuration: 150, fadeOutDuration: 350 }); }
    catch { return abandon('splash_indisponible'); }
    if (occupations().length) { cacherSplash(); return abandon('occupe_au_dernier_moment'); }
    if (e.delaiPose) { e.delaiPose = false; try { await CapacitorUpdater.cancelDelay(); } catch { /* set() ne lit pas les délais */ } }
    ecrireMarque({ id: bundle.id, version: bundle.version ?? null, de: courant?.version ?? null, t: horloge() });
    const secours = minuterie(() => { e.echecSet = true; cacherSplash(); noter('echec', 'set_sans_effet', bundle); }, secoursMs);
    try {
      await CapacitorUpdater.set({ id: bundle.id }); // la page repart : rien ne s'exécute après, en principe
      return 'applique';
    } catch {
      try { annulerMinuterie(secours); } catch { /* rien */ }
      e.echecSet = true;
      cacherSplash();
      noter('echec', 'set_refuse', bundle);
      await reporter(bundle, 'set_refuse');
      return 'echec_set';
    }
  }

  async function rideau(bundle) {
    e.phase = 'actif';
    e.rechargeLance = true; // le rechargement est celui du plugin ; jamais un 2e de notre part dans cette page
    e.echecSet = true;
    try { await SplashScreen.show({ autoHide: false, fadeInDuration: 150, fadeOutDuration: 350 }); }
    catch { return 'rideau_indisponible'; }
    minuterie(() => cacherSplash(), secoursMs);
    noter('rideau', 'natif_en_charge', bundle);
    return 'rideau';
  }

  async function traiter(bundle, source) {
    let courant = null;
    try { courant = (await CapacitorUpdater.current())?.bundle ?? null; } catch { return 'echec_plugin'; }
    const d = deciderMiseAJour({ natif, phase: e.phase, bundle, courant, fenetreOuverte: fenetreOuverte(), occupations: occupations(),
      rechargeLance: e.rechargeLance, echecSet: e.echecSet, rechargeRecente: rechargeRecente(bundle.id) });
    e.decisions.push({ ...d, id: bundle.id, source });
    if (e.decisions.length > 30) e.decisions.shift();
    if (d.action === 'attendre') { e.enFile.push({ bundle, source }); return 'attendre'; }
    if (d.action === 'appliquer') return appliquer(bundle, courant);
    if (d.action === 'reporter') return reporter(bundle, d.raison);
    if (d.action === 'rideau') return rideau(bundle);
    return 'ignore';
  }

  async function recevoir(bundle, source) {
    try {
      if (e.phase === 'inactif' || !bundle?.id) return 'ignore';
      if (e.phase === 'attente_demarrage') { if (e.enFile.length < 10) e.enFile.push({ bundle, source }); return 'attendre'; }
      return await traiter(bundle, source);
    } catch { return 'echec'; }
  }

  async function lireSuivant(source) {
    if (e.phase !== 'actif') return;
    try { const b = await CapacitorUpdater.getNextBundle(); if (b?.id) await recevoir(b, source); } catch { /* méthode absente : les événements suffisent */ }
  }

  const brancher = (f) => { try { Promise.resolve(f()).catch(() => {}); } catch { /* écoute indisponible */ } };

  return {
    demarrer() {
      if (!natif) return 'web';
      ouvrirFenetre('demarrage');
      // Nouvelle page juste après NOTRE rechargement : si App ne monte pas, le splash retombe quand même.
      const m = lireMarque();
      if (m && horloge() - m.t < 30000) { e.arrivee = m; minuterie(() => cacherSplash(), secoursMs); }
      brancher(() => CapacitorUpdater.addListener('updateAvailable', (ev) => recevoir(ev?.bundle, 'updateAvailable')));
      // iPhone, plafond passé : le bundle retenu par le délai n'arrive QUE par appReady (« Update delayed… »). Une
      // installation ratée (« … failed ») n'est jamais rejouée d'ici.
      brancher(() => CapacitorUpdater.addListener('appReady', (ev) => { if (/fail|error/i.test(String(ev?.status ?? ''))) return; recevoir(ev?.bundle, 'appReady'); }));
      for (const type of GESTES) {
        try { documentCible?.addEventListener?.(type, () => { if (e.fenetre) e.fenetre.interaction = true; }, { capture: true, passive: true }); } catch { /* rien */ }
      }
      if (typeof ecouterApp === 'function') {
        const retour = () => { ouvrirFenetre('retour'); return lireSuivant('retour'); };
        if (plateforme === 'ios') {
          brancher(() => ecouterApp('resume', retour));
          brancher(() => ecouterApp('pause', () => { e.fenetre = null; }));
        } else {
          brancher(() => ecouterApp('appStateChange', (s) => { if (s?.isActive === true) return retour(); if (s?.isActive === false) e.fenetre = null; return undefined; }));
        }
      }
      return 'natif';
    },
    /** App.jsx, issue de cacherSplashAuBonMoment : 'web' | 'ota' | 'deja_lance' | 'premier_lancement_pret' | 'premier_lancement_plafond' | 'echec'. */
    async signalerDemarrage(issue) {
      if (e.phase !== 'attente_demarrage') return;
      if (issue === 'web') { e.phase = 'inactif'; return; }
      if (issue === 'premier_lancement_plafond') { e.delaiPose = true; e.phase = plateforme === 'android' ? 'natif_en_charge' : 'actif'; }
      else e.phase = 'actif';
      if (e.fenetre) e.fenetre.depuis = horloge(); // la personne voit l'app à partir de maintenant
      if (e.arrivee) {
        const m = e.arrivee; e.arrivee = null;
        try {
          const c = (await CapacitorUpdater.current())?.bundle;
          if (c?.id === m.id) noter('appliquee', 'fenetre_de_lancement', { version: m.version }, { de: m.de, vers: m.version, ms: Math.max(0, horloge() - m.t) });
          else noter('echec', 'pas_arrivee', { version: m.version }, { de: m.de, vers: m.version });
        } catch { /* rien */ }
      }
      for (const { bundle, source } of e.enFile.splice(0)) await recevoir(bundle, source);
      await lireSuivant('demarrage');
    },
    /** App.jsx : une fonction qui rend { nom: booléen } (achat, veille, parcours, formulaire, publication…). */
    poserLecteurOccupations(f) { e.lecteur = typeof f === 'function' ? f : null; },
    poserJournal(f) {
      e.journal = typeof f === 'function' ? f : null;
      if (e.journal) for (const l of e.fileJournal.splice(0)) { try { Promise.resolve(e.journal('maj_ouverture', l)).catch(() => {}); } catch { /* rien */ } }
    },
    occuper(nom) {
      e.compteurs[nom] = (e.compteurs[nom] ?? 0) + 1;
      let libere = false;
      return () => { if (libere) return; libere = true; e.compteurs[nom] = Math.max(0, (e.compteurs[nom] ?? 1) - 1); };
    },
    async occuperPendant(nom, fn) {
      const liberer = this.occuper(nom);
      try { return await fn(); } finally { liberer(); }
    },
    etat: () => ({ phase: e.phase, fenetre: e.fenetre ? { ...e.fenetre } : null, rechargeLance: e.rechargeLance, echecSet: e.echecSet,
      delaiPose: e.delaiPose, decisions: e.decisions.slice(), occupations: occupations() }),
  };
}

// ── Le point d'accès de l'app : main.jsx installe, App.jsx signale et déclare. Sans installation : rien. ──────────────
let instance = null;
export function installerMiseAJourOuverture(deps) {
  if (instance) return instance;
  try { instance = creerMiseAJourOuverture(deps); instance.demarrer(); } catch { instance = null; }
  return instance;
}
export function signalerDemarrageSplash(issue) { try { Promise.resolve(instance?.signalerDemarrage(issue)).catch(() => {}); } catch { /* rien */ } }
export function poserLecteurOccupations(f) { try { instance?.poserLecteurOccupations(f); } catch { /* rien */ } }
export function poserJournalMiseAJour(f) { try { instance?.poserJournal(f); } catch { /* rien */ } }
export async function occuperPendant(nom, fn) {
  let liberer = () => {};
  try { liberer = instance?.occuper(nom) ?? liberer; } catch { /* rien */ }
  try { return await fn(); } finally { liberer(); }
}
