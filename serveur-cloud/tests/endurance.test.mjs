// L'essai de 48 h (01/11) : les blocages reconnus, la mémoire, les tâches du Cloud ; la preuve du pare-feu.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cadreDataDome, blocageDesCadres, erreurAntiRobot, memoireMo, resumeTachesCloud, plateformeDeLAdresse, VERIFICATION_TOLEREE_MS, creerEndurance } from '../src/endurance.js';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { preuvePareFeu } from '../src/navigateur.js';

const CAPTCHA = (t, referer) => `https://geo.captcha-delivery.com/captcha/?initialCid=x&hash=y&cid=z&t=${t}&referer=${encodeURIComponent(referer)}&s=1`;
const INTER = (referer) => `https://geo.captcha-delivery.com/interstitial/?initialCid=x&hash=y&referer=${encodeURIComponent(referer)}`;

test('cadres DataDome : bloqué, glissière, vérification, et la plateforme du referer', () => {
  assert.deepEqual(cadreDataDome(CAPTCHA('bv', 'https://www.leboncoin.fr/compte')), { nature: 'bloque', plateforme: 'leboncoin' });
  assert.deepEqual(cadreDataDome(CAPTCHA('fe', 'https://www.beebs.app/fr/auth')), { nature: 'glissiere', plateforme: 'beebs' });
  assert.deepEqual(cadreDataDome(INTER('https://www.leboncoin.fr/')), { nature: 'verification', plateforme: 'leboncoin' });
  assert.equal(cadreDataDome('https://www.leboncoin.fr/'), null, 'une page de la plateforme n\'est pas un cadre');
  assert.equal(cadreDataDome('https://js.datadome.co/tags.js'), null, 'le script DataDome chargé partout n\'est PAS un blocage (05/10)');
  assert.equal(cadreDataDome('nimporte quoi'), null);
  assert.equal(plateformeDeLAdresse('https://www.vinted.fr/items/1'), 'vinted');
  assert.equal(plateformeDeLAdresse('https://www.depop.com/fr/'), 'depop');
});

test('relevé des cadres : glissière ou blocage = arrêt tout de suite ; vérification = seulement si elle dure', () => {
  const t0 = Date.parse('2026-11-01T18:00:00Z');
  assert.equal(blocageDesCadres([{ url: 'https://www.vinted.fr/' }], new Map(), t0).blocage, null, 'rien à signaler');
  const g = blocageDesCadres([{ url: CAPTCHA('fe', 'https://www.leboncoin.fr/') }], new Map(), t0);
  assert.equal(g.blocage.nature, 'glissiere');
  assert.equal(g.blocage.plateforme, 'leboncoin');
  const v1 = blocageDesCadres([{ url: INTER('https://www.leboncoin.fr/') }], new Map(), t0);
  assert.equal(v1.blocage, null, 'une vérification de l\'appareil passe d\'elle-même');
  const v2 = blocageDesCadres([{ url: INTER('https://www.leboncoin.fr/') }], v1.vus, t0 + 60_000);
  assert.equal(v2.blocage, null);
  const v3 = blocageDesCadres([{ url: INTER('https://www.leboncoin.fr/') }], v2.vus, t0 + VERIFICATION_TOLEREE_MS);
  assert.equal(v3.blocage?.nature, 'verification', 'restée trois minutes : un blocage');
  const parti = blocageDesCadres([], v2.vus, t0 + VERIFICATION_TOLEREE_MS);
  assert.equal(parti.blocage, null, 'une vérification partie est oubliée');
  assert.equal(parti.vus.size, 0);
});

