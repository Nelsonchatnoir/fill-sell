// (05/11 soir) Lot « Ouverture du Cloud » de Nico — les règles du serveur Cloud ajoutées par le lot, une par test.
//   · point 9 : une plateforme rouverte (Résoudre, connexion vérifiée, vérification de l'appareil passée SEULE) lève ses
//     pauses et relance TOUT DE SUITE les tâches que l'anti-robot avait espacées — jamais une attente de cadence.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { creerEnregistrementFond, issueVerificationAppareil, plateformeDuCadre } from '../src/enregistrementFond.js';
import { patchRelance, erreurApresRelance, creerRelanceTaches, MARQUES_ATTENTE_ANTIROBOT, EXPRESSION_RELANCER } from '../src/relanceTaches.js';
import { creerVerifications } from '../src/verifications.js';

const muet = { info() {}, erreur() {}, alerte() {} };
const U = 'f44b5917-bccc-4431-ba41-f40571a2ed18';

/** Un faux navigateur DevTools (même forme que essai-gpu.test.mjs) ; `corps` = la réponse DataDome lue. */
function fauxCdp({ cibles = [], corps = '{"view":"redirect","cookie":"datadome=SECRET; Path=/"}' } = {}) {
  const appels = [];
  const ecouteurs = new Set();
  let n = 0;
  return {
    appels, ferme: false,
    on(f) { ecouteurs.add(f); return () => ecouteurs.delete(f); },
    emettre(m) { for (const f of ecouteurs) f(m); },
    async send(methode, params = {}, sessionId) {
      appels.push([methode, sessionId ?? null, params]);
      if (methode === 'Target.getTargets') return { targetInfos: cibles };
      if (methode === 'Target.attachToTarget') return { sessionId: `S${++n}` };
      if (methode === 'Network.getResponseBody') return { body: corps, base64Encoded: false };
      return {};
    },
  };
}

test('point 9 — l’issue d’une « Vérification de l’appareil » DataDome se lit dans la réponse de son /interstitial/', () => {
  const url = 'https://geo.captcha-delivery.com/interstitial/?initialCid=x&referer=https%3A%2F%2Fwww.beebs.app%2Ffr%2F';
  assert.equal(issueVerificationAppareil(url, '{"view":"redirect","url":"https://www.beebs.app/fr/"}'), 'passee');
  assert.equal(issueVerificationAppareil(url, '{"view":"captcha"}'), 'glissiere');
  assert.equal(issueVerificationAppareil(url, 'pas du json'), null, 'illisible : rien n’est dit');
  assert.equal(issueVerificationAppareil(url, '{"view":"autre"}'), null);
  assert.equal(issueVerificationAppareil('https://geo.captcha-delivery.com/captcha/?t=fe', '{"view":"redirect"}'), null, 'une glissière n’est jamais une preuve');
  assert.equal(issueVerificationAppareil('https://www.beebs.app/interstitial/', '{"view":"redirect"}'), null, 'autre hôte que DataDome');
  assert.equal(plateformeDuCadre(url), 'beebs');
  assert.equal(plateformeDuCadre('https://geo.captcha-delivery.com/interstitial/?referer=https%3A%2F%2Fwww.leboncoin.fr%2F'), 'leboncoin');
  assert.equal(plateformeDuCadre('https://geo.captcha-delivery.com/interstitial/'), null);
});

