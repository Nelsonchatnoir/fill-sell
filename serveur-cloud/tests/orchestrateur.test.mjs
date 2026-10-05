// Tests de l'orchestrateur FillSell Cloud — les parties PURES (aucun réseau,
// aucun Docker, aucune base) : `npm test` dans serveur-cloud/ (node --test).
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { navigationPermise, estConnectee, identifiantCompte, versCookieParam, PLATEFORMES_CLOUD, urlPourJournal } from '../src/plateformes.js';
import { chiffrer, dechiffrer, creerCoffre } from '../src/coffre.js';
import { signerTicket, verifierTicket } from '../src/tickets.js';
import { planifierPostes, resumerJobs } from '../src/planificateur.js';
import { specConteneur, corpsSession, nomConteneur } from '../src/navigateur.js';
import { masquer } from '../src/journal.js';
import { lireConfig } from '../src/config.js';
import { idExtensionDepuisCle, sessionPourExtension } from '../src/sessionFillsell.js';
import { MESSAGES } from '../src/connexion.js';
import { chargerRegles } from '../src/regles.js';
import { socleAbsent, creerGardeSocle } from '../src/socle.js';

const jwt = (o) => `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify(o)).toString('base64url')}.c2lnbmF0dXJlLWZhdXNzZQ`;
const U = '0f0e0d0c-0b0a-4908-8706-050403020100';

test('plateformes : le Cloud ne sert que Vinted, Leboncoin, Beebs (eBay par l\'API, Opla sort le 10/10)', () => {
  assert.deepEqual([...PLATEFORMES_CLOUD], ['vinted', 'leboncoin', 'beebs']);
});

test('navigation : seule la connexion (et les fournisseurs Apple / Google / Facebook) est permise', () => {
  assert.equal(navigationPermise('vinted', 'https://www.vinted.fr/member/signup/select_type?ref_url=%2F'), true);
  assert.equal(navigationPermise('vinted', 'https://www.vinted.fr/'), true);
  assert.equal(navigationPermise('vinted', 'https://www.vinted.fr/catalog?search_text=nike'), false, 'le catalogue : refusé');
  assert.equal(navigationPermise('vinted', 'https://www.vinted.fr/items/123'), false, 'une annonce : refusée');
  assert.equal(navigationPermise('vinted', 'https://appleid.apple.com/auth/authorize?x=1'), true, 'Apple : sa page à lui');
  assert.equal(navigationPermise('vinted', 'https://accounts.google.com/o/oauth2/v2/auth'), true);
  assert.equal(navigationPermise('vinted', 'https://www.leboncoin.fr/'), false, 'une autre plateforme : refusée');
  assert.equal(navigationPermise('vinted', 'https://evil.example/vinted.fr'), false);
  assert.equal(navigationPermise('vinted', 'http://www.vinted.fr/'), false, 'jamais en clair');
  assert.equal(navigationPermise('leboncoin', 'https://auth.leboncoin.fr/login/?client_id=lbc'), true);
  assert.equal(navigationPermise('leboncoin', 'https://www.leboncoin.fr/recherche?text=velo'), false);
  assert.equal(navigationPermise('beebs', 'https://www.beebs.app/fr/login'), true);
  assert.equal(navigationPermise('beebs', 'https://www.beebs.app/fr/listing/42'), false);
  assert.equal(navigationPermise('opla', 'https://www.opla.co/'), false, 'Opla : jamais');
  assert.equal(navigationPermise('vinted', 'about:blank'), true);
  assert.equal(urlPourJournal('https://www.vinted.fr/member/login?token=SECRET'), 'www.vinted.fr/member/login', 'le journal ne garde jamais la requête');
});

