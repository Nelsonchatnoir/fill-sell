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
          return { result: { value: false } };
        }
        default: return {};
      }
    },
  };
  return { cdp, stockage, poserCookies: (c) => { cookies = c; } };
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
  const postes = creerPostes({ config, base, navigateurs, coffre, sessions, journal, connexionsOuvertes: () => connexions?.connexionsOuvertes() ?? new Set(), alertes: { signaler: async () => {} } });
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
