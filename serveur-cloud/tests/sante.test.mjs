// (07/11 soir, ordres 3 et 4 de Nico) LE CONTRÔLE DE SANTÉ DES IP LIBRES — sans réseau, sans Docker, sans base : faux
// conteneur, faux Chrome (CDP scripté), fausse horloge, fausse base. Les verdicts de la vérification manuelle du 07/11
// (17:26-17:40) : la vérification d'appareil DataDome de Beebs qui passe seule = OUVERTE ; eBay en 403 (Akamai) = MUR.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as regles from '../../supabase/functions/_shared/cloud-pool.js';
import { mursDe, arreterVisite, verdictPlateforme, verdictSortie, bilanControle, specConteneurSante, creerSante, PLATEFORMES_SANTE, ADRESSES_SORTIE,
  SANTE_DUREE_MIN_MS } from '../src/sante.js';
import { creerEntretien } from '../src/entretien.js';
import { asnDe, lireAsCymru, asnOrigineCymru, rangDeLOperateur, operateurDeSortie } from '../src/operateur.js';

// Les réponses DNS de Team Cymru relevées le 07/11 au soir (AS<n>.asn.cymru.com, <ip inversée>.origin.asn.cymru.com).
const CYMRU = {
  'AS5511.asn.cymru.com': [['5511 | FR | ripencc | 1996-01-08 | Opentransit - Orange S.A., FR']],
  'AS6830.asn.cymru.com': [['6830 | NL | ripencc | 1996-11-13 | LibertyGlobal - Liberty Global Europe Holding B.V., NL']],
  'AS2914.asn.cymru.com': [['2914 | US | arin | 1998-12-07 | NTT-DATA-2914 - NTT America, Inc., US']],
  'AS12322.asn.cymru.com': [['12322 | FR | ripencc | 1999-03-11 | PROXAD - Free SAS, FR']],
  '136.239.181.81.origin.asn.cymru.com': [['2914 | 81.181.236.0/22 | RO | ripencc | 2003-02-04']],
};
const fauxDns = (journalDns = []) => async (nom) => { journalDns.push(nom); if (CYMRU[nom]) return CYMRU[nom]; throw Object.assign(new Error('ENOTFOUND'), { code: 'ENOTFOUND' }); };

const journal = { info() {}, alerte() {}, erreur() {} };
const J = 86_400_000;
const iso = (t) => new Date(t).toISOString();
const HOTE = (pf) => PLATEFORMES_SANTE.find((x) => x.plateforme === pf).hote;
const page = (hote, x = {}) => ({ hote, pret: true, statut_nav: 200, ...x });
const suite = (etats, pas = 2500) => etats.map((e, i) => ({ t: (i + 1) * pas, e }));

