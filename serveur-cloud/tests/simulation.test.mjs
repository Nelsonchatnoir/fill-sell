// SIMULATION de l'orchestrateur, bout à bout, sans réseau ni Docker : une base
// en mémoire (RPC et tables utiles), un navigateur DevTools simulé (cibles,
// stockage de l'extension, cookies, flux d'images, requêtes interceptées) et
// une WebSocket simulée. Ce que les tests purs ne voient pas : l'ENCHAÎNEMENT.
//   · un tour de planificateur ouvre le poste d'un compte actif : coffre
//     réinjecté, session FillSell posée dans l'extension (fabriquée si absente),
//     poste noté « actif » avec sa session ; un tour de plus ne rouvre rien ;
//     le compte devenu inactif est fermé APRÈS sauvegarde du coffre ;
//   · un job « processing » garde le navigateur ouvert ;
//   · l'écran « Me connecter » : un ticket ouvre la page de connexion au format
//     du téléphone ; une navigation hors connexion est refusée et ramène à la
//     connexion ; les images partent (au plus deux en vol) ; la connexion faite
//     est détectée, le coffre sauvegardé, le compte de plateforme noté.
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { creerFournisseurIp } from '../src/fournisseurIp.js';
import { creerPostes } from '../src/postes.js';
import { creerCoffre } from '../src/coffre.js';
import { creerConnexions } from '../src/connexion.js';
import { signerTicket } from '../src/tickets.js';
import { idExtensionDepuisCle } from '../src/sessionFillsell.js';

const U = '0f0e0d0c-0b0a-4908-8706-050403020100';
const jwt = (o) => `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify(o)).toString('base64url')}.c2ln`;
const CLE_EXT = randomBytes(294).toString('base64');
const ID_EXT = idExtensionDepuisCle(CLE_EXT);
const journal = { info: () => {}, alerte: () => {}, erreur: (e, d) => { throw new Error(`${e} ${JSON.stringify(d)}`); } };
const attendre = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Une base en mémoire ─────────────────────────────────────────────────────
function baseSimulee({ comptes = [], jobs = [] } = {}) {
  const t = { cloud_postes: [], cloud_coffre: [], cloud_connexions: [], cross_post_jobs: jobs, veille_cpu: [{ pct: 12, le: new Date().toISOString() }] };
  const appels = [];
  const requete = (table) => {
    let lignes = [...(t[table] ?? [])];
    let insertion = null, maj = null;
    const q = {
      select() { return q; },
      eq(c, v) { lignes = lignes.filter((l) => l[c] === v); return q; },
      in(c, vs) { lignes = lignes.filter((l) => vs.includes(l[c])); return q; },
      order() { return q; },
      limit(n) { lignes = lignes.slice(0, n); return q; },
      insert(o) { insertion = { id: `c-${t[table].length + 1}`, ...o }; t[table].push(insertion); return q; },
      update(o) { maj = o; return q; },
      maybeSingle() { return Promise.resolve({ data: insertion ?? lignes[0] ?? null, error: null }); },
      single() { return q.maybeSingle(); },
      then(ok, ko) {
        if (maj) for (const l of lignes) Object.assign(t[table].find((x) => x === l) ?? {}, maj);
        return Promise.resolve({ data: insertion ? [insertion] : lignes, error: null }).then(ok, ko);
      },
    };
    return q;
  };
  const rpc = async (nom, a) => {
    appels.push([nom, a]);
    switch (nom) {
      case 'cloud_comptes_a_servir': return { data: comptes, error: null };
      case 'cloud_proxy_identifiants': return { data: 'http://u:p@10.0.0.1:12323', error: null };
      case 'cloud_poste_noter': {
        let p = t.cloud_postes.find((x) => x.user_id === a.p_user);
        if (!p) { p = { user_id: a.p_user, details: {} }; t.cloud_postes.push(p); }
        p.etat = a.p_etat;
        if ('session_fillsell_id' in a.p_details) p.session_fillsell_id = a.p_details.session_fillsell_id || null;
        p.details = { ...p.details, ...a.p_details };
        return { data: null, error: null };
      }
      case 'cloud_coffre_ecrire': {
        const i = t.cloud_coffre.findIndex((x) => x.user_id === a.p_user && x.plateforme === a.p_plateforme);
        const l = { user_id: a.p_user, plateforme: a.p_plateforme, chiffre: a.p_chiffre, iv: a.p_iv, connecte: a.p_connecte, maj_le: new Date().toISOString() };
        if (i >= 0) t.cloud_coffre[i] = l; else t.cloud_coffre.push(l);
        return { data: null, error: null };
      }
      case 'cloud_coffre_lire': return { data: t.cloud_coffre.filter((x) => x.user_id === a.p_user), error: null };
      case 'cloud_essai_noter_compte_plateforme': return { data: { ok: true }, error: null };
      default: return { data: null, error: null };
    }
  };
  return { t, appels, rpc, from: requete, auth: { getUser: async () => ({ data: { user: null }, error: { message: 'non' } }) } };
}

