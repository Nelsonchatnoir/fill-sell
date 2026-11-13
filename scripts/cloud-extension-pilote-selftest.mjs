// ═══════════════════════════════════════════════════════════════════════════
// VERROU « PILOTE : UN SEUL COMPTE TOUCHÉ » (13/11/2026, décision de Nico)
// ═══════════════════════════════════════════════════════════════════════════
// « Essai de la 0.6.187 : sur MON poste Cloud. Garde-fou : seul mon poste est touché, jamais celui d'un client Cloud.
//   Remets tout comme avant après l'essai. »
// Le défaut (avant ce correctif) : l'orchestrateur monte UN SEUL dossier d'extension pour tous les navigateurs d'un serveur
// (navigateur.js:341 `config.dossierExtensionCrx`, :145 `config.dossierExtension`, rafraichirExtensionDuProfil :460) —
// aucune copie ne pouvait aller à un compte seul : essayer la 0.6.187 chez Nico, c'était la donner aux 5 clients.
// Cas réels : cloud-2, 13/11 ~12:55 (Paris), 6 postes « actif » (cloud_postes) — f44b5917 (Nico, le pilote) et les
// clients b695d990, c7c382b7, d0ac0538, d607ba20, f0acd3af (cités par id8 ; identifiants factices construits dessus).
// Copie commune en service : CRX 0.6.186.45160 (etat-2026-10-01.md, 10/11 15:41).
//   npm run selftest:cloud-extension-pilote
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, renameSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { specConteneurChrome } from '../serveur-cloud/src/navigateur.js';
import { creerPostes } from '../serveur-cloud/src/postes.js';
import { idExtensionDepuisCle } from '../serveur-cloud/src/sessionFillsell.js';

const NICO = 'f44b5917-bccc-4431-ba41-f40571a2ed18';
const CLIENTS = ['b695d990', 'c7c382b7', 'd0ac0538', 'd607ba20', 'f0acd3af'].map((id8) => `${id8}-0000-4000-8000-000000000000`);
const TOUS = [NICO, ...CLIENTS];
const CLE = randomBytes(294).toString('base64');
const ID = idExtensionDepuisCle(CLE);
const h16 = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16);
const BG_COMMUN = 'const FILLSELL_BUILD_ID = "2026-11-10T14:40:43Z+ba77b92-cloud";\n';
const BG_PILOTE = 'const FILLSELL_BUILD_ID = "2026-11-13T12:00:00Z+d73cd9d-cloud"; // la 0.6.187\n';
const updateXml = (version, appid = ID) => `<?xml version='1.0' encoding='UTF-8'?>\n<gupdate xmlns='http://www.google.com/update2/response' protocol='2.0'>\n`
  + `  <app appid='${appid}'>\n    <updatecheck codebase='http://127.0.0.1:3129/fillsell-cloud.crx' version='${version}' />\n  </app>\n</gupdate>\n`;
const jwt = (o) => `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify(o)).toString('base64url')}.c2ln`;
const journalMuet = { info() {}, alerte() {}, erreur(e, d) { throw new Error(`${e} ${JSON.stringify(d)}`); } };

const charger = async () => {
  try { return await import('../serveur-cloud/src/extensionPilote.js'); } catch (e) {
    assert.fail(`serveur-cloud/src/extensionPilote.js absent (${e.code ?? e.message}) : aucune copie par compte — `
      + 'navigateur.js:341 monte config.dossierExtensionCrx pour TOUS les navigateurs');
  }
};
const chargerNav = async () => {
  const m = await import('../serveur-cloud/src/navigateur.js');
  assert.equal(typeof m.preparerExtensionChrome, 'function', 'navigateur.js : preparerExtensionChrome absent (la copie ne se choisit pas par compte)');
  return m;
};

