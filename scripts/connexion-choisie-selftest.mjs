// ═══════════════════════════════════════════════════════════════════════════
// UNE PLATEFORME CHOISIE ET PAS VUE CONNECTÉE LE DIT, TOUT DE SUITE (13/11, décision de Nico — lot du 13/11, N1)
// `npm run selftest:connexion-choisie`
// ═══════════════════════════════════════════════════════════════════════════
// « Toute plateforme choisie par le vendeur et pas vue connectée doit le lui dire clairement et tout de suite, dès
// l'inscription et ensuite, sans attendre qu'une synchro ou une publication échoue. Pour TOUTES les plateformes. »
// Garde-fous : jamais « pas connecté » quand la session est vue mais bloquée par l'anti-robot ; jamais « ordinateur » ni
// « Chrome » à un client Cloud ; le message existant des synchros en échec ne change pas.
// Cas RÉELS (id8 de compte, faits lus en base le 13/11, lecture seule) :
//   ff1f879f — Vinted choisi, jamais vu connecté (sonde 403, ventes 400 « user_login_required »), rien ne le lui a dit ;
//   1f95f334 — Vinted+Depop+eBay+Leboncoin+Beebs : Vinted et Beebs jamais vus, eBay sonde « false », Depop session vue
//              jamais synchronisée (sa première synchro n'est jamais partie : Leboncoin avait eu la sienne) ;
//   7d64bf87 — Vinted+Beebs, aucune session vue nulle part ;
//   ed4531e2 — connecté à Vinted dans l'onglet (ventes lues, dépôts réussis), sonde 403 : JAMAIS « pas connecté » ;
//   16eb79ce — session Vinted vue, jamais synchronisé : la première synchro de Vinted part ;
//   d607ba20 — client FillSell Cloud, rien de connecté au Cloud : les mots du Cloud, jamais « ordinateur » ni « Chrome » ;
//   a1e210f2 — Vinted + Leboncoin connectés et relevés la veille : silence ;
//   + un échec de synchro existant : son message ne change pas.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import vm from 'node:vm';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (p) => readFileSync(join(RACINE, p), 'utf8').replace(/\r\n/g, '\n');
let verts = 0, rouges = 0;
const ok = (c, msg, d = '') => { if (c) { verts++; console.log(`  ok   ${msg}`); } else { rouges++; console.log(`  RATÉ ${msg}${d ? `  ← ${d}` : ''}`); } };
const importer = async (p) => { try { return await import(pathToFileURL(join(RACINE, p)).href); } catch (e) { console.log(`  (import ${p} : ${String(e?.message ?? e).slice(0, 120)})`); return null; } };

const C = await importer('src/plateformes/connexionChoisie.js');
const B = await importer('src/stock/boutonSynchro.js');
const P = await importer('supabase/functions/_shared/premiere-synchro.js');
const fn = (m, n) => (m && typeof m[n] === 'function' ? m[n] : () => { throw new Error(`${n} absente`); });
const essai = (f) => { try { return f(); } catch (e) { return { erreur: String(e?.message ?? e) }; } };

