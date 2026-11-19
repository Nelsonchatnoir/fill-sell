// (19/11/2026, client Cloud 8fd44622 — décision de Nico) « SE CONNECTER AVEC GOOGLE » : L'ÉCRAN DIT QUE C'EST LE MOT DE
// PASSE GOOGLE, ET PROPOSE DE REVENIR À L'E-MAIL DE LA PLATEFORME. Verrou : selftest:cloud-connexion-fournisseur.
//
// Ce qui s'est passé : sur Vinted, Leboncoin et Beebs, il a choisi « Se connecter avec Google » ; la page Google
// « Saisissez votre mot de passe » a répondu « Mot de passe incorrect » à chaque essai (il tapait sans doute celui de la
// plateforme). Le serveur voyait le passage chez Google (connexion_redirection_fournisseur) et n'en disait rien.
// Ici, sans réseau ni navigateur (un DevTools simulé) :
//   · le serveur dit { t:'fournisseur', nom:'google', plateforme } à l'entrée chez Google (dans la page : Vinted,
//     Leboncoin ; dans une fenêtre : Beebs), et { nom: null } à la sortie (retour sur la plateforme, fenêtre fermée,
//     connectée, page fermée) — un seul message par changement ;
//   · { t:'revenir_plateforme' } ferme la fenêtre Google et renvoie la page à son adresse de départ, sans rien taper,
//     cliquer ni lire dans la page ; hors Google, en « Résoudre », il ne fait rien ;
//   · rien d'autre ne change : sans Google (Kiabi, Apple, la plateforme), aucun message nouveau ;
//   · bout à bout : le VRAI client (clientConnexion.js, sur une vraie WebSocket) et l'automate de l'écran (suiviVue.js).
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';
import { creerConnexions } from '../src/connexion.js';
import { signerTicket } from '../src/tickets.js';
import { DEFINITIONS } from '../src/plateformes.js';

const pur = await import('../src/fournisseurConnexion.js').catch((e) => ({ erreur: e }));
const U = '8f0e0d0c-0b0a-4908-8706-050403020119';
const CLE = randomBytes(32).toString('base64');
const attendre = (ms) => new Promise((r) => setTimeout(r, ms));
const GESTES = ['Input.dispatchTouchEvent', 'Input.dispatchMouseEvent', 'Input.dispatchKeyEvent', 'Input.insertText'];
// Une assertion qui tombe laisse sa page ouverte : toutes sont fermées à la fin (sinon le fichier ne s'arrête jamais).
const montes = [];
after(() => { for (const s of montes) s.connexions.fermerTout(); });

// ── Un navigateur DevTools simulé (cibles, sessions, requêtes interceptées) ───────────────────────────────────────────
function monter({ verifications = null } = {}) {
  const envoyes = [];
  const ecouteurs = new Set();
  const page = { cookies: [], lecture: null };
  let n = 0;
  const cdp = {
    envoyes,
    emettre(m) { for (const f of ecouteurs) f(m); },
    on(f) { ecouteurs.add(f); return () => ecouteurs.delete(f); },
    async send(methode, params = {}, sessionId) {
      envoyes.push({ methode, params, sessionId });
      switch (methode) {
        case 'Target.createTarget': return { targetId: `page-${++n}` };
        case 'Target.attachToTarget': return { sessionId: `s-${params.targetId}` };
        case 'Page.getFrameTree': return { frameTree: { frame: { id: `cadre-${sessionId}` } } };
        case 'Storage.getCookies': return { cookies: page.cookies };
        case 'Runtime.evaluate': return { result: { value: String(params.expression).includes('location.hostname !==') ? page.lecture : null } };
        default: return {};
      }
    },
  };
  const lignes = [];
  const journal = { info: (e, d) => lignes.push(['info', e, d]), alerte: (e, d) => lignes.push(['alerte', e, d]), erreur: (e, d) => lignes.push(['erreur', e, d]) };
  const q = () => { const o = { insert: () => o, select: () => o, update: () => o, eq: () => o, maybeSingle: async () => ({ data: { id: 'ligne-1' }, error: null }),
    then: (ok, ko) => Promise.resolve({ data: null, error: null }).then(ok, ko) }; return o; };
  const base = {
    rpc: async (nom) => (nom === 'cloud_comptes_du_serveur' ? { data: [{ user_id: U, etat_cloud: 'paye', plateformes_connectees: [] }], error: null } : { data: null, error: null }),
    from: q, auth: { getUser: async () => ({ data: null, error: { message: 'non' } }) },
  };
  let ouvert = null;
  const navigateurs = { ouvert: () => ouvert, permettre: async () => ({ ok: true }) };
  const postes = { ouvrir: async () => { ouvert = { cdp, permises: [] }; return ouvert; }, purgerPlateforme: async () => {}, extensionId: async () => null };
  const coffre = { sauvegarderCookies: async () => ({ ok: true }) };
  // La sonde de la page (toutes les 2 s) est mise de côté : chaque appel DevTools vu ici vient d'un geste du test.
  const connexions = creerConnexions({ config: { serveurNom: 'cloud-test', comptesAutorises: [], cleTickets: CLE }, base, postes, navigateurs, coffre,
    journal, verifications, alertes: { signaler: async () => {} }, delais: { sondeMs: 3_600_000 } });
  const s = { cdp, page, lignes, connexions, depuis: () => { const i = envoyes.length; return () => envoyes.slice(i); } };
  montes.push(s);
  return s;
}