test('point 9 — le veilleur LÉGER (hors essai) voit la vérification passée seule, n’écrit rien, ne suit que DataDome', async () => {
  const ecrit = [];
  const vus = [];
  const cdp = fauxCdp({ cibles: [{ targetId: 'T1', type: 'page', url: 'https://www.beebs.app/fr/account/orders/list/seller' }] });
  const f = creerEnregistrementFond({ config: { dossierEtat: '/etat' }, journal: muet, ecrireFichier: async (fi, l) => { ecrit.push(l); },
    creerDossier: async () => { ecrit.push('dossier'); }, surDataDome: (user, d) => { vus.push([user, d]); } });
  assert.equal(await f.suivre(U, { cdp, moteur: 'chrome' }), true, 'actif sans ENREGISTREMENT_FOND dès qu’un veilleur est branché');
  // Le cadre DataDome de la page (referer = Beebs) et son POST /interstitial/ qui répond « redirect ».
  cdp.emettre({ method: 'Target.attachedToTarget', sessionId: 'S1', params: { sessionId: 'C1', targetInfo: { type: 'iframe',
    url: 'https://geo.captcha-delivery.com/interstitial/?initialCid=a&referer=https%3A%2F%2Fwww.beebs.app%2Ffr%2Faccount' } } });
  cdp.emettre({ method: 'Network.requestWillBeSent', sessionId: 'S1', params: { requestId: 'p1', type: 'Fetch', request: { url: 'https://www.beebs.app/fr/account/orders/list/seller', method: 'GET' } } });
  cdp.emettre({ method: 'Network.loadingFinished', sessionId: 'S1', params: { requestId: 'p1' } });
  cdp.emettre({ method: 'Network.requestWillBeSent', sessionId: 'C1', params: { requestId: 'd1', type: 'XHR', request: { url: 'https://geo.captcha-delivery.com/interstitial/', method: 'POST', postData: 'x=1' } } });
  cdp.emettre({ method: 'Network.responseReceived', sessionId: 'C1', params: { requestId: 'd1', response: { status: 200 } } });
  cdp.emettre({ method: 'Network.loadingFinished', sessionId: 'C1', params: { requestId: 'd1' } });
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(vus.length, 1);
  assert.equal(vus[0][0], U); assert.equal(vus[0][1].plateforme, 'beebs'); assert.equal(vus[0][1].issue, 'passee');
  assert.deepEqual(ecrit, [], 'le mode léger n’écrit RIEN sur le disque');
  assert.ok(!cdp.appels.some((a) => a[0] === 'Network.getResponseBody' && a[1] === 'S1'), 'le corps d’une page de la plateforme n’est jamais lu');
  for (const interdit of ['Runtime.enable', 'Page.enable', 'Runtime.evaluate']) assert.ok(!cdp.appels.some((a) => a[0] === interdit), interdit);
  f.arreter(U, 'fermeture');
  // Une glissière (« captcha ») est signalée comme telle, jamais comme une preuve d’accès.
  const vus2 = [];
  const cdp2 = fauxCdp({ cibles: [{ targetId: 'T2', type: 'page', url: 'https://www.leboncoin.fr/' }], corps: '{"view":"captcha"}' });
  const g = creerEnregistrementFond({ config: {}, journal: muet, surDataDome: (u, d) => { vus2.push(d); } });
  await g.suivre(U, { cdp: cdp2 });
  cdp2.emettre({ method: 'Target.attachedToTarget', sessionId: 'S1', params: { sessionId: 'C9', targetInfo: { type: 'iframe', url: 'https://geo.captcha-delivery.com/interstitial/?referer=https%3A%2F%2Fwww.leboncoin.fr%2F' } } });
  cdp2.emettre({ method: 'Network.requestWillBeSent', sessionId: 'C9', params: { requestId: 'd2', type: 'XHR', request: { url: 'https://geo.captcha-delivery.com/interstitial/', method: 'POST' } } });
  cdp2.emettre({ method: 'Network.loadingFinished', sessionId: 'C9', params: { requestId: 'd2' } });
  await new Promise((r) => setTimeout(r, 20));
  assert.deepEqual(vus2.map((d) => [d.plateforme, d.issue]), [['leboncoin', 'glissiere']]);
  // Sans veilleur ni ENREGISTREMENT_FOND : coupé, comme avant.
  assert.equal(await creerEnregistrementFond({ config: { dossierEtat: '/etat' }, journal: muet }).suivre(U, { cdp: fauxCdp() }), false);
});

