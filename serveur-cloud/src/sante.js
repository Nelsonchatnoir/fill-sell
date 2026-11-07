// (07/11 soir, ordre 4 de Nico) LE CONTRÔLE DE SANTÉ D'UNE IP LIBRE — « ce contrôle doit tourner seul, régulièrement, sur
// toutes les IP libres, pas seulement à l'achat : une IP grillée n'est jamais donnée à un client ».
// La méthode est celle de la vérification manuelle du 07/11 (17:26-17:40, 7 IP : saines 1, 2, 3, 4, 39, 41 ; grillée 40,
// eBay 403 Akamai) : UN Chrome jetable de la MÊME image que les comptes (fillsell-chrome, vraie puce si le serveur en a une,
// réseau des navigateurs derrière leur pare-feu, relais de prod avec PLATEFORMES_PERMISES = les 5 plateformes), profil
// éphémère DANS le conteneur, sans extension ni compte ; la sortie lue par curl À TRAVERS le relais (ipinfo.io, ip-api.com) ;
// puis UNE visite de la page d'accueil de chaque plateforme, un onglet chacune, aucun clic, aucune saisie, l'état lu en
// monde isolé toutes les 2,5 s pendant 30 s au plus ; le conteneur supprimé à la fin (étiquette fillsell.controle :
// supprimé aussi au redémarrage de l'orchestrateur). Les identifiants du proxy ne sont jamais écrits nulle part.
// « Saine » (définition de Nico) = sortie en France, ni hébergeur ni proxy repéré (ip-api : hosting = false,
// proxy = false — les 7 IP du 07/11 sont des « FAI statiques » IPRoyal, jamais des lignes grand public), et accès anonyme
// réel aux 5 plateformes sans page anti-robot : DataDome (glissière, t=bv), accès restreint écrit, Cloudflare « Just a
// moment », Turnstile / hCaptcha / défi reCAPTCHA VISIBLES, PerimeterX, Akamai (« Access Denied », « Pardon Our
// Interruption »), document final en 403 ou 429. ⚠ La vérification d'appareil DataDome (/interstitial/, 403 puis 200 seul
// en moins de 13 s sur Beebs) est le comportement de la plateforme face à un appareil neuf, la même sur toutes les IP :
// elle ne compte que si la page n'en sort pas (même chose pour Cloudflare). Le cookie « datadome » n'est jamais un
// marqueur, ni le badge reCAPTCHA caché.
// Les fonctions pures sont testées (tests/sante.test.mjs) ; la décision (suspecte, grillée…) est dans cloud-pool.js
// (santeSuivante), écrite par cloud_ip_sante_noter.
import http from 'node:http';
import { Buffer } from 'node:buffer';
import { randomBytes } from 'node:crypto';
import { connecterCdp, attacher } from './cdp.js';
import { specConteneurChrome, exigerPareFeu } from './navigateur.js';
import { TEXTE_ACCES_RESTREINT } from './plateformes.js';
import { VERSION_API_DOCKER } from './docker.js';

/** Les 5 plateformes de la définition de Nico, la page d'accueil de chacune (la seule ouverte). */
export const PLATEFORMES_SANTE = Object.freeze([
  Object.freeze({ plateforme: 'vinted', url: 'https://www.vinted.fr/', hote: /(^|\.)vinted\.fr$/i }),
  Object.freeze({ plateforme: 'leboncoin', url: 'https://www.leboncoin.fr/', hote: /(^|\.)leboncoin\.fr$/i }),
  Object.freeze({ plateforme: 'beebs', url: 'https://www.beebs.app/fr', hote: /(^|\.)beebs\.app$/i }),
  Object.freeze({ plateforme: 'depop', url: 'https://www.depop.com/fr/', hote: /(^|\.)depop\.com$/i }),
  Object.freeze({ plateforme: 'ebay', url: 'https://www.ebay.fr/', hote: /(^|\.)ebay\.fr$/i }),
]);
export const SANTE_DUREE_MAX_MS = 30_000;   // on regarde chaque page au plus 30 s
export const SANTE_DUREE_MIN_MS = 12_000;   // « ouverte » seulement après 12 s (un anti-robot peut arriver après le chargement)
export const SANTE_PAS_MS = 2_500;
export const ADRESSES_SORTIE = Object.freeze({
  ipinfo: 'https://ipinfo.io/json',
  ipApi: 'http://ip-api.com/json/?fields=status,message,query,country,countryCode,isp,org,as,mobile,proxy,hosting',
});