function client(s, plateforme) {
  const recus = [];
  const ws = { readyState: 1, bufferedAmount: 0, ecouteurs: {}, on(e, f) { this.ecouteurs[e] = f; },
    send(d) { recus.push(typeof d === 'string' ? JSON.parse(d) : { binaire: true }); },
    close(code) { if (this.readyState === 3) return; this.code = code ?? null; this.readyState = 3; this.ecouteurs.close?.(); } };
  s.connexions.brancher(ws, 'https://fillsell.app');
  const dire = (m) => ws.ecouteurs.message(Buffer.from(JSON.stringify(m)), false);
  return { ws, recus, dire, ouvrir: (extra = {}) => dire({ t: 'ouvrir', ticket: signerTicket({ user: U }, CLE), plateforme, largeur: 390, hauteur: 780, dpr: 3, ...extra }),
    fournisseurs: () => recus.filter((m) => m.t === 'fournisseur'), etapes: () => recus.filter((m) => m.t === 'etat').map((m) => m.etape) };
}

// La page (ou une fenêtre) : une requête de document principal laissée passer, et l'adresse affichée (frameNavigated).
const pageDe = (s, sid) => ({
  requete: (requestId, url, plus = {}) => s.cdp.emettre({ method: 'Fetch.requestPaused', sessionId: sid, params: { requestId, frameId: `cadre-${sid}`, resourceType: 'Document', request: { url }, ...plus } }),
  affiche: (url) => s.cdp.emettre({ method: 'Page.frameNavigated', sessionId: sid, params: { frame: { id: `cadre-${sid}`, url, loaderId: 'l' }, type: 'Navigation' } }),
});
async function ouvrirPage(plateforme, extra = {}) {
  const s = monter(extra.monter);
  const c = client(s, plateforme);
  await c.ouvrir(extra.ouvrir);
  await attendre(30);
  const nav = s.cdp.envoyes.find((e) => e.methode === 'Page.navigate');
  assert.ok(nav, 'la page de connexion est ouverte');
  return { s, c, sid: nav.sessionId, cibleId: nav.sessionId.replace(/^s-/, '') };
}
async function ouvrirFenetre(s, cibleId, targetId, url = 'about:blank') {
  s.cdp.emettre({ method: 'Target.targetCreated', params: { targetInfo: { targetId, type: 'page', url, openerId: cibleId } } });
  await attendre(30);
  return pageDe(s, `s-${targetId}`);
}
const GOOGLE_AUTH = 'https://accounts.google.com/o/oauth2/auth?client_id=x&redirect_uri=https%3A%2F%2Fbabytouch-782e4.firebaseapp.com%2F__%2Fauth%2Fhandler&state=s';
const GOOGLE = { nom: 'google' };