// ── Un navigateur DevTools simulé ───────────────────────────────────────────
function navigateurSimule() {
  const stockage = {};
  let cookies = [];
  // (01/11) Ce que la page de connexion LIT du compte (expressionLectureCompte) : à régler par le test.
  const page = { lecture: { http: 200, id: '250623918' }, lectures: 0 };
  const ecouteurs = new Set();
  const envoyes = [];
  let n = 0;
  const cdp = {
    envoyes,
    emettre(m) { for (const f of ecouteurs) f(m); },
    on(f) { ecouteurs.add(f); return () => ecouteurs.delete(f); },
    fermer() {},
    async send(methode, params = {}, sessionId) {
      envoyes.push({ methode, params, sessionId });
      switch (methode) {
        case 'Target.getTargets': return { targetInfos: [{ targetId: 'sw', type: 'service_worker', url: `chrome-extension://${ID_EXT}/background.js` }] };
        case 'Target.attachToTarget': return { sessionId: `s-${params.targetId}` };
        case 'Target.createTarget': return { targetId: `page-${++n}` };
        case 'Page.getFrameTree': return { frameTree: { frame: { id: `cadre-${sessionId}` } } };
        case 'Storage.getCookies': return { cookies };
        case 'Storage.setCookies': cookies = [...cookies, ...params.cookies]; return {};
        case 'Runtime.evaluate': {
          const e = params.expression;
          if (e.startsWith('chrome.storage.local.set(')) {
            const json = e.slice('chrome.storage.local.set('.length, e.indexOf(').then('));
            Object.assign(stockage, JSON.parse(json));
            return { result: { value: Boolean(stockage.fillsell_session_own?.refresh_token) } };
          }
          if (e.startsWith('chrome.storage.local.get(')) {
            return { result: { value: { own: stockage.fillsell_session_own ?? null, user: stockage.fillsell_last_user ?? null } } };
          }
          if (e.includes('location.hostname !==')) { page.lectures++; return { result: { value: page.lecture } }; }
          // (02/11) L'état de la page lu sans réseau (« Résoudre la vérification ») : cadre DataDome présent ou non.
          if (e.includes('captcha-delivery')) return { result: { value: page.etatPage ?? null } };
          return { result: { value: false } };
        }
        default: return {};
      }
    },
  };
  return { cdp, stockage, page, poserCookies: (c) => { cookies = c; } };
}

function navigateursSimules(nav) {
  const ouverts = new Map();
  return {
    ouverts: () => [...ouverts.keys()],
    ouvert: (u) => ouverts.get(u) ?? null,
    async ouvrir(u, { proxyUrl, profilId }) {
      assert.match(proxyUrl, /^http:\/\/u:p@/, 'jamais un navigateur sans le proxy du compte');
      const h = { cdp: nav.cdp, ip: '172.31.0.9', conteneur: `fs-nav-${u}`, profilId, ouvertLe: Date.now() };
      ouverts.set(u, h);
      return h;
    },
    async fermer(u) { ouverts.delete(u); },
  };
}

// L'extension Cloud « construite » : un manifeste avec sa clé, comme build-extension-cloud.mjs le pose.
const dossierExtension = mkdtempSync(path.join(tmpdir(), 'fs-ext-'));
writeFileSync(path.join(dossierExtension, 'manifest.json'), JSON.stringify({ key: CLE_EXT }));
const config = { serveurNom: 'cloud-test', dossierExtension, comptesAutorises: [], cpuPauseAuDessus: 50, navigateursMax: 5, sessionMinimaleMin: 8,
  cleTickets: randomBytes(32).toString('base64'), supabaseUrl: 'https://x.supabase.co', cleAnon: 'anon' };

function monter({ comptes, jobs = [] }) {
  const base = baseSimulee({ comptes, jobs });
  const nav = navigateurSimule();
  const navigateurs = navigateursSimules(nav);
  const coffre = creerCoffre({ base, cle: randomBytes(32).toString('base64') });
  const fabriquees = [];
  const sessions = {
    async fabriquer(u) { const own = { access_token: jwt({ sub: u, session_id: 'sess-neuve' }), refresh_token: 'r1', expires_at: Math.floor(Date.now() / 1000) + 3600 }; fabriquees.push(u); return { own, sessionId: 'sess-neuve' }; },
    async revoquer() { return { revoquee: true }; },
    async rafraichirHorsNavigateur(own) { return own; },
  };
  let connexions = null;
  // (30/10, lot D) La sortie passe par LE module fournisseur (compte à IP dédiée ici : cloud_proxy_identifiants).
  const fournisseurIp = creerFournisseurIp({ config, base, iproyal: null, journal, alertes: { signaler: async () => {} } });
  const postes = creerPostes({ config, base, navigateurs, coffre, sessions, journal, fournisseurIp, connexionsOuvertes: () => connexions?.connexionsOuvertes() ?? new Set(), alertes: { signaler: async () => {} } });
  connexions = creerConnexions({ config, base, postes, navigateurs, coffre, journal });
  return { base, nav, navigateurs, coffre, postes, connexions, fabriquees };
}

