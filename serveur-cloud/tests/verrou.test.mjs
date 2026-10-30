// (30/10, règle de Nico) LE VERROU DES PLATEFORMES dans le relais du navigateur Cloud : une plateforme n'est joignable
// que si le compte y est connecté, ou pendant son « Me connecter ». Testé sur le VRAI relais (lancé en local, ports
// libres) derrière un faux proxy amont qui compte ses connexions : un refus ne doit JAMAIS sortir.
import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import http from 'node:http';
import { randomBytes } from 'node:crypto';
import { plateformeDe, lirePermises, demarrerRelais } from '../navigateur-chrome/relais.mjs';
import { plateformesVerrou } from '../src/navigateur.js';
import { creerConnexions } from '../src/connexion.js';
import { signerTicket } from '../src/tickets.js';
import * as journal from '../src/journal.js';

test('verrou : la plateforme d’un hôte — domaines propres et CDN maison ; les tiers jamais', () => {
  const attendu = {
    'www.leboncoin.fr': 'leboncoin', 'auth.leboncoin.fr': 'leboncoin', 'img.leboncoin.fr': 'leboncoin', 'api.leboncoin.fr': 'leboncoin',
    'www.vinted.fr': 'vinted', 'images1.vinted.net': 'vinted', 'static-assets.vinted.com': 'vinted', 'www.vinted.co.uk': 'vinted',
    'www.beebs.app': 'beebs', 'api.beebs.app': 'beebs', 'www.depop.com': 'depop', 'media-photos.depop.com': 'depop',
    'www.ebay.fr': 'ebay', 'i.ebayimg.com': 'ebay', 'www.opla.co': 'opla',
    'geo.captcha-delivery.com': null, 'js.datadome.co': null, 'accounts.google.com': null, 'appleid.apple.com': null,
    'secure.kiabi.com': null, 'www.facebook.com': null, 'xxx.supabase.co': null, 'fillsell.app': null,
    'notvinted.fr': null, 'leboncoin.fr.example.com': null, '': null,
  };
  for (const [hote, pf] of Object.entries(attendu)) assert.equal(plateformeDe(hote), pf, hote);
  assert.equal(plateformeDe('WWW.LEBONCOIN.FR.'), 'leboncoin', 'casse et point final');
  assert.equal(plateformeDe('www.beebs.app:443'), 'beebs', 'avec le port');
  assert.deepEqual([...lirePermises('vinted, depop,inconnue,')], ['vinted', 'depop']);
  assert.deepEqual(plateformesVerrou(['depop', 'ebay', 'opla', 'Vinted', 'vinted', 'x']), ['depop', 'vinted'], 'eBay et Opla jamais permis par le Cloud');
});

/** Un faux proxy amont : compte les connexions, répond 200 à CONNECT puis ferme. */
async function fauxAmont() {
  const etat = { connexions: 0 };
  const s = net.createServer((c) => {
    etat.connexions++;
    c.once('data', () => c.end('HTTP/1.1 200 Connection established\r\n\r\n'));
    c.on('error', () => {});
  });
  await new Promise((ok) => s.listen(0, '127.0.0.1', ok));
  return { etat, port: s.address().port, fermer: () => new Promise((ok) => s.close(() => ok())) };
}

/** Un CONNECT par le relais : rend la ligne de statut. */
function connecter(port, cible) {
  return new Promise((ok, ko) => {
    const c = net.connect(port, '127.0.0.1', () => c.write(`CONNECT ${cible} HTTP/1.1\r\nHost: ${cible}\r\n\r\n`));
    let lu = '';
    c.on('data', (d) => { lu += d; if (lu.includes('\r\n')) { c.destroy(); ok(lu.split('\r\n')[0]); } });
    c.on('error', ko);
    c.on('close', () => ok(lu.split('\r\n')[0]));
  });
}