/** L'état d'une page, lu en monde isolé (la page ne voit rien) — l'expression de la vérification manuelle du 07/11. */
export const EXPRESSION_SANTE = `(() => {
  const hote = (s) => { try { return new URL(s, location.href).hostname; } catch (e) { return ''; } };
  const visible = (f) => { try { const r = f.getBoundingClientRect(); const cs = getComputedStyle(f);
    return r.width > 30 && r.height > 30 && r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth
      && cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0.05; } catch (e) { return false; } };
  const ifr = [...document.querySelectorAll('iframe')].map((f) => ({ src: f.src || '', vis: visible(f) }));
  const dd = ifr.filter((x) => /(^|\\.)captcha-delivery\\.com$/i.test(hote(x.src)));
  const ddBloque = dd.some((x) => /\\/captcha\\//i.test(x.src) && /[?&]t=bv(&|$)/.test(x.src));
  const texte = String((document.body && document.body.innerText) || '').slice(0, 4000);
  const tete = document.title + ' ' + texte.slice(0, 1500);
  const nav = performance.getEntriesByType('navigation')[0];
  return {
    hote: location.hostname, pret: document.readyState === 'complete', titre: String(document.title || '').slice(0, 80),
    statut_nav: nav && typeof nav.responseStatus === 'number' ? nav.responseStatus : null,
    dd_bloque: ddBloque,
    dd_captcha: !ddBloque && dd.some((x) => /\\/captcha\\//i.test(x.src)),
    dd_interstitiel: dd.some((x) => /\\/interstitial\\//i.test(x.src)),
    restreint: ${TEXTE_ACCES_RESTREINT}.test(texte),
    cloudflare: /Just a moment|Checking your browser|Un instant|V[ée]rification (que vous [êe]tes|de s[ée]curit[ée])/i.test(document.title)
      || !!document.querySelector('#challenge-form, #cf-challenge-running, #challenge-running, #challenge-stage'),
    turnstile_visible: ifr.some((x) => /challenges\\.cloudflare\\.com/i.test(hote(x.src)) && x.vis),
    hcaptcha_visible: ifr.some((x) => /hcaptcha\\.com$/i.test(hote(x.src)) && x.vis),
    recaptcha_defi_visible: ifr.some((x) => /\\/recaptcha\\/.*\\/bframe/i.test(x.src) && x.vis),
    perimeterx: !!document.querySelector('#px-captcha, [id^="px-captcha"]') || /Press (&|and) Hold|Appuyez (et|puis) maintenez/i.test(texte),
    akamai: /Pardon Our Interruption|Access Denied|You don't have permission to access/i.test(tete),
  };
})()`;

// Les murs, par leur nom (codes stables : ils vont en base). Les deux premiers PASSENT seuls sur un appareil neuf.
const MURS = Object.freeze([
  ['dd_interstitiel', 'datadome_verification'], ['cloudflare', 'cloudflare'],
  ['dd_bloque', 'datadome_bloque'], ['restreint', 'acces_restreint'], ['dd_captcha', 'datadome_glissiere'],
  ['turnstile_visible', 'turnstile'], ['hcaptcha_visible', 'hcaptcha'], ['recaptcha_defi_visible', 'recaptcha'],
  ['perimeterx', 'perimeterx'], ['akamai', 'akamai'],
]);
export const MURS_PASSAGERS = Object.freeze(new Set(['datadome_verification', 'cloudflare']));

/** Les murs anti-robot d'un état de page (pure) : [] = aucun. */
export function mursDe(e) {
  if (!e || typeof e !== 'object') return [];
  return MURS.filter(([cle]) => e[cle] === true).map(([, code]) => code);
}

const ouverte = (x, hote) => Boolean(x?.e?.pret) && hote.test(String(x.e.hote ?? '')) && mursDe(x.e).length === 0;

/** Faut-il arrêter de regarder (pure) ? Un mur NET vu deux fois de suite, ou la page ouverte deux fois de suite après le minimum. */
export function arreterVisite(echantillons, hote, { dureeMinMs = SANTE_DUREE_MIN_MS } = {}) {
  const l = Array.isArray(echantillons) ? echantillons : [];
  if (l.length < 2) return false;
  const nets = (x) => mursDe(x?.e).filter((m) => !MURS_PASSAGERS.has(m));
  const [avant, fin] = l.slice(-2);
  if (nets(fin).length && nets(avant).length) return true;
  return Number(fin.t) >= dureeMinMs && ouverte(fin, hote) && ouverte(avant, hote);
}