test('poste : ouvert avec le coffre et une session FillSell posée ; jamais rouvert ; fermé après sauvegarde', async () => {
  const s = monter({ comptes: [{ user_id: U, ip_id: 7, etat_cloud: 'essai', delai_sessions_min: null }] });
  // Une connexion Vinted déjà au coffre (profil neuf : elle doit revenir).
  await s.coffre.ecrire(U, 'vinted', { le: 'x', cookies: [{ name: 'access_token_web', value: jwt({ sub: 42 }), domain: '.vinted.fr', path: '/' }, { name: 'refresh_token_web', value: 'r', domain: '.vinted.fr', path: '/' }] }, true);
  const r1 = await s.postes.tour();
  assert.deepEqual(r1.ouvrir.map((o) => o.user), [U]);
  assert.equal(s.navigateurs.ouverts().length, 1);
  const poses = s.nav.cdp.envoyes.filter((e) => e.methode === 'Storage.setCookies');
  assert.equal(poses.length, 1, 'le coffre a été réinjecté (Vinted)');
  assert.equal(s.fabriquees.length, 1, 'aucune session au coffre ni dans l\'extension : une session neuve, fabriquée par le serveur');
  assert.equal(s.nav.stockage.fillsell_session_own.refresh_token, 'r1', 'posée dans le stockage de l\'extension');
  assert.equal(s.nav.stockage.fillsell_last_user.sub, U);
  const poste = s.base.t.cloud_postes.find((p) => p.user_id === U);
  assert.equal(poste.etat, 'actif');
  assert.equal(poste.session_fillsell_id, 'sess-neuve', 'le poste connaît sa session (révocable à la purge)');
  assert.ok(s.base.t.cloud_coffre.some((l) => l.plateforme === 'fillsell'), 'la session FillSell est au coffre (chiffrée)');
  const r2 = await s.postes.tour();
  assert.equal(r2.ouvrir.length, 0, 'déjà ouvert : rien de plus');
  // Le compte n'est plus à servir : fermé, APRÈS sauvegarde.
  s.base.rpc = ((orig) => async (nom, a) => (nom === 'cloud_comptes_a_servir' ? { data: [], error: null } : orig(nom, a)))(s.base.rpc);
  const r3 = await s.postes.tour();
  assert.deepEqual(r3.fermer, [{ user: U, raison: 'compte_inactif' }]);
  assert.equal(s.navigateurs.ouverts().length, 0);
  assert.equal(s.base.t.cloud_postes.find((p) => p.user_id === U).etat, 'eteint');
});

test('poste : un job « processing » garde son navigateur, même compte inactif', async () => {
  const s = monter({ comptes: [{ user_id: U, ip_id: 7, etat_cloud: 'paye', delai_sessions_min: null }],
    jobs: [{ user_id: U, status: 'processing', action: 'publish', platform: 'vinted', voie: 'extension', platform_fields: {} }] });
  await s.postes.tour();
  s.base.rpc = ((orig) => async (nom, a) => (nom === 'cloud_comptes_a_servir' ? { data: [], error: null } : orig(nom, a)))(s.base.rpc);
  const r = await s.postes.tour();
  assert.equal(r.fermer.length, 0);
  assert.equal(s.navigateurs.ouverts().length, 1);
});

test('« Me connecter » : page de connexion mobile, navigation refusée, images bornées, connexion détectée', async () => {
  const s = monter({ comptes: [{ user_id: U, ip_id: 7, etat_cloud: 'essai', delai_sessions_min: null }] });
  const recus = [];
  const ws = { readyState: 1, bufferedAmount: 0, ecouteurs: {}, on(e, f) { this.ecouteurs[e] = f; },
    send(d) { recus.push(typeof d === 'string' ? JSON.parse(d) : { binaire: d }); }, close() { this.readyState = 3; this.ecouteurs.close?.(); } };
  s.connexions.brancher(ws, 'https://fillsell.app');
  const ticket = signerTicket({ user: U }, config.cleTickets);
  await ws.ecouteurs.message(Buffer.from(JSON.stringify({ t: 'ouvrir', ticket, plateforme: 'vinted', largeur: 390, hauteur: 780, dpr: 3 })), false);
  await attendre(20);
  assert.ok(recus.some((m) => m.t === 'etat' && m.etape === 'pret'), 'la page est prête');
  const metrics = s.nav.cdp.envoyes.find((e) => e.methode === 'Emulation.setDeviceMetricsOverride');
  assert.deepEqual([metrics.params.width, metrics.params.height, metrics.params.mobile], [390, 780, true], 'au format du téléphone');
  const nav = s.nav.cdp.envoyes.find((e) => e.methode === 'Page.navigate');
  assert.match(nav.params.url, /^https:\/\/www\.vinted\.fr\/member\/signup/, 'seulement la page de connexion');
  const fetchOn = s.nav.cdp.envoyes.find((e) => e.methode === 'Fetch.enable');
  assert.equal(fetchOn.params.patterns[0].resourceType, 'Document');
  // Une navigation hors connexion (le catalogue) dans le cadre principal : refusée.
  const sid = nav.sessionId;
  s.nav.cdp.emettre({ method: 'Fetch.requestPaused', sessionId: sid, params: { requestId: 'r1', frameId: `cadre-${sid}`, resourceType: 'Document', request: { url: 'https://www.vinted.fr/catalog?q=x' } } });
  await attendre(10);
  assert.ok(s.nav.cdp.envoyes.some((e) => e.methode === 'Fetch.failRequest' && e.params.requestId === 'r1'), 'catalogue refusé');
  assert.equal(s.nav.cdp.envoyes.filter((e) => e.methode === 'Page.navigate').length, 2, '…et retour à la connexion');
  // Un cadre (captcha) passe, une page Apple passe.
  s.nav.cdp.emettre({ method: 'Fetch.requestPaused', sessionId: sid, params: { requestId: 'r2', frameId: 'autre-cadre', resourceType: 'Document', request: { url: 'https://geo.captcha-delivery.com/x' } } });
  s.nav.cdp.emettre({ method: 'Fetch.requestPaused', sessionId: sid, params: { requestId: 'r3', frameId: `cadre-${sid}`, resourceType: 'Document', request: { url: 'https://appleid.apple.com/auth/authorize' } } });
  await attendre(10);
  assert.ok(s.nav.cdp.envoyes.some((e) => e.methode === 'Fetch.continueRequest' && e.params.requestId === 'r2'), 'un cadre de captcha n\'est pas bloqué');
  assert.ok(s.nav.cdp.envoyes.some((e) => e.methode === 'Fetch.continueRequest' && e.params.requestId === 'r3'), 'la connexion Apple passe');
  // Images : au plus deux en vol tant que le client n'accuse pas réception.
  for (let i = 0; i < 4; i++) s.nav.cdp.emettre({ method: 'Page.screencastFrame', sessionId: sid, params: { sessionId: i, data: Buffer.from('jpeg').toString('base64') } });
  await attendre(10);
  assert.equal(recus.filter((m) => m.binaire).length, 2, 'débit réglé par les accusés');
  await ws.ecouteurs.message(Buffer.from(JSON.stringify({ t: 'ack' })), false);
  await attendre(5);
  assert.equal(recus.filter((m) => m.binaire).length, 3, 'un accusé = une image de plus');
  // Un geste rejoué.
  await ws.ecouteurs.message(Buffer.from(JSON.stringify({ t: 'toucher', type: 'debut', x: 100, y: 200 })), false);
  await attendre(5);
  assert.ok(s.nav.cdp.envoyes.some((e) => e.methode === 'Input.dispatchTouchEvent' && e.params.type === 'touchStart'));
  // La connexion faite : cookies d'identité → coffre, compte noté, « connecté ».
  s.nav.poserCookies([{ name: 'access_token_web', value: jwt({ sub: 250623918 }), domain: '.vinted.fr' }, { name: 'refresh_token_web', value: 'r', domain: '.vinted.fr' }]);
  await ws.ecouteurs.message(Buffer.from(JSON.stringify({ t: 'termine' })), false);
  await attendre(20);
  assert.ok(recus.some((m) => m.t === 'etat' && m.etape === 'connecte'), 'connecté');
  assert.ok(s.base.t.cloud_coffre.some((l) => l.plateforme === 'vinted' && l.connecte), 'coffre sauvegardé');
  const note = s.base.appels.find(([n]) => n === 'cloud_essai_noter_compte_plateforme');
  assert.deepEqual([note[1].p_plateforme, note[1].p_identifiant], ['vinted', '250623918'], 'compte de plateforme noté (essai unique)');
  assert.equal(s.base.t.cloud_connexions[0].statut, 'connectee');
  assert.ok(s.connexions.connexionsOuvertes().has(U));
  await attendre(1600);
  assert.ok(!s.connexions.connexionsOuvertes().has(U), 'l\'écran se ferme seul');
});