test('(07/11 soir) l’opérateur de sortie : le pays d’enregistrement de l’AS (Team Cymru), sans liste — français 0, européen 1, hors d’Europe 2', async () => {
  assert.equal(asnDe('AS2914 NTT America, Inc.'), '2914');
  assert.equal(asnDe('AS6830 Liberty Global Europe Holding B.V.'), '6830');
  assert.equal(asnDe('Orange S.A.'), null);
  assert.deepEqual(lireAsCymru(CYMRU['AS2914.asn.cymru.com']), { as: '2914', pays: 'US', registre: 'arin', nom: 'NTT-DATA-2914 - NTT America, Inc., US' });
  assert.equal(lireAsCymru([['n’importe quoi']]), null);
  assert.equal(asnOrigineCymru(CYMRU['136.239.181.81.origin.asn.cymru.com']), '2914');
  assert.equal(rangDeLOperateur({ pays: 'FR', registre: 'ripencc' }), 0, 'Orange, SFR, Bouygues, Free : AS enregistrés en France');
  assert.equal(rangDeLOperateur({ pays: 'NL', registre: 'ripencc' }), 1, 'Liberty Global (NL) : européen');
  assert.equal(rangDeLOperateur({ pays: 'US', registre: 'arin' }), 2, 'NTT America (US, ARIN) : hors d’Europe');
  assert.equal(rangDeLOperateur({ pays: 'SG', registre: 'apnic' }), 2);
  assert.equal(rangDeLOperateur({ pays: null, registre: null }), null);
  // Les 7 IP du 07/11 : la 3 et la 40 (NTT America) au dernier rang, la 2 et la 4 (Liberty Global) au milieu, les autres françaises.
  for (const [as, rang] of [['AS5511 Orange S.A.', 0], ['AS6830 Liberty Global Europe Holding B.V.', 1], ['AS2914 NTT America, Inc.', 2], ['AS12322 Free SAS', 0]]) {
    const o = await operateurDeSortie({ ip: '10.0.0.1', asTexte: as, resoudreTxt: fauxDns() });
    assert.equal(o.rang, rang, as);
    assert.equal(o.atypique, rang > 0, as);
  }
  // Sans « as » lisible : l'origine BGP de l'IP ; rien de lisible : null (jamais une cause d'échec du contrôle).
  const parOrigine = await operateurDeSortie({ ip: '81.181.239.136', asTexte: null, resoudreTxt: fauxDns() });
  assert.deepEqual([parOrigine.as, parOrigine.rang, parOrigine.source], ['2914', 2, 'origine_bgp']);
  assert.equal(await operateurDeSortie({ ip: '10.0.0.2', asTexte: '', resoudreTxt: fauxDns() }), null);
  const muet = await operateurDeSortie({ ip: '10.0.0.3', asTexte: 'AS64512 Inconnu', resoudreTxt: fauxDns() });
  assert.deepEqual([muet.as, muet.rang, muet.atypique], ['64512', null, false], 'DNS muet : l’AS seul, rang inconnu (au milieu en base), jamais atypique');
  const b = bilanControle({ sortie: verdictSortie({ ip: '81.181.239.136', ipApi: { status: 'success', query: '81.181.239.136', countryCode: 'FR', hosting: false, proxy: false, as: 'AS2914 NTT America, Inc.' } }),
    visites: [{ plateforme: 'vinted', verdict: 'ouverte' }], operateur: parOrigine });
  assert.deepEqual([b.echecs, b.inconnus, b.operateur.rang], [[], [], 2], 'atypique, mais SAINE : aucun échec');
  assert.equal(regles.santeSuivante(null, { fait_le: new Date().toISOString(), ...b }).operateur.rang, 2, 'le rang va dans la santé écrite en base');
});