test('point 9 — la relance ne lève QUE les attentes de l’anti-robot (jamais la cadence), état d’avant gardé', () => {
  assert.deepEqual([...MARQUES_ATTENTE_ANTIROBOT], ['blocage_antirobot', 'attente_antirobot_compte', 'attente_verification_cloud']);
  const le = '2026-11-05T20:00:00.000Z';
  const pf = { republish_step: 'captured', next_action_after: '2026-11-05T20:45:00Z', blocage_antirobot: { platform: 'beebs', observations: 2 }, creneau: 'x' };
  const p = patchRelance(pf, { par: 'resolution (resoudre)', le });
  assert.equal(p.next_action_after, undefined); assert.equal(p.blocage_antirobot, undefined);
  assert.equal(p.republish_step, 'captured'); assert.equal(p.creneau, 'x', 'le reste intact');
  assert.deepEqual(p.relance_apres_verification, { le, par: 'resolution (resoudre)', avant: { blocage_antirobot: pf.blocage_antirobot, next_action_after: pf.next_action_after } });
  // Une attente de CADENCE (aucune marque anti-robot) : jamais touchée.
  assert.equal(patchRelance({ next_action_after: '2026-11-06T08:00:00Z', republish_step: 'captured' }), null);
  assert.equal(patchRelance(null), null);
  // Le message de l’anti-robot ou du Cloud s’efface ; un autre message reste.
  assert.equal(erreurApresRelance('Beebs affiche une vérification anti-robot : …', {}), null);
  assert.equal(erreurApresRelance('Vérification Beebs en cours sur le Cloud', { attente_verification_cloud: { message: 'Vérification Beebs en cours sur le Cloud' } }), null);
  assert.equal(erreurApresRelance('En file : ta republication passera à son tour', {}), 'En file : ta republication passera à son tour');
  assert.match(EXPRESSION_RELANCER, /__fillsellVerrouCloud/);
});

test('point 9 — relancer : compare-and-set sur pending, seules les tâches marquées, l’extension réveillée', async () => {
  const jobs = [
    { id: 'a', platform: 'beebs', status: 'pending', error: 'Beebs affiche une vérification anti-robot', platform_fields: { blocage_antirobot: { observations: 1 }, next_action_after: '2099-01-01T00:00:00Z' } },
    { id: 'b', platform: 'beebs', status: 'pending', error: null, platform_fields: { next_action_after: '2099-01-01T00:00:00Z' } },
    { id: 'c', platform: 'beebs', status: 'processing', error: null, platform_fields: { blocage_antirobot: { observations: 1 } } },
  ];
  const maj = [], filtres = [];
  const base = { from() {
    const f = { eq: {} };
    const q = {
      select() { return q; }, limit() { return q; }, or(s) { filtres.push(s); return q; },
      eq(c, v) { f.eq[c] = v; return q; },
      update(o) { f.maj = o; return q; },
      then(ok, ko) {
        if (f.maj) {
          const j = jobs.find((x) => x.id === f.eq.id && x.status === f.eq.status);
          if (j) { Object.assign(j, f.maj); maj.push(j.id); }
          return Promise.resolve({ data: j ? [{ id: j.id }] : [], error: null }).then(ok, ko);
        }
        return Promise.resolve({ data: jobs.filter((j) => j.status === f.eq.status && j.platform === f.eq.platform), error: null }).then(ok, ko);
      },
    };
    return q;
  } };
  const evalues = [];
  const cdp = { async send(m, p) {
    if (m === 'Target.getTargets') return { targetInfos: [{ type: 'service_worker', url: 'chrome-extension://ext/background.js', targetId: 'sw' }] };
    if (m === 'Target.attachToTarget') return { sessionId: 'sw-s' };
    if (m === 'Runtime.evaluate') { evalues.push(p.expression); return { result: { value: true } }; }
    return {};
  } };
  const r = creerRelanceTaches({ base, navigateurs: { ouvert: () => ({ cdp }) }, journal: muet, idExtension: async () => 'ext' });
  const res = await r.relancer(U, 'beebs', { par: 'verification_passee_seule' });
  assert.deepEqual(maj, ['a'], 'seule la tâche marquée par l’anti-robot, et seulement en pending');
  assert.equal(jobs[0].error, null); assert.equal(jobs[0].platform_fields.next_action_after, undefined);
  assert.equal(jobs[1].platform_fields.next_action_after, '2099-01-01T00:00:00Z', 'une attente de cadence n’est jamais levée');
  assert.match(filtres[0], /platform_fields->>blocage_antirobot\.not\.is\.null/);
  assert.equal(res.relancees, 1);
  assert.ok(evalues.some((e) => e.includes('relancer')), 'l’extension est réveillée (passage immédiat de sa file)');
});

