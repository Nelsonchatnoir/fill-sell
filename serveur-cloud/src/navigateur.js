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
import { mkdir, rm, readdir } from 'node:fs/promises';
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

export function creerNavigateurs({ config, docker, journal }) {
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

  /** Démarre le navigateur du compte, sur SON proxy et SON profil. Rend { cdp, ip, … }. */
  async function ouvrir(user, { proxyUrl, profilId }) {
    if (ouverts.has(user)) return ouverts.get(user);
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
    if (ip && ins?.State?.Running) {
      try { await fetch(`http://${ip}:3000/v1/sessions/release`, { method: 'POST', signal: AbortSignal.timeout(20_000) }); } catch { /* best-effort */ }
    }
    await docker.arreter(nom).catch(() => {});
    journal.info('navigateur_ferme', { user, raison });
  }

  /** Détruit le conteneur ET le profil du compte (purge). Rend ce qui reste du profil (0 attendu). */
  async function detruire(user, profilId) {
    await fermer(user, 'purge').catch(() => {});
    await docker.supprimer(nomConteneur(user));
    if (profilId) await rm(`${config.dossierProfils}/${profilId}`, { recursive: true, force: true });
    const restants = profilId ? await readdir(`${config.dossierProfils}/${profilId}`).then((l) => l.length).catch(() => 0) : 0;
    return { profilsRestants: restants };
  }

  return { ouvrir, fermer, detruire, ouvert: (user) => ouverts.get(user) ?? null, ouverts: () => [...ouverts.keys()] };
}