test('verdict d’une plateforme : la vérification d’appareil de Beebs qui passe seule = ouverte ; eBay 403 = mur ; les murs nets', () => {
  // Beebs (07/11) : /interstitial/ puis 200 seul en moins de 13 s, sans geste.
  const beebs = suite([page('www.beebs.app', { dd_interstitiel: true, statut_nav: 403 }), page('www.beebs.app', { dd_interstitiel: true, statut_nav: 403 }),
    page('www.beebs.app'), page('www.beebs.app'), page('www.beebs.app')]);
  const v = verdictPlateforme({ echantillons: beebs, statutDocument: 200, hote: HOTE('beebs') });
  assert.equal(v.verdict, 'ouverte');
  assert.deepEqual(v.vus, ['datadome_verification'], 'passée, seulement notée');
  // … qui n'en sort pas en 30 s : mur.
  const coincee = suite(Array.from({ length: 12 }, () => page('www.beebs.app', { dd_interstitiel: true, statut_nav: 403 })));
  assert.deepEqual(verdictPlateforme({ echantillons: coincee, statutDocument: 403, hote: HOTE('beebs') }), { verdict: 'mur', murs: ['datadome_verification'], vus: ['datadome_verification'], statut: 403 });
  // Un 403 sans marqueur (le cas d'eBay sur l'IP 40 le 07/11 ; eBay n'est plus contrôlé depuis le 14/11 — complément 3 de
  // Nico — la règle du 403 reste, ici sur Leboncoin) : page prête, aucun marqueur… mais le document final est un 403.
  const lbc403 = suite([page('www.leboncoin.fr', { statut_nav: 403 }), page('www.leboncoin.fr', { statut_nav: 403 }), page('www.leboncoin.fr', { statut_nav: 403 }),
    page('www.leboncoin.fr', { statut_nav: 403 }), page('www.leboncoin.fr', { statut_nav: 403 })]);
  assert.deepEqual(verdictPlateforme({ echantillons: lbc403, statutDocument: 403, hote: HOTE('leboncoin') }).murs, ['http_403']);
  assert.deepEqual(verdictPlateforme({ echantillons: lbc403, hote: HOTE('leboncoin') }).murs, ['http_403'], 'sans le réseau : le statut de la page (performance)');
  assert.ok(!PLATEFORMES_SANTE.some((x) => x.plateforme === 'ebay'), '14/11 : eBay ne passe jamais par l’IP du poste Cloud, il n’est plus contrôlé');
  assert.deepEqual(verdictPlateforme({ echantillons: suite([page('www.vinted.fr', { statut_nav: 429 })]), statutDocument: 429, hote: HOTE('vinted') }).murs, ['http_429']);
  for (const [cle, code] of [['dd_captcha', 'datadome_glissiere'], ['dd_bloque', 'datadome_bloque'], ['restreint', 'acces_restreint'], ['akamai', 'akamai'],
    ['perimeterx', 'perimeterx'], ['turnstile_visible', 'turnstile'], ['hcaptcha_visible', 'hcaptcha'], ['recaptcha_defi_visible', 'recaptcha']]) {
    assert.deepEqual(verdictPlateforme({ echantillons: suite([page('www.leboncoin.fr', { [cle]: true })]), statutDocument: 200, hote: HOTE('leboncoin') }).murs, [code], code);
  }
  // Cloudflare « Just a moment » passé = ouverte ; resté = mur.
  const cf = suite([page('www.depop.com', { cloudflare: true }), page('www.depop.com'), page('www.depop.com'), page('www.depop.com'), page('www.depop.com')]);
  assert.equal(verdictPlateforme({ echantillons: cf, statutDocument: 200, hote: HOTE('depop') }).verdict, 'ouverte');
  assert.deepEqual(verdictPlateforme({ echantillons: suite([page('www.depop.com', { cloudflare: true })]), statutDocument: 200, hote: HOTE('depop') }).murs, ['cloudflare']);
  // Ni le cookie « datadome », ni le badge reCAPTCHA caché ne sont des murs (aucun champ pour eux).
  assert.deepEqual(mursDe(page('www.vinted.fr', { recaptcha_charge: true, cookie_datadome: true })), []);
  // Sans conclusion : jamais un échec.
  assert.equal(verdictPlateforme({ echantillons: suite([page('www.vinted.fr', { pret: false })]), hote: HOTE('vinted') }).verdict, 'indeterminee');
  assert.equal(verdictPlateforme({ echantillons: suite([page('consent.example.com'), page('consent.example.com'), page('consent.example.com'), page('consent.example.com'), page('consent.example.com')]), hote: HOTE('vinted') }).verdict, 'indeterminee', 'hors du site');
  assert.equal(verdictPlateforme({ echantillons: suite([page('www.vinted.fr'), page('www.vinted.fr')]), statutDocument: 200, hote: HOTE('vinted') }).verdict, 'indeterminee', 'avant 12 s');
  assert.equal(verdictPlateforme({ echantillons: [], hote: HOTE('vinted') }).verdict, 'indeterminee');
});

test('arrêt de la visite : un mur NET vu deux fois de suite, ou la page ouverte deux fois de suite après 12 s ; jamais sur un mur passager', () => {
  assert.equal(arreterVisite(suite([page('www.beebs.app', { dd_captcha: true }), page('www.beebs.app', { dd_captcha: true })]), HOTE('beebs')), true);
  assert.equal(arreterVisite(suite([page('www.beebs.app', { dd_interstitiel: true }), page('www.beebs.app', { dd_interstitiel: true })]), HOTE('beebs')), false);
  const ouverte = suite(Array.from({ length: 6 }, () => page('www.vinted.fr')));
  assert.equal(arreterVisite(ouverte.slice(0, 4), HOTE('vinted')), false, '10 s : pas encore');
  assert.equal(arreterVisite(ouverte.slice(0, 5), HOTE('vinted')), true, `${SANTE_DUREE_MIN_MS / 1000} s et deux fois ouverte`);
});

