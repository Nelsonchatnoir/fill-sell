// selftest:lbc-session-partagee-rythme — UNE SESSION LEBONCOIN PARTAGÉE SE LIT COMME CELLE D'UN COMPTE (05/11 soir,
// décision de Nico ; extension 0.6.175). Cas d'origine : Louis, deux comptes FillSell (compte faf5021a exécutant
// faf5021a…, compte 447d920c propriétaire 447d920c…) sur UN compte Leboncoin, par la délégation ; ≈ 190 pages
// d'annonce lues par heure jour et nuit, « Mes annonces » lu deux fois en 30 s, comptes restreints (403).
//
//   npm run selftest:lbc-session-partagee-rythme
//
// Ce fichier CHARGE chrome-extension/background.js dans un vm (même patron que releve-ventes-trace) avec une horloge
// simulée, et EXÉCUTE le vrai code :
//   A. la nuit, heure de Paris (23:00–07:00, hiver et été) ;
//   B. règles 2 et 3 : 24 h simulées de checkPublishedListings (le compte du navigateur + le compte délégué), AVANT
//      (session d'un seul compte : le code d'avant, à l'identique) et APRÈS (session partagée) — volume par heure,
//      aucune page la nuit, budget de 60/h tenu, aucun compte affamé, Vinted intact, relecture désignée par la veille
//      toujours faite ;
//   C. règle 1 : « Mes annonces » — une lecture sert les deux comptes, geste / pause / fenêtre la périment, une lecture
//      ratée n'est pas refaite pour l'autre, relevé quotidien jamais la nuit, compte seul inchangé ;
//   D. règle 1 : la liste des ventes — lue une fois (refs connues des DEUX comptes), reprise par l'autre, jamais la nuit ;
//   E. règle 1 : le cycle délégué entier — relevés quotidiens alignés (une lecture pour les deux, quel que soit le compte
//      qui mène) ;
//   F. ce qui ne bouge pas : veille des transactions, gestes, cadence.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DOSSIER = path.join(RACINE, 'chrome-extension');
const BG = fs.readFileSync(path.join(DOSSIER, 'background.js'), 'utf8').replace(/\r\n/g, '\n');
let echecs = 0, total = 0;
const ok = (titre, condition, detail = '') => {
  total++;
  if (condition) { console.log(`  ✓ ${titre}${detail ? ` — ${detail}` : ''}`); return; }
  echecs++;
  console.log(`  ✗ ${titre}${detail ? ` — ${detail}` : ''}`);
};

// ── Horloge simulée ─────────────────────────────────────────────────────────
const horloge = { t: Date.parse('2026-11-05T23:00:00Z') };   // 06/11 00:00 à Paris (heure d'hiver, UTC+1)
class DateSimulee extends Date {
  constructor(...a) { if (a.length) super(...a); else super(horloge.t); }
  static now() { return horloge.t; }
}
const FORMAT_H = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: 'numeric', hourCycle: 'h23' });
const parisH = (ms) => Number(FORMAT_H.formatToParts(new Date(ms)).find((p) => p.type === 'hour').value);

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const A = 'faf5021a-479a-4bb3-b3ec-c296770739b7';   // exécutant (le compte de l'extension)
const B = '447d920c-976a-4d8f-aff4-a2998050358c';   // propriétaire (compte délégué)
const jeton = (sub) => `${b64({ alg: 'HS256' })}.${b64({ sub, exp: 4102444800 })}.sig`;
const SA = { access_token: jeton(A) }, SB = { access_token: jeton(B) };
const subDe = (tok) => JSON.parse(Buffer.from(String(tok).split('.')[1], 'base64url').toString()).sub;

