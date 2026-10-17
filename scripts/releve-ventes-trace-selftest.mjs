// selftest:releve-ventes-trace — LE RELEVÉ DES VENTES VINTED SE DIT (17/10, R2 du point 12)
// et RELIT UNE FOIS LES LOTS D'AVANT LA RÈGLE (point 11).
//
//   node scripts/releve-ventes-trace-selftest.mjs
//
// Ce fichier CHARGE background.js dans un vm (même patron que veille-commandes) et
// rejoue lancerReleveVentes avec une boutique Vinted et une base simulées — les
// fonctions de PAGE (liste, détail) tournent pour de vrai sur un fetch simulé :
//   1. UNE ligne usage_logs 'releve_ventes' par passage et par plateforme (lues,
//      pages, motif, bilan, détail), jamais bloquante ;
//   2. les bilans de TOUS les paquets du détail sont additionnés ;
//   3. les détails ratés sont nommés (refs_echecs : { ref, http }) ;
//   4. « annulée » = failed / canceled / cancelled (prédicat de la veille) : une
//      commande annulée déjà détaillée est relue UNE fois, jamais en boucle ;
//   5. la page des commandes annulées est lue UNE fois, en OBSERVATION : tracée,
//      jamais envoyée ni décidée ;
//   6. un lot « Lot N articles » de moins de 30 jours, déjà détaillé, est relu UNE
//      fois (lots_v1) — et seulement noté si le serveur garde les compositions ;
//      au-delà de 30 jours : jamais ; une ligne '<ref>:<article>' n'est jamais relue ;
//   7. « rien relevé » se trace aussi, sans la lecture d'observation ;
//   8. refsVentesConnues : '<ref>:<article>' = la commande <ref> (Vinted seulement).
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DOSSIER = path.join(RACINE, 'chrome-extension');
let echecs = 0;
const ok = (titre, condition, detail = '') => {
  if (condition) { console.log(`  ✓ ${titre}`); return; }
  echecs += 1;
  console.log(`  ✗ ${titre}${detail ? ` — ${detail}` : ''}`);
};

const memoire = {};
function charger() {
  const rien = { addListener: () => {} };
  const local = {
    get: async (k) => (typeof k === 'string' ? { [k]: memoire[k] } : { ...memoire }),
    set: async (o) => { Object.assign(memoire, JSON.parse(JSON.stringify(o))); },
    remove: async (k) => { delete memoire[k]; },
  };
  const aire = () => ({ get: async () => ({}), set: async () => {}, remove: async () => {} });
  const ctx = {
    console: { log: () => {}, warn: () => {}, error: () => {}, info: () => {}, debug: () => {} },
    setTimeout, clearTimeout, setInterval, clearInterval,
    URL, TextEncoder, TextDecoder, crypto: globalThis.crypto, Blob: globalThis.Blob, FormData: globalThis.FormData,
    atob: (s) => Buffer.from(s, 'base64').toString('binary'), btoa: (s) => Buffer.from(s, 'binary').toString('base64'),
    importScripts: (f) => vm.runInContext(fs.readFileSync(path.join(DOSSIER, f), 'utf8'), contexte, { filename: f }),
    fetch: async () => ({ ok: true, status: 200, json: async () => [], text: async () => '[]' }),
    chrome: {
      runtime: { onMessage: rien, onInstalled: rien, onStartup: rien, onUpdateAvailable: rien, lastError: null, id: 'selftest', getManifest: () => ({ version: '0.0.0' }) },
      alarms: { onAlarm: rien, create: () => {}, getAll: async () => [], get: async () => null, clear: async () => false },
      storage: { local, session: aire(), onChanged: rien },
      tabs: { onRemoved: rien, onUpdated: rien, query: async () => [], create: async () => ({ id: 1 }), remove: async () => {}, sendMessage: () => {}, update: async () => ({ id: 1 }), get: async () => ({ id: 1 }) },
      windows: { onRemoved: rien, create: async () => ({ id: 1, tabs: [{ id: 1 }] }), getAll: async () => [], remove: async () => {}, update: async () => {} },
      scripting: { executeScript: async () => [] }, cookies: { get: async () => null, getAll: async () => [] },
      action: { onClicked: rien, setBadgeText: () => {}, setBadgeBackgroundColor: () => {} },
      power: { requestKeepAwake: () => {}, releaseKeepAwake: () => {} }, notifications: { create: () => {} },
    },
  };
  ctx.globalThis = ctx; ctx.self = ctx;
  const contexte = vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(DOSSIER, 'background.js'), 'utf8'), contexte, { filename: 'background.js' });
  return ctx;
}