// ── La vérité serveur (plateformes_verite) de chaque cas, telle que la fonction la rend sur les faits lus le 13/11 ──
const EXT = '2026-11-13T05:30:22Z';
const pv = (etat, extra = {}) => ({ etat, ...extra });
const verite = (plateformes, extension_vue_le = EXT) => ({ ok: true, calcule_le: '2026-11-13T06:00:00Z', extension_vue_le, plateformes });
const FF1F879F = verite({
  vinted: pv('inconnue', { motif: 'pas_encore_verifiee', declaree: true, ecartee: false, http: '403' }),
  leboncoin: pv('connectee', { source: 'releve', motif: 'releve_reussi', declaree: true, ecartee: false }),
  ebay: pv('connectee', { source: 'api', motif: 'compte_relie_api', declaree: true, ecartee: false }),
  beebs: pv('ecartee', { declaree: false, ecartee: true }), depop: pv('ecartee', { declaree: false, ecartee: true }),
  opla: pv('inconnue', { motif: 'pas_encore_verifiee', declaree: false, ecartee: false }),
});
const F1F95F334 = verite({
  vinted: pv('inconnue', { motif: 'pas_encore_verifiee', declaree: true, http: '403' }),
  depop: pv('connectee', { source: 'sonde', motif: 'sonde_connectee', declaree: true }),
  ebay: pv('a_connecter', { source: 'sonde', motif: 'sonde_deconnectee', action: 'relier_ebay', action_secondaire: 'connexion', declaree: true }),
  leboncoin: pv('connectee', { source: 'sonde', motif: 'sonde_connectee', declaree: true }),
  beebs: pv('inconnue', { motif: 'pas_encore_verifiee', declaree: true, http: '403' }),
  opla: pv('inconnue', { motif: 'pas_encore_verifiee', declaree: false }),
}, '2026-11-13T00:03:00Z');
const F7D64BF87 = verite({
  vinted: pv('inconnue', { motif: 'pas_encore_verifiee', declaree: true, http: '403' }),
  beebs: pv('inconnue', { motif: 'pas_encore_verifiee', declaree: true, http: '403' }),
  leboncoin: pv('connectee', { source: 'sonde', declaree: false }), ebay: pv('a_connecter', { action: 'relier_ebay', declaree: false }),
  depop: pv('inconnue', { declaree: false }), opla: pv('inconnue', { declaree: false }),
});
const ED4531E2 = verite({
  vinted: pv('inconnue', { motif: 'pas_encore_verifiee', declaree: true, http: '403' }),
  leboncoin: pv('ecartee', { declaree: false, ecartee: true }), ebay: pv('ecartee', { declaree: false, ecartee: true }),
  beebs: pv('ecartee', { declaree: false, ecartee: true }), depop: pv('inconnue', { declaree: false }), opla: pv('inconnue', { declaree: false }),
}, '2026-11-11T20:26:00Z');
const D607BA20 = verite({
  vinted: pv('inconnue', { declaree: true }), leboncoin: pv('inconnue', { declaree: true }), beebs: pv('inconnue', { declaree: true }),
  depop: pv('inconnue', { declaree: true }), ebay: pv('inconnue', { declaree: false }), opla: pv('inconnue', { declaree: false }),
}, '2026-11-13T05:48:00Z');
const A1E210F2 = verite({
  vinted: pv('connectee', { source: 'releve', declaree: true }), leboncoin: pv('connectee', { source: 'releve', declaree: true }),
  ebay: pv('inconnue', { declaree: false }), beebs: pv('inconnue', { declaree: false }), depop: pv('inconnue', { declaree: false }), opla: pv('inconnue', { declaree: false }),
});
const NON_CLOUD = { compteLu: true, clientCloud: false };
// d607ba20 au coffre du Cloud (lu le 13/11) : seulement la ligne « fillsell » → Vinted, Leboncoin, Beebs, Depop jamais connectés.
const CLOUD_D607 = { compteLu: true, clientCloud: true, lu: true, etats: { fillsell: { connecte: true } }, isoles: [], ebayApi: null };

const cc = (o) => essai(() => fn(C, 'connexionsChoisies')(o));
const etats = (r) => (r?.lignes ?? []).map((l) => `${l.p}:${l.etat}`).join(',');
const textes = (r) => (r?.lignes ?? []).map((l) => `${l.titre} ${l.texte} ${l.geste?.libelle ?? ''}`).join(' | ');

