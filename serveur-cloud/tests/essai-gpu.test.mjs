// (04/11 soir, essai GPU) Les réglages du second serveur : pool non tenu, enregistrement de fond, enregistrement de toutes
// les connexions, filtre anti-pubs du moteur Chrome, nœuds de la puce, achat d'IP sur accord écrit. Tout est COUPÉ par
// défaut (cloud-1 inchangé) : chaque test vérifie aussi le défaut.
import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { randomBytes } from 'node:crypto';
import { lireConfig } from '../src/config.js';
import { creerEntretien } from '../src/entretien.js';
import { specConteneurChrome, DOMAINES_PUBLICITE } from '../src/navigateur.js';
import { suiviDe, jourParis, fichierFond, lieuOnglet, typesSuivis, creerEnregistrementFond, FOND_LIGNES_MAX } from '../src/enregistrementFond.js';
import { lireDomaines, estRegie, demarrerRelais } from '../navigateur-chrome/relais.mjs';
import { creerApprovisionnement } from '../src/approvisionnement.js';
import { chargerRegles } from '../src/regles.js';
import * as journal from '../src/journal.js';

const regles = await chargerRegles();
const ENV = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 's', SUPABASE_ANON_KEY: 'a',
  COFFRE_CLE: randomBytes(32).toString('base64'), TICKETS_CLE: randomBytes(32).toString('base64'), IMAGE_NAVIGATEUR: 'fillsell-navigateur:0123456789abcdef' };
const muet = { info() {}, erreur() {}, alerte() {} };

test('configuration : les réglages de l’essai GPU sont COUPÉS par défaut (cloud-1 inchangé)', () => {
  const c = lireConfig(ENV);
  assert.equal(c.entretienPool, true, 'le pool est tenu par défaut');
  assert.equal(c.enregistrementFond, false);
  assert.equal(c.enregistrementFondSw, false);
  assert.equal(c.enregistrementConnexions, false);
  assert.deepEqual(c.gpuPeripheriques, []);
  const e = lireConfig({ ...ENV, ENTRETIEN_POOL: '0', ENREGISTREMENT_FOND: '1', ENREGISTREMENT_FOND_SW: '1', ENREGISTREMENT_CONNEXIONS: '1',
    GPU_PERIPHERIQUES: 'card1, renderD128, ../../etc/passwd' });
  assert.deepEqual([e.entretienPool, e.enregistrementFond, e.enregistrementFondSw, e.enregistrementConnexions], [false, true, true, true]);
  assert.deepEqual(e.gpuPeripheriques, ['card1', 'renderD128'], 'seuls des nœuds de /dev/dri');
});