const ctx = charger();
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const UID = '00000000-0000-4000-8000-0000000000aa';
const TOKEN = `${b64({ alg: 'HS256' })}.${b64({ sub: UID })}.sig`;
const ilYa = (j) => new Date(Date.now() - j * 86_400_000).toISOString();

// ── Monde simulé ────────────────────────────────────────────────────────────
const monde = {
  liste: [], listeHttp: 200, annulees: [{ transaction_id: 'X9', transaction_user_status: 'cancelled' }],
  details: {}, connues: [], arriere: [], serveurCompose: true, traceEnPanne: false,
  traces: [], envois: [], lecturesAnnulees: 0, lecturesDetail: [],
};
// Les fonctions de PAGE tournent pour de vrai : leur fetch est celui du monde.
ctx.setTimeout = (f, _ms, ...a) => { Promise.resolve().then(() => f(...a)); return 0; };
ctx.executerDansOngletPlateforme = async (_platform, func, args) => func(...args);
ctx.getValidSession = async () => ({ access_token: TOKEN });
ctx.syncMultiOuverte = async () => true;
const reponse = (status, corps) => ({ ok: status < 300, status, json: async () => corps, text: async () => JSON.stringify(corps) });
ctx.fetch = async (url, init = {}) => {
  const u = String(url);
  if (u.includes('/rest/v1/rpc/enregistrer_ventes_relevees')) {
    const rows = JSON.parse(init.body).p_rows;
    monde.envois.push(rows);
    const annulees = rows.filter((r) => ['failed', 'canceled', 'cancelled'].includes(String(r.statut))).length;
    const bilan = { creees: rows.length, deja_connues: 1, annulees, statuts_inconnus: { in_progress: 1 }, lots: rows.filter((r) => r.lot).length };
    if (monde.serveurCompose) bilan.compositions = rows.filter((r) => Array.isArray(r.item_ids)).length;
    return reponse(200, bilan);
  }
  if (u.includes('/api/v2/my_orders?type=sold&status=cancelled')) {
    monde.lecturesAnnulees++;
    return reponse(200, { my_orders: monde.annulees });
  }
  if (u.includes('/api/v2/my_orders?type=sold&page=')) {
    if (monde.listeHttp !== 200) return { ok: false, status: monde.listeHttp, json: async () => ({}), text: async () => '<html>' };
    return reponse(200, { my_orders: monde.liste, pagination: { total_entries: monde.liste.length } });
  }
  const m = u.match(/\/api\/v2\/transactions\/([^?]+)/);
  if (m) {
    const ref = decodeURIComponent(m[1]);
    monde.lecturesDetail.push(ref);
    const d = monde.details[ref];
    if (!d || d.http) return { ok: false, status: d?.http ?? 404, json: async () => ({}), text: async () => '' };
    return reponse(200, { transaction: { item_id: d.ids.length === 1 ? d.ids[0] : null, order: { item_ids: d.ids },
      offer: { price: { amount: String(d.prix ?? 1), currency_code: 'EUR' } }, debit_processed_at: ilYa(1) } });
  }
  return reponse(200, []);
};
ctx.restRequest = async (chemin, _tok, init = {}) => {
  if (chemin.startsWith('usage_logs')) {
    if (monde.traceEnPanne) throw new Error('REST usage_logs → HTTP 500');
    monde.traces.push(...JSON.parse(init.body));
    return null;
  }
  if (chemin.includes('select=commande_ref,titre,vendu_le')) return monde.arriere;
  if (chemin.includes('select=commande_ref&order=id.desc')) return chemin.includes('offset=0') ? monde.connues : [];
  return [];
};
const etat = () => memoire.ventes_releve_etat ?? {};
const commande = (ref, statut = 'completed') => ({ transaction_id: ref, title: `Commande ${ref}`, price: { amount: '2', currency_code: 'EUR' }, date: ilYa(1), transaction_user_status: statut });
const tracesVentes = () => monde.traces.filter((t) => t.feature === 'releve_ventes');
const raz = () => { monde.traces = []; monde.envois = []; monde.lecturesAnnulees = 0; monde.lecturesDetail = []; };