test('tâches du Cloud : faites, refusées, et le refus anti-robot reconnu aux mots de l\'extension', () => {
  assert.ok(erreurAntiRobot('CHALLENGE DATADOME : Leboncoin affiche une vérification anti-robot à la place du formulaire'));
  assert.ok(erreurAntiRobot('vérification anti-robot de Beebs (DataDome)'));
  assert.ok(!erreurAntiRobot('Un brouillon Leboncoin non terminé bloque le dépôt'), 'un autre refus n\'est pas un blocage anti-robot');
  const r = resumeTachesCloud([
    { id: 1, platform: 'vinted', action: 'republish', status: 'published' },
    { id: 2, platform: 'leboncoin', action: 'delete', status: 'deleted' },
    { id: 3, platform: 'beebs', action: 'publish', status: 'failed', error: 'vérification anti-robot de Beebs (DataDome)' },
    { id: 4, platform: 'depop', action: 'publish', status: 'needs_user', error: 'Quelle taille ?' },
  ]);
  assert.equal(r.faites, 2);
  assert.equal(r.echouees, 1);
  assert.equal(r.en_attente_personne, 1);
  assert.deepEqual(r.anti_robot, [{ id: 3, plateforme: 'beebs', action: 'publish' }]);
});

test('mémoire d\'un navigateur : utilisation moins le cache de fichiers, en Mo', () => {
  assert.equal(memoireMo({ memory_stats: { usage: 1100 * 1024 * 1024, stats: { inactive_file: 100 * 1024 * 1024 } } }), 1000);
  assert.equal(memoireMo({ memory_stats: { usage: 512 * 1024 * 1024, stats: {} } }), 512);
  assert.equal(memoireMo(null), null);
});

test('pare-feu avant le navigateur : la preuve doit venir de CE démarrage du serveur', () => {
  const p = JSON.stringify({ boot_id: 'abc-123', le: '2026-11-01T17:00:00Z', destinations: '81.181.239.136:12323' });
  assert.deepEqual(preuvePareFeu(p, 'abc-123\n'), { ok: true, destinations: '81.181.239.136:12323' });
  assert.equal(preuvePareFeu(p, 'def-456').raison, 'preuve_d_un_autre_demarrage', 'redémarré sans pare-feu : refusé');
  assert.equal(preuvePareFeu('', 'abc-123').raison, 'preuve_illisible');
  assert.equal(preuvePareFeu('{}', 'abc-123').raison, 'preuve_absente');
  assert.equal(preuvePareFeu(p, '').raison, 'preuve_absente');
});

test('(01/11) verrou des plateformes sur steel : seules les plateformes FERMÉES sont interceptées', async () => {
  const { motifsVerrou } = await import('../src/navigateur.js');
  const tous = motifsVerrou([]).map((m) => m.urlPattern);
  for (const d of ['vinted.fr', 'vinted.com', 'vinted.net', 'leboncoin.fr', 'beebs.app', 'depop.com']) {
    assert.ok(tous.includes(`*://${d}/*`) && tous.includes(`*://*.${d}/*`), `rien de connecté : ${d} fermé`);
  }
  const lbc = motifsVerrou(['leboncoin']).map((m) => m.urlPattern);
  assert.ok(!lbc.some((u) => u.includes('leboncoin')), 'Leboncoin connecté : jamais intercepté (son trafic reste celui de l\'essai)');
  assert.ok(lbc.some((u) => u.includes('beebs.app')), 'Beebs pas connecté : fermé');
  // (01/11, demande de Nico) Tout connecté : seuls eBay et Opla restent interceptés — eBay passe par l'API, jamais ici.
  const toutes = motifsVerrou(['vinted', 'leboncoin', 'beebs', 'depop']).map((m) => m.urlPattern);
  assert.ok(!toutes.some((u) => /vinted|leboncoin|beebs|depop/.test(u)), 'tout connecté : aucune plateforme du Cloud interceptée');
  for (const d of ['ebay.fr', 'ebay.com', 'opla.co']) assert.ok(toutes.includes(`*://${d}/*`) && toutes.includes(`*://*.${d}/*`), `${d} : toujours fermé`);
  assert.ok(motifsVerrou(['ebay']).some((m) => m.urlPattern === '*://*.ebay.fr/*'), 'eBay ne s’ouvre jamais, même demandé');
  assert.ok(motifsVerrou(['ebay', 'opla', 'VINTED']).every((m) => !m.urlPattern.includes('vinted')), 'les noms se nettoient ; eBay et Opla ne sont jamais ouverts ici');
  assert.ok(motifsVerrou([]).every((m) => m.requestStage === 'Request'), 'arrêtées avant de partir');
});