/** Un serveur Cloud en miniature : copie commune, dossier des pilotes, profils. */
function serveur() {
  const r = mkdtempSync(path.join(tmpdir(), 'fs-pilote-'));
  const ecrire = (rel, txt) => { const f = path.join(r, ...rel.split('/')); mkdirSync(path.dirname(f), { recursive: true }); writeFileSync(f, txt); };
  ecrire('extension/manifest.json', JSON.stringify({ key: CLE, version: '0.6.186', version_name: '0.6.186-cloud' }));
  ecrire('extension/background.js', BG_COMMUN);
  ecrire('extension-crx/update.xml', updateXml('0.6.186.45160'));
  ecrire('extension-crx/fillsell-cloud.crx', 'Cr24-commune');
  mkdirSync(path.join(r, 'profils'), { recursive: true });
  const config = Object.freeze({ dossierExtension: `${r}/extension`, dossierExtensionCrx: `${r}/extension-crx`, dossierExtensionPilote: `${r}/extension-pilote`,
    dossierProfils: `${r}/profils`, dossierEtat: `${r}/etat`, imageChrome: 'fillsell-chrome:61fb7ddd6e2a', memoireNavigateur: '3g',
    reseauDocker: 'fillsell-cloud', moteurNavigateur: 'chrome', serveurNom: 'cloud-2', bloquerPublicite: true, comptesAutorises: [],
    cpuPauseAuDessus: 50, navigateursMax: 15, sessionMinimaleMin: 8 });
  /** Le pilote d'un compte, posé comme le plan d'exécution le pose (préparé à côté, puis renommé d'un geste). */
  const poserPilote = (user, { bg = BG_PILOTE, version = '0.6.186.45800', cle = CLE, appid = ID, crx = true } = {}) => {
    const base = `extension-pilote/${user}.nouveau`;
    ecrire(`${base}/extension/manifest.json`, JSON.stringify({ key: cle, version: '0.6.186', version_name: '0.6.186-cloud' }));
    ecrire(`${base}/extension/background.js`, bg);
    ecrire(`${base}/crx/update.xml`, updateXml(version, appid));
    if (crx) ecrire(`${base}/crx/fillsell-cloud.crx`, `Cr24-${version}`);
    const final = path.join(r, 'extension-pilote', user);
    if (existsSync(final)) renameSync(final, path.join(r, `archive-${user}-${Date.now()}-${Math.random()}`));
    renameSync(path.join(r, base), final);
  };
  const retirerPilote = (user) => renameSync(path.join(r, 'extension-pilote', user), path.join(r, `archive-${user}-${Date.now()}`));
  return { r, config, ecrire, poserPilote, retirerPilote, fin: () => rmSync(r, { recursive: true, force: true }) };
}

const PROXY = 'http://u:p@10.0.0.1:12323';
const JETON = 'a'.repeat(48);

test('1. le conteneur : un client reçoit EXACTEMENT la spécification d’aujourd’hui ; Nico seul monte sa copie pilote', async () => {
  const ep = await charger();
  const s = serveur();
  try {
    s.poserPilote(NICO);
    for (const u of CLIENTS) {
      const src = await ep.lireSourceExtension({ config: s.config, user: u });
      assert.equal(src.pilote, false, `client ${u.slice(0, 8)} : jamais le pilote`);
      assert.equal(src.dossierCrx, s.config.dossierExtensionCrx);
      assert.equal(src.dossier, s.config.dossierExtension);
      const aujourdhui = specConteneurChrome({ config: s.config, user: u, profilId: `p-${u.slice(0, 8)}`, proxyUrl: PROXY, permises: ['vinted'], jetonControle: JETON });
      const avec = specConteneurChrome({ config: s.config, user: u, profilId: `p-${u.slice(0, 8)}`, proxyUrl: PROXY, permises: ['vinted'], jetonControle: JETON, dossierCrx: src.dossierCrx });
      assert.deepEqual(avec, aujourdhui, `client ${u.slice(0, 8)} : spécification identique, octet pour octet`);
    }
    const src = await ep.lireSourceExtension({ config: s.config, user: NICO });
    assert.equal(src.pilote, true, 'Nico : la copie pilote');
    assert.equal(src.dossierCrx, `${s.config.dossierExtensionPilote}/${NICO}/crx`);
    assert.equal(src.dossier, `${s.config.dossierExtensionPilote}/${NICO}/extension`);
    assert.equal(src.version, '0.6.186.45800', 'la version servie (et annoncée par le poste) est celle du pilote');
    assert.equal(src.empreinte, h16(BG_PILOTE));
    const commune = specConteneurChrome({ config: s.config, user: NICO, profilId: 'p-f44b5917', proxyUrl: PROXY, jetonControle: JETON });
    const pilote = specConteneurChrome({ config: s.config, user: NICO, profilId: 'p-f44b5917', proxyUrl: PROXY, jetonControle: JETON, dossierCrx: src.dossierCrx });
    assert.equal(pilote.HostConfig.Binds[1], `${s.config.dossierExtensionPilote}/${NICO}/crx:/extension-crx:ro`, 'Nico : le CRX du pilote, en lecture seule');
    assert.equal(commune.HostConfig.Binds[1], `${s.config.dossierExtensionCrx}:/extension-crx:ro`);
    assert.equal(pilote.Labels['fillsell.extension'], 'pilote', 'le conteneur pilote se voit (docker inspect)');
    assert.equal(commune.Labels['fillsell.extension'], undefined);
    const sans = (sp) => ({ ...sp, Labels: { ...sp.Labels, 'fillsell.extension': undefined }, HostConfig: { ...sp.HostConfig, Binds: sp.HostConfig.Binds.filter((b) => !b.endsWith(':/extension-crx:ro')) } });
    assert.deepEqual(sans(pilote), sans(commune), 'rien d’autre ne change pour Nico (image, réglages, proxy, profil)');
  } finally { s.fin(); }
});