test('verrou : refus 403 SANS aucune connexion amont ; le contrôle exige le jeton ; « permis » ouvre la plateforme', async () => {
  const amont = await fauxAmont();
  const jeton = randomBytes(24).toString('hex');
  const r = await demarrerRelais({ proxyAmont: `http://u:p@127.0.0.1:${amont.port}`, permises: 'vinted', jetonControle: jeton,
    portRelais: 0, portExtension: 0, portControle: 0, hoteControle: '127.0.0.1', dossierCrx: '/inexistant' });
  try {
    // 1. Plateforme non connectée : refusée, et rien n'est parti vers le proxy.
    assert.match(await connecter(r.ports.relais, 'www.leboncoin.fr:443'), /^HTTP\/1\.1 403/);
    assert.match(await connecter(r.ports.relais, 'www.beebs.app:443'), /^HTTP\/1\.1 403/);
    assert.equal(amont.etat.connexions, 0, 'un refus ne sort JAMAIS');
    // Requête http:// en clair vers une plateforme fermée : 403, rien ne sort.
    const code = await new Promise((ok) => {
      const q = http.request({ host: '127.0.0.1', port: r.ports.relais, path: 'http://www.depop.com/', headers: { Host: 'www.depop.com' } }, (res) => { res.resume(); ok(res.statusCode); });
      q.on('error', () => ok(0)); q.end();
    });
    assert.equal(code, 403);
    assert.equal(amont.etat.connexions, 0);
    // 2. Connectée (vinted) et tiers (Google, DataDome) : relayés.
    assert.match(await connecter(r.ports.relais, 'www.vinted.fr:443'), /^HTTP\/1\.1 200/);
    assert.match(await connecter(r.ports.relais, 'accounts.google.com:443'), /^HTTP\/1\.1 200/);
    assert.match(await connecter(r.ports.relais, 'geo.captcha-delivery.com:443'), /^HTTP\/1\.1 200/);
    assert.equal(amont.etat.connexions, 3);
    // 3. Le contrôle : sans jeton (ou faux) → 401 ; liste inconnue → 400.
    const ctl = `http://127.0.0.1:${r.ports.controle}`;
    assert.equal((await fetch(`${ctl}/etat`)).status, 401);
    assert.equal((await fetch(`${ctl}/etat`, { headers: { 'X-Jeton': 'x'.repeat(48) } })).status, 401);
    assert.equal((await fetch(`${ctl}/permis`, { method: 'OPTIONS' })).status, 401, 'aucun pré-vol CORS ne passe');
    const poser = (corps) => fetch(`${ctl}/permis`, { method: 'POST', headers: { 'X-Jeton': jeton, 'Content-Type': 'application/json' }, body: JSON.stringify(corps) });
    assert.equal((await poser({ plateformes: ['nimporte'] })).status, 400);
    assert.deepEqual(r.permises(), ['vinted'], 'une liste refusée ne change rien');
    // 4. « Me connecter » Leboncoin : permis → la page passe.
    const p = await poser({ plateformes: ['vinted', 'leboncoin'] });
    assert.equal(p.status, 200);
    assert.deepEqual((await p.json()).permises, ['leboncoin', 'vinted']);
    assert.match(await connecter(r.ports.relais, 'auth.leboncoin.fr:443'), /^HTTP\/1\.1 200/);
    assert.equal(amont.etat.connexions, 4);
    // 5. L'état : permises et refus comptés par hôte.
    const e = await (await fetch(`${ctl}/etat`, { headers: { 'X-Jeton': jeton } })).json();
    assert.deepEqual(e.permises, ['leboncoin', 'vinted']);
    assert.deepEqual(e.refus, { 'www.leboncoin.fr': 1, 'www.beebs.app': 1, 'www.depop.com': 1 });
    // 6. Retour aux connectées : Leboncoin refermée.
    assert.equal((await poser({ plateformes: ['vinted'] })).status, 200);
    assert.match(await connecter(r.ports.relais, 'www.leboncoin.fr:443'), /^HTTP\/1\.1 403/);
    assert.equal(amont.etat.connexions, 4);
  } finally {
    await r.fermer();
    await amont.fermer();
  }
});

test('verrou : sans jeton configuré, le contrôle refuse tout (jamais ouvert par défaut)', async () => {
  const amont = await fauxAmont();
  const r = await demarrerRelais({ proxyAmont: `http://u:p@127.0.0.1:${amont.port}`, portRelais: 0, portExtension: 0, portControle: 0, hoteControle: '127.0.0.1' });
  try {
    assert.equal((await fetch(`http://127.0.0.1:${r.ports.controle}/etat`, { headers: { 'X-Jeton': '' } })).status, 401);
    assert.deepEqual(r.permises(), [], 'aucune plateforme permise par défaut');
    assert.match(await connecter(r.ports.relais, 'www.vinted.fr:443'), /^HTTP\/1\.1 403/);
    assert.equal(amont.etat.connexions, 0);
  } finally { await r.fermer(); await amont.fermer(); }
});