test('ENTRETIEN_POOL=0 : seul le pare-feu suit le pool — aucune base du pool, purge, contrôle, visite, échéance, achat, alerte', async (t) => {
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const profils = mkdtempSync(join(tmpdir(), 'fs-essai-gpu-'));   // le profil neuf d'une purge (cas « plein ») se crée ici
  t.after(() => rmSync(profils, { recursive: true, force: true }));
  const faire = (config) => {
    const rpc = [], gestes = [];
    const ips = [{ id: 9, ip: '1.1.1.9', port: 12323, etat: 'repos', dernier_user_id: 'parti', user_id: null },
      { id: 10, ip: '1.1.1.10', port: 12323, etat: 'achetee', user_id: null }];
    const base = {
      from(table) {
        const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: null, error: null }), then: (ok) => ok({ data: table === 'cloud_ips' ? ips : [], error: null }) };
        return q;
      },
      async rpc(nom, a) {
        rpc.push(nom);
        if (nom === 'cloud_etat') return { data: { actif: false }, error: null };
        if (nom === 'cloud_param') return { data: a.p_defaut, error: null };
        if (nom === 'cloud_ip_a_visiter') return { data: [{ ip_id: 10, plateforme: 'beebs' }], error: null };
        if (nom === 'cloud_proxy_identifiants') return { data: 'http://u:p@1.1.1.10:12323', error: null };
        return { data: {}, error: null };
      },
    };
    const pareFeu = { async synchroniser(toutes) { gestes.push(`pare_feu:${toutes.length}`); return { ecrit: true, appliquees: { ports: null, sorties: new Set(['1.1.1.10:12323']) }, manquantes: [] }; }, async appliquees() { return null; } };
    const e = creerEntretien({ config, base, regles, iproyal: { disponible: true, async lireCommande() { gestes.push('echeance'); return {}; } }, pareFeu,
      controles: { async controler() { gestes.push('controle'); return null; }, async visiterPlateforme() { gestes.push('visite'); return null; } },
      fournisseurIp: { async verifierSolde() { gestes.push('solde'); return null; }, async rotationActive() { return false; } },
      navigateurs: { ouverts: () => [], async detruire() { gestes.push('purge'); return { profilsRestants: 0 }; } },
      coffre: { async lire() { return {}; }, async vider() { gestes.push('vider'); return 0; } }, sessions: { async revoquer() {} },
      alertes: { async signaler() { gestes.push('alerte'); } }, journal: muet,
      approvisionnement: { async livrer() { gestes.push('livrer'); return { livrees: 0 }; }, async gardes() { return null; } } });
    return { e, rpc, gestes };
  };
  const coupe = faire({ entretienPool: false, dossierProfils: profils });
  const b = await coupe.e.tour();
  assert.equal(b.pool, 'coupe');
  assert.deepEqual(b.pare_feu, { ecrit: true, manquantes: 0 });
  assert.deepEqual(coupe.gestes, ['pare_feu:2'], 'le pare-feu, rien d’autre');
  assert.deepEqual(coupe.rpc, [], 'aucun appel du pool en base (ni cloud_pool_entretien, ni état, ni visite)');
  // Défaut (cloud-1) : l'entretien complet, comme avant.
  const plein = faire({ dossierProfils: profils });
  await plein.e.tour().catch(() => {});
  assert.equal(plein.rpc[0], 'cloud_pool_entretien');
  assert.ok(plein.gestes.includes('controle') || plein.gestes.includes('purge'), 'sans le réglage : purges et contrôles comme avant');
});

test('moteur Chrome : le filtre anti-pubs passe au relais (BLOQUER_PUBLICITE), les nœuds de la puce se règlent', () => {
  const config = { imageChrome: 'fillsell-chrome:abcdef123456', dossierProfils: '/p', dossierExtensionCrx: '/crx', memoireNavigateur: '2g', reseauDocker: 'fillsell-cloud' };
  const jetonControle = 'ab'.repeat(24);
  const avec = specConteneurChrome({ config: { ...config, bloquerPublicite: true }, user: 'u', profilId: 'p1', proxyUrl: 'http://a:b@1.2.3.4:12323', jetonControle });
  const pub = avec.Env.find((e) => e.startsWith('PUBLICITE='));
  assert.ok(pub && pub.slice(10).split(',').length === DOMAINES_PUBLICITE.length);
  const sans = specConteneurChrome({ config: { ...config, bloquerPublicite: false }, user: 'u', profilId: 'p1', proxyUrl: 'http://a:b@1.2.3.4:12323', jetonControle });
  assert.ok(!sans.Env.some((e) => e.startsWith('PUBLICITE=')));
  const g = specConteneurChrome({ config: { ...config, navigateurGpu: true, gpuPeripheriques: ['card1', 'renderD128'] }, user: 'u', profilId: 'p1', proxyUrl: 'http://a:b@1.2.3.4:12323', jetonControle });
  assert.deepEqual(g.HostConfig.Devices.map((d) => d.PathOnHost), ['/dev/dri/card1', '/dev/dri/renderD128']);
  const d = specConteneurChrome({ config: { ...config, navigateurGpu: true }, user: 'u', profilId: 'p1', proxyUrl: 'http://a:b@1.2.3.4:12323', jetonControle });
  assert.deepEqual(d.HostConfig.Devices.map((x) => x.PathOnHost), ['/dev/dri/card0', '/dev/dri/renderD128'], 'défaut du 30/10');
});