test('2. le dossier pilote : seul un dossier COMPLET, au nom d’un compte, à la clé de la copie commune et au-dessus de sa version est pris', async () => {
  const ep = await charger();
  const s = serveur();
  try {
    assert.deepEqual(await ep.listerPilotes(s.config), [], 'aucun dossier des pilotes : aucun pilote');
    assert.equal((await ep.lireSourceExtension({ config: s.config, user: NICO })).pilote, false);
    const commune = await ep.lireSourceExtension({ config: s.config, user: CLIENTS[0] });
    assert.deepEqual(commune, { pilote: false, dossier: s.config.dossierExtension, dossierCrx: s.config.dossierExtensionCrx, empreinte: h16(BG_COMMUN), version: '0.6.186.45160' });
    // En préparation (« <compte>.nouveau ») ou un nom qui n'est pas un compte : jamais lu.
    s.ecrire(`extension-pilote/${NICO}.nouveau/extension/background.js`, BG_PILOTE);
    s.ecrire('extension-pilote/F44B5917-BCCC-4431-BA41-F40571A2ED18/extension/background.js', BG_PILOTE);
    s.ecrire('extension-pilote/tous/extension/background.js', BG_PILOTE);
    assert.deepEqual(await ep.listerPilotes(s.config), []);
    const refus = async (opts, raison) => {
      s.poserPilote(NICO, opts);
      const src = await ep.lireSourceExtension({ config: s.config, user: NICO });
      assert.equal(src.pilote, false, `refusé (${raison})`);
      assert.equal(src.raison, raison);
      assert.equal(src.dossierCrx, s.config.dossierExtensionCrx, 'refusé = la copie commune, comme avant');
    };
    await refus({ cle: randomBytes(294).toString('base64') }, 'cle_differente');
    await refus({ crx: false }, 'crx_absent');
    await refus({ appid: 'a'.repeat(32) }, 'update_xml_illisible');
    await refus({ version: '0.6.186.45160' }, 'version_pas_au_dessus');
    await refus({ version: '0.6.185.60000' }, 'version_pas_au_dessus');
    s.poserPilote(NICO);
    assert.deepEqual(await ep.listerPilotes(s.config), [NICO]);
    assert.equal((await ep.lireSourceExtension({ config: s.config, user: NICO })).pilote, true);
    assert.equal(ep.comparerVersions('0.6.186.45800', '0.6.186.45160') > 0, true);
    assert.equal(ep.comparerVersions('0.6.186.1', '0.6.186.65534') < 0, true);
    assert.equal(ep.comparerVersions('0.6.187', '0.6.186.65534') > 0, true);
    assert.equal(ep.comparerVersions('0.6.186', '0.6.186.0'), 0);
  } finally { s.fin(); }
});

