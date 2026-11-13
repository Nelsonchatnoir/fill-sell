// ═══════════════════════════════════════════════════════════════════════════
// VERROU « FILET DE CAPACITÉ » (13/11/2026, décision de Nico, point 2)
// ═══════════════════════════════════════════════════════════════════════════
// Mot pour mot : « Filet de capacité : si le Cloud approche de sa capacité (seuil que tu proposes, d'après la capacité
// réelle de cloud-2), les essais au renouvellement coupé passent en dernier dans la file. Au-delà, ils s'arrêtent avec un
// message clair. Rien de ce filet ne joue tant qu'on est loin du seuil. »
// Le défaut (avant ce correctif) : le planificateur (serveur-cloud/src/planificateur.js:78) trie les comptes par motif
// seul et postes.js (tour) ne connaît pas le renouvellement : un essai coupé — qui partira de toute façon à la fin de son
// essai — garde sa place et son navigateur devant un compte payé, et rien ne l'arrête quand le serveur est plein.
// Chiffres réels (lus le 13/11 vers 17:45, Paris) : cloud-2 sert 6 comptes (1 offert, 5 essais), capacité vendue 15
// (CAPACITE_DEPART), capacité RÉELLE (atteignable mesurée) 25 — mémoire : 1 907 Mo par compte au 95e centile, 64 076 Mo,
// 286 fenêtres de 5 min sur 24 h, 7 comptes au plus ; processeur (n_cpu 311) et puce (4 487) loin derrière.
// Seuils : « file » dès 80 % de la capacité réelle (20 comptes sur 25, le seuil de l'alerte support@) ; « arrêt » à 100 %
// et plus aucune place libre dans la flotte (25 sur 25) : un essai coupé cède sa place.
//   npm run selftest:cloud-filet-capacite
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { planifierPostes as planifierAvant } from './fixtures/planificateur-avant-filet-1311.mjs';
import { planifierPostes } from '../serveur-cloud/src/planificateur.js';
import { creerPostes } from '../serveur-cloud/src/postes.js';
import { creerFlotte } from '../serveur-cloud/src/flotte.js';
import { idExtensionDepuisCle } from '../serveur-cloud/src/sessionFillsell.js';

const RACINE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const charger = async () => {
  try { return await import('../serveur-cloud/src/filetCapacite.js'); } catch (e) {
    assert.fail(`serveur-cloud/src/filetCapacite.js absent (${e.code ?? e.message}) : aucun filet — planificateur.js:78 trie par motif seul, `
      + 'un essai au renouvellement coupé passe devant un compte payé et rien ne l’arrête quand le serveur est plein');
  }
};

const T0 = Date.parse('2026-11-20T10:00:00Z');   // 11:00, Paris
const iso = (t) => new Date(t).toISOString();
const JOUR = 86_400_000;

