// Le navigateur Cloud d'UN compte : un conteneur steel-browser (image dérivée,
// épinglée), son profil sur le disque du serveur, son IP française dédiée.
//
// ⛔ TROIS VERROUS contre la fuite de l'IP du serveur vers une plateforme :
//   1. steel-browser relance, au démarrage et après chaque session, un
//      navigateur « au repos » SANS proxy (cdp.service, defaultLaunchConfig) :
//      il tourne sur un profil VIDE et jetable (CHROME_USER_DATA_DIR), jamais
//      sur celui du compte, et sans l'extension ;
//   2. le profil du compte n'est monté qu'au chemin que steel n'ouvre qu'avec
//      une session `persist` — toujours créée AVEC le proxy du compte ;
//   3. le pare-feu de l'hôte (deploiement/pare-feu-navigateurs.sh) n'autorise
//      aux conteneurs du réseau br-fillsell QUE le port des proxys IPRoyal :
//      même un navigateur sans proxy ne joint aucune plateforme.
import { mkdir, rm, readdir, chown } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { connecterCdp } from './cdp.js';

export const EXTENSION_NOM = 'fillsell';

const octets = (txt) => {
  const m = String(txt).trim().match(/^(\d+)([kmg]?)$/i);
  if (!m) return 1400 * 1024 * 1024;
  return Number(m[1]) * ({ '': 1, k: 1024, m: 1024 ** 2, g: 1024 ** 3 }[m[2].toLowerCase()]);
};

export const nomConteneur = (user) => `fs-nav-${String(user).replace(/[^0-9a-f-]/gi, '')}`;
export const nouveauProfilId = (user) => `p-${String(user).slice(0, 8)}-${randomBytes(6).toString('hex')}`;

/** La spécification Docker du conteneur d'un compte (pure : testée). */
export function specConteneur({ config, user, profilId }) {
  return {
    Image: config.imageNavigateur,
    Cmd: ['--no-nginx'],
    Env: [
      'CHROME_HEADLESS=false',
      'SKIP_FINGERPRINT_INJECTION=true',
      'DEFAULT_TIMEZONE=Europe/Paris',
      // Verrou 1 : le navigateur « au repos » de steel n'a JAMAIS le profil du compte.
      'CHROME_USER_DATA_DIR=/tmp/navigateur-au-repos',
      'CHROME_ARGS=--lang=fr-FR --accept-lang=fr-FR,fr',
      'HOST=0.0.0.0', 'PORT=3000', 'NODE_ENV=production',
    ],
    Labels: { 'fillsell.cloud': '1', 'fillsell.user': String(user), 'fillsell.profil': profilId },
    HostConfig: {
      // Verrou 2 : le profil du compte, au seul chemin d'une session « persist ».
      Binds: [
        `${config.dossierProfils}/${profilId}:/app/api/user-data-dir`,
        `${config.dossierExtension}:/app/api/extensions/${EXTENSION_NOM}:ro`,
      ],
      Memory: octets(config.memoireNavigateur),
      NanoCpus: 1_500_000_000,
      ShmSize: 256 * 1024 * 1024,
      PidsLimit: 768,
      NetworkMode: config.reseauDocker,
      RestartPolicy: { Name: 'no' },
      LogConfig: { Type: 'json-file', Config: { 'max-size': '5m', 'max-file': '2' } },
    },
  };
}

/** Le corps de création de session steel (pur : testé). Le proxy est OBLIGATOIRE. */
export function corpsSession({ proxyUrl }) {
  if (!proxyUrl || !/^https?:\/\/[^@\s]+@[^:\s]+:\d+$/.test(proxyUrl)) throw new Error('session refusée : proxy du compte absent ou mal formé');
  return {
    proxyUrl,
    persist: true,                      // le profil du compte (verrou 2)
    extensions: [EXTENSION_NOM],
    skipFingerprintInjection: true,     // l'empreinte réelle, identique d'un onglet à l'autre (26/09)
    timezone: 'Europe/Paris',
    dimensions: { width: 1366, height: 768 },
    blockAds: false,
    headless: false,
    userPreferences: {
      intl: { accept_languages: 'fr-FR,fr' },
      session: { restore_on_startup: 5 },  // jamais de reprise d'onglets
      credentials_enable_service: false,
      profile: { password_manager_enabled: false },
    },
  };
}