test('connectée pour de vrai : un visiteur invité ne compte jamais', () => {
  const vinted = (sub) => [{ name: 'access_token_web', value: jwt({ sub }), domain: '.vinted.fr' }, { name: 'refresh_token_web', value: 'r', domain: '.vinted.fr' }];
  assert.equal(estConnectee(vinted(123), 'vinted'), true);
  assert.equal(estConnectee(vinted(null), 'vinted'), false, 'jeton sans utilisateur = invité');
  assert.equal(estConnectee([{ name: 'access_token_web', value: jwt({ sub: 1 }), domain: '.vinted.fr' }], 'vinted'), false, 'sans refresh token');
  assert.equal(estConnectee(vinted(123), 'leboncoin'), false, 'les cookies d\'une plateforme ne valent pas pour une autre');
  assert.equal(estConnectee([{ name: '__Secure-Login', value: 'x', domain: '.leboncoin.fr' }], 'leboncoin'), true);
  assert.equal(estConnectee([{ name: 'access_token', value: jwt({ sub: 'b1', role: 'guest' }), domain: '.beebs.app' }], 'beebs'), false, 'Beebs invité');
  assert.equal(estConnectee([{ name: 'access_token', value: jwt({ sub: 'b1', role: 'user' }), domain: '.beebs.app' }], 'beebs'), true);
  assert.equal(identifiantCompte(vinted(250623918), 'vinted'), '250623918');
});

test('cookie à poser : un cookie échu ne revient jamais', () => {
  assert.equal(versCookieParam({ name: 'a', value: 'b', domain: '.vinted.fr', path: '/', expires: 1000 }, 2_000_000), null);
  const p = versCookieParam({ name: 'a', value: 'b', domain: '.vinted.fr', path: '/', expires: 4_000_000_000, sameSite: 'Lax', session: false }, Date.now());
  assert.equal(p.sameSite, 'Lax');
  assert.equal(p.expires, 4_000_000_000);
});

test('coffre : AES-256-GCM, lié au compte ET à la plateforme', () => {
  const cle = randomBytes(32);
  const c = chiffrer({ cookies: [{ name: 'x', value: 'secret' }] }, cle, { user: U, plateforme: 'vinted' });
  assert.ok(!c.chiffre.includes('secret'));
  assert.deepEqual(dechiffrer(c, cle, { user: U, plateforme: 'vinted' }).cookies[0].value, 'secret');
  assert.throws(() => dechiffrer(c, cle, { user: U, plateforme: 'leboncoin' }), 'recollé sur une autre plateforme : refusé');
  assert.throws(() => dechiffrer(c, cle, { user: '11111111-1111-4111-8111-111111111111', plateforme: 'vinted' }), 'recollé sur un autre compte : refusé');
  assert.throws(() => dechiffrer(c, randomBytes(32), { user: U, plateforme: 'vinted' }), 'autre clé : refusé');
  assert.match(c.iv, /^[A-Za-z0-9+/=]{16}$/, 'IV au format de la colonne (CHECK)');
});

test('coffre : une plateforme déconnectée ne touche jamais sa sauvegarde ; la restauration ne remplace jamais un profil connecté', async () => {
  const lignes = new Map();
  const base = { rpc: async (nom, a) => {
    if (nom === 'cloud_coffre_ecrire') { lignes.set(a.p_plateforme, { plateforme: a.p_plateforme, chiffre: a.p_chiffre, iv: a.p_iv, connecte: a.p_connecte }); return { error: null }; }
    if (nom === 'cloud_coffre_lire') return { data: [...lignes.values()], error: null };
    return { data: null, error: null };
  } };
  const coffre = creerCoffre({ base, cle: randomBytes(32).toString('base64') });
  const cookies = [{ name: 'access_token_web', value: jwt({ sub: 7 }), domain: '.vinted.fr' }, { name: 'refresh_token_web', value: 'r', domain: '.vinted.fr' }];
  const b = await coffre.sauvegarderCookies(U, cookies);
  assert.equal(b.vinted, 'sauvegardee(2)');
  assert.equal(b.leboncoin, 'absente');
  assert.equal(lignes.size, 1);
  const r1 = await coffre.cookiesARestaurer(U, []);
  assert.equal(r1.bilan.vinted, 'restauree(2)');
  const r2 = await coffre.cookiesARestaurer(U, cookies);
  assert.equal(r2.bilan.vinted, 'profil');
  assert.equal(r2.aPoser.length, 0);
});