test('3. le cache du script de fond : effacé chez Nico à l’ENTRÉE et à la SORTIE du pilote ; jamais chez un client', async () => {
  const nav = await chargerNav();
  const s = serveur();
  const alertes = [];
  const journal = { ...journalMuet, alerte: (e, d) => alertes.push([e, d]) };
  try {
    const sw = (p) => `${s.config.dossierProfils}/${p}/chrome/Default/Service Worker`;
    const marque = (p) => readFileSync(`${s.config.dossierProfils}/${p}/chrome/.extension-cloud`, 'utf8').trim();
    const garnir = (p) => { mkdirSync(sw(p), { recursive: true }); writeFileSync(`${sw(p)}/ScriptCache`, 'ancien'); };
    // Avant : les deux profils tournent la copie commune (marque = son empreinte, cache présent).
    for (const [u, p] of [[NICO, 'p-nico'], [CLIENTS[2], 'p-client']]) {
      garnir(p);
      const r = await nav.preparerExtensionChrome({ config: s.config, journal, user: u, profilId: p });
      assert.equal(r.extension.pilote, false);
      assert.equal(marque(p), h16(BG_COMMUN));
      garnir(p);
    }
    // Entrée de Nico dans le pilote.
    s.poserPilote(NICO);
    const e = await nav.preparerExtensionChrome({ config: s.config, journal, user: NICO, profilId: 'p-nico' });
    assert.deepEqual(e.extension, { pilote: true, empreinte: h16(BG_PILOTE), version: '0.6.186.45800' });
    assert.equal(e.dossierCrx, `${s.config.dossierExtensionPilote}/${NICO}/crx`);
    assert.equal(existsSync(sw('p-nico')), false, 'entrée : cache du script de fond effacé');
    assert.equal(marque('p-nico'), h16(BG_PILOTE));
    const c = await nav.preparerExtensionChrome({ config: s.config, journal, user: CLIENTS[2], profilId: 'p-client' });
    assert.equal(c.extension.pilote, false);
    assert.equal(c.dossierCrx, s.config.dossierExtensionCrx);
    assert.equal(existsSync(sw('p-client')), true, 'client : cache intact');
    assert.equal(marque('p-client'), h16(BG_COMMUN));
    // Sortie (retour) : la copie commune re-signée au-dessus du pilote, servie à Nico seul.
    garnir('p-nico');
    s.poserPilote(NICO, { bg: BG_COMMUN, version: '0.6.186.45810' });
    const t = await nav.preparerExtensionChrome({ config: s.config, journal, user: NICO, profilId: 'p-nico' });
    assert.equal(existsSync(sw('p-nico')), false, 'sortie : cache du script de fond effacé');
    assert.equal(marque('p-nico'), h16(BG_COMMUN), 'Nico revient à la copie commune (même script)');
    assert.equal(t.extension.empreinte, h16(BG_COMMUN));
    // Fin : le dossier pilote part ; même script → rien n'est effacé, rien ne change.
    garnir('p-nico');
    s.retirerPilote(NICO);
    const f = await nav.preparerExtensionChrome({ config: s.config, journal, user: NICO, profilId: 'p-nico' });
    assert.equal(f.extension.pilote, false);
    assert.equal(f.dossierCrx, s.config.dossierExtensionCrx);
    assert.equal(existsSync(sw('p-nico')), true);
    // Un pilote refusé se DIT (jamais un refus muet) et n'est pas monté.
    s.poserPilote(NICO, { crx: false });
    const x = await nav.preparerExtensionChrome({ config: s.config, journal, user: NICO, profilId: 'p-nico' });
    assert.equal(x.extension.pilote, false);
    assert.ok(alertes.some(([ev, d]) => ev === 'extension_pilote_refusee' && d.raison === 'crx_absent' && d.user === NICO));
  } finally { s.fin(); }
});

test('4. la règle du redémarrage : jamais un compte sans pilote ; entrée, retour et pilote changé seulement', async () => {
  const ep = await charger();
  const C = { pilote: false, empreinte: h16(BG_COMMUN), version: '0.6.186.45160' };
  const P = { pilote: true, empreinte: h16(BG_PILOTE), version: '0.6.186.45800' };
  const R = { pilote: true, empreinte: h16(BG_COMMUN), version: '0.6.186.45810' };
  const d = (a, b) => ep.decisionPilote(a, b);
  assert.equal(d(C, C).redemarrer, false);
  assert.equal(d(C, { ...C, empreinte: 'autre', version: '0.6.187.46000' }).redemarrer, false, 'copie COMMUNE changée : jamais par cette règle (comme aujourd’hui)');
  assert.equal(d(undefined, C).redemarrer, false, 'navigateur ouvert sans l’information : rien');
  assert.equal(d(C, P).redemarrer, true, 'entrée');
  assert.equal(d(P, P).redemarrer, false);
  assert.equal(d(P, { ...P, empreinte: 'p2', version: '0.6.186.45900' }).redemarrer, true, 'pilote remplacé');
  assert.equal(d(P, R).redemarrer, true, 'retour (copie commune re-signée au-dessus)');
  assert.equal(d(R, { ...C, version: '0.6.186.45160' }).redemarrer, false, 'fin : même script, rien à faire');
  const piege = d(P, C);
  assert.equal(piege.redemarrer, false, 'pilote retiré SANS retour : Chrome ne descend jamais de version, redémarrer ne changerait rien');
  assert.equal(piege.raison, 'version_pas_au_dessus');
  assert.equal(d(P, null).redemarrer, false);
});