/**
 * LE VERDICT D'UNE PLATEFORME (pure). `echantillons` : [{ t, e }] ; `statutDocument` : le dernier document du cadre
 * principal (réseau), à défaut celui de la page (performance).
 *   mur          : un anti-robot sur la page FINALE (un mur passager qui n'est pas passé compte), ou un document final
 *                  en 403 / 429 ;
 *   ouverte      : la page de la plateforme chargée, sans mur, depuis au moins dureeMinMs (un mur passager PASSÉ pendant
 *                  la visite est seulement noté dans `vus`) ;
 *   indeterminee : rien de tout ça (page muette, hors du site, réseau) — jamais un échec.
 */
export function verdictPlateforme({ echantillons, statutDocument = null, hote, dureeMinMs = SANTE_DUREE_MIN_MS }) {
  const l = (Array.isArray(echantillons) ? echantillons : []).filter((x) => x && Number.isFinite(Number(x.t)));
  const vus = [...new Set(l.flatMap((x) => mursDe(x.e)))];
  const fin = l.at(-1);
  if (!fin?.e) return { verdict: 'indeterminee', murs: [], vus, statut: statutDocument ?? null };
  const statut = statutDocument ?? fin.e.statut_nav ?? null;
  const murs = mursDe(fin.e);
  if (murs.length) return { verdict: 'mur', murs, vus, statut };
  if ([403, 429].includes(Number(statut))) return { verdict: 'mur', murs: [`http_${Number(statut)}`], vus, statut };
  if (Number(fin.t) >= dureeMinMs && ouverte(fin, hote)) return { verdict: 'ouverte', murs: [], vus, statut };
  return { verdict: 'indeterminee', murs: [], vus, statut };
}

/**
 * LA SORTIE (pure) : ip-api (pays, hosting, proxy) d'abord, ipinfo en second. Échecs : `sortie:autre_ip` (la sortie n'est
 * pas l'IP), `sortie:pays` (pas la France), `sortie:hebergeur` (hosting), `sortie:proxy` (proxy repéré). `inconnu` : ip-api
 * illisible (hébergeur et proxy non vérifiés) — jamais un échec.
 */
export function verdictSortie({ ip, ipinfo = null, ipApi = null }) {
  const a = ipApi && typeof ipApi === 'object' && ipApi.status === 'success' ? ipApi : null;
  const i = ipinfo && typeof ipinfo === 'object' && typeof ipinfo.ip === 'string' ? ipinfo : null;
  const echecs = [];
  const sortie = a?.query ?? i?.ip ?? null;
  if (sortie != null && String(sortie) !== String(ip)) echecs.push('sortie:autre_ip');
  const pays = a?.countryCode ?? i?.country ?? null;
  if (pays != null && pays !== 'FR') echecs.push('sortie:pays');
  if (a?.hosting === true) echecs.push('sortie:hebergeur');
  if (a?.proxy === true) echecs.push('sortie:proxy');
  return { echecs, inconnu: !a,
    resume: { ip: sortie, pays, org: a?.org ?? i?.org ?? null, as: a?.as ?? null, hebergeur: a?.hosting ?? null, proxy: a?.proxy ?? null, mobile: a?.mobile ?? null } };
}

/** Le bilan d'un contrôle (pure) : échecs et inconnus (codes de cloud-pool.santeSuivante), et un résumé court pour la base. */
export function bilanControle({ sortie, visites = [], nonVisitees = [] }) {
  const echecs = [...(sortie?.echecs ?? [])];
  const inconnus = sortie?.inconnu ? ['sortie'] : [];
  const plateformes = {};
  for (const v of visites) {
    plateformes[v.plateforme] = { verdict: v.verdict, ...(v.murs?.length ? { murs: v.murs } : {}), ...(v.vus?.length ? { vus: v.vus } : {}),
      ...(v.statut != null ? { statut: v.statut } : {}) };
    if (v.verdict === 'mur') echecs.push(v.plateforme);
    else if (v.verdict !== 'ouverte') inconnus.push(v.plateforme);
  }
  for (const pf of nonVisitees) { inconnus.push(pf); plateformes[pf] = { verdict: 'non_visitee' }; }
  return { echecs, inconnus, resume: { sortie: sortie?.resume ?? null, plateformes } };
}