test('tickets : signés, liés à un compte, échus au bout du délai', () => {
  const cle = randomBytes(32).toString('base64');
  const t = signerTicket({ user: U, minutes: 30 }, cle);
  assert.equal(verifierTicket(t, cle), U);
  assert.equal(verifierTicket(t, randomBytes(32).toString('base64')), null, 'autre clé');
  assert.equal(verifierTicket(t.slice(0, -2) + 'AA', cle), null, 'falsifié');
  assert.equal(verifierTicket(t, cle, Date.now() + 31 * 60_000), null, 'échu');
  assert.throws(() => signerTicket({ user: 'pas-un-uuid' }, cle));
});

test('planificateur : délai NON tranché = continu ; jamais coupé au milieu d\'un job ; capacité ; garde CPU', () => {
  const T = Date.parse('2026-10-05T12:00:00Z');
  const comptes = [{ user_id: 'a', etat_cloud: 'essai' }, { user_id: 'b', etat_cloud: 'paye' }, { user_id: 'c', etat_cloud: 'essai_termine' }];
  // continu
  let d = planifierPostes({ comptes, delaiMin: null, navigateursMax: 5, maintenant: T });
  assert.deepEqual(d.ouvrir.map((o) => o.user).sort(), ['a', 'b'], 'continu : les actifs ; la grâce n\'allume rien');
  // délai de 30 min : rien sans motif juste après une session
  d = planifierPostes({ comptes, delaiMin: 30, dernieresFins: new Map([['a', T - 10 * 60_000], ['b', T - 40 * 60_000]]), navigateursMax: 5, maintenant: T });
  assert.deepEqual(d.ouvrir.map((o) => o.user), ['b'], 'b : 40 min depuis sa dernière session → relecture');
  // un job attend → tout de suite
  d = planifierPostes({ comptes, delaiMin: 30, jobs: new Map([['a', { attente: 1, retraits: 0, enCours: 0 }]]), dernieresFins: new Map([['a', T - 60_000], ['b', T - 60_000]]), navigateursMax: 5, maintenant: T });
  assert.deepEqual(d.ouvrir.map((o) => o.user), ['a']);
  // jamais coupé au milieu d'un job, même compte inactif
  d = planifierPostes({ comptes: [], ouverts: new Map([['z', { ouvertLe: T - 3600_000 }]]), jobs: new Map([['z', { enCours: 1 }]]), navigateursMax: 5, maintenant: T });
  assert.equal(d.fermer.length, 0, 'un job en cours garde son navigateur');
  d = planifierPostes({ comptes: [], ouverts: new Map([['z', { ouvertLe: T }]]), navigateursMax: 5, maintenant: T });
  assert.deepEqual(d.fermer, [{ user: 'z', raison: 'compte_inactif' }]);
  // capacité : priorités
  d = planifierPostes({ comptes: [{ user_id: 'p', etat_cloud: 'paye' }, { user_id: 'q', etat_cloud: 'paye' }], delaiMin: null,
    jobs: new Map([['q', { attente: 1, retraits: 1, enCours: 0 }]]), navigateursMax: 1, maintenant: T });
  assert.deepEqual(d.ouvrir.map((o) => o.user), ['q'], 'le retrait passe avant la relecture continue');
  assert.deepEqual(d.refuses, [{ user: 'p', raison: 'capacite' }]);
  // garde CPU : au-dessus de 50 %, seule une connexion démarre
  d = planifierPostes({ comptes, delaiMin: null, cpuPct: 72, cpuPause: 50, connexions: new Set(['b']), navigateursMax: 5, maintenant: T });
  assert.deepEqual(d.ouvrir.map((o) => o.user), ['b']);
  assert.deepEqual(d.refuses, [{ user: 'a', raison: 'cpu_base' }]);
  // une connexion sans place prend celle d'une session continue
  d = planifierPostes({ comptes: [{ user_id: 'x', etat_cloud: 'paye' }, { user_id: 'y', etat_cloud: 'essai' }], ouverts: new Map([['x', { ouvertLe: T - 3600_000 }]]),
    connexions: new Set(['y']), delaiMin: null, navigateursMax: 1, maintenant: T });
  assert.deepEqual(d.fermer, [{ user: 'x', raison: 'place_pour_une_connexion' }]);
  assert.deepEqual(d.ouvrir, [{ user: 'y', motif: 'connexion' }]);
});