test('(19/11, fournisseur Google) fonctions pures : Google reconnu par son adresse (tous ses pays), rien d’autre', () => {
  assert.ok(!pur.erreur, `serveur-cloud/src/fournisseurConnexion.js : ${pur.erreur?.message ?? ''}`);
  const { fournisseurDe, messageFournisseur } = pur;
  for (const u of ['https://accounts.google.com/v3/signin/identifier?x=1', 'https://accounts.google.com/v3/signin/challenge/pwd?TL=x',
    GOOGLE_AUTH, 'https://accounts.google.fr/accounts/SetSID?ssdc=1', 'https://accounts.google.co.uk/accounts/SetSID', 'https://accounts.google.com.br/x',
    'https://www.google.com/accounts/SetSID', 'https://gds.google.com/web/recoveryoptions', 'https://myaccount.google.com/signinoptions/rescuephone',
    'https://accounts.youtube.com/accounts/SetSID']) assert.equal(fournisseurDe(u), 'google', u);
  for (const u of ['https://www.vinted.fr/web/api/auth/google_authorize?state=x', 'https://www.vinted.fr/member/register/select_type?ref_url=%2F',
    'https://babytouch-782e4.firebaseapp.com/__/auth/handler?apiKey=x&providerId=google.com', 'https://auth.leboncoin.fr/login/', 'https://www.beebs.app/fr/auth',
    'https://identity.kiabi.com/oauth/authorize', 'https://appleid.apple.com/auth/authorize', 'https://www.facebook.com/login', 'about:blank',
    'http://accounts.google.com/v3/signin/identifier', 'https://accounts.google.com.exemple.fr/x', 'https://pasgoogle.com/accounts', 'pas une adresse', '', null, undefined])
    assert.equal(fournisseurDe(u), null, String(u));
  assert.deepEqual(messageFournisseur('google', 'vinted'), { t: 'fournisseur', nom: 'google', plateforme: 'vinted' });
  assert.deepEqual(messageFournisseur(null, 'beebs'), { t: 'fournisseur', nom: null, plateforme: 'beebs' });
});