test('la sortie : France, ni hébergeur ni proxy (ip-api), la bonne IP ; ip-api illisible = inconnu, jamais un échec', () => {
  const ipApi = { status: 'success', query: '88.151.56.82', countryCode: 'FR', country: 'France', hosting: false, proxy: false, mobile: false, org: 'Liberty Global', as: 'AS6830' };
  const ipinfo = { ip: '88.151.56.82', country: 'FR', org: 'AS6830 Liberty Global' };
  assert.deepEqual(verdictSortie({ ip: '88.151.56.82', ipinfo, ipApi }).echecs, []);
  assert.equal(verdictSortie({ ip: '88.151.56.82', ipinfo, ipApi }).inconnu, false);
  assert.deepEqual(verdictSortie({ ip: '88.151.56.82', ipinfo, ipApi: { ...ipApi, hosting: true } }).echecs, ['sortie:hebergeur']);
  assert.deepEqual(verdictSortie({ ip: '88.151.56.82', ipinfo, ipApi: { ...ipApi, proxy: true } }).echecs, ['sortie:proxy']);
  assert.deepEqual(verdictSortie({ ip: '88.151.56.82', ipinfo, ipApi: { ...ipApi, countryCode: 'DE' } }).echecs, ['sortie:pays']);
  assert.deepEqual(verdictSortie({ ip: '88.151.56.82', ipinfo, ipApi: { ...ipApi, query: '1.2.3.4' } }).echecs, ['sortie:autre_ip']);
  const sansIpApi = verdictSortie({ ip: '88.151.56.82', ipinfo, ipApi: { status: 'fail', message: 'quota' } });
  assert.deepEqual([sansIpApi.echecs, sansIpApi.inconnu], [[], true], 'hébergeur et proxy non vérifiés : inconnu');
  assert.deepEqual(verdictSortie({ ip: '88.151.56.82', ipinfo: { ip: '88.151.56.82', country: 'BE' }, ipApi: null }).echecs, ['sortie:pays'], 'ipinfo seul dit encore le pays');
  const b = bilanControle({ sortie: verdictSortie({ ip: '88.151.56.82', ipinfo, ipApi }), visites: [
    { plateforme: 'vinted', verdict: 'ouverte' }, { plateforme: 'ebay', verdict: 'mur', murs: ['http_403'], statut: 403 }, { plateforme: 'depop', verdict: 'indeterminee' }] });
  assert.deepEqual([b.echecs, b.inconnus], [['ebay'], ['depop']]);
  assert.deepEqual(b.resume.plateformes.ebay, { verdict: 'mur', murs: ['http_403'], statut: 403 });
});

const CONFIG = { imageChrome: 'fillsell-chrome:0123456789ab', dossierProfils: '/srv/p', dossierExtensionCrx: '/srv/crx', memoireNavigateur: '3g',
  reseauDocker: 'fillsell-cloud', navigateurGpu: true, gpuPeripheriques: [], gpuGroupes: ['44'], bloquerPublicite: true, socketDocker: '/x.sock', dossierEtat: '/tmp' };
const PROXY = 'http://u:mdp@88.151.56.82:12323';

test('le conteneur du contrôle : la spécification d’un Chrome de compte (image, puce, relais, réseau) SANS profil ni extension, 4 plateformes (sans eBay, 14/11), 2 Gio', () => {
  const s = specConteneurSante({ config: CONFIG, ipId: 41, proxyUrl: PROXY, jetonControle: 'a'.repeat(48) });
  assert.equal(s.Image, CONFIG.imageChrome);
  assert.deepEqual(s.HostConfig.Binds, ['/tmp/.X11-unix:/tmp/.X11-unix:ro'], 'ni le profil d’un compte, ni l’extension : la puce seulement');
  assert.ok(s.HostConfig.Devices.length === 2 && s.HostConfig.NetworkMode === 'fillsell-cloud' && s.HostConfig.Memory === 2 * 1024 ** 3);
  assert.ok(s.Env.includes(`PROXY_AMONT=${PROXY}`) && s.Env.includes('PLATEFORMES_PERMISES=vinted,leboncoin,beebs,depop') && s.Env.includes('PROFIL=/profil'));
  assert.ok(!s.Env.some((e) => /^PROXY_(SECOURS|BEEBS)=/.test(e)), 'une seule sortie : l’IP contrôlée');
  assert.deepEqual(s.Labels, { 'fillsell.cloud': '1', 'fillsell.controle': '41', 'fillsell.essai': 'sante' }, 'fillsell.controle : supprimé au redémarrage');
});