test('jobs : une attente programmée plus tard ne réveille personne', () => {
  const T = Date.now();
  const r = resumerJobs([
    { user_id: 'a', status: 'pending', action: 'delete', platform_fields: {} },
    { user_id: 'a', status: 'pending', action: 'publish', platform_fields: { next_action_after: new Date(T + 3600_000).toISOString() } },
    { user_id: 'b', status: 'processing', action: 'publish', platform_fields: {} },
  ], T);
  assert.deepEqual(r.get('a'), { attente: 1, retraits: 1, enCours: 0 });
  assert.deepEqual(r.get('b'), { attente: 0, retraits: 0, enCours: 1 });
});

test('conteneur : profil du compte au seul chemin « persist », navigateur au repos sur un profil vide, image épinglée', () => {
  const config = { imageNavigateur: 'fillsell-navigateur:0123456789ab', dossierProfils: '/srv/p', dossierExtension: '/srv/e', memoireNavigateur: '1400m', reseauDocker: 'fillsell-cloud' };
  const s = specConteneur({ config, user: U, profilId: 'p-x' });
  assert.ok(s.Env.includes('CHROME_USER_DATA_DIR=/tmp/navigateur-au-repos'), 'verrou 1 : le navigateur au repos n\'a jamais le profil du compte');
  assert.ok(s.HostConfig.Binds.includes('/srv/p/p-x:/app/api/user-data-dir'), 'verrou 2 : profil monté au chemin « persist »');
  assert.ok(s.HostConfig.Binds.includes('/srv/e:/app/api/extensions/fillsell:ro'), 'extension en lecture seule');
  assert.ok(s.Env.some((e) => e.startsWith('CHROME_ARGS=') && e.includes('--lang=fr-FR')), 'navigateur en français (le 26/09 : en-US)');
  assert.equal(s.HostConfig.NetworkMode, 'fillsell-cloud', 'réseau filtré par le pare-feu (verrou 3)');
  assert.equal(nomConteneur(U), `fs-nav-${U}`);
  assert.throws(() => corpsSession({ proxyUrl: '' }), 'jamais de session sans proxy');
  assert.throws(() => corpsSession({ proxyUrl: 'http://194.152.141.98:12323' }), 'proxy sans identifiants : refusé');
  const c = corpsSession({ proxyUrl: 'http://u:p@194.152.141.98:12323' });
  assert.equal(c.persist, true);
  assert.equal(c.skipFingerprintInjection, true, 'empreinte réelle, stable d\'un onglet à l\'autre (26/09)');
  assert.deepEqual(c.extensions, ['fillsell']);
  assert.equal(c.timezone, 'Europe/Paris');
});

test('journal : aucun secret ne sort', () => {
  const s = masquer(JSON.stringify({ a: jwt({ sub: 1 }), u: 'http://user:pass@1.2.3.4:12323', refresh_token: 'abcdef', h: 'Bearer abcdefghijklmnop' }));
  assert.ok(!s.includes('user:pass'));
  assert.ok(!s.includes('abcdef"'));
  assert.ok(!/eyJ[A-Za-z0-9_-]{8,}\./.test(s));
  assert.ok(!s.includes('abcdefghijklmnop'));
});