/**
 * Le conteneur du contrôle (pure : testée) : la spécification d'un Chrome de COMPTE (specConteneurChrome : image, puce,
 * relais, réseau, limites) SANS le profil sur l'hôte ni l'extension, les 5 plateformes permises, 2 Gio, étiqueté contrôle.
 */
export function specConteneurSante({ config, ipId, proxyUrl, jetonControle }) {
  const s = specConteneurChrome({ config, user: `sante-${ipId}`, profilId: `sante-${ipId}`, proxyUrl,
    permises: PLATEFORMES_SANTE.map((x) => x.plateforme), jetonControle });
  return {
    ...s,
    Labels: { 'fillsell.cloud': '1', 'fillsell.controle': String(ipId), 'fillsell.essai': 'sante' },
    HostConfig: { ...s.HostConfig, Binds: (s.HostConfig.Binds ?? []).filter((b) => !/:\/profil$|:\/extension-crx(:ro)?$/.test(b)),
      Memory: 2 * 1024 ** 3 },
  };
}

const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const jsonDe = (t) => { const s = String(t ?? ''); try { return JSON.parse(s.slice(s.indexOf('{'), s.lastIndexOf('}') + 1)); } catch { return null; } };

/** Une commande dans un conteneur (API Docker, exec), sa sortie en texte — le curl du contrôle passe par SON relais. */
export function executerParSocket(socket) {
  const appel = (methode, chemin, corps, delaiMs) => new Promise((ok, ko) => {
    const data = corps == null ? null : Buffer.from(JSON.stringify(corps));
    const req = http.request({ socketPath: socket, method: methode, path: `/v${VERSION_API_DOCKER}${chemin}`, timeout: delaiMs,
      headers: { 'Content-Type': 'application/json', ...(data ? { 'Content-Length': data.length } : {}) } }, (res) => {
      const m = []; res.on('data', (c) => m.push(c)); res.on('end', () => ok({ statut: res.statusCode, texte: Buffer.concat(m).toString('utf8') }));
    });
    req.on('timeout', () => req.destroy(new Error('docker exec : délai dépassé')));
    req.on('error', ko);
    if (data) req.write(data);
    req.end();
  });
  return async (nom, cmd) => {
    const c = await appel('POST', `/containers/${encodeURIComponent(nom)}/exec`, { AttachStdout: true, AttachStderr: true, Tty: true, Cmd: cmd }, 30_000);
    const id = jsonDe(c.texte)?.Id;
    if (!id) throw new Error(`docker exec : ${c.statut}`);
    return (await appel('POST', `/exec/${id}/start`, { Detach: false, Tty: true }, 40_000)).texte;
  };
}

/**
 * Le module : verifier({ ipId, ip, proxyUrl }) → { fait_le, echecs, inconnus, resume, duree_ms }. Dépendances injectables
 * (tests) : executer (curl dans le conteneur), connecter (CDP), horloge { maintenant, attendre }.
 */