test('(19/11, fournisseur Google) Vinted, Google DANS la page : dit à l’entrée, une fois ; fini au retour ; « mon e-mail » ramène à la page de départ sans rien taper', async () => {
  const { s, c, sid } = await ouvrirPage('vinted');
  const p = pageDe(s, sid);
  p.requete('v1', 'https://www.vinted.fr/member/register/select_type?ref_url=%2F'); p.affiche('https://www.vinted.fr/member/register/select_type?ref_url=%2F');
  await attendre(10);
  assert.equal(c.fournisseurs().length, 0, 'la page de Vinted : rien');
  // « Continuer avec Google » : l'API de Vinted, puis Google (redirections serveur), puis la page du mot de passe.
  p.requete('g1', 'https://www.vinted.fr/web/api/auth/google_authorize?state=x', { networkId: 'n1' });
  await attendre(5);
  assert.equal(c.fournisseurs().length, 0, 'l’API de connexion de Vinted n’est pas Google');
  p.requete('g2', 'https://accounts.google.com/o/oauth2/auth?client_id=x&redirect_uri=https%3A%2F%2Fwww.vinted.fr%2Fmember%2Fauth%2Fgoogle', { networkId: 'n1', redirectedRequestId: 'g1' });
  p.requete('g3', 'https://accounts.google.com/v3/signin/identifier?x', { networkId: 'n1', redirectedRequestId: 'g2' });
  p.affiche('https://accounts.google.com/v3/signin/identifier?x');
  p.affiche('https://accounts.google.com/v3/signin/challenge/pwd?x');
  await attendre(10);
  assert.deepEqual(c.fournisseurs(), [{ t: 'fournisseur', ...GOOGLE, plateforme: 'vinted' }], 'UN message à l’entrée chez Google (rien de plus tant qu’on y reste)');
  assert.ok(s.lignes.some(([n, e, d]) => n === 'info' && e === 'connexion_fournisseur' && d.fournisseur === 'google' && !/[?]/.test(d.vers ?? '')), 'journalisé (adresse sans requête)');
  // Google renvoie sur Vinted : fini.
  p.requete('r1', 'https://www.vinted.fr/member/auth/google?code=x&state=s');
  p.affiche('https://www.vinted.fr/member/auth/google?code=x&state=s');
  await attendre(10);
  assert.deepEqual(c.fournisseurs().map((m) => m.nom), ['google', null], 'la sortie de Google est dite, une fois');
  // L'adresse AFFICHÉE suffit (une navigation de la page, sans requête interceptée) : de nouveau Google.
  p.affiche('https://accounts.google.com/v3/signin/challenge/pwd?y');
  await attendre(10);
  assert.deepEqual(c.fournisseurs().map((m) => m.nom), ['google', null, 'google']);
  // « Me connecter avec mon e-mail Vinted » : la page revient à SA page de départ — rien de tapé, cliqué ni lu.
  const apres = s.depuis();
  await c.dire({ t: 'revenir_plateforme' });
  await attendre(20);
  const faits = apres();
  const navs = faits.filter((e) => e.methode === 'Page.navigate');
  assert.deepEqual(navs.map((e) => [e.params.url, e.sessionId]), [[DEFINITIONS.vinted.pageConnexion, sid]], 'UNE navigation : la page de connexion de départ de Vinted');
  assert.ok(!faits.some((e) => GESTES.includes(e.methode)), 'aucun geste rejoué (ni toucher, ni clic, ni frappe)');
  assert.ok(!faits.some((e) => e.methode === 'Runtime.evaluate'), 'rien n’est lu ni écrit dans la page de Google');
  assert.ok(faits.every((e) => ['Storage.setCookies', 'Page.navigate'].includes(e.methode)), faits.map((e) => e.methode).join(','));
  assert.equal(c.fournisseurs().at(-1).nom, null, 'le bandeau part');
  assert.ok(s.lignes.some(([, e, d]) => e === 'connexion_retour_plateforme' && d.fournisseur === 'google' && d.depuis === 'accounts.google.com/v3/signin/challenge/pwd'));
  // Hors de Google, le même message ne fait RIEN (un toucher égaré ne recharge jamais la page).
  const encore = s.depuis();
  await c.dire({ t: 'revenir_plateforme' });
  await attendre(20);
  assert.deepEqual(encore().filter((e) => e.methode !== 'Runtime.evaluate').map((e) => e.methode), [], 'hors Google : rien');
  assert.ok(s.connexions.connexionsOuvertes().has(U), 'la page reste ouverte');
  assert.ok(!c.etapes().some((e) => ['erreur', 'expire', 'remplacee'].includes(e)), c.etapes().join(','));
  assert.ok(!s.lignes.some(([n]) => n === 'erreur'));
  await c.dire({ t: 'fermer' });
});