test('relais : une régie publicitaire refusée en 403 SANS connexion amont, comptée ; sans liste, rien ne change', async () => {
  assert.deepEqual(lireDomaines('doubleclick.net, Criteo.com.,x,../a,'), ['doubleclick.net', 'criteo.com']);
  assert.equal(estRegie('securepubads.g.doubleclick.net:443', ['doubleclick.net']), true);
  assert.equal(estRegie('notdoubleclick.net', ['doubleclick.net']), false);
  const etat = { connexions: 0 };
  const amont = net.createServer((c) => { etat.connexions++; c.once('data', () => c.end('HTTP/1.1 200 Connection established\r\n\r\n')); c.on('error', () => {}); });
  await new Promise((ok) => amont.listen(0, '127.0.0.1', ok));
  const connecter = (port, cible) => new Promise((ok, ko) => {
    const c = net.connect(port, '127.0.0.1', () => c.write(`CONNECT ${cible} HTTP/1.1\r\nHost: ${cible}\r\n\r\n`));
    let lu = '';
    c.on('data', (x) => { lu += x; if (lu.includes('\r\n')) { c.destroy(); ok(lu.split('\r\n')[0]); } });
    c.on('error', ko); c.on('close', () => ok(lu.split('\r\n')[0]));
  });
  const jeton = randomBytes(24).toString('hex');
  const r = await demarrerRelais({ proxyAmont: `http://u:p@127.0.0.1:${amont.address().port}`, permises: 'vinted', jetonControle: jeton,
    publicite: DOMAINES_PUBLICITE.join(','), portRelais: 0, portExtension: 0, portControle: 0, hoteControle: '127.0.0.1', dossierCrx: '/inexistant' });
  const sans = await demarrerRelais({ proxyAmont: `http://u:p@127.0.0.1:${amont.address().port}`, permises: 'vinted', jetonControle: jeton,
    portRelais: 0, portExtension: 0, portControle: 0, hoteControle: '127.0.0.1', dossierCrx: '/inexistant' });
  try {
    assert.match(await connecter(r.ports.relais, 'securepubads.g.doubleclick.net:443'), /^HTTP\/1\.1 403/);
    assert.match(await connecter(r.ports.relais, 'bidder.criteo.com:443'), /^HTTP\/1\.1 403/);
    assert.equal(etat.connexions, 0, 'une régie ne sort JAMAIS');
    assert.match(await connecter(r.ports.relais, 'www.vinted.fr:443'), /^HTTP\/1\.1 200/);
    assert.match(await connecter(r.ports.relais, 'geo.captcha-delivery.com:443'), /^HTTP\/1\.1 200/, 'DataDome jamais coupé');
    assert.equal(etat.connexions, 2);
    const e = await (await fetch(`http://127.0.0.1:${r.ports.controle}/etat`, { headers: { 'X-Jeton': jeton } })).json();
    assert.equal(e.publicites, 2);
    assert.match(await connecter(sans.ports.relais, 'securepubads.g.doubleclick.net:443'), /^HTTP\/1\.1 200/, 'sans liste : comme avant');
  } finally { await r.fermer(); await sans.fermer(); await new Promise((ok) => amont.close(() => ok())); }
});

test('enregistrement de fond : ce qui est suivi, le fichier du jour (heure de Paris), l’onglet sans query', () => {
  assert.equal(suiviDe('https://api.leboncoin.fr/api/messaging-items-api/v3/conversations?x=1'), 'leboncoin');
  assert.equal(suiviDe('https://www.beebs.app/fr'), 'beebs');
  assert.equal(suiviDe('https://images1.vinted.net/t/a.jpg'), 'vinted');
  assert.equal(suiviDe('https://geo.captcha-delivery.com/captcha/?initialCid=abc'), 'datadome');
  assert.equal(suiviDe('https://securepubads.g.doubleclick.net/gampad'), null);
  assert.equal(suiviDe('https://xxx.supabase.co/rest/v1/x'), null, 'jamais FillSell ni un tiers');
  assert.equal(suiviDe('chrome-extension://abc/background.js'), null);
  // 04/11 23:30 UTC = 05/11 00:30 à Paris : le fichier change avec le jour de Paris.
  assert.equal(jourParis(Date.parse('2026-11-04T22:59:00Z')), '2026-11-04');
  assert.equal(jourParis(Date.parse('2026-11-04T23:30:00Z')), '2026-11-05');
  assert.equal(fichierFond('/e', 'f44b5917-bccc-4431', Date.parse('2026-11-04T23:30:00Z')), '/e/essais/fond-f44b5917-2026-11-05.jsonl');
  assert.deepEqual(lieuOnglet('https://www.leboncoin.fr/compte/part/mes-annonces?page=2#x'), { hote: 'www.leboncoin.fr', chemin: '/compte/part/mes-annonces' });
  assert.deepEqual([...typesSuivis()], ['page'], 'le service worker seulement sur réglage');
  assert.deepEqual([...typesSuivis({ serviceWorker: true })].sort(), ['page', 'service_worker']);
});

