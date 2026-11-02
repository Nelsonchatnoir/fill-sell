// (02/11, demande de Nico) Les vérifications anti-robot du navigateur Cloud — « Résoudre la vérification ».
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { etatVisible, etatPublie, messageTacheCloud, pauseLbcLevee, creerVerifications, REVENUE_MS } from '../src/verifications.js';
import { pageDeResolution, navigationResolution, expressionAcces } from '../src/plateformes.js';
import { requetePermise } from '../src/navigateur.js';
import { decompteEssai } from '../src/endurance.js';

const U = 'f44b5917-bccc-4431-ba41-f40571a2ed18';

test('(02/11) deux états pour la personne, jamais confondus : à résoudre (bouton) / restreint (attente) ; et « revenue »', () => {
  for (const n of ['glissiere', 'verification', 'tache_refusee_anti_robot']) assert.equal(etatVisible(n), 'a_resoudre', n);
  for (const n of ['bloque', 'restreint']) assert.equal(etatVisible(n), 'restreint', n);
  assert.equal(etatVisible('verification_revenue'), 'revenue');
  assert.deepEqual(etatPublie({ nature: 'glissiere', le: 'L' }), { etat: 'a_resoudre', depuis: 'L' });
  assert.deepEqual(etatPublie({ nature: 'bloque', le: 'L', essai_apres: 'E' }), { etat: 'restreint', depuis: 'L', essai_apres: 'E' });
  assert.equal(etatPublie(null), null);
});

test('(02/11) le message des tâches retenues : jamais « ouvre … dans ton navigateur » ; le bon geste pour chaque état', () => {
  const a = messageTacheCloud('leboncoin', 'a_resoudre', '2026-11-02T03:57:37Z');
  const r = messageTacheCloud('leboncoin', 'restreint', '2026-11-02T03:57:37Z');
  const v = messageTacheCloud('beebs', 'revenue', null);
  for (const m of [a, r, v]) {
    assert.ok(!/dans ton navigateur|ouvre leboncoin\.fr|dans Chrome/i.test(m), m);
    assert.match(m, /les autres plateformes continuent/);
  }
  assert.match(a, /« Résoudre la vérification »/);
  assert.match(a, /depuis le 02\/11 à 04:57/, 'heure de Paris');
  assert.ok(!/Résoudre/.test(r) && /un seul essai au bout de 24 h/.test(r), 'restreint : aucun bouton promis, l\'attente dite');
  assert.match(v, /équipe FillSell est prévenue/);
  assert.deepEqual(pauseLbcLevee({ depuis: 'x', essai: { le: 'e' } }, { par: 'cloud (resoudre)', maintenant: 'M' }),
    { leve_le: 'M', leve_par: 'cloud (resoudre)', essai: { le: 'e', issue: 'passe', fin_le: 'M' } }, 'comme l\'essai réussi de l\'app (reprise prudente)');
});

test('(02/11) la page à rouvrir : celle où la vérification s\'est affichée (sans ancre de travail), sinon une page du compte', () => {
  assert.equal(pageDeResolution('beebs', { referer: 'https://www.beebs.app/#fillsell-worker' }), 'https://www.beebs.app/');
  assert.equal(pageDeResolution('leboncoin', { referer: 'https://api.leboncoin.fr/api/messaging-items-api/v3/conversations' }),
    'https://www.leboncoin.fr/compte/part/mes-annonces', 'une API : la page du compte, qui refait ses requêtes');
  assert.equal(pageDeResolution('leboncoin', { referer: 'https://evil.example/' }), 'https://www.leboncoin.fr/compte/part/mes-annonces');
  assert.equal(pageDeResolution('vinted', null), 'https://www.vinted.fr/');
  assert.ok(navigationResolution('leboncoin', 'https://www.leboncoin.fr/recherche'));
  assert.ok(navigationResolution('leboncoin', 'https://geo.captcha-delivery.com/captcha/?x=1'));
  assert.ok(!navigationResolution('leboncoin', 'https://www.google.com/'), 'hors de la plateforme : refusé');
  assert.ok(!navigationResolution('leboncoin', 'http://www.leboncoin.fr/'));
  assert.match(expressionAcces('beebs'), /method: 'HEAD'/, 'Beebs : la page elle-même (son compte se lit chez Google)');
  assert.match(expressionAcces('leboncoin'), /members\/me\/account/, 'Leboncoin : l\'adresse même que l\'anti-robot protège');
});