test('(19/11, fournisseur Google) Beebs, Google dans une FENÊTRE : entrée, sortie (retour Firebase, fenêtre fermée), et « mon e-mail » ferme la fenêtre Google', async () => {
  const { s, c, sid, cibleId } = await ouvrirPage('beebs');
  // 1. La fenêtre de Beebs (gestionnaire Firebase), puis Google, puis le retour Firebase : entrée et sortie.
  const f1 = await ouvrirFenetre(s, cibleId, 'g-1');
  f1.requete('f0', 'https://babytouch-782e4.firebaseapp.com/__/auth/handler?apiKey=x&providerId=google.com');
  await attendre(10);
  assert.equal(c.fournisseurs().length, 0, 'la fenêtre Firebase de Beebs n’est pas Google');
  f1.requete('f1', GOOGLE_AUTH, { networkId: 'n1' });
  f1.requete('f2', 'https://accounts.google.com/v3/signin/identifier?x', { networkId: 'n1', redirectedRequestId: 'f1' });
  await attendre(10);
  assert.deepEqual(c.fournisseurs(), [{ t: 'fournisseur', ...GOOGLE, plateforme: 'beebs' }], 'Google dans la fenêtre : dit');
  f1.requete('f3', 'https://babytouch-782e4.firebaseapp.com/__/auth/handler?state=s&code=c');
  await attendre(10);
  assert.deepEqual(c.fournisseurs().map((m) => m.nom), ['google', null], 'le retour Firebase : fini');
  s.cdp.emettre({ method: 'Target.targetDestroyed', params: { targetId: 'g-1' } });
  await attendre(10);
  assert.equal(c.fournisseurs().length, 2, 'la fenêtre qui se ferme ensuite : rien de plus');
  // 2. La personne ferme elle-même la fenêtre Google (ou la page la ferme) : fini.
  const f2 = await ouvrirFenetre(s, cibleId, 'g-2', GOOGLE_AUTH);
  await attendre(10);
  assert.equal(c.fournisseurs().at(-1).nom, 'google', 'une fenêtre ouverte DIRECTEMENT sur Google : dit');
  f2.affiche('https://accounts.google.com/v3/signin/challenge/pwd?x');
  s.cdp.emettre({ method: 'Target.targetDestroyed', params: { targetId: 'g-2' } });
  await attendre(10);
  assert.deepEqual(c.fournisseurs().map((m) => m.nom), ['google', null, 'google', null], 'fenêtre Google fermée : fini');
  // 3. « Me connecter avec mon e-mail Beebs » : la fenêtre Google fermée, la page renvoyée à /fr/auth.
  const f3 = await ouvrirFenetre(s, cibleId, 'g-3');
  f3.requete('h1', 'https://accounts.google.com/v3/signin/challenge/pwd?TL=x');
  await attendre(10);
  assert.equal(c.fournisseurs().at(-1).nom, 'google');
  const apres = s.depuis();
  await c.dire({ t: 'revenir_plateforme' });
  await attendre(20);
  const faits = apres();
  assert.deepEqual(faits.filter((e) => e.methode === 'Target.closeTarget').map((e) => e.params.targetId), ['g-3'], 'la fenêtre Google est fermée');
  assert.deepEqual(faits.filter((e) => e.methode === 'Page.navigate').map((e) => [e.params.url, e.sessionId]), [[DEFINITIONS.beebs.pageConnexion, sid]], 'la page de Beebs revient à /fr/auth');
  assert.ok(!faits.some((e) => GESTES.includes(e.methode) || e.methode === 'Runtime.evaluate'), 'rien de tapé, cliqué ni lu');
  assert.equal(c.fournisseurs().at(-1).nom, null, 'le bandeau part');
  s.cdp.emettre({ method: 'Target.targetDestroyed', params: { targetId: 'g-3' } });
  await attendre(10);
  assert.ok(s.connexions.connexionsOuvertes().has(U), 'la connexion continue (la page de Beebs n’est pas fermée)');
  assert.equal(c.fournisseurs().at(-1).nom, null);
  await c.dire({ t: 'fermer' });
});