/** Un faux navigateur DevTools : enregistre les méthodes appelées, émet des évènements. */
function fauxCdp({ cibles = [] } = {}) {
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
      if (methode === 'Network.getResponseBody') return { body: '{"view":"captcha","cookie":"datadome=SECRET; Path=/"}', base64Encoded: false };
      return {};
    },
  };
}

test('enregistrement de fond : onglets et requêtes des plateformes / DataDome, jamais une query ni un jeton, rien de visible par la page', async () => {
  const ecrit = [];
  let horloge = Date.parse('2026-11-04T19:00:00Z');
  const cdp = fauxCdp({ cibles: [{ targetId: 'T-onglet-1', type: 'page', url: 'https://www.leboncoin.fr/?ref=x' }, { targetId: 'T-sw', type: 'service_worker', url: 'chrome-extension://e/bg.js' }] });
  const f = creerEnregistrementFond({ config: { enregistrementFond: true, dossierEtat: '/etat' }, journal: muet, maintenant: () => horloge,
    ecrireFichier: async (fichier, l) => { ecrit.push([fichier, JSON.parse(l)]); }, creerDossier: async () => {} });
  assert.equal(await f.suivre('f44b5917-bccc', { cdp, moteur: 'chrome' }), true);
  // Le service worker n'est PAS attaché sans ENREGISTREMENT_FOND_SW (il ne s'endormirait plus).
  assert.deepEqual(cdp.appels.filter((a) => a[0] === 'Target.attachToTarget').map((a) => a[2].targetId), ['T-onglet-1']);
  // Une page et son cadre DataDome.
  cdp.emettre({ method: 'Target.attachedToTarget', sessionId: 'S1', params: { sessionId: 'C1', targetInfo: { type: 'iframe', url: 'https://geo.captcha-delivery.com/captcha/?x=1' } } });
  cdp.emettre({ method: 'Network.requestWillBeSent', sessionId: 'S1', params: { requestId: 'r1', type: 'Fetch', wallTime: horloge / 1000, request: { url: 'https://api.leboncoin.fr/api/messaging-items-api/v3/conversations?token=SECRET', method: 'GET' } } });
  cdp.emettre({ method: 'Network.requestWillBeSentExtraInfo', sessionId: 'S1', params: { requestId: 'r1', associatedCookies: [{ cookie: { name: 'datadome', value: 'SECRET', domain: '.leboncoin.fr' } }] } });
  cdp.emettre({ method: 'Network.responseReceived', sessionId: 'S1', params: { requestId: 'r1', response: { status: 403 } } });
  cdp.emettre({ method: 'Network.loadingFinished', sessionId: 'S1', params: { requestId: 'r1' } });
  cdp.emettre({ method: 'Network.requestWillBeSent', sessionId: 'S1', params: { requestId: 'r2', type: 'Script', request: { url: 'https://securepubads.g.doubleclick.net/tag/js/gpt.js', method: 'GET' } } });
  cdp.emettre({ method: 'Network.loadingFinished', sessionId: 'S1', params: { requestId: 'r2' } });
  cdp.emettre({ method: 'Network.requestWillBeSent', sessionId: 'C1', params: { requestId: 'r3', type: 'XHR', request: { url: 'https://geo.captcha-delivery.com/interstitial/?cid=abc&hash=12345', method: 'POST', postData: 'payload=xyz' } } });
  cdp.emettre({ method: 'Network.responseReceived', sessionId: 'C1', params: { requestId: 'r3', response: { status: 200 } } });
  cdp.emettre({ method: 'Network.loadingFinished', sessionId: 'C1', params: { requestId: 'r3' } });
  await new Promise((r) => setTimeout(r, 20));
  // Un onglet ouvert, navigué, fermé.
  cdp.emettre({ method: 'Target.targetCreated', params: { targetInfo: { targetId: 'T-onglet-2', type: 'page', url: 'about:blank' } } });
  cdp.emettre({ method: 'Target.targetInfoChanged', params: { targetInfo: { targetId: 'T-onglet-2', type: 'page', url: 'https://www.beebs.app/fr/mes-annonces?tab=1' } } });
  cdp.emettre({ method: 'Target.targetDestroyed', params: { targetId: 'T-onglet-2' } });
  horloge = Date.parse('2026-11-04T23:30:00Z');   // minuit passé à Paris : nouveau fichier
  f.arreter('f44b5917-bccc', 'fermeture');
  await new Promise((r) => setTimeout(r, 20));
  const lignes = ecrit.map(([, l]) => l);
  const requetes = lignes.filter((l) => l.suivi);
  assert.deepEqual(requetes.map((l) => l.hote), ['api.leboncoin.fr', 'geo.captcha-delivery.com'], 'plateformes et DataDome seulement, aucune régie');
  const lbc = requetes[0];
  assert.equal(lbc.http, 403); assert.equal(lbc.chemin, '/api/messaging-items-api/v3/conversations'); assert.equal(lbc.suivi, 'leboncoin');
  assert.deepEqual(lbc.cookies_envoyes, [{ nom: 'datadome', domaine: '.leboncoin.fr' }]);
  const dd = requetes[1];
  assert.equal(dd.cadre, 'geo.captcha-delivery.com'); assert.deepEqual(dd.parametres, ['cid:3', 'hash:5']); assert.equal(dd.corps_octets, 11);
  assert.equal(dd.reponse.view, 'captcha'); assert.ok(!JSON.stringify(ecrit).includes('SECRET'), 'jamais une valeur de cookie, de query ni un jeton');
  assert.deepEqual(lignes.filter((l) => /^onglet_/.test(l.evenement ?? '')).map((l) => `${l.evenement}:${l.hote ?? ''}|${l.chemin ?? ''}`),
    ['onglet_ouvert:www.leboncoin.fr|/', 'onglet_ouvert:about|blank', 'onglet_navigue:www.beebs.app|/fr/mes-annonces', 'onglet_ferme:|']);
  assert.ok(ecrit.at(-1)[0].endsWith('fond-f44b5917-2026-11-05.jsonl') && ecrit[0][0].endsWith('fond-f44b5917-2026-11-04.jsonl'));
  const methodes = new Set(cdp.appels.map((a) => a[0]));
  for (const interdit of ['Runtime.enable', 'Page.enable', 'Debugger.enable', 'Runtime.evaluate', 'Page.addScriptToEvaluateOnNewDocument']) assert.ok(!methodes.has(interdit), interdit);
  assert.ok(cdp.appels.filter((a) => a[0] === 'Target.setAutoAttach').every((a) => a[2].waitForDebuggerOnStart === false), 'jamais une page mise en pause');
  assert.ok(cdp.appels.some((a) => a[0] === 'Target.detachFromTarget'), 'détaché à la fermeture');
  assert.ok(FOND_LIGNES_MAX >= 10_000);
  // Coupé par défaut : rien.
  const rien = creerEnregistrementFond({ config: { dossierEtat: '/etat' }, journal: muet });
  assert.equal(await rien.suivre('u', { cdp: fauxCdp() }), false);
});