test("(01/11) une copie neuve de l'extension : le cache du profil n'est effacé que si son empreinte a changé", async () => {
  const { cacheExtensionAEffacer } = await import('../src/navigateur.js');
  assert.equal(cacheExtensionAEffacer('', 'abc'), true, 'jamais notée : effacé une fois');
  assert.equal(cacheExtensionAEffacer('abc\n', 'abc'), false, "même copie : rien n'est effacé (les ouvertures suivantes ne touchent à rien)");
  assert.equal(cacheExtensionAEffacer('abc', 'def'), true, 'copie neuve : effacé');
  assert.equal(cacheExtensionAEffacer('abc', ''), false, 'copie illisible : on ne touche à rien');
});

test('(01/11) les 48 h partent de la première connexion VÉRIFIÉE après la remise à zéro ; rien d’avant ne compte', async () => {
  const { decompteEssai, DUREE_ESSAI_MS } = await import('../src/endurance.js');
  const l = [
    { le: '2026-11-01T20:00:00Z', evenement: 'mesure', connexions: { a: { leboncoin: true } } },
    { le: '2026-11-01T20:05:00Z', evenement: 'connexion_verifiee', plateforme: 'leboncoin', verifiee_le: '2026-11-01T20:05:00Z' },
    { le: '2026-11-01T22:00:00Z', evenement: 'remise_a_zero', raison: 'faux connectés du 01/11' },
    { le: '2026-11-01T22:10:00Z', evenement: 'mesure' },
    { le: '2026-11-01T22:20:00Z', evenement: 'connexion_verifiee', plateforme: 'vinted', verifiee_le: '2026-11-01T22:20:00Z' },
    { le: '2026-11-01T22:30:00Z', evenement: 'connexion_verifiee', plateforme: 'leboncoin', verifiee_le: '2026-11-01T22:30:00Z' },
    { le: '2026-11-01T22:35:00Z', evenement: 'connexion_verifiee', plateforme: 'vinted', verifiee_le: '2026-11-01T22:35:00Z' },
    { le: '2026-11-02T03:00:00Z', evenement: 'connexion_tombee', plateforme: 'leboncoin' },
  ];
  const d = decompteEssai(l);
  assert.equal(d.remise.raison, 'faux connectés du 01/11');
  assert.equal(d.debut, '2026-11-01T22:20:00.000Z', 'la première connexion vérifiée après la remise');
  assert.equal(d.plateformes.vinted.reste_heures, DUREE_ESSAI_MS / 3600_000, 'aucune mesure de marche : rien de compté');
  assert.equal(d.plateformes.vinted.verifiee_le, '2026-11-01T22:20:00Z', 'sa PREMIÈRE vérification');
  assert.equal(d.plateformes.leboncoin.verifiee_le, '2026-11-01T22:30:00Z', 'la connexion d’avant la remise ne compte pas');
  assert.equal(d.plateformes.leboncoin.tombee_le, '2026-11-02T03:00:00Z');
  assert.ok(!d.lignes.some((x) => x.le < '2026-11-01T22:00:00Z'), 'aucune mesure d’avant la remise');
  assert.equal(decompteEssai([{ le: '2026-11-01T20:00:00Z', evenement: 'mesure' }]).debut, null, 'aucune connexion vérifiée : les 48 h n’ont pas commencé');
});