test('(19/11, fournisseur Google) fin du bandeau : connectée, page fermée ; la reprise le redit ; rien d’autre ne change sans Google', async () => {
  // Connectée pendant que la fenêtre Google est encore là : le bandeau part AVANT « connecté ».
  {
    const { s, c, cibleId } = await ouvrirPage('leboncoin');
    const f = await ouvrirFenetre(s, cibleId, 'g-1');
    f.requete('a', 'https://accounts.google.com/v3/signin/identifier');
    await attendre(10);
    assert.equal(c.fournisseurs().at(-1)?.nom, 'google');
    s.page.cookies = [{ name: '__Secure-Login', value: 'jeton', domain: '.leboncoin.fr', path: '/' }];
    s.page.lecture = { http: 200, id: 'compte' };
    await c.dire({ t: 'termine' });
    await attendre(30);
    const i = c.recus.findIndex((m) => m.t === 'etat' && m.etape === 'connecte');
    const j = c.recus.findLastIndex((m) => m.t === 'fournisseur');
    assert.ok(i > 0 && j >= 0 && j < i && c.recus[j].nom === null, 'le bandeau part avant « connecté »');
    await attendre(1600);
  }
  // Partie (app en arrière-plan) pendant Google : la page reprise redit Google ; fermée : le bandeau part.
  {
    const { s, c, sid } = await ouvrirPage('vinted');
    pageDe(s, sid).affiche('https://accounts.google.com/v3/signin/identifier');
    await attendre(10);
    c.ws.close(1006);
    await attendre(10);
    const c2 = client(s, 'vinted');
    await c2.ouvrir({ reprise: true });
    await attendre(20);
    assert.ok(c2.etapes().includes('pret'), 'reprise');
    assert.deepEqual(c2.fournisseurs(), [{ t: 'fournisseur', ...GOOGLE, plateforme: 'vinted' }], 'la page reprise redit Google');
    await c2.dire({ t: 'fermer' });
    await attendre(10);
    assert.equal(c2.fournisseurs().at(-1).nom, null, 'fermée : le bandeau part');
  }
  // Sans Google : la plateforme, Kiabi, Apple, Facebook — AUCUN message nouveau, et les autres messages comme avant.
  {
    const { s, c, sid, cibleId } = await ouvrirPage('beebs');
    const p = pageDe(s, sid);
    p.requete('b1', 'https://www.beebs.app/fr/auth'); p.affiche('https://www.beebs.app/fr/auth');
    const k = await ouvrirFenetre(s, cibleId, 'kiabi');
    k.requete('k1', 'https://identity.kiabi.com/oauth/authorize?client_id=x&redirect_uri=https%3A%2F%2Fbabytouch-782e4.firebaseapp.com%2F__%2Fauth%2Fhandler');
    k.affiche('https://www.kiabi.com/account/auth');
    s.cdp.emettre({ method: 'Target.targetDestroyed', params: { targetId: 'kiabi' } });
    const a = await ouvrirFenetre(s, cibleId, 'apple', 'https://appleid.apple.com/auth/authorize?client_id=x');
    a.affiche('https://appleid.apple.com/auth/authorize?client_id=x');
    await c.dire({ t: 'toucher', type: 'debut', x: 10, y: 10 });
    await c.dire({ t: 'toucher', type: 'fin', x: 10, y: 10 });
    await c.dire({ t: 'texte', s: 'a' });
    await attendre(420);                             // le clavier est relu 350 ms après le geste, comme avant
    assert.equal(c.fournisseurs().length, 0, 'aucun message « fournisseur » hors de Google');
    assert.deepEqual([...new Set(c.recus.map((m) => m.t))].sort(), ['clavier', 'etat'], 'seuls les messages d’avant');
    assert.ok(s.cdp.envoyes.some((e) => e.methode === 'Input.dispatchMouseEvent') && s.cdp.envoyes.some((e) => e.methode === 'Input.insertText'), 'les gestes passent comme avant');
    const avant = s.depuis();
    await c.dire({ t: 'revenir_plateforme' });
    await attendre(20);
    assert.deepEqual(avant().map((e) => e.methode), [], '« revenir » hors de Google : rien');
    await c.dire({ t: 'fermer' });
    await attendre(10);
    assert.equal(c.fournisseurs().length, 0, 'ni à la fermeture');
  }
});

test('(19/11, fournisseur Google) « Résoudre la vérification » : jamais de bandeau, « revenir » sans effet', async () => {
  const verifications = { blocageDe: () => ({ nature: 'glissiere', le: '2026-11-19T10:00:00Z' }), rouvrir: async () => true, revenue: async () => {}, requalifier: async () => {}, sessionFermee: async () => {} };
  const { s, c, sid } = await ouvrirPage('leboncoin', { monter: { verifications }, ouvrir: { mode: 'resoudre' } });
  pageDe(s, sid).affiche('https://accounts.google.com/v3/signin/identifier');
  await attendre(10);
  const avant = s.depuis();
  await c.dire({ t: 'revenir_plateforme' });
  await attendre(20);
  assert.equal(c.fournisseurs().length, 0, 'aucun message « fournisseur » en « Résoudre »');
  assert.ok(!avant().some((e) => e.methode === 'Page.navigate' || e.methode === 'Target.closeTarget'), 'aucune navigation');
  await c.dire({ t: 'fermer' });
});

