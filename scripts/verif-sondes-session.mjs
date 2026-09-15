// Vérification des deux moitiés du lot « sondes de session ».
// 1) La fusion RÉELLE de background.js (fonction extraite du fichier, pas une copie).
// 2) La règle d'affichage RÉELLE de src/utils/sessionsPlateformes.js (import direct).
import { readFileSync } from 'node:fs';
import { etatSession, sessionsAffichables } from '../src/utils/sessionsPlateformes.js';

let ok = 0, ko = 0;
const test = (nom, attendu, obtenu) => {
  const a = JSON.stringify(attendu), b = JSON.stringify(obtenu);
  if (a === b) { ok++; console.log(`  ✅ ${nom}`); }
  else { ko++; console.log(`  ⛔ ${nom}\n       attendu ${a}\n       obtenu  ${b}`); }
};

// ── 1. LA FUSION, extraite telle quelle de background.js ────────────────────
const src = readFileSync(new URL('../chrome-extension/background.js', import.meta.url), 'utf8');
const debut = src.indexOf('async function ecrireExtensionSessions');
const fin = src.indexOf('\nasync function reportPlatformSessions', debut);
const corps = src.slice(debut, fin);
let dernierPatch = null;
const sessionsSansHistorique = (s) => { if (!s || typeof s !== 'object') return null; const { previous, ...r } = s; return r; };
const restRequest = async (url, _t, opts) => {
  if (opts?.method === 'PATCH') { dernierPatch = JSON.parse(opts.body).extension_sessions; return null; }
  return [];
};
const ecrireExtensionSessions = new Function('sessionsSansHistorique', 'restRequest',
  `${corps}; return ecrireExtensionSessions;`)(sessionsSansHistorique, restRequest);

console.log('\n1. FUSION (background.js, code réel) — le cas John du 15/09');
{
  const precedent = {
    checked_at: '2026-09-15T20:57:00.000Z',
    sondees: ['ebay'],
    vinted: true, leboncoin: null, ebay: true, beebs: null,
    http: { vinted: 200, leboncoin: null, ebay: 200, beebs: null },
    checked_at_par_plateforme: { ebay: '2026-09-15T20:57:00.000Z', vinted: '2026-09-15T20:50:00.000Z' },
    vinted_identite: { user_id: '1', login: 'john' },
  };
  const releve = {
    checked_at: '2026-09-15T20:59:55.904Z', sondees: ['vinted'],
    vinted: true, leboncoin: null, ebay: null, beebs: null,
    http: { vinted: 200, leboncoin: null, ebay: null, beebs: null },
    checked_at_par_plateforme: { vinted: '2026-09-15T20:59:55.904Z' },
    vinted_identite: { user_id: '1', login: 'john' },
  };
  await ecrireExtensionSessions('jeton', 'sub', releve, precedent);
  test('eBay CONSERVÉ (était true, non sondé ce tour)', true, dernierPatch.ebay);
  test('eBay garde son http 200', 200, dernierPatch.http.ebay);
  test('eBay garde SON horodatage (20:57, pas 20:59)', '2026-09-15T20:57:00.000Z', dernierPatch.checked_at_par_plateforme.ebay);
  test('Vinted prend la valeur du relevé', true, dernierPatch.vinted);
  test('Vinted prend le nouvel horodatage', '2026-09-15T20:59:55.904Z', dernierPatch.checked_at_par_plateforme.vinted);
}
{
  // Une DÉCONNEXION observée par un handler ne doit pas être ressuscitée en true.
  const precedent = { checked_at: '2026-09-15T20:00:00.000Z', sondees: [], leboncoin: false,
    http: { leboncoin: 'login_redirect_observee' }, checked_at_par_plateforme: { leboncoin: '2026-09-15T20:00:00.000Z' } };
  const releve = { checked_at: '2026-09-15T20:10:00.000Z', sondees: ['vinted'], vinted: true,
    leboncoin: null, ebay: null, beebs: null, http: { vinted: 200 }, checked_at_par_plateforme: { vinted: '2026-09-15T20:10:00.000Z' } };
  await ecrireExtensionSessions('jeton', 'sub', releve, precedent);
  test('Leboncoin false (observation handler) CONSERVÉ', false, dernierPatch.leboncoin);
  test('… avec son motif', 'login_redirect_observee', dernierPatch.http.leboncoin);
}

// ── 2. LA RÈGLE D'AFFICHAGE (src/utils, code réel) ──────────────────────────
console.log('\n2. AFFICHAGE (src/utils/sessionsPlateformes.js, code réel)');
const ilYA = (ms) => new Date(Date.now() - ms).toISOString();
const MIN = 60 * 1000, H = 60 * MIN;
test('sonde true fraîche → ok', 'ok',
  etatSession({ ebay: true, checked_at_par_plateforme: { ebay: ilYA(5 * MIN) } }, 'ebay'));
test('sonde true de 3 h sur eBay → encore dans la fenêtre', 'ok',
  etatSession({ ebay: true, checked_at_par_plateforme: { ebay: ilYA(2.9 * H) } }, 'ebay'));
test('sonde true de 4 h sur eBay → trop vieille, null', null,
  etatSession({ ebay: true, checked_at_par_plateforme: { ebay: ilYA(4 * H) } }, 'ebay'));
test('sonde true de 2 h sur VINTED → trop vieille (fenêtre 1 h)', null,
  etatSession({ vinted: true, checked_at_par_plateforme: { vinted: ilYA(2 * H) } }, 'vinted'));
test('false frais → ko', 'ko',
  etatSession({ leboncoin: false, checked_at_par_plateforme: { leboncoin: ilYA(5 * MIN) } }, 'leboncoin'));
test('null (403 DataDome) → jamais ko, null', null,
  etatSession({ leboncoin: null, http: { leboncoin: 403 }, checked_at_par_plateforme: { leboncoin: ilYA(2 * MIN) } }, 'leboncoin'));
test('publication de 2 h, aucune sonde → ok', 'ok',
  etatSession({ leboncoin: null, checked_at_par_plateforme: {} }, 'leboncoin', Date.now() - 2 * H));
test('publication de 4 jours → ne prouve plus rien', null,
  etatSession({ leboncoin: null, checked_at_par_plateforme: {} }, 'leboncoin', Date.now() - 96 * H));
test('déconnexion observée il y a 10 min > dépôt d\'hier', 'ko',
  etatSession({ leboncoin: false, checked_at_par_plateforme: { leboncoin: ilYA(10 * MIN) } }, 'leboncoin', Date.now() - 24 * H));
test('dépôt il y a 10 min > sonde false d\'il y a 50 min', 'ok',
  etatSession({ leboncoin: false, checked_at_par_plateforme: { leboncoin: ilYA(50 * MIN) } }, 'leboncoin', Date.now() - 10 * MIN));
test('rien du tout → null', null, etatSession({}, 'beebs'));
test('relevé sans rien d\'affirmable → null (aucun badge)', null,
  sessionsAffichables({ vinted: null, leboncoin: null, ebay: null, beebs: null, checked_at_par_plateforme: {} }, {}));
test('map réduite : seules les plateformes sues ont une clé', { leboncoin: false, ebay: true },
  sessionsAffichables({ ebay: true, leboncoin: false, vinted: null, beebs: null,
    checked_at_par_plateforme: { ebay: ilYA(5 * MIN), leboncoin: ilYA(5 * MIN) } }, {}));

console.log(`\n${ko ? '⛔' : '✅'} ${ok} vérifications passées, ${ko} en échec`);
process.exitCode = ko ? 1 : 0;