test('(02/11) le verrou : seule la page de résolution (et ses cadres) passe ; jamais vers eBay ; jamais un autre onglet', () => {
  const h = { cadresPermis: new Map([['page-1', 'leboncoin']]) };
  assert.equal(requetePermise(h, { frameId: 'page-1', request: { url: 'https://api.leboncoin.fr/api/x' } }), true);
  assert.equal(requetePermise(h, { frameId: 'onglet-travail', request: { url: 'https://api.leboncoin.fr/api/x' } }), false);
  assert.equal(requetePermise(h, { request: { url: 'https://api.leboncoin.fr/api/x' } }), false, 'le service worker de l\'extension : jamais');
  assert.equal(requetePermise(h, { frameId: 'page-1', request: { url: 'https://www.ebay.fr/' } }), false, 'eBay : jamais, même depuis la page');
  const sw = (url, Origin) => requetePermise(h, { request: { url, headers: Origin ? { Origin } : {} } });
  assert.equal(sw('https://api.leboncoin.fr/x', 'https://www.leboncoin.fr'), true, 'le service worker de la plateforme, pendant SA résolution');
  assert.equal(sw('https://api.leboncoin.fr/x', 'chrome-extension://abc'), false, 'l\'extension : jamais');
  assert.equal(sw('https://api.leboncoin.fr/x', null), false, 'sans origine : non');
  assert.equal(sw('https://www.beebs.app/x', 'https://www.beebs.app'), false, 'une autre plateforme, pas en résolution : non');
});

test('(02/11, décision de Nico) remise à zéro de Beebs SEULE : ses heures d\'avant 00:15 ne comptent plus ; Vinted ne bouge pas', () => {
  const m = (le) => ({ le, evenement: 'mesure', navigateursMo: { a: 1 }, connexions: { a: { vinted: true, beebs: true } } });
  const lignes = [
    { le: '2026-11-01T21:28:49Z', evenement: 'remise_a_zero', raison: 'r' },
    { le: '2026-11-01T21:54:11Z', evenement: 'connexion_verifiee', plateforme: 'beebs', verifiee_le: '2026-11-01T21:54:11Z' },
    { le: '2026-11-01T21:50:00Z', evenement: 'connexion_verifiee', plateforme: 'vinted', verifiee_le: '2026-11-01T21:50:00Z' },
    m('2026-11-01T22:00:00Z'), m('2026-11-01T22:10:00Z'), m('2026-11-01T23:10:00Z'), m('2026-11-01T23:20:00Z'), m('2026-11-01T23:30:00Z'),
    { le: '2026-11-02T09:50:00Z', evenement: 'remise_a_zero', plateforme: 'beebs', depuis: '2026-11-01T23:15:48Z', raison: 'Beebs injoignable 22:55 → 00:15' },
  ];
  const d = decompteEssai(lignes);
  assert.equal(d.remise.le, '2026-11-01T21:28:49Z', 'la remise d\'UNE plateforme ne remet pas tout l\'essai à zéro');
  assert.equal(d.plateformes.vinted.heures_comptees, 0.5, 'Vinted : ses trois tranches de 10 min');
  assert.equal(d.plateformes.beebs.heures_comptees, 0.2, 'Beebs : seulement après 00:15:48 (23:15:48 → 23:30)');
  assert.equal(d.plateformes.beebs.remise.depuis, '2026-11-01T23:15:48.000Z');
});