console.log('\n── RELEVÉ DES VENTES VINTED : TRACE ET LOTS ───────────────────────────');

console.log('\n1. Un passage : douze commandes à détailler (deux paquets), une annulée relue, un lot relu');
monde.liste = [commande('A'), commande('B'), commande('C', 'cancelled'), commande('D', 'failed'),
  ...['N1', 'N2', 'N3', 'N4', 'N5', 'N6', 'N7', 'N8'].map((r) => commande(r))];
monde.connues = [{ commande_ref: 'B' }, { commande_ref: 'L1:111' }];
monde.arriere = [
  { commande_ref: 'L1', titre: 'Lot 3 articles', vendu_le: ilYa(2) },
  { commande_ref: 'O1', titre: 'Lot 2 articles', vendu_le: ilYa(40) },
  { commande_ref: 'L1:111', titre: 'Article', vendu_le: ilYa(2) },
];
monde.details = { A: { http: 500 }, B: { ids: ['200'] }, C: { ids: ['300'] }, D: { ids: ['401', '402'] }, L1: { ids: ['111', '112', '113'], prix: 5.1 },
  ...Object.fromEntries(['N1', 'N2', 'N3', 'N4', 'N5', 'N6', 'N7', 'N8'].map((r, i) => [r, { ids: [`5${i}`] }])) };
memoire.ventes_releve_etat = { vinted: { detailles_v2: ['B', 'C', 'L1', 'O1'], annulees_v1: [], lots_v1: [] } };
raz();
const r1 = await ctx.lancerReleveVentes({ platform: 'vinted', declencheur: 'bouton' });
const t1 = tracesVentes();
ok('le passage réussit', r1?.ok === true, JSON.stringify(r1).slice(0, 200));
ok('UNE ligne usage_logs « releve_ventes » pour ce passage', t1.length === 1, `${t1.length}`);
const m1 = t1[0]?.metadata ?? {};
ok('la ligne dit plateforme, déclencheur, build, lues, pages, motif', m1.plateforme === 'vinted' && m1.declencheur === 'bouton'
  && typeof m1.build === 'string' && m1.lues === 12 && m1.pages === 1 && m1.motif === null, JSON.stringify(m1).slice(0, 300));
ok('deux paquets de détail (8 + 4) : chaque bilan compte', monde.envois.length === 3 && m1.bilan?.creees === 12 + 8 + 3,
  `envois ${monde.envois.length} ; créées ${m1.bilan?.creees}`);
ok('le bilan additionné garde déjà / annulées / statuts inconnus', m1.bilan?.deja === 3 && m1.bilan?.annulees === 2 + 2
  && m1.bilan?.statuts_inconnus?.in_progress === 3, JSON.stringify(m1.bilan));
ok('le détail raté est nommé : { ref, http }', JSON.stringify(m1.detail?.refs_echecs) === JSON.stringify([{ ref: 'A', http: 500 }]) && m1.detail?.echecs === 1,
  JSON.stringify(m1.detail?.refs_echecs));
ok('l\'annulée (« cancelled ») déjà détaillée est relue, et elle seule', JSON.stringify(m1.detail?.annulees_relues) === '["C"]',
  JSON.stringify(m1.detail?.annulees_relues));
ok('le lot de moins de 30 jours est relu, pas celui de 40 jours, jamais une ligne d\'article',
  JSON.stringify(m1.detail?.lots_relus) === '["L1"]' && !monde.lecturesDetail.includes('O1') && !monde.lecturesDetail.includes('L1:111'),
  `${JSON.stringify(m1.detail?.lots_relus)} ; lus ${monde.lecturesDetail.join(',')}`);
ok('la page des commandes annulées : lue UNE fois, tracée', monde.lecturesAnnulees === 1
  && JSON.stringify(m1.annulees_observees) === JSON.stringify([{ ref: 'X9', statut: 'cancelled' }]), `${monde.lecturesAnnulees}`);