test('point 9 — resolue() SANS blocage ouvert lève les pauses et relance ; verificationPassee() passe par elle', async () => {
  const dossierEtat = mkdtempSync(path.join(tmpdir(), 'fs-ouverture-'));
  const levees = [], relances = [];
  const v = creerVerifications({
    config: { dossierEtat },
    base: { from() { const q = { select: () => q, eq: () => q, limit: () => q, maybeSingle: async () => ({ data: null }), then: (ok) => Promise.resolve({ data: [], error: null }).then(ok) }; return q; }, rpc: async () => ({ error: null }) },
    navigateurs: { ouverts: () => [], ouvert: () => null },
    postes: {}, coffre: null, connexionsOuvertes: () => new Set(), journal: muet, alertes: null,
    pausesMessagerie: { lever: async (u, ps, o) => { levees.push([u, ps, o.raison]); return { base: ps, extension: null }; } },
    relanceTaches: { relancer: async (u, p, o) => { relances.push([u, p, o.par]); return { relancees: 0 }; } },
  });
  await v.charger();
  assert.equal(await v.resolue(U, 'beebs', { par: 'resoudre' }), false, 'aucun blocage ouvert : rien à débloquer…');
  assert.deepEqual(levees, [[U, ['beebs'], 'resolution (resoudre)']], '… mais la pause de la messagerie Beebs est levée');
  assert.deepEqual(relances, [[U, 'beebs', 'resoudre']], '… et ses tâches relancées');
  assert.equal(await v.verificationPassee(U, 'beebs'), true);
  assert.deepEqual(levees.at(-1), [U, ['beebs'], 'resolution (verification_passee_seule)']);
  assert.deepEqual(relances.at(-1), [U, 'beebs', 'verification_passee_seule']);
});

// ── Point 12 : une mise à jour ne coupe rien en cours (vidange.js, copie Cloud de l'extension) ──
import { creerVidange, tacheEnCours, expressionDrainer, TACHE_FIGEE_MS } from '../src/vidange.js';
import { readFileSync } from 'node:fs';

test('point 12 — la vidange attend la fin des tâches en cours (jamais une tâche figée), puis rend la main', async () => {
  const t0 = Date.parse('2026-11-05T21:00:00Z');
  let horloge = t0;
  assert.equal(tacheEnCours({ status: 'processing', platform_fields: { processing_since: new Date(t0 - 60_000).toISOString() } }, t0), true);
  assert.equal(tacheEnCours({ status: 'processing', platform_fields: { processing_since: new Date(t0 - TACHE_FIGEE_MS - 1).toISOString() } }, t0), false, 'figée : relève de la reprise');
  assert.equal(tacheEnCours({ status: 'pending' }, t0), false);
  assert.match(expressionDrainer(true), /drainer\(true\)/); assert.match(expressionDrainer(false), /drainer\(false\)/);
  // Une republication Beebs en cours (prise il y a 2 min) : finie au 3e relevé.
  let tours = 0;
  const base = { from() { const q = { select: () => q, in: () => q, eq: () => q, limit: () => q,
    then: (ok) => { tours++; const data = tours < 3 ? [{ id: 'j1', status: 'processing', platform_fields: { processing_since: new Date(t0 - 120_000).toISOString() } }] : []; return Promise.resolve({ data, error: null }).then(ok); } }; return q; } };
  const evalues = [];
  const cdp = { async send(m, p) {
    if (m === 'Target.getTargets') return { targetInfos: [{ type: 'service_worker', url: 'chrome-extension://ext/background.js', targetId: 'sw' }] };
    if (m === 'Target.attachToTarget') return { sessionId: 'sw-s' };
    if (m === 'Runtime.evaluate') { evalues.push(p.expression); return { result: { value: true } }; }
    return {};
  } };
  const journalVu = [];
  const v = creerVidange({ base, navigateurs: { ouverts: () => [U], ouvert: () => ({ cdp }) }, idExtension: async () => 'ext',
    journal: { info: (e, d) => journalVu.push([e, d]), alerte: (e, d) => journalVu.push([e, d]) },
    maintenant: () => horloge, attendre: async (ms) => { horloge += ms; } });
  const r = await v.vider({ maxMs: 600_000 });
  assert.equal(r.issue, 'vide'); assert.equal(r.attente_ms, 10_000, 'deux attentes de 5 s : la tâche est allée au bout');
  assert.ok(evalues.some((e) => e.includes('drainer(true)')), 'l’extension ne prend plus de nouvelle tâche');
  // Une tâche qui ne finit pas : rendue au bout du délai, alerte écrite (jamais une attente infinie).
  horloge = t0; tours = -1000;
  const r2 = await v.vider({ maxMs: 30_000 });
  assert.equal(r2.issue, 'delai_depasse');
  assert.ok(journalVu.some(([e]) => e === 'vidange_delai_depasse'));
  // Rien d’ouvert : rien à attendre.
  const vide = creerVidange({ base, navigateurs: { ouverts: () => [], ouvert: () => null }, journal: muet });
  assert.equal((await vide.vider()).issue, 'rien_ouvert');
  // Le délai d’arrêt du conteneur est AU-DESSUS de la vidange (sinon Docker tuerait au milieu d’une tâche).
  const compose = readFileSync(new URL('../deploiement/docker-compose.yml', import.meta.url), 'utf8');
  assert.match(compose, /stop_grace_period: 12m/);
  // La copie Cloud de l’extension porte la vidange et la relance (build-extension-cloud.mjs).
  const build = readFileSync(new URL('../../scripts/cloud/build-extension-cloud.mjs', import.meta.url), 'utf8');
  for (const m of ['drainer: (oui) =>', 'relancer: () =>', 'globalThis.pollAndProcessJobs = function pollAvecVidangeCloud']) assert.ok(build.includes(m), m);
});

