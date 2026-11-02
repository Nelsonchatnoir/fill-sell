// Le navigateur Cloud d'UN compte : un conteneur steel-browser (image PUBLIÉE,
// épinglée), son profil sur le disque du serveur, son IP française dédiée.
//
// (01/11, décision de Nico) LANCÉ EXACTEMENT COMME L'ESSAI QUI A PASSÉ (rapport machine-cloud-3010 § 17 : Leboncoin
// formulaire, Beebs glissière) : steel-browser v0.5.4 tel que publié (Chromium 156.0.8078.73 de Debian), avec écran
// (Xvfb 1920×1080, que l'image ne démarre pas elle-même), injection d'empreinte coupée, publicités non bloquées, aucun
// résolveur, 3D logicielle activée comme Steel loué (FILTER_CHROME_ARGS / CHROME_ARGS). Ajout : `persist`, qui range le
// profil du compte sur le disque (les connexions tiennent d'un redémarrage à l'autre) — steel le met dans
// /app/api/user-data-dir, son navigateur au repos garde son profil jetable (/tmp/steel-chrome).
// (02/11, décision de Nico) PROFIL FRANÇAIS, cohérent avec l'IP française : l'essai tournait en en-US et en UTC (cause
// probable de la glissière Leboncoin). Langue fr-FR (--lang : langue de Chrome et Intl), Accept-Language et
// navigator.languages fr-FR, fr (préférence intl du profil, posée par steel avant le lancement), fuseau Europe/Paris
// (TZ du processus Chrome : steel ne lui passe que HOME, TZ et DISPLAY).
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
import { mkdir, rm, readdir, chown, readFile, writeFile } from 'node:fs/promises';
import { randomBytes, createHash } from 'node:crypto';
import { connecterCdp } from './cdp.js';

export const EXTENSION_NOM = 'fillsell';

const octets = (txt) => {
  const m = String(txt).trim().match(/^(\d+)([kmg]?)$/i);
  if (!m) return 1400 * 1024 * 1024;
  return Number(m[1]) * ({ '': 1, k: 1024, m: 1024 ** 2, g: 1024 ** 3 }[m[2].toLowerCase()]);
};

// L'image de l'essai du 01/11, par son empreinte (jamais « latest »).
export const IMAGE_STEEL_ESSAI_0111 = 'ghcr.io/steel-dev/steel-browser@sha256:b5bd99decf276ff6f9a8606def9f7408a376e17ac66a9e12cb82d8400cca23bd';
// Le lancement de l'essai, mot pour mot : l'écran d'abord, puis steel-browser tel quel (sans nginx).
export const LANCEMENT_AVEC_ECRAN = 'rm -f /tmp/.X10-lock; Xvfb :10 -screen 0 1920x1080x24 -nolisten tcp -ac >/dev/null 2>&1 & '
  + 'i=0; while [ ! -e /tmp/.X11-unix/X10 ] && [ $i -lt 50 ]; do i=$((i+1)); sleep 0.1; done; exec /app/api/entrypoint.sh --no-nginx';
// Les réglages de lancement de l'essai, mot pour mot (3D logicielle comme Steel loué : choix de Nico, 01/11).
export const ENV_ESSAI_0111 = Object.freeze([
  'CHROME_HEADLESS=false',
  'SKIP_FINGERPRINT_INJECTION=true',
  'DISPLAY=:10',
  'FILTER_CHROME_ARGS=--disable-gpu --use-gl=swiftshader',
  'CHROME_ARGS=--use-angle=swiftshader --enable-unsafe-swiftshader --lang=fr-FR',
  'HOST=0.0.0.0',
  'PORT=3000',
  // (02/11) Le fuseau du navigateur au repos (et de toute session sans fuseau) : Europe/Paris, jamais UTC.
  'DEFAULT_TIMEZONE=Europe/Paris',
]);
// (02/11) Langue et fuseau de la session du compte (corpsSession) : français, Paris.
export const LANGUES_PROFIL = 'fr-FR,fr';
export const FUSEAU_PROFIL = 'Europe/Paris';
/** L'empreinte du lancement (pure) : un conteneur lancé autrement (langue, fuseau, image) est recréé, profil gardé. */
export function empreinteLancement(spec) {
  return createHash('sha256').update(JSON.stringify([spec?.Image, spec?.Cmd, spec?.Env])).digest('hex').slice(0, 12);
}