test('achat d’IP : sur ACCORD ÉCRIT, l’interrupteur à 0 ne bloque plus — serveur, plafond, solde et registre tiennent', async () => {
  const faire = ({ params = { ip_achats_auto: 0, ip_budget_mensuel_usd: 60 }, depense = 8, achatsAutorises = true } = {}) => {
    const appels = [], inseres = [], gestes = [];
    const base = {
      async rpc(nom, a) {
        appels.push(nom);
        if (nom === 'cloud_param') return { data: params[a.p_cle] ?? a.p_defaut, error: null };
        if (nom === 'cloud_ip_depenses_mois') return { data: depense, error: null };
        if (nom === 'cloud_ip_depense_ouvrir') return { data: { ok: false, raison: 'interrupteur_coupe' }, error: null };
        return { data: true, error: null };
      },
      from(table) {
        const q = { select: () => q, eq: () => q, in: () => q, then: (r) => Promise.resolve({ data: [], error: null }).then(r),
          insert(l) { inseres.push([table, l]); return { select: () => ({ maybeSingle: async () => ({ data: { id: 777 }, error: null }) }) }; } };
        return q;
      },
    };
    const iproyal = { disponible: true, achatsAutorises, async catalogueIsp() { return { produitId: 9, planId: 22, lieuId: 25 }; },
      async prixCommande() { return 4; }, async commander(n) { gestes.push(['commander', n]); return { id: 88001 }; }, async lireCommande() { return { status: 'in-progress', proxy_data: { proxies: [] } }; } };
    const a = creerApprovisionnement({ base, iproyal, regles, journal, alertes: null, attendreLivraisonMs: 0 });
    return { a, appels, inseres, gestes };
  };
  const un = { aCommander: 1, vise: 1, projete: 0 };
  // Sans accord : refus, comme avant (interrupteur coupé), rien au registre ni chez IPRoyal.
  const sans = faire();
  assert.equal((await sans.a.acheter(un, await sans.a.gardes(), { montant: 25 })).raison, 'interrupteur_coupe');
  assert.deepEqual(sans.gestes, []); assert.deepEqual(sans.inseres, []);
  // Accord trop court : ignoré.
  const court = faire();
  assert.equal((await court.a.acheter(un, await court.a.gardes(), { montant: 25 }, { accordEcrit: 'oui' })).raison, 'interrupteur_coupe');
  // Avec l'accord : registre AVANT la commande (go_par = l'accord), UNE IP.
  const ok = faire();
  const accord = 'Nico, 04/11 17:00 : « Une IP neuve (4 $) »';
  const r = await ok.a.acheter(un, await ok.a.gardes(), { montant: 25 }, { accordEcrit: accord });
  assert.equal(r.fait, true);
  assert.equal(ok.inseres.length, 1);
  const [table, ligne] = ok.inseres[0];
  assert.equal(table, 'cloud_ip_commandes'); assert.equal(ligne.statut, 'demandee'); assert.equal(ligne.quantite, 1);
  assert.match(ligne.go_par, /^accord écrit de Nico : /); assert.equal(ligne.details.accord_ecrit, accord);
  assert.deepEqual(ok.gestes, [['commander', 1]]);
  assert.ok(!ok.appels.includes('cloud_ip_depense_ouvrir'), 'le registre automatique (qui refuserait) n’est pas appelé');
  // L'accord ne lève RIEN d'autre : serveur sans autorisation, plafond atteint, solde court.
  const serveur = faire({ achatsAutorises: false });
  assert.equal((await serveur.a.acheter(un, await serveur.a.gardes(), { montant: 25 }, { accordEcrit: accord })).raison, 'achats_coupes_serveur');
  const plafond = faire({ depense: 58 });
  assert.equal((await plafond.a.acheter(un, await plafond.a.gardes(), { montant: 25 }, { accordEcrit: accord })).raison, 'plafond');
  const solde = faire();
  assert.equal((await solde.a.acheter(un, await solde.a.gardes(), { montant: 3 }, { accordEcrit: accord })).raison, 'solde_insuffisant');
  for (const x of [serveur, plafond, solde]) { assert.deepEqual(x.gestes, []); assert.deepEqual(x.inseres, []); }
});