/** Un faux Chrome : chaque plateforme rend ses états (EXPRESSION_SANTE) et le statut de son document. */
function fauxChrome(scenario) {
  const ecouteurs = new Set();
  let n = 0;
  const onglets = new Map();   // sessionId → { pf, i }
  const naviguees = [];
  return {
    naviguees,
    async connecter() {
      return {
        on(f) { ecouteurs.add(f); return () => ecouteurs.delete(f); },
        fermer() {},
        async send(m, p = {}, sid) {
          if (m === 'Target.createTarget') return { targetId: `T${++n}` };
          if (m === 'Target.attachToTarget') { onglets.set(`S${n}`, { pf: null, i: 0 }); return { sessionId: `S${n}` }; }
          if (m === 'Page.navigate') {
            const pf = PLATEFORMES_SANTE.find((x) => x.url === p.url).plateforme;
            naviguees.push(pf);
            onglets.get(sid).pf = pf;
            for (const statut of scenario[pf].documents) for (const f of ecouteurs) f({ sessionId: sid, method: 'Network.responseReceived', params: { type: 'Document', frameId: `F-${sid}`, response: { status: statut, url: p.url } } });
            return {};
          }
          if (m === 'Page.getFrameTree') return { frameTree: { frame: { id: `F-${sid}` } } };
          if (m === 'Page.createIsolatedWorld') return { executionContextId: 1 };
          if (m === 'Runtime.evaluate') { const o = onglets.get(sid); const etats = scenario[o.pf].etats; return { result: { value: etats[Math.min(o.i++, etats.length - 1)] } }; }
          return {};
        },
      };
    },
  };
}
const fausseHorloge = () => { let t = Date.parse('2026-11-07T17:30:00Z'); return { maintenant: () => t, attendre: async (ms) => { t += ms; } }; };
const fauxDocker = () => {
  const gestes = [];
  return { gestes, async creer(nom, spec) { gestes.push(['creer', nom, spec]); }, async demarrer(nom) { gestes.push(['demarrer', nom]); },
    async inspecter(nom) { return { NetworkSettings: { Networks: { 'fillsell-cloud': { IPAddress: '172.31.0.99' } } } }; },
    async supprimer(nom) { gestes.push(['supprimer', nom]); } };
};

test('un contrôle complet (faux Chrome) : la sortie par le relais, une visite par plateforme (eBay jamais), Depop 403 → échec « depop », le conteneur supprimé', async () => {
  const ok = (h) => ({ etats: Array.from({ length: 12 }, () => page(h)), documents: [200] });
  const scenario = { vinted: ok('www.vinted.fr'), leboncoin: ok('www.leboncoin.fr'),
    depop: { etats: Array.from({ length: 12 }, () => page('www.depop.com', { statut_nav: 403 })), documents: [403] },
    beebs: { etats: [page('www.beebs.app', { dd_interstitiel: true }), page('www.beebs.app', { dd_interstitiel: true }), ...Array.from({ length: 10 }, () => page('www.beebs.app'))], documents: [403, 200] } };
  const chrome = fauxChrome(scenario);
  const docker = fauxDocker();
  const curls = [];
  const fetchAvant = globalThis.fetch;
  globalThis.fetch = async (u) => { assert.equal(String(u), 'http://172.31.0.99:9223/json/version'); return { json: async () => ({ webSocketDebuggerUrl: 'ws://127.0.0.1:9222/devtools/browser/x' }) }; };
  try {
    const dns = [];
    const s = creerSante({ config: CONFIG, docker, journal, connecter: chrome.connecter, horloge: fausseHorloge(), pareFeu: async () => ({ ok: true }), resoudreTxt: fauxDns(dns),
      executer: async (nom, cmd) => { curls.push(cmd); return cmd.at(-1) === ADRESSES_SORTIE.ipApi
        ? 'HTTP {"status":"success","query":"88.151.56.82","countryCode":"FR","hosting":false,"proxy":false}'
        : '{"ip":"88.151.56.82","country":"FR","org":"AS6830 Liberty Global"}'; } });
    const c = await s.verifier({ ipId: 41, ip: '88.151.56.82', proxyUrl: PROXY });
    assert.deepEqual([c.echecs, c.inconnus], [['depop'], []]);
    assert.deepEqual([c.operateur.as, c.operateur.pays, c.operateur.rang, c.operateur.atypique, c.operateur.source], ['6830', 'NL', 1, true, 'sortie'],
      'l’opérateur de sortie : l’AS lu à la sortie, son pays d’enregistrement par le DNS de Team Cymru');
    assert.deepEqual(dns, ['AS6830.asn.cymru.com'], 'une seule lecture DNS, rien par l’IP contrôlée');
    assert.equal(c.resume.plateformes.beebs.verdict, 'ouverte', 'la vérification d’appareil de Beebs est passée seule');
    assert.deepEqual(chrome.naviguees, ['vinted', 'leboncoin', 'beebs', 'depop'], 'une page d’accueil par plateforme, rien d’autre (eBay jamais, 14/11)');
    assert.ok(curls.every((x) => x.includes('-x') && x.includes('http://127.0.0.1:3128')), 'la sortie lue À TRAVERS le relais du conteneur');
    assert.equal(docker.gestes.at(-1)[0], 'supprimer');
    assert.match(docker.gestes[0][1], /^fs-sante-41-[0-9a-f]{6}$/);
    assert.ok(!JSON.stringify(c).includes('mdp'), 'jamais les identifiants du proxy dans le résultat');
  } finally { globalThis.fetch = fetchAvant; }
  // Un Chrome muet : erreur, et le conteneur est supprimé quand même.
  const d2 = fauxDocker();
  globalThis.fetch = async () => { throw new Error('refusé'); };
  try {
    const s2 = creerSante({ config: CONFIG, docker: d2, journal, connecter: chrome.connecter, horloge: fausseHorloge(), pareFeu: async () => ({ ok: true }), executer: async () => '' });
    await assert.rejects(s2.verifier({ ipId: 41, ip: '88.151.56.82', proxyUrl: PROXY }), /Chrome muet/);
    assert.equal(d2.gestes.at(-1)[0], 'supprimer');
  } finally { globalThis.fetch = fetchAvant; }
  // Pas de preuve du pare-feu des navigateurs : aucun conteneur.
  const d3 = fauxDocker();
  const s3 = creerSante({ config: CONFIG, docker: d3, journal, pareFeu: async () => { throw new Error('pare-feu non prouvé'); } });
  await assert.rejects(s3.verifier({ ipId: 41, ip: '88.151.56.82', proxyUrl: PROXY }), /pare-feu/);
  assert.equal(d3.gestes.length, 0);
});