// ── (30/10, lot D — Beebs) LE MOTEUR « CHROME » : Google Chrome officiel (serveur-cloud/navigateur-chrome) ──────
// Mêmes verrous : le profil du compte n'est monté que dans un conteneur créé AVEC son proxy (PROXY_AMONT est
// obligatoire, le conteneur refuse de démarrer sans) ; le pare-feu de l'hôte reste le troisième verrou. Le conteneur
// est RECRÉÉ à chaque ouverture (la sortie peut changer : rotation), le profil reste sur le disque.
// (30/10, règle de Nico) LE VERROU DES PLATEFORMES vit dans le relais du conteneur (navigateur-chrome/relais.mjs) :
// une plateforme n'y est joignable que si le compte y est connecté (PLATEFORMES_PERMISES, depuis le coffre) ou pendant
// son « Me connecter » (permettre(), par le contrôle du relais, jeton propre à CETTE ouverture). Le moteur steel n'a
// pas de relais : pas de verrou (permettre le dit, sans erreur) — il n'est plus que le repli.
export const PORT_CONTROLE_RELAIS = 3130;
// Les plateformes que le Cloud peut permettre (les autres — eBay par l'API, Opla sortie — restent toujours fermées).
const PERMISSIBLES = new Set(['vinted', 'leboncoin', 'beebs', 'depop']);
/** Une liste de plateformes nettoyée pour le verrou (pure : testée) : connues du Cloud seulement, sans doublon, triée. */
export function plateformesVerrou(liste) {
  return [...new Set((Array.isArray(liste) ? liste : []).map((p) => String(p).toLowerCase()).filter((p) => PERMISSIBLES.has(p)))].sort();
}

/**
 * (30/10) LE POSTE À VRAIE PUCE GRAPHIQUE (NAVIGATEUR_GPU=1, deploiement/gpu/) : sur un serveur Linux sans puce,
 * Leboncoin et Beebs bloquent (rendu SwiftShader) ; un vrai matériel passe (essai du PC de Nico, 30/10). Le conteneur
 * dessine alors sur l'écran du bureau de l'hôte (session « bureau », uid 1000 = « navigateur » du conteneur) par la puce
 * Intel : /dev/dri, socket X monté en lecture, groupes video/render de l'hôte (GPU_GROUPES), ANGLE sur OpenGL.
 */
function specGpu(config) {
  if (!config.navigateurGpu) return { env: [], devices: [], binds: [], groupes: [] };
  return {
    env: ['DISPLAY=:0', 'ECRAN_EXTERNE=1', 'CHROME_ARGS_GL=--use-gl=angle --use-angle=gl'],
    devices: ['/dev/dri/card0', '/dev/dri/renderD128'].map((d) => ({ PathOnHost: d, PathInContainer: d, CgroupPermissions: 'rwm' })),
    binds: ['/tmp/.X11-unix:/tmp/.X11-unix:ro'],
    groupes: config.gpuGroupes ?? [],
  };
}

/** La spécification Docker du conteneur Chrome d'un compte (pure : testée). */
export function specConteneurChrome({ config, user, profilId, proxyUrl, proxyBeebs = null, permises = [], jetonControle }) {
  if (!proxyUrl || !/^https?:\/\/[^@\s]+@[^:\s]+:\d+$/.test(proxyUrl)) throw new Error('conteneur refusé : proxy du compte absent ou mal formé');
  if (!/^[0-9a-f]{32,}$/.test(String(jetonControle ?? ''))) throw new Error('conteneur refusé : jeton du contrôle du verrou absent');
  const gpu = specGpu(config);
  return {
    Image: config.imageChrome,
    Env: [`PROXY_AMONT=${proxyUrl}`, ...(proxyBeebs ? [`PROXY_BEEBS=${proxyBeebs}`] : []), 'PROFIL=/profil',
      `PLATEFORMES_PERMISES=${(permises ?? []).join(',')}`, `JETON_CONTROLE=${jetonControle}`, `PORT_CONTROLE=${PORT_CONTROLE_RELAIS}`, ...gpu.env],
    Labels: { 'fillsell.cloud': '1', 'fillsell.user': String(user), 'fillsell.profil': profilId, 'fillsell.moteur': 'chrome' },
    HostConfig: {
      // Le profil Chrome vit dans un sous-dossier du profil du compte (neuf, à l'utilisateur du conteneur) : la purge
      // efface le profil entier, sous-dossier compris.
      Binds: [`${config.dossierProfils}/${profilId}/chrome:/profil`, `${config.dossierExtensionCrx}:/extension-crx:ro`, ...gpu.binds],
      ...(gpu.devices.length ? { Devices: gpu.devices, GroupAdd: gpu.groupes } : {}),
      Memory: octets(config.memoireNavigateur),
      NanoCpus: 1_500_000_000,
      ShmSize: 512 * 1024 * 1024,
      PidsLimit: 768,
      NetworkMode: config.reseauDocker,
      RestartPolicy: { Name: 'no' },
      LogConfig: { Type: 'json-file', Config: { 'max-size': '5m', 'max-file': '2' } },
    },
  };
}

