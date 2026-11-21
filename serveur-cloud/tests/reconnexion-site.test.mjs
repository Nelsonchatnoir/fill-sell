// (20/11/2026, lot « problèmes », point 5 de Nico — compte 2f8b09d2) UNE CONNEXION « À RECONNECTER » POUR UN JETON COURT NON
// RENOUVELÉ N'EST PAS UNE SESSION FERMÉE : elle reste joignable au relais, sa session n'est pas purgée tant que le jeton
// long est vivant, et le coffre redevient « connecté » dès que le SITE a renouvelé le jeton court.
// Le cas : Beebs passé « à reconnecter » le 18/11 19:47 (cause jeton_non_renouvele) ; le relais ne permettait plus que
// leboncoin,vinted (PLATEFORMES_PERMISES = le coffre connecté) → chaque visite de renouvellement : 403 du relais, page
// d'erreur ERR_TUNNEL_CONNECTION_FAILED (10 essais le 20/11 de 04:37 à 08:59) → « à reconnecter » pour toujours, et la
// session purgée à la réouverture suivante (compte 13e274de : plus aucun jeton Beebs depuis le 14/11).
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { creerCoffre, plateformesARenouveler, CAUSES_A_RENOUVELER } from '../src/coffre.js';

const jwt = (o) => `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify(o)).toString('base64url')}.c2lnbmF0dXJlLWZhdXNzZQ`;
const U = '2f8b09d2-0000-4000-8000-000000000000';

// Une fausse base : cloud_coffre en mémoire, par les RPC (écriture, lecture) et par from().update() (à reconnecter).
function fausseBase() {
  const lignes = new Map();
  const base = {
    lignes,
    rpc: async (nom, a) => {
      if (nom === 'cloud_coffre_ecrire') { lignes.set(a.p_plateforme, { plateforme: a.p_plateforme, chiffre: a.p_chiffre, iv: a.p_iv, connecte: a.p_connecte, maj_le: new Date().toISOString() }); return { error: null }; }
      if (nom === 'cloud_coffre_lire') return { data: [...lignes.values()], error: null };
      return { data: null, error: null };
    },
    from: () => {
      const filtres = {};
      let maj = null;
      const chaine = {
        update: (v) => { maj = v; return chaine; },
        eq: (k, v) => { filtres[k] = v; return chaine; },
        select: async () => {
          const l = lignes.get(filtres.plateforme);
          if (!l || ('connecte' in filtres && l.connecte !== filtres.connecte)) return { data: [], error: null };
          Object.assign(l, maj);
          return { data: [{ plateforme: filtres.plateforme }], error: null };
        },
      };
      return chaine;
    },
  };
  return base;
}

const longBeebs = { name: 'refresh_token', value: 'opaque', domain: 'www.beebs.app', expires: Math.floor(Date.now() / 1000) + 300 * 86400 };
const courtBeebs = { name: 'access_token', value: jwt({ sub: 'u1', user_id: 'u1', exp: Math.floor(Date.now() / 1000) + 3600 }), domain: 'www.beebs.app' };

test('à reconnecter pour un jeton non renouvelé : joignable, gardé, reconnecté par le site', async () => {
  const base = fausseBase();
  const coffre = creerCoffre({ base, cle: randomBytes(32).toString('base64') });
  await coffre.ecrire(U, 'beebs', { le: 'x', cookies: [longBeebs, courtBeebs] }, true);
  assert.equal(await coffre.aReconnecter(U, 'beebs', { cause: 'jeton_non_renouvele' }), true, 'le verrou de l’extension la passe « à reconnecter »');
  const lu = await coffre.lire(U);
  assert.equal(lu.beebs.connecte, false);
  assert.deepEqual(plateformesARenouveler(lu), ['beebs'], 'cause jeton_non_renouvele : à renouveler (relais permis, pas de purge)');
  // Jeton long seul (« a_renouveler ») : rien n'est réécrit — la preuve viendra du site.
  const b1 = await coffre.sauvegarderCookies(U, [longBeebs]);
  assert.equal(b1.beebs, 'non_verifiee');
  assert.equal(base.lignes.get('beebs').connecte, false);
  // Le site a renouvelé le jeton court : connecté de nouveau, par la preuve de la plateforme.
  const b2 = await coffre.sauvegarderCookies(U, [longBeebs, courtBeebs]);
  assert.equal(b2.beebs, 'reconnectee_par_le_site(2)');
  assert.equal(base.lignes.get('beebs').connecte, true);
  assert.deepEqual(plateformesARenouveler(await coffre.lire(U)), [], 'reconnectée : plus à renouveler');
});