// ── Le module, avec une base et un navigateur simulés ───────────────────────────────────────────────────────────────
function monter({ profil = null, taches = [], lecture = { http: 200, id: 'compte' }, etatPage = { pret: true } } = {}) {
  const dossierEtat = mkdtempSync(path.join(tmpdir(), 'fs-verif-'));
  const rpc = [], maj = [], alertes = [], coffre = [], bloquees = [], permis = [];
  const jobs = taches.map((t) => ({ ...t }));
  const chaine = (table) => {
    const f = { filtres: {} };
    const q = {
      select() { return q; }, limit() { return q; },
      eq(c, v) { f.filtres[c] = v; return q; },
      update(o) { f.maj = o; return q; },
      maybeSingle: async () => ({ data: table === 'profiles' ? profil : null }),
      then(ok, ko) {
        if (f.maj) { maj.push([f.filtres.id, f.maj]); const j = jobs.find((x) => x.id === f.filtres.id); if (j) Object.assign(j, f.maj); return Promise.resolve({ error: null }).then(ok, ko); }
        const data = table === 'cross_post_jobs' ? jobs.filter((j) => j.platform === f.filtres.platform && j.status === f.filtres.status) : [];
        return Promise.resolve({ data, error: null }).then(ok, ko);
      },
    };
    return q;
  };
  const base = { from: chaine, rpc: async (nom, a) => { rpc.push([nom, a]); return { error: null }; } };
  const evaluer = (e) => (e.includes('captcha-delivery') ? etatPage : e.includes('location.hostname !==') ? lecture : null);
  const h = { permises: ['vinted', 'depop'], cdp: { send: async (m, p) => {
    if (m === 'Target.getTargets') return { targetInfos: [] };
    if (m === 'Target.createTarget') return { targetId: 'fond-1' };
    if (m === 'Target.attachToTarget') return { sessionId: 's-fond' };
    if (m === 'Runtime.evaluate') return { result: { value: evaluer(p.expression) } };
    if (m === 'Storage.getCookies') return { cookies: [{ name: '__Secure-Login', value: 'x', domain: '.leboncoin.fr' }] };
    return {};
  } } };
  const v = creerVerifications({
    config: { dossierEtat },
    base,
    navigateurs: { ouverts: () => [U], ouvert: () => h, permettre: async (u, l) => { permis.push(l); return { ok: true }; },
      permettreCadre: (u, c) => { permis.push(`cadre:${c}`); return true; }, retirerCadre: (u, c) => { permis.push(`retire:${c}`); } },
    postes: { bloquerPlateforme: async (u, p, c) => { bloquees.push([p, c.nature]); return { verrou: true }; } },
    coffre: { sauvegarderCookies: async (u, c, o) => { coffre.push(o.verifiees); return {}; } },
    connexionsOuvertes: () => new Set(),
    journal: { info() {}, alerte() {}, erreur() {} },
    alertes: { signaler: async (n, t) => { alertes.push(t); } },
  });
  return { v, rpc, maj, alertes, coffre, bloquees, permis, jobs };
}

test('(02/11) une glissière : la plateforme seule s\'arrête, l\'app le lit (« a_resoudre »), ses tâches portent la vraie cause', async () => {
  const t = monter({ taches: [{ id: 'j1', platform: 'leboncoin', status: 'pending', error: "Ouvre leboncoin.fr dans Chrome", platform_fields: {} }] });
  await t.v.charger();
  await t.v.bloquer(U, { source: 'navigateur', nature: 'glissiere', plateforme: 'leboncoin', referer: 'https://api.leboncoin.fr/x' });
  assert.deepEqual(t.bloquees, [['leboncoin', 'glissiere']]);
  const pub = t.rpc.find(([n, a]) => n === 'platform_settings_fusionner' && a.p_chemin.join('.') === 'leboncoin.cloud_verification');
  assert.equal(pub?.[1].p_patch.etat, 'a_resoudre', 'platform_settings.leboncoin.cloud_verification');
  assert.match(t.jobs[0].error, /« Résoudre la vérification »/);
  assert.ok(t.jobs[0].platform_fields.attente_verification_cloud, 'la tâche sait pourquoi elle attend');
  assert.equal(await t.v.bloquer(U, { nature: 'glissiere', plateforme: 'leboncoin' }), null, 'jamais deux fois');
});