/**
 * (01/11) « PARE-FEU AVANT LE NAVIGATEUR » : la preuve que deploiement/pare-feu-navigateurs.sh a tourné depuis CE
 * démarrage du serveur (son numéro de démarrage, boot_id, le même dans un conteneur que sur l'hôte). Pure : testée.
 * Rend { ok, raison, destinations }.
 */
export function preuvePareFeu(preuveBrute, bootIdCourant) {
  let p = null;
  try { p = JSON.parse(String(preuveBrute ?? '')); } catch { return { ok: false, raison: 'preuve_illisible' }; }
  const courant = String(bootIdCourant ?? '').trim();
  if (!courant || !p?.boot_id) return { ok: false, raison: 'preuve_absente' };
  if (String(p.boot_id).trim() !== courant) return { ok: false, raison: 'preuve_d_un_autre_demarrage' };
  return { ok: true, destinations: String(p.destinations ?? '') };
}

/** Refuse (lève) tant que le pare-feu des navigateurs n'est pas posé depuis ce démarrage. */
export async function exigerPareFeu(config) {
  const dossier = config.dossierEtat || '/srv/fillsell-cloud/etat';
  const [brute, boot] = await Promise.all([
    readFile(`${dossier}/pare-feu.json`, 'utf8').catch(() => ''),
    readFile('/proc/sys/kernel/random/boot_id', 'utf8').catch(() => ''),
  ]);
  const v = preuvePareFeu(brute, boot);
  if (!v.ok) throw new Error(`navigateur refusé : pare-feu des navigateurs non prouvé (${v.raison})`);
  return v;
}

/**
 * (01/11) UNE COPIE NEUVE DE L'EXTENSION ATTEINT VRAIMENT LE NAVIGATEUR : le profil du compte est gardé (persist) et
 * Chrome y garde le script de fond de l'extension en cache tant que son numéro de version ne change pas — or la copie
 * Cloud porte le numéro du parc (0.6.164). Vu le 01/11 : la copie neuve sur le disque, l'ancienne qui tournait. Règle :
 * l'empreinte du script de fond est notée dans le profil ; quand elle change, le cache des service workers du profil est
 * effacé AVANT d'ouvrir la session (les cookies, donc les connexions, restent). Pure pour la décision : testée.
 */
export function cacheExtensionAEffacer(empreinteNotee, empreinteCopie) {
  return Boolean(empreinteCopie) && String(empreinteNotee ?? '').trim() !== String(empreinteCopie).trim();
}

export const nomConteneur = (user) => `fs-nav-${String(user).replace(/[^0-9a-f-]/gi, '')}`;
export const nouveauProfilId = (user) => `p-${String(user).slice(0, 8)}-${randomBytes(6).toString('hex')}`;