// ── L'entretien : controlerSante, l'alerte de la marge, la règle « saines d'abord » ──────────────────────────────
const T = Date.now();
const libre = (id, x = {}) => ({ id, commande: `c${id}`, ip: `10.9.0.${id}`, port: 12323, etat: 'disponible', expire_le: iso(T + 25 * J), attributions: 1, refus: {}, ...x });
function fausseBase({ ips, params = {}, sansColonne = false, noter = (a) => ({ ok: true, avant: a.avant ?? null, apres: a.p_sante.verdict }) }) {
  const appels = [];
  return {
    appels,
    async rpc(nom, a) {
      appels.push([nom, a]);
      if (nom === 'cloud_param') return { data: params[a.p_cle] ?? a.p_defaut, error: null };
      if (nom === 'cloud_proxy_identifiants') return { data: `http://u:mdp@10.9.0.${a.p_ip}:12323`, error: null };
      if (nom === 'cloud_ip_sante_noter') { const avant = ips.find((x) => x.id === a.p_ip)?.sante?.verdict ?? null; return { data: noter({ ...a, avant }), error: null }; }
      if (nom === 'cloud_pool_etat') return { data: { en_attente: 0, commandes_en_cours: 0, comptes_sans_place: 0, essais_7j: 0, attribuables_essai: 3 }, error: null };
      return { data: null, error: null };
    },
    from(table) {
      let colonnes = '';
      const q = { select(c) { colonnes = String(c ?? ''); appels.push(['select', table, colonnes]); return q; }, eq() { return q; }, in() { return q; }, gte() { return q; },
        then(r, k) {
          if (table === 'cloud_ips' && sansColonne && /sante/.test(colonnes)) return Promise.resolve({ data: null, error: { message: 'column cloud_ips.sante does not exist' } }).then(r, k);
          return Promise.resolve({ data: table === 'cloud_ips' ? ips : [], error: null }).then(r, k);
        } };
      return q;
    },
  };
}
const pareFeuOuvert = (ips) => ({ async appliquees() { return { ports: null, sorties: new Set(ips.map((i) => `${i.ip}:12323`)) }; }, async synchroniser() { return { appliquees: null }; } });
const entretienSante = ({ base, ips, verifier, charge = () => 0.1, alertes = { signaler: async () => {} } }) => creerEntretien({ config: { entretienPool: true }, base, regles, journal,
  iproyal: { disponible: false }, alertes, pareFeu: pareFeuOuvert(ips), navigateurs: { ouverts: () => [] }, controles: null,
  sante: verifier ? { verifier } : null, charge,
  approvisionnement: { async gardes() { return { marge: 3, envAutorise: false, achatsAuto: false, renouvAuto: false, santeControle: true, sainesSeulement: false }; }, async livrer() { return { livrees: 0 }; } },
  fournisseurIp: { async rotationActive() { return false; } } });