test('(02/11) résolue : l\'état part, le message du Cloud part des tâches, la pause Leboncoin de l\'app est levée (reprise prudente)', async () => {
  const t = monter({ profil: { platform_settings: { leboncoin: { blocage_acces: { depuis: '2026-11-01T21:54:07Z' } } }, cloud_voie: true },
    taches: [{ id: 'j1', platform: 'leboncoin', status: 'pending', error: null, platform_fields: {} }] });
  await t.v.charger();
  await t.v.bloquer(U, { nature: 'glissiere', plateforme: 'leboncoin' });
  assert.equal(await t.v.resolue(U, 'leboncoin', { par: 'resoudre' }), true);
  assert.deepEqual(t.v.plateformesBloquees(U), []);
  assert.ok(t.rpc.some(([n, a]) => n === 'platform_settings_fusionner' && a.p_chemin.join('.') === 'leboncoin' && a.p_supprimer.includes('cloud_verification')), 'l\'état retiré');
  const leve = t.rpc.find(([n, a]) => n === 'platform_settings_fusionner' && a.p_chemin.join('.') === 'leboncoin.blocage_acces');
  assert.ok(leve?.[1].p_patch.leve_le && leve[1].p_patch.leve_par === 'cloud (resoudre)', 'pause de l\'app levée : la tâche retenue repart');
  assert.equal(t.jobs[0].error, null, 'le message du Cloud est parti');
  assert.ok(!t.jobs[0].platform_fields.attente_verification_cloud);
});

test('(02/11) revenue juste après la résolution : « verification_revenue », aucun bouton, l\'équipe prévenue — on ne boucle pas', async () => {
  const t = monter();
  await t.v.charger();
  await t.v.bloquer(U, { nature: 'glissiere', plateforme: 'beebs' });
  await t.v.resolue(U, 'beebs', { par: 'resoudre' });
  const b = await t.v.bloquer(U, { nature: 'glissiere', plateforme: 'beebs' });
  assert.equal(b.nature, 'verification_revenue');
  assert.equal(etatVisible(b.nature), 'revenue');
  assert.equal(t.alertes.length, 1, 'l\'équipe prévenue (alertes.js : support)');
  assert.ok(REVENUE_MS >= 30 * 60_000);
});

test('(02/11) Leboncoin en pause DANS L\'APP sur un compte Cloud → « restreint » côté Cloud (le bon message), son essai suit celui de l\'app', async () => {
  const t = monter({ profil: { cloud_voie: true, platform_settings: { leboncoin: { blocage_acces: { depuis: '2026-11-02T08:00:00Z', signe: 'http_403', essai_apres: '2099-01-01T00:00:00Z' } } } } });
  await t.v.charger();
  await t.v.releve();
  const b = t.v.blocageDe(U, 'leboncoin');
  assert.equal(b?.nature, 'restreint');
  assert.equal(b.essai_apres, '2099-01-01T00:00:00.000Z', 'le même rendez-vous que la pause de l\'app');
  const sans = monter({ profil: { cloud_voie: false, platform_settings: { leboncoin: { blocage_acces: { depuis: 'x' } } } } });
  await sans.v.charger();
  await sans.v.releve();
  assert.equal(sans.v.blocageDe(U, 'leboncoin'), null, 'un compte hors Cloud : rien ne change');
});

test('(02/11) l\'essai des 24 h d\'un accès restreint : une page de fond, UNE lecture ; passée → rouverte (coffre, verrou) ; glissière vue → « à résoudre »', async () => {
  const t = monter();
  await t.v.charger();
  await t.v.bloquer(U, { nature: 'bloque', plateforme: 'leboncoin', essai_apres: '2000-01-01T00:00:00Z' });
  await t.v.releve();
  assert.deepEqual(t.v.plateformesBloquees(U), [], 'accès rendu : rouverte');
  assert.deepEqual(t.coffre, [['leboncoin']], 'la ligne du coffre redevient connectée (vérifiée)');
  assert.ok(t.permis.includes('cadre:fond-1') && t.permis.includes('retire:fond-1'), 'seule la page de fond passe le verrou, le temps de l\'essai');
  assert.ok(t.permis.some((l) => Array.isArray(l) && l.includes('leboncoin')), 'puis le verrou la laisse passer');
  const g = monter({ etatPage: { pret: true, captcha: true } });
  await g.v.charger();
  await g.v.bloquer(U, { nature: 'bloque', plateforme: 'beebs', essai_apres: '2000-01-01T00:00:00Z' });
  await g.v.releve();
  assert.equal(g.v.blocageDe(U, 'beebs')?.nature, 'glissiere', 'une glissière s\'affiche : la personne peut maintenant la résoudre');
  assert.deepEqual(g.coffre, [], 'rien rouvert sans preuve');
});
