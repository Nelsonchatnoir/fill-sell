// (04/11 soir, essai GPU — ordre de Nico : « enregistrement complet ») L'ENREGISTREMENT DE FOND : ce que le navigateur
// d'un compte envoie aux plateformes EN DEHORS de « Me connecter » — les onglets de travail de l'extension (lectures de
// fond, publications, retraits), leurs cadres (DataDome) et, sur réglage, son service worker. Une glissière qui
// apparaît dans un onglet de travail se lit alors dans la suite exacte des requêtes qui l'a précédée.
//   · etat/essais/fond-<8 premiers caractères du compte>-<AAAA-MM-JJ, heure de Paris>.jsonl (un fichier par jour) ;
//   · une ligne par requête vers une plateforme (DOMAINES_VERROU) ou DataDome — le format de connexion.js (ligneRequete :
//     hôte, chemin borné, méthode, type, code, échec ; noms des cookies ; DataDome : noms et longueurs des paramètres,
//     verdict masqué) : jamais une query, un en-tête, un corps ni un jeton ;
//   · une ligne par onglet ouvert / navigué / fermé (hôte + chemin, type de cible).
// ⛔ Rien de visible par la page : Target.setDiscoverTargets, Target.attachToTarget, Network.enable et l'auto-attache des
// cadres (waitForDebuggerOnStart: false) — JAMAIS Runtime, Page, Debugger, ni aucune injection. Le service worker de
// l'extension n'est suivi que sur ENREGISTREMENT_FOND_SW=1 : une session DevTools attachée l'empêche de s'endormir (son
// cycle de vie changerait par rapport à cloud-1). Une erreur ne fait jamais échouer une ouverture ni une fermeture.
import { appendFile, mkdir } from 'node:fs/promises';
import { DOMAINES_VERROU, estPublicite } from './navigateur.js';
import { ligneRequete, nomsCookiesEnvoyes, nomsCookiesRecus, parametresSansValeur, reponseDataDomeMasquee, estDataDome } from './vueBureau.js';

export const FOND_LIGNES_MAX = 60_000;   // par fichier (un jour) : au-delà, une ligne « plafond » et plus rien ce jour-là

/** L'hôte d'une adresse, ou '' (pure). */
const hoteDe = (url) => { try { return new URL(String(url)).hostname.toLowerCase(); } catch { return ''; } };

/** Ce que l'enregistrement de fond suit (pure : testée) : la plateforme de l'hôte, « datadome », ou null (tout le reste). */
export function suiviDe(url) {
  if (estDataDome(url)) return 'datadome';
  const h = hoteDe(url);
  if (!h) return null;
  return Object.entries(DOMAINES_VERROU).find(([, ds]) => ds.some((d) => h === d || h.endsWith(`.${d}`)))?.[0] ?? null;
}

/** Le jour, heure de Paris, d'un instant (pure) : « AAAA-MM-JJ ». */
export const jourParis = (ms) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' })
  .format(new Date(ms));

/** Le fichier du jour (pure : testée). */
export const fichierFond = (dossierEtat, user, ms) => `${dossierEtat}/essais/fond-${String(user).slice(0, 8)}-${jourParis(ms)}.jsonl`;

/** Un onglet pour le journal (pure) : hôte et chemin borné, jamais la query ni le fragment. */
export function lieuOnglet(url) {
  try { const u = new URL(String(url)); return { hote: u.hostname || u.protocol.replace(/:$/, ''), chemin: u.pathname.slice(0, 120) }; }
  catch { return { hote: String(url ?? '').slice(0, 40), chemin: '' }; }
}

/**
 * (05/11 soir, point 9) L'issue d'une « Vérification de l'appareil » DataDome (pure : testée) : 'passee' quand le POST de
 * son /interstitial/ répond view « redirect », 'glissiere' quand il répond « captcha », null sinon (autre adresse, réponse
 * illisible). Jamais une valeur de cookie lue ni gardée.
 */