test('controlerSante : coupé (une seule lecture) ; allumé : UNE IP due, un contrôle, le verdict écrit ; GRILLÉE à la 2e lecture → alerte support@', async () => {
  const ips = [libre(1, { sante: { verdict: 'saine', le: iso(T - 3600_000), saine_le: iso(T - 3600_000) } }),
    libre(40, { sante: { verdict: 'suspecte', le: iso(T - 40 * 60_000), suspecte_le: iso(T - 40 * 60_000), echecs: ['leboncoin'] } }),
    libre(39, { reserve_pour: 'nico', reserve_jusqu_au: iso(T + 26 * J) }), { ...libre(42), etat: 'attribuee_client', user_id: 'nico' }];
  const b0 = fausseBase({ ips });
  const verifies = [];
  const verifier = async (a) => { verifies.push(a); return { fait_le: new Date().toISOString(), echecs: ['leboncoin'], inconnus: [], resume: { plateformes: { leboncoin: { verdict: 'mur', murs: ['http_403'] } } } }; };
  assert.deepEqual(await entretienSante({ base: b0, ips, verifier }).controlerSante(), { coupe: 'interrupteur' });
  assert.deepEqual(b0.appels.map((x) => x[0]), ['cloud_param'], 'cloud_ip_sante_controle = 0 : une lecture, rien d’autre');
  assert.equal(verifies.length, 0);
  const alertesVues = [];
  const base = fausseBase({ ips, params: { ip_sante_controle: 1 } });
  const r = await entretienSante({ base, ips, verifier, alertes: { async signaler(n, t) { alertesVues.push(t); } } }).controlerSante();
  assert.deepEqual([r.ip_id, r.raison, r.avant, r.verdict, r.ecrit], [40, 'confirmation', 'suspecte', 'grillee', true], 'la suspecte d’abord : 2e lecture, même échec → grillée');
  assert.deepEqual(verifies.map((v) => v.ipId), [40], 'une seule IP, jamais la réservée (39) ni l’attribuée (42)');
  const ecrit = base.appels.find((x) => x[0] === 'cloud_ip_sante_noter')[1];
  assert.equal(ecrit.p_sante.verdict, 'grillee');
  assert.equal(alertesVues.length, 1);
  assert.match(alertesVues[0], /IP 40 .* GRILLÉE .* leboncoin .* n'est plus attribuable .* revient au pool dès qu'un contrôle passe/);
});

test('controlerSante : jamais pendant une pointe de charge ; jamais deux navigateurs de contrôle (même verrou que l’entretien et le réapprovisionnement) ; migration absente → rien', async () => {
  const ips = [libre(2)];
  const base = fausseBase({ ips, params: { ip_sante_controle: 1 } });
  const lent = { lacher: null };
  const attente = new Promise((ok) => { lent.lacher = ok; });
  const verifier = async () => { await attente; return { fait_le: new Date().toISOString(), echecs: [], inconnus: [] }; };
  assert.ok((await entretienSante({ base, ips, verifier, charge: () => 0.95 }).controlerSante()).charge > 0.7);
  assert.ok(!base.appels.some((x) => x[0] === 'select'), 'pointe : le pool n’est même pas lu');
  const e = entretienSante({ base, ips, verifier });
  const p1 = e.controlerSante();
  await new Promise((ok) => setTimeout(ok, 20));
  assert.deepEqual(await e.controlerSante(), { occupe: true });
  assert.deepEqual(await e.tour(), { occupe: true }, 'l’entretien horaire attend (index.js le relance 3 min plus tard)');
  lent.lacher();
  const r = await p1;
  assert.deepEqual([r.ip_id, r.raison, r.verdict], [2, 'jamais_controlee', 'saine']);
  const b2 = fausseBase({ ips, params: { ip_sante_controle: 1 }, sansColonne: true });
  assert.deepEqual(await entretienSante({ base: b2, ips, verifier: async () => assert.fail('aucun contrôle') }).controlerSante(), { coupe: 'migration_absente' });
  // Une sortie que le pare-feu n'a pas ouverte : jamais contrôlée (elle échouerait).
  const b3 = fausseBase({ ips, params: { ip_sante_controle: 1 } });
  const e3 = creerEntretien({ config: { entretienPool: true }, base: b3, regles, journal, iproyal: { disponible: false }, alertes: null, navigateurs: { ouverts: () => [] },
    pareFeu: { async appliquees() { return { ports: null, sorties: new Set() }; } }, sante: { verifier: async () => assert.fail('aucun contrôle') }, charge: () => 0.1,
    approvisionnement: { async gardes() { return null; } } });
  assert.deepEqual(await e3.controlerSante(), { rien: true });
});