test('une vraie session fermée, une vérification, une ligne illisible : rien ne change', async () => {
  assert.deepEqual(CAUSES_A_RENOUVELER, ['jeton_non_renouvele']);
  assert.deepEqual(plateformesARenouveler({ beebs: { connecte: false, cause: 'session_fermee' } }), [], 'session fermée : purgée et fermée comme avant');
  assert.deepEqual(plateformesARenouveler({ beebs: { connecte: false, cause: 'jeton_non_renouvele', bloquee: { source: 'x' } } }), [], 'en vérification : la règle du 01/11');
  assert.deepEqual(plateformesARenouveler({ beebs: { illisible: true, connecte: false, cause: 'jeton_non_renouvele' } }), []);
  assert.deepEqual(plateformesARenouveler({ beebs: { connecte: true, cause: 'jeton_non_renouvele' } }), [], 'connectée : rien à renouveler');
  assert.deepEqual(plateformesARenouveler(null), []);
  const base = fausseBase();
  const coffre = creerCoffre({ base, cle: randomBytes(32).toString('base64') });
  await coffre.ecrire(U, 'beebs', { le: 'x', cookies: [longBeebs, courtBeebs] }, true);
  await coffre.aReconnecter(U, 'beebs', { cause: 'session_fermee' });
  assert.equal((await coffre.sauvegarderCookies(U, [longBeebs, courtBeebs])).beebs, 'non_verifiee', 'session fermée : seule une connexion vérifiée la rouvre');
  assert.equal(base.lignes.get('beebs').connecte, false);
});

test('postes.js : le relais permet les plateformes à renouveler, la purge les garde tant que le jeton long est vivant', () => {
  const src = readFileSync(new URL('../src/postes.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  assert.match(src, /const aRenouveler = plateformesARenouveler\(await coffre\.lire\(user\)\.catch\(\(\) => null\)\);/);
  assert.match(src, /permises: \[\.\.\.new Set\(\[\.\.\.\(compte\?\.plateformes_connectees \?\? \[\]\), \.\.\.aRenouveler\]\)\] \}\);/);
  assert.match(src, /await purgerSessions\(user, h, cookies, \[\.\.\.connectees, \.\.\.bloquees, \.\.\.aRenouveler\.filter\(\(p\) => estConnectee\(cookies, p\)\)\]\);/);
});

// ── (21/11/2026 midi, point 2 de Nico) JAMAIS « reconnecte-toi » SANS LA PLATEFORME : la session lue sur le moment ─────────
import { verdictReleve, HORS_SITE_STABLE_MS } from '../src/lectureSession.js';