export function creerNavigateurs({ config, docker, journal }) {
  const chrome = config.moteurNavigateur === 'chrome';
  const ouverts = new Map(); // user → { cdp, ip, conteneur, profilId, ouvertLe }

  const ipDe = (inspect) => inspect?.NetworkSettings?.Networks?.[config.reseauDocker]?.IPAddress || null;

  async function attendreApi(ip, delaiMs = 90_000) {
    const fin = Date.now() + delaiMs;
    let derniere = '';
    while (Date.now() < fin) {
      try {
        const r = await fetch(`http://${ip}:3000/v1/health`, { signal: AbortSignal.timeout(4000) });
        if (r.ok) return true;
        derniere = `HTTP ${r.status}`;
      } catch (e) { derniere = e.message; }
      await new Promise((r) => setTimeout(r, 1500));
    }
    throw new Error(`steel-browser muet (${derniere})`);
  }

  async function assurerConteneur(user, profilId) {
    const nom = nomConteneur(user);
    let c = await docker.inspecter(nom);
    if (c && c.Config?.Labels?.['fillsell.profil'] !== profilId) {
      // Le profil a changé (purge) : l'ancien conteneur ne sert plus jamais.
      await docker.supprimer(nom);
      c = null;
    }
    if (!c) {
      await mkdir(`${config.dossierProfils}/${profilId}`, { recursive: true });
      await docker.creer(nom, specConteneur({ config, user, profilId }));
      c = await docker.inspecter(nom);
    }
    if (!c.State?.Running) {
      await docker.demarrer(nom);
      c = await docker.inspecter(nom);
    }
    const ip = ipDe(c);
    if (!ip) throw new Error(`conteneur ${nom} sans adresse sur ${config.reseauDocker}`);
    return { nom, ip };
  }

  /** (30/10) Chrome : conteneur neuf sur le proxy de CETTE ouverture, profil gardé ; CDP par le relais 9223. */
  async function ouvrirChrome(user, { proxyUrl, proxyBeebs, profilId, permises, jetonControle }) {
    const nom = nomConteneur(user);
    await docker.supprimer(nom).catch(() => {});
    const dossier = `${config.dossierProfils}/${profilId}/chrome`;
    await mkdir(dossier, { recursive: true });
    await chown(dossier, 1000, 1000).catch(() => {});   // l'utilisateur « navigateur » du conteneur
    await docker.creer(nom, specConteneurChrome({ config, user, profilId, proxyUrl, proxyBeebs, permises, jetonControle }));
    await docker.demarrer(nom);
    const ip = ipDe(await docker.inspecter(nom));
    if (!ip) throw new Error(`conteneur ${nom} sans adresse sur ${config.reseauDocker}`);
    let version = null;
    const fin = Date.now() + 60_000;
    while (!version && Date.now() < fin) {
      try { version = await (await fetch(`http://${ip}:9223/json/version`, { signal: AbortSignal.timeout(3000) })).json(); }
      catch { await new Promise((r) => setTimeout(r, 1000)); }
    }
    if (!version?.webSocketDebuggerUrl) throw new Error('Chrome muet (port de pilotage)');
    const cdp = await connecterCdp(String(version.webSocketDebuggerUrl).replace(/^ws:\/\/[^/]+/, `ws://${ip}:9223`), { delaiAppelMs: 90_000 });
    return { cdp, ip, nom, navigateur: version.Browser };
  }

  /** Démarre le navigateur du compte, sur SON proxy et SON profil. Rend { cdp, ip, … }. */
  async function ouvrir(user, { proxyUrl, proxyBeebs = null, profilId, permises = [] }) {
    if (ouverts.has(user)) return ouverts.get(user);
    if (chrome) {
      // Le jeton du contrôle du verrou : neuf à chaque ouverture, gardé dans le handle, JAMAIS journalisé.
      const jetonControle = randomBytes(24).toString('hex');
      const permisesVerrou = plateformesVerrou(permises);
      const { cdp, ip, nom, navigateur } = await ouvrirChrome(user, { proxyUrl, proxyBeebs, profilId, permises: permisesVerrou, jetonControle });
      const h = { cdp, ip, conteneur: nom, profilId, ouvertLe: Date.now(), moteur: 'chrome', navigateur, permises: permisesVerrou };
      Object.defineProperty(h, 'jetonControle', { value: jetonControle, enumerable: false });
      cdp.on((m) => { if (m.method === '__ferme__' && ouverts.get(user) === h) ouverts.delete(user); });
      await cdp.send('Browser.setDownloadBehavior', { behavior: 'deny' }).catch(() => {});
      ouverts.set(user, h);
      journal.info('navigateur_ouvert', { user, conteneur: nom, moteur: 'chrome', navigateur });
      return h;
    }
    const { nom, ip } = await assurerConteneur(user, profilId);
    await attendreApi(ip);
    const corps = corpsSession({ proxyUrl });
    const r = await fetch(`http://${ip}:3000/v1/sessions`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps),
      signal: AbortSignal.timeout(90_000),
    });
    if (!r.ok) throw new Error(`steel : création de session → HTTP ${r.status}`);
    const cdp = await connecterCdp(`ws://${ip}:3000/`, { delaiAppelMs: 90_000 });
    const h = { cdp, ip, conteneur: nom, profilId, ouvertLe: Date.now() };
    cdp.on((m) => { if (m.method === '__ferme__' && ouverts.get(user) === h) ouverts.delete(user); });
    // Aucun téléchargement, jamais : rien ne s'écrit sur le disque du serveur par une page.
    await cdp.send('Browser.setDownloadBehavior', { behavior: 'deny' }).catch(() => {});
    ouverts.set(user, h);
    journal.info('navigateur_ouvert', { user, conteneur: nom });
    return h;
  }

  /** Ferme : la session steel est rendue, puis le conteneur s'arrête (rien ne tourne sans raison). */
  async function fermer(user, raison = 'fin') {
    const h = ouverts.get(user);
    ouverts.delete(user);
    const nom = nomConteneur(user);
    try { h?.cdp?.fermer(); } catch { /* déjà parti */ }
    const ins = await docker.inspecter(nom);
    const ip = ipDe(ins);
    if (ins?.Config?.Labels?.['fillsell.moteur'] === 'chrome') {
      // Chrome : le conteneur porte le proxy de SA session — il ne sert plus jamais (le profil reste).
      await docker.arreter(nom).catch(() => {});
      await docker.supprimer(nom).catch(() => {});
      journal.info('navigateur_ferme', { user, raison, moteur: 'chrome' });
      return;
    }
    if (ip && ins?.State?.Running) {
      try { await fetch(`http://${ip}:3000/v1/sessions/release`, { method: 'POST', signal: AbortSignal.timeout(20_000) }); } catch { /* best-effort */ }
    }
    await docker.arreter(nom).catch(() => {});
    journal.info('navigateur_ferme', { user, raison });
  }

  /**
   * (30/10, règle de Nico) Les plateformes joignables par le navigateur du compte : REMPLACE l'ensemble (connectées,
   * plus celle d'un « Me connecter » en cours). Rend { ok, permises } ; { ok: false, raison } si rien n'est ouvert ou
   * si le moteur n'a pas de verrou (steel). Lève si le relais refuse ou ne répond pas : la page ne s'ouvrirait pas.
   */
  async function permettre(user, plateformes) {
    const h = ouverts.get(user);
    if (!h) return { ok: false, raison: 'ferme' };
    if (h.moteur !== 'chrome' || !h.jetonControle) return { ok: false, raison: 'moteur_sans_verrou' };
    const liste = plateformesVerrou(plateformes);
    let derniere = '';
    for (let essai = 0; essai < 4; essai++) {
      try {
        const r = await fetch(`http://${h.ip}:${PORT_CONTROLE_RELAIS}/permis`, {
          method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Jeton': h.jetonControle },
          body: JSON.stringify({ plateformes: liste }), signal: AbortSignal.timeout(4000),
        });
        if (r.ok) { h.permises = liste; return { ok: true, permises: liste }; }
        derniere = `HTTP ${r.status}`;
        if (r.status === 400 || r.status === 401) break;
      } catch (e) { derniere = e.message; }
      await new Promise((ok) => setTimeout(ok, 500));
    }
    throw new Error(`verrou du relais injoignable (${derniere})`);
  }

  /** Détruit le conteneur ET le profil du compte (purge). Rend ce qui reste du profil (0 attendu). */
  async function detruire(user, profilId) {
    await fermer(user, 'purge').catch(() => {});
    await docker.supprimer(nomConteneur(user));
    if (profilId) await rm(`${config.dossierProfils}/${profilId}`, { recursive: true, force: true });
    const restants = profilId ? await readdir(`${config.dossierProfils}/${profilId}`).then((l) => l.length).catch(() => 0) : 0;
    return { profilsRestants: restants };
  }

  return { ouvrir, fermer, detruire, permettre, ouvert: (user) => ouverts.get(user) ?? null, ouverts: () => [...ouverts.keys()] };
}