// ── Point 11 : le relais retente sur place une panne passagère et compte les coupures ──
import net from 'node:net';
import { demarrerRelais, pannePassagere, jourParisRelais } from '../navigateur-chrome/relais.mjs';

/** Un faux proxy amont : `reponses` = la réponse de chaque CONNECT reçu, dans l'ordre ('200', '502', '407', 'coupe'). */
async function fauxAmont(reponses, cible) {
  let n = 0;
  const vus = [];
  const s = net.createServer((c) => {
    c.on('error', () => {});
    c.once('data', (d) => {
      const r = reponses[Math.min(n, reponses.length - 1)]; n++;
      vus.push(String(d).split('\r\n')[0]);
      if (r === 'coupe') { c.destroy(); return; }
      if (r !== '200') { c.end(`HTTP/1.1 ${r} Non\r\n\r\n`); return; }
      const t = net.connect(cible, '127.0.0.1', () => { c.write('HTTP/1.1 200 Connection established\r\n\r\n'); c.pipe(t); t.pipe(c); });
      t.on('error', () => c.destroy());
    });
  });
  await new Promise((ok) => s.listen(0, '127.0.0.1', ok));
  return { port: s.address().port, vus, fermer: () => new Promise((ok) => s.close(ok)) };
}
/** Un client qui ouvre un tunnel par le relais et envoie « ping » : rend la ligne de statut et l'écho. */
function tunnel(portRelais, portCible) {
  return new Promise((ok) => {
    const c = net.connect(portRelais, '127.0.0.1', () => c.write(`CONNECT 127.0.0.1:${portCible} HTTP/1.1\r\nHost: 127.0.0.1:${portCible}\r\n\r\n`));
    let tout = '';
    c.on('data', (d) => {
      tout += d;
      if (/200 Connection Established\r\n\r\n$/.test(tout)) c.write('ping');
      if (tout.endsWith('ping') || /502/.test(tout)) { c.destroy(); ok({ statut: tout.split('\r\n')[0], echo: tout.endsWith('ping') }); }
    });
    c.on('error', () => ok({ statut: 'erreur', echo: false }));
    c.on('close', () => ok({ statut: tout.split('\r\n')[0] || 'ferme', echo: tout.endsWith('ping') }));
  });
}