test('(21/11) lectureSession : ok sur un compte lu ; perdue seulement si la plateforme le dit ; tout le reste sans conclusion', () => {
  const sur = { hote: 'www.leboncoin.fr', pret: true };
  assert.equal(verdictReleve('leboncoin', { etat: sur, lu: { http: 200, id: '42' } }).issue, 'ok');
  // Le jeton « luat » arrive après le chargement : on attend la fin de l'attente avant de dire « perdue ».
  assert.equal(verdictReleve('leboncoin', { etat: sur, lu: { http: 0, motif: 'sans_jeton' } }).issue, null);
  assert.equal(verdictReleve('leboncoin', { etat: sur, lu: { http: 0, motif: 'sans_jeton' }, fin: true }).issue, 'perdue');
  assert.equal(verdictReleve('vinted', { etat: { hote: 'www.vinted.fr', pret: true }, lu: { http: 401, id: null }, fin: true }).issue, 'perdue');
  for (const http of [403, 429, 500, 0]) {
    assert.equal(verdictReleve('vinted', { etat: { hote: 'www.vinted.fr', pret: true }, lu: { http, id: null, ...(http ? {} : { motif: 'reseau' }) }, fin: true }).issue, 'incertaine', `http ${http}`);
  }
  // Anti-robot : jamais une conclusion (ni perdue ni ok).
  assert.equal(verdictReleve('beebs', { etat: { hote: 'www.beebs.app', pret: true, captcha: true } }).issue, 'incertaine');
  assert.equal(verdictReleve('beebs', { etat: { hote: 'www.beebs.app', pret: true, bloque: true } }).issue, 'incertaine');
  // Renvoyée sur la page de connexion de la plateforme (auth.leboncoin.fr) et stable : perdue ; ailleurs : sans conclusion.
  const t = Date.now();
  const auth = { hote: 'auth.leboncoin.fr', pret: true };
  assert.equal(verdictReleve('leboncoin', { etat: auth, horsSiteDepuis: t - 1000, maintenant: t }).issue, null);
  assert.equal(verdictReleve('leboncoin', { etat: auth, horsSiteDepuis: t - HORS_SITE_STABLE_MS, maintenant: t }).issue, 'perdue');
  assert.equal(verdictReleve('leboncoin', { etat: { hote: 'accounts.google.com', pret: true }, horsSiteDepuis: t - 60_000, maintenant: t, fin: true }).issue, 'incertaine');
  assert.equal(verdictReleve('leboncoin', { etat: null, fin: true }).issue, 'incertaine', 'page jamais chargée');
});

test('(21/11) coffre : un cookie de session absent ne fait « à reconnecter » QUE si la plateforme confirme la perte', async () => {
  const base = fausseBase();
  const coffre = creerCoffre({ base, cle: randomBytes(32).toString('base64') });
  await coffre.ecrire(U, 'leboncoin', { le: 'x', cookies: [{ name: '__Secure-Login', value: 'j', domain: '.leboncoin.fr' }] }, true);
  const sansJeton = [{ name: 'datadome', value: 'd', domain: '.leboncoin.fr' }, { name: 'autre', value: 'a', domain: '.leboncoin.fr' }];
  const demandees = [];
  const b1 = await coffre.sauvegarderCookies(U, sansJeton, { confirmerPerte: async (p) => { demandees.push(p); return false; } });
  assert.equal(b1.leboncoin, 'perte_non_confirmee');
  assert.deepEqual(demandees, ['leboncoin'], 'la plateforme est relue');
  assert.equal(base.lignes.get('leboncoin').connecte, true, 'la session marche : rien n\'est dit');
  const b2 = await coffre.sauvegarderCookies(U, sansJeton, { confirmerPerte: async () => { throw new Error('page morte'); } });
  assert.equal(b2.leboncoin, 'perte_non_confirmee', 'une lecture ratée ne conclut rien');
  const b3 = await coffre.sauvegarderCookies(U, sansJeton, { confirmerPerte: async () => true });
  assert.equal(b3.leboncoin, 'a_reconnecter', 'perdue sur la plateforme : « à reconnecter »');
  assert.equal(base.lignes.get('leboncoin').connecte, false);
});

test('(21/11) les appelants passent tous par la lecture sur la plateforme (sources)', () => {
  const src = (f) => readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8');
  assert.match(src('postes.js'), /sauvegarderCookies\(user, cookies, \{ confirmerPerte:/, 'la sauvegarde des 10 min');
  assert.match(src('postes.js'), /pertePrononcee\(user, p, `extension_/, 'le verrou de l’extension');
  assert.match(src('verifications.js'), /lecture\.lire\(user, b\.plateforme, \{ raison: `essai_\$\{mode\}`/, 'l’essai et la confirmation');
  assert.match(src('connexion.js'), /conclure\(await sessionVraimentFermee\(v\), v\)/, '« Résoudre »');
  assert.match(src('index.js'), /creerLectureSession\(\{ navigateurs, journal \}\)/);
});