export function issueVerificationAppareil(url, texte) {
  let chemin = '';
  try { const u = new URL(String(url)); if (!/(^|.)captcha-delivery.com$/i.test(u.hostname)) return null; chemin = u.pathname.toLowerCase(); } catch { return null; }
  if (!chemin.startsWith('/interstitial')) return null;
  let j = null;
  try { j = JSON.parse(String(texte ?? '')); } catch { return null; }
  const vue = String(j?.view ?? '').toLowerCase();
  return vue === 'redirect' ? 'passee' : vue === 'captcha' ? 'glissiere' : null;
}

/** La plateforme d'un cadre DataDome (pure) : celle de son paramètre referer, ou null. */
export function plateformeDuCadre(url) {
  try { const ref = new URL(String(url)).searchParams.get('referer'); const p = ref ? suiviDe(ref) : null; return p && p !== 'datadome' ? p : null; } catch { return null; }
}

/** Les types de cible attachés au niveau du navigateur (les cadres viennent par l'auto-attache de leur page). */
export const typesSuivis = ({ serviceWorker = false } = {}) => new Set(['page', ...(serviceWorker ? ['service_worker'] : [])]);

export function creerEnregistrementFond({ config, journal, maintenant = () => Date.now(), ecrireFichier = appendFile, creerDossier = mkdir, surDataDome = null }) {
  const actifs = new Map();   // user → { arreter }
  const types = typesSuivis({ serviceWorker: config?.enregistrementFondSw === true });

  /** Commence à suivre le navigateur ouvert d'un compte (h = handle de navigateurs.ouvrir). */
  async function suivre(user, h) {
    // (05/11 soir, point 9) Hors essai (ENREGISTREMENT_FOND absent), le MODE LÉGER : seules les requêtes DataDome sont
    // suivies, rien n'est écrit sur le disque ; il ne sert qu'à voir une vérification de l'appareil passée seule.
    const complet = config?.enregistrementFond === true && !!config?.dossierEtat;
    if ((!complet && typeof surDataDome !== 'function') || !h?.cdp || actifs.has(user)) return false;
    const { cdp } = h;
    const sessions = new Map();     // sessionId → { cadre, targetId }
    const cibles = new Map();       // targetId → { type, url, sessionId }
    const requetes = new Map();     // sessionId:requestId → requête suivie en cours
    const extras = new Map();       // sessionId:requestId → { envoyes, recus }
    let fichier = null, lignes = 0, plafond = false;
    let file = complet ? creerDossier(`${config.dossierEtat}/essais`, { recursive: true }).catch(() => {}) : Promise.resolve();
    const ecrire = (o) => {
      if (!complet) return;
      const f = fichierFond(config.dossierEtat, user, maintenant());
      if (f !== fichier) { fichier = f; lignes = 0; plafond = false; }
      if (plafond) return;
      if (lignes >= FOND_LIGNES_MAX) { plafond = true; o = { le: new Date(maintenant()).toISOString(), evenement: 'plafond', lignes }; }
      lignes++;
      const l = JSON.stringify(o) + '\n';
      file = file.then(() => ecrireFichier(f, l, { mode: 0o600 })).catch(() => {});
    };
    const quand = (p) => (Number.isFinite(p?.wallTime) ? new Date(p.wallTime * 1000).toISOString() : new Date(maintenant()).toISOString());
    const finir = (cle, extra) => {
      const r = requetes.get(cle);
      if (!r) return;
      requetes.delete(cle);
      const x = extras.get(cle) ?? {};
      extras.delete(cle);
      ecrire({ ...ligneRequete({ ...r, ...x, ...extra, id: cle.split(':').pop(), publicite: estPublicite(r.url) }), suivi: r.suivi, cible: r.cible });
    };

    async function brancher(sessionId, nom, targetId, url = null) {
      sessions.set(sessionId, { cadre: nom, targetId, url });
      await cdp.send('Network.enable', {}, sessionId);
      // Les cadres hors processus (DataDome sur un autre domaine) : attachés à leur tour, jamais mis en pause.
      if (nom !== 'service_worker') await cdp.send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: false, flatten: true }, sessionId);
    }
    async function attacherCible(t) {
      if (!types.has(t?.type) || cibles.get(t.targetId)?.sessionId) return;
      cibles.set(t.targetId, { type: t.type, url: t.url, sessionId: 'en_cours' });
      try {
        const { sessionId } = await cdp.send('Target.attachToTarget', { targetId: t.targetId, flatten: true });
        cibles.set(t.targetId, { type: t.type, url: t.url, sessionId });
        await brancher(sessionId, t.type === 'page' ? 'page' : 'service_worker', t.targetId, t.url);
      } catch (e) {
        cibles.delete(t.targetId);
        journal?.alerte?.('enregistrement_fond_attache_echec', { user, type: t.type, erreur: String(e.message).slice(0, 120) });
      }
    }

    // (05/11 soir, point 9) Le verdict d'une « Vérification de l'appareil » : la plateforme vient de l'adresse du cadre
    // (paramètre referer), sinon de la page qui le porte ; rien n'est dit sur un doute.
    function signalerDataDome(r, texte, sessionId) {
      if (typeof surDataDome !== 'function') return;
      const issue = issueVerificationAppareil(r?.url, texte);
      if (!issue) return;
      const s = sessions.get(sessionId);
      const page = [...cibles.values()].find((c) => c.sessionId && sessions.get(c.sessionId)?.targetId === s?.targetId && c.type === 'page');
      const plateforme = plateformeDuCadre(s?.url) ?? plateformeDuCadre(r?.url) ?? suiviDe(page?.url) ?? null;
      if (!plateforme || plateforme === 'datadome') return;
      try { Promise.resolve(surDataDome(user, { plateforme, issue, le: new Date(maintenant()).toISOString() })).catch(() => {}); } catch { /* jamais bloquant */ }
    }

    function surMessage(m) {
      const p = m.params ?? {};
      if (m.method === '__ferme__') { arreter('navigateur_ferme'); return; }
      // ── Les onglets (niveau navigateur, sans sessionId) ──
      if (!m.sessionId && (m.method === 'Target.targetCreated' || m.method === 'Target.targetInfoChanged')) {
        const t = p.targetInfo;
        if (!t || !types.has(t.type)) return;
        const connu = cibles.get(t.targetId);
        if (m.method === 'Target.targetCreated' || !connu) {
          ecrire({ le: new Date(maintenant()).toISOString(), evenement: 'onglet_ouvert', type: t.type, cible: String(t.targetId).slice(0, 8), ...lieuOnglet(t.url) });
          attacherCible(t);
        } else if (connu.url !== t.url) {
          connu.url = t.url;
          ecrire({ le: new Date(maintenant()).toISOString(), evenement: 'onglet_navigue', type: t.type, cible: String(t.targetId).slice(0, 8), ...lieuOnglet(t.url) });
        }
        return;
      }
      if (!m.sessionId && m.method === 'Target.targetDestroyed') {
        const c = cibles.get(p.targetId);
        if (!c) return;
        cibles.delete(p.targetId);
        if (c.sessionId) sessions.delete(c.sessionId);
        ecrire({ le: new Date(maintenant()).toISOString(), evenement: 'onglet_ferme', type: c.type, cible: String(p.targetId).slice(0, 8) });
        return;
      }
      if (!m.sessionId || !sessions.has(m.sessionId)) return;
      // ── Un cadre d'une page suivie ──
      if (m.method === 'Target.attachedToTarget' && p.sessionId && p.targetInfo?.type === 'iframe') {
        brancher(p.sessionId, hoteDe(p.targetInfo.url) || 'cadre', sessions.get(m.sessionId).targetId, p.targetInfo.url).catch(() => {});
        return;
      }
      if (m.method === 'Target.detachedFromTarget' && p.sessionId) { sessions.delete(p.sessionId); return; }
      // ── Le réseau ──
      const cle = `${m.sessionId}:${p.requestId}`;
      if (m.method === 'Network.requestWillBeSent') {
        const url = p.request?.url;
        if (p.redirectResponse && requetes.has(cle)) finir(cle, { http: p.redirectResponse.status, echec: 'redirection' });
        const suivi = suiviDe(url);
        if (!suivi || (!complet && suivi !== 'datadome')) return;
        const s = sessions.get(m.sessionId);
        requetes.set(cle, { le: quand(p), cadre: s.cadre, url, methode: p.request?.method, type: p.type ?? null, suivi,
          cible: String(s.targetId ?? '').slice(0, 8),
          ...(suivi === 'datadome' ? { parametres: parametresSansValeur(url), corps: p.request?.postData != null ? String(p.request.postData).length : (p.request?.hasPostData ? 'present' : null) } : {}) });
        return;
      }
      if (!requetes.has(cle) && m.method !== 'Network.requestWillBeSentExtraInfo' && m.method !== 'Network.responseReceivedExtraInfo') return;
      if (m.method === 'Network.requestWillBeSentExtraInfo') { extras.set(cle, { ...(extras.get(cle) ?? {}), envoyes: nomsCookiesEnvoyes(p.associatedCookies) }); return; }
      if (m.method === 'Network.responseReceivedExtraInfo') { extras.set(cle, { ...(extras.get(cle) ?? {}), recus: nomsCookiesRecus(p.headers, p.blockedCookies) }); return; }
      if (m.method === 'Network.responseReceived') { requetes.get(cle).http = p.response?.status ?? null; return; }
      if (m.method === 'Network.loadingFinished') {
        const r = requetes.get(cle);
        if (r.suivi === 'datadome' && ['XHR', 'Fetch'].includes(r.type)) {
          cdp.send('Network.getResponseBody', { requestId: p.requestId }, m.sessionId)
            .then((b) => {
              const texte = b?.base64Encoded ? Buffer.from(b.body, 'base64').toString('utf8') : b?.body;
              signalerDataDome(r, texte, m.sessionId);
              finir(cle, { reponse: reponseDataDomeMasquee(texte) });
            })
            .catch(() => finir(cle, { reponse: 'illisible' }));
          return;
        }
        finir(cle, {});
        return;
      }
      if (m.method === 'Network.loadingFailed') finir(cle, { echec: p.errorText ?? 'echec', bloquee: p.blockedReason ?? null });
    }

    // Les extras (cookies) d'une requête NON suivie ne doivent pas s'accumuler : vidés à chaque fin de tour.
    const menage = setInterval(() => { for (const k of extras.keys()) if (!requetes.has(k)) extras.delete(k); }, 60_000);
    menage.unref?.();
    const desabonner = cdp.on(surMessage);
    let arrete = false;
    function arreter(raison) {
      if (arrete) return;
      arrete = true;
      clearInterval(menage);
      desabonner?.();
      for (const cle of [...requetes.keys()]) finir(cle, { echec: 'en_cours_a_la_fermeture' });
      ecrire({ le: new Date(maintenant()).toISOString(), evenement: 'fin', raison });
      for (const [, c] of cibles) if (c.sessionId && c.sessionId !== 'en_cours' && !cdp.ferme) cdp.send('Target.detachFromTarget', { sessionId: c.sessionId }).catch(() => {});
      actifs.delete(user);
    }
    actifs.set(user, { arreter });
    ecrire({ le: new Date(maintenant()).toISOString(), evenement: 'debut', moteur: h.moteur ?? null, navigateur: h.navigateur ?? null,
      service_worker: types.has('service_worker') });
    try {
      await cdp.send('Target.setDiscoverTargets', { discover: true });
      const { targetInfos } = await cdp.send('Target.getTargets');
      for (const t of targetInfos ?? []) {
        if (!types.has(t.type)) continue;
        ecrire({ le: new Date(maintenant()).toISOString(), evenement: 'onglet_ouvert', type: t.type, cible: String(t.targetId).slice(0, 8), deja: true, ...lieuOnglet(t.url) });
        await attacherCible(t);
      }
    } catch (e) {
      journal?.alerte?.('enregistrement_fond_echec', { user, erreur: String(e.message).slice(0, 160) });
    }
    journal?.info?.('enregistrement_fond_ouvert', complet ? { user, fichier: fichierFond(config.dossierEtat, user, maintenant()) } : { user, mode: 'leger_datadome' });
    return true;
  }

  /** Arrête l'enregistrement d'un compte (fermeture du navigateur). */
  function arreter(user, raison = 'fermeture') {
    try { actifs.get(user)?.arreter(raison); } catch { /* l'enregistrement ne retient jamais une fermeture */ }
  }

  return { suivre, arreter, actifs: () => [...actifs.keys()] };
}