// ── (01/11, 23:10) L'arrêt silencieux de 22:57 : une glissière Leboncoin a arrêté TOUT l'exécutant, sans rien dire ───
test('(01/11) les heures COMPTÉES : seulement navigateur ouvert, plateforme connectée et pas en vérification, sans trou', async () => {
  const { decompteEssai, DUREE_ESSAI_MS } = await import('../src/endurance.js');
  const M = (le, { nav = true, cx = { vinted: true, beebs: true }, bloquees = {}, arrete = false } = {}) =>
    ({ le, evenement: 'mesure', navigateursMo: nav ? { f44b5917: 600 } : {}, connexions: { f44b5917: cx }, bloquees, arrete });
  const l = [
    { le: '2026-11-01T22:00:00Z', evenement: 'remise_a_zero', raison: 'r' },
    { le: '2026-11-01T22:05:00Z', evenement: 'connexion_verifiee', plateforme: 'vinted', verifiee_le: '2026-11-01T22:05:00Z' },
    { le: '2026-11-01T22:05:00Z', evenement: 'connexion_verifiee', plateforme: 'beebs', verifiee_le: '2026-11-01T22:05:00Z' },
    M('2026-11-01T22:10:00Z'), M('2026-11-01T22:20:00Z'),                                   // 10 min pour les deux (+5 avant la 1re mesure : non)
    M('2026-11-01T22:30:00Z', { cx: { vinted: true, beebs: false }, bloquees: { f44b5917: ['beebs'] } }), // Beebs en vérification
    M('2026-11-01T22:40:00Z', { nav: false }),                                              // navigateur fermé : rien
    M('2026-11-01T23:40:00Z'),                                                              // une heure muette : rien
    M('2026-11-01T23:50:00Z', { arrete: true }),                                            // essai arrêté : rien
    M('2026-11-02T00:00:00Z'),                                                              // 10 min pour les deux
  ];
  const d = decompteEssai(l);
  assert.equal(d.plateformes.vinted.heures_comptees, Math.round((30 / 60) * 10) / 10, 'Vinted : 10 + 10 + 10 min');
  assert.equal(d.plateformes.beebs.heures_comptees, Math.round((20 / 60) * 10) / 10, 'Beebs : sa vérification ne compte pas');
  assert.equal(d.executant_heures, 0.5, 'l’exécutant : ses seules heures de marche');
  assert.equal(d.plateformes.vinted.atteint, false);
  assert.equal(d.plateformes.vinted.reste_heures, Math.round(((DUREE_ESSAI_MS - 30 * 60_000) / 3600_000) * 10) / 10);
});

function monterEndurance({ cibles = [], arretFichier = null, taches = [] } = {}) {
  const dossierEtat = mkdtempSync(path.join(tmpdir(), 'fs-endurance-'));
  mkdirSync(path.join(dossierEtat, 'endurance'), { recursive: true });
  if (arretFichier) writeFileSync(path.join(dossierEtat, 'endurance', 'arret.json'), JSON.stringify(arretFichier));
  const appels = { bloquer: [], fermer: [], noter: [] };
  const U = 'f44b5917-bccc-4431-ba41-f40571a2ed18';
  const h = { cdp: { send: async (m) => (m === 'Target.getTargets' ? { targetInfos: cibles } : {}) }, permises: ['beebs', 'leboncoin', 'vinted'] };
  const e = creerEndurance({
    config: { dossierEtat, comptesAutorises: [U] },
    base: { from: (t) => ({ select: () => ({ eq: async () => ({ data: [] }), in: () => ({ like: () => ({ or: () => ({ limit: async () => ({ data: t === 'cross_post_jobs' ? taches : [] }) }) }) }) }) }) },
    docker: { lister: async () => [], stats: async () => null },
    navigateurs: { ouverts: () => [U], ouvert: () => h },
    postes: {
      bloquerPlateforme: async (u, p, c) => { appels.bloquer.push([p, c.nature]); return { verrou: true }; },
      fermer: async (u, r) => { appels.fermer.push(r); }, noter: async (...a) => { appels.noter.push(a); },
    },
    connexionsOuvertes: () => new Set(),
    journal: { info() {}, alerte() {}, erreur() {} },
  });
  return { e, appels, dossierEtat, U, lireMesures: () => readFileSync(path.join(dossierEtat, 'endurance', 'mesures.jsonl'), 'utf8').trim().split('\n').map((x) => JSON.parse(x)) };
}

