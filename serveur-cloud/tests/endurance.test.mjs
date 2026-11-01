// L'essai de 48 h (01/11) : les blocages reconnus, la mémoire, les tâches du Cloud ; la preuve du pare-feu.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cadreDataDome, blocageDesCadres, erreurAntiRobot, memoireMo, resumeTachesCloud, plateformeDeLAdresse, VERIFICATION_TOLEREE_MS } from '../src/endurance.js';
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
  assert.deepEqual(motifsVerrou(['vinted', 'leboncoin', 'beebs', 'depop']), [], 'tout connecté : aucune interception');
  assert.ok(motifsVerrou(['ebay', 'opla', 'VINTED']).every((m) => !m.urlPattern.includes('vinted')), 'les noms se nettoient ; eBay et Opla ne sont jamais ouverts ici');
  assert.ok(motifsVerrou([]).every((m) => m.requestStage === 'Request'), 'arrêtées avant de partir');
});