/** La spécification Docker du conteneur d'un compte (pure : testée). */
export function specConteneur({ config, user, profilId }) {
  return {
    Image: config.imageNavigateur,
    Entrypoint: ['/bin/sh', '-c'],
    Cmd: [LANCEMENT_AVEC_ECRAN],
    // Verrou 1 : le navigateur « au repos » de steel garde son profil jetable (/tmp/steel-chrome) ; celui du compte
    // n'est ouvert que par une session « persist » (corpsSession), toujours créée avec le proxy.
    Env: [...ENV_ESSAI_0111],
    Labels: { 'fillsell.cloud': '1', 'fillsell.user': String(user), 'fillsell.profil': profilId,
      'fillsell.lancement': empreinteLancement({ Image: config.imageNavigateur, Cmd: [LANCEMENT_AVEC_ECRAN], Env: [...ENV_ESSAI_0111] }) },
    HostConfig: {
      // Verrou 2 : le profil du compte, au seul chemin d'une session « persist ».
      Binds: [
        `${config.dossierProfils}/${profilId}:/app/api/user-data-dir`,
        `${config.dossierExtension}:/app/api/extensions/${EXTENSION_NOM}:ro`,
      ],
      Memory: octets(config.memoireNavigateur),
      NanoCpus: 2_000_000_000,
      ShmSize: 1024 * 1024 * 1024,   // l'essai : --shm-size=1g
      Init: true,                    // l'essai : --init
      PidsLimit: 768,
      NetworkMode: config.reseauDocker,
      RestartPolicy: { Name: 'no' },
      LogConfig: { Type: 'json-file', Config: { 'max-size': '5m', 'max-file': '2' } },
    },
  };
}