test('(01/11) une glissière dans un onglet de travail n’arrête QUE sa plateforme ; une seule fois ; rouverte par une connexion vérifiée', async () => {
  const { e, appels, U, lireMesures } = monterEndurance({ cibles: [{ type: 'iframe', url: CAPTCHA('fe', 'https://www.leboncoin.fr/') }] });
  await e.charger();
  await e.releveCadres();
  assert.deepEqual(appels.bloquer, [['leboncoin', 'glissiere']], 'Leboncoin seul est bloqué');
  assert.deepEqual(appels.fermer, [], 'le navigateur n’est PAS fermé : les autres plateformes continuent');
  assert.equal(e.arretee(), null, 'l’essai n’est pas arrêté');
  assert.deepEqual(e.plateformesBloquees(U), ['leboncoin']);
  await e.releveCadres();
  assert.equal(appels.bloquer.length, 1, 'la même glissière ne rebloque pas');
  await e.connexionVerifiee({ user: U, plateforme: 'leboncoin', http: 200, le: '2026-11-01T23:30:00.000Z' });
  assert.deepEqual(e.plateformesBloquees(U), [], 'la connexion vérifiée (« Me connecter ») rouvre Leboncoin');
  const ev = lireMesures().map((x) => x.evenement);
  assert.ok(ev.includes('PLATEFORME_BLOQUEE') && ev.includes('connexion_verifiee') && ev.includes('plateforme_debloquee'), ev.join(','));
});

test('(01/11) l’arrêt total d’avant (arret.json qui nomme sa plateforme) devient le blocage de cette plateforme au redémarrage', async () => {
  const { e, appels, dossierEtat, U } = monterEndurance({ arretFichier: { le: '2026-11-01T21:57:23.350Z', user: 'f44b5917-bccc-4431-ba41-f40571a2ed18', source: 'navigateur', nature: 'glissiere', plateforme: 'leboncoin' } });
  assert.equal(await e.charger(), null, 'l’exécutant repart');
  assert.equal(e.arretee(), null);
  assert.deepEqual(e.plateformesBloquees(U), ['leboncoin'], 'Leboncoin reste en vérification');
  assert.deepEqual(appels.bloquer, [['leboncoin', 'glissiere']], 'son coffre est marqué (verrou fermé à l’ouverture)');
  assert.ok(!existsSync(path.join(dossierEtat, 'endurance', 'arret.json')), 'arret.json rangé à côté');
  assert.ok(readdirSync(path.join(dossierEtat, 'endurance')).some((f) => /^arret-2026-11-01T21-57-23-350Z\.json$/.test(f)), 'gardé pour l’historique');
});

test('(01/11) un blocage SANS plateforme arrête encore tout (règle d’avant, ce seul cas) et le DIT à l’app', async () => {
  const { e, appels } = monterEndurance({ cibles: [{ type: 'iframe', url: CAPTCHA('bv', 'https://inconnu.example/') }] });
  await e.charger();
  await e.releveCadres();
  assert.ok(e.arretee(), 'arrêt total');
  assert.deepEqual(appels.fermer, ['blocage_endurance']);
  assert.ok(appels.noter.some(([, etat, d]) => etat === 'erreur' && /^arret_essai:/.test(d.erreur)), 'cloud_postes : erreur « arret_essai:… », lue par l’app');
});

test('(01/11) une tâche refusée par l’anti-robot bloque SA plateforme, une seule fois', async () => {
  const taches = [{ id: 't1', platform: 'beebs', action: 'republish', status: 'failed', error: 'Vérification anti-robot Beebs', handler_build: 'x-cloud' }];
  const { e, appels } = monterEndurance({ taches });
  await e.charger();
  await e.mesure();
  await e.mesure();
  assert.deepEqual(appels.bloquer, [['beebs', 'tache_refusee_anti_robot']]);
  assert.equal(e.arretee(), null);
});