test('« Me connecter » : sans ticket valide, rien ne s\'ouvre', async () => {
  const s = monter({ comptes: [] });
  const recus = [];
  const ws = { readyState: 1, ecouteurs: {}, on(e, f) { this.ecouteurs[e] = f; }, send(d) { recus.push(JSON.parse(d)); }, close() { this.readyState = 3; } };
  s.connexions.brancher(ws, 'https://fillsell.app');
  await ws.ecouteurs.message(Buffer.from(JSON.stringify({ t: 'ouvrir', ticket: 'faux.ticket', plateforme: 'vinted' })), false);
  await attendre(10);
  assert.equal(recus[0]?.etape, 'non_autorise');
  assert.equal(s.navigateurs.ouverts().length, 0);
});

test('« Me connecter » : jamais de boucle — 5 refus en 20 s arrêtent l’écran et le disent (05/10, Vinted /member/register)', async () => {
  const s = monter({ comptes: [{ user_id: U, ip_id: 7, etat_cloud: 'essai', delai_sessions_min: null }] });
  const recus = [];
  const ws = { readyState: 1, bufferedAmount: 0, ecouteurs: {}, on(e, f) { this.ecouteurs[e] = f; },
    send(d) { recus.push(typeof d === 'string' ? JSON.parse(d) : { binaire: d }); }, close() { this.readyState = 3; this.ecouteurs.close?.(); } };
  s.connexions.brancher(ws, 'https://fillsell.app');
  const ticket = signerTicket({ user: U }, config.cleTickets);
  await ws.ecouteurs.message(Buffer.from(JSON.stringify({ t: 'ouvrir', ticket, plateforme: 'vinted', largeur: 390, hauteur: 780, dpr: 3 })), false);
  await attendre(20);
  const sid = s.nav.cdp.envoyes.find((e) => e.methode === 'Page.navigate').sessionId;
  // La nouvelle adresse de connexion de Vinted passe.
  s.nav.cdp.emettre({ method: 'Fetch.requestPaused', sessionId: sid, params: { requestId: 'ok1', frameId: `cadre-${sid}`, resourceType: 'Document', request: { url: 'https://www.vinted.fr/member/register/select_type?ref_url=%2F' } } });
  await attendre(10);
  assert.ok(s.nav.cdp.envoyes.some((e) => e.methode === 'Fetch.continueRequest' && e.params.requestId === 'ok1'), '/member/register/select_type est permis');
  // Une page qui renvoie sans cesse hors de la liste : arrêt au 5e refus.
  for (let i = 1; i <= 7; i++) {
    s.nav.cdp.emettre({ method: 'Fetch.requestPaused', sessionId: sid, params: { requestId: `b${i}`, frameId: `cadre-${sid}`, resourceType: 'Document', request: { url: 'https://www.vinted.fr/catalog?q=x' } } });
    await attendre(5);
  }
  const navigations = s.nav.cdp.envoyes.filter((e) => e.methode === 'Page.navigate').length;
  assert.equal(navigations, 1 + 4, 'la page de connexion n’est renvoyée que 4 fois, jamais au-delà');
  const arret = recus.find((m) => m.t === 'etat' && m.etape === 'erreur');
  assert.ok(arret && /ne s'ouvre pas comme prévu/.test(arret.message), 'la personne lit pourquoi on s’arrête');
  assert.ok(!s.connexions.connexionsOuvertes().has(U), 'l’écran est fermé');
});

// ── (01/11) Essai de Nico du 01/11 au soir : « connecté » sur le seul cookie, fenêtre fermée en pleine vérification ───
function brancherClient(s, plateforme = 'leboncoin') {
  const recus = [];
  const ws = { readyState: 1, bufferedAmount: 0, ecouteurs: {}, on(e, f) { this.ecouteurs[e] = f; },
    send(d) { recus.push(typeof d === 'string' ? JSON.parse(d) : { binaire: d }); }, close() { this.readyState = 3; this.ecouteurs.close?.(); } };
  s.connexions.brancher(ws, 'https://fillsell.app');
  const ticket = signerTicket({ user: U }, config.cleTickets);
  const dire = (m) => ws.ecouteurs.message(Buffer.from(JSON.stringify(m)), false);
  return { ws, recus, dire, ouvrir: (extra = {}) => dire({ t: 'ouvrir', ticket, plateforme, largeur: 390, hauteur: 780, dpr: 3, ...extra }), etapes: () => recus.filter((m) => m.t === 'etat').map((m) => m.etape) };
}
const LBC = [{ name: '__Secure-Login', value: 'jeton', domain: '.leboncoin.fr', path: '/' }];

test('(01/11) le cookie seul ne fait JAMAIS « connecté » : compte illisible (vérification du téléphone en cours) → la page reste ouverte', async () => {
  const s = monter({ comptes: [{ user_id: U, ip_id: 7, etat_cloud: 'essai', delai_sessions_min: null }] });
  const c = brancherClient(s);
  await c.ouvrir();
  await attendre(20);
  s.nav.poserCookies(LBC);
  s.nav.page.lecture = { horsSite: true };          // la page est sur auth.leboncoin.fr (étape du téléphone)
  await c.dire({ t: 'termine' });
  await attendre(20);
  s.nav.page.lecture = { http: 401, id: null };     // sur le site, mais le compte ne se lit pas
  await c.dire({ t: 'termine' });
  await attendre(20);
  assert.ok(!c.etapes().includes('connecte') && !c.etapes().includes('verifie'), c.etapes().join(','));
  assert.ok(c.recus.some((m) => m.etape === 'info' && /Termine les étapes demandées par Leboncoin/.test(m.message)), 'la personne lit qu\'elle doit finir');
  assert.ok(!s.base.t.cloud_coffre.some((l) => l.plateforme === 'leboncoin'), 'rien au coffre');
  assert.ok(s.connexions.connexionsOuvertes().has(U), 'la page reste ouverte');
  // Une sauvegarde ordinaire (10 min) ne relève rien non plus.
  const b = await s.postes.sauvegarder(U, s.navigateurs.ouvert(U));
  assert.equal(b.leboncoin, 'non_verifiee');
  assert.ok(!s.base.t.cloud_coffre.some((l) => l.plateforme === 'leboncoin'));
  await c.dire({ t: 'fermer' });
});

test('(01/11) le compte LU → « vérifié », la page RESTE ouverte (étape du téléphone) ; « J\'ai fini » → « connecté » et fermeture', async () => {
  const s = monter({ comptes: [{ user_id: U, ip_id: 7, etat_cloud: 'essai', delai_sessions_min: null }] });
  const verifiees = [];
  s.connexions = creerConnexions({ config, base: s.base, postes: s.postes, navigateurs: s.navigateurs, coffre: s.coffre, journal, surVerifiee: (e) => verifiees.push(e) });
  const c = brancherClient(s);
  await c.ouvrir();
  await attendre(20);
  s.nav.poserCookies(LBC);
  s.nav.page.lecture = { http: 200, id: 'compte' };
  await attendre(2300);                              // la sonde (2 s) lit le compte
  assert.ok(c.etapes().includes('verifie'), c.etapes().join(','));
  assert.ok(!c.etapes().includes('connecte'), 'pas de fermeture : la personne finit ses étapes');
  assert.ok(s.connexions.connexionsOuvertes().has(U));
  const l = s.base.t.cloud_coffre.find((x) => x.plateforme === 'leboncoin');
  assert.ok(l?.connecte, 'au coffre, connecté');
  assert.equal((await s.coffre.lire(U)).leboncoin.verifie.http, 200, 'avec sa preuve');
  assert.deepEqual(verifiees.map((v) => [v.plateforme, v.http]), [['leboncoin', 200]], 'notée pour les 48 h');
  assert.equal(s.base.t.cloud_connexions.at(-1).statut, 'connectee');
  // Après la vérification, une navigation refusée laisse la page où elle est (aucun retour forcé, aucune boucle).
  const sid = s.nav.cdp.envoyes.find((e) => e.methode === 'Page.navigate').sessionId;
  const navAvant = s.nav.cdp.envoyes.filter((e) => e.methode === 'Page.navigate').length;
  for (let i = 0; i < 6; i++) s.nav.cdp.emettre({ method: 'Fetch.requestPaused', sessionId: sid, params: { requestId: `z${i}`, frameId: `cadre-${sid}`, resourceType: 'Document', request: { url: 'https://www.leboncoin.fr/recherche?text=x' } } });
  await attendre(20);
  assert.equal(s.nav.cdp.envoyes.filter((e) => e.methode === 'Page.navigate').length, navAvant);
  assert.ok(s.connexions.connexionsOuvertes().has(U), 'jamais « boucle » après la vérification');
  await c.dire({ t: 'termine' });
  await attendre(20);
  assert.ok(c.etapes().includes('connecte'));
  await attendre(1600);
  assert.ok(!s.connexions.connexionsOuvertes().has(U), 'fermée après « J\'ai fini »');
});

test('(01/11) l\'app quittée pour lire un SMS : la page attend, et le même « Me connecter » la REPREND (aucune page neuve)', async () => {
  const s = monter({ comptes: [{ user_id: U, ip_id: 7, etat_cloud: 'essai', delai_sessions_min: null }] });
  const c1 = brancherClient(s, 'depop');
  await c1.ouvrir();
  await attendre(20);
  const pages = () => s.nav.cdp.envoyes.filter((e) => e.methode === 'Target.createTarget').length;
  const fermetures = () => s.nav.cdp.envoyes.filter((e) => e.methode === 'Target.closeTarget').length;
  assert.equal(pages(), 1);
  c1.ws.close();                                     // iOS coupe la connexion : l'app est en arrière-plan
  await attendre(20);
  assert.equal(fermetures(), 0, 'la page de connexion n\'est PAS fermée');
  assert.ok(s.connexions.connexionsOuvertes().has(U));
  const c2 = brancherClient(s, 'depop');
  await c2.ouvrir();
  await attendre(20);
  assert.equal(pages(), 1, 'la même page, reprise telle quelle');
  assert.ok(c2.recus.some((m) => m.etape === 'pret' && /restée ouverte/.test(m.message)), 'la personne lit que sa page l\'attendait');
  await c2.dire({ t: 'toucher', type: 'debut', x: 10, y: 10 });
  await attendre(10);
  assert.ok(s.nav.cdp.envoyes.some((e) => e.methode === 'Input.dispatchTouchEvent'), 'les gestes reprennent');
  // Une AUTRE plateforme ouverte entre-temps remplace la page en attente.
  c2.ws.close();
  const c3 = brancherClient(s, 'vinted');
  await c3.ouvrir();
  await attendre(20);
  assert.equal(pages(), 2);
  assert.ok(fermetures() >= 1, 'la page Depop en attente est fermée');
  await c3.dire({ t: 'fermer' });
});

test('(01/11) fermée sans connexion vérifiée : la demi-session part du profil (sauf l\'appareil DataDome)', async () => {
  const s = monter({ comptes: [{ user_id: U, ip_id: 7, etat_cloud: 'essai', delai_sessions_min: null, plateformes_connectees: [] }] });
  const c = brancherClient(s);
  await c.ouvrir();
  await attendre(20);
  s.nav.poserCookies([...LBC, { name: 'datadome', value: 'appareil', domain: '.leboncoin.fr', path: '/' }]);
  s.nav.page.lecture = { horsSite: true };
  await c.dire({ t: 'fermer' });
  await attendre(30);
  const echus = s.nav.cdp.envoyes.filter((e) => e.methode === 'Storage.setCookies').flatMap((e) => e.params.cookies).filter((x) => x.expires === 1);
  assert.deepEqual(echus.map((x) => x.name), ['__Secure-Login'], 'les cookies de session échus ; l\'appareil DataDome gardé');
  assert.ok(s.nav.cdp.envoyes.some((e) => e.methode === 'Storage.clearDataForOrigin' && e.params.origin === 'https://www.leboncoin.fr'), 'le jeton « luat » de la page part aussi');
});

test('(01/11) clavier : effacer, effacer un mot, jusqu\'au début de la ligne — rejoués comme de vraies touches', async () => {
  const s = monter({ comptes: [{ user_id: U, ip_id: 7, etat_cloud: 'essai', delai_sessions_min: null }] });
  const c = brancherClient(s, 'vinted');
  await c.ouvrir();
  await attendre(20);
  const touches = () => s.nav.cdp.envoyes.filter((e) => e.methode === 'Input.dispatchKeyEvent' && e.params.type !== 'keyUp').map((e) => `${e.params.type}:${e.params.key}:${e.params.modifiers ?? 0}`);
  await c.dire({ t: 'touche', cle: 'Backspace' });
  await c.dire({ t: 'touche', cle: 'Backspace', n: 3 });
  await c.dire({ t: 'touche', cle: 'MotPrecedent' });
  await c.dire({ t: 'touche', cle: 'LignePrecedente' });
  await c.dire({ t: 'touche', cle: 'Delete' });
  await c.dire({ t: 'touche', cle: 'Enter' });
  await c.dire({ t: 'touche', cle: 'toString' });
  await attendre(20);
  assert.deepEqual(touches(), ['rawKeyDown:Backspace:0', 'rawKeyDown:Backspace:0', 'rawKeyDown:Backspace:0', 'rawKeyDown:Backspace:0',
    'rawKeyDown:Backspace:2', 'rawKeyDown:Home:8', 'rawKeyDown:Backspace:0', 'rawKeyDown:Delete:0', 'keyDown:Enter:0']);
  await c.dire({ t: 'fermer' });
});

test('(01/11, 23:10) une plateforme EN VÉRIFICATION : plus servie, session gardée (jamais purgée), rouverte par une connexion vérifiée', async () => {
  const s = monter({ comptes: [{ user_id: U, ip_id: 7, etat_cloud: 'essai', delai_sessions_min: null, plateformes_connectees: ['leboncoin', 'vinted'] }] });
  const LBC_C = [{ name: '__Secure-Login', value: 'jeton', domain: '.leboncoin.fr', path: '/' }];
  const VIN = [{ name: 'access_token_web', value: jwt({ sub: 42 }), domain: '.vinted.fr', path: '/' }, { name: 'refresh_token_web', value: 'r', domain: '.vinted.fr', path: '/' }];
  await s.coffre.sauvegarderCookies(U, [...LBC_C, ...VIN], { verifiees: ['leboncoin', 'vinted'] });
  s.nav.poserCookies([...LBC_C, ...VIN]);
  await s.postes.tour();
  const fait = await s.postes.bloquerPlateforme(U, 'leboncoin', { nature: 'glissiere', detail: 'cadre DataDome dans un onglet de travail' });
  assert.equal(fait.coffre, true, 'la ligne du coffre est passée « en vérification »');
  const ligne = s.base.t.cloud_coffre.find((l) => l.plateforme === 'leboncoin');
  assert.equal(ligne.connecte, false, 'plus « connectée » : get-pending-jobs ne sert plus ses tâches au Cloud, l’app demande la reconnexion');
  const lu = await s.coffre.lire(U);
  assert.equal(lu.leboncoin.bloquee.nature, 'glissiere');
  assert.equal(lu.leboncoin.cookies.length, 1, 'la session est gardée (aucun mot de passe ni code à retaper)');
  assert.equal(await s.coffre.bloquer(U, 'leboncoin', { nature: 'glissiere' }), false, 'déjà en vérification : rien ne change');
  // Une sauvegarde ordinaire ne la relève pas ; une restauration la ramène ; la purge ne la touche pas.
  assert.equal((await s.postes.sauvegarder(U, s.navigateurs.ouvert(U))).leboncoin, 'non_verifiee');
  assert.equal((await s.coffre.lire(U)).leboncoin.bloquee.nature, 'glissiere', 'la cause reste');
  const r = await s.coffre.cookiesARestaurer(U, VIN);
  assert.equal(r.bilan.leboncoin, 'restauree(1)');
  assert.deepEqual(r.bloquees, ['leboncoin']);
  assert.equal(await s.postes.purgerPlateforme(U, 'leboncoin'), 0, 'jamais purgée : seul le verrou la ferme');
  // La personne résout la vérification dans « Me connecter » : connexion vérifiée → connectée, sans cause.
  await s.coffre.sauvegarderCookies(U, [...LBC_C, ...VIN], { verifiees: ['leboncoin'], preuves: { leboncoin: { le: 'x', http: 200 } } });
  const apres = await s.coffre.lire(U);
  assert.equal(apres.leboncoin.connecte, true);
  assert.equal(apres.leboncoin.bloquee, undefined);
});

test('(01/11, 23:10) le signe de vie de l’exécutant : noté avec la sauvegarde périodique (10 min)', async () => {
  const s = monter({ comptes: [{ user_id: U, ip_id: 7, etat_cloud: 'essai', delai_sessions_min: null }] });
  await s.postes.tour();
  const avant = s.base.appels.filter(([n, a]) => n === 'cloud_poste_noter' && a.p_details?.vu).length;
  await s.postes.tour();   // moins de 10 min : rien
  assert.equal(s.base.appels.filter(([n, a]) => n === 'cloud_poste_noter' && a.p_details?.vu).length, avant);
});

// ── (02/11, demande de Nico) « RÉSOUDRE LA VÉRIFICATION » : la page du Cloud où la glissière s'affiche ─────────────────
function fauxVerifications(blocages) {
  const appels = [];
  return { appels, blocageDe: (u, p) => blocages[p] ?? null,
    rouvrir: async (u, p, o) => { appels.push(['rouvrir', p, o.par, o.preuve?.http]); delete blocages[p]; return true; },
    revenue: async (u, p) => { appels.push(['revenue', p]); }, requalifier: async (u, p, n) => { appels.push(['requalifier', p, n]); },
    sessionFermee: async (u, p) => { appels.push(['session_fermee', p]); } };
}
function monterResolution(blocages) {
  const s = monter({ comptes: [{ user_id: U, ip_id: 7, etat_cloud: 'essai', delai_sessions_min: null }] });
  const cadres = { permis: [], retires: [], plateformes: [] };
  s.navigateurs.permettreCadre = (u, c) => { cadres.permis.push(c); return true; };
  s.navigateurs.retirerCadre = (u, c) => { cadres.retires.push(c); };
  s.navigateurs.permettre = async (u, l) => { cadres.plateformes.push(l); return { ok: true }; };
  const v = fauxVerifications(blocages);
  s.connexions = creerConnexions({ config, base: s.base, postes: s.postes, navigateurs: s.navigateurs, coffre: s.coffre, journal, verifications: v });
  return { s, v, cadres };
}

test('(02/11) « Résoudre » : la page du compte s\'ouvre (seule à joindre Leboncoin), la personne glisse, UNE lecture confirme, Leboncoin repart', async () => {
  const { s, v, cadres } = monterResolution({ leboncoin: { nature: 'glissiere', le: '2026-11-02T03:57:37Z', referer: 'https://api.leboncoin.fr/api/messaging-items-api/v3/conversations' } });
  s.nav.poserCookies(LBC);
  s.nav.page.etatPage = { hote: 'www.leboncoin.fr', pret: true, captcha: true, bloque: false, interstitiel: false };
  s.nav.page.lecture = { http: 200, id: 'compte' };
  const c = brancherClient(s);
  await c.ouvrir({ mode: 'resoudre' });
  await attendre(20);
  const nav = s.nav.cdp.envoyes.find((e) => e.methode === 'Page.navigate');
  assert.equal(nav.params.url, 'https://www.leboncoin.fr/compte/part/mes-annonces', 'refus sur une API : une page du compte, qui refait ses requêtes');
  assert.deepEqual(cadres.permis, ['page-1'], 'seule CETTE page passe le verrou');
  assert.deepEqual(cadres.plateformes, [], 'Leboncoin n\'est jamais rouvert au navigateur entier (ni à l\'extension) avant la preuve');
  assert.ok(!s.base.t.cloud_connexions.length, 'rien au journal des connexions : ce n\'est pas une connexion');
  await attendre(2200);
  assert.ok(c.recus.some((m) => m.etape === 'info' && /fais glisser le curseur/.test(m.message)), c.etapes().join(','));
  assert.equal(s.nav.page.lectures, 0, 'aucune requête tant que la glissière est là');
  s.nav.page.etatPage = { ...s.nav.page.etatPage, captcha: false };    // la personne a glissé
  await attendre(6300);
  assert.equal(s.nav.page.lectures, 1, 'UNE lecture légère, après la glissière');
  assert.deepEqual(v.appels, [['rouvrir', 'leboncoin', 'resoudre', 200]], 'la plateforme rouverte (coffre, verrou, blocage résolu)');
  assert.ok(c.etapes().includes('resolu'), c.etapes().join(','));
  await attendre(1700);
  assert.ok(!s.connexions.connexionsOuvertes().has(U), 'la vue se ferme');
  assert.ok(cadres.retires.includes('page-1'), 'l\'exception du verrou part avec la page');
});

test('(02/11) « Résoudre » : la vérification REVIENT après la glissière → on s\'arrête (aucune boucle), l\'équipe prévenue', async () => {
  const { s, v } = monterResolution({ leboncoin: { nature: 'glissiere', le: '2026-11-02T03:57:37Z' } });
  s.nav.poserCookies(LBC);
  s.nav.page.etatPage = { hote: 'www.leboncoin.fr', pret: true, captcha: true, bloque: false, interstitiel: false };
  s.nav.page.lecture = { http: 403, id: null };
  const c = brancherClient(s);
  await c.ouvrir({ mode: 'resoudre' });
  await attendre(2200);
  s.nav.page.etatPage = { ...s.nav.page.etatPage, captcha: false };
  await c.dire({ t: 'termine' });                    // « J'ai fini » : la lecture part tout de suite
  await attendre(30);
  assert.equal(s.nav.page.lectures, 1);
  assert.deepEqual(v.appels, [['revenue', 'leboncoin']]);
  assert.ok(c.recus.some((m) => m.etape === 'revenue' && /sans insister/.test(m.message)), c.etapes().join(','));
  await attendre(2300);
  assert.equal(s.nav.page.lectures, 1, 'jamais une deuxième lecture : on ne boucle pas');
  await attendre(400);
  assert.ok(!s.connexions.connexionsOuvertes().has(U));
});

test('(02/11) « Résoudre » : bloqué sans glissière (t=bv) → « restreint », rien à glisser ; une plateforme sans vérification → « rien »', async () => {
  const { s, v } = monterResolution({ beebs: { nature: 'glissiere', le: '2026-11-02T04:15:38Z', referer: 'https://www.beebs.app/#fillsell-worker' } });
  s.nav.page.etatPage = { hote: 'www.beebs.app', pret: true, captcha: false, bloque: true, interstitiel: false };
  const c = brancherClient(s, 'beebs');
  await c.ouvrir({ mode: 'resoudre' });
  await attendre(20);
  assert.equal(s.nav.cdp.envoyes.find((e) => e.methode === 'Page.navigate').params.url, 'https://www.beebs.app/', 'la page de la vérification, sans l\'ancre de travail');
  await attendre(2200);
  assert.deepEqual(v.appels, [['requalifier', 'beebs', 'restreint']]);
  assert.equal(s.nav.page.lectures, 0, 'aucune requête : DataDome dit lui-même qu\'il n\'y a rien à glisser');
  assert.ok(c.recus.some((m) => m.etape === 'restreint' && /rien à glisser/.test(m.message)));
  await attendre(2600);
  const c2 = brancherClient(s, 'vinted');
  const pages = s.nav.cdp.envoyes.filter((e) => e.methode === 'Target.createTarget').length;
  await c2.ouvrir({ mode: 'resoudre' });
  await attendre(20);
  assert.deepEqual(c2.etapes(), ['rien'], 'Vinted n\'attend aucune vérification');
  assert.equal(s.nav.cdp.envoyes.filter((e) => e.methode === 'Target.createTarget').length, pages, 'aucune page ouverte');
});