test('entretien horaire : l’alerte « saines sous la marge » (contrôle allumé) ; « saines d’abord » sans contrôle de santé → la règle d’avant, dite', async () => {
  const ips = [libre(1, { sante: { verdict: 'saine', le: iso(T - 3600_000), saine_le: iso(T - 3600_000) } }), libre(40, { sante: { verdict: 'grillee', le: iso(T) } }),
    { ...libre(42), etat: 'attribuee_client', user_id: 'nico' }];
  const vues = [];
  const base = fausseBase({ ips, params: { ip_sante_controle: 1 } });
  const e = creerEntretien({ config: { entretienPool: true }, base, regles, journal, iproyal: { disponible: false }, alertes: { async signaler(n, t) { vues.push(t); } },
    pareFeu: pareFeuOuvert(ips), navigateurs: { ouverts: () => [] }, controles: null, coffre: {}, sessions: {},
    approvisionnement: { async gardes() { return { marge: 3, achatsAuto: false, santeControle: true, sainesSeulement: true }; }, async livrer() { return { livrees: 0 }; }, async renouveler() { return []; }, async acheter() { return { fait: false, raison: 'interrupteur_coupe' }; } },
    fournisseurIp: { async rotationActive() { return false; }, async verifierSolde() { return null; } } });
  const b = await e.tour();
  assert.deepEqual([b.sante.saines, b.sante.grillees, b.sante.sousMarge], [1, 1, true]);
  assert.equal(b.plan.saines_seulement, true, 'réglage à 1 ET contrôle allumé : la règle s’applique');
  assert.ok(vues.some((t) => /IP saines libres SOUS LA MARGE .* 1 saine\(s\) pour une marge de 3 .* Achats automatiques COUPÉS/.test(t)), vues.join(' | '));
  const n = vues.length;
  await e.tour();
  assert.equal(vues.filter((t) => /SOUS LA MARGE/.test(t)).length, 1, 'rappel au plus toutes les 6 h');
  assert.ok(vues.length >= n);
  // Le réglage à 1, le contrôle coupé : aucune santé fiable → la règle d'avant, et on le dit.
  const vues2 = [];
  const e2 = creerEntretien({ config: { entretienPool: true }, base: fausseBase({ ips }), regles, journal, iproyal: { disponible: false },
    alertes: { async signaler(n2, t) { vues2.push(t); } }, pareFeu: pareFeuOuvert(ips), navigateurs: { ouverts: () => [] }, controles: null, coffre: {}, sessions: {},
    approvisionnement: { async gardes() { return { marge: 3, achatsAuto: false, santeControle: false, sainesSeulement: true }; }, async livrer() { return { livrees: 0 }; }, async renouveler() { return []; }, async acheter() { return { fait: false, raison: 'interrupteur_coupe' }; } },
    fournisseurIp: { async rotationActive() { return false; }, async verifierSolde() { return null; } } });
  const b2 = await e2.tour();
  assert.equal(b2.plan.saines_seulement, undefined);
  assert.equal(b2.sante, undefined, 'contrôle coupé : ni bilan ni alerte de marge');
  assert.ok(vues2.some((t) => /saines d'abord » demandée .* contrôle de santé est coupé/.test(t)), vues2.join(' | '));
});