// ── Bout à bout : le VRAI client de l'app (clientConnexion.js) sur une VRAIE WebSocket, et l'automate de l'écran ────────
function conteneurSimule() {
  const element = (tag) => ({ tagName: tag.toUpperCase(), style: {}, value: '', autocomplete: '', setAttribute() {}, removeAttribute() {},
    addEventListener() {}, getContext: () => ({ drawImage() {} }), focus() {}, setSelectionRange() {}, getBoundingClientRect: () => ({ left: 0, top: 0, width: 390, height: 780 }) });
  const doc = { defaultView: { devicePixelRatio: 2 }, createElement: element, addEventListener() {} };
  return { ownerDocument: doc, clientWidth: 390, clientHeight: 780, style: {}, enfants: [], appendChild(x) { this.enfants.push(x); }, set innerHTML(_) { this.enfants = []; } };
}

test('(19/11, fournisseur Google) bout à bout : le client de l’app transmet l’état à l’écran, et son bouton ramène la page à Vinted', async () => {
  assert.equal(typeof globalThis.WebSocket, 'function', 'WebSocket de Node');
  const { ouvrirConnexion } = await import('../../src/cloud/connexion/clientConnexion.js');
  const { creerSuiviVue } = await import('../../src/cloud/connexion/suiviVue.js');
  const s = monter();
  const http = createServer();
  const wss = new WebSocketServer({ server: http, path: '/connexion/ws' });
  wss.on('connection', (socket) => s.connexions.brancher(socket, 'https://fillsell.app'));
  await new Promise((r) => http.listen(0, '127.0.0.1', r));
  const faits = [];
  const agir = {};
  for (const k of ['clavier', 'cookies', 'code', 'message', 'verifiee', 'fin', 'pause', 'reprendre', 'fermerApres', 'fournisseur']) agir[k] = (...a) => faits.push([k, ...a]);
  const suivi = creerSuiviVue({ finales: ['connecte', 'expire', 'erreur', 'remplacee'], agir });
  const session = ouvrirConnexion({ url: `ws://127.0.0.1:${http.address().port}/connexion/ws`, ticket: signerTicket({ user: U }, CLE), plateforme: 'vinted',
    conteneur: conteneurSimule(), lang: 'fr', surEtat: (e, m, info) => suivi.etape(e, m, info) });
  try {
    const jusqua = async (f, ms = 2000) => { const fin = Date.now() + ms; while (Date.now() < fin && !f()) await attendre(10); return f(); };
    assert.ok(await jusqua(() => s.cdp.envoyes.some((e) => e.methode === 'Page.navigate')), 'la page de connexion s’ouvre');
    const sid = s.cdp.envoyes.find((e) => e.methode === 'Page.navigate').sessionId;
    assert.ok(await jusqua(() => faits.some(([k, m]) => k === 'message' && /Connecte-toi comme d'habitude/.test(m))), 'l’écran suit le serveur');
    pageDe(s, sid).requete('g1', 'https://accounts.google.com/v3/signin/challenge/pwd?TL=x');
    assert.ok(await jusqua(() => faits.some(([k]) => k === 'fournisseur')), 'l’écran reçoit l’état « fournisseur »');
    assert.deepEqual(faits.filter(([k]) => k === 'fournisseur'), [['fournisseur', { nom: 'google', plateforme: 'vinted' }]], 'Google, pour Vinted');
    assert.ok(!faits.some(([k, m]) => k === 'message' && typeof m !== 'string'), 'jamais pris pour un message de la ligne d’état');
    assert.equal(typeof session.revenirPlateforme, 'function', 'le client a le geste « revenir à la page de la plateforme »');
    const apres = s.depuis();
    session.revenirPlateforme();
    assert.ok(await jusqua(() => apres().some((e) => e.methode === 'Page.navigate')), 'le serveur reçoit le geste');
    assert.deepEqual(apres().filter((e) => e.methode === 'Page.navigate').map((e) => e.params.url), [DEFINITIONS.vinted.pageConnexion], 'retour à la page de départ de Vinted');
    assert.ok(await jusqua(() => faits.filter(([k]) => k === 'fournisseur').length === 2), 'la fin est transmise');
    assert.deepEqual(faits.filter(([k]) => k === 'fournisseur').at(-1), ['fournisseur', null], 'le bandeau part');
    assert.ok(!faits.some(([k]) => ['fin', 'pause', 'reprendre'].includes(k)), 'aucune fin, aucune pause, aucune reprise');
  } finally {
    session.fermer();
    await attendre(30);
    wss.close(); http.close();
  }
});