// ── 5. Le planificateur réel (postes.js) sur les 6 comptes de cloud-2 ───────────────────────────────────────────
function monterPostes(s, nav, ep) {
  const etat = { jobs: [], postes: new Map(), connexions: new Set(), ouvertures: {}, fermetures: {}, lus: [], alertes: [] };
  const comptes = TOUS.map((u) => ({ user_id: u, ip_id: 7, etat_cloud: 'paye', delai_sessions_min: null, plateformes_connectees: ['vinted'] }));
  const base = {
    rpc: async (nom, a) => {
      if (nom === 'cloud_comptes_du_serveur') return { data: comptes, error: null };
      if (nom === 'cloud_poste_noter') etat.postes.set(a.p_user, { ...(etat.postes.get(a.p_user) ?? {}), ...a.p_details });
      return { data: null, error: null };
    },
    from(table) {
      let user = null;
      const lignes = () => (table === 'cross_post_jobs' ? etat.jobs
        : table === 'veille_cpu' ? [{ pct: 10, le: new Date().toISOString() }]
          : table === 'cloud_postes' && etat.postes.has(user) ? [{ session_fillsell_id: null, details: etat.postes.get(user) }] : []);
      const q = { select: () => q, eq: (c, v) => { if (c === 'user_id') user = v; return q; }, in: () => q, order: () => q, limit: () => q,
        maybeSingle: async () => ({ data: lignes()[0] ?? null, error: null }), then: (ok, ko) => Promise.resolve({ data: lignes(), error: null }).then(ok, ko) };
      return q;
    },
  };
  const cdpPour = (u) => ({
    on: () => () => {}, fermer() {},
    async send(m, p) {
      if (m === 'Target.getTargets') return { targetInfos: [{ targetId: 'sw', type: 'service_worker', url: `chrome-extension://${ID}/background.js` }] };
      if (m === 'Target.attachToTarget') return { sessionId: 's' };
      if (m === 'Storage.getCookies') return { cookies: [] };
      if (m === 'Runtime.evaluate' && String(p?.expression).includes('chrome.storage.local.get([')) {
        return { result: { value: { own: { access_token: jwt({ sub: u, session_id: `s-${u.slice(0, 8)}` }), refresh_token: 'r', expires_at: Math.floor(Date.now() / 1000) + 3600 }, user: { sub: u } } } };
      }
      if (m === 'Runtime.evaluate') return { result: { value: {} } };
      return {};
    },
  });
  const ouverts = new Map();
  const navigateurs = {
    ouverts: () => [...ouverts.keys()],
    ouvert: (u) => ouverts.get(u) ?? null,
    // Comme ouvrirChrome : la copie de CE compte (preparerExtensionChrome), puis le navigateur.
    async ouvrir(u, { proxyUrl, profilId }) {
      assert.equal(proxyUrl, PROXY);
      const { extension } = await nav.preparerExtensionChrome({ config: s.config, journal: journalMuet, user: u, profilId });
      const h = { cdp: cdpPour(u), ip: '172.31.0.9', conteneur: `fs-nav-${u}`, profilId, ouvertLe: Date.now(), moteur: 'chrome', permises: ['vinted'], extension };
      ouverts.set(u, h);
      etat.ouvertures[u] = (etat.ouvertures[u] ?? 0) + 1;
      return h;
    },
    async fermer(u, raison) { ouverts.delete(u); (etat.fermetures[u] ??= []).push(raison); },
    sourceExtension: async (u) => { etat.lus.push(u); return ep.lireSourceExtension({ config: s.config, user: u }); },
  };
  const coffre = {
    cookiesARestaurer: async () => ({ aPoser: [], bilan: {}, connectees: ['vinted', 'leboncoin', 'beebs', 'depop'], bloquees: [] }),
    sauvegarderCookies: async () => ({}), ecrire: async () => {}, lire: async () => ({}), aReconnecter: async () => false,
  };
  const postes = creerPostes({ config: s.config, base, navigateurs, coffre, journal: { ...journalMuet, alerte: (e, d) => etat.alertes.push([e, d]) },
    sessions: { fabriquer: async () => { throw new Error('jamais ici'); }, revoquer: async () => ({}), rafraichirHorsNavigateur: async (o) => o },
    fournisseurIp: { proxyPour: async () => ({ proxyUrl: PROXY, ipId: 7, mode: 'dedie', sortie: 'dediee' }) },
    connexionsOuvertes: () => etat.connexions, alertes: { signaler: async () => ({}) } });
  return { etat, postes, navigateurs };
}