// ── 1. LOIN DU SEUIL, RIEN NE CHANGE : la décision pure est celle d'AVANT le filet (copie figée au commit 23ef826) ───
function hasard(graine) {
  let a = graine >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function etatAuHasard(r) {
  const entier = (n) => Math.floor(r() * n);
  const users = Array.from({ length: entier(31) }, (_, i) => `u${String(i).padStart(2, '0')}`);
  return {
    comptes: users.filter(() => r() < 0.9).map((u) => ({ user_id: u, etat_cloud: r() < 0.15 ? 'essai_termine' : r() < 0.5 ? 'essai' : 'paye' })),
    ouverts: new Map(users.filter(() => r() < 0.5).map((u) => [u, { ouvertLe: T0 - entier(3_600_000) }])),
    jobs: new Map(users.filter(() => r() < 0.4).map((u) => [u, { attente: entier(3), retraits: entier(2), enCours: r() < 0.3 ? 1 : 0 }])),
    connexions: new Set(users.filter(() => r() < 0.1)),
    dernieresFins: new Map(users.filter(() => r() < 0.3).map((u) => [u, T0 - entier(7_200_000)])),
    delaiMin: r() < 0.5 ? null : 1 + entier(60), cpuPct: r() < 0.2 ? null : r() * 100, cpuPause: 50,
    navigateursMax: entier(31), sessionMinimaleMin: 8, maintenant: T0,
  };
}

test('1. verrou : sans essai coupé donné (loin du seuil), la décision est EXACTEMENT celle d’avant le filet — 20 000 états', () => {
  const r = hasard(1311);
  let refusesVus = 0; let connexionsVues = 0;
  for (let i = 0; i < 20_000; i++) {
    const e = etatAuHasard(r);
    const attendu = planifierAvant(structuredClone(e));
    assert.deepEqual(planifierPostes(structuredClone(e)), attendu, `état ${i}`);
    assert.deepEqual(planifierPostes({ ...structuredClone(e), derniers: new Set() }), attendu, `état ${i} (derniers vide)`);
    refusesVus += attendu.refuses.length;
    connexionsVues += attendu.fermer.filter((f) => f.raison === 'place_pour_une_connexion').length;
  }
  assert.ok(refusesVus > 1000 && connexionsVues > 50, `le hasard couvre les refus faute de place (${refusesVus}) et les places rendues à une connexion (${connexionsVues})`);
});

// ── 2. Le niveau, sur la capacité réelle de cloud-2 (25) ────────────────────────────────────────────────────────────
test('2. niveau : loin sous 20 comptes sur 25 ; « file » de 20 à 24 ; « arrêt » à 25 SEULEMENT sans aucune place libre dans la flotte', async () => {
  const { niveauFilet, reglagesFilet, FILET_FILE_PCT, FILET_ARRET_PCT } = await charger();
  assert.equal(FILET_FILE_PCT, 80); assert.equal(FILET_ARRET_PCT, 100);
  const n = (comptes, placesLibres = 0, o = {}) => niveauFilet({ comptes, capaciteReelle: 25, placesLibres, filePct: 80, arretPct: 100, ...o });
  assert.equal(n(6, 9).niveau, 'loin', 'cloud-2 le 13/11 : 6 comptes sur 25');
  for (let c = 0; c < 20; c++) assert.equal(n(c).niveau, 'loin', `${c} comptes`);
  for (let c = 20; c < 25; c++) assert.equal(n(c).niveau, 'file', `${c} comptes`);
  assert.deepEqual([n(25).niveau, n(25).aLiberer], ['arret', 1], '25 sur 25, aucune place : un essai coupé cède sa place');
  assert.equal(n(25, 3).niveau, 'file', 'un autre serveur a des places : personne n’est arrêté');
  assert.equal(n(25, null).niveau, 'file', 'places inconnues (pas de battement) : jamais d’arrêt');
  assert.deepEqual([n(28).niveau, n(28).aLiberer], ['arret', 4], 'capacité réelle baissée sous les comptes servis : retour à une place libre');
  assert.equal(n(25, 0, { arretPct: 0 }).niveau, 'file', 'coin_config cloud_filet_arret_pct = 0 : aucun arrêt');
  assert.equal(niveauFilet({ comptes: 6 }).niveau, 'loin', 'capacité inconnue : rien');
  assert.equal(niveauFilet({}).niveau, 'loin');
  assert.deepEqual(reglagesFilet({}), { filePct: 80, arretPct: 100 });
  assert.deepEqual(reglagesFilet({ cloud_filet_file_pct: 70, cloud_filet_arret_pct: 0 }), { filePct: 70, arretPct: 0 });
  assert.deepEqual(reglagesFilet({ cloud_filet_file_pct: 5, cloud_filet_arret_pct: 20 }), { filePct: 80, arretPct: 100 }, 'hors bornes : les défauts');
});

// ── 3. Qui est un essai coupé ──────────────────────────────────────────────────────────────────────────────────────
const essai = (o = {}, t = T0) => ({ is_cloud: false, is_premium: false, is_pro: false, is_business: false, is_comped: false,
  cloud_essai_debut: iso(t - 2 * JOUR), cloud_essai_fin: iso(t + 5 * JOUR), cloud_essai_arrete: false, cloud_arret_fin_periode: true, ...o });
// Le planificateur réel lit l'horloge : ses essais vivent MAINTENANT.
const NOW = Date.now();
const essaiVivant = (o = {}) => essai(o, NOW);
const dateParis = (t) => new Date(t).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
test('3. essai coupé = essai en cours, renouvellement coupé, Cloud pas payé, pas offert — pack en essai et Cloud seul à côté d’une formule payée COMPRIS', async () => {
  const { estEssaiCoupe } = await charger();
  assert.equal(estEssaiCoupe(essai(), T0), true);
  assert.equal(estEssaiCoupe(essai({ cloud_arret_fin_periode: false }), T0), false, 'renouvellement actif : jamais');
  assert.equal(estEssaiCoupe(essai({ is_cloud: true }), T0), false, 'Cloud payé (arrêt programmé en fin de période) : jamais');
  assert.equal(estEssaiCoupe(essai({ is_comped: true }), T0), false, 'compte offert : jamais');
  // (13/11, réponse de Nico : « les essais au renouvellement coupé », sans exception) Le filet n'arrête que le Cloud.
  assert.equal(estEssaiCoupe(essai({ cloud_formule: 'pro_cloud', is_pro: true, is_premium: true }), T0), true, 'pack Pro + Cloud en essai, renouvellement coupé : concerné');
  assert.equal(estEssaiCoupe(essai({ cloud_formule: 'business_cloud', is_business: true, is_pro: true, is_premium: true }), T0), true, 'pack Business + Cloud : concerné');
  assert.equal(estEssaiCoupe(essai({ is_premium: true, cloud_formule: null }), T0), true, 'formule Premium payée + Cloud seul en essai coupé : concerné');
  assert.equal(estEssaiCoupe(essai({ cloud_formule: 'pro_cloud', is_pro: true, cloud_arret_fin_periode: false }), T0), false, 'pack au renouvellement actif : jamais');
  assert.equal(estEssaiCoupe(essai({ cloud_essai_arrete: true }), T0), false, 'déjà arrêté');
  assert.equal(estEssaiCoupe(essai({ cloud_essai_fin: iso(T0 - 1) }), T0), false, 'fini');
  assert.equal(estEssaiCoupe(essai({ cloud_essai_debut: iso(T0 + 1) }), T0), false, 'pas commencé');
  assert.equal(estEssaiCoupe(null, T0), false);
});

// ── 4. La file : les essais coupés passent après tous les autres ────────────────────────────────────────────────────
test('4. file : un essai coupé passe APRÈS un compte payé ou un essai normal, et lui cède sa place s’il est au repos', async () => {
  await charger();
  const base = { cpuPct: 10, cpuPause: 50, sessionMinimaleMin: 8, maintenant: T0, delaiMin: null, dernieresFins: new Map() };
  // Une seule place, deux nouveaux : l'essai coupé (même en « Me connecter ») passe après le compte payé.
  const e1 = { ...base, comptes: [{ user_id: 'coupe', etat_cloud: 'essai' }, { user_id: 'paye', etat_cloud: 'paye' }],
    ouverts: new Map(), jobs: new Map(), connexions: new Set(['coupe']), navigateursMax: 1 };
  assert.deepEqual(planifierAvant(structuredClone(e1)).ouvrir.map((o) => o.user), ['coupe'], 'avant : la connexion passe devant');
  const d1 = planifierPostes({ ...e1, derniers: new Set(['coupe']) });
  assert.deepEqual(d1.ouvrir.map((o) => o.user), ['paye']);
  assert.deepEqual(d1.refuses, [{ user: 'coupe', raison: 'capacite' }]);
  // L'essai coupé déjà ouvert, au repos (session continue) : il cède sa place à l'essai normal refusé.
  const e2 = { ...base, comptes: [{ user_id: 'coupe', etat_cloud: 'essai' }, { user_id: 'normal', etat_cloud: 'essai' }],
    ouverts: new Map([['coupe', { ouvertLe: T0 - 3_600_000 }]]), jobs: new Map(), connexions: new Set(), navigateursMax: 1 };
  assert.deepEqual(planifierAvant(structuredClone(e2)).refuses, [{ user: 'normal', raison: 'capacite' }], 'avant : l’essai normal attend');
  const d2 = planifierPostes({ ...e2, derniers: new Set(['coupe']) });
  assert.deepEqual(d2.fermer, [{ user: 'coupe', raison: 'filet_capacite_file' }]);
  assert.deepEqual(d2.ouvrir, [{ user: 'normal', motif: 'continu' }]);
  assert.deepEqual(d2.refuses, []);
  // Jamais au milieu d'un job, jamais pendant un « Me connecter » ; un essai coupé n'en déplace jamais un autre.
  const d3 = planifierPostes({ ...e2, jobs: new Map([['coupe', { enCours: 1 }]]), derniers: new Set(['coupe']) });
  assert.deepEqual([d3.fermer, d3.refuses], [[], [{ user: 'normal', raison: 'capacite' }]], 'job en cours : il garde son navigateur');
  const d4 = planifierPostes({ ...e2, connexions: new Set(['coupe']), derniers: new Set(['coupe']) });
  assert.deepEqual(d4.fermer, [], '« Me connecter » ouvert : il garde son navigateur');
  const d5 = planifierPostes({ ...e2, derniers: new Set(['coupe', 'normal']) });
  assert.deepEqual(d5.fermer, [], 'deux essais coupés : aucun ne déplace l’autre');
  // Le « Me connecter » d'un essai coupé ne prend JAMAIS la place d'un compte payé (avant : la connexion passait).
  const e6 = { ...base, comptes: [{ user_id: 'paye', etat_cloud: 'paye' }, { user_id: 'coupe', etat_cloud: 'essai' }],
    ouverts: new Map([['paye', { ouvertLe: T0 - 3_600_000 }]]), jobs: new Map(), connexions: new Set(['coupe']), navigateursMax: 1 };
  assert.deepEqual(planifierAvant(structuredClone(e6)).fermer, [{ user: 'paye', raison: 'place_pour_une_connexion' }], 'avant : le payé cédait sa place');
  const d6 = planifierPostes({ ...e6, derniers: new Set(['coupe']) });
  assert.deepEqual([d6.fermer, d6.ouvrir, d6.refuses], [[], [], [{ user: 'coupe', raison: 'capacite' }]], 'le payé garde sa place');
  // … mais il peut prendre celle d'un AUTRE essai coupé au repos (connexion > session continue, entre essais coupés).
  const e7 = { ...e6, comptes: [...e6.comptes, { user_id: 'coupe2', etat_cloud: 'essai' }], navigateursMax: 2,
    ouverts: new Map([['paye', { ouvertLe: T0 - 3_600_000 }], ['coupe2', { ouvertLe: T0 - 3_600_000 }]]) };
  const d7 = planifierPostes({ ...e7, derniers: new Set(['coupe', 'coupe2']) });
  assert.deepEqual([d7.fermer, d7.ouvrir, d7.refuses], [[{ user: 'coupe2', raison: 'place_pour_une_connexion' }], [{ user: 'coupe', motif: 'connexion' }], []],
    'la connexion de l’essai coupé passe, à la place de l’autre essai coupé ; le payé garde la sienne');
  // Un payé ET un essai coupé en « Me connecter » refusés, un seul essai coupé ouvert : sa place va au payé.
  const e8 = { ...e7, navigateursMax: 1, ouverts: new Map([['coupe2', { ouvertLe: T0 - 3_600_000 }]]) };
  const d8 = planifierPostes({ ...e8, derniers: new Set(['coupe', 'coupe2']) });
  assert.deepEqual([d8.fermer, d8.ouvrir, d8.refuses], [[{ user: 'coupe2', raison: 'filet_capacite_file' }], [{ user: 'paye', motif: 'continu' }],
    [{ user: 'coupe', raison: 'capacite' }]], 'le payé d’abord');
});

// ── 5-7. Le planificateur réel (postes.js), base et navigateurs simulés ───────────────────────────────────────────
const CLE = randomBytes(294).toString('base64');
const ID = idExtensionDepuisCle(CLE);
const jwt = (o) => `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify(o)).toString('base64url')}.c2ln`;
const uid = (id8) => `${id8}-0000-4000-8000-000000000000`;

/** Une base qui applique les filtres de PostgREST utilisés ici (eq, in, not.is, lte, gt) et note chaque appel. */
function baseSimulee({ comptes, profils = [], jobs = [] }) {
  const t = { profiles: profils.map((p) => ({ platform_settings: {}, ...p })), cross_post_jobs: jobs,
    veille_cpu: [{ pct: 10, le: new Date().toISOString() }], cloud_postes: [] };
  const appels = [];
  const temps = (v) => Date.parse(v);
  const garde = (l, [op, c, a, b]) => {
    if (op === 'eq') return l[c] === a;
    if (op === 'in') return a.includes(l[c]);
    if (op === 'not') return a === 'is' ? !(l[c] === b) : true;
    if (op === 'lte') return temps(l[c]) <= temps(a);
    if (op === 'gt') return temps(l[c]) > temps(a);
    return true;
  };
  const requete = (table) => {
    const ops = []; let maj = null; let borne = null;
    const resoudre = () => {
      let lignes = (t[table] ?? []).filter((l) => ops.every((o) => garde(l, o)));
      if (borne != null) lignes = lignes.slice(0, borne);
      if (maj) for (const l of lignes) Object.assign(l, maj);
      // Le déclencheur profiles_cloud_pool (cloud_compte_synchroniser) : un essai arrêté perd son IP, il n'est plus servi.
      if (maj && table === 'profiles' && maj.cloud_essai_arrete === true) {
        for (const l of lignes) { const i = comptes.findIndex((c) => c.user_id === l.id); if (i >= 0) comptes.splice(i, 1); }
      }
      appels.push(['from', table, maj ? 'update' : 'select', ops.map((o) => o.slice(0, 2).join(':')).join(',')]);
      return { data: lignes.map((l) => ({ ...l })), error: null };
    };
    const q = {
      select: () => q, order: () => q, update: (o) => { maj = o; return q; },
      eq: (c, v) => { ops.push(['eq', c, v]); return q; }, in: (c, v) => { ops.push(['in', c, v]); return q; },
      not: (c, op, v) => { ops.push(['not', c, op, v]); return q; },
      lte: (c, v) => { ops.push(['lte', c, v]); return q; }, gt: (c, v) => { ops.push(['gt', c, v]); return q; },
      limit: (n) => { borne = n; return q; },
      maybeSingle: async () => { const r = resoudre(); return { data: r.data[0] ?? null, error: null }; },
      then: (ok, ko) => Promise.resolve(resoudre()).then(ok, ko),
    };
    return q;
  };
  const base = {
    rpc: async (nom, a) => {
      appels.push(['rpc', nom]);
      if (nom === 'cloud_comptes_du_serveur') return { data: comptes.map((c) => ({ ...c })), error: null };
      if (nom === 'platform_settings_fusionner') {
        const p = t.profiles.find((x) => x.id === a.p_user);
        p.platform_settings = { ...p.platform_settings, [a.p_chemin[0]]: { ...(p.platform_settings[a.p_chemin[0]] ?? {}), ...a.p_patch } };
        return { data: p.platform_settings, error: null };
      }
      return { data: null, error: null };
    },
    from: requete,
  };
  return { base, appels, t };
}

function monter({ comptes, profils, jobs, filet, capacite, connexions = new Set() }) {
  const dossier = mkdtempSync(path.join(tmpdir(), 'filet-'));
  writeFileSync(path.join(dossier, 'manifest.json'), JSON.stringify({ key: CLE }));
  const b = baseSimulee({ comptes: comptes.map((c) => ({ ...c })), profils: structuredClone(profils), jobs });
  const ouverts = new Map(); const fermetures = []; const alertes = []; const journal = [];
  const cdpPour = (u) => ({
    on: () => () => {}, fermer() {},
    async send(m, p) {
      if (m === 'Target.getTargets') return { targetInfos: [{ targetId: 'sw', type: 'service_worker', url: `chrome-extension://${ID}/background.js` }] };
      if (m === 'Target.attachToTarget') return { sessionId: 's' };
      if (m === 'Storage.getCookies') return { cookies: [] };
      if (m === 'Runtime.evaluate' && String(p?.expression).includes('chrome.storage.local.get([')) {
        return { result: { value: { own: { access_token: jwt({ sub: u, session_id: `s-${u.slice(0, 8)}` }), refresh_token: 'r', expires_at: Math.floor(Date.now() / 1000) + 3600 }, user: { sub: u } } } };
      }
      return { result: { value: {} } };
    },
  });
  const navigateurs = {
    ouverts: () => [...ouverts.keys()],
    ouvert: (u) => ouverts.get(u) ?? null,
    async ouvrir(u, { profilId }) { const h = { cdp: cdpPour(u), conteneur: `fs-nav-${u}`, profilId, ouvertLe: Date.now(), permises: ['vinted'] }; ouverts.set(u, h); return h; },
    async fermer(u, raison) { ouverts.delete(u); fermetures.push([u, raison]); },
  };
  const postes = creerPostes({
    config: { serveurNom: 'cloud-2', dossierExtension: dossier, comptesAutorises: [], cpuPauseAuDessus: 50, sessionMinimaleMin: 8, memoireNavigateur: '2g', memoireRedemarrageMo: 0 },
    base: b.base, navigateurs, journal: { info: (e, d) => journal.push(['info', e, d]), alerte: (e, d) => journal.push(['alerte', e, d]), erreur: (e, d) => { throw new Error(`${e} ${JSON.stringify(d)}`); } },
    coffre: { cookiesARestaurer: async () => ({ aPoser: [], bilan: {}, connectees: ['vinted'], bloquees: [] }), sauvegarderCookies: async () => ({}),
      ecrire: async () => {}, lire: async () => ({}), aReconnecter: async () => false },
    sessions: { fabriquer: async () => { throw new Error('jamais ici'); }, revoquer: async () => ({}), rafraichirHorsNavigateur: async (o) => o },
    fournisseurIp: { proxyPour: async () => ({ proxyUrl: 'http://u:p@10.0.0.1:12323', ipId: 7, mode: 'dedie', sortie: 'dediee' }) },
    connexionsOuvertes: () => connexions, alertes: { signaler: async (n, texte, d) => { alertes.push([n, texte, d]); return {}; } },
    capacite, ...(filet ? { filet } : {}),
  });
  return { ...b, postes, ouverts, fermetures, alertes, journal, nettoyer: () => rmSync(dossier, { recursive: true, force: true }) };
}

// Les 6 comptes de cloud-2 le 13/11 (f44b5917 offert ; 5 essais) — l'un d'eux supposé au renouvellement coupé.
const CLOUD2 = ['f44b5917', 'd607ba20', 'f0acd3af', 'd0ac0538', 'b695d990', 'c7c382b7'].map(uid);
const compte = (u, etat) => ({ user_id: u, ip_id: 7, etat_cloud: etat, delai_sessions_min: null, plateformes_connectees: ['vinted'] });

test('5. verrou : loin du seuil (cloud-2 le 13/11 : 6 comptes sur 25), mêmes appels à la base et même décision qu’avec le filet absent', async () => {
  await charger();
  const comptes = CLOUD2.map((u, i) => compte(u, i === 0 ? 'paye' : 'essai'));
  const profils = CLOUD2.map((u, i) => ({ id: u, ...(i === 0 ? { is_cloud: true } : essaiVivant({ cloud_arret_fin_periode: i === 1 })) }));
  const avec = monter({ comptes, profils, capacite: () => 15, filet: () => ({ capaciteReelle: 25, placesLibres: 9, filePct: 80, arretPct: 100 }) });
  const sans = monter({ comptes, profils, capacite: () => 15 });
  try {
    for (let tour = 0; tour < 3; tour++) {
      const ra = await avec.postes.tour(); const rs = await sans.postes.tour();
      assert.deepEqual(ra, rs, `tour ${tour} : même décision, aucune clé « filet »`);
    }
    assert.deepEqual(avec.appels, sans.appels, 'mêmes appels à la base, dans le même ordre');
    assert.ok(!avec.appels.some(([k, table]) => k === 'from' && table === 'profiles'), 'profiles n’est jamais lu loin du seuil');
    assert.deepEqual(avec.alertes, sans.alertes);
  } finally { avec.nettoyer(); sans.nettoyer(); }
});

// 21 comptes sur 25 (84 %, « file ») : 16 payés, 3 essais normaux, 2 essais coupés.
const PAYES = Array.from({ length: 17 }, (_, i) => uid(`a0${String(i).padStart(6, '0')}`));
const NORMAUX = Array.from({ length: 5 }, (_, i) => uid(`b0${String(i).padStart(6, '0')}`));
const [C1, C2, C3] = ['c1000001', 'c2000002', 'c3000003'].map(uid);
const PREMIUM_COUPE = uid('d4000004');   // formule Premium payée + Cloud seul en essai coupé
const PACK_COUPE = uid('e5000005');      // pack Pro + Cloud en essai, renouvellement coupé
const OFFERT_COUPE = uid('f6000006');    // compte offert (is_comped) : jamais
const profilsDe = (coupes) => [
  ...PAYES.map((u, i) => ({ id: u, is_cloud: true, cloud_arret_fin_periode: i === 0 })),   // un payé à l'arrêt programmé : jamais
  ...NORMAUX.map((u) => ({ id: u, ...essaiVivant({ cloud_arret_fin_periode: false }) })),
  ...coupes.map(([u, finJ]) => ({ id: u, ...essaiVivant({ cloud_essai_fin: iso(NOW + finJ * JOUR) }) })),
  { id: PREMIUM_COUPE, ...essaiVivant({ is_premium: true, cloud_essai_fin: iso(NOW + 5 * JOUR) }) },
  { id: PACK_COUPE, ...essaiVivant({ is_premium: true, is_pro: true, cloud_formule: 'pro_cloud', cloud_essai_fin: iso(NOW + 3 * JOUR) }) },
  { id: OFFERT_COUPE, ...essaiVivant({ is_comped: true, cloud_essai_fin: iso(NOW + JOUR / 2) }) },
];

test('6. « file » (21 comptes sur 25) : UNE lecture bornée de profiles, les essais coupés passent après les autres, personne n’est arrêté', async () => {
  await charger();
  const coupes = [[C1, 2], [C2, 1]];
  // L'ordre de la base met les essais coupés EN TÊTE : avant le filet, ce sont eux qui passaient.
  const comptes = [...coupes.map(([u]) => compte(u, 'essai')), ...PAYES.slice(0, 16).map((u) => compte(u, 'paye')), ...NORMAUX.slice(0, 3).map((u) => compte(u, 'essai'))];
  const m = monter({ comptes, profils: profilsDe(coupes), capacite: () => 20, filet: () => ({ capaciteReelle: 25, placesLibres: 2, filePct: 80, arretPct: 100 }) });
  try {
    const r = await m.postes.tour();
    assert.equal(r.filet?.niveau, 'file');
    assert.equal(r.filet.coupes, 2);
    assert.deepEqual(r.refuses, [{ user: C2, raison: 'capacite' }], 'la place qui manque est celle d’un essai coupé (le dernier de la file)');
    assert.ok(!r.ouvrir.some((o) => o.user === C2) && r.ouvrir.some((o) => o.user === C1));
    const lus = m.appels.filter(([k, table]) => k === 'from' && table === 'profiles');
    assert.equal(lus.length, 1, 'une seule lecture de profiles par tour');
    assert.equal(lus[0][2], 'select');
    assert.match(lus[0][3], /^in:id$/, 'par la clé primaire, bornée aux essais de ce serveur');
    assert.ok(!m.appels.some(([k, , op]) => k === 'from' && op === 'update'), 'rien n’est écrit');
    const textes = m.alertes.map(([, texte]) => texte);
    assert.equal(textes.length, 2, 'l’alerte « Capacité atteinte » d’avant, et celle du filet');
    assert.match(textes[0], /^Capacité atteinte : 1 compte\(s\) attendent un navigateur \(max 20\)/);
    assert.match(textes[1], /^Filet de capacité — file sur cloud-2 : 1 essai\(s\) au renouvellement coupé passent après les autres comptes — 21 comptes pour une capacité réelle de 25 \(84 %\)/);
  } finally { m.nettoyer(); }
});

test('7. « arrêt » : autant d’essais coupés qu’il faut pour rouvrir UNE place — fin la plus proche, au repos, UNE par tour (décision de Nico : une place à la fois) — pack et Cloud seul à côté d’une formule compris, le palier jamais touché', async () => {
  const { arreterEssaiCoupe, CAUSE_ARRET_FILET } = await charger();
  // 27 comptes pour une capacité réelle de 25, aucune place : 3 à arrêter, UN par tour (une place à la fois, 13/11 soir). Fins d'essai : l'offert
  // 12 h (jamais), C2 1 j (tâche en cours), C1 2 j, le pack 3 j, C3 4 j, le Premium + Cloud seul 5 j.
  const coupes = [[C1, 2], [C2, 1], [C3, 4]];
  const comptes = [...PAYES.map((u) => compte(u, 'paye')), ...NORMAUX.slice(0, 4).map((u) => compte(u, 'essai')), compte(OFFERT_COUPE, 'essai'),
    ...coupes.map(([u]) => compte(u, 'essai')), compte(PACK_COUPE, 'essai'), compte(PREMIUM_COUPE, 'essai')];
  assert.equal(comptes.length, 27);
  const jobs = [{ user_id: C2, status: 'processing', action: 'republish', platform: 'vinted', voie: 'extension', platform_fields: {} }];
  const m = monter({ comptes, profils: profilsDe(coupes), jobs, capacite: () => 27, filet: () => ({ capaciteReelle: 25, placesLibres: 0, filePct: 80, arretPct: 100 }) });
  try {
    const r = await m.postes.tour();
    assert.equal(r.filet?.niveau, 'arret');
    assert.deepEqual(r.filet.arretes, [C1], 'un seul par tour : C1, la fin la plus proche au repos (C2 a une tâche en cours, l’offert jamais)');
    const p = (u) => m.t.profiles.find((x) => x.id === u);
    assert.equal(p(PACK_COUPE).cloud_essai_arrete ?? false, false, 'le pack attend le tour suivant (une place à la fois)');
    for (const u of [C1]) {
      assert.equal(p(u).cloud_essai_arrete, true);
      assert.ok(Math.abs(Date.parse(p(u).cloud_essai_fin) - Date.now()) < 60_000, 'fin d’essai ramenée à l’arrêt (la représentation d’un essai arrêté)');
      assert.deepEqual(Object.keys(p(u).platform_settings.cloud_arret).sort(), ['cause', 'essai_fin_prevue', 'le', 'v']);
      assert.equal(p(u).platform_settings.cloud_arret.cause, CAUSE_ARRET_FILET);
    }
    assert.equal(p(C1).platform_settings.cloud_arret.essai_fin_prevue, iso(NOW + 2 * JOUR), 'la fin d’essai d’origine, pour le message');
    const ecrit = m.appels.find(([k, table, op]) => k === 'from' && table === 'profiles' && op === 'update');
    for (const g of ['eq:id', 'eq:cloud_essai_arrete', 'eq:cloud_arret_fin_periode', 'not:is_cloud', 'not:is_comped', 'lte:cloud_essai_debut', 'gt:cloud_essai_fin']) {
      assert.ok(ecrit[3].split(',').includes(g), `garde du WHERE : ${g}`);
    }
    assert.ok(!/not:is_(premium|pro|business)/.test(ecrit[3]), 'aucune garde de palier : le pack et la formule payée sont concernés');
    assert.ok(![C1].some((u) => r.ouvrir.some((o) => o.user === u) || m.ouverts.has(u)), 'son navigateur ne s’ouvre pas');
    const filetAlertes = m.alertes.map(([, t]) => t).filter((t) => t.startsWith('Filet de capacité'));
    assert.equal(filetAlertes.length, 1);
    assert.match(filetAlertes[0], /^Filet de capacité — arrêt sur cloud-2 : 1 essai\(s\) au renouvellement coupé arrêté\(s\) \(c1000001, fin prévue le /);
    assert.ok(filetAlertes[0].includes(`(c1000001, fin prévue le ${dateParis(NOW + 2 * JOUR)})`), 'fin prévue, heure de Paris');
    assert.match(filetAlertes[0], /rien n'est prélevé ; aucun mail client/);
    assert.ok(!JSON.stringify(m.alertes).includes(C1), 'l’alerte cite les comptes par id8 seulement');
    assert.ok(m.journal.some(([n, e, d]) => n === 'alerte' && e === 'filet_capacite_arret' && d.user === C1));

    // (13/11 soir, une place à la fois) Tour 2 : 26 comptes (la base ne sert plus C1) → le pack, seul (C2 toujours en tâche).
    const r2 = await m.postes.tour();
    assert.deepEqual(r2.filet.arretes, [PACK_COUPE], 'tour 2 : le pack, seul');
    assert.equal(p(PACK_COUPE).cloud_essai_arrete, true);
    assert.deepEqual([p(PACK_COUPE).is_pro, p(PACK_COUPE).is_premium, p(PACK_COUPE).cloud_formule], [true, true, 'pro_cloud'], 'le pack : seul le Cloud s’arrête, le palier et la formule restent');
    assert.ok(m.journal.some(([n, e, d]) => n === 'alerte' && e === 'filet_capacite_arret' && d.user === PACK_COUPE));
    // Tour 3 : 25 comptes, une place à rouvrir → C3.
    const r3 = await m.postes.tour();
    assert.deepEqual(r3.filet.arretes, [C3]);
    const r4 = await m.postes.tour();
    assert.deepEqual([r4.filet.niveau, r4.filet.arretes], ['file', []], '24 sur 25 : retour à la file, plus personne n’est arrêté');
    for (const u of [C2, PREMIUM_COUPE, OFFERT_COUPE, ...PAYES, ...NORMAUX]) {
      assert.equal(p(u).cloud_essai_arrete ?? false, false, `${u.slice(0, 8)} pas arrêté`);
      assert.equal(p(u).platform_settings.cloud_arret, undefined);
    }

    // Ouvert puis arrêté quand la flotte se remplit : son navigateur est fermé proprement, avec la raison ; il ne rouvre pas.
    const flotte = { capaciteReelle: 25, placesLibres: 1, filePct: 80, arretPct: 100 };
    const m2 = monter({ comptes: comptes.slice(0, 25), profils: profilsDe(coupes), jobs: [], capacite: () => 25, filet: () => flotte });
    try {
      await m2.postes.tour();
      assert.ok(m2.ouverts.has(C2) && !m2.t.profiles.some((x) => x.cloud_essai_arrete), 'une place libre (une réservation qui part) : « file », personne n’est arrêté');
      flotte.placesLibres = 0;
      const r4 = await m2.postes.tour();
      assert.deepEqual(r4.filet.arretes, [C2], 'plus de place : C2 (fin la plus proche, plus de tâche) est arrêté');
      assert.deepEqual(m2.fermetures, [[C2, 'filet_capacite_arret']], 'navigateur fermé : filet_capacite_arret, et lui seul');
      flotte.placesLibres = 1;
      const r5 = await m2.postes.tour();
      assert.ok(!m2.ouverts.has(C2) && !r5.ouvrir.some((o) => o.user === C2), 'plus servi : il ne rouvre pas');
      assert.equal(r5.filet.niveau, 'file', '24 comptes sur 25 : retour à la file');
    } finally { m2.nettoyer(); }

    // La formule payée + Cloud seul en essai coupé : arrêtée elle aussi, et sa formule reste.
    const bp = baseSimulee({ comptes: [], profils: [{ id: PREMIUM_COUPE, ...essaiVivant({ is_premium: true }) }] });
    assert.equal((await arreterEssaiCoupe({ base: bp.base, user: PREMIUM_COUPE })).arrete, true);
    assert.deepEqual([bp.t.profiles[0].cloud_essai_arrete, bp.t.profiles[0].is_premium], [true, true]);
    // Jamais : l'état a changé (renouvellement repris), Cloud payé, compte offert — rien n'est écrit, aucun message.
    for (const [quoi, profil] of [['renouvellement repris', essaiVivant({ cloud_arret_fin_periode: false })], ['Cloud payé', essaiVivant({ is_cloud: true })],
      ['offert', essaiVivant({ is_comped: true })]]) {
      const b = baseSimulee({ comptes: [], profils: [{ id: C3, ...profil }] });
      assert.deepEqual(await arreterEssaiCoupe({ base: b.base, user: C3 }), { arrete: false, raison: 'etat_change' }, quoi);
      assert.ok(!b.appels.some(([k, nom]) => k === 'rpc' && nom === 'platform_settings_fusionner'), quoi);
      assert.equal(b.t.profiles[0].cloud_essai_arrete ?? false, false, quoi);
    }
  } finally { m.nettoyer(); }
});

// ── 8. La flotte donne au filet la capacité RÉELLE (atteignable mesurée), pas la capacité vendue ─────────────────────
test('8. flotte : capacité réelle = atteignable mesurée (25 sur cloud-2, vendue 15), places du battement, seuils relus dans coin_config', async () => {
  await charger();
  const coin = { cloud_places_seuil: 0, cloud_filet_file_pct: 75 };
  const MESURES_CLOUD2 = { fenetres: 286, comptes_max: 7, mem_compte_p95_mo: 1907, n_mem: 25, n_cpu: 311, n_puce: 4487, graves_7j: 0, oom: 0, derniere_le: '2026-11-13T16:44:00Z' };
  const q = (data) => { const r = { select: () => r, eq: () => r, in: () => r, order: () => r, limit: () => r, then: (ok, ko) => Promise.resolve({ data, error: null }).then(ok, ko) }; return r; };
  const base = {
    rpc: async (nom) => (nom === 'cloud_capacite_mesures' ? { data: MESURES_CLOUD2, error: null }
      : nom === 'cloud_serveur_battre' ? { data: { comptes: 6, places: 9, places_libres: 9 }, error: null } : { data: null, error: null }),
    from: (table) => q(table === 'coin_config' ? Object.entries(coin).map(([key, value]) => ({ key, value }))
      : table === 'cloud_serveurs' ? [{ nom: 'cloud-2', etat: 'actif', capacite: 15, comptes: 6, vu_le: new Date().toISOString() }] : []),
  };
  const f = creerFlotte({ config: { serveurNom: 'cloud-2', domaine: 'cloud-2.fillsell.app', navigateursMaxAuto: true, navigateursMax: 15, capaciteDepart: 15,
    capacitePlafond: 30, capaciteTheorique: 30, capaciteAvance: 5, memoireNavigateur: '2g', moteurNavigateur: 'chrome', navigateurGpu: true, comptesAutorises: [] },
  base, navigateurs: { ouverts: () => [], dernierRendu: () => null }, journal: { info() {}, alerte() {}, erreur() {} }, alertes: { signaler: async () => ({}) },
  hetzner: { disponible: false }, cloudflare: { disponible: false }, lireFichier: async () => { throw new Error('absent'); } });
  assert.equal(typeof f.etatFilet, 'function', 'flotte.etatFilet');
  assert.deepEqual(f.etatFilet(), { capaciteReelle: 15, placesLibres: null, filePct: 80, arretPct: 100 }, 'au démarrage : la capacité de départ, places inconnues');
  await f.evaluerCapacite();
  await f.battre();
  assert.equal(f.capacite(), 15, 'capacité vendue : 15');
  assert.deepEqual(f.etatFilet(), { capaciteReelle: 25, placesLibres: 9, filePct: 80, arretPct: 100 }, 'capacité réelle 25, 9 places');
  await f.tour();
  assert.equal(f.etatFilet().filePct, 75, 'coin_config cloud_filet_file_pct relu par le tour de flotte');
});

// ── 9. L'app DIT le Cloud complet (Réglages › Abonnement) — quand cloud_arret est posé, jamais sinon ────────────────
test('9. app : « Le Cloud est complet… » à la place de « Essai arrêté le… » (Cloud seul), sous la formule (pack) et sur la carte Free — jamais sans cloud_arret', async () => {
  const lireSrc = (p) => readFileSync(path.join(RACINE, p), 'utf8');
  assert.match(lireSrc('src/cloud/useCloudProfil.js'), /cloud_arret:platform_settings->cloud_arret/, 'la lecture Cloud prend platform_settings.cloud_arret (une seule clé)');
  globalThis.document ??= { body: {} };
  const memoire = new Map();
  globalThis.localStorage ??= { getItem: (k) => (memoire.has(k) ? memoire.get(k) : null), setItem: (k, v) => memoire.set(k, String(v)), removeItem: (k) => memoire.delete(k), clear: () => memoire.clear() };
  const { createServer } = await import('vite');
  const vite = await createServer({
    root: RACINE, configFile: false, logLevel: 'silent', appType: 'custom',
    server: { middlewareMode: true, hmr: false, watch: null },
    resolve: { alias: [{ find: /^react-dom$/, replacement: path.join(RACINE, 'scripts/lib/portail-en-place.mjs') }] },
    ssr: { noExternal: [] }, optimizeDeps: { noDiscovery: true, include: [] },
  });
  try {
    const React = (await import('react')).default;
    const { renderToStaticMarkup } = await import('react-dom/server');
    const h = React.createElement;
    const texte = (el) => renderToStaticMarkup(el).replace(/<[^>]+>/g, ' ').replace(/&#x27;|&#39;/g, '\'').replace(/&amp;/g, '&').replace(/\s+/g, ' ');
    const AF = await vite.ssrLoadModule('/src/cloud/arretFiletCloud.js');
    const BR = await vite.ssrLoadModule('/src/cloud/BlocCloudReglages.jsx');
    const BFR = await vite.ssrLoadModule('/src/cloud/BlocFormulesReglages.jsx');
    const LE = '2026-11-20T09:00:00Z';   // 10:00, Paris
    const ARRET = { cause: 'cloud_complet', le: LE, essai_fin_prevue: '2026-11-22T09:00:00Z', v: 1 };
    const FR = 'Le Cloud est complet : ton essai, dont le renouvellement est coupé, s\'est arrêté le 20 novembre pour libérer sa place. Rien ne te sera prélevé tant que le renouvellement reste coupé.';
    const EN = 'The Cloud is full: your trial, whose renewal is turned off, stopped on 20 November to free up its place. Nothing will be charged as long as renewal stays off.';
    const arrete = { etat: 'essai_termine', actif: false, essaiPris: true, essaiArrete: true, essaiFin: LE, avecFormule: false };

    // Pur : le texte mot pour mot (FR, EN), et null dans tous les autres cas.
    assert.equal(AF.phraseArretFilet({ cloud: arrete, arret: ARRET, lang: 'fr' }), FR);
    assert.equal(AF.phraseArretFilet({ cloud: arrete, arret: ARRET, lang: 'en' }), EN);
    for (const [quoi, cloud, arret] of [
      ['sans cloud_arret', arrete, null], ['autre cause', arrete, { ...ARRET, cause: 'autre' }], ['date illisible', arrete, { ...ARRET, le: 'x' }],
      ['essai fini normalement (pas arrêté)', { ...arrete, essaiArrete: false }, ARRET], ['essai en cours', { ...arrete, etat: 'essai', actif: true }, ARRET],
      ['Cloud payé', { ...arrete, etat: 'paye', actif: true }, ARRET], ['lecture absente', null, ARRET],
    ]) assert.equal(AF.phraseArretFilet({ cloud, arret, lang: 'fr' }), null, quoi);

    // Cloud seul (BlocCloudReglages, état essai_termine) : la phrase remplace « Essai arrêté le {date}… ».
    const bloc = (props) => texte(h(BR.default, { lang: 'fr', cloud: arrete, lecture: 'ok', maintenant: Date.parse(LE), ...props }));
    const avec = bloc({ arretFilet: ARRET });
    assert.ok(avec.includes(FR), 'Cloud seul arrêté par le filet : la phrase du Cloud complet');
    assert.ok(!/Essai arrêté le 20 novembre\. Le Cloud n'est plus actif/.test(avec), '… à la place de « Essai arrêté le {date}… »');
    assert.ok(texte(h(BR.default, { lang: 'en', cloud: arrete, lecture: 'ok', arretFilet: ARRET })).includes(EN), 'en anglais');
    const sans = bloc({});
    assert.ok(!sans.includes('Le Cloud est complet') && /Essai arrêté le 20 novembre\. Le Cloud n'est plus actif, et rien n'a été facturé pour lui\./.test(sans), 'sans cloud_arret : le texte d’avant, mot pour mot');
    assert.ok(!bloc({ arretFilet: { ...ARRET, cause: 'autre' } }).includes('Le Cloud est complet'), 'une autre cause : le texte d’avant');
    assert.ok(!bloc({ cloud: { ...arrete, essaiArrete: false }, arretFilet: ARRET }).includes('Le Cloud est complet'), 'essai fini à sa date : jamais');
    const lu = texte(h(BR.BlocCloudReglagesLu, { c: { lang: 'fr' }, lecture: { etat: 'ok', cloud: arrete, profil: { cloud_canal: 'stripe', cloud_arret: ARRET }, luLe: Date.parse(LE) }, actions: {} }));
    assert.ok(lu.includes(FR), 'branché : lecture.profil.cloud_arret arrive au bloc');

    // Pack (BlocFormulesReglages, carte « Ta formule ») et compte Free : la même phrase ; sans cloud_arret, rien de neuf.
    const formule = (c, profilF, cloudArret) => texte(h(BFR.default, { c: { user: { id: 'u' }, lang: 'fr', plateforme: 'web', natif: false, ...c }, visible: true,
      lecture: { etat: 'ok', cloud: arrete, profil: { cloud_canal: 'stripe', ...(cloudArret ? { cloud_arret: cloudArret } : {}) } },
      profil: { etat: 'ok', canalAbonnement: 'stripe', founder: false, echeance: '2026-12-10T09:00:00Z', ...profilF }, actions: {} }));
    const pack = formule({ isPremium: true, isPro: true, isBusiness: false }, { formuleActuelle: 'pro_cloud' }, ARRET);
    assert.ok(/Pro \+ Cloud/.test(pack) && pack.includes(FR), 'pack Pro + Cloud arrêté par le filet : la phrase sous la formule');
    assert.ok(!formule({ isPremium: true, isPro: true, isBusiness: false }, { formuleActuelle: 'pro_cloud' }, null).includes('Le Cloud est complet'), 'pack sans cloud_arret : jamais');
    const free = formule({ isPremium: false, isPro: false, isBusiness: false }, { formuleActuelle: null, canalAbonnement: null }, ARRET);
    assert.ok(free.includes(FR), 'compte Free (Cloud seul arrêté, bloc Cloud caché par les formules) : la phrase sur sa carte');
    assert.ok(!formule({ isPremium: false, isPro: false, isBusiness: false }, { formuleActuelle: null, canalAbonnement: null }, null).includes('Le Cloud est complet'), 'Free sans cloud_arret : jamais');
  } finally { await vite.close(); }
});