export function creerSante({ config, docker, journal, executer = null, connecter = connecterCdp, horloge = { maintenant: () => Date.now(), attendre: pause },
  pareFeu = exigerPareFeu, plateformes = PLATEFORMES_SANTE }) {
  const exec = executer ?? executerParSocket(config.socketDocker);

  async function visiter(cdp, def) {
    const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
    const sessionId = await attacher(cdp, targetId);
    const documents = [];
    let principal = null;
    const arreter = cdp.on((m) => {
      if (m.sessionId !== sessionId) return;
      if (m.method === 'Network.requestWillBeSent' && m.params?.redirectResponse && m.params.type === 'Document') {
        documents.push({ cadre: m.params.frameId, statut: m.params.redirectResponse.status });
      }
      if (m.method === 'Network.responseReceived' && m.params?.type === 'Document') documents.push({ cadre: m.params.frameId, statut: m.params.response?.status });
    });
    try {
      await cdp.send('Page.enable', {}, sessionId);
      await cdp.send('Network.enable', {}, sessionId);
      const debut = horloge.maintenant();
      await cdp.send('Page.navigate', { url: def.url }, sessionId);
      const echantillons = [];
      while (horloge.maintenant() - debut < SANTE_DUREE_MAX_MS) {
        await horloge.attendre(SANTE_PAS_MS);
        const { frameTree } = await cdp.send('Page.getFrameTree', {}, sessionId).catch(() => ({}));
        principal = frameTree?.frame?.id ?? principal;
        let e = null;
        if (frameTree?.frame?.id) {
          const w = await cdp.send('Page.createIsolatedWorld', { frameId: frameTree.frame.id, worldName: 'fillsell-sante' }, sessionId).catch(() => null);
          if (w?.executionContextId) {
            e = (await cdp.send('Runtime.evaluate', { expression: EXPRESSION_SANTE, contextId: w.executionContextId, returnByValue: true }, sessionId)
              .catch(() => null))?.result?.value ?? null;
          }
        }
        echantillons.push({ t: horloge.maintenant() - debut, e });
        if (arreterVisite(echantillons, def.hote)) break;
      }
      const duCadre = documents.filter((d) => principal == null || d.cadre === principal);
      const v = verdictPlateforme({ echantillons, statutDocument: duCadre.at(-1)?.statut ?? null, hote: def.hote });
      return { plateforme: def.plateforme, ...v, echantillons: echantillons.length, duree_ms: horloge.maintenant() - debut };
    } finally {
      arreter();
      await cdp.send('Target.closeTarget', { targetId }).catch(() => {});
    }
  }

  async function verifier({ ipId, ip, proxyUrl }) {
    const debut = horloge.maintenant();
    await pareFeu(config);   // jamais un navigateur sans la preuve du pare-feu des navigateurs (comme controle.js)
    const nom = `fs-sante-${ipId}-${randomBytes(3).toString('hex')}`;
    let cdp = null;
    try {
      await docker.creer(nom, specConteneurSante({ config, ipId, proxyUrl, jetonControle: randomBytes(24).toString('hex') }));
      await docker.demarrer(nom);
      const adr = (await docker.inspecter(nom))?.NetworkSettings?.Networks?.[config.reseauDocker]?.IPAddress;
      if (!adr) throw new Error(`conteneur ${nom} sans adresse`);
      let version = null;
      for (let i = 0; i < 60 && !version?.webSocketDebuggerUrl; i++) {
        try { version = await (await fetch(`http://${adr}:9223/json/version`, { signal: AbortSignal.timeout(3000) })).json(); }
        catch { await horloge.attendre(1000); }
      }
      if (!version?.webSocketDebuggerUrl) throw new Error('Chrome muet (port de pilotage)');
      // 1. La sortie, par le relais du conteneur (le même chemin que Chrome).
      const curl = (u) => exec(nom, ['curl', '-sS', '-m', '20', '-x', 'http://127.0.0.1:3128', '-H', 'Accept: application/json', u]).catch(() => '');
      const sortie = verdictSortie({ ip, ipinfo: jsonDe(await curl(ADRESSES_SORTIE.ipinfo)), ipApi: jsonDe(await curl(ADRESSES_SORTIE.ipApi)) });
      // 2. Les plateformes, une à la fois (un onglet neuf chacune, refermé après).
      cdp = await connecter(String(version.webSocketDebuggerUrl).replace(/^ws:\/\/[^/]+/, `ws://${adr}:9223`), { delaiAppelMs: 60_000 });
      const visites = [];
      for (const def of plateformes) {
        try { visites.push(await visiter(cdp, def)); }
        catch (e) { visites.push({ plateforme: def.plateforme, verdict: 'indeterminee', murs: [], vus: [], erreur: String(e.message).slice(0, 120) }); }
        await horloge.attendre(1500);
      }
      const bilan = bilanControle({ sortie, visites });
      const r = { fait_le: new Date(horloge.maintenant()).toISOString(), ...bilan, duree_ms: horloge.maintenant() - debut };
      journal.info('sante_controle', { ip_id: ipId, echecs: r.echecs, inconnus: r.inconnus, duree_ms: r.duree_ms,
        plateformes: Object.fromEntries(visites.map((v) => [v.plateforme, v.verdict])) });
      return r;
    } finally {
      try { cdp?.fermer(); } catch { /* rien */ }
      await docker.supprimer(nom).catch(() => {});
    }
  }

  return { verifier };
}