ok('… et jamais envoyée ni décidée (observation seule)', !monde.envois.flat().some((r) => r.ref === 'X9'));
ok('le lot relu part avec ses numéros (item_ids), la commande à un article aussi', monde.envois.flat().some((r) => r.ref === 'L1' && r.lot === true
  && JSON.stringify(r.item_ids) === '["111","112","113"]') && monde.envois.flat().some((r) => r.ref === 'N1' && JSON.stringify(r.item_ids) === '["50"]' && r.listing_id === '50'));
const e1 = etat().vinted ?? {};
ok('mémoires : l\'annulée et le lot sont notés relus (le serveur garde la composition)', e1.annulees_v1?.includes('C') && e1.annulees_v1?.includes('D')
  && JSON.stringify(e1.lots_v1) === '["L1"]', JSON.stringify({ a: e1.annulees_v1, l: e1.lots_v1 }));

console.log('\n2. Le passage suivant : jamais en boucle');
raz();
await ctx.lancerReleveVentes({ platform: 'vinted', declencheur: 'bouton' });
const m2 = tracesVentes()[0]?.metadata ?? {};
ok('ni l\'annulée ni le lot ne sont relus', JSON.stringify(m2.detail?.annulees_relues) === '[]' && JSON.stringify(m2.detail?.lots_relus) === '[]'
  && !monde.lecturesDetail.includes('C') && !monde.lecturesDetail.includes('L1'), monde.lecturesDetail.join(','));

console.log('\n3. Un serveur d\'avant la règle (aucune composition gardée) : le lot sera relu');
monde.serveurCompose = false;
monde.arriere = [{ commande_ref: 'L2', titre: 'Lot 2 articles', vendu_le: ilYa(3) }];
monde.details.L2 = { ids: ['221', '222'] };
memoire.ventes_releve_etat.vinted.detailles_v2 = [...(memoire.ventes_releve_etat.vinted.detailles_v2 ?? []), 'L2'];
raz();
await ctx.lancerReleveVentes({ platform: 'vinted', declencheur: 'bouton' });
ok('relu, mais pas noté', monde.lecturesDetail.includes('L2') && !(etat().vinted?.lots_v1 ?? []).includes('L2'));
raz();
await ctx.lancerReleveVentes({ platform: 'vinted', declencheur: 'bouton' });
ok('donc relu au passage suivant (jamais perdu)', monde.lecturesDetail.includes('L2'));
monde.serveurCompose = true;

console.log('\n4. Jamais bloquante');
monde.traceEnPanne = true;
raz();
const r4 = await ctx.lancerReleveVentes({ platform: 'vinted', declencheur: 'bouton' });
ok('la trace en panne ne coûte rien au relevé', r4?.ok === true);
monde.traceEnPanne = false;

console.log('\n5. Rien relevé (anti-robot) : tracé aussi, sans lecture d\'observation');
monde.listeHttp = 403;
raz();
const r5 = await ctx.lancerReleveVentes({ platform: 'vinted', declencheur: 'bouton' });
const m5 = tracesVentes()[0]?.metadata ?? {};
ok('« rien relevé » : une ligne, motif http_403, rien lu', r5?.ok === false && tracesVentes().length === 1 && m5.motif === 'http_403' && m5.lues === 0,
  JSON.stringify(m5).slice(0, 200));
ok('aucune lecture des annulées après un refus', monde.lecturesAnnulees === 0);
monde.listeHttp = 200;

console.log('\n6. Les commandes connues : \'<ref>:<article>\' = la commande <ref>');
monde.connues = [{ commande_ref: '123:456' }, { commande_ref: '789' }];
const vinted = await ctx.refsVentesConnues(TOKEN, UID, 'vinted');
const lbc = await ctx.refsVentesConnues(TOKEN, UID, 'leboncoin');
ok('Vinted : 123 et 789 connues', vinted.has('123') && vinted.has('789') && !vinted.has('123:456'));
ok('les autres plateformes : la référence telle quelle', lbc.has('123:456'));

if (echecs) { console.log(`\n✗ ${echecs} échec(s)`); process.exit(1); }
console.log('\n✓ relevé des ventes : une trace par passage, bilans cumulés, annulées et lots relus une fois, observation sans décision');