/** Le corps de création de session steel (pur : testé). Le proxy est OBLIGATOIRE. Celui de l'essai, plus `persist`. */
export function corpsSession({ proxyUrl }) {
  if (!proxyUrl || !/^https?:\/\/[^@\s]+@[^:\s]+:\d+$/.test(proxyUrl)) throw new Error('session refusée : proxy du compte absent ou mal formé');
  return {
    proxyUrl,
    skipFingerprintInjection: true,     // l'empreinte réelle, jamais inventée
    headless: false,
    blockAds: false,                    // steel bloque les publicités par défaut, Steel loué non : l'essai les laissait
    extensions: [EXTENSION_NOM],
    persist: true,                      // le profil du compte, sur le disque (verrou 2)
    // (02/11) Profil français : fuseau de Paris, langues fr-FR puis fr (préférences du profil, fusionnées par steel).
    timezone: FUSEAU_PROFIL,
    userPreferences: { intl: { accept_languages: LANGUES_PROFIL, selected_languages: LANGUES_PROFIL } },
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

// (01/11) LE VERROU DES PLATEFORMES SUR LE MOTEUR STEEL (règle de Nico du 30/10, portée sur steel) : une plateforme
// n'est joignable que si le compte y est connecté (coffre) ou pendant son « Me connecter ». Sans relais dans le
// conteneur (l'essai du 01/11 n'en avait pas), le verrou est une interception DevTools AU NIVEAU DU NAVIGATEUR
// (Fetch.enable sur la session du navigateur : onglets, cadres et service worker de l'extension) qui ne vise QUE les
// domaines des plateformes FERMÉES — une plateforme ouverte n'est jamais interceptée, son trafic reste celui de
// l'essai. Une requête vers une plateforme fermée échoue (BlockedByClient) : aucune visite anonyme sur l'IP du compte.
export const DOMAINES_VERROU = Object.freeze({
  vinted: Object.freeze(['vinted.fr', 'vinted.com', 'vinted.net']),
  leboncoin: Object.freeze(['leboncoin.fr']),
  beebs: Object.freeze(['beebs.app']),
  depop: Object.freeze(['depop.com']),
});
// (01/11, demande de Nico : « en Cloud, eBay passe uniquement par l'API ») eBay et Opla ne sont JAMAIS joignables depuis
// le navigateur Cloud : aucune page de connexion eBay, aucune sonde, aucune visite — quelles que soient les plateformes
// permises (eBay se relie par la connexion officielle, ebay-oauth-start, depuis l'app).
export const DOMAINES_TOUJOURS_FERMES = Object.freeze([
  'ebay.fr', 'ebay.com', 'ebay.co.uk', 'ebay.de', 'ebay.it', 'ebay.es', 'ebay.be', 'ebay.nl', 'ebay.ch', 'ebay.at', 'ebay.ie',
  'opla.co',
]);
/**
 * (02/11) Une requête arrêtée par le verrou passe-t-elle quand même ? (pure : testée) Seulement si elle vient d'un cadre
 * d'une page de résolution, et jamais vers eBay ni Opla.
 */
const plateformeDuDomaine = (hote) => Object.entries(DOMAINES_VERROU).find(([, ds]) => ds.some((d) => hote === d || hote.endsWith(`.${d}`)))?.[0] ?? null;
export function requetePermise(h, params) {
  let hote = '';
  try { hote = new URL(String(params?.request?.url ?? '')).hostname.toLowerCase(); } catch { return false; }
  if (DOMAINES_TOUJOURS_FERMES.some((d) => hote === d || hote.endsWith(`.${d}`))) return false;
  const cadre = params?.frameId ? String(params.frameId) : '';
  if (cadre) return Boolean(h?.cadresPermis?.has(cadre));
  // Sans cadre : le service worker de la PLATEFORME elle-même (Depop en a un), le temps de SA résolution seulement —
  // jamais l'extension (son origine est chrome-extension://), jamais une autre plateforme.
  const pf = plateformeDuDomaine(hote);
  if (!pf || ![...(h?.cadresPermis?.values() ?? [])].includes(pf)) return false;
  const e = params?.request?.headers ?? {};
  let origine = '';
  try { origine = new URL(String(e.Origin ?? e.origin ?? e.Referer ?? e.referer ?? '')).hostname.toLowerCase(); } catch { return false; }
  return plateformeDuDomaine(origine) === pf;
}

/** Les motifs d'interception des plateformes FERMÉES (pure : testée). eBay et Opla : toujours. */
export function motifsVerrou(permises) {
  const ouvertes = new Set(plateformesVerrou(permises));
  const fermes = Object.entries(DOMAINES_VERROU).filter(([p]) => !ouvertes.has(p)).flatMap(([, domaines]) => domaines);
  return [...fermes, ...DOMAINES_TOUJOURS_FERMES]
    .flatMap((d) => [`*://${d}/*`, `*://*.${d}/*`])
    .map((urlPattern) => ({ urlPattern, requestStage: 'Request' }));
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
    const spec = specConteneur({ config, user, profilId });
    if (c && (c.Config?.Labels?.['fillsell.profil'] !== profilId || c.Config?.Labels?.['fillsell.lancement'] !== spec.Labels['fillsell.lancement'])) {
      // Le profil a changé (purge), ou le lancement (02/11 : langue, fuseau) : l'ancien conteneur ne sert plus. Le
      // profil du compte, sur le disque, reste.
      await docker.arreter(nom).catch(() => {});
      await docker.supprimer(nom);
      c = null;
    }
    if (!c) {
      await mkdir(`${config.dossierProfils}/${profilId}`, { recursive: true });
      // (02/11) Un conteneur NEUF sur un profil gardé : le verrou de profil de l'ancien conteneur (autre nom d'hôte) ferait
      // refuser le profil à Chromium (« in use by another Chromium process on another computer » : session HTTP 500,
      // vu au premier lancement en français). Aucun autre conteneur n'ouvre ce profil : ses fichiers de verrou partent.
      for (const f of ['SingletonLock', 'SingletonCookie', 'SingletonSocket']) await rm(`${config.dossierProfils}/${profilId}/${f}`, { force: true }).catch(() => {});
      await docker.creer(nom, spec);
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

  /** (01/11) Le cache du script de fond de l'extension, effacé quand la copie a changé (cacheExtensionAEffacer). */
  async function rafraichirExtensionDuProfil(user, profilId) {
    const copie = await readFile(`${config.dossierExtension}/background.js`).catch(() => null);
    if (!copie) return false;
    const empreinte = createHash('sha256').update(copie).digest('hex').slice(0, 16);
    const marque = `${config.dossierProfils}/${profilId}/.extension-cloud`;
    const notee = await readFile(marque, 'utf8').catch(() => '');
    if (!cacheExtensionAEffacer(notee, empreinte)) return false;
    await rm(`${config.dossierProfils}/${profilId}/Default/Service Worker`, { recursive: true, force: true });
    await writeFile(marque, `${empreinte}
`);
    journal.info('extension_rafraichie', { user, empreinte });
    return true;
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
    await exigerPareFeu(config);
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
    await rafraichirExtensionDuProfil(user, profilId);
    await attendreApi(ip);
    const corps = corpsSession({ proxyUrl });
    const r = await fetch(`http://${ip}:3000/v1/sessions`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps),
      signal: AbortSignal.timeout(90_000),
    });
    if (!r.ok) throw new Error(`steel : création de session → HTTP ${r.status}`);
    const cdp = await connecterCdp(`ws://${ip}:3000/`, { delaiAppelMs: 90_000 });
    const h = { cdp, ip, conteneur: nom, profilId, ouvertLe: Date.now(), moteur: 'steel', permises: plateformesVerrou(permises), bloquees: 0,
      cadresPermis: new Map() };   // (02/11) cadre d'une page de résolution → sa plateforme
    cdp.on((m) => {
      if (m.method === '__ferme__' && ouverts.get(user) === h) ouverts.delete(user);
      // (01/11) Le verrou : une requête vers une plateforme fermée (session du navigateur, sans sessionId) échoue.
      // (02/11) Sauf celle d'une page de RÉSOLUTION (« Résoudre la vérification », essai des 24 h) : ses cadres, et
      // eux seuls, joignent la plateforme en vérification — l'extension et ses onglets de travail, jamais.
      if (m.method === 'Fetch.requestPaused' && !m.sessionId) {
        if (requetePermise(h, m.params)) {
          cdp.send('Fetch.continueRequest', { requestId: m.params?.requestId }).catch(() => {});
          return;
        }
        h.bloquees++;
        cdp.send('Fetch.failRequest', { requestId: m.params?.requestId, errorReason: 'BlockedByClient' }).catch(() => {});
      }
    });
    // Le verrou est posé AVANT toute page : le navigateur de la session vient d'ouvrir, l'extension démarre à peine.
    await poserVerrouSteel(h);
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
  /** (01/11) Le verrou du moteur steel : les motifs des plateformes fermées, sur la session du navigateur. */
  async function poserVerrouSteel(h) {
    const motifs = motifsVerrou(h.permises);
    if (motifs.length) await h.cdp.send('Fetch.enable', { patterns: motifs });
    else await h.cdp.send('Fetch.disable').catch(() => {});
    return motifs.length;
  }

  async function permettre(user, plateformes) {
    const h = ouverts.get(user);
    if (!h) return { ok: false, raison: 'ferme' };
    const liste = plateformesVerrou(plateformes);
    if (h.moteur === 'steel') {
      h.permises = liste;
      await poserVerrouSteel(h);
      journal.info('verrou_plateformes', { user, permises: liste });
      return { ok: true, permises: liste };
    }
    if (h.moteur !== 'chrome' || !h.jetonControle) return { ok: false, raison: 'moteur_sans_verrou' };
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

  /** (02/11) Un cadre (la page de résolution, ses sous-cadres) passe le verrou. Rend faux sans verrou par page (Chrome). */
  function permettreCadre(user, cadre, plateforme) {
    const h = ouverts.get(user);
    if (!h || h.moteur !== 'steel' || !cadre || !DOMAINES_VERROU[plateforme]) return false;
    h.cadresPermis.set(String(cadre), plateforme);
    return true;
  }
  const retirerCadre = (user, cadre) => { ouverts.get(user)?.cadresPermis?.delete(String(cadre)); };

  return { ouvrir, fermer, detruire, permettre, permettreCadre, retirerCadre, ouvert: (user) => ouverts.get(user) ?? null, ouverts: () => [...ouverts.keys()] };
}