// ── (04/11 soir, règle de Nico) Les pauses de la messagerie et de la veille des commandes ─────────────────────────────
test('changement de machine ou d\'IP dédiée : oui ; même poste, inconnu ou rotation : non', async () => {
  const { changementDePoste } = await import('../src/pausesMessagerie.js');
  const c1 = { serveur: 'cloud-1', ip_id: 39, mode: 'dedie' };
  assert.equal(changementDePoste(null, c1), false, 'avant inconnu : on ne lève rien');
  assert.equal(changementDePoste(c1, { ...c1 }), false);
  assert.equal(changementDePoste(c1, { serveur: 'cloud-2', ip_id: 39, mode: 'dedie' }), true, 'autre machine');
  assert.equal(changementDePoste(c1, { serveur: 'cloud-1', ip_id: 42, mode: 'dedie' }), true, 'autre IP dédiée');
  assert.equal(changementDePoste({ ...c1, mode: 'rotation' }, { serveur: 'cloud-1', ip_id: 7, mode: 'rotation' }), false, 'rotation : l\'IP change par construction');
});

test('la coupure levée dans l\'extension : seulement « coupee » des plateformes visées, dans les deux états', async () => {
  const { expressionLeverCoupures, CLES_ETAT_EXTENSION } = await import('../src/pausesMessagerie.js');
  const vm = await import('node:vm');
  const coupee = { le: 'x', jusqu: 9e12, motif: 'http_403' };
  const stock = { messagerie_beta_etat: { leboncoin: { coupee, prochain: 5 }, vinted: { coupee } }, veille_commandes_etat: { leboncoin: { coupee, typeCompte: 'individual' } } };
  const chrome = { storage: { local: {
    get: async (cles) => Object.fromEntries(cles.map((k) => [k, structuredClone(stock[k])])),
    set: async (o) => { Object.assign(stock, o); },
  } } };
  // (un autre royaume : comparé par sa forme JSON)
  const levees = JSON.parse(JSON.stringify(await vm.runInNewContext(expressionLeverCoupures(['leboncoin', 'ebay']), { chrome })));
  assert.deepEqual(levees, { messagerie_beta_etat: ['leboncoin'], veille_commandes_etat: ['leboncoin'] });
  assert.deepEqual(stock.messagerie_beta_etat, { leboncoin: { prochain: 5 }, vinted: { coupee } }, 'Vinted et la cadence intacts');
  assert.deepEqual(stock.veille_commandes_etat, { leboncoin: { typeCompte: 'individual' } });
  assert.deepEqual(CLES_ETAT_EXTENSION, ['messagerie_beta_etat', 'veille_commandes_etat']);
});