function charger() {
  const memoire = {};
  const rien = { addListener: () => {} };
  const local = {
    get: async (k) => (typeof k === 'string' ? { [k]: memoire[k] } : Array.isArray(k) ? Object.fromEntries(k.map((x) => [x, memoire[x]])) : { ...memoire }),
    set: async (o) => { Object.assign(memoire, JSON.parse(JSON.stringify(o))); },
    remove: async (k) => { for (const x of [].concat(k)) delete memoire[x]; },
  };
  const aire = () => ({ get: async () => ({}), set: async () => {}, remove: async () => {} });
  const ctx = {
    console: { log: () => {}, warn: () => {}, error: () => {}, info: () => {}, debug: () => {} },
    Date: DateSimulee,
    setTimeout: () => 0, clearTimeout: () => {}, setInterval: () => 0, clearInterval: () => {},
    URL, URLSearchParams, TextEncoder, TextDecoder, crypto: globalThis.crypto, Blob: globalThis.Blob, FormData: globalThis.FormData,
    atob: (s) => Buffer.from(s, 'base64').toString('binary'), btoa: (s) => Buffer.from(s, 'binary').toString('base64'),
    importScripts: (f) => vm.runInContext(fs.readFileSync(path.join(DOSSIER, f), 'utf8'), contexte, { filename: f }),
    fetch: async () => ({ ok: true, status: 200, json: async () => [], text: async () => '[]' }),
    chrome: {
      runtime: { onMessage: rien, onInstalled: rien, onStartup: rien, onUpdateAvailable: rien, lastError: null, id: 'selftest',
        getManifest: () => ({ version: '0.6.175' }), getPlatformInfo: async () => ({}) },
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
  ctx.__memoire = memoire;
  // Ce que le cycle ne doit jamais toucher ici.
  ctx.sleep = async () => {};
  ctx.oplaSortieActive = async () => true;
  ctx.getValidSession = async () => SA;
  ctx.syncMultiOuverte = async () => true;
  return ctx;
}

// ── Une base simulée (RLS : chaque jeton ne voit que son compte) ────────────
function base() {
  return { jobs: [], runs: [], lignes: [], relevesLbc: 0, lecturesVentes: [], envoisVentes: [], connues: { [A]: ['V-A1', 'V-A2'], [B]: ['V-B1'] },
    pages: [], suivant: 1 };
}
function filtrerJobs(monde, chemin, sub) {
  const q = new URLSearchParams(chemin.split('?')[1] ?? '');
  let rows = monde.jobs.filter((j) => j.user_id === sub && j.status === 'published' && j.listing_url);
  if (q.get('user_id')) rows = rows.filter((j) => q.get('user_id') === `eq.${j.user_id}`);
  const ids = /^in\.\((.*)\)$/.exec(q.get('id') ?? '');
  if (ids) { const set = new Set(ids[1].split(',')); rows = rows.filter((j) => set.has(j.id)); }
  for (const p of q.getAll('platform')) {
    const [op, v] = [p.slice(0, p.indexOf('.')), p.slice(p.indexOf('.') + 1)];
    rows = rows.filter((j) => (op === 'eq' ? j.platform === v : op === 'neq' ? j.platform !== v : true));
  }
  if (String(q.get('order') ?? '').startsWith('last_checked_at.asc')) {
    const t = (j) => (j.last_checked_at ? Date.parse(j.last_checked_at) : -Infinity);
    rows = [...rows].sort((a, b) => t(a) - t(b));
  }
  const lim = Number(q.get('limit'));
  if (lim) rows = rows.slice(0, lim);
  return rows.map((j) => ({ ...j, platform_fields: { ...(j.platform_fields ?? {}) } }));
}
function brancherBase(ctx, monde) {
  ctx.restRequest = async (chemin, tok, init = {}) => {
    const sub = subDe(tok);
    const methode = init.method ?? 'GET';
    if (chemin.startsWith('cross_post_jobs?id=eq.') && methode === 'PATCH') {
      const id = chemin.slice('cross_post_jobs?id=eq.'.length);
      const j = monde.jobs.find((x) => x.id === id && x.user_id === sub);
      if (j) Object.assign(j, JSON.parse(init.body));
      return null;
    }
    if (chemin.startsWith('cross_post_jobs?') && chemin.includes('select=id&limit=1') && chemin.includes('user_id=eq.')) return [{ id: 'x' }];
    if (chemin.startsWith('cross_post_jobs')) return filtrerJobs(monde, chemin, sub);
    if (chemin.startsWith('profiles?')) return [{ platform_settings: {} }];
    if (chemin === 'vinted_sync_runs' && methode === 'POST') {
      const corps = JSON.parse(init.body);
      const run = { id: `run-${monde.suivant++}`, ...corps, user_id: sub };
      monde.runs.push(run);
      return [run];
    }
    if (chemin.startsWith('vinted_sync_runs?id=eq.') && chemin.includes('status=eq.queued') && methode === 'PATCH') {
      const id = chemin.match(/id=eq\.([^&]+)/)[1];
      const run = monde.runs.find((r) => r.id === id && r.user_id === sub && r.status === 'queued');
      if (!run) return [];
      Object.assign(run, JSON.parse(init.body));
      return [run];
    }
    if (chemin.startsWith('vinted_sync_runs?id=eq.') && methode === 'PATCH') {
      const id = chemin.match(/id=eq\.([^&]+)/)[1];
      const run = monde.runs.find((r) => r.id === id);
      if (run) Object.assign(run, JSON.parse(init.body));
      return null;
    }
    if (chemin.startsWith('vinted_sync_runs?user_id=eq.')) {
      const fin = monde.runs.filter((r) => r.user_id === sub && ['done', 'incomplete'].includes(r.status) && r.finished_at)
        .sort((a, b) => Date.parse(b.finished_at) - Date.parse(a.finished_at));
      return fin.slice(0, 1).map((r) => ({ finished_at: r.finished_at }));
    }
    if (chemin.startsWith('annonces_plateforme?on_conflict')) { monde.lignes.push(...JSON.parse(init.body)); return null; }
    if (chemin.startsWith('annonces_plateforme?select=')) return [];
    if (chemin.startsWith('ventes?') && chemin.includes('annonce_id=is.null')) return [];
    if (chemin.startsWith('ventes?')) return chemin.includes('offset=0') ? (monde.connues[sub] ?? []).map((r) => ({ commande_ref: r })) : [];
    return methode === 'GET' ? [] : null;
  };
  ctx.fetch = async (url, init = {}) => {
    const u = String(url);
    const tok = String(init.headers?.Authorization ?? '').replace('Bearer ', '');
    if (u.includes('/rpc/rapprocher_releve')) return { ok: true, status: 200, json: async () => ({ ok: true, restantes: 0, par_job: 0, auto: 0 }) };
    if (u.includes('/rpc/enregistrer_ventes_relevees')) {
      monde.envoisVentes.push({ compte: subDe(tok), rows: JSON.parse(init.body).p_rows });
      return { ok: true, status: 200, json: async () => ({ creees: 0, deja_connues: 0 }) };
    }
    return { ok: true, status: 200, json: async () => [], text: async () => '[]' };
  };
  ctx.releverAnnoncesPlateforme = async (platform) => {
    monde.relevesLbc++;
    if (monde.releveRate) return { annonces: [], complet: false, erreur: 'relevé par l\'adresse interrompu (jeton_absent)' };
    if (monde.releveCasse) throw new Error('onglet figé');
    return { annonces: [{ listing_id: '3000000001', url: 'https://www.leboncoin.fr/ad/vetements/3000000001', titre: 'Pull', prix: 12, statut: 'en_ligne' }],
      complet: true, erreur: null, annonce: 1 };
  };
  ctx.capturerAnnonces = async () => ({ capturees: 0, echecs: 0, restantes: 0 });
  ctx.lireVentesLeboncoin = async (connues) => {
    monde.lecturesVentes.push([...connues].sort());
    return { ok: true, rows: [{ ref: 'V-NEUVE', titre: 'Pull', prix: 12, statut: 'done', lot: false }], pages: 1, motif: null };
  };
  ctx.lireDetailsVentesLeboncoin = async () => ({ ok: true, numeros: {}, echecs: [] });
  ctx.sessionDuCompte = async (c) => (c === A ? SA : c === B ? SB : null);
}

// ════════════════════════════════════════════════════════════════════════════
console.log('\nA. La nuit, heure de Paris (aucune définition dans l\'extension avant : 23:00–07:00)');
{
  const ctx = charger();
  const cas = [
    ['2026-11-05T21:59:00Z', false, '05/11 22:59 Paris (hiver)'], ['2026-11-05T22:00:00Z', true, '05/11 23:00'],
    ['2026-11-06T05:59:00Z', true, '06/11 06:59'], ['2026-11-06T06:00:00Z', false, '06/11 07:00'],
    ['2026-07-01T04:30:00Z', true, '01/07 06:30 Paris (été, UTC+2)'], ['2026-07-01T05:00:00Z', false, '01/07 07:00 Paris (été)'],
  ];
  for (const [iso, nuit, dit] of cas) ok(`${dit} → ${nuit ? 'nuit' : 'jour'}`, ctx.estNuitParis(Date.parse(iso)) === nuit);
  const man = JSON.parse(fs.readFileSync(path.join(DOSSIER, 'manifest.json'), 'utf8'));
  const [ma, mi, pa] = man.version.split('.').map(Number);
  ok(`manifest en 0.6.175 ou plus (${man.version})`, ma > 0 || mi > 6 || (mi === 6 && pa >= 175));
  ok('intervalle d\'une annonce : 2 h pour une petite session, annonces ÷ 60/h au-delà (387 → 6 h 27)',
    ctx.intervalleLectureLbcPartagee(40) === 2 * 3600_000 && ctx.intervalleLectureLbcPartagee(387) === Math.ceil(387 / 60 * 3600_000),
    `${(ctx.intervalleLectureLbcPartagee(387) / 3600_000).toFixed(2)} h`);
  const pA = ctx.partBudgetLbc(277, 387, 2), pB = ctx.partBudgetLbc(110, 387, 2);
  ok('part du budget au prorata des annonces : 277 → 42,9/h, 110 → 17,1/h (somme 60/h), rafales 6 + 2 = 8',
    Math.abs(pA.parHeure + pB.parHeure - 60) < 1e-9 && pA.rafale === 6 && pB.rafale === 2, `${pA.parHeure.toFixed(1)} + ${pB.parHeure.toFixed(1)}`);
  const s0 = ctx.remplirJetonsLbcPartage(null, 0, { parHeure: 60, rafale: 8 });
  const s1 = ctx.remplirJetonsLbcPartage({ jetons: 0, le: 0 }, 30 * 60_000, { parHeure: 60, rafale: 8 });
  const s2 = ctx.remplirJetonsLbcPartage({ jetons: 0, le: 0 }, 5 * 3600_000, { parHeure: 60, rafale: 8 });
  ok('seau : plein au départ (8), 30 jetons après 30 min plafonnés à 8, jamais plus que la rafale', s0.jetons === 8 && s1.jetons === 8 && s2.jetons === 8);
  ok('seau : 2 min → 2 lectures', Math.abs(ctx.remplirJetonsLbcPartage({ jetons: 0, le: 0 }, 120_000, { parHeure: 60, rafale: 8 }).jetons - 2) < 1e-9);
}

// ════════════════════════════════════════════════════════════════════════════
// B. 24 h de checkPublishedListings chez Louis : AVANT (code d'avant : session non partagée) et APRÈS.
function alea(graine) { let x = graine; return () => ((x = (x * 1103515245 + 12345) % 2147483648) / 2147483648); }
// Des identifiants de tâche au format UUID (la relecture prioritaire n'accepte que ceux-là).
const idJob = (user, platform, i) => `${user.slice(0, 8)}-0000-4000-8${platform === 'leboncoin' ? '001' : '002'}-${String(i).padStart(12, '0')}`;
function simuler24h({ partagee, prioriteA = null }) {
  const ctx = charger();
  const monde = base();
  brancherBase(ctx, monde);
  const r = alea(42);
  const debut = Date.parse('2026-11-05T23:00:00Z');   // 06/11 00:00 Paris
  const ajout = (user, platform, n, prefixe) => {
    for (let i = 0; i < n; i++) {
      const num = `${prefixe}${String(i).padStart(4, '0')}`;
      monde.jobs.push({ id: idJob(user, platform, i), user_id: user, platform, action: 'publish', status: 'published',
        listing_url: platform === 'leboncoin' ? `https://www.leboncoin.fr/ad/vetements/${num}` : `https://www.vinted.fr/items/${num}`,
        last_checked_at: new Date(debut - Math.round(r() * 2 * 3600_000)).toISOString(),
        published_at: new Date(debut - 30 * 86_400_000).toISOString(), created_at: new Date(debut - 30 * 86_400_000).toISOString(), platform_fields: {} });
    }
  };
  ajout(A, 'leboncoin', 277, '31'); ajout(B, 'leboncoin', 110, '32'); ajout(A, 'vinted', 40, '77');
  const lectures = [];
  ctx.checkListingState = async (url, platform) => {
    const j = monde.jobs.find((x) => x.listing_url === url);
    lectures.push({ t: horloge.t, h: parisH(horloge.t), platform, compte: j?.user_id, id: j?.id });
    return { state: 'active', price: null };
  };
  return (async () => {
    if (partagee) ctx.noterDelegationsServies([{ compte: B, plateformes: ['leboncoin'] }]);
    for (let c = 0; c < 720; c++) {
      horloge.t = debut + c * 120_000;
      if (prioriteA && horloge.t === prioriteA.le) {
        ctx.__memoire.verif_prioritaire = { [prioriteA.id]: { motif: 'commande_leboncoin', le: new Date(horloge.t).toISOString(), jusqu: horloge.t + 3600_000 } };
      }
      await ctx.checkPublishedListings(SA);                                // le cycle du compte de l'extension
      await ctx.checkPublishedListings(SB, { plateforme: 'leboncoin' });   // le cycle délégué
    }
    return { lectures, monde };
  })();
}

console.log('\nB. Règles 2 et 3 — 24 h simulées chez Compte-essai-2 (277 + 110 annonces Leboncoin, 40 Vinted), polls de 2 min');
{
  const avant = await simuler24h({ partagee: false });
  const apres = await simuler24h({ partagee: true, prioriteA: { le: Date.parse('2026-11-06T01:00:00Z'), id: idJob(A, 'leboncoin', 7) } });
  const parHeure = (lst, pf) => { const h = Array(24).fill(0); for (const l of lst) if (l.platform === pf) h[l.h]++; return h; };
  const hAv = parHeure(avant.lectures, 'leboncoin'), hAp = parHeure(apres.lectures, 'leboncoin');
  console.log('    heure (Paris) | pages Leboncoin AVANT | APRÈS');
  for (let h = 0; h < 24; h++) console.log(`    ${String(h).padStart(2, '0')}:00         | ${String(hAv[h]).padStart(5)}               | ${String(hAp[h]).padStart(5)}`);
  const totAv = hAv.reduce((s, x) => s + x, 0), totAp = hAp.reduce((s, x) => s + x, 0);
  console.log(`    total 24 h    | ${totAv} (≈ ${Math.round(totAv / 24)}/h)       | ${totAp} (≈ ${Math.round(totAp / 16)}/h de 07:00 à 23:00)`);
  ok('AVANT (code d\'avant, session non partagée) : ≈ 190 pages Leboncoin par heure, nuit comprise — le constat du 05/11',
    totAv / 24 > 170 && totAv / 24 < 200 && hAv[3] > 150, `${(totAv / 24).toFixed(0)}/h, ${hAv[3]} à 03:00`);
  const nuitAp = apres.lectures.filter((l) => l.platform === 'leboncoin' && (l.h >= 23 || l.h < 7));
  ok('APRÈS : aucune page Leboncoin de routine la nuit (23:00–07:00 Paris) — seule la relecture désignée par la veille des transactions à 02:00',
    nuitAp.length === 1 && nuitAp[0].id === idJob(A, 'leboncoin', 7), `${nuitAp.length} lecture(s) de nuit`);
  ok('APRÈS : jamais plus de 60 pages Leboncoin dans une heure (+ la rafale de 8 au réveil)', Math.max(...hAp) <= 68, `max ${Math.max(...hAp)}/h`);
  ok('APRÈS : ≈ 60 pages par heure de 07:00 à 23:00, ≤ 968 sur la journée', totAp <= 16 * 60 + 8 + 1 && hAp.slice(8, 23).every((x) => x >= 55 && x <= 62),
    `${totAp} sur 24 h, de ${Math.min(...hAp.slice(8, 23))} à ${Math.max(...hAp.slice(8, 23))}/h`);
  ok(`APRÈS : ${Math.round((1 - totAp / totAv) * 100)} % de pages Leboncoin en moins sur 24 h`, totAp < totAv * 0.25);
  const parAnnonce = (lst, compte) => { const m = new Map(); for (const l of lst) if (l.platform === 'leboncoin' && l.compte === compte) m.set(l.id, (m.get(l.id) ?? 0) + 1); return m; };
  const mA = parAnnonce(apres.lectures, A), mB = parAnnonce(apres.lectures, B);
  const moyA = [...mA.values()].reduce((s, x) => s + x, 0) / 277, moyB = [...mB.values()].reduce((s, x) => s + x, 0) / 110;
  ok('APRÈS : aucun compte affamé — chaque annonce des deux comptes relue dans la journée, au même rythme',
    mA.size === 277 && mB.size === 110 && Math.abs(moyA - moyB) / Math.max(moyA, moyB) < 0.2, `exécutant ${moyA.toFixed(2)}, délégué ${moyB.toFixed(2)} lecture(s) par annonce`);
  const ecarts = [];
  for (const id of mA.keys()) {
    const t = apres.lectures.filter((l) => l.id === id && l.h >= 7 && l.h < 23).map((l) => l.t).sort((a, b) => a - b);
    for (let i = 1; i < t.length; i++) ecarts.push(t[i] - t[i - 1]);
  }
  ok('APRÈS : de jour, une même annonce n\'est jamais relue avant 6 h 27 (387 ÷ 60/h)', ecarts.every((e) => e >= Math.ceil(387 / 60 * 3600_000) - 1),
    `écart minimal ${(Math.min(...ecarts) / 3600_000).toFixed(2)} h`);
  const vAv = avant.lectures.filter((l) => l.platform === 'vinted').length, vAp = apres.lectures.filter((l) => l.platform === 'vinted').length;
  ok('Vinted (même cycle, même compte) : inchangé, nuit comprise — les annonces Leboncoin ne lui prennent plus de place',
    vAp >= vAv * 0.95 && vAp <= vAv * 1.05, `${vAv} → ${vAp} pages en 24 h`);
  const comptes = apres.monde.jobs.filter((j) => j.platform === 'leboncoin' && j.last_checked_at && Date.parse(j.last_checked_at) > Date.parse('2026-11-06T06:00:00Z'));
  ok('APRÈS : les annonces lues sont tamponnées (last_checked_at), les autres attendent sans rien écrire', comptes.length > 0 && comptes.length <= 387);
}

// ════════════════════════════════════════════════════════════════════════════
console.log('\nC. Règle 1 — « Mes annonces » : une lecture pour les deux comptes');
{
  const ctx = charger();
  const monde = base();
  brancherBase(ctx, monde);
  ctx.noterDelegationsServies([{ compte: B, plateformes: ['leboncoin'] }]);
  horloge.t = Date.parse('2026-11-06T09:00:00Z');   // 10:00 Paris
  const ilYa = (h) => new Date(horloge.t - h * 3600_000).toISOString();
  monde.runs.push({ id: 'ancien-A', user_id: A, platform: 'leboncoin', status: 'done', finished_at: ilYa(25) },
    { id: 'ancien-B', user_id: B, platform: 'leboncoin', status: 'done', finished_at: ilYa(25) });
  const rA = await ctx.lancerRelevePlateforme({ platform: 'leboncoin', declencheur: 'cron' });
  ok('relevé quotidien du compte de l\'extension : UNE lecture de Leboncoin', rA?.ok === true && monde.relevesLbc === 1);
  horloge.t += 30_000;
  const rB = await ctx.lancerRelevePlateforme({ platform: 'leboncoin', declencheur: 'cron', session: SB });
  const runB = monde.runs.find((r) => r.user_id === B && r.declencheur === 'cron');
  ok('30 s plus tard, le relevé quotidien du compte délégué REPREND cette lecture : aucune requête à Leboncoin',
    rB?.ok === true && monde.relevesLbc === 1 && runB?.status === 'done');
  ok('… et chaque compte garde SON relevé : run et lignes au nom du compte du jeton', monde.lignes.some((l) => l.user_id === A) && monde.lignes.some((l) => l.user_id === B) && runB?.user_id === B);
  monde.runs.push({ id: 'servi-B', user_id: B, platform: 'leboncoin', status: 'queued', declencheur: 'bouton' });
  const rS = await ctx.lancerRelevePlateforme({ platform: 'leboncoin', declencheur: 'bouton_distant', runId: 'servi-B', session: SB });
  ok('un relevé servi (bouton) du délégué dans la fenêtre : repris aussi, sans lecture', rS?.ok === true && monde.relevesLbc === 1);
  ctx.noterGesteLbc();   // une tâche Leboncoin (retrait, publication) vient de passer
  horloge.t += 1000;
  monde.runs.push({ id: 'servi-B2', user_id: B, platform: 'leboncoin', status: 'queued', declencheur: 'serveur' });
  await ctx.lancerRelevePlateforme({ platform: 'leboncoin', declencheur: 'bouton_distant', runId: 'servi-B2', session: SB });
  ok('après un geste Leboncoin, une lecture d\'avant ne sert plus : le relevé suivant relit', monde.relevesLbc === 2);
  // Lecture ratée : pas refaite pour l'autre compte dans la fenêtre.
  horloge.t += 16 * 60_000;
  monde.releveRate = true;
  await ctx.lancerRelevePlateforme({ platform: 'leboncoin', declencheur: 'veilleur' });
  monde.releveRate = false;
  const nRuns = monde.runs.length;
  horloge.t += 20_000;
  const rV = await ctx.lancerRelevePlateforme({ platform: 'leboncoin', declencheur: 'veilleur', session: SB });
  monde.runs.push({ id: 'servi-B3', user_id: B, platform: 'leboncoin', status: 'queued', declencheur: 'bouton' });
  const rS3 = await ctx.lancerRelevePlateforme({ platform: 'leboncoin', declencheur: 'bouton_distant', runId: 'servi-B3', session: SB });
  ok('une lecture ratée n\'est pas refaite pour l\'autre compte dans la fenêtre (aucun run créé, aucune requête)',
    monde.relevesLbc === 3 && rV?.reason === 'lecture_partagee_recente' && monde.runs.length === nRuns + 1);
  ok('… une commande servie reste en file (pas réclamée), reprise à un poll suivant', rS3?.reason === 'lecture_partagee_recente' && monde.runs.find((r) => r.id === 'servi-B3')?.status === 'queued');
  monde.releveCasse = true;
  horloge.t += 16 * 60_000;
  await ctx.lancerRelevePlateforme({ platform: 'leboncoin', declencheur: 'veilleur' }).catch(() => null);
  monde.releveCasse = false;
  const rCasse = await ctx.lancerRelevePlateforme({ platform: 'leboncoin', declencheur: 'veilleur', session: SB });
  ok('une lecture qui casse en route compte aussi comme tentative (pas de seconde lecture)', rCasse?.reason === 'lecture_partagee_recente' && monde.relevesLbc === 4);
  horloge.t += 16 * 60_000;
  await ctx.lancerRelevePlateforme({ platform: 'leboncoin', declencheur: 'veilleur', session: SB });
  ok('fenêtre passée (15 min) : le compte délégué relit', monde.relevesLbc === 5);
  // Une lecture fraîche qui n'est PAS quotidienne (veille) ne réaligne aucun relevé quotidien : la cadence de 20 h juge.
  horloge.t += 60_000;
  const rTot = await ctx.lancerRelevePlateforme({ platform: 'leboncoin', declencheur: 'cron' });
  ok('un relevé quotidien ne se réaligne jamais sur une lecture de veille : sa cadence de 20 h juge (relevé à 10:00 → « cadence »)',
    rTot?.reason === 'cadence' && monde.relevesLbc === 5);
  // Nuit.
  horloge.t = Date.parse('2026-11-07T01:00:00Z');   // 02:00 Paris
  const n0 = monde.relevesLbc, nRuns2 = monde.runs.length;
  const rNuit = await ctx.lancerRelevePlateforme({ platform: 'leboncoin', declencheur: 'cron' });
  ok('la nuit (02:00 Paris), le relevé quotidien ne part pas — rien lu, aucun run', rNuit?.reason === 'nuit_session_partagee' && monde.relevesLbc === n0 && monde.runs.length === nRuns2);
  const rVeille = await ctx.lancerRelevePlateforme({ platform: 'leboncoin', declencheur: 'veilleur' });
  ok('la nuit, le relevé demandé par la veille des transactions (commande neuve) part toujours', rVeille?.ok === true && monde.relevesLbc === n0 + 1);
  // Pause : rien n'est repris, la visite lit vraiment.
  horloge.t += 60_000;
  ctx.noterBlocageLbcServeur({ etat: 'bloque' });
  monde.runs.push({ id: 'visite', user_id: A, platform: 'leboncoin', status: 'queued', declencheur: 'controle_blocage_lbc' });
  const rVis = await ctx.lancerRelevePlateforme({ platform: 'leboncoin', declencheur: 'bouton_distant', runId: 'visite' });
  ok('pendant une pause, la visite de contrôle lit vraiment (jamais la lecture faite 1 min avant)', rVis?.ok === true && monde.relevesLbc === n0 + 2);
  ctx.noterBlocageLbcServeur(null);
}
{
  // L'alignement des relevés quotidiens : 1 h au moins depuis le dernier relevé du compte.
  const ctx = charger();
  const monde = base();
  brancherBase(ctx, monde);
  ctx.noterDelegationsServies([{ compte: B, plateformes: ['leboncoin'] }]);
  horloge.t = Date.parse('2026-11-06T13:00:00Z');   // 14:00 Paris
  const ilYa = (h) => new Date(horloge.t - h * 3600_000).toISOString();
  monde.runs.push({ id: 'a0', user_id: A, platform: 'leboncoin', status: 'done', finished_at: ilYa(25) },
    { id: 'b0', user_id: B, platform: 'leboncoin', status: 'done', finished_at: ilYa(0.5) });
  await ctx.lancerRelevePlateforme({ platform: 'leboncoin', declencheur: 'cron' });
  const rB1 = await ctx.lancerRelevePlateforme({ platform: 'leboncoin', declencheur: 'cron', session: SB });
  ok('un compte relevé il y a 30 min ne se réaligne pas sur la lecture quotidienne (« cadence »)', rB1?.reason === 'cadence' && monde.relevesLbc === 1);
  monde.runs.find((r) => r.id === 'b0').finished_at = ilYa(2);
  const rB2 = await ctx.lancerRelevePlateforme({ platform: 'leboncoin', declencheur: 'cron', session: SB });
  ok('relevé il y a 2 h (cadence de 20 h pas échue) : aligné sur la lecture quotidienne de la session, sans requête', rB2?.ok === true && monde.relevesLbc === 1);
}
{
  const ctx = charger();
  const monde = base();
  brancherBase(ctx, monde);
  horloge.t = Date.parse('2026-11-07T01:00:00Z');   // 02:00 Paris, compte SEUL (aucune délégation)
  monde.runs.push({ id: 'ancien', user_id: A, platform: 'leboncoin', status: 'done', finished_at: new Date(horloge.t - 25 * 3600_000).toISOString() });
  await ctx.lancerRelevePlateforme({ platform: 'leboncoin', declencheur: 'veilleur' });
  horloge.t += 20_000;
  await ctx.lancerRelevePlateforme({ platform: 'leboncoin', declencheur: 'veilleur' });
  ok('compte seul : deux relevés demandés = deux lectures, comme avant', monde.relevesLbc === 2);
  const rN = await ctx.lancerRelevePlateforme({ platform: 'leboncoin', declencheur: 'cron' });
  ok('compte seul : le relevé quotidien de nuit juge sa cadence comme avant (aucune règle de nuit)', rN?.reason === 'cadence' || rN?.ok === true, String(rN?.reason ?? 'fait'));
}

// ════════════════════════════════════════════════════════════════════════════
console.log('\nD. Règle 1 — la liste des ventes : une lecture pour les deux comptes');
{
  const ctx = charger();
  const monde = base();
  brancherBase(ctx, monde);
  ctx.noterDelegationsServies([{ compte: B, plateformes: ['leboncoin'] }]);
  horloge.t = Date.parse('2026-11-06T09:00:00Z');
  const v1 = await ctx.lancerReleveVentes({ platform: 'leboncoin', declencheur: 'cron' });
  ok('ventes du compte de l\'extension : UNE lecture, arrêtée sur les commandes connues des DEUX comptes',
    v1?.ok === true && monde.lecturesVentes.length === 1 && JSON.stringify(monde.lecturesVentes[0]) === JSON.stringify(['V-A1', 'V-A2', 'V-B1']));
  horloge.t += 30_000;
  const v2 = await ctx.lancerReleveVentes({ platform: 'leboncoin', declencheur: 'cron', session: SB });
  ok('30 s plus tard, les ventes du compte délégué reprennent cette lecture (aucune requête), envoyées sous SON jeton',
    v2?.ok === true && monde.lecturesVentes.length === 1 && monde.envoisVentes.some((e) => e.compte === B && e.rows.some((r) => r.ref === 'V-NEUVE')));
  horloge.t = Date.parse('2026-11-07T01:00:00Z');
  const vN = await ctx.lancerReleveVentes({ platform: 'leboncoin', declencheur: 'cron' });
  ok('la nuit, le relevé quotidien des ventes ne part pas', vN?.reason === 'nuit_session_partagee' && monde.lecturesVentes.length === 1);
}
{
  const ctx = charger();
  const monde = base();
  brancherBase(ctx, monde);
  horloge.t = Date.parse('2026-11-07T01:00:00Z');
  const v = await ctx.lancerReleveVentes({ platform: 'leboncoin', declencheur: 'cron' });
  ok('compte seul : ses ventes lues comme avant (ses commandes connues seulement, nuit comprise)',
    v?.ok === true && monde.lecturesVentes.length === 1 && JSON.stringify(monde.lecturesVentes[0]) === JSON.stringify(['V-A1', 'V-A2']));
}

// ════════════════════════════════════════════════════════════════════════════
console.log('\nE. Règle 1 — le cycle délégué entier : relevés quotidiens ALIGNÉS');
async function cycle({ derniersA, derniersB, ventesA, ventesB, heureIso }) {
  const ctx = charger();
  const monde = base();
  brancherBase(ctx, monde);
  ctx.noterDelegationsServies([{ compte: B, plateformes: ['leboncoin'] }]);
  horloge.t = Date.parse(heureIso);
  const ilYa = (h) => new Date(horloge.t - h * 3600_000).toISOString();
  monde.runs.push({ id: 'a0', user_id: A, platform: 'leboncoin', status: 'done', finished_at: ilYa(derniersA) },
    { id: 'b0', user_id: B, platform: 'leboncoin', status: 'done', finished_at: ilYa(derniersB) });
  ctx.__memoire.ventes_releve_etat = { leboncoin: { dernierAt: horloge.t - ventesA * 3600_000 }, [`leboncoin@${B}`]: { dernierAt: horloge.t - ventesB * 3600_000 } };
  ctx.sessionDeleguee = async () => SB;
  ctx.capacitesDeclarees = async () => [];
  ctx.callEdgeFunction = async () => ({ jobs: [], sync_commands_annonces: [] });
  let veilles = 0;
  ctx.checkPublishedListings = async () => { veilles++; };
  await ctx.cycleDelegueLbc();
  const premier = { relevesLbc: monde.relevesLbc, ventes: monde.lecturesVentes.length, runs: monde.runs.filter((r) => r.declencheur === 'cron').map((r) => r.user_id), veilles };
  horloge.t += 120_000;
  await ctx.cycleDelegueLbc();
  return { premier, second: { relevesLbc: monde.relevesLbc, ventes: monde.lecturesVentes.length }, monde };
}
{
  const c1 = await cycle({ derniersA: 25, derniersB: 25, ventesA: 25, ventesB: 25, heureIso: '2026-11-06T08:00:00Z' });
  ok('09:00 Paris, les deux comptes dus : UNE lecture de « Mes annonces » et UNE des ventes, relevés faits pour les deux',
    c1.premier.relevesLbc === 1 && c1.premier.ventes === 1 && c1.premier.runs.includes(A) && c1.premier.runs.includes(B),
    `lectures ${c1.premier.relevesLbc}/${c1.premier.ventes}, runs ${c1.premier.runs.length}`);
  ok('… et le cycle suivant ne relit rien', c1.second.relevesLbc === 1 && c1.second.ventes === 1);
  ok('… les ventes du délégué envoyées sous son jeton', c1.monde.envoisVentes.some((e) => e.compte === B) && c1.monde.envoisVentes.some((e) => e.compte === A));
  const c2 = await cycle({ derniersA: 2, derniersB: 25, ventesA: 2, ventesB: 25, heureIso: '2026-11-06T08:00:00Z' });
  ok('le compte délégué mène (le sien est dû, pas celui du navigateur) : une lecture, et le compte du navigateur s\'y aligne',
    c2.premier.relevesLbc === 1 && c2.premier.ventes === 1 && c2.premier.runs.includes(A) && c2.premier.runs.includes(B));
  const c3 = await cycle({ derniersA: 25, derniersB: 25, ventesA: 25, ventesB: 25, heureIso: '2026-11-06T02:00:00Z' });
  ok('03:00 Paris : aucun relevé quotidien, pour personne', c3.premier.relevesLbc === 0 && c3.premier.ventes === 0 && c3.premier.runs.length === 0);
  ok('… la veille des annonces du délégué est appelée (elle-même se tait la nuit, cf. B)', c3.premier.veilles === 1);
}

// ════════════════════════════════════════════════════════════════════════════
console.log('\nF. Ce qui ne bouge pas');
{
  const corps = (debut) => { const i = BG.indexOf(debut); return i < 0 ? '' : BG.slice(i, BG.indexOf('\n}\n', i)); };
  const veille = corps('async function veillerCommandes(');
  ok('veille des transactions Leboncoin (10 min) : ni nuit, ni budget, ni lecture partagée',
    /const VEILLE_COMMANDES_MS = 10 \* 60 \* 1000;/.test(BG) && !/estNuitParis|rythmeLbcPartage|LbcPartage/.test(veille));
  ok('gestes : processJob ne fait que noter le geste (aucune attente, aucun budget)',
    /if \(job\.platform === "leboncoin"\) noterGesteLbc\(\);/.test(corps('async function processJob(')) && !/estNuitParis|prendreJeton|rythmeLbcPartage/.test(corps('async function processJob(')));
  ok('cadence de republication : maybeAutoRepublish intouchée', !/estNuitParis|LbcPartage|lbcPartage/.test(corps('async function maybeAutoRepublish(')));
  const cyc = corps('async function cycleDelegueUnCompte(');
  ok('cycle délégué : tout passe encore avec la session du compte délégué (4 appels)', (cyc.match(/session: sD/g) ?? []).length === 4);
  ok('compte seul : chaque règle est gardée par la session partagée (sessionLbcPartagee / rythmeLbcPartage)',
    /const lbcPartagee = platform === "leboncoin" && await sessionLbcPartagee\(\);/.test(corps('async function lancerRelevePlateforme('))
    && /const lbcPartagee = platform === "leboncoin" && await sessionLbcPartagee\(\);/.test(corps('async function lancerReleveVentes('))
    && /const partage = lbcLue \? await rythmeLbcPartage\(session\)/.test(corps('async function checkPublishedListings(')));
}

console.log(echecs ? `\n✗ ${echecs} échec(s) sur ${total}` : `\n✓ ${total}/${total} — session Leboncoin partagée : un relevé, un budget, pas de nuit`);
process.exit(echecs ? 1 : 0);