test('5. le planificateur : seul le navigateur de Nico est redémarré (entrée, retour), au repos ; les 5 clients ne sont ni relus ni redémarrés', async () => {
  const ep = await charger();
  const nav = await chargerNav();
  const s = serveur();
  try {
    const { etat, postes, navigateurs } = monterPostes(s, nav, ep);
    const r1 = await postes.tour();
    assert.deepEqual(r1.ouvrir.map((o) => o.user).sort(), [...TOUS].sort(), 'les 6 comptes ouverts, comme sur cloud-2');
    await postes.tour();
    assert.deepEqual(etat.lus, [], 'sans pilote : aucune relecture, pour personne');

    // Entrée : le dossier pilote de Nico est posé. Une tâche de Nico en cours → rien tant qu'elle tourne.
    s.poserPilote(NICO);
    etat.jobs = [{ user_id: NICO, status: 'processing', action: 'republish', platform_fields: {} }];
    const r2 = await postes.tour();
    assert.deepEqual(r2.fermer, [], 'jamais au milieu d’une tâche');
    etat.jobs = [];
    etat.connexions.add(NICO);
    assert.deepEqual((await postes.tour()).fermer, [], 'jamais pendant un « Me connecter »');
    etat.connexions.delete(NICO);
    const r3 = await postes.tour();
    assert.deepEqual(r3.fermer, [{ user: NICO, raison: 'extension_pilote' }], 'Nico seul, au repos');
    const r4 = await postes.tour();
    assert.deepEqual(r4.ouvrir.map((o) => o.user), [NICO], 'rouvert au tour suivant');
    assert.deepEqual(navigateurs.ouvert(NICO).extension, { pilote: true, empreinte: h16(BG_PILOTE), version: '0.6.186.45800' });
    assert.deepEqual((await postes.tour()).fermer, [], 'le pilote en place : plus rien');

    // Sortie SANS retour (le piège) : refusée et dite — Chrome garderait le pilote.
    s.retirerPilote(NICO);
    assert.deepEqual((await postes.tour()).fermer, []);
    assert.ok(etat.alertes.some(([e, d]) => e === 'extension_pilote_retour_impossible' && d.user === NICO && d.installee === '0.6.186.45800' && d.servie === '0.6.186.45160'));
    // Retour : la copie commune re-signée au-dessus du pilote.
    s.poserPilote(NICO, { bg: BG_COMMUN, version: '0.6.186.45810' });
    assert.deepEqual((await postes.tour()).fermer, [{ user: NICO, raison: 'extension_pilote' }]);
    await postes.tour();
    assert.deepEqual(navigateurs.ouvert(NICO).extension, { pilote: true, empreinte: h16(BG_COMMUN), version: '0.6.186.45810' });
    // Fin : le dossier part ; même script → aucun redémarrage de plus.
    s.retirerPilote(NICO);
    assert.deepEqual((await postes.tour()).fermer, []);
    assert.deepEqual((await postes.tour()).fermer, []);

    assert.deepEqual(etat.fermetures, { [NICO]: ['extension_pilote', 'extension_pilote'] }, 'aucun client fermé');
    for (const u of CLIENTS) assert.equal(etat.ouvertures[u], 1, `client ${u.slice(0, 8)} : ouvert une fois, jamais rouvert`);
    assert.deepEqual([...new Set(etat.lus)], [NICO], 'seul le dossier de Nico est relu');
    for (const u of CLIENTS) assert.deepEqual(navigateurs.ouvert(u).extension, { pilote: false, empreinte: h16(BG_COMMUN), version: '0.6.186.45160' });
  } finally { s.fin(); }
});