console.log('1. La règle : chaque plateforme CHOISIE pas vue connectée le dit, avec son geste');
{
  const r = cc({ verite: FF1F879F, cloud: NON_CLOUD });
  ok(etats(r) === 'vinted:pas_vue', 'ff1f879f : Vinted choisi, jamais vu → UNE ligne « pas encore vue » ; Leboncoin (relevé) et eBay (API) se taisent', etats(r) || JSON.stringify(r));
  const l = r?.lignes?.[0];
  ok(/FillSell ne voit pas encore ta connexion à Vinted/.test(l?.texte ?? ''), 'ff1f879f : la phrase « FillSell ne voit pas encore ta connexion à Vinted »', l?.texte);
  ok(l?.geste?.type === 'connexion' && l?.geste?.libelle === 'Me connecter', 'ff1f879f : le geste « Me connecter » (ouvre la connexion de Vinted)', JSON.stringify(l?.geste));
  ok(!/pas connecté/i.test(l?.texte ?? 'x'), '… sans affirmer « pas connecté » (la sonde 403 de la 0.6.186 ne tranche pas)', l?.texte);
  const en = cc({ verite: FF1F879F, cloud: NON_CLOUD, lang: 'en' });
  ok(/FillSell can't see your Vinted connection yet/.test(en?.lignes?.[0]?.texte ?? '') && en?.lignes?.[0]?.geste?.libelle === 'Sign in', '… et en anglais', en?.lignes?.[0]?.texte);
}
{
  const r = cc({ verite: F1F95F334, cloud: NON_CLOUD });
  ok(etats(r) === 'vinted:pas_vue,ebay:a_relier,beebs:pas_vue', '1f95f334 : Vinted et Beebs pas vus, eBay à relier ; Depop et Leboncoin connectés se taisent', etats(r) || JSON.stringify(r));
  const eb = r?.lignes?.find((x) => x.p === 'ebay');
  ok(/eBay/.test(eb?.texte ?? '') && /Relie/.test(eb?.texte ?? '') && eb?.geste?.type === 'connexion', '1f95f334 : eBay dit « relie ton compte » et porte le geste (les deux voies)', JSON.stringify(eb));
}
{
  const r = cc({ verite: F7D64BF87, cloud: NON_CLOUD });
  ok(etats(r) === 'vinted:pas_vue,beebs:pas_vue', '7d64bf87 : Vinted et Beebs (choisis) le disent ; Leboncoin et eBay (pas choisis) jamais', etats(r) || JSON.stringify(r));
}
{
  // ed4531e2 avec la 0.6.187 : la sonde lit le cookie de connexion → « session vue, vérification bloquée ».
  const r = cc({ verite: ED4531E2, cloud: NON_CLOUD, sondeMotif: { vinted: 'session_vue_bloquee' } });
  const l = r?.lignes?.[0];
  ok(etats(r) === 'vinted:bloquee', 'ed4531e2 (0.6.187, cookie de connexion présent) : « bloquée », un AUTRE message', etats(r) || JSON.stringify(r));
  ok(!/pas connecté|ne voit pas encore|connecte-toi/i.test(`${l?.titre} ${l?.texte}`) && /anti-robot/.test(l?.texte ?? ''), '… jamais « pas connecté » : la session est vue, l’anti-robot bloque', `${l?.titre} ${l?.texte}`);
  const avant = cc({ verite: ED4531E2, cloud: NON_CLOUD });
  ok(etats(avant) === 'vinted:pas_vue' && !/pas connecté/i.test(textes(avant)), 'ed4531e2 avec la 0.6.186 (aucun motif) : la phrase vraie dans les deux cas, jamais « pas connecté »', textes(avant));
  const pc = cc({ verite: FF1F879F, cloud: NON_CLOUD, sondeMotif: { vinted: 'pas_connecte' } });
  ok(etats(pc) === 'vinted:deconnectee', 'ff1f879f avec la 0.6.187 (refus « access_denied » ET aucun cookie de connexion) : « pas connecté »', etats(pc));
  const ar = cc({ verite: FF1F879F, cloud: NON_CLOUD, sondeMotif: { vinted: 'anti_robot' } });
  ok(etats(ar) === 'vinted:pas_vue', 'une page anti-robot sans cookie de connexion lisible : « pas encore vue » (rien d’affirmé)', etats(ar));
  const vu = cc({ verite: A1E210F2, cloud: NON_CLOUD, sondeMotif: { vinted: 'pas_connecte' } });
  ok(etats(vu) === '', 'un motif de sonde ne contredit jamais une connexion PROUVÉE (relevé réussi) : silence', etats(vu));
}
{
  const r = cc({ verite: A1E210F2, cloud: NON_CLOUD });
  ok(Array.isArray(r?.lignes) && r.lignes.length === 0 && r.lu === true, 'a1e210f2 : Vinted et Leboncoin connectés → silence', JSON.stringify(r));
}
{
  const r = cc({ verite: verite(FF1F879F.plateformes, null), cloud: NON_CLOUD });
  ok(r?.installation === true && (r?.lignes ?? []).length === 0, 'extension jamais vue : UN message d’installation, aucune ligne par plateforme', JSON.stringify(r));
  const pasLu = cc({ verite: FF1F879F, cloud: { compteLu: false, clientCloud: false } });
  ok(pasLu?.lu === false && (pasLu?.lignes ?? []).length === 0, 'compte Cloud pas encore lu : on attend (jamais un texte d’ordinateur à un client Cloud)', JSON.stringify(pasLu));
  const deleg = cc({ verite: F1F95F334, cloud: NON_CLOUD, delegues: ['leboncoin'], plateformesFermees: ['beebs'] });
  ok(!/leboncoin|beebs/.test(etats(deleg)), 'Leboncoin délégué à un autre compte, plateforme fermée : jamais dites', etats(deleg));
  const opla = cc({ verite: verite({ ...FF1F879F.plateformes, opla: pv('inconnue', { declaree: true }) }), cloud: NON_CLOUD });
  ok(!/opla/.test(etats(opla)), 'Opla (quittée le 10/10) n’est jamais dite', etats(opla));
  const dep = cc({ verite: verite({ ...FF1F879F.plateformes, depop: pv('a_autoriser', { declaree: true, action: 'connexion' }) }), cloud: NON_CLOUD });
  const ld = dep?.lignes?.find((x) => x.p === 'depop');
  ok(ld?.etat === 'a_autoriser' && ld?.geste?.type === 'autoriser_depop', 'Depop à autoriser : sa phrase et « Autoriser Depop »', JSON.stringify(ld));
}
{
  const r = cc({ verite: D607BA20, cloud: CLOUD_D607 });
  ok(etats(r) === 'vinted:cloud_a_connecter,leboncoin:cloud_a_connecter,beebs:cloud_a_connecter,depop:cloud_a_connecter', 'd607ba20 (Cloud) : chaque plateforme choisie « pas encore connectée » au Cloud', etats(r) || JSON.stringify(r));
  ok(!/ordinateur|chrome|navigateur/i.test(textes(r)) && /FillSell Cloud/.test(textes(r)), 'd607ba20 : les mots du Cloud — jamais « ordinateur », « Chrome » ni « navigateur »', textes(r));
  ok((r?.lignes ?? []).every((l) => l.geste?.type === 'cloud'), 'd607ba20 : le geste ouvre l’écran de connexion du Cloud', JSON.stringify((r?.lignes ?? []).map((l) => l.geste)));
  const eb = cc({ verite: verite({ ...D607BA20.plateformes, ebay: pv('inconnue', { declaree: true }) }), cloud: { ...CLOUD_D607, ebayApi: false } });
  const le = eb?.lignes?.find((x) => x.p === 'ebay');
  ok(le?.geste?.type === 'relier_ebay_api' && !/ordinateur|chrome/i.test(`${le?.titre} ${le?.texte}`), 'Cloud, eBay pas relié : « relie eBay » par l’API, jamais la voie Chrome', JSON.stringify(le));
}
{
  const r = cc({ verite: F1F95F334, cloud: NON_CLOUD });
  const sansDouble = essai(() => fn(C, 'lignesNonDites')(r?.lignes ?? [], new Set(['vinted'])));
  ok(Array.isArray(sansDouble) && !sansDouble.some((l) => l.p === 'vinted') && sansDouble.length === 2, 'Stock : une plateforme qui a déjà son point d’échec (message existant) n’en reçoit pas un second', JSON.stringify(sansDouble));
}

console.log('\n2. Le bouton « Synchroniser » ne dit plus « Tout est à jour » tant qu’une plateforme CHOISIE n’a jamais été lue');
{
  const maintenant = Date.parse('2026-11-13T01:05:00Z');
  // ff1f879f, 02:05 Paris : Leboncoin lu à 02:00, eBay (API) à 02:00 ; Vinted choisi, jamais lu, aucune session.
  const plateformes = [
    { p: 'vinted', nom: 'Vinted', phase: 'jamais', fini: null, session: null, api: false, choisie: true, connexion: 'connexion pas encore vue' },
    { p: 'leboncoin', nom: 'Leboncoin', phase: 'fait', fini: maintenant - 5 * 60_000, session: null, api: false, choisie: true },
    { p: 'ebay', nom: 'eBay', phase: 'fait', fini: maintenant - 5 * 60_000, session: null, api: true, choisie: true },
  ];
  const e = essai(() => fn(B, 'etatBoutonSynchro')({ plateformes, maintenant }));
  ok(e?.grise === false, 'ff1f879f : le bouton n’est PLUS grisé « Tout est à jour »', JSON.stringify(e));
  const lv = (e?.lignes ?? []).find((l) => l.p === 'vinted');
  ok(lv && /Vinted/.test(lv.texte) && /connexion pas encore vue/.test(lv.texte) && lv.aJour === false, 'ff1f879f : la ligne de détail nomme Vinted et sa connexion', JSON.stringify(e?.lignes));
  const sans = essai(() => fn(B, 'etatBoutonSynchro')({ plateformes: plateformes.map((x) => (x.p === 'vinted' ? { ...x, choisie: false } : x)), maintenant }));
  ok(sans?.grise === true && !(sans?.lignes ?? []).some((l) => l.p === 'vinted'), 'une plateforme PAS choisie, jamais lue, reste hors du compte (règle du 31/10 inchangée)', JSON.stringify(sans));
  ok((e?.connectees ?? []).join() === 'leboncoin,ebay', '« prochaine synchro automatique » ne compte que les plateformes lues', JSON.stringify(e?.connectees));
}

console.log('\n3. La première synchro part PAR PLATEFORME (une fois par plateforme)');
{
  const prem = (o) => essai(() => fn(P, 'premiereSynchroAPoser')(o));
  // ff1f879f : inscrit 13/11 00:50:17 UTC ; Leboncoin a eu sa première synchro (app, faite), eBay relu par l'API.
  const ff = {
    inscritLe: '2026-11-13T00:50:17Z', maintenant: Date.parse('2026-11-13T09:00:00Z'),
    platformSettings: { plateformes_vendeur: ['vinted', 'leboncoin', 'ebay'], plateformes_ecartees: ['beebs', 'depop'] },
    sessions: { vinted: true, leboncoin: true, ebay: true },
    runs: [{ kind: 'annonces', platform: 'leboncoin', status: 'done', declencheur: 'app' }, { kind: 'annonces', platform: 'ebay', status: 'done', declencheur: 'serveur:quotidien_api' }],
    dejaPosees: ['leboncoin'],
  };
  ok(Array.isArray(prem(ff)) && prem(ff).join() === 'vinted', 'ff1f879f : Vinted vu connecté (plus tard) → SA première synchro part, même si Leboncoin a eu la sienne', JSON.stringify(prem(ff)));
  ok(prem({ ...ff, sessions: { leboncoin: true, ebay: true } }).length === 0, 'ff1f879f tel qu’à 02:00 (Vinted pas vu) : rien pour Vinted', JSON.stringify(prem({ ...ff, sessions: { leboncoin: true } })));
  // 1f95f334 : inscrit 02/11 11:08 UTC ; Leboncoin relevé (app) ; Depop session vue, jamais relevé ; eBay sonde false.
  const f1 = {
    inscritLe: '2026-11-02T11:08:00Z', maintenant: Date.parse('2026-11-13T09:00:00Z'),
    platformSettings: { plateformes_vendeur: ['vinted', 'depop', 'ebay', 'leboncoin', 'beebs'] },
    sessions: { depop: true, ebay: false, leboncoin: true },
    runs: [{ kind: 'annonces', platform: 'leboncoin', status: 'done', declencheur: 'app' }],
    dejaPosees: ['leboncoin'],
  };
  ok(prem(f1).join() === 'depop', '1f95f334 : Depop (session vue, jamais relevée) reçoit sa première synchro', JSON.stringify(prem(f1)));
  ok(prem({ ...f1, dejaPosees: ['leboncoin', 'depop'] }).length === 0, '… une seule fois par plateforme (déjà posée → plus jamais)', JSON.stringify(prem({ ...f1, dejaPosees: ['leboncoin', 'depop'] })));
  ok(prem({ ...f1, runs: [...f1.runs, { kind: 'annonces', platform: 'depop', status: 'queued', declencheur: 'app' }] }).length === 0, '… ni pendant qu’une demande Depop attend', '');
  ok(prem({ ...f1, platformSettings: { ...f1.platformSettings, plateformes_ecartees: ['depop'] } }).length === 0, '… ni sur une plateforme écartée (« je ne vends pas ici »)', '');
  ok(prem({ ...f1, runsComplets: false }).length === 0, 'relevés illisibles en entier (200 lignes) : rien (jamais deux fois)', '');
  // 16eb79ce : session Vinted vue (jeton expiré, cookie de connexion), jamais synchronisé, inscrit 18/10 21:22 UTC.
  const f16 = { inscritLe: '2026-10-18T21:22:00Z', maintenant: Date.parse('2026-10-25T10:00:00Z'), platformSettings: { plateformes_vendeur: ['vinted'] }, sessions: { vinted: true }, runs: [] };
  ok(prem(f16).join() === 'vinted', '16eb79ce : session vue, jamais synchronisé → la première synchro de Vinted part', JSON.stringify(prem(f16)));
  ok(prem({ ...f16, maintenant: Date.parse('2026-11-13T10:00:00Z') }).length === 0, '… dans la fenêtre de jours existante seulement (16eb79ce aujourd’hui : rien)', '');
  const deja = essai(() => fn(P, 'plateformesDejaPosees')([{ metadata: { plateformes: ['leboncoin'] } }, { metadata: { plateformes: ['depop', 'x'] } }, { metadata: null }]));
  ok(Array.isArray(deja) && deja.join() === 'leboncoin,depop', 'la marque « déjà posée » se lit dans usage_logs premiere_synchro_auto', JSON.stringify(deja));
  const gpj = lire('supabase/functions/get-pending-jobs/index.ts');
  const bloc = gpj.slice(gpj.indexOf('LA PREMIÈRE SYNCHRO PART SEULE'), gpj.indexOf('LA PREMIÈRE SYNCHRO PART SEULE') + 6000);
  ok(/plateformesDejaPosees/.test(bloc) && /feature", "premiere_synchro_auto"/.test(bloc), 'get-pending-jobs lit la marque par plateforme avant de poser', '');
  ok(/select\("kind, platform, status, declencheur"\)/.test(bloc), 'get-pending-jobs lit la plateforme et l’état de chaque relevé', '');
}

console.log('\n4. Extension 0.6.187 — la sonde Vinted distingue « pas connecté » et « bloqué par l’anti-robot »');
const DOSSIER = join(RACINE, 'chrome-extension');
const rien = { addListener: () => {} };
function chargerBackground({ statut = 403, corps = '', type = 'application/json', cookies = [] } = {}) {
  const ecrits = [];
  let sessionsEnBase = null;
  const ctx = {
    console: { log() {}, warn() {}, error() {}, info() {} },
    setTimeout, clearTimeout, setInterval, clearInterval, URL, URLSearchParams, TextEncoder, TextDecoder, AbortController, Response, Headers,
    atob: (s) => Buffer.from(s, 'base64').toString('binary'), btoa: (s) => Buffer.from(s, 'binary').toString('base64'),
    importScripts: (f) => vm.runInContext(readFileSync(join(DOSSIER, f), 'utf8'), contexte, { filename: f }),
    fetch: async (url, init = {}) => {
      const u = String(url);
      if (u.includes('/api/v2/users/current')) {
        return { ok: statut === 200, status: statut, url: u, headers: { get: (k) => (/content-type/i.test(k) ? type : null) },
          json: async () => JSON.parse(corps || '{}'), text: async () => corps };
      }
      if (u.includes('/rest/v1/profiles')) {
        if ((init.method ?? 'GET') === 'PATCH') { const b = JSON.parse(init.body); sessionsEnBase = b.extension_sessions; ecrits.push(b.extension_sessions); return { ok: true, status: 204, json: async () => null, text: async () => '' }; }
        return { ok: true, status: 200, json: async () => [{ extension_sessions: sessionsEnBase }], text: async () => JSON.stringify([{ extension_sessions: sessionsEnBase }]) };
      }
      return { ok: false, status: 599, url: u, headers: { get: () => null }, json: async () => ({}), text: async () => '' };
    },
    chrome: {
      runtime: { onMessage: rien, onInstalled: rien, onStartup: rien, onUpdateAvailable: rien, lastError: null, id: 'selftest', getManifest: () => ({ version: '0.0.0' }) },
      alarms: { onAlarm: rien, create: () => {}, getAll: async () => [], get: async () => null, clear: async () => false },
      storage: { local: { get: async () => ({}), set: async () => {}, remove: async () => {} }, session: { get: async () => ({}), set: async () => {}, remove: async () => {} }, onChanged: rien },
      tabs: { onRemoved: rien, onUpdated: rien, query: async () => [] }, windows: { onRemoved: rien },
      scripting: { executeScript: async () => [] },
      cookies: { get: async ({ name }) => cookies.find((c) => c.name === name) ?? null, getAll: async () => cookies },
      permissions: { contains: async () => false },
      action: { onClicked: rien, setBadgeText: () => {}, setBadgeBackgroundColor: () => {} },
      power: { requestKeepAwake: () => {}, releaseKeepAwake: () => {} },
    },
  };
  ctx.globalThis = ctx; ctx.self = ctx;
  const contexte = vm.createContext(ctx);
  vm.runInContext(readFileSync(join(DOSSIER, 'background.js'), 'utf8'), contexte, { filename: 'background.js' });
  return { ctx, contexte, ecrits, poser: (s) => { sessionsEnBase = s; }, enBase: () => sessionsEnBase };
}
const ANONYME = JSON.stringify({ code: 106, message: 'Accès refusé', message_code: 'access_denied' }); // mesuré le 13/11, visiteur anonyme
const COOKIES_ANONYMES = [{ name: 'anon_id', value: 'a' }, { name: '_vinted_fr_session', value: 's' }];
const COOKIES_CONNECTE = [...COOKIES_ANONYMES, { name: 'v_uid', value: '12345' }];
{
  const { ctx } = chargerBackground({ corps: ANONYME, cookies: COOKIES_ANONYMES });
  const r = await ctx.probePlatformSessions(['vinted']);
  ok(r.vinted === null && Number(r.http?.vinted) === 403, '403 : le sens de `vinted` et `http.vinted` ne change pas (null, 403) — aucun lecteur touché', JSON.stringify({ v: r.vinted, h: r.http?.vinted }));
  ok(r.sonde_motif?.vinted === 'pas_connecte', 'ff1f879f : 403 « access_denied » ET aucun cookie de connexion → motif « pas_connecte »', JSON.stringify(r.sonde_motif));
}
{
  const { ctx } = chargerBackground({ corps: ANONYME, cookies: COOKIES_CONNECTE });
  const r = await ctx.probePlatformSessions(['vinted']);
  ok(r.vinted === null && r.sonde_motif?.vinted === 'session_vue_bloquee', 'ed4531e2 : 403 avec le cookie de connexion → « session vue, bloquée », jamais « pas connecté »', JSON.stringify(r.sonde_motif));
}
{
  const { ctx } = chargerBackground({ corps: '<html><head><title>vinted.fr</title></head><body>datadome captcha</body></html>', type: 'text/html', cookies: COOKIES_ANONYMES });
  const r = await ctx.probePlatformSessions(['vinted']);
  ok(r.vinted === null && r.sonde_motif?.vinted === 'anti_robot', 'page anti-robot (HTML, DataDome) sans cookie de connexion → « anti_robot » (rien d’affirmé sur la connexion)', JSON.stringify(r.sonde_motif));
}
{
  const { ctx } = chargerBackground({ corps: ANONYME, cookies: [] });
  const r = await ctx.probePlatformSessions(['vinted']);
  ok(r.vinted === null && (r.sonde_motif?.vinted ?? null) === null, 'cookies illisibles (magasin vide) → aucun motif : on ne conclut pas', JSON.stringify(r.sonde_motif));
}
{
  const { ctx } = chargerBackground({ statut: 200, corps: JSON.stringify({ user: { id: 42, login: 'nico' } }), cookies: COOKIES_CONNECTE });
  const r = await ctx.probePlatformSessions(['vinted']);
  ok(r.vinted === true && (r.sonde_motif?.vinted ?? null) === null, '200 → connectée, aucun motif', JSON.stringify(r.sonde_motif));
}
{
  // La fusion : une sonde qui ne touche pas Vinted garde son motif ; une déconnexion observée sur la page l'efface.
  const b = chargerBackground({ corps: ANONYME, cookies: COOKIES_ANONYMES });
  const jeton = `x.${Buffer.from(JSON.stringify({ sub: '11111111-1111-4111-8111-111111111111', exp: 9e9 })).toString('base64url')}.y`;
  const r1 = await b.ctx.probePlatformSessions(['vinted']);
  await b.ctx.ecrireExtensionSessions(jeton, '11111111-1111-4111-8111-111111111111', r1);
  const r2 = await b.ctx.probePlatformSessions(['leboncoin']);
  await b.ctx.ecrireExtensionSessions(jeton, '11111111-1111-4111-8111-111111111111', r2);
  ok(b.enBase()?.sonde_motif?.vinted === 'pas_connecte', 'une sonde Leboncoin seule garde le motif Vinted (fusion par plateforme)', JSON.stringify(b.enBase()?.sonde_motif));
  await b.ctx.noterSessionDeconnectee(jeton, 'vinted');
  ok(b.enBase()?.vinted === false && !b.enBase()?.sonde_motif?.vinted, 'la page de connexion vue (preuve) remplace le motif de la sonde', JSON.stringify({ v: b.enBase()?.vinted, m: b.enBase()?.sonde_motif }));
}

console.log('\n5. Popup 0.6.187 — une plateforme choisie « inconnue » : « Pas encore connecté à FillSell » + « Me connecter »');
function chargerPopup() {
  const el = () => ({ classList: { add() {}, remove() {}, toggle() {}, contains: () => false }, addEventListener() {}, setAttribute() {}, removeAttribute() {}, style: {}, dataset: {}, innerHTML: '', textContent: '', querySelector: () => null, querySelectorAll: () => [] });
  const elements = new Map();
  const document = { getElementById: (id) => { if (!elements.has(id)) elements.set(id, el()); return elements.get(id); }, body: el(), addEventListener() {}, querySelector: () => null, querySelectorAll: () => [], createElement: () => el(), visibilityState: 'visible' };
  const ctx = {
    console: { log() {}, warn() {}, error() {}, info() {} }, document, window: {}, navigator: { userAgent: 'test' },
    setTimeout, clearTimeout, setInterval, clearInterval, URL, URLSearchParams, Intl, Date, Math, JSON,
    fetch: async () => ({ ok: false, status: 599, json: async () => ({}) }),
    chrome: {
      runtime: { onMessage: rien, sendMessage: async () => ({}), id: 'selftest', getManifest: () => ({ version: '0.0.0' }), getURL: (p) => p },
      storage: { local: { get: async () => ({}), set: async () => {}, remove: async () => {} }, session: { get: async () => ({}), set: async () => {} }, onChanged: rien },
      alarms: { get: async () => null }, permissions: { contains: async () => false, request: async () => false }, tabs: { create: async () => ({}), query: async () => [] },
    },
  };
  ctx.globalThis = ctx; ctx.self = ctx; ctx.window = ctx;
  const contexte = vm.createContext(ctx);
  for (const f of ['config.js', 'etat-job.js', 'vinted-origine.js', 'popup.js']) vm.runInContext(readFileSync(join(DOSSIER, f), 'utf8'), contexte, { filename: f });
  return { contexte, platList: () => document.getElementById('plat-list').innerHTML };
}
{
  let popup = null;
  try { popup = chargerPopup(); } catch (e) { console.log(`  (popup non chargé : ${String(e?.message ?? e).slice(0, 160)})`); }
  if (popup) {
    const lancer = (v, sessions = null) => {
      popup.contexte.__v = v; popup.contexte.__s = sessions;
      vm.runInContext('state.session = { access_token: "x" }; state.verite = __v; state.sessions = __s; state.oplaRelie = false; calculerEtats(); renderPlateformes();', popup.contexte);
      return popup.platList();
    };
    const sondeIlYA = new Date(Date.now() - 6 * 60_000).toISOString();
    const v = { ...FF1F879F, plateformes: { ...FF1F879F.plateformes, vinted: { ...FF1F879F.plateformes.vinted, sonde_le: sondeIlYA } } };
    const html = lancer(v);
    const ligneVinted = html.split('<div class="plat').find((x) => /data-(?:connect|verifier)="vinted"/.test(x)) ?? '';
    ok(/Pas encore connecté à FillSell/.test(ligneVinted) && /Me connecter/.test(ligneVinted), 'ff1f879f : la ligne Vinted dit « Pas encore connecté à FillSell » avec « Me connecter »', ligneVinted.slice(0, 300));
    ok(!/Vérifié il y a/.test(ligneVinted), '… plus jamais « Vérifié il y a N min » sans verdict', ligneVinted.slice(0, 300));
    const htmlBloque = lancer(v, { sonde_motif: { vinted: 'session_vue_bloquee' }, checked_at: sondeIlYA });
    const lb = htmlBloque.split('<div class="plat').find((x) => /="vinted"/.test(x)) ?? '';
    ok(/anti-robot/.test(lb) && !/Pas encore connecté|Connecte-toi/.test(lb), 'ed4531e2 (cookie de connexion) : « anti-robot », jamais « pas connecté »', lb.slice(0, 300));
    const htmlNonChoisie = lancer({ ...v, plateformes: { ...v.plateformes, vinted: { ...v.plateformes.vinted, declaree: false } } });
    const ln = htmlNonChoisie.split('<div class="plat').find((x) => /="vinted"/.test(x)) ?? '';
    ok(/data-verifier="vinted"/.test(ln) && !/Pas encore connecté à FillSell/.test(ln), 'une plateforme PAS choisie garde sa ligne d’avant (« Vérifier »)', ln.slice(0, 200));
  } else { ok(false, 'popup chargé dans le banc', ''); }
}

console.log('\n6. Partout où le vendeur regarde — et le message des synchros en échec ne change pas');
{
  const dash = lire('src/tabs/DashboardTab.jsx');
  ok(/CarteConnexionsChoisies/.test(dash), 'le Tableau monte la carte des connexions choisies', '');
  const bloc = lire('src/stock/BlocSynchro.jsx');
  ok(/useConnexionsChoisies/.test(bloc) && /lignesNonDites/.test(bloc), 'la carte « Synchroniser » du Stock : un point par plateforme choisie pas vue, sans doublon', '');
  ok(/choisie:/.test(bloc) && /connexion:/.test(bloc), 'la carte passe « choisie » et la connexion à etatBoutonSynchro', '');
  const reg = lire('src/reglages/SousPagePlateformes.jsx');
  ok(/useConnexionsChoisies|connexionsChoisies/.test(reg), 'Réglages › Mes plateformes : la même phrase', '');
  const st = lire('src/tabs/StockTab.jsx');
  const debut = st.indexOf("    if (run.status === 'failed') {\n      // ⚠️ Surtout pas humanizeJobError ici");
  const fin = st.indexOf('    // Demande distante close sans exécution (2026-08-05)', debut);
  const empreinte = debut > 0 && fin > debut ? createHash('sha256').update(st.slice(debut, fin)).digest('hex').slice(0, 16) : 'introuvable';
  ok(empreinte === 'be3af1ff940ae20f', 'StockTab : le message des synchros Vinted en échec (texteConnecteToi, 403, anti-robot) est inchangé, octet pour octet', empreinte);
  ok(/T\.signalNonConnecte\(t\.nom\)/.test(bloc) && /\.\.\.tuiles\.filter\(\(t\) => t\.e\.phase === 'absente' && !murDe\.has\(t\.p\)/.test(bloc), 'BlocSynchro : le point « pas connecté » d’un relevé raté est inchangé', '');
  const syn = await importer('src/annonces/synchroniser.js');
  ok(syn?.texteConnecteToi?.('vinted', 'fr') === 'Connecte-toi à Vinted sur ton ordinateur.', 'texteConnecteToi inchangé', syn?.texteConnecteToi?.('vinted', 'fr'));
}

console.log(`\n${rouges ? `✗ ${rouges} RATÉ(S)` : '✓ tout est vert'} — ${verts} vérifications`);
process.exit(rouges ? 1 : 0);