test('lever en base : la pause seule (résolution), la pause et sa mémoire (changement de poste) ; navigateur fermé = base seule', async () => {
  const { creerPausesMessagerie } = await import('../src/pausesMessagerie.js');
  const appels = [];
  const base = { from: (table) => {
    const a = { table, filtres: [] }; appels.push(a);
    const q = {
      update: (p) => { a.patch = p; return q; }, eq: (k, v) => { a.filtres.push(['eq', k, v]); return q; },
      in: (k, v) => { a.filtres.push(['in', k, v]); return q; }, gt: (k) => { a.filtres.push(['gt', k]); return q; },
      or: (f) => { a.filtres.push(['or', f.replace(/\d{4}-[^,]*Z/, 'T')]); return q; },
      select: async () => ({ data: [{ platform: 'leboncoin' }], error: null }),
    };
    return q;
  } };
  const p = creerPausesMessagerie({ config: { dossierExtension: '/nulle-part' }, base, navigateurs: { ouvert: () => null }, journal: { info() {}, alerte() {} } });
  assert.deepEqual(await p.lever('u', ['leboncoin', 'ebay'], { raison: 'resolution (resoudre)' }), { base: ['leboncoin'], extension: null });
  assert.deepEqual(appels[0].patch, { pause_jusqu_au: null });
  assert.deepEqual(appels[0].filtres, [['eq', 'user_id', 'u'], ['in', 'platform', ['leboncoin']], ['gt', 'pause_jusqu_au']]);
  await p.lever('u', null, { raison: 'changement_de_poste', oublier: true });
  assert.deepEqual(appels[1].patch, { pause_jusqu_au: null, bloque_le: null });
  assert.deepEqual(appels[1].filtres[1], ['in', 'platform', ['vinted', 'leboncoin', 'beebs', 'depop']]);
  assert.deepEqual(appels[1].filtres[2], ['or', 'pause_jusqu_au.gt.T,bloque_le.not.is.null']);
});