// ── Le câblage de « Me connecter » (connexion.js) : permettre AVANT la navigation, retour à la fermeture ─────────────
const NICO = 'f44b5917-bccc-4431-ba41-f40571a2ed18';
function monter({ cookies = [] } = {}) {
  const ordre = [];
  const ecouteurs = new Set();
  const cdp = {
    on: (f) => { ecouteurs.add(f); return () => ecouteurs.delete(f); },
    async send(methode, params) {
      ordre.push(methode === 'Page.navigate' ? `navigate ${params.url}` : methode);
      if (methode === 'Target.createTarget') return { targetId: 'CIBLE' };
      if (methode === 'Target.attachToTarget') return { sessionId: 'S1' };
      if (methode === 'Page.getFrameTree') return { frameTree: { frame: { id: 'F1' } } };
      if (methode === 'Storage.getCookies') return { cookies };
      return {};
    },
  };
  const h = { cdp, ip: '172.31.0.9', moteur: 'chrome', permises: ['vinted'] };
  const appels = [];
  const navigateurs = {
    ouvert: () => h, ouverts: () => [NICO], fermer: async () => {},
    async permettre(u, liste) { ordre.push(`permettre ${[...liste].sort().join(',')}`); appels.push([...liste].sort()); h.permises = [...liste].sort(); return { ok: true }; },
  };
  const base = {
    rpc: async (nom) => ({ data: nom === 'cloud_comptes_a_servir' ? [{ user_id: NICO, etat_cloud: 'actif', plateformes_connectees: ['vinted'] }] : null, error: null }),
    from: () => ({ insert: () => ({ select: () => ({ maybeSingle: async () => ({ data: null }) }) }), update: () => ({ eq: async () => ({}) }) }),
  };
  const config = { comptesAutorises: [NICO], cleTickets: randomBytes(32).toString('base64'), supabaseUrl: '', cleAnon: '' };
  const connexions = creerConnexions({ config, base, postes: { ouvrir: async () => h, extensionId: async () => null }, navigateurs,
    coffre: { sauvegarderCookies: async () => ({ ok: true }) }, journal });
  let surMessage = null;
  const etats = [];
  const ws = { readyState: 1, bufferedAmount: 0, send(d, o) { if (!o?.binary) etats.push(JSON.parse(d).etape); }, close() { ws.readyState = 3; }, on(ev, f) { if (ev === 'message') surMessage = f; } };
  connexions.brancher(ws, 'test');
  const envoyer = (m) => surMessage(Buffer.from(JSON.stringify(m)), false);
  return { ordre, appels, etats, envoyer, ticket: signerTicket({ user: NICO, minutes: 5 }, config.cleTickets) };
}

test('« Me connecter » : la plateforme est permise AVANT Page.navigate, et refermée à la fermeture sans connexion', async () => {
  const m = monter();
  await m.envoyer({ t: 'ouvrir', ticket: m.ticket, plateforme: 'leboncoin', largeur: 390, hauteur: 844, dpr: 3, lang: 'fr' });
  const iPermettre = m.ordre.indexOf('permettre leboncoin,vinted');
  const iNaviguer = m.ordre.findIndex((x) => x.startsWith('navigate https://www.leboncoin.fr/'));
  assert.ok(iPermettre >= 0 && iNaviguer > iPermettre, `permettre (${iPermettre}) avant la navigation (${iNaviguer}) : ${m.ordre.join(' | ')}`);
  await m.envoyer({ t: 'fermer' });
  await new Promise((ok) => setTimeout(ok, 50));
  assert.deepEqual(m.appels, [['leboncoin', 'vinted'], ['vinted']], 'retour aux seules plateformes connectées');
});

test('« Me connecter » réussi : la plateforme RESTE permise (son coffre fait foi ensuite)', async () => {
  const m = monter({ cookies: [{ name: '__Secure-Login', value: 'x', domain: '.leboncoin.fr' }] });
  await m.envoyer({ t: 'ouvrir', ticket: m.ticket, plateforme: 'leboncoin', largeur: 390, hauteur: 844, dpr: 3, lang: 'fr' });
  await m.envoyer({ t: 'termine' });
  await new Promise((ok) => setTimeout(ok, 1700));   // la vue se ferme 1,5 s après « connecté »
  assert.ok(m.etats.includes('connecte'), m.etats.join(','));
  assert.deepEqual(m.appels, [['leboncoin', 'vinted']], 'aucun retour en arrière après une connexion réussie');
});