test('configuration : sans secret, refus de démarrer ; image flottante refusée', () => {
  assert.throws(() => lireConfig({}), /configuration incomplète/);
  const env = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 's', SUPABASE_ANON_KEY: 'a',
    COFFRE_CLE: randomBytes(32).toString('base64'), TICKETS_CLE: randomBytes(32).toString('base64'), IMAGE_NAVIGATEUR: 'ghcr.io/steel-dev/steel-browser:latest' };
  assert.throws(() => lireConfig(env), /épinglée/);
  const c = lireConfig({ ...env, IMAGE_NAVIGATEUR: 'fillsell-navigateur:0123456789abcdef' });
  assert.equal(c.iproyalAchatsAutorises, false, 'achats IPRoyal coupés par défaut');
  assert.equal(c.alertesMail, false, 'mails d\'alerte coupés par défaut');
  assert.equal(c.cpuPauseAuDessus, 50, 'garde CPU à 50 %');
});

test('session FillSell : jamais celle d\'un autre compte ; identifiant d\'extension stable', () => {
  assert.throws(() => sessionPourExtension({ access_token: jwt({ sub: 'autre' }), refresh_token: 'r' }, U));
  const s = sessionPourExtension({ access_token: jwt({ sub: U, session_id: 's1' }), refresh_token: 'r', expires_in: 3600, user: { email: 'n@x.fr' } }, U);
  assert.equal(s.email, 'n@x.fr');
  assert.match(idExtensionDepuisCle(randomBytes(294).toString('base64')), /^[a-p]{32}$/);
});

test('messages : français et anglais, tutoiement, jamais « pépites »', () => {
  for (const l of ['fr', 'en']) for (const [k, v] of Object.entries(MESSAGES[l])) {
    const t = typeof v === 'function' ? v('Vinted') : v;
    assert.ok(t.length > 5, k);
    assert.ok(!/pépite/i.test(t));
  }
  assert.ok(!/\bvous\b/i.test(Object.values(MESSAGES.fr).map((v) => (typeof v === 'function' ? v('X') : v)).join(' ')), 'tutoiement');
});

test('règles du pool : une seule source (cloud-pool.js)', async () => {
  const r = await chargerRegles();
  assert.equal(typeof r.planDuJour, 'function');
  assert.equal(r.PARAMETRES.reposJours, 7);
});

test('socle absent (serveur déployé avant la migration) : dit UNE fois, puis une tentative toutes les 10 min', () => {
  assert.equal(socleAbsent(new Error('cloud_comptes_a_servir : Could not find the function public.cloud_comptes_a_servir without parameters in the schema cache')), true);
  assert.equal(socleAbsent({ message: 'PGRST202' }), true);
  assert.equal(socleAbsent(new Error('function public.cloud_pool_entretien() does not exist')), true);
  assert.equal(socleAbsent(new Error('fetch failed')), false, 'une panne réseau reste une erreur ordinaire');
  let t = 0; const dits = [];
  const g = creerGardeSocle({ journal: { info: (e) => dits.push(e) }, maintenant: () => t, nom: 'planificateur' });
  assert.equal(g.passer(), false);
  assert.equal(g.noter(new Error('PGRST202')), true);
  assert.equal(g.passer(), true, 'le tour suivant est sauté');
  t = 9 * 60_000; assert.equal(g.passer(), true);
  t = 10 * 60_000; assert.equal(g.passer(), false, '10 min après : on réessaie');
  g.noter(new Error('PGRST202'));
  assert.deepEqual(dits, ['socle_absent'], 'dit une seule fois');
  g.present();
  assert.deepEqual(dits, ['socle_absent', 'socle_present']);
  assert.equal(g.passer(), false);
  assert.equal(g.noter(new Error('fetch failed')), false, 'autre erreur : le garde ne la cache pas');
});