test('point 11 — le relais retente sur place une panne passagère, jamais un refus net, et compte les coupures', async () => {
  assert.equal(pannePassagere(502), true); assert.equal(pannePassagere(503), true); assert.equal(pannePassagere('ECONNRESET'), true);
  assert.equal(pannePassagere(407), false, 'identifiants refusés : retenter n’y change rien');
  assert.equal(pannePassagere(403), false);
  const echo = net.createServer((c) => { c.on('error', () => {}); c.pipe(c); });
  await new Promise((ok) => echo.listen(0, '127.0.0.1', ok));
  const portCible = echo.address().port;
  const jour = jourParisRelais(Date.now());
  const lancer = async (reponses) => {
    const amontF = await fauxAmont(reponses, portCible);
    const r = await demarrerRelais({ proxyAmont: `http://u:p@127.0.0.1:${amontF.port}`, jetonControle: 'x'.repeat(32),
      portRelais: 0, portExtension: 0, portControle: 0, hoteControle: '127.0.0.1', attentesReessaiMs: [10, 10] });
    return { amontF, r };
  };
  // Une coupure puis un 502 du proxy : la 3e tentative passe, le tunnel marche, une « reprise » comptée.
  const a = await lancer(['coupe', '502', '200']);
  const t1 = await tunnel(a.r.ports.relais, portCible);
  assert.equal(t1.statut, 'HTTP/1.1 200 Connection Established'); assert.equal(t1.echo, true);
  assert.equal(a.amontF.vus.length, 3);
  assert.deepEqual(a.r.coupures()[jour].tiers, { echecs: 0, reprises: 1, secours: 0 });
  await a.r.fermer(); await a.amontF.fermer();
  // Un refus net (407) : UNE seule tentative, 502 rendu à Chrome, un échec compté.
  const b = await lancer(['407']);
  const t2 = await tunnel(b.r.ports.relais, portCible);
  assert.match(t2.statut, /502/); assert.equal(b.amontF.vus.length, 1);
  assert.deepEqual(b.r.coupures()[jour].tiers, { echecs: 1, reprises: 0, secours: 0 });
  await b.r.fermer(); await b.amontF.fermer();
  // Une panne qui dure (503 à chaque fois) : 3 tentatives, puis 502.
  const c = await lancer(['503']);
  const t3 = await tunnel(c.r.ports.relais, portCible);
  assert.match(t3.statut, /502/); assert.equal(c.amontF.vus.length, 3);
  await c.r.fermer(); await c.amontF.fermer();
  await new Promise((ok) => echo.close(ok));
});

// ── Décisions de Nico du 05/11 soir : IP de secours allumée (h) ; plafond d'achat d'IP 100 $, alerte à 80 % (d) ──
import { choisirIpSecours } from '../src/fournisseurIp.js';
import { specConteneurChrome } from '../src/navigateur.js';
import { alerteSeuilPlafond, moisParis, SEUIL_ALERTE_PLAFOND } from '../src/approvisionnement.js';

test('(h) l’IP de secours d’un compte = l’IP qui lui est RÉSERVÉE, jamais celle d’un autre compte', () => {
  const t = Date.parse('2026-11-05T21:00:00Z');
  const lignes = [
    { id: 39, etat: 'disponible', user_id: null, reserve_pour: U, reserve_jusqu_au: '2026-12-03T13:09:55Z', expire_le: '2026-12-03T13:09:55Z' },
    { id: 2, etat: 'disponible', user_id: null, reserve_pour: 'autre-compte', reserve_jusqu_au: '2026-12-01T00:00:00Z', expire_le: '2026-12-01T00:00:00Z' },
    { id: 42, etat: 'attribuee_client', user_id: U, reserve_pour: null, expire_le: '2026-12-04T17:08:04Z' },
  ];
  assert.equal(choisirIpSecours(lignes, U, 42, t)?.id, 39);
  assert.equal(choisirIpSecours(lignes, 'autre-compte', 7, t)?.id, 2);
  assert.equal(choisirIpSecours(lignes, 'sans-reserve', 7, t), null, 'pas de réserve : pas de secours (jamais une IP partagée)');
  assert.equal(choisirIpSecours([{ ...lignes[0], user_id: 'quelquun' }], U, 42, t), null, 'une IP attribuée à un compte ne sert jamais de secours');
  assert.equal(choisirIpSecours([{ ...lignes[0], reserve_jusqu_au: '2026-11-01T00:00:00Z' }], U, 42, t), null, 'réservation échue');
  assert.equal(choisirIpSecours([{ ...lignes[0], etat: 'repos' }], U, 42, t), null, 'au repos : jamais');
  assert.equal(choisirIpSecours([lignes[0]], U, 39, t), null, 'jamais l’IP principale elle-même');
  const base = { imageChrome: 'img', dossierProfils: '/p', dossierEtat: '/e', memoireNavigateur: '2g' };
  const avec = specConteneurChrome({ config: base, user: U, profilId: 'p1', proxyUrl: 'http://u:p@10.0.0.1:8000', proxySecours: 'http://v:q@10.0.0.2:8001', jetonControle: 'a'.repeat(48) });
  assert.ok(avec.Env.includes('PROXY_SECOURS=http://v:q@10.0.0.2:8001'));
  const sans = specConteneurChrome({ config: base, user: U, profilId: 'p1', proxyUrl: 'http://u:p@10.0.0.1:8000', proxySecours: 'pas-une-url', jetonControle: 'a'.repeat(48) });
  assert.ok(!sans.Env.some((e) => e.startsWith('PROXY_SECOURS=')), 'une adresse mal formée n’est jamais donnée au relais');
});

test('(d) plafond d’achat d’IP : alerte à 80 %, une fois par mois', () => {
  assert.equal(SEUIL_ALERTE_PLAFOND, 0.8);
  const mois = moisParis(Date.parse('2026-11-05T21:00:00Z'));
  assert.equal(mois, '2026-11');
  assert.equal(alerteSeuilPlafond({ budgetUsd: 100, depenseMoisUsd: 79.99, mois, dejaDitPour: null }), false);
  assert.equal(alerteSeuilPlafond({ budgetUsd: 100, depenseMoisUsd: 80, mois, dejaDitPour: null }), true);
  assert.equal(alerteSeuilPlafond({ budgetUsd: 100, depenseMoisUsd: 96, mois, dejaDitPour: '2026-11' }), false, 'déjà dite ce mois-ci');
  assert.equal(alerteSeuilPlafond({ budgetUsd: 100, depenseMoisUsd: 96, mois: '2026-12', dejaDitPour: '2026-11' }), true, 'mois suivant : redite');
  assert.equal(alerteSeuilPlafond({ budgetUsd: 0, depenseMoisUsd: 50, mois, dejaDitPour: null }), false, 'plafond non posé : rien (et aucun achat ne part)');
});

// ── Point 8 : « Me connecter » — la page de connexion, ses fournisseurs (Google, Apple, Facebook, Kiabi) COMME
// AUJOURD'HUI (ordre de Nico, 05/11 soir : « ne casse rien, la connexion doit passer par Google, Apple… »), rien d'autre ──
import { navigationPermise } from '../src/plateformes.js';

test('point 8 — Me connecter : connexion par Google, Apple, Facebook, Kiabi intacte ; aucune page hors connexion', () => {
  // Les fournisseurs de connexion : leurs pages de connexion passent, comme avant.
  assert.equal(navigationPermise('vinted', 'https://accounts.google.com/o/oauth2/v2/auth?client_id=x'), true, 'Google');
  assert.equal(navigationPermise('depop', 'https://appleid.apple.com/auth/authorize?client_id=x'), true, 'Apple');
  assert.equal(navigationPermise('vinted', 'https://www.facebook.com/v18.0/dialog/oauth?client_id=x'), true, 'Facebook');
  assert.equal(navigationPermise('beebs', 'https://auth.kiabi.com/connect/authorize?x=1'), true, 'Kiabi (Beebs)');
  // Le retour déclaré par le fournisseur (redirect_uri) est permis à l'identique, quel que soit l'hôte de la plateforme.
  assert.equal(navigationPermise('depop', 'https://api.depop.com/api/v1/social/callback', [{ hote: 'api.depop.com', chemin: '/api/v1/social/callback' }]), true, 'retour déclaré');
  // Les pages de la plateforme hors connexion : jamais (pas de navigation libre).
  assert.equal(navigationPermise('leboncoin', 'https://www.leboncoin.fr/ad/vetements/3302470047'), false);
  assert.equal(navigationPermise('vinted', 'https://www.vinted.fr/items/10667855416'), false);
  assert.equal(navigationPermise('beebs', 'https://www.beebs.app/fr/p/34300468'), false);
  assert.equal(navigationPermise('vinted', 'https://www.vinted.fr/member/login'), true);
  assert.equal(navigationPermise('beebs', 'https://www.beebs.app/fr/auth'), true);
  assert.equal(navigationPermise('depop', 'http://www.depop.com/login/'), false, 'jamais en clair');
  assert.equal(navigationPermise('vinted', 'https://www.google.com/search?q=x'), false, 'Google hors connexion : jamais');
});
